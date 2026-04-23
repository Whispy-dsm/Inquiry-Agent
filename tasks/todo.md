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
