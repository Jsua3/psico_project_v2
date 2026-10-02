import type { CharacterManifestV1 } from './character-manifest.model';
import { resolveActorRenderPlan } from './actor-render-plan.util';
import {
  deepFreeze,
  defaultCharacterSelection,
  resolveAvatarRenderPlan,
} from './avatar-render-plan.util';
import { resolveNarrativePortraitState } from './clinical-emotion-portrait.util';

const manifest: CharacterManifestV1 = {
  schemaVersion: 1,
  manifestVersion: '1.0.0',
  manifestHash: 'a'.repeat(64),
  defaultCharacterId: 'valentina',
  logicalFrame: { width: 48, height: 72 },
  consequenceReactions: {
    relief: { animationId: 'reactRelief', portraitState: 'relief' },
    steady: { animationId: 'reactSteady', portraitState: 'steady' },
    tension: { animationId: 'reactTension', portraitState: 'tension' },
    rupture: { animationId: 'reactRupture', portraitState: 'rupture' },
  },
  clinicalEmotionPortraitStates: {
    neutral: 'neutral',
    positive: 'relieved',
    negative: 'concerned',
    anxious: 'concerned',
    danger: 'concerned',
    sad: 'concerned',
    worried: 'concerned',
    concerned: 'concerned',
    relieved: 'relieved',
    receptive: 'relief',
    calm: 'steady',
    closed: 'rupture',
  },
  palettes: [{
    paletteId: 'siep-master-v1',
    src: '/assets/characters/v1/palette.v1.json',
    sha256: 'c'.repeat(64),
  }],
  identities: [{
    characterId: 'valentina',
    displayName: 'Valentina',
    summary: 'Psicóloga en formación',
    provenance: {
      source: 'SIEP cast remaster',
      license: 'SIEP-INTERNAL',
      sourceAsset: 'cast/valentina.png',
    },
    variants: [{
      variantId: 'base',
      contentHash: 'b'.repeat(64),
      paletteId: 'siep-master-v1',
      paletteHash: 'c'.repeat(64),
      logicalScale: 1,
      pivot: { x: 24, y: 68 },
      feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
      shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 },
      sheets: {
        idle: {
          id: 'idle',
          src: '/assets/characters/v1/valentina/base/idle.png',
          width: 192,
          height: 288,
          frameWidth: 48,
          frameHeight: 72,
          columns: 4,
          rows: 4,
          sha256: '1'.repeat(64),
        },
        walk: {
          id: 'walk',
          src: '/assets/characters/v1/valentina/base/walk.png',
          width: 288,
          height: 288,
          frameWidth: 48,
          frameHeight: 72,
          columns: 6,
          rows: 4,
          sha256: '2'.repeat(64),
        },
        talk: {
          id: 'talk',
          src: '/assets/characters/v1/valentina/base/talk.png',
          width: 192,
          height: 288,
          frameWidth: 48,
          frameHeight: 72,
          columns: 4,
          rows: 4,
          sha256: '3'.repeat(64),
        },
        interact: {
          id: 'interact',
          src: '/assets/characters/v1/valentina/base/interact.png',
          width: 192,
          height: 288,
          frameWidth: 48,
          frameHeight: 72,
          columns: 4,
          rows: 4,
          sha256: '4'.repeat(64),
        },
        turn: {
          id: 'turn',
          src: '/assets/characters/v1/valentina/base/turn.png',
          width: 144,
          height: 288,
          frameWidth: 48,
          frameHeight: 72,
          columns: 3,
          rows: 4,
          sha256: '5'.repeat(64),
        },
        react: {
          id: 'react',
          src: '/assets/characters/v1/valentina/base/react.png',
          width: 192,
          height: 1152,
          frameWidth: 48,
          frameHeight: 72,
          columns: 4,
          rows: 16,
          sha256: '6'.repeat(64),
        },
      },
      animations: {
        idle: {
          id: 'idle',
          sheetId: 'idle',
          fps: 4,
          loop: true,
          directions: {
            down: [0, 1, 2, 3],
            left: [4, 5, 6, 7],
            right: [8, 9, 10, 11],
            up: [12, 13, 14, 15],
          },
        },
        walk: {
          id: 'walk',
          sheetId: 'walk',
          fps: 10,
          loop: true,
          directions: {
            down: [0, 1, 2, 3, 4, 5],
            left: [6, 7, 8, 9, 10, 11],
            right: [12, 13, 14, 15, 16, 17],
            up: [18, 19, 20, 21, 22, 23],
          },
          contactSequenceIndices: [0, 3],
        },
        talk: {
          id: 'talk',
          sheetId: 'talk',
          fps: 7,
          loop: true,
          directions: {
            down: [0, 1, 2, 3],
            left: [4, 5, 6, 7],
            right: [8, 9, 10, 11],
            up: [12, 13, 14, 15],
          },
        },
        interact: {
          id: 'interact',
          sheetId: 'interact',
          fps: 8,
          loop: false,
          directions: {
            down: [0, 1, 2, 3],
            left: [4, 5, 6, 7],
            right: [8, 9, 10, 11],
            up: [12, 13, 14, 15],
          },
        },
        turn: {
          id: 'turn',
          sheetId: 'turn',
          fps: 12,
          loop: false,
          directions: {
            down: [0, 1, 2],
            left: [3, 4, 5],
            right: [6, 7, 8],
            up: [9, 10, 11],
          },
        },
        reactRelief: {
          id: 'reactRelief',
          sheetId: 'react',
          fps: 7,
          loop: false,
          directions: {
            down: [0, 1, 2, 3],
            left: [4, 5, 6, 7],
            right: [8, 9, 10, 11],
            up: [12, 13, 14, 15],
          },
        },
        reactSteady: {
          id: 'reactSteady',
          sheetId: 'react',
          fps: 7,
          loop: false,
          directions: {
            down: [16, 17, 18, 19],
            left: [20, 21, 22, 23],
            right: [24, 25, 26, 27],
            up: [28, 29, 30, 31],
          },
        },
        reactTension: {
          id: 'reactTension',
          sheetId: 'react',
          fps: 7,
          loop: false,
          directions: {
            down: [32, 33, 34, 35],
            left: [36, 37, 38, 39],
            right: [40, 41, 42, 43],
            up: [44, 45, 46, 47],
          },
        },
        reactRupture: {
          id: 'reactRupture',
          sheetId: 'react',
          fps: 7,
          loop: false,
          directions: {
            down: [48, 49, 50, 51],
            left: [52, 53, 54, 55],
            right: [56, 57, 58, 59],
            up: [60, 61, 62, 63],
          },
        },
      },
      portrait: {
        sheet: {
          id: 'portrait',
          src: '/assets/characters/v1/valentina/base/portrait.png',
          width: 384,
          height: 768,
          frameWidth: 96,
          frameHeight: 96,
          columns: 4,
          rows: 8,
          sha256: '7'.repeat(64),
        },
        fps: 6,
        states: {
          neutral: [0, 1, 2, 3],
          focused: [4, 5, 6, 7],
          concerned: [8, 9, 10, 11],
          relieved: [12, 13, 14, 15],
          relief: [16, 17, 18, 19],
          steady: [20, 21, 22, 23],
          tension: [24, 25, 26, 27],
          rupture: [28, 29, 30, 31],
        },
      },
    }],
  }],
  actorVisuals: [],
  actorMappings: {},
};

const EXPECTED_CLINICAL_EMOTION_STATES = [
  ['neutral', 'neutral'],
  ['positive', 'relieved'],
  ['negative', 'concerned'],
  ['anxious', 'concerned'],
  ['danger', 'concerned'],
  ['sad', 'concerned'],
  ['worried', 'concerned'],
  ['concerned', 'concerned'],
  ['relieved', 'relieved'],
  ['receptive', 'relief'],
  ['calm', 'steady'],
  ['closed', 'rupture'],
] as const;

describe('resolveAvatarRenderPlan', () => {
  it('resolves the default while preserving authored hashes, directions, and geometry', () => {
    const authoredVariant = manifest.identities[0].variants[0];
    const serializedManifest = JSON.stringify(manifest);
    const manifestFreezeState = () => ({
      logicalFrame: Object.isFrozen(manifest.logicalFrame),
      pivot: Object.isFrozen(authoredVariant.pivot),
      feetHitbox: Object.isFrozen(authoredVariant.feetHitbox),
      shadow: Object.isFrozen(authoredVariant.shadow),
      animations: Object.isFrozen(authoredVariant.animations),
      walkRightFrames: Object.isFrozen(authoredVariant.animations.walk.directions.right),
      portraitStates: Object.isFrozen(authoredVariant.portrait.states),
      neutralPortraitFrames: Object.isFrozen(authoredVariant.portrait.states.neutral),
      ruptureReaction: Object.isFrozen(manifest.consequenceReactions.rupture),
    });
    const expectedUnfrozenManifestState = {
      logicalFrame: false,
      pivot: false,
      feetHitbox: false,
      shadow: false,
      animations: false,
      walkRightFrames: false,
      portraitStates: false,
      neutralPortraitFrames: false,
      ruptureReaction: false,
    };
    expect(manifestFreezeState()).toEqual(expectedUnfrozenManifestState);
    expect(manifest.clinicalEmotionPortraitStates).toEqual(
      Object.fromEntries(EXPECTED_CLINICAL_EMOTION_STATES),
    );

    const selection = defaultCharacterSelection(manifest);
    const plan = resolveAvatarRenderPlan(manifest, selection);

    expect(selection).toEqual({
      schemaVersion: 1,
      manifestVersion: '1.0.0',
      characterId: 'valentina',
      variantId: 'base',
      contentHash: 'b'.repeat(64),
    });
    expect(plan.schemaVersion).toBe(1);
    expect(plan.manifestVersion).toBe('1.0.0');
    expect(plan.characterId).toBe('valentina');
    expect(plan.variantId).toBe('base');
    expect(plan.displayName).toBe('Valentina');
    expect(plan.contentHash).toBe('b'.repeat(64));
    expect(plan.paletteId).toBe('siep-master-v1');
    expect(plan.paletteHash).toBe('c'.repeat(64));
    expect(plan.logicalFrame).toEqual({ width: 48, height: 72 });
    expect(plan.pivot).toEqual({ x: 24, y: 68 });
    expect(plan.feetHitbox).toEqual({ x: -11, y: -16, width: 22, height: 16 });
    expect(plan.animations.walk.directions.left).toEqual([6, 7, 8, 9, 10, 11]);
    expect(plan.animations.walk.directions.right).toEqual([12, 13, 14, 15, 16, 17]);
    expect(plan.animations.walk.directions.left).not.toEqual(
      plan.animations.walk.directions.right,
    );
    expect(plan.sheets.walk.textureKey).toBe(`avatar-valentina-base-walk-${'b'.repeat(12)}`);
    expect(plan.portrait.textureKey).toBe(`avatar-valentina-base-portrait-${'b'.repeat(12)}`);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.animations.walk.directions.right)).toBe(true);
    expect(Object.isFrozen(plan.consequenceReactions.rupture)).toBe(true);
    expect(manifestFreezeState()).toEqual(expectedUnfrozenManifestState);
    expect(JSON.stringify(manifest)).toBe(serializedManifest);
    expect(plan.logicalFrame).not.toBe(manifest.logicalFrame);
    expect(plan.pivot).not.toBe(authoredVariant.pivot);
    expect(plan.feetHitbox).not.toBe(authoredVariant.feetHitbox);
    expect(plan.animations.walk.directions.right).not.toBe(
      authoredVariant.animations.walk.directions.right,
    );
    expect(plan.portrait.states.neutral).not.toBe(authoredVariant.portrait.states.neutral);

    const unfrozenDescendant = { frames: [0, 3] };
    const frozenParent = Object.freeze({ child: unfrozenDescendant });
    expect(Object.isFrozen(unfrozenDescendant)).toBe(false);
    deepFreeze(frozenParent);
    expect(Object.isFrozen(unfrozenDescendant)).toBe(true);
    expect(Object.isFrozen(unfrozenDescendant.frames)).toBe(true);
  });

  it.each([
    ['relief', 'reactRelief'],
    ['steady', 'reactSteady'],
    ['tension', 'reactTension'],
    ['rupture', 'reactRupture'],
  ] as const)('exposes the authored reaction and homonymous portrait for %s', (tone, animationId) => {
    const plan = resolveAvatarRenderPlan(manifest, defaultCharacterSelection(manifest));

    expect(manifest.consequenceReactions[tone]).toEqual({ animationId, portraitState: tone });
    expect(plan.animations[animationId]).toBeDefined();
    expect(plan.portrait.states[tone]).toHaveLength(4);
  });

  it('rejects unsupported schema, stale selection metadata, or malformed authored hashes', () => {
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest),
      schemaVersion: 2 as unknown as 1,
    })).toThrow(/schemaVersion.*2/);
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest),
      manifestVersion: '0.9.0',
    })).toThrow(/manifestVersion.*0\.9\.0/);
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest),
      contentHash: 'f'.repeat(64),
    })).toThrow(/contentHash/);

    for (const invalidHash of ['B'.repeat(64), 'b'.repeat(63), 'g'.repeat(64)]) {
      const invalidHashManifest: CharacterManifestV1 = {
        ...manifest,
        identities: [{
          ...manifest.identities[0],
          variants: [{
            ...manifest.identities[0].variants[0],
            contentHash: invalidHash,
          }],
        }],
      };
      const matchingSelection = defaultCharacterSelection(invalidHashManifest);
      expect(matchingSelection.contentHash).toBe(invalidHash);
      expect(() => resolveAvatarRenderPlan(invalidHashManifest, matchingSelection))
        .toThrow(/contentHash inválido/);
    }
  });

  it('does not invent a character or variant fallback', () => {
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest),
      characterId: 'no-existe',
    })).toThrow(/characterId.*no-existe/);
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest),
      variantId: 'con-bata',
    })).toThrow(/variantId.*con-bata/);
  });
});

describe('resolveActorRenderPlan', () => {
  const actorManifest: CharacterManifestV1 = {
    ...manifest,
    actorVisuals: [{
      visualId: 'cuidadora-familia-vbg',
      displayName: 'Cuidadora familiar',
      provenance: {
        source: 'Remaster original SIEP',
        license: 'SIEP-INTERNAL',
        sourceAsset: 'cast/npc_madre-vbg.png',
      },
      variant: manifest.identities[0].variants[0],
    }],
    actorMappings: {
      'familia-duelo': 'cuidadora-familia-vbg',
      'psicologa-acompanante': 'cuidadora-familia-vbg',
      'sobreviviente-consulta': 'cuidadora-familia-vbg',
      'profesional-psicosocial': 'cuidadora-familia-vbg',
    },
  };

  it.each(Object.keys(actorManifest.actorMappings))('resolves %s as a non-selectable shared visual', actorId => {
    const authoredVariant = actorManifest.actorVisuals[0].variant;
    const plan = resolveActorRenderPlan(actorManifest, actorId);

    expect(authoredVariant).toBe(manifest.identities[0].variants[0]);
    expect(plan.actorId).toBe(actorId);
    expect(plan.visualId).toBe('cuidadora-familia-vbg');
    expect(plan.selectable).toBe(false);
    expect(plan.logicalScale).toBe(1);
    expect(plan.logicalFrame).toEqual(actorManifest.logicalFrame);
    expect(plan.pivot).toEqual(authoredVariant.pivot);
    expect(plan.feetHitbox).toEqual(authoredVariant.feetHitbox);
    expect(plan.shadow).toEqual(authoredVariant.shadow);
    expect(plan.sheets.walk).toEqual({
      ...authoredVariant.sheets.walk,
      textureKey: `actor-cuidadora-familia-vbg-walk-${'b'.repeat(12)}`,
    });
    expect(plan.portrait.textureKey).toBe(
      `actor-cuidadora-familia-vbg-portrait-${'b'.repeat(12)}`,
    );
    expect(plan.animations.walk.contactSequenceIndices).toEqual([0, 3]);
    expect(Object.isFrozen(plan.animations.walk.contactSequenceIndices)).toBe(true);
    expect(plan.pivot).not.toBe(authoredVariant.pivot);
    expect(plan.animations.walk.contactSequenceIndices).not.toBe(
      authoredVariant.animations.walk.contactSequenceIndices,
    );
  });

  it('fails closed for an unknown actor, visual, palette, or fractional scale', () => {
    expect(() => resolveActorRenderPlan(actorManifest, 'actor-no-mapeado'))
      .toThrow(/actorMappings.*actor-no-mapeado/);
    expect(() => resolveActorRenderPlan({
      ...actorManifest,
      actorMappings: { 'familia-duelo': 'no-existe' },
    }, 'familia-duelo')).toThrow(/visualId.*no-existe/);

    const badVariant = {
      ...actorManifest.actorVisuals[0].variant,
      logicalScale: 0.4 as unknown as 1,
    };
    expect(() => resolveActorRenderPlan({
      ...actorManifest,
      actorVisuals: [{ ...actorManifest.actorVisuals[0], variant: badVariant }],
    }, 'familia-duelo')).toThrow(/logicalScale.*0\.4/);

    expect(() => resolveActorRenderPlan({
      ...actorManifest,
      palettes: [],
    }, 'familia-duelo')).toThrow(/paletteId\/paletteHash.*siep-master-v1/);

    const staleVariant = {
      ...actorManifest.actorVisuals[0].variant,
      paletteHash: 'f'.repeat(64),
    };
    expect(() => resolveActorRenderPlan({
      ...actorManifest,
      actorVisuals: [{ ...actorManifest.actorVisuals[0], variant: staleVariant }],
    }, 'familia-duelo')).toThrow(/palette/);
  });
});

describe('resolveNarrativePortraitState', () => {
  it.each(EXPECTED_CLINICAL_EMOTION_STATES)(
    'resolves the authored narrative emotion %s from the manifest table',
    (emotion, expected) => {
      expect(resolveNarrativePortraitState(manifest, ` ${emotion.toUpperCase()} `)).toBe(expected);
    },
  );

  it('fails closed for an empty or unknown narrative emotion', () => {
    expect(() => resolveNarrativePortraitState(manifest, 'new-emotion')).toThrow(/new-emotion/);
    expect(() => resolveNarrativePortraitState(manifest, '  ')).toThrow(/vacía/);
  });
});
