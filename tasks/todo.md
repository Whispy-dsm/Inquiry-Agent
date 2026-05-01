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

## OMX Team Runtime Hardening

### Plan

- [x] Fix Windows team worker CLI interop so worker ACK/claim/completion no longer fail on `spawnSync('omx')`.
- [x] Make `omx team` honor `~/.codex/config.toml` `[env]` overrides for worker launch args.
- [x] Fix team shutdown cleanup so worker panes are fully gone before shutdown returns.
- [x] Re-run Windows team smoke verification for startup model, task completion, and shutdown cleanup.

### Review

- Changed repo files: `tasks/todo.md`, `tasks/lessons.md`
- Changed runtime files outside the repo:
  - `C:\Users\user\AppData\Roaming\npm\node_modules\oh-my-codex\dist\team\tmux-session.js`
  - `C:\Users\user\AppData\Roaming\npm\node_modules\oh-my-codex\dist\team\worker-bootstrap.js`
  - `C:\Users\user\AppData\Roaming\npm\node_modules\oh-my-codex\skills\worker\SKILL.md`
  - `C:\Users\user\AppData\Roaming\npm\node_modules\oh-my-codex\dist\cli\team.js`
  - `C:\Users\user\AppData\Roaming\npm\node_modules\oh-my-codex\dist\config\models.js`
  - `C:\Users\user\.codex\config.toml`
- Simplifications made:
  - kept the fix at the OMX runtime layer instead of changing any project code
  - preserved the user's configured `gpt-5.5` model while fixing worker launch-arg propagation
  - treated the restored standalone HUD pane as expected shared-session behavior and verified worker-pane cleanup separately
- Verification:
  - Windows team smoke runs `v7` through `v12` confirmed worker `ACK -> claim -> completed`
  - startup model resolution confirmed `gpt-5.5` after config/env propagation fix
  - sequential post-shutdown verification on `v12` confirmed:
    - `omx team status ...` -> `status: missing`
    - `.omx/state/team/<team>` removed
    - worker pane gone; only restored standalone HUD pane remains in the shared leader session
- Remaining risks:
  - these runtime fixes live in the global `oh-my-codex` install and can be overwritten by a future global reinstall or update

## OMX Team 2 PRD Review

### Plan

- [x] Launch a clean 2-worker OMX team smoke in the temporary clean repo.
- [x] Verify both workers send ACK and receive distinct tasks.
- [x] Verify both workers claim and complete their assigned tasks.
- [x] Verify leader mailbox/state evidence is coherent for 2 workers.
- [x] Verify shutdown removes canonical team state and worker panes in the 2-worker case.
- [x] Summarize PRD-level verdict with pass/flag findings.

### Review

- Smoke repo: `C:\Users\user\Desktop\omx-team-smoke`
- Team tested: `1-perform-no-edit-smoke-task-a`
- What passed:
  - 2 workers launched and both sent startup ACK to `leader-fixed`
  - canonical team state and task files were created correctly
  - team reached terminal completion and shutdown cleanup removed canonical team state
  - worker panes were removed after shutdown; only standalone HUD pane remained in the shared session
- PRD blocker found:
  - task allocation was not truly parallel for 2 workers
  - both generated tasks were assigned to `worker-1`
  - `worker-2` launched, ACKed, then stayed idle with no assigned tasks and reported claim conflict
  - team still completed only because `worker-1` processed task 1 and task 2 sequentially
- Additional PRD blocker found:
  - a follow-up 2-worker launch in the same shared tmux session failed at startup with `HUD pane did not remain present after tmux split-window returned %21`
  - the previous standalone HUD pane in the shared session appears to leave launch hygiene fragile for repeated multi-worker runs
- Evidence:
  - `config.json` / `manifest.v2.json` showed `worker-1 assigned_tasks: ["1","2"]`, `worker-2 assigned_tasks: []`
  - `task-1.json` and `task-2.json` both had `owner: "worker-1"`
  - `leader-fixed.json` recorded `worker-2` progress messages explicitly saying it had no assigned tasks and no claim-safe work
  - second 2-worker smoke aborted before task state creation with `HUD pane did not remain present ...`
- Root-cause hypothesis:
  - `dist/team/allocation-policy.js` scores overlap strongly enough that similar tasks collapse onto the first worker instead of balancing to the second worker
  - `dist/team/tmux-session.js` identifies/cleans existing HUD panes only when `startCommand` matches `omx ... hud --watch`, which is likely too weak for restored standalone HUD panes in Windows shared-session runs
- PRD verdict:
  - `$team 2` is not yet PRD-acceptable
  - lifecycle plumbing works, but parallel task distribution and repeated multi-worker launch hygiene are not reliable enough for operator trust

## OMX Team 2 Retest

### Plan

- [x] Re-run `$team 2` after confirming no standalone HUD pane remains.
- [x] Verify whether the previous HUD startup failure reproduces.
- [x] Verify whether task distribution still collapses onto one worker.
- [x] Summarize whether the retest changes the PRD-level verdict.

### Review

- Retest team: `1-inspect-repository-layout-an`
- Result:
  - startup succeeded with 2 workers and 2 ACKs
  - previous HUD-startup failure did not reproduce once the standalone HUD pane was removed first
  - task distribution still collapsed onto `worker-1`
  - `worker-2` reported idle / no assigned task / claim conflict
  - `worker-1` completed both task 1 and task 2 sequentially
  - shutdown cleanup again removed canonical team state and worker panes; standalone HUD remained
- Updated PRD verdict:
  - cleanup reliability is acceptable once launch has succeeded
  - startup fragility is at least partly tied to leftover standalone HUD pane state between runs
  - the core PRD blocker remains unchanged: `$team 2` does not reliably provide real parallel execution because allocation can starve one worker completely

## OMX Team 2 Distinct-Task Retest

### Plan

- [x] Remove leftover standalone HUD pane before retest.
- [x] Re-run `omx team 2` with intentionally distinct tasks and without forcing a single worker role.
- [x] Verify whether each worker gets exactly one task.
- [x] Verify both workers complete independently and shutdown cleanup still works.

### Review

- Retest team: `1-capture-the-heading-and-purp`
- Distinct tasks used:
  - task 1: capture README heading/purpose
  - task 2: enumerate git branches/tags
- Result:
  - `worker-1` received task 1
  - `worker-2` received task 2
  - both workers sent ACK
  - both workers completed their own tasks independently
  - shutdown cleanup again removed canonical team state and worker panes; standalone HUD remained
- Updated interpretation:
  - `$team 2` can achieve real parallelism when tasks are sufficiently distinct
  - the earlier collapse onto one worker was not a universal 2-worker failure, but it is still a meaningful product risk because similar tasks can collapse to one lane

## Whispy RAG Markdown Knowledge Pack

### Plan

- [x] Inspect Whispy Flutter project at `C:\Users\user\Desktop\Whispy_Flutter`.
- [x] Inspect Whispy backend project at `C:\Users\user\Desktop\Whispy_BE`.
- [x] Search and fetch relevant Whispy Notion documents.
- [x] Create multiple Markdown knowledge files under `docs/rag/` for AI answer generation.
- [x] Include source-map, answer policy, retrieval/chunking guidance, and domain knowledge.
- [x] Wire the worker to load `docs/rag` Markdown as runtime context.
- [x] Verify Markdown files exist and are internally consistent.

### Review

- Changed files: `docs/rag/README.md`, `docs/rag/source-map.md`, `docs/rag/answer-policy.md`, `docs/rag/product-knowledge.md`, `docs/rag/feature-api-map.md`, `docs/rag/inquiry-playbooks.md`, `docs/rag/retrieval-guide.md`, `docs/runbook.md`, `src/ai/contextProvider.ts`, `src/worker.ts`, `tests/ai/contextProvider.test.ts`, `tasks/todo.md`, `tasks/lessons.md`
- Simplifications made: used Markdown section search over local files instead of adding a vector DB or embedding dependency; kept customer-facing knowledge separate from internal API maps.
- Verification: `npm run test -- tests/ai/contextProvider.test.ts`, `npm run test`, `npm run typecheck`, `npm run build`, and `Get-ChildItem docs/rag` passed.
- Remaining risks: retrieval is keyword-based, not semantic embeddings; answer quality should be monitored with real 문의 samples before removing Discord review.



## GitHub Actions Runtime Env Alignment

### Plan

- [x] Align `docker-compose.yml` environment variable names with `src/config/env.ts`.
- [x] Pass required runtime secrets through the deploy SSH action.
- [x] Fix Discord webhook notification gating without using `secrets` directly in `if`.
- [x] Validate YAML/compose syntax and run the closest build verification.

### Review

- Changed files: `.github/workflows/blank.yml`, `docker-compose.yml`, `tasks/todo.md`
- Simplifications made: replaced per-variable app secret forwarding with one multiline `APP_ENV` secret written to the server `.env`; kept only CI/CD infrastructure secrets separate.
- Verification: parsed workflow YAML with Node, confirmed deploy envs are `GITHUB_OWNER,IMAGE_NAME,GHCR_READ_TOKEN,APP_ENV`, rendered `docker compose config` with required dummy envs, ran `npm run typecheck`, and ran `npm run build`.
- Remaining risks: repository secrets are now configured, but live deployment still depends on the server having Docker Compose available and `Dockerfile`/`docker-compose.yml` being included when merging to `main`.

## CSO Security Audit

- [x] Read repository conventions relevant to analysis and security review.
- [x] Detect stack, architecture, and attack surface.
- [x] Scan secrets, dependencies, CI/CD, infrastructure, integrations, LLM, skills, and OWASP categories.
- [x] Filter and verify candidate findings against the daily confidence gate.
- [x] Save the security report and summarize results.

### Review

Daily `/cso` audit completed on 2026-04-28. Report saved to `.gstack/security-reports/2026-04-28-102448.json`.

Result: 1 verified HIGH finding in CI/CD supply chain risk. Tests and typecheck passed. Non-reportable notes: production container likely runs as root, compose healthcheck points to a missing `/health` route, no repo secret-scanning config was found, and global user skills were not scanned.

## CSO Finding Remediation

- [x] Pin secret-bearing third-party GitHub Actions to immutable commit SHAs.
- [x] Verify no matching third-party action remains pinned only by mutable version tag.
- [x] Run `npm run typecheck`.

### Review

Changed `.github/workflows/blank.yml` only for the reportable CSO finding. Kept short comments with the original action versions for maintenance context.

## PR Review Triage

- [x] Fetch PR #3 review comments and classify actionable comments vs noise.
- [x] Accept Discord interaction deferral review and add regression coverage.
- [x] Accept Docker healthcheck review by adding the runtime health route and coverage.
- [x] Accept valid AWS Lambda TypeScript documentation example fixes.
- [x] Filter skipped/no-op review comments and stale comments that no longer match the code.
- [x] Run focused tests, typecheck, full test suite, build, and diff hygiene check.

### Review

Accepted: Codex Discord deferral, Codex `/health` runtime route, and Gemini documentation corrections for import paths, missing `Context` type, deprecated `substr`, and implicit handler types.

Filtered: CodeRabbit skipped-review notice, non-actionable top-level summaries, and the stale raw TypeScript Lambda `parseInt` note because the file no longer contains `parseInt`.

Verification: focused Discord/webhook tests, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check` passed.

## Docker Runtime Entrypoint Fix

### Plan

- [x] Confirm why the container cannot find `/app/dist/index.js`.
- [x] Align the TypeScript production build output with the configured Node/Docker entrypoint.
- [x] Verify build output includes `dist/index.js`.
- [x] Run typecheck, tests, build, and available runtime checks.
- [x] Attempt Docker image build and record the local Docker daemon blocker.

### Review

- Changed files: `package.json`, `tsconfig.build.json`, `tasks/todo.md`
- Simplifications made: kept the existing Docker/package runtime command (`node dist/index.js`) and changed only the production build output to match it; production build now excludes tests.
- Verification: `npm run typecheck`, `npm test`, `npm run build`, clean rebuild output check for `dist/index.js`, `npm start` reached env validation instead of module resolution, and `git diff --check` passed.
- Remaining risks: local Docker image build could not run because the Docker daemon was unavailable in this environment; `npm run lint` is still blocked by the repository's missing ESLint v9 `eslint.config.*` file.

### Stop-Hook Verification Refresh

- Fresh verification: `npm run typecheck`, `npm run build`, `npm test`, `Test-Path dist/index.js`, direct `node dist/index.js` with missing required envs, and `git diff --check`.
- Result: build emits `dist/index.js`; direct Node startup reaches `loadEnv()` in `dist/worker.js` instead of failing with `MODULE_NOT_FOUND`; 17 test files / 49 tests pass.
- OMX cleanup: cleared stale legacy `.omx/state/ultrawork-state.json`; `omx state list-active --json` no longer reports `ultrawork`.

### Mode-State Continuation

- Continued from injected OMX tmux state and inspected active mode markers.
- Terminalized stale legacy `ralph`, `team`, and `skill-active` markers that were already cancelled/completed or unrelated to the Docker entrypoint task.
- Verification: `omx state list-active --json` now returns no active modes.

## Swarm Stopped Container Cleanup

### Plan

- [x] Add deploy-time cleanup for stopped containers belonging only to the Inquiry Agent Swarm service.
- [x] Wait for service containers to settle after `docker stack deploy`.
- [x] Verify workflow syntax and inspect the deploy diff.

### Review

- Changed files: `.github/workflows/blank.yml`, `tasks/todo.md`
- Simplifications made: added cleanup inside the existing deploy SSH script instead of changing the Swarm topology or replica count.
- Verification: parsed the workflow YAML with Node's `yaml` package, asserted the deploy script contains the service-scoped cleanup function and prune command, and ran `git diff --check`.
- Remaining risks: local bash syntax validation could not run in this Windows/WSL shell setup; live behavior still depends on the server's Swarm service name being `inquiry-agent_inquiry-agent`, which matches `docker stack deploy ... inquiry-agent` plus the `inquiry-agent` service key.

## Google Sheet Tab Resolution

### Plan

- [x] Resolve the real sheet tab title from spreadsheet metadata before building A1 ranges.
- [x] Normalize sheet-name comparisons for webhook payload validation.
- [x] Add regression tests for hidden whitespace/name drift and missing tab diagnostics.
- [x] Run focused Sheets/webhook tests, typecheck, full tests, and build.

### Review

- Changed files: `src/sheets/sheetName.ts`, `src/sheets/googleSheetsClient.ts`, `src/webhook/googleFormWebhookServer.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tests/webhook/googleFormWebhookServer.test.ts`, `tasks/todo.md`
- Simplifications made: kept `GOOGLE_SHEET_NAME` as the operator-facing setting, but now resolves the actual tab title from Sheets metadata before building A1 ranges and reports available tabs when no match exists.
- Verification: focused Sheets/webhook tests, `npm run typecheck`, full `npm test`, `npm run build`, and `git diff --check` passed.
- Remaining risks: this still needs live deployment before the EC2 container will use the metadata-based tab resolution.

## Discord 429 Mitigation

### Plan

- [x] Add regression coverage that repeated review posts reuse the Discord channel lookup.
- [x] Add regression coverage that concurrent review posts are serialized before hitting `channel.send`.
- [x] Cache the configured review channel after the first successful fetch.
- [x] Queue Discord review message sends in-process to reduce burst pressure on Discord rate limits.
- [x] Run focused Discord tests, typecheck, build, and diff hygiene checks.

### Review

- Changed files: `src/discord/discordBot.ts`, `tests/discord/discordBot.test.ts`, `tasks/todo.md`
- Simplifications made: kept rate-limit mitigation inside the existing Discord adapter, avoiding a new dependency or external queue service.
- Verification: focused Discord bot tests, `npm run typecheck`, `npm run build`, full `npm test`, and `git diff --check` passed.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file; in-process serialization does not coordinate across multiple running containers/processes.

## Discord Review Post Interval Env

### Plan

- [x] Add env parsing coverage for `DISCORD_REVIEW_POST_INTERVAL_MS`.
- [x] Add Discord bot coverage that the next review post waits for the configured interval.
- [x] Pass `DISCORD_REVIEW_POST_INTERVAL_MS` from runtime env into `DiscordReviewBot`.
- [x] Add deployment/docs references for the new env variable.
- [x] Run focused tests, typecheck, build, full tests, lint attempt, compose config checks, and diff hygiene checks.

### Review

- Changed files: `src/config/env.ts`, `src/discord/discordBot.ts`, `src/worker.ts`, `tests/config/env.test.ts`, `tests/discord/discordBot.test.ts`, `docker-compose.yml`, `docker-stack.yml`, `docs/runbook.md`, `docs/운영-플로우-및-env-설정-가이드.md`, `tasks/todo.md`
- Simplifications made: kept the throttle as an optional interval on the existing in-process Discord queue instead of adding a separate scheduler or dependency.
- Verification: focused env/Discord tests, `npm run typecheck`, `npm run build`, full `npm test`, `docker compose -f docker-compose.yml config`, `docker compose -f docker-stack.yml config`, and `git diff --check` passed.
- Remaining risks: `npm run lint` is still blocked by the existing missing ESLint v9 `eslint.config.*` file; the interval is process-local and does not coordinate multiple running containers.

## Approve Email Send Investigation

### Plan

- [x] Start OMX team runtime with one executor and capture startup evidence.
- [x] Inspect Discord approve/edit handlers, worker wiring, Gmail client, and Sheets review lookup.
- [x] Reproduce the suspected approve-without-send behavior with focused tests or local diagnostics.
- [x] Add the smallest regression coverage needed after isolating dry-run configuration as the likely cause.
- [x] Run focused regression tests, typecheck, build, and team shutdown verification.

### Review

- Changed files: `tests/email/gmailClient.test.ts`, `tasks/todo.md`; `.omx/context/email-approve-send-20260428T135325Z.md` was added as ignored team context.
- Simplifications made: did not change runtime send behavior; existing approve path already calls `GmailClient.sendEmail`, and the added test only proves Gmail send is called when dry-run is disabled.
- Findings: local `.env` and rendered `docker-compose.yml` currently set `DRY_RUN_EMAIL=true`, which intentionally prevents real Gmail API sends and returns a `dry_...` message id instead.
- Verification: focused email/Discord/Sheets tests, `npm run typecheck`, full `npm test` (17 files / 57 tests), `npm run build`, `git diff --check`, and `docker compose -f docker-compose.yml config | Select-String -Pattern 'DRY_RUN_EMAIL|GMAIL_FROM_EMAIL'`.
- Team runtime: `omx team 1:executor` started as `read-only-investigation-for-in`; worker ACK was received, then the worker was terminalized as failed after hitting Codex usage/token refresh limits; `omx team shutdown read-only-investigation-for-in --confirm-issues` completed and team state was removed.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file; Docker daemon was unavailable locally, so live container logs/service env could not be inspected; production `APP_ENV` secret still needs to be checked for `DRY_RUN_EMAIL=false` if real Gmail delivery is expected.

## Edit Modal Button Disable Fix

### Plan

- [x] Add regression coverage that edited-send removes the original review card buttons.
- [x] Move edit modal send completion into the Discord interaction handler boundary.
- [x] Keep edited-send duplicate protections and Sheet audit fields unchanged.
- [x] Run focused Discord/worker tests, typecheck, build, and diff hygiene checks.

### Review

- Changed files: `src/discord/interactionHandlers.ts`, `src/worker.ts`, `tests/discord/interactionHandlers.test.ts`, `tasks/todo.md`
- Simplifications made: reused the existing approve completion pattern (`deferUpdate` then `editReply` with `components: []`) instead of adding a separate Discord message updater.
- Fix: edit modal submit now sends the edited email, writes the same Sheet audit fields, then edits the original review card to append the sent result and remove buttons.
- Verification: focused Discord/worker tests, `npm run typecheck`, full `npm test` (17 files / 58 tests), `npm run build`, and `git diff --check` passed.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file.

## Internal Evidence Router

### Plan

- [x] Create Ralph grounding artifacts under `.omx/context` and `.omx/plans`.
- [x] Add domain types for route decisions, evidence sources, conflicts, confidence, and review packets.
- [x] Add local filesystem evidence providers for Backend, Flutter, and Notion-export paths with fail-closed behavior.
- [x] Extend Gemini draft generation to optionally route inquiries, collect evidence, and attach review packets.
- [x] Render evidence review packets in Discord without changing existing approve/edit/reject actions.
- [x] Add env parsing and worker wiring for opt-in router enablement and evidence source paths.
- [x] Add focused tests, then run full test/typecheck/build/diff verification.

### Review

- Changed files:
  - `src/domain/evidence.ts`
  - `src/domain/inquiry.ts`
  - `src/ai/internalEvidence.ts`
  - `src/ai/geminiDraftGenerator.ts`
  - `src/discord/renderInquiryMessage.ts`
  - `src/config/env.ts`
  - `src/worker.ts`
  - `tests/ai/internalEvidence.test.ts`
  - `tests/ai/geminiDraftRuntime.test.ts`
  - `tests/discord/renderInquiryMessage.test.ts`
  - `tests/config/env.test.ts`
  - `tests/worker.test.ts`
  - `docs/runbook.md`
  - `docs/운영-플로우-및-env-설정-가이드.md`
  - `docker-compose.yml`
  - `docker-stack.yml`
  - `.omx/context/internal-evidence-router-20260429T063207Z.md`
  - `.omx/plans/prd-internal-evidence-router.md`
  - `.omx/plans/test-spec-internal-evidence-router.md`
- Simplifications made:
  - kept the router opt-in behind `ENABLE_INTERNAL_EVIDENCE_ROUTER=false` by default
  - used bounded local file search instead of adding GitHub/Notion API dependencies
  - made Backend/Flutter/Notion source failures fail closed as `unavailable` evidence
  - preserved the default Gemini prompt and normal Discord card when the router is disabled or route is `answer_from_rag`
  - removed post-review slop: no unused match path field and no trailing blank line on normal Discord cards
- Verification:
  - focused router tests: `npm run test -- tests/ai/internalEvidence.test.ts tests/ai/geminiDraftRuntime.test.ts tests/discord/renderInquiryMessage.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 5 files / 23 tests passed
  - post-deslop focused tests: `npm run test -- tests/ai/internalEvidence.test.ts tests/discord/renderInquiryMessage.test.ts` -> 2 files / 9 tests passed
  - `npm run typecheck` -> passed
  - `npm run test` -> 18 files / 75 tests passed
  - `npm run build` -> passed
  - `git diff --check` -> passed
  - `docker compose -f docker-compose.yml config` and `docker compose -f docker-stack.yml config` rendered internal evidence env defaults
  - architect verification -> APPROVED after fixes and post-deslop check
- Remaining risks:
  - `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*`
  - Notion support is local/exported document search only; live Notion API integration is not included
  - enabled router adds one Gemini route call before draft generation
  - `ENABLE_FALLBACK_POLLING` deployment-template default changes were already present in the dirty worktree and were treated as separate context

## External, AST, Embedding Evidence Router

### Plan

- [x] Create Ralph grounding artifacts under `.omx/context` and `.omx/plans`.
- [x] Add external GitHub code search provider with fail-closed behavior.
- [x] Add AST/symbol-aware local code scoring without new dependencies.
- [x] Add optional Gemini embedding rerank for evidence candidates.
- [x] Wire env, worker, docs, compose templates, and Discord/prompt metadata.
- [x] Fix architect findings: sanitize GitHub external queries and distinguish compiler AST from heuristic symbol matches.
- [x] Add focused regression tests and run full verification.

### Review

- Changed files:
  - `src/domain/evidence.ts`
  - `src/ai/internalEvidence.ts`
  - `src/ai/geminiDraftGenerator.ts`
  - `src/discord/renderInquiryMessage.ts`
  - `src/config/env.ts`
  - `src/worker.ts`
  - `tests/ai/internalEvidence.test.ts`
  - `tests/ai/geminiDraftRuntime.test.ts`
  - `tests/discord/renderInquiryMessage.test.ts`
  - `tests/config/env.test.ts`
  - `tests/worker.test.ts`
  - `docker-compose.yml`
  - `docker-stack.yml`
  - `docs/runbook.md`
  - `docs/운영-플로우-및-env-설정-가이드.md`
  - `docs/reports/internal-evidence-router-implementation-report-20260429.md`
  - `.omx/context/external-ast-embedding-evidence-router-20260429T082648Z.md`
  - `.omx/plans/prd-external-ast-embedding-evidence-router.md`
  - `.omx/plans/test-spec-external-ast-embedding-evidence-router.md`
- Simplifications made:
  - kept external GitHub search and embedding rerank opt-in behind existing router enablement
  - avoided new dependencies; TypeScript compiler AST is used when available and heuristic fallback is labeled `symbol`
  - made GitHub external queries privacy-filtered by fixed domain taxonomy instead of raw customer text
  - prevented GitHub-only source configuration from also emitting local-path `unavailable` evidence
  - kept embedding rerank bounded to existing candidates and fail-open to original ranking
- Verification:
  - focused router tests: `npm run test -- tests/ai/internalEvidence.test.ts tests/ai/geminiDraftRuntime.test.ts tests/discord/renderInquiryMessage.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 5 files / 31 tests passed
  - post-deslop `npm run test` -> 18 files / 84 tests passed
  - post-deslop `npm run typecheck` -> passed
  - post-deslop `npm run build` -> passed
  - post-deslop `git diff --check` -> passed with CRLF warnings only
  - architect verification -> APPROVED after privacy and signal-label fixes
  - `docker compose ... config` rendered the new env keys; local secret values were not used in documentation or final reporting
- Remaining risks:
  - `npm run lint` remains blocked by the repository's existing missing ESLint v9 `eslint.config.*` file
  - external GitHub search requires a GitHub token with read permission for private repositories and may still be rate-limited
  - live Notion API search requires a Notion integration token and explicit page sharing; unavailable pages return unavailable evidence

## GitHub-Only AST/Symbol Evidence

### Plan

- [x] Fetch matched GitHub file contents after code search results.
- [x] Run in-memory AST/symbol analysis on fetched GitHub file bodies.
- [x] Keep external query privacy guard: no raw customer tokens in GitHub search queries.
- [x] Move existing TypeScript compiler dependency into runtime dependencies for production AST support.
- [x] Run focused and full verification.

### Review

- Changed files:
  - `src/ai/internalEvidence.ts`
  - `tests/ai/internalEvidence.test.ts`
  - `package.json`
  - `package-lock.json`
  - `docs/runbook.md`
  - `docs/운영-플로우-및-env-설정-가이드.md`
  - `docs/reports/internal-evidence-router-implementation-report-20260429.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Simplifications made:
  - reused GitHub search result `url` instead of constructing another endpoint path
  - kept raw customer text local-only; outbound GitHub query still uses fixed safe taxonomy terms
  - reused the local `extractCodeSymbols` path for fetched GitHub file bodies
  - moved existing `typescript` to runtime dependency instead of adding a new AST package
- Verification:
  - focused router tests: `npm run test -- tests/ai/internalEvidence.test.ts tests/ai/geminiDraftRuntime.test.ts tests/discord/renderInquiryMessage.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 5 files / 33 tests passed
  - `npm run test` -> 18 files / 86 tests passed
  - `npm run typecheck` -> passed
  - `npm run build` -> passed
  - `git diff --check` -> passed with CRLF warnings only
  - `npm run lint` -> blocked by existing missing ESLint v9 `eslint.config.*`
- Remaining risks:
  - GitHub content fetch adds one contents API request per matched file, so rate limits matter more in GitHub-only mode
  - fetched file analysis is bounded by file size and skips files above the limit

## External-Only Evidence Sources With Notion API

### Plan

- [x] Create Ralph context snapshot, PRD, and test spec.
- [x] Remove general local filesystem evidence provider from runtime wiring.
- [x] Remove backend/flutter/notion local path env configuration from runtime env and deployment templates.
- [x] Remove GitHub-hosted Notion repo configuration from runtime env and deployment templates.
- [x] Add live Notion API evidence provider using REST fetch without a new dependency.
- [x] Add focused tests for Notion search, configured page IDs, failure handling, and privacy-safe query terms.
- [x] Run full verification and architect review.

### Review

- Changed files so far:
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
  - `docs/reports/internal-evidence-router-implementation-report-20260429.md`
  - `.omx/context/github-notion-provider-20260429T123335Z.md`
  - `.omx/plans/prd-github-notion-provider.md`
  - `.omx/plans/test-spec-github-notion-provider.md`
- Verification so far:
  - `npm run test -- tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 3 files / 24 tests passed
  - `npm run typecheck` -> passed
  - first full `npm run test` -> 1 GitHub AST test failed because TypeScript compiler import hit the old 250ms fallback under full-suite load
- Follow-up fix:
  - increased the compiler import timeout to 2000ms so production AST support is stable now that `typescript` is a runtime dependency
  - preserved traversal into child blocks even when a Notion parent block has no text
- Final verification:
  - `npm run test -- tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 3 files / 25 tests passed
  - `npm run typecheck` -> passed
  - `npm run test` -> 18 files / 86 tests passed
  - `npm run build` -> passed
  - `git diff --check` -> passed with CRLF warnings only
  - `npm run lint` -> blocked by existing missing ESLint v9 `eslint.config.*`
- Architect review:
  - first review -> REJECTED
  - blocker 1: `escalate_manual` could still call evidence providers if the model returned requested sources
  - blocker 2: raw internal evidence source/snippet data was forwarded into the Gemini draft prompt
- Fixes after rejection:
  - `escalate_manual` now clears requested sources and returns manual review without provider calls
  - draft prompt evidence now omits source URLs/paths and sends a redacted bounded evidence summary instead of raw snippet/source fields
  - added regression tests for both behaviors
  - second architect review -> APPROVED

## Compact Handoff Document

### Plan

- [x] Create a PRD-level compact handoff document under `docs/reports`.
- [x] Capture architecture, runtime flow, configuration, verification evidence, and next-step checklist.
- [x] Include enough context for a new agent or developer to continue without replaying the full session.
- [x] Run lightweight documentation verification after the file is created.

### Review

- Created `docs/reports/compact-handoff-internal-evidence-router-20260429.md`.
- Captured purpose, requirements, runtime flow, source selection, GitHub/Notion provider behavior, env setup, verification evidence, risks, and next operator checklist.
- Verification: `git diff --check -- docs/reports/compact-handoff-internal-evidence-router-20260429.md tasks/todo.md` passed with the existing CRLF warning for `tasks/todo.md`.

## Risk Display Removal

### Plan

- [x] Remove the deterministic risk classifier and risk fields from runtime domain types.
- [x] Remove risk display from Discord review messages and stop writing `risk_level` / `risk_reasons` to Sheets.
- [x] Update tests and active RAG docs so review guidance no longer depends on a risk label.
- [x] Run focused tests, typecheck, build, and diff hygiene checks.

### Review

- Removed `src/domain/risk.ts` and `tests/domain/risk.test.ts`.
- Removed `risk` from `InquiryDraft`, Gemini draft parsing, Discord review rendering, workflow Sheet writes, and managed Sheet columns.
- Updated active RAG/eval docs to use "담당자 검토" / "자동 확정 금지" wording instead of a displayed risk label.
- Stabilized the GitHub AST evidence test by increasing the TypeScript compiler import timeout from 2s to 10s after full-suite verification exposed the existing timing flake.
- Verification:
  - `npm run test -- tests/ai/geminiDraftGenerator.test.ts tests/ai/geminiDraftRuntime.test.ts tests/discord/renderInquiryMessage.test.ts tests/discord/discordBot.test.ts tests/workflow/inquiryWorkflow.test.ts tests/sheets/googleSheetsClient.test.ts tests/ai/contextProvider.test.ts` -> 7 files / 35 tests passed.
  - `npm run test -- tests/ai/internalEvidence.test.ts` -> 1 file / 16 tests passed.
  - `npm run test` -> 17 files / 85 tests passed.
  - `npm run typecheck` -> passed.
  - `npm run build` -> passed.
  - `git diff --check` -> passed with CRLF warnings only.
  - Active runtime/test/RAG scope search for `risk`, `Risk`, `classifyRisk`, `risk_level`, `risk_reasons`, `고위험`, `위험도`, `high risk` -> no matches.
- Remaining risks: `npm run lint` remains blocked by the repository's existing missing ESLint v9 `eslint.config.*` file.

## SQLite Knowledge Circuit

### Plan

- [x] Create Ralph context, PRD, and test-spec artifacts for the SQLite-backed knowledge circuit.
- [x] Add knowledge circuit domain types and a metadata-only store abstraction.
- [x] Implement an in-memory store and optional `node:sqlite` store with schema initialization and cleanup.
- [x] Add a circuit service that upserts evidence metadata and reorders/annotates evidence using stored feedback/edges.
- [x] Wire env, worker, Docker volume defaults, and docs.
- [x] Add focused tests and run full verification.

### Review

- Added a metadata-only knowledge circuit layer:
  - `src/domain/knowledgeCircuit.ts`
  - `src/ai/knowledgeCircuitStore.ts`
  - `src/ai/knowledgeCircuit.ts`
- The circuit stores evidence node metadata, content hashes, explicit relationships, and Discord review feedback weights in SQLite when `ENABLE_KNOWLEDGE_CIRCUIT=true`.
- Raw customer inquiry text, evidence snippet tokens, full Notion page content, full GitHub file content, and Gemini prompt bodies are not persisted by the circuit.
- Discord approve/edit/reject actions now record feedback against the evidence refs stored with the review row, and stale feedback is ignored when source content hashes change.
- Integrated the circuit after internal evidence retrieval/rerank so Gemini still receives one draft-generation call path, but evidence can be annotated/reordered by stored circuit signals.
- Added Docker Compose/Swarm `/app/data` named volume defaults for persistent SQLite storage.
- First architect review rejected the initial version for dead feedback wiring, snippet-derived metadata persistence, automatic support edges, stale feedback, and max-hop mismatch; all five were fixed.
- Second architect review found no blocking issues.
- Verification:
  - `npm run test -- tests/ai/knowledgeCircuit.test.ts tests/ai/internalEvidence.test.ts tests/config/env.test.ts tests/worker.test.ts` -> 4 files / 31 tests passed.
  - `npm run typecheck` -> passed.
  - `npm run build` -> passed.
  - `npm run test` -> 18 files / 93 tests passed.
  - `npm run test -- tests/ai/knowledgeCircuit.test.ts` -> 1 file / 6 tests passed.
  - `git diff --check` -> passed with CRLF warnings only.
  - `docker compose -f docker-compose.yml config` -> passed.
  - `docker stack config -c docker-stack.yml` with dummy required env values -> passed.
  - `npm run lint` -> blocked by existing missing ESLint v9 `eslint.config.*`.
- Remaining risks:
  - `node:sqlite` is still experimental in Node 22 and emits an `ExperimentalWarning`.
  - Lint cannot run until the repo adds an ESLint v9 flat config.

## PR Review Remediation

### Plan

- [x] Rebase the feature branch directly onto `origin/main`.
- [x] Re-include #9 completion-checkbox/fallback-polling guard changes in #10 after the latest scope update.
- [x] Harden final draft prompting so retrieved internal evidence is explicitly treated as untrusted quoted data.
- [x] Prevent `ENABLE_KNOWLEDGE_CIRCUIT=true` from initializing SQLite when the internal evidence router is disabled.
- [x] Stabilize GitHub AST evidence coverage around the runtime TypeScript compiler import timeout.
- [x] Run focused tests, typecheck, build, and diff hygiene.
- [x] Prepare the rebased branch for force-push and PR metadata update.

### Review

- Rebased `feature/10-sqlite-knowledge-circuit` onto `origin/main`, then included #9 completion-checkbox/fallback-polling guard commits in the same PR per the latest request.
- Added an explicit untrusted-data boundary to the final Gemini draft system prompt and internal evidence prompt section.
- Changed worker wiring so the SQLite knowledge circuit is created only when `ENABLE_INTERNAL_EVIDENCE_ROUTER=true`.
- Cached the TypeScript compiler import and gave the AST regression test enough time for the production 10s fallback path.
- Re-applied completed-row filtering, completion checkbox writes after successful send, and fallback polling default guidance.
- Verification: focused review tests, full `npm run test` (18 files / 94 tests), `npm run typecheck`, `npm run build`, Docker Compose/Stack config rendering, and `git diff --check` passed after #9/#10 integration.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file; `node:sqlite` still emits Node's experimental warning in tests.

## Sent Email Completion Checkbox

### Plan

- [x] Add regression coverage that approve and edited-send mark the form `완료 여부` checkbox as checked after Gmail succeeds.
- [x] Update the sent-email Sheet writes to set the existing `완료 여부` column to `TRUE`.
- [x] Verify focused Discord/Sheets tests, typecheck, build, and diff hygiene.

### Review

- Changed files: `src/discord/interactionHandlers.ts`, `tests/discord/interactionHandlers.test.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tasks/todo.md`
- Simplifications made: reused the existing Sheet update call instead of adding a new API or managed column; the existing `완료 여부` column is updated only when Gmail send has already succeeded.
- Verification: focused Discord/Sheets tests, full `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` passed after #9/#10 integration.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file.

## Gemini Call Storm Guard

### Plan

- [x] Add regression coverage for skipping `완료 여부=TRUE` rows before Gemini draft generation.
- [x] Make fallback polling opt-in by default across env parsing and docs.
- [x] Update docs and runtime setting so webhook-only processing is the default path.
- [x] Run focused tests, full tests, typecheck, build, lint attempt, and diff hygiene.

### Review

- Changed files: `src/sheets/sheetColumns.ts`, `src/sheets/googleSheetsClient.ts`, `src/config/env.ts`, `docs/runbook.md`, `docs/운영-플로우-및-env-설정-가이드.md`, `tests/sheets/googleSheetsClient.test.ts`, `tests/config/env.test.ts`, `tasks/todo.md`.
- Root cause: fallback polling was enabled by default and immediately scanned the full Sheet, while blank `status` rows were treated as new even when `완료 여부` was already `TRUE`.
- Simplifications made: filtered completed rows at the Sheets adapter boundary and changed fallback polling defaults instead of adding rate-limit state or a new database.
- Verification: focused config/Sheets tests, full `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` passed after #9/#10 integration.
- Remaining risks: `npm run lint` is still blocked by the repository's existing missing ESLint v9 `eslint.config.*` file; deployed environments that explicitly set `ENABLE_FALLBACK_POLLING=true` still need their secret/env value changed separately.

## PR Review Follow-up Fixes

### Plan

- [x] Make knowledge-circuit content hashes stable across inquiry-dependent snippets while still invalidating feedback when fetched source content changes.
- [x] Keep upserted node hashes and returned `circuitContentHash` values on one shared calculation path.
- [x] Fetch all paginated Notion block children up to the configured block cap.
- [x] Redact Unix-style absolute paths before sending evidence snippets to Gemini.
- [x] Constrain model-requested evidence sources to the selected route.
- [x] Ensure only `found` evidence consumes the knowledge-circuit `maxNodes` budget.
- [x] Honor `KNOWLEDGE_CIRCUIT_MAX_HOPS` above 1 or otherwise remove the misleading behavior.
- [x] Align in-memory feedback cleanup ordering with SQLite's newest-by-`createdAt` retention.
- [x] Trim optional string env values and add regression coverage.
- [x] Close SQLite test stores in `finally` and clarify GitHub token wording in task docs.
- [x] Run focused tests, full tests, typecheck, build, lint attempt, and diff hygiene.

### Review

- Changed files: `src/ai/knowledgeCircuit.ts`, `src/ai/internalEvidence.ts`, `src/ai/geminiDraftGenerator.ts`, `src/ai/knowledgeCircuitStore.ts`, `src/config/env.ts`, focused tests, and `tasks/todo.md`.
- Simplifications made: reused provider-level `circuitContentHash` instead of persisting raw source bodies; used one route-source map for both filtering and defaults.
- Verification:
  - `npm run test -- tests/ai/knowledgeCircuit.test.ts tests/ai/internalEvidence.test.ts tests/ai/geminiDraftGenerator.test.ts tests/config/env.test.ts` -> 4 files / 38 tests passed.
  - `npm run typecheck` -> passed.
  - `npm run test` -> 18 files / 101 tests passed.
  - `npm run build` -> passed.
  - `git diff --check` -> passed with CRLF warnings only.
  - `npm run lint` -> blocked by existing missing ESLint v9 `eslint.config.*`.
- Remaining risks: `node:sqlite` still emits Node's experimental warning in tests; lint remains blocked until the repository adds an ESLint v9 flat config.

## Sheet Managed Column Grid Expansion

Related issue: #12

### Plan

- [x] Reproduce the production failure where writing `AD1` fails because the Sheet grid only has 29 columns.
- [x] Expand the Google Sheet column grid before writing missing managed headers beyond the current `gridProperties.columnCount`.
- [x] Keep the existing header append path for test/mocked clients that do not expose spreadsheet-level `batchUpdate`.
- [x] Add regression coverage for append-dimension before header update.
- [x] Run focused Sheets tests, typecheck, build, lint attempt, full tests, and diff hygiene.

### Review

- Changed files: `src/sheets/googleSheetsClient.ts`, `tests/sheets/googleSheetsClient.test.ts`, `tasks/todo.md`.
- Root cause: `ensureManagedColumns` wrote missing managed headers into AD and beyond without first expanding the sheet grid beyond its current 29 columns.
- Simplifications made: used the spreadsheet-level `appendDimension` request only when metadata and `batchUpdate` are available, preserving the old direct header update path for simple mocks.
- Verification:
  - `npm run test -- tests/sheets/googleSheetsClient.test.ts tests/sheets/sheetColumns.test.ts` -> 2 files / 14 tests passed.
  - `npm run typecheck` -> passed.
  - `npm run build` -> passed.
  - `npm run test` -> 18 files / 102 tests passed.
  - `git diff --check` -> passed with CRLF warnings only.
  - `npm run lint` -> blocked by existing missing ESLint v9 `eslint.config.*`.
- Remaining risks: deploy still needs the patched image rebuilt and restarted before the production container stops failing on the old code.
