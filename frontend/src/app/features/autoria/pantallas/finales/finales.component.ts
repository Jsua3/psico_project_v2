import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { estadoDeCaminos } from '../../modelo/caminos';
import type { CondicionFinal, Final } from '../../modelo/caso';
import { describirCondicion } from '../../modelo/condiciones';
import { FINALES_AUTOMATICOS, ORDEN_AUTOMATICOS } from '../../modelo/finales';
import { RutasAutoria } from '../../rutas';

/** Las condiciones sencillas que el editor sabe armar; cualquier otra se conserva tal cual. */
type TipoCondicion = 'hito' | 'contraindicadas' | 'riesgo' | 'ninguna' | 'otra';

/**
 * Finales del caso (tablero 28): si el docente no hace nada se calculan solos; si quiere,
 * define los suyos con una condición cada uno. Gana el primero de la lista que se cumpla.
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
            <input type="radio" name="modo" value="automatico" [checked]="caso.modoFinales === 'automatico'" (change)="store.fijarModoFinales('automatico')" />
            <span><strong>Los finales se calculan solos</strong><br />
              <span class="texto-secundario">Según los hitos que cumplió y cuántas respuestas con riesgo o contraindicadas eligió el estudiante. No tienes que escribir nada.</span></span>
          </label>
          <label class="opcion">
            <input type="radio" name="modo" value="propio" [checked]="caso.modoFinales === 'propio'" (change)="store.fijarModoFinales('propio')" />
            <span><strong>Quiero definir mis finales</strong><br />
              <span class="texto-secundario">Tú decides cuántos hay, qué los provoca y qué dice cada uno.</span></span>
          </label>
        </fieldset>

        <p role="status" class="texto-secundario">{{ estadoCaminos() }}</p>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        @if (caso.modoFinales === 'propio') {
          <section aria-labelledby="fh" class="bloque">
            <h2 id="fh">Tus finales ({{ caso.finales.length }})</h2>
            <p class="texto-secundario">Si el estudiante cumple las condiciones de varios finales, verá el que está más arriba. Si no cumple ninguna, verá uno de los cuatro finales que se calculan solos.</p>
            <ol class="lista">
              @for (f of caso.finales; track f.id; let i = $index; let primero = $first; let ultimo = $last) {
                <li class="tarjeta final" [class.marca-ia]="f.marcaIa">
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
                    <select class="campo" aria-label="Tipo de condición" (change)="cambiarTipo(f, $any($event.target).value)">
                      <option value="hito" [selected]="tipoDe(f.condicion) === 'hito'" [disabled]="!caso.hitos.length">El estudiante cumple un hito</option>
                      <option value="contraindicadas" [selected]="tipoDe(f.condicion) === 'contraindicadas'">Elige respuestas contraindicadas</option>
                      <option value="riesgo" [selected]="tipoDe(f.condicion) === 'riesgo'">Elige respuestas con riesgo</option>
                      <option value="ninguna" [selected]="tipoDe(f.condicion) === 'ninguna'">Ninguna condición en particular</option>
                      @if (tipoDe(f.condicion) === 'otra') {
                        <option value="otra" selected>Una condición combinada</option>
                      }
                    </select>
                    @switch (tipoDe(f.condicion)) {
                      @case ('hito') {
                        <select class="campo" aria-label="Hito" (change)="fijar(f, { milestone: $any($event.target).value })">
                          @if (!existeHito(f.condicion)) {
                            <option value="" selected disabled>Elige un hito (el anterior ya no está)</option>
                          }
                          @for (h of caso.hitos; track h.clave) {
                            <option [value]="h.clave" [selected]="hitoDe(f.condicion) === h.clave">{{ h.nombre }}</option>
                          }
                        </select>
                      }
                      @case ('contraindicadas') {
                        <select class="campo" aria-label="Cuántas" (change)="fijar(f, { count: 'contraindicated', gte: +$any($event.target).value })">
                          @for (n of [1, 2, 3, 4, 5]; track n) {
                            <option [value]="n" [selected]="cantidadDe(f.condicion) === n">{{ n }} o más</option>
                          }
                        </select>
                      }
                      @case ('riesgo') {
                        <select class="campo" aria-label="Cuántas" (change)="fijar(f, { count: 'risky', gte: +$any($event.target).value })">
                          @for (n of [1, 2, 3, 4, 5]; track n) {
                            <option [value]="n" [selected]="cantidadDe(f.condicion) === n">{{ n }} o más</option>
                          }
                        </select>
                      }
                      @case ('otra') {
                        <p class="texto-secundario">El estudiante {{ describir(f.condicion) }}. Esta condición se conserva como está.</p>
                      }
                    }
                  </fieldset>
                </li>
              }
            </ol>
            <button type="button" class="boton" id="agregar-final" (click)="agregarFinal()">Agregar un final</button>
          </section>
        } @else {
          <section aria-labelledby="fa" class="bloque">
            <h2 id="fa">Los cuatro finales que se calculan solos</h2>
            <ul class="lista">
              @for (f of automaticos; track f.nombre; let i = $index) {
                <li class="tarjeta">
                  <strong>{{ f.nombre }}</strong>
                  <p class="texto-secundario regla">{{ reglas[i] }}</p>
                  <p>{{ f.texto }}</p>
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
    .condicion { border: 0; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .condicion legend { font-weight: 700; font-size: var(--autoria-texto-16); margin-bottom: 4px; }
    .lista li p { margin: 4px 0 0; }
    .regla { font-size: var(--autoria-texto-16); }
  `,
})
export class FinalesComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  protected readonly anuncio = signal('');
  protected readonly automaticos = ORDEN_AUTOMATICOS.map((id) => FINALES_AUTOMATICOS[id]);
  protected readonly reglas = [
    'Cuando elige 2 o más respuestas contraindicadas, o una contraindicada sin haber cumplido todos los hitos decisivos.',
    'Cuando cumple todos los hitos decisivos, no elige respuestas contraindicadas y elige a lo más una con riesgo.',
    'Cuando le falta algún hito decisivo, o elige 3 o más respuestas con riesgo.',
    'En cualquier otro caso.',
  ];

  protected readonly estadoCaminos = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    return estadoDeCaminos(caso);
  });

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

  protected tipoDe(c: CondicionFinal | null): TipoCondicion {
    if (c === null) return 'ninguna';
    if ('milestone' in c) return 'hito';
    if ('count' in c && Object.keys(c).length === 2 && c.gte !== undefined) {
      if (c.count === 'contraindicated') return 'contraindicadas';
      if (c.count === 'risky') return 'riesgo';
    }
    return 'otra';
  }

  protected hitoDe(c: CondicionFinal | null): string {
    return c && 'milestone' in c ? c.milestone : '';
  }

  protected existeHito(c: CondicionFinal | null): boolean {
    return !!this.store.caso()?.hitos.some((h) => h.clave === this.hitoDe(c));
  }

  protected cantidadDe(c: CondicionFinal | null): number {
    return c && 'count' in c ? (c.gte ?? 1) : 1;
  }

  protected describir(c: CondicionFinal | null): string {
    return describirCondicion(c, this.store.caso()?.hitos ?? []);
  }

  protected cambiarTipo(f: Final, tipo: TipoCondicion): void {
    const caso = this.store.caso()!;
    if (tipo === 'otra') return;
    const condicion: CondicionFinal | null =
      tipo === 'hito' ? { milestone: (caso.hitos.find((h) => h.decisivo) ?? caso.hitos[0]).clave }
      : tipo === 'contraindicadas' ? { count: 'contraindicated', gte: 1 }
      : tipo === 'riesgo' ? { count: 'risky', gte: 1 }
      : null;
    this.fijar(f, condicion);
  }

  protected fijar(f: Final, condicion: CondicionFinal | null): void {
    this.store.editarFinal(f.id, { condicion });
  }
}
