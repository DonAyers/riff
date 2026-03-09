# AGENTS

## Engineering Guardrails

- Every feature change must ship with tests.
- Add or update unit/integration tests (Vitest) for logic and component behavior changes.
- Add or update end-to-end tests (Playwright) for user-visible flow changes.
- Treat missing tests as a blocker for merge unless explicitly waived.
- When fixing a bug, first add a test that reproduces it, then implement the fix.

## Test Commands

- `npm run test`
- `npm run test:coverage`
- `npm run test:e2e`
