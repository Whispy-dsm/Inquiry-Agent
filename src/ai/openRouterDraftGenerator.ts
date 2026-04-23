import { OpenRouter } from '@openrouter/sdk';
import { z } from 'zod';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { classifyRisk } from '../domain/risk.js';
import type { ContextProvider } from './contextProvider.js';
import { draftSystemPrompt } from './prompt.js';

/** 모델 출력 JSON을 안전하게 검증하기 위한 초안 schema입니다. */
const draftSchema = z.object({
  summary: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  missingInformation: z.array(z.string()).default([]),
});

/** 테스트와 실제 SDK를 같은 방식으로 다루기 위한 OpenRouter 최소 포트입니다. */
type OpenRouterLike = {
  callModel(args: {
    model: string;
    instructions: string;
    input: string;
  }): {
    getText(): Promise<string>;
  };
};

/**
 * OpenRouter 모델과 context provider를 사용해 문의 답변 초안을 생성합니다.
 *
 * @remarks
 * 모델 출력은 신뢰하지 않고 {@link parseDraftJson}으로 schema 검증을 거칩니다.
 *
 * @public
 */
export class OpenRouterDraftGenerator {
  private readonly client: OpenRouterLike;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly contextProvider: ContextProvider,
    client?: OpenRouterLike,
  ) {
    this.client = client ?? (new OpenRouter({ apiKey }) as unknown as OpenRouterLike);
  }

  /**
   * 관련 context를 조회하고 모델 응답을 InquiryDraft로 파싱합니다.
   *
   * @param inquiry - 답변 초안을 만들 문의
   * @returns Discord 검토 카드에 올릴 AI 답변 초안
   */
  async generateDraft(inquiry: Inquiry): Promise<InquiryDraft> {
    const context = await this.contextProvider.findRelevantContext(inquiry);
    const result = this.client.callModel({
      model: this.model,
      instructions: draftSystemPrompt,
      input: buildDraftPrompt(inquiry, context),
    });
    const text = await result.getText();
    return parseDraftJson(inquiry, text);
  }
}

/**
 * 문의와 검색된 근거를 모델 입력 프롬프트로 조립합니다.
 *
 * @param inquiry - 사용자 문의
 * @param context - 검색된 공식 근거 문장 목록
 * @returns 모델에 전달할 단일 프롬프트 문자열
 */
export function buildDraftPrompt(inquiry: Inquiry, context: string[]): string {
  return [
    `Inquiry ID: ${inquiry.inquiryId}`,
    `Inquiry Type: ${inquiry.type}`,
    `Customer Name: ${inquiry.name}`,
    `Customer Email: ${inquiry.email}`,
    `Message:\n${inquiry.message}`,
    'Retrieved Context:',
    context.length > 0 ? context.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No context provided.',
    'Return a JSON object with summary, subject, body, and missingInformation.',
  ].join('\n\n');
}

/**
 * 모델이 반환한 JSON 문자열을 검증하고 실패 시 사람 검토용 안전 초안으로 대체합니다.
 *
 * @param inquiry - 초안이 연결될 문의
 * @param modelOutput - 모델 원문 응답
 * @returns 검증된 초안 또는 안전 fallback 초안
 */
export function parseDraftJson(inquiry: Inquiry, modelOutput: string): InquiryDraft {
  const risk = classifyRisk(inquiry);

  try {
    const parsed = draftSchema.parse(JSON.parse(extractJson(modelOutput)));

    return {
      inquiryId: inquiry.inquiryId,
      summary: parsed.summary,
      subject: parsed.subject,
      body: parsed.body,
      risk,
      missingInformation: parsed.missingInformation,
    };
  } catch {
    return {
      inquiryId: inquiry.inquiryId,
      summary: 'AI draft parsing failed',
      subject: '문의 확인 후 안내드리겠습니다',
      body: `${inquiry.name}님, 안녕하세요.\n\n문의해 주셔서 감사합니다. 남겨주신 내용은 담당자가 확인한 뒤 정확히 안내드리겠습니다.\n\n감사합니다.`,
      risk,
      missingInformation: ['AI draft could not be parsed.'],
    };
  }
}

/** 모델 응답에 설명 문장이 섞여도 첫 JSON 객체만 복구해서 파싱을 시도합니다. */
function extractJson(value: string): string {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    return value;
  }

  return value.slice(start, end + 1);
}
