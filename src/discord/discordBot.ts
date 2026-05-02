import { Client, GatewayIntentBits } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { renderInquiryMessage } from './renderInquiryMessage.js';

type DiscordReviewChannelLike = {
  isTextBased(): boolean;
  send(payload: ReturnType<typeof renderInquiryMessage>): Promise<{ id: string }>;
};

/** 검토 봇이 사용하는 discord.js 클라이언트 기능만 좁혀 둔 테스트용 포트입니다. */
type DiscordClientLike = {
  login(token: string): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => unknown): unknown;
  channels: {
    fetch(id: string): Promise<DiscordReviewChannelLike | null>;
  };
};

/**
 * AI 초안 검토 카드를 설정된 Discord 검토 채널에 게시합니다.
 *
 * @remarks
 * 채널 조회 결과를 캐시하고, 선택적으로 전송 간격을 둬 Discord 호출 제한에 부딪힐 가능성을 줄입니다.
 */
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

  /** 설정된 봇 토큰으로 Discord 게이트웨이 세션을 시작합니다. */
  async start(): Promise<void> {
    await this.client.login(this.token);
  }

  /**
   * 문의와 AI 초안을 검토 카드로 게시하고 Discord 메시지 위치를 반환합니다.
   *
   * @remarks
   * 같은 워커에서 여러 검토 카드가 동시에 생성되어도 `reviewPostIntervalMs` 간격을 지키도록
   * 내부 큐를 통해 순차 전송합니다.
   */
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
