# FitAI — "Strong"-Style Visual Redesign: Design Tokens

Status: **planning only** — no implementation yet. This document defines the target
tokens and component patterns for the dark, high-density workout-logging style
(reference: Strong app). It extends, rather than replaces, the existing "Volt"
design system in `frontend/src/index.css`.

## 1. Where we're starting from

The app already has a dark-first token system (`@theme` block in `index.css`)
with a light-mode override via `:root[data-theme="light"]`, RTL Hebrew as the
default direction, and a mobile-only frame (max-width 430px, breakpoints pushed
to 9999px so `md:`/`lg:` never fire). The redesign works **inside** that
existing system — new/changed tokens, not a parallel one.

Current relevant tokens (`frontend/src/index.css`):
- Background: `--color-ink: #0B0F1A` (already near-black)
- Surfaces: `--color-surface: #121826`, `--color-surface-2: #1A2234`
- Accent: `--color-volt: #38BDF8` (already blue, sky-blue family)
- Failure/danger color today: `--color-coral: #FB7185` (pink-red) — used for the
  live-workout "F" failure badge (`LiveWorkout.jsx:542`). **This is the one
  token that actively conflicts with the reference style**, which uses orange
  for the failure badge.
- Radii: `--radius-card: 20px`, `--radius-elem: 12px`. No pill-radius token
  exists — primary buttons (`.btn-volt`) currently use a hardcoded 14px
  border-radius, not a full pill.
- Native number-input spinners are **not currently suppressed anywhere** in
  the codebase (`grep` for `spin-button`/`appearance-none` returns nothing).

## 2. Color tokens (delta from current system)

| Token | Current | Proposed | Notes |
|---|---|---|---|
| `--color-ink` | `#0B0F1A` | unchanged | Already matches "near-black" |
| `--color-surface` / `--color-surface-2` | `#121826` / `#1A2234` | unchanged | Card/modal backgrounds already dark enough |
| `--color-volt` (primary accent) | `#38BDF8` | unchanged | Already the target blue |
| `--color-coral` (failure/danger) | `#FB7185` (pink-red) | **keep as danger**, add new `--color-orange` | Don't repurpose coral — it's used for "cancel workout", "discard", validation errors elsewhere. Add a dedicated orange for the failure badge specifically. |
| **new** `--color-orange` | — | `#F97316` (dark) / `#EA580C` (light) | Strong-style "F" failure badge only. Needs its own `-soft` variant (`rgba(249,115,22,0.14)`) for consistency with existing accent tokens. |
| **new** `--radius-pill` | — | `9999px` | Full-width pill CTAs |

All new tokens get a light-mode counterpart in the `:root[data-theme="light"]`
block, following the existing pattern (darker/more saturated value for
light backgrounds — see how `--color-coral` goes from `#FB7185` dark to
`#E11D48` light).

## 3. Typography

No changes proposed. Existing `Rubik Variable` (Hebrew + Latin subsets, RTL)
stays. The reference style's compact numeric rows map to the existing
`tabular-nums` utility already used throughout `LiveWorkout.jsx` for
set/weight/reps numbers — keep using it, don't introduce a new numeric
font stack.

## 4. Spacing / density

Reference style is denser than current: tighter row height, smaller gaps
between the SET/PREVIOUS/KG/REPS columns. Current `LiveWorkout.jsx` set rows
use `py-2 px-2` with `gap-1` in a `grid-cols-[1.6rem_1fr_1.3fr_1.3fr_2rem]`
layout — structurally already the right shape (this exact column layout was
deliberately tuned recently for a decimal-clipping bug, see the comment at
`LiveWorkout.jsx:481-488`). Proposed change is **visual density only**, not
re-deriving the column widths:
- Row min-height: reduce from implicit (~52px) to ~44px
- Reduce vertical rhythm between rows from current spacing where needed to
  read as a tighter "table" rather than a stack of cards

## 5. Component patterns

### 5.1 Set/rep row ("SET / PREVIOUS / KG / REPS")
- Keep the existing unequal-column grid approach (`grid-cols-[1.6rem_1fr_1.3fr_1.3fr_2rem]`)
  — it already solves the 3-digit-decimal clipping bug; don't regress it.
- **New:** suppress native number-input spinners globally via a CSS rule
  (`input[type=number]::-webkit-outer-spin-button/-inner-spin-button` +
  `-moz-appearance: textfield` on the `input[type=number]` itself), added once
  to `index.css` as a shared primitive — not per-component.
- **New:** replace the current pink-red "F" badge (`bg-coral text-ink`,
  `LiveWorkout.jsx:542`) with the new `bg-orange text-ink` token.

### 5.2 Pill buttons
- **New `.btn-pill` variant** (or extend `.btn-volt` with a `rounded-[var(--radius-pill)]`
  override) for primary full-width CTAs: "השלם תרגיל" (complete set),
  "שמור תוכנית" (save plan), "סיים אימון" (finish workout).
- Secondary/tertiary buttons (prev/next exercise, cancel, discard) can stay
  on the existing `--radius-elem`/`rounded-xl` scale — the reference style
  reserves full pills for the primary action, not every button.

### 5.3 Failure badge
- Orange circular badge (`--color-orange`), same size/shape as the existing
  done-checkmark badge (`w-6 h-6 rounded-full`), just recolored and reused
  as-is structurally.

## 6. What is explicitly NOT changing in this redesign

- RTL layout, Hebrew-first UI, `dir="rtl"` container pattern
- The mobile-only 430px frame and disabled breakpoints
- The overall card/glass-morphism surface treatment (`.card-glass`) for
  non-tabular content (exercise header, modals) — the "Strong" density
  applies specifically to the tabular set-logging rows, not the whole page
- Macro-color tokens (protein/carbs/fat) — unrelated to workout UI
- Light-mode existence — light mode stays, gets updated token values

Full implementation-order details are in the accompanying screen inventory
and phasing plan (reported separately, not committed to the repo — see
Obsidian `08_Next_Session_Context` session log for this planning session).

## 7. Status (as of Phase 4)

All 4 phases shipped to `dev`/`origin/dev`: tokens (`76d9c33`), `LiveWorkout.jsx`
(`5b409d0`), `ManualWorkoutBuilder.jsx` (`0a339b7`), and `Workouts.jsx`'s 4
primary CTAs (uncommitted as of this note — see git log for the actual
commit once pushed). The `Workouts.jsx` "בנה ידנית" (edit) button was
deliberately left non-pill per §5.2's primary-only rule.

## 8. Unrelated feature note — Spotify in-workout playback

Not part of this visual redesign, but touches the same `LiveWorkout.jsx`
screen: an in-workout Spotify playback integration is being built as a
**personal-use/small-testing feature only**, not a general FitAI feature.
Spotify's Development Mode caps apps at 5 authorized users, and Extended
Quota Mode has been closed to individual developers since May 15, 2025
(organizations with 250k+ MAU only) — there is no upgrade path for a
solo project. See the Obsidian session log for the full corrected findings
and implementation notes; this is flagged here only so a future redesign
pass on `LiveWorkout.jsx` doesn't miss that a music widget now lives there
too.
