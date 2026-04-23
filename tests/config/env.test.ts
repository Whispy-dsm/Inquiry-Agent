import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('should parse required environment values', () => {
    // Arrange
    const input = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: 'Form Responses 1',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      OPENROUTER_API_KEY: 'openrouter-key',
      OPENROUTER_MODEL: 'openai/gpt-4o-mini',
      GMAIL_FROM_EMAIL: 'support@example.com',
      GMAIL_FROM_NAME: 'Support Team',
      POLL_INTERVAL_MS: '30000',
      DRY_RUN_EMAIL: 'true',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.GOOGLE_SHEET_ID).toBe('sheet-id');
    expect(result.POLL_INTERVAL_MS).toBe(30000);
    expect(result.DRY_RUN_EMAIL).toBe(true);
  });
});
