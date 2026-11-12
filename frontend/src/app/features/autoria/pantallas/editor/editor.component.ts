import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { revisarCaminos, type Aviso } from '../../modelo/caminos';
import type { Escena, Hito } from '../../modelo/caso';
import { dondeSeCumple, hitosInalcanzables } from '../../modelo/hitos';
import { plural } from '../../modelo/textos';
import { type AccionEscena, MapaEscenasComponent } from './mapa-escenas.component';
import { RutasAutoria } from '../../rutas';

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
            <button type="button" class="boton" data-accion="agregar-escena" (click)="agregarEscena()">Agregar una escena</button>
            <button type="button" class="boton" data-accion="ordenar-mapa" (click)="store.ordenarAutomaticamente()">Ordenar automáticamente</button>
          </div>
        </div>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>
        @if (haySinSala()) {
          <p class="tarjeta" role="note" data-sin-salas>
            Este caso no tiene salas de un lugar de la biblioteca, así que sus escenas no se pueden abrir en una sala. Puedes escribir su guion, sus respuestas y sus finales; para un caso con salas, créalo desde un lugar.
          </p>
        }

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
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <button type="button" class="boton" data-accion="aceptar-ia" (click)="aceptarEscena(e.id)">Aceptar toda la escena ({{ plural(store.partesIaDeEscena(e.id), 'parte', 'partes') }})</button>
                }
                <p class="texto-secundario">{{ nombreSala(e.salaId) }} · {{ plural(e.lineas.length, 'línea', 'líneas') }} · {{ plural(e.respuestas.length, 'respuesta', 'respuestas') }}</p>
                <dl>
                  <dt>Llegan desde</dt>
                  <dd>{{ lleganDesde(e) || 'Ninguna escena' }}</dd>
                  <dt>Lleva a</dt>
                  <dd>{{ llevaA(e) || (e.esFinal ? 'Es un final' : 'Ninguna escena') }}</dd>
                </dl>
                <div class="acciones">
                  <a class="boton boton-primario" [routerLink]="rutas.a('/editor/escena', e.id)" data-accion="abrir-guion">Abrir guion</a>
                  @if (e.salaId) {
                    <a class="boton" [routerLink]="rutas.a('/editor/sala', e.salaId)" data-accion="abrir-sala">Abrir sala</a>
                  }
                </div>
              } @else {
                <h2 id="pe">Ninguna</h2>
                <p>Elige una escena en el mapa para ver a dónde lleva y abrir su guion o su sala.</p>
              }
            </section>

            <section aria-labelledby="av" class="tarjeta avisos" data-accion="revisar-caminos">
              <h2 id="av">Avisos ({{ avisos().length + hitosSinCumplir().length }})</h2>
              @if (avisos().length || hitosSinCumplir().length) {
                <ul>
                  @for (h of hitosSinCumplir(); track h.clave) {
                    <li>
                      <span class="pildora aviso">Por resolver</span>
                      <p>{{ avisoDeHito(h) }}</p>
                      <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: hito ' + h.nombre" (click)="llevarAHito(h)">Llévame ahí</button>
                    </li>
                  }
                  @for (a of avisos(); track $index) {
                    <li>
                      <span class="pildora aviso">Por resolver</span>
                      <p>{{ a.mensaje }}</p>
                      @if (a.escenaId) {
                        <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + tituloDe(a.escenaId)" (click)="llevarA(a)">Llévame ahí</button>
                        @if (a.tipo === 'sin-salida') {
                          <button type="button" class="boton" [attr.aria-label]="'Marcar como final: ' + tituloDe(a.escenaId)" (click)="marcarFinalDesdeAviso(a.escenaId)">Marcar como final</button>
                        }
                      } @else if (a.tipo === 'final-sin-hito') {
                        <a class="boton" [routerLink]="rutas.a('/editor/finales')">Ir a los finales</a>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p>Sin avisos: todos los caminos llegan a un final.</p>
              }
            </section>

            <section aria-labelledby="hc" class="tarjeta hitos-del-caso" data-accion="hitos-del-caso">
              <h2 id="hc">Hitos del caso</h2>
              <p class="texto-secundario">
                Los pasos profesionales que entrena el caso. Los marcas en cada respuesta, desde el guion. Cuáles deciden el final se elige en
                <a class="boton boton-texto" [routerLink]="rutas.a('/editor/finales')">Finales</a>.
              </p>
              @if (hitosDelCaso().length) {
                <ul class="lista-hitos">
                  @for (fila of hitosDelCaso(); track fila.hito.clave) {
                    <li class="hito" [id]="'hito-' + fila.hito.clave" tabindex="-1">
                      <strong>{{ fila.hito.nombre }}</strong>
                      @if (fila.hito.decisivo) { <span class="pildora pildora-primaria">Decide el final</span> }
                      @if (fila.hito.descripcion) { <span class="texto-secundario">{{ fila.hito.descripcion }}</span> }
                      @if (fila.donde.length) {
                        <span>Se cumple en:</span>
                        <ul class="donde">
                          @for (d of fila.donde; track d.respuestaId) {
                            <li><a class="boton boton-texto" [routerLink]="rutas.a('/editor/escena', d.escenaId)">{{ d.escenaTitulo }}: «{{ d.respuestaTexto || 'respuesta sin escribir' }}»</a></li>
                          }
                        </ul>
                      } @else {
                        <span class="texto-secundario">Ninguna respuesta lo marca todavía.</span>
                      }
                      @if (fila.inalcanzable) {
                        <p class="aviso-hito" role="note">{{ avisoDeHito(fila.hito) }}</p>
                        <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: hito ' + fila.hito.nombre" (click)="llevarAHito(fila.hito)">Llévame ahí</button>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p>Este caso todavía no tiene hitos.</p>
              }
            </section>
          </aside>
        </div>

        @if (conectando(); as origen) {
          <div class="tarjeta dialogo" role="dialog" aria-labelledby="cct" aria-modal="false">
            <h2 id="cct" tabindex="-1">Conectar «{{ tituloDe(origen) }}» con…</h2>
            <p>Se agrega una respuesta en «{{ tituloDe(origen) }}» que lleva a la escena que elijas. Después puedes escribirla en el guion.</p>
            <ul role="listbox" aria-label="Escena a la que lleva" class="opciones">
              @for (e of caso.escenas; track e.id) {
                @if (e.id !== origen) {
                  <li role="option" tabindex="0" [attr.aria-selected]="destino() === e.id"
                      (click)="destino.set(e.id)" (keydown.enter)="destino.set(e.id)" (keydown.space)="$event.preventDefault(); destino.set(e.id)">{{ numero(e) }} · {{ e.titulo }}</li>
                }
              }
              <li role="option" tabindex="0" [attr.aria-selected]="destino() === 'nueva'"
                  (click)="destino.set('nueva')" (keydown.enter)="destino.set('nueva')" (keydown.space)="$event.preventDefault(); destino.set('nueva')">Una escena nueva</li>
            </ul>
            <div class="acciones">
              <button type="button" class="boton boton-primario" [attr.aria-disabled]="!destino()" (click)="conectar()">Conectar</button>
              <button type="button" class="boton" (click)="noConectar(origen)">No conectar</button>
            </div>
          </div>
        }

        @if (borrando(); as id) {
          <div class="tarjeta dialogo peligro" role="alertdialog" aria-labelledby="bt" aria-describedby="bd">
            <h2 id="bt" tabindex="-1">¿Borrar la escena «{{ tituloDe(id) }}»?</h2>
            <p id="bd">{{ textoBorrar(id) }} No se puede deshacer.</p>
            <div class="acciones">
              <button type="button" class="boton boton-peligro" (click)="borrar(id)">Borrar la escena</button>
              <button type="button" class="boton" (click)="conservar(id)">Conservar la escena</button>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="pagina">
        <h1>Todavía no hay un caso</h1>
        <p>Crea uno eligiendo un lugar.</p>
        <a [routerLink]="rutas.a('/lugar')" class="boton boton-primario">Crear un caso nuevo</a>
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
    .lateral h2 { margin: 0; font-size: var(--autoria-texto-20); line-height: 28px; }
    .lateral p { margin: 0; }
    .lateral .tarjeta { display: flex; flex-direction: column; gap: 8px; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: var(--autoria-texto-16); line-height: 24px; }
    dt { font-weight: 700; }
    dd { margin: 0; }
    .avisos ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .avisos li { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .avisos li p { font-size: var(--autoria-texto-16); line-height: 24px; }
    .lista-hitos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .hito { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; font-size: var(--autoria-texto-16); line-height: 24px; }
    .hito .donde { margin: 0; padding-left: 20px; }
    .aviso-hito { color: var(--aviso-texto); font-weight: 700; }
    .aviso { border-color: var(--aviso); color: var(--aviso-texto); background: var(--aviso-tinte); }
    .dialogo { display: flex; flex-direction: column; gap: 12px; max-width: 640px; border: 2px solid var(--primario); }
    .dialogo.peligro { border-color: var(--peligro); }
    .dialogo h2, .dialogo p { margin: 0; }
    .opciones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow: auto; }
    .opciones li { min-height: 44px; display: flex; align-items: center; padding: 0 10px; border-radius: 8px; cursor: pointer; }
    @media (hover: hover) and (pointer: fine) { .opciones li:hover { background: var(--fondo); } }
    .opciones li[aria-selected='true'] { background: var(--primario-tinte); outline: 2px solid var(--primario); }
  `,
})
export class EditorComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly mapa = viewChild<MapaEscenasComponent>('mapa');
  private readonly injector = inject(Injector);
  private readonly raiz: HTMLElement = inject(ElementRef).nativeElement;

  /** La escena de inicio queda elegida al entrar, para que «Abrir guion» y «Abrir sala» estén a mano. */
  protected readonly elegida = signal<string | null>(this.store.caso()?.inicioId ?? null);
  protected readonly irA = signal<string | null>(this.store.caso()?.inicioId ?? null);
  protected readonly conectando = signal<string | null>(null);
  protected readonly destino = signal<string | 'nueva' | null>(null);
  protected readonly borrando = signal<string | null>(null);
  protected readonly anuncio = signal('');

  /** Acepta de una vez lo sugerido en la escena; solo si quedó todo aceptado se anuncia (si no, habla el aviso de lo que faltó). */
  protected async aceptarEscena(id: string): Promise<void> {
    this.store.aceptarEscenaIa(id);
    await this.store.sincronizado();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (this.store.partesIaDeEscena(id) === 0) this.anuncio.set('Aceptaste todo lo sugerido en esta escena.');
  }

  protected readonly avisos = computed<Aviso[]>(() => {
    const caso = this.store.caso();
    return caso ? revisarCaminos(caso) : [];
  });

  /** Cada hito del caso con las respuestas que lo cumplen y si nadie podría cumplirlo. */
  protected readonly hitosDelCaso = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const inalcanzables = new Set(hitosInalcanzables(caso).map((h) => h.clave));
    return caso.hitos.map((hito) => ({ hito, donde: dondeSeCumple(caso, hito.clave), inalcanzable: inalcanzables.has(hito.clave) }));
  });
  protected readonly hitosSinCumplir = computed(() => this.hitosDelCaso().filter((f) => f.inalcanzable).map((f) => f.hito));

  protected readonly escenaElegida = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.elegida()) ?? null);

  /** Algún caso hecho en blanco (antes de que todo caso empezara por un lugar) tiene escenas sin sala. */
  protected readonly haySinSala = computed(() => (this.store.caso()?.escenas ?? []).some((e) => e.salaId === null));

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

  protected nombreSala(id: string | null): string {
    return id === null ? 'Sin sala' : this.store.caso()?.salas.find((s) => s.id === id)?.nombre ?? '';
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
    // Los finales dependen de los pasos y las respuestas del recorrido, no de una escena: borrar una escena no los toca.
    return `Se pierden su guion y sus respuestas. ${respuestas}`;
  }

  protected abrirGuion(id: string): void {
    void this.router.navigateByUrl(this.rutas.a('/editor/escena', id));
  }

  protected abrirSala(salaId: string): void {
    void this.router.navigateByUrl(this.rutas.a('/editor/sala', salaId));
  }

  protected agregarEscena(): void {
    const caso = this.store.caso();
    if (!caso) return;
    const despues = this.escenaElegida() ?? caso.escenas.at(-1);
    const salaId = despues?.salaId ?? caso.salas[0]?.id ?? null;
    const id = this.store.agregarEscena(salaId, despues?.id);
    this.mapa()?.elegirYEnfocar(id);
    this.anuncio.set('Se agregó una escena nueva. Abre su guion para escribirla.');
  }

  protected readonly plural = plural;

  protected avisoDeHito(h: Hito): string {
    return `El hito «${h.nombre}» no se puede cumplir: ninguna respuesta lo marca.`;
  }

  /** Lleva al guion donde se marca: el de la escena elegida o, si no hay, el de la primera con respuestas. */
  protected llevarAHito(h: Hito): void {
    const caso = this.store.caso();
    if (!caso) return;
    const destino = this.escenaElegida()?.respuestas.length ? this.escenaElegida() : caso.escenas.find((e) => e.respuestas.length) ?? caso.escenas[0];
    if (destino) void this.router.navigateByUrl(this.rutas.a('/editor/escena', destino.id));
    this.anuncio.set(`Para cumplir «${h.nombre}», marca el hito en una respuesta del guion.`);
  }

  protected marcarFinalDesdeAviso(id: string): void {
    this.store.marcarFinal(id, true);
    this.anuncio.set(`«${this.tituloDe(id)}» quedó marcada como final.`);
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
        this.enfocar('#cct');
        break;
      case 'final':
        this.store.marcarFinal(a.escenaId, a.esFinal);
        this.anuncio.set(a.esFinal ? 'La escena quedó marcada como final.' : 'La escena ya no es un final.');
        break;
      case 'borrar':
        this.borrando.set(a.escenaId);
        this.enfocar('#bt');
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
    this.anuncio.set('Escena borrada.');
    this.mapa()?.enfocarParada();
  }

  protected noConectar(origen: string): void {
    this.conectando.set(null);
    this.mapa()?.elegirYEnfocar(origen);
  }

  protected conservar(id: string): void {
    this.borrando.set(null);
    this.mapa()?.elegirYEnfocar(id);
  }

  /** Los diálogos salen debajo del mapa: el foco va a su título, y con él la pantalla. */
  private enfocar(selector: string): void {
    afterNextRender(() => this.raiz.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
