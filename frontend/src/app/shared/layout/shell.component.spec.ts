import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { UiDialog } from '../ui/dialog/ui-dialog';
import { UiMenu } from '../ui/menu/ui-menu';
import { BottomTab } from './bottom-tabs.component';
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
  const sheet = vi.fn();
  const tabs = () => [...host().querySelectorAll<HTMLElement>('header.cromo > nav.modulo-inferior .pestana')];
  const tabLabels = () => tabs().map(tab => tab.querySelector('.pestana__rotulo')!.textContent!.trim());

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    currentUser.set(user('ESTUDIANTE'));
    logout.mockReset();
    sheet.mockReset();
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
        { provide: UiDialog, useValue: { sheet } },
      ],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ShellComponent);
    await go('/portal/dashboard');
  });

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

  it('debajo de 64rem la navegación principal es la barra inferior (hija directa del header): los destinos que no se pliegan son pestañas', async () => {
    expect(tabLabels()).toEqual(['Panel', 'Simulador', 'Mi personaje']);
    currentUser.set(user('ADMIN'));
    await fixture.whenStable();
    expect(tabLabels()).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Editar casos', 'Más']);
  });

  it('los destinos que se pliegan en escritorio van a la hoja «Más» (docente: Rúbricas, Grupos y Reportes)', async () => {
    currentUser.set(user('PROFESOR'));
    await fixture.whenStable();
    expect(tabLabels()).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Más']);
    tabs().at(-1)!.click();
    expect(sheet.mock.calls[0][1].data.map((tab: BottomTab) => tab.label)).toEqual(['Rúbricas', 'Grupos', 'Reportes']);
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

  it('el <main> es el destino de «Saltar al contenido principal» (#main-content, enfocable por script) y la barra trae «Saltar a la navegación»', () => {
    const main = host().querySelector('main.portal-main')!;
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(host().querySelector('header.cromo')!.firstElementChild!.textContent!.trim()).toBe('Saltar a la navegación');
  });

  it('en el juego el <main> suelta #main-content: el destino es el contenedor del juego (un solo id)', async () => {
    await go('/portal/jugar');
    const main = host().querySelector('main.portal-main')!;
    expect(main.hasAttribute('id')).toBe(false);
    expect(main.hasAttribute('tabindex')).toBe(false);
  });

  // req: REGLA-010 (el CSS del juego no vive en `<body>`: el shell no le pone clases por ruta; F6-1)
  it('en el juego (chrome: hidden) no hay barra, el <main> ocupa la ventana y el <body> no recibe clases', async () => {
    const bodyClasses = () => Array.from(document.body.classList).sort();
    const before = bodyClasses();
    await go('/portal/jugar');
    expect(host().querySelector('header.cromo')).toBeNull();
    expect(host().querySelector('main.portal-main')!.classList).toContain('portal-main--juego');
    expect(bodyClasses()).toEqual(before);
    await go('/portal/simulador/42');
    expect(host().querySelector('header.cromo')).toBeNull();
    expect(bodyClasses()).toEqual(before);
    await go('/portal/dashboard');
    expect(host().querySelector('header.cromo')).not.toBeNull();
    expect(bodyClasses()).toEqual(before);
  });

  it('las rutas con chrome: hidden (leídas de app.routes) son exactamente las que reconoce isGameRoute', () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const screens = children.filter(child => child.path && !child.redirectTo && child.path !== '**');
    expect(screens.length).toBeGreaterThan(5);
    for (const child of screens) {
      const url = `/portal/${child.path!.replace(/:[^/]+/g, '42')}`;
      expect(isGameRoute(url), url).toBe(child.data?.['chrome'] === 'hidden');
    }
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
