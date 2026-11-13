import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { GeneracionService } from '../../generacion/generacion.service';
import { BibliotecaService, rutaArte } from '../../modelo/biblioteca.service';
import type { Escenario, Recorrido, Sala } from '../../modelo/escenario';
import { ENCUADRE_LEGIBLE, listaNumerada } from '../../modelo/textos';
import { RutasAutoria, rutaDelEditor } from '../../rutas';
import { DescribirComponent } from '../describir/describir.component';
import { PasosCrearComponent } from '../pasos-crear.component';

/**
 * Paso 2 de crear un caso (tablero 24): ideas para empezar (los recorridos sugeridos), la
 * lista de salas con vista previa al pasar el cursor o al recibir el foco, el orden y el nombre.
 */
@Component({
  selector: 'app-salas',
  imports: [FormsModule, RouterLink, PasosCrearComponent, DescribirComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina con-barra">
      <app-pasos-crear [paso]="2" />
      @if (escenario(); as e) {
        <div class="titulo">
          <h1>Elige las salas de tu caso</h1>
          <p class="texto-secundario">{{ e.nombre }} · {{ e.salas.length }} salas. Empieza con una idea o elige las salas una por una.</p>
        </div>

        <!-- BORRADOR: los textos de las dos opciones son nuevos, pendientes de la aprobación de Psicología -->
        <fieldset class="forma">
          <legend>¿Cómo quieres empezar?</legend>
          <div class="opciones">
            <label class="tarjeta opcion" [class.elegida]="forma() === 'describe'" [class.apagada]="generacionApagada()">
              <input type="radio" name="forma" value="describe" [checked]="forma() === 'describe'" [disabled]="generacionApagada()"
                     aria-describedby="forma-describe-texto" (change)="forma.set('describe')" />
              <span class="dato-opcion">
                <span class="nombre">Describe tu caso</span>
                <span id="forma-describe-texto" class="texto-secundario">
                  La IA arma un borrador completo a partir de tu descripción. Tú lo revisas y lo cambias.
                  @if (generacionApagada()) {
                    <span class="motivo">La generación con IA no está disponible por ahora. Puedes elegir las salas a mano.</span>
                  }
                </span>
              </span>
            </label>
            <label class="tarjeta opcion" [class.elegida]="forma() === 'a-mano'">
              <input type="radio" name="forma" value="a-mano" [checked]="forma() === 'a-mano'"
                     aria-describedby="forma-a-mano-texto" (change)="forma.set('a-mano')" />
              <span class="dato-opcion">
                <span class="nombre">Elegir salas a mano</span>
                <span id="forma-a-mano-texto" class="texto-secundario">Eliges las salas y escribes tú cada escena.</span>
              </span>
            </label>
          </div>
        </fieldset>

        @if (forma() === 'describe') {
          <app-describir [lugarId]="lugarId" />
        } @else {
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

        <section aria-labelledby="lista" class="bloque" data-accion="elegir-salas">
          <div class="encabezado-lista">
            <h2 id="lista">Salas de la {{ e.nombre.toLowerCase() }}</h2>
            <span class="pildora">{{ elegidas().length }} de {{ e.salas.length }} elegidas</span>
          </div>
          <div class="salas-y-vista" (keydown.escape)="cerrarVista()">
            <div class="salas">
              @for (s of e.salas; track s.id) {
                <label class="sala tarjeta" [class.marcada]="posicion(s.id) > 0"
                       (mouseenter)="verSala(s.id)" (focusin)="verSala(s.id)">
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
              }
            </div>
            @if (salaVista(); as v) {
              <aside class="vista tarjeta" aria-label="Vista previa de la sala">
                <img class="pixel" [src]="arte(v.fondo)" alt="" width="960" height="528" />
                <h3>{{ v.nombre }}</h3>
                <p>{{ v.descripcion }}</p>
                <dl>
                  <dt>Personajes</dt><dd>{{ nombresPersonajes(v) || 'Ninguno' }}</dd>
                  <dt>Muebles</dt><dd>{{ nombresMuebles(v) || 'Ninguno' }}</dd>
                  <dt>Objetos</dt><dd>{{ nombresObjetos(v) || 'Ninguno' }}</dd>
                  <dt>Puertas</dt><dd>{{ etiquetasPuertas(v) || 'Ninguna' }}</dd>
                </dl>
                <p class="texto-secundario nota">Se muestra al pasar el cursor o al llegar con el teclado. Se cierra con Esc.</p>
              </aside>
            }
          </div>
        </section>

        @if (ordenAbierto()) {
          <section aria-labelledby="orden" class="tarjeta bloque">
            <h2 id="orden">Cambiar el orden</h2>
            <ol class="lista-orden">
              @for (id of elegidas(); track id; let i = $index; let ultimo = $last) {
                <li>
                  <span>{{ i + 1 }}. {{ nombreSala(id) }}</span>
                  <span class="acciones">
                    <button type="button" class="boton" [attr.aria-label]="'Subir ' + nombreSala(id)"
                            [attr.aria-disabled]="i === 0" (click)="mover(i, -1)">↑</button>
                    <button type="button" class="boton" [attr.aria-label]="'Bajar ' + nombreSala(id)"
                            [attr.aria-disabled]="ultimo" (click)="mover(i, 1)">↓</button>
                  </span>
                </li>
              }
            </ol>
            <p role="status" class="texto-secundario">{{ anuncioOrden() }}</p>
          </section>
        }

        <section aria-label="Crear el caso" class="barra-crear">
          <div class="campo">
            <label for="nombre-caso">Nombre del caso</label>
            <input id="nombre-caso" type="text" [ngModel]="nombre()" (ngModelChange)="nombrar($event)" />
            <p class="texto-secundario">Si lo dejas vacío, se llamará «{{ nombrePorDefecto() }}».</p>
          </div>
          <div class="resumen" role="status">
            @if (elegidas().length) {
              <p><strong>{{ elegidas().length }} {{ elegidas().length === 1 ? 'sala elegida' : 'salas elegidas' }}, en este orden:</strong></p>
              <p>{{ resumenOrden() }}</p>
              <p class="texto-secundario">Cada sala será una escena, en ese orden. Después las unes escribiendo las respuestas.</p>
            } @else {
              <p id="sin-salas">Ninguna sala elegida. Elige al menos una, o usa una idea para empezar.</p>
            }
          </div>
          @if (errorAlCrear(); as mensaje) {
            <p class="tarjeta aviso-error" role="alert">{{ mensaje }}</p>
          }
          <div class="acciones">
            <a [routerLink]="rutas.a('/lugar')" class="boton boton-texto">Volver</a>
            <button type="button" class="boton" [attr.aria-expanded]="ordenAbierto()" [attr.aria-disabled]="elegidas().length < 2"
                    (click)="elegidas().length > 1 && ordenAbierto.set(!ordenAbierto())">Cambiar el orden</button>
            <button type="button" class="boton boton-primario" [attr.aria-disabled]="!elegidas().length || creando()"
                    [attr.aria-describedby]="elegidas().length ? null : 'sin-salas'" (click)="crear()">
              {{ creando() ? 'Creando el caso…' : 'Crear el caso con estas salas' }}
            </button>
          </div>
        </section>
        }
      } @else if (error()) {
        <p role="alert">{{ error() }}</p>
      } @else {
        <p role="status">Cargando el lugar…</p>
      }
    </div>
  `,
  styles: `
    .con-barra { padding-bottom: 220px; }
    .forma { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .forma legend { padding: 0; font-weight: 700; font-size: var(--autoria-texto-20); line-height: 28px; }
    .opciones { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .opcion { display: flex; gap: 10px; align-items: flex-start; padding: 12px; cursor: pointer; }
    .opcion.elegida { border: 2px solid var(--primario); }
    .opcion.apagada { cursor: not-allowed; }
    .opcion input { width: 24px; height: 24px; margin: 2px 0 0; flex: none; accent-color: var(--primario); }
    .dato-opcion { display: flex; flex-direction: column; gap: 2px; }
    .dato-opcion .texto-secundario { font-size: var(--autoria-texto-16); line-height: 24px; }
    .motivo { display: block; margin-top: 4px; font-weight: 700; }
    .titulo { display: flex; flex-direction: column; gap: 4px; }
    .titulo p { margin: 0; }
    .bloque { display: flex; flex-direction: column; gap: 12px; }
    .bloque h2 { margin: 0; }
    .ideas { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .idea { display: flex; flex-direction: column; gap: 8px; }
    .idea h3 { margin: 0; font-size: var(--autoria-texto-20); line-height: 28px; }
    .idea p, .idea ol { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .idea ol { padding-left: 20px; }
    .idea.elegida { border: 2px solid var(--adecuada-borde); }
    .idea .boton, .idea .pildora { align-self: flex-start; margin-top: auto; }
    .encabezado-lista { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
    .salas-y-vista { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
    .salas { flex: 1 1 560px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .sala { display: flex; flex-direction: column; gap: 8px; padding: 8px; cursor: pointer; }
    .sala.marcada { border: 2px solid var(--primario); }
    .miniatura { position: relative; display: block; border-radius: 10px; overflow: hidden; border: 1px solid var(--linea); }
    .miniatura img { display: block; width: 100%; height: auto; aspect-ratio: 960 / 528; }
    .orden {
      position: absolute; top: 6px; left: 6px; width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center;
      background: var(--primario); color: var(--sobre-primario); font-weight: 700;
    }
    .dato { display: flex; gap: 10px; align-items: flex-start; }
    .dato input { width: 24px; height: 24px; margin: 2px 0 0; flex: none; accent-color: var(--primario); }
    .dato > span { display: flex; flex-direction: column; }
    .nombre { font-weight: 700; font-size: var(--autoria-texto-16); line-height: 22px; }
    .dato .texto-secundario { font-size: var(--autoria-texto-16); }
    .vista { flex: 0 1 380px; position: sticky; top: calc(var(--alto-cabecera, 64px) + 16px); display: flex; flex-direction: column; gap: 8px; }
    .vista img { width: 100%; height: auto; border-radius: 10px; }
    .vista h3, .vista p { margin: 0; }
    .vista dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: var(--autoria-texto-16); line-height: 24px; }
    .vista dt { font-weight: 700; }
    .vista dd { margin: 0; }
    .nota { font-size: var(--autoria-texto-16); }
    .lista-orden { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .lista-orden li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
    .lista-orden .boton { width: 48px; padding: 0; }
    .barra-crear {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--autoria-capa-4); display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center;
      padding: 12px 24px; background: var(--superficie); border-top: 2px solid var(--linea);
    }
    .campo { display: flex; flex-direction: column; gap: 4px; flex: 1 1 260px; }
    .campo label { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo input {
      min-height: 48px; padding: 0 12px; font: inherit; border: 2px solid var(--borde-control); border-radius: var(--radio-control);
    }
    .campo p, .resumen p { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .resumen { flex: 2 1 320px; }
    .aviso-error { flex: 1 1 100%; margin: 0; border: 2px solid var(--peligro); background: var(--peligro-tinte); }
  `,
})
export class SalasComponent {
  private readonly biblioteca = inject(BibliotecaService);
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly generacion = inject(GeneracionService);
  protected readonly rutas = inject(RutasAutoria);
  protected readonly lugarId = inject(ActivatedRoute).snapshot.queryParamMap.get('lugar') ?? 'universidad';

  /** Cómo empieza la docente: describiendo el caso a la IA o eligiendo las salas ella misma (lo de siempre). */
  protected readonly forma = signal<'describe' | 'a-mano'>('a-mano');
  /** La generación con IA está apagada: la opción «Describe tu caso» queda apagada con su motivo. */
  protected readonly generacionApagada = signal(false);
  protected readonly escenario = signal<Escenario | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly elegidas = signal<string[]>([]);
  protected readonly ideaElegida = signal<string | null>(null);
  protected readonly nombre = signal('');
  private nombreEditado = false;
  protected readonly ordenAbierto = signal(false);
  protected readonly anuncioOrden = signal('');
  /** El caso se está creando en el servidor. */
  protected readonly creando = signal(false);
  protected readonly errorAlCrear = signal<string | null>(null);
  protected readonly nombrePorDefecto = computed(() => `Caso nuevo en la ${(this.escenario()?.nombre ?? 'universidad').toLowerCase()}`);
  private readonly vistaId = signal<string | null>(null);
  protected readonly salaVista = computed(() => this.escenario()?.salas.find((s) => s.id === this.vistaId()) ?? null);
  protected readonly resumenOrden = computed(() => listaNumerada(this.elegidas().map((id) => this.nombreSala(id))));

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
      this.generacionApagada.set(!(await this.generacion.estado()).enabled);
    } catch {
      // Sin saberlo, la opción queda disponible: «Describe tu caso» dice por sí misma si no se pudo comprobar.
    }
  }

  protected cerrarVista(): void {
    this.vistaId.set(null);
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

  protected verSala(id: string): void {
    this.vistaId.set(id);
  }

  protected usarIdea(r: Recorrido): void {
    this.elegidas.set([...r.salas]);
    this.ideaElegida.set(r.id);
    if (!this.nombreEditado) this.nombre.set(r.nombre);
  }

  protected alternar(id: string): void {
    this.elegidas.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.ideaElegida.set(null);
  }

  protected nombrar(valor: string): void {
    this.nombreEditado = true;
    this.nombre.set(valor);
  }

  protected mover(i: number, paso: -1 | 1): void {
    const ids = [...this.elegidas()];
    const j = i + paso;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.elegidas.set(ids);
    this.ideaElegida.set(null);
    this.anuncioOrden.set(`${this.nombreSala(ids[j])}, ahora en la posición ${j + 1} de ${ids.length}.`);
  }

  /** Crea el caso en el servidor con las salas elegidas, en ese orden, y abre su editor. */
  protected async crear(): Promise<void> {
    const e = this.escenario();
    if (!e || !this.elegidas().length || this.creando()) return;
    this.creando.set(true);
    this.errorAlCrear.set(null);
    try {
      const titulo = this.nombre().trim() || this.nombrePorDefecto();
      // La descripción del caso es la de la idea elegida o, si se eligieron las salas una por una, la del lugar.
      const idea = e.recorridosSugeridos.find((r) => r.id === this.ideaElegida());
      const id = await this.store.crearCaso(titulo, e.id, this.elegidas(), idea?.descripcion || e.descripcion);
      await this.router.navigateByUrl(rutaDelEditor('/editor', String(id)));
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
