/** 내부 근거 라우터가 선택할 수 있는 문의 처리 경로입니다. */
export const evidenceRoutes = [
  'answer_from_rag',
  'need_backend_evidence',
  'need_flutter_evidence',
  'need_notion_policy',
  'need_multi_source_evidence',
  'escalate_manual',
] as const;

/** 문의에 필요한 내부 근거 라우팅 결과입니다. */
export type EvidenceRoute = (typeof evidenceRoutes)[number];

/** 리뷰 패킷에 표시할 수 있는 근거 소스입니다. */
export const evidenceSourceTypes = ['rag', 'backend', 'flutter', 'notion'] as const;

/** Backend, Flutter, Notion, RAG처럼 근거가 나온 위치의 안정적인 식별자입니다. */
export type EvidenceSourceType = (typeof evidenceSourceTypes)[number];

/** Discord 리뷰어가 근거를 해석할 때 사용할 출처 권위입니다. */
export type EvidenceAuthority =
  | 'baseline-knowledge'
  | 'implementation-behavior'
  | 'client-behavior'
  | 'product-policy'
  | 'unavailable';

/** AI 라우터와 근거 수집 결과의 신뢰도입니다. */
export type EvidenceConfidence = 'low' | 'medium' | 'high';

/** 내부 근거 검색에서 개별 출처가 어떤 상태로 반환되었는지 나타냅니다. */
export type EvidenceItemStatus = 'found' | 'empty' | 'unavailable';

/** Evidence retrieval strategies that contributed to an item. */
export type EvidenceRetrievalSignal = 'keyword' | 'ast' | 'symbol' | 'embedding' | 'external' | 'circuit';

/** AI가 내부 근거를 찾아야 하는지 판단한 결과입니다. */
export interface EvidenceRouteDecision {
  /** 최종 라우팅 경로입니다. */
  route: EvidenceRoute;
  /** 이 경로를 선택한 이유입니다. */
  reason: string;
  /** 라우팅 결과상 확인해야 할 내부 소스 목록입니다. */
  requestedSources: EvidenceSourceType[];
  /** 라우팅 판단의 신뢰도입니다. */
  confidence: EvidenceConfidence;
  /** 사람이 확인해야 하는 이유입니다. */
  needsCheck: string;
  /** 라우터가 감지했거나 의심한 근거 충돌입니다. */
  conflicts: string[];
}

/** Discord 리뷰 패킷에 들어갈 단일 근거 항목입니다. */
export interface EvidenceItem {
  /** 근거가 나온 시스템입니다. */
  sourceType: EvidenceSourceType;
  /** 근거의 권위 수준입니다. */
  authority: EvidenceAuthority;
  /** 리뷰어가 빠르게 훑을 제목입니다. */
  title: string;
  /** 파일, 문서, 설정 키처럼 근거 위치를 추적할 수 있는 값입니다. */
  source: string;
  /** 답변 판단에 필요한 부분만 자른 근거 요약입니다. */
  snippet: string;
  /** 근거 검색 성공, 빈 결과, 접근 불가 상태입니다. */
  status: EvidenceItemStatus;
  /** Search strategies that found or reranked this evidence item. */
  retrievalSignals?: EvidenceRetrievalSignal[];
  /** Local or remote relevance score before optional semantic rerank. */
  score?: number;
  /** Optional cosine similarity from embedding rerank. */
  semanticScore?: number;
  /** Optional score added by the persistent knowledge circuit metadata layer. */
  circuitScore?: number;
  /** Optional stable metadata node id used by the knowledge circuit. */
  circuitNodeId?: string;
  /** Optional source content hash used to ignore stale circuit feedback after a source changes. */
  circuitContentHash?: string;
  /** Optional conflicts derived from persistent knowledge graph edges. */
  circuitConflicts?: string[];
}

/** AI 초안과 함께 Discord에 표시할 내부 근거 리뷰 패킷입니다. */
export interface EvidenceReview {
  /** AI가 선택한 내부 근거 라우팅입니다. */
  route: EvidenceRoute;
  /** 라우팅 이유입니다. */
  reason: string;
  /** 확인 대상으로 선택된 소스입니다. */
  requestedSources: EvidenceSourceType[];
  /** 수집된 근거 항목입니다. */
  evidence: EvidenceItem[];
  /** 근거 충돌 또는 검토 주의점입니다. */
  conflicts: string[];
  /** 근거 패킷 신뢰도입니다. */
  confidence: EvidenceConfidence;
  /** 사람이 최종 확인해야 하는 이유입니다. */
  needsCheck: string;
}
