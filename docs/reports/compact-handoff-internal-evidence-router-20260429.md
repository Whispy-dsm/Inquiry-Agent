# Compact Handoff: Internal Evidence Router GitHub/Notion

Date: 2026-04-29
Status: implementation complete, architect review approved, not committed

## 1. Purpose

이 문서는 다음 작업자나 새 Codex 세션이 전체 대화를 다시 읽지 않고도 바로 이어서 작업할 수 있게 만든 PRD 수준 compact handoff 문서다.

이번 작업의 목적은 문의 답변 AI 품질을 높이기 위해 기존 RAG만으로 부족한 경우 내부 근거를 추가 조회하는 구조를 구현하는 것이었다. 단, "RAG에 없으니 무조건 검색"이 아니라 Gemini가 먼저 필요한 근거 소스를 판단하고, 판단된 소스만 제한적으로 조회한다.

현재 구현된 소스 모델은 다음과 같다.

- Backend 코드 근거: GitHub Code Search + GitHub contents API
- Flutter 코드 근거: GitHub Code Search + GitHub contents API
- Notion 문서 근거: Notion REST API
- 일반 로컬 파일 조회: 제거됨

## 2. Product Requirement

### Goal

문의가 들어왔을 때 AI 초안 생성 전에 내부 근거가 필요한지 판단하고, 필요한 경우 GitHub backend/flutter 코드와 Notion 문서를 조회해 답변 품질을 높인다.

### Non-goals

- 로컬 backend/flutter/notion 폴더를 런타임에서 직접 읽지 않는다.
- 고객 문의 원문 전체를 GitHub/Notion 검색어로 보내지 않는다.
- Notion 내용을 로컬에 저장하거나 캐시 파일로 남기지 않는다.
- Codex로 별도 cross-check를 런타임 플로우에 넣지 않는다.
- Gemini가 무조건 모든 소스를 조회하게 하지 않는다.

### Success Criteria

- 라우터 활성화 시 Gemini가 먼저 필요한 근거 소스를 판단한다.
- `backend`, `flutter`, `notion`, `manual`, `multi_source` 판단에 따라 필요한 provider만 호출된다.
- `escalate_manual`이면 provider 호출 없이 수동 검토로 빠진다.
- GitHub 검색은 raw customer text가 아니라 안전한 taxonomy term만 사용한다.
- GitHub 파일은 contents API로 받아 메모리에서만 분석한다.
- Notion은 Notion API로 직접 조회하고, 설정된 page ID가 있으면 해당 page tree를 우선 조회한다.
- Gemini draft prompt에는 source URL/path/raw snippet을 그대로 넣지 않고 redacted evidence summary만 넣는다.
- Discord review card에는 reviewer가 확인할 수 있는 bounded evidence가 남는다.

## 3. Current Runtime Flow

```text
Inquiry row
  -> existing RAG context load
  -> Gemini evidence route decision
     -> none/manual/backend/flutter/notion/multi_source
  -> requested provider calls only
     -> GitHub provider for backend/flutter
     -> Notion API provider for notion
  -> optional Gemini embedding rerank
  -> Gemini draft generation with sanitized evidence summary
  -> Discord review card with reviewer-facing evidence
```

중요한 호출 수:

- `ENABLE_INTERNAL_EVIDENCE_ROUTER=false`: Gemini draft call 1회
- `ENABLE_INTERNAL_EVIDENCE_ROUTER=true`: Gemini route call 1회 + draft call 1회
- `ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK=true`: Gemini embedding call이 추가될 수 있음
- Notion page ID를 2개 넣어도 Gemini 호출 수는 늘지 않음. 대신 Notion API page/block 요청 수만 늘어남.

## 4. Source Selection Behavior

Gemini route decision은 문의 내용과 RAG 상태를 보고 아래 중 하나 또는 복수 소스를 요청한다.

- `backend`: 서버 로직, API, DB, 인증, 계정, 정책, worker 동작 등 코드 근거가 필요한 경우
- `flutter`: 앱 화면, 클라이언트 정책, UI/모바일 동작 근거가 필요한 경우
- `notion`: 운영 정책, 기능 정의, CS 정책, 제품 문서 근거가 필요한 경우
- `manual`: 근거가 부족하거나 민감해서 자동 답변보다 사람 검토가 필요한 경우
- `multi_source`: backend와 notion처럼 여러 근거가 동시에 필요한 경우

예시:

- "위스피는 동시 로그인이 안 되나요?"처럼 RAG에 명확한 정의가 없으면 backend repo와 Notion 기능 정의를 함께 확인할 수 있다.
- 인증/계정 질문만 처리하도록 제한되어 있지 않다. Gemini가 질문 성격을 판단해서 다른 기능 질문도 provider를 선택한다.
- 단, AI 판단이 "근거 필요 없음"이면 외부 provider를 호출하지 않는다.

## 5. GitHub Provider Design

구현 파일: `src/ai/internalEvidence.ts`

Provider: `GitHubCodeSearchEvidenceSource`

GitHub 조회 방식:

1. 설정된 repo 목록을 `owner/repo` 형식으로 읽는다.
2. raw customer text를 그대로 query에 넣지 않는다.
3. 문의를 내부 taxonomy term으로 축약해 안전한 query term을 만든다.
4. GitHub Code Search API를 호출한다.
5. search result의 `url` 값을 사용해 GitHub contents API를 호출한다.
6. base64 content를 메모리에서 decode한다.
7. TypeScript/JavaScript는 compiler-backed AST 분석을 시도한다.
8. Dart/Markdown/기타 파일은 symbol/keyword fallback을 사용한다.
9. evidence score와 signals를 만들어 상위 결과만 반환한다.

Signal 의미:

- `external`: 외부 API에서 가져온 근거
- `keyword`: 검색 fragment나 본문 키워드 매칭 근거
- `ast`: TypeScript compiler 기반 구조 분석 근거
- `symbol`: 함수명, 클래스명, heading 같은 심볼 기반 근거

주의:

- GitHub 파일은 로컬에 저장하지 않는다.
- 파일 크기 제한이 있어 너무 큰 파일은 분석에서 제외된다.
- GitHub contents API 호출이 search result마다 추가되므로 rate limit을 고려해야 한다.

## 6. Notion Provider Design

구현 파일: `src/ai/internalEvidence.ts`

Provider: `NotionApiEvidenceSource`

Notion 조회 방식:

1. `INTERNAL_EVIDENCE_NOTION_PAGE_IDS`가 있으면 해당 page ID를 직접 조회한다.
2. page ID가 없으면 `/v1/search`를 사용한다.
3. search query도 raw customer text가 아니라 안전한 taxonomy term을 사용한다.
4. page title을 읽고, `/v1/blocks/{page_id}/children`로 block children을 가져온다.
5. block에 `has_children=true`가 있으면 하위 block도 제한적으로 순회한다.
6. page title, heading, paragraph, list 등 rich text를 메모리에서 scoring한다.
7. 장애가 나면 exception을 던지는 대신 `unavailable` evidence로 fail-closed 처리한다.

Configured page ID 동작:

- 상위 page ID를 넣으면 그 page의 children을 읽는다.
- children 중 `has_children=true`인 block은 하위 children도 조회한다.
- 무제한 workspace crawler는 아니다.
- 현재 traversal은 최대 block 수 제한을 둔다.
- Notion integration이 해당 page에 공유되어 있어야 읽을 수 있다.

Notion API endpoint:

- Page fetch: `GET /v1/pages/{page_id}`
- Children fetch: `GET /v1/blocks/{block_id}/children?page_size=100`
- Search fallback: `POST /v1/search`

## 7. Required Runtime Configuration

최소 설정 예시는 다음과 같다.

```env
ENABLE_INTERNAL_EVIDENCE_ROUTER=true

ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH=true
INTERNAL_EVIDENCE_GITHUB_TOKEN=github_pat_or_fine_grained_token
INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS=owner/backend-repo
INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS=owner/flutter-repo

ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH=true
INTERNAL_EVIDENCE_NOTION_TOKEN=secret_xxx
INTERNAL_EVIDENCE_NOTION_VERSION=2026-03-11
INTERNAL_EVIDENCE_NOTION_PAGE_IDS=page_id_1,page_id_2

ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK=false
```

선택 설정:

```env
INTERNAL_EVIDENCE_GITHUB_API_BASE_URL=https://api.github.com
INTERNAL_EVIDENCE_NOTION_API_BASE_URL=https://api.notion.com
```

삭제된 설정:

```env
INTERNAL_EVIDENCE_BACKEND_PATH
INTERNAL_EVIDENCE_FLUTTER_PATH
INTERNAL_EVIDENCE_NOTION_PATH
INTERNAL_EVIDENCE_GITHUB_NOTION_REPOS
```

현재 코드에는 runtime local path evidence lookup이 없으므로 위 local path env는 넣지 않는다.

## 8. How To Fill Env Values

### GitHub

`INTERNAL_EVIDENCE_GITHUB_TOKEN`

- fine-grained token 권장
- backend/flutter repo에 read-only 접근 권한 필요
- 최소 권한은 repo contents/code search를 읽을 수 있어야 한다.
- token 값은 `.env`나 배포 secret에 넣고 문서/커밋에 남기지 않는다.

`INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS`

- 형식: `owner/repo`
- URL이 아니라 repo slug만 넣는다.
- 여러 개면 comma-separated로 넣는다.

예:

```env
INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS=my-org/wispy-backend,my-org/wispy-worker
```

`INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS`

- 형식은 backend와 동일하다.

예:

```env
INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS=my-org/wispy-flutter
```

### Notion

`INTERNAL_EVIDENCE_NOTION_TOKEN`

- Notion integration secret을 넣는다.
- 보통 `secret_...` 형태다.
- integration을 만든 뒤 읽고 싶은 page에 해당 integration을 share해야 한다.

`INTERNAL_EVIDENCE_NOTION_VERSION`

- Notion API version header다.
- 현재 기본 설정 예시는 `2026-03-11`이다.
- Notion API에서 요구하는 날짜 버전 값이며, 앱 자체 버전이 아니다.

`INTERNAL_EVIDENCE_NOTION_PAGE_IDS`

- 읽고 싶은 Notion 상위 page ID를 comma-separated로 넣는다.
- Notion URL에서 page ID를 추출해 넣는다.
- 하이픈이 있어도 되고 없어도 되지만, API가 받는 page ID 형태로 넣는 것을 권장한다.

예:

```env
INTERNAL_EVIDENCE_NOTION_PAGE_IDS=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

page ID를 여러 개 넣어도 Gemini 호출 수는 증가하지 않는다. Notion API 호출 대상 page가 늘어날 뿐이다.

## 9. Important Files

Runtime:

- `src/ai/internalEvidence.ts`: GitHub/Notion provider, scoring, AST/symbol extraction, provider factory
- `src/ai/geminiDraftGenerator.ts`: route decision, evidence review, draft prompt redaction
- `src/config/env.ts`: runtime env schema
- `src/worker.ts`: env를 provider factory에 연결
- `src/domain/evidence.ts`: evidence domain types

Deployment/config:

- `docker-compose.yml`
- `docker-stack.yml`
- `package.json`
- `package-lock.json`

Tests:

- `tests/ai/internalEvidence.test.ts`
- `tests/ai/geminiDraftRuntime.test.ts`
- `tests/config/env.test.ts`
- `tests/worker.test.ts`
- `tests/discord/renderInquiryMessage.test.ts`

Docs/plans:

- `docs/runbook.md`
- `docs/운영-플로우-및-env-설정-가이드.md`
- `docs/reports/internal-evidence-router-implementation-report-20260429.md`
- `.omx/context/github-notion-provider-20260429T123335Z.md`
- `.omx/plans/prd-github-notion-provider.md`
- `.omx/plans/test-spec-github-notion-provider.md`

## 10. Verification Evidence

기록된 검증:

```powershell
npm run test -- tests/ai/geminiDraftRuntime.test.ts tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts
```

- Result: passed
- Fresh focused evidence after runtime stop hook: 4 files / 32 tests passed

```powershell
npm run test
```

- Result: passed
- Full suite evidence in session: 18 files passed

```powershell
npm run typecheck
```

- Result: passed

```powershell
npm run build
```

- Result: passed

```powershell
git diff --check
```

- Result: passed
- Note: CRLF warnings only

```powershell
npm run lint
```

- Result: blocked
- Reason: existing ESLint v9 flat config is missing (`eslint.config.*`)
- This is not introduced by the evidence router work.

Architect review:

- First review: rejected
- Blocker 1: `escalate_manual` could still call providers if the model returned requested sources
- Blocker 2: raw source/snippet data was forwarded into Gemini draft prompt
- Fixes applied:
  - `escalate_manual` clears requested sources and returns manual review without provider calls.
  - draft prompt uses redacted bounded evidence summary.
  - regression tests added.
- Second review: approved

## 11. Live Smoke Test Checklist

After env values are configured, run:

```powershell
npm run build
```

Then run focused tests:

```powershell
npm run test -- tests/ai/geminiDraftRuntime.test.ts tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts
```

For live Notion behavior, use a temporary script or existing runtime path that constructs `NotionApiEvidenceSource` with real env values. The expected outcomes are:

- `found`: page/block evidence was retrieved and scored.
- `empty`: API worked but no relevant evidence matched.
- `unavailable`: token/page/share/API configuration failed or Notion returned an error.

For live GitHub behavior, test with a safe synthetic inquiry that should map to known code terms. Expected outcomes:

- provider calls `/search/code`
- provider fetches contents API URL from result
- evidence includes `external+keyword`, and for supported TypeScript/JavaScript files may include `ast`
- no raw customer text appears in outbound GitHub query

## 12. Privacy And Safety Notes

- Do not print real tokens in logs or docs.
- Do not paste `.env` with secrets into reports.
- If `.env` contains commented token-looking values, remove them before sharing the file.
- Gemini draft prompt receives sanitized evidence summary, not raw URL/path/source/snippet fields.
- GitHub/Notion APIs still receive safe taxonomy terms and configured IDs/repos, so repo/page configuration itself must be considered internal metadata.
- Discord review may show reviewer-facing evidence snippets; keep renderer bounds and redaction assumptions in mind when changing that surface.

## 13. Known Risks And Limits

- GitHub Code Search and contents API rate limits can become the practical bottleneck.
- Notion API rate limits can appear if many page IDs or deep page trees are configured.
- Notion traversal is intentionally bounded; it is not a full recursive workspace mirror.
- GitHub AST support depends on runtime availability of `typescript`, now placed in runtime dependencies.
- The branch shown during work was tracking a gone upstream branch: `fix/9-completed-row-reprocessing...origin/fix/9-completed-row-reprocessing [gone]`.
- There were pre-existing or unrelated dirty files in the worktree. Do not revert files unless you confirm ownership.
- `npm run lint` needs a separate ESLint v9 flat config task.

## 14. Next Operator Checklist

Start here in a new session:

1. Read this document.
2. Run `git status -sb` and inspect current dirty files.
3. Do not revert unrelated changes.
4. Confirm env values are present in `.env` or deployment secrets.
5. Run the focused evidence tests.
6. Run `npm run build`.
7. If deploying, rebuild the worker image/container so the new env schema and runtime dependency are included.
8. Smoke test one backend question, one flutter question, and one Notion policy question.
9. Verify the Discord review card has useful evidence but Gemini prompt logs do not expose raw source fields.
10. Commit only if the user explicitly asks.

## 15. Definition Of Done For This Workstream

This workstream is functionally complete when:

- local path envs are absent from runtime config and deployment templates
- GitHub backend/flutter provider works through API only
- Notion provider works through Notion API only
- route decision controls provider execution
- manual escalation suppresses provider calls
- Gemini draft prompt evidence is sanitized
- focused tests pass
- typecheck and build pass
- handoff docs and runbooks explain exact env setup

As of this compact document, implementation and verification are complete except for live API smoke tests with the user's real GitHub/Notion credentials and the unrelated ESLint config gap.
