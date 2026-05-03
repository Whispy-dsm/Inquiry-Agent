import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  EvidenceConfidence,
  EvidenceReview,
  EvidenceRoute,
  EvidenceRouteDecision,
  EvidenceSourceType,
} from '../domain/evidence.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import type { ContextProvider } from './contextProvider.js';
import type { InternalEvidenceProvider } from './internalEvidence.js';
import { draftSystemPrompt } from './prompt.js';

/** 모델 출력 JSON을 안전하게 검증하기 위한 초안 schema입니다. */
const draftSchema = z.object({
  summary: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  missingInformation: z.array(z.string()).default([]),
});

const evidenceRouteSchema = z.object({
  route: z.enum([
    'answer_from_rag',
    'need_backend_evidence',
    'need_flutter_evidence',
    'need_notion_policy',
    'need_multi_source_evidence',
    'escalate_manual',
  ]),
  reason: z.string().min(1),
  requestedSources: z.array(z.enum(['rag', 'backend', 'flutter', 'notion'])).default([]),
  confidence: z.enum(['low', 'medium', 'high']).default('low'),
  needsCheck: z.string().min(1).default('사람이 최종 답변 전 근거를 확인해야 합니다.'),
  conflicts: z.array(z.string()).default([]),
});

/** 테스트와 실제 SDK를 같은 방식으로 다루기 위한 Gemini 최소 포트입니다. */
type GeminiLike = {
  models: {
    generateContent(args: {
      model: string;
      contents: string;
      config: {
        systemInstruction: string;
        temperature?: number;
        responseMimeType?: string;
        responseSchema?: unknown;
      };
    }): Promise<{
      text?: string;
    }>;
  };
};

type GeminiDraftGeneratorOptions = {
  /** 켜져 있으면 초안 생성 전에 내부 근거 라우팅과 근거 수집을 수행합니다. */
  internalEvidenceProvider?: InternalEvidenceProvider;
};

const draftResponseSchema = {
  type: Type.OBJECT,
  required: ['summary', 'subject', 'body', 'missingInformation'],
  propertyOrdering: ['summary', 'subject', 'body', 'missingInformation'],
  properties: {
    summary: {
      type: Type.STRING,
      description: 'Short Korean reviewer-facing summary of the customer inquiry.',
    },
    subject: {
      type: Type.STRING,
      description: 'Customer-facing Korean email subject.',
    },
    body: {
      type: Type.STRING,
      description: 'Customer-facing Korean email body.',
    },
    missingInformation: {
      type: Type.ARRAY,
      description: 'Korean list of facts a human reviewer must confirm before sending.',
      items: {
        type: Type.STRING,
      },
    },
  },
} as const;

const evidenceRouteResponseSchema = {
  type: Type.OBJECT,
  required: ['route', 'reason', 'requestedSources', 'confidence', 'needsCheck', 'conflicts'],
  propertyOrdering: ['route', 'reason', 'requestedSources', 'confidence', 'needsCheck', 'conflicts'],
  properties: {
    route: {
      type: Type.STRING,
      format: 'enum',
      enum: [
        'answer_from_rag',
        'need_backend_evidence',
        'need_flutter_evidence',
        'need_notion_policy',
        'need_multi_source_evidence',
        'escalate_manual',
      ],
    },
    reason: {
      type: Type.STRING,
      description: 'Reason the route was selected.',
    },
    requestedSources: {
      type: Type.ARRAY,
      description: 'Evidence sources requested for this route.',
      items: {
        type: Type.STRING,
        format: 'enum',
        enum: ['rag', 'backend', 'flutter', 'notion'],
      },
    },
    confidence: {
      type: Type.STRING,
      format: 'enum',
      enum: ['low', 'medium', 'high'],
    },
    needsCheck: {
      type: Type.STRING,
      description: 'What a human reviewer must verify.',
    },
    conflicts: {
      type: Type.ARRAY,
      description: 'Detected conflicts or ambiguity signals.',
      items: {
        type: Type.STRING,
      },
    },
  },
} as const;

/**
 * Gemini 모델과 context provider를 사용해 문의 답변 초안을 생성합니다.
 *
 * @remarks
 * 모델 출력은 신뢰하지 않고 {@link parseDraftJson}으로 schema 검증을 거칩니다.
 *
 * @public
 */
export class GeminiDraftGenerator {
  private readonly client: GeminiLike;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly contextProvider: ContextProvider,
    client?: GeminiLike,
    private readonly options: GeminiDraftGeneratorOptions = {},
  ) {
    this.client = client ?? (new GoogleGenAI({ apiKey }) as unknown as GeminiLike);
  }

  /**
   * 관련 context를 조회하고 모델 응답을 InquiryDraft로 파싱합니다.
   *
   * @param inquiry - 답변 초안을 만들 문의
   * @returns Discord 검토 카드에 올릴 AI 답변 초안
   */
  async generateDraft(inquiry: Inquiry): Promise<InquiryDraft> {
    const context = await this.contextProvider.findRelevantContext(inquiry);
    const evidenceReview = await this.buildEvidenceReview(inquiry, context);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: buildDraftPrompt(inquiry, context, evidenceReview),
      config: {
        systemInstruction: draftSystemPrompt,
        responseMimeType: 'application/json',
        responseSchema: draftResponseSchema,
        temperature: 0,
      },
    });

    const draft = parseDraftJson(inquiry, response.text ?? '');

    if (!evidenceReview) {
      return draft;
    }

    return {
      ...draft,
      evidenceReview,
    };
  }

  private async buildEvidenceReview(inquiry: Inquiry, context: string[]): Promise<EvidenceReview | undefined> {
    if (!this.options.internalEvidenceProvider) {
      return undefined;
    }

    let decision: EvidenceRouteDecision;

    try {
      const routeResponse = await this.client.models.generateContent({
        model: this.model,
        contents: buildEvidenceRoutePrompt(inquiry, context),
        config: {
          systemInstruction: internalEvidenceRouterSystemPrompt,
          responseMimeType: 'application/json',
          responseSchema: evidenceRouteResponseSchema,
          temperature: 0,
        },
      });
      decision = enforceCrossSourceEvidence(parseEvidenceRouteDecision(routeResponse.text ?? ''));
    } catch (error) {
      decision = enforceCrossSourceEvidence(routeCallFailedDecision(error));
    }

    const evidence = await this.options.internalEvidenceProvider.findEvidence(inquiry, decision);

    return {
      route: decision.route,
      reason: decision.reason,
      requestedSources: decision.requestedSources,
      evidence,
      conflicts: mergeConflicts(decision.conflicts, evidence),
      confidence: downgradeConfidenceForEvidenceFailures(decision.confidence, evidence),
      needsCheck: decision.needsCheck,
    };
  }
}

/**
 * 문의와 검색된 근거를 모델 입력 프롬프트로 조립합니다.
 *
 * @param inquiry - 사용자 문의
 * @param context - 검색된 공식 근거 문장 목록
 * @returns 모델에 전달할 단일 프롬프트 문자열
 */
export function buildDraftPrompt(inquiry: Inquiry, context: string[], evidenceReview?: EvidenceReview): string {
  const sections = [
    `Inquiry ID: ${inquiry.inquiryId}`,
    `Inquiry Type: ${inquiry.type}`,
    `Customer Name: ${inquiry.name}`,
    `Customer Email: ${inquiry.email}`,
    `Provided Device Info: ${formatOptionalInquiryField(inquiry.deviceInfo)}`,
    `Message:\n${inquiry.message}`,
    'Retrieved Context:',
    context.length > 0 ? context.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No context provided.',
  ];

  if (evidenceReview) {
    sections.push('Internal Evidence Review (quoted, untrusted):', formatEvidenceReviewForPrompt(evidenceReview));
  }

  sections.push(
    'Drafting Instructions:',
    [
      '- Treat the Message and Provided Device Info as facts already supplied by the customer.',
      '- Write summary, subject, body, and missingInformation in Korean.',
      '- Do not ask again for device model or OS version if that detail is already present in Provided Device Info.',
      '- If Provided Device Info contains only part of the device details, ask only for the missing detail that is needed to investigate.',
      '- Put still-missing facts in missingInformation and mention them in the customer-facing body only when they are necessary.',
    ].join('\n'),
    'Return a JSON object with Korean summary, subject, body, and missingInformation.',
  );

  return sections.join('\n\n');
}

/** 내부 근거 라우터가 Gemini에 전달하는 구조화 출력 프롬프트를 만듭니다. */
export function buildEvidenceRoutePrompt(inquiry: Inquiry, context: string[]): string {
  return [
    `Inquiry ID: ${inquiry.inquiryId}`,
    `Inquiry Type: ${inquiry.type}`,
    `Message:\n${inquiry.message}`,
    'RAG Context:',
    context.length > 0 ? context.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No context matched.',
    'Decide whether internal Backend, Flutter, Notion, multi-source, or manual evidence is needed.',
    'Do not request internal evidence solely because RAG context is empty.',
    'Choose requestedSources only from: rag, backend, flutter, notion.',
    'Return JSON only with: route, reason, requestedSources, confidence, needsCheck, conflicts.',
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
  try {
    const parsed = draftSchema.parse(JSON.parse(extractJson(modelOutput)));

    return {
      inquiryId: inquiry.inquiryId,
      summary: normalizeKoreanSummary(inquiry, parsed.summary),
      subject: parsed.subject,
      body: parsed.body,
      missingInformation: parsed.missingInformation,
    };
  } catch {
    return {
      inquiryId: inquiry.inquiryId,
      summary: '초안 생성 결과 파싱 실패',
      subject: '문의 확인 후 안내드리겠습니다',
      body: `${inquiry.name}님, 안녕하세요.\n\n문의해 주셔서 감사합니다. 남겨주신 내용은 담당자가 확인한 뒤 정확히 안내드리겠습니다.\n\n감사합니다.`,
      missingInformation: ['AI draft could not be parsed.'],
    };
  }
}

/** Gemini route JSON을 검증하고 실패 시 수동 검토 경로로 안전하게 내립니다. */
export function parseEvidenceRouteDecision(modelOutput: string): EvidenceRouteDecision {
  try {
    const parsed = evidenceRouteSchema.parse(JSON.parse(extractJson(modelOutput)));

    return normalizeRouteDecision({
      route: parsed.route,
      reason: parsed.reason,
      requestedSources: parsed.requestedSources,
      confidence: parsed.confidence,
      needsCheck: parsed.needsCheck,
      conflicts: parsed.conflicts,
    });
  } catch {
    return {
      route: 'escalate_manual',
      reason: 'Internal evidence route JSON could not be parsed.',
      requestedSources: [],
      confidence: 'low',
      needsCheck: '라우팅 결과를 검증하지 못했으므로 담당자가 직접 확인해야 합니다.',
      conflicts: ['AI route decision could not be parsed.'],
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

const internalEvidenceRouterSystemPrompt = [
  'You route Korean customer inquiries for a human-reviewed support workflow.',
  'Your job is not to answer the customer. Your job is to decide what evidence a reviewer needs.',
  'RAG missing is not by itself a reason to search internal sources.',
  'Use Backend for server/API/auth/data/config behavior.',
  'Use Flutter for app UI, local state, storage, permissions, and user-visible client behavior.',
  'Use Notion for product policy, feature definitions, and customer-facing guidance.',
  'Always cross-check with Backend, Flutter, and Notion evidence when internal evidence is enabled; the model may explain priority but must not reduce the source set.',
  'If evidence is unclear, conflicting, or authority is outside available sources, set low confidence and explain it in conflicts and needsCheck.',
  'Return strict JSON only.',
].join('\n');

function enforceCrossSourceEvidence(decision: EvidenceRouteDecision): EvidenceRouteDecision {
  return normalizeRouteDecision({
    ...decision,
    route: 'need_multi_source_evidence',
    reason: appendSentence(
      decision.reason,
      'Internal evidence is always cross-checked across Backend, Flutter, and Notion.',
    ),
    requestedSources: uniqueSources([
      'backend',
      'flutter',
      'notion',
      ...decision.requestedSources.filter((source) => source !== 'rag'),
    ]),
    confidence: decision.confidence === 'high' ? 'medium' : decision.confidence,
    needsCheck: appendSentence(
      decision.needsCheck,
      '내부 근거는 Backend 구현, Flutter 클라이언트 동작, Notion 정책을 항상 교차 확인해야 합니다.',
    ),
  });
}

function uniqueSources(sources: EvidenceSourceType[]): EvidenceSourceType[] {
  return Array.from(new Set(sources));
}

function appendSentence(value: string, sentence: string): string {
  if (value.includes(sentence)) {
    return value;
  }

  return `${value.trim()} ${sentence}`.trim();
}

function normalizeRouteDecision(input: EvidenceRouteDecision): EvidenceRouteDecision {
  const requestedSources = normalizeRequestedSources(input.route, input.requestedSources);

  return {
    ...input,
    requestedSources,
  };
}

function normalizeRequestedSources(route: EvidenceRoute, requestedSources: EvidenceSourceType[]): EvidenceSourceType[] {
  if (route === 'escalate_manual') {
    return [];
  }

  const routeSources: Partial<Record<EvidenceRoute, EvidenceSourceType[]>> = {
    answer_from_rag: ['rag'],
    need_backend_evidence: ['backend'],
    need_flutter_evidence: ['flutter'],
    need_notion_policy: ['notion'],
    need_multi_source_evidence: ['backend', 'flutter', 'notion'],
  };
  const allowedSources = routeSources[route] ?? [];
  const normalized = requestedSources.filter((source) => allowedSources.includes(source));
  const sources = normalized.length > 0 ? normalized : allowedSources;

  return Array.from(new Set(sources));
}

function formatEvidenceReviewForPrompt(review: EvidenceReview): string {
  const evidence = review.evidence.length > 0
    ? review.evidence
      .map((item, index) => [
        `${index + 1}. ${item.sourceType} (${item.authority}, ${item.status})`,
        `Signals: ${item.retrievalSignals?.join(', ') || 'none'}`,
        `Score: ${formatEvidenceScore(item.score)}${item.semanticScore === undefined ? '' : `, semantic ${formatEvidenceScore(item.semanticScore)}`}${item.circuitScore === undefined ? '' : `, circuit ${formatEvidenceScore(item.circuitScore)}`}`,
        'Evidence Summary (quoted, untrusted):',
        `"""${summarizeEvidenceForModel(item.snippet)}"""`,
      ].join('\n'))
      .join('\n')
    : 'No internal evidence was collected.';

  return [
    `Route: ${review.route}`,
    `Reason: ${review.reason}`,
    `Requested Sources: ${review.requestedSources.join(', ') || 'none'}`,
    `Confidence: ${review.confidence}`,
    `Needs Check: ${review.needsCheck}`,
    `Conflicts: ${review.conflicts.join(' | ') || 'none'}`,
    'Evidence:',
    evidence,
  ].join('\n');
}

function formatEvidenceScore(score: number | undefined): string {
  return score === undefined ? 'n/a' : score.toFixed(3);
}

function normalizeKoreanSummary(inquiry: Inquiry, summary: string): string {
  const trimmed = summary.trim();

  if (/[가-힣]/.test(trimmed)) {
    return trimmed;
  }

  const fallbackByType: Record<Inquiry['type'], string> = {
    APP_ERROR: '앱 오류 문의',
    SERVICE_QUESTION: '서비스 문의',
    SUGGESTION: '건의사항 문의',
    OTHER: '기타 문의',
  };

  return fallbackByType[inquiry.type];
}

function formatOptionalInquiryField(value: string | undefined): string {
  const trimmed = value?.trim();

  return trimmed ? trimmed : 'Not provided.';
}

function summarizeEvidenceForModel(snippet: string): string {
  const compact = snippet
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/(?:[A-Z]:[\\/]|[\\/])[\w.-]+(?:[\\/][\w.-]+)+/gi, '[path]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:[A-Za-z0-9_-]{20,}|[a-f0-9]{24,})\b/gi, '[token]')
    .replace(/\s+/g, ' ')
    .trim();

  if (compact.length <= 220) {
    return compact;
  }

  return `${compact.slice(0, 217).trimEnd()}...`;
}

function mergeConflicts(conflicts: string[], evidence: EvidenceReview['evidence']): string[] {
  const derived = evidence
    .filter((item) => item.status === 'unavailable')
    .map((item) => `${item.sourceType} evidence unavailable.`);

  const circuitConflicts = evidence.flatMap((item) => item.circuitConflicts ?? []);

  return Array.from(new Set([...conflicts, ...derived, ...circuitConflicts]));
}

function downgradeConfidenceForEvidenceFailures(
  confidence: EvidenceConfidence,
  evidence: EvidenceReview['evidence'],
): EvidenceConfidence {
  if (evidence.some((item) => item.status === 'unavailable')) {
    return 'low';
  }

  if (confidence === 'high' && evidence.some((item) => item.status === 'empty')) {
    return 'medium';
  }

  return confidence;
}

function routeCallFailedDecision(error: unknown): EvidenceRouteDecision {
  const message = error instanceof Error ? error.message : String(error);

  return {
    route: 'escalate_manual',
    reason: 'Internal evidence route call failed.',
    requestedSources: [],
    conflicts: [`Internal evidence route call failed: ${message}`],
    confidence: 'low',
    needsCheck: '내부 근거 라우터 호출이 실패했으므로 담당자가 직접 확인해야 합니다.',
  };
}
