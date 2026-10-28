import { randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';

import { ADMIN, PROFESOR, apiToken, assignCase, bearer, retireCase } from './support/case-fixtures';
import { directiveSources, isExecutionViolation, nonceOfDirective } from './support/csp-probe';
import type { Finding } from './support/csp-probe';
import { injectCanary, probeMode, recordFinding, runProbedFlow, startProbe } from './support/csp-probe-runtime';
import { recorrerEditor, visitEditorTabs } from './support/editor-tabs';
import { nameStamp } from './support/own-password';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import {
  acceptContentWarning, createWorldInputDriver, enterWorld, finishCaseIntroduction, leaveBrief, waitForWorldReady, waitUntilPlayerStill,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * SONDA DE CSP (plan 03, S2-3b y S2-4; RNF-002). Corre contra el build de PRODUCCIÓN de Angular servido por Django con la
 * política de contenido del modo elegido (`CSP_PROBE_MODE`): WhiteNoise para los estáticos, `spa_index` para el HTML con
 * el nonce de cada petición. Lo lanza `npm run test:csp` (scripts/test-csp-probe.mjs, con su propia BD desechable y
 * `playwright.csp-probe.config.ts`); no corre con `npm run test:e2e` (el servidor de desarrollo de Angular no manda CSP).
 *
 * Recorre CINCO flujos —acceso, portal del estudiante, sala del juego, editor del docente y reporte con la descarga del
 * CSV (URL `blob:`)— y falla con la lista de violaciones (directiva, recurso bloqueado sin consulta, ruta de la página)
 * si el navegador, la consola o el registro del servidor ven alguna. Además comprueba las cabeceras y el nonce, que un
 * texto de caso con `<script>` no se ejecuta y, con un CANARIO, que la política de verdad bloquea el código en línea
 * (sin él, una sonda sin política también daría «cero violaciones»).
 */
const NONCE_EN_EL_HTML = /ngcspnonce="([^"]*)"/i;
const MARCADOR_DEL_SERVIDOR = '__SIEP_CSP_NONCE__';
const SCRIPT = '<script>alert(1)</script>';
const IMG = '<img src=x onerror="window.__siepXss=1">';
const ROLE_TEXT = `Rol ${IMG}`;

interface DocumentInspection {
  status: number;
  enforce: string;
  reportOnly: string;
  cacheControl: string;
  bodyNonce: string;
  markerLeft: boolean;
}

async function inspectDocument(response: APIResponse): Promise<DocumentInspection> {
  const headers = response.headers();
  const body = await response.text();
  return {
    status: response.status(),
    enforce: headers['content-security-policy'] ?? '',
    reportOnly: headers['content-security-policy-report-only'] ?? '',
    cacheControl: headers['cache-control'] ?? '',
    bodyNonce: NONCE_EN_EL_HTML.exec(body)?.[1] ?? '',
    markerLeft: body.includes(MARCADOR_DEL_SERVIDOR),
  };
}

// ── 0 · Las cabeceras y el nonce ─────────────────────────────────────────────────────────────────

test('0 · el servidor entrega la política del modo y el nonce del HTML es el de la cabecera', async ({ request }) => {
  const mode = probeMode();
  const first = await inspectDocument(await request.get('/portal/anything'));
  const second = await inspectDocument(await request.get('/index.html'));
  const problems: Finding[] = [];
  const fail = (kind: Finding['kind'], detail: string) => problems.push({ flow: 'cabeceras', kind, detail });

  for (const [name, doc] of [['/portal/anything', first], ['/index.html', second]] as const) {
    if (doc.status !== 200) fail('wrong-policy', `${name}: HTTP ${doc.status} (debe servirlo spa_index)`);
    if (mode === 'enforce') {
      if (!doc.enforce) fail('no-policy', `${name}: sin la cabecera Content-Security-Policy`);
      if (doc.reportOnly) fail('wrong-policy', `${name}: con la política en vigor no debe haber cabecera de reporte`);
    } else {
      if (!doc.reportOnly) fail('no-policy', `${name}: sin la cabecera Content-Security-Policy-Report-Only`);
      if (doc.enforce) fail('wrong-policy', `${name}: en modo reporte no debe haber Content-Security-Policy`);
    }
    const policy = doc.enforce || doc.reportOnly;
    if (doc.markerLeft || !doc.bodyNonce) fail('nonce-mismatch', `${name}: el HTML no trae un nonce escrito en ngCspNonce (marcador sin sustituir o vacío)`);
    if (!doc.cacheControl.includes('no-store')) fail('wrong-policy', `${name}: el HTML debe llevar Cache-Control: no-store (lleva «${doc.cacheControl}»)`);
    if (mode !== 'report' && policy) {
      for (const directive of ['script-src', 'style-src']) {
        if (nonceOfDirective(policy, directive) !== doc.bodyNonce) {
          fail('nonce-mismatch', `${name}: el nonce de ${directive} no es el que el HTML trae en ngCspNonce`);
        }
      }
      // En scripts, nunca 'unsafe-inline' ni 'unsafe-eval'; en los <style>, tampoco (solo el nonce).
      for (const directive of ['script-src', 'style-src']) {
        const sources = directiveSources(policy, directive) ?? [];
        if (sources.includes("'unsafe-inline'")) fail('wrong-policy', `${name}: ${directive} lleva 'unsafe-inline'`);
        if (sources.includes("'unsafe-eval'")) fail('wrong-policy', `${name}: ${directive} lleva 'unsafe-eval'`);
      }
    }
  }
  if (first.bodyNonce !== '' && first.bodyNonce === second.bodyNonce) fail('nonce-mismatch', 'dos peticiones recibieron el MISMO nonce');

  // El estático se sirve por WhiteNoise y lleva la política (el índice NO sale de ahí: lo prueba el Django de spa_index).
  const asset = await request.get('/assets/boot.js');
  if (asset.status() !== 200 || !(await asset.text()).includes('siep-boot__reload')) fail('wrong-policy', 'boot.js no lo sirve WhiteNoise');
  if (!(asset.headers()['content-security-policy'] ?? asset.headers()['content-security-policy-report-only'])) {
    fail('no-policy', 'los estáticos de WhiteNoise no llevan la política');
  }

  for (const problem of problems) recordFinding(problem);
  expect(problems.map(item => `${item.kind}: ${item.detail}`), 'cabeceras y nonce').toEqual([]);
});

// ── 1 · El canario ───────────────────────────────────────────────────────────────────────────────

test('1 · canario: el código en línea que se inyecta en la página se bloquea (en vigor) y el servidor recibe el informe', async ({ page }) => {
  const mode = probeMode();
  const probe = await startProbe(page, 'canario');
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await probe.settle();
  const browserBefore = probe.browserViolations().length;
  const serverBefore = probe.serverViolations().length;

  const ran = await injectCanary(page);
  await probe.settle();

  const own = (items: ReturnType<typeof probe.browserViolations>) => items.filter(item => isExecutionViolation(item) && item.blocked === 'inline');
  const browser = own(probe.browserViolations().slice(browserBefore));
  const server = own(probe.serverViolations().slice(serverBefore));
  const problems: Finding[] = [];
  const fail = (kind: Finding['kind'], detail: string) => problems.push({ flow: 'canario', kind, detail });

  if (mode === 'enforce') {
    if (ran.scriptRan) fail('canary-executed', 'el <script> en línea inyectado SE EJECUTÓ');
    if (ran.handlerRan) fail('canary-executed', 'el manejador onerror en línea inyectado SE EJECUTÓ');
  } else if (!ran.scriptRan || !ran.handlerRan) {
    // En modo reporte el navegador no bloquea: si el canario no corre, la política no es solo de reporte.
    fail('wrong-policy', 'en modo reporte el código inyectado debe poder ejecutarse (solo se informa)');
  }
  const expectedDisposition = mode === 'enforce' ? 'enforce' : 'report';
  for (const directive of ['script-src-elem', 'script-src-attr']) {
    if (!browser.some(item => item.directive === directive && item.disposition === expectedDisposition)) {
      fail('canary-not-reported', `el navegador no entregó la violación ${directive} (${expectedDisposition}) del canario`);
    }
    if (!server.some(item => item.directive === directive && item.disposition === expectedDisposition)) {
      fail('canary-not-reported', `el servidor no registró csp_violation ${directive} (${expectedDisposition}) del canario`);
    }
  }
  for (const problem of problems) recordFinding(problem);
  expect(problems.map(item => `${item.kind}: ${item.detail}`), 'canario').toEqual([]);
});

// ── 2 · Acceso ───────────────────────────────────────────────────────────────────────────────────

test('2 · acceso: portada, entrada, solicitud de acceso, una clave mala y la entrada buena', async ({ page }) => {
  test.setTimeout(scaled(180_000));
  await runProbedFlow(page, 'acceso', async () => {
    for (const screen of TOUR_SCREENS.filter(item => item.role === 'publico')) await openScreen(page, screen);

    await page.goto('/login');
    await page.locator('input[type="email"]').last().fill('sonda-csp@example.invalid');
    await page.locator('input[type="password"]').last().fill('Clave-que-no-existe-0');
    const answered = page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /^ingresar$/i }).click();
    expect((await answered).status(), 'una clave mala da 401').toBe(401);
    await expect(page.locator('.acceso__error').first()).toBeVisible({ timeout: scaled(10_000) });

    await loginAs(page, 'estudiante');
    await page.waitForLoadState('networkidle');
  });
});

test('2b · botón de Google (client id FALSO; solo con --google y con internet): el script, el iframe y la hoja de Google cargan', async ({ page }) => {
  test.skip(process.env['CSP_PROBE_GOOGLE'] !== '1', 'Solo con `npm run test:csp -- --google` (necesita internet y usa un client id FALSO).');
  test.setTimeout(scaled(120_000));
  await runProbedFlow(page, 'botón de Google (client id falso)', async () => {
    // El acceso pide el client id público, carga https://accounts.google.com/gsi/client y pinta el botón en un iframe de Google.
    await page.goto('/login');
    await page.waitForFunction(
      () => Boolean((window as unknown as { google?: { accounts?: { id?: unknown } } }).google?.accounts?.id),
      undefined,
      { timeout: scaled(30_000) },
    );
    await expect(page.locator('iframe[src*="accounts.google.com/gsi"]').first()).toBeAttached({ timeout: scaled(30_000) });
    // Google pinta su botón en la página (con su hoja de estilos y atributos style=): con ellos bloqueados no ocuparía lugar.
    const googleButton = page.getByRole('button', { name: /continuar con google/i });
    await expect(googleButton, 'el botón de Google se ve').toBeVisible({ timeout: scaled(30_000) });
    const box = await googleButton.boundingBox();
    expect(box?.width ?? 0, 'ancho del botón de Google').toBeGreaterThan(100);
    expect(box?.height ?? 0, 'alto del botón de Google').toBeGreaterThan(20);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  });
});

// ── 3 · Portal del estudiante ────────────────────────────────────────────────────────────────────

const PORTAL_ESTUDIANTE = ['panel', 'catalogo', 'personaje', 'invitaciones', 'cambiar-contrasena', 'no-encontrada', 'sin-permiso'];

test('3 · portal del estudiante: panel, catálogo, personaje, invitaciones y las pantallas de error', async ({ page }) => {
  test.setTimeout(scaled(240_000));
  await runProbedFlow(page, 'portal del estudiante', async () => {
    await loginAs(page, 'estudiante');
    for (const id of PORTAL_ESTUDIANTE) {
      const screen = TOUR_SCREENS.find(item => item.role === 'estudiante' && item.id === id);
      expect(screen, `la pantalla «${id}» del recorrido`).toBeDefined();
      await openScreen(page, screen!);
    }
  });
});

// ── 4 · Sala del juego ───────────────────────────────────────────────────────────────────────────

test('4 · sala del juego: la sala, la ficha, el aviso, la introducción y un caso en marcha', async ({ page }) => {
  test.setTimeout(scaled(300_000));
  await runProbedFlow(page, 'sala del juego', async () => {
    await enterWorld(page);
    const input = createWorldInputDriver(page, 'keyboard');
    await input.moveBy('ArrowRight', 60);
    await waitUntilPlayerStill(page);
    await input.moveBy('ArrowDown', 40);
    await waitUntilPlayerStill(page);
    // El audio, las texturas y los diálogos se piden al entrar y al moverse: se deja que terminen de llegar.
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(scaled(1_500));
  });
});

// ── 5 · Editor del docente ───────────────────────────────────────────────────────────────────────

test('5 · editor del docente: crear un caso desde la universidad y recorrer sus pantallas (mapa, guion, sala, finales, probar y revisión)', async ({ page, request }) => {
  test.setTimeout(scaled(300_000));
  await runProbedFlow(page, 'editor del docente', async () => {
    await visitEditorTabs(page, request, async () => undefined);
  });
});

// ── 6 · Reporte con la descarga del CSV ──────────────────────────────────────────────────────────

/**
 * El caso PUBLICADO con marcado en sus textos, sembrado por el orquestador en la BD desechable
 * (backend_django/shared/csp_probe_seed.py): un `<script>alert(1)</script>` y una `<img onerror>` al final del título, el
 * contexto, los objetivos, las escenas, las opciones, los objetos, los diálogos, los personajes y las pistas. Se siembra en
 * la base porque la API de autoría y la compuerta de publicación impiden el marcado (así debe ser): este es el dato viejo
 * o escrito por otra vía que la CSP, como segunda capa, tiene que dejar inerte.
 */
function seededCaseVersionId(): number {
  const id = Number(process.env['CSP_PROBE_PAYLOAD_CASE']);
  expect(Number.isInteger(id) && id > 0, 'CSP_PROBE_PAYLOAD_CASE: el orquestador siembra el caso con marcado (npm run test:csp)').toBe(true);
  return id;
}

/**
 * Un estudiante propio con UN intento abierto en un grupo de la docente (todo por API), como en `reporte-estudiante.e2e.ts`.
 * Desde S1-5 la cuenta que crea un ADMIN nace con contraseña TEMPORAL: toda orden responde 403 PASSWORD_CHANGE_REQUIRED
 * hasta que la persona fija la suya, así que la primera cosa que hace es cambiarla (`/api/auth/change-password`).
 */
async function studentWithAttempt(request: APIRequestContext) {
  const stamp = Date.now().toString(36);
  const email = `sonda-${stamp}@siep.test`;
  const password = `Clave-${stamp}-2026`;
  const ownPassword = `Propia-${randomBytes(6).toString('hex')}-Zq9!`;
  const admin = bearer(await apiToken(request, ADMIN));
  const user = await request.post('/api/admin/users', { headers: admin, data: { email, password, nombre: 'Sonda', apellido: nameStamp(stamp), role: 'ESTUDIANTE', activo: true } });
  expect(user.status(), 'crear estudiante').toBeLessThan(300);
  const studentId = (await user.json()).data.id as number;
  const temporary = bearer(await apiToken(request, { email, password }));
  const changed = await request.post('/api/auth/change-password', { headers: temporary, data: { currentPassword: password, newPassword: ownPassword } });
  expect(changed.status(), `cambiar la contraseña temporal: ${await changed.text()}`).toBe(200);
  const teacher = bearer(await apiToken(request, PROFESOR));
  const created = await request.post('/api/grupos', { headers: teacher, data: { nombre: `Sonda CSP ${stamp}`, codigo: `CSP-${stamp}` } });
  expect(created.status(), 'crear grupo').toBeLessThan(300);
  const groupId = (await created.json()).data.id as number;
  expect((await request.post(`/api/grupos/${groupId}/estudiantes`, { headers: teacher, data: { email } })).status(), 'invitar').toBeLessThan(300);
  // El caso del reporte es el del demo, no el sembrado con marcado (que la prueba 7 recorre aparte).
  const cases = (await (await request.get('/api/simulation/cases', { headers: teacher })).json()).data as Array<{ caseVersionId: number }>;
  const caseVersionId = cases.find(item => item.caseVersionId !== seededCaseVersionId())?.caseVersionId;
  expect(caseVersionId, 'hay un caso publicado además del sembrado con marcado').toBeDefined();
  expect((await request.post(`/api/grupos/${groupId}/casos`, { headers: teacher, data: { caseVersionId } })).status(), 'asignar el caso').toBeLessThan(300);
  const student = bearer(await apiToken(request, { email, password: ownPassword }));
  expect((await request.post(`/api/me/invitations/${groupId}/accept`, { headers: student, data: {} })).status(), 'aceptar').toBe(200);
  expect((await request.post('/api/simulation/attempts', { headers: student, data: { caseVersionId } })).status(), 'iniciar intento').toBe(200);
  return {
    groupId, studentId, studentName: `Sonda ${nameStamp(stamp)}`, caseVersionId: caseVersionId!,
    cleanup: async () => { await request.delete(`/api/grupos/${groupId}`, { headers: teacher }); },
  };
}

test('6 · reporte: del grupo al estudiante, con la descarga del CSV (URL blob:)', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const seeded = await studentWithAttempt(request);
  try {
    await runProbedFlow(page, 'reporte del estudiante', async () => {
      await loginAs(page, 'profesor');
      // El grupo y el caso van en la URL: la página los elige de una vez. Elegir el caso a mano justo después de cargar
      // competía con la preselección del grupo (que lo reinicia) y fallaba la primera vez de cada pila.
      await page.goto(`/portal/reportes?grupo=${seeded.groupId}&caseVersionId=${seeded.caseVersionId}`);
      const link = page.getByRole('link', { name: new RegExp(seeded.studentName) });
      await expect(link).toBeVisible({ timeout: scaled(30_000) });

      // La descarga: el cliente arma un Blob, lo enlaza con una URL `blob:` y pulsa un <a download>.
      const exportButton = page.getByRole('button', { name: 'Exportar CSV' });
      await expect(exportButton).toBeVisible({ timeout: scaled(15_000) });
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: scaled(30_000) }), exportButton.click()]);
      expect(download.suggestedFilename(), 'el archivo descargado es un CSV').toMatch(/\.csv$/);
      const saved = await download.path();
      expect(statSync(saved).size, 'el CSV no está vacío').toBeGreaterThan(0);

      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: `Reporte de ${seeded.studentName}` })).toBeVisible({ timeout: scaled(15_000) });
      await page.waitForLoadState('networkidle').catch(() => undefined);
    });
  } finally {
    await seeded.cleanup();
  }
});

// ── 7 · Un script en un texto de caso no se ejecuta ──────────────────────────────────────────────

test('7 · un texto de caso con <script> y un manejador en línea se ve como texto: no hay alert, ni ejecución, ni violación', async ({ page, request }) => {
  test.setTimeout(scaled(300_000));
  const caseVersionId = seededCaseVersionId();
  const assignment = await assignCase(request, caseVersionId);
  try {
    await runProbedFlow(page, 'texto de caso con script', async probe => {
      // El texto llegó como texto: ni un <script> ni una <img> con manejador nacieron de él, y nada se ejecutó.
      const assertInert = async (who: string) => {
        const parsed = await page.evaluate(() => ({
          alertScripts: [...document.scripts].filter(script => script.textContent?.includes('alert(1)')).length,
          handlerImages: document.querySelectorAll('img[onerror]').length,
          xss: (window as unknown as Record<string, unknown>)['__siepXss'] ?? null,
        }));
        expect(parsed, `el texto del caso no se convirtió en código (${who})`).toEqual({ alertScripts: 0, handlerImages: 0, xss: null });
        expect(probe.dialogs, `ningún alert/confirm/prompt (${who})`).toEqual([]);
      };

      // El administrador: la lista de casos y todas las pantallas del editor del caso.
      await loginAs(page, 'admin');
      await page.goto('/portal/casos');
      await expect(page.locator('body')).toContainText(SCRIPT, { timeout: scaled(30_000) });
      await page.goto(`/portal/casos/${caseVersionId}/editor`);
      await expect(page.locator('button.escena').first()).toBeVisible({ timeout: scaled(30_000) });
      await recorrerEditor(page, async () => { await page.waitForTimeout(scaled(300)); });
      await expect(page.locator('body')).toContainText(SCRIPT);
      await assertInert('administrador');

      // El estudiante (misma página, sesión nueva): catálogo, ficha, aviso, introducción, contexto y el mundo.
      await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
      await loginAs(page, 'estudiante');
      await page.goto('/portal/simulador');
      await expect(page.locator('body')).toContainText(SCRIPT, { timeout: scaled(30_000) });
      await page.goto(`/portal/simulador/${caseVersionId}/ficha`);
      await expect(page.locator('body')).toContainText(SCRIPT, { timeout: scaled(30_000) });
      await assertInert('estudiante (ficha)');
      await leaveBrief(page);
      const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
      await expect(consent).toBeVisible({ timeout: scaled(30_000) });
      const introVideo = await acceptContentWarning(page, consent);
      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await assertInert('estudiante (contexto del caso)');
      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await waitForWorldReady(page);
      await expect(page.locator('body'), 'el juego muestra textos del caso con su marcado, como texto').toContainText('alert(1)');
      await assertInert('estudiante (mundo)');

      await probe.settle();
      expect(probe.browserViolations().filter(isExecutionViolation), 'ninguna violación de ejecución de scripts').toEqual([]);
    });
  } finally {
    await retireCase(request, caseVersionId, [assignment]);
  }
});
