import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, inject, signal, viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CasoStore } from './estado/caso.store';
import { BuscadorComponent } from './guia/buscador.component';
import { FocoGuiaComponent } from './guia/foco-guia.component';
import { PanelIaComponent } from './ia/panel-ia.component';

/**
 * Marco del sandbox: cabecera con el nombre del caso, la barra de ayuda (Buscar, Guía y
 * Asistente de IA, que se llenan en tareas posteriores) y «Reiniciar el sandbox», que pide
 * confirmación dentro de la página.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PanelIaComponent, BuscadorComponent, FocoGuiaComponent],
  host: { '(document:keydown)': 'atajo($event)', '(window:pagehide)': 'alCerrar()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#contenido" (click)="saltar($event)">Saltar al contenido</a>
    <header class="cabecera" #cabecera>
      <div class="cabecera-marca">
        <a routerLink="/" class="marca" aria-label="MetaFrónesis, editor de casos: inicio">
          <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="16" stroke="currentColor" stroke-width="3" />
            <path d="M8 18a10 10 0 0 1 20 0" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
            <circle cx="18" cy="18" r="3.5" fill="currentColor" />
          </svg>
          <span class="marca-nombre">MetaFrónesis</span>
        </a>
        <span class="pildora pildora-primaria">Editor de casos</span>
        <nav aria-label="Principal" class="nav">
          <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }" class="enlace-nav">Mis casos</a>
          @if (store.caso()) {
            <a routerLink="/editor" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: false }" class="enlace-nav">El caso</a>
            <a routerLink="/editor/finales" routerLinkActive="activo" class="enlace-nav" data-accion="definir-finales">Finales</a>
            <a routerLink="/probar" routerLinkActive="activo" class="enlace-nav" data-accion="probar">Probar como estudiante</a>
            <a routerLink="/revision" routerLinkActive="activo" class="enlace-nav" data-accion="enviar-revision">Enviar a revisión</a>
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
        <button type="button" class="boton boton-texto" data-accion="reiniciar" (click)="pedirReinicio()" #botonReiniciar>Reiniciar el sandbox</button>
      </div>
    </header>

    @if (confirmando()) {
      <div class="confirmacion" role="alertdialog" aria-modal="false" aria-labelledby="conf-titulo" aria-describedby="conf-texto">
        <h2 id="conf-titulo">¿Reiniciar el sandbox?</h2>
        <p id="conf-texto">Se borra el caso en curso y todo lo que hiciste. No se puede deshacer.</p>
        <div class="acciones">
          <button type="button" class="boton boton-peligro" (click)="reiniciar()" #botonConfirmar>Sí, borrar todo</button>
          <button type="button" class="boton" (click)="cancelar()">Cancelar</button>
        </div>
      </div>
    }

    @if (buscador(); as modo) {
      <app-buscador [modo]="modo" (cerrar)="cerrarBuscador()" />
    }
    <app-foco-guia />

    <div class="cuerpo" [class.con-ia]="iaAbierta()">
      <main id="contenido" tabindex="-1">
        <router-outlet />
      </main>
      <!-- Se oculta en vez de quitarse, para no perder la conversación ni la propuesta. -->
      <app-panel-ia id="panel-ia" class="columna-ia" [hidden]="!iaAbierta()" (cerrar)="cerrarIa()" />
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .cabecera {
      position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px 24px;
      align-items: center; justify-content: space-between; padding: 8px 24px; min-height: 64px;
      background: var(--superficie); border-bottom: 1px solid var(--linea);
    }
    .cabecera-marca { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
    .marca { display: inline-flex; align-items: center; gap: 10px; color: var(--primario); text-decoration: none; min-height: 48px; }
    .marca-nombre { font-size: 20px; font-weight: 700; color: var(--tinta); }
    .enlace-nav {
      display: inline-flex; align-items: center; min-height: 48px; padding: 0 12px; color: var(--tinta);
      font-weight: 700; text-decoration: none; border-bottom: 4px solid transparent;
    }
    .enlace-nav.activo { border-bottom-color: var(--primario); }
    .caso-actual { margin: 0; font-size: 16px; }
    .nav { display: flex; flex-wrap: wrap; gap: 0 4px; }
    .barra-ayuda { display: flex; flex-wrap: wrap; gap: 8px; }
    /* Con zoom alto la cabecera de varias filas se comería la pantalla: deja de ir pegada. */
    @media (max-height: 520px) { .cabecera { position: static; } }
    .confirmacion {
      margin: 16px auto 0; width: min(720px, calc(100% - 32px)); box-sizing: border-box; padding: 24px;
      background: var(--superficie); border: 2px solid var(--peligro); border-radius: 16px;
    }
    .confirmacion h2 { margin: 0 0 8px; font-size: 24px; line-height: 32px; }
    .confirmacion p { margin: 0 0 16px; }
    .cuerpo { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); }
    .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); }
    @media (max-width: 1000px) { .cuerpo.con-ia { grid-template-columns: minmax(0, 1fr); } }
    .columna-ia {
      position: sticky; top: var(--alto-cabecera, 64px); align-self: start;
      max-height: calc(100vh - var(--alto-cabecera, 64px)); overflow: auto;
    }
    .columna-ia[hidden] { display: none !important; }
    main { width: 100%; min-width: 0; box-sizing: border-box; outline: none; }
  `,
})
export class AppComponent {
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  protected readonly confirmando = signal(false);
  protected readonly iaAbierta = signal(false);
  protected readonly buscador = signal<'buscar' | 'preguntar' | null>(null);
  private origenBuscador: HTMLElement | null = null;
  private readonly botonIa = viewChild<ElementRef<HTMLButtonElement>>('botonIa');
  private readonly botonReiniciar = viewChild<ElementRef<HTMLButtonElement>>('botonReiniciar');
  private readonly botonConfirmar = viewChild<ElementRef<HTMLButtonElement>>('botonConfirmar');
  private readonly cabecera = viewChild<ElementRef<HTMLElement>>('cabecera');
  private readonly injector = inject(Injector);

  constructor() {
    // La cabecera es pegajosa y su alto cambia con el ancho (2 o 3 filas): lo que se pega debajo
    // de ella (panel de IA, vistas previas) y el desplazamiento al enfocar usan su alto real.
    const destruir = inject(DestroyRef);
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
   * Atajos de todas las pantallas: Ctrl+K abre el buscador; Ctrl+Z deshace y Ctrl+Y (o
   * Ctrl+Mayús+Z) rehace, salvo dentro de un campo de texto, donde deshacen lo escrito.
   */
  protected atajo(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'k') {
      e.preventDefault();
      this.abrirBuscador('buscar');
      return;
    }
    if (k !== 'z' && k !== 'y') return;
    // Si una pantalla ya lo atendió (la sala), no se deshace dos veces.
    if (e.defaultPrevented || this.esCampoDeTexto(e.target)) return;
    e.preventDefault();
    if (k === 'z' && !e.shiftKey) this.store.deshacer();
    else this.store.rehacer();
  }

  /** Al recargar o cerrar: lo que se está escribiendo se confirma (el campo suelta su cambio) y se guarda ya. */
  protected alCerrar(): void {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && activo !== document.body) activo.blur();
    this.store.guardarYa();
  }

  private esCampoDeTexto(objetivo: EventTarget | null): boolean {
    if (!(objetivo instanceof HTMLElement)) return false;
    if (objetivo.isContentEditable) return true;
    if (objetivo instanceof HTMLTextAreaElement || objetivo instanceof HTMLSelectElement) return true;
    return objetivo instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(objetivo.type);
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

  protected pedirReinicio(): void {
    this.confirmando.set(true);
    queueMicrotask(() => this.botonConfirmar()?.nativeElement.focus());
  }

  protected cancelar(): void {
    this.confirmando.set(false);
    this.botonReiniciar()?.nativeElement.focus();
  }

  protected reiniciar(): void {
    this.store.reiniciar();
    this.confirmando.set(false);
    void this.router.navigateByUrl('/');
  }
}
