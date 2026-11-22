import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { Escena } from '../modelo/caso';
import { estaVacia } from '../modelo/pendientes';
import type { EstadoEtapa } from '../modelo/progreso';
import { RutasAutoria } from '../rutas';
import { injectLlevar } from './llevar';
import { ProgresoDelCaso } from './progreso.service';

interface FilaEscena {
  escena: Escena;
  numero: number;
  estado: EstadoEtapa;
  pendientes: number;
  /** Lo que oye el lector de pantalla: «Escena 2, Recepción: escrita, 1 por corregir». */
  etiqueta: string;
}

/**
 * El riel de escenas, versión básica de E0 (EDITOR.md §4.1): «Siguiente paso» arriba, siempre en el mismo sitio, y las
 * escenas en orden de historia con su número, su título (dos renglones como mucho; el entero en `title` y en el nombre
 * accesible) y su estado con forma y palabra. Se pinta solo en la etapa Historia. Cada zona del editor se desplaza por su
 * cuenta: el riel también (8 escenas × 56 px caben sin desplazar a 1280×720; 30 escenas, con desplazamiento propio).
 *
 * E1 le suma la vista «Caminos», agregar escenas y las miniaturas de sala; aquí no se adelanta para no pisar ese bloque.
 * Por debajo de 64rem el riel es un selector «Escena 2 de 8» (§4.3), que cabe en un teléfono sin desbordar.
 */
@Component({
  selector: 'app-riel-de-escenas',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'riel' },
  template: `
    @if (progreso.siguiente(); as paso) {
      <section class="riel__paso" aria-labelledby="riel-paso-titulo">
        <p class="riel__eyebrow" id="riel-paso-titulo">Siguiente paso</p>
        <button type="button" class="riel__paso-boton ds-motion" data-accion="siguiente-paso" (click)="llevar(paso)">
          <span class="riel__paso-texto">{{ paso.texto }}</span><span class="riel__flecha" aria-hidden="true">→</span>
        </button>
      </section>
    }

    <nav class="riel__escenas" aria-labelledby="riel-titulo" data-accion="leer-todo-el-guion">
      <div class="riel__cabecera">
        <p class="riel__eyebrow" id="riel-titulo">Escenas</p>
        <span class="riel__cuenta">{{ escritas() }}</span>
      </div>
      <ol class="riel__lista">
        @for (f of filas(); track f.escena.id) {
          <li>
            <a class="riel__escena ds-motion" [routerLink]="rutas.a('/editor/escena', f.escena.id)" [attr.title]="f.escena.titulo"
               [attr.aria-label]="f.etiqueta" [attr.aria-current]="progreso.escenaActual() === f.escena.id ? 'page' : null">
              <span class="riel__numero" aria-hidden="true">{{ f.numero }}</span>
              <span class="riel__titulo" aria-hidden="true">{{ f.escena.titulo }}</span>
              <span class="riel__fin" aria-hidden="true">
                @if (f.escena.esFinal) { <span class="riel__final">Final</span> }
                @if (f.pendientes) { <span class="riel__pendientes">{{ f.pendientes }}</span> }
                <span class="marca-estado" [attr.data-estado]="f.estado"></span>
              </span>
            </a>
          </li>
        }
      </ol>
      <a class="riel__caminos" [routerLink]="rutas.a('/editor')" [attr.aria-current]="enCaminos() ? 'page' : null">Ver los caminos del caso</a>
    </nav>

    <!-- Teléfono y tableta: un selector en vez de la columna (va fuera del <nav>: no se lee dos veces). -->
    <div class="riel__selector">
      <label class="riel__eyebrow" for="riel-escena">Escena</label>
      <select id="riel-escena" class="riel__select" (change)="irAEscena($any($event.target).value)">
        <option value="" [selected]="!progreso.escenaActual()">Todas las escenas y sus caminos</option>
        @for (f of filas(); track f.escena.id) {
          <option [value]="f.escena.id" [selected]="progreso.escenaActual() === f.escena.id">Escena {{ f.numero }} de {{ filas().length }} · {{ f.escena.titulo }}{{ f.pendientes ? ' · ' + f.pendientes + ' por corregir' : f.estado === 'sin-empezar' ? ' · por escribir' : '' }}</option>
        }
      </select>
    </div>
  `,
  styles: `
    :host {
      display: flex; flex-direction: column; gap: var(--ds-space-5, 1.25rem); padding: var(--ds-space-4, 1rem);
      background: var(--l-superficie); border-inline-end: 1px solid var(--l-filo);
    }
    .riel__eyebrow {
      margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; line-height: 1.25rem;
    }
    .riel__paso { display: flex; flex-direction: column; gap: 0.5rem; }
    /* «Siguiente paso»: superficie tinte (C2), el único bloque del riel que pide atención; un toque lleva ahí. */
    .riel__paso-boton {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; inline-size: 100%;
      min-block-size: 2.75rem; padding: 0.75rem 0.875rem; border: 1px solid var(--l-tinte-filo); border-radius: var(--l-radio-control);
      background: var(--l-tinte); color: var(--ds-text-1); font: inherit; font-size: var(--autoria-texto-16); font-weight: 600;
      line-height: 1.375rem; text-align: start; cursor: pointer;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .riel__paso-texto { min-inline-size: 0; overflow-wrap: anywhere; }
    .riel__flecha { color: var(--ds-primary); font-weight: 800; }
    @media (hover: hover) and (pointer: fine) {
      .riel__paso-boton:hover { background: color-mix(in oklab, var(--l-acento) 18%, transparent); }
    }
    .riel__paso-boton:active { scale: 0.98; }

    .riel__escenas { display: flex; flex-direction: column; gap: 0.5rem; min-block-size: 0; }
    .riel__cabecera { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .riel__cuenta { color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-variant-numeric: tabular-nums; }
    .riel__lista { display: flex; flex-direction: column; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
    .riel__escena {
      display: grid; grid-template-columns: 1.75rem minmax(0, 1fr) auto; align-items: center; gap: 0.5rem;
      min-block-size: 3.25rem; padding: 0.375rem 0.5rem; border: 1px solid transparent; border-radius: var(--l-radio-control);
      color: var(--ds-text-1); text-decoration: none;
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out), scale var(--ds-dur-press) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .riel__escena:hover { background: var(--l-superficie-hundida); color: var(--ds-text-1); }
    }
    .riel__escena:active { scale: 0.98; }
    .riel__escena[aria-current='page'] { background: var(--l-fila-elegida); border-color: var(--l-tinte-filo); }
    /* El número es una tesela de píxel: el guiño al juego, pequeño y repetido. */
    .riel__numero {
      display: grid; place-items: center; inline-size: 1.75rem; block-size: 1.75rem; border-radius: 0.375rem;
      background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo-fuerte);
      color: var(--ds-text-1); font-size: var(--autoria-texto-14); font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .riel__escena[aria-current='page'] .riel__numero { background: var(--ds-primary); box-shadow: none; color: var(--ds-on-primary); }
    .riel__titulo {
      display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
      font-size: var(--autoria-texto-16); font-weight: 600; line-height: 1.25rem; overflow-wrap: anywhere;
    }
    .riel__escena[aria-current='page'] .riel__titulo { font-weight: 800; }
    .riel__fin { display: inline-flex; align-items: center; gap: 0.375rem; }
    .riel__final {
      padding: 0 0.375rem; border: 1px solid var(--l-filo-fuerte); border-radius: 999px; color: var(--ds-text-2);
      font-size: var(--autoria-texto-14); line-height: 1.25rem;
    }
    .riel__pendientes { color: var(--ds-warning-text); font-size: var(--autoria-texto-14); font-weight: 800; font-variant-numeric: tabular-nums; }
    .riel__caminos {
      display: inline-flex; align-items: center; min-block-size: 2.75rem; margin-block-start: 0.25rem;
      color: var(--ds-primary); font-size: var(--autoria-texto-16); font-weight: 700;
    }
    .riel__caminos[aria-current='page'] { text-decoration-thickness: 0.1875rem; }
    .riel__selector { display: none; }
    .riel__select {
      inline-size: 100%; min-block-size: 2.75rem; padding-inline: 0.75rem; border: 1px solid var(--ds-border-strong);
      border-radius: var(--l-radio-control); background: var(--l-superficie); color: var(--ds-text-1); font: inherit;
      font-size: var(--autoria-texto-16);
    }

    /* Franja estrecha de escritorio (64rem a 80rem): el riel se pliega a 56 px con el número y el estado. */
    @media (min-width: 64rem) and (max-width: 79.999rem) {
      :host { padding-inline: 0.375rem; gap: 0.75rem; }
      .riel__paso, .riel__cabecera, .riel__titulo, .riel__final, .riel__pendientes, .riel__caminos { display: none; }
      .riel__fin { justify-content: center; }
      .riel__escena { grid-template-columns: 1fr; justify-items: center; gap: 0.25rem; padding-inline: 0.25rem; }
    }
    /* Teléfono y tableta: «Siguiente paso» y el selector, en una franja sobre el contenido. */
    @media (max-width: 63.999rem) {
      :host { gap: 0.75rem; border-inline-end: 0; border-block-end: 1px solid var(--l-filo); }
      .riel__escenas { display: none; }
      .riel__selector { display: flex; flex-direction: column; gap: 0.375rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .riel__escena, .riel__paso-boton { transition: none; }
    }
  `,
})
export class RielDeEscenasComponent {
  protected readonly progreso = inject(ProgresoDelCaso);
  protected readonly rutas = inject(RutasAutoria);
  private readonly router = inject(Router);
  protected readonly llevar = injectLlevar();

  protected readonly filas = computed<FilaEscena[]>(() => {
    const pendientes = this.progreso.porCorregir();
    return this.progreso.escenas().map((escena, i) => {
      const n = pendientes.filter((p) => p.escenaId === escena.id).length;
      const vacia = estaVacia(escena);
      const estado: EstadoEtapa = n ? 'con-pendientes' : vacia ? 'sin-empezar' : 'lista';
      const partes = [vacia ? 'por escribir' : 'escrita'];
      if (escena.esFinal) partes.push('es un final');
      if (n) partes.push(n === 1 ? '1 por corregir' : `${n} por corregir`);
      return { escena, numero: i + 1, estado, pendientes: n, etiqueta: `Escena ${i + 1}, ${escena.titulo}: ${partes.join(', ')}` };
    });
  });

  /** «3 de 8 escritas». */
  protected readonly escritas = computed(() => {
    const filas = this.filas();
    return `${filas.filter((f) => !estaVacia(f.escena)).length} de ${filas.length} escritas`;
  });

  protected readonly enCaminos = computed(() => /\/editor\/?$/.test(this.progreso.direccion().split(/[?#]/)[0]));

  protected irAEscena(id: string): void {
    void this.router.navigateByUrl(id ? this.rutas.a('/editor/escena', id) : this.rutas.a('/editor'));
  }
}
