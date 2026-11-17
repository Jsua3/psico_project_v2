/**
 * Director de la reacción del personaje tras elegir una respuesta (4.3.3, pasos 2 a 4): encuadre, gesto, cara, frase
 * y etiqueta, en la sala donde ocurrió. Los pasos y sus duraciones salen de `caso/reaccion.ts` (módulo puro); aquí solo
 * se reproducen, se pintan la franja y la frase, y se atiende la tecla de saltar. Esc no se consume: la cadena de Esc
 * del juego (salida segura) sigue mandando (REGLA-004).
 */
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import type { CharacterVisual } from '../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import type { PortraitState } from '../character/kit/kit-engine';
import { type EntradaReaccion, type PasoReaccion, pasosDeReaccion } from './caso/reaccion';
import { tramos } from './caso/ritmo-texto';
import { variablesDeArte } from './dialogo-arte';
import { type Emocion, type Gesto } from './caso/vocabulario';
import { DRAFT_COPY } from './draft-copy';
import { SafeExitButtonComponent } from './safe-exit-button.component';

/** Lo que el director necesita de la escena; lo cumple `GameWorldComponent`. */
export interface EscenarioReaccion {
  frameActors(key: string): void;
  releaseFrame(): void;
  playGesture(key: string, gesto: Gesto): Promise<void>;
  setPersonaState(text: string | null): void;
}

export type FinReaccion = 'completa' | 'saltada' | 'cancelada';

@Component({
  selector: 'app-reaction-director',
  imports: [KitFigureComponent, SafeExitButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (activa()) {
      <!-- La franja ocupa la banda de abajo, como el cuadro del diálogo: el pie queda oculto mientras dura y «Salida segura»
           va aquí, a su derecha (REGLA-004: siempre a la vista; Esc sigue pausando por la cadena del juego). -->
      <!-- V6 (accesibilidad, WCAG 2.2.1/2.2.2): con el foco del teclado dentro o el puntero encima, la franja no avanza sola;
           al soltar sigue con el tiempo que le quedaba. -->
      <div class="reaction-dock" [style]="arte" (focusin)="sostener('foco', true)" (focusout)="soltarFoco($event)"
        (mouseenter)="sostener('puntero', true)" (mouseleave)="sostener('puntero', false)">
      <!-- La placa de quien reacciona (bloque I1): el mismo marco de pixel que la del diálogo, con su retrato asomado. -->
      <div class="reaction-strip">
        <span class="reaction-name">{{ quien().nombre }}</span>
        <div class="reaction-body">
          @if (quien().visual; as visual) {
            <div class="reaction-portrait"><app-kit-figure class="reaction-face" [visual]="visual" [portrait]="portrait()" [scale]="escalaRetrato" /></div>
          }
          <div class="reaction-text">
            @if (frase(); as texto) {
              <p class="reaction-line">@for (t of tramosDe(texto); track $index) {<span [class.acot]="t.acotacion">{{ t.texto }}</span>}</p>
            }
            <span class="reaction-hint" aria-hidden="true">{{ hint }}</span>
          </div>
        </div>
      </div>
      <app-safe-exit-button class="reaction-exit" variante="placa" [pausing]="pausing()" (pause)="safeExit.emit()" />
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .reaction-dock {
      --px: 2px; --retrato: 192px;
      /* Capas: la franja va sobre la burbuja de comentario (--capa-burbuja: 55); la pestaña del nombre, sobre la placa. */
      --capa-reaccion: 60; --capa-pestana: 1;
      position: absolute; left: calc(8 * var(--px)); right: calc(8 * var(--px)); bottom: calc(10 * var(--px)); z-index: var(--capa-reaccion);
      display: flex; align-items: flex-end; gap: calc(6 * var(--px)); pointer-events: none;
    }
    .reaction-dock > * { pointer-events: auto; }
    .reaction-exit { flex: none; }
    .reaction-strip {
      flex: 0 1 46em; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;
      color: #f2ecdf; font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 17px; line-height: 1.45;
    }
    @media (min-width: 1800px) { .reaction-dock { --px: 3px; --retrato: 288px; } .reaction-strip { font-size: 20px; } }
    /* Teléfono: la franja a todo lo ancho y «Salida segura» encima, a la derecha. */
    @media (max-width: 560px) {
      .reaction-dock { --retrato: 96px; left: calc(4 * var(--px)); right: calc(4 * var(--px)); flex-direction: column-reverse; align-items: flex-end; }
      .reaction-strip { font-size: 16px; flex-basis: auto; align-self: stretch; }
    }
    .reaction-name, .reaction-body, .reaction-portrait {
      border-style: solid; border-width: calc(4 * var(--px)); border-radius: 0; image-rendering: pixelated;
      background-clip: padding-box; background-origin: padding-box; background-size: calc(8 * var(--px));
    }
    .reaction-name {
      position: relative; z-index: var(--capa-pestana); margin: 0 0 calc(-1 * var(--px)) calc(var(--retrato) + 18 * var(--px));
      border-bottom-width: 0; border-image: var(--marco-rotulo) 4 / calc(4 * var(--px)) stretch;
      background-color: #1b1826; background-image: var(--trama-placa);
      padding: 1px calc(4 * var(--px)) calc(2 * var(--px));
      font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; font-size: 1.1em; line-height: 1.2; color: #ffcd82;
    }
    .reaction-body {
      position: relative; align-self: stretch; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(3 * var(--px)) calc(4 * var(--px));
      border-image: var(--marco-placa) 4 / calc(4 * var(--px)) stretch; background-color: #1b1826; background-image: var(--trama-placa);
    }
    .reaction-body::after {
      content: ''; position: absolute; left: calc(-2 * var(--px)); right: calc(-2 * var(--px)); bottom: calc(-6 * var(--px));
      height: calc(2 * var(--px)); background-image: var(--sombra); background-size: calc(2 * var(--px)); image-rendering: pixelated;
    }
    .reaction-portrait {
      align-self: end; margin-top: calc(-14 * var(--px)); line-height: 0;
      border-image: var(--marco-ficha) 4 / calc(4 * var(--px)) stretch; background-color: #6c6589;
    }
    .reaction-face { flex: none; }
    .reaction-text { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: calc(3 * var(--px)); padding-top: var(--px); }
    .reaction-line { margin: 0; overflow-wrap: break-word; }
    .reaction-line .acot { font-style: italic; color: #c3bccf; }
    .reaction-hint { align-self: flex-end; margin-top: auto; font-size: .82em; color: #c3bccf; }
  `],
})
export class ReactionDirectorComponent implements OnDestroy {
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly escenario = input<EscenarioReaccion | null>(null);
  readonly reduceMotion = input(false);
  /** La pausa ya está pedida: «Salida segura» dice «Pausando…» (la misma regla que el pie y el cuadro). */
  readonly pausing = input(false);
  readonly finished = output<FinReaccion>();
  /** Quien juega pulsó «Salida segura» en la franja: el anfitrión pausa como desde el pie (REGLA-004). */
  readonly safeExit = output<void>();

  protected readonly hint = DRAFT_COPY.reactionSkipHint.text;
  /** El arte de pixel de la interfaz de diálogo, como variables CSS. */
  protected readonly arte = variablesDeArte('noche');
  /** El retrato a ×6 (192 px, múltiplo de 96: sirve también para un retrato fino) y a ×3 en pantallas angostas. */
  protected readonly escalaRetrato = typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 560px)')?.matches ?? false) ? 3 : 6;
  protected readonly tramosDe = tramos;
  private readonly _activa = signal(false);
  readonly activa = this._activa.asReadonly();
  protected readonly quien = signal<{ nombre: string; visual: CharacterVisual | null }>({ nombre: '', visual: null });
  protected readonly emocion = signal<Emocion>('neutral');
  protected readonly frase = signal<string | null>(null);
  /** La cara pedida si el personaje la tiene; si no, la neutra. */
  protected readonly portrait = computed<PortraitState>(() => {
    const visual = this.quien().visual;
    return visual && !(this.emocion() in visual.portraits) ? 'neutral' : this.emocion();
  });

  private pasos: PasoReaccion[] = [];
  private token = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private wakes = new Set<() => void>();
  /** Esperas en curso con lo que les queda: se congelan mientras la franja está sostenida (foco o puntero). */
  private esperas = new Set<{ resolve: () => void; restante: number; desde: number; t: ReturnType<typeof setTimeout> | null }>();
  private sostenidaPor = new Set<'foco' | 'puntero'>();
  private anunciada = false;
  private framed = false;

  play(entrada: EntradaReaccion, quien: { nombre: string; visual: CharacterVisual | null }): void {
    this.detener();
    this.quien.set(quien);
    this.emocion.set('neutral');
    this.frase.set(null);
    this.anunciada = false;
    this.pasos = pasosDeReaccion({ ...entrada, reduceMotion: entrada.reduceMotion || this.reduceMotion() });
    const token = ++this.token;
    this._activa.set(true);
    void this.correr(token);
  }

  /** Corta sin emitir `completa`: suelta el encuadre y quita el gesto; la pantalla sigue con lo suyo. */
  cancel(): void {
    if (!this._activa()) return;
    this.detener();
    this.cerrar();
    this.finished.emit('cancelada');
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this._activa() || (event.key !== 'Enter' && event.key !== ' ')) return;
    // REGLA-004: con el foco en un control («Salida segura» de la franja, la ficha…), Enter y Espacio son de ese control.
    const target = event.target as Element | null;
    if (target?.closest?.('button, a[href], input, select, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    if (event.repeat) return;
    this.detener();
    this.aplicarFinal();
    this.cerrar();
    this.finished.emit('saltada');
  }

  ngOnDestroy(): void {
    this.detener();
  }

  private async correr(token: number): Promise<void> {
    const escena = this.escenario();
    for (const paso of this.pasos) {
      if (token !== this.token) return;
      switch (paso.tipo) {
        case 'encuadrar':
          this.framed = true;
          escena?.frameActors(paso.objectKey);
          await this.esperar(paso.ms);
          break;
        case 'gesto':
          await Promise.race([escena ? escena.playGesture(paso.objectKey, paso.gesto) : Promise.resolve(), this.esperar(paso.ms)]);
          break;
        case 'cara':
          this.emocion.set(paso.emocion);
          break;
        case 'frase':
          this.mostrarFrase(paso.texto);
          await this.esperar(paso.ms);
          break;
        case 'etiqueta':
          escena?.setPersonaState(paso.texto);
          await this.esperar(paso.ms);
          break;
      }
    }
    if (token !== this.token) return;
    this.cerrar();
    this.finished.emit('completa');
  }

  /** El salto: cara, frase y etiqueta finales de golpe. */
  private aplicarFinal(): void {
    for (const paso of this.pasos) {
      if (paso.tipo === 'cara') this.emocion.set(paso.emocion);
      else if (paso.tipo === 'frase') this.mostrarFrase(paso.texto);
      else if (paso.tipo === 'etiqueta') this.escenario()?.setPersonaState(paso.texto);
    }
  }

  private mostrarFrase(texto: string): void {
    this.frase.set(texto);
    if (this.anunciada) return;
    this.anunciada = true;
    const { nombre } = this.quien();
    this.announcer.announce(nombre ? `${nombre}: ${texto}` : texto, 'polite');
  }

  private cerrar(): void {
    if (this.framed) this.escenario()?.releaseFrame();
    this.framed = false;
    this._activa.set(false);
  }

  /** ¿La franja está sostenida? (foco del teclado dentro o puntero encima). */
  get sostenida(): boolean {
    return this.sostenidaPor.size > 0;
  }

  /** Sostiene o suelta la franja por `motivo`. Sostenida, ninguna espera corre; al soltar, siguen con lo que les quedaba. */
  sostener(motivo: 'foco' | 'puntero', si: boolean): void {
    const antes = this.sostenida;
    if (si) this.sostenidaPor.add(motivo);
    else this.sostenidaPor.delete(motivo);
    if (antes === this.sostenida) return;
    const ahora = Date.now();
    for (const espera of this.esperas) {
      if (this.sostenida) {
        if (espera.t !== null) { clearTimeout(espera.t); this.timers.delete(espera.t); espera.t = null; }
        espera.restante = Math.max(0, espera.restante - (ahora - espera.desde));
      } else {
        this.programar(espera);
      }
    }
  }

  /** El foco sale de la franja (no a otro control de ella): deja de sostenerla. */
  soltarFoco(evento: FocusEvent): void {
    const dentro = evento.relatedTarget instanceof Node && (evento.currentTarget as HTMLElement | null)?.contains(evento.relatedTarget);
    if (!dentro) this.sostener('foco', false);
  }

  private programar(espera: { resolve: () => void; restante: number; desde: number; t: ReturnType<typeof setTimeout> | null }): void {
    espera.desde = Date.now();
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.esperas.delete(espera);
      this.wakes.delete(espera.resolve);
      espera.resolve();
    }, espera.restante);
    espera.t = t;
    this.timers.add(t);
  }

  private detener(): void {
    this.token++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.esperas.clear();
    this.sostenidaPor.clear();
    const pendientes = [...this.wakes];
    this.wakes.clear();
    for (const despierta of pendientes) despierta();
  }

  private esperar(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const espera = { resolve, restante: ms, desde: Date.now(), t: null as ReturnType<typeof setTimeout> | null };
      this.esperas.add(espera);
      this.wakes.add(resolve);
      // Si ya está sostenida (el foco o el puntero llegaron antes), espera a que la suelten.
      if (!this.sostenida) this.programar(espera);
    });
  }
}
