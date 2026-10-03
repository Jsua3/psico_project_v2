import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';

import { ORIENTATION_COPY } from './orientation.config';
import {
  OptionalEntry,
  SceneLogGroup,
  SceneLogState,
  SceneLogStep,
  StepState,
  pendingStepCount,
} from './scene-checklist.util';

let nextChecklistId = 0;

/**
 * Tarjeta «Qué hacer» (F§4.2, F§6.4). Presentacional: pinta un `SceneLogState` ya derivado y no
 * calcula nada del mundo. Va DENTRO del envoltorio `.objective-card` de la pantalla de juego (que
 * aporta la posición, el borde y el fondo), por eso no pinta superficie propia.
 *
 * Accesibilidad:
 * - `<section>` con nombre y un `<ol>` por tramo de sala. Las filas NO son botones (los e2e buscan
 *   `getByRole('button', { name: /familia en crisis/i })`): cada una empieza con un texto oculto de
 *   estado («Hecho:», «Siguiente:», «Pendiente:», «Bloqueado hasta:») y una marca con FORMA distinta
 *   (disco con flecha, anillo con visto, anillo vacío, candado); nunca solo color.
 * - Una única región `aria-live="polite"` para la nota («Obtuviste…», «Anotado…», «Decisión k
 *   registrada»). Está siempre en el DOM para que el cambio se anuncie; plegada se oculta a la vista.
 * - «Ocultar pasos» / «Mostrar pasos» (con `aria-expanded`) y, en compacto, el chip plegado
 *   `Qué hacer · {n}`. Su nombre accesible contiene el texto visible (WCAG 2.5.3).
 *
 * Sin temporizadores ni animación: nada se cierra solo. Un paso nuevo de etapa reabre la tarjeta
 * salvo en compacto, donde no se abre sola (tapa el mundo) y marca un punto en el chip.
 * Orienta proceso y lugar: no recibe ni muestra nada sobre las opciones de decisión.
 */
@Component({
  selector: 'app-scene-checklist-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { '[attr.data-collapsed]': 'state() ? !expanded() : null' },
  template: `
    @if (state(); as s) {
      <section class="checklist" [attr.aria-label]="copy.title"
        [class.checklist--static]="reduceMotion()"
        [class.checklist--compact]="compact()"
        [attr.data-next-step]="s.next?.stepId ?? null"
        [attr.data-next-room]="s.next?.room ?? null"
        [attr.data-stage]="s.number > 0 ? s.number : null"
        [attr.data-expanded]="expanded()">

        @if (compact() && !expanded()) {
          <button type="button" class="checklist__chip" data-checklist-toggle (click)="toggle()">
            <span class="checklist__chip-label">{{ copy.chip(pendingCount()) }}</span>
            <span class="visually-hidden">{{ pendingText() }}</span>
            @if (news()) {
              <span class="checklist__dot" aria-hidden="true"></span>
            }
          </button>
        } @else {
          <div class="checklist__head">
            <h2 class="checklist__title">{{ copy.title }}</h2>
            @if (s.number > 0) {
              <span class="checklist__counter">{{ copy.counter(s.number, s.total) }}</span>
            }
            <button type="button" class="checklist__toggle" data-checklist-toggle
              [attr.aria-expanded]="expanded()" (click)="toggle()">{{ expanded() ? copy.hide : copy.show }}</button>
          </div>
        }

        <div class="checklist__scroll"
          [class.checklist__scroll--limited]="compact() && expanded()"
          [attr.tabindex]="compact() && expanded() ? 0 : null"
          [attr.role]="compact() && expanded() ? 'region' : null"
          [attr.aria-label]="compact() && expanded() ? 'Pasos de la etapa' : null">
          @if (expanded()) {
            <p class="checklist__stage">{{ s.title }}</p>
            @if (s.intro) {
              <p class="checklist__intro">{{ s.intro }}</p>
            }
          }

          <p class="checklist__note" aria-live="polite" aria-atomic="true"
            [class.visually-hidden]="!expanded() || !notice()">{{ notice() }}</p>

          @if (expanded()) {
            @for (group of s.groups; track $index) {
              @if (group.collapsed) {
                <details class="checklist__group checklist__group--collapsed">
                  <summary class="checklist__summary">
                    <svg class="checklist__chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>{{ groupHeader(group) ?? copy.earlierSteps }}</span>
                  </summary>
                  <ng-container *ngTemplateOutlet="stepsTpl; context: { $implicit: group }" />
                </details>
              } @else {
                <div class="checklist__group">
                  @if (groupHeader(group); as header) {
                    <h3 class="checklist__room">{{ header }}</h3>
                  }
                  <ng-container *ngTemplateOutlet="stepsTpl; context: { $implicit: group }" />
                </div>
              }
            }

            @if (s.footer) {
              <p class="checklist__footer">{{ s.footer }}</p>
            }

            @if (s.optional.length) {
              <details class="checklist__optional">
                <summary class="checklist__summary">
                  <svg class="checklist__chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span>{{ copy.optionalTitle }} ({{ s.optional.length }})</span>
                </summary>
                <ul class="checklist__optional-list">
                  @for (entry of s.optional; track entry.key) {
                    <li class="checklist__optional-item">{{ entry.label }}@if (markOf(entry); as mark) {<span class="checklist__mark"> · {{ mark }}</span>}</li>
                  }
                </ul>
              </details>
            }
          }
        </div>
      </section>
    }

    <ng-template #stepsTpl let-group>
      <ol class="checklist__steps">
        @for (step of group.steps; track step.id) {
          <li class="step" [attr.data-state]="step.state" [attr.data-step-id]="step.id"
            [class.step--done]="step.state === 'done'"
            [class.step--next]="step.state === 'next'"
            [class.step--pending]="step.state === 'pending'"
            [class.step--locked]="step.state === 'locked'"
            [attr.aria-current]="step.state === 'next' ? 'step' : null">
            <span class="step__mark" aria-hidden="true">
              @switch (step.state) {
                @case ('done') {
                  <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 8.3 7.2 10.5 11 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                }
                @case ('next') {
                  <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                    <circle cx="8" cy="8" r="7" fill="currentColor"/>
                    <path d="M4.5 8h6M8.3 5.3 11 8l-2.7 2.7" fill="none" stroke="#0b0f1a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                }
                @case ('locked') {
                  <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="currentColor"/>
                    <path d="M5.5 7V5.3a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                }
                @default {
                  <svg viewBox="0 0 16 16" width="16" height="16" focusable="false">
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                }
              }
            </span>
            <span class="step__body">
              <span class="visually-hidden">{{ stateText(step.state) }} </span>
              <span class="step__label">{{ step.label }}</span>
              @if (whereOf(step); as where) {
                <span class="step__where"> · {{ where }}</span>
              }
              @if (step.note && step.state !== 'done') {
                <span class="step__note" [class.step__note--reason]="step.state === 'locked'">{{ step.note }}</span>
              }
            </span>
          </li>
        }
      </ol>
    </ng-template>
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .checklist {
      display: grid;
      gap: 6px;
      min-width: 0;
      color: rgba(232,240,244,.92);
    }
    .checklist__head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
    .checklist__title {
      margin: 0;
      font-size: .78rem;
      font-weight: 900;
      letter-spacing: .06em;
      color: #cdbcff;
    }
    .checklist__counter {
      padding: 1px 8px;
      border: 1px solid rgba(182,156,255,.4);
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      white-space: nowrap;
      color: rgba(232,240,244,.92);
    }

    /* Plegar y desplegar: objetivo de 32 px (mínimo AA 24) con zona de toque ampliada a 44 px. */
    .checklist__toggle,
    .checklist__chip {
      position: relative;
      box-sizing: border-box;
      min-width: 44px;
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid rgba(182,156,255,.7);
      border-radius: 8px;
      background: transparent;
      color: #e8f0f4;
      font: inherit;
      font-size: .75rem;
      font-weight: 800;
      cursor: pointer;
      transition: border-color 150ms ease, background-color 150ms ease;
    }
    .checklist__toggle { margin-left: auto; }
    .checklist__toggle::after,
    .checklist__chip::after { content: ''; position: absolute; inset: -6px -2px; }
    /* El chip se sostiene solo: lleva su propio fondo oscuro porque el envoltorio de la pantalla de
       juego puede quitarle el suyo al plegarse y el texto claro no se lee sobre un mapa claro. */
    .checklist__chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      background: rgba(8,12,18,.92);
    }
    .checklist__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #cdbcff;
      box-shadow: 0 0 0 2px rgba(8,12,18,.9);
    }
    .checklist__toggle:focus-visible,
    .checklist__chip:focus-visible,
    .checklist__summary:focus-visible,
    .checklist__scroll:focus-visible { outline: 2px solid #c9b3ff; outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) {
      .checklist__toggle:hover { border-color: rgba(182,156,255,.85); background: rgba(124,77,255,.18); }
      .checklist__chip:hover { border-color: rgba(182,156,255,.85); background: #1d1738; }
    }
    .checklist--static .checklist__toggle,
    .checklist--static .checklist__chip { transition: none; }
    @media (prefers-reduced-motion: reduce) {
      .checklist__toggle,
      .checklist__chip { transition: none; }
    }

    .checklist__scroll { display: grid; gap: 6px; min-width: 0; }
    .checklist__scroll--limited { max-height: min(32vh, 132px); overflow-y: auto; overscroll-behavior: contain; }
    .checklist__stage { margin: 0; font-size: .75rem; font-weight: 800; color: rgba(232,240,244,.78); }
    .checklist__intro { margin: 0; font-size: .78rem; line-height: 1.4; color: rgba(232,240,244,.88); }
    .checklist__note {
      margin: 0;
      padding: 2px 8px;
      border-left: 2px solid #cdbcff;
      font-size: .78rem;
      line-height: 1.35;
      font-weight: 700;
      color: #f4f7fb;
    }

    .checklist__group { display: grid; gap: 3px; min-width: 0; }
    .checklist__room { margin: 4px 0 0; font-size: .75rem; font-weight: 800; color: #cdbcff; }
    .checklist__steps { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }

    .step {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 7px;
      padding: 2px 6px 2px 4px;
      border-left: 2px solid transparent;
      border-radius: 6px;
      font-size: .78rem;
      line-height: 1.35;
      color: rgba(232,240,244,.92);
    }
    .step__mark { display: grid; place-items: center; height: 17px; color: rgba(232,240,244,.78); }
    .step__body { min-width: 0; overflow-wrap: anywhere; }
    .step__where { color: rgba(232,240,244,.78); font-size: .75rem; }
    .step__note { display: block; margin-top: 1px; font-size: .75rem; color: rgba(232,240,244,.78); }
    .step--done { color: rgba(232,240,244,.74); }
    .step--done .step__mark { color: rgba(232,240,244,.74); }
    .step--pending .step__mark { color: rgba(232,240,244,.78); }
    .step--next {
      border-left-color: #cdbcff;
      background: rgba(124,77,255,.16);
      color: #f4f7fb;
      font-weight: 700;
    }
    .step--next .step__mark { color: #cdbcff; }
    .step--next .step__where { color: rgba(232,240,244,.88); }
    .step--locked { border-left: 2px dashed rgba(232,240,244,.5); color: rgba(232,240,244,.78); }
    .step--locked .step__mark { color: rgba(232,240,244,.8); }
    .step__note--reason { font-style: italic; }

    .checklist__footer { margin: 2px 0 0; font-size: .75rem; line-height: 1.35; color: rgba(232,240,244,.78); }

    .checklist__summary {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      font-size: .75rem;
      font-weight: 800;
      color: rgba(232,240,244,.9);
      cursor: pointer;
      list-style: none;
    }
    .checklist__summary::-webkit-details-marker { display: none; }
    .checklist__chevron { flex-shrink: 0; }
    details[open] > .checklist__summary .checklist__chevron { transform: rotate(90deg); }
    .checklist__optional-list { margin: 0; padding: 0 0 0 18px; display: grid; gap: 2px; list-style: none; }
    .checklist__optional-item { font-size: .75rem; line-height: 1.35; color: rgba(232,240,244,.88); }
    .checklist__mark { color: rgba(232,240,244,.78); }
  `],
})
export class SceneChecklistCardComponent {
  /** Estado derivado de la lista; `null` = no hay nada que mostrar (la tarjeta no pinta nada). */
  readonly state = input<SceneLogState | null>(null);
  /** Pantalla baja o táctil horizontal: la tarjeta arranca plegada a un chip. */
  readonly compact = input(false);
  /** Movimiento reducido: sin transiciones (la tarjeta ya no tiene animación alguna). */
  readonly reduceMotion = input(false);
  /** Nota de la región viva: «Obtuviste…», «Anotado…», «Decisión k registrada». */
  readonly notice = input<string | null>(null);

  /** El estudiante plegó o desplegó la tarjeta (true = desplegada). */
  readonly expandedChange = output<boolean>();

  protected readonly copy = {
    ...ORIENTATION_COPY.card,
    earlierSteps: 'Pasos anteriores',
  };

  /**
   * Desplegada por defecto salvo en compacto. Cambiar de modalidad vuelve al valor por defecto;
   * una etapa nueva reabre la tarjeta, salvo en compacto (no se abre sola: tapa el mundo).
   */
  readonly expanded = linkedSignal<{ compact: boolean; stage: number | null }, boolean>({
    source: () => ({ compact: this.compact(), stage: this.state()?.number ?? null }),
    computation: (source, previous) => {
      if (!previous) return !source.compact;
      if (previous.source.compact !== source.compact) return !source.compact;
      if (previous.source.stage !== source.stage && source.stage !== null && !source.compact) return true;
      return previous.value;
    },
  });

  /** Marca de «hay una etapa nueva» sobre el chip plegado (compacto). */
  protected readonly news = signal(false);

  protected readonly pendingCount = computed(() => pendingStepCount(this.state()));

  protected readonly pendingText = computed(() => {
    const n = this.pendingCount();
    const base = n === 1 ? 'paso pendiente' : 'pasos pendientes';
    const text = n > 0 ? ` ${base}` : '';
    return this.news() ? `${text}. Nueva etapa` : text;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private lastStage: number | null | undefined = undefined;

  constructor() {
    effect(() => {
      if (!this.state() || !this.expanded() || !this.compact()) return;
      afterNextRender(() => this.revealNextStep(), { injector: this.injector });
    });
    effect(() => {
      const stage = this.state()?.number ?? null;
      untracked(() => {
        const changed = this.lastStage !== undefined && this.lastStage !== null && stage !== null && stage !== this.lastStage;
        if (changed && this.compact() && !this.expanded()) this.news.set(true);
        this.lastStage = stage;
      });
    });
  }

  /**
   * En compacto la lista es corta y se desplaza por dentro: al abrirla o cambiar de paso se acerca
   * el siguiente a la vista, sin animación y sin tocar el desplazamiento de la página.
   */
  private revealNextStep(): void {
    const root = this.host.nativeElement;
    const scroller = root.querySelector<HTMLElement>('.checklist__scroll--limited');
    const next = root.querySelector<HTMLElement>('li.step[aria-current="step"]');
    if (!scroller || !next) return;
    const area = scroller.getBoundingClientRect();
    const row = next.getBoundingClientRect();
    if (row.top < area.top) scroller.scrollTop += row.top - area.top;
    else if (row.bottom > area.bottom) scroller.scrollTop += row.bottom - area.bottom;
  }

  protected toggle(): void {
    const next = !this.expanded();
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.expanded.set(next);
    if (next) this.news.set(false);
    this.expandedChange.emit(next);
    // El chip y el botón «Ocultar pasos» son elementos distintos: sin esto el foco de teclado se
    // perdería al plegar o desplegar. Solo se mueve si estaba dentro de la tarjeta.
    if (hadFocus) {
      afterNextRender(
        () => this.host.nativeElement.querySelector<HTMLElement>('[data-checklist-toggle]')?.focus(),
        { injector: this.injector },
      );
    }
  }

  protected stateText(state: StepState): string {
    return this.copy.stateText[state];
  }

  /** Cabecera del tramo de sala; la sala actual lleva «· estás aquí» (sin repetirlo si ya viene). */
  protected groupHeader(group: SceneLogGroup): string | null {
    if (!group.header) return null;
    return group.current && !group.header.includes('estás aquí')
      ? `${group.header}${this.copy.hereSuffix}`
      : group.header;
  }

  /** Lugar o sala de un paso: el lugar solo se muestra en el siguiente (el resto no recarga la lista). */
  protected whereOf(step: SceneLogStep): string | null {
    const parts: string[] = [];
    if (step.roomLabel) parts.push(step.roomLabel);
    if (step.state === 'next' && step.place) parts.push(step.place);
    return parts.length ? parts.join(' · ') : null;
  }

  /** Marca de «También en esta sala»; solo si sabemos si es persona u objeto cuando hay que decir «hablaste» o «revisaste». */
  protected markOf(entry: OptionalEntry): string | null {
    if (entry.mark !== undefined) return entry.mark;
    if (entry.seen === null) return null;
    if (entry.seen === false) return this.copy.marks.notYet;
    if (entry.kind === 'person') return this.copy.marks.talked;
    if (entry.kind === 'object') return this.copy.marks.reviewed;
    return null;
  }
}
