import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { UiMenu } from '../ui/menu/ui-menu';
import { isGameRoute } from './game-route.util';
import { ShellComponent } from './shell.component';

@Component({ template: '<p>pantalla</p>' })
class Screen {}

const user = (role: User['role']): User => ({ id: 1, nombre: 'Ana María', apellido: 'Rodríguez', email: 'ana@cue.edu.co', role });

/**
 * Shell del portal con la barra de vidrio modular (plan visual F3-3). Comportamiento en DOM: destinos y plegado por
 * rol desde NAV_ITEMS, destino activo con aria-current, cuenta con nombre, rol y menú, y sin barra en el juego
 * (`data: { chrome: 'hidden' }`). Sustituye a los contratos que leían la plantilla del menú lateral.
 */
// req: BLOQUE-H (navegación del portal, plan visual F3-3)
describe('ShellComponent: barra de vidrio en el portal', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let router: Router;
  const currentUser = signal<User | null>(user('ESTUDIANTE'));
  const logout = vi.fn();

  const host = () => fixture.nativeElement as HTMLElement;
  const links = () => [...host().querySelectorAll<HTMLAnchorElement>('.modulo-principal a.nav-enlace')];
  const labels = () => links().map(link => link.textContent!.trim());
  const folded = () => links().filter(link => link.classList.contains('control-plegable')).map(link => link.textContent!.trim());

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    currentUser.set(user('ESTUDIANTE'));
    logout.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          {
            // Sin componente: el shell es el de la prueba, y su router-outlet pinta las pantallas hijas.
            path: 'portal',
            children: [
              { path: 'dashboard', component: Screen },
              { path: 'simulador', component: Screen },
              { path: 'simulador/:id', component: Screen, data: { chrome: 'hidden' } },
              { path: 'jugar', component: Screen, data: { chrome: 'hidden' } },
            ],
          },
        ]),
        { provide: AuthService, useValue: { currentUser, logout } },
      ],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ShellComponent);
    await go('/portal/dashboard');
  });

  afterEach(() => document.body.classList.remove('game-mode'));

  it('pinta la barra (header.cromo) con la navegación principal nombrada', () => {
    const header = host().querySelector('header.cromo');
    expect(header).not.toBeNull();
    expect(header!.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Navegación principal');
  });

  it('el estudiante ve Panel, Simulador y Mi personaje, sin plegables, y ningún «Continuar simulación» (T15.4)', () => {
    expect(labels()).toEqual(['Panel', 'Simulador', 'Mi personaje']);
    expect(folded()).toEqual([]);
    expect(host().textContent).not.toContain('Continuar simulación');
  });

  it('el docente pliega Rúbricas, Grupos y Reportes; su destino principal (Trazabilidad) queda a la vista', async () => {
    currentUser.set(user('PROFESOR'));
    await fixture.whenStable();
    expect(labels()).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Rúbricas', 'Grupos', 'Reportes']);
    expect(folded()).toEqual(['Rúbricas', 'Grupos', 'Reportes']);
  });

  it('cambiar de sesión sin recargar actualiza destinos y plegados (Review Focus 3)', async () => {
    currentUser.set(user('ADMIN'));
    await fixture.whenStable();
    expect(folded()).toEqual(['Mi personaje', 'Rúbricas', 'Usuarios']);
    currentUser.set(user('ESTUDIANTE'));
    await fixture.whenStable();
    expect(labels()).toEqual(['Panel', 'Simulador', 'Mi personaje']);
    expect(folded()).toEqual([]);
  });

  it('el destino activo lleva aria-current="page" y solo él', async () => {
    await go('/portal/simulador');
    const current = links().filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.textContent!.trim())).toEqual(['Simulador']);
  });

  it('la cuenta muestra nombre y rol humanizado, y su menú se llama «Cuenta»', async () => {
    currentUser.set(user('PROFESOR'));
    await fixture.whenStable();
    expect(host().querySelector('.cuenta-chip__nombre')!.textContent!.trim()).toBe('Ana María Rodríguez');
    expect(host().querySelector('.cuenta-chip__rol')!.textContent!.trim()).toBe('Docente');
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    expect(menu.label()).toBe('Cuenta');
    expect(menu.items().map(item => item.label)).toEqual(['Cerrar sesión']);
  });

  it('«Cerrar sesión» del menú de cuenta cierra la sesión', () => {
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    menu.itemSelected.emit('salir');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('en el juego (chrome: hidden) no hay barra y el cuerpo entra en modo juego', async () => {
    await go('/portal/jugar');
    expect(host().querySelector('header.cromo')).toBeNull();
    expect(document.body.classList).toContain('game-mode');
    expect(host().querySelector('main.portal-main')!.classList).toContain('portal-main--juego');
    await go('/portal/simulador/42');
    expect(host().querySelector('header.cromo')).toBeNull();
    await go('/portal/dashboard');
    expect(host().querySelector('header.cromo')).not.toBeNull();
    expect(document.body.classList).not.toContain('game-mode');
  });

  it('las rutas con chrome: hidden son las mismas que reconoce isGameRoute', () => {
    for (const url of ['/portal/jugar', '/portal/simulador/42']) expect(isGameRoute(url)).toBe(true);
    for (const url of ['/portal/dashboard', '/portal/simulador']) expect(isGameRoute(url)).toBe(false);
  });
});

describe('isGameRoute', () => {
  it('matches a specific simulador play route', () => {
    expect(isGameRoute('/portal/simulador/42')).toBe(true);
  });

  it('matches the jugar menu world', () => {
    expect(isGameRoute('/portal/jugar')).toBe(true);
  });

  it('does not match the simulador list', () => {
    expect(isGameRoute('/portal/simulador')).toBe(false);
  });

  it('does not match other portal routes', () => {
    expect(isGameRoute('/portal/dashboard')).toBe(false);
  });
});
