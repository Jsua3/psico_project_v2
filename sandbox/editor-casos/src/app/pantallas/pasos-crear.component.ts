import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Indicador «Paso 1 de 2» al crear un caso (tableros 23 y 24). */
@Component({
  selector: 'app-pasos-crear',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Pasos para crear el caso" class="pasos">
      <p class="texto-secundario">Paso {{ paso() }} de 2</p>
      <ol>
        <li [attr.aria-current]="paso() === 1 ? 'step' : null" [class.hecho]="paso() > 1">
          <span class="numero" aria-hidden="true">{{ paso() > 1 ? '✓' : '1' }}</span>
          <span>Elegir un lugar{{ paso() > 1 ? ' (hecho)' : '' }}</span>
        </li>
        <li [attr.aria-current]="paso() === 2 ? 'step' : null">
          <span class="numero" aria-hidden="true">2</span>
          <span>Elegir salas y recorrido</span>
        </li>
      </ol>
    </nav>
  `,
  styles: `
    .pasos { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; }
    .pasos p { margin: 0; font-size: 16px; }
    ol { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; padding: 0; list-style: none; }
    li { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; color: var(--texto-secundario); }
    li[aria-current='step'] { color: var(--tinta); font-weight: 700; }
    .numero {
      display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px;
      border: 2px solid var(--borde-control); background: var(--superficie); font-weight: 700;
    }
    li[aria-current='step'] .numero { background: var(--primario); border-color: var(--primario); color: #fff; }
    li.hecho .numero { background: var(--adecuada-tinte); border-color: var(--adecuada-borde); color: var(--adecuada); }
  `,
})
export class PasosCrearComponent {
  readonly paso = input.required<1 | 2>();
}
