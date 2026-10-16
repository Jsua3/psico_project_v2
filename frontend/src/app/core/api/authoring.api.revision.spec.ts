import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { AuthoringApi } from './authoring.api';

/**
 * E2-6 (RNF-08, REGLA-011, SIEP-RN-05): la revisión del caso viaja en `X-Case-Revision` en TODA mutación del
 * borrador. Sin ella el servidor no compara (`SIEP_REVISION_REQUIRED` sigue apagada); con ella responde 409
 * `REVISION_CONFLICT` si otra persona editó entre medias. La URL canónica de la autoría es `/api/authoring/**`
 * (ED-9; `/api/admin/cases/**` sigue como alias).
 */
// req: RNF-08, REGLA-011, SIEP-RN-05
describe('AuthoringApi: la revisión del caso en cada mutación', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;
  const body = {} as never;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const mutations: Array<[string, (a: AuthoringApi, revision?: number) => Observable<unknown>, string, string]> = [
    ['createNode', (a, r) => a.createNode(9, body, r), 'POST', '/api/authoring/cases/9/nodes'],
    ['updateNode', (a, r) => a.updateNode(9, 2, body, r), 'PUT', '/api/authoring/cases/9/nodes/2'],
    ['deleteNode', (a, r) => a.deleteNode(9, 2, r), 'DELETE', '/api/authoring/cases/9/nodes/2'],
    ['createDecision', (a, r) => a.createDecision(9, body, r), 'POST', '/api/authoring/cases/9/decisions'],
    ['updateDecision', (a, r) => a.updateDecision(9, 2, body, r), 'PUT', '/api/authoring/cases/9/decisions/2'],
    ['createMap', (a, r) => a.createMap(9, body, r), 'POST', '/api/authoring/cases/9/maps'],
    ['updateMap', (a, r) => a.updateMap(9, 2, body, r), 'PUT', '/api/authoring/cases/9/maps/2'],
    ['deleteMap', (a, r) => a.deleteMap(9, 2, r), 'DELETE', '/api/authoring/cases/9/maps/2'],
    ['createObject', (a, r) => a.createObject(9, 3, body, r), 'POST', '/api/authoring/cases/9/maps/3/objects'],
    ['updateObject', (a, r) => a.updateObject(9, 2, body, r), 'PUT', '/api/authoring/cases/9/objects/2'],
    ['deleteObject', (a, r) => a.deleteObject(9, 2, r), 'DELETE', '/api/authoring/cases/9/objects/2'],
    ['createTool', (a, r) => a.createTool(9, body, r), 'POST', '/api/authoring/cases/9/tools'],
    ['updateTool', (a, r) => a.updateTool(9, 2, body, r), 'PUT', '/api/authoring/cases/9/tools/2'],
    ['deleteTool', (a, r) => a.deleteTool(9, 2, r), 'DELETE', '/api/authoring/cases/9/tools/2'],
    ['updateChecklist', (a, r) => a.updateChecklist(9, body, r), 'PUT', '/api/authoring/cases/9/checklist'],
    ['publishCase', (a, r) => a.publishCase(9, r), 'POST', '/api/authoring/cases/9/publish'],
    ['transitionCase', (a, r) => a.transitionCase(9, { action: 'submit' }, r), 'POST', '/api/authoring/cases/9/lifecycle'],
  ];

  it.each(mutations)('%s manda la revisión vigente en X-Case-Revision', (_name, call, method, url) => {
    call(api, 7).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe(method);
    expect(request.request.headers.get('X-Case-Revision')).toBe('7');
    request.flush({ data: {} });
  });

  it.each(mutations)('%s sin revisión no manda la cabecera (el servidor no compara)', (_name, call, method, url) => {
    call(api).subscribe();
    const request = http.expectOne(url);
    expect(request.request.method).toBe(method);
    expect(request.request.headers.has('X-Case-Revision')).toBe(false);
    request.flush({ data: {} });
  });

  it('las lecturas y la creación de un caso no llevan revisión (no hay borrador que comparar)', () => {
    api.caseEditor(9).subscribe();
    expect(http.expectOne('/api/authoring/cases/9/editor').request.headers.has('X-Case-Revision')).toBe(false);
    api.listAuthoringCases().subscribe();
    expect(http.expectOne('/api/authoring/cases').request.headers.has('X-Case-Revision')).toBe(false);
    api.createCase({ title: 'T' }).subscribe();
    const create = http.expectOne('/api/authoring/cases');
    expect(create.request.method).toBe('POST');
    expect(create.request.headers.has('X-Case-Revision')).toBe(false);
  });

  // req: RF-12, RF-13, CU-05
  describe('caseChanges (F10-6): el editor se entera de una transición aunque quien la pidió ya no esté', () => {
    const response = { data: { caseVersionId: 9, state: 'IN_REVIEW', allowedTransitions: [] } };

    it('emite el id de la versión cuando la transición se aplicó', () => {
      const seen: number[] = [];
      api.caseChanges.subscribe(id => seen.push(id));

      api.transitionCase(9, { action: 'submit' }, 3).subscribe();
      http.expectOne('/api/authoring/cases/9/lifecycle').flush(response);

      expect(seen).toEqual([9]);
    });

    it.each([
      ['REVISION_CONFLICT', { code: 'REVISION_CONFLICT', message: 'otra sesión', revision: 9 }],
      ['INVALID_TRANSITION', { code: 'INVALID_TRANSITION', message: 'No se puede aplicar «approve» a una versión en estado PUBLISHED.' }],
    ])('emite también ante un 409 %s: el caso ya no es el que se veía', (_code, body) => {
      const seen: number[] = [];
      api.caseChanges.subscribe(id => seen.push(id));

      api.transitionCase(9, { action: 'approve' }, 3).subscribe({ error: () => undefined });
      http.expectOne('/api/authoring/cases/9/lifecycle').flush(body, { status: 409, statusText: 'Conflict' });

      expect(seen).toEqual([9]);
    });

    it.each([
      [409, { code: 'CASE_NOT_PUBLISHABLE' }],
      [400, { code: 'CONTENT_REVIEW_REQUIRED' }],
      [403, { code: 'FORBIDDEN' }],
      [500, null],
    ])('no emite ante un %i (%j): nada cambió', (status, body) => {
      const seen: number[] = [];
      api.caseChanges.subscribe(id => seen.push(id));

      api.transitionCase(9, { action: 'approve' }, 3).subscribe({ error: () => undefined });
      http.expectOne('/api/authoring/cases/9/lifecycle').flush(body, { status, statusText: 'x' });

      expect(seen).toEqual([]);
    });
  });
});
