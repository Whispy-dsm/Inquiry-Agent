import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { Inquiry } from '../domain/inquiry.js';

/** 문의별 답변 근거를 찾아오는 지식 소스 경계입니다. */
export interface ContextProvider {
  /** 문의 내용을 기준으로 AI 초안에 넣을 관련 근거 문장을 반환합니다. */
  findRelevantContext(inquiry: Inquiry): Promise<string[]>;
}

/** DB/vector store가 붙기 전까지 사용할 고정 context provider입니다. */
export class StaticContextProvider implements ContextProvider {
  constructor(private readonly entries: string[] = []) {}

  /** 모든 문의에 동일한 정적 근거를 반환합니다. */
  async findRelevantContext(_inquiry: Inquiry): Promise<string[]> {
    return this.entries;
  }
}

type MarkdownContextProviderOptions = {
  maxChunks?: number;
};

type MarkdownChunk = {
  filePath: string;
  relativePath: string;
  heading: string;
  content: string;
  searchText: string;
};

/** `docs/rag` Markdown 파일을 간단한 키워드 검색 컨텍스트로 사용하는 provider입니다. */
export class MarkdownDirectoryContextProvider implements ContextProvider {
  private readonly rootDir: string;
  private readonly maxChunks: number;

  constructor(rootDir = resolve(process.cwd(), 'docs', 'rag'), options: MarkdownContextProviderOptions = {}) {
    this.rootDir = rootDir;
    this.maxChunks = options.maxChunks ?? 6;
  }

  /** 문의 유형과 본문 키워드에 맞는 Markdown section을 반환합니다. */
  async findRelevantContext(inquiry: Inquiry): Promise<string[]> {
    const chunks = await this.loadChunks();
    const terms = buildQueryTerms(inquiry);

    return chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxChunks)
      .map(({ chunk }) => formatChunk(chunk));
  }

  private async loadChunks(): Promise<MarkdownChunk[]> {
    try {
      const files = await listMarkdownFiles(this.rootDir);
      const chunkGroups = await Promise.all(
        files.map(async (filePath) => splitMarkdownIntoChunks(this.rootDir, filePath, await readFile(filePath, 'utf8'))),
      );

      return chunkGroups.flat();
    } catch {
      return [];
    }
  }
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listMarkdownFiles(entryPath);
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        return [entryPath];
      }

      return [];
    }),
  );

  return groups.flat().sort();
}

function splitMarkdownIntoChunks(rootDir: string, filePath: string, content: string): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const lines = content.split(/\r?\n/);
  let heading = 'Document';
  let currentLines: string[] = [];

  const flush = (): void => {
    const chunkContent = currentLines.join('\n').trim();

    if (chunkContent.length < 20) {
      currentLines = [];
      return;
    }

    const relativePath = relative(rootDir, filePath).replace(/\\/g, '/');
    chunks.push({
      filePath,
      relativePath,
      heading,
      content: chunkContent,
      searchText: `${relativePath}\n${heading}\n${chunkContent}`.toLowerCase(),
    });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);

    if (headingMatch && currentLines.length > 0) {
      flush();
    }

    if (headingMatch) {
      heading = headingMatch[2]?.trim() || heading;
    }

    currentLines.push(line);
  }

  flush();
  return chunks;
}

function buildQueryTerms(inquiry: Inquiry): string[] {
  const expansionsByType: Record<Inquiry['type'], string[]> = {
    APP_ERROR: ['앱', '오류', '에러', '멈춤', '화면', '로그인', '재현', '기기', '버전'],
    SERVICE_QUESTION: ['서비스', '사용법', '기능', '질문', '어디', '방법'],
    SUGGESTION: ['건의', '제안', '개선', '요청', '기능'],
    OTHER: ['담당자', '확인', '개인정보', '삭제', '탈퇴', '결제', '보안', '법적'],
  };
  const highRiskExpansions: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /개인정보|개인 정보|삭제|탈퇴|계정 삭제/i, terms: ['개인정보', '삭제', '탈퇴', '본인 확인'] },
    { pattern: /환불|결제|청구|영수증|구독|프리미엄/i, terms: ['결제', '환불', '구독', '프리미엄', 'Google Play'] },
    { pattern: /법적|소송|신고|분쟁/i, terms: ['법적', '분쟁', '담당자'] },
    { pattern: /보안|해킹|취약점|유출/i, terms: ['보안', '해킹', '취약점', '유출'] },
  ];
  const terms = [
    inquiry.type,
    ...tokenize(inquiry.message),
    ...expansionsByType[inquiry.type],
  ];

  for (const expansion of highRiskExpansions) {
    if (expansion.pattern.test(inquiry.message)) {
      terms.push(...expansion.terms);
    }
  }

  return Array.from(new Set(terms.map((term) => term.toLowerCase()).filter((term) => term.length >= 2)));
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/[a-z0-9_/-]+|[가-힣]{2,}/gi), (match) => match[0]);
}

function scoreChunk(chunk: MarkdownChunk, terms: string[]): number {
  let score = 0;
  const heading = chunk.heading.toLowerCase();
  const path = chunk.relativePath.toLowerCase();

  for (const term of terms) {
    if (heading.includes(term)) {
      score += 4;
    }

    if (path.includes(term)) {
      score += 2;
    }

    score += Math.min(countOccurrences(chunk.searchText, term), 3);
  }

  return score;
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let index = text.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

function formatChunk(chunk: MarkdownChunk): string {
  return `[source: ${chunk.relativePath}#${chunk.heading}]\n${chunk.content}`;
}
