import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
} from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import { MAX_CONTEXTO, MAX_LARGO_OBJETIVO, MAX_OBJETIVOS, objetivosDeTexto, revisarFicha } from '../../modelo/ficha';

/**
 * Datos del caso: lo que el estudiante lee antes de empezar (el contexto) y lo que se espera que logre (los objetivos de
 * aprendizaje). El nombre se elige al crear el caso y aquí solo se lee. El texto se comprueba contra las mismas reglas del
 * sistema (texto plano, topes) antes de guardar y el error se dice en el campo que lo rompe. Se guarda con el botón o al
 * salir de un campo con algo cambiado. Un caso que ya no es un borrador se lee, pero no se cambia.
 */
@Component({
  selector: 'app-datos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina">
        <div>
          <h1>Datos del caso</h1>
          <p class="texto-secundario">Lo que lee el estudiante antes de empezar y lo que se espera que logre al terminar.</p>
        </div>

        @if (soloLectura()) {
          <p class="nota-lectura" role="note">El caso ya no es un borrador: se puede leer, pero no cambiar.</p>
        }

        <form class="tarjeta formulario" novalidate (submit)="guardar($event)">
          <div class="grupo">
            <label for="d-nombre" class="etiqueta">Nombre del caso</label>
            <input id="d-nombre" class="campo" type="text" readonly [value]="caso.titulo" aria-describedby="d-nombre-ayuda" />
            <p id="d-nombre-ayuda" class="texto-secundario ayuda">El nombre se elige al crear el caso.</p>
          </div>

          <div class="grupo">
            <label for="d-contexto" class="etiqueta">Contexto que lee el estudiante</label>
            <p id="d-contexto-ayuda" class="texto-secundario ayuda">Lo que la persona lee antes de empezar. Texto plano, hasta {{ tope(maxContexto) }} caracteres.</p>
            <textarea id="d-contexto" class="campo" rows="8" data-accion="datos-del-caso" [readOnly]="soloLectura()" [value]="contexto()"
                      [attr.aria-invalid]="errores().contexto ? 'true' : null"
                      [attr.aria-describedby]="'d-contexto-ayuda d-contexto-cuenta' + (errores().contexto ? ' d-contexto-error' : '')"
                      (input)="contexto.set($any($event.target).value)" (change)="guardarAlSalir()"></textarea>
            <p id="d-contexto-cuenta" class="texto-secundario ayuda">{{ tope(contexto().length) }} de {{ tope(maxContexto) }} caracteres</p>
            @if (errores().contexto; as error) {
              <p id="d-contexto-error" class="error">{{ error }}</p>
            }
          </div>

          <div class="grupo">
            <label for="d-objetivos" class="etiqueta">Objetivos de aprendizaje</label>
            <p id="d-objetivos-ayuda" class="texto-secundario ayuda">Uno por renglón, hasta {{ maxObjetivos }} objetivos de {{ maxLargoObjetivo }} caracteres cada uno. Los redacta Psicología.</p>
            <textarea id="d-objetivos" class="campo" rows="6" [readOnly]="soloLectura()" [value]="objetivosTexto()"
                      [attr.aria-invalid]="errores().objetivos ? 'true' : null"
                      [attr.aria-describedby]="'d-objetivos-ayuda' + (errores().objetivos ? ' d-objetivos-error' : '')"
                      (input)="objetivosTexto.set($any($event.target).value)" (change)="guardarAlSalir()"></textarea>
            @if (errores().objetivos; as error) {
              <p id="d-objetivos-error" class="error">{{ error }}</p>
            }
          </div>

          <div class="acciones">
            <button type="submit" class="boton boton-primario" [attr.aria-disabled]="soloLectura()" aria-describedby="d-estado">Guardar los datos del caso</button>
            <p id="d-estado" role="status" class="estado" data-estado-datos>{{ estado() }}</p>
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    .pagina > div > p { margin: 4px 0 0; }
    .formulario { display: flex; flex-direction: column; gap: 20px; }
    .grupo { display: flex; flex-direction: column; gap: 6px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-18); }
    .ayuda, .error { margin: 0; font-size: var(--autoria-texto-16); }
    .error { color: var(--peligro); font-weight: 700; }
    .campo { min-height: 48px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 24px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; box-sizing: border-box; }
    textarea.campo { resize: vertical; }
    .campo[aria-invalid='true'] { border-color: var(--peligro); }
    input.campo[readonly] { background: var(--fondo); }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
    .estado { margin: 0; font-weight: 700; }
    .estado:empty { display: none; }
    .nota-lectura { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--primario-tinte); font-weight: 700; }
  `,
})
export class DatosComponent {
  protected readonly store = inject(CasoStore);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly maxContexto = MAX_CONTEXTO;
  protected readonly maxObjetivos = MAX_OBJETIVOS;
  protected readonly maxLargoObjetivo = MAX_LARGO_OBJETIVO;

  /**
   * Lo que se escribe: parte de lo que tiene el caso y vuelve a partir de ahí solo cuando el caso se abre o se relee. Si el
   * sistema no acepta un cambio, el borrador del caso vuelve a lo de antes, pero el campo conserva lo escrito.
   */
  protected readonly contexto = signal('');
  protected readonly objetivosTexto = signal('');
  protected readonly estado = signal('');
  protected readonly soloLectura = computed(() => this.store.soloLectura());
  protected readonly errores = computed(() => revisarFicha(this.contexto(), this.objetivosTexto()));

  constructor() {
    effect(() => {
      this.store.lectura();
      untracked(() => {
        const caso = this.store.caso();
        this.contexto.set(caso?.contexto ?? '');
        this.objetivosTexto.set((caso?.objetivos ?? []).join('\n'));
        this.estado.set('');
      });
    });
  }

  protected tope(n: number): string {
    return n.toLocaleString('es-CO');
  }

  /** ¿Lo escrito es distinto de lo que tiene el caso? */
  private cambiado(): boolean {
    const caso = this.store.caso();
    return this.contexto().trim() !== (caso?.contexto ?? '')
      || JSON.stringify(objetivosDeTexto(this.objetivosTexto())) !== JSON.stringify(caso?.objetivos ?? []);
  }

  /** Al salir de un campo con algo cambiado y sin errores, se guarda; si hay un error se queda marcado y no se mueve el foco. */
  protected guardarAlSalir(): void {
    if (this.soloLectura() || !this.cambiado()) return;
    const errores = this.errores();
    if (errores.contexto || errores.objetivos) {
      this.estado.set('Corrige lo marcado para poder guardar.');
      return;
    }
    void this.enviar();
  }

  /** El botón: si hay un error, el foco va al primer campo que lo tiene; si no, se guarda. */
  protected guardar(evento: Event): void {
    evento.preventDefault();
    if (this.soloLectura()) return;
    const errores = this.errores();
    if (errores.contexto || errores.objetivos) {
      this.estado.set('Corrige lo marcado para poder guardar.');
      afterNextRender(
        () => this.anfitrion.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        { injector: this.injector },
      );
      return;
    }
    void this.enviar();
  }

  private async enviar(): Promise<void> {
    this.store.descartarError();
    this.estado.set('Guardando los datos del caso…');
    this.store.editarFicha(this.contexto(), objetivosDeTexto(this.objetivosTexto()));
    await this.store.sincronizado();
    this.estado.set(this.store.error() ? 'No se pudo guardar. Lo escrito sigue en los campos; revisa el aviso.' : 'Los datos del caso se guardaron.');
  }
}
