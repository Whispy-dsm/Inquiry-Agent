import { describe, expect, it, vi } from 'vitest';
import { OpenRouterDraftGenerator } from '../../src/ai/openRouterDraftGenerator.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('OpenRouterDraftGenerator', () => {
  it('should request context, call the model client, and return a parsed draft', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue(['FAQ: 설정에서 알림을 변경할 수 있습니다.']),
    };
    const fakeClient = {
      callModel: vi.fn().mockReturnValue({
        getText: vi.fn().mockResolvedValue(
          JSON.stringify({
            summary: '설정 문의',
            subject: '문의 답변드립니다',
            body: '안녕하세요. 설정 메뉴에서 확인해 주세요.',
            missingInformation: [],
          }),
        ),
      }),
    };
    const target = new OpenRouterDraftGenerator(
      'openrouter-key',
      'openai/gpt-4o-mini',
      contextProvider as never,
      fakeClient as never,
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(contextProvider.findRelevantContext).toHaveBeenCalledWith(baseInquiry);
    expect(fakeClient.callModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o-mini',
        input: expect.stringContaining(baseInquiry.message),
      }),
    );
    expect(result.subject).toBe('문의 답변드립니다');
    expect(result.body).toContain('설정 메뉴');
  });
});
