import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Editor de casos (P6, tarea 7): accesibilidad de cada ruta de autoría contra el servidor REAL, con una docente del seed.
 * Se crea un caso desde la universidad y se recorren las pantallas —lugar, salas, mapa del caso, una sala, el guion de una
 * escena, los finales, probar y la revisión— con Axe (WCAG 2.2 AA, sin infracciones serias ni críticas) y se comprueba que
 * no haya desplazamiento horizontal a 1366 y a 1280. Además: la barra de vidrio del editor (una sola, con la ayuda a mano) en
 * su estado desplazado, y el buscador abierto.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ANCHOS = [{ width: 1366, height: 768 }, { width: 1280, height: 720 }] as const;

/** Espera a que terminen las animaciones FINITAS (Axe mide el contraste a media transición y se equivoca). */
async function asentar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: scaled(15_000) }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finitas = document.getAnimations().filter((animacion) => {
      const fin = animacion.effect?.getComputedTiming().endTime;
      return typeof fin === 'number' && Number.isFinite(fin);
    });
    await Promise.race([Promise.allSettled(finitas.map((a) => a.finished)), new Promise((r) => setTimeout(r, 3000))]);
  });
  await page.waitForTimeout(250);
}

async function infraccionesGraves(page: Page): Promise<string[]> {
  const resultados = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations', 'passes'] });
  // Axe de verdad corrió sobre la pantalla (una corrida vacía no puede pasar por buena).
  expect(resultados.passes.length, 'Axe evaluó reglas sobre la pantalla').toBeGreaterThan(10);
  return resultados.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((nodo) => `[${v.impact}] ${v.id} · ${nodo.target.join(' ')} · ${nodo.failureSummary ?? ''}`.replace(/\s+/g, ' ')));
}

const desbordeHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** La pantalla pasa Axe y no se desplaza hacia los lados a 1366 y a 1280. */
async function revisar(page: Page, nombre: string): Promise<void> {
  await asentar(page);
  expect(await infraccionesGraves(page), `${nombre}: Axe`).toEqual([]);
  for (const tamano of ANCHOS) {
    await page.setViewportSize(tamano);
    await asentar(page);
    expect(await desbordeHorizontal(page), `${nombre}: desplazamiento horizontal a ${tamano.width}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize(ANCHOS[0]);
  await asentar(page);
}

test.describe('@autoria accesibilidad de cada ruta del editor de casos', () => {
  test('crear un caso desde la universidad y recorrer sus pantallas: sin infracciones serias ni críticas, sin desplazamiento horizontal', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await page.setViewportSize(ANCHOS[0]);
    await loginAs(page, 'profesor');

    // 1. Elegir el lugar.
    await page.goto('/portal/casos/nuevo');
    await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
    const elegirLugar = page.getByRole('link', { name: /^Elegir este lugar/ }).first();
    await expect(elegirLugar).toBeVisible({ timeout: scaled(30_000) });
    await revisar(page, 'casos/nuevo (lugar)');

    // Una sola barra en pantalla y con la ayuda a mano.
    await expect(page.locator('header.cromo')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Ayuda' }).getByRole('button')).toHaveText([/^\s*Buscar/, /^\s*Guía\s*$/, /^\s*Asistente de IA\s*$/]);

    // 2. Elegir las salas.
    await elegirLugar.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
    await revisar(page, 'casos/nuevo/salas (sin salas elegidas)');
    await page.getByRole('button', { name: /^Usar esta idea/ }).first().click();
    await page.getByLabel('Nombre del caso').fill(`Accesibilidad e2e ${Date.now()}`);
    await revisar(page, 'casos/nuevo/salas (con una idea elegida)');

    // 3. Crear el caso: el mapa del caso.
    await page.getByRole('button', { name: 'Crear el caso con estas salas' }).click();
    await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
    await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.locator('button.escena').first()).toBeVisible();
    await revisar(page, 'casos/:id/editor (mapa del caso)');

    // 4. El guion de una escena.
    await page.locator('button.escena').first().dblclick();
    await expect(page.getByRole('heading', { level: 1, name: 'Guion de la escena' })).toBeVisible({ timeout: scaled(30_000) });
    await revisar(page, 'casos/:id/editor/escena/:escena (guion)');

    // La barra se recoge al desplazarse y sigue siendo accesible; el buscador abierto congela su estado.
    const barra = page.locator('header.cromo');
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(barra).toHaveAttribute('data-estado', /scroll|atencion/);
    await asentar(page);
    expect(await infraccionesGraves(page), 'guion con la barra recogida: Axe').toEqual([]);
    await page.getByRole('button', { name: /^Buscar/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await asentar(page);
    expect(await infraccionesGraves(page), 'buscador abierto: Axe').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));

    // 5. Una sala (desde el guion de la escena).
    await page.getByRole('link', { name: 'Abrir sala' }).click();
    await expect(page.locator('.pieza').first()).toBeVisible({ timeout: scaled(30_000) });
    await revisar(page, 'casos/:id/editor/sala/:sala');
    // Atención en la lista «En esta sala»: señala la pieza; Esc la pliega.
    const opcion = page.getByRole('option').first();
    await opcion.hover();
    await expect(page.locator('.pieza.atendida')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pieza.atendida')).toHaveCount(0);

    // 6. Finales, probar y revisión, con las secciones de la banda de debajo de la barra.
    const secciones = page.getByRole('navigation', { name: 'Secciones del caso' });
    await secciones.getByRole('link', { name: 'Finales' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await revisar(page, 'casos/:id/editor/finales');

    await secciones.getByRole('link', { name: 'Probar como estudiante' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Probar como estudiante' })).toBeVisible({ timeout: scaled(30_000) });
    await revisar(page, 'casos/:id/editor/probar');

    await secciones.getByRole('link', { name: 'Enviar a revisión' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await revisar(page, 'casos/:id/editor/revision');
  });
});
