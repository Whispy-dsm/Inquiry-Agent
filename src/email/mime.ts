/** Gmail raw send에 필요한 이메일 입력 계약입니다. */
export interface RawEmailInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}

/** UTF-8 제목/발신자명을 RFC 2047 encoded-word 형태로 인코딩합니다. */
function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * Gmail API `users.messages.send`가 요구하는 base64url raw MIME 메시지를 생성합니다.
 *
 * @param input - plain text 이메일 구성값
 * @returns Gmail raw send에 넣을 base64url 문자열
 */
export function createRawEmail(input: RawEmailInput): string {
  const message = [
    `From: ${encodeHeader(input.fromName)} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ].join('\r\n');

  return Buffer.from(message, 'utf8').toString('base64url');
}
