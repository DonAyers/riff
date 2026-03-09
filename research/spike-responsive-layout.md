# Responsive Layout Spike

## Goal

Keep the current mobile-first recording flow intact while turning laptop-sized screens into a two-pane workspace:

- left rail for capture, import, playback, and saved riffs
- right rail for analysis outputs and empty-state guidance

## Design Layers To Add

1. Mobile-first shell
Single-column layout remains the default. Desktop behavior is opt-in at a larger breakpoint instead of trying to shrink a desktop dashboard down to mobile.

2. Explicit regions
Create stable capture and analysis panes so the UI has predictable hierarchy, better semantics, and easier automated testing.

3. Constraint-based layout
Use CSS Grid with `minmax()` and `min-width: 0` so panes expand naturally on laptop widths without overflow bugs.

4. Width-aware cards
Inner widgets need to stop assuming a narrow stack. Playback, notes, chord, and timeline should all survive wider containers.

5. Empty-state analysis panel
On desktop, show a useful placeholder in the analysis rail instead of leaving a blank column. On mobile, keep the current tighter flow.

6. Responsive polish
Add safe-area padding, tabular numerals for timers, visible focus states, touch-friendly controls, and reduced-motion handling.

## Breakpoint Recommendation

- Default: single column
- `768px+`: loosen spacing and allow summary cards to sit side by side
- `960px+`: switch to two panes

This matches the user request better than introducing multiple dense breakpoint tiers too early.

## Tooling Recommendations

Use now:

- `web-design-guidelines` skill for UI review and accessibility checks against current Vercel guidance
- `vercel-react-best-practices` skill when refactoring React shells and state boundaries
- Playwright for viewport-based assertions so desktop/mobile layout regressions are caught automatically

Add next if design iteration speeds matter:

- Figma MCP for pulling design context straight into implementation if you move from screenshots to formal comps
- visual regression coverage via Playwright screenshots once layout stabilizes
- Storybook only if you plan to grow a reusable component system; it is probably premature for the current app size

## Recommendation

Do not add a new build tool yet. The current Vite + Vitest + Playwright stack is enough for this phase. The highest leverage change is better layout architecture plus viewport-aware tests.