import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';

const P = '/assets/characters/portraits';
const PORTRAIT_DIR = join(__dirname, '../../../assets/characters/portraits');

describe('resolvePortraitAsset', () => {
  it('la sobreviviente (escucha-segura) con emoción vulnerable → retrato worried', () => {
    expect(resolvePortraitAsset('escucha-segura', 'vulnerable'))
      .toBe(`${P}/paciente-vbg_worried.png`);
  });

  it('resuelve por speakerName cuando portraitKey es nulo', () => {
    expect(resolvePortraitAsset(null, 'neutral', 'Sobreviviente (22 años)'))
      .toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Abuela de la niña'))
      .toBe(`${P}/madre-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Funcionaria de recepción'))
      .toBe(`${P}/funcionaria-recepcion_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Psicóloga hospitalaria'))
      .toBe(`${P}/psicologa-hospitalaria_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Profesional psicosocial'))
      .toBe(`${P}/comisaria-profesional_neutral.png`);
  });

  it('los NPC neutral-only (funcionaria/comisaría) siempre usan neutral', () => {
    expect(resolvePortraitAsset(null, 'positive', 'Funcionaria de recepción'))
      .toBe(`${P}/funcionaria-recepcion_neutral.png`);
    expect(resolvePortraitAsset(null, 'concerned', 'Profesional psicosocial'))
      .toBe(`${P}/comisaria-profesional_neutral.png`);
  });

  it('variantes emocionales: concerned → worried (Abuela) y positive → happy solo para la Psicóloga', () => {
    expect(resolvePortraitAsset(null, 'concerned', 'Abuela de la niña'))
      .toBe(`${P}/madre-vbg_worried.png`);
    expect(resolvePortraitAsset(null, 'positive', 'Psicóloga hospitalaria'))
      .toBe(`${P}/psicologa-hospitalaria_happy.png`);
  });

  it('portraitKey tiene prioridad sobre speakerName', () => {
    expect(resolvePortraitAsset('escucha-segura', 'neutral', 'Abuela de la niña'))
      .toBe(`${P}/paciente-vbg_neutral.png`);
  });

  it('mapea danger → sad y concerned → worried (robustez)', () => {
    expect(resolvePortraitAsset('escucha-segura', 'danger')).toBe(`${P}/paciente-vbg_sad.png`);
    expect(resolvePortraitAsset('escucha-segura', 'concerned')).toBe(`${P}/paciente-vbg_worried.png`);
  });

  it('emoción nula o desconocida → neutral', () => {
    expect(resolvePortraitAsset('escucha-segura', null)).toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset('escucha-segura', 'algo-raro')).toBe(`${P}/paciente-vbg_neutral.png`);
  });

  it('devuelve null (fallback SVG) para un NPC/objeto sin retrato', () => {
    expect(resolvePortraitAsset('ruta-vbg', 'neutral', 'Ruta institucional')).toBeNull();
    expect(resolvePortraitAsset('contacto-agresor', 'alerta', 'Alerta de riesgo')).toBeNull();
    expect(resolvePortraitAsset(null, 'neutral', 'Objeto del entorno')).toBeNull();
    expect(resolvePortraitAsset(null, 'neutral', null)).toBeNull();
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

