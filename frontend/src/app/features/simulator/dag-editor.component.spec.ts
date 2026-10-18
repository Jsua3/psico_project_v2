import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { DecisionEdgeState, NodeEditorState } from '../../core/models/simulation.model';
import { DagEditorComponent } from './dag-editor.component';

/**
 * El grafo del caso (plan F8-3; RNF-04 «teclado en herramientas de autoría», WCAG 2.5.3 y 4.1.2): la leyenda dice lo
 * que se dibuja, las aristas responden, el detalle sigue al nodo vigente, el grafo se recorre con flechas y se abre
 * con Enter, y el nombre de cada nodo contiene el texto que se ve (los 2 `serious` de Axe que quedaban).
 */
const node = (id: number, over: Partial<NodeEditorState> = {}): NodeEditorState => ({
  id, key: `n-${id}`, title: `Nodo número ${id}`, narrative: `Narrativa del nodo ${id}.`, supportResources: [], requiredTools: [],
  sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
  positionX: null, positionY: null, decisionPrompt: '', displayOrder: 0, ...over,
});

const edge = (id: number, source: number, target: number, over: Partial<DecisionEdgeState> = {}): DecisionEdgeState => ({
  id, sourceNodeId: source, sourceKey: `n-${source}`, targetNodeId: target, targetKey: `n-${target}`, optionKey: `o-${id}`,
  text: `Decisión número ${id}`, classification: 'ADEQUATE', prohibitedConduct: false, prohibitionReason: null,
  scoreDelta: 10, stressDelta: 0, prohibitedPenalty: 0, immediateFeedback: '', ...over,
} as DecisionEdgeState);

// Inicio (1) → 2 (adecuada) y 3 (riesgosa); 2 → 4 terminal (prohibida); 3 queda sin salida.
const NODES = [node(1, { startNode: true, title: 'Inicio del caso' }), node(2), node(3), node(4, { terminal: true })];
const EDGES = [
  edge(1, 1, 2),
  edge(2, 1, 3, { classification: 'RISKY' }),
  edge(3, 2, 4, { prohibitedConduct: true, classification: 'INADEQUATE' }),
];

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('editor DAG (F8-3)', () => {
  let fixture: ComponentFixture<DagEditorComponent>;
  const root = () => fixture.nativeElement as HTMLElement;
  const component = () => fixture.componentInstance;
  const nodeEl = (id: number) => root().querySelector<SVGGElement>(`g.dag-node[data-node-id="${id}"]`)!;
  const edgeEl = (id: number) => root().querySelector<SVGGElement>(`g.dag-edge[data-edge-id="${id}"]`)!;
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(candidate =>
    text(candidate.querySelector('.ui-button__label')) === label || candidate.getAttribute('aria-label') === label);
  const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function render(inputs: { nodes?: NodeEditorState[]; edges?: DecisionEdgeState[]; lockReason?: string | null } = {}) {
    TestBed.configureTestingModule({ imports: [DagEditorComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(DagEditorComponent);
    fixture.componentRef.setInput('nodes', inputs.nodes ?? NODES);
    fixture.componentRef.setInput('edges', inputs.edges ?? EDGES);
    if (inputs.lockReason !== undefined) fixture.componentRef.setInput('lockReason', inputs.lockReason);
    await settle();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: RNF-04, RF-08
  describe('leyenda y dibujo', () => {
    it('la leyenda dice exactamente lo que se dibuja (inicio, terminal, sin salida y las cuatro clases de decisión)', async () => {
      await render();
      expect([...root().querySelectorAll('.dag-legend li')].map(text)).toEqual([
        'Inicio', 'Terminal', 'Sin salida', 'Decisión adecuada', 'Decisión riesgosa', 'Decisión inadecuada', 'Decisión prohibida',
      ]);
    });

    it('cada clase de decisión tiene su propio trazo y su propia punta (la inadecuada ya no usa la de la adecuada)', async () => {
      await render({ edges: [...EDGES, edge(4, 2, 3, { classification: 'INADEQUATE' })] });
      expect(edgeEl(1).classList.contains('dag-edge--adequate')).toBe(true);
      expect(edgeEl(2).classList.contains('dag-edge--risky')).toBe(true);
      expect(edgeEl(3).classList.contains('dag-edge--prohibited')).toBe(true);
      expect(edgeEl(4).classList.contains('dag-edge--inadequate')).toBe(true);
      expect(edgeEl(4).querySelector('path')!.getAttribute('marker-end')).toBe('url(#dag-arrow-inadequate)');
      expect(root().querySelector('#dag-arrow-inadequate')).not.toBeNull();
    });

    it('un nodo sin decisiones salientes que no es terminal se marca «Sin salida» en su propio texto', async () => {
      await render();
      expect(text(nodeEl(3))).toContain('Sin salida');
      expect(text(nodeEl(4))).not.toContain('Sin salida');
    });

    it('un grafo vacío no dibuja lienzo: dice qué hacer', async () => {
      await render({ nodes: [], edges: [] });
      expect(root().querySelector('svg.dag-svg')).toBeNull();
      expect(text(root())).toContain('Aún no hay nodos');
    });

    it('avisa de la topología: sin inicio, varios inicios o sin terminal', async () => {
      await render({ nodes: [node(1), node(2)], edges: [] });
      const warnings = [...root().querySelectorAll('.dag-warnings li')].map(text);
      expect(warnings).toEqual(expect.arrayContaining(['Sin nodo inicial', 'Sin nodo terminal']));
    });
  });

  // req: WCAG 2.5.3, WCAG 4.1.2
  describe('nombre accesible', () => {
    it('el nombre de cada nodo contiene el texto que se ve (label-content-name-mismatch)', async () => {
      await render();
      for (const id of [1, 2, 3, 4]) {
        // Axe lee el texto del nodo tal como está en el DOM: sin añadir espacios entre los <text>.
        const visible = text(nodeEl(id));
        const name = nodeEl(id).getAttribute('aria-label')!.replace(/\s+/g, ' ');
        expect(name, `nodo ${id}`).toContain(visible);
      }
    });

    it('el grafo es un grupo con nombre y cada nodo un botón; las aristas son solo para el puntero (los nodos dan lo mismo)', async () => {
      await render();
      const svg = root().querySelector('svg.dag-svg')!;
      expect(svg.getAttribute('role')).toBe('group');
      expect(svg.getAttribute('aria-label')).toBe('Grafo DAG del caso');
      expect(nodeEl(1).getAttribute('role')).toBe('button');
      expect(edgeEl(1).getAttribute('aria-hidden')).toBe('true');
    });
  });

  // req: RNF-04
  describe('teclado', () => {
    it('hay una sola parada de tabulación en el grafo: el nodo inicial', async () => {
      await render();
      const stops = [...root().querySelectorAll('g.dag-node')].filter(el => el.getAttribute('tabindex') === '0');
      expect(stops).toHaveLength(1);
      expect(stops[0]).toBe(nodeEl(1));
    });

    it('las flechas recorren el grafo y mueven el foco: Derecha sigue la decisión, Izquierda vuelve, Abajo baja', async () => {
      await render();
      nodeEl(1).focus();

      key(nodeEl(1), 'ArrowRight');
      await settle();
      expect(document.activeElement).toBe(nodeEl(2));
      expect(nodeEl(2).getAttribute('tabindex')).toBe('0');
      expect(nodeEl(1).getAttribute('tabindex')).toBe('-1');

      key(nodeEl(2), 'ArrowRight');
      await settle();
      expect(document.activeElement).toBe(nodeEl(4));

      key(nodeEl(4), 'ArrowLeft');
      await settle();
      expect(document.activeElement).toBe(nodeEl(2));

      key(nodeEl(2), 'ArrowDown');
      await settle();
      expect(document.activeElement).toBe(nodeEl(3));
    });

    it('Inicio y Fin van al primer y al último nodo', async () => {
      await render();
      nodeEl(1).focus();

      key(nodeEl(1), 'End');
      await settle();
      expect(document.activeElement).toBe(nodeEl(4));

      key(nodeEl(4), 'Home');
      await settle();
      expect(document.activeElement).toBe(nodeEl(1));
    });

    it('Enter y Espacio abren el detalle del nodo; Esc lo cierra y el foco vuelve al nodo', async () => {
      await render();
      nodeEl(2).focus();

      key(nodeEl(2), 'Enter');
      await settle();
      expect(text(root().querySelector('.dag-detail h3'))).toBe('Nodo número 2');

      key(nodeEl(2), 'Escape');
      await settle();
      expect(root().querySelector('.dag-detail')).toBeNull();
      expect(document.activeElement).toBe(nodeEl(2));

      key(nodeEl(3), ' ');
      await settle();
      expect(text(root().querySelector('.dag-detail h3'))).toBe('Nodo número 3');
    });
  });

  // req: RF-08
  describe('detalle y aristas', () => {
    it('el detalle sigue al nodo vigente: si el nodo se edita, el panel muestra lo nuevo (antes quedaba con una copia vieja)', async () => {
      await render();
      nodeEl(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(text(root().querySelector('.dag-detail h3'))).toBe('Nodo número 2');

      fixture.componentRef.setInput('nodes', NODES.map(item => (item.id === 2 ? { ...item, title: 'Título editado' } : item)));
      await settle();

      expect(text(root().querySelector('.dag-detail h3'))).toBe('Título editado');
    });

    it('si el nodo abierto se elimina, el detalle se cierra solo', async () => {
      await render();
      nodeEl(3).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(root().querySelector('.dag-detail')).not.toBeNull();

      fixture.componentRef.setInput('nodes', NODES.filter(item => item.id !== 3));
      await settle();

      expect(root().querySelector('.dag-detail')).toBeNull();
    });

    it('el detalle lista las decisiones salientes con el título del destino y las edita', async () => {
      await render();
      const edited: DecisionEdgeState[] = [];
      component().edgeEdit.subscribe(value => edited.push(value));
      nodeEl(1).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();

      const rows = [...root().querySelectorAll('.dag-detail-edges li')];
      expect(rows).toHaveLength(2);
      expect(text(rows[0])).toContain('Decisión número 1');
      expect(text(rows[0])).toContain('Nodo número 2');
      (rows[0].querySelector('button') as HTMLButtonElement).click();
      expect(edited.map(item => item.id)).toEqual([1]);
    });

    it('hacer clic en una arista abre su decisión (antes se emitía y nadie lo atendía)', async () => {
      await render();
      const edited: DecisionEdgeState[] = [];
      component().edgeEdit.subscribe(value => edited.push(value));

      edgeEl(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(edited.map(item => item.id)).toEqual([2]);
    });

    it('«Editar nodo», «Nueva decisión» y «Eliminar nodo» emiten el nodo abierto', async () => {
      await render();
      const log: string[] = [];
      component().nodeEdit.subscribe(value => log.push(`editar ${value.id}`));
      component().addEdge.subscribe(value => log.push(`decisión ${value.id}`));
      component().nodeDelete.subscribe(value => log.push(`eliminar ${value.id}`));
      nodeEl(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();

      button('Editar nodo')!.click();
      button('Nueva decisión')!.click();
      button('Eliminar nodo')!.click();

      expect(log).toEqual(['editar 2', 'decisión 2', 'eliminar 2']);
    });

    it('con el caso de solo lectura las acciones dicen por qué no se pueden usar y no emiten', async () => {
      await render({ lockReason: 'Esta versión no es un borrador.' });
      const log: string[] = [];
      component().nodeEdit.subscribe(value => log.push(`editar ${value.id}`));
      nodeEl(2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();

      for (const label of ['Editar nodo', 'Nueva decisión', 'Eliminar nodo']) {
        expect(button(label)!.getAttribute('aria-disabled'), label).toBe('true');
        expect(text(button(label)!.querySelector('span[hidden]'))).toBe('Esta versión no es un borrador.');
      }
      button('Editar nodo')!.click();
      expect(log).toEqual([]);
    });
  });

  // req: RNF-04
  describe('zoom y ajuste', () => {
    const svgWidth = () => Number(root().querySelector('svg.dag-svg')!.getAttribute('width'));

    it('«Acercar» y «Alejar» escalan el lienzo y el porcentaje se lee; en los extremos el botón dice por qué no', async () => {
      await render();
      const base = svgWidth();
      expect(text(root().querySelector('.dag-zoom'))).toBe('100 %');

      button('Acercar')!.click();
      await settle();
      expect(svgWidth()).toBeCloseTo(base * 1.25, 5);
      expect(text(root().querySelector('.dag-zoom'))).toBe('125 %');

      for (let step = 0; step < 6; step++) {
        button('Acercar')!.click();
        await settle();
      }
      expect(text(root().querySelector('.dag-zoom'))).toBe('200 %');
      expect(button('Acercar')!.getAttribute('aria-disabled')).toBe('true');

      for (let step = 0; step < 8; step++) {
        button('Alejar')!.click();
        await settle();
      }
      expect(text(root().querySelector('.dag-zoom'))).toBe('50 %');
      expect(button('Alejar')!.getAttribute('aria-disabled')).toBe('true');
    });

    it('«Ajustar a la vista» vuelve al 100 % cuando el ancho del contenedor no se puede medir', async () => {
      await render();
      button('Acercar')!.click();
      await settle();

      button('Ajustar a la vista')!.click();
      await settle();

      expect(text(root().querySelector('.dag-zoom'))).toBe('100 %');
    });
  });

  // req: RNF-04
  describe('sistema de diseño (contrato de código)', () => {
    const source = (file: string) => readFileSync(join(__dirname, file), 'utf-8');

    it.each(['dag-editor.component.ts', 'dag-editor.component.html', 'dag-editor.component.scss'])(
      '%s no usa Material, clases psy-*, colores literales ni estilos en línea',
      file => {
        const code = source(file);
        expect(code).not.toMatch(/mat-|Mat[A-Z]\w+Module|@angular\/material/);
        expect(code).not.toMatch(/\bpsy-|liquid-glass/);
        expect(code).not.toMatch(/\sstyle="/);
        expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
      },
    );
  });
});
