import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Inquiry } from '../domain/inquiry.js';
import { buildManagedColumnUpdates, mapRowToInquiry } from './sheetColumns.js';

type ValueRange = {
  data?: {
    values?: string[][];
  };
};

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
    };
  };
};

export class GoogleSheetsClient {
  constructor(
    private readonly sheets: SheetsLike,
    private readonly spreadsheetId: string,
    private readonly sheetName: string,
  ) {}

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

  async listNewInquiries(): Promise<Inquiry[]> {
    const { headers, rows } = await this.readRows();

    return rows
      .map((row, index) => mapRowToInquiry(headers, row, index + 2))
      .filter((inquiry) => inquiry.status === 'new');
  }

  async updateManagedFields(
    rowNumber: number,
    values: Record<string, string>,
  ): Promise<void> {
    const { headers } = await this.readRows();
    const updates = buildManagedColumnUpdates(headers, values);

    for (const update of updates) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.sheetName}'!${toA1Column(update.columnIndex + 1)}${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[update.value]] },
      });
    }
  }

  async ensureManagedColumns(): Promise<void> {
    return Promise.resolve();
  }

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
    const emailIndex = headers.indexOf('Email Address');
    const subjectIndex = headers.indexOf('draft_subject');
    const bodyIndex = headers.indexOf('draft_body');

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] ?? [];

      if (row[inquiryIdIndex] === inquiryId) {
        return {
          rowNumber: i + 2,
          email: row[emailIndex] ?? '',
          draftSubject: row[subjectIndex] ?? '',
          draftBody: row[bodyIndex] ?? '',
          status: row[statusIndex] ?? 'new',
        };
      }
    }

    return null;
  }

  private async readRows(): Promise<{ headers: string[]; rows: string[][] }> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.sheetName}'`,
    });

    const values = response.data?.values ?? [];
    const headers = (values[0] ?? []).map(String);
    const rows = values.slice(1).map((row) => row.map(String));

    return { headers, rows };
  }
}

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
