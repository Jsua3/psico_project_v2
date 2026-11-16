import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { ClaseRespuesta, Escena, IntensidadEscena, Linea, Respuesta } from '../../modelo/caso';
import {
  competenciasMarcadas, conCompetencia, conHito, conPasoDePersona, sinPasoDePersona,
} from '../../modelo/efectos';
import { fraseDeRespuesta, pasoDeRespuesta } from '../../modelo/persona';
import { EXPRESIONES } from '../../modelo/escenario';
import { NOMBRE_CLASE, NOMBRE_EXPRESION, NOMBRE_INTENSIDAD, plural } from '../../modelo/textos';
import { RUTA_ENSAYO, alPulsarProbar } from '../../ensayo';
import { RutasAutoria } from '../../rutas';
import { ComentariosComponent } from './comentarios.component';
import { ObjetivoPistasComponent } from './objetivo-pistas.component';
import { ReaccionComponent } from './reaccion.component';
import { SelectorCondicionComponent } from './selector-condicion.component';

/** El juego muestra las opciones de una decisión como A, B, C y D. */
const MAX_RESPUESTAS = 4;

const CLASIFICACIONES: { valor: ClaseRespuesta; nombre: string; simbolo: string }[] = [
  { valor: 'RECOMMENDED', nombre: NOMBRE_CLASE.RECOMMENDED, simbolo: '✓' },
  { valor: 'ACCEPTABLE', nombre: NOMBRE_CLASE.ACCEPTABLE, simbolo: '✓' },
  { valor: 'RISKY', nombre: NOMBRE_CLASE.RISKY, simbolo: '▲' },
  { valor: 'CONTRAINDICATED', nombre: NOMBRE_CLASE.CONTRAINDICATED, simbolo: '✕' },
];

const INTENSIDADES: { valor: IntensidadEscena; nombre: string }[] = [
  { valor: 'LOW', nombre: NOMBRE_INTENSIDAD.LOW },
  { valor: 'MEDIUM', nombre: NOMBRE_INTENSIDAD.MEDIUM },
  { valor: 'HIGH', nombre: NOMBRE_INTENSIDAD.HIGH },
];
/** Lo que la docente puede elegir que le pase a la persona: el paso en cada eje, dicho con palabras. */
const PASOS_VINCULO = [{ valor: -1, nombre: 'Se cierra' }, { valor: 0, nombre: 'Sin cambio' }, { valor: 1, nombre: 'Se abre' }];
const PASOS_ACTIVACION = [{ valor: -1, nombre: 'Se calma' }, { valor: 0, nombre: 'Sin cambio' }, { valor: 1, nombre: 'Se tensa' }];

/**
 * Guion de una escena, tipo libreto (tablero 27): personaje, expresión y lo que dice; debajo,
 * lo que puede responder el estudiante, con su clasificación, lo que lee después, qué le pasa a la persona, qué hitos
 * cumple, qué competencias evidencia y a dónde lleva. Además, la intensidad de la escena y su aviso.
 */
@Component({
  selector: 'app-guion',
  imports: [RouterLink, ComentariosComponent, ObjetivoPistasComponent, SelectorCondicionComponent, ReaccionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (escena(); as e) {
      <div class="pagina ancha">
        <div class="cabeza">
          <h1>Guion de la escena</h1>
          <div class="acciones">
            <a [routerLink]="rutas.a('/editor')" class="boton boton-secundario">Volver al mapa</a>
          </div>
        </div>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        <section aria-label="La escena" class="tarjeta escena" [class.marca-ia]="e.marcaIa">
          @if (e.marcaIa) {
            <div class="fila-titulo">
              <span class="pildora">Sugerido por la IA</span>
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <button type="button" class="boton" (click)="aceptarEscena(e)">Aceptar toda la escena ({{ plural(store.partesIaDeEscena(e.id), 'parte', 'partes') }})</button>
            </div>
          }
          <label for="en" class="etiqueta">Escena {{ numero(e) }} · Nombre</label>
          <input id="en" type="text" class="campo" [value]="e.titulo" (change)="nombrar(e, $any($event.target).value)" />
          <p class="texto-secundario">Sala: {{ nombreSala(e.salaId) }}{{ lleganDesde(e) ? ' · Llegan aquí desde ' + lleganDesde(e) : '' }}</p>
          <div class="intensidad" data-accion="intensidad-escena">
            <label for="intensidad-escena" class="etiqueta">Intensidad de la escena</label>
            <select id="intensidad-escena" class="campo" (change)="cambiarIntensidad(e, $any($event.target).value)">
              @for (i of intensidades; track i.valor) { <option [value]="i.valor" [selected]="e.intensidad === i.valor">{{ i.nombre }}</option> }
            </select>
            <p class="texto-secundario nota">Una escena de intensidad alta avisa al estudiante antes de empezar.</p>
            @if (e.intensidad === 'HIGH') {
              <label for="aviso-escena" class="etiqueta">Aviso para el estudiante</label>
              <textarea id="aviso-escena" class="campo" rows="2" [value]="e.advertencia ?? ''" aria-describedby="aviso-escena-ayuda"
                        [attr.aria-invalid]="e.advertencia?.trim() ? null : 'true'"
                        (change)="store.editarEscena(e.id, { advertencia: $any($event.target).value.trim() || null })"></textarea>
              @if (!e.advertencia?.trim()) {
                <p id="aviso-escena-ayuda" class="texto-secundario nota">Una escena de intensidad alta necesita un aviso para el estudiante.</p>
              }
            }
          </div>
          <app-objetivo-pistas [escena]="e" />
          <div class="recursos" data-accion="recursos-de-apoyo">
            <label for="recursos-escena" class="etiqueta">Recursos de apoyo para el estudiante</label>
            <textarea id="recursos-escena" class="campo" rows="3" aria-describedby="recursos-escena-ayuda"
                      [value]="(e.recursosApoyo ?? []).join('\\n')" (change)="cambiarRecursos(e, $any($event.target).value)"></textarea>
            <p id="recursos-escena-ayuda" class="texto-secundario nota">Uno por línea: a quién puede acudir la persona o qué línea de atención llamar. Al menos una escena del caso tiene que traer uno para poder enviarlo a revisión.</p>
          </div>
          <div class="acciones">
            @if (e.salaId) {
              <a class="boton" [routerLink]="rutas.a('/editor/sala', e.salaId)">Abrir sala</a>
            }
            @if (nodoParaProbar(); as nodo) {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <a class="boton" [attr.href]="rutaEnsayo(nodo)" target="_blank" rel="noopener" data-accion="probar"
                 aria-label="Probar desde aquí, en el juego (se abre en otra pestaña)" (click)="probar($event, nodo)">Probar desde aquí ↗</a>
            } @else {
              <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
              <button type="button" class="boton" aria-disabled="true" aria-describedby="probar-aviso" data-accion="probar">Probar desde aquí ↗</button>
              <span id="probar-aviso" class="texto-secundario nota">Guarda la escena para probarla.</span>
            }
          </div>
        </section>

        <div class="dos-columnas">
          <div class="columna">
            <section aria-labelledby="lh" class="bloque">
              <h2 id="lh">Lo que dicen los personajes</h2>
              <p class="texto-secundario">{{ resumenLineas(e) }}</p>
              <ol class="lista">
                @for (l of e.lineas; track l.id; let i = $index; let primero = $first; let ultimo = $last) {
                  <li class="tarjeta linea" [class.marca-ia]="l.marcaIa" (focusin)="lineaVista.set(l.id)">
                    <div class="fila-titulo">
                      <strong>Línea {{ i + 1 }}</strong>
                      @if (l.marcaIa) {
                        <span class="pildora">Sugerido por la IA</span>
                        <button type="button" class="boton" data-accion="aceptar-ia" (click)="aceptarLinea(e, l, i)">Aceptar línea</button>
                        <button type="button" class="boton boton-texto" (click)="borrarLinea(e, l, i, 'descartada')">Descartar línea</button>
                      }
                    </div>
                    <div class="linea-cuerpo">
                      <img class="pixel retrato" [src]="retrato(l)" alt="" width="72" height="72" />
                      <div class="campos">
                        <div class="dos-campos">
                          <div class="campo-col">
                            <label [for]="'lp' + i" class="etiqueta">Personaje</label>
                            <select [id]="'lp' + i" class="campo" (change)="store.editarLinea(e.id, l.id, { personajeId: $any($event.target).value })">
                              @for (p of personajes(); track p.id) { <option [value]="p.id" [selected]="p.id === l.personajeId">{{ p.nombre }}</option> }
                            </select>
                          </div>
                          <div class="campo-col">
                            <label [for]="'le' + i" class="etiqueta">Expresión</label>
                            <select [id]="'le' + i" class="campo" (change)="store.editarLinea(e.id, l.id, { expresion: $any($event.target).value })">
                              @for (x of expresiones; track x) { <option [value]="x" [selected]="x === l.expresion">{{ nombreExpresion[x] }}</option> }
                            </select>
                          </div>
                        </div>
                        <label [for]="'lt' + i" class="etiqueta">Lo que dice, línea {{ i + 1 }}</label>
                        <textarea [id]="'lt' + i" class="campo" rows="2" [value]="l.texto"
                                  [attr.aria-describedby]="l.texto ? null : 'lv' + i"
                                  (change)="store.editarLinea(e.id, l.id, { texto: $any($event.target).value })"></textarea>
                        @if (!l.texto) {
                          <p [id]="'lv' + i" class="texto-secundario nota">Esta línea está vacía. Escribe lo que dice el personaje; sin texto, el estudiante no verá nada en este turno.</p>
                        }
                      </div>
                    </div>
                    <div class="acciones">
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Subir la línea ' + (i + 1)" [attr.aria-disabled]="primero" (click)="!primero && moverLinea(e, l, i, -1)">↑</button>
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Bajar la línea ' + (i + 1)" [attr.aria-disabled]="ultimo" (click)="!ultimo && moverLinea(e, l, i, 1)">↓</button>
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Duplicar la línea ' + (i + 1)" (click)="duplicarLinea(e, l, i)">⧉</button>
                      <button type="button" class="boton cuadrado peligro" [attr.aria-label]="'Borrar la línea ' + (i + 1)" (click)="borrarLinea(e, l, i)">✕</button>
                    </div>
                  </li>
                }
              </ol>
              <button type="button" class="boton" data-accion="agregar-linea" (click)="agregarLinea(e)">Agregar una línea</button>
            </section>

            <app-comentarios [escena]="e" />

            <section aria-labelledby="rh" class="bloque" id="respuestas-escena" tabindex="-1" data-accion="respuesta-a-escena-nueva">
              <h2 id="rh">Lo que puede responder el estudiante</h2>
              <p class="texto-secundario">Cada respuesta lleva a una escena. Si eliges «Una escena nueva», se crea y se conecta cuando pulsas «Crear la escena nueva».</p>
              <ol class="lista">
                @for (r of e.respuestas; track r.id; let i = $index) {
                  <li class="tarjeta respuesta" [class.marca-ia]="r.marcaIa" [id]="'respuesta-' + r.id" tabindex="-1">
                    <div class="fila-titulo">
                      <label [for]="'rt' + i" class="etiqueta">Respuesta {{ i + 1 }}</label>
                      @if (r.marcaIa) {
                        <span class="pildora">Sugerido por la IA</span>
                        <button type="button" class="boton" (click)="aceptarRespuesta(e, r, i)">Aceptar respuesta</button>
                        <button type="button" class="boton boton-texto" (click)="borrarRespuesta(e, r, i, 'descartada')">Descartar respuesta</button>
                      }
                    </div>
                    <textarea [id]="'rt' + i" class="campo" rows="2" [value]="r.texto"
                              (change)="store.editarRespuesta(e.id, r.id, { texto: $any($event.target).value })"></textarea>
                    <fieldset class="clasificacion">
                      <legend>Clasificación de la respuesta {{ i + 1 }}</legend>
                      @for (c of clasificaciones; track c.valor) {
                        <label class="opcion" [class]="'opcion ' + c.valor">
                          <input type="radio" [name]="'rc' + r.id" [value]="c.valor" [checked]="r.clase === c.valor"
                                 (change)="store.editarRespuesta(e.id, r.id, { clase: c.valor })" />
                          <span aria-hidden="true">{{ c.simbolo }}</span> {{ c.nombre }}
                        </label>
                      }
                    </fieldset>
                    @if (!r.clase) {
                      <p class="texto-secundario nota">Elige cómo clasificas esta respuesta. Hasta entonces solo está en esta pantalla y no se guarda.</p>
                    }
                    @if (r.clase === 'CONTRAINDICATED') {
                      <label [for]="'rz' + i" class="etiqueta">Por qué es contraindicada</label>
                      <textarea [id]="'rz' + i" class="campo" rows="2" [value]="r.razon" [attr.aria-invalid]="r.razon.trim() ? null : 'true'"
                                [attr.aria-describedby]="r.razon.trim() ? null : 'rzn' + i"
                                (change)="store.editarRespuesta(e.id, r.id, { razon: $any($event.target).value })"></textarea>
                      @if (!r.razon.trim()) {
                        <p [id]="'rzn' + i" class="texto-secundario nota">Explica por qué esta respuesta puede hacerle daño a la persona. Sin esta razón la respuesta no se guarda.</p>
                      }
                    }
                    <label [for]="'rf' + i" class="etiqueta">Lo que lee el estudiante después de elegir</label>
                    <textarea [id]="'rf' + i" class="campo" rows="2" [value]="r.retroalimentacion"
                              (change)="store.editarRespuesta(e.id, r.id, { retroalimentacion: $any($event.target).value })"></textarea>
                    <fieldset class="persona">
                      <legend>Qué le pasa a la persona después de esta respuesta</legend>
                      <label class="opcion-simple">
                        <input type="radio" [name]="'pm' + r.id" value="automatica" [checked]="!r.efectos.persona" (change)="personaAutomatica(e, r)" />
                        Automático: según la clase
                      </label>
                      <label class="opcion-simple">
                        <input type="radio" [name]="'pm' + r.id" value="propia" [checked]="!!r.efectos.persona" (change)="personaPropia(e, r)" />
                        Lo elijo yo
                      </label>
                      @if (r.efectos.persona; as paso) {
                        <div class="dos-campos">
                          <div class="campo-col">
                            <label [for]="'pv' + i" class="etiqueta">Vínculo</label>
                            <select [id]="'pv' + i" class="campo" (change)="cambiarPaso(e, r, 'bond', $any($event.target).value)">
                              @for (o of pasosVinculo; track o.valor) { <option [value]="o.valor" [selected]="(paso.bond ?? 0) === o.valor">{{ o.nombre }}</option> }
                            </select>
                          </div>
                          <div class="campo-col">
                            <label [for]="'pa' + i" class="etiqueta">Activación</label>
                            <select [id]="'pa' + i" class="campo" (change)="cambiarPaso(e, r, 'activation', $any($event.target).value)">
                              @for (o of pasosActivacion; track o.valor) { <option [value]="o.valor" [selected]="(paso.activation ?? 0) === o.valor">{{ o.nombre }}</option> }
                            </select>
                          </div>
                        </div>
                      } @else {
                        <p class="persona-auto texto-secundario nota">{{ textoAutomatico(r) }}</p>
                      }
                    </fieldset>
                    <fieldset class="hitos">
                      <legend>Hitos que cumple esta respuesta</legend>
                      @for (h of hitos(); track h.clave) {
                        <label class="casilla">
                          <input type="checkbox" [checked]="r.efectos.hitos?.includes(h.clave) ?? false" (change)="marcarHito(e, r, h.clave, $any($event.target).checked)" />
                          {{ h.nombre }}
                        </label>
                      } @empty {
                        <p class="texto-secundario nota">Este caso todavía no tiene hitos.</p>
                      }
                    </fieldset>
                    <app-selector-condicion [condicion]="r.requiere" [salaId]="e.salaId" leyenda="Aparece si…" vacio="Siempre aparece."
                                            [idBase]="'aparece-si-' + r.id" (cambio)="store.editarRequisito(e.id, r.id, $event)" />
                    <app-reaccion [respuesta]="r" [escena]="e" [idBase]="'reaccion-' + r.id" (cambio)="store.editarReaccion(e.id, r.id, $event)" />
                    <fieldset class="competencias" [id]="'competencias-' + r.id" tabindex="-1">
                      <legend>Competencias que evidencia (una o dos)</legend>
                      @for (c of competencias(); track c.codigo) {
                        <label class="casilla">
                          <input type="checkbox" [checked]="marcadas(r).includes(c.codigo)" (change)="marcarCompetencia(e, r, c.codigo, $any($event.target).checked)" />
                          {{ c.nombre }}
                        </label>
                      } @empty {
                        <p class="texto-secundario nota">La rúbrica de este caso todavía no tiene competencias.</p>
                      }
                    </fieldset>
                    <label [for]="'rl' + i" class="etiqueta">Lleva a…</label>
                    <select [id]="'rl' + i" class="campo" (change)="elegirDestino(e, r, $any($event.target).value)">
                      <option value="" [selected]="!r.destinoId && pendiente() !== r.id">Ninguna escena todavía</option>
                      @for (d of escenas(); track d.id; let j = $index) {
                        <option [value]="d.id" [selected]="d.id === r.destinoId">{{ j + 1 }} · {{ d.titulo }}</option>
                      }
                      <option value="nueva" [selected]="pendiente() === r.id">Una escena nueva</option>
                    </select>
                    @if (r.clase && !r.destinoId && pendiente() !== r.id) {
                      <p class="texto-secundario nota">Todavía no lleva a ninguna escena: solo está en esta pantalla y se guarda cuando elijas a cuál.</p>
                    }
                    @if (pendiente() === r.id) {
                      <div class="acciones">
                        <button type="button" class="boton boton-secundario crear-escena-nueva" (click)="crearEscenaNueva(e, r, i)">Crear la escena nueva</button>
                        <span class="texto-secundario nota">Elegir en la lista no crea nada; el botón sí.</span>
                      </div>
                    }
                    @if (creada()?.respuestaId === r.id) {
                      <div role="group" aria-label="Escena creada" class="creada">
                        <p>Se creó «{{ creada()!.titulo }}», conectada a la respuesta {{ i + 1 }}. Usa la misma sala que esta escena; puedes cambiarla después.</p>
                        <a class="boton" [routerLink]="rutas.a('/editor/escena', creada()!.escenaId)">Abrir su guion</a>
                      </div>
                    }
                    <button type="button" class="boton boton-texto peligro" (click)="borrarRespuesta(e, r, i)">Borrar la respuesta {{ i + 1 }}</button>
                  </li>
                }
              </ol>
              @if (todasConRequisito(e)) {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p class="texto-secundario nota" id="aviso-todas-con-requisito"><span aria-hidden="true">▲</span> Todas las respuestas tienen un requisito: deja al menos una que aparezca siempre.</p>
              }
              <button type="button" class="boton" data-accion="agregar-respuesta" [attr.aria-disabled]="enElTopeDeRespuestas(e)"
                      [attr.aria-describedby]="describedbyAgregarRespuesta(e)" (click)="agregarRespuesta(e)">Agregar una respuesta</button>
              @if (enElTopeDeRespuestas(e)) {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p id="respuestas-tope" class="texto-secundario nota"><span aria-hidden="true">▲</span> Una decisión tiene hasta 4 respuestas (A, B, C y D).</p>
              }
              @if (e.respuestas.length > maximoRespuestas) {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p id="respuestas-exceso" class="texto-secundario nota"><span aria-hidden="true">▲</span> Esta escena tiene {{ e.respuestas.length }} respuestas y el juego solo muestra 4 (A, B, C y D). Quita las que sobren.</p>
              }
            </section>
          </div>

          <aside aria-labelledby="pvt" class="tarjeta vista">
            <h2 id="pvt">Así lo verá el estudiante</h2>
            @if (lineaMostrada(); as l) {
              <div class="dialogo-juego">
                <img class="pixel" [src]="retrato(l)" alt="" width="96" height="96" />
                <div>
                  <p><strong>{{ nombrePersonaje(l.personajeId) }}</strong> · {{ nombreExpresion[l.expresion] }}</p>
                  <p>{{ l.texto || '…' }}</p>
                </div>
              </div>
            } @else {
              <p class="texto-secundario">Todavía no hay líneas.</p>
            }
            @if (e.respuestas.length) {
              <ul class="opciones-juego">
                @for (r of e.respuestas; track r.id) { <li>{{ r.texto || 'Respuesta sin escribir' }}</li> }
              </ul>
            }
            <p class="texto-secundario nota">Las respuestas no dicen su clasificación, como en el juego; lo que lee el estudiante después aparece al elegir.</p>
          </aside>
        </div>
      </div>
    } @else {
      <div class="pagina">
        <h1>Esta escena no está en el caso</h1>
        <a [routerLink]="rutas.a('/editor')" class="boton">Volver al mapa</a>
      </div>
    }
  `,
  styles: `
    .ancha { max-width: 1400px; }
    .cabeza { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; }
    .escena { display: flex; flex-direction: column; gap: 6px; }
    .escena p { margin: 0; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { min-height: 48px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); line-height: 24px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    select.campo { padding: 0 12px; }
    textarea.campo { resize: vertical; }
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 16px; align-items: start; }
    @media (max-width: 1000px) { .dos-columnas { grid-template-columns: 1fr; } }
    .columna, .bloque { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .bloque h2, .bloque > p { margin: 0; }
    .bloque > .boton { align-self: flex-start; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .linea, .respuesta { display: flex; flex-direction: column; gap: 8px; }
    .marca-ia { border: 2px dashed var(--borde-control); }
    .fila-titulo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .linea-cuerpo { display: flex; gap: 12px; align-items: flex-start; }
    .retrato { flex: none; border-radius: 8px; border: 1px solid var(--linea); background: var(--fondo); image-rendering: pixelated; }
    .campos { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .dos-campos { display: flex; flex-wrap: wrap; gap: 8px; }
    .campo-col { flex: 1 1 180px; display: flex; flex-direction: column; gap: 4px; }
    .cuadrado { width: 48px; padding: 0; }
    .peligro { color: var(--peligro); }
    .nota { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .clasificacion { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .clasificacion legend { font-weight: 700; font-size: var(--autoria-texto-16); margin-bottom: 4px; }
    .opcion { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); font-size: var(--autoria-texto-16); font-weight: 700; cursor: pointer; }
    .opcion input { width: 20px; height: 20px; accent-color: var(--primario); }
    .opcion.RECOMMENDED:has(input:checked), .opcion.ACCEPTABLE:has(input:checked) { background: var(--adecuada-tinte); border-color: var(--adecuada-borde); color: var(--adecuada); }
    .opcion.RISKY:has(input:checked) { background: var(--riesgo-tinte); border-color: var(--riesgo-borde); color: var(--riesgo); }
    .opcion.CONTRAINDICATED:has(input:checked) { background: var(--peligro-tinte); border-color: var(--peligro); color: var(--peligro); }
    .persona, .hitos, .competencias { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .persona legend, .hitos legend, .competencias legend { font-weight: 700; font-size: var(--autoria-texto-16); margin-bottom: 4px; }
    .persona .dos-campos, .persona .nota { flex: 1 1 100%; }
    .opcion-simple, .casilla { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px; font-size: var(--autoria-texto-16); }
    .opcion-simple input, .casilla input { width: 20px; height: 20px; accent-color: var(--primario); }
    .intensidad { display: flex; flex-direction: column; gap: 6px; }
    .intensidad select { max-width: 240px; }
    .recursos { display: flex; flex-direction: column; gap: 6px; }
    .campo[aria-invalid='true'] { border-color: var(--peligro); }
    .creada { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; border-radius: var(--radio-control); background: var(--adecuada-tinte); }
    .creada p { margin: 0; flex: 1 1 260px; font-size: var(--autoria-texto-16); }
    .respuesta > .boton-texto { align-self: flex-start; }
    .vista { position: sticky; top: calc(var(--alto-cabecera, 64px) + 16px); display: flex; flex-direction: column; gap: 12px; }
    .vista h2 { margin: 0; font-size: var(--autoria-texto-20); }
    .dialogo-juego { display: flex; gap: 12px; padding: 12px; border-radius: 12px; background: var(--juego-fondo); color: var(--juego-texto); }
    .dialogo-juego img { border-radius: 8px; image-rendering: pixelated; background: var(--juego-hundido); }
    .dialogo-juego p { margin: 0 0 4px; }
    .opciones-juego { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .opciones-juego li { padding: 8px 12px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); font-size: var(--autoria-texto-16); }
  `,
})
export class GuionComponent {
  protected readonly rutas = inject(RutasAutoria);
  readonly escenaId = input.required<string>();

  protected readonly store = inject(CasoStore);
  protected readonly plural = plural;
  /** El número que el servidor le dio a la escena: sin él (la escena aún no se guardó) no hay desde dónde probar. */
  protected readonly nodoParaProbar = computed(() => (this.store.caso(), this.store.guardando(), this.store.nodoDeEscena(this.escenaId())));
  protected readonly rutaEnsayo = (nodo: number): string => RUTA_ENSAYO(this.store.caso()!.id, nodo);
  protected probar(evento: MouseEvent, nodo: number): void {
    void alPulsarProbar(evento, this.store, nodo);
  }
  private readonly router = inject(Router);
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly clasificaciones = CLASIFICACIONES;
  protected readonly intensidades = INTENSIDADES;
  protected readonly pasosVinculo = PASOS_VINCULO;
  protected readonly pasosActivacion = PASOS_ACTIVACION;
  protected readonly marcadas = (r: Respuesta) => competenciasMarcadas(r.efectos);
  protected readonly anuncio = signal('');
  protected readonly lineaVista = signal<string | null>(null);
  protected readonly pendiente = signal<string | null>(null);
  protected readonly creada = signal<{ respuestaId: string; escenaId: string; titulo: string } | null>(null);

  protected readonly escena = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.escenaId()) ?? null);
  protected readonly escenas = computed(() => this.store.caso()?.escenas ?? []);
  protected readonly personajes = computed(() => this.store.caso()?.personajes ?? []);
  protected readonly hitos = computed(() => this.store.caso()?.hitos ?? []);
  protected readonly competencias = computed(() => this.store.caso()?.competencias ?? []);
  protected readonly lineaMostrada = computed(() => {
    const e = this.escena();
    return e?.lineas.find((l) => l.id === this.lineaVista()) ?? e?.lineas[0] ?? null;
  });

  /** ¿Cada respuesta de la escena lleva un requisito? Entonces puede que ninguna aparezca. */
  protected todasConRequisito(e: Escena): boolean {
    return e.respuestas.length > 0 && e.respuestas.every((r) => Object.keys(r.requiere ?? {}).length > 0);
  }

  protected numero(e: Escena): number {
    return this.escenas().indexOf(e) + 1;
  }

  protected nombreSala(id: string | null): string {
    return id === null ? 'Sin sala' : this.store.caso()?.salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected nombrePersonaje(id: string): string {
    return this.personajes().find((p) => p.id === id)?.nombre ?? 'Sin personaje';
  }

  protected lleganDesde(e: Escena): string {
    return this.escenas()
      .filter((x) => x.id !== e.id && x.respuestas.some((r) => r.destinoId === e.id))
      .map((x) => `${this.numero(x)} · ${x.titulo}`)
      .join(', ');
  }

  protected resumenLineas(e: Escena): string {
    const n = e.lineas.length;
    const ia = e.lineas.filter((l) => l.marcaIa).length;
    const base = `${n} ${n === 1 ? 'línea' : 'líneas'}`;
    return ia ? `${base} · ${ia} sugerida${ia === 1 ? '' : 's'} por la IA, sin revisar` : base;
  }

  protected retrato(l: Linea): string {
    const p = this.personajes().find((x) => x.id === l.personajeId);
    return rutaRetrato(p?.recipeId ?? 'sin-receta', l.expresion);
  }

  protected nombrar(e: Escena, titulo: string): void {
    const limpio = titulo.trim();
    if (limpio && limpio !== e.titulo) this.store.editarEscena(e.id, { titulo: limpio });
  }

  /** Un recurso por línea; las líneas vacías no cuentan. */
  protected cambiarRecursos(e: Escena, texto: string): void {
    const recursos = texto.split('\n').map((r) => r.trim()).filter(Boolean);
    this.store.editarEscena(e.id, { recursosApoyo: recursos });
    this.anuncio.set(recursos.length ? 'Recursos de apoyo guardados.' : 'Sin recursos de apoyo en esta escena.');
  }

  protected cambiarIntensidad(e: Escena, valor: string): void {
    this.store.editarEscena(e.id, { intensidad: valor as IntensidadEscena });
    this.anuncio.set(valor === 'HIGH' ? 'Intensidad alta: escribe el aviso para el estudiante.' : `Intensidad ${NOMBRE_INTENSIDAD[valor as IntensidadEscena].toLowerCase()}.`);
  }

  /** Lo que le pasa a la persona en modo automático, dicho con palabras; sin clase, qué falta. */
  protected textoAutomatico(r: Respuesta): string {
    const frase = fraseDeRespuesta(r);
    return frase ? `Si el estudiante la elige, la persona ${frase}.` : 'Elige la clase para ver qué le pasa a la persona.';
  }

  /** La respuesta como está ahora en el caso: dos cambios seguidos (antes de que la pantalla se redibuje) no pisan el primero. */
  private vigente(e: Escena, r: Respuesta): Respuesta {
    return this.store.caso()?.escenas.find((x) => x.id === e.id)?.respuestas.find((x) => x.id === r.id) ?? r;
  }

  protected personaAutomatica(e: Escena, r: Respuesta): void {
    this.store.editarRespuesta(e.id, r.id, { efectos: sinPasoDePersona(this.vigente(e, r).efectos) });
  }

  /** Empieza donde lo dejaba la clase, para que la docente corrija en vez de partir de cero. */
  protected personaPropia(e: Escena, r: Respuesta): void {
    const actual = this.vigente(e, r);
    const [vinculo, activacion] = pasoDeRespuesta(actual) ?? [0, 0];
    this.store.editarRespuesta(e.id, r.id, { efectos: conPasoDePersona(actual.efectos, { bond: vinculo, activation: activacion }) });
  }

  protected cambiarPaso(e: Escena, r: Respuesta, eje: 'bond' | 'activation', valor: string): void {
    this.store.editarRespuesta(e.id, r.id, { efectos: conPasoDePersona(this.vigente(e, r).efectos, { [eje]: Number(valor) }) });
  }

  protected marcarHito(e: Escena, r: Respuesta, clave: string, cumple: boolean): void {
    this.store.editarRespuesta(e.id, r.id, { efectos: conHito(this.vigente(e, r).efectos, clave, cumple) });
  }

  protected marcarCompetencia(e: Escena, r: Respuesta, codigo: string, evidencia: boolean): void {
    this.store.editarRespuesta(e.id, r.id, { efectos: conCompetencia(this.vigente(e, r).efectos, codigo, evidencia) });
  }

  protected agregarLinea(e: Escena): void {
    const id = this.store.agregarLinea(e.id);
    this.lineaVista.set(id);
    this.enfocar(`lt${this.escena()!.lineas.length - 1}`);
  }

  /** El juego muestra las opciones como A–D: el tope solo impide agregar, nunca borra las que ya haya. */
  protected readonly maximoRespuestas = MAX_RESPUESTAS;

  protected enElTopeDeRespuestas(e: Escena): boolean {
    return e.respuestas.length >= MAX_RESPUESTAS;
  }

  protected describedbyAgregarRespuesta(e: Escena): string | null {
    if (!this.enElTopeDeRespuestas(e)) return null;
    return e.respuestas.length > MAX_RESPUESTAS ? 'respuestas-tope respuestas-exceso' : 'respuestas-tope';
  }

  protected agregarRespuesta(e: Escena): void {
    if (this.enElTopeDeRespuestas(e)) return;
    this.store.agregarRespuesta(e.id);
    this.enfocar(`rt${this.escena()!.respuestas.length - 1}`);
  }

  protected moverLinea(e: Escena, l: Linea, i: number, delta: -1 | 1): void {
    this.store.moverLinea(e.id, l.id, delta);
    this.anuncio.set(`Línea ${i + 1}, ahora en la posición ${i + 1 + delta} de ${e.lineas.length}.`);
  }

  protected elegirDestino(e: Escena, r: Respuesta, valor: string): void {
    this.creada.set(null);
    if (valor === 'nueva') {
      this.pendiente.set(r.id);
      return;
    }
    this.pendiente.set(null);
    this.store.conectar(r.id, valor || null);
  }

  protected crearEscenaNueva(e: Escena, r: Respuesta, i: number): void {
    const id = this.store.respuestaAEscenaNueva(e.id, r.id);
    const nueva = this.escenas().find((x) => x.id === id)!;
    this.pendiente.set(null);
    this.creada.set({ respuestaId: r.id, escenaId: id, titulo: `${this.numero(nueva)} · ${nueva.titulo}` });
    this.anuncio.set(`Se creó «${nueva.titulo}», conectada a la respuesta ${i + 1}.`);
  }

  private enfocar(id: string): void {
    setTimeout(() => document.getElementById(id)?.focus());
  }

  /**
   * Lo pulsado desaparece al borrar o aceptar: el foco va al primer selector que exista, para
   * que quien usa el teclado no vuelva al principio de la página.
   */
  private enfocarPrimero(...selectores: string[]): void {
    setTimeout(() => {
      for (const s of selectores) {
        const el = document.querySelector<HTMLElement>(s);
        if (el) {
          el.focus();
          return;
        }
      }
    });
  }

  /** Acepta de una vez lo sugerido en la escena; solo si de verdad quedó todo aceptado se anuncia (si no, habla el aviso de lo que faltó). */
  protected async aceptarEscena(e: Escena): Promise<void> {
    this.store.aceptarEscenaIa(e.id);
    this.enfocarPrimero('#en');
    await this.store.sincronizado();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (this.store.partesIaDeEscena(e.id) === 0) this.anuncio.set('Aceptaste todo lo sugerido en esta escena.');
  }

  protected aceptarLinea(e: Escena, l: Linea, i: number): void {
    this.store.aceptarIa({ escenaId: e.id, lineaId: l.id });
    this.anuncio.set(`Línea ${i + 1} aceptada.`);
    this.enfocarPrimero(`#lt${i}`);
  }

  protected borrarLinea(e: Escena, l: Linea, i: number, como: 'borrada' | 'descartada' = 'borrada'): void {
    this.store.borrarLinea(e.id, l.id);
    this.anuncio.set(`Línea ${i + 1} ${como}.`);
    this.enfocarPrimero(`#lt${i}`, `#lt${i - 1}`, '[data-accion="agregar-linea"]');
  }

  protected duplicarLinea(e: Escena, l: Linea, i: number): void {
    this.store.duplicarLinea(e.id, l.id);
    this.anuncio.set(`Línea ${i + 1} duplicada: la copia es la línea ${i + 2}.`);
    this.enfocarPrimero(`#lt${i + 1}`);
  }

  protected aceptarRespuesta(e: Escena, r: Respuesta, i: number): void {
    this.store.aceptarIa({ escenaId: e.id, respuestaId: r.id });
    this.anuncio.set(`Respuesta ${i + 1} aceptada.`);
    this.enfocarPrimero(`#rt${i}`);
  }

  protected borrarRespuesta(e: Escena, r: Respuesta, i: number, como: 'borrada' | 'descartada' = 'borrada'): void {
    this.store.borrarRespuesta(e.id, r.id);
    this.anuncio.set(`Respuesta ${i + 1} ${como}.`);
    this.enfocarPrimero(`#rt${i}`, `#rt${i - 1}`, '[data-accion="agregar-respuesta"]');
  }
}
