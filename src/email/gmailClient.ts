import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { createRawEmail, type RawEmailInput } from './mime.js';

/** googleapis Gmail client 중 이 worker가 사용하는 최소 send 포트입니다. */
type GmailLike = {
  users: {
    messages: {
      send(args: {
        userId: string;
        requestBody: { raw: string };
      }): Promise<{ data?: { id?: string } }>;
    };
  };
};

/** Gmail 발송 결과와 dry-run 여부를 Sheet audit field에 기록하기 위한 값입니다. */
export interface EmailSendResult {
  messageId: string;
  dryRun: boolean;
}

/**
 * Gmail API를 통해 승인된 답변 이메일을 발송하는 어댑터입니다.
 *
 * @remarks
 * `dryRun`이 켜져 있으면 실제 Gmail API 호출을 하지 않고 synthetic message id만 반환합니다.
 *
 * @public
 */
export class GmailClient {
  constructor(
    private readonly gmail: GmailLike,
    private readonly dryRun: boolean,
  ) {}

  /**
   * OAuth client로 실제 Gmail API 어댑터를 생성합니다.
   *
   * @param auth - Gmail send scope가 있는 OAuth client
   * @param dryRun - 실제 발송을 막을지 여부
   * @returns Gmail 발송 adapter
   */
  static fromOAuth(auth: OAuth2Client, dryRun: boolean): GmailClient {
    return new GmailClient(
      google.gmail({ version: 'v1', auth }) as gmail_v1.Gmail as unknown as GmailLike,
      dryRun,
    );
  }

  /**
   * dry-run이면 실제 발송 없이 synthetic id를 반환하고, 아니면 Gmail raw MIME을 전송합니다.
   *
   * @param input - 발신자, 수신자, 제목, 본문
   * @returns Gmail message id 또는 dry-run synthetic id
   */
  async sendEmail(input: RawEmailInput): Promise<EmailSendResult> {
    if (this.dryRun) {
      return {
        messageId: `dry_${Date.now()}`,
        dryRun: true,
      };
    }

    const raw = createRawEmail(input);
    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return {
      messageId: response.data?.id ?? 'unknown',
      dryRun: false,
    };
  }
}
