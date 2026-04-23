import { describe, expect, it } from 'vitest';
import { buildManagedColumnUpdates, mapRowToInquiry } from '../../src/sheets/sheetColumns.js';

describe('sheetColumns', () => {
  const headers = ['Timestamp', 'Email Address', '문의 유형', '문의 내용', '이름', 'status', 'inquiry_id'];

  it('should map a Google Form row to an inquiry when managed fields are blank', () => {
    // Arrange
    const row = [
      '2026. 4. 23 오후 2:00:00',
      'user@example.com',
      '서비스에 대해 궁금한 점이 있어요',
      '사용법 알려주세요',
      '홍길동',
      '',
      ''
    ];

    // Act
    const result = mapRowToInquiry(headers, row, 2);

    // Assert
    expect(result).toEqual({
      inquiryId: 'inq_2',
      rowNumber: 2,
      submittedAt: '2026. 4. 23 오후 2:00:00',
      email: 'user@example.com',
      name: '홍길동',
      type: 'SERVICE_QUESTION',
      message: '사용법 알려주세요',
      status: 'new'
    });
  });

  it('should build updates only for managed fields that exist in the sheet', () => {
    // Arrange
    const managedValues = {
      status: 'pending_review',
      inquiry_id: 'inq_2',
      draft_subject: '문의 답변드립니다'
    };

    // Act
    const result = buildManagedColumnUpdates(headers, managedValues);

    // Assert
    expect(result).toEqual([
      { columnIndex: 5, value: 'pending_review' },
      { columnIndex: 6, value: 'inq_2' }
    ]);
  });
});
