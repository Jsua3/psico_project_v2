import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from '@playwright/test';

// En Windows el Chromium que pide Playwright puede no estar; se usa el que haya en caché
// (ver la memoria del proyecto «Trampas de e2e en Windows») o el de E2E_CHROMIUM_PATH.
const enCache = path.join(process.env['LOCALAPPDATA'] ?? '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
const ejecutable = process.env['E2E_CHROMIUM_PATH'] ?? (existsSync(enCache) ? enCache : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4310',
    viewport: { width: 1366, height: 768 },
    locale: 'es-CO',
    launchOptions: ejecutable ? { executablePath: ejecutable } : {},
  },
  webServer: [
    {
      // Servidor de IA sin key: las pruebas corren en modo sin conexión.
      command: 'node servidor/ia.mjs',
      url: 'http://localhost:4311/api/ia/estado',
      reuseExistingServer: true,
      env: { ANTHROPIC_API_KEY: '', PUERTO_IA: '4311' },
    },
    {
      command: 'npm start',
      url: 'http://localhost:4310',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
