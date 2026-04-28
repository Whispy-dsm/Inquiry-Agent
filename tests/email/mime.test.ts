import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { createRawEmail } from '../../src/email/mime.js';

describe('createRawEmail', () => {
  it('should create a base64url encoded Gmail raw message with UTF-8 headers', () => {
    // Arrange
    const input = {
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '문의 답변드립니다',
      body: '안녕하세요.'
    };

    // Act
    const result = createRawEmail(input);

    // Assert
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
    expect(Buffer.from(result, 'base64url').toString('utf8')).toContain('To: user@example.com');
    expect(Buffer.from(result, 'base64url').toString('utf8')).toContain('Subject: =?UTF-8?B?');
  });
});
