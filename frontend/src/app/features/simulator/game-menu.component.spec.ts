// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta). Solo se evalúa
// `extends Phaser.Scene` al cargar el módulo; estos tests de instancia nunca
// arrancan la escena (boot() requiere el template, que ts-jest no renderiza).
vi.mock('phaser', () => ({
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

import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EMPTY } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { GameHelpComponent } from './game-help.component';
import { GameMenuComponent, lobbyKeyboardHint } from './game-menu.component';
import { ORIENTATION_COPY, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';
import type { Mock } from 'vitest';

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
  let router: { navigate: Mock };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GameMenuComponent],
      providers: [
        { provide: SimulationService, useValue: { getCatalog: vi.fn(() => EMPTY) } },
        { provide: Router, useValue: router },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
      ],
    });
    component = TestBed.createComponent(GameMenuComponent).componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('una puerta disponible navega exactamente UNA vez', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    expect(component.entering()).toBe('Caso demo');
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/portal/simulador', 7]);
  });

  it('una puerta bloqueada nunca navega', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enter(7);
    expect(component.entering()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('dobles entradas durante la transición no duplican la navegación', () => {
    component.catalog.set([makeItem()]);
    component.enter(7);
    component.enter(7); // E + click casi simultáneos
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused (tecla E DOM) entra a la puerta enfocada disponible', () => {
    component.catalog.set([makeItem()]);
    component.focused.set(makeItem());
    const event = new KeyboardEvent('keydown', { key: 'e', cancelable: true });
    component.enterFocused(event);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('enterFocused no hace nada sin puerta cerca o con puerta bloqueada', () => {
    component.catalog.set([makeItem({ unlocked: false })]);
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e' }));
    component.focused.set(makeItem({ unlocked: false }));
    component.enterFocused(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
    vi.advanceTimersByTime(1000);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

/** Doble de la pantalla de ayuda: ts-jest no compila las entradas con `input()` del componente real. */
@Component({
  selector: 'app-game-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<button type="button" class="stub-close" (click)="closed.emit()">Cerrar ayuda</button>',
})
class GameHelpStubComponent {
  @Input() view = 'card';
  @Input() modality = 'keyboard';
  @Input() compact = false;
  @Input() safeExitPromise = false;
  @Output() closed = new EventEmitter<void>();
}

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
        { provide: SimulationService, useValue: { getCatalog: vi.fn(() => EMPTY) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
      ],
    });
    TestBed.overrideComponent(GameMenuComponent, {
      remove: { imports: [GameHelpComponent] },
      add: { imports: [GameHelpStubComponent] },
    });
    const fixture = TestBed.createComponent(GameMenuComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router) as unknown as { navigate: Mock };
    return { fixture, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, router };
  }

  const helpButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.menu-help-btn');
  const helpLayer = (root: HTMLElement) => root.querySelector<HTMLElement>('.menu-help-layer');
  const helpStub = (fixture: ComponentFixture<GameMenuComponent>): GameHelpStubComponent | undefined =>
    fixture.debugElement.query(By.directive(GameHelpStubComponent))?.componentInstance;

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
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
      expect(button?.textContent).toContain(ORIENTATION_COPY.ui.helpTitle);
      expect(button?.hasAttribute('aria-label')).toBe(false);
      expect(button?.getAttribute('aria-expanded')).toBe('false');
      expect(helpLayer(root)).toBeNull();
    });

    it('al pulsarlo abre la pantalla «Cómo se juega» del juego (view=screen) con la modalidad de puntero', () => {
      for (const [coarse, modality] of [[false, 'keyboard'], [true, 'touch']] as const) {
        const { fixture, root } = mount(coarse);
        helpButton(root)!.click();
        fixture.detectChanges();
        expect(helpLayer(root)).not.toBeNull();
        const help = helpStub(fixture);
        expect(help?.view).toBe('screen');
        expect(help?.modality).toBe(modality);
        expect(help?.safeExitPromise).toBe(SAFE_EXIT_ALWAYS_REACHABLE);
        expect(helpButton(root)?.getAttribute('aria-expanded')).toBe('true');
        TestBed.resetTestingModule();
      }
    });

    it('«Cerrar ayuda» (closed) la cierra y devuelve el foco al botón', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      root.querySelector<HTMLButtonElement>('.stub-close')!.click();
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();
      expect(document.activeElement).toBe(helpButton(root));
    });

    it('Esc la cierra y un toque en la capa también, pero no uno dentro de la pantalla', () => {
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      root.querySelector('.stub-close')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();

      helpButton(root)!.click();
      fixture.detectChanges();
      helpStub(fixture); // la pantalla sigue abierta
      root.querySelector('app-game-help')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).not.toBeNull();
      helpLayer(root)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(helpLayer(root)).toBeNull();
    });

    it('con la ayuda abierta la E del juego no entra al caso (quien lee no debe ser llevado)', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const { fixture, component, root, router } = mount(false);
      component.catalog.set([catalogItem]);
      helpButton(root)!.click();
      fixture.detectChanges();
      component.enter(7);
      component.focused.set(catalogItem);
      component.enterFocused(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
      vi.advanceTimersByTime(2000);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.entering()).toBe('');

      component.closeHelp();
      component.enter(7);
      vi.advanceTimersByTime(2000);
      expect(router.navigate).toHaveBeenCalledTimes(1);
    });

    it('no escribe copy propio: el texto sale de app-game-help y la bandera de salida segura es la del juego', () => {
      expect(source).toContain('<app-game-help view="screen"');
      expect(source).toContain("import { SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';");
      expect(source).not.toMatch(/Acércate a una puerta|Toca el suelo para caminar hasta ese punto/);
    });

    it('no registra oyentes globales: el teclado se escucha solo dentro de la capa de ayuda', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const { fixture, root } = mount(false);
      helpButton(root)!.click();
      fixture.detectChanges();
      expect(add.mock.calls.filter(([type]) => String(type).startsWith('key'))).toEqual([]);
      expect(source).not.toMatch(/HostListener\('document:/);
      add.mockRestore();
    });

    it('la capa cubre el lobby y el botón mide al menos 44 px de alto', () => {
      expect(source).toMatch(/\.menu-help-layer \{\s*position: absolute; inset: 0;/);
      expect(source).toMatch(/\.menu-help-btn \{[^}]*min-height: 44px;/);
    });
  });
});
