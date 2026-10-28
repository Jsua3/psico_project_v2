import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { SalaComponent } from './sala.component';


async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [SalaComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(SalaComponent);
  fixture.componentRef.setInput('salaId', 'consultorio');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement };
}

const tecla = (el: Element, key: string, extra: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));

describe('SalaComponent', () => {
  it('con un elemento elegido, las flechas lo mueven 8 px y con Mayúsculas 1 px', async () => {
    const { fixture, store, raiz } = await montar();
    const psicologa = raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!;
    const antes = store.caso()!.salas[0].personajes[0];
    psicologa.click();
    tecla(psicologa, 'ArrowLeft');
    tecla(psicologa, 'ArrowUp', { shiftKey: true });
    await fixture.whenStable();
    const despues = store.caso()!.salas[0].personajes[0];
    expect(despues.x).toBe(antes.x - 8);
    expect(despues.y).toBe(antes.y - 1);
  });

  it('Supr quita el elemento elegido y Ctrl+Z lo devuelve', async () => {
    const { fixture, store, raiz } = await montar();
    const vaso = raiz.querySelector<HTMLButtonElement>('[data-elemento="objeto-0"]')!;
    vaso.click();
    tecla(vaso, 'Delete');
    await fixture.whenStable();
    expect(store.caso()!.salas[0].objetos.map((o) => o.ref)).not.toContain('vaso-agua');
    tecla(raiz.querySelector('.escenario')!, 'z', { ctrlKey: true });
    await fixture.whenStable();
    expect(store.caso()!.salas[0].objetos.map((o) => o.ref)).toContain('vaso-agua');
  });

  it('la lista «En esta sala» permite elegir sin arrastrar y cambiar la expresión', async () => {
    const { fixture, store, raiz } = await montar();
    const opcion = [...raiz.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Psicóloga de Bienestar'))!;
    opcion.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = raiz.querySelector<HTMLSelectElement>('select#expresion')!;
    select.value = 'preocupada';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(store.caso()!.salas[0].personajes[0].expresion).toBe('preocupada');
  });

  // Atención (hover y foco) en la lista «En esta sala»: señala la pieza en la sala; lo elegido pesa más que la atención. Tablero 50.
  const opcionDe = (raiz: HTMLElement, nombre: string) =>
    [...raiz.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(nombre))!;
  const piezaAtendida = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('.pieza.atendida');

  it('la atención en una cosa de la lista señala dónde está en la sala, y Esc la pliega', async () => {
    const { fixture, raiz } = await montar();
    expect(piezaAtendida(raiz)).toBeNull();
    opcionDe(raiz, 'Psicóloga de Bienestar').dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)!.getAttribute('aria-label')).toContain('Psicóloga de Bienestar');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
  });

  it('con el teclado: el foco en la lista señala la pieza y salir de la lista la suelta; Esc no quita lo elegido', async () => {
    const { fixture, raiz } = await montar();
    const opcion = opcionDe(raiz, 'Psicóloga de Bienestar');
    opcion.click();
    await fixture.whenStable();
    fixture.detectChanges();
    opcion.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
    expect(opcionDe(raiz, 'Psicóloga de Bienestar').getAttribute('aria-selected')).toBe('true'); // lo elegido sigue elegido
    opcion.dispatchEvent(new FocusEvent('focus'));
    opcion.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
  });

  it('los personajes se dibujan con la hoja y el retrato del kit del programa', async () => {
    const { raiz } = await montar();
    const estilo = raiz.querySelector<HTMLElement>('.escenario .personaje')!.getAttribute('style') ?? '';
    expect(estilo).toContain('/assets/characters/kit/');
    expect(estilo).not.toContain('assets/kit/');
    const retratos = [...raiz.querySelectorAll<HTMLImageElement>('.catalogo-lista img')].map((i) => i.getAttribute('src'));
    expect(retratos.every((s) => !s || !s.includes('assets/kit/'))).toBe(true);
  });

  it('agregar desde el catálogo pone la pieza en la sala', async () => {
    const { fixture, store, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Agregar a la sala: Sofá de dos puestos"]')!.click();
    await fixture.whenStable();
    expect(store.caso()!.salas[0].muebles.at(-1)!.ref).toBe('sofa');
  });

  it('un caso sin lugar no tiene catálogo, lo dice, y sus salas se siguen editando', async () => {
    const { fixture, store, raiz } = await montar();
    const sinLugar = structuredClone(store.caso()!);
    sinLugar.lugarId = null;
    sinLugar.catalogo = { muebles: [], objetos: [], herramientas: [] };
    sinLugar.salas[0].origen = null;
    store.fijar(sinLugar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[data-sin-catalogo]')!.textContent).toContain('no viene de un lugar de la biblioteca');
    expect(raiz.querySelector('[data-sin-catalogo]')!.textContent).not.toMatch(/catálogo vacío|undefined/i);

    // Agregar una pieza que no existe no deja una pieza fantasma en la sala
    const antes = store.caso()!.salas[0].muebles.length;
    store.agregarElemento('consultorio', 'mueble', 'sofa');
    expect(store.caso()!.salas[0].muebles).toHaveLength(antes);

    // Mover lo que ya está sí funciona
    const psicologa = raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!;
    const x = store.caso()!.salas[0].personajes[0].x;
    psicologa.click();
    psicologa.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(store.caso()!.salas[0].personajes[0].x).toBe(x + 8);
  });
});
