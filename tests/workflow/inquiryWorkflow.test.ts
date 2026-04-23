import { describe, expect, it, vi } from 'vitest';
import { InquiryWorkflow } from '../../src/workflow/inquiryWorkflow.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('InquiryWorkflow', () => {
  it('should draft new inquiries, post them to Discord, and record review metadata', async () => {
    // Arrange
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      listNewInquiries: vi.fn().mockResolvedValue([baseInquiry]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined)
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({
        inquiryId: baseInquiry.inquiryId,
        summary: '서비스 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'low', reasons: [] },
        missingInformation: []
      })
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' })
    };
    const target = new InquiryWorkflow(sheets, drafts, discord);

    // Act
    await target.pollOnce();

    // Assert
    expect(sheets.ensureManagedColumns).toHaveBeenCalledOnce();
    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, {
      inquiry_id: baseInquiry.inquiryId,
      status: 'drafting'
    });
    expect(drafts.generateDraft).toHaveBeenCalledWith(baseInquiry);
    expect(discord.postReview).toHaveBeenCalledWith(baseInquiry, expect.objectContaining({ subject: '문의 답변드립니다' }));
    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, {
      status: 'pending_review',
      risk_level: 'low',
      risk_reasons: '',
      draft_subject: '문의 답변드립니다',
      draft_body: '안녕하세요.',
      discord_channel_id: 'channel_1',
      discord_message_id: 'message_1'
    });
  });
});
