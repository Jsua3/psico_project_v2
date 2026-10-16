import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Reporte de un estudiante (plan visual F10-7†; RF-26, CU-15, RF-25, CU-14, RQ-NEG-006; contrato C3), contra el servidor
 * REAL: del reporte del grupo al de UN estudiante con un gesto, sus intentos con el tiempo activo y el de reloj, «Mostrando
 * X de N», la vuelta al grupo del que se vino y la regla de alcance (un docente solo ve a los estudiantes de sus grupos).
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')} · ${node.any[0]?.message ?? ""}`));
}

/** Axe mide lo que hay pintado: esperar a que terminen las animaciones finitas (la entrada de la página mezcla los colores). */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForFunction(() => document.getAnimations().every(animation => {
    const timing = animation.effect?.getComputedTiming();
    return animation.playState !== 'running' || timing === undefined || timing.iterations === Infinity;
  }), undefined, { timeout: 10_000 }).catch(() => undefined);
}

async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.status(), `login por API de ${email}`).toBe(200);
  return (await response.json()).data.token;
}

const ADMIN = { email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!' };
const PROFESOR = { email: process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co', password: process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!' };

/**
 * Un estudiante propio de esta prueba (no el sembrado: las pruebas del juego comparten su intento) con UN intento
 * abierto en un grupo de la docente sembrada: el administrador crea la cuenta, la docente crea el grupo, lo invita y le
 * asigna el caso publicado, el estudiante acepta e inicia el intento, todo por API.
 */
async function studentWithAttempt(request: APIRequestContext): Promise<{
  groupId: number; studentId: number; studentName: string; teacher: Record<string, string>; cleanup: () => Promise<void>;
}> {
  const stamp = Date.now().toString(36);
  const email = `reporte-${stamp}@siep.test`;
  const password = `Clave-${stamp}-2026`;
  const admin = { Authorization: `Bearer ${await apiToken(request, ADMIN.email, ADMIN.password)}` };
  const user = await request.post('/api/admin/users', { headers: admin, data: { email, password, nombre: 'Reporte', apellido: stamp, role: 'ESTUDIANTE', activo: true } });
  expect(user.status(), 'crear estudiante').toBeLessThan(300);
  const studentId = (await user.json()).data.id as number;

  const teacher = { Authorization: `Bearer ${await apiToken(request, PROFESOR.email, PROFESOR.password)}` };
  const created = await request.post('/api/grupos', { headers: teacher, data: { nombre: `Reporte e2e ${stamp}`, codigo: `REPE-${stamp}` } });
  expect(created.status(), 'crear grupo').toBeLessThan(300);
  const groupId = (await created.json()).data.id as number;
  expect((await request.post(`/api/grupos/${groupId}/estudiantes`, { headers: teacher, data: { email } })).status(), 'invitar').toBeLessThan(300);
  const cases = (await (await request.get('/api/simulation/cases', { headers: teacher })).json()).data as Array<{ caseVersionId: number }>;
  expect(cases.length, 'hay un caso publicado').toBeGreaterThan(0);
  expect((await request.post(`/api/grupos/${groupId}/casos`, { headers: teacher, data: { caseVersionId: cases[0].caseVersionId } })).status(), 'asignar el caso').toBeLessThan(300);

  const student = { Authorization: `Bearer ${await apiToken(request, email, password)}` };
  expect((await request.post(`/api/me/invitations/${groupId}/accept`, { headers: student, data: {} })).status(), 'aceptar').toBe(200);
  expect((await request.post('/api/simulation/attempts', { headers: student, data: { caseVersionId: cases[0].caseVersionId } })).status(), 'iniciar intento').toBe(200);
  return { groupId, studentId, studentName: `Reporte ${stamp}`, teacher, cleanup: async () => { await request.delete(`/api/grupos/${groupId}`, { headers: teacher }); } };
}

// req: RF-26, CU-15, RF-25, CU-14, RQ-NEG-006
test.describe('@reporte-estudiante reporte de un estudiante (F10-7)', () => {
  test('del reporte del grupo al de un estudiante con un gesto: sus intentos, «Mostrando 1 de 1 intento» y la vuelta al grupo', async ({ page, request }) => {
    test.setTimeout(scaled(150_000));
    const seeded = await studentWithAttempt(request);
    try {
      await loginAs(page, 'profesor');
      await page.goto(`/portal/reportes?grupo=${seeded.groupId}`);
      // Sin un caso elegido el reporte del grupo no trae estudiantes (el consolidado «todos los casos» no existe aún en el servidor).
      await page.getByLabel(/^Caso de simulación/).selectOption({ index: 1 });
      const link = page.getByRole('link', { name: new RegExp(seeded.studentName) });
      await expect(link).toBeVisible({ timeout: scaled(30_000) });
      await link.click();

      await expect(page).toHaveURL(new RegExp(`/portal/reportes/estudiante/${seeded.studentId}\\?grupo=${seeded.groupId}&caseVersionId=\\d+`));
      await expect(page.getByRole('heading', { level: 1, name: `Reporte de ${seeded.studentName}` })).toBeVisible({ timeout: scaled(15_000) });
      await expect(page.locator('.re-filter')).toContainText('Solo del caso');
      await expect(page.locator('.re-coverage')).toHaveText('Mostrando 1 de 1 intento');
      await expect(page.getByRole('button', { name: 'Ver más intentos' })).toHaveCount(0);

      const row = page.locator('tbody tr').first();
      await expect(row).toContainText('En curso');
      await expect(row.locator('td').last(), 'un intento abierto no tiene tiempo de reloj').toHaveText('—');
      await settle(page);
      expect(await blockingViolations(page, 'app-reporte-estudiante')).toEqual([]);

      await page.getByRole('link', { name: 'Volver a los reportes' }).click();
      await expect(page).toHaveURL(new RegExp(`/portal/reportes\\?grupo=${seeded.groupId}&caseVersionId=\\d+$`));
      await expect(link, 'vuelve al MISMO corte: el estudiante sigue en la tabla').toBeVisible({ timeout: scaled(30_000) });
    } finally {
      await seeded.cleanup();
    }
  });

  test('un docente solo ve a los estudiantes de SUS grupos: el servidor responde 403 a otro docente y el administrador sí lo ve', async ({ request }) => {
    const seeded = await studentWithAttempt(request);
    try {
      const stamp = Date.now().toString(36);
      const other = { email: `otra-docente-${stamp}@siep.test`, password: `Clave-${stamp}-2026` };
      const admin = { Authorization: `Bearer ${await apiToken(request, ADMIN.email, ADMIN.password)}` };
      const created = await request.post('/api/admin/users', { headers: admin, data: { ...other, nombre: 'Otra', apellido: stamp, role: 'PROFESOR', activo: true } });
      expect(created.status(), 'crear a la otra docente').toBeLessThan(300);

      const outsider = { Authorization: `Bearer ${await apiToken(request, other.email, other.password)}` };
      const denied = await request.get(`/api/reportes/estudiante/${seeded.studentId}`, { headers: outsider });
      expect(denied.status(), 'otra docente').toBe(403);
      expect((await request.get(`/api/reportes/estudiante/${seeded.studentId}`, { headers: seeded.teacher })).status(), 'su docente').toBe(200);
      const asAdmin = await request.get(`/api/reportes/estudiante/${seeded.studentId}`, { headers: admin });
      expect(asAdmin.status(), 'el administrador').toBe(200);
      expect((await asAdmin.json()).data.coverage).toEqual({ shown: 1, total: 1 });
    } finally {
      await seeded.cleanup();
    }
  });
});
