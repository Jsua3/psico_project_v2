import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

import type { CanLeave } from '../../core/navigation/can-leave.guard';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';

import { AvisosGuardadoComponent } from './avisos-guardado.component';
import { CasoStore } from './estado/caso.store';
import { BuscadorComponent } from './guia/buscador.component';
import { FocoGuiaComponent } from './guia/foco-guia.component';
import { PanelIaComponent } from './ia/panel-ia.component';
import { RutasAutoria } from './rutas';

/**
 * Marco del editor de casos: abre el caso que dice la dirección (`portal/casos/:caseVersionId/editor`), y pone la cabecera
 * con el nombre del caso, cómo va el guardado y la barra de ayuda (Buscar, Guía y Asistente de IA). En `portal/casos/nuevo`
 * (crear un caso) no hay caso que abrir. Como el portal oculta su barra aquí, la cabecera trae el camino de vuelta a «Mis casos». La piel clara de autoría (`styles/skins/_autoria.scss` y `styles/components/_autoria.scss`) solo vale dentro de este marco.
 */
@Component({
  selector: 'app-autoria-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PanelIaComponent, BuscadorComponent, FocoGuiaComponent, AvisosGuardadoComponent],
  host: { '(document:keydown)': 'atajo($event)', '(window:pagehide)': 'alCerrar()', '(window:beforeunload)': 'antesDeSalir($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#contenido" (click)="saltar($event)">Saltar al contenido</a>
    <header class="cabecera" #cabecera>
      <div class="cabecera-marca">
        <a [routerLink]="rutas.a('/')" class="marca" aria-label="MetaFrónesis, editor de casos: volver a Mis casos">
          <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="16" stroke="currentColor" stroke-width="3" />
            <path d="M8 18a10 10 0 0 1 20 0" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
            <circle cx="18" cy="18" r="3.5" fill="currentColor" />
          </svg>
          <span class="marca-nombre">MetaFrónesis</span>
        </a>
        <span class="pildora pildora-primaria">Editor de casos</span>
        <nav aria-label="Principal" class="nav">
          <a [routerLink]="rutas.a('/')" class="enlace-nav">Mis casos</a>
          @if (store.caso()) {
            <a [routerLink]="rutas.a('/editor')" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }" class="enlace-nav">El caso</a>
            <a [routerLink]="rutas.a('/editor/finales')" routerLinkActive="activo" class="enlace-nav" data-accion="definir-finales">Finales</a>
            <a [routerLink]="rutas.a('/probar')" routerLinkActive="activo" class="enlace-nav" data-accion="probar">Probar como estudiante</a>
            <a [routerLink]="rutas.a('/revision')" routerLinkActive="activo" class="enlace-nav" data-accion="enviar-revision">Enviar a revisión</a>
          }
        </nav>
        @if (store.caso(); as caso) {
          <p class="caso-actual"><span class="texto-secundario">Caso:</span> <strong>{{ caso.titulo }}</strong></p>
        }
      </div>
      <div role="group" aria-label="Ayuda" class="barra-ayuda">
        <button type="button" class="boton" data-accion="buscar" title="Busca una acción por su nombre"
                aria-haspopup="dialog" (click)="abrirBuscador('buscar', $event)">
          Buscar <span class="texto-secundario"><kbd>Ctrl</kbd>+<kbd>K</kbd></span>
        </button>
        <button type="button" class="boton" data-accion="guia" title="Te muestra dónde está algo"
                aria-haspopup="dialog" (click)="abrirBuscador('preguntar', $event)">Guía</button>
        <button type="button" class="boton" data-accion="pedir-a-la-ia aceptar-ia" title="Escribe o cambia el caso por ti; tú apruebas"
                [attr.aria-expanded]="iaAbierta()" aria-controls="panel-ia" (click)="alternarIa()" #botonIa>
          Asistente de IA
        </button>
      </div>
    </header>

    @if (buscador(); as modo) {
      <app-buscador [modo]="modo" (cerrar)="cerrarBuscador()" />
    }
    <app-foco-guia />
    @if (store.caso()) { <app-avisos-guardado /> }

    <div class="cuerpo" [class.con-ia]="iaAbierta()">
      <main id="contenido" tabindex="-1">
        @if (abriendo()) {
          <p class="pagina" role="status">Abriendo tu caso…</p>
        } @else if (fallo(); as mensaje) {
          <div class="pagina">
            <div class="tarjeta" role="alert">
              <h1>No pudimos abrir el caso</h1>
              <p>{{ mensaje }}</p>
              <div class="acciones">
                <button type="button" class="boton boton-primario" (click)="reintentar()">Volver a intentarlo</button>
                <a class="boton" [routerLink]="rutas.a('/')">Volver a Mis casos</a>
              </div>
            </div>
          </div>
        } @else {
          <router-outlet />
        }
      </main>
      <!-- Se oculta en vez de quitarse, para no perder la conversación ni la propuesta. -->
      <app-panel-ia id="panel-ia" class="columna-ia" [hidden]="!iaAbierta()" (cerrar)="cerrarIa()" />
    </div>
  `,
  styles: `
    .cabecera {
      position: sticky; top: 0; z-index: var(--autoria-capa-5); display: flex; flex-wrap: wrap; gap: 8px 24px;
      align-items: center; justify-content: space-between; padding: 8px 24px; min-height: 64px;
      background: var(--superficie); border-bottom: 1px solid var(--linea);
    }
    .cabecera-marca { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
    .marca { display: inline-flex; align-items: center; gap: 10px; color: var(--primario); text-decoration: none; min-height: 48px; }
    .marca-nombre { font-size: var(--autoria-texto-20); font-weight: 700; color: var(--tinta); }
    .enlace-nav {
      display: inline-flex; align-items: center; min-height: 48px; padding: 0 12px; color: var(--tinta);
      font-weight: 700; text-decoration: none; border-bottom: 4px solid transparent;
    }
    .enlace-nav.activo { border-bottom-color: var(--primario); }
    .enlace-nav:active, .marca:active { opacity: 0.7; }
    .caso-actual { margin: 0; font-size: var(--autoria-texto-16); }
    .nav { display: flex; flex-wrap: wrap; gap: 0 4px; }
    .barra-ayuda { display: flex; flex-wrap: wrap; gap: 8px; }
    /* Con zoom alto la cabecera de varias filas se comería la pantalla: deja de ir pegada. */
    @media (max-height: 520px) { .cabecera { position: static; } }
    .cuerpo { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); }
    .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); }
    @media (max-width: 1000px) { .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr); } }
    .columna-ia {
      position: sticky; top: var(--alto-cabecera, 64px); align-self: start;
      max-height: calc(100vh - var(--alto-cabecera, 64px)); overflow: auto;
    }
    main { width: 100%; min-width: 0; box-sizing: border-box; outline: none; }
  `,
})
export class AutoriaShellComponent implements CanLeave {
  protected readonly store = inject(CasoStore);
  private readonly dialogo = inject(UiDialog);
  protected readonly rutas = inject(RutasAutoria);
  private readonly ruta = inject(ActivatedRoute);
  /** El caso que pide la dirección; `null` en crear un caso (no hay caso que abrir). */
  private readonly casoPedido = toSignal(this.ruta.paramMap.pipe(map((p) => p.get('caseVersionId'))), { initialValue: this.ruta.snapshot.paramMap.get('caseVersionId') });
  /** Se está abriendo el caso pedido (aún no es el que tiene el store). */
  protected readonly abriendo = computed(() => {
    const pedido = this.casoPedido();
    return pedido !== null && this.store.caso()?.id !== pedido && this.store.errorDeCarga() === null;
  });
  protected readonly fallo = computed(() => (this.casoPedido() !== null && this.store.caso()?.id !== this.casoPedido() ? this.store.errorDeCarga() : null));
  protected readonly iaAbierta = signal(false);
  protected readonly buscador = signal<'buscar' | 'preguntar' | null>(null);
  private origenBuscador: HTMLElement | null = null;
  private readonly botonIa = viewChild<ElementRef<HTMLButtonElement>>('botonIa');
  private readonly cabecera = viewChild<ElementRef<HTMLElement>>('cabecera');
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      const pedido = this.casoPedido();
      if (pedido === null) return;
      untracked(() => void this.store.cargar(Number(pedido)));
    });
    const destruir = inject(DestroyRef);
    destruir.onDestroy(() => void this.store.liberar());
    // La cabecera es pegajosa y su alto cambia con el ancho (2 o 3 filas): lo que se pega debajo
    // de ella (panel de IA, vistas previas) y el desplazamiento al enfocar usan su alto real.
    afterNextRender(() => {
      const cabecera = this.cabecera()?.nativeElement;
      if (!cabecera) return;
      const medir = () => {
        const pegajosa = getComputedStyle(cabecera).position === 'sticky';
        document.documentElement.style.setProperty('--alto-cabecera', pegajosa ? `${Math.ceil(cabecera.getBoundingClientRect().height)}px` : '0px');
      };
      medir();
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(medir);
      observador.observe(cabecera);
      destruir.onDestroy(() => observador.disconnect());
    });
  }

  /**
   * Atajo de todas las pantallas: Ctrl+K abre el buscador. Deshacer y rehacer (Ctrl+Z, Ctrl+Y) valen para la sala y los
   * atiende su pantalla.
   */
  protected atajo(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.abrirBuscador('buscar');
    }
  }

  /** Al recargar o cerrar: lo que se está escribiendo se confirma (el campo suelta su cambio). */
  protected alCerrar(): void {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && activo !== document.body) activo.blur();
  }

  /** Si hay algo que no está a salvo (cambios viajando, un conflicto o respuestas a medias), el navegador pregunta antes de cerrar la pestaña. */
  protected antesDeSalir(e: BeforeUnloadEvent): void {
    if (this.store.haySinGuardar()) e.preventDefault();
  }

  /**
   * Salir del editor (guardia de la ruta): primero se espera a que lo pendiente llegue; si aun así queda algo que no está a
   * salvo, se pregunta nombrando lo que se pierde, con «Seguir editando» como acción segura.
   */
  async canLeave(): Promise<boolean> {
    await this.store.sincronizado();
    if (!this.store.haySinGuardar()) return true;
    const motivos: string[] = [];
    if (this.store.conflicto()) motivos.push('otra persona cambió el caso y tus últimos cambios no se guardaron');
    const n = this.store.sinGuardar().length;
    if (n > 0) motivos.push(n === 1 ? 'hay 1 respuesta sin completar que solo está en esta pantalla' : `hay ${n} respuestas sin completar que solo están en esta pantalla`);
    const respuesta = await this.dialogo.consequence({
      title: 'Tienes cambios sin guardar',
      consequence: `Si sales ahora se pierde lo que no está guardado: ${motivos.join(' y ')}.`,
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardar',
    });
    return respuesta === 'proceed';
  }

  reintentar(): void {
    const pedido = this.casoPedido();
    if (pedido !== null) void this.store.cargar(Number(pedido), true);
  }

  /** El enlace normal no sirve con `<base href="/">`: recargaría la página en «Mis casos». */
  protected saltar(e: Event): void {
    e.preventDefault();
    document.getElementById('contenido')?.focus();
  }

  protected alternarIa(): void {
    if (this.iaAbierta()) {
      this.cerrarIa();
      return;
    }
    this.iaAbierta.set(true);
    afterNextRender(() => document.getElementById('iat')?.focus(), { injector: this.injector });
  }

  protected abrirBuscador(modo: 'buscar' | 'preguntar', evento?: Event): void {
    const activo = (evento?.currentTarget as HTMLElement | undefined) ?? (document.activeElement as HTMLElement | null);
    this.origenBuscador = activo && activo !== document.body ? activo : null;
    this.buscador.set(modo);
  }

  protected cerrarBuscador(): void {
    this.buscador.set(null);
    // Si se eligió una acción, la guía ya movió el foco; si no, vuelve a donde estaba.
    queueMicrotask(() => {
      if (document.activeElement === document.body || !document.activeElement) this.origenBuscador?.focus();
    });
  }

  protected cerrarIa(): void {
    this.iaAbierta.set(false);
    this.botonIa()?.nativeElement.focus();
  }
}
