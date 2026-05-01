import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type {
  KnowledgeCircuitCleanupOptions,
  KnowledgeCircuitRelation,
  KnowledgeEdge,
  KnowledgeEdgeInput,
  KnowledgeNode,
  KnowledgeNodeInput,
  RetrievalFeedbackInput,
} from '../domain/knowledgeCircuit.js';

export interface KnowledgeCircuitStore {
  upsertNode(input: KnowledgeNodeInput): Promise<KnowledgeNode>;
  findNodeBySource(sourceType: string, sourceRef: string): Promise<KnowledgeNode | null>;
  upsertEdge(input: KnowledgeEdgeInput): Promise<KnowledgeEdge>;
  findRelatedEdges(nodeIds: string[]): Promise<KnowledgeEdge[]>;
  feedbackWeightForNode(nodeId: string, contentHash?: string): Promise<number>;
  recordFeedback(input: RetrievalFeedbackInput): Promise<void>;
  cleanup(options: KnowledgeCircuitCleanupOptions): Promise<void>;
  close?(): Promise<void>;
}

type NodeRecord = Omit<KnowledgeNode, 'topics' | 'symbols'> & {
  topicsJson: string;
  symbolsJson: string;
};

type EdgeRecord = KnowledgeEdge;

export class InMemoryKnowledgeCircuitStore implements KnowledgeCircuitStore {
  private readonly nodes = new Map<string, KnowledgeNode>();
  private readonly sourceIndex = new Map<string, string>();
  private readonly edges = new Map<string, KnowledgeEdge>();
  private readonly feedback: Array<RetrievalFeedbackInput & { id: string; createdAt: string }> = [];

  async upsertNode(input: KnowledgeNodeInput): Promise<KnowledgeNode> {
    const sourceKey = sourceIndexKey(input.sourceType, input.sourceRef);
    const existingId = this.sourceIndex.get(sourceKey);
    const now = input.seenAt ?? new Date().toISOString();
    const node: KnowledgeNode = {
      id: existingId ?? stableId('node', sourceKey),
      sourceType: input.sourceType,
      authority: input.authority,
      title: input.title,
      sourceRef: input.sourceRef,
      topics: uniqueStrings(input.topics),
      symbols: uniqueStrings(input.symbols),
      contentHash: input.contentHash,
      lastSeenAt: now,
      ...(input.verifiedAt ? { lastVerifiedAt: input.verifiedAt } : {}),
    };

    this.nodes.set(node.id, node);
    this.sourceIndex.set(sourceKey, node.id);
    return node;
  }

  async findNodeBySource(sourceType: string, sourceRef: string): Promise<KnowledgeNode | null> {
    const id = this.sourceIndex.get(sourceIndexKey(sourceType, sourceRef));
    return id ? this.nodes.get(id) ?? null : null;
  }

  async upsertEdge(input: KnowledgeEdgeInput): Promise<KnowledgeEdge> {
    const id = stableId('edge', `${input.fromNodeId}:${input.toNodeId}:${input.relation}`);
    const edge: KnowledgeEdge = {
      id,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      relation: input.relation,
      weight: input.weight,
      confidence: input.confidence,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };

    this.edges.set(id, edge);
    return edge;
  }

  async findRelatedEdges(nodeIds: string[]): Promise<KnowledgeEdge[]> {
    const nodeIdSet = new Set(nodeIds);
    return Array.from(this.edges.values()).filter(
      (edge) => nodeIdSet.has(edge.fromNodeId) || nodeIdSet.has(edge.toNodeId),
    );
  }

  async feedbackWeightForNode(nodeId: string, contentHash?: string): Promise<number> {
    return this.feedback.reduce((total, item) => {
      if (item.nodeId !== nodeId) {
        return total;
      }

      if (contentHash && item.contentHash && item.contentHash !== contentHash) {
        return total;
      }

      return total + item.weightDelta;
    }, 0);
  }

  async recordFeedback(input: RetrievalFeedbackInput): Promise<void> {
    this.feedback.push({
      ...input,
      id: randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  }

  async cleanup(options: KnowledgeCircuitCleanupOptions): Promise<void> {
    const cutoff = Date.now() - options.feedbackTtlDays * 24 * 60 * 60 * 1000;
    const retained = this.feedback
      .filter((item) => Date.parse(item.createdAt) >= cutoff)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, options.maxFeedbackRows);

    this.feedback.splice(0, this.feedback.length, ...retained);
  }
}

type DatabaseSyncLike = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
    run(...values: unknown[]): unknown;
  };
  close(): void;
};

export class SqliteKnowledgeCircuitStore implements KnowledgeCircuitStore {
  private readonly db: DatabaseSyncLike;

  constructor(dbPath: string) {
    const absolutePath = dbPath === ':memory:' ? dbPath : resolve(dbPath);
    if (absolutePath !== ':memory:') {
      mkdirSync(dirname(absolutePath), { recursive: true });
    }
    const require = createRequire(import.meta.url);
    const sqliteModule = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSyncLike };
    this.db = new sqliteModule.DatabaseSync(absolutePath);
    this.initializeSchema();
  }

  async upsertNode(input: KnowledgeNodeInput): Promise<KnowledgeNode> {
    const sourceKey = sourceIndexKey(input.sourceType, input.sourceRef);
    const id = stableId('node', sourceKey);
    const seenAt = input.seenAt ?? new Date().toISOString();
    const topicsJson = JSON.stringify(uniqueStrings(input.topics));
    const symbolsJson = JSON.stringify(uniqueStrings(input.symbols));

    this.db.prepare(`
      INSERT INTO knowledge_nodes (
        id, source_type, authority, title, source_ref, topics_json, symbols_json,
        content_hash, last_seen_at, last_verified_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_type, source_ref) DO UPDATE SET
        authority = excluded.authority,
        title = excluded.title,
        topics_json = excluded.topics_json,
        symbols_json = excluded.symbols_json,
        content_hash = excluded.content_hash,
        last_seen_at = excluded.last_seen_at,
        last_verified_at = COALESCE(excluded.last_verified_at, knowledge_nodes.last_verified_at)
    `).run(
      id,
      input.sourceType,
      input.authority,
      input.title,
      input.sourceRef,
      topicsJson,
      symbolsJson,
      input.contentHash,
      seenAt,
      input.verifiedAt ?? null,
    );

    return this.findNodeBySource(input.sourceType, input.sourceRef) as Promise<KnowledgeNode>;
  }

  async findNodeBySource(sourceType: string, sourceRef: string): Promise<KnowledgeNode | null> {
    const row = this.db.prepare(`
      SELECT
        id,
        source_type AS sourceType,
        authority,
        title,
        source_ref AS sourceRef,
        topics_json AS topicsJson,
        symbols_json AS symbolsJson,
        content_hash AS contentHash,
        last_seen_at AS lastSeenAt,
        last_verified_at AS lastVerifiedAt
      FROM knowledge_nodes
      WHERE source_type = ? AND source_ref = ?
    `).get(sourceType, sourceRef);

    return row ? nodeFromRecord(row as NodeRecord) : null;
  }

  async upsertEdge(input: KnowledgeEdgeInput): Promise<KnowledgeEdge> {
    const id = stableId('edge', `${input.fromNodeId}:${input.toNodeId}:${input.relation}`);
    const updatedAt = input.updatedAt ?? new Date().toISOString();

    this.db.prepare(`
      INSERT INTO knowledge_edges (
        id, from_node_id, to_node_id, relation, weight, confidence, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(from_node_id, to_node_id, relation) DO UPDATE SET
        weight = excluded.weight,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `).run(id, input.fromNodeId, input.toNodeId, input.relation, input.weight, input.confidence, updatedAt);

    return {
      id,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      relation: input.relation,
      weight: input.weight,
      confidence: input.confidence,
      updatedAt,
    };
  }

  async findRelatedEdges(nodeIds: string[]): Promise<KnowledgeEdge[]> {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT
        id,
        from_node_id AS fromNodeId,
        to_node_id AS toNodeId,
        relation,
        weight,
        confidence,
        updated_at AS updatedAt
      FROM knowledge_edges
      WHERE from_node_id IN (${placeholders}) OR to_node_id IN (${placeholders})
    `).all(...nodeIds, ...nodeIds);

    return rows.map((row) => row as EdgeRecord);
  }

  async feedbackWeightForNode(nodeId: string, contentHash?: string): Promise<number> {
    const contentHashClause = contentHash ? 'AND (content_hash = ?)' : '';
    const values = contentHash ? [nodeId, contentHash] : [nodeId];
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(weight_delta), 0) AS weight
      FROM retrieval_feedback
      WHERE node_id = ?
      ${contentHashClause}
    `).get(...values) as { weight?: number } | undefined;

    return Number(row?.weight ?? 0);
  }

  async recordFeedback(input: RetrievalFeedbackInput): Promise<void> {
    this.db.prepare(`
      INSERT INTO retrieval_feedback (
        id, node_id, edge_id, content_hash, inquiry_hash, outcome, weight_delta, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.nodeId ?? null,
      input.edgeId ?? null,
      input.contentHash ?? null,
      input.inquiryHash,
      input.outcome,
      input.weightDelta,
      input.createdAt ?? new Date().toISOString(),
    );
  }

  async cleanup(options: KnowledgeCircuitCleanupOptions): Promise<void> {
    const cutoff = new Date(Date.now() - options.feedbackTtlDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('DELETE FROM retrieval_feedback WHERE created_at < ?').run(cutoff);
    this.db.prepare(`
      DELETE FROM retrieval_feedback
      WHERE id NOT IN (
        SELECT id FROM retrieval_feedback ORDER BY created_at DESC LIMIT ?
      )
    `).run(options.maxFeedbackRows);
    this.db.exec('PRAGMA optimize');
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        authority TEXT NOT NULL,
        title TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        topics_json TEXT NOT NULL,
        symbols_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_verified_at TEXT,
        UNIQUE(source_type, source_ref)
      );
      CREATE TABLE IF NOT EXISTS knowledge_edges (
        id TEXT PRIMARY KEY,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        weight REAL NOT NULL,
        confidence REAL NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(from_node_id, to_node_id, relation)
      );
      CREATE TABLE IF NOT EXISTS retrieval_feedback (
        id TEXT PRIMARY KEY,
        node_id TEXT,
        edge_id TEXT,
        content_hash TEXT,
        inquiry_hash TEXT NOT NULL,
        outcome TEXT NOT NULL,
        weight_delta REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_source ON knowledge_nodes(source_type, source_ref);
      CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from ON knowledge_edges(from_node_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to ON knowledge_edges(to_node_id);
      CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_node ON retrieval_feedback(node_id);
      CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_created ON retrieval_feedback(created_at);
    `);
    this.ensureFeedbackContentHashColumn();
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_content_hash ON retrieval_feedback(content_hash);');
  }

  private ensureFeedbackContentHashColumn(): void {
    const rows = this.db.prepare('PRAGMA table_info(retrieval_feedback)').all() as Array<{ name?: string }>;
    if (!rows.some((row) => row.name === 'content_hash')) {
      this.db.exec('ALTER TABLE retrieval_feedback ADD COLUMN content_hash TEXT;');
    }
  }
}

export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceIndexKey(sourceType: string, sourceRef: string): string {
  return `${sourceType}:${sourceRef}`;
}

function nodeFromRecord(row: NodeRecord): KnowledgeNode {
  return {
    id: row.id,
    sourceType: row.sourceType,
    authority: row.authority,
    title: row.title,
    sourceRef: row.sourceRef,
    topics: parseStringArray(row.topicsJson),
    symbols: parseStringArray(row.symbolsJson),
    contentHash: row.contentHash,
    lastSeenAt: row.lastSeenAt,
    ...(row.lastVerifiedAt ? { lastVerifiedAt: row.lastVerifiedAt } : {}),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
