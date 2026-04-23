# Lessons

## TSDoc is public API documentation, not generic comments

- Correction: The user pointed out that code comments should follow TSDoc conventions rather than generic inline comments.
- Rule: For TypeScript, document exported classes, interfaces, functions, and constants with `/** ... */` TSDoc.
- Rule: Do not repeat TypeScript types in prose. Explain behavior, edge cases, failure handling, and examples when useful.
- Rule: Use inline comments only for non-obvious implementation intent, especially around external side effects and safety boundaries.
