import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';

import { AuthoringApi } from './authoring.api';

/** Las siete rutas de la generación de casos con IA (C1): método, ruta, cuerpo y que devuelvan la `Generation` sin el sobre. */
describe('AuthoringApi: la generación de casos con IA', () => {
  let api: AuthoringApi;
  let http: HttpTestingController;
  const BASE = '/api/authoring/generations';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthoringApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide cada ruta de la generación con su método', () => {
    api.generationScene('g1', 'sala-a', true).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.urlWithParams.endsWith('/api/authoring/generations/g1/scenes/sala-a?repair=1'));
    api.cancelGeneration('g1').subscribe();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/authoring/generations/g1'));
  });

  it('una escena sin reparar no lleva el parámetro repair', () => {
    api.generationScene('g1', 'sala-a').subscribe();
    const peticion = http.expectOne(`${BASE}/g1/scenes/sala-a`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.params.has('repair')).toBe(false);
    peticion.flush({ data: {} });
  });

  const rutas: Array<[string, (a: AuthoringApi) => Observable<unknown>, string, string]> = [
    ['generationStatus', (a: AuthoringApi) => a.generationStatus(), 'GET', `${BASE}/status`],
    ['startGeneration', (a: AuthoringApi) => a.startGeneration({ lugarId: 'universidad', descripcion: 'x' }), 'POST', BASE],
    ['generation', (a: AuthoringApi) => a.generation('g1'), 'GET', `${BASE}/g1`],
    ['generationSkeleton', (a: AuthoringApi) => a.generationSkeleton('g1'), 'POST', `${BASE}/g1/skeleton`],
    ['generationAssemble', (a: AuthoringApi) => a.generationAssemble('g1'), 'POST', `${BASE}/g1/assemble`],
  ];

  it.each(rutas)('%s entrega los datos sin el sobre', (_nombre, llamar, metodo, url) => {
    let recibido: unknown;
    llamar(api).subscribe((v) => (recibido = v));
    const peticion = http.expectOne(url);
    expect(peticion.request.method).toBe(metodo);
    peticion.flush({ success: true, data: { id: 'g1' } });
    expect(recibido).toEqual({ id: 'g1' });
  });

  it('startGeneration manda el lugar y la descripción tal cual', () => {
    api.startGeneration({ lugarId: 'universidad', descripcion: 'Una estudiante llega a Bienestar.' }).subscribe();
    const peticion = http.expectOne(BASE);
    expect(peticion.request.body).toEqual({ lugarId: 'universidad', descripcion: 'Una estudiante llega a Bienestar.' });
    peticion.flush({ data: {} });
  });

  it('no manda la cabecera de revisión: la generación no es un borrador', () => {
    api.generationSkeleton('g1').subscribe();
    const peticion = http.expectOne(`${BASE}/g1/skeleton`);
    expect(peticion.request.headers.has('X-Case-Revision')).toBe(false);
    peticion.flush({ data: {} });
  });
});
