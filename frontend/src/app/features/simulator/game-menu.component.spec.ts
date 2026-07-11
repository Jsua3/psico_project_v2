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
import { EMPTY } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { CatalogItem } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { GameMenuComponent } from './game-menu.component';

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
