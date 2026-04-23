import { Client, GatewayIntentBits } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { renderInquiryMessage } from './renderInquiryMessage.js';

/** discord.js Client 중 review bot이 사용하는 최소 포트입니다. */
type DiscordClientLike = {
  login(token: string): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  channels: {
    fetch(id: string): Promise<{
      isTextBased(): boolean;
      send(payload: ReturnType<typeof renderInquiryMessage>): Promise<{ id: string }>;
    } | null>;
  };
};

/** Discord 채널에 AI 답변 초안 검토 메시지를 게시하는 어댑터입니다. */
export class DiscordReviewBot {
  readonly client: DiscordClientLike;

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    client?: DiscordClientLike,
  ) {
    this.client =
      client ??
      (new Client({
        intents: [GatewayIntentBits.Guilds],
      }) as unknown as DiscordClientLike);
  }

  /** Discord bot token으로 gateway session을 시작합니다. */
  async start(): Promise<void> {
    await this.client.login(this.token);
  }

  /** 문의와 초안을 Discord review channel에 게시하고 message id를 반환합니다. */
  async postReview(
    inquiry: Inquiry,
    draft: InquiryDraft,
  ): Promise<{ channelId: string; messageId: string }> {
    const channel = await this.client.channels.fetch(this.channelId);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${this.channelId} is not text based`);
    }

    const sent = await (channel as {
      send(payload: ReturnType<typeof renderInquiryMessage>): Promise<{ id: string }>;
    }).send(
      renderInquiryMessage({ inquiry, draft }),
    );

    return {
      channelId: this.channelId,
      messageId: sent.id,
    };
  }
}
