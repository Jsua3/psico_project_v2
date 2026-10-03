import { DialogueState, MapObjectState } from '../../core/models/simulation.model';
import { NODE_EVIDENCE } from './evidence-gating.config';
import { ROUTE_ORDER, RoomGroup } from './orientation.config';
import { textViolations } from './orientation-text.testing';
import {
  SceneLogInput, SceneLogState, SceneLogStep, deriveSceneLog, diffDone, firstHop, pendingStepCount, ringTargetKey,
  roomGroupOf,
} from './scene-checklist.util';
import { DoneRule, RouteStep, STAGE_ROUTES } from './stage-route.config';

// ───────────────────────── Fixtures: el caso, con las coordenadas del seed ─────────────────────────

function obj(key: string, label: string, type: MapObjectState['type'], x: number, y: number, extra: Partial<MapObjectState> = {}): MapObjectState {
  return {
    key, label, type, x, y, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, ...extra,
  };
}

function dialogue(key: string, ids: number[]): DialogueState {
  return {
    key, speakerName: 'Hablante', portraitKey: null, emotion: 'neutral', lines: [],
    choices: ids.map(id => ({ key: `o${id}`, text: `Opción ${id}`, decisionOptionId: id, requiredToolCode: null, effect: {} })),
  };
}

const DECISION_IDS: Record<string, number[]> = {
  'hospital-urgencias': [101, 102, 103], 'hospital-sala-escucha': [201, 202, 203],
  'hospital-accion-etica': [301, 302, 303, 304], 'hospital-cierre-bloque': [401, 402, 403],
  'comisaria-consultorio': [501, 502, 503], 'comisaria-accion-final': [601, 602, 603],
};

const door = (key: string, label: string, x: number, y: number, metadata?: Record<string, unknown>) =>
  obj(key, label, 'EXIT', x, y, { metadata });

function roomObjects(room: RoomGroup, nodeKey: string, collected: ReadonlySet<string>): MapObjectState[] {
  const tool = (key: string, label: string, code: string, x: number, y: number) =>
    collected.has(code) ? [] : [obj(key, label, 'TOOL', x, y, { toolCode: code })];
  switch (room) {
    case 'urgencias':
      return [
        obj('familia-crisis', 'Familia en crisis', 'PERSON', 190, 420),
        obj('zona-restringida', 'Acceso a quirófano', 'OBJECT', 660, 268),
        ...tool('tool-pap', 'Kit PAP', 'PAP', 318, 428),
        door('puerta-sala-escucha', 'Sala de escucha familiar', 838, 440, { requiresInspected: ['familia-crisis'], lockedMessage: 'texto viejo' }),
      ];
    case 'sala-escucha':
      if (nodeKey === 'hospital-cierre-bloque') {
        return [
          obj('familia-duelo', 'Familia acompañada', 'PERSON', 168, 408),
          obj('resumen-bloque', 'Registro hospitalario', 'OBJECT', 480, 360),
          ...tool('tool-bitacora', 'Bitácora', 'REFLECTION_JOURNAL', 560, 430),
          door('puerta-urgencias', 'Sala de urgencias', 122, 460),
          door('salida-institucional', 'Salida institucional', 838, 440),
        ];
      }
      return [
        obj('familia-duelo', 'Familia en crisis', 'PERSON', 168, 408, { dialogue: dialogue('familia-duelo', [101, 102, 103]) }),
        obj('marco-normativo-hospital', 'Marco normativo', 'OBJECT', 660, 320, { dialogue: dialogue('marco-normativo-hospital', [201, 202, 203]) }),
        obj('psicologa-acompanante', 'Psicóloga hospitalaria', 'PERSON', 740, 400, { dialogue: dialogue('psicologa-acompanante', [301, 302, 303, 304]) }),
        ...tool('tool-spikes', 'Protocolo EPICEE', 'SPIKES', 480, 300),
        ...tool('tool-bitacora', 'Bitácora', 'REFLECTION_JOURNAL', 560, 430),
        door('puerta-urgencias', 'Sala de urgencias', 122, 460),
        door('salida-institucional', 'Salida institucional', 838, 440, { requiresNodes: ['hospital-cierre-bloque'] }),
      ];
    case 'recepcion':
      return [
        obj('expediente-caso', 'Expediente del caso', 'OBJECT', 740, 312),
        obj('funcionaria-recepcion', 'Funcionaria de recepción', 'PERSON', 480, 332),
        door('puerta-consultorio', 'Consultorio', 838, 440, { requiresInspected: ['expediente-caso'] }),
      ];
    case 'consultorio':
      return [
        obj('sobreviviente-consulta', 'Sobreviviente', 'PERSON', 220, 408, { dialogue: dialogue('sobreviviente-consulta', [401, 402, 403, 601]) }),
        obj('marco-normativo-comisaria', 'Marco normativo', 'OBJECT', 790, 318, { dialogue: dialogue('marco-normativo-comisaria', [501, 502, 503]) }),
        obj('profesional-psicosocial', 'Profesional psicosocial', 'PERSON', 700, 400, { dialogue: dialogue('profesional-psicosocial', [601, 602, 603]) }),
        ...tool('tool-riesgo', 'Valoración de riesgo', 'RISK_METER', 318, 436),
        ...tool('tool-ruta', 'Ruta de protección', 'SAFETY_ROUTE', 610, 436),
        door('puerta-recepcion', 'Recepción', 122, 460),
      ];
  }
}

const NPCS: Record<RoomGroup, SceneLogInput['scenarioNpcs']> = {
  'urgencias': [
    { key: 'enfermera-urgencias', displayName: 'Enfermera de urgencias', x: 560, y: 330 },
    { key: 'medico-guardia', displayName: 'Médico de guardia', x: 640, y: 290 },
    { key: 'psicologa-orientadora', displayName: 'Psicóloga hospitalaria', x: 780, y: 440 },
  ],
  'sala-escucha': [{ key: 'trabajadora-social', displayName: 'Trabajadora social', x: 480, y: 380 }],
  'recepcion': [
    { key: 'orientadora-juridica', displayName: 'Orientadora jurídica', x: 320, y: 360 },
    { key: 'sobreviviente-espera', displayName: 'Sobreviviente', x: 180, y: 380 },
    { key: 'madre-acompanante', displayName: 'Madre de la sobreviviente', x: 230, y: 396 },
  ],
  'consultorio': [{ key: 'apoyo-psicosocial', displayName: 'Apoyo psicosocial', x: 660, y: 430 }],
};

const MAP_KEY: Record<RoomGroup, (nodeKey: string) => string> = {
  'urgencias': () => 'hospital-urgencias',
  'sala-escucha': nodeKey => ({
    'hospital-urgencias': 'hospital-sala-escucha', 'hospital-sala-escucha': 'hospital-sala-escucha',
    'hospital-accion-etica': 'hospital-sala-escucha-accion', 'hospital-cierre-bloque': 'hospital-sala-escucha-cierre',
  } as Record<string, string>)[nodeKey] ?? 'hospital-sala-escucha',
  'recepcion': () => 'comisaria-recepcion',
  'consultorio': nodeKey => (nodeKey === 'comisaria-accion-final' ? 'comisaria-consultorio-marco' : 'comisaria-consultorio'),
};

interface Progress {
  inventory?: string[]; inspected?: string[]; used?: string[]; viewed?: string[]; visited?: RoomGroup[];
}

function input(nodeKey: string, room: RoomGroup | null, progress: Progress = {}, extra: Partial<SceneLogInput> = {}): SceneLogInput {
  const inventory = progress.inventory ?? [];
  return {
    nodeKey, nodeTitle: 'Título del nodo', nodeNarrative: 'Primera frase. Segunda frase.',
    nodeOptionIds: DECISION_IDS[nodeKey] ?? null,
    mapKey: room ? MAP_KEY[room](nodeKey) : null,
    objects: room ? roomObjects(room, nodeKey, new Set(inventory)) : [],
    inventory, inspected: progress.inspected ?? [], usedToolKeys: progress.used ?? [],
    viewedNpcKeys: new Set(progress.viewed ?? []), visitedRooms: new Set(progress.visited ?? []),
    scenarioNpcs: room ? NPCS[room] : [], terminal: false, ...extra,
  };
}

function derive(nodeKey: string, room: RoomGroup | null, progress: Progress = {}, extra: Partial<SceneLogInput> = {}): SceneLogState {
  const state = deriveSceneLog(input(nodeKey, room, progress, extra));
  if (!state) throw new Error(`sin lista para ${nodeKey}`);
  return state;
}

const allSteps = (state: SceneLogState): SceneLogStep[] => state.groups.flatMap(g => g.steps);
const step = (state: SceneLogState, id: string): SceneLogStep => {
  const found = allSteps(state).find(s => s.id === id);
  if (!found) throw new Error(`falta el paso ${id}`);
  return found;
};
const states = (state: SceneLogState) => Object.fromEntries(allSteps(state).map(s => [s.id, s.state]));

// ───────────────────────── Salas, camino y anillo ─────────────────────────

describe('roomGroupOf y firstHop', () => {
  it.each([
    ['hospital-urgencias', 'urgencias'],
    ['hospital-sala-escucha', 'sala-escucha'], ['hospital-sala-escucha-accion', 'sala-escucha'], ['hospital-sala-escucha-cierre', 'sala-escucha'],
    ['comisaria-recepcion', 'recepcion'],
    ['comisaria-consultorio', 'consultorio'], ['comisaria-consultorio-marco', 'consultorio'], ['comisaria-consultorio-cierre', 'consultorio'],
    ['urgencias-crisis', null], ['', null], [null, null], [undefined, null],
  ] as const)('%s → %s', (mapKey, expected) => {
    expect(roomGroupOf(mapKey)).toBe(expected);
  });

  it('firstHop devuelve la puerta de la sala actual que hay que tomar primero, aunque falten varias salas', () => {
    expect(firstHop('urgencias', 'sala-escucha')).toBe('puerta-sala-escucha');
    expect(firstHop('sala-escucha', 'urgencias')).toBe('puerta-urgencias');
    expect(firstHop('urgencias', 'recepcion')).toBe('puerta-sala-escucha');
    expect(firstHop('urgencias', 'consultorio')).toBe('puerta-sala-escucha');
    expect(firstHop('sala-escucha', 'consultorio')).toBe('salida-institucional');
    expect(firstHop('recepcion', 'consultorio')).toBe('puerta-consultorio');
    expect(firstHop('consultorio', 'recepcion')).toBe('puerta-recepcion');
  });

  it('sin camino (no hay vuelta al hospital desde la recepción) o en la misma sala, null', () => {
    expect(firstHop('recepcion', 'sala-escucha')).toBeNull();
    expect(firstHop('consultorio', 'urgencias')).toBeNull();
    expect(firstHop('urgencias', 'urgencias')).toBeNull();
  });
});

// ───────────────────────── Etapa 1, paso a paso ─────────────────────────

describe('deriveSceneLog · etapa 1 (Urgencias)', () => {
  const N = 'hospital-urgencias';

  it('estado inicial: lo siguiente es recoger el material, con su lugar vivo y el pie del diseño', () => {
    const s = derive(N, 'urgencias');
    expect(s).toMatchObject({ number: 1, total: 6, title: 'Urgencia vital y crisis', prepDone: 0, prepTotal: 3 });
    expect(s.intro).toBe('Estás en Urgencias. Reúne lo que necesites aquí y pasa a la Sala de escucha familiar: ahí tomarás tu primera decisión.');
    expect(s.next).toEqual({ stepId: 'u1-recoger', targetKey: 'tool-pap', room: 'urgencias', isHere: true, hopDoorKey: null });
    expect(s.nextLine).toBe('Ahora: Recoge el material de apoyo de la sala · a la izquierda, al frente');
    expect(s.footer).toBe('Recomendado antes de decidir: 0 de 3 hechos. Puedes decidir cuando quieras.');
    expect(states(s)).toEqual({
      'u1-recoger': 'next', 'u1-familia': 'pending', 'u1-usar': 'locked', 'u1-enfermera': 'pending',
      'u1-puerta': 'locked', 'u1-decidir': 'pending',
    });
    expect(step(s, 'u1-usar').note).toBe('Primero recoge el material de apoyo de la sala.');
    expect(step(s, 'u1-puerta').note).toBe('Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).');
    expect(step(s, 'u1-puerta').place).toBe('puerta en el extremo derecho');
    expect(step(s, 'u1-familia').place).toBe('en el extremo izquierdo, al frente');
    expect(step(s, 'u1-enfermera').place).toBe('en el centro, al fondo');
  });

  it('los grupos: Urgencias (aquí) y la Sala de escucha; la decisión dice siempre en qué sala está', () => {
    const s = derive(N, 'urgencias');
    expect(s.groups.map(g => [g.room, g.header, g.current, g.collapsed])).toEqual([
      ['urgencias', 'Hospital · Urgencias · estás aquí', true, false],
      ['sala-escucha', 'Hospital · Sala de escucha familiar', false, false],
    ]);
    const decide = step(s, 'u1-decidir');
    expect(decide.roomLabel).toBe('en la Sala de escucha familiar');
    expect(decide.here).toBe(false);
    expect(decide.place).toBeNull();
    expect(step(s, 'u1-recoger').roomLabel).toBeNull();
  });

  it('tras recoger: el siguiente pasa a hablar con la Familia en crisis y «usar» sigue esperando la conversación', () => {
    const s = derive(N, 'urgencias', { inventory: ['PAP'] });
    expect(states(s)).toMatchObject({ 'u1-recoger': 'done', 'u1-familia': 'next', 'u1-usar': 'pending', 'u1-puerta': 'locked' });
    expect(s.nextLine).toBe('Ahora: Habla con la Familia en crisis · en el extremo izquierdo, al frente');
    expect(s.prepDone).toBe(1);
    expect(step(s, 'u1-usar').note).toBe('Aparece como opción dentro de la conversación.');
    expect(ringTargetKey(s, true)).toBe('familia-crisis');
  });

  it('tras hablar con la familia: «usar» es el siguiente y la puerta se desbloquea con el motivo vivo ya resuelto', () => {
    const s = derive(N, 'urgencias', { inventory: ['PAP'], inspected: ['familia-crisis'] });
    expect(states(s)).toMatchObject({ 'u1-familia': 'done', 'u1-usar': 'next', 'u1-puerta': 'pending' });
    expect(s.nextLine).toBe('Ahora: Usa el material de apoyo en esa conversación · en el extremo izquierdo, al frente');
    expect(step(s, 'u1-puerta').note).toBeNull();
  });

  it('usar hecho → enfermera; enfermera hecha → puerta; todo lo recomendado hecho cambia el pie', () => {
    const base = { inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@familia-crisis'] };
    const enfermera = derive(N, 'urgencias', base);
    expect(enfermera.next?.stepId).toBe('u1-enfermera');
    expect(enfermera.nextLine).toBe('Ahora: Habla con la Enfermera de urgencias · en el centro, al fondo');
    const puerta = derive(N, 'urgencias', { ...base, viewed: ['enfermera-urgencias'] });
    expect(puerta.next?.stepId).toBe('u1-puerta');
    expect(puerta.nextLine).toBe('Ahora: Pasa a la Sala de escucha familiar · puerta en el extremo derecho');
    expect(puerta).toMatchObject({ prepDone: 3, prepTotal: 3, footer: 'Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.' });
    expect(ringTargetKey(puerta, true)).toBe('puerta-sala-escucha');
  });

  it('en la Sala de escucha con todo hecho: solo queda la decisión, con su lugar', () => {
    const s = derive(N, 'sala-escucha', {
      inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@familia-crisis'], viewed: ['enfermera-urgencias'],
    });
    expect(states(s)).toMatchObject({ 'u1-puerta': 'done', 'u1-decidir': 'next' });
    expect(s.next).toEqual({ stepId: 'u1-decidir', targetKey: 'familia-duelo', room: 'sala-escucha', isHere: true, hopDoorKey: null });
    expect(s.nextLine).toBe('Ahora: Toma tu primera decisión con la Familia en crisis · en el extremo izquierdo, al frente');
    expect(s.groups[0]).toMatchObject({ room: 'urgencias', collapsed: true, current: false });
    expect(s.groups[1]).toMatchObject({ room: 'sala-escucha', collapsed: false, current: true });
    expect(ringTargetKey(s, true)).toBe('familia-duelo');
  });

  it('en la Sala de escucha con pendientes en Urgencias: «Ve a Urgencias (puerta …) y habla con …» (F§9.1)', () => {
    const s = derive(N, 'sala-escucha', { inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@familia-crisis'] });
    expect(s.next).toEqual({ stepId: 'u1-enfermera', targetKey: 'npc:enfermera-urgencias', room: 'urgencias', isHere: false, hopDoorKey: 'puerta-urgencias' });
    expect(s.nextLine).toBe('Ahora: Ve a Urgencias (puerta en el extremo izquierdo) y habla con la Enfermera de urgencias');
    expect(step(s, 'u1-enfermera').roomLabel).toBe('en Urgencias');
    expect(step(s, 'u1-enfermera').place).toBeNull();
    expect(ringTargetKey(s, true)).toBe('puerta-urgencias');
  });

  it('entre salas sin camino, o sin la puerta en el mundo, cae a «{texto} · en la sala»', () => {
    const noDoor = deriveSceneLog({ ...input(N, 'sala-escucha', { inventory: ['PAP'] }), objects: [] })!;
    expect(noDoor.nextLine).toBe('Ahora: Habla con la Familia en crisis · en Urgencias');
    expect(noDoor.next?.hopDoorKey).toBeNull();
    expect(ringTargetKey(noDoor, true)).toBeNull();
    // Desde el consultorio no hay vuelta al hospital: etapa 3 con la herramienta pendiente en la sala de escucha.
    const lost = deriveSceneLog({ ...input('hospital-accion-etica', 'consultorio'), mapKey: 'comisaria-consultorio' })!;
    expect(lost.nextLine).toBe('Ahora: Recoge el material del estante · en la Sala de escucha familiar');
    expect(lost.next?.hopDoorKey).toBeNull();
  });

  it('sin sala conocida (mundo sin cargar) no inventa lugares', () => {
    const s = derive(N, null);
    expect(allSteps(s).every(x => x.place === null && !x.here)).toBe(true);
    expect(s.nextLine).toBe('Ahora: Recoge el material de apoyo de la sala · en Urgencias');
    expect(s.groups.every(g => !g.current)).toBe(true);
  });

  it('usar la herramienta sin haberla recogido no rompe: «usar» sale hecho aunque «recoger» no', () => {
    const s = derive(N, 'urgencias', { used: ['PAP@familia-crisis'] });
    expect(states(s)).toMatchObject({ 'u1-recoger': 'next', 'u1-usar': 'done' });
  });
});

// ───────────────────────── Etapas 2 a 6 ─────────────────────────

describe('deriveSceneLog · etapas 2, 3, 5 y 6', () => {
  it('etapa 2: solo la decisión, con su introducción y sin encabezados de sala ni pie', () => {
    const s = derive('hospital-sala-escucha', 'sala-escucha');
    expect(s).toMatchObject({ number: 2, title: 'Marco normativo en salud', intro: 'Tu segunda decisión te espera en esta sala.', prepTotal: 0, footer: '' });
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].header).toBeNull();
    expect(s.nextLine).toBe('Ahora: Toma tu segunda decisión en el Marco normativo · a la derecha, al fondo');
  });

  it('etapa 3: recoger lo del estante y luego la decisión con la Psicóloga hospitalaria', () => {
    const s = derive('hospital-accion-etica', 'sala-escucha');
    expect(s.nextLine).toBe('Ahora: Recoge el material del estante · en el centro, al fondo');
    expect(s).toMatchObject({ prepTotal: 1, footer: 'Recomendado antes de decidir: 0 de 1 hecho. Puedes decidir cuando quieras.' });
    const done = derive('hospital-accion-etica', 'sala-escucha', { inventory: ['SPIKES'] });
    expect(done.nextLine).toBe('Ahora: Toma tu tercera decisión con la Psicóloga hospitalaria · a la derecha, al frente');
    expect(done.footer).toBe('Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.');
  });

  it('etapa 5: solo la decisión en el Marco normativo', () => {
    const s = derive('comisaria-consultorio', 'consultorio');
    expect(s).toMatchObject({ number: 5, title: 'Marco normativo de derechos' });
    expect(s.nextLine).toBe('Ahora: Toma tu quinta decisión en el Marco normativo · en el extremo derecho, al fondo');
  });

  it('etapa 6: lo arrastrado (carryOver) solo se emite si sigue pendiente', () => {
    const pending = derive('comisaria-accion-final', 'consultorio');
    expect(allSteps(pending).map(x => x.id)).toEqual(['c6-recoger', 'c6-usar', 'c6-decidir']);
    expect(pending).toMatchObject({ number: 6, prepTotal: 2, prepDone: 0 });
    expect(pending.nextLine).toBe('Ahora: Recoge el instrumento de la sala · a la izquierda, al frente');

    const collected = derive('comisaria-accion-final', 'consultorio', { inventory: ['RISK_METER'] });
    expect(allSteps(collected).map(x => x.id)).toEqual(['c6-usar', 'c6-decidir']);
    expect(collected.nextLine).toBe('Ahora: Usa el instrumento en la conversación con la Sobreviviente · a la izquierda, al frente');
    expect(step(collected, 'c6-usar').state).toBe('next');

    const used = derive('comisaria-accion-final', 'consultorio', { inventory: ['RISK_METER'], used: ['RISK_METER@sobreviviente-consulta'] });
    expect(allSteps(used).map(x => x.id)).toEqual(['c6-decidir']);
    expect(used).toMatchObject({ prepTotal: 0, prepDone: 0, footer: '' });
    expect(used.nextLine).toBe('Ahora: Toma tu sexta decisión con la Profesional psicosocial · a la derecha, al frente');
  });

  it('terminal, sin nodo o sin ruta ni derivación: no hay lista', () => {
    expect(deriveSceneLog({ ...input('hospital-urgencias', 'urgencias'), terminal: true })).toBeNull();
    expect(deriveSceneLog({ ...input('hospital-urgencias', 'urgencias'), nodeKey: null })).toBeNull();
    expect(deriveSceneLog(input('cierre-caso', 'consultorio'))).toBeNull();
    expect(deriveSceneLog(input('comisaria-recepcion', 'recepcion'))).toBeNull();
    expect(deriveSceneLog(input('nodo-de-editor', 'urgencias'))).toBeNull();
  });
});

describe('deriveSceneLog · etapa 4 (varias salas)', () => {
  const N = 'hospital-cierre-bloque';

  it('en la sala de escucha: salir hacia la Comisaría por la puerta de la derecha', () => {
    const s = derive(N, 'sala-escucha');
    expect(s).toMatchObject({ number: 4, title: 'Ruta de restablecimiento', intro: 'La atención continúa en la Comisaría de Familia: sal por la puerta de la derecha.' });
    expect(s.next?.stepId).toBe('c4-salida');
    expect(s.nextLine).toBe('Ahora: Sal hacia la Comisaría de Familia · puerta en el extremo derecho');
    expect(s.groups.map(g => g.header)).toEqual([
      'Hospital · Sala de escucha familiar · estás aquí', 'Comisaría de Familia · Recepción', 'Comisaría de Familia · Consultorio',
    ]);
    expect(states(s)).toMatchObject({ 'c4-salida': 'next', 'c4-expediente': 'pending', 'c4-puerta': 'pending', 'c4-recoger': 'pending', 'c4-usar': 'locked' });
  });

  it('en la recepción sin expediente: revisarlo; la puerta del consultorio dice por qué sigue cerrada', () => {
    const s = derive(N, 'recepcion');
    expect(states(s)).toMatchObject({ 'c4-salida': 'done', 'c4-expediente': 'next', 'c4-puerta': 'locked' });
    expect(s.nextLine).toBe('Ahora: Revisa el Expediente del caso · a la derecha, al fondo');
    expect(step(s, 'c4-puerta').note).toBe('Antes de pasar, revisa el Expediente del caso (a la derecha, al fondo).');
    expect(s.groups[0]).toMatchObject({ room: 'sala-escucha', collapsed: true });
  });

  it('en la recepción con expediente: pasar al Consultorio', () => {
    const s = derive(N, 'recepcion', { inspected: ['expediente-caso'] });
    expect(states(s)).toMatchObject({ 'c4-expediente': 'done', 'c4-puerta': 'next' });
    expect(s.nextLine).toBe('Ahora: Pasa al Consultorio · puerta en el extremo derecho');
    expect(ringTargetKey(s, true)).toBe('puerta-consultorio');
  });

  it('en el consultorio: recoger, usar y decidir, cada uno con su lugar', () => {
    const start = derive(N, 'consultorio', { inspected: ['expediente-caso'] });
    expect(states(start)).toMatchObject({ 'c4-salida': 'done', 'c4-puerta': 'done', 'c4-recoger': 'next', 'c4-usar': 'locked', 'c4-decidir': 'pending' });
    expect(start.nextLine).toBe('Ahora: Recoge el instrumento de la sala · a la izquierda, al frente');
    expect(step(start, 'c4-usar').note).toBe('Primero recoge el instrumento de la sala.');

    const owned = derive(N, 'consultorio', { inspected: ['expediente-caso'], inventory: ['RISK_METER'] });
    expect(owned.next?.stepId).toBe('c4-usar');
    expect(owned.nextLine).toBe('Ahora: Usa el instrumento en la conversación con la Sobreviviente · a la izquierda, al frente');

    const used = derive(N, 'consultorio', { inspected: ['expediente-caso'], inventory: ['RISK_METER'], used: ['RISK_METER@sobreviviente-consulta'] });
    expect(used.next?.stepId).toBe('c4-decidir');
    expect(used.nextLine).toBe('Ahora: Toma tu cuarta decisión con la Sobreviviente · a la izquierda, al frente');
    expect(used.footer).toBe('Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.');
  });

  it('en el consultorio sin haber revisado el expediente: vuelve a la Recepción por la puerta de la izquierda', () => {
    const s = derive(N, 'consultorio');
    expect(s.next?.stepId).toBe('c4-expediente');
    expect(s.nextLine).toBe('Ahora: Ve a la Recepción (puerta en el extremo izquierdo) y revisa el Expediente del caso');
    expect(s.next?.hopDoorKey).toBe('puerta-recepcion');
  });

  it('la herramienta del consultorio puede nombrarse solo con la bandera de nombres', () => {
    const named = derive(N, 'consultorio', { inspected: ['expediente-caso'] }, { nameTools: true });
    expect(named.nextLine).toBe('Ahora: Recoge la Valoración de riesgo · a la izquierda, al frente');
    expect(step(named, 'c4-usar').label).toBe('Usa la Valoración de riesgo con la Sobreviviente');
    const generic = derive(N, 'consultorio', { inspected: ['expediente-caso'] }, { nameTools: false });
    expect(JSON.stringify(generic)).not.toMatch(/Valoración de riesgo/);
  });
});

describe('regla monótona de salas alcanzadas', () => {
  it('estar en una sala posterior da por alcanzadas las anteriores, sin conjunto guardado (F5, navegador nuevo)', () => {
    const s = derive('hospital-urgencias', 'sala-escucha');
    expect(step(s, 'u1-puerta').state).toBe('done');
    expect(derive('hospital-urgencias', 'urgencias').groups[0].steps.find(x => x.id === 'u1-puerta')!.state).not.toBe('done');
  });

  it('el conjunto guardado la refuerza cuando el jugador vuelve atrás', () => {
    const back = derive('hospital-urgencias', 'urgencias', { visited: ['urgencias', 'sala-escucha'] });
    expect(step(back, 'u1-puerta').state).toBe('done');
    const stage4 = derive('hospital-cierre-bloque', 'sala-escucha', { visited: ['recepcion'] });
    expect(step(stage4, 'c4-salida').state).toBe('done');
    expect(stage4.next?.stepId).toBe('c4-expediente');
  });
});

describe('deriveSceneLog · el siguiente salta lo bloqueado', () => {
  afterEach(() => { delete STAGE_ROUTES['nodo-sintetico']; });

  it('si un paso bloqueado precede a uno libre, el siguiente es el libre (el orden manda entre los disponibles)', () => {
    STAGE_ROUTES['nodo-sintetico'] = {
      nodeKey: 'nodo-sintetico', number: 2, title: 'Etapa sintética', intro: 'Introducción.',
      steps: [
        { id: 's-usar', kind: 'use', weight: 'prep', room: 'urgencias', targetKey: 'familia-crisis', label: 'Usa el material de apoyo en esa conversación', lockedNote: 'Primero recoge el material de apoyo de la sala.', done: { type: 'toolUsed', toolCode: 'PAP' }, needs: 's-recoger' },
        { id: 's-recoger', kind: 'collect', weight: 'prep', room: 'urgencias', targetKey: 'tool-pap', label: 'Recoge el material de apoyo de la sala', done: { type: 'inventory', toolCode: 'PAP' } },
        { id: 's-decidir', kind: 'decide', weight: 'decision', room: 'urgencias', targetKey: 'familia-crisis', label: 'Toma tu segunda decisión con la Familia en crisis', done: { type: 'never' } },
      ],
    };
    const s = derive('nodo-sintetico', 'urgencias');
    expect(states(s)).toEqual({ 's-usar': 'locked', 's-recoger': 'next', 's-decidir': 'pending' });
    expect(s.next?.stepId).toBe('s-recoger');
    const open = derive('nodo-sintetico', 'urgencias', { inventory: ['PAP'] });
    expect(states(open)).toEqual({ 's-usar': 'next', 's-recoger': 'done', 's-decidir': 'pending' });
  });

  it('si todo lo que queda está bloqueado, no hay siguiente ni línea «Ahora:»', () => {
    STAGE_ROUTES['nodo-sintetico'] = {
      nodeKey: 'nodo-sintetico', number: 2, title: 'Etapa sintética', intro: 'Introducción.',
      steps: [
        { id: 's-a', kind: 'use', weight: 'prep', room: 'urgencias', targetKey: 'familia-crisis', label: 'Usa el material de apoyo en esa conversación', lockedNote: 'Primero recoge el material de apoyo de la sala.', done: { type: 'toolUsed', toolCode: 'PAP' }, needs: 's-b' },
        { id: 's-b', kind: 'use', weight: 'prep', room: 'urgencias', targetKey: 'familia-crisis', label: 'Usa el material de apoyo en esa conversación', lockedNote: 'Primero recoge el material de apoyo de la sala.', done: { type: 'toolUsed', toolCode: 'PAP' }, needs: 's-a' },
      ],
    };
    const s = derive('nodo-sintetico', 'urgencias');
    expect(states(s)).toEqual({ 's-a': 'locked', 's-b': 'locked' });
    expect(s.next).toBeNull();
    expect(s.nextLine).toBe('');
    expect(ringTargetKey(s, true)).toBeNull();
  });
});

// ───────────────────────── «También en esta sala» ─────────────────────────

describe('deriveSceneLog · opcionales («También en esta sala»)', () => {
  it('urgencias: lo que no es destino de un paso, ni puerta, ni herramienta, de izquierda a derecha y sin marcar siguiente', () => {
    const s = derive('hospital-urgencias', 'urgencias');
    expect(s.optional).toEqual([
      { key: 'npc:medico-guardia', label: 'Médico de guardia', seen: false, kind: 'person', mark: 'aún no' },
      { key: 'zona-restringida', label: 'Acceso a quirófano', seen: false, kind: 'object', mark: 'aún no' },
      { key: 'npc:psicologa-orientadora', label: 'Psicóloga hospitalaria', seen: false, kind: 'person', mark: 'aún no' },
    ]);
  });

  it('las marcas dicen «ya hablaste» y «ya revisaste» solo cuando es cierto', () => {
    const s = derive('hospital-urgencias', 'urgencias', { viewed: ['medico-guardia'], inspected: ['zona-restringida'] });
    expect(s.optional.map(e => [e.label, e.mark])).toEqual([
      ['Médico de guardia', 'ya hablaste'], ['Acceso a quirófano', 'ya revisaste'], ['Psicóloga hospitalaria', 'aún no'],
    ]);
  });

  it('en la sala de escucha las decisiones de otras etapas no se listan (se atenúan en el mundo)', () => {
    const s = derive('hospital-urgencias', 'sala-escucha');
    expect(s.optional.map(e => e.key)).toEqual(['npc:trabajadora-social']);
    const stage2 = derive('hospital-sala-escucha', 'sala-escucha');
    // Etapa 2: el objeto de la decisión activa es el destino del paso; las decisiones 1 y 3 se atenúan.
    expect(stage2.optional.map(e => e.key)).toEqual(['npc:trabajadora-social']);
    // Sin ids de opciones (etapa desconocida) no se puede saber cuáles son de otra etapa: se listan, sin marcar ninguna.
    const unknown = deriveSceneLog({ ...input('hospital-sala-escucha', 'sala-escucha'), nodeOptionIds: null })!;
    expect(unknown.optional.map(e => e.key)).toEqual(['familia-duelo', 'npc:trabajadora-social', 'psicologa-acompanante']);
  });

  it('la sobreviviente que espera en la recepción no se lista (su testimonio no es un estímulo)', () => {
    const s = derive('hospital-cierre-bloque', 'recepcion');
    expect(s.optional.map(e => e.key)).toEqual(['npc:madre-acompanante', 'npc:orientadora-juridica', 'funcionaria-recepcion']);
    expect(s.optional.some(e => e.key.includes('sobreviviente-espera'))).toBe(false);
  });

  it('hasta 8, sin marcar ninguno como siguiente ni destacar', () => {
    const many = Array.from({ length: 12 }, (_, i) => obj(`extra-${i}`, `Extra ${i}`, 'OBJECT', 100 + i * 10, 400));
    const s = deriveSceneLog({ ...input('hospital-urgencias', 'urgencias'), objects: many })!;
    expect(s.optional).toHaveLength(8);
    expect(s.optional[0].label).toBe('Extra 0');
    expect(allSteps(s).some(x => x.targetKey.startsWith('extra'))).toBe(false);
  });

  it('un objeto que además es persona del escenario no se duplica', () => {
    const s = deriveSceneLog({
      ...input('hospital-urgencias', 'urgencias'),
      objects: [obj('medico-guardia', 'Médico de guardia', 'PERSON', 640, 290)],
    })!;
    expect(s.optional.filter(e => e.label === 'Médico de guardia')).toHaveLength(1);
  });
});

// ───────────────────────── Respaldo para etapas sin ruta ─────────────────────────

describe('deriveSceneLog · respaldo derivado', () => {
  afterEach(() => { delete NODE_EVIDENCE['nodo-del-editor']; });

  it('si el nodo exige evidencia conocida, arma una lista del mundo vivo con título e introducción del nodo', () => {
    NODE_EVIDENCE['nodo-del-editor'] = { npcs: ['enfermera-urgencias'], tools: ['SPIKES'], missingMessage: '' };
    const s = deriveSceneLog({
      ...input('nodo-del-editor', 'urgencias'), nodeTitle: 'Etapa del editor',
      nodeNarrative: 'Llega una persona al servicio. Hay que decidir qué hacer.', nodeOptionIds: null,
    })!;
    expect(s).toMatchObject({ number: 0, total: 0, title: 'Etapa del editor', intro: 'Llega una persona al servicio.', prepTotal: 2 });
    expect(allSteps(s).map(x => [x.id, x.label])).toEqual([
      ['d-npc-enfermera-urgencias', 'Habla con la Enfermera de urgencias'],
      ['d-col-SPIKES', 'Recoge el material del estante'],
    ]);
    expect(s.next?.stepId).toBe('d-npc-enfermera-urgencias');
    expect(s.nextLine).toBe('Ahora: Habla con la Enfermera de urgencias · en el centro, al fondo');
  });

  it('con una decisión alojada en un objeto, la suma al final; sin nada que mostrar, null', () => {
    NODE_EVIDENCE['nodo-del-editor'] = { npcs: ['enfermera-urgencias'], missingMessage: '' };
    const withHost = deriveSceneLog({ ...input('nodo-del-editor', 'sala-escucha'), nodeOptionIds: [101, 102, 103], nodeTitle: 'T', nodeNarrative: null })!;
    expect(allSteps(withHost).at(-1)).toMatchObject({ id: 'd-decidir', kind: 'decide', label: 'Toma tu decisión con Familia en crisis' });
    expect(withHost.intro).toBe('');
    NODE_EVIDENCE['nodo-del-editor'] = { npcs: ['nadie-conocido'], missingMessage: '' };
    expect(deriveSceneLog({ ...input('nodo-del-editor', 'urgencias'), nodeOptionIds: null })).toBeNull();
  });
});

// ───────────────────────── diffDone, anillo y contadores ─────────────────────────

describe('diffDone, ringTargetKey y pendingStepCount', () => {
  it('diffDone omite la primera evaluación y no repite al recomputar', () => {
    const a = derive('hospital-urgencias', 'urgencias');
    const b = derive('hospital-urgencias', 'urgencias', { inventory: ['PAP'] });
    expect(diffDone(null, a)).toEqual([]);
    expect(diffDone(a, a)).toEqual([]);
    const fresh = diffDone(a, b);
    expect(fresh.map(x => x.id)).toEqual(['u1-recoger']);
    expect(fresh[0].doneText).toBe('Anotado: recogiste el material de apoyo de la sala.');
    expect(diffDone(b, b)).toEqual([]);
  });

  it('diffDone devuelve cada paso nuevo con su nota «Anotado: …»', () => {
    const before = derive('hospital-urgencias', 'urgencias', { inventory: ['PAP'] });
    const after = derive('hospital-urgencias', 'urgencias', {
      inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@familia-crisis'], viewed: ['enfermera-urgencias'],
    });
    expect(diffDone(before, after).map(x => x.doneText)).toEqual([
      'Anotado: hablaste con la Familia en crisis.',
      'Anotado: usaste el material de apoyo de la sala en la conversación.',
      'Anotado: hablaste con la Enfermera de urgencias.',
    ]);
    const crossing = diffDone(after, derive('hospital-urgencias', 'sala-escucha', {
      inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@familia-crisis'], viewed: ['enfermera-urgencias'],
    }));
    expect(crossing.map(x => x.doneText)).toEqual(['Anotado: llegaste a la Sala de escucha familiar.']);
    const review = diffDone(derive('hospital-cierre-bloque', 'recepcion'), derive('hospital-cierre-bloque', 'recepcion', { inspected: ['expediente-caso'] }));
    expect(review.map(x => x.doneText)).toEqual(['Anotado: revisaste el Expediente del caso.']);
    const arrive = diffDone(derive('hospital-cierre-bloque', 'recepcion', { inspected: ['expediente-caso'] }), derive('hospital-cierre-bloque', 'consultorio', { inspected: ['expediente-caso'] }));
    expect(arrive.map(x => x.doneText)).toEqual(['Anotado: llegaste al Consultorio.']);
  });

  it('diffDone no anota nada al cambiar de etapa (otros ids) ni al desaparecer pasos arrastrados', () => {
    const stage4 = derive('hospital-cierre-bloque', 'consultorio', { inspected: ['expediente-caso'], inventory: ['RISK_METER'], used: ['RISK_METER@x'] });
    const stage6 = derive('comisaria-accion-final', 'consultorio', { inspected: ['expediente-caso'], inventory: ['RISK_METER'], used: ['RISK_METER@x'] });
    expect(diffDone(stage4, stage6)).toEqual([]);
  });

  it('el anillo: sin siguiente nada; sin resaltar herramientas no marca la recogida; si el destino está en otra sala, la puerta', () => {
    expect(ringTargetKey(null, true)).toBeNull();
    const start = derive('hospital-urgencias', 'urgencias');
    expect(ringTargetKey(start, true)).toBe('tool-pap');
    expect(ringTargetKey(start, false)).toBeNull();
    const talk = derive('hospital-urgencias', 'urgencias', { inventory: ['PAP'] });
    expect(ringTargetKey(talk, false)).toBe('familia-crisis');
    const away = derive('hospital-urgencias', 'sala-escucha', { inventory: ['PAP'] });
    expect(ringTargetKey(away, true)).toBe('puerta-urgencias');
    const npcTarget = derive('hospital-urgencias', 'urgencias', { inventory: ['PAP'], inspected: ['familia-crisis'], used: ['PAP@a'] });
    expect(ringTargetKey(npcTarget, true)).toBe('npc:enfermera-urgencias');
  });

  it('pendingStepCount cuenta lo que no está hecho (el número del chip «Qué hacer · n»)', () => {
    expect(pendingStepCount(null)).toBe(0);
    expect(pendingStepCount(derive('hospital-urgencias', 'urgencias'))).toBe(6);
    expect(pendingStepCount(derive('hospital-urgencias', 'urgencias', { inventory: ['PAP'], inspected: ['familia-crisis'] }))).toBe(4);
    expect(pendingStepCount(derive('hospital-sala-escucha', 'sala-escucha'))).toBe(1);
  });
});

// ───────────────────────── Producto cartesiano: etapa × sala × avance ─────────────────────────

function applyDone(rule: DoneRule, progress: Required<Progress>): void {
  switch (rule.type) {
    case 'npc': progress.viewed.push(rule.key); break;
    case 'inspected': progress.inspected.push(rule.key); break;
    case 'inventory': progress.inventory.push(rule.toolCode); break;
    case 'toolUsed': progress.used.push(`${rule.toolCode}@objetivo`); break;
    case 'visitedRoom': progress.visited.push(rule.room); break;
    case 'never': break;
  }
}

function strings(state: SceneLogState): string[] {
  const out = [state.title, state.intro, state.nextLine, state.footer];
  for (const group of state.groups) {
    if (group.header) out.push(group.header);
    for (const s of group.steps) {
      out.push(s.label, s.doneText);
      if (s.place) out.push(s.place);
      if (s.roomLabel) out.push(s.roomLabel);
      if (s.note) out.push(s.note);
    }
  }
  for (const entry of state.optional) out.push(entry.label, entry.mark ?? '');
  return out.filter(text => text.length > 0);
}

describe('deriveSceneLog · producto cartesiano de estados (etapa × sala × avance)', () => {
  const rooms: Array<RoomGroup | null> = [...ROUTE_ORDER, null];

  it.each(Object.keys(STAGE_ROUTES))('%s: ninguna combinación filtra una clave, una técnica, vocabulario de logro ni una falta de tilde', nodeKey => {
    const route = STAGE_ROUTES[nodeKey];
    const subsetSteps: RouteStep[] = route.steps.filter(s => s.kind !== 'decide');
    let combinations = 0;
    for (const room of rooms) {
      for (let mask = 0; mask < 2 ** subsetSteps.length; mask++) {
        const progress: Required<Progress> = { inventory: [], inspected: [], used: [], viewed: [], visited: [] };
        subsetSteps.forEach((s, i) => { if (mask & (1 << i)) applyDone(s.done, progress); });
        const state = deriveSceneLog(input(nodeKey, room, progress));
        combinations++;
        expect(state).not.toBeNull();
        const where = `${nodeKey} · ${room} · máscara ${mask}`;

        // Textos limpios (herramientas genéricas por defecto).
        const problems = strings(state!).flatMap(text => textViolations(text, { allowClinicalNames: true }));
        expect({ where, problems }).toEqual({ where, problems: [] });

        // Un solo siguiente, que no está hecho ni bloqueado, y la línea «Ahora:» lo describe.
        const flat = allSteps(state!);
        const nexts = flat.filter(s => s.state === 'next');
        expect({ where, nexts: nexts.length }).toEqual({ where, nexts: state!.next ? 1 : 0 });
        if (state!.next) {
          expect(nexts[0].id).toBe(state!.next.stepId);
          expect(state!.nextLine.startsWith('Ahora: ')).toBe(true);
          const firstOpen = flat.find(s => s.state !== 'done' && s.state !== 'locked');
          expect(firstOpen).toBe(nexts[0]);
        } else {
          expect(state!.nextLine).toBe('');
        }

        // Estructura: cada paso en un solo grupo; pie coherente con los recomendados.
        expect(new Set(flat.map(s => s.id)).size).toBe(flat.length);
        const prep = flat.filter(s => s.weight === 'prep');
        expect(state!.prepTotal).toBe(prep.length);
        expect(state!.prepDone).toBe(prep.filter(s => s.state === 'done').length);
        expect(state!.footer === '' ? prep.length === 0 : prep.length > 0).toBe(true);
        for (const s of flat) {
          if (s.state === 'locked') expect(s.note).toBeTruthy();
          if (s.here) expect(s.roomLabel === null || s.kind === 'decide').toBe(true);
          if (!s.here && room) expect(s.place).toBeNull();
        }
        // Nunca queda sin decisión pendiente (la decisión no se da por hecha jamás).
        expect(flat.at(-1)!.kind).toBe('decide');
        expect(flat.at(-1)!.state).not.toBe('done');
      }
    }
    expect(combinations).toBe(rooms.length * 2 ** subsetSteps.length);
  });

  it('con la bandera de nombres sí aparece el nombre de la herramienta, y aun así nunca una clave', () => {
    let named = 0;
    for (const nodeKey of Object.keys(STAGE_ROUTES)) {
      for (const room of ROUTE_ORDER) {
        const state = deriveSceneLog(input(nodeKey, room, {}, { nameTools: true }))!;
        for (const text of strings(state)) {
          expect(textViolations(text, { allowToolNames: true })).toEqual([]);
          if (/Kit PAP|Protocolo EPICEE|Valoración de riesgo/.test(text)) named++;
        }
      }
    }
    expect(named).toBeGreaterThan(5);
  });

  it('el estado de lectura no filtra ninguna clasificación: la entrada solo trae ids', () => {
    const state = deriveSceneLog(input('hospital-urgencias', 'sala-escucha'))!;
    expect(JSON.stringify(state)).not.toMatch(/ADEQUATE|RISKY|INADEQUATE|prohibit|recommend/i);
  });
});
