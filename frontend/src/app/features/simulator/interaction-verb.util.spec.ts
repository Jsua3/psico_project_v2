import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatus } from './door-status.util';
import { interactionVerb } from './interaction-verb.util';

function obj(type: MapObjectState['type'], label: string, prompt = 'Aplicar la técnica clínica'): MapObjectState {
  return {
    key: 'k', label, type, x: 0, y: 0, width: 40, height: 40, color: '#fff', icon: '', shortCode: '',
    collision: false, interactionPrompt: prompt, interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  };
}

const LOCKED: DoorStatus = { state: 'locked', missing: [], stageLocked: false, message: 'Antes de pasar, revisa el Expediente del caso (a la derecha, al fondo).' };
const OPEN: DoorStatus = { state: 'open', missing: [], stageLocked: false, message: null };

describe('interactionVerb (F§4.3)', () => {
  it.each([
    ['PERSON', 'Enfermera de urgencias', 'Hablar con Enfermera de urgencias'],
    ['OBJECT', 'Expediente del caso', 'Revisar Expediente del caso'],
    ['ROUTE', 'Ruta', 'Revisar Ruta'],
    ['WARNING', 'Acceso a quirófano', 'Revisar Acceso a quirófano'],
    ['TOOL', 'Kit PAP', 'Recoger Kit PAP'],
    ['EXIT', 'Sala de escucha familiar', 'Pasar a Sala de escucha familiar'],
  ] as const)('%s → «%s»', (type, label, expected) => {
    expect(interactionVerb(obj(type, label), null)).toEqual({ text: expected, locked: false, reason: null });
  });

  it('no usa el interactionPrompt sembrado (algunos sugieren la acción clínica)', () => {
    expect(interactionVerb(obj('PERSON', 'Familia en crisis', 'Aplicar PAP a la familia'), null).text)
      .toBe('Hablar con Familia en crisis');
  });

  it('una salida bloqueada conserva el verbo y suma candado y motivo', () => {
    expect(interactionVerb(obj('EXIT', 'Consultorio'), LOCKED)).toEqual({
      text: 'Pasar a Consultorio', locked: true, reason: LOCKED.message,
    });
  });

  it('una salida abierta, o sin estado de puerta, no se bloquea', () => {
    expect(interactionVerb(obj('EXIT', 'Consultorio'), OPEN)).toEqual({ text: 'Pasar a Consultorio', locked: false, reason: null });
    expect(interactionVerb(obj('EXIT', 'Consultorio'), null).locked).toBe(false);
  });

  it('un estado de puerta no afecta a lo que no es una salida', () => {
    expect(interactionVerb(obj('PERSON', 'Sobreviviente'), LOCKED)).toEqual({ text: 'Hablar con Sobreviviente', locked: false, reason: null });
  });
});
