# FitAI — Product Requirements

A living reference for what FitAI is, what it does, and why key parts of it are built the way they are. Update this alongside significant feature or architecture changes — it should stay accurate, not aspirational.

## What FitAI is

FitAI is a Hebrew-first, mobile-only web app that acts as an AI-powered personal dietitian and fitness trainer. It generates and manages personalized weekly nutrition and workout plans, tracks progress over time, and replaces the ongoing role a human dietitian/trainer would otherwise play — profile intake, plan generation, day-to-day logging, and iterative adjustment — with an AI agent pipeline plus a conventional CRUD app around it.

## Core features

### Authentication
- **Username-based login** (not email) is the standard sign-in path, with password.
- **WebAuthn (Face ID / Touch ID / Windows Hello / Android biometric unlock)** as an optional, additional sign-in method per device. Credentials are resident/discoverable-key only, enabling a fully usernameless biometric login (the browser surfaces "which account?" from the authenticator itself). `user_verification` is `REQUIRED` (not merely requested) on both registration and login, with an explicit server-side check on the assertion's `user_verified` flag — physical access to an unlocked device is sufficient to sign in, so the device's own biometric/PIN gate is the only thing standing in for a password in that flow.
- **Existing-user migration bridge** (`/activate-account`): accounts created before the username feature existed have `username = NULL` forever (by design — never backfilled, never made `NOT NULL`) until the owner explicitly activates with their email+password and picks a username. This is the only place besides `/forgot-access` that still accepts email.
- **Email verification** required before login (6-digit code), with all existing pre-feature users grandfathered as verified.
- **Forgot-access** is a single combined "forgot username or password" entry point — one form field (email), one generic response regardless of account existence, with the actual recovery content (username reminder vs. activate-account link, plus a password-reset link either way) varying only in the email itself.
- Per-device credential management in Settings: list, label, registration date, and individual revoke — available even from a device that doesn't itself support biometric login (revoking a lost/stolen device's credential is exactly the scenario that needs to work from elsewhere).
- New-WebAuthn-device registration sends a notification email, so a stolen-password-then-register-a-device attack doesn't go unnoticed.
- Rate limiting on all auth endpoints (login, WebAuthn verify, register, forgot-access, reset-password, etc.), tuned so WebAuthn login attempts are capped at parity with password login.

### Nutrition
- Weekly meal plan generation (AI), plus a manual/daily food log ("תכנון שבועי" + "מעקב יומי" tabs).
- `food_master` — a canonical, curated food/nutrition-value table the nutrition agent is meant to be constrained to (calories/protein/carbs/fat/fiber per 100g), extensible via user-submitted entries.
- BMI/BMR/TDEE calculated and surfaced (profile + dashboard gauge).

### Workouts
- AI-generated weekly workout plans, retried automatically (structural + semantic "judge" validation) on incomplete or nonsensical output before giving up.
- Manual workout builder as a full alternative to AI generation, and as an edit path for AI-generated plans (editing + saving converts a plan fully to manual, untagged).
- Live, in-session workout tracking (sets/reps/weight logging) feeding into workout history and weight/progress logs.
- `exercises_master` — the canonical exercise list (Hebrew + English names, muscle group, equipment) the workout-generation agent is constrained to select from, with equipment-based filtering per user profile (bodyweight always available).

### AI generation & suggestion workflow
- Plans are generated asynchronously (background task + polling) and land as an `AISuggestion` row in a `pending` state, not written directly into the user's active plan.
- The user reviews and approves (or the flow supersedes it with a fresh generation) before it becomes the active `NutritionPlan`/`WorkoutPlan`.
- A gate gerund: `ai_access_approved` (grandfathered `true` for existing users, `false` for new signups until an admin approves) and an optional `daily_ai_generation_limit`, both enforced at generation-request time, both changed only via the admin panel.

### Admin panel
- User management: activate/deactivate, revoke AI access, set daily generation limits, send ad-hoc email, bulk versions of all of the above (including bulk delete-selected with full cascade cleanup), search/filter.
- Pending-review queues for user-submitted `exercises_master`/`food_master` entries (submitted inactive, invisible to the AI agent, until an admin approves — see architectural notes below).
- Admin promotion is deliberately DB-only (no API/UI path), a one-way decision made outside the app.

### Notifications
- Transactional email via Resend: verification codes, password reset, forgot-access, admin notifications (pending AI-access approvals, new WebAuthn device), ad-hoc admin-composed messages.
- Web Push (VAPID) for admin-facing "something needs attention" alerts, running alongside email as a best-effort secondary channel (email is currently the reliable channel — push has had platform-specific delivery issues).

## Tech stack

**Backend:** Python 3.12, FastAPI, SQLAlchemy + Alembic (migrations), PostgreSQL. `slowapi` for rate limiting. `python-jose`/`passlib`+`bcrypt` for JWTs and password hashing. `webauthn` (py_webauthn) for WebAuthn/FIDO2. `resend` for email, `pywebpush` for Web Push. AI generation via `crewai` orchestrating `anthropic` (Claude, primary) and `openai`-compatible calls (via `litellm`, a `crewai` dependency).

**Frontend:** React 19 + Vite, Tailwind CSS v4 (dark/light theme, RTL-first with explicit `dir="ltr"` overrides where needed — numbers, gauges, dates). `react-router-dom` for routing, `axios` for API calls, `@simplewebauthn/browser` for the WebAuthn ceremony, `recharts` for progress charts, `lucide-react` for icons. Deliberately **mobile-only**: a fixed max-width wrapper in `App.jsx`, breakpoints effectively disabled.

**Testing:** `pytest` (backend, ~289 tests), `vitest` + `@testing-library/react` (frontend unit/component, local-only so far), `Playwright` (frontend E2E, local + a scheduled production/staging health-check workflow).

**Infrastructure:** Railway (separate `production` and `staging` environments, each with its own Postgres; both environments' services currently track the same `main` branch — Railway's per-environment branch tracking is shared per service, a known platform limitation, not a bug). GitHub Actions for the scheduled E2E health-check monitor.

## Key architectural decisions

- **Flat-vs-wrapped plan-data shape, flat-first-fallback convention.** `WorkoutPlan.plan_data`/`NutritionPlan.plan_data` can be stored either as a flat `{day: {...}}` dict (manual entry) or wrapped one level under a legacy `workout_plan`/`meal_plan` key (older AI-generated shape). Every reader (`LiveWorkout.jsx`, `Workouts.jsx`, `Dashboard.jsx`, etc.) must check the flat key **first**, falling back to the wrapped key only if the flat one is absent for that day — never the reverse. This matters because a plan can end up with both shapes present simultaneously (an AI plan later hand-edited): the flat shape is always the more recent, authoritative one for whichever days were actually resubmitted. A full 7-day manual submission replaces `plan_data` outright (clearing the stale wrapper); a partial submission still merges, so the flat-first rule remains necessary for as long as partial submissions are possible.
- **`exercises_master`/`food_master` suggest-then-approve pattern.** Any authenticated user can submit a new canonical exercise or food item. It's stored immediately but `is_active = False`, making it invisible to `get_canonical_exercises()`/equivalent — and therefore invisible to the AI generation agents, which are constrained to select only from the active canonical list (prompt-level constraint + response validation/logging). An admin approval flips `is_active = True`. This keeps the AI's vocabulary curated without blocking user contributions or requiring a migration per new item.
- **`AISuggestion` pending/approved/rejected state machine.** AI-generated plans never write directly into the active `NutritionPlan`/`WorkoutPlan` tables; they land as a `pending` `AISuggestion` first, and only an explicit approval promotes one into the active plan. (Known, not-yet-fixed gap: `approve_suggestion` doesn't currently re-check `status == "pending"` before promoting, so a stale client could theoretically re-approve an already-superseded suggestion — flagged, not proven to have caused a real issue yet.)
- **Username nullable-forever, not backfilled.** `users.username`/`username_normalized` are permanently nullable — there is no migration path that force-fills them, and no plan to add a `NOT NULL` constraint. An account either has a username (new signups, or migrated via `/activate-account`) or it doesn't, indefinitely, until its owner migrates it themselves.
- **Resend sandbox-sender workaround.** Until a verified sending domain replaces the shared Resend sandbox sender (`onboarding@resend.dev`, which can only deliver to the Resend account owner), `RESEND_SANDBOX_OVERRIDE_EMAIL` redirects every outbound email to one address, with the real intended recipient named in the subject/banner instead. This is a temporary, explicitly-flagged workaround, not a design goal.
- **Mobile-only frontend.** There is no responsive desktop layout by design — a fixed-width mobile frame is enforced at the app-shell level. UI work should assume a phone viewport, not adapt to wider ones.
- **Production-safety gate.** No merge/push/deploy/config change reaches `main`/production without explicit, per-instance approval — a standing project rule enforced procedurally (and, for AI-assisted changes specifically, via a technical block on pushing/merging directly to `main`).

## Environment variables

Names only — no values belong in this file or anywhere in the repo. See Railway's environment variables (per-environment: `staging`/`production`) for actual values.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SECRET_KEY` | JWT signing secret |
| `ALGORITHM` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session token lifetime |
| `ENVIRONMENT` | `development` / `staging` / `production` — also gates a safety check preventing a dev-configured `DATABASE_URL` from accidentally pointing at production |
| `ANTHROPIC_API_KEY` | Claude API access (primary LLM for plan generation) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (VAPID) keys and contact subject |
| `RESEND_API_KEY` | Resend transactional email API access |
| `RESEND_FROM_EMAIL` | Sender address (shared sandbox sender until a domain is verified) |
| `RESEND_SANDBOX_OVERRIDE_EMAIL` | Temporary all-mail-redirect while on the sandbox sender (see architectural notes) |
| `FRONTEND_URL` | Deployed frontend origin, used to build links in outbound emails |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGIN` | WebAuthn relying-party identity and expected origin |
| `E2E_MONITOR_SECRET` | Shared secret letting the scheduled E2E health-check workflow skip real email sends during its synthetic registration flow |

## Known, deliberately-not-fixed items

Kept here rather than only in code comments, so they don't need rediscovering:

- `approve_suggestion` doesn't verify `status == "pending"` before promoting a suggestion (see above).
- `GET /admin/users` has no pagination yet.
- `crewai`/`anthropic` dependencies are pinned with `>=` and no upper bound in `requirements.txt` (unlike `openai`, which was pinned after an unbounded-`>=` upgrade broke production once) — same risk category, not yet addressed.
