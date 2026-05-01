import type { EvidenceAuthority, EvidenceSourceType } from './evidence.js';

export const knowledgeCircuitRelations = [
  'supports',
  'implements',
  'overrides',
  'contradicts',
  'explains',
] as const;

export type KnowledgeCircuitRelation = (typeof knowledgeCircuitRelations)[number];

export type KnowledgeCircuitFeedbackOutcome = 'used' | 'approved' | 'edited' | 'rejected';

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

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: KnowledgeCircuitRelation;
  weight: number;
  confidence: number;
  updatedAt: string;
}

export interface KnowledgeEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  relation: KnowledgeCircuitRelation;
  weight: number;
  confidence: number;
  updatedAt?: string;
}

export interface RetrievalFeedbackInput {
  nodeId?: string;
  edgeId?: string;
  contentHash?: string;
  inquiryHash: string;
  outcome: KnowledgeCircuitFeedbackOutcome;
  weightDelta: number;
  createdAt?: string;
}

export interface KnowledgeCircuitFeedbackRef {
  nodeId: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  contentHash: string;
}

export interface KnowledgeCircuitCleanupOptions {
  feedbackTtlDays: number;
  maxFeedbackRows: number;
}
