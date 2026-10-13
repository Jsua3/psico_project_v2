import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { ClinicalToolState } from '../../core/models/simulation.model';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { DRAFT_COPY } from './draft-copy';

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
  imports: [CommonModule, MatIconModule, UiIconButton],
  template: `
    <div class="tool-dock-wrap">
      @if (tools().length > 0) {
        <span class="tool-count" aria-hidden="true">
          <span class="tool-count__label">Herramientas</span>
          <strong>{{ ownedCount() }} de {{ tools().length }}</strong>
        </span>
      }
      <!-- Barra de herramientas (patrón ARIA, tabindex itinerante): UNA parada de tabulación; flechas, Inicio y Fin
           recorren las ranuras. Las bloqueadas siguen enfocables (aria-disabled, nunca disabled) para explicar por qué. -->
      <div
        class="tool-dock"
        role="toolbar"
        aria-orientation="horizontal"
        [attr.aria-label]="'Herramientas ' + ownedCount() + ' de ' + tools().length + '. ' + inventoryLabel + '; desplázate horizontalmente para revisar todas las herramientas.'">
        @for (tool of tools(); track tool.code; let index = $index) {
          @let owned = ownedSet().has(tool.code);
          <button
            class="tool-card"
            type="button"
            [attr.tabindex]="index === tabStop() ? 0 : -1"
            [attr.aria-disabled]="owned ? null : 'true'"
            [class.tool-card--owned]="owned"
            [class.tool-card--locked]="!owned"
            [class.tool-card--selected]="selectedToolCode() === tool.code"
            [title]="owned ? tool.label + ' — ' + tool.description : tool.label + ' — ' + lockedReason"
            [attr.aria-label]="tool.label + ': ' + tool.description + '. ' + (owned ? 'Disponible.' : 'No disponible. ' + lockedReason)"
            (focus)="activeIndex.set(index)"
            (keydown)="onToolKeydown($event, index)"
            (click)="onSelect(tool, $event)">
            @if (!owned) {
              <mat-icon class="tool-lock" aria-hidden="true">lock</mat-icon>
            }
            <mat-icon aria-hidden="true">{{ tool.icon }}</mat-icon>
            <span class="tool-name" aria-hidden="true">{{ tool.label }}</span>
          </button>
        }
      </div>
      <!-- En táctil el title no se ve: tocar una bloqueada lo explica aquí. Es un aviso accionable (VD-29): permanece
           hasta cerrarlo («Cerrar aviso» o Esc, que consume solo esa pulsación) y se anuncia por las regiones vivas. -->
      @if (notice(); as message) {
        <div class="tool-notice">
          <p class="tool-notice__text">{{ message }}</p>
          <button ui-icon-button class="tool-notice__close" icon="close" label="Cerrar aviso" (click)="dismissNotice()"></button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      min-height: 44px;
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
    /* El anillo es el de la piel del juego (--ds-focus); el dock recorta lo que sale de él (overflow), así que va hacia adentro. */
    .tool-card:focus-visible { outline-offset: -3px; }
    .tool-notice {
      position: absolute;
      left: 0;
      bottom: calc(100% + 6px);
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 4px;
      max-width: min(340px, 92vw);
      padding: 2px 4px 2px 11px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 10px;
      background: rgba(13,18,30,.96);
      color: rgba(232,240,244,.92);
      font-size: .8rem;
      line-height: 1.3;
    }
    .tool-notice__text { margin: 0; padding: 5px 0; }
    @keyframes tool-pop {
      0%   { transform: scale(.94); }
      70%  { transform: scale(1.02); }
      100% { transform: scale(1); }
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly announcer = inject(LiveRegionAnnouncer);
  /** Ranura que lleva el foco de tabulación (tabindex itinerante): la barra entera es UNA parada de Tab (H-12). */
  protected readonly activeIndex = signal(0);
  protected readonly tabStop = computed(() => Math.min(this.activeIndex(), Math.max(0, this.tools().length - 1)));
  /** La ranura que pidió el aviso: al cerrarlo con su botón, el foco vuelve a ella. */
  private lockedOrigin: HTMLElement | null = null;
  /** Vocabulario educativo en borrador (VD-24): sale del registro, no de la plantilla. */
  protected readonly inventoryLabel = DRAFT_COPY.inventoryLabel.text;

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

  constructor() {
    // El aviso se anuncia una vez por las regiones vivas persistentes (H-09): la caja visible ya no es región viva.
    effect(() => {
      const message = this.notice();
      if (message) untracked(() => this.announcer.announce(message, 'polite'));
    });
  }

  protected onSelect(tool: ClinicalToolState, event?: Event): void {
    if (!this.ownedSet().has(tool.code)) {
      this.lockedOrigin = (event?.currentTarget as HTMLElement | null) ?? null;
      this.lockedCode.set(tool.code);
      return;
    }
    this.lockedCode.set(null);
    this.select.emit(tool.code);
  }

  /**
   * Flechas, Inicio y Fin recorren las ranuras (también las bloqueadas) con vuelta al otro extremo. La pulsación se
   * consume: el mundo no la lee como un paso. Con modificadores no se toca (atajos del navegador).
   */
  protected onToolKeydown(event: KeyboardEvent, index: number): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const last = this.tools().length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = index >= last ? 0 : index + 1; break;
      case 'ArrowLeft': next = index <= 0 ? last : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    event.preventDefault();
    this.activeIndex.set(next);
    this.host.nativeElement.querySelectorAll<HTMLElement>('.tool-card')[next]?.focus();
  }

  /** Cierra el aviso; con su botón el foco vuelve a la ranura que lo pidió (WCAG 2.4.3). */
  protected dismissNotice(): void {
    const origin = this.lockedOrigin;
    this.lockedCode.set(null);
    this.lockedOrigin = null;
    origin?.focus();
  }

  /**
   * Esc cierra SOLO el aviso y consume esa pulsación: el juego no la lee como pausa (cadena ayuda → bitácora → diálogo →
   * pausa). Sin aviso abierto no hace nada y la cadena sigue intacta. `document` recibe la tecla antes que el
   * `window:keydown` de la pantalla de juego.
   */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.notice()) return;
    event.preventDefault();
    this.dismissNotice();
  }
}
