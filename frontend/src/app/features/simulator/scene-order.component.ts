import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, untracked } from '@angular/core';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { NodeEditorState } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { SceneDirection, SceneKind, moveScene, sceneKind, sceneKindLabel, sortScenes } from './scene-order.util';

const KIND_TONE: Record<SceneKind, UiBadgeTone> = { start: 'success', conclusion: 'info', scene: 'neutral' };

interface SceneRow {
  node: NodeEditorState;
  position: number;
  kindLabel: string;
  tone: UiBadgeTone;
  upReason: string | null;
  downReason: string | null;
}

/** Lo que se espera ver tras un movimiento: el orden pedido y qué botón de qué escena recibe el foco al llegar. */
interface PendingMove {
  order: number[];
  nodeId: number;
  direction: SceneDirection;
}

/**
 * «Escenas» del editor de casos (plan visual F10-3†; E3-6, RF-08, RF-09): las escenas del caso en el orden con que se
 * listan, cada una con «Subir» y «Bajar». No hay arrastre: cada movimiento tiene su botón, así que el teclado y el
 * puntero de un solo toque hacen lo mismo (WCAG 2.5.7). Un botón que no puede actuar (la primera no sube, la última no
 * baja, la versión no es un borrador o hay un cambio en curso) sigue en el orden de tabulación y dice por qué. Cuando
 * llega el orden nuevo el foco vuelve al mismo botón de la escena que se movió (Angular mueve los renglones y el
 * navegador suelta el foco de un elemento que cambia de lugar) y se dice dónde quedó. El orden es informativo: no cambia
 * el grafo ni por dónde empieza el caso.
 */
@Component({
  selector: 'app-scene-order',
  imports: [UiBadge, UiEmptyState, UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <p class="so-lead">Este es el orden en que el editor lista las escenas. No cambia el grafo ni por dónde empieza el caso.</p>
      <ol class="so-list" aria-label="Escenas del caso, en orden">
        @for (row of rows(); track row.node.id) {
          <li class="so-item" [attr.data-node-id]="row.node.id">
            <span class="so-position" aria-hidden="true">{{ row.position }}</span>
            <span class="so-text">
              <span class="so-title">{{ row.node.title }}</span>
              <code class="so-key">{{ row.node.key }}</code>
            </span>
            <ui-badge class="so-kind" [tone]="row.tone">{{ row.kindLabel }}</ui-badge>
            <span class="so-actions">
              <button ui-icon-button type="button" icon="arrow_upward" data-move="up"
                [label]="'Subir «' + row.node.title + '»'" [disabledReason]="row.upReason" (click)="move(row.node, 'up')"></button>
              <button ui-icon-button type="button" icon="arrow_downward" data-move="down"
                [label]="'Bajar «' + row.node.title + '»'" [disabledReason]="row.downReason" (click)="move(row.node, 'down')"></button>
              <button ui-icon-button type="button" icon="edit"
                [label]="'Editar «' + row.node.title + '»'" [disabledReason]="lockReason()" (click)="edit.emit(row.node)"></button>
            </span>
          </li>
        }
      </ol>
    } @else {
      <ui-empty-state kind="first-use" title="Aún no hay escenas" description="Crea el primer nodo en el grafo del caso." />
    }
  `,
  styles: [`
    :host { display: block; }
    .so-lead { margin: 0 0 var(--ds-space-4); color: var(--ds-text-2); }
    .so-list { display: grid; gap: var(--ds-space-3); margin: 0; padding: 0; list-style: none; }
    .so-item {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--ds-space-2) var(--ds-space-3);
      padding: var(--ds-space-3) var(--ds-space-4);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
    }
    .so-position { min-inline-size: 1.5rem; color: var(--ds-text-2); font-variant-numeric: tabular-nums; text-align: end; }
    .so-text { display: grid; gap: var(--ds-space-1); min-width: 0; overflow-wrap: anywhere; }
    .so-title { font-weight: var(--ds-type-h3-weight); }
    .so-key { color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); }
    .so-actions { display: flex; align-items: center; gap: var(--ds-space-1); grid-column: 1 / -1; justify-content: flex-end; }
    @media (min-width: 40rem) {
      .so-item { grid-template-columns: auto minmax(0, 1fr) auto auto; }
      .so-actions { grid-column: auto; }
    }
  `],
})
export class SceneOrderComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly nodes = input<NodeEditorState[]>([]);
  /** Por qué el caso no se puede modificar (versión que no es borrador); null si se puede. */
  readonly lockReason = input<string | null>(null);
  /** Hay un cambio en curso: los movimientos esperan (uno a la vez). */
  readonly busy = input(false);
  /** Los ids de TODAS las escenas en el orden pedido. */
  readonly reorder = output<number[]>();
  readonly edit = output<NodeEditorState>();

  private pending: PendingMove | null = null;

  protected readonly rows = computed<SceneRow[]>(() => {
    const ordered = sortScenes(this.nodes());
    const blocked = this.lockReason() ?? (this.busy() ? 'Hay un cambio en curso: espera a que termine.' : null);
    return ordered.map((node, index) => {
      const kind = sceneKind(node);
      return {
        node,
        position: index + 1,
        kindLabel: sceneKindLabel(kind),
        tone: KIND_TONE[kind],
        upReason: blocked ?? (index === 0 ? 'Ya es la primera escena.' : null),
        downReason: blocked ?? (index === ordered.length - 1 ? 'Ya es la última escena.' : null),
      };
    });
  });

  constructor() {
    // Cuando la pantalla deja de estar ocupada, lo que se pidió ya llegó o falló: un movimiento fallido no deja el foco
    // armado para un orden igual que llegue más tarde por otra vía. Se limpia tras pintar (el efecto de abajo corre antes).
    effect(() => {
      if (!this.busy()) untracked(() => afterNextRender(() => { this.pending = null; }, { injector: this.injector }));
    });
    // El orden que se pidió llegó: el foco vuelve al botón de la escena que se movió y se dice dónde quedó.
    effect(() => {
      const ids = this.rows().map(row => row.node.id);
      const wanted = untracked(() => this.pending);
      if (!wanted || ids.length !== wanted.order.length || ids.some((id, index) => id !== wanted.order[index])) return;
      this.pending = null;
      const position = ids.indexOf(wanted.nodeId) + 1;
      const title = this.nodes().find(node => node.id === wanted.nodeId)?.title ?? '';
      afterNextRender(() => {
        this.host.querySelector<HTMLElement>(`[data-node-id="${wanted.nodeId}"] [data-move="${wanted.direction}"]`)?.focus();
        this.announcer.announce(`«${title}» ahora es la escena ${position} de ${ids.length}.`, 'polite');
      }, { injector: this.injector });
    });
  }

  protected move(node: NodeEditorState, direction: SceneDirection): void {
    const order = moveScene(this.nodes(), node.id, direction);
    if (!order) return;
    this.pending = { order, nodeId: node.id, direction };
    this.reorder.emit(order);
  }
}
