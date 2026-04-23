import { describe, expect, it, vi } from 'vitest';
import { handleEditSubmit, handleReviewButton } from '../../src/discord/interactionHandlers.js';

describe('handleReviewButton', () => {
  it('should reject an inquiry and update the sheet without sending email', async () => {
    // Arrange
    const interaction = {
      customId: 'reject:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      showModal: vi.fn(),
    };
    const deps = {
      lock: {
        tryAcquire: vi.fn().mockResolvedValue({ acquired: true, holder: 'discord_user_1' }),
        release: vi.fn(),
      },
      sheets: {
        findInquiryReview: vi.fn().mockResolvedValue({
          rowNumber: 2,
          email: 'user@example.com',
          draftSubject: '문의 답변드립니다',
          draftBody: '안녕하세요.',
          status: 'pending_review',
        }),
        updateManagedFields: vi.fn().mockResolvedValue(undefined),
      },
      gmail: {
        sendEmail: vi.fn(),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
    };

    // Act
    await handleReviewButton(interaction as never, deps as never);

    // Assert
    expect(deps.sheets.updateManagedFields).toHaveBeenCalledWith(2, {
      status: 'rejected',
      handled_by: 'discord_user_1',
      handled_at: expect.any(String),
    });
    expect(deps.gmail.sendEmail).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({
      content: expect.stringContaining('Rejected by <@discord_user_1>'),
      components: [],
    });
  });

  it('should approve an inquiry, send email, and persist final fields', async () => {
    // Arrange
    const interaction = {
      customId: 'approve:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      showModal: vi.fn(),
    };
    const deps = {
      lock: {
        tryAcquire: vi.fn().mockResolvedValue({ acquired: true, holder: 'discord_user_1' }),
        release: vi.fn(),
      },
      sheets: {
        findInquiryReview: vi.fn().mockResolvedValue({
          rowNumber: 2,
          email: 'user@example.com',
          draftSubject: '문의 답변드립니다',
          draftBody: '안녕하세요.',
          status: 'pending_review',
        }),
        updateManagedFields: vi.fn().mockResolvedValue(undefined),
      },
      gmail: {
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'gmail_123', dryRun: true }),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
    };

    // Act
    await handleReviewButton(interaction as never, deps as never);

    // Assert
    expect(deps.gmail.sendEmail).toHaveBeenCalledWith({
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
    });
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(1, 2, {
      status: 'sending',
      handled_by: 'discord_user_1',
      handled_at: expect.any(String),
    });
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(2, 2, {
      status: 'sent',
      final_subject: '문의 답변드립니다',
      final_body: '안녕하세요.',
      gmail_message_id: 'gmail_123',
    });
    expect(interaction.update).toHaveBeenCalledWith({
      content: expect.stringContaining('Sent by <@discord_user_1>'),
      components: [],
    });
  });
});

describe('handleEditSubmit', () => {
  it('should extract modal fields into an edit payload', async () => {
    // Arrange
    const interaction = {
      customId: 'editSubmit:inq_1',
      user: { id: 'discord_user_1' },
      fields: {
        getTextInputValue: vi
          .fn()
          .mockImplementation((field: string) => (field === 'subject' ? '수정 제목' : '수정 본문')),
      },
    };

    // Act
    const result = await handleEditSubmit(interaction as never);

    // Assert
    expect(result).toEqual({
      inquiryId: 'inq_1',
      subject: '수정 제목',
      body: '수정 본문',
      handledBy: 'discord_user_1',
    });
  });
});
