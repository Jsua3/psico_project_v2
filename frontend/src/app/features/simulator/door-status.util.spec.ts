import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatusContext, doorStateMap, doorStatus } from './door-status.util';
import { CopyContext } from './evidence-copy.util';
import { interactionVerb } from './interaction-verb.util';
import { ORIENTATION_COPY, RoomGroup } from './orientation.config';
import { readSeed } from './orientation-seed.testing';

function obj(key: string, type: MapObjectState['type'], x: number, y: number, label = key, metadata?: Record<string, unknown>): MapObjectState {
  return {
    key, label, type, x, y, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null, metadata,
  };
}

const door = (metadata: Record<string, unknown>, key = 'puerta-x') => obj(key, 'EXIT', 838, 440, key, metadata);

function ctxFor(room: RoomGroup | null, over: Partial<DoorStatusContext> = {}, objects: MapObjectState[] = []): DoorStatusContext {
  const world = { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {}, objects, ...over.world };
  const copy: CopyContext = { currentRoom: room, world, nameTools: false, npcs: [] };
  return { nodeKey: 'hospital-urgencias', decisionNumber: 1, viewedNpcKeys: new Set(), copy, ...over, world };
}

const FAMILIA = obj('familia-crisis', 'PERSON', 190, 420, 'Familia en crisis');
const EXPEDIENTE = obj('expediente-caso', 'OBJECT', 740, 312, 'Expediente del caso');

describe('doorStatus: requisitos vivos', () => {
  it('sin requisitos la puerta está abierta y no hay mensaje', () => {
    expect(doorStatus(door({}), ctxFor('urgencias'))).toEqual({ state: 'open', missing: [], stageLocked: false, message: null });
    expect(doorStatus({ ...door({}), metadata: undefined }, ctxFor('urgencias')).state).toBe('open');
  });

  it('requiresInspected: habla con la Familia en crisis, con el lugar vivo (F§5.4)', () => {
    const meta = { requiresInspected: ['familia-crisis'], lockedMessage: 'texto viejo del seed' };
    const locked = doorStatus(door(meta), ctxFor('urgencias', {}, [FAMILIA]));
    expect(locked.state).toBe('locked');
    expect(locked.stageLocked).toBe(false);
    expect(locked.missing).toEqual([{ kind: 'inspected', key: 'familia-crisis' }]);
    expect(locked.message).toBe('Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).');
    const open = doorStatus(door(meta), ctxFor('urgencias', { world: { inspectedObjectKeys: ['familia-crisis'] } as never }, [FAMILIA]));
    expect(open.state).toBe('open');
    expect(open.message).toBeNull();
  });

  it('requiresInspected sobre un objeto: revisa el Expediente del caso (a la derecha, al fondo)', () => {
    const status = doorStatus(door({ requiresInspected: ['expediente-caso'] }, 'puerta-consultorio'), ctxFor('recepcion', {}, [EXPEDIENTE]));
    expect(status.message).toBe('Antes de pasar, revisa el Expediente del caso (a la derecha, al fondo).');
  });

  it('si lo que falta está en otra sala, dice cuál en vez del lugar', () => {
    const status = doorStatus(door({ requiresInspected: ['expediente-caso'] }), ctxFor('sala-escucha'));
    expect(status.message).toBe('Antes de pasar, revisa el Expediente del caso (en la Recepción).');
  });

  it('requiresNpcs usa la señal de personas habladas y lo persistido por el servidor', () => {
    const meta = { requiresNpcs: ['enfermera-urgencias'] };
    expect(doorStatus(door(meta), ctxFor('urgencias')).message).toBe('Antes de pasar, habla con la Enfermera de urgencias.');
    expect(doorStatus(door(meta), ctxFor('urgencias', { viewedNpcKeys: new Set(['enfermera-urgencias']) })).state).toBe('open');
    expect(doorStatus(door(meta), ctxFor('urgencias', { world: { flags: { viewedNpcKeys: ['enfermera-urgencias'] } } as never })).state).toBe('open');
  });

  it('requiresTools pide recoger, sin nombrar la herramienta', () => {
    const meta = { requiresTools: ['SPIKES'] };
    const status = doorStatus(door(meta), ctxFor('urgencias'));
    expect(status.missing).toEqual([{ kind: 'toolOwned', key: 'SPIKES' }]);
    expect(status.message).toBe('Antes de pasar, recoge el material del estante (en la Sala de escucha familiar).');
    expect(doorStatus(door(meta), ctxFor('urgencias', { world: { inventory: ['SPIKES'] } as never })).state).toBe('open');
  });

  it('varios requisitos se unen con « y »', () => {
    const status = doorStatus(
      door({ requiresInspected: ['familia-crisis', 'expediente-caso'] }),
      ctxFor('urgencias', {}, [FAMILIA]),
    );
    expect(status.message).toBe(
      'Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente) y revisa el Expediente del caso (en la Recepción).',
    );
    const three = doorStatus(door({ requiresInspected: ['familia-crisis'], requiresNpcs: ['enfermera-urgencias'], requiresTools: ['PAP'] }), ctxFor('sala-escucha'));
    expect(three.message).toBe(
      'Antes de pasar, habla con la Enfermera de urgencias (en Urgencias), recoge el material de apoyo de la sala (en Urgencias) y habla con la Familia en crisis (en Urgencias).',
    );
  });
});

describe('doorStatus: salida del hospital (requiresNodes)', () => {
  const gate = { requiresNodes: ['hospital-cierre-bloque'] };

  it.each([
    [1, 'Esta salida se abre cuando termines las decisiones del hospital. Te quedan 3 decisiones.'],
    [2, 'Esta salida se abre cuando termines las decisiones del hospital. Te quedan 2 decisiones.'],
    [3, 'Esta salida se abre cuando termines las decisiones del hospital. Te queda 1 decisión.'],
  ])('en la decisión %d: «%s»', (decisionNumber, expected) => {
    const nodeKey = ['', 'hospital-urgencias', 'hospital-sala-escucha', 'hospital-accion-etica'][decisionNumber];
    const status = doorStatus(door(gate, 'salida-institucional'), ctxFor('sala-escucha', { nodeKey, decisionNumber }));
    expect(status).toMatchObject({ state: 'locked', stageLocked: true, missing: [], message: expected });
  });

  it('se abre cuando el nodo actual es el que la habilita', () => {
    const status = doorStatus(door(gate), ctxFor('sala-escucha', { nodeKey: 'hospital-cierre-bloque', decisionNumber: 4 }));
    expect(status).toEqual({ state: 'open', missing: [], stageLocked: false, message: null });
  });

  it('sin número de decisión, o con uno que ya no cuenta, no inventa un contador', () => {
    for (const decisionNumber of [null, 4, 5]) {
      const status = doorStatus(door(gate), ctxFor('sala-escucha', { decisionNumber }));
      expect(status.message).toBe('Esta salida se abre cuando termines las decisiones del hospital.');
    }
  });

  it('otra etapa exigida usa una frase general; evidencia y etapa se suman en dos frases', () => {
    expect(doorStatus(door({ requiresNodes: ['otro-nodo'] }), ctxFor('urgencias')).message)
      .toBe('Esta salida se abre más adelante en el caso.');
    const both = doorStatus(door({ ...gate, requiresNpcs: ['enfermera-urgencias'] }), ctxFor('urgencias', { decisionNumber: 3 }));
    expect(both).toMatchObject({ state: 'locked', stageLocked: true });
    expect(both.message).toBe(
      'Antes de pasar, habla con la Enfermera de urgencias. Esta salida se abre cuando termines las decisiones del hospital. Te queda 1 decisión.',
    );
  });
});

describe('puertas auxiliares', () => {
  it('doorStateMap solo mira las salidas de la sala', () => {
    const objects = [
      obj('puerta-sala-escucha', 'EXIT', 838, 440, 'Sala de escucha familiar', { requiresInspected: ['familia-crisis'] }),
      obj('puerta-urgencias', 'EXIT', 122, 460, 'Sala de urgencias', {}),
      FAMILIA,
    ];
    expect(doorStateMap(objects, ctxFor('urgencias', {}, objects))).toEqual({
      'puerta-sala-escucha': 'locked', 'puerta-urgencias': 'open',
    });
  });

  it('la barra, el aviso y la lista leen el mismo motivo (una sola fuente)', () => {
    const exit = obj('puerta-consultorio', 'EXIT', 838, 440, 'Consultorio', { requiresInspected: ['expediente-caso'] });
    const status = doorStatus(exit, ctxFor('recepcion', {}, [EXPEDIENTE, exit]));
    const verb = interactionVerb(exit, status);
    expect(verb.locked).toBe(true);
    expect(verb.reason).toBe(status.message);
  });

  it('el respaldo para una puerta que el servidor rechaza no usa el texto antiguo del seed', () => {
    expect(ORIENTATION_COPY.door.fallback).toBe('Antes de pasar, revisa lo pendiente en «Qué hacer».');
    expect(ORIENTATION_COPY.door.fallback).not.toMatch(/información clave/);
  });
});

describe('puertas del seed', () => {
  const doors = readSeed().doors;

  it('el seed trae puertas con requisitos (si no, este contrato estaría vacío)', () => {
    expect(doors.length).toBeGreaterThanOrEqual(8);
    expect(doors.some(d => d.requiresInspected.length)).toBe(true);
    expect(doors.some(d => d.requiresNodes.length)).toBe(true);
  });

  it('cada puerta del seed, bloqueada por cada requisito, da un motivo legible: sin claves ni nombres de herramienta', () => {
    for (const seedDoor of doors) {
      const meta = {
        requiresInspected: seedDoor.requiresInspected, requiresNpcs: seedDoor.requiresNpcs,
        requiresTools: seedDoor.requiresTools, requiresNodes: seedDoor.requiresNodes,
      };
      for (const room of [null, 'urgencias', 'sala-escucha', 'recepcion', 'consultorio'] as const) {
        for (const decisionNumber of [null, 1, 2, 3, 4]) {
          const status = doorStatus(door(meta, seedDoor.key), ctxFor(room, { decisionNumber, nodeKey: 'hospital-urgencias' }));
          const hasRequirement = Object.values(meta).some(list => list.length);
          expect(status.state).toBe(hasRequirement ? 'locked' : 'open');
          if (status.message === null) continue;
          expect(status.message).toMatch(/^(Antes de pasar, |Esta salida se abre )/);
          expect(status.message).not.toMatch(/[a-z]+-[a-z]+|npc:|tool:|@|PAP|SPIKES|RISK_METER|EPICEE/);
          expect(status.message).not.toMatch(/orientación de ingreso|Completa la contención/);
          expect(status.message).not.toMatch(/\b(accion|decision|informacion|psicologa|recepcion)\b/i);
        }
      }
    }
  });
});
