import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { LugarResumen } from '../../modelo/escenario';
import { TEMAS, nombreTema } from '../../modelo/textos';
import { PasosCrearComponent } from '../pasos-crear.component';
import { RutasAutoria } from '../../rutas';

/** Paso 1 de crear un caso (tablero 23): elegir el lugar donde pasa. Un clic en «Elegir este lugar» lleva al paso 2. */
@Component({
  selector: 'app-lugar',
  imports: [RouterLink, PasosCrearComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <app-pasos-crear [paso]="1" />
      <div class="titulo">
        <h1>¿Dónde pasa tu caso?</h1>
        <p class="texto-secundario">
          Elige un lugar. El caso recibe una copia de sus salas, muebles y personajes: puedes cambiar todo y el lugar original no cambia.
        </p>
      </div>

      <div class="filtro" role="group" aria-labelledby="ftema">
        <span id="ftema" class="etiqueta">Filtrar por tema</span>
        <button type="button" class="boton ficha" [attr.aria-pressed]="tema() === null" (click)="tema.set(null)">Todos los temas</button>
        @for (t of temas; track t.id) {
          <button type="button" class="boton ficha" [attr.aria-pressed]="tema() === t.id" (click)="tema.set(t.id)">{{ t.nombre }}</button>
        }
      </div>

      @if (fallo()) {
        <div class="tarjeta" role="alert">
          <p>No pudimos cargar los lugares. Revisa tu conexión y vuelve a intentarlo.</p>
          <button type="button" class="boton boton-primario" (click)="cargar()">Volver a intentarlo</button>
        </div>
      } @else {
        <p role="status" class="texto-secundario estado">{{ estado() }}</p>
      }

      @if (filtrados().length && !hayDisponibles()) {
        <div class="tarjeta aviso-filtro">
          <p>Con este tema solo hay lugares que llegan pronto. Por ahora puedes quitar el filtro y usar la universidad.</p>
          <button type="button" class="boton" (click)="tema.set(null)">Quitar el filtro</button>
        </div>
      }

      <section aria-label="Lugares" class="lugares" data-accion="elegir-lugar crear-caso">
        @for (l of filtrados(); track l.id) {
          <article class="tarjeta lugar" [class.pronto]="!l.completo">
            @if (l.portada) {
              <img class="pixel portada" [src]="l.portada" alt="" width="960" height="528" />
            }
            <div class="cuerpo">
              <div class="nombre">
                <h2>{{ l.nombre }}</h2>
                @if (!l.completo) { <span class="pildora">Pronto</span> }
              </div>
              @if (l.completo) {
                <p class="texto-secundario">{{ l.salas }} salas</p>
              } @else {
                <p class="texto-secundario">En preparación · unas 8 salas</p>
              }
              <p>{{ l.descripcion }}</p>
              <p class="temas">
                @for (t of l.temas; track t) { <span class="pildora">{{ nombreTema(t) }}</span> }
              </p>
              @if (l.completo) {
                <a class="boton boton-primario" [routerLink]="rutas.a('/salas')" [queryParams]="{ lugar: l.id }"
                   [attr.aria-label]="'Elegir este lugar: ' + l.nombre">Elegir este lugar</a>
              } @else {
                <p class="texto-secundario">Disponible más adelante. Mientras tanto, la universidad sirve para orientación inicial y bienestar.</p>
              }
            </div>
          </article>
        }
      </section>
      <a [routerLink]="rutas.a('/')" class="boton boton-texto">Volver a Mis casos</a>
    </div>
  `,
  styles: `
    .titulo { display: flex; flex-direction: column; gap: 0.25rem; }
    .titulo h1 { margin: 0; }
    .titulo p { margin: 0; max-inline-size: 48rem; }
    /* El filtro es una sola fila de fichas (se parte en renglones si no caben): el título del grupo va en la misma línea. */
    .filtro { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); margin-inline-end: 0.25rem; }
    .ficha { min-height: 2.75rem; border-radius: 999px; }
    .boton[aria-pressed='true'] { background: var(--primario-tinte); border-color: var(--primario); color: var(--primario-oscuro); }
    .estado { margin: 0; }
    .aviso-filtro { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
    .aviso-filtro p { margin: 0; flex: 1 1 20rem; }
    /* Las tarjetas se reparten el ancho: a 1440 caben los cuatro lugares sin bajar; a 390, uno por renglón. */
    .lugares { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr)); gap: 1rem; align-items: stretch; }
    .lugar { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; min-inline-size: 0; }
    .lugar.pronto { background: var(--fondo-hundido); }
    .portada { inline-size: 100%; block-size: auto; aspect-ratio: 960 / 528; object-fit: cover; border-radius: var(--radio-control); border: 1px solid var(--linea); }
    .cuerpo { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; min-inline-size: 0; padding-inline: 0.25rem; }
    .cuerpo p { margin: 0; }
    /* El botón queda siempre al pie de la tarjeta: las «Elegir este lugar» quedan alineadas aunque las descripciones difieran. */
    .cuerpo .boton { align-self: stretch; margin-block-start: auto; }
    .nombre { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; }
    .nombre h2 { margin: 0; }
    .temas { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  `,
})
export class LugarComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly biblioteca = inject(BibliotecaService);
  protected readonly temas = TEMAS;
  protected readonly nombreTema = nombreTema;
  protected readonly lugares = signal<LugarResumen[]>([]);
  protected readonly tema = signal<string | null>(null);
  /** Los lugares no se pudieron leer. */
  protected readonly fallo = signal(false);

  protected readonly filtrados = computed(() => {
    const t = this.tema();
    return this.lugares().filter((l) => !t || l.temas.includes(t));
  });
  protected readonly hayDisponibles = computed(() => this.filtrados().some((l) => l.completo));
  protected readonly estado = computed(() => {
    const total = this.filtrados().length;
    const listos = this.filtrados().filter((l) => l.completo).length;
    if (!this.lugares().length) return 'Cargando lugares…';
    return `${total} ${total === 1 ? 'lugar' : 'lugares'} · ${listos} ${listos === 1 ? 'disponible' : 'disponibles'} ahora`;
  });

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.fallo.set(false);
    this.biblioteca.lugares().then((l) => this.lugares.set(l)).catch(() => this.fallo.set(true));
  }
}
