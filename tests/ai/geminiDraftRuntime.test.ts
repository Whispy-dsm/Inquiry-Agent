/** GeminiDraftGenerator가 context provider와 Gemini client를 연결하는 런타임 경계를 검증합니다. */
import { describe, expect, it, vi } from 'vitest';
import { GeminiDraftGenerator } from '../../src/ai/geminiDraftGenerator.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('GeminiDraftGenerator', () => {
  it('should request context, call the Gemini model, and return a parsed draft', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue(['FAQ: 설정에서 알림을 변경할 수 있습니다.']),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            summary: '설정 문의',
            subject: '문의 답변드립니다',
            body: '안녕하세요. 설정 메뉴에서 확인해 주세요.',
            missingInformation: [],
          }),
        }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(contextProvider.findRelevantContext).toHaveBeenCalledWith(baseInquiry);
    expect(fakeClient.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash-lite',
        contents: expect.stringContaining(baseInquiry.message),
        config: expect.objectContaining({
          systemInstruction: expect.any(String),
        }),
      }),
    );
    expect(result.subject).toBe('문의 답변드립니다');
    expect(result.body).toContain('설정 메뉴');
  });
});
