// Growing file: one spec file per investigation session, each adding a
// test.describe block for the bug it covers. Started as a Priority 1 only
// file; Priority 3's test lives below it.
//
// Regression test for the Priority 1 bug (2026-07-28): a user approves an
// AI-generated workout plan and the Workouts page still shows "אין תרגילים
// מתוכננים ליום זה" (no exercises planned) for every day, even though the
// plan was saved correctly and is active in the DB.
//
// Root cause: WorkoutPlan.plan_data for an AI-approved plan is the raw
// approved suggestion content, which is always wrapped one level deeper
// under a "workout_plan" key (e.g. { workout_plan: { sunday: {...}, ... } }).
// Only manually-built plans (POST /workouts/plan/manual) store days flat at
// the top level. Workouts.jsx (and Dashboard.jsx) only ever read the flat
// shape, so every AI-approved plan silently reads as empty.
//
// This drives the real approve pipeline over the API (register -> verify
// bypass -> profile -> generate -> approve, exactly as agents.py implements
// it, real CrewAI call included) and then loads the actual Workouts page to
// assert on the rendered UI.
//
// Required env vars (this is local/dev only, not wired into CI):
//   E2E_API_URL   backend base URL, default http://localhost:8000
//   E2E_BASE_URL  frontend base URL (also read by playwright.config.js),
//                 default http://localhost:5173
//   DATABASE_URL  Postgres connection string for the SAME backend above --
//                 used only to bypass email verification / grant AI access
//                 (no self-service flow exists for either) and to clean up
//                 the throwaway user afterward. Point this at staging or a
//                 local DB, never at production.
import { test, expect } from '@playwright/test'
import pg from 'pg'

const API_URL = process.env.E2E_API_URL || 'http://localhost:8000'
const DATABASE_URL = process.env.DATABASE_URL

test.skip(!DATABASE_URL, 'DATABASE_URL env var is required for this test (see file header)')

const NO_EXERCISES_TEXT = 'אין תרגילים מתוכננים ליום זה'
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

let email
let password
let token
let userId
let plannedDays

// Takes an explicit token (rather than closing over a shared module
// variable) so multiple independent test users in this same file -- see
// the Priority 3 suite below -- can't accidentally cross-contaminate.
async function api(authToken, path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${body}`)
  }
  return res.json()
}

test.describe('Priority 1: approve AI workout plan reflects in UI', () => {
  test.beforeAll(async () => {
    const ts = Date.now()
    email = `e2e-priority1-${ts}@example.com`
    password = 'E2ePriority1#2026'

    await api(null, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email, password, full_name: 'E2E Priority1',
        consent_given: true, preferred_language: 'he',
      }),
    })

    // No self-service path for either flag -- same DB bypass the monitoring
    // e2e-check.mjs script uses for verification, extended to also grant AI
    // access (normally an admin-only action).
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const { rows } = await client.query(
      'UPDATE users SET is_verified = true, ai_access_approved = true WHERE email = $1 RETURNING id',
      [email]
    )
    userId = rows[0].id
    await client.end()

    const loginRes = await api(null, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    token = loginRes.access_token

    await api(token, '/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })

    const { task_id } = await api(token, '/api/v1/agents/workout', { method: 'POST' })

    let status
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      status = await api(token, `/api/v1/agents/status/${task_id}`)
      if (status.status === 'ready' || status.status === 'error') break
    }
    if (status?.status !== 'ready') {
      throw new Error(`Workout generation did not complete: ${JSON.stringify(status)}`)
    }

    await api(token, `/api/v1/agents/approve/${status.suggestion_id}`, { method: 'POST' })

    // Ground truth for the assertion below: the backend's own completeness
    // check (incomplete_plan_keys) only requires all 7 day *keys* to be
    // present, not that each day has exercises or an explicit rest flag --
    // so a real day can legitimately end up with zero exercises and no rest
    // marker, and correctly show the empty state. Read the actual approved
    // content so the test can tell "legitimately empty" apart from "the bug
    // hid real content" instead of assuming every day has exercises.
    const savedPlan = await api(token, '/api/v1/workouts/plan')
    plannedDays = Object.fromEntries(
      DAY_KEYS.map((day) => {
        const dayData = savedPlan.plan_data?.workout_plan?.[day]
        return [day, { hasExercises: (dayData?.exercises?.length ?? 0) > 0, isRest: !!dayData?.rest }]
      })
    )
  })

  test.afterAll(async () => {
    if (!userId) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    for (const table of [
      'weight_logs', 'workout_plans', 'ai_suggestions',
      'user_profiles', 'consent_records', 'email_verification_codes',
    ]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
    }
    await client.query('DELETE FROM users WHERE id = $1', [userId])
    await client.end()
  })

  test('approved plan shows real content on every day, not the empty state', async ({ page }) => {
    // Sanity check on the ground truth itself: this test only proves
    // anything if at least one day actually has exercises to hide.
    const daysWithExercises = DAY_KEYS.filter((d) => plannedDays[d].hasExercises)
    expect(daysWithExercises.length).toBeGreaterThan(0)

    await page.goto('/dashboard')
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('fitai_token', token)
      localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e', email, full_name: 'E2E Priority1', is_admin: false }))
    }, { token, email })

    await page.goto('/workouts')
    await expect(page.getByText('תכנית האימונים שלך')).toBeVisible()

    // The day-of-week strip (Workouts.jsx's `weekDates.map(...)`) renders
    // exactly 7 buttons in sunday..saturday order with no other identifying
    // markup, so index within that row is the only stable way to select a
    // given day.
    const dayStrip = page.locator('div.overflow-x-auto').first()
    const dayButtons = dayStrip.locator('button')
    await expect(dayButtons).toHaveCount(DAY_KEYS.length)

    for (let i = 0; i < DAY_KEYS.length; i++) {
      const day = DAY_KEYS[i]
      const { hasExercises, isRest } = plannedDays[day]
      await dayButtons.nth(i).click()

      if (hasExercises) {
        // This is the actual bug: a day with real saved exercises must not
        // render as if nothing were planned.
        await expect(page.getByText(NO_EXERCISES_TEXT)).not.toBeVisible()
      } else if (isRest) {
        await expect(page.getByText(NO_EXERCISES_TEXT)).not.toBeVisible()
        await expect(page.getByText('יום מנוחה')).toBeVisible()
      }
      // else: legitimately no exercises and no rest flag -- the empty
      // state is the correct rendering for that day, not asserted either way.
    }
  })
})

// Regression test for the Priority 3 bug (2026-07-28): Dashboard shows the
// "AI prepared a new plan" banner, but tapping it lands on the AI-suggestions
// page showing "אין הצעות ממתינות לאישור" (no suggestions pending).
//
// Investigated first, not assumed: Dashboard.jsx and AISuggestion.jsx call
// the exact same endpoint (GET /api/v1/agents/pending), so this is not a
// different-data-source bug, and it's unrelated to Priority 1's plan_data
// shape bug (this is about AISuggestion.status, a completely separate field).
//
// Root cause: Dashboard's hasPendingSuggestion only refreshes when
// location.pathname changes (see its useEffect deps) -- it never re-checks
// while the user just sits on the page. If the same-type suggestion gets
// superseded in the background during that window (see _start_task's
// supersede-on-new-generation in agents.py -- e.g. a regenerate fired from
// another tab, or the "בנה תכנית ליום זה עם AI" CTA elsewhere), the banner
// keeps showing stale state and clicking it lands on a page with nothing
// there anymore. Fixed by re-checking /pending at click time, before
// navigating, instead of trusting state that may already be gone.
//
// Uses a DB-inserted fake pending suggestion rather than a real CrewAI call
// (already covered by the Priority 1 suite above) -- this bug is about
// suggestion *status* timing, not content, so a synthetic row is enough and
// keeps this test fast and deterministic.
test.describe('Priority 3: Dashboard pending-suggestion banner does not dead-end', () => {
  let p3Email
  let p3Password
  let p3Token
  let p3UserId

  test.beforeAll(async () => {
    const ts = Date.now()
    p3Email = `e2e-priority3-${ts}@example.com`
    p3Password = 'E2ePriority3#2026'

    await api(null, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: p3Email, password: p3Password, full_name: 'E2E Priority3',
        consent_given: true, preferred_language: 'he',
      }),
    })

    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const { rows } = await client.query(
      'UPDATE users SET is_verified = true, ai_access_approved = true WHERE email = $1 RETURNING id',
      [p3Email]
    )
    p3UserId = rows[0].id
    await client.end()

    const loginRes = await api(null, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: p3Email, password: p3Password }),
    })
    p3Token = loginRes.access_token

    await api(p3Token, '/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })
  })

  test.afterAll(async () => {
    if (!p3UserId) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    for (const table of ['weight_logs', 'ai_suggestions', 'user_profiles', 'consent_records', 'email_verification_codes']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [p3UserId])
    }
    await client.query('DELETE FROM users WHERE id = $1', [p3UserId])
    await client.end()
  })

  test('banner re-checks before navigating instead of trusting stale state', async ({ page }) => {
    const insertClient = new pg.Client({ connectionString: DATABASE_URL })
    await insertClient.connect()
    await insertClient.query(
      `INSERT INTO ai_suggestions (id, user_id, suggestion_type, content, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'workout', $2::jsonb, 'pending', now(), now())`,
      [p3UserId, JSON.stringify({
        workout_plan: {
          sunday: { exercises: [{ name: 'Push-ups', muscle_group: 'chest', sets: 3, reps: 10, weight_kg: 0 }] },
          monday: { rest: true }, tuesday: { rest: true }, wednesday: { rest: true },
          thursday: { rest: true }, friday: { rest: true }, saturday: { rest: true },
        },
      })]
    )
    await insertClient.end()

    await page.goto('/dashboard')
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('fitai_token', token)
      localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e-p3', email, full_name: 'E2E Priority3', is_admin: false }))
    }, { token: p3Token, email: p3Email })
    await page.goto('/dashboard')
    await page.waitForResponse((r) => r.url().includes('/api/v1/agents/pending'), { timeout: 15000 })

    const bannerLocator = page.getByText('AI הכין לך תכנית חדשה')
    await bannerLocator.waitFor({ state: 'visible', timeout: 10000 })

    // Simulate the race: something else supersedes the pending suggestion
    // (same suggestion_type) while the user stays on Dashboard, without
    // waiting for the new generation to finish -- the banner has no way to
    // know yet.
    await fetch(`${API_URL}/api/v1/agents/workout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p3Token}` },
    })
    await page.waitForTimeout(500)

    await bannerLocator.click()
    await page.waitForTimeout(2000)

    // The fix: re-checking before navigating means no dead-end landing on
    // /ai-suggestion with nothing there -- stay put, hide the now-stale banner.
    expect(page.url()).toContain('/dashboard')
    await expect(bannerLocator).not.toBeVisible()
  })
})
