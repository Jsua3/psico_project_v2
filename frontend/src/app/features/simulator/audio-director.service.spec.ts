import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Howl } from 'howler';
import { AudioDirectorService } from './audio-director.service';
import { FADE_EPSILON, FADE_SPEED, fadeStep } from './audio-fade.util';

jest.mock('howler', () => ({
  Howl: jest.fn().mockImplementation(() => ({
    volume: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    unload: jest.fn(),
    mute: jest.fn(),
    playing: jest.fn(() => false),
  })),
  Howler: { volume: jest.fn() },
}));

describe('fadeStep', () => {
  it('recorre una fracción fija de la distancia al objetivo', () => {
    expect(fadeStep(0, 1)).toBeCloseTo(FADE_SPEED);
    expect(fadeStep(1, 0)).toBeCloseTo(1 - FADE_SPEED);
  });

  it('fija el objetivo cuando ya está a menos de FADE_EPSILON', () => {
    expect(fadeStep(0.5, 0.5 + FADE_EPSILON / 2)).toBe(0.5 + FADE_EPSILON / 2);
    expect(fadeStep(0.3, 0.3)).toBe(0.3);
  });
});

describe('AudioDirectorService: bucle de fundido', () => {
  let service: AudioDirectorService;
  /** El primer Howl que crea init() es el stem 'ambient'. */
  const ambientHowl = () => (Howl as unknown as jest.Mock).mock.results[0].value;

  beforeAll(() => {
    // jsdom no implementa matchMedia; el servicio lo lee al construirse.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    (Howl as unknown as jest.Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => {
    service.dispose();
    jest.useRealTimers();
  });

  it('init no deja ningún temporizador corriendo', () => {
    expect(jest.getTimerCount()).toBe(0);
  });

  it('arranca fuera de la zona de Angular al fijar un objetivo', () => {
    const outside = jest.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    service.setStressLevel(10);
    expect(outside).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);
  });

  it('se detiene solo al llegar al volumen objetivo', () => {
    service.setStressLevel(10);
    jest.advanceTimersByTime(20_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0.42);
  });

  it('vuelve a arrancar después de stopAll', () => {
    service.setStressLevel(10);
    service.stopAll();
    expect(jest.getTimerCount()).toBe(0);
    service.setStressLevel(70);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('silenciar la música corta el volumen y termina el fundido', () => {
    service.setStressLevel(10);
    jest.advanceTimersByTime(1_000);
    service.setMusicMuted(true);
    jest.advanceTimersByTime(100);
    expect(jest.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0);
  });
});
