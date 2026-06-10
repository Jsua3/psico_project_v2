import Phaser from 'phaser';
import { AvatarConfig } from '../character/avatar.model';
import { resolveAvatarSpriteLayers } from '../character/avatar-figure.component';

/**
 * Avatar modular dentro de Phaser (Fase 4 del MVP).
 *
 * Los assets modulares (`/assets/characters/modular/...`) son hojas de
 * 192×288 px = 3 columnas (frames de caminata) × 3 filas (direcciones):
 *   fila 0 = frente (down) · fila 1 = lado (mira a la IZQUIERDA) · fila 2 = espalda (up)
 *
 * La composición por capas (cuerpo → pelo atrás → cara → pelo frente) se hace
 * una vez en un CanvasTexture y se registra como spritesheet de 9 frames.
 */

export const AVATAR_TEXTURE_KEY = 'player-avatar-composite';
export const AVATAR_SHEET_WIDTH = 192;
export const AVATAR_SHEET_HEIGHT = 288;
export const AVATAR_FRAME_WIDTH = 64;
export const AVATAR_FRAME_HEIGHT = 96;

/** Animaciones del avatar (no chocan con las `walk-*` de Kenney). */
export const AVATAR_ANIM_KEYS = {
  down: 'avatar-walk-down',
  side: 'avatar-walk-side',
  up: 'avatar-walk-up',
} as const;

/** Frame de reposo por dirección (columna central de cada fila). */
export const AVATAR_IDLE_FRAMES = { down: 1, side: 4, up: 7 } as const;

/** Frames de caminata por dirección (fila completa). */
export const AVATAR_WALK_FRAMES = {
  down: [0, 1, 2],
  side: [3, 4, 5],
  up: [6, 7, 8],
} as const;

export interface AvatarLayerSpec {
  /** Clave de textura Phaser para precargar la capa. */
  textureKey: string;
  /** Ruta del asset (servible por el dev server). */
  assetPath: string;
}

/** Capas a precargar para un AvatarConfig, en orden de dibujo (z). */
export function avatarLayerSpecs(config: AvatarConfig): AvatarLayerSpec[] {
  return resolveAvatarSpriteLayers(config).map(layer => ({
    textureKey: `avatar-layer-${layer.key}`,
    assetPath: layer.assetPath,
  }));
}

/** Geometría de los 9 frames (índice = fila*3 + columna). */
export function avatarFrameRects(): Array<{ index: number; x: number; y: number; width: number; height: number }> {
  const rects = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      rects.push({
        index: row * 3 + col,
        x: col * AVATAR_FRAME_WIDTH,
        y: row * AVATAR_FRAME_HEIGHT,
        width: AVATAR_FRAME_WIDTH,
        height: AVATAR_FRAME_HEIGHT,
      });
    }
  }
  return rects;
}

/**
 * Compone las capas (ya cargadas como imágenes) en un CanvasTexture y registra
 * los 9 frames. Devuelve false si ninguna capa está disponible (el llamador
 * usa el fallback Kenney).
 */
export function composeAvatarTexture(scene: Phaser.Scene, specs: AvatarLayerSpec[]): boolean {
  const available = specs.filter(spec => scene.textures.exists(spec.textureKey));
  if (!available.length) return false;

  if (scene.textures.exists(AVATAR_TEXTURE_KEY)) scene.textures.remove(AVATAR_TEXTURE_KEY);
  const canvasTexture = scene.textures.createCanvas(AVATAR_TEXTURE_KEY, AVATAR_SHEET_WIDTH, AVATAR_SHEET_HEIGHT);
  if (!canvasTexture) return false;

  const ctx = canvasTexture.getContext();
  ctx.imageSmoothingEnabled = false;
  for (const spec of available) {
    const source = scene.textures.get(spec.textureKey).getSourceImage();
    ctx.drawImage(source as CanvasImageSource, 0, 0);
  }
  canvasTexture.refresh();

  for (const rect of avatarFrameRects()) {
    canvasTexture.add(rect.index, 0, rect.x, rect.y, rect.width, rect.height);
  }
  return true;
}

/** (Re)crea las animaciones de caminata del avatar compuesto. */
export function createAvatarAnimations(scene: Phaser.Scene): void {
  for (const dir of ['down', 'side', 'up'] as const) {
    const key = AVATAR_ANIM_KEYS[dir];
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({
      key,
      frames: AVATAR_WALK_FRAMES[dir].map(frame => ({ key: AVATAR_TEXTURE_KEY, frame })),
      frameRate: 7,
      repeat: -1,
    });
  }
}
