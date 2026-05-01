import { createHash } from 'node:crypto';
import type { EvidenceItem, EvidenceRouteDecision } from '../domain/evidence.js';
import type { Inquiry } from '../domain/inquiry.js';
import type { KnowledgeCircuitFeedbackRef } from '../domain/knowledgeCircuit.js';
import { contentHash, type KnowledgeCircuitStore } from './knowledgeCircuitStore.js';

export type KnowledgeCircuitOptions = {
  maxNodes?: number;
  maxHops?: number;
};

type CircuitEvidence = {
  item: EvidenceItem;
  nodeId?: string;
  circuitScore: number;
  conflicts: string[];
};

export class KnowledgeCircuitService {
  private readonly maxNodes: number;
  private readonly maxHops: number;

  constructor(
    private readonly store: KnowledgeCircuitStore,
    options: KnowledgeCircuitOptions = {},
  ) {
    this.maxNodes = options.maxNodes ?? 12;
    this.maxHops = options.maxHops ?? 1;
  }

  async processEvidence(
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
    evidence: EvidenceItem[],
  ): Promise<EvidenceItem[]> {
    const candidates = evidence.slice(0, this.maxNodes);
    const processed = await Promise.all(
      candidates.map((item) => this.processEvidenceItem(inquiry, decision, item)),
    );
    const untouched: CircuitEvidence[] = evidence
      .slice(this.maxNodes)
      .map((item) => ({ item, circuitScore: 0, conflicts: [] }));

    return [...processed, ...untouched]
      .map(({ item, circuitScore, nodeId, conflicts }) => annotateEvidenceItem(item, circuitScore, nodeId, conflicts))
      .sort(compareEvidence);
  }

  async recordFeedback(args: {
    evidence: EvidenceItem;
    inquiry: Inquiry;
    outcome: 'used' | 'approved' | 'edited' | 'rejected';
    weightDelta: number;
  }): Promise<void> {
    const existing = await this.store.findNodeBySource(args.evidence.sourceType, args.evidence.source);

    await this.store.recordFeedback({
      ...(existing ? { nodeId: existing.id } : {}),
      ...(existing ? { contentHash: existing.contentHash } : {}),
      inquiryHash: hashInquiry(args.inquiry),
      outcome: args.outcome,
      weightDelta: args.weightDelta,
    });
  }

  async recordFeedbackForRefs(args: {
    refs: readonly KnowledgeCircuitFeedbackRef[];
    inquiryId: string;
    outcome: 'used' | 'approved' | 'edited' | 'rejected';
    weightDelta: number;
  }): Promise<void> {
    await Promise.all(args.refs.map(async (ref) => {
      const currentNode = await this.store.findNodeBySource(ref.sourceType, ref.sourceRef);

      if (!currentNode || currentNode.id !== ref.nodeId || currentNode.contentHash !== ref.contentHash) {
        return;
      }

      await this.store.recordFeedback({
        nodeId: ref.nodeId,
        contentHash: ref.contentHash,
        inquiryHash: createHash('sha256').update(args.inquiryId).digest('hex'),
        outcome: args.outcome,
        weightDelta: args.weightDelta,
      });
    }));
  }

  private async processEvidenceItem(
    _inquiry: Inquiry,
    _decision: EvidenceRouteDecision,
    item: EvidenceItem,
  ): Promise<CircuitEvidence> {
    if (item.status !== 'found') {
      return { item, circuitScore: 0, conflicts: [] };
    }

    const node = await this.store.upsertNode({
      sourceType: item.sourceType,
      authority: item.authority,
      title: item.title,
      sourceRef: item.source,
      topics: extractTopics(`${item.title}\n${item.source}`),
      symbols: extractSymbols(`${item.title}\n${item.source}`),
      contentHash: contentHash(`${item.sourceType}\n${item.source}\n${item.title}\n${item.snippet}`),
    });
    const feedbackWeight = await this.store.feedbackWeightForNode(node.id, node.contentHash);
    const relatedEdges = this.maxHops > 0 ? await this.store.findRelatedEdges([node.id]) : [];
    const edgeBoost = relatedEdges
      .filter((edge) => edge.relation === 'supports' || edge.relation === 'implements' || edge.relation === 'explains')
      .reduce((total, edge) => total + edge.weight * edge.confidence, 0);
    const conflicts = relatedEdges
      .filter((edge) => edge.relation === 'contradicts' || edge.relation === 'overrides')
      .map((edge) => `Knowledge circuit ${edge.relation} edge: ${edge.fromNodeId} -> ${edge.toNodeId}`);

    return {
      item,
      nodeId: node.id,
      circuitScore: roundScore(feedbackWeight + edgeBoost),
      conflicts,
    };
  }
}

export function hashInquiry(inquiry: Inquiry): string {
  return createHash('sha256')
    .update(`${inquiry.type}\n${inquiry.message.trim().toLowerCase()}`)
    .digest('hex');
}

function annotateEvidenceItem(
  item: EvidenceItem,
  circuitScore: number,
  nodeId: string | undefined,
  conflicts: string[],
): EvidenceItem {
  if (!nodeId && circuitScore === 0 && conflicts.length === 0) {
    return item;
  }

  const retrievalSignals = addSignal(item.retrievalSignals, 'circuit');

  return {
    ...item,
    retrievalSignals,
    score: roundScore((item.score ?? 0) + circuitScore),
    circuitScore,
    ...(nodeId ? { circuitNodeId: nodeId, circuitContentHash: contentHash(`${item.sourceType}\n${item.source}\n${item.title}\n${item.snippet}`) } : {}),
    ...(conflicts.length > 0 ? { circuitConflicts: conflicts } : {}),
  };
}

function compareEvidence(left: EvidenceItem, right: EvidenceItem): number {
  return (right.score ?? 0) - (left.score ?? 0);
}

function addSignal(
  signals: EvidenceItem['retrievalSignals'],
  signal: 'circuit',
): NonNullable<EvidenceItem['retrievalSignals']> {
  return Array.from(new Set([...(signals ?? []), signal]));
}

function extractTopics(text: string): string[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}_/-]+/gu), (match) => match[0].toLowerCase())
    .filter((term) => term.length >= 2)
    .slice(0, 40);
}

function extractSymbols(text: string): string[] {
  const headingSymbols = Array.from(text.matchAll(/^#{1,3}\s+(.+)$/gm), (match) => match[1]?.trim() ?? '');
  const codeSymbols = Array.from(
    text.matchAll(/\b(?:class|interface|type|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g),
    (match) => match[1] ?? '',
  );

  return Array.from(new Set([...headingSymbols, ...codeSymbols].filter(Boolean))).slice(0, 40);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
