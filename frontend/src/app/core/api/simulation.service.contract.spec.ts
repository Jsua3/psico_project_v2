import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { resolveScenarioConfigAssetKey } from '../../features/simulator/scenario-config-assets.util';
import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { AuthoringApi } from './authoring.api';
import { InstructorApi } from './instructor.api';
import { SimulationService } from './simulation.service';

/** Las tres APIs por rol vistas como una sola: el contrato HTTP no distingue quién implementa cada método. */
type Public<T> = Pick<T, keyof T>; // sin los miembros privados (`http`), que chocarían en la intersección
type Api = Public<SimulationService> & Public<AuthoringApi> & Public<InstructorApi>;
const ROLE_CLASSES = [SimulationService, AuthoringApi, InstructorApi] as const;
const publicMethodsOf = (cls: { prototype: object }) =>
  Object.getOwnPropertyNames(cls.prototype).filter(name => name !== 'constructor' && name !== 'attemptOptions');

function mergeApis(player: SimulationService, authoring: AuthoringApi, instructor: InstructorApi): Api {
  const merged: Record<string, unknown> = {};
  for (const [cls, instance] of [[SimulationService, player], [AuthoringApi, authoring], [InstructorApi, instructor]] as const) {
    for (const name of publicMethodsOf(cls)) {
      merged[name] = (instance as unknown as Record<string, (...a: unknown[]) => unknown>)[name].bind(instance);
    }
  }
  return merged as unknown as Api;
}

/**
 * Contrato HTTP de `SimulationService`: para CADA método público, verbo, URL (con parámetros),
 * cuerpo y cabecera del token de intento, y que se desenvuelva el sobre `{ data }`.
 *
 * Es la red de seguridad para separar el servicio por rol (Facade / Interface Segregation:
 * `AuthoringApi`, `InstructorApi`) sin cambiar ni una llamada al backend. La última prueba
 * obliga a que todo método nuevo (o movido) quede en la tabla.
 */

const TOKEN = 'tok-intento';
const ATTEMPT = 'att-1';
const body = (label: string) => ({ label }) as never;

interface Contract {
  /** Nombre del método de `SimulationService` que se está caracterizando. */
  method: string;
  call: (s: Api) => Observable<unknown>;
  verb: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** URL con parámetros de consulta, si los hay. */
  urlWithParams?: string;
  body?: unknown;
  attemptToken?: boolean;
}

const A = '/api/authoring/cases';
const S = '/api/simulation';
const att = `${S}/attempts/${ATTEMPT}`;

const CONTRACTS: Contract[] = [
  // ── jugador ────────────────────────────────────────────────────────────────
  { method: 'listCases', call: s => s.listCases(), verb: 'GET', url: `${S}/cases` },
  { method: 'getCatalog', call: s => s.getCatalog(), verb: 'GET', url: `${S}/catalog` },
  // F10-1 (C8, RF-16): la ficha del caso se lee sin crear intento; un 403 lo explica la pantalla, no el aviso genérico.
  { method: 'getCaseBrief', call: s => s.getCaseBrief(7), verb: 'GET', url: `${S}/cases/7/brief` },
  { method: 'startAttempt', call: s => s.startAttempt(7), verb: 'POST', url: `${S}/attempts`,
    body: { caseVersionId: 7, forceNew: false } },
  { method: 'getProgressMap', call: s => s.getProgressMap(ATTEMPT, TOKEN), verb: 'GET',
    url: `${att}/progress-map`, attemptToken: true },
  { method: 'getWorld', call: s => s.getWorld(ATTEMPT, TOKEN), verb: 'GET', url: `${att}/world`, attemptToken: true },
  { method: 'enterRoom', call: s => s.enterRoom(ATTEMPT, TOKEN, 'sala-b', 'puerta-a'), verb: 'POST',
    url: `${att}/enter-room`, body: { attemptToken: TOKEN, targetNodeKey: 'sala-b', doorKey: 'puerta-a' } },
  { method: 'updateWorldState', call: s => s.updateWorldState(ATTEMPT, TOKEN, 10, 20, 'mapa-1'), verb: 'PATCH',
    url: `${att}/world-state`, body: { attemptToken: TOKEN, playerX: 10, playerY: 20, currentMapKey: 'mapa-1' } },
  { method: 'openInteraction', call: s => s.openInteraction(ATTEMPT, TOKEN, 'familia'), verb: 'POST',
    url: `${att}/interactions/familia`, body: { attemptToken: TOKEN } },
  { method: 'useTool', call: s => s.useTool(ATTEMPT, TOKEN, 'PAP', 'familia'), verb: 'POST',
    url: `${att}/tools/use`, body: { attemptToken: TOKEN, toolCode: 'PAP', targetInteractionKey: 'familia' } },
  { method: 'recordNpcInteraction', call: s => s.recordNpcInteraction(ATTEMPT, TOKEN, 'dra lópez/1'), verb: 'POST',
    url: `${att}/npcs/dra%20l%C3%B3pez%2F1`, body: { attemptToken: TOKEN } },
  { method: 'chooseDecision', call: s => s.chooseDecision(ATTEMPT, TOKEN, 5), verb: 'POST',
    url: `${att}/decisions`,
    body: { attemptToken: TOKEN, decisionOptionId: 5, evidenceOverride: false, missingEvidence: [] } },
  { method: 'saveReflection', call: s => s.saveReflection(ATTEMPT, TOKEN, 3, 'mi reflexión'), verb: 'POST',
    url: `${att}/reflections`, body: { attemptToken: TOKEN, nodeId: 3, text: 'mi reflexión' } },
  { method: 'safeExit', call: s => s.safeExit(ATTEMPT, TOKEN, 'necesito parar'), verb: 'POST',
    url: `${att}/safe-exit`, body: { attemptToken: TOKEN, reason: 'necesito parar' } },
  { method: 'resumeAttempt', call: s => s.resumeAttempt(ATTEMPT, TOKEN), verb: 'POST',
    url: `${att}/resume`, body: { attemptToken: TOKEN } },
  { method: 'attemptHistory', call: s => s.attemptHistory(), verb: 'GET', url: `${S}/attempts/history` },
  // F10-2 (C9, RF-18): las pistas de la escena, una a una y sin costo; la orden lleva su clave de idempotencia.
  { method: 'getHints', call: s => s.getHints(ATTEMPT, TOKEN), verb: 'GET', url: `${att}/hints`, attemptToken: true },
  { method: 'revealNextHint', call: s => s.revealNextHint(ATTEMPT, TOKEN, 'pista-0001-abcd'), verb: 'POST',
    url: `${att}/hints/next`, body: { attemptToken: TOKEN, requestId: 'pista-0001-abcd' } },

  // ── docente ────────────────────────────────────────────────────────────────
  { method: 'recentAttempts', call: s => s.recentAttempts(), verb: 'GET', url: '/api/instructor/attempts/recent' },
  { method: 'attemptTrace', call: s => s.attemptTrace(ATTEMPT), verb: 'GET',
    url: `/api/instructor/attempts/${ATTEMPT}/trace` },
  { method: 'rubric', call: s => s.rubric(ATTEMPT), verb: 'GET',
    url: `/api/instructor/attempts/${ATTEMPT}/rubric-evaluation` },
  // E1-2 (RN-07, plan visual F7b-7): el docente reemplaza un intento abierto con un motivo.
  { method: 'replaceAttempt', call: s => s.replaceAttempt(ATTEMPT, 'motivo'), verb: 'POST',
    url: `/api/instructor/attempts/${ATTEMPT}/replace`, body: { reason: 'motivo' } },
  { method: 'saveRubric', call: s => s.saveRubric(ATTEMPT, 4, 'bien', [{ criterionId: 1, score: 3, comment: 'c' }]),
    verb: 'PUT', url: `/api/instructor/attempts/${ATTEMPT}/rubric-evaluation`,
    body: { rubricId: 4, comment: 'bien', scores: [{ criterionId: 1, score: 3, comment: 'c' }] } },

  // ── autoría ────────────────────────────────────────────────────────────────
  { method: 'caseEditor', call: s => s.caseEditor(9), verb: 'GET', url: `${A}/9/editor` },
  { method: 'cloneCaseVersion', call: s => s.cloneCaseVersion(9), verb: 'POST', url: `${A}/9/clone-version`, body: {} },
  { method: 'listAuthoringCases', call: s => s.listAuthoringCases(), verb: 'GET', url: A },
  { method: 'createCase', call: s => s.createCase({ title: 'T', code: 'C', description: null }), verb: 'POST', url: A,
    body: { title: 'T', code: 'C', description: null } },
  { method: 'createNode', call: s => s.createNode(9, body('nodo')), verb: 'POST', url: `${A}/9/nodes`, body: body('nodo') },
  { method: 'updateNode', call: s => s.updateNode(9, 2, body('nodo')), verb: 'PUT', url: `${A}/9/nodes/2`, body: body('nodo') },
  { method: 'deleteNode', call: s => s.deleteNode(9, 2), verb: 'DELETE', url: `${A}/9/nodes/2` },
  { method: 'createDecision', call: s => s.createDecision(9, body('dec')), verb: 'POST', url: `${A}/9/decisions`, body: body('dec') },
  { method: 'updateDecision', call: s => s.updateDecision(9, 2, body('dec')), verb: 'PUT', url: `${A}/9/decisions/2`, body: body('dec') },
  { method: 'createMap', call: s => s.createMap(9, body('mapa')), verb: 'POST', url: `${A}/9/maps`, body: body('mapa') },
  { method: 'updateMap', call: s => s.updateMap(9, 2, body('mapa')), verb: 'PUT', url: `${A}/9/maps/2`, body: body('mapa') },
  { method: 'deleteMap', call: s => s.deleteMap(9, 2), verb: 'DELETE', url: `${A}/9/maps/2` },
  { method: 'createObject', call: s => s.createObject(9, 3, body('obj')), verb: 'POST', url: `${A}/9/maps/3/objects`, body: body('obj') },
  { method: 'updateObject', call: s => s.updateObject(9, 2, body('obj')), verb: 'PUT', url: `${A}/9/objects/2`, body: body('obj') },
  { method: 'deleteObject', call: s => s.deleteObject(9, 2), verb: 'DELETE', url: `${A}/9/objects/2` },
  { method: 'createTool', call: s => s.createTool(9, body('tool')), verb: 'POST', url: `${A}/9/tools`, body: body('tool') },
  { method: 'updateTool', call: s => s.updateTool(9, 2, body('tool')), verb: 'PUT', url: `${A}/9/tools/2`, body: body('tool') },
  { method: 'deleteTool', call: s => s.deleteTool(9, 2), verb: 'DELETE', url: `${A}/9/tools/2` },
  { method: 'updateChecklist', call: s => s.updateChecklist(9, body('lista')), verb: 'PUT', url: `${A}/9/checklist`, body: body('lista') },

  // ── ayudas, personajes, ficha y orden de las escenas (F10-3†: E3-3 a E3-6) ─────────────────────────────
  { method: 'createHint', call: s => s.createHint(9, 3, body('pista')), verb: 'POST', url: `${A}/9/maps/3/hints`, body: body('pista') },
  { method: 'updateHint', call: s => s.updateHint(9, 2, body('pista')), verb: 'PUT', url: `${A}/9/hints/2`, body: body('pista') },
  { method: 'deleteHint', call: s => s.deleteHint(9, 2), verb: 'DELETE', url: `${A}/9/hints/2` },
  { method: 'createCharacter', call: s => s.createCharacter(9, body('personaje')), verb: 'POST', url: `${A}/9/characters`, body: body('personaje') },
  { method: 'updateCharacter', call: s => s.updateCharacter(9, 2, body('personaje')), verb: 'PUT', url: `${A}/9/characters/2`, body: body('personaje') },
  { method: 'deleteCharacter', call: s => s.deleteCharacter(9, 2), verb: 'DELETE', url: `${A}/9/characters/2` },
  { method: 'updateBrief', call: s => s.updateBrief(9, body('ficha')), verb: 'PUT', url: `${A}/9/brief`, body: body('ficha') },
  { method: 'reorderNodes', call: s => s.reorderNodes(9, [2, 1]), verb: 'PATCH', url: `${A}/9/nodes/reorder`, body: { order: [2, 1] } },

  // ── editor de mundo ────────────────────────────────────────────────────────
  { method: 'worldEditor', call: s => s.worldEditor(9), verb: 'GET', url: `${A}/9/world-editor` },
  { method: 'saveWorld', call: s => s.saveWorld(9, body('mundo')), verb: 'PUT', url: `${A}/9/world`, body: body('mundo') },
  { method: 'validateWorld', call: s => s.validateWorld(9), verb: 'POST', url: `${A}/9/world/validate`, body: {} },
  { method: 'worldPreview', call: s => s.worldPreview(9), verb: 'GET', url: `${A}/9/world-preview` },

  // ── revisión del caso (F10-6†: C4 ciclo de vida y C6 validación) ───────────────────────────────────────────
  { method: 'validateCase', call: s => s.validateCase(9), verb: 'POST', url: `${A}/9/validate`, body: {} },
  { method: 'lifecycle', call: s => s.lifecycle(9), verb: 'GET', url: `${A}/9/lifecycle` },
  { method: 'transitionCase', call: s => s.transitionCase(9, { action: 'submit' }), verb: 'POST', url: `${A}/9/lifecycle`, body: { action: 'submit' } },
];

describe('SimulationService contrato HTTP', () => {
  let service: Api;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SimulationService, AuthoringApi, InstructorApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = mergeApis(TestBed.inject(SimulationService), TestBed.inject(AuthoringApi), TestBed.inject(InstructorApi));
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it.each(CONTRACTS.map(c => [c.method, c] as const))('%s: verbo, URL, cuerpo y cabeceras', (_name, contract) => {
    let result: unknown;
    contract.call(service).subscribe(r => (result = r));

    const req = httpMock.expectOne(contract.url);
    expect(req.request.method).toBe(contract.verb);
    expect(req.request.urlWithParams).toBe(contract.urlWithParams ?? contract.url);
    if (contract.body !== undefined) {
      expect(req.request.body).toEqual(contract.body);
    }
    if (contract.attemptToken) {
      expect(req.request.headers.get('X-SIEP-Attempt-Token')).toBe(TOKEN);
    } else {
      expect(req.request.headers.has('X-SIEP-Attempt-Token')).toBe(false);
    }
    req.flush({ data: { ok: contract.method } });

    // Todos los métodos de esta tabla desenvuelven el sobre `{ data }`.
    expect(result).toEqual({ ok: contract.method });
  });

  it('el token de intento nunca viaja en la URL', () => {
    for (const c of CONTRACTS.filter(x => x.attemptToken)) {
      expect(c.url).not.toContain(TOKEN);
    }
  });

  // ── métodos con comportamiento propio ──────────────────────────────────────
  describe('startAttempt', () => {
    it('envía forceNew cuando se pide', () => {
      service.startAttempt(7, true).subscribe();
      const req = httpMock.expectOne(`${S}/attempts`);
      expect(req.request.body).toEqual({ caseVersionId: 7, forceNew: true });
      req.flush({ data: {} });
    });
  });

  describe('chooseDecision', () => {
    it('envía la evidencia faltante cuando se decide con excepción', () => {
      service.chooseDecision(ATTEMPT, TOKEN, 5, true, ['a', 'b']).subscribe();
      const req = httpMock.expectOne(`${att}/decisions`);
      expect(req.request.body).toEqual({
        attemptToken: TOKEN, decisionOptionId: 5, evidenceOverride: true, missingEvidence: ['a', 'b'],
      });
      req.flush({ data: {} });
    });
  });

  describe('getActiveAttempt', () => {
    it('devuelve el intento activo del cuerpo', () => {
      let result: unknown;
      service.getActiveAttempt(7).subscribe(r => (result = r));
      const req = httpMock.expectOne(`${S}/cases/7/active-attempt`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: { attemptId: ATTEMPT } });
      expect(result).toEqual({ attemptId: ATTEMPT });
    });

    it('devuelve null con 204 (sin intento activo)', () => {
      let result: unknown = 'sin-respuesta';
      service.getActiveAttempt(7).subscribe(r => (result = r));
      httpMock.expectOne(`${S}/cases/7/active-attempt`).flush(null, { status: 204, statusText: 'No Content' });
      expect(result).toBeNull();
    });
  });

  describe('studentReport', () => {
    it('pide el reporte del estudiante por id', () => {
      service.studentReport(ATTEMPT).subscribe();
      const req = httpMock.expectOne(`${att}/student-report`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('X-SIEP-Attempt-Token')).toBe(false);
      req.flush({ data: { attemptId: ATTEMPT } });
    });

    it('completa phaseDurations con [] cuando el backend no lo envía', () => {
      let result: { phaseDurations?: unknown } | undefined;
      service.studentReport(ATTEMPT).subscribe(r => (result = r as typeof result));
      httpMock.expectOne(`${att}/student-report`).flush({ data: { attemptId: ATTEMPT } });
      expect(result?.phaseDurations).toEqual([]);
    });

    it('conserva phaseDurations si el backend lo envía', () => {
      let result: { phaseDurations?: unknown } | undefined;
      service.studentReport(ATTEMPT).subscribe(r => (result = r as typeof result));
      httpMock.expectOne(`${att}/student-report`).flush({ data: { phaseDurations: [{ phase: 'a' }] } });
      expect(result?.phaseDurations).toEqual([{ phase: 'a' }]);
    });
  });

  describe('assets del frontend (sin sobre { data })', () => {
    it('getScenarioConfig lee el JSON versionado del escenario', () => {
      let result: unknown;
      service.getScenarioConfig('hospital-urgencias').subscribe(r => (result = r));
      const url = `/assets/game/scenarios/${resolveScenarioConfigAssetKey('hospital-urgencias')}.json`;
      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'esc' });
      expect(result).toEqual({ id: 'esc' });
    });
  });

  describe('editor de mundo con nodeId', () => {
    it.each([
      ['worldEditor', (s: Api) => s.worldEditor(9, 4), 'GET', `${A}/9/world-editor`],
      ['saveWorld', (s: Api) => s.saveWorld(9, body('mundo'), 4), 'PUT', `${A}/9/world`],
      ['worldPreview', (s: Api) => s.worldPreview(9, 4), 'GET', `${A}/9/world-preview`],
    ])('%s agrega nodeId como parámetro de consulta', (_n, call, verb, url) => {
      call(service).subscribe();
      const req = httpMock.expectOne(r => r.url === url);
      expect(req.request.method).toBe(verb);
      expect(req.request.urlWithParams).toBe(`${url}?nodeId=4`);
      req.flush({ data: {} });
    });

    it('nodeId = 0 también se envía (solo null/undefined se omiten)', () => {
      service.worldEditor(9, 0).subscribe();
      const req = httpMock.expectOne(r => r.url === `${A}/9/world-editor`);
      expect(req.request.urlWithParams).toBe(`${A}/9/world-editor?nodeId=0`);
      req.flush({ data: {} });
    });
  });

  // ── cobertura completa ─────────────────────────────────────────────────────
  it('todo método público de las APIs por rol está en el contrato', () => {
    const publicMethods = ROLE_CLASSES.flatMap(publicMethodsOf);
    const documented = new Set([
      ...CONTRACTS.map(c => c.method),
      'getActiveAttempt', 'studentReport', 'getScenarioConfig',
    ]);

    expect(publicMethods.filter(name => !documented.has(name))).toEqual([]);
    expect([...documented].filter(name => !publicMethods.includes(name))).toEqual([]);
    expect(publicMethods).toHaveLength(60);
  });

  it('cada método vive en una sola API y cada rol tiene el tamaño esperado', () => {
    const [player, authoring, instructor] = ROLE_CLASSES.map(publicMethodsOf);
    expect(new Set([...player, ...authoring, ...instructor]).size).toBe(60);
    expect([player.length, authoring.length, instructor.length]).toEqual([21, 34, 5]);
    expect(instructor).toEqual(['recentAttempts', 'attemptTrace', 'rubric', 'replaceAttempt', 'saveRubric']);
  });

  // req: RN-04, RF-15
  it('iniciar un intento deja que la pantalla explique el 403 ACCESS_*: no sale además el aviso genérico de permisos', () => {
    service.startAttempt(9, true).subscribe({ error: () => undefined });

    const request = httpMock.expectOne(`${S}/attempts`);
    expect(request.request.context.get(SCREEN_HANDLES_FORBIDDEN)).toBe(true);
    request.flush({}, { status: 403, statusText: 'Forbidden' });
  });

  it('el jugador no ve métodos de autoría ni de instructor', () => {
    const player = publicMethodsOf(SimulationService);
    for (const name of [...publicMethodsOf(AuthoringApi), ...publicMethodsOf(InstructorApi)]) {
      expect(player).not.toContain(name);
    }
  });
});
