import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsClient, toA1Column } from '../../src/sheets/googleSheetsClient.js';

describe('GoogleSheetsClient', () => {
  it('should return only new inquiries from the sheet', async () => {
    // Arrange
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                ['Timestamp', 'Email Address', '문의 유형', '문의 내용', '이름', 'status', 'inquiry_id'],
                ['2026-04-23', 'a@example.com', '서비스에 대해 궁금한 점이 있어요', '질문', 'A', '', ''],
                ['2026-04-23', 'b@example.com', '건의사항이 있어요', '건의', 'B', 'sent', 'inq_3'],
              ],
            },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', 'Form Responses 1');

    // Act
    const result = await target.listNewInquiries();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.email).toBe('a@example.com');
    expect(result[0]?.status).toBe('new');
  });

  it('should build A1 column names correctly', () => {
    expect(toA1Column(1)).toBe('A');
    expect(toA1Column(26)).toBe('Z');
    expect(toA1Column(27)).toBe('AA');
  });

  it('should append missing managed columns to the header row', async () => {
    // Arrange
    const update = vi.fn().mockResolvedValue({});
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [['Timestamp', 'Email Address', '문의 유형', '문의 내용', '이름']],
            },
          }),
          update,
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', 'Form Responses 1');

    // Act
    await target.ensureManagedColumns();

    // Assert
    expect(update).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: "'Form Responses 1'!F1:S1",
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
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
        ]],
      },
    });
  });
});
