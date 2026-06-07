import { Component, Input, OnChanges, computed, signal } from '@angular/core';

export interface SocialNode {
  id: string;
  label: string;
  type: 'patient' | 'family' | 'friend' | 'professional' | 'antagonist';
  revealed: boolean;
  affinity: number; // -1 a 1
}

export interface SocialEdge {
  from: string;
  to: string;
  strength: number; // 0-1
  type: 'support' | 'conflict' | 'neutral' | 'unknown';
}

@Component({
  selector: 'app-social-map',
  standalone: true,
  imports: [],
  template: `
    <div class="social-map-panel" [class.collapsed]="isCollapsed()">
      <button class="collapse-btn" (click)="toggleCollapse()"
              [attr.aria-expanded]="!isCollapsed()"
              aria-controls="social-map-svg">
        Red Social {{ isCollapsed() ? '▶' : '▼' }}
      </button>
      @if (!isCollapsed()) {
        <svg [attr.width]="svgWidth" [attr.height]="svgHeight"
             class="social-svg" id="social-map-svg"
             role="img" aria-label="Mapa de red social del paciente">
          <!-- Edges -->
          @for (edge of visibleEdges(); track edge.from + edge.to) {
            <line
              [attr.x1]="nodePositions()[edge.from]?.x"
              [attr.y1]="nodePositions()[edge.from]?.y"
              [attr.x2]="nodePositions()[edge.to]?.x"
              [attr.y2]="nodePositions()[edge.to]?.y"
              [class]="'edge edge-' + edge.type"
              [attr.stroke-width]="edge.strength * 3 + 1"
            />
          }
          <!-- Nodes -->
          @for (node of visibleNodes(); track node.id) {
            <g [attr.transform]="'translate(' + nodePositions()[node.id]?.x + ',' + nodePositions()[node.id]?.y + ')'">
              <circle r="18" [class]="'node node-' + node.type" />
              <text class="node-label" dy="32" text-anchor="middle">{{ node.label }}</text>
              @if (node.affinity !== 0) {
                <text class="affinity" dy="-22" text-anchor="middle">
                  {{ node.affinity > 0 ? '+' : '' }}{{ (node.affinity * 100).toFixed(0) }}%
                </text>
              }
            </g>
          }
        </svg>
      }
    </div>
  `,
  styles: [`
    .social-map-panel {
      background: rgba(17,24,39,0.85);
      border: 1px solid rgba(124,77,255,0.3);
      border-radius: 8px;
      padding: 8px;
      backdrop-filter: blur(8px);
    }
    .social-map-panel.collapsed { padding-bottom: 4px; }
    .collapse-btn {
      background: none; border: none; color: #B69CFF;
      cursor: pointer; font-size: 12px; padding: 0;
    }
    .collapse-btn:focus-visible { outline: 2px solid #B69CFF; }
    .social-svg { display: block; }
    .edge { stroke-opacity: 0.6; fill: none; }
    .edge-support  { stroke: #6EC67A; }
    .edge-conflict { stroke: #E25A4F; }
    .edge-neutral  { stroke: #7D8290; }
    .edge-unknown  { stroke: #7D8290; stroke-dasharray: 4; }
    .node { fill-opacity: 0.9; }
    .node-patient      { fill: #7C4DFF; }
    .node-family       { fill: #4B7DAF; }
    .node-friend       { fill: #6CC0C7; }
    .node-professional { fill: #B69CFF; }
    .node-antagonist   { fill: #E25A4F; }
    .node-label { fill: #F4F7FB; font-size: 10px; }
    .affinity   { fill: #F5B84B; font-size: 9px; }
  `]
})
export class SocialMapComponent implements OnChanges {
  @Input() nodes: SocialNode[] = [];
  @Input() edges: SocialEdge[] = [];

  readonly svgWidth = 220;
  readonly svgHeight = 160;
  isCollapsed = signal(false);

  // Signals internos para que computed funcione con @Input
  private readonly _nodes = signal<SocialNode[]>([]);
  private readonly _edges = signal<SocialEdge[]>([]);

  readonly visibleNodes = computed(() => this._nodes().filter(n => n.revealed));

  readonly visibleEdges = computed(() =>
    this._edges().filter(e =>
      this._nodes().find(n => n.id === e.from)?.revealed &&
      this._nodes().find(n => n.id === e.to)?.revealed
    )
  );

  readonly nodePositions = computed(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const visible = this.visibleNodes();
    const cx = this.svgWidth / 2;
    const cy = this.svgHeight / 2;
    const r = Math.min(cx, cy) - 30;

    const others = visible.filter(n => n.type !== 'patient');
    visible.forEach(node => {
      if (node.type === 'patient') {
        positions[node.id] = { x: cx, y: cy };
      } else {
        const idx = others.indexOf(node);
        const angle = (idx / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
        positions[node.id] = {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        };
      }
    });
    return positions;
  });

  ngOnChanges(): void {
    this._nodes.set(this.nodes);
    this._edges.set(this.edges);
  }

  toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
  }
}
