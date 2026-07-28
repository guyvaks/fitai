import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT ? Number(process.env.PORT) : 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    // Playwright specs live under e2e/ with their own runner (npm run
    // test:e2e) -- excluded here so `npm test` never tries to execute them.
    exclude: ['**/node_modules/**', 'e2e/**'],
    // No unit tests exist yet (this round only added the one E2E regression
    // test, deliberately -- see e2e/priority1-approve-plan.spec.js). Without
    // this, `npm test` exits 1 on a clean checkout before anyone's written
    // a single .test.jsx file.
    passWithNoTests: true,
  },
})
