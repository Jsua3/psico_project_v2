// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta). Solo se evalúa
// `extends Phaser.Scene` al cargar el módulo; estos tests de instancia nunca
// arrancan la escena (boot() requiere el template, que ts-jest no renderiza).
jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { GameMenuComponent, lobbyKeyboardHint } from './game-menu.component';

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    caseVersionId: 7,
    title: 'Caso demo',
    unlocked: true,
    completed: false,
    ...overrides,
  } as CatalogItem;
}

describe('GameMenuComponent — entrada fiable al caso (GAME-09)', () => {
  let component: GameMenuComponent;
  let router: { navigate: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    router = { navigate: jest.fn() };
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: jest.fn(() => EMPTY) } },
        { provide: Router, useValue: router },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
      ],
    });
    component = TestBed.createComponent(GameMenuComponent).componentInstance;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('una puerta disponible navega exactamente UNA vez', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    expect(component.entering()).toBe('Caso demo');
    jest.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador', 7]);
  });

  it('una puerta bloqueada nunca navega', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enter(7);
    expect(component.entering()).toBe('');
    jest.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('dobles entradas durante la transición no duplican la navegación', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    component.enter(7); // E + click casi simultáneos
    jest.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused (tecla E DOM) entra a la puerta enfocada disponible', () => {
    component.catalog.set([makeItem()]);
    component.focused.set(makeItem());
    const event = new KeyboardEvent('keydown', { key: 'e', cancelable: true });
    component.enterFocused(event);
    expect(event.defaultPrevented).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused no hace nada sin puerta cerca o con puerta bloqueada', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e' }));
    component.focused.set(makeItem({ unlocked: false }));
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
    jest.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('GameMenuComponent: ayuda y textos de teclado en el lobby (T7.4)', () => {
  const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8');
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const catalogItem = makeItem();

  function mount(coarse: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)' ? coarse : false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: jest.fn(() => EMPTY) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
      ],
    });
    const fixture = TestBed.createComponent(GameMenuComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
  }

  const helpButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.menu-help-btn');
  const helpPanel = (root: HTMLElement) => root.querySelector<HTMLElement>('#lobby-help');

  afterEach(() => {
    TestBed.resetTestingModule();
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('texto de teclado', () => {
    it('lobbyKeyboardHint: con puntero fino devuelve el recordatorio y con puntero grueso nada', () => {
      expect(lobbyKeyboardHint(false)).toBe('← → / A D  mover · E entrar');
      expect(lobbyKeyboardHint(true)).toBeNull();
    });

    it('la escena de Phaser solo pinta ese texto si lobbyKeyboardHint lo devuelve', () => {
      expect(source).toMatch(/const keyboardHint = lobbyKeyboardHint\(matchesMedia\(COARSE_POINTER_QUERY\)\);\s*if \(keyboardHint\) \{/);
      expect(source).not.toMatch(/add\.text\(12, 12, '← →/);
    });

    it('el botón de entrada lleva «(E)» solo con puntero fino', () => {
      for (const [coarse, label] of [[false, 'Entrar al caso (E)'], [true, 'Entrar al caso']] as const) {
        const { fixture, component, root } = mount(coarse);
        component.catalog.set([catalogItem]);
        component.focused.set(catalogItem);
        fixture.detectChanges();
        expect(root.querySelector('.banner-enter')?.textContent?.trim()).toBe(label);
        TestBed.resetTestingModule();
      }
    });

    it('el nombre accesible del escenario no promete teclas con puntero grueso', () => {
      const fine = mount(false).root.querySelector('.phaser-host')?.getAttribute('aria-label') ?? '';
      expect(fine).toContain('Flechas o A/D');
      TestBed.resetTestingModule();
      const coarse = mount(true).root.querySelector('.phaser-host')?.getAttribute('aria-label') ?? '';
      expect(coarse).toContain('Toca el suelo');
      expect(coarse).not.toMatch(/Flechas|A\/D|E para entrar/);
    });
  });

  describe('botón «Cómo se juega»', () => {
    it('es un botón DOM visible con nombre accesible igual al texto visible y cerrado al inicio', () => {
      const { root } = mount(false);
      const button = helpButton(root);
      expect(button?.textContent).toContain('Cómo se juega');
      expect(button?.hasAttribute('aria-label')).toBe(false);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(helpPanel(root)).toBeNull();
    });

    it('al pulsarlo abre un diálogo no modal con nombre y mueve el foco a «Cerrar ayuda»', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      const panel = helpPanel(root);
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('dialog');
      expect(panel?.getAttribute('aria-modal')).toBe('false');
      const title = root.querySelector(`#${panel?.getAttribute('aria-labelledby')}`);
      expect(title?.textContent).toContain('Cómo se juega');
      expect(helpButton(root)?.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Cerrar ayuda');
    });

    it('con teclado explica flechas y E; sin él, el toque y el botón «Entrar al caso»', () => {
      const fine = mount(false);
      helpButton(fine.root)!.click();
      fine.fixture.detectChanges();
      expect(helpPanel(fine.root)?.textContent).toMatch(/Flechas o A y D/);
      expect(helpPanel(fine.root)?.textContent).toMatch(/pulsa E/);
      TestBed.resetTestingModule();

      const coarse = mount(true);
      helpButton(coarse.root)!.click();
      coarse.fixture.detectChanges();
      const text = helpPanel(coarse.root)?.textContent ?? '';
      expect(text).toContain('Toca el suelo');
      expect(text).toContain('«Entrar al caso»');
      expect(text).not.toMatch(/Flechas|pulsa E|Espacio/);
    });

    it('promete solo lo que es cierto hoy: ninguna mención de salida segura ni de atajos que no existen', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      const text = helpPanel(root)?.textContent ?? '';
      expect(text).not.toMatch(/salida segura/i);
      expect(text).not.toMatch(/1 a 5/);
      expect(text).toContain('Ninguna opción está marcada como correcta');
    });

    it('Esc y «Cerrar ayuda» la cierran y devuelven el foco al botón', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      helpPanel(root)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(helpPanel(root)).toBeNull();
      expect(document.activeElement).toBe(helpButton(root));

      helpButton(root)!.click();
      fixture.detectChanges();
      root.querySelector<HTMLButtonElement>('#lobby-help button[aria-label="Cerrar ayuda"]')!.click();
      fixture.detectChanges();
      expect(helpPanel(root)).toBeNull();
    });

    it('no registra oyentes globales: el teclado se escucha solo dentro del panel', () => {
      const add = jest.spyOn(document, 'addEventListener');
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      expect(add.mock.calls.filter(([type]) => String(type).startsWith('key'))).toEqual([]);
      expect(source).not.toMatch(/HostListener\('document:/);
      add.mockRestore();
    });

    it('mide al menos 44 px de alto', () => {
      expect(source).toMatch(/\.menu-help-btn \{[^}]*min-height: 44px;/);
    });
  });
});
