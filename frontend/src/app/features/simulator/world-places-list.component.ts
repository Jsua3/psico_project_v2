import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, inject, input, output } from '@angular/core';

import { UiButton } from '../../shared/ui/button/ui-button';
import { DRAFT_COPY } from './draft-copy';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { PlaceCandidate, PlaceKind } from './world-places.util';

const KIND_LABELS: Record<PlaceKind, string> = { person: 'Persona', door: 'Puerta', object: 'Objeto' };

/**
 * «Ir a…» (plan visual F6-11; VD-19, borrador de Psicología): la lista de personas y puertas de la sala y de lo ya
 * examinado, para llegar a ellas SIN mirar el lienzo y sin ratón (H-06). Es modal: el resto del juego queda inerte.
 * Como el panel de diálogo y la bitácora lleva SU «Salida segura» (REGLA-004: un solo botón operable en cada estado) y
 * Esc la cierra y consume la pulsación, así que no llega a la cadena del juego que pausa. Presentacional: solo emite;
 * quien la aloja camina hasta el destino y anuncia la llegada.
 */
@Component({
  selector: 'app-world-places-list',
  standalone: true,
  imports: [A11yModule, SafeExitButtonComponent, UiButton],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="places" role="dialog" aria-modal="true" aria-labelledby="places-title" cdkTrapFocus>
      <header class="places__head">
        <h2 id="places-title">{{ copy.title }}</h2>
      </header>

      @if (places().length > 0) {
        <p class="places__hint">{{ copy.hint }}</p>
        <ul class="places__list">
          @for (place of places(); track place.key) {
            <li>
              <button type="button" class="places__item" (click)="choose.emit(place)">
                <span class="places__kind">{{ kindLabel(place.kind) }}</span>{{ ' ' }}<span class="places__name">{{ place.label }}</span>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="places__empty">{{ emptyText }}</p>
      }

      <footer class="places__foot">
        <app-safe-exit-button data-hide-key [pausing]="pausing()" (pause)="safeExit.emit()" />
        <button ui-button variant="secondary" type="button" (click)="closed.emit()">Cerrar</button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: contents; }
    .places {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: var(--ds-z-modal);
      transform: translate(-50%, -50%);
      width: min(520px, 94vw);
      max-height: min(560px, 86vh);
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--ds-border-strong);
      border-radius: var(--ds-radius-lg);
      background: var(--ds-surface-1);
      box-shadow: var(--ds-shadow-e3);
      color: var(--ds-text-1);
    }
    .places__head h2 { margin: 0; font-size: var(--ds-type-lead-size); color: var(--ds-text-1); }
    .places__hint, .places__empty {
      margin: 0; color: var(--ds-text-2);
      font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line);
    }
    .places__list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .places__item {
      display: flex;
      align-items: baseline;
      gap: 10px;
      width: 100%;
      min-height: var(--ds-target-min);
      padding: 8px 12px;
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
      background: var(--ds-surface-2);
      color: var(--ds-text-1);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    @media (hover: hover) and (pointer: fine) {
      .places__item:hover { border-color: var(--ds-primary); }
    }
    .places__item:active { transform: translateY(1px); }
    .places__kind {
      flex-shrink: 0;
      min-width: 64px;
      color: var(--ds-text-2);
      font-size: var(--ds-type-caption-size);
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .places__name { min-width: 0; overflow-wrap: anywhere; font-weight: 700; }
    .places__foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    @media (prefers-reduced-motion: reduce) {
      .places__item:active { transform: none; }
    }
  `],
})
export class WorldPlacesListComponent {
  /** Lo que se ofrece (ya filtrado por `selectPlaces`: personas, puertas y objetos examinados). */
  readonly places = input<readonly PlaceCandidate[]>([]);
  /** Hay una salida segura pedida que espera: el botón «Salida segura» dice «Pausando…». */
  readonly pausing = input(false);
  readonly choose = output<PlaceCandidate>();
  readonly closed = output<void>();
  /** Pausa reanudable pedida desde aquí (REGLA-004): quien la aloja llama a la salida segura real. */
  readonly safeExit = output<void>();

  protected readonly copy = { title: DRAFT_COPY.placesDialog.title ?? 'Ir a…', hint: DRAFT_COPY.placesDialog.text };
  protected readonly emptyText = DRAFT_COPY.placesEmpty.text;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // El foco entra a la lista: el primer lugar (o «Cerrar» si no hay ninguno). El CDK ya atrapa el foco dentro.
    afterNextRender(() => {
      const first = this.host.nativeElement.querySelector<HTMLElement>('.places__item, .places__foot button.ui-button');
      first?.focus();
    }, { injector: inject(Injector) });
  }

  protected kindLabel(kind: PlaceKind): string {
    return KIND_LABELS[kind];
  }

  /**
   * Esc la cierra y consume la pulsación: `document` la recibe antes que el `window:keydown` de la pantalla de juego,
   * que ve `defaultPrevented` y no pausa (el segundo Esc, ya sin lista, sí).
   */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.closed.emit();
  }
}
