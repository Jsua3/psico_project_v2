import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { InvitationsComponent } from './invitations.component';

/**
 * Bandeja de invitaciones del estudiante (plan visual F7b-5; C5 de E2-10; decisión 22 del usuario: un docente no suma a
 * un estudiante sin su aceptación). Antes no existía: con el servidor de E2 un estudiante invitado no tenía forma de
 * aceptar y el docente veía su invitación pendiente para siempre (el servidor necesitaba el puente
 * `SIEP_INVITATIONS_AUTO_ACCEPT`).
 */
// req: SIEP-RF-04, RNF-04
describe('InvitationsComponent', () => {
  let fixture: ComponentFixture<InvitationsComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (name: string) => [...host().querySelectorAll('button')].find(el => text(el) === name) ?? null;

  const invitation = (over: Partial<Invitation> = {}): Invitation => ({
    id: 1, groupId: 1, groupName: 'Psicología Jurídica · 2026-2', teacherName: 'Paula Docente',
    invitedAt: '2026-10-10T15:00:00Z', status: 'INVITED', ...over,
  });

  interface Api {
    list: () => Observable<Invitation[]>;
    accept: (groupId: number) => Observable<Invitation>;
    decline: (groupId: number) => Observable<Invitation>;
    leave: (groupId: number) => Observable<Invitation>;
  }

  async function render(api: Partial<Api> = {}, confirm = vi.fn(async () => true)) {
    const resolved: Api = {
      list: () => of([invitation()]),
      accept: id => of(invitation({ id, groupId: id, status: 'ACTIVE' })),
      decline: id => of(invitation({ id, groupId: id, status: 'DECLINED' })),
      leave: id => of(invitation({ id, groupId: id, status: 'REMOVED' })),
      ...api,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: InvitationsApi, useValue: resolved },
        { provide: UiDialog, useValue: { confirm } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(InvitationsComponent);
    await fixture.whenStable();
    return resolved;
  }

  it('lista cada invitación con su grupo, su docente y su estado en palabras (nunca el enum crudo)', async () => {
    await render({ list: () => of([invitation(), invitation({ id: 2, groupId: 2, groupName: 'Crisis', status: 'ACTIVE' })]) });
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    const items = [...host().querySelectorAll('.inv-item')];
    expect(items).toHaveLength(2);
    expect(text(items[0])).toContain('Psicología Jurídica · 2026-2');
    expect(text(items[0])).toContain('Paula Docente');
    expect(text(items[0])).toContain('Pendiente');
    expect(text(items[1])).toContain('Miembro');
    expect(host().textContent).not.toMatch(/INVITED|ACTIVE/);
  });

  it('una invitación pendiente se acepta y queda como miembro, sin recargar a ciegas', async () => {
    const accept = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'ACTIVE' })));
    await render({ accept });
    button('Aceptar')!.click();
    await fixture.whenStable();
    expect(accept).toHaveBeenCalledWith(1);
    expect(text(host().querySelector('.inv-item'))).toContain('Miembro');
    expect(button('Aceptar')).toBeNull();
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Te uniste a Psicología Jurídica · 2026-2');
  });

  it('«Rechazar» pide confirmar; si se cancela no se envía nada', async () => {
    const decline = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'DECLINED' })));
    const confirm = vi.fn(async () => false);
    await render({ decline }, confirm);
    button('Rechazar')!.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(decline).not.toHaveBeenCalled();
  });

  it('un miembro puede salir del grupo tras confirmar', async () => {
    const leave = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'REMOVED' })));
    await render({ list: () => of([invitation({ status: 'ACTIVE' })]), leave });
    button('Salir del grupo')!.click();
    await fixture.whenStable();
    expect(leave).toHaveBeenCalledWith(1);
  });

  it('si la invitación ya no está vigente (409), lo dice y vuelve a pedir la lista', async () => {
    const list = vi.fn(() => of([invitation()]));
    const conflict = new HttpErrorResponse({
      status: 409, error: { success: false, code: 'MEMBERSHIP_NOT_INVITED', message: 'Esta invitación ya fue respondida o ya no está vigente.' },
    });
    await render({ list, accept: () => throwError(() => conflict) });
    button('Aceptar')!.click();
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(2);
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('ya fue respondida');
  });

  it('sin invitaciones: un vacío que explica de dónde vienen (no una lista vacía muda)', async () => {
    await render({ list: () => of([]) });
    expect(host().querySelector('ui-empty-state')).not.toBeNull();
    expect(host().querySelectorAll('.inv-item')).toHaveLength(0);
  });

  it('si la lista falla: error con «Reintentar», sin vacío a la vez', async () => {
    const list = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    await render({ list });
    expect(host().querySelector('ui-error-state')).not.toBeNull();
    expect(host().querySelector('ui-empty-state')).toBeNull();
  });

  it('mientras carga: esqueleto y la región de estado lo dice', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Subject<Invitation[]>();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(), provideRouter([]),
          { provide: InvitationsApi, useValue: { list: () => pending } },
          { provide: UiDialog, useValue: { confirm: vi.fn() } },
          { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        ],
      });
      fixture = TestBed.createComponent(InvitationsComponent);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando tus invitaciones…');
    } finally {
      vi.useRealTimers();
    }
  });
});
