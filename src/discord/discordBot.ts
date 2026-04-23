import { Client, GatewayIntentBits } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { renderInquiryMessage } from './renderInquiryMessage.js';

type DiscordClientLike = {
  login(token: string): Promise<unknown>;
  channels: {
    fetch(id: string): Promise<{
      isTextBased(): boolean;
      send(payload: ReturnType<typeof renderInquiryMessage>): Promise<{ id: string }>;
    } | null>;
  };
};

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

  async start(): Promise<void> {
    await this.client.login(this.token);
  }

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
