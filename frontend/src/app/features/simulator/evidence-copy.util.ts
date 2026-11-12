import { MapObjectState } from '../../core/models/simulation.model';
import { EvidenceWorld, MissingItem } from './evidence-gating.config';
import {
  ENTITY_NAMES, EntityName, ORIENTATION_COPY, ROOM_LABELS, RoomGroup, TOOL_HINTS,
} from './orientation.config';
import { placeHint } from './place-hint.util';

/**
 * Una sola redacción de «lo que falta» para la lista, la puerta y el aviso de
 * evidencia (principio P4: una fuente por concepto). Nunca aparece una clave
 * interna ni, con NAME_TOOLS_IN_HINTS = false, el nombre de una herramienta.
 */
export interface CopyContext {
  /** Sala donde está el jugador; null si se desconoce (entonces no se añade «(en {sala})»). */
  currentRoom: RoomGroup | null;
  /** Mundo vivo (lo cumple SimulationWorldState). `objects` permite dar el lugar de lo que está en la sala. */
  world: (EvidenceWorld & { objects?: readonly MapObjectState[] }) | null;
  /** NAME_TOOLS_IN_HINTS: nombrar la herramienta en lugar de describirla. */
  nameTools: boolean;
  /** NPC del escenario (para nombrar a los que no están en ENTITY_NAMES, p. ej. casos del editor). */
  npcs: readonly { key: string; displayName: string }[];
}

type Mode = 'infinitive' | 'imperative';

const VERBS: Record<'talk' | 'inspect' | 'collect' | 'use', Record<Mode, string>> = {
  talk: { infinitive: 'hablar con', imperative: 'habla con' },
  inspect: { infinitive: 'revisar', imperative: 'revisa' },
  collect: { infinitive: 'recoger', imperative: 'recoge' },
  use: { infinitive: 'usar', imperative: 'usa' },
};

/** Une con comas y «y» (o «e» ante un sonido «i»): «a», «a y b», «a, b y c». */
export function joinSpanish(items: readonly string[]): string {
  const list = items.filter(item => item.length > 0);
  if (list.length <= 1) return list[0] ?? '';
  const last = list[list.length - 1];
  const conjunction = /^h?i(?![aeiou])/i.test(last) ? 'e' : 'y';
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${last}`;
}

function entityPhrase(
  key: string, verb: Record<Mode, string>, mode: Mode, ctx: CopyContext,
): { text: string; room: RoomGroup | null } | null {
  const entity: EntityName | undefined = ENTITY_NAMES[key];
  if (entity) return { text: `${verb[mode]} ${entity.article} ${entity.name}`, room: entity.room };
  const npc = ctx.npcs.find(n => n.key === key);
  if (npc) return { text: `${verb[mode]} ${npc.displayName}`, room: null };
  const label = ctx.world?.objects?.find(o => o.key === key)?.label;
  if (label) return { text: `${verb[mode]} ${label}`, room: ctx.currentRoom };
  return null;
}

function findLiveObject(item: MissingItem, ctx: CopyContext): MapObjectState | undefined {
  const objects = ctx.world?.objects;
  if (!objects) return undefined;
  if (item.kind === 'toolOwned') return objects.find(o => o.type === 'TOOL' && o.toolCode === item.key);
  if (item.kind === 'inspected' || item.kind === 'npc') return objects.find(o => o.key === item.key);
  return undefined;
}

function phraseFor(item: MissingItem, mode: Mode, ctx: CopyContext): string {
  let text: string;
  let room: RoomGroup | null = null;

  if (item.kind === 'toolOwned' || item.kind === 'toolUsed') {
    const hint = TOOL_HINTS[item.key];
    const verb = VERBS[item.kind === 'toolOwned' ? 'collect' : 'use'][mode];
    if (hint) {
      text = `${verb} ${ctx.nameTools ? hint.named : hint.generic}`;
      room = hint.room;
    } else {
      text = `${verb} ${ORIENTATION_COPY.evidence.unknownThing}`;
    }
  } else {
    const isPerson = item.kind === 'npc' || ENTITY_NAMES[item.key]?.person === true;
    const verb = VERBS[isPerson ? 'talk' : 'inspect'];
    const found = entityPhrase(item.key, verb, mode, ctx);
    if (found) {
      text = found.text;
      room = found.room;
    } else {
      text = `${verb[mode]} ${isPerson ? ORIENTATION_COPY.evidence.unknownPerson : ORIENTATION_COPY.evidence.unknownThing}`;
    }
  }

  if (ctx.currentRoom && room && room !== ctx.currentRoom) return `${text} (${ROOM_LABELS[room].en})`;
  if (mode === 'imperative' && (room === null || room === ctx.currentRoom)) {
    const live = findLiveObject(item, ctx);
    if (live) return `${text} (${placeHint(live.x, live.y)})`;
  }
  return text;
}

function uniqueItems(items: readonly MissingItem[]): MissingItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const id = `${item.kind}:${item.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Imperativo, para puertas y lista: «habla con la Familia en crisis (en el extremo izquierdo, al frente)». */
export function imperativeMissing(items: readonly MissingItem[], ctx: CopyContext): string[] {
  return uniqueItems(items).map(item => phraseFor(item, 'imperative', ctx));
}
