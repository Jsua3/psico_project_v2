/**
 * AvatarConfig para Phaser — shape plana que map a texture-keys de sprite sheets.
 *
 * Esta interfaz es independiente de la AvatarConfig de avatar.model.ts (usada en el editor
 * Angular). Se guarda en localStorage bajo AVATAR_STORAGE_KEY y se lee en preload() de
 * DataDrivenWorldScene para construir el AvatarRenderer multicapa.
 */
export interface AvatarConfig {
  skinTone: 'light' | 'medium' | 'dark' | 'dark2';
  eyeType: number;    // 0-7
  browType: number;   // 0-5
  mouthType: number;  // 0-5
  hairStyle: number;  // 0-9
  hairColor: number;  // 0-7
  uniformType: 'clinic_white' | 'clinic_blue' | 'casual';
  labcoat: boolean;
  accessory: 'none' | 'glasses' | 'stethoscope' | 'badge';
}

export const AVATAR_STORAGE_KEY = 'siep_avatar_config';

export function loadAvatarConfig(): AvatarConfig {
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (!raw) return getDefaultAvatarConfig();
    try { return JSON.parse(raw) as AvatarConfig; } catch { return getDefaultAvatarConfig(); }
  } catch {
    // localStorage may be unavailable (SSR / private browsing)
    return getDefaultAvatarConfig();
  }
}

export function saveAvatarConfig(cfg: AvatarConfig): void {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Quota exceeded or storage unavailable — silently ignore
  }
}

function getDefaultAvatarConfig(): AvatarConfig {
  return {
    skinTone: 'medium', eyeType: 0, browType: 0, mouthType: 0,
    hairStyle: 0, hairColor: 0, uniformType: 'clinic_white',
    labcoat: true, accessory: 'none',
  };
}
