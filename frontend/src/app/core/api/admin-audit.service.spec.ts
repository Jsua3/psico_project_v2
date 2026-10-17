import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AdminAuditService, AuditFilterParams } from './admin-audit.service';

// req: RNF-005
describe('AdminAuditService (piloto httpResource · ANG-4)', () => {
  let service: AdminAuditService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminAuditService,
      ],
    });
    service = TestBed.inject(AdminAuditService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reactiva la lectura de /api/admin/audit cuando cambian los filtros de señal', async () => {
    const filters = signal<AuditFilterParams>({ action: 'caso.publicar', page: 1, pageSize: 25 });
    const resource = TestBed.runInInjectionContext(() => service.createAuditResource(filters));
    TestBed.inject(ApplicationRef).tick();

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/audit' && r.params.get('action') === 'caso.publicar' && r.params.get('page') === '1',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        items: [],
        page: 1,
        pageSize: 25,
        coverage: { shown: 0, total: 0 },
        retentionDays: 360,
        reviewQuality: {
          contentCommentCount: 2,
          formOnlyCount: 0,
          totalReviews: 2,
          formRatio: 0,
          rubberStampWarning: false,
        },
      },
    });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(resource.hasValue()).toBe(true);
    expect(resource.value()?.data.retentionDays).toBe(360);
  });
});
