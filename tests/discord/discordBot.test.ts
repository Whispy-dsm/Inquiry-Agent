import { describe, expect, it, vi } from 'vitest';
import { DiscordReviewBot } from '../../src/discord/discordBot.js';
import { baseInquiry } from '../fixtures/inquiries.js';

function createDraft(inquiryId = baseInquiry.inquiryId) {
  return {
    inquiryId,
    summary: 'Service inquiry',
    subject: 'Inquiry reply',
    body: 'Hello.',
    risk: { level: 'low' as const, reasons: [] },
    missingInformation: [],
  };
}

describe('DiscordReviewBot', () => {
  it('should render and send a review message to the configured channel', async () => {
    // Arrange
    const send = vi.fn().mockResolvedValue({ id: 'discord_message_1' });
    const fetch = vi.fn().mockResolvedValue({
      isTextBased: () => true,
      send,
    });
    const client = {
      login: vi.fn().mockResolvedValue(undefined),
      channels: {
        fetch,
      },
    };
    const target = new DiscordReviewBot('token', 'channel_1', client as never);

    // Act
    const result = await target.postReview(baseInquiry, createDraft());

    // Assert
    expect(fetch).toHaveBeenCalledWith('channel_1');
    expect(send).toHaveBeenCalledOnce();
    expect(result).toEqual({ channelId: 'channel_1', messageId: 'discord_message_1' });
  });

  it('should reuse the configured channel after the first successful fetch', async () => {
    // Arrange
    const send = vi.fn()
      .mockResolvedValueOnce({ id: 'discord_message_1' })
      .mockResolvedValueOnce({ id: 'discord_message_2' });
    const fetch = vi.fn().mockResolvedValue({
      isTextBased: () => true,
      send,
    });
    const client = {
      login: vi.fn().mockResolvedValue(undefined),
      channels: {
        fetch,
      },
    };
    const target = new DiscordReviewBot('token', 'channel_1', client as never);

    // Act
    await target.postReview(baseInquiry, createDraft());
    await target.postReview(
      { ...baseInquiry, inquiryId: 'inquiry_2', rowNumber: baseInquiry.rowNumber + 1 },
      createDraft('inquiry_2'),
    );

    // Assert
    expect(fetch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('should serialize concurrent review message sends', async () => {
    // Arrange
    let resolveFirstSend: (value: { id: string }) => void = () => undefined;
    const firstSend = new Promise<{ id: string }>((resolve) => {
      resolveFirstSend = resolve;
    });
    const send = vi.fn()
      .mockReturnValueOnce(firstSend)
      .mockResolvedValueOnce({ id: 'discord_message_2' });
    const fetch = vi.fn().mockResolvedValue({
      isTextBased: () => true,
      send,
    });
    const client = {
      login: vi.fn().mockResolvedValue(undefined),
      channels: {
        fetch,
      },
    };
    const target = new DiscordReviewBot('token', 'channel_1', client as never);

    // Act
    const firstPost = target.postReview(baseInquiry, createDraft());
    const secondPost = target.postReview(
      { ...baseInquiry, inquiryId: 'inquiry_2', rowNumber: baseInquiry.rowNumber + 1 },
      createDraft('inquiry_2'),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // Assert
    expect(send).toHaveBeenCalledOnce();

    resolveFirstSend({ id: 'discord_message_1' });
    await expect(Promise.all([firstPost, secondPost])).resolves.toEqual([
      { channelId: 'channel_1', messageId: 'discord_message_1' },
      { channelId: 'channel_1', messageId: 'discord_message_2' },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('should wait the configured interval before the next review message send', async () => {
    // Arrange
    vi.useFakeTimers();
    const send = vi.fn()
      .mockResolvedValueOnce({ id: 'discord_message_1' })
      .mockResolvedValueOnce({ id: 'discord_message_2' });
    const fetch = vi.fn().mockResolvedValue({
      isTextBased: () => true,
      send,
    });
    const client = {
      login: vi.fn().mockResolvedValue(undefined),
      channels: {
        fetch,
      },
    };
    const target = new DiscordReviewBot('token', 'channel_1', client as never, 1000);

    try {
      // Act
      await expect(target.postReview(baseInquiry, createDraft())).resolves.toEqual({
        channelId: 'channel_1',
        messageId: 'discord_message_1',
      });
      const secondPost = target.postReview(
        { ...baseInquiry, inquiryId: 'inquiry_2', rowNumber: baseInquiry.rowNumber + 1 },
        createDraft('inquiry_2'),
      );
      await Promise.resolve();

      // Assert
      expect(send).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(999);
      expect(send).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      await expect(secondPost).resolves.toEqual({
        channelId: 'channel_1',
        messageId: 'discord_message_2',
      });
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
