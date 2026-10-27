import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { CasoStore } from './estado/caso.store';
import universidadJson from '../../public/assets/biblioteca/universidad/escenario.json';
import type { CasoBorrador } from './modelo/caso';
import { copiarEscenarioAlCaso } from './modelo/copiar';
import type { Escenario } from './modelo/escenario';

const universidad = universidadJson as unknown as Escenario;

const caso: CasoBorrador = {
  id: 'caso-1', titulo: 'Primera escucha en Bienestar', lugarId: 'universidad', salas: [], escenas: [],
  inicioId: null, modoFinales: 'automatico', finales: [], personajes: [],
  catalogo: { muebles: [], objetos: [], herramientas: [] },
};

function boton(raiz: HTMLElement, texto: string): HTMLButtonElement | undefined {
  return [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement | undefined;
}

describe('AppComponent (marco)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [provideRouter(routes)] }).compileComponents();
  });

  it('muestra el nombre del caso en la cabecera', async () => {
    TestBed.inject(CasoStore).fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('header').textContent).toContain('Primera escucha en Bienestar');
  });

  it('«Reiniciar el sandbox» pide confirmación en la página antes de borrar', async () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;

    boton(raiz, 'Reiniciar el sandbox')!.click();
    await fixture.whenStable();
    expect(store.caso()).not.toBeNull();
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();

    boton(raiz, 'Sí, borrar todo')!.click();
    await fixture.whenStable();
    expect(store.caso()).toBeNull();
    expect(raiz.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('cancelar el reinicio no borra nada', async () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;
    boton(raiz, 'Reiniciar el sandbox')!.click();
    await fixture.whenStable();
    boton(raiz, 'Cancelar')!.click();
    await fixture.whenStable();
    expect(store.caso()).not.toBeNull();
  });

  async function montarApp() {
    const store = TestBed.inject(CasoStore);
    store.fijar(copiarEscenarioAlCaso(universidad, ['pasillo', 'consultorio'], 'Caso'));
    const fixture = TestBed.createComponent(AppComponent);
    document.body.appendChild(fixture.nativeElement);
    const listo = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
    };
    await listo();
    return { store, fixture, raiz: fixture.nativeElement as HTMLElement, listo };
  }

  afterEach(() => document.querySelectorAll('body > app-root, body > [ng-version], body > textarea, body > div.prueba').forEach((n) => n.remove()));

  it('«Saltar al contenido» no recarga la página: lleva el foco al contenido', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { raiz, listo } = await montarApp();
    const enlace = raiz.querySelector<HTMLAnchorElement>('a.saltar')!;
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.dispatchEvent(clic);
    await listo();
    expect(clic.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('contenido');
  });

  it('abrir el asistente lleva el foco al panel', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { raiz, listo } = await montarApp();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    expect(document.activeElement?.id).toBe('iat');
  });

  it('cerrar y volver a abrir el asistente conserva lo que estaba escrito', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { raiz, listo } = await montarApp();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#panel-ia textarea')!;
    campo.value = 'Agrega una respuesta inadecuada';
    campo.dispatchEvent(new Event('input'));
    await listo();
    raiz.querySelector<HTMLButtonElement>('[aria-label="Cerrar el asistente"]')!.click();
    await listo();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    expect(raiz.querySelector<HTMLTextAreaElement>('#panel-ia textarea')!.value).toBe('Agrega una respuesta inadecuada');
  });

  it('Ctrl+Z fuera de un campo de texto deshace el último cambio del caso', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, listo } = await montarApp();
    const antes = store.caso()!.escenas.length;
    store.agregarEscena('pasillo');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes + 1);
  });

  it('Ctrl+Z dentro de un campo de texto deshace el texto, no el caso', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, listo } = await montarApp();
    const antes = store.caso()!.escenas.length;
    store.agregarEscena('pasillo');
    const campo = document.createElement('textarea');
    document.body.appendChild(campo);
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes + 1);
  });

  it('si una pantalla ya atendió el Ctrl+Z, no se deshace dos veces', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, listo } = await montarApp();
    const antes = store.caso()!.escenas.length;
    store.agregarEscena('pasillo');
    store.agregarEscena('pasillo');
    const zona = document.createElement('div');
    zona.className = 'prueba';
    zona.addEventListener('keydown', (e) => { e.preventDefault(); store.deshacer(); });
    document.body.appendChild(zona);
    zona.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes + 1);
  });

  it('al cerrar o recargar la pestaña se guarda lo que se estaba escribiendo', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, listo } = await montarApp();
    const e = store.caso()!.escenas[0];
    store.agregarLinea(e.id);
    await listo();
    const campo = document.createElement('textarea');
    // El navegador suelta el cambio del campo al perder el foco; jsdom no, así que se simula con blur.
    campo.addEventListener('blur', () => store.editarLinea(e.id, store.caso()!.escenas[0].lineas[0].id, { texto: campo.value }));
    document.body.appendChild(campo);
    campo.focus();
    campo.value = 'Texto a medias';
    window.dispatchEvent(new Event('pagehide'));
    const guardado = JSON.parse(localStorage.getItem('sandbox-editor-casos/v1')!);
    expect(guardado.escenas[0].lineas[0].texto).toBe('Texto a medias');
  });
});
