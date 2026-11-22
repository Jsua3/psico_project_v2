import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { GeneracionService } from '../../generacion/generacion.service';
import { BibliotecaService, rutaArte } from '../../modelo/biblioteca.service';
import type { Escenario, Recorrido, Sala } from '../../modelo/escenario';
import { ENCUADRE_LEGIBLE, listaNumerada } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { DescribirComponent } from '../describir/describir.component';
import { PasosCrearComponent, abrirElCasoNuevo } from '../pasos-crear.component';

/** El puntero es un ratón: con él, pasar el cursor o tabular a una sala enseña su vista previa. Con el dedo, solo el botón «Ver sala». */
function hayPunteroFino(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Paso 2 de crear un caso (tablero 24). De arriba abajo: el nombre del caso (lo primero que se escribe), las ideas para
 * empezar, las salas con su vista previa (al pasar el cursor, al llegar con el teclado o con «Ver sala») y, al lado, el
 * recorrido con su orden (se cambia arrastrando o con los botones). El pie pegado mide 64 px y no tapa ninguna sala.
 * El caso mínimo: elegir el lugar, usar una idea y crear (3 clics; 4 si se marca una sala a mano), más el nombre.
 */
@Component({
  selector: 'app-salas',
  imports: [FormsModule, RouterLink, PasosCrearComponent, DescribirComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina crear">
      <app-pasos-crear [paso]="2" />
      @if (escenario(); as e) {
        <div class="titulo">
          <h1>Elige las salas de tu caso</h1>
          <p class="texto-secundario">{{ e.nombre }} · {{ e.salas.length }} salas. Empieza con una idea o elige las salas una por una.</p>
        </div>

        <!-- Con la IA apagada no se muestra nada de ella: una opción que no se puede usar solo estorba. -->
        @if (generacion() === 'encendida') {
          <!-- BORRADOR: los textos de las dos opciones son nuevos, pendientes de la aprobación de Psicología -->
          <fieldset class="forma">
            <legend>¿Cómo quieres empezar?</legend>
            <div class="opciones">
              <label class="tarjeta opcion" [class.elegida]="forma() === 'describe'">
                <input type="radio" name="forma" value="describe" [checked]="forma() === 'describe'"
                       aria-describedby="forma-describe-texto" (change)="elegirForma('describe')" />
                <span class="dato-opcion">
                  <span class="nombre">Describe tu caso</span>
                  <span id="forma-describe-texto" class="texto-secundario">
                    La IA arma un borrador completo a partir de tu descripción. Tú lo revisas y lo cambias.
                  </span>
                </span>
              </label>
              <label class="tarjeta opcion" [class.elegida]="forma() === 'a-mano'">
                <input type="radio" name="forma" value="a-mano" [checked]="forma() === 'a-mano'"
                       aria-describedby="forma-a-mano-texto" (change)="elegirForma('a-mano')" />
                <span class="dato-opcion">
                  <span class="nombre">Elegir salas a mano</span>
                  <span id="forma-a-mano-texto" class="texto-secundario">Eliges las salas y escribes tú cada escena.</span>
                </span>
              </label>
            </div>
          </fieldset>
        }

        @if (forma() === 'describe') {
          <app-describir [lugarId]="lugarId" [(descripcion)]="descripcionEscrita" />
        } @else {
          <div class="nombre-caso">
            <label for="nombre-caso">Nombre del caso</label>
            <input id="nombre-caso" type="text" autocomplete="off" [ngModel]="nombre()" (ngModelChange)="nombrar($event)"
                   (focus)="seleccionar($event)" aria-describedby="nombre-ayuda" />
            <p id="nombre-ayuda" class="texto-secundario">Si lo dejas vacío, se llamará «{{ nombrePorDefecto() }}».</p>
          </div>

          <section aria-labelledby="ideas" class="bloque">
            <h2 id="ideas">Ideas para empezar</h2>
            <div class="ideas">
              @for (r of e.recorridosSugeridos; track r.id) {
                <article class="tarjeta idea" [class.elegida]="ideaElegida() === r.id">
                  <h3>{{ r.nombre }}</h3>
                  <p>{{ r.descripcion }}</p>
                  <ol class="texto-secundario">
                    @for (id of r.salas; track id) { <li>{{ nombreSala(id) }}</li> }
                  </ol>
                  @if (ideaElegida() === r.id) {
                    <p class="pildora pildora-adecuada">✓ Elegida</p>
                  } @else {
                    <button type="button" class="boton boton-secundario" [attr.aria-label]="'Usar esta idea: ' + r.nombre" (click)="usarIdea(r)">
                      Usar esta idea
                    </button>
                  }
                </article>
              }
            </div>
          </section>

          <div class="zona-salas" (keydown.escape)="cerrarVista()">
            <section aria-labelledby="lista" class="bloque" data-accion="elegir-salas">
              <div class="encabezado-lista">
                <h2 id="lista">Salas de la {{ e.nombre.toLowerCase() }}</h2>
                <span class="pildora">{{ elegidas().length }} de {{ e.salas.length }} elegidas</span>
              </div>
              <div class="salas">
                @for (s of e.salas; track s.id) {
                  <div class="sala tarjeta" [class.marcada]="posicion(s.id) > 0" [class.vista-activa]="vistaId() === s.id"
                       (mouseenter)="alPasar(s.id)" (focusin)="alPasar(s.id)">
                    <label class="marca-sala">
                      <span class="miniatura">
                        <img class="pixel" [src]="arte(s.fondo)" alt="" width="960" height="528" />
                        @if (posicion(s.id) > 0) { <span class="orden" aria-hidden="true">{{ posicion(s.id) }}</span> }
                      </span>
                      <span class="dato">
                        <input type="checkbox" [value]="s.id" [checked]="posicion(s.id) > 0" (change)="alternar(s.id)" />
                        <span>
                          <span class="nombre">{{ s.nombre }}</span>
                          <span class="texto-secundario">{{ encuadre(s) }}</span>
                        </span>
                      </span>
                    </label>
                    <button type="button" class="boton boton-texto ver" [attr.aria-expanded]="vistaId() === s.id" aria-controls="vista-sala"
                            [attr.aria-label]="'Ver sala: ' + s.nombre" (click)="verSala(s.id)">
                      {{ vistaId() === s.id ? 'Ocultar' : 'Ver sala' }}
                    </button>
                  </div>
                }
              </div>
            </section>

            <aside class="lateral" aria-label="Recorrido y vista previa">
              <section aria-labelledby="orden" class="tarjeta recorrido">
                <h2 id="orden">Tu recorrido</h2>
                @if (elegidas().length) {
                  <p class="texto-secundario">Cada sala será una escena, en este orden. Arrastra por el asa o usa las flechas para cambiarlo.</p>
                  <ol class="lista-orden">
                    @for (id of elegidas(); track id; let i = $index; let ultimo = $last) {
                      <li [class.destino]="destinoArrastre() === i" (dragstart)="iniciarArrastre(i, $event)" (dragover)="sobreSala(i, $event)"
                          (drop)="soltarSala($event, i)" (dragend)="terminarArrastre($event)">
                        <span class="asa" aria-hidden="true" (pointerdown)="tomarAsa($event)" (pointerup)="soltarAsa($event)"
                              (pointercancel)="soltarAsa($event)">⋮⋮</span>
                        <span class="posicion">{{ i + 1 }}.</span>
                        <span class="nombre-orden">{{ nombreSala(id) }}</span>
                        <span class="mover">
                          <button type="button" class="boton" [attr.aria-label]="'Subir ' + nombreSala(id)"
                                  [attr.aria-disabled]="i === 0" (click)="mover(i, -1)">↑</button>
                          <button type="button" class="boton" [attr.aria-label]="'Bajar ' + nombreSala(id)"
                                  [attr.aria-disabled]="ultimo" (click)="mover(i, 1)">↓</button>
                        </span>
                      </li>
                    }
                  </ol>
                  <p role="status" class="solo-lector">{{ anuncioOrden() }}</p>
                } @else {
                  <p class="texto-secundario">Ninguna sala elegida. Marca las salas o usa una idea para empezar.</p>
                }
              </section>

              @if (salaVista(); as v) {
                <section id="vista-sala" class="tarjeta vista" aria-label="Vista previa de la sala">
                  <div class="vista__cabeza">
                    <h3>{{ v.nombre }}</h3>
                    <button type="button" class="boton boton-texto" (click)="cerrarVista()">Cerrar</button>
                  </div>
                  <img class="pixel" [src]="arte(v.fondo)" alt="" width="960" height="528" />
                  <p>{{ v.descripcion }}</p>
                  <dl>
                    <dt>Personajes</dt><dd>{{ nombresPersonajes(v) || 'Ninguno' }}</dd>
                    <dt>Muebles</dt><dd>{{ nombresMuebles(v) || 'Ninguno' }}</dd>
                    <dt>Objetos</dt><dd>{{ nombresObjetos(v) || 'Ninguno' }}</dd>
                    <dt>Puertas</dt><dd>{{ etiquetasPuertas(v) || 'Ninguna' }}</dd>
                  </dl>
                </section>
              }
            </aside>
          </div>

          <div class="pie" role="group" aria-label="Crear el caso" data-accion="crear-caso">
            @if (errorAlCrear(); as mensaje) {
              <p class="pie__texto pie__error" role="alert">{{ mensaje }}</p>
            } @else if (elegidas().length) {
              <p class="pie__texto" role="status" [attr.title]="resumenOrden()">
                <strong>{{ elegidas().length }} {{ elegidas().length === 1 ? 'sala' : 'salas' }}</strong><span class="pie__orden">, en este orden: {{ resumenOrden() }}</span>
              </p>
            } @else {
              <p class="pie__texto pie__vacio" role="status">Ninguna sala elegida: marca una o usa una idea</p>
            }
            <a [routerLink]="rutas.a('/lugar')" class="boton boton-texto">Volver</a>
            <button type="button" class="boton boton-primario" [attr.aria-disabled]="creando()" (click)="crear()">
              <span>{{ creando() ? 'Creando el caso…' : 'Crear el caso' }}<span class="pie__resto"> con estas salas</span></span>
            </button>
          </div>
        }
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
      } @else {
        <p role="status">Cargando el lugar…</p>
      }
    </div>
  `,
  styles: `
    .crear { gap: 1.25rem; }
    .titulo { display: flex; flex-direction: column; gap: 0.25rem; }
    .titulo h1 { margin: 0; }
    .titulo p { margin: 0; }
    .forma { margin: 0; padding: 0; border: 0; min-inline-size: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .forma legend { padding: 0; font-weight: 700; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .opciones { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 0.75rem; }
    .opcion { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.75rem; cursor: pointer; }
    .opcion.elegida { border-color: var(--primario); box-shadow: inset 0 0 0 1px var(--primario); }
    .opcion input { inline-size: 1.5rem; block-size: 1.5rem; margin: 0.125rem 0 0; flex: none; accent-color: var(--primario); }
    .dato-opcion { display: flex; flex-direction: column; gap: 0.125rem; min-inline-size: 0; }
    .dato-opcion .texto-secundario { font-size: var(--autoria-texto-16); line-height: 1.5rem; }

    /* El nombre del caso es el primer campo: ancho de lectura y no de página, con la ayuda debajo. */
    .nombre-caso { display: flex; flex-direction: column; gap: 0.25rem; max-inline-size: 36rem; }
    .nombre-caso label { font-weight: 700; font-size: var(--autoria-texto-16); }
    .nombre-caso input {
      min-block-size: 2.75rem; padding: 0 0.75rem; font: inherit; color: var(--tinta); background: var(--superficie);
      border: 1px solid var(--borde-control); border-radius: var(--radio-control);
    }
    .nombre-caso p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }

    .bloque { display: flex; flex-direction: column; gap: 0.75rem; min-inline-size: 0; }
    .bloque h2 { margin: 0; }
    .ideas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 0.75rem; }
    .idea { display: flex; flex-direction: column; gap: 0.5rem; min-inline-size: 0; }
    .idea h3 { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .idea p, .idea ol { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .idea ol { padding-inline-start: 1.25rem; }
    .idea.elegida { border-color: var(--adecuada-borde); box-shadow: inset 0 0 0 1px var(--adecuada-borde); }
    .idea .boton, .idea .pildora { align-self: flex-start; margin-block-start: auto; }

    .encabezado-lista { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }

    /* Las salas a la izquierda y, al lado, el recorrido y la vista previa; el lateral se queda a la vista al desplazarse. */
    .zona-salas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
    .salas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); gap: 0.75rem; }
    .sala { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem; min-inline-size: 0; }
    .sala.marcada { border-color: var(--primario); box-shadow: inset 0 0 0 1px var(--primario); }
    .sala.vista-activa:not(.marcada) { border-color: var(--borde-control); }
    .marca-sala { display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer; min-inline-size: 0; }
    .miniatura { position: relative; display: block; border-radius: var(--radio-control); overflow: hidden; border: 1px solid var(--linea); }
    .miniatura img { display: block; inline-size: 100%; block-size: auto; aspect-ratio: 960 / 528; }
    .orden {
      position: absolute; inset-block-start: 0.375rem; inset-inline-start: 0.375rem; inline-size: 2rem; block-size: 2rem; border-radius: 999px;
      display: grid; place-items: center; background: var(--primario); color: var(--sobre-primario); font-weight: 700;
    }
    .dato { display: flex; gap: 0.5rem; align-items: flex-start; min-inline-size: 0; }
    .dato input { inline-size: 1.5rem; block-size: 1.5rem; margin: 0.125rem 0 0; flex: none; accent-color: var(--primario); }
    .dato > span { display: flex; flex-direction: column; min-inline-size: 0; }
    .nombre { font-weight: 700; font-size: var(--autoria-texto-16); line-height: 1.375rem; overflow-wrap: anywhere; }
    .dato .texto-secundario { font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .ver { align-self: flex-start; min-block-size: 2.75rem; padding-inline: 0.5rem; }

    .lateral { display: flex; flex-direction: column; gap: 0.75rem; min-inline-size: 0; }
    .lateral h2, .lateral h3 { margin: 0; }
    .recorrido { display: flex; flex-direction: column; gap: 0.5rem; }
    .recorrido p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .lista-orden { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
    .lista-orden li {
      display: flex; align-items: center; gap: 0.375rem; min-block-size: 2.75rem; padding-inline-start: 0.25rem;
      border-radius: var(--radio-control); border: 1px solid transparent;
    }
    .lista-orden li.destino { border-color: var(--primario); background: var(--primario-tinte); }
    .asa { flex: none; inline-size: 1.25rem; text-align: center; color: var(--texto-secundario); cursor: grab; touch-action: none; user-select: none; letter-spacing: -0.2em; }
    .posicion { flex: none; font-variant-numeric: tabular-nums; font-weight: 700; }
    .nombre-orden { flex: 1; min-inline-size: 0; font-size: var(--autoria-texto-16); line-height: 1.375rem; overflow-wrap: anywhere; }
    .mover { display: flex; flex: none; gap: 0.25rem; }
    .mover .boton { inline-size: 2.75rem; min-block-size: 2.75rem; padding: 0; }

    .vista { display: flex; flex-direction: column; gap: 0.5rem; }
    .vista__cabeza { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .vista img { inline-size: 100%; block-size: auto; aspect-ratio: 960 / 528; border-radius: var(--radio-control); }
    .vista p { margin: 0; }
    .vista dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .vista dt { font-weight: 700; }
    .vista dd { margin: 0; min-inline-size: 0; overflow-wrap: anywhere; }

    /* El pie pegado al borde de la zona: 64 px de alto, una sola fila. Velo casi opaco y sin desenfoque (el trinquete de ui:lint
       no admite un backdrop-filter nuevo, D-25): al 96 % el material se nota y el texto de las salas no se cuela tras los botones. */
    .pie {
      position: sticky; inset-block-end: 0.75rem; z-index: var(--autoria-capa-4); margin-block-start: auto;
      display: flex; align-items: center; gap: 0.75rem; block-size: 4rem; padding: 0 0.75rem;
      border: 1px solid var(--l-filo-fuerte, var(--linea)); border-radius: var(--radio-tarjeta);
      background: color-mix(in oklab, var(--superficie) 96%, transparent);
      box-shadow: inset 0 1px 0 var(--l-brillo, transparent), var(--sombra-menu);
    }
    @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .pie { background: var(--superficie); } }
    @media (forced-colors: active) { .pie { border-color: CanvasText; } }
    .pie__texto { flex: 1; min-inline-size: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--autoria-texto-16); }
    .pie__error { color: var(--peligro); font-weight: 700; }
    .pie .boton { flex: none; }
    .pie .boton-primario { min-block-size: 3rem; }

    @media (min-width: 64rem) {
      .zona-salas { grid-template-columns: minmax(0, 1fr) 20rem; }
      .lateral { position: sticky; inset-block-start: 0; max-block-size: calc(100dvh - var(--alto-barra, 4.5rem) - 7rem); overflow-y: auto; overscroll-behavior: contain; }
    }
    @media (max-width: 63.999rem) {
      /* En pantallas angostas la vista previa es una hoja sobre el pie; se cierra con «Cerrar» o con Esc. */
      .vista {
        position: fixed; inset-inline: 0.75rem; inset-block-end: 5.25rem; z-index: var(--autoria-capa-5);
        max-block-size: min(60dvh, 28rem); overflow-y: auto; box-shadow: var(--sombra-menu);
      }
    }
    @media (max-width: 40rem) {
      .crear { gap: 1rem; }
      .pie { gap: 0.5rem; padding-inline: 0.5rem; }
      .pie__orden, .pie__resto { display: none; }
      /* Sin salas el aviso no cabe junto a los dos botones; el error al pulsar «Crear» ya dice qué falta. */
      .pie__vacio { display: none; }
      .pie .boton-primario { flex: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sala, .opcion { transition: none; }
    }
  `,
})
export class SalasComponent {
  private readonly biblioteca = inject(BibliotecaService);
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly generacionSvc = inject(GeneracionService);
  protected readonly rutas = inject(RutasAutoria);
  protected readonly lugarId = inject(ActivatedRoute).snapshot.queryParamMap.get('lugar') ?? 'universidad';

  /** Cómo empieza la docente: describiendo el caso a la IA o eligiendo las salas ella misma (lo de siempre). */
  protected readonly forma = signal<'describe' | 'a-mano'>('a-mano');
  /** La descripción vive aquí y no en «Describe tu caso», que se destruye al pasar a «Elegir salas a mano»: así no se pierde. */
  protected readonly descripcionEscrita = signal('');
  /** La generación con IA: apagada, ni se menciona (nada de opciones que no se pueden usar); encendida, se ofrece la elección. */
  protected readonly generacion = signal<'cargando' | 'encendida' | 'apagada'>('cargando');
  protected readonly escenario = signal<Escenario | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly elegidas = signal<string[]>([]);
  protected readonly ideaElegida = signal<string | null>(null);
  protected readonly nombre = signal('');
  private nombreEditado = false;
  private formaElegida = false;
  protected readonly anuncioOrden = signal('');
  /** El caso se está creando en el servidor. */
  protected readonly creando = signal(false);
  protected readonly errorAlCrear = signal<string | null>(null);
  protected readonly nombrePorDefecto = computed(() => `Caso nuevo en la ${(this.escenario()?.nombre ?? 'universidad').toLowerCase()}`);
  protected readonly vistaId = signal<string | null>(null);
  protected readonly salaVista = computed(() => this.escenario()?.salas.find((s) => s.id === this.vistaId()) ?? null);
  protected readonly resumenOrden = computed(() => listaNumerada(this.elegidas().map((id) => this.nombreSala(id))));
  /** La fila del recorrido sobre la que se suelta lo que se arrastra (para pintar la ranura). */
  protected readonly destinoArrastre = signal<number | null>(null);
  private arrastrado: number | null = null;

  constructor() {
    void this.revisarGeneracion();
    this.biblioteca
      .escenario(this.lugarId)
      .then((e) => {
        this.escenario.set(e);
        if (!this.nombre()) this.nombre.set(`Caso nuevo en la ${e.nombre.toLowerCase()}`);
      })
      .catch(() => this.error.set('No se pudo abrir el lugar. Vuelve a intentarlo.'));
  }

  private async revisarGeneracion(): Promise<void> {
    try {
      const estado = await this.generacionSvc.estado();
      this.generacion.set(estado.enabled ? 'encendida' : 'apagada');
      // Con una generación a medio hacer, el aviso de retomar debe verse sin que la docente adivine la opción. Pero la
      // respuesta puede llegar tarde: si la docente ya empezó a mano (eligió forma, salas, una idea o escribió el nombre), no
      // se le cambia la pantalla bajo los dedos; «Describe tu caso» sigue a un clic y ahí ve el aviso (Codex, hallazgo 3).
      if (estado.enabled && estado.inProgress && !this.yaEmpezo()) this.forma.set('describe');
    } catch {
      // Sin saberlo, la opción queda disponible: «Describe tu caso» dice por sí misma si no se pudo comprobar.
      this.generacion.set('encendida');
    }
  }

  /** La docente eligió cómo empezar: desde ahí, lo que responda tarde el servidor ya no le cambia la opción. */
  protected elegirForma(forma: 'describe' | 'a-mano'): void {
    this.formaElegida = true;
    this.forma.set(forma);
  }

  /** ¿La docente ya tocó algo de esta pantalla? */
  private yaEmpezo(): boolean {
    return this.formaElegida || this.nombreEditado || this.elegidas().length > 0 || this.ideaElegida() !== null;
  }

  protected cerrarVista(): void {
    this.vistaId.set(null);
  }

  /** Cursor o teclado sobre una sala: la vista previa la sigue. Con el dedo no (un toque para marcar abriría la hoja). */
  protected alPasar(id: string): void {
    if (hayPunteroFino()) this.vistaId.set(id);
  }

  /** «Ver sala»: abre la vista previa de esa sala o, si ya era la que se veía, la cierra. Es el camino del toque y del teclado. */
  protected verSala(id: string): void {
    this.vistaId.update((actual) => (actual === id ? null : id));
  }

  protected arte(relativa: string): string {
    return rutaArte(this.lugarId, relativa);
  }

  protected encuadre(s: Sala): string {
    return ENCUADRE_LEGIBLE[s.encuadre];
  }

  protected nombreSala(id: string): string {
    return this.escenario()?.salas.find((s) => s.id === id)?.nombre ?? id;
  }

  protected posicion(id: string): number {
    return this.elegidas().indexOf(id) + 1;
  }

  protected seleccionar(evento: Event): void {
    (evento.target as HTMLInputElement).select();
  }

  protected usarIdea(r: Recorrido): void {
    this.elegidas.set([...r.salas]);
    this.ideaElegida.set(r.id);
    this.errorAlCrear.set(null);
    if (!this.nombreEditado) this.nombre.set(r.nombre);
  }

  protected alternar(id: string): void {
    this.elegidas.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.ideaElegida.set(null);
    this.errorAlCrear.set(null);
  }

  protected nombrar(valor: string): void {
    this.nombreEditado = true;
    this.nombre.set(valor);
  }

  protected mover(i: number, paso: -1 | 1): void {
    this.moverA(i, i + paso);
  }

  /** Cambia una sala de lugar en el recorrido (botones y arrastre hacen lo mismo) y lo anuncia. */
  private moverA(desde: number, hasta: number): void {
    const ids = [...this.elegidas()];
    if (desde === hasta || hasta < 0 || hasta >= ids.length || desde < 0 || desde >= ids.length) return;
    const [sala] = ids.splice(desde, 1);
    ids.splice(hasta, 0, sala);
    this.elegidas.set(ids);
    this.ideaElegida.set(null);
    this.anuncioOrden.set(`${this.nombreSala(sala)}, ahora en la posición ${hasta + 1} de ${ids.length}.`);
  }

  // ─── Arrastrar el orden ────────────────────────────────────────────────────

  /** El asa arma el arrastre de su fila: solo desde el asa, para que no se arrastre nada al tocar un botón. */
  protected tomarAsa(evento: PointerEvent): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = true;
  }

  protected soltarAsa(evento: Event): void {
    const fila = (evento.currentTarget as HTMLElement | null)?.closest('li');
    if (fila) fila.draggable = false;
  }

  protected iniciarArrastre(indice: number, evento: DragEvent): void {
    this.arrastrado = indice;
    if (evento.dataTransfer) {
      evento.dataTransfer.effectAllowed = 'move';
      // Firefox no arrastra sin datos.
      evento.dataTransfer.setData('text/plain', String(indice));
    }
  }

  protected sobreSala(indice: number, evento: DragEvent): void {
    if (this.arrastrado === null) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    if (this.destinoArrastre() !== indice) this.destinoArrastre.set(indice);
  }

  protected soltarSala(evento: DragEvent, indice: number): void {
    evento.preventDefault();
    if (this.arrastrado !== null) this.moverA(this.arrastrado, indice);
    this.terminarArrastre(evento);
  }

  protected terminarArrastre(evento?: Event): void {
    this.arrastrado = null;
    this.destinoArrastre.set(null);
    const fila = (evento?.target as HTMLElement | null)?.closest?.('li');
    if (fila) fila.draggable = false;
  }

  /** Crea el caso en el servidor con las salas elegidas, en ese orden, y abre el guion de su primera escena. */
  protected async crear(): Promise<void> {
    const e = this.escenario();
    if (!e || this.creando()) return;
    if (!this.elegidas().length) {
      this.errorAlCrear.set('Elige al menos una sala, o usa una idea para empezar.');
      return;
    }
    this.creando.set(true);
    this.errorAlCrear.set(null);
    try {
      const titulo = this.nombre().trim() || this.nombrePorDefecto();
      // La descripción del caso es la de la idea elegida o, si se eligieron las salas una por una, la del lugar.
      const idea = e.recorridosSugeridos.find((r) => r.id === this.ideaElegida());
      const id = await this.store.crearCaso(titulo, e.id, this.elegidas(), idea?.descripcion || e.descripcion);
      await abrirElCasoNuevo(this.store, this.router, id);
    } catch {
      this.errorAlCrear.set('No se pudo crear el caso. Vuelve a intentarlo en un momento.');
    } finally {
      this.creando.set(false);
    }
  }

  protected nombresPersonajes(s: Sala): string {
    const e = this.escenario()!;
    return [...new Set(s.personajes.map((p) => e.personajes.find((x) => x.id === p.ref)?.nombre ?? p.ref))].join(', ');
  }

  protected nombresMuebles(s: Sala): string {
    const e = this.escenario()!;
    return [...new Set(s.muebles.map((m) => e.catalogo.muebles.find((x) => x.id === m.ref)?.nombre ?? m.ref))].sort().join(', ');
  }

  protected nombresObjetos(s: Sala): string {
    const e = this.escenario()!;
    return [...new Set(s.objetos.map((o) => e.catalogo.objetos.find((x) => x.id === o.ref)?.nombre ?? o.ref))].join(', ');
  }

  protected etiquetasPuertas(s: Sala): string {
    return s.puertas.map((p) => p.etiqueta).join('; ');
  }
}
