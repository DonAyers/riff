# Spike: Responsive design system

## Status

Spike — exploratory, no implementation commitment yet.

## Problem

The app has 16 CSS files / 1,300 lines with organic, inconsistent styling:

| Issue | Severity |
|-------|----------|
| **6 distinct breakpoints** (600, 639, 640, 767, 768, 960px) — no shared constants | High |
| **Mixed mobile-first / desktop-first** — some use `min-width`, others `max-width` | High |
| **No design tokens** — `border-radius: 22px` repeated 8×, `gap: 1rem` repeated 11× | High |
| **5 undefined CSS variables** referenced in App.css (`--color-text-muted`, etc.) | Bug |
| **Duplicate @media block** in Recorder.css (prefers-reduced-motion declared twice) | Bug |
| **No spacing/radius/typography scales** — every value is ad-hoc | Medium |
| **No shared component patterns** — card, button, pill styles duplicated per file | Medium |

This makes it fragile to change anything without breaking something else, and makes the phone → tablet → laptop adaptation inconsistent.

---

## Current breakpoint map

```
 600px  OnboardingSheet (min-width)         ← phone → tablet
 639px  SavedRiffs      (max-width)         ← phone only
 640px  SelectedChordDialog (max-width)     ← phone only (off by 1!)
 767px  App.css         (max-width)         ← phone + small tablet
 768px  App.css         (min-width)         ← tablet →
 960px  App.css         (min-width)         ← laptop →
```

No consistency. The 639/640 conflict means there's a 1px gap where neither rule applies.

---

## Proposed: 3-tier breakpoint system

Standardize on **mobile-first** with three tiers matching real device classes:

```css
/* src/styles/tokens.css */

/*
 * Breakpoints (mobile-first, min-width):
 *   Default     → phone    (0 – 599px)
 *   --bp-tablet → tablet   (600px – 959px)
 *   --bp-laptop → laptop+  (960px+)
 *
 * CSS custom properties can't be used in @media queries,
 * so these are documented constants, not vars.
 */
```

| Token name | Value | Targets |
|------------|-------|---------|
| _(default)_ | 0 – 599px | Phone (portrait + landscape) |
| `--bp-tablet` | `600px` | Tablet, large phone landscape |
| `--bp-laptop` | `960px` | Laptop, desktop |

**Why only 2 breakpoints?**
- Three tiers (phone/tablet/laptop) cover 99% of use cases
- More breakpoints = more maintenance surface
- `768px` is dropped — iPads in portrait are 768px but behave fine with our 600px tablet tier
- `639/640/767px` are all consolidated into the default (phone) tier

---

## Proposed: design tokens

A single `tokens.css` file imported before everything else, providing the full design vocabulary.

```css
/* src/styles/tokens.css */
:root {
  /* ── Colors ── */
  --bg:                  #050611;
  --surface:             rgba(14, 16, 33, 0.9);
  --surface-strong:      rgba(20, 23, 44, 0.96);
  --surface-soft:        rgba(255, 255, 255, 0.035);
  --surface-border:      rgba(130, 98, 255, 0.18);
  --surface-border-strong: rgba(130, 98, 255, 0.28);
  --fg:                  #f4f5fb;
  --fg-muted:            #8d90b4;
  --accent:              #8262ff;
  --accent-dim:          rgba(130, 98, 255, 0.14);
  --accent-glow:         rgba(130, 98, 255, 0.35);
  --danger:              #f87171;

  /* ── Spacing scale (4px base) ── */
  --space-2xs:  0.125rem;   /* 2px */
  --space-xs:   0.25rem;    /* 4px */
  --space-sm:   0.5rem;     /* 8px */
  --space-md:   0.75rem;    /* 12px */
  --space-lg:   1rem;       /* 16px */
  --space-xl:   1.5rem;     /* 24px */
  --space-2xl:  2rem;       /* 32px */
  --space-3xl:  3rem;       /* 48px */

  /* ── Border radius ── */
  --radius-sm:    10px;
  --radius-md:    14px;
  --radius-lg:    22px;
  --radius-xl:    26px;
  --radius-full:  999px;

  /* ── Typography ── */
  --font-sans:  system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono:  "SF Mono", "Cascadia Code", "Fira Code", monospace;
  --text-xs:    0.75rem;    /* 12px */
  --text-sm:    0.8125rem;  /* 13px */
  --text-base:  0.875rem;   /* 14px */
  --text-md:    1rem;       /* 16px */
  --text-lg:    1.25rem;    /* 20px */
  --text-xl:    1.5rem;     /* 24px */
  --text-2xl:   clamp(1.8rem, 2.6vw, 2.35rem);

  /* ── Shadows ── */
  --shadow-sm:  0 2px 8px rgba(0, 0, 0, 0.18);
  --shadow-md:  0 8px 24px rgba(0, 0, 0, 0.24);
  --shadow-lg:  0 28px 80px rgba(0, 0, 0, 0.34);

  /* ── Transitions ── */
  --ease-out:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast:  0.15s;
  --duration-normal: 0.22s;
  --duration-slow:  0.32s;
}
```

---

## Migration approach

### Phase 0: Prep (bugs + dead code)
1. Remove 5 undefined `--color-*` variable references in App.css
2. Remove duplicate `@media (prefers-reduced-motion)` in Recorder.css
3. Fix 639px → 600px in SavedRiffs.css, 640px → 600px in SelectedChordDialog.css

### Phase 1: Tokens file (non-breaking)
1. Create `src/styles/tokens.css` with all tokens above
2. Import it first in `main.tsx` (before `index.css`)
3. Move existing `:root` vars from `index.css` → `tokens.css`
4. **No other file changes yet** — everything still works, tokens are just available

### Phase 2: Adopt tokens (file-by-file, mechanical)
For each CSS file, replace hardcoded values with tokens:
- `border-radius: 22px` → `border-radius: var(--radius-lg)`
- `gap: 1rem` → `gap: var(--space-lg)`
- `border-radius: 999px` → `border-radius: var(--radius-full)`
- `rgba(255, 255, 255, 0.05)` → `var(--surface-soft)` (already exists!)
- `#f87171` → `var(--danger)`
- `padding: 1.15rem` → `var(--space-lg)` (close enough at 16px)

This is mechanical find-and-replace. Each file can be done independently.

### Phase 3: Consolidate breakpoints
Rewrite all `@media` queries to use the 2-breakpoint system:
- Remove all `max-width` queries — rewrite as mobile-first defaults + `min-width` overrides
- `@media (min-width: 600px)` for tablet
- `@media (min-width: 960px)` for laptop

Example migration:
```css
/* BEFORE (mixed, inconsistent) */
.saved-riff-item { flex-direction: column; }
@media (max-width: 639px) {
  .saved-riff-item { flex-direction: column; }
}

/* AFTER (mobile-first) */
.saved-riff-item { flex-direction: column; }  /* phone default */
@media (min-width: 600px) {
  .saved-riff-item { flex-direction: row; }   /* tablet+ */
}
```

### Phase 4: Layout refinement per tier

**Phone (< 600px):**
- Single column, full-width cards
- Session picker collapsed to single row
- Capture + analysis stack vertically
- Touch targets ≥ 44px

**Tablet (600px – 959px):**
- Still single column but wider cards with more horizontal space
- Session picker can show slightly more metadata
- Chord lane can show 2-column grid for chord + fretboard side-by-side

**Laptop (960px+):**
- Two-column layout: capture sidebar (320–370px) + analysis main panel
- Session picker inline in capture sidebar
- Chord lane gets full horizontal space for fretboard + voicing details

---

## What this does NOT include

- **CSS-in-JS migration** — we stay with plain CSS files. They're working well, just need tokens.
- **Tailwind/utility-first** — too heavy a migration for too little benefit at 1,300 lines.
- **CSS modules** — Vite supports them, but component-scoped `.css` files are fine for this app's scale.
- **Container queries** — nice but not needed with our simple 3-tier system.

---

## Effort estimate

| Phase | Scope | Risk |
|-------|-------|------|
| Phase 0: Bug fixes | 3 files, ~15 line changes | Zero — fixing bugs |
| Phase 1: Tokens file | 1 new file, 1 import change | Zero — additive only |
| Phase 2: Adopt tokens | 16 files, ~80 replacements | Low — mechanical, testable visually |
| Phase 3: Breakpoints | 5 files with @media queries | Medium — layout changes need visual testing |
| Phase 4: Layout tuning | CSS only, no component changes | Medium — design decisions needed |

Phases 0-2 are safe to batch. Phase 3-4 should be separate commits.

---

## References

- Current vars: `src/styles/index.css:7-21`
- Largest CSS file: `src/styles/App.css` (377 lines)
- Breakpoint audit: this document, section 2
- Mobile stack order: `spike-session-model.md`, section "Saved sessions UI concept"
