import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import Phaser from 'phaser';
import { CollisionZoneState, MapObjectState, NpcConfig, RoomConfig, ScenarioConfig, SimulationWorldState } from '../../core/models/simulation.model';
import { backgroundImage } from './world-editor/room-edit.util';
import { KenneyCharFrames, KenneyDungeonFrames } from './kenney-frames.constants';
import {
  HOSPITAL_COLLISIONS,
  HOSPITAL_ZONES,
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
  freeTileNear, MovementPattern, pickWanderTarget, reached, resolvePattern, stepToward,
} from './scene-motion.util';
import { SceneGuideEntry } from './scene-guide.config';
import { DEPTH, actorDepth, tiledLayerDepth } from './depth-sort.util';
import { loadAvatarConfig } from '../character/avatar-config.model';
import { AvatarRenderer } from './avatar-renderer';
import { VignettePipeline } from './effects/vignette-pipeline';
import { GameFeelService } from './effects/game-feel.service';

interface WorldCallbacks {
  onProximity:   (obj: MapObjectState | null) => void;
  onInteract:    (obj: MapObjectState) => void;
  onPosition:    (x: number, y: number) => void;
  onRoomExit:    (targetRoomKey: string, entryX: number, entryY: number) => void;
  onEnterRoom:   (targetNodeKey: string, entryX: number, entryY: number) => void;
  onNpcInteract: (npc: NpcConfig) => void;
  reduceMotion:  boolean;
}

interface AmbientMover {
  key: string;
  origin: { x: number; y: number };
  pattern: MovementPattern;
  target: { x: number; y: number } | null;
  retargetAt: number;
  patrolIdx: number;
}

/** Ids de los NPC character sprite sheets (v5.1 — 128×180 px, 18 frames). */
const NPC_CHAR_IDS = [
  'doctor-male-labcoat',
  'orientadora-casual-female',
  'orientadora-female-labcoat',
  'staff-male-glasses-beard',
] as const;
type NpcCharId = typeof NPC_CHAR_IDS[number];

class DataDrivenWorldScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container;
  private playerSprite?: Phaser.GameObjects.Sprite;
  /** Renderer multicapa del avatar pixel-art. Cuando sus texturas existen, reemplaza
   *  playerSprite como visual del jugador; el Container de physics sigue siendo this.player. */
  private avatarRenderer?: AvatarRenderer;
  private lastDirection: 'down' | 'up' | 'left' | 'right' = 'down';
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private wallsLayer?: Phaser.Tilemaps.TilemapLayer;
  private scenarioConfig?: ScenarioConfig;
  private currentRoomKey = '';
  private dbDoorArmed = true;
  private readonly tiledExits   = new Map<string, { x: number; y: number; w: number; h: number }>();
  private readonly npcMarkers   = new Map<string, Phaser.GameObjects.Container>();
  private readonly markers    = new Map<string, Phaser.GameObjects.Container>();
  private readonly markerData = new Map<string, MapObjectState>();
  private readonly doorHints  = new Map<string, Phaser.GameObjects.Container>();
  private readonly ambientMovers = new Map<string, AmbientMover>();
  private readonly AMBIENT_SPEED = 22;        // px/sec — slow, clinical
  private readonly AMBIENT_RETARGET_MS = 2600;
  private guideEntry: SceneGuideEntry | null = null;
  private guideContainer?: Phaser.GameObjects.Container;
  private guideSprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  private guideBubble?: Phaser.GameObjects.Container;
  private guideTarget: { x: number; y: number } | null = null;
  private guideArrived = false;
  private readonly GUIDE_SPEED = 70;        // px/sec
  private readonly GUIDE_HINT_RANGE = 92;   // px
  private guideBubbleHeight = 0;
  private guideBubbleHalfW = 0;
  private world?: SimulationWorldState;
  private nearestKey: string | null = null;
  private selectedKey: string | null = null;
  private ready = false;
  private assetsLoaded = false;
  private stepTimer = 0;
  private readonly STEP_INTERVAL = 280; // ms — natural walking cadence (~215 steps/min)
  private interactionCooldown = 0;
  private readonly INTERACTION_COOLDOWN_MS = 260;

  // ── Game feel ─────────────────────────────────────────────────────────────
  /** WebGL vignette post-FX pipeline — null in Canvas mode or before create(). */
  vignettePipeline: VignettePipeline | null = null;
  /** Current stress level (0-100). Driven by Angular via setStressLevel(). */
  currentStressLevel = 0;
  // ─────────────────────────────────────────────────────────────────────────

  constructor(private readonly callbacks: WorldCallbacks) {
    super('data-driven-world');
  }

  preload() {
    this.load.on('loaderror', (_file: Phaser.Loader.File) => {
      // Missing asset — fallback rendering used
    });

    // ── Avatar multicapa pixel-art — sprite sheets cargados opcionalmente ─────
    // Los PNGs pueden no existir todavía (los crea el equipo de diseño).
    // Si faltan, AvatarRenderer omite esas capas y el juego sigue funcionando.
    const avatarConfig = loadAvatarConfig();
    this.avatarRenderer = new AvatarRenderer(this, avatarConfig, 0, 0);
    this.avatarRenderer.preload();
    // ─────────────────────────────────────────────────────────────────────────

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

    // Character spritesheet (player + NPCs)
    this.load.spritesheet('characters',
      '/assets/game/kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png',
      { frameWidth: 16, frameHeight: 16 });

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

    // ── NPC character sprite sheets (v5.1 — 128×180 px, 18 frames) ───────────
    // Copiados desde docs/assets_5.1_solucionado. Fallos silenciosos via loaderror.
    const charFrameOpts = { frameWidth: 128, frameHeight: 180 };
    for (const id of NPC_CHAR_IDS) {
      this.load.spritesheet(`npc_${id}`, `/assets/characters/sprite-sheets/${id}.png`, charFrameOpts);
    }
    // ─────────────────────────────────────────────────────────────────────────

    this.load.once('complete', () => { this.assetsLoaded = true; });
  }

  create() {
    this.ready = true;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,E,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

    // ── WebGL Vignette PostFX Pipeline ────────────────────────────────────
    // Only registered when the renderer is WebGL — safe no-op in Canvas mode.
    const renderer = this.game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      renderer.pipelines.addPostPipeline('VignettePipeline', VignettePipeline);
      this.cameras.main.setPostPipeline(VignettePipeline);
      this.vignettePipeline = this.cameras.main.getPostPipeline(VignettePipeline) as VignettePipeline;
    }
    // ─────────────────────────────────────────────────────────────────────

    this.createAnimations();
    this.createNpcCharacterAnimations();
    this.renderWorld();
  }

  /** Called by the Angular component when the stress index changes. */
  setStressLevel(level: number): void {
    this.currentStressLevel = level;
  }

  override update(time: number, delta: number) {
    if (!this.player || !this.cursors || !this.keys || !this.world) return;
    const left  = this.cursors.left.isDown  || this.keys['A'].isDown;
    const right = this.cursors.right.isDown || this.keys['D'].isDown;
    const up    = this.cursors.up.isDown    || this.keys['W'].isDown;
    const down  = this.cursors.down.isDown  || this.keys['S'].isDown;
    const speed = 176 * (delta / 1000);
    const dx = Number(right) - Number(left);
    const dy = Number(down)  - Number(up);

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.movePlayer((dx / len) * speed, (dy / len) * speed);
      this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
      this.lastDirection = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');

      if (this.avatarRenderer?.isCreated()) {
        // ── Avatar multicapa: animar walk + flip para izquierda ──────────────
        if (!this.callbacks.reduceMotion) {
          this.avatarRenderer.play('walk', this.lastDirection);
        }
        this.avatarRenderer.setFlipX(this.lastDirection === 'left');
      } else if (this.playerSprite) {
        // ── Fallback Kenney sprite ─────────────────────────────────────────────
        this.playerSprite.setFlipX(this.lastDirection === 'left');
        if (!this.callbacks.reduceMotion) this.playerSprite.play(`walk-${this.lastDirection}`, true);
      }

      // ── Footstep audio: one random variant every STEP_INTERVAL ms ──────────
      if (!this.callbacks.reduceMotion) {
        this.stepTimer += delta;
        if (this.stepTimer >= this.STEP_INTERVAL) {
          this.stepTimer = 0;
          this.sound.play(`step${Phaser.Math.Between(0, 2)}`, { volume: 0.35 });
        }
      }
    } else {
      this.stepTimer = this.STEP_INTERVAL; // prime timer: first step fires on frame 1 of movement, not after a full interval

      if (this.avatarRenderer?.isCreated()) {
        // ── Avatar multicapa: frame idle estático ─────────────────────────────
        this.avatarRenderer.showIdleFrame(this.lastDirection);
        this.avatarRenderer.setFlipX(this.lastDirection === 'left');
      } else if (this.playerSprite) {
        // ── Fallback Kenney sprite ─────────────────────────────────────────────
        this.playerSprite.stop();
        // Show a clean standing frame instead of freezing mid-step
        const idleFrame =
          this.lastDirection === 'up'   ? KenneyCharFrames.PLAYER_WALK_UP[0]   :
          this.lastDirection === 'down' ? KenneyCharFrames.PLAYER_WALK_DOWN[0] :
                                          KenneyCharFrames.PLAYER_WALK_RIGHT[0];
        this.playerSprite.setFrame(idleFrame);
        this.playerSprite.setFlipX(this.lastDirection === 'left');
      }
    }

    this.interactionCooldown = Math.max(0, this.interactionCooldown - delta);
    if (this.interactionCooldown <= 0 &&
        (Phaser.Input.Keyboard.JustDown(this.keys['E']) ||
         Phaser.Input.Keyboard.JustDown(this.keys['SPACE']) ||
         Phaser.Input.Keyboard.JustDown(this.keys['ENTER']))) {
      this.interactionCooldown = this.INTERACTION_COOLDOWN_MS;
      // Clinical marker takes priority over NPC when both are in range
      if (this.nearestKey) {
        this.interactNearest();
      } else {
        this.interactNearestNpc();
      }
    }
    this.updateNearestInteraction();
    this.updateNpcHints();
    this.updateAmbientMovers(time, delta);
    this.updateGuide(delta);
    // 2.5D: re-ordena por Y a los actores que se mueven
    if (this.player) this.ysort(this.player);
    // AvatarRenderer: sincronizar posición con el player container y aplicar Y-sort.
    // El player container es la fuente de verdad de posición; el avatar renderer
    // es solo el visual y se mueve en sincronía.
    if (this.avatarRenderer?.isCreated() && this.player) {
      this.avatarRenderer.setPosition(this.player.x, this.player.y);
      this.avatarRenderer.setDepth(actorDepth(this.player.y));
    }
    if (this.guideContainer) this.ysort(this.guideContainer);
    for (const mover of this.ambientMovers.values()) {
      const marker = this.markers.get(mover.key);
      if (marker) this.ysort(marker);
    }
    this.checkExitTriggers();
    this.checkDbDoorTriggers();
    this.updateVignette(time);
  }

  /** Drives the vignette intensity based on stress level. High stress (>85) pulses. */
  private updateVignette(time: number): void {
    if (!this.vignettePipeline) return;
    if (this.currentStressLevel > 85) {
      this.vignettePipeline.pulseForCrisis(time);
    } else {
      // Base intensity scales linearly: 0% stress → 0.2, 85% stress → 0.46
      const baseIntensity = 0.2 + (this.currentStressLevel / 100) * 0.3;
      this.vignettePipeline.setIntensity(baseIntensity);
    }
  }

  setWorld(world: SimulationWorldState) {
    this.world = world;
    this.nearestKey = null;
    this.callbacks.onProximity(null);
    if (this.ready) this.renderWorld();
  }

  setScenarioConfig(config: ScenarioConfig) {
    this.scenarioConfig = config;
    if (this.ready && this.world) this.renderWorld();
  }

  /**
   * Called by Angular when the player steps through an exit.
   * Flashes white briefly, then fades out → loads new room → fades back in.
   */
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    if (!this.scenarioConfig) return;
    const roomConfig = this.scenarioConfig.rooms.find(r => r.key === targetRoomKey);
    if (!roomConfig) return;
    // Subtle white flash signals the room boundary crossing before the dark fade.
    this.cameras.main.flash(80, 255, 255, 255);
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.renderRoom(roomConfig, entryX, entryY);
      this.cameras.main.fadeIn(180, 0, 0, 0);
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

    const shadow = this.add.ellipse(0, 13, 15, 5, 0x000000, 0.2);
    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
    if (this.assetsLoaded && this.textures.exists('characters')) {
      sprite = this.add.sprite(0, 0, 'characters', KenneyCharFrames.NPC_SUPERVISOR_IDLE).setScale(1.5);
    } else {
      sprite = this.add.circle(0, -6, 9, 0x8a6cff, 1).setStrokeStyle(2, 0xffffff, 0.9);
    }
    const name = this.add.text(0, -26, entry.guideName, {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#cdd9ff',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
    }).setOrigin(0.5, 1);

    this.guideContainer = this.add.container(entry.spawnX, entry.spawnY, [shadow, sprite, name]).setDepth(actorDepth(entry.spawnY));
    this.guideSprite = sprite;
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
      this.guideContainer.y - 30,
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
      const goingLeft = next.x < this.guideContainer.x;
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
      if (this.guideSprite instanceof Phaser.GameObjects.Sprite) {
        this.guideSprite.setFlipX(goingLeft);
      }
      if (reached(this.guideContainer, this.guideTarget, 3)) this.guideArrived = true;
    }

    if (this.player && !this.callbacks.reduceMotion) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.guideContainer.x, this.guideContainer.y,
      );
      this.showGuideBubble(d <= this.GUIDE_HINT_RANGE);
    }
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') {
    const d = 34;
    const mv: Record<string, [number, number]> = { up:[0,-d], down:[0,d], left:[-d,0], right:[d,0] };
    this.movePlayer(...mv[direction]);
    if (this.player) this.callbacks.onPosition(Math.round(this.player.x), Math.round(this.player.y));
    this.updateNearestInteraction();
  }

  interactNearest() {
    if (!this.nearestKey) return;
    const obj = this.markerData.get(this.nearestKey);
    if (obj) this.callbacks.onInteract(obj);
  }

  focus(key: string) {
    const m = this.markers.get(key);
    if (!m || this.callbacks.reduceMotion) return;
    this.tweens.add({ targets: m, scale: 1.16, duration: 140, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
  }

  /**
   * Registra las animaciones Phaser para los NPC character sprite sheets (v5.1).
   * Idempotente: salta silenciosamente si la textura no cargó o la anim ya existe.
   * Layout: IDLE_FRONT [0-1] 2fps · WALK_DOWN [2-5] · WALK_LEFT [6-9] ·
   *         WALK_RIGHT [10-13] · WALK_UP [14-17] (todos 8 fps, loop:-1).
   */
  private createNpcCharacterAnimations(): void {
    const defs: Array<{ suffix: string; frames: number[]; fps: number }> = [
      { suffix: 'idle_front', frames: [0, 1],           fps: 2 },
      { suffix: 'walk_down',  frames: [2, 3, 4, 5],     fps: 8 },
      { suffix: 'walk_left',  frames: [6, 7, 8, 9],     fps: 8 },
      { suffix: 'walk_right', frames: [10, 11, 12, 13], fps: 8 },
      { suffix: 'walk_up',    frames: [14, 15, 16, 17], fps: 8 },
    ];
    for (const id of NPC_CHAR_IDS) {
      const texKey = `npc_${id}`;
      if (!this.textures.exists(texKey)) continue;
      for (const d of defs) {
        const animKey = `${texKey}_${d.suffix}`;
        if (this.anims.exists(animKey)) continue;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(texKey, { frames: d.frames }),
          frameRate: d.fps,
          repeat: -1,
        });
      }
    }
  }

  private createAnimations() {
    if (!this.assetsLoaded) return;
    const anims: Array<{ key: string; frames: readonly number[] }> = [
      { key: 'walk-down',  frames: KenneyCharFrames.PLAYER_WALK_DOWN },
      { key: 'walk-left',  frames: KenneyCharFrames.PLAYER_WALK_LEFT },
      { key: 'walk-right', frames: KenneyCharFrames.PLAYER_WALK_RIGHT },
      { key: 'walk-up',    frames: KenneyCharFrames.PLAYER_WALK_UP },
    ];
    for (const a of anims) {
      // Always destroy stale anim before recreating — the Phaser anim manager
      // is global and persists across renderWorld() / scene reloads.
      if (this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNumbers('characters', { frames: [...a.frames] }),
        frameRate: 6, repeat: -1
      });
    }
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
      const layer = tilemap.createLayer(layerData.name, tilesets);
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
      const startRoom = this.scenarioConfig.rooms.find(r => r.key === this.scenarioConfig!.startRoomKey)
        ?? this.scenarioConfig.rooms[0];
      this.renderRoom(startRoom, startRoom.spawnX, startRoom.spawnY);
      return;
    }

    this.cameras.main.stopFollow();   // clear stale follow target before destroying children
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.tiledExits.clear();
    this.wallsLayer = undefined;

    const mapKey  = this.world.map.key;
    const { width: mapW, height: mapH } = this.world.map;
    this.cameras.main.setBackgroundColor('#0e141a');

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
    if (isHospitalMap(mapKey)) {
      this.add.text(56, 66, 'Hospital — Urgencia vital y crisis', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: 'rgba(157,192,232,.72)',
      }).setDepth(6);
    }
    if (isComisariaMap(mapKey)) {
      this.add.text(56, 66, 'Comisaría — Restablecimiento de derechos', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: 'rgba(157,192,232,.72)',
      }).setDepth(6);
    }

    if (isHospitalMap(mapKey)) {
      this.renderHospitalEnvironment();
    }
    if (isComisariaMap(mapKey)) {
      this.renderComisariaEnvironment();
    }

    // Merge Tiled object positions with backend objects.
    // Tiled object "name" must match the backend MapObjectState "key".
    let mergedObjects = this.world.objects.map(obj => {
      const t = tiledObjects.find(o => o.name === obj.key);
      return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
    });
    if (isHospitalMap(mapKey) || isComisariaMap(mapKey)) {
      mergedObjects = applySceneDisplayLabels(mergedObjects, mapKey);
    }

    mergedObjects.forEach(obj => this.createMarker(obj));
    this.spawnAmbientDust(mapW, mapH);
    this.createPlayer(this.world.player.x, this.world.player.y);

    // ── Camera: 2× zoom, smooth follow, clamp to map bounds ────────────────
    const cam = this.cameras.main;
    const az = Number((this.world.map.ambient as { cameraZoom?: unknown })?.cameraZoom);
    cam.setZoom(Number.isFinite(az) && az > 0 ? az : 2);
    cam.setBounds(0, 0, mapW, mapH);
    cam.startFollow(this.player!, true, 0.12, 0.12);
    // startFollow args: target, roundPixels=true, lerpX=0.12, lerpY=0.12
    // roundPixels prevents sub-pixel shimmer on pixel art.
    // lerp 0.12 = Undertale-style "slightly behind" smooth follow.

    this.refreshMarkerStates();
    this.updateNearestInteraction(true); // suppress blip on initial spawn
    this.buildGuide();
    this.applyLightingOverlay();
  }

  /**
   * Renders a single room from the ScenarioConfig.
   * Called by renderWorld() in multi-room mode and by transitionToRoom().
   */
  private renderRoom(roomConfig: RoomConfig, spawnX: number, spawnY: number) {
    this.cameras.main.stopFollow();
    this.children.removeAll(true);
    this.markers.clear();
    this.markerData.clear();
    this.doorHints.clear();
    this.npcMarkers.clear();
    this.ambientMovers.clear();
    this.tiledExits.clear();
    this.wallsLayer = undefined;
    this.interactionCooldown = 0;
    this.cameras.main.setBackgroundColor('#0e141a');
    this.currentRoomKey = roomConfig.key;

    // Title pinned to screen
    this.add.text(16, 12, roomConfig.displayName, {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#9dc0e8', fontStyle: 'bold'
    }).setDepth(6).setScrollFactor(0);

    let actualMapW = 960, actualMapH = 528;
    let tiledObjects: Phaser.Types.Tilemaps.TiledObject[] = [];

    // ── Dark procedural base — MUST come before buildTiledLayers ─────────────
    // Phaser draws same-depth objects in insertion order. Floor tiles (depth 0)
    // are inserted by buildTiledLayers next. This rect (also depth 0) is inserted
    // first, so floor tiles render ON TOP of it — not hidden underneath.
    this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 40, actualMapH - 42, 0x131c28, 1).setDepth(0);
    const gfx = this.add.graphics().setDepth(1);
    gfx.lineStyle(1, 0x1c2d3e, 0.55);
    for (let gx = 16; gx < actualMapW; gx += 32) gfx.lineBetween(gx, 0, gx, actualMapH);
    for (let gy = 16; gy < actualMapH; gy += 32) gfx.lineBetween(0, gy, actualMapW, gy);
    // ─────────────────────────────────────────────────────────────────────────

    if (this.assetsLoaded) {
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

    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.setBounds(0, 0, actualMapW, actualMapH);

    // Room border
    this.add.rectangle(actualMapW / 2, actualMapH / 2, actualMapW - 36, actualMapH - 38)
      .setStrokeStyle(3, 0x4f7cac, .3).setFillStyle(0x000000, 0).setDepth(5);

    // Backend interactive objects (markers) — merge Tiled Objects-layer positions
    // (Tiled object "name" must match the backend MapObjectState "key").
    if (this.world) {
      const mergedObjects = this.world.objects.map(obj => {
        const t = tiledObjects.find(o => o.name === obj.key);
        return (t?.x != null && t?.y != null) ? { ...obj, x: t.x, y: t.y } : obj;
      });
      mergedObjects.forEach(obj => this.createMarker(obj));
    }

    this.spawnNpcs(roomConfig.npcs);
    this.createPlayer(spawnX, spawnY);
    cam.startFollow(this.player!, true, 0.12, 0.12);
    this.refreshMarkerStates();
    this.updateNearestInteraction(true);
    this.buildGuide();
    this.applyLightingOverlay();
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
    let onDoor = false;
    for (const obj of this.world.objects) {
      if ((obj.type || '').toUpperCase() !== 'EXIT') continue;
      const meta = obj.metadata as { targetNodeKey?: string; entryX?: number; entryY?: number } | undefined;
      const target = meta?.targetNodeKey;
      if (!target) continue;
      if (Phaser.Math.Distance.Between(px, py, obj.x, obj.y) <= 30) {
        onDoor = true;
        if (this.dbDoorArmed) {
          this.dbDoorArmed = false;
          this.callbacks.onEnterRoom(target, Number(meta?.entryX ?? obj.x), Number(meta?.entryY ?? obj.y));
        }
        break;
      }
    }
    if (!onDoor) this.dbDoorArmed = true;
  }

  private spawnNpcs(npcs: NpcConfig[]) {
    for (const npc of npcs) {
      const shadow = this.add.ellipse(0, 12, 14, 4, 0x000000, .18);

      let sprite: Phaser.GameObjects.GameObject;
      const charTexKey = npc.characterId ? `npc_${npc.characterId}` : null;
      if (charTexKey && this.textures.exists(charTexKey)) {
        // NPC con sprite real v5.1 (128×180 px, escala 0.55 → ~70px en mapa)
        sprite = (this.add.sprite(0, -16, charTexKey) as Phaser.GameObjects.Sprite)
          .setScale(0.55)
          .play(`${charTexKey}_idle_front`);
      } else if (this.assetsLoaded && this.textures.exists('characters')) {
        sprite = this.add.sprite(0, 0, 'characters', npc.frameIndex).setScale(1.5);
      } else {
        sprite = this.add.circle(0, -8, 10, 0x4fa3a5, 1);
      }

      const label = this.add.text(0, -28, npc.displayName, {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#e8f0f4',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',
      }).setOrigin(0.5, 1);

      const hint = this.add.text(0, -42, '▲ E', {
        fontFamily: 'Arial, sans-serif', fontSize: '8px', color: '#4fa3a5', align: 'center',
      }).setOrigin(0.5, 1).setAlpha(0);

      const container = this.add.container(npc.x, npc.y, [shadow, sprite, label, hint]).setDepth(actorDepth(npc.y));
      this.npcMarkers.set(npc.key, container);
      (container as unknown as Record<string, unknown>)['__npcConfig'] = npc;
      (container as unknown as Record<string, unknown>)['__hintSprite'] = hint;
    }
  }

  private readonly NPC_INTERACT_RANGE = 60;

  private updateNpcHints() {
    if (!this.player) return;
    for (const container of this.npcMarkers.values()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y);
      const hint = (container as unknown as Record<string, unknown>)['__hintSprite'] as Phaser.GameObjects.Text;
      if (hint) hint.setAlpha(dist <= this.NPC_INTERACT_RANGE ? 1 : 0);
    }
  }

  private interactNearestNpc() {
    if (!this.player) return;
    let closestDist = this.NPC_INTERACT_RANGE;
    let closestNpc: NpcConfig | null = null;
    for (const container of this.npcMarkers.values()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, container.x, container.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestNpc = (container as unknown as Record<string, unknown>)['__npcConfig'] as NpcConfig;
      }
    }
    if (closestNpc) this.callbacks.onNpcInteract(closestNpc);
  }

  /**
   * Called by Angular after a decision affects patient state.
   * Updates the patient NPC's tint and shake based on crisis/trust levels.
   */
  updatePatientVisualState(state: import('../../core/models/simulation.model').PatientState) {
    for (const [key, container] of this.npcMarkers) {
      if (!key.startsWith('paciente-')) continue;
      const sprite = container.list.find(
        (c): c is Phaser.GameObjects.Sprite => c instanceof Phaser.GameObjects.Sprite
      );
      if (!sprite) continue;
      if (state.crisisLevel >= 70) {
        sprite.setTint(0xff8888);
        if (!this.callbacks.reduceMotion) {
          this.tweens.add({
            targets: container, x: container.x + 2, duration: 60,
            yoyo: true, repeat: 3, ease: 'Sine.easeInOut'
          });
        }
      } else if (state.trustLevel >= 60 && state.emotionalState >= 60) {
        sprite.setTint(0xaaffcc);
      } else if (state.emotionalState <= 25) {
        sprite.setTint(0x8888ff);
      } else {
        sprite.clearTint();
      }
    }
  }

  private renderHospitalEnvironment() {
    const g = this.add.graphics().setDepth(3.5);

    HOSPITAL_ZONES.forEach(zone => {
      const cx = zone.x + zone.width / 2;
      const cy = zone.y + zone.height / 2;
      this.add.rectangle(cx, cy, zone.width, zone.height, zone.tint, zone.alpha)
        .setStrokeStyle(1, 0x4f7cac, 0.35)
        .setDepth(3.5);
      this.add.text(zone.x + 8, zone.y + 6, zone.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '9px',
        color: 'rgba(157,192,232,.75)',
        backgroundColor: 'rgba(8,12,18,.5)',
        padding: { x: 4, y: 2 },
      }).setDepth(4).setAlpha(0.85);
    });

    // Internal partitions
    g.lineStyle(2, 0x4f7cac, 0.45);
    g.lineBetween(604, 44, 604, 324);
    g.lineBetween(604, 360, 604, 496);
    g.lineBetween(334, 280, 334, 496);
    g.lineBetween(620, 44, 910, 44);
    g.lineBetween(620, 200, 910, 200);
    // Restricted-area barrier
    g.lineStyle(2, 0xa85062, 0.65);
    g.strokeRect(620, 48, 290, 160);

    // Entrance signage
    this.add.text(72, 392, 'URGENCIAS', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      color: '#e8f0f4',
      fontStyle: 'bold',
      backgroundColor: 'rgba(168,80,98,.82)',
      padding: { x: 8, y: 4 },
    }).setDepth(6);

    if (this.assetsLoaded && this.textures.exists('characters')) {
      // Family NPCs near escucha-segura zone
      this.add.sprite(150, 248, 'characters', KenneyCharFrames.NPC_PATIENT_IDLE)
        .setScale(2).setDepth(8).setTint(0xffc8b0);
      this.add.text(150, 276, 'Madre', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#e8c4b8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

      this.add.sprite(230, 268, 'characters', KenneyCharFrames.NPC_PATIENT_IDLE)
        .setScale(1.85).setDepth(8).setTint(0xb8d4ff);
      this.add.text(230, 294, 'Hermano', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#b8d4ff',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

      // Security at entrance
      this.add.sprite(110, 430, 'characters', KenneyCharFrames.NPC_SUPERVISOR_IDLE)
        .setScale(2).setDepth(8);
      this.add.text(110, 458, 'Seguridad', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    }

    if (this.assetsLoaded && this.textures.exists('dungeon-tiles')) {
      // Waiting-room chairs and reception desk
      [[380, 340], [420, 340], [380, 380], [420, 380]].forEach(([x, y]) => {
        this.add.image(x, y, 'dungeon-tiles', KenneyDungeonFrames.CHAIR).setScale(2).setDepth(7);
      });
      this.add.image(560, 160, 'dungeon-tiles', KenneyDungeonFrames.DESK).setScale(2.2).setDepth(7);
      this.add.image(700, 100, 'dungeon-tiles', KenneyDungeonFrames.CABINET).setScale(2).setDepth(7);
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

    if (this.assetsLoaded && this.textures.exists('characters')) {
      this.add.sprite(180, 220, 'characters', KenneyCharFrames.NPC_PATIENT_IDLE)
        .setScale(2).setDepth(8).setTint(0xffd4c0);
      this.add.text(180, 248, 'Sobreviviente', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#ffd4c0',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

      this.add.sprite(280, 200, 'characters', KenneyCharFrames.PLAYER_IDLE)
        .setScale(1.9).setDepth(8).setTint(0xa8c8ff);
      this.add.text(280, 228, 'Psicóloga social', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#a8c8ff',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

      this.add.sprite(760, 90, 'characters', KenneyCharFrames.NPC_SUPERVISOR_IDLE)
        .setScale(2).setDepth(8);
      this.add.text(760, 118, 'Funcionario de derechos', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#9dc0e8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);

      this.add.sprite(760, 400, 'characters', KenneyCharFrames.NPC_PATIENT_IDLE)
        .setScale(1.85).setDepth(8).setTint(0xb8e8c8);
      this.add.text(760, 428, 'Trabajadora social', {
        fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#b8e8c8',
        backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 },
      }).setOrigin(0.5, 0).setDepth(8);
    }

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
  private applyLightingOverlay(): void {
    const tone = String(
      (this.world?.map.ambient as { ambientTone?: unknown })?.ambientTone ?? 'calm',
    ).toLowerCase();
    const tint =
      tone === 'warm' ? 0x3a2a1a :
      tone === 'clinical' ? 0x1a2433 :
      tone === 'tense' ? 0x2a1420 :
      0x141a2e; // calm (default)
    const cam = this.cameras.main;
    const w = cam.width, h = cam.height;
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.LIGHTING);
    // Borde oscuro suave en los 4 lados — viñeta barata sin shaders.
    const band = Math.round(Math.min(w, h) * 0.18);
    for (let i = 0; i < band; i++) {
      const a = 0.45 * (1 - i / band) ** 2;
      g.lineStyle(1, tint, a);
      g.strokeRect(i, i, w - i * 2, h - i * 2);
    }
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
    const shadow = this.add.ellipse(0, 14, 16, 5, 0x000000, .22);   // scaled down to match scale(1.5)

    if (this.assetsLoaded && this.textures.exists('characters')) {
      const sprite = this.add.sprite(0, 0, 'characters', KenneyCharFrames.PLAYER_IDLE).setScale(1.5);
      // scale 1.5: at zoom=2 → sprite is 48px on screen ≈ 1.5 tiles wide — correct RPG proportion.
      // (scale 2 at zoom 2 would be 64px = 2 full tiles — too dominant)
      this.player = this.add.container(x, y, [shadow, sprite]).setDepth(actorDepth(y));
      this.playerSprite = sprite;
    } else {
      const body  = this.add.rectangle(0,  4, 24, 32, 0x4f7cac, 1).setStrokeStyle(2, 0xffffff, .9);
      const head  = this.add.circle(0, -18, 12, 0xf4c6a8, 1).setStrokeStyle(2, 0xffffff, .85);
      const badge = this.add.rectangle(0,  8, 12,  7, 0xffffff, .9);
      this.player = this.add.container(x, y, [shadow, body, head, badge]).setDepth(actorDepth(y));
    }

    // ── Avatar multicapa pixel-art (visual overlay sobre el player container) ─
    // AvatarRenderer crea su propio Container independiente en la misma posición.
    // El player container sigue siendo this.player (colisión + física manual).
    // Si no hay texturas de avatar, el renderer crea un container vacío — sin crash.
    if (this.avatarRenderer) {
      // Reutilizamos la instancia precreada en preload(); actualizamos su posición.
      // Primero destruimos un renderer previo si renderWorld() / renderRoom() lo reconstruye.
      if (this.avatarRenderer.isCreated()) {
        this.avatarRenderer.destroy();
      }
      // Crear el container del avatar en la misma posición que el player.
      // AvatarRenderer.create() respeta startX/startY — los sobrescribimos con setPosition().
      this.avatarRenderer.create();
      this.avatarRenderer.setPosition(x, y);
      this.avatarRenderer.setDepth(actorDepth(y));

      // Si el avatar renderer tiene al menos una capa visible, ocultar el playerSprite
      // para evitar doble visual (Kenney sprite + capas avatar).
      // getLayerCount() > 0 garantiza que no ocultamos el fallback cuando todas las
      // texturas fallaron (renderer creado pero sin capas visibles).
      if (this.avatarRenderer.isCreated() && this.avatarRenderer.getLayerCount() > 0 && this.playerSprite) {
        // Mantener el sprite Kenney invisible — sirve de referencia de posición.
        this.playerSprite.setVisible(false);
        // El shadow sigue visible (forma parte del player container).
        shadow.setVisible(true);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
  }

  private createMarker(object: MapObjectState) {
    const isExit = object.type === 'EXIT';
    const color  = Number.parseInt(object.color.replace('#', ''), 16) || 0x4fa3a5;
    const displayLabel = getSceneDisplayLabel(object, this.world?.map.key);
    const label  = this.add.text(0, 28, displayLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#e8f0f4',
      backgroundColor: 'rgba(8,12,18,.72)', padding: { x:5, y:3 }, align: 'center', wordWrap: { width: 140 }
    }).setOrigin(.5, 0);

    let main: Phaser.GameObjects.GameObject;

    if (this.assetsLoaded) {
      if (isExit && this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', KenneyDungeonFrames.DOOR).setScale(2.5);
      } else if (object.type === 'PERSON' && this.textures.exists('characters')) {
        main = this.add.sprite(0, 0, 'characters', KenneyCharFrames.NPC_PATIENT_IDLE).setScale(2);
      } else if (this.textures.exists('dungeon-tiles')) {
        main = this.add.image(0, 0, 'dungeon-tiles', this.frameForType(object.type)).setScale(2);
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

    const marker = this.add.container(object.x, object.y, [pulse, main, label]).setDepth(actorDepth(object.y));
    this.markers.set(object.key, marker);
    this.markerData.set(object.key, object);
    this.applyAmbientLife(marker, object);

    if (isExit) {
      const hintBg = this.add.rectangle(0, 0, 88, 22, 0x0e141a, .88).setStrokeStyle(1, 0x4fa3a5, .5);
      const hintTx = this.add.text(0, 0, `E  ${object.label} →`, {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#4fa3a5', fontStyle: 'bold'
      }).setOrigin(.5);
      const hint = this.add.container(object.x, object.y - 50, [hintBg, hintTx]).setDepth(DEPTH.UI).setVisible(false);
      this.doorHints.set(object.key, hint);
    }
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
      this.tweens.add({
        targets: marker, y: object.y - 2, duration: 1700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
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
    if (this.callbacks.reduceMotion || this.ambientMovers.size === 0) return;
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
    if (mover.pattern.type === 'wander') {
      return pickWanderTarget(mover.origin, mover.pattern.radius, Math.random);
    }
    if (mover.pattern.type === 'patrol' && mover.pattern.points.length) {
      mover.patrolIdx = (mover.patrolIdx + 1) % mover.pattern.points.length;
      const [x, y] = mover.pattern.points[mover.patrolIdx];
      return { x, y };
    }
    return null;
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

  private frameForType(type: string): number {
    const map: Record<string, number> = {
      PERSON: KenneyDungeonFrames.DESK, OBJECT: KenneyDungeonFrames.CABINET,
      ROUTE: KenneyDungeonFrames.PLANT, TOOL: KenneyDungeonFrames.CHAIR,
      WARNING: KenneyDungeonFrames.DESK
    };
    return map[type] ?? KenneyDungeonFrames.DESK;
  }

  /** Ordena un objeto de mundo por su Y (2.5D: más abajo = más al frente). */
  private ysort(obj: Phaser.GameObjects.Container): void {
    obj.setDepth(actorDepth(obj.y));
  }

  private movePlayer(dx: number, dy: number) {
    if (!this.player) return;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    // Try full movement
    if (!this.wouldCollide(nx, ny)) { this.player.setPosition(nx, ny); return; }
    // Slide along walls: try horizontal-only
    if (!this.wouldCollide(nx, this.player.y)) { this.player.setPosition(nx, this.player.y); return; }
    // Slide along walls: try vertical-only
    if (!this.wouldCollide(this.player.x, ny)) { this.player.setPosition(this.player.x, ny); return; }
    // Fully blocked — do nothing
  }

  /**
   * Returns true if placing the player center at (x, y) would overlap a wall tile.
   * Checks 4 corners of a 16×20 hitbox. When no wallsLayer is present falls back to
   * backend collision zones (legacy single-map mode).
   */
  private wouldCollide(x: number, y: number): boolean {
    if (this.wallsLayer) {
      const hw = 8, hh = 10;
      const corners = [
        { x: x - hw, y: y - hh }, { x: x + hw, y: y - hh },
        { x: x - hw, y: y + hh }, { x: x + hw, y: y + hh },
      ];
      return corners.some(pt => {
        const tile = this.wallsLayer!.getTileAtWorldXY(pt.x, pt.y);
        return tile !== null && tile.index > 0;
      });
    }
    // Legacy fallback: backend AABB zones
    if (!this.world) return false;
    const pb = new Phaser.Geom.Rectangle(x - 15, y - 27, 30, 46);
    const mapKey = this.world.map.key;
    const zones = isHospitalMap(mapKey)
      ? HOSPITAL_COLLISIONS
      : isComisariaMap(mapKey)
        ? COMISARIA_COLLISIONS
        : this.world.collisions.map(z => ({ x: z.x, y: z.y, width: z.width, height: z.height }));
    return zones.some(z =>
      Phaser.Geom.Intersects.RectangleToRectangle(pb, new Phaser.Geom.Rectangle(z.x, z.y, z.width, z.height)));
  }

  private updateNearestInteraction(suppressSound = false) {
    if (!this.player || !this.world) return;

    const mapKey = this.world.map.key;
    const objects = (isHospitalMap(mapKey) || isComisariaMap(mapKey))
      ? applySceneDisplayLabels(this.world.objects, mapKey)
      : this.world.objects;

    let nearest: MapObjectState | null = null;
    let nearestD = Infinity;
    for (const obj of objects) {
      const marker = this.markers.get(obj.key);
      const ox = marker?.x ?? obj.x;
      const oy = marker?.y ?? obj.y;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, ox, oy);
      if (d < nearestD) { nearest = { ...obj, x: ox, y: oy }; nearestD = d; }
    }

    const ambientZones = getSceneAmbientZones(mapKey);
    if (ambientZones.length && (!nearest || nearestD > 74)) {
      for (const zone of ambientZones) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y);
        if (d <= zone.radius && d < nearestD) {
          nearest = buildSceneAmbientObject(zone, mapKey);
          nearestD = d;
        }
      }
    }

    const nextKey = nearest && nearestD <= 74 ? nearest.key : null;
    if (nextKey !== this.nearestKey) {
      this.nearestKey = nextKey;
      this.callbacks.onProximity(nextKey ? nearest : null);
      this.refreshMarkerStates();
      // Play blip only when *entering* range (nextKey goes null → key), not on every frame.
      // suppressSound=true on spawn/world-switch to avoid a false-positive blip on load.
      if (nextKey && !this.callbacks.reduceMotion && !suppressSound) {
        this.sound.play('proximity-blip', { volume: 0.45 });
      }
    }
  }

  private refreshMarkerStates() {
    this.markers.forEach((m, key) => {
      const sel = key === this.selectedKey, near = key === this.nearestKey;
      m.setScale(sel ? 1.12 : near ? 1.08 : 1);
      m.setAlpha(sel || near ? 1 : .88);
    });
    this.doorHints.forEach((h, key) => h.setVisible(key === this.nearestKey));
  }

  private borderFor(theme: string): number {
    const m: Record<string, number> = {
      'protection-route':0x2f7476,'technical-record':0x2f5f8f,
      'risk-assessment':0x5b4f8f,'child-protection':0x5d9278,'follow-up':0x2f5f8f
    };
    return m[theme] ?? 0x4f7cac;
  }
}

// ─── Scenario Config Constants ────────────────────────────────────────────────
// These are declarative seeds for designers and future case editors.
// The Tiled map JSON files they reference do not exist yet — the Phaser preload
// uses a 'loaderror' handler that silently skips missing assets, so this config
// is safe to declare before the maps are authored.

/**
 * ScenarioConfig seed for Comisaría de Familia.
 * Covers the two main rooms used in VBG-related cases: Recepción and Sala de
 * Entrevista. Designers can wire these rooms to Tiled maps named
 * comisaria-sala-espera.json and comisaria-entrevista.json respectively.
 */
export const COMISARIA_SCENARIO: ScenarioConfig = {
  scenarioKey: 'comisaria_familia',
  startRoomKey: 'recepcion',
  rooms: [
    {
      key: 'recepcion',
      tiledMapKey: 'comisaria-sala-espera',
      tiledJsonPath: 'assets/game/maps/comisaria-sala-espera.json',
      displayName: 'Comisaría de Familia — Recepción',
      spawnX: 160,
      spawnY: 320,
      exits: [
        {
          objectName: 'EXIT_to_entrevista',
          targetRoomKey: 'entrevista',
          entryX: 160,
          entryY: 380,
        },
      ],
      npcs: [
        {
          key: 'comisaria-supervisor',
          npcType: 'supervisor',
          displayName: 'Comisario/a de Familia',
          portrait: '🧑‍⚕️',
          x: 300,
          y: 300,
          frameIndex: 428, // KenneyCharFrames.NPC_SUPERVISOR_IDLE
          characterId: 'doctor-male-labcoat',
          dialogue: {
            lines: [
              { text: 'Buenos días. ¿En qué puedo orientarle?', emotion: 'neutral' },
            ],
          },
        },
        {
          key: 'comisaria-staff',
          npcType: 'witness',
          displayName: 'Personal administrativo',
          portrait: '🧑',
          x: 500,
          y: 350,
          frameIndex: 428,
          characterId: 'staff-male-glasses-beard',
          dialogue: {
            lines: [
              { text: 'Por favor, espere un momento.', emotion: 'neutral' },
            ],
          },
        },
      ],
    },
    {
      key: 'entrevista',
      tiledMapKey: 'comisaria-entrevista',
      tiledJsonPath: 'assets/game/maps/comisaria-entrevista.json',
      displayName: 'Comisaría de Familia — Sala de Entrevista',
      spawnX: 160,
      spawnY: 380,
      exits: [
        {
          objectName: 'EXIT_to_recepcion',
          targetRoomKey: 'recepcion',
          entryX: 160,
          entryY: 320,
        },
      ],
      npcs: [
        {
          key: 'comisaria-orientadora',
          npcType: 'colleague',
          displayName: 'Orientadora psicosocial',
          portrait: '👩‍💼',
          x: 350,
          y: 260,
          frameIndex: 266, // KenneyCharFrames.NPC_PATIENT_IDLE
          characterId: 'orientadora-female-labcoat',
          dialogue: {
            lines: [
              { text: 'Recuerda aplicar escucha activa y validar emociones antes de registrar.', emotion: 'calm' },
            ],
          },
        },
        {
          key: 'comisaria-colega',
          npcType: 'colleague',
          displayName: 'Colega orientadora',
          portrait: '👩',
          x: 550,
          y: 300,
          frameIndex: 266,
          characterId: 'orientadora-casual-female',
          dialogue: {
            lines: [
              { text: 'Coordino el apoyo interinstitucional. ¿Necesitas algo?', emotion: 'neutral' },
            ],
          },
        },
      ],
    },
  ],
};

/**
 * ScenarioConfig seed for Hospital Psiquiátrico.
 * Two rooms: Sala de Espera and Consultorio. Maps to be authored by the design
 * team as hospital-espera.json and hospital-consultorio.json.
 */
export const HOSPITAL_PSIQUIATRICO_SCENARIO: ScenarioConfig = {
  scenarioKey: 'hospital_psiquiatrico',
  startRoomKey: 'sala-espera',
  rooms: [
    {
      key: 'sala-espera',
      tiledMapKey: 'hospital-espera',
      tiledJsonPath: 'assets/game/maps/hospital-espera.json',
      displayName: 'Hospital Psiquiátrico — Sala de Espera',
      spawnX: 320,
      spawnY: 400,
      exits: [
        {
          objectName: 'EXIT_to_consultorio',
          targetRoomKey: 'consultorio',
          entryX: 200,
          entryY: 350,
        },
      ],
      npcs: [],
    },
    {
      key: 'consultorio',
      tiledMapKey: 'hospital-consultorio',
      tiledJsonPath: 'assets/game/maps/hospital-consultorio.json',
      displayName: 'Hospital Psiquiátrico — Consultorio',
      spawnX: 200,
      spawnY: 350,
      exits: [
        {
          objectName: 'EXIT_to_sala_espera',
          targetRoomKey: 'sala-espera',
          entryX: 320,
          entryY: 400,
        },
      ],
      npcs: [],
    },
  ],
};

/**
 * ScenarioConfig seed for Vivienda Urbana.
 * Two rooms: Sala and Cocina. Maps to be authored as vivienda-sala.json and
 * vivienda-cocina.json.
 */
export const VIVIENDA_URBANA_SCENARIO: ScenarioConfig = {
  scenarioKey: 'vivienda_urbana',
  startRoomKey: 'sala',
  rooms: [
    {
      key: 'sala',
      tiledMapKey: 'vivienda-sala',
      tiledJsonPath: 'assets/game/maps/vivienda-sala.json',
      displayName: 'Vivienda Urbana — Sala',
      spawnX: 300,
      spawnY: 380,
      exits: [
        {
          objectName: 'EXIT_to_cocina',
          targetRoomKey: 'cocina',
          entryX: 200,
          entryY: 300,
        },
      ],
      npcs: [],
    },
    {
      key: 'cocina',
      tiledMapKey: 'vivienda-cocina',
      tiledJsonPath: 'assets/game/maps/vivienda-cocina.json',
      displayName: 'Vivienda Urbana — Cocina',
      spawnX: 200,
      spawnY: 300,
      exits: [
        {
          objectName: 'EXIT_to_sala',
          targetRoomKey: 'sala',
          entryX: 300,
          entryY: 380,
        },
      ],
      npcs: [],
    },
  ],
};
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-game-world',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div #gameHost class="phaser-host" role="application"
      aria-label="Mapa explorable de la simulación. Usa WASD o flechas para moverte, E para interactuar.">
    </div>
    <div class="touch-controls" aria-label="Controles táctiles">
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover arriba"    (click)="nudge('up')"><mat-icon>keyboard_arrow_up</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover izquierda" (click)="nudge('left')"><mat-icon>keyboard_arrow_left</mat-icon></button>
      <button type="button" class="psy-button psy-button--glass touch-interact"            (click)="interactNearest()"><mat-icon>touch_app</mat-icon>Interactuar</button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover derecha"   (click)="nudge('right')"><mat-icon>keyboard_arrow_right</mat-icon></button>
      <button type="button" class="psy-icon-button touch-btn" aria-label="Mover abajo"     (click)="nudge('down')"><mat-icon>keyboard_arrow_down</mat-icon></button>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .phaser-host { width: 100%; height: 100%; }
    :host ::ng-deep .phaser-host canvas { display: block; width: 100% !important; height: 100% !important; }
    .touch-controls {
      display: none;
      position: absolute;
      bottom: 92px;
      left: 50%;
      transform: translateX(-50%);
      grid-template-columns: repeat(5, minmax(44px, auto));
      justify-content: center;
      gap: 8px;
      z-index: 48;
    }
    .touch-btn { background: rgba(8,12,18,.7); border-color: rgba(79,163,165,.3); color: #4fa3a5; }
    .touch-interact { font-size: .82rem; }
    @media (max-width: 900px) { .touch-controls { display: grid; } }
  `]
})
export class GameWorldComponent implements OnChanges, OnDestroy {
  readonly world = input<SimulationWorldState | null>(null);
  readonly selectedInteractionKey = input<string | null>(null);
  readonly nearbyInteraction = input<MapObjectState | null>(null);
  readonly guide = input<SceneGuideEntry | null>(null);
  readonly proximity = output<MapObjectState | null>();
  readonly interact = output<MapObjectState>();
  readonly positionChange = output<{ x: number; y: number }>();
  readonly roomExit = output<{ targetRoomKey: string; entryX: number; entryY: number }>();
  readonly enterRoom = output<{ targetNodeKey: string; entryX: number; entryY: number }>();
  readonly npcInteract = output<NpcConfig>();
  private scene?: DataDrivenWorldScene;
  private phaserGame?: Phaser.Game;
  private gameHost?: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private readonly gameFeel = inject(GameFeelService);

  @ViewChild('gameHost')
  set host(value: ElementRef<HTMLDivElement> | undefined) {
    this.gameHost = value;
    if (value) this.boot();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['world'] && this.world()) this.scene?.setWorld(this.world()!);
    if (changes['selectedInteractionKey']) this.scene?.setSelected(this.selectedInteractionKey());
    if (changes['guide']) this.scene?.setGuide(this.guide());
  }

  ngOnDestroy() {
    this.phaserGame?.destroy(true);
    this.gameFeel.destroy();
  }

  /**
   * Propagates the current stress index (0–100) to the Phaser scene so the
   * vignette pipeline can adjust its intensity. Call from simulation-play
   * whenever the stress value changes.
   */
  setStressLevel(level: number): void {
    this.scene?.setStressLevel(level);
  }

  /** Trigger a camera shake — e.g. after a high-impact decision. */
  shakeCamera(intensity = 0.003, duration = 200): void {
    this.gameFeel.shakeCamera(intensity, duration);
  }

  /** Trigger a flash transition — e.g. after a critical decision. */
  flashTransition(color = 0xffffff, duration = 150): void {
    this.gameFeel.flashTransition(color, duration);
  }

  nudge(direction: 'up' | 'down' | 'left' | 'right') { this.scene?.nudge(direction); }
  interactNearest() { this.scene?.interactNearest(); }
  focus(key: string) { this.scene?.focus(key); }
  setScenarioConfig(config: ScenarioConfig) { this.scene?.setScenarioConfig(config); }
  transitionToRoom(targetRoomKey: string, entryX: number, entryY: number) {
    this.scene?.transitionToRoom(targetRoomKey, entryX, entryY);
  }
  updatePatientVisualState(state: import('../../core/models/simulation.model').PatientState) {
    this.scene?.updatePatientVisualState(state);
  }

  private boot() {
    if (!this.gameHost || this.phaserGame) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.zone.runOutsideAngular(() => {
      this.scene = new DataDrivenWorldScene({
        reduceMotion,
        onProximity:   i => this.zone.run(() => this.proximity.emit(i)),
        onInteract:    i => this.zone.run(() => this.interact.emit(i)),
        onPosition:    (x, y) => this.zone.run(() => this.positionChange.emit({ x, y })),
        onRoomExit:    (targetRoomKey, entryX, entryY) =>
          this.zone.run(() => this.roomExit.emit({ targetRoomKey, entryX, entryY })),
        onEnterRoom:   (targetNodeKey, entryX, entryY) =>
          this.zone.run(() => this.enterRoom.emit({ targetNodeKey, entryX, entryY })),
        onNpcInteract: npc => this.zone.run(() => this.npcInteract.emit(npc)),
      });
      this.phaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameHost!.nativeElement,
        width: 960, height: 540,
        backgroundColor: '#0e141a',
        pixelArt: true,    // nearest-neighbour scaling — keeps pixel art sharp
        roundPixels: true, // 2.5D: evita shimmer sub-pixel al hacer y-sort + follow
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 540 },
        scene: this.scene
      });
    });
    window.setTimeout(() => {
      if (this.world()) this.scene?.setWorld(this.world()!);
      this.scene?.setGuide(this.guide());
      // Init GameFeelService with the scene once Phaser's create() has run.
      if (this.scene) this.gameFeel.init(this.scene);
    }, 0);
  }
}
