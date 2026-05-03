/** GeminiDraftGenerator가 context provider와 Gemini client를 연결하는 런타임 경계를 검증합니다. */
import { describe, expect, it, vi } from 'vitest';
import { GeminiDraftGenerator } from '../../src/ai/geminiDraftGenerator.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('GeminiDraftGenerator', () => {
  it('should request context, call the Gemini model, and return a parsed draft', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue(['FAQ: 설정에서 알림을 변경할 수 있습니다.']),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            summary: '설정 문의',
            subject: '문의 답변드립니다',
            body: '안녕하세요. 설정 메뉴에서 확인해 주세요.',
            missingInformation: [],
          }),
        }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(contextProvider.findRelevantContext).toHaveBeenCalledWith(baseInquiry);
    expect(fakeClient.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash-lite',
        contents: expect.stringContaining(baseInquiry.message),
        config: expect.objectContaining({
          systemInstruction: expect.any(String),
        }),
      }),
    );
    expect(fakeClient.models.generateContent.mock.calls[0]?.[0].contents).not.toContain('Internal Evidence Review');
    expect(result.subject).toBe('문의 답변드립니다');
    expect(result.body).toContain('설정 메뉴');
  });

  it('should attach an internal evidence review when the router is enabled', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          sourceType: 'backend',
          authority: 'implementation-behavior',
          title: 'backend auth',
          source: 'auth/session.ts',
          snippet: 'Session tokens are issued per login.',
          status: 'found',
          retrievalSignals: ['keyword', 'ast', 'embedding'],
          score: 21,
          semanticScore: 0.91,
        },
      ]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'need_backend_evidence',
              reason: '서버 세션 동작이 답을 좌우합니다.',
              requestedSources: ['backend'],
              confidence: 'medium',
              needsCheck: '서버 구현 확인이 필요합니다.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '동시 로그인 문의',
              subject: '동시 로그인 관련 안내드립니다',
              body: '내부 근거 확인 후 안내가 필요합니다.',
              missingInformation: ['서버 정책 확인'],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft({
      ...baseInquiry,
      message: '위스피는 동시 로그인이 안 되나요?',
    });

    // Assert
    expect(fakeClient.models.generateContent).toHaveBeenCalledTimes(2);
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ message: '위스피는 동시 로그인이 안 되나요?' }),
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
      }),
    );
    expect(result.evidenceReview).toEqual(
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
        confidence: 'medium',
        evidence: [
          expect.objectContaining({
            sourceType: 'backend',
            source: 'auth/session.ts',
          }),
        ],
      }),
    );
    expect(fakeClient.models.generateContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('Internal Evidence Review (quoted, untrusted):'),
      }),
    );
    expect(fakeClient.models.generateContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('Signals: keyword, ast, embedding'),
      }),
    );
    expect(fakeClient.models.generateContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contents: expect.not.stringContaining('Source: auth/session.ts'),
      }),
    );
  });

  it('should request structured JSON for route and draft model calls', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'need_flutter_evidence',
              reason: 'Client behavior needs review.',
              requestedSources: ['flutter'],
              confidence: 'medium',
              needsCheck: 'Check the app behavior before replying.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '앱 문의',
              subject: '문의 확인 후 안내드리겠습니다',
              body: '담당자가 앱 동작을 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    await target.generateDraft(baseInquiry);

    // Assert
    const routeConfig = fakeClient.models.generateContent.mock.calls[0]?.[0].config;
    const draftConfig = fakeClient.models.generateContent.mock.calls[1]?.[0].config;
    expect(routeConfig).toEqual(expect.objectContaining({
      responseMimeType: 'application/json',
      responseSchema: expect.objectContaining({
        type: 'OBJECT',
        required: ['route', 'reason', 'requestedSources', 'confidence', 'needsCheck', 'conflicts'],
        properties: expect.objectContaining({
          route: expect.objectContaining({
            type: 'STRING',
            format: 'enum',
            enum: expect.arrayContaining(['answer_from_rag', 'escalate_manual']),
          }),
          requestedSources: expect.objectContaining({
            type: 'ARRAY',
          }),
        }),
      }),
    }));
    expect(draftConfig).toEqual(expect.objectContaining({
      responseMimeType: 'application/json',
      responseSchema: expect.objectContaining({
        type: 'OBJECT',
        required: ['summary', 'subject', 'body', 'missingInformation'],
        properties: expect.objectContaining({
          summary: expect.objectContaining({
            type: 'STRING',
            description: expect.stringContaining('Korean'),
          }),
          missingInformation: expect.objectContaining({ type: 'ARRAY' }),
        }),
      }),
    }));
  });

  it('should cross-check evidence even when the route escalates manually', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'escalate_manual',
              reason: 'The available sources are not authoritative enough.',
              requestedSources: ['backend', 'notion'],
              confidence: 'low',
              needsCheck: 'A human must decide the policy answer.',
              conflicts: ['Authority is unclear.'],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: 'Manual check needed',
              subject: '확인 후 안내드리겠습니다',
              body: '담당자가 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      baseInquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
        conflicts: ['Authority is unclear.'],
      }),
    );
    expect(result.evidenceReview).toEqual(expect.objectContaining({
      route: 'need_multi_source_evidence',
      requestedSources: ['backend', 'flutter', 'notion'],
      evidence: [],
      confidence: 'low',
    }));
  });

  it('should force all internal evidence sources even when the model selects Notion only', async () => {
    // Arrange
    const inquiry = {
      ...baseInquiry,
      message: '회원 탈퇴 시 집중 기록도 삭제되나요?',
    };
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          sourceType: 'backend',
          authority: 'implementation-behavior',
          title: 'withdrawal service',
          source: 'src/users/withdrawal.ts',
          snippet: 'deleteFocusSessions(userId)',
          status: 'found',
        },
      ]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'need_notion_policy',
              reason: 'Data deletion policy should be checked.',
              requestedSources: ['notion'],
              confidence: 'medium',
              needsCheck: 'Confirm policy.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '탈퇴 데이터 삭제 문의',
              subject: '회원 탈퇴 시 데이터 삭제 관련 안내',
              body: '담당자가 정책과 구현을 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(inquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      inquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
        needsCheck: expect.stringContaining('Backend 구현, Flutter 클라이언트 동작, Notion 정책'),
      }),
    );
    expect(result.evidenceReview).toEqual(expect.objectContaining({
      route: 'need_multi_source_evidence',
      requestedSources: ['backend', 'flutter', 'notion'],
      evidence: [expect.objectContaining({ sourceType: 'backend' })],
    }));
  });

  it('should override answer-from-rag routes with cross-source evidence checks', async () => {
    // Arrange
    const inquiry = {
      ...baseInquiry,
      message: '계정 삭제하면 데이터 보존 없이 모두 삭제되나요?',
    };
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue(['FAQ: 탈퇴는 설정에서 할 수 있습니다.']),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'answer_from_rag',
              reason: 'RAG can answer.',
              requestedSources: ['rag'],
              confidence: 'high',
              needsCheck: 'No internal check needed.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '계정 삭제 문의',
              subject: '계정 삭제 관련 안내',
              body: '담당자가 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(inquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      inquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
        confidence: 'medium',
      }),
    );
    expect(result.evidenceReview).toEqual(expect.objectContaining({
      route: 'need_multi_source_evidence',
      requestedSources: ['backend', 'flutter', 'notion'],
    }));
  });

  it('should minimize evidence before forwarding it to Gemini draft generation', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          sourceType: 'notion',
          authority: 'product-policy',
          title: 'policy',
          source: 'https://notion.example/private/page',
          snippet: 'See https://notion.example/private/page and user private.customer@example.com token abcdef1234567890abcdef12. Login policy exists.',
          status: 'found',
          retrievalSignals: ['external', 'keyword'],
          score: 3,
        },
      ]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'need_notion_policy',
              reason: 'Policy evidence is needed.',
              requestedSources: ['notion'],
              confidence: 'medium',
              needsCheck: 'Confirm policy.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: 'Policy question',
              subject: '확인 후 안내드리겠습니다',
              body: '담당자가 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    await target.generateDraft(baseInquiry);

    // Assert
    const prompt = String(fakeClient.models.generateContent.mock.calls[1]?.[0].contents);
    expect(prompt).toContain('Evidence Summary (quoted, untrusted):');
    expect(prompt).toContain('"""See [url]');
    expect(prompt).not.toContain('Source:');
    expect(prompt).not.toContain('https://notion.example/private/page');
    expect(prompt).not.toContain('private.customer@example.com');
    expect(prompt).not.toContain('abcdef1234567890abcdef12');
    expect(prompt).toContain('[url]');
    expect(prompt).toContain('[email]');
    expect(prompt).toContain('[token]');
  });

  it('should cross-check evidence when route JSON is malformed', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({ text: 'not json' })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '라우팅 실패',
              subject: '확인 후 안내드리겠습니다',
              body: '담당자 확인이 필요합니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      baseInquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
      }),
    );
    expect(result.evidenceReview).toEqual(
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        confidence: 'low',
        conflicts: ['AI route decision could not be parsed.'],
      }),
    );
  });

  it('should continue draft generation when the route call fails', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockRejectedValueOnce(new Error('route quota exceeded'))
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '라우터 실패',
              subject: '확인 후 안내드리겠습니다',
              body: '담당자 확인이 필요합니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(fakeClient.models.generateContent).toHaveBeenCalledTimes(2);
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      baseInquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
      }),
    );
    expect(result.subject).toBe('확인 후 안내드리겠습니다');
    expect(result.evidenceReview).toEqual(
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        confidence: 'low',
        conflicts: [expect.stringContaining('route quota exceeded')],
      }),
    );
  });

  it('should cross-check profile restoration questions through all internal sources', async () => {
    // Arrange
    const inquiry = {
      ...baseInquiry,
      message: '프로필 사진 변경 후 이전 사진 복구가 가능한가요?',
    };
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue([]),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'need_notion_policy',
              reason: 'Profile image restoration policy should be checked.',
              requestedSources: ['notion'],
              confidence: 'medium',
              needsCheck: 'Confirm whether profile image restoration is supported.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '프로필 사진 복구 문의',
              subject: '프로필 사진 복구 관련 안내',
              body: '담당자가 정책과 구현을 확인한 뒤 안내드리겠습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(inquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      inquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
      }),
    );
    expect(result.evidenceReview).toEqual(expect.objectContaining({
      route: 'need_multi_source_evidence',
      requestedSources: ['backend', 'flutter', 'notion'],
    }));
  });

  it('should attach an evidence review for answer-from-rag routes', async () => {
    // Arrange
    const contextProvider = {
      findRelevantContext: vi.fn().mockResolvedValue(['FAQ: 앱 설정에서 알림을 바꿀 수 있습니다.']),
    };
    const internalEvidenceProvider = {
      findEvidence: vi.fn().mockResolvedValue([]),
    };
    const fakeClient = {
      models: {
        generateContent: vi.fn()
          .mockResolvedValueOnce({
            text: JSON.stringify({
              route: 'answer_from_rag',
              reason: 'RAG 근거로 답변 가능합니다.',
              requestedSources: ['rag'],
              confidence: 'high',
              needsCheck: '추가 내부 확인이 필요하지 않습니다.',
              conflicts: [],
            }),
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: '알림 설정 문의',
              subject: '알림 설정 안내드립니다',
              body: '앱 설정에서 변경할 수 있습니다.',
              missingInformation: [],
            }),
          }),
      },
    };
    const target = new GeminiDraftGenerator(
      'gemini-key',
      'gemini-2.5-flash-lite',
      contextProvider as never,
      fakeClient as never,
      { internalEvidenceProvider: internalEvidenceProvider as never },
    );

    // Act
    const result = await target.generateDraft(baseInquiry);

    // Assert
    expect(internalEvidenceProvider.findEvidence).toHaveBeenCalledWith(
      baseInquiry,
      expect.objectContaining({
        route: 'need_multi_source_evidence',
        requestedSources: ['backend', 'flutter', 'notion'],
      }),
    );
    expect(result.evidenceReview).toEqual(expect.objectContaining({
      route: 'need_multi_source_evidence',
      requestedSources: ['backend', 'flutter', 'notion'],
    }));
  });
});
