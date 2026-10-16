import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { loginAs } from './screen-tour';
import { scaled } from './time-scale';

/** Las pestañas del editor de casos, en el orden en que se ven. «Mundo» y «Vista previa» cargan Konva y Phaser. */
export const EDITOR_TABS = ['Grafo DAG', 'Mapas', 'Objetos', 'Herramientas', 'Rúbricas', 'Checklist ético', 'Mundo', 'Vista previa'] as const;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Entra como administrador al primer caso de la lista (el de demostración trae un mundo con personas, diálogos, zonas
 * y puertas) y recorre las pestañas del editor, llamando a `visit` en cada una ya asentada. En «Mundo» elige el primer
 * nodo y selecciona un objeto con el teclado para que el inspector esté a la vista.
 */
export async function visitEditorTabs(
  page: Page, request: APIRequestContext, visit: (tab: (typeof EDITOR_TABS)[number]) => Promise<void>,
): Promise<void> {
  const admin = { email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!' };
  const token: string = (await (await request.post('/api/auth/login', { data: admin })).json()).data.token;
  const headers = { Authorization: `Bearer ${token}` };
  const list = (await (await request.get('/api/authoring/cases', { headers })).json()).data as Array<Record<string, any>>;
  const version = list[0];
  const detail = (await (await request.get(`/api/authoring/cases/${version['caseVersionId']}/editor`, { headers })).json()).data;
  const node = detail['nodes'][0];

  await loginAs(page, 'admin');
  await page.goto(`/portal/casos/${version['caseVersionId']}/editor`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: scaled(30_000) });
  for (const tab of EDITOR_TABS) {
    await page.getByRole('tab', { name: tab }).click();
    if (tab === 'Mundo') {
      await page.getByRole('button', { name: new RegExp(`${escape(String(node['title']))}\\s+\\(`) }).click();
      await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });
      await page.locator('.we-konva-host').focus();
      await page.keyboard.press('PageDown');
    }
    if (tab === 'Vista previa') await expect(page.locator('app-world-preview [data-world-ready="true"]')).toHaveCount(1, { timeout: scaled(30_000) });
    await page.waitForTimeout(400);
    await visit(tab);
  }
}
