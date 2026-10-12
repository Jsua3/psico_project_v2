import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../ui/dialog/ui-dialog';
import { PUBLIC_ANCHORS, PublicBarComponent } from './public-bar.component';

@Component({
  imports: [PublicBarComponent],
  template: `
    <app-public-bar [anchors]="anchors" />
    @for (anchor of anchors; track anchor.id) { <section [id]="anchor.id">{{ anchor.label }}</section> }
  `,
})
class LandingHost {
  anchors = PUBLIC_ANCHORS;
}

@Component({ imports: [PublicBarComponent], template: '<app-public-bar mode="acceso" />' })
class LoginHost {}

/**
 * Cabecera pública (plan visual F3-4): la portada y el acceso usan la MISMA barra de vidrio que el portal. En la
 * portada, anclas a sus secciones y «Ingresar»; en el acceso, el regreso a la portada.
 */
// req: BLOQUE-H (navegación pública con la barra del lenguaje)
describe('app-public-bar', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: UiDialog, useValue: { sheet: vi.fn() } }],
  }));

  it('la portada: barra de vidrio nombrada, anclas que apuntan a secciones que existen e «Ingresar»', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const header = host.querySelector('header.cromo')!;
    expect(header.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Navegación pública');
    const anchors = [...header.querySelectorAll<HTMLAnchorElement>('.modulo-principal a.nav-enlace')];
    expect(anchors.map(anchor => anchor.textContent!.trim())).toEqual(['Simulador', 'Casos', 'Cómo funciona', 'Roles', 'Ética']);
    for (const anchor of anchors) expect(host.querySelector(anchor.getAttribute('href')!)).not.toBeNull();
    const login = header.querySelector<HTMLAnchorElement>('.modulo-cuenta a')!;
    expect(login.textContent!.trim()).toBe('Ingresar');
    expect(login.getAttribute('href')).toBe('/login');
    expect(header.firstElementChild!.textContent!.trim()).toBe('Saltar a la navegación');
  });

  it('en móvil, las mismas anclas son las pestañas inferiores (hija directa del header), con icono y sin «Más»', async () => {
    const fixture = TestBed.createComponent(LandingHost);
    await fixture.whenStable();
    const bottom = (fixture.nativeElement as HTMLElement).querySelector('header.cromo > nav.modulo-inferior')!;
    expect(bottom.getAttribute('aria-label')).toBe('Navegación pública');
    const tabs = [...bottom.querySelectorAll<HTMLAnchorElement>('a.pestana')];
    expect(tabs.map(tab => tab.querySelector('.pestana__rotulo')!.textContent!.trim())).toEqual(['Simulador', 'Casos', 'Cómo funciona', 'Roles', 'Ética']);
    expect(tabs.map(tab => tab.getAttribute('href'))).toEqual(['#simulador', '#casos', '#como-funciona', '#roles', '#etica']);
    for (const tab of tabs) expect(tab.querySelector('mat-icon')!.textContent!.trim()).not.toBe('');
    expect(bottom.querySelector('button.pestana')).toBeNull();
  });

  it('el acceso: la misma barra, sin anclas ni pestañas, con el regreso a la portada', async () => {
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('header.cromo')!;
    expect(header.querySelectorAll('.modulo-principal a.nav-enlace')).toHaveLength(0);
    expect(header.querySelector('nav.modulo-inferior')).toBeNull();
    expect(header.querySelector('a.psy-skip-link')).toBeNull(); // sin navegación no hay salto a ella
    const back = header.querySelector<HTMLAnchorElement>('.modulo-cuenta a')!;
    expect(back.textContent!.trim()).toBe('Volver al inicio');
    expect(back.hasAttribute('aria-label')).toBe(false); // el nombre es el texto visible (WCAG 2.5.3)
    expect(back.getAttribute('href')).toBe('/');
  });

  it('el logo es un enlace con nombre a la portada', async () => {
    const fixture = TestBed.createComponent(LoginHost);
    await fixture.whenStable();
    const logo = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.modulo-logo')!;
    expect(logo.getAttribute('aria-label')).toBe('SIEP: ir al inicio');
    expect(logo.getAttribute('href')).toBe('/');
  });
});
