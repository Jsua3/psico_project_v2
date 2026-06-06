import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { SimulationService } from '../../core/api/simulation.service';
import {
  CaseEditorView,
  ClinicalToolEditorState,
  DecisionEdgeState,
  MapEditorState,
  MapObjectEditorState,
  NodeEditorState
} from '../../core/models/simulation.model';
import { DagEditorComponent } from './dag-editor.component';
import { WorldPreviewComponent } from './world-preview.component';
import { WorldEditorComponent } from './world-editor';
import { ConfirmDialogComponent } from '../../shared/confirm/confirm-dialog.component';

type EditorPanel =
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

@Component({
  selector: 'app-case-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatProgressBarModule, MatTabsModule, DagEditorComponent, WorldPreviewComponent, WorldEditorComponent, ConfirmDialogComponent],
  template: `
    <section class="editor-page">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) {
        <div class="state-error" role="alert"><mat-icon>error</mat-icon>{{ error() }}</div>
      }

      @if (editor(); as model) {
        <!-- Hero -->
        <header class="editor-hero liquid-glass psy-game-panel">
          <div>
            <p class="psy-eyebrow">Editor visual administrativo</p>
            <h2>{{ model.title }}</h2>
            <p class="editor-meta">Versión {{ model.semanticVersion }} · {{ model.status }} · Checklist {{ model.checklistCompletion }}%</p>
          </div>
          <div class="editor-actions">
            <button class="psy-button psy-button--glass" type="button" (click)="clone(model.caseVersionId)" [disabled]="busy()">
              <mat-icon>content_copy</mat-icon>Clonar versión
            </button>
            <button class="psy-button psy-button--primary" type="button" [disabled]="!model.publishable || busy()" (click)="publish(model.caseVersionId)">
              <mat-icon>publish</mat-icon>Publicar
            </button>
          </div>
        </header>

        <div class="editor-layout">
          <mat-tab-group class="editor-tabs liquid-glass" animationDuration="200ms">

            <!-- ── TAB: Grafo DAG ─────────────────────────────────────────── -->
            <mat-tab label="Grafo DAG">
              <div class="tab-body">
                <div class="tab-toolbar">
                  <button class="psy-button psy-button--primary" type="button" (click)="openPanel({ kind: 'node-create' })">
                    <mat-icon>add_circle</mat-icon>Nuevo nodo
                  </button>
                  <button class="psy-button psy-button--glass" type="button" (click)="openPanel({ kind: 'decision-create' })">
                    <mat-icon>add_link</mat-icon>Nueva decisión
                  </button>
                </div>
                <app-dag-editor
                  [nodes]="model.nodes"
                  [edges]="model.decisions"
                  (nodeEdit)="openPanel({ kind: 'node-edit', node: $event })"
                  (nodeDelete)="confirmDeleteNode(model.caseVersionId, $event)"
                  (edgeEdit)="openPanel({ kind: 'decision-edit', edge: $event })"
                  (addEdge)="openPanel({ kind: 'decision-create', sourceNode: $event })" />
              </div>
            </mat-tab>

            <!-- ── TAB: Mapas ─────────────────────────────────────────────── -->
            <mat-tab label="Mapas">
              <div class="tab-body">
                <div class="tab-toolbar">
                  <button class="psy-button psy-button--primary" type="button" (click)="openPanel({ kind: 'map-create' })">
                    <mat-icon>add_circle</mat-icon>Nuevo mapa
                  </button>
                </div>
                <div class="tab-grid">
                  @for (map of model.maps; track map.id) {
                    <article class="editor-card">
                      <div class="card-head">
                        <span class="psy-chip">{{ map.theme }}</span>
                        <div class="card-actions">
                          <button class="psy-icon-button" type="button" (click)="openPanel({ kind: 'map-edit', map })"><mat-icon>edit</mat-icon></button>
                          <button class="psy-icon-button" type="button" (click)="confirmDeleteMap(model.caseVersionId, map)"><mat-icon>delete_outline</mat-icon></button>
                        </div>
                      </div>
                      <h3>{{ map.title }}</h3>
                      <p>{{ map.width }}×{{ map.height }} · spawn {{ map.spawnX }}, {{ map.spawnY }} · nodo <code>{{ map.nodeKey }}</code></p>
                      <button class="psy-button psy-button--ghost" type="button" (click)="openPanel({ kind: 'object-create', mapId: map.id })">
                        <mat-icon>add</mat-icon>Agregar objeto al mapa
                      </button>
                    </article>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- ── TAB: Objetos ───────────────────────────────────────────── -->
            <mat-tab label="Objetos">
              <div class="tab-body">
                <div class="tab-grid">
                  @for (obj of model.objects; track obj.id) {
                    <article class="editor-card">
                      <div class="card-head">
                        <span class="psy-chip" [style.background]="obj.colorHex + '22'" [style.color]="obj.colorHex">{{ obj.type }}</span>
                        <div class="card-actions">
                          <button class="psy-icon-button" type="button" (click)="openPanel({ kind: 'object-edit', obj })"><mat-icon>edit</mat-icon></button>
                          <button class="psy-icon-button" type="button" (click)="confirmDeleteObject(model.caseVersionId, obj)"><mat-icon>delete_outline</mat-icon></button>
                        </div>
                      </div>
                      <h3>{{ obj.label }}</h3>
                      <p>{{ obj.interactionPrompt }}</p>
                      <p class="editor-card-meta">
                        {{ obj.x }}, {{ obj.y }} · {{ obj.shortCode }}
                        @if (obj.toolCode) { · herramienta {{ obj.toolCode }} }
                        @if (obj.decisionOptionId) { · decisión #{{ obj.decisionOptionId }} }
                      </p>
                    </article>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- ── TAB: Herramientas ──────────────────────────────────────── -->
            <mat-tab label="Herramientas">
              <div class="tab-body">
                <div class="tab-toolbar">
                  <button class="psy-button psy-button--primary" type="button" (click)="openPanel({ kind: 'tool-create' })">
                    <mat-icon>add_circle</mat-icon>Nueva herramienta
                  </button>
                </div>
                <div class="tab-grid">
                  @for (tool of model.tools; track tool.id) {
                    <article class="editor-card">
                      <div class="card-head">
                        <mat-icon>{{ tool.icon }}</mat-icon>
                        <div class="card-actions">
                          <button class="psy-icon-button" type="button" (click)="openPanel({ kind: 'tool-edit', tool })"><mat-icon>edit</mat-icon></button>
                          <button class="psy-icon-button" type="button" (click)="confirmDeleteTool(model.caseVersionId, tool)"><mat-icon>delete_outline</mat-icon></button>
                        </div>
                      </div>
                      <h3>{{ tool.label }}</h3>
                      <p class="psy-chip">{{ tool.code }}</p>
                      <p>{{ tool.description }}</p>
                    </article>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- ── TAB: Rúbricas ──────────────────────────────────────────── -->
            <mat-tab label="Rúbricas">
              <div class="tab-body">
                @for (rubric of model.rubrics; track rubric.rubricId) {
                  <section class="rubric-section">
                    <h3>{{ rubric.rubricName }}</h3>
                    <p>{{ rubric.description }}</p>
                    <div class="tab-grid">
                      @for (criterion of rubric.criteria; track criterion.id) {
                        <article class="editor-card">
                          <span class="psy-chip">{{ criterion.competency }}</span>
                          <h3>{{ criterion.title }}</h3>
                          <p>{{ criterion.description }}</p>
                          <p class="editor-card-meta">Puntaje máximo: {{ criterion.maxScore }}</p>
                        </article>
                      }
                    </div>
                  </section>
                }
              </div>
            </mat-tab>

            <!-- ── TAB: Checklist ─────────────────────────────────────────── -->
            <mat-tab label="Checklist ético">
              <div class="tab-body">
                <div class="checklist-layout">
                  <div class="check-ring" [style.--progress]="model.checklistCompletion + '%'">
                    {{ model.checklistCompletion }}%
                  </div>
                  <div class="checklist-form">
                    <h3>{{ model.publishable ? 'Listo para publicación' : 'Pendiente de validación' }}</h3>
                    <p>La publicación queda bloqueada hasta que el checklist ético y académico alcance el 100%.</p>
                    @if (checklistForm) {
                      <form [formGroup]="checklistForm" (ngSubmit)="saveChecklist(model.caseVersionId)" class="check-items">
                        <label class="check-item">
                          <input type="checkbox" formControlName="contentOriginal" />
                          <span>Contenido original — sin copiar personajes, mapas ni narrativa comercial.</span>
                        </label>
                        <label class="check-item">
                          <input type="checkbox" formControlName="ethicsReviewed" />
                          <span>Revisión ética — caso validado por experto o comité.</span>
                        </label>
                        <label class="check-item">
                          <input type="checkbox" formControlName="safetyProtocols" />
                          <span>Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.</span>
                        </label>
                        <label class="check-item">
                          <input type="checkbox" formControlName="noStigmatizing" />
                          <span>Sin lenguaje estigmatizante ni estereotipos clínicos.</span>
                        </label>
                        <label class="check-item">
                          <input type="checkbox" formControlName="triggerWarnings" />
                          <span>Advertencias de contenido sensible configuradas en nodos.</span>
                        </label>
                        <label class="check-item">
                          <input type="checkbox" formControlName="accessibilityOk" />
                          <span>Accesibilidad — fallback accesible y controles táctiles probados.</span>
                        </label>
                        <button class="psy-button psy-button--primary" type="submit" [disabled]="busy()">
                          <mat-icon>save</mat-icon>Guardar checklist
                        </button>
                      </form>
                    }
                  </div>
                </div>
              </div>
            </mat-tab>

            <!-- ── TAB: Mundo (Fase 4 — Editor visual Konva) ────────────── -->
            <mat-tab label="Mundo">
              <div class="tab-body">
                @if (selectedWorldNodeId()) {
                  <app-world-editor
                    [caseVersionId]="model.caseVersionId"
                    [nodeId]="selectedWorldNodeId()!" />
                } @else {
                  <div class="world-node-picker">
                    <mat-icon>map</mat-icon>
                    <h3>Selecciona un nodo para editar su mundo</h3>
                    <div class="world-node-grid">
                      @for (node of model.nodes; track node.id) {
                        <button class="psy-button psy-button--glass" type="button" (click)="selectedWorldNodeId.set(node.id)">
                          <mat-icon>{{ node.startNode ? 'play_circle' : node.terminal ? 'stop_circle' : 'radio_button_unchecked' }}</mat-icon>
                          {{ node.key }} — {{ node.title }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </mat-tab>

            <!-- ── TAB: Vista previa (Fase 5 — Preview real efimero) ─────── -->
            <mat-tab label="Vista previa">
              <div class="tab-body">
                <app-world-preview
                  [caseVersionId]="model.caseVersionId"
                  [nodes]="previewNodeOptions(model)" />
              </div>
            </mat-tab>
          </mat-tab-group>

          <!-- ── Side panel for forms ──────────────────────────────────────── -->
          @if (panel()) {
            <aside class="side-panel liquid-glass" role="dialog" [attr.aria-label]="panelTitle()">
              <header class="side-panel-head">
                <h3>{{ panelTitle() }}</h3>
                <button class="psy-icon-button" type="button" (click)="closePanel()"><mat-icon>close</mat-icon></button>
              </header>

              <!-- Node form -->
              @if (panel()?.kind === 'node-create' || panel()?.kind === 'node-edit') {
                @if (nodeForm) {
                  <form [formGroup]="nodeForm" (ngSubmit)="saveNode(editor()!.caseVersionId)" class="side-form">
                    <label class="form-field">
                      <span>Clave del nodo *</span>
                      <input formControlName="nodeKey" placeholder="urgencias-crisis" />
                    </label>
                    <label class="form-field">
                      <span>Título *</span>
                      <input formControlName="title" placeholder="Sala de urgencias" />
                    </label>
                    <label class="form-field">
                      <span>Narrativa *</span>
                      <textarea formControlName="narrative" rows="4"></textarea>
                    </label>
                    <label class="form-field">
                      <span>Mensaje de advertencia</span>
                      <input formControlName="warningMessage" placeholder="Contenido sensible: violencia..." />
                    </label>
                    <div class="form-checks">
                      <label class="check-item"><input type="checkbox" formControlName="startNode" /><span>Nodo inicial</span></label>
                      <label class="check-item"><input type="checkbox" formControlName="terminal" /><span>Nodo terminal</span></label>
                      <label class="check-item"><input type="checkbox" formControlName="sensitiveContent" /><span>Contenido sensible</span></label>
                      <label class="check-item"><input type="checkbox" formControlName="safeExitRequired" /><span>Salida segura obligatoria</span></label>
                    </div>
                    <div class="form-row">
                      <label class="form-field">
                        <span>Posición X</span>
                        <input type="number" formControlName="positionX" />
                      </label>
                      <label class="form-field">
                        <span>Posición Y</span>
                        <input type="number" formControlName="positionY" />
                      </label>
                    </div>
                    <div class="form-actions">
                      <button class="psy-button psy-button--ghost" type="button" (click)="closePanel()">Cancelar</button>
                      <button class="psy-button psy-button--primary" type="submit" [disabled]="nodeForm.invalid || busy()">
                        <mat-icon>save</mat-icon>Guardar nodo
                      </button>
                    </div>
                  </form>
                }
              }

              <!-- Decision form -->
              @if (panel()?.kind === 'decision-create' || panel()?.kind === 'decision-edit') {
                @if (decisionForm) {
                  <form [formGroup]="decisionForm" (ngSubmit)="saveDecision(editor()!.caseVersionId)" class="side-form">
                    <label class="form-field">
                      <span>Nodo origen *</span>
                      <select formControlName="sourceNodeId">
                        @for (n of editor()!.nodes; track n.id) {
                          <option [value]="n.id">{{ n.key }} — {{ n.title }}</option>
                        }
                      </select>
                    </label>
                    <label class="form-field">
                      <span>Nodo destino *</span>
                      <select formControlName="targetNodeId">
                        @for (n of editor()!.nodes; track n.id) {
                          <option [value]="n.id">{{ n.key }} — {{ n.title }}</option>
                        }
                      </select>
                    </label>
                    <label class="form-field">
                      <span>Texto de la decisión *</span>
                      <textarea formControlName="text" rows="3" placeholder="Escucha activa y validación emocional..."></textarea>
                    </label>
                    <label class="form-field">
                      <span>Clasificación *</span>
                      <select formControlName="classification">
                        <option value="ADEQUATE">Adecuada</option>
                        <option value="RISKY">Riesgosa</option>
                        <option value="INADEQUATE">Inadecuada</option>
                      </select>
                    </label>
                    <div class="form-row">
                      <label class="form-field">
                        <span>Δ Puntaje</span>
                        <input type="number" formControlName="scoreDelta" />
                      </label>
                      <label class="form-field">
                        <span>Δ Estrés %</span>
                        <input type="number" formControlName="stressDelta" />
                      </label>
                    </div>
                    <label class="form-field">
                      <span>Feedback inmediato</span>
                      <textarea formControlName="immediateFeedback" rows="2"></textarea>
                    </label>
                    <label class="check-item">
                      <input type="checkbox" formControlName="prohibitedConduct" />
                      <span>Conducta prohibida (penalización grave)</span>
                    </label>
                    @if (decisionForm.get('prohibitedConduct')?.value) {
                      <label class="form-field">
                        <span>Razón de prohibición *</span>
                        <input formControlName="prohibitionReason" />
                      </label>
                      <label class="form-field">
                        <span>Penalización de puntaje</span>
                        <input type="number" formControlName="prohibitedPenalty" />
                      </label>
                    }
                    <div class="form-actions">
                      <button class="psy-button psy-button--ghost" type="button" (click)="closePanel()">Cancelar</button>
                      <button class="psy-button psy-button--primary" type="submit" [disabled]="decisionForm.invalid || busy()">
                        <mat-icon>save</mat-icon>Guardar decisión
                      </button>
                    </div>
                  </form>
                }
              }

              <!-- Map form -->
              @if (panel()?.kind === 'map-create' || panel()?.kind === 'map-edit') {
                @if (mapForm) {
                  <form [formGroup]="mapForm" (ngSubmit)="saveMap(editor()!.caseVersionId)" class="side-form">
                    <label class="form-field">
                      <span>Nodo asociado *</span>
                      <select formControlName="nodeId">
                        @for (n of editor()!.nodes; track n.id) {
                          <option [value]="n.id">{{ n.key }} — {{ n.title }}</option>
                        }
                      </select>
                    </label>
                    <label class="form-field">
                      <span>Clave del mapa *</span>
                      <input formControlName="mapKey" placeholder="urgencias-crisis-map" />
                    </label>
                    <label class="form-field">
                      <span>Título del mapa *</span>
                      <input formControlName="title" placeholder="Sala de urgencias hospitalaria" />
                    </label>
                    <label class="form-field">
                      <span>Tema visual</span>
                      <select formControlName="theme">
                        <option value="clinical-soft">Clinical soft</option>
                        <option value="protection-route">Ruta de protección</option>
                        <option value="technical-record">Registro técnico</option>
                        <option value="risk-assessment">Valoración de riesgo</option>
                        <option value="child-protection">Protección NNA</option>
                        <option value="follow-up">Seguimiento</option>
                      </select>
                    </label>
                    <div class="form-row">
                      <label class="form-field"><span>Ancho</span><input type="number" formControlName="width" /></label>
                      <label class="form-field"><span>Alto</span><input type="number" formControlName="height" /></label>
                    </div>
                    <div class="form-row">
                      <label class="form-field"><span>Spawn X</span><input type="number" formControlName="spawnX" /></label>
                      <label class="form-field"><span>Spawn Y</span><input type="number" formControlName="spawnY" /></label>
                    </div>
                    <div class="form-actions">
                      <button class="psy-button psy-button--ghost" type="button" (click)="closePanel()">Cancelar</button>
                      <button class="psy-button psy-button--primary" type="submit" [disabled]="mapForm.invalid || busy()">
                        <mat-icon>save</mat-icon>Guardar mapa
                      </button>
                    </div>
                  </form>
                }
              }

              <!-- Object form -->
              @if (panel()?.kind === 'object-create' || panel()?.kind === 'object-edit') {
                @if (objectForm) {
                  <form [formGroup]="objectForm" (ngSubmit)="saveObject(editor()!.caseVersionId)" class="side-form">
                    <label class="form-field"><span>Clave del objeto *</span><input formControlName="objectKey" placeholder="consultante-sofia" /></label>
                    <label class="form-field"><span>Etiqueta *</span><input formControlName="label" placeholder="Sofía (consultante)" /></label>
                    <label class="form-field">
                      <span>Tipo *</span>
                      <select formControlName="objectType">
                        <option value="PERSON">Persona</option>
                        <option value="OBJECT">Objeto</option>
                        <option value="ROUTE">Ruta</option>
                        <option value="TOOL">Herramienta</option>
                        <option value="WARNING">Alerta</option>
                        <option value="EXIT">Salida</option>
                      </select>
                    </label>
                    <label class="form-field"><span>Prompt de interacción *</span><input formControlName="interactionPrompt" /></label>
                    <label class="form-field"><span>Texto de interacción</span><textarea formControlName="interactionText" rows="3"></textarea></label>
                    <div class="form-row">
                      <label class="form-field"><span>X</span><input type="number" formControlName="x" /></label>
                      <label class="form-field"><span>Y</span><input type="number" formControlName="y" /></label>
                    </div>
                    <div class="form-row">
                      <label class="form-field"><span>Color hex</span><input formControlName="colorHex" placeholder="#4FA3A5" /></label>
                      <label class="form-field"><span>Código corto</span><input formControlName="shortCode" maxlength="12" placeholder="SOF" /></label>
                    </div>
                    <label class="form-field"><span>Icono Material</span><input formControlName="icon" placeholder="psychology" /></label>
                    <label class="form-field">
                      <span>Decisión vinculada (ID)</span>
                      <select formControlName="decisionOptionId">
                        <option [value]="null">— Ninguna —</option>
                        @for (d of editor()!.decisions; track d.id) {
                          <option [value]="d.id">{{ d.id }} — {{ d.text | slice:0:36 }}</option>
                        }
                      </select>
                    </label>
                    <label class="form-field">
                      <span>Herramienta vinculada</span>
                      <select formControlName="toolCode">
                        <option [value]="null">— Ninguna —</option>
                        @for (t of editor()!.tools; track t.id) {
                          <option [value]="t.code">{{ t.code }} — {{ t.label }}</option>
                        }
                      </select>
                    </label>
                    <label class="check-item"><input type="checkbox" formControlName="collision" /><span>Colisión activa</span></label>
                    <label class="check-item"><input type="checkbox" formControlName="visible" /><span>Visible en el mapa</span></label>
                    <div class="form-actions">
                      <button class="psy-button psy-button--ghost" type="button" (click)="closePanel()">Cancelar</button>
                      <button class="psy-button psy-button--primary" type="submit" [disabled]="objectForm.invalid || busy()">
                        <mat-icon>save</mat-icon>Guardar objeto
                      </button>
                    </div>
                  </form>
                }
              }

              <!-- Tool form -->
              @if (panel()?.kind === 'tool-create' || panel()?.kind === 'tool-edit') {
                @if (toolForm) {
                  <form [formGroup]="toolForm" (ngSubmit)="saveTool(editor()!.caseVersionId)" class="side-form">
                    <label class="form-field"><span>Código *</span><input formControlName="toolCode" placeholder="PAP" /></label>
                    <label class="form-field"><span>Etiqueta *</span><input formControlName="label" placeholder="Primeros Auxilios Psicológicos" /></label>
                    <label class="form-field"><span>Categoría</span><input formControlName="category" placeholder="clinical" /></label>
                    <label class="form-field"><span>Icono Material</span><input formControlName="icon" placeholder="psychology" /></label>
                    <label class="form-field"><span>Descripción *</span><textarea formControlName="description" rows="4"></textarea></label>
                    <div class="form-actions">
                      <button class="psy-button psy-button--ghost" type="button" (click)="closePanel()">Cancelar</button>
                      <button class="psy-button psy-button--primary" type="submit" [disabled]="toolForm.invalid || busy()">
                        <mat-icon>save</mat-icon>Guardar herramienta
                      </button>
                    </div>
                  </form>
                }
              }
            </aside>
          }
        </div>
      }
    </section>

    <app-confirm-dialog
      [open]="!!confirmState()"
      [title]="confirmState()?.title ?? 'Confirmar'"
      [message]="confirmState()?.message ?? ''"
      confirmLabel="Eliminar"
      [loading]="busy()"
      (cancel)="confirmState.set(null)"
      (confirm)="runConfirm()"
    />
  `,
  styles: [`
    .editor-page { display: grid; gap: 18px; }
    .editor-hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: clamp(18px, 3vw, 30px);
      border-radius: 22px;
      flex-wrap: wrap;
    }
    .editor-hero h2 {
      margin: 6px 0 0;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
      font-size: clamp(1.6rem, 3.5vw, 2.6rem);
    }
    .editor-meta { margin: 8px 0 0; color: var(--psy-muted); }
    .editor-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    .editor-layout {
      display: grid;
      grid-template-columns: minmax(0,1fr) auto;
      gap: 18px;
      align-items: start;
    }
    .editor-tabs { border-radius: 20px; }

    .tab-body { padding: 18px 4px 4px; display: grid; gap: 16px; }
    .tab-toolbar { display: flex; gap: 10px; flex-wrap: wrap; }

    .tab-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }
    .editor-card {
      display: grid;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--psy-border);
      border-radius: 18px;
      background: rgba(255,255,255,.68);
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-actions { display: flex; gap: 4px; }
    .editor-card h3 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
      font-size: 1.1rem;
    }
    .editor-card p {
      margin: 0;
      color: var(--psy-muted);
      font-size: .86rem;
      line-height: 1.45;
    }
    .editor-card-meta { font-size: .76rem; }

    /* Checklist */
    .checklist-layout {
      display: grid;
      grid-template-columns: auto minmax(0,1fr);
      gap: 24px;
      align-items: start;
      padding: 8px 4px;
    }
    .check-ring {
      display: grid;
      place-items: center;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: conic-gradient(var(--psy-teal) var(--progress, 0%), rgba(79,124,172,.1) 0);
      color: var(--psy-blue-deep);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 900;
      font-size: 1.1rem;
      box-shadow: inset 0 0 0 12px rgba(255,255,255,.7);
      flex-shrink: 0;
    }
    .checklist-form h3 { margin: 0 0 8px; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }
    .checklist-form p { margin: 0 0 16px; color: var(--psy-muted); }
    .check-items { display: grid; gap: 10px; }
    .check-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      font-size: .9rem;
      line-height: 1.4;
    }
    .check-item input[type=checkbox] { margin-top: 2px; flex-shrink: 0; accent-color: var(--psy-teal); }

    /* Rubrics */
    .rubric-section { display: grid; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--psy-border); }
    .rubric-section h3 { margin: 0; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }

    /* Preview */
    .preview-panel {
      display: grid;
      justify-items: center;
      gap: 14px;
      padding: 40px 0;
      text-align: center;
    }
    .preview-panel mat-icon { font-size: 52px; width: 52px; height: 52px; color: var(--psy-blue-deep); }
    .preview-panel h3 { margin: 0; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }

    /* Side panel */
    .side-panel {
      width: min(380px, 94vw);
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: 20px;
      align-self: start;
      max-height: 84vh;
      overflow-y: auto;
    }
    .side-panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .side-panel-head h3 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      letter-spacing: 0;
      font-size: 1.2rem;
    }

    /* Forms */
    .side-form { display: grid; gap: 12px; }
    .form-field {
      display: grid;
      gap: 4px;
      font-size: .86rem;
    }
    .form-field span { font-weight: 700; color: var(--psy-blue-deep); }
    .form-field input,
    .form-field select,
    .form-field textarea {
      padding: 8px 12px;
      border: 1px solid rgba(79,124,172,.22);
      border-radius: 10px;
      background: rgba(255,255,255,.8);
      font-size: .88rem;
      color: var(--psy-ink);
      font-family: inherit;
    }
    .form-field input:focus,
    .form-field select:focus,
    .form-field textarea:focus {
      outline: none;
      border-color: var(--psy-blue);
      box-shadow: 0 0 0 3px var(--psy-focus);
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .form-checks { display: grid; gap: 6px; }
    .form-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding-top: 6px;
      border-top: 1px solid var(--psy-border);
      flex-wrap: wrap;
    }

    .state-error {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 14px;
      border-radius: 14px;
      background: rgba(168,80,98,.08);
      border: 1px solid rgba(168,80,98,.24);
      color: #8b3145;
    }

    /* World node picker (Fase 4) */
    .world-node-picker {
      display: grid;
      gap: 16px;
      justify-items: center;
      padding: 32px 16px;
      text-align: center;
    }
    .world-node-picker mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--psy-blue-deep); }
    .world-node-picker h3 { margin: 0; font-family: 'Poppins', system-ui, sans-serif; letter-spacing: 0; }
    .world-node-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      width: 100%;
      max-width: 700px;
    }

    @media (max-width: 1100px) {
      .editor-layout { grid-template-columns: 1fr; }
      .checklist-layout { grid-template-columns: 1fr; justify-items: center; }
    }
    @media (max-width: 700px) {
      .editor-hero { display: grid; }
      .editor-actions .psy-button { width: 100%; }
    }
  `]
})
export class CaseEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly simulationService = inject(SimulationService);
  private readonly fb = inject(FormBuilder);

  readonly editor = signal<CaseEditorView | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly panel = signal<EditorPanel>(null);
  readonly selectedWorldNodeId = signal<number | null>(null);
  readonly confirmState = signal<{ title: string; message: string; run: () => void } | null>(null);

  nodeForm: FormGroup | null = null;
  decisionForm: FormGroup | null = null;
  mapForm: FormGroup | null = null;
  objectForm: FormGroup | null = null;
  toolForm: FormGroup | null = null;
  checklistForm: FormGroup | null = null;

  ngOnInit() {
    this.load();
  }

  // ─── Panel management ────────────────────────────────────────────────────────

  openPanel(p: NonNullable<EditorPanel>) {
    this.panel.set(p);
    if (p.kind === 'node-create') this.initNodeForm(null);
    else if (p.kind === 'node-edit') this.initNodeForm(p.node);
    else if (p.kind === 'decision-create') this.initDecisionForm(null, p.sourceNode ?? null);
    else if (p.kind === 'decision-edit') this.initDecisionForm(p.edge, null);
    else if (p.kind === 'map-create') this.initMapForm(null);
    else if (p.kind === 'map-edit') this.initMapForm(p.map);
    else if (p.kind === 'object-create') this.initObjectForm(null, p.mapId);
    else if (p.kind === 'object-edit') this.initObjectForm(p.obj, null);
    else if (p.kind === 'tool-create') this.initToolForm(null);
    else if (p.kind === 'tool-edit') this.initToolForm(p.tool);
  }

  closePanel() {
    this.panel.set(null);
  }

  panelTitle(): string {
    const p = this.panel();
    if (!p) return '';
    const titles: Record<string, string> = {
      'node-create': 'Nuevo nodo DAG',
      'node-edit': 'Editar nodo',
      'decision-create': 'Nueva decisión',
      'decision-edit': 'Editar decisión',
      'map-create': 'Nuevo mapa',
      'map-edit': 'Editar mapa',
      'object-create': 'Nuevo objeto del mapa',
      'object-edit': 'Editar objeto',
      'tool-create': 'Nueva herramienta clínica',
      'tool-edit': 'Editar herramienta',
    };
    return titles[p.kind] ?? '';
  }

  // ─── Form initializers ───────────────────────────────────────────────────────

  private initNodeForm(node: NodeEditorState | null) {
    this.nodeForm = this.fb.group({
      nodeKey: [node?.key ?? '', Validators.required],
      title: [node?.title ?? '', Validators.required],
      narrative: [node?.narrative ?? '', Validators.required],
      warningMessage: [node?.warningMessage ?? ''],
      startNode: [node?.startNode ?? false],
      terminal: [node?.terminal ?? false],
      sensitiveContent: [node?.sensitiveContent ?? false],
      safeExitRequired: [node?.safeExitRequired ?? false],
      positionX: [node?.positionX ?? null],
      positionY: [node?.positionY ?? null],
    });
  }

  private initDecisionForm(edge: DecisionEdgeState | null, sourceNode: NodeEditorState | null) {
    this.decisionForm = this.fb.group({
      sourceNodeId: [edge?.sourceNodeId ?? sourceNode?.id ?? '', Validators.required],
      targetNodeId: [edge?.targetNodeId ?? '', Validators.required],
      optionKey: [edge?.optionKey ?? ''],
      text: [edge?.text ?? '', Validators.required],
      classification: [edge?.classification ?? 'ADEQUATE', Validators.required],
      prohibitedConduct: [edge?.prohibitedConduct ?? false],
      prohibitionReason: [edge?.prohibitionReason ?? ''],
      scoreDelta: [edge?.scoreDelta ?? 10],
      stressDelta: [edge?.stressDelta ?? 0],
      prohibitedPenalty: [edge?.prohibitedPenalty ?? 0],
      immediateFeedback: [edge?.immediateFeedback ?? ''],
    });
  }

  private initMapForm(map: MapEditorState | null) {
    this.mapForm = this.fb.group({
      nodeId: [map?.nodeId ?? '', Validators.required],
      mapKey: [map?.key ?? '', Validators.required],
      title: [map?.title ?? '', Validators.required],
      theme: [map?.theme ?? 'clinical-soft'],
      width: [map?.width ?? 960],
      height: [map?.height ?? 540],
      spawnX: [map?.spawnX ?? 145],
      spawnY: [map?.spawnY ?? 430],
    });
  }

  private initObjectForm(obj: MapObjectEditorState | null, mapId: number | null) {
    this.objectForm = this.fb.group({
      _mapId: [obj?.mapId ?? mapId],
      objectKey: [obj?.key ?? '', Validators.required],
      label: [obj?.label ?? '', Validators.required],
      objectType: [obj?.type ?? 'PERSON', Validators.required],
      interactionPrompt: [obj?.interactionPrompt ?? '', Validators.required],
      interactionText: [obj?.interactionText ?? ''],
      x: [obj?.x ?? 200],
      y: [obj?.y ?? 300],
      width: [obj?.width ?? 48],
      height: [obj?.height ?? 48],
      colorHex: [obj?.colorHex ?? '#4FA3A5'],
      shortCode: [obj?.shortCode ?? 'ACT'],
      icon: [obj?.icon ?? 'psychology'],
      decisionOptionId: [obj?.decisionOptionId ?? null],
      toolCode: [obj?.toolCode ?? null],
      collision: [obj?.collision ?? false],
      visible: [obj?.visible ?? true],
    });
  }

  private initToolForm(tool: ClinicalToolEditorState | null) {
    this.toolForm = this.fb.group({
      toolCode: [tool?.code ?? '', Validators.required],
      label: [tool?.label ?? '', Validators.required],
      icon: [tool?.icon ?? 'psychology'],
      category: [tool?.category ?? 'clinical'],
      description: [tool?.description ?? '', Validators.required],
    });
  }

  private initChecklistForm() {
    this.checklistForm = this.fb.group({
      contentOriginal: [false],
      ethicsReviewed: [false],
      safetyProtocols: [false],
      noStigmatizing: [false],
      triggerWarnings: [false],
      accessibilityOk: [false],
    });
  }

  // ─── CRUD save actions ───────────────────────────────────────────────────────

  saveNode(caseVersionId: number) {
    if (!this.nodeForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.nodeForm.value;
    const body = {
      nodeKey: v.nodeKey, title: v.title, narrative: v.narrative,
      requiredTools: [], supportResources: [],
      sensitiveContent: v.sensitiveContent, safeExitRequired: v.safeExitRequired,
      warningMessage: v.warningMessage || null,
      terminal: v.terminal, startNode: v.startNode,
      positionX: v.positionX, positionY: v.positionY,
    };
    this.busy.set(true);
    const call = p?.kind === 'node-edit'
      ? this.simulationService.updateNode(caseVersionId, (p as { node: NodeEditorState }).node.id, body)
      : this.simulationService.createNode(caseVersionId, body);
    call.subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  saveDecision(caseVersionId: number) {
    if (!this.decisionForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.decisionForm.value;
    const body = {
      sourceNodeId: Number(v.sourceNodeId), targetNodeId: Number(v.targetNodeId),
      optionKey: v.optionKey || null, text: v.text, classification: v.classification,
      prohibitedConduct: v.prohibitedConduct, prohibitionReason: v.prohibitionReason || null,
      scoreDelta: v.scoreDelta, stressDelta: v.stressDelta,
      prohibitedPenalty: v.prohibitedPenalty, immediateFeedback: v.immediateFeedback || '',
    };
    this.busy.set(true);
    const call = p?.kind === 'decision-edit'
      ? this.simulationService.updateDecision(caseVersionId, (p as { edge: DecisionEdgeState }).edge.id, body)
      : this.simulationService.createDecision(caseVersionId, body);
    call.subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  saveMap(caseVersionId: number) {
    if (!this.mapForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.mapForm.value;
    const body = {
      nodeId: Number(v.nodeId), mapKey: v.mapKey, title: v.title,
      width: v.width, height: v.height, theme: v.theme,
      spawnX: v.spawnX, spawnY: v.spawnY,
    };
    this.busy.set(true);
    const call = p?.kind === 'map-edit'
      ? this.simulationService.updateMap(caseVersionId, (p as { map: MapEditorState }).map.id, body)
      : this.simulationService.createMap(caseVersionId, body);
    call.subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  saveObject(caseVersionId: number) {
    if (!this.objectForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.objectForm.value;
    const body = {
      objectKey: v.objectKey, label: v.label, objectType: v.objectType,
      x: v.x, y: v.y, width: v.width, height: v.height,
      colorHex: v.colorHex, icon: v.icon, shortCode: v.shortCode,
      collision: v.collision, visible: v.visible,
      interactionPrompt: v.interactionPrompt, interactionText: v.interactionText || '',
      decisionOptionId: v.decisionOptionId ? Number(v.decisionOptionId) : null,
      toolCode: v.toolCode || null,
    };
    this.busy.set(true);
    const call = p?.kind === 'object-edit'
      ? this.simulationService.updateObject(caseVersionId, (p as { obj: MapObjectEditorState }).obj.id, body)
      : this.simulationService.createObject(caseVersionId, (p as { mapId: number }).mapId ?? v._mapId, body);
    call.subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  saveTool(caseVersionId: number) {
    if (!this.toolForm?.valid || this.busy()) return;
    const p = this.panel();
    const v = this.toolForm.value;
    const body = { toolCode: v.toolCode, label: v.label, icon: v.icon, category: v.category, description: v.description };
    this.busy.set(true);
    const call = p?.kind === 'tool-edit'
      ? this.simulationService.updateTool(caseVersionId, (p as { tool: ClinicalToolEditorState }).tool.id, body)
      : this.simulationService.createTool(caseVersionId, body);
    call.subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  saveChecklist(caseVersionId: number) {
    if (!this.checklistForm || this.busy()) return;
    this.busy.set(true);
    this.simulationService.updateChecklist(caseVersionId, this.checklistForm.value)
      .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  // ─── Delete confirmations ────────────────────────────────────────────────────

  runConfirm() {
    const pending = this.confirmState();
    if (!pending) return;
    this.confirmState.set(null);
    pending.run();
  }

  private openConfirm(title: string, message: string, run: () => void) {
    this.confirmState.set({ title, message, run });
  }

  confirmDeleteNode(caseVersionId: number, node: NodeEditorState) {
    this.openConfirm(
      'Eliminar nodo',
      `¿Eliminar el nodo "${node.title}"? Esta acción eliminará también sus decisiones, mapa y objetos.`,
      () => {
        this.busy.set(true);
        this.simulationService.deleteNode(caseVersionId, node.id)
          .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
      }
    );
  }

  confirmDeleteMap(caseVersionId: number, map: MapEditorState) {
    this.openConfirm(
      'Eliminar mapa',
      `¿Eliminar el mapa "${map.title}"? Esta acción eliminará también sus objetos y colisiones.`,
      () => {
        this.busy.set(true);
        this.simulationService.deleteMap(caseVersionId, map.id)
          .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
      }
    );
  }

  confirmDeleteObject(caseVersionId: number, obj: MapObjectEditorState) {
    this.openConfirm(
      'Eliminar objeto',
      `¿Eliminar el objeto "${obj.label}"?`,
      () => {
        this.busy.set(true);
        this.simulationService.deleteObject(caseVersionId, obj.id)
          .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
      }
    );
  }

  confirmDeleteTool(caseVersionId: number, tool: ClinicalToolEditorState) {
    this.openConfirm(
      'Eliminar herramienta',
      `¿Eliminar la herramienta "${tool.label}"?`,
      () => {
        this.busy.set(true);
        this.simulationService.deleteTool(caseVersionId, tool.id)
          .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
      }
    );
  }

  // ─── Publish / Clone ─────────────────────────────────────────────────────────

  publish(caseVersionId: number) {
    this.busy.set(true);
    this.simulationService.publishCase(caseVersionId)
      .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  clone(caseVersionId: number) {
    this.busy.set(true);
    this.simulationService.cloneCaseVersion(caseVersionId)
      .subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });
  }

  // ─── Preview helpers (Fase 5) ────────────────────────────────────────────────

  /** Map editor nodes into the shape WorldPreviewComponent expects. */
  previewNodeOptions(model: CaseEditorView): { id: number; key: string; title: string }[] {
    return model.nodes.map(n => ({ id: n.id, key: n.key, title: n.title }));
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private load() {
    const caseVersionId = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    this.simulationService.caseEditor(caseVersionId).subscribe({
      next: model => {
        this.editor.set(model);
        this.initChecklistForm();
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el editor. Verifica tus permisos.');
        this.loading.set(false);
      }
    });
  }

  private refresh(model: CaseEditorView) {
    this.editor.set(model);
    this.busy.set(false);
    this.closePanel();
  }
}
