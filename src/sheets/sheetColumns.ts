import type { Inquiry, InquiryStatus, InquiryType } from '../domain/inquiry.js';

const inquiryTypeMap: Record<string, InquiryType> = {
  '앱 내 기능에 오류가 있어요': 'APP_ERROR',
  '서비스에 대해 궁금한 점이 있어요': 'SERVICE_QUESTION',
  '건의사항이 있어요': 'SUGGESTION',
  '그 외 문의하고 싶은 내용이 있어요': 'OTHER',
};

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

export function mapRowToInquiry(headers: string[], row: string[], rowNumber: number): Inquiry {
  const get = (header: string): string => {
    const index = headers.indexOf(header);
    if (index < 0) {
      return '';
    }

    return row[index]?.trim() ?? '';
  };

  return {
    inquiryId: get('inquiry_id') || `inq_${rowNumber}`,
    rowNumber,
    submittedAt: get('Timestamp'),
    email: get('Email Address'),
    name: get('이름'),
    type: inquiryTypeMap[get('문의 유형')] ?? 'OTHER',
    message: get('문의 내용'),
    status: normalizeStatus(get('status')),
  };
}

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
