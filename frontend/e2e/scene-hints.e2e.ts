import { expect, test } from '@playwright/test';

import { assignCase, cloneAndPublishCase, retireCase } from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import { assertQualityState, runAxe } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  waitForWorldReady,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Pistas de la escena (plan visual F10-2; RF-18, CU-09; contrato C9) contra la pila real: sobre un clon del caso demo con
 * dos pistas en cada escena, las opciones de la decisión de la familia ofrecen «Ver pista». Se piden una a una (el
 * servidor las revela de a una y sin costo), la lista se queda a la vista y, vistas todas, el botón explica por qué se
 * apagó. La decisión sigue disponible: pedir una pista no la elige ni la bloquea.
 */
const HINTS = ['Mira con calma lo que dice la abuela.', 'Piensa qué necesita la niña ahora.'];

// Escritorio con teclado y celular con el dedo: la franja de pistas cabe sobre las opciones en los dos.
const VIEWPORTS = [REQUIRED_VIEWPORTS[1], REQUIRED_VIEWPORTS[2]];

for (const viewport of VIEWPORTS) {
  test.describe(`pistas-${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.inputMode === 'touch' });

    // req: RF-18, CU-09, RF-11, RNF-04
    test(`«Ver pista» pide las pistas de la escena una a una, sin elegir la decisión, hasta agotarlas (${viewport.name})`, async ({ page, request }) => {
      test.setTimeout(scaled(360_000));
      const login = await request.post('/api/auth/login', {
        data: { email: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co', password: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!' },
      });
      expect(login.status(), 'login del estudiante por API').toBe(200);
      const studentHeaders = { Authorization: `Bearer ${(await login.json()).data.token}` };
      const source = ((await (await request.get('/api/simulation/cases', { headers: studentHeaders })).json()).data as Array<{ caseVersionId: number }>)[0].caseVersionId;

      const fixture = await cloneAndPublishCase(request, source, { hints: HINTS });
      const records: AssignmentRecord[] = [];
      try {
        records.push(await assignCase(request, fixture.caseVersionId));

        const decisionPosts: string[] = [];
        page.on('request', req => {
          if (req.method() === 'POST' && /\/attempts\/[^/]+\/decisions$/.test(new URL(req.url()).pathname)) decisionPosts.push(req.url());
        });

        await loginStudent(page);
        await page.goto('/portal/jugar');
        await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
        const consent = await enterCaseAtContentWarning(page);
        const introVideo = await acceptContentWarning(page, consent);
        const caseIntro = await finishCaseIntroduction(page, introVideo);
        await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
        await waitForWorldReady(page);

        const input = createWorldInputDriver(page, viewport.inputMode);
        await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
        await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
        const family = await advanceDialogueToChoices(page, /abuela de la niña/i);

        const hints = family.locator('app-scene-hint');
        const ask = hints.getByRole('button', { name: 'Ver pista', exact: true });
        await expect(ask).toBeVisible();
        await expect(hints.locator('.scene-hint__counter')).toHaveText('2 pistas por ver · sin costo');
        await expect(family.getByRole('group', { name: /opciones de intervención/i })).toBeVisible();
        // La franja es lo único que se le suma al panel antes de pedir nada: con ella, WCAG 2.1 AA, sin desbordes y todas las
        // opciones dentro de la pantalla (en un celular cada renglón empuja las opciones).
        await assertQualityState(page, test.info(), `decisión con «Ver pista» (${viewport.name})`);

        const reveal = () => page.waitForResponse(response =>
          response.request().method() === 'POST' && /\/attempts\/[^/]+\/hints\/next$/.test(new URL(response.url()).pathname),
          { timeout: scaled(30_000) });

        const press = () => (viewport.inputMode === 'touch' ? ask.tap() : ask.click());
        let response = reveal();
        await press();
        expect((await response).status()).toBe(200);
        await expect(hints.locator('.scene-hint__item')).toHaveText([HINTS[0]]);
        await expect(hints.locator('.scene-hint__counter')).toHaveText('1 pista por ver · sin costo');
        // El servidor no revela dos pistas en 2 s (doble clic): el botón lo dice y vuelve solo.
        await expect(ask).toHaveAttribute('aria-disabled', 'true');
        await expect(ask).toHaveAccessibleDescription('Lee la pista antes de pedir la siguiente.');
        await expect(ask).not.toHaveAttribute('aria-disabled', 'true', { timeout: scaled(10_000) });

        response = reveal();
        await press();
        expect((await response).status()).toBe(200);
        await expect(hints.locator('.scene-hint__item')).toHaveText(HINTS);
        await expect(hints.locator('.scene-hint__counter')).toHaveCount(0);
        await expect(ask).toHaveAttribute('aria-disabled', 'true');
        await expect(ask).toHaveAccessibleDescription('Ya viste todas las pistas de esta escena.');

        // Pedir pistas no eligió nada: la decisión sigue esperando. Con la lista a la vista el panel puede crecer más que un
        // celular, así que las opciones se alcanzan desplazando el panel (no se exige que quepan a la vez) y la pantalla
        // sigue cumpliendo WCAG 2.1 AA.
        expect(decisionPosts).toEqual([]);
        const options = family.getByRole('group', { name: /opciones de intervención/i });
        await options.scrollIntoViewIfNeeded();
        await expect(options).toBeInViewport();
        const results = await runAxe(page, { tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], resultTypes: ['violations'], include: '[role="dialog"]' });
        expect(results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
          .map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
      } finally {
        await retireCase(request, fixture.caseVersionId, records);
      }
    });
  });
}
