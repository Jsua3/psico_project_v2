import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { runAxe } from './support/quality-gates';
import { scaled } from './support/time-scale';

/**
 * Portal del estudiante en un navegador real (plan visual F5): lo que jsdom no mide —desborde en un teléfono, Axe
 * WCAG 2.2 AA y el globo de los gráficos con el ratón—. El historial se simula (la base desechable del e2e no tiene
 * intentos del estudiante al empezar), así se ven los estados con datos sin depender del orden de las pruebas.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CASE_TITLE = 'Violencia Familiar y Tentativa de Feminicidio';
const HISTORY = [
  { attemptId: 'p', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'PAUSED', totalDurationSeconds: 900, activeDurationSeconds: 640, startedAt: '2026-10-12T15:20:00Z', endedAt: null },
  { attemptId: 'c2', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'COMPLETED', totalDurationSeconds: 1500, activeDurationSeconds: 1320, startedAt: '2026-10-08T14:00:00Z', endedAt: '2026-10-08T14:25:00Z' },
  { attemptId: 's', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'SAFE_EXITED', totalDurationSeconds: 300, activeDurationSeconds: 280, startedAt: '2026-10-05T10:00:00Z', endedAt: '2026-10-05T10:05:00Z' },
];

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

async function openPanel(page: Page, history: unknown[] = HISTORY): Promise<void> {
  await loginAs(page, 'estudiante');
  await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: history } }));
  await page.goto('/portal/dashboard');
}

// req: RNF-04, BLOQUE-H, RNF-004
test.describe('@estudiante panel', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con historial: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openPanel(page);
      await expect(page.locator('app-student-dashboard').getByRole('heading', { level: 1, name: /^Hola,/ })).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-student-dashboard')).toEqual([]);
    });
  }

  test('primer uso: un solo vacío y Axe sin hallazgos serios', async ({ page }) => {
    await page.route('**/api/simulation/catalog', route => route.fulfill({ json: { success: true, data: [] } }));
    await openPanel(page, []);
    await expect(page.locator('app-student-dashboard ui-empty-state')).toHaveCount(1);
    await expect(page.locator('app-student-dashboard ui-stat, app-student-dashboard table')).toHaveCount(0);
    expect(await blockingViolations(page, 'app-student-dashboard')).toEqual([]);
  });

  test('el progreso dice los intentos completados exactos, no un puntaje', async ({ page }) => {
    await openPanel(page);
    const panel = page.locator('app-student-dashboard');
    await expect(panel.getByText('1 de 3 intentos completados', { exact: true })).toBeVisible();
    expect(await panel.innerText()).not.toMatch(/puntaje|puntos|%/i);
  });

  test('ninguna cifra de desempeño en el panel del estudiante: ni puntaje, ni estrés, ni porcentajes', async ({ page }) => {
    await openPanel(page);
    const panel = page.locator('app-student-dashboard');
    await expect(panel.getByRole('heading', { level: 1, name: /^Hola,/ })).toBeVisible();
    const text = (await panel.innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/puntaje|puntos|estr[eé]s|ranking|desempe[nñ]o|%/i);
    await expect(panel.locator('[role="progressbar"], [role="meter"], progress, meter')).toHaveCount(0);
  });
});

const REPORT = {
  attemptId: 'c2', caseTitle: CASE_TITLE, status: 'COMPLETED', schemaVersion: 3,
  totalDurationSeconds: 1500, phaseDurations: [], toolsUsed: 2, reflectionsCount: 3, safeExitUsed: false, visitedNodeTitles: [],
  ending: {
    key: 'riesgo_persistente', title: 'El riesgo sigue abierto', tone: 'warning',
    message: 'Quedó pendiente alguno de los pasos de protección.',
    reason: ['Cumpliste: Recomendar medidas de protección', 'Faltó: Valorar el riesgo de feminicidio'],
  },
  milestones: {
    done: [{ key: 'medidas_proteccion_activadas', label: 'Recomendar medidas de protección', decisive: true }],
    missing: [{ key: 'riesgo_feminicidio_valorado', label: 'Valorar el riesgo de feminicidio', decisive: true }],
  },
  persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
  recommendations: ['Revisa cómo valorar el riesgo de feminicidio: es un paso del caso que quedó sin cumplir.'],
  summaryMessage: '',
};

async function openCatalog(page: Page): Promise<void> {
  await loginAs(page, 'estudiante');
  await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: HISTORY } }));
  await page.route('**/api/simulation/attempts/*/student-report', route => route.fulfill({ json: { success: true, data: REPORT } }));
  await page.goto('/portal/simulador');
  await expect(page.getByRole('heading', { level: 1, name: 'Tus casos' })).toBeVisible();
}

/** Recorre el lienzo y devuelve el cursor de cada punto (Phaser lo pone en el estilo del canvas al pasar sobre algo). */
async function cursorsOverCanvas(page: Page): Promise<string[]> {
  const canvas = page.locator('app-game-menu canvas');
  const box = (await canvas.boundingBox())!;
  const cursors: string[] = [];
  for (let row = 1; row < 12; row += 1) {
    for (let col = 1; col < 24; col += 1) {
      await page.mouse.move(box.x + (box.width * col) / 24, box.y + (box.height * row) / 12);
      cursors.push(await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor));
    }
  }
  return cursors;
}

// req: BLOQUE-H, RNF-04 (plan visual F5-3)
test.describe('@estudiante sala', () => {
  test('el ratón sobre una puerta abierta pone la mano, sobre una bloqueada «prohibido»; fuera, ninguno', async ({ page }) => {
    await loginAs(page, 'estudiante');
    // Una segunda puerta bloqueada simulada (la base del e2e tiene un solo caso, siempre abierto).
    await page.route('**/api/simulation/catalog', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = [...body.data, { caseVersionId: 999_999, code: 'SIM-X', title: 'Caso bloqueado de prueba', description: '', order: 99, unlocked: false, completed: false, locked: true }];
      await route.fulfill({ response, json: body });
    });
    await page.goto('/portal/jugar');
    await expect(page.locator('app-game-menu canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar al caso/i })).toBeVisible();
    const cursors = await cursorsOverCanvas(page);
    expect(cursors).toContain('pointer');
    expect(cursors).toContain('not-allowed');
    expect(cursors.filter(cursor => cursor !== 'pointer').length).toBeGreaterThan(cursors.length / 2);
  });

  test('«Volver al panel» está a la vista y lleva al panel', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    const exit = page.getByRole('link', { name: 'Volver al panel' });
    await expect(exit).toBeVisible();
    expect((await exit.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await exit.click();
    await page.waitForURL(/\/portal\/dashboard$/);
  });

  test('la ayuda de teclas se lee: ≥ 12 px, fondo propio con contraste AA y dentro de la ventana', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    const help = page.locator('.lobby-help');
    await expect(help).toBeVisible();
    expect(parseFloat(await help.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    // Antes: 13 px al 50 % de opacidad sobre el lienzo, sin fondo. Ahora su propio fondo opaco y ≥ 4,5:1.
    const contrast = await help.evaluate(el => {
      const style = getComputedStyle(el);
      const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const [fr, fg, fb, fa = 1] = rgba(style.color);
      const [br, bgc, bb, ba = 1] = rgba(style.backgroundColor);
      if (ba < 1) return 0;
      const mix = (f: number, b: number) => f * fa + b * (1 - fa);
      const lum = (r: number, g: number, b: number) => [r, g, b]
        .map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const l1 = lum(mix(fr, br), mix(fg, bgc), mix(fb, bb));
      const l2 = lum(br, bgc, bb);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    const box = (await help.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x).toBeGreaterThanOrEqual(8);
  });

  test('si el catálogo falla: error con «Reintentar», y al reintentar la sala carga', async ({ page }) => {
    await loginAs(page, 'estudiante');
    let calls = 0;
    await page.route('**/api/simulation/catalog', route => (++calls === 1 ? route.fulfill({ status: 500, json: {} }) : route.continue()));
    await page.goto('/portal/jugar');
    const alert = page.getByRole('alert').filter({ hasText: 'No pudimos cargar la sala.' });
    await expect(alert).toBeVisible();
    // toBeVisible no mira si algo la tapa: el clic de prueba sí comprueba que recibe el puntero.
    await page.getByRole('link', { name: 'Volver al panel' }).click({ trial: true, timeout: 3_000 });
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('app-game-menu canvas')).toBeVisible();
    await expect(alert).toBeHidden();
    await expect(page.getByRole('button', { name: /entrar al caso/i })).toBeVisible();
  });
});

async function openEditor(page: Page): Promise<void> {
  await loginAs(page, 'estudiante');
  await page.evaluate(() => localStorage.removeItem('psychosim_avatar'));
  await page.goto('/portal/personaje');
  await expect(page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).locator('input[type="radio"]').first()).toBeAttached({ timeout: scaled(15_000) });
}

// req: BLOQUE-H, RNF-04 (plan visual F5-4)
test.describe('@estudiante personaje', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`piel portal con escenario oscuro: sin desborde, opciones ≥ 44 px y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openEditor(page);
      await page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).getByText('Personalizado').click();
      await expect(page.locator('fieldset').filter({ hasText: 'Peinado' })).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      const small = await page.locator('.ce-option').evaluateAll(options => options
        .map(option => option.getBoundingClientRect())
        .filter(box => box.height < 44 || box.width < 44).length);
      expect(small).toBe(0);
      expect(await blockingViolations(page, 'app-character-editor')).toEqual([]);
    });
  }

  test('los grupos son radios nativos: las flechas cambian la elección', async ({ page }) => {
    await openEditor(page);
    const radios = page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).locator('input[type="radio"]');
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(radios.nth(1)).toBeChecked();
    await expect(radios.nth(1)).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toBeVisible();
  });

  test('salir con cambios sin guardar pregunta: «Seguir editando» se queda y «Salir sin guardar» sale', async ({ page }) => {
    await openEditor(page);
    await page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).locator('input[type="radio"]').nth(2).check({ force: true });
    await page.locator('header.cromo').getByRole('link', { name: 'Inicio', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Tienes cambios sin guardar' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/portal\/personaje$/);

    await page.locator('header.cromo').getByRole('link', { name: 'Inicio', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Tienes cambios sin guardar' }).getByRole('button', { name: 'Salir sin guardar' }).click();
    await page.waitForURL(/\/portal\/dashboard$/);
  });
});

// req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H (plan visual F5-5)
test.describe('@estudiante estados de ruta', () => {
  test('abrir por dirección un caso bloqueado vuelve al catálogo con el motivo', async ({ page }) => {
    await loginAs(page, 'estudiante');
    let lockedId = 0;
    // El catálogo de desbloqueo se simula con todo bloqueado (la base del e2e tiene un solo caso, siempre abierto).
    await page.route('**/api/simulation/catalog', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = body.data.map((item: { caseVersionId: number }) => ({ ...item, unlocked: false, locked: true }));
      lockedId = body.data[0].caseVersionId;
      await route.fulfill({ response, json: body });
    });
    // Sin intentos abiertos: uno abierto (que dejara otra prueba) se puede continuar aunque el caso esté bloqueado.
    await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: [] } }));
    await page.goto('/portal/simulador');
    await expect(page.locator('ui-card.cs-tarjeta').first()).toBeVisible({ timeout: scaled(15_000) });
    await page.goto(`/portal/simulador/${lockedId}`);
    await page.waitForURL(new RegExp(`/portal/simulador\\?bloqueado=${lockedId}$`), { timeout: scaled(15_000) });
    // El aviso visible (el servicio de avisos también lo repite en una región de estado para lectores de pantalla).
    await expect(page.getByRole('region', { name: 'Mensajes del sistema' }).getByText(/todavía está bloqueado/)).toBeVisible({ timeout: scaled(15_000) });
    const card = page.locator('ui-card.cs-tarjeta').first();
    await expect(card.getByText('Bloqueado', { exact: true })).toBeVisible();
    await expect(card.getByText(/Se abre al terminar el caso anterior/)).toBeVisible();
    // «Iniciar…» o «Continuar» si otra prueba dejó un intento abierto: bloqueado igual (coherente con la guardia).
    await expect(card.getByRole('button', { name: 'Ver ficha' })).toBeDisabled();
    expect(await blockingViolations(page, 'app-simulation-catalog')).toEqual([]);
  });

  test('la sala sin casos asignados lo dice, sin pasillo vacío, y la salida sigue a mano', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.route('**/api/simulation/catalog', route => route.fulfill({ json: { success: true, data: [] } }));
    await page.goto('/portal/jugar');
    await expect(page.locator('app-game-menu ui-empty-state')).toContainText('Aún no tienes casos asignados');
    await expect(page.locator('app-game-menu canvas')).toHaveCount(0);
    await page.getByRole('link', { name: 'Volver al panel' }).click({ trial: true, timeout: 3_000 });
  });
});

// req: RN-07, RF-24, RNF-04, BLOQUE-H
test.describe('@estudiante catálogo', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con un intento en pausa: «Continuar» en la tarjeta, sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openCatalog(page);
      const card = page.locator('ui-card.cs-tarjeta').filter({ has: page.getByRole('heading', { name: CASE_TITLE, exact: true }) });
      await expect(card.getByRole('button', { name: 'Continuar' })).toBeVisible();
      await expect(card.getByRole('button', { name: /iniciar/i })).toHaveCount(0);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-simulation-catalog')).toEqual([]);
    });
  }

  test('«Ver tu recorrido» abre la página y al volver el foco regresa al catálogo', async ({ page }) => {
    await openCatalog(page);
    const card = page.locator('ui-card.cs-tarjeta').filter({ has: page.getByRole('heading', { name: CASE_TITLE, exact: true }) });
    await card.locator('summary').click();
    await card.getByRole('button', { name: /^Ver tu recorrido del intento del/ }).first().click();
    await expect(page).toHaveURL(/\/cierre\//);
    const cierre = page.locator('app-cierre-caso');
    await expect(cierre.getByRole('heading', { level: 1, name: CASE_TITLE })).toBeVisible();
    await expect(cierre).toContainText('Revisa cómo valorar el riesgo de feminicidio');
    await expect(cierre).toContainText('Recomendar medidas de protección');
    expect((await cierre.innerText()).replace(/\s+/g, ' ')).not.toMatch(/puntaje|puntos|estr[eé]s|ranking|desempe[nñ]o|%/i);
    expect(await blockingViolations(page, 'app-cierre-caso')).toEqual([]);
    await cierre.getByRole('link', { name: 'Tus casos', exact: true }).click();
    await expect(page).toHaveURL(/\/portal\/simulador$/);
    await expect(card.locator('.cs-acciones button').first()).toBeFocused();
  });
});
