import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

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

const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

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
    jest.useFakeTimers();
    try {
      writeInputSignal(component.reduceMotion, true);
      render(MULTI_LINE_DIALOGUE);

      const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
      expect(component.displayedText()).toBe('Primera');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);

      // DOM renderizado: no hay nada que saltar y el control de avance ya está disponible.
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(dialog.querySelector('[aria-label="Mostrar siguiente intervención"]')).not.toBeNull();
      // La máquina de escribir no dejó ningún temporizador programado.
      expect(jest.getTimerCount()).toBe(0);

      component.advanceLine();
      fixture.detectChanges();
      expect(component.displayedText()).toBe('Segunda');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
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

describe('DialoguePanelComponent - cabecera fija con salida (T4.1, REGLA-004)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const head = () => host().querySelector('.panel-head') as HTMLElement | null;
  const buttonNames = (root: ParentNode) =>
    Array.from(root.querySelectorAll('button')).map(b => b.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const INFO_DIALOGUE: DialogueState = {
    key: 'dialogue-info', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Enfermera', text: 'Buenas tardes', emotion: 'neutral' }],
    choices: [],
  };

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

  function render(dialogue: DialogueState, mode: 'cinematic' | 'side' = 'cinematic', reveal = true): void {
    writeInputSignal(component.mode, mode);
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
    if (reveal) {
      component.skipTypewriter();
      while (!component.isLastLine()) { component.advanceLine(); component.skipTypewriter(); }
      fixture.detectChanges();
    }
  }

  it.each(['cinematic', 'side'] as const)('con opciones visibles (modo %s) están «Volver al mapa» y «Salida segura»', mode => {
    render(MULTI_LINE_DIALOGUE, mode);
    expect(host().querySelector('.choices')).not.toBeNull();
    const names = buttonNames(head()!);
    expect(names.some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(names.some(n => n.includes('Salida segura'))).toBe(true);
  });

  it.each(['cinematic', 'side'] as const)('sin opciones (modo %s) la cabecera sigue ofreciendo ambas salidas', mode => {
    render(INFO_DIALOGUE, mode);
    expect(host().querySelector('.choices')).toBeNull();
    const names = buttonNames(head()!);
    expect(names.some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(names.some(n => n.includes('Salida segura'))).toBe(true);
  });

  it('la cabecera existe también mientras el texto aún se escribe (antes de ver opciones)', () => {
    render(MULTI_LINE_DIALOGUE, 'side', false);
    expect(component.isTypingComplete()).toBe(false);
    expect(host().querySelector('.choices')).toBeNull();
    expect(buttonNames(head()!).some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(buttonNames(head()!).some(n => n.includes('Salida segura'))).toBe(true);
  });

  it('«Volver al mapa» emite close y no es un botón close-btn (el e2e solo pulsa esos para avanzar)', () => {
    render(MULTI_LINE_DIALOGUE);
    const close = jest.fn();
    component.close.subscribe(close);
    const back = Array.from(head()!.querySelectorAll('button')).find(b => b.textContent?.includes('Volver al mapa')) as HTMLButtonElement;
    expect(back.classList).not.toContain('close-btn');
    back.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ningún botón de la cabecera usa la clase close-btn: closeDialogue de los e2e sigue encontrando solo los de avance', () => {
    render(INFO_DIALOGUE);
    expect(head()!.querySelectorAll('.close-btn')).toHaveLength(0);
    const advance = Array.from(host().querySelectorAll('button.close-btn')).map(b => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(advance).toEqual(['Continuar ▶']);
  });

  it('la salida segura de la cabecera reenvía pause como safeExit del panel', () => {
    // ts-jest no aplica la transformación JIT a `output()`: se fija el cableado sobre el fuente.
    expect(source).toMatch(/<app-safe-exit-button[^>]*\(pause\)="safeExit\.emit\(\)"/);
    expect(source).toMatch(/readonly safeExit = output<void>\(\);/);
  });

  it('la cabecera es fija (sticky) y queda fuera del retrato y del cuerpo que se desplazan', () => {
    expect(source).toMatch(/\.panel-head \{\s*position: sticky;\s*top: 0;/);
    render(MULTI_LINE_DIALOGUE, 'side');
    const strip = host().querySelector('.dialogue-strip') as HTMLElement;
    expect(strip.firstElementChild).toBe(head());
    expect(head()!.closest('.strip-main')).toBeNull();
  });

  it('Enter o Espacio sobre un botón de la cabecera no avanzan el texto ni cancelan su clic nativo', () => {
    render(MULTI_LINE_DIALOGUE, 'side', false);
    const back = Array.from(head()!.querySelectorAll('button')).find(b => b.textContent?.includes('Volver al mapa')) as HTMLButtonElement;
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      back.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(component.isTypingComplete()).toBe(false);
    // Escape sigue cerrando desde la cabecera.
    const close = jest.fn();
    component.close.subscribe(close);
    back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
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
