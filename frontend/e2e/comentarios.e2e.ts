import { readFileSync } from 'fs';
import { join } from 'path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { recordSimulationResponses } from './support/no-numbers';
import { runAxe } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import { closeDialogue, createWorldInputDriver, enterWorld, interactNearby, primaryNearbyAction, reachNearby, waitForWorldReady } from './support/siep-flow';
import type { WorldInputDriver } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Los comentarios de los personajes al acercarse (bloque B, Tarea 22; criterio C8) contra la pila real, con lo que trae el
 * documento sembrado de SIM-VBG-001: la primera escena con un comentario sin `cuando` y otro con `cuando: {inspected: X}`
 * de la misma persona. Acercarse muestra la línea sin condición; revisar X, alejarse y volver muestra la condicionada; con
 * la conversación abierta no hay burbuja; y la condición nunca viaja al navegador. La burbuja se busca por su atributo
 * `data-comment`, no por su aspecto.
 */
const BLOCKING = new Set(['serious', 'critical']);
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const CONDITION_KEYS = new Set(['cuando', 'when', 'condition']);

type Comentario = { personaje: string; linea: string; cuando?: { inspected?: string } };
type EscenaDoc = { inicial?: boolean; comentarios?: Comentario[]; mapa: { objetos: Array<{ clave: string; etiqueta: string }> } };
const escenas = (JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-001.dsl.json'), 'utf-8',
)) as { 'x-siep': { escenas: EscenaDoc[] } })['x-siep'].escenas;

const CASO = (() => {
  for (const escena of escenas) {
    const lista = escena.comentarios ?? [];
    for (const libre of lista.filter(c => !c.cuando)) {
      const condicionado = lista.find(c => c.personaje === libre.personaje && c.cuando?.inspected);
      if (!condicionado) continue;
      const etiqueta = (clave: string) => escena.mapa.objetos.find(o => o.clave === clave)!.etiqueta;
      const revisar = condicionado.cuando!.inspected!;
      return {
        inicial: escena.inicial === true, personaje: libre.personaje, libre: libre.linea, condicionado: condicionado.linea,
        persona: etiqueta(libre.personaje), revisar, objeto: etiqueta(revisar),
      };
    }
  }
  throw new Error('El documento sembrado no trae una escena con un comentario sin condición y otro condicionado por `inspected`.');
})();
const rx = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/** Las rutas de las claves de condición que algún `comments` de la respuesta trae (no debe haber ninguna). */
function conditionKeysInComments(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => conditionKeysInComments(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (key === 'comments' && Array.isArray(child)) {
      return child.flatMap((c, i) => Object.keys((c ?? {}) as object)
        .filter(k => CONDITION_KEYS.has(k)).map(k => `${path}.comments[${i}].${k}`));
    }
    return conditionKeysInComments(child, `${path}.${key}`);
  });
}

/**
 * Llega junto a la persona hasta que sea lo MÁS cercano: la burbuja es de quien el mundo marca como cercano (la persona más
 * próxima), y la barra ofrece también a la segunda (la herramienta del paso, «También: …»). Se llega primero a la herramienta de
 * la sala, como en `guided-first-minute`, y de ahí se avanza en pasos cortos hasta que la acción principal nombra a la persona.
 */
async function acercarseA(page: Page, input: WorldInputDriver, heading: Parameters<WorldInputDriver['moveUntilNearby']>[0], persona: RegExp): Promise<void> {
  await reachNearby(page, input, heading, /kit pap/i);
  const principal = primaryNearbyAction(page).filter({ hasText: persona });
  for (let paso = 0; paso < 10 && (await principal.count()) === 0; paso += 1) await input.moveBy('ArrowLeft', 24);
  await expect(principal, `la acción principal es hablar con ${persona}`).toBeVisible();
}

async function expectNoSeriousAxeViolations(page: Page, state: string, include?: string): Promise<void> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  const blocking = results.violations.filter(violation => violation.impact != null && BLOCKING.has(violation.impact));
  const summary = blocking.map(violation =>
    `[${violation.impact}] ${violation.id}: ${violation.help}\n${violation.nodes.map(node => `${node.target.join(' ')} :: ${node.failureSummary ?? node.html}`).join('\n')}`,
  ).join('\n\n');
  expect(blocking, `${state}: Axe, infracciones serias\n${summary}`).toEqual([]);
}

for (const viewport of [REQUIRED_VIEWPORTS[1], REQUIRED_VIEWPORTS[2]]) {
  test.describe(`comentarios-${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.inputMode === 'touch' });

    test(`@comentarios al acercarse la persona dice su línea; al revisar lo que pide y volver, la condicionada; sin burbuja con la conversación abierta (${viewport.name})`, async ({ page }) => {
      test.setTimeout(scaled(300_000));
      expect(CASO.inicial, 'los comentarios que se prueban son los de la escena inicial del documento sembrado').toBe(true);
      const recorder = recordSimulationResponses(page);
      const input = createWorldInputDriver(page, viewport.inputMode);
      const bubble = page.locator('[data-comment]');
      await enterWorld(page);

      // Acercarse: la línea sin condición, y la burbuja se audita con Axe mientras está a la vista.
      await acercarseA(page, input, 'ArrowLeft', rx(CASO.persona));
      await expect(bubble).toBeVisible({ timeout: scaled(15_000) });
      await expect(bubble).toContainText(CASO.libre);
      await expectNoSeriousAxeViolations(page, `${viewport.name}: la burbuja de comentario`, 'app-comment-bubble');
      expect(await bubble.count(), 'la burbuja seguía a la vista al terminar la auditoría').toBe(1);

      // Revisar el objeto que pide la condición, alejarse del personaje y volver a acercarse: la línea condicionada.
      await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], rx(CASO.objeto));
      await interactNearby(page, rx(CASO.objeto), new RegExp(`/interactions/${CASO.revisar}$`));
      await closeDialogue(page, rx(CASO.objeto));
      await waitForWorldReady(page);
      await expect(bubble, 'lejos del personaje no hay burbuja').toHaveCount(0);
      await acercarseA(page, input, ['ArrowLeft', 'ArrowLeft', 'ArrowDown'], rx(CASO.persona));
      await expect(bubble).toBeVisible({ timeout: scaled(15_000) });
      await expect(bubble).toContainText(CASO.condicionado);
      await expect(bubble).not.toContainText(CASO.libre);

      // Con la conversación abierta no hay burbuja.
      await interactNearby(page, rx(CASO.persona), new RegExp(`/interactions/${CASO.personaje}$`));
      await expect(page.getByRole('dialog', { name: /^di.logo con/i })).toBeVisible();
      await expect(bubble).toHaveCount(0);

      // La condición de un comentario nunca viaja al navegador.
      await recorder.settled();
      expect(recorder.records.some(r => r.where.includes('/world')), 'se recogió alguna respuesta del mundo').toBe(true);
      const leaks = recorder.records.flatMap(r => conditionKeysInComments(r.body).map(p => `${r.where}: ${p}`));
      expect(leaks, 'ninguna respuesta de /api/simulation trajo la condición de un comentario').toEqual([]);
      recorder.stop();
    });
  });
}
