import { describe, expect, it } from 'vitest';
import { renderInquiryMessage } from '../../src/discord/renderInquiryMessage.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('renderInquiryMessage', () => {
  it('should render high-risk content and action buttons for review', () => {
    // Arrange
    const inquiry = { ...baseInquiry, type: 'OTHER' as const };
    const draft = {
      inquiryId: baseInquiry.inquiryId,
      summary: '기타 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
      risk: {
        level: 'high' as const,
        reasons: ['OTHER inquiries require manual high-risk review.'],
      },
      missingInformation: [],
    };

    // Act
    const result = renderInquiryMessage({ inquiry, draft });

    // Assert
    expect(result.content).toContain('HIGH RISK');
    expect(result.content).toContain(baseInquiry.inquiryId);
    expect(JSON.stringify(result.components)).toContain(`approve:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(result.components)).toContain(`edit:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(result.components)).toContain(`reject:${baseInquiry.inquiryId}`);
  });
});
