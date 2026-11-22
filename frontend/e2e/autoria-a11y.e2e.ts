import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  DESCRIPCION_BIENESTAR, GENERACION_CON_PROVEEDOR_FALSO, MOTIVO_SIN_PROVEEDOR_FALSO, abrirGuion, abrirMiCaso, asegurarGeneracionDisponible, cancelarGeneracionAbierta,
  elegirDescribirTuCaso, esperarCasoListo, generarConDescripcion, ponerFaltasDeOcl, irAlMapaDelCaso, retenerEscenas, rutaEditor,
} from './support/autoria-flujo';
import { PROFESOR, apiToken, retireCase } from './support/case-fixtures';
import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Editor de casos (P6, tarea 7): accesibilidad de cada ruta de autoría contra el servidor REAL, con una docente del seed.
 * Se crea un caso desde la universidad y se recorren las pantallas —lugar, salas, mapa del caso, una sala, el guion de una
 * escena, los finales y la revisión— con Axe (WCAG 2.2 AA, sin infracciones serias ni críticas) y se comprueba que
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

/** `incluir` limita Axe a una parte de la página (un selector). */
async function infraccionesGraves(page: Page, incluir?: string): Promise<string[]> {
  const resultados = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations', 'passes'], ...(incluir ? { include: incluir } : {}) });
  // Axe de verdad corrió sobre la pantalla (una corrida vacía no puede pasar por buena).
  expect(resultados.passes.length, 'Axe evaluó reglas sobre la pantalla').toBeGreaterThan(10);
  return resultados.violations
    // `label-content-name-mismatch` (2.5.3, experimental en Axe) marca los enlaces compuestos del hilo, del riel y de las
    // fichas de sala: su nombre accesible es una frase completa y el texto visible, una forma corta («1», «Datos»). Está
    // anotado como pendiente de decisión (DECISIONES.md, D-E7) y no se oculta en silencio: se lista aparte en el informe.
    .filter((v) => v.id !== 'label-content-name-mismatch')
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
  test('crear un caso desde la universidad y recorrer sus pantallas: sin infracciones serias ni críticas, sin desplazamiento horizontal', async ({ page, request }) => {
    test.setTimeout(scaled(240_000));
    let caseVersionId = 0;
    try {
      await page.setViewportSize(ANCHOS[0]);
      await loginAs(page, 'profesor');

      // 1. Elegir el lugar.
      await page.goto('/portal/casos/nuevo');
      await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
      const elegirLugar = page.getByRole('link', { name: /^Elegir este lugar/ }).first();
      await expect(elegirLugar).toBeVisible({ timeout: scaled(30_000) });
      await revisar(page, 'casos/nuevo (lugar)');

      // Una sola barra en pantalla y con la ayuda a mano: «Buscar» y «Guía» se fundieron en una sola «Ayuda» (E0); el
      // asistente de IA solo aparece con un caso abierto.
      await expect(page.locator('header.cromo')).toHaveCount(1);
      await expect(page.getByRole('group', { name: 'Ayuda' }).getByRole('button')).toHaveText([/^\s*Ayuda/]);

      // 2. Elegir las salas.
      await elegirLugar.click();
      await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
      await revisar(page, 'casos/nuevo/salas (sin salas elegidas)');
      await page.getByRole('button', { name: /^Usar esta idea/ }).first().click();
      await page.getByLabel('Nombre del caso').fill(`Accesibilidad e2e ${Date.now()}`);
      await revisar(page, 'casos/nuevo/salas (con una idea elegida)');

      // 3. Crear el caso: el mapa del caso.
      await page.getByRole('button', { name: 'Crear el caso con estas salas' }).click();
      // Un caso nuevo se abre en el guion de su primera escena (E3); se mide ahí y luego se pasa al mapa.
      await page.waitForURL(/\/portal\/casos\/\d+\/editor\/escena\//, { timeout: scaled(60_000) });
      caseVersionId = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);
      await expect(page.getByRole('heading', { level: 1, name: /^Guion de la escena/ })).toBeVisible({ timeout: scaled(30_000) });
      await revisar(page, 'casos/:id/editor/escena/:escena (guion recién creado)');
      await irAlMapaDelCaso(page);
      await expect(page.locator('button.escena').first()).toBeVisible();
      await revisar(page, 'casos/:id/editor (mapa del caso)');

      // 4. El guion de una escena.
      await page.locator('button.escena').first().dblclick();
      await expect(page.getByRole('heading', { level: 1, name: 'Guion de la escena' })).toBeVisible({ timeout: scaled(30_000) });
      await revisar(page, 'casos/:id/editor/escena/:escena (guion)');

      // El marco del editor es de alto fijo (E0): la página no se desplaza y la barra no se recoge; se mide la barra y el
      // buscador de la «Ayuda» abierto.
      expect(await infraccionesGraves(page, 'header.cromo'), 'la barra: Axe').toEqual([]);
      await page.getByRole('button', { name: /^Ayuda/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await asentar(page);
      expect(await infraccionesGraves(page, '[role="dialog"]'), 'buscador abierto: Axe').toEqual([]);
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

      // 6. Finales y revisión, con las secciones del caso, dentro de la barra («Probar» ya no es una pantalla: abre el ensayo en otra pestaña).
      const secciones = page.getByRole('navigation', { name: 'Secciones del caso' });
      // Finales ya no es un enlace de la barra: es una pestaña de la etapa Evaluación (E5), con su propia dirección.
      await secciones.getByRole('link', { name: 'Evaluación' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Pasos profesionales' })).toBeVisible();
      await revisar(page, 'casos/:id/editor/evaluacion');
      await page.getByRole('navigation', { name: 'Partes de la evaluación' }).getByRole('link', { name: /^Rúbrica/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Rúbrica del caso' })).toBeVisible();
      await revisar(page, 'casos/:id/editor/rubrica');
      await page.getByRole('navigation', { name: 'Partes de la evaluación' }).getByRole('link', { name: /^Finales/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Finales del caso' })).toBeVisible();
      await revisar(page, 'casos/:id/editor/finales');

      await secciones.getByRole('link', { name: 'Enviar a revisión' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await revisar(page, 'casos/:id/editor/revision');
    } finally {
      // El caso que la prueba creó no se queda en la lista de la docente (ni en la base compartida de las pruebas siguientes).
      if (caseVersionId) await retireCase(request, caseVersionId);
    }
  });

  // C2, tarea 12: lo nuevo del editor con el proveedor falso de C1 (el backend aislado con `AI_AUTHORING_PROVIDER=fake`).
  test('generar un caso con IA: el paso 2, el avance, el guion con las secciones nuevas y la revisión con faltas de OCL', async ({ page, request }) => {
    test.skip(!GENERACION_CON_PROVEEDOR_FALSO, MOTIVO_SIN_PROVEEDOR_FALSO);
    test.setTimeout(scaled(600_000));
    let caseVersionId = 0;
    try {
      await page.setViewportSize(ANCHOS[0]);
      await asegurarGeneracionDisponible(request);
      await cancelarGeneracionAbierta(request);
      await loginAs(page, 'profesor');

      // 1. El paso 2 con «Describe tu caso» elegido.
      await elegirDescribirTuCaso(page);
      await revisar(page, 'casos/nuevo/salas con «Describe tu caso»');

      // 2. El avance, a mitad (las rutas de escena retenidas) y al terminar.
      const puerta = await retenerEscenas(page);
      await generarConDescripcion(page, DESCRIPCION_BIENESTAR);
      await expect(page.locator('.avance').getByRole('status')).toHaveText('Escribiendo las escenas 1 y 2 de 4', { timeout: scaled(60_000) });
      await revisar(page, 'casos/nuevo/generando (a mitad)');
      await puerta.soltar();
      await esperarCasoListo(page);
      await revisar(page, 'casos/nuevo/generando (listo)');
      caseVersionId = await abrirMiCaso(page);

      // 3. El guion de la primera escena, con objetivo, pistas, «Aparece si…», «Cómo reacciona» y «Lo que dicen al acercarte».
      await abrirGuion(page, 1);
      await expect(page.getByRole('heading', { name: 'Lo que dicen al acercarte' })).toBeVisible({ timeout: scaled(30_000) });
      await expect(page.getByRole('group', { name: 'Aparece si…' }).first()).toBeVisible();
      await expect(page.getByRole('group', { name: 'Cómo reacciona' }).first()).toBeVisible();
      await revisar(page, 'casos/:id/editor/escena/:escena (guion con las secciones nuevas)');

      // 4. La revisión con faltas de OCL-09 a OCL-12 (las que el editor no deja escribir pero el servidor guarda).
      const docente = await apiToken(request, PROFESOR);
      await ponerFaltasDeOcl(request, docente, caseVersionId);
      await page.goto(rutaEditor(page, '/revision'));
      await expect(page.getByRole('heading', { name: /^Por resolver \([1-9]\d*\)$/ })).toBeVisible({ timeout: scaled(30_000) });
      await expect(page.getByRole('button', { name: /^Llévame ahí/ }).first()).toBeVisible();
      await revisar(page, 'casos/:id/editor/revision (con faltas de OCL)');
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await cancelarGeneracionAbierta(request);
      if (caseVersionId) await retireCase(request, caseVersionId);
    }
  });
});
