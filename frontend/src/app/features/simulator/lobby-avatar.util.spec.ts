import { defaultAvatar } from '../character/avatar-config.util';
import {
  LOBBY_MODULAR_TEXTURE_KEY,
  lobbyAvatarPlan,
  lobbyPose,
  lobbyTextureChain,
  nearestLobbyDoor,
} from './lobby-avatar.util';

describe('lobby-avatar.util', () => {
  describe('lobbyAvatarPlan', () => {
    it('castId válido → plan de elenco con textura y asset correctos', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: 'david' });
      expect(plan.kind).toBe('cast');
      if (plan.kind === 'cast') {
        expect(plan.textureKey).toBe('cast-david');
        expect(plan.assetPath).toBe('/assets/characters/cast/david.png');
        expect(plan.modularSpecs.length).toBeGreaterThan(0);
      }
    });

    it('castId inválido → fallback modular', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: 'no-existe' });
      expect(plan.kind).toBe('modular');
      expect(plan.modularSpecs.length).toBeGreaterThan(0);
    });

    it('sin castId → fallback modular (avatar clásico)', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: undefined });
      expect(plan.kind).toBe('modular');
    });
  });

  describe('lobbyTextureChain', () => {
    it('con elenco intenta primero la hoja horneada y luego el modular (asset ausente)', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: 'valentina' });
      expect(lobbyTextureChain(plan)).toEqual(['cast-valentina', LOBBY_MODULAR_TEXTURE_KEY]);
    });

    it('modular solo tiene el compuesto como candidato', () => {
      const plan = lobbyAvatarPlan({ ...defaultAvatar(), castId: undefined });
      expect(lobbyTextureChain(plan)).toEqual([LOBBY_MODULAR_TEXTURE_KEY]);
    });
  });

  describe('lobbyPose', () => {
    it('camina a la derecha sin flip; a la izquierda con flip (espejo)', () => {
      expect(lobbyPose(1, false)).toMatchObject({ walking: true, flipX: false });
      expect(lobbyPose(-1, false)).toMatchObject({ walking: true, flipX: true });
    });

    it('parado no anima y conserva el rumbo (flip null), con idle lateral', () => {
      const pose = lobbyPose(0, false);
      expect(pose.walking).toBe(false);
      expect(pose.flipX).toBeNull();
      expect(pose.idleFrame).toBe(3);
    });

    it('reduced motion nunca anima aunque se mueva, pero sí actualiza el flip', () => {
      const pose = lobbyPose(-1, true);
      expect(pose.walking).toBe(false);
      expect(pose.flipX).toBe(true);
    });
  });

  describe('nearestLobbyDoor', () => {
    const doors = [{ x: 220, id: 'a' }, { x: 480, id: 'b' }];

    it('devuelve la puerta dentro del radio', () => {
      expect(nearestLobbyDoor(doors, 250)?.id).toBe('a');
    });

    it('lejos de todas devuelve null (E lejano no navega)', () => {
      expect(nearestLobbyDoor(doors, 350)).toBeNull();
    });

    it('con radio explícito respeta el umbral exacto', () => {
      expect(nearestLobbyDoor(doors, 290, 70)?.id).toBe('a');
      expect(nearestLobbyDoor(doors, 291, 70)).toBeNull();
    });
  });
});
