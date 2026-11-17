import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input,
  signal, untracked, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { CasoStore, type TipoElemento } from '../../estado/caso.store';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { claveDeNuevo } from '../../modelo/hacia-api';
import { faltasPorSala, anclaDeElemento } from '../../modelo/salas-a-documento';
import type { FaltaDeSala } from '../../modelo/salas-a-documento';
import type { PlanDeSala } from '../../../simulator/sala/composicion';
import { LienzoDeSalaComponent } from './lienzo-de-sala.component';
import { actoresDeSala, salaParaLienzo } from './lienzo-de-sala';
import { PiezasDelMuroComponent } from './piezas-del-muro.component';
import { rutaArte, rutaRetrato, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { MovimientoPersonaje, SalaCaso } from '../../modelo/caso';
import { EXPRESIONES, type Expresion, type Mirando, type Punto } from '../../modelo/escenario';
import { ALTO_SALA, ANCHO_SALA, limitarAZona, zonaCaminable } from '../../modelo/geometria';
import { NOMBRE_MOVIMIENTO, TEXTO_PERSONA_A_ATENDER, revisarPuntoDeIda, tipoDeMovimiento } from '../../modelo/movimiento';
import { respuestasSinForma } from '../../modelo/revision';
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
  /** Para personajes: cómo se mueve y si es la persona a atender de la sala. */
  movimiento?: MovimientoPersonaje;
  personaClave?: boolean;
  /** La puso o la movió el asistente y el docente aún no la acepta. */
  marcaIa?: boolean;
}

/** Un punto elegido a mano con las flechas o con un clic. */
const PASO_GRANDE = 8;
const PASO_CHICO = 1;
/** Lo que se aleja de la persona el punto que se propone al empezar a elegirlo (px de sala), por orden de preferencia. */
const DISTANCIAS_INICIALES = [96, -96, 160, -160, 48, -48];

/**
 * Editor de una sala (tablero 26): mover, quitar y agregar muebles, objetos y personajes,
 * con deshacer siempre a mano y «Volver a la sala original». Todo lo que se arrastra se hace
 * también con teclado (flechas, Supr) y con botones.
 */
@Component({
  selector: 'app-sala',
  imports: [RouterLink, LienzoDeSalaComponent, PiezasDelMuroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'atencion.set(null)' },
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
                <li role="group" [attr.aria-label]="g.titulo" [attr.data-accion]="g.titulo === 'Personajes' ? 'cambiar-expresion como-se-mueve persona-a-atender' : null">
                  <span class="grupo" aria-hidden="true">{{ g.titulo }}</span>
                  <ul role="none">
                    @for (p of g.piezas; track p.clave) {
                      <li role="option" tabindex="0" [attr.aria-selected]="elegida() === p.clave"
                          (mouseenter)="atencion.set(p.clave)" (mouseleave)="soltarAtencion(p.clave)"
                          (focus)="atencion.set(p.clave)" (blur)="soltarAtencion(p.clave)" (click)="elegir(p.clave)" (keydown.enter)="elegir(p.clave)" (keydown.space)="elegir(p.clave); $event.preventDefault()">
                        {{ p.nombre }}{{ p.personaClave ? ' · ' + textoPersonaAAtender : '' }}{{ p.marcaIa ? ' · sugerido por la IA' : '' }}
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
            @if (s.estructura && catalogoPiezas.error()) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <p role="alert">No se pudo cargar el catálogo de piezas.</p>
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <button type="button" class="boton" (click)="catalogoPiezas.reintentar()">Reintentar</button>
            }
            @if (s.estructura && s.estructura.ancho <= 960) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <button type="button" class="boton" (click)="escalaPiezas.set(escalaPiezas() === 1 ? 2 : 1)">
                {{ escalaPiezas() === 1 ? '×2' : '×1' }}
              </button>
            }
            <div [class.desplazamiento]="s.estructura">
            <div class="escenario" #escenario [id]="'sala-' + s.id" [class.por-piezas]="s.estructura"
                 [style.width.px]="s.estructura ? s.estructura.ancho * escalaPiezas() : null"
                 [style.height.px]="s.estructura ? alto * escalaPiezas() : null" tabindex="-1"
                 data-accion="mover-mueble" (keydown)="teclaGeneral($event)" (click)="clicEnSala($event)"
                 [style.--escala]="s.estructura ? escalaPiezas() : escala()" (pointermove)="arrastrar($event)"
                 (pointerup)="soltar()" (pointercancel)="soltar()">
              <div class="lienzo" [style.width.px]="s.estructura?.ancho ?? ancho">
                @if (s.estructura) {
                  @if (!catalogoPiezas.error() && catalogoPiezas.manifiesto() && salaLienzo(); as salaLienzoActual) {
                    <app-lienzo-de-sala [sala]="salaLienzoActual" [actores]="actoresLienzo()"
                      [escala]="1" (listo)="plan.set($event.plan)" />
                    <app-piezas-del-muro [sala]="s" [plan]="plan()" [faltas]="faltasSala()"
                      [escala]="escalaPiezas()" (elegida)="piezaDeMuroElegida.set($event)" />
                  }
                } @else {
                  <img class="pixel fondo" [src]="arte(s.fondo)" alt="" [width]="ancho" [height]="alto" draggable="false" />
                }
                <!-- Hasta dónde va y viene cada persona: una línea discreta y una marca en forma de rombo (solo adorno; el dato está en los detalles). -->
                <svg class="trazos" [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" aria-hidden="true">
                  @for (t of trazos(); track t.clave) {
                    <line class="ida" [attr.data-ida]="t.clave" [attr.x1]="t.desde.x" [attr.y1]="t.desde.y" [attr.x2]="t.hasta.x" [attr.y2]="t.hasta.y"></line>
                    <path class="hasta" [attr.data-hasta]="t.clave" [attr.d]="rombo(t.hasta)"></path>
                  }
                  @if (lineaDelBorrador(); as l) {
                    <line class="ida borrador" data-borrador [attr.x1]="l.desde.x" [attr.y1]="l.desde.y" [attr.x2]="l.hasta.x" [attr.y2]="l.hasta.y"></line>
                  }
                </svg>
                @for (p of piezasOrdenadas(); track p.clave) {
                  <button type="button" class="pieza" [id]="idObjeto(p)" data-equivalente="lista-de-la-sala"
                          [attr.data-elemento]="p.clave" [class.elegida]="elegida() === p.clave"
                          [class.atendida]="atencion() === p.clave" [class.marca-ia]="p.marcaIa"
                          [class.dibujo-en-lienzo]="s.estructura"
                          [attr.aria-label]="p.nombre + (p.personaClave ? ', ' + textoPersonaAAtender : '') + (p.marcaIa ? ', sugerido por la IA' : '') + (elegida() === p.clave ? ', elegido' : '')"
                          [style.left.px]="posicion(p).x" [style.top.px]="posicion(p).y" [style.z-index]="p.y"
                          (pointerdown)="empezarArrastre($event, p)" (click)="elegir(p.clave)" (keydown)="teclaPieza($event, p)">
                    @if (p.personaClave) {
                      <span class="marca-atender" aria-hidden="true">
                        <svg class="chevron" viewBox="0 0 14 9" width="14" height="9"><path d="M0 0H14L7 9Z"></path></svg>
                        <span class="texto-marca">A atender</span>
                      </span>
                    }
                    @if (p.sprite) {
                      <span class="personaje" [style.background-image]="'url(' + p.sprite.url + ')'"
                            [style.background-position]="'0 ' + (-72 * p.sprite.fila) + 'px'"></span>
                    } @else {
                      <img class="pixel" [src]="p.arte" alt="" draggable="false" [class.espejo]="p.espejo" />
                    }
                  </button>
                }
                @if (punto(); as d) {
                  <button type="button" class="punto-ida" data-equivalente="botones-del-punto" [attr.data-x]="d.x" [attr.data-y]="d.y"
                          [style.left.px]="d.x" [style.top.px]="d.y" [style.z-index]="d.y + 1000" [attr.aria-label]="nombreDelPunto()"
                          (keydown)="teclaPunto($event)" (click)="$event.stopPropagation()"></button>
                }
              </div>
            </div>
            </div>
            @if (s.estructura && faltasSala().length) {
              <section aria-labelledby="faltas-sala">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h3 id="faltas-sala">Por resolver en esta sala</h3>
                <ul>
                  @for (f of faltasSala(); track $index) {
                    <li [id]="'falta-' + s.id + '-' + $index">{{ f.regla }}: {{ f.mensaje }}
                      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                      <button type="button" (click)="irAFalta(f)">Ir a la pieza</button>
                    </li>
                  }
                </ul>
              </section>
            }
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
              @if (p.marcaIa) {
                <p class="marca-ia-aviso"><span class="pildora">Sugerido por la IA</span> Lo puso o lo movió el asistente; revísalo y acéptalo.</p>
                <button type="button" class="boton" data-accion="aceptar-ia" [attr.aria-label]="'Aceptar lo sugerido: ' + p.nombre" (click)="aceptarIa(p)">Aceptar</button>
              }
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
                <p class="texto-secundario nota">Las {{ expresiones.length }} caras que tiene este personaje. El retrato cambia al elegir.</p>

                <div class="bloque" data-accion="como-se-mueve">
                  <span id="pmueve" class="etiqueta">Cómo se mueve</span>
                  <div role="radiogroup" aria-labelledby="pmueve" class="acciones">
                    @for (m of movimientos; track m.valor) {
                      <button type="button" role="radio" class="boton" [attr.aria-checked]="tipoMostrado(p) === m.valor"
                              (click)="elegirMovimiento(p, m.valor)">{{ m.nombre }}</button>
                    }
                  </div>
                  @if (tipoMostrado(p) === 'va-y-viene') {
                    <div role="group" aria-labelledby="phasta" class="hasta-donde">
                      <span id="phasta" class="etiqueta">Hasta dónde va</span>
                      @if (punto()) {
                        <p class="texto-secundario nota">Mueve el punto con las flechas del teclado o con estos botones, o haz clic en la sala. «Listo» lo fija.</p>
                        <div role="group" aria-label="Mover el punto" class="flechas">
                          <button type="button" class="boton" aria-label="Mover el punto a la izquierda" (click)="moverPunto(-8, 0)">←</button>
                          <button type="button" class="boton" aria-label="Mover el punto hacia arriba" (click)="moverPunto(0, -8)">↑</button>
                          <button type="button" class="boton" aria-label="Mover el punto hacia abajo" (click)="moverPunto(0, 8)">↓</button>
                          <button type="button" class="boton" aria-label="Mover el punto a la derecha" (click)="moverPunto(8, 0)">→</button>
                        </div>
                        <p role="status" class="nota aviso-punto" data-aviso-punto>{{ avisoPunto() }}</p>
                        <div class="acciones">
                          <button type="button" class="boton boton-primario" [attr.aria-disabled]="avisoPunto() !== ''" (click)="fijarPunto()">Listo</button>
                          <button type="button" class="boton" (click)="cancelarPunto(true)">Cancelar</button>
                        </div>
                      } @else {
                        <p class="texto-secundario nota">{{ textoDelPunto(p) }}</p>
                        <p role="status" class="nota aviso-punto" data-aviso-ida>{{ avisoDeIda() }}</p>
                        <button type="button" class="boton" data-ir-punto (click)="empezarPunto(p)">Elegir el punto</button>
                      }
                    </div>
                  }
                </div>

                <div class="bloque" data-accion="persona-a-atender">
                  <label class="casilla" for="patender">
                    <input id="patender" type="checkbox" data-persona-a-atender aria-describedby="patender-nota" [checked]="p.personaClave === true"
                           (change)="marcarPersonaAAtender(p, $any($event.target).checked)" />
                    Persona a atender
                  </label>
                  <p id="patender-nota" class="texto-secundario nota">El estudiante la ve señalada con una marca sobre la cabeza. Solo puede haber una por sala.</p>
                  <p role="status" class="nota" data-aviso-persona>{{ avisoPersona() }}</p>
                </div>
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
    .desplazamiento { max-width: 100%; overflow-x: auto; }
    .escenario.por-piezas { aspect-ratio: auto; overflow: hidden; flex: none; }
    .dibujo-en-lienzo > img, .dibujo-en-lienzo > .personaje { visibility: hidden; }
    .escenario { position: relative; width: 100%; aspect-ratio: 960 / 528; overflow: hidden; border-radius: 10px; border: 1px solid var(--linea); background: var(--juego-escenario); touch-action: none; }
    .lienzo { position: absolute; left: 0; top: 0; width: 960px; height: 528px; transform: scale(var(--escala, 1)); transform-origin: 0 0; }
    .fondo { position: absolute; inset: 0; width: 960px; height: 528px; }
    .pieza.marca-ia { outline: 2px dashed var(--borde-control); outline-offset: 2px; }
    .marca-ia-aviso { margin: 0; }
    .pieza {
      position: absolute; transform: translate(-50%, -100%); padding: 0; margin: 0; border: 0; background: none;
      cursor: grab; line-height: 0; display: flex; align-items: flex-end; justify-content: center;
      /* La sala se dibuja escalada: el mínimo de 24 px tiene que valer en pantalla, no en el dibujo. */
      min-width: calc(24px / var(--escala, 1)); min-height: calc(24px / var(--escala, 1));
    }
    .pieza:active { cursor: grabbing; }
    /* La persona a atender: un chevrón y su rótulo sobre la cabeza, en el acento del juego (nunca el morado de la guía). */
    .marca-atender { position: absolute; bottom: calc(100% + 2px); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; pointer-events: none; line-height: 1.2; }
    .marca-atender .chevron { display: block; fill: var(--juego-acento); stroke: var(--juego-escenario); stroke-width: 1.5; }
    .marca-atender .texto-marca { padding: 1px 5px; border-radius: 4px; background: var(--juego-escenario); color: var(--juego-acento); font-weight: 700; white-space: nowrap; font-size: calc(16px / var(--escala, 1)); }
    .trazos { position: absolute; inset: 0; width: 960px; height: 528px; pointer-events: none; z-index: var(--autoria-capa-3); overflow: visible; }
    .trazos .ida { stroke: var(--tinta); stroke-width: 3; stroke-dasharray: 8 6; opacity: 0.55; }
    .trazos .ida.borrador { stroke: var(--foco); opacity: 0.9; }
    .trazos .hasta { fill: var(--superficie); stroke: var(--tinta); stroke-width: 3; }
    .punto-ida {
      position: absolute; transform: translate(-50%, -50%); padding: 0; margin: 0; cursor: crosshair;
      width: calc(32px / var(--escala, 1)); height: calc(32px / var(--escala, 1)); min-width: 24px; min-height: 24px; border-radius: 50%;
      background: var(--superficie); border: 3px dashed var(--tinta); box-shadow: 0 0 0 3px var(--foco);
    }
    .punto-ida:active { opacity: 0.7; }
    .punto-ida:focus-visible { outline: 3px solid var(--foco); outline-offset: 4px; }
    .bloque, .hasta-donde { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    .casilla { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; font-size: var(--autoria-texto-16); font-weight: 700; }
    .casilla input { width: 24px; height: 24px; flex: none; accent-color: var(--primario); }
    .aviso-punto:not(:empty) { color: var(--aviso-texto); font-weight: 700; }
    .pieza.elegida { outline: 3px dashed var(--foco); outline-offset: 3px; }
    /* La atención (cursor o foco en la lista) señala la pieza con un trazo sólido; lo elegido pesa más y conserva el suyo. */
    .pieza.atendida:not(.elegida) { outline: 3px solid var(--primario); outline-offset: 3px; }
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
  private readonly dialogo = inject(UiDialog);
  private readonly injector = inject(Injector);
  readonly salaId = input.required<string>();

  protected readonly store = inject(CasoStore);
  protected readonly catalogoPiezas = inject(CatalogoDePiezas);
  protected readonly salaLienzo = computed(() => {
    const sala = this.sala();
    return sala ? salaParaLienzo(sala) : null;
  });
  protected readonly actoresLienzo = computed(() => {
    const sala = this.sala();
    return sala ? actoresDeSala(sala, this.store.caso() ?? undefined) : [];
  });
  protected readonly plan = signal<PlanDeSala | null>(null);
  protected readonly escalaPiezas = signal<1 | 2>(1);
  protected readonly piezaDeMuroElegida = signal<string | null>(null);
  protected readonly faltas = signal(new Map<string, FaltaDeSala[]>());
  protected readonly faltasSala = computed(() => this.faltas().get(this.salaId()) ?? []);

  protected readonly clavesObjetos = computed(() => {
    const sala = this.sala(), caso = this.store.caso();
    const claves = new Map<string, string>(), usadas = new Set<string>();
    if (!sala || !caso) return claves;
    sala.muebles.forEach((m, i) => {
      if (caso.catalogo.muebles.some(f => f.id === m.ref)) claves.set(`mueble-${i}`, claveDeNuevo(m.clave, m.ref, usadas));
    });
    sala.objetos.forEach((o, i) => {
      if (caso.catalogo.objetos.some(f => f.id === o.ref)) claves.set(`objeto-${i}`, claveDeNuevo(o.clave, o.ref, usadas));
    });
    sala.personajes.forEach((p, i) => claves.set(`personaje-${i}`, claveDeNuevo(p.clave, p.ref, usadas)));
    return claves;
  });
  protected idObjeto(p: Pieza): string | null {
    const id = this.clavesObjetos().get(p.clave);
    return id ? anclaDeElemento(this.salaId(), { tipo: 'objeto', id }) : null;
  }
  protected irAFalta(falta: FaltaDeSala): void {
    document.getElementById(anclaDeElemento(this.salaId(), falta.elemento))?.focus();
  }
  protected readonly ancho = ANCHO_SALA;
  protected readonly alto = ALTO_SALA;
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly miradas: { valor: Mirando; nombre: string }[] = [
    { valor: 'izquierda', nombre: 'Izquierda' },
    { valor: 'derecha', nombre: 'Derecha' },
  ];
  protected readonly textoPersonaAAtender = TEXTO_PERSONA_A_ATENDER;
  protected readonly movimientos: { valor: 'quieto' | 'deambula' | 'va-y-viene'; nombre: string }[] = [
    { valor: 'quieto', nombre: NOMBRE_MOVIMIENTO['quieto'] },
    { valor: 'deambula', nombre: NOMBRE_MOVIMIENTO['deambula'] },
    { valor: 'va-y-viene', nombre: NOMBRE_MOVIMIENTO['va-y-viene'] },
  ];
  protected readonly pestanas: { tipo: TipoElemento; nombre: string }[] = [
    { tipo: 'mueble', nombre: 'Muebles' },
    { tipo: 'objeto', nombre: 'Objetos' },
    { tipo: 'personaje', nombre: 'Personajes' },
  ];

  protected readonly elegida = signal<string | null>(null);
  /** La cosa de la lista «En esta sala» en la que está el cursor o el foco: se señala en la sala. Esc la suelta. */
  protected readonly atencion = signal<string | null>(null);
  protected readonly anuncio = signal('');
  protected readonly pestana = signal<TipoElemento>('mueble');
  protected readonly nombrePestana = computed(() => this.pestanas.find((t) => t.tipo === this.pestana())?.nombre ?? '');
  protected readonly busqueda = signal('');
  /** La persona que se eligió «Va y viene» y aún no tiene su punto (su movimiento guardado no cambia hasta fijarlo). */
  protected readonly pendiente = signal<string | null>(null);
  /** El punto que se está eligiendo (aún sin fijar); `null` si no se está eligiendo ninguno. */
  protected readonly punto = signal<Punto | null>(null);
  protected readonly avisoPersona = signal('');
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
          x: m.x, y: m.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: !!m.espejo, marcaIa: m.marcaIa === true };
      }),
      ...s.objetos.map((o, i) => {
        const c = nombreObjeto(o.ref);
        return { clave: `objeto-${i}`, tipo: 'objeto' as const, indice: i, nombre: etiqueta(c?.nombre ?? o.ref, veces(s.objetos, o.ref)),
          x: o.x, y: o.y, arte: rutaArte(caso.lugarId, c?.arte ?? ''), espejo: false, marcaIa: o.marcaIa === true };
      }),
      ...s.personajes.map((p, i) => {
        const c = caso.personajes.find((x) => x.id === p.ref);
        return { clave: `personaje-${i}`, tipo: 'personaje' as const, indice: i, nombre: etiqueta(c?.nombre ?? p.ref, veces(s.personajes, p.ref)),
          x: p.x, y: p.y, arte: '', espejo: false,
          sprite: { url: rutaSpriteKit(c?.recipeId ?? p.ref), fila: p.mirando === 'izquierda' ? 1 : 2 },
          movimiento: p.movimiento ?? 'quieto', personaClave: p.personaClave === true, marcaIa: p.marcaIa === true };
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

  /** Las líneas y marcas de «va y viene» de las personas de la sala, con la ida donde están hoy. */
  protected readonly trazos = computed(() =>
    this.piezas().flatMap((p) => {
      const m = p.movimiento;
      return p.tipo === 'personaje' && m !== undefined && typeof m !== 'string'
        ? [{ clave: p.clave, desde: { x: p.x, y: p.y }, hasta: m.hasta }] : [];
    }));

  /** La línea hasta el punto que se está eligiendo. */
  protected readonly lineaDelBorrador = computed(() => {
    const d = this.punto();
    const p = this.piezaElegida();
    return d && p ? { desde: { x: p.x, y: p.y }, hasta: d } : null;
  });

  /** Por qué el punto elegido no sirve, o vacío si sirve. */
  protected readonly avisoPunto = computed(() => {
    const d = this.punto();
    const p = this.piezaElegida();
    const caso = this.store.caso();
    const s = this.sala();
    if (!d || !p || !caso || !s) return '';
    const revisado = revisarPuntoDeIda(s, caso.catalogo, p, d);
    return revisado.ok ? '' : revisado.motivo;
  });

  /** Si el punto ya fijado dejó de servir porque algo se movió (un mueble encima, la persona muy cerca), lo dice; vacío si sirve. */
  protected readonly avisoDeIda = computed(() => {
    const p = this.piezaElegida();
    const caso = this.store.caso();
    const s = this.sala();
    if (!p || !caso || !s || typeof p.movimiento !== 'object' || this.punto()) return '';
    const revisado = revisarPuntoDeIda(s, caso.catalogo, p, p.movimiento.hasta);
    return revisado.ok ? '' : `El punto ya no sirve: ${revisado.motivo}`;
  });

  protected readonly nombreDelPunto = computed(() => {
    const p = this.piezaElegida();
    return `Punto hasta donde va y viene ${p?.nombre ?? 'la persona'}. Muévelo con las flechas del teclado, Enter lo fija y Esc cancela.`;
  });

  protected rombo(c: Punto): string {
    return `M ${c.x} ${c.y - 10} L ${c.x + 10} ${c.y} L ${c.x} ${c.y + 10} L ${c.x - 10} ${c.y} Z`;
  }

  protected soltarAtencion(clave: string): void {
    if (this.atencion() === clave) this.atencion.set(null);
  }

  constructor() {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const caso = this.store.caso(), reglas = this.catalogoPiezas.reglas(), error = this.catalogoPiezas.error();
      if (!caso || !reglas || error) {
        clearTimeout(temporizador); temporizador = undefined; this.faltas.set(new Map()); return;
      }
      if (temporizador) return;
      temporizador = setTimeout(() => {
        temporizador = undefined;
        const actual = this.store.caso(), catalogo = this.catalogoPiezas.reglas();
        if (actual && catalogo && !this.catalogoPiezas.error()) this.faltas.set(faltasPorSala(actual, catalogo));
      }, 100);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(temporizador));
    // Lo que se está decidiendo de una persona (el punto, el aviso) no pasa a la siguiente cosa que se elige.
    effect(() => {
      this.elegida();
      untracked(() => {
        this.pendiente.set(null);
        this.punto.set(null);
        this.avisoPersona.set('');
      });
    });
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

  /** Da por revisado lo que el asistente puso o movió: la marca baja y el foco queda en la pieza. */
  protected aceptarIa(p: Pieza): void {
    this.store.aceptarIa({ salaId: this.salaId(), tipo: p.tipo, indice: p.indice });
    this.anuncio.set(`Aceptado: ${p.nombre}.`);
    setTimeout(() => this.escenario()?.nativeElement.querySelector<HTMLElement>(`[data-elemento="${p.clave}"]`)?.focus());
  }

  protected desplazar(p: Pieza, dx: number, dy: number): void {
    this.store.moverElemento(this.salaId(), p.tipo, p.indice, p.x + dx, p.y + dy);
  }

  /**
   * Quita la pieza de la sala. Si es la última persona y al quitarla alguna escena de la sala se queda con respuestas que nada
   * ofrece (ni otra persona ni un objeto del mapa), antes se pregunta: el estudiante no podría responder.
   */
  protected async quitar(p: Pieza): Promise<void> {
    const afectadas = p.tipo === 'personaje' && this.sala()!.personajes.length === 1 ? this.escenasConRespuestasSinForma() : [];
    if (afectadas.length > 0) {
      const titulos = afectadas.map((t) => `«${t}»`).join(', ');
      const respuesta = await this.dialogo.consequence({
        title: 'Esta sala se quedaría sin personas',
        consequence: `Si quitas a ${p.nombre}, ${afectadas.length === 1 ? `la escena ${titulos} se queda` : `las escenas ${titulos} se quedan`} `
          + 'sin nadie con quien hablar: el estudiante no podrá responder. Puedes agregar otra persona después.',
        continueLabel: 'Dejarla en la sala',
        proceedLabel: 'Quitarla de todos modos',
      });
      if (respuesta !== 'proceed') return;
    }
    this.store.quitarElemento(this.salaId(), p.tipo, p.indice);
    this.elegida.set(null);
    this.anuncio.set(`${p.nombre} se quitó de la sala. Ctrl+Z lo devuelve.`);
    this.escenario()?.nativeElement.focus();
  }

  /** Los títulos de las escenas de esta sala que, sin personas, se quedarían con respuestas que nada ofrece. */
  private escenasConRespuestasSinForma(): string[] {
    const sala = this.sala();
    if (!sala) return [];
    const sinPersonas = { ...sala, personajes: [] };
    return (this.store.caso()?.escenas ?? [])
      .filter((e) => e.salaId === sala.id && respuestasSinForma(e, sinPersonas).length > 0)
      .map((e) => e.titulo);
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

  // ── Cómo se mueve ──────────────────────────────────────────────────────────

  /** El tipo que muestran las opciones: el guardado o, si se eligió «Va y viene» y falta el punto, ese. */
  protected tipoMostrado(p: Pieza): 'quieto' | 'deambula' | 'va-y-viene' {
    return this.pendiente() === p.clave ? 'va-y-viene' : tipoDeMovimiento(p.movimiento ?? 'quieto');
  }

  protected textoDelPunto(p: Pieza): string {
    return typeof p.movimiento === 'object' ? 'Va y viene hasta la marca de la sala.' : 'Todavía no elegiste el punto.';
  }

  protected elegirMovimiento(p: Pieza, tipo: 'quieto' | 'deambula' | 'va-y-viene'): void {
    this.cancelarPunto(false);
    if (tipo === 'va-y-viene') {
      if (tipoDeMovimiento(p.movimiento ?? 'quieto') !== 'va-y-viene') {
        this.pendiente.set(p.clave);
        this.anuncio.set('Elige hasta dónde va y viene con «Elegir el punto».');
      }
      return;
    }
    this.pendiente.set(null);
    this.store.fijarMovimiento(this.salaId(), p.indice, tipo);
    this.anuncio.set(`${p.nombre}: ${NOMBRE_MOVIMIENTO[tipo].toLowerCase()}.`);
  }

  /** Un punto para empezar: el que ya tenía o uno libre a un lado de la persona. */
  private puntoInicial(p: Pieza): Punto {
    if (typeof p.movimiento === 'object') return { ...p.movimiento.hasta };
    const caso = this.store.caso();
    const s = this.sala();
    const zona = zonaCaminable(s!.encuadre);
    const candidatos = DISTANCIAS_INICIALES.map((dx) => limitarAZona(zona, p.x + dx, p.y));
    const libre = caso ? candidatos.find((c) => revisarPuntoDeIda(s!, caso.catalogo, p, c).ok) : undefined;
    return libre ?? candidatos[0];
  }

  protected empezarPunto(p: Pieza): void {
    this.punto.set(this.puntoInicial(p));
    this.anuncio.set('Mueve el punto con las flechas del teclado y pulsa Enter, o haz clic en la sala. «Listo» lo fija.');
    afterNextRender(() => this.escenario()?.nativeElement.querySelector<HTMLElement>('.punto-ida')?.focus(), { injector: this.injector });
  }

  protected moverPunto(dx: number, dy: number): void {
    const actual = this.punto();
    const s = this.sala();
    if (!actual || !s) return;
    this.punto.set(limitarAZona(zonaCaminable(s.encuadre), actual.x + dx, actual.y + dy));
  }

  protected teclaPunto(evento: KeyboardEvent): void {
    if (evento.ctrlKey || evento.metaKey) return;
    const paso = evento.shiftKey ? PASO_CHICO : PASO_GRANDE;
    const mover: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso],
    };
    if (mover[evento.key]) {
      evento.preventDefault();
      evento.stopPropagation();
      this.moverPunto(...mover[evento.key]);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      evento.stopPropagation();
      this.fijarPunto();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      this.cancelarPunto(true);
    }
  }

  /** Un clic en la sala, mientras se elige el punto, lo pone ahí (dentro de la zona por donde se camina). */
  protected clicEnSala(evento: MouseEvent): void {
    const s = this.sala();
    if (!this.punto() || !s) return;
    if ((evento.target as HTMLElement | null)?.closest('.pieza, .punto-ida')) return;
    const donde = this.aSala(evento);
    this.punto.set(limitarAZona(zonaCaminable(s.encuadre), donde.x, donde.y));
  }

  /** «Listo»: fija el punto. Si cae en un mueble o fuera de la sala, no se fija y se sigue eligiendo. */
  protected fijarPunto(): void {
    const d = this.punto();
    const p = this.piezaElegida();
    if (!d || !p) return;
    const resultado = this.store.fijarMovimiento(this.salaId(), p.indice, { tipo: 'va-y-viene', hasta: d });
    if (!resultado.ok) {
      this.anuncio.set(resultado.motivo);
      return;
    }
    this.punto.set(null);
    this.pendiente.set(null);
    this.anuncio.set(`${p.nombre} va y viene hasta el punto elegido. Ctrl+Z lo deshace.`);
    afterNextRender(() => this.escenario()?.nativeElement.ownerDocument.querySelector<HTMLElement>('[data-ir-punto]')?.focus(), { injector: this.injector });
  }

  /** Deja de elegir el punto sin cambiar nada; con `devolverElFoco` el foco vuelve a «Elegir el punto». */
  protected cancelarPunto(devolverElFoco: boolean): void {
    if (this.punto() === null) return;
    this.punto.set(null);
    this.anuncio.set('No se cambió el punto.');
    if (devolverElFoco) {
      afterNextRender(() => this.escenario()?.nativeElement.ownerDocument.querySelector<HTMLElement>('[data-ir-punto]')?.focus(), { injector: this.injector });
    }
  }

  // ── Persona a atender ──────────────────────────────────────────────────────

  protected marcarPersonaAAtender(p: Pieza, marcada: boolean): void {
    const anterior = this.store.marcarPersonaAAtender(this.salaId(), p.indice, marcada);
    this.avisoPersona.set(marcada
      ? `Ahora la persona a atender es ${p.nombre}.${anterior ? ` ${anterior} dejó de serlo.` : ''}`
      : 'Esta sala ya no tiene persona a atender.');
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
      void this.quitar(p);
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

  private aSala(evento: MouseEvent): { x: number; y: number } {
    const r = this.escenario()!.nativeElement.getBoundingClientRect();
    const e = this.sala()?.estructura ? this.escalaPiezas() : this.escala();
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
