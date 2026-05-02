import type { EvidenceAuthority, EvidenceSourceType } from './evidence.js';

/** 지식 회로 노드 사이에 저장할 수 있는 관계 유형 목록입니다. */
export const knowledgeCircuitRelations = [
  'supports',
  'implements',
  'overrides',
  'contradicts',
  'explains',
] as const;

/** 지식 회로에서 두 근거 노드가 어떤 의미로 연결되는지 나타냅니다. */
export type KnowledgeCircuitRelation = (typeof knowledgeCircuitRelations)[number];

/** Discord 검토 결과가 지식 회로 피드백에 어떤 방향으로 반영되는지 나타냅니다. */
export type KnowledgeCircuitFeedbackOutcome = 'used' | 'approved' | 'edited' | 'rejected';

/**
 * 지식 회로가 영속 저장소에 보관하는 근거 메타데이터 노드입니다.
 *
 * @remarks
 * 원문 문의, 전체 문서 본문, 전체 코드 내용은 저장하지 않고 출처 식별자, 주제어, 심볼, 내용 해시만 저장합니다.
 */
export interface KnowledgeNode {
  id: string;
  sourceType: EvidenceSourceType;
  authority: EvidenceAuthority;
  title: string;
  sourceRef: string;
  topics: string[];
  symbols: string[];
  contentHash: string;
  lastSeenAt: string;
  lastVerifiedAt?: string;
}

/** 새로 관측한 근거를 지식 회로 노드로 추가하거나 갱신할 때 사용하는 입력값입니다. */
export interface KnowledgeNodeInput {
  sourceType: EvidenceSourceType;
  authority: EvidenceAuthority;
  title: string;
  sourceRef: string;
  topics: string[];
  symbols: string[];
  contentHash: string;
  seenAt?: string;
  verifiedAt?: string;
}

/** 지식 회로 노드 사이의 방향성 관계와 가중치입니다. */
export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: KnowledgeCircuitRelation;
  weight: number;
  confidence: number;
  updatedAt: string;
}

/** 지식 회로 관계를 새로 만들거나 갱신할 때 사용하는 입력값입니다. */
export interface KnowledgeEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  relation: KnowledgeCircuitRelation;
  weight: number;
  confidence: number;
  updatedAt?: string;
}

/**
 * Discord 검토 결과를 지식 회로에 누적하기 위한 피드백 입력값입니다.
 *
 * @remarks
 * `contentHash`가 함께 저장되면 출처 내용이 바뀐 뒤에는 오래된 피드백을 점수에 반영하지 않습니다.
 */
export interface RetrievalFeedbackInput {
  nodeId?: string;
  edgeId?: string;
  contentHash?: string;
  inquiryHash: string;
  outcome: KnowledgeCircuitFeedbackOutcome;
  weightDelta: number;
  createdAt?: string;
}

/** Sheet 검토 row에 저장해 두었다가 Discord 처리 결과를 지식 회로 피드백으로 연결하는 최소 참조입니다. */
export interface KnowledgeCircuitFeedbackRef {
  nodeId: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  contentHash: string;
}

/** 지식 회로 피드백 저장소를 정리할 때 적용하는 보존 정책입니다. */
export interface KnowledgeCircuitCleanupOptions {
  feedbackTtlDays: number;
  maxFeedbackRows: number;
}
