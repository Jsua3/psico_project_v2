import { MapObjectState } from '../../core/models/simulation.model';
import { MissingItem } from './evidence-gating.config';
import {
  CopyContext, imperativeMissing, joinSpanish,
} from './evidence-copy.util';
import { RoomGroup } from './orientation.config';

function ctxFor(room: RoomGroup | null, extra: Partial<CopyContext> = {}): CopyContext {
  return { currentRoom: room, world: null, nameTools: false, npcs: [], ...extra };
}

function obj(partial: Partial<MapObjectState> & Pick<MapObjectState, 'key' | 'label' | 'type'>): MapObjectState {
  return {
    x: 0, y: 0, width: 40, height: 40, color: '#fff', icon: '', shortCode: '', collision: false,
    interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
    ...partial,
  };
}

const npc = (key: string): MissingItem => ({ kind: 'npc', key });
const used = (key: string): MissingItem => ({ kind: 'toolUsed', key });
const owned = (key: string): MissingItem => ({ kind: 'toolOwned', key });
const inspected = (key: string): MissingItem => ({ kind: 'inspected', key });

/** Una clave interna: palabras en minúscula unidas por guion, o un prefijo de clave. */
const SLUG = /[a-z]+-[a-z]+|npc:|tool:|inspected:|@/;

describe('joinSpanish', () => {
  it.each([
    [[], ''],
    [['a'], 'a'],
    [['a', 'b'], 'a y b'],
    [['a', 'b', 'c'], 'a, b y c'],
    [['a', 'b', 'c', 'd'], 'a, b, c y d'],
    [['hablar', 'investigar'], 'hablar e investigar'],
    [['hablar', 'hielo'], 'hablar y hielo'],
    [['a', '', 'b'], 'a y b'],
  ])('%j → «%s»', (items, expected) => {
    expect(joinSpanish(items as string[])).toBe(expected);
  });
});

describe('imperativeMissing', () => {
  it('personas: «hablar con {artículo} {nombre}»; añade la sala si está en otra', () => {
    expect(imperativeMissing([npc('enfermera-urgencias')], ctxFor('urgencias')))
      .toEqual(['habla con la Enfermera de urgencias']);
    expect(imperativeMissing([npc('enfermera-urgencias')], ctxFor('sala-escucha')))
      .toEqual(['habla con la Enfermera de urgencias (en Urgencias)']);
    expect(imperativeMissing([npc('medico-guardia')], ctxFor('consultorio')))
      .toEqual(['habla con el Médico de guardia (en Urgencias)']);
  });

  it('sin sala actual conocida no se añade «(en …)»', () => {
    expect(imperativeMissing([npc('enfermera-urgencias')], ctxFor(null)))
      .toEqual(['habla con la Enfermera de urgencias']);
  });

  it('un objeto por revisar se «revisa»; una persona exigida como «revisada» se «habla»', () => {
    expect(imperativeMissing([inspected('expediente-caso')], ctxFor('recepcion')))
      .toEqual(['revisa el Expediente del caso']);
    expect(imperativeMissing([inspected('familia-crisis')], ctxFor('urgencias')))
      .toEqual(['habla con la Familia en crisis']);
    expect(imperativeMissing([inspected('expediente-caso')], ctxFor('urgencias')))
      .toEqual(['revisa el Expediente del caso (en la Recepción)']);
  });

  it('distingue TENER de USAR una herramienta y describe sin nombrarla', () => {
    const ctx = ctxFor('urgencias');
    expect(imperativeMissing([owned('PAP')], ctx)).toEqual(['recoge el material de apoyo de la sala']);
    expect(imperativeMissing([used('PAP')], ctx)).toEqual(['usa el material de apoyo de la sala']);
    expect(imperativeMissing([owned('SPIKES')], ctx)).toEqual(['recoge el material del estante (en la Sala de escucha familiar)']);
    expect(imperativeMissing([used('RISK_METER')], ctxFor('consultorio'))).toEqual(['usa el instrumento de la sala']);
    expect(imperativeMissing([used('RISK_METER')], ctxFor('recepcion')))
      .toEqual(['usa el instrumento de la sala (en el Consultorio)']);
  });

  it('con NAME_TOOLS_IN_HINTS (nameTools) nombra la herramienta', () => {
    const ctx = ctxFor('urgencias', { nameTools: true });
    expect(imperativeMissing([owned('PAP')], ctx)).toEqual(['recoge el Kit PAP']);
    expect(imperativeMissing([used('PAP')], ctx)).toEqual(['usa el Kit PAP']);
    expect(imperativeMissing([owned('SPIKES')], ctx)).toEqual(['recoge el Protocolo EPICEE (en la Sala de escucha familiar)']);
    expect(imperativeMissing([used('RISK_METER')], ctxFor('consultorio', { nameTools: true })))
      .toEqual(['usa la Valoración de riesgo']);
  });

  it('el imperativo añade el lugar vivo de lo que está en la sala actual', () => {
    const world = {
      inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {},
      objects: [
        obj({ key: 'familia-crisis', label: 'Familia en crisis', type: 'PERSON', x: 190, y: 420 }),
        obj({ key: 'tool-pap', label: 'Kit PAP', type: 'TOOL', toolCode: 'PAP', x: 318, y: 428 }),
      ],
    };
    const ctx = ctxFor('urgencias', { world });
    expect(imperativeMissing([inspected('familia-crisis')], ctx))
      .toEqual(['habla con la Familia en crisis (en el extremo izquierdo, al frente)']);
    expect(imperativeMissing([owned('PAP')], ctx))
      .toEqual(['recoge el material de apoyo de la sala (a la izquierda, al frente)']);
  });

  it('elimina duplicados y conserva el orden', () => {
    expect(imperativeMissing([owned('PAP'), npc('enfermera-urgencias'), owned('PAP')], ctxFor('urgencias')))
      .toEqual(['recoge el material de apoyo de la sala', 'habla con la Enfermera de urgencias']);
  });

  it('una clave sin nombre usa el escenario o el mundo y, si no, una frase genérica sin clave', () => {
    const ctx = ctxFor('urgencias', {
      npcs: [{ key: 'ana-visita', displayName: 'Visita de Ana' }],
      world: { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {},
        objects: [obj({ key: 'caja-azul', label: 'Caja azul', type: 'OBJECT' })] },
    });
    expect(imperativeMissing([npc('ana-visita')], ctx)).toEqual(['habla con Visita de Ana']);
    expect(imperativeMissing([inspected('caja-azul')], ctx)).toEqual(['revisa Caja azul (en el extremo izquierdo, al fondo)']);
    const unknown = imperativeMissing([npc('x-y'), inspected('otro-z'), owned('NOPE'), used('NOPE')], ctxFor('urgencias'));
    expect(unknown).toEqual([
      'habla con alguien en otra sala', 'revisa algo en otra sala',
      'recoge algo en otra sala', 'usa algo en otra sala',
    ]);
    for (const phrase of unknown) expect(phrase).not.toMatch(SLUG);
  });
});
