import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('should parse required environment values', () => {
    // Arrange
    const input = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: '🌙 Whispy에게 문의하기(응답)',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      DISCORD_REVIEW_POST_INTERVAL_MS: '1500',
      GEMINI_API_KEY: 'gemini-key',
      GEMINI_MODEL: 'gemini-2.5-flash-lite',
      GMAIL_FROM_EMAIL: 'support@example.com',
      GMAIL_FROM_NAME: 'Support Team',
      POLL_INTERVAL_MS: '600000',
      ENABLE_FALLBACK_POLLING: 'true',
      WEBHOOK_PORT: '3000',
      WEBHOOK_SECRET: 'shared-secret',
      DRY_RUN_EMAIL: 'true',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.GOOGLE_SHEET_ID).toBe('sheet-id');
    expect(result.DISCORD_REVIEW_POST_INTERVAL_MS).toBe(1500);
    expect(result.POLL_INTERVAL_MS).toBe(600000);
    expect(result.ENABLE_FALLBACK_POLLING).toBe(true);
    expect(result.WEBHOOK_PORT).toBe(3000);
    expect(result.WEBHOOK_SECRET).toBe('shared-secret');
    expect(result.DRY_RUN_EMAIL).toBe(true);
  });

  it('should parse false boolean environment strings as false', () => {
    // Arrange
    const input = {
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: '🌙 Whispy에게 문의하기(응답)',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      GEMINI_API_KEY: 'gemini-key',
      GMAIL_FROM_EMAIL: 'support@example.com',
      ENABLE_FALLBACK_POLLING: 'false',
      WEBHOOK_SECRET: 'shared-secret',
      DRY_RUN_EMAIL: 'false',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.ENABLE_FALLBACK_POLLING).toBe(false);
    expect(result.DRY_RUN_EMAIL).toBe(false);
  });

  it('should default Discord review post interval to one second', () => {
    // Arrange
    const input = {
      GOOGLE_SHEET_ID: 'sheet-id',
      GOOGLE_SHEET_NAME: '?뙔 Whispy?먭쾶 臾몄쓽?섍린(?묐떟)',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_INQUIRY_CHANNEL_ID: 'channel-id',
      GEMINI_API_KEY: 'gemini-key',
      GMAIL_FROM_EMAIL: 'support@example.com',
      WEBHOOK_SECRET: 'shared-secret',
    };

    // Act
    const result = loadEnv(input);

    // Assert
    expect(result.DISCORD_REVIEW_POST_INTERVAL_MS).toBe(1000);
  });
});
