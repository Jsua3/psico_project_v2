import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
