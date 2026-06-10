import { DialogueState } from '../../core/models/simulation.model';
import { resolveViewMode } from './simulation-view-mode.util';

function dialogueWith(choices: DialogueState['choices']): DialogueState {
  return {
    key: 'd1', speakerName: 'Paciente', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Paciente', text: 'Hola', emotion: 'neutral' }],
    choices,
  };
}

const choice = {
  key: 'c1', text: 'Escuchar', decisionOptionId: 7,
  requiredToolCode: null, effect: {},
};

describe('resolveViewMode', () => {
  it('explora cuando no hay nada activo', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: null }))
      .toBe('explore');
  });

  it('outcome cuando el intento terminó, por encima de todo lo demás', () => {
    expect(resolveViewMode({ status: 'COMPLETED', journalOpen: true, dialogue: dialogueWith([choice]) }))
      .toBe('outcome');
    expect(resolveViewMode({ status: 'SAFE_EXITED', journalOpen: false, dialogue: null }))
      .toBe('outcome');
  });

  it('journal cuando la bitácora está abierta y el intento sigue en curso', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: true, dialogue: dialogueWith([choice]) }))
      .toBe('journal');
  });

  it('dialogue-right cuando el diálogo activo tiene opciones de decisión', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([choice]) }))
      .toBe('dialogue-right');
  });

  it('dialogue-cinematic cuando el diálogo es informativo (sin opciones)', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([]) }))
      .toBe('dialogue-cinematic');
  });

  it('explore cuando aún no hay intento cargado', () => {
    expect(resolveViewMode({ status: null, journalOpen: false, dialogue: null }))
      .toBe('explore');
  });
});
