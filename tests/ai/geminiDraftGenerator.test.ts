/** AI 초안 프롬프트 조립과 Gemini 모델 출력 파싱 fallback을 검증합니다. */
import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, parseDraftJson } from '../../src/ai/geminiDraftGenerator.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('geminiDraftGenerator', () => {
  it('should build a prompt that includes the inquiry and retrieved context', () => {
    // Arrange
    const context = ['FAQ: 서비스는 앱 내 설정에서 확인할 수 있습니다.'];

    // Act
    const result = buildDraftPrompt(baseInquiry, context);

    // Assert
    expect(result).toContain('SERVICE_QUESTION');
    expect(result).toContain('서비스는 앱 내 설정');
    expect(result).toContain(baseInquiry.message);
  });

  it('should parse valid JSON draft output into an inquiry draft', () => {
    // Arrange
    const modelOutput = JSON.stringify({
      summary: '사용법 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요. 안내드립니다.',
      missingInformation: [],
    });

    // Act
    const result = parseDraftJson(baseInquiry, modelOutput);

    // Assert
    expect(result).toMatchObject({
      inquiryId: baseInquiry.inquiryId,
      summary: '사용법 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요. 안내드립니다.',
      missingInformation: [],
    });
  });

  it('should fall back to a safe draft when model output is invalid JSON', () => {
    // Arrange
    const modelOutput = 'not json';

    // Act
    const result = parseDraftJson(baseInquiry, modelOutput);

    // Assert
    expect(result.subject).toBe('문의 확인 후 안내드리겠습니다');
    expect(result.body).toContain('담당자가 확인');
    expect(result.missingInformation).toEqual(['AI draft could not be parsed.']);
  });
});
