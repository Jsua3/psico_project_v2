import { test, expect, Page } from '@playwright/test';

import { captureApiBodies, readJson } from './support/api-bodies';
import { probeStudentConsent, readConsentState, resetStudentConsent } from './support/consent';
import { createWorldInputDriver, enterCaseThroughBrief, finishCaseIntroduction, leaveBrief, waitForWorldReady } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * ETH-01 — puerta de consentimiento (Playwright, red observada).
 *
 * Precondiciones: stack aislado corriendo (frontend E2E_BASE_URL, backend
 * sembrado con el caso demo). Credenciales parametrizables por entorno para
 * usar usuarios sintéticos de test.
 *
 * Desde S3-2b el consentimiento al aviso se registra en el SERVIDOR y lo recuerda el siguiente recorrido (otro navegador,
 * otra sesión): cada prueba que necesita ver el aviso parte de «sin consentimiento» (`resetStudentConsent`). Las pruebas
 * marcadas «exigido» solo corren si el backend de la corrida exige el consentimiento (`SIEP_CONSENT_REQUIRED=true`, que
 * `scripts/test-e2e.mjs` pasa al servidor tal cual): `SIEP_CONSENT_REQUIRED=true node scripts/test-e2e.mjs consent-gate safe-exit`.
 */

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

/** Media sensible del caso: nunca debe pedirse antes del consentimiento. */
const SENSITIVE_MEDIA = /assets\/(video|game\/audio)\//;

async function login(page: Page) {
  await captureApiBodies(page);
  await page.goto('/login');
  // La página tiene DOS formularios (solicitar acceso + login): el email del
  // login no tiene label con "correo", así que se resuelve por tipo/orden.
  await page.locator('input[type="email"]').last().fill(EMAIL);
  await page.locator('input[type="password"]').last().fill(PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//);
}

/**
 * Abre el caso desde el catálogo y resuelve el prompt de reanudación si sale. Con un intento abierto que dejó otra
 * prueba, la tarjeta dice «Continuar» (RN-07, plan visual F5-2); si no, «Iniciar simulación» o «Iniciar nuevo intento».
 */
async function openCase(page: Page) {
  // El consentimiento de una prueba anterior sigue en el servidor: se parte de «sin consentimiento» ANTES de abrir el caso.
  await resetStudentConsent(page);
  await page.goto('/portal/simulador');
  await page.locator('.catalog-cases').getByRole('button', { name: /^(iniciar simulación|iniciar nuevo intento|continuar)$/i }).first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  // Sin intento abierto el catálogo lleva primero a la ficha del caso (F10-1); con uno abierto, «Continuar» va al juego.
  await leaveBrief(page);
  // Espera determinista: aparece el prompt de reanudación (si hay intento
  // activo) O directamente la advertencia de contenido — sin carreras.
  const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
  await expect(consentDialog(page).or(resume).first()).toBeVisible({ timeout: scaled(15_000) });
  if (await resume.count()) {
    await resume.click();
  }
}

function consentDialog(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
}

test('cero media sensible antes de aceptar; media solo después', async ({ page }) => {
  const mediaRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (SENSITIVE_MEDIA.test(request.url())) mediaRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page);
  await openCase(page);

  await expect(consentDialog(page)).toBeVisible();
  // Antes de aceptar: sin mundo, sin video, sin media.
  expect(mediaRequests).toEqual([]);
  await expect(page.locator('app-game-world')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('app-simulation-hud')).toHaveCount(0);

  await page.getByRole('button', { name: /^continuar$/i }).click();
  // Tras aceptar: el flujo continúa (video o narrativa) y la media ya puede pedirse.
  await expect
    .poll(() => mediaRequests.length, { timeout: scaled(15_000) })
    .toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('el foco queda atrapado dentro de la advertencia', async ({ page }) => {
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.content-warning-overlay')));
    expect(inside).toBe(true);
  }
});

test('Escape no cierra el intento y rechazar vuelve al catálogo sin mutaciones', async ({ page }) => {
  const gameplayPosts: string[] = [];
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();

  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/')) {
      gameplayPosts.push(request.url());
    }
  });

  await page.keyboard.press('Escape');
  await expect(consentDialog(page)).toBeVisible();

  await page.getByRole('button', { name: /volver al catálogo/i }).click();
  await page.waitForURL(/\/portal\/simulador$/);
  expect(gameplayPosts).toEqual([]);

  // Reingresar vuelve a pedir consentimiento (nada quedó registrado al rechazar).
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();
});

// req: ETH-01, SIEP-RF-05, BLOQUE-H
test('un registro que falla NO da por registrado el consentimiento: error con «Reintentar» y nada arranca', async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', request => {
    if (SENSITIVE_MEDIA.test(request.url())) mediaRequests.push(request.url());
  });
  // Desde S3-2b el consentimiento se registra en el servidor: si el servidor no responde (red caída, servidor caído), NO queda
  // registrado, aunque el navegador sí deje guardar su marca. El servidor "vuelve" cuando la prueba lo permite.
  let serverDown = true;
  const attempts: string[] = [];
  await page.route('**/api/simulation/cases/*/consent', async route => {
    if (route.request().method() === 'POST') {
      attempts.push(route.request().url());
      if (serverDown) {
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  await login(page);
  await openCase(page);
  const consent = consentDialog(page);
  await expect(consent).toBeVisible();

  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const failure = consent.locator('.consent-error');
  await expect(failure).toContainText('No pudimos registrar tu consentimiento en este navegador.');
  expect(attempts).toHaveLength(1);
  // Sin consentimiento no hay mundo, HUD ni media; el aviso sigue ahí y «Volver al catálogo» sigue operable.
  await expect(consent).toBeVisible();
  await expect(page.locator('app-game-world')).toHaveCount(0);
  await expect(page.locator('app-simulation-hud')).toHaveCount(0);
  await expect(consent.getByRole('button', { name: /volver al catálogo/i })).toBeEnabled();
  expect(mediaRequests).toEqual([]);
  // La marca de la pestaña tampoco se escribe antes de que el servidor responda.
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('siep_case_consent_')))).toEqual([]);

  // Reintentar mientras el servidor sigue sin responder: el mismo estado y ninguna media.
  await failure.getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(() => attempts.length).toBe(2);
  await expect(failure).toBeVisible();
  expect(mediaRequests).toEqual([]);

  // El servidor vuelve: «Reintentar» registra y el flujo sigue.
  serverDown = false;
  await failure.getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(() => mediaRequests.length, { timeout: scaled(15_000) }).toBeGreaterThan(0);
  const caseVersionId = Number(/\/portal\/simulador\/(\d+)/.exec(page.url())![1]);
  expect((await readConsentState(page, caseVersionId)).accepted, 'quedó registrado en el servidor').toBe(true);
});

// req: RN-07, REGLA-010
test('«Iniciar nuevo intento» pide confirmar lo que se pierde; «Continuar» (o Esc) conserva el intento abierto', async ({ page }) => {
  const attemptStarts: string[] = [];
  await login(page);
  await openCase(page); // deja un intento abierto: al volver se ofrece reanudarlo
  await expect(consentDialog(page)).toBeVisible();
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/simulation\/attempts\/?$/.test(request.url())) attemptStarts.push(request.url());
  });

  await page.reload();
  const resumeCard = page.getByRole('dialog').filter({ hasText: 'Continuar simulación formativa' });
  await expect(resumeCard).toBeVisible({ timeout: scaled(15_000) });
  const startNew = resumeCard.getByRole('button', { name: 'Iniciar nuevo intento' });
  await startNew.click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('¿Empezar un intento nuevo?');
  await expect(confirm.getByRole('button', { name: 'Continuar' }), 'lo seguro es lo primario y tiene el foco').toBeFocused();

  // Esc devuelve «Continuar»: nada se pierde, no se crea otro intento y el foco vuelve al disparador.
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(resumeCard).toBeVisible();
  await expect(startNew).toBeFocused();
  expect(attemptStarts).toEqual([]);

  // Asumir la pérdida: ahora sí se inicia el intento nuevo, que vuelve a pedir el consentimiento.
  await startNew.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Iniciar nuevo intento' }).click();
  await expect(consentDialog(page)).toBeVisible({ timeout: scaled(30_000) });
  expect(attemptStarts.length).toBe(1);
});

// ── El consentimiento vive en el servidor (S3-2b) ──────────────────────────────────────────────────────────────────────

const NOT_ENFORCED = 'El backend de esta corrida no exige el consentimiento (SIEP_CONSENT_REQUIRED apagada). '
  + 'Para probarlo: SIEP_CONSENT_REQUIRED=true node scripts/test-e2e.mjs consent-gate safe-exit';

/** El caso que la pantalla de juego tiene abierto (`/portal/simulador/<id>`). */
function openCaseVersionId(page: Page): number {
  return Number(/\/portal\/simulador\/(\d+)/.exec(page.url())![1]);
}

/** El intento y el token que la pantalla de juego dejó en la sesión de la pestaña para este caso. */
async function currentAttempt(page: Page, caseVersionId: number): Promise<{ attemptId: string; attemptToken: string }> {
  const raw = await page.evaluate(id => window.sessionStorage.getItem(`siep_attempt_${id}`), caseVersionId);
  expect(raw, 'la pantalla de juego guardó el intento de este caso').toBeTruthy();
  return JSON.parse(raw as string) as { attemptId: string; attemptToken: string };
}

const isWorldGet = (method: string, url: string) =>
  method === 'GET' && /\/api\/simulation\/attempts\/[^/]+\/world$/.test(new URL(url).pathname);

const isConsentCall = (method: string, url: string, wanted: string) =>
  method === wanted && /\/api\/simulation\/cases\/\d+\/consent$/.test(new URL(url).pathname);

// req: ETH-01, SIEP-RF-05
test('quien ya aceptó el aviso en otro navegador entra sin verlo de nuevo: el servidor lo recuerda', async ({ page, browser }) => {
  test.setTimeout(scaled(180_000));
  // 1. En este navegador: acepta. Queda registrado en el servidor (201 la primera vez).
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();
  const registered = page.waitForResponse(
    response => isConsentCall(response.request().method(), response.url(), 'POST'),
    { timeout: scaled(30_000) },
  );
  await consentDialog(page).getByRole('button', { name: /^continuar$/i }).click();
  expect((await registered).status(), 'el servidor registra la aceptación').toBe(201);
  await expect(page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' })).toBeVisible({ timeout: scaled(30_000) });

  // 2. Otro navegador (contexto nuevo: ni sessionStorage ni sesión): la persona NO vuelve a ver el aviso.
  const other = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200' });
  try {
    const second = await other.newPage();
    const consentPosts: string[] = [];
    second.on('request', request => {
      if (isConsentCall(request.method(), request.url(), 'POST')) consentPosts.push(request.url());
    });
    await login(second);
    await second.goto('/portal/simulador');
    await second.locator('.catalog-cases').getByRole('button', { name: /^(iniciar simulación|iniciar nuevo intento|continuar)$/i })
      .first().click({ timeout: scaled(30_000) });
    await second.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
    await leaveBrief(second);
    // El intento de la primera pestaña sigue abierto: se ofrece continuarlo.
    const resume = second.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
    await expect(resume).toBeVisible({ timeout: scaled(30_000) });
    const asked = second.waitForResponse(
      response => isConsentCall(response.request().method(), response.url(), 'GET'),
      { timeout: scaled(30_000) },
    );
    await resume.click({ timeout: scaled(30_000) });

    expect((await readJson(await asked)).data.accepted, 'el servidor dice que ya aceptó').toBe(true);
    await expect(second.getByRole('dialog').filter({ hasText: 'Antes de comenzar' }), 'entra directo a la introducción')
      .toBeVisible({ timeout: scaled(30_000) });
    await expect(consentDialog(second)).toHaveCount(0);
    expect(consentPosts, 'no se registra otra vez lo que ya estaba registrado').toEqual([]);
    // Suelta el mundo (WebGL por software) antes de cerrar los contextos: cerrarlos con Phaser vivo tarda minutos en un equipo cargado.
    await second.goto('about:blank');
    await page.goto('about:blank');
  } finally {
    await other.close();
  }
});

// req: ETH-01, SIEP-RF-05
test('con el consentimiento exigido: sin aceptar el aviso no se pide el mundo (403 CONSENT_REQUIRED si se fuerza); al aceptar, entra', async ({ page, request }) => {
  test.setTimeout(scaled(180_000));
  const probe = await probeStudentConsent(request);
  test.skip(!probe.state.required, NOT_ENFORCED);

  const worldRequests: string[] = [];
  page.on('request', req => { if (isWorldGet(req.method(), req.url())) worldRequests.push(req.url()); });
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();

  // Sin aceptar, la pantalla de juego no pide el mundo…
  expect(worldRequests).toEqual([]);
  // …y, si se fuerza con el intento que ya tiene, el servidor lo niega y dice qué versión del aviso hay que leer.
  const attempt = await currentAttempt(page, openCaseVersionId(page));
  const worldUrl = `/api/simulation/attempts/${attempt.attemptId}/world`;
  const tokenHeaders = { ...probe.headers, 'X-SIEP-Attempt-Token': attempt.attemptToken };
  const forced = await request.get(worldUrl, { headers: tokenHeaders });
  expect(forced.status()).toBe(403);
  expect(await forced.json()).toMatchObject({ success: false, code: 'CONSENT_REQUIRED', noticeVersion: probe.state.noticeVersion });
  expect(worldRequests, 'forzarlo por la API no lo pidió la pantalla').toEqual([]);

  // Al aceptar el aviso, el estudiante entra: el mundo se pide y llega.
  const world = page.waitForResponse(response => isWorldGet(response.request().method(), response.url()), { timeout: scaled(30_000) });
  await consentDialog(page).getByRole('button', { name: /^continuar$/i }).click();
  expect((await world).status()).toBe(200);
  await expect(page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' })).toBeVisible({ timeout: scaled(30_000) });
  expect((await request.get(worldUrl, { headers: tokenHeaders })).status(), 'con el consentimiento registrado el servidor lo entrega').toBe(200);
});

// req: ETH-01, SIEP-RF-05, REGLA-004
test('con el consentimiento exigido: si se retira en otra pestaña, la siguiente orden vuelve al aviso sin error genérico y el intento sigue', async ({ page, request }) => {
  test.setTimeout(scaled(240_000));
  const probe = await probeStudentConsent(request);
  test.skip(!probe.state.required, NOT_ENFORCED);

  await login(page);
  await openCase(page);
  await consentDialog(page).getByRole('button', { name: /^continuar$/i }).click();
  const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  await expect(introVideo).toBeVisible({ timeout: scaled(30_000) });
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
  const caseVersionId = openCaseVersionId(page);
  const attempt = await currentAttempt(page, caseVersionId);

  // En otra pestaña (aquí, por la API) la persona retira su consentimiento.
  const withdrawn = await request.delete(`/api/simulation/cases/${caseVersionId}/consent`, { headers: probe.headers });
  expect(withdrawn.status()).toBe(200);

  // La siguiente orden de juego (caminar guarda la posición) recibe 403 CONSENT_REQUIRED: vuelve el aviso.
  await createWorldInputDriver(page, 'keyboard').nudge('ArrowLeft');
  await expect(consentDialog(page)).toBeVisible({ timeout: scaled(30_000) });
  // Sin error genérico: ni «No tienes permisos», ni la pantalla de fallo del juego, ni un aviso del sistema.
  await expect(page.getByText('No tienes permisos para realizar esta acción.')).toHaveCount(0);
  await expect(page.locator('.game-failure')).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  // Sin consentimiento no hay mundo ni HUD.
  await expect(page.locator('app-game-world')).toHaveCount(0);
  await expect(page.locator('app-simulation-hud')).toHaveCount(0);
  // El intento no se perdió: sigue en curso y es el mismo.
  const history = (await (await request.get('/api/simulation/attempts/history', { headers: probe.headers })).json()).data as Array<{ attemptId: string; status: string }>;
  expect(history.find(row => row.attemptId === attempt.attemptId)?.status).toBe('IN_PROGRESS');

  // Aceptar de nuevo devuelve el juego, en el mismo intento.
  await consentDialog(page).getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
  expect((await readConsentState(page, caseVersionId)).accepted).toBe(true);
  expect((await currentAttempt(page, caseVersionId)).attemptId).toBe(attempt.attemptId);
});

// ── B4b (rediseño 2026-11-21): el aviso se lee y se acepta en la FICHA; el juego lo conserva como red de seguridad ──
// req: ETH-01, RF-16, DP-09, DP-26, REGLA-004
test.describe('@ficha el aviso en la ficha y el umbral', () => {
  /** Abre la ficha del primer caso del catálogo, partiendo de «sin consentimiento». */
  async function openBrief(page: Page): Promise<number> {
    // Devuelve los casos que le ofrece al estudiante: se usa el primero.
    const [caseVersionId] = await resetStudentConsent(page);
    await page.goto(`/portal/simulador/${caseVersionId}/ficha`);
    await expect(page.locator('#aviso')).toBeVisible({ timeout: scaled(30_000) });
    return caseVersionId;
  }

  test('el aviso va antes del contexto; «Comenzar» lo registra y el juego entra al umbral sin volver a pedirlo', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    await login(page);
    const caseVersionId = await openBrief(page);
    const avisoAntes = await page.evaluate(() => {
      const aviso = document.querySelector('#aviso');
      const contexto = document.querySelector('.brief-context');
      return !!aviso && (!contexto || !!(aviso.compareDocumentPosition(contexto) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(avisoAntes, 'el aviso de contenido va antes del contexto').toBe(true);
    const card = await enterCaseThroughBrief(page);
    expect((await readConsentState(page, caseVersionId)).accepted, 'la ficha lo registró en el servidor').toBe(true);
    await expect(consentDialog(page), 'el juego no repite el aviso').toHaveCount(0);
    // Una sola pantalla entre la ficha y el mundo: el umbral, con la tarjeta y la salida segura dentro.
    await expect(page.locator('app-umbral-caso')).toHaveCount(1);
    await expect(card.getByRole('button', { name: /salida segura/i })).toBeVisible();
    await card.getByRole('button', { name: /^continuar$/i }).click();
    await waitForWorldReady(page);
    await expect(page.locator('app-umbral-caso')).toHaveCount(0, { timeout: scaled(5_000) });
    await expect(page.getByRole('button', { name: /salida segura/i }).first()).toBeVisible();
  });

  // Control negativo de DP-26: la URL con ?intento=nuevo (la de antes) ya no reemplaza nada.
  test('?intento=nuevo por URL no reemplaza el intento abierto: se ofrece reanudar', async ({ page }) => {
    test.setTimeout(scaled(120_000));
    await login(page);
    const caseVersionId = await openBrief(page);
    await enterCaseThroughBrief(page);   // deja un intento abierto
    const attemptStarts: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/simulation\/attempts\/?$/.test(request.url())) attemptStarts.push(request.postData() ?? '');
    });
    await page.goto(`/portal/simulador/${caseVersionId}?intento=nuevo`);
    await expect(page.getByRole('dialog').filter({ hasText: 'Continuar simulación formativa' })).toBeVisible({ timeout: scaled(30_000) });
    expect(attemptStarts.filter(body => /"forceNew":true/.test(body))).toEqual([]);
  });
});
