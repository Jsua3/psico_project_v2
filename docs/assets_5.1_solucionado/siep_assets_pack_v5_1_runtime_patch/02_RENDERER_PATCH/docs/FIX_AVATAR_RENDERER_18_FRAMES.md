# Fix avatar-renderer.ts — 18 frames

## Hallazgo
El renderer anterior asume 48 frames y 4 idles direccionales. Los assets reales generados tienen 18 frames.

## Layout runtime real
```txt
IDLE_FRONT  -> frames 0-1
WALK_DOWN   -> frames 2-5
WALK_LEFT   -> frames 6-9
WALK_RIGHT  -> frames 10-13
WALK_UP     -> frames 14-17
```

## Cambio recomendado
Reemplazar cualquier lógica hardcodeada de 48 frames por `AVATAR_SPRITE_LAYOUT_18`.

## Archivos incluidos
- `typescript/avatar-animation-layout.ts`
- `typescript/avatar-renderer-18frames.ts`
- `../01_RUNTIME_READY/frontend/src/assets/characters/metadata/sprite-layout-18frames.json`

## Nota importante
Los archivos `.runtime-18.png` son los que deben usar animación. Los `.reference-board.png` solo son referencia visual.
