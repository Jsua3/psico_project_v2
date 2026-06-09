import { Component, computed, input } from '@angular/core';
import { SocialNode, SocialEdge } from './social-map.model';

@Component({
  selector: 'app-social-map',
  standalone: true,
  imports: [],
  template: `
    <section class="social-map-panel" aria-labelledby="social-map-title">
      <header class="social-head">
        <div>
          <p class="eyebrow">Mapa social</p>
          <h2 id="social-map-title">Mapa de relaciones</h2>
        </div>
        <span class="social-count">{{ visibleNodes().length }} nodos</span>
      </header>

      @if (hasNetwork()) {
        <svg [attr.width]="svgWidth" [attr.height]="svgHeight"
             class="social-svg" id="social-map-svg"
             role="img" aria-label="Mapa de red social del paciente">
          @for (edge of visibleEdges(); track edge.from + '->' + edge.to) {
            <line
              [attr.x1]="nodePositions()[edge.from]?.x"
              [attr.y1]="nodePositions()[edge.from]?.y"
              [attr.x2]="nodePositions()[edge.to]?.x"
              [attr.y2]="nodePositions()[edge.to]?.y"
              [class]="'edge edge-' + edge.type"
              [attr.stroke-width]="edge.strength * 3 + 1"
            />
          }
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
        <div class="legend" aria-hidden="true">
          <span><i class="legend-dot legend-dot--support"></i>Apoyo</span>
          <span><i class="legend-dot legend-dot--unknown"></i>Por explorar</span>
          <span><i class="legend-dot legend-dot--conflict"></i>Riesgo</span>
        </div>
      } @else {
        <div class="empty-state">
          <p class="empty-title">Sin relaciones reveladas</p>
          <p>Las personas relevantes se agregan cuando aparecen en el escenario o durante la entrevista.</p>
        </div>
      }
    </section>
  `,
  styles: [`
    .social-map-panel {
      display: grid;
      gap: 14px;
      width: min(420px, 86vw);
      padding: 20px;
      background: rgba(8,12,18,0.95);
      border: 1px solid rgba(182,156,255,0.28);
      border-radius: 10px;
      color: #F4F7FB;
    }
    .social-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 1px solid rgba(182,156,255,.16);
      padding-bottom: 12px;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: #B69CFF;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      font-size: 1.12rem;
      line-height: 1.2;
    }
    .social-count {
      flex: 0 0 auto;
      padding: 5px 9px;
      border: 1px solid rgba(182,156,255,.22);
      border-radius: 6px;
      color: rgba(244,247,251,.62);
      font-size: .72rem;
      font-weight: 800;
    }
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
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: rgba(244,247,251,.55);
      font-size: .72rem;
    }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend-dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
    .legend-dot--support { background: #6EC67A; }
    .legend-dot--unknown { background: #7D8290; }
    .legend-dot--conflict { background: #E25A4F; }
    .empty-state {
      padding: 22px;
      border: 1px dashed rgba(182,156,255,.24);
      border-radius: 8px;
      background: rgba(124,77,255,.08);
      text-align: center;
    }
    .empty-title {
      margin: 0 0 6px;
      color: #B69CFF;
      font-weight: 900;
    }
    .empty-state p:last-child {
      margin: 0;
      color: rgba(244,247,251,.62);
      font-size: .82rem;
      line-height: 1.5;
    }
  `]
})
export class SocialMapComponent {
  readonly nodes = input<SocialNode[]>([]);
  readonly edges = input<SocialEdge[]>([]);

  readonly svgWidth = 380;
  readonly svgHeight = 260;

  readonly visibleNodes = computed(() => this.nodes().filter(n => n.revealed));

  readonly visibleEdges = computed(() =>
    this.edges().filter(e =>
      this.nodes().find(n => n.id === e.from)?.revealed &&
      this.nodes().find(n => n.id === e.to)?.revealed
    )
  );

  readonly hasNetwork = computed(() =>
    this.visibleNodes().some(node => node.type !== 'patient') || this.visibleEdges().length > 0
  );

  readonly nodePositions = computed(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const visible = this.visibleNodes();
    const cx = this.svgWidth / 2;
    const cy = this.svgHeight / 2;
    const r = Math.min(cx, cy) - 42;

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
}
