import { A11yModule } from '@angular/cdk/a11y';
import { perfCancel, perfEnd, perfEndNextPaint, perfStart } from '../../core/perf/perf-marks';
import { CommonModule } from '@angular/common';
import { Component, HostListener, Injector, OnDestroy, OnInit, ViewChild, afterNextRender, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { AnnouncePoliteness, LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  DialogueState, InteractionResult, InterventionRuleSet, MapObjectState, NpcConfig, PatientState,
  ProgressMapState, SimulationAttemptState, ScenarioConfig, SimulationFeedback,
  SimulationWorldState, ToolUseResult
} from '../../core/models/simulation.model';
import {
  DEFAULT_INTERVENTION_RULES, PATIENT_INITIAL_STATE, parseInterventionRules,
} from './patient-state.util';
import {
  choiceEvidence, mergeEvidence, type NodeEvidenceDef, collectViewedNpcKeys, missingEvidence, missingEvidenceItems, nodeEvidence,
} from './evidence-gating.config';
import { decorateDialogueState, otherStageDecisionKeys } from './dialogue-decoration.util';
import { type CopyContext, evidenceNoticeText } from './evidence-copy.util';
import { type DoorStatus, type DoorStatusContext, doorStateMap, doorStatus } from './door-status.util';
import { type InteractionVerb, interactionVerb } from './interaction-verb.util';
import { HIGHLIGHT_TOOL_TARGETS, NAME_TOOLS_IN_HINTS, ORIENTATION_COPY, RoomGroup, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import { GameHelpComponent } from './game-help.component';
import { HELP_FIRST_CARD, markHelpSeen, readHelpSeen, resetHelpSeen } from './help-memory.util';
import { SceneChecklistCardComponent } from './scene-checklist-card.component';
import { SceneLogState, deriveSceneLog, diffDone, ringTargetKey, roomGroupOf, sceneLogInputFrom } from './scene-checklist.util';
import { clearVisitedRooms, markRoomVisited, readVisitedRooms } from './visited-rooms.util';
import { DialoguePanelComponent } from './dialogue-panel.component';
import { GameWorldComponent } from './game-world.component';
import { JournalPanelComponent, JournalSaveState } from './journal-panel.component';
import { isShortcutContext } from './keyboard-focus.util';
import { SafeExitButtonComponent } from './safe-exit-button.component';
import { WorldPlacesListComponent } from './world-places-list.component';
import { PlaceCandidate, selectPlaces } from './world-places.util';
import { SimulationHudComponent } from './simulation-hud.component';
import { ToolInventoryComponent } from './tool-inventory.component';
import { AudioDirectorService } from './audio-director.service';
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
import { getSceneGuide } from './scene-guide.config';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { CaseIntroSceneComponent } from './case-intro-scene.component';
import { resolveViewMode, SimulationViewMode } from './simulation-view-mode.util';
import { IntroGateStep, resolveIntroStep } from './intro-gate.util';
import { getDecisionCounter, getSceneProgress, getStageTitle } from './scene-objectives.config';
import { COARSE_POINTER_QUERY, matchesMedia, watchMedia } from './pointer-modality.util';
import { UiButton } from '../../shared/ui/button/ui-button';
import { loadingPhase } from '../../shared/ui/skeleton/loading-phase';
import { UiSpinner } from '../../shared/ui/spinner/ui-spinner';
import { UiErrorKind } from '../../shared/ui/state/state-copy';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { CONSENT_RECORDER } from './consent-recorder';
import { DRAFT_COPY } from './draft-copy';

/** Duración de la transición CSS de `.scene-fade`; los efectos de cámara esperan a que termine. */
const SCENE_FADE_MS = 320;
/** Un aviso no esencial se apaga solo: lo que dice ya quedó escrito en la lista «Qué hacer». */
const NOTICE_MS = 4200;
/** Una nota que estuvo a la vista al menos este tiempo se da por leída aunque un diálogo la cubra después. */
const NOTE_SEEN_MS = 1500;
/**
 * Espera tras activar el fundido de escena antes de seguir con la decisión o la puerta. Supera en 20 ms a la
 * transición CSS (`SCENE_FADE_MS`): son dos cosas distintas, y una no se reutiliza por la otra.
 */
const FADE_OUT_MS = 340;
/** Tras aplicar un mundo nuevo, espera antes de retirar el fundido de escena; luego corren los efectos de cámara. */
const WORLD_REVEAL_DELAY_MS = 80;
/** La supervisión de una decisión que no es la última se abre tanto tiempo después de la respuesta (DLG-05). */
const SUPERVISION_DELAY_MS = 400;
/** Sin movimientos nuevos durante este tiempo, la posición del jugador se guarda en el servidor. */
const POSITION_SAVE_DEBOUNCE_MS = 550;
/** Duración del pulso visual de estrés tras aplicar una herramienta. */
const STRESS_PULSE_MS = 700;
/** Línea «no hay nada cerca» tras pedir interactuar sin nada al alcance. */
const NOTHING_NEARBY_MS = 2500;
/** Nombre de la sala al cambiar de sala. */
const ROOM_BANNER_MS = 2200;
/** Banner «Nueva etapa: …». */
const STAGE_BANNER_MS = 3000;
/** Nota de transición autorada en el mapa (salto temporal). Hoy dura lo mismo que `NOTICE_MS`, pero es otro aviso. */
const TRANSITION_NOTE_MS = 4200;
/** Modo compacto (F§7.9): la misma condición que el CSS compacto y que el HUD. */
const COMPACT_QUERY = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';
/** Pantalla estrecha (móvil vertical): la tarjeta también arranca plegada, el mundo ocupa el ancho (F§4.6). */
const NARROW_QUERY = '(max-width: 760px)';
/**
 * Plazo de seguridad de la pausa en cola (F2, REGLA-004): una petición colgada (servidor atascado, red muy lenta) no
 * puede dejar la salida segura sin enviar. Pasado el plazo la pausa se envía igualmente; el servidor valida el token.
 */
const QUEUED_PAUSE_DEADLINE_MS = 10_000;
const QUEUED_PAUSE_SLOW_NOTICE = 'La acción en curso está tardando. Estamos pausando el caso igualmente.';
const CASE_INTRO_TITLE = 'Contexto inicial del caso';
const CASE_INTRO_PARAGRAPHS = [
  'Son las 11 de la noche en un barrio con altas condiciones de vulnerabilidad: pobreza, violencias urbanas, robos, expendio de drogas, presencia de grupos armados ilegales y riñas callejeras entre vecinos.',
  'Un hombre de aproximadamente 28 años entra a su domicilio, donde reside con su pareja actual, una mujer de 22 años. Ella tiene una hija de 3 años.',
  'En horas de la tarde, el hombre había tenido un altercado verbal con su pareja. Hubo groserías, maltrato psicológico y chantaje emocional: le dijo que sin él no era nadie, que era una mujer mantenida y que estaba seguro de que ella le era infiel.',
  'Esa noche, cuando él entra a la residencia, la mujer le reclama por llegar tarde y haberse perdido toda la tarde.',
  'El hombre, sin mediar palabra, saca una navaja y hiere a la niña de 3 años, causándole la muerte de manera inmediata. Luego hiere a la mujer con 28 heridas de arma cortopunzante, dejándola gravemente herida.',
  'Tu intervención inicia en urgencias. Lee el contexto con cuidado: cada conversación, herramienta y decisión puede cambiar el curso de la atención.'
];

@Component({
  selector: 'app-simulation-play',
  standalone: true,
  imports: [
    A11yModule, CommonModule, RouterLink, MatIconModule,
    SimulationHudComponent, GameWorldComponent, DialoguePanelComponent,
    ToolInventoryComponent, JournalPanelComponent, AttemptOutcomeComponent, CaseIntroSceneComponent,
    SafeExitButtonComponent, SceneChecklistCardComponent, GameHelpComponent, WorldPlacesListComponent,
    UiButton, UiErrorState, UiScopeNotice, UiSpinner
  ],
  template: `
    <div class="game-container" data-skin="game" id="main-content" tabindex="-1" [attr.data-mode]="viewMode()"
      [class.game-container--reduce-motion]="reduceMotion()">
      <!-- Sin región viva propia (F6-12): todo anuncio sale por las dos regiones persistentes de la app
           (LiveRegionAnnouncer), que ya existen antes de que cambie su texto. -->
      <!-- Un h1 por pantalla (plan visual F3-6): el nombre del caso, visualmente oculto (el juego es a sangre). -->
      <h1 class="sr-only">{{ attempt()?.caseTitle || 'Simulación' }}</h1>

      <!-- UN solo indicador de arranque (F6-1), del intento al primer cuadro del mundo: la región de estado siempre
           está presente y el indicador aparece a los 150 ms (loadingPhase). Cubre solo la zona del mundo: con el intento
           ya cargado, la cabecera y «Salida segura» siguen a la vista (REGLA-004). -->
      <p class="sr-only" role="status">{{ bootVisible() ? bootLabel() : '' }}</p>
      @if (bootVisible()) {
        <div class="game-boot" aria-hidden="true">
          <ui-spinner [size]="32" />
          <p>{{ bootLabel() }}</p>
        </div>
      }
      @if (error()) {
        <!-- Un fallo nunca se traga: mensaje, reintento (vuelve a pedir lo que falló) y una salida. Con un intento en
             curso la salida es el «Salida segura» del pie, que queda fuera de esta capa. -->
        <div class="game-failure">
          <ui-error-state blocking autofocus [kind]="errorKind()" [message]="error()" [status]="errorStatus()"
            (retry)="retryFromError()" />
          @if (!footerExit()) {
            <a ui-button variant="secondary" routerLink="/portal/simulador">Volver al simulador</a>
          }
        </div>
      }
      <!-- Los avisos ACCIONABLES (la puerta bloqueada y el error de una acción, VD-29) ya no se pintan aquí: son avisos
           del sistema (ui-toast-host, colocación del juego: arriba a la izquierda). Permanecen hasta cerrarse con
           «Cerrar», no mueven el foco y los anuncia ese anfitrión una vez (assertive solo el error). -->
      @if (softNotice()) {
        <!-- Aviso breve (4,2 s): lo que dice ya se anunció y quedó escrito en la lista «Qué hacer»; nunca es la única
             fuente. Sin role: una región que nace con su texto no se anuncia de forma fiable. -->
        <div class="soft-notice">{{ softNotice() }}</div>
      }
      @if (pausing()) {
        <!-- Acuse visible de la salida segura pedida: con una superposición abierta el pie queda oculto.
             Los lectores de pantalla ya reciben el aviso por la región viva. -->
        <div class="pausing-notice" aria-hidden="true">
          <mat-icon aria-hidden="true">pause_circle</mat-icon>
          <span>{{ pausingSlow() ? slowPauseNotice : 'Pausando el caso…' }}</span>
        </div>
      }
      @if (roomBanner() && !fadeActive()) {
        <div class="room-banner">{{ roomBanner() }}</div>
      }
      @if (transitionNote()) {
        <div class="transition-note">
          <p>{{ transitionNote() }}</p>
        </div>
      }

      @if (showResumePrompt() && pendingActiveAttempt(); as active) {
        <!-- Reanudar comparte estructura, movimiento y comportamiento modal con las otras tres entradas (F6-2). -->
        <section class="case-intro-overlay case-intro-overlay--resume" role="dialog" aria-modal="true"
          aria-labelledby="resume-title" aria-describedby="resume-body">
          <article class="case-intro-card case-intro-card--entry" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
            <header class="case-intro-card__header">
              <p class="psy-eyebrow">Intento en progreso</p>
              <h2 id="resume-title">Continuar simulación formativa</h2>
            </header>

            <div class="case-intro-card__body" id="resume-body">
              <p>
                Ya tienes un intento activo en <strong>{{ active.caseTitle }}</strong>.
                Puedes retomarlo desde <strong>{{ active.currentNode.title }}</strong> o iniciar uno nuevo.
              </p>
              <div class="case-intro-card__metrics">
                <span>Puntaje: {{ active.accumulatedScore }}</span>
                <span>Estrés: {{ active.stressIndex }}%</span>
                <span>Riesgo: {{ active.metrics.victimRisk }}%</span>
              </div>
            </div>

            <footer class="case-intro-card__actions">
              <a ui-button variant="ghost" routerLink="/portal/simulador">Volver al catálogo</a>
              <div class="case-intro-card__buttons">
                <!-- RN-07: empezar de nuevo nombra lo que se pierde y «Continuar» (conservar el intento) es lo seguro. -->
                <button ui-button variant="secondary" type="button" (click)="requestNewAttempt()">Iniciar nuevo intento</button>
                <button cdkFocusInitial ui-button variant="primary" type="button" (click)="resumeAttempt()">
                  {{ active.status === 'PAUSED' ? 'Reanudar intento en pausa' : 'Continuar intento en progreso' }}
                </button>
              </div>
            </footer>
          </article>
        </section>
      }

      @if (attempt(); as game) {
        @if (showContentWarning()) {
          <section class="case-intro-overlay content-warning-overlay" role="dialog" aria-modal="true"
            aria-labelledby="content-warning-title" aria-describedby="content-warning-body">
            <article class="case-intro-card content-warning-card" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Aviso de contenido</p>
                <h2 id="content-warning-title">Antes de entrar al caso</h2>
                <span class="case-intro-card__chip">Simulación formativa con datos ficticios</span>
              </header>

              <div class="case-intro-card__body">
                <!-- Solo el texto validado: aria-describedby lo lee tal cual; el aviso de alcance y el estado del
                     registro van fuera de este bloque. -->
                <div id="content-warning-body">
                  <p>
                    Este caso presenta una situación ficticia de violencia basada en género
                    y crisis familiar. Algunas escenas incluyen relatos y decisiones
                    emocionalmente exigentes.
                  </p>
                  <p>
                    Podrás pausar el caso en cualquier momento con el botón «Salida segura»
                    (con teclado, también <kbd>Esc</kbd>). Tu avance se guarda y puedes retomarlo.
                    Si prefieres no continuar ahora, vuelve al catálogo y retoma el caso
                    cuando lo decidas.
                  </p>
                </div>
                <!-- Aviso de alcance (RN-01, borrador de Psicología): fuera del texto validado. -->
                <ui-scope-notice />
                @if (consentState() === 'error') {
                  <!-- ETH-01: un almacenamiento que falla NUNCA da el consentimiento por registrado. No se arranca
                       nada y se puede reintentar; «Volver al catálogo» sigue operable. Se anuncia por la región. -->
                  <div class="consent-error">
                    <mat-icon aria-hidden="true">error</mat-icon>
                    <p>{{ consentErrorText }}</p>
                    <button ui-button type="button" variant="secondary" (click)="acceptContentWarning()">Reintentar</button>
                  </div>
                }
              </div>

              <footer class="case-intro-card__actions">
                <button ui-button type="button" variant="ghost" (click)="declineContentWarning()">
                  Volver al catálogo
                </button>
                <button ui-button type="button" variant="primary" cdkFocusInitial
                  [loading]="consentState() === 'saving'" (click)="acceptContentWarning()">
                  Continuar
                </button>
              </footer>
            </article>
          </section>
        }

        @if (worldStarted()) {
        @if (showIntroScene()) {
          <section class="case-intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-scene-title">
            <article class="case-intro-card case-intro-card--scene" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Introducción</p>
                <h2 id="intro-scene-title">Antes de comenzar</h2>
              </header>

              <div class="case-intro-card__media">
                <app-case-intro-scene [reduceMotion]="reduceMotion()" />
              </div>

              <footer class="case-intro-card__actions">
                <button type="button" class="intro-music-toggle" [attr.aria-pressed]="musicMuted()" (click)="toggleMusicMute()">
                  <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                  <span>Silenciar música</span>
                </button>
                <div class="case-intro-card__buttons">
                  <app-safe-exit-button [pausing]="pausing()" (pause)="pauseFromOverlay()" />
                  <button cdkFocusInitial class="psy-button psy-button--primary" type="button" (click)="continueFromIntroScene()">
                    Continuar
                  </button>
                </div>
              </footer>
            </article>
          </section>
        }

        @if (showCaseIntro()) {
          <section class="case-intro-overlay" role="dialog" aria-modal="true" aria-labelledby="case-intro-title">
            <article class="case-intro-card" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
              <header class="case-intro-card__header">
                <p class="psy-eyebrow">Primera escena</p>
                <h2 id="case-intro-title">{{ caseIntroTitle }}</h2>
                <button type="button" class="intro-music-toggle" [attr.aria-pressed]="musicMuted()" (click)="toggleMusicMute()">
                  <mat-icon aria-hidden="true">{{ musicMuted() ? 'music_off' : 'music_note' }}</mat-icon>
                  <span>Silenciar música</span>
                </button>
              </header>

              <div class="case-intro-card__body" tabindex="0" role="region" aria-label="Contexto narrativo del caso">
                @for (paragraph of caseIntroParagraphs; track paragraph) {
                  <p>{{ paragraph }}</p>
                }
              </div>

              <footer class="case-intro-card__actions">
                <span>Lee el contexto completo antes de iniciar la intervención.</span>
                <div class="case-intro-card__buttons">
                  <app-safe-exit-button [pausing]="pausing()" (pause)="pauseFromOverlay()" />
                  <button cdkFocusInitial class="psy-button psy-button--primary" type="button" (click)="continueFromCaseIntro()">
                    Continuar
                  </button>
                </div>
              </footer>
            </article>
          </section>
        }

        <header class="top-bar" [attr.inert]="inputBlocked() ? '' : null" [attr.aria-hidden]="inputBlocked() ? 'true' : null">
          <app-simulation-hud
            [attempt]="game"
            [stressPulse]="stressPulse()"
            [patientState]="patientState()"
            [stageLabel]="stageLabel()"
            [locationLabel]="world()?.map?.title ?? ''"
            [journalOpen]="journalOpen()"
            [musicMuted]="musicMuted()"
            [sfxMuted]="sfxMuted()"
            [reduceMotion]="reduceMotion()"
            (toggleJournal)="journalOpen.set(!journalOpen())" (openPlaces)="openPlaces()"
            [shortcuts]="shortcuts.enabled()" (toggleShortcuts)="shortcuts.toggle()"
            (toggleMusic)="toggleMusicMute()"
            (toggleSfx)="toggleSfxMute()"
            (toggleReduceMotion)="toggleReduceMotion()"
            (openHelp)="openHelp()" (helpReset)="resetHelpCard()" />
          @if (sensitiveNotice(); as notice) {
            <!-- Recordatorio ético del nodo sensible (ETH-01): franja fija bajo la cabecera, siempre a la vista en todos los dispositivos
                 (no vive en la tarjeta «Qué hacer», que se pliega a su chip). Ocupa su propio sitio: no tapa al personaje ni los controles. -->
            <p class="sensitive-strip">{{ notice }}</p>
          }
        </header>

        <div class="main-zone">
          <section class="canvas-zone" aria-label="Escena de la simulación"
            [attr.inert]="inputBlocked() ? '' : null" [attr.aria-hidden]="inputBlocked() ? 'true' : null">
            @if (sceneLog(); as log) {
              <!-- Sin role="status": la tarjeta ya trae su única región viva (si no, se anunciaría entera en cada cambio). -->
              <div class="objective-card">
                <!-- La lista se desplaza por dentro con tope de alto (no baja hasta las personas y objetos del suelo). -->
                <div class="objective-card__scroll">
                  <app-scene-checklist-card [state]="log" [compact]="cardFolded()"
                    [reduceMotion]="reduceMotion()" [notice]="checklistNotice()" />
                </div>
              </div>
            }

            @if (world(); as w) {
              <app-game-world #gameWorld id="game-area" class="game-surface" [world]="w"
                [scenarioConfig]="scenarioConfig()"
                [guide]="sceneGuide()" [viewedNpcKeys]="viewedNpcKeys()" [shortcuts]="shortcuts.enabled()"
                [nearbyInteraction]="nearbyInteraction()" [selectedInteractionKey]="selectedInteraction()?.key ?? null"
                [motionPaused]="worldMotionPaused()"
                [sfxMuted]="sfxMuted()"
                [reduceMotion]="reduceMotion()"
                [stressLevel]="attempt()?.stressIndex ?? 0"
                [doorStates]="doorStates()"
                [nextTargetKey]="nextTargetKey()" [dimmedKeys]="dimmedKeys()" [compact]="compactMode()"
                [showLoader]="false" (worldReady)="onWorldReady()"
                (proximity)="nearbyInteraction.set($event)" (proximityAlso)="nearbyAlso.set($event)"
                (nothingNearby)="showNothingNearby()" (interact)="openInteraction($event)"
                (npcInteract)="openNpcDialogue($event)" (walkEnded)="onWalkEnded($event)"
                (bootFailed)="onWorldBootFailed()"
                (roomExit)="onRoomExit($event)"
                (enterRoom)="onDoorTrigger($event)"
                (positionChange)="rememberPosition($event.x, $event.y)" />
            } @else {
              <!-- Solo el fondo: el indicador de carga es .game-boot (un solo estado). #game-area existe siempre. -->
              <div id="game-area" class="world-skeleton" aria-hidden="true"></div>
            }

            @if (showHelpCard()) {
              <!-- Tarjeta de primera vez: no modal, sin temporizador, no roba el foco ni consume Esc. -->
              <div class="help-slot">
                <app-game-help view="card" [modality]="helpModality()" [compact]="compactMode()"
                  [safeExitPromise]="safeExitPromise"
                  (dismissed)="markHelpCardSeen()" (openFull)="openHelp()" />
              </div>
            }

          </section>

          @if (viewMode() === 'dialogue-right') {
            <aside class="right-panel" aria-label="Decisión formativa en curso" (animationend)="refreshWorldScale()">
              <header class="right-panel__scene">
                <p class="right-panel__kicker">{{ stageLabel() }}</p>
                <h2>{{ game.currentNode.title }}</h2>
                @if (game.currentNode.narrative) {
                  <p class="right-panel__narrative" tabindex="0" role="region"
                    aria-label="Contexto narrativo de la etapa">{{ game.currentNode.narrative }}</p>
                }
              </header>
              <app-dialogue-panel class="dialogue-side" mode="side" [reduceMotion]="reduceMotion()"
                [dialogue]="dialogue()" [interaction]="selectedInteraction()"
                [releaseToken]="dialogueReleaseToken()" [pausing]="pausing()"
                (close)="closeDialogue()" (safeExit)="pauseFromOverlay()"
                (execute)="executeDecision($event)" (useTool)="useTool($event)"
                (frontendChoice)="handleFrontendChoice($event)" />
            </aside>
          }
        </div>

        <!-- REGLA-004: mientras el fundido de escena (o la nota de transición) espera al servidor, el pie queda por encima y «Salida segura» se ve y se toca. -->
        <footer class="bottom-zone" [class.bottom-zone--above-veils]="footerAboveVeils()"
          [attr.inert]="inputBlocked() ? '' : null" [attr.aria-hidden]="inputBlocked() ? 'true' : null">
          @if (game.status === 'IN_PROGRESS') {
            <!-- La misma implementación que las superposiciones (F6-6, REGLA-004). Sin [disabled]: con una petición
                 en curso el toque se acepta y la pausa queda en cola (H-04), y el rótulo pasa a «Pausando…»
                 (aria-busy). Sin aria-label: el nombre accesible sale del texto visible (WCAG 2.5.3, axe
                 label-content-name-mismatch); la tecla Esc es aria-hidden. -->
            <app-safe-exit-button [compact]="compactMode()" [pausing]="pausing()" (pause)="pauseFromOverlay()" />
          }

          <app-tool-inventory class="tool-dock" [tools]="world()?.tools ?? []"
            [inventory]="world()?.inventory ?? []"
            [selectedToolCode]="selectedToolCode()"
            (select)="selectTool($event)" />

          <!-- Sin aria-live (H-10): la barra ya no relee la línea de reposo ni la pista de teclas. La interacción
               cercana la anuncia el servicio de regiones vivas (efecto sobre contextLabel). -->
          <div class="context-bar">
            @if (contextAction(); as action) {
              <!-- Un solo botón principal, una línea y altura fija: el mundo no cambia de tamaño al acercarte a algo. -->
              <button type="button" class="context-bar__interaction"
                [class.context-bar__interaction--exit]="action.obj.type === 'EXIT'"
                [class.context-bar__interaction--locked]="action.verb.locked"
                (click)="openInteraction(action.obj)" [attr.aria-label]="action.ariaLabel" [attr.title]="action.title">
                @if (!compactMode()) { <kbd aria-hidden="true">{{ shortcuts.enabled() ? 'E' : 'Enter' }}</kbd> }
                @if (action.verb.locked) { <mat-icon class="context-bar__lock" aria-hidden="true">lock</mat-icon> }
                <span class="context-bar__copy">
                  <strong>{{ action.verb.text }}</strong>
                  @if (action.verb.locked && action.verb.reason) {
                    <span class="context-bar__reason">{{ action.verb.reason }}</span>
                  }
                </span>
              </button>
              @if (contextAlso(); as also) {
                <button type="button" class="context-bar__interaction context-bar__interaction--secondary"
                  [class.context-bar__interaction--locked]="also.verb.locked"
                  (click)="openInteraction(also.obj)" [attr.title]="also.title" [attr.aria-label]="'También: ' + also.verb.text">
                  @if (also.verb.locked) { <mat-icon class="context-bar__lock" aria-hidden="true">lock</mat-icon> }
                  <span class="context-bar__also">También:</span>
                  <strong>{{ also.verb.text }}</strong>
                </button>
              }
            } @else {
              <div class="context-bar__idle">
                <p class="context-bar__now">{{ nowLine() }}</p>
                <!-- aria-hidden: es una pista visual; la ayuda ya dice las teclas por escrito. -->
                @if (shortcuts.enabled()) {
                  <p class="context-bar__hint" aria-hidden="true">WASD mover · <kbd>E</kbd> interactuar · <kbd>J</kbd> bitácora · <kbd>Esc</kbd> salida segura</p>
                } @else {
                  <p class="context-bar__hint" aria-hidden="true">Flechas mover · <kbd>Enter</kbd> interactuar · <kbd>Esc</kbd> salida segura</p>
                }
              </div>
            }
          </div>
        </footer>

        @if (viewMode() === 'dialogue-cinematic') {
          <app-dialogue-panel class="dialogue-cinematic" [reduceMotion]="reduceMotion()" [dialogue]="dialogue()" [interaction]="selectedInteraction()"
            [releaseToken]="dialogueReleaseToken()" [pausing]="pausing()"
            (close)="closeDialogue()" (safeExit)="pauseFromOverlay()"
            (execute)="executeDecision($event)" (useTool)="useTool($event)"
            (frontendChoice)="handleFrontendChoice($event)" />
        }

        @if (helpOpen()) {
          <!-- Pantalla «Cómo se juega»: encima del mundo pero sin cubrir la cabecera ni el pie, que siguen operables. -->
          <div class="help-layer">
            <app-game-help view="screen" [modality]="helpModality()" [safeExitPromise]="safeExitPromise"
              (closed)="helpOpen.set(false)" />
          </div>
        }

        @if (journalOpen()) {
          <div class="overlay-backdrop" aria-hidden="true" (click)="journalOpen.set(false)"></div>
        }
        @if (placesOpen()) {
          <!-- «Ir a…» (F6-11): modal, con SU «Salida segura»; la cabecera, el mundo y el pie quedan inertes. -->
          <div class="overlay-backdrop" aria-hidden="true" (click)="closePlaces()"></div>
          <app-world-places-list [places]="placeOptions()" [pausing]="pausing()"
            (choose)="choosePlace($event)" (closed)="closePlaces()" (safeExit)="pauseFromOverlay()" />
        }
        <app-journal-panel #journalPanel class="journal-layer" [open]="journalOpen()"
          [disabled]="game.status !== 'IN_PROGRESS' || busy()" [message]="journalMessage()"
          [saveState]="journalSaveState()"
          [timeline]="visitedStageLabels()"
          [resources]="supportResources()" [pausing]="pausing()"
          (save)="saveReflection($event)" (closeSheet)="journalOpen.set(false)"
          (safeExit)="pauseFromOverlay()" />

        <!-- Screen-reader narrative route -->
        <section class="sr-narrative-route" aria-label="Ruta narrativa accesible">
          <h2 class="sr-only">Escena: {{ game.currentNode.title }}</h2>
          <p class="sr-only">{{ game.currentNode.narrative }}</p>
          @if (game.currentNode.warningMessage) {
            <p class="sr-only" role="alert">Advertencia: {{ game.currentNode.warningMessage }}</p>
          }
          @if (game.currentNode.sensitiveContent) {
            <p class="sr-only" role="note">Contenido sensible. Puedes pausar el caso con el botón «Salida segura» o con la tecla Escape.</p>
          }
          <div class="sr-only">Puntaje: {{ game.accumulatedScore }}. Estrés: {{ game.stressIndex }}%. Estado: {{ statusLabelA11y(game.status) }}.</div>
        </section>

        @if (!holdingOutcome()) {
          <app-attempt-outcome [report]="game.completionReport" [status]="game.status"
            [supportResources]="supportResources()"
            (retry)="startNewAttempt()" (resume)="resumeCurrentAttempt()" />
        }

        <div class="scene-fade" [class.scene-fade--active]="fadeActive()" aria-hidden="true"></div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: block; }
    .game-container {
      --sim-purple: #7C4DFF; /* legado sin token (como --sim-blue, superficies, borde y brillo): lo retira F6-1 */
      --sim-lavender: var(--ds-primary);
      --sim-blue: #6CC0C7;
      --sim-green: var(--ds-success);
      --sim-orange: var(--ds-warning-text);
      --sim-red: var(--ds-danger);
      --sim-ink: var(--ds-text-1);
      --sim-ink-soft: rgba(244,247,251,.74);
      --sim-ink-mute: rgba(244,247,251,.5);
      --sim-surface: rgba(27,33,51,.72);
      --sim-surface-2: rgba(18,24,42,.6);
      --sim-border: rgba(182,156,255,.22);
      --sim-glow: 0 18px 48px -28px rgba(124,77,255,.6);
      position: fixed;
      inset: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      /* La columna explícita clampa el track al viewport: sin ella, el
         min-content de la bottom-zone (dock + salida segura) ensancha el track
         implícito y desborda canvas + objective-card en mobile. */
      grid-template-columns: minmax(0, 1fr);
      overflow: hidden;
      color: var(--sim-ink);
      background:
        linear-gradient(90deg, rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(rgba(124,77,255,.05) 1px, transparent 1px) 0 0 / 24px 24px,
        linear-gradient(180deg, #111827 0%, #0e1322 100%);
    }

    /* Eyebrow sobre las tarjetas oscuras del juego: el primario de la piel (#B69CFF = 7,7:1 sobre #12182A). */
    .game-container .psy-eyebrow { color: var(--ds-primary); }

    /* ── Top bar ─────────────────────────────────────────────────────────── */
    .top-bar { z-index: 40; }
    /* Cabecera y pie bajo una capa o un diálogo lateral (inert): se ven apagados, no «vivos pero muertos» (F6-1).
       El mundo no se atenúa con un diálogo lateral abierto: sigue siendo el contexto de lo que se decide. */
    .top-bar[inert], .bottom-zone[inert] {
      opacity: .55;
      filter: saturate(.6);
      transition: opacity var(--ds-dur-fade) var(--ds-ease-out);
    }

    /* ── Main zone: canvas + optional right panel ────────────────────────── */
    .main-zone {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      min-height: 0;
      padding: 10px 12px 0;
    }
    .game-container[data-mode='dialogue-right'] .main-zone {
      grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 480px);
    }
    .canvas-zone {
      position: relative;
      min-height: 0;
      border: 1px solid rgba(182,156,255,.18);
      border-radius: 16px;
      overflow: hidden;
      background: #0e1322;
      box-shadow: var(--sim-glow);
    }
    .game-surface { position: absolute; inset: 0; }
    .world-skeleton { position: absolute; inset: 0; background: #0e1322; }

    /* Envoltorio de la tarjeta «Qué hacer»: aporta posición, borde y fondo (la tarjeta no pinta superficie);
       los contrastes de la tarjeta se miden contra este fondo (scene-checklist-card.component.spec). */
    .objective-card {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 20;
      width: min(380px, 58%);
      /* Tope de alto: sin él la lista desplegada bajaba sobre el kit y la Familia en crisis, que nacen en el tercio inferior. */
      max-height: min(calc(100% - 20px), 66%);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 8px 11px;
      border: 1px solid rgba(182,156,255,.32);
      border-radius: 10px;
      background: rgba(8,12,18,.88);
      /* Marco doble: línea interna oscura — acabado pixel-art sobrio. */
      box-shadow:
        inset 0 0 0 1px rgba(8,12,18,.95),
        0 12px 30px -22px rgba(124,77,255,.55);
    }
    @media (min-width: 1100px) {
      /* Más ancha, la lista y el aviso pierden líneas: con el tope de alto se ve entera (o casi) sin tapar el kit ni la Familia en crisis. */
      .objective-card { width: min(560px, 50%); }
    }
    /* Plegada a su chip (modo compacto) la tarjeta se sostiene sola: sin caja alrededor. */
    .objective-card:has(app-scene-checklist-card[data-collapsed='true']) {
      right: auto;
      width: auto;
      padding: 0;
      border: 0;
      background: none;
      box-shadow: none;
      overflow: visible;
    }
    .objective-card__scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
    .objective-card:has(app-scene-checklist-card[data-collapsed='true']) .objective-card__scroll { overflow: visible; }
    /* Recordatorio ético del nodo sensible (ETH-01): franja bajo la cabecera, fuera de la tarjeta plegable. Legible (>= 12 px) y con
       contraste alto; ocupa su propio sitio (el mundo se reencuadra solo), así que no tapa al personaje ni los controles. */
    .sensitive-strip {
      margin: 0;
      padding: 5px 14px;
      background: rgba(8,12,18,.94);
      border-bottom: 1px solid rgba(245,184,75,.28);
      color: #f3dfb5;
      font-size: .78rem;
      line-height: 1.35;
      text-align: center;
    }

    /* Tarjeta de primera vez: sobre las cruces táctiles (48) para que sus botones siempre se puedan tocar, y bajo las
       tarjetas de introducción (380) y la pausa. El jugador empieza abajo al centro:
       con sitio de sobra la tarjeta va arriba a la derecha, junto a «Qué hacer», para no taparlo. */
    .help-slot {
      position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 60;
      width: min(560px, calc(100% - 24px));
    }
    @media (min-width: 1100px) {
      /* 380 px: más ancha tapaba la puerta del quirófano (acceso restringido) en el arranque de Urgencias. */
      .help-slot { top: 12px; bottom: auto; left: auto; right: 12px; transform: none; width: min(380px, calc(100% - 488px)); }
    }
    /* Móvil vertical: las cruces táctiles ocupan abajo; la tarjeta va arriba, bajo el chip de «Qué hacer». */
    @media (max-width: 760px) {
      .help-slot { top: 52px; bottom: auto; }
    }
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      /* Entre las bandas de las cruces táctiles (≈ 150 px a cada lado): sus botones quedan a la vista y se pueden tocar. */
      .help-slot { top: 8px; bottom: auto; left: 50%; right: auto; transform: translateX(-50%); width: min(460px, calc(100% - 300px)); }
    }
    /* Pantalla de ayuda: deja libres la cabecera (48 px) y el pie (64 px); la capa no captura toques fuera de la hoja. */
    .help-layer {
      position: absolute; left: 0; right: 0; top: 52px; bottom: 68px; z-index: 90;
      display: grid; place-items: center; padding: 8px 12px; pointer-events: none;
    }
    .help-layer app-game-help { width: min(640px, 100%); max-height: 100%; pointer-events: auto; }
    /* La hoja de ayuda trae su propio tope (78vh / 92vh): aquí no puede pasar de la capa, o taparía el pie. */
    .help-layer ::ng-deep .help-screen { max-height: min(560px, calc(100vh - 136px)); }

    /* ── Right panel (solo en dialogue-right) ────────────────────────────── */
    .right-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      border: 1px solid var(--sim-border);
      border-radius: 16px;
      overflow: hidden;
      background: var(--sim-surface);
      backdrop-filter: blur(18px) saturate(120%);
      box-shadow: var(--sim-glow);
      animation: panel-in 180ms cubic-bezier(.2,.8,.2,1) both;
    }
    .right-panel__scene {
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--sim-border);
      background: rgba(124,77,255,.08);
    }
    .right-panel__kicker {
      margin: 0;
      color: var(--sim-lavender);
      font-size: .75rem;
      font-weight: 900;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .right-panel__scene h2 { margin: 4px 0 0; font-size: 1.02rem; line-height: 1.2; color: var(--sim-ink); }
    .right-panel__narrative {
      margin: 8px 0 0;
      max-height: 88px;
      overflow-y: auto;
      color: var(--sim-ink-soft);
      font-size: .78rem;
      line-height: 1.5;
    }
    .dialogue-side { display: block; min-height: 0; overflow: hidden; }

    /* ── Bottom zone: salida segura + dock + contexto ────────────────────── */
    /* Altura FIJA: acercarte a algo cambia el texto del pie, nunca su tamaño (el mundo no salta; TOUCH-04). */
    .bottom-zone {
      display: flex;
      align-items: stretch;
      gap: 10px;
      box-sizing: border-box;
      height: 64px;
      padding: 8px 12px 10px;
      z-index: 30;
    }
    /* Con el fundido de escena (z 200) o la nota de transición (z 340) a pantalla completa, el pie sube por encima:
       «Salida segura» nunca queda tapada mientras una puerta o una decisión esperan al servidor (REGLA-004). */
    .bottom-zone--above-veils { z-index: 350; }
    /* «Salida segura» del pie es app-safe-exit-button (F6-6): su forma vive en el componente; aquí solo su sitio. */
    .bottom-zone > app-safe-exit-button { flex-shrink: 0; }
    .tool-dock { display: block; min-width: 0; flex: 0 1 auto; }
    .context-bar {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
      min-height: 0;
    }
    .context-bar__interaction {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      max-height: 100%;
      min-height: 44px;
      padding: 5px 14px;
      border: 1px solid rgba(182,156,255,.35);
      border-radius: 12px;
      background: rgba(8,12,18,.88);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      overflow: hidden;
    }
    .context-bar__interaction--exit { border-color: rgba(182,156,255,.65); }
    /* Puerta bloqueada: forma, no solo color (borde discontinuo y candado). */
    .context-bar__interaction--locked { border-style: dashed; border-color: rgba(245,184,75,.7); }
    .context-bar__interaction kbd {
      flex-shrink: 0;
      padding: 3px 9px;
      border-radius: 6px;
      background: rgba(124,77,255,.22);
      border: 1px solid rgba(124,77,255,.4);
      font-size: .8rem;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      color: #c9b8ff;
    }
    .context-bar__lock { flex-shrink: 0; width: 18px; height: 18px; font-size: 18px; color: #F5B84B; }
    /* La tecla E solo se rotula con teclado y puntero fino: en táctil el botón basta. */
    @media not all and (hover: hover) and (pointer: fine) {
      .context-bar__interaction kbd { display: none; }
    }
    .context-bar__copy { display: grid; min-width: 0; }
    .context-bar__copy strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: .8rem;
      color: #cdbcff;
      line-height: 1.25;
    }
    .context-bar__reason {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: .75rem;
      line-height: 1.3;
      color: #ffe2ae;
    }
    /* Segundo candidato en rango: más pequeño; la tecla E siempre actúa sobre el principal. */
    .context-bar__interaction--secondary {
      flex: 0 1 40%; min-width: 96px; gap: 6px; padding: 4px 10px; border-color: rgba(182,156,255,.25);
    }
    .context-bar__interaction--secondary strong {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; color: #cdbcff;
    }
    .context-bar__also { flex-shrink: 0; font-size: .75rem; font-weight: 700; color: rgba(232,240,244,.78); }
    /* Sin nada cerca: el siguiente paso arriba y, con teclado y espacio de sobra, la leyenda debajo. */
    .context-bar__idle { flex: 1; min-width: 0; display: grid; gap: 2px; align-content: center; text-align: left; }
    .context-bar__now {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: .84rem;
      font-weight: 700;
      line-height: 1.3;
      color: rgba(244,247,251,.94);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    /* Leyenda de teclado: solo donde hay teclado y espacio de sobra (puntero fino y ancho >= 1150 px). */
    .context-bar__hint {
      display: none;
      margin: 0;
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .04em;
      color: rgba(232,240,244,.72);
      white-space: nowrap;
    }
    @media (hover: hover) and (pointer: fine) and (min-width: 1150px) {
      .context-bar__hint { display: block; }
    }
    .context-bar__hint kbd {
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(124,77,255,.16);
      font-family: 'JetBrains Mono', monospace;
      font-size: .75rem;
      color: #c9b8ff;
    }

    /* Advertencia de contenido (ETH-01): variante del card de intro. */
    .case-intro-overlay.content-warning-overlay { z-index: 395; }
    .case-intro-card.content-warning-card { width: min(640px, 100%); }

    .case-intro-overlay {
      position: absolute;
      inset: 0;
      z-index: 380;
      display: grid;
      place-items: center;
      padding: clamp(14px, 4vw, 32px);
      background:
        radial-gradient(circle at 50% 20%, rgba(124,77,255,.16), transparent 40%),
        rgba(5,8,14,.9);
      animation: case-intro-fade var(--ds-dur-fade) var(--ds-ease-out) both;
    }
    .case-intro-card {
      animation: case-intro-rise var(--ds-dur-base) var(--ds-ease-out) both;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      width: min(760px, 100%);
      max-height: min(86vh, 720px);
      border: 1px solid rgba(182,156,255,.34);
      border-radius: 18px;
      overflow: hidden;
      color: var(--sim-ink);
      background: linear-gradient(180deg, rgba(18,24,42,.96), rgba(8,12,18,.98));
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.04),
        0 28px 80px -36px rgba(124,77,255,.75);
    }
    .case-intro-card__header {
      display: grid;
      gap: 8px;
      padding: clamp(18px, 4vw, 28px) clamp(18px, 4vw, 32px) 16px;
      border-bottom: 1px solid rgba(182,156,255,.18);
      background: rgba(124,77,255,.08);
    }
    .case-intro-card__header h2 {
      margin: 0;
      font-size: clamp(1.25rem, 3.6vw, 2rem);
      line-height: 1.15;
      color: #fff;
    }
    /* Chip del aviso de consentimiento. Clase propia: un selector por etiqueta del encabezado
       también alcanzaría al texto del botón de silenciar. */
    .case-intro-card__chip {
      width: fit-content;
      padding: 5px 10px;
      border: 1px solid rgba(108,192,199,.32);
      border-radius: 999px;
      color: #bdeef2;
      background: rgba(108,192,199,.1);
      font-size: .75rem;
      font-weight: 800;
      letter-spacing: .04em;
    }
    .intro-music-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid rgba(108,192,199,.32);
      border-radius: 999px;
      color: #bdeef2;
      background: rgba(108,192,199,.1);
      font: inherit;
      font-size: .8rem;
      font-weight: 700;
      cursor: pointer;
      transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
    }
    .intro-music-toggle[aria-pressed="true"] {
      color: rgba(244,247,251,.7);
      border-color: rgba(244,247,251,.24);
      background: transparent;
    }
    .intro-music-toggle mat-icon { width: 18px; height: 18px; font-size: 18px; }
    @media (hover: hover) and (pointer: fine) {
      .intro-music-toggle:hover { background: rgba(108,192,199,.18); }
    }
    @keyframes case-intro-fade { from { opacity: 0; } }
    @keyframes case-intro-rise { from { opacity: 0; transform: translateY(var(--ds-space-3)); } }
    /* Con movimiento reducido solo el fundido: nada se desplaza. */
    @media (prefers-reduced-motion: reduce) { .case-intro-card { animation-name: case-intro-fade; } }
    .case-intro-card--scene { width: min(860px, 100%); max-height: min(88vh, 760px); }
    .case-intro-card__media {
      min-height: 0;
      /* En pantallas bajas el escenario no cabe: recortado, nunca por encima del pie, donde están «Salida segura» y «Continuar». */
      overflow: hidden;
      display: grid;
      /* Sin esto la pista «auto» crece al ancho del escenario (384 px) y en móvil no se recorta. */
      grid-template-columns: minmax(0, 1fr);
      place-items: center;
      padding: 12px clamp(14px, 3vw, 24px);
      background: #05080e;
    }
    .case-intro-card__body {
      min-height: 0;
      overflow-y: auto;
      padding: 20px clamp(18px, 4vw, 34px);
      scrollbar-color: rgba(182,156,255,.45) rgba(255,255,255,.06);
    }
    .case-intro-card__body:focus-visible {
      outline: 2px solid rgba(108,192,199,.75);
      outline-offset: -4px;
    }
    .case-intro-card__body p {
      margin: 0 0 14px;
      color: rgba(244,247,251,.84);
      font-size: clamp(.92rem, 2vw, 1rem);
      line-height: 1.7;
    }
    .case-intro-card__body p:last-child { margin-bottom: 0; color: #f3dfb5; }
    .case-intro-card__actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px clamp(18px, 4vw, 32px);
      border-top: 1px solid rgba(182,156,255,.18);
      background: rgba(5,8,14,.62);
    }
    .case-intro-card__actions > span {
      color: rgba(244,247,251,.58);
      font-size: .78rem;
      line-height: 1.4;
    }
    .case-intro-card__actions .psy-button {
      flex-shrink: 0;
      min-width: 140px;
    }
    /* «Salida segura» a la izquierda de «Continuar»: nunca se queda atrás cuando el texto de apoyo crece. */
    .case-intro-card__buttons {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    /* ── Overlays ────────────────────────────────────────────────────────── */
    .dialogue-cinematic { position: absolute; bottom: 0; left: 0; right: 0; z-index: 60; }
    .overlay-backdrop {
      position: absolute; inset: 0; z-index: 95;
      background: rgba(8,12,18,.62);
      backdrop-filter: blur(3px);
      animation: fade-in 180ms ease both;
    }
    .scene-fade {
      position: fixed; inset: 0; z-index: 200; background: #0a0f14; opacity: 0;
      pointer-events: none; transition: opacity 320ms ease;
    }
    .scene-fade--active { opacity: 1; pointer-events: auto; }
    /* Arranque y fallo (F6-1): ocupan SOLO la zona del mundo (fila 2 de la rejilla). La cabecera y el pie —con
       «Salida segura»— quedan a la vista y operables mientras carga o falla (REGLA-004). */
    .game-boot, .game-failure {
      grid-area: 2 / 1; z-index: 300;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: var(--ds-space-3); padding: var(--ds-space-5);
      background: var(--ds-surface-page); color: var(--ds-text-1); text-align: center;
    }
    .game-boot p { margin: 0; color: var(--ds-text-2); font-size: .95rem; }
    .game-failure ui-error-state { max-inline-size: 28rem; }
    /* Aviso no esencial («Obtuviste: …»): quieto, sin animación, sobre el pie. */
    .soft-notice {
      position: absolute; bottom: 84px; left: 50%; transform: translateX(-50%); z-index: 310;
      max-width: min(92vw, 520px); padding: 9px 16px; border-radius: 12px;
      background: rgba(18,24,42,.96); border: 1px solid rgba(182,156,255,.45);
      color: #f4f7fb; font-size: .86rem; font-weight: 700; line-height: 1.35; text-align: center;
      pointer-events: none;
    }
    .pausing-notice {
      position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 420;
      display: flex; align-items: center; gap: 8px;
      width: max-content; max-width: min(92vw, 520px);
      padding: 8px 16px; border-radius: 18px;
      background: rgba(24,30,46,.96); border: 1px solid rgba(241,167,159,.5);
      color: #f1a79f; font-size: .85rem; font-weight: 800; letter-spacing: .02em;
    }
    .pausing-notice mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .room-banner {
      position: absolute; top: 96px; left: 50%; transform: translateX(-50%); z-index: 320;
      padding: 10px 22px; border-radius: 999px;
      background: rgba(18,24,42,.9); border: 1px solid var(--sim-border);
      color: var(--sim-ink); font-weight: 800; letter-spacing: .04em;
      animation: room-banner-in 260ms ease;
      pointer-events: none;
    }
    @keyframes room-banner-in { from { opacity: 0; transform: translate(-50%, -8px); } }
    .transition-note {
      position: fixed; inset: 0; z-index: 340; display: grid; place-items: center;
      background: rgba(6,9,16,.92); pointer-events: none;
      animation: transition-note-in 420ms ease;
    }
    .transition-note p {
      max-width: min(88vw, 640px); margin: 0; padding: 0 24px; text-align: center;
      color: #f4f7fb; font-size: clamp(1.05rem, 2.4vw, 1.45rem); font-weight: 600;
      line-height: 1.6; letter-spacing: .02em; font-style: italic;
    }
    @keyframes transition-note-in { from { opacity: 0; } }
    /* «Reanudar» es la misma entrada que las otras tres (F6-2): por encima de ellas y sin el CSS propio que tenía. */
    .case-intro-overlay--resume { z-index: 400; }
    .case-intro-card--entry { width: min(560px, 100%); }
    .case-intro-card__metrics { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .case-intro-card__metrics span {
      padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.08); font-size: .82rem; font-weight: 700;
    }
    /* ETH-01: el almacenamiento falló y el consentimiento NO está registrado; el aviso previo sigue (sin mundo). */
    .consent-error {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px 10px;
      margin-top: 14px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid rgba(226,90,79,.5); background: rgba(226,90,79,.1);
    }
    .consent-error mat-icon { color: #f1a79f; }
    .consent-error p { margin: 0; color: #f4f7fb; font-size: .9rem; line-height: 1.5; }
    .consent-error button { grid-column: 2; justify-self: start; }

    @keyframes panel-in {
      from { opacity: 0; transform: translateX(14px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ── Mobile: panel derecho como bottom sheet, dock scrolleable ───────── */
    @media (max-width: 760px) {
      .main-zone { padding: 8px 8px 0; }
      .game-container[data-mode='dialogue-right'] .main-zone {
        grid-template-columns: minmax(0, 1fr);
      }
      .right-panel {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        max-height: 62vh;
        z-index: 80;
        border-radius: 18px 18px 0 0;
        animation: sheet-up 200ms cubic-bezier(.2,.8,.2,1) both;
      }
      .objective-card {
        left: 8px;
        right: 8px;
        width: auto;
        padding: 7px 10px;
      }
      /* En vertical el pie tiene dos filas de altura fija (salida y herramientas; mensaje): tampoco crece. */
      .bottom-zone { flex-wrap: wrap; height: auto; padding: 6px 8px 8px; }
      /* El dock cede ancho (flex-basis 0) y scrollea por dentro: nunca debe
         empujar el ancho de la página. */
      .tool-dock { flex: 1 1 0; }
      .context-bar { justify-content: center; flex-basis: 100%; order: 3; height: 44px; }
      .context-bar__idle { text-align: center; }
      .case-intro-overlay { padding: 10px; }
      .case-intro-card { max-height: 90vh; border-radius: 14px; }
      .case-intro-card__actions {
        display: grid;
        justify-items: stretch;
      }
      .case-intro-card__actions .psy-button { width: 100%; }
      /* El principal arriba y «Salida segura» debajo, cada uno en su fila. */
      .case-intro-card__buttons { flex-direction: column-reverse; align-items: stretch; }
    }
    @keyframes sheet-up {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    /* ── Modo compacto (F§7.9): pantallas bajas o táctil horizontal ───────────
       Va después del bloque móvil: un móvil horizontal de 667x375 cumple los dos y manda este. */
    @media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {
      /* Pie de altura fija de una sola fila: sin teclas ni leyenda, y el mundo no cambia de tamaño al acercarte a algo. */
      .bottom-zone { flex-wrap: nowrap; align-items: center; height: 56px; padding: 4px 12px; gap: 8px; }
      .context-bar__hint { display: none; }
      /* Las cinco herramientas conservan su sitio; la barra cede (elipsis) cuando el motivo de una puerta es largo. */
      .tool-dock { flex: 0 0 auto; }
      .context-bar { flex: 1 1 0; order: 0; height: 100%; justify-content: flex-end; }
      .context-bar__interaction { min-height: 44px; padding: 3px 10px; }
      /* El secundario pierde el prefijo visible («También:») para que quepa el verbo; su nombre accesible lo conserva. */
      .context-bar__interaction--secondary { flex-basis: 30%; min-width: 110px; }
      .context-bar__also { display: none; }
      .context-bar__idle { text-align: left; }
      .context-bar__now { font-size: .78rem; line-height: 1.25; }
      /* Avisos por encima del pie más bajo, sin tapar la mitad del mundo. */
      .soft-notice { bottom: 62px; max-width: min(86vw, 460px); padding: 7px 14px; font-size: .8rem; }
      .room-banner { top: 56px; padding: 7px 18px; font-size: .85rem; }
      .pausing-notice { bottom: 8px; }

      /* Desplegada, la tarjeta deja libre la cruz de movimiento (abajo a la izquierda) y se sostiene a la derecha de ella.
         Plegada (chip) sigue en la esquina. */
      .objective-card:not(:has(app-scene-checklist-card[data-collapsed='true'])) {
        left: 176px; right: auto; width: min(640px, calc(100% - 190px));
        flex-direction: row; align-items: flex-start; gap: 10px;
        /* Sin el tope del escritorio: la tarjeta ya es ancha y baja, y la lista cabe con su paso siguiente. */
        max-height: calc(100% - 20px);
      }
      .objective-card:not(:has(app-scene-checklist-card[data-collapsed='true'])) .objective-card__scroll {
        flex: 1 1 0; min-width: 0;
      }
      /* La franja ética se compacta sin bajar de 12 px: el mundo pierde lo mínimo. */
      .sensitive-strip { padding: 3px 12px; font-size: .75rem; line-height: 1.3; }

      /* Decisión: hoja inferior flotante. El mundo conserva su tamaño (una sola columna) y el resumen de la etapa
         se oculta: las opciones 1 a 3 tienen que verse y tocarse sin desplazar (TOUCH-01). */
      .game-container[data-mode='dialogue-right'] .main-zone { grid-template-columns: minmax(0, 1fr); }
      .right-panel {
        position: fixed; left: 0; right: 0; bottom: 0; top: auto;
        max-height: calc(100% - 52px);
        z-index: 80;
        grid-template-rows: minmax(0, 1fr);
        border-radius: 16px 16px 0 0;
        animation: sheet-up 200ms cubic-bezier(.2,.8,.2,1) both;
      }
      .game-container[data-mode='dialogue-right'] .right-panel__scene { display: none; }

      /* Introducción y contexto: cabecera en dos líneas, pie fijo con «Continuar» y «Salida segura»,
         y un degradado al pie del texto que avisa de que hay más debajo. */
      .case-intro-overlay { padding: 8px 12px; }
      .case-intro-card { max-height: 100%; border-radius: 14px; }
      .case-intro-card__header {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas: 'eyebrow extra' 'title extra';
        align-items: center;
        gap: 0 12px;
        padding: 8px 16px;
      }
      .case-intro-card__header .psy-eyebrow { grid-area: eyebrow; margin: 0; }
      .case-intro-card__header h2 { grid-area: title; font-size: 1.2rem; }
      .case-intro-card__header .case-intro-card__chip,
      .case-intro-card__header .intro-music-toggle { grid-area: extra; }
      .case-intro-card__header .case-intro-card__chip { padding: 3px 9px; font-size: .75rem; }
      .case-intro-card__header .intro-music-toggle { min-height: 44px; }
      .case-intro-card__media { padding: 4px 12px; }
      .case-intro-card__body { padding: 10px 16px 28px; }
      .case-intro-card__body p { margin-bottom: 8px; font-size: .86rem; line-height: 1.5; }
      .case-intro-card__actions { position: relative; }
      .case-intro-card__actions::before {
        content: ''; position: absolute; left: 0; right: 0; top: -26px; height: 26px; pointer-events: none;
        background: linear-gradient(180deg, rgba(18,24,42,0), rgba(5,8,14,.94));
      }
      .case-intro-card__actions { padding: 8px 16px; gap: 10px; }
      .case-intro-card__actions > span { font-size: .75rem; }
    }
    /* Interruptor «Movimiento reducido» del juego (Ajustes): apaga también las animaciones y transiciones CSS de la pantalla y
       de todos sus componentes (sheet-up, panel-in, choice-in, door-notice-in, tool-pop, fade-in…), igual que la regla global de
       prefers-reduced-motion (styles.scss). Antes solo valía el ajuste del sistema. */
    .game-container--reduce-motion,
    .game-container--reduce-motion ::ng-deep *,
    .game-container--reduce-motion ::ng-deep *::before,
    .game-container--reduce-motion ::ng-deep *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 1ms !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .scene-fade { transition: none; }
      .right-panel, .overlay-backdrop { animation: none; }
      .room-banner, .transition-note { animation: none; }
    }
  `]
})
export class SimulationPlayComponent implements OnInit, OnDestroy {
  private readonly simulationService = inject(SimulationService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly audioDirector = inject(AudioDirectorService);
  /** Las dos regiones vivas persistentes de la app: el juego no trae una propia (F6-12). */
  private readonly liveAnnouncer = inject(LiveRegionAnnouncer);
  private readonly notifications = inject(NotificationService);
  private readonly consentRecorder = inject(CONSENT_RECORDER);
  private readonly dialog = inject(UiDialog);

  @ViewChild('gameWorld')    private gameWorld?: GameWorldComponent;
  @ViewChild('journalPanel') private journalPanel?: JournalPanelComponent;

  readonly attempt    = signal<SimulationAttemptState | null>(null);
  readonly pendingActiveAttempt = signal<SimulationAttemptState | null>(null);
  readonly showResumePrompt = signal(false);
  readonly progressMap = signal<ProgressMapState | null>(null);
  readonly world      = signal<SimulationWorldState | null>(null);
  readonly scenarioConfig = signal<ScenarioConfig | null>(null);
  readonly loading    = signal(true);
  readonly busy       = signal(false);
  readonly error      = signal('');
  readonly journalMessage      = signal('');
  readonly journalSaveState    = signal<JournalSaveState>('idle');
  readonly nearbyInteraction   = signal<MapObjectState | null>(null);
  private readonly pendingRestrictedInteraction = signal<MapObjectState | null>(null);
  readonly selectedInteraction = signal<MapObjectState | null>(null);
  readonly dialogue    = signal<DialogueState | null>(null);
  readonly stressPulse = signal(false);
  readonly journalOpen  = signal(false);
  /** «Ir a…» (F6-11): la lista de personas y puertas de la sala abierta y lo que ofrece. */
  readonly placesOpen   = signal(false);
  readonly placeOptions = signal<readonly PlaceCandidate[]>([]);
  private readonly injector = inject(Injector);
  /** «Atajos de una tecla» (F6-10, WCAG 2.1.4): J, E, WASD, números del diálogo y A/D/E del lobby; apagables. */
  readonly shortcuts = inject(ShortcutSettings);
  readonly fadeActive   = signal(false);
  /** Avisos del sistema visibles (el anfitrión `ui-toast-host` los pinta y anuncia). */
  private readonly systemNotices = toSignal(this.notifications.messages$, { initialValue: [] });
  /** Ids de los avisos accionables que este juego emitió: son suyos, y los retira cuando dejan de valer (VD-29). */
  private readonly doorNoticeId = signal<number | null>(null);
  private readonly actionErrorId = signal<number | null>(null);
  /**
   * Puerta bloqueada (NO abre DialoguePanel). Es accionable —dice qué hacer—: aviso de advertencia del sistema que
   * permanece hasta cerrarse con «Cerrar» o hasta cambiar de sala, pausar o empezar un intento (VD-29, WCAG 2.2.1).
   * '' cuando no hay (o la persona ya lo cerró).
   */
  readonly doorNotice = computed(() => this.noticeText(this.doorNoticeId()));
  /**
   * Error de una acción: aviso de error del sistema que permanece hasta cerrarse, hasta que otro error lo reemplace
   * o hasta que salga una petición nueva (VD-29). El anfitrión lo anuncia en assertive.
   */
  readonly actionError = computed(() => this.noticeText(this.actionErrorId()));
  /** Aviso no esencial de 4,2 s («Obtuviste: …»). La lista «Qué hacer» conserva lo que dice. */
  readonly softNotice   = signal('');
  /** Nombre de la sala al entrar (1-2 s). */
  readonly roomBanner   = signal('');
  /** Salto temporal / texto de transición autorado (map.ambient.transitionText). */
  readonly transitionNote = signal('');
  /** Advertencia de contenido: ETH-01 — precede a la escena, la narrativa y el gameplay. */
  readonly showContentWarning = signal(false);
  /** Registro del consentimiento (ETH-01): `saving` mientras guarda; `error` si el almacenamiento falló. */
  readonly consentState = signal<'idle' | 'saving' | 'error'>('idle');
  readonly consentErrorText: string = DRAFT_COPY.consentStorageError.text;
  /** El mundo/HUD/audio solo existen tras el consentimiento (ETH-01). */
  readonly worldStarted = signal(false);
  /** Código HTTP del fallo que pinta el estado de error (null si no vino de una respuesta HTTP). */
  readonly errorStatus = signal<number | null>(null);
  /** Lo que «Reintentar» vuelve a pedir; null cuando no hay nada que reintentar (p. ej. un caso que no existe). */
  private readonly retryAction = signal<(() => void) | null>(null);
  readonly canRetry = computed(() => this.retryAction() !== null);
  readonly errorKind = computed<UiErrorKind>(() => {
    const status = this.errorStatus();
    if (status === 0) return 'network';
    if (status === 401 || status === 403) return 'forbidden';
    if (status === 404 || !this.canRetry()) return 'not-found';
    return 'server';
  });
  /** El mundo pintó su primer cuadro (`GameWorldComponent.worldReady`): hasta entonces hay UN indicador de carga. */
  readonly worldRendered = signal(false);
  /** El error que se muestra es el del arranque del lienzo (plazo vencido): un primer cuadro tardío lo retira. */
  private bootFailureShown = false;
  /** Hay arranque en curso: el intento o el mundo se piden, o el mundo pedido todavía no pintó su primer cuadro. */
  readonly bootLoading = computed(() => !this.error() && (this.loading() || (this.worldStarted() && !this.worldRendered())));
  /** Una sola etiqueta para las dos fases: el mismo indicador cambia de texto, no se apila otro. */
  readonly bootLabel = computed(() => (this.worldStarted() && this.attempt() ? 'Preparando la escena…' : 'Cargando el caso…'));
  private readonly bootPhase = loadingPhase(this.bootLoading);
  /** Visible a los 150 ms (una respuesta rápida no parpadea) y al menos 300 ms (una lenta no destella). */
  readonly bootVisible = computed(() => this.bootPhase() === 'skeleton');
  /** «Salida segura» del pie está a la vista: el error no repite la salida con un segundo botón. */
  readonly footerExit = computed(() => this.worldStarted() && this.attempt()?.status === 'IN_PROGRESS');
  readonly showIntroScene = signal(false);
  readonly showCaseIntro = signal(false);
  /** Pantalla «Cómo se juega»: no modal; Esc la cierra antes que cualquier otra cosa (F§7.8). */
  readonly helpOpen = signal(false);
  /** La tarjeta de primera vez ya se vio en este navegador (`siep.ayuda.v1`). La lectura no es reactiva: se actualiza a mano. */
  readonly helpCardSeen = signal(readHelpSeen().has(HELP_FIRST_CARD));
  /** Las ayudas prometen «Salida segura» (y Esc) solo mientras es verdad en todos los estados jugables. */
  readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;
  /**
   * Hay una salida segura pedida desde una superposición: en cola mientras `busy()` o ya en vuelo.
   * El pie la muestra como «Pausando…»; impide que dos toques pausen dos veces (F§7.8).
   */
  readonly pausing = signal(false);
  /** La pausa en cola pasó su plazo (F2): se envía aunque la acción en curso no haya terminado, y el aviso lo dice. */
  readonly pausingSlow = signal(false);
  readonly slowPauseNotice = QUEUED_PAUSE_SLOW_NOTICE;
  /**
   * Cada incremento le dice al panel de diálogo que suelte la opción que tenía marcada como
   * elegida (DLG-01): tras un rechazo o un error sus opciones vuelven a poder activarse.
   */
  readonly dialogueReleaseToken = signal(0);
  /**
   * DLG-05 acotado a la última decisión (sin la decisión en dos tiempos, T9.12): al decidir por última vez el
   * intento ya figura como COMPLETED, pero la «Supervisión clínica» se lee primero sobre la escena y el
   * resultado se abre al cerrarla. Es solo la intención de retener; lo que manda es `holdingOutcome`.
   */
  private readonly supervisionHold = signal(false);
  /**
   * El resultado espera a que se cierre la supervisión de la última decisión. Solo mientras la supervisión esté
   * a la vista y el intento esté COMPLETED (nunca con una pausa, REGLA-004): si el diálogo desaparece por
   * cualquier camino, el resultado se abre igual.
   */
  readonly holdingOutcome = computed(() =>
    this.supervisionHold() && this.dialogue() !== null && this.attempt()?.status === 'COMPLETED');
  readonly caseIntroTitle = CASE_INTRO_TITLE;
  readonly caseIntroParagraphs = CASE_INTRO_PARAGRAPHS;
  readonly musicMuted = signal(false);
  readonly sfxMuted = signal(false);
  readonly reduceMotion = signal(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  private readonly seenTransitionMapKeys = new Set<string>();

  /** Estado reactivo de la paciente (Fase 8) — alimenta HUD y tint/shake del NPC. */
  readonly patientState = signal<PatientState>(PATIENT_INITIAL_STATE);
  private interventionRules: InterventionRuleSet = DEFAULT_INTERVENTION_RULES;
  /** NPCs de ScenarioConfig hablados en esta sesión (evidencia frontend, Fase 9). */
  protected readonly viewedNpcKeys = signal<ReadonlySet<string>>(new Set<string>());
  private pendingEvidenceDecisionId: number | null = null;
  private pendingEvidenceMissing: string[] = [];

  /** Estado de vista del gameplay — gobierna el layout vía [attr.data-mode]. */
  readonly viewMode = computed<SimulationViewMode>(() => resolveViewMode({
    status: this.attempt()?.status ?? null,
    journalOpen: this.journalOpen(),
    dialogue: this.dialogue(),
    holdOutcome: this.holdingOutcome(),
  }));

  /** Salas del caso ya alcanzadas en este intento (refuerzo de la regla monótona de la lista; sessionStorage). */
  readonly visitedRooms = signal<ReadonlySet<RoomGroup>>(new Set<RoomGroup>());
  /** Modo compacto: pantallas bajas o táctil horizontal. Tarjeta plegada, pie sin teclas, panel flotante. */
  readonly compactMode = signal(matchesMedia(COMPACT_QUERY));
  readonly narrowScreen = signal(matchesMedia(NARROW_QUERY));
  /** La tarjeta «Qué hacer» arranca plegada a su chip en compacto y en móvil vertical: no tapa el mundo. */
  readonly cardFolded = computed(() => this.compactMode() || this.narrowScreen());
  /**
   * Aviso ético de un nodo sensible («Este caso aborda…», `warningMessage` del nodo): franja fija bajo la cabecera,
   * visible en todos los dispositivos mientras dure el nodo, plegada o no la tarjeta «Qué hacer». No cambia su redacción.
   */
  readonly sensitiveNotice = computed<string | null>(() => {
    const node = this.attempt()?.currentNode;
    if (!node) return null;
    if (node.warningMessage) return node.warningMessage;
    return node.safeExitRequired
      ? 'Este momento permite salida segura: prioriza confidencialidad y rutas institucionales.'
      : null;
  });
  /** Texto de la región viva de la tarjeta («Anotado: …», «Decisión k registrada»). */
  readonly checklistNotice = signal<string | null>(null);

  /** Lista «Qué hacer»: solo se recalcula cuando cambian el intento, el mundo, las personas habladas, las salas o el escenario. */
  readonly sceneLog = computed<SceneLogState | null>(() => {
    const input = sceneLogInputFrom({
      attempt: this.attempt(),
      world: this.world(),
      viewedNpcKeys: this.viewedNpcKeys(),
      visitedRooms: this.visitedRooms(),
      scenarioNpcs: this.scenarioConfig()?.rooms.flatMap(room => room.npcs) ?? [],
    });
    if (!input) return null;
    try {
      return deriveSceneLog(input);
    } catch {
      // La guía es ayuda, no el juego: un mundo con una forma inesperada (payload antiguo) no debe tumbar la pantalla.
      return null;
    }
  });

  /** Contador único del caso («Decisión k de 6»); con un nodo sin etapa, el de respaldo por escenarios. */
  readonly stageLabel = computed<string | null>(() => {
    const key = this.attempt()?.currentNode.key;
    return getDecisionCounter(key) ?? this.fallbackStageLabel();
  });
  readonly sceneGuide = computed(() => {
    const guide = getSceneGuide(this.attempt()?.currentNode.key);
    const world = this.world();
    if (!guide || !world?.objects.some(object => object.key === guide.targetKey)) return null;
    return guide;
  });

  /**
   * Un velo a pantalla completa (fundido de escena, nota de transición) cubre el pie: mientras dure, el pie sube por
   * encima para que «Salida segura» siga a la vista (REGLA-004). Con una superposición abierta el pie queda inerte y
   * la superposición trae su propio botón, así que no sube.
   */
  readonly footerAboveVeils = computed(() =>
    (this.fadeActive() || this.transitionNote() !== '') && !this.inputBlocked());

  /** El mundo se congela con diálogo, journal u outcome abiertos (Fase 5/13). */
  readonly inputBlocked = computed(() =>
    this.showResumePrompt() || this.showContentWarning() || this.showIntroScene()
    || this.showCaseIntro() || this.dialogue() !== null || this.journalOpen() || this.placesOpen()
    || (this.attempt()?.status ?? 'IN_PROGRESS') !== 'IN_PROGRESS');

  /** Con la pantalla de ayuda abierta el personaje no camina mientras se lee. */
  readonly worldMotionPaused = computed(() => this.inputBlocked() || this.helpOpen());

  readonly contextualInteraction = computed(() => {
    const game = this.attempt();
    const interaction = this.nearbyInteraction();
    return game?.status === 'IN_PROGRESS' && !this.inputBlocked() && !this.busy()
      ? interaction
      : null;
  });

  /** Estado de cada puerta de la sala (clave → abierta/bloqueada): el mundo la rotula con candado. Misma fuente que la barra y `tryOpenDoor`. */
  readonly doorStates = computed<Record<string, 'open' | 'locked'>>(() => {
    const context = this.doorContext();
    return context ? doorStateMap(context.world.objects ?? [], context) : {};
  });

  /** Candidato secundario en rango (otra persona u objeto): el botón secundario de la barra. */
  readonly nearbyAlso = signal<MapObjectState | null>(null);
  /** Puntero grueso (táctil): el texto de la barra no promete teclas. */
  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));
  /** «No hay nada a tu alcance…» durante 2,5 s tras pedir interactuar sin nada cerca; estático y sin sonido. */
  readonly nothingNearbyNote = signal('');

  /** Botón principal de la barra: verbo por tipo, candado y motivo en puertas bloqueadas (F§4.3). */
  readonly contextAction = computed(() => this.interactionAction(this.contextualInteraction()));
  readonly contextAlso = computed(() => this.contextualInteraction() ? this.interactionAction(this.nearbyAlso()) : null);
  /** Lo único que la barra de contexto anuncia (H-10): la interacción cercana. Comparado por valor: no repite. */
  private readonly contextLabel = computed(() => this.contextAction()?.ariaLabel ?? null);

  readonly helpModality = computed<'keyboard' | 'touch'>(() => this.coarsePointer() ? 'touch' : 'keyboard');

  /**
   * Tarjeta de primera vez: tras el aviso de contenido, la introducción y el contexto; nunca con un
   * diálogo, la bitácora o la ayuda completa abiertos, ni con un intento que no está en curso.
   */
  readonly showHelpCard = computed(() =>
    !this.helpCardSeen() && this.worldStarted() && this.world() !== null && !this.loading()
    && (this.attempt()?.status ?? null) === 'IN_PROGRESS'
    && !this.showResumePrompt() && !this.showContentWarning() && !this.showIntroScene() && !this.showCaseIntro()
    && this.dialogue() === null && !this.journalOpen() && !this.helpOpen());

  /** Línea «Ahora: …» de la barra cuando no hay nada cerca; sin lista, la invitación a explorar. */
  readonly nowLine = computed(() =>
    this.nothingNearbyNote()
    || this.sceneLog()?.nextLine
    || (this.coarsePointer() ? ORIENTATION_COPY.now.noListTouch : ORIENTATION_COPY.now.noList));

  /** Destino de la lista: el mundo le pone el anillo (si está en otra sala, el de la puerta que hay que tomar). */
  readonly nextTargetKey = computed(() => ringTargetKey(this.sceneLog(), HIGHLIGHT_TOOL_TARGETS));

  /** Objetos de decisión de otras etapas: el mundo los atenúa (alfa .55, sin anillo). Nunca marca la opción adecuada. */
  readonly dimmedKeys = computed<ReadonlySet<string>>(() =>
    otherStageDecisionKeys(this.world(), this.attempt()?.currentNode.options?.map(option => option.id) ?? null));

  readonly selectedToolCode = computed(() => {
    const sel = this.selectedInteraction();
    return sel?.type === 'TOOL' ? sel.toolCode : null;
  });

  private lastPosition: { x: number; y: number } | null = null;
  private lastSyncedPosition: { x: number; y: number } | null = null;
  private positionSaveHandle: number | null = null;
  /**
   * Histéresis también para la interacción contextual (clic/E). Al entrar o
   * recargar junto a una puerta de retorno, exige alejarse antes de permitir
   * volver a cruzarla; evita que un evento residual rebote a la sala anterior.
   */
  private doorInteractionArmed = false;
  private readonly doorInteractionRearmDistance = 72;

  /** Lista anterior: `diffDone` compara contra ella para anotar solo los pasos recién hechos. */
  private previousSceneLog: SceneLogState | null = null;
  /** Notas «Anotado: …» a la espera de que no haya un diálogo abierto (el servidor marca «hablado» al abrir). */
  private readonly pendingNotes: string[] = [];
  private noteTimer: number | null = null;
  private noteShownAt = 0;
  private softNoticeTimer: number | null = null;
  private nothingNearbyTimer: number | null = null;
  private helpCardShown = false;
  private roomBannerTimer: number | null = null;
  private transitionNoteTimer: number | null = null;
  private pauseDeadlineTimer: number | null = null;
  /** Retiro del fundido tras cargar el mundo: si el componente se destruye antes, no debe dispararse. */
  private worldRevealTimer: number | null = null;
  /** La petición de salida segura ya salió: ni la cola ni el plazo la repiten. */
  private pauseSent = false;
  /** Tras pausar se recarga el mundo (dos GET encadenados) y `busy()` sigue activo hasta que termina. */
  private worldReloadPending = false;
  /** «Reanudar» pulsado durante esa recarga: se ejecuta al terminar en vez de descartarse en silencio. */
  private resumeQueued = false;
  private stopCompactWatch: (() => void) | null = null;
  /** Cambio de etapa tras decidir: lo recoge `applyLoadedWorld` cuando ya está la sala nueva. */
  private pendingStage: { title: string; previousNumber: number | null } | null = null;

  constructor() {
    // La salida segura pedida durante una petición espera a que `busy()` se suelte: no se fuerza
    // una pausa en medio de una decisión o de un cruce de puerta (F§7.8, H-04).
    effect(() => {
      if (!this.pausing() || this.busy()) return;
      untracked(() => this.startQueuedPause());
    });
    // La supervisión de la última decisión dejó de estar a la vista (se cerró, «Salida segura», Esc o cualquier
    // otro camino): el resultado ya se ve y es el momento de su sonido y su foco.
    effect(() => {
      if (!this.supervisionHold() || this.holdingOutcome()) return;
      untracked(() => this.releaseHeldOutcome());
    });
    // Pasos recién hechos → notas «Anotado: …». Se evalúa solo cuando cambia la lista (F§7.1).
    effect(() => {
      const next = this.sceneLog();
      untracked(() => this.queueNotesFor(next));
    });
    // El panel lateral encoge (o devuelve) el mundo: se vuelve a leer el contenedor cuando el diseño ya cambió.
    effect(() => {
      this.viewMode();
      untracked(() => { window.setTimeout(() => this.refreshWorldScale()); });
    });
    // La tarjeta de primera vez que ya estuvo a la vista y cede ante un diálogo o la bitácora se da por vista:
    // no vuelve a aparecer cada vez que se cierra una conversación.
    effect(() => {
      const visible = this.showHelpCard();
      const covered = this.dialogue() !== null || this.journalOpen();
      untracked(() => {
        if (visible) this.helpCardShown = true;
        else if (this.helpCardShown && covered) this.markHelpCardSeen();
      });
    });
    // Las notas encoladas salen cuando ya no hay diálogo, bitácora ni pantalla bloqueando la escena.
    effect(() => {
      this.inputBlocked();
      untracked(() => this.flushNotes());
    });
    // La barra de contexto anuncia SOLO la interacción cercana (H-10): al volver al reposo no se lee la línea
    // «Ahora: …» ni la pista de teclas.
    effect(() => {
      const label = this.contextLabel();
      untracked(() => { if (label) this.announce(label); });
    });
    // Sale una petición nueva: el error anterior ya no describe lo que está pasando (VD-29).
    effect(() => {
      if (this.busy()) untracked(() => this.dismissActionError());
    });
    // Interacción → respuesta (RNF-05): la respuesta es el diálogo que aparece, así que la medida termina en el pintado
    // que lo muestra, con la red incluida. Sin una interacción en curso no mide nada (otros diálogos no cuentan).
    effect(() => {
      if (this.dialogue()) untracked(() => perfEndNextPaint('interaction-to-response'));
    });
  }

  ngOnDestroy(): void {
    this.stopCompactWatch?.();
    // Los avisos accionables son del sistema y viven en un anfitrión global: no se quedan en el resto de la app.
    this.dismissDoorNotice();
    this.dismissActionError();
    for (const timer of [this.noteTimer, this.softNoticeTimer, this.roomBannerTimer, this.nothingNearbyTimer, this.pauseDeadlineTimer, this.transitionNoteTimer, this.worldRevealTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    this.audioDirector.stopIntroLament();
    this.audioDirector.dispose();
  }

  ngOnInit() {
    const stopCompact = watchMedia(COMPACT_QUERY, matches => this.compactMode.set(matches));
    const stopCoarse = watchMedia(COARSE_POINTER_QUERY, matches => this.coarsePointer.set(matches));
    const stopNarrow = watchMedia(NARROW_QUERY, matches => this.narrowScreen.set(matches));
    this.stopCompactWatch = () => { stopCompact(); stopCoarse(); stopNarrow(); };
    this.simulationService.getInterventionRules().subscribe({
      next: raw => { this.interventionRules = parseInterventionRules(raw); },
      error: () => { this.interventionRules = DEFAULT_INTERVENTION_RULES; },
    });
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) { this.fail('Caso no encontrado.', null, null); return; }

    this.simulationService.getActiveAttempt(id).subscribe({
      next: active => {
        if (active && (active.status === 'IN_PROGRESS' || active.status === 'PAUSED')) {
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
    if (active.status === 'PAUSED') {
      // Pausa reanudable real (ETH-02 A): transición explícita en backend,
      // mismo attemptId; el consentimiento se vuelve a pedir en bootstrap.
      this.simulationService.resumeAttempt(active.attemptId, active.attemptToken).subscribe({
        next: attempt => this.bootstrapAttempt(attempt),
        error: cause => this.fail('No pudimos reanudar el intento.', cause, () => this.resumeAttempt()),
      });
      return;
    }
    this.bootstrapAttempt(active);
  }

  /**
   * Un fallo de arranque nunca se traga (F6-1): se pinta con su mensaje y código HTTP y, si hay algo que reintentar,
   * «Reintentar» vuelve a pedir LO QUE FALLÓ (el intento, la reanudación o el mundo), no la página entera.
   */
  private fail(message: string, cause: unknown, retry: (() => void) | null): void {
    this.errorStatus.set(cause instanceof HttpErrorResponse ? cause.status : null);
    this.retryAction.set(retry);
    this.error.set(message);
    this.loading.set(false);
  }

  retryFromError(): void {
    const retry = this.retryAction();
    if (!retry) return;
    this.error.set('');
    this.errorStatus.set(null);
    this.retryAction.set(null);
    this.loading.set(true);
    retry();
  }

  /** Primer cuadro del mundo pintado: el indicador de arranque se retira (no vuelve con cada cambio de sala). */
  onWorldReady(): void {
    perfEnd('decision-to-scene');
    this.worldRendered.set(true);
    // El mundo pintó después de que el plazo venciera: el error de ese arranque ya no es verdad y taparía el juego.
    if (this.bootFailureShown && this.error()) {
      this.error.set('');
      this.errorStatus.set(null);
      this.retryAction.set(null);
    }
    this.bootFailureShown = false;
  }

  /** Reanudación desde el overlay de pausa (outcome), con el mundo ya cargado. */
  resumeCurrentAttempt(): void {
    const current = this.attempt();
    if (!current || current.status !== 'PAUSED') return;
    if (this.busy()) {
      // La pausa recarga el mundo y la tarjeta «Reanudar» aparece antes de que termine: ese toque
      // no se pierde, queda encolado y se atiende al liberar `busy()` (ver `finishWorldReload`).
      if (this.worldReloadPending) this.resumeQueued = true;
      return;
    }
    this.busy.set(true);
    this.simulationService.resumeAttempt(current.attemptId, current.attemptToken).subscribe({
      next: attempt => {
        this.busy.set(false);
        this.attempt.set(attempt);
        // Un diálogo que llegó tarde mientras el intento estaba en pausa (la supervisión se abre
        // `SUPERVISION_DELAY_MS` después de la decisión) no debe reaparecer al reanudar.
        this.dialogue.set(null);
        this.audioDirector.setStressLevel(attempt.stressIndex);
        // Si se pausó desde la introducción sin haberla leído, reaparece (`resolveIntroStep` ya lo
        // decide); el consentimiento ya está dado en esta sesión y no se vuelve a pedir.
        const world = this.world();
        if (world) this.maybeShowInitialCaseIntro(world);
        this.announce('Intento reanudado. Continúas exactamente donde quedaste.');
      },
      error: () => { this.showActionError('No pudimos reanudar el intento.'); this.busy.set(false); },
    });
  }

  startNewAttempt() {
    const id = Number(this.route.snapshot.paramMap.get('caseVersionId'));
    if (!id) return;
    this.showResumePrompt.set(false);
    // Nada del intento anterior sobrevive: ni su diálogo o selección, ni la bitácora abierta, ni una
    // decisión que esperaba confirmación de evidencia (las opciones se repiten entre intentos).
    this.clearTransientOverlays();
    this.nearbyInteraction.set(null);
    this.endPausing();
    // Las salas y las notas pendientes eran del intento anterior.
    const previous = this.attempt() ?? this.pendingActiveAttempt();
    if (previous) clearVisitedRooms(previous.caseVersionId, previous.attemptId);
    this.visitedRooms.set(new Set<RoomGroup>());
    this.resetNotices();
    this.loading.set(true);
    this.beginAttempt(id, true);
  }

  private beginAttempt(caseVersionId: number, forceNew: boolean) {
    this.simulationService.startAttempt(caseVersionId, forceNew).subscribe({
      next: attempt => this.bootstrapAttempt(attempt),
      error: cause => this.fail(
        'No pudimos iniciar la simulación. Revisa tus permisos.', cause, () => this.beginAttempt(caseVersionId, forceNew),
      ),
    });
  }

  private bootstrapAttempt(attempt: SimulationAttemptState) {
    this.attempt.set(attempt);
    this.persistAttemptToken(attempt);
    // ETH-01: sin consentimiento no se inicializa audio, ni se pide el mundo,
    // ni se monta el HUD. Solo queda en pantalla la advertencia.
    if (attempt.status === 'IN_PROGRESS' && !this.hasContentConsent(attempt)) {
      this.worldStarted.set(false);
      this.loading.set(false);
      this.showContentWarning.set(true);
      return;
    }
    this.startWorld(attempt);
  }

  private hasContentConsent(attempt: SimulationAttemptState): boolean {
    return this.consentRecorder.isGiven(this.caseConsentStorageKey(attempt));
  }

  /** Arranque real (post-consentimiento). Idempotente ante dobles llamadas. */
  private startWorld(attempt: SimulationAttemptState) {
    if (this.worldStarted()) return;
    this.worldStarted.set(true);
    // Un arranque nuevo (otro intento, otro consentimiento) muestra el indicador hasta SU primer cuadro.
    this.worldRendered.set(false);
    this.loading.set(true);
    this.audioDirector.init();
    this.musicMuted.set(this.audioDirector.isMusicMuted());
    this.sfxMuted.set(this.audioDirector.isSfxMuted());
    this.patientState.set(PATIENT_INITIAL_STATE);
    this.viewedNpcKeys.set(this.restoreViewedNpcKeys(attempt));
    this.visitedRooms.set(readVisitedRooms(attempt.caseVersionId, attempt.attemptId));
    this.pendingEvidenceDecisionId = null;
    this.loadProgressMap(attempt);
    this.loadWorld(attempt);
    this.audioDirector.setStressLevel(attempt.stressIndex);
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalInteraction(event: KeyboardEvent) {
    // Si otro handler ya consumió la tecla (p. ej. el panel de diálogo cierra
    // con Escape en document:keydown), no reinterpretarla aquí: sin esta
    // guarda, un solo Escape cerraba el diálogo Y disparaba la salida segura.
    if (event.defaultPrevented) return;
    // Un Esc mantenido (temblor, pulsación larga) no encadena acciones: sin esto, una sola pulsación cerraba la ayuda,
    // la bitácora y el diálogo y además pausaba el caso (~30 eventos por segundo). Solo cuenta el primer evento.
    if (event.key === 'Escape' && event.repeat) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    const editable = (event.target as HTMLElement | null)?.isContentEditable;

    if (this.showContentWarning()) {
      // El consentimiento exige activación explícita de sus botones (Tab +
      // Enter/click). Se traga Escape para que no caiga en la salida segura,
      // que mutaría el intento en backend sin decisión informada.
      if (event.key === 'Escape') event.preventDefault();
      return;
    }

    if (this.showIntroScene() || this.showCaseIntro()) {
      // REGLA-004: Esc pausa también aquí. Va antes del chequeo de botones porque el foco de las
      // tarjetas siempre está en uno (`cdkFocusInitial`) y, sin este orden, Esc nunca llegaría.
      if (event.key === 'Escape') {
        event.preventDefault();
        this.pauseFromOverlay();
        return;
      }
      // Los botones de las tarjetas (Continuar, Silenciar música) se activan solos.
      if (tag === 'BUTTON' || tag === 'A') {
        this.activateCardButtonIfCancelled(event);
        return;
      }
      if (this.showIntroScene() && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        this.continueFromIntroScene();
      } else if (this.showCaseIntro() && event.key === 'Enter') {
        event.preventDefault();
        this.continueFromCaseIntro();
      }
      return;
    }

    if (event.key === 'Escape') {
      // Cadena: «Ir a…» → ayuda → bitácora → diálogo → pausa. Con una petición en curso la pausa se encola.
      if (this.placesOpen())  { event.preventDefault(); this.closePlaces(); return; }
      if (this.helpOpen())    { event.preventDefault(); this.helpOpen.set(false); return; }
      if (this.journalOpen()) { event.preventDefault(); this.journalOpen.set(false); return; }
      if (this.dialogue())    { event.preventDefault(); this.closeDialogue(); return; }
      if (this.attempt()?.status === 'IN_PROGRESS') { event.preventDefault(); this.pauseFromOverlay(); }
      return;
    }

    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
    // Enter/Espacio conservan la activación propia de botones y enlaces. Otros
    // atajos (J, E) siguen siendo globales aunque el foco permanezca un instante
    // en el botón que acaba de cerrar un overlay.
    if ((tag === 'BUTTON' || tag === 'A') && (event.key === 'Enter' || event.key === ' ')) return;

    if (this.inputBlocked()) {
      if (['e', 'E', 'j', 'J', ' ', 'Enter'].includes(event.key)) event.preventDefault();
      return;
    }

    // Con la pantalla de ayuda abierta E, J, Espacio y Enter no actúan sobre el mundo de debajo (Espacio sigue desplazando el texto).
    if (this.helpOpen() && ['e', 'E', 'j', 'J', ' ', 'Enter'].includes(event.key)) return;

    // Atajos de una letra (F6-10; WCAG 2.1.4): apagables, y solo actúan con el foco en el juego, en el cuerpo o en un
    // botón de la interfaz (nunca en un campo, una región con scroll ni un diálogo). Enter y Espacio no dependen del
    // ajuste. El destino de un keydown sintético puede ser el documento, que no es un elemento.
    const isLetterShortcut = event.key === 'j' || event.key === 'J' || event.key === 'e' || event.key === 'E';
    const focusTarget = event.target instanceof Element ? event.target : null;
    if (isLetterShortcut && (!this.shortcuts.enabled() || !isShortcutContext(focusTarget))) return;

    if (event.key === 'j' || event.key === 'J') {
      event.preventDefault();
      this.journalOpen.set(!this.journalOpen());
      return;
    }

    if (['e','E',' ','Enter'].includes(event.key)) {
      const nb = this.nearbyInteraction();
      if (!nb) return;
      event.preventDefault();
      // Mantener la tecla pulsada no repite la acción (al cerrar el diálogo volvería a abrirse).
      if (!event.repeat) this.openInteraction(nb);
    }
  }

  /**
   * Red de seguridad para los botones de las tarjetas (Continuar, Silenciar música). Phaser ya no
   * captura Enter ni Espacio (`addKeys(…, false)` y `disableGlobalCapture()`), así que la
   * activación nativa del botón funciona sola y aquí no se espera hacer nada. Solo actúa si
   * algo más en `window` cancela la tecla: se mira al terminar el despacho y, si quedó
   * cancelada, el botón se activa a mano; si no, no se hace nada (evita la doble activación).
   */
  private activateCardButtonIfCancelled(event: KeyboardEvent): void {
    const button = event.target as HTMLElement | null;
    if (button?.tagName !== 'BUTTON' || event.repeat) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    window.setTimeout(() => { if (event.defaultPrevented) button.click(); });
  }

  openInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS' || this.inputBlocked() || this.busy()) return;
    // La respuesta es el diálogo que se abre: la medida termina en el pintado que lo muestra (efecto del constructor).
    perfStart('interaction-to-response');

    // Una persona del escenario llega como `npc:{clave}`: no es un objeto del servidor (POST /interactions/npc:… da 404).
    if (interaction.key.startsWith('npc:')) {
      const npc = this.scenarioNpc(interaction.key);
      if (npc) this.openNpcDialogue(npc);
      return;
    }

    if (interaction.type === 'EXIT' && this.doorTargetNodeKey(interaction)) {
      // Cruzar una puerta no abre un diálogo: no es una «respuesta» y su medida no se arrastra a otro.
      perfCancel('interaction-to-response');
      this.tryOpenDoor(interaction);
      return;
    }

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
    if (key === 'frontend:cancel-evidence') {
      this.pendingEvidenceDecisionId = null;
      this.closeDialogue();
      return;
    }
    if (key.startsWith('frontend:proceed-evidence:')) {
      const id = Number(key.split(':')[2]);
      this.dialogue.set(null);
      if (Number.isFinite(id)) this.executeDecision(id);
      return;
    }
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

  /** Abre «Cómo se juega» (botón «?» del HUD, fila de Ajustes o «Más ayuda»). Quien la abre ya vio la tarjeta de primera vez. */
  openHelp(): void {
    this.markHelpCardSeen();
    this.helpOpen.set(true);
  }

  markHelpCardSeen(): void {
    markHelpSeen(HELP_FIRST_CARD);
    this.helpCardSeen.set(true);
    this.helpCardShown = false;
  }

  /** «Ver la ayuda otra vez» (Ajustes): borra la marca y la tarjeta de primera vez vuelve a mostrarse en esta sesión. */
  resetHelpCard(): void {
    resetHelpSeen();
    this.helpCardSeen.set(false);
  }

  /** El canvas recupera su tamaño al abrir o cerrar el panel lateral (AC-5): se relee el contenedor. */
  refreshWorldScale(): void {
    this.gameWorld?.refreshScale();
  }

  /** Texto, nombre accesible y ayuda del botón de la barra para un objeto o una persona cercana. */
  private interactionAction(obj: MapObjectState | null): {
    obj: MapObjectState; verb: InteractionVerb; ariaLabel: string; title: string;
  } | null {
    if (!obj) return null;
    const mapKey = this.world()?.map.key;
    const shown = { ...obj, label: getSceneDisplayLabel(obj, mapKey) };
    const verb = interactionVerb(shown, obj.type === 'EXIT' ? this.doorStatusFor(obj) : null);
    const reason = verb.locked && verb.reason ? verb.reason : null;
    const rawDescription = obj.key.startsWith('npc:') ? '' : getSceneInteractionDescription(obj, mapKey);
    // La descripción sembrada solo sirve de ayuda (title) si dice algo que el verbo y la etiqueta no dicen.
    const description = rawDescription && !verb.text.toLowerCase().includes(rawDescription.trim().toLowerCase()) ? rawDescription : '';
    return {
      obj,
      verb,
      // El nombre contiene el texto visible (WCAG 2.5.3) y no promete la tecla: solo se rotula con puntero fino.
      ariaLabel: `Interactuar: ${verb.text}${reason ? `, bloqueada: ${reason}` : ''}`,
      title: reason ? `${verb.text}. ${reason}` : description ? `${verb.text}. ${description}` : verb.text,
    };
  }

  /** Pidió interactuar y no hay nada a su alcance (E, Espacio, Enter o el botón táctil): línea estática de `NOTHING_NEARBY_MS`. */
  showNothingNearby(): void {
    this.nothingNearbyNote.set(ORIENTATION_COPY.now.nothingNearby);
    // La barra ya no es una región viva: lo que la persona pidió se anuncia aquí, no por la línea de reposo.
    this.announce(ORIENTATION_COPY.now.nothingNearby);
    if (this.nothingNearbyTimer !== null) window.clearTimeout(this.nothingNearbyTimer);
    this.nothingNearbyTimer = window.setTimeout(() => {
      this.nothingNearbyTimer = null;
      this.nothingNearbyNote.set('');
    }, NOTHING_NEARBY_MS);
  }

  /** Persona del escenario (clave `npc:{clave}` del mundo) → su configuración; null si no está cargada. */
  private scenarioNpc(key: string): NpcConfig | null {
    const npcKey = key.replace(/^npc:/, '');
    return this.scenarioConfig()?.rooms.flatMap(room => room.npcs).find(npc => npc.key === npcKey) ?? null;
  }

  private openBackendInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS' || this.inputBlocked() || this.busy()) return;
    this.withSyncedPosition(() => this.doOpenBackendInteraction(interaction));
  }

  private doOpenBackendInteraction(interaction: MapObjectState) {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') return;

    this.selectedInteraction.set(interaction);
    this.gameWorld?.focus(interaction.key);
    this.busy.set(true);
    this.simulationService.openInteraction(game.attemptId, game.attemptToken, interaction.key).subscribe({
      next: result => {
        this.world.set(result.world);
        this.mergeViewedNpcKeysFromWorld(result.world);
        this.selectedInteraction.set(result.interaction);
        this.dialogue.set(this.decorateDialogue(result.dialogue ?? result.interaction.dialogue));
        this.announcePickup(result);
        this.busy.set(false);
      },
      error: err => {
        perfCancel('interaction-to-response');
        this.selectedInteraction.set(null);
        this.releaseDialogue();
        this.reportApiError(err, 'No pudimos abrir la interacción.');
        this.busy.set(false);
      }
    });
  }

  private doorTargetNodeKey(obj: MapObjectState): string | null {
    const target = (obj.metadata as { targetNodeKey?: unknown } | undefined)?.targetNodeKey;
    return typeof target === 'string' && target ? target : null;
  }

  /** Fase 10: puerta espacial NO puntuada — usa el enterRoom existente.
   *  Caso PDF: envía doorKey (el backend re-valida puerta y requisitos), y la
   *  puerta bloqueada muestra un aviso transitorio, no un DialoguePanel. */
  private tryOpenDoor(door: MapObjectState) {
    const game = this.attempt();
    const target = this.doorTargetNodeKey(door);
    if (!game || !target || this.inputBlocked() || this.busy()) return;
    // Una sola función decide si la puerta se abre y por qué no: la misma de la barra, el rótulo y la lista.
    const context = this.doorContext();
    const status = context ? doorStatus(door, context) : null;
    if (!status || status.state === 'locked') {
      this.audioDirector.playSfx('ui_cancel');
      this.showDoorNotice(status?.message ?? ORIENTATION_COPY.door.fallback);
      return;
    }
    if (!this.doorInteractionArmed) {
      this.audioDirector.playSfx('ui_cancel');
      this.showDoorNotice('Da unos pasos dentro de la sala antes de volver a cruzar la puerta.');
      return;
    }
    this.busy.set(true);
    this.withSyncedPosition(() => this.triggerFade(() => {
      this.simulationService.enterRoom(
        game.attemptId, game.attemptToken, target, door.key,
      ).subscribe({
        next: world => {
          this.selectedInteraction.set(null);
          this.nearbyInteraction.set(null);
          this.dialogue.set(null);
          // «Entraste a …» lo anuncia `announceRoomChange` al aplicar el mundo: una sola fuente para el cambio de sala
          // (por puerta o por decisión), así no se dice dos veces.
          this.applyWorldWithScenario(world);
        },
        error: err => {
          this.busy.set(false);
          this.fadeActive.set(false);
          // Si el servidor rechaza una puerta que el cliente creía abierta, su texto (el del seed) puede nombrar
          // temas de las decisiones: se dice lo que el cliente sabe decir, sin ese texto.
          if (err instanceof HttpErrorResponse && err.status === 400) this.showDoorNotice(ORIENTATION_COPY.door.fallback);
          else this.reportApiError(err, 'No pudimos cruzar la puerta.');
        },
      });
    }, 'door_open'));
  }

  /** Sacudida por decisión, pendiente hasta que el fundido de escena deje ver el mundo. */
  private pendingDecisionImpact: SimulationFeedback | null = null;

  /** Texto del aviso del sistema con ese id; '' si no hay o la persona ya lo cerró. */
  private noticeText(id: number | null): string {
    return id === null ? '' : this.systemNotices().find(message => message.id === id)?.text ?? '';
  }

  /**
   * Aviso accionable de puerta (VD-29): aviso de advertencia del sistema SIN cierre automático. Lo pinta y anuncia
   * `ui-toast-host` (una vez, con cortesía), no mueve el foco y reemplaza al de la puerta anterior.
   */
  private showDoorNotice(message: string): void {
    this.dismissDoorNotice();
    this.doorNoticeId.set(this.notifications.show('warning', message, 0));
  }

  private dismissDoorNotice(): void {
    const id = this.doorNoticeId();
    if (id !== null) this.notifications.dismiss(id);
    this.doorNoticeId.set(null);
  }

  /** Error de una acción: aviso de error del sistema (no se va solo); el siguiente reemplaza al anterior. */
  private showActionError(message: string) {
    this.dismissActionError();
    this.actionErrorId.set(this.notifications.show('error', message));
  }

  private dismissActionError(): void {
    const id = this.actionErrorId();
    if (id !== null) this.notifications.dismiss(id);
    this.actionErrorId.set(null);
  }

  onRoomExit(event: { targetRoomKey: string; entryX: number; entryY: number }) {
    this.gameWorld?.transitionToRoom(event.targetRoomKey, event.entryX, event.entryY);
  }

  /** Disparo walk-over legacy (mapas sin scenarioConfig) — misma puerta gateada. */
  onDoorTrigger(event: { targetNodeKey: string; entryX: number; entryY: number }) {
    const door = this.world()?.objects.find(
      o => o.type === 'EXIT' && this.doorTargetNodeKey(o) === event.targetNodeKey,
    );
    if (door) this.tryOpenDoor(door);
  }

  /**
   * Fase 9 y F§7.6: decora la conversación antes de mostrarla (líneas desbloqueadas por evidencia,
   * aviso único de lo que falta, herramienta ausente) y quita las decisiones que no son de esta
   * etapa: ningún objeto del mundo ofrece una decisión que `currentNode.options` no contiene (AC-3).
   * Las opciones no revelan su resultado pedagógico antes de responder.
   */
  private decorateDialogue(dialogue: DialogueState | null): DialogueState | null {
    if (!dialogue) return null;
    const node = this.attempt()?.currentNode;
    return decorateDialogueState(dialogue, {
      nodeKey: node?.key ?? null,
      nodeOptionIds: node?.options?.map(option => option.id) ?? null,
      evidence: nodeEvidence(node?.key),
      world: this.world(),
      viewedNpcKeys: this.viewedNpcKeys(),
      copy: this.copyContext(),
    });
  }

  /** Estado de una puerta (null si no es una salida o aún no hay mundo): lo leen la barra, el aviso y el rótulo del mundo. */
  doorStatusFor(door: MapObjectState): DoorStatus | null {
    if (door.type !== 'EXIT') return null;
    const context = this.doorContext();
    return context ? doorStatus(door, context) : null;
  }

  /** Contexto de las puertas (F§7.5): null mientras no haya intento y mundo. */
  private doorContext(): (DoorStatusContext & { world: SimulationWorldState }) | null {
    const game = this.attempt();
    const world = this.world();
    if (!game || !world) return null;
    return {
      nodeKey: game.currentNode.key,
      decisionNumber: getSceneProgress(game.currentNode.key)?.step ?? null,
      world,
      viewedNpcKeys: collectViewedNpcKeys(world, this.viewedNpcKeys()),
      copy: this.copyContext(),
    };
  }

  /** Contexto de redacción compartido por el aviso de evidencia, la lista «Qué hacer» y las puertas. */
  private copyContext(): CopyContext {
    const world = this.world();
    return {
      currentRoom: roomGroupOf(world?.map.key),
      world,
      nameTools: NAME_TOOLS_IN_HINTS,
      npcs: this.scenarioConfig()?.rooms.flatMap(room => room.npcs) ?? [],
    };
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
        },
        {
          key: 'frontend:proceed-restricted',
          text: 'Continuar bajo riesgo',
          decisionOptionId: null,
          requiredToolCode: null,
          effect: {},
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

  /** Recoger algo: sonido discreto y «Obtuviste: {etiqueta}. Ya está en tu barra de herramientas.». */
  private announcePickup(result: InteractionResult): void {
    if (!result.unlockedToolCode) return;
    this.audioDirector.playSfx('item_pickup');
    this.showSoftNotice(ORIENTATION_COPY.notices.obtained(
      getSceneDisplayLabel(result.interaction, result.world.map.key),
    ));
  }

  /** Aviso breve (VD-29): se anuncia por la región de cortesía y, como ya se anunció, se apaga a los `NOTICE_MS`. */
  private showSoftNotice(message: string): void {
    this.softNotice.set(message);
    this.announce(message);
    if (this.softNoticeTimer !== null) window.clearTimeout(this.softNoticeTimer);
    this.softNoticeTimer = window.setTimeout(() => {
      this.softNoticeTimer = null;
      this.softNotice.set('');
    }, NOTICE_MS);
  }

  /** Avisa con el mensaje real del servidor; si el interceptor ya avisó (sin red, sesión), no duplica. */
  private reportApiError(err: unknown, fallback: string): void {
    const message = apiErrorMessage(err, fallback);
    if (message) this.showActionError(message);
  }

  /** Suelta la opción que el panel de diálogo tenía marcada como elegida. */
  private releaseDialogue(): void {
    this.dialogueReleaseToken.update(token => token + 1);
  }

  executeDecision(decisionOptionId: number) {
    const game = this.attempt();
    if (!game) return;
    if (this.busy()) {
      // La elección se descarta: sin soltar el panel la opción quedaría marcada y bloqueada.
      this.releaseDialogue();
      return;
    }
    if (!(game.currentNode.options ?? []).some(o => o.id === decisionOptionId)) {
      // Decisión de otra etapa (sala visitada por puerta): feedback claro, sin 400. Red de seguridad:
      // la decoración del diálogo ya no ofrece estas opciones.
      this.showActionError('Esta intervención pertenece a otra etapa del caso. Vuelve cuando el flujo te lleve a esta sala.');
      this.releaseDialogue();
      return;
    }
    const selectedChoice = this.dialogue()?.choices.find(choice => choice.decisionOptionId === decisionOptionId);
    const evidenceDef = mergeEvidence(nodeEvidence(game.currentNode.key), choiceEvidence(selectedChoice));
    const missing = missingEvidence(evidenceDef, this.world(), this.viewedNpcKeys());
    if (evidenceDef && missing.length && this.pendingEvidenceDecisionId !== decisionOptionId) {
      this.pendingEvidenceDecisionId = decisionOptionId;
      this.pendingEvidenceMissing = [...missing];
      const message = this.evidenceMissingMessage(evidenceDef);
      // Sin announce(): el panel de diálogo anuncia esta misma línea al abrirse (con las dos se leía dos veces).
      this.dialogue.set(this.buildEvidenceGateDialogue(message, decisionOptionId));
      return;
    }
    const evidenceOverride = this.pendingEvidenceDecisionId === decisionOptionId
      && this.pendingEvidenceMissing.length > 0;
    const confirmedMissingEvidence = evidenceOverride ? this.pendingEvidenceMissing : [];
    this.pendingEvidenceDecisionId = null;
    this.pendingEvidenceMissing = [];
    const previousDialogue = this.dialogue();
    this.busy.set(true);
    perfStart('decision-to-scene');
    this.dialogue.set(null);
    this.journalMessage.set('');
    this.triggerFade(() => {
      this.simulationService.chooseDecision(
        game.attemptId, game.attemptToken, decisionOptionId,
        evidenceOverride, confirmedMissingEvidence,
      ).subscribe({
        next: updated => {
          // Una pausa enviada por el plazo (F2) ya fijó el estado autoritativo del intento: la respuesta tardía de
          // esta decisión no lo pisa con uno anterior.
          if (this.attempt()?.status === 'PAUSED') {
            perfCancel('decision-to-scene');
            this.busy.set(false);
            this.fadeActive.set(false);
            return;
          }
          this.trackStageChange(game, updated);
          this.attempt.set(updated);
          this.hydrateClinicalState(updated);
          this.persistAttemptToken(updated);
          this.selectedInteraction.set(null);
          this.nearbyInteraction.set(null);
          this.journalPanel?.clear();
          // Última decisión: la supervisión se lee sobre la escena y el resultado se abre al cerrarla. Se arma
          // antes de pedir el mundo: si este falla, su error suelta la retención. Sin supervisión que mostrar,
          // el resultado se abre ya y el cierre suena como siempre.
          const lastDecision = updated.status === 'COMPLETED';
          if (lastDecision && !this.holdOutcomeForSupervision(updated.feedback)) this.playCompletionAudio();
          this.loadProgressMap(updated);
          this.loadWorld(updated);
          this.audioDirector.setStressLevel(updated.stressIndex);
          this.pendingDecisionImpact = updated.feedback ?? null;
          if (!lastDecision && updated.feedback) {
            window.setTimeout(() => this.dialogue.set(this.buildSupervisionDialogue(updated.feedback!)), SUPERVISION_DELAY_MS);
          }
        },
        error: err => {
          perfCancel('decision-to-scene');
          // Se devuelve la conversación para poder reintentar en vez de dejar al estudiante en el mapa.
          this.dialogue.set(previousDialogue);
          this.releaseDialogue();
          this.reportApiError(err, 'No pudimos registrar tu decisión. Inténtalo de nuevo.');
          this.busy.set(false);
          this.fadeActive.set(false);
        }
      });
    });
  }

  useTool(toolCode: string) {
    const game = this.attempt();
    const target = this.selectedInteraction()?.key ?? null;
    if (!game) return;
    if (this.busy()) {
      this.releaseDialogue();
      return;
    }
    this.withSyncedPosition(() => this.doUseTool(toolCode, target));
  }

  private doUseTool(toolCode: string, target: string | null) {
    const game = this.attempt();
    if (!game) return;
    if (this.busy()) {
      this.releaseDialogue();
      return;
    }
    this.busy.set(true);
    this.simulationService.useTool(game.attemptId, game.attemptToken, toolCode, target).subscribe({
      next: (result: ToolUseResult) => {
        this.world.set(result.world);
        this.mergeViewedNpcKeysFromWorld(result.world);
        const cur = this.attempt();
        if (cur) {
          const newStress = Math.max(0, Math.min(100, cur.stressIndex + result.stressDelta));
          this.attempt.set({ ...cur, stressIndex: newStress });
          this.audioDirector.setStressLevel(newStress);
        }
        this.showToolFeedback(result);
        this.busy.set(false);
      },
      error: err => {
        this.releaseDialogue();
        this.reportApiError(err, 'No pudimos usar la herramienta.');
        this.busy.set(false);
      }
    });
  }

  selectTool(toolCode: string) {
    const tool = this.world()?.tools.find(t => t.code === toolCode);
    if (!tool || this.inputBlocked() || this.busy()) return;
    this.audioDirector.playSfx('ui_select');
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

  closeDialogue() {
    // Con la supervisión de la última decisión retenida, cerrarla abre el resultado (`releaseHeldOutcome`).
    this.dialogue.set(null);
    // Al cerrar ya no hay nada «abierto»: sin esto el objeto, y la herramienta del dock, quedaban marcados.
    this.selectedInteraction.set(null);
  }

  /** Diálogo informativo de NPC (frontend-only, sin decisión) → modo cinematic. */
  openNpcDialogue(npc: NpcConfig) {
    if (this.inputBlocked() || this.busy()) return;
    const game = this.attempt();
    if (game?.status === 'IN_PROGRESS') {
      this.busy.set(true);
      this.withSyncedPosition(() => this.recordNpcInteraction(npc));
      return;
    }
    this.showNpcDialogue(npc);
  }

  private recordNpcInteraction(npc: NpcConfig): void {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') {
      this.busy.set(false);
      return;
    }
    this.simulationService.recordNpcInteraction(game.attemptId, game.attemptToken, npc.key).subscribe({
      next: world => {
        this.mergeViewedNpcKeysFromWorld(world);
        this.showNpcDialogue(npc);
        this.busy.set(false);
      },
      error: err => {
        this.releaseDialogue();
        this.reportApiError(err, 'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.');
        this.busy.set(false);
      },
    });
  }

  private showNpcDialogue(npc: NpcConfig): void {
    if (!npc.dialogue?.lines?.length) return;
    this.dialogue.set({
      key: `npc-${npc.key}`,
      recipeId: npc.recipeId,
      speakerName: npc.displayName,
      portraitKey: npc.portrait ?? null,
      emotion: 'neutral',
      lines: npc.dialogue.lines.map((line, index) => ({
        order: index + 1,
        speakerName: npc.displayName,
        text: line.text,
        emotion: line.emotion ?? 'neutral',
      })),
      choices: [],
    });
  }

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
    if (!game || this.inputBlocked() || this.busy()) return;
    // Sonido discreto: la salida segura es seria, no alarmista.
    this.audioDirector.playSfx('ui_cancel');
    this.busy.set(true);
    this.withSyncedPosition(() => this.pauseCurrentAttempt());
  }

  /**
   * Salida segura desde cualquier superposición (diálogo con o sin opciones, bitácora, introducción
   * y contexto) y desde el pie (F§7.8). Es el camino de REGLA-004 para los estados en que
   * `safeExit()` no actúa a propósito (overlay abierto) o rechaza el toque (`busy`).
   *
   * - No hace nada sin un intento `IN_PROGRESS`, bajo el aviso de contenido (ETH-01) ni bajo el
   *   de reanudar, ni si ya hay una pausa pedida (un segundo toque no pausa dos veces).
   * - Con una petición en curso la deja en cola: se ejecuta cuando `busy()` se suelta.
   */
  pauseFromOverlay(): void {
    // Con la última supervisión a la vista el intento ya terminó: no hay nada que pausar. «Salida segura»
    // hace lo mismo que «Continuar»: cierra la supervisión y abre el resultado, donde están las salidas.
    if (this.holdingOutcome()) {
      this.closeDialogue();
      return;
    }
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') return;
    if (this.showResumePrompt() || this.showContentWarning()) return;
    if (this.pausing()) return;
    this.pausing.set(true);
    // Plazo de seguridad (F2): si la pausa no sale por la cola, se envía igualmente.
    this.pauseDeadlineTimer = window.setTimeout(() => this.forcePauseAtDeadline(), QUEUED_PAUSE_DEADLINE_MS);
    if (this.busy()) {
      this.announce('Pausando el caso. Se guardará en cuanto termine la acción en curso.', 'assertive');
      return;
    }
    this.startQueuedPause();
  }

  /** Arranca la pausa pedida con `pauseFromOverlay()`; por el camino de la cola, `busy()` ya está libre. */
  private startQueuedPause(): void {
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') {
      this.endPausing();
      return;
    }
    // La petición ya salió (por el plazo): la liberación tardía de `busy()` no la repite.
    if (this.pauseSent) return;
    // Sonido discreto: la salida segura es seria, no alarmista.
    this.audioDirector.playSfx('ui_cancel');
    this.busy.set(true);
    this.withSyncedPosition(() => this.pauseCurrentAttempt());
  }

  /**
   * Pasó el plazo de la pausa pedida y sigue sin salir: hay una petición colgada (o la sincronización de la posición).
   * La pausa se envía igualmente, sin esperar y sin sincronizar la posición, con aviso visible y anunciado. El
   * servidor valida el token; no cambia `safeExit()` ni la semántica de la pausa (ETH-02).
   */
  private forcePauseAtDeadline(): void {
    this.pauseDeadlineTimer = null;
    if (!this.pausing() || this.pauseSent) return;
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') {
      this.endPausing();
      return;
    }
    this.pausingSlow.set(true);
    this.announce(QUEUED_PAUSE_SLOW_NOTICE, 'assertive');
    this.audioDirector.playSfx('ui_cancel');
    this.busy.set(true);
    this.pauseCurrentAttempt();
  }

  /** La pausa pedida terminó o se descartó: se apagan el estado, el aviso de lentitud y el plazo. */
  private endPausing(): void {
    if (this.pauseDeadlineTimer !== null) window.clearTimeout(this.pauseDeadlineTimer);
    this.pauseDeadlineTimer = null;
    this.pausingSlow.set(false);
    this.pausing.set(false);
  }

  private pauseCurrentAttempt(): void {
    // Ya hay una pausa en camino (el plazo se adelantó a la sincronización de la posición, que responde tarde): no se repite.
    if (this.pauseSent) return;
    const game = this.attempt();
    if (!game || game.status !== 'IN_PROGRESS') {
      this.endPausing();
      this.busy.set(false);
      return;
    }
    // Ya está en camino: el plazo no la repite.
    if (this.pauseDeadlineTimer !== null) window.clearTimeout(this.pauseDeadlineTimer);
    this.pauseDeadlineTimer = null;
    this.pauseSent = true;
    this.simulationService.safeExit(game.attemptId, game.attemptToken, 'Salida segura solicitada').subscribe({
      next: updated => {
        this.pauseSent = false;
        this.endPausing();
        this.attempt.set(updated);
        // Se limpia al éxito y no antes: si la petición falla, la superposición sigue ahí y se puede
        // reintentar. Sin esto la pausa (z 150) quedaría bajo las tarjetas de introducción (z 380) y
        // la bitácora reaparecería al reanudar.
        this.clearTransientOverlays();
        this.worldReloadPending = true;
        this.loadWorld(updated);
      },
      error: () => {
        this.pauseSent = false;
        this.endPausing();
        this.showActionError('No pudimos registrar la salida segura.');
        this.busy.set(false);
      },
    });
  }

  /** Cierra toda superposición y descarta lo que esperaba una respuesta (pausa e intento nuevo). */
  private clearTransientOverlays(): void {
    this.selectedInteraction.set(null);
    this.supervisionHold.set(false);
    this.dialogue.set(null);
    this.journalOpen.set(false);
    // «Ir a…» tiene su propia «Salida segura»: pausar desde ahí no la deja bajo la pantalla de pausa ni la trae de vuelta.
    this.placesOpen.set(false);
    this.showIntroScene.set(false);
    this.showCaseIntro.set(false);
    this.helpOpen.set(false);
    this.pendingEvidenceDecisionId = null;
    this.pendingEvidenceMissing = [];
    this.pendingRestrictedInteraction.set(null);
    this.resetNotices();
    this.audioDirector.stopIntroLament();
  }

  rememberPosition(x: number, y: number) {
    this.lastPosition = { x, y };
    this.rearmDoorInteractionWhenAway(x, y);
    if (this.positionSaveHandle) window.clearTimeout(this.positionSaveHandle);
    this.positionSaveHandle = window.setTimeout(() => this.persistPosition(), POSITION_SAVE_DEBOUNCE_MS);
  }

  private rearmDoorInteractionWhenAway(x: number, y: number): void {
    if (this.doorInteractionArmed) return;
    const doors = (this.world()?.objects ?? []).filter(object =>
      (object.type || '').toUpperCase() === 'EXIT' && this.doorTargetNodeKey(object),
    );
    if (doors.length === 0 || doors.every(door =>
      Math.hypot(x - door.x, y - door.y) >= this.doorInteractionRearmDistance,
    )) {
      this.doorInteractionArmed = true;
    }
  }

  /**
   * Contador de respaldo para un nodo sin etapa conocida (casos del editor): «Escenario k de n» del
   * mapa de progreso. Sin mapa, sin chip. En el caso SIM-VBG-001 manda siempre «Decisión k de 6».
   */
  private fallbackStageLabel(): string | null {
    const map = this.progressMap();
    const currentKey = this.attempt()?.currentNode.key;
    if (!map?.nodes.length || !currentKey) return null;
    const index = map.nodes.findIndex(node => node.key === currentKey);
    return index >= 0 ? `Escenario ${index + 1} de ${map.nodes.length}` : null;
  }

  visitedStageLabels(): string[] {
    const map = this.progressMap();
    if (!map?.nodes.length) return [];
    const visited = new Set(map.visitedNodeKeys);
    return map.nodes
      .filter(node => visited.has(node.key))
      .map(node => node.label);
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
    return {
      IN_PROGRESS: 'En progreso',
      PAUSED: 'En pausa segura (reanudable)',
      COMPLETED: 'Finalizado',
      SAFE_EXITED: 'Cerrado con salida segura',
      REPLACED: 'Reemplazado por un intento nuevo',
    }[status];
  }

  private showToolFeedback(result: ToolUseResult): void {
    this.audioDirector.playSfx('ui_confirm');
    this.dialogue.set({
      key: `tool-feedback-${result.toolCode}-${Date.now()}`,
      speakerName: result.pertinent ? '✓ Herramienta pertinente' : 'ℹ Herramienta aplicada',
      portraitKey: null, emotion: result.pertinent ? 'positive' : 'neutral',
      lines: [
        { order: 1, speakerName: '', text: result.feedbackMessage, emotion: 'neutral' },
        // «Estrés +0%» no dice nada: solo se informa cuando el cambio real existe.
        ...(result.stressDelta !== 0
          ? [{ order: 2, speakerName: '', text: `Estrés ${result.stressDelta > 0 ? '+' : ''}${result.stressDelta}%`, emotion: 'neutral' }]
          : []),
      ],
      choices: []
    });
    this.stressPulse.set(true);
    window.setTimeout(() => this.stressPulse.set(false), STRESS_PULSE_MS);
    // Sin announce(): el panel de diálogo ya anuncia esta misma línea por su región viva (con las dos se leía dos veces).
  }

  toggleMusicMute(): void {
    const muted = this.audioDirector.toggleMusicMuted();
    this.musicMuted.set(muted);
    if (!muted) {
      // Durante la intro vuelve su tema; en la partida, la música adaptativa del mapa.
      if (this.showIntroScene() || this.showCaseIntro()) this.audioDirector.playIntroLament();
      else this.audioDirector.setStressLevel(this.attempt()?.stressIndex ?? 0);
    }
    this.announce(muted ? 'Música silenciada.' : 'Música activada.');
  }

  toggleSfxMute(): void {
    const muted = this.audioDirector.toggleSfxMuted();
    this.sfxMuted.set(muted);
    this.announce(muted ? 'Sonidos de acciones silenciados.' : 'Sonidos de acciones activados.');
  }

  toggleReduceMotion(): void {
    const reduced = !this.reduceMotion();
    this.reduceMotion.set(reduced);
    this.announce(reduced ? 'Movimiento reducido activado.' : 'Movimiento reducido desactivado.');
  }

  /**
   * Lo que falta antes de decidir, en las mismas frases que la lista y el aviso sobre las opciones
   * (una sola fuente: `evidenceNoticeText`); nunca una clave interna. El texto del seed solo queda
   * de respaldo para una evidencia que el copy no sepa nombrar.
   */
  private evidenceMissingMessage(def: NodeEvidenceDef): string {
    const items = missingEvidenceItems(def, this.world(), this.viewedNpcKeys());
    return evidenceNoticeText(items, this.copyContext()) ?? def.missingMessage;
  }

  /** Gate de evidencia (Fase 9): permite cancelar o decidir bajo registro. */
  private buildEvidenceGateDialogue(message: string, decisionOptionId: number): DialogueState {
    return {
      key: `evidence-gate-${decisionOptionId}`,
      speakerName: 'Criterio profesional', portraitKey: 'info', emotion: 'concerned',
      // El aviso único ya dice que se puede decidir igualmente y que quedará registrado con información incompleta.
      lines: [
        { order: 1, speakerName: 'Criterio profesional', text: message, emotion: 'concerned' },
      ],
      choices: [
        { key: 'frontend:cancel-evidence', text: 'Explorar primero', decisionOptionId: null, requiredToolCode: null, effect: {} },
        { key: `frontend:proceed-evidence:${decisionOptionId}`, text: 'Decidir con información incompleta', decisionOptionId: null, requiredToolCode: null, effect: {} },
      ],
    };
  }

  /**
   * Última decisión (DLG-05): muestra la supervisión sobre la escena y retiene el resultado hasta que se cierre.
   * Devuelve `false` si no hay nada que mostrar (sin feedback o con uno que no se puede armar): el resultado
   * se abre entonces como siempre.
   */
  private holdOutcomeForSupervision(feedback: SimulationFeedback | null | undefined): boolean {
    if (!feedback) return false;
    try {
      this.dialogue.set(this.buildSupervisionDialogue(feedback));
    } catch {
      return false;
    }
    this.supervisionHold.set(true);
    return true;
  }

  /** La supervisión retenida ya no está a la vista: suena el cierre del caso y el foco pasa al resultado. */
  private releaseHeldOutcome(): void {
    this.supervisionHold.set(false);
    this.announce('Se abre el resultado del caso.');
    this.playCompletionAudio();
    // El foco inicial lo toma el propio resultado, en su título y nunca en un botón (H-05): si se mantuvo Enter para
    // cerrar la supervisión, un botón enfocado («Reintentar caso») se activaría solo con la repetición de la tecla.
  }

  private playCompletionAudio(): void {
    this.audioDirector.playResolution();
    this.audioDirector.playSfx('session_complete');
  }

  private buildSupervisionDialogue(feedback: SimulationFeedback): DialogueState {
    const retryRequired = this.feedbackRequiresRetry(feedback);
    const lines: DialogueState['lines'] = [
      { order: 1, speakerName: 'Supervisión clínica', text: feedback.message, emotion: feedback.prohibitedConduct ? 'danger' : 'neutral' }
    ];
    if (feedback.prohibitionReason) {
      lines.push({ order: 2, speakerName: 'Supervisión clínica', text: feedback.prohibitionReason, emotion: 'danger' });
    }
    if (retryRequired) {
      lines.push({
        order: lines.length + 1,
        speakerName: '',
        text: 'No se avanzó el caso ni se aplicaron cambios acumulados. Revisa la escena y vuelve a responder.',
        emotion: 'concerned'
      });
    } else {
      // Sin cifras: las del motor no coinciden con las barras del HUD y «puntaje» convierte el caso en un marcador.
      lines.push({
        order: lines.length + 1,
        speakerName: '',
        text: ORIENTATION_COPY.notices.supervision,
        emotion: 'neutral'
      });
    }
    return {
      key: `supervision-${Date.now()}`, speakerName: 'Supervisión clínica',
      portraitKey: null,
      emotion: feedback.prohibitedConduct ? 'danger' : feedback.classification === 'ADEQUATE' ? 'positive' : 'neutral',
      lines, choices: []
    };
  }

  private triggerFade(callback: () => void, sound: 'dialogue_advance' | 'door_open' = 'dialogue_advance'): void {
    this.audioDirector.playSfx(sound);
    this.fadeActive.set(true);
    window.setTimeout(callback, FADE_OUT_MS);
  }

  /** Programa los efectos de cámara para cuando el fundido de escena ya dejó ver el mundo. */
  private scheduleRevealEffects(): void {
    window.setTimeout(() => this.playRevealEffects(), SCENE_FADE_MS);
  }

  private playRevealEffects(): void {
    const impact = this.pendingDecisionImpact;
    this.pendingDecisionImpact = null;
    this.gameWorld?.playRevealEffects(impact);
  }

  private loadProgressMap(attempt: SimulationAttemptState) {
    this.simulationService.getProgressMap(attempt.attemptId, attempt.attemptToken).subscribe({
      next: map => this.progressMap.set(map),
      error: () => this.progressMap.set(null)
    });
  }

  private loadWorld(attempt: SimulationAttemptState) {
    this.simulationService.getWorld(attempt.attemptId, attempt.attemptToken).subscribe({
      next: world => this.applyWorldWithScenario(world),
      error: cause => {
        this.fail('No pudimos cargar el mapa del caso.', cause, () => this.loadWorld(attempt));
        this.worldReloadPending = false;
        this.resumeQueued = false;
        // Sin mapa no hay escena sobre la que leer la supervisión: el resultado no puede quedar retenido.
        this.supervisionHold.set(false);
        this.pendingDecisionImpact = null;
        this.pendingStage = null;
        this.loading.set(false);
        this.busy.set(false);
        this.fadeActive.set(false);
      }
    });
  }

  /** Carga el ScenarioConfig que corresponde al mapa del mundo y aplica ambos. */
  private applyWorldWithScenario(world: SimulationWorldState): void {
    this.simulationService.getScenarioConfig(world.map.key).subscribe({
      next: config => {
        this.scenarioConfig.set(config);
        this.applyLoadedWorld(world);
      },
      error: () => {
        // Solo entrar al renderer legacy cuando sabemos que el asset no existe.
        // Vaciar la configuración mientras el GET seguía pendiente abría una
        // ventana en la que las puertas DB walk-over podían dispararse solas.
        this.scenarioConfig.set(null);
        this.applyLoadedWorld(world);
      },
    });
  }

  /** Termina la recarga del mundo tras una pausa y atiende el «Reanudar» que llegó mientras tanto. */
  private finishWorldReload(): void {
    const resume = this.resumeQueued;
    this.worldReloadPending = false;
    this.resumeQueued = false;
    if (resume) this.resumeCurrentAttempt();
  }

  private applyLoadedWorld(world: SimulationWorldState): void {
    const previousMapKey = this.world()?.map.key ?? null;
    const mapChanged = previousMapKey !== world.map.key;
    if (mapChanged) {
      this.doorInteractionArmed = false;
      // El aviso de una puerta de la sala anterior ya no dice nada de esta (permanece hasta cerrarse o cambiar de sala).
      this.dismissDoorNotice();
    }
    this.rememberVisitedRoom(world);
    this.world.set(world);
    this.hydrateClinicalState(this.attempt());
    this.mergeViewedNpcKeysFromWorld(world);
    this.loading.set(false);
    this.busy.set(false);
    this.worldRevealTimer = window.setTimeout(() => {
      this.fadeActive.set(false);
      this.scheduleRevealEffects();
    }, WORLD_REVEAL_DELAY_MS);
    // Etapa nueva (se decidió): banner con su título aunque el mapa sea el mismo (F§4.5). No se
    // repite al recargar: `pendingStage` solo lo arma la respuesta de una decisión.
    const stage = this.pendingStage;
    this.pendingStage = null;
    if (stage) this.announceNewStage(stage);
    if (previousMapKey && mapChanged) {
      // La posición pendiente pertenece a la sala anterior: descartarla evita
      // que un flush posterior envíe coordenadas del mapa viejo.
      this.lastPosition = null;
      this.lastSyncedPosition = null;
      this.announceRoomChange(world, stage !== null);
    }
    this.maybeShowInitialCaseIntro(world);
    // Al final, con la escena ya aplicada: si «Reanudar» llegó durante la recarga, se atiende ahora.
    this.finishWorldReload();
  }

  private hydrateClinicalState(attempt: SimulationAttemptState | null): void {
    const patient = attempt?.clinicalState?.patient;
    if (!patient) return;
    this.patientState.set(patient);
    this.gameWorld?.updatePatientVisualState(patient);
  }

  private maybeShowInitialCaseIntro(world: SimulationWorldState): void {
    const attempt = this.attempt();
    if (!attempt) return;
    this.applyIntroStep(this.resolveIntroStepFor(attempt, world.map.key));
  }

  private resolveIntroStepFor(attempt: SimulationAttemptState, mapKey: string | null): IntroGateStep {
    return resolveIntroStep({
      attemptStatus: attempt.status,
      nodeKey: attempt.currentNode.key,
      mapKey,
      // Una lectura que falla (modo privado, política) es «sin consentimiento» / «sin leer»: se vuelve a pedir.
      consentGiven: this.consentRecorder.isGiven(this.caseConsentStorageKey(attempt)),
      introRead: this.readStored(this.caseIntroStorageKey(attempt)) === 'read',
      reduceMotion: this.reduceMotion(),
    });
  }

  private applyIntroStep(step: IntroGateStep): void {
    switch (step) {
      case 'consent':
        this.showContentWarning.set(true);
        return;
      case 'scene':
        this.showIntroScene.set(true);
        // El tema acompaña la escena y sigue en la tarjeta del caso.
        this.audioDirector.playIntroLament();
        return;
      case 'narrative':
        this.revealCaseIntro();
        return;
      default:
        return;
    }
  }

  /**
   * Aceptar el aviso de contenido (ETH-01): pasa por el registro con estados. Guardando, el botón muestra su estado
   * y no hay doble envío; si el almacenamiento falla, NO se da por registrado: error con «Reintentar» y ni mundo,
   * ni HUD, ni audio. Solo con el consentimiento ya registrado se anuncia y arranca el mundo.
   */
  acceptContentWarning(): void {
    const attempt = this.attempt();
    if (!attempt || this.consentState() === 'saving') return;
    this.consentState.set('saving');
    this.announce(DRAFT_COPY.consentSaving.text);
    this.consentRecorder.record(this.caseConsentStorageKey(attempt)).then(
      () => {
        // El aviso pudo cerrarse mientras se registraba («Volver al catálogo»): una respuesta tardía no arranca nada.
        if (!this.showContentWarning() || this.consentState() !== 'saving') return;
        this.consentState.set('idle');
        this.showContentWarning.set(false);
        this.announce('Continuaste al caso. Cargando el escenario.');
        this.startWorld(attempt);
      },
      () => {
        if (!this.showContentWarning()) return;
        this.consentState.set('error');
        this.announce(this.consentErrorText, 'assertive');
      },
    );
  }

  /** «Iniciar nuevo intento» (RN-07): nombra lo que se pierde; «Continuar» conserva el intento abierto. */
  requestNewAttempt(): void {
    const copy = DRAFT_COPY.newAttemptConsequence;
    void this.dialog.consequence({
      title: copy.title,
      consequence: copy.text,
      continueLabel: 'Continuar',
      proceedLabel: 'Iniciar nuevo intento',
    }).then(answer => {
      if (answer === 'proceed') this.startNewAttempt();
    });
  }

  /** «Ir a…» (F6-11): abre la lista de lo que se puede alcanzar en la sala (personas, puertas y objetos ya examinados). */
  openPlaces(): void {
    const examined = new Set(this.world()?.inspectedObjectKeys ?? []);
    this.placeOptions.set(selectPlaces(this.gameWorld?.places() ?? [], examined));
    this.placesOpen.set(true);
  }

  /** Cierra la lista y devuelve el foco a su acceso: la cabecera estaba inerte mientras estuvo abierta. */
  closePlaces(): void {
    if (!this.placesOpen()) return;
    this.placesOpen.set(false);
    afterNextRender(() => document.querySelector<HTMLElement>('[data-hud-places]')?.focus(), { injector: this.injector });
  }

  /** Elegir un lugar: cierra la lista y camina hasta su alcance de interacción; la llegada se anuncia. */
  choosePlace(place: PlaceCandidate): void {
    this.closePlaces();
    if (!this.gameWorld?.walkToKey(place.key)) {
      this.announce(`${DRAFT_COPY.placesBlocked.text} ${place.label}`);
    }
  }

  /**
   * Phaser no pintó el mundo a tiempo (F6-8): el error de siempre con «Reintentar». Lo colgado es el lienzo, no el
   * estado del mundo (que ya llegó): reintentar REINICIA Phaser (`retryLoad`, que rearma el plazo) y deja el indicador
   * de arranque hasta su primer cuadro. Si el mundo pinta antes de pulsarlo, `onWorldReady` retira el error.
   */
  onWorldBootFailed(): void {
    if (!this.attempt() || this.error()) return;
    this.bootFailureShown = true;
    this.fail('No pudimos cargar el mapa del caso.', null, () => {
      this.bootFailureShown = false;
      this.worldRendered.set(false);
      this.loading.set(false);
      this.gameWorld?.retryLoad();
    });
  }

  /** Terminó la caminata de «Ir a…»: «Llegaste a …» o que no se pudo llegar (VD-19, borrador). */
  onWalkEnded(event: { key: string; label: string; outcome: 'arrived' | 'blocked' }): void {
    const copy = event.outcome === 'arrived' ? DRAFT_COPY.placesArrived : DRAFT_COPY.placesBlocked;
    this.announce(`${copy.text} ${event.label}`);
  }

  declineContentWarning(): void {
    this.showContentWarning.set(false);
    this.consentState.set('idle');
    this.announce('Volviste al catálogo. Puedes retomar el caso cuando lo decidas.');
    void this.router.navigate(['/portal/simulador']);
  }

  private caseConsentStorageKey(attempt: SimulationAttemptState): string {
    return `siep_case_consent_${attempt.caseVersionId}_${attempt.attemptId}`;
  }

  continueFromIntroScene(): void {
    this.showIntroScene.set(false);
    this.revealCaseIntro();
  }

  private revealCaseIntro(): void {
    this.showCaseIntro.set(true);
    this.audioDirector.playIntroLament();
  }

  continueFromCaseIntro(): void {
    const attempt = this.attempt();
    if (attempt) this.writeStored(this.caseIntroStorageKey(attempt), 'read');
    this.showCaseIntro.set(false);
    this.audioDirector.stopIntroLament();
    this.audioDirector.setStressLevel(attempt?.stressIndex ?? 0);
    this.announce('Introducción completada. Inicia la intervención en urgencias.');
  }

  /** Lectura y escritura del almacenamiento de la sesión sin que un bloqueo (modo privado, cuota) rompa el juego. */
  private readStored(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStored(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento la marca no se guarda: lo no leído se vuelve a mostrar. El juego sigue.
    }
  }

  private caseIntroStorageKey(attempt: SimulationAttemptState): string {
    return `siep_case_intro_${attempt.caseVersionId}_${attempt.attemptId}`;
  }

  /** Al cambiar de sala (puerta o decisión): nombre de la sala (`ROOM_BANNER_MS`) y, si el
   *  mapa trae texto de transición autorado (salto temporal), overlay breve. */
  private announceRoomChange(world: SimulationWorldState, stageBannerShown = false): void {
    // Con una etapa nueva manda su banner («Nueva etapa: …»), que ya nombra dónde estás.
    if (!stageBannerShown) {
      this.showRoomBanner(world.map.title, ROOM_BANNER_MS);
      this.announce(`Entraste a ${world.map.title}.`);
    }
    const transition = (world.map.ambient as Record<string, unknown> | undefined)?.['transitionText'];
    if (typeof transition === 'string' && transition && !this.seenTransitionMapKeys.has(world.map.key)) {
      this.seenTransitionMapKeys.add(world.map.key);
      this.transitionNote.set(transition);
      this.announce(transition);
      if (this.transitionNoteTimer !== null) window.clearTimeout(this.transitionNoteTimer);
      this.transitionNoteTimer = window.setTimeout(() => {
        this.transitionNoteTimer = null;
        this.transitionNote.set('');
      }, TRANSITION_NOTE_MS);
    }
  }

  private showRoomBanner(text: string, ms: number): void {
    this.roomBanner.set(text);
    if (this.roomBannerTimer !== null) window.clearTimeout(this.roomBannerTimer);
    this.roomBannerTimer = window.setTimeout(() => this.roomBanner.set(''), ms);
  }

  /** La decisión llevó a otra etapa (aunque la sala sea la misma): se recuerda hasta que llegue su mundo. */
  private trackStageChange(previous: SimulationAttemptState, updated: SimulationAttemptState): void {
    if (updated.status !== 'IN_PROGRESS' || updated.currentNode.key === previous.currentNode.key) return;
    this.pendingStage = {
      title: getStageTitle(updated.currentNode.key) ?? updated.currentNode.title,
      previousNumber: getSceneProgress(previous.currentNode.key)?.step ?? null,
    };
  }

  /** Banner «Nueva etapa: …» y, en la tarjeta, «Decisión k registrada» (omitido sin decisión previa). */
  private announceNewStage(stage: { title: string; previousNumber: number | null }): void {
    const banner = ORIENTATION_COPY.notices.newStage(stage.title);
    this.showRoomBanner(banner, STAGE_BANNER_MS);
    this.announce(banner);
    if (stage.previousNumber) {
      this.pendingNotes.unshift(ORIENTATION_COPY.notices.decisionRegistered(stage.previousNumber));
      this.flushNotes();
    }
  }

  /** Recuerda la sala alcanzada (refuerzo de la regla monótona de la lista, solo en este navegador). */
  private rememberVisitedRoom(world: SimulationWorldState): void {
    const attempt = this.attempt();
    const room = roomGroupOf(world.map.key);
    if (!attempt || !room) return;
    const next = markRoomVisited(attempt.caseVersionId, attempt.attemptId, room);
    const previous = this.visitedRooms();
    if (next.size !== previous.size || [...next].some(known => !previous.has(known))) this.visitedRooms.set(next);
  }

  /** Pasos recién hechos de la lista → notas «Anotado: …» (la primera evaluación y los cambios de etapa no anotan). */
  private queueNotesFor(next: SceneLogState | null): void {
    const previous = this.previousSceneLog;
    this.previousSceneLog = next;
    if (!next) return;
    for (const step of diffDone(previous, next)) {
      if (step.doneText) this.pendingNotes.push(step.doneText);
    }
    this.flushNotes();
  }

  /**
   * Muestra la siguiente nota en la tarjeta si la escena está libre; las demás esperan su turno. Una nota que un
   * diálogo tapó apenas se vio (menos de 1,5 s) vuelve a empezar sus 4,2 s cuando la escena queda libre; si ya
   * se había leído, se da por leída (la lista conserva su marca).
   */
  private flushNotes(): void {
    if (this.inputBlocked()) {
      if (this.noteTimer !== null) {
        window.clearTimeout(this.noteTimer);
        this.noteTimer = null;
        if (Date.now() - this.noteShownAt >= NOTE_SEEN_MS) this.checklistNotice.set(null);
      }
      return;
    }
    if (this.noteTimer !== null) return;
    const note = this.checklistNotice() ?? this.pendingNotes.shift() ?? null;
    if (note === null) return;
    this.checklistNotice.set(note);
    this.noteShownAt = Date.now();
    this.noteTimer = window.setTimeout(() => {
      this.noteTimer = null;
      this.checklistNotice.set(null);
      this.flushNotes();
    }, NOTICE_MS);
  }

  /** Descarta avisos pendientes y visibles (intento nuevo o pausa): eran de lo que se estaba haciendo. */
  private resetNotices(): void {
    this.pendingNotes.length = 0;
    this.previousSceneLog = null;
    if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
    this.noteTimer = null;
    this.checklistNotice.set(null);
    if (this.softNoticeTimer !== null) window.clearTimeout(this.softNoticeTimer);
    this.softNoticeTimer = null;
    this.softNotice.set('');
    // Banner de sala o de etapa, aviso de puerta y nota de transición (z 320-340): sin esto quedaban pintados encima de
    // la pantalla de pausa (F7). Eran de lo que se estaba haciendo. (El aviso de puerta ya no se apaga solo: se retira
    // aquí, al cerrarse o al cambiar de sala.)
    if (this.roomBannerTimer !== null) window.clearTimeout(this.roomBannerTimer);
    this.roomBannerTimer = null;
    this.roomBanner.set('');
    this.dismissDoorNotice();
    if (this.transitionNoteTimer !== null) window.clearTimeout(this.transitionNoteTimer);
    this.transitionNoteTimer = null;
    this.transitionNote.set('');
  }

  /**
   * Anuncia por las regiones vivas de la app. `polite` por defecto; `assertive` solo para errores y para la salida
   * segura (la urgencia no se usa para llamar la atención sobre lo que no la tiene).
   */
  private announce(message: string, politeness: AnnouncePoliteness = 'polite'): void {
    this.liveAnnouncer.announce(message, politeness);
  }

  private persistAttemptToken(attempt: SimulationAttemptState) {
    this.writeStored(`siep_attempt_${attempt.caseVersionId}`, JSON.stringify({
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      viewedNpcKeys: Array.from(this.viewedNpcKeys()),
    }));
  }

  private feedbackRequiresRetry(feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct' | 'retryRequired'>): boolean {
    // El backend es la autoridad: solo concede reintento en la 1ª respuesta mala
    // (regla de 2 oportunidades). La 2ª respuesta riesgosa/inadecuada queda
    // registrada y llega con retryRequired=false (aunque la clasificación sea mala).
    if (typeof feedback.retryRequired === 'boolean') return feedback.retryRequired;
    // Fallback para respuestas legacy sin el flag.
    return feedback.prohibitedConduct || feedback.classification === 'INADEQUATE' || feedback.classification === 'RISKY';
  }

  private restoreViewedNpcKeys(attempt: SimulationAttemptState): ReadonlySet<string> {
    try {
      const raw = sessionStorage.getItem(`siep_attempt_${attempt.caseVersionId}`);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as { attemptId?: unknown; viewedNpcKeys?: unknown };
      if (parsed.attemptId !== attempt.attemptId || !Array.isArray(parsed.viewedNpcKeys)) {
        return new Set<string>();
      }
      return new Set(parsed.viewedNpcKeys.filter((key): key is string => typeof key === 'string' && key.length > 0));
    } catch {
      return new Set<string>();
    }
  }

  private mergeViewedNpcKeysFromWorld(world: SimulationWorldState): void {
    const fromDb = this.viewedNpcKeysFromWorld(world);
    if (!fromDb.length) return;
    this.viewedNpcKeys.update(prev => {
      const next = new Set(prev);
      fromDb.forEach(key => next.add(key));
      this.persistViewedNpcKeys(next);
      return next;
    });
  }

  private viewedNpcKeysFromWorld(world: SimulationWorldState): string[] {
    const raw = world.flags?.['viewedNpcKeys'];
    return Array.isArray(raw)
      ? raw.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : [];
  }

  private persistViewedNpcKeys(keys: ReadonlySet<string> = this.viewedNpcKeys()): void {
    const attempt = this.attempt();
    if (!attempt) return;
    this.writeStored(`siep_attempt_${attempt.caseVersionId}`, JSON.stringify({
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      viewedNpcKeys: Array.from(keys),
    }));
  }

  private persistPosition() {
    const game = this.attempt(), world = this.world();
    if (!game || !world || !this.lastPosition || game.status !== 'IN_PROGRESS') return;
    const synced = { ...this.lastPosition };
    this.simulationService.updateWorldState(game.attemptId, game.attemptToken,
      synced.x, synced.y, world.map.key)
      .subscribe({
        // La posición se persiste en silencio: reemplazar `world` con el eco
        // del backend re-renderizaba toda la escena Phaser en plena caminata
        // (tirón visible). Solo se aplica si cambió algo de verdad (el mapa).
        next: updated => {
          this.lastSyncedPosition = synced;
          const current = this.world();
          if (!current || updated.map.key !== current.map.key) {
            this.world.set(updated);
            this.scheduleRevealEffects();
          }
        },
        error: () => undefined,
      });
  }

  /** GAME-01: el backend valida proximidad contra la posición PERSISTIDA.
   *  Antes de una acción validada (interacción, herramienta, puerta) se
   *  sincroniza la posición pendiente del debounce para cubrir la carrera
   *  "moverse y pulsar E antes de persistir". Si el flush falla, la acción
   *  continúa y es el backend quien decide.
   *
   *  `lastPosition` llega por `positionChange`, que avisa a Angular a lo sumo cada 125 ms: puede
   *  ir ~19 px por detrás y el servidor valida con radio 60. Por eso se toma antes la posición
   *  viva de la escena (vaciar la de la escena no bastaría: la ruta de E llama a
   *  `openInteraction` sin pasar por ella). */
  private withSyncedPosition(next: () => void): void {
    const live = this.gameWorld?.playerPosition();
    if (live) this.lastPosition = live;
    const game = this.attempt(), world = this.world();
    const pending = this.lastPosition && (
      !this.lastSyncedPosition
      || this.lastSyncedPosition.x !== this.lastPosition.x
      || this.lastSyncedPosition.y !== this.lastPosition.y);
    if (!game || !world || !pending || game.status !== 'IN_PROGRESS') {
      next();
      return;
    }
    if (this.positionSaveHandle) {
      window.clearTimeout(this.positionSaveHandle);
      this.positionSaveHandle = null;
    }
    const synced = { ...this.lastPosition! };
    this.simulationService.updateWorldState(game.attemptId, game.attemptToken,
      synced.x, synced.y, world.map.key)
      .subscribe({
        next: () => { this.lastSyncedPosition = synced; next(); },
        error: () => next(),
      });
  }
}
