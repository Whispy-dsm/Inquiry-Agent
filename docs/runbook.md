# Inquiry Agent Runbook

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill Google OAuth credentials, Discord bot token, OpenRouter API key, Gmail sender, and sheet settings.
3. Run `npm install`.
4. Run `npm run test`.
5. Run `npm run typecheck`.
6. Run `npm run build`.
7. Run `npm run dev`.

## Discord Setup

1. Create a Discord application and bot.
2. Invite the bot to the CX server with permission to read messages, send messages, and use slash interactions or button/modal interactions.
3. Set `DISCORD_INQUIRY_CHANNEL_ID` to the team review channel.

## Google Setup

1. Create Google OAuth credentials for a user account that can read the target sheet and send Gmail.
2. Generate a refresh token with:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/gmail.send`
3. Make sure the same Google account has access to the target spreadsheet.
4. Make sure the same Google account can send mail as `GMAIL_FROM_EMAIL`.

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
- If Gmail send fails, store `failed` in `status` and write the reason to `error_message`.
- If OpenRouter fails or returns invalid JSON, fall back to the safe draft and require human review in Discord.
- Do not remove the Discord approval gate in production without a separate safety review.
