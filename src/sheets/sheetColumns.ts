import type { Inquiry, InquiryStatus, InquiryType } from '../domain/inquiry.js';

/** Google Form의 한국어 문의 유형 라벨을 내부 enum 값으로 변환합니다. */
const inquiryTypeMap: Record<string, InquiryType> = {
  '앱 내 기능에 오류가 있어요': 'APP_ERROR',
  '서비스에 대해 궁금한 점이 있어요': 'SERVICE_QUESTION',
  '건의사항이 있어요': 'SUGGESTION',
  '그 외 문의하고 싶은 내용이 있어요': 'OTHER',
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

/** Google Sheet의 header/row 배열을 내부 Inquiry 모델로 변환합니다. */
export function mapRowToInquiry(headers: string[], row: string[], rowNumber: number): Inquiry {
  // Google Form 컬럼이 누락되어도 worker가 터지지 않도록 빈 문자열로 방어합니다.
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
