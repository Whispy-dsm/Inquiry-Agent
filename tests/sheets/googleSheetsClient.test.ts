import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsClient, toA1Column } from '../../src/sheets/googleSheetsClient.js';

describe('GoogleSheetsClient', () => {
  const whispyHeaders = [
    '타임스탬프',
    '문의 유형을 선택해 주세요',
    '[기능 오류] 문의 사항을 최대한 자세히 적어주세요.',
    '[기능 오류] 문의 사항과 관련된 스크린샷이나 영상 파일을 업로드해 주세요.',
    '[서비스 내 궁금한 점] 문의 사항을 최대한 자세히 적어주세요.',
    '[서비스 내 궁금한 점] 문의 사항과 관련된 스크린샷이나 영상 파일을 업로드해 주세요.',
    '[건의사항] 문의 사항을 최대한 자세히 적어주세요.',
    '[건의사항] 문의 사항과 관련된 스크린샷이나 영상 파일을 업로드해 주세요.',
    '[그 외] 문의 사항을 최대한 자세히 적어주세요.',
    '[그 외] 문의 사항과 관련된 스크린샷이나 영상 파일을 업로드해 주세요.',
    '문의사항 답변 및 상담을 위한 개인정보 수집.이용 동의서',
    '답변 받으실 이메일 주소를 입력해주세요.',
    '가입 시 사용하신 이메일 정보를 입력주세요.',
    '단말기 정보를 입력해주세요 ( 선택사항, 단말기 모델명과 OS 버전)\n',
    '완료 여부',
  ];

  it('should return only new inquiries from the sheet', async () => {
    // Arrange
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                [...whispyHeaders, 'status', 'inquiry_id'],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'a@example.com', '', '', 'TRUE', '', ''],
                ['2026-04-23', '건의사항이 있어요', '', '', '', '', '건의', '', '', '', '동의', 'b@example.com', '', '', 'TRUE', 'sent', 'inq_3'],
              ],
            },
          }),
          batchUpdate: vi.fn().mockResolvedValue({}),
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
              values: [whispyHeaders],
            },
          }),
          batchUpdate: vi.fn().mockResolvedValue({}),
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
      range: "'Form Responses 1'!P1:AC1",
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

  it('should find review metadata using the Whispy reply email column', async () => {
    // Arrange
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                [...whispyHeaders, 'status', 'inquiry_id', 'draft_subject', 'draft_body'],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'reply@example.com', '', '', 'TRUE', 'pending_review', 'inq_2', '제목', '본문'],
              ],
            },
          }),
          batchUpdate: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', '설문지 응답 시트1');

    // Act
    const result = await target.findInquiryReview('inq_2');

    // Assert
    expect(result).toEqual({
      rowNumber: 2,
      email: 'reply@example.com',
      draftSubject: '제목',
      draftBody: '본문',
      status: 'pending_review',
    });
  });

  it('should find an inquiry by one-based sheet row number', async () => {
    // Arrange
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                [...whispyHeaders, 'status', 'inquiry_id'],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'reply@example.com', '', '', 'TRUE', '', 'inq_2'],
              ],
            },
          }),
          batchUpdate: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', '설문지 응답 시트1');

    // Act
    const result = await target.findInquiryByRow(2);

    // Assert
    expect(result).toMatchObject({
      inquiryId: 'inq_2',
      rowNumber: 2,
      email: 'reply@example.com',
      message: '질문',
      status: 'new',
    });
  });

  it('should include retryable drafting and failed rows before a Discord message exists', async () => {
    // Arrange
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                [...whispyHeaders, 'status', 'inquiry_id', 'discord_message_id'],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'retry-a@example.com', '', '', 'TRUE', 'drafting', 'inq_2', ''],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'retry-b@example.com', '', '', 'TRUE', 'failed', 'inq_3', ''],
                ['2026-04-23', '그 외 문의하고 싶은 내용이 있어요', '', '', '', '', '', '', '질문', '', '동의', 'skip@example.com', '', '', 'TRUE', 'failed', 'inq_4', 'message_1'],
              ],
            },
          }),
          batchUpdate: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', '설문지 응답 시트1');

    // Act
    const result = await target.listNewInquiries();

    // Assert
    expect(result.map((item) => item.inquiryId)).toEqual(['inq_2', 'inq_3']);
  });

  it('should batch managed field updates in one Sheets request', async () => {
    // Arrange
    const batchUpdate = vi.fn().mockResolvedValue({});
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [[...whispyHeaders, 'status', 'inquiry_id', 'error_message']],
            },
          }),
          batchUpdate,
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const target = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', '설문지 응답 시트1');

    // Act
    await target.updateManagedFields(2, {
      inquiry_id: 'inq_2',
      status: 'drafting',
      error_message: '',
    });

    // Assert
    expect(batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      requestBody: {
        data: [
          { range: "'설문지 응답 시트1'!Q2", values: [['inq_2']] },
          { range: "'설문지 응답 시트1'!P2", values: [['drafting']] },
          { range: "'설문지 응답 시트1'!R2", values: [['']] },
        ],
        valueInputOption: 'RAW',
      },
    });
  });
});
