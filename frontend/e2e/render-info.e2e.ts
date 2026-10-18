import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { enterWorld } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Con qué se dibuja el juego de verdad (PHA-5, E5-8): `Phaser.AUTO` prefiere WebGL y cae a Canvas 2D si no puede. La
 * escena (vidrio, viñeta, escalado a píxeles enteros) está pensada y medida para WebGL; si un equipo o un runner cae a
 * Canvas 2D, el juego sigue funcionando pero va con otro costo y otro aspecto, y nadie lo notaba. Esta prueba MIDE el
 * renderizador del lienzo real del mundo, lo adjunta al informe (renderizador y nombre de la GPU, que en un runner sin
 * GPU es el del renderizador por software) y falla si no es WebGL.
 */
interface RenderInfo {
  readonly renderer: 'WebGL' | 'Canvas 2D' | 'desconocido';
  readonly gpu: string | null;
  readonly vendor: string | null;
}

/** Pregunta al lienzo del mundo qué contexto tiene: un lienzo con contexto WebGL contesta `webgl2`/`webgl`, uno 2D no. */
async function readRenderInfo(page: Page): Promise<RenderInfo> {
  return page.evaluate((): RenderInfo => {
    const canvas = document.querySelector<HTMLCanvasElement>('app-game-world canvas');
    if (!canvas) return { renderer: 'desconocido', gpu: null, vendor: null };
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: 'WebGL',
        gpu: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
        vendor: String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      };
    }
    return { renderer: canvas.getContext('2d') ? 'Canvas 2D' : 'desconocido', gpu: null, vendor: null };
  });
}

test.use({ viewport: { width: 1366, height: 768 } });

test('@render-info el juego se dibuja con WebGL y el informe dice con qué GPU', async ({ page }, testInfo) => {
  test.setTimeout(scaled(180_000));
  await enterWorld(page);

  const info = await readRenderInfo(page);

  await testInfo.attach('render-info.json', { body: JSON.stringify(info, null, 2), contentType: 'application/json' });
  testInfo.annotations.push({ type: 'renderizador', description: `${info.renderer} · ${info.gpu ?? 'sin GPU'}` });
  expect(info.renderer, `El juego se dibujó con ${info.renderer} (${info.gpu ?? 'sin GPU'}): se esperaba WebGL`).toBe('WebGL');
  expect(info.gpu, 'WebGL debe decir con qué GPU (o renderizador por software) se dibuja').toBeTruthy();
});
