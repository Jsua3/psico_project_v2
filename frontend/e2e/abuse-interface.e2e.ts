import { expect, test } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { loginStudent } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Casos de abuso que solo se ven en un navegador (S7-1b, plan 03 de seguridad; el resto de la tabla está en pytest,
 * `apps/security/tests/test_abuse_cases.py`, y en la matriz HTTP, `scripts/api-e2e.mjs`):
 *
 * 1. `returnUrl` hostil: el acceso solo vuelve a rutas internas; lo demás se descarta y se entra al panel.
 * 2. El marcado que la API rechaza en la solicitud de acceso no se ejecuta: la pantalla cuenta el rechazo como TEXTO.
 * 3. Lo que el servidor entregue como nombre (aunque llevara marcado) se muestra como texto, nunca como HTML.
 *
 * Cada prueba hostil lleva su control: la misma ruta con un valor normal funciona, así que el vigilante no pasa en vacío.
 * Todas vigilan lo mismo: ninguna petición hacia el host ajeno, ningún `dialog` (alert/confirm/prompt), ningún
 * `<img src="x">` en el DOM y `window.__pwned` sin definir (lo que fijaría el `onerror` de la carga útil).
 */

const EVIL_HOST = 'evil.example';
/** Carga útil de XSS clásica: si algo la insertara como HTML, el `onerror` fijaría `window.__pwned`. */
const HOSTILE_MARKUP = '<img src=x onerror="window.__pwned=1">';
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface Observed {
  /** Peticiones que salieron hacia el host ajeno (interceptadas y abortadas). */
  outbound: string[];
  /** Cuadros de diálogo del navegador (alert, confirm, prompt, beforeunload) que salieron. */
  dialogs: string[];
  /** Peticiones a la ruta `/x`: la que haría un `<img src=x>` si llegara a existir en el DOM. */
  imageRequests: string[];
}

/** Empieza a vigilar lo que no debe pasar. Registra y descarta (el diálogo se cierra, la petición se aborta). */
async function watch(page: Page): Promise<Observed> {
  const observed: Observed = { outbound: [], dialogs: [], imageRequests: [] };
  page.on('dialog', async dialog => {
    observed.dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/x') observed.imageRequests.push(request.url());
  });
  // En el contexto y no en la página: también cubre una ventana emergente.
  await page.context().route(url => url.hostname === EVIL_HOST, route => {
    observed.outbound.push(route.request().url());
    return route.abort();
  });
  return observed;
}

/** Lo que fijaría el `onerror` de la carga útil. Antes de leerlo se deja pasar el tiempo en que un `<img src=x>` fallaría. */
async function pwned(page: Page): Promise<unknown> {
  await page.waitForTimeout(scaled(400));
  return page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned);
}

async function expectNothingHappened(page: Page, observed: Observed): Promise<void> {
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await pwned(page), 'window.__pwned debería seguir sin definir').toBeUndefined();
  expect(observed.dialogs, 'no debería salir ningún cuadro de diálogo').toEqual([]);
  expect(observed.outbound, `ninguna petición debería salir hacia ${EVIL_HOST}`).toEqual([]);
  expect(observed.imageRequests, 'nada debería pedir la imagen «x»').toEqual([]);
}

// ── 1. returnUrl hostil ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Inicia sesión como el estudiante desde la página de acceso ya abierta (con su `returnUrl`). Si el acceso no termina en el
 * portal, el error dice dónde quedó la página y qué alcanzó a salir, que es lo que se necesita para entender el fallo.
 */
async function signIn(page: Page, observed: Observed): Promise<void> {
  try {
    await loginStudent(page);
  } catch (error) {
    throw new Error(
      `El acceso no terminó en el portal (URL: ${page.url()}; peticiones a ${EVIL_HOST}: ${JSON.stringify(observed.outbound)}; `
      + `diálogos: ${JSON.stringify(observed.dialogs)}): ${String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Cada valor se codifica como lo haría un enlace de ataque. El último ya trae sus escapes: codificado otra vez, el
 * router lo entrega como `%2F%2Fevil.example` y un segundo `decodeURIComponent` descuidado lo volvería `//evil.example`.
 */
const HOSTILE_RETURN_URLS = ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '%2F%2Fevil.example'];

for (const hostile of HOSTILE_RETURN_URLS) {
  // req: RNF-002, BLOQUE-L (returnUrl hostil, S7-1), H-34 (plan visual F3-6)
  test(`returnUrl hostil «${hostile}»: se descarta, se entra al panel y no se sale de la aplicación`, async ({ page, baseURL }) => {
    const observed = await watch(page);
    await page.goto(`/login?returnUrl=${encodeURIComponent(hostile)}`);
    await signIn(page, observed);

    const finalUrl = new URL(page.url());
    expect(finalUrl.origin, 'la URL final debe seguir en el origen de la aplicación').toBe(new URL(baseURL!).origin);
    expect(finalUrl.pathname, 'no debe quedarse en el acceso').not.toBe('/login');
    // Lo rechazado se sustituye por el destino por defecto: sin esto, una ruta interna "inventada" (/evil.example/x)
    // también pasaría las dos comprobaciones de arriba.
    expect(finalUrl.pathname, 'el valor hostil debe sustituirse por el panel').toBe('/portal/dashboard');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: scaled(30_000) });
    await expectNothingHappened(page, observed);
  });
}

// req: RNF-002, BLOQUE-L (control del returnUrl hostil), H-34
test('control: un returnUrl interno válido SÍ se respeta', async ({ page, baseURL }) => {
  const observed = await watch(page);
  await page.goto(`/login?returnUrl=${encodeURIComponent('/portal/simulador')}`);
  await signIn(page, observed);

  await expect.poll(() => new URL(page.url()).pathname, { timeout: scaled(30_000) }).toBe('/portal/simulador');
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: scaled(30_000) });
  expect(observed.outbound).toEqual([]);
  expect(observed.dialogs).toEqual([]);
});

// ── 2. El marcado que la API rechaza no se ejecuta ─────────────────────────────────────────────────────────────────

/** Abre el formulario público de «Solicitar acceso» (desde el acceso) y lo llena; no lo envía. */
async function fillAccessRequest(page: Page, nombre: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Solicitar acceso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Solicitar acceso' })).toBeVisible({ timeout: scaled(15_000) });
  await page.locator('#registro-nombre').fill(nombre);
  await page.locator('#registro-apellido').fill('Prueba');
  await page.locator('#registro-email').fill(`abuso.${stamp()}@psychosim.edu.co`);
}

async function submitAccessRequest(page: Page): Promise<Response> {
  const responded = page.waitForResponse(
    response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/auth/access-request',
    { timeout: scaled(30_000) },
  );
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  return responded;
}

// req: RNF-002, LS-15 (XSS: la API rechaza el marcado y la interfaz lo cuenta como texto)
test('el marcado que la API rechaza no se ejecuta: el servidor responde 400 y la pantalla lo muestra como texto', async ({ page }) => {
  const observed = await watch(page);
  await fillAccessRequest(page, HOSTILE_MARKUP);
  const response = await submitAccessRequest(page);

  expect(response.status(), 'la API debe rechazar el nombre con marcado').toBe(400);
  // El texto del rechazo, tal como lo da el servidor, se lee con una llamada directa a la API: el cuerpo de una respuesta de la
  // página puede dejar de estar disponible para el protocolo del navegador a media prueba (pasó en una corrida real).
  const direct = await page.request.post('/api/auth/access-request', {
    data: { nombre: HOSTILE_MARKUP, apellido: 'Prueba', email: `abuso.${stamp()}@psychosim.edu.co` },
  });
  expect(direct.status(), 'la API debe rechazar el nombre con marcado también por llamada directa').toBe(400);
  const message = (await direct.json()).message as string;
  expect(message.length).toBeGreaterThan(0);
  const error = page.locator('.acceso__error');
  await expect(error).toBeVisible({ timeout: scaled(15_000) });
  await expect(error, 'el mensaje del servidor llega como texto').toHaveText(message);
  await expect(error.locator('*'), 'ningún elemento dentro del mensaje').toHaveCount(0);
  await expect(page.locator('.acceso__notice'), 'no debe contar como enviada').toHaveCount(0);
  await expectNothingHappened(page, observed);
});

// req: RNF-002, LS-15 (control: un nombre normal envía la solicitud)
test('control: un nombre normal envía la solicitud', async ({ page }) => {
  const observed = await watch(page);
  await fillAccessRequest(page, 'Camila');
  const response = await submitAccessRequest(page);

  expect([200, 201]).toContain(response.status());
  await expect(page.locator('.acceso__notice')).toBeVisible({ timeout: scaled(15_000) });
  await expect(page.locator('.acceso__error')).toHaveCount(0);
  await expectNothingHappened(page, observed);
});

// ── 3. La interfaz muestra como texto lo que el servidor le entregue ───────────────────────────────────────────────

/**
 * Las cuentas y las solicitudes de acceso pendientes del ADMIN (la misma pantalla) con el servidor simulado: la API real
 * rechazaría el marcado al guardarlo, así que aquí se prueba la segunda barrera, la del cliente. Cada lista trae UNA fila.
 */
async function openAdminUsers(page: Page, nombre: string): Promise<{ account: Locator; request: Locator }> {
  await loginAs(page, 'admin');
  await page.route('**/api/admin/users', route => route.request().method() === 'GET'
    ? route.fulfill({
      json: {
        success: true,
        data: [{ id: 9001, nombre, apellido: 'Prueba', email: 'abuso.lista@psychosim.edu.co', role: 'ESTUDIANTE', activo: true }],
      },
    })
    : route.fallback());
  await page.route('**/api/admin/access-requests**', route => route.request().method() === 'GET'
    ? route.fulfill({
      json: {
        success: true,
        data: [{
          id: 9101, nombre, apellido: 'Solicitud', email: 'solicitud.abuso@psychosim.edu.co', status: 'PENDING',
          created_at: '2026-10-18T10:00:00Z', reviewed_at: null,
        }],
      },
    })
    : route.fallback());
  await page.goto('/portal/admin/usuarios');
  const account = page.locator('th.us-name');
  const request = page.locator('.us-request__text strong');
  await expect(account).toHaveCount(1, { timeout: scaled(30_000) });
  await expect(account).toBeVisible();
  return { account, request };
}

/** La docente: su lista de grupos, con UN grupo cuyo nombre entrega el servidor. */
async function openTeacherGroups(page: Page, nombre: string): Promise<Locator> {
  await loginAs(page, 'profesor');
  await page.route('**/api/grupos', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { success: true, data: [{ id: 9001, nombre, codigo: 'ABUSO-9001', totalEstudiantes: 0 }] } })
    : route.fallback());
  await page.goto('/portal/grupos');
  const group = page.locator('.gl-groups .gl-group__name');
  await expect(group).toHaveCount(1, { timeout: scaled(30_000) });
  await expect(group).toBeVisible();
  return group;
}

// req: RNF-002, LS-15 (la interfaz muestra como texto lo que el servidor entregue)
test('el nombre con marcado que entregue el servidor se muestra como texto: usuarios y solicitudes del ADMIN', async ({ page }) => {
  const observed = await watch(page);
  const { account, request } = await openAdminUsers(page, HOSTILE_MARKUP);

  for (const cell of [account, request]) {
    if (cell === request) {
      await page.getByRole('radio', { name: /^Solicitudes/ }).click();
      await expect(request).toHaveCount(1, { timeout: scaled(30_000) });
      await expect(request).toBeVisible();
    }
    await expect(cell, 'el texto literal de la carga útil está a la vista').toContainText(HOSTILE_MARKUP);
    await expect(cell.locator('*'), 'no se insertó ningún elemento dentro de la celda').toHaveCount(0);
  }
  await expectNothingHappened(page, observed);
});

// req: RNF-002, LS-15 (la interfaz muestra como texto lo que el servidor entregue)
test('el nombre con marcado que entregue el servidor se muestra como texto: grupos de la docente', async ({ page }) => {
  const observed = await watch(page);
  const group = await openTeacherGroups(page, HOSTILE_MARKUP);

  await expect(group, 'el texto literal de la carga útil está a la vista').toContainText(HOSTILE_MARKUP);
  await expect(group.locator('*'), 'no se insertó ningún elemento dentro de la celda').toHaveCount(0);
  await expectNothingHappened(page, observed);
});

// req: RNF-002, LS-15 (control: el mismo recorrido del ADMIN con un nombre normal)
test('control: el mismo nombre normal se muestra en usuarios y solicitudes del ADMIN', async ({ page }) => {
  const observed = await watch(page);
  const { account, request } = await openAdminUsers(page, 'Camila');

  await expect(account).toContainText('Camila Prueba');
  await page.getByRole('radio', { name: /^Solicitudes/ }).click();
  await expect(request).toHaveCount(1, { timeout: scaled(30_000) });
  await expect(request).toBeVisible();
  await expect(request).toContainText('Camila Solicitud');
  await expectNothingHappened(page, observed);
});

// req: RNF-002, LS-15 (control: el mismo recorrido de la docente con un nombre normal)
test('control: el mismo nombre normal se muestra en los grupos de la docente', async ({ page }) => {
  const observed = await watch(page);
  const group = await openTeacherGroups(page, 'Camila Prueba');

  await expect(group).toContainText('Camila Prueba');
  await expectNothingHappened(page, observed);
});
