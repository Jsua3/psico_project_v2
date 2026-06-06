import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

export interface MinimapStage {
  key: string;
  label: string;
}

@Component({
  selector: 'app-minimap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="minimap" aria-label="Mapa de progreso del caso">
      <div class="minimap-nodes">
        @for (stage of stages(); track stage.key; let i = $index) {
          <div
            class="node"
            [class.node--done]="isDone(stage, i)"
            [class.node--current]="stage.key === currentNodeKey()"
            [attr.aria-label]="stage.label + (stage.key === currentNodeKey() ? ' (actual)' : isDone(stage, i) ? ' (completado)' : ' (pendiente)')"
            [attr.aria-current]="stage.key === currentNodeKey() ? 'step' : null">
            <span class="node-dot" aria-hidden="true"></span>
            <span class="node-label">{{ stage.label }}</span>
          </div>
          @if (i < stages().length - 1) {
            <div class="node-connector" [class.connector--done]="isDone(stages()[i + 1], i + 1)" aria-hidden="true"></div>
          }
        }
      </div>
      <p class="minimap-caption" aria-live="polite">
        {{ currentLabel() }} · {{ currentIndex() + 1 }}/{{ stages().length }}
      </p>
    </nav>
  `,
  styles: [`
    .minimap {
      background: rgba(8,12,18,.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(79,163,165,.18);
      border-radius: 12px;
      padding: 10px 12px 8px;
      min-width: 140px;
      max-width: 200px;
    }
    .minimap-nodes {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
    }
    .node-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid rgba(79,163,165,.3);
      background: transparent;
      flex-shrink: 0;
      transition: border-color 200ms, background 200ms;
    }
    .node--done .node-dot {
      border-color: rgba(79,163,165,.6);
      background: rgba(79,163,165,.4);
    }
    .node--current .node-dot {
      border-color: #4fa3a5;
      background: #4fa3a5;
      box-shadow: 0 0 6px 1px rgba(79,163,165,.45);
    }
    .node-label {
      font-size: .65rem;
      font-weight: 700;
      letter-spacing: .05em;
      color: rgba(232,240,244,.35);
      text-transform: uppercase;
      transition: color 200ms;
    }
    .node--done .node-label { color: rgba(232,240,244,.5); }
    .node--current .node-label { color: #4fa3a5; }

    .node-connector {
      width: 2px;
      height: 10px;
      margin-left: 4px;
      background: rgba(79,163,165,.18);
      border-radius: 1px;
      transition: background 200ms;
    }
    .connector--done { background: rgba(79,163,165,.45); }

    .minimap-caption {
      margin: 8px 0 0;
      font-size: .6rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: rgba(79,163,165,.6);
      border-top: 1px solid rgba(79,163,165,.12);
      padding-top: 6px;
    }

    @media (prefers-reduced-motion: reduce) {
      .node-dot, .node-label, .node-connector { transition: none; }
    }
  `]
})
export class MinimapComponent {
  readonly stages = input<MinimapStage[]>([]);
  readonly currentNodeKey = input('');
  readonly visitedNodeKeys = input<string[]>([]);

  readonly currentIndex = computed(() => {
    const idx = this.stages().findIndex(s => s.key === this.currentNodeKey());
    return idx >= 0 ? idx : 0;
  });

  readonly currentLabel = computed(() =>
    this.stages()[this.currentIndex()]?.label ?? ''
  );

  isDone(stage: MinimapStage, index: number): boolean {
    const visited = this.visitedNodeKeys();
    if (visited.length) {
      return visited.includes(stage.key) && stage.key !== this.currentNodeKey();
    }
    return index < this.currentIndex();
  }
}
