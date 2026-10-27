import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { ClaseRespuesta, Escena, Linea, Respuesta } from '../../modelo/caso';
import { EXPRESIONES } from '../../modelo/escenario';
import { NOMBRE_CLASE, NOMBRE_EXPRESION } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';

const CLASIFICACIONES: { valor: ClaseRespuesta; nombre: string; simbolo: string }[] = [
  { valor: 'RECOMMENDED', nombre: NOMBRE_CLASE.RECOMMENDED, simbolo: '✓' },
  { valor: 'ACCEPTABLE', nombre: NOMBRE_CLASE.ACCEPTABLE, simbolo: '✓' },
  { valor: 'RISKY', nombre: NOMBRE_CLASE.RISKY, simbolo: '▲' },
  { valor: 'CONTRAINDICATED', nombre: NOMBRE_CLASE.CONTRAINDICATED, simbolo: '✕' },
];

/**
 * Guion de una escena, tipo libreto (tablero 27): personaje, expresión y lo que dice; debajo,
 * lo que puede responder el estudiante, con su clasificación, lo que lee después y a dónde lleva.
 */
@Component({
  selector: 'app-guion',
  imports: [RouterLink],
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
              <button type="button" class="boton" (click)="aceptarEscena(e)">Aceptar escena</button>
            </div>
          }
          <label for="en" class="etiqueta">Escena {{ numero(e) }} · Nombre</label>
          <input id="en" type="text" class="campo" [value]="e.titulo" (change)="nombrar(e, $any($event.target).value)" />
          <p class="texto-secundario">Sala: {{ nombreSala(e.salaId) }}{{ lleganDesde(e) ? ' · Llegan aquí desde ' + lleganDesde(e) : '' }}</p>
          <div class="acciones">
            @if (e.salaId) {
              <a class="boton" [routerLink]="rutas.a('/editor/sala', e.salaId)">Abrir sala</a>
            }
            <a class="boton" [routerLink]="rutas.a('/probar')" [queryParams]="{ desde: e.id }">Probar desde aquí</a>
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

            <section aria-labelledby="rh" class="bloque" data-accion="respuesta-a-escena-nueva">
              <h2 id="rh">Lo que puede responder el estudiante</h2>
              <p class="texto-secundario">Cada respuesta lleva a una escena. Si eliges «Una escena nueva», se crea y se conecta cuando pulsas «Crear la escena nueva».</p>
              <ol class="lista">
                @for (r of e.respuestas; track r.id; let i = $index) {
                  <li class="tarjeta respuesta" [class.marca-ia]="r.marcaIa">
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
                      <textarea [id]="'rz' + i" class="campo" rows="2" [value]="r.razon"
                                (change)="store.editarRespuesta(e.id, r.id, { razon: $any($event.target).value })"></textarea>
                      @if (!r.razon.trim()) {
                        <p class="texto-secundario nota">Explica por qué esta respuesta puede hacerle daño a la persona.</p>
                      }
                    }
                    <label [for]="'rf' + i" class="etiqueta">Lo que lee el estudiante después de elegir</label>
                    <textarea [id]="'rf' + i" class="campo" rows="2" [value]="r.retroalimentacion"
                              (change)="store.editarRespuesta(e.id, r.id, { retroalimentacion: $any($event.target).value })"></textarea>
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
              <button type="button" class="boton" data-accion="agregar-respuesta" (click)="agregarRespuesta(e)">Agregar una respuesta</button>
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
  private readonly router = inject(Router);
  protected readonly expresiones = EXPRESIONES;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  protected readonly clasificaciones = CLASIFICACIONES;
  protected readonly anuncio = signal('');
  protected readonly lineaVista = signal<string | null>(null);
  protected readonly pendiente = signal<string | null>(null);
  protected readonly creada = signal<{ respuestaId: string; escenaId: string; titulo: string } | null>(null);

  protected readonly escena = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.escenaId()) ?? null);
  protected readonly escenas = computed(() => this.store.caso()?.escenas ?? []);
  protected readonly personajes = computed(() => this.store.caso()?.personajes ?? []);
  protected readonly lineaMostrada = computed(() => {
    const e = this.escena();
    return e?.lineas.find((l) => l.id === this.lineaVista()) ?? e?.lineas[0] ?? null;
  });

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

  protected agregarLinea(e: Escena): void {
    const id = this.store.agregarLinea(e.id);
    this.lineaVista.set(id);
    this.enfocar(`lt${this.escena()!.lineas.length - 1}`);
  }

  protected agregarRespuesta(e: Escena): void {
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

  protected aceptarEscena(e: Escena): void {
    this.store.aceptarIa({ escenaId: e.id });
    this.anuncio.set('Escena aceptada.');
    this.enfocarPrimero('#en');
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
