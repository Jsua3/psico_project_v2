import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SimulationFeedback } from '../../core/models/simulation.model';

@Component({
  selector: 'app-supervision-feedback',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (feedback(); as item) {
      <section class="supervision-panel liquid-glass psy-game-panel" [class.supervision-panel--danger]="item.prohibitedConduct">
        <div class="supervisor-avatar">
          <mat-icon>{{ item.prohibitedConduct ? 'gpp_maybe' : 'psychology' }}</mat-icon>
        </div>
        <div>
          <p class="psy-eyebrow">Supervision inmediata</p>
          <h3>{{ feedbackTitle(item) }}</h3>
          <p>{{ item.message }}</p>
          @if (item.prohibitionReason) {
            <p class="prohibition">{{ item.prohibitionReason }}</p>
          }
          <div class="impact-row">
            <span>Puntaje {{ signed(item.scoreDelta) }}</span>
            <span>Estres {{ signed(item.stressDelta) }}</span>
          </div>
        </div>
      </section>
    }
  `,
  styles: [`
    .supervision-panel {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 16px;
      padding: 20px;
      border-radius: 22px;
      animation: psy-glass-in var(--psy-motion-ui) both;
    }
    .supervisor-avatar {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      border-radius: 18px;
      background: rgba(79,124,172,.12);
      color: var(--psy-blue-deep);
    }
    h3 { margin: 0; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }
    p { margin: 6px 0 0; color: var(--psy-muted); line-height: 1.55; }
    .supervision-panel--danger { border-color: rgba(168,80,98,.32); background: rgba(255,247,248,.76); }
    .prohibition { color: #8b3145 !important; font-weight: 800; }
    .impact-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .impact-row span {
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(79,124,172,.1);
      color: var(--psy-blue-deep);
      font-family: 'JetBrains Mono', monospace;
      font-size: .82rem;
      font-weight: 800;
    }
  `]
})
export class SupervisionFeedbackComponent {
  readonly feedback = input<SimulationFeedback | null>(null);

  feedbackTitle(feedback: SimulationFeedback) {
    if (feedback.prohibitedConduct) return 'Alerta etica y normativa';
    return {
      ADEQUATE: 'Intervencion segura',
      RISKY: 'Intervencion con riesgo',
      INADEQUATE: 'Intervencion que requiere correccion'
    }[feedback.classification];
  }

  signed(value: number) {
    return value > 0 ? `+${value}` : `${value}`;
  }
}
