import { describe, expect, it } from 'vitest';
import { KnowledgeCircuitService, hashInquiry } from '../../src/ai/knowledgeCircuit.js';
import { InMemoryKnowledgeCircuitStore, SqliteKnowledgeCircuitStore } from '../../src/ai/knowledgeCircuitStore.js';
import type { EvidenceItem, EvidenceRouteDecision } from '../../src/domain/evidence.js';
import { baseInquiry } from '../fixtures/inquiries.js';

const decision: EvidenceRouteDecision = {
  route: 'need_multi_source_evidence',
  reason: 'Backend and policy evidence are needed.',
  requestedSources: ['backend', 'notion'],
  confidence: 'medium',
  needsCheck: 'Confirm implementation and policy.',
  conflicts: [],
};

describe('KnowledgeCircuitService', () => {
  it('should upsert evidence metadata without storing raw snippets', async () => {
    // Arrange
    const store = new InMemoryKnowledgeCircuitStore();
    const target = new KnowledgeCircuitService(store);
    const evidence = [foundEvidence({
      sourceType: 'notion',
      authority: 'product-policy',
      source: 'https://notion.example/private/login-policy',
      snippet: 'Concurrent login policy mentions secret customer details that must not be persisted.',
      score: 4,
    })];

    // Act
    const result = await target.processEvidence(baseInquiry, decision, evidence);
    const node = await store.findNodeBySource('notion', 'https://notion.example/private/login-policy');

    // Assert
    expect(node).toEqual(expect.objectContaining({
      sourceType: 'notion',
      sourceRef: 'https://notion.example/private/login-policy',
      title: 'notion login policy',
    }));
    expect(JSON.stringify(node)).not.toContain('secret customer details');
    expect(result[0]).toEqual(expect.objectContaining({
      retrievalSignals: expect.arrayContaining(['external', 'keyword', 'circuit']),
      circuitNodeId: node?.id,
      circuitScore: 0,
    }));
  });

  it('should boost evidence that has positive persisted feedback', async () => {
    // Arrange
    const store = new InMemoryKnowledgeCircuitStore();
    const target = new KnowledgeCircuitService(store);
    const evidence = foundEvidence({ source: 'auth/session.ts', score: 1 });
    const firstPass = await target.processEvidence(baseInquiry, decision, [evidence]);

    await store.recordFeedback({
      nodeId: firstPass[0]?.circuitNodeId ?? '',
      inquiryHash: hashInquiry(baseInquiry),
      outcome: 'approved',
      weightDelta: 7,
    });

    // Act
    const result = await target.processEvidence(baseInquiry, decision, [evidence]);

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      score: 8,
      circuitScore: 7,
      retrievalSignals: expect.arrayContaining(['circuit']),
    }));
  });

  it('should surface contradiction edges as circuit conflicts', async () => {
    // Arrange
    const store = new InMemoryKnowledgeCircuitStore();
    const target = new KnowledgeCircuitService(store);
    const backendNode = await store.upsertNode({
      sourceType: 'backend',
      authority: 'implementation-behavior',
      title: 'backend session',
      sourceRef: 'auth/session.ts',
      topics: ['session'],
      symbols: ['SessionService'],
      contentHash: 'backend-hash',
    });
    const notionNode = await store.upsertNode({
      sourceType: 'notion',
      authority: 'product-policy',
      title: 'notion policy',
      sourceRef: 'notion:login',
      topics: ['session'],
      symbols: [],
      contentHash: 'notion-hash',
    });
    await store.upsertEdge({
      fromNodeId: backendNode.id,
      toNodeId: notionNode.id,
      relation: 'contradicts',
      weight: 1,
      confidence: 0.8,
    });

    // Act
    const result = await target.processEvidence(baseInquiry, decision, [foundEvidence({ source: 'auth/session.ts' })]);

    // Assert
    expect(result[0]?.circuitConflicts?.[0]).toContain('contradicts');
  });

  it('should clean old feedback and enforce max feedback rows', async () => {
    // Arrange
    const store = new InMemoryKnowledgeCircuitStore();
    const node = await store.upsertNode({
      sourceType: 'backend',
      authority: 'implementation-behavior',
      title: 'backend session',
      sourceRef: 'auth/session.ts',
      topics: ['session'],
      symbols: [],
      contentHash: 'hash',
    });
    await store.recordFeedback({
      nodeId: node.id,
      inquiryHash: 'old',
      outcome: 'approved',
      weightDelta: 100,
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await store.recordFeedback({
      nodeId: node.id,
      inquiryHash: 'new-1',
      outcome: 'approved',
      weightDelta: 1,
    });
    await store.recordFeedback({
      nodeId: node.id,
      inquiryHash: 'new-2',
      outcome: 'approved',
      weightDelta: 2,
    });

    // Act
    await store.cleanup({ feedbackTtlDays: 90, maxFeedbackRows: 1 });

    // Assert
    expect(await store.feedbackWeightForNode(node.id)).toBe(2);
  });

  it('should persist and clean circuit metadata through sqlite', async () => {
    // Arrange
    const store = new SqliteKnowledgeCircuitStore(':memory:');
    const node = await store.upsertNode({
      sourceType: 'backend',
      authority: 'implementation-behavior',
      title: 'backend session',
      sourceRef: 'auth/session.ts',
      topics: ['session'],
      symbols: ['SessionService'],
      contentHash: 'hash',
    });
    const relatedNode = await store.upsertNode({
      sourceType: 'notion',
      authority: 'product-policy',
      title: 'login policy',
      sourceRef: 'notion:login',
      topics: ['session'],
      symbols: [],
      contentHash: 'policy-hash',
    });
    await store.upsertEdge({
      fromNodeId: node.id,
      toNodeId: relatedNode.id,
      relation: 'supports',
      weight: 0.5,
      confidence: 0.5,
    });
    await store.recordFeedback({
      nodeId: node.id,
      inquiryHash: 'old',
      outcome: 'approved',
      weightDelta: 100,
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await store.recordFeedback({
      nodeId: node.id,
      inquiryHash: 'new',
      outcome: 'approved',
      weightDelta: 3,
    });

    // Act
    await store.cleanup({ feedbackTtlDays: 90, maxFeedbackRows: 10 });
    const storedNode = await store.findNodeBySource('backend', 'auth/session.ts');
    const relatedEdges = await store.findRelatedEdges([node.id]);

    // Assert
    expect(storedNode).toEqual(expect.objectContaining({
      id: node.id,
      topics: ['session'],
      symbols: ['SessionService'],
    }));
    expect(relatedEdges).toContainEqual(expect.objectContaining({ relation: 'supports' }));
    expect(await store.feedbackWeightForNode(node.id)).toBe(3);

    await store.close();
  });

  it('should ignore stale feedback when source content changes', async () => {
    // Arrange
    const store = new InMemoryKnowledgeCircuitStore();
    const target = new KnowledgeCircuitService(store);
    const firstPass = await target.processEvidence(baseInquiry, decision, [foundEvidence({ source: 'auth/session.ts' })]);

    await target.recordFeedbackForRefs({
      refs: [{
        nodeId: firstPass[0]?.circuitNodeId ?? '',
        sourceType: 'backend',
        sourceRef: 'auth/session.ts',
        contentHash: firstPass[0]?.circuitContentHash ?? '',
      }],
      inquiryId: baseInquiry.inquiryId,
      outcome: 'approved',
      weightDelta: 5,
    });

    // Act
    const result = await target.processEvidence(baseInquiry, decision, [
      foundEvidence({
        source: 'auth/session.ts',
        snippet: 'export function concurrentLoginPolicy() { return true; }',
        score: 1,
      }),
    ]);

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      score: 1,
      circuitScore: 0,
    }));
  });
});

function foundEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    sourceType: 'backend',
    authority: 'implementation-behavior',
    title: 'notion login policy',
    source: 'auth/session.ts',
    snippet: 'export function concurrentLoginPolicy() { return false; }',
    status: 'found',
    retrievalSignals: ['external', 'keyword'],
    score: 3,
    ...overrides,
  };
}
