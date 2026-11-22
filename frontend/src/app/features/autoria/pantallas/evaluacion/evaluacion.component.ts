import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';

import { UiProgress } from '../../../../shared/ui/progress/ui-progress';
import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { injectLlevar } from '../../marco/llevar';
import { ProgresoDelCaso } from '../../marco/progreso.service';
import type { CasoBorrador, Hito } from '../../modelo/caso';
import { conHito } from '../../modelo/efectos';
import { dondeSeCumple, hitosInalcanzables } from '../../modelo/hitos';
import { escenasEnOrden } from '../../modelo/progreso';
import { RutasAutoria } from '../../rutas';
import {
  type CambioDePaso, FilaDePasoComponent, type PasoVista, type RespuestaDelPaso, separarMarca,
} from './fila-de-paso.component';
import { PestanasEvaluacionComponent } from './pestanas-evaluacion.component';
import type { CambioDeRespuesta, EscenaElegible } from './selector-de-respuestas.component';

/** La clave de un paso nuevo: letras, números y «_» a partir del nombre, sin repetir una que ya exista. */
export function claveDePaso(nombre: string, existentes: readonly string[]): string {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 48) || 'paso';
  let clave = base;
  for (let n = 2; existentes.includes(clave); n++) clave = `${base}_${n}`;
  return clave;
}

/** Los finales propios cuya condición nombra el paso (el servidor no deja quitar un hito que un final nombra). */
function finalesQueNombran(caso: CasoBorrador, clave: string): string[] {
  if (caso.modoFinales !== 'propio') return [];
  const marca = JSON.stringify({ milestone: clave }).slice(1, -1);
  return caso.finales.filter((f) => JSON.stringify(f.condicion ?? null).includes(marca)).map((f) => f.nombre);
}

/**
 * «Pasos profesionales» (EDITOR.md §3.5), la primera pestaña de Evaluación: sustituye a «Hitos del caso», que vivía bajo
 * el mapa. Responde a la pregunta de la docente («¿dónde se demuestra este paso?») con una lista inversa: cada paso con las
 * respuestas que lo cumplen. Marcar desde aquí es la MISMA operación que la casilla de la ficha de la respuesta
 * (`store.editarRespuesta` con `conHito`), así que el caso queda igual por cualquiera de los dos caminos.
 *
 * Los pasos sin respuesta van primero, en el orden en que se ven al entrar: la lista no se reordena mientras la docente
 * marca (una fila que salta bajo el puntero hace perder el sitio). En dos columnas desde 80rem, ocho a once pasos caben en
 * menos de dos pantallas.
 *
 * Patrón: contenedor (Facade del store) con piezas de presentación (`app-fila-de-paso`, `app-selector-de-respuestas`);
 * qué está abierto se lleva como un estado único (State): un selector, una edición o una confirmación a la vez.
 */
@Component({
  selector: 'app-evaluacion',
  imports: [UiProgress, AutoAltoDirective, PestanasEvaluacionComponent, FilaDePasoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina evaluacion">
        <div class="cabecera">
          <div class="cabecera__texto">
            <h1>Pasos profesionales</h1>
            <p class="texto-secundario">Lo que el estudiante tiene que hacer en el caso. Marca qué respuestas cumplen cada paso: es lo mismo que marcarlo en la ficha de la respuesta.</p>
          </div>
          <app-pestanas-evaluacion actual="pasos" />
        </div>

        <div class="cobertura" data-accion="hitos-del-caso">
          @if (pasos().length) {
            <p class="cobertura__texto"><strong>{{ cubiertos() }} de {{ pasos().length }} pasos</strong> tienen al menos una respuesta que los cumple.</p>
            <ui-progress class="cobertura__barra" label="Pasos con alguna respuesta" [value]="cubiertos()" [max]="pasos().length" />
          } @else {
            <p class="cobertura__texto">Este caso todavía no tiene pasos profesionales.</p>
          }
          @if (!store.soloLectura() && !agregando()) {
            <button type="button" class="boton cobertura__agregar" id="agregar-paso" (click)="abrirAgregar()">Agregar un paso</button>
          }
        </div>

        @if (agregando()) {
          <form class="nuevo" (submit)="$event.preventDefault(); agregarPaso()" aria-labelledby="nuevo-titulo">
            <p class="nuevo__titulo" id="nuevo-titulo">Paso nuevo</p>
            <label class="etiqueta" for="nuevo-nombre">Nombre del paso</label>
            <input id="nuevo-nombre" class="campo" type="text" autocomplete="off" [value]="nombreNuevo()" (input)="nombreNuevo.set($any($event.target).value)" />
            <label class="etiqueta" for="nuevo-descripcion">Qué se espera que haga el estudiante</label>
            <textarea autoAlto id="nuevo-descripcion" class="campo" rows="2" [value]="descripcionNueva()" (input)="descripcionNueva.set($any($event.target).value)"></textarea>
            @if (errorNuevo()) { <p class="error" role="alert">{{ errorNuevo() }}</p> }
            <div class="nuevo__acciones">
              <button type="submit" class="boton boton-primario">Agregar el paso</button>
              <button type="button" class="boton" (click)="cerrarAgregar()">Cancelar</button>
            </div>
          </form>
        }

        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        <div class="lista">
          @for (p of pasos(); track p.hito.clave) {
            <app-fila-de-paso [class.abierta]="abierto() === p.hito.clave || editando() === p.hito.clave || borrando() === p.hito.clave" [paso]="p" [escenas]="escenas()" [soloLectura]="store.soloLectura()"
                              [abierto]="abierto() === p.hito.clave" [editando]="editando() === p.hito.clave"
                              [borrando]="borrando() === p.hito.clave" [finalesQueLoNombran]="borrando() === p.hito.clave ? nombranA(caso, p.hito.clave) : []"
                              (cambiar)="cambiar(p.hito, $event)" (marcar)="marcar(p.hito, $event)" (quitar)="quitar(p.hito, $event)"
                              (irA)="irA($event)" (alternar)="alternar(p.hito.clave)" (pedirEdicion)="editar(p.hito.clave)"
                              (pedirBorrado)="pedirBorrado(p.hito.clave)" (borrar)="borrar(p)" (terminar)="terminar(p.hito.clave)" />
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .evaluacion { display: flex; flex-direction: column; gap: 1rem; }
    .cabecera { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 0.75rem 1.5rem; }
    .cabecera__texto { flex: 1 1 28rem; min-inline-size: 0; }
    .cabecera h1 { margin: 0; font-size: var(--autoria-texto-32); line-height: 2.5rem; }
    .cabecera p { margin: 0.25rem 0 0; max-inline-size: var(--l-ancho-lectura); font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    /* La cobertura en una franja: la frase, la barra y «Agregar un paso» en un renglón cuando cabe. */
    .cobertura {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding: 0.75rem 1rem;
      border-radius: var(--l-radio-tarjeta); background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo);
    }
    .cobertura__texto { flex: 1 1 18rem; margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .cobertura__barra { flex: 1 1 12rem; max-inline-size: 20rem; }
    .cobertura__agregar { flex: none; }
    .nuevo {
      display: flex; flex-direction: column; gap: 0.375rem; max-inline-size: 40rem; padding: 0.875rem 1rem;
      border-radius: var(--l-radio-tarjeta); background: var(--l-superficie); box-shadow: inset 0 0 0 2px var(--ds-primary);
    }
    .nuevo__titulo { margin: 0; font-weight: 800; font-size: var(--autoria-texto-18); }
    .nuevo__acciones { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block-start: 0.25rem; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-14); }
    .campo { inline-size: 100%; box-sizing: border-box; font: inherit; font-size: var(--autoria-texto-16); line-height: 1.5; }
    textarea.campo { resize: none; }
    .error { margin: 0; color: var(--peligro); font-weight: 700; }
    /* Una columna hasta 80rem; desde ahí dos (cada fila sigue siendo legible a ~36rem). */
    /* Las dos filas de un renglón miden lo mismo (stretch): sin huecos escalonados entre tarjetas. */
    .lista { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.625rem; align-items: stretch; }
    /* Con un paso abierto (selector, edición o confirmación) su vecino no se estira a su alto. */
    .lista:has(> .abierta) { align-items: start; }
    @media (min-width: 80rem) { .lista { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 40rem) { .cabecera h1 { font-size: var(--autoria-texto-24); line-height: 2rem; } }
    @media (forced-colors: active) { .cobertura, .nuevo { border: 1px solid CanvasText; } }
  `,
})
export class EvaluacionComponent {
  protected readonly store = inject(CasoStore);
  private readonly progreso = inject(ProgresoDelCaso);
  private readonly rutas = inject(RutasAutoria);
  private readonly injector = inject(Injector);
  private readonly llevar = injectLlevar();

  /** Solo una cosa abierta a la vez: el selector, la edición o la confirmación de un paso. */
  protected readonly abierto = signal<string | null>(null);
  protected readonly editando = signal<string | null>(null);
  protected readonly borrando = signal<string | null>(null);
  protected readonly agregando = signal(false);
  protected readonly nombreNuevo = signal('');
  protected readonly descripcionNueva = signal('');
  protected readonly errorNuevo = signal('');
  protected readonly anuncio = signal('');

  /** El orden con que se vio cada paso al entrar (o al releer el caso): 0 = sin respuestas, 1 = con alguna. */
  private orden = new Map<string, number>();
  private lecturaVista = -1;

  private readonly enOrden = computed(() => {
    const caso = this.store.caso();
    return caso ? escenasEnOrden(caso) : [];
  });

  /** Las escenas del caso en el orden de la historia, con el número del riel, para el selector y las fichas. */
  protected readonly escenas = computed<EscenaElegible[]>(() => this.enOrden().map((e, i) => ({
    escenaId: e.id,
    titulo: `${i + 1} · ${e.titulo}`,
    respuestas: e.respuestas.map((r) => ({ id: r.id, escenaId: e.id, texto: r.texto, clase: r.clase })),
  })));

  protected readonly pasos = computed<PasoVista[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const lectura = this.store.lectura();
    if (lectura !== this.lecturaVista) {
      this.lecturaVista = lectura;
      this.orden = new Map();
    }
    const titulos = new Map(this.escenas().map((e) => [e.escenaId, e.titulo]));
    const inalcanzables = new Set(hitosInalcanzables(caso).map((h) => h.clave));
    const corregir = new Set(this.progreso.pendientes()
      .filter((p) => p.tipo === 'por-corregir' && p.codigo === 'milestone-unreachable').map((p) => p.ir.ancla));
    const vistas = caso.hitos.map((hito, i) => {
      const respuestas: RespuestaDelPaso[] = dondeSeCumple(caso, hito.clave).map((d) => ({
        escenaId: d.escenaId, respuestaId: d.respuestaId, escena: titulos.get(d.escenaId) ?? d.escenaTitulo, texto: d.respuestaTexto.trim(),
        href: this.rutas.a('/editor/escena', d.escenaId),
      }));
      // Un paso nuevo (o el primero que se ve) fija aquí su sitio; después no se mueve mientras se marca.
      if (!this.orden.has(hito.clave)) this.orden.set(hito.clave, respuestas.length ? 1 : 0);
      const { descripcion, porValidar } = separarMarca(hito.descripcion ?? '');
      return {
        vista: { hito, descripcion, porValidar, respuestas, porCorregir: inalcanzables.has(hito.clave) && corregir.has(`hito-${hito.clave}`) },
        rango: this.orden.get(hito.clave)!, i,
      };
    });
    return vistas.sort((a, b) => a.rango - b.rango || a.i - b.i).map((v) => v.vista);
  });

  protected readonly cubiertos = computed(() => this.pasos().filter((p) => p.respuestas.length > 0).length);

  protected readonly nombranA = finalesQueNombran;

  /** Marca o desmarca el paso en una respuesta: la misma operación que la casilla «Pasos» de la ficha. */
  protected marcar(hito: Hito, cambio: CambioDeRespuesta): void {
    const respuesta = this.store.caso()?.escenas.find((e) => e.id === cambio.escenaId)?.respuestas.find((r) => r.id === cambio.respuestaId);
    if (!respuesta) return;
    this.store.editarRespuesta(cambio.escenaId, cambio.respuestaId, { efectos: conHito(respuesta.efectos, hito.clave, cambio.cumple) });
    const texto = respuesta.texto.trim() || 'la respuesta sin escribir';
    this.anuncio.set(cambio.cumple ? `«${texto}» cumple ahora «${hito.nombre}».` : `«${texto}» ya no cumple «${hito.nombre}».`);
  }

  /** La ficha desaparece al quitarla: el foco va a «Agregar una respuesta» del mismo paso. */
  protected quitar(hito: Hito, r: RespuestaDelPaso): void {
    this.marcar(hito, { escenaId: r.escenaId, respuestaId: r.respuestaId, cumple: false });
    this.enfocar(`agregar-${hito.clave}`);
  }

  protected irA(r: RespuestaDelPaso): void {
    void this.llevar({ ruta: `/editor/escena/${r.escenaId}`, ancla: `respuesta-${r.respuestaId}` });
  }

  protected cambiar(hito: Hito, cambio: CambioDePaso): void {
    this.store.editarHito(hito.clave, cambio);
    if (cambio.decisivo !== undefined) {
      this.anuncio.set(cambio.decisivo ? `«${hito.nombre}» decide ahora el final.` : `«${hito.nombre}» ya no decide el final.`);
    }
  }

  protected alternar(clave: string): void {
    const cerrar = this.abierto() === clave;
    this.cerrarTodo();
    if (cerrar) this.enfocar(`agregar-${clave}`);
    else this.abierto.set(clave);
  }

  protected editar(clave: string): void {
    this.cerrarTodo();
    this.editando.set(clave);
    this.enfocar(`pn-${clave}`);
  }

  protected pedirBorrado(clave: string): void {
    this.cerrarTodo();
    this.borrando.set(clave);
    this.enfocar(`pb-${clave}`);
  }

  /** «Listo» o «Conservar el paso»: se cierra y el foco vuelve a la fila. */
  protected terminar(clave: string): void {
    this.cerrarTodo();
    this.enfocar(`hito-${clave}`);
  }

  /**
   * Borra el paso. Antes se le quita la marca a cada respuesta que lo cumplía (si no, quedarían marcando un paso que ya no
   * existe); todo viaja por la cola en orden, así que el servidor recibe las respuestas antes que la lista de pasos.
   */
  protected borrar(p: PasoVista): void {
    for (const r of p.respuestas) this.marcar(p.hito, { escenaId: r.escenaId, respuestaId: r.respuestaId, cumple: false });
    this.store.borrarHito(p.hito.clave);
    this.cerrarTodo();
    this.anuncio.set(`Se borró el paso «${p.hito.nombre}».`);
    this.enfocar('agregar-paso');
  }

  protected abrirAgregar(): void {
    this.cerrarTodo();
    this.nombreNuevo.set('');
    this.descripcionNueva.set('');
    this.errorNuevo.set('');
    this.agregando.set(true);
    this.enfocar('nuevo-nombre');
  }

  protected cerrarAgregar(): void {
    this.agregando.set(false);
    this.enfocar('agregar-paso');
  }

  protected agregarPaso(): void {
    const caso = this.store.caso();
    const nombre = this.nombreNuevo().trim();
    if (!caso) return;
    if (!nombre) {
      this.errorNuevo.set('Escribe el nombre del paso.');
      this.enfocar('nuevo-nombre');
      return;
    }
    const clave = claveDePaso(nombre, caso.hitos.map((h) => h.clave));
    this.store.agregarHito({ clave, nombre, descripcion: this.descripcionNueva().trim(), decisivo: false });
    this.agregando.set(false);
    this.anuncio.set(`Se agregó el paso «${nombre}». Marca qué respuestas lo cumplen.`);
    this.enfocar(`agregar-${clave}`);
  }

  private cerrarTodo(): void {
    this.abierto.set(null);
    this.editando.set(null);
    this.borrando.set(null);
    this.agregando.set(false);
  }

  /** Lo que se abre o se cierra cambia el DOM: el foco se mueve cuando ya está dibujado. */
  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
