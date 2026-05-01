# Internal Evidence Router Implementation Report

Date: 2026-04-29

## Summary

The internal evidence router improves AI draft quality by checking internal sources only when the inquiry needs more evidence than RAG provides.

Current source model:

- Backend evidence: GitHub code search and fetched GitHub file contents.
- Flutter evidence: GitHub code search and fetched GitHub file contents.
- Notion evidence: live Notion API page search/page fetch/block children fetch.
- Local filesystem evidence lookup: removed.

The router still avoids the bad behavior of "RAG is empty, therefore search everything." Gemini first decides whether backend, flutter, notion, multi-source, or manual evidence is needed. Only requested sources are queried.

## Runtime Flow

```text
Inquiry
  -> RAG context load
  -> Gemini evidence route decision
  -> requested source providers only
     -> GitHub provider for backend/flutter
     -> Notion API provider for notion
  -> optional embedding rerank
  -> Gemini draft prompt with evidence review
  -> Discord review card
```

## GitHub Provider

`GitHubCodeSearchEvidenceSource` performs read-only code search against configured `owner/repo` values.

It uses privacy-filtered fixed taxonomy terms instead of raw customer text. Customer emails, names, account IDs, and phone-like tokens are not sent to GitHub query strings.

When GitHub search results include a contents API URL, the worker fetches the file body, decodes it in memory, and runs code analysis:

- TypeScript/JavaScript: compiler-backed `ast` signal when available.
- Dart/Markdown/fallback: heuristic `symbol` signal.
- Search fragment/content text match: `keyword` signal.
- API source: `external` signal.

The worker does not store GitHub files locally.

## Notion API Provider

`NotionApiEvidenceSource` uses the Notion REST API directly.

Configuration:

```env
ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH=true
INTERNAL_EVIDENCE_NOTION_TOKEN=...
INTERNAL_EVIDENCE_NOTION_API_BASE_URL=
INTERNAL_EVIDENCE_NOTION_VERSION=2026-03-11
INTERNAL_EVIDENCE_NOTION_PAGE_IDS=page-id-1,page-id-2
```

Behavior:

- If `INTERNAL_EVIDENCE_NOTION_PAGE_IDS` is configured, those pages are fetched directly.
- If page IDs are not configured, the provider sends a safe taxonomy query to `/v1/search`.
- For each page, it fetches `/v1/blocks/{page_id}/children`.
- Page title and block text are scored in memory.
- Heading blocks can contribute `symbol` evidence.
- Auth, rate-limit, network, or malformed response failures become `unavailable` evidence.

The provider does not persist Notion content locally.

## Removed Local Lookup

General local file evidence lookup was removed from runtime wiring.

Removed runtime env:

```env
INTERNAL_EVIDENCE_BACKEND_PATH
INTERNAL_EVIDENCE_FLUTTER_PATH
INTERNAL_EVIDENCE_NOTION_PATH
INTERNAL_EVIDENCE_GITHUB_NOTION_REPOS
```

Backend and Flutter now use GitHub repo settings only. Notion now uses Notion API settings only.

## Key Files

- `src/ai/internalEvidence.ts`
- `src/config/env.ts`
- `src/worker.ts`
- `docker-compose.yml`
- `docker-stack.yml`
- `tests/ai/internalEvidence.test.ts`
- `tests/config/env.test.ts`
- `tests/worker.test.ts`
- `docs/runbook.md`
- `docs/운영-플로우-및-env-설정-가이드.md`

## Verification Status

Current verification should include:

```powershell
npm run test -- tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts
npm run test
npm run typecheck
npm run build
git diff --check
```

Known caveat: `npm run lint` is blocked by the existing ESLint v9 flat-config absence unless the lint configuration is added separately.
