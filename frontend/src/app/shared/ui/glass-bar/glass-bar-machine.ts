import { Signal, signal } from '@angular/core';

/**
 * Máquina de estados de la barra de vidrio modular (plan visual F3; /barra-de-vidrio-modular, réplica Recomendada).
 * Traducción del bloque «MÁQUINA DE ESTADOS» de assets/gemela.html, sin DOM: el componente le pasa posiciones,
 * tipos de puntero y teclas, y pinta `data-estado` con lo que derive.
 *
 * - `inicial` si la página está arriba (≤ 8 px) o no es escritorio; si no, `atencion` con el cursor en la franja y
 *   `scroll` sin él. En el tope no hay atención.
 * - Atención por ratón: entra en 0 ms y sale con 280 ms de gracia; un toque (o el ratón sintetizado tras un toque
 *   en un híbrido) nunca la abre por `pointerenter`. Con dedo, un toque en un hueco del módulo central alterna, y
 *   desplazarse más de 24 px o pulsar fuera la suelta.
 * - Modalidad: Tab marca «teclado» (el foco que llega con Tab despliega la barra) y un `pointerdown` marca
 *   «puntero» (el foco que deja un clic no la retiene). Escape suelta la atención salvo en un campo de texto.
 */
export type GlassBarState = 'inicial' | 'scroll' | 'atencion';
export type GlassBarModality = 'puntero' | 'teclado';

export interface GlassBarSignals {
  /** `(hover: hover) and (pointer: fine)`, en vivo. */
  isFinePointer(): boolean;
  /** `(min-width: 64rem)`, en vivo. */
  isDesktop(): boolean;
}

export interface GlassBarTimers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

/** px: desplazado = max(scrollY, 0) > umbral. */
export const GLASS_BAR_THRESHOLD_PX = 8;
/** ms de gracia al salir el ratón de la franja. */
export const GLASS_BAR_GRACE_MS = 280;
/** px: con dedo, desplazarse más que esto desde que se abrió suelta la atención. */
export const GLASS_BAR_FINGER_RELEASE_PX = 24;

const BROWSER_TIMERS: GlassBarTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class GlassBarMachine {
  private readonly stateSignal = signal<GlassBarState>('inicial');
  private readonly modalitySignal = signal<GlassBarModality | null>(null);
  readonly state: Signal<GlassBarState> = this.stateSignal.asReadonly();
  readonly modality: Signal<GlassBarModality | null> = this.modalitySignal.asReadonly();

  private scrolled = false;
  private attending = false;
  private desktop: boolean;
  private closeTimer: unknown = null;
  private scrollY = 0;
  private scrollAtAttend = 0;
  /** El ÚLTIMO puntero que tocó: en un portátil táctil la media dice «ratón» aunque toque un dedo. */
  private lastPointer: string;

  constructor(private readonly signals: GlassBarSignals, private readonly timers: GlassBarTimers = BROWSER_TIMERS) {
    this.desktop = signals.isDesktop();
    this.lastPointer = signals.isFinePointer() ? 'mouse' : 'touch';
  }

  /** Nueva posición de desplazamiento del documento. */
  sync(scrollY: number): void {
    this.scrollY = Math.max(scrollY, 0);
    this.scrolled = this.scrollY > GLASS_BAR_THRESHOLD_PX;
    if (this.attending && this.isFinger() && Math.abs(this.scrollY - this.scrollAtAttend) > GLASS_BAR_FINGER_RELEASE_PX) {
      this.attending = false;
    }
    this.paint();
  }

  pointerDown(pointerType: string): void {
    this.lastPointer = pointerType || 'mouse';
    this.modalitySignal.set('puntero');
  }

  keyDown(key: string, inTextField: boolean): void {
    if (key === 'Tab') this.modalitySignal.set('teclado');
    if (key === 'Escape' && !inTextField) {
      this.attending = false;
      this.paint();
    }
  }

  pointerEnter(pointerType: string): void {
    if (pointerType !== 'mouse') return;
    this.lastPointer = 'mouse';
    if (!this.signals.isFinePointer()) return;
    this.timers.clear(this.closeTimer);
    this.attending = true;
    this.paint();
  }

  pointerLeave(pointerType: string): void {
    if (pointerType !== 'mouse' || !this.signals.isFinePointer()) return;
    this.timers.clear(this.closeTimer);
    this.closeTimer = this.timers.set(() => {
      this.attending = false;
      this.paint();
    }, GLASS_BAR_GRACE_MS);
  }

  /** Clic dentro del módulo central; `onControl` si cayó en un enlace o un botón. */
  tapStrip(onControl: boolean): void {
    if (onControl || !this.isFinger()) return;
    this.attending = !this.attending;
    this.scrollAtAttend = this.scrollY;
    this.paint();
  }

  /** Clic en el documento; `insidePrincipal` si cayó dentro del módulo central. */
  outsideClick(insidePrincipal: boolean): void {
    if (!this.isFinger() || insidePrincipal) return;
    this.attending = false;
    this.paint();
  }

  setDesktop(isDesktop: boolean): void {
    this.desktop = isDesktop;
    this.paint();
  }

  destroy(): void {
    this.timers.clear(this.closeTimer);
  }

  private isFinger(): boolean {
    return this.lastPointer !== 'mouse' || !this.signals.isFinePointer();
  }

  private derive(): GlassBarState {
    if (!this.scrolled || !this.desktop) return 'inicial';
    return this.attending ? 'atencion' : 'scroll';
  }

  private paint(): void {
    this.stateSignal.set(this.derive());
  }
}
