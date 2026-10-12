import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MAX_NOTIFICATIONS, NotificationService } from '../../../core/notifications/notification.service';
import { UiToastHost } from './ui-toast-host';

/**
 * ui-toast-host (plan visual §2.5 y §2.7, F2-7): pinta los avisos de NotificationService con el lenguaje visual. El
 * servicio ya limita a 4, deduplica y deja los errores hasta que se cierran; el anfitrión NO roba el foco, anuncia
 * cada aviso una vez por la región viva del CDK (los errores en modo assertive: un role="alert" dentro de la app
 * queda oculto cuando hay un diálogo abierto), vive en la capa superior y pausa el cierre con el puntero o el foco.
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

  it('los errores se anuncian en modo assertive y no se van solos; los demás, una vez y con cortesía', () => {
    service.error('No se pudo guardar');
    service.success('Guardado');
    fixture.detectChanges();
    expect(toasts().every(toast => !toast.hasAttribute('role'))).toBe(true);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith('No se pudo guardar', 'assertive');
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

describe('ui-toast-host: capa superior y retorno del foco (revisión de F2, I7)', () => {
  let fixture: ComponentFixture<UiToastHost>;
  let service: NotificationService;
  const shown: string[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const original = { show: proto['showPopover'], hide: proto['hidePopover'] };

  beforeEach(() => {
    shown.length = 0;
    proto['showPopover'] = function (this: HTMLElement) { shown.push('show'); this.dataset['open'] = 'true'; };
    proto['hidePopover'] = function (this: HTMLElement) { shown.push('hide'); delete this.dataset['open']; };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: LiveAnnouncer, useValue: { announce: vi.fn().mockResolvedValue(undefined) } }],
    });
    service = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(UiToastHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    (fixture.nativeElement as HTMLElement).remove();
    proto['showPopover'] = original.show;
    proto['hidePopover'] = original.hide;
  });

  it('la región es un popover que se muestra con el primer aviso y se oculta con el último', async () => {
    const region = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ui-toast-host__region')!;
    expect(region.getAttribute('popover')).toBe('manual');
    service.error('No se pudo guardar');
    await fixture.whenStable();
    expect(region.dataset['open']).toBe('true');
    service.clear();
    await fixture.whenStable();
    expect(region.dataset['open']).toBeUndefined();
  });

  it('cerrar un aviso con el teclado devuelve el foco a donde estaba', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    service.error('No se pudo guardar');
    await fixture.whenStable();
    const close = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ui-toast button')!;
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: before }));
    close.focus();
    close.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});
