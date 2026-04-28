import { describe, expect, it, vi } from 'vitest';
import { handleGoogleFormWebhook } from '../../src/webhook/googleFormWebhookServer.js';

describe('handleGoogleFormWebhook', () => {
  it('should report health without requiring webhook authentication', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'GET',
      path: '/health',
      secret: '',
      body: '',
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '?ㅻЦ吏 ?묐떟 ?쒗듃1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { status: 'ok' },
      statusCode: 200,
    });
    expect(processSubmittedRow).not.toHaveBeenCalled();
  });

  it('should process the submitted row when the webhook is valid', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'POST',
      path: '/webhooks/google-form-submit',
      secret: 'shared-secret',
      body: JSON.stringify({
        spreadsheetId: 'sheet-id',
        sheetName: '설문지 응답 시트1',
        rowNumber: 7,
      }),
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '설문지 응답 시트1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { status: 'processed' },
      statusCode: 200,
    });
    expect(processSubmittedRow).toHaveBeenCalledWith(7);
  });

  it('should reject requests with the wrong secret', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'POST',
      path: '/webhooks/google-form-submit',
      secret: 'wrong-secret',
      body: JSON.stringify({
        spreadsheetId: 'sheet-id',
        sheetName: '설문지 응답 시트1',
        rowNumber: 7,
      }),
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '설문지 응답 시트1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { error: 'Unauthorized' },
      statusCode: 401,
    });
    expect(processSubmittedRow).not.toHaveBeenCalled();
  });

  it('should reject invalid payloads', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'POST',
      path: '/webhooks/google-form-submit',
      secret: 'shared-secret',
      body: JSON.stringify({ rowNumber: 1 }),
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '설문지 응답 시트1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { error: 'Invalid payload' },
      statusCode: 400,
    });
    expect(processSubmittedRow).not.toHaveBeenCalled();
  });

  it('should reject webhook payloads for a different sheet', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'POST',
      path: '/webhooks/google-form-submit',
      secret: 'shared-secret',
      body: JSON.stringify({
        spreadsheetId: 'other-sheet',
        sheetName: '설문지 응답 시트1',
        rowNumber: 7,
      }),
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '설문지 응답 시트1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { error: 'Unexpected spreadsheet id' },
      statusCode: 409,
    });
    expect(processSubmittedRow).not.toHaveBeenCalled();
  });

  it('should reject webhook payloads for a different sheet tab', async () => {
    // Arrange
    const processSubmittedRow = vi.fn().mockResolvedValue(true);

    // Act
    const result = await handleGoogleFormWebhook({
      method: 'POST',
      path: '/webhooks/google-form-submit',
      secret: 'shared-secret',
      body: JSON.stringify({
        spreadsheetId: 'sheet-id',
        sheetName: '다른 시트',
        rowNumber: 7,
      }),
    }, {
      expectedSecret: 'shared-secret',
      expectedSheetName: '설문지 응답 시트1',
      expectedSpreadsheetId: 'sheet-id',
      workflow: { processSubmittedRow },
    });

    // Assert
    expect(result).toEqual({
      body: { error: 'Unexpected sheet name' },
      statusCode: 409,
    });
    expect(processSubmittedRow).not.toHaveBeenCalled();
  });
});
