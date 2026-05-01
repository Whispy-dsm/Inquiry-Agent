import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('should parse required environment values', () => {
    // Arrange
    const input = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: 'Whispy inquiries',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      DISCORD_REVIEW_POST_INTERVAL_MS: '1500',
      GEMINI_API_KEY: 'gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash-lite',
      ENABLE_INTERNAL_EVIDENCE_ROUTER: 'true',
      ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH: 'true',
      INTERNAL_EVIDENCE_GITHUB_TOKEN: 'github-token',
      INTERNAL_EVIDENCE_GITHUB_API_BASE_URL: 'https://github.example/api',
      INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS: 'whispy/backend',
      INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS: 'whispy/flutter',
      ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH: 'true',
      INTERNAL_EVIDENCE_NOTION_TOKEN: 'notion-token',
      INTERNAL_EVIDENCE_NOTION_API_BASE_URL: 'https://notion.example',
      INTERNAL_EVIDENCE_NOTION_VERSION: '2026-03-11',
      INTERNAL_EVIDENCE_NOTION_PAGE_IDS: 'page-1,page-2',
      ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK: 'true',
      INTERNAL_EVIDENCE_EMBEDDING_MODEL: 'text-embedding-004',
      INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES: '5',
      ENABLE_KNOWLEDGE_CIRCUIT: 'true',
      KNOWLEDGE_CIRCUIT_DB_PATH: './data/test-circuit.sqlite',
      KNOWLEDGE_CIRCUIT_MAX_HOPS: '1',
      KNOWLEDGE_CIRCUIT_MAX_NODES: '9',
      KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS: '30',
      KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS: '1000',
      GMAIL_FROM_EMAIL: 'support@example.com',
      GMAIL_FROM_NAME: 'Support Team',
      POLL_INTERVAL_MS: '600000',
      ENABLE_FALLBACK_POLLING: 'true',
      WEBHOOK_PORT: '3000',
      WEBHOOK_SECRET: 'shared-secret',
      DRY_RUN_EMAIL: 'true',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.GOOGLE_SHEET_ID).toBe('sheet-id');
    expect(result.DISCORD_REVIEW_POST_INTERVAL_MS).toBe(1500);
    expect(result.POLL_INTERVAL_MS).toBe(600000);
    expect(result.ENABLE_FALLBACK_POLLING).toBe(true);
    expect(result.WEBHOOK_PORT).toBe(3000);
    expect(result.WEBHOOK_SECRET).toBe('shared-secret');
    expect(result.DRY_RUN_EMAIL).toBe(true);
    expect(result.ENABLE_INTERNAL_EVIDENCE_ROUTER).toBe(true);
    expect(result.ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH).toBe(true);
    expect(result.INTERNAL_EVIDENCE_GITHUB_TOKEN).toBe('github-token');
    expect(result.INTERNAL_EVIDENCE_GITHUB_API_BASE_URL).toBe('https://github.example/api');
    expect(result.INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS).toBe('whispy/backend');
    expect(result.INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS).toBe('whispy/flutter');
    expect(result.ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH).toBe(true);
    expect(result.INTERNAL_EVIDENCE_NOTION_TOKEN).toBe('notion-token');
    expect(result.INTERNAL_EVIDENCE_NOTION_API_BASE_URL).toBe('https://notion.example');
    expect(result.INTERNAL_EVIDENCE_NOTION_VERSION).toBe('2026-03-11');
    expect(result.INTERNAL_EVIDENCE_NOTION_PAGE_IDS).toBe('page-1,page-2');
    expect(result.ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK).toBe(true);
    expect(result.INTERNAL_EVIDENCE_EMBEDDING_MODEL).toBe('text-embedding-004');
    expect(result.INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES).toBe(5);
    expect(result.ENABLE_KNOWLEDGE_CIRCUIT).toBe(true);
    expect(result.KNOWLEDGE_CIRCUIT_DB_PATH).toBe('./data/test-circuit.sqlite');
    expect(result.KNOWLEDGE_CIRCUIT_MAX_HOPS).toBe(1);
    expect(result.KNOWLEDGE_CIRCUIT_MAX_NODES).toBe(9);
    expect(result.KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS).toBe(30);
    expect(result.KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS).toBe(1000);
  });

  it('should parse false boolean environment strings as false', () => {
    // Arrange
    const input = {
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: 'Whispy inquiries',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      GEMINI_API_KEY: 'gemini-key',
      GMAIL_FROM_EMAIL: 'support@example.com',
      ENABLE_FALLBACK_POLLING: 'false',
      WEBHOOK_SECRET: 'shared-secret',
      DRY_RUN_EMAIL: 'false',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.ENABLE_FALLBACK_POLLING).toBe(false);
    expect(result.DRY_RUN_EMAIL).toBe(false);
  });

  it('should default optional internal evidence settings', () => {
    // Arrange
    const input = {
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: 'Whispy inquiries',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      GEMINI_API_KEY: 'gemini-key',
      GMAIL_FROM_EMAIL: 'support@example.com',
      WEBHOOK_SECRET: 'shared-secret',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.DISCORD_REVIEW_POST_INTERVAL_MS).toBe(1000);
    expect(result.ENABLE_FALLBACK_POLLING).toBe(true);
    expect(result.ENABLE_INTERNAL_EVIDENCE_ROUTER).toBe(false);
    expect(result.ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH).toBe(false);
    expect(result.ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH).toBe(false);
    expect(result.INTERNAL_EVIDENCE_NOTION_VERSION).toBe('2026-03-11');
    expect(result.ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK).toBe(false);
    expect(result.INTERNAL_EVIDENCE_EMBEDDING_MODEL).toBe('text-embedding-004');
    expect(result.INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES).toBe(8);
    expect(result.ENABLE_KNOWLEDGE_CIRCUIT).toBe(false);
    expect(result.KNOWLEDGE_CIRCUIT_DB_PATH).toBe('./data/knowledge-circuit.sqlite');
    expect(result.KNOWLEDGE_CIRCUIT_MAX_HOPS).toBe(1);
    expect(result.KNOWLEDGE_CIRCUIT_MAX_NODES).toBe(12);
    expect(result.KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS).toBe(90);
    expect(result.KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS).toBe(50000);
  });

  it('should treat blank optional internal evidence values as unset', () => {
    // Arrange
    const input = {
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: 'Whispy inquiries',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      GEMINI_API_KEY: 'gemini-key',
      GMAIL_FROM_EMAIL: 'support@example.com',
      ENABLE_INTERNAL_EVIDENCE_ROUTER: 'true',
      INTERNAL_EVIDENCE_GITHUB_TOKEN: '   ',
      INTERNAL_EVIDENCE_NOTION_TOKEN: '   ',
      INTERNAL_EVIDENCE_NOTION_PAGE_IDS: '   ',
      WEBHOOK_SECRET: 'shared-secret',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.ENABLE_INTERNAL_EVIDENCE_ROUTER).toBe(true);
    expect(result.INTERNAL_EVIDENCE_GITHUB_TOKEN).toBeUndefined();
    expect(result.INTERNAL_EVIDENCE_NOTION_TOKEN).toBeUndefined();
    expect(result.INTERNAL_EVIDENCE_NOTION_PAGE_IDS).toBeUndefined();
  });

  it('should include internal evidence deployment template defaults', () => {
    // Arrange
    const templatePaths = ['docker-compose.yml', 'docker-stack.yml'];

    for (const templatePath of templatePaths) {
      const template = readFileSync(templatePath, 'utf8');

      // Assert
      expect(template).toContain('ENABLE_INTERNAL_EVIDENCE_ROUTER: ${ENABLE_INTERNAL_EVIDENCE_ROUTER:-false}');
      expect(template).toContain('ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH: ${ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH:-false}');
      expect(template).toContain('ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH: ${ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH:-false}');
      expect(template).toContain('INTERNAL_EVIDENCE_NOTION_VERSION: ${INTERNAL_EVIDENCE_NOTION_VERSION:-2026-03-11}');
      expect(template).not.toContain('INTERNAL_EVIDENCE_BACKEND_PATH');
      expect(template).not.toContain('INTERNAL_EVIDENCE_FLUTTER_PATH');
      expect(template).not.toContain('INTERNAL_EVIDENCE_NOTION_PATH');
      expect(template).not.toContain('INTERNAL_EVIDENCE_GITHUB_NOTION_REPOS');
      expect(template).toContain('ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK: ${ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK:-false}');
      expect(template).toContain('INTERNAL_EVIDENCE_EMBEDDING_MODEL: ${INTERNAL_EVIDENCE_EMBEDDING_MODEL:-text-embedding-004}');
      expect(template).toContain('ENABLE_KNOWLEDGE_CIRCUIT: ${ENABLE_KNOWLEDGE_CIRCUIT:-false}');
      expect(template).toContain('KNOWLEDGE_CIRCUIT_DB_PATH: ${KNOWLEDGE_CIRCUIT_DB_PATH:-/app/data/knowledge-circuit.sqlite}');
      expect(template).toContain('KNOWLEDGE_CIRCUIT_MAX_HOPS: ${KNOWLEDGE_CIRCUIT_MAX_HOPS:-1}');
      expect(template).toContain('KNOWLEDGE_CIRCUIT_MAX_NODES: ${KNOWLEDGE_CIRCUIT_MAX_NODES:-12}');
      expect(template).toContain('KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS: ${KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS:-90}');
      expect(template).toContain('KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS: ${KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS:-50000}');
    }
  });
});
