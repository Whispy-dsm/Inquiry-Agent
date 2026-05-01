# 운영 플로우 및 env 설정 가이드

## 문의 처리 플로우

1. Google Sheet 또는 webhook으로 문의가 들어온다.
2. worker가 `docs/rag` 문서를 읽어 기본 RAG context를 구성한다.
3. `ENABLE_INTERNAL_EVIDENCE_ROUTER=true`이면 Gemini가 답변 생성 전에 문의를 라우팅한다.
4. 라우터가 내부 근거가 필요하다고 판단할 때만 source별 evidence provider를 호출한다.
5. Backend/Flutter 근거는 GitHub code search로 찾는다.
6. Notion 정책/기능 정의 근거는 Notion API로 찾는다.
7. 찾은 근거와 초안 답변을 Discord 리뷰 카드에 표시한다.

RAG가 비어 있다는 이유만으로 GitHub나 Notion을 무조건 검색하지 않는다. 실제 시스템 동작, 앱 UX, 기능 정의, 정책 확인이 답변을 좌우할 때만 내부 근거 검색을 수행한다.

## 최소 env 예시

```env
GOOGLE_SHEET_ID=replace-with-sheet-id
GOOGLE_SHEET_NAME=replace-with-sheet-name
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=replace-with-google-oauth-client-secret
GOOGLE_OAUTH_REFRESH_TOKEN=replace-with-google-oauth-refresh-token

DISCORD_BOT_TOKEN=replace-with-discord-token
DISCORD_INQUIRY_CHANNEL_ID=replace-with-discord-channel-id
DISCORD_REVIEW_POST_INTERVAL_MS=1000

GEMINI_API_KEY=replace-with-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite

ENABLE_INTERNAL_EVIDENCE_ROUTER=true

ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH=true
INTERNAL_EVIDENCE_GITHUB_TOKEN=replace-with-github-read-token
INTERNAL_EVIDENCE_GITHUB_API_BASE_URL=
INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS=owner/backend-repo
INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS=owner/flutter-repo

ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH=true
INTERNAL_EVIDENCE_NOTION_TOKEN=replace-with-notion-integration-token
INTERNAL_EVIDENCE_NOTION_API_BASE_URL=
INTERNAL_EVIDENCE_NOTION_VERSION=2026-03-11
INTERNAL_EVIDENCE_NOTION_PAGE_IDS=page-id-1,page-id-2

ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK=false
INTERNAL_EVIDENCE_EMBEDDING_MODEL=text-embedding-004
INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES=8

ENABLE_KNOWLEDGE_CIRCUIT=false
KNOWLEDGE_CIRCUIT_DB_PATH=./data/knowledge-circuit.sqlite
KNOWLEDGE_CIRCUIT_MAX_HOPS=1
KNOWLEDGE_CIRCUIT_MAX_NODES=12
KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS=90
KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS=50000

GMAIL_FROM_EMAIL=replace-with-sender@example.com
GMAIL_FROM_NAME=Support Team

POLL_INTERVAL_MS=600000
ENABLE_FALLBACK_POLLING=false
WEBHOOK_PORT=3000
WEBHOOK_SECRET=replace-with-shared-webhook-secret
DRY_RUN_EMAIL=true
```

## 내부 근거 설정

### `ENABLE_INTERNAL_EVIDENCE_ROUTER`

- `true`이면 Gemini 초안 생성 전에 문의 유형을 판단한다.
- 기본값은 `false`다.
- 라우터가 요청한 source만 조회한다.

### GitHub 설정

`ENABLE_INTERNAL_EVIDENCE_GITHUB_SEARCH`

- `true`이면 Backend/Flutter source에 대해 GitHub code search를 실행한다.
- 기본값은 `false`다.

`INTERNAL_EVIDENCE_GITHUB_TOKEN`

- GitHub code search와 contents API fetch에 사용할 read-only token이다.
- private repo를 검색하려면 해당 repo read 권한이 필요하다.

`INTERNAL_EVIDENCE_GITHUB_API_BASE_URL`

- 기본값은 `https://api.github.com`이다.
- GitHub Enterprise를 쓰는 경우에만 설정한다.

`INTERNAL_EVIDENCE_GITHUB_BACKEND_REPOS`

- Backend 검색 대상 repo 목록이다.
- 쉼표로 구분한 `owner/repo` 형식이다.
- 예: `whispy/backend,whispy/admin-api`

`INTERNAL_EVIDENCE_GITHUB_FLUTTER_REPOS`

- Flutter 검색 대상 repo 목록이다.
- 쉼표로 구분한 `owner/repo` 형식이다.

GitHub query에는 고객 문의 원문, 이름, 이메일, 계정 ID 같은 raw token을 넣지 않는다. 라우터 결과를 `auth`, `login`, `session`, `policy` 같은 고정 taxonomy로 바꿔 검색한다.

검색 결과에 contents API URL이 있으면 파일 본문을 가져와 메모리에서 AST/symbol 분석을 실행한다. 로컬 repo mount는 필요 없다.

### Notion 설정

`ENABLE_INTERNAL_EVIDENCE_NOTION_SEARCH`

- `true`이면 Notion API provider를 활성화한다.
- 기본값은 `false`다.

`INTERNAL_EVIDENCE_NOTION_TOKEN`

- Notion integration token이다.
- 검색할 페이지나 데이터베이스가 해당 integration에 공유되어 있어야 한다.

`INTERNAL_EVIDENCE_NOTION_API_BASE_URL`

- 기본값은 `https://api.notion.com`이다.
- 일반적으로 비워둔다.

`INTERNAL_EVIDENCE_NOTION_VERSION`

- Notion REST API version header다.
- 기본값은 `2026-03-11`이다.

`INTERNAL_EVIDENCE_NOTION_PAGE_IDS`

- 권장 운영 설정이다.
- 정책/기능 정의/FAQ 페이지 ID를 쉼표로 넣는다.
- 값이 있으면 `/v1/search`에 의존하지 않고 지정한 페이지를 직접 조회한다.
- 값이 없으면 safe taxonomy query로 `/v1/search`를 호출한 뒤 검색된 페이지의 block children을 읽는다.

Notion API provider는 페이지 본문을 로컬에 저장하지 않는다. API 응답을 메모리에서 점수화하고, 실패하면 worker를 죽이지 않고 `unavailable` evidence로 표시한다.

### Embedding rerank

`ENABLE_INTERNAL_EVIDENCE_EMBEDDING_RERANK`

- `true`이면 수집된 evidence 후보를 Gemini embedding으로 재정렬한다.
- 기본값은 `false`다.

`INTERNAL_EVIDENCE_EMBEDDING_MODEL`

- 기본값은 `text-embedding-004`다.

`INTERNAL_EVIDENCE_EMBEDDING_MAX_CANDIDATES`

- semantic rerank 대상 후보 수다.
- 기본값은 `8`이다.

### Knowledge circuit 설정

`ENABLE_KNOWLEDGE_CIRCUIT`

- `true`이면 evidence 후보를 SQLite metadata graph에 node로 기록하고, 기존 feedback/edge weight를 evidence score에 반영한다.
- 기본값은 `false`다.
- 내부 근거 라우터가 꺼져 있으면 circuit도 실행되지 않는다.

`KNOWLEDGE_CIRCUIT_DB_PATH`

- SQLite 파일 경로다.
- 로컬 기본값은 `./data/knowledge-circuit.sqlite`다.
- Docker 기본값은 `/app/data/knowledge-circuit.sqlite`이며 compose/stack에서 `/app/data`를 volume으로 유지한다.

`KNOWLEDGE_CIRCUIT_MAX_HOPS`

- 선택된 evidence node에서 저장된 edge를 반영할지 정하는 값이다.
- `0`이면 edge scoring을 끄고, `1`이면 직접 연결된 저장 edge만 반영한다.
- 현재 기본값은 `1`이다.

`KNOWLEDGE_CIRCUIT_MAX_NODES`

- 한 요청에서 circuit metadata로 처리할 최대 evidence node 수다.
- 기본값은 `12`다.

`KNOWLEDGE_CIRCUIT_FEEDBACK_TTL_DAYS`

- feedback row 보존 기간이다.
- 기본값은 `90`일이다.

`KNOWLEDGE_CIRCUIT_MAX_FEEDBACK_ROWS`

- feedback row 최대 보존 개수다.
- 기본값은 `50000`이다.

SQLite에는 source type, source ref, title, title/source 기반 topic과 symbol, content hash, 명시적 edge relation, Discord 검토 feedback weight만 저장한다. 고객 문의 원문, evidence snippet token, Notion 원문 전체, GitHub 파일 전체, Gemini prompt 전체는 저장하지 않는다. Feedback은 content hash와 함께 기록되어 원본 문서나 코드가 바뀌면 이전 승인/거절 weight가 새 content에 적용되지 않는다.

## 제거된 설정

아래 설정은 더 이상 사용하지 않는다.

```env
INTERNAL_EVIDENCE_BACKEND_PATH=
INTERNAL_EVIDENCE_FLUTTER_PATH=
INTERNAL_EVIDENCE_NOTION_PATH=
INTERNAL_EVIDENCE_GITHUB_NOTION_REPOS=
```

Backend/Flutter는 GitHub repo 설정을 사용하고, Notion은 Notion API 설정을 사용한다.
