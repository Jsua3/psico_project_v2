import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { rutaArte } from '../../modelo/biblioteca.service';

/** «Mis casos» (tablero 22). El sandbox guarda un solo caso a la vez. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <div class="cabeza">
        <div class="titulo">
          <h1>Mis casos</h1>
          <p class="texto-secundario">
            Los casos que escribiste. Un caso es una situación ficticia que el estudiante vive y en la que decide, escena por escena.
          </p>
        </div>
        @if (store.caso()) {
          <a routerLink="/lugar" class="boton" data-accion="crear-caso">Crear un caso nuevo</a>
        }
      </div>

      @if (store.caso(); as caso) {
        <article class="tarjeta caso">
          @if (portada(); as p) { <img class="pixel" [src]="p" alt="" width="960" height="528" /> }
          <div class="datos">
            <div class="nombre">
              <h2>{{ caso.titulo }}</h2>
              <span class="pildora">Borrador</span>
            </div>
            <p class="texto-secundario">Universidad · {{ caso.escenas.length }} {{ caso.escenas.length === 1 ? 'escena' : 'escenas' }}</p>
          </div>
          <a routerLink="/editor" class="boton boton-primario">Seguir editando</a>
        </article>
        <p class="texto-secundario nota">El sandbox guarda un solo caso: crear otro reemplaza el actual.</p>
      } @else {
        <div class="tarjeta vacio">
          <img class="pixel" src="assets/biblioteca/universidad/arte/salas/consultorio.png" alt="" width="960" height="528" />
          <div class="datos">
            <h2>Todavía no tienes casos</h2>
            <p>Un caso es una situación ficticia que el estudiante vive en un lugar, como la universidad, decidiendo qué hacer en cada escena.</p>
            <p class="texto-secundario">Empiezas eligiendo el lugar: el caso llega con sus salas y personajes listos, y puedes cambiar todo.</p>
            <a routerLink="/lugar" class="boton boton-primario" data-accion="crear-caso">Crear un caso nuevo</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .cabeza { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-end; justify-content: space-between; }
    .titulo { display: flex; flex-direction: column; gap: 4px; max-width: 720px; }
    .titulo p { margin: 0; }
    .caso, .vacio { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: center; }
    .caso img { width: 176px; height: auto; border-radius: 10px; border: 1px solid var(--linea); }
    .vacio { padding: 32px; max-width: 760px; }
    .vacio img { width: 220px; height: auto; border-radius: 12px; border: 1px solid var(--linea); }
    .datos { flex: 1 1 300px; display: flex; flex-direction: column; gap: 8px; }
    .datos h2, .datos p { margin: 0; }
    .datos .boton { align-self: flex-start; }
    .nombre { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
    .nota { margin: 0; font-size: 16px; }
  `,
})
export class InicioComponent {
  protected readonly store = inject(CasoStore);
  protected readonly portada = computed(() => {
    const caso = this.store.caso();
    const sala = caso?.salas[0];
    return caso && sala ? rutaArte(caso.lugarId, sala.fondo) : null;
  });
}
