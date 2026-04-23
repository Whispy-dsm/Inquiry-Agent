import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { createRawEmail, type RawEmailInput } from './mime.js';

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

export interface EmailSendResult {
  messageId: string;
  dryRun: boolean;
}

export class GmailClient {
  constructor(
    private readonly gmail: GmailLike,
    private readonly dryRun: boolean,
  ) {}

  static fromOAuth(auth: OAuth2Client, dryRun: boolean): GmailClient {
    return new GmailClient(
      google.gmail({ version: 'v1', auth }) as gmail_v1.Gmail as unknown as GmailLike,
      dryRun,
    );
  }

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
