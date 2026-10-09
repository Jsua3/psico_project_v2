import { testKitBundle } from '../character/kit/testing/kit-testing';
import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';

const bundle = testKitBundle();
const png = (path: string) => `/assets/characters/kit/${path}.png`;

describe('resolvePortraitAsset (kit)', () => {
  it.each([
    ['hablante del seed', { speakerName: 'Abuela de la niña', emotion: 'neutral' }, png('abuela-familia/portrait-neutral')],
    ['la emoción vulnerable es preocupada', { speakerName: 'Sobreviviente (22 años)', emotion: 'vulnerable' }, png('sobreviviente/portrait-preocupada')],
    ['un portraitKey legado', { portraitKey: 'escucha-segura', emotion: 'danger' }, png('sobreviviente/portrait-triste')],
    ['una voz sin cuerpo no tiene retrato', { speakerName: 'Supervisión clínica', emotion: 'danger' }, null],
    ['un NPC de escenario que se llama como una voz', { recipeId: 'supervisor-clinico', speakerName: 'Supervisión clínica', emotion: 'positive' }, png('supervisor-clinico/portrait-alegre')],
    ['un hablante desconocido', { speakerName: 'Nadie' }, null],
  ])('%s', (_name, keys, expected) => {
    expect(resolvePortraitAsset(bundle, keys)).toBe(expected);
  });

  it('sin paquete del kit todavía, la silueta', () => {
    expect(resolvePortraitAsset(null, { speakerName: 'Abuela de la niña' })).toBeNull();
  });
});

describe('resolvePortraitAsset: solo assets que existen y sin sonrisa en el duelo (T4.6, F§7.11)', () => {
  const SPEAKERS: Array<[string, string | null, string | null]> = [
    ['Abuela', null, 'Abuela de la niña'],
    ['Consultante', null, 'Consultante'],
    ['Sobreviviente', null, 'Sobreviviente (22 años)'],
    ['Psicóloga', null, 'Psicóloga hospitalaria'],
    ['Funcionaria', null, 'Funcionaria de recepción'],
    ['Profesional', null, 'Profesional psicosocial'],
    ['escucha-segura', 'escucha-segura', null],
    ['sobreviviente-consulta', 'sobreviviente-consulta', null],
  ];
  const EMOTIONS = [
    'neutral', 'vulnerable', 'concerned', 'danger', 'positive', 'anxious', 'negative',
    'sad', 'relieved', 'calm', 'happy', 'alerta', '', 'algo-raro', null, undefined,
  ];

  it('todo retrato devuelto existe en frontend/src/assets/characters/portraits/', () => {
    const onDisk = new Set(readdirSync(PORTRAIT_DIR));
    for (const [, key, name] of SPEAKERS) {
      for (const emotion of EMOTIONS) {
        const asset = resolvePortraitAsset(key, emotion as string | null | undefined, name);
        expect(asset).not.toBeNull();
        const file = asset!.replace(`${P}/`, '');
        expect(onDisk.has(file)).toBe(true);
        expect(existsSync(join(PORTRAIT_DIR, file))).toBe(true);
      }
    }
  });

  it('alias de F§7.11: anxious → worried, negative → sad, sad → sad, relieved y calm → neutral', () => {
    expect(resolvePortraitAsset('escucha-segura', 'anxious')).toBe(`${P}/paciente-vbg_worried.png`);
    expect(resolvePortraitAsset('escucha-segura', 'negative')).toBe(`${P}/paciente-vbg_sad.png`);
    expect(resolvePortraitAsset('escucha-segura', 'sad')).toBe(`${P}/paciente-vbg_sad.png`);
    expect(resolvePortraitAsset('escucha-segura', 'relieved')).toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset('escucha-segura', 'calm')).toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'anxious', 'Abuela de la niña')).toBe(`${P}/madre-vbg_worried.png`);
  });

  it('cae a neutral cuando el personaje no tiene esa variante (no existe madre-vbg_sad ni psicologa_worried)', () => {
    expect(resolvePortraitAsset(null, 'danger', 'Abuela de la niña')).toBe(`${P}/madre-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'negative', 'Abuela de la niña')).toBe(`${P}/madre-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'concerned', 'Psicóloga hospitalaria')).toBe(`${P}/psicologa-hospitalaria_neutral.png`);
    expect(resolvePortraitAsset(null, 'sad', 'Psicóloga hospitalaria')).toBe(`${P}/psicologa-hospitalaria_neutral.png`);
  });

  it('positive nunca sonríe a la Abuela ni a la Consultante (límite 2: sin sonrisa en el duelo)', () => {
    for (const emotion of ['positive', 'happy']) {
      expect(resolvePortraitAsset(null, emotion, 'Abuela de la niña')).toBe(`${P}/madre-vbg_neutral.png`);
      expect(resolvePortraitAsset(null, emotion, 'Consultante')).toBe(`${P}/paciente-vbg_neutral.png`);
      expect(resolvePortraitAsset('escucha-segura', emotion)).toBe(`${P}/paciente-vbg_neutral.png`);
      expect(resolvePortraitAsset('sobreviviente-consulta', emotion)).toBe(`${P}/paciente-vbg_neutral.png`);
    }
    // Ningún resultado posible para madre-vbg ni paciente-vbg es una variante «happy».
    for (const [, key, name] of SPEAKERS) {
      for (const emotion of EMOTIONS) {
        const asset = resolvePortraitAsset(key, emotion as string | null | undefined, name);
        if (/madre-vbg|paciente-vbg/.test(asset ?? '')) expect(asset).not.toMatch(/_happy\./);
      }
    }
  });

  it('la sonrisa de la Psicóloga hospitalaria (positive → happy) se conserva', () => {
    expect(resolvePortraitAsset(null, 'positive', 'Psicóloga hospitalaria')).toBe(`${P}/psicologa-hospitalaria_happy.png`);
  });
});

describe('isSystemVoice: solo las voces del sistema conservan la señal de emoción (T4.6)', () => {
  it('Supervisión clínica, Criterio profesional y Herramienta profesional son voces de sistema', () => {
    expect(isSystemVoice('Supervisión clínica')).toBe(true);
    expect(isSystemVoice('Criterio profesional')).toBe(true);
    expect(isSystemVoice('Herramienta profesional')).toBe(true);
    expect(isSystemVoice('Intervención')).toBe(true);
    expect(isSystemVoice('')).toBe(true);
    expect(isSystemVoice(null)).toBe(true);
  });

  it('las personas (con o sin retrato) no son voces de sistema', () => {
    for (const person of ['Abuela de la niña', 'Consultante', 'Enfermera de urgencias', 'Psicóloga hospitalaria', 'Profesional psicosocial']) {
      expect(isSystemVoice(person)).toBe(false);
    }
  });
});

