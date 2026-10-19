import type { APIRequestContext, Page } from '@playwright/test';

/**
 * El consentimiento al aviso de contenido vive en el SERVIDOR (S3-2b; ETH-01, SIEP-RF-05): lo que acepta un recorrido lo
 * recuerda el siguiente, aunque sea otro navegador, y entonces el aviso no vuelve a salir. Las pruebas que necesitan ver el
 * aviso (o pasar por él para llegar al juego) parten de «sin consentimiento»: lo retiran por la API de los casos del
 * estudiante, que es idempotente y solo toca el consentimiento (no el intento ni lo hecho).
 *
 * Este módulo no importa nada de ejecución de Playwright: las pruebas unitarias de `e2e/support/*.spec.ts` lo cargan.
 */

/** Dónde guarda la aplicación el token de la sesión (`AuthService`). */
const TOKEN_KEY = 'psychosim_token';

type PageApi = Pick<Page, 'evaluate' | 'request'>;

export interface ConsentState {
  required: boolean;
  noticeVersion: string;
  accepted: boolean;
  acceptedAt: string | null;
}

/** El token de la sesión que la página tiene iniciada (hay que haber entrado al portal antes). */
export async function studentToken(page: Pick<Page, 'evaluate'>): Promise<string> {
  const token = await page.evaluate(key => window.localStorage.getItem(key), TOKEN_KEY);
  if (!token) throw new Error('No hay una sesión iniciada en la página: inicia sesión antes de tocar el consentimiento.');
  return token;
}

async function explain(response: { status(): number; text(): Promise<string> }): Promise<string> {
  const body = await response.text().catch(() => '<cuerpo no disponible>');
  return `HTTP ${response.status()} — ${body.slice(0, 300)}`;
}

/**
 * Retira el consentimiento de CADA caso que el servidor le ofrece al estudiante de la página (lo deja «sin aceptar»).
 * Devuelve los casos recorridos. Un 404 no es un fallo: el caso ya no se ofrece y no hay nada que retirar.
 */
export async function resetStudentConsent(page: PageApi): Promise<number[]> {
  const headers = { Authorization: `Bearer ${await studentToken(page)}` };
  const listed = await page.request.get('/api/simulation/cases', { headers });
  if (!listed.ok()) throw new Error(`No se pudo leer la lista de casos del estudiante: ${await explain(listed)}`);
  const cases = ((await listed.json()).data ?? []) as Array<{ caseVersionId: number }>;
  const reset: number[] = [];
  for (const { caseVersionId } of cases) {
    const withdrawn = await page.request.delete(`/api/simulation/cases/${caseVersionId}/consent`, { headers });
    if (!withdrawn.ok() && withdrawn.status() !== 404) {
      throw new Error(`No se pudo retirar el consentimiento del caso ${caseVersionId}: ${await explain(withdrawn)}`);
    }
    reset.push(caseVersionId);
  }
  return reset;
}

/** Las credenciales del estudiante de la semilla; el entorno puede sustituirlas (como en el resto de las pruebas e2e). */
function seededStudent(): { email: string; password: string } {
  return {
    email: process.env['E2E_STUDENT_EMAIL'] ?? 'estudiante@psychosim.edu.co',
    password: process.env['E2E_STUDENT_PASSWORD'] ?? 'Estudiante123!',
  };
}

/**
 * Sin navegador: entra por la API como el estudiante, toma el primer caso que se le ofrece y lee lo que el servidor dice de
 * su consentimiento. `state.required` es la verdad de ESTA corrida: las pruebas que solo tienen sentido con
 * `SIEP_CONSENT_REQUIRED=true` se saltan cuando es falso.
 */
export async function probeStudentConsent(
  request: Pick<APIRequestContext, 'post' | 'get'>,
  credentials: { email: string; password: string } = seededStudent(),
): Promise<{ headers: Record<string, string>; caseVersionId: number; state: ConsentState }> {
  const login = await request.post('/api/auth/login', { data: credentials });
  if (!login.ok()) throw new Error(`No se pudo entrar por la API como estudiante (login): ${await explain(login)}`);
  const headers = { Authorization: `Bearer ${(await login.json()).data.token as string}` };
  const listed = await request.get('/api/simulation/cases', { headers });
  if (!listed.ok()) throw new Error(`No se pudo leer la lista de casos del estudiante: ${await explain(listed)}`);
  const cases = ((await listed.json()).data ?? []) as Array<{ caseVersionId: number }>;
  if (cases.length === 0) throw new Error('El estudiante no tiene ningún caso que jugar en esta corrida.');
  const caseVersionId = cases[0].caseVersionId;
  const response = await request.get(`/api/simulation/cases/${caseVersionId}/consent`, { headers });
  if (!response.ok()) throw new Error(`No se pudo leer el consentimiento del caso ${caseVersionId}: ${await explain(response)}`);
  return { headers, caseVersionId, state: (await response.json()).data as ConsentState };
}

/** Lo que el servidor dice del consentimiento del estudiante de la página a ese caso (si lo exige, la versión vigente, si aceptó). */
export async function readConsentState(page: PageApi, caseVersionId: number): Promise<ConsentState> {
  const headers = { Authorization: `Bearer ${await studentToken(page)}` };
  const response = await page.request.get(`/api/simulation/cases/${caseVersionId}/consent`, { headers });
  if (!response.ok()) throw new Error(`No se pudo leer el consentimiento del caso ${caseVersionId}: ${await explain(response)}`);
  return (await response.json()).data as ConsentState;
}
