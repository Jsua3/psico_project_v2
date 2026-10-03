import { NODE_EVIDENCE } from './evidence-gating.config';
import { ENTITY_NAMES, ROOM_GRAPH, ROOM_LABELS, ROUTE_ORDER, TOOL_HINTS } from './orientation.config';
import { readSeed } from './orientation-seed.testing';
import { textViolations } from './orientation-text.testing';
import { SCENE_PROGRESS } from './scene-objectives.config';
import { RouteStep, STAGE_ROUTES, StageRoute } from './stage-route.config';

const seed = readSeed();
const ROUTES: StageRoute[] = Object.values(STAGE_ROUTES);
const NODE_ORDER = [
  'hospital-urgencias', 'hospital-sala-escucha', 'hospital-accion-etica',
  'hospital-cierre-bloque', 'comisaria-consultorio', 'comisaria-accion-final',
];
const ORDINAL = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta'];
const TOOL_OBJECT: Record<string, string> = { 'tool-pap': 'PAP', 'tool-spikes': 'SPIKES', 'tool-riesgo': 'RISK_METER' };

const steps = (route: StageRoute) => route.steps;
const sorted = (list: Iterable<string>) => [...list].sort();
const bareKey = (step: RouteStep) => step.targetKey.replace(/^npc:/, '');

describe('stage-route.config: estructura', () => {
  it('hay seis etapas numeradas 1..6 en el orden del caso, con la clave del nodo del seed', () => {
    expect(Object.keys(STAGE_ROUTES)).toEqual(NODE_ORDER);
    ROUTES.forEach((route, i) => {
      expect(route.number).toBe(i + 1);
      expect(route.nodeKey).toBe(NODE_ORDER[i]);
      expect(seed.text).toContain(`"key": "${route.nodeKey}"`);
    });
  });

  it('ids únicos en todo el caso; cada etapa termina en su única decisión, que nunca se da por hecha', () => {
    const ids = ROUTES.flatMap(route => steps(route).map(s => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const route of ROUTES) {
      const decide = steps(route).filter(s => s.kind === 'decide');
      expect(decide).toHaveLength(1);
      expect(steps(route).at(-1)).toBe(decide[0]);
      expect(decide[0]).toMatchObject({ weight: 'decision', done: { type: 'never' } });
      for (const step of steps(route).filter(s => s.kind !== 'decide')) expect(step.done.type).not.toBe('never');
    }
  });

  it('`needs` apunta a un paso anterior de la misma etapa y solo `use` depende de recoger', () => {
    for (const route of ROUTES) {
      steps(route).forEach((step, index) => {
        if (!step.needs) return;
        const dependency = steps(route).findIndex(s => s.id === step.needs);
        expect(dependency).toBeGreaterThanOrEqual(0);
        expect(dependency).toBeLessThan(index);
        expect(step.kind).toBe('use');
        expect(step.lockedNote).toBeTruthy();
        const collect = steps(route)[dependency];
        expect(collect.kind).toBe('collect');
        expect(collect.done).toEqual({ type: 'inventory', toolCode: (step.done as { toolCode: string }).toolCode });
      });
    }
  });

  it('la etapa 1 del diseño: recoger, familia, usar, enfermera, puerta y decisión', () => {
    expect(steps(STAGE_ROUTES['hospital-urgencias']).map(s => s.id))
      .toEqual(['u1-recoger', 'u1-familia', 'u1-usar', 'u1-enfermera', 'u1-puerta', 'u1-decidir']);
    expect(steps(STAGE_ROUTES['hospital-cierre-bloque']).map(s => s.id))
      .toEqual(['c4-salida', 'c4-expediente', 'c4-puerta', 'c4-recoger', 'c4-usar', 'c4-decidir']);
    expect(steps(STAGE_ROUTES['comisaria-accion-final']).map(s => [s.id, !!s.carryOver]))
      .toEqual([['c6-recoger', true], ['c6-usar', true], ['c6-decidir', false]]);
  });

  it('el título de cada etapa coincide con SCENE_PROGRESS y la decisión nombra su ordinal', () => {
    for (const route of ROUTES) {
      expect(SCENE_PROGRESS[route.nodeKey]).toMatchObject({ step: route.number, stepLabel: route.title, total: 6 });
      const decide = steps(route).find(s => s.kind === 'decide')!;
      expect(decide.label).toContain(`${ORDINAL[route.number - 1]} decisión`);
    }
  });
});

describe('stage-route.config: coherencia con la compuerta de evidencia (NODE_EVIDENCE)', () => {
  it.each(NODE_ORDER)('los pasos «prep» de %s equivalen a NODE_EVIDENCE', nodeKey => {
    const prep = steps(STAGE_ROUTES[nodeKey]).filter(s => s.weight === 'prep');
    const useCodes = prep.filter(s => s.kind === 'use').map(s => (s.done as { toolCode: string }).toolCode);
    const derived = {
      npcs: sorted(prep.filter(s => s.kind === 'talk').map(s => (s.done as { key: string }).key)),
      inspected: sorted(prep.filter(s => s.kind === 'inspect').map(s => (s.done as { key: string }).key)),
      usedTools: sorted(useCodes),
      tools: sorted(prep.filter(s => s.kind === 'collect')
        .map(s => (s.done as { toolCode: string }).toolCode).filter(code => !useCodes.includes(code))),
    };
    const def = NODE_EVIDENCE[nodeKey];
    expect(derived).toEqual({
      npcs: sorted(def?.npcs ?? []), inspected: sorted(def?.inspected ?? []),
      usedTools: sorted(def?.usedTools ?? []), tools: sorted(def?.tools ?? []),
    });
  });

  it('toda etapa con evidencia tiene ruta (nadie cambia la compuerta sin tocar la lista)', () => {
    for (const nodeKey of Object.keys(NODE_EVIDENCE)) expect(STAGE_ROUTES[nodeKey]).toBeDefined();
  });
});

describe('stage-route.config: destinos reales', () => {
  it('cada targetKey existe en el seed y tiene nombre humano en la sala del paso', () => {
    const seedKeys = new Set([...seed.objects.map(o => o.key), ...seed.ambientNpcs.map(n => n.key)]);
    for (const route of ROUTES) {
      for (const step of steps(route)) {
        const key = bareKey(step);
        expect(seedKeys.has(key)).toBe(true);
        expect(ENTITY_NAMES[key]).toBeDefined();
        expect(ENTITY_NAMES[key].room).toBe(step.room);
        expect(step.targetKey.startsWith('npc:')).toBe(seed.ambientNpcs.some(n => n.key === key));
      }
    }
  });

  it('los pasos de herramienta apuntan al objeto del seed que entrega esa herramienta', () => {
    for (const route of ROUTES) {
      for (const step of steps(route).filter(s => s.kind === 'collect')) {
        const code = (step.done as { toolCode: string }).toolCode;
        expect(TOOL_OBJECT[step.targetKey]).toBe(code);
        expect(new RegExp(`"key":\\s*"${step.targetKey}"[^}]*?"tool":\\s*"${code}"`).test(seed.text)).toBe(true);
        expect(TOOL_HINTS[code].room).toBe(step.room);
      }
    }
  });

  it('los pasos de puerta usan la puerta del grafo y se dan por hechos al llegar a la sala de destino', () => {
    for (const route of ROUTES) {
      for (const step of steps(route).filter(s => s.kind === 'door')) {
        const [target, doorKey] = Object.entries(ROOM_GRAPH[step.room]).find(([, key]) => key === step.targetKey) ?? [];
        expect(doorKey).toBe(step.targetKey);
        expect(step.done).toEqual({ type: 'visitedRoom', room: target });
        expect(seed.doors.some(d => d.key === step.targetKey)).toBe(true);
      }
    }
  });

  it('los pasos «usar» ocurren en la conversación de la persona que el diseño nombra', () => {
    expect(steps(STAGE_ROUTES['hospital-urgencias']).find(s => s.id === 'u1-usar')!.targetKey).toBe('familia-crisis');
    expect(steps(STAGE_ROUTES['hospital-cierre-bloque']).find(s => s.id === 'c4-usar')!.targetKey).toBe('sobreviviente-consulta');
    expect(ROUTE_ORDER).toContain(steps(STAGE_ROUTES['hospital-cierre-bloque']).find(s => s.id === 'c4-usar')!.room);
  });

  it('las salas de cada tramo cubren los destinos de las puertas del seed', () => {
    for (const door of seed.doors) expect(['hospital-urgencias', 'hospital-sala-escucha', 'comisaria-recepcion', 'comisaria-consultorio']).toContain(door.targetNodeKey);
    for (const room of ROUTE_ORDER) expect(ROOM_LABELS[room]).toBeDefined();
  });
});

describe('stage-route.config: textos', () => {
  const visible = (step: RouteStep) => [step.label, step.note, step.lockedNote].filter((t): t is string => !!t);

  it('los textos genéricos no nombran técnicas ni usan vocabulario clínico, de logro, claves ni faltas de tilde', () => {
    const problems = ROUTES.flatMap(route => [
      route.title, route.intro, ...steps(route).flatMap(visible),
    ]).flatMap(text => textViolations(text));
    expect(problems).toEqual([]);
  });

  it('los textos con nombre (solo con NAME_TOOLS_IN_HINTS = true) pueden nombrar la herramienta, pero nunca una clave', () => {
    const named = ROUTES.flatMap(route => steps(route)).filter(s => s.labelNamed);
    expect(named.map(s => s.id).sort()).toEqual(['c4-recoger', 'c4-usar', 'c6-recoger', 'c6-usar', 'u1-recoger', 'u1-usar', 'u3-recoger']);
    for (const step of named) {
      expect(['collect', 'use']).toContain(step.kind);
      expect(textViolations(step.labelNamed!, { allowToolNames: true })).toEqual([]);
    }
    expect(steps(STAGE_ROUTES['hospital-urgencias'])[0].labelNamed).toBe('Recoge el Kit PAP');
    expect(steps(STAGE_ROUTES['hospital-urgencias'])[2].labelNamed).toBe('Usa el Kit PAP con la Familia en crisis');
  });

  it('verbos neutros en imperativo; las introducciones terminan en punto; sin exclamaciones', () => {
    const verbs = /^(Recoge|Habla|Usa|Pasa|Sal|Revisa|Toma)\b/;
    for (const route of ROUTES) {
      expect(route.intro).toMatch(/\.$/);
      expect(route.title.length).toBeGreaterThan(5);
      for (const step of steps(route)) {
        expect(step.label).toMatch(verbs);
        expect(step.label).not.toMatch(/[.!¡]/);
      }
    }
  });

  it('la lista nunca dice cuál opción tomar: la decisión se nombra por persona u objeto, jamás por contenido', () => {
    for (const route of ROUTES) {
      const decide = steps(route).find(s => s.kind === 'decide')!;
      expect(decide.label).toMatch(/^Toma tu (primera|segunda|tercera|cuarta|quinta|sexta) decisión (con|en) /);
      expect(decide.note).toBeUndefined();
    }
  });

  it('nombres de la lista = nombres del mundo: la etiqueta del paso contiene el nombre humano de su destino (cuando lo cita)', () => {
    for (const route of ROUTES) {
      for (const step of steps(route)) {
        if (step.kind === 'collect' || step.kind === 'use') continue;
        const entity = ENTITY_NAMES[bareKey(step)];
        const mentioned = step.label.toLowerCase().includes(entity.name.toLowerCase());
        const exceptions = ['u1-puerta', 'c4-salida'];
        if (!exceptions.includes(step.id)) expect(`${step.id}:${mentioned}`).toBe(`${step.id}:true`);
      }
    }
  });
});
