import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { DecisionEdgeState, NodeEditorState, ResponseClass } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { plural } from '../../shared/ui/labels';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { responseClassWord } from './outcome-text.util';
import {
  DAG_NODE_H,
  DAG_NODE_W,
  DagDirection,
  DagEdgeLine,
  DagNodeBox,
  computeDagLayout,
  neighbourOf,
  wrapLabel,
} from './dag-layout.util';

/** El tipo de una arista es la clase de su respuesta; el color nunca va solo: el rótulo dice la palabra. */
type EdgeClass = 'recommended' | 'acceptable' | 'risky' | 'contraindicated';

const EDGE_CLASS_OF: Record<ResponseClass, EdgeClass> = {
  RECOMMENDED: 'recommended',
  ACCEPTABLE: 'acceptable',
  RISKY: 'risky',
  CONTRAINDICATED: 'contraindicated',
};

const EDGE_LABELS: Record<EdgeClass, string> = {
  recommended: responseClassWord('RECOMMENDED') ?? 'Recomendada',
  acceptable: responseClassWord('ACCEPTABLE') ?? 'Aceptable',
  risky: responseClassWord('RISKY') ?? 'Con riesgo',
  contraindicated: responseClassWord('CONTRAINDICATED') ?? 'Contraindicada',
};

const EDGE_TONES: Record<EdgeClass, UiBadgeTone> = {
  recommended: 'success',
  acceptable: 'info',
  risky: 'warning',
  contraindicated: 'danger',
};

/** Qué dibuja el grafo, en el orden de la leyenda: cada ítem tiene su muestra y su texto. */
const LEGEND = [
  { id: 'start', label: 'Inicio', sample: 'node' },
  { id: 'terminal', label: 'Terminal', sample: 'node' },
  { id: 'orphan', label: 'Sin salida', sample: 'node' },
  { id: 'recommended', label: 'Decisión recomendada', sample: 'edge' },
  { id: 'acceptable', label: 'Decisión aceptable', sample: 'edge' },
  { id: 'risky', label: 'Decisión con riesgo', sample: 'edge' },
  { id: 'contraindicated', label: 'Decisión contraindicada', sample: 'edge' },
] as const;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
/** Cuántos caracteres del texto de una decisión caben entre dos columnas sin pisar a los nodos. */
const EDGE_LABEL_CHARS = 20;

interface NodeView {
  box: DagNodeBox;
  id: number;
  /** Esquina superior izquierda (el centro menos media caja). */
  x: number;
  y: number;
  lines: string[];
  type: 'start' | 'terminal' | 'plain';
  orphan: boolean;
  /** El texto del tipo, tal como se ve debajo del título. */
  typeText: string;
  /** Nombre accesible: EXACTAMENTE el texto que se ve (WCAG 2.5.3), de modo que lo contiene. */
  name: string;
  /** Lo que el texto visible recorta: título completo y cantidad de decisiones. */
  description: string;
}

interface EdgeView {
  line: DagEdgeLine;
  kind: EdgeClass;
  path: string;
  label: string;
  /** La clase de la respuesta en palabras («Con riesgo»); reemplaza a las cifras que mostraba antes. */
  classWord: string;
}

/**
 * Grafo del caso (plan visual F8-3): disposición pura en `dag-layout.util`, leyenda que dice lo que se dibuja, nodos
 * como botones con nombre que contiene su texto visible (WCAG 2.5.3: cerraba los `label-content-name-mismatch` de
 * Axe), recorrido con flechas, Inicio y Fin, Enter/Espacio para abrir el detalle y Esc para cerrarlo (RNF-04), detalle
 * que sigue al nodo vigente, aristas que abren su decisión, y zoom, ajuste y desplazamiento. Las aristas son solo
 * para el puntero (`aria-hidden`): el teclado y los lectores llegan a las mismas decisiones desde el detalle del nodo.
 * Un caso que no es borrador (`lockReason`) deja ver el grafo pero no ofrece cambiarlo.
 */
@Component({
  selector: 'app-dag-editor',
  standalone: true,
  imports: [UiBadge, UiButton, UiCard, UiEmptyState, UiIconButton],
  templateUrl: './dag-editor.component.html',
  styleUrl: './dag-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DagEditorComponent {
  readonly nodes = input<NodeEditorState[]>([]);
  readonly edges = input<DecisionEdgeState[]>([]);
  /** Por qué el caso no se puede modificar (versión que no es borrador); null si se puede. */
  readonly lockReason = input<string | null>(null);
  readonly nodeEdit = output<NodeEditorState>();
  readonly nodeDelete = output<NodeEditorState>();
  readonly edgeEdit = output<DecisionEdgeState>();
  readonly addEdge = output<NodeEditorState>();

  protected readonly NODE_W = DAG_NODE_W;
  protected readonly NODE_H = DAG_NODE_H;
  protected readonly legend = LEGEND;
  protected readonly edgeLabels = EDGE_LABELS;
  protected readonly edgeTones = EDGE_TONES;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** El nodo abierto en el detalle (por id: el detalle lee el nodo VIGENTE, no una copia). */
  readonly selectedId = signal<number | null>(null);
  /** El nodo que tiene la parada de tabulación (foco itinerante). */
  protected readonly focusedId = signal<number | null>(null);
  readonly zoom = signal(1);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly zoomOutReason = computed(() => (this.zoom() <= ZOOM_MIN ? 'Ya está en el mínimo (50 %).' : null));
  protected readonly zoomInReason = computed(() => (this.zoom() >= ZOOM_MAX ? 'Ya está en el máximo (200 %).' : null));

  protected readonly layout = computed(() => computeDagLayout(this.nodes(), this.edges()));
  protected readonly width = computed(() => this.layout().width * this.zoom());
  protected readonly height = computed(() => this.layout().height * this.zoom());

  protected readonly selectedNode = computed(() => this.nodes().find(node => node.id === this.selectedId()) ?? null);

  /** Cada nodo con lo que la plantilla pinta y lo que lee el lector, calculado una sola vez. */
  protected readonly nodeViews = computed<NodeView[]>(() => {
    const edges = this.edges();
    return this.layout().nodes.map(box => {
      const node = box.node;
      const outgoing = edges.filter(edge => edge.sourceNodeId === node.id);
      const orphan = !node.terminal && outgoing.length === 0;
      const type = node.startNode ? 'start' : node.terminal ? 'terminal' : 'plain';
      const base = type === 'start' ? 'Inicio' : type === 'terminal' ? 'Terminal' : 'Nodo';
      const typeText = orphan ? `${base} · Sin salida` : base;
      const lines = wrapLabel(node.title);
      return {
        box,
        id: node.id,
        x: box.cx - DAG_NODE_W / 2,
        y: box.cy - DAG_NODE_H / 2,
        lines,
        type,
        orphan,
        typeText,
        name: [node.key, ...lines, typeText].join(' '),
        description: `Título completo: ${node.title}. ${plural(outgoing.length, 'decisión saliente', 'decisiones salientes')}.`,
      };
    });
  });

  protected readonly edgeViews = computed<EdgeView[]>(() =>
    this.layout().edges.map(line => {
      const { edge } = line;
      const dx = (line.x2 - line.x1) * 0.5;
      const text = edge.text.length > EDGE_LABEL_CHARS ? `${edge.text.slice(0, EDGE_LABEL_CHARS)}…` : edge.text;
      const kind = this.edgeKind(edge);
      return {
        line,
        kind,
        path: `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`,
        label: text,
        classWord: EDGE_LABELS[kind],
      };
    }));

  /** El nodo con la parada de tabulación: el último enfocado, o el inicial (o el primero) si aún no se enfocó ninguno. */
  protected readonly tabStopId = computed(() => {
    const views = this.nodeViews();
    const focused = this.focusedId();
    if (focused !== null && views.some(view => view.id === focused)) return focused;
    return (views.find(view => view.type === 'start') ?? views[0])?.id ?? null;
  });

  /** Avisos de topología (antes calculados aparte): sin inicio, varios inicios, sin terminal, nodos sin salida. */
  protected readonly warnings = computed(() => {
    const nodes = this.nodes();
    const warnings: string[] = [];
    if (nodes.length === 0) return warnings;
    const starts = nodes.filter(node => node.startNode).length;
    if (starts === 0) warnings.push('Sin nodo inicial');
    if (starts > 1) warnings.push('Varios nodos iniciales');
    if (!nodes.some(node => node.terminal)) warnings.push('Sin nodo terminal');
    const orphans = this.nodeViews().filter(view => view.orphan).length;
    if (orphans > 0) warnings.push(`${plural(orphans, 'nodo')} sin decisiones salientes`);
    return warnings;
  });

  protected readonly selectedEdges = computed(() => {
    const id = this.selectedId();
    return id === null ? [] : this.edges().filter(edge => edge.sourceNodeId === id);
  });

  /** Por la clase de su respuesta; una conducta marcada como contraindicada lo es aunque la clase no se haya puesto al día. */
  protected edgeKind(edge: DecisionEdgeState): EdgeClass {
    if (edge.prohibitedConduct) return 'contraindicated';
    return EDGE_CLASS_OF[edge.responseClass] ?? 'acceptable';
  }

  protected nodeType(node: NodeEditorState): string {
    if (node.startNode) return 'Inicio';
    return node.terminal ? 'Terminal' : 'Nodo';
  }

  protected targetTitle(edge: DecisionEdgeState): string {
    return this.nodes().find(node => node.id === edge.targetNodeId)?.title ?? edge.targetKey;
  }

  // ─── Selección y foco ──────────────────────────────────────────────────────────────────────────────────────────

  protected onNodeClick(id: number): void {
    this.focusedId.set(id);
    this.selectedId.update(current => (current === id ? null : id));
  }

  protected closeDetail(): void {
    const id = this.selectedId();
    this.selectedId.set(null);
    if (id !== null) this.focusNode(id);
  }

  protected onEdgeClick(edge: DecisionEdgeState): void {
    if (this.lockReason()) return;
    this.edgeEdit.emit(edge);
  }

  private idOf(target: EventTarget | null): number | null {
    const element = (target as Element | null)?.closest?.('[data-node-id]');
    const value = element?.getAttribute('data-node-id');
    return value === null || value === undefined ? null : Number(value);
  }

  private focusNode(id: number): void {
    this.focusedId.set(id);
    this.host.nativeElement.querySelector<SVGGElement>(`g.dag-node[data-node-id="${id}"]`)?.focus();
  }

  /** Flechas, Inicio, Fin, Enter, Espacio y Esc sobre el grafo; `+`, `−` y `0` acercan, alejan y restablecen. */
  protected onKeydown(event: KeyboardEvent): void {
    const id = this.idOf(event.target);
    const directions: Record<string, DagDirection> = {
      ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down', Home: 'first', End: 'last',
    };
    const direction = directions[event.key];
    if (direction && id !== null) {
      event.preventDefault();
      const next = neighbourOf(this.layout(), this.edges(), id, direction);
      if (next !== null) this.focusNode(next);
      return;
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
        if (id === null) return;
        event.preventDefault();
        this.onNodeClick(id);
        break;
      case 'Escape':
        if (this.selectedId() === null) return;
        event.preventDefault();
        this.closeDetail();
        break;
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
      case '_':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.zoom.set(1);
        break;
    }
  }

  // ─── Zoom, ajuste y desplazamiento ─────────────────────────────────────────────────────────────────────────────

  protected zoomIn(): void {
    this.zoom.update(value => Math.min(ZOOM_MAX, value + ZOOM_STEP));
  }

  protected zoomOut(): void {
    this.zoom.update(value => Math.max(ZOOM_MIN, value - ZOOM_STEP));
  }

  /** Escala el grafo para que quepa a lo ancho de la vista (sin agrandarlo más allá del 100 %). */
  protected fit(): void {
    const available = this.scroller()?.nativeElement.clientWidth ?? 0;
    if (available <= 0) {
      this.zoom.set(1);
      return;
    }
    const scale = Math.floor((available / this.layout().width) / 0.05) * 0.05;
    this.zoom.set(Math.min(1, Math.max(ZOOM_MIN, Math.round(scale * 100) / 100)));
  }

  private pan: { x: number; y: number; left: number; top: number } | null = null;
  protected readonly panning = signal(false);

  /** Arrastrar el fondo desplaza el lienzo (con el puntero; con teclado, las flechas llevan el foco y el lienzo lo sigue). */
  protected onPanStart(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as Element | null)?.closest?.('.dag-node, .dag-edge')) return;
    const scroller = this.scroller()?.nativeElement;
    if (!scroller) return;
    this.pan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    this.panning.set(true);
    scroller.setPointerCapture?.(event.pointerId);
  }

  protected onPanMove(event: PointerEvent): void {
    const scroller = this.scroller()?.nativeElement;
    if (!this.pan || !scroller) return;
    scroller.scrollLeft = this.pan.left - (event.clientX - this.pan.x);
    scroller.scrollTop = this.pan.top - (event.clientY - this.pan.y);
  }

  protected onPanEnd(): void {
    this.pan = null;
    this.panning.set(false);
  }
}
