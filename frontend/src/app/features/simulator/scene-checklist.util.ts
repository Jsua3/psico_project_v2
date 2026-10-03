import {
  MapObjectState, NpcConfig, SimulationAttemptState, SimulationNodeState, SimulationWorldState,
} from '../../core/models/simulation.model';
import { caseRoomKind } from './case-pdf-rooms.geometry';
import { activeDecisionObjectKeys, otherStageDecisionKeys } from './dialogue-decoration.util';
import { doorStatus } from './door-status.util';
import { CopyContext } from './evidence-copy.util';
import { NODE_EVIDENCE, collectViewedNpcKeys, isToolUsed } from './evidence-gating.config';
import {
  DECISION_TOTAL, ENTITY_NAMES, NAME_TOOLS_IN_HINTS, OPTIONAL_EXCLUDED_KEYS, ORIENTATION_COPY, ROOM_GRAPH, ROOM_LABELS,
  ROUTE_ORDER, RoomGroup, TOOL_HINTS,
} from './orientation.config';
import { placeHint } from './place-hint.util';
import {
  DoneRule, RouteStep, STAGE_ROUTES, StageRoute, StepKind, StepWeight,
} from './stage-route.config';

/**
 * Estado de la lista «Qué hacer» (diseño F§6.3 y F§7.1). Puro: sin Angular ni Phaser.
 * Se deriva de attempt, world, viewedNpcKeys, visitedRooms y scenarioConfig; nada se calcula por cuadro.
 * Orienta PROCESO y LUGAR: lee solo ids de opciones (para saber qué objeto aloja la decisión), nunca su contenido.
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
  /** 'Anotado: …' al completarse (vacío en «recoger» y «decidir»: recoger se avisa con «Obtuviste: …»). */
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
  /** Clave del objeto, o 'npc:{clave}' para una persona del escenario. */
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
  /** Clave del objeto, o 'npc:{clave}'. */
  targetKey: string;
  room: RoomGroup;
  isHere: boolean;
  /** Si el destino está en otra sala: clave de la puerta de la sala actual que hay que tomar primero. */
  hopDoorKey: string | null;
}

export interface SceneLogState {
  /** 1..6; 0 si la etapa no tiene número (casos sin ruta autorada). */
  number: number;
  /** DECISION_TOTAL; 0 si la etapa no tiene número. */
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

const OPTIONAL_LIMIT = 8;

const KIND_TO_GROUP: Readonly<Record<string, RoomGroup>> = {
  'hospital-urgencias': 'urgencias',
  'hospital-sala-escucha': 'sala-escucha',
  'comisaria-recepcion': 'recepcion',
  'comisaria-consultorio': 'consultorio',
};

/** Sala (de las cuatro del caso) a la que pertenece un map_key; las copias por etapa comparten sala. */
export function roomGroupOf(mapKey: string | null | undefined): RoomGroup | null {
  const kind = caseRoomKind(mapKey);
  return kind ? KIND_TO_GROUP[kind] ?? null : null;
}

/** Primera sala de un camino más corto de `from` a `to` por las puertas de ROOM_GRAPH (null si no hay). */
function hopRoom(from: RoomGroup, to: RoomGroup): RoomGroup | null {
  if (from === to) return null;
  const parent = new Map<RoomGroup, RoomGroup | null>([[from, null]]);
  const queue: RoomGroup[] = [from];
  while (queue.length) {
    const room = queue.shift()!;
    for (const neighbour of Object.keys(ROOM_GRAPH[room]) as RoomGroup[]) {
      if (parent.has(neighbour)) continue;
      parent.set(neighbour, room);
      if (neighbour === to) {
        let step: RoomGroup = neighbour;
        while (parent.get(step) !== from) step = parent.get(step)!;
        return step;
      }
      queue.push(neighbour);
    }
  }
  return null;
}

/** Clave de la puerta de `from` que hay que tomar primero para llegar a `to` (null si no hay camino). */
export function firstHop(from: RoomGroup, to: RoomGroup): string | null {
  const next = hopRoom(from, to);
  return next ? ROOM_GRAPH[from][next] ?? null : null;
}

const roomIndex = (room: RoomGroup): number => ROUTE_ORDER.indexOf(room);
const lowerFirst = (text: string): string => (text ? text[0].toLowerCase() + text.slice(1) : text);

function firstSentence(text: string | null): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const end = clean.search(/[.!?](\s|$)/);
  return end === -1 ? `${clean}.` : clean.slice(0, end + 1);
}

/** Etapa sin ruta autorada (caso del editor o versión nueva): lista derivada de la evidencia que exige el nodo, si la hay. */
function deriveFallbackRoute(input: SceneLogInput, current: RoomGroup | null): StageRoute | null {
  const def = input.nodeKey ? NODE_EVIDENCE[input.nodeKey] : undefined;
  if (!input.nodeKey || !def) return null;
  const room = current ?? 'urgencias';
  const objectLabel = (key: string) => input.objects.find(o => o.key === key)?.label;
  const steps: RouteStep[] = [];

  const nameOf = (key: string): { article: string; name: string } | null => {
    const entity = ENTITY_NAMES[key];
    if (entity) return { article: entity.article, name: entity.name };
    const live = input.scenarioNpcs.find(n => n.key === key)?.displayName ?? objectLabel(key);
    return live ? { article: '', name: live } : null;
  };
  const withArticle = (named: { article: string; name: string }) => (named.article ? `${named.article} ${named.name}` : named.name);

  for (const key of def.npcs ?? []) {
    const named = nameOf(key);
    if (!named) continue;
    const isScenarioNpc = input.scenarioNpcs.some(n => n.key === key);
    steps.push({
      id: `d-npc-${key}`, kind: 'talk', weight: 'prep', room: ENTITY_NAMES[key]?.room ?? room,
      targetKey: isScenarioNpc ? `npc:${key}` : key, label: `Habla con ${withArticle(named)}`,
      done: { type: 'npc', key },
    });
  }
  for (const key of def.inspected ?? []) {
    const named = nameOf(key);
    if (!named) continue;
    const person = ENTITY_NAMES[key]?.person === true;
    steps.push({
      id: `d-ins-${key}`, kind: person ? 'talk' : 'inspect', weight: 'prep', room: ENTITY_NAMES[key]?.room ?? room,
      targetKey: key, label: `${person ? 'Habla con' : 'Revisa'} ${withArticle(named)}`,
      done: { type: 'inspected', key },
    });
  }
  const toolCodes = [...new Set([...(def.tools ?? []), ...(def.usedTools ?? [])])];
  for (const code of toolCodes) {
    const hint = TOOL_HINTS[code];
    if (!hint) continue;
    const toolObject = input.objects.find(o => o.type === 'TOOL' && o.toolCode === code);
    steps.push({
      id: `d-col-${code}`, kind: 'collect', weight: 'prep', room: hint.room,
      targetKey: toolObject?.key ?? '', label: `Recoge ${hint.generic}`, labelNamed: `Recoge ${hint.named}`,
      done: { type: 'inventory', toolCode: code },
    });
    if ((def.usedTools ?? []).includes(code)) {
      steps.push({
        id: `d-use-${code}`, kind: 'use', weight: 'prep', room: hint.room, targetKey: '',
        label: `Usa ${hint.generic} en una conversación`, labelNamed: `Usa ${hint.named} en una conversación`,
        lockedNote: `Primero recoge ${hint.generic}.`, done: { type: 'toolUsed', toolCode: code }, needs: `d-col-${code}`,
      });
    }
  }
  const host = [...activeDecisionObjectKeys({ objects: input.objects }, input.nodeOptionIds)][0];
  const hostObject = host ? input.objects.find(o => o.key === host) : undefined;
  if (hostObject) {
    steps.push({
      id: 'd-decidir', kind: 'decide', weight: 'decision', room: current ?? room, targetKey: hostObject.key,
      label: `Toma tu decisión ${hostObject.type === 'PERSON' ? 'con' : 'en'} ${hostObject.label}`,
      done: { type: 'never' },
    });
  }
  if (!steps.length) return null;
  return { nodeKey: input.nodeKey, number: 0, title: input.nodeTitle ?? '', intro: firstSentence(input.nodeNarrative), steps };
}

interface Env {
  input: SceneLogInput;
  current: RoomGroup | null;
  nameTools: boolean;
  inspected: ReadonlySet<string>;
  copy: CopyContext;
  doorWorld: NonNullable<CopyContext['world']>;
}

function reached(room: RoomGroup, env: Env): boolean {
  return env.input.visitedRooms.has(room) || (env.current !== null && roomIndex(env.current) >= roomIndex(room));
}

function isDone(rule: DoneRule, env: Env): boolean {
  switch (rule.type) {
    case 'npc': return env.input.viewedNpcKeys.has(rule.key) || env.inspected.has(rule.key);
    case 'inspected': return env.inspected.has(rule.key);
    case 'inventory': return env.input.inventory.includes(rule.toolCode);
    case 'toolUsed': return isToolUsed(env.input.usedToolKeys, rule.toolCode);
    case 'visitedRoom': return reached(rule.room, env);
    case 'never': return false;
  }
}

function stepCoordinates(step: RouteStep, input: SceneLogInput): { x: number; y: number } | null {
  if (step.targetKey.startsWith('npc:')) {
    const npc = input.scenarioNpcs.find(n => n.key === step.targetKey.slice(4));
    return npc ? { x: npc.x, y: npc.y } : null;
  }
  const obj = input.objects.find(o => o.key === step.targetKey);
  return obj ? { x: obj.x, y: obj.y } : null;
}

function doneText(step: RouteStep): string {
  const key = step.targetKey.replace(/^npc:/, '');
  const entity = ENTITY_NAMES[key];
  switch (step.kind) {
    case 'talk':
      return entity ? ORIENTATION_COPY.notices.notedTalked(entity.article, entity.name) : '';
    case 'inspect':
      return entity ? ORIENTATION_COPY.notices.notedReviewed(entity.article, entity.name) : '';
    case 'collect':
      // Recoger ya tiene su propio aviso al ocurrir («Obtuviste: …», F§5.6): sin nota «Anotado» duplicada.
      return '';
    case 'use':
      return step.done.type === 'toolUsed' && TOOL_HINTS[step.done.toolCode]
        ? ORIENTATION_COPY.notices.notedUsed(TOOL_HINTS[step.done.toolCode].generic) : '';
    case 'door':
      return step.done.type === 'visitedRoom' ? ORIENTATION_COPY.notices.notedArrived(step.done.room) : '';
    case 'decide':
      return '';
  }
}

function nextLineFor(step: SceneLogStep | undefined, env: Env): string {
  if (!step) return '';
  const prefix = ORIENTATION_COPY.now.prefix;
  if (step.here) return `${prefix}${step.label}${step.place ? ` · ${step.place}` : ''}`;
  const hop = env.current ? hopRoom(env.current, step.room) : null;
  const doorKey = env.current && hop ? ROOM_GRAPH[env.current][hop] : undefined;
  const door = doorKey ? env.input.objects.find(o => o.key === doorKey) : undefined;
  if (hop && door) {
    return `${prefix}${ROOM_LABELS[hop].ve} (${placeHint(door.x, door.y, { door: true })}) y ${lowerFirst(step.label)}`;
  }
  return `${prefix}${step.label} · ${ROOM_LABELS[step.room].en}`;
}

function buildOptional(route: StageRoute, env: Env): OptionalEntry[] {
  const { input, current } = env;
  if (!current) return [];
  const stepTargets = new Set(route.steps.map(s => s.targetKey.replace(/^npc:/, '')));
  const otherStage = otherStageDecisionKeys({ objects: input.objects }, input.nodeOptionIds);
  const candidates: Array<{ x: number; entry: OptionalEntry }> = [];

  for (const obj of input.objects) {
    if (obj.type === 'EXIT' || obj.type === 'TOOL') continue;
    if (stepTargets.has(obj.key) || otherStage.has(obj.key) || OPTIONAL_EXCLUDED_KEYS.has(obj.key)) continue;
    const person = obj.type === 'PERSON';
    const seen = person ? input.viewedNpcKeys.has(obj.key) || env.inspected.has(obj.key) : env.inspected.has(obj.key);
    candidates.push({
      x: obj.x,
      entry: {
        key: obj.key, label: obj.label, seen, kind: person ? 'person' : 'object',
        mark: seen ? (person ? ORIENTATION_COPY.card.marks.talked : ORIENTATION_COPY.card.marks.reviewed)
          : ORIENTATION_COPY.card.marks.notYet,
      },
    });
  }
  for (const npc of input.scenarioNpcs) {
    if (stepTargets.has(npc.key) || OPTIONAL_EXCLUDED_KEYS.has(npc.key)) continue;
    if (input.objects.some(o => o.key === npc.key)) continue;
    const seen = input.viewedNpcKeys.has(npc.key);
    candidates.push({
      x: npc.x,
      entry: {
        key: `npc:${npc.key}`, label: npc.displayName, seen, kind: 'person',
        mark: seen ? ORIENTATION_COPY.card.marks.talked : ORIENTATION_COPY.card.marks.notYet,
      },
    });
  }
  return candidates.sort((a, b) => a.x - b.x).slice(0, OPTIONAL_LIMIT).map(c => c.entry);
}

/** Lista «Qué hacer» de la etapa actual, o null si no hay nada que mostrar (algoritmo de F§7.1). */
export function deriveSceneLog(input: SceneLogInput): SceneLogState | null {
  if (input.terminal || !input.nodeKey) return null;
  const current = roomGroupOf(input.mapKey);
  const route = STAGE_ROUTES[input.nodeKey] ?? deriveFallbackRoute(input, current);
  if (!route || !route.steps.length) return null;

  const nameTools = input.nameTools ?? NAME_TOOLS_IN_HINTS;
  const doorWorld = {
    inventory: [...input.inventory], inspectedObjectKeys: [...input.inspected],
    usedToolKeys: [...input.usedToolKeys], flags: {}, objects: input.objects,
  };
  const env: Env = {
    input, current, nameTools, inspected: new Set(input.inspected), doorWorld,
    copy: { currentRoom: current, world: doorWorld, nameTools, npcs: input.scenarioNpcs },
  };

  const doneById = new Map(route.steps.map(step => [step.id, isDone(step.done, env)] as const));
  const steps: SceneLogStep[] = [];

  for (const step of route.steps) {
    const done = doneById.get(step.id)!;
    if (step.carryOver && done) continue;

    let state: StepState = done ? 'done' : 'pending';
    let note: string | null = !done ? step.note ?? null : null;
    if (!done && step.needs && !doneById.get(step.needs)) {
      state = 'locked';
      note = step.lockedNote ?? null;
    } else if (!done && step.kind === 'door') {
      const door = input.objects.find(o => o.key === step.targetKey && o.type === 'EXIT');
      const status = door ? doorStatus(door, {
        nodeKey: route.nodeKey, decisionNumber: route.number || null, world: doorWorld,
        viewedNpcKeys: input.viewedNpcKeys, copy: env.copy,
      }) : null;
      if (status?.state === 'locked') {
        state = 'locked';
        note = status.message ?? step.lockedNote ?? null;
      }
    }

    const here = current !== null && step.room === current;
    const coordinates = here ? stepCoordinates(step, input) : null;
    steps.push({
      id: step.id, kind: step.kind, weight: step.weight, state,
      label: nameTools && step.labelNamed ? step.labelNamed : step.label,
      place: coordinates ? placeHint(coordinates.x, coordinates.y, { door: step.kind === 'door' }) : null,
      roomLabel: !here || step.kind === 'decide' ? ROOM_LABELS[step.room].en : null,
      here, note, targetKey: step.targetKey, room: step.room, doneText: doneText(step),
    });
  }

  // Siguiente: el primer paso, en el orden autorado, que no está hecho ni bloqueado.
  const next = steps.find(step => step.state === 'pending');
  if (next) next.state = 'next';
  const hopKey = next && !next.here && current ? firstHop(current, next.room) : null;
  const hopDoorKey = hopKey && input.objects.some(o => o.key === hopKey) ? hopKey : null;

  // Grupos: tramos consecutivos de la ruta por sala; encabezado solo si la etapa cruza más de una.
  const crossesRooms = new Set(steps.map(step => step.room)).size > 1;
  const groups: SceneLogGroup[] = [];
  for (const step of steps) {
    let group = groups.at(-1);
    if (!group || group.room !== step.room) {
      const isCurrent = step.room === current;
      const label = ROOM_LABELS[step.room];
      group = {
        room: step.room, current: isCurrent, collapsed: false, steps: [],
        header: crossesRooms ? `${label.group} · ${label.name}${isCurrent ? ORIENTATION_COPY.card.hereSuffix : ''}` : null,
      };
      groups.push(group);
    }
    group.steps.push(step);
  }
  for (const group of groups) group.collapsed = group.steps.every(s => s.state === 'done') && !group.current;

  const prep = steps.filter(step => step.weight === 'prep');
  const prepDone = prep.filter(step => step.state === 'done').length;
  const footer = !prep.length ? ''
    : prepDone < prep.length ? ORIENTATION_COPY.card.footerPending(prepDone, prep.length)
      : ORIENTATION_COPY.card.footerDone;

  return {
    number: route.number, total: route.number > 0 ? DECISION_TOTAL : 0, title: route.title, intro: route.intro,
    next: next ? { stepId: next.id, targetKey: next.targetKey, room: next.room, isHere: next.here, hopDoorKey } : null,
    nextLine: nextLineFor(next, env), groups, optional: buildOptional(route, env),
    prepDone, prepTotal: prep.length, footer,
  };
}

/** Pasos recién hechos entre dos evaluaciones (no repite al recomputar; omite la primera evaluación). */
export function diffDone(prev: SceneLogState | null, next: SceneLogState): SceneLogStep[] {
  if (!prev) return [];
  const before = new Map(prev.groups.flatMap(g => g.steps).map(step => [step.id, step.state] as const));
  return next.groups.flatMap(g => g.steps)
    .filter(step => step.state === 'done' && before.has(step.id) && before.get(step.id) !== 'done');
}

/** Clave del objeto que lleva el anillo: el destino (o la puerta que hay que tomar si está en otra sala). */
export function ringTargetKey(state: SceneLogState | null, highlightTools: boolean): string | null {
  if (!state?.next) return null;
  const step = state.groups.flatMap(g => g.steps).find(s => s.id === state.next!.stepId);
  if (step?.kind === 'collect' && !highlightTools) return null;
  const key = state.next.isHere ? state.next.targetKey : state.next.hopDoorKey;
  return key || null;
}

/** Pasos pendientes (no hechos) de la etapa: el número del chip plegado «Qué hacer · {n}». */
export function pendingStepCount(state: SceneLogState | null): number {
  return state ? state.groups.reduce((n, g) => n + g.steps.filter(s => s.state !== 'done').length, 0) : 0;
}

/** Lo que el componente de juego ya tiene a mano para pedir la lista. */
export interface SceneLogSources {
  attempt: (Pick<SimulationAttemptState, 'status'> & {
    currentNode: Pick<SimulationNodeState, 'key' | 'title' | 'narrative' | 'terminal'> & {
      /** Solo se leen los ids de las opciones. */
      options?: ReadonlyArray<{ id: number }>;
    };
  }) | null;
  world: Pick<SimulationWorldState, 'map' | 'objects' | 'inventory' | 'inspectedObjectKeys' | 'usedToolKeys' | 'flags'> | null;
  /** La señal viewedNpcKeys del componente (se une con lo que el servidor persistió en el mundo). */
  viewedNpcKeys: ReadonlySet<string>;
  visitedRooms: ReadonlySet<RoomGroup>;
  /** NPC del escenario cargado (scenarioConfig.rooms[].npcs); si no hay, lista vacía. */
  scenarioNpcs?: ReadonlyArray<Pick<NpcConfig, 'key' | 'displayName' | 'x' | 'y'>>;
  nameTools?: boolean;
}

/**
 * Arma la entrada de deriveSceneLog desde el intento y el mundo: une las personas habladas de la señal con
 * flags.viewedNpcKeys del servidor y pasa solo los ids de las opciones de decisión. null si aún no hay
 * intento o mundo. Un intento que no está en curso cuenta como terminal (no hay lista).
 */
export function sceneLogInputFrom(sources: SceneLogSources): SceneLogInput | null {
  const { attempt, world } = sources;
  if (!attempt || !world) return null;
  const node = attempt.currentNode;
  return {
    nodeKey: node.key, nodeTitle: node.title, nodeNarrative: node.narrative,
    nodeOptionIds: node.options ? node.options.map(option => option.id) : null,
    mapKey: world.map.key, objects: world.objects,
    inventory: world.inventory, inspected: world.inspectedObjectKeys, usedToolKeys: world.usedToolKeys,
    viewedNpcKeys: collectViewedNpcKeys(world, sources.viewedNpcKeys),
    visitedRooms: sources.visitedRooms,
    scenarioNpcs: (sources.scenarioNpcs ?? []).map(({ key, displayName, x, y }) => ({ key, displayName, x, y })),
    terminal: node.terminal || attempt.status !== 'IN_PROGRESS',
    ...(sources.nameTools === undefined ? {} : { nameTools: sources.nameTools }),
  };
}
