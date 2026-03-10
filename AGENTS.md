# AGENTS

## Engineering Guardrails

### Testing — Non-Negotiable

Every feature, fix, or refactor **must** ship with robust tests at both layers:

1. **Unit / integration tests (Vitest)** — for every new or changed module, hook, utility, and component.
   - Pure logic (lib/) gets isolated unit tests covering happy path, edge cases, and error paths.
   - React components get React Testing Library tests for rendering, user interaction, and accessibility.
   - Hooks get `renderHook` tests for state transitions and side effects.
2. **End-to-end tests (Playwright)** — for every user-visible flow change.
   - New UI features get at least one happy-path e2e scenario.
   - Flows that touch recording, import, playback, or export must be covered.

A PR with missing tests is a **merge blocker** unless explicitly waived with a reason.

When fixing a bug, first add a test that reproduces it, then implement the fix.

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
