import { expect, test } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

import {
  ADMIN, ESTUDIANTE, PROFESOR, apiToken, assignCase, bearer, buildPublishableDraft, createPublishedCase, retireCase, seededGroupId,
} from './support/case-fixtures';
import type { AssignmentRecord } from './support/case-fixtures';
import {
  arrowToTab, expectNoPointer, pressWithKeyboard, resetPointer, selectWithKeyboard, tabTo, trackPointer, typeInto,
} from './support/keyboard';
import { createWorldInputDriver, enterWorld, markFirstTimeHelpSeen, nearbyAction } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Las funciones críticas de §11.3 recorridas SOLO con teclado (plan visual F9-2; RNF-004, WCAG 2.1.1), contra la pila
 * REAL. Cada prueba empieza con `[ID]` (la tabla vive en `support/critical-functions.ts` y su prueba exige que cada
 * función tenga la suya) y demuestra dos cosas: que cada control se alcanza con Tab (`tabTo`, no con un salto de
 * `focus()`) y que no hubo ni un `pointerdown` (`expectNoPointer`). La preparación de los datos va por API; este archivo
 * no usa ninguna API del puntero (lo vigila `critical-functions.spec.ts`).
 */
type Json = Record<string, any>;
type Login = { email: string; password: string };

test.use({ viewport: { width: 1440, height: 900 } });

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const toast = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);
const header = (page: Page) => page.locator('header.cromo');

/** Entra por el formulario de acceso solo con teclas; deja el contador de puntero en marcha desde antes de la primera página. */
async function keyboardLogin(page: Page, who: Login, landing: RegExp = /\/portal\//): Promise<void> {
  await trackPointer(page);
  await markFirstTimeHelpSeen(page);
  await page.goto('/login');
  await typeInto(page, page.locator('#login-email'), who.email);
  await page.keyboard.press('Tab');
  await expect(page.locator('#login-password')).toBeFocused();
  await page.keyboard.type(who.password);
  await page.keyboard.press('Enter');
  await page.waitForURL(landing, { timeout: scaled(30_000) });
}

/** Un destino de la barra principal: Tab hasta su enlace y Enter. */
async function goTo(page: Page, label: string, url: RegExp): Promise<void> {
  await pressWithKeyboard(page, header(page).getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: label, exact: true }));
  await page.waitForURL(url, { timeout: scaled(30_000) });
}

async function createGroup(request: APIRequestContext, name: string, code: string): Promise<number> {
  const professor = await apiToken(request, PROFESOR);
  const response = await request.post('/api/grupos', { headers: bearer(professor), data: { nombre: name, codigo: code } });
  expect([200, 201], `crear el grupo: ${response.status()}`).toContain(response.status());
  return (await response.json()).data.id as number;
}

const groupDetailButton = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Ver detalle de ${name}`) });

// ── Todos ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// req: RNF-004, WCAG 2.1.1
test('[T01] iniciar sesión: Tab hasta el correo y la clave, se escribe y Enter entra', async ({ page }) => {
  await keyboardLogin(page, ESTUDIANTE);
  await expect(header(page).locator('.cuenta-chip__rol')).toHaveText('Estudiante');
  await expectNoPointer(page, 'iniciar sesión');
});

// req: RNF-004, WCAG 2.1.1
test('[T02] cerrar sesión: Tab hasta «Cuenta», Enter abre el menú y Enter en «Cerrar sesión» sale', async ({ page }) => {
  await keyboardLogin(page, PROFESOR);
  const account = header(page).getByRole('button', { name: 'Cuenta' });
  await pressWithKeyboard(page, account);
  const logout = page.getByRole('menuitem', { name: 'Cerrar sesión' });
  await expect(logout).toBeVisible();
  for (let step = 0; step < 6 && !(await logout.evaluate(item => item === document.activeElement)); step += 1) await page.keyboard.press('ArrowDown');
  await expect(logout).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/login/, { timeout: scaled(15_000) });
  await expectNoPointer(page, 'cerrar sesión');
});

// req: RNF-004, WCAG 2.1.1
test('[T03] solicitar acceso: Tab hasta «Solicitar acceso», se llenan los tres campos y Enter envía la solicitud', async ({ page }) => {
  await trackPointer(page);
  await page.goto('/login');
  await pressWithKeyboard(page, page.getByRole('button', { name: 'Solicitar acceso' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitar acceso' })).toBeFocused();
  const id = stamp();
  await typeInto(page, page.locator('#registro-nombre'), 'Camila');
  await page.keyboard.press('Tab');
  await expect(page.locator('#registro-apellido')).toBeFocused();
  await page.keyboard.type('Teclado');
  await page.keyboard.press('Tab');
  await expect(page.locator('#registro-email')).toBeFocused();
  await page.keyboard.type(`camila.${id}@psychosim.edu.co`);
  await page.keyboard.press('Enter');
  await expect(page.locator('.acceso__notice')).toBeVisible({ timeout: scaled(15_000) });
  await expectNoPointer(page, 'solicitar acceso');
});

// req: BLOQUE-H (enlaces de salto), RNF-004
test('[T04] saltar al contenido y a la navegación: los dos enlaces de salto salen con el primer y el segundo Tab', async ({ page }) => {
  await keyboardLogin(page, PROFESOR);
  await page.goto('/portal/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: scaled(30_000) });
  await page.keyboard.press('Tab');
  const toMain = page.getByRole('link', { name: 'Saltar al contenido principal' });
  await expect(toMain).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main-content')).toBeFocused();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: scaled(30_000) });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const toNav = page.getByRole('link', { name: 'Saltar a la navegación' });
  await expect(toNav).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(header(page).locator('.modulo-principal').getByRole('link', { name: 'Panel', exact: true })).toBeFocused();
  await expectNoPointer(page, 'saltar al contenido y a la navegación');
});

// req: RNF-004, WCAG 2.1.1
test('[T05] usar el menú y el menú de cuenta: un destino se abre con Enter y el menú de cuenta con Enter, Esc lo cierra', async ({ page }) => {
  await keyboardLogin(page, PROFESOR);
  await goTo(page, 'Grupos', /\/portal\/grupos/);
  await expect(page.getByRole('heading', { level: 1, name: 'Grupos' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Grupos', exact: true })).toHaveAttribute('aria-current', 'page');

  const account = header(page).getByRole('button', { name: 'Cuenta' });
  await pressWithKeyboard(page, account);
  const logout = page.getByRole('menuitem', { name: 'Cerrar sesión' });
  await expect(logout).toBeVisible();
  await expect(logout).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(logout).toBeHidden();
  await expect(account).toBeFocused();
  await expectNoPointer(page, 'usar el menú y el menú de cuenta');
});

// req: RNF-004, WCAG 2.1.1, WCAG 2.4.3
test('[T06] abrir y cerrar diálogos con el foco correcto: el foco entra, el Tab no sale, Esc cierra y el foco vuelve al disparador', async ({ page, request }) => {
  const name = `Diálogo teclado ${stamp()}`;
  const code = `DT-${stamp()}`;
  await createGroup(request, name, code);
  await keyboardLogin(page, PROFESOR);
  await page.goto('/portal/grupos');
  await expect(groupDetailButton(page, name)).toBeVisible({ timeout: scaled(30_000) });

  const trigger = page.getByRole('button', { name: `Más acciones de ${name}` });
  await pressWithKeyboard(page, trigger);
  const remove = page.getByRole('menuitem', { name: 'Borrar' });
  await expect(remove).toBeVisible();
  for (let step = 0; step < 6 && !(await remove.evaluate(item => item === document.activeElement)); step += 1) await page.keyboard.press('ArrowDown');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'Borrar grupo' }).first();
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement)), { message: 'el foco entra al diálogo' }).toBe(true);
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement)), 'el Tab no sale del diálogo').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(groupDetailButton(page, name)).toBeVisible();
  await expectNoPointer(page, 'abrir y cerrar diálogos');
});

// ── Estudiante ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface FixtureCase { caseVersionId: number; title: string; records: AssignmentRecord[] }

/** Un caso publicado y asignado al grupo del estudiante, con una escena sensible (la ficha y el aviso de contenido aparecen). */
async function studentCase(request: APIRequestContext, label: string, sensitive = false): Promise<FixtureCase> {
  const created = await createPublishedCase(request, {
    title: `${label} ${stamp()}`, context: 'Una mujer llega a urgencias tras una discusión.',
    learningObjectives: ['Validar sin juzgar.'], sensitive,
  });
  const record = await assignCase(request, created.caseVersionId);
  return { caseVersionId: created.caseVersionId, title: created.title, records: [record] };
}

/** Deja un intento del estudiante COMPLETADO en el caso (la única decisión lleva a la escena final). */
async function completeAttempt(request: APIRequestContext, caseVersionId: number): Promise<void> {
  const admin = await apiToken(request, ADMIN);
  const student = await apiToken(request, ESTUDIANTE);
  const editor: Json = (await (await request.get(`/api/authoring/cases/${caseVersionId}/editor`, { headers: bearer(admin) })).json()).data;
  const started = await request.post('/api/simulation/attempts', { headers: bearer(student), data: { caseVersionId } });
  expect(started.status(), 'iniciar el intento').toBe(200);
  const state: Json = (await started.json()).data;
  const decided = await request.post(`/api/simulation/attempts/${state['attemptId']}/decisions`, {
    headers: bearer(student),
    data: { attemptToken: state['attemptToken'], decisionOptionId: (editor['decisions'] as Json[])[0]['id'], requestId: `kb-${stamp()}` },
  });
  expect(decided.status(), `la decisión: ${await decided.text()}`).toBe(200);
}

const caseCard = (page: Page, title: string) => page.locator('.case-card').filter({ hasText: title });

// req: RNF-004, WCAG 2.1.1
test('[E01] abrir el catálogo: Tab hasta «Simulador» y Enter muestra los casos', async ({ page, request }) => {
  const fixture = await studentCase(request, 'Catálogo teclado');
  try {
    await keyboardLogin(page, ESTUDIANTE);
    await goTo(page, 'Simulador', /\/portal\/simulador$/);
    await expect(caseCard(page, fixture.title)).toBeVisible({ timeout: scaled(30_000) });
    await expectNoPointer(page, 'abrir el catálogo');
  } finally {
    await retireCase(request, fixture.caseVersionId, fixture.records);
  }
});

// req: RF-16, CU-07, RNF-004, WCAG 2.1.1
test('[E02 E03] ver la ficha del caso y aceptar el aviso de contenido: el botón del caso, «Comenzar» y «Continuar» se alcanzan con Tab', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const fixture = await studentCase(request, 'Ficha teclado', true);
  try {
    await keyboardLogin(page, ESTUDIANTE);
    await goTo(page, 'Simulador', /\/portal\/simulador$/);
    await pressWithKeyboard(page, caseCard(page, fixture.title).locator('.case-card__actions button').first());
    await page.waitForURL(/\/portal\/simulador\/\d+(\/ficha)?$/, { timeout: scaled(30_000) });
    await expect(page.getByRole('heading', { level: 1, name: fixture.title })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByText('Una mujer llega a urgencias tras una discusión.')).toBeVisible();

    await pressWithKeyboard(page, page.getByRole('button', { name: 'Comenzar', exact: true }));
    const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
    await expect(consent).toBeVisible({ timeout: scaled(30_000) });
    await expect.poll(() => consent.evaluate(element => element.contains(document.activeElement)), { message: 'el foco entra al aviso' }).toBe(true);
    await pressWithKeyboard(page, consent.getByRole('button', { name: /^continuar$/i }));
    // Registrado el aviso, el caso sigue: la introducción (un diálogo) o, si el caso no la trae, el mundo ya listo.
    await expect(consent).toBeHidden({ timeout: scaled(30_000) });
    await expect(page.getByRole('dialog').first().or(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))).toBeVisible({ timeout: scaled(30_000) });
    await expectNoPointer(page, 'ver la ficha y aceptar el aviso');
  } finally {
    await retireCase(request, fixture.caseVersionId, fixture.records);
  }
});

// req: RF-23, CU-13, RNF-004, WCAG 2.1.1
test('[E11 E12] ver el historial y el resultado con su retroalimentación: «Ver resumen» se abre con Enter y Esc devuelve el foco', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const fixture = await studentCase(request, 'Historial teclado');
  try {
    await completeAttempt(request, fixture.caseVersionId);
    await keyboardLogin(page, ESTUDIANTE);
    await goTo(page, 'Simulador', /\/portal\/simulador$/);
    const summary = page.getByRole('button', { name: 'Ver resumen' }).first();
    await expect(summary).toBeVisible({ timeout: scaled(30_000) });
    await pressWithKeyboard(page, summary);
    const report = page.getByRole('dialog');
    await expect(report).toBeVisible();
    await expect.poll(() => report.evaluate(element => element.contains(document.activeElement)), { message: 'el foco entra al resumen' }).toBe(true);
    await expect(report).toContainText(fixture.title);
    await page.keyboard.press('Escape');
    await expect(report).toBeHidden();
    await expect(summary).toBeFocused();
    await expectNoPointer(page, 'ver el historial y el resultado');
  } finally {
    await retireCase(request, fixture.caseVersionId, fixture.records);
  }
});

// req: RNF-004, WCAG 2.1.1
test('[E13] editar el avatar: las flechas eligen, «Guardar» guarda y «Restablecer» deshace', async ({ page }) => {
  await keyboardLogin(page, ESTUDIANTE);
  await goTo(page, 'Mi personaje', /\/portal\/personaje$/);
  const elenco = page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).locator('input[type="radio"]');
  await tabTo(page, elenco.first().or(page.locator('fieldset').filter({ hasText: 'Elige tu personaje' }).locator('input[type="radio"]:checked')));
  const before = await elenco.evaluateAll(items => items.findIndex(item => (item as HTMLInputElement).checked));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toBeVisible();
  const chosen = await elenco.evaluateAll(items => items.findIndex(item => (item as HTMLInputElement).checked));
  expect(chosen, 'la flecha cambió la elección').not.toBe(before);

  await pressWithKeyboard(page, page.getByRole('button', { name: 'Guardar', exact: true }));
  await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toHaveCount(0, { timeout: scaled(15_000) });

  await tabTo(page, elenco.nth(chosen), { backwards: true });
  await page.keyboard.press('ArrowRight');
  await pressWithKeyboard(page, page.getByRole('button', { name: 'Restablecer' }));
  await expect(page.getByRole('status').filter({ hasText: 'Cambios sin guardar' })).toHaveCount(0);
  await expectNoPointer(page, 'editar el avatar');
});

// ── Docente ────────────────────────────────────────────────────────────────────────────────────────────────────────

// req: RF-14, CU-06, RNF-004, WCAG 2.1.1
test('[P01] crear un grupo: Tab hasta el nombre y el código, se escriben y Enter lo crea', async ({ page }) => {
  await keyboardLogin(page, PROFESOR);
  await goTo(page, 'Grupos', /\/portal\/grupos/);
  const name = `Grupo teclado ${stamp()}`;
  const code = `GT-${stamp()}`;
  await typeInto(page, page.getByRole('textbox', { name: /Nombre del grupo/ }), name);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: /Código único/ })).toBeFocused();
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  await expect(toast(page, 'Grupo creado.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(groupDetailButton(page, name)).toBeVisible();
  await expectNoPointer(page, 'crear un grupo');
});

// req: RF-14, CU-06, RNF-004, WCAG 2.1.1
test('[P02] agregar o importar estudiantes: «Invitar a uno» invita por correo y el selector de archivo se abre con Enter', async ({ page, request }) => {
  const name = `Estudiantes teclado ${stamp()}`;
  await createGroup(request, name, `ET-${stamp()}`);
  await keyboardLogin(page, PROFESOR);
  await page.goto('/portal/grupos');
  await pressWithKeyboard(page, groupDetailButton(page, name));

  await pressWithKeyboard(page, page.getByRole('button', { name: 'Invitar a uno' }));
  await typeInto(page, page.getByRole('textbox', { name: /Correo del estudiante/ }), ESTUDIANTE.email);
  await page.keyboard.press('Enter');
  await expect(page.locator('.gl-message')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.gl-message')).not.toHaveClass(/gl-message--error/);

  const chooser = page.waitForEvent('filechooser', { timeout: scaled(15_000) });
  await tabTo(page, page.getByLabel('Archivo de estudiantes (.xlsx)'));
  await page.keyboard.press('Enter');
  await chooser;
  await expectNoPointer(page, 'agregar o importar estudiantes');
});

// req: RF-14, RF-15, CU-06, RNF-004, WCAG 2.1.1, WCAG 2.5.7
test('[P03] asignar un caso: «Asignar un caso», el caso elegido con las flechas y «Asignar» con Enter', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const name = `Asignar teclado ${stamp()}`;
  await createGroup(request, name, `AT-${stamp()}`);
  const created = await createPublishedCase(request, { title: `Asignable teclado ${stamp()}`, context: 'Contexto.', learningObjectives: ['Objetivo.'] });
  try {
    await keyboardLogin(page, PROFESOR);
    await page.goto('/portal/grupos');
    await pressWithKeyboard(page, groupDetailButton(page, name));
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Asignar un caso' }));
    const dialog = page.getByRole('dialog', { name: 'Asignar un caso al grupo' });
    await expect(dialog).toBeVisible();
    await selectWithKeyboard(page, dialog.getByLabel('Caso'), created.title);
    await pressWithKeyboard(page, dialog.getByRole('button', { name: 'Asignar', exact: true }));
    await expect(toast(page, 'Caso asignado al grupo.')).toBeVisible({ timeout: scaled(15_000) });
    await expect(page.locator('.ga-item').filter({ hasText: created.title })).toBeVisible();
    await expectNoPointer(page, 'asignar un caso');
  } finally {
    await retireCase(request, created.caseVersionId);
  }
});

/** El grupo de la docente al que pertenece el estudiante de la semilla y su caso, con un intento abierto o hecho. */
async function seededGroupWithAttempt(request: APIRequestContext): Promise<{ groupLabel: string; caseTitle: string; caseLabel: string }> {
  const professor = await apiToken(request, PROFESOR);
  const student = await apiToken(request, ESTUDIANTE);
  const cases: Json[] = (await (await request.get('/api/simulation/cases', { headers: bearer(student) })).json()).data;
  const started = await request.post('/api/simulation/attempts', { headers: bearer(student), data: { caseVersionId: cases[0]['caseVersionId'] } });
  expect(started.status(), 'iniciar un intento del estudiante').toBe(200);
  const groupId = await seededGroupId(request);
  const groups: Json[] = (await (await request.get('/api/grupos', { headers: bearer(professor) })).json()).data;
  const group = groups.find(item => item['id'] === groupId)!;
  return {
    groupLabel: `${group['nombre']} · ${group['codigo']}`, caseTitle: cases[0]['title'] as string,
    caseLabel: `${cases[0]['title']} · v${cases[0]['semanticVersion']}`,
  };
}

// req: RF-25, RF-26, CU-14, RNF-004, WCAG 2.1.1
test('[P04] ver reportes y exportar CSV: el grupo se elige con las flechas y «Exportar CSV» descarga con Enter', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const { groupLabel, caseLabel } = await seededGroupWithAttempt(request);
  await keyboardLogin(page, PROFESOR);
  await goTo(page, 'Reportes', /\/portal\/reportes/);
  await selectWithKeyboard(page, page.locator('app-reporte-grupo select').first(), groupLabel);
  // Sin un caso elegido el reporte del grupo no trae estudiantes (el consolidado «todos los casos» no existe aún en el servidor).
  await selectWithKeyboard(page, page.getByLabel(/^Caso de simulación/), caseLabel);
  const exportCsv = page.getByRole('button', { name: 'Exportar CSV' });
  await expect(exportCsv).toBeVisible({ timeout: scaled(30_000) });
  const download = page.waitForEvent('download', { timeout: scaled(30_000) });
  await pressWithKeyboard(page, exportCsv);
  expect((await download).suggestedFilename()).toMatch(/\.csv$/i);
  await expectNoPointer(page, 'ver reportes y exportar CSV');
});

// req: SIEP-CU-04, RN-09, RNF-004, WCAG 2.1.1
test('[P05] revisar la traza y calificar con rúbrica: el intento se elige con Enter, el nivel de cada criterio se elige con las flechas y «Guardar evaluación» guarda', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const { caseTitle } = await seededGroupWithAttempt(request);
  await keyboardLogin(page, PROFESOR);
  await goTo(page, 'Trazabilidad', /\/portal\/docente\/trazabilidad/);
  const attempt = page.locator('.tr-attempt').filter({ hasText: caseTitle }).first();
  await expect(attempt).toBeVisible({ timeout: scaled(30_000) });
  await pressWithKeyboard(page, attempt);
  const criteria = page.locator('.tr-criterion');
  await expect(criteria.first()).toBeVisible({ timeout: scaled(30_000) });
  for (let index = 0; index < await criteria.count(); index += 1) {
    await selectWithKeyboard(page, criteria.nth(index).getByLabel('Nivel logrado'), 'Logrado');
  }
  const saved = page.waitForResponse(response => /\/rubric-evaluation$/.test(new URL(response.url()).pathname) && response.request().method() === 'PUT', { timeout: scaled(30_000) });
  await pressWithKeyboard(page, page.getByRole('button', { name: 'Guardar evaluación' }));
  expect((await saved).ok(), 'el servidor aceptó la evaluación').toBe(true);
  await expectNoPointer(page, 'revisar la traza y calificar');
});

// req: SIEP-CU-04, RN-09, RNF-004, WCAG 2.1.1
test('[P06] crear y activar una rúbrica: el nombre y el criterio se escriben, «Guardar» y «Activar» se pulsan con Enter', async ({ page }) => {
  await keyboardLogin(page, PROFESOR);
  await goTo(page, 'Rúbricas', /\/portal\/rubricas/);
  await pressWithKeyboard(page, page.getByRole('button', { name: 'Nueva rúbrica' }));
  const form = page.locator('app-rubrics form').first();
  const name = `Rúbrica teclado ${stamp()}`;
  await typeInto(page, form.getByLabel('Nombre').first(), name);
  const criterion = form.locator('fieldset.criterion').first();
  await typeInto(page, criterion.getByLabel('Nombre'), 'Criterio único');
  await typeInto(page, criterion.getByLabel('Peso %'), '100');
  await pressWithKeyboard(page, form.getByRole('button', { name: 'Guardar' }));
  await expect(page.locator('app-rubrics .rb-row').filter({ hasText: name })).toBeVisible({ timeout: scaled(15_000) });
  const activate = page.getByRole('button', { name: 'Activar', exact: true });
  await expect(activate).not.toHaveAttribute('aria-disabled', 'true');
  await pressWithKeyboard(page, activate);
  await expect(page.locator('app-rubrics .rb-row').filter({ hasText: name }).locator('ui-badge').first()).toContainText(/activa/i, { timeout: scaled(15_000) });
  await expectNoPointer(page, 'crear y activar una rúbrica');
});

// ── Administrador ──────────────────────────────────────────────────────────────────────────────────────────────────

// req: RF-02, RF-03, RNF-004, WCAG 2.1.1
test('[A01] gestionar usuarios y solicitudes: una solicitud se atiende con «Crear usuario» y otra se descarta, todo con Enter', async ({ page, request }) => {
  test.setTimeout(scaled(120_000));
  const id = stamp();
  for (const [nombre, email] of [['Atender', `atender.${id}@psychosim.edu.co`], ['Descartar', `descartar.${id}@psychosim.edu.co`]]) {
    const response = await request.post('/api/auth/access-request', { data: { nombre, apellido: 'Teclado', email } });
    expect([200, 201], `solicitud de ${email}: ${response.status()}`).toContain(response.status());
  }
  await keyboardLogin(page, ADMIN);
  await page.goto('/portal/admin/usuarios');
  const attend = page.locator('.us-request').filter({ hasText: `atender.${id}@` });
  await expect(attend).toBeVisible({ timeout: scaled(30_000) });
  await pressWithKeyboard(page, attend.getByRole('button', { name: 'Crear usuario' }));
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Crear usuario' })).toBeVisible();
  await selectWithKeyboard(page, sheet.getByLabel('Rol'), /Estudiante/);
  await typeInto(page, sheet.getByLabel('Contraseña'), 'ClaveTeclado123!');
  await pressWithKeyboard(page, sheet.getByRole('button', { name: 'Guardar' }));
  await expect(toast(page, 'Usuario creado correctamente.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.us-request').filter({ hasText: `atender.${id}@` })).toHaveCount(0);

  const discard = page.locator('.us-request').filter({ hasText: `descartar.${id}@` });
  await pressWithKeyboard(page, discard.getByRole('button', { name: 'Descartar' }));
  await expect(toast(page, 'Solicitud descartada.')).toBeVisible({ timeout: scaled(15_000) });
  await expect(discard).toHaveCount(0);
  await expectNoPointer(page, 'gestionar usuarios y solicitudes');
});

// req: RF-05, CU-04, RNF-004, WCAG 2.1.1
test('[A02] crear y editar un caso: desde «Mis casos» se elige el lugar y las salas, se crea el caso y se escribe una línea del guion, todo con teclas', async ({ page, request }) => {
  test.setTimeout(scaled(180_000));
  let id = 0;
  try {
    await keyboardLogin(page, ADMIN);
    await page.goto('/portal/casos');
    await pressWithKeyboard(page, page.getByRole('link', { name: 'Crear un caso nuevo' }), { max: 120 });
    await expect(page.getByRole('heading', { level: 1, name: '¿Dónde pasa tu caso?' })).toBeVisible({ timeout: scaled(30_000) });
    await pressWithKeyboard(page, page.getByRole('link', { name: 'Elegir este lugar: Universidad' }), { max: 120 });
    await expect(page.getByRole('heading', { level: 1, name: 'Elige las salas de tu caso' })).toBeVisible({ timeout: scaled(30_000) });
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Usar esta idea: Atención en Bienestar' }), { max: 160 });
    const title = `Caso teclado ${stamp()}`;
    await typeInto(page, page.getByLabel('Nombre del caso'), title, { max: 160 });
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Crear el caso con estas salas' }), { max: 160 });
    await page.waitForURL(/\/portal\/casos\/\d+\/editor/, { timeout: scaled(60_000) });
    await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });
    id = Number(/\/portal\/casos\/(\d+)\/editor/.exec(page.url())![1]);

    // Enter sobre la primera escena del mapa abre su guion; ahí se escribe una línea.
    await pressWithKeyboard(page, page.locator('button.escena').first(), { max: 160 });
    await expect(page.getByRole('heading', { level: 1, name: 'Guion de la escena' })).toBeVisible({ timeout: scaled(30_000) });
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Agregar una línea' }), { max: 200 });
    await typeInto(page, page.getByLabel('Lo que dice, línea 1'), 'Hola, ¿esta es la oficina de Bienestar?', { max: 200 });
    await page.keyboard.press('Tab'); // al salir del campo, el editor guarda
    const admin = await apiToken(request, ADMIN);
    const world: Json = (await (await request.get(`/api/authoring/cases/${id}/editor`, { headers: bearer(admin) })).json()).data;
    const guionDelServidor = async (): Promise<string[]> => {
      const mundo: Json = (await (await request.get(`/api/authoring/cases/${id}/world-editor?nodeId=${world['nodes'][0]['id']}`, { headers: bearer(admin) })).json()).data;
      return mundo['dialogues'].flatMap((d: Json) => d['lines']).map((l: Json) => l['text']);
    };
    await expect.poll(guionDelServidor, { timeout: scaled(30_000), message: 'el servidor guardó la línea' }).toContain('Hola, ¿esta es la oficina de Bienestar?');
    expect(world['title']).toBe(title);
    await expectNoPointer(page, 'crear y editar un caso');
  } finally {
    if (id) await retireCase(request, id);
  }
});

/** Un caso del administrador con tres salas de la universidad (la preparación va por API: el editor copia el lugar al caso en el servidor). */
async function adminCaseFromPlace(request: APIRequestContext, label: string): Promise<{ id: number; title: string; token: string }> {
  const token = await apiToken(request, ADMIN);
  const created = await request.post('/api/authoring/cases', {
    headers: bearer(token),
    data: { title: `${label} ${stamp()}`, description: 'Una persona llega, espera y es escuchada.', lugarId: 'universidad', salas: ['pasillo', 'sala-espera', 'consultorio'] },
  });
  expect(created.status(), 'crear el caso desde la universidad').toBe(200);
  const view: Json = (await created.json()).data;
  return { id: view['caseVersionId'], title: view['title'], token };
}

/** Los objetos de la primera sala del caso, tal como los tiene el servidor. */
async function firstRoomObjects(request: APIRequestContext, id: number, token: string): Promise<Json[]> {
  const editor: Json = (await (await request.get(`/api/authoring/cases/${id}/editor`, { headers: bearer(token) })).json()).data;
  const world: Json = (await (await request.get(`/api/authoring/cases/${id}/world-editor?nodeId=${editor['nodes'][0]['id']}`, { headers: bearer(token) })).json()).data;
  return world['objects'];
}

// req: RNF-04, WCAG 2.1.1, WCAG 2.1.4, WCAG 2.5.7
test('[A03] editar el mapa del caso y la sala: se abre la sala desde el mapa y se agrega, se mueve y se quita una pieza con teclas', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const draft = await adminCaseFromPlace(request, 'Sala teclado');
  try {
    const before = await firstRoomObjects(request, draft.id, draft.token);
    await keyboardLogin(page, ADMIN);
    await page.goto(`/portal/casos/${draft.id}/editor`);
    await expect(page.getByRole('heading', { level: 1, name: /Escenas y caminos/ })).toBeVisible({ timeout: scaled(30_000) });

    // El mapa del caso: una escena se elige con Enter y su sala se abre con el enlace «Abrir sala».
    await pressWithKeyboard(page, page.locator('button.escena').first(), { max: 160 });
    await pressWithKeyboard(page, page.getByRole('link', { name: 'Abrir sala' }), { max: 160 });
    await expect(page.locator('.pieza').first()).toBeVisible({ timeout: scaled(30_000) });
    const piecesBefore = await page.locator('.pieza').evaluateAll(items => items.map(item => item.getAttribute('data-elemento')));

    // Agregar una pieza del catálogo (se pone en el centro de la sala).
    const catalog = page.getByRole('tabpanel').getByRole('button', { name: /^Agregar a la sala: / }).first();
    const added = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/authoring\/cases\/\d+\/world/.test(r.url()), { timeout: scaled(30_000) });
    await pressWithKeyboard(page, catalog, { max: 200 });
    expect((await added).status(), 'agregar la pieza').toBe(200);
    const piecesAfter = await page.locator('.pieza').evaluateAll(items => items.map(item => item.getAttribute('data-elemento')));
    const fresh = piecesAfter.filter(key => !piecesBefore.includes(key));
    expect(fresh, 'la sala tiene una pieza nueva').toHaveLength(1);
    const piece = page.locator(`button.pieza[data-elemento="${fresh[0]}"]`);
    expect((await firstRoomObjects(request, draft.id, draft.token)).length, 'el servidor tiene una pieza más').toBe(before.length + 1);

    // Mover con las flechas: cada pulsación se guarda.
    const origin = await piece.evaluate(item => [parseFloat(item.style.left), parseFloat(item.style.top)]);
    await tabTo(page, piece, { max: 200 });
    const moved = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/authoring\/cases\/\d+\/world/.test(r.url()), { timeout: scaled(30_000) });
    await page.keyboard.press('ArrowRight');
    expect((await moved).status(), 'mover la pieza').toBe(200);
    const after = await piece.evaluate(item => [parseFloat(item.style.left), parseFloat(item.style.top)]);
    expect(after[0], 'la pieza se movió a la derecha').toBeGreaterThan(origin[0]);

    // Quitar con Supr.
    const removed = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/authoring\/cases\/\d+\/world/.test(r.url()), { timeout: scaled(30_000) });
    await page.keyboard.press('Delete');
    expect((await removed).status(), 'quitar la pieza').toBe(200);
    await expect(piece).toHaveCount(0);
    expect((await firstRoomObjects(request, draft.id, draft.token)).length, 'el servidor volvió a las piezas de antes').toBe(before.length);
    await expectNoPointer(page, 'editar el mapa del caso y la sala');
  } finally {
    await retireCase(request, draft.id);
  }
});

// req: RF-12, RF-13, CU-05, RNF-004, WCAG 2.1.1
test('[A04] validar y publicar: «Enviar a revisión» muestra lo que falta, se envía con Enter y la decisión «Aprobar y publicar» se toma con teclas', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const admin = await apiToken(request, ADMIN);
  const draft = await buildPublishableDraft(request, admin, { title: `Revisión teclado ${stamp()}` });
  try {
    await keyboardLogin(page, ADMIN);
    await page.goto(`/portal/casos/${draft.id}/editor/revision`);
    await expect(page.getByRole('heading', { level: 1, name: 'Enviar a revisión' })).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByRole('heading', { name: 'Por resolver (0)' })).toBeVisible({ timeout: scaled(30_000) });

    // «Comprobar de nuevo» vuelve a preguntarle al servidor qué falta; «Enviar a Psicología» se alcanza con Tab.
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Comprobar de nuevo' }), { max: 160 });
    const submit = page.getByRole('button', { name: 'Enviar a Psicología' });
    await expect(submit).toHaveAttribute('aria-disabled', 'false', { timeout: scaled(30_000) });
    await pressWithKeyboard(page, submit, { max: 200 });
    const decision = page.locator('[data-accion="decision-caso"]');
    await expect(decision.locator('ui-badge').first()).toHaveText('En revisión', { timeout: scaled(30_000) });

    // La decisión: «Aprobar y publicar» abre un cuadro; se escribe una nota y se confirma con Enter.
    await pressWithKeyboard(page, decision.getByRole('button', { name: 'Aprobar y publicar' }), { max: 200 });
    const dialog = page.getByRole('dialog', { name: 'Aprobar y publicar' });
    await expect(dialog).toBeVisible();
    await typeInto(page, dialog.getByLabel('Nota (opcional)'), 'Cumple con lo acordado.');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const two = (value: number) => String(value).padStart(2, '0');
    await typeInto(page, dialog.getByLabel('Quién revisó'), 'Dra. Ruiz');
    // El campo de fecha sigue el orden del sistema operativo (mm/dd/aaaa en el Linux de CI, dd/mm/aaaa en un Windows en
    // español), no el de `navigator.language`: se escribe mes-día-año y, si no queda la fecha de ayer, se vuelve con
    // Mayús+Tab a la primera casilla y se escribe día-mes-año.
    const fecha = dialog.getByLabel('Fecha de la revisión');
    const ayer = `${yesterday.getFullYear()}-${two(yesterday.getMonth() + 1)}-${two(yesterday.getDate())}`;
    await typeInto(page, fecha, `${two(yesterday.getMonth() + 1)}${two(yesterday.getDate())}${yesterday.getFullYear()}`);
    if ((await fecha.inputValue()) !== ayer) {
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.type(`${two(yesterday.getDate())}${two(yesterday.getMonth() + 1)}${yesterday.getFullYear()}`);
    }
    await expect(fecha, 'la fecha de la revisión es la de ayer').toHaveValue(ayer);
    await typeInto(page, dialog.getByLabel('Referencia o acta'), 'Acta 4 de Psicología');
    await pressWithKeyboard(page, dialog.getByRole('button', { name: 'Aprobar y publicar' }));
    await expect(toast(page, 'El caso se publicó.')).toBeVisible({ timeout: scaled(30_000) });
    await expect(decision.locator('ui-badge').first()).toHaveText('Publicado', { timeout: scaled(30_000) });
    const lifecycle: Json = (await (await request.get(`/api/authoring/cases/${draft.id}/lifecycle`, { headers: bearer(admin) })).json()).data;
    expect(lifecycle['state']).toBe('PUBLISHED');
    await expectNoPointer(page, 'validar y publicar');
  } finally {
    await retireCase(request, draft.id);
  }
});

// ── Estudiante en el juego ─────────────────────────────────────────────────────────────────────────────────────────

/** La preparación del mundo (acceso, aviso, introducción) puede usar el ratón; lo que se mide empieza con el mundo listo. */
async function worldReady(page: Page): Promise<void> {
  await trackPointer(page);
  await enterWorld(page);
  await resetPointer(page);
}

/** Avanza un diálogo SOLO con Enter hasta que aparecen sus opciones. */
async function advanceToChoices(page: Page, dialogue: Locator): Promise<Locator> {
  const choices = dialogue.getByRole('group', { name: /opciones de intervención/i });
  const deadline = Date.now() + scaled(30_000);
  while (Date.now() < deadline) {
    if (await choices.isVisible().catch(() => false)) return choices;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
  }
  throw new Error('El diálogo no llegó a sus opciones avanzando con Enter');
}

const placesButton = (page: Page) => page.locator('button[data-hud-places]');

const playerAt = (page: Page) => page.evaluate(() => ({
  x: document.querySelector('[data-player-x]')?.getAttribute('data-player-x') ?? null,
  y: document.querySelector('[data-player-y]')?.getAttribute('data-player-y') ?? null,
}));

/** «Ir a…» → Tab hasta el lugar elegido y Enter: el jugador camina hasta ahí sin flechas ni ratón. */
async function goToPlace(page: Page, name: RegExp): Promise<void> {
  await pressWithKeyboard(page, placesButton(page), { max: 160 });
  const panel = page.getByRole('dialog', { name: /ir a…/i });
  await expect(panel).toBeVisible();
  await tabTo(page, panel.getByRole('button', { name }));
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
}

// req: BLOQUE-H H-06, RNF-004, WCAG 2.1.1
test('[E05 E06 E07] moverse con «Ir a…», hablar, usar una herramienta y elegir opciones: todo el recorrido con teclas', async ({ page }) => {
  test.setTimeout(scaled(300_000));
  await worldReady(page);
  const input = createWorldInputDriver(page, 'keyboard');

  // E07: recoger el kit PAP caminando con flechas y E; el aviso lo anuncia y la tarjeta de la herramienta queda disponible.
  await input.moveUntilNearby('ArrowLeft', /kit pap/i);
  await input.interact();
  await expect(page.locator('.soft-notice')).toContainText(/obtuviste: kit pap/i, { timeout: scaled(15_000) });
  await tabTo(page, page.locator('.tool-dock .tool-card[tabindex="0"]'), { max: 160 });
  const owned = page.locator('.tool-dock .tool-card:not([aria-disabled="true"])').first();
  for (let step = 0; step < 12 && !(await owned.evaluate(card => card === document.activeElement)); step += 1) await page.keyboard.press('ArrowRight');
  await expect(owned).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(owned).toHaveClass(/tool-card--selected/);
  // Elegir la herramienta abre su conversación, que atrapa el foco: Esc («Volver al mapa») la cierra, no pausa el caso y el
  // mundo vuelve a ser del teclado.
  const toolDialogue = page.getByRole('dialog', { name: /^diálogo con/i });
  await expect(toolDialogue).toBeVisible({ timeout: scaled(15_000) });
  await page.keyboard.press('Escape');
  await expect(toolDialogue).toHaveCount(0);
  await expect(page.getByText('Tu caso está en pausa'), 'Esc con un diálogo abierto solo lo cierra').toHaveCount(0);

  // E05: «Ir a…» lleva hasta la familia sin tocar el lienzo.
  const before = await playerAt(page);
  await goToPlace(page, /familia en crisis/i);
  await expect(nearbyAction(page, /familia en crisis/i)).toBeVisible({ timeout: scaled(30_000) });
  expect(await playerAt(page), 'el jugador caminó hasta la familia').not.toEqual(before);

  // E06: E abre la conversación, Enter la avanza y las opciones se eligen con Tab y Enter.
  await page.keyboard.press('e');
  const dialogue = page.getByRole('dialog', { name: /abuela de la niña/i });
  await expect(dialogue).toBeVisible({ timeout: scaled(30_000) });
  const choices = await advanceToChoices(page, dialogue);
  const option = choices.getByRole('button').first();
  await expect(option).toBeVisible();
  // El Enter que avanzaba el texto no elige por accidente (DLG-03: guarda de 500 ms tras aparecer las opciones): quien lee las
  // opciones tarda más que eso en elegir.
  await page.waitForTimeout(scaled(700));
  const decided = page.waitForResponse(response => response.request().method() === 'POST'
    && /\/api\/simulation\/attempts\/[^/]+\/(decisions|tools\/use)$/.test(new URL(response.url()).pathname), { timeout: scaled(30_000) });
  await tabTo(page, option);
  await page.keyboard.press('Enter');
  expect((await decided).ok(), 'el servidor aceptó la opción elegida con el teclado').toBe(true);
  await expectNoPointer(page, 'moverse, hablar, usar una herramienta y elegir opciones');
});

// req: RNF-004, WCAG 2.1.1, WCAG 2.4.3
test('[E08] abrir la bitácora y guardar: el botón se alcanza con Tab, el texto se escribe, «Guardar bitácora» guarda y Esc devuelve el foco', async ({ page }) => {
  test.setTimeout(scaled(240_000));
  await worldReady(page);

  const journalButton = page.getByRole('button', { name: /abrir bitácora reflexiva/i });
  await pressWithKeyboard(page, journalButton, { max: 160 });
  const journal = page.getByRole('dialog', { name: /bitácora reflexiva/i });
  await expect(journal).toBeVisible();
  await tabTo(page, journal.getByRole('textbox'));
  await page.keyboard.type('Hoy escuché sin interrumpir y noté su respiración.');
  const saved = page.waitForResponse(response => response.request().method() === 'POST'
    && /\/attempts\/[^/]+\/reflections$/.test(new URL(response.url()).pathname), { timeout: scaled(30_000) });
  await pressWithKeyboard(page, journal.getByRole('button', { name: /guardar bitácora/i }));
  expect((await saved).ok(), 'la bitácora se guardó').toBe(true);
  await expect(journal).toContainText('Bitácora guardada');
  await page.keyboard.press('Escape');
  await expect(journal).toBeHidden();
  await expect(journalButton, 'al cerrar la bitácora el foco vuelve al botón que la abrió').toBeFocused();
  await expectNoPointer(page, 'abrir la bitácora y guardar');
});

// req: RNF-004, WCAG 2.1.1, WCAG 2.1.4, WCAG 2.4.3
test('[E09] abrir la ayuda y los ajustes: botones por Tab, Esc cierra y devuelve el foco, un interruptor cambia con Espacio', async ({ page }) => {
  test.setTimeout(scaled(240_000));
  await worldReady(page);

  const helpButton = page.getByRole('button', { name: /abrir cómo se juega/i });
  await pressWithKeyboard(page, helpButton, { max: 160 });
  const help = page.locator('app-game-help').first();
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(helpButton, 'al cerrar la ayuda el foco vuelve al botón que la abrió').toBeFocused();

  const gear = page.getByRole('button', { name: /abrir ajustes del juego/i });
  await pressWithKeyboard(page, gear, { max: 160 });
  const settings = page.getByRole('dialog', { name: /ajustes/i });
  await expect(settings).toBeVisible();
  const music = settings.getByRole('button', { name: /música/i }).first();
  await tabTo(page, music);
  const pressed = await music.getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(music).not.toHaveAttribute('aria-pressed', pressed ?? 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(gear, 'al cerrar los ajustes el foco vuelve al engranaje').toBeFocused();
  await expectNoPointer(page, 'la ayuda y los ajustes');
});

// req: ETH-02, REGLA-004, RNF-004, WCAG 2.1.1
test('[E04 E10] comenzar, pausar con la salida segura y continuar: «Salida segura» y «Reanudar este intento» se pulsan con Enter', async ({ page, request }) => {
  test.setTimeout(scaled(300_000));
  const fixture = await studentCase(request, 'Pausa teclado', true);
  try {
    await keyboardLogin(page, ESTUDIANTE);
    await goTo(page, 'Simulador', /\/portal\/simulador$/);
    await pressWithKeyboard(page, caseCard(page, fixture.title).locator('.case-card__actions button').first());
    await pressWithKeyboard(page, page.getByRole('button', { name: 'Comenzar', exact: true }));
    const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
    await expect(consent).toBeVisible({ timeout: scaled(30_000) });
    await pressWithKeyboard(page, consent.getByRole('button', { name: /^continuar$/i }));
    // El consentimiento se registra en el servidor (S3-2b): el aviso sigue a la vista, con su botón en «guardando», hasta que
    // el servidor responde. Sin esperar a que se vaya, el recorrido de abajo tomaría el «Continuar» del propio aviso.
    await expect(consent).toBeHidden({ timeout: scaled(30_000) });

    // Comenzar: el video y el contexto del caso se avanzan con Tab y Enter hasta que el mundo está listo.
    const world = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
    const deadline = Date.now() + scaled(90_000);
    while (Date.now() < deadline && !(await world.isVisible().catch(() => false))) {
      const step = page.getByRole('dialog').getByRole('button', { name: /saltar video|^continuar$/i }).first();
      if (await step.isVisible().catch(() => false)) await pressWithKeyboard(page, step);
      else await page.waitForTimeout(250);
    }
    await expect(world).toBeVisible();

    // Pausar: la salida segura es un único botón operable; Enter pausa y el foco entra a «Reanudar este intento».
    const exit = page.getByRole('button', { name: /salida segura/i });
    await expect(exit).toHaveCount(1);
    const paused = page.waitForResponse(response => response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname), { timeout: scaled(30_000) });
    await pressWithKeyboard(page, exit, { max: 200 });
    expect((await paused).ok(), 'el servidor aceptó la pausa').toBe(true);
    const pauseDialog = page.getByRole('alertdialog', { name: /pausa/i });
    await expect(pauseDialog).toBeVisible({ timeout: scaled(30_000) });
    await expect(page.getByRole('button', { name: /reanudar este intento/i })).toBeFocused();

    // Continuar: Enter reanuda el mismo intento.
    const resumed = page.waitForResponse(response => response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname), { timeout: scaled(30_000) });
    await page.keyboard.press('Enter');
    expect((await resumed).ok(), 'el servidor aceptó la reanudación').toBe(true);
    await expect(pauseDialog).toBeHidden({ timeout: scaled(30_000) });
    await expectNoPointer(page, 'comenzar, pausar y continuar');
  } finally {
    await retireCase(request, fixture.caseVersionId, fixture.records);
  }
});
