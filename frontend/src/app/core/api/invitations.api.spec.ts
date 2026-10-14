import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { CaseListCache } from './case-list-cache';
import { InvitationsApi } from './invitations.api';

/**
 * Cliente de C5 (E2-10): `GET /api/me/invitations` y `POST /api/me/invitations/{groupId}/accept|decline|leave`. El
 * servidor solo acepta cuerpos JSON que sean un OBJETO (`[]`, `"x"` o vacío → 400): las órdenes mandan `{}`.
 */
// req: SIEP-RF-04, D-14
describe('InvitationsApi', () => {
  let api: InvitationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(InvitationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista las invitaciones propias', async () => {
    const list = firstValueFrom(api.list());
    const request = http.expectOne('/api/me/invitations');
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, message: null, data: [{ id: 4, groupId: 4, groupName: 'G', teacherName: 'T', invitedAt: null, status: 'INVITED' }] });
    expect((await list)[0].groupId).toBe(4);
  });

  it.each([
    ['accept', (groupId: number) => api.accept(groupId)],
    ['decline', (groupId: number) => api.decline(groupId)],
    ['leave', (groupId: number) => api.leave(groupId)],
  ] as const)('%s responde por el grupo con POST y un cuerpo objeto', async (action, call) => {
    const done = firstValueFrom(call(4));
    const request = http.expectOne(`/api/me/invitations/4/${action}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, message: 'ok', data: { id: 4, groupId: 4, groupName: 'G', teacherName: 'T', invitedAt: null, status: 'ACTIVE' } });
    expect((await done).status).toBe('ACTIVE');
  });

  // Revisión de F7b: aceptar, rechazar o salir cambia los casos que ve el estudiante; la lista guardada (30 s) del
  // panel y del catálogo no puede servir la de antes.
  // req: SIEP-RF-04, RN-04
  it.each([
    ['accept', (groupId: number) => api.accept(groupId)],
    ['decline', (groupId: number) => api.decline(groupId)],
    ['leave', (groupId: number) => api.leave(groupId)],
  ] as const)('%s invalida la lista de casos guardada', async (action, call) => {
    const cache = TestBed.inject(CaseListCache);
    const load = vi.fn(() => of([]));
    await firstValueFrom(cache.get('estudiante-1', load));
    await firstValueFrom(cache.get('estudiante-1', load));
    expect(load).toHaveBeenCalledTimes(1);

    const done = firstValueFrom(call(4));
    http.expectOne(`/api/me/invitations/4/${action}`).flush({
      success: true, message: 'ok', data: { id: 4, groupId: 4, groupName: 'G', teacherName: 'T', invitedAt: null, status: 'ACTIVE' },
    });
    await done;

    await firstValueFrom(cache.get('estudiante-1', load));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
