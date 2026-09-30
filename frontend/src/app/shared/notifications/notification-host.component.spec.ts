import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../core/notifications/notification.service';
import { NotificationHostComponent } from './notification-host.component';

describe('NotificationHostComponent', () => {
  let service: NotificationService;
  let announce: jest.Mock;

  beforeEach(() => {
    announce = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [NotificationHostComponent],
      providers: [{ provide: LiveAnnouncer, useValue: { announce } }],
    });
    service = TestBed.inject(NotificationService);
  });

  function render() {
    const fixture = TestBed.createComponent(NotificationHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('solo los errores llevan role alert; el resto se anuncia por la región viva y la sección no tiene aria-live', () => {
    service.error('Falló');
    service.success('Guardado');
    const fixture = render();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.siep-notification')) as HTMLElement[];
    expect(items.map(i => i.getAttribute('role'))).toEqual(['alert', null]);
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
  });

  describe('anuncio a lectores de pantalla', () => {
    it('un error tiene role alert y no pasa por LiveAnnouncer', () => {
      service.error('Falló');
      const fixture = render();
      const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
      expect(item.getAttribute('role')).toBe('alert');
      expect(announce).not.toHaveBeenCalled();
    });

    it('un éxito se anuncia una sola vez con cortesía y sin role', () => {
      service.success('Guardado');
      const fixture = render();
      const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
      expect(item.hasAttribute('role')).toBe(false);
      fixture.detectChanges();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Guardado', 'polite');
    });

    it('info y advertencia también se anuncian con cortesía', () => {
      const fixture = render();
      service.info('Aviso informativo');
      service.warning('Cuidado');
      fixture.detectChanges();
      expect(announce.mock.calls).toEqual([
        ['Aviso informativo', 'polite'],
        ['Cuidado', 'polite'],
      ]);
    });

    it('una nueva emisión no vuelve a anunciar los avisos que ya estaban', () => {
      const fixture = render();
      service.success('Guardado');
      service.info('Otro');
      service.error('Falló');
      fixture.detectChanges();
      expect(announce.mock.calls).toEqual([
        ['Guardado', 'polite'],
        ['Otro', 'polite'],
      ]);
    });

    it('cerrar un aviso no dispara ningún anuncio', () => {
      service.success('Guardado');
      const fixture = render();
      announce.mockClear();
      const button = fixture.nativeElement.querySelector('.siep-notification button') as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      expect(announce).not.toHaveBeenCalled();
    });
  });

  it('pausa con el cursor o el foco y reanuda al salir', () => {
    service.info('Hola'); // show() ya invoca resume() para armar el temporizador: espiar después
    const pause = jest.spyOn(service, 'pause');
    const resume = jest.spyOn(service, 'resume');
    const fixture = render();
    const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
    item.dispatchEvent(new Event('mouseenter'));
    item.dispatchEvent(new Event('mouseleave'));
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(pause).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('el botón de cerrar tiene nombre accesible y quita el aviso', () => {
    service.error('Falló');
    const fixture = render();
    const button = fixture.nativeElement.querySelector('.siep-notification button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Cerrar aviso');
    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.siep-notification').length).toBe(0);
  });

  describe('la pausa es un booleano en el servicio: no se reanuda mientras quede cursor o foco', () => {
    it('al salir el cursor no reanuda si el foco sigue dentro del aviso', () => {
      service.info('Hola');
      const resume = jest.spyOn(service, 'resume');
      const fixture = render();
      const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
      const button = item.querySelector('button') as HTMLButtonElement;

      item.dispatchEvent(new Event('mouseenter'));
      button.focus();
      expect(item.contains(document.activeElement)).toBe(true);

      item.dispatchEvent(new Event('mouseleave'));
      expect(resume).not.toHaveBeenCalled();

      // Al perder el foco (el cursor ya salió) sí se reanuda, una sola vez.
      button.blur();
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it('al salir el foco no reanuda si el cursor sigue encima', () => {
      service.info('Hola');
      const resume = jest.spyOn(service, 'resume');
      const fixture = render();
      const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;

      // jsdom no calcula :hover, así que se simula que el cursor sigue sobre el aviso.
      const matches = item.matches.bind(item);
      const matchesSpy = jest.spyOn(item, 'matches').mockImplementation(selector =>
        selector === ':hover' ? true : matches(selector)
      );
      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(resume).not.toHaveBeenCalled();

      matchesSpy.mockRestore();
      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it('al mover el foco a otro punto del mismo aviso no reanuda', () => {
      service.info('Hola');
      const resume = jest.spyOn(service, 'resume');
      const fixture = render();
      const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
      const button = item.querySelector('button') as HTMLButtonElement;

      item.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
      expect(resume).not.toHaveBeenCalled();
    });
  });
});
