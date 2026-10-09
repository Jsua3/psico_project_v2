import { RoomGroup } from './orientation.config';

/**
 * Rutas por etapa (diseño F§5.2): contenido autorado de la lista «Qué hacer».
 * Mismo patrón que NODE_EVIDENCE. El «dónde» NO se escribe: se calcula con
 * placeHint desde las coordenadas vivas. Los pasos nombran personas, objetos y
 * salas; nunca una opción de decisión ni la técnica concreta (el `labelNamed`
 * solo se usa con NAME_TOOLS_IN_HINTS = true).
 *
 * Peso: prep = recomendado antes de decidir (equivale a NODE_EVIDENCE),
 * route = lo exige una puerta, decision = el paso que aloja la decisión.
 */
export type StepKind = 'talk' | 'inspect' | 'collect' | 'use' | 'door' | 'decide';
export type StepWeight = 'prep' | 'route' | 'decision';

export type DoneRule =
  | { type: 'npc'; key: string }            // viewedNpcKeys ∪ inspectedObjectKeys
  | { type: 'inspected'; key: string }
  | { type: 'inventory'; toolCode: string }
  | { type: 'toolUsed'; toolCode: string }
  | { type: 'visitedRoom'; room: RoomGroup }
  | { type: 'never' };

export interface RouteStep {
  id: string;
  kind: StepKind;
  weight: StepWeight;
  room: RoomGroup;
  /** Clave de objeto o 'npc:{clave}'. */
  targetKey: string;
  label: string;
  labelNamed?: string;
  /** Aclaración que se muestra mientras el paso está pendiente. */
  note?: string;
  /** Motivo mostrado mientras `needs` no se cumple. */
  lockedNote?: string;
  done: DoneRule;
  /** Id de un paso anterior que debe estar hecho para poder hacer este. */
  needs?: string;
  /** Solo se emite si sigue pendiente (lo que arrastra de una etapa anterior). */
  carryOver?: boolean;
}

export interface StageRoute {
  nodeKey: string;
  /** 1..6: «Decisión {number} de 6». */
  number: number;
  title: string;
  intro: string;
  steps: RouteStep[];
}

const USE_NOTE = 'Aparece como opción dentro de la conversación.';

const COLLECT_INSTRUMENT: RouteStep = {
  id: 'c4-recoger', kind: 'collect', weight: 'prep', room: 'consultorio', targetKey: 'tool-riesgo',
  label: 'Recoge el instrumento de la sala', labelNamed: 'Recoge la Valoración de riesgo',
  done: { type: 'inventory', toolCode: 'RISK_METER' },
};

const USE_INSTRUMENT: RouteStep = {
  id: 'c4-usar', kind: 'use', weight: 'prep', room: 'consultorio', targetKey: 'sobreviviente-consulta',
  label: 'Usa el instrumento en la conversación con la Sobreviviente',
  labelNamed: 'Usa la Valoración de riesgo con la Sobreviviente',
  note: USE_NOTE,
  lockedNote: 'Primero recoge el instrumento de la sala.',
  done: { type: 'toolUsed', toolCode: 'RISK_METER' }, needs: 'c4-recoger',
};

export const STAGE_ROUTES: Record<string, StageRoute> = {
  'hospital-urgencias': {
    nodeKey: 'hospital-urgencias', number: 1, title: 'Urgencia vital y crisis',
    intro: 'Estás en Urgencias. Reúne lo que necesites aquí y pasa a la Sala de escucha familiar: ahí tomarás tu primera decisión.',
    steps: [
      {
        id: 'u1-recoger', kind: 'collect', weight: 'prep', room: 'urgencias', targetKey: 'tool-pap',
        label: 'Recoge el material de apoyo de la sala', labelNamed: 'Recoge el Kit PAP',
        done: { type: 'inventory', toolCode: 'PAP' },
      },
      {
        id: 'u1-familia', kind: 'talk', weight: 'route', room: 'urgencias', targetKey: 'familia-crisis',
        label: 'Habla con la Familia en crisis',
        done: { type: 'inspected', key: 'familia-crisis' },
      },
      {
        id: 'u1-usar', kind: 'use', weight: 'prep', room: 'urgencias', targetKey: 'familia-crisis',
        label: 'Usa el material de apoyo en esa conversación', labelNamed: 'Usa el Kit PAP con la Familia en crisis',
        note: USE_NOTE,
        lockedNote: 'Primero recoge el material de apoyo de la sala.',
        done: { type: 'toolUsed', toolCode: 'PAP' }, needs: 'u1-recoger',
      },
      {
        id: 'u1-enfermera', kind: 'talk', weight: 'prep', room: 'urgencias', targetKey: 'npc:enfermera-urgencias',
        label: 'Habla con la Enfermera de urgencias',
        done: { type: 'npc', key: 'enfermera-urgencias' },
      },
      {
        id: 'u1-puerta', kind: 'door', weight: 'route', room: 'urgencias', targetKey: 'puerta-sala-escucha',
        label: 'Pasa a la Sala de escucha familiar',
        done: { type: 'visitedRoom', room: 'sala-escucha' },
      },
      {
        id: 'u1-decidir', kind: 'decide', weight: 'decision', room: 'sala-escucha', targetKey: 'familia-duelo',
        label: 'Toma tu primera decisión con la Familia en crisis',
        done: { type: 'never' },
      },
    ],
  },
  'hospital-sala-escucha': {
    nodeKey: 'hospital-sala-escucha', number: 2, title: 'Marco normativo en salud',
    intro: 'Tu segunda decisión te espera en esta sala.',
    steps: [
      {
        id: 'u2-decidir', kind: 'decide', weight: 'decision', room: 'sala-escucha', targetKey: 'marco-normativo-hospital',
        label: 'Toma tu segunda decisión en el Marco normativo',
        done: { type: 'never' },
      },
    ],
  },
  'hospital-accion-etica': {
    nodeKey: 'hospital-accion-etica', number: 3, title: 'Acción técnica y ética',
    intro: 'Tercera decisión. Antes, mira qué hay en el estante de esta sala.',
    steps: [
      {
        id: 'u3-recoger', kind: 'collect', weight: 'prep', room: 'sala-escucha', targetKey: 'tool-spikes',
        label: 'Recoge el material del estante', labelNamed: 'Recoge el Protocolo EPICEE',
        done: { type: 'inventory', toolCode: 'SPIKES' },
      },
      {
        id: 'u3-decidir', kind: 'decide', weight: 'decision', room: 'sala-escucha', targetKey: 'psicologa-acompanante',
        label: 'Toma tu tercera decisión con la Psicóloga hospitalaria',
        done: { type: 'never' },
      },
    ],
  },
  'hospital-cierre-bloque': {
    nodeKey: 'hospital-cierre-bloque', number: 4, title: 'Ruta de restablecimiento',
    intro: 'La atención continúa en la Comisaría de Familia: sal por la puerta de la derecha.',
    steps: [
      {
        id: 'c4-salida', kind: 'door', weight: 'route', room: 'sala-escucha', targetKey: 'salida-institucional',
        label: 'Sal hacia la Comisaría de Familia',
        done: { type: 'visitedRoom', room: 'recepcion' },
      },
      {
        id: 'c4-expediente', kind: 'inspect', weight: 'route', room: 'recepcion', targetKey: 'expediente-caso',
        label: 'Revisa el Expediente del caso',
        done: { type: 'inspected', key: 'expediente-caso' },
      },
      {
        id: 'c4-puerta', kind: 'door', weight: 'route', room: 'recepcion', targetKey: 'puerta-consultorio',
        label: 'Pasa al Consultorio',
        lockedNote: 'Antes de pasar, revisa el Expediente del caso.',
        done: { type: 'visitedRoom', room: 'consultorio' },
      },
      COLLECT_INSTRUMENT,
      USE_INSTRUMENT,
      {
        id: 'c4-decidir', kind: 'decide', weight: 'decision', room: 'consultorio', targetKey: 'sobreviviente-consulta',
        label: 'Toma tu cuarta decisión con la Sobreviviente',
        done: { type: 'never' },
      },
    ],
  },
  'comisaria-consultorio': {
    nodeKey: 'comisaria-consultorio', number: 5, title: 'Marco normativo de derechos',
    intro: 'Tu quinta decisión te espera en este consultorio.',
    steps: [
      {
        id: 'c5-decidir', kind: 'decide', weight: 'decision', room: 'consultorio', targetKey: 'marco-normativo-comisaria',
        label: 'Toma tu quinta decisión en el Marco normativo',
        done: { type: 'never' },
      },
    ],
  },
  'comisaria-accion-final': {
    nodeKey: 'comisaria-accion-final', number: 6, title: 'Actuación y cierre',
    intro: 'Última decisión del caso. Sigues en el consultorio.',
    steps: [
      { ...COLLECT_INSTRUMENT, id: 'c6-recoger', carryOver: true },
      { ...USE_INSTRUMENT, id: 'c6-usar', needs: 'c6-recoger', carryOver: true },
      {
        id: 'c6-decidir', kind: 'decide', weight: 'decision', room: 'consultorio', targetKey: 'profesional-psicosocial',
        label: 'Toma tu sexta decisión con la Profesional psicosocial',
        done: { type: 'never' },
      },
    ],
  },
};
