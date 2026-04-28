import { Client, GatewayIntentBits } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { renderInquiryMessage } from './renderInquiryMessage.js';

type DiscordReviewChannelLike = {
  isTextBased(): boolean;
  send(payload: ReturnType<typeof renderInquiryMessage>): Promise<{ id: string }>;
};

/** Minimal discord.js client surface used by the review bot. */
type DiscordClientLike = {
  login(token: string): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  channels: {
    fetch(id: string): Promise<DiscordReviewChannelLike | null>;
  };
};

/** Posts AI draft review cards to the configured Discord review channel. */
export class DiscordReviewBot {
  readonly client: DiscordClientLike;
  private reviewChannelPromise: Promise<DiscordReviewChannelLike> | null = null;
  private reviewSendQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly token: string,
    private readonly channelId: string,
    client?: DiscordClientLike,
    private readonly reviewPostIntervalMs = 0,
  ) {
    this.client =
      client ??
      (new Client({
        intents: [GatewayIntentBits.Guilds],
      }) as unknown as DiscordClientLike);
  }

  /** Starts the Discord gateway session with the bot token. */
  async start(): Promise<void> {
    await this.client.login(this.token);
  }

  /** Posts a review card and returns the Discord message location. */
  async postReview(
    inquiry: Inquiry,
    draft: InquiryDraft,
  ): Promise<{ channelId: string; messageId: string }> {
    return this.enqueueReviewSend(async () => {
      const channel = await this.getReviewChannel();
      const sent = await channel.send(
        renderInquiryMessage({ inquiry, draft }),
      );

      return {
        channelId: this.channelId,
        messageId: sent.id,
      };
    });
  }

  private async getReviewChannel(): Promise<DiscordReviewChannelLike> {
    if (!this.reviewChannelPromise) {
      this.reviewChannelPromise = this.fetchReviewChannel();
    }

    try {
      return await this.reviewChannelPromise;
    } catch (error) {
      this.reviewChannelPromise = null;
      throw error;
    }
  }

  private async fetchReviewChannel(): Promise<DiscordReviewChannelLike> {
    const channel = await this.client.channels.fetch(this.channelId);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Discord channel ${this.channelId} is not text based`);
    }

    return channel;
  }

  private enqueueReviewSend<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.reviewSendQueue.then(operation, operation);
    this.reviewSendQueue = queued.then(
      () => this.waitBeforeNextReviewPost(),
      () => this.waitBeforeNextReviewPost(),
    );

    return queued;
  }

  private async waitBeforeNextReviewPost(): Promise<void> {
    if (this.reviewPostIntervalMs <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, this.reviewPostIntervalMs);
    });
  }
}
