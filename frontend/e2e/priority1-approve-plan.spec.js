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

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    await api('/api/v1/auth/register', {
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

    const loginRes = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    token = loginRes.access_token

    await api('/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })

    const { task_id } = await api('/api/v1/agents/workout', { method: 'POST' })

    let status
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      status = await api(`/api/v1/agents/status/${task_id}`)
      if (status.status === 'ready' || status.status === 'error') break
    }
    if (status?.status !== 'ready') {
      throw new Error(`Workout generation did not complete: ${JSON.stringify(status)}`)
    }

    await api(`/api/v1/agents/approve/${status.suggestion_id}`, { method: 'POST' })

    // Ground truth for the assertion below: the backend's own completeness
    // check (incomplete_plan_keys) only requires all 7 day *keys* to be
    // present, not that each day has exercises or an explicit rest flag --
    // so a real day can legitimately end up with zero exercises and no rest
    // marker, and correctly show the empty state. Read the actual approved
    // content so the test can tell "legitimately empty" apart from "the bug
    // hid real content" instead of assuming every day has exercises.
    const savedPlan = await api('/api/v1/workouts/plan')
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
