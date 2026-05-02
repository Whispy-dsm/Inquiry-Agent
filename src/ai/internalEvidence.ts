import { GoogleGenAI } from '@google/genai';
import * as ts from 'typescript';
import type { Inquiry } from '../domain/inquiry.js';
import type {
  EvidenceAuthority,
  EvidenceItem,
  EvidenceRetrievalSignal,
  EvidenceRouteDecision,
  EvidenceSourceType,
} from '../domain/evidence.js';
import type { KnowledgeCircuitService } from './knowledgeCircuit.js';
import { contentHash } from './knowledgeCircuitStore.js';

type InternalEvidenceSourceType = Exclude<EvidenceSourceType, 'rag'>;

/** 라우팅 결과에 따라 Discord 검토자가 확인할 내부 근거를 수집하는 상위 포트입니다. */
export interface InternalEvidenceProvider {
  findEvidence(inquiry: Inquiry, decision: EvidenceRouteDecision): Promise<EvidenceItem[]>;
}

/** GitHub 검색, Notion API처럼 하나의 실제 출처에서 근거를 찾는 제공자 포트입니다. */
export interface EvidenceSourceProvider {
  findEvidence(inquiry: Inquiry, decision: EvidenceRouteDecision): Promise<EvidenceItem[]>;
}

/** 이미 수집된 근거 후보를 의미 유사도 등으로 재정렬하는 선택적 재정렬 포트입니다. */
export interface EvidenceReranker {
  rerank(query: string, items: EvidenceItem[]): Promise<EvidenceItem[]>;
}

type SymbolExtractionResult = {
  symbols: string[];
  signal?: Extract<EvidenceRetrievalSignal, 'ast' | 'symbol'>;
};

type GitHubRepository = {
  owner: string;
  repo: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  },
) => Promise<FetchResponseLike>;

/**
 * GitHub 코드 검색 기반 근거 제공자의 실행 옵션입니다.
 *
 * @remarks
 * 테스트에서는 `fetchFn`을 주입하고, 운영에서는 토큰과 저장소 설정을 통해 GitHub REST API를 읽기 전용으로 호출합니다.
 */
export type GitHubCodeSearchEvidenceSourceOptions = {
  token?: string;
  apiBaseUrl?: string;
  fetchFn?: FetchLike;
  maxResults?: number;
  maxQueryTerms?: number;
  maxFetchedFileBytes?: number;
  maxSnippetLength?: number;
  useTypeScriptCompiler?: boolean;
};

/**
 * Notion REST API 기반 근거 제공자의 실행 옵션입니다.
 *
 * @remarks
 * `pageIds`가 있으면 검색 API 대신 지정된 페이지를 직접 읽고, 없으면 안전한 의도 검색어로 Notion 페이지 검색을 수행합니다.
 */
export type NotionApiEvidenceSourceOptions = {
  token?: string;
  apiBaseUrl?: string;
  notionVersion?: string;
  pageIds?: string;
  fetchFn?: FetchLike;
  maxResults?: number;
  maxSearchTerms?: number;
  maxFetchedBlocks?: number;
  maxSnippetLength?: number;
};

type EmbeddingClientLike = {
  models: {
    embedContent(args: {
      model: string;
      contents: string[];
      config?: {
        taskType?: string;
        outputDimensionality?: number;
      };
    }): Promise<{
      embeddings?: Array<{
        values?: number[];
      }>;
    }>;
  };
};

/**
 * Gemini embedding 재정렬기의 실행 옵션입니다.
 *
 * @remarks
 * 근거 수집 범위를 넓히는 설정이 아니라, 이미 제한된 후보를 검토자에게 더 관련도 높은 순서로 보여주기 위한 설정입니다.
 */
export type GeminiEmbeddingEvidenceRerankerOptions = {
  apiKey: string;
  model: string;
  maxCandidates?: number;
  outputDimensionality?: number;
  client?: EmbeddingClientLike;
};

type CompositeInternalEvidenceProviderOptions = {
  reranker?: EvidenceReranker | undefined;
  knowledgeCircuit?: KnowledgeCircuitService | undefined;
};

type EvidenceProviderMap = Partial<Record<InternalEvidenceSourceType, EvidenceSourceProvider | EvidenceSourceProvider[]>>;

/**
 * 설정된 GitHub 저장소를 읽기 전용 코드 검색 API로 조회해 구현 근거를 수집합니다.
 *
 * @remarks
 * 검색 결과가 실제 문의 의도와 맞는지 다시 점수화하고, `tasks/` 같은 운영 문서는 구현 근거로 승격하지 않습니다.
 */
export class GitHubCodeSearchEvidenceSource implements EvidenceSourceProvider {
  private readonly apiBaseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly maxResults: number;
  private readonly maxQueryTerms: number;
  private readonly maxFetchedFileBytes: number;
  private readonly maxSnippetLength: number;
  private readonly useTypeScriptCompiler: boolean;

  constructor(
    private readonly sourceType: InternalEvidenceSourceType,
    private readonly repositories: GitHubRepository[],
    private readonly authority: EvidenceAuthority,
    options: GitHubCodeSearchEvidenceSourceOptions = {},
  ) {
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.maxResults = options.maxResults ?? 3;
    this.maxQueryTerms = options.maxQueryTerms ?? 8;
    this.maxFetchedFileBytes = options.maxFetchedFileBytes ?? 120_000;
    this.maxSnippetLength = options.maxSnippetLength ?? 700;
    this.useTypeScriptCompiler = options.useTypeScriptCompiler ?? true;
    this.token = options.token;
  }

  private readonly token: string | undefined;

  async findEvidence(inquiry: Inquiry, decision: EvidenceRouteDecision): Promise<EvidenceItem[]> {
    if (this.repositories.length === 0) {
      return [];
    }

    const groups = await Promise.all(
      this.repositories.map((repository) => this.searchRepository(repository, inquiry, decision)),
    );
    const items = groups.flat();

    if (items.length > 0) {
      return items;
    }

    return [this.emptyItem()];
  }

  private async searchRepository(
    repository: GitHubRepository,
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
  ): Promise<EvidenceItem[]> {
    const query = buildGitHubSearchQuery(
      repository,
      buildExternalEvidenceTerms(inquiry, decision, this.sourceType),
      this.maxQueryTerms,
    );
    const url = `${this.apiBaseUrl}/search/code?q=${encodeURIComponent(query)}&per_page=${this.maxResults}`;

    let response: FetchResponseLike;
    try {
      response = await this.fetchFn(url, { headers: this.searchHeaders() });
    } catch (error) {
      return [this.unavailableItem(repository, `GitHub code search failed: ${errorMessage(error)}`)];
    }

    const payload = await safeJson(response);

    if (!response.ok) {
      return [
        this.unavailableItem(
          repository,
          `GitHub code search returned HTTP ${response.status}: ${githubErrorMessage(payload)}`,
        ),
      ];
    }

    const results = githubSearchItems(payload);
    const evidence = await Promise.all(
      results.slice(0, this.maxResults).map((item) => this.toEvidenceItem(item, inquiry, decision)),
    );

    return evidence.filter((item): item is EvidenceItem => item !== null);
  }

  private searchHeaders(): Record<string, string> {
    return this.headers('application/vnd.github.text-match+json');
  }

  private apiHeaders(): Record<string, string> {
    return this.headers('application/vnd.github+json');
  }

  private headers(accept: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'inquiry-agent-internal-evidence-router',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async toEvidenceItem(
    item: GitHubSearchItem,
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
  ): Promise<EvidenceItem | null> {
    if (isLowSignalGitHubPath(item.path)) {
      return null;
    }

    const fullName = item.repository?.full_name ?? 'unknown/repository';
    const source = item.html_url ?? `github:${fullName}/${item.path}`;
    const fragment = item.text_matches?.find((match) => typeof match.fragment === 'string')?.fragment;
    const focusedTerms = buildFocusedEvidenceTerms(inquiry, decision);

    if (!item.url && focusedTerms.length > 0) {
      const searchResultScore = scoreSearchText(`${item.path}\n${fragment ?? ''}`.toLowerCase(), focusedTerms);

      if (searchResultScore === 0) {
        return null;
      }
    }

    const evidenceItem: EvidenceItem = {
      sourceType: this.sourceType,
      authority: this.authority,
      title: `${this.sourceType} external: ${fullName}/${item.path}`,
      source,
      snippet: fragment ?? `GitHub code search matched ${fullName}/${item.path}.`,
      status: 'found',
      retrievalSignals: ['external', 'keyword'],
    };

    if (typeof item.score === 'number') {
      evidenceItem.score = item.score;
    }

    const content = await this.fetchMatchedFileContent(item);

    if (content) {
      return this.withFetchedContentEvidence(evidenceItem, item.path, content, inquiry, decision);
    }

    return evidenceItem;
  }

  private async fetchMatchedFileContent(item: GitHubSearchItem): Promise<string | null> {
    if (!item.url) {
      return null;
    }

    let response: FetchResponseLike;
    try {
      response = await this.fetchFn(item.url, { headers: this.apiHeaders() });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return githubFileContent(await safeJson(response), this.maxFetchedFileBytes);
  }

  private async withFetchedContentEvidence(
    evidenceItem: EvidenceItem,
    path: string,
    content: string,
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
  ): Promise<EvidenceItem | null> {
    const terms = buildEvidenceTerms(inquiry, decision, this.sourceType);
    const symbolExtraction = await extractCodeSymbols(path, content, this.useTypeScriptCompiler);
    const focusedTerms = buildFocusedEvidenceTerms(inquiry, decision);
    const focusedKeywordScore = scoreSearchText(`${path}\n${content}`.toLowerCase(), focusedTerms);
    const focusedSymbolScore = scoreSymbols(symbolExtraction.symbols, focusedTerms);
    const keywordScore = scoreSearchText(`${path}\n${content}`.toLowerCase(), terms);
    const symbolScore = scoreSymbols(symbolExtraction.symbols, terms);
    const score = (evidenceItem.score ?? 0) + keywordScore + symbolScore;
    const sourceContentHash = contentHash(`${this.sourceType}\n${evidenceItem.source}\n${evidenceItem.title}\n${path}\n${content}`);

    if (focusedTerms.length > 0 && focusedKeywordScore === 0 && focusedSymbolScore === 0) {
      return null;
    }

    if (keywordScore === 0 && symbolScore === 0) {
      return {
        ...evidenceItem,
        circuitContentHash: sourceContentHash,
      };
    }

    return {
      ...evidenceItem,
      snippet: trimSnippet(buildEvidenceSnippet(content, terms, symbolExtraction.symbols), this.maxSnippetLength),
      circuitContentHash: sourceContentHash,
      retrievalSignals: addRetrievalSignals(
        evidenceItem.retrievalSignals,
        buildRetrievalSignals(keywordScore > 0 ? keywordScore : 1, symbolScore, symbolExtraction.signal),
      ),
      score,
    };
  }

  private unavailableItem(repository: GitHubRepository, reason: string): EvidenceItem {
    return {
      sourceType: this.sourceType,
      authority: 'unavailable',
      title: `${this.sourceType} external evidence unavailable`,
      source: `github:${repository.owner}/${repository.repo}`,
      snippet: reason,
      status: 'unavailable',
      retrievalSignals: ['external'],
    };
  }

  private emptyItem(): EvidenceItem {
    return {
      sourceType: this.sourceType,
      authority: this.authority,
      title: `${this.sourceType} external evidence not found`,
      source: `github:${this.repositories.map((repo) => `${repo.owner}/${repo.repo}`).join(',')}`,
      snippet: `No GitHub code search results matched the routed ${this.sourceType} inquiry.`,
      status: 'empty',
      retrievalSignals: ['external'],
    };
  }
}

/**
 * Notion API로 제품 정책과 기능 정의 페이지를 조회해 정책 근거를 수집합니다.
 *
 * @remarks
 * 검색어는 개인정보를 직접 포함하지 않는 safe term만 사용하며, 페이지 본문이 문의 의도와 맞지 않으면 `found`로 올리지 않습니다.
 */
export class NotionApiEvidenceSource implements EvidenceSourceProvider {
  private readonly apiBaseUrl: string;
  private readonly notionVersion: string;
  private readonly pageIds: string[];
  private readonly fetchFn: FetchLike;
  private readonly maxResults: number;
  private readonly maxSearchTerms: number;
  private readonly maxFetchedBlocks: number;
  private readonly maxSnippetLength: number;

  constructor(private readonly options: NotionApiEvidenceSourceOptions) {
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.notion.com').replace(/\/$/, '');
    this.notionVersion = options.notionVersion ?? '2026-03-11';
    this.pageIds = parseCsv(options.pageIds);
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.maxResults = options.maxResults ?? 5;
    this.maxSearchTerms = options.maxSearchTerms ?? 6;
    this.maxFetchedBlocks = options.maxFetchedBlocks ?? 120;
    this.maxSnippetLength = options.maxSnippetLength ?? 700;
  }

  async findEvidence(inquiry: Inquiry, decision: EvidenceRouteDecision): Promise<EvidenceItem[]> {
    if (!this.options.token) {
      return [this.unavailableItem('INTERNAL_EVIDENCE_NOTION_TOKEN is not configured.')];
    }

    const terms = buildEvidenceTerms(inquiry, decision, 'notion');
    const focusedTerms = buildFocusedEvidenceTerms(inquiry, decision);
    const safeTerms = buildExternalEvidenceTerms(inquiry, decision, 'notion').slice(0, this.maxSearchTerms);

    if (this.pageIds.length > 0) {
      return this.fetchConfiguredPages(this.pageIds, terms, focusedTerms);
    }

    const searchResults = await this.searchPages(safeTerms);

    if ('error' in searchResults) {
      return [this.unavailableItem(searchResults.error)];
    }

    if (searchResults.items.length === 0) {
      return [this.emptyItem('No Notion pages matched the routed policy inquiry.')];
    }

    return this.fetchSearchResultPages(searchResults.items, terms, focusedTerms);
  }

  private async searchPages(terms: string[]): Promise<{ items: NotionSearchResult[] } | { error: string }> {
    const query = terms.join(' ').trim();
    const response = await this.request(`${this.apiBaseUrl}/v1/search`, {
      method: 'POST',
      body: JSON.stringify({
        query,
        filter: {
          value: 'page',
          property: 'object',
        },
        page_size: this.maxResults,
      }),
    });

    if ('error' in response) {
      return response;
    }

    return { items: notionSearchResults(response.payload).slice(0, this.maxResults) };
  }

  private async fetchConfiguredPages(pageIds: string[], terms: string[], focusedTerms: string[]): Promise<EvidenceItem[]> {
    const items = await Promise.all(
      pageIds.slice(0, this.maxResults).map((pageId) => this.fetchPageEvidence({ id: pageId }, terms, focusedTerms)),
    );

    return this.normalizeNotionEvidence(items);
  }

  private async fetchSearchResultPages(
    searchResults: NotionSearchResult[],
    terms: string[],
    focusedTerms: string[],
  ): Promise<EvidenceItem[]> {
    const items = await Promise.all(searchResults.map((result) => this.fetchPageEvidence(result, terms, focusedTerms)));

    return this.normalizeNotionEvidence(items);
  }

  private normalizeNotionEvidence(items: Array<EvidenceItem | null>): EvidenceItem[] {
    const found = items.filter((item): item is EvidenceItem => item !== null);

    if (found.length === 0) {
      return [this.emptyItem('No Notion page content matched the routed policy inquiry.')];
    }

    return found.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, this.maxResults);
  }

  private async fetchPageEvidence(
    page: NotionSearchResult,
    terms: string[],
    focusedTerms: string[],
  ): Promise<EvidenceItem | null> {
    const pageMetadata = page.title ? page : await this.fetchPageMetadata(page.id);
    const content = await this.fetchPageContent(page.id);

    if ('error' in content) {
      return {
        sourceType: 'notion',
        authority: 'unavailable',
        title: `notion page unavailable: ${pageMetadata.title ?? page.id}`,
        source: pageMetadata.url ?? `notion:${page.id}`,
        snippet: content.error,
        status: 'unavailable',
        retrievalSignals: ['external'],
      };
    }

    const text = [
      pageMetadata.title ?? '',
      content.blocks.map((block) => block.text).join('\n'),
    ].join('\n').trim();
    const score = scoreSearchText(text.toLowerCase(), terms);
    const symbols = content.blocks.filter((block) => block.isHeading).map((block) => block.text);
    const symbolScore = scoreSymbols(symbols, terms);
    const totalScore = score + symbolScore;
    const focusedScore = focusedTerms.length === 0
      ? 0
      : scoreSearchText(text.toLowerCase(), focusedTerms) + scoreSymbols(symbols, focusedTerms);

    if (focusedTerms.length > 0 && focusedScore === 0) {
      return null;
    }

    if (totalScore === 0) {
      return null;
    }

    const source = pageMetadata.url ?? `notion:${page.id}`;

    return {
      sourceType: 'notion',
      authority: 'product-policy',
      title: `notion: ${pageMetadata.title ?? page.id}`,
      source,
      snippet: trimSnippet(buildEvidenceSnippet(text, terms, symbols), this.maxSnippetLength),
      status: 'found',
      retrievalSignals: addRetrievalSignals(['external'], buildRetrievalSignals(score, symbolScore, symbols.length > 0 ? 'symbol' : undefined)),
      score: totalScore,
      circuitContentHash: contentHash(`notion\n${source}\n${pageMetadata.title ?? page.id}\n${text}`),
    };
  }

  private async fetchPageMetadata(pageId: string): Promise<NotionSearchResult> {
    const response = await this.request(`${this.apiBaseUrl}/v1/pages/${encodeURIComponent(pageId)}`);

    if ('error' in response) {
      return { id: pageId };
    }

    return notionPageMetadata(response.payload) ?? { id: pageId };
  }

  private async fetchPageContent(pageId: string): Promise<{ blocks: NotionTextBlock[] } | { error: string }> {
    const blocks: NotionTextBlock[] = [];
    const queue: string[] = [pageId];
    let visitedBlocks = 0;

    while (queue.length > 0 && visitedBlocks < this.maxFetchedBlocks) {
      const blockId = queue.shift();

      if (!blockId) {
        continue;
      }

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore && visitedBlocks < this.maxFetchedBlocks) {
        const cursorQuery = cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : '';
        const response = await this.request(`${this.apiBaseUrl}/v1/blocks/${encodeURIComponent(blockId)}/children?page_size=100${cursorQuery}`);

        if ('error' in response) {
          return response;
        }

        const children = notionTextBlocks(response.payload);
        blocks.push(...children);
        visitedBlocks += children.length;

        for (const child of children) {
          if (child.hasChildren && visitedBlocks + queue.length < this.maxFetchedBlocks) {
            queue.push(child.id);
          }
        }

        hasMore = notionHasMore(response.payload);
        cursor = notionNextCursor(response.payload);
      }
    }

    return { blocks };
  }

  private async request(
    url: string,
    init: { method?: string; body?: string } = {},
  ): Promise<{ payload: unknown } | { error: string }> {
    let response: FetchResponseLike;
    try {
      response = await this.fetchFn(url, {
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.notionVersion,
        },
        ...init,
      });
    } catch (error) {
      return { error: `Notion API request failed: ${errorMessage(error)}` };
    }

    const payload = await safeJson(response);

    if (!response.ok) {
      return { error: `Notion API returned HTTP ${response.status}: ${notionErrorMessage(payload)}` };
    }

    return { payload };
  }

  private unavailableItem(reason: string): EvidenceItem {
    return {
      sourceType: 'notion',
      authority: 'unavailable',
      title: 'notion evidence unavailable',
      source: 'notion api',
      snippet: reason,
      status: 'unavailable',
      retrievalSignals: ['external'],
    };
  }

  private emptyItem(reason: string): EvidenceItem {
    return {
      sourceType: 'notion',
      authority: 'product-policy',
      title: 'notion evidence not found',
      source: 'notion api',
      snippet: reason,
      status: 'empty',
      retrievalSignals: ['external'],
    };
  }
}

/**
 * Gemini embedding으로 이미 제한된 내부 근거 후보를 의미 유사도 순서로 재정렬합니다.
 *
 * @remarks
 * embedding 호출 실패나 빈 벡터 응답은 검토 흐름을 막지 않고 기존 순서를 그대로 반환합니다.
 */
export class GeminiEmbeddingEvidenceReranker implements EvidenceReranker {
  private readonly client: EmbeddingClientLike;
  private readonly maxCandidates: number;
  private readonly outputDimensionality: number | undefined;

  constructor(private readonly options: GeminiEmbeddingEvidenceRerankerOptions) {
    this.client = options.client ?? (new GoogleGenAI({ apiKey: options.apiKey }) as unknown as EmbeddingClientLike);
    this.maxCandidates = options.maxCandidates ?? 8;
    this.outputDimensionality = options.outputDimensionality;
  }

  async rerank(query: string, items: EvidenceItem[]): Promise<EvidenceItem[]> {
    const candidates = items.filter((item) => item.status === 'found').slice(0, this.maxCandidates);

    if (candidates.length === 0) {
      return items;
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.options.model,
        contents: [query, ...candidates.map(formatEvidenceItemForEmbedding)],
        config: this.embeddingConfig(),
      });
      const vectors = response.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
      const queryVector = vectors[0];

      if (!queryVector || queryVector.length === 0) {
        return items;
      }

      const ranked = candidates
        .map((item, index) => {
          const semanticScore = cosineSimilarity(queryVector, vectors[index + 1] ?? []);

          return {
            ...item,
            retrievalSignals: addRetrievalSignal(item.retrievalSignals, 'embedding'),
            semanticScore,
          };
        })
        .sort((a, b) => b.semanticScore - a.semanticScore);
      const candidateSet = new Set(candidates);

      return [...ranked, ...items.filter((item) => !candidateSet.has(item))];
    } catch {
      return items;
    }
  }

  private embeddingConfig(): { taskType: string; outputDimensionality?: number } {
    const config: { taskType: string; outputDimensionality?: number } = {
      taskType: 'SEMANTIC_SIMILARITY',
    };

    if (this.outputDimensionality !== undefined) {
      config.outputDimensionality = this.outputDimensionality;
    }

    return config;
  }
}

/**
 * 내부 근거 라우팅 결과가 요청한 출처 제공자만 호출하는 합성 제공자입니다.
 *
 * @remarks
 * 제공자 오류는 전체 검토 흐름을 중단하지 않고 `unavailable` 근거 항목으로 변환합니다. 지식 회로가 켜져 있으면
 * 수집된 근거를 후처리해 이전 피드백 점수와 충돌 정보를 반영합니다.
 */
export class CompositeInternalEvidenceProvider implements InternalEvidenceProvider {
  constructor(
    private readonly providers: EvidenceProviderMap,
    private readonly options: CompositeInternalEvidenceProviderOptions = {},
  ) {}

  async findEvidence(inquiry: Inquiry, decision: EvidenceRouteDecision): Promise<EvidenceItem[]> {
    const requestedSources = decision.requestedSources.filter(
      (source): source is InternalEvidenceSourceType => source !== 'rag',
    );

    if (decision.route === 'answer_from_rag' || requestedSources.length === 0) {
      return [];
    }

    const groups = await Promise.all(
      requestedSources.map(async (sourceType) => this.findEvidenceForSource(sourceType, inquiry, decision)),
    );
    const evidence = groups.flat();
    const ranked = this.options.reranker
      ? await this.options.reranker.rerank(buildRerankQuery(inquiry, decision), evidence)
      : evidence;

    if (!this.options.knowledgeCircuit) {
      return ranked;
    }

    return this.options.knowledgeCircuit.processEvidence(inquiry, decision, ranked);
  }

  private async findEvidenceForSource(
    sourceType: InternalEvidenceSourceType,
    inquiry: Inquiry,
    decision: EvidenceRouteDecision,
  ): Promise<EvidenceItem[]> {
    const providers = normalizeProviders(this.providers[sourceType]);

    if (providers.length === 0) {
      return [missingProviderItem(sourceType)];
    }

    const groups = await Promise.all(
      providers.map(async (provider) => {
        try {
          return await provider.findEvidence(inquiry, decision);
        } catch (error) {
          return [providerFailedItem(sourceType, error)];
        }
      }),
    );

    return groups.flat();
  }
}

/** GitHub 기반 backend/flutter 근거 제공자를 환경설정에서 만들 때 사용하는 옵션입니다. */
export type GitHubEvidenceOptions = {
  enabled?: boolean;
  token?: string | undefined;
  apiBaseUrl?: string | undefined;
  backendRepos?: string | undefined;
  flutterRepos?: string | undefined;
  fetchFn?: FetchLike;
};

/** Notion 기반 정책 근거 제공자를 환경설정에서 만들 때 사용하는 옵션입니다. */
export type NotionEvidenceOptions = {
  enabled?: boolean;
  token?: string | undefined;
  apiBaseUrl?: string | undefined;
  notionVersion?: string | undefined;
  pageIds?: string | undefined;
  fetchFn?: FetchLike;
};

/**
 * 내부 근거 제공자 그래프를 구성하기 위한 최상위 옵션입니다.
 *
 * @remarks
 * GitHub, Notion, embedding 재정렬기, 지식 회로를 독립적으로 켜고 끌 수 있어 테스트와 운영 설정을 같은 생성 함수로 다룹니다.
 */
export type InternalEvidenceProviderOptions = {
  github?: GitHubEvidenceOptions;
  notion?: NotionEvidenceOptions;
  embedding?: {
    enabled?: boolean;
    apiKey?: string | undefined;
    model?: string | undefined;
    maxCandidates?: number;
    client?: EmbeddingClientLike;
  };
  knowledgeCircuit?: KnowledgeCircuitService | undefined;
};

/** 환경변수 형태의 옵션에서 전체 내부 근거 제공자 그래프를 생성합니다. */
export function createInternalEvidenceProvider(options: InternalEvidenceProviderOptions): InternalEvidenceProvider {
  const providers: Partial<Record<InternalEvidenceSourceType, EvidenceSourceProvider[]>> = {};

  addGitHubProviders(providers, options.github);
  addNotionProvider(providers, options.notion);

  return new CompositeInternalEvidenceProvider(providers, {
    reranker: createEmbeddingReranker(options.embedding),
    knowledgeCircuit: options.knowledgeCircuit,
  });
}

function addGitHubProviders(
  providers: Partial<Record<InternalEvidenceSourceType, EvidenceSourceProvider[]>>,
  options: GitHubEvidenceOptions | undefined,
): void {
  if (!options?.enabled) {
    return;
  }

  addGitHubProvider(providers, 'backend', options.backendRepos, 'implementation-behavior', options);
  addGitHubProvider(providers, 'flutter', options.flutterRepos, 'client-behavior', options);
}

function addGitHubProvider(
  providers: Partial<Record<InternalEvidenceSourceType, EvidenceSourceProvider[]>>,
  sourceType: InternalEvidenceSourceType,
  repositoryList: string | undefined,
  authority: EvidenceAuthority,
  options: GitHubEvidenceOptions,
): void {
  const repositories = parseGitHubRepositories(repositoryList);

  if (repositories.length === 0) {
    return;
  }

  const providerOptions: GitHubCodeSearchEvidenceSourceOptions = {};

  if (options.token) {
    providerOptions.token = options.token;
  }

  if (options.apiBaseUrl) {
    providerOptions.apiBaseUrl = options.apiBaseUrl;
  }

  if (options.fetchFn) {
    providerOptions.fetchFn = options.fetchFn;
  }

  providers[sourceType] = [
    ...(providers[sourceType] ?? []),
    new GitHubCodeSearchEvidenceSource(sourceType, repositories, authority, providerOptions),
  ];
}

function addNotionProvider(
  providers: Partial<Record<InternalEvidenceSourceType, EvidenceSourceProvider[]>>,
  options: NotionEvidenceOptions | undefined,
): void {
  if (!options?.enabled) {
    return;
  }

  const providerOptions: NotionApiEvidenceSourceOptions = {};

  if (options.token) {
    providerOptions.token = options.token;
  }

  if (options.apiBaseUrl) {
    providerOptions.apiBaseUrl = options.apiBaseUrl;
  }

  if (options.notionVersion) {
    providerOptions.notionVersion = options.notionVersion;
  }

  if (options.pageIds) {
    providerOptions.pageIds = options.pageIds;
  }

  if (options.fetchFn) {
    providerOptions.fetchFn = options.fetchFn;
  }

  providers.notion = [
    ...(providers.notion ?? []),
    new NotionApiEvidenceSource(providerOptions),
  ];
}

function createEmbeddingReranker(
  options: InternalEvidenceProviderOptions['embedding'] | undefined,
): EvidenceReranker | undefined {
  if (!options?.enabled || !options.apiKey || !options.model) {
    return undefined;
  }

  const rerankerOptions: GeminiEmbeddingEvidenceRerankerOptions = {
    apiKey: options.apiKey,
    model: options.model,
  };

  if (options.maxCandidates !== undefined) {
    rerankerOptions.maxCandidates = options.maxCandidates;
  }

  if (options.client) {
    rerankerOptions.client = options.client;
  }

  return new GeminiEmbeddingEvidenceReranker(rerankerOptions);
}

function normalizeProviders(provider: EvidenceSourceProvider | EvidenceSourceProvider[] | undefined): EvidenceSourceProvider[] {
  if (!provider) {
    return [];
  }

  return Array.isArray(provider) ? provider : [provider];
}

function missingProviderItem(sourceType: InternalEvidenceSourceType): EvidenceItem {
  return {
    sourceType,
    authority: 'unavailable',
    title: `${sourceType} evidence provider missing`,
    source: 'not configured',
    snippet: `${sourceType} was requested by the router, but no evidence provider was registered.`,
    status: 'unavailable',
  };
}

function providerFailedItem(sourceType: InternalEvidenceSourceType, error: unknown): EvidenceItem {
  return {
    sourceType,
    authority: 'unavailable',
    title: `${sourceType} evidence provider failed`,
    source: 'provider error',
    snippet: `${sourceType} evidence provider failed: ${errorMessage(error)}`,
    status: 'unavailable',
  };
}

function buildEvidenceTerms(
  inquiry: Inquiry,
  decision: EvidenceRouteDecision,
  sourceType: InternalEvidenceSourceType,
): string[] {
  const sourceExpansions: Record<InternalEvidenceSourceType, string[]> = {
    backend: [
      'auth',
      'login',
      'session',
      'token',
      'account',
      'user',
      'notification',
      'record',
      'payment',
      'subscription',
      'policy',
      'feature',
      'api',
      '로그인',
      '계정',
      '세션',
      '토큰',
      '알림',
      '기록',
      '결제',
      '구독',
      '동시',
    ],
    flutter: [
      'auth',
      'login',
      'session',
      'token',
      'storage',
      'provider',
      'screen',
      'page',
      'widget',
      'permission',
      '로그인',
      '계정',
      '세션',
      '토큰',
      '저장',
      '화면',
      '위젯',
      '권한',
      '동시',
    ],
    notion: [
      'policy',
      'feature',
      'guide',
      'faq',
      '정책',
      '기능',
      '안내',
      '제한',
      '예외',
      '고객',
      '로그인',
      '계정',
      '세션',
      '동시',
      '알림',
      '기록',
      '결제',
      '구독',
      '지원',
    ],
  };
  const terms = [
    ...tokenize(inquiry.message),
    ...tokenize(decision.reason),
    ...tokenize(decision.needsCheck),
    ...sourceExpansions[sourceType],
  ];

  return Array.from(new Set(terms.map((term) => term.toLowerCase()).filter((term) => term.length >= 2)));
}

function buildExternalEvidenceTerms(
  inquiry: Inquiry,
  decision: EvidenceRouteDecision,
  sourceType: InternalEvidenceSourceType,
): string[] {
  const focusedTerms = buildFocusedEvidenceTerms(inquiry, decision);

  if (focusedTerms.length > 0) {
    return focusedTerms;
  }

  const terms = [
    ...safeSourceTerms(sourceType),
    ...safeRouteTerms(decision.route),
  ];

  return uniqueEvidenceTerms(terms);
}

function buildFocusedEvidenceTerms(
  inquiry: Inquiry,
  decision: EvidenceRouteDecision,
): string[] {
  return uniqueEvidenceTerms(
    safeIntentTerms(`${inquiry.type}\n${inquiry.message}\n${decision.reason}\n${decision.needsCheck}`),
  );
}

function uniqueEvidenceTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.map((term) => term.toLowerCase()).filter((term) => term.length >= 2)));
}

function safeSourceTerms(sourceType: InternalEvidenceSourceType): string[] {
  const termsBySource: Record<InternalEvidenceSourceType, string[]> = {
    backend: ['auth', 'login', 'session', 'token', 'account', 'api', 'policy'],
    flutter: ['auth', 'login', 'session', 'token', 'storage', 'provider', 'screen', 'widget'],
    notion: ['policy', 'feature', 'guide', 'faq', 'login', 'account'],
  };

  return termsBySource[sourceType];
}

function safeRouteTerms(route: EvidenceRouteDecision['route']): string[] {
  const termsByRoute: Partial<Record<EvidenceRouteDecision['route'], string[]>> = {
    need_backend_evidence: ['server', 'api', 'config'],
    need_flutter_evidence: ['client', 'app', 'screen'],
    need_notion_policy: ['policy', 'guide', 'feature'],
    need_multi_source_evidence: [],
    escalate_manual: ['policy', 'support'],
  };

  return termsByRoute[route] ?? [];
}

function safeIntentTerms(text: string): string[] {
  const rules: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /동시|concurrent|multi|multiple|simultaneous/i, terms: ['concurrent', 'session'] },
    { pattern: /로그인|login|auth|인증/i, terms: ['auth', 'login', 'session', 'token'] },
    { pattern: /계정|account|user/i, terms: ['account', 'user'] },
    { pattern: /알림|notification|push|fcm|firebase/i, terms: ['notification', 'push'] },
    { pattern: /기록|history|record|log/i, terms: ['record', 'history'] },
    { pattern: /결제|구독|환불|payment|subscription|billing|refund/i, terms: ['payment', 'subscription', 'billing'] },
    { pattern: /삭제|탈퇴|delete|withdrawal|privacy/i, terms: ['delete', 'privacy', 'account'] },
    { pattern: /보안|해킹|security|breach/i, terms: ['security', 'auth'] },
    { pattern: /권한|permission|storage|camera|location/i, terms: ['permission', 'storage'] },
    { pattern: /화면|버튼|ui|screen|button|widget/i, terms: ['screen', 'widget'] },
  ];

  return rules.flatMap((rule) => (rule.pattern.test(text) ? rule.terms : []));
}

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');

  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/[a-z0-9_/-]+|[가-힣]{2,}/gi), (match) => match[0]);
}

function scoreSearchText(searchText: string, terms: string[]): number {
  let score = 0;

  for (const term of terms) {
    score += Math.min(countOccurrences(searchText, term), 5);
  }

  return score;
}

function scoreSymbols(symbols: string[], terms: string[]): number {
  let score = 0;

  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);

    for (const term of terms) {
      if (normalized.includes(term)) {
        score += 8;
      }
    }
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

async function extractCodeSymbols(
  filePath: string,
  content: string,
  useTypeScriptCompiler: boolean,
): Promise<SymbolExtractionResult> {
  const extension = fileExtension(filePath);

  if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
    return extractTypeScriptSymbols(filePath, content, extension, useTypeScriptCompiler);
  }

  if (extension === '.dart') {
    return {
      symbols: extractDartSymbols(content),
      signal: 'symbol',
    };
  }

  if (extension === '.md') {
    return {
      symbols: extractMarkdownSymbols(content),
      signal: 'symbol',
    };
  }

  return { symbols: [] };
}

async function extractTypeScriptSymbols(
  filePath: string,
  content: string,
  extension: string,
  useTypeScriptCompiler: boolean,
): Promise<SymbolExtractionResult> {
  if (!useTypeScriptCompiler) {
    return {
      symbols: extractTypeScriptSymbolsHeuristic(content),
      signal: 'symbol',
    };
  }

  try {
    const scriptKindByExtension: Record<string, ts.ScriptKind> = {
      '.ts': ts.ScriptKind.TS,
      '.tsx': ts.ScriptKind.TSX,
      '.js': ts.ScriptKind.JS,
      '.jsx': ts.ScriptKind.JSX,
    };
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindByExtension[extension] ?? ts.ScriptKind.TS,
    );
    const symbols: string[] = [];

    const addName = (name: ts.PropertyName | ts.DeclarationName | undefined): void => {
      if (name && ts.isIdentifier(name)) {
        symbols.push(name.text);
      }
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isClassDeclaration(node)
        || ts.isFunctionDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node)
        || ts.isMethodDeclaration(node)
        || ts.isPropertyDeclaration(node)
      ) {
        addName(node.name);
      }

      if (ts.isVariableDeclaration(node)) {
        addName(node.name);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return {
      symbols: uniqueStrings(symbols).slice(0, 80),
      signal: 'ast',
    };
  } catch {
    return {
      symbols: extractTypeScriptSymbolsHeuristic(content),
      signal: 'symbol',
    };
  }
}

function extractTypeScriptSymbolsHeuristic(content: string): string[] {
  const symbols: string[] = [];
  const patterns = [
    /\b(?:class|interface|type|enum|function)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:public|private|protected|static|async|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const symbol = match[1];

      if (symbol && !['if', 'for', 'while', 'switch', 'catch'].includes(symbol)) {
        symbols.push(symbol);
      }
    }
  }

  return uniqueStrings(symbols).slice(0, 80);
}

function extractDartSymbols(content: string): string[] {
  const symbols: string[] = [];
  const patterns = [
    /\b(?:class|mixin|enum|extension)\s+([A-Za-z_]\w*)/g,
    /\b(?:final|const|var)\s+([A-Za-z_]\w*(?:Provider|Controller|Repository|Service|Notifier)?)\s*=/g,
    /\b(?:Future<[^>]+>|Stream<[^>]+>|Widget|void|bool|int|double|String|[A-Za-z_]\w*(?:<[^>]+>)?)\s+([A-Za-z_]\w*)\s*\(/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const symbol = match[1];

      if (symbol) {
        symbols.push(symbol);
      }
    }
  }

  return uniqueStrings(symbols).slice(0, 80);
}

function extractMarkdownSymbols(content: string): string[] {
  return uniqueStrings(
    Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm), (match) => match[1]?.trim() ?? '').filter(Boolean),
  ).slice(0, 80);
}

function buildEvidenceSnippet(content: string, terms: string[], symbols: string[]): string {
  const relevantSymbols = symbols.filter((symbol) => {
    const normalized = normalizeSymbol(symbol);

    return terms.some((term) => normalized.includes(term));
  });
  const snippet = extractSnippet(content, [...terms, ...relevantSymbols]);

  if (relevantSymbols.length === 0) {
    return snippet;
  }

  return [`Symbols: ${relevantSymbols.slice(0, 8).join(', ')}`, snippet].join('\n');
}

function extractSnippet(content: string, terms: string[]): string {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const normalized = line.toLowerCase();

    return terms.some((term) => normalized.includes(term.toLowerCase()));
  });

  if (index < 0) {
    return lines.slice(0, 8).join('\n').trim();
  }

  return lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 5)).join('\n').trim();
}

function trimSnippet(snippet: string, maxLength: number): string {
  if (snippet.length <= maxLength) {
    return snippet;
  }

  return `${snippet.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildRetrievalSignals(
  keywordScore: number,
  symbolScore: number,
  symbolSignal: Extract<EvidenceRetrievalSignal, 'ast' | 'symbol'> | undefined,
): EvidenceRetrievalSignal[] {
  const signals: EvidenceRetrievalSignal[] = [];

  if (keywordScore > 0) {
    signals.push('keyword');
  }

  if (symbolScore > 0 && symbolSignal) {
    signals.push(symbolSignal);
  }

  return signals;
}

function addRetrievalSignal(
  signals: EvidenceRetrievalSignal[] | undefined,
  signal: EvidenceRetrievalSignal,
): EvidenceRetrievalSignal[] {
  return Array.from(new Set([...(signals ?? []), signal]));
}

function addRetrievalSignals(
  signals: EvidenceRetrievalSignal[] | undefined,
  additionalSignals: EvidenceRetrievalSignal[],
): EvidenceRetrievalSignal[] {
  return Array.from(new Set([...(signals ?? []), ...additionalSignals]));
}

function normalizeSymbol(symbol: string): string {
  return symbol
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function parseGitHubRepositories(value: string | undefined): GitHubRepository[] {
  return parseCsv(value)
    .flatMap((entry) => {
      const [owner, repo] = entry.split('/');

      if (!owner || !repo) {
        return [];
      }

      return [{ owner, repo }];
    });
}

function buildGitHubSearchQuery(repository: GitHubRepository, terms: string[], maxQueryTerms: number): string {
  const queryTerms = terms
    .filter((term) => !term.includes('/') && term.length <= 40)
    .slice(0, maxQueryTerms)
    .join(' ');

  return `${queryTerms} repo:${repository.owner}/${repository.repo}`.trim();
}

function isLowSignalGitHubPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();

  return normalized === 'agents.md'
    || normalized === 'claude.md'
    || normalized === 'tasks/todo.md'
    || normalized.startsWith('tasks/')
    || normalized.includes('/tasks/')
    || normalized.startsWith('.agents/')
    || normalized.startsWith('.github/')
    || normalized.startsWith('.omx/');
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

type GitHubSearchItem = {
  path: string;
  url?: string;
  html_url?: string;
  score?: number;
  repository?: {
    full_name?: string;
  };
  text_matches?: Array<{
    fragment?: string;
  }>;
};

function githubSearchItems(payload: unknown): GitHubSearchItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items.flatMap((item) => {
    if (!isRecord(item) || typeof item.path !== 'string') {
      return [];
    }

    const result: GitHubSearchItem = { path: item.path };

    if (typeof item.url === 'string') {
      result.url = item.url;
    }

    if (typeof item.html_url === 'string') {
      result.html_url = item.html_url;
    }

    if (typeof item.score === 'number') {
      result.score = item.score;
    }

    if (isRecord(item.repository) && typeof item.repository.full_name === 'string') {
      result.repository = { full_name: item.repository.full_name };
    }

    if (Array.isArray(item.text_matches)) {
      result.text_matches = item.text_matches.flatMap((match) => {
        if (!isRecord(match) || typeof match.fragment !== 'string') {
          return [];
        }

        return [{ fragment: match.fragment }];
      });
    }

    return [result];
  });
}

function githubFileContent(payload: unknown, maxBytes: number): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.size === 'number' && payload.size > maxBytes) {
    return null;
  }

  if (payload.type !== 'file' || payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    return null;
  }

  const normalized = payload.content.replace(/\s+/g, '');
  const content = Buffer.from(normalized, 'base64').toString('utf8');

  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    return null;
  }

  return content;
}

type NotionSearchResult = {
  id: string;
  title?: string;
  url?: string;
};

type NotionTextBlock = {
  id: string;
  text: string;
  isHeading: boolean;
  hasChildren: boolean;
};

function notionSearchResults(payload: unknown): NotionSearchResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.flatMap((item) => {
    if (!isRecord(item) || item.object !== 'page' || typeof item.id !== 'string') {
      return [];
    }

    const metadata = notionPageMetadata(item);

    return metadata ? [metadata] : [{ id: item.id }];
  });
}

function notionPageMetadata(payload: unknown): NotionSearchResult | null {
  if (!isRecord(payload) || typeof payload.id !== 'string') {
    return null;
  }

  const result: NotionSearchResult = { id: payload.id };
  const title = notionPageTitle(payload);

  if (title) {
    result.title = title;
  }

  if (typeof payload.url === 'string') {
    result.url = payload.url;
  }

  return result;
}

function notionPageTitle(page: Record<string, unknown>): string | undefined {
  if (!isRecord(page.properties)) {
    return undefined;
  }

  for (const property of Object.values(page.properties)) {
    if (!isRecord(property) || property.type !== 'title' || !Array.isArray(property.title)) {
      continue;
    }

    const title = richTextPlainText(property.title);

    if (title) {
      return title;
    }
  }

  return undefined;
}

function notionTextBlocks(payload: unknown): NotionTextBlock[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.flatMap((block) => {
    if (!isRecord(block) || typeof block.id !== 'string' || typeof block.type !== 'string') {
      return [];
    }

    const text = blockPlainText(block);

    if (!text && block.has_children !== true) {
      return [];
    }

    return [{
      id: block.id,
      text,
      isHeading: block.type.startsWith('heading_'),
      hasChildren: block.has_children === true,
    }];
  });
}

function notionHasMore(payload: unknown): boolean {
  return isRecord(payload) && payload.has_more === true && typeof payload.next_cursor === 'string';
}

function notionNextCursor(payload: unknown): string | undefined {
  return isRecord(payload) && typeof payload.next_cursor === 'string' ? payload.next_cursor : undefined;
}

function blockPlainText(block: Record<string, unknown>): string {
  const blockType = typeof block.type === 'string' ? block.type : '';
  const value = isRecord(block[blockType]) ? block[blockType] : undefined;

  if (!value) {
    return '';
  }

  if (Array.isArray(value.rich_text)) {
    return richTextPlainText(value.rich_text);
  }

  if (blockType === 'child_page' && typeof value.title === 'string') {
    return value.title;
  }

  if (blockType === 'code' && Array.isArray(value.rich_text)) {
    return richTextPlainText(value.rich_text);
  }

  return '';
}

function richTextPlainText(value: unknown[]): string {
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return '';
      }

      if (typeof entry.plain_text === 'string') {
        return entry.plain_text;
      }

      return '';
    })
    .join('')
    .trim();
}

function notionErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message;
  }

  return 'unknown Notion error';
}

async function safeJson(response: FetchResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function githubErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message;
  }

  return 'unknown GitHub error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildRerankQuery(inquiry: Inquiry, decision: EvidenceRouteDecision): string {
  return [
    inquiry.message,
    decision.reason,
    decision.needsCheck,
    decision.requestedSources.join(' '),
  ].join('\n');
}

function formatEvidenceItemForEmbedding(item: EvidenceItem): string {
  return [
    item.title,
    item.sourceType,
    item.authority,
    item.source,
    item.snippet,
    item.retrievalSignals?.join(' ') ?? '',
  ].join('\n');
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
