import { describe, expect, it } from 'vitest';
import { classifyRisk } from '../../src/domain/risk.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('classifyRisk', () => {
  it('should mark OTHER inquiries as high risk when category is broad', () => {
    // Arrange
    const inquiry = { ...baseInquiry, type: 'OTHER' as const, message: '기타 문의입니다.' };

    // Act
    const result = classifyRisk(inquiry);

    // Assert
    expect(result).toEqual({
      level: 'high',
      reasons: ['OTHER inquiries require manual high-risk review.']
    });
  });

  it('should mark deletion requests as high risk when message mentions personal data deletion', () => {
    // Arrange
    const inquiry = {
      ...baseInquiry,
      type: 'SERVICE_QUESTION' as const,
      message: '개인정보 삭제를 요청합니다.'
    };

    // Act
    const result = classifyRisk(inquiry);

    // Assert
    expect(result.level).toBe('high');
    expect(result.reasons.join(' ')).toContain('deletion');
  });

  it('should keep ordinary service questions low risk when no sensitive terms are present', () => {
    // Arrange
    const inquiry = {
      ...baseInquiry,
      type: 'SERVICE_QUESTION' as const,
      message: '서비스 이용 방법이 궁금합니다.'
    };

    // Act
    const result = classifyRisk(inquiry);

    // Assert
    expect(result).toEqual({ level: 'low', reasons: [] });
  });
});
