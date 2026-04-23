export const inquiryTypes = ['APP_ERROR', 'SERVICE_QUESTION', 'SUGGESTION', 'OTHER'] as const;

export type InquiryType = (typeof inquiryTypes)[number];

export const inquiryStatuses = [
  'new',
  'drafting',
  'pending_review',
  'sending',
  'sent',
  'rejected',
  'failed',
] as const;

export type InquiryStatus = (typeof inquiryStatuses)[number];

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Inquiry {
  inquiryId: string;
  rowNumber: number;
  submittedAt: string;
  email: string;
  name: string;
  type: InquiryType;
  message: string;
  status: InquiryStatus;
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

export interface InquiryDraft {
  inquiryId: string;
  summary: string;
  subject: string;
  body: string;
  risk: RiskAssessment;
  missingInformation: string[];
}
