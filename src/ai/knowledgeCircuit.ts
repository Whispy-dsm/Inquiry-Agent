import { createHash } from 'node:crypto';
import type { EvidenceItem, EvidenceRouteDecision } from '../domain/evidence.js';
import type { Inquiry } from '../domain/inquiry.js';
import type { KnowledgeCircuitFeedbackRef, KnowledgeEdge } from '../domain/knowledgeCircuit.js';
import { contentHash, type KnowledgeCircuitStore } from './knowledgeCircuitStore.js';

/**
 * 지식 회로가 한 번에 후처리할 근거 수와 관계 탐색 깊이를 제한하는 옵션입니다.
 *
 * @remarks
 * 값이 커질수록 저장소 조회량이 늘어나므로 Discord 검토 메시지 생성 경로에서는 작은 기본값을 유지합니다.
 */
export type KnowledgeCircuitOptions = {
  maxNodes?: number;
  maxHops?: number;
};

type CircuitEvidence = {
  item: EvidenceItem;
  nodeId?: string;
  contentHash?: string;
  circuitScore: number;
  conflicts: string[];
};

/**
 * 내부 근거 metadata와 Discord 피드백을 이용해 근거 순서와 충돌 정보를 보강합니다.
 *
 * @remarks
 * 원문 근거 본문을 저장하지 않고 안정적인 출처 참조와 content hash만 지식 회로 저장소에 남깁니다.
 */
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

  /**
   * 수집된 내부 근거를 지식 회로 metadata로 보강하고 점수 순서로 정렬합니다.
   *
   * @remarks
   * `found` 근거만 저장소 예산을 사용하며, `empty`와 `unavailable` 근거는 원래 항목을 유지합니다.
   */
  async processEvidence(
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
    evidence: EvidenceItem[],
  ): Promise<EvidenceItem[]> {
    const candidates: Array<{ index: number; item: EvidenceItem }> = [];

    for (const [index, item] of evidence.entries()) {
      if (item.status === 'found' && candidates.length < this.maxNodes) {
        candidates.push({ index, item });
      }
    }

    const candidateIndexSet = new Set(candidates.map((candidate) => candidate.index));
    const processed = await Promise.all(
      candidates.map(({ item }) => this.processEvidenceItem(inquiry, decision, item)),
    );
    const untouched: CircuitEvidence[] = evidence
      .filter((_, index) => !candidateIndexSet.has(index))
      .map((item) => ({ item, circuitScore: 0, conflicts: [] }));

    return [...processed, ...untouched]
      .map(({ item, circuitScore, nodeId, contentHash, conflicts }) => annotateEvidenceItem(item, circuitScore, nodeId, contentHash, conflicts))
      .sort(compareEvidence);
  }

  /**
   * 단일 근거 항목에 대한 검토 결과를 지식 회로 피드백으로 저장합니다.
   *
   * @remarks
   * 현재 저장소에 같은 출처 노드가 있을 때만 내용 해시를 함께 저장해 낡은 피드백을 나중에 걸러냅니다.
   */
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

  /**
   * Sheet에 저장된 근거 참조 목록을 이용해 Discord 처리 결과를 지식 회로 피드백으로 기록합니다.
   *
   * @remarks
   * 노드 id 또는 내용 해시가 현재 저장소 값과 다르면 출처가 바뀐 것으로 보고 피드백을 무시합니다.
   */
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

    const itemContentHash = evidenceContentHash(item);
    const node = await this.store.upsertNode({
      sourceType: item.sourceType,
      authority: item.authority,
      title: item.title,
      sourceRef: item.source,
      topics: extractTopics(`${item.title}\n${item.source}`),
      symbols: extractSymbols(`${item.title}\n${item.source}`),
      contentHash: itemContentHash,
    });
    const feedbackWeight = await this.store.feedbackWeightForNode(node.id, node.contentHash);
    const relatedEdges = await this.findRelatedEdgesWithinHops(node.id);
    const edgeBoost = relatedEdges
      .filter((edge) => edge.relation === 'supports' || edge.relation === 'implements' || edge.relation === 'explains')
      .reduce((total, edge) => total + edge.weight * edge.confidence, 0);
    const conflicts = relatedEdges
      .filter((edge) => edge.relation === 'contradicts' || edge.relation === 'overrides')
      .map((edge) => `Knowledge circuit ${edge.relation} edge: ${edge.fromNodeId} -> ${edge.toNodeId}`);

    return {
      item,
      nodeId: node.id,
      contentHash: node.contentHash,
      circuitScore: roundScore(feedbackWeight + edgeBoost),
      conflicts,
    };
  }

  private async findRelatedEdgesWithinHops(nodeId: string): Promise<KnowledgeEdge[]> {
    if (this.maxHops <= 0) {
      return [];
    }

    const edgesById = new Map<string, KnowledgeEdge>();
    const visitedNodes = new Set([nodeId]);
    let frontier = new Set([nodeId]);

    for (let hop = 0; hop < this.maxHops && frontier.size > 0; hop += 1) {
      const relatedEdges = await this.store.findRelatedEdges(Array.from(frontier));
      const nextFrontier = new Set<string>();

      for (const edge of relatedEdges) {
        edgesById.set(edge.id, edge);

        for (const candidateNodeId of [edge.fromNodeId, edge.toNodeId]) {
          if (!visitedNodes.has(candidateNodeId)) {
            visitedNodes.add(candidateNodeId);
            nextFrontier.add(candidateNodeId);
          }
        }
      }

      frontier = nextFrontier;
    }

    return Array.from(edgesById.values());
  }
}

/**
 * 문의 유형과 본문을 개인정보가 직접 드러나지 않는 안정적인 hash로 변환합니다.
 *
 * @param inquiry - 피드백과 연결할 문의
 * @returns 문의 유형과 정규화된 본문으로 만든 SHA-256 hash
 */
export function hashInquiry(inquiry: Inquiry): string {
  return createHash('sha256')
    .update(`${inquiry.type}\n${inquiry.message.trim().toLowerCase()}`)
    .digest('hex');
}

function annotateEvidenceItem(
  item: EvidenceItem,
  circuitScore: number,
  nodeId: string | undefined,
  itemContentHash: string | undefined,
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
    ...(nodeId && itemContentHash ? { circuitNodeId: nodeId, circuitContentHash: itemContentHash } : {}),
    ...(conflicts.length > 0 ? { circuitConflicts: conflicts } : {}),
  };
}

function evidenceContentHash(item: EvidenceItem): string {
  return item.circuitContentHash ?? contentHash(`${item.sourceType}\n${item.source}\n${item.title}`);
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
