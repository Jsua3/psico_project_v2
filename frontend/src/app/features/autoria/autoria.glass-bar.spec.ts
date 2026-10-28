import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { rutasEditorCaso, rutasNuevoCaso } from './autoria.routes';
import { GuiaService } from './guia/guia.service';
import { casoCopiadoDeLugar } from './testing/caso-api';
import { ServidorFalso } from './testing/servidor-falso';
import { cuentaDePrueba } from './testing/cuenta';
import { universidad } from './testing/universidad';

async function irA(url: string) {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad);
  await TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'portal/casos/nuevo', children: rutasNuevoCaso },
        { path: 'portal/casos/:caseVersionId/editor', children: rutasEditorCaso },
        { path: 'portal/casos', children: [] },
      ]),
      { provide: AuthoringApi, useValue: { ...servidor.api, assistantStatus: () => of({ enabled: true, mode: 'connected', remainingToday: 5 }) } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const listo = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await listo();
  return { raiz: harness.routeNativeElement as HTMLElement, listo };
}

function desplazarA(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('header button')].find((b) => b.textContent?.includes(texto))!;

// req: RNF-002, BLOQUE-H (estados de la barra en el editor: DG-5 una sola barra, DG-9 la ayuda no se pliega y congela la barra)
describe('Editor de casos: la barra de vidrio (tableros 45–51)', () => {
  afterEach(() => {
    desplazarA(0);
    document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove());
  });

  it('la cabecera usa GlassBarMachine con los módulos decididos: marca · contexto del editor · ayuda y cuenta', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    expect(raiz.querySelectorAll('header')).toHaveLength(1); // una sola barra en pantalla
    expect(barra.classList).toContain('cromo');
    expect(barra.getAttribute('data-vidrio')).toBe('pseudo');
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    const modulos = [...barra.querySelectorAll(':scope > nav.bandeja > .modulo')].map((m) => m.classList[1]);
    expect(modulos).toEqual(['modulo-logo', 'modulo-principal', 'modulo-cuenta']);

    // La máquina de la barra decide el estado: al desplazarse, pasa a «scroll».
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  it('el módulo central trae «‹ Mis casos» y «Editor de casos»; la cuenta, la ayuda y el menú de la cuenta', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const central = raiz.querySelector('header .modulo-principal')!;
    expect(central.querySelector('a')!.getAttribute('href')).toBe('/portal/casos');
    expect(central.textContent).toContain('Mis casos');
    expect(central.textContent).toContain('Editor de casos');
    const cuenta = raiz.querySelector('header .modulo-cuenta')!;
    const ayuda = cuenta.querySelector('[role="group"][aria-label="Ayuda"]')!;
    expect([...ayuda.querySelectorAll('button')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim().split(' Ctrl')[0])).toEqual(['Buscar', 'Guía', 'Asistente de IA']);
    expect(cuenta.querySelector('ui-menu')).not.toBeNull();
    expect(cuenta.textContent).toContain('Marta Ríos');
    expect(cuenta.textContent).toContain('Docente');
  });

  it('la ayuda nunca se pliega: ningún botón es plegable y el atajo del buscador queda anunciado', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const ayuda = raiz.querySelector('header [aria-label="Ayuda"]')!;
    expect(ayuda.querySelectorAll('.control-plegable')).toHaveLength(0);
    expect(raiz.querySelectorAll('header .control-plegable')).toHaveLength(0);
    expect(boton(raiz, 'Buscar').getAttribute('aria-keyshortcuts')).toBe('Control+K');
  });

  it('con el buscador abierto la barra no cambia de estado; al cerrarlo cae al que le toca', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    boton(raiz, 'Buscar').click();
    await listo();
    expect(raiz.querySelector('app-buscador')).not.toBeNull();
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    [...raiz.querySelectorAll<HTMLButtonElement>('app-buscador button')].find((b) => b.textContent?.trim() === 'Cerrar')!.click();
    await listo();
    expect(raiz.querySelector('app-buscador')).toBeNull();
    // Sin ayuda abierta, la barra recoge el desplazamiento que pasó mientras tanto.
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  it('con la guía abierta la barra tampoco cambia de estado', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    const guia = TestBed.inject(GuiaService);
    await guia.mostrar('buscar', 'resaltar');
    await listo();
    expect(guia.activa()).not.toBeNull();
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    guia.cerrar();
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  it('las secciones del caso y su nombre van en una banda sólida bajo la barra, no dentro del vidrio', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const banda = raiz.querySelector('.banda')!;
    expect(raiz.querySelector('header')!.contains(banda)).toBe(false);
    expect(banda.textContent).toContain('Primera escucha');
    const secciones = [...banda.querySelectorAll('nav[aria-label="Secciones del caso"] a')].map((a) => a.getAttribute('href'));
    expect(secciones).toEqual([
      '/portal/casos', '/portal/casos/41/editor', '/portal/casos/41/editor/datos', '/portal/casos/41/editor/finales',
      '/portal/casos/41/editor/probar', '/portal/casos/41/editor/revision',
    ]);
    // La guía las encuentra por su acción.
    for (const accion of ['datos-del-caso', 'definir-finales', 'probar', 'enviar-revision']) expect(banda.querySelector(`[data-accion~="${accion}"]`)).not.toBeNull();
    // La pantalla en la que estás se marca para el lector de pantalla.
    expect(banda.querySelector('a[aria-current="page"]')!.textContent).toContain('El caso');
  });

  it('crear un caso (sin caso abierto) trae la misma barra y ninguna sección', async () => {
    const { raiz } = await irA('/portal/casos/nuevo');
    expect(raiz.querySelectorAll('header')).toHaveLength(1);
    expect(raiz.querySelector('header .modulo-principal')!.textContent).toContain('Editor de casos');
    expect(raiz.querySelectorAll('.banda nav a')).toHaveLength(0);
  });

  it('el contenido es el destino de «Saltar al contenido principal» de la aplicación (#main-content)', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    expect(raiz.querySelector('main')!.id).toBe('main-content');
  });
});
