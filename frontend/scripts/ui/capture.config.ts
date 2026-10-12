import { defineConfig, devices } from '@playwright/test';

/**
 * Capturas de la renovación visual (F0-1 en adelante). Corre contra el stack aislado:
 *   node scripts/test-e2e.mjs --config=scripts/ui/capture.config.ts
 * La carpeta de salida llega por SIEP_UI_BASELINE_DIR (por defecto `.superpowers/baseline-ui/<fecha>`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'capture-baseline.e2e.ts',
  timeout: 20 * 60_000,
  workers: 1,
  outputDir: process.env.E2E_ARTIFACTS_DIR ?? '../../test-results/ui-capture',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    reducedMotion: 'reduce',
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
