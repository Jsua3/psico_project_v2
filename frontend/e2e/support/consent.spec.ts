import type { APIRequestContext, Page } from '@playwright/test';

import { probeStudentConsent, readConsentState, resetStudentConsent, studentToken } from './consent';

/**
 * Ayudas de las pruebas e2e para el consentimiento al aviso de contenido (S3-2b). El consentimiento vive en el servidor y lo
 * recuerda el siguiente recorrido (aunque sea otro navegador): las pruebas que necesitan ver el aviso parten de «sin
 * consentimiento», retirándolo por la API. Aquí se prueba esa ayuda con una página de mentira (sin navegador).
 */
// req: ETH-01, SIEP-RF-05
interface Call { method: 'GET' | 'DELETE'; url: string; headers: Record<string, string> }

function fakeResponse(status: number, body: unknown = {}) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    url: () => 'http://servidor/api',
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function fakePage(options: {
  token?: string | null;
  cases?: number[];
  listStatus?: number;
  deleteStatus?: (caseVersionId: number) => number;
  state?: unknown;
}) {
  const calls: Call[] = [];
  const page = {
    evaluate: async (_fn: unknown, key: string) => {
      calls.push({ method: 'GET', url: `localStorage:${key}`, headers: {} });
      return options.token === undefined ? 'jwt-de-prueba' : options.token;
    },
    request: {
      get: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ method: 'GET', url, headers: init.headers });
        if (url.endsWith('/api/simulation/cases')) {
          return fakeResponse(options.listStatus ?? 200, { data: (options.cases ?? [7]).map(caseVersionId => ({ caseVersionId })) });
        }
        return fakeResponse(200, { data: options.state ?? { required: false, noticeVersion: 'v', accepted: false, acceptedAt: null } });
      },
      delete: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ method: 'DELETE', url, headers: init.headers });
        const id = Number(/cases\/(\d+)\/consent/.exec(url)![1]);
        return fakeResponse(options.deleteStatus?.(id) ?? 200, { data: { caseVersionId: id, withdrawnAt: null } });
      },
    },
  };
  return { page: page as unknown as Pick<Page, 'evaluate' | 'request'>, calls };
}

describe('resetStudentConsent (e2e)', () => {
  it('retira, con la sesión del estudiante, el consentimiento de cada caso que le ofrecen', async () => {
    const { page, calls } = fakePage({ cases: [7, 9] });

    const reset = await resetStudentConsent(page);

    expect(reset).toEqual([7, 9]);
    const requests = calls.filter(call => !call.url.startsWith('localStorage:'));
    expect(requests.map(call => `${call.method} ${call.url}`)).toEqual([
      'GET /api/simulation/cases',
      'DELETE /api/simulation/cases/7/consent',
      'DELETE /api/simulation/cases/9/consent',
    ]);
    for (const call of requests) expect(call.headers).toEqual({ Authorization: 'Bearer jwt-de-prueba' });
    expect(calls[0].url).toBe('localStorage:psychosim_token'); // el token es el que guarda la aplicación
  });

  it('sin casos no retira nada', async () => {
    const { page, calls } = fakePage({ cases: [] });
    expect(await resetStudentConsent(page)).toEqual([]);
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  });

  it('un caso que el servidor ya no ofrece (404) no es un fallo: no hay nada que retirar', async () => {
    const { page } = fakePage({ cases: [7, 9], deleteStatus: id => (id === 7 ? 404 : 200) });
    expect(await resetStudentConsent(page)).toEqual([7, 9]);
  });

  it('cualquier otro fallo al retirar se dice (no se sigue con un consentimiento que podría seguir ahí)', async () => {
    const { page } = fakePage({ cases: [7], deleteStatus: () => 500 });
    await expect(resetStudentConsent(page)).rejects.toThrow(/caso 7.*500/);
  });

  it('si no se puede leer la lista de casos, se dice', async () => {
    const { page } = fakePage({ listStatus: 401 });
    await expect(resetStudentConsent(page)).rejects.toThrow(/lista de casos.*401/);
  });

  it('sin sesión iniciada en la página, se dice cómo arreglarlo', async () => {
    const { page } = fakePage({ token: null });
    await expect(resetStudentConsent(page)).rejects.toThrow(/inicia sesión/);
  });
});

describe('probeStudentConsent (e2e): ¿exige el servidor de esta corrida el consentimiento?', () => {
  /** Una contraseña generada en ejecución: ninguna clave literal en las pruebas. */
  const generatedPassword = `p-${globalThis.crypto.randomUUID()}`;

  function fakeRequest(options: { loginStatus?: number; cases?: number[]; required?: boolean } = {}) {
    const calls: string[] = [];
    const request = {
      post: async (url: string, init: { data: { email: string; password: string } }) => {
        calls.push(`POST ${url} ${init.data.email}`);
        return fakeResponse(options.loginStatus ?? 200, { data: { token: 'jwt-del-api' } });
      },
      get: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push(`GET ${url} ${init.headers['Authorization']}`);
        if (url.endsWith('/api/simulation/cases')) {
          return fakeResponse(200, { data: (options.cases ?? [7, 9]).map(caseVersionId => ({ caseVersionId })) });
        }
        return fakeResponse(200, {
          data: { required: options.required ?? true, noticeVersion: 'aviso-vigente', accepted: false, acceptedAt: null },
        });
      },
    };
    return { request: request as unknown as Pick<APIRequestContext, 'post' | 'get'>, calls };
  }

  it('entra por la API como el estudiante, toma su primer caso y lee lo que el servidor dice de él', async () => {
    const { request, calls } = fakeRequest({ required: true });

    const probe = await probeStudentConsent(request, { email: 'estudiante@ejemplo.test', password: generatedPassword });

    expect(probe).toEqual({
      headers: { Authorization: 'Bearer jwt-del-api' },
      caseVersionId: 7,
      state: { required: true, noticeVersion: 'aviso-vigente', accepted: false, acceptedAt: null },
    });
    expect(calls).toEqual([
      'POST /api/auth/login estudiante@ejemplo.test',
      'GET /api/simulation/cases Bearer jwt-del-api',
      'GET /api/simulation/cases/7/consent Bearer jwt-del-api',
    ]);
  });

  it('un servidor que no exige el consentimiento se nota en `state.required`', async () => {
    const probe = await probeStudentConsent(fakeRequest({ required: false }).request, { email: 'e@ejemplo.test', password: generatedPassword });
    expect(probe.state.required).toBe(false);
  });

  it('sin casos que jugar, o con un login que falla, se dice', async () => {
    await expect(probeStudentConsent(fakeRequest({ cases: [] }).request, { email: 'e@ejemplo.test', password: generatedPassword }))
      .rejects.toThrow(/ningún caso/);
    await expect(probeStudentConsent(fakeRequest({ loginStatus: 401 }).request, { email: 'e@ejemplo.test', password: generatedPassword }))
      .rejects.toThrow(/login.*401/);
  });
});

describe('studentToken y readConsentState (e2e)', () => {
  it('studentToken devuelve el de la sesión de la página', async () => {
    expect(await studentToken(fakePage({ token: 'otro-jwt' }).page)).toBe('otro-jwt');
  });

  it('readConsentState lee lo que el servidor dice del caso, con la sesión del estudiante', async () => {
    const state = { required: true, noticeVersion: 'aviso-vigente', accepted: false, acceptedAt: null };
    const { page, calls } = fakePage({ state });

    expect(await readConsentState(page, 7)).toEqual(state);

    const request = calls.find(call => call.url.endsWith('/cases/7/consent'))!;
    expect(request.headers).toEqual({ Authorization: 'Bearer jwt-de-prueba' });
  });
});
