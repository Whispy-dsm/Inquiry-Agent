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

export interface InteractionHandlerDeps {
  lock: InquiryLock;
  sheets: GoogleSheetsClient;
  gmail: GmailClient;
  fromEmail: string;
  fromName: string;
}

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
    const modal = new ModalBuilder()
      .setCustomId(`editSubmit:${inquiryId}`)
      .setTitle('답변 수정 후 발송')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('이메일 제목')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('body')
            .setLabel('이메일 본문')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
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
    const review = await deps.sheets.findInquiryReview(inquiryId);

    if (!review) {
      await interaction.reply({ content: '문의 정보를 찾을 수 없습니다.', ephemeral: true });
      return;
    }

    if (review.status === 'sent' || review.status === 'rejected') {
      await interaction.reply({
        content: `이미 처리된 문의입니다. 현재 상태: ${review.status}`,
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

      await interaction.update({
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

      const sent = await deps.gmail.sendEmail({
        fromEmail: deps.fromEmail,
        fromName: deps.fromName,
        to: review.email,
        subject: review.draftSubject,
        body: review.draftBody,
      });

      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'sent',
        final_subject: review.draftSubject,
        final_body: review.draftBody,
        gmail_message_id: sent.messageId,
      });

      await interaction.update({
        content: `${interaction.message.content}\n\n처리 결과: Sent by <@${holder}>`,
        components: [],
      });
      return;
    }

    await interaction.reply({ content: '지원하지 않는 액션입니다.', ephemeral: true });
  } finally {
    deps.lock.release(inquiryId, holder);
  }
}

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
