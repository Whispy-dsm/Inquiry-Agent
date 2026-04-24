# Convention Import Todo

## Plan

- [x] Inspect `C:\Users\user\Desktop\Whispy_BE` root guidance files and convention docs.
- [x] Import only common backend conventions into `docs/conventions/backend/`.
- [x] Exclude or generalize Whispy_BE-specific guidance such as FCM, R2, Whispy package names, and domain-specific cascade rules.
- [x] Add `AGENTS.md` and `CLAUDE.md` for this repository with references to the imported common docs.
- [x] Verify imported files and document the result.

## Review

- Added `AGENTS.md` and `CLAUDE.md` with Inquiry-Agent-specific guidance and links to local common backend conventions.
- Added common backend convention docs for workflow, architecture, implementation patterns, database, testing, and git.
- Excluded project-specific auth/FCM convention docs and generalized Whispy-specific examples, storage provider details, package names, and domain cascade rules.
- Verification: searched imported guidance for Whispy-specific terms; remaining matches are only in this task log describing the exclusion work.

## Java/Spring Removal

- [x] Remove Gradle command assumptions from root guidance.
- [x] Remove Java, Spring, JPA, Flyway, JUnit, Mockito, annotation, and Java code examples from backend conventions.
- [x] Rewrite architecture, implementation, database, and testing guidance as framework-neutral backend conventions.
- [x] Verify no Java/Spring-specific terms remain.

## Inquiry Agent Reorientation

- [x] Replace backend convention docs with inquiry-agent convention docs under `docs/conventions/agent/`.
- [x] Update `AGENTS.md` and `CLAUDE.md` to describe Inquiry-Agent as an inquiry-handling agent project.
- [x] Remove DB/API/backend-centered requirements from root guidance.
- [x] Add agent-specific guidance for inquiry classification, evidence retrieval, tool use, escalation, privacy, and evaluations.
- [x] Verify no backend convention paths or backend assumptions remain.

## TypeScript Skill Installation

- [x] Confirm `skills` CLI is available through `npx skills`.
- [x] Install 10 selected TypeScript skills into this project for Codex.
- [x] Verify project skill list after installation.

## TypeScript Unit Testing Skill Metadata Fix

- [x] Inspect the invalid `typescript-unit-testing` skill frontmatter.
- [x] Shorten the skill description below the 1024-character loader limit.
- [x] Verify the updated description length and skill loading behavior.

### Review

- Changed files: `.agents/skills/typescript-unit-testing/SKILL.md`, `tasks/todo.md`
- Simplifications made: replaced the 1876-character multiline trigger description with a 527-character single-line description while leaving the skill body and workflows unchanged.
- Verification: `npx skills list` now loads `typescript-unit-testing` without the invalid `SKILL.md` warning.
- Remaining risks: existing long-running Codex sessions may need restart to reload the corrected project skill metadata.

## Inquiry Agent PRD-Level Plan

- [x] Capture agreed requirements for Google Sheets inquiry intake, AI draft generation, Discord approve/edit/reject, and Gmail sending.
- [x] Write PRD-level implementation plan to `docs/superpowers/plans/2026-04-23-inquiry-agent-discord-approval.md`.
- [x] Self-review the plan for requirement coverage and deferred-detail red flags.

## Worker 1: First TDD Slice

### Plan

- [x] Create TypeScript/Vitest project scaffolding from the inquiry-agent plan.
- [x] Add RED-first tests for domain risk classification.
- [x] Add RED-first tests for Google Sheets row mapping.
- [x] Add RED-first tests for AI prompt/draft parsing fallback.
- [x] Add RED-first tests for Gmail MIME encoding.
- [x] Add RED-first tests for workflow lock and inquiry workflow transitions.
- [x] Run targeted and full test commands to capture expected RED failures.
- [x] Report exactly whether any production stubs were added.

### Review

- `$team 1` launched successfully, but the worker hit a usage limit after merging its initial RED-first scaffolding.
- Continued inline with TDD after team shutdown instead of discarding the RED state.
- Fixed one scaffolding issue in `package.json` by changing `@gemini/sdk` from a nonexistent `^1.50.1` to `^1.50.1` so installs could run.
- Added minimal production files only to satisfy the failing tests:
  - `src/domain/inquiry.ts`
  - `src/domain/risk.ts`
  - `src/sheets/sheetColumns.ts`
  - `src/sheets/googleSheetsClient.ts`
  - `src/config/env.ts`
  - `src/ai/GeminiDraftGenerator.ts`
  - `src/email/mime.ts`
  - `src/email/gmailClient.ts`
  - `src/workflow/inquiryLock.ts`
  - `src/workflow/inquiryWorkflow.ts`
  - `src/discord/renderInquiryMessage.ts`
  - `src/discord/interactionHandlers.ts`
- Added new RED->GREEN test files:
  - `tests/config/env.test.ts`
  - `tests/sheets/googleSheetsClient.test.ts`
  - `tests/discord/renderInquiryMessage.test.ts`
  - `tests/email/gmailClient.test.ts`
  - `tests/discord/interactionHandlers.test.ts`
- Verification:
  - `npm run test` -> 20 tests passing
  - `npm run typecheck` -> passing

## Ralph Runtime Wiring

- [x] Add runtime-facing Gemini draft generator class with injectable client seam.
- [x] Add static context provider and prompt module.
- [x] Add worker bootstrap and `index.ts` entrypoint.
- [x] Add Discord bot adapter and interaction prefill improvements.
- [x] Add managed Google Sheets output-column initialization.
- [x] Add runbook and evaluation cases.
- [x] Re-verify `npm run test`, `npm run typecheck`, and `npm run build`.

### Review

- New runtime-facing files:
  - `src/ai/contextProvider.ts`
  - `src/ai/prompt.ts`
  - `src/worker.ts`
  - `src/index.ts`
  - `docs/runbook.md`
  - `docs/evals/inquiry-agent-cases.md`
- Strengthened existing files:
  - `src/ai/GeminiDraftGenerator.ts`
  - `src/discord/discordBot.ts`
  - `src/discord/interactionHandlers.ts`
  - `src/sheets/googleSheetsClient.ts`
- Added RED->GREEN tests for:
  - `tests/ai/geminiDraftRuntime.test.ts`
  - `tests/worker.test.ts`
  - `tests/discord/interactionHandlers.test.ts` modal prefill path
  - `tests/sheets/googleSheetsClient.test.ts` managed-column initialization
- Verification:
  - `npm run test` -> 25 tests passing
  - `npm run typecheck` -> passing
  - `npm run build` -> passing
- Remaining blocker:
  - Live end-to-end verification still requires real Google OAuth, Discord bot, and Gemini API key.

## Env Filename Alignment

### Plan

- [x] Find remaining old env-filename references in project docs and setup guidance.
- [x] Update repo docs and ignore rules to use `.env` as the local env file name.
- [x] Verify project-facing old env-filename references are removed without changing secret-tracking policy.

### Review

- Changed files: `.gitignore`, `docs/runbook.md`, `docs/superpowers/plans/2026-04-23-inquiry-agent-discord-approval.md`, `tasks/todo.md`
- Simplifications made: removed the stale env-example exception from ignore rules and aligned setup instructions and planning docs on a single local env filename, `.env`.
- Verification: `rg -n --hidden --glob '!.git' --glob '!.agents/**' --glob '!node_modules' "\.env\.example" .` returned no matches after the update.
- Remaining risks: the generic skill reference under `.agents/` still mentions the old example-style filename, but it is not part of this project's runtime or setup contract.

## Whispy Form Sheet Mapping

### Plan

- [x] Replace generic Google Form header assumptions with the actual Whispy response headers.
- [x] Map the selected inquiry type to the matching type-specific message column.
- [x] Update Sheets client review lookup to use the real reply-email column.
- [x] Run focused sheet tests and typecheck.

### Review

- Changed files: `.env`, `src/sheets/sheetColumns.ts`, `src/sheets/googleSheetsClient.ts`, `tests/sheets/sheetColumns.test.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tasks/todo.md`
- Simplifications made: kept `완료 여부` separate from worker state and continued using the existing managed `status` column instead of overloading the form completion field.
- Verification: `npm run test -- tests/sheets/sheetColumns.test.ts tests/sheets/googleSheetsClient.test.ts`, `npm run test`, `npm run typecheck`, `npm run build`, and env schema loading all passed.
- Remaining risks: live Google Sheets access still depends on `GOOGLE_SHEET_ID` pointing to the original online spreadsheet, not the downloaded `.xlsx`.

## Google Form Webhook Trigger

### Plan

- [x] Add an event-driven webhook endpoint for Google Form submit events.
- [x] Process only the submitted Sheet row instead of polling all new rows.
- [x] Make fallback polling opt-in and disabled by default.
- [x] Add Apps Script setup documentation and webhook template.
- [x] Verify webhook tests, full tests, typecheck, build, and `.env` schema loading.

### Review

- Changed files: `.env`, `docs/apps-script/google-form-submit-webhook.gs`, `docs/runbook.md`, `src/config/env.ts`, `src/sheets/googleSheetsClient.ts`, `src/webhook/googleFormWebhookServer.ts`, `src/worker.ts`, `src/workflow/inquiryWorkflow.ts`, `tests/config/env.test.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tests/webhook/googleFormWebhookServer.test.ts`, `tests/worker.test.ts`, `tests/workflow/inquiryWorkflow.test.ts`, `tasks/todo.md`
- Simplifications made: used Node's built-in HTTP server instead of adding Express/Fastify, and kept polling available only as an explicit fallback via `ENABLE_FALLBACK_POLLING`.
- Verification: `npm run test`, `npm run typecheck`, `npm run build`, and `.env` schema loading passed.
- Remaining risks: Apps Script cannot call a local-only `localhost` URL, so live use still needs a public URL or temporary tunnel.

## Korean Flow And Env Guide

### Plan

- [x] Write a Korean markdown guide for the current bot processing flow.
- [x] Document every `.env` key with purpose, required value, and setup notes.
- [x] Link the new guide from the existing runbook.

### Review

- Changed files: `docs/runbook.md`, `docs/운영-플로우-및-env-설정-가이드.md`, `tasks/todo.md`
- Simplifications made: added one dedicated Korean operations guide instead of spreading the same explanations across multiple docs.
- Verification: confirmed the new guide file contents and the runbook link target.
- Remaining risks: this change is documentation-only, so no automated runtime verification was needed or run.

## Reliability Hardening

### Plan

- [x] Prevent same-process duplicate row handling between webhook and fallback polling.
- [x] Requeue pre-review failures through fallback polling instead of leaving rows stuck in `drafting`.
- [x] Turn webhook sheet mismatches into explicit errors instead of silent ignores.
- [x] Reduce Sheets write chatter and add retries around Sheets API calls.
- [x] Run full tests, typecheck, and build after the reliability changes.

### Review

- Changed files: `src/sheets/googleSheetsClient.ts`, `src/webhook/googleFormWebhookServer.ts`, `src/workflow/inquiryWorkflow.ts`, `src/workflow/workItemLock.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tests/webhook/googleFormWebhookServer.test.ts`, `tests/workflow/inquiryWorkflow.test.ts`, `tests/workflow/workItemLock.test.ts`, `tasks/todo.md`
- Simplifications made: kept the lock process-local and used the existing Sheet status model instead of introducing a new external lock service or queue.
- Verification: `npm run test`, `npm run typecheck`, `npm run build`
- Remaining risks: cross-process duplicate handling is still not solved if multiple app instances write to the same sheet concurrently.


