import { MapObjectState } from '../../core/models/simulation.model';
import { CopyContext, imperativeMissing, joinSpanish } from './evidence-copy.util';
import { MissingItem, missingEvidenceItems } from './evidence-gating.config';
import { HOSPITAL_GATE_NODE_KEY, HOSPITAL_GATE_STAGE_NUMBER, ORIENTATION_COPY } from './orientation.config';

/**
 * Estado de una puerta: única fuente de verdad para el rótulo del mundo, la barra
 * contextual, el intento de cruzar (tryOpenDoor) y el paso «puerta» de la lista (F§7.5).
 * El mensaje se calcula de los requisitos VIVOS y sustituye al `lockedMessage` del seed
 * (que nombra temas de las decisiones o pide cosas que no se exigen) sin re-sembrar.
 */
export interface DoorStatus {
  state: 'open' | 'locked';
  missing: MissingItem[];
  /** Bloqueada por la etapa del caso (requiresNodes), no por algo que el jugador pueda reunir ahora. */
  stageLocked: boolean;
  message: string | null;
}

export interface DoorStatusContext {
  /** Clave del nodo (etapa) actual del intento. */
  nodeKey: string;
  /** Número de decisión actual (1..6); null si se desconoce. */
  decisionNumber: number | null;
  world: NonNullable<CopyContext['world']>;
  viewedNpcKeys: ReadonlySet<string>;
  copy: CopyContext;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

function stageMessage(requiresNodes: readonly string[], decisionNumber: number | null): string {
  if (!requiresNodes.includes(HOSPITAL_GATE_NODE_KEY)) return ORIENTATION_COPY.door.laterGate;
  const remaining = decisionNumber == null ? 0 : HOSPITAL_GATE_STAGE_NUMBER - decisionNumber;
  return remaining >= 1
    ? `${ORIENTATION_COPY.door.hospitalGate} ${ORIENTATION_COPY.door.hospitalGateRemaining(remaining)}`
    : ORIENTATION_COPY.door.hospitalGate;
}

export function doorStatus(door: MapObjectState, ctx: DoorStatusContext): DoorStatus {
  const meta = (door.metadata ?? {}) as Record<string, unknown>;
  const requiresNodes = stringList(meta['requiresNodes']);
  const missing = missingEvidenceItems({
    npcs: stringList(meta['requiresNpcs']),
    tools: stringList(meta['requiresTools']),
    inspected: stringList(meta['requiresInspected']),
    missingMessage: '',
  }, ctx.world, ctx.viewedNpcKeys);
  const stageLocked = requiresNodes.length > 0 && !requiresNodes.includes(ctx.nodeKey);

  if (!missing.length && !stageLocked) return { state: 'open', missing: [], stageLocked: false, message: null };

  const parts: string[] = [];
  if (missing.length) parts.push(ORIENTATION_COPY.door.before(joinSpanish(imperativeMissing(missing, ctx.copy))));
  if (stageLocked) parts.push(stageMessage(requiresNodes, ctx.decisionNumber));
  return { state: 'locked', missing, stageLocked, message: parts.join(' ') };
}

/** `doorStates` para el mundo: estado de cada salida de la sala actual, por clave. */
export function doorStateMap(
  objects: readonly MapObjectState[], ctx: DoorStatusContext,
): Record<string, 'open' | 'locked'> {
  const states: Record<string, 'open' | 'locked'> = {};
  for (const obj of objects) {
    if (obj.type === 'EXIT') states[obj.key] = doorStatus(obj, ctx).state;
  }
  return states;
}
