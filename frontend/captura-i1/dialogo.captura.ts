import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { assignCase, createExplorationCase, retireCase } from '../e2e/support/case-fixtures';
import type { AssignmentRecord, CaseFixture } from '../e2e/support/case-fixtures';
import { resetStudentConsent } from '../e2e/support/consent';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  finishCaseIntroduction,
  interactNearby,
  leaveBrief,
  loginStudent,
  reachNearby,
  startFreshAttempt,
  waitForWorldReady,
} from '../e2e/support/siep-flow';
import type { WorldInputDriver } from '../e2e/support/siep-flow';
import { scaled } from '../e2e/support/time-scale';

/**
 * Capturas del juego real con la interfaz de diálogo nueva (bloque I1), sobre el mismo recorrido de
 * `explorar-y-reaccion.e2e.ts`: el caso de exploración de dos escenas (Laura, la carpeta y el archivo). Deja las imágenes
 * en `CAPTURA_DIR` como `juego-real-<ancho>-<momento>.png`.
 */
const DESTINO = process.env.CAPTURA_DIR ?? 'D:/Sua_Files/IdeaProjects/psico_project_v3/.superpowers/noche-2026-11-14/capturas-i1';
const TAMANOS = [
  { nombre: '1366', width: 1366, height: 768 },
  { nombre: '1920', width: 1920, height: 1080 },
];

async function foto(page: Page, nombre: string): Promise<void> {
  await page.screenshot({ path: `${DESTINO}/juego-real-${nombre}.png` });
}

async function entrarAlCaso(page: Page, title: string): Promise<void> {
  await page.goto('/login');
  await loginStudent(page);
  await resetStudentConsent(page);
  await page.goto('/portal/simulador');
  const card = page.locator('.case-card').filter({ hasText: title });
  await expect(card).toBeVisible({ timeout: scaled(30_000) });
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

async function irA(page: Page, input: WorldInputDriver, label: RegExp, key: string): Promise<void> {
  await reachNearby(page, input, ['ArrowRight', 'ArrowRight', 'ArrowUp'], label);
  await interactNearby(page, label, new RegExp(`/interactions/${key}$`));
}

for (const tamano of TAMANOS) {
  test.describe(`captura-${tamano.nombre}`, () => {
    test.use({ viewport: { width: tamano.width, height: tamano.height } });

    test(`interfaz de diálogo en el juego real (${tamano.nombre})`, async ({ page, request }) => {
      test.setTimeout(scaled(240_000));
      let fixture: CaseFixture | undefined;
      const records: AssignmentRecord[] = [];
      try {
        fixture = await createExplorationCase(request);
        records.push(await assignCase(request, fixture.caseVersionId));
        const input = createWorldInputDriver(page, 'keyboard');
        await entrarAlCaso(page, fixture.title);

        // 1. Una conversación sin decisión: la placa sola sobre el mundo (modo cinemático).
        await irA(page, input, /laura/i, 'laura');
        await expect(page.getByRole('dialog', { name: /laura/i })).toBeVisible({ timeout: scaled(30_000) });
        await page.waitForTimeout(1_500);
        await foto(page, `${tamano.nombre}-1-conversacion`);
        await closeDialogue(page, /laura/i);

        // 2. Con la carpeta revisada, Laura ofrece decidir: la placa y las fichas A a D (panel lateral).
        await irA(page, input, /historia clínica/i, 'carpeta');
        await page.waitForTimeout(800);
        await irA(page, input, /laura/i, 'laura');
        const decision = await advanceDialogueToChoices(page, /laura/i);
        await page.waitForTimeout(600);
        await foto(page, `${tamano.nombre}-2-opciones`);
        await decision.locator('.choice-btn').first().hover();
        await page.waitForTimeout(200);
        await foto(page, `${tamano.nombre}-3-opcion-sobre`);

        // 3. La reacción de Laura y la nota de supervisión.
        await chooseDecision(page, /laura/i, /escuchar a laura/i);
        await expect(page.locator('app-reaction-director .reaction-strip')).toBeVisible({ timeout: scaled(5_000) });
        await page.waitForTimeout(400);
        await foto(page, `${tamano.nombre}-4-reaccion`);
        await expect(page.getByRole('dialog', { name: /consecuencia/i })).toBeVisible({ timeout: scaled(30_000) });
        await page.waitForTimeout(1_200);
        await foto(page, `${tamano.nombre}-5-supervision`);
      } finally {
        if (fixture) await retireCase(request, fixture.caseVersionId, records);
      }
    });
  });
}
