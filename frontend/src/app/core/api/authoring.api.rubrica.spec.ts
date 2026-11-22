import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { descriptorDelNivel, RubricLevelOption } from '../models/simulation.model';
import { AuthoringApi } from './authoring.api';

/**
 * Bloque R0 · Lo que el editor de casos le pide de nuevo al servidor: adoptar una rúbrica como copia propia de la
 * versión (RK-1) y editar en la ficha los temas sensibles (RK-7) y el nombre (RK-8). Como toda mutación del borrador,
 * adoptar lleva la revisión en `X-Case-Revision` (F9-10 la exige).
 */
// req: SIEP-CU-04, RNF-08
describe('AuthoringApi: rúbrica del caso y ficha (R0)', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adoptar las competencias del programa: POST …/rubric con la revisión', () => {
    api.adoptRubric(9, { fromCompetencies: true }, 7).subscribe();
    const request = http.expectOne('/api/authoring/cases/9/rubric');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Case-Revision')).toBe('7');
    expect(request.request.body).toEqual({ fromCompetencies: true });
    request.flush({ data: { caseVersionId: 9, revision: 8 } });
  });

  it('adoptar una rúbrica de la biblioteca manda solo su id', () => {
    api.adoptRubric(9, { rubricId: 4 }, 2).subscribe();
    const request = http.expectOne('/api/authoring/cases/9/rubric');
    expect(request.request.body).toEqual({ rubricId: 4 });
    request.flush({ data: null });
  });

  it('la ficha manda los temas sensibles y el nombre solo si se piden', () => {
    api.updateBrief(9, { context: 'Contexto' }, 3).subscribe();
    const viejo = http.expectOne('/api/authoring/cases/9/brief');
    expect(viejo.request.body).toEqual({ context: 'Contexto' });
    viejo.flush({ data: null });

    api.updateBrief(9, { contentWarnings: ['Violencia de pareja'], title: 'Caso nuevo' }, 4).subscribe();
    const nuevo = http.expectOne('/api/authoring/cases/9/brief');
    expect(nuevo.request.body).toEqual({ contentWarnings: ['Violencia de pareja'], title: 'Caso nuevo' });
    nuevo.flush({ data: null });
  });
});

/** RK-2 · La celda vacía de la matriz se aplica con el descriptor general: la misma regla que el servidor usa en RK-6. */
// req: RN-09
describe('descriptorDelNivel', () => {
  const generales: RubricLevelOption[] = [
    { value: 'EN_INICIO', label: 'En inicio', descriptor: 'General de inicio.' },
    { value: 'LOGRADO', label: 'Logrado', descriptor: 'General de logrado.' },
  ];

  it('usa el descriptor propio del criterio cuando lo tiene', () => {
    expect(descriptorDelNivel({ levelDescriptors: { LOGRADO: '  Estabiliza a la persona.  ' } }, 'LOGRADO', generales))
      .toBe('Estabiliza a la persona.');
  });

  it('cae al general si el criterio no lo tiene, está vacío o el servidor no manda descriptores', () => {
    expect(descriptorDelNivel({ levelDescriptors: { LOGRADO: '   ' } }, 'LOGRADO', generales)).toBe('General de logrado.');
    expect(descriptorDelNivel({ levelDescriptors: { DESTACADO: 'Otro' } }, 'EN_INICIO', generales)).toBe('General de inicio.');
    expect(descriptorDelNivel({}, 'LOGRADO', generales)).toBe('General de logrado.');
  });

  it('sin nivel, o sin nada con qué explicarlo, no inventa texto', () => {
    expect(descriptorDelNivel({ levelDescriptors: { LOGRADO: 'x' } }, null, generales)).toBeNull();
    expect(descriptorDelNivel({}, 'DESTACADO', generales)).toBeNull();
    expect(descriptorDelNivel({}, 'LOGRADO')).toBeNull();
  });
});
