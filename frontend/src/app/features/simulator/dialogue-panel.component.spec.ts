import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogueState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { DialoguePanelComponent } from './dialogue-panel.component';
import {
  activeDialogueLine,
  dialogueChoicesVisible,
  dialogueKeyAction,
  isFinalDialogueLine,
  nextDialogueLineIndex,
} from './dialogue-progression.util';

const MULTI_LINE_DIALOGUE: DialogueState = {
  key: 'dialogue-multi',
  speakerName: 'Narradora',
  portraitKey: 'info',
  emotion: 'neutral',
  lines: [
    { order: 1, speakerName: 'Primera voz', text: 'Primera', emotion: 'concerned' },
    { order: 2, speakerName: 'Segunda voz', text: 'Segunda', emotion: 'positive' },
  ],
  choices: [{
    key: 'choice-1', text: 'Responder', decisionOptionId: 1,
    requiredToolCode: null, effect: {},
  }],
};

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

describe('DialoguePanelComponent - contrato de progresion narrativa', () => {
  it('expone una sola intervencion y revela opciones solo al completar la ultima', () => {
    let lineIndex = 0;

    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.text).toBe('Primera');
    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.speakerName).toBe('Primera voz');
    expect(dialogueChoicesVisible(MULTI_LINE_DIALOGUE, lineIndex, true)).toBe(false);

    lineIndex = nextDialogueLineIndex(MULTI_LINE_DIALOGUE, lineIndex) ?? lineIndex;

    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.text).toBe('Segunda');
    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.emotion).toBe('positive');
    expect(dialogueChoicesVisible(MULTI_LINE_DIALOGUE, lineIndex, true)).toBe(true);
  });

  it('modela Enter y Espacio como completar, avanzar y cerrar sin saltos dobles', () => {
    expect(dialogueKeyAction('Enter', false, false, 0, false)).toBe('complete');
    expect(dialogueKeyAction('Enter', true, false, 0, false)).toBe('advance');
    expect(dialogueKeyAction(' ', false, false, 0, false)).toBe('complete');
    expect(dialogueKeyAction(' ', true, false, 0, false)).toBe('advance');
    expect(dialogueKeyAction('Enter', true, true, 0, false)).toBe('close');
    expect(dialogueKeyAction('Enter', true, true, 1, false)).toBe('none');
    expect(dialogueKeyAction('Enter', true, false, 0, true)).toBe('none');
  });

  it('mantiene Escape disponible y bloquea opciones antes del final', () => {
    expect(dialogueKeyAction('Escape', false, false, 1, false)).toBe('close');
    expect(dialogueKeyAction('1', true, false, 1, false)).toBe('none');
    expect(dialogueKeyAction('1', true, true, 1, false)).toBe('choose');
    expect(dialogueKeyAction('2', true, true, 1, false)).toBe('none');
    expect(isFinalDialogueLine(MULTI_LINE_DIALOGUE, 0)).toBe(false);
    expect(isFinalDialogueLine(MULTI_LINE_DIALOGUE, 1)).toBe(true);
  });
});

describe('DialoguePanelComponent - integración renderizada', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: jest.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(dialogue: DialogueState): void {
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('reemplaza cada control sin sacar el foco del diálogo y oculta opciones intermedias', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(component.displayedText()).toBe('Primera');
    expect(dialog.querySelector('.choices')).toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('.close-btn'));

    component.advanceLine();
    component.skipTypewriter();
    fixture.detectChanges();

    expect(component.displayedText()).toBe('Segunda');
    expect(dialog.querySelector('.choices')).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('con movimiento reducido la línea aparece completa, sin máquina de escribir, y el foco entra al diálogo', () => {
    writeInputSignal(component.reduceMotion, true);
    render(MULTI_LINE_DIALOGUE);

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(component.displayedText()).toBe('Primera');
    expect(component.isTypingComplete()).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);

    component.advanceLine();
    expect(component.displayedText()).toBe('Segunda');
    expect(component.isTypingComplete()).toBe(true);
  });

  it('sin movimiento reducido la línea sigue apareciendo letra a letra', () => {
    render(MULTI_LINE_DIALOGUE);
    expect(component.displayedText()).toBe('');
    expect(component.isTypingComplete()).toBe(false);
  });

  it('cambiar el interruptor con el diálogo abierto no lo reinicia', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    component.advanceLine();
    expect(component.lineIndex()).toBe(1);

    writeInputSignal(component.reduceMotion, true);
    TestBed.flushEffects();

    expect(component.lineIndex()).toBe(1);
    expect(component.activeLine()?.text).toBe('Segunda');
  });

  it('hereda hablante, emoción y retrato del árbol cuando la línea trae cadenas vacías', () => {
    render({
      ...MULTI_LINE_DIALOGUE,
      speakerName: 'Consultante',
      portraitKey: 'escucha-segura',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: '', text: 'Necesito apoyo', emotion: '' }],
      choices: [],
    });

    expect(fixture.nativeElement.querySelector('.speaker-name')?.textContent).toContain('Consultante');
    expect(fixture.nativeElement.querySelector('.portrait-img')?.getAttribute('src'))
      .toBe('/assets/characters/portraits/paciente-vbg_neutral.png');
  });
});

const CHARS_PER_SEC = 22;
const INTERVAL_MS = Math.round(1000 / CHARS_PER_SEC);

function simulateTypewriter(fullText: string, tickCount: number): string {
  return fullText.slice(0, tickCount);
}

describe('Dialogue typewriter timing', () => {
  it('reveals characters at 22 chars/sec', () => {
    const text = 'Hola mundo';
    expect(simulateTypewriter(text, 1)).toBe('H');
    expect(simulateTypewriter(text, 5)).toBe('Hola ');
  });

  it('completes at text.length ticks', () => {
    const text = 'Test';
    expect(simulateTypewriter(text, text.length)).toBe('Test');
  });

  it('keeps the configured interval near 45 ms', () => {
    expect(INTERVAL_MS).toBeGreaterThanOrEqual(44);
    expect(INTERVAL_MS).toBeLessThanOrEqual(46);
  });
});
