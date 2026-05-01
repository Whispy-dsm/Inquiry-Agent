import { describe, expect, it, vi } from 'vitest';
import { handleEditSubmit, handleEditSubmitSend, handleReviewButton } from '../../src/discord/interactionHandlers.js';

describe('handleReviewButton', () => {
  it('should open an edit modal with draft subject and body prefilled', async () => {
    // Arrange
    const showModal = vi.fn();
    const interaction = {
      customId: 'edit:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
      showModal,
    };
    const deps = {
      lock: {
        tryAcquire: vi.fn(),
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
        updateManagedFields: vi.fn(),
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
    expect(showModal).toHaveBeenCalledOnce();
    const modal = showModal.mock.calls[0]?.[0];
    const json = modal.toJSON();
    expect(json.custom_id).toBe('editSubmit:inq_1');
    expect(json.components[0]?.components[0]?.value).toBe('문의 답변드립니다');
    expect(json.components[1]?.components[0]?.value).toBe('안녕하세요.');
  });

  it('should reject an inquiry and update the sheet without sending email', async () => {
    // Arrange
    const interaction = {
      customId: 'reject:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
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
    expect(interaction.editReply).toHaveBeenCalledWith({
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
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
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
    expect(interaction.deferUpdate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      deps.sheets.findInquiryReview.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
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
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sent by <@discord_user_1>'),
      components: [],
    });
  });

  it('should mark the inquiry as failed when email sending throws', async () => {
    // Arrange
    const interaction = {
      customId: 'approve:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
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
        sendEmail: vi.fn().mockRejectedValue(new Error('gmail failed')),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
    };

    // Act
    await handleReviewButton(interaction as never, deps as never);

    // Assert
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(1, 2, {
      status: 'sending',
      handled_by: 'discord_user_1',
      handled_at: expect.any(String),
    });
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(2, 2, {
      status: 'failed',
      error_message: 'gmail failed',
    });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.',
      ephemeral: true,
    });
  });

  it('should not send email when the inquiry is already sending', async () => {
    // Arrange
    const interaction = {
      customId: 'approve:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
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
          status: 'sending',
        }),
        updateManagedFields: vi.fn(),
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
    expect(deps.gmail.sendEmail).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '이미 처리 중인 문의입니다.',
      ephemeral: true,
    });
  });

  it('should not mark failed when email succeeds but sheet sent update fails', async () => {
    // Arrange
    const interaction = {
      customId: 'approve:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
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
        updateManagedFields: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('sheet failed')),
      },
      gmail: {
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'gmail_123', dryRun: false }),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
    };

    // Act
    await handleReviewButton(interaction as never, deps as never);

    // Assert
    expect(deps.gmail.sendEmail).toHaveBeenCalledOnce();
    expect(deps.sheets.updateManagedFields).not.toHaveBeenCalledWith(2, {
      status: 'failed',
      error_message: 'sheet failed',
    });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '이메일은 발송됐지만 시트 상태 업데이트에 실패했습니다. 중복 발송을 막기 위해 상태를 확인해 주세요.',
      ephemeral: true,
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

  it('should record knowledge circuit feedback after approval', async () => {
    // Arrange
    const feedbackRecorder = { record: vi.fn().mockResolvedValue(undefined) };
    const review = {
      rowNumber: 2,
      email: 'user@example.com',
      draftSubject: 'subject',
      draftBody: 'body',
      evidenceFeedbackRefs: [{
        nodeId: 'node_1',
        sourceType: 'backend',
        sourceRef: 'auth/session.ts',
        contentHash: 'hash',
      }],
      status: 'pending_review',
    };
    const interaction = {
      customId: 'approve:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      reply: vi.fn(),
      update: vi.fn(),
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp: vi.fn(),
      showModal: vi.fn(),
    };
    const deps = {
      lock: {
        tryAcquire: vi.fn().mockResolvedValue({ acquired: true, holder: 'discord_user_1' }),
        release: vi.fn(),
      },
      sheets: {
        findInquiryReview: vi.fn().mockResolvedValue(review),
        updateManagedFields: vi.fn().mockResolvedValue(undefined),
      },
      gmail: {
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'gmail_123', dryRun: true }),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      feedbackRecorder,
    };

    // Act
    await handleReviewButton(interaction as never, deps as never);

    // Assert
    expect(feedbackRecorder.record).toHaveBeenCalledWith(review, 'approved');
  });
});

describe('handleEditSubmitSend', () => {
  it('should send the edited email, persist final fields, and remove review buttons', async () => {
    // Arrange
    const interaction = {
      customId: 'editSubmit:inq_1',
      user: { id: 'discord_user_1' },
      message: { content: 'review message' },
      fields: {
        getTextInputValue: vi
          .fn()
          .mockImplementation((field: string) => (field === 'subject' ? '수정 제목' : '수정 본문')),
      },
      isFromMessage: vi.fn().mockReturnValue(true),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn(),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn(),
      reply: vi.fn(),
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
        sendEmail: vi.fn().mockResolvedValue({ messageId: 'gmail_123', dryRun: false }),
      },
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
    };

    // Act
    await handleEditSubmitSend(interaction as never, deps as never);

    // Assert
    expect(interaction.deferUpdate).toHaveBeenCalledOnce();
    expect(deps.gmail.sendEmail).toHaveBeenCalledWith({
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '수정 제목',
      body: '수정 본문',
    });
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(1, 2, {
      status: 'sending',
      handled_by: 'discord_user_1',
      handled_at: expect.any(String),
    });
    expect(deps.sheets.updateManagedFields).toHaveBeenNthCalledWith(2, 2, {
      status: 'sent',
      final_subject: '수정 제목',
      final_body: '수정 본문',
      gmail_message_id: 'gmail_123',
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Sent after edit by <@discord_user_1>'),
      components: [],
    });
  });
});
