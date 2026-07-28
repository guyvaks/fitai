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

// Regression test (2026-07-28): ManualWorkoutBuilder.jsx opening an
// AI-approved plan for editing. Same flat-vs-wrapped family as Priority 1,
// but here a read-only fallback isn't enough -- the exercise SHAPE itself
// differs (AI: `sets` is a count + exercise-level reps/weight_kg +
// rest_seconds; manual: `sets` is an array of independently-editable
// {weight_kg, reps} rows, no rest_seconds). See
// normaliseExerciseForEditing() in ManualWorkoutBuilder.jsx for the exact
// conversion, and create_manual_workout_plan in workouts.py for the
// matching save-side change (a full 7-day submission now replaces
// plan_data outright instead of merging, so editing-and-saving genuinely
// converts the plan to flat/manual -- confirmed here end to end, not just
// that the builder displays it converted).
test.describe('ManualWorkoutBuilder: AI-approved plan loads, edits, and saves as a real manual plan', () => {
  let p4Email
  let p4Password
  let p4Token
  let p4UserId

  test.beforeAll(async () => {
    const ts = Date.now()
    p4Email = `e2e-priority4-${ts}@example.com`
    p4Password = 'E2ePriority4#2026'

    await api(null, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: p4Email, password: p4Password, full_name: 'E2E Priority4',
        consent_given: true, preferred_language: 'he',
      }),
    })

    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const { rows } = await client.query(
      'UPDATE users SET is_verified = true, ai_access_approved = true WHERE email = $1 RETURNING id',
      [p4Email]
    )
    p4UserId = rows[0].id
    await client.end()

    const loginRes = await api(null, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: p4Email, password: p4Password }),
    })
    p4Token = loginRes.access_token

    await api(p4Token, '/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })
  })

  test.afterAll(async () => {
    if (!p4UserId) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    for (const table of [
      'weight_logs', 'workout_sessions', 'workout_plans',
      'user_profiles', 'consent_records', 'email_verification_codes',
    ]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [p4UserId])
    }
    await client.query('DELETE FROM users WHERE id = $1', [p4UserId])
    await client.end()
  })

  test('AI-approved plan opens correctly in the editor, edits save, and the result is a real flat manual plan everywhere it is read', async ({ page }) => {
    const insertClient = new pg.Client({ connectionString: DATABASE_URL })
    await insertClient.connect()
    // AI-shaped plan_data: sets is a COUNT, reps/weight_kg are exercise-level,
    // rest_seconds present -- exactly what crew_agents.py's prompt schema
    // produces, wrapped under workout_plan.
    await insertClient.query(
      `INSERT INTO workout_plans (id, user_id, plan_data, is_active, created_at)
       VALUES (gen_random_uuid(), $1, $2::jsonb, true, now())`,
      [p4UserId, JSON.stringify({
        workout_plan: {
          sunday: {
            type: 'strength', name: 'אימון פלג גוף עליון',
            exercises: [
              { name: 'AI Squat', muscle_group: 'רגליים', sets: 3, reps: 8, weight_kg: 50, rest_seconds: 90, notes: null },
              { name: 'AI Row', muscle_group: 'גב', sets: 2, reps: 12, weight_kg: 20, rest_seconds: 60, notes: null },
            ],
          },
          monday: { type: 'rest', name: 'מנוחה', exercises: [] },
          tuesday: { type: 'rest', name: 'מנוחה', exercises: [] },
          wednesday: { type: 'rest', name: 'מנוחה', exercises: [] },
          thursday: { type: 'rest', name: 'מנוחה', exercises: [] },
          friday: { type: 'rest', name: 'מנוחה', exercises: [] },
          saturday: { type: 'rest', name: 'מנוחה', exercises: [] },
        },
      })]
    )
    await insertClient.end()

    await page.goto('/dashboard')
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('fitai_token', token)
      localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e-p4', email, full_name: 'E2E Priority4', is_admin: false }))
    }, { token: p4Token, email: p4Email })

    // --- Step 1: open the AI plan in the manual editor, verify the
    // shape conversion (count -> N editable rows, uniform values applied) ---
    await page.goto('/workouts/manual-builder')
    await page.waitForResponse((r) => r.url().includes('/api/v1/workouts/plan'), { timeout: 15000 })
    await page.waitForFunction(() => document.body.innerText.includes('AI Squat'), { timeout: 10000 })

    const squatCard = page.locator('div.card-glass', { hasText: 'AI Squat' })
    // 3 sets x 2 inputs (weight, reps) per row = 6 number inputs
    await expect(squatCard.locator('input[type="number"]')).toHaveCount(6)
    const squatValues = await squatCard.locator('input[type="number"]').evaluateAll(
      (inputs) => inputs.map((i) => i.value)
    )
    // [weight, reps] x 3 identical rows, expanded from sets:3/reps:8/weight_kg:50
    expect(squatValues).toEqual(['50', '8', '50', '8', '50', '8'])

    const rowCard = page.locator('div.card-glass', { hasText: 'AI Row' })
    await expect(rowCard.locator('input[type="number"]')).toHaveCount(4)
    const rowValues = await rowCard.locator('input[type="number"]').evaluateAll(
      (inputs) => inputs.map((i) => i.value)
    )
    expect(rowValues).toEqual(['20', '12', '20', '12'])

    // --- Step 2: edit -- change the last set of AI Squat's weight, verify
    // it's actually editable (not read-only display) ---
    const squatInputs = squatCard.locator('input[type="number"]')
    await squatInputs.nth(4).fill('55') // last row's weight_kg input
    await expect(squatInputs.nth(4)).toHaveValue('55')

    // --- Step 3: save ---
    await page.getByRole('button', { name: /שמור תוכנית/ }).click()
    await page.waitForURL('**/workouts', { timeout: 10000 })

    // --- Step 4: confirm the saved result reads correctly in Workouts.jsx,
    // not just that the builder displayed it converted ---
    await page.waitForResponse((r) => r.url().includes('/api/v1/workouts/plan'), { timeout: 15000 })
    await page.waitForFunction(() => document.body.innerText.includes('AI Squat'), { timeout: 10000 })
    await expect(page.getByText('אין תרגילים מתוכננים ליום זה')).not.toBeVisible()
    await expect(page.getByText('55kg', { exact: false })).toBeVisible()

    // --- Step 5: confirm the DB itself was actually converted to flat
    // shape (not just displayed converted client-side) ---
    const verifyClient = new pg.Client({ connectionString: DATABASE_URL })
    await verifyClient.connect()
    const { rows: planRows } = await verifyClient.query(
      'SELECT plan_data FROM workout_plans WHERE user_id = $1 AND is_active = true',
      [p4UserId]
    )
    await verifyClient.end()
    const savedPlanData = planRows[0].plan_data
    expect(savedPlanData.workout_plan).toBeUndefined()
    expect(savedPlanData.sunday.exercises[0].name).toBe('AI Squat')
    expect(Array.isArray(savedPlanData.sunday.exercises[0].sets)).toBe(true)
    expect(savedPlanData.sunday.exercises[0].sets.at(-1).weight_kg).toBe(55)
    expect(savedPlanData.monday.exercises).toEqual([])

    // --- Step 6: confirm LiveWorkout also reads the saved plan correctly,
    // not the demo-fallback exercises it shows when it can't find real data ---
    await page.goto('/live-workout?day=sunday')
    await page.waitForFunction(() => document.body.innerText.includes('AI Squat'), { timeout: 15000 })
    await expect(page.getByText('לחיצת חזה')).not.toBeVisible() // demo fallback's first exercise name
  })
})

// Regression tests (2026-07-28) for two live UX bugs found during
// production verification of the ManualWorkoutBuilder fix above -- neither
// caused by that fix (confirmed by diffing e3fe5f6, which never touched
// ExerciseSearch.jsx, handleSelectFromSearch/addExerciseToDay, or
// Workouts.jsx's exercise-row rendering), both pre-existing gaps.
test.describe('ManualWorkoutBuilder picker + Workouts arrow fixes', () => {
  let p5Email
  let p5Password
  let p5Token
  let p5UserId

  test.beforeAll(async () => {
    const ts = Date.now()
    p5Email = `e2e-priority5-${ts}@example.com`
    p5Password = 'E2ePriority5#2026'

    await api(null, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: p5Email, password: p5Password, full_name: 'E2E Priority5',
        consent_given: true, preferred_language: 'he',
      }),
    })

    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const { rows } = await client.query(
      'UPDATE users SET is_verified = true, ai_access_approved = true WHERE email = $1 RETURNING id',
      [p5Email]
    )
    p5UserId = rows[0].id
    await client.end()

    const loginRes = await api(null, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: p5Email, password: p5Password }),
    })
    p5Token = loginRes.access_token

    await api(p5Token, '/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })
  })

  test.afterAll(async () => {
    if (!p5UserId) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    for (const table of ['weight_logs', 'workout_plans', 'user_profiles', 'consent_records', 'email_verification_codes']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [p5UserId])
    }
    await client.query('DELETE FROM users WHERE id = $1', [p5UserId])
    await client.end()
  })

  test('picker: clicking an already-added exercise again does not add a duplicate', async ({ page }) => {
    await page.goto('/dashboard')
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('fitai_token', token)
      localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e-p5', email, full_name: 'E2E Priority5', is_admin: false }))
    }, { token: p5Token, email: p5Email })

    await page.goto('/workouts/manual-builder')
    await page.waitForResponse((r) => r.url().includes('/api/v1/exercises/search'), { timeout: 15000 })

    await page.fill('input[placeholder="חיפוש חופשי..."]', 'לחיצת חזה במוט')
    await page.waitForTimeout(500) // debounced search (200ms) + render

    const catalogButton = page.locator('div.grid.grid-cols-2 button').first()
    await catalogButton.waitFor({ state: 'visible', timeout: 5000 })

    await catalogButton.click()
    // aria-label="הסר תרגיל" (remove button) is unique to a real exercise
    // card -- unlike card-glass/p-4/space-y-3, which the "add exercise"
    // panel container above also happens to share.
    await expect(page.locator('button[aria-label="הסר תרגיל"]')).toHaveCount(1)

    // Guy's exact repro: click the same catalog entry repeatedly. The
    // button is now `disabled`, which alone stops a real user's repeated
    // clicks -- Playwright's normal .click() actually refuses to click a
    // disabled element at all (confirmed: it retries/times out waiting for
    // "enabled" instead of clicking). Force the click anyway to also prove
    // the onClick handler's own isAdded guard holds, not just the disabled
    // attribute (defense in depth, and robust to a real click somehow
    // landing despite the disabled state, e.g. a fast double-click race).
    for (let i = 0; i < 5; i++) {
      await catalogButton.click({ force: true })
    }
    // aria-label="הסר תרגיל" (remove button) is unique to a real exercise
    // card -- unlike card-glass/p-4/space-y-3, which the "add exercise"
    // panel container above also happens to share.
    await expect(page.locator('button[aria-label="הסר תרגיל"]')).toHaveCount(1)

    // The picker button itself reflects the "already added" state instead
    // of silently accepting more clicks.
    await expect(catalogButton).toBeDisabled()
    await expect(catalogButton.locator('svg').last()).toBeVisible() // checkmark
  })

  test('arrow: clicking an exercise row on Workouts navigates into ManualWorkoutBuilder with that day pre-selected', async ({ page }) => {
    const insertClient = new pg.Client({ connectionString: DATABASE_URL })
    await insertClient.connect()
    await insertClient.query(
      `INSERT INTO workout_plans (id, user_id, plan_data, is_active, created_at)
       VALUES (gen_random_uuid(), $1, $2::jsonb, true, now())`,
      [p5UserId, JSON.stringify({
        wednesday: { exercises: [
          { name: 'Arrow Test Exercise', muscle_group: 'רגליים', notes: null, sets: [{ weight_kg: 50, reps: 8 }] },
        ] },
      })]
    )
    await insertClient.end()

    await page.goto('/dashboard')
    await page.evaluate(({ token, email }) => {
      localStorage.setItem('fitai_token', token)
      localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e-p5', email, full_name: 'E2E Priority5', is_admin: false }))
    }, { token: p5Token, email: p5Email })

    await page.goto('/workouts')
    await page.waitForResponse((r) => r.url().includes('/api/v1/workouts/plan'), { timeout: 15000 })

    // Wednesday is the 4th button (index 3) in the sunday..saturday day strip.
    const dayStrip = page.locator('div.overflow-x-auto').first()
    await dayStrip.locator('button').nth(3).click()
    await page.waitForFunction(() => document.body.innerText.includes('Arrow Test Exercise'), { timeout: 10000 })

    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/v1/workouts/plan'), { timeout: 15000 })
    await page.locator('button', { hasText: 'Arrow Test Exercise' }).click()
    await page.waitForURL('**/workouts/manual-builder*', { timeout: 10000 })
    await responsePromise

    expect(page.url()).toContain('day=wednesday')
    // Give the load effect's setWeek a moment to settle before asserting content.
    await page.waitForFunction(() => document.body.innerText.includes('Arrow Test Exercise'), { timeout: 10000 })
    await expect(page.getByText('אין תרגילים עדיין ליום זה')).not.toBeVisible()

    const activeDayTab = page.locator('button.bg-volt.text-ink', { hasText: 'רביעי' })
    await expect(activeDayTab).toBeVisible()
  })
})

// Regression test (2026-07-28) for a horizontal-overflow bug in
// ManualWorkoutBuilder's sets table, found live in production. Pre-existing
// (present since the file's original commit, 8b594c3) -- confirmed via git
// show that neither of today's ManualWorkoutBuilder commits (e3fe5f6,
// e451cff) touched any layout/CSS in this file.
//
// Root cause: the weight_kg/reps <input type="number"> elements had no
// explicit width class. Inside a CSS Grid track sized `1fr`, a grid item's
// default min-width is `auto` (its own content/intrinsic size), not 0 --
// so the browser's default ~183px intrinsic input width was never
// shrunk to fit, and two of them side by side blew past the available
// track width on any mobile viewport. <main> only sets overflow-y-auto;
// per the CSS Overflow spec, an unset overflow-x on an element with a
// non-visible overflow-y computes to auto too, so <main> silently grew
// its own horizontal scrollbar to absorb the overflow -- meaning
// document.documentElement itself never showed it, only <main> did.
// Fixed with w-full min-w-0 on both inputs.
test.describe('ManualWorkoutBuilder sets table does not overflow horizontally', () => {
  let p6Email
  let p6Password
  let p6Token
  let p6UserId

  test.beforeAll(async () => {
    const ts = Date.now()
    p6Email = `e2e-priority6-${ts}@example.com`
    p6Password = 'E2ePriority6#2026'

    await api(null, '/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: p6Email, password: p6Password, full_name: 'E2E Priority6',
        consent_given: true, preferred_language: 'he',
      }),
    })

    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const { rows } = await client.query(
      'UPDATE users SET is_verified = true, ai_access_approved = true WHERE email = $1 RETURNING id',
      [p6Email]
    )
    p6UserId = rows[0].id
    await client.end()

    const loginRes = await api(null, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: p6Email, password: p6Password }),
    })
    p6Token = loginRes.access_token

    await api(p6Token, '/api/v1/users/profile', {
      method: 'POST',
      body: JSON.stringify({
        age: 30, gender: 'male', height_cm: 180, weight_kg: 80,
        goal: 'muscle_gain', activity_level: 'moderately_active',
        meals_per_day: 4, equipment: ['bodyweight', 'dumbbell'],
      }),
    })

    // Deliberately stressed: a long Hebrew exercise name and a decimal
    // weight, plus 3 sets -- two side-by-side inputs per row is exactly
    // the layout that overflowed.
    await api(p6Token, '/api/v1/workouts/plan/manual', {
      method: 'POST',
      body: JSON.stringify({
        week: {
          sunday: [{
            name: 'לחיצת חזה בשיפוע עם משקולות יד כבדות',
            muscle_group: 'חזה',
            notes: null,
            sets: [
              { weight_kg: 100.5, reps: 12 },
              { weight_kg: 95, reps: 10 },
              { weight_kg: 90, reps: 8 },
            ],
          }],
        },
      }),
    })
  })

  test.afterAll(async () => {
    if (!p6UserId) return
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    for (const table of ['weight_logs', 'workout_plans', 'user_profiles', 'consent_records', 'email_verification_codes']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [p6UserId])
    }
    await client.query('DELETE FROM users WHERE id = $1', [p6UserId])
    await client.end()
  })

  for (const width of [375, 390]) {
    test(`sets table fits without horizontal scroll at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 1200 } })
      const page = await context.newPage()

      await page.goto('/dashboard')
      await page.evaluate(({ token, email }) => {
        localStorage.setItem('fitai_token', token)
        localStorage.setItem('fitai_user', JSON.stringify({ id: 'e2e-p6', email, full_name: 'E2E Priority6', is_admin: false }))
      }, { token: p6Token, email: p6Email })

      await page.goto('/workouts/manual-builder')
      await page.waitForResponse((r) => r.url().includes('/api/v1/workouts/plan'), { timeout: 15000 })
      // Wait for the real seeded data specifically (not just any picker
      // catalog text, which can coincidentally contain similar substrings).
      await page.waitForFunction(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'))
        return inputs.some((i) => i.value === '100.5')
      }, { timeout: 15000 })

      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')
        return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth }
      })
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)

      await context.close()
    })
  }
})
