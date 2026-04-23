import { describe, expect, it, vi } from 'vitest';
import { DiscordReviewBot } from '../../src/discord/discordBot.js';
import { baseInquiry } from '../fixtures/inquiries.js';

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
    const draft = {
      inquiryId: baseInquiry.inquiryId,
      summary: '서비스 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
      risk: { level: 'low' as const, reasons: [] },
      missingInformation: [],
    };

    // Act
    const result = await target.postReview(baseInquiry, draft);

    // Assert
    expect(fetch).toHaveBeenCalledWith('channel_1');
    expect(send).toHaveBeenCalledOnce();
    expect(result).toEqual({ channelId: 'channel_1', messageId: 'discord_message_1' });
  });
});
