import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { RubricService } from './rubric.service';

/**
 * E2-2: las órdenes que modifican una rúbrica pueden recibir 403 (es de otra persona o la global) y la pantalla lo
 * explica con su propio texto; por eso marcan la petición para que el interceptor no avise además «No tienes
 * permisos…». Las lecturas no se marcan (un 403 ahí sí es falta de permisos).
 */
// req: SIEP-CU-04, RNF-002
describe('RubricService: el 403 de las órdenes lo explica la pantalla', () => {
  let service: RubricService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RubricService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const marked = (call: () => Observable<unknown>, url: string) => {
    call().subscribe();
    const request = http.expectOne(url);
    const flag = request.request.context.get(SCREEN_HANDLES_FORBIDDEN);
    request.flush({ data: null });
    return flag;
  };

  it.each([
    ['actualizar', () => service.update(4, {}), '/api/rubrics/4'],
    ['activar', () => service.activate(4), '/api/rubrics/4/activate'],
    ['desactivar', () => service.deactivate(4), '/api/rubrics/4/deactivate'],
    ['predeterminada', () => service.setDefault(4), '/api/rubrics/4/default'],
    ['asignar a un caso', () => service.assignToCaseVersion(3, 4), '/api/rubrics/case-versions/3'],
  ] as const)('%s marca la petición', (_name, call, url) => {
    expect(marked(call, url)).toBe(true);
  });

  it('leer no la marca', () => {
    expect(marked(() => service.list(), '/api/rubrics/')).toBe(false);
    expect(marked(() => service.detail(4), '/api/rubrics/4')).toBe(false);
  });
});
