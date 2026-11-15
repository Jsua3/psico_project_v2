import { defineConfig } from '@playwright/test';

import base from '../playwright.config';

/**
 * Capturas del juego real con la interfaz de diálogo nueva (bloque I1). Usa la configuración de la suite e2e (Chromium,
 * plazos y artefactos) y solo cambia dónde están las pruebas. Se corre con la pila aislada del corredor:
 *   SIEP_TEST_DB_PORT=5664 SIEP_E2E_API_PORT=8184 SIEP_E2E_WEB_PORT=4384 node scripts/test-e2e.mjs --config=frontend/captura-i1/playwright.config.ts
 * No es parte de la CI: deja imágenes, no comprueba nada que no compruebe ya `explorar-y-reaccion.e2e.ts`.
 */
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '*.captura.ts',
  testIgnore: undefined,
});
