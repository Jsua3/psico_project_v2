import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { BriefUpdateRequest, CharacterEditorState } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiIconButton } from '../../shared/ui/button/ui-icon-button';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';

/** Los topes del servidor para la ficha (E3-4): el campo los dice, no se recortan en silencio al pegar. */
const MAX_CONTEXT = 4000;
const MAX_OBJECTIVES = 12;
const MAX_OBJECTIVE_LENGTH = 280;

export type BriefForm = FormGroup<{ context: FormControl<string>; objectives: FormControl<string> }>;

/** Los objetivos escritos (uno por línea) como lista: sin espacios sobrantes ni renglones vacíos. */
export function parseObjectives(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/** El formulario de la ficha, con lo que el servidor guarda: lo construye la pantalla del editor y lo recibe este componente. */
export function buildBriefForm(context: string, objectives: readonly string[]): BriefForm {
  return new FormGroup({
    context: new FormControl(context, { nonNullable: true, validators: [Validators.maxLength(MAX_CONTEXT)] }),
    objectives: new FormControl(objectives.join('\n'), { nonNullable: true }),
  });
}

/**
 * «Ficha» del editor de casos (plan visual F10-3†; E3-3, E3-4, RF-07, RF-16, CU-04): el contexto y los objetivos de
 * aprendizaje que la persona lee antes de empezar, y el catálogo de personajes del caso. El formulario es de la pantalla
 * (una pestaña inactiva se destruye, y con ella lo escrito sin guardar); aquí se presenta y, al guardar, se validan los
 * topes del servidor (contexto de 4.000 caracteres, hasta 12 objetivos de 280) en el campo que los rompe, con el foco en
 * él y sin enviar nada. Los personajes los crea y edita la hoja de la pantalla; aquí solo se listan. Una versión que no
 * es borrador (`lockReason`) deja leer la ficha pero no cambiarla.
 */
@Component({
  selector: 'app-case-brief-editor',
  imports: [ReactiveFormsModule, UiBadge, UiButton, UiControl, UiField, UiIconButton],
  // Eager: los errores de los campos salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <form class="cb-form" [formGroup]="form()" novalidate (ngSubmit)="submit()">
      <ui-field label="Contexto del caso" hint="Lo que lee la persona antes de empezar. Texto plano, hasta 4.000 caracteres." [error]="contextError()">
        <textarea uiControl rows="6" formControlName="context" [readOnly]="!!lockReason()"></textarea>
      </ui-field>
      <ui-field label="Objetivos de aprendizaje" [error]="objectivesError()"
        hint="Uno por línea, hasta 12 de 280 caracteres cada uno. Los redacta Psicología.">
        <textarea uiControl rows="5" formControlName="objectives" [readOnly]="!!lockReason()"></textarea>
      </ui-field>
      <div class="cb-actions">
        <button ui-button type="submit" icon="save" [loading]="busy()" [disabledReason]="lockReason()">Guardar ficha</button>
      </div>
    </form>

    <section class="cb-characters" aria-labelledby="cb-characters-title">
      <div class="cb-characters__head">
        <h3 class="cb-characters__title" id="cb-characters-title">Personajes</h3>
        <button ui-button type="button" variant="secondary" icon="add" data-cb-add [disabledReason]="lockReason()"
          (click)="characterCreate.emit()">Agregar personaje</button>
      </div>
      <p class="cb-note">Los que se marcan salen en la ficha antes de empezar; los demás se descubren jugando.</p>
      @if (characters().length) {
        <ul class="cb-list">
          @for (item of characters(); track item.id) {
            <li class="cb-character">
              <span class="cb-character__text">
                <strong class="cb-character__name">{{ item.displayName }}</strong>
                @if (meta(item); as detail) {
                  <span class="cb-character__meta">{{ detail }}</span>
                }
              </span>
              <ui-badge [tone]="item.showInBrief ? 'info' : 'neutral'">{{ item.showInBrief ? 'En la ficha' : 'Se descubre jugando' }}</ui-badge>
              <span class="cb-character__actions">
                <button ui-icon-button type="button" icon="edit" [disabledReason]="lockReason()"
                  [label]="'Editar a «' + item.displayName + '»'" (click)="characterEdit.emit(item)"></button>
                <button ui-icon-button type="button" icon="delete_outline" [disabledReason]="lockReason()"
                  [label]="'Eliminar a «' + item.displayName + '»'" (click)="remove(item)"></button>
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="cb-note">Aún no hay personajes. Agrega el primero para que aparezca en la ficha del caso.</p>
      }
    </section>
  `,
  styles: [`
    :host { display: grid; gap: var(--ds-space-6); }
    .cb-form { display: grid; gap: var(--ds-space-4); max-inline-size: 48rem; }
    .cb-actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-3); }
    .cb-characters { display: grid; gap: var(--ds-space-3); }
    .cb-characters__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ds-space-3); }
    .cb-characters__title { margin: 0; font-size: var(--ds-type-h3-size); line-height: var(--ds-type-h3-line); }
    .cb-note { margin: 0; color: var(--ds-text-2); }
    .cb-list { display: grid; gap: var(--ds-space-3); margin: 0; padding: 0; list-style: none; }
    .cb-character {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--ds-space-2) var(--ds-space-3);
      padding: var(--ds-space-3) var(--ds-space-4);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
    }
    .cb-character__text { display: grid; gap: var(--ds-space-1); min-width: 0; overflow-wrap: anywhere; }
    .cb-character__meta { color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line); }
    .cb-character__actions { display: flex; gap: var(--ds-space-1); grid-column: 1 / -1; justify-content: flex-end; }
  `],
})
export class CaseBriefEditorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  /** El formulario de la ficha: es de la pantalla del editor, que lo conserva aunque esta pestaña se destruya. */
  readonly form = input.required<BriefForm>();
  readonly characters = input<CharacterEditorState[]>([]);
  /** Por qué el caso no se puede modificar (versión que no es borrador); null si se puede. */
  readonly lockReason = input<string | null>(null);
  readonly busy = input(false);
  /** El contexto y los objetivos, ya limpios y dentro de los topes del servidor. */
  readonly saveBrief = output<BriefUpdateRequest>();
  readonly characterCreate = output<void>();
  readonly characterEdit = output<CharacterEditorState>();
  readonly characterRemove = output<CharacterEditorState>();

  protected readonly objectivesError = signal<string | null>(null);
  /** Se pidió quitar un personaje: cuando la lista se acorte, el foco va a «Agregar personaje» (la fila con el botón se va). */
  private removing = false;

  constructor() {
    effect(onCleanup => {
      const subscription = this.form().controls.objectives.valueChanges.subscribe(() => this.objectivesError.set(null));
      onCleanup(() => subscription.unsubscribe());
    });
    let known = this.characters().length;
    effect(() => {
      const count = this.characters().length;
      const shrank = untracked(() => this.removing) && count < known;
      known = count;
      if (!shrank) return;
      this.removing = false;
      afterNextRender(() => this.host.querySelector<HTMLElement>('[data-cb-add]')?.focus(), { injector: this.injector });
    });
  }

  protected contextError(): string | null {
    const control = this.form().controls.context;
    return control.touched && control.errors?.['maxlength'] ? `Admite hasta ${MAX_CONTEXT.toLocaleString('es-CO')} caracteres.` : null;
  }

  protected meta(item: CharacterEditorState): string {
    return [item.roleLabel, item.portraitKey ? `retrato ${item.portraitKey}` : ''].filter(Boolean).join(' · ');
  }

  protected remove(item: CharacterEditorState): void {
    this.removing = true;
    this.characterRemove.emit(item);
  }

  protected submit(): void {
    if (this.lockReason() || this.busy()) return;
    const form = this.form();
    form.markAllAsTouched();
    const objectives = parseObjectives(form.controls.objectives.value);
    const error = objectives.length > MAX_OBJECTIVES
      ? `Un caso admite hasta ${MAX_OBJECTIVES} objetivos de aprendizaje.`
      : objectives.some(item => item.length > MAX_OBJECTIVE_LENGTH) ? `Cada objetivo admite hasta ${MAX_OBJECTIVE_LENGTH} caracteres.` : null;
    this.objectivesError.set(error);
    if (error || form.controls.context.invalid) {
      // Tras pintar los errores, el foco va al primer campo inválido (teclado y lector llegan al problema).
      afterNextRender(() => this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    this.saveBrief.emit({ context: form.controls.context.value.trim(), learningObjectives: objectives });
  }
}
