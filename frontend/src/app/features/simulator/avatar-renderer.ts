import Phaser from 'phaser';
import { AvatarConfig } from '../character/avatar-config.model';

/**
 * AvatarRenderer — visual multicapa del avatar del jugador dentro de Phaser.
 *
 * Renderiza las capas del avatar (body → skin → uniform → labcoat → hair → face →
 * accessory) como sprites apilados en un Container. Cada capa es un sprite sheet de
 * 48×64 px con 48 frames (8 animaciones × 4-8 frames cada una).
 *
 * Si los PNGs de los sprite sheets NO existen todavía (serán generados por diseñadores),
 * el renderer no lanza ningún error: simplemente omite las capas cuyas texturas
 * no se cargaron. La escena sigue funcionando con el player fallback existente.
 *
 * Ciclo de vida:
 *   1. Crear instancia en preload() — llama a preload() para registrar los loads.
 *   2. Llamar a create() en el método create() de la escena — construye los sprites.
 *   3. En update() llamar a play() y setDepth() / setPosition() cada frame.
 */
export class AvatarRenderer {
  private readonly layers = new Map<string, Phaser.GameObjects.Sprite>();
  private container!: Phaser.GameObjects.Container;
  private currentAnim = 'idle_down';
  private created = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: AvatarConfig,
    private readonly startX: number,
    private readonly startY: number,
  ) {}

  /**
   * Registra todos los sprite sheets necesarios en el loader de Phaser.
   * Llamar en preload(). Si el archivo no existe, el loader lo ignora de forma
   * silenciosa gracias al manejador 'loaderror' que ya existe en la escena.
   */
  preload(): void {
    const s = this.scene;
    const c = this.config;
    const opts = { frameWidth: 48, frameHeight: 64 };

    s.load.spritesheet('av_body',
      'assets/sprites/avatar/avatar_body.png', opts);

    s.load.spritesheet(`av_skin_${c.skinTone}`,
      `assets/sprites/avatar/avatar_skin_${c.skinTone}.png`, opts);

    s.load.spritesheet(`av_uniform_${c.uniformType}`,
      `assets/sprites/avatar/avatar_uniform_${c.uniformType}.png`, opts);

    if (c.labcoat) {
      s.load.spritesheet('av_labcoat',
        'assets/sprites/avatar/avatar_labcoat.png', opts);
    }

    s.load.spritesheet(`av_hair_${c.hairStyle}_${c.hairColor}`,
      `assets/sprites/avatar/avatar_hair_${c.hairStyle}_${c.hairColor}.png`, opts);

    s.load.spritesheet(
      `av_face_${c.eyeType}_${c.browType}_${c.mouthType}`,
      `assets/sprites/avatar/avatar_face_${c.eyeType}_${c.browType}_${c.mouthType}.png`,
      opts,
    );

    if (c.accessory !== 'none') {
      s.load.spritesheet(`av_acc_${c.accessory}`,
        `assets/sprites/avatar/avatar_acc_${c.accessory}.png`, opts);
    }
  }

  /**
   * Construye el Container con todos los sprites de capa cargados.
   * Llamar en create(). Capas cuya textura no existe se omiten silenciosamente.
   * Llama a createAnimations() para registrar las animaciones compartidas.
   */
  create(): void {
    this.container = this.scene.add.container(this.startX, this.startY);

    const layerOrder = ['body', 'skin', 'uniform', 'labcoat', 'hair', 'face', 'accessory'];
    for (const layer of layerOrder) {
      const key = this.getTextureKey(layer);
      if (!key || !this.scene.textures.exists(key)) continue;
      const sprite = this.scene.add.sprite(0, 0, key);
      sprite.setOrigin(0.5, 1); // ancla en los pies — correcto para Y-sort
      this.layers.set(layer, sprite);
      this.container.add(sprite);
    }

    this.createAnimations();
    this.created = true;
  }

  /**
   * Cambia la animación activa en todas las capas.
   * Llamar en update(). No-op si la animación ya está activa.
   */
  play(state: 'idle' | 'walk', direction: 'down' | 'up' | 'left' | 'right'): void {
    const animKey = `${state}_${direction}`;
    if (animKey === this.currentAnim) return;
    this.currentAnim = animKey;
    const phaserKey = `av_${animKey}`;
    this.layers.forEach(sprite => {
      if (sprite.anims && this.scene.anims.exists(phaserKey)) {
        sprite.play(phaserKey, true);
      }
    });
  }

  /** Ajusta el flipX de todas las capas (para la dirección izquierda). */
  setFlipX(flip: boolean): void {
    this.layers.forEach(sprite => sprite.setFlipX(flip));
  }

  /** Muestra el frame idle estático para la dirección dada (cuando está parado). */
  showIdleFrame(direction: 'down' | 'up' | 'left' | 'right'): void {
    // Frames idle: 0-3 → down, 4-7 → up, 8-11 → left, 12-15 → right
    const baseFrame: Record<string, number> = { down: 0, up: 4, left: 8, right: 12 };
    const frame = baseFrame[direction] ?? 0;
    this.layers.forEach(sprite => {
      sprite.stop();
      sprite.setFrame(frame);
    });
  }

  /** Profundidad del container — asignar el Y del container para Y-sort. */
  setDepth(d: number): void {
    if (this.created) this.container.setDepth(d);
  }

  setPosition(x: number, y: number): void {
    if (this.created) this.container.setPosition(x, y);
  }

  getContainer(): Phaser.GameObjects.Container { return this.container; }
  getX(): number { return this.container?.x ?? this.startX; }
  getY(): number { return this.container?.y ?? this.startY; }
  isCreated(): boolean { return this.created; }

  destroy(): void {
    this.container?.destroy();
    this.created = false;
  }

  // ── Texture key resolution ──────────────────────────────────────────────────

  private getTextureKey(layer: string): string {
    const c = this.config;
    switch (layer) {
      case 'body':      return 'av_body';
      case 'skin':      return `av_skin_${c.skinTone}`;
      case 'uniform':   return `av_uniform_${c.uniformType}`;
      case 'labcoat':   return c.labcoat ? 'av_labcoat' : '';
      case 'hair':      return `av_hair_${c.hairStyle}_${c.hairColor}`;
      case 'face':      return `av_face_${c.eyeType}_${c.browType}_${c.mouthType}`;
      case 'accessory': return c.accessory !== 'none' ? `av_acc_${c.accessory}` : '';
      default:          return '';
    }
  }

  // ── Animation registration ──────────────────────────────────────────────────

  /**
   * Registra las 8 animaciones del avatar en el AnimationManager global de Phaser.
   * Solo se crean si la textura 'av_body' existe (es la textura de referencia para
   * generar los números de frame). Idempotente: si ya existen, no hace nada.
   *
   * Layout del sprite sheet (48 frames totales, izquierda→derecha, fila→fila):
   *   Frames  0-3   idle_down  (4f, framerate 4)
   *   Frames  4-7   idle_up    (4f)
   *   Frames  8-11  idle_left  (4f)
   *   Frames 12-15  idle_right (4f)
   *   Frames 16-23  walk_down  (8f, framerate 8)
   *   Frames 24-31  walk_up    (8f)
   *   Frames 32-39  walk_left  (8f)
   *   Frames 40-47  walk_right (8f)
   */
  private createAnimations(): void {
    // Solo creamos animaciones si la textura de referencia existe
    if (!this.scene.textures.exists('av_body')) return;

    const defs: Array<{ key: string; frames: number[]; frameRate: number; repeat: number }> = [
      { key: 'av_idle_down',  frames: [0, 1, 2, 1],           frameRate: 4, repeat: -1 },
      { key: 'av_idle_up',    frames: [4, 5, 6, 5],           frameRate: 4, repeat: -1 },
      { key: 'av_idle_left',  frames: [8, 9, 10, 9],          frameRate: 4, repeat: -1 },
      { key: 'av_idle_right', frames: [12, 13, 14, 13],       frameRate: 4, repeat: -1 },
      { key: 'av_walk_down',  frames: [16, 17, 18, 19, 20, 21, 22, 23], frameRate: 8, repeat: -1 },
      { key: 'av_walk_up',    frames: [24, 25, 26, 27, 28, 29, 30, 31], frameRate: 8, repeat: -1 },
      { key: 'av_walk_left',  frames: [32, 33, 34, 35, 36, 37, 38, 39], frameRate: 8, repeat: -1 },
      { key: 'av_walk_right', frames: [40, 41, 42, 43, 44, 45, 46, 47], frameRate: 8, repeat: -1 },
    ];

    for (const def of defs) {
      if (this.scene.anims.exists(def.key)) continue; // idempotente
      this.scene.anims.create({
        key: def.key,
        frames: this.scene.anims.generateFrameNumbers('av_body', { frames: def.frames }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  }
}
