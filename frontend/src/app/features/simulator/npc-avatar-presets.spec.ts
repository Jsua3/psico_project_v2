import { coerceAvatar, isValidAvatar } from '../character/avatar-config.util';
import {
  MAP_OBJECT_PRESETS,
  NPC_AVATAR_PRESETS,
  NPC_PRESET_RENDER,
  npcPresetConfig,
  npcPresetRender,
} from './npc-avatar-presets';
import { NpcAvatarPresetKey } from '../../core/models/simulation.model';

const PRESET_KEYS = Object.keys(NPC_AVATAR_PRESETS) as NpcAvatarPresetKey[];

describe('npc-avatar-presets', () => {
  it('cubre los presets del caso competitivo + caso PDF', () => {
    expect(PRESET_KEYS.sort()).toEqual([
      'adolescente-nna', 'colega-clinica', 'comisaria-profesional',
      'funcionaria-recepcion', 'madre-vbg', 'paciente-vbg',
      'psicologa-hospitalaria', 'seguridad', 'supervisor-clinico',
    ]);
  });

  it('cada preset es un AvatarConfig 100% real (sin opciones inventadas)', () => {
    for (const key of PRESET_KEYS) {
      const preset = NPC_AVATAR_PRESETS[key];
      expect(isValidAvatar(preset)).toBe(true);
      // coerceAvatar no debe corregir nada: todos los ids existen en los helpers
      expect(coerceAvatar(preset)).toEqual(preset);
    }
  });

  it('escalas dentro del rango del spec: adultos 0.78-0.85, adolescente 0.70-0.76', () => {
    for (const key of PRESET_KEYS) {
      const { scale } = NPC_PRESET_RENDER[key];
      if (key === 'adolescente-nna') {
        expect(scale).toBeGreaterThanOrEqual(0.70);
        expect(scale).toBeLessThanOrEqual(0.76);
      } else {
        expect(scale).toBeGreaterThanOrEqual(0.78);
        expect(scale).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it('lookups seguros y mapeo de markers PERSON a presets existentes', () => {
    expect(npcPresetConfig('madre-vbg')).toBe(NPC_AVATAR_PRESETS['madre-vbg']);
    expect(npcPresetConfig(undefined)).toBeNull();
    expect(npcPresetRender('seguridad').scale).toBeGreaterThan(0);
    for (const preset of Object.values(MAP_OBJECT_PRESETS)) {
      expect(NPC_AVATAR_PRESETS[preset]).toBeDefined();
    }
    expect(MAP_OBJECT_PRESETS['escucha-segura']).toBe('paciente-vbg');
    // Caso PDF: actores de decisión renderizados con preset modular.
    expect(MAP_OBJECT_PRESETS['familia-duelo']).toBe('madre-vbg');
    expect(MAP_OBJECT_PRESETS['sobreviviente-consulta']).toBe('paciente-vbg');
    expect(MAP_OBJECT_PRESETS['profesional-psicosocial']).toBe('comisaria-profesional');
  });
});
