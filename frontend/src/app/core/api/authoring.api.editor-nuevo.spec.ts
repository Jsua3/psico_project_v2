import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { AuthoringApi } from './authoring.api';

/**
 * Lo que el editor nuevo (P6) pide a la API de autoría además de lo de siempre: diálogos, borrar una opción, revisar
 * lo que propuso la IA (`accept-ai`), las reglas del modelo (hitos, riesgo, finales), el asistente de autoría y la
 * biblioteca de lugares. Cada llamada: ruta, método, cuerpo y la revisión vigente en `X-Case-Revision`.
 */
describe('AuthoringApi: lo que usa el editor nuevo', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;
  const body = {} as never;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const mutaciones: Array<[string, (a: AuthoringApi, revision?: number) => Observable<unknown>, string, string]> = [
    ['deleteDecision', (a, r) => a.deleteDecision(9, 4, r), 'DELETE', '/api/authoring/cases/9/decisions/4'],
    ['createDialogue', (a, r) => a.createDialogue(9, 3, body, r), 'POST', '/api/authoring/cases/9/maps/3/dialogues'],
    ['updateDialogue', (a, r) => a.updateDialogue(9, 5, body, r), 'PUT', '/api/authoring/cases/9/dialogues/5'],
    ['deleteDialogue', (a, r) => a.deleteDialogue(9, 5, r), 'DELETE', '/api/authoring/cases/9/dialogues/5'],
    ['acceptAiNode', (a, r) => a.acceptAiNode(9, 2, r), 'POST', '/api/authoring/cases/9/nodes/2/accept-ai'],
    ['acceptAiDecision', (a, r) => a.acceptAiDecision(9, 4, r), 'POST', '/api/authoring/cases/9/decisions/4/accept-ai'],
    ['acceptAiDialogue', (a, r) => a.acceptAiDialogue(9, 5, r), 'POST', '/api/authoring/cases/9/dialogues/5/accept-ai'],
    ['acceptAiObject', (a, r) => a.acceptAiObject(9, 6, r), 'POST', '/api/authoring/cases/9/objects/6/accept-ai'],
    ['updateMilestones', (a, r) => a.updateMilestones(9, [], r), 'PUT', '/api/authoring/cases/9/rules/milestones'],
    ['updateRisk', (a, r) => a.updateRisk(9, 'MODERATE', r), 'PUT', '/api/authoring/cases/9/rules/risk'],
    ['updateEndings', (a, r) => a.updateEndings(9, [], r), 'PUT', '/api/authoring/cases/9/rules/endings'],
  ];

  it.each(mutaciones)('%s manda la revisión vigente en X-Case-Revision', (_nombre, llamar, metodo, url) => {
    llamar(api, 7).subscribe();
    const peticion = http.expectOne(url);
    expect(peticion.request.method).toBe(metodo);
    expect(peticion.request.headers.get('X-Case-Revision')).toBe('7');
    peticion.flush({ data: {} });
  });

  it.each(mutaciones)('%s sin revisión no manda la cabecera', (_nombre, llamar, metodo, url) => {
    llamar(api).subscribe();
    const peticion = http.expectOne(url);
    expect(peticion.request.method).toBe(metodo);
    expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
    peticion.flush({ data: {} });
  });

  it('las mutaciones devuelven la vista nueva del caso, ya sin el sobre', () => {
    const vista = { caseVersionId: 9, revision: 8 };
    let recibida: unknown;
    api.acceptAiNode(9, 2, 7).subscribe(v => (recibida = v));
    http.expectOne('/api/authoring/cases/9/nodes/2/accept-ai').flush({ data: vista });
    expect(recibida).toEqual(vista);
  });

  it('el cuerpo de un diálogo viaja tal cual', () => {
    const dialogo = {
      treeKey: 'escena-1', speakerName: 'Camila', emotion: 'neutral',
      lines: [{ displayOrder: 1, text: 'Hola', aiSuggested: true }],
    };
    api.createDialogue(9, 3, dialogo, 7).subscribe();
    const peticion = http.expectOne('/api/authoring/cases/9/maps/3/dialogues');
    expect(peticion.request.body).toEqual(dialogo);
    peticion.flush({ data: {} });
  });

  it('las reglas viajan dentro de su clave: «milestones», «riskLevel» y «endings»', () => {
    const hitos = [{ key: 'valorar_el_riesgo', label: 'Valorar el riesgo', description: 'x', decisive: true }];
    api.updateMilestones(9, hitos, 7).subscribe();
    expect(http.expectOne('/api/authoring/cases/9/rules/milestones').request.body).toEqual({ milestones: hitos });

    api.updateRisk(9, null, 7).subscribe();
    expect(http.expectOne('/api/authoring/cases/9/rules/risk').request.body).toEqual({ riskLevel: null });

    const finales = [{ key: 'protectora', title: 'T', message: 'M', tone: 'positive' as const, when: { milestone: 'a' } }];
    api.updateEndings(9, finales, 7).subscribe();
    expect(http.expectOne('/api/authoring/cases/9/rules/endings').request.body).toEqual({ endings: finales });
  });

  describe('asistente de autoría', () => {
    it('el estado se lee con GET, sin sobre y sin revisión', () => {
      let estado: unknown;
      api.assistantStatus(9).subscribe(e => (estado = e));
      const peticion = http.expectOne('/api/authoring/cases/9/assistant/status');
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
      peticion.flush({ data: { enabled: true, remainingToday: 12, mode: 'connected' } });
      expect(estado).toEqual({ enabled: true, remainingToday: 12, mode: 'connected' });
    });

    it('proponer manda la petición, la pantalla y la selección; el servidor no pide revisión', () => {
      const cuerpo = { peticion: 'Agrega una respuesta', pantalla: 'guion', seleccion: 'escena-1' };
      let resultado: unknown;
      api.assistantPropose(9, cuerpo).subscribe(r => (resultado = r));
      const peticion = http.expectOne('/api/authoring/cases/9/assistant/propose');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual(cuerpo);
      expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
      const respuesta = { mensaje: 'Listo', cambios: [{ op: 'agregar-linea' }], modo: 'connected', model: 'm', changes: 1 };
      peticion.flush({ data: respuesta });
      expect(resultado).toEqual(respuesta);
    });

    it('la guía manda la pregunta y el catálogo de acciones', () => {
      const cuerpo = { pregunta: '¿Cómo agrego una sala?', acciones: [{ id: 'agregar-sala', nombre: 'Agregar una sala', pantalla: 'salas' }] };
      api.assistantGuide(9, cuerpo).subscribe();
      const peticion = http.expectOne('/api/authoring/cases/9/assistant/guide');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual(cuerpo);
      peticion.flush({ data: { accionId: null, modo: 'resaltar', mensaje: 'x', model: 'm', changes: 0 } });
    });
  });

  describe('biblioteca de lugares', () => {
    it('la lista se lee con GET y llega sin sobre', () => {
      let lista: unknown;
      api.libraryPlaces().subscribe(l => (lista = l));
      const peticion = http.expectOne('/api/biblioteca/lugares');
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ data: [{ id: 'universidad', nombre: 'Universidad' }] });
      expect(lista).toEqual([{ id: 'universidad', nombre: 'Universidad' }]);
    });

    it('un lugar se lee por su id', () => {
      api.libraryPlace('universidad').subscribe();
      const peticion = http.expectOne('/api/biblioteca/lugares/universidad');
      expect(peticion.request.method).toBe('GET');
      peticion.flush({ data: { id: 'universidad' } });
    });

    it('el id de un lugar viaja codificado', () => {
      api.libraryPlace('a/b c').subscribe();
      http.expectOne('/api/biblioteca/lugares/a%2Fb%20c').flush({ data: {} });
    });
  });

  describe('crear un caso', () => {
    it('sin lugar manda solo lo de siempre', () => {
      api.createCase({ title: 'Caso' }).subscribe();
      const peticion = http.expectOne('/api/authoring/cases');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toEqual({ title: 'Caso' });
      peticion.flush({ data: {} });
    });

    it('con un lugar manda «lugarId» y las salas elegidas, en orden', () => {
      api.createCase({ title: 'Caso', lugarId: 'universidad', salas: ['pasillo', 'consultorio'] }).subscribe();
      const peticion = http.expectOne('/api/authoring/cases');
      expect(peticion.request.body).toEqual({ title: 'Caso', lugarId: 'universidad', salas: ['pasillo', 'consultorio'] });
      expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
      peticion.flush({ data: {} });
    });
  });
});
