import { describe, expect, it, vi } from 'vitest';
import { createInternalEvidenceProviderFromEnv, createWorkerApp } from '../src/worker.js';
import { baseInquiry } from './fixtures/inquiries.js';

describe('createWorkerApp', () => {
  it('should start the bot and webhook server without polling by default', async () => {
    // Arrange
    const start = vi.fn().mockResolvedValue(undefined);
    const startWebhook = vi.fn().mockResolvedValue(undefined);
    const pollOnce = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue({}) as typeof setInterval;
    const target = createWorkerApp({
      bot: {
        start,
        client: { on },
      } as never,
      workflow: { pollOnce } as never,
      webhookServer: { start: startWebhook },
      interactionHandler: vi.fn(),
      enableFallbackPolling: false,
      intervalMs: 30000,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      setIntervalFn,
    });

    // Act
    await target.start();

    // Assert
    expect(start).toHaveBeenCalledOnce();
    expect(startWebhook).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    expect(pollOnce).not.toHaveBeenCalled();
    expect(setIntervalFn).not.toHaveBeenCalled();
  });

  it('should run fallback polling only when enabled', async () => {
    // Arrange
    const start = vi.fn().mockResolvedValue(undefined);
    const startWebhook = vi.fn().mockResolvedValue(undefined);
    const pollOnce = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const setIntervalFn = vi.fn().mockReturnValue({}) as typeof setInterval;
    const target = createWorkerApp({
      bot: {
        start,
        client: { on },
      } as never,
      workflow: { pollOnce } as never,
      webhookServer: { start: startWebhook },
      interactionHandler: vi.fn(),
      enableFallbackPolling: true,
      intervalMs: 30000,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      setIntervalFn,
    });

    // Act
    await target.start();

    // Assert
    expect(pollOnce).toHaveBeenCalledOnce();
    expect(setIntervalFn).toHaveBeenCalledOnce();
  });
});

describe('createInternalEvidenceProviderFromEnv', () => {
  const baseEnv = {
    ENABLE_INTERNAL_EVIDENCE_ROUTER: false,
    ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH: false,
    INTERNAL_EVIDENCE_GITHUB_TOKEN: undefined,
    INTERNAL_EVIDENCE_GITHUB_API_BASE_URL: undefined,
    INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS: undefined,
    INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS: undefined,
    ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH: false,
    INTERNAL_EVIDENCE_NOTION_TOKEN: undefined,
    INTERNAL_EVIDENCE_NOTION_API_BASE_URL: undefined,
    INTERNAL_EVIDENCE_NOTION_VERSION: '2026-03-11',
    INTERNAL_EVIDENCE_NOTION_PAGE_IDS: undefined,
    ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK: false,
    INTERNAL_EVIDENCE_EMBEDDING_MODEL: 'text-embedding-004',
    INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES: 8,
    ENABLE_KNOWLEDGE_CIRCUIT: false,
    KNOWLEDGE_CIRCUIT_DB_PATH: './data/knowledge-circuit.sqlite',
    KNOWLEDGE_CIRCUIT_MAX_HOPS: 1,
    KNOWLEDGE_CIRCUIT_MAX_NODES: 12,
    KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS: 90,
    KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS: 50000,
    GEMINI_API_KEY: 'gemini-key',
  };

  it('should leave internal evidence disabled by default', () => {
    // Act
    const result = createInternalEvidenceProviderFromEnv(baseEnv);

    // Assert
    expect(result).toBeUndefined();
  });

  it('should create a fail-closed provider when enabled without source providers', async () => {
    // Arrange
    const provider = createInternalEvidenceProviderFromEnv({
      ...baseEnv,
      ENABLE_INTERNAL_EVIDENCE_ROUTER: true,
    });

    // Act
    const result = await provider?.findEvidence(baseInquiry, {
      route: 'need_multi_source_evidence',
      reason: '내부 근거가 필요합니다.',
      requestedSources: ['backend', 'flutter', 'notion'],
      confidence: 'medium',
      needsCheck: '소스별 확인이 필요합니다.',
      conflicts: [],
    });

    // Assert
    expect(result).toEqual([
      expect.objectContaining({ sourceType: 'backend', status: 'unavailable' }),
      expect.objectContaining({ sourceType: 'flutter', status: 'unavailable' }),
      expect.objectContaining({ sourceType: 'notion', status: 'unavailable' }),
    ]);
  });

  it('should create a provider with the knowledge circuit when enabled', () => {
    // Arrange
    const provider = createInternalEvidenceProviderFromEnv({
      ...baseEnv,
      ENABLE_INTERNAL_EVIDENCE_ROUTER: true,
      ENABLE_KNOWLEDGE_CIRCUIT: true,
      KNOWLEDGE_CIRCUIT_DB_PATH: ':memory:',
    });

    // Assert
    expect(provider).toBeDefined();
  });
});
