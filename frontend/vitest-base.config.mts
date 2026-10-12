import { defineConfig } from 'vitest/config';

/**
 * Configuración que `@angular/build:unit-test` funde con la suya (`runnerConfig: true` en angular.json).
 * TOO-1: `vmThreads` reutiliza los hilos y la carga de módulos entre archivos y aísla cada archivo en su
 * propio contexto de VM (con su propio jsdom); no usar `isolate: false`. Con `threads` la suite pasaba ~2/3
 * del tiempo levantando un entorno nuevo por archivo (57,7 s → ~21 s).
 */
export default defineConfig({
  test: {
    pool: 'vmThreads',
  },
});
