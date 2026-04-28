/** Google Form에서 들어오는 문의 유형을 내부 로직에서 쓰는 안정적인 enum 값으로 고정합니다. */
export const inquiryTypes = ['APP_ERROR', 'SERVICE_QUESTION', 'SUGGESTION', 'OTHER'] as const;

/** Google Form의 문의 유형 라벨을 정규화한 내부 문의 유형입니다. */
export type InquiryType = (typeof inquiryTypes)[number];

/** Google Sheet에 기록되는 문의 처리 상태 목록입니다. */
export const inquiryStatuses = [
  'new',
  'drafting',
  'pending_review',
  'sending',
  'sent',
  'rejected',
  'failed',
] as const;

/** Google Sheet 상태 컬럼에 저장되는 문의 처리 상태입니다. */
export type InquiryStatus = (typeof inquiryStatuses)[number];

/** Discord 검토 카드에서 표시하는 위험도입니다. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Google Sheet 한 행을 에이전트가 처리하기 좋은 형태로 정규화한 도메인 모델입니다. */
export interface Inquiry {
  /** Sheet 행과 Discord action을 연결하는 안정적인 문의 식별자입니다. */
  inquiryId: string;
  /** Google Sheet에서 실제 업데이트할 1-based row 번호입니다. */
  rowNumber: number;
  /** Google Form 제출 시각 원문입니다. */
  submittedAt: string;
  /** 답장 이메일을 보낼 사용자 주소입니다. */
  email: string;
  /** 답장 본문에서 사용할 사용자 이름입니다. */
  name: string;
  /** 정규화된 문의 유형입니다. */
  type: InquiryType;
  /** 사용자가 제출한 문의 본문입니다. */
  message: string;
  /** 현재 처리 상태입니다. */
  status: InquiryStatus;
}

/** 자동 발송 위험도를 판단한 결과와 그 이유입니다. */
export interface RiskAssessment {
  /** 최종 위험도입니다. */
  level: RiskLevel;
  /** 사람이 검토할 때 참고할 위험 판단 근거입니다. */
  reasons: string[];
}

/** AI가 생성하고 Discord에서 사람이 검토할 이메일 초안입니다. */
export interface InquiryDraft {
  /** 초안이 연결된 문의 식별자입니다. */
  inquiryId: string;
  /** CX팀이 빠르게 읽을 문의 요약입니다. */
  summary: string;
  /** 이메일 제목 초안입니다. */
  subject: string;
  /** 이메일 본문 초안입니다. */
  body: string;
  /** 초안과 함께 표시할 위험도 평가입니다. */
  risk: RiskAssessment;
  /** 답변 전 추가로 확인해야 하는 정보입니다. */
  missingInformation: string[];
}
