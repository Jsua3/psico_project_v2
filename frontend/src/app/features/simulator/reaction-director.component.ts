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
      <div class="reaction-strip">
        @if (quien().visual; as visual) {
          <app-kit-figure class="reaction-face" [visual]="visual" [portrait]="portrait()" [scale]="2" />
        }
        <div class="reaction-text">
          <span class="reaction-name">{{ quien().nombre }}</span>
          @if (frase(); as texto) {
            <p class="reaction-line">{{ texto }}</p>
          }
        </div>
        <span class="reaction-hint" aria-hidden="true">{{ hint }}</span>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .reaction-strip {
      position: absolute; left: 0; right: 0; bottom: 0; z-index: 60;
      display: flex; align-items: center; gap: 14px; padding: 12px 16px;
      background: #0f1720; color: #f4f7fa; border-top: 2px solid #3b4a5a;
    }
    .reaction-face { flex: none; }
    .reaction-text { flex: 1; min-width: 0; }
    .reaction-name { display: block; font-weight: 700; font-size: 0.85rem; color: #c9d6e2; }
    .reaction-line { margin: 2px 0 0; font-size: 1rem; line-height: 1.4; }
    .reaction-hint { flex: none; font-size: 0.8rem; color: #c9d6e2; }
  `],
})
export class ReactionDirectorComponent implements OnDestroy {
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly escenario = input<EscenarioReaccion | null>(null);
  readonly reduceMotion = input(false);
  readonly finished = output<FinReaccion>();

  protected readonly hint = DRAFT_COPY.reactionSkipHint.text;
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
  private wake: (() => void) | null = null;
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
    this.announcer.announce(`${this.quien().nombre}: ${texto}`, 'polite');
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
    this.wake?.();
    this.wake = null;
  }

  private esperar(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const t = setTimeout(() => { this.timers.delete(t); this.wake = null; resolve(); }, ms);
      this.timers.add(t);
      this.wake = resolve;
    });
  }
}
