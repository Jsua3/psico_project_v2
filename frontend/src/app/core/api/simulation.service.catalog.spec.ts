import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SimulationService } from './simulation.service';

describe('SimulationService.getCatalog', () => {
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

  it('GETs /api/simulation/catalog and unwraps the envelope', () => {
    const items = [
      { caseVersionId: 1, code: 'SIM-VBG-001', title: 'Caso 1', description: 'd',
        order: 0, unlocked: true, completed: false, locked: false },
    ];
    let result: unknown;
    service.getCatalog().subscribe(r => (result = r));
    const req = httpMock.expectOne('/api/simulation/catalog');
    expect(req.request.method).toBe('GET');
    req.flush({ data: items });
    expect(result).toEqual(items);
  });
});
