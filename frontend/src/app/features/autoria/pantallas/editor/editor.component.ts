import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { ProgresoDelCaso } from '../../marco/progreso.service';
import { revisarCaminos, type Aviso } from '../../modelo/caminos';
import type { Escena, Hito } from '../../modelo/caso';
import { dondeSeCumple, hitosInalcanzables } from '../../modelo/hitos';
import { escenasEnOrden } from '../../modelo/progreso';
import { plural } from '../../modelo/textos';
import { type AccionEscena, MapaEscenasComponent } from './mapa-escenas.component';
import { RutasAutoria } from '../../rutas';

/**
 * «Escenas y caminos», la vista Caminos de la etapa Historia (EDITOR.md §3.4 y §4.2, regla 6).
 *
 * Patrón: contenedor (Facade del store). Carga y decide; el mapa (`app-mapa-escenas`) solo pinta y avisa lo que pasa.
 *
 * - El mapa ocupa todo el alto que queda en la zona central y se ajusta solo para que se vea el caso entero.
 * - «Escena elegida» deja de ser una columna lateral: es una franja fija sobre el mapa, así no tapa escenas ni le quita
 *   ancho al ajuste (D-38). Lleva «Abrir guion», «Abrir sala» y los avisos de esa escena, con «Marcar como final».
 * - Los avisos salen de la hoja «Pendientes» (E0); aquí solo se muestran los que la docente tiene que corregir (no lo que
 *   aún no escribió): un caso recién creado no enseña ningún aviso. La cabecera dice cuántos hay y lleva de uno en uno.
 * - «Hitos del caso» sigue aquí, con sus anclas `hito-<clave>`, hasta que E5 lo lleve a Evaluación.
 */
@Component({
  selector: 'app-editor',
  imports: [RouterLink, MapaEscenasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="caminos">
        <header class="cabeza">
          <div class="cabeza__texto">
            <h1>Escenas y caminos</h1>
            <p class="texto-secundario">{{ resumen() }}</p>
          </div>
          @if (avisosMapa().length) {
            <!-- Lleva de un aviso al siguiente: elige la escena en el mapa y dice qué le pasa. -->
            <button type="button" class="boton boton-aviso" data-accion="revisar-caminos" (click)="siguienteAviso()">
              <span aria-hidden="true">⚠</span> {{ plural(avisosMapa().length, 'aviso', 'avisos') }} en los caminos
            </button>
          } @else {
            <span class="estado-caminos" data-accion="revisar-caminos" [class.completos]="!caminosPorEscribir()">
              @if (caminosPorEscribir()) { Faltan caminos por escribir } @else { <span aria-hidden="true">✓</span> Todos los caminos llegan a un final }
            </span>
          }
        </header>
        <p role="status" class="solo-lector">{{ anuncio() }}</p>
        @if (haySinSala()) {
          <p class="nota" role="note" data-sin-salas>
            Este caso no tiene salas de un lugar de la biblioteca, así que sus escenas no se pueden abrir en una sala. Puedes escribir su guion, sus respuestas y sus finales; para un caso con salas, créalo desde un lugar.
          </p>
        }

        <section class="elegida" aria-labelledby="pe">
          @if (escenaElegida(); as e) {
            <div class="elegida__datos">
              <div class="elegida__nombre">
                <p class="elegida__rotulo">Escena elegida</p>
                <h2 id="pe" tabindex="-1">{{ numero(e) }} · {{ e.titulo }}</h2>
              </div>
              <!-- Un renglón: la franja no cambia de alto al elegir otra escena (el mapa no salta). Lo entero, en el globo. -->
              <p class="elegida__meta" [attr.title]="metaDe(e)">
                {{ nombreSala(e.salaId) }} · {{ plural(e.lineas.length, 'línea', 'líneas') }} · {{ plural(e.respuestas.length, 'respuesta', 'respuestas') }}
                · <strong>Llegan desde</strong> {{ lleganDesde(e) || 'ninguna escena' }}
                · <strong>Lleva a</strong> {{ llevaA(e) || (e.esFinal ? 'es un final' : 'ninguna escena') }}
              </p>
              @if (e.marcaIa) {
                <p class="marca-ia-linea"><span class="pildora pildora-ia">Sugerido por la IA</span> La creó el asistente; revísala y acéptala.
                  <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                  <button type="button" class="boton boton-chico" data-accion="aceptar-ia" (click)="aceptarEscena(e.id)">Aceptar toda la escena ({{ plural(store.partesIaDeEscena(e.id), 'parte', 'partes') }})</button>
                </p>
              }
              @if (avisosDeElegida().length) {
                <ul class="elegida__avisos">
                  @for (a of avisosDeElegida(); track $index) {
                    <li>
                      <p><span class="aviso-marca">⚠ Por corregir</span> {{ a.mensaje }}</p>
                      @if (a.tipo === 'sin-salida' && a.escenaId && !store.soloLectura()) {
                        <button type="button" class="boton boton-chico" [attr.aria-label]="'Marcar como final: ' + tituloDe(a.escenaId)" (click)="marcarFinalDesdeAviso(a.escenaId)">Marcar como final</button>
                      } @else if (a.tipo === 'final-sin-hito') {
                        <a class="boton boton-chico" [routerLink]="rutas.a('/editor/finales')">Ir a los finales</a>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
            <div class="acciones elegida__acciones">
              <a class="boton boton-primario" [routerLink]="rutas.a('/editor/escena', e.id)" data-accion="abrir-guion">Abrir guion</a>
              @if (e.salaId) {
                <a class="boton" [routerLink]="rutas.a('/editor/sala', e.salaId)" data-accion="abrir-sala">Abrir sala</a>
              }
              @if (hayPlano()) {
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <a class="boton" [routerLink]="rutas.a('/editor/plano')" data-accion="abrir-plano">Ver el plano</a>
              }
            </div>
          } @else {
            <div class="elegida__datos">
              <div class="elegida__nombre">
                <p class="elegida__rotulo">Escena elegida</p>
                <h2 id="pe">Ninguna</h2>
              </div>
              <p class="elegida__meta">Elige una escena en el mapa para ver a dónde lleva y abrir su guion o su sala.</p>
            </div>
          }
        </section>

        <div class="zona-mapa">
          <app-mapa-escenas #mapa [caso]="caso" [avisos]="avisosMapa()" [elegidaInicial]="irA()" [soloLectura]="store.soloLectura()"
                            (seleccion)="elegida.set($event)" (abrirGuion)="abrirGuion($event)" (abrirSala)="abrirSala($event)"
                            (accion)="accion($event)">
            <!-- Las acciones del caso van en la barra del mapa, junto a las de la escena: una sola fila de herramientas. -->
            @if (!store.soloLectura()) {
              <button type="button" class="boton" data-accion="agregar-escena" (click)="agregarEscena()">Agregar una escena</button>
              <button type="button" class="boton" data-accion="ordenar-mapa" (click)="ordenar()">Ordenar automáticamente</button>
            }
          </app-mapa-escenas>

          @if (conectando(); as origen) {
            <div class="tarjeta dialogo" role="dialog" aria-labelledby="cct" aria-modal="false">
              <h2 id="cct" tabindex="-1">Conectar «{{ tituloDe(origen) }}» con…</h2>
              <p>Se agrega una respuesta en «{{ tituloDe(origen) }}» que lleva a la escena que elijas. Después puedes escribirla en el guion.</p>
              <ul role="listbox" aria-label="Escena a la que lleva" class="opciones">
                @for (e of enOrden(); track e.id) {
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

        <!-- Se queda aquí hasta E5 (Evaluación), con sus anclas: «Llévame ahí» de un paso sin cumplir llega a su fila. -->
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
                  @if (fila.porCorregir) {
                    <p class="aviso-hito" role="note">{{ avisoDeHito(fila.hito) }}</p>
                    <button type="button" class="boton boton-chico" [attr.aria-label]="'Llévame ahí: hito ' + fila.hito.nombre" (click)="llevarAHito(fila.hito)">Llévame ahí</button>
                  }
                </li>
              }
            </ul>
          } @else {
            <p>Este caso todavía no tiene hitos.</p>
          }
        </section>
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
    :host { display: block; min-inline-size: 0; }
    .caminos { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1.5rem; min-inline-size: 0; }
    .cabeza { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; align-items: center; justify-content: space-between; }
    .cabeza__texto { min-inline-size: 0; }
    /* Título de una pantalla de trabajo: un punto más chico que el de las páginas; el mapa necesita el alto. */
    .cabeza h1 { font-size: var(--autoria-texto-24); line-height: 2rem; }
    .cabeza p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .boton-chico { min-height: 2.75rem; padding-inline: 0.875rem; }
    .boton-aviso { border-color: var(--aviso); color: var(--aviso-texto); background: var(--aviso-tinte); }
    .estado-caminos {
      display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 2.75rem; padding: 0 0.875rem;
      border-radius: 999px; background: var(--l-superficie-hundida); color: var(--ds-text-2); font-size: var(--autoria-texto-16); font-weight: 600;
    }
    .estado-caminos.completos { color: var(--ds-success); }
    .nota {
      margin: 0; padding: 0.75rem 1rem; border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-control);
      background: var(--l-superficie); font-size: var(--autoria-texto-16); line-height: 1.5rem;
    }

    /* Franja de la escena elegida: opaca (es superficie de trabajo, P3), con filo fino y radio continuo. */
    .elegida {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.5rem 1.25rem; padding: 0.625rem 0.75rem 0.625rem 1rem;
      border: 1px solid var(--l-filo-fuerte); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie);
      box-shadow: var(--l-sombra-trabajo);
    }
    .elegida__datos { display: flex; flex-direction: column; gap: 0.125rem; min-inline-size: 0; }
    .elegida__nombre { display: flex; align-items: baseline; gap: 0.75rem; min-inline-size: 0; }
    .elegida__rotulo {
      flex: none; margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; line-height: 1.25rem;
    }
    .elegida h2 {
      min-inline-size: 0; margin: 0; overflow: hidden; font-size: var(--autoria-texto-20); line-height: 1.75rem; text-overflow: ellipsis; white-space: nowrap;
    }
    .elegida__meta {
      margin: 0; overflow: hidden; color: var(--ds-text-2); font-size: var(--autoria-texto-14); line-height: 1.375rem;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .elegida__meta strong { color: var(--ds-text-1); font-weight: 700; }
    .marca-ia-linea { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.375rem 0 0; font-size: var(--autoria-texto-16); }
    .pildora-ia { border-style: dashed; }
    .elegida__avisos { display: flex; flex-direction: column; gap: 0.375rem; margin: 0.375rem 0 0; padding: 0; list-style: none; }
    .elegida__avisos li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; }
    .elegida__avisos p { flex: 1 1 18rem; margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .aviso-marca { color: var(--aviso-texto); font-weight: 800; }
    .elegida__acciones { justify-content: flex-end; }

    /* Los diálogos del mapa flotan sobre él, arriba a la derecha: no empujan el lienzo ni obligan a desplazarse. */
    .zona-mapa { position: relative; min-inline-size: 0; }
    .dialogo {
      display: flex; flex-direction: column; gap: 0.75rem; border: 2px solid var(--ds-primary); border-radius: var(--l-radio-tarjeta);
      background: color-mix(in oklab, var(--l-superficie) 97%, transparent); box-shadow: var(--l-sombra-alta);
    }
    .dialogo.peligro { border-color: var(--ds-danger); }
    .dialogo h2, .dialogo p { margin: 0; }
    .dialogo h2 { font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .opciones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; max-block-size: 17.5rem; overflow: auto; }
    .opciones li { min-block-size: 2.75rem; display: flex; align-items: center; padding: 0 0.625rem; border-radius: 0.5rem; cursor: pointer; }
    @media (hover: hover) and (pointer: fine) { .opciones li:hover { background: var(--l-superficie-hundida); } }
    .opciones li[aria-selected='true'] { background: var(--l-tinte); outline: 2px solid var(--ds-primary); }

    .hitos-del-caso { display: flex; flex-direction: column; gap: 0.5rem; }
    .hitos-del-caso h2 { margin: 0; font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    .hitos-del-caso p { margin: 0; }
    .lista-hitos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .hito { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .hito .donde { margin: 0; padding-inline-start: 1.25rem; }
    .aviso-hito { color: var(--aviso-texto); font-weight: 700; }

    @media (min-width: 64rem) {
      .dialogo {
        position: absolute; z-index: var(--autoria-capa-5); inset-block-start: 3.5rem; inset-inline-end: 1rem;
        inline-size: min(30rem, calc(100% - 2rem)); max-block-size: calc(100% - 4.5rem); overflow: auto;
      }
    }
    @media (max-width: 63.999rem) {
      .caminos { padding: 1rem; }
      .elegida { grid-template-columns: minmax(0, 1fr); }
      .elegida__acciones { justify-content: flex-start; }
    }
  `,
})
export class EditorComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly progreso = inject(ProgresoDelCaso);
  /** El plano del caso solo existe con salas por piezas. */
  protected readonly hayPlano = computed(() => this.store.caso()?.salas.some(s => !!s.estructura) ?? false);
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
  /** Por qué aviso va «N avisos en los caminos» (avanza uno por pulsación). */
  private indiceAviso = 0;

  /** Acepta de una vez lo sugerido en la escena; solo si quedó todo aceptado se anuncia (si no, habla el aviso de lo que faltó). */
  protected async aceptarEscena(id: string): Promise<void> {
    this.store.aceptarEscenaIa(id);
    await this.store.sincronizado();
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (this.store.partesIaDeEscena(id) === 0) this.anuncio.set('Aceptaste todo lo sugerido en esta escena.');
    this.enfocar('#pe'); // el botón pulsado desaparece: el foco no cae al cuerpo de la página
  }

  /** Las escenas en orden de historia: el número de cada una es el mismo del riel y del mapa. */
  protected readonly enOrden = computed(() => {
    const caso = this.store.caso();
    return caso ? escenasEnOrden(caso) : [];
  });

  private readonly todosLosAvisos = computed<Aviso[]>(() => {
    const caso = this.store.caso();
    return caso ? revisarCaminos(caso) : [];
  });

  /**
   * Solo los avisos «por corregir» (EDITOR.md §3.6): lo que aún no se escribió no es un aviso, es trabajo por hacer y va en
   * «Siguiente paso». `clasificarPendientes` arma sus faltas empezando por los avisos de caminos en el mismo orden, así que
   * el i-ésimo pendiente es el i-ésimo aviso.
   */
  protected readonly avisosMapa = computed<Aviso[]>(() => {
    const pendientes = this.progreso.pendientes();
    return this.todosLosAvisos().filter((_, i) => pendientes[i]?.tipo === 'por-corregir');
  });
  /** Hay caminos sin terminar que todavía no son un error (escenas por escribir). */
  protected readonly caminosPorEscribir = computed(() => this.todosLosAvisos().length > this.avisosMapa().length);
  protected readonly avisosDeElegida = computed(() => this.avisosMapa().filter((a) => a.escenaId === this.elegida()));

  /** Cada hito del caso con las respuestas que lo cumplen y si hay que corregirlo (nadie podría cumplirlo y ya debería). */
  protected readonly hitosDelCaso = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const inalcanzables = new Set(hitosInalcanzables(caso).map((h) => h.clave));
    const corregir = new Set(this.progreso.pendientes()
      .filter((p) => p.tipo === 'por-corregir' && p.codigo === 'milestone-unreachable').map((p) => p.ir.ancla));
    return caso.hitos.map((hito) => ({
      hito,
      donde: dondeSeCumple(caso, hito.clave),
      porCorregir: inalcanzables.has(hito.clave) && corregir.has(`hito-${hito.clave}`),
    }));
  });

  protected readonly escenaElegida = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.elegida()) ?? null);

  /** Algún caso hecho en blanco (antes de que todo caso empezara por un lugar) tiene escenas sin sala. */
  protected readonly haySinSala = computed(() => (this.store.caso()?.escenas ?? []).some((e) => e.salaId === null));

  protected readonly resumen = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    const n = caso.escenas.length;
    const finales = caso.escenas.filter((e) => e.esFinal).length;
    return `${n} ${n === 1 ? 'escena' : 'escenas'} · ${caso.inicioId ? '1 inicio' : 'sin inicio'} · ${finales} ${finales === 1 ? 'escena final' : 'escenas finales'}. Las flechas son las respuestas.`;
  });

  protected numero(e: Escena): number {
    return this.enOrden().indexOf(e) + 1;
  }

  protected tituloDe(id: string): string {
    const e = this.store.caso()?.escenas.find((x) => x.id === id);
    return e ? `${this.numero(e)} · ${e.titulo}` : '';
  }

  /** La línea de datos de la escena elegida, entera (va en el globo de la franja, que la recorta a un renglón). */
  protected metaDe(e: Escena): string {
    const sala = `${this.nombreSala(e.salaId)} · ${plural(e.lineas.length, 'línea', 'líneas')} · ${plural(e.respuestas.length, 'respuesta', 'respuestas')}`;
    return `${sala} · Llegan desde ${this.lleganDesde(e) || 'ninguna escena'} · Lleva a ${this.llevaA(e) || (e.esFinal ? 'es un final' : 'ninguna escena')}`;
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

  /** Reordena el mapa y lo vuelve a encuadrar, para que el resultado se vea entero. */
  protected ordenar(): void {
    this.store.ordenarAutomaticamente();
    afterNextRender(() => this.mapa()?.encuadrar(), { injector: this.injector });
    this.anuncio.set('El mapa quedó ordenado según sus caminos.');
  }

  /** «N avisos en los caminos»: elige la siguiente escena con un aviso y dice qué le pasa. */
  protected siguienteAviso(): void {
    const avisos = this.avisosMapa();
    if (!avisos.length) return;
    const aviso = avisos[this.indiceAviso % avisos.length];
    this.indiceAviso++;
    if (aviso.escenaId) this.mapa()?.elegirYEnfocar(aviso.escenaId);
    this.anuncio.set(aviso.mensaje);
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

  /** Los diálogos flotan sobre el mapa: el foco va a su título. */
  private enfocar(selector: string): void {
    afterNextRender(() => this.raiz.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
