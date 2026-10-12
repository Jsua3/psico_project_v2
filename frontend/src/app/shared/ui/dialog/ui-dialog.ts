import { addAriaReferencedId, removeAriaReferencedId } from '@angular/cdk/a11y';
import { DIALOG_DATA, Dialog, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, Injectable, Injector, booleanAttribute, effect,
  inject, input,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { uniqueUiId } from '../button/click-guard';
import { UiButton } from '../button/ui-button';
import { UiIconButton } from '../button/ui-icon-button';

/** Duración de la salida de diálogos y hojas (§2.7: 160–200 ms). */
const UI_DIALOG_LEAVE_MS = 180;

/**
 * Foco inicial por defecto: el primer control del cuerpo o, si no hay, el de las acciones; nunca el botón de cerrar
 * del encabezado. Sin coincidencias, el CDK enfoca el propio diálogo.
 */
const DEFAULT_AUTOFOCUS = '[data-autofocus], .ui-dialog-frame__body :is(input, select, textarea, button, a[href]), '
  + '.ui-dialog-frame__actions button';

export type UiDialogSize = 'sm' | 'md' | 'lg';

export interface UiDialogOptions<D = unknown> {
  data?: D;
  /** Solo si el diálogo no usa `ui-dialog-frame` (que lo nombra con su título). */
  ariaLabel?: string;
  size?: UiDialogSize;
}

export interface UiSheetOptions<D = unknown> extends UiDialogOptions<D> {
  side: 'bottom' | 'end';
}

export interface UiConsequenceOptions {
  title: string;
  /** Qué se pierde si se sigue adelante, dicho sin rodeos. */
  consequence: string;
  /** La acción segura y por defecto («Continuar mi intento»). */
  continueLabel: string;
  /** La acción que asume la consecuencia («Iniciar uno nuevo»). */
  proceedLabel: string;
}

export type UiConsequenceAnswer = 'continue' | 'proceed';

export interface UiConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

/** Contrato interno del contenedor del CDK para nombrar el diálogo por su título. */
interface LabelledContainer {
  _addAriaLabelledBy?(id: string): void;
  _removeAriaLabelledBy?(id: string): void;
}

/** Marca las acciones del pie del marco: `<button ui-button uiDialogActions …>`. */
@Directive({ selector: '[uiDialogActions]' })
export class UiDialogActions {}

/**
 * Marco de diálogo y hoja (plan visual F2-7): título (`h2`, nombra el diálogo), descripción opcional (lo describe),
 * botón de cerrar opcional, cuerpo y acciones al pie. Se registra en el contenedor del CDK, así el contenido no tiene
 * que conocer ids.
 */
@Component({
  selector: 'ui-dialog-frame',
  imports: [UiIconButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-dialog-frame', '[attr.title]': 'null' },
  template: `
    <header class="ui-dialog-frame__header">
      <h2 class="ui-dialog-frame__title" [id]="titleId">{{ title() }}</h2>
      @if (dismissible()) {
        <button ui-icon-button class="ui-dialog-frame__close" icon="close" label="Cerrar" (click)="close()"></button>
      }
    </header>
    @if (description()) {
      <p class="ui-dialog-frame__description" [id]="descriptionId">{{ description() }}</p>
    }
    <div class="ui-dialog-frame__body"><ng-content /></div>
    <footer class="ui-dialog-frame__actions"><ng-content select="[uiDialogActions]" /></footer>
  `,
  styleUrl: './ui-dialog-frame.scss',
})
export class UiDialogFrame {
  readonly title = input.required<string>();
  readonly description = input<string | null | undefined>(null);
  readonly dismissible = input(true, { transform: booleanAttribute });

  protected readonly titleId = uniqueUiId('ui-dialog-title');
  protected readonly descriptionId = uniqueUiId('ui-dialog-description');
  private readonly ref = inject(DialogRef, { optional: true });

  constructor() {
    const container = this.ref?.containerInstance as LabelledContainer | undefined;
    container?._addAriaLabelledBy?.(this.titleId);
    inject(DestroyRef).onDestroy(() => container?._removeAriaLabelledBy?.(this.titleId));
    // La descripción va directo al atributo del contenedor: su enlace (config.ariaDescribedBy) sigue en null y no la
    // pisa; cambiar la configuración en plena detección de cambios daría NG0100.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect(onCleanup => {
      const container = this.description() ? host.closest('.cdk-dialog-container') : null;
      if (!container) return;
      addAriaReferencedId(container, 'aria-describedby', this.descriptionId);
      onCleanup(() => removeAriaReferencedId(container, 'aria-describedby', this.descriptionId));
    });
  }

  protected close(): void {
    this.ref?.close();
  }
}

/** Confirmación (plan visual F2-7): `alertdialog`; en peligro el botón es rojo y el foco empieza en «Cancelar». */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="data.title" [description]="data.message" [dismissible]="false">
      <button ui-button uiDialogActions type="button" variant="secondary" class="ui-confirm__cancel"
        (click)="ref.close(false)">{{ data.cancelLabel ?? 'Cancelar' }}</button>
      <button ui-button uiDialogActions type="button" class="ui-confirm__confirm"
        [variant]="data.tone === 'danger' ? 'danger' : 'primary'" (click)="ref.close(true)">{{ data.confirmLabel }}</button>
    </ui-dialog-frame>
  `,
})
export class UiConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<UiConfirmOptions>(DIALOG_DATA);
}

/**
 * Confirmación que nombra la consecuencia (plan visual F2-11; RN-07): «Continuar» es primaria, tiene el foco y es
 * lo que devuelven Esc y el fondo; la otra acción asume la pérdida que se describe. NO se usa para la Salida segura
 * (REGLA-004: salir nunca pide confirmación).
 */
@Component({
  selector: 'ui-consequence-dialog',
  imports: [UiDialogFrame, UiDialogActions, UiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="data.title" [description]="data.consequence" [dismissible]="false">
      <button ui-button uiDialogActions type="button" variant="secondary" class="ui-consequence__proceed"
        (click)="ref.close('proceed')">{{ data.proceedLabel }}</button>
      <button ui-button uiDialogActions type="button" class="ui-consequence__continue"
        (click)="ref.close('continue')">{{ data.continueLabel }}</button>
    </ui-dialog-frame>
  `,
})
export class UiConsequenceDialog {
  protected readonly ref = inject<DialogRef<UiConsequenceAnswer>>(DialogRef);
  protected readonly data = inject<UiConsequenceOptions>(DIALOG_DATA);
}

/**
 * Diálogos del lenguaje visual (plan visual F2-7) sobre `@angular/cdk/dialog`: modales con trampa de foco, foco
 * inicial dentro, Esc y fondo cierran, el foco VUELVE al disparador, `aria-modal`, entrada y salida animadas
 * (interrumpibles; sin animación con movimiento reducido). `open` (diálogo centrado), `sheet` (hoja inferior o
 * lateral), `confirm` (promesa de sí o no) y `consequence` (continuar o asumir la pérdida, F2-11).
 */
@Injectable({ providedIn: 'root' })
export class UiDialog {
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  open<R = unknown, D = unknown, C = unknown>(component: ComponentType<C>, options: UiDialogOptions<D> = {}): DialogRef<R, C> {
    return this.launch<R, D, C>(component, options, {
      panelClass: ['ui-dialog-pane', `ui-dialog-pane--${options.size ?? 'md'}`],
    });
  }

  sheet<R = unknown, D = unknown, C = unknown>(component: ComponentType<C>, options: UiSheetOptions<D>): DialogRef<R, C> {
    const position = createGlobalPositionStrategy(this.injector);
    return this.launch<R, D, C>(component, options, {
      panelClass: ['ui-sheet-pane', `ui-sheet-pane--${options.side}`],
      positionStrategy: options.side === 'bottom'
        ? position.bottom('0').centerHorizontally()
        : position.top('0').end('0'),
    });
  }

  confirm(options: UiConfirmOptions): Promise<boolean> {
    const ref = this.launch<boolean, UiConfirmOptions, UiConfirmDialog>(UiConfirmDialog, { data: options }, {
      role: 'alertdialog',
      panelClass: ['ui-dialog-pane', 'ui-dialog-pane--sm'],
      autoFocus: options.tone === 'danger' ? '.ui-confirm__cancel' : '.ui-confirm__confirm',
    });
    return firstValueFrom(ref.closed).then(result => result === true);
  }

  consequence(options: UiConsequenceOptions): Promise<UiConsequenceAnswer> {
    const ref = this.launch<UiConsequenceAnswer, UiConsequenceOptions, UiConsequenceDialog>(UiConsequenceDialog, { data: options }, {
      role: 'alertdialog',
      panelClass: ['ui-dialog-pane', 'ui-dialog-pane--sm'],
      autoFocus: '.ui-consequence__continue',
    });
    return firstValueFrom(ref.closed).then(result => (result === 'proceed' ? 'proceed' : 'continue'));
  }

  private launch<R, D, C>(component: ComponentType<C>, options: UiDialogOptions<D>, extra: Partial<DialogConfig<D, DialogRef<R, C>>>): DialogRef<R, C> {
    const reduceMotion = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let leaving = false;
    let mayClose = reduceMotion;
    const ref: DialogRef<R, C> = this.dialog.open<R, D, C>(component, {
      data: options.data,
      ariaLabel: options.ariaLabel ?? null,
      ariaModal: true,
      autoFocus: DEFAULT_AUTOFOCUS,
      restoreFocus: true,
      backdropClass: 'ui-dialog-backdrop',
      // Salida animada: el primer intento de cierre arranca la animación y el cierre real llega al terminar.
      closePredicate: (result: unknown) => {
        if (mayClose) return true;
        if (!leaving) {
          leaving = true;
          ref.overlayRef.overlayElement.classList.add('ui-overlay--leaving');
          ref.overlayRef.backdropElement?.classList.add('ui-overlay--leaving');
          setTimeout(() => {
            mayClose = true;
            ref.close(result as R);
          }, UI_DIALOG_LEAVE_MS);
        }
        return false;
      },
      ...extra,
    });
    return ref;
  }
}
