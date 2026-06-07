import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-verbal-tension',
  standalone: true,
  template: `
    <div class="vt-container" [class.critical]="isCritical()">
      <span class="vt-label">Tensión Verbal</span>
      <div class="vt-track">
        <div class="vt-fill" [style.width.%]="fillPercent()" [class]="fillClass()"></div>
        <div class="vt-safe-marker" [style.left.%]="safeThreshold * 100"></div>
      </div>
      @if (isCritical()) {
        <span class="vt-warning" role="alert">⚠ Paciente cierra comunicación</span>
      }
    </div>
  `,
  styles: [`
    .vt-container {
      display: flex; flex-direction: column; gap: 4px;
      padding: 6px 8px;
      background: rgba(17,24,39,0.7);
      border-radius: 6px;
      border: 1px solid rgba(124,77,255,0.2);
    }
    .vt-container.critical { border-color: #E25A4F; }
    .vt-label { font-size: 10px; color: #7D8290; text-transform: uppercase; letter-spacing: 0.5px; }
    .vt-track {
      position: relative;
      height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: visible;
    }
    .vt-fill {
      height: 100%; border-radius: 3px;
      transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    .vt-fill.low    { background: #6EC67A; }
    .vt-fill.medium { background: #F5B84B; }
    .vt-fill.high   { background: #E25A4F; }
    .vt-safe-marker {
      position: absolute; top: -3px; bottom: -3px;
      width: 2px; background: rgba(255,255,255,0.4);
      border-radius: 1px;
    }
    .vt-warning { font-size: 10px; color: #E25A4F; animation: blink 1s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
  `]
})
export class VerbalTensionComponent {
  readonly tension = input<number>(0); // 0.0 - 1.0
  readonly safeThreshold = 0.7;

  readonly fillPercent = computed(() => Math.max(0, Math.min(100, this.tension() * 100)));
  readonly isCritical  = computed(() => this.tension() >= 0.9);
  readonly fillClass   = computed(() => {
    const t = this.tension();
    if (t < 0.4) return 'low';
    if (t < 0.7) return 'medium';
    return 'high';
  });
}
