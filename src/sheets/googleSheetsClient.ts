import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Inquiry } from '../domain/inquiry.js';
import { buildManagedColumnUpdates, getReplyEmail, mapRowToInquiry } from './sheetColumns.js';

/** Google Sheet에 worker가 직접 관리하는 출력 컬럼 목록입니다. */
const managedColumns = [
  'inquiry_id',
  'status',
  'risk_level',
  'risk_reasons',
  'discord_channel_id',
  'discord_message_id',
  'draft_subject',
  'draft_body',
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

/** 테스트 주입을 쉽게 하기 위해 googleapis Sheets client의 필요한 부분만 좁힌 포트입니다. */
type SheetsLike = {
  spreadsheets: {
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
        discordMessageId: discordMessageIdIndex >= 0 ? row[discordMessageIdIndex] ?? '' : '',
        inquiry: mapRowToInquiry(headers, row, index + 2),
      }))
      .filter(({ discordMessageId, inquiry }) => isRetryablePreReviewInquiry(inquiry, discordMessageId))
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

    if (!updates.length) {
      return;
    }

    await retryOperation(async () => {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          data: updates.map((update) => ({
            range: `'${this.sheetName}'!${toA1Column(update.columnIndex + 1)}${rowNumber}`,
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

    if (missing.length === 0) {
      return;
    }

    const startColumn = headers.length + 1;
    const endColumn = headers.length + missing.length;

    await retryOperation(async () => {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.sheetName}'!${toA1Column(startColumn)}1:${toA1Column(endColumn)}1`,
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
    status: string;
  } | null> {
    const { headers, rows } = await this.readRows();
    const inquiryIdIndex = headers.indexOf('inquiry_id');
    const statusIndex = headers.indexOf('status');
    const subjectIndex = headers.indexOf('draft_subject');
    const bodyIndex = headers.indexOf('draft_body');

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? [];

      if (row[inquiryIdIndex] === inquiryId) {
        return {
          rowNumber: i + 2,
          email: getReplyEmail(headers, row),
          draftSubject: row[subjectIndex] ?? '',
          draftBody: row[bodyIndex] ?? '',
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
      range: `'${this.sheetName}'`,
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
      range: `'${this.sheetName}'!1:1`,
    }), headerRetryAttempts);
    const headers = (response.data?.values?.[0] ?? []).map(String);
    this.headerCache = headers;
    return headers;
  }
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
