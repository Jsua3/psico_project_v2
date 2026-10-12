import { defineConfig } from 'vitest/config';

/**
 * Configuración que `@angular/build:unit-test` funde con la suya (`runnerConfig: true` en angular.json).
 * TOO-1: `vmThreads` crea el entorno jsdom una vez por hilo y aísla cada archivo en su propio contexto de VM
 * (sigue habiendo aislamiento por archivo; no usar `isolate: false`). Con `threads` la suite pasaba ~2/3
 * del tiempo creando jsdom 183 veces.
 */
export default defineConfig({
  test: {
    pool: 'vmThreads',
  },
});
