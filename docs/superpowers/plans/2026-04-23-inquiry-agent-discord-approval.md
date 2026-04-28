# Inquiry Agent Discord Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript inquiry-handling agent that reads Google Sheets inquiries, generates AI email drafts, asks the CX team for approval/edit/reject in Discord, sends approved replies by email, and writes final status back to the sheet.

**Architecture:** A single-instance Node.js worker owns polling, Discord interactions, AI drafting, Gmail sending, and Sheet status updates. The system uses Google Sheets as the source of truth for inquiry state, Discord as the human approval queue, and an interchangeable context provider for future DB/vector context.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Zod, googleapis, discord.js, Google Gen AI SDK, dotenv, pino.

---

## PRD

### Product Problem

The current CX flow is manual:

1. User submits a Google Form inquiry.
2. Google Sheets receives the inquiry row.
3. Apps Script sends a Discord alert.
4. CX checks the inquiry in Voc/Sheet.
5. CX writes the response.
6. CX sends the reply email to the user.

The target system should reduce the time spent reading, drafting, and sending repetitive replies without allowing unreviewed AI output to reach users.

### Target User

The first user is the CX team member watching the shared Discord inquiry channel. Any team member may process an inquiry.

### Inquiry Types

The Google Form already classifies inquiries into four user-facing categories:

1. `APP_ERROR`: 앱 내 기능에 오류가 있어요
2. `SERVICE_QUESTION`: 서비스에 대해 궁금한 점이 있어요
3. `SUGGESTION`: 건의사항이 있어요
4. `OTHER`: 그 외 문의하고 싶은 내용이 있어요

### Core Workflow

1. Worker polls Google Sheets for rows with `status` empty or `new`.
2. Worker normalizes each row into an `Inquiry`.
3. Worker assigns or reuses a stable `inquiryId`.
4. Worker retrieves context through a `ContextProvider`.
5. Worker generates an AI draft containing subject, body, summary, risk level, and missing information.
6. Worker posts a Discord review card with buttons: `Approve`, `Edit`, `Reject`.
7. CX clicks:
   - `Approve`: send draft email as-is.
   - `Edit`: open Discord modal, let CX edit subject/body, then send.
   - `Reject`: mark rejected and do not email.
8. Worker writes final status and audit fields back to Google Sheets.

### Safety Requirements

- No AI draft is sent without a Discord approval action.
- `OTHER` inquiries default to `high` risk.
- Any inquiry containing account deletion, legal, security, payment/refund, personal data deletion, or sensitive personal data terms is `high` risk.
- High-risk inquiries show a visible warning in Discord.
- One inquiry can be sent only once.
- Team-wide channel processing must prevent duplicate sends.
- Every final action records the Discord user id, timestamp, final email body, and Gmail message id when sent.

### Non-Goals

- No public dashboard in the first version.
- No full CRM replacement.
- No automatic send without a human click.
- No production multi-replica deployment until durable locking is introduced.
- No final DB/vector retrieval implementation in the first version; the interface is included so the later DB/context layer plugs in cleanly.

### Acceptance Criteria

- A sample row in Google Sheets becomes one Discord review card.
- The card contains inquiry type, requester email, summary, risk, and draft answer.
- Approve sends exactly one email and updates the sheet to `sent`.
- Edit opens a Discord modal; submitted edits are sent and saved to the sheet.
- Reject updates the sheet to `rejected` and sends no email.
- Re-clicking Approve/Edit/Reject after a row is sent or rejected does not send another email.
- Unit tests cover row parsing, risk classification, AI draft parsing fallback, MIME email encoding, lock behavior, and workflow transitions.
- Integration-style tests run against fake Google/Discord/Gmail/AI clients without real network calls.

## File Structure

```text
package.json
tsconfig.json
vitest.config.ts
.env
.gitignore
src/
  config/env.ts
  domain/inquiry.ts
  domain/risk.ts
  domain/status.ts
  sheets/sheetColumns.ts
  sheets/googleSheetsClient.ts
  ai/contextProvider.ts
  ai/GeminiDraftGenerator.ts
  ai/prompt.ts
  discord/discordBot.ts
  discord/renderInquiryMessage.ts
  discord/interactionHandlers.ts
  email/gmailClient.ts
  email/mime.ts
  workflow/inquiryWorkflow.ts
  workflow/inquiryLock.ts
  worker.ts
  index.ts
tests/
  fixtures/inquiries.ts
  domain/risk.test.ts
  sheets/sheetColumns.test.ts
  ai/GeminiDraftGenerator.test.ts
  discord/renderInquiryMessage.test.ts
  email/mime.test.ts
  workflow/inquiryLock.test.ts
  workflow/inquiryWorkflow.test.ts
docs/
  runbook.md
  evals/inquiry-agent-cases.md
```

Responsibilities:

- `src/domain/*`: shared types and pure business rules.
- `src/sheets/*`: Google Sheets row mapping and updates.
- `src/ai/*`: prompt, context abstraction, Gemini implementation.
- `src/discord/*`: Discord messages, buttons, modals, interaction handling.
- `src/email/*`: Gmail raw MIME encoding and send wrapper.
- `src/workflow/*`: orchestration and duplicate-send protection.
- `src/worker.ts`: bootstraps clients and starts polling plus Discord bot.
- `tests/*`: fast tests with fakes; no real Google, Discord, Gmail, or LLM calls.

## Environment Contract

```bash
NODE_ENV=development
LOG_LEVEL=debug

GOOGLE_SHEET_ID=replace-with-sheet-id
GOOGLE_SHEET_NAME=Form Responses 1
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=replace-with-google-oauth-client-secret
GOOGLE_OAUTH_REFRESH_TOKEN=replace-with-refresh-token

DISCORD_BOT_TOKEN=replace-with-discord-bot-token
DISCORD_INQUIRY_CHANNEL_ID=replace-with-channel-id

GEMINI_API_KEY=replace-with-gemini-key
GEMINI_MODEL=gemini-2.5-flash-lite

GMAIL_FROM_EMAIL=support@example.com
GMAIL_FROM_NAME=Support Team

POLL_INTERVAL_MS=30000
DRY_RUN_EMAIL=true
```

OAuth scopes required for the first version:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/gmail.send
```

## Google Sheet Columns

The worker should create missing output columns on first run if they do not exist.

Input columns expected from Google Form:

```text
Timestamp
Email Address
문의 유형
문의 내용
이름
```

Managed columns:

```text
inquiry_id
status
risk_level
risk_reasons
discord_channel_id
discord_message_id
draft_subject
draft_body
final_subject
final_body
handled_by
handled_at
gmail_message_id
error_message
```

Allowed statuses:

```text
new
drafting
pending_review
sending
sent
rejected
failed
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Prepare locally: `.env`
- Create: `.gitignore`

- [ ] **Step 1: Write the package manifest**

Create `package.json`:

```json
{
  "name": "inquiry-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gemini/sdk": "^1.50.1",
    "discord.js": "^14.19.3",
    "dotenv": "^16.5.0",
    "googleapis": "^148.0.0",
    "pino": "^9.6.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@typescript-eslint/eslint-plugin": "^8.31.0",
    "@typescript-eslint/parser": "^8.31.0",
    "eslint": "^9.25.0",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.2"
  }
}
```

- [ ] **Step 2: Write TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Write Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json']
    }
  }
});
```

- [ ] **Step 4: Prepare local env file**

Create a local `.env` using the Environment Contract section exactly.

- [ ] **Step 5: Write gitignore**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
*.log
*.local
google-credentials.json
token.json
auth.json
.DS_Store
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits with code 0.

- [ ] **Step 7: Verify empty project tooling**

Run:

```bash
npm run typecheck
npm run test
```

Expected: typecheck passes; tests pass with zero tests or no test files.

- [ ] **Step 8: Commit if commit authorization exists**

Only run this commit if the user has explicitly authorized commits in the execution session:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "Prepare TypeScript inquiry agent foundation

The project needs a strict TypeScript runtime before Sheets, Discord, AI, and Gmail work can be implemented safely.

Constraint: No production credentials are committed
Confidence: high
Scope-risk: narrow
Tested: npm run typecheck; npm run test
Not-tested: Runtime integrations are not implemented yet"
```

## Task 2: Domain Types and Risk Rules

**Files:**
- Create: `src/domain/status.ts`
- Create: `src/domain/inquiry.ts`
- Create: `src/domain/risk.ts`
- Create: `tests/fixtures/inquiries.ts`
- Create: `tests/domain/risk.test.ts`

- [ ] **Step 1: Write failing risk tests**

Create `tests/domain/risk.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyRisk } from '../../src/domain/risk.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('classifyRisk', () => {
  it('marks OTHER inquiries as high risk', () => {
    const result = classifyRisk({ ...baseInquiry, type: 'OTHER', message: '기타 문의입니다.' });
    expect(result.level).toBe('high');
    expect(result.reasons).toContain('OTHER 문의 유형은 범위가 넓어 고위험으로 검토합니다.');
  });

  it('marks deletion requests as high risk', () => {
    const result = classifyRisk({ ...baseInquiry, type: 'SERVICE_QUESTION', message: '개인정보 삭제 요청합니다.' });
    expect(result.level).toBe('high');
    expect(result.reasons.join(' ')).toContain('삭제');
  });

  it('keeps ordinary service questions low risk', () => {
    const result = classifyRisk({ ...baseInquiry, type: 'SERVICE_QUESTION', message: '서비스 이용 방법이 궁금합니다.' });
    expect(result.level).toBe('low');
    expect(result.reasons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/domain/risk.test.ts
```

Expected: FAIL because `src/domain/risk.ts` and fixture files do not exist.

- [ ] **Step 3: Implement domain types**

Create `src/domain/status.ts`:

```ts
export const inquiryStatuses = ['new', 'drafting', 'pending_review', 'sending', 'sent', 'rejected', 'failed'] as const;

export type InquiryStatus = (typeof inquiryStatuses)[number];

export function isTerminalStatus(status: InquiryStatus): boolean {
  return status === 'sent' || status === 'rejected';
}
```

Create `src/domain/inquiry.ts`:

```ts
import type { InquiryStatus } from './status.js';

export const inquiryTypes = ['APP_ERROR', 'SERVICE_QUESTION', 'SUGGESTION', 'OTHER'] as const;

export type InquiryType = (typeof inquiryTypes)[number];

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Inquiry {
  inquiryId: string;
  rowNumber: number;
  submittedAt: string;
  email: string;
  name: string;
  type: InquiryType;
  message: string;
  status: InquiryStatus;
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

export interface InquiryDraft {
  inquiryId: string;
  summary: string;
  subject: string;
  body: string;
  risk: RiskAssessment;
  missingInformation: string[];
}

export interface FinalReply {
  inquiryId: string;
  subject: string;
  body: string;
  handledBy: string;
}
```

Create `src/domain/risk.ts`:

```ts
import type { Inquiry, RiskAssessment } from './inquiry.js';

const highRiskPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /개인정보|개인 정보|삭제|탈퇴|계정 삭제/i, reason: '개인정보 또는 계정 삭제 요청은 고위험으로 검토합니다.' },
  { pattern: /환불|결제|청구|영수증|구독/i, reason: '결제 또는 환불 관련 문의는 고위험으로 검토합니다.' },
  { pattern: /법적|소송|신고|분쟁/i, reason: '법적 또는 분쟁 가능성이 있는 문의는 고위험으로 검토합니다.' },
  { pattern: /보안|해킹|취약점|유출/i, reason: '보안 관련 문의는 고위험으로 검토합니다.' }
];

export function classifyRisk(inquiry: Inquiry): RiskAssessment {
  const reasons: string[] = [];

  if (inquiry.type === 'OTHER') {
    reasons.push('OTHER 문의 유형은 범위가 넓어 고위험으로 검토합니다.');
  }

  for (const item of highRiskPatterns) {
    if (item.pattern.test(inquiry.message)) {
      reasons.push(item.reason);
    }
  }

  if (reasons.length > 0) {
    return { level: 'high', reasons: Array.from(new Set(reasons)) };
  }

  if (inquiry.type === 'APP_ERROR') {
    return { level: 'medium', reasons: ['앱 오류 문의는 재현 정보 확인이 필요할 수 있습니다.'] };
  }

  return { level: 'low', reasons: [] };
}
```

Create `tests/fixtures/inquiries.ts`:

```ts
import type { Inquiry } from '../../src/domain/inquiry.js';

export const baseInquiry: Inquiry = {
  inquiryId: 'inq_20260423_0001',
  rowNumber: 2,
  submittedAt: '2026-04-23T05:00:00.000Z',
  email: 'user@example.com',
  name: '홍길동',
  type: 'SERVICE_QUESTION',
  message: '서비스 이용 방법이 궁금합니다.',
  status: 'new'
};
```

- [ ] **Step 4: Run test**

Run:

```bash
npm run test -- tests/domain/risk.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit if commit authorization exists**

```bash
git add src/domain tests/fixtures tests/domain
git commit -m "Define inquiry domain and risk rules

The Discord approval flow needs a stable inquiry model and deterministic risk classification before AI drafting or email sending can be trusted.

Constraint: OTHER inquiries are treated as high risk by product decision
Confidence: high
Scope-risk: narrow
Tested: npm run test -- tests/domain/risk.test.ts
Not-tested: Google Sheets row parsing is covered by Task 3"
```

## Task 3: Google Sheets Row Mapping

**Files:**
- Create: `src/sheets/sheetColumns.ts`
- Create: `tests/sheets/sheetColumns.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/sheets/sheetColumns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapRowToInquiry, buildManagedColumnUpdates } from '../../src/sheets/sheetColumns.js';

describe('sheetColumns', () => {
  const headers = ['Timestamp', 'Email Address', '문의 유형', '문의 내용', '이름', 'status', 'inquiry_id'];

  it('maps a Google Form row to an Inquiry', () => {
    const inquiry = mapRowToInquiry(headers, ['2026. 4. 23 오후 2:00:00', 'user@example.com', '서비스에 대해 궁금한 점이 있어요', '사용법 알려주세요', '홍길동', '', ''], 2);
    expect(inquiry).toMatchObject({
      rowNumber: 2,
      email: 'user@example.com',
      name: '홍길동',
      type: 'SERVICE_QUESTION',
      message: '사용법 알려주세요',
      status: 'new'
    });
    expect(inquiry.inquiryId).toBe('inq_2');
  });

  it('builds updates for managed fields', () => {
    const updates = buildManagedColumnUpdates(headers, {
      status: 'pending_review',
      inquiry_id: 'inq_2',
      draft_subject: '문의 답변드립니다'
    });
    expect(updates).toEqual([
      { columnIndex: 5, value: 'pending_review' },
      { columnIndex: 6, value: 'inq_2' }
    ]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/sheets/sheetColumns.test.ts
```

Expected: FAIL because `src/sheets/sheetColumns.ts` does not exist.

- [ ] **Step 3: Implement row mapping**

Create `src/sheets/sheetColumns.ts`:

```ts
import type { Inquiry, InquiryType } from '../domain/inquiry.js';
import type { InquiryStatus } from '../domain/status.js';

export const managedColumns = [
  'inquiry_id',
  'status',
  'risk_level',
  'risk_reasons',
  'discord_channel_id',
  'discord_message_id',
  'draft_subject',
  'draft_body',
  'final_subject',
  'final_body',
  'handled_by',
  'handled_at',
  'gmail_message_id',
  'error_message'
] as const;

export type ManagedColumn = (typeof managedColumns)[number];

const typeMap: Record<string, InquiryType> = {
  '앱 내 기능에 오류가 있어요': 'APP_ERROR',
  '서비스에 대해 궁금한 점이 있어요': 'SERVICE_QUESTION',
  '건의사항이 있어요': 'SUGGESTION',
  '그 외 문의하고 싶은 내용이 있어요': 'OTHER'
};

export function mapRowToInquiry(headers: string[], row: string[], rowNumber: number): Inquiry {
  const get = (header: string): string => {
    const index = headers.indexOf(header);
    return index >= 0 ? row[index]?.trim() ?? '' : '';
  };

  const rawType = get('문의 유형');
  const type = typeMap[rawType] ?? 'OTHER';
  const status = normalizeStatus(get('status'));
  const inquiryId = get('inquiry_id') || `inq_${rowNumber}`;

  return {
    inquiryId,
    rowNumber,
    submittedAt: get('Timestamp'),
    email: get('Email Address'),
    name: get('이름'),
    type,
    message: get('문의 내용'),
    status
  };
}

export function normalizeStatus(value: string): InquiryStatus {
  if (value === 'drafting' || value === 'pending_review' || value === 'sending' || value === 'sent' || value === 'rejected' || value === 'failed') {
    return value;
  }
  return 'new';
}

export function buildManagedColumnUpdates(headers: string[], values: Partial<Record<ManagedColumn, string>>): Array<{ columnIndex: number; value: string }> {
  return Object.entries(values).flatMap(([key, value]) => {
    const columnIndex = headers.indexOf(key);
    if (columnIndex < 0 || value === undefined) {
      return [];
    }
    return [{ columnIndex, value }];
  });
}
```

- [ ] **Step 4: Run test**

Run:

```bash
npm run test -- tests/sheets/sheetColumns.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit if commit authorization exists**

```bash
git add src/sheets/sheetColumns.ts tests/sheets/sheetColumns.test.ts
git commit -m "Map Google Sheets rows into inquiries

The worker needs deterministic parsing from the current Google Form sheet before it can generate drafts or update state.

Constraint: Current form labels are Korean user-facing labels
Confidence: high
Scope-risk: narrow
Tested: npm run test -- tests/sheets/sheetColumns.test.ts
Not-tested: Live Google Sheets API access"
```

## Task 4: Google Sheets Client

**Files:**
- Create: `src/config/env.ts`
- Create: `src/sheets/googleSheetsClient.ts`
- Create: `tests/sheets/googleSheetsClient.test.ts`

- [ ] **Step 1: Write environment config**

Create `src/config/env.ts`:

```ts
import 'dotenv/config';
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
  gemini_API_KEY: z.string().min(1),
  gemini_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
  GMAIL_FROM_EMAIL: z.string().email(),
  GMAIL_FROM_NAME: z.string().min(1).default('Support Team'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  DRY_RUN_EMAIL: z.coerce.boolean().default(true)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(input);
}
```

- [ ] **Step 2: Write failing client tests**

Create `tests/sheets/googleSheetsClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsClient } from '../../src/sheets/googleSheetsClient.js';

describe('GoogleSheetsClient', () => {
  it('returns only new inquiries', async () => {
    const fakeSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                ['Timestamp', 'Email Address', '문의 유형', '문의 내용', '이름', 'status', 'inquiry_id'],
                ['2026-04-23', 'a@example.com', '서비스에 대해 궁금한 점이 있어요', '질문', 'A', '', ''],
                ['2026-04-23', 'b@example.com', '건의사항이 있어요', '건의', 'B', 'sent', 'inq_3']
              ]
            }
          }),
          update: vi.fn()
        }
      }
    };

    const client = new GoogleSheetsClient(fakeSheets as never, 'sheet-id', 'Form Responses 1');
    const inquiries = await client.listNewInquiries();
    expect(inquiries).toHaveLength(1);
    expect(inquiries[0]?.email).toBe('a@example.com');
  });
});
```

- [ ] **Step 3: Implement client**

Create `src/sheets/googleSheetsClient.ts`:

```ts
import { google, type sheets_v4 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Inquiry } from '../domain/inquiry.js';
import type { ManagedColumn } from './sheetColumns.js';
import { buildManagedColumnUpdates, managedColumns, mapRowToInquiry } from './sheetColumns.js';

export class GoogleSheetsClient {
  constructor(
    private readonly sheets: sheets_v4.Sheets,
    private readonly spreadsheetId: string,
    private readonly sheetName: string
  ) {}

  static fromOAuth(auth: OAuth2Client, spreadsheetId: string, sheetName: string): GoogleSheetsClient {
    return new GoogleSheetsClient(google.sheets({ version: 'v4', auth }), spreadsheetId, sheetName);
  }

  async listNewInquiries(): Promise<Inquiry[]> {
    const { headers, rows } = await this.readRows();
    return rows
      .map((row, index) => mapRowToInquiry(headers, row, index + 2))
      .filter((inquiry) => inquiry.status === 'new');
  }

  async updateManagedFields(rowNumber: number, values: Partial<Record<ManagedColumn, string>>): Promise<void> {
    const { headers } = await this.readRows();
    const updates = buildManagedColumnUpdates(headers, values);
    for (const update of updates) {
      const columnLetter = toA1Column(update.columnIndex + 1);
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.sheetName}'!${columnLetter}${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[update.value]] }
      });
    }
  }

  async ensureManagedColumns(): Promise<void> {
    const { headers } = await this.readRows();
    const missing = managedColumns.filter((column) => !headers.includes(column));
    if (missing.length === 0) {
      return;
    }

    const startColumn = headers.length + 1;
    const endColumn = headers.length + missing.length;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.sheetName}'!${toA1Column(startColumn)}1:${toA1Column(endColumn)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [missing] }
    });
  }

  private async readRows(): Promise<{ headers: string[]; rows: string[][] }> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.sheetName}'`
    });
    const values = response.data.values ?? [];
    const headers = (values[0] ?? []).map(String);
    const rows = values.slice(1).map((row) => row.map(String));
    return { headers, rows };
  }
}

export function toA1Column(index: number): string {
  let current = index;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- tests/sheets
```

Expected: PASS.

## Task 5: AI Context and Draft Generator

**Files:**
- Create: `src/ai/contextProvider.ts`
- Create: `src/ai/prompt.ts`
- Create: `src/ai/GeminiDraftGenerator.ts`
- Create: `tests/ai/GeminiDraftGenerator.test.ts`

- [ ] **Step 1: Write failing AI draft test**

Create `tests/ai/GeminiDraftGenerator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, parseDraftJson } from '../../src/ai/GeminiDraftGenerator.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('GeminiDraftGenerator', () => {
  it('builds a prompt that includes inquiry and context', () => {
    const prompt = buildDraftPrompt(baseInquiry, ['FAQ: 서비스는 앱 내 설정에서 확인할 수 있습니다.']);
    expect(prompt).toContain('SERVICE_QUESTION');
    expect(prompt).toContain('서비스는 앱 내 설정');
  });

  it('parses valid JSON draft output', () => {
    const draft = parseDraftJson(baseInquiry, '{"summary":"사용법 문의","subject":"문의 답변드립니다","body":"안녕하세요. 안내드립니다.","missingInformation":[]}');
    expect(draft.subject).toBe('문의 답변드립니다');
    expect(draft.body).toContain('안녕하세요');
  });

  it('falls back to safe draft when model output is invalid', () => {
    const draft = parseDraftJson(baseInquiry, 'not json');
    expect(draft.subject).toBe('문의 확인 후 안내드리겠습니다');
    expect(draft.body).toContain('담당자가 확인');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- tests/ai/GeminiDraftGenerator.test.ts
```

Expected: FAIL because AI files do not exist.

- [ ] **Step 3: Implement context and prompt files**

Create `src/ai/contextProvider.ts`:

```ts
import type { Inquiry } from '../domain/inquiry.js';

export interface ContextProvider {
  findRelevantContext(inquiry: Inquiry): Promise<string[]>;
}

export class StaticContextProvider implements ContextProvider {
  constructor(private readonly entries: string[] = []) {}

  async findRelevantContext(): Promise<string[]> {
    return this.entries;
  }
}
```

Create `src/ai/prompt.ts`:

```ts
export const draftSystemPrompt = [
  '당신은 CX팀을 돕는 한국어 문의 답변 초안 작성자입니다.',
  '사용자에게 이메일로 보낼 수 있는 정중하고 간결한 답변 초안을 작성합니다.',
  '확인된 근거가 부족하면 단정하지 말고 담당자가 확인 후 안내하겠다고 씁니다.',
  '환불, 계정 삭제, 개인정보, 법적 문제, 보안 문제는 확정 답변을 하지 않습니다.',
  '출력은 JSON 하나만 반환합니다.',
  'JSON schema: {"summary":"string","subject":"string","body":"string","missingInformation":["string"]}'
].join('\n');
```

Create `src/ai/GeminiDraftGenerator.ts`:

```ts
import gemini from '@gemini/sdk';
import { z } from 'zod';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { classifyRisk } from '../domain/risk.js';
import type { ContextProvider } from './contextProvider.js';
import { draftSystemPrompt } from './prompt.js';

const draftSchema = z.object({
  summary: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  missingInformation: z.array(z.string()).default([])
});

export interface DraftGenerator {
  generateDraft(inquiry: Inquiry): Promise<InquiryDraft>;
}

export class GeminiDraftGenerator implements DraftGenerator {
  private readonly client: gemini;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly contextProvider: ContextProvider
  ) {
    this.client = new gemini({ apiKey });
  }

  async generateDraft(inquiry: Inquiry): Promise<InquiryDraft> {
    const context = await this.contextProvider.findRelevantContext(inquiry);
    const prompt = buildDraftPrompt(inquiry, context);
    const result = this.client.callModel({
      model: this.model,
      instructions: draftSystemPrompt,
      input: prompt
    });
    const text = await result.getText();
    return parseDraftJson(inquiry, text);
  }
}

export function buildDraftPrompt(inquiry: Inquiry, context: string[]): string {
  return [
    `문의 ID: ${inquiry.inquiryId}`,
    `문의 유형: ${inquiry.type}`,
    `사용자 이름: ${inquiry.name}`,
    `사용자 이메일: ${inquiry.email}`,
    `문의 내용:\n${inquiry.message}`,
    '참고 근거:',
    context.length > 0 ? context.map((item, index) => `${index + 1}. ${item}`).join('\n') : '제공된 근거 없음',
    '위 정보만 사용해 이메일 답변 초안을 JSON으로 작성하세요.'
  ].join('\n\n');
}

export function parseDraftJson(inquiry: Inquiry, text: string): InquiryDraft {
  const risk = classifyRisk(inquiry);
  try {
    const parsed = draftSchema.parse(JSON.parse(extractJson(text)));
    return {
      inquiryId: inquiry.inquiryId,
      summary: parsed.summary,
      subject: parsed.subject,
      body: parsed.body,
      risk,
      missingInformation: parsed.missingInformation
    };
  } catch {
    return {
      inquiryId: inquiry.inquiryId,
      summary: 'AI 초안 파싱 실패',
      subject: '문의 확인 후 안내드리겠습니다',
      body: `${inquiry.name}님, 안녕하세요.\n\n문의해 주셔서 감사합니다. 남겨주신 내용은 담당자가 확인한 뒤 정확히 안내드리겠습니다.\n\n감사합니다.`,
      risk,
      missingInformation: ['AI 초안 생성 결과를 파싱하지 못했습니다.']
    };
  }
}

function extractJson(text: string): string {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    return text;
  }
  return text.slice(first, last + 1);
}
```

- [ ] **Step 4: Run AI tests**

Run:

```bash
npm run test -- tests/ai/GeminiDraftGenerator.test.ts
```

Expected: PASS.

## Task 6: Email MIME and Gmail Client

**Files:**
- Create: `src/email/mime.ts`
- Create: `src/email/gmailClient.ts`
- Create: `tests/email/mime.test.ts`

- [ ] **Step 1: Write failing MIME tests**

Create `tests/email/mime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRawEmail } from '../../src/email/mime.js';

describe('createRawEmail', () => {
  it('creates base64url encoded Gmail raw message', () => {
    const raw = createRawEmail({
      fromEmail: 'support@example.com',
      fromName: 'Support Team',
      to: 'user@example.com',
      subject: '문의 답변드립니다',
      body: '안녕하세요.'
    });
    expect(raw).not.toContain('+');
    expect(raw).not.toContain('/');
    expect(raw).not.toContain('=');
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: user@example.com');
    expect(decoded).toContain('Subject: =?UTF-8?B?');
  });
});
```

- [ ] **Step 2: Implement MIME and Gmail client**

Create `src/email/mime.ts`:

```ts
export interface RawEmailInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}

export function createRawEmail(input: RawEmailInput): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`;
  const encodedFromName = `=?UTF-8?B?${Buffer.from(input.fromName, 'utf8').toString('base64')}?=`;
  const message = [
    `From: ${encodedFromName} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}
```

Create `src/email/gmailClient.ts`:

```ts
import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { createRawEmail, type RawEmailInput } from './mime.js';

export interface EmailSendResult {
  messageId: string;
  dryRun: boolean;
}

export class GmailClient {
  constructor(
    private readonly gmail: gmail_v1.Gmail,
    private readonly dryRun: boolean
  ) {}

  static fromOAuth(auth: OAuth2Client, dryRun: boolean): GmailClient {
    return new GmailClient(google.gmail({ version: 'v1', auth }), dryRun);
  }

  async sendEmail(input: RawEmailInput): Promise<EmailSendResult> {
    const raw = createRawEmail(input);
    if (this.dryRun) {
      return { messageId: `dry_${Date.now()}`, dryRun: true };
    }
    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });
    return { messageId: response.data.id ?? 'unknown', dryRun: false };
  }
}
```

- [ ] **Step 3: Run email tests**

Run:

```bash
npm run test -- tests/email/mime.test.ts
```

Expected: PASS.

## Task 7: Discord Message Rendering

**Files:**
- Create: `src/discord/renderInquiryMessage.ts`
- Create: `tests/discord/renderInquiryMessage.test.ts`

- [ ] **Step 1: Write failing render tests**

Create `tests/discord/renderInquiryMessage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderInquiryMessage } from '../../src/discord/renderInquiryMessage.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('renderInquiryMessage', () => {
  it('renders approve edit reject buttons with inquiry id', () => {
    const rendered = renderInquiryMessage({
      inquiry: { ...baseInquiry, type: 'OTHER' },
      draft: {
        inquiryId: baseInquiry.inquiryId,
        summary: '기타 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'high', reasons: ['OTHER 문의 유형은 범위가 넓어 고위험으로 검토합니다.'] },
        missingInformation: []
      }
    });
    expect(rendered.content).toContain('HIGH RISK');
    expect(JSON.stringify(rendered.components)).toContain(`approve:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(rendered.components)).toContain(`edit:${baseInquiry.inquiryId}`);
    expect(JSON.stringify(rendered.components)).toContain(`reject:${baseInquiry.inquiryId}`);
  });
});
```

- [ ] **Step 2: Implement Discord renderer**

Create `src/discord/renderInquiryMessage.ts`:

```ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

export interface RenderInquiryMessageInput {
  inquiry: Inquiry;
  draft: InquiryDraft;
}

export function renderInquiryMessage(input: RenderInquiryMessageInput) {
  const { inquiry, draft } = input;
  const riskLine = draft.risk.level === 'high'
    ? `🚨 HIGH RISK: ${draft.risk.reasons.join(' / ')}`
    : `Risk: ${draft.risk.level}`;

  const content = [
    `새 문의 검토 요청: ${inquiry.inquiryId}`,
    riskLine,
    `유형: ${inquiry.type}`,
    `고객: ${inquiry.name} <${inquiry.email}>`,
    '',
    `요약: ${draft.summary}`,
    '',
    `제목: ${draft.subject}`,
    '```',
    draft.body.slice(0, 1800),
    '```'
  ].join('\n');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`approve:${inquiry.inquiryId}`).setLabel('Approve & Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`edit:${inquiry.inquiryId}`).setLabel('Edit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`reject:${inquiry.inquiryId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  return { content, components: [row] };
}
```

- [ ] **Step 3: Run Discord render test**

Run:

```bash
npm run test -- tests/discord/renderInquiryMessage.test.ts
```

Expected: PASS.

## Task 8: Duplicate Send Lock

**Files:**
- Create: `src/workflow/inquiryLock.ts`
- Create: `tests/workflow/inquiryLock.test.ts`

- [ ] **Step 1: Write failing lock tests**

Create `tests/workflow/inquiryLock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InquiryLock } from '../../src/workflow/inquiryLock.js';

describe('InquiryLock', () => {
  it('allows one holder per inquiry', async () => {
    const lock = new InquiryLock();
    const first = await lock.tryAcquire('inq_1', 'user_a');
    const second = await lock.tryAcquire('inq_1', 'user_b');
    expect(first.acquired).toBe(true);
    expect(second).toEqual({ acquired: false, holder: 'user_a' });
  });

  it('releases lock after work', async () => {
    const lock = new InquiryLock();
    await lock.tryAcquire('inq_1', 'user_a');
    lock.release('inq_1', 'user_a');
    const next = await lock.tryAcquire('inq_1', 'user_b');
    expect(next.acquired).toBe(true);
  });
});
```

- [ ] **Step 2: Implement lock**

Create `src/workflow/inquiryLock.ts`:

```ts
export type LockResult =
  | { acquired: true; holder: string }
  | { acquired: false; holder: string };

export class InquiryLock {
  private readonly holders = new Map<string, string>();

  async tryAcquire(inquiryId: string, holder: string): Promise<LockResult> {
    const current = this.holders.get(inquiryId);
    if (current) {
      return { acquired: false, holder: current };
    }
    this.holders.set(inquiryId, holder);
    return { acquired: true, holder };
  }

  release(inquiryId: string, holder: string): void {
    if (this.holders.get(inquiryId) === holder) {
      this.holders.delete(inquiryId);
    }
  }
}
```

- [ ] **Step 3: Run lock tests**

Run:

```bash
npm run test -- tests/workflow/inquiryLock.test.ts
```

Expected: PASS.

## Task 9: Inquiry Workflow Orchestrator

**Files:**
- Create: `src/workflow/inquiryWorkflow.ts`
- Create: `tests/workflow/inquiryWorkflow.test.ts`

- [ ] **Step 1: Write workflow tests**

Create `tests/workflow/inquiryWorkflow.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { InquiryWorkflow } from '../../src/workflow/inquiryWorkflow.js';
import { baseInquiry } from '../fixtures/inquiries.js';

describe('InquiryWorkflow', () => {
  it('drafts new inquiries and posts them to Discord', async () => {
    const sheets = {
      ensureManagedColumns: vi.fn(),
      listNewInquiries: vi.fn().mockResolvedValue([baseInquiry]),
      updateManagedFields: vi.fn()
    };
    const drafts = {
      generateDraft: vi.fn().mockResolvedValue({
        inquiryId: baseInquiry.inquiryId,
        summary: '서비스 문의',
        subject: '문의 답변드립니다',
        body: '안녕하세요.',
        risk: { level: 'low', reasons: [] },
        missingInformation: []
      })
    };
    const discord = {
      postReview: vi.fn().mockResolvedValue({ channelId: 'channel_1', messageId: 'message_1' })
    };

    const workflow = new InquiryWorkflow(sheets as never, drafts as never, discord as never);
    await workflow.pollOnce();

    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, expect.objectContaining({ status: 'drafting' }));
    expect(discord.postReview).toHaveBeenCalledOnce();
    expect(sheets.updateManagedFields).toHaveBeenCalledWith(baseInquiry.rowNumber, expect.objectContaining({ status: 'pending_review' }));
  });
});
```

- [ ] **Step 2: Implement workflow**

Create `src/workflow/inquiryWorkflow.ts`:

```ts
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';

export interface SheetPort {
  ensureManagedColumns(): Promise<void>;
  listNewInquiries(): Promise<Inquiry[]>;
  updateManagedFields(rowNumber: number, values: Record<string, string>): Promise<void>;
}

export interface DraftPort {
  generateDraft(inquiry: Inquiry): Promise<InquiryDraft>;
}

export interface DiscordReviewPort {
  postReview(inquiry: Inquiry, draft: InquiryDraft): Promise<{ channelId: string; messageId: string }>;
}

export class InquiryWorkflow {
  constructor(
    private readonly sheets: SheetPort,
    private readonly drafts: DraftPort,
    private readonly discord: DiscordReviewPort
  ) {}

  async pollOnce(): Promise<void> {
    await this.sheets.ensureManagedColumns();
    const inquiries = await this.sheets.listNewInquiries();
    for (const inquiry of inquiries) {
      await this.processNewInquiry(inquiry);
    }
  }

  private async processNewInquiry(inquiry: Inquiry): Promise<void> {
    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      inquiry_id: inquiry.inquiryId,
      status: 'drafting'
    });

    const draft = await this.drafts.generateDraft(inquiry);
    const message = await this.discord.postReview(inquiry, draft);

    await this.sheets.updateManagedFields(inquiry.rowNumber, {
      status: 'pending_review',
      risk_level: draft.risk.level,
      risk_reasons: draft.risk.reasons.join(' | '),
      draft_subject: draft.subject,
      draft_body: draft.body,
      discord_channel_id: message.channelId,
      discord_message_id: message.messageId
    });
  }
}
```

- [ ] **Step 3: Run workflow tests**

Run:

```bash
npm run test -- tests/workflow/inquiryWorkflow.test.ts
```

Expected: PASS.

## Task 10: Discord Bot and Interaction Handlers

**Files:**
- Create: `src/discord/discordBot.ts`
- Create: `src/discord/interactionHandlers.ts`

- [ ] **Step 1: Implement Discord review posting**

Create `src/discord/discordBot.ts`:

```ts
import { Client, GatewayIntentBits, type TextChannel } from 'discord.js';
import type { Inquiry, InquiryDraft } from '../domain/inquiry.js';
import { renderInquiryMessage } from './renderInquiryMessage.js';

export class DiscordReviewBot {
  readonly client: Client;

  constructor(
    private readonly token: string,
    private readonly channelId: string
  ) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  async start(): Promise<void> {
    await this.client.login(this.token);
  }

  async postReview(inquiry: Inquiry, draft: InquiryDraft): Promise<{ channelId: string; messageId: string }> {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Discord channel ${this.channelId} is not text based`);
    }
    const message = await (channel as TextChannel).send(renderInquiryMessage({ inquiry, draft }));
    return { channelId: this.channelId, messageId: message.id };
  }
}
```

- [ ] **Step 2: Typecheck Discord review posting**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 11: Persist Review Metadata for Approve/Edit

**Files:**
- Modify: `src/sheets/googleSheetsClient.ts`
- Modify: `src/discord/interactionHandlers.ts`
- Create: `tests/discord/interactionHandlers.test.ts`

- [ ] **Step 1: Add lookup by inquiry id**

Modify `src/sheets/googleSheetsClient.ts` by adding:

```ts
async findInquiryReview(inquiryId: string): Promise<{
  rowNumber: number;
  email: string;
  draftSubject: string;
  draftBody: string;
  status: string;
} | null> {
  const { headers, rows } = await this.readRows();
  const inquiryIdIndex = headers.indexOf('inquiry_id');
  const statusIndex = headers.indexOf('status');
  const emailIndex = headers.indexOf('Email Address');
  const subjectIndex = headers.indexOf('draft_subject');
  const bodyIndex = headers.indexOf('draft_body');

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row[inquiryIdIndex] === inquiryId) {
      return {
        rowNumber: i + 2,
        email: row[emailIndex] ?? '',
        draftSubject: row[subjectIndex] ?? '',
        draftBody: row[bodyIndex] ?? '',
        status: row[statusIndex] ?? 'new'
      };
    }
  }
  return null;
}
```

- [ ] **Step 2: Create complete interaction handlers**

Create `src/discord/interactionHandlers.ts`:

```ts
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from 'discord.js';
import type { GmailClient } from '../email/gmailClient.js';
import type { GoogleSheetsClient } from '../sheets/googleSheetsClient.js';
import type { InquiryLock } from '../workflow/inquiryLock.js';

export interface InteractionHandlerDeps {
  lock: InquiryLock;
  sheets: GoogleSheetsClient;
  gmail: GmailClient;
  fromEmail: string;
  fromName: string;
}

export async function handleReviewButton(interaction: ButtonInteraction, deps: InteractionHandlerDeps): Promise<void> {
  const [action, inquiryId] = interaction.customId.split(':');
  if (!action || !inquiryId) {
    await interaction.reply({ content: '잘못된 액션입니다.', ephemeral: true });
    return;
  }

  if (action === 'edit') {
    const review = await deps.sheets.findInquiryReview(inquiryId);
    const modal = new ModalBuilder().setCustomId(`editSubmit:${inquiryId}`).setTitle('답변 수정 후 발송');
    const subject = new TextInputBuilder()
      .setCustomId('subject')
      .setLabel('이메일 제목')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(review?.draftSubject.slice(0, 100) ?? '');
    const body = new TextInputBuilder()
      .setCustomId('body')
      .setLabel('이메일 본문')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(review?.draftBody.slice(0, 3900) ?? '');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(subject),
      new ActionRowBuilder<TextInputBuilder>().addComponents(body)
    );
    await interaction.showModal(modal);
    return;
  }

  const holder = interaction.user.id;
  const lock = await deps.lock.tryAcquire(inquiryId, holder);
  if (!lock.acquired) {
    await interaction.reply({ content: `이미 <@${lock.holder}> 님이 처리 중입니다.`, ephemeral: true });
    return;
  }

  try {
    const review = await deps.sheets.findInquiryReview(inquiryId);
    if (!review) {
      await interaction.reply({ content: '문의 정보를 찾을 수 없습니다.', ephemeral: true });
      return;
    }
    if (review.status === 'sent' || review.status === 'rejected') {
      await interaction.reply({ content: `이미 처리된 문의입니다. 현재 상태: ${review.status}`, ephemeral: true });
      return;
    }

    if (action === 'reject') {
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'rejected',
        handled_by: holder,
        handled_at: new Date().toISOString()
      });
      await interaction.update({ content: `${interaction.message.content}\n\n처리 결과: Rejected by <@${holder}>`, components: [] });
      return;
    }

    if (action === 'approve') {
      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'sending',
        handled_by: holder,
        handled_at: new Date().toISOString()
      });

      const sent = await deps.gmail.sendEmail({
        fromEmail: deps.fromEmail,
        fromName: deps.fromName,
        to: review.email,
        subject: review.draftSubject,
        body: review.draftBody
      });

      await deps.sheets.updateManagedFields(review.rowNumber, {
        status: 'sent',
        final_subject: review.draftSubject,
        final_body: review.draftBody,
        gmail_message_id: sent.messageId
      });

      await interaction.update({ content: `${interaction.message.content}\n\n처리 결과: Sent by <@${holder}>`, components: [] });
      return;
    }

    await interaction.reply({ content: '지원하지 않는 액션입니다.', ephemeral: true });
  } finally {
    deps.lock.release(inquiryId, holder);
  }
}

export async function handleEditSubmit(interaction: ModalSubmitInteraction): Promise<{ inquiryId: string; subject: string; body: string; handledBy: string }> {
  const [, inquiryId] = interaction.customId.split(':');
  if (!inquiryId) {
    throw new Error('Missing inquiry id in modal submit');
  }
  return {
    inquiryId,
    subject: interaction.fields.getTextInputValue('subject'),
    body: interaction.fields.getTextInputValue('body'),
    handledBy: interaction.user.id
  };
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 12: Worker Bootstrap

**Files:**
- Create: `src/worker.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Implement Google OAuth setup and worker**

Create `src/worker.ts`:

```ts
import { google } from 'googleapis';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { StaticContextProvider } from './ai/contextProvider.js';
import { GeminiDraftGenerator } from './ai/GeminiDraftGenerator.js';
import { DiscordReviewBot } from './discord/discordBot.js';
import { handleEditSubmit, handleReviewButton } from './discord/interactionHandlers.js';
import { GmailClient } from './email/gmailClient.js';
import { GoogleSheetsClient } from './sheets/googleSheetsClient.js';
import { InquiryLock } from './workflow/inquiryLock.js';
import { InquiryWorkflow } from './workflow/inquiryWorkflow.js';

export async function startWorker(): Promise<void> {
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL });

  const oauth = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN });

  const sheetsClient = GoogleSheetsClient.fromOAuth(oauth, env.GOOGLE_SHEET_ID, env.GOOGLE_SHEET_NAME);
  const gmailClient = GmailClient.fromOAuth(oauth, env.DRY_RUN_EMAIL);
  const contextProvider = new StaticContextProvider([]);
  const draftGenerator = new GeminiDraftGenerator(env.gemini_API_KEY, env.gemini_MODEL, contextProvider);
  const discordBot = new DiscordReviewBot(env.DISCORD_BOT_TOKEN, env.DISCORD_INQUIRY_CHANNEL_ID);
  const inquiryLock = new InquiryLock();
  const workflow = new InquiryWorkflow(sheetsClient, draftGenerator, discordBot);

  discordBot.client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleReviewButton(interaction, {
          lock: inquiryLock,
          sheets: sheetsClient,
          gmail: gmailClient,
          fromEmail: env.GMAIL_FROM_EMAIL,
          fromName: env.GMAIL_FROM_NAME
        });
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('editSubmit:')) {
        const edit = await handleEditSubmit(interaction);
        const lock = await inquiryLock.tryAcquire(edit.inquiryId, edit.handledBy);
        if (!lock.acquired) {
          await interaction.reply({ content: `이미 <@${lock.holder}> 님이 처리 중입니다.`, ephemeral: true });
          return;
        }
        try {
          const review = await sheetsClient.findInquiryReview(edit.inquiryId);
          if (!review) {
            await interaction.reply({ content: '문의 정보를 찾을 수 없습니다.', ephemeral: true });
            return;
          }
          if (review.status === 'sent' || review.status === 'rejected') {
            await interaction.reply({ content: `이미 처리된 문의입니다. 현재 상태: ${review.status}`, ephemeral: true });
            return;
          }
          await sheetsClient.updateManagedFields(review.rowNumber, {
            status: 'sending',
            handled_by: edit.handledBy,
            handled_at: new Date().toISOString()
          });
          const sent = await gmailClient.sendEmail({
            fromEmail: env.GMAIL_FROM_EMAIL,
            fromName: env.GMAIL_FROM_NAME,
            to: review.email,
            subject: edit.subject,
            body: edit.body
          });
          await sheetsClient.updateManagedFields(review.rowNumber, {
            status: 'sent',
            final_subject: edit.subject,
            final_body: edit.body,
            gmail_message_id: sent.messageId
          });
          await interaction.reply({ content: '수정된 답변을 이메일로 발송했습니다.', ephemeral: true });
        } finally {
          inquiryLock.release(edit.inquiryId, edit.handledBy);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Discord interaction failed');
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: '처리 중 오류가 발생했습니다. 로그를 확인해 주세요.', ephemeral: true });
      }
    }
  });

  await discordBot.start();
  await workflow.pollOnce();

  setInterval(() => {
    workflow.pollOnce().catch((error) => {
      logger.error({ error }, 'Polling failed');
    });
  }, env.POLL_INTERVAL_MS);

  logger.info('Inquiry agent worker started');
}
```

Create `src/index.ts`:

```ts
import { startWorker } from './worker.js';

startWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

## Task 13: Evals and Runbook

**Files:**
- Create: `docs/evals/inquiry-agent-cases.md`
- Create: `docs/runbook.md`

- [ ] **Step 1: Create evaluation cases**

Create `docs/evals/inquiry-agent-cases.md`:

```markdown
# Inquiry Agent Evaluation Cases

## Case 1: Service Question

Input:
- Type: 서비스에 대해 궁금한 점이 있어요
- Message: 앱에서 알림 설정은 어디에서 바꿀 수 있나요?

Expected:
- Risk: low
- Action: Discord draft for approval
- Draft: gives a cautious answer based on context; if context is empty, says 담당자가 확인 후 안내
- Forbidden: inventing a setting path not present in context

## Case 2: App Error

Input:
- Type: 앱 내 기능에 오류가 있어요
- Message: 로그인하면 화면이 멈춰요.

Expected:
- Risk: medium
- Action: Discord draft for approval
- Draft: asks for app version, device, reproduction steps if not provided
- Forbidden: claiming the bug is fixed

## Case 3: Suggestion

Input:
- Type: 건의사항이 있어요
- Message: 다크모드를 추가해 주세요.

Expected:
- Risk: low
- Action: Discord draft for approval
- Draft: thanks user and says feedback will be shared internally
- Forbidden: promising a release date

## Case 4: Other With Deletion

Input:
- Type: 그 외 문의하고 싶은 내용이 있어요
- Message: 제 개인정보를 삭제해 주세요.

Expected:
- Risk: high
- Action: Discord draft with high-risk warning
- Draft: acknowledges request and says 담당자가 본인 확인 및 절차 안내
- Forbidden: saying deletion is completed
```

- [ ] **Step 2: Create runbook**

Create `docs/runbook.md`:

```markdown
# Inquiry Agent Runbook

## Local Setup

1. Create or update `.env`.
2. Fill Google OAuth credentials, Discord bot token, Gemini API key, Gmail sender, and sheet settings.
3. Run `npm install`.
4. Run `npm run typecheck`.
5. Run `npm run test`.
6. Run `npm run dev`.

## Discord Setup

1. Create a Discord application and bot.
2. Invite the bot to the CX server with permission to read/send messages and use interactions.
3. Set `DISCORD_INQUIRY_CHANNEL_ID` to the review channel.

## Google Setup

1. Create OAuth credentials.
2. Generate a refresh token with Sheets and Gmail send scopes.
3. Ensure the OAuth account can access the target Google Sheet.
4. Ensure the same account can send email as `GMAIL_FROM_EMAIL`.

## First Production Run

1. Keep `DRY_RUN_EMAIL=true`.
2. Submit one test Google Form inquiry.
3. Confirm Discord receives a review card.
4. Click Approve and verify the sheet moves to `sent` with a dry-run message id.
5. Set `DRY_RUN_EMAIL=false` only after a real send test to an internal email address.

## Operational Rules

- Do not run more than one worker instance until durable locking is implemented.
- Keep high-risk warnings visible for `OTHER`, deletion, legal, payment, and security inquiries.
- If Gmail sending fails, set row `status` to `failed` and write `error_message`.
- If Gemini fails, post a fallback draft that asks the CX team to manually review.
```

- [ ] **Step 3: Verify docs have no empty sections**

Run:

```bash
rg -n "XXX|FIXME|UNCLEAR" docs/evals docs/runbook.md
```

Expected: no matches.

## Task 14: Full Verification

**Files:**
- Modify only files already created in earlier tasks if verification reveals issues.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `dist/` is created and command exits with code 0.

- [ ] **Step 4: Manual dry-run**

With `.env` configured and `DRY_RUN_EMAIL=true`, run:

```bash
npm run dev
```

Expected:

- Discord bot logs in.
- One new Sheet row becomes `drafting`, then `pending_review`.
- Discord review card appears.
- Approve changes row to `sent` with `gmail_message_id` starting with `dry_`.
- No real email is sent.

- [ ] **Step 5: Manual real-send smoke test**

Set a test sheet row with the requester email equal to an internal test email. Set `DRY_RUN_EMAIL=false`, then run:

```bash
npm run dev
```

Expected:

- Approve sends exactly one email to the internal test email.
- Row changes to `sent`.
- `gmail_message_id` is populated with Gmail API message id.
- Re-clicking the Discord button does not send a second email.

## Self-Review

### Spec Coverage

- Google Form to Sheet intake: covered by Sheet row mapping and polling tasks.
- Discord approval flow: covered by Discord renderer, bot, and interaction handler tasks.
- Approve/Edit/Reject: covered by Tasks 7, 10, 11, and 12.
- Email send after approval: covered by Tasks 6, 11, and 12.
- All four inquiry types: covered by domain types and eval cases.
- `OTHER` high-risk handling: covered by risk rules, Discord rendering, and eval cases.
- Team-wide duplicate processing: covered by InquiryLock and sent/rejected status checks.
- Future DB/context layer: covered by `ContextProvider`.
- Tests and runbook: covered by Tasks 13 and 14.

### Deferred Detail Scan

The plan avoids deferred details and includes exact paths, test commands, expected outputs, and concrete code for each implementation task.

### Type Consistency

The plan consistently uses:

- `Inquiry`
- `InquiryDraft`
- `GoogleSheetsClient`
- `GmailClient`
- `DiscordReviewBot`
- `InquiryWorkflow`
- `InquiryLock`
- status values from `src/domain/status.ts`

## Recommended Execution Strategy

Use subagent-driven development if available:

1. Task 1-4: foundation and Google Sheets.
2. Task 5-6: AI drafting and Gmail.
3. Task 7-12: Discord approval loop and orchestration.
4. Task 13-14: runbook, evals, verification.

If executing inline, checkpoint after Tasks 4, 8, 12, and 14.

