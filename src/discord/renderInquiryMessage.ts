import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

/** Discord CX 채널에 보낼 문의 검토 카드 payload를 생성합니다. */
export function renderInquiryMessage(input: {
  inquiry: Inquiry;
  draft: InquiryDraft;
}) {
  const { inquiry, draft } = input;
  const riskLine =
    draft.risk.level === 'high'
      ? `HIGH RISK: ${draft.risk.reasons.join(' / ')}`
      : `Risk: ${draft.risk.level}`;

  return {
    content: [
      `새 문의 검토 요청: ${inquiry.inquiryId}`,
      riskLine,
      `유형: ${inquiry.type}`,
      `고객: ${inquiry.name} <${inquiry.email}>`,
      '',
      `요약: ${draft.summary}`,
      '',
      `제목: ${draft.subject}`,
      '```',
      draft.body,
      '```',
    ].join('\n'),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve:${inquiry.inquiryId}`)
          .setLabel('Approve & Send')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`edit:${inquiry.inquiryId}`)
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reject:${inquiry.inquiryId}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}
