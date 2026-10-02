/**
 * Avatar del lobby «CLÍNICA · SIEP» (CAST-01).
 *
 * El lobby debe mostrar la MISMA identidad que el editor, el simulador y el
 * outcome: hoja horneada del `castId` elegido con fallback a la composición
 * modular (y, como último recurso en runtime, el placeholder geométrico si
 * ninguna textura pudo cargar). Lógica pura separada de Phaser para poder
 * probarla con Jest.
 */
import { AvatarConfig } from '../character/avatar.model';
import { castAssetPath, castTextureKey, resolveCastId } from './baked-cast.util';
import { AVATAR_IDLE_FRAMES, AvatarLayerSpec, avatarLayerSpecs } from './phaser-avatar-renderer';

/** Textura del compuesto modular del lobby (no pisa la del mundo). */
export const LOBBY_MODULAR_TEXTURE_KEY = 'lobby-avatar-composite';
/** Claves de animación propias del lobby. */
export const LOBBY_ANIM_KEYS = {
  down: 'lobby-walk-down',
  side: 'lobby-walk-side',
  up: 'lobby-walk-up',
} as const;
/** Misma fórmula de pies del mundo: y=180 de un frame de 192. */
export const LOBBY_FEET_ORIGIN_Y = 180 / 192;
/** Escala del avatar en el canvas 960×540 del lobby (~84 px de alto). */
export const LOBBY_AVATAR_SCALE = 0.5;
/** Radio de proximidad a una puerta del lobby. */
export const LOBBY_DOOR_RANGE = 70;

export interface LobbyCastPlan {
  kind: 'cast';
  castId: string;
  textureKey: string;
  assetPath: string;
  /** Fallback modular por si la hoja no carga (asset ausente). */
  modularSpecs: AvatarLayerSpec[];
}

export interface LobbyModularPlan {
  kind: 'modular';
  modularSpecs: AvatarLayerSpec[];
}

export type LobbyAvatarPlan = LobbyCastPlan | LobbyModularPlan;

/** Plan de render: elenco horneado si el castId es válido; si no, modular. */
export function lobbyAvatarPlan(config: AvatarConfig): LobbyAvatarPlan {
  const castId = resolveCastId(config.castId ?? null);
  const modularSpecs = avatarLayerSpecs(config);
  if (castId) {
    return {
      kind: 'cast',
      castId,
      textureKey: castTextureKey(castId),
      assetPath: castAssetPath(castId),
      modularSpecs,
    };
  }
  return { kind: 'modular', modularSpecs };
}

/**
 * Cadena de texturas candidatas, en orden de preferencia. La escena usa la
 * primera que exista de verdad (hoja cargada / compuesto modular exitoso).
 */
export function lobbyTextureChain(plan: LobbyAvatarPlan): string[] {
  return plan.kind === 'cast'
    ? [plan.textureKey, LOBBY_MODULAR_TEXTURE_KEY]
    : [LOBBY_MODULAR_TEXTURE_KEY];
}

export interface LobbyPose {
  /** ¿Reproducir la animación de caminata lateral? */
  walking: boolean;
  /** Flip a aplicar; `null` = conservar el rumbo actual (parado). */
  flipX: boolean | null;
  /** Frame estático cuando no camina (idle lateral, col 0 de la fila lado). */
  idleFrame: number;
}

/**
 * Pose del avatar del lobby (movimiento solo horizontal; la fila lateral mira
 * a la DERECHA y la izquierda es espejo, igual que en el mundo). Con
 * `prefers-reduced-motion` nunca se anima: frame estático, flip permitido.
 */
export function lobbyPose(vx: number, reduceMotion: boolean): LobbyPose {
  return {
    walking: vx !== 0 && !reduceMotion,
    flipX: vx < 0 ? true : vx > 0 ? false : null,
    idleFrame: AVATAR_IDLE_FRAMES.side,
  };
}

export interface LobbyDoorLike {
  x: number;
}

/** Puerta más cercana dentro del radio, o `null` si todas quedan lejos. */
export function nearestLobbyDoor<T extends LobbyDoorLike>(
  doors: readonly T[],
  playerX: number,
  range: number = LOBBY_DOOR_RANGE,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const door of doors) {
    const distance = Math.abs(door.x - playerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = door;
    }
  }
  return best !== null && bestDistance <= range ? best : null;
}
