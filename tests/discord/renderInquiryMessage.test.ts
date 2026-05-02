import { describe, expect, it } from 'vitest';
import { renderInquiryMessage } from '../../src/discord/renderInquiryMessage.js';
import { baseInquiry } from '../fixtures/inquiries.js';

const evidenceDraft = {
  inquiryId: baseInquiry.inquiryId,
  summary: '동시 로그인 문의',
  subject: '확인 후 안내드리겠습니다',
  body: '담당자가 확인한 뒤 안내가 필요합니다.',
  missingInformation: [],
  evidenceReview: {
    route: 'need_multi_source_evidence' as const,
    reason: 'Backend와 Flutter 동작을 함께 확인해야 합니다.',
    requestedSources: ['backend' as const, 'flutter' as const, 'notion' as const],
    confidence: 'medium' as const,
    needsCheck: '고객에게 확정하기 전 정책 확인이 필요합니다.',
    conflicts: ['Backend와 Notion 기준이 다를 수 있습니다.'],
    evidence: [
      {
        sourceType: 'backend' as const,
        authority: 'implementation-behavior' as const,
        title: 'backend auth',
        source: 'auth/session.ts',
        snippet: 'Session tokens are issued per login.',
        status: 'found' as const,
        retrievalSignals: ['keyword' as const, 'ast' as const, 'embedding' as const],
        score: 14,
        semanticScore: 0.93,
      },
    ],
  },
};

describe('renderInquiryMessage', () => {
  it('should render review content and action buttons without classification labels', () => {
    // Arrange
    const inquiry = { ...baseInquiry, type: 'OTHER' as const };
    const draft = {
      inquiryId: baseInquiry.inquiryId,
      summary: '기타 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
      missingInformation: [],
    };

    // Act
    const result = renderInquiryMessage({ inquiry, draft });

    // Assert
    expect(result.content).toContain(`새 문의 검토 요청: ${baseInquiry.inquiryId}`);
    expect(result.content).toContain('유형: OTHER');
    expect(result.content).toContain(`${baseInquiry.name} <${baseInquiry.email}>`);
    expect(JSON.stringify(result.components)).toContain(`approve:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(result.components)).toContain(`edit:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(result.components)).toContain(`reject:${baseInquiry.inquiryId}`);
  });

  it('should render internal evidence review collapsed by default', () => {
    // Act
    const result = renderInquiryMessage({ inquiry: baseInquiry, draft: evidenceDraft });

    // Assert
    expect(result.content).toContain('내부 근거 검토');
    expect(result.content).toContain('Route: need_multi_source_evidence');
    expect(result.content).toContain('Evidence: 1 items (found=1, empty=0, unavailable=0)');
    expect(result.content).not.toContain('auth/session.ts');
    expect(result.content).not.toContain('signals: keyword+ast+embedding');
    expect(JSON.stringify(result.components)).toContain(`evidenceOpen:${baseInquiry.inquiryId}`);
  });

  it('should render internal evidence review details when expanded', () => {
    // Act
    const result = renderInquiryMessage({
      inquiry: baseInquiry,
      draft: evidenceDraft,
      evidenceExpanded: true,
    });

    // Assert
    expect(result.content).toContain('내부 근거 검토');
    expect(result.content).toContain('backend [implementation-behavior, found] auth/session.ts');
    expect(result.content).toContain('signals: keyword+ast+embedding, score=14.000, semantic=0.930');
    expect(result.content).toContain('Needs check: 고객에게 확정하기 전 정책 확인이 필요합니다.');
    expect(JSON.stringify(result.components)).toContain(`evidenceClose:${baseInquiry.inquiryId}`);
  });

  it('should not render internal evidence controls when the draft has no evidence review', () => {
    // Arrange
    const draft = {
      inquiryId: baseInquiry.inquiryId,
      summary: '서비스 문의',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
      missingInformation: [],
    };

    // Act
    const result = renderInquiryMessage({ inquiry: baseInquiry, draft });

    // Assert
    expect(result.content).not.toContain('내부 근거 검토');
    expect(result.content).not.toContain('Internal Evidence');
    expect(result.content.endsWith('\n')).toBe(false);
    expect(JSON.stringify(result.components)).not.toContain('evidenceOpen:');
  });
});
