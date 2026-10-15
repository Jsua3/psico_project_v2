import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Signal, computed, inject } from '@angular/core';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import {
  CaseEditorView,
  ClinicalToolEditorState,
  DecisionEdgeState,
  MapEditorState,
  MapObjectEditorState,
  NodeEditorState,
} from '../../core/models/simulation.model';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { UiCheck } from '../../shared/ui/field/ui-check';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { objectTypeLabel } from '../../shared/ui/labels';
import { CLASSIFICATIONS, MAP_THEMES, OBJECT_TYPES, nodeOptionLabel, shorten } from './case-editor.options';

/** El formulario que la hoja presenta: qué se crea o edita (null = ninguno). */
export type EditorPanel =
  | { kind: 'node-create' }
  | { kind: 'node-edit'; node: NodeEditorState }
  | { kind: 'decision-create'; sourceNode?: NodeEditorState }
  | { kind: 'decision-edit'; edge: DecisionEdgeState }
  | { kind: 'map-create' }
  | { kind: 'map-edit'; map: MapEditorState }
  | { kind: 'object-create'; mapId: number }
  | { kind: 'object-edit'; obj: MapObjectEditorState }
  | { kind: 'tool-create' }
  | { kind: 'tool-edit'; tool: ClinicalToolEditorState }
  | null;

/**
 * Lo que la hoja necesita de la pantalla que la abre: los formularios y sus acciones. La pantalla
 * (`CaseEditorComponent`) es dueña de los formularios, de su validación y de guardar; la hoja solo los presenta
 * (mismo patrón que la hoja de usuarios, F7-6).
 */
export interface CaseEditorSheetHost {
  readonly panel: Signal<EditorPanel>;
  readonly editor: Signal<CaseEditorView | null>;
  readonly busy: Signal<boolean>;
  readonly nodeForm: FormGroup | null;
  readonly decisionForm: FormGroup | null;
  readonly mapForm: FormGroup | null;
  readonly objectForm: FormGroup | null;
  readonly toolForm: FormGroup | null;
  panelTitle(): string;
  fieldError(control: AbstractControl, message: string): string | null;
  save(): void;
  closePanel(): void;
}

export interface CaseEditorSheetData {
  host: CaseEditorSheetHost;
}

const EMPTY_GROUP = new FormGroup({});

const SAVE_LABELS: Record<string, string> = {
  node: 'Guardar nodo',
  decision: 'Guardar decisión',
  map: 'Guardar mapa',
  object: 'Guardar objeto',
  tool: 'Guardar herramienta',
};

/**
 * Formularios del editor de casos en una hoja lateral (plan F8-1): antes un panel `role="dialog"` sin foco inicial ni
 * Esc, a la derecha del contenido (y bajo él en pantallas estrechas). Es un diálogo de la biblioteca: trampa de foco,
 * foco inicial en el primer campo, Esc y retorno del foco al botón que lo abrió. Los campos son `ui-field`; el error
 * de cada uno sale al enviar.
 */
@Component({
  selector: 'app-case-editor-sheet',
  imports: [ReactiveFormsModule, UiButton, UiCheck, UiControl, UiDialogActions, UiDialogFrame, UiField],
  templateUrl: './case-editor-sheet.component.html',
  styleUrl: './case-editor-sheet.component.scss',
  // Eager: los errores de los campos salen de `control.touched`, que no es una señal.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CaseEditorSheetComponent {
  protected readonly host = inject<CaseEditorSheetData>(DIALOG_DATA).host;

  protected readonly objectTypes = OBJECT_TYPES;
  protected readonly objectTypeLabel = objectTypeLabel;
  protected readonly themes = MAP_THEMES;
  protected readonly classifications = CLASSIFICATIONS;
  protected readonly nodeOptionLabel = nodeOptionLabel;
  protected readonly shorten = shorten;

  /** `node`, `decision`, `map`, `object` o `tool`: qué formulario se presenta. */
  protected readonly section = computed(() => (this.host.panel()?.kind ?? '').split('-')[0]);
  protected readonly saveLabel = computed(() => SAVE_LABELS[this.section()] ?? 'Guardar');

  /**
   * El formulario de la sección, o uno vacío si no hay panel. La plantilla no lo envuelve en un `@if`: el marco del
   * diálogo se registra en el contenedor del CDK al construirse y, creado dentro de un bloque condicional (en la
   * pasada de actualización), daba NG0100 sobre `aria-labelledby` del contenedor.
   */
  protected group(): FormGroup {
    return this.form() ?? EMPTY_GROUP;
  }

  private form(): FormGroup | null {
    switch (this.section()) {
      case 'node': return this.host.nodeForm;
      case 'decision': return this.host.decisionForm;
      case 'map': return this.host.mapForm;
      case 'object': return this.host.objectForm;
      case 'tool': return this.host.toolForm;
      default: return null;
    }
  }

  protected control(group: FormGroup, name: string): AbstractControl {
    return group.get(name)!;
  }
}
