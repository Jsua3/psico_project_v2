import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { assignCase, createExplorationCase, retireCase } from './support/case-fixtures';
import type { AssignmentRecord, CaseFixture } from './support/case-fixtures';
import { resetStudentConsent } from './support/consent';
import { runAxe } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  finishCaseIntroduction,
  goalCard,
  interactNearby,
  leaveBrief,
  loginStudent,
  reachNearby,
  startFreshAttempt,
  waitForWorldReady,
  watchReaction,
} from './support/siep-flow';
import type { WorldInputDriver } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Explorar abre una respuesta y el personaje reacciona (bloque B, Tarea 16; contrato `x-siep` 2.1) contra la pila real,
 * sobre un caso de dos escenas con un objetivo («Escuchar a Laura»), una carpeta revisable y una opción que exige haberla
 * revisado (`createExplorationCase`). El estudiante habla con Laura sin la opción, revisa la carpeta, vuelve, elige y ve la
 * reacción; el informe no deja nada sin ver. Sin revisar, el informe dice qué faltó. «Salida segura» y Esc siguen
 * funcionando durante la reacción (REGLA-004).
 */
const KEYBOARD = REQUIRED_VIEWPORTS[1];
const TOUCH = REQUIRED_VIEWPORTS[2];

const NOTHING_TO_DECIDE = 'Por ahora no hay nada que decidir en esta conversación.';
const NEW_OPTION_NOTICE = 'Ahora conoces algo más: hay otra forma de responder.';
const BLOCKING = new Set(['serious', 'critical']);
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Sin infracciones serias ni críticas de Axe (sobre todo el documento o sobre un subárbol). */
async function expectNoSeriousAxeViolations(page: Page, state: string, include?: string): Promise<void> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  const blocking = results.violations.filter(violation => violation.impact != null && BLOCKING.has(violation.impact));
  const summary = blocking.map(violation =>
    `[${violation.impact}] ${violation.id}: ${violation.help}\n${violation.nodes.map(node => `${node.target.join(' ')} :: ${node.failureSummary ?? node.html}`).join('\n')}`,
  ).join('\n\n');
  expect(blocking, `${state}: Axe, infracciones serias\n${summary}`).toEqual([]);
}

/**
 * Login → catálogo → tarjeta del caso por su título → ficha → aviso de contenido → tarjeta «Antes de comenzar» → mundo.
 * Hace lo mismo que `enterCaseAtContentWarning` + el resto de la entrada, pero elige el caso por su título.
 */
async function entrarAlCaso(page: Page, title: string): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await resetStudentConsent(page); // el consentimiento vive en el servidor: se parte de «sin consentimiento»
  await page.goto('/portal/simulador');
  const card = page.locator('.case-card').filter({ hasText: title });
  await expect(card, `el caso «${title}» está en el catálogo del estudiante`).toBeVisible({ timeout: scaled(30_000) });
  await card.locator('.case-card__actions button').first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
  await leaveBrief(page);
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
  await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(30_000) });
  if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
  await expect(consent).toBeVisible({ timeout: scaled(30_000) });
  const intro = await acceptContentWarning(page, consent);
  const card2 = await finishCaseIntroduction(page, intro);
  await card2.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
}

/** Camina hasta la persona o el objeto (rumbo aproximado y, si hace falta, barrido) e interactúa con él. */
async function irA(page: Page, input: WorldInputDriver, label: RegExp, key: string): Promise<void> {
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], label);
  await interactNearby(page, label, new RegExp(`/interactions/${key}$`));
}

/**
 * Recorre una conversación línea a línea hasta ver `text` (o hasta que se cierre sin verlo: falla con ese mensaje). No
 * cierra la conversación. Devuelve si la conversación llegó a listar opciones de decisión.
 */
async function leerHasta(page: Page, dialogueName: RegExp, text: string): Promise<{ options: number }> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  await expect(dialogue).toBeVisible({ timeout: scaled(30_000) });
  const deadline = Date.now() + scaled(20_000);
  while (Date.now() < deadline) {
    const shown = await dialogue.innerText({ timeout: scaled(2_000) }).catch(() => '');
    if (shown.includes(text)) return { options: await dialogue.getByRole('group', { name: /opciones de intervención/i }).count() };
    const next = dialogue.locator('button.close-btn:visible');
    if (await next.count()) await next.first().click({ timeout: scaled(1_000) }).catch(() => undefined);
    else await page.waitForTimeout(50);
    if (!(await dialogue.isVisible().catch(() => false))) break;
  }
  throw new Error(`La conversación ${dialogueName} no llegó a decir «${text}»`);
}

/** El estudiante revisa la carpeta y la respuesta nueva se anuncia. */
async function revisarLaCarpeta(page: Page, input: WorldInputDriver): Promise<void> {
  await irA(page, input, /historia clínica/i, 'carpeta');
  await expect(page.getByText(NEW_OPTION_NOTICE).first(), 'explorar la carpeta avisa de la respuesta nueva')
    .toBeVisible({ timeout: scaled(10_000) });
  // Revisar una carpeta sin diálogo no abre ninguna conversación: el aviso es lo único que cambia en pantalla.
}

const host = (page: Page): Locator => page.locator('app-game-world .phaser-host');

/** Se pone a una conversación de la opción `escuchar`: Laura, ya con la carpeta revisada. */
async function elegirEscuchar(page: Page, input: WorldInputDriver): Promise<void> {
  await irA(page, input, /laura/i, 'laura');
  const dialogue = await advanceDialogueToChoices(page, /laura/i);
  await expect(dialogue.getByRole('button', { name: /escuchar a laura/i }), 'con la carpeta revisada, Laura ofrece «Escuchar…»')
    .toBeVisible();
}

for (const viewport of [KEYBOARD, TOUCH]) {
  test.describe(`explorar-${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.inputMode === 'touch' });

    test(`@explorar revisar la carpeta abre una respuesta y Laura reacciona (${viewport.name})`, async ({ page, request }) => {
      test.setTimeout(scaled(240_000));
      const fixture = await createExplorationCase(request);
      const records: AssignmentRecord[] = [await assignCase(request, fixture.caseVersionId)];
      try {
        const input = createWorldInputDriver(page, viewport.inputMode);
        await entrarAlCaso(page, fixture.title);

        // La ficha del objetivo trae el de la escena; abierta y sin infracciones serias.
        await expect(goalCard(page)).toHaveAttribute('data-goal', 'Escuchar a Laura');
        await goalCard(page).locator('.goal-card__toggle').click();
        await expect(goalCard(page).locator('.goal-card__toggle')).toHaveAttribute('aria-expanded', 'true');
        await expectNoSeriousAxeViolations(page, `${viewport.name}: la ficha del objetivo abierta`);
        await goalCard(page).locator('.goal-card__toggle').click();

        // Laura todavía no ofrece nada: la conversación lo dice y no lista «Escuchar…».
        await irA(page, input, /laura/i, 'laura');
        const before = await leerHasta(page, /laura/i, NOTHING_TO_DECIDE);
        expect(before.options, 'sin revisar la carpeta no hay opciones de decisión').toBe(0);
        await expect(page.getByRole('dialog', { name: /laura/i }).getByRole('button', { name: /escuchar a laura/i })).toHaveCount(0);
        await closeDialogue(page, /laura/i);

        await revisarLaCarpeta(page, input);
        await elegirEscuchar(page, input);

        const reactionsSeen = await watchReaction(page);
        const decision = await chooseDecision(page, /laura/i, /escuchar a laura/i);
        expect(decision.reaction, 'el servidor trae la reacción de Laura').toMatchObject({ line: 'Gracias por escucharme.', gesture: 'se-acerca', objectKey: 'laura' });
        await expect.poll(reactionsSeen, { message: 'el gesto de Laura puso data-reaction en el host', timeout: scaled(5_000) })
          .toContain('se-acerca');
        const strip = page.locator('app-reaction-director');
        await expect(strip).toContainText('Gracias por escucharme.', { timeout: scaled(5_000) });
        // La franja de la reacción a la vista, sin infracciones serias (se audita solo su subárbol: dura ~3 s).
        if (await strip.locator('.reaction-strip').isVisible().catch(() => false)) {
          await expectNoSeriousAxeViolations(page, `${viewport.name}: la franja de la reacción`, 'app-reaction-director');
        }
        await expect(host(page)).not.toHaveAttribute('data-reaction', /.+/, { timeout: scaled(10_000) });

        // La nota de supervisión llega tras la reacción; la decisión fue la última y el informe no deja nada sin ver.
        await closeDialogue(page, /consecuencia/i);
        const outcome = page.getByRole('alertdialog', { name: /intento finalizado/i });
        await expect(outcome).toBeVisible({ timeout: scaled(30_000) });
        await expect(outcome.locator('.oc-decisions .oc-decision')).toHaveCount(1, { timeout: scaled(30_000) });
        await expect(outcome.locator('.oc-missed'), 'explorar antes de decidir no deja respuestas sin ver').toHaveCount(0);
      } finally {
        await retireCase(request, fixture.caseVersionId, records);
      }
    });

    test(`@explorar no explorar deja una respuesta sin ver y el informe dice qué faltó (${viewport.name})`, async ({ page, request }) => {
      test.setTimeout(scaled(240_000));
      const fixture = await createExplorationCase(request);
      const records: AssignmentRecord[] = [await assignCase(request, fixture.caseVersionId)];
      try {
        const input = createWorldInputDriver(page, viewport.inputMode);
        await entrarAlCaso(page, fixture.title);

        await irA(page, input, /archivo de pendientes/i, 'archivo');
        const dialogue = await advanceDialogueToChoices(page, /archivo/i);
        await expect(dialogue.getByRole('button', { name: /escuchar a laura/i })).toHaveCount(0);
        await chooseDecision(page, /archivo/i, /dejar la conversación para después/i);
        await closeDialogue(page, /consecuencia/i);

        const outcome = page.getByRole('alertdialog', { name: /intento finalizado/i });
        await expect(outcome).toBeVisible({ timeout: scaled(30_000) });
        const missed = outcome.locator('.oc-missed');
        await expect(missed).toHaveCount(1, { timeout: scaled(30_000) });
        await expect(missed).toContainText('Respuestas que no llegaste a ver');
        await expect(missed).toContainText('Te faltó: revisar Historia clínica');
      } finally {
        await retireCase(request, fixture.caseVersionId, records);
      }
    });

    // REGLA-004: «Salida segura» y Esc funcionan también durante la secuencia de la reacción. La decisión de Laura no es la
    // última (hay una escena de seguimiento): en la última, «Salida segura» corta la reacción y abre el resultado, no la pausa.
    test(`@explorar «Salida segura» y Esc pausan durante la reacción (${viewport.name})`, async ({ page, request }) => {
      test.setTimeout(scaled(240_000));
      const fixture: CaseFixture = await createExplorationCase(request, { followUp: true });
      const records: AssignmentRecord[] = [await assignCase(request, fixture.caseVersionId)];
      try {
        const input = createWorldInputDriver(page, viewport.inputMode);
        await entrarAlCaso(page, fixture.title);
        await revisarLaCarpeta(page, input);
        await elegirEscuchar(page, input);

        const reactionsSeen = await watchReaction(page);
        const option = page.getByRole('dialog', { name: /laura/i }).getByRole('button', { name: /escuchar a laura/i });
        await option.click();
        // La espera fiable: el atributo del gesto y, sin soltar la mano, la salida (el gesto dura unos 400 ms; la franja, ~3 s).
        await expect(host(page)).toHaveAttribute('data-reaction', 'se-acerca', { timeout: scaled(10_000) });
        const exit = page.getByRole('button', { name: /salida segura/i });
        await expect(exit, 'un único «Salida segura» durante la reacción').toHaveCount(1);
        await expect(exit).toBeVisible();
        await expect(exit).toBeEnabled();
        const paused = page.waitForResponse(response =>
          response.request().method() === 'POST' && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
        { timeout: scaled(30_000) });
        if (viewport.inputMode === 'keyboard') await page.keyboard.press('Escape');
        else await exit.tap({ timeout: scaled(3_000) });

        expect((await paused).ok(), 'el servidor acepta la pausa en plena reacción').toBe(true);
        const pause = page.getByRole('alertdialog', { name: /pausa/i });
        await expect(pause).toBeVisible({ timeout: scaled(30_000) });
        expect(await reactionsSeen(), 'el gesto llegó a ponerse antes de la pausa').toContain('se-acerca');
        await expect(page.locator('.phaser-host[data-reaction]'), 'la pausa corta el gesto: nada queda en el host').toHaveCount(0);
        await expect(page.locator('app-reaction-director .reaction-strip'), 'la franja de la reacción no queda bajo la pausa').toHaveCount(0);
        await expect(page.getByRole('dialog', { name: /consecuencia/i }), 'la nota de supervisión no queda sobre la pausa').toHaveCount(0);

        await page.getByRole('button', { name: /reanudar este intento/i }).click();
        await expect(pause).toBeHidden({ timeout: scaled(30_000) });
      } finally {
        await retireCase(request, fixture.caseVersionId, records);
      }
    });
  });
}
