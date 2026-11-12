import * as fs from 'fs';
import * as path from 'path';
import {
  DECISION_TOTAL, ENTITY_NAMES, HIGHLIGHT_TOOL_TARGETS, HOSPITAL_GATE_NODE_KEY, NAME_TOOLS_IN_HINTS, OPTIONAL_EXCLUDED_KEYS,
  ORIENTATION_COPY, ROOM_GRAPH, ROOM_LABELS, ROUTE_ORDER, RoomGroup, SAFE_EXIT_ALWAYS_REACHABLE, TOOL_HINTS,
} from './orientation.config';
import { readSeed } from './orientation-seed.testing';
import { stringsIn, textViolations } from './orientation-text.testing';

const seed = readSeed();
const SCENARIOS_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'game', 'scenarios');
const NODE_TO_ROOM: Record<string, RoomGroup> = {
  'hospital-urgencias': 'urgencias', 'hospital-sala-escucha': 'sala-escucha',
  'comisaria-recepcion': 'recepcion', 'comisaria-consultorio': 'consultorio',
};

/** displayName de cada NPC de escenario del caso, por clave (assets/game/scenarios/*.json). */
function scenarioNpcNames(): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const file of fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'))) {
    const scenario = JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8')) as {
      rooms?: Array<{ npcs?: Array<{ key: string; displayName: string }> }>;
    };
    for (const room of scenario.rooms ?? []) {
      for (const npc of room.npcs ?? []) {
        names.set(npc.key, (names.get(npc.key) ?? new Set()).add(npc.displayName));
      }
    }
  }
  return names;
}

describe('orientation.config: banderas y constantes de producto', () => {
  it('las banderas por defecto son conservadoras (pregunta 1 de Psicología)', () => {
    expect(NAME_TOOLS_IN_HINTS).toBe(false);
    expect(HIGHLIGHT_TOOL_TARGETS).toBe(true);
    // Se puso en true en el mismo cambio que hizo cierta la promesa (T9.8, verificado estado por estado).
    expect(SAFE_EXIT_ALWAYS_REACHABLE).toBe(true);
    expect(DECISION_TOTAL).toBe(6);
  });

  it('las salas tienen orden, etiqueta y puertas coherentes', () => {
    expect([...ROUTE_ORDER]).toEqual(['urgencias', 'sala-escucha', 'recepcion', 'consultorio']);
    expect(Object.keys(ROOM_LABELS).sort()).toEqual([...ROUTE_ORDER].sort());
    expect(Object.keys(ROOM_GRAPH).sort()).toEqual([...ROUTE_ORDER].sort());
    for (const room of ROUTE_ORDER) {
      const label = ROOM_LABELS[room];
      expect(label.en).toBe(`en ${label.to.replace(/^a /, '').replace(/^al /, 'el ')}`);
      expect(label.ve).toBe(`Ve ${label.to}`);
      expect(['Hospital', 'Comisaría de Familia']).toContain(label.group);
    }
    expect(ROOM_LABELS['consultorio'].to).toBe('al Consultorio');
    expect(ROOM_LABELS['sala-escucha'].ve).toBe('Ve a la Sala de escucha familiar');
  });

  it('el grafo de salas coincide con las puertas del seed (clave y sala de destino)', () => {
    const edges = ROUTE_ORDER.flatMap(from =>
      Object.entries(ROOM_GRAPH[from]).map(([to, doorKey]) => ({ from, to: to as RoomGroup, doorKey: doorKey! })));
    expect(edges).toHaveLength(5);
    for (const edge of edges) {
      const matches = seed.doors.filter(d => d.key === edge.doorKey);
      expect(matches.length).toBeGreaterThan(0);
      for (const door of matches) expect(NODE_TO_ROOM[door.targetNodeKey!]).toBe(edge.to);
    }
    // Y al revés: toda puerta del seed es una arista del grafo (nadie añade una puerta sin copy).
    const graphDoors = new Set(edges.map(e => e.doorKey));
    for (const door of seed.doors) expect(graphDoors.has(door.key)).toBe(true);
    // Sin vuelta al hospital desde la recepción (igual que el seed).
    expect(ROOM_GRAPH['recepcion']).toEqual({ 'consultorio': 'puerta-consultorio' });
  });
});

describe('orientation.config: nombres humanos contra el seed', () => {
  it('lee el seed (si no, los contratos de abajo estarían vacíos)', () => {
    expect(seed.objects.length).toBeGreaterThan(20);
    expect(seed.ambientNpcs.length).toBeGreaterThanOrEqual(8);
  });

  it('todo objeto del seed tiene nombre humano igual a una de sus etiquetas', () => {
    for (const obj of seed.objects) {
      const entity = ENTITY_NAMES[obj.key];
      expect(`${obj.key}:${entity ? 'con nombre' : 'SIN NOMBRE'}`).toBe(`${obj.key}:con nombre`);
      const labels = seed.objects.filter(o => o.key === obj.key).map(o => o.label);
      expect(labels).toContain(entity.name);
    }
  });

  it('todo NPC de escenario tiene el nombre que el jugador ve (displayName)', () => {
    const displayNames = scenarioNpcNames();
    for (const npc of seed.ambientNpcs) {
      const entity = ENTITY_NAMES[npc.key];
      expect(`${npc.key}:${entity ? 'con nombre' : 'SIN NOMBRE'}`).toBe(`${npc.key}:con nombre`);
      expect(entity.person).toBe(true);
      expect([...(displayNames.get(npc.key) ?? [])]).toContain(entity.name);
    }
  });

  it('no sobra ningún nombre: cada clave existe en el seed', () => {
    const known = new Set([...seed.objects.map(o => o.key), ...seed.ambientNpcs.map(n => n.key)]);
    for (const key of Object.keys(ENTITY_NAMES)) expect(known.has(key)).toBe(true);
  });

  it('las personas del seed (PERSON) están marcadas como persona', () => {
    for (const obj of seed.objects.filter(o => o.type === 'PERSON')) expect(ENTITY_NAMES[obj.key].person).toBe(true);
    for (const obj of seed.objects.filter(o => o.type !== 'PERSON')) expect(ENTITY_NAMES[obj.key].person).toBeUndefined();
  });

  it('artículo y sala válidos; lo que se oye con «el/la» es coherente con el nombre', () => {
    for (const entity of Object.values(ENTITY_NAMES)) {
      expect(['el', 'la', 'los', 'las']).toContain(entity.article);
      expect(ROUTE_ORDER).toContain(entity.room);
      expect(entity.name).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
    }
    const spot: Record<string, string> = {
      'enfermera-urgencias': 'la', 'medico-guardia': 'el', 'expediente-caso': 'el', 'familia-crisis': 'la',
      'marco-normativo-hospital': 'el', 'apoyo-psicosocial': 'el', 'madre-acompanante': 'la', 'puerta-consultorio': 'el',
    };
    for (const [key, article] of Object.entries(spot)) expect(ENTITY_NAMES[key].article).toBe(article);
  });

  it('cada requisito de puerta del seed tiene nombre humano; requiresNodes solo el que tiene copy', () => {
    for (const door of seed.doors) {
      for (const key of [...door.requiresInspected, ...door.requiresNpcs]) expect(ENTITY_NAMES[key]).toBeDefined();
      for (const code of door.requiresTools) expect(TOOL_HINTS[code]).toBeDefined();
      for (const node of door.requiresNodes) expect(node).toBe(HOSPITAL_GATE_NODE_KEY);
    }
    expect(seed.doors.some(d => d.requiresInspected.length)).toBe(true);
  });

  it('las herramientas del seed tienen descripción genérica y nombre real que coincide con su objeto', () => {
    const toolOfObject: Record<string, string> = { 'tool-pap': 'PAP', 'tool-spikes': 'SPIKES', 'tool-riesgo': 'RISK_METER' };
    for (const [objectKey, code] of Object.entries(toolOfObject)) {
      expect(seed.objects.some(o => o.key === objectKey && o.tool === code)).toBe(true);
      const entity = ENTITY_NAMES[objectKey];
      expect(TOOL_HINTS[code].named).toBe(`${entity.article} ${entity.name}`);
      expect(TOOL_HINTS[code].room).toBe(entity.room);
    }
    expect(Object.keys(TOOL_HINTS).sort()).toEqual(['PAP', 'RISK_METER', 'SPIKES']);
  });
});

describe('orientation.config: textos', () => {
  const copy = ORIENTATION_COPY;
  const sample = [
    copy.card.title, copy.card.counter(1), copy.card.counter(6), copy.card.counterClosed, copy.card.hide, copy.card.show,
    copy.card.chip(0), copy.card.chip(4), copy.card.optionalTitle, ...stringsIn(copy.card.marks), copy.card.hereSuffix.trim(),
    ...stringsIn(copy.card.stateText), copy.card.footerPending(0, 3), copy.card.footerPending(0, 1), copy.card.footerDone,
    ...stringsIn(copy.now).map(text => text.trim()), ...stringsIn(copy.ui),
    copy.ui.dockTools(1, 5), copy.notices.obtained('material'), copy.notices.notedTalked('la', 'Enfermera de urgencias'),
    copy.notices.notedReviewed('el', 'Expediente del caso'), copy.notices.notedUsed('el material de apoyo de la sala'),
    ...ROUTE_ORDER.map(room => copy.notices.notedArrived(room)),
    copy.notices.newStage('Urgencia vital y crisis'), copy.notices.decisionRegistered(2), copy.notices.registering,
    copy.notices.supervision, copy.notices.staleConversation, copy.notices.errorNpc, copy.notices.errorTool, copy.notices.errorDecision,
    copy.evidence.notice('hablar con la Enfermera de urgencias'), copy.evidence.unknownPerson, copy.evidence.unknownThing,
    copy.door.before('habla con la Familia en crisis'), copy.door.hospitalGate, copy.door.hospitalGateRemaining(1),
    copy.door.hospitalGateRemaining(3), copy.door.laterGate, copy.door.fallback,
    ...ROUTE_ORDER.flatMap(room => [ROOM_LABELS[room].name, ROOM_LABELS[room].en, ROOM_LABELS[room].ve, ROOM_LABELS[room].to]),
    ...Object.values(ENTITY_NAMES).filter(e => !e.name.includes('PAP') && !e.name.includes('EPICEE') && !e.name.includes('Valoración')).map(e => e.name),
    ...Object.values(TOOL_HINTS).map(h => h.generic),
  ];

  it('con las banderas por defecto ningún texto contiene claves, técnicas, logro ni faltas de tilde', () => {
    const problems = sample.flatMap(text => textViolations(text, {}));
    expect(problems).toEqual([]);
  });

  it('los textos nombrados (solo con NAME_TOOLS_IN_HINTS = true) sí pueden nombrar la herramienta', () => {
    expect(TOOL_HINTS['PAP'].named).toBe('el Kit PAP');
    for (const hint of Object.values(TOOL_HINTS)) {
      expect(textViolations(hint.named, { allowToolNames: true })).toEqual([]);
    }
  });

  it('los rótulos de F§5.1 son los del diseño', () => {
    expect(copy.card.title).toBe('Qué hacer');
    expect(copy.card.counter(3)).toBe('Decisión 3 de 6');
    expect(copy.card.counterClosed).toBe('Caso cerrado');
    expect(copy.card.hide).toBe('Ocultar pasos');
    expect(copy.card.show).toBe('Mostrar pasos');
    expect(copy.card.chip(4)).toBe('Qué hacer · 4');
    expect(copy.card.chip(0)).toBe('Qué hacer');
    expect(copy.card.footerPending(0, 3)).toBe('Recomendado antes de decidir: 0 de 3 hechos. Puedes decidir cuando quieras.');
    expect(copy.card.footerPending(0, 1)).toBe('Recomendado antes de decidir: 0 de 1 hecho. Puedes decidir cuando quieras.');
    expect(copy.card.footerDone).toBe('Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.');
    expect(copy.card.optionalTitle).toBe('También en esta sala');
    expect(copy.card.marks).toEqual({ talked: 'ya hablaste', reviewed: 'ya revisaste', notYet: 'aún no' });
    expect(copy.card.stateText).toEqual({ done: 'Hecho:', next: 'Siguiente:', pending: 'Pendiente:', locked: 'Bloqueado hasta:' });
    expect(copy.ui.safeExit).toBe('Salida segura');
    expect(copy.ui.backToMap).toBe('Volver al mapa');
    expect(copy.ui.dockTools(2, 5)).toBe('Herramientas 2 de 5');
    expect(copy.ui.dockLocked).toBe('Se consigue explorando las salas del caso.');
    expect(copy.now.touchIdle).toBe('Acércate a algo');
    expect(copy.now.nothingNearby).toBe('No hay nada a tu alcance. Acércate a una persona o un objeto.');
  });

  it('los avisos de F§5.6 son los del diseño', () => {
    expect(copy.notices.obtained('Kit PAP')).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
    expect(copy.notices.notedTalked('la', 'Enfermera de urgencias')).toBe('Anotado: hablaste con la Enfermera de urgencias.');
    expect(copy.notices.notedReviewed('el', 'Expediente del caso')).toBe('Anotado: revisaste el Expediente del caso.');
    expect(copy.notices.notedArrived('sala-escucha')).toBe('Anotado: llegaste a la Sala de escucha familiar.');
    expect(copy.notices.notedArrived('consultorio')).toBe('Anotado: llegaste al Consultorio.');
    expect(copy.notices.newStage('Acción técnica y ética')).toBe('Nueva etapa: Acción técnica y ética');
    expect(copy.notices.registering).toBe('Registrando tu decisión…');
    expect(copy.notices.supervision).toBe('Tu decisión quedó registrada en tu seguimiento formativo.');
    expect(copy.notices.staleConversation).toBe('Esta conversación corresponde a otro momento del caso.');
    expect(copy.notices.errorNpc).toBe('No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.');
    expect(copy.notices.errorDecision).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
  });

  it('singular y plural de las decisiones que quedan', () => {
    expect(copy.door.hospitalGateRemaining(1)).toBe('Te queda 1 decisión.');
    expect(copy.door.hospitalGateRemaining(2)).toBe('Te quedan 2 decisiones.');
    expect(copy.door.hospitalGateRemaining(3)).toBe('Te quedan 3 decisiones.');
  });

  it('la sobreviviente que espera en la recepción no se lista como opcional (su testimonio no es un estímulo)', () => {
    expect(OPTIONAL_EXCLUDED_KEYS.has('sobreviviente-espera')).toBe(true);
  });
});

describe('contrato de texto: el detector sabe fallar', () => {
  it.each([
    ['Recoge el Kit PAP', 'nombra una herramienta'],
    ['Habla con enfermera-urgencias', 'clave interna'],
    ['Usa PAP@familia-crisis', 'clave interna'],
    ['Informacion insuficiente', 'falta una tilde'],
    ['Habla con la psicologa', 'falta una tilde'],
    ['¡Bien hecho!', 'lenguaje de logro'],
    ['Ganaste 12 puntos', 'lenguaje de logro'],
    ['Actividad completada', 'vocabulario clínico'],
    ['Aplica la mediación', 'vocabulario clínico'],
    ['Habla  con ella', 'espaciado raro'],
  ])('«%s» → %s', (text, expected) => {
    expect(textViolations(text).join(' | ')).toContain(expected);
  });

  it('un texto limpio no tiene infracciones', () => {
    expect(textViolations('Habla con la Enfermera de urgencias · en el centro, al fondo')).toEqual([]);
  });
});
