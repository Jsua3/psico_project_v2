import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import type { CanLeave } from '../../core/navigation/can-leave.guard';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiGlassBar } from '../../shared/ui/glass-bar/ui-glass-bar';
import { roleLabel } from '../../shared/ui/labels';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';

import { AvisosGuardadoComponent } from './avisos-guardado.component';
import { RUTA_ENSAYO, alPulsarProbar } from './ensayo';
import { CasoStore } from './estado/caso.store';
import { BuscadorComponent } from './guia/buscador.component';
import { FocoGuiaComponent } from './guia/foco-guia.component';
import { GuiaService } from './guia/guia.service';
import { PanelIaComponent } from './ia/panel-ia.component';
import { RutasAutoria } from './rutas';

const MENU_CUENTA: UiMenuItem[] = [{ value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' }];

/** Las secciones del caso, en la barra: su ruta, la acción con que las encuentra la guía y sus rótulos (el largo es su nombre). */
const SECCIONES = [
  { ruta: '/editor', accion: null, largo: 'El caso', corto: 'El caso' },
  { ruta: '/editor/datos', accion: 'datos-del-caso', largo: 'Datos del caso', corto: 'Datos' },
  { ruta: '/editor/finales', accion: 'definir-finales', largo: 'Finales', corto: 'Finales' },
  { ruta: '/revision', accion: 'enviar-revision', largo: 'Enviar a revisión', corto: 'Revisión' },
] as const;

/**
 * Marco del editor de casos: abre el caso que dice la dirección (`portal/casos/:caseVersionId/editor`), y pone la barra de
 * vidrio de la aplicación (`ui-glass-bar` con su `GlassBarMachine`): una sola barra en pantalla, con la marca, el caso y sus
 * secciones en el módulo central y, junto a la cuenta, la ayuda (Buscar, Guía y Asistente de IA). No hay banda debajo: todo
 * lo del caso vive en la barra. Con una ayuda abierta la barra se congela para que la guía no señale algo que salta. En
 * `portal/casos/nuevo` (crear un caso) no hay caso que abrir: el módulo central dice «‹ Mis casos» y «Editor de casos».
 * La piel clara de autoría (`styles/skins/_autoria.scss` y `styles/components/_autoria.scss`) solo vale dentro de este marco.
 */
@Component({
  selector: 'app-autoria-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, PanelIaComponent, BuscadorComponent, FocoGuiaComponent, AvisosGuardadoComponent,
    UiGlassBar, UiMenu,
  ],
  host: { '(document:keydown)': 'atajo($event)', '(window:pagehide)': 'alCerrar()', '(window:beforeunload)': 'antesDeSalir($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#main-content" (click)="saltar($event)">Saltar al contenido</a>
    <header ui-glass-bar label="Editor de casos" compactLabel="Editor de casos" [congelada]="ayudaAbierta()" #cabecera>
      <a class="modulo modulo-logo pulsable ds-motion" [routerLink]="rutas.a('/')" aria-label="SIEP: volver a Mis casos">
        <span class="logo-doble ds-motion">
          <span class="logo-doble__completo ds-motion"><span class="logo-doble__marca" aria-hidden="true"></span><span class="logo-doble__nombre">SIEP</span></span>
          <span class="logo-doble__isotipo ds-motion" aria-hidden="true"><span class="logo-doble__marca" aria-hidden="true"></span></span>
        </span>
      </a>
      <!-- El módulo central es el «dónde estoy» del editor: el caso y sus secciones. Nada de él se pliega al desplazarse
           (DG-6 y «pestañas del editor siempre a mano»); lo que no cabe cede por ancho, con su nombre completo para el lector. -->
      <div class="modulo modulo-principal ds-motion">
        @if (store.caso(); as caso) {
          <a class="nav-enlace enlace-mis-casos" [routerLink]="rutas.a('/')"><span aria-hidden="true">‹</span> Mis casos</a>
          <p class="caso-actual" [attr.title]="caso.titulo"><span class="sr-only">Caso: </span>{{ caso.titulo }}</p>
          <nav aria-label="Secciones del caso" class="secciones">
            @for (s of secciones; track s.ruta) {
              <a [routerLink]="rutas.a(s.ruta)" routerLinkActive="activo" ariaCurrentWhenActive="page"
                 [routerLinkActiveOptions]="{ exact: s.ruta === '/editor' }" class="enlace-seccion"
                 [attr.data-accion]="s.accion" [attr.aria-label]="s.largo">
                <span class="rotulo-largo" aria-hidden="true">{{ s.largo }}</span><span class="rotulo-corto" aria-hidden="true">{{ s.corto }}</span>
              </a>
            }
            <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
            <a class="enlace-seccion enlace-probar" [attr.href]="rutaEnsayo()" target="_blank" rel="noopener" data-accion="probar"
               aria-label="Probar el caso en el juego (se abre en otra pestaña)" (click)="probar($event)">Probar ↗</a>
          </nav>
        } @else {
          <a class="nav-enlace" [routerLink]="rutas.a('/')"><span aria-hidden="true">‹</span> Mis casos</a>
          <span class="contexto-editor">Editor de casos</span>
        }
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        <div role="group" aria-label="Ayuda" class="barra-ayuda">
          <button type="button" class="boton" data-accion="buscar" title="Busca una acción por su nombre" aria-keyshortcuts="Control+K"
                  aria-haspopup="dialog" (click)="abrirBuscador('buscar', $event)">
            Buscar <span class="texto-secundario atajo-buscar"><kbd>Ctrl</kbd>+<kbd>K</kbd></span>
          </button>
          <button type="button" class="boton" data-accion="guia" title="Te muestra dónde está algo"
                  aria-haspopup="dialog" (click)="abrirBuscador('preguntar', $event)">Guía</button>
          <button type="button" class="boton" data-accion="pedir-a-la-ia aceptar-ia" title="Escribe o cambia el caso por ti; tú apruebas"
                  [attr.aria-expanded]="iaAbierta() && !store.soloLectura()" aria-controls="panel-ia" [disabled]="store.soloLectura()"
                  [attr.aria-describedby]="store.soloLectura() ? 'aviso-ia' : null" (click)="alternarIa()" #botonIa>
            Asistente de IA
          </button>
        </div>
        <span class="cuenta-chip">
          <span class="cuenta-chip__nombre">{{ nombreCuenta() }}</span>
          <span class="cuenta-chip__rol">{{ rolCuenta() }}</span>
        </span>
        <ui-menu label="Cuenta" icon="account_circle" iconOnly [items]="menuCuenta" (itemSelected)="alElegirCuenta($event)" />
        @if (store.soloLectura()) {
          <span id="aviso-ia" class="sr-only">{{ textoAsistenteBloqueado() }}</span>
        }
      </div>
    </header>

    @if (buscador(); as modo) {
      <app-buscador [modo]="modo" (cerrar)="cerrarBuscador()" />
    }
    <app-foco-guia />
    @if (store.caso()) { <app-avisos-guardado /> }

    <div class="cuerpo" [class.con-ia]="iaAbierta() && !store.soloLectura()">
      <main id="main-content" tabindex="-1">
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
          @if (store.soloLectura()) {
            <div class="pagina">
              <p class="solo-lectura" role="note">{{ textoSoloLectura() }}</p>
            </div>
          }
          <!-- En un caso que ya no es un borrador, los campos de las pantallas se bloquean (la prueba como estudiante no cambia nada y sigue viva). -->
          <fieldset class="marco-pantalla" [disabled]="bloqueado()">
            <router-outlet />
          </fieldset>
        }
      </main>
      <!-- Se oculta en vez de quitarse, para no perder la conversación ni la propuesta. -->
      <app-panel-ia id="panel-ia" class="columna-ia" [hidden]="!iaAbierta() || store.soloLectura()" (cerrar)="cerrarIa()" />
    </div>
  `,
  styles: `
    /*
     * El caso y sus secciones van dentro del módulo central de la barra de vidrio. Nada se pliega al desplazarse; lo que no
     * cabe cede por ANCHO, siempre en este orden: el chip de la cuenta (< 120rem), los rótulos largos de las secciones
     * (< 110rem, quedan los cortos; el nombre completo sigue en aria-label), «‹ Mis casos» (< 90rem; el logo también
     * vuelve a Mis casos), el atajo Ctrl+K (< 90rem) y el nombre del caso (< 80rem; queda en el título de la pestaña).
     */
    .enlace-mis-casos { white-space: nowrap; font-size: var(--autoria-texto-16); }
    .caso-actual {
      margin: 0; padding: 0 0.5rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 700; color: var(--asb-cromo-tinta);
    }
    .secciones { display: flex; align-items: center; gap: 2px; min-width: 0; }
    .enlace-seccion {
      position: relative; display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px;
      border-radius: 999px; color: var(--asb-cromo-tinta); font-size: var(--autoria-texto-16); font-weight: 600;
      white-space: nowrap; text-decoration: none;
    }
    /* La sección en la que estás: negrita, tinte y una raya bajo el texto (forma, no solo color). */
    .enlace-seccion.activo { font-weight: 800; background: color-mix(in srgb, var(--primario) 12%, transparent); }
    .enlace-seccion.activo::after {
      content: ''; position: absolute; left: 10px; right: 10px; bottom: 6px; height: 3px; border-radius: 2px; background: var(--primario);
    }
    @media (hover: hover) and (pointer: fine) { .enlace-seccion:hover { background: color-mix(in srgb, var(--primario) 8%, transparent); } }
    .enlace-seccion:active { opacity: 0.7; }
    .rotulo-corto { display: none; }
    @media (max-width: 109.999rem) { .rotulo-largo { display: none; } .rotulo-corto { display: inline; } }
    @media (max-width: 89.999rem) { .enlace-mis-casos { display: none; } }
    @media (max-width: 79.999rem) { .caso-actual { display: none; } }
    /* En un teléfono el módulo central es una segunda fila de la barra, con las secciones cortas y desplazables. */
    @media (max-width: 63.999rem) {
      .enlace-mis-casos { display: inline-flex; }
      .secciones { overflow-x: auto; scrollbar-width: none; }
    }
    .contexto-editor { padding: 0 0.75rem; font-weight: 700; color: var(--asb-cromo-tinta); white-space: nowrap; }
    .barra-ayuda { display: flex; flex-wrap: nowrap; gap: 8px; }
    /* El atajo cede por ancho, nunca las palabras del botón (el botón conserva aria-keyshortcuts). */
    @media (max-width: 89.999rem) { .atajo-buscar { display: none; } }
    .cuerpo { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); }
    .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); }
    @media (max-width: 1000px) { .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr); } }
    .columna-ia {
      position: sticky; top: var(--alto-cabecera, 64px); align-self: start;
      max-height: calc(100vh - var(--alto-cabecera, 64px)); overflow: auto;
    }
    .marco-pantalla { border: 0; margin: 0; padding: 0; min-width: 0; }
    .solo-lectura { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--primario-tinte); font-weight: 700; }
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
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guia = inject(GuiaService);
  private readonly direccion = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url },
  );
  /**
   * Las pantallas no se pueden cambiar si el caso ya no es un borrador. Siguen vivos los
   * datos del caso (sus campos son de solo lectura, para poder leerlos con el teclado) y la revisión: en un caso que ya no es un borrador es donde se decide (aprobar, devolver, archivar) y se crea la versión nueva.
   */
  protected readonly bloqueado = computed(() => this.store.soloLectura() && !/\/(revision|datos)$/.test(this.direccion().split('?')[0]));
  /** «Probar» abre el borrador en el juego real, en otra pestaña, desde la escena de inicio. */
  protected readonly rutaEnsayo = computed(() => RUTA_ENSAYO(this.store.caso()?.id ?? ''));
  protected probar(evento: MouseEvent): void {
    void alPulsarProbar(evento, this.store);
  }
  protected readonly iaAbierta = signal(false);
  protected readonly buscador = signal<'buscar' | 'preguntar' | null>(null);
  /** Con el buscador o la guía abiertos la barra se congela (DG-9): lo que la guía señala no salta 6 px al desplazarse. */
  protected readonly ayudaAbierta = computed(() => this.buscador() !== null || this.guia.activa() !== null);
  protected readonly menuCuenta = MENU_CUENTA;
  protected readonly secciones = SECCIONES;
  protected readonly nombreCuenta = computed(() => {
    const usuario = this.auth.currentUser();
    return `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim() || 'Cuenta institucional';
  });
  protected readonly rolCuenta = computed(() => roleLabel(this.auth.currentUser()?.role));
  private origenBuscador: HTMLElement | null = null;
  private readonly botonIa = viewChild<ElementRef<HTMLButtonElement>>('botonIa');
  private readonly cabecera = viewChild<unknown, ElementRef<HTMLElement>>('cabecera', { read: ElementRef });
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      const pedido = this.casoPedido();
      if (pedido === null) return;
      untracked(() => void this.store.cargar(Number(pedido)));
    });
    const destruir = inject(DestroyRef);
    destruir.onDestroy(() => void this.store.liberar());
    // La barra es fija y su alto cambia con el ancho (en un teléfono la ayuda y las secciones bajan a otras filas). Lo que se pega
    // bajo ella (panel de IA, vistas previas), el relleno de arriba y el desplazamiento al enfocar usan su alto real:
    // `--alto-barra` y `--alto-cabecera` (todo lo que queda fijo arriba, que hoy es solo la barra).
    afterNextRender(() => {
      const barra = this.cabecera()?.nativeElement;
      if (!barra) return;
      const raiz = document.documentElement.style;
      const medir = () => {
        const alto = getComputedStyle(barra).position === 'fixed' ? Math.ceil(barra.getBoundingClientRect().height) : 0;
        raiz.setProperty('--alto-barra', `${alto}px`);
        raiz.setProperty('--alto-cabecera', `${alto}px`);
      };
      medir();
      destruir.onDestroy(() => {
        raiz.removeProperty('--alto-barra');
        raiz.removeProperty('--alto-cabecera');
      });
      if (typeof ResizeObserver === 'undefined') return;
      const observador = new ResizeObserver(medir);
      observador.observe(barra);
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

  /**
   * Suelta el foco: los campos guardan al perder el foco, así que lo que se está escribiendo entra a la cola antes de mirar si hay
   * algo sin guardar (cerrar o salir con el cursor aún dentro de un campo no lo pierde).
   */
  private soltarFoco(): void {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && activo !== document.body) activo.blur();
  }

  /** Hay algo que se perdería al salir: lo que no está a salvo y también un cambio que el sistema rechazó (ya está deshecho). */
  private haySinGuardar(): boolean {
    return this.store.haySinGuardar() || this.store.error() !== null || this.store.descartado().length > 0;
  }

  /** Al recargar o cerrar: lo que se está escribiendo se confirma (el campo suelta su cambio). */
  protected alCerrar(): void {
    this.soltarFoco();
  }

  /** Si hay algo que no está a salvo (cambios viajando, un conflicto, respuestas a medias o un cambio rechazado), el navegador pregunta antes de cerrar la pestaña. */
  protected antesDeSalir(e: BeforeUnloadEvent): void {
    this.soltarFoco();
    if (this.haySinGuardar()) e.preventDefault();
  }

  /**
   * Salir del editor (guardia de la ruta): primero se suelta el foco y se espera a que lo pendiente llegue; si aun así queda algo
   * que no está a salvo, se pregunta nombrando lo que se pierde, con «Seguir editando» como acción segura.
   */
  async canLeave(): Promise<boolean> {
    this.soltarFoco();
    await this.store.sincronizado();
    if (!this.haySinGuardar()) return true;
    const motivos: string[] = [];
    if (this.store.conflicto()) motivos.push('otra persona cambió el caso y tus últimos cambios no se guardaron');
    const n = this.store.sinGuardar().length;
    if (n > 0) motivos.push(n === 1 ? 'hay 1 respuesta sin completar que solo está en esta pantalla' : `hay ${n} respuestas sin completar que solo están en esta pantalla`);
    if (this.store.error() !== null || this.store.descartado().length > 0) motivos.push('un cambio no se guardó y se deshizo (el aviso sigue arriba)');
    const respuesta = await this.dialogo.consequence({
      title: 'Tienes cambios sin guardar',
      consequence: `Si sales ahora se pierde lo que no está guardado: ${motivos.join(' y ')}.`,
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardar',
    });
    return respuesta === 'proceed';
  }

  /** Qué se le dice al docente cuando el caso ya no se puede editar. */
  protected textoSoloLectura(): string {
    const estado = this.store.caso()?.estado;
    const donde = estado === 'PUBLISHED' ? 'está publicado' : estado === 'ARCHIVED' ? 'está archivado' : 'está en revisión de Psicología';
    return `El caso ${donde}. Se puede ver, pero no editar.`;
  }

  /** Por qué no se puede usar el asistente cuando el caso ya no es un borrador. */
  protected textoAsistenteBloqueado(): string {
    const estado = this.store.caso()?.estado;
    const donde = estado === 'PUBLISHED' ? 'está publicado' : estado === 'ARCHIVED' ? 'está archivado' : 'está en revisión';
    return `El caso ${donde}: no se puede cambiar. El asistente de IA no está disponible.`;
  }

  reintentar(): void {
    const pedido = this.casoPedido();
    if (pedido !== null) void this.store.cargar(Number(pedido), true);
  }

  /** El enlace normal no sirve con `<base href="/">`: recargaría la página en «Mis casos». */
  protected saltar(e: Event): void {
    e.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected alternarIa(): void {
    if (this.store.soloLectura()) return;
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

  protected alElegirCuenta(valor: string | undefined): void {
    if (valor === 'salir') this.auth.logout();
  }

  protected cerrarIa(): void {
    this.iaAbierta.set(false);
    this.botonIa()?.nativeElement.focus();
  }
}
