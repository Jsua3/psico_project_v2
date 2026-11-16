import type { Page, Request, Response, Route } from '@playwright/test';

import { captureApiBodies, fulfillFromNode, isApiUrl, readJson, readText } from './api-bodies';

/** Una ruta falsa de Playwright: la petición, lo que devuelve `fetch` y lo que se entregó o abortó. */
function fakeRoute(request: Request, fetched: { body: string } | Error, fulfill: () => Promise<void> = async () => undefined) {
  const calls: { fulfilled?: { body: Buffer }; aborted?: string; continued?: boolean; fetchOptions?: { maxRetries?: number } } = {};
  const route = {
    request: () => request,
    fetch: async (options: { maxRetries?: number }) => {
      calls.fetchOptions = options;
      if (fetched instanceof Error) throw fetched;
      return { body: async () => Buffer.from(fetched.body) };
    },
    fulfill: async (options: { body: Buffer }) => { calls.fulfilled = options; await fulfill(); },
    abort: async (code: string) => { calls.aborted = code; },
    continue: async () => { calls.continued = true; },
  } as unknown as Route;
  return { route, calls };
}

const peticion = (method: string) => ({ method: () => method }) as unknown as Request;

/** Una respuesta falsa cuyo cuerpo en Chromium no está (como el `ERR_ABORTED` del runner) o es `chromiumBody`. */
function fakeResponse(request: Request, chromiumBody?: string): Response {
  const missing = () => Promise.reject(new Error('Protocol error (Network.getResponseBody): No data found for resource with given identifier'));
  return {
    request: () => request,
    text: () => (chromiumBody === undefined ? missing() : Promise.resolve(chromiumBody)),
    json: () => (chromiumBody === undefined ? missing() : Promise.resolve(JSON.parse(chromiumBody))),
  } as unknown as Response;
}

describe('api-bodies (cuerpos de la API leídos en Node, no en Chromium)', () => {
  it('captura solo la API del propio origen', () => {
    expect(isApiUrl(new URL('http://127.0.0.1:4315/api/simulation/attempts/a/decisions'))).toBe(true);
    expect(isApiUrl(new URL('http://127.0.0.1:4315/api/auth/login'))).toBe(true);
    expect(isApiUrl(new URL('http://127.0.0.1:4315/assets/game/scenarios/hospital.json'))).toBe(false);
    expect(isApiUrl(new URL('http://127.0.0.1:4315/apiario'))).toBe(false);
    expect(isApiUrl(new URL('ws://127.0.0.1:4315/'))).toBe(false);
  });

  it('readJson lee el cuerpo que capturó Node aunque Chromium no lo tenga', async () => {
    const request = {} as Request;
    const { route, calls } = fakeRoute(request, { body: '{"data":{"attemptId":"a","status":"IN_PROGRESS"}}' });

    await fulfillFromNode(route);

    expect(calls.fulfilled?.body.toString('utf8')).toBe('{"data":{"attemptId":"a","status":"IN_PROGRESS"}}');
    await expect(readJson(fakeResponse(request))).resolves.toEqual({ data: { attemptId: 'a', status: 'IN_PROGRESS' } });
    await expect(readText(fakeResponse(request))).resolves.toBe('{"data":{"attemptId":"a","status":"IN_PROGRESS"}}');
  });

  it('sin captura (otra ruta atendió la petición) cae a lo que guardó Chromium', async () => {
    await expect(readJson(fakeResponse({} as Request, '{"data":{"ok":true}}'))).resolves.toEqual({ data: { ok: true } });
    await expect(readJson(fakeResponse({} as Request))).rejects.toThrow(/No data found/);
  });

  it('reintenta las conexiones que el servidor ya cerró (ECONNRESET) antes de rendirse', async () => {
    const { route, calls } = fakeRoute(peticion('GET'), { body: '{}' });

    await fulfillFromNode(route);

    expect(calls.fetchOptions?.maxRetries).toBeGreaterThanOrEqual(1);
  });

  it('si Node no obtiene respuesta de una lectura (GET), la pide el navegador por su cuenta y no queda nada capturado', async () => {
    const request = peticion('GET');
    const { route, calls } = fakeRoute(request, new Error('read ECONNRESET'));

    await fulfillFromNode(route);

    expect(calls.continued).toBe(true);
    expect(calls.aborted).toBeUndefined();
    expect(calls.fulfilled).toBeUndefined();
    await expect(readJson(fakeResponse(request, '{"desde":"chromium"}'))).resolves.toEqual({ desde: 'chromium' });
  });

  // CI del #111 (corrida 43348416800): la página navegó o la prueba terminó con una petición en vuelo y leer el cuerpo
  // lanzó «Response has been disposed»; el error salía del manejador y tumbaba la prueba.
  it('si la respuesta de Node quedó desechada (la página navegó o la prueba terminó), no tumba la prueba', async () => {
    const request = peticion('GET');
    const calls: { continued?: boolean; fulfilled?: boolean } = {};
    const desechada = () => Promise.reject(new Error('apiResponse.body: Response has been disposed'));
    const cerrada = () => Promise.reject(new Error('Target page, context or browser has been closed'));
    const route = {
      request: () => request,
      fetch: async () => ({ body: desechada }),
      fulfill: async () => { calls.fulfilled = true; },
      continue: async () => { calls.continued = true; return cerrada(); },
      abort: cerrada,
    } as unknown as Route;

    await expect(fulfillFromNode(route)).resolves.toBeUndefined();
    expect(calls.continued, 'una lectura se le devuelve al navegador').toBe(true);
    expect(calls.fulfilled).toBeUndefined();
  });

  it('si la ruta ya no existe cuando Node falla (contexto cerrado), tampoco lanza', async () => {
    const cerrada = () => Promise.reject(new Error('Target page, context or browser has been closed'));
    const route = {
      request: () => peticion('POST'),
      fetch: cerrada,
      fulfill: cerrada,
      continue: cerrada,
      abort: cerrada,
    } as unknown as Route;

    await expect(fulfillFromNode(route)).resolves.toBeUndefined();
  });

  it('si Node no obtiene respuesta de un envío (POST), no lo repite: el navegador ve un fallo de red', async () => {
    const request = peticion('POST');
    const { route, calls } = fakeRoute(request, new Error('connect ECONNREFUSED'));

    await fulfillFromNode(route);

    expect(calls.aborted).toBe('failed');
    expect(calls.continued).toBeUndefined();
    expect(calls.fulfilled).toBeUndefined();
  });

  it('si la página recargó antes de entregar, no rompe la prueba y el cuerpo sigue legible', async () => {
    const request = {} as Request;
    const { route } = fakeRoute(request, { body: '{"data":1}' }, () => Promise.reject(new Error('Target page has been closed')));

    await expect(fulfillFromNode(route)).resolves.toBeUndefined();
    await expect(readJson(fakeResponse(request))).resolves.toEqual({ data: 1 });
  });

  it('captureApiBodies registra la ruta de la API una sola vez en el contexto, no en la página', async () => {
    const routes: { matcher: unknown; handler: unknown }[] = [];
    const context = { route: async (matcher: unknown, handler: unknown) => { routes.push({ matcher, handler }); } };
    const page = { context: () => context, route: () => { throw new Error('la captura no va en la página'); } } as unknown as Page;
    const otherPageSameContext = { context: () => context } as unknown as Page;

    await captureApiBodies(page);
    await captureApiBodies(page);
    await captureApiBodies(otherPageSameContext);

    expect(routes).toEqual([{ matcher: isApiUrl, handler: fulfillFromNode }]);
  });
});
