// Scheduled E2E health check for one FitAI environment (staging or production).
// Flow: register a throwaway account (checking the required consent checkbox)
// -> land on /verify-email -> read the real verification code straight out of
// the DB (code_hash is unsalted SHA-256 over a 6-digit space, so it's cheap to
// crack rather than needing to read an inbox) -> submit it and confirm we
// reach /dashboard -> open a FRESH browser context and log in with it for real
// (not just reuse the verify-email flow's auto-issued token) -> confirm we
// land on /dashboard again -> confirm the real browser-driven GET
// /api/v1/auth/me (fired by useAuth on mount) actually returns 200. Cleans up
// the throwaway user afterward no matter what happens.
//
// Required env vars:
//   FRONTEND_BASE_URL  e.g. https://fitai-frontend-staging.up.railway.app
//   DATABASE_URL       Postgres connection string for that same environment
//
// Exit code 0 = healthy, 1 = something failed (register/verify/login/
// navigation/API, or cleanup itself) -- GitHub Actions turns a non-zero exit
// into a failed step/job, which triggers its default failure-notification email.

import crypto from 'node:crypto'
import puppeteer from 'puppeteer'
import pg from 'pg'

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL
const DATABASE_URL = process.env.DATABASE_URL

if (!FRONTEND_BASE_URL) throw new Error('FRONTEND_BASE_URL env var is required')
if (!DATABASE_URL) throw new Error('DATABASE_URL env var is required')

const email = `e2e-monitor-${Date.now()}@example.com`
const password = 'Monitor123456!'
const NAV_TIMEOUT_MS = 30000
const URL_WAIT_TIMEOUT_MS = 15000

// Mirrors app/core/security.py's hash_secret: sha256 hex digest, no salt --
// deliberately reversible over this small keyspace (see that function's own
// docstring for why it isn't bcrypt).
function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

// The code is only ever a zero-padded 6-digit string (see
// generate_verification_code in security.py), so the full space is 10^6 --
// a few hundred thousand sha256 ops/sec makes this effectively instant.
function crackVerificationCode(codeHash) {
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0')
    if (sha256Hex(candidate) === codeHash) return candidate
  }
  throw new Error(`Could not crack verification code for hash ${codeHash}`)
}

async function fetchVerificationCode() {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    const { rows } = await client.query(
      `SELECT evc.code_hash
       FROM email_verification_codes evc
       JOIN users u ON u.id = evc.user_id
       WHERE u.email = $1`,
      [email]
    )
    if (rows.length === 0) {
      throw new Error(`No email_verification_codes row found for ${email}`)
    }
    return crackVerificationCode(rows[0].code_hash)
  } finally {
    await client.end().catch(() => {})
  }
}

async function cleanupUser() {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    // This flow creates a `users` row plus one `email_verification_codes`
    // row (register + verify + login + viewing Dashboard, no profile form
    // submission) -- the latter cascades on delete (ON DELETE CASCADE on
    // email_verification_codes.user_id), so deleting the user is enough.
    const result = await client.query('DELETE FROM users WHERE email = $1', [email])
    console.log(`Cleanup: deleted ${result.rowCount} user row(s) for ${email}`)
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  let browser
  let failure = null

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    // --- Step 1: register the throwaway account ---
    const registerPage = await browser.newPage()
    await registerPage.goto(`${FRONTEND_BASE_URL}/register`, {
      waitUntil: 'networkidle0',
      timeout: NAV_TIMEOUT_MS,
    })
    await registerPage.type('input[type="text"]', 'E2E Monitor')
    await registerPage.type('input[type="email"]', email)
    await registerPage.type('input[type="password"]', password)
    await registerPage.click('input[type="checkbox"]')
    await registerPage.click('button[type="submit"]')
    await registerPage.waitForFunction(
      () => location.pathname.includes('/verify-email'),
      { timeout: URL_WAIT_TIMEOUT_MS }
    )

    // --- Step 2: read the real code back out of the DB and complete verification ---
    const code = await fetchVerificationCode()
    await registerPage.type('input[type="text"]', code)
    await registerPage.click('button[type="submit"]')
    await registerPage.waitForFunction(
      () => location.pathname.includes('/dashboard'),
      { timeout: URL_WAIT_TIMEOUT_MS }
    )
    await registerPage.close()

    // --- Step 3: fresh context, explicit login (exercises POST /auth/login
    // for real, not just the verify-email flow's auto-issued token) ---
    const context = await browser.createBrowserContext()
    const page = await context.newPage()

    const authMeStatuses = []
    page.on('response', (res) => {
      if (res.url().includes('/api/v1/auth/me')) authMeStatuses.push(res.status())
    })

    await page.goto(`${FRONTEND_BASE_URL}/login`, {
      waitUntil: 'networkidle0',
      timeout: NAV_TIMEOUT_MS,
    })
    await page.type('input[type="email"]', email)
    await page.type('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForFunction(
      () => location.pathname.includes('/dashboard'),
      { timeout: URL_WAIT_TIMEOUT_MS }
    )

    // Give the Dashboard/Layout mount a moment to fire its auth/me call if it
    // hasn't landed yet (it may have already, since we registered the
    // listener before navigating).
    if (authMeStatuses.length === 0) {
      await new Promise((r) => setTimeout(r, 2000))
    }

    if (!page.url().includes('/dashboard')) {
      throw new Error(`Expected to land on /dashboard after login, got ${page.url()}`)
    }
    if (!authMeStatuses.includes(200)) {
      throw new Error(
        `GET /api/v1/auth/me did not return 200 (observed statuses: ${JSON.stringify(authMeStatuses)})`
      )
    }

    await context.close()
    console.log(`OK: ${FRONTEND_BASE_URL} -- register, verify-email, login, /dashboard, and GET /auth/me (200) all succeeded`)
  } catch (err) {
    failure = err
    console.error(`FAIL: ${FRONTEND_BASE_URL} --`, err.message)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  try {
    await cleanupUser()
  } catch (cleanupErr) {
    console.error(`FAIL: cleanup of ${email} against ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} --`, cleanupErr.message)
    failure = failure ?? cleanupErr
  }

  if (failure) {
    process.exit(1)
  }
}

main()
