import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Estructura ligera compartida; el arte de la pantalla sin conexión no descarga recursos. */
@Component({
  selector: 'app-pagina-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="estado" [class.estado--sin-conexion]="tipo() === 'sin-conexion'">
      <!-- El arte decorativo sale del juego: la 404 es la puerta de salida y «sin permiso» la puerta del consultorio con su
           letrero. «Sin conexión» no descarga nada (no hay red): su firma es solo CSS. -->
      <div class="estado__arte" aria-hidden="true">
        @switch (tipo()) {
          @case ('no-encontrada') {
            <img class="estado__pixel" src="assets/game/doors/door_salida_institucional.png" width="132" height="222" alt="" />
          }
          @case ('sin-permiso') {
            <img class="estado__pixel" src="assets/game/doors/door_consultorio.png" width="117" height="222" alt="" />
            <img class="estado__pixel" src="assets/game/objects/object_acceso_restringido.png" width="45" height="84" alt="" />
          }
          @default { <span></span><span></span><span></span> }
        }
      </div>
      <p class="estado__firma" aria-hidden="true">SIEP</p>
      <h1>{{ titulo() }}</h1>
      <p>{{ texto() }}</p>
      @if (detalle()) { <p class="estado__detalle">{{ detalle() }}</p> }
      <div class="estado__acciones"><ng-content /></div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .estado { box-sizing: border-box; display: grid; justify-items: center; align-content: center;
      width: min(100%, 34rem); min-height: 55vh; margin-inline: auto; padding: var(--ds-space-6) var(--ds-space-4);
      text-align: center; color: var(--ds-text-1); overflow-wrap: anywhere; }
    .estado__arte { display: flex; align-items: end; gap: var(--ds-space-2); margin-bottom: var(--ds-space-5); }
    .estado__pixel { display: block; max-width: 100%; height: auto; image-rendering: pixelated; }
    .estado__arte span { width: 1rem; height: 1rem; background: var(--ds-primary); }
    .estado__arte span:nth-child(2) { height: 2rem; }
    .estado--sin-conexion .estado__arte span:last-child { box-sizing: border-box; background: transparent; border: 2px solid var(--ds-primary); }
    .estado__firma { color: var(--ds-primary); font-size: var(--ds-type-body-s-size); font-weight: var(--ds-type-h3-weight); }
    h1 { margin: var(--ds-space-2) 0; color: var(--ds-text-1); font-size: var(--ds-type-h1-size); line-height: var(--ds-type-h1-line); }
    p { max-width: 34rem; margin: var(--ds-space-2) 0; color: var(--ds-text-2); line-height: var(--ds-type-body-line); }
    .estado__acciones { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ds-space-3); margin-top: var(--ds-space-5); }
    @media (forced-colors: active) { .estado__arte span { border: 1px solid CanvasText; } }
  `],
})
export class PaginaEstadoComponent {
  readonly tipo = input.required<'no-encontrada' | 'sin-permiso' | 'sin-conexion' | 'error'>();
  readonly titulo = input.required<string>();
  readonly texto = input.required<string>();
  readonly detalle = input<string | null>(null);
}
