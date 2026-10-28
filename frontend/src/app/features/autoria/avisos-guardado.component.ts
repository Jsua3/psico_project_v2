import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, untracked, viewChild,
} from '@angular/core';

import { CasoStore } from './estado/caso.store';
import { FALTA_CLASE } from './estado/persistir';

/**
 * Lo que el docente tiene que saber de cómo va el guardado, en sus palabras:
 *
 * - si el caso está guardándose, ya está guardado, o hay respuestas que solo están en esta pantalla;
 * - si otra persona cambió el caso mientras lo editaba (conflicto): sus cambios siguen a la vista, nada se pierde, y decide
 *   cuándo recargar el caso;
 * - si se rechazó un cambio (se deshizo solo ese cambio) y qué había hecho;
 * - después de recargar, lo que había escrito y no se guardó, para que lo pueda volver a poner.
 *
 * Los avisos de conflicto y de error se traen a la vista y reciben el foco cuando aparecen (no en cada guardado), para que
 * no queden fuera de la pantalla si el docente está más abajo. Sus títulos no son encabezados: el encabezado de la
 * pantalla viene después en la página y los avisos no deben desordenar los niveles.
 */
@Component({
  selector: 'app-avisos-guardado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="estado-guardado texto-secundario" role="status" data-estado-guardado>{{ estado() }}</p>

    @if (store.conflicto(); as conflicto) {
      <section #conflictoAviso class="aviso aviso-conflicto" role="alert" tabindex="-1" aria-labelledby="conflicto-titulo">
        <p class="aviso-titulo" id="conflicto-titulo"><strong>Este caso cambió mientras lo editabas</strong></p>
        <p>{{ conflicto.mensaje }}</p>
        @if (conflicto.sinGuardar.length) {
          <p>Esto es lo que hiciste y falta guardar:</p>
          <ul>
            @for (texto of conflicto.sinGuardar; track $index) { <li>{{ texto }}</li> }
          </ul>
        }
        <p class="texto-secundario">Lo que escribiste sigue en pantalla. Al recargar el caso verás la versión guardada: estos cambios no se aplicarán, pero la lista se queda aquí para que puedas volver a escribirlos.</p>
        <button type="button" class="boton boton-primario" data-accion="recargar-caso" (click)="recargar()">Recargar el caso</button>
      </section>
    }

    @if (store.error(); as error) {
      <section #errorAviso class="aviso aviso-error" role="alert" tabindex="-1">
        <p>{{ error }}</p>
        @if (store.descartado().length) {
          <p>Esto es lo que habías hecho y no se guardó:</p>
          <ul>
            @for (texto of store.descartado(); track $index) { <li>{{ texto }}</li> }
          </ul>
        }
        <button type="button" class="boton" (click)="store.descartarError()">Entendido</button>
      </section>
    }

    @if (store.recuperado().length) {
      <section class="aviso aviso-recuperado" role="status" aria-labelledby="recuperado-titulo">
        <p class="aviso-titulo" id="recuperado-titulo"><strong>Esto no se alcanzó a guardar</strong></p>
        <p>Recargaste el caso y estos cambios tuyos no entraron. Puedes copiarlos y volver a escribirlos donde correspondan.</p>
        <ul>
          @for (texto of store.recuperado(); track $index) { <li>{{ texto }}</li> }
        </ul>
        <button type="button" class="boton" (click)="store.descartarRecuperado()">Ya lo copié</button>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .estado-guardado { margin: 0; padding: 4px 24px; font-size: var(--autoria-texto-16); text-align: right; }
    .aviso { margin: 8px 24px; padding: 12px 16px; border-radius: var(--radio-control); border: 2px solid var(--aviso); background: var(--aviso-tinte); color: var(--tinta); }
    .aviso-titulo { font-size: var(--autoria-texto-18); }
    .aviso p { margin: 0 0 8px; }
    .aviso ul { margin: 0 0 8px; padding-left: 24px; }
    .aviso-error { border-color: var(--peligro); background: var(--peligro-tinte); }
    .aviso-recuperado { border-color: var(--primario); background: var(--primario-tinte); }
  `,
})
export class AvisosGuardadoComponent {
  protected readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  private readonly conflictoAviso = viewChild<ElementRef<HTMLElement>>('conflictoAviso');
  private readonly errorAviso = viewChild<ElementRef<HTMLElement>>('errorAviso');
  private visto = { conflicto: false, error: null as string | null };

  /** Cómo va el guardado, contando las respuestas que solo están en esta pantalla. */
  protected readonly estado = computed(() => {
    if (this.store.guardando()) return 'Guardando tus cambios…';
    if (this.store.conflicto()) return 'Hay cambios sin guardar';
    const pendientes = this.store.sinGuardar();
    const n = pendientes.length;
    if (n === 0) return 'Todo guardado';
    const respuestas = n === 1 ? '1 respuesta' : `${n} respuestas`;
    const donde = n === 1 ? 'solo está' : 'solo están';
    return pendientes.every((p) => p.mensaje === FALTA_CLASE)
      ? `Falta elegir la clase de ${respuestas}: ${donde} en esta pantalla`
      : `Falta completar ${respuestas}: ${donde} en esta pantalla`;
  });

  constructor() {
    effect(() => {
      const conflicto = this.store.conflicto() !== null;
      const error = this.store.error();
      untracked(() => {
        const nuevoConflicto = conflicto && !this.visto.conflicto;
        const nuevoError = error !== null && error !== this.visto.error;
        this.visto = { conflicto, error };
        if (!nuevoConflicto && !nuevoError) return;
        afterNextRender(() => {
          const aviso = (nuevoConflicto ? this.conflictoAviso() : this.errorAviso())?.nativeElement;
          aviso?.focus();
          aviso?.scrollIntoView?.({ block: 'nearest' });
        }, { injector: this.injector });
      });
    });
  }

  protected recargar(): void {
    void this.store.recargar();
  }
}
