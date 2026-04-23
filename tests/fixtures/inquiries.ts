import type { Inquiry } from '../../src/domain/inquiry.js';

export const baseInquiry: Inquiry = {
  inquiryId: 'inq_20260423_0001',
  rowNumber: 2,
  submittedAt: '2026-04-23T05:00:00.000Z',
  email: 'user@example.com',
  name: '홍길동',
  type: 'SERVICE_QUESTION',
  message: '서비스 이용 방법이 궁금합니다.',
  status: 'new'
};
