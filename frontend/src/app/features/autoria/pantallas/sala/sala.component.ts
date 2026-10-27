import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore, type TipoElemento } from '../../estado/caso.store';
import { rutaArte, rutaRetrato, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { SalaCaso } from '../../modelo/caso';
import { EXPRESIONES, type Expresion, type Mirando } from '../../modelo/escenario';
import { ALTO_SALA, ANCHO_SALA } from '../../modelo/geometria';
import { ENCUADRE_LEGIBLE, NOMBRE_EXPRESION } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';

interface Pieza {
  clave: string; // «mueble-2»
  tipo: TipoElemento;
  indice: number;
  nombre: string;
  x: number;
  y: number;
  arte: string;
  espejo: boolean;
  /** Para personajes: la fila de idle.png según hacia dónde mira. */
  sprite?: { url: string; fila: number };
}

/**
 * Editor de una sala (tablero 26): mover, quitar y agregar muebles, objetos y personajes,
 * con deshacer siempre a mano y «Volver a la sala original». Todo lo que se arrastra se hace
 * también con teclado (flechas, Supr) y con botones.
 */
@Component({
  selector: 'app-sala',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sala(); as s) {
      <div class="pagina">
        <div class="cabeza">
          <div>
            <h1>{{ s.nombre }}</h1>
            <p class="texto-secundario">{{ encuadre(s) }} · Los cambios valen para todas las escenas que pasan en esta sala.</p>
          </div>
          <div class="acciones">
            <button type="button" class="boton" data-accion="deshacer" [attr.aria-disabled]="!store.puedeDeshacer()" (click)="store.deshacer()">Deshacer</button>
            <button type="button" class="boton" [attr.aria-disabled]="!store.puedeRehacer()" (click)="store.rehacer()">Rehacer</button>
            <button type="button" class="boton" data-accion="volver-sala-original" (click)="volverOriginal()">Volver a la sala original</button>
            <a [routerLink]="rutas.a('/editor')" class="boton boton-secundario">Volver al caso</a>
          </div>
        </div>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        <div class="tres-columnas">
          <section aria-labelledby="en-sala" class="tarjeta columna-lista">
            <h2 id="en-sala">En esta sala</h2>
            <ul role="listbox" aria-label="Cosas en la sala" class="lista">
              @for (g of grupos(); track g.titulo) {
                <li role="group" [attr.aria-label]="g.titulo" [attr.data-accion]="g.titulo === 'Personajes' ? 'cambiar-expresion' : null">
                  <span class="grupo" aria-hidden="true">{{ g.titulo }}</span>
                  <ul role="none">
                    @for (p of g.piezas; track p.clave) {
                      <li role="option" tabindex="0" [attr.aria-selected]="elegida() === p.clave"
                          (click)="elegir(p.clave)" (keydown.enter)="elegir(p.clave)" (keydown.space)="elegir(p.clave); $event.preventDefault()">
                        {{ p.nombre }}
                      </li>
                    } @empty {
                      <li role="none" class="texto-secundario vacio">Ninguno</li>
                    }
                  </ul>
                </li>
              }
              <li role="group" aria-label="Puertas">
                <span class="grupo" aria-hidden="true">Puertas</span>
                <ul role="none">
                  @for (pu of s.puertas; track pu.id) {
                    <li role="none" class="puerta">{{ pu.etiqueta }}{{ pu.hacia ? '' : ' (no lleva a ninguna sala del caso)' }}</li>
                  }
                </ul>
              </li>
            </ul>
          </section>

          <section aria-labelledby="la-sala" class="columna-sala">
            <h2 id="la-sala" class="solo-lector">La sala</h2>
            <div class="escenario" #escenario tabindex="-1" data-accion="mover-mueble" (keydown)="teclaGeneral($event)"
                 [style.--escala]="escala()" (pointermove)="arrastrar($event)" (pointerup)="soltar()" (pointercancel)="soltar()">
              <div class="lienzo">
                <img class="pixel fondo" [src]="arte(s.fondo)" alt="" [width]="ancho" [height]="alto" draggable="false" />
                @for (p of piezasOrdenadas(); track p.clave) {
                  <button type="button" class="pieza" [attr.data-elemento]="p.clave" [class.elegida]="elegida() === p.clave"
                          [attr.aria-label]="p.nombre + (elegida() === p.clave ? ', elegido' : '')"
                          [style.left.px]="posicion(p).x" [style.top.px]="posicion(p).y" [style.z-index]="p.y"
                          (pointerdown)="empezarArrastre($event, p)" (click)="elegir(p.clave)" (keydown)="teclaPieza($event, p)">
                    @if (p.sprite) {
                      <span class="personaje" [style.background-image]="'url(' + p.sprite.url + ')'"
                            [style.background-position]="'0 ' + (-72 * p.sprite.fila) + 'px'"></span>
                    } @else {
                      <img class="pixel" [src]="p.arte" alt="" draggable="false" [class.espejo]="p.espejo" />
                    }
                  </button>
                }
              </div>
            </div>
            <p class="texto-secundario ayuda">
              Elige algo en la sala o en la lista. Muévelo arrastrando, con las flechas del teclado
              (<kbd>Mayús</kbd> + flecha mueve un poquito) o con los botones «Mover». <kbd>Supr</kbd> lo quita.
              <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.
            </p>

            <section aria-labelledby="catalogo" class="tarjeta catalogo" data-accion="agregar-mueble">
              <h3 id="catalogo">Catálogo del lugar <span class="texto-secundario">· se agrega en el centro de la sala</span></h3>
              <div role="tablist" aria-label="Qué quieres agregar" class="acciones">
                @for (t of pestanas; track t.tipo) {
                  <button role="tab" type="button" class="boton" [attr.aria-selected]="pestana() === t.tipo" (click)="pestana.set(t.tipo)">
                    {{ t.nombre }} ({{ cantidad(t.tipo) }})
                  </button>
                }
              </div>
              <label for="catq" class="etiqueta">Buscar en el catálogo</label>
              <input id="catq" type="search" class="campo" placeholder="Buscar, por ejemplo «silla»" [value]="busqueda()"
                     (input)="busqueda.set($any($event.target).value)" />
              <div role="tabpanel" [attr.aria-label]="nombrePestana()">
                <ul class="catalogo-lista">
                  @for (c of catalogo(); track c.ref) {
                    <li>
                      <button type="button" class="boton" [attr.aria-label]="'Agregar a la sala: ' + c.nombre" (click)="agregar(c.ref, c.nombre)">
                        @if (c.arte) { <img class="pixel" [src]="c.arte" alt="" /> }
                        {{ c.nombre }}
                      </button>
                    </li>
                  } @empty {
                    @if (cantidad(pestana()) === 0) {
                      <li class="texto-secundario" data-sin-catalogo>{{ sinCatalogo() }}</li>
                    } @else {
                      <li class="texto-secundario">Nada coincide con «{{ busqueda() }}».</li>
                    }
                  }
                </ul>
              </div>
            </section>
          </section>

          <section aria-labelledby="detalles" class="tarjeta columna-detalles" data-accion="quitar-elemento">
            <p class="texto-secundario">Detalles</p>
            @if (piezaElegida(); as p) {
              <h2 id="detalles">{{ p.nombre }}</h2>
              @if (p.tipo === 'personaje') {
                @let pj = s.personajes[p.indice];
                <span id="pmira" class="etiqueta">Hacia dónde mira</span>
                <div role="radiogroup" aria-labelledby="pmira" class="acciones">
                  @for (m of miradas; track m.valor) {
                    <button type="button" role="radio" class="boton" [attr.aria-checked]="pj.mirando === m.valor"
                            (click)="mirar(p.indice, m.valor)">{{ m.nombre }}</button>
                  }
                </div>
                <label for="expresion" class="etiqueta">Expresión</label>
                <div class="expresion">
                  <img class="pixel retrato" [src]="retrato(p, pj.expresion)" alt="" width="96" height="96" />
                  <select id="expresion" class="campo" [value]="pj.expresion" (change)="expresar(p.indice, $any($event.target).value)">
                    @for (e of expresiones; track e) { <option [value]="e" [selected]="e === pj.expresion">{{ nombreExpresion[e] }}</option> }
                  </select>
                </div>
                <p class="texto-secundario nota">Las 4 caras que tiene este personaje. El retrato cambia al elegir.</p>
              }
              @if (p.tipo === 'mueble') {
                <button type="button" class="boton" (click)="store.voltearMueble(s.id, p.indice)">Voltear</button>
              }
              <span id="pmov" class="etiqueta">Mover</span>
              <div role="group" aria-labelledby="pmov" class="flechas">
                <button type="button" class="boton" aria-label="Mover a la izquierda" (click)="desplazar(p, -8, 0)">←</button>
                <button type="button" class="boton" aria-label="Mover hacia arriba" (click)="desplazar(p, 0, -8)">↑</button>
                <button type="button" class="boton" aria-label="Mover hacia abajo" (click)="desplazar(p, 0, 8)">↓</button>
                <button type="button" class="boton" aria-label="Mover a la derecha" (click)="desplazar(p, 8, 0)">→</button>
              </div>
              <button type="button" class="boton boton-texto quitar" (click)="quitar(p)">Quitar de la sala</button>
            } @else {
              <h2 id="detalles">Nada elegido</h2>
              <p>Elige algo en la sala o en la lista «En esta sala».</p>
            }
          </section>
        </div>
      </div>
    } @else {
      <div class="pagina">
        <h1>Esta sala no está en el caso</h1>
        <a [routerLink]="rutas.a('/editor')" class="boton">Volver al caso</a>
      </div>
    }
  `,
  styles: `
    .cabeza { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
    .cabeza p { margin: 4px 0 0; }
    .tres-columnas { display: grid; grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(220px, 280px); gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .tres-columnas { grid-template-columns: 1fr; } }
    h2 { margin: 0 0 8px; font-size: var(--autoria-texto-20); line-height: 28px; }
    .lista, .lista ul { list-style: none; margin: 0; padding: 0; }
    .grupo { display: block; margin-top: 8px; font-weight: 700; font-size: var(--autoria-texto-16); color: var(--texto-secundario); }
    [role='option'] { min-height: 44px; display: flex; align-items: center; padding: 0 8px; border-radius: 8px; cursor: pointer; font-size: var(--autoria-texto-16); }
    @media (hover: hover) and (pointer: fine) { [role='option']:hover { background: var(--fondo); } }
    [role='option'][aria-selected='true'] { background: var(--primario-tinte); outline: 2px solid var(--primario); }
    .vacio, .puerta { font-size: var(--autoria-texto-16); padding: 4px 8px; }
    .columna-sala { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .escenario { position: relative; width: 100%; aspect-ratio: 960 / 528; overflow: hidden; border-radius: 10px; border: 1px solid var(--linea); background: var(--juego-escenario); touch-action: none; }
    .lienzo { position: absolute; left: 0; top: 0; width: 960px; height: 528px; transform: scale(var(--escala, 1)); transform-origin: 0 0; }
    .fondo { position: absolute; inset: 0; width: 960px; height: 528px; }
    .pieza {
      position: absolute; transform: translate(-50%, -100%); padding: 0; margin: 0; border: 0; background: none;
      cursor: grab; line-height: 0; display: flex; align-items: flex-end; justify-content: center;
      /* La sala se dibuja escalada: el mínimo de 24 px tiene que valer en pantalla, no en el dibujo. */
      min-width: calc(24px / var(--escala, 1)); min-height: calc(24px / var(--escala, 1));
    }
    .pieza:active { cursor: grabbing; }
    .pieza.elegida { outline: 3px dashed var(--foco); outline-offset: 3px; }
    .pieza img { image-rendering: pixelated; pointer-events: none; }
    .pieza img.espejo { transform: scaleX(-1); }
    .personaje { display: block; width: 48px; height: 72px; background-repeat: no-repeat; image-rendering: pixelated; pointer-events: none; }
    .ayuda { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .catalogo { display: flex; flex-direction: column; gap: 8px; }
    .catalogo h3 { margin: 0; font-size: var(--autoria-texto-18); }
    .catalogo-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; max-height: 220px; overflow: auto; }
    .catalogo-lista img { max-height: 28px; max-width: 40px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { min-height: 48px; padding: 0 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); }
    .columna-detalles { display: flex; flex-direction: column; gap: 8px; }
    .columna-detalles p { margin: 0; }
    .boton[aria-checked='true'], .boton[aria-selected='true'] { background: var(--primario-tinte); border-color: var(--primario); }
    .expresion { display: flex; gap: 12px; align-items: center; }
    .retrato { border-radius: 8px; border: 1px solid var(--linea); background: var(--fondo); }
    .nota { font-size: var(--autoria-texto-16); }
    .flechas { display: grid; grid-template-columns: repeat(4, 48px); gap: 6px; }
    .flechas .boton { padding: 0; }
    .quitar { color: var(--peligro); align-self: flex-start; }
  `,
})
export class SalaComponent {
  protected readonly rutas = inject(RutasAutoria);
  readonly salaId = input.required<string>();

  protected readonly store = inject(CasoStore);
  protected readonly ancho = ANCHO_SALA;
  protected readonly alto = ALTO_SALA;
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly miradas: { valor: Mirando; nombre: string }[] = [
    { valor: 'izquierda', nombre: 'Izquierda' },
    { valor: 'derecha', nombre: 'Derecha' },
  ];
  protected readonly pestanas: { tipo: TipoElemento; nombre: string }[] = [
    { tipo: 'mueble', nombre: 'Muebles' },
    { tipo: 'objeto', nombre: 'Objetos' },
    { tipo: 'personaje', nombre: 'Personajes' },
  ];

  protected readonly elegida = signal<string | null>(null);
  protected readonly anuncio = signal('');
  protected readonly pestana = signal<TipoElemento>('mueble');
  protected readonly nombrePestana = computed(() => this.pestanas.find((t) => t.tipo === this.pestana())?.nombre ?? '');
  protected readonly busqueda = signal('');
  protected readonly escala = signal(1);
  private readonly arrastre = signal<{ clave: string; x: number; y: number; movio: boolean } | null>(null);
  private readonly escenario = viewChild<ElementRef<HTMLElement>>('escenario');

  protected readonly sala = computed(() => this.store.caso()?.salas.find((s) => s.id === this.salaId()) ?? null);

  protected readonly piezas = computed<Pieza[]>(() => {
    const caso = this.store.caso();
    const s = this.sala();
    if (!caso || !s) return [];
    const nombreMueble = (ref: string) => caso.catalogo.muebles.find((m) => m.id === ref);
    const nombreObjeto = (ref: string) => caso.catalogo.objetos.find((o) => o.id === ref);
    const contar = new Map<string, number>();
    const etiqueta = (nombre: string, total: number) => {
      const n = (contar.get(nombre) ?? 0) + 1;
      contar.set(nombre, n);
      return total > 1 ? `${nombre} ${n}` : nombre;
    };
    const veces = (lista: { ref: string }[], ref: string) => lista.filter((x) => x.ref === ref).length;
    return [
      ...s.muebles.map((m, i) => {
        const c = nombreMueble(m.ref);
        return { clave: `mueble-${i}`, tipo: 'mueble' as const, indice: i, nombre: etiqueta(c?.nombre ?? m.ref, veces(s.muebles, m.ref)),
          x: m.x, y: m.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: !!m.espejo };
      }),
      ...s.objetos.map((o, i) => {
        const c = nombreObjeto(o.ref);
        return { clave: `objeto-${i}`, tipo: 'objeto' as const, indice: i, nombre: etiqueta(c?.nombre ?? o.ref, veces(s.objetos, o.ref)),
          x: o.x, y: o.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: false };
      }),
      ...s.personajes.map((p, i) => {
        const c = caso.personajes.find((x) => x.id === p.ref);
        return { clave: `personaje-${i}`, tipo: 'personaje' as const, indice: i, nombre: etiqueta(c?.nombre ?? p.ref, veces(s.personajes, p.ref)),
          x: p.x, y: p.y, arte: '', espejo: false,
          sprite: { url: rutaSpriteKit(c?.recipeId ?? p.ref), fila: p.mirando === 'izquierda' ? 1 : 2 } };
      }),
    ];
  });

  protected readonly piezasOrdenadas = computed(() => [...this.piezas()].sort((a, b) => a.y - b.y));
  protected readonly piezaElegida = computed(() => this.piezas().find((p) => p.clave === this.elegida()) ?? null);
  protected readonly grupos = computed(() => [
    { titulo: 'Muebles', piezas: this.piezas().filter((p) => p.tipo === 'mueble') },
    { titulo: 'Personajes', piezas: this.piezas().filter((p) => p.tipo === 'personaje') },
    { titulo: 'Objetos', piezas: this.piezas().filter((p) => p.tipo === 'objeto') },
  ]);

  /** Por qué no hay piezas que agregar: un caso sin lugar no tiene catálogo, pero sus salas se siguen editando. */
  protected readonly sinCatalogo = computed(() =>
    this.store.caso()?.lugarId
      ? 'El lugar no tiene piezas de este tipo.'
      : 'Este caso no viene de un lugar de la biblioteca, así que no hay piezas para agregar. Puedes mover, quitar y cambiar lo que ya está en la sala.');

  protected readonly catalogo = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const q = this.busqueda().trim().toLowerCase();
    const tipo = this.pestana();
    const items =
      tipo === 'mueble' ? caso.catalogo.muebles.map((m) => ({ ref: m.id, nombre: m.nombre, arte: rutaArte(caso.lugarId, m.arte) }))
      : tipo === 'objeto' ? caso.catalogo.objetos.map((o) => ({ ref: o.id, nombre: o.nombre, arte: rutaArte(caso.lugarId, o.arte) }))
      : caso.personajes.map((p) => ({ ref: p.id, nombre: p.nombre, arte: rutaRetrato(p.recipeId, 'neutral') }));
    return items.filter((i) => !q || i.nombre.toLowerCase().includes(q));
  });

  constructor() {
    afterNextRender(() => {
      const el = this.escenario()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const medir = () => this.escala.set(el.clientWidth / ANCHO_SALA || 1);
      medir();
      new ResizeObserver(medir).observe(el);
    });
  }

  protected encuadre(s: SalaCaso): string {
    return ENCUADRE_LEGIBLE[s.encuadre];
  }

  protected arte(relativa: string): string {
    return rutaArte(this.store.caso()!.lugarId, relativa);
  }

  protected retrato(p: Pieza, expresion: Expresion): string {
    return p.sprite!.url.replace('idle.png', `portrait-${expresion}.png`);
  }

  protected cantidad(tipo: TipoElemento): number {
    const caso = this.store.caso();
    if (!caso) return 0;
    return tipo === 'mueble' ? caso.catalogo.muebles.length : tipo === 'objeto' ? caso.catalogo.objetos.length : caso.personajes.length;
  }

  /** Posición dibujada: la guardada, o la del arrastre en curso. */
  protected posicion(p: Pieza): { x: number; y: number } {
    const a = this.arrastre();
    return a && a.clave === p.clave ? { x: a.x, y: a.y } : { x: p.x, y: p.y };
  }

  protected elegir(clave: string): void {
    this.elegida.set(clave);
    const p = this.piezas().find((x) => x.clave === clave);
    if (p) this.anuncio.set(`Elegido: ${p.nombre}.`);
  }

  protected desplazar(p: Pieza, dx: number, dy: number): void {
    this.store.moverElemento(this.salaId(), p.tipo, p.indice, p.x + dx, p.y + dy);
  }

  protected quitar(p: Pieza): void {
    this.store.quitarElemento(this.salaId(), p.tipo, p.indice);
    this.elegida.set(null);
    this.anuncio.set(`${p.nombre} se quitó de la sala. Ctrl+Z lo devuelve.`);
    this.escenario()?.nativeElement.focus();
  }

  protected agregar(ref: string, nombre: string): void {
    const tipo = this.pestana();
    this.store.agregarElemento(this.salaId(), tipo, ref);
    const indice = (tipo === 'mueble' ? this.sala()!.muebles : tipo === 'objeto' ? this.sala()!.objetos : this.sala()!.personajes).length - 1;
    this.elegir(`${tipo}-${indice}`);
    this.anuncio.set(`${nombre} se agregó en el centro de la sala.`);
  }

  protected mirar(indice: number, mirando: Mirando): void {
    this.store.editarPersonajeEnSala(this.salaId(), indice, { mirando });
  }

  protected expresar(indice: number, expresion: Expresion): void {
    this.store.editarPersonajeEnSala(this.salaId(), indice, { expresion });
  }

  protected async volverOriginal(): Promise<void> {
    await this.store.volverSalaOriginal(this.salaId());
    this.elegida.set(null);
    this.anuncio.set('La sala volvió a como viene en el lugar. Ctrl+Z lo deshace.');
  }

  protected teclaPieza(evento: KeyboardEvent, p: Pieza): void {
    const paso = evento.shiftKey ? 1 : 8;
    const mover: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    if (mover[evento.key]) {
      evento.preventDefault();
      evento.stopPropagation();
      this.elegida.set(p.clave);
      const actual = this.piezas().find((x) => x.clave === p.clave) ?? p;
      this.desplazar(actual, ...mover[evento.key]);
    } else if (evento.key === 'Delete' || evento.key === 'Supr') {
      evento.preventDefault();
      evento.stopPropagation();
      this.quitar(p);
    }
  }

  protected teclaGeneral(evento: KeyboardEvent): void {
    if (!(evento.ctrlKey || evento.metaKey)) return;
    const k = evento.key.toLowerCase();
    if (k === 'z' && !evento.shiftKey) {
      evento.preventDefault();
      this.store.deshacer();
    } else if (k === 'y' || (k === 'z' && evento.shiftKey)) {
      evento.preventDefault();
      this.store.rehacer();
    }
  }

  // ── Arrastre con puntero (el lienzo está escalado: se convierte a px de sala) ──

  private aSala(evento: PointerEvent): { x: number; y: number } {
    const r = this.escenario()!.nativeElement.getBoundingClientRect();
    const e = this.escala();
    return { x: Math.round((evento.clientX - r.left) / e), y: Math.round((evento.clientY - r.top) / e) };
  }

  protected empezarArrastre(evento: PointerEvent, p: Pieza): void {
    if (evento.button !== 0) return;
    this.elegida.set(p.clave);
    (evento.target as HTMLElement).setPointerCapture?.(evento.pointerId);
    this.arrastre.set({ clave: p.clave, x: p.x, y: p.y, movio: false });
    this.desfase = (() => {
      const punto = this.aSala(evento);
      return { dx: p.x - punto.x, dy: p.y - punto.y };
    })();
  }

  private desfase = { dx: 0, dy: 0 };

  protected arrastrar(evento: PointerEvent): void {
    const a = this.arrastre();
    if (!a) return;
    const punto = this.aSala(evento);
    this.arrastre.set({ clave: a.clave, x: punto.x + this.desfase.dx, y: punto.y + this.desfase.dy, movio: true });
  }

  protected soltar(): void {
    const a = this.arrastre();
    this.arrastre.set(null);
    if (!a || !a.movio) return;
    const p = this.piezas().find((x) => x.clave === a.clave);
    if (p) this.store.moverElemento(this.salaId(), p.tipo, p.indice, a.x, a.y);
  }
}
