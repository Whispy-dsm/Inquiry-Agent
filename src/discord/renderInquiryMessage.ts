import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { EvidenceItem, EvidenceReview } from '../domain/evidence.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

/** Discord CX 채널에 보낼 문의 검토 카드 payload를 생성합니다. */
export function renderInquiryMessage(input: {
  inquiry: Inquiry;
  draft: InquiryDraft;
}) {
  const { inquiry, draft } = input;
  const content = [
    `새 문의 검토 요청: ${inquiry.inquiryId}`,
    `유형: ${inquiry.type}`,
    `고객: ${inquiry.name} <${inquiry.email}>`,
    '',
    `요약: ${draft.summary}`,
    '',
    `제목: ${draft.subject}`,
    '```',
    draft.body,
    '```',
  ];
  const evidenceReview = renderEvidenceReview(draft.evidenceReview);

  if (evidenceReview) {
    content.push('', evidenceReview);
  }

  return {
    content: content.join('\n'),
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

function renderEvidenceReview(review: EvidenceReview | undefined): string {
  if (!review) {
    return '';
  }

  return [
    '내부 근거 검토',
    `Route: ${review.route}`,
    `Reason: ${review.reason}`,
    `Confidence: ${review.confidence}`,
    `Needs check: ${review.needsCheck}`,
    `Conflicts: ${review.conflicts.length > 0 ? review.conflicts.join(' / ') : 'none'}`,
    'Evidence:',
    ...review.evidence.slice(0, 6).map(renderEvidenceItem),
  ].join('\n');
}

function renderEvidenceItem(item: EvidenceItem): string {
  const scoreParts = [
    item.retrievalSignals?.join('+'),
    item.score === undefined ? undefined : `score=${formatScore(item.score)}`,
    item.semanticScore === undefined ? undefined : `semantic=${formatScore(item.semanticScore)}`,
    item.circuitScore === undefined ? undefined : `circuit=${formatScore(item.circuitScore)}`,
  ].filter(Boolean);

  return [
    `- ${item.sourceType} [${item.authority}, ${item.status}] ${item.source}`,
    scoreParts.length > 0 ? `  signals: ${scoreParts.join(', ')}` : undefined,
    `  ${singleLine(item.snippet, 260)}`,
  ].filter((line): line is string => typeof line === 'string').join('\n');
}

function singleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatScore(score: number): string {
  return score.toFixed(3);
}
