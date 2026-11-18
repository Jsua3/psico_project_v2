import { expect, test } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors, KNOWN_CONSOLE_PATTERNS } from './support/console-gate';
import {
  esperarConsecuencia,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterDoor,
  enterWorld,
  interactNearby,
  reachNearby,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * RN-08 (F10-4) contra el servidor real: al decidir se lee la CONSECUENCIA y nunca la clasificación ni el mensaje
 * evaluativo. La prueba no depende de la bandera: con `SIEP_FEEDBACK_AT_CLOSE_ONLY` apagada la respuesta trae la
 * forma heredada (con `feedback`) y el diálogo debe seguir sin leerla; encendida, la respuesta no la trae.
 * «Tus decisiones» al cierre lo cubre full-case, que completa el caso por la interfaz (el resultado solo se abre en la
 * sesión que completa el intento).
 */
// req: RN-08, RF-23, CU-13, RF-10
test.describe('@feedback RN-08: la consecuencia al decidir no trae clasificación', () => {
  test('la primera decisión se lee como consecuencia y no muestra clasificación ni mensaje evaluativo (desktop-1366)', async ({ page }, testInfo) => {
    testInfo.setTimeout(scaled(300_000));
    const input = createWorldInputDriver(page, 'keyboard');
    await enterWorld(page);

    // Hasta la primera decisión, por el mismo recorrido que full-case.
    await input.moveUntilNearby('ArrowLeft', /kit pap/i);
    await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
    await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
    await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
    await useToolChoice(page, /abuela de la niña/i, /aplicar pap a la familia en crisis/i);
    await closeDialogue(page, /herramienta pertinente/i);
    await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp'], /enfermera de urgencias/i);
    await seekNpcDialogue(page, /enfermera de urgencias/i, input);
    await closeDialogue(page, /enfermera de urgencias/i);
    await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown'], /sala de escucha familiar/i);
    await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
    await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
    await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);

    const decision = await chooseDecision(
      page,
      /abuela de la niña/i,
      /aplicar pap: contención emocional, acompañamiento en duelo/i,
    );

    // Al decidir: la consecuencia narrativa, sin clasificación ni el texto evaluativo del servidor.
    const consequence = page.getByRole('dialog', { name: /consecuencia/i });
    expect(await esperarConsecuencia(page), 'la consecuencia llega tras «Continuar» en la reacción').toBe(true);
    const shown = (await consequence.textContent()) ?? '';
    expect(shown).not.toMatch(/Decisión adecuada|Decisión con riesgo|Alerta ética/);
    if (decision.consequence) expect(shown).toContain(decision.consequence.text);
    if (decision.feedback?.message) expect(shown).not.toContain(decision.feedback.message);
    if (decision.feedback?.prohibitionReason) expect(shown).not.toContain(decision.feedback.prohibitionReason);
    await closeDialogue(page, /consecuencia/i);
    await waitForWorldReady(page);
    await assertNoUnexpectedConsoleOrPageErrors(page, KNOWN_CONSOLE_PATTERNS);
  });
});
