import { defineConfig, devices } from '@playwright/test';

import { scaled } from './e2e/support/time-scale';

/**
 * Configuración de la SONDA de CSP (plan 03, S2-3b y S2-4): solo `e2e/csp-probe.e2e.ts`. La lanza `npm run test:csp`
 * (scripts/test-csp-probe.mjs) contra el build de producción servido por Django; `playwright.config.ts` (el e2e normal)
 * excluye ese archivo para no cambiar ni lo que corre ni cuánto tarda.
 *
 * Variables que exporta el orquestador: CSP_PROBE_BASE_URL (el Django de la sonda), CSP_PROBE_MODE, CSP_PROBE_SERVER_LOG y
 * CSP_PROBE_FINDINGS (ver e2e/support/csp-probe-runtime.ts), más las del e2e normal (E2E_CHROMIUM_PATH, E2E_CHROMIUM_ARGS,
 * E2E_TIME_SCALE, E2E_STUDENT_*).
 *
 * workers: 1 — los flujos comparten el estudiante sembrado y el registro del servidor, y la sonda lee ese registro por tramos.
 */
const baseURL = process.env['CSP_PROBE_BASE_URL'];
if (!baseURL) {
  throw new Error('Falta CSP_PROBE_BASE_URL: la sonda se lanza con `npm run test:csp`, no con `playwright test`.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/csp-probe.e2e.ts',
  timeout: scaled(60_000),
  expect: { timeout: scaled(8_000) },
  forbidOnly: !!process.env['CI'],
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Artefactos (capturas y trazas) fuera del árbol versionado (gitignored).
  outputDir: process.env['E2E_ARTIFACTS_DIR'] ?? './test-results/csp-probe',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Como en playwright.config.ts: un Chromium ya instalado (E2E_CHROMIUM_PATH) y sus banderas (E2E_CHROMIUM_ARGS).
      launchOptions: {
        executablePath: process.env['E2E_CHROMIUM_PATH'] || undefined,
        args: process.env['E2E_CHROMIUM_ARGS']?.split(/\s+/).filter(Boolean),
      },
    },
  }],
});
