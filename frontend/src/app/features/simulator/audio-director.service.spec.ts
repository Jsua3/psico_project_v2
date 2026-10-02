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

describe('AudioDirectorService: pistas largas y silencio', () => {
  let service: AudioDirectorService;
  const howlOptions = () =>
    (Howl as unknown as jest.Mock).mock.calls.map(([options]) => options as { src: string[]; html5?: boolean });
  const howlFor = (src: string) => {
    const index = howlOptions().findIndex(options => options.src[0] === src);
    return (Howl as unknown as jest.Mock).mock.results[index].value;
  };

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    (Howl as unknown as jest.Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => service.dispose());

  it('la música del mapa y el tema de la intro se transmiten con HTML5', () => {
    service.playIntroLament();
    const long = howlOptions().filter(options => options.src[0].endsWith('.mp3'));
    expect(long.map(options => options.src[0])).toEqual([
      'assets/game/audio/Musica_PsicoGame.mp3',
      'assets/game/audio/PsicoLament.mp3',
    ]);
    for (const options of long) expect(options.html5).toBe(true);
  });

  it('los efectos cortos siguen en Web Audio', () => {
    const sfx = howlOptions().filter(options => options.src[0].endsWith('.ogg'));
    expect(sfx.length).toBeGreaterThan(0);
    for (const options of sfx) expect(options.html5).toBeUndefined();
  });

  it('silenciar la música también silencia el tema de la intro', () => {
    service.playIntroLament();
    const lament = howlFor('assets/game/audio/PsicoLament.mp3');
    service.setMusicMuted(true);
    expect(lament.mute).toHaveBeenLastCalledWith(true);
    service.setMusicMuted(false);
    expect(lament.mute).toHaveBeenLastCalledWith(false);
  });

  const STEM = 'assets/game/audio/Musica_PsicoGame.mp3';
  const lastOrder = (fn: jest.Mock) => fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];

  it('silenciar la música también silencia los stems, sin depender de volume', () => {
    const stem = howlFor(STEM);
    service.setMusicMuted(true);
    expect(stem.mute).toHaveBeenLastCalledWith(true);
    service.setMusicMuted(false);
    expect(stem.mute).toHaveBeenLastCalledWith(false);
  });

  it('al silenciar fija volume(0) antes de mute(true): en HTML5 volume() ignora un nodo silenciado', () => {
    const stem = howlFor(STEM);
    service.setMusicMuted(true);
    expect(stem.volume).toHaveBeenLastCalledWith(0);
    expect(lastOrder(stem.volume)).toBeLessThan(lastOrder(stem.mute));
  });

  it('al quitar el silencio, mute(false) llega antes del fundido que sigue', () => {
    jest.useFakeTimers();
    try {
      const stem = howlFor(STEM);
      service.setMusicMuted(true);
      service.setMusicMuted(false);
      service.setStressLevel(10);
      jest.advanceTimersByTime(20_000);
      expect(stem.volume).toHaveBeenLastCalledWith(0.42);
      expect(lastOrder(stem.mute)).toBeLessThan(lastOrder(stem.volume));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('AudioDirectorService: navegadores que ignoran el volumen de HTML5 (iOS)', () => {
  // HTML5_VOLUME_WORKS se evalúa al cargar el módulo: para simular otro navegador se vuelve a
  // cargar el servicio con el Audio que se quiere. @angular/core se comparte con TestBed porque
  // dos copias no compartirían el contexto de inyección.
  const angularCore = jest.requireActual('@angular/core');
  let service: AudioDirectorService | undefined;

  /** iOS/iPadOS: la asignación se ignora y volume siempre lee 1. */
  class AudioIos {
    get volume(): number { return 1; }
    set volume(_value: number) { /* iOS ignora la asignación */ }
  }
  class AudioQueRespetaVolume { volume = 1; }
  class AudioQueFalla { constructor() { throw new Error('Audio no disponible'); } }

  const loadServiceWithAudio = (audio: unknown) => {
    const original = window.Audio;
    Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: audio });
    jest.doMock('@angular/core', () => angularCore);
    try {
      let loaded!: { ServiceClass: typeof AudioDirectorService; HowlMock: jest.Mock };
      jest.isolateModules(() => {
        loaded = {
          ServiceClass: require('./audio-director.service').AudioDirectorService,
          HowlMock: require('howler').Howl,
        };
      });
      return loaded;
    } finally {
      jest.dontMock('@angular/core');
      Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: original });
    }
  };

  /** Opciones de los Howl de las pistas largas (los .mp3) tras iniciar el servicio y la intro. */
  const longTrackOptions = (audio: unknown) => {
    const { ServiceClass, HowlMock } = loadServiceWithAudio(audio);
    HowlMock.mockClear(); // el mock de howler se comparte con los demás describe
    service = TestBed.inject(ServiceClass);
    service.init();
    service.playIntroLament();
    return HowlMock.mock.calls
      .map(([options]) => options as { src: string[]; html5?: boolean })
      .filter(options => options.src[0].endsWith('.mp3'));
  };

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    service = undefined;
    TestBed.resetTestingModule();
  });

  afterEach(() => service?.dispose());

  it('donde Audio respeta volume, las pistas largas usan HTML5', () => {
    const long = longTrackOptions(AudioQueRespetaVolume);
    expect(long).toHaveLength(2);
    for (const options of long) expect(options.html5).toBe(true);
  });

  it('en iOS (Audio ignora volume) las pistas largas se quedan en Web Audio', () => {
    const long = longTrackOptions(AudioIos);
    expect(long.map(options => options.src[0])).toEqual([
      'assets/game/audio/Musica_PsicoGame.mp3',
      'assets/game/audio/PsicoLament.mp3',
    ]);
    for (const options of long) expect(options.html5).toBe(false);
  });

  it('si Audio no se puede crear, las pistas largas tampoco usan HTML5', () => {
    const long = longTrackOptions(AudioQueFalla);
    expect(long).toHaveLength(2);
    for (const options of long) expect(options.html5).toBe(false);
  });
});
