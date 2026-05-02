import { describe, expect, it } from 'vitest';
import { buildManagedColumnUpdates, mapRowToInquiry } from '../../src/sheets/sheetColumns.js';

describe('sheetColumns', () => {
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
    'status',
    'inquiry_id',
  ];

  it('should map a Whispy form OTHER row to an inquiry', () => {
    // Arrange
    const row = [
      '2026. 4. 23 오후 2:00:00',
      '그 외 문의하고 싶은 내용이 있어요',
      '',
      '',
      '',
      '',
      '',
      '',
      '기타 문의 내용입니다.',
      '',
      '동의',
      'reply@example.com',
      'account@example.com',
      '',
      'TRUE',
      '',
      '',
    ];

    // Act
    const result = mapRowToInquiry(whispyHeaders, row, 2);

    // Assert
    expect(result).toEqual({
      inquiryId: 'inq_2',
      rowNumber: 2,
      submittedAt: '2026. 4. 23 오후 2:00:00',
      email: 'reply@example.com',
      name: '',
      type: 'OTHER',
      message: '기타 문의 내용입니다.',
      status: 'new',
    });
  });

  it('should pick the message column that matches the selected inquiry type', () => {
    // Arrange
    const row = [
      '2026. 4. 23 오후 3:00:00',
      '서비스 내 궁금한 점이 있어요',
      '',
      '',
      '서비스 질문입니다.',
      '',
      '',
      '',
      '선택되지 않은 기타 문의입니다.',
      '',
      '동의',
      'reply@example.com',
      '',
      'Galaxy S23 / One UI 6',
      'TRUE',
      'pending_review',
      'inq_existing',
    ];

    // Act
    const result = mapRowToInquiry(whispyHeaders, row, 3);

    // Assert
    expect(result).toMatchObject({
      inquiryId: 'inq_existing',
      type: 'SERVICE_QUESTION',
      message: '서비스 질문입니다.',
      deviceInfo: 'Galaxy S23 / One UI 6',
      status: 'pending_review',
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
    const result = buildManagedColumnUpdates(whispyHeaders, managedValues);

    // Assert
    expect(result).toEqual([
      { columnIndex: 15, value: 'pending_review' },
      { columnIndex: 16, value: 'inq_2' },
    ]);
  });
});
