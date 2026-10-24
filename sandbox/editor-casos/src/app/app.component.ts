import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { CasoStore } from './estado/caso.store';

/**
 * Marco del sandbox: cabecera con el nombre del caso, la barra de ayuda (Buscar, Guía y
 * Asistente de IA, que se llenan en tareas posteriores) y «Reiniciar el sandbox», que pide
 * confirmación dentro de la página.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="cabecera">
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
        <nav aria-label="Principal">
          <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }" class="enlace-nav">Mis casos</a>
        </nav>
        @if (store.caso(); as caso) {
          <p class="caso-actual"><span class="texto-secundario">Caso:</span> <strong>{{ caso.titulo }}</strong></p>
        }
      </div>
      <div role="group" aria-label="Ayuda" class="barra-ayuda">
        <button type="button" class="boton" data-accion="buscar" title="Busca una acción por su nombre">
          Buscar <span class="texto-secundario"><kbd>Ctrl</kbd>+<kbd>K</kbd></span>
        </button>
        <button type="button" class="boton" data-accion="guia" title="Te muestra dónde está algo">Guía</button>
        <button type="button" class="boton" data-accion="pedir-a-la-ia" title="Escribe o cambia el caso por ti; tú apruebas">
          Asistente de IA
        </button>
        <button type="button" class="boton boton-texto" (click)="pedirReinicio()" #botonReiniciar>Reiniciar el sandbox</button>
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

    <main id="contenido" tabindex="-1">
      <router-outlet />
    </main>
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
    .barra-ayuda { display: flex; flex-wrap: wrap; gap: 8px; }
    .confirmacion {
      margin: 16px auto 0; width: min(720px, calc(100% - 32px)); box-sizing: border-box; padding: 24px;
      background: var(--superficie); border: 2px solid var(--peligro); border-radius: 16px;
    }
    .confirmacion h2 { margin: 0 0 8px; font-size: 24px; line-height: 32px; }
    .confirmacion p { margin: 0 0 16px; }
    main { flex: 1; width: 100%; box-sizing: border-box; outline: none; }
  `,
})
export class AppComponent {
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  protected readonly confirmando = signal(false);
  private readonly botonReiniciar = viewChild<ElementRef<HTMLButtonElement>>('botonReiniciar');
  private readonly botonConfirmar = viewChild<ElementRef<HTMLButtonElement>>('botonConfirmar');

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
