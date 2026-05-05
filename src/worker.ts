import { google } from 'googleapis';
import pino from 'pino';
import { MarkdownDirectoryContextProvider } from './ai/contextProvider.js';
import { GeminiDraftGenerator } from './ai/geminiDraftGenerator.js';
import { createInternalEvidenceProvider } from './ai/internalEvidence.js';
import type { EvidenceLogger, InternalEvidenceProvider } from './ai/internalEvidence.js';
import { KnowledgeCircuitService } from './ai/knowledgeCircuit.js';
import { SqliteKnowledgeCircuitStore } from './ai/knowledgeCircuitStore.js';
import { loadEnv } from './config/env.js';
import type { Env } from './config/env.js';
import { DiscordReviewBot } from './discord/discordBot.js';
import { handleEditSubmitSend, handleReviewButton } from './discord/interactionHandlers.js';
import { GmailClient } from './email/gmailClient.js';
import { GoogleSheetsClient } from './sheets/googleSheetsClient.js';
import { createGoogleFormWebhookServer } from './webhook/googleFormWebhookServer.js';
import { InquiryLock } from './workflow/inquiryLock.js';
import { InquiryWorkflow } from './workflow/inquiryWorkflow.js';

/** pino와 테스트 logger가 공통으로 만족해야 하는 최소 로깅 계약입니다. */
type LoggerLike = {
  debug(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
};

/** Discord interaction 중 워커가 분기 처리에 사용하는 최소 형태입니다. */
type InteractionLike = {
  isButton(): boolean;
  isModalSubmit(): boolean;
  customId?: string;
};

/** ephemeral reply를 보낼 수 있는 Discord interaction의 최소 형태입니다. */
type RepliableInteraction = {
  reply(payload: { content: string; ephemeral: boolean }): Promise<void>;
};

/** 테스트 가능한 워커 앱을 만들기 위한 의존성 묶음입니다. */
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

type InternalEvidenceEnv = Pick<
  Env,
  | 'ENABLE_INTERNAL_EVIDENCE_ROUTER'
  | 'ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH'
  | 'INTERNAL_EVIDENCE_GITHUB_TOKEN'
  | 'INTERNAL_EVIDENCE_GITHUB_API_BASE_URL'
  | 'INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS'
  | 'INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS'
  | 'ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH'
  | 'INTERNAL_EVIDENCE_NOTION_TOKEN'
  | 'INTERNAL_EVIDENCE_NOTION_API_BASE_URL'
  | 'INTERNAL_EVIDENCE_NOTION_VERSION'
  | 'INTERNAL_EVIDENCE_NOTION_PAGE_IDS'
  | 'ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK'
  | 'INTERNAL_EVIDENCE_EMBEDDING_MODEL'
  | 'INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES'
  | 'ENABLE_KNOWLEDGE_CIRCUIT'
  | 'KNOWLEDGE_CIRCUIT_DB_PATH'
  | 'KNOWLEDGE_CIRCUIT_MAX_HOPS'
  | 'KNOWLEDGE_CIRCUIT_MAX_NODES'
  | 'KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS'
  | 'KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS'
  | 'GEMINI_API_KEY'
>;

/**
 * 워커를 시작하고 최초 polling 및 주기 polling을 등록하는 작은 앱 객체를 만듭니다.
 *
 * @param deps - 테스트 가능한 워커 의존성 묶음
 * @returns 시작 가능한 워커 앱
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

/**
 * 환경변수 설정에 따라 내부 근거 제공자를 만들거나 비활성 상태를 유지합니다.
 *
 * @remarks
 * 기본값은 비활성입니다. 켜진 경우에도 개별 경로가 없으면 제공자가 `unavailable` 근거로 안전하게 실패합니다.
 */
export function createInternalEvidenceProviderFromEnv(
  env: InternalEvidenceEnv,
  knowledgeCircuit?: KnowledgeCircuitService,
  logger?: EvidenceLogger,
): InternalEvidenceProvider | undefined {
  if (!env.ENABLE_INTERNAL_EVIDENCE_ROUTER) {
    return undefined;
  }

  const resolvedKnowledgeCircuit = knowledgeCircuit ?? createKnowledgeCircuitFromEnv(env);

  const providerOptions = {
    github: {
      enabled: env.ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH,
      token: env.INTERNAL_EVIDENCE_GITHUB_TOKEN,
      apiBaseUrl: env.INTERNAL_EVIDENCE_GITHUB_API_BASE_URL,
      backendRepos: env.INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS,
      flutterRepos: env.INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS,
    },
    notion: {
      enabled: env.ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH,
      token: env.INTERNAL_EVIDENCE_NOTION_TOKEN,
      apiBaseUrl: env.INTERNAL_EVIDENCE_NOTION_API_BASE_URL,
      notionVersion: env.INTERNAL_EVIDENCE_NOTION_VERSION,
      pageIds: env.INTERNAL_EVIDENCE_NOTION_PAGE_IDS,
    },
    embedding: {
      enabled: env.ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK,
      apiKey: env.GEMINI_API_KEY,
      model: env.INTERNAL_EVIDENCE_EMBEDDING_MODEL,
      maxCandidates: env.INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES,
    },
    knowledgeCircuit: resolvedKnowledgeCircuit,
  };

  return createInternalEvidenceProvider(logger ? { ...providerOptions, logger } : providerOptions);
}

function createKnowledgeCircuitFromEnv(env: InternalEvidenceEnv): KnowledgeCircuitService | undefined {
  if (!env.ENABLE_KNOWLEDGE_CIRCUIT) {
    return undefined;
  }

  const store = new SqliteKnowledgeCircuitStore(env.KNOWLEDGE_CIRCUIT_DB_PATH);
  void store.cleanup({
    feedbackTtlDays: env.KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS,
    maxFeedbackRows: env.KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS,
  }).catch((error: unknown) => {
    console.warn('Knowledge circuit cleanup failed', error);
  });

  return new KnowledgeCircuitService(store, {
    maxHops: env.KNOWLEDGE_CIRCUIT_MAX_HOPS,
    maxNodes: env.KNOWLEDGE_CIRCUIT_MAX_NODES,
  });
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
 * 실제 환경변수와 외부 API 클라이언트를 조립해 문의 처리 워커를 시작합니다.
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
  const knowledgeCircuit = env.ENABLE_INTERNAL_EVIDENCE_ROUTER
    ? createKnowledgeCircuitFromEnv(env)
    : undefined;
  const internalEvidenceProvider = createInternalEvidenceProviderFromEnv(env, knowledgeCircuit, logger);
  const draftGeneratorOptions = internalEvidenceProvider ? { internalEvidenceProvider, logger } : {};
  const draftGenerator = new GeminiDraftGenerator(
    env.GEMINI_API_KEY,
    env.GEMINI_MODEL,
    contextProvider,
    undefined,
    draftGeneratorOptions,
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
        const feedbackRecorder = createKnowledgeCircuitFeedbackRecorder(knowledgeCircuit, interaction.customId);
        await handleReviewButton(interaction as Parameters<typeof handleReviewButton>[0], {
          lock: inquiryLock,
          sheets: sheetsClient,
          gmail: gmailClient,
          fromEmail: env.GMAIL_FROM_EMAIL,
          fromName: env.GMAIL_FROM_NAME,
          ...(feedbackRecorder ? { feedbackRecorder } : {}),
        });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId?.startsWith('editSubmit:')) {
        const feedbackRecorder = createKnowledgeCircuitFeedbackRecorder(knowledgeCircuit, interaction.customId);
        await handleEditSubmitSend(interaction as Parameters<typeof handleEditSubmitSend>[0], {
          lock: inquiryLock,
          sheets: sheetsClient,
          gmail: gmailClient,
          fromEmail: env.GMAIL_FROM_EMAIL,
          fromName: env.GMAIL_FROM_NAME,
          ...(feedbackRecorder ? { feedbackRecorder } : {}),
        });
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

function createKnowledgeCircuitFeedbackRecorder(
  knowledgeCircuit: KnowledgeCircuitService | undefined,
  interactionKey: string | undefined,
) {
  if (!knowledgeCircuit || !interactionKey) {
    return undefined;
  }

  const inquiryId = interactionKey.includes(':') ? interactionKey.split(':')[1] : interactionKey;
  if (!inquiryId) {
    return undefined;
  }

  return {
    async record(
      review: NonNullable<Awaited<ReturnType<GoogleSheetsClient['findInquiryReview']>>>,
      outcome: 'approved' | 'edited' | 'rejected',
    ): Promise<void> {
      const weights = { approved: 1, edited: 0.5, rejected: -1 } as const;

      await knowledgeCircuit.recordFeedbackForRefs({
        refs: review.evidenceFeedbackRefs,
        inquiryId,
        outcome,
        weightDelta: weights[outcome],
      });
    },
  };
}
