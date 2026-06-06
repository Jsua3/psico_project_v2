import { CommonModule } from '@angular/common';
import { Component, OnChanges, SimpleChanges, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecisionEdgeState, NodeEditorState, WorldValidationIssue } from '../../core/models/simulation.model';

interface LayoutNode {
  node: NodeEditorState;
  cx: number;
  cy: number;
  col: number;
  row: number;
}

interface LayoutEdge {
  edge: DecisionEdgeState;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  color: string;
}

const NODE_W = 168;
const NODE_H = 76;
const COL_GAP = 240;
const ROW_GAP = 110;
const PAD = 56;

@Component({
  selector: 'app-dag-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="dag-shell">
      <div class="dag-legend">
        <span class="legend-dot legend-dot--start"></span>Inicio
        <span class="legend-dot legend-dot--terminal"></span>Terminal
        <span class="legend-dot legend-dot--adequate"></span>Adecuada
        <span class="legend-dot legend-dot--risky"></span>Riesgosa
        <span class="legend-dot legend-dot--prohibited"></span>Prohibida
      </div>

      @if (graphWarnings().length) {
        <div class="dag-graph-warnings">
          @for (warn of graphWarnings(); track warn) {
            <span class="dag-warn-chip"><mat-icon>warning</mat-icon>{{ warn }}</span>
          }
        </div>
      }

      @if (nodes().length === 0) {
        <div class="dag-empty">
          <mat-icon>account_tree</mat-icon>
          <p>No hay nodos. Crea el primer nodo DAG para visualizar el grafo del caso.</p>
        </div>
      } @else {
        <div class="dag-scroll">
          <svg [attr.width]="svgWidth()" [attr.height]="svgHeight()" class="dag-svg" role="img" aria-label="Grafo DAG del caso">
            <defs>
              <marker id="arrow-adequate" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#4fa3a5" />
              </marker>
              <marker id="arrow-risky" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#a99bd6" />
              </marker>
              <marker id="arrow-prohibited" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#c0392b" />
              </marker>
            </defs>

            <!-- Edges -->
            @for (le of layoutEdges(); track le.edge.id) {
              <g class="dag-edge-group"
                 [class.dag-edge--adequate]="le.edge.classification === 'ADEQUATE'"
                 [class.dag-edge--risky]="le.edge.classification === 'RISKY'"
                 [class.dag-edge--prohibited]="le.edge.prohibitedConduct"
                 (click)="edgeClick.emit(le.edge)">
                <path
                  [attr.d]="curvePath(le)"
                  fill="none"
                  [attr.stroke]="le.color"
                  [attr.stroke-width]="2.5"
                  [attr.stroke-dasharray]="le.edge.prohibitedConduct ? '6,4' : null"
                  [attr.marker-end]="markerFor(le.edge)" />
                <text [attr.x]="le.mx" [attr.y]="le.my - 6" class="edge-label" text-anchor="middle">
                  {{ le.edge.text | slice:0:24 }}{{ le.edge.text.length > 24 ? '…' : '' }}
                </text>
                <text [attr.x]="le.mx" [attr.y]="le.my + 10" class="edge-score" text-anchor="middle">
                  {{ le.edge.scoreDelta >= 0 ? '+' : '' }}{{ le.edge.scoreDelta }}pts · {{ le.edge.stressDelta >= 0 ? '+' : '' }}{{ le.edge.stressDelta }}%
                </text>
              </g>
            }

            <!-- Nodes -->
            @for (ln of layoutNodes(); track ln.node.id) {
              <g class="dag-node-group"
                 [class.dag-node--start]="ln.node.startNode"
                 [class.dag-node--terminal]="ln.node.terminal"
                 [class.dag-node--orphan]="isOrphan(ln.node)"
                 [class.dag-node--selected]="selectedNodeId() === ln.node.id"
                 [attr.transform]="'translate(' + (ln.cx - NODE_W/2) + ',' + (ln.cy - NODE_H/2) + ')'"
                 (click)="selectNode(ln.node)"
                 role="button"
                 [attr.aria-label]="'Nodo ' + ln.node.key + ': ' + ln.node.title"
                 tabindex="0"
                 (keydown.enter)="selectNode(ln.node)">
                <rect
                  [attr.width]="NODE_W"
                  [attr.height]="NODE_H"
                  rx="14"
                  class="dag-node-rect" />
                <text x="84" y="24" class="dag-node-key" text-anchor="middle">{{ ln.node.key }}</text>
                <text x="84" y="44" class="dag-node-title" text-anchor="middle">
                  {{ ln.node.title | slice:0:20 }}{{ ln.node.title.length > 20 ? '…' : '' }}
                </text>
                <text x="84" y="62" class="dag-node-badge" text-anchor="middle">
                  {{ ln.node.terminal ? '■ Terminal' : ln.node.startNode ? '▶ Inicio' : '● Nodo' }}
                </text>
              </g>
            }
          </svg>
        </div>
      }

      @if (selectedNode(); as node) {
        <aside class="dag-detail liquid-glass">
          <div class="dag-detail-head">
            <div>
              <span class="psy-chip">{{ node.startNode ? 'Inicio' : node.terminal ? 'Terminal' : 'Nodo' }}</span>
              <h3>{{ node.title }}</h3>
              <code>{{ node.key }}</code>
            </div>
            <div class="dag-detail-actions">
              <button class="psy-button psy-button--glass" type="button" (click)="nodeEdit.emit(node)">
                <mat-icon>edit</mat-icon>Editar
              </button>
              <button class="psy-icon-button" type="button" aria-label="Cerrar" (click)="selectedNode.set(null)">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>
          <p class="dag-narrative">{{ node.narrative }}</p>
          @if (node.requiredTools.length) {
            <p class="dag-meta"><mat-icon>build</mat-icon> Herramientas: {{ node.requiredTools.join(', ') }}</p>
          }
          @if (node.sensitiveContent) {
            <p class="dag-meta"><mat-icon>health_and_safety</mat-icon> Contenido sensible</p>
          }
          <div class="dag-edges-list">
            <p class="psy-eyebrow">Decisiones salientes</p>
            @for (edge of outgoingEdges(node.id); track edge.id) {
              <div class="dag-edge-chip" [class.dag-edge-chip--prohibited]="edge.prohibitedConduct">
                <mat-icon>{{ iconForClass(edge.classification, edge.prohibitedConduct) }}</mat-icon>
                <span>{{ edge.text }}</span>
                <em>→ {{ edge.targetKey }}</em>
                <button class="psy-icon-button psy-icon-button--sm" type="button" (click)="edgeEdit.emit(edge)">
                  <mat-icon>edit</mat-icon>
                </button>
              </div>
            }
            @if (!outgoingEdges(node.id).length) {
              <p class="dag-empty-edges">Sin decisiones salientes. Agrega una arista desde el panel de decisiones.</p>
            }
          </div>
          <div class="dag-node-actions">
            <button class="psy-button psy-button--primary" type="button" (click)="addEdge.emit(node)">
              <mat-icon>add_link</mat-icon>Nueva decisión
            </button>
            <button class="psy-button" type="button"
                    style="color: #8b3145; border-color: rgba(168,80,98,.28);"
                    (click)="nodeDelete.emit(node)">
              <mat-icon>delete_outline</mat-icon>Eliminar nodo
            </button>
          </div>
        </aside>
      }
    </div>
  `,
  styles: [`
    .dag-shell { display: grid; gap: 16px; }

    .dag-legend {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding: 10px 14px;
      border: 1px solid var(--psy-border);
      border-radius: 12px;
      background: rgba(255,255,255,.62);
      font-size: .8rem;
      color: var(--psy-muted);
    }
    .legend-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .legend-dot--start { background: #4fa3a5; }
    .legend-dot--terminal { background: #4f7cac; }
    .legend-dot--adequate { background: #8cbfa6; }
    .legend-dot--risky { background: #a99bd6; }
    .legend-dot--prohibited { background: #c0392b; }

    .dag-graph-warnings {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 12px;
      border: 1px solid rgba(198,168,80,.28);
      border-radius: 12px;
      background: rgba(198,168,80,.06);
    }
    .dag-warn-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(198,168,80,.14);
      color: #7a6320;
      font-size: .78rem;
      font-weight: 700;
    }
    .dag-warn-chip mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .dag-node--orphan .dag-node-rect {
      stroke: #c6a850 !important;
      stroke-dasharray: 6,4;
    }

    .dag-empty {
      display: grid;
      place-items: center;
      gap: 12px;
      min-height: 240px;
      border: 2px dashed rgba(79,124,172,.22);
      border-radius: 18px;
      color: var(--psy-muted);
      text-align: center;
    }
    .dag-empty mat-icon { font-size: 48px; width: 48px; height: 48px; opacity: .4; }

    .dag-scroll {
      overflow: auto;
      border: 1px solid rgba(79,124,172,.14);
      border-radius: 18px;
      background: #f6f9fb;
      max-height: 560px;
    }
    .dag-svg { display: block; }

    .dag-node-group {
      cursor: pointer;
    }
    .dag-node-group:focus { outline: none; }
    .dag-node-rect {
      fill: rgba(255,255,255,.88);
      stroke: rgba(79,124,172,.3);
      stroke-width: 2;
      filter: drop-shadow(0 4px 12px rgba(36,50,58,.12));
      transition: filter .15s, stroke .15s;
    }
    .dag-node--start .dag-node-rect {
      fill: rgba(79,163,165,.1);
      stroke: #4fa3a5;
    }
    .dag-node--terminal .dag-node-rect {
      fill: rgba(79,124,172,.1);
      stroke: #4f7cac;
    }
    .dag-node--selected .dag-node-rect {
      stroke: #2f5f8f;
      stroke-width: 3;
      filter: drop-shadow(0 6px 18px rgba(47,95,143,.28));
    }
    .dag-node-group:hover .dag-node-rect {
      filter: drop-shadow(0 6px 16px rgba(36,50,58,.18));
    }
    .dag-node-key {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      fill: var(--psy-blue-deep);
      letter-spacing: .06em;
    }
    .dag-node-title {
      font-size: 13px;
      font-weight: 600;
      fill: var(--psy-ink);
    }
    .dag-node-badge {
      font-size: 10px;
      fill: var(--psy-muted);
    }

    .dag-edge-group { cursor: pointer; }
    .edge-label {
      font-size: 11px;
      fill: var(--psy-muted);
      font-weight: 600;
      pointer-events: none;
    }
    .edge-score {
      font-size: 10px;
      fill: var(--psy-blue-deep);
      pointer-events: none;
    }

    /* Detail panel */
    .dag-detail {
      display: grid;
      gap: 14px;
      padding: 20px;
      border-radius: 20px;
    }
    .dag-detail-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .dag-detail-head h3 {
      margin: 6px 0 4px;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
    }
    .dag-detail-head code {
      font-family: 'JetBrains Mono', monospace;
      font-size: .78rem;
      color: var(--psy-blue-deep);
    }
    .dag-detail-actions { display: flex; gap: 8px; }
    .dag-narrative { margin: 0; color: var(--psy-muted); line-height: 1.56; }
    .dag-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: .84rem;
      color: var(--psy-muted);
    }
    .dag-edges-list { display: grid; gap: 8px; }
    .dag-empty-edges { font-size: .82rem; color: var(--psy-muted); margin: 0; }
    .dag-edge-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid rgba(79,124,172,.18);
      border-radius: 12px;
      background: rgba(255,255,255,.6);
      font-size: .84rem;
    }
    .dag-edge-chip em {
      margin-left: auto;
      font-size: .76rem;
      color: var(--psy-muted);
      font-style: normal;
    }
    .dag-edge-chip--prohibited {
      border-color: rgba(192,57,43,.28);
      background: rgba(192,57,43,.06);
    }
    .dag-node-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      padding-top: 6px;
      border-top: 1px solid var(--psy-border);
    }
    .psy-icon-button--sm {
      width: 30px;
      height: 30px;
      border-radius: 8px;
    }
    .psy-icon-button--sm mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `]
})
export class DagEditorComponent implements OnChanges {
  readonly nodes = input<NodeEditorState[]>([]);
  readonly edges = input<DecisionEdgeState[]>([]);
  readonly validationIssues = input<WorldValidationIssue[]>([]);
  readonly nodeEdit = output<NodeEditorState>();
  readonly nodeDelete = output<NodeEditorState>();
  readonly edgeEdit = output<DecisionEdgeState>();
  readonly edgeClick = output<DecisionEdgeState>();
  readonly addEdge = output<NodeEditorState>();

  readonly NODE_W = NODE_W;
  readonly NODE_H = NODE_H;
  readonly selectedNode = signal<NodeEditorState | null>(null);
  readonly selectedNodeId = computed(() => this.selectedNode()?.id ?? null);

  readonly layoutNodes = signal<LayoutNode[]>([]);
  readonly layoutEdges = signal<LayoutEdge[]>([]);
  readonly svgWidth = signal(800);
  readonly svgHeight = signal(400);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['nodes'] || changes['edges']) {
      this.computeLayout();
    }
  }

  selectNode(node: NodeEditorState) {
    this.selectedNode.set(this.selectedNode()?.id === node.id ? null : node);
  }

  /** Computed: graph-level warnings based on topology analysis. */
  readonly graphWarnings = computed(() => {
    const ns = this.nodes();
    const es = this.edges();
    const warnings: string[] = [];
    const startNodes = ns.filter(n => n.startNode);
    const terminalNodes = ns.filter(n => n.terminal);
    if (ns.length > 0 && startNodes.length === 0) warnings.push('Sin nodo inicial');
    if (ns.length > 0 && startNodes.length > 1) warnings.push('Multiples nodos iniciales');
    if (ns.length > 0 && terminalNodes.length === 0) warnings.push('Sin nodo terminal');
    const orphans = ns.filter(n => !n.terminal && !es.some(e => e.sourceNodeId === n.id));
    if (orphans.length > 0) warnings.push(`${orphans.length} nodo(s) sin decisiones salientes`);
    return warnings;
  });

  /** Check if a node is an "orphan" — has no outgoing edges and isn't terminal. */
  isOrphan(node: NodeEditorState): boolean {
    return !node.terminal && !this.edges().some(e => e.sourceNodeId === node.id);
  }

  outgoingEdges(nodeId: number): DecisionEdgeState[] {
    return this.edges().filter(e => e.sourceNodeId === nodeId);
  }

  iconForClass(classification: string, prohibited: boolean): string {
    if (prohibited) return 'block';
    if (classification === 'ADEQUATE') return 'check_circle';
    if (classification === 'RISKY') return 'warning';
    return 'cancel';
  }

  markerFor(edge: DecisionEdgeState): string {
    if (edge.prohibitedConduct) return 'url(#arrow-prohibited)';
    if (edge.classification === 'RISKY') return 'url(#arrow-risky)';
    return 'url(#arrow-adequate)';
  }

  curvePath(le: LayoutEdge): string {
    const dx = (le.x2 - le.x1) * 0.5;
    return `M ${le.x1} ${le.y1} C ${le.x1 + dx} ${le.y1}, ${le.x2 - dx} ${le.y2}, ${le.x2} ${le.y2}`;
  }

  private computeLayout() {
    const ns = this.nodes();
    if (!ns.length) {
      this.layoutNodes.set([]);
      this.layoutEdges.set([]);
      return;
    }

    // Topological column assignment via BFS from start nodes
    const colMap = new Map<number, number>();
    const rowMap = new Map<number, number>();
    const edgeMap = this.edges();

    // Build adjacency
    const outgoing = new Map<number, number[]>();
    const incoming = new Map<number, number[]>();
    ns.forEach(n => { outgoing.set(n.id, []); incoming.set(n.id, []); });
    edgeMap.forEach(e => {
      outgoing.get(e.sourceNodeId)?.push(e.targetNodeId);
      incoming.get(e.targetNodeId)?.push(e.sourceNodeId);
    });

    // BFS column assignment
    const queue: number[] = ns.filter(n => n.startNode || !incoming.get(n.id)?.length).map(n => n.id);
    if (!queue.length) queue.push(ns[0].id);
    queue.forEach(id => colMap.set(id, 0));

    const bfsVisited = new Set<number>(queue);
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      const col = colMap.get(id) ?? 0;
      (outgoing.get(id) ?? []).forEach(tid => {
        const cur = colMap.get(tid) ?? -1;
        if (cur < col + 1) colMap.set(tid, col + 1);
        if (!bfsVisited.has(tid)) {
          bfsVisited.add(tid);
          queue.push(tid);
        }
      });
    }
    // Unvisited nodes get last column
    ns.forEach(n => { if (!colMap.has(n.id)) colMap.set(n.id, Math.max(...colMap.values()) + 1); });

    // Assign rows within each column
    const colCounts = new Map<number, number>();
    ns.forEach(n => {
      const col = colMap.get(n.id) ?? 0;
      const row = colCounts.get(col) ?? 0;
      rowMap.set(n.id, row);
      colCounts.set(col, row + 1);
    });

    // Compute positions
    const maxCol = Math.max(...colMap.values());
    const maxRowsInAnyCol = Math.max(...[...colCounts.values()]);

    const layoutNodes: LayoutNode[] = ns.map(n => {
      const col = colMap.get(n.id) ?? 0;
      const row = rowMap.get(n.id) ?? 0;
      const totalInCol = colCounts.get(col) ?? 1;
      const colHeight = totalInCol * NODE_H + (totalInCol - 1) * (ROW_GAP - NODE_H);
      const startY = (maxRowsInAnyCol * ROW_GAP - colHeight) / 2;
      return {
        node: n,
        col,
        row,
        cx: PAD + col * COL_GAP + NODE_W / 2,
        cy: PAD + startY + row * ROW_GAP + NODE_H / 2
      };
    });

    // Compute edge paths
    const posMap = new Map(layoutNodes.map(ln => [ln.node.id, { x: ln.cx, y: ln.cy }]));
    const layoutEdges: LayoutEdge[] = edgeMap.map(edge => {
      const src = posMap.get(edge.sourceNodeId) ?? { x: 0, y: 0 };
      const tgt = posMap.get(edge.targetNodeId) ?? { x: 0, y: 0 };
      const color = edge.prohibitedConduct ? '#c0392b'
        : edge.classification === 'ADEQUATE' ? '#4fa3a5'
        : edge.classification === 'RISKY' ? '#a99bd6'
        : '#687a86';
      return {
        edge,
        x1: src.x + NODE_W / 2,
        y1: src.y,
        x2: tgt.x - NODE_W / 2,
        y2: tgt.y,
        mx: (src.x + NODE_W / 2 + tgt.x - NODE_W / 2) / 2,
        my: (src.y + tgt.y) / 2,
        color
      };
    });

    this.svgWidth.set(PAD * 2 + (maxCol + 1) * COL_GAP);
    this.svgHeight.set(PAD * 2 + maxRowsInAnyCol * ROW_GAP);
    this.layoutNodes.set(layoutNodes);
    this.layoutEdges.set(layoutEdges);
  }
}
