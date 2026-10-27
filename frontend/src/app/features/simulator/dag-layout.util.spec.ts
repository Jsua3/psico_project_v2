import { DecisionEdgeState, NodeEditorState } from '../../core/models/simulation.model';
import { computeDagLayout, neighbourOf, wrapLabel } from './dag-layout.util';

/**
 * La disposición del grafo del caso (plan F8-3): columnas por distancia desde el inicio y recorrido con flechas.
 * Es la misma disposición que dibujaba el componente, ahora pura y con pruebas.
 */
const node = (id: number, over: Partial<NodeEditorState> = {}): NodeEditorState => ({
  id, key: `n-${id}`, title: `Nodo ${id}`, narrative: '', supportResources: [], requiredTools: [],
  sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
  positionX: null, positionY: null, intensity: 'MEDIUM', decisionPrompt: '', displayOrder: 0, ...over,
});

const edge = (id: number, source: number, target: number, over: Partial<DecisionEdgeState> = {}): DecisionEdgeState => ({
  id, sourceNodeId: source, sourceKey: `n-${source}`, targetNodeId: target, targetKey: `n-${target}`, optionKey: `o-${id}`,
  text: `Decisión ${id}`, classification: 'ADEQUATE', responseClass: 'RECOMMENDED', prohibitedConduct: false, prohibitionReason: null,
  immediateFeedback: '', effects: {}, consequenceText: '', theoryBasis: '', feedbackText: '', ...over,
} as DecisionEdgeState);

// Inicio (1) → 2 y 3 → 4 (terminal); 5 queda suelto.
const NODES = [node(1, { startNode: true }), node(2), node(3), node(4, { terminal: true }), node(5)];
const EDGES = [edge(1, 1, 2), edge(2, 1, 3), edge(3, 2, 4), edge(4, 3, 4)];

const position = (layout: ReturnType<typeof computeDagLayout>, id: number) => {
  const box = layout.nodes.find(candidate => candidate.node.id === id)!;
  return { col: box.col, row: box.row };
};

// req: RNF-04, RF-08
describe('computeDagLayout: columnas por distancia desde el inicio', () => {
  it('el inicio va en la columna 0, sus destinos en la 1 y el terminal en la 2', () => {
    const layout = computeDagLayout(NODES, EDGES);

    expect(position(layout, 1)).toEqual({ col: 0, row: 0 });
    expect(position(layout, 2).col).toBe(1);
    expect(position(layout, 3).col).toBe(1);
    expect(position(layout, 4).col).toBe(2);
  });

  it('los destinos de una misma columna se apilan en filas distintas', () => {
    const layout = computeDagLayout(NODES, EDGES);

    expect(new Set([position(layout, 2).row, position(layout, 3).row]).size).toBe(2);
  });

  it('un nodo sin entradas ni inicio arranca en la columna 0 (es otra raíz)', () => {
    const layout = computeDagLayout(NODES, EDGES);

    expect(position(layout, 5).col).toBe(0);
  });

  it('un grafo vacío no tiene nodos ni aristas y mantiene un tamaño mínimo', () => {
    const layout = computeDagLayout([], []);

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('cada arista parte del borde derecho del origen y llega al borde izquierdo del destino', () => {
    const layout = computeDagLayout(NODES, EDGES);
    const line = layout.edges.find(candidate => candidate.edge.id === 1)!;
    const from = layout.nodes.find(candidate => candidate.node.id === 1)!;
    const to = layout.nodes.find(candidate => candidate.node.id === 2)!;

    expect(line.x1).toBeGreaterThan(from.cx);
    expect(line.x2).toBeLessThan(to.cx);
    expect(line.y1).toBe(from.cy);
    expect(line.y2).toBe(to.cy);
  });

  it('un ciclo no cuelga el cálculo', () => {
    const cyclic = [node(1, { startNode: true }), node(2)];
    const layout = computeDagLayout(cyclic, [edge(1, 1, 2), edge(2, 2, 1)]);

    expect(layout.nodes).toHaveLength(2);
  });

  it('una arista hacia un nodo que ya no existe se descarta en vez de dibujarse en (0, 0)', () => {
    const layout = computeDagLayout([node(1, { startNode: true })], [edge(1, 1, 99)]);

    expect(layout.edges).toEqual([]);
  });
});

// req: RNF-04
describe('neighbourOf: el recorrido con flechas', () => {
  const layout = computeDagLayout(NODES, EDGES);

  it('Derecha va al primer destino de la decisión; si no hay, al nodo más cercano de la columna siguiente', () => {
    expect(neighbourOf(layout, EDGES, 1, 'right')).toBe(2);
    // El 4 es terminal y no tiene a dónde ir: se queda donde está.
    expect(neighbourOf(layout, EDGES, 4, 'right')).toBeNull();
  });

  it('Izquierda vuelve al origen de la decisión que llega al nodo', () => {
    expect(neighbourOf(layout, EDGES, 2, 'left')).toBe(1);
    expect(neighbourOf(layout, EDGES, 4, 'left')).toBe(2);
    expect(neighbourOf(layout, EDGES, 1, 'left')).toBeNull();
  });

  it('Abajo y Arriba recorren la columna por filas', () => {
    expect(neighbourOf(layout, EDGES, 2, 'down')).toBe(3);
    expect(neighbourOf(layout, EDGES, 3, 'up')).toBe(2);
    expect(neighbourOf(layout, EDGES, 2, 'up')).toBeNull();
  });

  it('Inicio y Fin van al primero y al último en el orden de columnas y filas', () => {
    expect(neighbourOf(layout, EDGES, 3, 'first')).toBe(1);
    expect(neighbourOf(layout, EDGES, 1, 'last')).toBe(4);
  });

  it('desde un nodo desconocido no hay vecino', () => {
    expect(neighbourOf(layout, EDGES, 99, 'right')).toBeNull();
  });
});

// req: RNF-04, WCAG 2.5.3
describe('wrapLabel: el título del nodo en dos líneas', () => {
  it('un título corto queda en una línea', () => {
    expect(wrapLabel('Inicio del caso')).toEqual(['Inicio del caso']);
  });

  it('uno más largo se parte por palabras en dos líneas', () => {
    expect(wrapLabel('Sala de urgencias hospitalaria', 20)).toEqual(['Sala de urgencias', 'hospitalaria']);
  });

  it('lo que no cabe en dos líneas se recorta con «…» en la última', () => {
    const lines = wrapLabel('Sala de urgencias hospitalaria del norte de la ciudad', 20);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines[1].length).toBeLessThanOrEqual(20);
  });

  it('una palabra más larga que la línea se corta en el límite y un título vacío no da líneas', () => {
    expect(wrapLabel('Electroencefalografía', 10)).toEqual(['Electroenc', 'efalograf…']);
    expect(wrapLabel('   ')).toEqual([]);
  });
});
