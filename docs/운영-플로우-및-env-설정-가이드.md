# Inquiry Agent 운영 플로우 및 `.env` 설정 가이드

이 문서는 현재 저장소 구현 기준으로 Inquiry Agent가 어떻게 동작하는지와 `.env`를 어떻게 채워야 하는지를 한국어로 정리한 운영 가이드입니다.

## 1. 전체 작동 플로우

현재 구조는 **Google Form 제출 -> Google Apps Script trigger -> 봇 webhook -> Discord 승인 -> Gmail 발송 -> Google Sheet 상태 기록** 순서로 동작합니다.

### Step 1. 사용자가 Google Form 제출

- 사용자가 Whispy 문의 폼을 제출합니다.
- 응답은 연결된 Google Sheet의 응답 탭에 새 row로 저장됩니다.
- 현재 시트 탭 이름은 `설문지 응답 시트1`을 사용하도록 맞춰져 있습니다.

### Step 2. Apps Script가 form submit 이벤트를 감지

- Google Sheet에 설치한 `onFormSubmit` 트리거가 실행됩니다.
- Apps Script는 새로 들어온 row 번호와 시트 정보, spreadsheet id를 우리 봇의 webhook으로 전송합니다.
- 이 단계에서는 Discord로 직접 알림을 보내지 않습니다. Discord 검토 카드는 봇이 직접 올립니다.

### Step 3. 봇 webhook이 새 row를 처리

- 봇은 `POST /webhooks/google-form-submit` 요청을 받습니다.
- `X-Webhook-Secret` 헤더가 `.env`의 `WEBHOOK_SECRET`과 일치하는지 확인합니다.
- payload의 `spreadsheetId`, `sheetName`, `rowNumber`를 검증합니다.
- 유효한 요청이면 해당 `rowNumber` 한 건만 Google Sheets API로 읽습니다.

### Step 4. Google Sheet row를 내부 문의 모델로 변환

봇은 실제 Whispy 폼 컬럼을 기준으로 row를 해석합니다.

- `타임스탬프` -> 제출 시각
- `문의 유형을 선택해 주세요` -> 내부 문의 유형
- `답변 받으실 이메일 주소를 입력해주세요.` -> 답장 받을 이메일
- 선택된 문의 유형에 맞는 본문 컬럼 -> 문의 본문
- `status` -> worker 관리 상태
- `inquiry_id`가 비어 있으면 `inq_<rowNumber>` 형식으로 생성

### Step 5. 신규 문의인지 확인

- `status`가 비어 있거나 `new`이면 처리합니다.
- 이미 `pending_review`, `sent`, `rejected`, `failed` 같은 상태면 다시 처리하지 않습니다.

### Step 6. Gemini가 답변 초안 생성

- Gemini가 문의 내용을 바탕으로 이메일 제목과 본문 초안을 생성합니다.
- 동시에 위험도도 계산합니다.
- `OTHER`, 삭제 요청, 결제/환불, 법적 이슈, 보안 관련 내용은 high risk로 표시될 수 있습니다.
- Gemini 응답 파싱이 실패하면 fallback 초안으로 대체합니다.

### Step 7. Discord에 검토 카드 생성

- 봇이 `DISCORD_INQUIRY_CHANNEL_ID` 채널에 검토 카드를 올립니다.
- 카드에는 문의 ID, 위험도, 문의 유형, 고객 이메일, 요약, 이메일 제목/본문 초안이 포함됩니다.
- 버튼은 `Approve & Send`, `Edit`, `Reject` 세 가지입니다.

### Step 8. CX 담당자가 Discord에서 처리

- `Approve & Send`
  - 초안 그대로 이메일 발송
- `Edit`
  - 제목/본문을 수정한 뒤 이메일 발송
- `Reject`
  - 이메일은 보내지 않고 시트 상태만 `rejected`로 변경

### Step 9. Gmail 발송

- `DRY_RUN_EMAIL=true`
  - 실제 메일은 보내지 않습니다.
  - `gmail_message_id`에 `dry_...` 형태의 값만 기록합니다.
- `DRY_RUN_EMAIL=false`
  - Gmail API로 실제 메일을 발송합니다.

### Step 10. Google Sheet 상태 업데이트

worker는 처리 상태를 시트에 기록합니다.

- `new`
- `drafting`
- `pending_review`
- `sending`
- `sent`
- `rejected`
- `failed`

함께 기록되는 값:

- `inquiry_id`
- `risk_level`
- `risk_reasons`
- `discord_channel_id`
- `discord_message_id`
- `draft_subject`
- `draft_body`
- `final_subject`
- `final_body`
- `handled_by`
- `handled_at`
- `gmail_message_id`
- `error_message`

## 2. `.env` 설정 항목

현재 코드에서 읽는 환경변수는 아래와 같습니다.

```env
NODE_ENV=development
LOG_LEVEL=info

GOOGLE_SHEET_ID=replace-with-google-sheet-id
GOOGLE_SHEET_NAME=설문지 응답 시트1
GOOGLE_OAUTH_CLIENT_ID=replace-with-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=replace-with-google-oauth-client-secret
GOOGLE_OAUTH_REFRESH_TOKEN=replace-with-google-oauth-refresh-token

DISCORD_BOT_TOKEN=replace-with-discord-bot-token
DISCORD_INQUIRY_CHANNEL_ID=replace-with-discord-channel-id
DISCORD_REVIEW_POST_INTERVAL_MS=1000

GEMINI_API_KEY=replace-with-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite

GMAIL_FROM_EMAIL=replace-with-sender@example.com
GMAIL_FROM_NAME=Support Team

POLL_INTERVAL_MS=600000
ENABLE_FALLBACK_POLLING=true
WEBHOOK_PORT=3000
WEBHOOK_SECRET=replace-with-shared-webhook-secret
DRY_RUN_EMAIL=true
```

## 3. `.env` 항목별 설명

### 공통 실행 설정

`NODE_ENV`

- 보통 `development`, `test`, `production` 중 하나를 사용합니다.
- 운영 서버에서는 일반적으로 `production`을 사용합니다.

`LOG_LEVEL`

- `trace`, `debug`, `info`, `warn`, `error` 중 하나입니다.
- 운영에서는 `info` 또는 `warn` 정도가 보통 무난합니다.

### Google Sheets / Google OAuth

`GOOGLE_SHEET_ID`

- 원본 Google Spreadsheet URL의 `/d/.../edit` 사이 값입니다.
- 다운로드한 `.xlsx` 파일 경로가 아닙니다.

예시:

```text
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0
```

위 주소라면:

```env
GOOGLE_SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

`GOOGLE_SHEET_NAME`

- Google Spreadsheet 안의 실제 탭 이름입니다.
- 현재 Whispy 폼 기준으로 `설문지 응답 시트1`로 맞춰져 있습니다.
- 탭 이름이 달라지면 이 값도 같이 바꿔야 합니다.

`GOOGLE_OAUTH_CLIENT_ID`

- Google Cloud Console에서 만든 OAuth client id입니다.

`GOOGLE_OAUTH_CLIENT_SECRET`

- 위 OAuth client에 대응하는 secret입니다.

`GOOGLE_OAUTH_REFRESH_TOKEN`

- Sheets 읽기/쓰기와 Gmail 발송 권한을 가진 사용자 refresh token입니다.
- 이 계정은 대상 Google Sheet에 접근 가능해야 하고, `GMAIL_FROM_EMAIL`로 메일을 보낼 수 있어야 합니다.

필요 OAuth scope:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/gmail.send`

### Discord

`DISCORD_BOT_TOKEN`

- Discord Developer Portal에서 발급받은 봇 토큰입니다.

`DISCORD_INQUIRY_CHANNEL_ID`

- 검토 카드를 올릴 Discord 채널 ID입니다.
- 이 채널에 봇이 메시지를 보낼 권한이 있어야 합니다.

`DISCORD_REVIEW_POST_INTERVAL_MS`

- Discord 검토 카드를 하나 올린 뒤 다음 카드를 올리기 전 기다릴 최소 간격입니다.
- 기본값은 `1000`입니다.
- Discord 429가 계속 발생하면 `1500` 또는 `2000`처럼 늘려서 전송 속도를 낮출 수 있습니다.

### Gemini

`GEMINI_API_KEY`

- Gemini API 호출용 키입니다.

`GEMINI_MODEL`

- 사용할 Gemini 모델명입니다.
- 기본값은 `gemini-2.5-flash-lite`입니다.

### Gmail 발송

`GMAIL_FROM_EMAIL`

- 실제 발신자로 사용할 이메일 주소입니다.
- Google OAuth 계정이 이 주소로 메일을 보낼 수 있어야 합니다.

`GMAIL_FROM_NAME`

- 메일 발신자 이름입니다.

### Webhook / 실행 제어

`POLL_INTERVAL_MS`

- fallback polling을 켰을 때 사용할 간격입니다.
- 현재 webhook 방식이 기본이라, polling을 끈 상태에서는 사실상 예비값입니다.

`ENABLE_FALLBACK_POLLING`

- `false`
  - webhook 이벤트가 들어올 때만 처리
- `true`
  - 기본값
  - webhook 외에 polling도 같이 수행
  - 현재 권장값은 `true`입니다
  - Apps Script 누락이나 일시 장애 복구 용도로 10분마다 신규 row를 다시 확인합니다

`WEBHOOK_PORT`

- 봇이 Google Apps Script webhook을 받을 포트입니다.
- 직접 외부 포트로 열 수도 있고, nginx 뒤에서 `localhost:3000`으로만 둘 수도 있습니다.

`WEBHOOK_SECRET`

- Apps Script와 봇이 공유하는 비밀 문자열입니다.
- Apps Script는 이 값을 `X-Webhook-Secret` 헤더로 보냅니다.
- 충분히 긴 랜덤 문자열을 쓰는 편이 좋습니다.

`DRY_RUN_EMAIL`

- `true`
  - 실제 메일 발송 없이 동작 검증만 함
- `false`
  - Gmail API로 실제 메일 발송

## 4. Google Apps Script와 `.env`의 연결 관계

아래 두 값은 반드시 서로 맞아야 합니다.

- Apps Script의 `BOT_WEBHOOK_URL` 또는 `WEBHOOK_URL`
- 서버의 공개 URL

- Apps Script의 `BOT_WEBHOOK_SECRET` 또는 `WEBHOOK_SECRET`
- `.env`의 `WEBHOOK_SECRET`

예:

```env
WEBHOOK_PORT=3000
WEBHOOK_SECRET=replace-with-a-long-random-secret
```

Apps Script:

```javascript
const WEBHOOK_URL = 'https://your-domain.com/webhooks/google-form-submit';
const WEBHOOK_SECRET = 'replace-with-a-long-random-secret';
```

## 5. EC2 배포 기준 권장 구성

EC2에 올릴 경우 보통 이렇게 구성합니다.

```text
Google Form
-> Google Sheet
-> Apps Script onFormSubmit
-> https://your-domain.com/webhooks/google-form-submit
-> nginx
-> Node app on localhost:3000
-> Discord / Gemini / Gmail / Google Sheets API
```

권장 사항:

- Node 앱은 `localhost:3000`
- 외부 공개는 nginx의 `443`
- SSL은 Let's Encrypt
- 프로세스 관리는 `pm2` 또는 `systemd`
- 보안그룹은 `22`, `80`, `443`만 외부 오픈
- 앱 포트 `3000`은 외부 직접 오픈하지 않는 편이 좋음

## 6. 첫 실행 체크리스트

### 안전한 첫 실행

1. `.env`에서 `DRY_RUN_EMAIL=true`
2. `ENABLE_FALLBACK_POLLING=true`
3. `POLL_INTERVAL_MS=600000`
4. `WEBHOOK_SECRET` 설정
5. Apps Script 트리거 설정
6. 봇 서버를 공개 URL로 실행
7. 테스트 폼 제출
8. Discord 검토 카드 생성 확인
9. `Approve` 클릭
10. Google Sheet 상태가 `sent`로 바뀌는지 확인
11. `gmail_message_id`가 `dry_...`로 기록되는지 확인

### 실제 발송 전 확인

1. 수신 이메일을 내부 테스트 주소로 변경
2. `DRY_RUN_EMAIL=false`
3. 한 건만 제출
4. 실제 메일 1회 발송 확인
5. 재클릭 시 중복 발송이 없는지 확인

## 7. 자주 헷갈리는 포인트

`GOOGLE_SHEET_ID`는 `.xlsx` 파일 경로가 아닙니다.

- 반드시 원본 Google Spreadsheet id를 넣어야 합니다.

Apps Script는 `localhost`를 호출할 수 없습니다.

- EC2, Cloud Run, Railway, ngrok 같은 공개 URL이 필요합니다.

Discord 검토 카드와 Apps Script Discord 알림은 별개입니다.

- 현재 구조에서는 Apps Script가 Discord로 직접 알릴 필요가 없습니다.
- Apps Script는 봇 webhook만 호출하고, Discord 카드는 봇이 생성합니다.

`완료 여부`는 폼 응답 컬럼이고 worker 상태 컬럼이 아닙니다.

- worker 상태는 `status` 컬럼을 별도로 사용합니다.
