import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AdminAuditService, AuditFilterParams } from './admin-audit.service';
import type { AuditListEnvelope } from './generated/openapi-contracts';

// req: RNF-005
/** Una respuesta con la forma del contrato generado: si el servidor la cambia, esta fixture deja de compilar. */
const AUDIT_RESPONSE: AuditListEnvelope = {
  success: true,
  data: {
    items: [
      {
        id: 41,
        actorId: 7,
        actorRole: 'ADMIN',
        action: 'CASE_PUBLISHED',
        taxonomy: 'caso.publicar',
        resourceType: 'CASE',
        resourceId: '12',
        context: { method: 'post' },
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        occurredAt: '2026-10-17T15:00:00.123456',
        retentionUntil: '2027-10-12T15:00:00.123456',
      },
    ],
    page: 1,
    pageSize: 25,
    coverage: { shown: 1, total: 1 },
    retentionDays: 360,
    reviewQuality: {
      decidedReviews: 2,
      approved: 1,
      rejectedTotal: 1,
      rejectedByContent: 1,
      rejectedByForm: 0,
      contentRejectionRate: 0.5,
      formRejectionRate: 0,
      rubberStampAlarm: false,
    },
  },
};

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

  const sentParams = (request: { params: { keys(): string[]; get(key: string): string | null } }) =>
    Object.fromEntries(request.params.keys().map(key => [key, request.params.get(key)]));

  it('reactiva la lectura de /api/admin/audit cuando cambian los filtros de señal', async () => {
    const filters = signal<AuditFilterParams>({ action: 'caso.publicar', page: 1, pageSize: 25 });
    const resource = TestBed.runInInjectionContext(() => service.createAuditResource(filters));
    TestBed.inject(ApplicationRef).tick();

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/audit' && r.params.get('action') === 'caso.publicar' && r.params.get('page') === '1',
    );
    expect(req.request.method).toBe('GET');
    req.flush(AUDIT_RESPONSE);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(resource.hasValue()).toBe(true);
    expect(resource.value()?.data.retentionDays).toBe(360);
    expect(resource.value()?.data.items[0].taxonomy).toBe('caso.publicar');

    filters.set({ action: 'traza.leer', page: 1, pageSize: 25 });
    TestBed.inject(ApplicationRef).tick();
    const next = httpMock.expectOne(r => r.url === '/api/admin/audit' && r.params.get('action') === 'traza.leer');
    next.flush(AUDIT_RESPONSE);
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('manda los filtros con los nombres que el servidor entiende', () => {
    const filters = signal<AuditFilterParams>({
      actorId: 7,
      action: 'caso.publicar',
      resourceType: 'CASE',
      from: '2026-10-17T20:00:00Z',
      to: '2026-10-17T21:00:00Z',
      page: 2,
      pageSize: 25,
    });
    TestBed.runInInjectionContext(() => service.createAuditResource(filters));
    TestBed.inject(ApplicationRef).tick();

    const req = httpMock.expectOne(r => r.url === '/api/admin/audit');

    expect(sentParams(req.request)).toEqual({
      actorId: '7',
      action: 'caso.publicar',
      resourceType: 'CASE',
      from: '2026-10-17T20:00:00Z',
      to: '2026-10-17T21:00:00Z',
      page: '2',
      pageSize: '25',
    });
    req.flush(AUDIT_RESPONSE);
  });

  it('no manda los filtros que no se usan', () => {
    TestBed.runInInjectionContext(() => service.createAuditResource(signal<AuditFilterParams>({})));
    TestBed.inject(ApplicationRef).tick();

    const req = httpMock.expectOne(r => r.url === '/api/admin/audit');

    expect(sentParams(req.request)).toEqual({});
    req.flush(AUDIT_RESPONSE);
  });
});
