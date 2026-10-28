import { TestBed } from '@angular/core/testing';

import { universidad } from '../../testing/universidad';
import type { CasoBorrador } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { MapaEscenasComponent } from './mapa-escenas.component';


async function montar() {
  const caso: CasoBorrador = copiarEscenarioAlCaso(universidad, ['pasillo', 'consultorio'], 'Caso');
  caso.escenas[0].respuestas = [
    { id: 'r1', texto: 'Acompañarla', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: '', destinoId: caso.escenas[1].id, marcaIa: false },
  ];
  await TestBed.configureTestingModule({ imports: [MapaEscenasComponent] }).compileComponents();
  const fixture = TestBed.createComponent(MapaEscenasComponent);
  fixture.componentRef.setInput('caso', caso);
  fixture.componentRef.setInput('avisos', []);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, caso, raiz: fixture.nativeElement as HTMLElement };
}

const nodo = (raiz: HTMLElement, i: number) => raiz.querySelectorAll<HTMLButtonElement>('button.escena')[i];
const menuitems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((m) => m.textContent!.replace(/\s+/g, ' ').trim());

describe('MapaEscenasComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  it('pasar el cursor por una escena muestra la miniatura de su sala', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 1).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const vista = raiz.querySelector('[role="tooltip"]');
    expect(vista).not.toBeNull();
    expect(vista!.querySelector('img')!.getAttribute('src')).toContain('arte/salas/consultorio.png');
    expect(vista!.textContent).toContain('Consultorio de atención psicológica');
  });

  // Atención (hover y foco) en una respuesta: la flecha que la une a su escena. Tablero 50 de estados.
  const flecha = (raiz: HTMLElement) => raiz.querySelector<SVGPathElement>('path.flecha')!;
  const detalleDeRespuesta = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('.tarjeta-flecha');

  it('la atención en una respuesta muestra su detalle (qué dice y a dónde lleva) y se pliega con Esc', async () => {
    const { fixture, caso, raiz } = await montar();
    expect(detalleDeRespuesta(raiz)).toBeNull();
    flecha(raiz).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const detalle = detalleDeRespuesta(raiz)!;
    expect(detalle).not.toBeNull();
    expect(detalle.textContent).toContain('Acompañarla');
    expect(detalle.textContent).toContain(`Lleva a la escena 2 · ${caso.escenas[1].titulo}`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).toBeNull();
  });

  it('con el teclado: el foco en la respuesta la muestra, Esc la pliega sin quitar el foco, y volver a enfocarla la muestra otra vez', async () => {
    const { fixture, raiz } = await montar();
    const camino = flecha(raiz);
    camino.focus();
    camino.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).not.toBeNull();
    camino.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).toBeNull();
    expect(document.activeElement).toBe(camino);
    camino.dispatchEvent(new FocusEvent('blur'));
    camino.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).not.toBeNull();
  });

  it('Esc también pliega la vista de la sala de una escena, aunque el cursor siga encima (dismissible, WCAG 1.4.13)', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 1).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="tooltip"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('el detalle de una respuesta no roba el foco ni se lee dos veces: es un aviso de estado, no un diálogo', async () => {
    const { fixture, raiz } = await montar();
    flecha(raiz).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const detalle = detalleDeRespuesta(raiz)!;
    expect(detalle.getAttribute('role')).toBe('status');
    expect(detalle.hasAttribute('tabindex')).toBe(false);
  });

  const abrirCon: Record<string, () => Event> = {
    'clic derecho': () => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    'Mayús+F10': () => new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
    'tecla ContextMenu': () => new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }),
  };

  for (const [forma, evento] of Object.entries(abrirCon)) {
    it(`${forma} abre el mismo menú de acciones`, async () => {
      const { fixture, raiz } = await montar();
      nodo(raiz, 0).dispatchEvent(evento());
      await fixture.whenStable();
      expect(menuitems()).toEqual([
        'Abrir guion Enter', 'Abrir sala', 'Mover', 'Duplicar', 'Conectar con…', 'Marcar como final', 'Borrar Supr',
      ]);
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    });
  }

  it('el menú tiene Abrir guion, Abrir sala, Mover, Duplicar, Conectar con…, Marcar como final y Borrar', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await fixture.whenStable();
    const textos = menuitems().map((t) => t.replace(/ (Enter|Supr)$/, ''));
    expect(textos).toEqual(['Abrir guion', 'Abrir sala', 'Mover', 'Duplicar', 'Conectar con…', 'Marcar como final', 'Borrar']);
  });

  it('Enter en una escena pide abrir su guion', async () => {
    const { fixture, caso, raiz } = await montar();
    let abierta: string | null = null;
    fixture.componentInstance.abrirGuion.subscribe((id: string) => (abierta = id));
    nodo(raiz, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(abierta).toBe(caso.escenas[1].id);
  });

  it('si la escena elegida desaparece (borrar, deshacer), otra escena sigue alcanzable con Tab', async () => {
    const { fixture, caso, raiz } = await montar();
    nodo(raiz, 1).click();
    await fixture.whenStable();
    fixture.componentRef.setInput('caso', { ...caso, escenas: caso.escenas.slice(0, 1) });
    await fixture.whenStable();
    fixture.detectChanges();
    const paradas = [...raiz.querySelectorAll('button.escena')].filter((b) => b.getAttribute('tabindex') === '0');
    expect(paradas).toHaveLength(1);
  });

  it('«Acciones» sin escena elegida no abre el menú y dice qué hacer', async () => {
    const { fixture, raiz } = await montar();
    const acciones = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Acciones')!;
    acciones.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(menuitems()).toEqual([]);
    expect(raiz.querySelector('[role="status"]')!.textContent).toContain('Primero elige una escena en el mapa.');
  });
});
