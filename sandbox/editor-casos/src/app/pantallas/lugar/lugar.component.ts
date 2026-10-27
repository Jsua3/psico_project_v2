import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BibliotecaService, type LugarResumen } from '../../modelo/biblioteca.service';
import { TEMAS, nombreTema } from '../../modelo/textos';
import { PasosCrearComponent } from '../pasos-crear.component';

/** Paso 1 de crear un caso (tablero 23): elegir el lugar donde pasa. */
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

      <div class="filtro">
        <span id="ftema" class="etiqueta">Filtrar por tema</span>
        <div role="group" aria-labelledby="ftema" class="acciones">
          <button type="button" class="boton" [attr.aria-pressed]="tema() === null" (click)="tema.set(null)">Todos los temas</button>
          @for (t of temas; track t.id) {
            <button type="button" class="boton" [attr.aria-pressed]="tema() === t.id" (click)="tema.set(t.id)">{{ t.nombre }}</button>
          }
        </div>
      </div>

      <p role="status" class="texto-secundario">{{ estado() }}</p>

      @if (filtrados().length && !hayDisponibles()) {
        <div class="tarjeta aviso-filtro">
          <p>Con este tema solo hay lugares que llegan pronto. Por ahora puedes quitar el filtro y usar la universidad.</p>
          <button type="button" class="boton" (click)="tema.set(null)">Quitar el filtro</button>
        </div>
      }

      <section aria-label="Lugares" class="lugares" data-accion="elegir-lugar">
        @for (l of filtrados(); track l.id) {
          <article class="tarjeta lugar" [class.pronto]="!l.completo">
            @if (l.miniaturas?.length) {
              <img class="pixel portada" [src]="l.miniaturas![0]" alt="" width="960" height="528" />
            }
            <div class="cuerpo">
              <div class="nombre">
                <h2>{{ l.nombre }}</h2>
                @if (!l.completo) { <span class="pildora">Pronto</span> }
              </div>
              @if (l.completo) {
                <p class="texto-secundario">{{ l.salas }} salas · {{ l.recorridos }} recorridos sugeridos · {{ l.personajes }} personajes</p>
              } @else {
                <p class="texto-secundario">En preparación · unas 8 salas</p>
              }
              <p>{{ l.descripcion }}</p>
              <p class="temas">
                @for (t of l.temas ?? []; track t) { <span class="pildora">{{ nombreTema(t) }}</span> }
              </p>
              @if (l.completo) {
                <div class="miniaturas">
                  @for (m of l.miniaturas!.slice(1); track m) {
                    <img class="pixel" [src]="m" alt="" width="960" height="528" />
                  }
                </div>
                <a class="boton boton-primario" routerLink="/salas" [queryParams]="{ lugar: l.id }"
                   [attr.aria-label]="'Elegir este lugar: ' + l.nombre">Elegir este lugar</a>
              } @else {
                <p class="texto-secundario">Disponible más adelante. Mientras tanto, la universidad sirve para orientación inicial y bienestar.</p>
              }
            </div>
          </article>
        }
      </section>
      <a routerLink="/" class="boton boton-texto">Volver a Mis casos</a>
    </div>
  `,
  styles: `
    .titulo { display: flex; flex-direction: column; gap: 4px; }
    .titulo p { margin: 0; max-width: 760px; }
    .filtro { display: flex; flex-direction: column; gap: 8px; }
    .etiqueta { font-weight: 700; font-size: 16px; }
    .boton[aria-pressed='true'] { background: var(--primario-tinte); border-color: var(--primario); color: var(--primario-oscuro); }
    .aviso-filtro { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .aviso-filtro p { margin: 0; flex: 1 1 320px; }
    .lugares { display: flex; flex-direction: column; gap: 16px; }
    .lugar { display: flex; flex-wrap: wrap; gap: 16px 24px; }
    .lugar.pronto { background: var(--fondo-hundido); }
    .portada { width: 320px; max-width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--linea); align-self: flex-start; }
    .cuerpo { flex: 1 1 360px; display: flex; flex-direction: column; gap: 8px; }
    .cuerpo p { margin: 0; }
    .cuerpo .boton { align-self: flex-start; }
    .nombre { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
    .nombre h2 { margin: 0; }
    .temas { display: flex; flex-wrap: wrap; gap: 6px; }
    .miniaturas { display: flex; flex-wrap: wrap; gap: 8px; }
    .miniaturas img { width: 120px; height: auto; border-radius: 8px; border: 1px solid var(--linea); }
  `,
})
export class LugarComponent {
  private readonly biblioteca = inject(BibliotecaService);
  protected readonly temas = TEMAS;
  protected readonly nombreTema = nombreTema;
  protected readonly lugares = signal<LugarResumen[]>([]);
  protected readonly tema = signal<string | null>(null);

  protected readonly filtrados = computed(() => {
    const t = this.tema();
    return this.lugares().filter((l) => !t || (l.temas ?? []).includes(t));
  });
  protected readonly hayDisponibles = computed(() => this.filtrados().some((l) => l.completo));
  protected readonly estado = computed(() => {
    const total = this.filtrados().length;
    const listos = this.filtrados().filter((l) => l.completo).length;
    if (!this.lugares().length) return 'Cargando lugares…';
    return `${total} ${total === 1 ? 'lugar' : 'lugares'} · ${listos} ${listos === 1 ? 'disponible' : 'disponibles'} ahora`;
  });

  constructor() {
    void this.biblioteca.lugares().then((l) => this.lugares.set(l));
  }
}
