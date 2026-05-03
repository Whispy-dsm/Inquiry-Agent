import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { EvidenceItem, EvidenceReview } from '../domain/evidence.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

/** Discord CX 채널에 보낼 문의 검토 카드 payload를 생성합니다. */
export function renderInquiryMessage(input: {
  inquiry: Inquiry;
  draft: InquiryDraft;
  inquiryExpanded?: boolean;
  evidenceExpanded?: boolean;
}) {
  const { inquiry, draft, inquiryExpanded = false, evidenceExpanded = false } = input;
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
  rememberInquiryDetails(inquiry);
  rememberEvidenceReview(inquiry.inquiryId, draft.evidenceReview);

  const inquiryDetails = renderInquiryDetails(inquiry, inquiryExpanded);
  const evidenceReview = renderEvidenceReview(draft.evidenceReview, evidenceExpanded);

  if (inquiryDetails) {
    content.push('', inquiryDetails);
  }

  if (evidenceReview) {
    content.push('', evidenceReview);
  }

  return {
    content: content.join('\n'),
    components: renderReviewComponents({
      inquiryId: inquiry.inquiryId,
      hasInquiryDetails: true,
      inquiryExpanded,
      hasEvidenceReview: Boolean(draft.evidenceReview),
      evidenceExpanded,
    }),
  };
}

/**
 * 문의 검토 메시지 하단에 붙는 액션 버튼 행을 만듭니다.
 *
 * @remarks
 * 원문과 내부 근거가 있는 메시지는 현재 펼침 상태에 맞춰 열기/닫기 버튼을 함께 표시합니다.
 * 승인, 수정, 거절 버튼은 토글 여부와 무관하게 같은 행에 유지됩니다.
 */
export function renderReviewComponents(input: {
  inquiryId: string;
  hasInquiryDetails: boolean;
  inquiryExpanded: boolean;
  hasEvidenceReview: boolean;
  evidenceExpanded: boolean;
}): Array<ActionRowBuilder<ButtonBuilder>> {
  const {
    inquiryId,
    hasInquiryDetails,
    inquiryExpanded,
    hasEvidenceReview,
    evidenceExpanded,
  } = input;
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`approve:${inquiryId}`)
      .setLabel('Approve & Send')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`edit:${inquiryId}`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`reject:${inquiryId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
  ];

  if (hasInquiryDetails) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${inquiryExpanded ? 'inquiryClose' : 'inquiryOpen'}:${inquiryId}`)
        .setLabel(inquiryExpanded ? '문의 닫기' : '문의 열기')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (hasEvidenceReview) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${evidenceExpanded ? 'evidenceClose' : 'evidenceOpen'}:${inquiryId}`)
        .setLabel(evidenceExpanded ? '근거 닫기' : '근거 열기')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
  ];
}

/**
 * 기존 Discord 메시지에서 고객 문의 원문 섹션만 접힘 또는 펼침 상태로 교체합니다.
 *
 * @remarks
 * 원문 토글은 내부 근거 토글과 독립적으로 동작합니다. 이미 열린 내부 근거 섹션이 있으면 그 앞에
 * 문의 원문을 삽입해 검토자가 고객 원문과 근거를 순서대로 확인할 수 있게 합니다.
 */
export function replaceInquiryDetailsSection(
  content: string,
  inquiryId: string,
  inquiry: CachedInquiryDetails,
  inquiryExpanded: boolean,
): ReturnType<typeof renderInquiryMessage> {
  const contentWithoutInquiry = stripInquiryDetailsSection(content);
  const evidenceExpanded = isEvidenceReviewExpanded(contentWithoutInquiry);
  const hasEvidenceReview = hasEvidenceReviewSection(contentWithoutInquiry);
  const nextContent = inquiryExpanded
    ? insertBeforeEvidenceReview(contentWithoutInquiry, renderInquiryDetails(inquiry, true))
    : contentWithoutInquiry;

  return {
    content: nextContent,
    components: renderReviewComponents({
      inquiryId,
      hasInquiryDetails: true,
      inquiryExpanded,
      hasEvidenceReview,
      evidenceExpanded,
    }),
  };
}

/**
 * 기존 Discord 메시지에서 내부 근거 검토 섹션만 접힘 또는 펼침 상태로 교체합니다.
 *
 * @remarks
 * 문의 요약, 초안 제목, 초안 본문은 그대로 보존합니다. 토글 버튼을 눌러도 검토자가 승인할
 * 답변 내용이 바뀌지 않도록 내부 근거 영역만 다시 렌더링합니다.
 */
export function replaceEvidenceReviewSection(
  content: string,
  inquiryId: string,
  review: EvidenceReview,
  evidenceExpanded: boolean,
): ReturnType<typeof renderInquiryMessage> {
  const inquiryExpanded = hasInquiryDetailsSection(content);

  return {
    content: [
      stripEvidenceReviewSection(content),
      renderEvidenceReview(review, evidenceExpanded),
    ].filter(Boolean).join('\n\n'),
    components: renderReviewComponents({
      inquiryId,
      hasInquiryDetails: true,
      inquiryExpanded,
      hasEvidenceReview: true,
      evidenceExpanded,
    }),
  };
}

/**
 * 현재 워커 프로세스가 마지막으로 렌더링한 문의별 고객 원문 정보를 반환합니다.
 *
 * @remarks
 * 원문 토글용 메모리 캐시입니다. 영구 저장소가 아니므로 워커 재시작 뒤 기존 메시지의 원문 토글은
 * 다시 열 수 없습니다.
 */
export function getCachedInquiryDetails(inquiryId: string): CachedInquiryDetails | undefined {
  return inquiryDetailsCache.get(inquiryId);
}

/**
 * 현재 워커 프로세스가 마지막으로 렌더링한 문의별 내부 근거 검토 데이터를 반환합니다.
 *
 * @remarks
 * 이 캐시는 Discord 토글 버튼 응답용 메모리 캐시입니다. 영구 저장소가 아니므로 워커가
 * 재시작되면 기존 메시지의 근거 토글 데이터는 다시 열 수 없습니다.
 */
export function getCachedEvidenceReview(inquiryId: string): EvidenceReview | undefined {
  return evidenceReviewCache.get(inquiryId);
}

/**
 * 문의가 승인, 수정 발송, 거절처럼 최종 처리된 뒤 내부 근거 검토 캐시를 제거합니다.
 *
 * @remarks
 * 처리 완료 후 오래된 검토 카드에서 근거 토글이 다시 열려 낡은 데이터를 보여주지 않도록 정리합니다.
 */
export function clearCachedEvidenceReview(inquiryId: string): void {
  evidenceReviewCache.delete(inquiryId);
}

/** 최종 처리된 문의의 원문 토글 캐시를 제거합니다. */
export function clearCachedInquiryDetails(inquiryId: string): void {
  inquiryDetailsCache.delete(inquiryId);
}

function renderInquiryDetails(inquiry: CachedInquiryDetails, expanded: boolean): string {
  if (!expanded) {
    return '';
  }

  return [
    inquiryDetailsTitle,
    inquiry.deviceInfo ? `단말기: ${singleLine(inquiry.deviceInfo, 180)}` : undefined,
    '```',
    truncateMultilineForCodeBlock(inquiry.message, 1500),
    '```',
  ].filter((line): line is string => typeof line === 'string').join('\n');
}

function renderEvidenceReview(review: EvidenceReview | undefined, expanded: boolean): string {
  if (!review) {
    return '';
  }

  if (!expanded) {
    return renderEvidenceReviewSummary(review);
  }

  return [
    internalEvidenceReviewTitle,
    `Route: ${review.route}`,
    `Reason: ${review.reason}`,
    `Confidence: ${review.confidence}`,
    `Needs check: ${review.needsCheck}`,
    `Conflicts: ${review.conflicts.length > 0 ? review.conflicts.join(' / ') : 'none'}`,
    'Evidence:',
    ...review.evidence.slice(0, 6).map(renderEvidenceItem),
  ].join('\n');
}

function renderEvidenceReviewSummary(review: EvidenceReview): string {
  const statusCounts = review.evidence.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;

    return counts;
  }, {});
  const statusSummary = ['found', 'empty', 'unavailable']
    .map((status) => `${status}=${statusCounts[status] ?? 0}`)
    .join(', ');

  return [
    internalEvidenceReviewTitle,
    `Route: ${review.route}`,
    `Confidence: ${review.confidence}`,
    `Needs check: ${singleLine(review.needsCheck, 180)}`,
    `Evidence: ${review.evidence.length} items (${statusSummary})`,
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

type CachedInquiryDetails = Pick<Inquiry, 'inquiryId' | 'message' | 'deviceInfo'>;

const inquiryDetailsTitle = '문의 원문';
const internalEvidenceReviewTitle = '내부 근거 검토';
const maxEvidenceReviewCacheEntries = 200;
const inquiryDetailsCache = new Map<string, CachedInquiryDetails>();
const evidenceReviewCache = new Map<string, EvidenceReview>();

function rememberInquiryDetails(inquiry: Inquiry): void {
  if (inquiryDetailsCache.size >= maxEvidenceReviewCacheEntries) {
    const oldestKey = inquiryDetailsCache.keys().next().value;

    if (oldestKey) {
      inquiryDetailsCache.delete(oldestKey);
    }
  }

  inquiryDetailsCache.set(inquiry.inquiryId, {
    inquiryId: inquiry.inquiryId,
    message: inquiry.message,
    ...(inquiry.deviceInfo ? { deviceInfo: inquiry.deviceInfo } : {}),
  });
}

function rememberEvidenceReview(inquiryId: string, review: EvidenceReview | undefined): void {
  if (!review) {
    evidenceReviewCache.delete(inquiryId);
    return;
  }

  if (evidenceReviewCache.size >= maxEvidenceReviewCacheEntries) {
    const oldestKey = evidenceReviewCache.keys().next().value;

    if (oldestKey) {
      evidenceReviewCache.delete(oldestKey);
    }
  }

  evidenceReviewCache.set(inquiryId, review);
}

function stripEvidenceReviewSection(content: string): string {
  const sectionStart = content.indexOf(`\n\n${internalEvidenceReviewTitle}\n`);

  if (sectionStart < 0) {
    return content;
  }

  return content.slice(0, sectionStart);
}

function stripInquiryDetailsSection(content: string): string {
  const sectionStart = content.indexOf(`\n\n${inquiryDetailsTitle}\n`);

  if (sectionStart < 0) {
    return content;
  }

  const sectionEnd = content.indexOf(`\n\n${internalEvidenceReviewTitle}\n`, sectionStart + 1);

  if (sectionEnd < 0) {
    return content.slice(0, sectionStart);
  }

  return `${content.slice(0, sectionStart)}${content.slice(sectionEnd)}`;
}

function insertBeforeEvidenceReview(content: string, section: string): string {
  const evidenceStart = content.indexOf(`\n\n${internalEvidenceReviewTitle}\n`);

  if (evidenceStart < 0) {
    return [content, section].filter(Boolean).join('\n\n');
  }

  return `${content.slice(0, evidenceStart)}\n\n${section}${content.slice(evidenceStart)}`;
}

function hasInquiryDetailsSection(content: string): boolean {
  return content.includes(`\n\n${inquiryDetailsTitle}\n`);
}

function hasEvidenceReviewSection(content: string): boolean {
  return content.includes(`\n\n${internalEvidenceReviewTitle}\n`);
}

function isEvidenceReviewExpanded(content: string): boolean {
  return /\nEvidence:\n- /.test(content);
}

function truncateMultilineForCodeBlock(value: string, maxLength: number): string {
  const sanitized = value.replace(/```/g, '`​``').trim();

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, maxLength - 3).trimEnd()}...`;
}
