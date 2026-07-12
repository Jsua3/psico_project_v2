import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

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
});
