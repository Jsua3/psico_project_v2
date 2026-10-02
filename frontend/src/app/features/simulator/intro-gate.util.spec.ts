import { IntroGateContext, resolveIntroStep } from './intro-gate.util';

/** Contexto base: primer ingreso al nodo inicial, sin nada visto todavía. */
function ctx(overrides: Partial<IntroGateContext> = {}): IntroGateContext {
  return {
    attemptStatus: 'IN_PROGRESS',
    nodeKey: 'hospital-urgencias',
    mapKey: 'hospital-urgencias',
    consentGiven: false,
    introRead: false,
    reduceMotion: false,
    ...overrides,
  };
}

describe('intro-gate.util', () => {
  describe('resolveIntroStep', () => {
    it('sin consentimiento pide consentimiento antes que cualquier contenido', () => {
      expect(resolveIntroStep(ctx())).toBe('consent');
    });

    it('pide consentimiento incluso al reanudar a mitad de caso (otro nodo)', () => {
      expect(resolveIntroStep(ctx({ nodeKey: 'comisaria-recepcion', mapKey: 'comisaria-recepcion' })))
        .toBe('consent');
    });

    it('pide consentimiento aunque reduceMotion esté activo (nunca salta la puerta)', () => {
      expect(resolveIntroStep(ctx({ reduceMotion: true }))).toBe('consent');
    });

    it('pide consentimiento aunque la intro ya se haya leído en otra sesión', () => {
      expect(resolveIntroStep(ctx({ introRead: true }))).toBe('consent');
    });

    it('tras consentir muestra la escena animada en el nodo inicial', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true }))).toBe('scene');
    });

    it('tras consentir con reduceMotion muestra la narrativa (sin escena)', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true, reduceMotion: true }))).toBe('narrative');
    });

    it('tras consentir no repite la intro ya leída', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true, introRead: true }))).toBe('none');
    });

    it('tras consentir fuera del nodo inicial no muestra intro', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true, nodeKey: 'comisaria-recepcion' }))).toBe('none');
    });

    it('tras consentir con el mapa de otra sala no muestra intro', () => {
      expect(resolveIntroStep(ctx({ consentGiven: true, mapKey: 'hospital-pasillo' }))).toBe('none');
    });

    it('no muestra nada si el intento no está IN_PROGRESS', () => {
      expect(resolveIntroStep(ctx({ attemptStatus: 'COMPLETED' }))).toBe('none');
      expect(resolveIntroStep(ctx({ attemptStatus: 'SAFE_EXITED' }))).toBe('none');
      expect(resolveIntroStep(ctx({ attemptStatus: null }))).toBe('none');
    });
  });
});
