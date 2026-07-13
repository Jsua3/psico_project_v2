# Character Manifest and Premium WYSIWYG Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir diez identidades seleccionables y un catálogo NPC no seleccionable con el mismo rig pixel art, cerrar el lenguaje visual de todo lo visible en `SIM-VBG-001`, gobernarlo con manifiestos verificables, sincronizar la selección por usuario y ofrecer un editor WYSIWYG que entregue a Phaser exactamente el mismo `AvatarRenderPlan` que previsualiza.

**Architecture:** `CharacterManifestV1` será el único catálogo ejecutable de frames, pivotes, hitbox, retratos y cuatro reacciones de consecuencia para jugador y NPC; `PremiumVisualManifestV1` inventariará, con procedencia y SHA-256, los ocho mapas del slice, tilesets, mobiliario, `PERSON/OBJECT/TOOL/EXIT`, señales/prompts, iconos y marcos HUD. Un pipeline reproducible abrirá cada PNG y cada tileset referenciado, y rechazará rutas, dimensiones, escala, antialias, paleta o bindings incompletos. `CharacterProfileRepository` resuelve el `AvatarRenderPlan` seleccionable y `resolveActorRenderPlan` resuelve actores no seleccionables; ambos comparten métricas, atlas y renderer sin leer `localStorage` desde Phaser.

**Tech Stack:** Angular 21 Signals, TypeScript 5.9, RxJS, Django REST Framework 3.15, PostgreSQL aislado, Node.js 20, `pngjs`, Jest 30, pytest 8, Playwright 1.60.

---

## Dependencias, límites y gates

- Ejecutar este plan antes de `2026-07-13-world-runtime-motion-camera.md`; ese plan es el dueño de `game-world.component.ts`, `simulation-play.component.ts` y del renderer Phaser que consumirá `AvatarRenderPlan`.
- Este plan sí entrega el contrato, el resolver, el backend del perfil, la caché aislada, los assets, los componentes de preview y el editor. No mantiene una segunda ruta de player modular ni hace que Phaser lea storage.
- Las diez identidades de este corte son, exactamente y en este orden: `valentina`, `andres`, `camila`, `daniela`, `david`, `felipe`, `jorge`, `luisa`, `mariana`, `mateo`. `paula`, `samuel` y “Clásico” no aparecen en el editor premium.
- Los visuales NPC viven en `actorVisuals` y nunca aparecen como opciones del editor. Cada `SceneActorV1.actorId` debe resolver de forma fail-closed a un visual con el mismo rig `48×72`, escala lógica entera, paleta, frames, retrato y hashes; se eliminan presets/tints/escalas `0.36–0.42`.
- Cada identidad expone únicamente `variantId: "base"` hasta que una variante adicional tenga todos sus ciclos, retrato, procedencia y hashes. No se muestran controles “próximamente”, bata deshabilitada ni personalización que no cambie píxeles.
- El arte lógico es `48×72 px`, sin escalas fraccionarias, sin filtrado bilineal y sin espejar izquierda/derecha. Los atlas se dibujan con la misma paleta, rig, pivote y timing.
- Las cuatro reacciones corporales canónicas son exactamente `reactRelief`, `reactSteady`, `reactTension` y `reactRupture`; los cuatro estados de retrato de consecuencia son `relief`, `steady`, `tension` y `rupture`. Las diez identidades y los once visuales NPC deben contener las ocho expresiones de retrato y las cuatro reacciones completas. No existe `unknown → concerned`, ni fallback de una reacción clínica a otra.
- El inventario visual parte con todos los assets heredados como `unreviewed`: ninguna ruta actual se da por aprobada por existir. Cada inconsistencia se remasteriza o se reemplaza antes de promover su hash; el gate humano exact-HEAD del plan de checkpoint es autoridad de aprobación visual, no este documento.
- El alcance visual exhaustivo del slice son los ocho `mapKey` backend `hospital-urgencias`, `hospital-sala-escucha`, `hospital-sala-escucha-accion`, `hospital-sala-escucha-cierre`, `comisaria-recepcion`, `comisaria-consultorio`, `comisaria-consultorio-marco` y `comisaria-consultorio-cierre`, y todo PNG que pueda verse desde ellos o desde editor/diálogo/HUD.
- Los tests backend se ejecutan únicamente mediante `npm run test:backend -- ...`; ese runner demuestra y destruye su PostgreSQL aislado. No ejecutar pytest directo contra una base compartida.
- `user_character_profiles` queda bajo autoridad de migraciones Django, igual que `access_requests`; no crear simultáneamente un changeset Flyway para la misma tabla. Bootstrap/reseed y despliegue continúan fuera de alcance.
- Higgsfield o imagegen pueden producir concepto/estudio. Los PNG promovidos deben ser pixelados y normalizados manualmente; el validador y la revisión en movimiento son gates, no sustitutos de revisión humana.
- Este plan no autoriza push, merge, despliegue ni publicación.

## Mapa de archivos

| Archivo | Acción | Responsabilidad única |
|---|---|---|
| `docs/visual/premium-visual-bible-v1.md` | Crear | Autoridad vinculante para personajes, mundo, objetos, señales, iconos y marcos HUD. |
| `frontend/src/app/core/models/consequence-tone.model.ts` | Crear | Unión neutral y única `relief|steady|tension|rupture`, disponible antes de runtime/caso/audio. |
| `frontend/src/assets/characters/v1/palette.v1.json` | Crear | Paleta maestra y subpaletas permitidas. |
| `frontend/src/assets/characters/v1/roster.v1.json` | Crear | Metadatos humanos y procedencia de las diez identidades. |
| `frontend/src/assets/characters/v1/actor-roster.v1.json` | Crear | Visuales NPC no seleccionables y mapping exhaustivo de actorId del caso. |
| `frontend/src/assets/characters/v1/clinical-emotion-map.v1.json` | Crear | Mapping exhaustivo de emociones clínicas autoradas a estado de retrato; ninguna emoción desconocida se adivina. |
| `frontend/src/assets/characters/v1/<id>/base/{idle,walk,talk,interact,turn,react,portrait}.png` | Crear | Atlas finales de una identidad; nunca salidas generativas crudas. |
| `frontend/src/assets/characters/v1/actors/<visualId>/base/{idle,walk,talk,interact,turn,react,portrait}.png` | Crear | Atlas NPC con la misma métrica/paleta/rig; sin preset legacy. |
| `frontend/src/assets/characters/v1/manifest.json` | Generar y versionar | Autoridad runtime con geometría, secuencias y SHA-256 reales. |
| `frontend/src/assets/characters/v1/README.md` | Generar y versionar | Inventario humano derivado; el gate rechaza deriva frente al manifiesto. |
| `frontend/src/assets/visual/v1/inventory.v1.json` | Crear | Inventario exhaustivo de ocho mapas y de todo asset visible, con categoría, binding, procedencia, licencia y geometría esperada. |
| `frontend/src/assets/visual/v1/manifest.json` / `README.md` | Generar y versionar | SHA-256 y estado derivado de cada PNG, tileset, mapa y superficie HUD. |
| `frontend/scripts/visual-asset-manifest-lib.mjs` | Crear | Abrir PNG/map JSON/tilesets, validar estilo mecánico y construir `PremiumVisualManifestV1`. |
| `frontend/scripts/validate-premium-visual-assets.mjs` | Crear | CLI bloqueante `--check|--write|--asset|--map`; nunca autoaprueba lo no revisado. |
| `frontend/scripts/visual-asset-manifest-lib.test.mjs` | Crear | Rutas, dimensiones, tile grid, alfa/antialias, paleta, escala, procedencia y cobertura del slice. |
| `frontend/scripts/render-premium-contact-sheets.mjs` | Crear | Contact sheets deterministas de 10 identidades, 11 NPC y del inventario visual completo. |
| `frontend/scripts/character-manifest-lib.mjs` | Crear | Abrir PNG, validar contrato y construir el manifiesto estable. |
| `frontend/scripts/validate-character-manifest.mjs` | Crear | CLI `--character`, `--actor`, `--write` y `--check`. |
| `frontend/scripts/character-manifest-lib.test.mjs` | Crear | TDD del pipeline, dimensiones, paleta, direcciones y hashes. |
| `frontend/package.json` / `frontend/package-lock.json` | Modificar | Añadir `pngjs` y scripts; `prebuild` bloquea manifests derivados obsoletos. |
| `frontend/src/app/features/character/character-manifest.model.ts` | Crear | Tipos versionados del manifiesto y selección. |
| `frontend/src/app/features/character/avatar-render-plan.model.ts` | Crear | Contrato inmutable Angular→Phaser. |
| `frontend/src/app/features/character/avatar-render-plan.util.ts` | Crear | Resolver puro selección+manifest→plan, sin storage ni red. |
| `frontend/src/app/features/character/avatar-render-plan.util.spec.ts` | Crear | Default, paridad, textura estable y rechazo de deriva. |
| `frontend/src/app/features/character/clinical-emotion-portrait.util.ts` | Crear | Resolver manifest-backed emoción narrativa→estado de retrato; falla ante claves desconocidas. |
| `frontend/src/app/features/character/actor-render-plan.model.ts` | Crear | Contrato no seleccionable y manifest-backed para NPC. |
| `frontend/src/app/features/character/actor-render-plan.util.ts` | Crear | Resolver actorId→atlas/hash y rechazar actor/config faltante; se prueba junto al resolver de avatar. |
| `frontend/src/app/features/character/character-manifest.service.ts` | Crear | Cargar una vez `/assets/characters/v1/manifest.json`. |
| `frontend/src/app/features/character/character-manifest.service.spec.ts` | Crear | Carga, cache de observable y error de versión. |
| `backend_django/apps/users/models.py` | Modificar | `CharacterProfile`, uno por usuario. |
| `backend_django/apps/users/migrations/0004_characterprofile.py` | Crear | Tabla `user_character_profiles`, revisión y unicidad por usuario. |
| `backend_django/apps/users/serializers.py` | Modificar | Payload camelCase y validación estricta de versión/hash. |
| `backend_django/apps/users/services/character_profile_service.py` | Crear | Upsert transaccional con revisión optimista. |
| `backend_django/apps/users/views.py` / `urls.py` | Modificar | GET/PUT autenticados en `/api/auth/me/character-profile`. |
| `backend_django/apps/users/tests/test_character_profile.py` | Crear | Aislamiento, actualización, conflicto y autenticación. |
| `frontend/src/app/core/api/character-profile.api.ts` | Crear | Cliente HTTP tipado del perfil. |
| `frontend/src/app/features/character/character-profile.repository.ts` | Crear | Autoridad Angular, cache por `user.id`, draft, sync y fallback offline. |
| `frontend/src/app/features/character/character-profile.repository.spec.ts` | Crear | No contaminación entre cuentas, servidor gana sobre cache limpia y todo draft offline se sincroniza o entra en conflicto sin perderse. |
| `frontend/src/app/features/character/character-sprite-preview.component.ts` | Crear | Preview de sprites usando la URL y frames exactos del plan. |
| `frontend/src/app/features/character/character-sprite-preview.component.spec.ts` | Crear | Rectángulos, dirección, animación y reduced motion. |
| `frontend/src/app/features/character/character-portrait.component.ts` | Crear | Retrato desde el atlas del plan para consumidores posteriores. |
| `frontend/src/app/features/character/character-editor.component.ts` | Modificar | Estado y acciones del editor sobre el repository. |
| `frontend/src/app/features/character/character-editor.component.html` | Crear | Selector de diez identidades, cuatro vistas y cuatro ciclos reales. |
| `frontend/src/app/features/character/character-editor.component.scss` | Crear | Composición desktop-first, píxel nítido y estados accesibles. |
| `frontend/src/app/features/character/avatar.store.ts` / `.spec.ts` | Conservar solo como puente | Task 11 migra editor/lobby/outcome; Runtime Task 9 elimina el último import de GameWorld y borra ambos archivos en el mismo commit verde. |
| `frontend/e2e/character-editor-premium.e2e.ts` | Crear | Matriz de diez identidades, reload, segundo dispositivo y segunda cuenta. |
| `scripts/test-e2e.mjs` | Modificar | Pasar a Playwright las mismas credenciales aisladas de estudiante/admin que sembró el runner. |

### Task 1: Definir `CharacterManifestV1` y `AvatarRenderPlan`

**Files:**
- Create: `frontend/src/app/core/models/consequence-tone.model.ts`
- Create: `frontend/src/app/features/character/character-manifest.model.ts`
- Create: `frontend/src/app/features/character/avatar-render-plan.model.ts`
- Create: `frontend/src/app/features/character/avatar-render-plan.util.ts`
- Create: `frontend/src/app/features/character/avatar-render-plan.util.spec.ts`
- Create: `frontend/src/app/features/character/clinical-emotion-portrait.util.ts`
- Create: `frontend/src/app/features/character/actor-render-plan.model.ts`
- Create: `frontend/src/app/features/character/actor-render-plan.util.ts`

- [ ] **Step 1: Escribir primero los tests rojos del resolver**

```ts
// frontend/src/app/features/character/avatar-render-plan.util.spec.ts
import type { CharacterManifestV1 } from './character-manifest.model';
import { defaultCharacterSelection, resolveAvatarRenderPlan } from './avatar-render-plan.util';
import { resolveActorRenderPlan } from './actor-render-plan.util';
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
    neutral: 'neutral', positive: 'relieved', negative: 'concerned', anxious: 'concerned',
    danger: 'concerned', sad: 'concerned', worried: 'concerned', relieved: 'relieved',
    concerned: 'concerned', receptive: 'relief', calm: 'steady', closed: 'rupture',
  },
  palettes: [{ paletteId: 'siep-master-v1', src: '/assets/characters/v1/palette.v1.json', sha256: 'c'.repeat(64) }],
  identities: [{
    characterId: 'valentina',
    displayName: 'Valentina',
    summary: 'Psicóloga en formación',
    provenance: { source: 'SIEP cast remaster', license: 'SIEP-INTERNAL', sourceAsset: 'cast/valentina.png' },
    variants: [{
      variantId: 'base', contentHash: 'b'.repeat(64), paletteId: 'siep-master-v1', paletteHash: 'c'.repeat(64), logicalScale: 1,
      pivot: { x: 24, y: 68 },
      feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
      shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 },
      sheets: {
        idle: { id: 'idle', src: '/assets/characters/v1/valentina/base/idle.png', width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4, sha256: '1'.repeat(64) },
        walk: { id: 'walk', src: '/assets/characters/v1/valentina/base/walk.png', width: 288, height: 288, frameWidth: 48, frameHeight: 72, columns: 6, rows: 4, sha256: '2'.repeat(64) },
        talk: { id: 'talk', src: '/assets/characters/v1/valentina/base/talk.png', width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4, sha256: '3'.repeat(64) },
        interact: { id: 'interact', src: '/assets/characters/v1/valentina/base/interact.png', width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4, sha256: '4'.repeat(64) },
        turn: { id: 'turn', src: '/assets/characters/v1/valentina/base/turn.png', width: 144, height: 288, frameWidth: 48, frameHeight: 72, columns: 3, rows: 4, sha256: '5'.repeat(64) },
        react: { id: 'react', src: '/assets/characters/v1/valentina/base/react.png', width: 192, height: 1152, frameWidth: 48, frameHeight: 72, columns: 4, rows: 16, sha256: '6'.repeat(64) },
      },
      animations: {
        idle: { id: 'idle', sheetId: 'idle', fps: 4, loop: true, directions: { down: [0,1,2,3], left: [4,5,6,7], right: [8,9,10,11], up: [12,13,14,15] } },
        walk: { id: 'walk', sheetId: 'walk', fps: 10, loop: true, directions: { down: [0,1,2,3,4,5], left: [6,7,8,9,10,11], right: [12,13,14,15,16,17], up: [18,19,20,21,22,23] }, contactSequenceIndices: [0,3] },
        talk: { id: 'talk', sheetId: 'talk', fps: 7, loop: true, directions: { down: [0,1,2,3], left: [4,5,6,7], right: [8,9,10,11], up: [12,13,14,15] } },
        interact: { id: 'interact', sheetId: 'interact', fps: 8, loop: false, directions: { down: [0,1,2,3], left: [4,5,6,7], right: [8,9,10,11], up: [12,13,14,15] } },
        turn: { id: 'turn', sheetId: 'turn', fps: 12, loop: false, directions: { down: [0,1,2], left: [3,4,5], right: [6,7,8], up: [9,10,11] } },
        reactRelief: { id: 'reactRelief', sheetId: 'react', fps: 7, loop: false, directions: { down: [0,1,2,3], left: [4,5,6,7], right: [8,9,10,11], up: [12,13,14,15] } },
        reactSteady: { id: 'reactSteady', sheetId: 'react', fps: 7, loop: false, directions: { down: [16,17,18,19], left: [20,21,22,23], right: [24,25,26,27], up: [28,29,30,31] } },
        reactTension: { id: 'reactTension', sheetId: 'react', fps: 7, loop: false, directions: { down: [32,33,34,35], left: [36,37,38,39], right: [40,41,42,43], up: [44,45,46,47] } },
        reactRupture: { id: 'reactRupture', sheetId: 'react', fps: 7, loop: false, directions: { down: [48,49,50,51], left: [52,53,54,55], right: [56,57,58,59], up: [60,61,62,63] } },
      },
      portrait: {
        sheet: { id: 'portrait', src: '/assets/characters/v1/valentina/base/portrait.png', width: 384, height: 768, frameWidth: 96, frameHeight: 96, columns: 4, rows: 8, sha256: '7'.repeat(64) },
        fps: 6,
        states: {
          neutral: [0,1,2,3], focused: [4,5,6,7], concerned: [8,9,10,11], relieved: [12,13,14,15],
          relief: [16,17,18,19], steady: [20,21,22,23], tension: [24,25,26,27], rupture: [28,29,30,31],
        },
      },
    }],
  }],
  actorVisuals: [],
  actorMappings: {},
};

describe('resolveAvatarRenderPlan', () => {
  it('resuelve el default y conserva hash, cuatro direcciones y geometría', () => {
    const selection = defaultCharacterSelection(manifest);
    const plan = resolveAvatarRenderPlan(manifest, selection);
    expect(plan.characterId).toBe('valentina');
    expect(plan.contentHash).toBe('b'.repeat(64));
    expect(plan.paletteId).toBe('siep-master-v1');
    expect(plan.paletteHash).toBe('c'.repeat(64));
    expect(plan.logicalFrame).toEqual({ width: 48, height: 72 });
    expect(plan.pivot).toEqual({ x: 24, y: 68 });
    expect(plan.feetHitbox).toEqual({ x: -11, y: -16, width: 22, height: 16 });
    expect(plan.animations.walk.directions.left).toHaveLength(6);
    expect(plan.animations.walk.directions.right).toHaveLength(6);
    expect(plan.sheets.walk.textureKey).toBe(`avatar-valentina-base-walk-${'b'.repeat(12)}`);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.animations.walk.directions.right)).toBe(true);
    expect(Object.isFrozen(plan.consequenceReactions.rupture)).toBe(true);
  });

  it.each([
    ['relief', 'reactRelief'], ['steady', 'reactSteady'],
    ['tension', 'reactTension'], ['rupture', 'reactRupture'],
  ] as const)('expone reacción y retrato autorados para %s', (tone, animationId) => {
    const plan = resolveAvatarRenderPlan(manifest, defaultCharacterSelection(manifest));
    expect(manifest.consequenceReactions[tone]).toEqual({ animationId, portraitState: tone });
    expect(plan.animations[animationId]).toBeDefined();
    expect(plan.portrait.states[tone]).toHaveLength(4);
  });

  it('rechaza perfil de otro manifest o hash obsoleto', () => {
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest), manifestVersion: '0.9.0',
    })).toThrow(/manifestVersion/);
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest), contentHash: 'f'.repeat(64),
    })).toThrow(/contentHash/);
  });

  it('no inventa una variante ni un characterId', () => {
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest), characterId: 'no-existe',
    })).toThrow(/characterId/);
    expect(() => resolveAvatarRenderPlan(manifest, {
      ...defaultCharacterSelection(manifest), variantId: 'con-bata',
    })).toThrow(/variantId/);
  });
});

describe('resolveActorRenderPlan', () => {
  const actorManifest: CharacterManifestV1 = {
    ...manifest,
    actorVisuals: [{
      visualId: 'cuidadora-familia-vbg',
      displayName: 'Cuidadora familiar',
      provenance: { source: 'Remaster original SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/npc_madre-vbg.png' },
      variant: manifest.identities[0].variants[0],
    }],
    actorMappings: {
      'familia-duelo': 'cuidadora-familia-vbg',
      'psicologa-acompanante': 'cuidadora-familia-vbg',
      'sobreviviente-consulta': 'cuidadora-familia-vbg',
      'profesional-psicosocial': 'cuidadora-familia-vbg',
    },
  };

  it.each(Object.keys(actorManifest.actorMappings))('resuelve %s sin volverlo seleccionable', actorId => {
    const plan = resolveActorRenderPlan(actorManifest, actorId);
    expect(plan.actorId).toBe(actorId);
    expect(plan.visualId).toBe('cuidadora-familia-vbg');
    expect(plan.selectable).toBe(false);
    expect(plan.logicalScale).toBe(1);
    expect(plan.animations.walk.contactSequenceIndices).toEqual([0, 3]);
    expect(Object.isFrozen(plan.animations.walk.contactSequenceIndices)).toBe(true);
  });

  it('falla cerrado ante actor, visual, paleta o escala inválidos', () => {
    expect(() => resolveActorRenderPlan(actorManifest, 'actor-no-mapeado')).toThrow(/actorMappings/);
    expect(() => resolveActorRenderPlan({ ...actorManifest, actorMappings: { 'familia-duelo': 'no-existe' } }, 'familia-duelo')).toThrow(/visualId/);
    const badVariant = { ...actorManifest.actorVisuals[0].variant, logicalScale: 0.4 as unknown as 1 };
    expect(() => resolveActorRenderPlan({ ...actorManifest, actorVisuals: [{ ...actorManifest.actorVisuals[0], variant: badVariant }] }, 'familia-duelo')).toThrow(/logicalScale/);
    const staleVariant = { ...actorManifest.actorVisuals[0].variant, paletteHash: 'f'.repeat(64) };
    expect(() => resolveActorRenderPlan({ ...actorManifest, actorVisuals: [{ ...actorManifest.actorVisuals[0], variant: staleVariant }] }, 'familia-duelo')).toThrow(/palette/);
  });
});

describe('resolveNarrativePortraitState', () => {
  it.each(Object.entries(manifest.clinicalEmotionPortraitStates))(
    'resuelve la emoción autorada %s sin otra tabla',
    (emotion, expected) => {
      expect(resolveNarrativePortraitState(manifest, emotion)).toBe(expected);
    },
  );

  it('falla cerrado ante emoción vacía o desconocida', () => {
    expect(() => resolveNarrativePortraitState(manifest, 'new-emotion')).toThrow(/new-emotion/);
    expect(() => resolveNarrativePortraitState(manifest, '  ')).toThrow(/vacía/);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla por módulos inexistentes**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/avatar-render-plan.util.spec.ts`

Expected: FAIL con `Cannot find module './character-manifest.model'`.

- [ ] **Step 3: Crear los tipos completos del manifiesto**

```ts
// frontend/src/app/core/models/consequence-tone.model.ts
export const CONSEQUENCE_TONES = [
  'relief', 'steady', 'tension', 'rupture',
] as const;
export type ConsequenceTone = typeof CONSEQUENCE_TONES[number];
```

```ts
// frontend/src/app/features/character/character-manifest.model.ts
import type { ConsequenceTone } from '../../core/models/consequence-tone.model';

export type CardinalDirection = 'down' | 'left' | 'right' | 'up';
export type CharacterSheetId = 'idle' | 'walk' | 'talk' | 'interact' | 'turn' | 'react';
export type ConsequenceReactionAnimationId =
  | 'reactRelief' | 'reactSteady' | 'reactTension' | 'reactRupture';
export type CharacterAnimationId = Exclude<CharacterSheetId, 'react'> | ConsequenceReactionAnimationId;
export type PortraitState =
  | 'neutral' | 'focused' | 'concerned' | 'relieved' | ConsequenceTone;

export interface PixelSize { readonly width: number; readonly height: number; }
export interface PixelPoint { readonly x: number; readonly y: number; }
export interface PixelRect extends PixelPoint, PixelSize {}

export interface CharacterSheetV1 extends PixelSize {
  readonly id: CharacterSheetId;
  readonly src: string;
  readonly frameWidth: 48;
  readonly frameHeight: 72;
  readonly columns: number;
  readonly rows: number;
  readonly sha256: string;
}

export interface PortraitSheetV1 extends PixelSize {
  readonly id: 'portrait';
  readonly src: string;
  readonly frameWidth: 96;
  readonly frameHeight: 96;
  readonly columns: 4;
  readonly rows: 8;
  readonly sha256: string;
}

export interface DirectionalAnimationV1 {
  readonly id: CharacterAnimationId;
  readonly sheetId: CharacterSheetId;
  readonly fps: number;
  readonly loop: boolean;
  readonly directions: Readonly<Record<CardinalDirection, readonly number[]>>;
  /** Índices dentro de la secuencia direccional, nunca índices absolutos de atlas. */
  readonly contactSequenceIndices?: readonly number[];
}

export interface CharacterProvenanceV1 {
  readonly source: string;
  readonly license: string;
  readonly sourceAsset: string;
}

export interface CharacterPaletteRefV1 {
  readonly paletteId: string;
  readonly src: string;
  readonly sha256: string;
}

export interface CharacterVariantV1 {
  readonly variantId: string;
  readonly contentHash: string;
  readonly paletteId: string;
  readonly paletteHash: string;
  readonly logicalScale: 1;
  readonly pivot: PixelPoint;
  /** Rect relativo al pivote/punto de pies; nunca coordenadas absolutas del frame. */
  readonly feetHitbox: PixelRect;
  readonly shadow: { readonly offsetX: number; readonly offsetY: number; readonly width: number; readonly height: number };
  readonly sheets: Readonly<Record<CharacterSheetId, CharacterSheetV1>>;
  readonly animations: Readonly<Record<CharacterAnimationId, DirectionalAnimationV1>>;
  readonly portrait: {
    readonly sheet: PortraitSheetV1;
    readonly fps: number;
    readonly states: Readonly<Record<PortraitState, readonly number[]>>;
  };
}

export interface CharacterIdentityV1 {
  readonly characterId: string;
  readonly displayName: string;
  readonly summary: string;
  readonly provenance: CharacterProvenanceV1;
  readonly variants: readonly CharacterVariantV1[];
}

export interface ActorVisualV1 {
  readonly visualId: string;
  readonly displayName: string;
  readonly provenance: CharacterProvenanceV1;
  readonly variant: CharacterVariantV1;
}

export interface CharacterManifestV1 {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly manifestHash: string;
  readonly defaultCharacterId: string;
  readonly logicalFrame: { readonly width: 48; readonly height: 72 };
  readonly consequenceReactions: Readonly<Record<ConsequenceTone, {
    readonly animationId: ConsequenceReactionAnimationId;
    readonly portraitState: ConsequenceTone;
  }>>;
  readonly clinicalEmotionPortraitStates: Readonly<Record<string, PortraitState>>;
  readonly palettes: readonly CharacterPaletteRefV1[];
  readonly identities: readonly CharacterIdentityV1[];
  readonly actorVisuals: readonly ActorVisualV1[];
  readonly actorMappings: Readonly<Record<string, string>>;
}

export interface CharacterProfileSelectionV1 {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly characterId: string;
  readonly variantId: string;
  readonly contentHash: string;
}

export interface CharacterProfileV1 extends CharacterProfileSelectionV1 {
  readonly revision: number;
  readonly updatedAt: string | null;
}
```

- [ ] **Step 4: Crear el contrato exacto que consumirá Phaser**

```ts
// frontend/src/app/features/character/avatar-render-plan.model.ts
import type {
  CardinalDirection, CharacterAnimationId, CharacterManifestV1, CharacterSheetId,
  DirectionalAnimationV1, PixelPoint, PixelRect, PortraitState,
} from './character-manifest.model';

export interface AvatarRenderSheet {
  readonly id: CharacterSheetId;
  readonly textureKey: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly frameWidth: 48;
  readonly frameHeight: 72;
  readonly columns: number;
  readonly rows: number;
  readonly sha256: string;
}

export interface AvatarRenderAnimation extends DirectionalAnimationV1 {
  readonly directions: Readonly<Record<CardinalDirection, readonly number[]>>;
}

export interface AvatarRenderPlan {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly contentHash: string;
  readonly characterId: string;
  readonly variantId: string;
  readonly displayName: string;
  readonly paletteId: string;
  readonly paletteHash: string;
  readonly logicalFrame: { readonly width: 48; readonly height: 72 };
  readonly pivot: PixelPoint;
  /** Rect relativo al pivote/punto de pies; sumar pivot/posición una sola vez en runtime. */
  readonly feetHitbox: PixelRect;
  readonly shadow: { readonly offsetX: number; readonly offsetY: number; readonly width: number; readonly height: number };
  readonly logicalScale: 1;
  readonly consequenceReactions: CharacterManifestV1['consequenceReactions'];
  readonly sheets: Readonly<Record<CharacterSheetId, AvatarRenderSheet>>;
  readonly animations: Readonly<Record<CharacterAnimationId, AvatarRenderAnimation>>;
  readonly portrait: {
    readonly id: 'portrait';
    readonly textureKey: string;
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly frameWidth: 96;
    readonly frameHeight: 96;
    readonly columns: 4;
    readonly rows: 8;
    readonly sha256: string;
    readonly fps: number;
    readonly states: Readonly<Record<PortraitState, readonly number[]>>;
  };
}
```

Create `actor-render-plan.model.ts` without a second animation geometry:

```ts
import { AvatarRenderPlan } from './avatar-render-plan.model';

export interface ActorRenderPlan extends Omit<
  AvatarRenderPlan,
  'characterId' | 'variantId'
> {
  readonly actorId: string;
  readonly visualId: string;
  readonly selectable: false;
}
```

- [ ] **Step 5: Implementar el resolver puro y estricto**

```ts
// frontend/src/app/features/character/avatar-render-plan.util.ts
import type { AvatarRenderPlan, AvatarRenderSheet } from './avatar-render-plan.model';
import type {
  CharacterManifestV1, CharacterProfileSelectionV1, CharacterSheetId, CharacterVariantV1,
} from './character-manifest.model';

const SHEET_IDS: readonly CharacterSheetId[] = ['idle', 'walk', 'talk', 'interact', 'turn', 'react'];
export type ResolvedRenderCore = Omit<AvatarRenderPlan, 'characterId' | 'variantId'>;

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildRenderCore(
  manifest: CharacterManifestV1,
  texturePrefix: string,
  displayName: string,
  variant: CharacterVariantV1,
): ResolvedRenderCore {
  if (variant.logicalScale !== 1) throw new Error(`logicalScale inválida: ${variant.logicalScale}`);
  if (!/^[a-f0-9]{64}$/.test(variant.contentHash)) throw new Error('contentHash inválido');
  const palette = manifest.palettes.find(item => item.paletteId === variant.paletteId);
  if (!palette || palette.sha256 !== variant.paletteHash) throw new Error('paletteId/paletteHash obsoleto');
  const suffix = variant.contentHash.slice(0, 12);
  const sheets = Object.fromEntries(SHEET_IDS.map(id => {
    const sheet = variant.sheets[id];
    const resolved: AvatarRenderSheet = {
      ...sheet,
      textureKey: `${texturePrefix}-${id}-${suffix}`,
    };
    return [id, Object.freeze(resolved)];
  })) as unknown as AvatarRenderPlan['sheets'];
  return deepFreeze({
    schemaVersion: 1 as const,
    manifestVersion: manifest.manifestVersion,
    contentHash: variant.contentHash,
    displayName,
    paletteId: variant.paletteId,
    paletteHash: variant.paletteHash,
    logicalFrame: manifest.logicalFrame,
    pivot: variant.pivot,
    feetHitbox: variant.feetHitbox,
    shadow: variant.shadow,
    logicalScale: 1 as const,
    consequenceReactions: manifest.consequenceReactions,
    sheets,
    animations: variant.animations,
    portrait: {
      ...variant.portrait.sheet,
      textureKey: `${texturePrefix}-portrait-${suffix}`,
      fps: variant.portrait.fps,
      states: variant.portrait.states,
    },
  });
}

export function defaultCharacterSelection(manifest: CharacterManifestV1): CharacterProfileSelectionV1 {
  const identity = manifest.identities.find(item => item.characterId === manifest.defaultCharacterId);
  if (!identity) throw new Error(`defaultCharacterId desconocido: ${manifest.defaultCharacterId}`);
  const variant = identity.variants.find(item => item.variantId === 'base') ?? identity.variants[0];
  if (!variant) throw new Error(`Sin variantes para characterId ${identity.characterId}`);
  return {
    schemaVersion: 1,
    manifestVersion: manifest.manifestVersion,
    characterId: identity.characterId,
    variantId: variant.variantId,
    contentHash: variant.contentHash,
  };
}

export function resolveAvatarRenderPlan(
  manifest: CharacterManifestV1,
  selection: CharacterProfileSelectionV1,
): AvatarRenderPlan {
  if (selection.schemaVersion !== 1) throw new Error(`schemaVersion no soportada: ${selection.schemaVersion}`);
  if (selection.manifestVersion !== manifest.manifestVersion) {
    throw new Error(`manifestVersion obsoleta: ${selection.manifestVersion}`);
  }
  const identity = manifest.identities.find(item => item.characterId === selection.characterId);
  if (!identity) throw new Error(`characterId desconocido: ${selection.characterId}`);
  const variant = identity.variants.find(item => item.variantId === selection.variantId);
  if (!variant) throw new Error(`variantId desconocido: ${selection.variantId}`);
  if (variant.contentHash !== selection.contentHash) throw new Error('contentHash obsoleto');
  return deepFreeze({
    ...buildRenderCore(manifest, `avatar-${identity.characterId}-${variant.variantId}`, identity.displayName, variant),
    characterId: identity.characterId,
    variantId: variant.variantId,
  });
}
```

Crear el resolver de actores sin una segunda geometría ni fallback:

```ts
// frontend/src/app/features/character/actor-render-plan.util.ts
import type { CharacterManifestV1 } from './character-manifest.model';
import type { ActorRenderPlan } from './actor-render-plan.model';
import { buildRenderCore, deepFreeze } from './avatar-render-plan.util';

export function resolveActorRenderPlan(
  manifest: CharacterManifestV1,
  actorId: string,
): ActorRenderPlan {
  const visualId = manifest.actorMappings[actorId];
  if (!visualId) throw new Error(`actorMappings no contiene ${actorId}`);
  const actor = manifest.actorVisuals.find(item => item.visualId === visualId);
  if (!actor) throw new Error(`visualId desconocido: ${visualId}`);
  return deepFreeze({
    ...buildRenderCore(manifest, `actor-${visualId}`, actor.displayName, actor.variant),
    actorId,
    visualId,
    selectable: false as const,
  });
}
```

Crear el único resolver de emoción narrativa. Lee la tabla ya incorporada al
manifest derivado; no importa el JSON en cada consumidor ni contiene aliases
hardcoded:

```ts
// frontend/src/app/features/character/clinical-emotion-portrait.util.ts
import type { CharacterManifestV1, PortraitState } from './character-manifest.model';

export function resolveNarrativePortraitState(
  manifest: CharacterManifestV1,
  emotion: string,
): PortraitState {
  const key = emotion.trim().toLowerCase();
  if (!key) throw new Error('emoción narrativa vacía');
  const state = manifest.clinicalEmotionPortraitStates[key];
  if (!Object.prototype.hasOwnProperty.call(manifest.clinicalEmotionPortraitStates, key) || !state) {
    throw new Error(`clinicalEmotionPortraitStates no contiene ${key}`);
  }
  return state;
}
```

- [ ] **Step 6: Ejecutar el test y el typecheck de producción**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/avatar-render-plan.util.spec.ts`

Expected: PASS, `25 passed` (doce tests base de avatar/actor, doce emociones
autoradas parametrizadas y un test de emoción vacía/desconocida).

Run: `npm run build:frontend`

Expected: exit `0`; Angular acepta el contrato estricto.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/core/models/consequence-tone.model.ts `
  frontend/src/app/features/character/character-manifest.model.ts `
  frontend/src/app/features/character/avatar-render-plan.model.ts `
  frontend/src/app/features/character/avatar-render-plan.util.ts `
  frontend/src/app/features/character/avatar-render-plan.util.spec.ts `
  frontend/src/app/features/character/clinical-emotion-portrait.util.ts `
  frontend/src/app/features/character/actor-render-plan.model.ts `
  frontend/src/app/features/character/actor-render-plan.util.ts
git commit -m "feat(character): definir manifiesto v1 y avatar render plan"
```

### Task 2: Convertir la biblia y los PNG en un pipeline bloqueante

**Files:**
- Create: `docs/visual/premium-visual-bible-v1.md`
- Create: `frontend/src/assets/characters/v1/palette.v1.json`
- Create: `frontend/src/assets/characters/v1/roster.v1.json`
- Create: `frontend/src/assets/characters/v1/actor-roster.v1.json`
- Create: `frontend/src/assets/characters/v1/clinical-emotion-map.v1.json`
- Create: `frontend/src/assets/visual/v1/inventory.v1.json`
- Create: `frontend/scripts/visual-asset-manifest-lib.mjs`
- Create: `frontend/scripts/validate-premium-visual-assets.mjs`
- Create: `frontend/scripts/visual-asset-manifest-lib.test.mjs`
- Create: `frontend/scripts/render-premium-contact-sheets.mjs`
- Create: `backend_django/apps/simulation/tests/test_visual_inventory_contract.py`
- Create: `frontend/scripts/character-manifest-lib.mjs`
- Create: `frontend/scripts/validate-character-manifest.mjs`
- Create: `frontend/scripts/character-manifest-lib.test.mjs`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Instalar el lector PNG utilizado solo por build/test**

Run: `npm install --prefix frontend --save-dev pngjs@7.0.0`

Expected: `frontend/package.json` contiene `"pngjs": "^7.0.0"` y el lock cambia sin vulnerabilidades críticas nuevas.

- [ ] **Step 2: Escribir los tests rojos del pipeline**

`actor-roster.v1.json` contains non-selectable `actorVisuals` and an exhaustive
`actorMappings` object. Extend the red tests before implementation: exactly ten
`identities` remain selectable; every mapped actor resolves; all actor sheets
use the same `SHEET_SPECS`, palette, pivot, `logicalScale: 1`, contact indices
and provenance checks; unknown/duplicate mappings and any fractional scale fail.
The four clinical ids named in Task 1 are mandatory, and the file also lists
every ambient `actorId` emitted by the current `SIM-VBG-001` scenario fixture.
Every identity and actor must expose the four exact reaction animation IDs and
the four homonymous consequence portrait states. A missing slot, reused frame
range, out-of-bounds index or fifth reaction key fails before hashes are built.
The pipeline suite supplies `clinicalEmotionMap` and rejects an absent schema,
blank/invalid key or value outside `PortraitState`; the backend inventory test
below requires its exact twelve authored keys. The normalized table becomes part
of `manifestHash`.

```js
// frontend/scripts/character-manifest-lib.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';

import { SHEET_SPECS, buildCharacterManifest } from './character-manifest-lib.mjs';

const palette = { schemaVersion: 1, paletteId: 'siep-master-v1', outline: '#15131d', masterColors: ['#15131d', '#f0c7a5'] };
const roster = { schemaVersion: 1, manifestVersion: '1.0.0', defaultCharacterId: 'valentina', identities: [
  { characterId: 'valentina', displayName: 'Valentina', summary: 'Psicóloga en formación', provenance: { source: 'SIEP cast remaster', license: 'SIEP-INTERNAL', sourceAsset: 'cast/valentina.png' } },
] };
const actorRoster = {
  schemaVersion: 1,
  actorVisuals: [{
    visualId: 'cuidadora-familia-vbg', displayName: 'Cuidadora familiar',
    provenance: { source: 'Remaster original SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/npc_madre-vbg.png' },
  }],
  actorMappings: {
    'familia-duelo': 'cuidadora-familia-vbg',
    'familia-crisis': 'cuidadora-familia-vbg',
  },
};
const clinicalEmotionMap = {
  schemaVersion: 1,
  emotions: {
    neutral: 'neutral', positive: 'relieved', negative: 'concerned', anxious: 'concerned',
    danger: 'concerned', sad: 'concerned', worried: 'concerned', relieved: 'relieved',
    concerned: 'concerned', receptive: 'relief', calm: 'steady', closed: 'rupture',
  },
};

function writeValidSheet(file, spec) {
  const png = new PNG({ width: spec.width, height: spec.height });
  for (let row = 0; row < spec.rows; row += 1) {
    for (let col = 0; col < spec.columns; col += 1) {
      const left = col * spec.frameWidth + 5 + ((row + col) % 3);
      const top = row * spec.frameHeight + (spec.frameHeight === 72 ? 60 : 70);
      for (let y = top; y < top + 8; y += 1) {
        for (let x = left; x < left + 12; x += 1) {
          const i = (y * png.width + x) * 4;
          png.data[i] = 240; png.data[i + 1] = 199; png.data[i + 2] = 165; png.data[i + 3] = 255;
        }
      }
    }
  }
  writeFileSync(file, PNG.sync.write(png));
}

function mirrorDirection(file, spec, leftRow = 1, rightRow = 2) {
  const png = PNG.sync.read(readFileSync(file));
  for (let column = 0; column < spec.columns; column += 1) {
    for (let y = 0; y < spec.frameHeight; y += 1) {
      for (let x = 0; x < spec.frameWidth; x += 1) {
        const source = ((leftRow * spec.frameHeight + y) * png.width
          + column * spec.frameWidth + x) * 4;
        const target = ((rightRow * spec.frameHeight + y) * png.width
          + column * spec.frameWidth + (spec.frameWidth - 1 - x)) * 4;
        png.data.copy(png.data, target, source, source + 4);
      }
    }
  }
  writeFileSync(file, PNG.sync.write(png));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'siep-character-'));
  const variant = join(root, 'valentina', 'base');
  mkdirSync(variant, { recursive: true });
  for (const [id, spec] of Object.entries(SHEET_SPECS)) writeValidSheet(join(variant, `${id}.png`), spec);
  return root;
}

function actorFixture() {
  const root = fixture();
  const variant = join(root, 'actors', 'cuidadora-familia-vbg', 'base');
  mkdirSync(variant, { recursive: true });
  for (const [id, spec] of Object.entries(SHEET_SPECS)) writeValidSheet(join(variant, `${id}.png`), spec);
  return root;
}

test('genera geometría, secuencias y hashes desde PNG reales', () => {
  const manifest = buildCharacterManifest({
    assetsRoot: fixture(), roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina',
  });
  const valentina = manifest.identities[0].variants[0];
  assert.equal(manifest.logicalFrame.width, 48);
  assert.equal(manifest.identities.length, 1);
  assert.equal(manifest.palettes[0].paletteId, 'siep-master-v1');
  assert.match(manifest.palettes[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(valentina.paletteHash, manifest.palettes[0].sha256);
  assert.equal(valentina.sheets.walk.width, 288);
  assert.equal(valentina.animations.walk.directions.right.length, 6);
  assert.deepEqual(valentina.animations.walk.contactSequenceIndices, [0, 3]);
  assert.deepEqual(manifest.consequenceReactions, {
    relief: { animationId: 'reactRelief', portraitState: 'relief' },
    steady: { animationId: 'reactSteady', portraitState: 'steady' },
    tension: { animationId: 'reactTension', portraitState: 'tension' },
    rupture: { animationId: 'reactRupture', portraitState: 'rupture' },
  });
  assert.deepEqual(manifest.clinicalEmotionPortraitStates, clinicalEmotionMap.emotions);
  for (const { animationId, portraitState } of Object.values(manifest.consequenceReactions)) {
    assert.equal(valentina.animations[animationId].directions.down.length, 4);
    assert.equal(valentina.portrait.states[portraitState].length, 4);
  }
  assert.match(valentina.sheets.walk.sha256, /^[a-f0-9]{64}$/);
  assert.match(valentina.contentHash, /^[a-f0-9]{64}$/);
});

test('falla ante dimensión incorrecta, PNG ausente o color fuera de paleta', () => {
  const root = fixture();
  writeValidSheet(join(root, 'valentina', 'base', 'idle.png'), { ...SHEET_SPECS.idle, width: 191 });
  assert.throws(() => buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina' }), /idle.*191x288.*192x288/);
  const missingRoot = mkdtempSync(join(tmpdir(), 'siep-character-missing-'));
  assert.throws(() => buildCharacterManifest({ assetsRoot: missingRoot, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina' }), /idle\.png.*no existe/);
  const badColorRoot = fixture();
  const idleFile = join(badColorRoot, 'valentina', 'base', 'idle.png');
  const idle = PNG.sync.read(readFileSync(idleFile));
  idle.data[(((60 * idle.width) + 5) * 4) + 0] = 0;
  idle.data[(((60 * idle.width) + 5) * 4) + 1] = 0;
  idle.data[(((60 * idle.width) + 5) * 4) + 2] = 0;
  writeFileSync(idleFile, PNG.sync.write(idle));
  assert.throws(
    () => buildCharacterManifest({ assetsRoot: badColorRoot, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina' }),
    /color fuera de paleta #000000/,
  );
});

test('rechaza ids duplicados y una vista derecha que sea espejo exacto de izquierda', () => {
  const root = fixture();
  mirrorDirection(join(root, 'valentina', 'base', 'idle.png'), SHEET_SPECS.idle);
  const duplicated = { ...roster, identities: [...roster.identities, roster.identities[0]] };
  assert.throws(() => buildCharacterManifest({ assetsRoot: root, roster: duplicated, palette, clinicalEmotionMap, onlyCharacter: 'valentina' }), /characterId duplicado/);
  const withoutLicense = {
    ...roster,
    identities: [{ ...roster.identities[0], provenance: { ...roster.identities[0].provenance, license: '' } }],
  };
  assert.throws(
    () => buildCharacterManifest({ assetsRoot: root, roster: withoutLicense, palette, clinicalEmotionMap, onlyCharacter: 'valentina' }),
    /procedencia\/licencia inválida/,
  );
  assert.throws(
    () => buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina', provenanceRoot: root }),
    /sourceAsset no existe/,
  );
  assert.throws(
    () => buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina', rejectMirroredDirections: true }),
    /izquierda.*derecha.*autoradas/,
  );
});

test('genera visuales NPC no seleccionables con el mismo rig y mappings fail-closed', () => {
  const manifest = buildCharacterManifest({
    assetsRoot: actorFixture(), roster, actorRoster, palette, clinicalEmotionMap,
    onlyActor: 'cuidadora-familia-vbg',
  });
  assert.equal(manifest.identities.length, 0);
  assert.equal(manifest.actorVisuals.length, 1);
  assert.equal(manifest.actorVisuals[0].variant.logicalScale, 1);
  assert.deepEqual(manifest.actorVisuals[0].variant.animations.walk.contactSequenceIndices, [0, 3]);
  assert.equal(manifest.actorMappings['familia-duelo'], 'cuidadora-familia-vbg');
  assert.equal(manifest.actorMappings['familia-crisis'], 'cuidadora-familia-vbg');
  assert.throws(() => buildCharacterManifest({
    assetsRoot: actorFixture(), roster,
    actorRoster: { ...actorRoster, actorMappings: { 'familia-duelo': 'no-existe' } },
    palette, clinicalEmotionMap, onlyActor: 'cuidadora-familia-vbg',
  }), /visualId desconocido/);
  assert.throws(() => buildCharacterManifest({
    assetsRoot: actorFixture(), roster,
    actorRoster: { ...actorRoster, actorVisuals: [...actorRoster.actorVisuals, actorRoster.actorVisuals[0]] },
    palette, clinicalEmotionMap, onlyActor: 'cuidadora-familia-vbg',
  }), /visualId duplicado/);
});

test('rechaza un mapa clínico ausente, con schema o estado de retrato inválido', () => {
  const root = fixture();
  assert.throws(
    () => buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap: null, onlyCharacter: 'valentina' }),
    /clinicalEmotionMap/,
  );
  assert.throws(
    () => buildCharacterManifest({
      assetsRoot: root, roster, palette,
      clinicalEmotionMap: { ...clinicalEmotionMap, schemaVersion: 2 },
      onlyCharacter: 'valentina',
    }),
    /schemaVersion/,
  );
  assert.throws(
    () => buildCharacterManifest({
      assetsRoot: root, roster, palette,
      clinicalEmotionMap: { schemaVersion: 1, emotions: { neutral: 'surprised' } },
      onlyCharacter: 'valentina',
    }),
    /PortraitState/,
  );
});
```

- [ ] **Step 3: Añadir el script de test y confirmar el rojo**

En `frontend/package.json`, añadir temporalmente:

```json
"test:character-assets": "node --test scripts/character-manifest-lib.test.mjs"
```

Run: `npm run test:character-assets --prefix frontend`

Expected: FAIL con `Cannot find module ... character-manifest-lib.mjs`.

- [ ] **Step 4: Escribir la biblia visual completa antes de dibujar**

```markdown
<!-- docs/visual/premium-visual-bible-v1.md -->
# Biblia visual premium SIEP v1

## Métrica inmutable
- Frame lógico: 48×72 px; pivote/punto de pies frame-local (24,68).
- Hitbox relativo al pivote: `(-11,-16,22,16)`; equivalente frame-local `(13,52,22,16)`, centrado y apoyado en los pies.
- Silueta adulta estilizada: cabeza 18–21 px, hombros 20–27 px, altura opaca 60–66 px.
- Contorno exterior: 1 px `#15131d`; separaciones internas: `#211e2b` o sombra local.
- Luz: arriba-izquierda; un tono base, uno de sombra y uno de luz por material.
- Alfa binario; cero antialias; cero píxeles opacos en el borde del frame.
- Escala de presentación entera 1×/2×/3×/4× y `image-rendering: pixelated`.

## Rig y timing compartidos
- Filas direccionales: abajo, izquierda, derecha, arriba. Izquierda y derecha se dibujan; nunca se espejan.
- `idle`: 4 frames a 4 fps; respiración de 1 px autorada y un parpadeo, sin `scaleY`.
- `walk`: 6 frames a 10 fps; contactos en 0 y 3; pies regresan a reposo al detenerse.
- `talk`: 4 frames a 7 fps; gesto contenido, sin caminar.
- `interact`: 4 frames a 8 fps, no loop; alcance máximo de una mano sin cambiar pivote.
- `turn`: 3 frames a 12 fps, no loop; silueta intermedia real hacia la dirección objetivo.
- `react`: cuatro bloques consecutivos de 4 filas cardinales × 4 frames:
  `reactRelief`, `reactSteady`, `reactTension`, `reactRupture`; no loop, sin
  compartir rangos. El gesto comunica alivio, regulación estable, tensión o
  ruptura sin exageración ni estigma.
- Retrato 96×96: neutral, focused, concerned, relieved, relief, steady, tension
  y rupture; 4 frames por estado, microparpadeo/habla. Los cuatro últimos deben
  concordar inequívocamente con la reacción corporal del mismo tono.

## Lenguaje común
- Proporción, línea de ojos, pivote, longitud de zancada, contorno y luz son idénticos en las diez identidades.
- Diversidad mediante silueta de cabello, piel, facciones, cuerpo y ropa; no mediante otro estilo o resolución.
- Ropa profesional contemporánea, sobria y sin marcas; índigo/azul/vino/verde como acentos.
- Cada identidad debe reconocerse en sprite y retrato sin depender del color.

## Mundo y HUD bajo el mismo lenguaje
- Los ocho `mapKey` del slice se inventariarán explícitamente aunque tres etapas
  reutilicen el mismo room visual; reutilizar geometría no permite omitir el
  binding ni su hash.
- Tilesets y mobiliario conservan perspectiva 3/4, horizonte, contorno de 1 px,
  luz arriba-izquierda y escalones discretos. No se mezclan tamaños de píxel,
  gradientes raster, glow suave, perspectiva frontal y 3/4 en una misma sala.
- Todo `PERSON` usa `ActorRenderPlan`; `OBJECT`, `TOOL` y `EXIT` usan sprites
  autorados del inventario. Un marcador de texto, Material Icon, rectángulo
  genérico o tint no es fallback aceptable en producción.
- Señales, prompts, iconos y marcos HUD se dibujan en pixel art. Liquid Glass
  solo llena superficies interiores; borde, esquinas, iconografía y jerarquía
  continúan siendo pixel art nítido.
- La escala runtime es entera, `nearest-neighbor`; transform CSS/Phaser con
  escala fraccionaria, smoothing, mipmap o resize bilineal bloquean el gate.

## Gate por identidad
1. Los siete atlas pasan `validate-character-manifest.mjs --character <id>`.
2. No hay vista espejada, frame vacío, pie flotante, salto de pivote ni color fuera de paleta.
3. Preview 4× revisado en idle, walk, talk, interact, turn y las cuatro reacciones.
4. Retrato y sprite coinciden en piel, cabello, ropa y expresión base.
5. Procedencia/licencia están presentes; una salida generativa cruda se rechaza.

## Gate por asset de mundo/UI
1. El asset aparece una vez en `inventory.v1.json`, con `assetId`, categoría,
   `src`, `sourceAsset`, licencia, dimensiones, tile size cuando aplique,
   `logicalScale: 1`, paleta y bindings de mapa/objeto/HUD.
2. El validador abre los bytes PNG y los tilesets enlazados desde cada mapa;
   ruta inexistente, escape de raíz, dimensiones/grilla rotas, alfa parcial,
   color no permitido, escala no entera o binding huérfano falla.
3. El estado inicial de cualquier asset heredado es `unreviewed`; solo el arte
   remasterizado y aprobado en revisión humana exact-HEAD puede pasar a
   `candidate`. La aprobación final vive fuera de Git en el plan de checkpoint.
4. Contact sheet 1× y screenshot live a 1366×768/1600×900 demuestran el asset
   en contexto; una inspección aislada del PNG no basta.
```

- [ ] **Step 5: Crear la paleta maestra versionada**

```json
{
  "schemaVersion": 1,
  "paletteId": "siep-master-v1",
  "outline": "#15131d",
  "masterColors": [
    "#15131d", "#211e2b", "#302a3b", "#494255", "#6c6376", "#948a9b",
    "#f7dfcc", "#e9bea0", "#cf8f6f", "#a8614c",
    "#f0c7a5", "#d99a76", "#b86f52", "#824735",
    "#d6a17f", "#b97656", "#92513b", "#623326",
    "#ad7758", "#87543d", "#623b2d", "#40271f",
    "#774a35", "#563223", "#38231d", "#241817",
    "#2a2630", "#3d3543", "#594957", "#765d68",
    "#5c3928", "#7b4a30", "#a06a40", "#c08a55",
    "#8a542f", "#b7783e", "#d7a957", "#f0d17a",
    "#552b26", "#79372d", "#a84e36", "#d06c49",
    "#62636c", "#858690", "#adaeb5", "#d2d2d4",
    "#2d2852", "#433878", "#6350a6", "#8a70d3", "#b49bea",
    "#203d61", "#2c5884", "#3d78a8", "#69a2c8", "#a2cbe1",
    "#29483d", "#3d6a55", "#5b8d70", "#85b294", "#bad2be",
    "#562d3a", "#7b3b4c", "#a95366", "#d47b8b", "#efb0b8",
    "#353a46", "#505866", "#737d8b", "#a3abb5", "#d5d9dd",
    "#f1f2f4", "#ffffff"
  ]
}
```

- [ ] **Step 6: Crear el roster exacto, sin opciones ficticias**

```json
{
  "schemaVersion": 1,
  "manifestVersion": "1.0.0",
  "defaultCharacterId": "valentina",
  "identities": [
    { "characterId": "valentina", "displayName": "Valentina", "summary": "Serena, observadora y de expresión cálida.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/valentina.png" } },
    { "characterId": "andres", "displayName": "Andrés", "summary": "Sobrio, atento y de postura tranquila.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/andres.png" } },
    { "characterId": "camila", "displayName": "Camila", "summary": "Expresiva, profesional y cercana.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/camila.png" } },
    { "characterId": "daniela", "displayName": "Daniela", "summary": "Reflexiva, precisa y de lenguaje corporal contenido.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/daniela.png" } },
    { "characterId": "david", "displayName": "David", "summary": "Metódico, amable y de silueta reconocible.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/david.png" } },
    { "characterId": "felipe", "displayName": "Felipe", "summary": "Concentrado, humano y de presencia sobria.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/felipe.png" } },
    { "characterId": "jorge", "displayName": "Jorge", "summary": "Adulto, sereno y de porte profesional.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/jorge.png" } },
    { "characterId": "luisa", "displayName": "Luisa", "summary": "Segura, empática y visualmente diferenciada.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/luisa.png" } },
    { "characterId": "mariana", "displayName": "Mariana", "summary": "Atenta, sobria y de expresión sensible.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/mariana.png" } },
    { "characterId": "mateo", "displayName": "Mateo", "summary": "Calmado, accesible y de postura profesional.", "provenance": { "source": "Remaster original del elenco SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/mateo.png" } }
  ]
}
```

Crear también `frontend/src/assets/characters/v1/actor-roster.v1.json` con el
catálogo no seleccionable y el mapping exhaustivo del corte. Las tres
reutilizaciones son intencionales y representan al mismo actor a través de dos
salas o estados del caso; ninguna apunta a una identidad seleccionable:

```json
{
  "schemaVersion": 1,
  "actorVisuals": [
    { "visualId": "cuidadora-familia-vbg", "displayName": "Cuidadora familiar", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_madre-vbg.png" } },
    { "visualId": "psicologa-hospitalaria", "displayName": "Psicóloga hospitalaria", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_psicologa-hospitalaria.png" } },
    { "visualId": "sobreviviente-vbg", "displayName": "Sobreviviente", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_paciente-vbg.png" } },
    { "visualId": "profesional-psicosocial", "displayName": "Profesional psicosocial", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_comisaria-profesional.png" } },
    { "visualId": "funcionaria-recepcion", "displayName": "Funcionaria de recepción", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_funcionaria-recepcion.png" } },
    { "visualId": "enfermera-urgencias", "displayName": "Enfermera de urgencias", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_colega-clinica.png" } },
    { "visualId": "medico-guardia", "displayName": "Médico de guardia", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_supervisor-clinico.png" } },
    { "visualId": "psicologa-orientadora", "displayName": "Psicóloga orientadora", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_psicologa-hospitalaria.png" } },
    { "visualId": "trabajadora-social", "displayName": "Trabajadora social", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_comisaria-profesional.png" } },
    { "visualId": "orientadora-juridica", "displayName": "Orientadora jurídica", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_funcionaria-recepcion.png" } },
    { "visualId": "madre-acompanante", "displayName": "Madre acompañante", "provenance": { "source": "Remaster original SIEP", "license": "SIEP-INTERNAL", "sourceAsset": "cast/npc_madre-vbg.png" } }
  ],
  "actorMappings": {
    "familia-duelo": "cuidadora-familia-vbg",
    "familia-crisis": "cuidadora-familia-vbg",
    "psicologa-acompanante": "psicologa-hospitalaria",
    "sobreviviente-consulta": "sobreviviente-vbg",
    "sobreviviente-espera": "sobreviviente-vbg",
    "profesional-psicosocial": "profesional-psicosocial",
    "apoyo-psicosocial": "profesional-psicosocial",
    "funcionaria-recepcion": "funcionaria-recepcion",
    "enfermera-urgencias": "enfermera-urgencias",
    "medico-guardia": "medico-guardia",
    "psicologa-orientadora": "psicologa-orientadora",
    "trabajadora-social": "trabajadora-social",
    "orientadora-juridica": "orientadora-juridica",
    "madre-acompanante": "madre-acompanante"
  }
}
```

Crear `clinical-emotion-map.v1.json` como autoridad exhaustiva de las emociones
que llegan desde diálogos/decisiones. Los cuatro tonos de consecuencia no se
derivan de esta tabla; llegan tipados como `ConsequenceTone` y seleccionan su
slot homónimo. Este archivo solo resuelve retrato para emoción narrativa:

```json
{
  "schemaVersion": 1,
  "emotions": {
    "neutral": "neutral",
    "positive": "relieved",
    "negative": "concerned",
    "anxious": "concerned",
    "danger": "concerned",
    "sad": "concerned",
    "worried": "concerned",
    "relieved": "relieved",
    "concerned": "concerned",
    "receptive": "relief",
    "calm": "steady",
    "closed": "rupture"
  }
}
```

El test backend `test_visual_inventory_contract.py` importa `MAPS` y
`MAP_OBJECTS` de `seed_caso_pdf.py`, extrae todas las emociones de sus líneas de
diálogo y suma dos contratos explícitos ya aprobados: las emociones proyectadas
del árbol (`neutral|positive|concerned|danger`) y las cuatro que consumirá el
plan living-case (`receptive|calm|worried|closed`). Compara ese conjunto exacto
con esta tabla; así Plan 1 puede ejecutarse antes de Plan 4 sin importar un módulo
futuro. Una emoción nueva sin mapping falla con su nombre; no se permite
convertirla en `neutral` o `concerned` por defecto.

Crear también `frontend/src/assets/visual/v1/inventory.v1.json`. Cada entrada
`assets[]` es explícita —sin globs— y usa este schema:

```json
{
  "schemaVersion": 1,
  "status": "unreviewed",
  "mapBindings": {
    "hospital-urgencias": "hospital-urgencias",
    "hospital-sala-escucha": "hospital-sala-escucha",
    "hospital-sala-escucha-accion": "hospital-sala-escucha",
    "hospital-sala-escucha-cierre": "hospital-sala-escucha",
    "comisaria-recepcion": "comisaria-recepcion",
    "comisaria-consultorio": "comisaria-consultorio",
    "comisaria-consultorio-marco": "comisaria-consultorio",
    "comisaria-consultorio-cierre": "comisaria-consultorio"
  },
  "assets": [
    {
      "assetId": "tileset.urban",
      "category": "tileset",
      "src": "/assets/game/kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png",
      "sourceAsset": "visual/v1/sources/kenney-rpg-urban-tilemap_packed.png",
      "license": "CC0-1.0",
      "expected": { "width": 432, "height": 288, "tileWidth": 16, "tileHeight": 16 },
      "logicalScale": 1,
      "paletteId": "siep-world-v1",
      "bindings": ["map:hospital-urgencias"],
      "reviewStatus": "unreviewed"
    }
  ]
}
```

El tamaño del ejemplo corresponde al PNG actual auditado, pero sigue siendo una
expectativa que falla si la remasterización cambia la grilla sin actualizar el
inventario deliberadamente. El archivo final debe listar, como mínimo y sin
omitir ningún binding runtime:

| Grupo exhaustivo | IDs/rutas obligatorias |
|---|---|
| Mapas | los ocho `mapKey` anteriores; cada uno enlaza su ScenarioConfig/map JSON y cada tileset transitivo |
| Tilesets | los tres `tilemap_packed.png` bajo `rpg-urban-pack`, `tiny-dungeon` y `tiny-town` |
| Mobiliario | `chair`, `coffee_table`, `counter`, `desk`, `file_cabinet`, `gurney`, `plant`, `shelf`, `sofa`, `waiting_chairs` |
| PERSON | los catorce `actorMappings`; el asset final es siempre uno de los once `ActorRenderPlan`, nunca un marcador |
| OBJECT | `object_acceso_restringido`, `object_cierre`, `object_expediente`, `object_marco_normativo`, `object_registro` |
| TOOL | `tool_pap`, `tool_reflection_journal`, `tool_risk_meter`, `tool_safety_route`, `tool_spikes` |
| EXIT | las diez vistas `door_consultorio{,_side}`, `door_recepcion{,_side}`, `door_sala_escucha{,_side}`, `door_salida_institucional{,_side}`, `door_urgencias{,_side}` |
| Señales/prompts | `signal-person`, `signal-object`, `signal-tool`, `signal-exit`, `prompt-interact`, `prompt-locked`, `prompt-keyboard`, `prompt-gamepad` |
| HUD/marcos | `hud-objective-frame`, `hud-inventory-frame`, `interaction-prompt-frame`, `dialogue-frame`, `choice-frame`, `journal-frame`; iconos `objective`, `inventory`, `journal`, `settings`, `audio`, `close`, `decision`, `consequence` |

Los nuevos sprites de señales/HUD viven bajo
`frontend/src/assets/game/ui/premium-v1/`; el inventario fija dimensiones y
procedencia individual. Los componentes de planes posteriores consumen esos
IDs; no sustituyen un asset faltante por Material Icons, emoji, SVG genérico,
rectángulo/tint o texto abreviado.

- [ ] **Step 7: Implementar el generador/validador completo**

```js
// frontend/scripts/character-manifest-lib.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';

export const SHEET_SPECS = Object.freeze({
  idle:     { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  walk:     { width: 288, height: 288, frameWidth: 48, frameHeight: 72, columns: 6, rows: 4 },
  talk:     { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  interact: { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  turn:     { width: 144, height: 288, frameWidth: 48, frameHeight: 72, columns: 3, rows: 4 },
  react:    { width: 192, height: 1152, frameWidth: 48, frameHeight: 72, columns: 4, rows: 16 },
  portrait: { width: 384, height: 768, frameWidth: 96, frameHeight: 96, columns: 4, rows: 8 },
});

const WORLD_SHEETS = ['idle', 'walk', 'talk', 'interact', 'turn', 'react'];
const DIRECTION_ROWS = Object.freeze({ down: 0, left: 1, right: 2, up: 3 });
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value);

function frames(columns, row) {
  return Array.from({ length: columns }, (_, column) => row * columns + column);
}

function directions(columns, rowOffset = 0) {
  return Object.fromEntries(Object.entries(DIRECTION_ROWS).map(([direction, row]) => [
    direction, frames(columns, row + rowOffset),
  ]));
}

function rgbaAt(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function hex([r, g, b]) {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function frameOpaqueCount(png, spec, row, column) {
  let count = 0;
  for (let y = row * spec.frameHeight; y < (row + 1) * spec.frameHeight; y += 1) {
    for (let x = column * spec.frameWidth; x < (column + 1) * spec.frameWidth; x += 1) {
      if (rgbaAt(png, x, y)[3] === 255) count += 1;
    }
  }
  return count;
}

function frameBottom(png, spec, row, column) {
  for (let localY = spec.frameHeight - 1; localY >= 0; localY -= 1) {
    for (let localX = 0; localX < spec.frameWidth; localX += 1) {
      const x = column * spec.frameWidth + localX;
      const y = row * spec.frameHeight + localY;
      if (rgbaAt(png, x, y)[3] === 255) return localY;
    }
  }
  return -1;
}

function exactHorizontalMirror(png, spec, leftRow, rightRow) {
  for (let column = 0; column < spec.columns; column += 1) {
    for (let y = 0; y < spec.frameHeight; y += 1) {
      for (let x = 0; x < spec.frameWidth; x += 1) {
        const left = rgbaAt(png, column * spec.frameWidth + x, leftRow * spec.frameHeight + y);
        const right = rgbaAt(png, column * spec.frameWidth + (spec.frameWidth - 1 - x), rightRow * spec.frameHeight + y);
        if (left.some((value, index) => value !== right[index])) return false;
      }
    }
  }
  return true;
}

function inspectPng(file, id, spec, palette, rejectMirroredDirections) {
  if (!existsSync(file)) throw new Error(`${file}: no existe`);
  const bytes = readFileSync(file);
  const png = PNG.sync.read(bytes);
  if (png.width !== spec.width || png.height !== spec.height) {
    throw new Error(`${id}: ${png.width}x${png.height}; esperado ${spec.width}x${spec.height}`);
  }
  const allowed = new Set(palette.masterColors.map(color => color.toLowerCase()));
  const used = new Set();
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const rgba = rgbaAt(png, x, y);
      if (rgba[3] !== 0 && rgba[3] !== 255) throw new Error(`${id}: alfa no binario en ${x},${y}`);
      if (rgba[3] === 0) continue;
      const frameX = x % spec.frameWidth; const frameY = y % spec.frameHeight;
      if (frameX === 0 || frameY === 0 || frameX === spec.frameWidth - 1 || frameY === spec.frameHeight - 1) {
        throw new Error(`${id}: píxel opaco en borde de frame ${x},${y}`);
      }
      const color = hex(rgba).toLowerCase();
      if (!allowed.has(color)) throw new Error(`${id}: color fuera de paleta ${color}`);
      used.add(color);
    }
  }
  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      if (frameOpaqueCount(png, spec, row, column) < 64) {
        throw new Error(`${id}: frame vacío o incompleto fila=${row} columna=${column}`);
      }
      if (id !== 'portrait') {
        const bottom = frameBottom(png, spec, row, column);
        if (bottom < 66 || bottom > 68) throw new Error(`${id}: pies fuera del pivote fila=${row} columna=${column} y=${bottom}`);
      }
    }
  }
  if (used.size > 48) throw new Error(`${id}: usa ${used.size} colores; máximo 48`);
  if (rejectMirroredDirections && id !== 'portrait') {
    const directionalGroups = id === 'react' ? [0, 4] : [0];
    if (directionalGroups.some(offset => exactHorizontalMirror(png, spec, offset + 1, offset + 2))) {
      throw new Error(`${id}: izquierda y derecha deben ser autoradas, no espejadas`);
    }
  }
  return { bytes, sha256: digest(bytes) };
}

function animation(id, sheetId, fps, loop, map, contactSequenceIndices = []) {
  return { id, sheetId, fps, loop, directions: map, contactSequenceIndices };
}

function buildAnimations() {
  return {
    idle: animation('idle', 'idle', 4, true, directions(4)),
    walk: animation('walk', 'walk', 10, true, directions(6), [0, 3]),
    talk: animation('talk', 'talk', 7, true, directions(4)),
    interact: animation('interact', 'interact', 8, false, directions(4)),
    turn: animation('turn', 'turn', 12, false, directions(3)),
    reactRelief: animation('reactRelief', 'react', 7, false, directions(4, 0)),
    reactSteady: animation('reactSteady', 'react', 7, false, directions(4, 4)),
    reactTension: animation('reactTension', 'react', 7, false, directions(4, 8)),
    reactRupture: animation('reactRupture', 'react', 7, false, directions(4, 12)),
  };
}

function assertProvenance(ownerId, item, provenanceRoot) {
  const provenance = item.provenance ?? {};
  const values = [ownerId, item.displayName, provenance.source, provenance.license, provenance.sourceAsset];
  if ('summary' in item) values.push(item.summary);
  if (!values.every(value => typeof value === 'string' && value.trim().length > 0)) {
    throw new Error(`${ownerId ?? 'sin-id'}: procedencia/licencia inválida`);
  }
  if (!provenanceRoot) return;
  const root = resolve(provenanceRoot);
  const source = resolve(root, provenance.sourceAsset);
  const child = relative(root, source);
  if (child.startsWith('..') || isAbsolute(child) || !existsSync(source)) {
    throw new Error(`${ownerId}: sourceAsset no existe o sale de provenanceRoot`);
  }
}

function buildVariant({ assetsRoot, diskParts, publicParts, ownerId, palette, paletteRef, rejectMirroredDirections }) {
  const dir = join(assetsRoot, ...diskParts, 'base');
  const inspected = Object.fromEntries(Object.entries(SHEET_SPECS).map(([id, spec]) => [
    id, inspectPng(join(dir, `${id}.png`), id, spec, palette, rejectMirroredDirections),
  ]));
  const src = id => posix.join('/assets/characters/v1', ...publicParts, 'base', `${id}.png`);
  const sheets = Object.fromEntries(WORLD_SHEETS.map(id => [id, {
    id, src: src(id), ...SHEET_SPECS[id], sha256: inspected[id].sha256,
  }]));
  const portrait = {
    sheet: { id: 'portrait', src: src('portrait'), ...SHEET_SPECS.portrait, sha256: inspected.portrait.sha256 },
    fps: 6,
    states: {
      neutral: frames(4, 0), focused: frames(4, 1),
      concerned: frames(4, 2), relieved: frames(4, 3),
      relief: frames(4, 4), steady: frames(4, 5),
      tension: frames(4, 6), rupture: frames(4, 7),
    },
  };
  const geometry = {
    paletteId: paletteRef.paletteId, paletteHash: paletteRef.sha256,
    logicalScale: 1, pivot: { x: 24, y: 68 },
    feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
    shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 },
  };
  const animations = buildAnimations();
  const hashPayload = { ownerId, variantId: 'base', ...geometry, sheets, animations, portrait };
  return {
    variantId: 'base', contentHash: digest(canonical(hashPayload)), ...geometry,
    sheets, animations, portrait,
  };
}

const PORTRAIT_STATES = new Set([
  'neutral', 'focused', 'concerned', 'relieved',
  'relief', 'steady', 'tension', 'rupture',
]);

function normalizeClinicalEmotionPortraitStates(clinicalEmotionMap) {
  if (!clinicalEmotionMap || clinicalEmotionMap.schemaVersion !== 1
    || !clinicalEmotionMap.emotions || Array.isArray(clinicalEmotionMap.emotions)) {
    throw new Error('clinicalEmotionMap schemaVersion/emotions inválido');
  }
  const entries = Object.entries(clinicalEmotionMap.emotions)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) throw new Error('clinicalEmotionMap vacío');
  for (const [emotion, portraitState] of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(emotion)) throw new Error(`emoción inválida: ${emotion}`);
    if (!PORTRAIT_STATES.has(portraitState)) {
      throw new Error(`${emotion}: PortraitState desconocido ${portraitState}`);
    }
  }
  return Object.fromEntries(entries);
}

export function buildCharacterManifest({
  assetsRoot, roster, actorRoster = { schemaVersion: 1, actorVisuals: [], actorMappings: {} },
  palette, clinicalEmotionMap,
  onlyCharacter = null, onlyActor = null, rejectMirroredDirections = true, provenanceRoot = null,
}) {
  if (roster.schemaVersion !== 1 || actorRoster.schemaVersion !== 1 || palette.schemaVersion !== 1) {
    throw new Error('schemaVersion de assets no soportada');
  }
  if (onlyCharacter && onlyActor) throw new Error('--character y --actor son excluyentes');
  if (typeof palette.paletteId !== 'string' || !/^[a-z0-9-]+$/.test(palette.paletteId)) throw new Error('paletteId inválido');
  const clinicalEmotionPortraitStates = normalizeClinicalEmotionPortraitStates(clinicalEmotionMap);

  const characterIds = roster.identities.map(identity => identity.characterId);
  const visualIds = actorRoster.actorVisuals.map(actor => actor.visualId);
  if (new Set(characterIds).size !== characterIds.length) throw new Error('characterId duplicado');
  if (new Set(visualIds).size !== visualIds.length) throw new Error('visualId duplicado');
  if (!onlyCharacter && !onlyActor && characterIds.length !== 10) {
    throw new Error(`el roster premium exige 10 identidades; recibió ${characterIds.length}`);
  }
  for (const identity of roster.identities) assertProvenance(identity.characterId, identity, provenanceRoot);
  for (const actor of actorRoster.actorVisuals) assertProvenance(actor.visualId, actor, provenanceRoot);
  for (const [actorId, visualId] of Object.entries(actorRoster.actorMappings)) {
    if (!actorId.trim()) throw new Error('actorId vacío');
    if (!visualIds.includes(visualId)) throw new Error(`${actorId}: visualId desconocido ${visualId}`);
  }
  for (const visualId of visualIds) {
    if (!Object.values(actorRoster.actorMappings).includes(visualId)) throw new Error(`${visualId}: visual sin actorId`);
  }

  const selectedCharacters = onlyActor ? [] : onlyCharacter
    ? roster.identities.filter(identity => identity.characterId === onlyCharacter)
    : roster.identities;
  const selectedActors = onlyCharacter ? [] : onlyActor
    ? actorRoster.actorVisuals.filter(actor => actor.visualId === onlyActor)
    : actorRoster.actorVisuals;
  if (onlyCharacter && selectedCharacters.length === 0) throw new Error(`characterId desconocido: ${onlyCharacter}`);
  if (onlyActor && selectedActors.length === 0) throw new Error(`visualId desconocido: ${onlyActor}`);

  const paletteRef = {
    paletteId: palette.paletteId,
    src: '/assets/characters/v1/palette.v1.json',
    sha256: digest(canonical(palette)),
  };
  const identities = selectedCharacters.map(identity => ({
    ...identity,
    variants: [buildVariant({
      assetsRoot, diskParts: [identity.characterId], publicParts: [identity.characterId],
      ownerId: identity.characterId, palette, paletteRef, rejectMirroredDirections,
    })],
  }));
  const actorVisuals = selectedActors.map(actor => ({
    ...actor,
    variant: buildVariant({
      assetsRoot, diskParts: ['actors', actor.visualId], publicParts: ['actors', actor.visualId],
      ownerId: actor.visualId, palette, paletteRef, rejectMirroredDirections,
    }),
  }));
  const selectedVisualIds = new Set(actorVisuals.map(actor => actor.visualId));
  const actorMappings = Object.fromEntries(Object.entries(actorRoster.actorMappings)
    .filter(([, visualId]) => selectedVisualIds.has(visualId)));
  const consequenceReactions = {
    relief: { animationId: 'reactRelief', portraitState: 'relief' },
    steady: { animationId: 'reactSteady', portraitState: 'steady' },
    tension: { animationId: 'reactTension', portraitState: 'tension' },
    rupture: { animationId: 'reactRupture', portraitState: 'rupture' },
  };
  const body = {
    schemaVersion: 1, manifestVersion: roster.manifestVersion,
    defaultCharacterId: roster.defaultCharacterId, logicalFrame: { width: 48, height: 72 },
    consequenceReactions, clinicalEmotionPortraitStates,
    palettes: [paletteRef], identities, actorVisuals, actorMappings,
  };
  return { ...body, manifestHash: digest(canonical(body)) };
}

export function renderCharacterReadme(manifest) {
  const rows = manifest.identities.map(identity => {
    const variant = identity.variants[0];
    return `| \`${identity.characterId}\` | ${identity.displayName} | \`${variant.variantId}\` | \`${variant.contentHash}\` |`;
  });
  const actorRows = manifest.actorVisuals.map(actor =>
    `| \`${actor.visualId}\` | ${actor.displayName} | \`${actor.variant.contentHash}\` |`,
  );
  return [
    '# Assets de personajes SIEP v1',
    '',
    '> Archivo generado por `npm run validate:characters:write`. No editar a mano.',
    '',
    `Manifest: \`${manifest.manifestVersion}\` / \`${manifest.manifestHash}\``,
    '',
    '| characterId | Nombre | Variante | contentHash |',
    '|---|---|---|---|',
    ...rows,
    '',
    '| visualId NPC | Nombre | contentHash |',
    '|---|---|---|',
    ...actorRows,
    '',
    `Mappings NPC: ${Object.keys(manifest.actorMappings).length}`,
    '',
    `Emociones narrativas: ${Object.keys(manifest.clinicalEmotionPortraitStates).length}`,
    '',
    'Cada variante contiene `idle.png`, `walk.png`, `talk.png`, `interact.png`, `turn.png`, `react.png` y `portrait.png`.',
    '',
  ].join('\n');
}

export function assertDerivedArtifact(name, current, expected) {
  if (current !== expected) throw new Error(`${name} está obsoleto; ejecuta validate:characters:write`);
}
```

```js
// frontend/scripts/validate-character-manifest.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDerivedArtifact, buildCharacterManifest, renderCharacterReadme,
} from './character-manifest-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = join(root, 'src', 'assets', 'characters', 'v1');
const roster = JSON.parse(readFileSync(join(assetsRoot, 'roster.v1.json'), 'utf8'));
const actorRoster = JSON.parse(readFileSync(join(assetsRoot, 'actor-roster.v1.json'), 'utf8'));
const palette = JSON.parse(readFileSync(join(assetsRoot, 'palette.v1.json'), 'utf8'));
const clinicalEmotionMap = JSON.parse(readFileSync(join(assetsRoot, 'clinical-emotion-map.v1.json'), 'utf8'));
const args = process.argv.slice(2);
const characterAt = args.indexOf('--character');
const onlyCharacter = characterAt >= 0 ? args[characterAt + 1] : null;
const actorAt = args.indexOf('--actor');
const onlyActor = actorAt >= 0 ? args[actorAt + 1] : null;
if (characterAt >= 0 && (!onlyCharacter || onlyCharacter.startsWith('--'))) {
  throw new Error('--character requiere un characterId');
}
if (actorAt >= 0 && (!onlyActor || onlyActor.startsWith('--'))) {
  throw new Error('--actor requiere un visualId');
}
const manifest = buildCharacterManifest({
  assetsRoot, roster, actorRoster, palette, clinicalEmotionMap, onlyCharacter, onlyActor,
  provenanceRoot: dirname(assetsRoot),
});
const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
const output = join(assetsRoot, 'manifest.json');
const readme = join(assetsRoot, 'README.md');
const renderedReadme = renderCharacterReadme(manifest);

if (args.includes('--write')) {
  if (onlyCharacter || onlyActor) throw new Error('--write requiere validar identidades y actores completos');
  writeFileSync(output, rendered);
  writeFileSync(readme, renderedReadme);
  console.log(`OK: manifest y README escritos (${manifest.identities.length} identidades, ${manifest.actorVisuals.length} visuales NPC)`);
} else if (args.includes('--check')) {
  if (onlyCharacter || onlyActor) throw new Error('--check requiere validar identidades y actores completos');
  const current = readFileSync(output, 'utf8');
  assertDerivedArtifact('manifest.json', current, rendered);
  const currentReadme = readFileSync(readme, 'utf8');
  assertDerivedArtifact('README.md', currentReadme, renderedReadme);
  console.log(`OK: manifest vigente ${manifest.manifestHash}`);
} else {
  const ids = [
    ...manifest.identities.map(item => item.characterId),
    ...manifest.actorVisuals.map(item => item.visualId),
  ];
  console.log(`OK: ${ids.join(', ')}`);
}
```

En el mismo step, implementar el segundo pipeline sin mezclar su manifest con el
de personajes. `visual-asset-manifest-lib.mjs` exporta exactamente:

```js
export const REQUIRED_PREMIUM_MAP_KEYS = Object.freeze([
  'hospital-urgencias',
  'hospital-sala-escucha',
  'hospital-sala-escucha-accion',
  'hospital-sala-escucha-cierre',
  'comisaria-recepcion',
  'comisaria-consultorio',
  'comisaria-consultorio-marco',
  'comisaria-consultorio-cierre',
]);

export const REQUIRED_VISUAL_CATEGORIES = Object.freeze([
  'tileset', 'furniture', 'person', 'object', 'tool', 'exit',
  'signal', 'prompt', 'hud-frame', 'hud-icon',
]);

export function inspectVisualPng({ assetsRoot, sourceRoot, entry, palette }) {
  // Implementación obligatoria, en este orden:
  // 1. resolver `entry.src` bajo assetsRoot y `sourceAsset` bajo sourceRoot;
  // 2. rechazar ruta absoluta, `..`, symlink/realpath fuera de raíz y archivo ausente;
  // 3. abrir ambos archivos con PNG.sync.read, nunca confiar en la extensión;
  // 4. comparar width/height y divisibilidad por tileWidth/tileHeight declarados;
  // 5. exigir Number.isInteger(logicalScale) && logicalScale >= 1;
  // 6. recorrer cada píxel: alpha solo 0/255 y cada RGB opaco en la paleta indicada;
  // 7. exigir assetId/categoría/bindings únicos, procedencia/licencia no vacías;
  // 8. devolver sha256 de salida y sourceSha256 calculados desde bytes reales.
}

export function inspectTiledMap({ assetsRoot, mapEntry, inventoryBySrc }) {
  // Abrir el JSON real; exigir tilewidth/tileheight/width/height enteros positivos.
  // Resolver tilesets embebidos y externos, y cada `image` transitivo bajo assetsRoot.
  // Rechazar tileset/imagen no inventariado, source roto, margin/spacing/offset/scale
  // fraccionarios, smoothing/linear, gid fuera de rango y dimensión PNG no divisible
  // por su tile grid. Devolver la lista canónica y ordenada de SHA-256 transitivos.
}

export function buildPremiumVisualManifest({
  assetsRoot, sourceRoot, inventory, palettes, requireCandidate = true,
}) {
  // Validar schemaVersion/status, conjunto exacto de 8 mapBindings y todas las
  // REQUIRED_VISUAL_CATEGORIES. `requireCandidate` exige reviewStatus=candidate
  // para cada entrada; nunca escribe o asciende ese estado. Construir manifest
  // canónico con cada resultado PNG/map y manifestHash SHA-256.
}
```

Los comentarios anteriores son una lista de invariantes, no cuerpos vacíos: el
archivo implementado debe contener cada rama con error que incluya `assetId` y
ruta. El test `visual-asset-manifest-lib.test.mjs` crea fixtures temporales y
cubre, uno por uno: manifest válido; falta de cada una de las diez categorías;
cada uno de los ocho `mapKey` ausente/extra; PNG inexistente; escape y symlink;
dimensión incorrecta; tile grid indivisible; alpha `128`; color no permitido;
`logicalScale: 0.5`; source/licencia vacíos; source hash distinto; `assetId`,
`src` o binding duplicado; Tiled JSON roto; tileset externo/imagen transitiva no
inventariados; `reviewStatus: unreviewed` rechazado con `requireCandidate`; y un
manifest válido cuyos hashes cambian al mutar un píxel permitido.

`validate-premium-visual-assets.mjs` acepta comandos mutuamente excluyentes:

```text
node frontend/scripts/validate-premium-visual-assets.mjs --asset <assetId>
node frontend/scripts/validate-premium-visual-assets.mjs --map <mapKey>
node frontend/scripts/validate-premium-visual-assets.mjs --write
node frontend/scripts/validate-premium-visual-assets.mjs --check
```

`--asset/--map` permiten `unreviewed` durante remaster pero ejecutan todas las
reglas mecánicas; `--write/--check` exigen `candidate`, generan/comparan
`frontend/src/assets/visual/v1/{manifest.json,README.md}` y fallan ante deriva.
La CLI jamás cambia `reviewStatus`. `render-premium-contact-sheets.mjs` lee los
dos manifests ya validados y genera, de forma determinista y sin reescalar
fraccionalmente, `characters.png`, `npc.png`, `world-assets.png` y
`hud-assets.png`; cada celda imprime `assetId` y los 12 primeros hex del hash.

Crear el test backend de cobertura de fuente:

```py
# backend_django/apps/simulation/tests/test_visual_inventory_contract.py
import json
from pathlib import Path

from apps.simulation.management.commands.seed_caso_pdf import MAPS, MAP_OBJECTS

ROOT = Path(__file__).resolve().parents[4]
INVENTORY = json.loads((
    ROOT / "frontend/src/assets/visual/v1/inventory.v1.json"
).read_text(encoding="utf-8"))
EMOTIONS = json.loads((
    ROOT / "frontend/src/assets/characters/v1/clinical-emotion-map.v1.json"
).read_text(encoding="utf-8"))["emotions"]


def test_inventory_covers_exact_slice_maps_and_object_types():
    map_keys = {item["key"] for item in MAPS}
    assert set(INVENTORY["mapBindings"]) == map_keys
    assert map_keys == {
        "hospital-urgencias", "hospital-sala-escucha",
        "hospital-sala-escucha-accion", "hospital-sala-escucha-cierre",
        "comisaria-recepcion", "comisaria-consultorio",
        "comisaria-consultorio-marco", "comisaria-consultorio-cierre",
    }
    assert {obj["type"] for values in MAP_OBJECTS.values() for obj in values} == {
        "PERSON", "OBJECT", "TOOL", "EXIT",
    }


def test_every_seed_dialogue_emotion_is_authored():
    line_emotions = {
        emotion
        for values in MAP_OBJECTS.values()
        for obj in values
        for _text, emotion in (obj.get("dialogue") or (None, []))[1]
    }
    tree_projection_emotions = {"neutral", "positive", "concerned", "danger"}
    approved_consequence_emotions = {"receptive", "calm", "worried", "closed"}
    expected = line_emotions | tree_projection_emotions | approved_consequence_emotions
    assert set(EMOTIONS) == expected, {
        "missing": sorted(expected - set(EMOTIONS)),
        "extra": sorted(set(EMOTIONS) - expected),
    }
```

Run:

```powershell
npm run test:character-assets --prefix frontend
npm run test:backend -- apps/simulation/tests/test_visual_inventory_contract.py -q
```

Expected: las fixtures pasan y la prueba backend falla mientras el inventario
real continúe `unreviewed` o incompleto; no interpretar ese rojo como evidencia
de que el arte heredado ya cumple.

- [ ] **Step 8: Ejecutar los fixtures de personaje y universo visual**

Dejar el script final de esta task así:

```json
"test:character-assets": "node --test scripts/character-manifest-lib.test.mjs scripts/visual-asset-manifest-lib.test.mjs"
```

Run: `npm run test:character-assets --prefix frontend`

Expected: PASS; incluye la derecha espejada controlada, las cuatro reacciones y
todos los fallos de PNG/tileset/inventario descritos arriba.

- [ ] **Step 9: Comprobar que el gate real está rojo porque todavía faltan atlas v1**

Run: `node frontend/scripts/validate-character-manifest.mjs --character valentina`

Expected: FAIL mencionando `frontend/src/assets/characters/v1/valentina/base/idle.png: no existe`.

Run: `node frontend/scripts/validate-premium-visual-assets.mjs --check`

Expected: FAIL enumerando assets `unreviewed`/ausentes por `assetId`; el comando
no cambia el inventario ni genera hashes para ocultar el rojo.

- [ ] **Step 10: Commit**

```powershell
git add docs/visual/premium-visual-bible-v1.md frontend/package.json frontend/package-lock.json `
  frontend/scripts/character-manifest-lib.mjs frontend/scripts/validate-character-manifest.mjs `
  frontend/scripts/character-manifest-lib.test.mjs frontend/scripts/visual-asset-manifest-lib.mjs `
  frontend/scripts/validate-premium-visual-assets.mjs frontend/scripts/visual-asset-manifest-lib.test.mjs `
  frontend/scripts/render-premium-contact-sheets.mjs `
  frontend/src/assets/characters/v1/palette.v1.json frontend/src/assets/characters/v1/roster.v1.json `
  frontend/src/assets/characters/v1/actor-roster.v1.json frontend/src/assets/characters/v1/clinical-emotion-map.v1.json `
  frontend/src/assets/visual/v1/inventory.v1.json backend_django/apps/simulation/tests/test_visual_inventory_contract.py
git commit -m "build(character): bloquear assets fuera de la biblia v1"
```

### Task 3: Producir y aprobar la identidad piloto `valentina`

**Files:**
- Create: `frontend/src/assets/characters/v1/valentina/base/idle.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/walk.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/talk.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/interact.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/turn.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/react.png`
- Create: `frontend/src/assets/characters/v1/valentina/base/portrait.png`

Esta tarea es el gate artístico del rig. No empezar las otras nueve identidades hasta que la piloto se vea coherente en movimiento. Cada checkbox produce un binario real; no se aceptan imágenes de muestra, fondos opacos ni frames clonados.

- [ ] **Step 1: Capturar el concepto de identidad sin promoverlo al runtime**

Usar `frontend/src/assets/characters/cast/valentina.png` únicamente como referencia de piel, cabello y vestuario. Si Higgsfield está disponible, generar una hoja de concepto con frente/perfil/espalda; si no, usar imagegen. Guardar los job IDs fuera del runtime y no copiar la salida cruda a `v1/`.

Expected: una referencia visual consistente que se puede redibujar en la cuadrícula `48×72`, no un atlas final.

- [ ] **Step 2: Dibujar `idle.png` y `walk.png` sobre el mismo rig**

Contrato exacto:

| Archivo | Tamaño | Rejilla | Filas | Frames |
|---|---:|---:|---|---|
| `idle.png` | `192×288` | `4×4` | down/left/right/up | 4 por dirección |
| `walk.png` | `288×288` | `6×4` | down/left/right/up | 6 por dirección; contacto en 0 y 3 |

Usar alfa binario, paleta v1 y pies y=62–68. Dibujar izquierda y derecha por separado. No usar resize Lanczos ni `scaleY`.

- [ ] **Step 3: Dibujar actuación funcional `talk.png`, `interact.png` y `turn.png`**

| Archivo | Tamaño | Rejilla | Condición |
|---|---:|---:|---|
| `talk.png` | `192×288` | `4×4` | gesto de habla contenido en cuatro direcciones |
| `interact.png` | `192×288` | `4×4` | acción completa, no loop, pivote fijo |
| `turn.png` | `144×288` | `3×4` | pose intermedia real hacia cada dirección |

Expected: al alternar ciclos, cabeza, hombros, manos y pies no saltan más de un píxel lógico fuera del movimiento autorado.

- [ ] **Step 4: Dibujar reacciones y retrato**

`react.png` mide `192×1152`, 4 columnas × 16 filas. Filas `0–3` son
`reactRelief`, `4–7` `reactSteady`, `8–11` `reactTension` y `12–15`
`reactRupture`; dentro de cada bloque el orden es down/left/right/up y cada fila
tiene cuatro frames. `portrait.png` mide `384×768`, 4 columnas × 8 filas:
neutral/focused/concerned/relieved/relief/steady/tension/rupture. El retrato
conserva piel, cabello, ropa y facciones del sprite; los cuatro últimos estados
deben expresar el mismo tono que el cuerpo sin intercambiar rangos.

- [ ] **Step 5: Ejecutar el gate automático de la piloto**

Run: `node frontend/scripts/validate-character-manifest.mjs --character valentina`

Expected: `OK: valentina`; ningún color fuera de paleta, frame vacío, alfa parcial, borde sucio o dirección espejada.

- [ ] **Step 6: Inspeccionar visualmente los siete atlas a escala entera**

Abrir cada PNG con `view_image` y zoom entero. Revisar las 16 poses idle, 24 de
walk, 16 talk, 16 interact, 12 turn, 64 react y 32 retratos. Rechazar si aparece
cualquiera de estos defectos: subestilo distinto entre filas, pie flotante,
silueta derretida, ojos que cambian de posición, ropa que cambia de corte,
izquierda espejada, retrato de otra identidad o incongruencia cuerpo/retrato
entre cualquiera de los cuatro tonos.

Expected: gate humano firmado en las notas del commit; no usar “el validador pasó” como sustituto del vistazo.

- [ ] **Step 7: Commit de la identidad piloto**

```powershell
git add frontend/src/assets/characters/v1/valentina/base
git commit -m "feat(character-assets): aprobar rig premium de valentina"
```

### Task 4: Producir el resto del elenco y remasterizar el universo visual

**Files:**
- Create: `frontend/src/assets/characters/v1/{andres,camila,daniela,david,felipe,jorge,luisa,mariana,mateo}/base/{idle,walk,talk,interact,turn,react,portrait}.png`
- Create: `frontend/src/assets/characters/v1/actors/<visualId>/base/{idle,walk,talk,interact,turn,react,portrait}.png`
- Modify or replace in-place after audit: `frontend/src/assets/game/kenney/**/tilemap_packed.png`
- Modify or replace in-place after audit: `frontend/src/assets/game/{furniture,objects,doors}/**/*.png`
- Create: `frontend/src/assets/game/ui/premium-v1/**/*.png`
- Modify: `frontend/src/assets/visual/v1/inventory.v1.json`

Para cada identidad se repite el inventario binario completo, pero no se copia la silueta de Valentina: se conserva el rig/timing y se redibujan cuerpo, facciones, cabello y ropa. Cada subtask termina verde y en su propio commit.

#### Task 4.1: Andrés

- [ ] Crear `andres/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `andres/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `andres/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `andres/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character andres`; Expected: `OK: andres`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/andres/base
git commit -m "feat(character-assets): completar identidad premium de andres"
```

#### Task 4.2: Camila

- [ ] Crear `camila/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `camila/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `camila/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `camila/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character camila`; Expected: `OK: camila`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/camila/base
git commit -m "feat(character-assets): completar identidad premium de camila"
```

#### Task 4.3: Daniela

- [ ] Crear `daniela/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `daniela/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `daniela/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `daniela/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character daniela`; Expected: `OK: daniela`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/daniela/base
git commit -m "feat(character-assets): completar identidad premium de daniela"
```

#### Task 4.4: David

- [ ] Crear `david/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `david/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `david/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `david/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character david`; Expected: `OK: david`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/david/base
git commit -m "feat(character-assets): completar identidad premium de david"
```

#### Task 4.5: Felipe

- [ ] Crear `felipe/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `felipe/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `felipe/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `felipe/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character felipe`; Expected: `OK: felipe`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/felipe/base
git commit -m "feat(character-assets): completar identidad premium de felipe"
```

#### Task 4.6: Jorge

- [ ] Crear `jorge/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `jorge/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `jorge/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `jorge/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character jorge`; Expected: `OK: jorge`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/jorge/base
git commit -m "feat(character-assets): completar identidad premium de jorge"
```

#### Task 4.7: Luisa

- [ ] Crear `luisa/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `luisa/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `luisa/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `luisa/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character luisa`; Expected: `OK: luisa`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/luisa/base
git commit -m "feat(character-assets): completar identidad premium de luisa"
```

#### Task 4.8: Mariana

- [ ] Crear `mariana/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `mariana/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `mariana/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `mariana/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character mariana`; Expected: `OK: mariana`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/mariana/base
git commit -m "feat(character-assets): completar identidad premium de mariana"
```

#### Task 4.9: Mateo

- [ ] Crear `mateo/base/idle.png` `192×288`, cuatro direcciones autoradas y cuatro frames.
- [ ] Crear `mateo/base/walk.png` `288×288`, seis frames y contactos 0/3.
- [ ] Crear `mateo/base/talk.png`, `interact.png` y `turn.png` con tamaños `192×288`, `192×288`, `144×288`.
- [ ] Crear `mateo/base/react.png` `192×1152` con los cuatro tonos y `portrait.png` `384×768` con los ocho estados.
- [ ] Run: `node frontend/scripts/validate-character-manifest.mjs --character mateo`; Expected: `OK: mateo`.
- [ ] Abrir los siete atlas con `view_image`; Expected: misma identidad, rig y luz de la piloto, sin frames espejados.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/mateo/base
git commit -m "feat(character-assets): completar identidad premium de mateo"
```

#### Task 4.10: Catálogo visual no seleccionable de NPC

Crear los siete atlas en
`frontend/src/assets/characters/v1/actors/<visualId>/base/` para estos once
visuales. La columna «referencia» es solo una guía de identidad; el resultado se
redibuja sobre el rig v1 y jamás se copia como sprite de producción:

| visualId | Referencia versionada | actorId que lo consume |
|---|---|---|
| `cuidadora-familia-vbg` | `cast/npc_madre-vbg.png` | `familia-duelo`, `familia-crisis` |
| `psicologa-hospitalaria` | `cast/npc_psicologa-hospitalaria.png` | `psicologa-acompanante` |
| `sobreviviente-vbg` | `cast/npc_paciente-vbg.png` | `sobreviviente-consulta`, `sobreviviente-espera` |
| `profesional-psicosocial` | `cast/npc_comisaria-profesional.png` | `profesional-psicosocial`, `apoyo-psicosocial` |
| `funcionaria-recepcion` | `cast/npc_funcionaria-recepcion.png` | `funcionaria-recepcion` |
| `enfermera-urgencias` | `cast/npc_colega-clinica.png` | `enfermera-urgencias` |
| `medico-guardia` | `cast/npc_supervisor-clinico.png` | `medico-guardia` |
| `psicologa-orientadora` | `cast/npc_psicologa-hospitalaria.png` | `psicologa-orientadora` |
| `trabajadora-social` | `cast/npc_comisaria-profesional.png` | `trabajadora-social` |
| `orientadora-juridica` | `cast/npc_funcionaria-recepcion.png` | `orientadora-juridica` |
| `madre-acompanante` | `cast/npc_madre-vbg.png` | `madre-acompanante` |

- [ ] Para cada `visualId`, crear `idle.png` `192×288`, `walk.png` `288×288`,
  `talk.png` `192×288`, `interact.png` `192×288`, `turn.png` `144×288`,
  `react.png` `192×1152` con `reactRelief|reactSteady|reactTension|reactRupture`
  y `portrait.png` `384×768` con los ocho estados. Mantener cuatro
  direcciones autoradas, contactos 0/3, pivote `(24,68)`, alfa binario y la
  paleta maestra; no usar tint, preset seleccionable, mirror ni escala
  fraccionaria.
- [ ] Si Higgsfield está disponible durante la ejecución, usarlo únicamente
  para hojas de concepto de silueta/vestuario. Reconstruir píxel a píxel cada
  atlas y conservar como procedencia la referencia versionada de la tabla; una
  salida generativa cruda no entra al árbol de producción.
- [ ] Validar cada visual con este comando PowerShell exacto:

```powershell
$ids = @(
  'cuidadora-familia-vbg','psicologa-hospitalaria','sobreviviente-vbg',
  'profesional-psicosocial','funcionaria-recepcion','enfermera-urgencias',
  'medico-guardia','psicologa-orientadora','trabajadora-social',
  'orientadora-juridica','madre-acompanante'
)
foreach ($id in $ids) {
  node frontend/scripts/validate-character-manifest.mjs --actor $id
  if ($LASTEXITCODE -ne 0) { throw "actor inválido: $id" }
}
```

Expected: once líneas `OK: <visualId>`; ningún PNG ausente, frame vacío,
dirección espejada, color ajeno, alfa parcial o pie fuera del pivote.

- [ ] Abrir los 77 atlas con `view_image` a zoom entero. Revisar que un mismo
  actor conserve rostro/ropa entre cuerpo y retrato, que los once compartan
  contorno/luz/proporción y que las tres reutilizaciones de la tabla sean
  deliberadamente la misma persona. Registrar el gate humano en las notas del
  commit.
- [ ] Commit:

```powershell
git add frontend/src/assets/characters/v1/actors
git commit -m "feat(character-assets): completar elenco npc premium"
```

#### Task 4.11: Auditar y remasterizar todo lo visible en los ocho mapas

Este subtask no cambia topología, colisiones, `MapObject` ni entradas/salidas
backend. Conserva los ScenarioConfig y mapas que el runtime normaliza; sustituye
solo assets visuales inconsistentes y completa mappings gráficos. Un asset
heredado no pasa por omisión: comienza `unreviewed` y debe superar el mismo
proceso que uno nuevo.

- [ ] Ejecutar el inventario diagnóstico sobre los ocho mapas, sin escribir:

```powershell
$maps = @(
  'hospital-urgencias','hospital-sala-escucha',
  'hospital-sala-escucha-accion','hospital-sala-escucha-cierre',
  'comisaria-recepcion','comisaria-consultorio',
  'comisaria-consultorio-marco','comisaria-consultorio-cierre'
)
foreach ($mapKey in $maps) {
  node frontend/scripts/validate-premium-visual-assets.mjs --map $mapKey
  if ($LASTEXITCODE -ne 0) { throw "Mapa visual inválido: $mapKey" }
}
```

Expected: cada mapa resuelve su JSON/ScenarioConfig y todos sus tilesets
transitivos. Cualquier `unreviewed`, PNG roto o binding ausente queda listado por
`assetId`; todavía no se declara cumplimiento.

- [ ] Para cada tileset y los diez muebles, comparar bytes/zoom 1× contra la
  biblia. Remasterizar todo asset con mezcla de perspectiva, contorno blando,
  gradiente/antialias, píxel de tamaño distinto, luz contraria o paleta ajena.
  Conservar tile grid y dimensiones declaradas; si una corrección exige cambiar
  dimensiones o IDs, detenerse porque eso amplía la autoridad de runtime.
- [ ] Para los cinco OBJECT, cinco TOOL y diez vistas EXIT, crear siluetas
  distinguibles a color y en escala de grises, estados available/locked cuando
  apliquen y sombra de contacto coherente. No usar tint para fabricar una clase
  ausente ni reutilizar un icono Material como sprite del mundo.
- [ ] Crear los ocho sprites de señal/prompt y los catorce marcos/iconos HUD de
  la tabla del inventario bajo `game/ui/premium-v1`. Las superficies internas
  pueden recibir Liquid Glass en Plan 3; sus bordes, esquinas e iconos son PNG
  pixel art con `image-rendering: pixelated`.
- [ ] Cambiar `reviewStatus` de una entrada a `candidate` únicamente después de
  que su PNG abra, su procedencia/hash fuente sean reales, pase el validador y
  se compare a 1× con personajes/mundo/HUD. No usar un replace global ni marcar
  todo el archivo de una vez.
- [ ] Ejecutar el gate total y generar contact sheets diagnósticos:

```powershell
node frontend/scripts/validate-premium-visual-assets.mjs --write
if ($LASTEXITCODE -ne 0) { throw 'El universo visual no puede promoverse' }
node frontend/scripts/render-premium-contact-sheets.mjs `
  --out .superpowers/evidence/visual-working-set
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron generar contact sheets' }
```

Expected: `manifest.json`/`README.md` derivados con todos los hashes y cuatro
contact sheets (`characters`, `npc`, `world-assets`, `hud-assets`). Revisar a
zoom entero: cero blur, huecos, ruta rota, categoría genérica o subestilo. Esta
revisión autoriza el commit de trabajo, no sustituye la aprobación exact-HEAD
del plan 6.

- [ ] Commit del universo visual, separado del elenco:

```powershell
git add frontend/src/assets/game/kenney frontend/src/assets/game/furniture `
  frontend/src/assets/game/objects frontend/src/assets/game/doors `
  frontend/src/assets/game/ui/premium-v1 frontend/src/assets/visual/v1/inventory.v1.json
git commit -m "feat(visual-assets): unificar mundo y hud pixel art"
```

### Task 5: Generar y hacer obligatorios ambos manifiestos visuales

**Files:**
- Create: `frontend/src/assets/characters/v1/manifest.json`
- Create: `frontend/src/assets/characters/v1/README.md`
- Create: `frontend/src/assets/visual/v1/manifest.json`
- Create: `frontend/src/assets/visual/v1/README.md`
- Modify: `frontend/scripts/character-manifest-lib.test.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Validar el lote completo y escribir el manifiesto derivado**

Run: `node frontend/scripts/validate-character-manifest.mjs --write`

Run: `node frontend/scripts/validate-premium-visual-assets.mjs --write`

Expected: `OK: manifest y README escritos (10 identidades, 11 visuales NPC)`; `manifest.json`
contiene exactamente diez identidades seleccionables, once `actorVisuals`,
catorce `actorMappings`, siete hashes por identidad/visual y ningún `castId`
legado. Cada una de las 21 variantes contiene las cuatro reacciones y ocho
estados de retrato; `clinicalEmotionPortraitStates` contiene exactamente las
doce claves aprobadas. `README.md` enumera los veintiún `contentHash`, el total
de mappings y el total de emociones narrativas. El segundo comando escribe el inventario derivado de los ocho mapas y
de todas las categorías visibles, con hash de salida y de procedencia; cero
entrada continúa `unreviewed`.

- [ ] **Step 2: Añadir scripts y el gate de build**

Dejar esta sección exacta en `frontend/package.json`:

```json
{
  "scripts": {
    "prebuild": "npm run validate:characters && npm run validate:visual-assets",
    "build": "ng build",
    "test:character-assets": "node --test scripts/character-manifest-lib.test.mjs scripts/visual-asset-manifest-lib.test.mjs",
    "validate:characters": "node scripts/validate-character-manifest.mjs --check",
    "validate:characters:write": "node scripts/validate-character-manifest.mjs --write",
    "validate:visual-assets": "node scripts/validate-premium-visual-assets.mjs --check",
    "validate:visual-assets:write": "node scripts/validate-premium-visual-assets.mjs --write"
  }
}
```

Conservar todos los scripts ya existentes; añadir o reemplazar solo estas claves.

- [ ] **Step 3: Añadir la prueba de deriva sobre una fixture temporal, sin tocar PNG versionados**

Reemplazar el import del builder en `frontend/scripts/character-manifest-lib.test.mjs` por este y añadir el test:

```js
import {
  assertDerivedArtifact, SHEET_SPECS, buildCharacterManifest,
} from './character-manifest-lib.mjs';
```

```js
test('cambiar un píxel o mapping emocional cambia hashes y vuelve obsoleto el manifiesto derivado', () => {
  const root = fixture();
  const before = buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina' });
  const emotionChanged = buildCharacterManifest({
    assetsRoot: root, roster, palette, onlyCharacter: 'valentina',
    clinicalEmotionMap: {
      ...clinicalEmotionMap,
      emotions: { ...clinicalEmotionMap.emotions, neutral: 'focused' },
    },
  });
  assert.notEqual(emotionChanged.manifestHash, before.manifestHash);
  const file = join(root, 'valentina', 'base', 'walk.png');
  const png = PNG.sync.read(readFileSync(file));
  const pixel = ((60 * png.width) + 5) * 4;
  png.data[pixel] = 21; png.data[pixel + 1] = 19; png.data[pixel + 2] = 29;
  writeFileSync(file, PNG.sync.write(png));

  const after = buildCharacterManifest({ assetsRoot: root, roster, palette, clinicalEmotionMap, onlyCharacter: 'valentina' });
  assert.notEqual(after.identities[0].variants[0].contentHash, before.identities[0].variants[0].contentHash);
  assert.notEqual(after.manifestHash, before.manifestHash);
  assert.throws(
    () => assertDerivedArtifact('manifest.json', `${JSON.stringify(before, null, 2)}\n`, `${JSON.stringify(after, null, 2)}\n`),
    /manifest\.json está obsoleto/,
  );
  assert.throws(
    () => assertDerivedArtifact('README.md', 'inventario viejo', 'inventario nuevo'),
    /README\.md está obsoleto/,
  );
});
```

Run: `npm run test:character-assets --prefix frontend`

Expected: PASS, incluido el caso de hash obsoleto.

- [ ] **Step 4: Ejecutar el gate real y el build**

Run: `npm run validate:characters --prefix frontend`

Expected: `OK: manifest vigente <64 hex>`.

Run: `npm run validate:visual-assets --prefix frontend`

Expected: `OK: visual manifest vigente <64 hex> (8 mapas)`; abre de nuevo todos
los PNG, mapas y tilesets en lugar de confiar en el manifest versionado.

Run: `npm run build:frontend`

Expected: exit `0`; el `prebuild` valida ambos manifests antes de Angular.

- [ ] **Step 5: Commit**

```powershell
git add frontend/package.json frontend/src/assets/characters/v1/manifest.json `
  frontend/src/assets/characters/v1/README.md frontend/src/assets/visual/v1/manifest.json `
  frontend/src/assets/visual/v1/README.md frontend/scripts/character-manifest-lib.test.mjs `
  frontend/scripts/visual-asset-manifest-lib.test.mjs
git commit -m "build(character): publicar manifests visuales v1"
```

### Task 6: Persistir el perfil de personaje por usuario con revisión optimista

**Files:**
- Modify: `backend_django/apps/users/models.py`
- Create: `backend_django/apps/users/migrations/0004_characterprofile.py`
- Modify: `backend_django/apps/users/serializers.py`
- Create: `backend_django/apps/users/services/character_profile_service.py`
- Modify: `backend_django/apps/users/views.py`
- Modify: `backend_django/apps/users/urls.py`
- Create: `backend_django/apps/users/tests/test_character_profile.py`

- [ ] **Step 1: Escribir tests rojos de autenticación, aislamiento y conflicto**

```python
# backend_django/apps/users/tests/test_character_profile.py
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()
URL = "/api/auth/me/character-profile"


@pytest.fixture
def users(db):
    return [
        User.objects.create_user(
            email=f"profile_{idx}@psychosim.test", password="Passw0rd!",
            nombre=f"Profile{idx}", apellido="Test", role="ESTUDIANTE",
        )
        for idx in (1, 2)
    ]


def payload(character_id="felipe", content="a", expected=0):
    return {
        "schemaVersion": 1,
        "manifestVersion": "1.0.0",
        "characterId": character_id,
        "variantId": "base",
        "contentHash": content * 64,
        "expectedRevision": expected,
    }


def test_character_profile_requires_authentication():
    client = APIClient()
    assert client.get(URL).status_code == 401
    assert client.put(URL, payload(), format="json").status_code == 401


@pytest.mark.django_db
def test_profile_is_created_and_read_only_by_its_owner(users):
    first, second = users
    client = APIClient()
    client.force_authenticate(first)
    created = client.put(URL, payload("felipe"), format="json")
    assert created.status_code == 200
    assert created.data["data"]["profile"]["characterId"] == "felipe"
    assert created.data["data"]["profile"]["revision"] == 1

    client.force_authenticate(second)
    isolated = client.get(URL)
    assert isolated.status_code == 200
    assert isolated.data["data"]["profile"] is None


@pytest.mark.django_db
def test_stale_revision_returns_409_without_overwriting(users):
    client = APIClient()
    client.force_authenticate(users[0])
    assert client.put(URL, payload("felipe"), format="json").status_code == 200
    updated = client.put(URL, payload("luisa", "b", expected=1), format="json")
    assert updated.status_code == 200
    assert updated.data["data"]["profile"]["revision"] == 2

    stale = client.put(URL, payload("mateo", "c", expected=1), format="json")
    assert stale.status_code == 409
    assert "revision" in stale.data["message"].lower()
    current = client.get(URL).data["data"]["profile"]
    assert current["characterId"] == "luisa"
    assert current["revision"] == 2


@pytest.mark.django_db
def test_payload_rejects_unknown_schema_and_non_sha_hash(users):
    client = APIClient()
    client.force_authenticate(users[0])
    bad_schema = {**payload(), "schemaVersion": 2}
    bad_hash = {**payload(), "contentHash": "not-a-sha"}
    assert client.put(URL, bad_schema, format="json").status_code == 400
    assert client.put(URL, bad_hash, format="json").status_code == 400
```

- [ ] **Step 2: Ejecutar el test en la base desechable**

Run: `npm run test:backend -- apps/users/tests/test_character_profile.py -q`

Expected: FAIL; GET/PUT devuelve `404` porque la ruta aún no existe.

- [ ] **Step 3: Añadir el modelo aislado por `OneToOneField`**

Añadir al final de `backend_django/apps/users/models.py`:

```python
class CharacterProfile(models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="character_profile",
        db_column="user_id",
    )
    schema_version = models.PositiveSmallIntegerField(default=1)
    manifest_version = models.CharField(max_length=32)
    character_id = models.CharField(max_length=64)
    variant_id = models.CharField(max_length=64, default="base")
    content_hash = models.CharField(max_length=64)
    revision = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_character_profiles"

    def __str__(self):
        return f"{self.user_id}:{self.character_id}/{self.variant_id}@{self.revision}"
```

- [ ] **Step 4: Crear la migración explícita**

```python
# backend_django/apps/users/migrations/0004_characterprofile.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("users", "0003_merge_0002_accessrequest_0002_initial")]

    operations = [
        migrations.CreateModel(
            name="CharacterProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("schema_version", models.PositiveSmallIntegerField(default=1)),
                ("manifest_version", models.CharField(max_length=32)),
                ("character_id", models.CharField(max_length=64)),
                ("variant_id", models.CharField(default="base", max_length=64)),
                ("content_hash", models.CharField(max_length=64)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(
                    db_column="user_id", on_delete=django.db.models.deletion.CASCADE,
                    related_name="character_profile", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "user_character_profiles"},
        ),
    ]
```

- [ ] **Step 5: Añadir serializers camelCase de lectura y escritura**

Añadir a `backend_django/apps/users/serializers.py`:

```python
from .models import CharacterProfile


class CharacterProfileSerializer(serializers.ModelSerializer):
    schemaVersion = serializers.IntegerField(source="schema_version", read_only=True)
    manifestVersion = serializers.CharField(source="manifest_version", read_only=True)
    characterId = serializers.CharField(source="character_id", read_only=True)
    variantId = serializers.CharField(source="variant_id", read_only=True)
    contentHash = serializers.CharField(source="content_hash", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = CharacterProfile
        fields = [
            "schemaVersion", "manifestVersion", "characterId", "variantId",
            "contentHash", "revision", "updatedAt",
        ]


class CharacterProfileWriteSerializer(serializers.Serializer):
    schemaVersion = serializers.IntegerField(min_value=1, max_value=1)
    manifestVersion = serializers.RegexField(r"^[0-9]+\.[0-9]+\.[0-9]+$", max_length=32)
    characterId = serializers.RegexField(r"^[a-z0-9-]+$", max_length=64)
    variantId = serializers.RegexField(r"^[a-z0-9-]+$", max_length=64)
    contentHash = serializers.RegexField(r"^[a-f0-9]{64}$", max_length=64)
    expectedRevision = serializers.IntegerField(min_value=0)
```

- [ ] **Step 6: Implementar el upsert transaccional sin aceptar `userId` del cliente**

```python
# backend_django/apps/users/services/character_profile_service.py
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.users.models import CharacterProfile
from shared.exceptions import Conflict

User = get_user_model()


@transaction.atomic
def save_character_profile(*, user, payload):
    # Bloquear la fila de usuario también cubre dos creates concurrentes cuando
    # todavía no existe la fila one-to-one.
    User.objects.select_for_update().only("id").get(pk=user.pk)
    profile = CharacterProfile.objects.select_for_update().filter(user_id=user.pk).first()
    actual_revision = profile.revision if profile else 0
    expected_revision = payload["expectedRevision"]
    if actual_revision != expected_revision:
        raise Conflict(
            f"Conflicto de revision: esperada {expected_revision}, actual {actual_revision}"
        )

    values = {
        "schema_version": payload["schemaVersion"],
        "manifest_version": payload["manifestVersion"],
        "character_id": payload["characterId"],
        "variant_id": payload["variantId"],
        "content_hash": payload["contentHash"],
    }
    if profile is None:
        return CharacterProfile.objects.create(user=user, revision=1, **values)
    for field, value in values.items():
        setattr(profile, field, value)
    profile.revision += 1
    profile.save(update_fields=[*values.keys(), "revision", "updated_at"])
    return profile
```

- [ ] **Step 7: Exponer GET/PUT autenticados**

Añadir imports y esta vista a `backend_django/apps/users/views.py`:

```python
from apps.users.models import CharacterProfile
from apps.users.serializers import CharacterProfileSerializer, CharacterProfileWriteSerializer
from apps.users.services.character_profile_service import save_character_profile


class CharacterProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = CharacterProfile.objects.filter(user_id=request.user.pk).first()
        data = CharacterProfileSerializer(profile).data if profile else None
        return api_ok({"profile": data})

    def put(self, request):
        serializer = CharacterProfileWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = save_character_profile(user=request.user, payload=serializer.validated_data)
        return api_ok({"profile": CharacterProfileSerializer(profile).data})
```

Añadir el import y la ruta a `backend_django/apps/users/urls.py`:

```python
from .views import CharacterProfileView

# dentro de urlpatterns
path("me/character-profile", CharacterProfileView.as_view()),
```

- [ ] **Step 8: Ejecutar test focalizado, migraciones y check**

Run: `npm run test:backend -- apps/users/tests/test_character_profile.py -q`

Expected: PASS, `4 passed`.

Run: `npm run check:backend`

Expected: `System check identified no issues`.

- [ ] **Step 9: Commit**

```powershell
git add backend_django/apps/users/models.py backend_django/apps/users/migrations/0004_characterprofile.py `
  backend_django/apps/users/serializers.py backend_django/apps/users/services/character_profile_service.py `
  backend_django/apps/users/views.py backend_django/apps/users/urls.py `
  backend_django/apps/users/tests/test_character_profile.py
git commit -m "feat(character-profile): sincronizar seleccion por usuario"
```

### Task 7: Cargar el manifiesto y reconciliar API/cache por usuario

**Files:**
- Create: `frontend/src/app/features/character/character-test.fixture.ts`
- Create: `frontend/src/app/features/character/character-manifest.service.ts`
- Create: `frontend/src/app/features/character/character-manifest.service.spec.ts`
- Create: `frontend/src/app/core/api/character-profile.api.ts`
- Create: `frontend/src/app/features/character/character-profile.repository.ts`
- Create: `frontend/src/app/features/character/character-profile.repository.spec.ts`

- [ ] **Step 1: Crear una fixture tipada y compacta para tests**

```ts
// frontend/src/app/features/character/character-test.fixture.ts
import type {
  CardinalDirection, CharacterAnimationId, CharacterManifestV1,
  CharacterSheetId, DirectionalAnimationV1,
} from './character-manifest.model';

const directions = (columns: number, offset = 0): Record<CardinalDirection, number[]> => ({
  down: Array.from({ length: columns }, (_, i) => (offset + 0) * columns + i),
  left: Array.from({ length: columns }, (_, i) => (offset + 1) * columns + i),
  right: Array.from({ length: columns }, (_, i) => (offset + 2) * columns + i),
  up: Array.from({ length: columns }, (_, i) => (offset + 3) * columns + i),
});

export function makeCharacterManifestFixture(
  ids: readonly string[] = ['valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge', 'luisa', 'mariana', 'mateo'],
): CharacterManifestV1 {
  const dimensions: Record<CharacterSheetId, [number, number, number, number]> = {
    idle: [192, 288, 4, 4], walk: [288, 288, 6, 4], talk: [192, 288, 4, 4],
    interact: [192, 288, 4, 4], turn: [144, 288, 3, 4], react: [192, 1152, 4, 16],
  };
  const animation = (
    id: CharacterAnimationId, sheetId: CharacterSheetId, columns: number,
    fps: number, loop: boolean, offset = 0,
  ): DirectionalAnimationV1 => ({ id, sheetId, fps, loop, directions: directions(columns, offset) });

  const identities = ids.map((characterId, index) => {
      const contentHash = (index + 1).toString(16).padStart(64, '0');
      const base = `/assets/characters/v1/${characterId}/base`;
      const sheets = Object.fromEntries(Object.entries(dimensions).map(([id, [width, height, columns, rows]]) => [id, {
        id, src: `${base}/${id}.png`, width, height, frameWidth: 48, frameHeight: 72,
        columns, rows, sha256: (index + 2).toString(16).padStart(64, '0'),
      }])) as CharacterManifestV1['identities'][number]['variants'][number]['sheets'];
      return {
        characterId, displayName: characterId[0].toUpperCase() + characterId.slice(1),
        summary: `Identidad ${characterId}`,
        provenance: { source: 'fixture', license: 'SIEP-INTERNAL', sourceAsset: `cast/${characterId}.png` },
        variants: [{
          variantId: 'base', contentHash, paletteId: 'siep-master-v1', paletteHash: 'c'.repeat(64), logicalScale: 1 as const,
          pivot: { x: 24, y: 68 }, feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
          shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 }, sheets,
          animations: {
            idle: animation('idle', 'idle', 4, 4, true),
            walk: { ...animation('walk', 'walk', 6, 10, true), contactSequenceIndices: [0, 3] },
            talk: animation('talk', 'talk', 4, 7, true),
            interact: animation('interact', 'interact', 4, 8, false),
            turn: animation('turn', 'turn', 3, 12, false),
            reactRelief: animation('reactRelief', 'react', 4, 7, false, 0),
            reactSteady: animation('reactSteady', 'react', 4, 7, false, 4),
            reactTension: animation('reactTension', 'react', 4, 7, false, 8),
            reactRupture: animation('reactRupture', 'react', 4, 7, false, 12),
          },
          portrait: {
            sheet: { id: 'portrait' as const, src: `${base}/portrait.png`, width: 384, height: 768, frameWidth: 96 as const, frameHeight: 96 as const, columns: 4 as const, rows: 8 as const, sha256: (index + 3).toString(16).padStart(64, '0') },
            fps: 6,
            states: {
              neutral: [0,1,2,3], focused: [4,5,6,7], concerned: [8,9,10,11], relieved: [12,13,14,15],
              relief: [16,17,18,19], steady: [20,21,22,23], tension: [24,25,26,27], rupture: [28,29,30,31],
            },
          },
        }],
      };
    });
  const visualIds = [
    'cuidadora-familia-vbg', 'psicologa-hospitalaria', 'sobreviviente-vbg',
    'profesional-psicosocial', 'funcionaria-recepcion', 'enfermera-urgencias',
    'medico-guardia', 'psicologa-orientadora', 'trabajadora-social',
    'orientadora-juridica', 'madre-acompanante',
  ];
  const baseVariant = identities[0]?.variants[0];
  if (!baseVariant) throw new Error('fixture requiere al menos una identidad');
  const actorVisuals = visualIds.map((visualId, index) => ({
    visualId,
    displayName: visualId,
    provenance: { source: 'fixture', license: 'SIEP-INTERNAL', sourceAsset: `cast/${visualId}.png` },
    variant: { ...baseVariant, contentHash: (index + 32).toString(16).padStart(64, '0') },
  }));
  return {
    schemaVersion: 1, manifestVersion: '1.0.0', manifestHash: 'a'.repeat(64),
    defaultCharacterId: 'valentina', logicalFrame: { width: 48, height: 72 },
    consequenceReactions: {
      relief: { animationId: 'reactRelief', portraitState: 'relief' },
      steady: { animationId: 'reactSteady', portraitState: 'steady' },
      tension: { animationId: 'reactTension', portraitState: 'tension' },
      rupture: { animationId: 'reactRupture', portraitState: 'rupture' },
    },
    clinicalEmotionPortraitStates: {
      neutral: 'neutral', positive: 'relieved', negative: 'concerned', anxious: 'concerned',
      danger: 'concerned', sad: 'concerned', worried: 'concerned', relieved: 'relieved',
      concerned: 'concerned', receptive: 'relief', calm: 'steady', closed: 'rupture',
    },
    palettes: [{ paletteId: 'siep-master-v1', src: '/assets/characters/v1/palette.v1.json', sha256: 'c'.repeat(64) }],
    identities,
    actorVisuals,
    actorMappings: {
      'familia-duelo': 'cuidadora-familia-vbg',
      'familia-crisis': 'cuidadora-familia-vbg',
      'psicologa-acompanante': 'psicologa-hospitalaria',
      'sobreviviente-consulta': 'sobreviviente-vbg',
      'sobreviviente-espera': 'sobreviviente-vbg',
      'profesional-psicosocial': 'profesional-psicosocial',
      'apoyo-psicosocial': 'profesional-psicosocial',
      'funcionaria-recepcion': 'funcionaria-recepcion',
      'enfermera-urgencias': 'enfermera-urgencias',
      'medico-guardia': 'medico-guardia',
      'psicologa-orientadora': 'psicologa-orientadora',
      'trabajadora-social': 'trabajadora-social',
      'orientadora-juridica': 'orientadora-juridica',
      'madre-acompanante': 'madre-acompanante',
    },
  };
}
```

- [ ] **Step 2: Escribir tests rojos del loader (una sola request y versión estricta)**

```ts
// frontend/src/app/features/character/character-manifest.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CharacterManifestService } from './character-manifest.service';
import { makeCharacterManifestFixture } from './character-test.fixture';

describe('CharacterManifestService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('comparte una sola carga y exige diez identidades', () => {
    const service = TestBed.inject(CharacterManifestService);
    let first = ''; let second = '';
    service.load().subscribe(value => first = value.manifestHash);
    service.load().subscribe(value => second = value.manifestHash);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/assets/characters/v1/manifest.json').flush(makeCharacterManifestFixture());
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    http.verify();
  });

  it('rechaza schema y roster incompletos', () => {
    const service = TestBed.inject(CharacterManifestService);
    let error = '';
    service.load().subscribe({ error: value => error = String(value) });
    TestBed.inject(HttpTestingController).expectOne('/assets/characters/v1/manifest.json')
      .flush({ ...makeCharacterManifestFixture(['valentina']), schemaVersion: 2 });
    expect(error).toMatch(/schemaVersion|10 identidades/);
  });

  it('rechaza una referencia de paleta ausente', () => {
    const service = TestBed.inject(CharacterManifestService);
    let error = '';
    service.load().subscribe({ error: value => error = String(value) });
    TestBed.inject(HttpTestingController).expectOne('/assets/characters/v1/manifest.json')
      .flush({ ...makeCharacterManifestFixture(), palettes: [] });
    expect(error).toMatch(/paleta/);
  });

  it('rechaza el mapping narrativo ausente, extra o con PortraitState inválido', () => {
    const service = TestBed.inject(CharacterManifestService);
    let error = '';
    service.load().subscribe({ error: value => error = String(value) });
    TestBed.inject(HttpTestingController).expectOne('/assets/characters/v1/manifest.json')
      .flush({ ...makeCharacterManifestFixture(), clinicalEmotionPortraitStates: { neutral: 'surprised' } });
    expect(error).toMatch(/clinicalEmotionPortraitStates|PortraitState/);
  });

  it('rechaza visuales o mappings NPC incompletos', () => {
    const service = TestBed.inject(CharacterManifestService);
    let error = '';
    service.load().subscribe({ error: value => error = String(value) });
    TestBed.inject(HttpTestingController).expectOne('/assets/characters/v1/manifest.json')
      .flush({ ...makeCharacterManifestFixture(), actorMappings: { 'familia-duelo': 'no-existe' } });
    expect(error).toMatch(/actorMappings|visualId/);
  });
});
```

- [ ] **Step 3: Confirmar el rojo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-manifest.service.spec.ts`

Expected: FAIL con `Cannot find module './character-manifest.service'`.

- [ ] **Step 4: Implementar el loader cacheado**

```ts
// frontend/src/app/features/character/character-manifest.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import type { CharacterManifestV1 } from './character-manifest.model';

function assertManifest(value: unknown): asserts value is CharacterManifestV1 {
  if (!value || typeof value !== 'object') throw new Error('CharacterManifestV1 ausente');
  const raw = value as Record<string, unknown>;
  if (raw['schemaVersion'] !== 1) throw new Error(`schemaVersion no soportada: ${raw['schemaVersion']}`);
  if (typeof raw['manifestVersion'] !== 'string') throw new Error('manifestVersion ausente');
  if (typeof raw['manifestHash'] !== 'string' || !/^[a-f0-9]{64}$/.test(raw['manifestHash'])) {
    throw new Error('manifestHash inválido');
  }
  if (!Array.isArray(raw['identities']) || raw['identities'].length !== 10) {
    throw new Error('CharacterManifestV1 exige exactamente 10 identidades');
  }
  const ids = raw['identities'].map(item => (item as Record<string, unknown>)['characterId']);
  if (new Set(ids).size !== 10) throw new Error('characterId duplicado');
  const expected = ['valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge', 'luisa', 'mariana', 'mateo'];
  if (ids.some((id, index) => id !== expected[index])) throw new Error('roster premium u orden inesperado');
  if (!Array.isArray(raw['palettes']) || raw['palettes'].length < 1) throw new Error('referencia de paleta ausente');
  const palette = raw['palettes'][0] as Record<string, unknown>;
  if (typeof palette['paletteId'] !== 'string' || !/^[a-f0-9]{64}$/.test(String(palette['sha256']))) {
    throw new Error('referencia de paleta inválida');
  }
  const emotionStates = raw['clinicalEmotionPortraitStates'];
  if (!emotionStates || typeof emotionStates !== 'object' || Array.isArray(emotionStates)) {
    throw new Error('clinicalEmotionPortraitStates ausente');
  }
  const expectedEmotionIds = [
    'neutral', 'positive', 'negative', 'anxious', 'danger', 'sad',
    'worried', 'relieved', 'concerned', 'receptive', 'calm', 'closed',
  ].sort();
  const emotionEntries = Object.entries(emotionStates as Record<string, unknown>);
  if (emotionEntries.map(([emotion]) => emotion).sort().join('|') !== expectedEmotionIds.join('|')) {
    throw new Error('clinicalEmotionPortraitStates no coincide con SIM-VBG-001');
  }
  const portraitStates = new Set([
    'neutral', 'focused', 'concerned', 'relieved',
    'relief', 'steady', 'tension', 'rupture',
  ]);
  if (emotionEntries.some(([, state]) => !portraitStates.has(String(state)))) {
    throw new Error('clinicalEmotionPortraitStates contiene PortraitState inválido');
  }
  if (!Array.isArray(raw['actorVisuals']) || raw['actorVisuals'].length !== 11) {
    throw new Error('CharacterManifestV1 exige exactamente 11 actorVisuals');
  }
  const visualIds = raw['actorVisuals'].map(item => (item as Record<string, unknown>)['visualId']);
  if (new Set(visualIds).size !== 11) throw new Error('visualId duplicado');
  const mappings = raw['actorMappings'];
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    throw new Error('actorMappings ausente');
  }
  const expectedActorIds = [
    'familia-duelo', 'familia-crisis', 'psicologa-acompanante',
    'sobreviviente-consulta', 'sobreviviente-espera', 'profesional-psicosocial',
    'apoyo-psicosocial', 'funcionaria-recepcion', 'enfermera-urgencias',
    'medico-guardia', 'psicologa-orientadora', 'trabajadora-social',
    'orientadora-juridica', 'madre-acompanante',
  ].sort();
  const mappingEntries = Object.entries(mappings as Record<string, unknown>);
  if (mappingEntries.map(([actorId]) => actorId).sort().join('|') !== expectedActorIds.join('|')) {
    throw new Error('actorMappings no coincide con SIM-VBG-001');
  }
  if (mappingEntries.some(([, visualId]) => !visualIds.includes(visualId))) {
    throw new Error('actorMappings contiene visualId desconocido');
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterManifestService {
  private readonly http = inject(HttpClient);
  private readonly manifest$ = this.http.get<unknown>('/assets/characters/v1/manifest.json').pipe(
    map(value => { assertManifest(value); return value; }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  load(): Observable<CharacterManifestV1> { return this.manifest$; }
}
```

- [ ] **Step 5: Escribir tests rojos de API/repository**

```ts
// frontend/src/app/features/character/character-profile.repository.spec.ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CharacterProfileApi } from '../../core/api/character-profile.api';
import { CharacterManifestService } from './character-manifest.service';
import { CHARACTER_PROFILE_STORAGE, CharacterProfileRepository } from './character-profile.repository';
import { makeCharacterManifestFixture } from './character-test.fixture';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: key => void values.delete(key), clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

describe('CharacterProfileRepository', () => {
  const manifest = makeCharacterManifestFixture();
  const currentUser = signal({ id: 11, nombre: 'A', apellido: 'A', email: 'a@test', role: 'ESTUDIANTE' as const });
  const api = { get: jest.fn(), put: jest.fn() };
  const local = storage();

  beforeEach(() => {
    jest.clearAllMocks(); local.clear();
    currentUser.set({ id: 11, nombre: 'A', apellido: 'A', email: 'a@test', role: 'ESTUDIANTE' });
    TestBed.configureTestingModule({ providers: [
      CharacterProfileRepository,
      { provide: AuthService, useValue: { currentUser } },
      { provide: CharacterManifestService, useValue: { load: () => of(manifest) } },
      { provide: CharacterProfileApi, useValue: api },
      { provide: CHARACTER_PROFILE_STORAGE, useValue: local },
    ] });
  });

  it('el servidor gana sobre una cache vieja del mismo usuario', done => {
    const felipe = manifest.identities.find(item => item.characterId === 'felipe')!.variants[0];
    local.setItem('psychosim.character-profile.v1.user.11', JSON.stringify({
      userId: 11, pendingSync: false, cachedAt: '2026-07-13T00:00:00Z',
      profile: { schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'valentina', variantId: 'base', contentHash: manifest.identities[0].variants[0].contentHash, revision: 1, updatedAt: null },
    }));
    api.get.mockReturnValue(of({ schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'felipe', variantId: 'base', contentHash: felipe.contentHash, revision: 3, updatedAt: null }));
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe(plan => {
      expect(plan.characterId).toBe('felipe'); expect(repo.syncState()).toBe('ready'); done();
    });
  });

  it('usa claves distintas al cambiar de cuenta y nunca lee psychosim_avatar', done => {
    local.setItem('psychosim_avatar', JSON.stringify({ castId: 'felipe' }));
    api.get.mockReturnValue(of(null));
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe(() => {
      repo.select('luisa');
      expect(local.getItem('psychosim.character-profile.v1.user.11')).toContain('luisa');
      currentUser.set({ id: 22, nombre: 'B', apellido: 'B', email: 'b@test', role: 'ESTUDIANTE' });
      repo.ensureLoaded().subscribe(plan => {
        expect(plan.characterId).toBe('valentina');
        expect(local.getItem('psychosim_avatar')).toBeNull(); done();
      });
    });
  });

  it('no usa la cache como si fuera offline ante un 401', done => {
    local.setItem('psychosim.character-profile.v1.user.11', JSON.stringify({
      userId: 11, pendingSync: true, cachedAt: '2026-07-13T00:00:00Z',
      profile: { schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'felipe', variantId: 'base', contentHash: manifest.identities[5].variants[0].contentHash, revision: 2, updatedAt: null },
    }));
    api.get.mockReturnValue(throwError(() => ({ status: 401 })));
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe({
      next: () => done(new Error('un 401 no puede usar el perfil cacheado')),
      error: () => {
        expect(repo.renderPlan()).toBeNull();
        expect(repo.syncState()).toBe('error');
        done();
      },
    });
  });

  it('descarta una respuesta tardía si la cuenta cambió durante el GET', done => {
    const delayed = new Subject<null>();
    api.get.mockReturnValue(delayed);
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe({
      next: () => done(new Error('la cuenta anterior no puede aplicar su respuesta')),
      error: error => {
        expect(String(error)).toMatch(/cuenta cambió/);
        expect(repo.renderPlan()).toBeNull();
        done();
      },
    });
    currentUser.set({ id: 22, nombre: 'B', apellido: 'B', email: 'b@test', role: 'ESTUDIANTE' });
    delayed.next(null); delayed.complete();
  });

  it('con red caída conserva draft pending y reporta guardado local', done => {
    api.get.mockReturnValue(of(null));
    api.put.mockReturnValue(throwError(() => ({ status: 0 })));
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe(() => {
      repo.select('mateo');
      repo.save().subscribe(result => {
        expect(result.persisted).toBe('local');
        expect(repo.syncState()).toBe('offline');
        expect(local.getItem('psychosim.character-profile.v1.user.11')).toContain('"pendingSync":true');
        done();
      });
    });
  });

  it('sincroniza un draft pending al recargar online antes de declarar ready', done => {
    const draft = manifest.identities.find(item => item.characterId === 'mateo')!.variants[0];
    const remote = manifest.identities.find(item => item.characterId === 'valentina')!.variants[0];
    local.setItem('psychosim.character-profile.v1.user.11', JSON.stringify({
      userId: 11, pendingSync: true, cachedAt: '2026-07-13T00:00:00Z',
      profile: { schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'mateo', variantId: 'base', contentHash: draft.contentHash, revision: 2, updatedAt: null },
    }));
    api.get.mockReturnValue(of({
      schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'valentina',
      variantId: 'base', contentHash: remote.contentHash, revision: 2, updatedAt: null,
    }));
    api.put.mockReturnValue(of({
      schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'mateo',
      variantId: 'base', contentHash: draft.contentHash, revision: 3,
      updatedAt: '2026-07-13T12:00:00Z',
    }));
    const repo = TestBed.inject(CharacterProfileRepository);

    repo.ensureLoaded().subscribe(plan => {
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledWith(expect.objectContaining({
        characterId: 'mateo', expectedRevision: 2,
      }));
      expect(plan.characterId).toBe('mateo');
      expect(repo.syncState()).toBe('ready');
      expect(local.getItem('psychosim.character-profile.v1.user.11'))
        .toContain('"pendingSync":false');
      done();
    });
  });

  it('conserva pending y entra en conflicto si la revisión remota avanzó', done => {
    const draft = manifest.identities.find(item => item.characterId === 'mateo')!.variants[0];
    const remote = manifest.identities.find(item => item.characterId === 'valentina')!.variants[0];
    local.setItem('psychosim.character-profile.v1.user.11', JSON.stringify({
      userId: 11, pendingSync: true, cachedAt: '2026-07-13T00:00:00Z',
      profile: { schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'mateo', variantId: 'base', contentHash: draft.contentHash, revision: 2, updatedAt: null },
    }));
    api.get.mockReturnValue(of({
      schemaVersion: 1, manifestVersion: '1.0.0', characterId: 'valentina',
      variantId: 'base', contentHash: remote.contentHash, revision: 3, updatedAt: null,
    }));
    const repo = TestBed.inject(CharacterProfileRepository);

    repo.ensureLoaded().subscribe({
      next: () => done(new Error('un draft obsoleto no puede marcarse ready')),
      error: () => {
        expect(api.put).not.toHaveBeenCalled();
        expect(repo.syncState()).toBe('conflict');
        expect(local.getItem('psychosim.character-profile.v1.user.11'))
          .toContain('"pendingSync":true');
        done();
      },
    });
  });

  it('no disfraza un 400 de contrato como guardado offline', done => {
    api.get.mockReturnValue(of(null));
    api.put.mockReturnValue(throwError(() => ({ status: 400 })));
    const repo = TestBed.inject(CharacterProfileRepository);
    repo.ensureLoaded().subscribe(() => {
      repo.select('felipe');
      repo.save().subscribe({
        next: () => done(new Error('un 400 no puede convertirse en éxito local')),
        error: () => {
          expect(repo.syncState()).toBe('error');
          expect(repo.error()).toMatch(/rechazado/);
          done();
        },
      });
    });
  });
});
```

- [ ] **Step 6: Ejecutar y confirmar el rojo del repository**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-profile.repository.spec.ts`

Expected: FAIL con módulos `character-profile.api` / `character-profile.repository` inexistentes.

- [ ] **Step 7: Implementar el cliente HTTP**

```ts
// frontend/src/app/core/api/character-profile.api.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { CharacterProfileSelectionV1, CharacterProfileV1 } from '../../features/character/character-manifest.model';

interface ApiResponse<T> { readonly success: boolean; readonly data: T; }
interface ProfileEnvelope { readonly profile: CharacterProfileV1 | null; }
export type CharacterProfileWrite = CharacterProfileSelectionV1 & { readonly expectedRevision: number };

@Injectable({ providedIn: 'root' })
export class CharacterProfileApi {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/auth/me/character-profile';

  get(): Observable<CharacterProfileV1 | null> {
    return this.http.get<ApiResponse<ProfileEnvelope>>(this.url).pipe(map(response => response.data.profile));
  }

  put(profile: CharacterProfileWrite): Observable<CharacterProfileV1> {
    return this.http.put<ApiResponse<ProfileEnvelope>>(this.url, profile).pipe(
      map(response => {
        if (!response.data.profile) throw new Error('PUT character-profile sin profile');
        return response.data.profile;
      }),
    );
  }
}
```

- [ ] **Step 8: Implementar el repository completo, cacheado por `user.id`**

```ts
// frontend/src/app/features/character/character-profile.repository.ts
import { HttpErrorResponse } from '@angular/common/http';
import { InjectionToken, Injectable, effect, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, switchMap, tap, throwError } from 'rxjs';
import { CharacterProfileApi } from '../../core/api/character-profile.api';
import { AuthService } from '../../core/auth/auth.service';
import type { AvatarRenderPlan } from './avatar-render-plan.model';
import { defaultCharacterSelection, resolveAvatarRenderPlan } from './avatar-render-plan.util';
import type { CharacterManifestV1, CharacterProfileV1 } from './character-manifest.model';
import { CharacterManifestService } from './character-manifest.service';

export const CHARACTER_PROFILE_STORAGE = new InjectionToken<Storage | null>('CHARACTER_PROFILE_STORAGE', {
  providedIn: 'root', factory: () => typeof localStorage === 'undefined' ? null : localStorage,
});
export type CharacterSyncState = 'idle' | 'loading' | 'ready' | 'dirty' | 'saving' | 'offline' | 'conflict' | 'error';
export interface CharacterSaveResult { readonly plan: AvatarRenderPlan; readonly persisted: 'remote' | 'local'; }
interface CacheEnvelope { readonly userId: number; readonly profile: CharacterProfileV1; readonly pendingSync: boolean; readonly cachedAt: string; }
type HttpFailure = HttpErrorResponse | { readonly status?: number };

function isTransientNetworkFailure(failure: HttpFailure): boolean {
  return failure.status === 0 || [502, 503, 504].includes(failure.status ?? -1);
}

@Injectable({ providedIn: 'root' })
export class CharacterProfileRepository {
  private readonly api = inject(CharacterProfileApi);
  private readonly manifestSource = inject(CharacterManifestService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(CHARACTER_PROFILE_STORAGE);
  private loadedUserId: number | null = null;

  private readonly _manifest = signal<CharacterManifestV1 | null>(null);
  private readonly _profile = signal<CharacterProfileV1 | null>(null);
  private readonly _renderPlan = signal<AvatarRenderPlan | null>(null);
  readonly manifest = this._manifest.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly renderPlan = this._renderPlan.asReadonly();
  readonly syncState = signal<CharacterSyncState>('idle');
  readonly error = signal('');

  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id ?? null;
      if (this.loadedUserId !== null && userId !== this.loadedUserId) this.clearMemory();
    });
  }

  ensureLoaded(): Observable<AvatarRenderPlan> {
    return defer(() => {
      const userId = this.requireUserId();
      if (this.loadedUserId === userId && this._renderPlan()) return of(this._renderPlan()!);
      this.clearMemory(); this.loadedUserId = userId; this.syncState.set('loading');
      this.safeRemove('psychosim_avatar');
      return this.manifestSource.load().pipe(
        tap(manifest => this._manifest.set(manifest)),
        switchMap(manifest => this.api.get().pipe(
          map(remote => ({ manifest, remote, offline: false as const })),
          catchError((failure: HttpFailure) => {
            if (this.auth.currentUser()?.id !== userId) {
              return throwError(() => new Error('La cuenta cambió durante la carga del perfil'));
            }
            if (isTransientNetworkFailure(failure)) {
              return of({ manifest, remote: null, offline: true as const });
            }
            this.syncState.set('error'); this.error.set('No fue posible autenticar la carga del perfil.');
            return throwError(() => failure);
          }),
        )),
        switchMap(({ manifest, remote, offline }) => {
          if (this.auth.currentUser()?.id !== userId) throw new Error('La cuenta cambió durante la carga del perfil');
          return offline
            ? of(this.loadOffline(manifest, userId))
            : this.loadOnline(manifest, userId, remote);
        }),
      );
    });
  }

  select(characterId: string, variantId = 'base'): AvatarRenderPlan {
    const manifest = this.requireManifest(); const current = this.requireProfile();
    const identity = manifest.identities.find(item => item.characterId === characterId);
    const variant = identity?.variants.find(item => item.variantId === variantId);
    if (!identity || !variant) throw new Error(`Selección desconocida: ${characterId}/${variantId}`);
    const profile: CharacterProfileV1 = {
      schemaVersion: 1, manifestVersion: manifest.manifestVersion, characterId, variantId,
      contentHash: variant.contentHash, revision: current.revision, updatedAt: current.updatedAt,
    };
    const plan = this.apply(manifest, profile, 'dirty');
    this.writeCache(this.requireUserId(), profile, true);
    return plan;
  }

  save(): Observable<CharacterSaveResult> {
    const userId = this.requireUserId();
    const profile = this.requireProfile(); const manifest = this.requireManifest();
    const plan = resolveAvatarRenderPlan(manifest, profile);
    this.syncState.set('saving'); this.error.set('');
    return this.api.put({
      schemaVersion: 1, manifestVersion: profile.manifestVersion, characterId: profile.characterId,
      variantId: profile.variantId, contentHash: profile.contentHash, expectedRevision: profile.revision,
    }).pipe(
      map(remote => {
        if (this.auth.currentUser()?.id !== userId) throw new Error('La cuenta cambió durante el guardado del perfil');
        const remotePlan = this.apply(manifest, remote, 'ready');
        this.writeCache(userId, remote, false);
        return { plan: remotePlan, persisted: 'remote' as const };
      }),
      catchError((failure: HttpFailure) => {
        if (this.auth.currentUser()?.id !== userId) return throwError(() => new Error('La cuenta cambió durante el guardado del perfil'));
        if (failure.status === 409) {
          this.syncState.set('conflict'); this.error.set('El perfil cambió en otro dispositivo. Recarga y vuelve a elegir.');
          return throwError(() => failure);
        }
        if (!isTransientNetworkFailure(failure)) {
          this.syncState.set('error'); this.error.set('El servidor rechazó el perfil; no se marcó como sincronizado.');
          return throwError(() => failure);
        }
        this.syncState.set('offline'); this.error.set('Guardado local; se sincronizará al recuperar la conexión.');
        this.writeCache(userId, profile, true);
        return of({ plan, persisted: 'local' as const });
      }),
    );
  }

  retryPending(): Observable<CharacterSaveResult | null> {
    return this.syncState() === 'offline' || this.syncState() === 'dirty' ? this.save() : of(null);
  }

  private loadOffline(manifest: CharacterManifestV1, userId: number): AvatarRenderPlan {
    const cached = this.readCache(userId);
    const profile = this.chooseProfile(manifest, userId, null, true);
    const pendingSync = cached?.pendingSync === true;
    const plan = this.apply(manifest, profile, 'offline');
    this.writeCache(userId, profile, pendingSync);
    return plan;
  }

  private loadOnline(
    manifest: CharacterManifestV1,
    userId: number,
    remote: CharacterProfileV1 | null,
  ): Observable<AvatarRenderPlan> {
    const cached = this.readCache(userId);
    if (!cached?.pendingSync) {
      const profile = this.chooseProfile(manifest, userId, remote, false);
      const plan = this.apply(manifest, profile, 'ready');
      this.writeCache(userId, profile, false);
      return of(plan);
    }

    try {
      resolveAvatarRenderPlan(manifest, cached.profile);
    } catch (error) {
      this.syncState.set('conflict');
      this.error.set('El draft local ya no es compatible con el manifest vigente.');
      return throwError(() => error);
    }
    const remoteRevision = remote?.revision ?? 0;
    if (cached.profile.revision !== remoteRevision) {
      this.syncState.set('conflict');
      this.error.set('El perfil remoto cambió mientras este equipo estuvo sin conexión.');
      return throwError(() => new Error('Draft de personaje con revisión obsoleta'));
    }

    this.apply(manifest, cached.profile, 'dirty');
    return this.save().pipe(map(result => result.plan));
  }

  private chooseProfile(manifest: CharacterManifestV1, userId: number, remote: CharacterProfileV1 | null, offline: boolean): CharacterProfileV1 {
    const cached = this.readCache(userId);
    const candidate = remote ?? (offline || cached?.pendingSync ? cached?.profile ?? null : null);
    const fallback = defaultCharacterSelection(manifest);
    if (candidate) {
      try { resolveAvatarRenderPlan(manifest, candidate); return candidate; } catch { /* manifest actualizado */ }
    }
    return {
      ...fallback,
      revision: remote?.revision ?? candidate?.revision ?? 0,
      updatedAt: remote?.updatedAt ?? candidate?.updatedAt ?? null,
    };
  }

  private apply(manifest: CharacterManifestV1, profile: CharacterProfileV1, state: CharacterSyncState): AvatarRenderPlan {
    const plan = resolveAvatarRenderPlan(manifest, profile);
    this._profile.set(profile); this._renderPlan.set(plan); this.syncState.set(state); return plan;
  }

  private cacheKey(userId: number): string { return `psychosim.character-profile.v1.user.${userId}`; }
  private readCache(userId: number): CacheEnvelope | null {
    try {
      const raw = this.storage?.getItem(this.cacheKey(userId));
      const parsed = raw ? JSON.parse(raw) as CacheEnvelope : null;
      return parsed?.userId === userId ? parsed : null;
    } catch { return null; }
  }
  private writeCache(userId: number, profile: CharacterProfileV1, pendingSync: boolean): void {
    try { this.storage?.setItem(this.cacheKey(userId), JSON.stringify({ userId, profile, pendingSync, cachedAt: new Date().toISOString() } satisfies CacheEnvelope)); } catch { /* cache secundaria */ }
  }
  private safeRemove(key: string): void { try { this.storage?.removeItem(key); } catch { /* no-op */ } }
  private requireUserId(): number {
    const id = this.auth.currentUser()?.id;
    if (!id) throw new Error('CharacterProfileRepository requiere usuario autenticado');
    return id;
  }
  private requireManifest(): CharacterManifestV1 {
    const value = this._manifest(); if (!value) throw new Error('Manifest no cargado'); return value;
  }
  private requireProfile(): CharacterProfileV1 {
    const value = this._profile(); if (!value) throw new Error('Perfil no cargado'); return value;
  }
  private clearMemory(): void {
    this.loadedUserId = null; this._manifest.set(null); this._profile.set(null); this._renderPlan.set(null);
    this.syncState.set('idle'); this.error.set('');
  }
}
```

- [ ] **Step 9: Ejecutar las suites focalizadas**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-manifest.service.spec.ts src/app/features/character/character-profile.repository.spec.ts`

Expected: PASS, `11 passed` entre loader y repository.

- [ ] **Step 10: Commit**

```powershell
git add frontend/src/app/features/character/character-test.fixture.ts `
  frontend/src/app/features/character/character-manifest.service.ts `
  frontend/src/app/features/character/character-manifest.service.spec.ts `
  frontend/src/app/core/api/character-profile.api.ts `
  frontend/src/app/features/character/character-profile.repository.ts `
  frontend/src/app/features/character/character-profile.repository.spec.ts
git commit -m "feat(character-profile): resolver perfil remoto con cache aislada"
```

### Task 8: Renderizar el mismo frame del plan dentro de Angular

**Files:**
- Create: `frontend/src/app/features/character/character-sprite-preview.component.ts`
- Create: `frontend/src/app/features/character/character-sprite-preview.component.spec.ts`
- Create: `frontend/src/app/features/character/character-portrait.component.ts`

- [ ] **Step 1: Escribir tests rojos del cálculo de frame**

```ts
// frontend/src/app/features/character/character-sprite-preview.component.spec.ts
import { makeCharacterManifestFixture } from './character-test.fixture';
import { defaultCharacterSelection, resolveAvatarRenderPlan } from './avatar-render-plan.util';
import { nextFrameCursor, spriteFrameStyle } from './character-sprite-preview.component';

describe('character sprite preview', () => {
  const manifest = makeCharacterManifestFixture();
  const plan = resolveAvatarRenderPlan(manifest, defaultCharacterSelection(manifest));

  it('recorta el frame real sin flip ni escala fraccionaria', () => {
    const style = spriteFrameStyle(plan, 'walk', 'left', 2);
    expect(style.frameIndex).toBe(8);
    expect(style.backgroundPosition).toBe('-96px -72px');
    expect(style.backgroundSize).toBe('288px 288px');
    expect(style.transform).toBe('scale(4)');
  });

  it('derecha usa su propia fila, no la izquierda espejada', () => {
    const left = spriteFrameStyle(plan, 'idle', 'left', 0);
    const right = spriteFrameStyle(plan, 'idle', 'right', 0);
    expect(left.backgroundPosition).toBe('0px -72px');
    expect(right.backgroundPosition).toBe('0px -144px');
  });

  it('el cursor hace loop o se detiene según la animación', () => {
    expect(nextFrameCursor(3, 4, true)).toBe(0);
    expect(nextFrameCursor(3, 4, false)).toBe(3);
    expect(nextFrameCursor(1, 4, false)).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar el rojo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-sprite-preview.component.spec.ts`

Expected: FAIL con `Cannot find module './character-sprite-preview.component'`.

- [ ] **Step 3: Implementar preview de mundo con `background-position` exacto**

```ts
// frontend/src/app/features/character/character-sprite-preview.component.ts
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { AvatarRenderPlan } from './avatar-render-plan.model';
import type { CardinalDirection, CharacterAnimationId } from './character-manifest.model';

export interface SpriteFrameStyle {
  readonly frameIndex: number;
  readonly backgroundImage: string;
  readonly backgroundPosition: string;
  readonly backgroundSize: string;
  readonly transform: string;
}

export function nextFrameCursor(current: number, length: number, loop: boolean): number {
  if (current + 1 < length) return current + 1;
  return loop ? 0 : Math.max(0, length - 1);
}

export function spriteFrameStyle(
  plan: AvatarRenderPlan,
  animationId: CharacterAnimationId,
  direction: CardinalDirection,
  cursor: number,
  scale: 1 | 2 | 3 | 4 = 4,
): SpriteFrameStyle {
  const animation = plan.animations[animationId];
  const sheet = plan.sheets[animation.sheetId];
  const sequence = animation.directions[direction];
  const frameIndex = sequence[Math.min(cursor, sequence.length - 1)] ?? sequence[0];
  const column = frameIndex % sheet.columns;
  const row = Math.floor(frameIndex / sheet.columns);
  return {
    frameIndex,
    backgroundImage: `url("${sheet.src}")`,
    backgroundPosition: `${column === 0 ? 0 : -column * sheet.frameWidth}px ${row === 0 ? 0 : -row * sheet.frameHeight}px`,
    backgroundSize: `${sheet.width}px ${sheet.height}px`,
    transform: `scale(${scale})`,
  };
}

@Component({
  selector: 'app-character-sprite-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="viewport" role="img"
      [attr.aria-label]="plan().displayName + ', ' + animation() + ', ' + direction()"
      [attr.data-character-id]="plan().characterId"
      [attr.data-content-hash]="plan().contentHash"
      [attr.data-animation]="animation()" [attr.data-direction]="direction()"
      [attr.data-frame-index]="style().frameIndex"
      [style.width.px]="plan().logicalFrame.width * scale()"
      [style.height.px]="plan().logicalFrame.height * scale()">
      <span class="sprite" aria-hidden="true"
        [style.width.px]="plan().logicalFrame.width"
        [style.height.px]="plan().logicalFrame.height"
        [style.background-image]="style().backgroundImage"
        [style.background-position]="style().backgroundPosition"
        [style.background-size]="style().backgroundSize"
        [style.transform]="style().transform"></span>
    </span>
  `,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    .viewport { display: block; position: relative; overflow: hidden; }
    .sprite { position: absolute; inset: 0 auto auto 0; transform-origin: top left; background-repeat: no-repeat;
      image-rendering: pixelated; image-rendering: crisp-edges; }
  `],
})
export class CharacterSpritePreviewComponent {
  readonly plan = input.required<AvatarRenderPlan>();
  readonly animation = input<CharacterAnimationId>('idle');
  readonly direction = input<CardinalDirection>('down');
  readonly playing = input(true);
  readonly reducedMotion = input(false);
  readonly scale = input<1 | 2 | 3 | 4>(4);
  readonly restartToken = input(0);
  private readonly cursor = signal(0);
  private readonly sequence = computed(() => this.plan().animations[this.animation()].directions[this.direction()]);
  readonly style = computed(() => spriteFrameStyle(this.plan(), this.animation(), this.direction(), this.cursor(), this.scale()));

  private readonly ticker = effect(onCleanup => {
    const animation = this.plan().animations[this.animation()];
    const length = this.sequence().length;
    this.restartToken();
    this.cursor.set(0);
    if (!this.playing() || this.reducedMotion() || length <= 1) return;
    const timer = window.setInterval(() => {
      if (!animation.loop && this.cursor() >= length - 1) {
        window.clearInterval(timer); return;
      }
      this.cursor.update(current => nextFrameCursor(current, length, animation.loop));
    }, Math.round(1000 / animation.fps));
    onCleanup(() => window.clearInterval(timer));
  });
}
```

- [ ] **Step 4: Implementar el retrato sobre el mismo `AvatarRenderPlan`**

```ts
// frontend/src/app/features/character/character-portrait.component.ts
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { AvatarRenderPlan } from './avatar-render-plan.model';
import type { PortraitState } from './character-manifest.model';
import { nextFrameCursor } from './character-sprite-preview.component';

@Component({
  selector: 'app-character-portrait', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="portrait" role="img" [attr.aria-label]="plan().displayName"
    [attr.data-character-id]="plan().characterId" [attr.data-content-hash]="plan().contentHash"
    [style.background-image]="backgroundImage()"
    [style.background-position]="position()"></span>`,
  styles: [`:host,.portrait{display:block;width:96px;height:96px}.portrait{background-repeat:no-repeat;
    background-size:384px 384px;image-rendering:pixelated;image-rendering:crisp-edges}`],
})
export class CharacterPortraitComponent {
  readonly plan = input.required<AvatarRenderPlan>();
  readonly state = input<PortraitState>('neutral');
  readonly playing = input(true);
  readonly reducedMotion = input(false);
  private readonly cursor = signal(0);
  private readonly frames = computed(() => this.plan().portrait.states[this.state()]);
  readonly backgroundImage = computed(() => `url("${this.plan().portrait.src}")`);
  readonly position = computed(() => {
    const frames = this.frames(); const frame = frames[Math.min(this.cursor(), frames.length - 1)] ?? frames[0];
    return `${-(frame % 4) * 96}px ${-Math.floor(frame / 4) * 96}px`;
  });
  private readonly ticker = effect(onCleanup => {
    const length = this.frames().length; this.cursor.set(0);
    if (!this.playing() || this.reducedMotion() || length <= 1) return;
    const timer = window.setInterval(() => this.cursor.update(value => nextFrameCursor(value, length, true)), Math.round(1000 / this.plan().portrait.fps));
    onCleanup(() => window.clearInterval(timer));
  });
}
```

- [ ] **Step 5: Ejecutar test y build**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-sprite-preview.component.spec.ts`

Expected: PASS, `3 passed`.

Run: `npm run build:frontend`

Expected: exit `0`; no error de template estricto.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/features/character/character-sprite-preview.component.ts `
  frontend/src/app/features/character/character-sprite-preview.component.spec.ts `
  frontend/src/app/features/character/character-portrait.component.ts
git commit -m "feat(character): previsualizar frames exactos del render plan"
```

### Task 9: Sustituir el editor mixto por el editor WYSIWYG premium

**Files:**
- Modify: `frontend/src/app/features/character/character-editor.component.ts`
- Create: `frontend/src/app/features/character/character-editor.component.html`
- Create: `frontend/src/app/features/character/character-editor.component.scss`
- Create: `frontend/e2e/character-editor-premium.e2e.ts`

- [ ] **Step 1: Escribir primero el recorrido rojo de selección/preview**

```ts
// frontend/e2e/character-editor-premium.e2e.ts
import { expect, test, type Page } from '@playwright/test';

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

async function login(page: Page, email = STUDENT_EMAIL, password = STUDENT_PASSWORD) {
  await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(email);
  await page.locator('input[type="password"]').last().fill(password);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//);
}

test('seleccionar una identidad cambia inmediatamente el preview real', async ({ page }) => {
  await login(page);
  await page.goto('/portal/personaje');
  const editor = page.locator('app-character-editor');
  await expect(editor.locator('.ce-cast').getByRole('radio')).toHaveCount(10);
  await expect(editor.getByText(/próximamente|clásico|con bata/i)).toHaveCount(0);

  await editor.getByRole('radio', { name: /felipe/i }).click();
  const preview = editor.locator('.ce-stage app-character-sprite-preview .viewport');
  await expect(preview).toHaveAttribute('data-character-id', 'felipe');
  await expect(preview).toHaveAttribute('data-content-hash', /^[a-f0-9]{64}$/);

  await editor.getByRole('radio', { name: /caminar/i }).click();
  await expect(preview).toHaveAttribute('data-animation', 'walk');
  await editor.getByRole('radio', { name: /espalda/i }).click();
  await expect(preview).toHaveAttribute('data-direction', 'up');
});
```

- [ ] **Step 2: Ejecutar el test contra el editor actual y confirmar el fallo correcto**

Run: `npm run test:e2e -- character-editor-premium.e2e.ts --grep "seleccionar una identidad"`

Expected: FAIL porque el editor actual ofrece más de diez radios y su preview modular no cambia a `felipe`.

- [ ] **Step 3: Reemplazar la clase por estado derivado del repository**

```ts
// frontend/src/app/features/character/character-editor.component.ts
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import type { AvatarRenderPlan } from './avatar-render-plan.model';
import { resolveAvatarRenderPlan } from './avatar-render-plan.util';
import type { CardinalDirection, CharacterAnimationId, CharacterIdentityV1 } from './character-manifest.model';
import { CharacterProfileRepository } from './character-profile.repository';
import { CharacterSpritePreviewComponent } from './character-sprite-preview.component';

@Component({
  selector: 'app-character-editor', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, CharacterSpritePreviewComponent],
  templateUrl: './character-editor.component.html',
  styleUrl: './character-editor.component.scss',
})
export class CharacterEditorComponent implements OnInit {
  readonly repository = inject(CharacterProfileRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly direction = signal<CardinalDirection>('down');
  readonly animation = signal<CharacterAnimationId>('idle');
  readonly playbackNonce = signal(0);
  readonly reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly identities = computed(() => this.repository.manifest()?.identities ?? []);
  readonly selected = this.repository.renderPlan;
  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'ADMIN' ? 'Administrador' : role === 'PROFESOR' ? 'Docente' : 'Estudiante';
  });
  readonly syncLabel = computed(() => ({
    idle: 'Preparando', loading: 'Preparando', ready: 'Lista', dirty: 'Pendiente',
    saving: 'Guardando…', offline: 'Pendiente', conflict: 'Conflicto', error: 'Requiere revisión',
  }[this.repository.syncState()]));
  readonly directions: readonly { id: CardinalDirection; label: string }[] = [
    { id: 'down', label: 'Frente' }, { id: 'left', label: 'Izquierda' },
    { id: 'right', label: 'Derecha' }, { id: 'up', label: 'Espalda' },
  ];
  readonly animations: readonly { id: CharacterAnimationId; label: string }[] = [
    { id: 'idle', label: 'Reposo' }, { id: 'walk', label: 'Caminar' },
    { id: 'talk', label: 'Hablar' }, { id: 'interact', label: 'Interactuar' },
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true); this.loadError.set('');
    this.repository.ensureLoaded().subscribe({
      next: () => this.loading.set(false),
      error: () => { this.loading.set(false); this.loadError.set('No pudimos cargar el elenco. Reintenta.'); },
    });
  }

  cardPlan(identity: CharacterIdentityV1): AvatarRenderPlan {
    const variant = identity.variants[0];
    const manifest = this.repository.manifest();
    if (!manifest || !variant) throw new Error(`Identidad incompleta: ${identity.characterId}`);
    return resolveAvatarRenderPlan(manifest, {
      schemaVersion: 1, manifestVersion: manifest.manifestVersion,
      characterId: identity.characterId, variantId: variant.variantId, contentHash: variant.contentHash,
    });
  }

  summaryFor(characterId: string): string {
    return this.identities().find(identity => identity.characterId === characterId)?.summary ?? '';
  }

  selectCharacter(characterId: string): void { this.repository.select(characterId, 'base'); }
  play(animation: CharacterAnimationId): void {
    this.animation.set(animation); this.playbackNonce.update(value => value + 1);
  }
  reset(): void {
    const id = this.repository.manifest()?.defaultCharacterId;
    if (id) this.repository.select(id, 'base');
    this.direction.set('down'); this.animation.set('idle');
    this.playbackNonce.update(value => value + 1);
  }

  save(): void {
    this.repository.save().subscribe({
      next: result => this.notify.success(result.persisted === 'remote'
        ? 'Personaje guardado y sincronizado.' : 'Personaje guardado en este equipo; sincronización pendiente.'),
      error: () => this.notify.error('El perfil cambió en otro dispositivo. Recarga antes de guardar.'),
    });
  }

  continue(): void {
    this.repository.save().subscribe({
      next: result => {
        if (result.persisted === 'local') this.notify.info('Continuarás con una sincronización pendiente.');
        void this.router.navigate(['/portal/jugar']);
      },
      error: () => this.notify.error('Recarga el perfil antes de continuar.'),
    });
  }
}
```

- [ ] **Step 4: Crear el template sin modo clásico ni controles falsos**

```html
<!-- frontend/src/app/features/character/character-editor.component.html -->
<main class="ce-shell" id="main-content" tabindex="-1"
  [attr.aria-busy]="loading() || repository.syncState() === 'saving'">
  <header class="ce-header">
    <div>
      <p class="ce-kicker">Identidad profesional</p>
      <h1>Elige cómo entrarás a la historia</h1>
      <p>Diez personajes, un mismo lenguaje visual. Tu elección no modifica la evaluación.</p>
    </div>
    <div class="ce-header__actions">
      <span class="ce-role">{{ roleLabel() }}</span>
      <a class="ce-button ce-button--quiet" routerLink="/portal/dashboard">Volver</a>
    </div>
  </header>

  @if (loading()) {
    <section class="ce-status" aria-live="polite">Preparando el elenco…</section>
  } @else if (loadError()) {
    <section class="ce-status ce-status--error" role="alert">
      <p>{{ loadError() }}</p>
      <button type="button" class="ce-button" (click)="load()">Reintentar</button>
    </section>
  } @else if (selected(); as plan) {
    <div class="ce-layout">
      <section class="ce-cast-panel" aria-labelledby="cast-title">
        <div class="ce-section-heading">
          <p>Elenco</p><h2 id="cast-title">Tu personaje</h2>
        </div>
        <div class="ce-cast" role="radiogroup" aria-label="Personaje">
          @for (identity of identities(); track identity.characterId) {
            <button type="button" class="ce-card"
              role="radio" [attr.aria-checked]="plan.characterId === identity.characterId"
              [class.ce-card--selected]="plan.characterId === identity.characterId"
              [attr.aria-label]="identity.displayName"
              (click)="selectCharacter(identity.characterId)">
              <app-character-sprite-preview [plan]="cardPlan(identity)" animation="idle" direction="down"
                [playing]="false" [reducedMotion]="true" [scale]="1" />
              <span>{{ identity.displayName }}</span>
            </button>
          }
        </div>
      </section>

      <section class="ce-stage" aria-labelledby="preview-title">
        <div class="ce-stage__heading">
          <p>Vista real del juego</p><h2 id="preview-title">{{ plan.displayName }}</h2>
        </div>
        <div class="ce-diorama">
          <span class="ce-diorama__light" aria-hidden="true"></span>
          <app-character-sprite-preview [plan]="plan" [animation]="animation()" [direction]="direction()"
            [playing]="true" [reducedMotion]="reducedMotion" [scale]="4" [restartToken]="playbackNonce()" />
        </div>
        <div class="ce-controls">
          <fieldset><legend>Vista</legend><div role="radiogroup" aria-label="Vista del personaje">
            @for (item of directions; track item.id) {
              <button type="button" role="radio" [attr.aria-checked]="direction() === item.id"
                [class.is-active]="direction() === item.id" (click)="direction.set(item.id)">{{ item.label }}</button>
            }
          </div></fieldset>
          <fieldset><legend>Movimiento</legend><div role="radiogroup" aria-label="Animación del personaje">
            @for (item of animations; track item.id) {
              <button type="button" role="radio" [attr.aria-checked]="animation() === item.id"
                [class.is-active]="animation() === item.id" (click)="play(item.id)">{{ item.label }}</button>
            }
          </div></fieldset>
        </div>
      </section>

      <aside class="ce-summary" aria-labelledby="summary-title">
        <p class="ce-kicker">Perfil seleccionado</p>
        <h2 id="summary-title">{{ plan.displayName }}</h2>
        <p>{{ summaryFor(plan.characterId) }}</p>
        <dl>
          <div><dt>Rol</dt><dd>{{ roleLabel() }}</dd></div>
          <div><dt>Estilo</dt><dd>Pixel art SIEP v1</dd></div>
          <div><dt>Variante</dt><dd>Base completa</dd></div>
          <div><dt>Sincronización</dt><dd>{{ syncLabel() }}</dd></div>
        </dl>
        <p class="ce-integrity">La miniatura, esta vista y el simulador usan el mismo contenido verificado.</p>
      </aside>
    </div>

    <footer class="ce-footer">
      <button type="button" class="ce-button ce-button--quiet" (click)="reset()">Restablecer</button>
      <button type="button" class="ce-button ce-button--save" [disabled]="repository.syncState() === 'saving'" (click)="save()">Guardar personaje</button>
      <button type="button" class="ce-button ce-button--primary" [disabled]="repository.syncState() === 'saving'" (click)="continue()">Continuar</button>
    </footer>
  }
</main>
```

- [ ] **Step 5: Crear estilos desktop-first, de píxel dominante**

```scss
/* frontend/src/app/features/character/character-editor.component.scss */
:host { display: block; min-height: 100%; color: #f4f1f7; background: #10121b; }
.ce-shell { min-height: 100vh; padding: 24px; background:
  linear-gradient(rgba(99,80,166,.06) 1px,transparent 1px) 0 0/24px 24px,
  linear-gradient(90deg,rgba(99,80,166,.06) 1px,transparent 1px) 0 0/24px 24px,
  radial-gradient(circle at 50% 20%,#24203a 0,#121522 46%,#0c0e16 100%); }
.ce-header,.ce-cast-panel,.ce-stage,.ce-summary,.ce-footer { position:relative; border:1px solid rgba(194,178,230,.3);
  background:linear-gradient(145deg,rgba(40,43,62,.82),rgba(17,20,32,.91) 52%,rgba(32,27,50,.78));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -1px 0 rgba(116,91,171,.16),0 18px 50px rgba(0,0,0,.28);
  backdrop-filter:blur(18px) saturate(118%);-webkit-backdrop-filter:blur(18px) saturate(118%); }
.ce-header::before,.ce-cast-panel::before,.ce-summary::before,.ce-footer::before { content:"";position:absolute;
  inset:1px 10% auto;width:58%;height:34%;pointer-events:none;opacity:.24;
  background:linear-gradient(112deg,transparent 0,rgba(225,217,255,.16) 42%,rgba(145,204,224,.12) 55%,transparent 72%);
  filter:blur(8px);transform:translate3d(8%,0,0) skewX(-3deg); }
.ce-header>*,.ce-cast-panel>*,.ce-summary>*,.ce-footer>*{position:relative;z-index:1}
.ce-header { max-width: 1420px; margin: 0 auto 16px; padding: 20px 24px; display:flex; align-items:center;
  justify-content:space-between; gap:20px; }
.ce-header h1,.ce-stage h2,.ce-summary h2 { margin:.2rem 0; font-family:Georgia,serif; }
.ce-header p { margin:.25rem 0; color:#c8c3d0; }
.ce-kicker,.ce-section-heading p,.ce-stage__heading p { margin:0; color:#bda4ef; font-size:.75rem;
  font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
.ce-header__actions,.ce-footer { display:flex; align-items:center; gap:10px; }
.ce-role { padding:8px 12px; border:1px solid #655697; background:#282440; }
.ce-layout { max-width:1420px; margin:auto; display:grid; grid-template-columns:300px minmax(500px,1fr) 280px; gap:16px; }
.ce-cast-panel,.ce-summary { padding:18px; }
.ce-section-heading h2 { margin:.2rem 0 1rem; font-size:1.05rem; }
.ce-cast { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.ce-card { min-height:126px; padding:10px 6px; display:grid; place-items:center; align-content:center; gap:8px;
  color:#c9c4d1; background:#151827; border:1px solid #34374e; cursor:pointer; }
.ce-card:hover,.ce-card:focus-visible { border-color:#bda4ef; color:#fff; outline:2px solid transparent; }
.ce-card--selected { color:#fff; border-color:#bda4ef; background:#2b2547; box-shadow:inset 0 0 0 2px #6552a2; }
.ce-stage { min-height:620px; padding:20px; display:grid; grid-template-rows:auto 1fr auto; }
.ce-stage__heading { text-align:center; }
.ce-diorama { min-height:360px; display:grid; place-items:center; position:relative; overflow:hidden;
  background:linear-gradient(#1b2030 0 68%,#252535 68%); }
.ce-diorama::before { content:""; position:absolute; inset:68% 0 auto; height:2px; background:#51486d; }
.ce-diorama__light { position:absolute; width:280px; height:90px; bottom:12%; border-radius:50%;
  background:radial-gradient(ellipse,rgba(116,88,200,.32),transparent 70%); }
.ce-diorama app-character-sprite-preview { position:relative; z-index:1; filter:drop-shadow(0 14px 0 rgba(5,6,12,.48)); }
.ce-controls { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-top:14px; }
fieldset { margin:0; padding:10px; border:1px solid #35394f; } legend { padding:0 6px; color:#bda4ef; font-weight:800; }
fieldset div { display:flex; flex-wrap:wrap; gap:7px; }
fieldset button { min-height:38px; padding:7px 11px; color:#c9c4d1; background:#151827; border:1px solid #3a3e55; cursor:pointer; }
fieldset button.is-active,fieldset button:focus-visible { color:#fff; border-color:#bda4ef; background:#342b59; outline:none; }
.ce-summary p { color:#c8c3d0; line-height:1.55; }.ce-summary dl { margin:20px 0; display:grid; gap:10px; }
.ce-summary dl div { display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid #303346; padding-bottom:8px; }
.ce-summary dt { color:#9f99a8; }.ce-summary dd { margin:0; text-align:right; font-weight:800; }
.ce-integrity { padding:12px; border-left:3px solid #8a70d3; background:#1b1c2d; font-size:.82rem; }
.ce-footer { max-width:1420px; margin:16px auto 0; padding:14px 18px; justify-content:flex-end; }
.ce-button { min-height:44px; padding:9px 17px; color:#f5f2f8; border:1px solid #494c63; background:#1a1d2c;
  font-weight:850; cursor:pointer; text-decoration:none; display:inline-grid; place-items:center; }
.ce-button:hover,.ce-button:focus-visible { outline:2px solid #d1baff; outline-offset:2px; }
.ce-button:disabled { opacity:.48; cursor:wait; }
.ce-button--save { background:#30294e; border-color:#7f6fb2; }.ce-button--primary { background:#6a45d9; border-color:#a98cf0; }
.ce-status { max-width:900px; margin:80px auto; padding:30px; text-align:center; border:1px solid #4b4568; background:#181b2a; }
.ce-status--error { border-color:#a95366; }
@media(max-width:1120px){.ce-layout{grid-template-columns:260px 1fr}.ce-summary{grid-column:1/-1}.ce-stage{min-height:560px}}
@media(max-height:820px) and (min-width:1121px){.ce-shell{padding-top:14px}.ce-header{padding:14px 20px}.ce-stage{min-height:520px}.ce-diorama{min-height:300px}.ce-cast-panel{padding:12px}.ce-cast{gap:8px}.ce-card{min-height:96px;padding:3px}}
@media(max-width:760px){.ce-shell{padding:12px}.ce-header{align-items:flex-start}.ce-layout{grid-template-columns:1fr}.ce-stage{min-height:520px}.ce-controls{grid-template-columns:1fr}.ce-footer{position:sticky;bottom:0}.ce-cast{grid-template-columns:repeat(2,1fr)}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
```

The refracted highlight above is static. Do not add `infinite` animation,
ambient tide, shimmer or continuously moving water to the editor; controlled
160–280 ms interaction waves belong to the dialogue/HUD plan and only run after
open, focus or confirmation gestures.

- [ ] **Step 6: Ejecutar unit tests, build y el E2E que estaba rojo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/avatar-render-plan.util.spec.ts src/app/features/character/character-profile.repository.spec.ts src/app/features/character/character-sprite-preview.component.spec.ts`

Expected: PASS.

Run: `npm run build:frontend`

Expected: exit `0`.

Run: `npm run test:e2e -- character-editor-premium.e2e.ts --grep "seleccionar una identidad"`

Expected: PASS; exactamente diez tarjetas y Felipe visible en el preview.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/character/character-editor.component.ts `
  frontend/src/app/features/character/character-editor.component.html `
  frontend/src/app/features/character/character-editor.component.scss `
  frontend/e2e/character-editor-premium.e2e.ts
git commit -m "feat(character-editor): ofrecer preview wysiwyg de diez identidades"
```

### Task 10: Probar paridad visual, persistencia multidispositivo y aislamiento de cuentas

**Files:**
- Modify: `frontend/e2e/character-editor-premium.e2e.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.spec.ts`
- Modify: `scripts/test-e2e.mjs`

- [ ] **Step 1: Añadir una prueba unitaria roja para reintento al volver la red**

Añadir este caso a `character-profile.repository.spec.ts`:

```ts
it('reintenta el draft pendiente cuando vuelve online', done => {
  api.get.mockReturnValue(of(null));
  api.put
    .mockReturnValueOnce(throwError(() => ({ status: 0 })))
    .mockImplementationOnce(body => of({
      ...body, revision: 1, updatedAt: '2026-07-13T12:00:00Z',
    }));
  const repo = TestBed.inject(CharacterProfileRepository);

  repo.ensureLoaded().subscribe(() => {
    repo.select('mariana');
    repo.save().subscribe(first => {
      expect(first.persisted).toBe('local');
      expect(repo.syncState()).toBe('offline');
      window.dispatchEvent(new Event('online'));
      expect(api.put).toHaveBeenCalledTimes(2);
      expect(repo.syncState()).toBe('ready');
      expect(local.getItem('psychosim.character-profile.v1.user.11')).toContain('"pendingSync":false');
      done();
    });
  });
});
```

- [ ] **Step 2: Ejecutar el caso y confirmar que el listener actual queda vivo fuera del ciclo de DI**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-profile.repository.spec.ts`

Expected: FAIL; `api.put` se invoca una sola vez y `syncState()` sigue en `offline`, porque aún no existe reintento automático.

- [ ] **Step 3: Vincular el listener a `DestroyRef`**

Reemplazar el import Angular, añadir la dependencia y reemplazar el constructor por:

```ts
import { DestroyRef, InjectionToken, Injectable, effect, inject, signal } from '@angular/core';

private readonly destroyRef = inject(DestroyRef);

constructor() {
  effect(() => {
    const userId = this.auth.currentUser()?.id ?? null;
    if (this.loadedUserId !== null && userId !== this.loadedUserId) this.clearMemory();
  });
  if (typeof window !== 'undefined') {
    const onOnline = () => {
      if (this._profile() && (this.syncState() === 'offline' || this.syncState() === 'dirty')) {
        this.retryPending().subscribe({ error: () => undefined });
      }
    };
    window.addEventListener('online', onOnline);
    this.destroyRef.onDestroy(() => window.removeEventListener('online', onOnline));
  }
}
```

- [ ] **Step 4: Alinear las credenciales Playwright con las sembradas por el runner**

Reemplazar `playwrightEnv` y su registro de secretos en `scripts/test-e2e.mjs` por:

```js
const playwrightEnv = {
  ...frontendEnv,
  E2E_BASE_URL: `http://127.0.0.1:${webPort}`,
  E2E_STUDENT_EMAIL: process.env.E2E_STUDENT_EMAIL ?? apiMatrixEnv.SIEP_API_ESTUDIANTE_EMAIL,
  E2E_STUDENT_PASSWORD: process.env.E2E_STUDENT_PASSWORD ?? apiMatrixEnv.SIEP_API_ESTUDIANTE_PASSWORD,
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? apiMatrixEnv.SIEP_API_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? apiMatrixEnv.SIEP_API_ADMIN_PASSWORD,
};
activeCredentialSecrets.push(playwrightEnv.E2E_STUDENT_PASSWORD, playwrightEnv.E2E_ADMIN_PASSWORD);
```

- [ ] **Step 5: Extender el E2E con helpers deterministas**

Añadir después de `login` en `character-editor-premium.e2e.ts`:

```ts
const CAST_IDS = ['valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge', 'luisa', 'mariana', 'mateo'] as const;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@psychosim.edu.co';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!';
test.describe.configure({ mode: 'serial' });

const editorRoot = (page: Page) => page.locator('app-character-editor');
const stagePreview = (page: Page) => editorRoot(page).locator('.ce-stage app-character-sprite-preview .viewport');

async function openEditor(page: Page) {
  await page.goto('/portal/personaje');
  await expect(editorRoot(page).locator('.ce-cast').getByRole('radio')).toHaveCount(10);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: /^cerrar sesión$/i }).click();
  await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
}

async function selectAndSave(page: Page, name: RegExp) {
  await editorRoot(page).locator('.ce-cast').getByRole('radio', { name }).click();
  const response = page.waitForResponse(candidate =>
    candidate.url().includes('/api/auth/me/character-profile')
      && candidate.request().method() === 'PUT',
  );
  await editorRoot(page).getByRole('button', { name: /guardar personaje/i }).click();
  expect((await response).status()).toBe(200);
}
```

- [ ] **Step 6: Añadir la matriz WYSIWYG de las diez identidades**

```ts
test('las diez tarjetas comparten identidad, URL y hash con el preview central', async ({ page }, testInfo) => {
  await login(page);
  await openEditor(page);
  const hashes = new Set<string>();
  const parity: Array<{ characterId: string; contentHash: string; image: string }> = [];

  for (const characterId of CAST_IDS) {
    const card = editorRoot(page).locator(`.ce-card:has([data-character-id="${characterId}"])`);
    await expect(card).toHaveCount(1);
    await card.click();
    const cardFrame = card.locator('app-character-sprite-preview .viewport');
    const stage = stagePreview(page);
    await expect(stage).toHaveAttribute('data-character-id', characterId);
    const stageHash = await stage.getAttribute('data-content-hash');
    expect(stageHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(cardFrame).toHaveAttribute('data-content-hash', stageHash!);
    const image = await stage.locator('.sprite').evaluate(node => getComputedStyle(node).backgroundImage);
    expect(image).toContain(`/assets/characters/v1/${characterId}/base/idle.png`);
    hashes.add(stageHash!);
    parity.push({ characterId, contentHash: stageHash!, image });
    await testInfo.attach(`character-parity-${characterId}.png`, {
      body: await stage.screenshot(),
      contentType: 'image/png',
    });
  }

  expect(hashes.size).toBe(10);
  await testInfo.attach('character-parity.json', {
    body: JSON.stringify(parity, null, 2),
    contentType: 'application/json',
  });
});
```

Parametrizar esta misma prueba —sin duplicar lógica— con
`[{name:'laptop-1366',width:1366,height:768},{name:'desktop-1600',width:1600,height:900}]`.
En cada viewport adjuntar además un screenshot completo y estable, después de
seleccionar `valentina`, con nombre
`editor-<name>-overview.png`; mantener los diez recortes de paridad. La prueba
falla si cualquier tarjeta/preview sale del viewport o usa una escala CSS no
entera. Los cuatro contact sheets se validan mediante el script de Task 4 y el
runner final los regenera bajo su run root exact-HEAD.

- [ ] **Step 7: Añadir reload, restablecer, continuar y segundo dispositivo**

```ts
test('guardar sobrevive reload y otro contexto sin copiar localStorage', async ({ page, browser }) => {
  await login(page);
  await openEditor(page);
  await selectAndSave(page, /mateo/i);
  await page.reload();
  await expect(stagePreview(page)).toHaveAttribute('data-character-id', 'mateo');

  const secondContext = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
  });
  const secondPage = await secondContext.newPage();
  await login(secondPage);
  await openEditor(secondPage);
  await expect(stagePreview(secondPage)).toHaveAttribute('data-character-id', 'mateo');
  expect(await secondPage.evaluate(() => Object.keys(localStorage))).not.toContain('psychosim_avatar');
  await secondContext.close();
});

test('un draft offline sobrevive cierre lógico y hace PUT antes de quedar ready', async ({ page }) => {
  await login(page);
  await openEditor(page);
  await page.route('**/api/auth/me/character-profile', async route => {
    if (route.request().method() === 'PUT') await route.abort('internetdisconnected');
    else await route.continue();
  });
  await editorRoot(page).locator('.ce-cast').getByRole('radio', { name: /mateo/i }).click();
  await editorRoot(page).getByRole('button', { name: /guardar personaje/i }).click();
  await expect(editorRoot(page).getByText(/pendiente/i)).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage)
    .some(key => localStorage.getItem(key)?.includes('"pendingSync":true')))).toBe(true);

  await page.unroute('**/api/auth/me/character-profile');
  const synchronized = page.waitForResponse(response =>
    response.url().includes('/api/auth/me/character-profile')
      && response.request().method() === 'PUT',
  );
  await page.reload();
  expect((await synchronized).status()).toBe(200);
  await expect(stagePreview(page)).toHaveAttribute('data-character-id', 'mateo');
  await expect(editorRoot(page).getByText(/sincronizado/i)).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage)
    .some(key => localStorage.getItem(key)?.includes('"pendingSync":true')))).toBe(false);
});

test('restablecer vuelve a Valentina y continuar persiste antes de navegar', async ({ page }) => {
  await login(page);
  await openEditor(page);
  await editorRoot(page).locator('.ce-cast').getByRole('radio', { name: /felipe/i }).click();
  await editorRoot(page).getByRole('button', { name: /restablecer/i }).click();
  await expect(stagePreview(page)).toHaveAttribute('data-character-id', 'valentina');

  await editorRoot(page).locator('.ce-cast').getByRole('radio', { name: /luisa/i }).click();
  const response = page.waitForResponse(candidate =>
    candidate.url().includes('/api/auth/me/character-profile')
      && candidate.request().method() === 'PUT',
  );
  await editorRoot(page).getByRole('button', { name: /continuar/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/portal\/jugar$/);
  await openEditor(page);
  await expect(stagePreview(page)).toHaveAttribute('data-character-id', 'luisa');
});
```

- [ ] **Step 8: Añadir el cambio de cuenta mediante el cierre de sesión real**

```ts
test('la caché de estudiante jamás contamina la cuenta administradora', async ({ page }) => {
  await login(page);
  await openEditor(page);
  await selectAndSave(page, /felipe/i);

  await logout(page);
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await openEditor(page);
  await expect(stagePreview(page)).toHaveAttribute('data-character-id', 'valentina');
  await selectAndSave(page, /valentina/i);

  const cached = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('psychosim.character-profile.v1.user.'))
    .map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(cached).toHaveLength(2);
  expect(new Set(cached.map(item => item.userId)).size).toBe(2);
  expect(cached.map(item => item.profile.characterId).sort()).toEqual(['felipe', 'valentina']);
  expect(await page.evaluate(() => localStorage.getItem('psychosim_avatar'))).toBeNull();
});
```

- [ ] **Step 9: Ejecutar suites focalizadas y commit**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-profile.repository.spec.ts`

Expected: PASS, incluido draft pending tras nueva instancia, conflicto de
revisión y reintento online sin listener residual.

Run: `npm run test:e2e -- character-editor-premium.e2e.ts`

Expected: PASS en Chromium; diez hashes distintos, draft offline recargado que
hace PUT antes de mostrarse sincronizado, persistencia remota en contexto limpio
y dos envelopes con `userId` distintos.

```powershell
git add frontend/src/app/features/character/character-profile.repository.ts `
  frontend/src/app/features/character/character-profile.repository.spec.ts `
  frontend/e2e/character-editor-premium.e2e.ts scripts/test-e2e.mjs
git commit -m "test(character): probar paridad y aislamiento del perfil"
```

### Task 11: Entregar el contrato al runtime y cerrar gates del corte

**Files:**
- Verify: `frontend/src/app/features/character/character-manifest.model.ts`
- Verify: `frontend/src/app/features/character/avatar-render-plan.model.ts`
- Verify: `frontend/src/app/features/character/avatar-render-plan.util.ts`
- Verify: `frontend/src/app/features/character/clinical-emotion-portrait.util.ts`
- Verify: `frontend/src/app/features/character/actor-render-plan.model.ts`
- Verify: `frontend/src/app/features/character/actor-render-plan.util.ts`
- Verify: `frontend/src/app/features/character/character-profile.repository.ts`
- Verify: `frontend/src/assets/characters/v1/manifest.json`
- Verify: `frontend/src/assets/characters/v1/README.md`
- Verify: `frontend/src/assets/visual/v1/inventory.v1.json`
- Verify: `frontend/src/assets/visual/v1/manifest.json`
- Verify: `frontend/src/assets/visual/v1/README.md`
- Modify: `frontend/src/app/features/simulator/game-menu.component.ts`
- Modify: `frontend/src/app/features/simulator/game-menu.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/attempt-outcome.component.ts`
- Modify: `frontend/src/app/features/simulator/attempt-outcome.component.spec.ts`
- Modify: `frontend/e2e/character-editor-premium.e2e.ts`
- Verify: `frontend/src/app/features/character/avatar.store.ts`
- Verify: `frontend/src/app/features/character/avatar.store.spec.ts`

- [ ] **Step 1: Congelar el handoff exacto para `2026-07-13-world-runtime-motion-camera.md`**

Los planes de runtime y diálogo deben importar —sin duplicar, reinterpretar ni
leer storage— estos contratos/resolvedores y esta API pública:

```ts
// contrato ya implementado por este plan
readonly renderPlan: Signal<AvatarRenderPlan | null>;
readonly manifest: Signal<CharacterManifestV1 | null>;
ensureLoaded(): Observable<AvatarRenderPlan>;
select(characterId: string, variantId?: string): AvatarRenderPlan;
save(): Observable<CharacterSaveResult>;
resolveActorRenderPlan(manifest: CharacterManifestV1, actorId: string): ActorRenderPlan;
resolveNarrativePortraitState(manifest: CharacterManifestV1, emotion: string): PortraitState;
```

`AvatarRenderPlan` y `ActorRenderPlan` son profundamente inmutables y
serializables. Sus campos vinculantes compartidos son `schemaVersion`,
`manifestVersion`, `contentHash`, `displayName`, `paletteId`, `paletteHash`,
`logicalFrame`, `pivot`, `feetHitbox`, `shadow`, `logicalScale`,
`consequenceReactions`, `sheets`,
`animations` y `portrait`; el avatar añade `characterId`/`variantId` y el actor
añade `actorId`/`visualId`/`selectable:false`. En particular,
`animations.walk.contactSequenceIndices=[0,3]` usa índices dentro de cada
secuencia direccional y gobierna también los pasos de audio. `pivot={24,68}` es
el punto de pies frame-local y `feetHitbox={x:-11,y:-16,width:22,height:16}` es
relativo a ese punto: el runtime suma la posición/pivote una sola vez y no hace
conversión adicional. El runtime no puede crear otro hash, cambiar frames,
espejar una dirección, escalar fraccionariamente, caer a un preset/tint ni
seleccionar un asset por `castId`.

`clinicalEmotionPortraitStates` queda incorporado en el mismo manifest derivado
desde `clinical-emotion-map.v1.json`. El plan de diálogo importa
`resolveNarrativePortraitState`; no declara otra tabla ni captura una emoción
desconocida para convertirla en `neutral`.

El handoff incluye además `ConsequenceTone` desde
`core/models/consequence-tone.model.ts` y
`CharacterManifestV1.consequenceReactions`. Runtime debe resolver un
`pose:'react'` únicamente desde ese tono: los cuatro slots son
`reactRelief|reactSteady|reactTension|reactRupture`; tono ausente o valor no
autorado es error observable, nunca `unknown → concerned`. El manifest visual
derivado es el gate de todos los assets de mundo/UI; runtime conserva sus
ScenarioConfig pero no puede introducir rutas, Material Icons, rectángulos,
tints o smoothing que no estén inventariados.

- [ ] **Step 2: Migrar lobby y outcome y aislar el último consumidor runtime**

Escribir primero tests rojos en `game-menu.component.spec.ts` y
`attempt-outcome.component.spec.ts`: ambos reciben el mismo
`AvatarRenderPlan`, muestran `data-character-id`/`data-character-hash`, usan
`CharacterSpritePreviewComponent` con `idle/down` y no leen `AvatarStore` ni
`psychosim_avatar`. Un cambio de cuenta debe actualizar ambos sin recrear una
caché global.

Inyectar `CharacterProfileRepository`, llamar `ensureLoaded()` desde el shell
autenticado una sola vez y pasar su signal a lobby/outcome. No resolver otra
identidad desde nombre, `castId`, localStorage o un asset horneado. Este plan no
puede borrar todavía `avatar.store.ts`: el checkout actual conserva un import de
`AVATAR_STORAGE_KEY` en `game-world.component.ts`, archivo cuya migración
pertenece al plan de runtime. Runtime Task 9 elimina ese último import y hace
`git rm` de store/spec en el mismo commit para que ambos planes compilen al
cerrar cada task. Extender
`character-editor-premium.e2e.ts`: después de guardar cada una de las diez
identidades, comprobar el mismo id/hash en `/portal/jugar`, volver al editor y,
para una partida finalizada sembrada, comprobar outcome.

Run:

```powershell
npm test --prefix frontend -- --runInBand src/app/features/simulator/game-menu.component.spec.ts src/app/features/simulator/attempt-outcome.component.spec.ts
npm run build:frontend
```

Expected: PASS y ningún provider/import de `AvatarStore` en editor, lobby u
outcome; el único puente permitido queda encapsulado en GameWorld hasta Runtime
Task 9.

```powershell
git add frontend/src/app/features/simulator/game-menu.component.ts frontend/src/app/features/simulator/game-menu.component.spec.ts frontend/src/app/features/simulator/attempt-outcome.component.ts frontend/src/app/features/simulator/attempt-outcome.component.spec.ts frontend/e2e/character-editor-premium.e2e.ts
git commit -m "feat(character): unificar identidad en lobby y resultado"
```

- [ ] **Step 3: Ejecutar el gate estático del contrato antes de empezar el plan de runtime**

Run:

```powershell
$files = @(
  'frontend/src/app/features/character/character-manifest.model.ts',
  'frontend/src/app/features/character/avatar-render-plan.model.ts',
  'frontend/src/app/features/character/avatar-render-plan.util.ts',
  'frontend/src/app/features/character/actor-render-plan.model.ts',
  'frontend/src/app/features/character/actor-render-plan.util.ts',
  'frontend/src/app/features/character/character-profile.repository.ts'
)
Select-String -Path $files -Pattern 'psychosim_avatar|localStorage\.getItem|sessionStorage\.getItem|castId' -CaseSensitive
```

Expected: un único resultado permitido: `safeRemove('psychosim_avatar')` en el repository para borrar, sin leer ni migrar, la caché global heredada. Cero resultados para `castId`, `localStorage.getItem` y `sessionStorage.getItem`. Cada acceso vigente está encapsulado detrás de `CHARACTER_PROFILE_STORAGE` y las únicas escrituras nuevas usan `psychosim.character-profile.v1.user.<userId>`.

- [ ] **Step 4: Ejecutar todos los gates automáticos del plan**

Run: `npm run test:character-assets --prefix frontend`

Expected: PASS, incluidos geometría, paleta, espejo, hash y deriva.

Run: `npm run validate:characters --prefix frontend`

Expected: `OK: manifest vigente <64 hex>` y README vigente.

Run: `npm run validate:visual-assets --prefix frontend`

Expected: `OK: visual manifest vigente <64 hex> (8 mapas)`; categorías
tileset/furniture/person/object/tool/exit/signal/prompt/HUD completas, cero
`unreviewed`, antialias, escala fraccionaria, ruta o tileset roto.

Run: `npm run check:backend`

Expected: `System check identified no issues`.

Run: `npm run test:backend`

Expected: suite completa verde sobre la PostgreSQL desechable.

Run: `npm run test:frontend`

Expected: suite Jest completa verde, sin timers ni listeners abiertos.

Run: `npm run build:frontend`

Expected: exit `0`; `prebuild` valida ambos manifests derivados antes de compilar Angular.

Run: `npm run test:e2e -- character-editor-premium.e2e.ts`

Expected: suite premium verde en Chromium.

- [ ] **Step 5: Abrir el stack y hacer el gate visual desktop/portátil**

Run: `npm run up`

Expected: frontend en `http://localhost:4200`, backend en `http://localhost:8091` y login estudiante funcional con `estudiante@psychosim.edu.co` / `Estudiante123!`.

En `/portal/personaje`, revisar exactamente a `1366×768` y `1600×900`. Para
cada identidad: seleccionar las cuatro direcciones; reproducir idle, walk, talk
e interact; comparar miniatura/preview; guardar; recargar. Abrir también los
contact sheets `characters`, `npc`, `world-assets` y `hud-assets` a 1×/4× y
comparar los cuatro tonos cuerpo/retrato para cada una de las 21 variantes.
Rechazar si hay blur, escala no entera, clipping, cambio de identidad, dirección
espejada, salto de pivote, reacción incongruente, asset genérico o corte de
controles.

Expected: matriz de handoff `10 identidades × 4 direcciones × 4 ciclos × 2
viewports`, contact sheets completos y dos screenshots editor. Es una revisión
de producción previa; la aprobación humana final se repite sobre el exact HEAD
en el plan de checkpoint junto a exploración e interacción live.

- [ ] **Step 6: Verificar el puente legado acotado para el plan de runtime**

Run:

```powershell
$runtimeFiles = Get-ChildItem -Path @(
  'frontend/src/app/features/character',
  'frontend/src/app/features/simulator'
) -Recurse -File -Filter '*.ts' | Where-Object {
  $_.FullName -notmatch 'avatar\.store(\.spec)?\.ts$'
}
$runtimeFiles | Select-String -Pattern 'psychosim_avatar|AvatarStore|AVATAR_STORAGE_KEY' -CaseSensitive
```

Expected: dos clases de resultado y ninguna más: `safeRemove('psychosim_avatar')`
en el repository para borrar la clave heredada, y el import de
`AVATAR_STORAGE_KEY` en `game-world.component.ts`. No quedan providers/consumos
de `AvatarStore` en editor, lobby u outcome. Runtime Task 9 debe convertir este
scan en cero hits de GameWorld y borrar store/spec; si aparece otro consumidor,
detener el handoff.

- [ ] **Step 7: Commit de cualquier ajuste de verificación estrictamente necesario**

Si los gates obligaron a corregir un archivo de este plan, repetir Steps 3–6 y hacer un commit específico. Si no hubo cambios, no crear commit vacío.

```powershell
git status --short
git log --oneline -12
```

Expected: solo cambios intencionales del corte; historial con commits pequeños de contrato, pipeline, cada identidad, manifest, perfil, preview, editor y E2E.
