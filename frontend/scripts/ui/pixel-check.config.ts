import { defineConfig, devices } from '@playwright/test';

/**
 * Instantáneas nativas del mundo para revisar la nitidez (F0-7, F0-8). Corre contra el stack aislado:
 *   node scripts/test-e2e.mjs --config=scripts/ui/pixel-check.config.ts
 * La carpeta de salida llega por SIEP_UI_BASELINE_DIR (por defecto `.superpowers/baseline-ui/<fecha>`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'pixel-check.e2e.ts',
  timeout: 10 * 60_000,
  workers: 1,
  outputDir: process.env.E2E_ARTIFACTS_DIR ?? '../../test-results/ui-pixel',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
        args: process.env.E2E_CHROMIUM_ARGS?.split(/\s+/).filter(Boolean),
      },
    },
  }],
});
