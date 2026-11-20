import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { NotFoundComponent } from './not-found.component';

/**
 * 404 (plan visual F3-6): un h1, el estado «no encontrado» del lenguaje (ui-error-state) y «Volver al panel». Dentro
 * del portal el <main> lo pone el shell; fuera, la página trae su barra pública y su propio <main id="main-content">.
 */
// req: BLOQUE-H (estructura de página), RNF-004
describe('NotFoundComponent', () => {
  async function render(url: string, fueraDelPortal: boolean): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(fueraDelPortal
          ? [{ path: '**', component: NotFoundComponent, data: { fueraDelPortal: true } }]
          : [{ path: 'portal', children: [{ path: '**', component: NotFoundComponent }] }]),
        { provide: UiDialog, useValue: { sheet: vi.fn() } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  it('dentro del portal: un h1, el estado «no encontrado» y «Volver al panel», sin <main> propio', async () => {
    const host = await render('/portal/no-existe', false);
    expect([...host.querySelectorAll('h1')].map(h1 => h1.textContent!.trim())).toEqual(['Página no encontrada']);
    expect(host.querySelector('ui-error-state')!.getAttribute('role')).toBe('status');
    const back = [...host.querySelectorAll<HTMLAnchorElement>('a')].find(link => link.textContent!.trim() === 'Volver al panel')!;
    expect(back.getAttribute('href')).toBe('/portal/dashboard');
    expect(host.querySelector('main')).toBeNull();
    expect(host.querySelector('header')).toBeNull();
  });

  // Rediseño Metafrónesis 2026-11-20: fuera del portal es una pantalla pública (tema claro u oscuro en su contenedor),
  // breve y sin culpa, con salida a la portada y al acceso y un contacto real; no repite la dirección pedida.
  it('fuera del portal: la barra pública, su propio <main id="main-content">, un h1 sin culpa y salida al inicio y al acceso', async () => {
    const host = await render('/no-existe-ni-aqui', true);
    expect(host.querySelector('header.cromo')).not.toBeNull();
    expect(host.querySelector('.perdida.publico')!.getAttribute('data-skin')).toMatch(/^(game|portal)$/);
    const main = host.querySelector('main#main-content')!;
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect([...main.querySelectorAll('h1')].map(h1 => h1.textContent!.trim())).toEqual(['No encontramos esta página']);
    const links = [...main.querySelectorAll<HTMLAnchorElement>('a')].map(a => [a.textContent!.trim(), a.getAttribute('href')]);
    expect(links).toEqual([
      ['Volver al inicio', '/'],
      ['Iniciar sesión', '/login'],
      ['secretariapsicologia@cue.edu.co', 'mailto:secretariapsicologia@cue.edu.co'],
    ]);
    expect(main.textContent).not.toContain('no-existe-ni-aqui');
    expect(main.textContent).not.toMatch(/\b(error tuyo|culpa|inválid|incorrect)/i);
  });
});
