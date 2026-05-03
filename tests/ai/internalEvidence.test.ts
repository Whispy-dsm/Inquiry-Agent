import { describe, expect, it, vi } from 'vitest';
import {
  CompositeInternalEvidenceProvider,
  GeminiEmbeddingEvidenceReranker,
  GitHubCodeSearchEvidenceSource,
  NotionApiEvidenceSource,
  createInternalEvidenceProvider,
} from '../../src/ai/internalEvidence.js';
import type { EvidenceRouteDecision } from '../../src/domain/evidence.js';
import { baseInquiry } from '../fixtures/inquiries.js';

const routeDecision: EvidenceRouteDecision = {
  route: 'need_backend_evidence',
  reason: 'Server login session policy affects the answer.',
  requestedSources: ['backend'],
  confidence: 'medium',
  needsCheck: 'Server implementation must be checked.',
  conflicts: [],
};

const notionRouteDecision: EvidenceRouteDecision = {
  ...routeDecision,
  route: 'need_notion_policy',
  requestedSources: ['notion'],
  reason: 'Product policy and customer-facing feature definition are needed.',
  needsCheck: 'Notion policy should be checked.',
};

const notificationRouteDecision: EvidenceRouteDecision = {
  route: 'need_multi_source_evidence',
  reason: 'Check Flutter notification permission state and Backend FCM push delivery.',
  requestedSources: ['backend', 'flutter', 'notion'],
  confidence: 'medium',
  needsCheck: 'Verify notification permission and push delivery evidence.',
  conflicts: [],
};

const profileImageRouteDecision: EvidenceRouteDecision = {
  route: 'need_multi_source_evidence',
  reason: [
    'The user is asking about data recovery after a previous profile photo update.',
    'Product knowledge confirms profile photos can be modified, but it is silent on history or restoration.',
    'Check the backend data model for image storage and the Flutter client profile update flow.',
  ].join(' '),
  requestedSources: ['backend', 'flutter', 'notion'],
  confidence: 'medium',
  needsCheck: [
    'Verify if the backend stores previous profile image URLs.',
    'Verify if the client overwrites the existing image resource upon upload.',
  ].join(' '),
  conflicts: [],
};

describe('GitHubCodeSearchEvidenceSource', () => {
  it('should convert GitHub code search results into external evidence items', async () => {
    // Arrange
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            path: 'src/auth/session.ts',
            html_url: 'https://github.example/whispy/backend/blob/main/src/auth/session.ts',
            score: 12.5,
            repository: { full_name: 'whispy/backend' },
            text_matches: [{ fragment: 'export function createSessionToken() {}' }],
          },
        ],
      }),
    });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        token: 'github-token',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('https://github.example/api/search/code?q='),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer github-token',
        }),
      }),
    );
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'backend',
      source: 'https://github.example/whispy/backend/blob/main/src/auth/session.ts',
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external', 'keyword']),
    }));
  });

  it('should fetch matched GitHub file content and add AST signals in memory', async () => {
    // Arrange
    const content = [
      'export function concurrentLoginPolicy() {',
      '  return { allowed: false };',
      '}',
    ].join('\n');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'src/auth/session.ts',
              url: 'https://github.example/api/repos/whispy/backend/contents/src/auth/session.ts',
              html_url: 'https://github.example/whispy/backend/blob/main/src/auth/session.ts',
              repository: { full_name: 'whispy/backend' },
              text_matches: [{ fragment: 'session policy' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'concurrent login policy' },
      routeDecision,
    );

    // Assert
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://github.example/api/repos/whispy/backend/contents/src/auth/session.ts',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
        }),
      }),
    );
    expect(result[0]).toEqual(expect.objectContaining({
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external', 'keyword', 'ast']),
      snippet: expect.stringContaining('concurrentLoginPolicy'),
      circuitContentHash: expect.any(String),
    }));
  }, 15_000);

  it('should label fetched GitHub content as symbol when compiler AST is disabled', async () => {
    // Arrange
    const content = 'export function concurrentLoginPolicy() { return true; }';
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'src/auth/session.ts',
              url: 'https://github.example/api/repos/whispy/backend/contents/src/auth/session.ts',
              repository: { full_name: 'whispy/backend' },
              text_matches: [{ fragment: 'session policy' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        fetchFn,
        useTypeScriptCompiler: false,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'concurrent login policy' },
      routeDecision,
    );

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external', 'keyword', 'symbol']),
    }));
    expect(result[0]?.retrievalSignals).not.toContain('ast');
  });

  it('should not send raw customer tokens to GitHub search', async () => {
    // Arrange
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    await target.findEvidence(
      {
        ...baseInquiry,
        name: 'Private Customer',
        email: 'private.customer@example.com',
        message: 'private.customer@example.com account abc-12345 concurrent login possible?',
      },
      routeDecision,
    );

    // Assert
    const url = String(fetchFn.mock.calls[0]?.[0]);
    const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    expect(query).toContain('repo:whispy/backend');
    expect(query).toContain('auth');
    expect(query).toContain('login');
    expect(query).not.toContain('private.customer');
    expect(query).not.toContain('example.com');
    expect(query).not.toContain('abc-12345');
  });

  it('should return unavailable evidence on GitHub search failures', async () => {
    // Arrange
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        fetchFn: vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ message: 'rate limited' }),
        }),
      },
    );

    // Act
    const result = await target.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'backend',
        status: 'unavailable',
        snippet: expect.stringContaining('rate limited'),
      }),
    ]);
  });

  it('should ignore low-signal task documents for notification evidence', async () => {
    // Arrange
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            path: 'tasks/todo.md',
            html_url: 'https://github.example/whispy/backend/blob/main/tasks/todo.md',
            repository: { full_name: 'whispy/backend' },
            text_matches: [{ fragment: 'notification push FCM investigation task' }],
          },
        ],
      }),
    });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'App notification is enabled but push does not arrive.' },
      notificationRouteDecision,
    );

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'backend',
        status: 'empty',
        source: 'github:whispy/backend',
      }),
    ]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('should keep fetched notification implementation evidence when focused terms match', async () => {
    // Arrange
    const content = [
      'export function sendFcmPushNotification(deviceToken: string) {',
      '  return firebaseMessaging.send({ token: deviceToken });',
      '}',
    ].join('\n');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'src/notifications/fcm.ts',
              url: 'https://github.example/api/repos/whispy/backend/contents/src/notifications/fcm.ts',
              html_url: 'https://github.example/whispy/backend/blob/main/src/notifications/fcm.ts',
              repository: { full_name: 'whispy/backend' },
              text_matches: [{ fragment: 'sendFcmPushNotification' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'App notification is enabled but push does not arrive.' },
      notificationRouteDecision,
    );

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'backend',
      status: 'found',
      source: 'https://github.example/whispy/backend/blob/main/src/notifications/fcm.ts',
      snippet: expect.stringContaining('sendFcmPushNotification'),
      retrievalSignals: expect.arrayContaining(['external', 'keyword', 'ast']),
    }));
  });

  it('should search route narrative terms for new inquiry types without a dedicated intent rule', async () => {
    // Arrange
    const content = [
      'export class ThemePaletteRepository {',
      '  saveThemePalette() { return true; }',
      '}',
    ].join('\n');
    const routeDecisionWithoutIntentRule: EvidenceRouteDecision = {
      route: 'need_backend_evidence',
      reason: 'ThemePalette persistence behavior should be checked.',
      requestedSources: ['backend'],
      confidence: 'medium',
      needsCheck: 'Verify ThemePaletteRepository save behavior.',
      conflicts: [],
    };
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'src/theme/theme-palette.ts',
              url: 'https://github.example/api/repos/whispy/backend/contents/src/theme/theme-palette.ts',
              html_url: 'https://github.example/whispy/backend/blob/main/src/theme/theme-palette.ts',
              repository: { full_name: 'whispy/backend' },
              text_matches: [{ fragment: 'ThemePaletteRepository' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '테마 색상 설정이 저장되나요?' },
      routeDecisionWithoutIntentRule,
    );

    // Assert
    const url = String(fetchFn.mock.calls[0]?.[0]);
    const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    expect(query).toContain('themepalette');
    expect(query).toContain('repo:whispy/backend');
    expect(query).not.toContain('auth');
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'backend',
      status: 'found',
      snippet: expect.stringContaining('ThemePaletteRepository'),
    }));
  });

  it('should search backend profile image code through route narrative terms', async () => {
    // Arrange
    const content = [
      'public MyProfileResponse execute(ChangeProfileRequest request) {',
      '  User updateUser = user.changeProfile(request.name(), request.profileImageUrl(), request.gender());',
      '  userSavePort.save(updateUser);',
      '}',
    ].join('\n');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'src/main/java/whispy_server/whispy/domain/user/application/service/ChangeProfileService.java',
              url: 'https://github.example/api/repos/whispy/backend/contents/src/main/java/whispy_server/whispy/domain/user/application/service/ChangeProfileService.java',
              html_url: 'https://github.example/whispy/backend/blob/main/src/main/java/whispy_server/whispy/domain/user/application/service/ChangeProfileService.java',
              repository: { full_name: 'whispy/backend' },
              text_matches: [{ fragment: 'request.profileImageUrl()' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '프로필 사진을 새로 업로드했는데 이전 사진 복구가 가능한가요?' },
      profileImageRouteDecision,
    );

    // Assert
    const url = String(fetchFn.mock.calls[0]?.[0]);
    const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    expect(query).toContain('profile');
    expect(query).toContain('repo:whispy/backend');
    expect(query).not.toContain('auth');
    expect(query).not.toContain('account');
    expect(query).not.toContain('user');
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'backend',
      status: 'found',
      source: 'https://github.example/whispy/backend/blob/main/src/main/java/whispy_server/whispy/domain/user/application/service/ChangeProfileService.java',
      snippet: expect.stringContaining('profileImageUrl'),
      retrievalSignals: expect.arrayContaining(['external', 'keyword']),
    }));
  });

  it('should reject unrelated backend files that only match one generic narrative term', async () => {
    // Arrange
    const content = [
      'private static final int CURRENT_PERIOD_OFFSET = 0;',
      'private static final int PREVIOUS_PERIOD_OFFSET = 1;',
      'private static final int TWO_PERIODS_AGO_OFFSET = 2;',
    ].join('\n');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{
            path: 'src/main/java/whispy_server/whispy/domain/statistics/sleep/comparison/application/service/GetSleepPeriodComparisonService.java',
            url: 'https://github.example/api/repos/whispy/backend/contents/src/main/java/whispy_server/whispy/domain/statistics/sleep/comparison/application/service/GetSleepPeriodComparisonService.java',
            html_url: 'https://github.example/whispy/backend/blob/main/src/main/java/whispy_server/whispy/domain/statistics/sleep/comparison/application/service/GetSleepPeriodComparisonService.java',
            repository: { full_name: 'whispy/backend' },
            text_matches: [{ fragment: 'PREVIOUS_PERIOD_OFFSET' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      });
    fetchFn.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
    const target = new GitHubCodeSearchEvidenceSource(
      'backend',
      [{ owner: 'whispy', repo: 'backend' }],
      'implementation-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '프로필 사진을 새로 업로드했는데 이전 사진 복구가 가능한가요?' },
      profileImageRouteDecision,
    );

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'backend',
        status: 'empty',
      }),
    ]);
  });

  it('should search flutter profile image upload and delete code through route narrative terms', async () => {
    // Arrange
    const content = [
      'if (profileImageUrl.isNotEmpty) {',
      '  await _repository.deleteProfileImageByUrl(profileImageUrl);',
      '}',
      'profileImageUrl = await _repository.uploadProfileImage(imageBytes: selectedImageBytes, fileName: fileName);',
    ].join('\n');
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              path: 'lib/features/account/presentation/bloc/edit_profile_bloc.dart',
              url: 'https://github.example/api/repos/whispy/flutter/contents/lib/features/account/presentation/bloc/edit_profile_bloc.dart',
              html_url: 'https://github.example/whispy/flutter/blob/main/lib/features/account/presentation/bloc/edit_profile_bloc.dart',
              repository: { full_name: 'whispy/flutter' },
              text_matches: [{ fragment: 'uploadProfileImage' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(content, 'utf8'),
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      });
    const target = new GitHubCodeSearchEvidenceSource(
      'flutter',
      [{ owner: 'whispy', repo: 'flutter' }],
      'client-behavior',
      {
        apiBaseUrl: 'https://github.example/api',
        fetchFn,
      },
    );

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '프로필 사진을 새로 업로드했는데 이전 사진 복구가 가능한가요?' },
      profileImageRouteDecision,
    );

    // Assert
    const url = String(fetchFn.mock.calls[0]?.[0]);
    const query = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    expect(query).toContain('profile');
    expect(query).toContain('repo:whispy/flutter');
    expect(query).not.toContain('auth');
    expect(query).not.toContain('account');
    expect(query).not.toContain('user');
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'flutter',
      status: 'found',
      source: 'https://github.example/whispy/flutter/blob/main/lib/features/account/presentation/bloc/edit_profile_bloc.dart',
      snippet: expect.stringContaining('uploadProfileImage'),
      retrievalSignals: expect.arrayContaining(['external', 'keyword']),
    }));
  });
});

describe('NotionApiEvidenceSource', () => {
  it('should search Notion pages and fetch page block content as policy evidence', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionPage('page-1', 'Login Policy', 'https://notion.example/login-policy'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionParagraph('block-1', 'Concurrent login is not allowed for one account session.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'Can users use concurrent login?' },
      notionRouteDecision,
    );

    // Assert
    expect(fetchFn).toHaveBeenCalledWith(
      'https://notion.example/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer notion-token',
          'Notion-Version': '2026-03-11',
        }),
      }),
    );
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'notion',
      authority: 'product-policy',
      source: 'https://notion.example/login-policy',
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external', 'keyword']),
      snippet: expect.stringContaining('Concurrent login'),
      circuitContentHash: expect.any(String),
    }));
  });

  it('should follow paginated Notion block children', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => notionPage('page-1', 'Long Login Policy', 'https://notion.example/long-login-policy'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          has_more: true,
          next_cursor: 'cursor-2',
          results: [
            notionParagraph('block-1', 'Introductory policy text.'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          has_more: false,
          next_cursor: null,
          results: [
            notionParagraph('block-2', 'Concurrent login policy appears after the first page of blocks.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      pageIds: 'page-1',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'Can users use concurrent login?' },
      notionRouteDecision,
    );

    // Assert
    expect(String(fetchFn.mock.calls[2]?.[0])).toBe('https://notion.example/v1/blocks/page-1/children?page_size=100&start_cursor=cursor-2');
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'notion',
      status: 'found',
      snippet: expect.stringContaining('after the first page'),
    }));
  });

  it('should not send raw customer tokens to Notion search', async () => {
    // Arrange
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      fetchFn,
    });

    // Act
    await target.findEvidence(
      {
        ...baseInquiry,
        name: 'Private Customer',
        email: 'private.customer@example.com',
        message: 'private.customer@example.com account abc-12345 concurrent login possible?',
      },
      notionRouteDecision,
    );

    // Assert
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.query).toContain('session');
    expect(body.query).toContain('login');
    expect(body.query).not.toContain('private.customer');
    expect(body.query).not.toContain('example.com');
    expect(body.query).not.toContain('abc-12345');
  });

  it('should fetch configured Notion pages without using search', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => notionPage('page-1', 'Feature Definition', 'https://notion.example/feature'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionHeading('block-1', 'Account feature policy'),
            notionParagraph('block-2', 'Login session policy is documented here.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      pageIds: 'page-1',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(baseInquiry, notionRouteDecision);

    // Assert
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('https://notion.example/v1/pages/page-1');
    expect(fetchFn).not.toHaveBeenCalledWith(expect.stringContaining('/v1/search'), expect.anything());
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'notion',
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external', 'keyword', 'symbol']),
    }));
  });

  it('should return unavailable evidence on Notion API failures', async () => {
    // Arrange
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      fetchFn: vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'unauthorized' }),
      }),
    });

    // Act
    const result = await target.findEvidence(baseInquiry, notionRouteDecision);

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'notion',
        status: 'unavailable',
        snippet: expect.stringContaining('unauthorized'),
      }),
    ]);
  });

  it('should traverse child blocks even when the parent block has no text', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => notionPage('page-1', 'Account Policy', 'https://notion.example/account'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              object: 'block',
              id: 'toggle-1',
              type: 'toggle',
              has_children: true,
              toggle: { rich_text: [] },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionParagraph('block-2', 'Login session policy is inside nested content.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      pageIds: 'page-1',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(baseInquiry, notionRouteDecision);

    // Assert
    expect(String(fetchFn.mock.calls[2]?.[0])).toBe('https://notion.example/v1/blocks/toggle-1/children?page_size=100');
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'notion',
      status: 'found',
      snippet: expect.stringContaining('nested content'),
    }));
  });

  it('should not promote unrelated Notion pages for notification evidence', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionPage('page-1', 'Whispy breathing music guide', 'https://notion.example/breathing'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionHeading('block-1', 'Fast breathing feature'),
            notionParagraph('block-2', 'Music and breathing exercises are documented here.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: 'App notification is enabled but push does not arrive.' },
      notificationRouteDecision,
    );

    // Assert
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.query).toContain('notification');
    expect(body.query).toContain('push');
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'notion',
        status: 'empty',
        snippet: 'No Notion page content matched the routed policy inquiry.',
      }),
    ]);
  });

  it('should not promote unrelated Notion pages for profile image evidence', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionPage('page-1', 'Whispy music guide', 'https://notion.example/music'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionHeading('block-1', 'Music feature'),
            notionParagraph('block-2', 'Sleep and focus music playback is documented here.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '프로필 사진을 새로 업로드했는데 이전 사진 복구가 가능한가요?' },
      profileImageRouteDecision,
    );

    // Assert
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.query).toContain('profile');
    expect(body.query).not.toContain('music');
    expect(body.query).not.toContain('account');
    expect(body.query).not.toContain('user');
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'notion',
        status: 'empty',
        snippet: 'No Notion page content matched the routed policy inquiry.',
      }),
    ]);
  });

  it('should not promote unrelated Notion pages that only match one generic narrative term', async () => {
    // Arrange
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionPage('page-1', 'Sleep history guide', 'https://notion.example/sleep-history'),
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            notionHeading('block-1', 'Sleep history'),
            notionParagraph('block-2', 'Previous sleep period comparison is documented here.'),
          ],
        }),
      });
    const target = new NotionApiEvidenceSource({
      token: 'notion-token',
      apiBaseUrl: 'https://notion.example',
      fetchFn,
    });

    // Act
    const result = await target.findEvidence(
      { ...baseInquiry, message: '프로필 사진을 새로 업로드했는데 이전 사진 복구가 가능한가요?' },
      profileImageRouteDecision,
    );

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'notion',
        status: 'empty',
        snippet: 'No Notion page content matched the routed policy inquiry.',
      }),
    ]);
  });
});

describe('createInternalEvidenceProvider', () => {
  it('should use GitHub for backend evidence without adding local-path evidence', async () => {
    // Arrange
    const provider = createInternalEvidenceProvider({
      github: {
        enabled: true,
        backendRepos: 'whispy/backend',
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                path: 'src/auth/session.ts',
                repository: { full_name: 'whispy/backend' },
                text_matches: [{ fragment: 'session token policy' }],
              },
            ],
          }),
        }),
      },
    });

    // Act
    const result = await provider.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'backend',
      status: 'found',
      retrievalSignals: expect.arrayContaining(['external']),
    }));
    expect(result[0]?.snippet).not.toContain('PATH');
  });

  it('should use Notion API provider for notion evidence', async () => {
    // Arrange
    const provider = createInternalEvidenceProvider({
      notion: {
        enabled: true,
        token: 'notion-token',
        pageIds: 'page-1',
        fetchFn: vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => notionPage('page-1', 'Login Policy', 'https://notion.example/login'),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              results: [notionParagraph('block-1', 'Login session policy is documented here.')],
            }),
          }),
      },
    });

    // Act
    const result = await provider.findEvidence(baseInquiry, notionRouteDecision);

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      sourceType: 'notion',
      status: 'found',
      source: 'https://notion.example/login',
    }));
  });
});

describe('GeminiEmbeddingEvidenceReranker', () => {
  it('should rerank found evidence by embedding cosine similarity', async () => {
    // Arrange
    const target = new GeminiEmbeddingEvidenceReranker({
      apiKey: 'gemini-key',
      model: 'text-embedding-004',
      client: {
        models: {
          embedContent: vi.fn().mockResolvedValue({
            embeddings: [
              { values: [1, 0] },
              { values: [0, 1] },
              { values: [1, 0] },
            ],
          }),
        },
      },
    });
    const items = [
      {
        sourceType: 'backend',
        authority: 'implementation-behavior',
        title: 'weak match',
        source: 'weak.ts',
        snippet: 'billing details',
        status: 'found',
      },
      {
        sourceType: 'backend',
        authority: 'implementation-behavior',
        title: 'strong match',
        source: 'strong.ts',
        snippet: 'login session token details',
        status: 'found',
      },
    ] as const;

    // Act
    const result = await target.rerank('login session', [...items]);

    // Assert
    expect(result[0]).toEqual(expect.objectContaining({
      source: 'strong.ts',
      retrievalSignals: expect.arrayContaining(['embedding']),
      semanticScore: 1,
    }));
  });
});

describe('CompositeInternalEvidenceProvider', () => {
  it('should call only the requested internal evidence sources', async () => {
    // Arrange
    const backend = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          sourceType: 'backend',
          authority: 'implementation-behavior',
          title: 'backend auth',
          source: 'auth.ts',
          snippet: 'token behavior',
          status: 'found',
        },
      ]),
    };
    const flutter = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const target = new CompositeInternalEvidenceProvider({ backend, flutter });

    // Act
    const result = await target.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(backend.findEvidence).toHaveBeenCalledOnce();
    expect(flutter.findEvidence).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('should surface missing source providers as unavailable evidence', async () => {
    // Arrange
    const target = new CompositeInternalEvidenceProvider({});

    // Act
    const result = await target.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'backend',
        authority: 'unavailable',
        status: 'unavailable',
        snippet: expect.stringContaining('no evidence provider was registered'),
      }),
    ]);
  });

  it('should surface provider failures as unavailable evidence', async () => {
    // Arrange
    const backend = {
      findEvidence: vi.fn().mockRejectedValue(new Error('repo unavailable')),
    };
    const target = new CompositeInternalEvidenceProvider({ backend });

    // Act
    const result = await target.findEvidence(baseInquiry, routeDecision);

    // Assert
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'backend',
        authority: 'unavailable',
        status: 'unavailable',
        snippet: expect.stringContaining('repo unavailable'),
      }),
    ]);
  });
});

function notionPage(id: string, title: string, url: string) {
  return {
    object: 'page',
    id,
    url,
    properties: {
      Name: {
        type: 'title',
        title: [{ plain_text: title }],
      },
    },
  };
}

function notionParagraph(id: string, text: string) {
  return {
    object: 'block',
    id,
    type: 'paragraph',
    has_children: false,
    paragraph: {
      rich_text: [{ plain_text: text }],
    },
  };
}

function notionHeading(id: string, text: string) {
  return {
    object: 'block',
    id,
    type: 'heading_2',
    has_children: false,
    heading_2: {
      rich_text: [{ plain_text: text }],
    },
  };
}
