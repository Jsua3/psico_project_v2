import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SimulationService } from '../../core/api/simulation.service';
import {
  DialogueState, MapObjectState, ProgressMapState, SimulationAttemptState,
  SimulationFeedback, SimulationWorldState, ToolUseResult
} from '../../core/models/simulation.model';
import { DialoguePanelComponent } from './dialogue-panel.component';
import { GameWorldComponent } from './game-world.component';
import { JournalPanelComponent, JournalSaveState } from './journal-panel.component';
import { SocialMapComponent } from './social-map/social-map.component';
import { SimulationHudComponent } from './simulation-hud.component';
import { ToolInventoryComponent } from './tool-inventory.component';
import { AudioDirectorService } from './audio-director.service';
import { SocialMapService } from './social-map/social-map.service';
import {
  PROTOCOL_INFO_MESSAGE,
} from './hospital-map.config';
import { COMISARIA_AMBIENT_INFO } from './comisaria-map.config';
import {
  getRiskyInteractionDef,
  isRiskyInteraction,
} from './risky-interaction.config';
import {
  getSceneDisplayLabel,
  getSceneInteractionDescription,
  isSceneAmbientInteraction,
} from './scene-map-display.util';
import { getSceneObjective } from './scene-objectives.config';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { AIAssistantComponent } from './ai-assistant/ai-assistant.component';

@Component({
  selector: 'app-simulation-play',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatIconModule, MatProgressBarModule,
    SimulationHudComponent, GameWorldComponent, DialoguePanelComponent,
    ToolInventoryComponent, JournalPanelComponent,
    AttemptOutcomeComponent, AIAssistantComponent, SocialMapComponent
  ],
  template: `
    <div class="game-container" [attr.data-mode]="viewMode()">
      <div class="sr-only" aria-live="assertive" role="status" aria-atomic="true">{{ a11yAnnouncement() }}</div>

      @if (loading()) {
        <div class="loading-overlay"><mat-progress-bar mode="indeterminate" aria-label="Cargando simulación" /></div>
      }
      @if (error()) {
        <div class="error-overlay" role="alert">
          <mat-icon>error</mat-icon><p>{{ error() }}</p>
          <a class="psy-button psy-button--ghost" routerLink="/portal/simulador">Volver al simulador</a>
        </div>
      }
      @if (actionError()) {
        <div class="action-toast" role="alert">{{ actionError() }}</div>
      }

      @if (showResumePrompt() && pendingActiveAttempt(); as active) {
        <section class="resume-overlay" role="dialog" aria-labelledby="resume-title">
          <article class="resume-card">
            <p class="psy-eyebrow">Intento en progreso</p>
            <h2 id="resume-title">Continuar simulación formativa</h2>
            <p>
              Ya tienes un intento activo en <strong>{{ active.caseTitle }}</strong>.
              Puedes retomarlo desde <strong>{{ active.currentNode.title }}</strong> o iniciar uno nuevo.
            </p>
            <div class="resume-metrics">
              <span>Puntaje: {{ active.accumulatedScore }}</span>
              <span>Estrés: {{ active.stressIndex }}%</span>
              <span>Riesgo: {{ active.metrics.victimRisk }}%</span>
            </div>
            <div class="resume-actions">
              <button class="psy-button psy-button--primary" type="button" (click)="resumeAttempt()">
                Continuar intento en progreso
              </button>
              <button class="psy-button psy-button--ghost" type="button" (click)="startNewAttempt()">
                Iniciar nuevo intento
              </button>
              <a class="psy-button psy-button--ghost" routerLink="/portal/simulador">Volver al catálogo</a>
            </div>
          </article>
        </section>
      }

      @if (attempt(); as game) {

        <!-- FILA 1: top bar -->
        <app-simulation-hud
          class="top-bar"
          [attempt]="game"
          [stressPulse]="stressPulse()"
          [nearbyInteractionKey]="nearbyInteraction()?.key ?? null"
          [verbalTension]="game.stressIndex"
          (openJournal)="journalOpen.set(true)"
          (openAI)="aiAssistantOpen.set(true)"
          (openSocialMap)="socialMapOpen.set(true)" />

        <!-- FILA 2: canvas zone -->
        <div class="canvas-zone">
          @if (world(); as w) {
            <app-game-world #gameWorld id="game-area" class="game-canvas"
              [world]="w"
              [nearbyInteraction]="nearbyInteraction()"
              [selectedInteractionKey]="selectedInteraction()?.key ?? null"
              (proximity)="nearbyInteraction.set($event)"
              (interact)="openInteraction($event)"
              (positionChange)="rememberPosition($event.x, $event.y)" />
          } @else {
            <div class="world-skeleton" aria-label="Cargando mapa"></div>
          }

          @if (sceneObjective(); as obj) {
            <div class="objective-card" role="status" aria-live="polite" aria-atomic="true">
              <span class="obj-kicker">OBJETIVO ACTUAL</span>
              <p class="obj-text">{{ obj }}</p>
            </div>
          }

          @if (nearbyInteraction(); as nb) {
            <div class="proximity-hint"
              [class.proximity-hint--rich]="proximityDescription(nb)"
              aria-live="polite" aria-atomic="true">
              <div class="proximity-hint__body">
                <strong>{{ proximityLabel(nb) }}</strong>
                @if (proximityDescription(nb); as desc) {
                  <p>{{ desc }}</p>
                }
                <span class="proximity-hint__action"><kbd>E</kbd> Presiona E para interactuar</span>
              </div>
            </div>
          }

          @if (viewMode() === 'dialogue-right') {
            <app-dialogue-panel
              class="right-panel"
              mode="side-panel"
              [dialogue]="dialogue()"
              [interaction]="selectedInteraction()"
              (close)="closeDialogue()"
              (execute)="executeDecision($event)"
              (useTool)="useTool($event)"
              (frontendChoice)="handleFrontendChoice($event)" />
          }

          @if (viewMode() === 'dialogue-cinematic') {
            <app-dialogue-panel
              class="dialogue-cinematic-layer"
              mode="cinematic"
              [dialogue]="dialogue()"
              [interaction]="selectedInteraction()"
              (close)="closeDialogue()"
              (execute)="executeDecision($event)"
              (useTool)="useTool($event)"
              (frontendChoice)="handleFrontendChoice($event)" />
          }
        </div>

        <!-- FILA 3: bottom zone -->
        <div class="bottom-zone">
          @if (game.status === 'IN_PROGRESS') {
            <button class="safe-exit" type="button"
              aria-label="Salida segura (Escape)"
              (click)="safeExit()" [disabled]="busy()">
              <mat-icon aria-hidden="true">exit_to_app</mat-icon>
              <span class="safe-exit__label">SALIDA SEGURA</span>
              <span class="safe-exit__sub">Esc</span>
            </button>
          }
          <app-tool-inventory
            class="tool-dock"
            [tools]="world()?.tools ?? []"
            [inventory]="world()?.inventory ?? []"
            [selectedToolCode]="selectedToolCode()"
            (select)="selectTool($event)" />
          <div class="context-bar" aria-label="Contexto de la escena">
            <span>{{ currentStageLabel() }}</span>
            <span class="ctx-sep" aria-hidden="true">|</span>
            <span class="ctx-location">{{ game.currentNode.title }}</span>
            @if (contextTip(); as tip) {
              <span class="ctx-sep" aria-hidden="true">|</span>
              <span class="ctx-tip">{{ tip }}</span>
            }
          </div>
        </div>

        <!-- Non-grid overlays -->
        <div class="stress-vignette"
          [class.vignette--active]="stressVignetteLevel() > 0"
          [style.--vignette-opacity]="stressVignetteLevel()"
          aria-hidden="true"></div>

        <app-journal-panel #journalPanel class="journal-layer"
          [open]="journalOpen()"
          [disabled]="game.status !== 'IN_PROGRESS' || busy()"
          [message]="journalMessage()"
          [saveState]="journalSaveState()"
          [visitedStages]="visitedStageLabels()"
          [supportResources]="supportResources()"
          (save)="saveReflection($event)"
          (closeSheet)="journalOpen.set(false)" />

        @if (viewMode() === 'outcome') {
          <app-attempt-outcome
            [report]="game.completionReport"
            [status]="game.status"
            (retry)="startNewAttempt()" />
        }

        @if (aiAssistantOpen()) {
          <div class="ai-overlay" role="dialog" aria-label="Asistente IA">
            <div class="overlay-panel">
              <button class="overlay-close" type="button" aria-label="Cerrar asistente"
                (click)="aiAssistantOpen.set(false)">
                <mat-icon>close</mat-icon>
              </button>
              <app-ai-assistant
                [attemptId]="game.attemptId"
                [currentNodeId]="game.currentNode.key"
                [decisionAlreadyTaken]="game.status !== 'IN_PROGRESS'" />
            </div>
          </div>
        }

        @if (socialMapOpen()) {
          <div class="social-overlay" role="dialog" aria-label="Mapa social">
            <div class="overlay-panel">
              <button class="overlay-close" type="button" aria-label="Cerrar mapa social"
                (click)="socialMapOpen.set(false)">
                <mat-icon>close</mat-icon>
              </button>
              <app-social-map
                [nodes]="socialMapService.nodes()"
                [edges]="socialMapService.edges()" />
            </div>
          </div>
        }

        <section class="sr-narrative-route" aria-label="Ruta narrativa accesible">
          <h4 class="sr-only">Escena: {{ game.currentNode.title }}</h4>
          <p class="sr-only">{{ game.currentNode.narrative }}</p>
          @if (game.currentNode.warningMessage) {
            <p class="sr-only" role="alert">Advertencia: {{ game.currentNode.warningMessage }}</p>
          }
          @if (game.currentNode.sensitiveContent) {
            <p class="sr-only" role="note">Contenido sensible. Salida segura con Escape.</p>
          }
        </section>

        <div class="scene-fade" [class.scene-fade--active]="fadeActive()" aria-hidden="true"></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .game-container {
      --sim-purple: #7C4DFF;
      --sim-lavender: #B69CFF;
      --sim-blue: #6CC0C7;
      --sim-ink: #F4F7FB;
      --sim-ink-soft: rgba(244,247,251,.74);
      --sim-surface: rgba(27,33,51,.72);
      --sim-surface-2: rgba(18,24,42,.6);
      --sim-border: rgba(182,156,255,.22);
      --sim-glow: 0 18px 48px -28px rgba(124,77,255,.6);
      position: fixed;
      inset: 0;
      overflow: hidden;
      color: var(--sim-ink);
      background:
        linear-gradient(90deg, rgba(124,77,255,.06) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(rgba(124,77,255,.06) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(180deg, #111827 0%, #0e1322 100%);
      display: grid;
      grid-template-rows: auto 1fr auto;
    }

    /* ── FILA 1: HUD top bar ── */
    app-simulation-hud.top-bar { display: block; z-index: 70; }

    /* ── FILA 2: canvas zone ── */
    .canvas-zone {
      display: grid;
      grid-template-columns: 1fr;
      min-height: 0;
      position: relative;
      overflow: hidden;
    }
    .game-container[data-mode="dialogue-right"] .canvas-zone {
      grid-template-columns: 1fr clamp(340px, 28vw, 480px);
      transition: grid-template-columns 220ms ease;
    }
    .game-canvas {
      grid-column: 1; grid-row: 1;
      width: 100%; height: 100%; overflow: hidden;
      border: 1px solid rgba(182,156,255,.18);
      background: #0e1322;
    }
    .world-skeleton {
      grid-column: 1; grid-row: 1;
      width: 100%; height: 100%;
      background: #0e1322;
    }
    app-dialogue-panel.right-panel {
      grid-column: 2; grid-row: 1;
      overflow-y: auto;
      border-left: 1px solid rgba(182,156,255,.22);
      background: rgba(8,12,18,.95);
      backdrop-filter: blur(18px);
    }
    app-dialogue-panel.dialogue-cinematic-layer {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 60;
    }
    .objective-card {
      position: absolute; top: 12px; left: 12px; z-index: 50;
      max-width: 220px; padding: 8px 12px;
      background: rgba(8,12,18,.82);
      border: 1px solid rgba(182,156,255,.28);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      pointer-events: none;
    }
    .obj-kicker {
      display: block; font-size: .6rem; font-weight: 900;
      letter-spacing: .1em; color: var(--sim-lavender);
      text-transform: uppercase; margin-bottom: 3px;
    }
    .obj-text { margin: 0; font-size: .78rem; color: var(--sim-ink-soft); line-height: 1.4; }

    .proximity-hint {
      position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 50;
      max-width: min(520px, calc(100vw - 32px));
      padding: 10px 14px; border-radius: 12px;
      background: rgba(8,12,18,.88); border: 1px solid rgba(182,156,255,.3);
      color: #e8f0f4; pointer-events: none;
      animation: hint-rise 160ms ease both;
    }
    .proximity-hint__body { display: grid; gap: 4px; }
    .proximity-hint__body strong { font-size: .84rem; color: #cdbcff; line-height: 1.3; }
    .proximity-hint__body p { margin: 0; font-size: .76rem; line-height: 1.4; color: rgba(232,240,244,.78); }
    .proximity-hint__action { font-size: .74rem; color: rgba(232,240,244,.55); }
    .proximity-hint__action kbd {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.2); border-radius: 4px; font-size: .7rem;
    }

    /* ── FILA 3: bottom zone ── */
    .bottom-zone {
      display: flex; align-items: stretch; gap: 8px;
      padding: 8px 12px;
      background: rgba(8,12,18,.88);
      border-top: 1px solid rgba(182,156,255,.14);
      z-index: 50;
      min-height: 0;
    }
    .safe-exit {
      flex: 0 0 auto; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2px;
      min-width: 62px; padding: 6px 8px;
      border: 1px solid rgba(226,90,79,.4); border-radius: 10px;
      background: rgba(226,90,79,.1); color: rgba(230,130,110,.88);
      cursor: pointer; transition: border-color 140ms, background 140ms;
      font-family: inherit;
    }
    .safe-exit:hover:not(:disabled) { border-color: rgba(226,90,79,.7); background: rgba(226,90,79,.18); }
    .safe-exit:disabled { opacity: .35; cursor: not-allowed; }
    .safe-exit mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .safe-exit__label { font-size: .54rem; font-weight: 900; letter-spacing: .06em; white-space: nowrap; }
    .safe-exit__sub { font-size: .5rem; opacity: .6; }
    app-tool-inventory.tool-dock { flex: 1; min-width: 0; }
    .context-bar {
      flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
      padding: 0 10px; border-left: 1px solid rgba(182,156,255,.12);
      font-size: .66rem; color: rgba(232,240,244,.38);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;
    }
    .ctx-sep { opacity: .28; }
    .ctx-location { color: rgba(232,240,244,.52); }
    .ctx-tip { color: rgba(182,156,255,.55); font-style: italic; }

    /* ── Fixed overlays ── */
    .stress-vignette {
      position: fixed; inset: 0; pointer-events: none; z-index: 90; opacity: 0;
      transition: opacity 1.2s cubic-bezier(.4,0,.2,1);
      background: radial-gradient(ellipse at center, transparent 55%, rgba(120,40,55,.22) 100%);
    }
    .vignette--active { opacity: var(--vignette-opacity, 0); }
    app-journal-panel.journal-layer { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }
    .ai-overlay, .social-overlay {
      position: fixed; inset: 0; z-index: 120;
      display: grid; place-items: center;
      background: rgba(8,12,18,.72);
      backdrop-filter: blur(4px);
    }
    .overlay-panel {
      position: relative; width: min(560px, 88vw); max-height: 80vh;
      overflow-y: auto; border-radius: 20px;
      background: rgba(18,24,42,.95);
      border: 1px solid rgba(182,156,255,.22);
      backdrop-filter: blur(18px);
      box-shadow: var(--sim-glow);
    }
    .overlay-close {
      position: absolute; top: 12px; right: 12px;
      width: 34px; height: 34px; display: grid; place-items: center;
      border: 1px solid rgba(182,156,255,.28); border-radius: 8px;
      background: rgba(8,12,18,.7); color: rgba(182,156,255,.6); cursor: pointer; z-index: 1;
    }
    .overlay-close:hover { background: rgba(168,80,98,.2); }

    /* ── Utility ── */
    .psy-button {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 44px; padding: 10px 16px; border-radius: 12px;
      font-weight: 700; cursor: pointer; font: inherit;
    }
    .psy-button--primary {
      background: rgba(124,77,255,.9); border: 1px solid rgba(124,77,255,.6); color: #fff;
    }
    .psy-button--ghost {
      background: transparent; border: 1px solid rgba(182,156,255,.35); color: #B69CFF;
      text-decoration: none;
    }
    .loading-overlay { position: absolute; top: 0; left: 0; right: 0; z-index: 300; }
    .error-overlay {
      position: absolute; inset: 0; z-index: 300; display: flex; flex-direction: column;
      gap: 14px; align-items: center; justify-content: center;
      background: rgba(8,12,18,.9); color: #e8f0f4; padding: 24px; text-align: center;
    }
    .error-overlay mat-icon { font-size: 36px; color: rgba(168,80,98,.8); }
    .action-toast {
      position: absolute; top: 104px; left: 50%; transform: translateX(-50%);
      z-index: 320; max-width: min(92vw, 520px);
      padding: 10px 16px; border-radius: 12px;
      background: rgba(143,47,61,.92); color: #fff; font-weight: 700; text-align: center;
    }
    .resume-overlay {
      position: absolute; inset: 0; z-index: 400;
      display: grid; place-items: center; padding: 24px;
      background: rgba(8,12,18,.88);
    }
    .resume-card {
      width: min(560px, 100%); padding: clamp(24px, 4vw, 36px);
      color: #e8f0f4; background: var(--sim-surface); backdrop-filter: blur(18px);
      border: 1px solid var(--sim-border); border-radius: 20px; box-shadow: var(--sim-glow);
    }
    .resume-card h2 { margin: 12px 0; color: #fff; font-size: 1.6rem; }
    .resume-card p { margin: 0; color: rgba(232,240,244,.72); line-height: 1.6; }
    .psy-eyebrow {
      margin: 0; color: var(--sim-lavender); font-size: .72rem;
      font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
    }
    .resume-metrics { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
    .resume-metrics span {
      padding: 8px 12px; border-radius: 999px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08);
      font-size: .82rem; font-weight: 700;
    }
    .resume-actions { display: grid; gap: 10px; margin-top: 20px; }
    .sr-only {
      position: absolute !important; width: 1px !important; height: 1px !important;
      padding: 0 !important; margin: -1px !important; overflow: hidden !important;
      clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important;
    }
    .sr-narrative-route { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
    .scene-fade {
      position: fixed; inset: 0; z-index: 200; background: #0a0f14; opacity: 0;
      pointer-events: none; transition: opacity 320ms ease;
    }
    .scene-fade--active { opacity: 1; pointer-events: auto; }

    /* ── Mobile ── */
    @media (max-width: 760px) {
      .game-container[data-mode="dialogue-right"] .canvas-zone {
        grid-template-columns: 1fr;
      }
      app-dialogue-panel.right-panel {
        position: fixed; bottom: 0; inset-inline: 0;
        height: 65vh; z-index: 60;
        border-left: none; border-top: 1px solid rgba(182,156,255,.22);
        overflow-y: auto;
      }
      .context-bar { display: none; }
      .safe-exit__sub { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .stress-vignette, .scene-fade { transition: none; }
    }
    @keyframes hint-rise {
      from { opacity: 0; transform: translateX(-50%) translateY(6px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `]
})
export class SimulationPlayComponent implements OnInit, OnDestroy {
  private readonly simulationService = inject(SimulationService);
  private readonly route = inject(ActivatedRoute);
  private readonly audioDirector = inject(AudioDirectorService);
  protected readonly socialMapService = inject(SocialMapService);

  @ViewChild('gameWorld')    private gameWorld?: GameWorldComponent;
  @ViewChild('journalPanel') private journalPanel?: JournalPanelComponent;

  readonly attempt    = signal<SimulationAttemptState | null>(null);
  readonly pendingActiveAttempt = signal<SimulationAttemptState | null>(null);
  readonly showResumePrompt = signal(false);
  readonly progressMap = signal<ProgressMapState | null>(null);
  readonly world      = signal<SimulationWorldState | null>(null);
  readonly loading    = signal(true);
  readonly busy       = signal(false);
  readonly error      = signal('');
  readonly actionError = signal('');
  readonly journalMessage      = signal('');
  readonly journalSaveState    = signal<JournalSaveState>('idle');
  readonly nearbyInteraction   = signal<MapObjectState | null>(null);
  private readonly pendingRestrictedInteraction = signal<MapObjectState | null>(null);
  readonly selectedInteraction = signal<MapObjectState | null>(null);
  readonly dialogue    = signal<DialogueState | null>(null);
  readonly stressPulse = signal(false);
  readonly a11yAnnouncement = signal('');
  readonly journalOpen  = signal(false);
  readonly fadeActive   = signal(false);
  readonly verbalTension = signal(0);

  // ── NEW: HUD redesign signals ──
  readonly aiAssistantOpen  = signal(false);
  readonly socialMapOpen    = signal(false);

  readonly viewMode = computed<'explore' | 'dialogue-right' | 'dialogue-cinematic' | 'journal' | 'outcome'>(() => {
    const att = this.attempt();
    if (!att) return 'explore';
    if (att.status === 'COMPLETED' || att.status === 'SAFE_EXITED') return 'outcome';
    if (this.journalOpen()) return 'journal';
    const dlg = this.dialogue();
    if (dlg) {
      const hasChoices = (dlg.choices?.length ?? 0) > 0;
      const isPerson   = this.selectedInteraction()?.type === 'PERSON';
      const isWarning  = this.pendingRestrictedInteraction() !== null;
      return (hasChoices && isPerson && !isWarning) ? 'dialogue-right' : 'dialogue-cinematic';
    }
    return 'explore';
  });

  readonly sceneObjective  = computed(() => getSceneObjective(this.attempt()?.currentNode.key) ?? null);
  readonly contextTip      = computed(() => this.sceneObjective());
  readonly selectedToolCode = computed(() =>
    this.dialogue() ? (this.selectedInteraction()?.toolCode ?? null) : null
  );

  readonly stressVignetteLevel = computed(() => {
    const s = this.attempt()?.stressIndex ?? 0;
    if (s < 40) return 0;
    return Math.min(0.45, 0.05 + ((s - 40) / 60) * 0.4);
  });

  private lastPosition: { x: number; y: number } | null = null;
  private positionSaveHandle: number | null = null;

  ngOnDestroy(): void {
    this.audioDirector.dispose();
    this.socialMapService.reset();
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) { this.error.set('Caso no encontrado.'); this.loading.set(false); return; }

    this.simulationService.getActiveAttempt(id).subscribe({
      next: active => {
        if (active?.status === 'IN_PROGRESS') {
          this.pendingActiveAttempt.set(active);
          this.showResumePrompt.set(true);
          this.loading.set(false);
          return;
        }
        this.beginAttempt(id, false);
      },
      error: () => this.beginAttempt(id, false)
    });
  }

  resumeAttempt() {
    const active = this.pendingActiveAttempt();
    if (!active) return;
    this.showResumePrompt.set(false);
    this.loading.set(true);
    this.bootstrapAttempt(active);
  }

  startNewAttempt() {
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) return;
    this.showResumePrompt.set(false);
    this.loading.set(true);
    this.beginAttempt(id, true);
  }

  private beginAttempt(caseVersionId: number, forceNew: boolean) {
    this.simulationService.startAttempt(caseVersionId, forceNew).subscribe({
      next: attempt => this.bootstrapAttempt(attempt),
      error: () => {
        this.error.set('No pudimos iniciar la simulación. Revisa tus permisos.');
        this.loading.set(false);
      }
    });
  }

  private bootstrapAttempt(attempt: SimulationAttemptState) {
    this.audioDirector.init();
    this.socialMapService.reset();
    this.attempt.set(attempt);
    this.persistAttemptToken(attempt);
    this.loadProgressMap(attempt);
    this.loadWorld(attempt);
    this.audioDirector.setStressLevel(attempt.stressIndex);
    this.gameWorld?.setStressLevel(attempt.stressIndex);
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalInteraction(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement | null)?.tagName;
    const editable = (event.target as HTMLElement | null)?.isContentEditable;

    if (event.key === 'Escape') {
      if (this.journalOpen()) { event.preventDefault(); this.journalOpen.set(false); return; }
      if (this.dialogue())    { event.preventDefault(); this.closeDialogue(); return; }
      const g = this.attempt();
      if (g?.status === 'IN_PROGRESS' && !this.busy()) { event.preventDefault(); this.safeExit(); }
      return;
    }

    if ((event.key === 'j' || event.key === 'J') && tag !== 'INPUT' && tag !== 'TEXTAREA' && !editable) {
      event.preventDefault();
      this.journalOpen.set(!this.journalOpen());
      return;
    }

    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;

    if (['e','E',' ','Enter'].includes(event.key)) {
      const nb = this.nearbyInteraction();
      if (!nb) return;
      event.preventDefault();
      this.openInteraction(nb);
    }
  }

  openInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') return;

    if (isSceneAmbientInteraction(interaction.key)) {
      this.showAmbientDialogue(interaction);
      return;
    }

    if (isRiskyInteraction(interaction.key)) {
      this.showRiskyActionWarning(interaction);
      return;
    }

    this.openBackendInteraction(interaction);
  }

  handleFrontendChoice(key: string) {
    if (key === 'frontend:cancel-restricted') {
      this.pendingRestrictedInteraction.set(null);
      this.closeDialogue();
      return;
    }
    if (key === 'frontend:proceed-restricted') {
      const interaction = this.pendingRestrictedInteraction();
      this.pendingRestrictedInteraction.set(null);
      this.dialogue.set(null);
      if (interaction) this.openBackendInteraction(interaction);
    }
  }

  proximityLabel(obj: MapObjectState): string {
    const mapKey = this.world()?.map.key;
    if (obj.type === 'EXIT') return `${getSceneDisplayLabel(obj, mapKey)} →`;
    return getSceneDisplayLabel(obj, mapKey);
  }

  proximityDescription(obj: MapObjectState): string {
    return getSceneInteractionDescription(obj, this.world()?.map.key);
  }

  private openBackendInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') return;

    this.selectedInteraction.set(interaction);
    this.gameWorld?.focus(interaction.key);
    this.busy.set(true);
    this.simulationService.openInteraction(game.attemptId, game.attemptToken, interaction.key).subscribe({
      next: result => {
        this.world.set(result.world);
        this.selectedInteraction.set(result.interaction);
        this.dialogue.set(result.dialogue ?? result.interaction.dialogue);
        this.busy.set(false);
      },
      error: () => { this.showActionError('No pudimos abrir la interacción.'); this.busy.set(false); }
    });
  }

  private showRiskyActionWarning(interaction: MapObjectState) {
    const def = getRiskyInteractionDef(interaction.key);
    if (!def) return;

    this.pendingRestrictedInteraction.set(interaction);
    this.selectedInteraction.set(interaction);
    this.gameWorld?.focus(interaction.key);
    this.dialogue.set({
      key: `risky-warning-${interaction.key}`,
      speakerName: def.speakerName,
      portraitKey: def.portraitKey,
      emotion: 'concerned',
      lines: [{
        order: 1,
        speakerName: def.speakerName,
        text: def.warningMessage,
        emotion: 'concerned',
      }],
      choices: [
        {
          key: 'frontend:cancel-restricted',
          text: 'Cancelar',
          decisionOptionId: null,
          requiredToolCode: null,
          effect: {},
          isRecommended: true,
        },
        {
          key: 'frontend:proceed-restricted',
          text: 'Continuar bajo riesgo',
          decisionOptionId: null,
          requiredToolCode: null,
          effect: {},
          isProhibited: true,
        },
      ],
    });
  }

  private showAmbientDialogue(interaction: MapObjectState) {
    this.selectedInteraction.set(interaction);
    const mapKey = this.world()?.map.key;
    const text = interaction.key === 'ambient:protocolo-noticia-dificil'
      ? PROTOCOL_INFO_MESSAGE
      : COMISARIA_AMBIENT_INFO[interaction.key]
        ?? getSceneInteractionDescription(interaction, mapKey);
    this.dialogue.set({
      key: interaction.key,
      speakerName: interaction.label,
      portraitKey: 'info',
      emotion: 'neutral',
      lines: [{
        order: 1,
        speakerName: interaction.label,
        text,
        emotion: 'neutral',
      }],
      choices: [],
    });
  }

  private showActionError(message: string) {
    this.actionError.set(message);
    window.setTimeout(() => this.actionError.set(''), 4500);
  }

  executeDecision(decisionOptionId: number) {
    const game = this.attempt();
    if (!game || this.busy()) return;
    this.busy.set(true);

    // Apply verbal tension delta from chosen option's metadata before clearing the dialogue
    const chosenOption = this.dialogue()?.choices?.find(c => c.decisionOptionId === decisionOptionId);
    const rawDelta = chosenOption?.metadata?.['verbal_tension_delta'];
    const vtDelta = typeof rawDelta === 'number' && isFinite(rawDelta) ? rawDelta : 0;
    if (vtDelta !== 0) {
      this.verbalTension.update(t => Math.max(0, Math.min(1, t + vtDelta)));
      if (this.verbalTension() >= 0.9) {
        this.triggerPatientWithdrawal();
      }
    }

    const prevNodeKey = game.currentNode?.key ?? '';
    this.dialogue.set(null);
    this.journalMessage.set('');
    this.triggerFade(() => {
      this.simulationService.chooseDecision(game.attemptId, game.attemptToken, decisionOptionId).subscribe({
        next: updated => {
          this.attempt.set(updated);
          this.persistAttemptToken(updated);
          this.selectedInteraction.set(null);
          this.nearbyInteraction.set(null);
          this.journalPanel?.clear();
          this.loadProgressMap(updated);
          this.loadWorld(updated);
          this.audioDirector.setStressLevel(updated.stressIndex);
          this.gameWorld?.setStressLevel(updated.stressIndex);
          // Only reset verbal tension if the scene/node actually changed
          const nextNodeKey = updated?.currentNode?.key ?? '';
          if (nextNodeKey !== prevNodeKey) {
            this.verbalTension.update(t => t * 0.5);
          }
          if (updated.status === 'COMPLETED') {
            this.audioDirector.playResolution();
          }
          if (updated.feedback) {
            window.setTimeout(() => this.dialogue.set(this.buildSupervisionDialogue(updated.feedback!)), 400);
          }
        },
        error: () => { this.showActionError('No pudimos ejecutar la intervención.'); this.busy.set(false); this.fadeActive.set(false); }
      });
    });
  }

  useTool(toolCode: string) {
    const game = this.attempt();
    const target = this.selectedInteraction()?.key ?? null;
    if (!game || this.busy()) return;
    this.busy.set(true);
    this.simulationService.useTool(game.attemptId, game.attemptToken, toolCode, target).subscribe({
      next: (result: ToolUseResult) => {
        this.world.set(result.world);
        const cur = this.attempt();
        if (cur) {
          const newStress = Math.max(0, Math.min(100, cur.stressIndex + result.stressDelta));
          this.attempt.set({ ...cur, stressIndex: newStress });
          this.audioDirector.setStressLevel(newStress);
          this.gameWorld?.setStressLevel(newStress);
        }
        this.showToolFeedback(result);
        this.busy.set(false);
      },
      error: () => { this.showActionError('No pudimos usar la herramienta.'); this.busy.set(false); }
    });
  }

  selectTool(toolCode: string) {
    const tool = this.world()?.tools.find(t => t.code === toolCode);
    if (!tool) return;
    this.dialogue.set({
      key: tool.code, speakerName: 'Herramienta profesional', portraitKey: tool.icon, emotion: 'neutral',
      lines: [{ order: 1, speakerName: tool.label, text: tool.description, emotion: 'neutral' }], choices: []
    });
    this.selectedInteraction.set({
      key: `tool-${tool.code}`, label: tool.label, type: 'TOOL',
      x: 0, y: 0, width: 0, height: 0, color: '#4FA3A5', icon: tool.icon,
      shortCode: tool.code.slice(0,4), collision: false,
      interactionPrompt: 'Herramienta profesional', interactionText: tool.description,
      decisionOptionId: null, toolCode: tool.code, dialogue: null
    });
  }

  closeDialogue() { this.dialogue.set(null); }

  saveReflection(text: string) {
    const game = this.attempt();
    if (!game || !text.trim() || this.busy()) return;
    this.busy.set(true);
    this.journalSaveState.set('saving');
    this.simulationService.saveReflection(game.attemptId, game.attemptToken, game.currentNode.id, text.trim()).subscribe({
      next: () => {
        this.journalMessage.set('Bitácora guardada y cifrada.');
        this.journalSaveState.set('saved');
        this.busy.set(false);
      },
      error: () => {
        this.journalMessage.set('No pudimos guardar la bitácora.');
        this.journalSaveState.set('error');
        this.busy.set(false);
      }
    });
  }

  safeExit() {
    const game = this.attempt();
    if (!game || this.busy()) return;
    this.busy.set(true);
    this.simulationService.safeExit(game.attemptId, game.attemptToken, 'Salida segura solicitada').subscribe({
      next: updated => { this.attempt.set(updated); this.selectedInteraction.set(null); this.dialogue.set(null); this.loadWorld(updated); },
      error: () => { this.showActionError('No pudimos registrar la salida segura.'); this.busy.set(false); }
    });
  }

  rememberPosition(x: number, y: number) {
    this.lastPosition = { x, y };
    if (this.positionSaveHandle) window.clearTimeout(this.positionSaveHandle);
    this.positionSaveHandle = window.setTimeout(() => this.persistPosition(), 550);
  }

  statusLabel(status: SimulationAttemptState['status']): string {
    return {
      IN_PROGRESS: 'En curso',
      COMPLETED: 'Finalizada',
      SAFE_EXITED: 'Salida segura'
    }[status];
  }

  progressSegments(): { index: number; filled: boolean }[] {
    const map = this.progressMap();
    const total = Math.max(map?.nodes.length ?? 0, 1);
    const visited = new Set(map?.visitedNodeKeys ?? []);
    if (!map?.nodes.length) {
      return [{ index: 0, filled: !!this.attempt() }];
    }
    return map.nodes.map((node, index) => ({
      index,
      filled: visited.has(node.key) || node.key === map.currentNodeKey
    }));
  }

  progressLabel(): string {
    const map = this.progressMap();
    if (!map?.nodes.length) return 'Progreso: escenario actual';
    const visited = new Set(map.visitedNodeKeys);
    const completed = map.nodes.filter(node => visited.has(node.key) || node.key === map.currentNodeKey).length;
    return `Progreso: ${completed} de ${map.nodes.length} escenarios`;
  }

  currentStageLabel(): string {
    const map = this.progressMap();
    const currentKey = this.attempt()?.currentNode.key;
    if (!map?.nodes.length || !currentKey) return 'Escenario actual';
    const index = map.nodes.findIndex(node => node.key === currentKey);
    return index >= 0 ? `Escenario ${index + 1} de ${map.nodes.length}` : 'Escenario actual';
  }

  visitedStageLabels(): string[] {
    const map = this.progressMap();
    if (!map?.nodes.length) return [];
    const visited = new Set(map.visitedNodeKeys);
    return map.nodes
      .filter(node => visited.has(node.key))
      .map(node => node.label);
  }

  decisionCountLabel(): string {
    const count = this.attempt()?.currentNode.options?.length ?? 0;
    if (!count) return 'Sin opciones directas';
    return count === 1 ? '1 opcion' : `${count} opciones`;
  }

  supportResources(): string[] {
    const game = this.attempt();
    const resources = [
      ...(game?.currentNode.supportResources ?? []),
      ...(game?.supportResources ?? [])
    ];
    return Array.from(new Set(resources.filter(Boolean)));
  }

  statusLabelA11y(status: SimulationAttemptState['status']): string {
    return { IN_PROGRESS:'En progreso', COMPLETED:'Finalizado', SAFE_EXITED:'Pausado con salida segura' }[status];
  }

  private showToolFeedback(result: ToolUseResult): void {
    this.audioDirector.playSfx('ui_confirm');
    this.dialogue.set({
      key: `tool-feedback-${result.toolCode}-${Date.now()}`,
      speakerName: result.pertinent ? '✓ Herramienta pertinente' : 'ℹ Herramienta aplicada',
      portraitKey: null, emotion: result.pertinent ? 'positive' : 'neutral',
      lines: [
        { order: 1, speakerName: '', text: result.feedbackMessage, emotion: 'neutral' },
        { order: 2, speakerName: '', text: `Estrés ${result.stressDelta >= 0 ? '+' : ''}${result.stressDelta}%`, emotion: 'neutral' }
      ],
      choices: []
    });
    this.stressPulse.set(true);
    window.setTimeout(() => this.stressPulse.set(false), 700);
    this.announce(result.feedbackMessage);
    window.setTimeout(() => {
      if (this.dialogue()?.key?.startsWith('tool-feedback-')) this.dialogue.set(null);
    }, 5000);
  }

  private buildSupervisionDialogue(feedback: SimulationFeedback): DialogueState {
    const lines: DialogueState['lines'] = [
      { order: 1, speakerName: 'Supervisión clínica', text: feedback.message, emotion: feedback.prohibitedConduct ? 'danger' : 'neutral' }
    ];
    if (feedback.prohibitionReason) {
      lines.push({ order: 2, speakerName: 'Supervisión clínica', text: feedback.prohibitionReason, emotion: 'danger' });
    }
    lines.push({
      order: lines.length + 1,
      speakerName: '',
      text: `Puntaje ${feedback.scoreDelta >= 0 ? '+' : ''}${feedback.scoreDelta} · Estrés ${feedback.stressDelta >= 0 ? '+' : ''}${feedback.stressDelta}% · Confianza ${feedback.trustDelta >= 0 ? '+' : ''}${feedback.trustDelta} · Riesgo ${feedback.victimRiskDelta >= 0 ? '+' : ''}${feedback.victimRiskDelta}`,
      emotion: 'neutral'
    });
    return {
      key: `supervision-${Date.now()}`, speakerName: 'Supervisión clínica',
      portraitKey: null,
      emotion: feedback.prohibitedConduct ? 'danger' : feedback.classification === 'ADEQUATE' ? 'positive' : 'neutral',
      lines, choices: []
    };
  }

  private triggerPatientWithdrawal(): void {
    // TODO(SIEP-VT): mostrar diálogo de cierre del paciente cuando tensión >= 90%
    // El paciente debe emitir una frase de cierre y bloquear las opciones hasta que baje la tensión
  }

  private triggerFade(callback: () => void): void {
    this.audioDirector.playSfx('dialogue_advance');
    this.fadeActive.set(true);
    window.setTimeout(callback, 340);
  }

  private loadProgressMap(attempt: SimulationAttemptState) {
    this.simulationService.getProgressMap(attempt.attemptId, attempt.attemptToken).subscribe({
      next: map => this.progressMap.set(map),
      error: () => this.progressMap.set(null)
    });
  }

  private loadWorld(attempt: SimulationAttemptState) {
    this.simulationService.getWorld(attempt.attemptId, attempt.attemptToken).subscribe({
      next: world => {
        this.world.set(world);
        this.loading.set(false);
        this.busy.set(false);
        window.setTimeout(() => this.fadeActive.set(false), 80);
      },
      error: () => {
        this.error.set('No pudimos cargar el mapa del caso.');
        this.loading.set(false);
        this.busy.set(false);
        this.fadeActive.set(false);
      }
    });
  }

  private announce(message: string): void {
    this.a11yAnnouncement.set('');
    window.setTimeout(() => this.a11yAnnouncement.set(message), 50);
  }

  private persistAttemptToken(attempt: SimulationAttemptState) {
    sessionStorage.setItem(`siep_attempt_${attempt.caseVersionId}`, JSON.stringify({
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken
    }));
  }

  private persistPosition() {
    const game = this.attempt(), world = this.world();
    if (!game || !world || !this.lastPosition || game.status !== 'IN_PROGRESS') return;
    this.simulationService.updateWorldState(game.attemptId, game.attemptToken,
      this.lastPosition.x, this.lastPosition.y, world.map.key)
      .subscribe({ next: u => this.world.set(u), error: () => undefined });
  }
}
