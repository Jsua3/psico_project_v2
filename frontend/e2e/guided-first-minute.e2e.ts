import { readFileSync } from 'fs';
import { join } from 'path';

import { expect, test } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors, KNOWN_CONSOLE_PATTERNS } from './support/console-gate';
import { GUIDED_VIEWPORTS } from './support/guided-viewports';
import {
  advanceDialogueToChoices,
  canvasSize,
  closeDialogue,
  createWorldInputDriver,
  enterWorld,
  exploreUntilNearby,
  fichaDelObjetivoEn,
  goalCard,
  interactNearby,
  primaryNearbyAction,
  seekNpcDialogue,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Orientación del primer minuto (F§9.2): el jugador siempre sabe qué hacer, con quién hablar y cómo salir. Dos viewports:
 * escritorio 1366x768 con teclado y móvil horizontal 844x390 con toques (el modo compacto). Nada de coordenadas: se camina
 * hasta que la barra ofrece lo que se busca. La guía es genérica: la ficha del objetivo muestra el objetivo de la escena
 * inicial tal como está en el documento sembrado (no escrito a mano aquí) y su lista «En esta sala» marca lo ya hablado.
 *
 * Límites de producto que vigila: nada aquí revela cuál opción de decisión es la adecuada (el recorrido completo y sus
 * decisiones los hace full-case) y la conversación informativa de la enfermera no ofrece decisiones.
 */

const CANVAS_TOLERANCE_PX = 2;

/** El objetivo de la escena inicial, leído del documento del caso que siembra el servidor. */
const INITIAL_GOAL: string = (() => {
  const document = JSON.parse(readFileSync(
    join(__dirname, '..', '..', 'backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-001.dsl.json'), 'utf-8',
  )) as { 'x-siep': { escenas: Array<{ inicial?: boolean; objetivo?: string }> } };
  const initial = document['x-siep'].escenas.find(scene => scene.inicial) ?? document['x-siep'].escenas[0];
  return (initial.objetivo ?? '').trim();
})();

for (const viewport of GUIDED_VIEWPORTS) {
  test.describe(`guided-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@orientation primer minuto: ficha del objetivo, aviso al recoger, persona a su alcance y canvas estable (${viewport.name})`,
      async ({ page }) => {
        test.setTimeout(scaled(240_000));
        const input = createWorldInputDriver(page, viewport.inputMode);
        // Sin sembrar la ayuda: la tarjeta de primera vez es parte de lo que se ve al llegar.
        await enterWorld(page, { seedHelp: false });

        // AC-1: la ficha muestra el objetivo de la escena inicial (el del documento sembrado) y se ve sin desplazarse.
        const card = goalCard(page);
        const toggle = card.locator('button.goal-card__toggle');
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute('data-goal', INITIAL_GOAL);
        await expect(toggle).toContainText(INITIAL_GOAL);
        // Desde la guía (U1, V7) arranca abierta fuera del tramo compacto y plegada en compacto: no se da por plegada.
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

        // Ayuda de primera vez: está, no tapa lo anterior y se descarta con «Entendido».
        const help = page.locator('app-game-help[view="card"]');
        await expect(help).toBeVisible();
        await help.getByRole('button', { name: /entendido/i }).click();
        await expect(help).toBeHidden();

        // Abierta, la ficha lista a la familia como «aún no»; se cierra para no tapar el mundo al caminar.
        await fichaDelObjetivoEn(page, true);
        await expect(card.getByRole('listitem').filter({ hasText: /familia en crisis/i })).toContainText(/aún no/i);
        await fichaDelObjetivoEn(page, false);

        // Recoger: aviso «Obtuviste…».
        await input.moveUntilNearby('ArrowLeft', /kit pap/i);
        await expect(primaryNearbyAction(page)).toContainText(/recoger kit pap/i);
        const pickedUp = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
        expect(pickedUp.world.inventory).toContain('PAP');
        await expect(page.locator('.soft-notice')).toContainText(/obtuviste: kit pap/i);

        // AC-5: un diálogo con opciones no deja el canvas con otro tamaño al cerrarse.
        await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
        const before = await canvasSize(page);
        await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
        const family = await advanceDialogueToChoices(page, /abuela de la niña/i);
        await family.getByRole('button', { name: /volver al mapa/i }).click();
        await expect(family).toBeHidden();
        await expect.poll(async () => {
          const after = await canvasSize(page);
          return Math.max(Math.abs(after.width - before.width), Math.abs(after.height - before.height));
        }, {
          message: `El canvas debería recuperar ${Math.round(before.width)}x${Math.round(before.height)} (±${CANVAS_TOLERANCE_PX} px)`,
          timeout: scaled(10_000),
        }).toBeLessThanOrEqual(CANVAS_TOLERANCE_PX);

        // Tras hablar con la familia, la ficha (al abrirse se relee) la marca como «ya hablaste».
        await fichaDelObjetivoEn(page, true);
        await expect(card.getByRole('listitem').filter({ hasText: /familia en crisis/i })).toContainText(/ya hablaste/i);
        await fichaDelObjetivoEn(page, false);

        // AC-6: con la enfermera a su alcance la barra dice qué hacer y la tecla E (o el toque) abre su diálogo.
        const nurse = await exploreUntilNearby(page, input, /enfermera de urgencias/i);
        await expect(nurse).toContainText('Hablar con Enfermera de urgencias');
        await expect(nurse).toHaveAccessibleName(/hablar con enfermera de urgencias/i);
        await seekNpcDialogue(page, /enfermera de urgencias/i, input);
        // Conversación informativa: sin decisiones, solo líneas que se avanzan.
        const nurseDialogue = page.getByRole('dialog', { name: /enfermera de urgencias/i });
        await expect(nurseDialogue.getByRole('group', { name: /opciones de intervención/i })).toHaveCount(0);
        await closeDialogue(page, /enfermera de urgencias/i);
        await waitForWorldReady(page);
        await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
      });
  });
}
