# Lessons

## TSDoc is public API documentation, not generic comments

- Correction: The user pointed out that code comments should follow TSDoc conventions rather than generic inline comments.
- Rule: For TypeScript, document exported classes, interfaces, functions, and constants with `/** ... */` TSDoc.
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
- Rule: For incorrectly entered records, say the handling method requires 담당자 확인.
