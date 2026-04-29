import { describe, expect, it, vi } from 'vitest';
import { GmailClient } from '../../src/email/gmailClient.js';

describe('GmailClient', () => {
  it('should return a dry-run message id without calling Gmail send when dry-run is enabled', async () => {
    // Arrange
    const gmail = {
      users: {
        messages: {
          send: vi.fn(),
        },
      },
    };
    const target = new GmailClient(gmail as never, true);

    // Act
    const result = await target.sendEmail({
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
    });

    // Assert
    expect(result.dryRun).toBe(true);
    expect(result.messageId).toMatch(/^dry_/);
    expect(gmail.users.messages.send).not.toHaveBeenCalled();
  });

  it('should call Gmail send when dry-run is disabled', async () => {
    // Arrange
    const gmail = {
      users: {
        messages: {
          send: vi.fn().mockResolvedValue({ data: { id: 'gmail_123' } }),
        },
      },
    };
    const target = new GmailClient(gmail as never, false);

    // Act
    const result = await target.sendEmail({
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '문의 답변드립니다',
      body: '안녕하세요.',
    });

    // Assert
    expect(result).toEqual({ messageId: 'gmail_123', dryRun: false });
    expect(gmail.users.messages.send).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { raw: expect.any(String) },
    });
  });
});
