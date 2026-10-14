import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';

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
