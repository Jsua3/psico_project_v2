import { defineConfig, devices } from '@playwright/test';

/**
 * Medición de cuadros por segundo del mundo (F9-3, RNF-05). Corre contra el stack aislado:
 *   SIEP_FPS_LABEL=F9-gpu node scripts/test-e2e.mjs --config=scripts/ui/fps-check.config.ts
 * Con GPU: E2E_CHROMIUM_ARGS='--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11 --enable-zero-copy'.
 * Sin GPU (SwiftShader): sin esa variable. La carpeta de salida llega por SIEP_UI_BASELINE_DIR
 * (por defecto `.superpowers/baseline-ui/<fecha>`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'fps-check.e2e.ts',
  timeout: 10 * 60_000,
  workers: 1,
  outputDir: process.env.E2E_ARTIFACTS_DIR ?? '../../test-results/ui-fps',
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
