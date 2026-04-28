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
