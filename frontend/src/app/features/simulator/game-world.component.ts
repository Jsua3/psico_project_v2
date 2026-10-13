import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import Phaser from 'phaser';
import { CollisionZoneState, MapObjectState, NpcConfig, RoomConfig, ScenarioConfig, SimulationFeedback, SimulationWorldState } from '../../core/models/simulation.model';
import { backgroundImage } from './world-editor/room-edit.util';
import { KenneyDungeonFrames } from './kenney-frames.constants';
import {
  HOSPITAL_COLLISIONS,
  isHospitalMap,
} from './hospital-map.config';
import {
  COMISARIA_COLLISIONS,
  COMISARIA_ZONES,
  isComisariaMap,
} from './comisaria-map.config';
import {
  applySceneDisplayLabels,
  buildSceneAmbientObject,
  getSceneAmbientZones,
  getSceneDisplayLabel,
} from './scene-map-display.util';
import {
  effectiveNpcBehavior, freeTileNear, MovementPattern, npcPause, npcSpeed, npcZone,
  reached, resolvePattern, stepToward,
} from './scene-motion.util';
import { nextAmbientStep, npcMotionStrategyFor } from './motion-strategies';
import { SceneGuideEntry } from './scene-guide.config';
import { DEPTH, actorDepth, tiledLayerDepth } from './depth-sort.util';
import {
  AUTHORED_CLINICAL_COLLISIONS,
  AUTHORED_PLAYER_SPAWN,
  AUTHORED_ROOM_HEIGHT,
  AUTHORED_ROOM_WIDTH,
  authoredMarkerPositionForMap,
} from './authored-clinical-room.util';
import { resolveSceneRenderer } from './scene-renderer.registry';
import { caseRoomCollisions } from './case-pdf-rooms.geometry';
import { SceneRenderMetadata } from './scene-layer.types';
import { resolveRoomPlayerPosition } from './room-player-position.util';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MAX_SCREEN_WIDTH_PX,
  MARKER_INTERACT_RADIUS,
  NPC_INTERACT_RADIUS,
  NearbyCandidate,
  NearbyPick,
  labelScaleFor,
  pickNearby,
  selectRevealed,
} from './interaction-priority.util';
import { serverRejectsPlayerAt } from './server-world-geometry.util';
import { InteractionVerb, interactionVerb } from './interaction-verb.util';
import { HOVER_HIT, HoverCandidate, pickHoverTarget } from './world-hover.util';
import { NO_WALK, WALK_GROUND_RADIUS_PX, WalkState, cancelWalkOnKeys, reachRadius, startWalk, tickWalk } from './world-walk.util';
import { InputKind, nextInputKind, touchControlsVisible } from './world-input-kind.util';
import { PlaceCandidate } from './world-places.util';
import { COARSE_POINTER_QUERY, matchesMedia } from './pointer-modality.util';
import {
  NUDGE_SUBSTEPS,
  PlayerDirection,
  PlayerMotionInput,
  computeNudgeStep,
  computePlayerStep,
  playerHitbox,
  rectsIntersect,
  resolveDirection,
  splitFrameDelta,
} from './player-motion.util';
import { EmittedPosition, shouldEmitPosition } from './position-emit.util';
import { heldInput } from './touch-hold.util';
import { attachScrollKeyGuard, isScrollRegionTarget, isTextEntryTarget, resolveInteractPress } from './keyboard-focus.util';
import { isCriticalAsset } from './asset-criticality.util';
import { cameraBounds, integerZoom } from './pixel-scale.util';
import { fitGameToHost, pixelScaleConfig, watchHostSize } from './pixel-canvas';
import { PixelRender } from './pixel-render';
import { doorFacing, doorSpriteSpecs, resolveDoorSideTextureKey, resolveDoorTextureKey } from './door-sprite.util';
import { furnitureSpriteSpecs } from './furniture-sprite.util';
import { CameraFlash, CRISIS_VIGNETTE_TINT, crisisVignetteState, decisionShake, roomEntryFlash, vignetteFrame } from './game-feel.util';
import { objectSpriteSpecs, resolveObjectTextureKey, resolveToolTextureKey } from './object-sprite.util';
import { AVATAR_STORAGE_KEY } from '../character/avatar.store';
import { NpcMotionConfig, NpcMovementZone } from '../../core/models/simulation.model';
import type { KitBundle } from '../character/kit/kit-engine';
import { CharacterRef, CharacterVisual, resolveCharacter } from '../character/kit/character-visual.resolver';
import {
  KIT_ORIGIN_X, KIT_ORIGIN_Y, addComposedSheets, addRgbaTexture, ensureCharacterAnims, kitFrameIndex, kitSheetKey,
  playKitPose, queueCharacterSheets,
} from '../character/kit/kit-phaser';
import { KitService } from '../character/kit/kit.service';
import {
  KIT_HINT_OFFSET_Y, KIT_ICON_OFFSET_Y, KIT_LABEL_OFFSET_Y, PATIENT_RECIPE_ID,
  extrasCharacterRef, guideCharacterRef, markerEmphasis, npcCharacterRef, personCharacterRef, playerCharacterRef,
} from './world-characters.util';
import { PATIENT_ICON_KINDS, patientIconImage, patientIconKey, patientIconKind, patientIconView } from './patient-state-icon.util';
import { DOOR_FALLBACK_HEIGHT, DOOR_SPRITE_FEET_Y, doorHintY, staleSpriteSize, worldSpriteForTexture } from './world-scale.util';

interface WorldCallbacks {
  onReady:       () => void;
  /** Candidato PRINCIPAL en rango (un NPC va como MapObjectState sintético con key `npc:{clave}`); null si no hay. */
  onProximity:   (obj: MapObjectState | null) => void;
  /** Candidato secundario (otra persona u objeto también en rango); null si no hay. */
  onProximityAlso: (obj: MapObjectState | null) => void;
  /** Se pidió interactuar (E o «Interactuar») y no hay nada al alcance. */
  onNothingNearby: () => void;
  onInteract:    (obj: MapObjectState) => void;
  onPosition:    (x: number, y: number) => void;
  /** Posición de cada cuadro con movimiento, sin limitar; se llama fuera de Angular. */
  onPositionFrame: (x: number, y: number) => void;
  onRoomExit:    (targetRoomKey: string, entryX: number, entryY: number) => void;
  onEnterRoom:   (targetNodeKey: string, entryX: number, entryY: number) => void;
  onNpcInteract: (npc: NpcConfig) => void;
  /** El puntero está sobre esta clave (marcador o `npc:{clave}`) o sobre nada (F6-7, VD-5). */
  onHover?:      (key: string | null) => void;
  /** Terminó una caminata pedida con «Ir a…» (F6-11): llegó, o no pudo (muro, mueble, servidor). */
  onWalkEnded?:  (key: string, label: string, outcome: 'arrived' | 'blocked') => void;
  /** Progreso de la precarga, 0-100 (solo la carga inicial). */
  onLoadProgress: (percent: number) => void;
  /** Fin de la precarga; lista las claves esenciales que fallaron (vacía si todo cargó). */
  onLoadComplete: (criticalFailures: string[]) => void;
  reduceMotion:  boolean;
  sfxMuted:       boolean;
  /** Paquete del kit (null si no cargó: los actores caen a su marcador). */
  kit: KitBundle | null;
}

interface AmbientMover {
  key: string;
  origin: { x: number; y: number };
  pattern: MovementPattern;
  target: { x: number; y: number } | null;
  retargetAt: number;
  patrolIdx: number;
}

interface NpcMover {
  key: string;
  cfg: NpcMotionConfig;
  zone: NpcMovementZone;
  target: { x: number; y: number } | null;
  anchorIdx: number;
  pauseUntil: number;
  lastPose: { direction: PlayerDirection | null; walking: boolean };
}


/** Profundidad de los rótulos del mundo: sobre todos los actores y bajo los rótulos de puerta (UI). */
const LABEL_DEPTH = DEPTH.UI - 1;
/** Prefijo de la clave con la que una persona del escenario sale como candidato de proximidad. */
const NPC_KEY_PREFIX = 'npc:';
const NO_KEYS: ReadonlySet<string> = new Set<string>();
/** Anillo estático bajo el siguiente destino del proceso: trazo claro con halo oscuro (contraste en cualquier piso). */
const RING_COLOR = 0xcdbcff;
const RING_HALO_COLOR = 0x0b0f1a;

/** Mismas claves en el mismo orden (listas de a lo sumo cuatro): decide si hay que repintar. */
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DataDrivenWorldScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private playerSprite?: Phaser.GameObjects.Sprite;
  /** Visual del jugador en el kit (null si no hay paquete). */
  private playerVisual: CharacterVisual | null = null;
  /** Último estado clínico recibido: cada icono nace con él (los actores se recrean en cada render). */
  private patientState: import('../../core/models/simulation.model').PatientState | null = null;
  /** Las hojas y animaciones del jugador están listas (si no, marcador geométrico). */
  private playerKitReady = false;
  private lastDirection: PlayerDirection = 'down';
  /** Última pose aplicada — la animación solo cambia si dirección, caminar o movimiento reducido cambiaron. */
  private lastPose: { direction: PlayerDirection | null; walking: boolean; reduce: boolean } = { direction: null, walking: false, reduce: false };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private wallsLayer?: Phaser.Tilemaps.TilemapLayer;
  private scenarioConfig?: ScenarioConfig;
  private currentRoomKey = '';
  private authoredRoomActive = false;
  private dbDoorArmed = true;
  /** Histéresis de puertas BD: dispara al acercarse (≤30) pero solo re-arma al
   *  alejarse bien (≥72). Evita el rebote cuando el punto de entrada de una sala
   *  queda cerca de la puerta de regreso (el armado inmediato disparaba de vuelta). */
  private readonly doorTriggerDist = 30;
  private readonly doorRearmDist = 72;
  private readonly tiledExits   = new Map<string, { x: number; y: number; w: number; h: number }>();
  private readonly npcMarkers   = new Map<string, Phaser.GameObjects.Container>();
  private readonly markers    = new Map<string, Phaser.GameObjects.Container>();
  private readonly markerData = new Map<string, MapObjectState>();
  private readonly markerLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly doorHints  = new Map<string, Phaser.GameObjects.Container>();
  private readonly ambientMovers = new Map<string, AmbientMover>();
  private readonly npcMovers = new Map<string, NpcMover>();
  /** El mundo se congela con diálogo/journal/outcome abiertos (Fase 5/13). */
  private motionPaused = false;
  private readonly AMBIENT_SPEED = 22;        // px/sec — slow, clinical
  private readonly AMBIENT_RETARGET_MS = 2600;
  private guideEntry: SceneGuideEntry | null = null;
  private guideContainer?: Phaser.GameObjects.Container;
  /** Visual del guía actual y su última pose (null = marcador geométrico). */
  private guideVisual: CharacterVisual | null = null;
  private guidePose: { direction: PlayerDirection | null; walking: boolean } = { direction: null, walking: false };
  private guideDirection: PlayerDirection = 'down';
  private guideSprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  private guideBubble?: Phaser.GameObjects.Container;
  private guideTarget: { x: number; y: number } | null = null;
  private guideArrived = false;
  private readonly GUIDE_SPEED = 70;        // px/sec
  private readonly GUIDE_HINT_RANGE = 92;   // px
  private guideBubbleHeight = 0;
  private guideBubbleHalfW = 0;
  private world?: SimulationWorldState;
  /** Clave del candidato PRINCIPAL en rango: la de un marcador o `npc:{clave}`. */
  private nearestKey: string | null = null;
  /** Clave del candidato secundario (otro en rango), o null. */
  private alsoKey: string | null = null;
  private selectedKey: string | null = null;
  /** Siguiente destino del proceso (lo fija Angular): el anillo y el rótulo fijo van ahí. */
  private nextTargetKey: string | null = null;
  private doorStates: Readonly<Record<string, 'open' | 'locked'>> = {};
  /** Objetos de decisión de otras etapas: se atenúan y no llevan anillo. */
  private dimmedKeys: ReadonlySet<string> = NO_KEYS;
  /** Puntero táctil o modo compacto: en los rótulos solo el destino y el más cercano. */
  private compactLabels = false;
  // ── Ratón (F6-7, VD-5): contorno, verbo y cursor solo sobre lo que el jugador ya podría saber ──
  private hoverKey: string | null = null;
  private hoverOutline?: Phaser.GameObjects.Graphics;
  private hoverLabel?: Phaser.GameObjects.Text;
  /** Lo ya examinado (objetos inspeccionados y personas con las que ya habló): se resalta aunque esté lejos. */
  private examinedKeys: ReadonlySet<string> = NO_KEYS;
  /** Caminata pedida con un clic (F6-7): sus «teclas» salen de `tickWalk` y pasan por el movimiento de siempre. */
  private walk: WalkState = NO_WALK;
  /** Destino pedido con «Ir a…» (F6-11): al llegar o rendirse la escena lo avisa; un clic o una tecla lo sueltan. */
  private walkGoal: { key: string; label: string } | null = null;
  /**
   * «Ir a…» pide la caminata MIENTRAS su lista sigue abierta: la escena aún figura pausada (Angular le avisa del cierre
   * en el siguiente ciclo). Esa caminata espera a que se reanude en vez de cancelarse; una pausa que llega con la
   * caminata ya en marcha (un diálogo, la bitácora) sí la suelta.
   */
  private walkWaitsForResume = false;
  private targetRing?: { halo: Phaser.GameObjects.Ellipse; ring: Phaser.GameObjects.Ellipse };
  /** Escala de los rótulos para medir ≥ 12 px de pantalla; se recalcula al cambiar el tamaño del canvas. */
  private labelScale = 1;
  /** Ancho de ajuste de línea de los rótulos de objetos (coordenadas locales del texto). */
  private labelWrap = 140;
  /** Lista de trabajo de la proximidad y sus piezas: se reutilizan, nada se asigna por cuadro. */
  private readonly candidates: NearbyCandidate[] = [];
  private readonly candidatePool: NearbyCandidate[] = [];
  private readonly pick: NearbyPick = { primary: null, secondary: null };
  /** Rótulos visibles ahora y su arreglo de trabajo: solo se repinta cuando el conjunto cambia. */
  private revealed: string[] = [];
  private revealScratch: string[] = [];
  private readonly npcKeys = new Map<string, string>();
  /** Claves de los rótulos visibles cuyo dueño se desplaza: son los únicos que se recolocan por cuadro. */
  private readonly followLabels: string[] = [];
  private ready = false;
  /** Vértices al píxel con zoom de cámara (PHA-1) y resolución de los textos (PHA-2). */
  private pixelRender?: PixelRender;
  private assetsLoaded = false;
  private firstSceneFadeDone = false;
  /** stressIndex del intento (0-100); lo fija Angular y sobrevive a los re-render. */
  private stressLevel = 0;
  /** Capa de crisis sobre la viñeta de tono; se recrea en cada render. */
  private crisisVignette?: Phaser.GameObjects.Graphics;
  /** Sala que encuadra la cámara: el zoom entero se recalcula con ella al cambiar el lienzo. */
  private roomSize = { width: AUTHORED_ROOM_WIDTH, height: AUTHORED_ROOM_HEIGHT };
  /** Viñeta de tono de la sala actual (se redibuja al rectángulo visible si cambia el lienzo). */
  private toneVignette?: Phaser.GameObjects.Graphics;
  private crisisPulse?: Phaser.Tweens.Tween;
  /** Último estado de crisis aplicado; evita reiniciar un pulso que no cambió. */
  private crisisStateKey = '';
  /** Destello decidido al cambiar de sala; se dispara al terminar el render. */
  private pendingRoomFlash: CameraFlash | null = null;
  private stepTimer = 0;
  private readonly STEP_INTERVAL = 280; // ms — natural walking cadence (~215 steps/min)
  /** Última posición avisada a Angular (ver position-emit.util). */
  private lastEmittedPosition: EmittedPosition | null = null;
  /** Hay movimiento que la limitación de frecuencia todavía no avisó. */
  private positionDirty = false;
  private interactionCooldown = 0;
  /** Pulsación de interactuar que espera a que termine el enfriamiento. */
  private interactPending = false;
  /** `down` recibido de E, Espacio y Enter desde el último cuadro (ver `create()`). */
  private readonly tappedKeys = { e: false, space: false, enter: false };
  private readonly INTERACTION_COOLDOWN_MS = 260;
  /** Flecha táctil apretada (null si no hay ninguna) y desde cuándo (reloj de la escena). */
  private heldDirection: PlayerDirection | null = null;
  private heldSince = 0;

  constructor(private readonly callbacks: WorldCallbacks) {
    super('data-driven-world');
  }

  preload() {
    // Cargas posteriores (hojas bajo demanda) no deben reabrir la capa de carga:
    // por eso ambos oyentes ignoran lo que llega después de la carga inicial.
    const criticalFailures: string[] = [];
    let lastPercent = -1;
    this.load.on('progress', (value: number) => {
      if (this.assetsLoaded) return;
      const percent = Math.round(value * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      this.callbacks.onLoadProgress(percent);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // Lo decorativo cae a su respaldo; un mapa o tileset deja la sala en paneles planos.
      if (!this.assetsLoaded && isCriticalAsset(file.key)) criticalFailures.push(file.key);
    });

    // ── Plain images for Tiled tilemap layer rendering (all 3 Kenney packs) ──
    // tiny-dungeon: 12×11 = 132 tiles  (GID  1–132)
    // tiny-town:    12×11 = 132 tiles  (GID  133–264)
    // rpg-urban:    27×18 = 486 tiles  (GID  265–750)
    this.load.image('dungeon-img', '/assets/game/kenney/tiny-dungeon/Tilemap/tilemap_packed.png');
    this.load.image('town-img',   '/assets/game/kenney/tiny-town/Tilemap/tilemap_packed.png');
    this.load.image('rpg-img',    '/assets/game/kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png');

    // Dungeon spritesheet (used for interactive object marker icons)
    this.load.spritesheet('dungeon-tiles',
      '/assets/game/kenney/tiny-dungeon/Tilemap/tilemap_packed.png',
      { frameWidth: 16, frameHeight: 16 });

    // ── Jugador del kit (spec §8.2): receta publicada (PNG) o avatar compuesto (lienzo) ──
    const kit = this.callbacks.kit;
    if (kit) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(AVATAR_STORAGE_KEY) : null;
      this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));
      queueCharacterSheets(this, this.playerVisual);
      // NPC, personas, guía y figurantes: todas las recetas que no son jugables (unos 14 personajes).
      for (const [recipeId, recipe] of Object.entries(kit.recipes)) {
        if (recipe.kind !== 'jugable') queueCharacterSheets(this, resolveCharacter(kit, { kind: 'receta', recipeId }));
      }
    }

    // ── Sprites pixel-art de objetos (herramientas + escenario), puertas y mobiliario; fallback si faltan ──
    for (const spec of [...objectSpriteSpecs(), ...doorSpriteSpecs(), ...furnitureSpriteSpecs()]) {
      this.load.image(spec.textureKey, spec.assetPath);
    }

    // Tiled JSON maps — all known scenario keys (missing ones fail silently)
    // Rename the Tiled object "name" field to match your backend object keys.
    const scenarioKeys = [
      'urgencias-crisis', 'ruta-proteccion', 'informe-integral',
      'valoracion-comisaria', 'proteccion-nna', 'cierre-seguimiento'
    ];
    for (const key of scenarioKeys) {
      this.load.tilemapTiledJSON(`map-${key}`, `/assets/game/maps/${key}.json`);
    }

    // Multi-room maps — comisaria-familia pilot + 5 remaining scenarios
    const roomMapKeys = [
      'comisaria-sala-espera',
      'comisaria-consultorio',
      'comisaria-supervisor',
      // single-room scenario halls
      'urgencias-sala',
      'ruta-sala',
      'informe-oficina',
      'nna-sala',
      'cierre-sala',
    ];
    for (const key of roomMapKeys) {
      this.load.tilemapTiledJSON(`map-${key}`, `/assets/game/maps/${key}.json`);
    }

    // ── Audio: Kenney Foley footsteps + Interface Sounds blip (CC0) ──────────
    // Missing files fail silently via the 'loaderror' handler above — no crash.
    this.load.audio('step0', '/assets/game/audio/footstep_concrete_000.ogg');
    this.load.audio('step1', '/assets/game/audio/footstep_concrete_001.ogg');
    this.load.audio('step2', '/assets/game/audio/footstep_concrete_002.ogg');
    this.load.audio('proximity-blip', '/assets/game/audio/blip_select.ogg');

    this.load.once('complete', () => {
      this.assetsLoaded = true;
      this.callbacks.onLoadComplete(criticalFailures);
    });
  }

  create() {
    this.pixelRender = new PixelRender(this).attach();
    this.ready = true;
    // Phaser solo LEE las teclas: sin captura no llama a `preventDefault`, así el navegador
    // conserva Enter/Espacio en los botones y todas las teclas en el textarea de la bitácora.
    // `createCursorKeys` captura flechas, Espacio y Shift por su cuenta (de ahí el apagado
    // global); `update()` ignora lo que corresponda según el elemento con foco.
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.disableGlobalCapture();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,E,SPACE,ENTER', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.playerKitReady = this.playerVisual !== null && ensureCharacterAnims(this, this.playerVisual);
    for (const kind of PATIENT_ICON_KINDS) addRgbaTexture(this, patientIconKey(kind), patientIconImage(kind));
    // Un toque corto (keydown y keyup en el mismo cuadro, habitual con pocos fps) deja `JustDown` en falso
    // y la pulsación se perdía junto a una persona (T0.2): el evento `down` de la tecla sí llega siempre.
    this.keys['E']?.on('down', () => { this.tappedKeys.e = true; });
    this.keys['SPACE']?.on('down', () => { this.tappedKeys.space = true; });
    this.keys['ENTER']?.on('down', () => { this.tappedKeys.enter = true; });
    // Ratón (F6-7): por eventos del puntero, nunca por cuadro (`update()` no cambia).
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('gameout', () => this.setHover(null));
    // Al cambiar el tamaño o el dpr del lienzo: nuevo zoom entero y rótulos de ≥ 12 px de pantalla.
    this.scale.on('resize', () => this.refitCamera());
    this.scale.on('resize', this.onScaleResize, this);
    this.onScaleResize();
    this.renderWorld();
  }

  /** Publica la posición: al DOM en cada cuadro (contrato del e2e) y a Angular como
   *  mucho cada POSITION_EMIT_INTERVAL_MS. `force` salta el intervalo (fin de un
   *  movimiento, nudge táctil). */
  private emitPosition(force = false): void {
    if (!this.player) return;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    this.callbacks.onPositionFrame(x, y);
    const last = this.lastEmittedPosition;
    if (last && last.x === x && last.y === y) {
      this.positionDirty = false;
      return;
    }
    const now = this.time.now;
    if (!force && !shouldEmitPosition(last, x, y, now)) {
      this.positionDirty = true;
      return;
    }
    this.positionDirty = false;
    this.lastEmittedPosition = { x, y, at: now };
    this.callbacks.onPosition(x, y);
  }

  /** Al dejar de avanzar, la última posición se avisa exacta: es la que se persiste. */
  private flushPosition(): void {
    if (this.positionDirty) this.emitPosition(true);
  }

  override update(time: number, delta: number) {
    if (!this.player || !this.cursors || !this.keys || !this.world) {
      this.tappedKeys.e = this.tappedKeys.space = this.tappedKeys.enter = false;
      return;
    }
    // Sin captura de Phaser, las teclas también llegan mientras se escribe en la bitácora o se
    // activa un botón. El foco se lee una vez por cuadro y decide qué teclas cuentan.
    const focus = document.activeElement;
    // Escribiendo o con el foco en una región con scroll (sus flechas la desplazan, H-12) el jugador no camina.
    const typing = isTextEntryTarget(focus) || isScrollRegionTarget(focus);
    const keyInput: PlayerMotionInput = heldInput({
      left:  !typing && (this.cursors.left.isDown  || this.keys['A'].isDown),
      right: !typing && (this.cursors.right.isDown || this.keys['D'].isDown),
      up:    !typing && (this.cursors.up.isDown    || this.keys['W'].isDown),
      down:  !typing && (this.cursors.down.isDown  || this.keys['S'].isDown),
    }, this.heldDirection, this.time.now - this.heldSince);
    // Caminata del ratón (F6-7): el teclado o la cruceta mandan sobre el destino y una capa abierta lo suelta.
    // Lo que pide pasa por el mismo paso con colisión y deslizamiento que el teclado.
    let input = keyInput;
    if (this.walk.target) {
      if (this.motionPaused && this.walkWaitsForResume) {
        // Pedida desde una lista que se está cerrando: espera, sin soltarse ni mover al jugador.
      } else {
        this.walkWaitsForResume = false;
        this.walk = this.motionPaused ? NO_WALK : cancelWalkOnKeys(this.walk, keyInput);
        if (this.walk.target) {
          const tick = tickWalk(this.walk, { x: this.player.x, y: this.player.y }, delta);
          this.walk = tick.state;
          input = tick.input;
          if (tick.arrived || tick.gaveUp) this.finishWalkGoal(tick.arrived ? 'arrived' : 'blocked');
        } else {
          this.walkGoal = null; // lo soltaron las teclas o una capa: nadie espera un aviso de llegada
        }
      }
    }
    // Helper puro (player-motion.util): normaliza diagonal, limita delta y
    // resuelve dirección estable (sin parpadeo diagonal).
    const step = computePlayerStep(input, this.lastDirection, delta);

    if (step.moving) {
      // Sub-pasos con colisión: misma velocidad real a cualquier fps.
      let moved = false;
      for (const subDelta of splitFrameDelta(delta)) {
        const part = computePlayerStep(input, this.lastDirection, subDelta);
        moved = this.movePlayer(part.dx, part.dy) || moved;
      }
      this.lastDirection = step.direction;
      if (moved) {
        this.emitPosition();
        this.applyPlayerPose(step.direction, true);
        // ── Footstep audio: one random variant every STEP_INTERVAL ms ────────
        if (!this.callbacks.reduceMotion && !this.callbacks.sfxMuted) {
          this.stepTimer += delta;
          if (this.stepTimer >= this.STEP_INTERVAL) {
            this.stepTimer = 0;
            this.sound.play(`step${Phaser.Math.Between(0, 2)}`, { volume: 0.35 });
          }
        }
      } else {
        // Bloqueado del todo contra pared/mueble: sin avance real no debe
        // correr la animación de caminata (ni sonar pasos).
        this.flushPosition();
        this.applyPlayerPose(step.direction, false);
      }
    } else {
      this.stepTimer = this.STEP_INTERVAL; // prime timer: first step fires on frame 1 of movement, not after a full interval
      this.flushPosition();
      this.applyPlayerPose(this.lastDirection, false);
    }

    this.interactionCooldown = Math.max(0, this.interactionCooldown - delta);
    // JustDown se lee SIEMPRE, los tres, aunque el resultado se descarte: `Key._justDown` sigue
    // en true hasta que alguien lo lee, y una «e» escrita en la bitácora dispararía
    // `interactNearest()` en cuanto el foco saliera del campo.
    const pressed = resolveInteractPress(focus, {
      e: Phaser.Input.Keyboard.JustDown(this.keys['E']),
      space: Phaser.Input.Keyboard.JustDown(this.keys['SPACE']),
      enter: Phaser.Input.Keyboard.JustDown(this.keys['ENTER']),
    });
    // El toque corto cuenta igual que `JustDown` (mismas reglas de foco) y se consume en este cuadro.
    const tapped = resolveInteractPress(focus, this.tappedKeys);
    this.tappedKeys.e = this.tappedKeys.space = this.tappedKeys.enter = false;
    // Una pulsación durante el enfriamiento espera a que termine (como cuando JustDown
    // quedaba sin leer); al escribir, cualquier pulsación pendiente se descarta.
    this.interactPending = !typing && (this.interactPending || pressed || tapped);
    if (this.interactPending && this.interactionCooldown <= 0) {
      this.interactPending = false;
      this.interactionCooldown = this.INTERACTION_COOLDOWN_MS;
      this.interactNearest();
    }
    this.updateNearestInteraction();
    this.updateAmbientMovers(time, delta);
    this.updateNpcMovers(time, delta);
    this.updateGuide(delta);
    // 2.5D: re-ordena por Y a los actores que se mueven
    if (this.player) this.ysort(this.player);
    if (this.guideContainer) this.ysort(this.guideContainer);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (marker) this.ysort(marker);
    }
    for (const container of this.npcMarkers.values()) this.ysort(container);
    this.checkExitTriggers();
    this.checkDbDoorTriggers();
  }

  setWorld(world: SimulationWorldState) {
    this.pendingRoomFlash = roomEntryFlash(this.world?.map.key ?? null, world.map.key, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
    // Cambio de mapa (decisión o puerta): la sala previa ya no aplica. Sin este
    // reset, keepPosition "conserva" la posición del render transicional y se
    // pierde la entrada (entryX/entryY) que enter_room persistió en world.player.
    // La primera hidratación también nace desarmada: una recarga puede restaurar
    // al jugador junto a la puerta de regreso antes de resolver ScenarioConfig.
    if (!this.world || this.world.map.key !== world.map.key) {
      this.currentRoomKey = '';
      // Recién entrado a una sala: desarmar hasta alejarse de la puerta de regreso
      // (la histéresis de checkDbDoorTriggers re-arma al superar doorRearmDist).
      this.dbDoorArmed = false;
    }
    this.world = world;
    this.nearestKey = null;
    this.alsoKey = null;
    this.callbacks.onProximity(null);
    this.callbacks.onProximityAlso(null);
    if (this.ready) this.renderWorld();
  }

  setScenarioConfig(config: ScenarioConfig | null) {
    this.scenarioConfig = config ?? undefined;
    if (this.ready && this.world) this.renderWorld();
  }

  /** Pausa el movimiento del mundo (NPCs y ambient) sin congelar al jugador. */
  setMotionPaused(paused: boolean) {
    this.motionPaused = paused;
    if (paused) {
      this.setHeldDirection(null); // un overlay tapa los controles: no seguir caminando detrás
      this.setHover(null);
    }
    this.applyCrisisState();
  }

  /** Flecha táctil apretada o soltada (null). La entrada de `update()` la suma pasado TOUCH_HOLD_DELAY_MS. */
  setHeldDirection(direction: PlayerDirection | null) {
    this.heldDirection = direction;
    // `boot()` y `ngOnChanges` pueden pausar antes de que Phaser arranque la escena (sin reloj aún).
    this.heldSince = direction && this.time ? this.time.now : 0;
  }

  setReduceMotion(reduced: boolean) {
    this.callbacks.reduceMotion = reduced;
    this.applyCrisisState();
  }

  /** Seguro antes de `create()`: la capa se pinta con este valor en el primer render. */
  setStressLevel(level: number) {
    this.stressLevel = level;
    this.applyCrisisState();
  }

  /** Sacudida de cámara por una decisión de alto impacto (nada con movimiento reducido). */
  playDecisionImpact(feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null): void {
    const shake = decisionShake(feedback, this.callbacks.reduceMotion);
    if (shake && this.ready && this.cameras?.main) this.cameras.main.shake(shake.durationMs, shake.intensity);
  }

  /**
   * La sala ya se ve: sacudida si la decisión fue de alto impacto; si no, el destello de
   * cambio de sala. Nunca los dos a la vez.
   */
  playRevealEffects(feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null): void {
    if (decisionShake(feedback, this.callbacks.reduceMotion)) {
      this.pendingRoomFlash = null;
      this.playDecisionImpact(feedback);
    } else {
      this.playPendingRoomFlash();
    }
  }

  setSfxMuted(muted: boolean) {
    this.callbacks.sfxMuted = muted;
    const sound = this.sound as Phaser.Sound.BaseSoundManager | undefined;
    if (!sound) return;
    try {
      sound.mute = muted;
    } catch {
      // Phaser can call this after the scene has been destroyed during route changes.
    }
  }

  /**
   * Called by Angular when the player steps through an exit.
   * Fades out, loads the new room, fades back in.
   */
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    if (!this.scenarioConfig) return;
    const roomConfig = this.scenarioConfig.rooms.find(r => r.key === targetRoomKey);
    if (!roomConfig) return;
    this.pendingRoomFlash = roomEntryFlash(this.currentRoomKey || null, targetRoomKey, this.callbacks.reduceMotion)
      ?? this.pendingRoomFlash;
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.renderRoom(roomConfig, entryX, entryY);
      this.cameras.main.fadeIn(180, 0, 0, 0);
      // El destello espera a que el fundido deje ver la sala: debajo de él no se percibe.
      this.cameras.main.once('camerafadeincomplete', () => this.playPendingRoomFlash());
    });
  }

  setSelected(key: string | null) {
    this.selectedKey = key;
    this.refreshMarkerStates();
  }

  setGuide(entry: SceneGuideEntry | null) {
    this.guideEntry = entry;
    if (this.ready && this.world) this.buildGuide();
  }

  /** Builds (or rebuilds) the guide NPC for the current node + markers. */
  private buildGuide() {
    this.guideContainer?.destroy();
    this.guideContainer = undefined;
    this.guideBubble = undefined;
    this.guideSprite = undefined;
    this.guideVisual = null;
    this.guideTarget = null;
    this.guideArrived = false;

    const entry = this.guideEntry;
    if (!entry) return;

    // Resolve the target tool's on-screen position from its marker (already
    // merged with any Tiled position); fall back to the raw object data.
    const targetMarker = this.markers.get(entry.targetKey);
    const targetData = this.markerData.get(entry.targetKey);
    const targetPos = targetMarker
      ? { x: targetMarker.x, y: targetMarker.y }
      : targetData ? { x: targetData.x, y: targetData.y } : null;

    const kit = this.callbacks.kit;
    const visual = kit ? this.actorVisual(guideCharacterRef(kit, entry.guideName)) : null;
    const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, 0.2);
    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
    if (visual) {
      sprite = this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
    } else {
      sprite = this.add.circle(0, -20, 9, 0x8a6cff, 1).setStrokeStyle(2, 0xffffff, 0.9);
    }
    const name = this.add.text(0, KIT_LABEL_OFFSET_Y, entry.guideName, {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#cdd9ff',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
    }).setOrigin(0.5, 1);

    this.guideContainer = this.add.container(entry.spawnX, entry.spawnY, [shadow, sprite, name]);
    this.setFeetOffset(this.guideContainer, 0);
    this.guideSprite = sprite;
    this.guideVisual = visual;
    this.guidePose = { direction: null, walking: false };
    this.guideDirection = 'down';
    this.applyGuidePose('down', false);
    this.guideBubble = this.buildGuideBubble(entry.hint);

    this.guideTarget = targetPos
      ? freeTileNear(targetPos, (x, y) => this.wouldCollide(x, y), 26, 3)
      : null;

    if (this.callbacks.reduceMotion) {
      // No walking — place beside the target and show the hint statically.
      if (this.guideTarget) this.guideContainer.setPosition(this.guideTarget.x, this.guideTarget.y);
      this.guideArrived = true;
      this.showGuideBubble(true);
    }
  }

  /** Pose del guía (camina hacia la herramienta, reposa de frente al llegar), solo si cambió. */
  private applyGuidePose(direction: PlayerDirection, walking: boolean): void {
    if (this.guidePose.direction === direction && this.guidePose.walking === walking) return;
    this.guidePose = { direction, walking };
    if (this.guideVisual && this.guideSprite instanceof Phaser.GameObjects.Sprite) {
      playKitPose(this.guideSprite, this.guideVisual, direction, walking, this.callbacks.reduceMotion);
    }
  }

  private buildGuideBubble(hint: string): Phaser.GameObjects.Container {
    const text = this.add.text(0, 0, hint, {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#eef3ff',
      align: 'center', wordWrap: { width: 168 }, padding: { x: 8, y: 6 },
    }).setOrigin(0.5, 1);
    const b = text.getBounds();
    const bg = this.add.rectangle(0, 0, b.width + 16, b.height + 12, 0x141b2e, 0.94)
      .setStrokeStyle(1, 0x6f7cff, 0.6).setOrigin(0.5, 1);
    this.guideBubbleHeight = b.height + 12;
    this.guideBubbleHalfW = (b.width + 16) / 2;
    return this.add.container(0, 0, [bg, text]).setDepth(DEPTH.UI).setVisible(false);
  }

  private showGuideBubble(show: boolean) {
    if (!this.guideBubble || !this.guideContainer) return;
    if (!show) { this.guideBubble.setVisible(false); return; }
    // The bubble is bottom-anchored at (x, y); keep the whole bubble inside the
    // camera's visible world rect so it never clips at an edge.
    const view = this.cameras.main.worldView;
    const margin = 6;
    const x = Phaser.Math.Clamp(
      this.guideContainer.x,
      view.left + this.guideBubbleHalfW + margin,
      view.right - this.guideBubbleHalfW - margin,
    );
    const bottomY = Phaser.Math.Clamp(
      this.guideContainer.y + KIT_LABEL_OFFSET_Y - 4,
      view.top + margin + this.guideBubbleHeight,
      view.bottom - margin,
    );
    this.guideBubble.setPosition(x, bottomY).setVisible(true);
  }

  private updateGuide(delta: number) {
    if (!this.guideContainer || !this.guideEntry) return;

    if (!this.callbacks.reduceMotion && !this.guideArrived && this.guideTarget) {
      const step = this.GUIDE_SPEED * (delta / 1000);
      const next = stepToward(this.guideContainer, this.guideTarget, step);
      this.guideDirection = resolveDirection(next.x - this.guideContainer.x, next.y - this.guideContainer.y, this.guideDirection);
      // Straight-line move with collision slide (consistent with player movement).
      if (!this.wouldCollide(next.x, next.y)) {
        this.guideContainer.setPosition(next.x, next.y);
      } else if (!this.wouldCollide(next.x, this.guideContainer.y)) {
        this.guideContainer.setPosition(next.x, this.guideContainer.y);
      } else if (!this.wouldCollide(this.guideContainer.x, next.y)) {
        this.guideContainer.setPosition(this.guideContainer.x, next.y);
      } else {
        this.guideArrived = true;   // fully blocked — stop at the nearest free spot
      }
      if (reached(this.guideContainer, this.guideTarget, 3)) this.guideArrived = true;
      this.applyGuidePose(this.guideArrived ? 'down' : this.guideDirection, !this.guideArrived);
    }

    if (this.player && !this.callbacks.reduceMotion) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.guideContainer.x, this.guideContainer.y,
      );
      this.showGuideBubble(d <= this.GUIDE_HINT_RANGE);
    }
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') {
    if (!this.player) return;
    this.walk = NO_WALK; // un paso de la cruceta manda sobre el destino del ratón
    this.walkGoal = null;
    // Mismo contrato que WASD (player-motion.util): sub-pasos con colisión y
    // sliding, pose/dirección estables, sin caminar en el sitio contra paredes.
    let moved = false;
    for (let i = 0; i < NUDGE_SUBSTEPS; i++) {
      const step = computeNudgeStep(direction, this.lastDirection);
      if (!this.movePlayer(step.dx, step.dy)) break;
      moved = true;
    }
    this.lastDirection = direction;
    this.applyPlayerPose(direction, moved); // el update() del frame siguiente vuelve a idle
    if (moved) {
      // Cada toque es un paso discreto: se avisa siempre, sin esperar el intervalo.
      this.emitPosition(true);
      this.ysort(this.player);
    }
    this.updateNearestInteraction();
  }

  /** Punto de pies actual (px enteros) o null si el jugador aún no existe. */
  playerPosition(): { x: number; y: number } | null {
    return this.player ? { x: Math.round(this.player.x), y: Math.round(this.player.y) } : null;
  }

  /**
   * Actúa sobre el candidato principal, despachando por su clave: una persona (`npc:{clave}`) abre su
   * conversación y un marcador sigue el camino de siempre. Sin nada al alcance avisa una sola vez, sin
   * sonido de error (F-14): quien escucha decide cómo decirlo.
   */
  interactNearest() {
    const key = this.nearestKey;
    if (key !== null) {
      if (key.startsWith(NPC_KEY_PREFIX)) {
        const npc = this.npcConfigFor(key);
        if (npc) { this.callbacks.onNpcInteract(npc); return; }
      } else {
        const obj = this.proximityObjectFor(key);
        if (obj) { this.callbacks.onInteract(obj); return; }
      }
    }
    this.callbacks.onNothingNearby();
  }

  /** Siguiente destino, puertas y objetos atenuados (los fija Angular); repinta solo lo que cambió. */
  setOrientation(next: {
    nextTargetKey: string | null;
    doorStates: Readonly<Record<string, 'open' | 'locked'>>;
    dimmedKeys: ReadonlySet<string>;
  }): void {
    const targetChanged = next.nextTargetKey !== this.nextTargetKey;
    const dimmedChanged = next.dimmedKeys !== this.dimmedKeys;
    const doorsChanged = next.doorStates !== this.doorStates;
    this.nextTargetKey = next.nextTargetKey;
    this.doorStates = next.doorStates;
    this.dimmedKeys = next.dimmedKeys;
    if (!this.ready || !this.world) return;
    if (doorsChanged) this.applyDoorStates();
    if (targetChanged || dimmedChanged) this.syncTargetRing();
    // El conjunto de rótulos puede cambiar sin que el jugador se mueva (nuevo destino u objeto atenuado).
    this.updateNearestInteraction(true);
    this.refreshMarkerStates();
  }

  /** Puntero táctil o ventana compacta: rótulos mínimos (destino y el más cercano). */
  setCompactLabels(compact: boolean): void {
    this.compactLabels = compact || this.touchPointer();
  }

  /** Lo ya examinado llega de Angular: objetos inspeccionados y personas con las que ya se habló (`npc:{clave}`). */
  setExamined(keys: ReadonlySet<string>): void {
    this.examinedKeys = keys;
  }

  /**
   * El puntero se mueve (F6-7, VD-5). Con dedo no hay «pasar por encima» y con una capa abierta el mundo no
   * responde. Solo se resalta lo que el jugador ya podría saber (`pickHoverTarget`: dentro del radio de percepción
   * o ya examinado): nada por descubrir se ilumina. Va por eventos del puntero, nunca por cuadro.
   */
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || this.motionPaused || !this.player || !this.world) {
      this.setHover(null);
      return;
    }
    const px = this.player.x;
    const py = this.player.y;
    const candidates: HoverCandidate[] = [];
    this.markers.forEach((marker, key) => {
      const obj = this.markerData.get(key);
      if (!obj || !this.isInteractive(obj)) return;
      const moving = this.ambientMovers.has(key);
      const x = moving ? marker.x : obj.x;
      const y = moving ? marker.y : obj.y;
      candidates.push({ key, x, y, playerDistance: Math.hypot(px - x, py - y) });
    });
    this.npcMarkers.forEach((container, key) => {
      candidates.push({
        key: this.npcKeyOf(key), x: container.x, y: container.y,
        playerDistance: Math.hypot(px - container.x, py - container.y),
      });
    });
    this.setHover(pickHoverTarget({ x: pointer.worldX, y: pointer.worldY }, candidates, this.examinedKeys));
  }

  private setHover(key: string | null): void {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.drawHover();
    // `input` ya no existe tras destruir la escena (cambio de ruta): el cursor se deja como esté.
    this.input?.setDefaultCursor(key === null ? 'default' : 'pointer');
    this.callbacks.onHover?.(key);
  }

  /** Dónde y con qué verbo se anuncia lo que tiene el puntero encima (el mismo verbo que la barra de contexto). */
  private hoverAnchor(key: string): { x: number; y: number; verb: InteractionVerb; reach: number; label: string } | null {
    const obj = this.proximityObjectFor(key);
    if (!obj) return null;
    let x = obj.x;
    let y = obj.y;
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      if (!container) return null;
      x = container.x;
      y = container.y;
    } else {
      const marker = this.markers.get(key);
      if (!marker) return null;
      if (this.ambientMovers.has(key)) { x = marker.x; y = marker.y; }
    }
    const state = obj.type === 'EXIT' ? this.doorStates[key] : undefined;
    const door = state ? { state, missing: [], stageLocked: false, message: null } : null;
    const radius = key.startsWith(NPC_KEY_PREFIX) ? NPC_INTERACT_RADIUS : MARKER_INTERACT_RADIUS;
    return { x, y, verb: interactionVerb(obj, door), reach: reachRadius(radius), label: obj.label };
  }

  /**
   * Lo que «Ir a…» puede ofrecer en la sala actual (F6-11): las personas, las puertas y los objetos con los que se
   * puede actuar. La regla de lo examinado la aplica quien muestra la lista (`selectPlaces`): aquí no se filtra por
   * lo que el jugador sabe y no sale nada clínico, solo clave, nombre y tipo.
   */
  placeCandidates(): PlaceCandidate[] {
    const out: PlaceCandidate[] = [];
    this.npcMarkers.forEach((_container, key) => {
      const candidateKey = this.npcKeyOf(key);
      const npc = this.npcConfigFor(candidateKey);
      if (npc) out.push({ key: candidateKey, label: npc.displayName, kind: 'person' });
    });
    const mapKey = this.world?.map.key ?? '';
    this.markers.forEach((_marker, key) => {
      const obj = this.markerData.get(key);
      if (!obj || !this.isInteractive(obj)) return;
      out.push({
        key,
        label: getSceneDisplayLabel(obj, mapKey),
        kind: obj.type === 'EXIT' ? 'door' : obj.type === 'PERSON' ? 'person' : 'object',
      });
    });
    return out;
  }

  /** Camina hasta lo elegido en «Ir a…» (F6-11) y lo avisa al llegar o si no pudo. false si ya no está en la sala. */
  walkToKey(key: string): boolean {
    const anchor = this.player ? this.hoverAnchor(key) : null;
    if (!anchor) return false;
    this.walkGoal = { key, label: anchor.label };
    this.walkWaitsForResume = this.motionPaused;
    this.walk = startWalk({ x: anchor.x, y: anchor.y, radius: anchor.reach });
    return true;
  }

  private finishWalkGoal(outcome: 'arrived' | 'blocked'): void {
    const goal = this.walkGoal;
    this.walkGoal = null;
    if (goal) this.callbacks.onWalkEnded?.(goal.key, goal.label, outcome);
  }

  /**
   * Clic con el puntero fino (F6-7, VD-5): el jugador camina hasta ahí; sobre algo señalado, hasta su alcance de
   * interacción (la barra de contexto ofrece entonces la acción de siempre). Con dedo, con una capa abierta o con
   * un botón que no es el principal no camina. La caminata la aplica `update()` con el movimiento del teclado.
   */
  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || this.motionPaused || !this.player || !this.world) return;
    if (pointer.button !== 0) return;
    const aimed = this.hoverKey === null ? null : this.hoverAnchor(this.hoverKey);
    this.walkGoal = null;
    this.walkWaitsForResume = false;
    this.walk = aimed
      ? startWalk({ x: aimed.x, y: aimed.y, radius: aimed.reach })
      : startWalk({ x: pointer.worldX, y: pointer.worldY, radius: WALK_GROUND_RADIUS_PX });
  }

  /** Contorno y verbo sobre lo señalado: la forma (borde y texto) lleva el mensaje, no solo el color. */
  private drawHover(): void {
    const anchor = this.hoverKey === null ? null : this.hoverAnchor(this.hoverKey);
    if (!anchor) {
      this.hoverOutline?.setVisible(false);
      this.hoverLabel?.setVisible(false);
      return;
    }
    const outline = this.hoverOutline?.active
      ? this.hoverOutline
      : (this.hoverOutline = this.add.graphics().setDepth(LABEL_DEPTH));
    const left = anchor.x - HOVER_HIT.halfWidth;
    const top = anchor.y - HOVER_HIT.above;
    const width = HOVER_HIT.halfWidth * 2;
    const height = HOVER_HIT.above + HOVER_HIT.below;
    outline.clear();
    outline.lineStyle(4, RING_HALO_COLOR, 0.85).strokeRect(left - 1, top - 1, width + 2, height + 2);
    // Una puerta bloqueada lo dice también en el rótulo: el contorno no depende solo del color.
    outline.lineStyle(2, RING_COLOR, 1).strokeRect(left, top, width, height);
    outline.setVisible(true);

    const label = this.hoverLabel?.active
      ? this.hoverLabel
      : (this.hoverLabel = this.add.text(0, 0, '', {
          fontFamily: 'Arial, sans-serif', fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#e8f0f4',
          backgroundColor: 'rgba(8,12,18,.9)', padding: { x: 4, y: 3 }, align: 'center',
        }).setOrigin(0.5, 1).setScale(this.labelScale).setDepth(LABEL_DEPTH));
    label.setText(anchor.verb.locked ? `${anchor.verb.text} · bloqueada` : anchor.verb.text);
    label.setPosition(anchor.x, top - 4).setVisible(true);
  }

  focus(key: string) {
    const m = this.markers.get(key);
    if (!m || this.callbacks.reduceMotion) return;
    // Un marcador con sprite de pixel art (una persona del kit, una puerta, una herramienta) no se
    // escala: el pulso va a su anillo.
    const bag = m as unknown as Record<string, unknown>;
    const target = bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m;
    this.tweens.add({ targets: target, scale: 1.16, duration: 140, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
  }

  /** Fase 4: draws the authored per-room background image (world.map.ambient.backgroundImage)
   *  over the procedural floor. No-op if none; safe on load failure (procedural floor remains). */
  private applyAuthoredBackground(mapW: number, mapH: number): void {
    const url = backgroundImage(this.world?.map.ambient);
    if (!url) return;
    const key = `authored-bg-${url}`;
    const place = () => {
      if (!this.textures.exists(key)) return;
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(mapW, mapH).setDepth(1);
    };
    if (this.textures.exists(key)) { place(); return; }
    this.load.image(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, place);
    this.load.start();
  }

  /**
   * Crea las capas de tiles de un Tilemap aplicando las bandas 2.5D
   * (floor, props_back, walls_back/walls, props_front, lighting, overlay).
   * La capa de paredes alimenta `this.wallsLayer` para colisión.
   * Retrocompatible: mapas con solo `Floor`/`Walls` se comportan igual que antes.
   */
  private buildTiledLayers(
    tilemap: Phaser.Tilemaps.Tilemap,
    tilesets: Phaser.Tilemaps.Tileset[],
  ): void {
    for (const layerData of tilemap.layers) {
      const depth = tiledLayerDepth(layerData.name);
      if (depth === null) continue;
      // Sin el parámetro `gpu` (Phaser 4), createLayer() siempre crea la variante CPU clásica;
      // el tipo de retorno es la unión TilemapLayer | TilemapGPULayer solo porque la firma no
      // tiene sobrecargas para distinguirlo según ese argumento.
      const layer = tilemap.createLayer(layerData.name, tilesets) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer) continue;
      layer.setDepth(depth);
      // La capa de paredes (legacy `Walls` o `walls_back`/`collision`) es la sólida.
      const norm = layerData.name.trim().toLowerCase().replace(/^\d+[_-]?/, '');
      if (norm === 'walls' || norm === 'walls_back' || norm === 'collision') {
        this.wallsLayer = layer;
      }
    }
  }

  private renderWorld() {
    if (!this.world) return;

    // Multi-room mode: delegate to renderRoom() when a ScenarioConfig is loaded
    if (this.scenarioConfig) {
      const room = this.roomForCurrentWorld()
        ?? this.scenarioConfig.rooms.find(r => r.key === this.scenarioConfig!.startRoomKey)
        ?? this.scenarioConfig.rooms[0];
      this.renderRoom(room, room.spawnX, room.spawnY);
      return;
    }

    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    // Los pulsos repeat:-1 sobreviven a removeAll y se acumulaban en cada re-render.
    this.tweens.killAll();
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.markerLabels.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.npcMovers.clear();
    this.tiledExits.clear();
    this.toneVignette = undefined;
    this.resetOrientationVisuals();
    this.wallsLayer = undefined;
    this.authoredRoomActive = false;
    this.currentRoomKey = '';

    const mapKey  = this.world.map.key;
    const { width: mapW, height: mapH } = this.world.map;
    this.cameras.main.setBackgroundColor('#0e141a');

    // ── Fase C: registry de renderers también en modo sala única ───────────
    // Si hay renderer para este mapa, él pinta todas las capas visuales y aquí
    // solo queda el gameplay (markers remapeados, jugador, cámara, guía).
    const sceneRenderer = resolveSceneRenderer(mapKey);
    if (sceneRenderer) {
      this.authoredRoomActive = true;
      const metadata = sceneRenderer.render(this, {
        width: mapW,
        height: mapH,
        reduceMotion: this.callbacks.reduceMotion,
        ambientTone: this.ambientTone(),
      });
      this.renderableWorldObjects()
        .map(obj => {
          const authored = authoredMarkerPositionForMap(mapKey, obj.key);
          return authored ? { ...obj, x: authored.x, y: authored.y } : obj;
        })
        .forEach(obj => this.createMarker(obj));
      // Posición persistida solo si sigue siendo jugable en la sala autoría.
      const persisted = { x: this.world.player.x, y: this.world.player.y };
      const spawn = this.wouldCollide(persisted.x, persisted.y) ? AUTHORED_PLAYER_SPAWN : persisted;
      this.createPlayer(spawn.x, spawn.y);
      this.applyPixelCamera(metadata.bounds.width, metadata.bounds.height);
      this.refreshMarkerStates();
      this.updateNearestInteraction(true);
      this.buildGuide();
      this.applyCrisisVignette();
      this.playIntroFade();
      this.callbacks.onReady();
      return;
    }

    // ── Layer 0-1: procedural dark floor + grid (always — permanent base) ──
    // Tiled floor tiles sit on top; GID 0 cells (empty) let this base show through.
    this.add.rectangle(mapW/2, mapH/2, mapW-40, mapH-42, 0x131c28, 1).setDepth(0);
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(1, 0x1c2d3e, 0.65);
    for (let x = 56; x <= mapW-56; x += 32) g.lineBetween(x, 44, x, mapH-44);
    for (let y = 56; y <= mapH-56; y += 32) g.lineBetween(44, y, mapW-44, y);

    // ── Fase 4: authored per-room background image (over the procedural floor) ──
    this.applyAuthoredBackground(mapW, mapH);

    // ── Layer 2-3: Tiled tile layers (Floor + Walls) if map available ─────
    // Floor layer starts empty (all GID 0 = transparent).
    // Open any map in Tiled editor, paint tiles on the Floor layer, save → renders here.
    let tiledObjects: Phaser.Types.Tilemaps.TiledObject[] = [];
    let hasTiledMap = false;

    if (this.assetsLoaded) {
      try {
        const tilemap    = this.make.tilemap({ key: `map-${mapKey}` });
        // Register all 3 tilesets — only those present in the map JSON are used
        const ts1 = tilemap.addTilesetImage('tiny-dungeon', 'dungeon-img');
        const ts2 = tilemap.addTilesetImage('tiny-town',    'town-img');
        const ts3 = tilemap.addTilesetImage('rpg-urban',    'rpg-img');
        const tilesets = [ts1, ts2, ts3].filter((t): t is Phaser.Tilemaps.Tileset => t !== null);
        if (tilesets.length > 0) {
          this.buildTiledLayers(tilemap, tilesets);
        }
        tiledObjects = tilemap.getObjectLayer('Objects')?.objects ?? [];
        hasTiledMap  = true;
      } catch {
        hasTiledMap = false;
      }
    }

    // Collision-zone panels only when no Tiled layout is available
    if (!hasTiledMap) {
      this.world.collisions.forEach(zone => this.renderCollisionZone(zone));
    }
    // ─────────────────────────────────────────────────────────────────────

    // Room border (depth 5) + title (depth 6) — always above tile layers (depth 2-3)
    this.add.rectangle(mapW/2, mapH/2, mapW-36, mapH-38)
      .setStrokeStyle(3, 0x4f7cac, .3).setFillStyle(0x000000, 0).setDepth(5);
    this.add.text(16, 12, this.world.map.title, {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#9dc0e8', fontStyle: 'bold'
    }).setDepth(6).setScrollFactor(0);   // pin to screen — stays top-left as camera scrolls
    if (isComisariaMap(mapKey)) {
      this.add.text(56, 66, 'Comisaría — Restablecimiento de derechos', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: 'rgba(157,192,232,.72)',
      }).setDepth(6);
    }

    if (isComisariaMap(mapKey)) {
      this.renderComisariaEnvironment();
    }

    // Merge Tiled object positions with backend objects.
    // Tiled object "name" must match the backend MapObjectState "key".
    let mergedObjects = this.renderableWorldObjects().map(obj => {
      const t = tiledObjects.find(o => o.name === obj.key);
      return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
    });
    if (isComisariaMap(mapKey)) {
      mergedObjects = applySceneDisplayLabels(mergedObjects, mapKey);
    }

    mergedObjects.forEach(obj => this.createMarker(obj));
    this.spawnAmbientDust(mapW, mapH);
    this.createPlayer(this.world.player.x, this.world.player.y);

    // ── Cámara: zoom entero (spec §8.3); sigue a la jugadora dentro de la sala ──
    this.applyPixelCamera(mapW, mapH);

    this.refreshMarkerStates();
    this.updateNearestInteraction(true); // suppress blip on initial spawn
    this.buildGuide();
    this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playIntroFade();
    this.callbacks.onReady();
  }

  /**
   * Renders a single room from the ScenarioConfig.
   * Called by renderWorld() in multi-room mode and by transitionToRoom().
   */
  private renderRoom(roomConfig: RoomConfig, spawnX: number, spawnY: number) {
    // Si el mundo se refresca sin cambiar de sala (p. ej. al persistir la
    // posición del jugador), conserva la posición actual: el re-render no debe
    // teletransportar al jugador de vuelta al spawn.
    const keepPosition = this.currentRoomKey === roomConfig.key && this.player
      ? { x: this.player.x, y: this.player.y }
      : null;

    this.cameras.main.stopFollow();
    this.tweens.killAll();
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.markerLabels.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.npcMovers.clear();
    this.tiledExits.clear();
    this.toneVignette = undefined;
    this.resetOrientationVisuals();
    // Un refresco de la misma sala conserva la caminata; una sala nueva no la arrastra.
    if (!keepPosition) { this.walk = NO_WALK; this.walkGoal = null; }
    this.wallsLayer = undefined;
    this.interactionCooldown = 0;
    this.cameras.main.setBackgroundColor('#0e141a');
    this.currentRoomKey = roomConfig.key;

    let actualMapW = AUTHORED_ROOM_WIDTH, actualMapH = AUTHORED_ROOM_HEIGHT;
    let tiledObjects: Phaser.Types.Tilemaps.TiledObject[] = [];
    // Fase C: el registry decide qué renderer pinta la sala; sin renderer se
    // usa el flujo Tiled/procedural existente.
    const sceneRenderer = resolveSceneRenderer(roomConfig.tiledMapKey);
    const authoredClinicalRoom = sceneRenderer !== null;
    this.authoredRoomActive = authoredClinicalRoom;

    if (!authoredClinicalRoom) {
      // Title pinned to screen (la sala autoría no lleva título pegado al mapa;
      // la ubicación ya vive en la top bar del HUD)
      this.add.text(16, 12, roomConfig.displayName, {
        fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#9dc0e8', fontStyle: 'bold'
      }).setDepth(6).setScrollFactor(0);
    }

    if (this.assetsLoaded && !authoredClinicalRoom) {
      try {
        const tilemap = this.make.tilemap({ key: roomConfig.tiledMapKey });
        const ts1 = tilemap.addTilesetImage('tiny-dungeon', 'dungeon-img');
        const ts2 = tilemap.addTilesetImage('tiny-town',    'town-img');
        const ts3 = tilemap.addTilesetImage('rpg-urban',    'rpg-img');
        const tilesets = [ts1, ts2, ts3].filter((t): t is Phaser.Tilemaps.Tileset => t !== null);

        if (tilesets.length > 0) {
          this.buildTiledLayers(tilemap, tilesets);
        }

        actualMapW = tilemap.widthInPixels;
        actualMapH = tilemap.heightInPixels;

        // Register EXIT objects for transition detection
        tiledObjects = tilemap.getObjectLayer('Objects')?.objects ?? [];
        for (const exit of roomConfig.exits) {
          const obj = tiledObjects.find(o => o.name === exit.objectName);
          if (obj?.x != null && obj?.y != null) {
            this.tiledExits.set(exit.objectName, {
              x: obj.x, y: obj.y,
              w: obj.width ?? 32, h: obj.height ?? 48
            });
          }
        }
      } catch {
        // Map not found — render empty room with fallback dimensions
      }
    }


    let sceneMetadata: SceneRenderMetadata | null = null;
    if (sceneRenderer) {
      // Sala premium: el renderer pinta TODAS las capas visuales (background,
      // floor, props, lighting). Sin grilla genérica ni borde de editor.
      sceneMetadata = sceneRenderer.render(this, {
        width: actualMapW,
        height: actualMapH,
        reduceMotion: this.callbacks.reduceMotion,
        ambientTone: this.ambientTone(),
      });
    } else {
      // ── Dark procedural floor + subtle grid (mirrors renderWorld style) ─────
      // Floor tile layer uses GID 0 (transparent) everywhere, so this dark rect IS the floor.
      this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 40, actualMapH - 42, 0x131c28, 1).setDepth(0);
      const gfx = this.add.graphics().setDepth(1);
      gfx.lineStyle(1, 0x1c2d3e, 0.55);
      for (let gx = 16; gx < actualMapW; gx += 32) gfx.lineBetween(gx, 0, gx, actualMapH);
      for (let gy = 16; gy < actualMapH; gy += 32) gfx.lineBetween(0, gy, actualMapW, gy);

      // Room border
      this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 36, actualMapH - 38)
        .setStrokeStyle(3, 0x4f7cac, .3).setFillStyle(0x000000, 0).setDepth(5);
    }

    // Backend interactive objects (markers) — merge Tiled Objects-layer positions
    // (Tiled object "name" must match the backend MapObjectState "key").
    // En la sala autoría las posiciones del seed pertenecen al tilemap viejo,
    // así que se remapean a los puntos jugables de la sala.
    if (this.world) {
      const mergedObjects = this.renderableWorldObjects().map(obj => {
        if (authoredClinicalRoom) {
          const authored = authoredMarkerPositionForMap(roomConfig.tiledMapKey, obj.key);
          if (authored) return { ...obj, x: authored.x, y: authored.y };
        }
        const t = tiledObjects.find(o => o.name === obj.key);
        return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
      });
      mergedObjects.forEach(obj => this.createMarker(obj));
    }

    // Los JSON de escenario traen coords de la sala autoría; spawnNpcs tiene la
    // red de seguridad (freeTileNear) si alguna cayera en colisión.
    this.spawnNpcs(roomConfig.npcs);
    // Fase 10: enter_room persiste entryX/entryY en world.player. Esa autoridad
    // debe ganar incluso si el ScenarioConfig asíncrono dejó un actor transitorio
    // en el centro; el actor vivo solo respalda datos backend no jugables.
    const persisted = this.world ? { x: this.world.player.x, y: this.world.player.y } : null;
    const spawn = authoredClinicalRoom
      ? resolveRoomPlayerPosition({
          authoritative: persisted,
          live: keepPosition,
          fallback: { x: AUTHORED_PLAYER_SPAWN.x, y: AUTHORED_PLAYER_SPAWN.y },
          collides: point => this.wouldCollide(point.x, point.y),
        })
      : keepPosition ?? { x: spawnX, y: spawnY };
    this.createPlayer(spawn.x, spawn.y);
    this.applyPixelCamera(actualMapW, actualMapH);
    this.refreshMarkerStates();
    this.updateNearestInteraction(true);
    this.buildGuide();
    // Evitar doble lighting: si el renderer ya pintó su capa de luz, la viñeta
    // genérica solo ensuciaría/oscurecería la escena premium.
    if (!sceneMetadata?.paintedLayers.includes('lighting')) this.applyLightingOverlay();
    this.applyCrisisVignette();
    this.playIntroFade();
    this.callbacks.onReady();
  }

  /** Fade-in breve al entrar a la simulación (solo la primera escena). */
  private playIntroFade(): void {
    if (this.firstSceneFadeDone) return;
    this.firstSceneFadeDone = true;
    if (!this.callbacks.reduceMotion) this.cameras.main.fadeIn(300, 7, 10, 20);
  }

  /**
   * Zoom entero de cámara (spec §8.3): el mayor k que deja ver el 80 % de la sala. La
   * cámara sigue a la jugadora y se limita a la sala; si la vista es mayor, la centra.
   */
  private applyPixelCamera(roomWidth: number, roomHeight: number): void {
    this.roomSize = { width: roomWidth, height: roomHeight };
    const cam = this.cameras.main;
    const k = integerZoom(cam.width, cam.height, roomWidth, roomHeight);
    cam.setZoom(k);
    this.pixelRender?.refreshTexts(k);
    const bounds = cameraBounds(roomWidth, roomHeight, cam.width / k, cam.height / k);
    cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.player) {
      cam.startFollow(this.player, true, 0.12, 0.12);
      cam.centerOn(this.player.x, this.player.y);
    }
  }

  /** El lienzo cambió de tamaño o de dpr: nuevo zoom entero y viñetas al nuevo rectángulo visible. */
  private refitCamera(): void {
    if (!this.ready || !this.player) return;
    this.applyPixelCamera(this.roomSize.width, this.roomSize.height);
    if (this.toneVignette) {
      this.toneVignette.destroy();
      this.applyLightingOverlay();
    }
    this.crisisVignette?.destroy();
    this.applyCrisisVignette();
  }

  private checkExitTriggers() {
    if (!this.player || !this.scenarioConfig) return;
    const roomConfig = this.scenarioConfig.rooms.find(r => r.key === this.currentRoomKey);
    if (!roomConfig) return;
    const px = this.player.x, py = this.player.y;
    for (const exit of roomConfig.exits) {
      const zone = this.tiledExits.get(exit.objectName);
      if (!zone) continue;
      if (px >= zone.x && px <= zone.x + zone.w && py >= zone.y && py <= zone.y + zone.h) {
        this.tiledExits.delete(exit.objectName); // one-shot until room reloads
        this.callbacks.onRoomExit(exit.targetRoomKey, exit.entryX, exit.entryY);
        return;
      }
    }
  }

  /** Fase 5: DB-driven spatial doors — when the player reaches an EXIT object whose
   *  metadata carries a targetNodeKey, fire onEnterRoom once (re-armed when away). */
  private checkDbDoorTriggers() {
    if (!this.player || !this.world || this.scenarioConfig) return;
    const px = this.player.x, py = this.player.y;
    // Resolver la puerta MÁS CERCANA (no la primera del arreglo): si dos puertas
    // caen en rango, se cruza la que el jugador realmente tiene encima.
    let nearest: { target: string; entryX: number; entryY: number } | null = null;
    let nearestDist = Infinity;
    for (const obj of this.world.objects) {
      if ((obj.type || '').toUpperCase() !== 'EXIT') continue;
      const meta = obj.metadata as { targetNodeKey?: string; entryX?: number; entryY?: number } | undefined;
      const target = meta?.targetNodeKey;
      if (!target) continue;
      const d = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = { target, entryX: Number(meta?.entryX ?? obj.x), entryY: Number(meta?.entryY ?? obj.y) };
      }
    }
    // Dispara solo si está armado y el jugador está sobre la puerta.
    if (nearest && this.dbDoorArmed && nearestDist <= this.doorTriggerDist) {
      this.dbDoorArmed = false;
      this.callbacks.onEnterRoom(nearest.target, nearest.entryX, nearest.entryY);
      return;
    }
    // Re-arma SOLO cuando se aleja claramente de toda puerta (histéresis): así, al
    // entrar a una sala junto a la puerta de regreso, no se dispara de inmediato.
    if (nearestDist >= this.doorRearmDist) this.dbDoorArmed = true;
  }

  private roomForCurrentWorld(): RoomConfig | null {
    if (!this.world || !this.scenarioConfig) return null;
    const mapKey = this.world.map.key;
    const baseKey = mapKey.replace(/-(accion|cierre|marco)$/i, '');
    const candidates = new Set([mapKey, `map-${mapKey}`, baseKey, `map-${baseKey}`]);
    const direct = this.scenarioConfig.rooms.find(room =>
      candidates.has(room.key) || candidates.has(room.tiledMapKey)
    );
    if (direct) return direct;
    return this.scenarioConfig.rooms.find(room => room.key === this.currentRoomKey) ?? null;
  }

  private renderableWorldObjects(): MapObjectState[] {
    const inventory = new Set(this.world?.inventory ?? []);
    return (this.world?.objects ?? []).filter(object =>
      !(object.type === 'TOOL' && object.toolCode && inventory.has(object.toolCode))
    );
  }

  /** Registra el mover del NPC (si trae motion) con su posición real de spawn. */
  private registerNpcMover(npc: NpcConfig, pos: { x: number; y: number }): void {
    if (!npc.motion) return;
    this.npcMovers.set(npc.key, {
      key: npc.key,
      cfg: npc.motion,
      zone: npcZone(npc.motion, pos),
      target: null,
      anchorIdx: 0,
      pauseUntil: this.time.now + (npc.motion.startDelayMs ?? 600),
      lastPose: { direction: (npc.facing ?? 'down') as PlayerDirection, walking: false },
    });
  }

  /** Pose del NPC (dirección + caminando) solo si cambió — como el jugador. */
  private applyNpcPose(mover: NpcMover, container: Phaser.GameObjects.Container, direction: PlayerDirection, walking: boolean): void {
    if (mover.lastPose.direction === direction && mover.lastPose.walking === walking) return;
    mover.lastPose = { direction, walking };
    this.playNpc(container, direction, walking);
  }

  private updateNpcMovers(time: number, delta: number) {
    if (this.motionPaused || this.npcMovers.size === 0) return;
    for (const mover of this.npcMovers.values()) {
      const container = this.npcMarkers.get(mover.key);
      if (!container) continue;
      const behavior = effectiveNpcBehavior(mover.cfg.behavior, this.callbacks.reduceMotion);
      const lastDir = mover.lastPose.direction ?? 'down';

      if (behavior === 'idle') { this.applyNpcPose(mover, container, lastDir, false); continue; }

      if (behavior === 'attentive') {
        // Gira hacia el jugador cuando está cerca; nunca se traslada.
        if (this.player) {
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y);
          if (d <= 110) {
            const dir = resolveDirection(this.player.x - container.x, this.player.y - container.y, lastDir);
            this.applyNpcPose(mover, container, dir, false);
          }
        }
        continue;
      }

      if (time < mover.pauseUntil) { this.applyNpcPose(mover, container, lastDir, false); continue; }

      if (!mover.target) {
        mover.target = this.nextNpcTarget(mover, container);
        if (!mover.target) { mover.pauseUntil = time + 600; continue; }
      }

      const next = stepToward(container, mover.target, npcSpeed(mover.cfg) * (delta / 1000));
      const dir = resolveDirection(next.x - container.x, next.y - container.y, lastDir);
      if (!this.wouldCollide(next.x, next.y)) {
        container.setPosition(next.x, next.y);
        this.applyNpcPose(mover, container, dir, true);
      } else if (!this.wouldCollide(next.x, container.y)) {
        container.setPosition(next.x, container.y);
        this.applyNpcPose(mover, container, dir, true);
      } else if (!this.wouldCollide(container.x, next.y)) {
        container.setPosition(container.x, next.y);
        this.applyNpcPose(mover, container, dir, true);
      } else {
        // Bloqueado del todo: nuevo objetivo después, nunca caminar en el sitio.
        mover.target = null;
        mover.pauseUntil = time + 900;
        this.applyNpcPose(mover, container, dir, false);
        continue;
      }

      if (reached(container, mover.target, 2)) {
        const anchors = mover.cfg.anchors ?? [];
        const anchor = anchors.length ? anchors[mover.anchorIdx] : null;
        this.applyNpcPose(mover, container, (anchor?.face as PlayerDirection | undefined) ?? dir, false);
        mover.pauseUntil = time + npcPause(mover.cfg, anchor);
        mover.anchorIdx = npcMotionStrategyFor(mover.cfg.behavior).anchorAfterArrival(mover.anchorIdx, anchors.length);
        mover.target = null;
      }
    }
  }

  private nextNpcTarget(mover: NpcMover, container: Phaser.GameObjects.Container): { x: number; y: number } | null {
    return npcMotionStrategyFor(mover.cfg.behavior).nextTarget({
      zone: mover.zone,
      anchors: mover.cfg.anchors,
      anchorIdx: mover.anchorIdx,
      from: container,
      player: this.player ?? null,
      rand: Math.random,
      isBlocked: (x, y) => this.wouldCollide(x, y),
    });
  }

  /** Reposo del NPC mirando a `direction` (las 4 filas del kit son reales). */
  private applyNpcFacing(container: Phaser.GameObjects.Container, direction: PlayerDirection): void {
    this.playNpc(container, direction, false);
  }

  private playNpc(container: Phaser.GameObjects.Container, direction: PlayerDirection, walking: boolean): void {
    const bag = container as unknown as Record<string, unknown>;
    const sprite = bag['__npcSprite'] as Phaser.GameObjects.Sprite | undefined;
    const visual = bag['__npcVisual'] as CharacterVisual | undefined;
    if (sprite && visual) playKitPose(sprite, visual, direction, walking, this.callbacks.reduceMotion);
  }

  private spawnNpcs(npcs: NpcConfig[]) {
    for (const npc of npcs) {
      // Red de seguridad: si la coord del JSON cae en colisión, buscar piso libre.
      const pos = this.wouldCollide(npc.x, npc.y)
        ? freeTileNear({ x: npc.x, y: npc.y }, (x, y) => this.wouldCollide(x, y), 18, 3)
        : { x: npc.x, y: npc.y };
      const visual = this.actorVisual(npcCharacterRef(npc));
      // Sombra de contacto en dos pasos: asienta al NPC en el piso.
      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
      const figure: Phaser.GameObjects.GameObject = visual
        ? this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', npc.facing ?? 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
        : this.add.circle(0, -20, 10, 0x4fa3a5, 1);
      // Nombre y pista: objetos de la escena sobre los actores (no hijos del contenedor); nacen ocultos.
      const { label, hint } = this.createNpcLabels(npc, pos, KIT_LABEL_OFFSET_Y);
      const parts: Phaser.GameObjects.GameObject[] = [shadowSoft, shadow, figure];
      const icon = visual?.recipeId === PATIENT_RECIPE_ID ? this.patientIcon(0) : null;
      if (icon) parts.push(icon);
      const container = this.add.container(pos.x, pos.y, parts);
      this.setFeetOffset(container, 0);   // pies = origen del contenedor
      this.npcMarkers.set(npc.key, container);
      const bag = container as unknown as Record<string, unknown>;
      bag['__npcConfig'] = npc;
      bag['__hintSprite'] = hint;
      bag['__labelSprite'] = label;
      bag['__labelOffsetY'] = KIT_LABEL_OFFSET_Y;
      bag['__patientIcon'] = icon;
      if (visual && figure instanceof Phaser.GameObjects.Sprite) {
        bag['__npcSprite'] = figure;
        bag['__npcVisual'] = visual;
      }
      this.applyNpcFacing(container, npc.facing ?? 'down');
      this.registerNpcMover(npc, pos);
    }
  }

  /** true si alguna persona está a distancia de diálogo del jugador. */
  private isAnyNpcInRange(): boolean {
    if (!this.player) return false;
    for (const container of this.npcMarkers.values()) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y);
      if (d <= NPC_INTERACT_RADIUS) return true;
    }
    return false;
  }

  /** Clave de proximidad de una persona (`npc:{clave}`), creada una vez para no concatenar por cuadro. */
  private npcKeyOf(key: string): string {
    let candidateKey = this.npcKeys.get(key);
    if (candidateKey === undefined) {
      candidateKey = NPC_KEY_PREFIX + key;
      this.npcKeys.set(key, candidateKey);
    }
    return candidateKey;
  }

  private npcConfigFor(candidateKey: string): NpcConfig | null {
    const container = this.npcMarkers.get(candidateKey.slice(NPC_KEY_PREFIX.length));
    if (!container) return null;
    return ((container as unknown as Record<string, unknown>)['__npcConfig'] as NpcConfig | undefined) ?? null;
  }

  /** Pista sobre una persona a su alcance: sin la letra E donde no hay teclado. */
  private npcHintGlyph(): string {
    return this.touchPointer() ? '▲' : '▲ E';
  }

  /** Puntero táctil (sin teclado): evita atajos de teclado en los textos del mundo. */
  private touchPointer(): boolean {
    try {
      return window.matchMedia?.('(pointer: coarse)').matches ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Nombre y pista de una persona: objetos de la escena y no hijos de su contenedor, para dibujarse sobre
   * todos los actores (el contenedor se ordena por su Y y un sprite de delante taparía el nombre). Nacen
   * ocultos: la escena no debe leerse como un diagrama etiquetado; `refreshMarkerStates` los muestra y
   * `placeLabel` los coloca cuando toca.
   */
  private createNpcLabels(
    npc: NpcConfig, pos: { x: number; y: number }, offsetY: number,
  ): { label: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text } {
    const label = this.add.text(pos.x, pos.y + offsetY, npc.displayName, {
      fontFamily: 'Arial, sans-serif', fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#e8f0f4',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
    }).setOrigin(0.5, 1).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);
    const hint = this.add.text(pos.x, pos.y + offsetY, this.npcHintGlyph(), {
      fontFamily: 'Arial, sans-serif', fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#4fa3a5',
      fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5, 1).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);
    hint.setY(label.y - label.displayHeight - 2);
    return { label, hint };
  }

  /**
   * Coloca el rótulo (y la pista) de un candidato junto a su dueño: el de una persona encima de su cabeza
   * con la pista apilada sobre el nombre; el de un marcador debajo del icono. Un marcador que flota
   * suavemente usa su posición de reposo (el rótulo no tiembla); solo los que de verdad se desplazan
   * (deambulan) usan la posición viva.
   */
  private placeLabel(key: string): void {
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      if (!container) return;
      const bag = container as unknown as Record<string, unknown>;
      const label = bag['__labelSprite'] as Phaser.GameObjects.Text | undefined;
      const hint = bag['__hintSprite'] as Phaser.GameObjects.Text | undefined;
      const offsetY = (bag['__labelOffsetY'] as number | undefined) ?? 0;
      if (!label) return;
      if (label.x !== container.x || label.y !== container.y + offsetY) label.setPosition(container.x, container.y + offsetY);
      hint?.setPosition(container.x, label.y - label.displayHeight - 2);
      return;
    }
    const marker = this.markers.get(key);
    const label = this.markerLabels.get(key);
    const obj = this.markerData.get(key);
    if (!marker || !label || !obj) return;
    const moving = this.ambientMovers.has(key);
    const x = moving ? marker.x : obj.x;
    const y = (moving ? marker.y : obj.y) + 28;
    if (label.x !== x || label.y !== y) label.setPosition(x, y);
  }

  /**
   * Estado clínico de la paciente (decisión 13): un icono de pixel art sobre la cabeza de cada
   * actor dibujado con su receta; el sprite no se toca. La crisis, además, sacude 2 px.
   */
  updatePatientVisualState(state: import('../../core/models/simulation.model').PatientState) {
    this.patientState = state;
    const kind = patientIconKind(state);
    for (const container of [...this.npcMarkers.values(), ...this.markers.values()]) {
      const icon = (container as unknown as Record<string, unknown>)['__patientIcon'] as Phaser.GameObjects.Image | null | undefined;
      if (!icon) continue;
      icon.setVisible(kind !== null);
      if (kind) icon.setTexture(patientIconKey(kind));
      if (kind === 'crisis' && !this.callbacks.reduceMotion) {
        this.tweens.add({ targets: container, x: container.x + 2, duration: 60, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
      }
    }
  }

  private renderComisariaEnvironment() {
    const g = this.add.graphics().setDepth(3.5);

    COMISARIA_ZONES.forEach(zone => {
      const cx = zone.x + zone.width / 2;
      const cy = zone.y + zone.height / 2;
      this.add.rectangle(cx, cy, zone.width, zone.height, zone.tint, zone.alpha)
        .setStrokeStyle(1, 0x5b4f8f, 0.38)
        .setDepth(3.5);
      this.add.text(zone.x + 8, zone.y + 6, zone.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '9px',
        color: 'rgba(184,168,232,.75)',
        backgroundColor: 'rgba(8,12,18,.5)',
        padding: { x: 4, y: 2 },
      }).setDepth(4).setAlpha(0.85);
    });

    g.lineStyle(2, 0x5b4f8f, 0.45);
    g.lineBetween(364, 44, 364, 496);
    g.lineBetween(624, 44, 624, 496);
    g.lineBetween(640, 190, 910, 190);
    g.lineBetween(640, 330, 910, 330);
    g.lineStyle(2, 0xa85062, 0.55);
    g.strokeRect(640, 48, 270, 140);

    this.add.text(72, 392, 'COMISARÍA DE FAMILIA', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#e8f0f4',
      fontStyle: 'bold',
      backgroundColor: 'rgba(91,79,143,.82)',
      padding: { x: 8, y: 4 },
    }).setDepth(6);

    // Figurantes (spec §7.2): la receta de figurantes, con los pies donde antes terminaba el sprite.
    this.addExtra(180, 236);
    this.add.text(180, 248, 'Sobreviviente', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#ffd4c0',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(280, 215);
    this.add.text(280, 228, 'Psicóloga social', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#a8c8ff',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(760, 106);
    this.add.text(760, 118, 'Funcionario de derechos', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    this.addExtra(760, 415);
    this.add.text(760, 428, 'Trabajadora social', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#b8e8c8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

    if (this.assetsLoaded && this.textures.exists('dungeon-tiles')) {
      [[120, 400], [160, 400]].forEach(([x, y]) => {
        this.add.image(x, y, 'dungeon-tiles', KenneyDungeonFrames.DESK).setScale(2).setDepth(7);
      });
      [[200, 320], [240, 320]].forEach(([x, y]) => {
        this.add.image(x, y, 'dungeon-tiles', KenneyDungeonFrames.CHAIR).setScale(2).setDepth(7);
      });
      this.add.image(500, 280, 'dungeon-tiles', KenneyDungeonFrames.CABINET).setScale(2).setDepth(7);
    }
  }

  /**
   * Viñeta de iluminación procedural (sin assets). Pineada a cámara, estática
   * (segura con prefers-reduced-motion). El tinte sigue `ambient.ambientTone`.
   */
  /** Tono ambiental autorado del mapa actual (calm | clinical | warm | tense). */
  private ambientTone(): string {
    return String(
      (this.world?.map.ambient as { ambientTone?: unknown })?.ambientTone ?? 'calm',
    ).toLowerCase();
  }

  private applyLightingOverlay(): void {
    const tone = this.ambientTone();
    const tint =
      tone === 'warm' ? 0x3a2a1a :
      tone === 'clinical' ? 0x1a2433 :
      tone === 'tense' ? 0x2a1420 :
      0x141a2e; // calm (default)
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.LIGHTING_FLOOR);
    // Borde oscuro suave en los 4 lados — viñeta barata sin shaders.
    // Banda corta y alpha bajo: enmarca sin leerse como overlay técnico.
    this.strokeVignetteBand(g, tint, 0.12, 0.3);
    this.toneVignette = g;
  }

  /**
   * Banda de viñeta en los cuatro bordes del rectángulo que la cámara muestra: opacidad
   * `edgeAlpha` en el borde, que cae al cuadrado hacia dentro. scrollFactor 0 no anula el
   * zoom de la cámara; por eso se pinta sobre `vignetteFrame` y no sobre (0,0)-(ancho,alto).
   */
  private strokeVignetteBand(g: Phaser.GameObjects.Graphics, tint: number, bandRatio: number, edgeAlpha: number): void {
    const cam = this.cameras.main;
    const frame = vignetteFrame(cam.width, cam.height, cam.zoom);
    const band = Math.round(Math.min(frame.width, frame.height) * bandRatio);
    for (let i = 0; i < band; i++) {
      g.lineStyle(1, tint, edgeAlpha * (1 - i / band) ** 2);
      g.strokeRect(frame.x + i, frame.y + i, frame.width - i * 2, frame.height - i * 2);
    }
  }

  /**
   * Viñeta de crisis: la misma banda que la de tono pero rojo-violeta, y con su
   * opacidad atada al estrés del intento. Se pinta también en salas con luz
   * pintada, porque es estado del caso y no decoración.
   */
  private applyCrisisVignette(): void {
    // El killAll() del re-render ya detuvo el pulso; se para igual por si alguien llama sin él.
    this.crisisPulse?.stop();
    this.crisisPulse = undefined;
    this.crisisStateKey = '';
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.LIGHTING + 1);
    this.strokeVignetteBand(g, CRISIS_VIGNETTE_TINT, 0.18, 1);
    this.crisisVignette = g;
    this.applyCrisisState();
  }

  private applyCrisisState(): void {
    const g = this.crisisVignette;
    if (!g || !g.scene) return;
    // Con el mundo en pausa (diálogo, bitácora, cierre) la crisis se ve fija: nada late mientras se lee.
    const state = crisisVignetteState(this.stressLevel, this.callbacks.reduceMotion || this.motionPaused);
    const key = JSON.stringify(state);
    // Mismo estado y el pulso sigue vivo: no se reinicia (pasar de 88 a 90 no debe dar un salto).
    if (key === this.crisisStateKey && (!state.pulse || this.crisisPulse?.isPlaying())) return;
    this.crisisStateKey = key;
    this.crisisPulse?.stop();
    this.crisisPulse = undefined;
    g.setAlpha(state.alpha);
    if (state.pulse) {
      this.crisisPulse = this.tweens.add({
        targets: g,
        alpha: { from: state.pulse.from, to: state.pulse.to },
        duration: state.pulse.durationMs,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /**
   * Dispara el destello decidido al cambiar de sala. Lo llama quien sabe que la sala ya se ve:
   * el fin del fundido de cámara (salida cliente) o Angular al retirar su fundido de escena.
   */
  playPendingRoomFlash(): void {
    const flash = this.pendingRoomFlash;
    this.pendingRoomFlash = null;
    // Se decidió antes de verse la sala: nada si entre tanto se activó el movimiento reducido
    // o la escena ya no existe (cambio de ruta con un temporizador pendiente).
    if (!flash || this.callbacks.reduceMotion || !this.ready || !this.cameras?.main) return;
    const cam = this.cameras.main;
    cam.flashEffect.alpha = flash.peakAlpha;
    cam.flash(flash.durationMs, ...flash.rgb);
  }

  private renderCollisionZone(zone: CollisionZoneState) {
    const cx = zone.x + zone.width/2;
    const cy = zone.y + zone.height/2;
    const isDoor = /puerta|door/i.test(zone.label ?? '');
    // Walls: solid dark panels; doors get a subtle teal accent
    const themeClr = this.borderFor(this.world!.map.theme);
    this.add.rectangle(cx, cy, zone.width, zone.height,
      isDoor ? 0x0c1926 : 0x090d14, isDoor ? .92 : 1)
      .setStrokeStyle(isDoor ? 2 : 1, isDoor ? themeClr : 0x18263a, isDoor ? .8 : .45)
      .setDepth(4);
    if (zone.label) {
      this.add.text(zone.x+5, zone.y+3, zone.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x:4, y:2 }
      }).setDepth(5);
    }
  }

  private createPlayer(x: number, y: number) {
    this.lastPose = { direction: null, walking: false, reduce: this.callbacks.reduceMotion };
    const visual = this.playerVisual;
    if (visual && this.playerKitReady) {
      // Contrato de pies (player-motion.util): (x, y) del contenedor = pies; el cuadro del
      // kit trae los pies en (24, 68). Sombra en dos pasos bajo los pies, a escala 1.
      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);
      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);
      const sprite = this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
        .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
      this.player = this.add.container(x, y, [shadowSoft, shadow, sprite]).setDepth(actorDepth(y));
      this.playerSprite = sprite;
      playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
      return;
    }
    // Sin hoja del kit (no cargó): marcador geométrico con el mismo contrato de pies.
    const shadow = this.add.ellipse(0, 0, 16, 5, 0x000000, .22);
    const body = this.add.rectangle(0, -14, 24, 32, 0x4f7cac, 1).setStrokeStyle(2, 0xffffff, .9);
    const head = this.add.circle(0, -36, 12, 0xf4c6a8, 1).setStrokeStyle(2, 0xffffff, .85);
    const badge = this.add.rectangle(0, -10, 12, 7, 0xffffff, .9);
    this.player = this.add.container(x, y, [shadow, body, head, badge]).setDepth(actorDepth(y));
    this.playerSprite = undefined;
  }

  /**
   * Aplica la pose SOLO si cambió (dirección, caminar o movimiento reducido): la animación no
   * se reinicia en cada update y el reposo es inmediato al soltar teclas o chocar con una pared.
   */
  private applyPlayerPose(direction: PlayerDirection, walking: boolean): void {
    const reduce = this.callbacks.reduceMotion;
    if (this.lastPose.direction === direction && this.lastPose.walking === walking && this.lastPose.reduce === reduce) return;
    this.lastPose = { direction, walking, reduce };
    if (this.playerSprite && this.playerVisual && this.playerKitReady) {
      playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion);
    }
  }

  /** Visual del kit con sus animaciones listas; si sus hojas no están, el figurante; si tampoco, null (→ marcador). */
  private actorVisual(ref: CharacterRef): CharacterVisual | null {
    const kit = this.callbacks.kit;
    if (!kit || !this.assetsLoaded) return null;
    for (const candidate of [ref, extrasCharacterRef(kit)]) {
      const visual = resolveCharacter(kit, candidate);
      addComposedSheets(this, visual); // un avatar autorado se compone aquí; las recetas vienen del preload
      if (ensureCharacterAnims(this, visual)) return visual;
    }
    return null;
  }

  /** Icono del estado clínico con los pies del actor en `feetY`; nace con el último estado conocido. */
  private patientIcon(feetY: number): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(patientIconKey('crisis'))) return null;
    const view = patientIconView(this.patientState);
    return this.add.image(0, feetY + KIT_ICON_OFFSET_Y, view.key).setOrigin(0.5, 1).setVisible(view.visible);
  }

  /** Figurante de los mapas legados (spec §7.2): de frente, a escala 1, pies en `feetY`. */
  private addExtra(x: number, feetY: number): void {
    const kit = this.callbacks.kit;
    const visual = kit ? this.actorVisual(extrasCharacterRef(kit)) : null;
    if (!visual) return;
    const sprite = this.add.sprite(x, feetY, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', 'down'))
      .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)
      .setDepth(actorDepth(feetY));
    playKitPose(sprite, visual, 'down', false, this.callbacks.reduceMotion);
  }

  /** Devuelve la clave si su textura ya cargó; si no, null (→ fallback del marcador). */
  private loadedTexture(key: string | null): string | null {
    return key && this.textures.exists(key) ? key : null;
  }

  /**
   * Sprite de una puerta, o `null` si no hay arte para ella (→ fallback del marcador).
   *
   * Contra un muro lateral se usa la variante en 3/4; el asset está dibujado
   * mirando a la derecha (muro izquierdo) y el muro derecho es su espejo, así que
   * ahí basta con `flipX`. Sin muro lateral (o sin asset lateral) cae a la frontal.
   */
  private buildDoorSprite(object: MapObjectState): Phaser.GameObjects.Image | null {
    const facing = doorFacing(object.x, this.world?.map.width ?? AUTHORED_ROOM_WIDTH);
    const sideKey = facing ? this.loadedTexture(resolveDoorSideTextureKey(object.key)) : null;
    const key = sideKey ?? this.loadedTexture(resolveDoorTextureKey(object.key));
    if (!key) return null;
    const image = this.add.image(0, DOOR_SPRITE_FEET_Y, key)
      .setOrigin(0.5, 1)
      .setFlipX(sideKey != null && facing === 'left');
    return this.atWorldScale(image);
  }

  /** A escala 1; un PNG viejo en la caché del navegador (otro tamaño que la tabla) se fuerza al de la tabla. */
  private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T {
    const spec = worldSpriteForTexture(image.texture.key);
    const stale = spec ? staleSpriteSize(spec, image.width, image.height) : null;
    if (stale) image.setDisplaySize(stale.width, stale.height);
    return image;
  }

  private createMarker(object: MapObjectState) {
    const isExit = object.type === 'EXIT';
    const color  = Number.parseInt(object.color.replace('#', ''), 16) || 0x4fa3a5;
    const displayLabel = getSceneDisplayLabel(object, this.world?.map.key);
    // El label nace oculto: la escena se lee por iconos/rings y el texto solo
    // aparece para la interacción cercana o seleccionada (refreshMarkerStates).
    // Los EXIT no llevan label propio — su door hint ya nombra el destino.
    // Fuera del contenedor del marcador y sobre los actores: un sprite que pase por delante no lo tapa.
    const label  = isExit ? null : this.add.text(object.x, object.y + 28, displayLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#e8f0f4',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x:5, y:3 }, align: 'center', wordWrap: { width: this.labelWrap }
    }).setOrigin(.5, 0).setAlpha(0).setScale(this.labelScale).setDepth(LABEL_DEPTH);

    let main: Phaser.GameObjects.GameObject;
    let personVisual: CharacterVisual | null = null;
    let doorSprite: Phaser.GameObjects.Image | null = null;

    // Un marcador con sprite de pixel art nunca se escala (markerEmphasis, focus): spec §1.1.2.
    let pixelSprite = false;
    if (this.assetsLoaded) {
      doorSprite = isExit ? this.buildDoorSprite(object) : null;
      if (doorSprite) {
        // Puerta de arte propio: gana en ambos contextos (sala de autoría y salas
        // Kenney), unificando el lenguaje visual. Al no ser un tile de Kenney, no
        // rompe la regla de la sala premium. Si el asset falta, caen las ramas de abajo.
        main = doorSprite;
        pixelSprite = true;
      } else if (isExit && this.authoredRoomActive) {
        // Puerta dibujada (la sala premium no mezcla tiles Kenney): marco + hoja + pomo.
        const doorFrame = this.add.rectangle(0, -10, 34, 46, 0x1a1530, 0.92).setStrokeStyle(2, 0xb69cff, 0.8);
        const doorPanel = this.add.rectangle(0, -10, 24, 36, 0x2a2348, 1);
        const doorKnob = this.add.circle(7, -8, 2.5, 0xb69cff, 1);
        main = this.add.container(0, 0, [doorFrame, doorPanel, doorKnob]);
      } else if (isExit && this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(3);
        pixelSprite = true;
      } else if (object.type === 'TOOL') {
        const toolTex = resolveToolTextureKey(object.toolCode);
        if (toolTex && this.textures.exists(toolTex)) {
          main = this.atWorldScale(this.add.image(0, -6, toolTex));
          pixelSprite = true;
        } else {
          main = this.buildToolMarker(color, object.shortCode || object.toolCode || object.label);
        }
      } else if (object.type === 'OBJECT' && this.loadedTexture(resolveObjectTextureKey(object.shortCode))) {
        main = this.atWorldScale(this.add.image(0, -6, resolveObjectTextureKey(object.shortCode)!));
        pixelSprite = true;
      } else if (object.type === 'PERSON') {
        personVisual = this.callbacks.kit ? this.actorVisual(personCharacterRef(this.callbacks.kit, object)) : null;
        if (personVisual) {
          // Pies del arte sobre la sombra del marcador (y = 16), de frente y respirando.
          const personSprite = this.add.sprite(0, 16, kitSheetKey(personVisual, 'idle'), kitFrameIndex('idle', 'down'))
            .setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y);
          playKitPose(personSprite, personVisual, 'down', false, this.callbacks.reduceMotion);
          main = personSprite;
        } else {
          main = this.buildGeomMarker(color);
        }
      } else if (this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', this.frameForType(object.type)).setScale(2);
        pixelSprite = true;
      } else {
        main = this.buildGeomMarker(color);
      }
    } else {
      main = this.buildGeomMarker(color);
    }

    const pulse = this.add.circle(0, 0, 22, color, .1);
    if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: pulse, scale: 1.3, alpha: .05, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // Sombra de contacto: el icono queda asentado en el piso, no flotando.
    const markerShadow = this.add.ellipse(0, 16, 26, 8, 0x000000, .2);
    const marker = this.add.container(object.x, object.y, [markerShadow, pulse, main]);
    this.setFeetOffset(marker, 16);   // la sombra marca el contacto con el piso
    this.markers.set(object.key, marker);
    this.markerData.set(object.key, object);
    const bag = marker as unknown as Record<string, unknown>;
    bag['__kitSprite'] = personVisual !== null;
    bag['__pixelSprite'] = pixelSprite;
    bag['__pulse'] = pulse;
    if (personVisual?.recipeId === PATIENT_RECIPE_ID) {
      const icon = this.patientIcon(16);
      if (icon) {
        marker.add(icon);
        bag['__patientIcon'] = icon;
      }
    }
    if (label) this.markerLabels.set(object.key, label);
    this.applyAmbientLife(marker, object);

    if (isExit) {
      const hintTx = this.add.text(0, 0, this.doorHintText(object.label), {
        fontFamily: 'Arial, sans-serif', fontSize: `${LABEL_BASE_FONT_PX}px`, color: '#4fa3a5', fontStyle: 'bold'
      }).setOrigin(.5);
      // Ancho a la medida del texto + relleno + hueco del candado (a la izquierda, solo si está bloqueada).
      const hintWidth = Math.ceil(hintTx.width) + 38;
      const hintBg = this.add.rectangle(0, 0, hintWidth, 22, 0x0e141a, .88).setStrokeStyle(1, 0x4fa3a5, .5);
      const lock = this.buildDoorLock(hintWidth, hintTx.width);
      // Sobre el borde alto de la puerta: su alto sale del arte, ya no hay una escala que adivinar.
      const hintY = doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT);
      const hint = this.add.container(object.x, hintY, [hintBg, lock, hintTx])
        .setDepth(DEPTH.UI).setVisible(false).setScale(this.labelScale);
      const bag = hint as unknown as Record<string, unknown>;
      bag['__doorBg'] = hintBg;
      bag['__doorLock'] = lock;
      bag['__doorX'] = object.x;
      bag['__doorHalfWidth'] = hintWidth / 2;
      this.placeDoorHint(hint);
      this.doorHints.set(object.key, hint);
    }
  }

  /** Centra el rótulo de una puerta sobre ella sin salirse del mapa (las puertas están en los bordes). */
  private placeDoorHint(hint: Phaser.GameObjects.Container): void {
    const bag = hint as unknown as Record<string, unknown>;
    const x = bag['__doorX'] as number | undefined;
    const half = bag['__doorHalfWidth'] as number | undefined;
    if (x === undefined || half === undefined) return;
    const reach = half * this.labelScale + 6;
    hint.x = Math.max(reach, Math.min(960 - reach, x));
  }

  /** Texto del rótulo de una puerta: sin la letra E donde no hay teclado. */
  private doorHintText(label: string): string {
    return this.touchPointer() ? `${label} →` : `E  ${label} →`;
  }

  /**
   * Candado y borde discontinuo de una puerta bloqueada: la forma lo dice, no solo el color (WCAG 1.4.1).
   * Se dibuja una vez, oculto; `applyDoorStates` lo enciende cuando la puerta está bloqueada.
   */
  private buildDoorLock(width: number, textWidth: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setVisible(false);
    const left = -width / 2, right = width / 2, top = -11, bottom = 11;
    g.lineStyle(1, 0xe8f0f4, 0.9);
    const dashed = (x1: number, y1: number, x2: number, y2: number) => {
      const length = Math.hypot(x2 - x1, y2 - y1);
      const dx = (x2 - x1) / length, dy = (y2 - y1) / length;
      for (let at = 0; at < length; at += 7) {
        const end = Math.min(at + 4, length);
        g.lineBetween(x1 + dx * at, y1 + dy * at, x1 + dx * end, y1 + dy * end);
      }
    };
    dashed(left, top, right, top);
    dashed(left, bottom, right, bottom);
    dashed(left, top, left, bottom);
    dashed(right, top, right, bottom);
    // Candado: cuerpo y arco, a la izquierda del texto.
    const cx = -textWidth / 2 - 13;
    g.fillStyle(0xe8f0f4, 1).fillRect(cx - 4, -1, 8, 6);
    g.lineStyle(1.5, 0xe8f0f4, 1);
    g.beginPath();
    g.arc(cx, -1, 3, Math.PI, 0, false);
    g.strokePath();
    return g;
  }

  /** Muestra u oculta el candado y el borde discontinuo según `doorStates`. */
  private applyDoorStates(): void {
    this.doorHints.forEach((hint, key) => {
      const bag = hint as unknown as Record<string, unknown>;
      const locked = this.doorStates[key] === 'locked';
      (bag['__doorLock'] as Phaser.GameObjects.Graphics | undefined)?.setVisible(locked);
      (bag['__doorBg'] as Phaser.GameObjects.Rectangle | undefined)?.setStrokeStyle(1, 0x4fa3a5, locked ? 0 : 0.5);
    });
  }

  /** Dónde pisa un candidato (para el anillo): los pies de la persona o el contacto del marcador con el piso. */
  private feetOf(key: string): { x: number; y: number } | null {
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const npc = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      return npc ? { x: npc.x, y: npc.y } : null;
    }
    // Posición de reposo del marcador (la del dato, no la del icono que flota): el anillo es estático.
    const obj = this.markerData.get(key);
    return obj && this.markers.has(key) ? { x: obj.x, y: obj.y + 16 } : null;
  }

  /**
   * Anillo estático bajo el siguiente destino: creado una vez por sala y reposicionado al cambiar la clave.
   * Sin animación (tampoco con movimiento normal): no hay tween ni trabajo por cuadro. Va bajo los
   * actores (profundidad de entorno), con halo oscuro para que se lea sobre cualquier piso.
   */
  private syncTargetRing(): void {
    const key = this.nextTargetKey;
    const feet = key !== null && !this.dimmedKeys.has(key) ? this.feetOf(key) : null;
    if (!feet) {
      this.targetRing?.halo.setVisible(false);
      this.targetRing?.ring.setVisible(false);
      return;
    }
    if (!this.targetRing || !this.targetRing.ring.scene) {
      const depth = DEPTH.ENVIRONMENT + 0.5;
      const halo = this.add.ellipse(0, 0, 70, 26).setStrokeStyle(4, RING_HALO_COLOR, 0.85).setDepth(depth);
      const ring = this.add.ellipse(0, 0, 68, 24).setStrokeStyle(2, RING_COLOR, 0.9).setDepth(depth + 0.01);
      this.targetRing = { halo, ring };
    }
    const { halo, ring } = this.targetRing;
    if (ring.x !== feet.x || ring.y !== feet.y) {
      halo.setPosition(feet.x, feet.y);
      ring.setPosition(feet.x, feet.y);
    }
    halo.setVisible(true);
    ring.setVisible(true);
  }

  /** Reinicia lo que `children.removeAll` destruye al reconstruir la sala. */
  private resetOrientationVisuals(): void {
    this.targetRing = undefined;
    this.revealed.length = 0;
    // El contorno y el verbo del puntero también los destruye `children.removeAll`: se vuelven a crear al usarlos.
    this.hoverOutline = undefined;
    this.hoverLabel = undefined;
    this.hoverKey = null;
  }

  private isInteractive(o: MapObjectState): boolean {
    return o.type === 'EXIT' || o.type === 'TOOL' || o.type === 'ROUTE'
      || o.decisionOptionId != null
      || (o.toolCode != null && o.toolCode !== '')
      || o.dialogue != null;
  }

  /**
   * Per-object ambient behavior (B1). Interactive markers get a gentle float
   * (they must stay put for interaction); non-interactive actors wander/patrol
   * via the motion helpers, collision-aware. Static when reduced motion.
   */
  private applyAmbientLife(marker: Phaser.GameObjects.Container, object: MapObjectState) {
    if (this.callbacks.reduceMotion) return;
    // Las personas ya respiran con su hoja de reposo; el vaivén queda para herramientas y objetos.
    if (object.type === 'PERSON' && this.isInteractive(object)) return;

    if (this.isInteractive(object)) {
      // Interactable juice: subtle float on top of the existing glow pulse.
      this.tweens.add({
        targets: marker, y: object.y - 3, duration: 1400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return;
    }

    const pattern = resolvePattern(object);
    if (pattern.type === 'idle') {
      if (object.type !== 'PERSON') {
        this.tweens.add({
          targets: marker, y: object.y - 2, duration: 1700,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      }
      return;
    }
    this.ambientMovers.set(object.key, {
      key: object.key,
      origin: { x: object.x, y: object.y },
      pattern,
      target: null,
      retargetAt: 0,
      patrolIdx: 0,
    });
  }

  private updateAmbientMovers(time: number, delta: number) {
    if (this.motionPaused || this.callbacks.reduceMotion || this.ambientMovers.size === 0) return;
    const step = this.AMBIENT_SPEED * (delta / 1000);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (!marker) continue;
      if (!mover.target || reached(marker, mover.target, 2) || time >= mover.retargetAt) {
        mover.target = this.nextAmbientTarget(mover);
        mover.retargetAt = time + this.AMBIENT_RETARGET_MS;
      }
      if (!mover.target) continue;
      const next = stepToward(marker, mover.target, step);
      if (!this.wouldCollide(next.x, next.y)) {
        marker.setPosition(next.x, next.y);
      } else {
        mover.target = null;   // blocked → re-pick next frame
      }
    }
  }

  private nextAmbientTarget(mover: AmbientMover): { x: number; y: number } | null {
    const step = nextAmbientStep(mover.pattern, mover, Math.random);
    mover.patrolIdx = step.patrolIdx;
    return step.target;
  }

  /** One tasteful scene-level effect: faint, slow-rising dust motes. */
  private spawnAmbientDust(w: number, h: number) {
    if (this.callbacks.reduceMotion) return;
    for (let i = 0; i < 5; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(60, w - 60), Phaser.Math.Between(80, h - 120),
        1.5, 0x9dc0e8, 0.18,
      ).setDepth(2.5);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(20, 48),
        x: mote.x + Phaser.Math.Between(-16, 16),
        alpha: 0,
        duration: Phaser.Math.Between(4200, 7200),
        delay: Phaser.Math.Between(0, 2600),
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private buildGeomMarker(color: number): Phaser.GameObjects.Container {
    const glow = this.add.circle(0, 0, 34, color, .16);
    const base = this.add.circle(0, 0, 24, color, .9).setStrokeStyle(3, 0xffffff, .95);
    if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: glow, scale: 1.2, alpha: .08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return this.add.container(0, 0, [glow, base]);
  }

  private buildToolMarker(color: number, label: string): Phaser.GameObjects.Container {
    const glow = this.add.circle(0, 0, 30, color, .14);
    const base = this.add.rectangle(0, 0, 42, 28, color, .9)
      .setStrokeStyle(3, 0xffffff, .92);
    const shine = this.add.rectangle(-7, -7, 22, 3, 0xffffff, .28);
    const text = this.add.text(0, 0, label.slice(0, 4).toUpperCase(), {
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(.5);
    if (!this.callbacks.reduceMotion) {
      this.tweens.add({ targets: glow, scale: 1.15, alpha: .07, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return this.add.container(0, 0, [glow, base, shine, text]);
  }

  private frameForType(type: string): number {
    const map: Record<string, number> = {
      PERSON: KenneyDungeonFrames.DESK, OBJECT: KenneyDungeonFrames.CABINET,
      ROUTE: KenneyDungeonFrames.PLANT, TOOL: KenneyDungeonFrames.CABINET,
      WARNING: KenneyDungeonFrames.DESK
    };
    return map[type] ?? KenneyDungeonFrames.DESK;
  }

  /**
   * Ordena un actor por la Y de sus PIES (2.5D: más abajo = más al frente).
   * El jugador ya está anclado a pies (offset 0); NPCs/markers/guía guardan en
   * `__feetOffset` la distancia centro→pies para comparar al mismo nivel.
   */
  private ysort(obj: Phaser.GameObjects.Container): void {
    const feetOffset = Number((obj as unknown as Record<string, unknown>)['__feetOffset'] ?? 0);
    obj.setDepth(actorDepth(obj.y + feetOffset));
  }

  /** Registra la distancia centro→pies de un actor y lo ordena ya mismo. */
  private setFeetOffset(obj: Phaser.GameObjects.Container, offset: number): void {
    (obj as unknown as Record<string, unknown>)['__feetOffset'] = offset;
    this.ysort(obj);
  }

  /** Mueve con sliding contra paredes. Devuelve true si hubo avance real. */
  private movePlayer(dx: number, dy: number): boolean {
    if (!this.player) return false;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    // Try full movement
    if (!this.wouldCollide(nx, ny)) { this.player.setPosition(nx, ny); return true; }
    // Slide along walls: try horizontal-only
    if (dx !== 0 && !this.wouldCollide(nx, this.player.y)) { this.player.setPosition(nx, this.player.y); return true; }
    // Slide along walls: try vertical-only
    if (dy !== 0 && !this.wouldCollide(this.player.x, ny)) { this.player.setPosition(this.player.x, ny); return true; }
    // Fully blocked
    return false;
  }

  /**
   * true si poner los PIES del jugador en (x, y) chocaría. Usa el hitbox de
   * pies (player-motion.util): muebles y paredes bloquean pies; la cabeza y el
   * pelo pueden solapar visualmente sin chocar. Con wallsLayer (Tiled) prueba
   * las 4 esquinas del hitbox; si no, las zonas AABB de la sala/backend.
   *
   * Siempre se suma la regla autoritativa del servidor (GAME-01): una posición
   * que el backend rechazaría tampoco es caminable aquí, así la posición
   * persistida nunca se queda atrás en silencio y las acciones validadas por
   * proximidad no fallan con "demasiado lejos".
   */
  private wouldCollide(x: number, y: number): boolean {
    if (this.world && serverRejectsPlayerAt(this.world, x, y)) return true;
    const hb = playerHitbox(x, y);
    if (this.wallsLayer) {
      const corners = [
        { x: hb.x, y: hb.y }, { x: hb.x + hb.width, y: hb.y },
        { x: hb.x, y: hb.y + hb.height }, { x: hb.x + hb.width, y: hb.y + hb.height },
      ];
      return corners.some(pt => {
        const tile = this.wallsLayer!.getTileAtWorldXY(pt.x, pt.y);
        return tile !== null && tile.index > 0;
      });
    }
    // Legacy fallback: backend AABB zones
    if (!this.world) return false;
    const mapKey = this.world.map.key;
    // Salas del caso PDF: geometría propia por sala (espejo del seed backend).
    const caseZones = caseRoomCollisions(mapKey);
    const zones = caseZones
      ? caseZones
      : this.authoredRoomActive
        ? AUTHORED_CLINICAL_COLLISIONS
        : isHospitalMap(mapKey)
          ? HOSPITAL_COLLISIONS
          : isComisariaMap(mapKey)
            ? COMISARIA_COLLISIONS
            : this.world.collisions.map(z => ({ x: z.x, y: z.y, width: z.width, height: z.height }));
    return zones.some(z => rectsIntersect(hb, z));
  }

  /** Pieza de la lista de trabajo de candidatos (se crea una sola vez y se reutiliza). */
  private candidateAt(index: number): NearbyCandidate {
    return this.candidatePool[index] ??= { key: '', kind: 'marker', exit: false, distance: 0, radius: 0 };
  }

  /**
   * Proximidad por cuadro: marcadores y personas en UNA lista (radios 74 y 72), `pickNearby` elige el
   * principal y el secundario, y `selectRevealed` los rótulos. Reutiliza listas y piezas: no asigna
   * nada. Solo cuando cambia el principal, el secundario o el conjunto de rótulos avisa a Angular y
   * repinta (`refreshMarkerStates`); el anillo y los atenuados no cuestan nada por cuadro.
   */
  private updateNearestInteraction(suppressSound = false) {
    const player = this.player;
    if (!player || !this.world) return;
    const px = player.x, py = player.y;
    const mapKey = this.world.map.key;
    const list = this.candidates;
    list.length = 0;
    let anyInRange = false;
    let targetX = 0, targetY = 0, targetSeen = false;
    // Un objeto atenuado nunca es el destino: ni anillo ni rótulo fijo (lo atenuado no llama la atención).
    const target = this.nextTargetKey !== null && !this.dimmedKeys.has(this.nextTargetKey) ? this.nextTargetKey : null;

    for (const [key, marker] of this.markers) {
      const obj = this.markerData.get(key);
      if (!obj) continue;
      const c = this.candidateAt(list.length);
      c.key = key; c.kind = 'marker'; c.exit = obj.type === 'EXIT';
      c.distance = Math.hypot(px - marker.x, py - marker.y); c.radius = MARKER_INTERACT_RADIUS;
      if (c.distance <= c.radius) anyInRange = true;
      list.push(c);
    }
    for (const [key, container] of this.npcMarkers) {
      const c = this.candidateAt(list.length);
      c.key = this.npcKeyOf(key); c.kind = 'npc'; c.exit = false;
      c.distance = Math.hypot(px - container.x, py - container.y); c.radius = NPC_INTERACT_RADIUS;
      if (c.distance <= c.radius) anyInRange = true;
      if (c.key === target) { targetSeen = true; targetX = container.x; targetY = container.y; }
      list.push(c);
    }
    // Las zonas ambientales son sabor de último recurso: solo cuentan si nada más está a su alcance.
    if (!anyInRange) {
      for (const zone of getSceneAmbientZones(mapKey)) {
        const c = this.candidateAt(list.length);
        c.key = zone.key; c.kind = 'marker'; c.exit = false;
        c.distance = Math.hypot(px - zone.x, py - zone.y); c.radius = zone.radius;
        list.push(c);
      }
    }

    const picked = pickNearby(list, this.nearestKey, this.pick);
    const primaryKey = picked.primary?.key ?? null;
    const alsoKey = picked.secondary?.key ?? null;
    selectRevealed(list, target, primaryKey, this.dimmedKeys, this.compactLabels ? 1 : 2, this.revealScratch);
    const revealChanged = !sameKeys(this.revealScratch, this.revealed);
    if (revealChanged) {
      const swap = this.revealed;
      this.revealed = this.revealScratch;
      this.revealScratch = swap;
    }
    // Un destino que se mueve (una persona que deambula) arrastra su anillo; el de un marcador queda
    // quieto en su sitio (la flotación suave del icono no lo mueve).
    const ring = this.targetRing?.ring;
    if (targetSeen && ring && (ring.x !== targetX || ring.y !== targetY)) {
      this.targetRing!.halo.setPosition(targetX, targetY);
      ring.setPosition(targetX, targetY);
    }

    const primaryChanged = primaryKey !== this.nearestKey;
    if (primaryChanged) {
      this.nearestKey = primaryKey;
      this.callbacks.onProximity(primaryKey ? this.proximityObjectFor(primaryKey) : null);
    }
    const alsoChanged = alsoKey !== this.alsoKey;
    if (alsoChanged) {
      this.alsoKey = alsoKey;
      this.callbacks.onProximityAlso(alsoKey ? this.proximityObjectFor(alsoKey) : null);
    }
    if (primaryChanged || alsoChanged || revealChanged) this.refreshMarkerStates();
    // Casi siempre vacío: solo los rótulos visibles de quien camina o deambula siguen a su dueño.
    for (let i = 0; i < this.followLabels.length; i++) this.placeLabel(this.followLabels[i]);
    // Play blip only when *entering* range (the primary changes to a key), not on every frame.
    // suppressSound=true on spawn/world-switch to avoid a false-positive blip on load.
    if (primaryChanged && primaryKey && !this.callbacks.reduceMotion && !this.callbacks.sfxMuted && !suppressSound) {
      this.sound.play('proximity-blip', { volume: 0.45 });
    }
  }

  /**
   * Lo que se le entrega a Angular de un candidato: el marcador con su nombre de pantalla y su posición
   * viva, la zona ambiental, o una persona como `MapObjectState` sintético (`npc:{clave}`, tipo PERSON,
   * sin texto sembrado: el texto del botón lo pone quien lo muestra).
   */
  private proximityObjectFor(key: string): MapObjectState | null {
    const mapKey = this.world?.map.key ?? '';
    if (key.startsWith(NPC_KEY_PREFIX)) {
      const container = this.npcMarkers.get(key.slice(NPC_KEY_PREFIX.length));
      const npc = this.npcConfigFor(key);
      if (!container || !npc) return null;
      return {
        key, label: npc.displayName, type: 'PERSON', x: container.x, y: container.y,
        width: 0, height: 0, color: '#4fa3a5', icon: 'person', shortCode: '', collision: false,
        interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
      };
    }
    const obj = this.markerData.get(key);
    const marker = this.markers.get(key);
    if (obj && marker) {
      return { ...obj, label: getSceneDisplayLabel(obj, mapKey), x: marker.x, y: marker.y };
    }
    const zone = getSceneAmbientZones(mapKey).find(z => z.key === key);
    return zone ? buildSceneAmbientObject(zone, mapKey) : null;
  }

  /**
   * Pinta el estado de los marcadores y personas. Solo se llama cuando algo cambió (principal,
   * secundario, conjunto de rótulos, selección, atenuados, destino), nunca por cuadro.
   */
  private refreshMarkerStates() {
    this.syncLabelScale();
    const revealed = this.revealed;
    this.syncTargetRing();
    this.applyDoorStates();
    this.followLabels.length = 0;
    this.markers.forEach((m, key) => {
      const sel = key === this.selectedKey, near = key === this.nearestKey;
      const bag = m as unknown as Record<string, unknown>;
      const emphasis = markerEmphasis({
        selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true,
        dimmed: this.dimmedKeys.has(key),
      });
      m.setScale(emphasis.scale);
      m.setAlpha(emphasis.alpha);
      const label = this.markerLabels.get(key);
      if (!label) return;
      const shown = sel || near || revealed.includes(key);
      label.setAlpha(shown ? 1 : 0);
      if (shown) {
        this.placeLabel(key);
        if (this.ambientMovers.has(key)) this.followLabels.push(key);
      }
    });
    this.doorHints.forEach((h, key) => h.setVisible(key === this.nearestKey || revealed.includes(key)));
    this.npcMarkers.forEach((container, key) => {
      const candidateKey = this.npcKeyOf(key);
      const bag = container as unknown as Record<string, unknown>;
      const shown = revealed.includes(candidateKey);
      (bag['__labelSprite'] as Phaser.GameObjects.Text | undefined)?.setAlpha(shown ? 1 : 0);
      const inRange = candidateKey === this.nearestKey || candidateKey === this.alsoKey;
      (bag['__hintSprite'] as Phaser.GameObjects.Text | undefined)?.setAlpha(inRange ? 1 : 0);
      if (shown || inRange) {
        this.placeLabel(candidateKey);
        if (this.npcMovers.has(key)) this.followLabels.push(candidateKey);
      }
    });
  }

  /**
   * Reescala los rótulos para que midan ≥ 12 px de pantalla con el tamaño del canvas y el zoom de cámara
   * de ahora. Devuelve true si cambió algo. Se llama al cambiar el tamaño del canvas y al repintar
   * (el zoom lo fija cada render de sala), nunca por cuadro.
   */
  private syncLabelScale(): boolean {
    // `scale` y `cameras` no existen antes de `create()` ni tras destruir la escena (cambio de ruta).
    const displayScale = this.scale?.displayScale?.x;
    if (!displayScale) return false;
    const zoom = this.cameras?.main?.zoom ?? 1;
    const next = labelScaleFor(displayScale, zoom);
    if (Math.abs(next - this.labelScale) < 0.01) {
      // La escala no cambió, pero el zoom de la sala sí pudo: la resolución de los textos lo sigue (PHA-2).
      this.pixelRender?.refreshTexts(zoom);
      return false;
    }
    this.labelScale = next;
    // Ancho máximo del rótulo: 168 px de pantalla (en coordenadas locales del texto).
    this.labelWrap = Math.min(140, (LABEL_MAX_SCREEN_WIDTH_PX * displayScale) / (zoom * next));
    this.markerLabels.forEach(label => label.setScale(next).setWordWrapWidth(this.labelWrap));
    this.hoverLabel?.setScale(next);
    this.doorHints.forEach(hint => { hint.setScale(next); this.placeDoorHint(hint); });
    this.npcMarkers.forEach(container => {
      const bag = container as unknown as Record<string, unknown>;
      (bag['__labelSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
      (bag['__hintSprite'] as Phaser.GameObjects.Text | undefined)?.setScale(next);
    });
    this.pixelRender?.refreshTexts(zoom);
    return true;
  }

  /** El canvas cambió de tamaño: los rótulos se reescalan y se vuelven a colocar (la pista se apila según el alto del nombre). */
  private onScaleResize(): void {
    if (this.syncLabelScale() && this.world) this.refreshMarkerStates();
  }

  private borderFor(theme: string): number {
    const m: Record<string, number> = {
      'protection-route':0x2f7476,'technical-record':0x2f5f8f,
      'risk-assessment':0x5b4f8f,'child-protection':0x5d9278,'follow-up':0x2f5f8f
    };
    return m[theme] ?? 0x4f7cac;
  }
}

@Component({
  selector: 'app-game-world',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  host: { '[class.touch-input]': 'touchInput()' },
  template: `
    <div #gameHost class="phaser-host" role="application"
      [attr.data-world-ready]="renderReady()"
      [attr.data-rendered-map-key]="renderedMapKey()"
      [attr.data-rendered-scenario-key]="renderedScenarioKey()"
      aria-label="Mapa explorable de la simulación. Usa WASD o flechas para moverte, E para interactuar.">
    </div>
    @if (!assetsReady() && showLoader()) {
      <div class="world-loading">
        <p class="world-loading__label" role="status">Preparando la escena…</p>
        <div class="world-loading__track" role="progressbar" aria-label="Carga de la escena"
          aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="loadPercent()">
          <span class="world-loading__fill" [style.transform]="'scaleX(' + loadPercent() / 100 + ')'"></span>
        </div>
        <p class="world-loading__percent" aria-hidden="true">{{ loadPercent() }}&nbsp;%</p>
      </div>
    }
    @if (criticalLoadFailed()) {
      <div class="world-load-warning" role="alert">
        <p>Parte del mapa no cargó y la sala se ve simplificada.</p>
        <div class="world-load-warning__actions">
          <button type="button" class="psy-button" (click)="retryLoad()">Reintentar</button>
          <button type="button" class="psy-button psy-button--ghost" (click)="dismissLoadWarning()">Seguir así</button>
        </div>
      </div>
    }
    <div class="touch-controls" role="group" aria-label="Controles táctiles">
      <div class="touch-dpad">
        <button type="button" class="psy-icon-button touch-btn touch-btn--up" aria-label="Mover arriba"
          (pointerdown)="holdDirection($event, 'up')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--left" aria-label="Mover izquierda"
          (pointerdown)="holdDirection($event, 'left')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'left')"><mat-icon>keyboard_arrow_left</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--right" aria-label="Mover derecha"
          (pointerdown)="holdDirection($event, 'right')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'right')"><mat-icon>keyboard_arrow_right</mat-icon></button>
        <button type="button" class="psy-icon-button touch-btn touch-btn--down" aria-label="Mover abajo"
          (pointerdown)="holdDirection($event, 'down')" (pointerup)="releaseDirection()"
          (pointercancel)="releaseDirection()" (lostpointercapture)="releaseDirection()"
          (contextmenu)="$event.preventDefault()"
          (click)="keyboardNudge($event, 'down')"><mat-icon>keyboard_arrow_down</mat-icon></button>
      </div>
      <!-- Sin [disabled] ni aria-disabled (Playwright los toma por «no habilitado» y el e2e táctil no podría
           tocar): sin nada cerca el toque se acepta y la escena avisa (nothingNearby). -->
      <button type="button" class="psy-button psy-button--glass touch-interact"
        [class.touch-interact--idle]="!interactLabel()"
        [attr.aria-label]="'Interactuar: ' + (interactLabel() ?? 'Acércate a algo')"
        (click)="interactNearest()"><mat-icon aria-hidden="true">touch_app</mat-icon><span class="touch-interact__label">{{ interactLabel() ?? 'Acércate a algo' }}</span></button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    :host { display: block; position: relative; width: 100%; height: 100%; }
    .phaser-host { width: 100%; height: 100%; }
    /* El lienzo mide el contenedor × devicePixelRatio y Phaser lo devuelve al tamaño
       CSS del contenedor (scale.zoom = 1/dpr): nada lo estira a escalas fraccionarias. */
    :host ::ng-deep .phaser-host canvas { display: block; }
    /* Cruceta abajo a la izquierda y «Interactuar» abajo a la derecha. El lienzo ocupa todo el contenedor
       (ya no hay bandas negras de encaje 16:9): la sala centrada deja márgenes a los lados. El
       contenedor no recibe toques; solo los controles. */
    .touch-controls {
      display: none;
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 8px;
      grid-template-columns: auto auto;
      justify-content: space-between;
      align-items: end;
      gap: 8px;
      pointer-events: none;
      z-index: 48;
    }
    .touch-dpad, .touch-interact { pointer-events: auto; }
    /* Cruz de 3x3 de 48 px: 3 x 48 + 2 x 4 = 152 px, menos que la banda negra de 844x390 (169 px). */
    .touch-dpad {
      display: grid;
      grid-template-columns: repeat(3, 48px);
      grid-template-rows: repeat(3, 48px);
      gap: 4px;
    }
    .touch-btn { width: 48px; height: 48px; }
    .touch-btn--up { grid-area: 1 / 2; }
    .touch-btn--left { grid-area: 2 / 1; }
    .touch-btn--right { grid-area: 2 / 3; }
    .touch-btn--down { grid-area: 3 / 2; }
    .touch-btn {
      background: rgba(8,12,18,.7); border-color: rgba(79,163,165,.3); color: #4fa3a5;
      /* Mantener pulsado no debe hacer scroll, zoom, seleccionar texto ni abrir el menú largo. */
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    /* El botón dice con qué va a interactuar: el texto cabe en la banda lateral partiéndose en líneas. */
    .touch-interact {
      font-size: .82rem;
      min-height: 48px;
      max-width: 156px;
      padding: 6px 10px;
      gap: 6px;
      line-height: 1.15;
      white-space: normal;
      text-align: center;
    }
    .touch-interact__label { overflow-wrap: anywhere; }
    /* Sin nada cerca (el estado más frecuente): texto oscuro sobre el vidrio claro (>= 4,5:1 incluso sobre un mundo negro,
       el peor fondo) y borde discontinuo: el reposo no se distingue solo por el tono. En anchos < 700 px manda el fondo oscuro. */
    .touch-interact--idle { color: #10131a; border-style: dashed; }
    /* Aparece solo si la carga pasa de 300 ms: con caché caliente no parpadea. */
    .world-loading {
      position: absolute;
      inset: 0;
      min-height: 240px;
      z-index: 50;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 10px;
      background: #0e1322;
      color: #e8f0f4;
      animation: world-loading-in 200ms var(--psy-ease-out) 300ms both;
    }
    .world-loading__label { margin: 0; font-size: .95rem; }
    .world-loading__track {
      width: min(280px, 70vw);
      height: 6px;
      border-radius: 999px;
      background: rgba(182,156,255,.18);
      overflow: hidden;
    }
    .world-loading__fill {
      display: block;
      height: 100%;
      background: #b69cff;
      transform-origin: left center;
      transition: transform 160ms linear;
    }
    .world-loading__percent {
      margin: 0;
      font: 600 .8rem/1 'JetBrains Mono', ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      color: rgba(232,240,244,.72);
    }
    .world-load-warning {
      position: absolute;
      left: 50%;
      top: 16px;
      z-index: 51;
      transform: translateX(-50%);
      width: min(420px, calc(100% - 32px));
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(245,184,75,.45);
      border-radius: 10px;
      background: rgba(8,12,18,.94);
      color: #e8f0f4;
      text-align: center;
    }
    .world-load-warning p { margin: 0; }
    .world-load-warning__actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    @keyframes world-loading-in { from { opacity: 0; } to { opacity: 1; } }
    /* Por tipo de puntero: tabletas en horizontal sí; ventanas de escritorio estrechas no. */
    /* La cruceta sigue a la ENTRADA real (F6-7): el primer toque la muestra y mover el ratón la oculta; sin entrada
       aún, vale el puntero principal. Lo decide la clase touch-input del anfitrión. */
    :host(.touch-input) .touch-controls { display: grid; }
    /* En anchos cortos (< 700 px) la cruz ya no cabe en las bandas negras y se encima al mundo:
       se hace semitransparente para que el piso se siga viendo por debajo. */
    @media (max-width: 699px) {
      :host(.touch-input) .touch-btn { background: rgba(8,12,18,.45); border-color: rgba(79,163,165,.55); }
      /* Fondo oscuro translúcido: el texto pasa a claro (el vidrio claro de escritorio lleva texto oscuro). */
      :host(.touch-input) .touch-interact { background: rgba(8,12,18,.6); border-color: rgba(232,240,244,.5); color: #e8f0f4; }
      :host(.touch-input) .touch-interact--idle { color: rgba(232,240,244,.8); border-style: dashed; }
    }
  `]
})
export class GameWorldComponent implements OnChanges, OnDestroy {
  readonly world = input<SimulationWorldState | null>(null);
  readonly scenarioConfig = input<ScenarioConfig | null>(null);
  readonly selectedInteractionKey = input<string | null>(null);
  readonly nearbyInteraction = input<MapObjectState | null>(null);
  /** Lo que dice el botón táctil: el verbo y el objeto del candidato principal; null si no hay nada cerca. */
  readonly interactLabel = computed(() => {
    const nearby = this.nearbyInteraction();
    if (!nearby) return null;
    const state = nearby.type === 'EXIT' ? this.doorStates()[nearby.key] : undefined;
    const door = state ? { state, missing: [], stageLocked: false, message: null } : null;
    return interactionVerb(nearby, door).text;
  });
  readonly guide = input<SceneGuideEntry | null>(null);
  /** Personas con las que ya se habló (claves de persona): lo ya examinado se resalta con el ratón aunque esté lejos. */
  readonly viewedNpcKeys = input<ReadonlySet<string>>(NO_KEYS);
  /** true mientras hay diálogo/journal/outcome: congela NPCs y ambient. */
  readonly motionPaused = input(false);
  readonly sfxMuted = input(false);
  readonly reduceMotion = input<boolean | null>(null);
  /** stressIndex del intento (0-100): mueve la viñeta de crisis. */
  readonly stressLevel = input(0);
  /** Siguiente destino del proceso (clave de objeto o `npc:{clave}`): lleva el anillo y el rótulo fijo. */
  readonly nextTargetKey = input<string | null>(null);
  /** Estado vivo de cada puerta por clave: la bloqueada lleva candado y borde discontinuo en su rótulo. */
  readonly doorStates = input<Record<string, 'open' | 'locked'>>({});
  /** Objetos de decisión de otras etapas: se atenúan, sin anillo y con rótulo solo muy cerca. */
  readonly dimmedKeys = input<ReadonlySet<string>>(new Set<string>());
  /** Modo compacto (móvil horizontal): rótulos mínimos. El puntero táctil ya lo implica. */
  readonly compact = input(false);
  /**
   * Con false el mundo no pinta su propio indicador de carga: el anfitrión ya muestra UNO desde el intento hasta el
   * primer cuadro (`worldReady`), y dos en secuencia eran tres señales distintas (plan visual F6-1).
   */
  readonly showLoader = input(true);
  /** Primer cuadro pintado del mapa actual: el anfitrión retira su indicador de carga. */
  readonly worldReady = output<void>();
  /** Candidato PRINCIPAL en rango; un NPC llega como `MapObjectState` sintético con key `npc:{clave}`. */
  readonly proximity = output<MapObjectState | null>();
  /** Candidato secundario en rango (otra persona u objeto), o null. */
  readonly proximityAlso = output<MapObjectState | null>();
  /** Se pidió interactuar (E o «Interactuar») y no hay nada al alcance. */
  readonly nothingNearby = output<void>();
  readonly interact = output<MapObjectState>();
  readonly positionChange = output<{ x: number; y: number }>();
  readonly roomExit = output<{ targetRoomKey: string; entryX: number; entryY: number }>();
  readonly enterRoom = output<{ targetNodeKey: string; entryX: number; entryY: number }>();
  readonly npcInteract = output<NpcConfig>();
  /** Terminó la caminata pedida con «Ir a…» (F6-11): llegó o no pudo. */
  readonly walkEnded = output<{ key: string; label: string; outcome: 'arrived' | 'blocked' }>();
  readonly renderReady = signal(false);
  readonly renderedMapKey = signal<string | null>(null);
  readonly renderedScenarioKey = signal<string | null>(null);
  /** Progreso real de la precarga de Phaser (0-100). */
  readonly loadPercent = signal(0);
  /** true cuando terminó la precarga inicial (con o sin fallos). */
  readonly assetsReady = signal(false);
  /** Faltó un mapa o tileset: la sala se ve en paneles planos. */
  readonly criticalLoadFailed = signal(false);
  private scene?: DataDrivenWorldScene;
  private phaserGame?: Phaser.Game;
  private gameHost?: ElementRef<HTMLDivElement>;
  /** Deja de seguir el tamaño del contenedor y el devicePixelRatio. */
  private detachHostWatch?: () => void;
  /** Retira el bloqueo de desplazamiento por teclado (flechas y Espacio) de `window`. */
  private detachScrollKeyGuard?: () => void;

  private readonly kit = inject(KitService);
  /** El componente se destruyó mientras llegaba el paquete del kit. */
  private destroyed = false;
  private booting = false;

  /** La última entrada real (dedo o ratón): decide la cruceta junto con el puntero principal (F6-7, VD-5). */
  private lastInput: InputKind = null;
  readonly touchInput = signal(touchControlsVisible(null, matchesMedia(COARSE_POINTER_QUERY)));
  private readonly onPointerKind = (event: PointerEvent): void => {
    const next = nextInputKind(this.lastInput, event.pointerType, matchesMedia('(any-pointer: fine)'));
    if (next === this.lastInput) return;
    this.lastInput = next;
    this.zone.run(() => this.touchInput.set(touchControlsVisible(next, matchesMedia(COARSE_POINTER_QUERY))));
  };

  constructor(private readonly zone: NgZone) {
    // Fuera de Angular: el puntero se mueve ~60 veces por segundo y solo un cambio de entrada entra a la zona.
    zone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.onPointerKind, { capture: true, passive: true });
      document.addEventListener('pointermove', this.onPointerKind, { capture: true, passive: true });
    });
  }

  @ViewChild('gameHost')
  set host(value: ElementRef<HTMLDivElement> | undefined) {
    this.gameHost = value;
    if (value) this.boot();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['scenarioConfig']) {
      this.renderReady.set(false);
      this.renderedMapKey.set(null);
      this.renderedScenarioKey.set(null);
      this.scene?.setScenarioConfig(this.scenarioConfig());
    }
    if (changes['world'] && this.world()) {
      this.renderReady.set(false);
      this.renderedMapKey.set(null);
      this.renderedScenarioKey.set(null);
      this.scene?.setWorld(this.world()!);
    }
    if (changes['world'] || changes['viewedNpcKeys']) this.pushExamined();
    if (changes['selectedInteractionKey']) this.scene?.setSelected(this.selectedInteractionKey());
    if (changes['guide']) this.scene?.setGuide(this.guide());
    if (changes['motionPaused']) this.scene?.setMotionPaused(this.motionPaused());
    if (changes['sfxMuted']) this.scene?.setSfxMuted(this.sfxMuted());
    if (changes['reduceMotion']) this.scene?.setReduceMotion(this.effectiveReduceMotion());
    if (changes['stressLevel']) this.scene?.setStressLevel(this.stressLevel());
    if (changes['compact']) this.scene?.setCompactLabels(this.compact());
    if (changes['nextTargetKey'] || changes['doorStates'] || changes['dimmedKeys']) this.pushOrientation();
  }

  /** Lo ya examinado: los objetos que el servidor da por inspeccionados y las personas con quienes ya se habló. */
  private pushExamined(): void {
    const examined = new Set<string>(this.world()?.inspectedObjectKeys ?? []);
    for (const key of this.viewedNpcKeys()) examined.add(NPC_KEY_PREFIX + key);
    this.scene?.setExamined(examined);
  }

  /** Lleva a la escena el destino, el estado de las puertas y los atenuados. */
  private pushOrientation(): void {
    this.scene?.setOrientation({
      nextTargetKey: this.nextTargetKey(),
      doorStates: this.doorStates(),
      dimmedKeys: this.dimmedKeys(),
    });
  }

  /**
   * Vuelve a medir el contenedor y reencaja el canvas. Phaser no lo hace solo cuando el contenedor
   * cambia de tamaño sin que cambie la ventana (panel lateral que se abre y se cierra, pie que crece):
   * `refresh()` usa el tamaño en caché del contenedor, así que antes hay que leerlo (T0.3).
   */
  refreshScale(): void {
    const host = this.gameHost?.nativeElement;
    if (this.phaserGame && host) fitGameToHost(this.phaserGame, host);
  }

  ngOnDestroy() {
    this.destroyed = true;
    document.removeEventListener('pointerdown', this.onPointerKind, true);
    document.removeEventListener('pointermove', this.onPointerKind, true);
    this.detachScrollKeyGuard?.();
    this.detachScrollKeyGuard = undefined;
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.phaserGame?.destroy(true);
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }

  /** Pies del jugador en la escena (px enteros) o null si aún no existe. Es la posición viva:
   *  `positionChange` llega a Angular a lo sumo ~8 veces por segundo y va hasta 125 ms atrás. */
  playerPosition(): { x: number; y: number } | null {
    return this.scene?.playerPosition() ?? null;
  }

  /** Toque: el paso de siempre al instante; si se mantiene, la escena camina hasta soltar. */
  holdDirection(event: PointerEvent, direction: PlayerDirection) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // El paso va primero: con un `pointerId` ya inactivo la captura lanza y el toque se perdería.
    this.scene?.nudge(direction);
    this.scene?.setHeldDirection(direction);
    // Captura: si el dedo se desliza fuera del botón, el pointerup igual llega aquí.
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // Sin captura el toque sigue funcionando; solo se pierde el seguimiento fuera del botón.
    }
  }

  releaseDirection() { this.scene?.setHeldDirection(null); }

  /** Enter/Espacio sobre la flecha (click sin puntero, `detail === 0`): un paso. Los clics de
   *  puntero ya dieron su paso en pointerdown y no deben duplicarlo. */
  keyboardNudge(event: MouseEvent, direction: PlayerDirection) {
    if (event.detail === 0) this.nudge(direction);
  }

  /** Pies del jugador como data-player-x/y en el host de Phaser (contrato de navegación
   *  del e2e). Se escriben directo en el DOM: cambian en cada cuadro de caminata y una
   *  señal o un binding dispararían la detección de cambios de toda la app. */
  private writePlayerPosition(position: { x: number; y: number } | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host || !position) return;
    host.setAttribute('data-player-x', String(position.x));
    host.setAttribute('data-player-y', String(position.y));
  }

  interactNearest() { this.scene?.interactNearest(); }

  /** Personas, puertas y objetos de la sala a los que «Ir a…» puede llevar (F6-11). */
  places(): PlaceCandidate[] { return this.scene?.placeCandidates() ?? []; }

  /** Camina hasta una de ellas; false si ya no está (cambió la sala). */
  walkToKey(key: string): boolean { return this.scene?.walkToKey(key) ?? false; }

  /** Qué tiene el puntero encima, como `data-world-hover` del host (contrato del e2e: el contorno y el cursor viven en
   *  el lienzo). Directo al DOM: cambia con el puntero y no debe disparar la detección de cambios. */
  private writeHover(key: string | null): void {
    const host = this.gameHost?.nativeElement;
    if (!host) return;
    if (key === null) host.removeAttribute('data-world-hover');
    else host.setAttribute('data-world-hover', key);
  }

  /** Reinicia Phaser desde cero: vuelve a pedir lo que falló (lo demás sale de la caché
   *  del navegador) sin recargar la página ni perder el intento. */
  retryLoad(): void {
    this.detachHostWatch?.();
    this.detachHostWatch = undefined;
    this.phaserGame?.destroy(true);
    this.phaserGame = undefined;
    this.scene = undefined;
    this.renderReady.set(false);
    this.renderedMapKey.set(null);
    this.renderedScenarioKey.set(null);
    this.assetsReady.set(false);
    this.loadPercent.set(0);
    this.criticalLoadFailed.set(false);
    this.boot();
  }

  dismissLoadWarning(): void { this.criticalLoadFailed.set(false); }
  focus(key: string) { this.scene?.focus(key); }
  setScenarioConfig(config: ScenarioConfig | null) { this.scene?.setScenarioConfig(config); }
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    this.scene?.transitionToRoom(targetRoomKey, entryX, entryY);
  }
  playRevealEffects(feedback: SimulationFeedback | null) { this.scene?.playRevealEffects(feedback); }
  updatePatientVisualState(state: import('../../core/models/simulation.model').PatientState) {
    this.scene?.updatePatientVisualState(state);
  }

  private boot() {
    if (!this.gameHost || this.phaserGame || this.booting) return;
    this.booting = true;
    // El paquete del kit llega antes que Phaser; si falla, el juego arranca igual y los
    // actores caen a su marcador (KitService lo reintenta en el próximo boot).
    this.kit.load().then(bundle => bundle, () => null).then(bundle => {
      this.booting = false;
      if (!this.destroyed && this.gameHost && !this.phaserGame) this.startGame(bundle);
    });
  }

  private startGame(kit: KitBundle | null) {
    const reduceMotion = this.effectiveReduceMotion();
    this.zone.runOutsideAngular(() => {
      this.scene = new DataDrivenWorldScene({
        reduceMotion,
        kit,
        onReady:       () => this.zone.run(() => {
          this.renderedMapKey.set(this.world()?.map.key ?? null);
          this.renderedScenarioKey.set(this.scenarioConfig()?.startRoomKey ?? null);
          this.writePlayerPosition(this.scene?.playerPosition() ?? null);
          this.renderReady.set(true);
          this.worldReady.emit();
        }),
        onProximity:   i => this.zone.run(() => this.proximity.emit(i)),
        onProximityAlso: i => this.zone.run(() => this.proximityAlso.emit(i)),
        onNothingNearby: () => this.zone.run(() => this.nothingNearby.emit()),
        onInteract:    i => this.zone.run(() => this.interact.emit(i)),
        onPosition:    (x, y) => this.zone.run(() => this.positionChange.emit({ x, y })),
        onPositionFrame: (x, y) => this.writePlayerPosition({ x, y }),
        onRoomExit:    (targetRoomKey, entryX, entryY) =>
          this.zone.run(() => this.roomExit.emit({ targetRoomKey, entryX, entryY })),
        onEnterRoom:   (targetNodeKey, entryX, entryY) =>
          this.zone.run(() => this.enterRoom.emit({ targetNodeKey, entryX, entryY })),
        onNpcInteract: npc => this.zone.run(() => this.npcInteract.emit(npc)),
        onHover:       key => this.writeHover(key),
        onWalkEnded:   (key, label, outcome) => this.zone.run(() => this.walkEnded.emit({ key, label, outcome })),
        onLoadProgress: percent => this.zone.run(() => this.loadPercent.set(percent)),
        onLoadComplete: failures => this.zone.run(() => {
          this.loadPercent.set(100);
          this.assetsReady.set(true);
          this.criticalLoadFailed.set(failures.length > 0);
          if (failures.length > 0) console.warn('[GameWorld] Recursos esenciales sin cargar:', failures);
        }),
        sfxMuted: this.sfxMuted(),
      });
      this.scene.setStressLevel(this.stressLevel());
      this.phaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameHost!.nativeElement,
        backgroundColor: '#0e141a',
        pixelArt: true,    // vecino más cercano: el pixel art no se suaviza
        // Cámaras con roundPixels; en Phaser 4 eso solo redondea traslaciones puras, así que con zoom de
        // cámara ≥ 2 los vértices los alinea PixelRender (vertexRoundMode 'fullAuto', F0-7).
        roundPixels: true,
        scale: pixelScaleConfig(this.gameHost!.nativeElement),
        scene: this.scene
      });
      // Sin la captura de Phaser, flechas y Espacio desplazarían la página (la «Vista previa»
      // del editor tiene scroll). Se arma DESPUÉS de crear el juego: Phaser descarta los
      // `keydown` ya cancelados. En un reintento se vuelve a armar tras el nuevo juego.
      this.detachScrollKeyGuard?.();
      this.detachScrollKeyGuard = attachScrollKeyGuard(this.zone);
      // Lienzo en píxeles físicos: sigue al contenedor (panel derecho, rotación, bottom
      // sheet) y al devicePixelRatio (zoom del navegador, cambio de monitor).
      this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);
    });
    window.setTimeout(() => {
      this.scene?.setScenarioConfig(this.scenarioConfig());
      if (this.world()) this.scene?.setWorld(this.world()!);
      this.scene?.setGuide(this.guide());
      this.scene?.setMotionPaused(this.motionPaused());
      this.scene?.setSfxMuted(this.sfxMuted());
      this.scene?.setReduceMotion(this.effectiveReduceMotion());
      this.scene?.setCompactLabels(this.compact());
      this.pushExamined();
      this.pushOrientation();
    }, 0);
  }

  private effectiveReduceMotion(): boolean {
    return this.reduceMotion() ?? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }
}
