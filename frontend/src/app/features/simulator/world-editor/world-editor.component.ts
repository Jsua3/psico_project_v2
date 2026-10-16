/**
 * WorldEditorComponent — Fase 4: Editor de mundo MVP (Konva + Angular Signals)
 *
 * Visual authoring of world maps using Konva canvas:
 *   - Grid/zoom/pan/snap
 *   - Select/move/resize objects and collision zones
 *   - Create objects, persons, collisions, triggers
 *   - Define spawn and safe exit
 *   - Side inspector (liquid-glass)
 *   - Save draft (debounced auto-save + manual)
 *   - Validate button
 *   - Undo/Redo (command stack)
 *
 * Coordinates in PIXELS (Decision #5 — WYSIWYG with Phaser runtime).
 */
import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  effect,
  linkedSignal,
  signal,
  untracked,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import Konva from 'konva';
import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { RevisionConflict } from '../../../core/api/revision-conflict.util';
import { UiDialog } from '../../../shared/ui/dialog/ui-dialog';
import { AVATAR_LABELS, AvatarPersonalizado, COMPLEXIONS, HAIRS, HAIR_COLORS, SKINS } from '../../character/kit/avatar-v2';
import { resolveCharacter } from '../../character/kit/character-visual.resolver';
import { KitFigureComponent } from '../../character/kit/kit-figure.component';
import { KitService } from '../../character/kit/kit.service';
import { personCharacterRef } from '../world-characters.util';
import { npcCustomAvatar, npcMetadataForCustom, npcMetadataForRecipe } from './npc-metadata.util';

import {
  WorldEditorStore,
  EditorTool,
  PlaceObjectCommand,
  MoveObjectCommand,
  ResizeZoneCommand,
  DeleteObjectWithDialogueCommand,
  UpdateInspectorCommand,
  PlaceCollisionZoneCommand,
  DeleteCollisionZoneCommand,
  SetZoneLabelCommand,
  UpdateSpawnCommand,
  UpsertDialogueCommand,
  DeleteDialogueCommand,
  SetMapAmbientCommand,
  SetMapFieldsCommand
} from './world-editor.store';
import {
  WorldObject,
  WorldObjectType,
  WorldCollisionZone,
  WorldValidationState,
  WorldDialogueTree,
  WorldDialogueLine,
  WorldDialogueChoice
} from '../../../core/models/simulation.model';
import { CanvasView, cursorFor, fitView, snapZoneRect, wheelZoomFactor, zoomAtPoint } from './canvas-view.util';
import { Point, cycleKey, elementAt, moveByKey, zoneBetween } from './keyboard-edit.util';
import { objectTypeLabel } from '../../../shared/ui/labels';
import {
  RevisionConflictAnswer,
  RevisionConflictDialogComponent,
  RevisionConflictDialogData,
} from '../revision-conflict-dialog.component';
import {
  patrolPoints, wanderRadius, setPatternType, setWanderRadius,
  withPatrolPoint, movePatrolPoint, removePatrolPoint, reorderPatrolPoint
} from './path-edit.util';
import {
  doorTarget, setDoorTarget, doorEntry, setDoorEntry,
  cameraZoom, setCameraZoom, backgroundImage, setBackgroundImage
} from './room-edit.util';
import {
  AUTHORING_OBJECT_TEMPLATES,
  AUTHORING_SCENE_TEMPLATES,
  applySceneTemplate,
  buildObjectFromTemplate,
  objectTemplateById,
  selectedSceneTemplateId,
} from '../authoring-catalog.config';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE = 16;
const TOOL_NAMES: Record<EditorTool, string> = {
  select: 'seleccionar',
  pan: 'mover lienzo',
  'place-object': 'colocar objeto',
  'place-collision': 'zona de colisión',
  'place-spawn': 'punto de aparición',
};
const SNAP_THRESHOLD = 8;
const OBJECT_COLORS: Record<string, string> = {
  PERSON: '#4f7cac',
  OBJECT: '#4fa3a5',
  PROP: '#4fa3a5',
  TOOL: '#6a8e5e',
  TOOL_TARGET: '#6a8e5e',
  EXIT: '#a85064',
  WARNING: '#c6a850',
  ROUTE: '#7a6f9e',
  TRIGGER: '#9e8f6f',
  NOTE: '#8fa3b8',
  RESOURCE: '#5e8e6a'
};

@Component({
  selector: 'app-world-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressBarModule, KitFigureComponent],
  providers: [WorldEditorStore],
  template: `
    <div class="we-root" (keydown)="onEditorKeydown($event)">
      <!-- ── Toolbar ─────────────────────────────────────────────────── -->
      <header class="we-toolbar liquid-glass">
        <div class="we-tools" role="group" aria-label="Herramientas del lienzo" (keydown)="onToolbarKeydown($event)">
          <button class="we-tool-btn" type="button" [class.active]="store.activeTool() === 'select'"
                  [attr.aria-pressed]="store.activeTool() === 'select'" aria-label="Seleccionar" aria-keyshortcuts="V"
                  (click)="store.setTool('select')" title="Seleccionar (V)">
            <mat-icon>near_me</mat-icon>
          </button>
          <button class="we-tool-btn" type="button" [class.active]="store.activeTool() === 'pan'"
                  [attr.aria-pressed]="store.activeTool() === 'pan'" aria-label="Mover lienzo" aria-keyshortcuts="H"
                  (click)="store.setTool('pan')" title="Mover lienzo (H)">
            <mat-icon>pan_tool</mat-icon>
          </button>
          <span class="we-divider"></span>
          <button class="we-tool-btn" type="button" [class.active]="store.activeTool() === 'place-object'"
                  [disabled]="store.readOnly()"
                  [attr.aria-pressed]="store.activeTool() === 'place-object'" aria-label="Colocar objeto" aria-keyshortcuts="O"
                  (click)="store.setTool('place-object')" title="Colocar objeto (O)">
            <mat-icon>add_location_alt</mat-icon>
          </button>
          <button class="we-tool-btn" type="button" [class.active]="store.activeTool() === 'place-collision'"
                  [disabled]="store.readOnly()"
                  [attr.aria-pressed]="store.activeTool() === 'place-collision'" aria-label="Zona de colisión" aria-keyshortcuts="C"
                  (click)="store.setTool('place-collision')" title="Zona de colisión (C)">
            <mat-icon>crop_free</mat-icon>
          </button>
          <button class="we-tool-btn" type="button" [class.active]="store.activeTool() === 'place-spawn'"
                  [disabled]="store.readOnly()"
                  [attr.aria-pressed]="store.activeTool() === 'place-spawn'" aria-label="Punto de aparición" aria-keyshortcuts="S"
                  (click)="store.setTool('place-spawn')" title="Punto de aparición (S)">
            <mat-icon>my_location</mat-icon>
          </button>
        </div>

        <div class="we-actions">
          <button class="we-tool-btn" type="button" [disabled]="!store.canUndo() || store.readOnly()" (click)="store.undo()"
                  aria-label="Deshacer" aria-keyshortcuts="Control+Z" title="Deshacer (Ctrl+Z)">
            <mat-icon>undo</mat-icon>
          </button>
          <button class="we-tool-btn" type="button" [disabled]="!store.canRedo() || store.readOnly()" (click)="store.redo()"
                  aria-label="Rehacer" aria-keyshortcuts="Control+Y" title="Rehacer (Ctrl+Y)">
            <mat-icon>redo</mat-icon>
          </button>
          <span class="we-divider"></span>
          <span class="we-zoom-label">{{ (store.zoom() * 100) | number:'1.0-0' }}%</span>
          <button class="we-tool-btn" type="button" (click)="zoomIn()" aria-label="Acercar" title="Acercar (+)"><mat-icon>zoom_in</mat-icon></button>
          <button class="we-tool-btn" type="button" (click)="zoomOut()" aria-label="Alejar" title="Alejar (-)"><mat-icon>zoom_out</mat-icon></button>
          <button class="we-tool-btn" type="button" (click)="zoomFit()" aria-label="Ajustar a la vista" title="Ajustar (0)"><mat-icon>fit_screen</mat-icon></button>
          <span class="we-divider"></span>
          <button class="psy-button psy-button--glass" (click)="store.validate()" type="button">
            <mat-icon>verified</mat-icon>Validar
          </button>
          <button class="psy-button psy-button--primary" (click)="store.saveNow()" type="button"
                  aria-keyshortcuts="Control+S" title="Guardar (Ctrl+S)"
                  [disabled]="store.saving() || !store.dirty() || store.readOnly()">
            <mat-icon>{{ store.saving() ? 'hourglass_empty' : 'save' }}</mat-icon>
            {{ store.saving() ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>

        <div class="we-status">
          @if (store.dirty()) {
            <span class="we-badge we-badge--dirty">Sin guardar</span>
          }
          @if (store.saving()) {
            <span class="we-badge we-badge--saving">Guardando...</span>
          }
          @if (!store.dirty() && !store.saving() && store.lastSavedAt()) {
            <span class="we-badge we-badge--saved">Guardado</span>
          }
          <span class="we-info">
            {{ store.objectCount() }} objetos · {{ store.zoneCount() }} zonas
          </span>
        </div>
        <!-- Región viva SIEMPRE presente: el estado del guardado se lee sin mirar la barra. -->
        <p class="ds-sr-only" role="status">{{ saveStatusText() }}</p>
      </header>

      @if (readOnlyReason(); as reason) {
        <p class="we-readonly">{{ reason }}</p>
      }

      <section class="we-library liquid-glass" aria-label="Biblioteca de autoría">
        <label class="we-library-group">
          <span>Escenario</span>
          <select [ngModel]="selectedSceneTemplate()" [disabled]="store.readOnly()" (ngModelChange)="applyScenePreset($event)">
            <option value="">Personalizado</option>
            @for (scene of sceneTemplates; track scene.id) {
              <option [value]="scene.id">{{ scene.label }}</option>
            }
          </select>
        </label>
        <div class="we-library-actions">
          @for (template of objectTemplates; track template.id) {
            <button class="we-template-btn" type="button" [disabled]="store.readOnly()" (click)="addTemplate(template.id)">
              <mat-icon>{{ template.icon }}</mat-icon>
              <span>{{ template.label }}</span>
            </button>
          }
        </div>
      </section>

      @if (store.loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (store.error()) {
        <div class="we-error" role="alert">
          <mat-icon>error</mat-icon>
          <span>{{ store.error() }}</span>
          @if (store.conflictDetected()) {
            <button class="psy-button psy-button--glass" (click)="store.retryAfterConflict()" type="button"
                    [disabled]="!store.conflict()">
              <mat-icon>publish</mat-icon>Reintentar con mi cambio
            </button>
            <button class="psy-button psy-button--glass" (click)="store.reloadAfterConflict()" type="button">
              <mat-icon>refresh</mat-icon>Recargar el caso
            </button>
          } @else if (store.saveFailed()) {
            <button class="psy-button psy-button--glass" (click)="store.retrySave()" type="button">
              <mat-icon>refresh</mat-icon>Reintentar
            </button>
          }
        </div>
      }

      <!-- ── Canvas + Inspector layout ─────────────────────────────── -->
      <div class="we-layout">
        <div class="we-canvas-wrap" #canvasWrap>
          <div #konvaHost class="we-konva-host" tabindex="0" role="application"
               aria-label="Lienzo del editor de mundo" aria-describedby="we-canvas-help"
               (keydown)="onCanvasKeydown($event)" (focus)="canvasFocused.set(true)" (blur)="canvasFocused.set(false)"></div>
          <p class="we-canvas-help" id="we-canvas-help">
            Con el foco en el lienzo: flechas mueven el cursor o lo seleccionado (Mayús: 8 casillas) · Intro actúa según la
            herramienta · AvPág y RePág recorren los elementos · Supr elimina · V, O, C, S y H eligen herramienta · Ctrl+S guarda.
          </p>
        </div>

        <!-- ── Side Inspector ──────────────────────────────────────── -->
        <!-- En solo lectura todos sus controles están deshabilitados: sin foco propio, el teclado no podría desplazarla. -->
        <aside class="we-inspector liquid-glass" aria-label="Propiedades del mundo" [attr.tabindex]="store.readOnly() ? 0 : null">
         <fieldset class="we-fieldset" [disabled]="store.readOnly()">
          <!-- ── Sala: switcher + zoom + fondo ────────────────────── -->
          @if (store.editorState()) {
            <div class="we-room">
              <h3>Sala</h3>
              @if (store.rooms().length > 1) {
                <label><span>Sala actual</span>
                  <select (change)="onRoomChange($event)">
                    @for (r of store.rooms(); track r.nodeId) {
                      <option [value]="r.nodeId" [selected]="r.nodeId === store.definition()?.nodeId">{{ r.title }} ({{ r.nodeKey }})</option>
                    }
                  </select>
                </label>
              }
              <label><span>Zoom de cámara ({{ roomZoom() | number:'1.2-2' }}×)</span>
                <input type="range" min="0.25" max="4" step="0.05" [ngModel]="roomZoom()"
                       (ngModelChange)="setRoomZoom($event)" />
              </label>
              <label><span>Imagen de fondo (URL)</span>
                <input [ngModel]="roomBg()" (ngModelChange)="setRoomBg($event)" placeholder="assets/… o https://…" />
              </label>
            </div>
          }
          @if (store.selectedObject(); as obj) {
            <h3>Objeto: {{ obj.label }}</h3>
            <div class="we-form">
              <label><span>Clave</span><input [ngModel]="obj.key" disabled /></label>
              <label><span>Etiqueta</span>
                <input [ngModel]="obj.label" (ngModelChange)="updateObjectField(obj.key, 'label', $event)" />
              </label>
              <label><span>Tipo</span>
                <select [ngModel]="obj.type" (ngModelChange)="updateObjectField(obj.key, 'type', $event)">
                  <option value="PERSON">Persona</option>
                  <option value="OBJECT">Objeto</option>
                  <option value="PROP">Prop</option>
                  <option value="TOOL">Herramienta</option>
                  <option value="EXIT">Salida</option>
                  <option value="WARNING">Alerta</option>
                  <option value="ROUTE">Ruta</option>
                  <option value="TRIGGER">Trigger</option>
                </select>
              </label>
              <div class="we-form-row">
                <label><span>X</span><input type="number" [ngModel]="obj.x"
                  (ngModelChange)="updateObjectField(obj.key, 'x', $event)" /></label>
                <label><span>Y</span><input type="number" [ngModel]="obj.y"
                  (ngModelChange)="updateObjectField(obj.key, 'y', $event)" /></label>
              </div>
              <div class="we-form-row">
                <label><span>Ancho</span><input type="number" [ngModel]="obj.width"
                  (ngModelChange)="updateObjectField(obj.key, 'width', $event)" /></label>
                <label><span>Alto</span><input type="number" [ngModel]="obj.height"
                  (ngModelChange)="updateObjectField(obj.key, 'height', $event)" /></label>
              </div>
              <label><span>Prompt</span>
                <input [ngModel]="obj.interactionPrompt" (ngModelChange)="updateObjectField(obj.key, 'interactionPrompt', $event)" />
              </label>
              <label><span>Código corto</span>
                <input [ngModel]="obj.shortCode" maxlength="12" (ngModelChange)="updateObjectField(obj.key, 'shortCode', $event)" />
              </label>
              <label><span>Color</span>
                <input type="color" [ngModel]="obj.colorHex" (ngModelChange)="updateObjectField(obj.key, 'colorHex', $event)" />
              </label>
              <label class="we-check">
                <input type="checkbox" [ngModel]="obj.collision" (ngModelChange)="updateObjectField(obj.key, 'collision', $event)" />
                <span>Colision activa</span>
              </label>
              <label class="we-check">
                <input type="checkbox" [ngModel]="obj.visible" (ngModelChange)="updateObjectField(obj.key, 'visible', $event)" />
                <span>Visible</span>
              </label>
              @if (obj.type === 'PERSON') {
                <div class="we-npc-kit">
                  <div class="we-npc-head">
                    <h4>NPC</h4>
                    <div class="we-npc-preview" aria-hidden="true">
                      <app-kit-figure [visual]="npcVisual(obj)" view="down" [scale]="1" />
                      <app-kit-figure [visual]="npcVisual(obj)" view="left" [scale]="1" />
                    </div>
                  </div>
                  <label><span>Personaje</span>
                    <select [ngModel]="npcRecipeChoice(obj)" (ngModelChange)="setNpcRecipe(obj.key, $event)">
                      <option value="">Personalizado</option>
                      @for (recipe of npcRecipes(); track recipe.id) {
                        <option [value]="recipe.id">{{ recipe.label }}</option>
                      }
                    </select>
                  </label>
                  @if (!npcRecipeChoice(obj)) {
                    <div class="we-form-row">
                      <label><span>Complexión</span>
                        <select [ngModel]="npcCustom(obj).complexion" (ngModelChange)="setNpcCustom(obj.key, { complexion: $event })">
                          @for (id of complexions; track id) { <option [value]="id">{{ labels.complexion[id] }}</option> }
                        </select>
                      </label>
                      <label><span>Piel</span>
                        <select [ngModel]="npcCustom(obj).skin" (ngModelChange)="setNpcCustom(obj.key, { skin: $event })">
                          @for (id of skins; track id; let i = $index) { <option [value]="id">Tono {{ i + 1 }}</option> }
                        </select>
                      </label>
                    </div>
                    <div class="we-form-row">
                      <label><span>Pelo</span>
                        <select [ngModel]="npcCustom(obj).hair" (ngModelChange)="setNpcCustom(obj.key, { hair: $event })">
                          @for (id of hairs; track id) { <option [value]="id">{{ labels.hair[id] }}</option> }
                        </select>
                      </label>
                      <label><span>Color</span>
                        <select [ngModel]="npcCustom(obj).hairColor" (ngModelChange)="setNpcCustom(obj.key, { hairColor: $event })">
                          @for (id of hairColors; track id) { <option [value]="id">{{ labels.hairColor[id] }}</option> }
                        </select>
                      </label>
                    </div>
                  }
                </div>
              }
              <button class="psy-button psy-button--ghost we-delete-btn" (click)="deleteSelected()" type="button">
                <mat-icon>delete_outline</mat-icon>Eliminar objeto
              </button>
            </div>
            <!-- ── Diálogo del objeto ───────────────────────────────── -->
            <div class="we-dialogue">
              @if (store.selectedDialogue(); as dlg) {
                <div class="we-dialogue-head">
                  <h4>Diálogo</h4>
                  <button class="we-del" (click)="removeDialogue()" type="button" title="Quitar diálogo">
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                </div>
                <label><span>Hablante</span>
                  <input [ngModel]="dlg.speakerName" (ngModelChange)="updateDialogueField('speakerName', $event)" />
                </label>
                <label><span>Emoción</span>
                  <input [ngModel]="dlg.emotion" (ngModelChange)="updateDialogueField('emotion', $event)" />
                </label>

                <div class="we-sub">
                  <span class="we-sub-title">Líneas</span>
                  <button class="we-add" (click)="addLine()" type="button" aria-label="Agregar línea" title="Agregar línea"><mat-icon>add</mat-icon></button>
                </div>
                @for (line of dlg.lines; track $index) {
                  <div class="we-row">
                    <input [ngModel]="line.text" (ngModelChange)="updateLine($index, $event)"
                           [attr.aria-label]="'Línea ' + ($index + 1) + ' del diálogo'"
                           placeholder="Lo que dice el NPC…" />
                    <button class="we-del" (click)="removeLine($index)" type="button"
                            [attr.aria-label]="'Quitar la línea ' + ($index + 1)"><mat-icon>close</mat-icon></button>
                  </div>
                }

                <div class="we-sub">
                  <span class="we-sub-title">Opciones de respuesta</span>
                  <button class="we-add" (click)="addChoice()" type="button" aria-label="Agregar opción de respuesta" title="Agregar opción de respuesta"><mat-icon>add</mat-icon></button>
                </div>
                @for (choice of dlg.choices; track choice.key) {
                  <div class="we-choice">
                    <input [ngModel]="choice.text" (ngModelChange)="updateChoiceText($index, $event)"
                           [attr.aria-label]="'Texto de la opción ' + ($index + 1)"
                           placeholder="Respuesta del estudiante…" />
                    <select [ngModel]="choice.decisionOptionId"
                            [attr.aria-label]="'Destino de la opción ' + ($index + 1)"
                            (ngModelChange)="setChoiceDecision($index, $event)">
                      <option [ngValue]="null">— sin destino —</option>
                      @for (dec of store.availableDecisions(); track dec.id) {
                        <option [ngValue]="dec.id">{{ dec.classification }} → {{ dec.targetNodeKey }}: {{ dec.text }}</option>
                      }
                    </select>
                    <button class="we-del" (click)="removeChoice($index)" type="button"
                            [attr.aria-label]="'Quitar la opción ' + ($index + 1)"><mat-icon>close</mat-icon></button>
                    <div class="we-choice-reqs">
                      <label><span>Herramienta obligatoria</span>
                        <select [ngModel]="choice.requiredToolCode" (ngModelChange)="setChoiceRequiredTool($index, $event)">
                          <option [ngValue]="null">Sin requisito</option>
                          @for (tool of store.definition()?.clinicalTools ?? []; track tool.code) {
                            <option [value]="tool.code">{{ tool.code }} - {{ tool.label }}</option>
                          }
                        </select>
                      </label>
                      <label><span>Debe hablar con NPCs</span>
                        <input [ngModel]="choiceEvidenceList(choice, 'requiresNpcs')" (ngModelChange)="setChoiceEvidenceList($index, 'requiresNpcs', $event)" placeholder="enfermera, testigo" />
                      </label>
                      <label><span>Debe revisar objetos</span>
                        <input [ngModel]="choiceEvidenceList(choice, 'requiresInspected')" (ngModelChange)="setChoiceEvidenceList($index, 'requiresInspected', $event)" placeholder="historia-clinica" />
                      </label>
                      <label><span>Debe tener/usar herramientas</span>
                        <input [ngModel]="choiceEvidenceList(choice, 'requiresTools')" (ngModelChange)="setChoiceEvidenceList($index, 'requiresTools', $event)" placeholder="PAP, RISK_METER" />
                      </label>
                    </div>
                  </div>
                }
              } @else {
                <button class="psy-button psy-button--glass" (click)="addDialogue()" type="button">
                  <mat-icon>chat_bubble_outline</mat-icon>Agregar diálogo
                </button>
              }
            </div>
            <!-- ── Movimiento del NPC ──────────────────────────────── -->
            <div class="we-movement">
              <h4>Movimiento</h4>
              <label><span>Tipo</span>
                <select [ngModel]="movementType(obj)" (ngModelChange)="setMovement(obj.key, $event)">
                  <option value="idle">Quieto</option>
                  <option value="wander">Deambular</option>
                  <option value="patrol">Ruta (patrol)</option>
                </select>
              </label>
              @if (movementType(obj) === 'wander') {
                <label><span>Radio</span>
                  <input type="number" min="1" [ngModel]="wanderRadiusOf(obj)"
                         (ngModelChange)="setRadius(obj.key, $event)" />
                </label>
              }
              @if (movementType(obj) === 'patrol') {
                <button class="psy-button psy-button--glass" (click)="store.pathEditMode.set(!store.pathEditMode())" type="button">
                  <mat-icon>{{ store.pathEditMode() ? 'check' : 'timeline' }}</mat-icon>
                  {{ store.pathEditMode() ? 'Listo' : 'Dibujar ruta' }}
                </button>
                <p class="we-hint">{{ store.pathEditMode() ? 'Clic en el lienzo para agregar waypoints.' : 'Activa y haz clic en el lienzo; arrastra los puntos para moverlos.' }}</p>
                @for (pt of patrolPointsOf(obj); track $index) {
                  <div class="we-wp-row">
                    <span class="we-wp-idx">{{ $index + 1 }}</span>
                    <span class="we-wp-xy">{{ pt[0] }}, {{ pt[1] }}</span>
                    <button class="we-del" (click)="moveWaypointOrder(obj.key, $index, -1)" type="button"
                            [attr.aria-label]="'Subir el punto ' + ($index + 1)"><mat-icon>arrow_upward</mat-icon></button>
                    <button class="we-del" (click)="moveWaypointOrder(obj.key, $index, 1)" type="button"
                            [attr.aria-label]="'Bajar el punto ' + ($index + 1)"><mat-icon>arrow_downward</mat-icon></button>
                    <button class="we-del" (click)="deleteWaypoint(obj.key, $index)" type="button"
                            [attr.aria-label]="'Quitar el punto ' + ($index + 1)"><mat-icon>close</mat-icon></button>
                  </div>
                }
              }
            </div>
            <!-- ── Puerta (objeto EXIT) ─────────────────────────────── -->
            @if (obj.type === 'EXIT') {
              <div class="we-door">
                <h4>Puerta</h4>
                <label><span>Sala destino</span>
                  <select [ngModel]="doorTargetOf(obj)" (ngModelChange)="setDoorTargetFor(obj.key, $event)">
                    <option [ngValue]="''">— sin destino —</option>
                    @for (r of otherRooms(); track r.nodeId) {
                      <option [ngValue]="r.nodeKey">{{ r.title }} ({{ r.nodeKey }})</option>
                    }
                  </select>
                </label>
                <div class="we-form-row">
                  <label><span>Entrada X</span><input type="number" [ngModel]="doorEntryOf(obj)[0]"
                    (ngModelChange)="setDoorEntryFor(obj.key, +$event, doorEntryOf(obj)[1])" /></label>
                  <label><span>Entrada Y</span><input type="number" [ngModel]="doorEntryOf(obj)[1]"
                    (ngModelChange)="setDoorEntryFor(obj.key, doorEntryOf(obj)[0], +$event)" /></label>
                </div>
              </div>
            }
          } @else if (store.selectedZone(); as zone) {
            <h3>Zona: {{ zone.label || zone.key }}</h3>
            <div class="we-form">
              <label><span>Clave</span><input [ngModel]="zone.key" disabled /></label>
              <label><span>Etiqueta</span>
                <input [ngModel]="zone.label ?? ''" (ngModelChange)="updateZoneLabel(zone.key, $event)" />
              </label>
              <div class="we-form-row">
                <label><span>X</span><input type="number" [ngModel]="zone.x" disabled /></label>
                <label><span>Y</span><input type="number" [ngModel]="zone.y" disabled /></label>
              </div>
              <div class="we-form-row">
                <label><span>Ancho</span><input type="number" [ngModel]="zone.width" disabled /></label>
                <label><span>Alto</span><input type="number" [ngModel]="zone.height" disabled /></label>
              </div>
              <button class="psy-button psy-button--ghost we-delete-btn" (click)="deleteSelectedZone()" type="button">
                <mat-icon>delete_outline</mat-icon>Eliminar zona
              </button>
            </div>
          } @else {
            <div class="we-inspector-empty">
              <mat-icon>touch_app</mat-icon>
              <p>Selecciona un objeto o zona en el lienzo para editar sus propiedades.</p>
              <p class="we-hint">Con el foco en el lienzo: V seleccionar · O objeto · C colisión · S aparición · H mover · flechas mover · Supr eliminar · Ctrl+Z / Ctrl+Y · Ctrl+S guardar</p>
            </div>
          }

          <!-- Validation panel -->
          @if (store.validationState(); as vs) {
            <div class="we-validation">
              <h3>
                <mat-icon>{{ vs.canPublish ? 'check_circle' : 'error' }}</mat-icon>
                Validación
              </h3>
              @if (vs.errors.length) {
                <div class="we-val-section we-val-errors">
                  @for (issue of vs.errors; track issue.code) {
                    <div class="we-val-item">
                      <mat-icon>error</mat-icon>
                      <span>{{ issue.message }}</span>
                    </div>
                  }
                </div>
              }
              @if (vs.warnings.length) {
                <div class="we-val-section we-val-warnings">
                  @for (issue of vs.warnings; track issue.code) {
                    <div class="we-val-item">
                      <mat-icon>warning</mat-icon>
                      <span>{{ issue.message }}</span>
                    </div>
                  }
                </div>
              }
              @if (!vs.errors.length && !vs.warnings.length) {
                <p class="we-val-ok">Sin errores ni advertencias.</p>
              }
            </div>
          }
         </fieldset>
        </aside>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .we-root { display: grid; gap: 12px; }

    /* Toolbar */
    .we-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 8px 14px;
      border-radius: 16px;
    }
    .we-tools, .we-actions { display: flex; gap: 4px; align-items: center; }
    .we-actions { margin-left: auto; }
    .we-tool-btn {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--psy-muted);
      cursor: pointer;
      transition: background-color var(--psy-motion-fast), color var(--psy-motion-fast);
    }
    .we-tool-btn:hover { background: rgba(79,124,172,.08); color: var(--psy-blue-deep); }
    .we-tool-btn.active {
      background: rgba(79,124,172,.14);
      border-color: rgba(79,124,172,.28);
      color: var(--psy-blue-deep);
    }
    .we-tool-btn:disabled { opacity: .35; pointer-events: none; }
    /* Lo que no se puede usar (solo lectura, nada que guardar) se ve apagado, no igual que lo activo. */
    .we-actions .psy-button:disabled, .we-template-btn:disabled { opacity: .45; cursor: not-allowed; pointer-events: none; }
    .we-tool-btn mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .we-divider {
      display: block;
      width: 1px;
      height: 24px;
      background: var(--psy-border);
      margin: 0 4px;
    }
    .we-zoom-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: .76rem;
      font-weight: 700;
      color: var(--psy-muted);
      min-width: 42px;
      text-align: center;
    }
    .we-status {
      display: flex;
      gap: 8px;
      align-items: center;
      width: 100%;
      padding-top: 4px;
    }
    .we-library {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 14px;
    }
    .we-library-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: min(100%, 280px);
    }
    .we-readonly {
      margin: 0;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--ds-surface-2);
      color: var(--ds-text-1);
      font-size: var(--ds-type-body-s-size);
    }
    /* El fieldset es solo el interruptor de «deshabilitado»: no cambia el diseño del inspector. */
    .we-fieldset {
      display: grid;
      gap: 14px;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .we-library-group span {
      color: var(--psy-blue-deep);
      font-size: .78rem;
      font-weight: 800;
    }
    .we-library select {
      min-height: 34px;
      border: 1px solid rgba(79,124,172,.18);
      border-radius: 8px;
      background: rgba(255,255,255,.82);
      color: var(--psy-ink);
      font: inherit;
      font-size: .82rem;
      padding: 5px 8px;
    }
    .we-library-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .we-template-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 9px;
      border: 1px solid rgba(79,124,172,.18);
      border-radius: 8px;
      background: rgba(255,255,255,.78);
      color: var(--psy-blue-deep);
      font: inherit;
      font-size: .78rem;
      font-weight: 800;
      cursor: pointer;
    }
    .we-template-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .we-template-btn:hover {
      background: rgba(79,124,172,.1);
    }
    .we-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: .72rem;
      font-weight: 800;
    }
    .we-badge--dirty { background: rgba(198,168,80,.16); color: #7a6320; }
    .we-badge--saving { background: rgba(79,124,172,.12); color: var(--psy-blue-deep); }
    .we-info {
      font-size: .76rem;
      color: var(--psy-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    /* Layout */
    .we-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 14px;
      align-items: start;
    }
    .we-canvas-wrap {
      position: relative;
      border: 1px solid rgba(79,124,172,.16);
      border-radius: 16px;
      overflow: hidden;
      background: #f8fbfd;
      min-height: 400px;
    }
    .we-konva-host { width: 100%; min-height: 360px; overflow: hidden; }
    /* Hacia dentro: el contenedor recorta (overflow: hidden) lo que sale y el contorno solo se veía a medias. */
    .we-konva-host:focus-visible { outline: 3px solid var(--ds-focus); outline-offset: -3px; }
    .we-canvas-help { margin: 8px 0 0; color: var(--ds-text-2); font-size: var(--ds-type-caption-size); line-height: 1.4; }
    .we-badge--saved { background: var(--ds-success-bg); color: var(--ds-success); }

    /* Inspector */
    .we-inspector {
      display: grid;
      gap: 14px;
      padding: 16px;
      border-radius: 18px;
      max-height: 80vh;
      overflow-y: auto;
    }
    .we-inspector h3, .we-inspector h4 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
      font-size: 1.05rem;
      color: var(--psy-ink);
    }
    /*
     * El inspector mide 300 px: toda rejilla con una pista minmax(0, 1fr) (una pista auto crece con el ancho natural
     * de un campo y el contenido se salía por la derecha de la tarjeta) y los campos de texto al ancho de su pista.
     */
    .we-inspector, .we-fieldset, .we-form, .we-room, .we-door, .we-movement, .we-dialogue, .we-npc-kit,
    .we-form label, .we-room label, .we-door label, .we-movement label, .we-choice-reqs label {
      grid-template-columns: minmax(0, 1fr);
    }
    .we-form input:not([type='checkbox']):not([type='color']):not([type='range']), .we-form select,
    .we-room input:not([type='checkbox']):not([type='color']):not([type='range']), .we-room select,
    .we-door input:not([type='checkbox']):not([type='color']):not([type='range']), .we-door select,
    .we-movement input:not([type='checkbox']):not([type='color']):not([type='range']), .we-movement select {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .we-form { display: grid; gap: 8px; }
    .we-form label {
      display: grid;
      gap: 3px;
      font-size: .82rem;
    }
    .we-form label > span { font-weight: 700; color: var(--psy-blue-deep); }
    .we-form input, .we-form select {
      padding: 6px 10px;
      border: 1px solid rgba(79,124,172,.18);
      border-radius: 8px;
      background: rgba(255,255,255,.8);
      font-size: .84rem;
      color: var(--psy-ink);
      font-family: inherit;
    }
    .we-form input:focus, .we-form select:focus {
      outline: none;
      border-color: var(--psy-blue);
      box-shadow: 0 0 0 2px var(--psy-focus);
    }
    .we-form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
    .we-check {
      display: flex !important;
      align-items: center;
      gap: 8px;
      flex-direction: row !important;
    }
    .we-check input { width: auto; }
    .we-delete-btn { color: #8b3145 !important; margin-top: 6px; }

    .we-inspector-empty {
      display: grid;
      gap: 10px;
      text-align: center;
      padding: 20px 0;
      color: var(--psy-muted);
    }
    .we-inspector-empty mat-icon {
      justify-self: center;
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: rgba(79,124,172,.3);
    }
    .we-inspector-empty p { margin: 0; font-size: .84rem; line-height: 1.5; }
    .we-hint { font-size: .75rem !important; font-family: 'JetBrains Mono', monospace; }

    /* Validation */
    .we-validation {
      display: grid;
      gap: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--psy-border);
    }
    .we-validation h3 {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .we-val-section { display: grid; gap: 6px; }
    .we-val-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: .8rem;
      line-height: 1.4;
    }
    .we-val-errors .we-val-item { color: #8b3145; }
    .we-val-errors mat-icon { color: #a85064; font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .we-val-warnings .we-val-item { color: #7a6320; }
    .we-val-warnings mat-icon { color: #c6a850; font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .we-val-ok { margin: 0; color: #2f7c5f; font-size: .84rem; }

    /* Error bar */
    .we-error {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(168,80,98,.08);
      border: 1px solid rgba(168,80,98,.24);
      color: #8b3145;
      font-size: .88rem;
    }

    @media (max-width: 1000px) {
      .we-layout { grid-template-columns: 1fr; }
      .we-inspector { max-height: none; }
    }
    .we-dialogue { display: grid; gap: 8px; padding-top: 12px; margin-top: 8px; border-top: 1px solid var(--psy-border); }
    .we-dialogue-head { display: flex; align-items: center; justify-content: space-between; }
    .we-sub { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
    .we-sub-title { font-weight: 700; color: var(--psy-blue-deep); font-size: .82rem; }
    .we-row, .we-choice { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
    .we-choice { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
    .we-row input, .we-choice input, .we-choice select,
    .we-choice-reqs input, .we-choice-reqs select { width: 100%; min-width: 0; box-sizing: border-box; }
    .we-choice-reqs {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      padding: 8px;
      border: 1px solid rgba(79,124,172,.12);
      border-radius: 10px;
      background: rgba(79,124,172,.05);
    }
    .we-choice-reqs label {
      display: grid;
      gap: 3px;
      font-size: .78rem;
    }
    .we-choice-reqs label > span {
      color: var(--psy-blue-deep);
      font-weight: 800;
    }
    .we-add, .we-del { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--psy-border); border-radius: 8px; background: transparent; cursor: pointer; color: var(--psy-muted); }
    .we-add:hover, .we-del:hover { background: rgba(79,124,172,.08); color: var(--psy-blue-deep); }
    .we-choice select, .we-row input, .we-choice input { padding: 5px 8px; border: 1px solid rgba(79,124,172,.18); border-radius: 8px; background: rgba(255,255,255,.8); font: inherit; font-size: .82rem; }
    .we-npc-kit { display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(79,124,172,.14); border-radius: 12px; background: rgba(255,255,255,.52); }
    .we-npc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .we-npc-head h4 { margin: 0; font-size: .96rem; }
    .we-npc-preview { display: flex; gap: 6px; align-items: flex-end; }
    .we-movement { display: grid; gap: 8px; padding-top: 12px; margin-top: 8px; border-top: 1px solid var(--psy-border); }
    .we-movement h4 { margin: 0; font-size: 1.05rem; color: var(--psy-ink); }
    .we-wp-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; gap: 6px; align-items: center; }
    .we-wp-idx { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: rgba(122,111,158,.16); color: #5b5180; font-weight: 800; font-size: .72rem; }
    .we-wp-xy { font-family: 'JetBrains Mono', monospace; font-size: .76rem; color: var(--psy-muted); }
    .we-movement select, .we-movement input { padding: 5px 8px; border: 1px solid rgba(79,124,172,.18); border-radius: 8px; background: rgba(255,255,255,.8); font: inherit; font-size: .82rem; }
    .we-room { display: grid; gap: 8px; padding: 0 0 12px; margin-bottom: 8px; border-bottom: 1px solid var(--psy-border); }
    .we-room h3, .we-door h4 { margin: 0; font-size: 1.05rem; color: var(--psy-ink); }
    .we-room label, .we-door label { display: grid; gap: 3px; font-size: .82rem; }
    .we-room label > span, .we-door label > span { font-weight: 700; color: var(--psy-blue-deep); }
    .we-room select, .we-room input, .we-door select, .we-door input { padding: 5px 8px; border: 1px solid rgba(79,124,172,.18); border-radius: 8px; background: rgba(255,255,255,.8); font: inherit; font-size: .82rem; }
    .we-door { display: grid; gap: 8px; padding-top: 12px; margin-top: 8px; border-top: 1px solid var(--psy-border); }
    /* El control de zoom de cámara mide al menos 24 px de alto (WCAG 2.5.8). */
    .we-room input[type='range'], .we-check { min-height: 24px; }
    /* Con puntero táctil, todo lo que se pulsa mide al menos 44 px (F9-2). */
    @media (pointer: coarse) {
      .we-tool-btn, .we-add, .we-del { width: 44px; height: 44px; }
      .we-check { min-height: 44px; }
      .we-template-btn, .we-library select, .we-room select, .we-door select, .we-movement select,
      .we-form select, .we-choice select, .we-choice-reqs select { min-height: 44px; }
      .we-room input:not([type='checkbox']), .we-door input:not([type='checkbox']), .we-movement input:not([type='checkbox']),
      .we-form input:not([type='checkbox']):not([type='color']), .we-row input, .we-choice input, .we-choice-reqs input,
      .we-dialogue input:not([type='checkbox']), .we-dialogue select { min-height: 44px; }
      .we-form input[type='color'] { min-height: 44px; min-width: 44px; }
    }
  `]
})
export class WorldEditorComponent implements OnInit, OnDestroy {
  readonly store = inject(WorldEditorStore);

  readonly caseVersionId = input.required<number>();
  readonly nodeId = input<number>();
  /**
   * Por qué el mundo no se puede editar (una versión que no es borrador): con texto, el editor se muestra en solo
   * lectura — se ve, se selecciona y se recorre, pero no se edita ni se guarda (el servidor respondería 400).
   */
  readonly readOnlyReason = input<string | null>(null);
  readonly sceneTemplates = AUTHORING_SCENE_TEMPLATES;
  readonly objectTemplates = AUTHORING_OBJECT_TEMPLATES;
  private readonly kit = inject(KitService);
  readonly complexions = COMPLEXIONS;
  readonly skins = SKINS;
  readonly hairs = HAIRS;
  readonly hairColors = HAIR_COLORS;
  readonly labels = AVATAR_LABELS;
  /** Recetas que un docente puede asignar a un NPC: todas menos los jugables, por nombre. */
  readonly npcRecipes = computed(() => {
    const bundle = this.kit.bundle();
    if (!bundle) return [];
    return Object.entries(bundle.recipes)
      .filter(([, recipe]) => recipe.kind !== 'jugable')
      .map(([id, recipe]) => ({ id, label: recipe.displayName ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  @ViewChild('konvaHost', { static: false }) konvaHost!: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrap', { static: false }) canvasWrap!: ElementRef<HTMLDivElement>;

  private stage: Konva.Stage | null = null;
  /** Relleno del mapa y fondo (sin suavizado: pixel art), bajo la rejilla. */
  private backgroundLayer: Konva.Layer | null = null;
  private mainLayer: Konva.Layer | null = null;
  private gridLayer: Konva.Layer | null = null;
  private uiLayer: Konva.Layer | null = null;
  /** Asas de tamaño de la zona seleccionada (conecta con ResizeZoneCommand). */
  private transformer: Konva.Transformer | null = null;
  /** Los grupos de Konva de lo que se pinta, por clave (el selector `[name=…]` de Konva no encuentra claves con guion). */
  private readonly nodesByKey = new Map<string, Konva.Group>();
  /** Qué hay bajo el puntero (cambia el cursor) y si se está arrastrando el lienzo. */
  private hover: 'none' | 'object' | 'zone' = 'none';
  private panning = false;

  // Drawing state for collision zone creation
  private drawingZone = false;
  private drawStart = { x: 0, y: 0 };
  private drawRect: Konva.Rect | null = null;

  // Drag state for move commands
  private dragStart: { x: number; y: number } | null = null;

  // Spawn marker
  private spawnMarker: Konva.Group | null = null;

  // ─── Teclado del lienzo (F8-5) ─────────────────────────────────────────
  private readonly announcer = inject(LiveRegionAnnouncer);
  private readonly dialog = inject(UiDialog);
  /** El punto de aparición (encajado a la rejilla): donde empieza el cursor del teclado. */
  private readonly spawnPoint = computed<Point>(() => {
    const map = this.store.editorState()?.map;
    return map ? { x: this.snapToGrid(map.spawnX), y: this.snapToGrid(map.spawnY) } : { x: 0, y: 0 };
  }, {
    // Igualdad por VALOR: cada cambio del estado (colocar, mover, borrar, un guardado que adopta ids) recalcula el
    // computed; sin esto devolvía un objeto nuevo y el cursor del teclado volvía al punto de aparición tras cada edición.
    equal: (a, b) => a.x === b.x && a.y === b.y,
  });
  /** El cursor del teclado (en unidades del mundo): parte del punto de aparición y se mueve con las flechas. */
  readonly keyboardCursor = linkedSignal<Point>(() => this.spawnPoint());
  /** Primera esquina de una zona dibujada con el teclado (null: aún no se fijó). */
  readonly zoneAnchor = signal<Point | null>(null);
  /** El lienzo tiene el foco del teclado (muestra el cursor). */
  readonly canvasFocused = signal(false);
  private cursorLayer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private viewInitialised = false;
  private lastRoom: number | undefined;
  private conflictDialogOpen = false;

  /** Lo que dice la región viva del guardado. */
  protected readonly saveStatusText = computed(() => {
    if (this.store.saving()) return 'Guardando…';
    if (this.store.saveFailed()) return 'No se pudo guardar. Tus cambios siguen en esta pantalla.';
    if (this.store.dirty()) return 'Cambios sin guardar';
    return this.store.lastSavedAt() ? 'Guardado' : '';
  });

  constructor() {
    this.kit.load().catch(() => undefined);
    // Re-render Konva on editor-state OR selection changes
    // (the pattern overlay + selection highlight depend on the current selection).
    effect(() => {
      const state = this.store.editorState();
      this.store.selectedKey();
      // La herramienta también cuenta: de ella dependen lo arrastrable, el transformador y el cursor.
      this.store.activeTool();
      if (state && this.stage) {
        this.renderWorld(state);
      }
    });
    // El cursor del teclado, la esquina de una zona a medias y el foco: la capa del cursor no se repinta con el mundo.
    effect(() => {
      this.keyboardCursor();
      this.zoneAnchor();
      this.canvasFocused();
      this.drawKeyboardCursor();
    });
    // La razón de solo lectura llega por entrada; el store es quien rechaza ediciones y guardados.
    effect(() => {
      const locked = !!this.readOnlyReason();
      untracked(() => {
        this.store.readOnly.set(locked);
        if (locked && this.store.activeTool().startsWith('place-')) this.store.setTool('select');
      });
    });
    // Un 409 abre la comparación una sola vez; la respuesta decide qué hace el store.
    effect(() => {
      const conflict = this.store.conflict();
      if (conflict) untracked(() => this.openConflictDialog(conflict));
    });
  }

  ngOnInit(): void {
    // Load happens after view init
  }

  ngAfterViewInit(): void {
    this.initKonva();
    this.fitStageToHost();
    this.store.load(this.caseVersionId(), this.nodeId());
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
  }

  // ─── Teclado ───────────────────────────────────────────────────────────

  /**
   * Teclado del lienzo (RNF-04): solo con el foco en él, así las letras no secuestran la página (WCAG 2.1.4). Flechas
   * mueven lo seleccionado (o el cursor del teclado) una casilla, con Mayús ocho; Intro y Espacio actúan según la
   * herramienta; AvPág y RePág recorren los elementos; Supr borra; V, O, C, S y H eligen herramienta.
   */
  onCanvasKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || !this.store.editorState()) return;
    const letter = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.ctrlKey || event.metaKey) {
      if (letter === 'z') { event.preventDefault(); this.store.undo(); }
      else if (letter === 'y') { event.preventDefault(); this.store.redo(); }
      return;
    }
    if (event.altKey) return;

    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      this.arrowKey(event.key, event.shiftKey);
      return;
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.activateAtCursor();
        return;
      case 'Escape':
        if (this.zoneAnchor()) {
          event.preventDefault();
          this.zoneAnchor.set(null);
          this.announce('Zona cancelada');
        } else if (this.store.selectedKey()) {
          event.preventDefault();
          this.store.select(null);
          this.announce('Selección quitada');
        }
        return;
      case 'Delete':
      case 'Backspace':
        if (this.store.selectedKey() && !this.store.readOnly()) {
          event.preventDefault();
          const label = this.store.selectedObject()?.label ?? this.store.selectedZone()?.label ?? 'Zona';
          this.deleteSelected();
          this.announce(label + ' eliminado');
        }
        return;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        this.cycleSelection(event.key === 'PageUp');
        return;
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        return;
      case '-':
        event.preventDefault();
        this.zoomOut();
        return;
      case '0':
        event.preventDefault();
        this.zoomFit();
        return;
    }
    this.pickToolByLetter(event, letter);
  }

  /**
   * Las letras de herramienta también rigen con el foco en la barra de herramientas: es lo que anuncian sus
   * `aria-keyshortcuts` (WCAG 2.1.4: el atajo solo está activo con el foco en el propio componente).
   */
  onToolbarKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    this.pickToolByLetter(event, event.key.toLowerCase());
  }

  private pickToolByLetter(event: KeyboardEvent, letter: string): void {
    const tools: Record<string, EditorTool> = {
      v: 'select', o: 'place-object', c: 'place-collision', s: 'place-spawn', h: 'pan',
    };
    const tool = tools[letter];
    if (!tool) return;
    event.preventDefault();
    this.store.setTool(tool);
    this.zoneAnchor.set(null);
    this.announce('Herramienta: ' + TOOL_NAMES[tool]);
  }

  /**
   * Atajos que valen desde cualquier parte del editor (barra, lienzo, inspector): Ctrl+S guarda al instante, aun con
   * el foco en un campo; Ctrl+Z y Ctrl+Y deshacen y rehacen salvo dentro de un campo de texto (que tiene el suyo).
   */
  onEditorKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return;
    const letter = event.key.toLowerCase();
    if (letter === 's') {
      event.preventDefault();
      this.store.saveNow();
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
    if (typing) return;
    if (letter === 'z') { event.preventDefault(); this.store.undo(); }
    else if (letter === 'y') { event.preventDefault(); this.store.redo(); }
  }

  private announce(message: string): void {
    this.announcer.announce(message, 'polite');
  }

  /** Flechas: mueven el objeto o la zona seleccionados o, sin selección, el cursor del teclado. */
  private arrowKey(key: string, shift: boolean): void {
    const state = this.store.editorState();
    if (!state) return;
    // En solo lectura las flechas no editan: aunque haya algo seleccionado, mueven el cursor del teclado.
    const editable = !this.store.readOnly();
    const obj = editable ? this.store.selectedObject() : null;
    const zone = editable ? this.store.selectedZone() : null;
    if (obj) {
      const next = moveByKey({ x: obj.x, y: obj.y }, key, shift, GRID_SIZE, state.map);
      if (next && (next.x !== obj.x || next.y !== obj.y)) {
        this.store.execute(new MoveObjectCommand(obj.key, obj.x, obj.y, next.x, next.y));
      }
      if (next) {
        this.keyboardCursor.set(next);
        this.announce(obj.label + ': ' + next.x + ', ' + next.y);
      }
    } else if (zone) {
      const moved = moveByKey({ x: zone.x, y: zone.y }, key, shift, GRID_SIZE, state.map);
      if (moved) {
        // La zona entera tiene que caber: su esquina no pasa de (ancho del mapa − ancho de la zona).
        const next = {
          x: Math.max(0, Math.min(moved.x, state.map.width - zone.width)),
          y: Math.max(0, Math.min(moved.y, state.map.height - zone.height)),
        };
        if (next.x !== zone.x || next.y !== zone.y) {
          this.store.execute(new ResizeZoneCommand(
            zone.key,
            { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
            { ...next, width: zone.width, height: zone.height },
          ));
        }
        this.keyboardCursor.set(next);
        this.announce('Zona ' + (zone.label || zone.key) + ': ' + next.x + ', ' + next.y);
      }
    } else {
      const next = moveByKey(this.keyboardCursor(), key, shift, GRID_SIZE, state.map);
      if (!next) return;
      this.keyboardCursor.set(next);
      const hit = elementAt(state.objects, state.collisionZones, next);
      const under = hit ? ' · sobre ' + this.labelOf(hit.key) : '';
      this.announce('Cursor en ' + next.x + ', ' + next.y + under);
    }
  }

  /** Intro y Espacio: lo que hace un clic en el cursor del teclado con la herramienta activa. */
  private activateAtCursor(): void {
    const state = this.store.editorState();
    if (!state) return;
    const cursor = this.keyboardCursor();
    switch (this.store.activeTool()) {
      case 'select': {
        const hit = elementAt(state.objects, state.collisionZones, cursor);
        this.store.select(hit?.key ?? null);
        this.announce(hit ? this.selectionText(hit.key) : 'Nada en ' + cursor.x + ', ' + cursor.y);
        return;
      }
      case 'place-object': {
        const created = this.newObjectAt(cursor.x, cursor.y);
        this.store.execute(new PlaceObjectCommand(created));
        this.store.select(created.key);
        this.store.setTool('select');
        this.announce('Objeto colocado en ' + cursor.x + ', ' + cursor.y);
        return;
      }
      case 'place-collision': {
        const anchor = this.zoneAnchor();
        if (!anchor) {
          this.zoneAnchor.set(cursor);
          this.announce('Esquina fijada en ' + cursor.x + ', ' + cursor.y + '. Mueve el cursor y pulsa Intro para crear la zona.');
          return;
        }
        const rect = zoneBetween(anchor, cursor, GRID_SIZE);
        if (!rect) {
          this.announce('La zona mide menos de una casilla: mueve el cursor más lejos.');
          return;
        }
        const zone: WorldCollisionZone = { id: this.store.nextLocalId(), key: this.store.generateKey('zone'), label: null, ...rect };
        this.store.execute(new PlaceCollisionZoneCommand(zone));
        this.zoneAnchor.set(null);
        this.announce('Zona creada de ' + rect.width + ' por ' + rect.height);
        return;
      }
      case 'place-spawn':
        this.store.execute(new UpdateSpawnCommand(cursor.x, cursor.y));
        this.store.setTool('select');
        this.announce('Punto de aparición en ' + cursor.x + ', ' + cursor.y);
        return;
      default:
        return;
    }
  }

  /** AvPág / RePág: selecciona el elemento siguiente (o anterior): primero los objetos y luego las zonas. */
  private cycleSelection(backwards: boolean): void {
    const state = this.store.editorState();
    if (!state) return;
    const keys = [...state.objects.map(o => o.key), ...state.collisionZones.map(z => z.key)];
    const next = cycleKey(keys, this.store.selectedKey(), backwards);
    if (next === null) return;
    this.store.select(next);
    const target = state.objects.find(o => o.key === next) ?? state.collisionZones.find(z => z.key === next);
    if (target) this.keyboardCursor.set({ x: target.x, y: target.y });
    this.announce(this.selectionText(next));
  }

  private labelOf(key: string): string {
    const state = this.store.editorState();
    return state?.objects.find(o => o.key === key)?.label
      ?? (state?.collisionZones.find(z => z.key === key)?.label || 'zona');
  }

  private selectionText(key: string): string {
    const state = this.store.editorState();
    const obj = state?.objects.find(o => o.key === key);
    if (obj) return obj.label + ', ' + objectTypeLabel(obj.type) + ', en ' + obj.x + ', ' + obj.y;
    const zone = state?.collisionZones.find(z => z.key === key);
    return zone
      ? 'Zona ' + (zone.label || zone.key) + ', ' + zone.width + ' por ' + zone.height + ', en ' + zone.x + ', ' + zone.y
      : key;
  }

  /** El objeto con que arranca un «Colocar objeto» (clic o teclado). */
  private newObjectAt(x: number, y: number): WorldObject {
    return {
      id: this.store.nextLocalId(),
      key: this.store.generateKey('obj'),
      label: 'Nuevo objeto',
      type: 'OBJECT' as WorldObjectType,
      x, y,
      width: 48, height: 48,
      zIndex: 0,
      facing: 'down',
      colorHex: '#4FA3A5',
      icon: 'psychology',
      shortCode: 'NEW',
      collision: false,
      visible: true,
      interactionPrompt: 'Interactuar',
      interactionText: '',
      decisionOptionId: null,
      toolCode: null,
      unlockCondition: {},
      movementPattern: {},
      metadata: {}
    };
  }

  /** La comparación del 409 (RNF-08, REGLA-011): el store decide con la respuesta («Reintentar» o «Recargar»). */
  private openConflictDialog(conflict: RevisionConflict): void {
    if (this.conflictDialogOpen) return;
    this.conflictDialogOpen = true;
    const ref = this.dialog.open<RevisionConflictAnswer, RevisionConflictDialogData, RevisionConflictDialogComponent>(
      RevisionConflictDialogComponent,
      {
        size: 'md',
        data: {
          mineRevision: this.store.definition()?.revision ?? null,
          currentRevision: conflict.revision,
          changes: ['Otra sesión guardó cambios en este caso mientras editabas esta sala.'],
        },
      },
    );
    ref.closed.subscribe(answer => {
      this.conflictDialogOpen = false;
      if (answer === 'retry') this.store.retryAfterConflict();
      else if (answer === 'reload') this.store.reloadAfterConflict();
    });
  }

  // ─── Zoom controls ────────────────────────────────────────────────────

  zoomIn(): void {
    this.zoomAroundCenter(1.2);
  }

  zoomOut(): void {
    this.zoomAroundCenter(1 / 1.2);
  }

  /** Ajusta el mapa a la vista y lo centra (antes solo cambiaba la escala y el mapa quedaba en una esquina). */
  zoomFit(): void {
    if (!this.stage) return;
    const state = this.store.editorState();
    if (!state) return;
    this.commitView(fitView({ width: this.stage.width(), height: this.stage.height() }, state.map));
  }

  private zoomAroundCenter(factor: number): void {
    if (!this.stage) return;
    const center = { x: this.stage.width() / 2, y: this.stage.height() / 2 };
    this.commitView(zoomAtPoint(this.currentView(), center, this.store.zoom() * factor));
  }

  private currentView(): CanvasView {
    const pan = this.store.panOffset();
    return { zoom: this.store.zoom(), x: pan.x, y: pan.y };
  }

  /** La vista del store (zoom y desplazamiento) pasa a la etapa. */
  private commitView(view: CanvasView): void {
    this.store.setZoom(view.zoom);
    this.store.setPan(view.x, view.y);
    this.applyView();
  }

  // ─── Inspector actions ────────────────────────────────────────────────

  selectedSceneTemplate(): string {
    return selectedSceneTemplateId(this.store.editorState()?.map);
  }

  applyScenePreset(templateId: string): void {
    const state = this.store.editorState();
    const template = this.sceneTemplates.find(t => t.id === templateId);
    if (!state || !template) return;
    this.store.execute(new SetMapFieldsCommand(applySceneTemplate(state.map, template)));
  }

  addTemplate(templateId: string): void {
    const state = this.store.editorState();
    const template = objectTemplateById(templateId);
    if (!state || !template) return;
    const offset = state.objects.length * 8;
    const x = this.snapToGrid(Math.min(state.map.width - 64, state.map.spawnX + 64 + offset));
    const y = this.snapToGrid(Math.min(state.map.height - 64, state.map.spawnY + offset));
    const keyPrefix = template.type === 'PERSON' ? 'npc' : template.id;
    const obj = buildObjectFromTemplate(template, this.store.generateKey(keyPrefix), x, y, this.store.nextLocalId());
    this.store.execute(new PlaceObjectCommand(obj));
    this.store.select(obj.key);
  }

  updateObjectField(key: string, field: string, value: unknown): void {
    this.store.execute(new UpdateInspectorCommand(key, { [field]: value } as Partial<WorldObject>));
  }

  /** Lo mismo que dibuja el mundo (personCharacterRef), para la vista previa. */
  npcVisual(obj: WorldObject) {
    const bundle = this.kit.bundle();
    return bundle ? resolveCharacter(bundle, personCharacterRef(bundle, obj)) : null;
  }

  /** Receta elegida, o '' si el NPC es personalizado (avatar autorado). */
  npcRecipeChoice(obj: WorldObject): string {
    const bundle = this.kit.bundle();
    if (!bundle) return '';
    const ref = personCharacterRef(bundle, obj);
    return ref.kind === 'receta' ? ref.recipeId : '';
  }

  npcCustom(obj: WorldObject): AvatarPersonalizado {
    return npcCustomAvatar(obj.metadata);
  }

  setNpcRecipe(key: string, recipeId: string): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.updateNpcMetadataTo(key, recipeId
      ? npcMetadataForRecipe(obj.metadata, recipeId)
      : npcMetadataForCustom(obj.metadata, npcCustomAvatar(obj.metadata)));
  }

  setNpcCustom(key: string, patch: Partial<AvatarPersonalizado>): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.updateNpcMetadataTo(key, npcMetadataForCustom(obj.metadata, { ...npcCustomAvatar(obj.metadata), ...patch }));
  }

  private updateNpcMetadataTo(key: string, metadata: Record<string, unknown>): void {
    this.store.execute(new UpdateInspectorCommand(key, { metadata }));
  }

  updateZoneLabel(key: string, label: string): void {
    const zone = this.store.editorState()?.collisionZones.find(z => z.key === key);
    if (!zone) return;
    this.store.execute(new SetZoneLabelCommand(key, label));
  }

  deleteSelected(): void {
    const key = this.store.selectedKey();
    if (!key) return;
    if (this.store.selectedObject()) {
      this.store.execute(new DeleteObjectWithDialogueCommand(key));
    } else if (this.store.selectedZone()) {
      this.store.execute(new DeleteCollisionZoneCommand(key));
    }
    this.store.select(null);
  }

  deleteSelectedZone(): void {
    const key = this.store.selectedKey();
    if (!key) return;
    this.store.execute(new DeleteCollisionZoneCommand(key));
    this.store.select(null);
  }

  // ─── Dialogue authoring ───────────────────────────────────────────────
  private commit(tree: WorldDialogueTree): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.store.execute(new UpsertDialogueCommand(obj.key, tree));
  }

  addDialogue(): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    const tree: WorldDialogueTree = {
      id: this.store.nextLocalId(),
      key: `dlg-${obj.key}`,
      speakerName: obj.label,
      portraitKey: null,
      emotion: 'neutral',
      mapObjectId: obj.id ?? null,
      mapObjectKey: obj.key,
      lines: [],
      choices: []
    };
    this.commit(tree);
  }

  removeDialogue(): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.store.execute(new DeleteDialogueCommand(obj.key));
  }

  updateDialogueField(field: 'speakerName' | 'emotion', value: string): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    this.commit({ ...tree, [field]: value });
  }

  addLine(): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const line: WorldDialogueLine = {
      order: tree.lines.length, speakerName: tree.speakerName, text: '', emotion: tree.emotion
    };
    this.commit({ ...tree, lines: [...tree.lines, line] });
  }

  updateLine(index: number, text: string): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const lines = tree.lines.map((l, i) => i === index ? { ...l, text } : l);
    this.commit({ ...tree, lines });
  }

  removeLine(index: number): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const lines = tree.lines.filter((_, i) => i !== index).map((l, i) => ({ ...l, order: i }));
    this.commit({ ...tree, lines });
  }

  addChoice(): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const choice: WorldDialogueChoice = {
      key: `ch-${Date.now().toString(36)}`, text: '', decisionOptionId: null,
      requiredToolCode: null, effect: {}, displayOrder: tree.choices.length
    };
    this.commit({ ...tree, choices: [...tree.choices, choice] });
  }

  updateChoiceText(index: number, text: string): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const choices = tree.choices.map((c, i) => i === index ? { ...c, text } : c);
    this.commit({ ...tree, choices });
  }

  setChoiceDecision(index: number, decisionOptionId: number | null): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const choices = tree.choices.map((c, i) => i === index ? { ...c, decisionOptionId } : c);
    this.commit({ ...tree, choices });
  }

  setChoiceRequiredTool(index: number, requiredToolCode: string | null): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const code = requiredToolCode && requiredToolCode.trim() ? requiredToolCode.trim() : null;
    const choices = tree.choices.map((c, i) => i === index ? { ...c, requiredToolCode: code } : c);
    this.commit({ ...tree, choices });
  }

  choiceEvidenceList(choice: WorldDialogueChoice, field: 'requiresNpcs' | 'requiresTools' | 'requiresInspected'): string {
    const value = (choice.effect as Record<string, unknown> | undefined)?.[field];
    return Array.isArray(value) ? value.filter(v => typeof v === 'string').join(', ') : '';
  }

  setChoiceEvidenceList(index: number, field: 'requiresNpcs' | 'requiresTools' | 'requiresInspected', raw: string): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const list = raw.split(',').map(v => v.trim()).filter(Boolean);
    const choices = tree.choices.map((c, i) => {
      if (i !== index) return c;
      const effect = { ...(c.effect ?? {}) } as Record<string, unknown>;
      if (list.length) effect[field] = list;
      else delete effect[field];
      return { ...c, effect };
    });
    this.commit({ ...tree, choices });
  }

  removeChoice(index: number): void {
    const tree = this.store.selectedDialogue();
    if (!tree) return;
    const choices = tree.choices.filter((_, i) => i !== index).map((c, i) => ({ ...c, displayOrder: i }));
    this.commit({ ...tree, choices });
  }

  // ─── Movement authoring ───────────────────────────────────────────────
  movementType(obj: WorldObject): string {
    const t = (obj.movementPattern as { type?: string } | undefined)?.type;
    return t === 'wander' || t === 'patrol' ? t : 'idle';
  }
  wanderRadiusOf(obj: WorldObject): number { return wanderRadius(obj.movementPattern); }
  patrolPointsOf(obj: WorldObject): Array<[number, number]> { return patrolPoints(obj.movementPattern); }

  private setPattern(key: string, pattern: Record<string, unknown>): void {
    this.store.execute(new UpdateInspectorCommand(key, { movementPattern: pattern }));
  }
  setMovement(key: string, type: 'idle' | 'wander' | 'patrol'): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.setPattern(key, setPatternType(obj.movementPattern, type));
    if (type !== 'patrol') this.store.pathEditMode.set(false);
  }
  setRadius(key: string, radius: number): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.setPattern(key, setWanderRadius(obj.movementPattern, Number(radius)));
  }
  deleteWaypoint(key: string, idx: number): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.setPattern(key, removePatrolPoint(obj.movementPattern, idx));
  }
  moveWaypointOrder(key: string, idx: number, dir: 1 | -1): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.setPattern(key, reorderPatrolPoint(obj.movementPattern, idx, dir));
  }

  // ─── Doors (EXIT objects) ─────────────────────────────────────────────
  otherRooms() {
    const cur = this.store.definition()?.nodeId;
    return this.store.rooms().filter(r => r.nodeId !== cur);
  }
  doorTargetOf(obj: WorldObject): string { return doorTarget(obj.metadata); }
  doorEntryOf(obj: WorldObject): [number, number] { return doorEntry(obj.metadata); }
  setDoorTargetFor(key: string, nodeKey: string): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.store.execute(new UpdateInspectorCommand(key, { metadata: setDoorTarget(obj.metadata, nodeKey) }));
  }
  setDoorEntryFor(key: string, x: number, y: number): void {
    const obj = this.store.selectedObject();
    if (!obj) return;
    this.store.execute(new UpdateInspectorCommand(key, { metadata: setDoorEntry(obj.metadata, x, y) }));
  }

  // ─── Room settings (switcher + zoom + background) ─────────────────────
  roomZoom(): number { return cameraZoom(this.store.editorState()?.map.ambient); }
  roomBg(): string { return backgroundImage(this.store.editorState()?.map.ambient); }
  /** Cambia de sala guardando antes lo pendiente en la de origen (si el guardado falla, no se cambia). */
  switchRoom(nodeId: number): void {
    if (nodeId != null) this.store.switchRoom(nodeId);
  }
  /**
   * El selector de sala es CONTROLADO: pide la sala elegida y vuelve a mostrar la que hay en pantalla; solo cambia
   * cuando la nueva llega. Antes quedaba mostrando la sala elegida aunque el guardado previo fallara (o la carga
   * tardara) y las ediciones siguientes iban a la sala de origen creyendo que eran de la nueva.
   */
  onRoomChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const chosen = Number(select.value);
    if (Number.isFinite(chosen)) this.switchRoom(chosen);
    select.value = String(this.store.definition()?.nodeId ?? '');
  }
  setRoomZoom(z: number): void {
    const st = this.store.editorState();
    if (!st) return;
    this.store.execute(new SetMapAmbientCommand(setCameraZoom(st.map.ambient, Number(z))));
  }
  setRoomBg(url: string): void {
    const st = this.store.editorState();
    if (!st) return;
    this.store.execute(new SetMapAmbientCommand(setBackgroundImage(st.map.ambient, url)));
  }

  // ─── Konva initialization ─────────────────────────────────────────────

  private initKonva(): void {
    if (!this.konvaHost) return;

    const container = this.konvaHost.nativeElement;
    const width = container.clientWidth || 960;
    const height = 540;

    this.stage = new Konva.Stage({
      container,
      width,
      height
    });

    this.backgroundLayer = new Konva.Layer();
    // Pixel art: el fondo se pinta sin suavizar (la rejilla va encima, en su propia capa).
    this.backgroundLayer.imageSmoothingEnabled(false);
    this.gridLayer = new Konva.Layer();
    this.mainLayer = new Konva.Layer();
    this.uiLayer = new Konva.Layer();

    this.cursorLayer = new Konva.Layer({ listening: false });

    this.stage.add(this.backgroundLayer);
    this.stage.add(this.gridLayer);
    this.stage.add(this.mainLayer);
    this.stage.add(this.uiLayer);
    this.stage.add(this.cursorLayer);

    // Mouse events for tools
    this.stage.on('mousedown touchstart', (e) => this.onStageMouseDown(e));
    this.stage.on('mousemove touchmove', (e) => this.onStageMouseMove(e));
    this.stage.on('mouseup touchend', () => this.onStageMouseUp());
    this.stage.on('click tap', (e) => this.onStageClick(e));
    this.stage.on('mouseleave', () => this.setHover('none'));

    // Paneo con la herramienta «Mover lienzo»: la etapa se arrastra y el desplazamiento vuelve al store.
    // Los arrastres de un objeto o de una zona también suben hasta la etapa: solo cuenta el de la etapa misma.
    this.stage.on('dragstart', (e) => {
      if (e.target !== this.stage) return;
      this.panning = true;
      this.refreshCursor();
    });
    this.stage.on('dragend', (e) => {
      if (e.target !== this.stage || !this.stage) return;
      this.panning = false;
      this.store.setPan(this.stage.x(), this.stage.y());
      this.refreshCursor();
    });

    // Zoom con la rueda: hacia el cursor (el punto bajo el puntero no se mueve).
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const pointer = this.stage?.getPointerPosition();
      if (!pointer) return;
      this.commitView(zoomAtPoint(this.currentView(), pointer, this.store.zoom() * wheelZoomFactor(e.evt.deltaY)));
    });

    // El lienzo sigue el ancho de su contenedor (antes 540 px fijos y sin reaccionar a nada).
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitStageToHost());
      this.resizeObserver.observe(container);
    }

    this.applyView();
    this.refreshCursor();
  }

  /** Ancho = el del contenedor; alto = el del mapa a ese ancho, entre 360 y 720 px. */
  private fitStageToHost(): void {
    const container = this.konvaHost?.nativeElement;
    if (!container || !this.stage) return;
    const width = Math.max(320, container.clientWidth);
    const map = this.store.editorState()?.map;
    const aspect = map && map.width > 0 ? map.height / map.width : 9 / 16;
    const height = Math.round(Math.min(720, Math.max(360, width * aspect)));
    if (this.stage.width() !== width || this.stage.height() !== height) {
      this.stage.size({ width, height });
      this.stage.batchDraw();
    }
  }

  /** El cursor de la herramienta activa y de lo que hay bajo el puntero (KON-4). */
  private refreshCursor(): void {
    const container = this.stage?.container();
    if (!container) return;
    container.style.cursor = cursorFor({ tool: this.store.activeTool(), hover: this.hover, panning: this.panning });
  }

  private setHover(hover: 'none' | 'object' | 'zone'): void {
    if (this.hover === hover) return;
    this.hover = hover;
    this.refreshCursor();
  }

  // ─── Rendering ────────────────────────────────────────────────────────

  private renderWorld(state: { map: { width: number; height: number; spawnX: number; spawnY: number; theme: string }; objects: WorldObject[]; collisionZones: WorldCollisionZone[]; dialogues: WorldDialogueTree[] }): void {
    if (!this.mainLayer || !this.gridLayer || !this.uiLayer || !this.backgroundLayer) return;

    this.mainLayer.destroyChildren();
    this.gridLayer.destroyChildren();
    this.uiLayer.destroyChildren();
    this.backgroundLayer.destroyChildren();
    this.transformer = null;
    this.nodesByKey.clear();
    this.hover = 'none';
    this.stage?.draggable(this.store.activeTool() === 'pan');
    this.refreshCursor();

    const { map, objects, collisionZones } = state;

    // ─── Grid + optional background image ───────────────────────────
    this.drawGrid(map.width, map.height);
    this.drawBackground(map.width, map.height);

    // ─── Map bounds ─────────────────────────────────────────────────
    this.mainLayer.add(new Konva.Rect({
      x: 0, y: 0,
      width: map.width, height: map.height,
      stroke: '#4f7cac',
      strokeWidth: 2,
      fill: 'transparent',
      dash: [6, 4],
      listening: false
    }));

    // ─── Collision zones ────────────────────────────────────────────
    for (const zone of collisionZones) {
      const group = new Konva.Group({
        x: zone.x, y: zone.y,
        name: zone.key,
        draggable: this.store.activeTool() === 'select' && !this.store.readOnly()
      });

      const rect = new Konva.Rect({
        width: zone.width,
        height: zone.height,
        fill: 'rgba(79,124,172,0.08)',
        stroke: 'rgba(79,124,172,0.4)',
        strokeWidth: 1,
        dash: [4, 3],
        cornerRadius: 3
      });
      group.add(rect);

      if (zone.label) {
        group.add(new Konva.Text({
          x: 4, y: 4,
          text: zone.label,
          fontSize: 10,
          fontFamily: 'Arial, sans-serif',
          fill: '#4f7cac',
          listening: false
        }));
      }

      group.on('click tap', (e) => {
        e.cancelBubble = true;
        this.store.select(zone.key);
      });

      // Resaltado al pasar (KON-5): borde y relleno más firmes, y el cursor de mover.
      group.on('mouseenter', () => {
        if (this.store.activeTool() !== 'select') return;
        rect.setAttrs({ fill: 'rgba(79,124,172,0.2)', stroke: 'rgba(79,124,172,0.9)', strokeWidth: 2 });
        this.setHover('zone');
        this.mainLayer?.batchDraw();
      });
      group.on('mouseleave', () => {
        rect.setAttrs({ fill: 'rgba(79,124,172,0.08)', stroke: 'rgba(79,124,172,0.4)', strokeWidth: 1 });
        this.setHover('none');
        this.mainLayer?.batchDraw();
      });

      // Arrastrar o cambiar el tamaño se guarda con el mismo comando (antes el arrastre se perdía).
      group.on('dragend transformend', () => this.commitZone(zone, group));

      this.mainLayer.add(group);
      this.nodesByKey.set(zone.key, group);
    }

    // ─── Objects ────────────────────────────────────────────────────
    for (const obj of objects) {
      const color = OBJECT_COLORS[obj.type] ?? '#4fa3a5';
      const group = new Konva.Group({
        x: obj.x, y: obj.y,
        name: obj.key,
        draggable: this.store.activeTool() === 'select' && !this.store.readOnly(),
        opacity: obj.visible ? 1 : 0.4
      });

      // Object body
      group.add(new Konva.Circle({
        radius: 18,
        fill: color,
        stroke: '#fff',
        strokeWidth: 2,
        shadowColor: color,
        shadowBlur: 8,
        shadowOpacity: 0.25
      }));

      // Short code label
      group.add(new Konva.Text({
        text: obj.shortCode || obj.key.slice(0, 3).toUpperCase(),
        fontSize: 9,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        fill: '#fff',
        align: 'center',
        width: 30,
        x: -15,
        y: -5,
        listening: false
      }));

      // Label below
      group.add(new Konva.Text({
        text: obj.label,
        fontSize: 10,
        fontFamily: 'Arial, sans-serif',
        fill: '#24323a',
        align: 'center',
        width: 100,
        x: -50,
        y: 22,
        listening: false
      }));

      // Badge for objects that have an authored dialogue
      if (state.dialogues?.some(d => d.mapObjectKey === obj.key)) {
        group.add(new Konva.Text({
          text: '💬', fontSize: 14, x: 8, y: -24, listening: false
        }));
      }

      // Door target label for EXIT objects
      if (obj.type === 'EXIT') {
        const target = doorTarget(obj.metadata);
        group.add(new Konva.Text({
          text: target ? '🚪 → ' + target : '🚪 (sin destino)',
          fontSize: 9, fontFamily: 'Arial, sans-serif', fill: '#a85064',
          align: 'center', width: 130, x: -65, y: 34, listening: false,
        }));
      }

      // Resaltado al pasar (KON-5): el cuerpo se agranda y su sombra se intensifica, y el cursor es el de mover.
      const body = group.findOne('Circle') as Konva.Circle | undefined;
      group.on('mouseenter', () => {
        if (this.store.activeTool() !== 'select') return;
        body?.setAttrs({ strokeWidth: 4, shadowBlur: 16, shadowOpacity: 0.5 });
        this.setHover('object');
        this.mainLayer?.batchDraw();
      });
      group.on('mouseleave', () => {
        body?.setAttrs({ strokeWidth: 2, shadowBlur: 8, shadowOpacity: 0.25 });
        this.setHover('none');
        this.mainLayer?.batchDraw();
      });

      // Drag events for undo-able move
      group.on('dragstart', () => {
        this.dragStart = { x: obj.x, y: obj.y };
      });
      group.on('dragend', () => {
        if (!this.dragStart) return;
        const newX = this.snapToGrid(group.x());
        const newY = this.snapToGrid(group.y());
        group.position({ x: newX, y: newY });
        this.store.execute(new MoveObjectCommand(
          obj.key, this.dragStart.x, this.dragStart.y, newX, newY
        ));
        this.dragStart = null;
      });

      group.on('click tap', (e) => {
        e.cancelBubble = true;
        this.store.select(obj.key);
      });

      this.mainLayer.add(group);
      this.nodesByKey.set(obj.key, group);
    }

    // ─── Spawn marker ───────────────────────────────────────────────
    this.spawnMarker = new Konva.Group({
      x: map.spawnX,
      y: map.spawnY,
      listening: false
    });
    this.spawnMarker.add(new Konva.Circle({
      radius: 10,
      fill: '#2f7c5f',
      stroke: '#fff',
      strokeWidth: 2,
      opacity: 0.8
    }));
    this.spawnMarker.add(new Konva.Text({
      text: 'SP',
      fontSize: 8,
      fontStyle: 'bold',
      fill: '#fff',
      align: 'center',
      width: 16,
      x: -8,
      y: -4,
      listening: false
    }));
    this.uiLayer.add(this.spawnMarker);

    this.drawPatternOverlay();
    this.attachTransformer();

    // Un mapa más grande que el lienzo se ve entero al abrirlo (la primera vez de cada sala).
    const room = untracked(() => this.store.definition()?.nodeId);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.viewInitialised = false;
    }
    if (!this.viewInitialised) {
      this.viewInitialised = true;
      this.fitStageToHost();
      if (this.stage && (map.width > this.stage.width() || map.height > this.stage.height())) this.zoomFit();
    }

    this.mainLayer.draw();
    this.uiLayer.draw();
    this.highlightSelected(this.store.selectedKey());
  }

  /**
   * La zona seleccionada con «Seleccionar» lleva ocho asas para cambiarle el tamaño (KON-7). Un tamaño por debajo de
   * una casilla se rechaza mientras se arrastra; al soltar, la geometría se encaja a la rejilla.
   */
  private attachTransformer(): void {
    if (!this.mainLayer || !this.uiLayer || this.store.activeTool() !== 'select' || this.store.readOnly()) return;
    const zone = this.store.selectedZone();
    if (!zone) return;
    const group = this.nodesByKey.get(zone.key);
    if (!group) return;
    this.transformer = new Konva.Transformer({
      rotateEnabled: false,
      keepRatio: false,
      ignoreStroke: true,
      padding: 0,
      anchorSize: 12,
      borderStroke: '#004876',
      borderStrokeWidth: 2,
      anchorStroke: '#004876',
      anchorFill: '#ffffff',
      boundBoxFunc: (oldBox, newBox) =>
        Math.abs(newBox.width) < GRID_SIZE || Math.abs(newBox.height) < GRID_SIZE ? oldBox : newBox,
    });
    // Primero a la capa y después los nodos: con `nodes` en la configuración las asas quedaban sin colocar.
    this.uiLayer.add(this.transformer);
    this.transformer.nodes([group]);
  }

  /** Confirma el sitio o el tamaño nuevo de una zona: encajado a la rejilla y como UN paso deshacible. */
  private commitZone(zone: WorldCollisionZone, group: Konva.Group): void {
    const next = snapZoneRect(
      { x: group.x(), y: group.y(), width: zone.width, height: zone.height, scaleX: group.scaleX(), scaleY: group.scaleY() },
      GRID_SIZE,
    );
    // La escala del transformador ya se aplicó al ancho y al alto: el nodo vuelve a escala 1.
    group.scale({ x: 1, y: 1 });
    group.position({ x: next.x, y: next.y });
    const unchanged = next.x === zone.x && next.y === zone.y && next.width === zone.width && next.height === zone.height;
    if (unchanged) {
      this.mainLayer?.batchDraw();
      return;
    }
    this.store.execute(new ResizeZoneCommand(
      zone.key,
      { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      next,
    ));
  }

  private readonly bgCache = new Map<string, HTMLImageElement>();
  private drawBackground(width: number, height: number): void {
    if (!this.backgroundLayer) return;
    const url = backgroundImage(this.store.editorState()?.map.ambient);
    if (!url) return;
    const add = (img: HTMLImageElement) => {
      if (!this.backgroundLayer) return;
      // En su capa (bajo la rejilla) y sin transparencia: el pixel art se ve como lo verá el jugador.
      this.backgroundLayer.add(new Konva.Image({ image: img, x: 0, y: 0, width, height, listening: false }));
      this.backgroundLayer.draw();
    };
    const cached = this.bgCache.get(url);
    if (cached && cached.complete) { add(cached); return; }
    const img = new Image();
    img.onload = () => { this.bgCache.set(url, img); add(img); };
    img.src = url;
  }

  private drawGrid(mapWidth: number, mapHeight: number): void {
    if (!this.gridLayer) return;

    // Fondo del mapa: en la capa de abajo, para que la imagen y la rejilla queden encima en este orden.
    this.backgroundLayer?.add(new Konva.Rect({
      x: 0, y: 0,
      width: mapWidth, height: mapHeight,
      fill: '#f8fbfd',
      listening: false
    }));
    this.backgroundLayer?.draw();

    // Grid lines
    for (let x = 0; x <= mapWidth; x += GRID_SIZE) {
      this.gridLayer.add(new Konva.Line({
        points: [x, 0, x, mapHeight],
        stroke: 'rgba(79,124,172,0.06)',
        strokeWidth: x % (GRID_SIZE * 4) === 0 ? 1 : 0.5,
        listening: false
      }));
    }
    for (let y = 0; y <= mapHeight; y += GRID_SIZE) {
      this.gridLayer.add(new Konva.Line({
        points: [0, y, mapWidth, y],
        stroke: 'rgba(79,124,172,0.06)',
        strokeWidth: y % (GRID_SIZE * 4) === 0 ? 1 : 0.5,
        listening: false
      }));
    }
    this.gridLayer.draw();
  }

  // ─── Mouse handlers ───────────────────────────────────────────────────

  private onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    // Konva cancela el `mousedown` del lienzo y el navegador ya no mueve el foco: sin esto, tras seleccionar con el
    // ratón Supr y las flechas no llegarían al lienzo (RNF-04).
    this.konvaHost?.nativeElement.focus({ preventScroll: true });
    const tool = this.store.activeTool();
    const pos = this.getPointerPos();
    if (!pos) return;

    if (tool === 'place-collision') {
      this.drawingZone = true;
      this.drawStart = { x: this.snapToGrid(pos.x), y: this.snapToGrid(pos.y) };
      this.drawRect = new Konva.Rect({
        x: this.drawStart.x,
        y: this.drawStart.y,
        width: 0, height: 0,
        fill: 'rgba(79,124,172,0.12)',
        stroke: 'rgba(79,124,172,0.5)',
        strokeWidth: 1,
        dash: [4, 3]
      });
      this.uiLayer?.add(this.drawRect);
    }
  }

  private onStageMouseMove(_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (!this.drawingZone || !this.drawRect) return;
    const pos = this.getPointerPos();
    if (!pos) return;

    const x = Math.min(this.drawStart.x, pos.x);
    const y = Math.min(this.drawStart.y, pos.y);
    const w = Math.abs(pos.x - this.drawStart.x);
    const h = Math.abs(pos.y - this.drawStart.y);

    this.drawRect.setAttrs({ x, y, width: w, height: h });
    this.uiLayer?.batchDraw();
  }

  private onStageMouseUp(): void {
    if (this.drawingZone && this.drawRect) {
      const x = this.snapToGrid(this.drawRect.x());
      const y = this.snapToGrid(this.drawRect.y());
      const w = this.snapToGrid(this.drawRect.width());
      const h = this.snapToGrid(this.drawRect.height());

      if (w >= GRID_SIZE && h >= GRID_SIZE) {
        const key = this.store.generateKey('zone');
        const zone: WorldCollisionZone = {
          id: this.store.nextLocalId(),
          key,
          label: null,
          x, y,
          width: w,
          height: h
        };
        this.store.execute(new PlaceCollisionZoneCommand(zone));
      }

      this.drawRect.destroy();
      this.drawRect = null;
      this.drawingZone = false;
      this.uiLayer?.batchDraw();
    }
  }

  private onStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    const tool = this.store.activeTool();
    const pos = this.getPointerPos();
    if (!pos) return;

    // Path-edit mode: clicking the canvas appends a waypoint to the selected patrol NPC.
    if (this.store.pathEditMode()) {
      const sel = this.store.selectedObject();
      if (sel && this.movementType(sel) === 'patrol') {
        const wx = this.snapToGrid(pos.x);
        const wy = this.snapToGrid(pos.y);
        this.setPattern(sel.key, withPatrolPoint(sel.movementPattern, wx, wy));
        return;
      }
    }

    // Click on empty space → deselect
    if (e.target === this.stage) {
      this.store.select(null);
    }

    if (tool === 'place-object') {
      const x = this.snapToGrid(pos.x);
      const y = this.snapToGrid(pos.y);
      const obj = this.newObjectAt(x, y);
      this.store.execute(new PlaceObjectCommand(obj));
      this.store.select(obj.key);
      this.store.setTool('select');
    }

    if (tool === 'place-spawn') {
      const x = this.snapToGrid(pos.x);
      const y = this.snapToGrid(pos.y);
      this.store.execute(new UpdateSpawnCommand(x, y));
      this.store.setTool('select');
    }
  }

  /** La cruz del cursor del teclado (solo con el foco en el lienzo) y la zona a medias entre su esquina y el cursor. */
  private drawKeyboardCursor(): void {
    if (!this.cursorLayer) return;
    this.cursorLayer.destroyChildren();
    if (this.canvasFocused()) {
      const { x, y } = this.keyboardCursor();
      const anchor = this.zoneAnchor();
      if (anchor) {
        this.cursorLayer.add(new Konva.Rect({
          x: Math.min(anchor.x, x), y: Math.min(anchor.y, y),
          width: Math.abs(x - anchor.x), height: Math.abs(y - anchor.y),
          stroke: '#004876', strokeWidth: 2, dash: [6, 4], fill: 'rgba(0,72,118,0.08)',
        }));
      }
      const arm = 12;
      this.cursorLayer.add(new Konva.Line({ points: [x - arm, y, x + arm, y], stroke: '#004876', strokeWidth: 3 }));
      this.cursorLayer.add(new Konva.Line({ points: [x, y - arm, x, y + arm], stroke: '#004876', strokeWidth: 3 }));
      this.cursorLayer.add(new Konva.Rect({
        x: x - 5, y: y - 5, width: 10, height: 10, stroke: '#ffffff', strokeWidth: 2, fill: '#004876',
      }));
    }
    this.cursorLayer.batchDraw();
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  private getPointerPos(): { x: number; y: number } | null {
    if (!this.stage) return null;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    // Account for zoom/pan
    const transform = this.mainLayer?.getAbsoluteTransform().copy().invert();
    if (transform) {
      return transform.point(pointer);
    }
    return pointer;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  /** Zoom y desplazamiento en la etapa (no por capa): el desplazamiento y el zoom hacia el cursor lo necesitan. */
  private applyView(): void {
    if (!this.stage) return;
    const zoom = this.store.zoom();
    const pan = this.store.panOffset();
    this.stage.scale({ x: zoom, y: zoom });
    this.stage.position({ x: pan.x, y: pan.y });
    this.stage.batchDraw();
  }

  private highlightSelected(key: string | null): void {
    if (!this.mainLayer) return;

    // Remove previous highlights
    this.mainLayer.find('.selection-ring').forEach(n => n.destroy());

    if (!key) { this.mainLayer.batchDraw(); return; }

    const node = this.nodesByKey.get(key);
    if (!node) { this.mainLayer.batchDraw(); return; }

    // Object selection ring
    if (this.store.selectedObject()) {
      const ring = new Konva.Circle({
        radius: 24,
        stroke: '#4f7cac',
        strokeWidth: 2,
        dash: [4, 3],
        fill: 'transparent',
        name: 'selection-ring',
        listening: false
      });
      node.add(ring);
    }
    // Una zona seleccionada no lleva anillo: sus asas (transformador) ya la marcan.

    this.mainLayer.batchDraw();
  }

  // ─── Movement pattern overlay (selected object) ───────────────────────
  private drawPatternOverlay(): void {
    if (!this.uiLayer) return;
    const sel = this.store.selectedObject();
    if (!sel) return;
    const type = (sel.movementPattern as { type?: string } | undefined)?.type;
    if (type === 'wander') {
      this.uiLayer.add(new Konva.Circle({
        x: sel.x, y: sel.y, radius: wanderRadius(sel.movementPattern),
        stroke: '#7a6f9e', dash: [6, 4], strokeWidth: 1, listening: false,
      }));
    } else if (type === 'patrol') {
      const pts = patrolPoints(sel.movementPattern);
      const flat: number[] = [sel.x, sel.y];
      for (const [px, py] of pts) flat.push(px, py);
      this.uiLayer.add(new Konva.Line({
        points: flat, stroke: '#7a6f9e', strokeWidth: 2, dash: [4, 4], listening: false,
      }));
      pts.forEach(([px, py], i) => {
        const handle = new Konva.Group({ x: px, y: py, draggable: true });
        handle.add(new Konva.Circle({ radius: 9, fill: '#7a6f9e', stroke: '#fff', strokeWidth: 2 }));
        handle.add(new Konva.Text({
          text: String(i + 1), fontSize: 9, fontStyle: 'bold', fill: '#fff',
          x: -9, y: -4, width: 18, align: 'center', listening: false,
        }));
        handle.on('dragend', () => {
          const nx = this.snapToGrid(handle.x());
          const ny = this.snapToGrid(handle.y());
          this.setPattern(sel.key, movePatrolPoint(sel.movementPattern, i, nx, ny));
        });
        this.uiLayer!.add(handle);
      });
    }
  }
}
