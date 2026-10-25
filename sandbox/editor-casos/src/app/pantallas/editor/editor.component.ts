import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { revisarCaminos, type Aviso } from '../../modelo/caminos';
import type { Escena } from '../../modelo/caso';
import { type AccionEscena, MapaEscenasComponent } from './mapa-escenas.component';

/** «Escenas y caminos» (tablero 25): el mapa del caso, la escena elegida y los avisos. */
@Component({
  selector: 'app-editor',
  imports: [RouterLink, MapaEscenasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina ancha">
        <div class="cabeza">
          <div>
            <h1>Escenas y caminos</h1>
            <p class="texto-secundario">{{ resumen() }} Las flechas son las respuestas; las de la escena elegida van en verde azulado.</p>
          </div>
          <div class="acciones">
            <button type="button" class="boton" data-accion="deshacer" [attr.aria-disabled]="!store.puedeDeshacer()" (click)="store.deshacer()">Deshacer</button>
            <button type="button" class="boton" data-accion="agregar-escena" (click)="agregarEscena()">Agregar una escena</button>
            <button type="button" class="boton" data-accion="ordenar-mapa" (click)="store.ordenarAutomaticamente()">Ordenar automáticamente</button>
          </div>
        </div>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>

        <div class="dos-columnas">
          <app-mapa-escenas #mapa [caso]="caso" [avisos]="avisos()" [elegidaInicial]="irA()"
                            (seleccion)="elegida.set($event)" (abrirGuion)="abrirGuion($event)" (abrirSala)="abrirSala($event)"
                            (accion)="accion($event)" />

          <aside aria-label="Escena elegida y avisos" class="lateral">
            <section aria-labelledby="pe" class="tarjeta">
              <p class="texto-secundario">Escena elegida</p>
              @if (escenaElegida(); as e) {
                <h2 id="pe">{{ numero(e) }} · {{ e.titulo }}</h2>
                @if (e.marcaIa) {
                  <p class="marca-ia"><span class="pildora">Sugerido por la IA</span> La creó el asistente; revísala y acéptala.</p>
                  <button type="button" class="boton" data-accion="aceptar-ia" (click)="store.aceptarIa({ escenaId: e.id })">Aceptar escena</button>
                }
                <p class="texto-secundario">{{ nombreSala(e.salaId) }} · {{ e.lineas.length }} líneas · {{ e.respuestas.length }} respuestas</p>
                <dl>
                  <dt>Llegan desde</dt>
                  <dd>{{ lleganDesde(e) || 'Ninguna escena' }}</dd>
                  <dt>Lleva a</dt>
                  <dd>{{ llevaA(e) || (e.esFinal ? 'Es un final' : 'Ninguna escena') }}</dd>
                </dl>
                <div class="acciones">
                  <a class="boton boton-primario" [routerLink]="['/editor/escena', e.id]" data-accion="abrir-guion">Abrir guion</a>
                  <a class="boton" [routerLink]="['/editor/sala', e.salaId]" data-accion="abrir-sala">Abrir sala</a>
                </div>
              } @else {
                <h2 id="pe">Ninguna</h2>
                <p>Elige una escena en el mapa para ver a dónde lleva y abrir su guion o su sala.</p>
              }
            </section>

            <section aria-labelledby="av" class="tarjeta avisos" data-accion="revisar-caminos">
              <h2 id="av">Avisos ({{ avisos().length }})</h2>
              @if (avisos().length) {
                <ul>
                  @for (a of avisos(); track $index) {
                    <li>
                      <span class="pildora aviso">Por resolver</span>
                      <p>{{ a.mensaje }}</p>
                      @if (a.escenaId) {
                        <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + tituloDe(a.escenaId)" (click)="llevarA(a)">Llévame ahí</button>
                      } @else if (a.tipo === 'final-sin-escena') {
                        <a class="boton" routerLink="/editor/finales">Ir a los finales</a>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p>Sin avisos: todos los caminos llegan a un final.</p>
              }
            </section>
          </aside>
        </div>

        @if (conectando(); as origen) {
          <div class="tarjeta dialogo" role="dialog" aria-labelledby="cct" aria-modal="false">
            <h2 id="cct">Conectar «{{ tituloDe(origen) }}» con…</h2>
            <p>Se agrega una respuesta en «{{ tituloDe(origen) }}» que lleva a la escena que elijas. Después puedes escribirla en el guion.</p>
            <ul role="listbox" aria-label="Escena a la que lleva" class="opciones">
              @for (e of caso.escenas; track e.id) {
                @if (e.id !== origen) {
                  <li role="option" tabindex="0" [attr.aria-selected]="destino() === e.id"
                      (click)="destino.set(e.id)" (keydown.enter)="destino.set(e.id)">{{ numero(e) }} · {{ e.titulo }}</li>
                }
              }
              <li role="option" tabindex="0" [attr.aria-selected]="destino() === 'nueva'"
                  (click)="destino.set('nueva')" (keydown.enter)="destino.set('nueva')">Una escena nueva</li>
            </ul>
            <div class="acciones">
              <button type="button" class="boton boton-primario" [attr.aria-disabled]="!destino()" (click)="conectar()">Conectar</button>
              <button type="button" class="boton" (click)="conectando.set(null)">No conectar</button>
            </div>
          </div>
        }

        @if (borrando(); as id) {
          <div class="tarjeta dialogo peligro" role="alertdialog" aria-labelledby="bt" aria-describedby="bd">
            <h2 id="bt">¿Borrar la escena «{{ tituloDe(id) }}»?</h2>
            <p id="bd">{{ textoBorrar(id) }} Puedes deshacerlo.</p>
            <div class="acciones">
              <button type="button" class="boton boton-peligro" (click)="borrar(id)">Borrar la escena</button>
              <button type="button" class="boton" (click)="borrando.set(null)">Conservar la escena</button>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="pagina">
        <h1>Todavía no hay un caso</h1>
        <p>Crea uno eligiendo un lugar.</p>
        <a routerLink="/lugar" class="boton boton-primario">Crear un caso nuevo</a>
      </div>
    }
  `,
  styles: `
    .ancha { max-width: 1400px; }
    .cabeza { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
    .cabeza p { margin: 4px 0 0; }
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 16px; align-items: start; }
    @media (max-width: 1000px) { .dos-columnas { grid-template-columns: 1fr; } }
    .lateral { display: flex; flex-direction: column; gap: 16px; }
    .lateral h2 { margin: 0; font-size: 20px; line-height: 28px; }
    .lateral p { margin: 0; }
    .lateral .tarjeta { display: flex; flex-direction: column; gap: 8px; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 16px; line-height: 24px; }
    dt { font-weight: 700; }
    dd { margin: 0; }
    .avisos ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .avisos li { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .avisos li p { font-size: 16px; line-height: 24px; }
    .aviso { border-color: var(--aviso); color: #7a3606; background: #fdf0e6; }
    .dialogo { display: flex; flex-direction: column; gap: 12px; max-width: 640px; border: 2px solid var(--primario); }
    .dialogo.peligro { border-color: var(--peligro); }
    .dialogo h2, .dialogo p { margin: 0; }
    .opciones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow: auto; }
    .opciones li { min-height: 44px; display: flex; align-items: center; padding: 0 10px; border-radius: 8px; cursor: pointer; }
    .opciones li:hover { background: var(--fondo); }
    .opciones li[aria-selected='true'] { background: var(--primario-tinte); outline: 2px solid var(--primario); }
  `,
})
export class EditorComponent {
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly mapa = viewChild<MapaEscenasComponent>('mapa');

  /** La escena de inicio queda elegida al entrar, para que «Abrir guion» y «Abrir sala» estén a mano. */
  protected readonly elegida = signal<string | null>(this.store.caso()?.inicioId ?? null);
  protected readonly irA = signal<string | null>(this.store.caso()?.inicioId ?? null);
  protected readonly conectando = signal<string | null>(null);
  protected readonly destino = signal<string | 'nueva' | null>(null);
  protected readonly borrando = signal<string | null>(null);
  protected readonly anuncio = signal('');

  protected readonly avisos = computed<Aviso[]>(() => {
    const caso = this.store.caso();
    return caso ? revisarCaminos(caso) : [];
  });

  protected readonly escenaElegida = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.elegida()) ?? null);

  protected readonly resumen = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    const n = caso.escenas.length;
    const finales = caso.escenas.filter((e) => e.esFinal).length;
    return `${n} ${n === 1 ? 'escena' : 'escenas'} · ${caso.inicioId ? '1 inicio' : 'sin inicio'} · ${finales} ${finales === 1 ? 'escena final' : 'escenas finales'}.`;
  });

  protected numero(e: Escena): number {
    return (this.store.caso()?.escenas.indexOf(e) ?? 0) + 1;
  }

  protected tituloDe(id: string): string {
    const e = this.store.caso()?.escenas.find((x) => x.id === id);
    return e ? `${this.numero(e)} · ${e.titulo}` : '';
  }

  protected nombreSala(id: string): string {
    return this.store.caso()?.salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected lleganDesde(e: Escena): string {
    return (this.store.caso()?.escenas ?? [])
      .filter((x) => x.id !== e.id && x.respuestas.some((r) => r.destinoId === e.id))
      .map((x) => this.tituloDe(x.id))
      .join(' · ');
  }

  protected llevaA(e: Escena): string {
    const cuenta = new Map<string, number>();
    for (const r of e.respuestas) if (r.destinoId) cuenta.set(r.destinoId, (cuenta.get(r.destinoId) ?? 0) + 1);
    return [...cuenta].map(([id, n]) => `${this.tituloDe(id)} (${n} ${n === 1 ? 'respuesta' : 'respuestas'})`).join(' · ');
  }

  protected textoBorrar(id: string): string {
    const caso = this.store.caso();
    const n = (caso?.escenas ?? []).flatMap((e) => e.respuestas).filter((r) => r.destinoId === id).length;
    const respuestas = n
      ? `${n === 1 ? 'La respuesta que llevaba' : `Las ${n} respuestas que llevaban`} a ella ya no ${n === 1 ? 'llevará' : 'llevarán'} a ninguna escena y ${n === 1 ? 'aparecerá' : 'aparecerán'} en los avisos.`
      : 'Ninguna respuesta lleva a ella.';
    const finales = caso?.modoFinales === 'propio'
      ? caso.finales.filter((f) => f.condicion.tipo === 'llega-a-escena' && f.condicion.escenaId === id).map((f) => `«${f.nombre}»`)
      : [];
    if (!finales.length) return respuestas;
    return `${respuestas} ${finales.length === 1 ? `El final ${finales[0]} se queda` : `Los finales ${finales.join(', ')} se quedan`} sin escena y ${finales.length === 1 ? 'aparecerá' : 'aparecerán'} en los avisos.`;
  }

  protected abrirGuion(id: string): void {
    void this.router.navigate(['/editor/escena', id]);
  }

  protected abrirSala(salaId: string): void {
    void this.router.navigate(['/editor/sala', salaId]);
  }

  protected agregarEscena(): void {
    const caso = this.store.caso();
    if (!caso) return;
    const despues = this.escenaElegida() ?? caso.escenas.at(-1);
    const salaId = despues?.salaId ?? caso.salas[0].id;
    const id = this.store.agregarEscena(salaId, despues?.id);
    this.mapa()?.elegirYEnfocar(id);
    this.anuncio.set('Se agregó una escena nueva. Abre su guion para escribirla.');
  }

  protected llevarA(a: Aviso): void {
    if (!a.escenaId) return;
    this.irA.set(null);
    queueMicrotask(() => this.irA.set(a.escenaId));
  }

  protected accion(a: AccionEscena): void {
    switch (a.tipo) {
      case 'duplicar': {
        const id = this.store.duplicarEscena(a.escenaId);
        this.mapa()?.elegirYEnfocar(id);
        this.anuncio.set('Escena duplicada.');
        break;
      }
      case 'conectar':
        this.destino.set(null);
        this.conectando.set(a.escenaId);
        break;
      case 'final':
        this.store.marcarFinal(a.escenaId, a.esFinal);
        this.anuncio.set(a.esFinal ? 'La escena quedó marcada como final.' : 'La escena ya no es un final.');
        break;
      case 'borrar':
        this.borrando.set(a.escenaId);
        break;
      case 'mover':
        this.store.moverEscena(a.escenaId, a.x, a.y);
        break;
    }
  }

  protected conectar(): void {
    const origen = this.conectando();
    const destino = this.destino();
    if (!origen || !destino) return;
    const id = this.store.conectarEscena(origen, destino);
    this.conectando.set(null);
    this.anuncio.set(`Conectada con «${this.tituloDe(id)}». Escribe la respuesta en el guion.`);
    this.mapa()?.elegirYEnfocar(origen);
  }

  protected borrar(id: string): void {
    this.store.borrarEscena(id);
    this.borrando.set(null);
    this.elegida.set(null);
    this.anuncio.set('Escena borrada. Puedes deshacerlo.');
  }
}
