import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownDirectoryContextProvider } from '../../src/ai/contextProvider.js';
import type { Inquiry } from '../../src/domain/inquiry.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('MarkdownDirectoryContextProvider', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = undefined;
    }
  });

  it('should return only markdown chunks relevant to the inquiry message', async () => {
    // Arrange
    tempDir = await mkdtemp(join(tmpdir(), 'whispy-rag-'));
    await writeFile(
      join(tempDir, 'product.md'),
      [
        '# Product',
        '## 알림',
        '알림이 오지 않으면 휴대폰 설정의 앱 알림 권한과 방해 금지 모드를 확인합니다.',
        '## 음악',
        '음악은 검색어 또는 카테고리로 찾을 수 있습니다.',
      ].join('\n'),
      'utf8',
    );
    const provider = new MarkdownDirectoryContextProvider(tempDir, { maxChunks: 1 });
    const inquiry: Inquiry = {
      ...baseInquiry,
      message: '알림이 안 와요',
      type: 'SERVICE_QUESTION',
    };

    // Act
    const result = await provider.findRelevantContext(inquiry);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('알림');
    expect(result[0]).toContain('방해 금지');
    expect(result[0]).not.toContain('카테고리');
  });

  it('should add sensitive policy context for payment inquiries', async () => {
    // Arrange
    tempDir = await mkdtemp(join(tmpdir(), 'whispy-rag-'));
    await writeFile(
      join(tempDir, 'answer-policy.md'),
      [
        '# Policy',
        '## 결제/구독 문의',
        '환불 가능 여부는 자동으로 확정하지 말고 담당자 확인으로 넘깁니다.',
        '## 일반 문의',
        '일반 사용법은 FAQ 기준으로 답변합니다.',
      ].join('\n'),
      'utf8',
    );
    const provider = new MarkdownDirectoryContextProvider(tempDir, { maxChunks: 1 });
    const inquiry: Inquiry = {
      ...baseInquiry,
      message: '결제했는데 프리미엄이 적용되지 않아요. 환불 가능한가요?',
      type: 'OTHER',
    };

    // Act
    const result = await provider.findRelevantContext(inquiry);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('환불 가능 여부');
    expect(result[0]).toContain('담당자 확인');
  });
});
