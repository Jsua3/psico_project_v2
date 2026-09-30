import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../core/notifications/notification.service';
import { NotificationHostComponent } from './notification-host.component';

describe('NotificationHostComponent', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotificationHostComponent] });
    service = TestBed.inject(NotificationService);
  });

  function render() {
    const fixture = TestBed.createComponent(NotificationHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('los errores se anuncian como alerta y el resto como estado', () => {
    service.error('Falló');
    service.success('Guardado');
    const fixture = render();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.siep-notification')) as HTMLElement[];
    expect(items.map(i => i.getAttribute('role'))).toEqual(['alert', 'status']);
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
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
