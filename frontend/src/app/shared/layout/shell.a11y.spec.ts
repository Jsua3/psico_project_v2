import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class Screen {}

/**
 * Accesibilidad de la barra del portal (plan visual F3-3), en DOM y no sobre el texto de la plantilla. El antiguo
 * menú móvil (inerte cerrado, aria-expanded/controls, Esc devuelve el foco) lo sustituyen las pestañas inferiores de
 * F3-5, que traen sus propias pruebas.
 */
// req: BLOQUE-H, RNF-004 (nombres accesibles y puntos de referencia de la navegación)
describe('shell: barra accesible', () => {
  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: AuthService, useValue: { currentUser: signal<User>({ id: 1, nombre: 'Ana', apellido: 'Ruiz', email: 'a@b.co', role: 'ADMIN' }), logout: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('la barra es la cabecera de la página (banner) y su navegación está nombrada', async () => {
    const host = await render();
    const header = host.querySelector('header')!;
    expect(header.closest('main, article, aside, nav, section')).toBeNull();
    expect(host.querySelectorAll('nav[aria-label="Navegación principal"]')).toHaveLength(1);
  });

  it('el logo es un enlace con nombre propio (su texto visual es solo la marca)', async () => {
    const host = await render();
    expect(host.querySelector('a.modulo-logo')!.getAttribute('aria-label')).toBe('SIEP: ir al panel');
  });

  it('el «···» es decorativo y los plegados siguen en el árbol accesible (los alcanza Tab)', async () => {
    const host = await render();
    expect(host.querySelector('.indicador-mas')!.getAttribute('aria-hidden')).toBe('true');
    for (const fold of host.querySelectorAll('a.control-plegable')) {
      expect(fold.hasAttribute('aria-hidden')).toBe(false);
      expect(fold.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('el menú de cuenta tiene nombre y el rol se lee como texto', async () => {
    const host = await render();
    const trigger = host.querySelector('.modulo-cuenta button')!;
    expect(trigger.getAttribute('aria-label') ?? trigger.textContent).toMatch(/cuenta/i);
    expect(host.querySelector('.cuenta-chip__rol')!.textContent!.trim()).toBe('Administrador');
  });
});
