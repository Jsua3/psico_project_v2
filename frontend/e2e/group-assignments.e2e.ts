import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { createPublishedCase, retireCase } from './support/case-fixtures';
import { assertQualityState } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { loginStudent } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Casos asignados de un grupo (plan visual F10-5†; C7, RF-14, RF-15, CU-06, RN-04) contra la pila real: la docente asigna un
 * caso publicado con fecha de apertura, cambia las fechas, lo pausa y lo reanuda y lo retira, siempre pidiendo confirmar lo
 * que le pasa al grupo; y lo que ve un estudiante del grupo sigue a la asignación: «Aún no abre» con su fecha, «Ya cerró»,
 * y nada si está en pausa o retirado.
 */
const toastText = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);

// req: RF-14, RF-15, CU-06, RN-04, RNF-04
test('la docente asigna con fecha de apertura, cambia las fechas, pausa y retira; el estudiante lo ve según la ventana', async ({ page, request, browser }) => {
  test.setTimeout(scaled(240_000));
  const fixture = await createPublishedCase(request, {
    title: `Asignación e2e ${Date.now()}`, context: 'Un caso de prueba para las asignaciones.', learningObjectives: ['Probar la ventana.'],
  });
  const studentContext = await browser.newContext({ baseURL: (test.info().project.use as { baseURL?: string }).baseURL });
  try {
    await loginAs(page, 'profesor');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portal/grupos');
    await page.getByRole('button', { name: /^Ver detalle de / }).first().click();
    const section = page.locator('app-group-assignments');
    await expect(section.getByRole('heading', { level: 3, name: 'Casos asignados' })).toBeVisible({ timeout: scaled(30_000) });

    // ── Asignar con apertura en el futuro ──────────────────────────────────────────────────────────────────────────
    await section.getByRole('button', { name: 'Asignar un caso' }).click();
    const assignDialog = page.getByRole('dialog', { name: 'Asignar un caso al grupo' });
    await expect(assignDialog).toBeVisible();
    await assignDialog.getByLabel('Cierra').fill('2020-01-01T00:00');
    await assignDialog.getByLabel('Abre').fill('2030-03-04T08:00');
    await assignDialog.getByLabel('Caso').selectOption(String(fixture.caseVersionId));
    await assignDialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    // Cierre antes de la apertura: el campo del cierre lo dice y no se asigna nada.
    await expect(assignDialog.getByText('El cierre debe ser posterior a la apertura.')).toBeVisible();
    await expect(assignDialog.getByLabel('Cierra')).toBeFocused();
    await assignDialog.getByLabel('Cierra').fill('');
    await assignDialog.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(toastText(page, 'Caso asignado al grupo.')).toBeVisible({ timeout: scaled(15_000) });

    const item = section.locator('.ga-item').filter({ hasText: fixture.title });
    await expect(item.locator('ui-badge')).toHaveText('Aún no abre');
    await expect(item.locator('.ga-window')).toContainText(/Abre el .*4 de mar/);
    await expect(item.locator('.ga-window')).toContainText('Sin cierre');
    await assertQualityState(page, test.info(), 'casos asignados con una asignación programada');

    // ── El estudiante ve «Aún no abre» con su fecha y no puede empezarlo ────────────────────────────────────────────
    const student = await studentContext.newPage();
    await loginStudent(student);
    await student.goto('/portal/simulador');
    const card = student.locator('.case-card').filter({ hasText: fixture.title });
    await expect(card.locator('.case-card__lock')).toHaveText('Aún no abre', { timeout: scaled(30_000) });
    await expect(card.locator('.case-card__reason')).toContainText(/4 de mar/);
    await expect(card.locator('.case-card__actions button').first()).toHaveAttribute('aria-disabled', 'true');

    // ── Cambiar las fechas: ya cerró ───────────────────────────────────────────────────────────────────────────────
    await item.getByRole('button', { name: 'Cambiar fechas' }).click();
    const datesDialog = page.getByRole('dialog', { name: `Fechas de «${fixture.title}»` });
    await expect(datesDialog).toBeVisible();
    await datesDialog.getByLabel('Abre').fill('2020-01-01T00:00');
    await datesDialog.getByLabel('Cierra').fill('2020-02-01T00:00');
    await datesDialog.getByRole('button', { name: 'Guardar fechas' }).click();
    await expect(toastText(page, 'Fechas actualizadas.')).toBeVisible({ timeout: scaled(15_000) });
    await expect(item.locator('ui-badge')).toHaveText('Ya cerró');
    await student.reload();
    await expect(card.locator('.case-card__lock')).toHaveText('Ya cerró', { timeout: scaled(30_000) });

    // ── Pausar pide confirmar y el estudiante deja de verlo; reanudar lo devuelve ──────────────────────────────────
    await item.getByRole('button', { name: 'Pausar' }).click();
    const pause = page.getByRole('alertdialog', { name: `¿Pausar «${fixture.title}» para el grupo?` });
    await expect(pause).toContainText('nadie del grupo podrá iniciar ni seguir este caso');
    await pause.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(item.locator('ui-badge')).toHaveText('En pausa');
    await student.reload();
    await expect(student.locator('.case-card').first()).toBeVisible({ timeout: scaled(30_000) });
    await expect(student.locator('.case-card').filter({ hasText: fixture.title })).toHaveCount(0);
    await item.getByRole('button', { name: 'Reanudar' }).click();
    await expect(item.locator('ui-badge')).toHaveText('Ya cerró');

    // ── Retirar pide confirmar, nombra lo que pasa y quita el caso del grupo ──────────────────────────────────────
    await item.getByRole('button', { name: `Retirar «${fixture.title}» del grupo` }).click();
    const remove = page.getByRole('alertdialog', { name: `¿Retirar «${fixture.title}» del grupo?` });
    await expect(remove).toContainText('incluso quienes ya lo empezaron');
    await remove.getByRole('button', { name: 'Retirar', exact: true }).click();
    await expect(toastText(page, 'Caso retirado del grupo.')).toBeVisible({ timeout: scaled(15_000) });
    await expect(section.locator('.ga-item').filter({ hasText: fixture.title })).toHaveCount(0);
  } finally {
    await studentContext.close();
    await retireCase(request, fixture.caseVersionId);
  }
});

// req: RF-14, RF-15, CU-06, RNF-03, RNF-04
for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`el diálogo de asignación cabe en ${viewport.width}×${viewport.height}, vacío y con sus dos errores a la vista`, async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const fixture = await createPublishedCase(request, {
      title: `Diálogo e2e ${Date.now()}`, context: 'Un caso de prueba para el diálogo de asignación.', learningObjectives: ['Probar el diálogo.'],
    });
    try {
      await loginAs(page, 'profesor');
      await page.setViewportSize(viewport);
      await page.goto('/portal/grupos');
      await page.getByRole('button', { name: /^Ver detalle de / }).first().click();
      await page.locator('app-group-assignments').getByRole('button', { name: 'Asignar un caso' }).click({ timeout: scaled(30_000) });
      const dialog = page.getByRole('dialog', { name: 'Asignar un caso al grupo' });
      await expect(dialog).toBeVisible();
      await assertQualityState(page, test.info(), `diálogo de asignación (${viewport.width})`);

      // Sin caso y con el cierre antes de la apertura: los dos errores a la vez son el peor alto del diálogo.
      await dialog.getByLabel('Abre').fill('2030-03-04T08:00');
      await dialog.getByLabel('Cierra').fill('2030-03-03T08:00');
      await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();
      await expect(dialog.getByText('Elige un caso.')).toBeVisible();
      await expect(dialog.getByText('El cierre debe ser posterior a la apertura.')).toBeVisible();
      await assertQualityState(page, test.info(), `diálogo de asignación con errores (${viewport.width})`);
    } finally {
      await retireCase(request, fixture.caseVersionId);
    }
  });
}
