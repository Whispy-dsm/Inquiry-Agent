import { z } from 'zod';

const booleanStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

/** 실행에 필요한 모든 환경변수를 런타임 시작 시 검증하는 schema입니다. */
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
  DISCORD_REVIEW_POST_INTERVAL_MS: z.coerce.number().int().nonnegative().default(1000),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
  GMAIL_FROM_EMAIL: z.string().email(),
  GMAIL_FROM_NAME: z.string().min(1).default('Support Team'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(600000),
  ENABLE_FALLBACK_POLLING: booleanStringSchema.default(false),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(3000),
  WEBHOOK_SECRET: z.string().min(1),
  DRY_RUN_EMAIL: booleanStringSchema.default(true),
});

/** 검증된 환경변수 타입입니다. */
export type Env = z.infer<typeof envSchema>;

/** process.env 또는 테스트 입력을 검증하고 타입이 보장된 설정 객체로 반환합니다. */
export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(input);
}
