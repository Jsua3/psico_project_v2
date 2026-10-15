import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';

/** JWT de prueba que no vence (año 2100) con el rol y el id que lee `loadUser`. */
function token(role = 'ESTUDIANTE'): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'ana@cue.edu.co', userId: 7, role, exp: 4_102_444_800 })}.firma`;
}

/**
 * El cambio de contraseña obligatorio de E2-9 (RN-10): `/auth/login` y `/auth/me` traen `mustChangePassword` y la
 * sesión lo conserva; `/auth/change-password` lo apaga. Sin esto, la interfaz no sabía que la persona estaba entrando
 * con una contraseña temporal y la dejaba en un portal donde el servidor le niega todo.
 */
// req: RN-10, RNF-01
describe('AuthService: cambio de contraseña obligatorio (E2-9)', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const summary = (mustChangePassword: boolean) =>
    ({ id: 7, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', role: 'ESTUDIANTE', mustChangePassword });

  it('el acceso conserva `mustChangePassword` de la respuesta', async () => {
    const done = firstValueFrom(service.login('ana@cue.edu.co', 'Temporal-123'));
    http.expectOne('/api/auth/login').flush({ success: true, message: null, data: { token: token(), user: summary(true) } });
    await done;
    expect(service.mustChangePassword()).toBe(true);
  });

  it('`/auth/me` también lo trae al recargar (el JWT no lo lleva)', async () => {
    localStorage.setItem('psychosim_token', token());
    expect(service.mustChangePassword()).toBe(false);
    const done = firstValueFrom(service.syncCurrentUser());
    http.expectOne('/api/auth/me').flush({ success: true, message: null, data: summary(true) });
    await done;
    expect(service.mustChangePassword()).toBe(true);
  });

  it('cambiarla envía la actual y la nueva a `/auth/change-password`; al terminar la sesión deja de exigirlo', async () => {
    const done = firstValueFrom(service.login('ana@cue.edu.co', 'Temporal-123'));
    http.expectOne('/api/auth/login').flush({ success: true, message: null, data: { token: token(), user: summary(true) } });
    await done;

    const change = firstValueFrom(service.changePassword('Temporal-123', 'Nueva-clave-2026'));
    const request = http.expectOne('/api/auth/change-password');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ currentPassword: 'Temporal-123', newPassword: 'Nueva-clave-2026' });
    request.flush({ success: true, message: 'Contraseña actualizada', data: null });
    await change;

    service.markPasswordChanged();
    expect(service.mustChangePassword()).toBe(false);
    expect(service.currentUser()?.nombre).toBe('Ana');
  });

  it('un 403 PASSWORD_CHANGE_REQUIRED marca la sesión aunque `/me` no haya llegado', () => {
    localStorage.setItem('psychosim_token', token());
    expect(service.mustChangePassword()).toBe(false);
    service.requirePasswordChange();
    expect(service.mustChangePassword()).toBe(true);
  });
});
