import { google } from 'googleapis';
import pino from 'pino';
import { MarkdownDirectoryContextProvider } from './ai/contextProvider.js';
import { GeminiDraftGenerator } from './ai/geminiDraftGenerator.js';
import { loadEnv } from './config/env.js';
import { DiscordReviewBot } from './discord/discordBot.js';
import { handleEditSubmit, handleReviewButton } from './discord/interactionHandlers.js';
import { GmailClient } from './email/gmailClient.js';
import { GoogleSheetsClient } from './sheets/googleSheetsClient.js';
import { createGoogleFormWebhookServer } from './webhook/googleFormWebhookServer.js';
import { InquiryLock } from './workflow/inquiryLock.js';
import { InquiryWorkflow } from './workflow/inquiryWorkflow.js';

/** pino와 테스트 logger가 공통으로 만족해야 하는 최소 로깅 계약입니다. */
type LoggerLike = {
  info(message: string): void;
  error(payload: unknown, message?: string): void;
};

/** Discord interaction 중 worker가 분기 처리에 사용하는 최소 형태입니다. */
type InteractionLike = {
  isButton(): boolean;
  isModalSubmit(): boolean;
  customId?: string;
};

/** ephemeral reply를 보낼 수 있는 Discord interaction의 최소 형태입니다. */
type RepliableInteraction = {
  reply(payload: { content: string; ephemeral: boolean }): Promise<void>;
};

/** 테스트 가능한 worker app을 만들기 위한 의존성 묶음입니다. */
type WorkerAppDeps = {
  bot: { start(): Promise<void>; client: { on(event: string, listener: (interaction: InteractionLike) => Promise<void>): unknown } };
  workflow: { pollOnce(): Promise<void> };
  webhookServer: { start(): Promise<void> };
  interactionHandler: (interaction: InteractionLike) => Promise<void>;
  enableFallbackPolling: boolean;
  intervalMs: number;
  logger: LoggerLike;
  setIntervalFn?: typeof setInterval;
};

/**
 * worker를 시작하고 최초 polling 및 주기 polling을 등록하는 작은 app 객체를 만듭니다.
 *
 * @param deps - 테스트 가능한 worker 의존성 묶음
 * @returns 시작 가능한 worker app
 */
export function createWorkerApp(deps: WorkerAppDeps) {
  const setIntervalFn = deps.setIntervalFn ?? setInterval;

  return {
    async start(): Promise<void> {
      deps.bot.client.on('interactionCreate', deps.interactionHandler);
      await deps.bot.start();
      await deps.webhookServer.start();

      if (deps.enableFallbackPolling) {
        await deps.workflow.pollOnce();
        setIntervalFn(() => {
          deps.workflow.pollOnce().catch((error) => {
            deps.logger.error({ error }, 'Polling failed');
          });
        }, deps.intervalMs);
      }

      deps.logger.info('Inquiry agent worker started');
    },
  };
}

/** Discord interaction에 CX팀에게만 보이는 오류/상태 메시지를 보냅니다. */
async function replyEphemeral(
  interaction: InteractionLike,
  content: string,
): Promise<void> {
  await (interaction as unknown as RepliableInteraction).reply({
    content,
    ephemeral: true,
  });
}

/**
 * 실제 환경변수와 외부 API client를 조립해 inquiry worker를 시작합니다.
 *
 * @param envInput - 기본값은 `process.env`; 테스트에서는 명시 값을 주입합니다.
 */
export async function startWorker(
  envInput: Record<string, string | undefined> = process.env,
): Promise<void> {
  const env = loadEnv(envInput);
  const logger = pino({ level: env.LOG_LEVEL }) as LoggerLike;

  const oauth = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  oauth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });

  const sheetsClient = GoogleSheetsClient.fromOAuth(oauth, env.GOOGLE_SHEET_ID, env.GOOGLE_SHEET_NAME);
  const gmailClient = GmailClient.fromOAuth(oauth, env.DRY_RUN_EMAIL);
  const contextProvider = new MarkdownDirectoryContextProvider();
  const draftGenerator = new GeminiDraftGenerator(
    env.GEMINI_API_KEY,
    env.GEMINI_MODEL,
    contextProvider,
  );
  const discordBot = new DiscordReviewBot(
    env.DISCORD_BOT_TOKEN,
    env.DISCORD_INQUIRY_CHANNEL_ID,
    undefined,
    env.DISCORD_REVIEW_POST_INTERVAL_MS,
  );
  const inquiryLock = new InquiryLock();
  const workflow = new InquiryWorkflow(sheetsClient, draftGenerator, discordBot);
  const webhookServer = createGoogleFormWebhookServer({
    expectedSecret: env.WEBHOOK_SECRET,
    expectedSheetName: env.GOOGLE_SHEET_NAME,
    expectedSpreadsheetId: env.GOOGLE_SHEET_ID,
    logger,
    port: env.WEBHOOK_PORT,
    workflow,
  });

  const interactionHandler = async (interaction: InteractionLike): Promise<void> => {
    try {
      if (interaction.isButton()) {
        await handleReviewButton(interaction as Parameters<typeof handleReviewButton>[0], {
          lock: inquiryLock,
          sheets: sheetsClient,
          gmail: gmailClient,
          fromEmail: env.GMAIL_FROM_EMAIL,
          fromName: env.GMAIL_FROM_NAME,
        });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId?.startsWith('editSubmit:')) {
        const edit = await handleEditSubmit(interaction as Parameters<typeof handleEditSubmit>[0]);
        const lock = await inquiryLock.tryAcquire(edit.inquiryId, edit.handledBy);

        if (!lock.acquired) {
          await replyEphemeral(interaction, `이미 <@${lock.holder}> 님이 처리 중입니다.`);
          return;
        }

        try {
          const review = await sheetsClient.findInquiryReview(edit.inquiryId);

          if (!review) {
            await replyEphemeral(interaction, '문의 정보를 찾을 수 없습니다.');
            return;
          }

          if (review.status === 'sent' || review.status === 'rejected') {
            await replyEphemeral(interaction, `이미 처리된 문의입니다. 현재 상태: ${review.status}`);
            return;
          }

          if (review.status === 'sending') {
            await replyEphemeral(interaction, '이미 처리 중인 문의입니다.');
            return;
          }

          await sheetsClient.updateManagedFields(review.rowNumber, {
            status: 'sending',
            handled_by: edit.handledBy,
            handled_at: new Date().toISOString(),
          });

          let sent: Awaited<ReturnType<GmailClient['sendEmail']>>;
          try {
            sent = await gmailClient.sendEmail({
              fromEmail: env.GMAIL_FROM_EMAIL,
              fromName: env.GMAIL_FROM_NAME,
              to: review.email,
              subject: edit.subject,
              body: edit.body,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await sheetsClient.updateManagedFields(review.rowNumber, {
              status: 'failed',
              error_message: message,
            });
            await replyEphemeral(interaction, '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.');
            return;
          }

          try {
            await sheetsClient.updateManagedFields(review.rowNumber, {
              status: 'sent',
              final_subject: edit.subject,
              final_body: edit.body,
              gmail_message_id: sent.messageId,
            });
          } catch {
            await replyEphemeral(
              interaction,
              '이메일은 발송됐지만 시트 상태 업데이트에 실패했습니다. 중복 발송을 막기 위해 상태를 확인해 주세요.',
            );
            return;
          }

          await replyEphemeral(interaction, '수정된 답변을 이메일로 발송했습니다.');
        } finally {
          inquiryLock.release(edit.inquiryId, edit.handledBy);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Discord interaction failed');
      if ('reply' in (interaction as object)) {
        await replyEphemeral(interaction, '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.');
      }
    }
  };

  const app = createWorkerApp({
    bot: discordBot as never,
    workflow,
    webhookServer,
    interactionHandler,
    enableFallbackPolling: env.ENABLE_FALLBACK_POLLING,
    intervalMs: env.POLL_INTERVAL_MS,
    logger,
  });

  await app.start();
}
