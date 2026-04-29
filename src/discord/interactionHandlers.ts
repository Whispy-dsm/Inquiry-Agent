import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { GmailClient } from '../email/gmailClient.js';
import type { GoogleSheetsClient } from '../sheets/googleSheetsClient.js';
import type { InquiryLock } from '../workflow/inquiryLock.js';

/** Discord button/modal handler가 외부 시스템에 접근하기 위해 필요한 의존성입니다. */
export interface InteractionHandlerDeps {
  lock: InquiryLock;
  sheets: GoogleSheetsClient;
  gmail: GmailClient;
  fromEmail: string;
  fromName: string;
}

/**
 * Discord Approve/Edit/Reject 버튼 클릭을 처리합니다.
 *
 * @remarks
 * `approve`는 Gmail 발송 전에 `sending` 상태를 먼저 기록하고, `sending/sent/rejected` 상태는
 * 재발송을 막습니다. Gmail 발송 성공 후 Sheet 업데이트가 실패하면 이미 이메일이 나갔을 수 있으므로
 * `failed`로 덮어쓰지 않습니다.
 *
 * @param interaction - Discord button interaction
 * @param deps - Sheets, Gmail, lock 등 외부 의존성
 */
export async function handleReviewButton(
  interaction: ButtonInteraction,
  deps: InteractionHandlerDeps,
): Promise<void> {
  const [action, inquiryId] = interaction.customId.split(':');

  if (!action || !inquiryId) {
    await interaction.reply({ content: '잘못된 액션입니다.', ephemeral: true });
    return;
  }

  if (action === 'edit') {
    const review = await deps.sheets.findInquiryReview(inquiryId);
    const modal = new ModalBuilder()
      .setCustomId(`editSubmit:${inquiryId}`)
      .setTitle('답변 수정 후 발송')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('이메일 제목')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(review?.draftSubject.slice(0, 100) ?? ''),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('body')
            .setLabel('이메일 본문')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue(review?.draftBody.slice(0, 3900) ?? ''),
        ),
      );

    await interaction.showModal(modal);
    return;
  }

  const holder = interaction.user.id;
  const lockResult = await deps.lock.tryAcquire(inquiryId, holder);

  if (!lockResult.acquired) {
    await interaction.reply({
      content: `이미 <@${lockResult.holder}> 님이 처리 중입니다.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.deferUpdate();

    const review = await deps.sheets.findInquiryReview(inquiryId);

    if (!review) {
      await interaction.followUp({ content: '문의 정보를 찾을 수 없습니다.', ephemeral: true });
      return;
    }

    if (review.status === 'sent' || review.status === 'rejected') {
      await interaction.followUp({
        content: `이미 처리된 문의입니다. 현재 상태: ${review.status}`,
        ephemeral: true,
      });
      return;
    }

    if (review.status === 'sending') {
      await interaction.followUp({
        content: '이미 처리 중인 문의입니다.',
        ephemeral: true,
      });
      return;
    }

    if (action === 'reject') {
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'rejected',
        handled_by: holder,
        handled_at: new Date().toISOString(),
      });

      await interaction.editReply({
        content: `${interaction.message.content}\n\n처리 결과: Rejected by <@${holder}>`,
        components: [],
      });
      return;
    }

    if (action === 'approve') {
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'sending',
        handled_by: holder,
        handled_at: new Date().toISOString(),
      });

      let sent: Awaited<ReturnType<GmailClient['sendEmail']>>;
      // Gmail 발송 실패는 아직 메일이 나가지 않은 상태라 retry 가능한 failed 상태로 기록합니다.
      try {
        sent = await deps.gmail.sendEmail({
          fromEmail: deps.fromEmail,
          fromName: deps.fromName,
          to: review.email,
          subject: review.draftSubject,
          body: review.draftBody,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await deps.sheets.updateManagedFields(review.rowNumber, {
          status: 'failed',
          error_message: message,
        });
        await interaction.followUp({
          content: '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.',
          ephemeral: true,
        });
        return;
      }

      // 여기부터는 메일이 이미 나갔을 수 있으므로 Sheet 실패를 failed로 덮어쓰지 않습니다.
      try {
        await deps.sheets.updateManagedFields(review.rowNumber, {
          status: 'sent',
          final_subject: review.draftSubject,
          final_body: review.draftBody,
          gmail_message_id: sent.messageId,
        });
      } catch {
        await interaction.followUp({
          content: '이메일은 발송됐지만 시트 상태 업데이트에 실패했습니다. 중복 발송을 막기 위해 상태를 확인해 주세요.',
          ephemeral: true,
        });
        return;
      }

      await interaction.editReply({
        content: `${interaction.message.content}\n\n처리 결과: Sent by <@${holder}>`,
        components: [],
      });
      return;
    }

    await interaction.followUp({ content: '지원하지 않는 액션입니다.', ephemeral: true });
  } finally {
    deps.lock.release(inquiryId, holder);
  }
}

/**
 * Discord modal 제출 값을 실제 발송에 사용할 수정된 이메일 payload로 변환합니다.
 *
 * @param interaction - `editSubmit:{inquiryId}` custom id를 가진 modal submit interaction
 * @returns 수정된 제목/본문과 처리자 id
 */
export async function handleEditSubmit(
  interaction: ModalSubmitInteraction,
): Promise<{ inquiryId: string; subject: string; body: string; handledBy: string }> {
  const [, inquiryId] = interaction.customId.split(':');

  if (!inquiryId) {
    throw new Error('Missing inquiry id in modal submit');
  }

  return {
    inquiryId,
    subject: interaction.fields.getTextInputValue('subject'),
    body: interaction.fields.getTextInputValue('body'),
    handledBy: interaction.user.id,
  };
}

/**
 * Discord edit modal 제출 후 수정된 이메일을 발송하고 원본 review card를 완료 상태로 갱신합니다.
 *
 * @param interaction - `editSubmit:{inquiryId}` modal submit interaction
 * @param deps - Sheets, Gmail, lock 등 외부 의존성
 */
export async function handleEditSubmitSend(
  interaction: ModalSubmitInteraction,
  deps: InteractionHandlerDeps,
): Promise<void> {
  const edit = await handleEditSubmit(interaction);
  const lockResult = await deps.lock.tryAcquire(edit.inquiryId, edit.handledBy);

  if (!lockResult.acquired) {
    await interaction.reply({
      content: `이미 <@${lockResult.holder}> 님이 처리 중입니다.`,
      ephemeral: true,
    });
    return;
  }

  const shouldUpdateReviewMessage = interaction.isFromMessage();

  try {
    if (shouldUpdateReviewMessage) {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ ephemeral: true });
    }

    const review = await deps.sheets.findInquiryReview(edit.inquiryId);

    if (!review) {
      await sendEditNotice(interaction, shouldUpdateReviewMessage, '문의 정보를 찾을 수 없습니다.');
      return;
    }

    if (review.status === 'sent' || review.status === 'rejected') {
      await sendEditNotice(interaction, shouldUpdateReviewMessage, `이미 처리된 문의입니다. 현재 상태: ${review.status}`);
      return;
    }

    if (review.status === 'sending') {
      await sendEditNotice(interaction, shouldUpdateReviewMessage, '이미 처리 중인 문의입니다.');
      return;
    }

    await deps.sheets.updateManagedFields(review.rowNumber, {
      status: 'sending',
      handled_by: edit.handledBy,
      handled_at: new Date().toISOString(),
    });

    let sent: Awaited<ReturnType<GmailClient['sendEmail']>>;
    try {
      sent = await deps.gmail.sendEmail({
        fromEmail: deps.fromEmail,
        fromName: deps.fromName,
        to: review.email,
        subject: edit.subject,
        body: edit.body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'failed',
        error_message: message,
      });
      await sendEditNotice(interaction, shouldUpdateReviewMessage, '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.');
      return;
    }

    try {
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'sent',
        final_subject: edit.subject,
        final_body: edit.body,
        gmail_message_id: sent.messageId,
      });
    } catch {
      await sendEditNotice(
        interaction,
        shouldUpdateReviewMessage,
        '이메일은 발송됐지만 시트 상태 업데이트에 실패했습니다. 중복 발송을 막기 위해 상태를 확인해 주세요.',
      );
      return;
    }

    if (shouldUpdateReviewMessage) {
      await interaction.editReply({
        content: `${interaction.message.content}\n\n처리 결과: Sent after edit by <@${edit.handledBy}>`,
        components: [],
      });
      return;
    }

    await interaction.editReply({ content: '수정된 답변을 이메일로 발송했습니다.' });
  } finally {
    deps.lock.release(edit.inquiryId, edit.handledBy);
  }
}

async function sendEditNotice(
  interaction: ModalSubmitInteraction,
  shouldUpdateReviewMessage: boolean,
  content: string,
): Promise<void> {
  if (shouldUpdateReviewMessage) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.editReply({ content });
}
