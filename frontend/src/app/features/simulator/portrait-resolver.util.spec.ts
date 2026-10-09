import { existsSync } from 'fs';
import { join } from 'path';

import { testKitBundle } from '../character/kit/testing/kit-testing';
import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';

const bundle = testKitBundle();
const png = (path: string) => `/assets/characters/kit/${path}.png`;
const KIT_DIR = join(__dirname, '../../../assets/characters/kit');

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

describe('resolvePortraitAsset: solo retratos que existen y sin sonrisa en el duelo (T4.6, F§7.11)', () => {
  const GRIEVING = ['Abuela de la niña', 'Sobreviviente (22 años)'];
  const EMOTIONS = [
    'neutral', 'vulnerable', 'concerned', 'danger', 'positive', 'anxious', 'negative',
    'sad', 'relieved', 'calm', 'worried', 'receptive', 'closed', 'happy', 'alerta', '', 'algo-raro', null, undefined,
  ];

  it('todo retrato devuelto existe en frontend/src/assets/characters/kit/', () => {
    for (const speakerName of [...GRIEVING, 'Psicóloga hospitalaria', 'Funcionaria de recepción']) {
      for (const emotion of EMOTIONS) {
        const asset = resolvePortraitAsset(bundle, { speakerName, emotion });
        expect(asset).not.toBeNull();
        expect(existsSync(join(KIT_DIR, asset!.replace('/assets/characters/kit/', '')))).toBe(true);
      }
    }
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

