import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { estadoDeCaminos } from '../../modelo/caminos';
import type { CondicionFinal, Final } from '../../modelo/caso';
import { FINALES_AUTOMATICOS } from '../../modelo/finales';

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
              Lo que el estudiante lee al terminar. Si no haces nada, los finales se calculan solos con las respuestas que clasificaste.
            </p>
          </div>
          <div class="acciones">
            <button type="button" class="boton" [attr.aria-disabled]="!store.puedeDeshacer()" (click)="store.deshacer()">Deshacer</button>
            <a routerLink="/editor" class="boton boton-secundario">Volver al mapa</a>
          </div>
        </div>

        <fieldset class="tarjeta modo" data-accion="definir-finales">
          <legend>Cómo se deciden los finales</legend>
          <label class="opcion">
            <input type="radio" name="modo" value="automatico" [checked]="caso.modoFinales === 'automatico'" (change)="store.fijarModoFinales('automatico')" />
            <span><strong>Los finales se calculan solos</strong><br />
              <span class="texto-secundario">Según cuántas respuestas adecuadas, con riesgo o inadecuadas eligió el estudiante. No tienes que escribir nada.</span></span>
          </label>
          <label class="opcion">
            <input type="radio" name="modo" value="propio" [checked]="caso.modoFinales === 'propio'" (change)="store.fijarModoFinales('propio')" />
            <span><strong>Quiero definir mis finales</strong><br />
              <span class="texto-secundario">Tú decides cuántos hay, qué los provoca y qué dice cada uno.</span></span>
          </label>
        </fieldset>

        <p role="status" class="texto-secundario">{{ estadoCaminos() }}</p>

        @if (caso.modoFinales === 'propio') {
          <section aria-labelledby="fh" class="bloque">
            <h2 id="fh">Tus finales ({{ caso.finales.length }})</h2>
            <p class="texto-secundario">Si el estudiante cumple las condiciones de varios finales, verá el que está más arriba. Si no cumple ninguna, verá el final que se calcula solo.</p>
            <ol class="lista">
              @for (f of caso.finales; track f.id; let i = $index; let primero = $first; let ultimo = $last) {
                <li class="tarjeta final" [class.marca-ia]="f.marcaIa">
                  <div class="fila-titulo">
                    <strong>Final {{ i + 1 }}</strong>
                    @if (f.marcaIa) {
                      <span class="pildora">Sugerido por la IA</span>
                      <button type="button" class="boton" (click)="store.aceptarIa({ finalId: f.id })">Aceptar final</button>
                      <button type="button" class="boton boton-texto" (click)="store.borrarFinal(f.id)">Descartar final</button>
                    }
                    <span class="acciones derecha">
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Subir el final ' + f.nombre" [attr.aria-disabled]="primero" (click)="!primero && store.moverFinal(f.id, -1)">↑</button>
                      <button type="button" class="boton cuadrado" [attr.aria-label]="'Bajar el final ' + f.nombre" [attr.aria-disabled]="ultimo" (click)="!ultimo && store.moverFinal(f.id, 1)">↓</button>
                      <button type="button" class="boton cuadrado peligro" [attr.aria-label]="'Borrar el final ' + f.nombre" (click)="store.borrarFinal(f.id)">✕</button>
                    </span>
                  </div>
                  <label [for]="'fn' + i" class="etiqueta">Nombre</label>
                  <input [id]="'fn' + i" type="text" class="campo" [value]="f.nombre" (change)="store.editarFinal(f.id, { nombre: $any($event.target).value })" />
                  <label [for]="'ft' + i" class="etiqueta">Lo que lee el estudiante al terminar</label>
                  <textarea [id]="'ft' + i" class="campo" rows="3" [value]="f.texto" (change)="store.editarFinal(f.id, { texto: $any($event.target).value })"></textarea>
                  <fieldset class="condicion">
                    <legend>El final «{{ f.nombre }}» llega cuando…</legend>
                    <select class="campo" aria-label="Tipo de condición" (change)="cambiarTipo(f, $any($event.target).value)">
                      <option value="llega-a-escena" [selected]="f.condicion.tipo === 'llega-a-escena'">Llega a una escena</option>
                      <option value="inadecuadas-al-menos" [selected]="f.condicion.tipo === 'inadecuadas-al-menos'">Elige respuestas inadecuadas</option>
                    </select>
                    @if (f.condicion.tipo === 'llega-a-escena') {
                      <select class="campo" aria-label="Escena" (change)="fijar(f, { tipo: 'llega-a-escena', escenaId: $any($event.target).value })">
                        @if (!existe(f.condicion.escenaId)) {
                          <option value="" selected disabled>Elige una escena (la anterior ya no está)</option>
                        }
                        @for (e of caso.escenas; track e.id; let j = $index) {
                          <option [value]="e.id" [selected]="f.condicion.escenaId === e.id">{{ j + 1 }} · {{ e.titulo }}{{ e.esFinal ? ' (final)' : '' }}</option>
                        }
                      </select>
                    } @else {
                      <select class="campo" aria-label="Cuántas" (change)="fijar(f, { tipo: 'inadecuadas-al-menos', cantidad: +$any($event.target).value })">
                        @for (n of [1, 2, 3, 4, 5]; track n) {
                          <option [value]="n" [selected]="f.condicion.cantidad === n">{{ n }} o más</option>
                        }
                      </select>
                    }
                  </fieldset>
                </li>
              }
            </ol>
            <button type="button" class="boton" (click)="store.agregarFinal()">Agregar un final</button>
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
    .etiqueta { font-weight: 700; font-size: 16px; }
    .campo { min-height: 48px; padding: 8px 12px; font: inherit; font-size: 16px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); width: 100%; }
    select.campo { padding: 0 12px; width: auto; }
    .condicion { border: 0; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .condicion legend { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
    .lista li p { margin: 4px 0 0; }
    .regla { font-size: 16px; }
  `,
})
export class FinalesComponent {
  protected readonly store = inject(CasoStore);
  protected readonly automaticos = Object.values(FINALES_AUTOMATICOS);
  protected readonly reglas = [
    'Cuando al menos 8 de cada 10 respuestas elegidas son adecuadas y ninguna es inadecuada.',
    'Cuando no llega a ese nivel, sin respuestas inadecuadas.',
    'Cuando elige 1 respuesta inadecuada.',
    'Cuando elige 2 o más respuestas inadecuadas.',
  ];

  protected readonly estadoCaminos = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    return estadoDeCaminos(caso);
  });

  protected existe(escenaId: string): boolean {
    return !!this.store.caso()?.escenas.some((e) => e.id === escenaId);
  }

  protected cambiarTipo(f: Final, tipo: CondicionFinal['tipo']): void {
    const caso = this.store.caso()!;
    const ultima = caso.escenas.filter((e) => e.esFinal).at(-1) ?? caso.escenas.at(-1);
    this.fijar(f, tipo === 'llega-a-escena'
      ? { tipo, escenaId: ultima?.id ?? '' }
      : { tipo, cantidad: 1 });
  }

  protected fijar(f: Final, condicion: CondicionFinal): void {
    this.store.editarFinal(f.id, { condicion });
  }
}
