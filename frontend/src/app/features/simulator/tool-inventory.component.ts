import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ClinicalToolState } from '../../core/models/simulation.model';

/** Cómo se consigue una herramienta que aún no se tiene: igual para todas, no revela cuál sirve para qué decisión. */
const LOCKED_REASON = 'Se consigue explorando las salas del caso.';

/**
 * Dock horizontal inferior de herramientas clínicas (HUD redesign).
 * Cards compactas: icono + nombre corto, con el nombre completo en `title` y en el nombre accesible.
 * Las bloqueadas son `aria-disabled` y siguen siendo enfocables: así quien navega con teclado o lector
 * las encuentra y entiende por qué no se pueden usar. No hay insignias 1-5 porque no existe ese atajo.
 * La salida segura vive FUERA de este dock (bloque separado a la izquierda en la bottom-zone del gameplay).
 */
@Component({
  selector: 'app-tool-inventory',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="tool-dock-wrap">
      <span class="tool-count" aria-hidden="true">
        <span class="tool-count__label">Herramientas</span>
        <strong>{{ ownedCount() }} de {{ tools().length }}</strong>
      </span>
      <div
        class="tool-dock"
        role="toolbar"
        [attr.aria-label]="'Herramientas ' + ownedCount() + ' de ' + tools().length + '. Inventario clínico; desplázate horizontalmente para revisar todas las herramientas.'">
        @for (tool of tools(); track tool.code) {
          @let owned = ownedSet().has(tool.code);
          <button
            class="tool-card"
            type="button"
            [class.tool-card--owned]="owned"
            [class.tool-card--locked]="!owned"
            [class.tool-card--selected]="selectedToolCode() === tool.code"
            [attr.aria-disabled]="owned ? null : 'true'"
            [title]="owned ? tool.label + ' — ' + tool.description : tool.label + ' — ' + lockedReason"
            [attr.aria-label]="tool.label + ': ' + tool.description + '. ' + (owned ? 'Disponible.' : 'No disponible. ' + lockedReason)"
            (click)="onSelect(tool)">
            @if (!owned) {
              <mat-icon class="tool-lock" aria-hidden="true">lock</mat-icon>
            }
            <mat-icon aria-hidden="true">{{ tool.icon }}</mat-icon>
            <span class="tool-name" aria-hidden="true">{{ tool.label }}</span>
          </button>
        }
      </div>
      <!-- En táctil el title no se ve: tocar una bloqueada lo explica aquí. Región viva siempre presente. -->
      <p class="tool-notice" role="status">{{ notice() }}</p>
    </div>
  `,
  styles: [`
    :host { position: relative; }
    .tool-dock-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .tool-count {
      display: grid;
      flex-shrink: 0;
      gap: 1px;
      line-height: 1.15;
      color: rgba(232,240,244,.78);
      font-size: .75rem;
      white-space: nowrap;
    }
    .tool-count strong {
      color: #E7DDFF;
      font-family: 'JetBrains Mono', monospace;
      font-size: .75rem;
    }
    .tool-dock {
      display: flex;
      align-items: stretch;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      padding-bottom: 2px;
    }
    .tool-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      flex-shrink: 0;
      min-width: 76px;
      max-width: 112px;
      padding: 4px 10px 3px;
      border: 1px solid rgba(182,156,255,.28);
      border-radius: 11px;
      background: rgba(8,12,18,.76);
      color: rgba(182,156,255,.6);
      cursor: pointer;
      transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
    }
    .tool-card mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .tool-name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: .75rem;
      font-weight: 800;
      letter-spacing: .01em;
      line-height: 1.1;
    }
    .tool-card--owned {
      border-color: rgba(182,156,255,.5);
      color: #B69CFF;
    }
    .tool-card--owned:hover {
      border-color: rgba(182,156,255,.9);
      background: rgba(124,77,255,.18);
      box-shadow: 0 0 14px -4px rgba(124,77,255,.5);
    }
    .tool-card--owned:active { transform: translateY(1px) scale(.985); }
    .tool-card--selected {
      border-color: rgba(182,156,255,.95);
      background: rgba(124,77,255,.22);
      color: #d6c6ff;
      box-shadow: 0 0 16px -4px rgba(124,77,255,.65);
      animation: tool-pop 170ms cubic-bezier(.2,.8,.2,1);
    }
    .tool-card--locked {
      opacity: .6;
      cursor: default;
    }
    .tool-lock {
      position: absolute;
      top: 3px;
      right: 5px;
      font-size: 11px !important;
      width: 11px !important;
      height: 11px !important;
      color: rgba(232,240,244,.75);
    }
    .tool-card:focus-visible {
      outline: 2px solid rgba(182,156,255,.7);
      outline-offset: 2px;
    }
    .tool-notice {
      position: absolute;
      left: 0;
      bottom: calc(100% + 6px);
      z-index: 5;
      max-width: min(340px, 92vw);
      margin: 0;
      padding: 7px 11px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 10px;
      background: rgba(13,18,30,.96);
      color: rgba(232,240,244,.92);
      font-size: .8rem;
      line-height: 1.3;
    }
    /* Vacío sigue en el árbol de accesibilidad (para anunciar el texto que llegue) pero no se ve. */
    .tool-notice:empty { padding: 0; border: 0; opacity: 0; pointer-events: none; }
    @keyframes tool-pop {
      0%   { transform: scale(.94); }
      70%  { transform: scale(1.02); }
      100% { transform: scale(1); }
    }
    /* Con dedo: ranuras de al menos 44 px de alto. */
    @media (pointer: coarse) {
      .tool-card { min-height: 44px; }
    }
    /* Modo compacto: ranuras de icono (44x44); el nombre completo queda en title y en el nombre accesible. */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      .tool-card { width: 44px; min-width: 44px; max-width: 44px; height: 44px; padding: 0; }
      .tool-name { display: none; }
      .tool-count__label { display: none; }
      .tool-lock { top: 2px; right: 2px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tool-card--selected { animation: none; }
      .tool-card--owned:active { transform: none; }
    }
  `]
})
export class ToolInventoryComponent {
  readonly tools = input<ClinicalToolState[]>([]);
  readonly inventory = input<string[]>([]);
  readonly selectedToolCode = input<string | null>(null);
  readonly select = output<string>();

  protected readonly lockedReason = LOCKED_REASON;

  protected readonly ownedSet = computed(() => new Set(this.inventory()));
  protected readonly ownedCount = computed(() => this.tools().filter(tool => this.ownedSet().has(tool.code)).length);

  /** Herramienta bloqueada sobre la que se pidió explicación; el aviso se apaga solo si deja de estar bloqueada. */
  private readonly lockedCode = signal<string | null>(null);
  protected readonly notice = computed(() => {
    const code = this.lockedCode();
    if (!code || this.ownedSet().has(code)) return '';
    const tool = this.tools().find(candidate => candidate.code === code);
    return tool ? `${tool.label}: ${LOCKED_REASON}` : '';
  });

  protected onSelect(tool: ClinicalToolState): void {
    if (!this.ownedSet().has(tool.code)) {
      this.lockedCode.set(tool.code);
      return;
    }
    this.lockedCode.set(null);
    this.select.emit(tool.code);
  }
}
