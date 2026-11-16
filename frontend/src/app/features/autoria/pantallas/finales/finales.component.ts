import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { estadoDeCaminos } from '../../modelo/caminos';
import type { ClaveFinalPlantilla, CondicionFinal, Final } from '../../modelo/caso';
import { describirCondicion } from '../../modelo/condiciones';
import { FINALES_AUTOMATICOS, finalesDePlantilla, reglasDePlantilla } from '../../modelo/finales';
import {
  type ParteDeCondicion, type TipoDeParte, condicionDePartes, parteNueva, partesDeCondicion,
} from '../../modelo/partes-de-condicion';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS } from '../../modelo/persona';
import { finalesAlcanzados } from '../../modelo/recorridos';
import { RutasAutoria } from '../../rutas';

/** Las frases que el editor sabe armar; una condición que no es una lista de ellas se conserva tal cual. */
const TIPOS_DE_FRASE: { tipo: TipoDeParte; nombre: string }[] = [
  { tipo: 'hito', nombre: 'Si cumplió el hito' },
  { tipo: 'sin-hito', nombre: 'Si no cumplió el hito' },
  { tipo: 'contraindicadas', nombre: 'Si eligió respuestas contraindicadas' },
  { tipo: 'ninguna-contraindicada', nombre: 'Si no eligió ninguna respuesta contraindicada' },
  { tipo: 'riesgo', nombre: 'Si eligió respuestas con riesgo' },
  { tipo: 'persona', nombre: 'Si la persona terminó' },
];

/**
 * Finales del caso (tablero 28): si el docente no hace nada se calculan solos —cuatro finales de plantilla que dependen de los
 * hitos que marque como decisivos y cuyo texto puede reescribir—; si quiere, define los suyos con una condición en frases cada
 * uno. Gana el primero de la lista que se cumpla.
 */
@Component({
  selector: 'app-finales',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina">
        <div class="cabeza">
          <div>
            <h1>Finales del caso</h1>
            <p class="texto-secundario">
              Lo que el estudiante lee al terminar. Si no haces nada, los finales se calculan solos con los hitos cumplidos y las respuestas que clasificaste.
            </p>
          </div>
          <div class="acciones">
            <a [routerLink]="rutas.a('/editor')" class="boton boton-secundario">Volver al mapa</a>
          </div>
        </div>

        <fieldset class="tarjeta modo" data-accion="definir-finales">
          <legend>Cómo se deciden los finales</legend>
          <label class="opcion">
            <input type="radio" name="modo" value="automatico" [checked]="caso.modoFinales === 'automatico'" (change)="pedirModo('automatico', $event)" />
            <span><strong>Los finales se calculan solos</strong><br />
              <span class="texto-secundario">Según los hitos que cumplió y cuántas respuestas con riesgo o contraindicadas eligió el estudiante. No tienes que escribir nada.</span></span>
          </label>
          <label class="opcion">
            <input type="radio" name="modo" value="propio" [checked]="caso.modoFinales === 'propio'" (change)="pedirModo('propio', $event)" />
            <span><strong>Quiero definir mis finales</strong><br />
              <span class="texto-secundario">Tú decides cuántos hay, qué los provoca y qué dice cada uno.</span></span>
          </label>
        </fieldset>

        @if (confirmandoModo()) {
          <div class="tarjeta dialogo peligro" role="alertdialog" aria-labelledby="cmt">
            <h2 id="cmt" tabindex="-1">{{ preguntaModo(caso.finales.length) }}</h2>
            <p>Los finales se calcularán solos con los hitos y las respuestas. Si después quieres volver a definirlos tú, tendrás que escribirlos de nuevo.</p>
            <div class="acciones">
              <button type="button" class="boton boton-peligro" (click)="aceptarModo()">Sí, usar los que se calculan solos</button>
              <button type="button" class="boton" (click)="conservarModo()">No, conservar mis finales</button>
            </div>
          </div>
        }

        <p role="status" class="texto-secundario">{{ estadoCaminos() }}</p>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        @if (caso.modoFinales === 'propio') {
          <section aria-labelledby="fh" class="bloque">
            <h2 id="fh">Tus finales ({{ caso.finales.length }})</h2>
            <p class="texto-secundario">Si el estudiante cumple las condiciones de varios finales, verá el que está más arriba. Si no cumple ninguna, verá uno de los cuatro finales que se calculan solos.</p>
            <ol class="lista">
              @for (f of caso.finales; track f.id; let i = $index; let primero = $first; let ultimo = $last) {
                <li class="tarjeta final" [class.marca-ia]="f.marcaIa" [id]="'final-' + f.id" tabindex="-1">
                  <div class="fila-titulo">
                    <strong>Final {{ i + 1 }}</strong>
                    @if (f.marcaIa) {
                      <span class="pildora">Sugerido por la IA</span>
                      <button type="button" class="boton" (click)="aceptarFinal(f, i)">Aceptar final</button>
                      <button type="button" class="boton boton-texto" (click)="borrarFinal(f, i, 'descartado')">Descartar final</button>
                    }
                    <span class="acciones derecha">
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Subir el final ' + f.nombre" [attr.aria-disabled]="primero" (click)="!primero && store.moverFinal(f.id, -1)">↑</button>
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Bajar el final ' + f.nombre" [attr.aria-disabled]="ultimo" (click)="!ultimo && store.moverFinal(f.id, 1)">↓</button>
                      <button type="button" class="boton cuadrado peligro" [attr.aria-label]="'Borrar el final ' + f.nombre" (click)="borrarFinal(f, i)">✕</button>
                    </span>
                  </div>
                  <label [for]="'fn' + i" class="etiqueta">Nombre</label>
                  <input [id]="'fn' + i" type="text" class="campo" [value]="f.nombre" (change)="store.editarFinal(f.id, { nombre: $any($event.target).value })" />
                  <label [for]="'ft' + i" class="etiqueta">Lo que lee el estudiante al terminar</label>
                  <textarea [id]="'ft' + i" class="campo" rows="3" [value]="f.texto" (change)="store.editarFinal(f.id, { texto: $any($event.target).value })"></textarea>
                  <fieldset class="condicion">
                    <legend>El final «{{ f.nombre }}» llega cuando…</legend>
                    @if (partes(f.condicion); as lista) {
                      @if (lista.length === 0) {
                        <div class="frase">
                          <select class="campo" aria-label="Tipo de condición" (change)="cambiarTipo(f, lista, 0, $any($event.target).value)">
                            @for (t of tipos; track t.tipo) { <option [value]="t.tipo" [disabled]="!caso.hitos.length && (t.tipo === 'hito' || t.tipo === 'sin-hito')">{{ t.nombre }}</option> }
                            <option value="ninguna" selected>Ninguna condición en particular</option>
                          </select>
                        </div>
                      }
                      @for (p of lista; track $index; let j = $index) {
                        <div class="frase">
                          @if (j > 0) { <span class="y" aria-hidden="true">y</span> }
                          <select class="campo" [attr.aria-label]="etiqueta('Tipo de condición', j, lista.length)" (change)="cambiarTipo(f, lista, j, $any($event.target).value)">
                            @for (t of tipos; track t.tipo) { <option [value]="t.tipo" [selected]="p.tipo === t.tipo" [disabled]="!caso.hitos.length && (t.tipo === 'hito' || t.tipo === 'sin-hito')">{{ t.nombre }}</option> }
                            @if (lista.length === 1) { <option value="ninguna">Ninguna condición en particular</option> }
                          </select>
                          @switch (p.tipo) {
                            @case ('hito') {
                              <select class="campo" [attr.aria-label]="etiqueta('Hito', j, lista.length)" (change)="fijarParte(f, lista, j, { tipo: 'hito', clave: $any($event.target).value })">
                                @if (!existeHito(p.clave)) { <option value="" selected disabled>Elige un hito (el anterior ya no está)</option> }
                                @for (h of caso.hitos; track h.clave) { <option [value]="h.clave" [selected]="p.clave === h.clave">{{ h.nombre }}</option> }
                              </select>
                            }
                            @case ('sin-hito') {
                              <select class="campo" [attr.aria-label]="etiqueta('Hito', j, lista.length)" (change)="fijarParte(f, lista, j, { tipo: 'sin-hito', clave: $any($event.target).value })">
                                @if (!existeHito(p.clave)) { <option value="" selected disabled>Elige un hito (el anterior ya no está)</option> }
                                @for (h of caso.hitos; track h.clave) { <option [value]="h.clave" [selected]="p.clave === h.clave">{{ h.nombre }}</option> }
                              </select>
                            }
                            @case ('contraindicadas') {
                              <select class="campo" [attr.aria-label]="etiqueta('Cuántas', j, lista.length)" (change)="fijarParte(f, lista, j, { tipo: 'contraindicadas', n: +$any($event.target).value })">
                                @for (n of cantidades; track n) { <option [value]="n" [selected]="p.n === n">al menos {{ n }}</option> }
                              </select>
                            }
                            @case ('riesgo') {
                              <select class="campo" [attr.aria-label]="etiqueta('Cuántas', j, lista.length)" (change)="fijarParte(f, lista, j, { tipo: 'riesgo', n: +$any($event.target).value })">
                                @for (n of cantidades; track n) { <option [value]="n" [selected]="p.n === n">al menos {{ n }}</option> }
                              </select>
                            }
                            @case ('persona') {
                              <select class="campo" [attr.aria-label]="etiqueta('Cómo termina el vínculo', j, lista.length)" (change)="cambiarPersona($event, f, lista, j, p, 'bond')">
                                <option value="" [selected]="!p.bond">Cualquiera</option>
                                @for (v of vinculos; track v.valor) { <option [value]="v.valor" [selected]="p.bond === v.valor">{{ v.nombre }}</option> }
                              </select>
                              <select class="campo" [attr.aria-label]="etiqueta('Cómo termina la activación', j, lista.length)" (change)="cambiarPersona($event, f, lista, j, p, 'activation')">
                                <option value="" [selected]="!p.activation">Cualquiera</option>
                                @for (v of activaciones; track v.valor) { <option [value]="v.valor" [selected]="p.activation === v.valor">{{ v.nombre }}</option> }
                              </select>
                            }
                          }
                          @if (lista.length > 0) {
                            <button type="button" class="boton cuadrado peligro" [attr.aria-label]="etiqueta('Quitar la condición', j, lista.length)" (click)="quitarParte(f, lista, j)">✕</button>
                          }
                        </div>
                      }
                      @if (lista.length > 0) {
                        <button type="button" class="boton agregar-condicion" (click)="agregarParte(f, lista)">Agregar otra condición (y…)</button>
                      }
                      @if (f.condicion) {
                        <p class="texto-secundario en-palabras">El estudiante {{ describir(f.condicion) }}.</p>
                      }
                    } @else {
                      <p><strong>Una condición combinada</strong></p>
                      <p class="texto-secundario en-palabras">El estudiante {{ describir(f.condicion) }}. Esta condición se conserva como está.</p>
                    }
                  </fieldset>
                </li>
              }
            </ol>
            <button type="button" class="boton" id="agregar-final" (click)="agregarFinal()">Agregar un final</button>
          </section>
        } @else {
          <fieldset class="tarjeta decisivos">
            <legend>Hitos que deciden el final</legend>
            <p class="texto-secundario">Marca los pasos que el estudiante tiene que dar sí o sí. Con ellos se arman los cuatro finales de abajo.</p>
            @for (h of caso.hitos; track h.clave) {
              <label class="casilla">
                <input type="checkbox" [checked]="h.decisivo" (change)="store.editarHito(h.clave, { decisivo: $any($event.target).checked })" />
                {{ h.nombre }}
              </label>
            } @empty {
              <p class="texto-secundario">Este caso todavía no tiene hitos.</p>
            }
            @if (!hayDecisivos()) {
              <p class="sin-decisivos" role="note">Sin hitos decisivos, los finales no dependen de los pasos del caso. Marca al menos un hito como decisivo.</p>
            }
          </fieldset>

          <section aria-labelledby="fa" class="bloque">
            <h2 id="fa">Los cuatro finales que se calculan solos</h2>
            <p class="texto-secundario">Gana el primero de la lista que se cumple. Puedes reescribir el nombre y el texto de cada uno; cuándo llega lo deciden los hitos de arriba.</p>
            <ul class="lista">
              @for (f of plantilla(); track f.id) {
                <li class="tarjeta final-plantilla final" [id]="'final-' + f.id">
                  <strong>{{ f.nombre }}</strong>
                  <p class="texto-secundario regla" [id]="'regla-' + f.id">{{ reglas()[f.id] }}</p>
                  <p class="texto-secundario alcance">{{ alcance(f.id) }}</p>
                  <label [for]="'pn-' + f.id" class="etiqueta">Nombre</label>
                  <input [id]="'pn-' + f.id" type="text" class="campo" [value]="f.nombre" (change)="editarPlantilla(f.id, { nombre: $any($event.target).value })" />
                  <label [for]="'pt-' + f.id" class="etiqueta">Lo que lee el estudiante al terminar</label>
                  <textarea [id]="'pt-' + f.id" class="campo" rows="3" [value]="f.texto" (change)="editarPlantilla(f.id, { texto: $any($event.target).value })"></textarea>
                  @if (editado(f.id)) {
                    <button type="button" class="boton boton-texto restaurar" [id]="'restaurar-' + f.id" (click)="restaurar(f.id)">Volver al texto original</button>
                  }
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .cabeza { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
    .cabeza p { margin: 4px 0 0; max-width: 760px; }
    .modo { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--linea); }
    .modo legend { font-weight: 700; padding: 0 4px; }
    .opcion { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); cursor: pointer; }
    .opcion:has(input:checked) { border-color: var(--primario); background: var(--primario-tinte); }
    .opcion input { width: 22px; height: 22px; margin-top: 3px; accent-color: var(--primario); }
    .dialogo { display: flex; flex-direction: column; gap: 12px; max-width: 640px; border: 2px solid var(--peligro); }
    .dialogo h2, .dialogo p { margin: 0; }
    .bloque { display: flex; flex-direction: column; gap: 12px; }
    .bloque h2, .bloque > p { margin: 0; }
    .bloque > .boton { align-self: flex-start; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .final { display: flex; flex-direction: column; gap: 6px; }
    .marca-ia { border: 2px dashed var(--borde-control); }
    .fila-titulo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .derecha { margin-left: auto; }
    .cuadrado { width: 48px; padding: 0; }
    .peligro { color: var(--peligro); }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { min-height: 48px; padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    select.campo { padding: 0 12px; width: auto; }
    /* Un fieldset no se encoge por debajo de su contenido (min-inline-size: min-content): con una opción larga en el
       selector, la condición desbordaba la tarjeta y la página entera en un teléfono (390 px). */
    .condicion { border: 0; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-inline-size: 0; }
    .decisivos { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--linea); }
    .decisivos legend { font-weight: 700; padding: 0 4px; }
    .decisivos p { margin: 0; }
    .casilla { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; font-size: var(--autoria-texto-16); }
    .casilla input { width: 20px; height: 20px; accent-color: var(--primario); }
    .sin-decisivos { padding: 8px 12px; border-radius: var(--radio-control); background: var(--aviso-tinte); color: var(--aviso-texto); font-weight: 700; }
    .final-plantilla { display: flex; flex-direction: column; gap: 6px; }
    .frase { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; }
    .frase .y { font-weight: 700; }
    .frase .campo { max-width: 100%; }
    .en-palabras { margin: 0; width: 100%; }
    .restaurar { align-self: flex-start; }
    .condicion legend { font-weight: 700; font-size: var(--autoria-texto-16); margin-bottom: 4px; }
    .lista li p { margin: 4px 0 0; }
    .regla { font-size: var(--autoria-texto-16); }
  `,
})
export class FinalesComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  protected readonly anuncio = signal('');
  protected readonly tipos = TIPOS_DE_FRASE;
  protected readonly cantidades = [1, 2, 3, 4, 5];
  protected readonly vinculos = Object.entries(VINCULO_EN_PALABRAS).map(([valor, nombre]) => ({ valor, nombre }));
  protected readonly activaciones = Object.entries(ACTIVACION_EN_PALABRAS).map(([valor, nombre]) => ({ valor, nombre }));

  /** Los cuatro finales de plantilla como van a quedar: el texto del modelo o el que reescribió la docente, con la condición de ahora. */
  protected readonly plantilla = computed(() => {
    const caso = this.store.caso();
    return caso ? finalesDePlantilla(caso).map((f) => ({ ...f, id: f.id as ClaveFinalPlantilla })) : [];
  });
  protected readonly reglas = computed(() => reglasDePlantilla(this.store.caso()?.hitos.filter((h) => h.decisivo) ?? []));
  protected readonly hayDecisivos = computed(() => (this.store.caso()?.hitos ?? []).some((h) => h.decisivo));
  private readonly alcanzados = computed(() => {
    const caso = this.store.caso();
    return caso ? finalesAlcanzados(caso) : { finales: {}, omitido: false };
  });

  protected readonly estadoCaminos = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    return estadoDeCaminos(caso);
  });

  /** El docente pidió pasar a los finales automáticos teniendo finales propios: se pregunta antes de dejar de usarlos. */
  protected readonly confirmandoModo = signal(false);

  /**
   * Cambiar el modo. Pasar a «se calculan solos» con finales propios los quita del servidor: antes se pregunta y, mientras tanto,
   * el selector se queda donde estaba.
   */
  protected pedirModo(modo: 'automatico' | 'propio', evento: Event): void {
    const caso = this.store.caso();
    if (!caso) return;
    if (modo === 'automatico' && caso.modoFinales === 'propio' && caso.finales.length > 0) {
      const elegido = evento.target as HTMLInputElement;
      elegido.checked = false;
      const propio = elegido.closest('fieldset')?.querySelector<HTMLInputElement>('input[value="propio"]');
      if (propio) propio.checked = true;
      this.confirmandoModo.set(true);
      setTimeout(() => document.getElementById('cmt')?.focus());
      return;
    }
    this.store.fijarModoFinales(modo);
  }

  protected preguntaModo(n: number): string {
    return n === 1 ? 'Tu final propio dejará de usarse. ¿Seguir?' : `Tus ${n} finales propios dejarán de usarse. ¿Seguir?`;
  }

  protected aceptarModo(): void {
    this.confirmandoModo.set(false);
    this.store.fijarModoFinales('automatico');
    this.anuncio.set('Los finales se calculan solos.');
    this.enfocarPrimero('input[name="modo"][value="automatico"]');
  }

  protected conservarModo(): void {
    this.confirmandoModo.set(false);
    this.anuncio.set('Se conservan tus finales.');
    this.enfocarPrimero('input[name="modo"][value="propio"]');
  }

  protected agregarFinal(): void {
    this.store.agregarFinal();
    const n = this.store.caso()?.finales.length ?? 1;
    this.anuncio.set(`Final ${n} agregado.`);
    this.enfocarPrimero(`#fn${n - 1}`);
  }

  protected aceptarFinal(f: Final, i: number): void {
    this.store.aceptarIa({ finalId: f.id });
    this.anuncio.set('Final aceptado.');
    this.enfocarPrimero(`#fn${i}`);
  }

  protected borrarFinal(f: Final, i: number, como: 'borrado' | 'descartado' = 'borrado'): void {
    this.store.borrarFinal(f.id);
    this.anuncio.set(`Final ${como}.`);
    this.enfocarPrimero(`#fn${i}`, `#fn${i - 1}`, '#agregar-final');
  }

  /** Lo pulsado desaparece al borrar o aceptar: el foco va al primer selector que exista. */
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

  protected alcance(id: string): string {
    const { finales, omitido } = this.alcanzados();
    if (omitido) return 'No se pudo comprobar: el caso tiene demasiados recorridos.';
    return finales[id] ? 'Algún recorrido llega aquí.' : 'Ningún recorrido llega aquí con las respuestas de ahora.';
  }

  /** ¿La docente reescribió el nombre o el texto de este final de plantilla? */
  protected editado(id: ClaveFinalPlantilla): boolean {
    const e = this.store.caso()?.textosPlantilla?.[id];
    return (!!e?.nombre?.trim() && e.nombre !== FINALES_AUTOMATICOS[id].nombre) || (!!e?.texto?.trim() && e.texto !== FINALES_AUTOMATICOS[id].texto);
  }

  protected editarPlantilla(id: ClaveFinalPlantilla, cambios: { nombre?: string; texto?: string }): void {
    this.store.editarTextoPlantilla(id, cambios);
  }

  protected restaurar(id: ClaveFinalPlantilla): void {
    this.store.restaurarTextoPlantilla(id);
    this.anuncio.set('El final volvió al texto original.');
    this.enfocarPrimero(`#pn-${id}`);
  }

  /** Las frases de la condición; `null` si el editor no sabe mostrarla en frases (se conserva como está). */
  protected partes(c: CondicionFinal | null): ParteDeCondicion[] | null {
    return partesDeCondicion(c);
  }

  /** «Hito», «Hito 2»…: con una sola frase el nombre va solo; con varias, numerado. */
  protected etiqueta(base: string, indice: number, total: number): string {
    return total > 1 ? `${base} ${indice + 1}` : base;
  }

  protected existeHito(clave: string): boolean {
    return !!this.store.caso()?.hitos.some((h) => h.clave === clave);
  }

  protected describir(c: CondicionFinal | null): string {
    return describirCondicion(c, this.store.caso()?.hitos ?? []);
  }

  private guardar(f: Final, partes: ParteDeCondicion[]): void {
    this.store.editarFinal(f.id, { condicion: condicionDePartes(partes) });
  }

  /** Cambiar el tipo de una frase la reemplaza por una nueva de ese tipo; «Ninguna condición» quita todas. */
  protected cambiarTipo(f: Final, partes: ParteDeCondicion[], indice: number, tipo: string): void {
    if (tipo === 'ninguna') {
      this.guardar(f, []);
      return;
    }
    const caso = this.store.caso()!;
    const nueva = parteNueva(tipo as TipoDeParte, caso.hitos);
    if (!nueva) return;
    // El primer hito decisivo es la mejor primera elección para «cumplió el hito».
    const decisivo = caso.hitos.find((h) => h.decisivo);
    if ((nueva.tipo === 'hito' || nueva.tipo === 'sin-hito') && decisivo) nueva.clave = decisivo.clave;
    this.guardar(f, partes.length ? partes.map((p, j) => (j === indice ? nueva : p)) : [nueva]);
  }

  protected fijarParte(f: Final, partes: ParteDeCondicion[], indice: number, nueva: ParteDeCondicion): void {
    this.guardar(f, partes.map((p, j) => (j === indice ? nueva : p)));
  }

  protected cambiarPersona(
    evento: Event, f: Final, partes: ParteDeCondicion[], indice: number, actual: Extract<ParteDeCondicion, { tipo: 'persona' }>, eje: 'bond' | 'activation',
  ): void {
    const campo = evento.target as HTMLSelectElement;
    const nueva = { ...actual, [eje]: campo.value || undefined } as Extract<ParteDeCondicion, { tipo: 'persona' }>;
    if (!nueva.bond && !nueva.activation) {
      campo.value = actual[eje] ?? ''; // una condición sobre la persona dice al menos una cosa
      return;
    }
    this.fijarParte(f, partes, indice, nueva);
  }

  protected quitarParte(f: Final, partes: ParteDeCondicion[], indice: number): void {
    this.guardar(f, partes.filter((_, j) => j !== indice));
  }

  /** La segunda frase nace como «no eligió ninguna contraindicada»: lo que más se pide junto a un hito cumplido. */
  protected agregarParte(f: Final, partes: ParteDeCondicion[]): void {
    this.guardar(f, [...partes, { tipo: 'ninguna-contraindicada' }]);
  }
}
