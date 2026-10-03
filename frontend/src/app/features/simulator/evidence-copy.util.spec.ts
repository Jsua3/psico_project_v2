import { MapObjectState } from '../../core/models/simulation.model';
import { MissingItem, NODE_EVIDENCE, missingEvidenceItems } from './evidence-gating.config';
import {
  CopyContext, evidenceNoticeText, humanizeMissing, imperativeMissing, joinSpanish,
} from './evidence-copy.util';
import { ENTITY_NAMES, ROUTE_ORDER, RoomGroup, TOOL_HINTS } from './orientation.config';

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

/** Lo que nunca debe verse con las banderas por defecto: técnicas y nombres de herramienta. */
const TOOL_VOCAB = /PAP|SPIKES|RISK_METER|EPICEE|Primeros Auxilios|Valoraci[oó]n de riesgo|\bKit\b/;
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

describe('humanizeMissing / imperativeMissing', () => {
  it('personas: «hablar con {artículo} {nombre}»; añade la sala si está en otra', () => {
    expect(humanizeMissing([npc('enfermera-urgencias')], ctxFor('urgencias')))
      .toEqual(['hablar con la Enfermera de urgencias']);
    expect(humanizeMissing([npc('enfermera-urgencias')], ctxFor('sala-escucha')))
      .toEqual(['hablar con la Enfermera de urgencias (en Urgencias)']);
    expect(imperativeMissing([npc('medico-guardia')], ctxFor('consultorio')))
      .toEqual(['habla con el Médico de guardia (en Urgencias)']);
  });

  it('sin sala actual conocida no se añade «(en …)»', () => {
    expect(humanizeMissing([npc('enfermera-urgencias')], ctxFor(null)))
      .toEqual(['hablar con la Enfermera de urgencias']);
  });

  it('un objeto por revisar se «revisa»; una persona exigida como «revisada» se «habla»', () => {
    expect(humanizeMissing([inspected('expediente-caso')], ctxFor('recepcion')))
      .toEqual(['revisar el Expediente del caso']);
    expect(humanizeMissing([inspected('familia-crisis')], ctxFor('urgencias')))
      .toEqual(['hablar con la Familia en crisis']);
    expect(imperativeMissing([inspected('expediente-caso')], ctxFor('urgencias')))
      .toEqual(['revisa el Expediente del caso (en la Recepción)']);
  });

  it('distingue TENER de USAR una herramienta y describe sin nombrarla', () => {
    const ctx = ctxFor('urgencias');
    expect(humanizeMissing([owned('PAP')], ctx)).toEqual(['recoger el material de apoyo de la sala']);
    expect(humanizeMissing([used('PAP')], ctx)).toEqual(['usar el material de apoyo de la sala']);
    expect(humanizeMissing([owned('SPIKES')], ctx)).toEqual(['recoger el material del estante (en la Sala de escucha familiar)']);
    expect(humanizeMissing([used('RISK_METER')], ctxFor('consultorio'))).toEqual(['usar el instrumento de la sala']);
    expect(imperativeMissing([used('RISK_METER')], ctxFor('recepcion')))
      .toEqual(['usa el instrumento de la sala (en el Consultorio)']);
  });

  it('con NAME_TOOLS_IN_HINTS (nameTools) nombra la herramienta', () => {
    const ctx = ctxFor('urgencias', { nameTools: true });
    expect(humanizeMissing([owned('PAP')], ctx)).toEqual(['recoger el Kit PAP']);
    expect(humanizeMissing([used('PAP')], ctx)).toEqual(['usar el Kit PAP']);
    expect(humanizeMissing([owned('SPIKES')], ctx)).toEqual(['recoger el Protocolo EPICEE (en la Sala de escucha familiar)']);
    expect(humanizeMissing([used('RISK_METER')], ctxFor('consultorio', { nameTools: true })))
      .toEqual(['usar la Valoración de riesgo']);
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
    // el infinitivo del aviso no lleva lugar: solo la sala si es otra
    expect(humanizeMissing([inspected('familia-crisis')], ctx)).toEqual(['hablar con la Familia en crisis']);
  });

  it('elimina duplicados y conserva el orden', () => {
    expect(humanizeMissing([owned('PAP'), npc('enfermera-urgencias'), owned('PAP')], ctxFor('urgencias')))
      .toEqual(['recoger el material de apoyo de la sala', 'hablar con la Enfermera de urgencias']);
  });

  it('una clave sin nombre usa el escenario o el mundo y, si no, una frase genérica sin clave', () => {
    const ctx = ctxFor('urgencias', {
      npcs: [{ key: 'ana-visita', displayName: 'Visita de Ana' }],
      world: { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {},
        objects: [obj({ key: 'caja-azul', label: 'Caja azul', type: 'OBJECT' })] },
    });
    expect(humanizeMissing([npc('ana-visita')], ctx)).toEqual(['hablar con Visita de Ana']);
    expect(humanizeMissing([inspected('caja-azul')], ctx)).toEqual(['revisar Caja azul']);
    const unknown = humanizeMissing([npc('x-y'), inspected('otro-z'), owned('NOPE'), used('NOPE')], ctxFor('urgencias'));
    expect(unknown).toEqual([
      'hablar con alguien en otra sala', 'revisar algo en otra sala',
      'recoger algo en otra sala', 'usar algo en otra sala',
    ]);
    for (const phrase of unknown) expect(phrase).not.toMatch(SLUG);
  });
});

describe('evidenceNoticeText (aviso único de F§5.5)', () => {
  it('compone la frase completa y no promete resultado alguno', () => {
    const text = evidenceNoticeText([npc('enfermera-urgencias'), used('PAP')], ctxFor('urgencias'));
    expect(text).toBe(
      'Antes de decidir te falta: hablar con la Enfermera de urgencias y usar el material de apoyo de la sala. '
      + 'Puedes seguir explorando o decidir ahora; tu decisión quedará registrada con información incompleta.',
    );
  });

  it('sin faltantes no hay aviso', () => {
    expect(evidenceNoticeText([], ctxFor('urgencias'))).toBeNull();
  });
});

describe('contratos de texto con las banderas por defecto', () => {
  const allKeys = Object.keys(ENTITY_NAMES);
  const allTools = Object.keys(TOOL_HINTS);
  // Las herramientas se piden por tool_code (TOOL_HINTS), nunca por su objeto 'tool-*' del mundo.
  const everyItem: MissingItem[] = [
    ...allKeys.filter(key => !key.startsWith('tool-')).flatMap(key => [npc(key), inspected(key)]),
    ...allTools.flatMap(key => [owned(key), used(key)]),
  ];
  const nodeItems = Object.entries(NODE_EVIDENCE).map(([nodeKey, def]) => ({
    nodeKey,
    items: missingEvidenceItems(def, { inventory: [], inspectedObjectKeys: [], usedToolKeys: [], flags: {} }, new Set()),
  }));

  it('cada combinación de NODE_EVIDENCE × sala dice lo mismo en infinitivo, imperativo y aviso', () => {
    for (const { nodeKey, items } of nodeItems) {
      expect(items.length).toBeGreaterThan(0);
      for (const room of [...ROUTE_ORDER, null]) {
        const ctx = ctxFor(room);
        const infinitives = humanizeMissing(items, ctx);
        const imperatives = imperativeMissing(items, ctx);
        const notice = evidenceNoticeText(items, ctx)!;
        expect(infinitives).toHaveLength(items.length);
        expect(imperatives).toHaveLength(items.length);
        // Misma entidad nombrada: lo que cambia es solo el verbo.
        infinitives.forEach((phrase, i) => {
          expect(phrase.length).toBeGreaterThan(0);
          expect(notice).toContain(phrase);
          expect(imperatives[i].replace(/^\S+( con)? /, '')).toBe(phrase.replace(/^\S+( con)? /, ''));
          expect(`${nodeKey}:${phrase}`).not.toMatch(/:.*(PAP|SPIKES|RISK_METER|EPICEE)/);
        });
      }
    }
  });

  it('nunca aparece una clave ni el nombre de una herramienta (todas las claves × todas las salas)', () => {
    for (const room of [...ROUTE_ORDER, null]) {
      const ctx = ctxFor(room);
      for (const phrase of [...humanizeMissing(everyItem, ctx), ...imperativeMissing(everyItem, ctx)]) {
        expect(phrase).not.toMatch(SLUG);
        expect(phrase).not.toMatch(TOOL_VOCAB);
      }
      expect(evidenceNoticeText(everyItem, ctx)).not.toMatch(TOOL_VOCAB);
    }
  });

  it('con tildes y sin vocabulario de logro', () => {
    const text = evidenceNoticeText(everyItem, ctxFor('urgencias'))!;
    expect(text).toMatch(/información incompleta/);
    expect(text).not.toMatch(/\b(informacion|decision|psicologa|recepcion|bitacora)\b/i);
    expect(text).not.toMatch(/completad|bien hecho|logr|puntos?\b|correct|adecuad/i);
  });
});
