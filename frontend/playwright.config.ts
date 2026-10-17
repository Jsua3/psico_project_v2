import { defineConfig, devices } from '@playwright/test';

import { scaled } from './e2e/support/time-scale';

/**
 * Suite E2E de SIEP. Corre contra el stack AISLADO que levanta
 * `npm run test:e2e` (scripts/test-e2e.mjs): BD desechable + Django de test +
 * ng serve propio; URL/credenciales llegan por entorno (E2E_BASE_URL,
 * E2E_STUDENT_EMAIL/PASSWORD). Named *.e2e.ts so the Jest unit runner (which
 * matches *.spec.ts) never tries to execute it.
 *
 * workers: 1 — los flujos comparten estudiante/intento sembrados; en paralelo
 * los prompts de reanudación/consentimiento se pisarían entre tests.
 *
 * Plazos escalados con E2E_TIME_SCALE (e2e/support/time-scale.ts): 1 en
 * local, más en runners lentos.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: scaled(45_000),
  expect: { timeout: scaled(5_000) },
  forbidOnly: !!process.env.CI,
  workers: 1,
  // Artefactos (screenshots/traces) fuera del árbol versionado (gitignored).
  outputDir: process.env.E2E_ARTIFACTS_DIR ?? './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Equipos con un Chromium ya instalado (sin `playwright install`, p. ej.
      // un contenedor de desarrollo): E2E_CHROMIUM_PATH apunta al ejecutable y
      // E2E_CHROMIUM_ARGS (separados por espacio) a sus banderas, p. ej. el
      // WebGL por software. Sin ellas se usa el Chromium que descarga Playwright.
      launchOptions: {
        executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
        args: process.env.E2E_CHROMIUM_ARGS?.split(/\s+/).filter(Boolean),
      },
    },
  }],
});
