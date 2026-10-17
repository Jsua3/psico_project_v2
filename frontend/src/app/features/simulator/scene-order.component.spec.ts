import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { NodeEditorState } from '../../core/models/simulation.model';
import { SceneOrderComponent } from './scene-order.component';

const node = (id: number, over: Partial<NodeEditorState> = {}): NodeEditorState => ({
  id, key: `escena-${id}`, title: `Escena ${id}`, narrative: '', supportResources: [], requiredTools: [],
  sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
  positionX: null, positionY: null, decisionPrompt: '', displayOrder: id - 1, ...over,
});

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * «Escenas» del editor (plan visual F10-3†; E3-6, RF-08, RF-09): las escenas del caso en su orden, con «Subir» y «Bajar»
 * en cada una. No hay arrastre: cada movimiento tiene su botón, así que el teclado y el puntero de un solo toque hacen lo
 * mismo (WCAG 2.5.7). Al terminar el cambio, el foco vuelve al botón de la escena que se movió y se dice dónde quedó.
 */
// req: RF-08, RF-09, CU-04, RNF-04, WCAG-2.5.7
describe('SceneOrderComponent', () => {
  let fixture: ComponentFixture<SceneOrderComponent>;
  let announce: ReturnType<typeof vi.fn>;
  let reordered: number[][];
  let edited: NodeEditorState[];

  const root = () => fixture.nativeElement as HTMLElement;
  const items = () => [...root().querySelectorAll<HTMLElement>('.so-item')];
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label);
  const titles = () => items().map(item => text(item.querySelector('.so-title')));

  async function render(nodes: NodeEditorState[], options: { lockReason?: string | null; busy?: boolean } = {}) {
    announce = vi.fn();
    reordered = [];
    edited = [];
    TestBed.configureTestingModule({
      imports: [SceneOrderComponent],
      providers: [provideZonelessChangeDetection(), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    fixture = TestBed.createComponent(SceneOrderComponent);
    // El foco solo existe en un documento: el componente se monta en él.
    document.body.appendChild(root());
    fixture.componentRef.setInput('nodes', nodes);
    fixture.componentRef.setInput('lockReason', options.lockReason ?? null);
    fixture.componentRef.setInput('busy', options.busy ?? false);
    fixture.componentInstance.reorder.subscribe(order => reordered.push(order));
    fixture.componentInstance.edit.subscribe(item => edited.push(item));
    await fixture.whenStable();
  }

  async function update(inputs: Record<string, unknown>) {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  afterEach(() => {
    root()?.remove();
    TestBed.resetTestingModule();
  });

  it('lista las escenas en su orden guardado, numeradas, con su clave y con palabras si abre, cierra o es una escena', async () => {
    await render([
      node(3, { displayOrder: 2, terminal: true }),
      node(1, { displayOrder: 0, startNode: true }),
      node(2, { displayOrder: 1 }),
    ]);

    expect(root().querySelector('ol')!.getAttribute('aria-label')).toBe('Escenas del caso, en orden');
    expect(titles()).toEqual(['Escena 1', 'Escena 2', 'Escena 3']);
    expect(items().map(item => text(item.querySelector('.so-position')))).toEqual(['1', '2', '3']);
    expect(items().map(item => text(item.querySelector('code')))).toEqual(['escena-1', 'escena-2', 'escena-3']);
    expect(items().map(item => text(item.querySelector('ui-badge')))).toEqual(['Inicio', 'Escena', 'Conclusión']);
    expect(text(root())).toContain('No cambia el grafo ni por dónde empieza el caso');
  });

  it('cada movimiento tiene su botón con nombre propio y no hay arrastre: el teclado y el toque hacen lo mismo (2.5.7)', async () => {
    await render([node(1), node(2), node(3)]);

    for (const title of ['Escena 1', 'Escena 2', 'Escena 3']) {
      expect(button(`Subir «${title}»`)?.tagName, `Subir ${title}`).toBe('BUTTON');
      expect(button(`Bajar «${title}»`)?.tagName, `Bajar ${title}`).toBe('BUTTON');
    }
    expect(root().querySelector('[draggable="true"]')).toBeNull();
  });

  it('la primera escena no sube y la última no baja: lo dicen con su motivo y siguen en el orden de tabulación', async () => {
    await render([node(1), node(2), node(3)]);

    const first = button('Subir «Escena 1»')!;
    const last = button('Bajar «Escena 3»')!;
    expect(first.getAttribute('aria-disabled')).toBe('true');
    expect(text(first.querySelector('[hidden]'))).toBe('Ya es la primera escena.');
    expect(last.getAttribute('aria-disabled')).toBe('true');
    expect(text(last.querySelector('[hidden]'))).toBe('Ya es la última escena.');
    expect(first.hasAttribute('disabled')).toBe(false);
    expect(button('Subir «Escena 2»')!.getAttribute('aria-disabled')).toBeNull();
    expect(button('Bajar «Escena 2»')!.getAttribute('aria-disabled')).toBeNull();

    first.click();
    last.click();
    expect(reordered).toEqual([]);
  });

  it('«Subir» y «Bajar» piden el orden de TODAS las escenas, partiendo del orden que se ve', async () => {
    await render([node(3, { displayOrder: 2 }), node(1, { displayOrder: 0 }), node(2, { displayOrder: 1 })]);

    button('Subir «Escena 2»')!.click();
    button('Bajar «Escena 2»')!.click();

    expect(reordered).toEqual([[2, 1, 3], [1, 3, 2]]);
  });

  it('una versión que no es borrador bloquea todos los movimientos con su motivo', async () => {
    const reason = 'Esta versión no es un borrador y no se puede modificar: clónala para editarla.';
    await render([node(1), node(2)], { lockReason: reason });

    for (const label of ['Subir «Escena 2»', 'Bajar «Escena 1»', 'Editar «Escena 1»']) {
      const target = button(label)!;
      expect(target.getAttribute('aria-disabled'), label).toBe('true');
      expect(text(target.querySelector('[hidden]')), label).toBe(reason);
      target.click();
    }
    expect(reordered).toEqual([]);
    expect(edited).toEqual([]);
  });

  it('mientras hay un cambio en curso los movimientos esperan (uno a la vez), y «Editar» sigue disponible', async () => {
    await render([node(1), node(2)], { busy: true });

    expect(text(button('Subir «Escena 2»')!.querySelector('[hidden]'))).toBe('Hay un cambio en curso: espera a que termine.');
    button('Subir «Escena 2»')!.click();
    expect(reordered).toEqual([]);
    expect(button('Editar «Escena 2»')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('«Editar» entrega la escena para abrir su formulario', async () => {
    const second = node(2);
    await render([node(1), second]);

    button('Editar «Escena 2»')!.click();

    expect(edited).toEqual([second]);
  });

  it('cuando llega el orden nuevo, el foco vuelve al mismo botón de la escena que se movió y se dice dónde quedó', async () => {
    const before = [node(1), node(2), node(3)];
    await render(before);
    const up = button('Subir «Escena 3»')!;
    up.focus();
    up.click();
    expect(reordered).toEqual([[1, 3, 2]]);
    expect(announce).not.toHaveBeenCalled();

    // El servidor responde: la lista llega con el orden nuevo y Angular mueve los renglones (el foco se pierde al mover).
    await update({ nodes: [node(1, { displayOrder: 0 }), node(2, { displayOrder: 2 }), node(3, { displayOrder: 1 })] });
    await new Promise<void>(resolve => setTimeout(resolve));

    expect(titles()).toEqual(['Escena 1', 'Escena 3', 'Escena 2']);
    expect(document.activeElement).toBe(button('Subir «Escena 3»'));
    expect(announce).toHaveBeenCalledWith('«Escena 3» ahora es la escena 2 de 3.', 'polite');
  });

  it('si el servidor rechaza el cambio la lista no cambia: no se anuncia nada ni se quita el foco', async () => {
    await render([node(1), node(2)]);
    const down = button('Bajar «Escena 1»')!;
    down.focus();
    down.click();

    await update({ busy: true });
    await update({ busy: false });

    expect(announce).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(down);
  });

  it('un movimiento que falló no deja el foco armado: si ese orden llega después por otra vía, no roba el foco ni anuncia', async () => {
    await render([node(1), node(2)]);
    const down = button('Bajar «Escena 1»')!;
    down.focus();
    down.click();
    expect(reordered).toEqual([[2, 1]]);

    await update({ busy: true });
    await update({ busy: false });
    await new Promise<void>(resolve => setTimeout(resolve));
    // Otra persona ordena igual, mucho después: la lista cambia sin que nadie la pidiera aquí.
    await update({ nodes: [node(1, { displayOrder: 1 }), node(2, { displayOrder: 0 })] });
    await new Promise<void>(resolve => setTimeout(resolve));

    expect(announce).not.toHaveBeenCalled();
  });

  it('sin escenas dice que aún no hay y a dónde ir', async () => {
    await render([]);

    expect(root().querySelector('ol')).toBeNull();
    expect(text(root())).toContain('Aún no hay escenas');
    expect(text(root())).toContain('Crea el primer nodo en el grafo del caso');
  });
});
