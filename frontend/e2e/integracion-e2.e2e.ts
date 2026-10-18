import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { nameStamp, setOwnPassword } from './support/own-password';
import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

/** Espera a que terminen las animaciones FINITAS (Axe mide el contraste a media entrada de un fundido). */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const end = animation.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end);
    });
    await Promise.race([
      Promise.allSettled(finite.map(animation => animation.finished)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  });
  await page.waitForTimeout(150);
}

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Integración de E2 («Roles, casos y cuentas») con las pantallas de F7 (plan visual F7b), contra el servidor REAL de la
 * base desechable: sin `page.route`. La línea base del árbol integrado sin adaptar pasó 181/181 porque las pruebas de
 * docencia simulan la red; estas no, así que ven lo que el servidor de E2 contesta de verdad.
 */
const PERMISSION_NOTICE = 'No tienes permisos para realizar esta acción.';

/** Respuestas 403 que el portal recibió desde que empezó a escuchar (cada una dispara el aviso de permiso global). */
function collectForbidden(page: Page): string[] {
  const forbidden: string[] = [];
  page.on('response', response => {
    if (response.status() === 403 && response.url().includes('/api/')) forbidden.push(new URL(response.url()).pathname);
  });
  return forbidden;
}

// req: ED-5, RNF-002
test.describe('@integracion-e2 el administrador no juega (ED-5)', () => {
  test('su panel carga sin pedir nada que el servidor le niegue: ningún 403 ni aviso de permiso', async ({ page }) => {
    const forbidden = collectForbidden(page);
    await loginAs(page, 'admin');
    await page.goto('/portal/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración académica' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(forbidden).toEqual([]);
    await expect(page.getByText(PERMISSION_NOTICE)).toHaveCount(0);
    await expect(page.getByText('Retoma tu caso')).toHaveCount(0);
  });

  test('la sala y «Mi personaje» lo llevan a «Sin permiso», y el catálogo no le ofrece jugar', async ({ page }) => {
    const forbidden = collectForbidden(page);
    await loginAs(page, 'admin');
    for (const path of ['/portal/jugar', '/portal/personaje']) {
      await page.goto(path);
      await page.waitForURL(/\/portal\/sin-permiso/);
      await expect(page.getByRole('heading', { level: 1, name: 'Sin permiso' })).toBeVisible();
    }
    await page.goto('/portal/simulador');
    const firstCard = page.locator('.case-card').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /Iniciar|Continuar|Abrir caso/ })).toHaveCount(0);
    await expect(firstCard.getByRole('button', { name: 'Editor visual' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Mi personaje' })).toHaveCount(0);
    expect(forbidden).toEqual([]);
  });
});

/**
 * E2-9 (RN-10): cambio de contraseña obligatorio. La BD desechable no trae cuentas con contraseña temporal (la temporal
 * sale por correo al aprobar), así que `/auth/me` se simula con `mustChangePassword` y el 403 que el servidor daría a
 * cualquier otra orden; lo demás (guardias, pantalla, Axe) es el navegador real.
 */
async function withTemporaryPassword(page: Page): Promise<{ changes: unknown[] }> {
  const changes: unknown[] = [];
  let changed = false;
  await loginAs(page, 'estudiante');
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, data: { ...body.data, mustChangePassword: !changed } } });
  });
  await page.route('**/api/auth/change-password', route => {
    changes.push(route.request().postDataJSON());
    changed = true;
    return route.fulfill({ json: { success: true, message: 'Contraseña actualizada', data: null } });
  });
  return { changes };
}

// req: RN-10, RNF-01
test.describe('@integracion-e2 cambio de contraseña obligatorio (E2-9)', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`el portal no se abre con la contraseña temporal: va a «Cambia tu contraseña» y vuelve al destino (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { changes } = await withTemporaryPassword(page);
      await page.goto('/portal/simulador');
      await page.waitForURL(/\/cambiar-contrasena\?returnUrl=%2Fportal%2Fsimulador/);
      await expect(page.getByRole('heading', { level: 1, name: 'Cambia tu contraseña temporal' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
      await settle(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-change-password')).toEqual([]);

      await page.locator('#cambio-actual').fill('Estudiante123!');
      await page.locator('#cambio-nueva').fill('corta');
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await expect(page.getByText('La nueva contraseña debe tener al menos 10 caracteres.')).toBeVisible();
      expect(changes).toEqual([]);

      await page.locator('#cambio-nueva').fill('Nueva-clave-2026');
      await page.locator('#cambio-confirmar').fill('Nueva-clave-2026');
      await page.getByRole('button', { name: 'Guardar contraseña' }).click();
      await page.waitForURL(/\/portal\/simulador$/);
      expect(changes).toEqual([{ currentPassword: 'Estudiante123!', newPassword: 'Nueva-clave-2026' }]);
    });
  }

  test('un 403 PASSWORD_CHANGE_REQUIRED en pleno portal lleva a la pantalla, sin «No tienes permisos»', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.route('**/api/simulation/attempts/history', route => route.fulfill({
      status: 403,
      json: { success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña temporal antes de continuar.' },
    }));
    await page.goto('/portal/dashboard');
    await page.waitForURL(/\/cambiar-contrasena\?returnUrl=%2Fportal%2Fdashboard/);
    await expect(page.getByRole('heading', { level: 1, name: 'Cambia tu contraseña temporal' })).toBeVisible();
    await expect(page.getByText(PERMISSION_NOTICE)).toHaveCount(0);
  });
});

const PENDING_USERS = [
  { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true, pendingApproval: false, mustChangePassword: false },
  { id: 7, email: 'carla@siep.test', nombre: 'Carla', apellido: 'Nueva', role: 'ESTUDIANTE', activo: false, pendingApproval: true, mustChangePassword: false },
  { id: 8, email: 'dario@siep.test', nombre: 'Darío', apellido: 'Nuevo', role: 'ESTUDIANTE', activo: false, pendingApproval: true, mustChangePassword: false },
];

/** Usuarios con dos cuentas importadas pendientes (E2-9). La aprobación real manda un correo: se simula su respuesta. */
async function openUsersWithPending(page: Page): Promise<{ approvals: unknown[] }> {
  const approvals: unknown[] = [];
  await loginAs(page, 'admin');
  await page.route('**/api/admin/users', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { success: true, data: approvals.length ? PENDING_USERS.map(user => ({ ...user, activo: true, pendingApproval: false })) : PENDING_USERS } })
    : route.continue());
  await page.route('**/api/admin/users/approve', route => {
    approvals.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, message: 'Cuentas procesadas', data: { approved: 2, approvedIds: [7, 8], skipped: [], emailed: 2, failed: [] } } });
  });
  await page.route('**/api/admin/access-requests**', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/portal/admin/usuarios');
  return { approvals };
}

// req: RN-10, RNF-01
test.describe('@integracion-e2 cuentas pendientes de aprobación (E2-9)', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`se distinguen de las inactivas y se aprueban por lote; sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const { approvals } = await openUsersWithPending(page);
      await expect(page.getByRole('heading', { level: 2, name: 'Cuentas por aprobar' })).toBeVisible();
      await expect(page.getByRole('row', { name: /Carla Nueva/ }).getByText('Pendiente de aprobación')).toBeVisible();
      await settle(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-admin-users')).toEqual([]);

      await page.getByRole('button', { name: 'Aprobar pendientes (2)' }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog.getByRole('heading', { name: 'Aprobar cuentas pendientes' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Aprobar' }).click();
      await expect.poll(() => approvals).toEqual([{ userIds: [7, 8] }]);
      await expect(page.getByRole('heading', { level: 2, name: 'Cuentas por aprobar' })).toHaveCount(0);
    });
  }

  test('la hoja de usuario pide 10 caracteres como el servidor', async ({ page }) => {
    await openUsersWithPending(page);
    await page.getByRole('button', { name: 'Nuevo usuario' }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Mínimo 10 caracteres.')).toBeVisible();
  });
});

const STUDENT_EMAIL = process.env['E2E_STUDENT_EMAIL'] ?? 'estudiante@psychosim.edu.co';

/** Token por API (login real contra la BD desechable). */
async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.status(), `login por API de ${email}`).toBe(200);
  return (await response.json()).data.token;
}

/** El docente crea un grupo propio (código único por corrida) e invita al estudiante semilla. */
async function teacherInvitesStudent(request: APIRequestContext): Promise<{ groupId: number; groupName: string; headers: Record<string, string> }> {
  const token = await apiToken(request, process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co', process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!');
  const headers = { Authorization: `Bearer ${token}` };
  const stamp = Date.now().toString(36);
  const groupName = `Invitaciones e2e ${stamp}`;
  const created = await request.post('/api/grupos', { headers, data: { nombre: groupName, codigo: `INV-${stamp}` } });
  expect(created.status(), 'crear grupo').toBeLessThan(300);
  const groupId = (await created.json()).data.id as number;
  const invited = await request.post(`/api/grupos/${groupId}/estudiantes`, { headers, data: { email: STUDENT_EMAIL } });
  expect(invited.status(), 'invitar por correo').toBeLessThan(300);
  return { groupId, groupName, headers };
}

async function membershipOf(request: APIRequestContext, groupId: number, headers: Record<string, string>): Promise<string | undefined> {
  const response = await request.get(`/api/grupos/${groupId}/estudiantes`, { headers });
  const rows = (await response.json()).data as Array<{ email: string; membershipStatus: string }>;
  return rows.find(row => row.email === STUDENT_EMAIL)?.membershipStatus;
}

// req: SIEP-RF-04, D-14, RNF-04
test.describe('@integracion-e2 bandeja de invitaciones (E2-10, C5)', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`el docente invita, el estudiante lo ve en su panel, acepta y puede salir; contra el servidor real (${viewport.width})`, async ({ page, request }) => {
      await page.setViewportSize(viewport);
      const { groupId, groupName, headers } = await teacherInvitesStudent(request);
      try {
        expect(await membershipOf(request, groupId, headers)).toBe('INVITED');
        const forbidden = collectForbidden(page);

        await loginAs(page, 'estudiante');
        await page.goto('/portal/dashboard');
        const notice = page.locator('.sd-invitations');
        await expect(notice).toContainText('sin responder');
        await notice.getByRole('link', { name: 'Ver invitaciones' }).click();
        await page.waitForURL(/\/portal\/invitaciones$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Invitaciones' })).toBeVisible();

        const item = page.locator('.inv-item').filter({ hasText: groupName });
        await expect(item.getByText('Pendiente')).toBeVisible();
        await settle(page);
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
        expect(await blockingViolations(page, 'app-invitations')).toEqual([]);

        await item.getByRole('button', { name: `Aceptar la invitación a ${groupName}` }).click();
        await expect(item.getByText('Miembro')).toBeVisible();
        await expect.poll(() => membershipOf(request, groupId, headers)).toBe('ACTIVE');

        // Revisión de F7b: aceptar cambia los casos del estudiante; el panel ya guardó su lista (30 s) y el catálogo
        // debe volver a pedirla, no servirla vieja («Aún no tienes casos asignados» con el grupo ya aceptado).
        const catalog = page.waitForRequest(req => req.method() === 'GET' && req.url().includes('/api/simulation/catalog'));
        await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Simulador', exact: true }).click();
        await catalog;
        await page.goBack();
        await page.waitForURL(/\/portal\/invitaciones$/);

        await item.getByRole('button', { name: `Salir del grupo ${groupName}` }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog.getByRole('heading', { name: 'Salir del grupo' })).toBeVisible();
        await dialog.getByRole('button', { name: 'Salir del grupo' }).click();
        await expect(item.getByText('Saliste del grupo')).toBeVisible();
        expect(forbidden).toEqual([]);
      } finally {
        await request.delete(`/api/grupos/${groupId}`, { headers });
      }
    });
  }

  test('el estudiante tiene «Invitaciones» en su barra', async ({ page }) => {
    await loginAs(page, 'estudiante');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Invitaciones' })).toBeVisible();
  });
});

// req: SIEP-CU-04, RNF-002
test.describe('@integracion-e2 rúbricas con dueño (E2-2)', () => {
  test('el docente abre una rúbrica del administrador: guardar dice que es de solo lectura y «Duplicar para personalizar» crea su copia', async ({ page, request }) => {
    const adminToken = await apiToken(request, process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co', process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!');
    const name = `Rúbrica global e2e ${Date.now().toString(36)}`;
    const created = await request.post('/api/rubrics/', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name, description: '', version: '1.0', active: false,
        criteria: [
          { title: 'Criterio A', weight: 60, displayOrder: 1, active: true },
          { title: 'Criterio B', weight: 40, displayOrder: 2, active: true },
        ],
      },
    });
    expect(created.status(), 'crear la rúbrica del administrador').toBe(201);

    await loginAs(page, 'profesor');
    await page.goto('/portal/rubricas');
    await page.locator('.rb-row').filter({ hasText: name }).click();
    await expect(page.locator('app-rubrics input[formControlName="name"]')).toHaveValue(name);
    await expect(page.getByRole('button', { name: 'Predeterminada', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('.rb-readonly')).toContainText('Esta rúbrica es de solo lectura');
    await expect(page.getByText(PERMISSION_NOTICE)).toHaveCount(0);
    await settle(page);
    expect(await blockingViolations(page, 'app-rubrics')).toEqual([]);

    await page.getByRole('button', { name: 'Duplicar para personalizar', exact: true }).click();
    await expect(page.locator('.rb-row').filter({ hasText: `Copia de ${name}` })).toBeVisible();
    await expect(page.locator('.rb-readonly')).toHaveCount(0);
  });
});

/**
 * Un intento ABIERTO de un estudiante propio de esta prueba (no el sembrado: las pruebas del juego comparten su
 * intento): el administrador crea la cuenta, el docente crea un grupo, lo invita y le asigna el caso publicado, el
 * estudiante acepta e inicia el intento, todo por API contra el servidor real.
 */
async function openAttemptOfNewStudent(request: APIRequestContext): Promise<{ attemptId: string; alias: string; cleanup: () => Promise<void> }> {
  const stamp = Date.now().toString(36);
  const email = `reemplazo-${stamp}@siep.test`;
  const password = `Clave-${stamp}-2026`;
  const admin = { Authorization: `Bearer ${await apiToken(request, process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co', process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!')}` };
  const user = await request.post('/api/admin/users', { headers: admin, data: { email, password, nombre: 'Reemplazo', apellido: nameStamp(stamp), role: 'ESTUDIANTE', activo: true } });
  expect(user.status(), 'crear estudiante').toBeLessThan(300);
  const ownPassword = await setOwnPassword(request, email, password); // S1-5: la clave que fija un ADMIN es temporal

  const { groupId, headers: teacher } = await (async () => {
    const token = await apiToken(request, process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co', process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!');
    const headers = { Authorization: `Bearer ${token}` };
    const created = await request.post('/api/grupos', { headers, data: { nombre: `Reemplazo e2e ${stamp}`, codigo: `REP-${stamp}` } });
    expect(created.status(), 'crear grupo').toBeLessThan(300);
    return { groupId: (await created.json()).data.id as number, headers };
  })();
  expect((await request.post(`/api/grupos/${groupId}/estudiantes`, { headers: teacher, data: { email } })).status()).toBeLessThan(300);
  const cases = (await (await request.get('/api/simulation/cases', { headers: teacher })).json()).data as Array<{ caseVersionId: number }>;
  expect(cases.length, 'hay un caso publicado').toBeGreaterThan(0);
  expect((await request.post(`/api/grupos/${groupId}/casos`, { headers: teacher, data: { caseVersionId: cases[0].caseVersionId } })).status()).toBeLessThan(300);

  const student = { Authorization: `Bearer ${await apiToken(request, email, ownPassword)}` };
  expect((await request.post(`/api/me/invitations/${groupId}/accept`, { headers: student, data: {} })).status(), 'aceptar').toBe(200);
  const started = await request.post('/api/simulation/attempts', { headers: student, data: { caseVersionId: cases[0].caseVersionId } });
  expect(started.status(), 'iniciar intento').toBe(200);
  const attemptId = (await started.json()).data.attemptId as string;
  return {
    attemptId,
    alias: `Reemplazo ${nameStamp(stamp)}`,
    cleanup: async () => { await request.delete(`/api/grupos/${groupId}`, { headers: teacher }); },
  };
}

// req: RN-07
test.describe('@integracion-e2 reemplazo docente (E1-2)', () => {
  test('el docente reemplaza un intento abierto con motivo y la traza lo muestra reemplazado; contra el servidor real', async ({ page, request }) => {
    const { attemptId, cleanup } = await openAttemptOfNewStudent(request);
    try {
      await loginAs(page, 'profesor');
      await page.goto(`/portal/docente/trazabilidad?intento=${attemptId}`);
      const replace = page.getByRole('button', { name: 'Reemplazar intento', exact: true });
      await expect(replace).toBeVisible();
      await replace.click();

      const dialog = page.getByRole('dialog', { name: 'Reemplazar intento' });
      await expect(dialog).toBeVisible();
      await settle(page);
      expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);
      await dialog.getByRole('button', { name: 'Reemplazar intento', exact: true }).click();
      await expect(dialog.getByText('Escribe el motivo del reemplazo.')).toBeVisible();
      await dialog.getByRole('textbox', { name: /Motivo del reemplazo/ }).fill('El mundo se trabó en la sala de espera');
      await dialog.getByRole('button', { name: 'Reemplazar intento', exact: true }).click();

      await expect(dialog).toHaveCount(0);
      await expect(page.locator('.tr-overview')).toContainText('Reemplazado por un intento nuevo');
      await expect(page.getByRole('button', { name: 'Reemplazar intento', exact: true })).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
