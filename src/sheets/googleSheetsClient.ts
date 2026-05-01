import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Inquiry } from '../domain/inquiry.js';
import type { KnowledgeCircuitFeedbackRef } from '../domain/knowledgeCircuit.js';
import { buildManagedColumnUpdates, getReplyEmail, isCompletionChecked, mapRowToInquiry } from './sheetColumns.js';
import { normalizeSheetName, quoteSheetName, sheetNamesMatch } from './sheetName.js';

/** Google Sheet에 worker가 직접 관리하는 출력 컬럼 목록입니다. */
const managedColumns = [
  'inquiry_id',
  'status',
  'discord_channel_id',
  'discord_message_id',
  'draft_subject',
  'draft_body',
  'evidence_feedback_refs',
  'final_subject',
  'final_body',
  'handled_by',
  'handled_at',
  'gmail_message_id',
  'error_message',
] as const;

const retryablePreReviewStatuses = new Set(['drafting', 'failed', 'new']);
const headerRetryAttempts = 3;
const requestRetryAttempts = 3;
const retryDelayMs = 250;

/** googleapis의 values 응답 중 이 worker가 사용하는 최소 형태입니다. */
type ValueRange = {
  data?: {
    values?: string[][];
  };
};

type SpreadsheetMetadata = {
  data?: {
    sheets?: Array<{
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: {
          columnCount?: number;
        };
      };
    }>;
  };
};

type SpreadsheetBatchUpdateRequest = {
  appendDimension: {
    sheetId: number;
    dimension: 'COLUMNS';
    length: number;
  };
};

/** 테스트 주입을 쉽게 하기 위해 googleapis Sheets client의 필요한 부분만 좁힌 포트입니다. */
type SheetsLike = {
  spreadsheets: {
    get?(args: {
      spreadsheetId: string;
      fields: string;
    }): Promise<SpreadsheetMetadata>;
    batchUpdate?(args: {
      spreadsheetId: string;
      requestBody: {
        requests: SpreadsheetBatchUpdateRequest[];
      };
    }): Promise<unknown>;
    values: {
      get(args: {
        spreadsheetId: string;
        range: string;
      }): Promise<ValueRange>;
      update(args: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: { values: string[][] };
      }): Promise<unknown>;
      batchUpdate(args: {
        spreadsheetId: string;
        requestBody: {
          data: Array<{ range: string; values: string[][] }>;
          valueInputOption: string;
        };
      }): Promise<unknown>;
    };
  };
};

/**
 * Google Sheets를 문의 queue와 처리 상태 저장소로 사용하는 어댑터입니다.
 *
 * @remarks
 * 이 class는 Google Form이 만든 row를 읽고, worker가 관리하는 상태 컬럼을 업데이트합니다.
 *
 * @public
 */
export class GoogleSheetsClient {
  private headerCache: string[] | null = null;
  private resolvedSheetName: string | null = null;

  constructor(
    private readonly sheets: SheetsLike,
    private readonly spreadsheetId: string,
    private readonly sheetName: string,
  ) {}

  /**
   * OAuth client로 실제 Google Sheets API 어댑터를 생성합니다.
   *
   * @param auth - Sheets 접근 권한이 있는 Google OAuth client
   * @param spreadsheetId - 문의가 쌓이는 spreadsheet id
   * @param sheetName - 문의 row가 있는 sheet/tab 이름
   * @returns Google Sheets 기반 문의 저장소 adapter
   */
  static fromOAuth(
    auth: OAuth2Client,
    spreadsheetId: string,
    sheetName: string,
  ): GoogleSheetsClient {
    return new GoogleSheetsClient(
      google.sheets({ version: 'v4', auth }) as sheets_v4.Sheets as unknown as SheetsLike,
      spreadsheetId,
      sheetName,
    );
  }

  /**
   * Sheet에서 아직 처리되지 않은 신규 문의만 읽어옵니다.
   *
   * @returns `status`가 비어 있거나 `new`인 문의 목록
   */
  async listNewInquiries(): Promise<Inquiry[]> {
    const { headers, rows } = await this.readRows();
    const discordMessageIdIndex = headers.indexOf('discord_message_id');

    return rows
      .map((row, index) => ({
        completionChecked: isCompletionChecked(headers, row),
        discordMessageId: discordMessageIdIndex >= 0 ? row[discordMessageIdIndex] ?? '' : '',
        inquiry: mapRowToInquiry(headers, row, index + 2),
      }))
      .filter(({ completionChecked, discordMessageId, inquiry }) => (
        !completionChecked && isRetryablePreReviewInquiry(inquiry, discordMessageId)
      ))
      .map(({ inquiry }) => inquiry);
  }

  /**
   * Google Sheet의 1-based row 번호로 문의를 한 건 조회합니다.
   *
   * @param rowNumber - Google Form submit event가 전달한 실제 Sheet row 번호
   * @returns 해당 row의 문의. 데이터 row가 없으면 `null`
   */
  async findInquiryByRow(rowNumber: number): Promise<Inquiry | null> {
    const { headers, rows } = await this.readRows();
    const row = rows[rowNumber - 2];

    if (!row) {
      return null;
    }

    if (isCompletionChecked(headers, row)) {
      return null;
    }

    return mapRowToInquiry(headers, row, rowNumber);
  }

  /**
   * 특정 row의 managed column 값을 개별 cell update로 저장합니다.
   *
   * @param rowNumber - Google Sheet의 1-based row 번호
   * @param values - managed column 이름과 저장할 값
   */
  async updateManagedFields(
    rowNumber: number,
    values: Record<string, string>,
  ): Promise<void> {
    const headers = await this.readHeaders();
    const updates = buildManagedColumnUpdates(headers, values);
    const sheetPrefix = quoteSheetName(await this.resolveSheetName());

    if (!updates.length) {
      return;
    }

    await retryOperation(async () => {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          data: updates.map((update) => ({
            range: `${sheetPrefix}!${toA1Column(update.columnIndex + 1)}${rowNumber}`,
            values: [[update.value]],
          })),
          valueInputOption: 'RAW',
        },
      });
    }, requestRetryAttempts);
  }

  /**
   * Google Form 기본 컬럼 뒤에 worker 관리 컬럼이 없으면 한 번에 추가합니다.
   *
   * @remarks
   * 첫 실행 때 사람이 Sheet header를 직접 만들지 않아도 worker 상태 저장 필드를 사용할 수 있게 합니다.
   */
  async ensureManagedColumns(): Promise<void> {
    const headers = await this.readHeaders();
    const missing = managedColumns.filter((column) => !headers.includes(column));
    const sheetPrefix = quoteSheetName(await this.resolveSheetName());

    if (missing.length === 0) {
      return;
    }

    const startColumn = headers.length + 1;
    const endColumn = headers.length + missing.length;
    await this.ensureColumnCapacity(endColumn);

    await retryOperation(async () => {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetPrefix}!${toA1Column(startColumn)}1:${toA1Column(endColumn)}1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [missing as unknown as string[]],
        },
      });
    }, requestRetryAttempts);

    this.headerCache = [...headers, ...missing];
  }

  /**
   * Discord action의 inquiry id로 발송에 필요한 review metadata를 다시 조회합니다.
   *
   * @param inquiryId - Discord button/modal custom id에 포함된 문의 id
   * @returns 발송에 필요한 Sheet row metadata. 찾지 못하면 `null`
   */
  async findInquiryReview(inquiryId: string): Promise<{
    rowNumber: number;
    email: string;
    draftSubject: string;
    draftBody: string;
    evidenceFeedbackRefs: KnowledgeCircuitFeedbackRef[];
    status: string;
  } | null> {
    const { headers, rows } = await this.readRows();
    const inquiryIdIndex = headers.indexOf('inquiry_id');
    const statusIndex = headers.indexOf('status');
    const subjectIndex = headers.indexOf('draft_subject');
    const bodyIndex = headers.indexOf('draft_body');
    const evidenceFeedbackRefsIndex = headers.indexOf('evidence_feedback_refs');

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? [];

      if (row[inquiryIdIndex] === inquiryId) {
        return {
          rowNumber: i + 2,
          email: getReplyEmail(headers, row),
          draftSubject: row[subjectIndex] ?? '',
          draftBody: row[bodyIndex] ?? '',
          evidenceFeedbackRefs: parseEvidenceFeedbackRefs(row[evidenceFeedbackRefsIndex] ?? ''),
          status: row[statusIndex] ?? 'new',
        };
      }
    }

    return null;
  }

  /** 전체 Sheet 값을 읽고 첫 행을 header, 나머지를 data row로 분리합니다. */
  private async readRows(): Promise<{ headers: string[]; rows: string[][] }> {
    const response = await retryOperation(async () => this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: await this.buildRange(),
    }), requestRetryAttempts);

    const values = response.data?.values ?? [];
    const headers = (values[0] ?? []).map(String);
    const rows = values.slice(1).map((row) => row.map(String));
    this.headerCache = headers;

    return { headers, rows };
  }

  private async readHeaders(): Promise<string[]> {
    if (this.headerCache) {
      return this.headerCache;
    }

    const response = await retryOperation(async () => this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: await this.buildRange('1:1'),
    }), headerRetryAttempts);
    const headers = (response.data?.values?.[0] ?? []).map(String);
    this.headerCache = headers;
    return headers;
  }

  private async buildRange(a1Range?: string): Promise<string> {
    const sheetPrefix = quoteSheetName(await this.resolveSheetName());

    return a1Range ? `${sheetPrefix}!${a1Range}` : sheetPrefix;
  }

  private async resolveSheetName(): Promise<string> {
    if (this.resolvedSheetName) {
      return this.resolvedSheetName;
    }

    if (!this.sheets.spreadsheets.get) {
      this.resolvedSheetName = this.sheetName;
      return this.resolvedSheetName;
    }

    const response = await retryOperation(async () => this.sheets.spreadsheets.get?.({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title',
    }), requestRetryAttempts);
    const availableSheetNames = response?.data?.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title): title is string => typeof title === 'string') ?? [];
    const exactMatch = availableSheetNames.find((title) => title === this.sheetName);
    const normalizedMatch = availableSheetNames.find((title) => sheetNamesMatch(title, this.sheetName));

    if (exactMatch ?? normalizedMatch) {
      this.resolvedSheetName = exactMatch ?? normalizedMatch ?? this.sheetName;
      return this.resolvedSheetName;
    }

    throw new Error(
      `Google Sheet tab "${this.sheetName}" was not found. ` +
      `Normalized value: "${normalizeSheetName(this.sheetName)}". ` +
      `Available tabs: ${formatAvailableSheetNames(availableSheetNames)}.`,
    );
  }

  private async ensureColumnCapacity(requiredColumnCount: number): Promise<void> {
    if (!this.sheets.spreadsheets.get || !this.sheets.spreadsheets.batchUpdate) {
      return;
    }

    const properties = await this.resolveSheetProperties();

    if (properties.sheetId === undefined) {
      return;
    }

    const currentColumnCount = properties.columnCount ?? requiredColumnCount;
    const missingColumnCount = requiredColumnCount - currentColumnCount;

    if (missingColumnCount <= 0) {
      return;
    }

    await retryOperation(async () => {
      await this.sheets.spreadsheets.batchUpdate?.({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            appendDimension: {
              sheetId: properties.sheetId as number,
              dimension: 'COLUMNS',
              length: missingColumnCount,
            },
          }],
        },
      });
    }, requestRetryAttempts);
  }

  private async resolveSheetProperties(): Promise<{ sheetId?: number; title: string; columnCount?: number }> {
    const response = await retryOperation(async () => this.sheets.spreadsheets.get?.({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties(sheetId,title,gridProperties.columnCount)',
    }), requestRetryAttempts);
    const availableSheetProperties = response?.data?.sheets
      ?.map((sheet) => sheet.properties)
      .filter((properties): properties is NonNullable<typeof properties> => Boolean(properties?.title)) ?? [];
    const exactMatch = availableSheetProperties.find((properties) => properties.title === this.resolvedSheetName);
    const normalizedMatch = availableSheetProperties.find((properties) => (
      typeof properties.title === 'string' && sheetNamesMatch(properties.title, this.sheetName)
    ));
    const properties = exactMatch ?? normalizedMatch;

    if (!properties?.title) {
      return { title: await this.resolveSheetName() };
    }

    this.resolvedSheetName = properties.title;

    return {
      title: properties.title,
      ...(typeof properties.sheetId === 'number' ? { sheetId: properties.sheetId } : {}),
      ...(typeof properties.gridProperties?.columnCount === 'number' ? { columnCount: properties.gridProperties.columnCount } : {}),
    };
  }
}

function parseEvidenceFeedbackRefs(value: string): KnowledgeCircuitFeedbackRef[] {
  if (!value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isKnowledgeCircuitFeedbackRef);
  } catch {
    return [];
  }
}

function isKnowledgeCircuitFeedbackRef(value: unknown): value is KnowledgeCircuitFeedbackRef {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<KnowledgeCircuitFeedbackRef>;
  return typeof candidate.nodeId === 'string' &&
    typeof candidate.sourceType === 'string' &&
    typeof candidate.sourceRef === 'string' &&
    typeof candidate.contentHash === 'string';
}

/**
 * 1-based column index를 Google Sheets A1 column 이름으로 변환합니다.
 *
 * @param index - 1부터 시작하는 column 번호
 * @returns A, Z, AA 같은 A1 column 이름
 */
export function toA1Column(index: number): string {
  let current = index;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function isRetryablePreReviewInquiry(inquiry: Inquiry, discordMessageId: string): boolean {
  if (!retryablePreReviewStatuses.has(inquiry.status)) {
    return false;
  }

  return !discordMessageId;
}

function formatAvailableSheetNames(sheetNames: string[]): string {
  if (sheetNames.length === 0) {
    return '(none)';
  }

  return sheetNames.map((sheetName) => `"${sheetName}"`).join(', ');
}

async function retryOperation<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
