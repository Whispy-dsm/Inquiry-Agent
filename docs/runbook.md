# Inquiry Agent Runbook

운영 플로우와 `.env` 항목 설명은 [운영-플로우-및-env-설정-가이드.md](</C:/Users/user/Desktop/Inquiry-Agent/docs/운영-플로우-및-env-설정-가이드.md:1>)를 기준으로 확인합니다.

## AI Context / RAG Docs

Whispy 고객 문의 답변 초안의 근거 문서는 [docs/rag/README.md](</C:/Users/user/Desktop/Inquiry-Agent/docs/rag/README.md:1>)를 기준으로 관리합니다. Worker는 시작 시 `docs/rag` Markdown을 읽고 문의 유형/본문 키워드에 맞는 section을 Gemini 컨텍스트로 전달합니다.

## Local Setup

1. Create or update `.env`.
2. Fill Google OAuth credentials, Discord bot token, Gemini API key, Gmail sender, and sheet settings.
3. Run `npm install`.
4. Run `npm run test`.
5. Run `npm run typecheck`.
6. Run `npm run build`.
7. Run `npm run dev`.

## Discord Setup

1. Create a Discord application and bot.
2. Invite the bot to the CX server with permission to read messages, send messages, and use slash interactions or button/modal interactions.
3. Set `DISCORD_INQUIRY_CHANNEL_ID` to the team review channel.
4. Keep `DISCORD_REVIEW_POST_INTERVAL_MS=1000` unless Discord 429s require a larger gap between review cards.

## Google Setup

1. Create Google OAuth credentials for a user account that can read the target sheet and send Gmail.
2. Generate a refresh token with:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/gmail.send`
3. Make sure the same Google account has access to the target spreadsheet.
4. Make sure the same Google account can send mail as `GMAIL_FROM_EMAIL`.

## Google Form Webhook Setup

1. Set `WEBHOOK_PORT=3000` for the container listener. Set `WEBHOOK_HOST_PORT=3001` if the host already uses port 3000.
2. Set `WEBHOOK_SECRET` to a shared secret string.
3. Keep `ENABLE_FALLBACK_POLLING=false` for normal webhook-only processing. Enable fallback polling only after old rows are cleaned or marked complete.
4. Deploy the worker somewhere Google Apps Script can reach. Apps Script cannot call `localhost`; use a public deployment URL or a temporary tunnel during local testing.
5. In the Google Sheet connected to the form, open Extensions > Apps Script.
6. Add the script from `docs/apps-script/google-form-submit-webhook.gs`.
7. Set `WEBHOOK_URL` to `https://YOUR_PUBLIC_BOT_URL/webhooks/google-form-submit`.
8. Set `WEBHOOK_SECRET` in Apps Script to the same value as `.env`.
9. Add an installable trigger for `onFormSubmit` with event source "From spreadsheet" and event type "On form submit".

## First Dry-Run Validation

1. Keep `DRY_RUN_EMAIL=true`.
2. Submit one test inquiry through the Google Form.
3. Confirm the worker changes the row state from `new` to `drafting` to `pending_review`.
4. Confirm Discord receives a review card with `Approve`, `Edit`, and `Reject`.
5. Click `Approve`.
6. Confirm the row moves to `sent` with a `gmail_message_id` starting with `dry_`.
7. Confirm no real email was sent.

## First Real-Send Smoke Test

1. Change the requester email to an internal test inbox.
2. Set `DRY_RUN_EMAIL=false`.
3. Submit one test inquiry.
4. Click `Approve` or `Edit` and submit.
5. Confirm exactly one email arrives at the internal test inbox.
6. Confirm the row moves to `sent`.
7. Confirm `gmail_message_id` is populated with a non-dry-run id.
8. Confirm re-clicking the button does not send a second email.

## Operational Rules

- Do not run more than one worker instance until durable multi-instance locking is implemented.
- Keep high-risk warnings visible for `OTHER`, deletion, legal, payment, and security inquiries.
- Do not enable fallback polling on a sheet with historical blank-status rows; the worker treats unchecked, blank-status rows as draft candidates.
- If Gmail send fails, store `failed` in `status` and write the reason to `error_message`.
- If Gemini fails or returns invalid JSON, fall back to the safe draft and require human review in Discord.
- Do not remove the Discord approval gate in production without a separate safety review.
