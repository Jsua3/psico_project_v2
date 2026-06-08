# SIEP v5.1 Runtime Patch

Este parche hace que el paquete cumpla con lo que señaló la IA de código:
los sprites reales no son de 48 frames, sino de 18 frames.

## Qué corrige
- Crea sprite sheets runtime de 18 frames.
- Define el layout real en JSON y TypeScript.
- Incluye helper para corregir `avatar-renderer.ts`.
- Copia los assets a una ruta compatible con `frontend/src/assets/characters/sprite-sheets/`.

## Layout correcto
```txt
IDLE_FRONT  -> 2 frames  (frame 0-1)
WALK_DOWN   -> 4 frames  (frame 2-5)
WALK_LEFT   -> 4 frames  (frame 6-9)
WALK_RIGHT  -> 4 frames  (frame 10-13)
WALK_UP     -> 4 frames  (frame 14-17)
```

## Ruta importante
`01_RUNTIME_READY/frontend/src/assets/characters/sprite-sheets/`

## Qué debe hacer Codex/Claude Code
1. Copiar `01_RUNTIME_READY/frontend/src/assets/characters/` al proyecto.
2. Usar `sprite-layout-18frames.json` o `avatar-animation-layout.ts`.
3. Quitar la suposición vieja de 48 frames en `avatar-renderer.ts`.
