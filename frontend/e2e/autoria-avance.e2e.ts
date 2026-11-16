import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { sinInfraccionesGraves } from './support/autoria-flujo';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * La pantalla de avance de la generación con IA (Tarea 11c), con la docente del seed y el servidor real para todo lo demás. Las
 * rutas de la generación (`/api/authoring/generations/**`, del bloque C1) se responden aquí con `page.route`: cada prueba sirve
 * una generación de mentira en el estado que quiere mirar, y una petición de etapa que «se cuelga» deja la parte en curso.
 *
 * En cada estado: Axe (WCAG 2.2 AA) sin infracciones serias ni críticas a 1366 y a 390, sin desplazamiento horizontal a 1366 ×
 * 768, 1920 × 1080 y 390 de ancho, y botones de 44 px de alto como mínimo. Con `SIEP_CAPTURAS_AVANCE=<carpeta>` guarda además una
 * captura de página entera por estado y tamaño (`<estado>-<ancho>.png`), para mirarlas.
 */
const ID = '6f1d3c2a-8b7e-4f7a-9c1d-2e3f4a5b6c7d';
const RUTA = `/portal/casos/nuevo/generando/${ID}`;
const CAPTURAS = process.env['SIEP_CAPTURAS_AVANCE'];
const TAMANOS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
] as const;

// Títulos largos a propósito: la pantalla no debe desbordarse ni saltar con ellos.
const TITULO_CASO = 'Acompañar a una estudiante que llega a Bienestar Universitario después de una noche difícil en casa';
const ESCENAS = [
  { clave: 'recepcion', titulo: 'Recepción de Bienestar', final: false },
  { clave: 'consulta', titulo: 'Primera escucha en el consultorio de atención psicológica', final: false },
  { clave: 'orientacion', titulo: 'Orientación sobre la ruta de atención', final: false },
  { clave: 'cierre', titulo: 'Cierre y acuerdos de seguimiento', final: true },
];
const MALFORMADA = 'La IA respondió algo que no pudimos usar. Vuelve a intentarlo.';
const SIN_INTENTOS = 'Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo.';

type Estado = 'pending' | 'running' | 'done' | 'error';
type Generacion = Record<string, unknown>;

/** Una generación con la forma del contrato de C1; `estados` da el de cada escena (sin él, todavía no hay esqueleto). */
function generacion(cambios: Generacion & { estados?: Estado[] } = {}): Generacion {
  const { estados, ...resto } = cambios;
  const conEsqueleto = !!estados;
  return {
    id: ID, lugarId: 'universidad', descripcion: 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.',
    status: conEsqueleto ? 'skeleton_ready' : 'created',
    skeleton: conEsqueleto ? { titulo: TITULO_CASO, escenas: ESCENAS } : null,
    scenes: conEsqueleto ? ESCENAS.map((e, i) => ({ clave: e.clave, titulo: e.titulo, state: estados[i], error: null })) : [],
    repairRounds: 0, repair: null, lastError: null, caseVersionId: null, issues: [], callsUsed: 1, callsLimit: 20,
    createdAt: '2026-11-20T15:00:00Z', updatedAt: '2026-11-20T15:01:00Z',
    ...resto,
  };
}

/**
 * Responde las rutas de la generación: la lectura devuelve `lectura` (y `trasEtapa`, si se da, después de la primera etapa
 * pedida, como el servidor que guardó el fallo); una etapa pedida (POST) se queda colgada (la parte sigue en curso) o responde
 * `etapa`; cancelar responde la generación cancelada.
 */
async function simular(page: Page, lectura: Generacion, etapa?: { estado: number; cuerpo: Generacion }, trasEtapa?: Generacion): Promise<void> {
  let pedida = false;
  await page.route('**/api/authoring/generations/**', async (route) => {
    const peticion = route.request();
    const ruta = new URL(peticion.url()).pathname;
    if (peticion.method() === 'GET' && ruta.endsWith(`/generations/${ID}`)) {
      await route.fulfill({ json: { success: true, data: pedida && trasEtapa ? trasEtapa : lectura } });
    } else if (peticion.method() === 'POST') {
      pedida = true;
      if (etapa) await route.fulfill({ status: etapa.estado, json: etapa.cuerpo });
      // Sin `etapa`, la petición no se responde: así se ve una parte que se está escribiendo.
    } else if (peticion.method() === 'DELETE') {
      await route.fulfill({ json: { success: true, data: { ...lectura, status: 'cancelled' } } });
    } else {
      await route.fulfill({ status: 404, json: { success: false, code: 'NOT_FOUND', message: 'La generación no existe.' } });
    }
  });
}

/** Espera a que las fuentes carguen y terminen las animaciones finitas (el indicador de actividad es infinito y no cuenta). */
async function quieta(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finitas = document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.allSettled(finitas.map((a) => a.finished));
  });
  await page.waitForTimeout(150);
}

/**
 * Lo que vale para cada estado: Axe a 1366 y a 390, sin desplazamiento horizontal en los tres tamaños, botones de 44 px o más,
 * y la captura de cada tamaño si se pidió.
 */
async function revisarEstado(page: Page, estado: string): Promise<void> {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  for (const tamano of TAMANOS) {
    await page.setViewportSize(tamano);
    await quieta(page);
    if (tamano.width !== 1920) await sinInfraccionesGraves(page, `avance «${estado}» a ${tamano.width}`);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde, `avance «${estado}»: desplazamiento horizontal a ${tamano.width}`).toBeLessThanOrEqual(1);
    const bajos = await page.locator('.avance').evaluate((raiz) => [...raiz.querySelectorAll<HTMLElement>('button, a.boton')]
      .filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent?.trim()));
    expect(bajos, `avance «${estado}»: botones de menos de 44 px a ${tamano.width}`).toEqual([]);
    if (CAPTURAS) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(CAPTURAS, `${estado}-${tamano.width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize(TAMANOS[0]);
}

test.describe('@autoria la pantalla de avance de la generación con IA', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await page.setViewportSize(TAMANOS[0]);
    await loginAs(page, 'profesor');
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('esqueleto en curso: dice cuánto lleva y qué esperar; la barra no inventa un total', async ({ page }) => {
    await page.clock.install();
    await simular(page, generacion());
    await page.goto(RUTA);
    await expect(page.locator('.avance').getByRole('status')).toHaveText('Armando el esqueleto del caso', { timeout: scaled(30_000) });
    await expect(page.locator('li.parte[data-parte="esqueleto"]')).toContainText('Acaba de empezar · puede tardar un par de minutos');

    await page.clock.fastForward(40_000);
    await expect(page.locator('li.parte[data-parte="esqueleto"]')).toContainText(/Lleva 4\d s · puede tardar un par de minutos/);
    // El contador no se anuncia: la región viva sigue diciendo solo la etapa.
    await expect(page.locator('.avance').getByRole('status')).toHaveText('Armando el esqueleto del caso');
    const barra = page.getByRole('progressbar', { name: 'Partes hechas de tu caso' });
    await expect(barra).not.toHaveAttribute('aria-valuenow', /.*/);
    await expect(barra).toHaveAttribute('aria-valuetext', 'Armando el esqueleto: todavía no sabemos cuántas partes tendrá el caso');
    await revisarEstado(page, 'esqueleto');
  });

  test('escenas en curso: las dos del lote se escriben a la vez, con el tiempo y los intentos con la IA', async ({ page }) => {
    await page.clock.install();
    await simular(page, generacion({ estados: ['done', 'pending', 'pending', 'pending'], callsUsed: 15 }));
    await page.goto(RUTA);
    const ahora = 'Escribiendo las escenas 2 y 3 de 4';
    await expect(page.locator('.avance').getByRole('status')).toHaveText(ahora, { timeout: scaled(30_000) });
    await page.clock.fastForward(40_000);
    for (const clave of ['consulta', 'orientacion']) {
      await expect(page.locator(`li.parte[data-parte="escena-${clave}"]`)).toContainText(/Escribiéndose.*Lleva 4\d s · puede tardar un par de minutos/s);
    }
    await expect(page.locator('li.parte[data-parte="escena-recepcion"]')).toContainText(/✓.*Hecha/s);
    await expect(page.locator('li.parte[data-parte="escena-cierre"]')).toContainText(/Final.*Pendiente/s);
    await expect(page.getByText('2 de 6 partes hechas')).toBeVisible();
    await expect(page.getByText('Usaste 15 de 20 intentos con la IA.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Partes hechas de tu caso' })).toHaveAttribute('aria-valuetext', '2 de 6 partes hechas');

    // El indicador de actividad se mueve; con movimiento reducido queda quieto y queda el texto.
    const animados = () => page.locator('li.parte .simbolo .punto').evaluateAll((puntos) => puntos.filter((p) => p.getAnimations().length > 0).length);
    expect(await animados()).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(animados).toBe(0);
    await expect(page.locator('li.parte[data-parte="escena-consulta"]')).toContainText(/Lleva \d+ s/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await revisarEstado(page, 'en-curso');
  });

  test('error: el mensaje va junto a la parte que falló, con «Reintentar esta parte» antes que cancelar', async ({ page }) => {
    // Las dos escenas del lote fallan (y el reintento automático también); al releer, el servidor las muestra con su error.
    const error = { kind: 'malformed', message: MALFORMADA };
    await simular(page, generacion({ estados: ['done', 'pending', 'pending', 'pending'], callsUsed: 6 }), {
      estado: 502, cuerpo: { success: false, code: 'AI_PROVIDER_ERROR', kind: 'malformed', message: MALFORMADA },
    }, generacion({
      estados: ['done', 'error', 'error', 'pending'], callsUsed: 10,
      scenes: ESCENAS.map((e, i) => ({
        clave: e.clave, titulo: e.titulo, state: ['done', 'error', 'error', 'pending'][i], error: i === 1 || i === 2 ? { ...error } : null,
      })),
      lastError: { stage: 'scene', clave: 'orientacion', kind: 'malformed', message: MALFORMADA },
    }));
    await page.goto(RUTA);
    const fila = page.locator('li.parte[data-parte="escena-consulta"]');
    await expect(fila.getByRole('alert')).toHaveText(MALFORMADA, { timeout: scaled(30_000) });
    await expect(fila).toContainText(/!.*Con error/s);
    await expect(page.locator('.avance').getByRole('alert')).toHaveCount(1);
    await expect(page.getByText('Se detuvo en «Escena 2 de 4: Primera escucha en el consultorio de atención psicológica».')).toBeVisible();
    await expect(page.locator('li.parte[data-parte="escena-orientacion"]')).toContainText(`${MALFORMADA} Se vuelve a pedir con «Reintentar esta parte».`);
    // Orden de foco: reintentar la parte va antes que cancelar todo.
    const reintentar = fila.getByRole('button', { name: 'Reintentar esta parte' });
    const cancelar = page.getByRole('button', { name: 'Cancelar y empezar de nuevo' });
    const antes = await reintentar.evaluate((a, b) => !!(a.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await cancelar.elementHandle());
    expect(antes).toBe(true);
    await revisarEstado(page, 'error');
  });

  test('sin intentos: «Empezar un caso nuevo» junto a la parte, sin reintentar', async ({ page }) => {
    await simular(page, generacion({ estados: ['done', 'done', 'pending', 'pending'], callsUsed: 20 }), {
      estado: 429, cuerpo: { success: false, code: 'GENERATION_CALLS_EXHAUSTED', message: SIN_INTENTOS },
    });
    await page.goto(RUTA);
    await expect(page.locator('.avance').getByRole('alert')).toHaveText(SIN_INTENTOS, { timeout: scaled(30_000) });
    await expect(page.getByRole('button', { name: 'Empezar un caso nuevo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar esta parte' })).toHaveCount(0);
    await expect(page.getByText('Usaste 20 de 20 intentos con la IA.')).toBeVisible();
    await revisarEstado(page, 'sin-intentos');
  });

  test('reparación: una parte propia con la ronda, las escenas y lo que encontró la revisión', async ({ page }) => {
    await page.clock.install();
    await simular(page, generacion({
      estados: ['done', 'pending', 'done', 'done'], status: 'needs_repair', repairRounds: 1, callsUsed: 7,
      repair: {
        round: 1, scenes: ['consulta'],
        issues: { consulta: [
          { code: 'DSL.OCL-09', severity: 'error', message: 'Una respuesta no tiene reacción.' },
          { code: 'DSL.OCL-09', severity: 'error', message: 'Una respuesta no tiene reacción.' },
          { code: 'DSL.OCL-10', severity: 'error', message: 'Un comentario usa una emoción que el caso no conoce.' },
        ] },
      },
    }));
    await page.goto(RUTA);
    await expect(page.locator('.avance').getByRole('status')).toHaveText('Corrigiendo 1 escena (ronda 1 de 2)', { timeout: scaled(30_000) });
    await page.clock.fastForward(25_000);
    const fila = page.locator('li.parte[data-parte="reparacion-1"]');
    await expect(fila).toContainText(/Corrección de 1 escena \(ronda 1 de 2\).*Corrigiéndose/s);
    await expect(fila).toContainText('Una respuesta no tiene reacción. (2 veces)');
    await expect(page.locator('.avance')).not.toContainText('DSL.');
    await expect(page.locator('li.parte[data-parte="reglas"]')).toContainText(/○.*Pendiente/s);
    await revisarEstado(page, 'reparacion');
  });

  test('listo: el título enfocado, lo que queda por resolver y «Abrir mi caso», sin navegar solo', async ({ page }) => {
    await simular(page, generacion({
      estados: ['done', 'done', 'done', 'done'], status: 'imported', caseVersionId: 987654, callsUsed: 9, repairRounds: 1,
      issues: [
        { code: 'DSL.OCL-11', severity: 'error', message: 'Un comentario de «Orientación sobre la ruta de atención» no dice cuándo aparece.' },
        { code: 'DSL.OCL-12', severity: 'error', message: 'Una pista de «Recepción de Bienestar» repite el objetivo de la escena.' },
      ],
    }));
    await page.goto(RUTA);
    const h1 = page.getByRole('heading', { level: 1, name: 'Tu caso está listo como borrador' });
    await expect(h1).toBeFocused({ timeout: scaled(30_000) });
    await expect(page.getByText('Quedan 2 cosas por resolver en el editor.')).toBeVisible();
    await expect(page.locator('li.parte[data-parte="reglas"]')).toContainText('2 cosas por resolver en el editor:');
    await expect(page.locator('.avance')).not.toContainText('DSL.');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Abrir mi caso' })).toBeFocused();
    await page.waitForTimeout(2100);
    await expect(page).toHaveURL(new RegExp(`/generando/${ID}$`));
    await revisarEstado(page, 'listo');
  });

  test('fallo: el título enfocado, las faltas en palabras junto a la revisión y «Empezar de nuevo»', async ({ page }) => {
    await simular(page, generacion({
      estados: ['done', 'done', 'done', 'done'], status: 'failed', callsUsed: 12, repairRounds: 2,
      issues: [
        { code: 'DSL.FORMA', severity: 'error', message: 'El documento no tiene la forma esperada.' },
        { code: 'DSL.SIEP_SALA', severity: 'error', message: 'La escena «Cierre y acuerdos de seguimiento» usa una sala que el lugar no tiene.' },
      ],
    }));
    await page.goto(RUTA);
    await expect(page.getByRole('heading', { level: 1, name: 'No pudimos armar un caso que se pueda abrir' })).toBeFocused({ timeout: scaled(30_000) });
    const reglas = page.locator('li.parte[data-parte="reglas"]');
    await expect(reglas).toContainText(/!.*Con error.*Estas faltas impidieron abrir el caso:/s);
    await expect(reglas).toContainText('El documento no tiene la forma esperada.');
    await expect(page.locator('.avance')).not.toContainText('DSL.');
    await expect(page.getByRole('button', { name: 'Empezar de nuevo' })).toBeVisible();
    await revisarEstado(page, 'fallo');
  });
});
