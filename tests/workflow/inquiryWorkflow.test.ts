import { describe, expect, it, vi } from 'vitest';
import { baseInquiry } from '../fixtures/inquiries.js';
import { InquiryWorkflow } from '../../src/workflow/inquiryWorkflow.js';
import { WorkItemLock } from '../../src/workflow/workItemLock.js';

describe('InquiryWorkflow', () => {
  it('should draft new inquiries, post them to Discord, and record review metadata', async () => {
    // Arrange
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      findInquiryByRow: vi.fn().mockResolvedValue(baseInquiry),
      listNewInquiries: vi.fn().mockResolvedValue([baseInquiry]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined),
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({
        inquiryId: baseInquiry.inquiryId,
        summary: '서비스 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'low', reasons: ['faq', 'policy'] },
        missingInformation: [],
      }),
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' }),
    };
    const target = new InquiryWorkflow(sheets, drafts, discord);

    // Act
    await target.pollOnce();

    // Assert
    expect(sheets.ensureManagedColumns).toHaveBeenCalledOnce();
    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, {
      error_message: '',
      inquiry_id: baseInquiry.inquiryId,
      status: 'drafting',
    });
    expect(drafts.generateDraft).toHaveBeenCalledWith(baseInquiry);
    expect(discord.postReview).toHaveBeenCalledWith(
      baseInquiry,
      expect.objectContaining({ subject: '문의 답변드립니다' }),
    );
    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, {
      status: 'pending_review',
      risk_level: 'low',
      risk_reasons: 'faq | policy',
      draft_subject: '문의 답변드립니다',
      draft_body: '안녕하세요.',
      discord_channel_id: 'channel_1',
      discord_message_id: 'message_1',
      error_message: '',
    });
  });

  it('should process one submitted row when the webhook provides a row number', async () => {
    // Arrange
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      findInquiryByRow: vi.fn().mockResolvedValue(baseInquiry),
      listNewInquiries: vi.fn().mockResolvedValue([]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined),
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({
        inquiryId: baseInquiry.inquiryId,
        summary: '서비스 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'low', reasons: [] },
        missingInformation: [],
      }),
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' }),
    };
    const target = new InquiryWorkflow(sheets, drafts, discord);

    // Act
    const result = await target.processSubmittedRow(baseInquiry.rowNumber);

    // Assert
    expect(result).toBe(true);
    expect(sheets.ensureManagedColumns).toHaveBeenCalledOnce();
    expect(sheets.findInquiryByRow).toHaveBeenCalledWith(baseInquiry.rowNumber);
    expect(drafts.generateDraft).toHaveBeenCalledWith(baseInquiry);
  });

  it('should ignore a submitted row when it is already handled', async () => {
    // Arrange
    const handledInquiry = { ...baseInquiry, status: 'sent' as const };
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      findInquiryByRow: vi.fn().mockResolvedValue(handledInquiry),
      listNewInquiries: vi.fn().mockResolvedValue([]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined),
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({}),
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({}),
    };
    const target = new InquiryWorkflow(sheets, drafts as never, discord as never);

    // Act
    const result = await target.processSubmittedRow(baseInquiry.rowNumber);

    // Assert
    expect(result).toBe(false);
    expect(drafts.generateDraft).not.toHaveBeenCalled();
    expect(discord.postReview).not.toHaveBeenCalled();
  });

  it('should mark a submitted row as failed and rethrow when draft generation fails', async () => {
    // Arrange
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      findInquiryByRow: vi.fn().mockResolvedValue(baseInquiry),
      listNewInquiries: vi.fn().mockResolvedValue([]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined),
    };
    const drafts = {
      generateDraft: vi.fn().mockRejectedValue(new Error('draft failed')),
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' }),
    };
    const target = new InquiryWorkflow(sheets, drafts as never, discord as never);

    // Act & Assert
    await expect(target.processSubmittedRow(baseInquiry.rowNumber)).rejects.toThrow('draft failed');
    expect(sheets.updateManagedFields).toHaveBeenNthCalledWith(1, baseInquiry.rowNumber, {
      error_message: '',
      inquiry_id: baseInquiry.inquiryId,
      status: 'drafting',
    });
    expect(sheets.updateManagedFields).toHaveBeenNthCalledWith(2, baseInquiry.rowNumber, {
      error_message: 'draft failed',
      status: 'failed',
    });
  });

  it('should skip duplicate processing when the row is already locked', async () => {
    // Arrange
    const sheets = {
      ensureManagedColumns: vi.fn().mockResolvedValue(undefined),
      findInquiryByRow: vi.fn().mockResolvedValue(baseInquiry),
      listNewInquiries: vi.fn().mockResolvedValue([baseInquiry]),
      updateManagedFields: vi.fn().mockResolvedValue(undefined),
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({
        inquiryId: baseInquiry.inquiryId,
        summary: '서비스 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'low', reasons: [] },
        missingInformation: [],
      }),
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' }),
    };
    const lock = new WorkItemLock();
    await lock.tryAcquire(`row:${baseInquiry.rowNumber}`, 'test');
    const target = new InquiryWorkflow(sheets, drafts, discord, lock);

    // Act
    const result = await target.processSubmittedRow(baseInquiry.rowNumber);

    // Assert
    expect(result).toBe(true);
    expect(drafts.generateDraft).not.toHaveBeenCalled();
  });
});
