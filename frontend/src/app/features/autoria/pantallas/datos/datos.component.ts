import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
} from '@angular/core';

import { UiPortadaCaso } from '../../../../shared/ui/portada-caso/ui-portada-caso';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { CasoStore } from '../../estado/caso.store';
import {
  MAX_CONTEXTO, MAX_LARGO_OBJETIVO, MAX_NOMBRE, MAX_OBJETIVOS, problemaDeNombre, revisarFicha,
} from '../../modelo/ficha';
import { MAX_LARGO_TEMA, MAX_TEMAS, normalizarTemas, problemaDeTema } from '../../modelo/temas-sensibles';

/** Cómo va el guardado de esta pantalla, por la forma del aviso (el color nunca es lo único que lo dice). */
type Situacion = { forma: 'guardando' | 'guardado' | 'error' | 'corregir' | ''; texto: string };

/**
 * Datos del caso: lo que el estudiante lee antes de empezar (el contexto, los objetivos y los temas sensibles) y el nombre.
 * Aquí no hay botón de guardar: el editor es un solo formulario con un solo modelo de guardado, el automático (EDITOR.md
 * §3.3). Cada campo se guarda al salir de él, por la misma cola que todo lo demás, y el estado se dice junto al título y en
 * la barra. Si un valor rompe una regla del sistema (texto plano, topes) no se guarda: el campo lo dice y conserva lo escrito.
 * A la derecha, «Así aparece para el estudiante» se redibuja con cada letra. Un caso que ya no es un borrador se lee, pero no
 * se cambia.
 */
@Component({
  selector: 'app-datos',
  imports: [UiPortadaCaso, AutoAltoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina">
        <div class="cabecera">
          <div>
            <h1>Datos del caso</h1>
            <p class="texto-secundario">Lo que lee el estudiante antes de empezar y lo que se espera que logre al terminar.</p>
          </div>
          <p class="estado" role="status" data-estado-datos [attr.data-forma]="situacion().forma">{{ situacion().texto }}</p>
        </div>

        @if (soloLectura()) {
          <p class="nota-lectura" role="note">El caso ya no es un borrador: se puede leer, pero no cambiar.</p>
        }

        <div class="dos-columnas">
          <form class="formulario" novalidate (submit)="$event.preventDefault()">
            <div class="grupo">
              <label for="d-nombre" class="etiqueta">Nombre del caso</label>
              <input id="d-nombre" class="campo" type="text" autocomplete="off" [readOnly]="soloLectura()" [value]="nombre()"
                     [attr.aria-invalid]="errores().nombre ? 'true' : null"
                     [attr.aria-describedby]="'d-nombre-ayuda' + (errores().nombre ? ' d-nombre-error' : '')"
                     (input)="nombre.set($any($event.target).value)" (change)="guardarAlSalir()" />
              <p id="d-nombre-ayuda" class="texto-secundario ayuda">Así reconocen el caso Psicología y el estudiante. Si ya hay otra versión publicada, el nombre no se puede cambiar.</p>
              @if (errores().nombre; as error) { <p id="d-nombre-error" class="error">{{ error }}</p> }
            </div>

            <div class="grupo">
              <label for="d-contexto" class="etiqueta">Contexto que lee el estudiante</label>
              <p id="d-contexto-ayuda" class="texto-secundario ayuda">Lo que la persona lee antes de empezar. Texto plano, hasta {{ tope(maxContexto) }} caracteres.</p>
              <textarea autoAlto id="d-contexto" class="campo" rows="6" data-accion="datos-del-caso" [readOnly]="soloLectura()" [value]="contexto()"
                        [attr.aria-invalid]="errores().contexto ? 'true' : null"
                        [attr.aria-describedby]="'d-contexto-ayuda d-contexto-cuenta' + (errores().contexto ? ' d-contexto-error' : '')"
                        (input)="contexto.set($any($event.target).value)" (change)="guardarAlSalir()"></textarea>
              <p id="d-contexto-cuenta" class="texto-secundario ayuda">{{ tope(contexto().length) }} de {{ tope(maxContexto) }} caracteres</p>
              @if (errores().contexto; as error) { <p id="d-contexto-error" class="error">{{ error }}</p> }
            </div>

            <fieldset class="grupo conjunto" [attr.aria-describedby]="'d-objetivos-ayuda' + (errores().objetivos ? ' d-objetivos-error' : '')">
              <legend class="etiqueta">Objetivos de aprendizaje</legend>
              <p id="d-objetivos-ayuda" class="texto-secundario ayuda">Hasta {{ maxObjetivos }} objetivos de {{ maxLargoObjetivo }} caracteres cada uno. Los revisa Psicología.</p>
              @if (objetivos().length) {
                <ul class="filas">
                  @for (objetivo of objetivos(); track $index) {
                    <li class="fila">
                      <!-- Un objetivo es una frase: crece con lo escrito, pero Enter no abre otro renglón. -->
                      <textarea autoAlto class="campo" rows="1" [id]="'d-objetivo-' + $index" [readOnly]="soloLectura()" [value]="objetivo"
                                [attr.aria-label]="'Objetivo ' + ($index + 1)"
                                [attr.aria-invalid]="errores().objetivos ? 'true' : null"
                                (keydown.enter)="$event.preventDefault()"
                                (input)="escribirObjetivo($index, $any($event.target).value)" (change)="guardarAlSalir()"></textarea>
                      @if (!soloLectura()) {
                        <button type="button" class="boton boton-texto quitar" [attr.aria-label]="'Quitar el objetivo ' + ($index + 1)" (click)="quitarObjetivo($index)">Quitar</button>
                      }
                    </li>
                  }
                </ul>
              }
              @if (errores().objetivos; as error) { <p id="d-objetivos-error" class="error">{{ error }}</p> }
              @if (!soloLectura()) {
                <button type="button" class="boton agregar" [attr.aria-disabled]="objetivos().length >= maxObjetivos" (click)="agregarObjetivo()">Agregar objetivo</button>
              }
            </fieldset>

            @if (conTemas()) {
              <fieldset class="grupo conjunto" data-accion="temas-sensibles" aria-describedby="d-temas-ayuda">
                <legend class="etiqueta">Temas sensibles del caso</legend>
                <p id="d-temas-ayuda" class="texto-secundario ayuda">Frases cortas que el estudiante lee antes de empezar, como «violencia de pareja». Hasta {{ maxTemas }} temas de {{ maxLargoTema }} caracteres.</p>
                @if (temas().length) {
                  <ul class="fichas">
                    @for (tema of temas(); track tema) {
                      <li class="pildora ficha">
                        <span class="ficha__texto">{{ tema }}</span>
                        @if (!soloLectura()) {
                          <button type="button" class="ficha__quitar" [attr.aria-label]="'Quitar el tema ' + tema" (click)="quitarTema(tema)"><span aria-hidden="true">×</span></button>
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="texto-secundario ayuda">Todavía no hay temas.</p>
                }
                @if (!soloLectura()) {
                  <div class="fila">
                    <label for="d-tema" class="solo-lector">Nuevo tema sensible</label>
                    <input id="d-tema" class="campo" type="text" autocomplete="off" placeholder="Escribe un tema y pulsa Enter" [value]="temaNuevo()"
                           [attr.aria-invalid]="errorTema() ? 'true' : null" [attr.aria-describedby]="errorTema() ? 'd-tema-error' : null"
                           (input)="temaNuevo.set($any($event.target).value)" (keydown.enter)="agregarTema($event)" />
                    <button type="button" class="boton quitar" (click)="agregarTema()">Agregar tema</button>
                  </div>
                  @if (errorTema(); as error) { <p id="d-tema-error" class="error">{{ error }}</p> }
                }
              </fieldset>
            }
          </form>

          <aside class="vista-lateral" aria-labelledby="d-vista">
            <h2 id="d-vista" class="vista-titulo">Así aparece para el estudiante</h2>
            <article class="vista">
              <ui-portada-caso class="vista__portada" [titulo]="nombre()" tamano="tarjeta" />
              <h3 class="vista__nombre">{{ nombre().trim() || 'Sin nombre' }}</h3>
              <p class="vista__contexto" [class.vacio]="!contexto().trim()">{{ contexto().trim() || 'Aquí se verá el contexto cuando lo escribas.' }}</p>
              @if (objetivosVista().length) {
                <h4 class="vista__sub">Lo que vas a practicar</h4>
                <ul class="vista__lista">
                  @for (objetivo of objetivosVista(); track $index) { <li>{{ objetivo }}</li> }
                </ul>
              }
              @if (temas().length) {
                <h4 class="vista__sub">En este caso aparecen</h4>
                <ul class="fichas">
                  @for (tema of temas(); track tema) { <li class="pildora">{{ tema }}</li> }
                </ul>
              }
            </article>
          </aside>
        </div>
      </div>
    }
  `,
  styles: `
    /* Dos columnas desde 1024 px: el formulario en medida de lectura y la vista del estudiante pegada arriba mientras se escribe. */
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
    @media (min-width: 64rem) {
      .dos-columnas { grid-template-columns: minmax(0, var(--l-ancho-lectura)) minmax(18rem, 25rem); justify-content: start; }
      .vista-lateral { position: sticky; inset-block-start: 0; }
    }
    .cabecera { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 8px 16px; }
    .cabecera p { margin: 4px 0 0; }
    .formulario { display: flex; flex-direction: column; gap: 24px; max-inline-size: var(--l-ancho-lectura); min-inline-size: 0; }
    .grupo { display: flex; flex-direction: column; gap: 6px; min-inline-size: 0; }
    .conjunto { border: 0; margin: 0; padding: 0; }
    .etiqueta { padding: 0; font-weight: 700; font-size: var(--autoria-texto-18); }
    .ayuda, .error { margin: 0; font-size: var(--autoria-texto-16); }
    #d-contexto-cuenta { text-align: end; }
    .error { color: var(--peligro); font-weight: 700; }
    .campo { font: inherit; font-size: var(--autoria-texto-16); line-height: 1.5; inline-size: 100%; box-sizing: border-box; min-inline-size: 0; }
    textarea.campo { resize: vertical; min-block-size: 2.75rem; }
    #d-contexto { min-block-size: 8rem; }
    .fila textarea.campo { resize: none; }
    .campo[aria-invalid='true'] { border-color: var(--peligro); }
    .campo:focus-visible, .ficha__quitar:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
    .campo[readonly] { background: var(--fondo-hundido); }
    .filas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .fila { display: flex; gap: 8px; align-items: flex-start; }
    .quitar, .agregar { align-self: flex-start; flex: none; }
    .fichas { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .ficha { gap: 4px; padding-inline-end: 2px; }
    .ficha__texto { overflow-wrap: anywhere; }
    .ficha__quitar { display: inline-grid; place-items: center; inline-size: 44px; block-size: 44px; margin-block: -6px; border: 0; border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: var(--autoria-texto-20); cursor: pointer; }
    .ficha__quitar:active { scale: 0.92; }
    .estado { font-weight: 700; font-size: var(--autoria-texto-16); }
    .estado:empty { display: none; }
    .estado[data-forma='error'], .estado[data-forma='corregir'] { color: var(--peligro); }
    .estado[data-forma='guardando'], .estado[data-forma='guardado'] { color: var(--texto-secundario); }
    .nota-lectura { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--primario-tinte); font-weight: 700; }
    .vista-titulo { margin: 0 0 8px; font-size: var(--autoria-texto-18); }
    .vista { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--radio-tarjeta); min-inline-size: 0; }
    .vista__nombre { margin: 0; font-size: var(--autoria-texto-22); line-height: 1.25; overflow-wrap: anywhere; }
    .vista__contexto { margin: 0; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .vista__contexto.vacio { color: var(--texto-secundario); }
    .vista__sub { margin: 4px 0 0; font-size: var(--autoria-texto-16); color: var(--texto-secundario); }
    .vista__lista { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
    .vista__portada { align-self: center; max-inline-size: 100%; }
    @media (max-width: 40rem) {
      .fila { flex-wrap: wrap; }
      .fila .quitar { margin-inline-start: auto; }
    }
    @media (forced-colors: active) {
      .campo, .vista { border: 1px solid CanvasText; }
    }
  `,
})
export class DatosComponent {
  protected readonly store = inject(CasoStore);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly maxContexto = MAX_CONTEXTO;
  protected readonly maxObjetivos = MAX_OBJETIVOS;
  protected readonly maxLargoObjetivo = MAX_LARGO_OBJETIVO;
  protected readonly maxTemas = MAX_TEMAS;
  protected readonly maxLargoTema = MAX_LARGO_TEMA;

  /**
   * Lo que se escribe: parte de lo que tiene el caso y vuelve a partir de ahí solo cuando el caso se abre o se relee. Si el
   * sistema no acepta un cambio, el borrador del caso vuelve a lo de antes, pero el campo conserva lo escrito.
   */
  protected readonly nombre = signal('');
  protected readonly contexto = signal('');
  protected readonly objetivos = signal<string[]>([]);
  protected readonly temas = signal<string[]>([]);
  protected readonly temaNuevo = signal('');
  protected readonly errorTema = signal<string | null>(null);
  /** Lo último que esta pantalla dijo del guardado; la lectura de un caso nuevo lo borra. */
  private readonly aviso = signal<Situacion>({ forma: '', texto: '' });

  protected readonly soloLectura = computed(() => this.store.soloLectura());
  /** El bloque de temas sensibles solo se pinta si el servidor los guarda (RK-7): con uno anterior no llegan. */
  protected readonly conTemas = computed(() => this.store.caso()?.temasSensibles !== undefined);
  protected readonly objetivosVista = computed(() => this.objetivos().map((o) => o.trim()).filter(Boolean));
  protected readonly errores = computed(() => ({
    ...revisarFicha(this.contexto(), this.objetivos().join('\n')),
    // Un nombre que no se tocó no se juzga: solo se revisa lo que la persona cambió.
    nombre: this.nombre().trim() === (this.store.caso()?.titulo ?? '') ? null : problemaDeNombre(this.nombre()),
  }));

  /**
   * Lo que se dice del guardado. El conflicto y el error del almacén mandan sobre el aviso propio, porque dicen lo que de
   * verdad pasó (y el aviso de arriba trae sus salidas); «corrige lo marcado» manda sobre ellos porque es lo que la persona
   * tiene a la vista.
   */
  protected readonly situacion = computed<Situacion>(() => {
    const aviso = this.aviso();
    if (aviso.forma === 'corregir') return aviso;
    if (this.store.conflicto()) return { forma: 'error', texto: 'Otra persona cambió el caso. Lo que escribiste sigue aquí; el aviso de arriba te deja recargarlo.' };
    if (this.store.error()) return { forma: 'error', texto: 'No se pudo guardar. Lo escrito sigue en los campos; revisa el aviso.' };
    return aviso;
  });

  constructor() {
    effect(() => {
      this.store.lectura();
      untracked(() => {
        const caso = this.store.caso();
        this.nombre.set(caso?.titulo ?? '');
        this.contexto.set(caso?.contexto ?? '');
        this.objetivos.set([...(caso?.objetivos ?? [])]);
        this.temas.set([...(caso?.temasSensibles ?? [])]);
        this.aviso.set({ forma: '', texto: '' });
      });
    });
  }

  protected tope(n: number): string {
    return n.toLocaleString('es-CO');
  }

  protected escribirObjetivo(indice: number, valor: string): void {
    // Un pegado con saltos de línea se vuelve una sola frase.
    const limpio = valor.replace(/\s*[\r\n]+\s*/g, ' ');
    this.objetivos.update((lista) => lista.map((o, i) => (i === indice ? limpio : o)));
  }

  protected agregarObjetivo(): void {
    if (this.objetivos().length >= MAX_OBJETIVOS) return;
    this.objetivos.update((lista) => [...lista, '']);
    const indice = this.objetivos().length - 1;
    afterNextRender(() => this.anfitrion.querySelector<HTMLElement>(`#d-objetivo-${indice}`)?.focus(), { injector: this.injector });
  }

  protected quitarObjetivo(indice: number): void {
    this.objetivos.update((lista) => lista.filter((_, i) => i !== indice));
    this.guardarAlSalir();
  }

  /** Agrega el tema escrito; si rompe una regla se queda en el campo con su error. Guarda al momento: es una acción, no un texto. */
  protected agregarTema(evento?: Event): void {
    evento?.preventDefault();
    if (this.soloLectura()) return;
    const texto = this.temaNuevo().trim();
    if (!texto) return;
    const problema = problemaDeTema(texto, this.temas());
    this.errorTema.set(problema);
    if (problema) return;
    this.temas.set(normalizarTemas([...this.temas(), texto]));
    this.temaNuevo.set('');
    this.guardarAlSalir();
  }

  protected quitarTema(tema: string): void {
    this.temas.update((lista) => lista.filter((t) => t !== tema));
    this.guardarAlSalir();
  }

  /** ¿Lo escrito es distinto de lo que tiene el caso? */
  private cambiado(): boolean {
    const caso = this.store.caso();
    return this.contexto().trim() !== (caso?.contexto ?? '')
      || JSON.stringify(this.objetivosVista()) !== JSON.stringify(caso?.objetivos ?? [])
      || (this.conTemas() && JSON.stringify(this.temas()) !== JSON.stringify(caso?.temasSensibles ?? []))
      || this.nombre().trim() !== (caso?.titulo ?? '');
  }

  /** Al salir de un campo con algo cambiado y sin errores, se guarda; si hay un error se queda marcado y no se mueve el foco. */
  protected guardarAlSalir(): void {
    if (this.soloLectura()) return;
    const errores = this.errores();
    if (errores.contexto || errores.objetivos || errores.nombre) {
      this.aviso.set({ forma: 'corregir', texto: 'Corrige lo marcado para poder guardar.' });
      return;
    }
    this.nombre.set(this.nombre().trim()); // lo que se ve en el campo es lo que se guarda
    if (!this.cambiado()) {
      if (this.aviso().forma === 'corregir') this.aviso.set({ forma: '', texto: '' });
      return;
    }
    void this.enviar();
  }

  private async enviar(): Promise<void> {
    this.store.descartarError();
    this.aviso.set({ forma: 'guardando', texto: 'Guardando…' });
    this.store.editarFicha(this.contexto(), this.objetivosVista(), {
      ...(this.conTemas() ? { temas: this.temas() } : {}),
      titulo: this.nombre(),
    });
    await this.store.sincronizado();
    this.aviso.set({ forma: 'guardado', texto: 'Guardado.' });
  }
}
