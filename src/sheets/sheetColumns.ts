import type { Inquiry, InquiryStatus, InquiryType } from '../domain/inquiry.js';

const timestampHeaders = ['타임스탬프', 'Timestamp'] as const;
const typeHeaders = ['문의 유형을 선택해 주세요', '문의 유형'] as const;
const replyEmailHeaders = ['답변 받으실 이메일 주소를 입력해주세요.', 'Email Address'] as const;
const nameHeaders = ['이름'] as const;
const inquiryIdHeaders = ['inquiry_id'] as const;
const statusHeaders = ['status'] as const;
const legacyMessageHeaders = ['문의 내용'] as const;

/** Google Form의 한국어 문의 유형 라벨을 내부 enum 값으로 변환합니다. */
const inquiryTypeMap: Record<string, InquiryType> = {
  '앱 내 기능에 오류가 있어요': 'APP_ERROR',
  '기능 오류가 있어요': 'APP_ERROR',
  '서비스에 대해 궁금한 점이 있어요': 'SERVICE_QUESTION',
  '서비스 내 궁금한 점이 있어요': 'SERVICE_QUESTION',
  '건의사항이 있어요': 'SUGGESTION',
  '그 외 문의하고 싶은 내용이 있어요': 'OTHER',
};

const messageHeadersByType: Record<InquiryType, readonly string[]> = {
  APP_ERROR: ['[기능 오류] 문의 사항을 최대한 자세히 적어주세요.'],
  SERVICE_QUESTION: ['[서비스 내 궁금한 점] 문의 사항을 최대한 자세히 적어주세요.'],
  SUGGESTION: ['[건의사항] 문의 사항을 최대한 자세히 적어주세요.'],
  OTHER: ['[그 외] 문의 사항을 최대한 자세히 적어주세요.'],
};

/** 비어 있거나 알 수 없는 Sheet 상태를 처리 가능한 신규 상태로 정규화합니다. */
function normalizeStatus(value: string): InquiryStatus {
  if (
    value === 'drafting' ||
    value === 'pending_review' ||
    value === 'sending' ||
    value === 'sent' ||
    value === 'rejected' ||
    value === 'failed'
  ) {
    return value;
  }

  return 'new';
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeInquiryType(value: string): InquiryType {
  return inquiryTypeMap[value.trim()] ?? 'OTHER';
}

function findHeaderIndex(headers: string[], candidates: readonly string[]): number {
  const normalizedCandidates = candidates.map(normalizeHeader);

  return headers.findIndex((header) => normalizedCandidates.includes(normalizeHeader(header)));
}

function getCellValue(headers: string[], row: string[], candidates: readonly string[]): string {
  const index = findHeaderIndex(headers, candidates);

  if (index < 0) {
    return '';
  }

  return row[index]?.trim() ?? '';
}

function getInquiryMessage(headers: string[], row: string[], type: InquiryType): string {
  const typedMessage = getCellValue(headers, row, messageHeadersByType[type]);

  if (typedMessage) {
    return typedMessage;
  }

  return getCellValue(headers, row, legacyMessageHeaders);
}

export function getReplyEmail(headers: string[], row: string[]): string {
  return getCellValue(headers, row, replyEmailHeaders);
}

/** Google Sheet의 header/row 배열을 내부 Inquiry 모델로 변환합니다. */
export function mapRowToInquiry(headers: string[], row: string[], rowNumber: number): Inquiry {
  const type = normalizeInquiryType(getCellValue(headers, row, typeHeaders));

  return {
    inquiryId: getCellValue(headers, row, inquiryIdHeaders) || `inq_${rowNumber}`,
    rowNumber,
    submittedAt: getCellValue(headers, row, timestampHeaders),
    email: getReplyEmail(headers, row),
    name: getCellValue(headers, row, nameHeaders),
    type,
    message: getInquiryMessage(headers, row, type),
    status: normalizeStatus(getCellValue(headers, row, statusHeaders)),
  };
}

/** Sheet에 존재하는 managed column만 골라 A1 업데이트에 필요한 column index/value 목록을 만듭니다. */
export function buildManagedColumnUpdates(
  headers: string[],
  values: Record<string, string>,
): Array<{ columnIndex: number; value: string }> {
  return Object.entries(values).flatMap(([key, value]) => {
    const columnIndex = headers.indexOf(key);

    if (columnIndex < 0) {
      return [];
    }

    return [{ columnIndex, value }];
  });
}
