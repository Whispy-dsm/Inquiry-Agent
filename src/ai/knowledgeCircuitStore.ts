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

/**
 * 지식 회로 메타데이터를 저장하고 조회하는 저장소 포트입니다.
 *
 * @remarks
 * 구현체는 원문 근거 본문을 저장하지 않고, 노드/간선 메타데이터와 Discord 검토 피드백만 저장해야 합니다.
 */
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

/**
 * 테스트와 비영속 실행에 사용하는 메모리 기반 지식 회로 저장소입니다.
 *
 * @remarks
 * 프로세스가 종료되면 모든 노드, 간선, 피드백이 사라지므로 운영의 장기 피드백 학습에는 SQLite 저장소를 사용합니다.
 */
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

/**
 * `node:sqlite`를 사용하는 영속 지식 회로 저장소입니다.
 *
 * @remarks
 * 저장소 디렉터리가 없으면 생성하고, 시작 시 필요한 스키마와 인덱스를 초기화합니다. Node 22의 `node:sqlite`는
 * 실험 기능 경고를 낼 수 있지만 저장소 동작 자체는 동기 API를 감싼 Promise 포트로 노출합니다.
 */
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

/**
 * 같은 입력값에 대해 항상 같은 짧은 식별자를 생성합니다.
 *
 * @param prefix - id 종류를 구분하는 접두사
 * @param value - hash 대상이 되는 안정적인 원문 값
 * @returns `{prefix}_{sha256 앞 32자리}` 형태의 식별자
 */
export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

/**
 * 출처 내용 변경 여부를 비교하기 위한 SHA-256 해시를 생성합니다.
 *
 * @param value - 해시 대상 문자열
 * @returns 전체 SHA-256 16진수 digest
 */
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
