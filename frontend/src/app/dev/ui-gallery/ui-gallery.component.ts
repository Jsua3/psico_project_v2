import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton, UiButtonSize, UiButtonVariant } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiCheck, UiSwitch } from '../../shared/ui/field/ui-check';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiLink } from '../../shared/ui/link/ui-link';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiStat } from '../../shared/ui/stat/ui-stat';

/**
 * Galería de la biblioteca `shared/ui` (plan visual F0-4 y F2-9; VD-11): cada componente en todos sus estados y en
 * las dos pieles. Solo existe en desarrollo: la ruta va tras `ngDevMode` (ver `app.routes.ts`) y
 * `scripts/ui/check-dist-dev-only.mjs` comprueba que no llegue al build de producción. La matriz es UNA plantilla
 * que se pinta dentro de cada piel (`data-skin`), así las dos muestran exactamente lo mismo.
 */
@Component({
  selector: 'app-ui-gallery',
  standalone: true,
  imports: [
    NgTemplateOutlet, UiBadge, UiButton, UiCard, UiCheck, UiControl, UiField, UiIconButton, UiLink, UiPageHeader, UiSection,
    UiStat, UiSwitch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main-content" class="ui-gallery" tabindex="-1">
      <ui-page-header eyebrow="Solo en desarrollo" title="Galería de componentes"
        description="Cada componente de shared/ui en todos sus estados y en las dos pieles." />
      @for (skin of skins; track skin.id) {
        <section class="ui-gallery__skin" [attr.data-skin]="skin.id" [attr.aria-labelledby]="'piel-' + skin.id">
          <h2 [id]="'piel-' + skin.id">Piel {{ skin.label }}</h2>
          <ng-container [ngTemplateOutlet]="matrix" [ngTemplateOutletContext]="{ $implicit: skin.id }" />
        </section>
      }
    </main>

    <ng-template #matrix let-skin>
      <ui-section title="Botones" [level]="3">
        <div class="ui-gallery__row">
          @for (variant of variants; track variant.id) {
            <button ui-button type="button" [variant]="variant.id" icon="save">{{ variant.label }}</button>
          }
        </div>
        <div class="ui-gallery__row">
          @for (size of sizes; track size.id) {
            <button ui-button type="button" variant="secondary" [size]="size.id" iconEnd="arrow_forward">{{ size.label }}</button>
          }
        </div>
        <div class="ui-gallery__row">
          <button ui-button type="button" disabledReason="Completa correo y contraseña para continuar">Con motivo</button>
          <button ui-button type="button" [loading]="true" icon="save">Guardando</button>
          <button ui-button type="button" variant="secondary" [loading]="true">Enviando</button>
          <a ui-button variant="ghost" href="#main-content">Enlace con forma de botón</a>
        </div>
        <div class="ui-gallery__row">
          <button ui-icon-button type="button" icon="close" label="Cerrar"></button>
          <button ui-icon-button type="button" icon="edit" label="Editar" variant="secondary"></button>
          <button ui-icon-button type="button" icon="delete" label="Borrar" variant="danger"></button>
          <button ui-icon-button type="button" icon="undo" label="Deshacer" disabledReason="No hay nada que deshacer"></button>
        </div>
        <p class="ui-gallery__row">
          Lee la <a ui-link href="#main-content">ayuda del simulador</a> o llama a la
          <a ui-link external href="https://www.minsalud.gov.co">línea de atención</a>.
        </p>
      </ui-section>

      <ui-section title="Campos" [level]="3">
        <div class="ui-gallery__grid">
          <ui-field label="Correo institucional" hint="El que te dio la universidad" required>
            <input uiControl type="email" autocomplete="off" placeholder="nombre@unal.edu.co" />
          </ui-field>
          <ui-field label="Usuario" error="Ese usuario ya existe: prueba con otro">
            <input uiControl autocomplete="off" value="ana.r" />
          </ui-field>
          <ui-field label="Contraseña" hint="Al menos 8 caracteres" revealable>
            <input uiControl type="password" autocomplete="off" value="secreta1" />
          </ui-field>
          <ui-field label="Código del grupo" hint="Lo asigna tu docente">
            <input uiControl disabled value="PSI-2026-1" />
          </ui-field>
          <ui-field label="Rol">
            <select uiControl><option>Estudiante</option><option>Docente</option><option>Administrador</option></select>
          </ui-field>
          <ui-field label="Comentario para el docente" hint="Máximo 500 caracteres">
            <textarea uiControl></textarea>
          </ui-field>
        </div>
        <div class="ui-gallery__row">
          <label ui-check><input type="checkbox" checked /> Recordarme en este equipo</label>
          <label ui-check><input type="checkbox" disabled /> Opción no disponible</label>
          <label ui-check><input type="radio" [name]="'modo-' + skin" checked /> Guiado</label>
          <label ui-check><input type="radio" [name]="'modo-' + skin" /> Libre</label>
          <label ui-check><input type="checkbox" uiSwitch checked /> Sonido</label>
          <label ui-check><input type="checkbox" uiSwitch /> Subtítulos</label>
        </div>
      </ui-section>

      <ui-section title="Contenido" [level]="3">
        <div class="ui-gallery__grid">
          <ui-card>
            <ui-stat label="Intentos completados" [value]="1234" hint="Últimos 30 días" />
          </ui-card>
          <ui-card>
            <ui-stat label="Mejor puntaje" value="9,5 / 10" />
          </ui-card>
          <a ui-card href="#main-content">
            <strong>Caso 3 · Crisis en urgencias</strong>
            <p>Tarjeta clicable como enlace.</p>
          </a>
          <button ui-card type="button">
            <strong>Retomar intento</strong>
            <p>Tarjeta clicable como botón.</p>
          </button>
        </div>
        <div class="ui-gallery__row">
          <ui-badge>Borrador</ui-badge>
          <ui-badge tone="info">En revisión</ui-badge>
          <ui-badge tone="success">Publicado</ui-badge>
          <ui-badge tone="warning">Por vencer</ui-badge>
          <ui-badge tone="danger">Cerrado</ui-badge>
        </div>
      </ui-section>
    </ng-template>
  `,
  styles: [`
    .ui-gallery { max-width: 72rem; margin: 0 auto; padding: var(--ds-space-6) var(--ds-space-4); }
    .ui-gallery:focus { outline: none; }
    .ui-gallery__skin {
      margin-block: var(--ds-space-5);
      padding: var(--ds-space-5);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-lg);
      background: var(--ds-surface-page);
      color: var(--ds-text-1);
    }
    .ui-gallery__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--ds-space-4); }
    .ui-gallery__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-3); margin-block: var(--ds-space-3); }
  `],
})
export class UiGalleryComponent {
  protected readonly skins = [
    { id: 'portal', label: 'portal' },
    { id: 'game', label: 'juego' },
  ] as const;
  protected readonly variants: readonly { id: UiButtonVariant; label: string }[] = [
    { id: 'primary', label: 'Primario' },
    { id: 'secondary', label: 'Secundario' },
    { id: 'ghost', label: 'Fantasma' },
    { id: 'danger', label: 'Peligro' },
  ];
  protected readonly sizes: readonly { id: UiButtonSize; label: string }[] = [
    { id: 'sm', label: 'Pequeño' },
    { id: 'md', label: 'Mediano' },
    { id: 'lg', label: 'Grande' },
  ];
}
