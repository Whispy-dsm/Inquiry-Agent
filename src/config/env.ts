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

const optionalStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  }

  return value;
}, z.string().min(1).optional());

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
  ENABLE_INTERNAL_EVIDENCE_ROUTER: booleanStringSchema.default(false),
  ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH: booleanStringSchema.default(false),
  INTERNAL_EVIDENCE_GITHUB_TOKEN: optionalStringSchema,
  INTERNAL_EVIDENCE_GITHUB_API_BASE_URL: optionalStringSchema,
  INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS: optionalStringSchema,
  INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS: optionalStringSchema,
  INTERNAL_EVIDENCE_GITHUB_MAX_FETCHED_FILE_BYTES: z.coerce.number().int().positive().default(1_000_000),
  ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH: booleanStringSchema.default(false),
  INTERNAL_EVIDENCE_NOTION_TOKEN: optionalStringSchema,
  INTERNAL_EVIDENCE_NOTION_API_BASE_URL: optionalStringSchema,
  INTERNAL_EVIDENCE_NOTION_VERSION: z.string().min(1).default('2026-03-11'),
  INTERNAL_EVIDENCE_NOTION_PAGE_IDS: optionalStringSchema,
  ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK: booleanStringSchema.default(false),
  INTERNAL_EVIDENCE_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-004'),
  INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES: z.coerce.number().int().positive().default(8),
  ENABLE_KNOWLEDGE_CIRCUIT: booleanStringSchema.default(false),
  KNOWLEDGE_CIRCUIT_DB_PATH: z.string().min(1).default('./data/knowledge-circuit.sqlite'),
  KNOWLEDGE_CIRCUIT_MAX_HOPS: z.coerce.number().int().min(0).max(1).default(1),
  KNOWLEDGE_CIRCUIT_MAX_NODES: z.coerce.number().int().positive().default(12),
  KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS: z.coerce.number().int().positive().default(90),
  KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS: z.coerce.number().int().positive().default(50000),
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
