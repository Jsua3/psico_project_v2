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
  imports: [KitFigureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (activa()) {
      <!-- La placa de quien reacciona (bloque I1): el mismo marco de pixel que la del diálogo, con su retrato asomado. -->
      <div class="reaction-strip" [style]="arte">
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
    }
  `,
  styles: [`
    :host { display: contents; }
    .reaction-strip {
      --px: 2px; --retrato: 192px;
      /* Capas: la franja va sobre la burbuja de comentario (--capa-burbuja: 55); la pestaña del nombre, sobre la placa. */
      --capa-reaccion: 60; --capa-pestana: 1;
      position: absolute; left: calc(8 * var(--px)); bottom: calc(10 * var(--px)); z-index: var(--capa-reaccion);
      width: min(46em, calc(100% - 16 * var(--px))); display: flex; flex-direction: column; align-items: flex-start;
      color: #f2ecdf; font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 17px; line-height: 1.45;
    }
    @media (min-width: 1800px) { .reaction-strip { --px: 3px; --retrato: 288px; font-size: 20px; } }
    @media (max-width: 560px) { .reaction-strip { --retrato: 96px; font-size: 16px; left: calc(4 * var(--px)); width: calc(100% - 8 * var(--px)); } }
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
      border-image: var(--marco-ficha) 4 / calc(4 * var(--px)) stretch; background-color: #262238;
    }
    .reaction-face { flex: none; }
    .reaction-text { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: calc(3 * var(--px)); padding-top: var(--px); }
    .reaction-line { margin: 0; overflow-wrap: break-word; }
    .reaction-line .acot { font-style: italic; color: #c3bccf; }
    .reaction-hint { align-self: flex-end; font-size: .82em; color: #c3bccf; }
  `],
})
export class ReactionDirectorComponent implements OnDestroy {
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly escenario = input<EscenarioReaccion | null>(null);
  readonly reduceMotion = input(false);
  readonly finished = output<FinReaccion>();

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

  private detener(): void {
    this.token++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    const pendientes = [...this.wakes];
    this.wakes.clear();
    for (const despierta of pendientes) despierta();
  }

  private esperar(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const t = setTimeout(() => { this.timers.delete(t); this.wakes.delete(resolve); resolve(); }, ms);
      this.timers.add(t);
      this.wakes.add(resolve);
    });
  }
}
