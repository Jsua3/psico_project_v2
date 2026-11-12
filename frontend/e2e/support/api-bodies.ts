import type { BrowserContext, Page, Request, Response, Route } from '@playwright/test';

import { scaled } from './time-scale';

/**
 * Cuerpos de las respuestas de la API leídos en Node, no en Chromium.
 *
 * La app pide la API con el FetchBackend de Angular (sin `withXhr`, E5-8). En el runner del CI (Chromium 156 sin GPU,
 * con el juego ocupando el hilo principal) Chromium marca a veces como `net::ERR_ABORTED` una respuesta 200 que la app
 * SÍ leyó, y no le guarda el cuerpo a DevTools: `response.json()` de Playwright falla entonces con
 * «Network.getResponseBody: No data found for resource with given identifier», o se queda esperando para siempre,
 * aunque la pantalla siguió bien. Así se cayeron 2-6 de los 6 recorridos completos cada noche desde que el nocturno
 * volvió a correr (2026-11-01), y pruebas sueltas del E2E de los PR.
 *
 * `captureApiBodies` pide cada `/api/**` desde Node (`route.fetch`), guarda el cuerpo y se lo entrega intacto al
 * navegador (`route.fulfill`). `readJson` y `readText` lo toman de aquí y solo caen a lo que guardó Chromium cuando la
 * respuesta no pasó por la captura (una ruta propia de la prueba la atendió o la siguió con `route.continue()`).
 * Toda lectura del cuerpo de una respuesta que vio el NAVEGADOR (`page.waitForResponse`, `page.on('response')`) va
 * por `readJson`/`readText`; las de `APIRequestContext` (`request.get`, `page.request`) no lo necesitan.
 */
const bodies = new WeakMap<Request, Buffer>();
const capturing = new WeakSet<BrowserContext>();

/** Solo la API del propio origen: los recursos del juego y el WebSocket del servidor de desarrollo siguen directos. */
export function isApiUrl(url: URL): boolean {
  return url.pathname.startsWith('/api/');
}

/** Atiende una petición de la API desde Node y deja su cuerpo a mano de `readJson`/`readText`. */
export async function fulfillFromNode(route: Route): Promise<void> {
  let response;
  try {
    response = await route.fetch({ timeout: scaled(60_000) });
  } catch {
    // Sin respuesta (el servidor no contestó o la página ya no existe): el navegador ve un fallo de red, como sin captura.
    await route.abort('failed').catch(() => undefined);
    return;
  }
  const body = await response.body();
  bodies.set(route.request(), body);
  // La página pudo recargar o cerrarse mientras tanto: entonces ya nadie espera esta respuesta.
  await route.fulfill({ response, body }).catch(() => undefined);
}

/**
 * Desde aquí, cada `/api/**` del contexto de la página pasa por `fulfillFromNode`. Va en el CONTEXTO y no en la página:
 * las rutas de página que registre la prueba (simulaciones del servidor) mandan siempre sobre ésta, en cualquier orden,
 * y con `route.fallback()` la respuesta igual pasa por aquí. Llamarla otra vez en el mismo contexto no hace nada.
 */
export async function captureApiBodies(page: Pick<Page, 'context'>): Promise<void> {
  const context = page.context();
  if (capturing.has(context)) return;
  capturing.add(context);
  await context.route(isApiUrl, fulfillFromNode);
}

/** El cuerpo como texto: el que capturó Node si la respuesta pasó por la captura; si no, el que guardó Chromium. */
export async function readText(response: Response): Promise<string> {
  const body = bodies.get(response.request());
  return body ? body.toString('utf8') : response.text();
}

/** El cuerpo como JSON, con el mismo origen que `readText`. */
export async function readJson<T = any>(response: Response): Promise<T> {
  return JSON.parse(await readText(response)) as T;
}
