import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { InstructorApi } from './instructor.api';

/** E1-2 (RN-07): el reemplazo docente manda el motivo (obligatorio) y el servidor devuelve el intento ya REPLACED. */
// req: RN-07
describe('InstructorApi: reemplazo docente', () => {
  it('POST /api/instructor/attempts/{id}/replace con {reason}', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(InstructorApi);
    const http = TestBed.inject(HttpTestingController);

    const done = firstValueFrom(api.replaceAttempt('a-1', 'Se trabó el mundo'));
    const request = http.expectOne('/api/instructor/attempts/a-1/replace');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Se trabó el mundo' });
    request.flush({ success: true, message: 'Intento reemplazado', data: { attemptId: 'a-1', status: 'REPLACED', reason: 'Se trabó el mundo', replacedAt: null } });
    expect((await done).status).toBe('REPLACED');
    http.verify();
  });
});
