# Juego 2.5D — Rebanada 1: Motor de profundidad (Y-sort + capas Tiled + profundidad procedural)

- **Fecha:** 2026-06-05
- **Estado:** Aprobado por el usuario (control delegado total — "todo lo que recomiendes dalo por aceptado"). Gate de revisión de spec delegado: se deja escrito para auditoría posterior.
- **Iniciativa:** SIEP 2.5D pixel-art (`docs/PROMPT_SIEP_2_5D_PIXEL_ART_COMPLETO.md`). Esta es la **rebanada 1 de ~7**; el resto (props pixel-art reales, editor de personaje, rediseño HUD, escenarios, pulido) son rebanadas dedicadas posteriores.
- **Repos:** **solo frontend** (`frontend/`). **Sin backend, sin migración** (RNF-010 intacto: solo se *leen* campos opcionales de `ambient_json`).
- **Rama:** `feat/game-2_5d-depth-engine`, sobre `master`.

## 1. Contexto

El runtime Phaser (`frontend/src/app/features/simulator/game-world.component.ts`) hoy simula profundidad con **bandas fijas**, no con ordenamiento por eje Y:

- Suelo procedural `depth 0`, grid `1`, capas Tiled `Floor=2`/`Walls=3`, marcadores de objeto `12`, NPCs `15`, guía `16`, jugador `20`, hints de puerta `25`.
- Resultado: el jugador **siempre** se dibuja encima de todo lo dinámico; nunca queda "detrás" de un NPC u objeto más cercano a cámara. Esto rompe la ilusión 2.5D que pide §4/§26 del prompt.
- Los mapas Tiled solo tienen capas `Floor` + `Walls` (faltan `props_back`/`props_front`/`lighting`/`overlay` de las 9 capas de §25).
- Config Phaser: `pixelArt: true` ✅, pero **sin `roundPixels`** (§27). Tamaño interno 960×540.
- Hay **dos rutas de render** que coexisten a propósito (PROMPT_MAESTRO §10): `renderWorld()` (BD-driven, caso `SIM-VBG-001`) y `renderRoom()` (ScenarioConfig, comisaría/hospital multi-sala). Ambas deben quedar consistentes.
- `ambient_json` ya viaja al runtime (`world.map.ambient`) y ya se usa para `cameraZoom`/`backgroundImage` (Fases 4-5 del editor).

## 2. Objetivos / No-objetivos

**Objetivos:**
1. **Y-sort de actores dinámicos**: jugador, NPCs (`npcMarkers`), guía y marcadores de objeto (`markers`) se ordenan por su coordenada `y` en una **banda compartida**, de modo que el que está más abajo en pantalla tapa al que está más arriba. Se actualiza cada frame para los que se mueven.
2. **Soporte de las 9 capas Tiled** (§25) en **ambas** rutas de render: si el mapa trae capas con esos nombres se renderizan en su banda de profundidad (`props_back` detrás de actores, `props_front` delante → oclusión). Retrocompatible: mapas con solo `Floor`+`Walls` se comportan idénticos.
3. **Sombras + iluminación procedurales** (sin arte): sombra suave estandarizada bajo actores + overlay de iluminación sutil (viñeta + foco) en banda `lighting`, configurable desde `ambient_json` con default discreto.
4. **`roundPixels: true`** en la config Phaser (anti-shimmer sub-pixel en pixel-art).
5. **Util pura testeable** (`depth-sort.util.ts`) que centraliza bandas y cálculo de profundidad → cubierta por Jest (TDD).

**No-objetivos (rebanadas posteriores):**
- Crear/contratar **arte pixel-art real** (tilesets, props con volumen, sprites de avatar por capas, PNGs de sombra/luz).
- **Autorar** capas `props_front`/`lighting` en mapas concretos (se da soporte de motor; el contenido es otra rebanada).
- **Editor de personaje**, rediseño **HUD liquid-glass**, escenarios nuevos, bump a **1280×720** (cambiar el tamaño interno ahora arriesga regresiones de cámara/coordenadas).
- Tocar backend / esquema.

## 3. Diseño

### 3.1 `depth-sort.util.ts` (nuevo, puro) + `depth-sort.util.spec.ts`

Centraliza la política de profundidad. Sin dependencias de Phaser (recibe números).

```ts
export const DEPTH = {
  FLOOR: 0, GRID: 1, BACKGROUND: 1,
  PROPS_BACK: 2, WALLS: 3, ENVIRONMENT: 4,
  ACTORS_BASE: 1000,      // banda Y-sorted: actores ocupan [1000, 1000 + maxY]
  PROPS_FRONT: 100000,    // siempre delante de actores
  LIGHTING: 200000, OVERLAY: 300000,
  UI: 500000,             // hints/labels pineados, títulos
} as const;

/** Profundidad de un actor dinámico según su Y (más abajo = más al frente). */
export function actorDepth(y: number): number { return DEPTH.ACTORS_BASE + Math.max(0, y); }

/** Mapea un nombre de capa Tiled (con o sin prefijo numérico, case-insensitive)
 *  a su banda de profundidad. Devuelve null si el nombre no es una capa 2.5D conocida. */
export function tiledLayerDepth(name: string): number | null;  // p.ej. "3_props_back"/"props_back" → DEPTH.PROPS_BACK
```

- `actorDepth`: monótona en `y`; clamp a `>= 0`. Como los mapas son < ~100000 px de alto, `PROPS_FRONT` siempre gana.
- `tiledLayerDepth`: tabla `{floor, walls_back, props_back, collision, interactables, characters, props_front, lighting, overlay}` → banda; tolera prefijos `1_`..`9_` y mayúsculas; nombres legacy `Floor`/`Walls` mapean a `FLOOR`/`WALLS`.

### 3.2 Config Phaser (`boot()`)

Agregar `roundPixels: true` al `new Phaser.Game({...})`. Sin otros cambios (tamaño 960×540 se mantiene; `antialias` ya queda off por `pixelArt`).

### 3.3 Y-sort de actores (`DataDrivenWorldScene`)

- **Creación**: jugador, NPCs, guía y marcadores siguen creándose como hoy, pero su `depth` inicial pasa a `actorDepth(container.y)` en vez de las constantes fijas 12/15/16/20. Los **sub-elementos pineados** (hints de puerta `doorHints`, bubble de la guía, título de mapa con `scrollFactor(0)`) usan `DEPTH.UI`.
- **Actualización por frame** en `update()`: tras mover al jugador y a los `ambientMovers`/guía, recalcular `setDepth(actorDepth(y))` para todos los actores que pueden cambiar de `y` (jugador, movers, guía). Los marcadores estáticos se fijan una vez al crearse.
- Helper privado `private ysort(obj: {y:number} & {setDepth(d:number):unknown})` para no repetir.

### 3.4 Capas Tiled 9-capas (ambas rutas)

En el bloque que crea el tilemap (en `renderWorld()` y `renderRoom()`), tras registrar tilesets, iterar sobre `tilemap.layers` y para cada `LayerData` cuyo nombre resuelva con `tiledLayerDepth(...) !== null`, crear la capa y asignarle esa banda. Mantener el manejo actual de `Floor`/`Walls` (la capa `walls_back`/`Walls` sigue alimentando `this.wallsLayer` para colisión). Capas ausentes → no-op. Extraer a un helper `private buildTiledLayers(tilemap, tilesets)` compartido por ambas rutas para evitar divergencia.

### 3.5 Sombras + iluminación procedurales

- **Sombra**: las elipses bajo jugador/NPCs/guía ya existen; se mantienen como hijos del container (viajan con el Y-sort, correcto).
- **Overlay de iluminación**: nuevo `private applyLightingOverlay(mapW, mapH)` llamado al final de `renderWorld()`/`renderRoom()`. Dibuja una **viñeta** procedural (rectángulo oscuro con esquinas, vía `Graphics` con baja alpha) en `DEPTH.LIGHTING`, pineada a cámara (`setScrollFactor(0)`) cubriendo el viewport. Lee `ambient.ambientTone` (`'calm'|'warm'|'clinical'|...`) para el tinte y `ambient.lightingOverlay` para una intensidad opcional; default: viñeta muy sutil neutra. Estático (sin tween) → seguro con `prefers-reduced-motion`. Se omite si el resultado fuese imperceptible para no añadir overdraw inútil.

### 3.6 Invariantes respetados (PROMPT_MAESTRO §16)

- Spring congelado, sin migración, `ambient_json` solo lectura (RNF-010).
- Ambas rutas de render y los mapas actuales siguen funcionando (extender, no reescribir).
- `prefers-reduced-motion` respetado.
- Salida segura / flujo del estudiante sin cambios (esto es puramente visual).

## 4. Manejo de errores / bordes

- Mapa sin capas nuevas → solo `Floor`/`Walls`, idéntico a hoy.
- `actorDepth` con `y` negativo (spawn raro) → clamp a 0.
- Sin `ambient` o sin `ambientTone` → viñeta default neutra.
- Dos actores con el mismo `y` → orden estable arbitrario (irrelevante visualmente).
- Marcadores con label/hint hijos: el container Y-sortea, los hijos heredan; los hints de proximidad que deben ir SIEMPRE arriba se crean aparte en `DEPTH.UI`.

## 5. Pruebas

- **jest (TDD, nuevo):** `depth-sort.util.spec.ts`
  - `actorDepth` monótona: `actorDepth(100) < actorDepth(200)`; clamp `actorDepth(-5) === ACTORS_BASE`.
  - `actorDepth(y) < DEPTH.PROPS_FRONT` para `y` realista (≤ 20000).
  - `tiledLayerDepth`: `'props_back'`, `'3_props_back'`, `'PROPS_BACK'` → `DEPTH.PROPS_BACK`; `'Floor'` → `DEPTH.FLOOR`; `'desconocida'` → `null`.
- **ng build** verde.
- **jest suite** completa sigue verde (sin regresión).
- **Smoke navegador** (Brave, permiso permanente del usuario): abrir `SIM-VBG-001` (`/portal/simulador/1`), caminar el jugador por **detrás** de un NPC/marcador → queda parcialmente tapado; caminar por delante → tapa al NPC. Captura antes/después. Verificar viñeta sutil y que la UID/HUD no se ve afectada.

## 6. Criterios de aceptación

- Actores se ocluyen entre sí por eje Y en ambas rutas de render.
- Si un mapa trae capa `props_front`, sus tiles tapan al jugador; `props_back` queda detrás.
- `roundPixels` activo; sin shimmer.
- Mapas actuales (solo `Floor`/`Walls`) sin cambios de comportamiento; HUD, hints y título intactos.
- `depth-sort.util.spec.ts` verde; `ng build` verde; suite jest sin regresión.
- Sin backend, sin migración, sin romper el flujo del estudiante.

## 7. Cómo se procede

`writing-plans` → plan en `docs/superpowers/plans/2026-06-05-game-2_5d-depth-engine.md` → `executing-plans` (TDD, rama `feat/game-2_5d-depth-engine`) → `verify` (jest + `ng build` + smoke con Y-sort visible) → `finishing-a-development-branch` (push + PR). Las siguientes rebanadas (arte, editor de personaje, HUD) van en sus propias ramas.
