# Inquiry Agent Runbook

## AI Context / RAG Docs

Customer reply drafts use the Markdown files in `docs/rag` as the baseline RAG context. The worker loads those files at startup and passes matching context sections into Gemini.

## Internal Evidence Router

Default: `ENABLE_INTERNAL_EVIDENCE_ROUTER=false`.

When enabled, Gemini classifies each inquiry before drafting. It searches internal evidence only when the route says Backend, Flutter, Notion, or multi-source evidence is needed. The router does not search merely because RAG context is empty.

Runtime evidence sources are external APIs only:

- Backend code: GitHub code search
- Flutter code: GitHub code search
- Notion policy/feature definitions: Notion API

General local filesystem evidence lookup was removed. Do not configure local backend/flutter/notion paths.

### GitHub Evidence

GitHub code search is opt-in:

- `ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH=false`
- `INTERNAL_EVIDENCE_GITHUB_TOKEN`
- `INTERNAL_EVIDENCE_GITHUB_API_BASE_URL`
- `INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS`
- `INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS`

Repository lists are comma-separated `owner/repo` values. GitHub search only runs for source types requested by the AI route decision. If GitHub is rate-limited, unavailable, or misconfigured, the review card shows `unavailable` evidence instead of failing the worker.

GitHub query terms are privacy-filtered. The worker never forwards raw customer message tokens, names, emails, account IDs, or phone-like strings to GitHub. It maps the routed inquiry to a fixed product/domain taxonomy such as `auth`, `login`, `session`, `payment`, `notification`, or `policy`.

For GitHub-only code evidence, the worker follows the code-search result's contents API URL, fetches the matched file body, and runs in-memory code analysis. GitHub evidence can show `external+ast` for TypeScript/JavaScript when the TypeScript compiler is available in the runtime image, or `external+symbol` for heuristic fallback/Dart-style symbol extraction. Fetched files are bounded by size before decoding.

### Notion Evidence

Live Notion evidence search is opt-in:

- `ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH=false`
- `INTERNAL_EVIDENCE_NOTION_TOKEN`
- `INTERNAL_EVIDENCE_NOTION_API_BASE_URL`
- `INTERNAL_EVIDENCE_NOTION_VERSION=2026-03-11`
- `INTERNAL_EVIDENCE_NOTION_PAGE_IDS`

The Notion provider uses the REST API directly. It sends safe taxonomy query terms to `/v1/search`, fetches matched page block children, then scores page title/body text in memory.

If `INTERNAL_EVIDENCE_NOTION_PAGE_IDS` is set, the worker fetches those pages directly instead of relying on workspace search. This is the preferred production setup when the policy/feature-definition pages are known.

Notion auth, rate limit, network, and malformed response failures are shown as `unavailable` evidence instead of failing the worker.

### Embedding Rerank

Embedding rerank is opt-in:

- `ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK=false`
- `INTERNAL_EVIDENCE_EMBEDDING_MODEL=text-embedding-004`
- `INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES=8`

Embedding uses the existing `GEMINI_API_KEY`. If embedding fails, the router keeps the non-semantic ranking and continues.

## Local Setup

1. Create or update `.env`.
2. Fill Google OAuth credentials, Discord bot token, Gemini API key, Gmail sender, and sheet settings.
3. Configure GitHub and Notion evidence env values if internal evidence routing is enabled.
4. Run `npm install`.
5. Run `npm run test`.
6. Run `npm run typecheck`.
7. Run `npm run build`.
8. Run `npm run dev`.

### Knowledge Circuit

Knowledge circuit memory is opt-in:

- `ENABLE_KNOWLEDGE_CIRCUIT=false`
- `KNOWLEDGE_CIRCUIT_DB_PATH=./data/knowledge-circuit.sqlite`
- `KNOWLEDGE_CIRCUIT_MAX_HOPS=1` (`0` disables edge scoring; `1` enables direct stored edges only)
- `KNOWLEDGE_CIRCUIT_MAX_NODES=12`
- `KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS=90`
- `KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS=50000`

When enabled, the worker stores only metadata about evidence nodes and relationships in SQLite: source type, source reference, title, title/source-derived topics and symbols, content hash, explicit edge relation, and Discord review feedback weights. It does not store raw customer inquiry text, full Notion page content, full GitHub file content, or snippet-derived tokens. Feedback is tied to the current content hash, so old approval/rejection weights stop applying after a source changes.

Docker Compose and Swarm mount `/app/data` as a named volume so the SQLite file survives container recreation. If the DB path points inside the container without a volume, circuit memory will be lost when the container is replaced.

## Discord Setup

1. Create a Discord application and bot.
2. Invite the bot to the CX server with permission to read messages, send messages, and use slash interactions or button/modal interactions.
3. Set `DISCORD_INQUIRY_CHANNEL_ID` to the team review channel.
4. Keep `DISCORD_REVIEW_POST_INTERVAL_MS=1000` unless Discord 429s require a larger gap between review cards.

## Google Setup

1. Create Google OAuth credentials for a user account that can read the target sheet and send Gmail.
2. Generate a refresh token with these scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/gmail.send`
3. Make sure the same Google account has access to the target spreadsheet.
4. Make sure the same Google account can send mail as `GMAIL_FROM_EMAIL`.

## Webhook Setup

Set `WEBHOOK_SECRET` and configure Google Form or Sheets automation to call the worker webhook. Keep fallback polling disabled unless webhook delivery is unavailable.
