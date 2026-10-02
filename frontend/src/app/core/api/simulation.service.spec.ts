import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AttemptCompletionReport } from '../models/simulation.model';
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
    ['getAttempt', () => service.getAttempt(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}`],
    ['getProgressMap', () => service.getProgressMap(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}/progress-map`],
    ['getWorld', () => service.getWorld(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}/world`],
    ['getCompletionReport', () => service.getCompletionReport(attemptId, attemptToken), `/api/simulation/attempts/${attemptId}/completion-report`],
  ])('%s keeps the token out of the URL and sends it in the private header', (_name, call, url) => {
    call().subscribe();

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
});
