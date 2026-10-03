import { MapObjectState } from '../../core/models/simulation.model';
import { RoomGroup } from './orientation.config';
import { StepKind, StepWeight } from './stage-route.config';

/**
 * Estado de la lista «Qué hacer» (diseño F§6.3 y F§7.1). Puro: sin Angular ni Phaser.
 * Se deriva de attempt, world, viewedNpcKeys, visitedRooms y scenarioConfig; nada se calcula por cuadro.
 */
export type StepState = 'done' | 'next' | 'pending' | 'locked';

export interface SceneLogStep {
  id: string; kind: StepKind; weight: StepWeight; state: StepState; label: string;
  /** 'a la izquierda, al frente'; solo si el paso está en la sala actual. */
  place: string | null;
  /** 'en Urgencias'; solo si es otra sala (los pasos de decisión lo llevan siempre). */
  roomLabel: string | null;
  here: boolean;
  /** Aclaración o, si está bloqueado, el motivo. */
  note: string | null;
  targetKey: string;
  room: RoomGroup;
  /** 'Anotado: …' (para las notas al completarse). */
  doneText: string;
}

export interface SceneLogGroup {
  room: RoomGroup;
  header: string | null;
  current: boolean;
  collapsed: boolean;
  steps: SceneLogStep[];
}

export interface OptionalEntry {
  key: string;
  label: string;
  /** null = sin noción de «visto». */
  seen: boolean | null;
  /** 'person' se «habla con»; 'object' se «revisa». */
  kind?: 'person' | 'object';
  /** Marca lista para mostrar: 'ya hablaste' | 'ya revisaste' | 'aún no' (null si no aplica). */
  mark?: string | null;
}

export interface SceneNextTarget {
  stepId: string;
  targetKey: string;
  room: RoomGroup;
  isHere: boolean;
  /** Si el destino está en otra sala: clave de la puerta de la sala actual que hay que tomar primero. */
  hopDoorKey: string | null;
}

export interface SceneLogState {
  /** 1..6; 0 si la etapa no tiene número (casos sin ruta autorada). */
  number: number;
  total: number;
  title: string;
  intro: string;
  next: SceneNextTarget | null;
  nextLine: string;
  groups: SceneLogGroup[];
  optional: OptionalEntry[];
  prepDone: number;
  prepTotal: number;
  footer: string;
}

export interface SceneLogInput {
  nodeKey: string | null; nodeTitle: string | null; nodeNarrative: string | null;
  /** Solo ids (P1): nunca la clasificación de una opción. */
  nodeOptionIds: readonly number[] | null;
  mapKey: string | null; objects: readonly MapObjectState[];
  inventory: readonly string[]; inspected: readonly string[]; usedToolKeys: readonly string[];
  /** Ya unido con world.flags['viewedNpcKeys'] (ver collectViewedNpcKeys). */
  viewedNpcKeys: ReadonlySet<string>;
  visitedRooms: ReadonlySet<RoomGroup>;
  scenarioNpcs: readonly { key: string; displayName: string; x: number; y: number }[];
  terminal: boolean;
  /** Nombrar las herramientas (por defecto NAME_TOOLS_IN_HINTS). */
  nameTools?: boolean;
}

/** Esqueleto (T2.0): el algoritmo de F§7.1 llega con T2.5. */
export function deriveSceneLog(_input: SceneLogInput): SceneLogState | null {
  return null;
}

export function roomGroupOf(_mapKey: string | null | undefined): RoomGroup | null {
  return null;
}

export function firstHop(_from: RoomGroup, _to: RoomGroup): string | null {
  return null;
}

export function diffDone(_prev: SceneLogState | null, _next: SceneLogState): SceneLogStep[] {
  return [];
}

export function ringTargetKey(_state: SceneLogState | null, _highlightTools: boolean): string | null {
  return null;
}
