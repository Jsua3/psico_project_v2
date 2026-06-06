import { defineConfig, devices } from '@playwright/test';

/**
 * Best-effort smoke for the living world (B1). Runs against an already-running
 * dev stack (frontend on :4200 proxying /api to Django). Named *.e2e.ts so the
 * Jest unit runner (which matches *.spec.ts) never tries to execute it.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
