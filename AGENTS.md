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

## Research & Documentation Conventions

All research and planning docs live in `research/`. Use this naming convention:

| Prefix | Purpose |
|--------|---------|
| `spike-*.md` | Exploratory research. No implementation commitment. |
| `plan-*.md` | Decided work broken into tasks. Source of truth for a feature. |
| `adr-*.md` | Architecture Decision Record — context, decision, consequences. |

- Spikes that are never built just stay as spikes. That's fine — they document what was considered.
- `plan.md` (no prefix) is the main project roadmap.
- Do not create a `todo/` folder. Actionable tasks belong in GitHub Issues, not markdown files.
