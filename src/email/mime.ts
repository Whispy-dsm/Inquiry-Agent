export interface RawEmailInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

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
