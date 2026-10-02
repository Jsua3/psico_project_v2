# Verificación en vivo — personaje v1 (idle+walk)

- **Fecha:** 2026-07-20
- **Rama:** `feat/personaje-v1-idle-walk`
- **Stack de prueba:** backend Django del worktree en :8091 (venv de master, código del worktree para casar el flujo de token de intento) + frontend del worktree `ng serve` en :4321 (proxy → :8091). BD `psychosim` en Docker (:5433).

## Qué se verificó (VERDE)

Login estudiante → catálogo → nuevo intento del caso 221 (VBG).

**Endpoints (red):**
- `POST /api/simulation/attempts` → 200
- `GET .../world` → **200** (tras casar backend del worktree; ver nota de mismatch)
- `GET /assets/characters/v1/valentina/base/idle.png` → **200**
- `GET /assets/characters/v1/valentina/base/walk.png` → **200**

**Estado en vivo de la escena Phaser** (leído con `ng.getComponent` sobre el ancestro del `<canvas>` en dev-mode → `GameWorldComponent.scene`):

```json
{ "playerV1Id": "valentina",
  "playerCastId": "valentina",
  "has_v1_walk_tex": true,
  "has_v1_idle_tex": true }
```

**Conclusión de cableado:** el avatar por defecto resuelve a la identidad v1 `valentina` (`resolvePlayerVisual` → `kind:'v1'`), y las hojas v1 `idle`+`walk` se cargan y quedan registradas como texturas Phaser. Como `game-world` **solo** encola las hojas v1 en la rama `kind==='v1'`, su presencia prueba que el camino de código v1 se ejecutó. **El cableado funciona en runtime.**

## Qué NO se pudo verificar aquí (limitación de entorno, no del código)

El **render final on-screen** (sprite ligado a la textura v1, ciclo de 6 frames, 4 direcciones, escala/pies) y el **juicio visual del riesgo E** (densidad de píxel jugador-vs-NPC) **no** se pudieron capturar en el Browser pane automatizado:

- La captura del canvas WebGL vía `toDataURL` sale en negro (limitación conocida del Browser pane con Phaser).
- El loader Phaser se estanca a **32/127 (25%)** con `inflight:[]`, `queue:[]`, `totalFailed:0`. Diagnóstico: `document.hidden === true` (el Browser pane mantiene la pestaña oculta) aunque `game.loop` corre a 60 fps. Las hojas v1 ya habían cargado (entre las primeras 32); el estancamiento es en assets posteriores no relacionados con este cambio. Auditorías previas confirman que el juego corre completo en un navegador real.

**Pendiente para el usuario (en su navegador real):** abrir el juego con el avatar por defecto (valentina→v1), caminar en las 4 direcciones y evaluar (1) fin del "flotar", (2) coherencia de cara entre direcciones, (3) densidad de píxel jugador-vs-NPC. Si la escala/pies no calzan, ajustar `V1_AVATAR_SCALE` y/o `V1_FEET_ORIGIN_Y` en `v1-avatar.util.ts` contra una captura real (regla de oro).

## Nota: mismatch de versión backend↔frontend (resuelto en la prueba)

El frontend del worktree (linaje `codex/calidad-9-10`) exige el **token de intento en header** en `.../world`. Un backend de `master` (más viejo) responde `400 "El token del intento es obligatorio"`. Correr el backend desde el **código del worktree** lo resuelve. Relevante para cualquier smoke futuro: **el backend debe ser del mismo linaje que el frontend.**
