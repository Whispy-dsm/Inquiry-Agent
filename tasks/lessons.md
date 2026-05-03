# Lessons

## TSDoc is public API documentation, not generic comments

- Correction: The user pointed out that code comments should follow TSDoc conventions rather than generic inline comments.
- Rule: For TypeScript, document exported classes, interfaces, functions, and constants with `/** ... */` TSDoc.
- Correction: 사용자는 TSDoc이 한국어로 작성되어야 하고, 다른 사람이 봐도 의도를 이해할 수 있어야 한다고 정정했다.
- Rule: 이 저장소에서는 사용자가 다른 언어를 명시하지 않는 한 TSDoc을 한국어로 작성한다.
- Rule: Do not repeat TypeScript types in prose. Explain behavior, edge cases, failure handling, and examples when useful.
- Rule: Use inline comments only for non-obvious implementation intent, especially around external side effects and safety boundaries.

## Preserve user-selected model during runtime debugging

- Correction: I temporarily changed the runtime model away from the user's intended `gpt-5.5` while debugging OMX team startup.
- Rule: When debugging orchestration/runtime issues, treat the user's configured model as part of the contract unless they explicitly ask to change it.
- Rule: If a temporary lower-cost model is needed for diagnosis, call it out as temporary and restore the original model before closing the task.

## Use user-provided external project paths as source of truth

- Correction: The user clarified that Whispy Flutter lives at `C:\Users\user\Desktop\Whispy_Flutter` and Whispy backend lives at `C:\Users\user\Desktop\Whispy_BE`.
- Rule: For Whispy cross-repo documentation or RAG work, use those two paths instead of guessing from similarly named folders.

## Do not invent record edit flows for Whispy

- Correction: The user clarified that “잘못 입력한 기록은 삭제 후 다시 입력” is wrong because users cannot modify saved records.
- Rule: For Whispy customer answers, do not tell users to edit or delete-and-recreate saved sleep, focus, or meditation records unless the user explicitly confirms that flow exists.

## Verify remote deployment file placement

- Correction: The deploy job reached the server but `docker-compose` could not find `docker-compose.yml` in `SERVER_APP_DIR`.
- Rule: When using `scp-action` before a remote deploy, make the deploy step verify the expected file exists in the working directory before running Docker commands.
- Rule: If the upload action may preserve source paths, normalize or fail with a diagnostic file listing instead of assuming the remote layout.
- Rule: Treat deploy path secrets as untrusted input; trim accidental surrounding whitespace before `mkdir` or `cd`.

## Separate host ports from container ports

- Correction: Deployment reached `docker-compose up`, but failed because host port 3000 was already allocated.
- Rule: Compose files should expose a configurable host port separately from the application listener port when deploying onto shared servers.
- Rule: When converting a compose deployment to Swarm, use an explicit stack network name instead of the default network if a legacy compose network may already exist.

## Match issue and PR scope to the user's active work

- Correction: I created an issue and PR for the review-side security report finding when the user expected the current Discord 429 implementation work.
- Rule: Before creating an issue or PR, restate the exact work scope from the user's latest request and align title, body, branch, labels, and commits to that scope.
- Correction: I created a repo-name label when the user wanted this repository's label set to match the existing `Whispy_BE` repository labels.
- Rule: When the user says to label work like another repository, inspect and mirror that repository's actual labels instead of inventing a new repo-name label.

## Check project git convention before committing

- Correction: A commit was created with a Lore-style subject but without the repository's required `<type> : <description>` subject format.
- Rule: Before committing in this repository, read `docs/conventions/agent/git.md` and use subjects such as `ci : ...`, while keeping Lore trailers in the commit body.
- Correction: I merged a PR without immediately creating and pushing the required semantic version tag.
- Rule: After merging an issue or PR scope in this repository, create the next `v{MAJOR}.{MINOR}.{PATCH}` tag on the merge commit, push it to origin, and verify the remote tag exists before reporting completion.
- Correction: I committed behavior changes, docs, repository hygiene, and task memory together in one broad commit.
- Rule: Before committing, inspect the staged diff and split commits by reviewable concern: behavior with tests, operator docs, repository hygiene, and agent memory/task logs should be separate commits unless they are inseparable.
- Rule: For incorrectly entered records, say the handling method requires 담당자 확인.

## Keep the decision gate broader than the first validation slice

- Correction: The user clarified that internal-evidence routing must handle more than auth/account questions; auth/account can be a validation slice, not the product boundary.
- Rule: When designing AI triage for inquiry handling, separate the broad classifier categories from the narrow first evaluation dataset.
- Rule: Do not make a concrete user example look like the only supported category unless the user explicitly asks for that limitation.

## Do not preserve excluded review paths in design docs

- Correction: The user clarified that Codex cross-check will not be part of this design.
- Rule: When the user excludes a review or validation path, remove that section from the design artifact instead of leaving it as background context.

## Align retrieval depth with the intended source of truth

- Correction: The user clarified that code will be searched through GitHub rather than kept locally.
- Rule: When GitHub is the intended source of truth, external evidence should fetch matched file contents and analyze them in memory instead of leaving AST/symbol analysis local-only.
- Rule: Keep privacy boundaries intact: outbound external search queries must not include raw customer text, names, emails, account IDs, or phone-like tokens.

## Do not treat Notion as GitHub-hosted documentation

- Correction: The user clarified that Notion is not GitHub and should be queried through the Notion API.
- Rule: When a source is an external SaaS system, implement the provider against that system's API instead of modeling it as a local export or mirrored repository unless the user explicitly chooses that architecture.
- Rule: Remove obsolete env knobs when a source-of-truth decision changes, so operators do not configure two conflicting paths.

## Keep PR remediation inside the reviewed scope

- Correction: The user rejected broad, convention-breaking PR work and asked for review fixes to be split and scoped correctly.
- Rule: When fixing PR review findings, first rebase or remove unrelated branch history, then inspect the resulting diff for leftover files/tests/docs from the previous task before adding new fixes.
- Rule: Keep runtime fixes, tests, and docs in separate commits when the user asks for granular PR history.
- Correction: The user later changed the scope and explicitly asked to include #9 in the #10 PR after it had been removed.
- Rule: Treat the user's latest scope update as authoritative; if a previously excluded branch must be included, re-apply it deliberately and then re-check cross-scope config defaults for consistency.

## Preserve Google Sheets cell value types

- Correction: The user reported that writing string `TRUE` into the Google Form completion checkbox caused a live Sheets error.
- Rule: When writing to checkbox/form-controlled Google Sheets columns, use boolean values (`true`/`false`) instead of string lookalikes such as `'TRUE'`.
- Rule: Keep Sheets adapter value types broad enough for actual cell values (`string | boolean`) while preserving string writes for ordinary managed text columns.
- Correction: The user clarified that rejecting an inquiry is also a completed handling outcome.
- Rule: Mark the Google Form completion checkbox for every terminal human handling outcome, including approved, edited-sent, and rejected.

## Write Korean, type-specific commits

- Correction: The user clarified that test-only changes should use the `test` commit type and commit messages should be written in Korean.
- Rule: In this repository, split test-only diffs into `test ( #issue ) : ...` commits when the user asks for detailed commit separation.
- Rule: Write commit subjects and bodies in Korean unless the user requests another language; keep required trailer keys in the Lore format.

## Distinguish parser success from evidence quality

- Correction: The user asked whether a successfully parsed inquiry result was normal, and the remaining defect was unrelated Notion/GitHub evidence being promoted as `found`.
- Rule: Treat valid JSON parsing, route selection, and retrieved-evidence relevance as separate quality gates.
- Rule: For external evidence search, put intent-specific safe terms ahead of broad source terms, and do not let operational task files become product or implementation evidence.

## Preserve optional form fields in customer drafts

- Correction: The user pointed out that device model or OS information may already be present in the inquiry form, so drafts should not blindly ask for both again.
- Rule: Map optional form metadata that can affect a customer reply into the inquiry model and include it in the draft prompt.
- Rule: When only part of a troubleshooting detail is present, ask only for the missing part instead of repeating information the customer already provided.
- Correction: The user questioned why device information was always shown at the top of Discord review cards.
- Rule: Keep optional customer metadata near the original inquiry context unless it is essential for the collapsed review summary.
- Correction: The user pointed out that Discord review summaries kept appearing in English.
- Rule: Reviewer-facing draft summaries must be Korean; add both prompt/schema guidance and parser-side fallback normalization for model outputs.
- Correction: The user rejected keyword-by-keyword evidence routing because categories such as profile restoration can still be missed.
- Rule: When internal evidence review is enabled, cross-check Backend, Flutter, and Notion by default; the AI may explain source priority but must not reduce the checked source set.
- Correction: The user showed that profile-photo restoration inquiries returned empty Backend/Flutter evidence even though both repositories contain profile-image code.
- Rule: Evidence retrieval should prefer route narrative search terms and relevance gates over raw feature-specific fallback keywords.
- Correction: The user pointed out that adding a profile-specific term repeats the same keyword-expansion problem for future inquiry types.
- Rule: Do not add feature-specific inquiry keywords unless explicitly accepted; use generic safe query expansion from route explanations and small independent GitHub queries first.
- Correction: The user reported that a GitHub issue body was garbled after creation.
- Rule: Do not pipe Korean GitHub issue bodies through PowerShell stdin; pass the body as a Unicode argument or another verified UTF-8-safe path, then re-read the issue body before claiming success.
- Correction: The user showed inq_19 still returned empty Backend/Flutter evidence because route prose like "The user is asking" and "history/storage" was treated as hard intent terms.
- Rule: Hard intent terms should come from the customer inquiry text, while route explanations should be ranked as narrative search terms so generic prose cannot override feature-specific evidence words.
- Correction: The user showed inq_21 promoted unrelated Notion music/profile content and backend `R2Config.java` because `profile` matched both product profile-photo language and framework/environment profile code.
- Rule: Treat `profile` as a weak relevance term; profile-photo evidence must also match a concrete asset/action term such as image, photo, upload, or a long implementation symbol.
