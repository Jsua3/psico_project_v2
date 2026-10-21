import { expect, test } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors, KNOWN_CONSOLE_PATTERNS } from './support/console-gate';
import { GUIDED_VIEWPORTS } from './support/guided-viewports';
import {
  advanceDialogueToChoices,
  canvasSize,
  checklistCard,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterDoor,
  enterWorld,
  expectNextStep,
  exploreUntilNearby,
  reachNearby,
  interactNearby,
  nearbyAction,
  nowLine,
  primaryNearbyAction,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Orientación del primer minuto (F§9.2): el jugador siempre sabe qué hacer,
 * con quién hablar y cómo salir. Dos viewports: escritorio 1366x768 con teclado
 * y móvil horizontal 844x390 con toques (el modo compacto). Nada de coordenadas:
 * se camina hasta que la barra ofrece lo que pide la lista «Qué hacer».
 *
 * Límites de producto que vigila: nada aquí revela cuál opción de decisión es la
 * adecuada (las opciones se eligen por el texto que ya fija full-case) y la
 * conversación informativa del «Marco normativo» no ofrece decisiones.
 */

const CANVAS_TOLERANCE_PX = 2;

for (const viewport of GUIDED_VIEWPORTS) {
  test.describe(`guided-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@orientation primer minuto: lista «Qué hacer», aviso al recoger, persona a su alcance y canvas estable (${viewport.name})`,
      async ({ page }) => {
        test.setTimeout(scaled(240_000));
        const input = createWorldInputDriver(page, viewport.inputMode);
        // Sin sembrar la ayuda: la tarjeta de primera vez es parte de lo que se ve al llegar.
        await enterWorld(page, { seedHelp: false });

        // AC-1: la región «Qué hacer» y la línea «Ahora:» se ven sin desplazarse.
        const card = page.getByRole('region', { name: /^qué hacer$/i });
        await expect(card).toBeVisible();
        await expect(nowLine(page)).toBeVisible();
        await expect(nowLine(page)).toHaveText(/^Ahora:/);
        await expectNextStep(page, 'u1-recoger');
        for (const surface of [card, nowLine(page)]) {
          const box = await surface.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        }

        // Ayuda de primera vez: está, no tapa lo anterior y se descarta con «Entendido».
        const help = page.locator('app-game-help[view="card"]');
        await expect(help).toBeVisible();
        await help.getByRole('button', { name: /entendido/i }).click();
        await expect(help).toBeHidden();

        // Recoger: aviso «Obtuviste…» y el paso pasa a hecho (el siguiente es hablar con la Familia).
        await input.moveUntilNearby('ArrowLeft', /kit pap/i);
        await expect(primaryNearbyAction(page)).toContainText(/recoger kit pap/i);
        const pickedUp = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
        expect(pickedUp.world.inventory).toContain('PAP');
        await expect(page.locator('.soft-notice')).toContainText(/obtuviste: kit pap/i);
        await expectNextStep(page, 'u1-familia');
        if (viewport.inputMode === 'keyboard') {
          // Con la lista desplegada el paso queda marcado como hecho.
          await expect(page.locator('li.step[data-step-id="u1-recoger"]')).toHaveAttribute('data-state', 'done');
        }

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

        // AC-6: con la enfermera a su alcance la barra dice qué hacer y la tecla E (o el toque) abre su diálogo.
        const nurse = await exploreUntilNearby(page, input, /enfermera de urgencias/i);
        await expect(nurse).toContainText('Hablar con Enfermera de urgencias');
        await expect(nurse).toHaveAccessibleName(/hablar con enfermera de urgencias/i);
        await seekNpcDialogue(page, /enfermera de urgencias/i, input);
        // Conversación informativa: sin decisiones, solo líneas que se avanzan.
        const nurseDialogue = page.getByRole('dialog', { name: /enfermera de urgencias/i });
        await expect(nurseDialogue.getByRole('group', { name: /opciones de intervención/i })).toHaveCount(0);
        await closeDialogue(page, /enfermera de urgencias/i);
        await expectNextStep(page, 'u1-usar');
        await waitForWorldReady(page);
        await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
      });

    test(`@orientation recorrido guiado de la etapa 1 sin coordenadas, con el Marco normativo informativo (${viewport.name})`,
      async ({ page }, testInfo) => {
        // El recorrido táctil de punta a punta de la etapa 1 ya lo hace full-case (mobile-390 y
        // mobile-412) y el primer minuto táctil está arriba; el barrido de este recorrido en
        // 844x390 no siempre llega a la enfermera (pendiente de afinar), así que aquí solo escritorio.
        test.skip(viewport.inputMode === 'touch', 'cubierto por full-case-mobile; barrido táctil de 844x390 pendiente de afinar');
        test.setTimeout(scaled(360_000));
        const input = createWorldInputDriver(page, viewport.inputMode);
        await enterWorld(page);
        await expect(checklistCard(page)).toHaveAttribute('data-stage', '1');

        // 1. Recoger el material de apoyo de la sala.
        await expectNextStep(page, 'u1-recoger');
        await reachNearby(page, input, 'ArrowLeft', /kit pap/i);
        const pap = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
        expect(pap.world.inventory).toContain('PAP');

        // 2. Hablar con la Familia en crisis.
        await expectNextStep(page, 'u1-familia');
        await reachNearby(page, input, 'ArrowLeft', /familia en crisis/i);
        await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);

        // 3. Usar el material en esa conversación (la opción aparece dentro del diálogo).
        await expectNextStep(page, 'u1-usar');
        const papUse = await useToolChoice(
          page,
          /abuela de la niña/i,
          /aplicar pap a la familia en crisis/i,
        );
        expect(papUse.pertinent).toBe(true);
        await closeDialogue(page, /herramienta pertinente/i);

        // 4. Hablar con la Enfermera de urgencias.
        await expectNextStep(page, 'u1-enfermera');
        await reachNearby(page, input, ['ArrowRight', 'ArrowUp'], /enfermera de urgencias/i);
        await seekNpcDialogue(page, /enfermera de urgencias/i, input);
        await closeDialogue(page, /enfermera de urgencias/i);

        // 5. Pasar a la Sala de escucha familiar.
        await expectNextStep(page, 'u1-puerta');
        await reachNearby(page, input, ['ArrowRight', 'ArrowDown'], /sala de escucha familiar/i);
        await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');

        // Marco normativo en la etapa 1: su decisión es de la etapa 2, así que la
        // conversación solo informa (sin opciones) y se cierra con «Continuar».
        await expectNextStep(page, 'u1-decidir');
        await reachNearby(page, input, ['ArrowRight', 'ArrowUp'], /marco normativo/i);
        await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-hospital$/);
        const informative = page.getByRole('dialog', { name: /diálogo con/i });
        await expect(informative).toBeVisible({ timeout: scaled(30_000) });
        await expect(informative.getByRole('group', { name: /opciones de intervención/i })).toHaveCount(0);
        await closeDialogue(page, /diálogo con/i);
        await expect(page.getByRole('dialog', { name: /diálogo con/i })).toHaveCount(0);
        await waitForWorldReady(page);

        // 6. La primera decisión, con la Familia en crisis de la Sala de escucha.
        await expectNextStep(page, 'u1-decidir');
        await reachNearby(page, input, ['ArrowLeft', 'ArrowDown'], /familia en crisis/i);
        await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
        const decision = await chooseDecision(
          page,
          /abuela de la niña/i,
          /aplicar pap: contención emocional, acompañamiento en duelo/i,
        );
        expect(decision.currentNode.key).toBe('hospital-sala-escucha');
        await closeDialogue(page, /consecuencia/i);
        await waitForWorldReady(page);

        // La lista pasó a la etapa 2 y su siguiente paso es la segunda decisión.
        await expect(checklistCard(page)).toHaveAttribute('data-stage', '2', { timeout: scaled(15_000) });
        await expectNextStep(page, 'u2-decidir');
        await testInfo.attach(`${viewport.name}-etapa-2.png`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        // La barra ofrece el siguiente paso por su nombre, no por su posición.
        await reachNearby(page, input, ['ArrowRight', 'ArrowUp'], /marco normativo/i);
        await expect(nearbyAction(page, /marco normativo/i)).toBeVisible();
        await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
      });
  });
}
