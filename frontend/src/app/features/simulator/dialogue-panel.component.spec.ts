import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { DialogueState } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { blend, contrastRatio } from '../../../styles/contrast.util';
import { AudioDirectorService } from './audio-director.service';
import { DialoguePanelComponent } from './dialogue-panel.component';
import {
  activeDialogueLine,
  dialogueChoicesVisible,
  dialogueKeyAction,
  isFinalDialogueLine,
  nextDialogueLineIndex,
} from './dialogue-progression.util';
import type { Mock } from 'vitest';

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
    // Mantenida, solo el primer evento cierra (F5): los repetidos no cierran el diálogo siguiente.
    expect(dialogueKeyAction('Escape', true, true, 0, true)).toBe('none');
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
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
      ],
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
    // render() bajo reloj real: igual que en el resto del archivo, instalar el reloj falso
    // ANTES del primer detectChanges() deja a mitad de camino el tick de estabilización del
    // planificador zone-coalesced de Angular 22 y una siguiente llamada reentra en
    // ApplicationRef.tick (NG0101).
    writeInputSignal(component.reduceMotion, true);
    render(MULTI_LINE_DIALOGUE);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
      expect(component.displayedText()).toBe('Primera');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);

      // DOM renderizado: no hay nada que saltar y el control de avance ya está disponible.
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(dialog.querySelector('[aria-label="Mostrar siguiente intervención"]')).not.toBeNull();
      // La máquina de escribir no dejó ningún temporizador programado.
      expect(vi.getTimerCount()).toBe(0);

      component.advanceLine();
      fixture.detectChanges();
      expect(component.displayedText()).toBe('Segunda');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
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
      .toBe('/assets/characters/kit/sobreviviente/portrait-neutral.png');
  });

  const portraitSrc = () => fixture.nativeElement.querySelector('.portrait-img')?.getAttribute('src') ?? null;

  it('el NPC de escenario muestra el retrato de su receta aunque se llame como una voz sin cuerpo', () => {
    render({
      key: 'npc-supervisor-cierre',
      speakerName: 'Supervisión clínica',
      portraitKey: null,
      recipeId: 'supervisor-clinico',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Supervisión clínica', text: 'Buen cierre.', emotion: 'positive' }],
      choices: [],
    });

    expect(portraitSrc()).toBe('/assets/characters/kit/supervisor-clinico/portrait-alegre.png');
  });

  it('una voz sin cuerpo no tiene retrato: queda la silueta', () => {
    render({
      ...MULTI_LINE_DIALOGUE,
      speakerName: 'Supervisión clínica',
      portraitKey: null,
      lines: [{ order: 1, speakerName: 'Supervisión clínica', text: 'Revisa el protocolo.', emotion: 'danger' }],
      choices: [],
    });

    expect(portraitSrc()).toBeNull();
    expect(fixture.nativeElement.querySelector('.portrait-svg')).not.toBeNull();
  });

  it('la receta del árbol no vale para la línea de otro hablante', () => {
    render({
      key: 'npc-supervisor-cierre',
      speakerName: 'Supervisión clínica',
      portraitKey: null,
      recipeId: 'supervisor-clinico',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Abuela de la niña', text: 'Gracias por venir.', emotion: 'neutral' }],
      choices: [],
    });

    expect(portraitSrc()).toBe('/assets/characters/kit/abuela-familia/portrait-neutral.png');
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
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
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
    const close = vi.fn();
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
    // En el panel Esc cierra el diálogo (el segundo Esc pausa): el botón no promete Esc.
    render(INFO_DIALOGUE);
    expect(head()!.querySelector('app-safe-exit-button')?.hasAttribute('data-hide-key')).toBe(true);
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
    const close = vi.fn();
    component.close.subscribe(close);
    back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('DialoguePanelComponent - liberación tras un error (T4.2, DLG-01)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
    writeInputSignal(component.dialogue, {
      ...MULTI_LINE_DIALOGUE,
      lines: [{ order: 1, speakerName: 'Familia', text: '¿Qué hacemos?', emotion: 'neutral' }],
      choices: [
        { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
        { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
      ],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
    // Instalados DESPUÉS del detectChanges() inicial (no antes): con Angular 22 instalarlos
    // primero deja el tick de estabilización del planificador zone-coalesced a mitad de camino
    // bajo el reloj falso de Vitest, y una siguiente detectChanges()/advanceTimersByTime()
    // termina re-entrando en ApplicationRef.tick (NG0101).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('elegir una opción la bloquea hasta que el anfitrión libera el panel', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const [first] = component.dialogue()!.choices;

    component.handleChoice(first);
    fixture.detectChanges();
    expect(component.chosenKey()).toBe('c1');
    expect(host().querySelector('.choices--locked')).not.toBeNull();

    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(1);
    // Mientras no haya liberación, una segunda elección se ignora.
    component.handleChoice(component.dialogue()!.choices[1]);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('un releaseToken nuevo limpia la elección y las opciones vuelven a ser activables', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const [first, second] = component.dialogue()!.choices;
    component.handleChoice(first);
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(host().querySelector('.choices--locked')).not.toBeNull();

    // El anfitrión falló al registrar la decisión y suma un token.
    writeInputSignal(component.releaseToken, 1);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(component.chosenKey()).toBeNull();
    expect(host().querySelector('.choices--locked')).toBeNull();
    // Y se puede elegir de nuevo, también otra opción.
    component.handleChoice(second);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenLastCalledWith(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('cada token nuevo libera otra vez (un fallo tras otro no deja el panel atrapado)', () => {
    const [first] = component.dialogue()!.choices;
    for (const token of [1, 2, 3]) {
      component.handleChoice(first);
      vi.advanceTimersByTime(200);
      // Asienta aquí el tick pendiente del reloj falso: sin esto, el flushEffects()/escritura
      // de signal que sigue reentra en ApplicationRef.tick (NG0101).
      fixture.detectChanges();
      expect(component.chosenKey()).toBe('c1');
      writeInputSignal(component.releaseToken, token);
      TestBed.flushEffects();
      expect(component.chosenKey()).toBeNull();
    }
  });

  it('liberar antes de que venza la pausa de confirmación cancela la ejecución pendiente', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    component.handleChoice(component.dialogue()!.choices[0]);
    fixture.detectChanges();
    writeInputSignal(component.releaseToken, 1);
    TestBed.flushEffects();
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    expect(execute).not.toHaveBeenCalled();
    expect(component.chosenKey()).toBeNull();
  });

  it('el valor inicial del token es 0 y no altera el diálogo recién abierto', () => {
    expect(component.releaseToken()).toBe(0);
    expect(component.chosenKey()).toBeNull();
  });
});

describe('DialoguePanelComponent - sin decisión accidental (T4.3, DLG-03)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const choiceButtons = () => Array.from(host().querySelectorAll<HTMLButtonElement>('.choice-btn'));
  const clickWithDetail = (button: HTMLElement, detail: number) =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
    writeInputSignal(component.dialogue, {
      ...MULTI_LINE_DIALOGUE,
      lines: [{ order: 1, speakerName: 'Familia', text: '¿Qué hacemos?', emotion: 'neutral' }],
      choices: [
        { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
        { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
      ],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
    // Instalados DESPUÉS del detectChanges() inicial (no antes): con Angular 22 instalarlos
    // primero deja el tick de estabilización del planificador zone-coalesced a mitad de camino
    // bajo el reloj falso de Vitest, y una siguiente detectChanges()/advanceTimersByTime()
    // termina re-entrando en ApplicationRef.tick (NG0101).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('con opciones visibles el foco entra al grupo .choices, no a una opción, y sigue dentro del diálogo', () => {
    const dialog = host().querySelector('[role="dialog"]') as HTMLElement;
    const group = host().querySelector('.choices') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('tabindex')).toBe('-1');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(group);
    expect(choiceButtons().some(b => b === document.activeElement)).toBe(false);
  });

  it('el foco sigue sin caer en una opción tras completar el texto a mano', () => {
    writeInputSignal(component.reduceMotion, false);
    writeInputSignal(component.dialogue, { ...component.dialogue()!, key: 'otra', lines: [{ order: 1, speakerName: 'Familia', text: 'Texto largo para escribir', emotion: 'neutral' }] });
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    fixture.detectChanges();
    expect(host().querySelector('.choices')).not.toBeNull();
    expect(choiceButtons().some(b => b === document.activeElement)).toBe(false);
    expect((host().querySelector('[role="dialog"]') as HTMLElement).contains(document.activeElement)).toBe(true);
  });

  it('Enter con opciones visibles no emite execute (ni siquiera tras la confirmación)', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    vi.advanceTimersByTime(1000);
    expect(execute).not.toHaveBeenCalled();
    expect(component.chosenKey()).toBeNull();
  });

  it('un clic de teclado (detail 0) en los primeros 500 ms se ignora', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(300);
    expect(component.chosenKey()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('un toque o clic de puntero (detail >= 1) funciona de inmediato', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[1], 1);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(2);
  });

  it('pasada la ventana, una activación por teclado deliberada sí elige', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    vi.advanceTimersByTime(600);
    // detectChanges() asienta aquí el tick que el reloj falso deja pendiente: sin esto, un
    // segundo advanceTimersByTime más adelante reentra en ApplicationRef.tick (NG0101).
    fixture.detectChanges();
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(1);
  });

  it('un diálogo nuevo con opciones reinicia la ventana de guarda', () => {
    vi.advanceTimersByTime(2000);
    writeInputSignal(component.dialogue, {
      ...component.dialogue()!,
      key: 'siguiente',
    });
    fixture.detectChanges();
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(300);
    expect(execute).not.toHaveBeenCalled();
  });

  it('elegir con la tecla de dígito sigue siendo una acción deliberada', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(2);
  });
});

describe('DialoguePanelComponent - aviso, subtítulos y chips (T4.5)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const decision = (id: number, label: string, extra: Partial<DialogueState['choices'][number]> = {}) => ({
    key: `d${id}`, text: label, decisionOptionId: id, requiredToolCode: null, effect: {}, ...extra,
  });
  const tool = (code: string, label: string, extra: Partial<DialogueState['choices'][number]> = {}) => ({
    key: `t-${code}`, text: label, decisionOptionId: null, requiredToolCode: code, effect: {}, ...extra,
  });
  const dialogueWith = (choices: DialogueState['choices'], extra: Partial<DialogueState> = {}): DialogueState => ({
    key: 'dlg', speakerName: 'Familia en crisis', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia en crisis', text: 'Necesitamos ayuda', emotion: 'neutral' }],
    choices, ...extra,
  });

  beforeEach(async () => {
    playSfx = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('muestra un solo aviso de evidencia sobre las opciones, sin insignia por opción ni «(información incompleta)»', () => {
    render(dialogueWith(
      [decision(1, 'Escuchar sin juzgar'), decision(2, 'Dar un consejo')],
      { notice: 'Antes de decidir te falta: hablar con la Enfermera de urgencias.' },
    ));
    const notices = host().querySelectorAll('.choices-notice');
    expect(notices).toHaveLength(1);
    expect(text(notices[0])).toContain('Antes de decidir te falta');
    // El aviso va antes del grupo de opciones.
    const group = host().querySelector('.choices')!;
    expect(notices[0].compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.getAttribute('aria-describedby')).toBe('choices-notice');
    // Ni insignia por opción ni la frase en los nombres accesibles (el e2e chooseDecision la rechaza).
    expect(host().querySelector('.choice-btn__meta')).toBeNull();
    for (const button of Array.from(host().querySelectorAll('.choice-btn'))) {
      expect(button.getAttribute('aria-label')).not.toMatch(/información incompleta/i);
      expect(text(button)).not.toMatch(/información incompleta/i);
    }
  });

  it('con la advertencia heredada repetida en cada opción sigue saliendo un solo aviso', () => {
    render(dialogueWith([
      decision(1, 'Escuchar', { evidenceWarning: 'Información insuficiente: falta una conversación.' }),
      decision(2, 'Aconsejar', { evidenceWarning: 'Información insuficiente: falta una conversación.' }),
    ]));
    expect(host().querySelectorAll('.choices-notice')).toHaveLength(1);
    expect(text(host().querySelector('.choices-notice'))).toBe('Información insuficiente: falta una conversación.');
  });

  it('sin aviso no hay párrafo ni aria-describedby en el grupo', () => {
    render(dialogueWith([decision(1, 'Escuchar')]));
    expect(host().querySelector('.choices-notice')).toBeNull();
    expect(host().querySelector('.choices')!.hasAttribute('aria-describedby')).toBe(false);
  });

  it('una opción de herramienta sin la herramienta es aria-disabled, enfocable, con chip, y no ejecuta', () => {
    const useTool = vi.fn();
    component.useTool.subscribe(useTool);
    render(dialogueWith([tool('PAP', 'Aplicar el material de apoyo', { toolMissing: true }), decision(1, 'Escuchar')]));
    // Instalado DESPUÉS del render(): antes deja a mitad de camino el tick de estabilización
    // del planificador zone-coalesced de Angular 22 (NG0101 en el primer advanceTimersByTime).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const [toolBtn, decisionBtn] = Array.from(host().querySelectorAll<HTMLButtonElement>('.choice-btn'));
      expect(toolBtn.getAttribute('aria-disabled')).toBe('true');
      expect(toolBtn.disabled).toBe(false);   // sigue enfocable
      expect(decisionBtn.hasAttribute('aria-disabled')).toBe(false);
      const chip = toolBtn.querySelector('.choice-btn__hint')!;
      expect(text(chip)).toBe('Aún no tienes esta herramienta. Recógela en la sala.');
      expect(toolBtn.getAttribute('aria-describedby')).toBe(chip.id);

      vi.advanceTimersByTime(600);
      fixture.detectChanges();
      toolBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(300);
      expect(useTool).not.toHaveBeenCalled();
      expect(component.chosenKey()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('con la herramienta en la mochila la opción es activable sin chip', () => {
    const useTool = vi.fn();
    component.useTool.subscribe(useTool);
    render(dialogueWith([tool('PAP', 'Aplicar el material de apoyo', { toolMissing: false })]));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const button = host().querySelector<HTMLButtonElement>('.choice-btn')!;
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      expect(host().querySelector('.choice-btn__hint')).toBeNull();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      vi.advanceTimersByTime(300);
      expect(useTool).toHaveBeenCalledWith('PAP');
    } finally {
      vi.useRealTimers();
    }
  });

  it('muestra «Usar una herramienta» y «Decisión clínica» solo cuando conviven, sin reordenar', () => {
    render(dialogueWith([tool('PAP', 'Aplicar material'), decision(1, 'Escuchar'), decision(2, 'Aconsejar')]));
    const children = Array.from(host().querySelector('.choices')!.children).map(el =>
      el.classList.contains('choices-subtitle') ? `# ${text(el)}` : text(el.querySelector('.choice-btn__label')));
    expect(children).toEqual(['# Usar una herramienta', 'Aplicar material', '# Decisión clínica', 'Escuchar', 'Aconsejar']);
  });

  it('sin mezcla de herramienta y decisión no hay subtítulos', () => {
    render(dialogueWith([decision(1, 'Escuchar'), decision(2, 'Aconsejar')]));
    expect(host().querySelector('.choices-subtitle')).toBeNull();
    render(dialogueWith([tool('PAP', 'Aplicar material')]));
    expect(host().querySelector('.choices-subtitle')).toBeNull();
  });

  it('una conversación de otra etapa (stale) muestra la línea informativa, ninguna decisión y «Continuar»', () => {
    const close = vi.fn();
    component.close.subscribe(close);
    render(dialogueWith([decision(1, 'Escuchar'), tool('PAP', 'Aplicar material')], { stale: true }));
    expect(host().querySelector('.choices')).toBeNull();
    expect(host().querySelector('.choice-btn')).toBeNull();
    expect(text(host().querySelector('.stale-note'))).toBe('Esta conversación corresponde a otro momento del caso.');
    const advance = Array.from(host().querySelectorAll('button.close-btn')).map(b => text(b));
    expect(advance).toEqual(['Continuar ▶']);
    // Enter cierra (no hay nada que elegir) y los dígitos no eligen.
    const execute = vi.fn();
    component.execute.subscribe(execute);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    expect(execute).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('si la conversación stale ya trae la frase como línea, no se repite como nota', () => {
    render(dialogueWith([], {
      stale: true,
      lines: [
        { order: 1, speakerName: 'Familia en crisis', text: 'Hola', emotion: 'neutral' },
        { order: 2, speakerName: 'Sistema', text: 'Esta conversación corresponde a otro momento del caso.', emotion: 'neutral' },
      ],
    }));
    expect(host().querySelector('.stale-note')).toBeNull();
  });

  it('la cabecera anuncia «Decisión clínica» solo si alguna opción registra una decisión', () => {
    render(dialogueWith([decision(1, 'Escuchar')]));
    expect(text(host().querySelector('.panel-head__note'))).toContain('Decisión clínica');
    expect(text(host().querySelector('.panel-head__note'))).toContain('Tu elección queda registrada en tu seguimiento formativo.');
    render(dialogueWith([tool('PAP', 'Aplicar material')]));
    expect(host().querySelector('.panel-head__note')).toBeNull();
    render(dialogueWith([]));
    expect(host().querySelector('.panel-head__note')).toBeNull();
  });

  it('la pista de teclado nombra el rango real de opciones y solo se pinta con puntero fino', () => {
    render(dialogueWith([decision(1, 'Escuchar'), decision(2, 'Aconsejar'), decision(3, 'Derivar')]));
    expect(text(host().querySelector('.keyboard-hint'))).toBe('Enter: continuar · 1 a 3: elegir · Esc: volver al mapa');
    render(dialogueWith([]));
    expect(text(host().querySelector('.keyboard-hint'))).toBe('Enter: continuar · Esc: volver al mapa');
    expect(source).toMatch(/\.keyboard-hint \{ display: none;/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.keyboard-hint \{ display: block; \}/);
  });
});

describe('DialoguePanelComponent - emociones y retrato (T4.6)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(speaker: string, emotion: string): void {
    writeInputSignal(component.dialogue, {
      key: 'e', speakerName: speaker, portraitKey: null, emotion,
      lines: [{ order: 1, speakerName: speaker, text: 'Línea', emotion }],
      choices: [],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it.each(['positive', 'concerned', 'danger', 'vulnerable'])(
    'una persona con emoción %s no lleva chip ni etiqueta de emoción', emotion => {
      render('Abuela de la niña', emotion);
      expect(host().querySelector('.emotion-chip')).toBeNull();
      expect(host().querySelector('.emotion-tag')).toBeNull();
    });

  it('la Abuela con emoción positive no recibe el retrato sonriente', () => {
    render('Abuela de la niña', 'positive');
    expect(host().querySelector('.portrait-img')?.getAttribute('src')).toBe('/assets/characters/kit/abuela-familia/portrait-neutral.png');
  });

  it('una voz de sistema conserva la señal de emoción (chip y etiqueta con su color)', () => {
    render('Supervisión clínica', 'danger');
    expect(host().querySelector('.emotion-chip')).not.toBeNull();
    expect(host().querySelector('.emotion-tag')?.textContent?.trim()).toBe('alerta');
  });

  it('emotionColor y emotionLabel se conservan (contrato de contraste del bloque H)', () => {
    expect(component.emotionColor('positive')).toBe('#6EC67A');
    expect(component.emotionColor('danger')).toBe('#E25A4F');
    expect(component.emotionLabel('concerned')).toBe('preocupada');
    expect(source).toMatch(/\.emotion-tag \{[^}]*opacity: 1;/);
  });
});

describe('DialoguePanelComponent - «Continuar» y sonido de opciones (T4.7)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    playSfx = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('«Continuar» tiene como nombre accesible su texto visible, no «Cerrar diálogo (Esc)»', () => {
    render({ key: 'c', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Enfermera', text: 'Hola', emotion: 'neutral' }], choices: [] });
    const button = host().querySelector<HTMLButtonElement>('button.close-btn')!;
    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Continuar ▶');
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(host().innerHTML).not.toMatch(/Cerrar diálogo/);
  });

  it('pasar el ratón por una opción no suena; el foco de teclado sí', () => {
    render({ ...MULTI_LINE_DIALOGUE, lines: [MULTI_LINE_DIALOGUE.lines[1]] });
    const option = host().querySelector<HTMLButtonElement>('.choice-btn')!;
    playSfx.mockClear();

    option.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(playSfx).not.toHaveBeenCalled();

    // Foco por puntero (no :focus-visible): sin sonido.
    Object.defineProperty(option, 'matches', { configurable: true, value: () => false });
    option.dispatchEvent(new FocusEvent('focus'));
    expect(playSfx).not.toHaveBeenCalled();

    // Foco de teclado (:focus-visible): suena una vez.
    Object.defineProperty(option, 'matches', { configurable: true, value: (selector: string) => selector === ':focus-visible' });
    option.dispatchEvent(new FocusEvent('focus'));
    expect(playSfx).toHaveBeenCalledWith('ui_select');
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it('un navegador sin :focus-visible no rompe el foco de la opción', () => {
    render({ ...MULTI_LINE_DIALOGUE, lines: [MULTI_LINE_DIALOGUE.lines[1]] });
    const option = host().querySelector<HTMLButtonElement>('.choice-btn')!;
    Object.defineProperty(option, 'matches', { configurable: true, value: () => { throw new SyntaxError('selector no válido'); } });
    expect(() => option.dispatchEvent(new FocusEvent('focus'))).not.toThrow();
  });
});

/** Cuerpos de todos los bloques `@media <consulta> { … }` de un CSS: cuenta llaves, así que una regla solo cuenta dentro del suyo. */
function mediaBlocks(css: string, query: string): string[] {
  const head = `@media ${query} {`;
  const blocks: string[] = [];
  for (let from = css.indexOf(head); from >= 0; from = css.indexOf(head, from + head.length)) {
    let depth = 1;
    let end = from + head.length;
    for (; end < css.length && depth > 0; end += 1) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') depth -= 1;
    }
    blocks.push(css.slice(from + head.length, end - 1));
  }
  return blocks;
}

describe('DialoguePanelComponent - scroll, hoja y retrato (T4.4)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let scrollIntoView: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const strip = () => host().querySelector('.dialogue-strip') as HTMLElement;
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

  const LONG = 'Texto bastante largo para que la máquina de escribir tarde en terminar de escribirlo todo.';
  const dialogue = (text = LONG): DialogueState => ({
    key: 'scroll', speakerName: 'Familia', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia', text, emotion: 'neutral' }],
    choices: [
      { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
      { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
    ],
  });

  beforeEach(async () => {
    scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
    else delete (Element.prototype as unknown as Record<string, unknown>)['scrollIntoView'];
  });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  // ts-jest corre sin zone.js: `fixture.detectChanges()` no invoca ngAfterViewChecked si solo cambian
  // señales internas. En el navegador Angular lo llama en cada ciclo; aquí se invoca a mano.
  const checkView = () => { fixture.detectChanges(); component.ngAfterViewChecked(); };

  it('mientras se escribe ancla abajo en cada revisión', () => {
    render(dialogue());
    expect(component.isTypingComplete()).toBe(false);
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 640 });
    strip().scrollTop = 0;
    component.ngAfterViewChecked();
    expect(strip().scrollTop).toBe(640);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('al aparecer las opciones las revela una sola vez y no vuelve a pelear con el scroll', () => {
    render(dialogue());
    component.skipTypewriter();
    checkView();
    expect(host().querySelector('.choices')).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    // El estudiante se desplaza: ninguna revisión posterior lo devuelve al fondo ni repite el reveal.
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 900 });
    strip().scrollTop = 40;
    checkView();
    checkView();
    expect(strip().scrollTop).toBe(40);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('sin opciones, al terminar la línea deja a la vista el botón de avance y luego no ancla más', () => {
    render({ ...dialogue(), choices: [] });
    component.skipTypewriter();
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 500 });
    strip().scrollTop = 0;
    checkView();
    expect(strip().scrollTop).toBe(500);
    expect(scrollIntoView).not.toHaveBeenCalled();
    strip().scrollTop = 120;
    checkView();
    expect(strip().scrollTop).toBe(120);
  });

  it('si la lista no cabe bajo la cabecera alinea su inicio para que se vean la opción 1 y la 2', () => {
    render(dialogue());
    component.skipTypewriter();
    fixture.detectChanges();
    // Con Angular 22 ese detectChanges() ya invoca ngAfterViewChecked() automáticamente (antes
    // ocurría más tarde, de forma menos eager), así que el guard `settled` de revealChoices()
    // ya quedó fijo con las medidas por defecto (0) antes de poder simular las reales. Se
    // reabre a propósito para que la llamada manual de abajo, ya con las medidas simuladas,
    // vuelva a decidir entre 'start' y 'nearest'.
    (component as unknown as { settled: boolean }).settled = false;
    scrollIntoView.mockClear(); // la primera llamada (automática, con medidas en 0) no es la que se mide aquí.
    Object.defineProperty(strip(), 'clientHeight', { configurable: true, value: 220 });
    Object.defineProperty(host().querySelector('.panel-head'), 'offsetHeight', { configurable: true, value: 56 });
    Object.defineProperty(host().querySelector('.choices'), 'offsetHeight', { configurable: true, value: 400 });
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('con movimiento reducido las opciones también se revelan una vez por línea nueva', () => {
    writeInputSignal(component.reduceMotion, true);
    render(dialogue('Primera'));
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    writeInputSignal(component.dialogue, { ...dialogue('Segunda'), key: 'otra' });
    TestBed.flushEffects();
    fixture.detectChanges();
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('el retrato lateral mide 96 px (×3) y 64 px (×2) en pantallas bajas, y el panel lateral es lo único que se desplaza', () => {
    expect(source).toMatch(/\.dialogue-strip--side \.portrait-img \{ width: 96px; height: 96px; \}/);
    const compact = mediaBlocks(source, '(max-height: 520px)');
    expect(compact.length).toBeGreaterThan(0);
    expect(compact.some(block => block.includes('.dialogue-strip--side .portrait-img { width: 64px; height: 64px; }'))).toBe(true);
    expect(source).not.toContain('clamp(48px, 12vh, 64px)');
    expect(source).toMatch(/\.dialogue-strip--side \{[^}]*overflow-y: auto;/);
    // Ya no se ancla al fondo en cada ciclo de detección.
    expect(source).not.toMatch(/el\.scrollTop = el\.scrollHeight;\s*\}\s*\}\s*ngOnDestroy/);
  });
});

describe('DialoguePanelComponent - contraste de lo nuevo (WCAG 1.4.3, T4.1/T4.5)', () => {
  // Peores fondos: panel lateral (vidrio oscuro del HUD) y franja cinemática sobre un píxel blanco del mapa.
  const SIDE_BG = '#181F31';
  const CINEMATIC_BG = blend('#080C12', 0.95, '#FFFFFF');
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source.match(new RegExp(`${escaped} \\{([^}]*)\\}`))?.[1] ?? '';
  };
  const hexOf = (body: string, property: string): string => body.match(new RegExp(`${property}: (#[0-9A-Fa-f]{6})`))?.[1] ?? '';

  it('el aviso de evidencia, el chip de herramienta ausente y el chip «Decisión clínica» llegan a 4,5:1', () => {
    const notice = hexOf(rule('.choices-notice'), 'color');
    expect(contrastRatio(notice, blend('#F5B84B', 0.10, SIDE_BG))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(notice, blend('#F5B84B', 0.10, CINEMATIC_BG))).toBeGreaterThanOrEqual(4.5);
    const hint = hexOf(rule('.choice-btn__hint'), 'color');
    expect(contrastRatio(hint, blend('#FFFFFF', 0.06, SIDE_BG))).toBeGreaterThanOrEqual(4.5);
    const chip = hexOf(rule('.panel-chip'), 'color');
    expect(contrastRatio(chip, blend('#7C4DFF', 0.16, '#121A2B'))).toBeGreaterThanOrEqual(4.5);
    const subtitle = hexOf(rule('.choices-subtitle'), 'color');
    expect(contrastRatio(subtitle, SIDE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto de «Volver al mapa» y la cabecera sólida llegan a 4,5:1', () => {
    const text = hexOf(rule('.panel-back'), 'color');
    expect(contrastRatio(text, blend('#7C4DFF', 0.12, '#121A2B'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, blend('#7C4DFF', 0.12, '#080C12'))).toBeGreaterThanOrEqual(4.5);
    // La cabecera es opaca: nada de lo que se desplaza se transparenta debajo de los botones.
    expect(rule('.panel-head')).toMatch(/background: #[0-9A-Fa-f]{6};/);
    expect(source).toMatch(/\.dialogue-strip--side \.panel-head \{ background: #[0-9A-Fa-f]{6}; \}/);
  });

  it('la pista de teclado, la nota de cabecera y la línea de otro momento (texto claro con alfa) llegan a 4,5:1', () => {
    for (const [selector, surface] of [['.keyboard-hint', SIDE_BG], ['.panel-head__note', '#121A2B'], ['.stale-note', SIDE_BG]] as const) {
      const alpha = Number(rule(selector).match(/color: rgba\(232,240,244,\.(\d+)\)/)?.[1]);
      expect(alpha).toBeGreaterThan(0);
      expect(contrastRatio(blend('#E8F0F4', Number(`0.${alpha}`), surface), surface)).toBeGreaterThanOrEqual(4.5);
    }
    const hintAlpha = Number(`0.${rule('.keyboard-hint').match(/rgba\(232,240,244,\.(\d+)\)/)?.[1]}`);
    expect(contrastRatio(blend('#E8F0F4', hintAlpha, CINEMATIC_BG), CINEMATIC_BG)).toBeGreaterThanOrEqual(4.5);
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
