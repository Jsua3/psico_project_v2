import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { UiFiguraPixel } from '../../../../shared/ui/figura-pixel/ui-figura-pixel';
import { PlanoDelLugarComponent, type PuertaRota } from '../../../simulator/plano/plano-del-lugar.component';
import { dibujarPlano, normalizarLayout, puntoEnElMuro, type PlanoDelLugar, type SalaDibujada } from '../../../simulator/plano/plano';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService, rutaArte } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { RutasAutoria } from '../../rutas';

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; plano: PlanoDelLugar | null } | { tipo: 'error' };

/** Medio largo y medio grosor de la muesca de una puerta (px de plano), los mismos del plano del juego. */
const PUERTA_LARGO = 40;
const PUERTA_GROSOR = 14;

/**
 * El plano del caso (P4, Tarea 11): todas las salas por piezas del caso con sus puertas, como lo dibuja el juego, pero
 * con todas a la vista y sin «estás aquí». Las puertas sin regreso (OCL-15) salen en rojo con su texto; un clic (o Enter
 * en la lista) en una sala abre su editor. El plano lo arma el servidor con lo guardado: se pide cuando no queda nada
 * por guardar.
 *
 * E4 (EDITOR.md §4.4): es la portada de la etapa «Lugar». Cada sala se pinta con su MINIATURA REAL (la misma imagen del
 * paso «Salas») y sus puertas marcadas, sobre el escenario oscuro del juego. El dibujo es propio (Adapter sobre
 * `dibujarPlano`, la geometría del plano del juego), porque el componente del juego es compartido con el minimapa y no
 * pinta imágenes; de ese componente se conserva la lista legible (los rótulos de lectura y sus botones), que es lo que
 * usa el teclado y el lector de pantalla.
 */
@Component({
  selector: 'app-plano-caso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanoDelLugarComponent, RouterLink, UiFiguraPixel],
  template: `
    <section class="plano-caso" [class.plano-caso--angosto]="!conDibujo()" aria-labelledby="plano-caso-titulo">
      <header class="plano-caso__cabecera">
        <div class="plano-caso__titulo">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <h1 id="plano-caso-titulo">Plano del caso</h1>
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p id="plano-caso-descripcion" class="plano-caso__descripcion">
            Las salas por piezas del caso y sus puertas. Elige una sala para abrir su editor.
          </p>
        </div>
        <a class="boton boton-secundario plano-caso__volver" [routerLink]="rutas.a('/editor')">Volver al mapa</a>
      </header>

      @switch (estado().tipo) {
        @case ('cargando') {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p class="plano-caso__estado" role="status">Cargando el plano…</p>
        }
        @case ('error') {
          <div class="plano-caso__estado">
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <p role="alert">No se pudo cargar el plano.</p>
            <button type="button" class="boton" (click)="cargar()">Reintentar</button>
          </div>
        }
        @case ('listo') {
          @if (plano(); as plano) {
            <div class="plano-caso__cuerpo">
              <!-- El dibujo con las miniaturas: para el ratón y la vista; el teclado usa la lista de la derecha. -->
              <div class="plano-caso__visor">
                <svg class="plano-caso__dibujo" [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="resumen()"
                  preserveAspectRatio="xMidYMid meet" focusable="false">
                  <defs>
                    @for (sala of dibujo().salas; track sala.clave) {
                      <clipPath [attr.id]="recorte(sala.clave)">
                        <rect [attr.x]="sala.x" [attr.y]="sala.y" [attr.width]="sala.ancho" [attr.height]="sala.alto" rx="24" />
                      </clipPath>
                    }
                  </defs>
                  @for (sala of dibujo().salas; track sala.clave) {
                    <g class="sala" [attr.data-miniatura]="sala.clave" (click)="abrir(sala.clave)">
                      <rect class="sala__piso" [attr.x]="sala.x" [attr.y]="sala.y" [attr.width]="sala.ancho" [attr.height]="sala.alto" rx="24" />
                      @if (miniaturas().get(sala.clave); as arte) {
                        <image class="sala__arte" [attr.href]="arte" [attr.x]="sala.x" [attr.y]="sala.y" [attr.width]="sala.ancho"
                          [attr.height]="sala.alto" preserveAspectRatio="xMidYMid slice" [attr.clip-path]="'url(#' + recorte(sala.clave) + ')'" />
                      }
                      <rect class="sala__velo" [attr.x]="sala.x" [attr.y]="sala.y + sala.alto * 0.62" [attr.width]="sala.ancho"
                        [attr.height]="sala.alto * 0.38" [attr.clip-path]="'url(#' + recorte(sala.clave) + ')'" />
                      <rect class="sala__borde" [attr.x]="sala.x" [attr.y]="sala.y" [attr.width]="sala.ancho" [attr.height]="sala.alto"
                        rx="24" vector-effect="non-scaling-stroke" />
                      @for (p of sala.puertas; track $index) {
                        <rect class="puerta" vector-effect="non-scaling-stroke"
                          [attr.x]="horizontal(p.muro) ? p.x - PUERTA_LARGO : p.x - PUERTA_GROSOR"
                          [attr.y]="horizontal(p.muro) ? p.y - PUERTA_GROSOR : p.y - PUERTA_LARGO"
                          [attr.width]="horizontal(p.muro) ? 2 * PUERTA_LARGO : 2 * PUERTA_GROSOR"
                          [attr.height]="horizontal(p.muro) ? 2 * PUERTA_GROSOR : 2 * PUERTA_LARGO" />
                      }
                      <text class="sala__nombre" [attr.x]="sala.x + 32" [attr.y]="sala.y + sala.alto - 36" [attr.font-size]="letra()">{{ sala.titulo }}</text>
                    </g>
                  }
                  @for (r of rotasDibujadas(); track $index) {
                    <g class="rota">
                      <circle vector-effect="non-scaling-stroke" [attr.cx]="r.x" [attr.cy]="r.y" r="44" />
                      <text [attr.x]="r.x" [attr.y]="r.y" text-anchor="middle" dominant-baseline="central" font-size="64">×</text>
                    </g>
                  }
                </svg>
              </div>
              <aside class="plano-caso__salas" aria-labelledby="plano-caso-salas">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h2 id="plano-caso-salas">Salas</h2>
                <app-plano-del-lugar class="plano-caso__lista" [plano]="plano" modo="completo" [visitadas]="todas()"
                  [rotas]="rotas()" [elegible]="true" (salaElegida)="abrir($event)" />
              </aside>
            </div>
          } @else {
            <!-- El vacío con la misma forma que los de Evaluación (figura del simulador, título, frase y salida), no una nota suelta. -->
            <section class="plano-caso__vacio" aria-labelledby="plano-vacio-titulo">
              <ui-figura-pixel class="plano-caso__figura" personaje="supervisor-clinico" [escala]="3" />
              <div class="plano-caso__vacio-texto">
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <h2 id="plano-vacio-titulo">Este caso todavía no tiene plano</h2>
                <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
                <p role="status">El plano dibuja las salas armadas por piezas y sus puertas. Las salas de este caso son de imagen fija: se editan desde el mapa del caso.</p>
              </div>
            </section>
          }
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; min-inline-size: 0; }
    .plano-caso {
      display: flex; flex-direction: column; gap: var(--ds-space-3); min-inline-size: 0;
      padding: var(--ds-space-3) var(--ds-space-4) var(--ds-space-4);
    }
    .plano-caso__cabecera { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-2) var(--ds-space-5); }
    .plano-caso__titulo { min-inline-size: 0; }
    .plano-caso__titulo h1 { margin: 0; font-size: var(--autoria-texto-32); line-height: 2.5rem; letter-spacing: -0.015em; overflow-wrap: anywhere; }
    .plano-caso__descripcion { margin: 0.25rem 0 0; color: var(--ds-text-2); font-size: var(--autoria-texto-16); line-height: 1.5rem; overflow-wrap: anywhere; }
    .plano-caso__volver { min-block-size: var(--ds-target-min); }

    .plano-caso__cuerpo { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ds-space-3); min-inline-size: 0; }
    /* El escenario oscuro del juego: las miniaturas son pixel art y se leen sobre él en las dos pieles. */
    .plano-caso__visor {
      display: grid; min-inline-size: 0; min-block-size: 18rem; padding: var(--ds-space-4); overflow: hidden;
      border: 1px solid var(--l-filo); border-radius: var(--l-radio-tarjeta); box-shadow: var(--l-sombra-trabajo);
      background:
        radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--juego-acento) 12%, transparent), transparent 70%),
        var(--juego-escenario);
    }
    .plano-caso__dibujo { display: block; inline-size: 100%; block-size: 100%; min-block-size: 0; }
    .sala { cursor: pointer; }
    .sala__piso { fill: var(--juego-elevado); }
    .sala__arte { image-rendering: pixelated; }
    .sala__velo { fill: var(--juego-escenario); opacity: 0.55; pointer-events: none; }
    .sala__borde { fill: none; stroke: var(--juego-borde); stroke-width: 1.5; transition: stroke var(--ds-dur-fast) var(--ds-ease-out); }
    @media (hover: hover) and (pointer: fine) { .sala:hover .sala__borde { stroke: var(--juego-acento-claro); stroke-width: 3; } }
    .sala:active .sala__borde { stroke: var(--juego-acento); }
    .puerta { fill: var(--juego-acento-claro); stroke: var(--juego-escenario); stroke-width: 1.5; }
    .sala__nombre {
      fill: var(--juego-texto); font-family: var(--pixel-f-nombre, var(--ds-font-sans)); font-weight: 700;
      paint-order: stroke; stroke: var(--juego-escenario); stroke-width: 0.25em; stroke-linejoin: round; pointer-events: none;
    }
    .rota circle { fill: var(--juego-escenario); stroke: var(--juego-aviso); stroke-width: 3; stroke-dasharray: 6 4; }
    .rota text { fill: var(--juego-aviso); font-weight: 700; }

    .plano-caso__salas {
      display: flex; flex-direction: column; gap: var(--ds-space-2); min-inline-size: 0; padding: var(--ds-space-3);
      border: 1px solid var(--l-filo); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie);
    }
    .plano-caso__salas h2 { margin: 0; font-size: var(--autoria-texto-18); }
    /* Del componente del juego solo se usa la lista legible: el dibujo lo pinta esta pantalla con las miniaturas. */
    :host ::ng-deep .plano-caso__lista .plano__dibujo { display: none; }
    :host ::ng-deep .plano-caso__lista .plano__lista { gap: var(--ds-space-2); font-size: var(--autoria-texto-14); }
    :host ::ng-deep .plano-caso__lista .plano__sala {
      min-block-size: var(--ds-target-min); border-color: var(--l-filo-fuerte); border-radius: var(--l-radio-control);
      background: transparent; color: var(--ds-text-1); overflow-wrap: anywhere;
      transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) { :host ::ng-deep .plano-caso__lista .plano__sala:hover { background: var(--l-superficie-hundida); } }
    :host ::ng-deep .plano-caso__lista .plano__sala:focus-visible { outline: 3px solid var(--ds-focus); outline-offset: 2px; }
    :host ::ng-deep .plano-caso__lista .plano__rota { color: var(--ds-danger); }

    .plano-caso__estado {
      align-self: start; max-inline-size: min(100%, var(--l-ancho-lectura)); margin: 0; padding: var(--ds-space-5);
      border: 1px solid var(--l-filo); border-radius: var(--l-radio-tarjeta); background: var(--l-superficie); overflow-wrap: anywhere;
    }
    .plano-caso__estado p { margin: 0 0 var(--ds-space-3); }
    /* Sin dibujo (cargando, error o vacío) no hace falta todo el ancho: la misma medida y el mismo margen que las demás pantallas. */
    .plano-caso--angosto { box-sizing: border-box; inline-size: 100%; max-inline-size: 72rem; margin-inline: auto; padding-block-start: var(--ds-space-5); }
    .plano-caso__vacio {
      display: flex; align-items: center; gap: 1.25rem 2rem; max-inline-size: 48rem; padding: 1.5rem 1.75rem;
      border-radius: var(--l-radio-tarjeta); background: var(--l-superficie); box-shadow: inset 0 0 0 1px var(--l-filo), var(--l-sombra-trabajo);
    }
    .plano-caso__figura { flex: none; }
    .plano-caso__vacio-texto { display: flex; flex-direction: column; gap: 0.5rem; min-inline-size: 0; }
    .plano-caso__vacio-texto h2 { margin: 0; font-size: var(--autoria-texto-24); line-height: 2rem; }
    .plano-caso__vacio-texto p { margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    @media (max-width: 40rem) {
      .plano-caso__titulo h1 { font-size: var(--autoria-texto-24); line-height: 2rem; }
      .plano-caso__vacio { flex-direction: column; align-items: flex-start; padding: 1.25rem; }
      .plano-caso__vacio-texto h2 { font-size: var(--autoria-texto-20); line-height: 1.75rem; }
    }
    @media (forced-colors: active) { .plano-caso__vacio { border: 1px solid CanvasText; } }

    /* Escritorio: la pantalla mide la zona central (no se desplaza); la lista de salas se desplaza por su cuenta. */
    @media (min-width: 64rem) {
      .plano-caso { block-size: calc(100dvh - var(--alto-barra, 4.5rem)); overflow: hidden; }
      .plano-caso__cuerpo { flex: 1; min-block-size: 0; grid-template-columns: minmax(0, 1fr) clamp(16rem, 22vw, 22rem); }
      .plano-caso__salas { min-block-size: 0; overflow: auto; overscroll-behavior: contain; }
    }
    @media (max-width: 63.999rem) {
      .plano-caso { padding-inline: var(--ds-space-3); }
      .plano-caso__visor { block-size: min(70dvh, 28rem); }
    }
    @media (prefers-reduced-motion: reduce) { .sala__borde { transition: none; } }
    @media (forced-colors: active) {
      .plano-caso__visor, .plano-caso__salas { border: 1px solid CanvasText; }
      .sala__borde { stroke: CanvasText; }
      .puerta { fill: Highlight; }
    }
  `],
})
export class PlanoCasoComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly store = inject(CasoStore);
  private readonly api = inject(AutoriaApiService);
  private readonly catalogoPiezas = inject(CatalogoDePiezas);
  private readonly router = inject(Router);
  private readonly biblioteca = inject(BibliotecaService);
  /** El lugar del caso, para las miniaturas de las salas por piezas (su fondo no viaja con el caso). */
  private readonly escenario = signal<Escenario | null>(null);
  protected readonly PUERTA_LARGO = PUERTA_LARGO;
  /** Hay plano que dibujar: solo entonces la pantalla usa todo el ancho. */
  protected readonly conDibujo = computed(() => this.plano() !== null);
  protected readonly PUERTA_GROSOR = PUERTA_GROSOR;
  protected readonly estado = signal<Estado>({ tipo: 'cargando' });
  protected readonly plano = computed(() => { const e = this.estado(); return e.tipo === 'listo' ? e.plano : null; });
  /** Todas las salas «vistas»: así el plano escribe todos los nombres (la docente no descubre nada). */
  protected readonly todas = computed(() => new Set(this.plano()?.salas.map(s => s.clave) ?? []));
  /** La geometría del plano del juego (sin sala actual): rectángulos, puertas y la caja que los contiene. */
  protected readonly dibujo = computed(() => {
    const plano = this.plano();
    return plano ? dibujarPlano(plano, '', this.todas()) : { caja: { x: 0, y: 0, ancho: 1, alto: 1 }, salas: [] as SalaDibujada[] };
  });
  protected readonly viewBox = computed(() => { const { x, y, ancho, alto } = this.dibujo().caja; return `${x} ${y} ${ancho} ${alto}`; });
  /** Nombres de unas 32 letras a lo ancho del plano: se leen al tamaño que se muestre. */
  protected readonly letra = computed(() => Math.round(this.dibujo().caja.ancho / 32));
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly resumen = computed(() => `Plano de las salas: ${(this.plano()?.salas ?? []).map(s => s.titulo).join(', ')}.`);
  /**
   * La miniatura real de cada sala del caso: la imagen del lugar que también muestra el paso «Salas». Una sala por piezas
   * no trae su fondo en el caso; se toma de la sala del lugar con el mismo identificador.
   */
  protected readonly miniaturas = computed(() => {
    const caso = this.store.caso(), lugar = this.escenario();
    const mapa = new Map<string, string>();
    for (const sala of caso?.salas ?? []) {
      const fondo = sala.fondo || lugar?.salas.find(s => s.id === sala.id)?.fondo;
      if (fondo) mapa.set(sala.id, rutaArte(caso!.lugarId, fondo));
    }
    return mapa;
  });
  /** Las puertas sin regreso del borrador (OCL-15), en el muro y la posición de la puerta. */
  protected readonly rotas = computed<PuertaRota[]>(() => {
    const caso = this.store.caso(), reglas = this.catalogoPiezas.reglas();
    if (!caso || !reglas) return [];
    const rotas: PuertaRota[] = [];
    for (const [salaId, faltas] of faltasPorSala(caso, reglas)) {
      const sala = caso.salas.find(s => s.id === salaId);
      for (const f of faltas) {
        if (f.regla !== 'OCL-15' || f.elemento.tipo !== 'puerta') continue;
        const puerta = sala?.puertas.find(p => p.id === f.elemento.id);
        if (puerta?.muro !== undefined && puerta.pos !== undefined) rotas.push({ sala: salaId, muro: puerta.muro, pos: puerta.pos, texto: f.mensaje });
      }
    }
    return rotas;
  });
  protected readonly rotasDibujadas = computed(() => this.rotas().flatMap(r => {
    const sala = this.plano()?.salas.find(s => s.clave === r.sala);
    return sala ? [puntoEnElMuro(sala, r.muro, r.pos)] : [];
  }));
  private pedido = 0;

  constructor() {
    let id: string | null = null;
    effect(() => {
      const caso = this.store.caso();
      if (caso && caso.id !== id) { id = caso.id; void this.cargar(); }
    });
    let lugar: string | null = null;
    effect(() => {
      const lugarId = this.store.caso()?.lugarId ?? null;
      if (!lugarId || lugarId === lugar) return;
      lugar = lugarId;
      // Sin el lugar el plano se ve igual, con las salas lisas: la miniatura es un plus, nunca un error.
      try {
        this.biblioteca.escenario(lugarId).then(e => { if (lugar === lugarId) this.escenario.set(e); }, () => {});
      } catch { /* sin biblioteca (pruebas): salas lisas */ }
    });
  }

  protected recorte(clave: string): string { return `plano-recorte-${clave}`; }
  protected horizontal(muro: string): boolean { return muro === 'fondo' || muro === 'camara'; }

  protected async cargar(): Promise<void> {
    const caso = this.store.caso();
    if (!caso) return;
    const pedido = ++this.pedido;
    this.estado.set({ tipo: 'cargando' });
    try {
      // El plano sale de lo guardado: primero se espera a que no quede nada en cola.
      await this.store.sincronizado();
      const crudo = await firstValueFrom(this.api.api.casePlan(Number(caso.id)));
      if (pedido === this.pedido) this.estado.set({ tipo: 'listo', plano: normalizarLayout(crudo) });
    } catch {
      if (pedido === this.pedido) this.estado.set({ tipo: 'error' });
    }
  }

  protected abrir(salaId: string): void {
    void this.router.navigateByUrl(this.rutas.a('/editor/sala', salaId));
  }
}
