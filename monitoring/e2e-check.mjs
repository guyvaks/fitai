// Scheduled E2E health check for one FitAI environment (staging or production).
// Flow: register a throwaway account -> open a FRESH browser context and log in
// with it for real (not just reuse register's auto-issued token) -> confirm we
// land on /dashboard -> confirm the real browser-driven GET /api/v1/auth/me
// (fired by useAuth on mount) actually returns 200. Cleans up the throwaway
// user afterward no matter what happens.
//
// Required env vars:
//   FRONTEND_BASE_URL  e.g. https://fitai-frontend-staging.up.railway.app
//   DATABASE_URL       Postgres connection string for that same environment
//
// Exit code 0 = healthy, 1 = something failed (register/login/navigation/API,
// or cleanup itself) -- GitHub Actions turns a non-zero exit into a failed
// step/job, which triggers its default failure-notification email.

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

async function cleanupUser() {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  try {
    await client.connect()
    // This flow only ever creates a `users` row (register + login + viewing
    // Dashboard, no profile form submission) -- no dependent rows, no cascade
    // needed. If the flow's scope ever grows, revisit this.
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
    await registerPage.click('button[type="submit"]')
    await registerPage.waitForFunction(
      () => location.pathname.includes('/dashboard'),
      { timeout: URL_WAIT_TIMEOUT_MS }
    )
    await registerPage.close()

    // --- Step 2: fresh context, explicit login (exercises POST /auth/login
    // for real, not just the register flow's auto-issued token) ---
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
    console.log(`OK: ${FRONTEND_BASE_URL} -- register, login, /dashboard, and GET /auth/me (200) all succeeded`)
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
