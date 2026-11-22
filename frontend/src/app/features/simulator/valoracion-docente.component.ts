import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormativeLevel, OwnerEvaluation } from '../../core/models/simulation.model';

@Component({
  selector: 'app-valoracion-docente',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="valoracion" aria-label="Retroalimentación docente">
      @if (valoracion(); as actual) {
        <div class="valoracion__general">
          <h3>Comentario general</h3>
          <p>{{ actual.comment.trim() || 'Sin comentario general.' }}</p>
        </div>
        <div class="valoracion__global">
          <h3>Nivel global</h3>
          <p>{{ actual.overallLevel ? niveles[actual.overallLevel] : 'Sin nivel global' }}</p>
        </div>
        @if (actual.criteria.length) {
          <div class="valoracion__criterios">
            <h3>Por criterio</h3>
            <ul>
              @for (criterio of actual.criteria; track $index) {
                <li>
                  <div class="valoracion__cabecera">
                    <h4>{{ criterio.title }}</h4>
                    <span class="valoracion__nivel">{{ criterio.level ? niveles[criterio.level] : 'Sin nivel' }}</span>
                  </div>
                  @if (criterio.level && criterio.descriptor?.trim()) {
                    <p class="valoracion__descriptor">{{ criterio.descriptor }}</p>
                  }
                  <p><strong>Observación:</strong> {{ criterio.comment.trim() || 'Sin observación para este criterio.' }}</p>
                </li>
              }
            </ul>
          </div>
        }
      } @else {
        <p class="valoracion__espera">Cuando tu docente revise tu recorrido, su retroalimentación aparecerá aquí.</p>
      }
    </section>
  `,
  styles: [`
    :host { display: block; min-inline-size: 0; }
    .valoracion { display: grid; gap: var(--ds-space-5); min-inline-size: 0; color: var(--ds-text-1); overflow-wrap: anywhere; }
    h3, h4, p { margin: 0; }
    h3 { font-size: var(--ds-type-h3-size); color: var(--ds-text-1); }
    h4 { font-size: inherit; font-weight: 600; color: var(--ds-text-1); }
    p { line-height: 1.6; white-space: pre-wrap; }
    .valoracion__general, .valoracion__global, .valoracion__criterios { display: grid; gap: var(--ds-space-2); min-inline-size: 0; }
    .valoracion__general { padding: var(--ds-space-4); border-inline-start: var(--l-pixel, 2px) solid var(--ds-primary); background: var(--l-superficie-hundida, var(--ds-surface-2)); border-radius: var(--ds-radius-md); }
    /* El nivel va en una pastilla neutra: sin rojo y sin orden de peor a mejor, el tono es formativo. */
    .valoracion__global p, .valoracion__nivel { inline-size: fit-content; max-inline-size: 100%; padding: var(--ds-space-1) var(--ds-space-3); border: 1px solid var(--ds-border); border-radius: 999px; background: var(--l-superficie-hundida, var(--ds-surface-2)); font-weight: 600; }
    ul { display: grid; gap: var(--ds-space-3); list-style: none; margin: 0; padding: 0; }
    li { display: grid; gap: var(--ds-space-2); min-inline-size: 0; padding: var(--ds-space-4); border: 1px solid var(--ds-border); border-radius: var(--ds-radius-md); background: var(--l-superficie, var(--ds-surface-1)); }
    .valoracion__cabecera { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ds-space-2) var(--ds-space-3); min-inline-size: 0; }
    .valoracion__espera { padding: var(--ds-space-4); border: 1px dashed var(--ds-border); border-radius: var(--ds-radius-md); color: var(--ds-text-2); }
    .valoracion__descriptor { color: var(--ds-text-2); }
    @media (forced-colors: active) { li, .valoracion__general { border: 1px solid CanvasText; } }
  `],
})
export class ValoracionDocenteComponent {
  readonly valoracion = input<OwnerEvaluation['evaluations'][number] | null>(null);

  // El contrato envía claves, pero la persona debe leer siempre palabras.
  protected readonly niveles: Record<FormativeLevel, string> = {
    EN_INICIO: 'En inicio', EN_PROCESO: 'En proceso', LOGRADO: 'Logrado', DESTACADO: 'Destacado',
  };
}
