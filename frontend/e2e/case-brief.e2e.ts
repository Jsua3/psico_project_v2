import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { assignCase, createPublishedCase, retireCase } from './support/case-fixtures';
import type { AssignmentRecord, AssignmentWindow, CaseFixtureOptions } from './support/case-fixtures';
import { assertQualityState } from './support/quality-gates';
import { loginStudent } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Ficha del caso antes de empezar (plan visual F10-1; RF-16, CU-07; contrato C8) contra la pila real: la pantalla pinta
 * lo que el servidor devuelve, **no crea el intento** y «Comenzar» abre el juego, donde sigue el aviso de contenido
 * (ETH-01). Los datos salen de `GET /api/simulation/cases/{id}/brief`, así que la prueba no inventa el contenido.
 */
const STUDENT = {
  email: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
  password: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
};

interface Brief {
  caseVersionId: number;
  title: string;
  context: string;
  characters: Array<{ id: number; displayName: string; roleLabel: string }>;
  learningObjectives: string[];
  hasSensitiveContent: boolean;
  access: { allowed: boolean };
}

async function api(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: STUDENT });
  expect(login.status(), 'login del estudiante por API').toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
  return {
    cases: async () => ((await (await request.get('/api/simulation/cases', { headers })).json()).data ?? []) as Array<{ caseVersionId: number }>,
    brief: async (id: number) => (await (await request.get(`/api/simulation/cases/${id}/brief`, { headers })).json()).data as Brief,
    attempts: async () => (((await (await request.get('/api/simulation/attempts/history', { headers })).json()).data ?? []) as unknown[]).length,
  };
}

const consentDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
const resumeButton = (page: Page) =>
  page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });

// req: RF-16, CU-07, RN-07
test('la ficha pinta lo que devuelve el servidor, no crea el intento y «Comenzar» abre el aviso de contenido', async ({ page, request }) => {
  const student = await api(request);
  const caseVersionId = (await student.cases())[0].caseVersionId;
  const brief = await student.brief(caseVersionId);
  expect(brief.access.allowed, 'el estudiante de la semilla tiene el caso abierto').toBe(true);

  const attemptPosts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST' && /\/api\/simulation\/attempts(\?|$)/.test(req.url())) attemptPosts.push(req.url());
  });
  const attemptsBefore = await student.attempts();

  await loginStudent(page);
  await page.goto(`/portal/simulador/${caseVersionId}/ficha`);
  await expect(page.getByRole('heading', { level: 1, name: brief.title })).toBeVisible({ timeout: scaled(30_000) });

  if (brief.context.trim()) await expect(page.getByRole('heading', { level: 2, name: 'Contexto' })).toBeVisible();
  await expect(page.locator('.brief-objective')).toHaveText(brief.learningObjectives);
  await expect(page.locator('.brief-character h3')).toHaveText(brief.characters.map(character => character.displayName));
  if (brief.hasSensitiveContent) await expect(page.locator('.brief-sensitive')).toContainText('Salida segura');

  expect(attemptPosts, 'ver la ficha no inicia ningún intento').toEqual([]);
  expect(await student.attempts(), 'ni deja un intento nuevo en el historial').toBe(attemptsBefore);

  await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+$/, { timeout: scaled(30_000) });
  // Con un intento abierto que dejó otra prueba, el juego ofrece reanudar; si no, va directo al aviso de contenido.
  await expect(consentDialog(page).or(resumeButton(page)).first()).toBeVisible({ timeout: scaled(30_000) });
});

// req: RF-16, RNF-04, BLOQUE-H
test('la ficha se maneja solo con teclado: «Comenzar» y «Volver al catálogo» son paradas de tabulación', async ({ page, request }) => {
  const caseVersionId = (await (await api(request)).cases())[0].caseVersionId;
  await loginStudent(page);
  await page.goto(`/portal/simulador/${caseVersionId}/ficha`);
  const start = page.getByRole('button', { name: 'Comenzar', exact: true });
  const back = page.getByRole('button', { name: 'Volver al catálogo', exact: true });
  await expect(start).toBeVisible({ timeout: scaled(30_000) });

  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/portal\/simulador$/, { timeout: scaled(30_000) });
});

// req: RF-16
test('un caso que no existe dice que no lo encuentra, sin culpar a la red, y deja volver al catálogo', async ({ page }) => {
  await loginStudent(page);
  await page.goto('/portal/simulador/999999/ficha');
  await expect(page.getByText('No encontramos este caso')).toBeVisible({ timeout: scaled(30_000) });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver al catálogo', exact: true }).click();
  await page.waitForURL(/\/portal\/simulador$/, { timeout: scaled(30_000) });
});

// Datos controlados: un caso publicado con su ficha completa y asignado al grupo del estudiante de la semilla (C7, C8).
test.describe('@ficha con datos controlados (caso creado y asignado por la API)', () => {
  const created: Array<{ caseVersionId: number; records: AssignmentRecord[] }> = [];
  test.afterEach(async ({ request }) => {
    for (const item of created.splice(0)) await retireCase(request, item.caseVersionId, item.records);
  });

  async function publishAndAssign(request: APIRequestContext, options: CaseFixtureOptions, window: AssignmentWindow = {}) {
    const fixture = await createPublishedCase(request, options);
    const record = { caseVersionId: fixture.caseVersionId, records: [] as AssignmentRecord[] };
    created.push(record);
    record.records.push(await assignCase(request, fixture.caseVersionId, window));
    return fixture;
  }

  const base = (title: string): CaseFixtureOptions => ({
    title,
    context: 'Una joven llega a urgencias acompañada de su abuela después de un episodio de violencia.',
    learningObjectives: ['Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.'],
    characters: [
      { characterKey: 'enfermera', displayName: 'Enfermera de urgencias', roleLabel: 'Personal de salud', portraitKey: 'enfermera-urgencias' },
      { characterKey: 'abuela', displayName: 'Abuela de la niña', roleLabel: 'Familiar acompañante', portraitKey: 'familia-duelo' },
    ],
    sensitive: true,
  });

  // req: RF-16, CU-07, RF-07
  test('contexto, objetivos y personajes con su retrato del kit a ×3, el aviso de contenido sensible y «Comenzar» habilitado', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const fixture = await publishAndAssign(request, base(`Ficha completa e2e ${Date.now()}`));

    await loginStudent(page);
    await page.goto(`/portal/simulador/${fixture.caseVersionId}/ficha`);
    await expect(page.getByRole('heading', { level: 1, name: fixture.title })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Contexto', 'Objetivos de aprendizaje', 'Personajes']);
    await expect(page.locator('.brief-context')).toContainText('Una joven llega a urgencias');
    await expect(page.locator('.brief-objective')).toHaveText(['Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.']);
    await expect(page.locator('.brief-character h3')).toHaveText(['Enfermera de urgencias', 'Abuela de la niña']);
    await expect(page.locator('.brief-character__role')).toHaveText(['Personal de salud', 'Familiar acompañante']);

    // El retrato sale del kit (decorativo): una imagen de retrato por personaje, sin que el nombre dependa de ella.
    const portraits = page.locator('.brief-character app-kit-figure .kit-figure');
    await expect(portraits).toHaveCount(2);
    for (const portrait of await portraits.all()) {
      await expect(portrait).toHaveAttribute('aria-hidden', 'true');
      await expect(portrait).toHaveCSS('background-image', /portrait/);
    }
    await expect(page.locator('.brief-sensitive')).toContainText('Salida segura');
    await expect(page.getByRole('button', { name: 'Comenzar', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.brief-access')).toHaveCount(0);
    // WCAG 2.1 AA sin hallazgos serios y sin desbordes, con el retrato del kit y el aviso sensible pintados.
    await assertQualityState(page, test.info(), 'ficha del caso completa');
  });

  // req: RN-04, RF-15, RF-16
  test('un caso que aún no abre dice cuándo y deja «Comenzar» deshabilitado con su motivo', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const fixture = await publishAndAssign(request, base(`Ficha aún no abre e2e ${Date.now()}`), { opensAt: '2030-03-04T08:00:00' });

    await loginStudent(page);
    await page.goto(`/portal/simulador/${fixture.caseVersionId}/ficha`);
    await expect(page.getByRole('heading', { level: 1, name: fixture.title })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.locator('.brief-access')).toContainText('Aún no abre');
    await expect(page.locator('.brief-access')).toContainText(/4 de mar/);
    const start = page.getByRole('button', { name: 'Comenzar', exact: true });
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    // Playwright no hace clic en un control `aria-disabled` salvo con `force`: aquí se quiere comprobar que el clic no hace nada.
    await start.click({ force: true });
    await expect(page).toHaveURL(/\/ficha$/);
    await assertQualityState(page, test.info(), 'ficha del caso con acceso bloqueado');
  });

  // req: RN-04, RF-15, RF-16
  test('un caso que ya cerró lo dice, y no se puede comenzar', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const fixture = await publishAndAssign(request, base(`Ficha cerrada e2e ${Date.now()}`), { opensAt: '2020-01-01T00:00:00', closesAt: '2020-02-01T00:00:00' });

    await loginStudent(page);
    await page.goto(`/portal/simulador/${fixture.caseVersionId}/ficha`);
    await expect(page.getByRole('heading', { level: 1, name: fixture.title })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.locator('.brief-access')).toContainText('Ya cerró');
    await expect(page.getByRole('button', { name: 'Comenzar', exact: true })).toHaveAttribute('aria-disabled', 'true');
  });
});
