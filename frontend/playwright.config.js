import { defineConfig, devices } from '@playwright/test'

// Local/dev E2E only (see e2e/README.md) -- not wired into CI. Needs a real
// backend + frontend already running; this config does not start them, since
// the backend here talks to a real DB (staging, via backend/.env.local) and
// spinning that up automatically is out of scope for a test runner.
export default defineConfig({
  testDir: './e2e',
  // Generous: beforeAll drives a real CrewAI generation (~30-90s) plus
  // register/profile/approve API round-trips before the test body even
  // starts, all counted against this same per-test timeout.
  timeout: 240_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
