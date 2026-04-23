import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  GOOGLE_SHEET_ID: z.string().min(1),
  GOOGLE_SHEET_NAME: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_INQUIRY_CHANNEL_ID: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-4o-mini'),
  GMAIL_FROM_EMAIL: z.string().email(),
  GMAIL_FROM_NAME: z.string().min(1).default('Support Team'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  DRY_RUN_EMAIL: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(input);
}
