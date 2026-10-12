import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MAX_NOTIFICATIONS, NotificationService } from '../../../core/notifications/notification.service';
import { UiToastHost } from './ui-toast-host';

/**
 * ui-toast-host (plan visual §2.5 y §2.7, F2-7): pinta los avisos de NotificationService con el lenguaje visual. El
 * servicio ya limita a 4, deduplica y deja los errores hasta que se cierran; el anfitrión NO roba el foco, anuncia
 * los avisos corteses una vez (región viva) y los errores con role="alert", y pausa el cierre con el puntero o el
 * foco encima.
 */
// req: RNF-004 (mensajes de estado anunciados sin mover el foco, WCAG 4.1.3)
describe('ui-toast-host', () => {
  let fixture: ComponentFixture<UiToastHost>;
  let service: NotificationService;
  let announce: ReturnType<typeof vi.fn>;
  const root = () => fixture.nativeElement as HTMLElement;
  const toasts = () => [...root().querySelectorAll<HTMLElement>('.ui-toast')];

  beforeEach(() => {
    vi.useFakeTimers();
    announce = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveAnnouncer, useValue: { announce } }],
    });
    service = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(UiToastHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    root().remove();
    vi.useRealTimers();
  });

  it('es una región con nombre y pinta cada aviso con su tono', () => {
    service.success('Guardado');
    service.warning('Tu sesión vence en 5 minutos');
    fixture.detectChanges();
    expect(root().querySelector('section')?.getAttribute('aria-label')).toBe('Mensajes del sistema');
    expect(toasts().map(toast => toast.querySelector('.ui-toast__text')?.textContent?.trim()))
      .toEqual(['Guardado', 'Tu sesión vence en 5 minutos']);
    expect(toasts()[0].classList).toContain('ui-toast--success');
  });

  it('no roba el foco al aparecer', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    service.error('No se pudo guardar');
    fixture.detectChanges();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('los errores llevan role="alert" y no se van solos; los demás se anuncian una vez, con cortesía', () => {
    service.error('No se pudo guardar');
    service.success('Guardado');
    fixture.detectChanges();
    expect(toasts()[0].getAttribute('role')).toBe('alert');
    expect(toasts()[1].hasAttribute('role')).toBe(false);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Guardado', 'polite');
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(toasts().map(toast => toast.querySelector('.ui-toast__text')?.textContent?.trim())).toEqual(['No se pudo guardar']);
  });

  it('el puntero encima pausa el cierre automático; al salir, sigue', () => {
    service.success('Guardado');
    fixture.detectChanges();
    toasts()[0].dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(toasts().length).toBe(1);
    toasts()[0].dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(toasts().length).toBe(0);
  });

  it('el botón de cerrar es un ui-icon-button con nombre y quita el aviso', () => {
    service.error('No se pudo guardar');
    fixture.detectChanges();
    const close = toasts()[0].querySelector<HTMLButtonElement>('button[ui-icon-button]')!;
    expect(close.getAttribute('aria-label')).toBe('Cerrar aviso');
    close.click();
    fixture.detectChanges();
    expect(toasts().length).toBe(0);
  });

  it('nunca más de cuatro a la vez (lo garantiza el servicio)', () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 2; i++) service.info(`Aviso ${i}`);
    fixture.detectChanges();
    expect(toasts().length).toBe(MAX_NOTIFICATIONS);
  });
});
