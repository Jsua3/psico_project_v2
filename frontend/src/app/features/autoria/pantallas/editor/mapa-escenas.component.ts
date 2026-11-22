import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, TemplateRef, afterNextRender, computed, effect, inject, input,
  output, signal, viewChild,
} from '@angular/core';

import { rutaArte } from '../../modelo/biblioteca.service';
import { NOMBRE_AVISO, type Aviso } from '../../modelo/caminos';
import type { CasoBorrador, Escena } from '../../modelo/caso';
import { escenasEnOrden } from '../../modelo/progreso';
import { NOMBRE_INTENSIDAD, plural } from '../../modelo/textos';
import { ALTO_ESCENA, ANCHO_ESCENA } from '../../modelo/trazado';

export type AccionEscena =
  | { tipo: 'duplicar' | 'conectar' | 'borrar'; escenaId: string }
  | { tipo: 'final'; escenaId: string; esFinal: boolean }
  | { tipo: 'mover'; escenaId: string; x: number; y: number };

interface Flecha {
  id: string;
  origen: string;
  destino: string;
  texto: string;
  /** A dónde lleva la respuesta, dicho con palabras. */
  hacia: string;
  d: string;
  medio: { x: number; y: number };
  deElegida: boolean;
}

interface Punto { x: number; y: number }

const MARGEN = 32;
const PASO_MOVER = 24;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
/**
 * Por debajo de este zoom la tarjeta pasa a su forma compacta (número, marcas y título grande). EDITOR.md §4.2 dice 60 %,
 * pero a 60 % el texto de 16 px se ve a 9,6 px: ilegible igual. A 75 % queda en 12 px, el mínimo que se lee (D-38).
 */
const UMBRAL_COMPACTO = 0.75;
/** Alto mínimo del lienzo: con menos no se ven ni dos filas de escenas. */
const ALTO_MINIMO = 320;
/** Píxeles de pantalla que «Ver todo» deja libres entre el caso y el borde del lienzo (repartidos a los dos lados). */
const AIRE = 48;

/**
 * Mapa de escenas, la vista «Caminos» (tablero 25 y EDITOR.md §4.2, regla 6): cada escena es una tarjeta, cada respuesta
 * una flecha.
 *
 * Patrón: componente de presentación (Composite del editor). Recibe el caso y los avisos, y cuenta lo que pasa por sus
 * salidas; no conoce el store. Lo único que mide es su propio lienzo.
 *
 * - Ocupa todo el alto que le deja la zona central y, al abrirse, se ajusta solo para que se vea el caso entero («Ver todo
 *   el mapa», sin guardar posiciones). Si la ventana cambia y la docente no tocó el zoom, se vuelve a ajustar.
 * - Por debajo del 75 % las tarjetas pasan a su forma compacta; el título completo va en el globo y en el nombre accesible.
 * - Los números son los del orden de la historia: los mismos del riel y de «Escena 2 de 8».
 * - Al pasar el cursor o enfocar una escena se ve su sala, y al hacerlo con una respuesta, qué dice y a dónde lleva (estados
 *   de atención, tablero 50). Esos globos viven fuera de la escala: se leen igual a cualquier zoom. Esc los pliega sin
 *   quitar el foco ni el cursor de donde están (WCAG 1.4.13).
 * - Las acciones están en el clic derecho, en Mayús+F10 o la tecla de menú, y en el botón «Acciones». El menú se pinta
 *   fuera del marco (capa del CDK): lleva la piel de quien lo abre, para salir oscuro en oscuro (§4.7).
 */
@Component({
  selector: 'app-mapa-escenas',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'plegarAtencion()' },
  template: `
    <div class="barra">
      <div class="grupo">
        <button type="button" class="boton" data-accion="conectar-escenas marcar-final" [cdkMenuTriggerFor]="elegidaEscena() ? menu : null"
                #trigger="cdkMenuTriggerFor" (click)="!elegidaEscena() && pista.set('Primero elige una escena en el mapa.')"
                [attr.aria-label]="elegidaEscena() ? 'Acciones de la escena ' + elegidaEscena()!.titulo : 'Acciones de la escena'"
                [attr.aria-disabled]="elegidaEscena() ? null : 'true'">Acciones</button>
        <!-- Lo que el editor agrega a la barra (agregar una escena, ordenar el mapa). -->
        <ng-content />
      </div>
      <div class="grupo">
        <div class="teclas-ancla">
          <button type="button" class="boton cuadrado" aria-label="Teclas del mapa" title="Teclas del mapa" aria-controls="mapa-ayuda"
                  [attr.aria-expanded]="tecladoAbierto()" (click)="tecladoAbierto.set(!tecladoAbierto())">
            <svg class="icono" viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="5" width="16" height="10" rx="2" /><path d="M5 8.5h1M8.5 8.5h1M12 8.5h1M15 8.5h0M6.5 12h7" /></svg>
          </button>
          <!-- La ayuda existe siempre (describe el mapa para el lector); a la vista solo cuando se pide. -->
          <div id="mapa-ayuda" class="globo-teclas" [hidden]="!tecladoAbierto()">
            <p>Mapa del caso: {{ plural(caso().escenas.length, 'escena', 'escenas') }}.</p>
            <ul>
              <li><kbd>←</kbd> <kbd>→</kbd> van a la escena conectada; <kbd>↑</kbd> <kbd>↓</kbd>, a la anterior o la siguiente de la historia.</li>
              <li><kbd>Enter</kbd> abre su guion; <kbd>Supr</kbd> la borra.</li>
              <li><kbd>Mayús</kbd>+<kbd>F10</kbd> abre sus acciones; <kbd>Ctrl</kbd> y la rueda acercan o alejan.</li>
            </ul>
          </div>
        </div>
        <div role="group" aria-label="Zoom del mapa" class="zoom-grupo">
          <button type="button" class="boton cuadrado" aria-label="Alejar" (click)="zoomar(-0.1)">−</button>
          <span class="zoom">{{ porcentaje() }} %</span>
          <button type="button" class="boton cuadrado" aria-label="Acercar" (click)="zoomar(0.1)">+</button>
        </div>
        <button type="button" class="boton" aria-label="Ver todo el mapa" (click)="verTodo()">Ver todo</button>
      </div>
    </div>

    <p role="status" class="texto-secundario pista">{{ pista() }}</p>

    @if (moviendo(); as m) {
      <div role="group" aria-label="Moviendo una escena" class="tarjeta moviendo">
        <p role="status"><strong>Moviendo: {{ tituloDe(m.escenaId) }}</strong></p>
        <p class="texto-secundario">Usa las flechas del teclado o estos botones. <kbd>Enter</kbd> o «Listo» confirma; <kbd>Esc</kbd> cancela.</p>
        <div class="acciones">
          <button type="button" class="boton cuadrado" aria-label="Mover a la izquierda" (click)="empujar(-PASO, 0)">←</button>
          <button type="button" class="boton cuadrado" aria-label="Mover hacia arriba" (click)="empujar(0, -PASO)">↑</button>
          <button type="button" class="boton cuadrado" aria-label="Mover hacia abajo" (click)="empujar(0, PASO)">↓</button>
          <button type="button" class="boton cuadrado" aria-label="Mover a la derecha" (click)="empujar(PASO, 0)">→</button>
          <button type="button" class="boton boton-primario" (click)="terminarMover(true)">Listo</button>
          <button type="button" class="boton" (click)="terminarMover(false)">Dejar donde estaba</button>
        </div>
      </div>
    }

    <div class="lienzo" #lienzo [style.block-size.px]="altoLienzo()">
      <!-- En solo lectura las escenas quedan deshabilitadas (fieldset del editor): el mapa mismo toma el foco para desplazarlo con el teclado. -->
      <div class="marco" #marco (wheel)="rueda($event)" (keydown.escape)="vista.set(null)"
           [attr.tabindex]="soloLectura() ? 0 : null" [attr.role]="soloLectura() ? 'region' : null"
           [attr.aria-label]="soloLectura() ? 'Mapa del caso (solo lectura): desplázalo con las flechas' : null">
        <div class="plano" role="group" aria-label="Mapa del caso" aria-describedby="mapa-ayuda" [class.compacto]="compacto()"
             [style.width.px]="limites().ancho * zoom()" [style.height.px]="limites().alto * zoom()"
             [style.margin-inline-start.px]="desfase().x" [style.margin-block-start.px]="desfase().y">
          <div class="escala" [style.transform]="'scale(' + zoom() + ')'" [style.width.px]="limites().ancho" [style.height.px]="limites().alto">
            <svg class="flechas" [attr.width]="limites().ancho" [attr.height]="limites().alto" aria-hidden="false" [style.--zoom]="zoom()">
              <defs>
                <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path class="punta" d="M0,0 L10,5 L0,10 z" />
                </marker>
                <marker id="punta-elegida" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path class="punta punta-elegida" d="M0,0 L10,5 L0,10 z" />
                </marker>
              </defs>
              @for (f of flechas(); track f.id) {
                <path class="flecha" [class.de-elegida]="f.deElegida" [attr.d]="f.d" tabindex="0" role="img"
                      [attr.marker-end]="f.deElegida ? 'url(#punta-elegida)' : 'url(#punta)'"
                      [attr.aria-label]="'Respuesta: ' + (f.texto || 'sin escribir')"
                      (mouseenter)="flechaActiva.set(f.id)" (mouseleave)="flechaActiva.set(null)"
                      (focus)="flechaActiva.set(f.id)" (blur)="flechaActiva.set(null)" />
              }
            </svg>

            @for (e of caso().escenas; track e.id) {
              <button type="button" class="escena" [attr.data-escena]="e.id"
                      [class.elegida]="elegida() === e.id" [class.final]="e.esFinal" [class.con-aviso]="avisosDe(e.id).length" [class.marca-ia]="e.marcaIa"
                      [style.left.px]="pos(e).x" [style.top.px]="pos(e).y" [attr.tabindex]="tabParada() === e.id ? 0 : -1"
                      [attr.aria-pressed]="elegida() === e.id"
                      (click)="elegir(e.id)" (dblclick)="abrirGuion.emit(e.id)"
                      (contextmenu)="menuContextual($event, e.id)" (keydown)="tecla($event, e)"
                      (mouseenter)="vista.set(e.id)" (mouseleave)="vista.set(null)" (focus)="vista.set(e.id)" (blur)="vista.set(null)">
                <!-- El nombre de la tarjeta es su propio texto (lo que se ve) más un final que solo oye el lector. -->
                <span class="cabeza-tarjeta">
                  <span class="numero">{{ numero(e.id) }}</span>
                  <span class="etiquetas">
                    @if (caso().inicioId === e.id) { <span class="pildora pildora-primaria">Inicio</span> }
                    @if (e.esFinal) { <span class="pildora pildora-adecuada">Final</span> }
                    @if (e.marcaIa) { <span class="pildora pildora-ia">IA</span> }
                    @if (avisosDe(e.id).length === 1) {
                      <span class="pildora aviso">⚠ {{ nombreAviso[avisosDe(e.id)[0].tipo] }}</span>
                    } @else if (avisosDe(e.id).length > 1) {
                      <span class="pildora aviso">⚠ {{ avisosDe(e.id).length }} avisos</span>
                    }
                  </span>
                </span>
                <span class="titulo">{{ e.titulo }}</span>
                <span class="sala texto-secundario">{{ nombreSala(e.salaId) }}</span>
                <span class="intensidad-marca" [attr.data-intensidad]="e.intensidad">
                  <span aria-hidden="true">{{ simboloIntensidad[e.intensidad] }}</span> Intensidad {{ nombreIntensidad[e.intensidad].toLowerCase() }}
                </span>
                <span class="solo-lector">{{ detalle(e) }}</span>
              </button>
            }
          </div>

          <!-- Los globos van fuera de la escala, en píxeles de pantalla: a 50 % se leen igual que a 100 %. -->
          @if (vistaEscena(); as v) {
            <div class="vista" role="tooltip" [attr.id]="'vista-' + v.escena.id" [class.arriba]="v.arriba"
                 [style.left.px]="v.x" [style.top.px]="v.y">
              @if (v.fondo) { <img class="pixel" [src]="v.fondo" alt="" width="960" height="528" /> }
              <strong>{{ v.titulo }}</strong>
              <span>{{ v.sala }}</span>
              <span class="texto-secundario">{{ v.resumen }}</span>
            </div>
          }

          @if (flechaElegida(); as f) {
            <div class="tarjeta-flecha" role="status" [style.left.px]="f.medio.x * zoom()" [style.top.px]="f.medio.y * zoom()">
              <strong>{{ f.texto || 'Respuesta sin escribir' }}</strong>
              <span class="hacia">{{ f.hacia }}</span>
            </div>
          }
        </div>
      </div>

      @if (desborda()) {
        <svg class="minivista" viewBox="0 0 160 90" role="img" aria-label="Minivista del mapa">
          @for (e of caso().escenas; track e.id) {
            <rect [class.elegida]="elegida() === e.id" [attr.x]="mini(e).x" [attr.y]="mini(e).y" [attr.width]="mini(e).w" [attr.height]="mini(e).h" />
          }
        </svg>
      }
    </div>

    <ng-template #menu>
      <!-- La capa del CDK vive fuera del editor: la piel se lee de quien abre el menú, como en UiDialog (C13). -->
      <div cdkMenu class="menu" [attr.data-skin]="piel()" aria-label="Acciones de la escena">
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="abrirGuion.emit(elegida()!)">Abrir guion <kbd>Enter</kbd></button>
        @if (elegidaEscena()?.salaId; as salaId) {
          <button cdkMenuItem class="item" (cdkMenuItemTriggered)="abrirSala.emit(salaId)">Abrir sala</button>
        }
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="empezarMover()">Mover</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'duplicar', escenaId: elegida()! })">Duplicar</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'conectar', escenaId: elegida()! })">Conectar con…</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'final', escenaId: elegida()!, esFinal: !elegidaEscena()!.esFinal })">
          {{ elegidaEscena()?.esFinal ? 'Quitar la marca de final' : 'Marcar como final' }}
        </button>
        <hr role="separator" />
        <button cdkMenuItem class="item peligro" (cdkMenuItemTriggered)="accion.emit({ tipo: 'borrar', escenaId: elegida()! })">Borrar <kbd>Supr</kbd></button>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.5rem; position: relative; min-inline-size: 0; }
    .barra { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; }
    .grupo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.75rem; }
    .zoom-grupo { display: flex; align-items: center; gap: 0.25rem; }
    .boton[aria-expanded='true'] { background: var(--l-tinte); border-color: var(--l-tinte-filo); }
    .boton[aria-disabled='true'] { color: var(--ds-text-2); cursor: not-allowed; }
    .cuadrado { inline-size: 3rem; padding: 0; font-size: var(--autoria-texto-20); }
    .icono { inline-size: 1.25rem; block-size: 1.25rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
    .zoom { min-inline-size: 3.25rem; text-align: center; font-size: var(--autoria-texto-16); font-variant-numeric: tabular-nums; color: var(--ds-text-2); }

    .teclas-ancla { position: relative; }
    .globo-teclas {
      position: absolute; z-index: var(--autoria-capa-4); inset-block-start: calc(100% + 0.5rem); inset-inline-start: 0;
      inline-size: min(26rem, 80vw); padding: 0.875rem 1rem; border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control);
      background: color-mix(in oklab, var(--l-superficie) 96%, transparent); box-shadow: var(--l-sombra-alta); color: var(--ds-text-1);
      font-size: var(--autoria-texto-16); line-height: 1.5rem;
    }
    .globo-teclas[hidden] { display: none; }
    .globo-teclas p { margin: 0 0 0.375rem; font-weight: 700; }
    .globo-teclas ul { margin: 0; padding-inline-start: 1.125rem; display: flex; flex-direction: column; gap: 0.25rem; }

    /* El lienzo: alto medido (ocupa lo que deja la zona central); en el teléfono, uno fijo y legible. */
    .lienzo { position: relative; block-size: 26rem; min-block-size: 20rem; }
    .marco {
      position: absolute; inset: 0; overflow: auto; overscroll-behavior: contain; border: 1px solid var(--l-filo-fuerte);
      border-radius: var(--l-radio-tarjeta); background-color: var(--l-superficie-hundida);
      /* Retícula de puntos: el papel cuadriculado del juego, apenas visible. */
      background-image: radial-gradient(circle, var(--l-filo-fuerte) 1px, transparent 1.5px);
      background-size: 1.5rem 1.5rem;
    }
    .plano { position: relative; }
    .escala { position: absolute; inset-inline-start: 0; inset-block-start: 0; transform-origin: 0 0; }
    .flechas { position: absolute; inset: 0; overflow: visible; }
    /* El grosor se divide por el zoom: la flecha se ve de 2 px (3 la elegida) a cualquier escala, nunca un hilo de 1 px. */
    .flecha { fill: none; stroke: var(--borde-control); stroke-width: calc(2px / var(--zoom, 1)); cursor: pointer; }
    .flecha.de-elegida { stroke: var(--ds-primary); stroke-width: calc(3px / var(--zoom, 1)); }
    .flecha:focus-visible { outline: none; stroke: var(--ds-focus); stroke-width: calc(4px / var(--zoom, 1)); }
    .punta { fill: var(--borde-control); }
    .punta-elegida { fill: var(--ds-primary); }

    .escena {
      position: absolute; width: ${ANCHO_ESCENA}px; height: ${ALTO_ESCENA}px; display: flex; flex-direction: column; align-items: flex-start;
      gap: 0.25rem; padding: 0.625rem 0.75rem; text-align: start; font: inherit; color: var(--ds-text-1); background: var(--l-superficie);
      border: 2px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control); cursor: pointer; overflow: hidden;
      box-shadow: var(--l-sombra-trabajo);
      transition: border-color var(--ds-dur-fade) var(--ds-ease-out), box-shadow var(--ds-dur-fade) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .escena:hover { border-color: var(--borde-control); }
    }
    .escena:active { scale: 0.98; }
    .escena.elegida { border: 3px solid var(--ds-primary); box-shadow: 0 0 0 4px var(--l-tinte); }
    /* Final, IA y aviso se dicen con forma (doble, discontinuo) y con palabra, no solo con color. */
    .escena.final { border-style: double; border-width: 5px; }
    .escena.con-aviso { border-color: var(--aviso); }
    .escena.marca-ia { border-style: dashed; }
    .cabeza-tarjeta { display: flex; align-items: center; gap: 0.375rem; max-inline-size: 100%; min-block-size: 1.75rem; }
    /* El número es una tesela de píxel, como en el riel: el mismo número en los dos sitios. */
    .numero {
      flex: none; display: grid; place-items: center; min-inline-size: 1.75rem; block-size: 1.75rem; padding-inline: 0.25rem;
      border-radius: 0.375rem; background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo-fuerte);
      font-size: var(--autoria-texto-14); font-weight: 800; font-variant-numeric: tabular-nums;
    }
    .escena.elegida .numero { background: var(--ds-primary); box-shadow: none; color: var(--ds-on-primary); }
    .etiquetas { display: flex; flex-wrap: nowrap; gap: 0.25rem; min-inline-size: 0; overflow: hidden; }
    .etiquetas .pildora { flex: none; min-block-size: 1.5rem; padding: 0 0.5rem; font-size: var(--autoria-texto-14); white-space: nowrap; }
    .pildora-ia { border-style: dashed; }
    .titulo, .sala { max-inline-size: 100%; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; }
    .titulo { -webkit-line-clamp: 2; font-weight: 700; font-size: var(--autoria-texto-16); line-height: 1.375rem; overflow-wrap: anywhere; }
    .sala { -webkit-line-clamp: 1; font-size: var(--autoria-texto-14); line-height: 1.25rem; }
    .aviso { border-color: var(--aviso); color: var(--aviso-texto); background: var(--aviso-tinte); }
    .intensidad-marca { margin-block-start: auto; font-size: var(--autoria-texto-14); line-height: 1.25rem; font-weight: 700; color: var(--ds-text-2); }
    .intensidad-marca[data-intensidad='HIGH'] { color: var(--aviso-texto); }

    /* Forma compacta (zoom bajo): número y título grandes, marcas; la sala y la intensidad quedan en el globo. */
    .compacto .escena { gap: 0.5rem; padding: 0.75rem 0.875rem; }
    .compacto .cabeza-tarjeta { min-block-size: 2.5rem; gap: 0.5rem; }
    .compacto .numero { min-inline-size: 2.5rem; block-size: 2.5rem; font-size: var(--autoria-texto-24); border-radius: 0.5rem; }
    .compacto .etiquetas .pildora { min-block-size: 2rem; font-size: var(--autoria-texto-20); }
    .compacto .titulo { font-size: var(--autoria-texto-24); line-height: 1.875rem; }
    .compacto .sala, .compacto .intensidad-marca { display: none; }

    .vista {
      position: absolute; z-index: var(--autoria-capa-3); inline-size: 16.25rem; display: flex; flex-direction: column; gap: 0.25rem;
      padding: 0.625rem; border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control);
      background: color-mix(in oklab, var(--l-superficie) 96%, transparent); box-shadow: var(--l-sombra-alta); color: var(--ds-text-1);
      pointer-events: none; font-size: var(--autoria-texto-16); line-height: 1.375rem;
    }
    .vista.arriba { translate: 0 -100%; }
    .vista img { inline-size: 100%; block-size: auto; border-radius: 0.5rem; image-rendering: pixelated; margin-block-end: 0.25rem; }
    .tarjeta-flecha {
      position: absolute; z-index: var(--autoria-capa-3); translate: -50% -120%; max-inline-size: 16.25rem; padding: 0.375rem 0.625rem;
      display: flex; flex-direction: column; gap: 0.125rem; border-radius: 0.5rem; background: var(--ds-text-1); color: var(--ds-surface-1);
      font-size: var(--autoria-texto-16); line-height: 1.375rem; pointer-events: none;
    }
    .tarjeta-flecha .hacia { font-weight: 400; }

    .minivista {
      position: absolute; inset-inline-start: 0.75rem; inset-block-end: 0.75rem; inline-size: 10rem; block-size: 5.625rem;
      border: 1px solid var(--l-filo-fuerte); border-radius: 0.5rem; background: var(--l-superficie); box-shadow: var(--l-sombra);
    }
    .minivista rect { fill: var(--l-filo-fuerte); }
    .minivista rect.elegida { fill: var(--ds-primary); }

    .moviendo { display: flex; flex-direction: column; gap: 0.5rem; }
    .moviendo p { margin: 0; }

    /*
     * El menú flota sobre todo: vidrio casi opaco sin desenfoque (D-25), filo fino y la sombra alta de las capas. Se pinta
     * en la capa del CDK, fuera del editor, donde no llegan los materiales «--l-*»: por eso usa solo «--ds-*», que la
     * piel («data-skin» en el propio menú) sí define.
     */
    .menu {
      display: flex; flex-direction: column; min-inline-size: 15rem; padding: 0.375rem; border: 1px solid var(--ds-border);
      border-radius: 1.25rem; background: color-mix(in oklab, var(--ds-surface-1) 97%, transparent);
      box-shadow: var(--ds-shadow-e3); color: var(--ds-text-1);
    }
    .item {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem; min-block-size: 2.75rem; padding: 0 0.75rem;
      font: inherit; font-size: var(--autoria-texto-16); text-align: start; border: 0; background: none; border-radius: 0.875rem;
      cursor: pointer; color: var(--ds-text-1);
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .item kbd { color: var(--ds-text-2); }
    .item:focus, .item:active { background: var(--ds-primary-subtle); outline: none; }
    .item:focus-visible { box-shadow: inset 0 0 0 2px var(--ds-focus); }
    @media (hover: hover) and (pointer: fine) { .item:hover { background: var(--ds-primary-subtle); } }
    .item.peligro { color: var(--ds-danger); }
    hr { inline-size: 100%; border: 0; border-block-start: 1px solid var(--ds-border); margin: 0.25rem 0; }
    .pista { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .pista:empty { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .escena, .item { transition: none; }
    }
    @media (forced-colors: active) {
      .escena.elegida { outline: 3px solid Highlight; }
      .flecha.de-elegida { stroke: Highlight; }
      .punta, .punta-elegida { fill: CanvasText; }
    }
  `,
})
export class MapaEscenasComponent {
  readonly caso = input.required<CasoBorrador>();
  /** El caso ya no es un borrador: el editor deshabilita las escenas y el mapa tiene que poder desplazarse con el teclado. */
  readonly soloLectura = input(false);
  readonly avisos = input<Aviso[]>([]);
  /** Escena elegida desde fuera (por ejemplo, «Llévame ahí»). */
  readonly elegidaInicial = input<string | null>(null);

  readonly abrirGuion = output<string>();
  readonly abrirSala = output<string>();
  readonly seleccion = output<string>();
  readonly accion = output<AccionEscena>();

  protected readonly PASO = PASO_MOVER;
  protected readonly nombreIntensidad = NOMBRE_INTENSIDAD;
  /** La intensidad también se ve en la forma (no solo en el color): una, dos o tres barras. */
  protected readonly simboloIntensidad: Record<Escena['intensidad'], string> = { LOW: '▁', MEDIUM: '▃', HIGH: '▇' };
  protected readonly nombreAviso = NOMBRE_AVISO;
  protected readonly elegida = signal<string | null>(null);
  protected readonly pista = signal('');
  protected readonly plural = plural;
  protected readonly vista = signal<string | null>(null);
  protected readonly flechaActiva = signal<string | null>(null);
  protected readonly zoom = signal(1);
  protected readonly tecladoAbierto = signal(false);
  protected readonly moviendo = signal<{ escenaId: string; x: number; y: number } | null>(null);
  /** Alto del lienzo medido contra la zona que se desplaza; `null` = el de la hoja de estilos (teléfono, pruebas). */
  protected readonly altoLienzo = signal<number | null>(null);
  /** Lo que mide por dentro el marco, para centrar el mapa y saber si se sale. */
  private readonly tamMarco = signal<{ w: number; h: number }>({ w: 0, h: 0 });
  /** La docente cambió el zoom a mano: entonces un cambio de ventana ya no lo reajusta. */
  private zoomManual = false;
  private readonly trigger = viewChild.required<CdkMenuTrigger>('trigger');
  private readonly plantillaMenu = viewChild.required<TemplateRef<unknown>>('menu');
  private readonly injector = inject(Injector);
  private readonly marco = viewChild.required<ElementRef<HTMLElement>>('marco');
  private readonly lienzo = viewChild.required<ElementRef<HTMLElement>>('lienzo');
  private readonly raiz: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly porcentaje = computed(() => Math.round(this.zoom() * 100));
  protected readonly compacto = computed(() => this.zoom() < UMBRAL_COMPACTO);
  protected readonly elegidaEscena = computed(() => this.caso().escenas.find((e) => e.id === this.elegida()) ?? null);
  /** El número de cada escena en el orden de la historia (el del riel). */
  private readonly numeros = computed(() => new Map(escenasEnOrden(this.caso()).map((e, i) => [e.id, i + 1])));
  /** La escena que recibe el Tab: la elegida si todavía existe; si no, el inicio o la primera. */
  protected readonly tabParada = computed(() => {
    const ids = new Set(this.caso().escenas.map((e) => e.id));
    return [this.elegida(), this.caso().inicioId, this.caso().escenas[0]?.id].find((id) => !!id && ids.has(id)) ?? null;
  });

  /**
   * La esquina de arriba a la izquierda del caso. Las posiciones guardadas pueden empezar lejos del 0 (un caso ordenado o
   * importado): el mapa se dibuja desde la primera escena, no desde el origen, para que «Ver todo» no desperdicie espacio.
   */
  private readonly origen = computed<Punto>(() => {
    const ps = this.caso().escenas.map((e) => this.base(e));
    return ps.length ? { x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) } : { x: 0, y: 0 };
  });

  protected readonly limites = computed(() => {
    const es = this.caso().escenas.map((e) => this.pos(e));
    const ancho = Math.max(ANCHO_ESCENA + 2 * MARGEN, ...es.map((p) => p.x + ANCHO_ESCENA + MARGEN));
    const alto = Math.max(ALTO_ESCENA + 2 * MARGEN, ...es.map((p) => p.y + ALTO_ESCENA + MARGEN));
    return { ancho, alto };
  });

  /** Si el mapa entero cabe, se centra en el marco; si no, empieza arriba a la izquierda y se desplaza. */
  protected readonly desfase = computed<Punto>(() => {
    const { w, h } = this.tamMarco();
    const { ancho, alto } = this.limites();
    return { x: Math.max(0, Math.floor((w - ancho * this.zoom()) / 2)), y: Math.max(0, Math.floor((h - alto * this.zoom()) / 2)) };
  });

  /** El mapa no cabe entero: solo entonces la minivista ayuda a ubicarse. */
  protected readonly desborda = computed(() => {
    const { w, h } = this.tamMarco();
    const { ancho, alto } = this.limites();
    return w > 0 && (ancho * this.zoom() > w + 1 || alto * this.zoom() > h + 1);
  });

  protected readonly flechas = computed<Flecha[]>(() => {
    const caso = this.caso();
    const porId = new Map(caso.escenas.map((e) => [e.id, e]));
    const lista: Flecha[] = [];
    for (const e of caso.escenas) {
      for (const r of e.respuestas) {
        const destino = r.destinoId ? porId.get(r.destinoId) : undefined;
        if (!destino) continue;
        const { d, medio } = this.trazo(this.pos(e), this.pos(destino), destino.id === e.id);
        const hacia = destino.id === e.id ? 'Vuelve a esta misma escena' : `Lleva a la escena ${this.numero(destino.id)} · ${destino.titulo}`;
        lista.push({ id: r.id, origen: e.id, destino: destino.id, texto: r.texto, hacia, d, medio, deElegida: e.id === this.elegida() });
      }
    }
    return lista;
  });

  protected readonly flechaElegida = computed(() => this.flechas().find((f) => f.id === this.flechaActiva()) ?? null);

  /** El globo de una escena: su sala (con la miniatura solo si tiene fondo: nunca un `src` vacío) y dónde se dibuja. */
  protected readonly vistaEscena = computed(() => {
    const e = this.caso().escenas.find((x) => x.id === this.vista());
    if (!e) return null;
    const sala = this.caso().salas.find((s) => s.id === e.salaId);
    const z = this.zoom();
    const p = this.pos(e);
    const { ancho, alto } = this.limites();
    // Debajo de la tarjeta; si no cabe debajo, encima. Nunca más a la derecha que el borde del mapa.
    const abajo = (p.y + ALTO_ESCENA) * z + 8;
    const arriba = abajo + 300 > alto * z && p.y * z > 300;
    const resumen = sala
      ? `${plural(sala.personajes.length, 'personaje', 'personajes')} · ${plural(sala.muebles.length, 'mueble', 'muebles')}`
      : 'Esta escena no tiene sala.';
    return {
      escena: e,
      titulo: `${this.numero(e.id)} · ${e.titulo}`,
      fondo: sala?.fondo ? rutaArte(this.caso().lugarId, sala.fondo) || null : null,
      sala: sala?.nombre ?? 'Sin sala',
      resumen,
      arriba,
      x: Math.max(0, Math.min(p.x * z, ancho * z - 260)),
      y: arriba ? p.y * z - 8 : abajo,
    };
  });

  constructor() {
    // La primera escena elegida (el inicio, al entrar) solo se marca: robarle el foco a la página al abrirla abriría además el
    // globo de su sala encima del mapa. Las siguientes («Llévame ahí») sí llevan el foco.
    let primera = true;
    effect(() => {
      const id = this.elegidaInicial();
      if (!id) return;
      if (primera) this.elegir(id);
      else this.elegirYEnfocar(id);
      primera = false;
    });
    // Ajuste al abrir: se mide la zona después de dibujar y se ve todo el caso. El observador sigue a la ventana.
    afterNextRender(() => this.observarTamano());
  }

  /**
   * Esc pliega lo que la atención mostró (la vista de una sala, el detalle de una respuesta y las teclas del mapa), esté el
   * foco o solo el cursor encima. No suelta nada más: la escena elegida, el foco y el menú abierto siguen como estaban.
   */
  protected plegarAtencion(): void {
    if (this.vista() !== null) this.vista.set(null);
    if (this.flechaActiva() !== null) this.flechaActiva.set(null);
    if (this.tecladoAbierto()) this.tecladoAbierto.set(false);
  }

  /** La piel del contenedor de quien abre el menú (`app-shell.portal[data-skin]`); `null` fuera del portal. */
  protected piel(): string | null {
    return this.raiz.closest('[data-skin]')?.getAttribute('data-skin') ?? null;
  }

  private base(e: Escena): Punto {
    const m = this.moviendo();
    return m && m.escenaId === e.id ? { x: m.x, y: m.y } : e.posicion;
  }

  protected pos(e: Escena): Punto {
    const b = this.base(e);
    const o = this.origen();
    return { x: b.x - o.x + MARGEN, y: b.y - o.y + MARGEN };
  }

  /**
   * La curva de una respuesta. Si la escena destino queda sobre todo abajo (o arriba), la flecha sale por el borde de abajo
   * y entra por el de arriba; si queda a un lado, sale y entra por los costados. Así sirve igual para un mapa ordenado de
   * izquierda a derecha que para uno de arriba abajo.
   */
  private trazo(a: Punto, b: Punto, mismo: boolean): { d: string; medio: Punto } {
    if (mismo) {
      const x = a.x + ANCHO_ESCENA - 30, y = a.y;
      return { d: `M${x},${y} C${x + 10},${y - 50} ${x + 60},${y - 30} ${x + 30},${y + 4}`, medio: { x: x + 30, y: y - 30 } };
    }
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      const baja = dy > 0;
      const x1 = a.x + ANCHO_ESCENA / 2, y1 = baja ? a.y + ALTO_ESCENA : a.y;
      const x2 = b.x + ANCHO_ESCENA / 2, y2 = baja ? b.y - 2 : b.y + ALTO_ESCENA + 2;
      const c = Math.max(40, Math.abs(y2 - y1) / 2) * (baja ? 1 : -1);
      return { d: `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`, medio: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
    }
    const avanza = dx >= 0;
    const x1 = avanza ? a.x + ANCHO_ESCENA : a.x, y1 = a.y + ALTO_ESCENA / 2;
    const x2 = avanza ? b.x - 2 : b.x + ANCHO_ESCENA + 2, y2 = b.y + ALTO_ESCENA / 2;
    const c = Math.max(40, Math.abs(x2 - x1) / 2) * (avanza ? 1 : -1);
    return { d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, medio: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }

  protected mini(e: Escena) {
    const { ancho, alto } = this.limites();
    const p = this.pos(e);
    return { x: (p.x / ancho) * 160, y: (p.y / alto) * 90, w: Math.max(4, (ANCHO_ESCENA / ancho) * 160), h: Math.max(3, (ALTO_ESCENA / alto) * 90) };
  }

  protected numero(id: string): number {
    return this.numeros().get(id) ?? 0;
  }

  protected avisosDe(id: string): Aviso[] {
    return this.avisos().filter((a) => a.escenaId === id);
  }

  protected nombreSala(id: string | null): string {
    return id === null ? 'Sin sala' : this.caso().salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected tituloDe(id: string): string {
    const e = this.caso().escenas.find((x) => x.id === id);
    return e ? `${this.numero(id)} · ${e.titulo}` : '';
  }

  /** Lo que el lector de pantalla oye después del texto visible de la tarjeta. */
  protected detalle(e: Escena): string {
    const partes = [`escena ${this.numero(e.id)} de ${this.caso().escenas.length}`];
    if (e.marcaIa) partes.push('sugerida por la IA, sin revisar');
    partes.push(`intensidad ${NOMBRE_INTENSIDAD[e.intensidad].toLowerCase()}`);
    const avisos = this.avisosDe(e.id);
    if (avisos.length > 1) partes.push(`avisos: ${avisos.map((a) => NOMBRE_AVISO[a.tipo].toLowerCase()).join(', ')}`);
    return `, ${partes.join(', ')}`;
  }

  protected elegir(id: string): void {
    this.elegida.set(id);
    this.pista.set('');
    this.seleccion.emit(id);
  }

  elegirYEnfocar(id: string): void {
    this.elegir(id);
    // Después de pintar: una escena recién creada todavía no está en la pantalla.
    afterNextRender(() => this.raiz.querySelector<HTMLElement>(`[data-escena="${id}"]`)?.focus(), { injector: this.injector });
  }

  /** Lleva el foco a la escena que recibe el Tab (por ejemplo, después de borrar la elegida). */
  enfocarParada(): void {
    afterNextRender(() => {
      const id = this.tabParada();
      if (id) this.raiz.querySelector<HTMLElement>(`[data-escena="${id}"]`)?.focus();
    }, { injector: this.injector });
  }

  protected menuContextual(evento: MouseEvent, id: string): void {
    evento.preventDefault();
    // Linux y macOS mandan `contextmenu` al PULSAR (con el botón aún abajo; en Windows llega al soltar). Abierto ahí, el
    // `auxclick` (o el `click` de Ctrl+clic) de soltarlo cae sobre la escena, fuera del menú, y el CDK lo cierra en el acto.
    // El `CdkContextMenuTrigger` del CDK se salta ese primer clic; este menú es un `CdkMenuTrigger` común, así que se abre
    // al soltar, cuando ese clic ya pasó.
    if (evento.buttons !== 0) this.abrirAlSoltar(id);
    else this.abrirMenu(id);
  }

  private abrirAlSoltar(id: string): void {
    const vista = this.raiz.ownerDocument.defaultView;
    if (!vista) {
      this.abrirMenu(id);
      return;
    }
    const soltar = () => {
      vista.removeEventListener('pointerup', soltar, true);
      vista.removeEventListener('pointercancel', soltar, true);
      // El `auxclick`/`click` llega en la misma tarea que el `pointerup`: se abre en la siguiente.
      setTimeout(() => this.abrirMenu(id));
    };
    vista.addEventListener('pointerup', soltar, true);
    vista.addEventListener('pointercancel', soltar, true);
  }

  private abrirMenu(id: string): void {
    this.elegir(id);
    const trigger = this.trigger();
    // El menú solo queda enlazado con una escena elegida; aquí se elige y se abre de una vez.
    trigger.menuTemplateRef = this.plantillaMenu();
    trigger.open();
    // El CDK cierra el menú si el foco no está en él: se lleva al primer elemento, como el teclado.
    this.enfocarMenu(trigger, 0);
  }

  private enfocarMenu(trigger: CdkMenuTrigger, intento: number): void {
    const menu = trigger.getMenu();
    if (menu) {
      menu.focusFirstItem('keyboard');
    } else if (intento < 5) {
      queueMicrotask(() => this.enfocarMenu(trigger, intento + 1));
    }
  }

  protected tecla(evento: KeyboardEvent, e: Escena): void {
    if (this.moviendo()) {
      this.teclaMover(evento);
      return;
    }
    if (evento.key === 'ContextMenu' || (evento.key === 'F10' && evento.shiftKey)) {
      evento.preventDefault();
      this.abrirMenu(e.id);
      return;
    }
    // Con Alt las flechas son del riel (escena anterior o siguiente del guion): no se toman aquí.
    if (evento.altKey) return;
    const caso = this.caso();
    const orden = escenasEnOrden(caso);
    let destino: string | undefined;
    switch (evento.key) {
      case 'Enter':
        evento.preventDefault();
        this.abrirGuion.emit(e.id);
        return;
      case 'Delete':
        evento.preventDefault();
        this.accion.emit({ tipo: 'borrar', escenaId: e.id });
        return;
      case 'ArrowRight':
        destino = e.respuestas.find((r) => r.destinoId && r.destinoId !== e.id)?.destinoId ?? undefined;
        break;
      case 'ArrowLeft':
        destino = caso.escenas.find((x) => x.respuestas.some((r) => r.destinoId === e.id) && x.id !== e.id)?.id;
        break;
      case 'ArrowDown':
        destino = orden[orden.findIndex((x) => x.id === e.id) + 1]?.id;
        break;
      case 'ArrowUp':
        destino = orden[orden.findIndex((x) => x.id === e.id) - 1]?.id;
        break;
      default:
        return;
    }
    evento.preventDefault();
    if (destino) this.elegirYEnfocar(destino);
  }

  // ── Mover con teclado o botones ───────────────────────────────────────────

  protected empezarMover(): void {
    const e = this.elegidaEscena();
    if (!e) return;
    this.moviendo.set({ escenaId: e.id, x: e.posicion.x, y: e.posicion.y });
    queueMicrotask(() => this.raiz.querySelector<HTMLElement>(`[data-escena="${e.id}"]`)?.focus());
  }

  protected empujar(dx: number, dy: number): void {
    this.moviendo.update((m) => (m ? { ...m, x: Math.max(0, m.x + dx), y: Math.max(0, m.y + dy) } : m));
  }

  private teclaMover(evento: KeyboardEvent): void {
    const pasos: Record<string, [number, number]> = {
      ArrowLeft: [-PASO_MOVER, 0], ArrowRight: [PASO_MOVER, 0], ArrowUp: [0, -PASO_MOVER], ArrowDown: [0, PASO_MOVER],
    };
    if (pasos[evento.key]) {
      evento.preventDefault();
      this.empujar(...pasos[evento.key]);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      this.terminarMover(true);
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      this.terminarMover(false);
    }
  }

  protected terminarMover(confirmar: boolean): void {
    const m = this.moviendo();
    this.moviendo.set(null);
    if (m && confirmar) this.accion.emit({ tipo: 'mover', escenaId: m.escenaId, x: m.x, y: m.y });
    if (m) this.elegirYEnfocar(m.escenaId);
  }

  // ── Zoom y alto del lienzo ───────────────────────────────────────────────

  protected zoomar(delta: number): void {
    this.zoomManual = true;
    this.zoom.update((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 10) / 10)));
  }

  protected rueda(evento: WheelEvent): void {
    if (!evento.ctrlKey) return;
    evento.preventDefault();
    this.zoomar(evento.deltaY > 0 ? -0.1 : 0.1);
  }

  /** «Ver todo el mapa»: el zoom con el que cabe el caso entero, sin pasar del 100 % (un caso corto no se agiganta). */
  protected verTodo(): void {
    this.encuadrar();
  }

  /** Vuelve a encuadrar el caso entero (después de ordenar el mapa, por ejemplo) y deja el zoom en automático. */
  encuadrar(): void {
    this.zoomManual = false;
    this.ajustar();
  }

  private ajustar(): void {
    const marco = this.marco().nativeElement;
    const w = marco.clientWidth, h = marco.clientHeight;
    if (!w || !h) return; // sin dibujar (pruebas, pestaña oculta): se queda como está
    const { ancho, alto } = this.limites();
    // Con aire alrededor: ninguna escena queda pegada al borde del lienzo, donde se confunde con un recorte.
    const z = Math.min(1, (w - AIRE) / ancho, (h - AIRE) / alto);
    this.zoom.set(Math.max(ZOOM_MIN, Math.floor(z * 20) / 20));
  }

  /**
   * La zona central se desplaza sola (el marco del editor), así que el mapa puede ocupar exactamente lo que queda de ella
   * bajo la cabecera. En el teléfono la página entera se desplaza: ahí no hay zona y vale el alto de la hoja de estilos.
   */
  private medirAlto(): void {
    const zona = this.zonaQueSeDesplaza();
    const lienzo = this.lienzo().nativeElement;
    if (!zona) {
      this.altoLienzo.set(null);
      return;
    }
    const arriba = lienzo.getBoundingClientRect().top - zona.getBoundingClientRect().top + zona.scrollTop;
    const alto = Math.max(ALTO_MINIMO, Math.floor(zona.clientHeight - arriba - 16));
    if (this.altoLienzo() !== alto) this.altoLienzo.set(alto);
  }

  private zonaQueSeDesplaza(): HTMLElement | null {
    for (let el = this.raiz.parentElement; el && el !== document.body; el = el.parentElement) {
      const desborde = getComputedStyle(el).overflowY;
      if (desborde === 'auto' || desborde === 'scroll') return el;
    }
    return null;
  }

  private observarTamano(): void {
    const marco = this.marco().nativeElement;
    const leerMarco = () => this.tamMarco.set({ w: marco.clientWidth, h: marco.clientHeight });
    this.medirAlto();
    leerMarco();
    afterNextRender(() => { leerMarco(); this.ajustar(); }, { injector: this.injector });
    if (typeof ResizeObserver === 'undefined') return;
    const zona = this.zonaQueSeDesplaza();
    const observador = new ResizeObserver((entradas) => {
      const cambioLaZona = entradas.some((x) => x.target === zona);
      this.medirAlto();
      leerMarco();
      // Cambió la ventana y la docente no tocó el zoom: vuelve a verse el caso entero.
      if (cambioLaZona && !this.zoomManual) afterNextRender(() => { leerMarco(); this.ajustar(); }, { injector: this.injector });
    });
    observador.observe(marco);
    if (zona) observador.observe(zona);
    // Si algo de la cabecera cambia de alto, el lienzo se vuelve a medir (sin tocar el zoom).
    if (this.raiz.parentElement) observador.observe(this.raiz.parentElement);
    this.injector.get(DestroyRef).onDestroy(() => observador.disconnect());
  }
}
