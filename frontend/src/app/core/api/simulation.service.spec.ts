import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable } from 'rxjs';

import { AttemptCompletionReport, SimulationDecisionResult } from '../models/simulation.model';
import { SimulationService } from './simulation.service';

describe('SimulationService private attempt GETs', () => {
  let service: SimulationService;
  let httpMock: HttpTestingController;
  const attemptId = 'attempt-private-1';
  const attemptToken = 'attempt-token-private';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SimulationService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SimulationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it.each([
    ['getProgressMap', () => service.getProgressMap(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}/progress-map`],
    ['getWorld', () => service.getWorld(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}/world`],
  ])('%s keeps the token out of the URL and sends it in the private header', (_name, call, url) => {
    // `call` es una unión de funciones con distintos Observable<T>: TypeScript no puede
    // resolver una llamada a un método sobrecargado (subscribe) sobre una unión de tipos de
    // función, con o sin argumentos (antes no se type-chequeaba bajo ts-jest). El cast a
    // Observable<unknown> es solo para esa limitación del checker; en runtime sigue siendo
    // el mismo Observable real.
    (call() as Observable<unknown>).subscribe(() => {});

    const request = httpMock.expectOne(url);
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).toBe(url);
    expect(request.request.headers.get('X-SIEP-Attempt-Token')).toBe(attemptToken);
    request.flush({ data: {} });
  });

  it('enters a room with the authored door key, never client coordinates', () => {
    const enterRoom = service.enterRoom.bind(service) as unknown as (
      attemptId: string,
      attemptToken: string,
      targetNodeKey: string,
      doorKey: string,
    ) => ReturnType<SimulationService['enterRoom']>;

    enterRoom('attempt-private-1', attemptToken, 'hospital-sala-escucha', 'puerta-sala-escucha').subscribe();

    const request = httpMock.expectOne('/api/simulation/attempts/attempt-private-1/enter-room');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      attemptToken,
      targetNodeKey: 'hospital-sala-escucha',
      doorKey: 'puerta-sala-escucha',
    });
    request.flush({ data: {} });
  });
});

describe('SimulationService student report', () => {
  let service: SimulationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SimulationService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SimulationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('tolera que el backend Django no envíe phaseDurations', () => {
    let report: AttemptCompletionReport | undefined;
    service.studentReport('a1').subscribe(value => (report = value));

    // Forma real de build_completion_report (game_dtos.py): sin phaseDurations.
    httpMock.expectOne('/api/simulation/attempts/a1/student-report').flush({
      data: { attemptId: 'a1', status: 'COMPLETED', recommendations: ['Sigue así'] },
    });

    expect(report?.phaseDurations).toEqual([]);
    expect(report?.recommendations).toEqual(['Sigue así']);
  });

  it('conserva decisionReview tal como llega del reporte congelado (C2)', () => {
    let report: AttemptCompletionReport | undefined;
    service.studentReport('a1').subscribe(value => (report = value));

    httpMock.expectOne('/api/simulation/attempts/a1/student-report').flush({
      data: {
        attemptId: 'a1',
        status: 'COMPLETED',
        decisionReview: [{
          order: 1, nodeId: 4, nodeTitle: 'Sala de escucha',
          chosen: { optionId: 9, text: 'Escuchar sin juzgar' },
          consequence: 'La estudiante continúa la conversación.',
          feedback: { explanation: 'Validar antes de indagar.', theoryBasis: 'Primeros auxilios psicológicos' },
          class: 'RECOMMENDED', prohibited: false,
        }],
      },
    });

    expect(report?.decisionReview).toHaveLength(1);
    expect(report?.decisionReview?.[0].feedback.theoryBasis).toBe('Primeros auxilios psicológicos');
  });
});

describe('SimulationService chooseDecision (C2: una sola forma de respuesta)', () => {
  let service: SimulationService;
  let httpMock: HttpTestingController;
  const url = '/api/simulation/attempts/a1/decisions';
  const state = { attemptId: 'a1', attemptToken: 't1', caseVersionId: 3, caseTitle: 'Caso', status: 'IN_PROGRESS' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SimulationService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SimulationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('la decisión llega como { attempt, consequence } y se aplana al estado del intento', () => {
    let result: SimulationDecisionResult | undefined;
    service.chooseDecision('a1', 't1', 9).subscribe(value => (result = value));

    httpMock.expectOne(url).flush({
      data: {
        attempt: { ...state },
        consequence: { text: 'La sala queda en silencio.', source: 'OPTION' },
      },
    });

    expect(result?.attemptId).toBe('a1');
    expect(result?.status).toBe('IN_PROGRESS');
    expect(result?.consequence).toEqual({ text: 'La sala queda en silencio.', source: 'OPTION' });
    expect(result?.retry).toBeNull();
    // Tras decidir no llega nada evaluativo: ni retroalimentación ni cifras en el resultado.
    expect(result).not.toHaveProperty('feedback');
  });

  it('un reintento concedido llega sin consecuencia y con el mensaje del servidor', () => {
    let result: SimulationDecisionResult | undefined;
    service.chooseDecision('a1', 't1', 9).subscribe(value => (result = value));

    httpMock.expectOne(url).flush({
      data: {
        attempt: { ...state },
        consequence: null,
        retry: { allowed: true, message: 'Puedes volver a elegir en esta escena.' },
      },
    });

    expect(result?.consequence).toBeNull();
    expect(result?.retry).toEqual({ allowed: true, message: 'Puedes volver a elegir en esta escena.' });
    expect(result?.attemptId).toBe('a1');
  });

  it('envía el requestId de la intención cuando se pasa', () => {
    service.chooseDecision('a1', 't1', 9, false, [], 'req-intencion-1').subscribe();

    const req = httpMock.expectOne(url);
    expect(req.request.body).toEqual({
      attemptToken: 't1', decisionOptionId: 9, evidenceOverride: false, missingEvidence: [], requestId: 'req-intencion-1',
    });
    req.flush({ data: { attempt: { ...state }, consequence: null } });
  });
});
