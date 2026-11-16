import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { EstadoParte, Parte, TipoParte } from './avance-partes';

// El estado va en símbolo y en texto, nunca solo en color.
const SIMBOLO: Record<EstadoParte, string> = { hecha: '✓', 'en-curso': '…', error: '!', pendiente: '○' };
// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
const TEXTO_ESTADO: Record<Exclude<EstadoParte, 'en-curso'>, string> = { hecha: 'Hecha', error: 'Con error', pendiente: 'Pendiente' };
// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
const EN_CURSO: Record<TipoParte, string> = {
  esqueleto: 'Escribiéndose', 'escenas-por-saber': 'Escribiéndose', escena: 'Escribiéndose', reparacion: 'Corrigiéndose', reglas: 'Revisándose',
};

/**
 * Hasta cuándo una parte va a su paso normal. Las de la IA tardan de segundos a un par de minutos (el servidor da una parte por
 * vencida a los 150 s); revisar las reglas no llama a la IA y tarda segundos.
 */
const NORMAL_CON_IA_S = 120;
const NORMAL_SIN_IA_S = 30;
/** Menos que esto se lee «Acaba de empezar», no «Lleva 0 s». */
const RECIEN_EMPEZADA_S = 3;

/** «40 s», «2 min», «2 min 5 s». */
export function textoDuracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  if (s < 60) return `${s} s`;
  const minutos = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${minutos} min ${resto} s` : `${minutos} min`;
}

/**
 * Una fila de la lista de partes de la generación (`<li appParteAvance>`): el símbolo del estado sobre una línea que une las
 * partes, el nombre, el estado en texto, el tiempo que lleva si está en curso (con un indicador de actividad sutil que el
 * movimiento reducido deja quieto) y lo que salió. Lo que la docente puede hacer con un error llega proyectado desde la pantalla.
 * El tiempo no está en ninguna región viva: se ve cambiar, pero no se anuncia.
 */
@Component({
  selector: 'li[appParteAvance]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'parte',
    tabindex: '-1',
    '[attr.data-estado]': 'parte().estado',
    '[attr.data-parte]': 'parte().clave',
  },
  template: `
    <span class="simbolo" aria-hidden="true">{{ simbolo() }}</span>
    <div class="cuerpo">
      <p class="cabeza">
        <span class="nombre">{{ parte().nombre }}</span>
        @if (parte().final) {
          <span class="pildora final">Final</span>
        }
        <span class="pildora estado">{{ textoEstado() }}</span>
      </p>
      @if (textoTiempo(); as tiempo) {
        <p class="tiempo">
          <span class="actividad" aria-hidden="true"><span></span><span></span><span></span></span>
          <span>{{ tiempo }}</span>
        </p>
      }
      @if (parte().detalle) {
        <p class="detalle">{{ parte().detalle }}</p>
      }
      @if (parte().faltas.length) {
        <ul class="faltas">
          @for (falta of parte().faltas; track $index) {
            <li>{{ falta }}</li>
          }
        </ul>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      grid-template-columns: 2rem minmax(0, 1fr);
      column-gap: 0.875rem;
      padding: 0.75rem;
      border: 2px solid transparent;
      border-radius: var(--radio-control);
      container-type: inline-size;
    }
    /* La línea que une las partes pasa por detrás de los símbolos (que van posicionados y después en el orden). */
    :host::before {
      content: '';
      position: absolute;
      inset-block: 0;
      inset-inline-start: calc(0.75rem + 1rem - 1px);
      inline-size: 2px;
      background: var(--linea);
    }
    :host(:first-child)::before { inset-block-start: 1.75rem; }
    :host(:last-child)::before { inset-block-end: calc(100% - 1.75rem); }
    :host(:only-child)::before { display: none; }
    :host(:focus) { outline: none; }
    :host(:focus-visible) { outline: 3px solid var(--foco); outline-offset: 2px; }

    .simbolo {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 2rem;
      block-size: 2rem;
      border: 2px solid var(--borde-control);
      border-radius: 999px;
      background: var(--superficie);
      color: var(--texto-secundario);
      font-size: var(--autoria-texto-16);
      font-weight: 700;
      line-height: 1;
    }
    .cuerpo { display: flex; flex-direction: column; gap: 0.25rem; min-inline-size: 0; padding-block-start: 0.125rem; }
    .cuerpo p { margin: 0; }
    .cabeza { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; }
    .nombre {
      flex: 1 1 14rem;
      min-inline-size: 0;
      font-size: var(--autoria-texto-18);
      font-weight: 700;
      line-height: 1.75rem;
      overflow-wrap: anywhere;
    }
    .pildora { flex: none; }
    /* El estado ocupa siempre el mismo ancho: pasar de «Pendiente» a «Escribiéndose» no mueve el nombre. */
    .estado { justify-content: center; min-inline-size: 9.5rem; }
    @container (max-width: 30rem) {
      .nombre { flex-basis: 100%; }
      .estado { min-inline-size: 0; }
    }
    .tiempo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--primario-oscuro);
      font-size: var(--autoria-texto-16);
      font-weight: 600;
      line-height: 1.5rem;
      font-variant-numeric: tabular-nums;
    }
    .detalle, .faltas { font-size: var(--autoria-texto-16); line-height: 1.5rem; overflow-wrap: anywhere; }
    .detalle { color: var(--texto-secundario); }
    .faltas { margin: 0; padding-inline-start: 1.25rem; color: var(--tinta); }

    /* Actividad: tres puntos que se encienden por turnos con curvas de 240 ms. Con movimiento reducido quedan quietos. */
    .actividad { display: inline-flex; gap: 0.25rem; flex: none; }
    .actividad span {
      inline-size: 0.375rem;
      block-size: 0.375rem;
      border-radius: 999px;
      background: var(--primario);
      opacity: 0.3;
      animation: progress-actividad 1200ms var(--ds-ease-out) infinite;
    }
    .actividad span:nth-child(2) { animation-delay: 200ms; }
    .actividad span:nth-child(3) { animation-delay: 400ms; }
    @keyframes progress-actividad {
      0%, 40%, 100% { opacity: 0.3; }
      20% { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .actividad span { animation: none; opacity: 1; }
    }

    :host([data-estado='hecha']) .simbolo { border-color: var(--adecuada-borde); background: var(--adecuada-tinte); color: var(--adecuada); }
    :host([data-estado='hecha']) .estado { border-color: var(--adecuada-borde); background: var(--adecuada-tinte); color: var(--adecuada); }

    :host([data-estado='en-curso']) { border-color: var(--primario); background: var(--primario-tinte); }
    :host([data-estado='en-curso']) .simbolo { border-color: var(--primario); background: var(--primario); color: var(--sobre-primario); }
    :host([data-estado='en-curso']) .estado { border-color: var(--primario); background: var(--superficie); color: var(--primario-oscuro); }

    :host([data-estado='error']) { border-color: var(--peligro); background: var(--peligro-tinte); }
    :host([data-estado='error']) .simbolo { border-color: var(--peligro); background: var(--peligro); color: var(--sobre-primario); }
    :host([data-estado='error']) .estado { border-color: var(--peligro); background: var(--superficie); color: var(--peligro); }
    :host([data-estado='error']) .detalle { color: var(--peligro); font-weight: 600; }

    :host([data-estado='pendiente']) .nombre { color: var(--texto-secundario); font-weight: 600; }
    :host([data-estado='pendiente']) .estado { color: var(--texto-secundario); }
  `,
})
export class ParteAvanceComponent {
  readonly parte = input.required<Parte>();
  /** Segundos que lleva en curso, según el reloj de esta pantalla; `null` si no está en curso. */
  readonly segundos = input<number | null>(null);

  protected readonly simbolo = computed(() => SIMBOLO[this.parte().estado]);
  protected readonly textoEstado = computed(() => {
    const p = this.parte();
    return p.estado === 'en-curso' ? EN_CURSO[p.tipo] : TEXTO_ESTADO[p.estado];
  });

  /** «Lleva 40 s · puede tardar un par de minutos»: cuánto lleva y qué esperar, con honestidad. */
  protected readonly textoTiempo = computed(() => {
    const p = this.parte();
    const s = this.segundos();
    if (p.estado !== 'en-curso' || s === null) return null;
    const conIa = p.tipo !== 'reglas';
    // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
    const lleva = s < RECIEN_EMPEZADA_S ? 'Acaba de empezar' : `Lleva ${textoDuracion(s)}`;
    // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
    const espera = s >= (conIa ? NORMAL_CON_IA_S : NORMAL_SIN_IA_S) ? 'está tardando más de lo normal'
      : conIa ? 'puede tardar un par de minutos' : 'suele tardar unos segundos';
    return `${lleva} · ${espera}`;
  });
}
