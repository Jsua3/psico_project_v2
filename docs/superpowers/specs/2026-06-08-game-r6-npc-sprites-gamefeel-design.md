# Juego 2.5D — Rebanada 6: NPC Character Sprites reales + GameFeel

- **Fecha:** 2026-06-08
- **Estado:** Aprobado (control delegado total).
- **Iniciativa:** SIEP 2.5D pixel-art. Rebanada 6 de 7.
- **Repos:** **solo frontend.** Sin backend, sin migración.
- **Rama:** `feat/plan-maestro-total` (rama activa).

## 1. Contexto

Existen 4 sprite sheets de personajes NPC reales en `docs/assets_5.1_solucionado/`:
- `doctor-male-labcoat.png` — 128×180 px/frame, 18 frames
- `orientadora-casual-female.png`
- `orientadora-female-labcoat.png`
- `staff-male-glasses-beard.png`

Ya copiados a `frontend/src/assets/characters/sprite-sheets/`. El layout es:
- `IDLE_FRONT` → frames [0,1] a 2 fps
- `WALK_DOWN`  → frames [2-5] a 8 fps
- `WALK_LEFT`  → frames [6-9] a 8 fps
- `WALK_RIGHT` → frames [10-13] a 8 fps
- `WALK_UP`    → frames [14-17] a 8 fps

Actualmente `spawnNpcs()` usa la textura Kenney `'characters'` con `npc.frameIndex`. Los sprites reales no están conectados.

También existe `GameFeelService` + `VignettePipeline` WebGL implementados pero sin verificación formal.

## 2. Objetivos

1. **`avatar-animation-layout.ts`** copiado desde el pack a `frontend/src/app/features/simulator/`.
2. **`NpcConfig`** extendido con campo opcional `characterId?: string` (sin migración: campo frontend-only).
3. **Preload** de los 4 character sheets en `DataDrivenWorldScene` con `frameWidth:128, frameHeight:180`.
4. **Animaciones Phaser** creadas para cada personaje: keys `npc_{characterId}_idle_front`, `npc_{characterId}_walk_down`, etc.
5. **`spawnNpcs`** actualizado: si `npc.characterId` existe y la textura cargó → usar sprite de personaje real con animación `idle_front`; sino → fallback Kenney existente.
6. **GameFeel verificado**: `ng build` verde con `VignettePipeline` y `GameFeelService`; smoke confirma que vignette se ve en juego.

## 3. Diseño

### 3.1 `avatar-animation-layout.ts`

Copiar `02_RENDERER_PATCH/typescript/avatar-animation-layout.ts` del pack a:
`frontend/src/app/features/simulator/avatar-animation-layout.ts`

Sin modificaciones — expone `AVATAR_SPRITE_LAYOUT_18` (frameWidth: 128, frameHeight: 180) y helpers `getAvatarFrameIndex` / `getAvatarFrameRect`.

### 3.2 Extensión de `NpcConfig`

En `frontend/src/app/core/models/simulation.model.ts`:
```ts
export interface NpcConfig {
  key: string;
  npcType: 'supervisor' | 'colleague' | 'family' | 'witness';
  displayName: string;
  portrait: string;
  x: number;
  y: number;
  frameIndex: number;               // Kenney fallback — se mantiene
  characterId?: string;             // NEW: id del sprite real, e.g. 'doctor-male-labcoat'
  dialogue: NpcDialogue;
}
```

Retrocompatible: `characterId` es opcional; todos los NPCs existentes siguen funcionando.

### 3.3 Preload en `DataDrivenWorldScene`

En `preload()`, añadir:

```ts
const NPC_CHARACTER_IDS = [
  'doctor-male-labcoat',
  'orientadora-casual-female',
  'orientadora-female-labcoat',
  'staff-male-glasses-beard',
] as const;

const charOpts = { frameWidth: 128, frameHeight: 180 };
for (const id of NPC_CHARACTER_IDS) {
  this.load.spritesheet(
    `npc_${id}`,
    `assets/characters/sprite-sheets/${id}.png`,
    charOpts,
  );
}
```

Si el archivo no existe, el loader lo ignora silenciosamente (ya hay un `loaderror` handler en la escena).

### 3.4 Crear animaciones NPC (una sola vez)

Helper privado `private createNpcAnimations(): void` llamado en `create()`:

```ts
for (const id of NPC_CHARACTER_IDS) {
  if (!this.textures.exists(`npc_${id}`)) continue;
  const defs = [
    { suffix: 'idle_front', frames: [0,1],           fps: 2  },
    { suffix: 'walk_down',  frames: [2,3,4,5],       fps: 8  },
    { suffix: 'walk_left',  frames: [6,7,8,9],       fps: 8  },
    { suffix: 'walk_right', frames: [10,11,12,13],   fps: 8  },
    { suffix: 'walk_up',    frames: [14,15,16,17],   fps: 8  },
  ];
  for (const d of defs) {
    const key = `npc_${id}_${d.suffix}`;
    if (this.anims.exists(key)) continue;
    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(`npc_${id}`, { frames: d.frames }),
      frameRate: d.fps,
      repeat: -1,
    });
  }
}
```

### 3.5 `spawnNpcs` actualizado

```ts
const charKey = npc.characterId ? `npc_${npc.characterId}` : null;
if (charKey && this.textures.exists(charKey)) {
  sprite = this.add.sprite(0, -16, charKey)
    .setScale(0.55)  // 128px → ~70px on screen
    .play(`${charKey}_idle_front`);
} else if (this.assetsLoaded && this.textures.exists('characters')) {
  sprite = this.add.sprite(0, 0, 'characters', npc.frameIndex).setScale(1.5);
} else {
  sprite = this.add.circle(0, -8, 10, 0x4fa3a5, 1);
}
```

Offset Y de -16 para anclar los pies del sprite de 180px al suelo del container.

### 3.6 GameFeel verificación

`VignettePipeline` y `GameFeelService` ya están implementados. Esta rebanada solo verifica que:
- `ng build` compila sin errores con estos módulos
- La vignette es visible en smoke

## 4. Errores / bordes

- Sprite sheet no cargado → fallback Kenney transparente al usuario.
- `characterId` con valor inválido → `textures.exists()` retorna false → fallback.
- Escala: 0.55 aproxima 128px → ~70px útil en mapa; ajustable por smoke.
- `NPC_CHARACTER_IDS` como `const` array para que TS valide los ids.

## 5. Pruebas

- **ng build** verde.
- **jest suite** sin regresión (no hay test unitario para Phaser).
- **Smoke**: configurar un NPC con `characterId: 'doctor-male-labcoat'` en un caso; verificar que aparece el sprite real animado en idle; caminar cerca → animación correcta; fallback intacto en NPCs sin `characterId`.

## 6. Criterios de aceptación

- NPCs con `characterId` muestran su sprite real de 128×180 animado; NPCs sin `characterId` siguen con Kenney.
- `avatar-animation-layout.ts` en el frontend.
- `ng build` verde; suite jest sin regresión.
- `VignettePipeline` + `GameFeelService` compilan y son visibles en smoke.
