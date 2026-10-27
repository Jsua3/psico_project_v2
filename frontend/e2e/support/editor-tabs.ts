import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { loginAs } from './screen-tour';
import { scaled } from './time-scale';

/** Las pestañas del editor de casos, en el orden en que se ven. «Mundo» y «Vista previa» cargan Konva y Phaser. */
export const EDITOR_TABS = ['Grafo DAG', 'Mapas', 'Objetos', 'Herramientas', 'Rúbricas', 'Checklist ético', 'Revisión', 'Mundo', 'Vista previa'] as const;

type Json = Record<string, any>;

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function npc(): Json {
  return {
    key: 'npc-enfermera', label: 'Enfermera', type: 'PERSON', x: 160, y: 160, width: 48, height: 48, zIndex: 0,
    facing: 'down', colorHex: '#4FA3A5', icon: 'psychology', shortCode: 'ENF', collision: false, visible: true,
    interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {},
    movementPattern: { type: 'patrol', points: [[160, 160], [320, 160]] }, metadata: {},
  };
}

function door(): Json {
  return {
    key: 'puerta-salida', label: 'Puerta', type: 'EXIT', x: 480, y: 96, width: 48, height: 48, zIndex: 0,
    facing: 'down', colorHex: '#A85064', icon: 'door_open', shortCode: 'PUE', collision: false, visible: true,
    interactionPrompt: 'Salir', interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {},
    movementPattern: {}, metadata: {},
  };
}

/**
 * Crea por API un borrador PROPIO con el mundo completo —una persona con ruta y diálogo con una opción, una puerta y una
 * zona de colisión— para que las sondas vean el inspector COMPLETO y no dependan de lo que haya en la base ni de lo
 * que dejaron otras pruebas (el primer caso de la lista es el más reciente, normalmente un borrador vacío).
 */
export async function createRichCase(request: APIRequestContext, token: string): Promise<{ caseVersionId: number; title: string; nodeTitle: string }> {
  const created = await request.post('/api/authoring/cases', { headers: bearer(token), data: { title: `Sondas del editor ${Date.now()}` } });
  expect(created.status(), 'crear el caso de las sondas').toBe(200);
  const view = (await created.json()).data;
  const id: number = view['caseVersionId'];
  const node: Json = view['nodes'][0];
  const current = (await (await request.get(`/api/authoring/cases/${id}/world-editor?nodeId=${node['id']}`, { headers: bearer(token) })).json()).data;
  const saved = await request.put(`/api/authoring/cases/${id}/world?nodeId=${node['id']}`, {
    headers: bearer(token),
    data: {
      revision: current['revision'],
      map: current['map'],
      objects: [npc(), door()],
      collisionZones: [{ key: 'zona-mesa', label: 'Mesa', x: 224, y: 224, width: 96, height: 64 }],
      dialogues: [{
        key: 'dialogo-enfermera', mapObjectKey: 'npc-enfermera', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
        lines: [{ order: 1, speakerName: 'Enfermera', text: 'Buenas tardes.', emotion: 'neutral' }],
        choices: [{ key: 'saludar', text: 'Saludar', decisionOptionId: null, requiredToolCode: null, effect: {}, displayOrder: 1 }],
      }],
      clinicalTools: [],
    },
  });
  expect(saved.status(), 'guardar el mundo de las sondas').toBe(200);
  return { caseVersionId: id, title: view['title'], nodeTitle: node['title'] };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Entra como administrador a un caso propio con el mundo completo (`createRichCase`) y recorre las pestañas del
 * editor, llamando a `visit` en cada una ya asentada. En «Mundo» elige el nodo y selecciona con el teclado la persona
 * con ruta y diálogo, y exige verla (su inspector con diálogo y ruta): una sonda que audita un inspector vacío lo daría
 * por limpio sin haber mirado nada.
 */
export async function visitEditorTabs(
  page: Page, request: APIRequestContext, visit: (tab: (typeof EDITOR_TABS)[number]) => Promise<void>,
): Promise<void> {
  const token: string = (await (await request.post('/api/auth/login', { data: ADMIN })).json()).data.token;
  const version = await createRichCase(request, token);

  await loginAs(page, 'admin');
  await page.goto(`/portal/casos/${version.caseVersionId}/editor-anterior`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: scaled(30_000) });
  for (const tab of EDITOR_TABS) {
    await page.getByRole('tab', { name: tab }).click();
    if (tab === 'Mundo') {
      await page.getByRole('button', { name: new RegExp(`${escape(version.nodeTitle)}\\s+\\(`) }).click();
      await expect(page.getByRole('heading', { name: 'Sala', level: 3 })).toBeVisible({ timeout: scaled(15_000) });
      await page.locator('.we-konva-host').focus();
      await page.keyboard.press('PageDown');
      await expect(page.getByRole('heading', { name: /^Objeto: Enfermera/ })).toBeVisible({ timeout: scaled(10_000) });
      await expect(page.getByRole('button', { name: 'Agregar línea' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Quitar el punto 1' })).toBeVisible();
    }
    if (tab === 'Vista previa') await expect(page.locator('app-world-preview [data-world-ready="true"]')).toHaveCount(1, { timeout: scaled(30_000) });
    await page.waitForTimeout(400);
    await visit(tab);
  }
}
