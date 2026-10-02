# Diseño — Personaje jugable con arte v1 coherente (idle + walk)

- **Fecha:** 2026-07-20
- **Rama base:** `codex/calidad-9-10` (`4e9f8fe`) · **rama de trabajo:** `feat/personaje-v1-idle-walk`
- **Alcance elegido:** intermedio (vía `baked-cast`), núcleo **idle + walk**. Riesgo E aceptado.

## 1. Problema

El personaje **del jugador** se renderiza con el sistema **modular por capas** (`avatar-figure` / `phaser-avatar-renderer`, base `/assets/characters/modular`). Dos defectos visibles para el estudiante:

1. **Caras incoherentes entre direcciones.** `modular/face/face_neutral.png` dibuja los ojos con **peso y escala distintos** entre la fila frontal (marcas finas), la de perfil ("T" gruesas) y la de espalda. Al girar, el personaje parece cambiar de cara.
2. **Caminata que "flota".** Hasta las hojas horneadas buenas (`cast/*.png`) usan un ciclo de **3 frames** (reposo + ping-pong `[1,0,2,0]`), sin contactos de pie reales.

**Causa raíz del defecto 1:** `defaultAvatar()` (en `avatar-config.util.ts`) **no trae `castId`**, así que un estudiante que no entra al editor a elegir personaje cae al modular crudo por omisión.

## 2. Contexto: tres sistemas de personaje coexisten

| Sistema | Base de assets | Contrato | Quién lo usa hoy |
|---|---|---|---|
| `modular/` | capas (cuerpo+pelo+cara) | 384×576, 3 col × 3 dir, frame 128×192 | **el jugador por defecto** (crudo) |
| `cast/` (horneado) | hoja integrada por persona | **mismo** contrato modular (drop-in) | NPCs del caso + jugador *si* eligió castId |
| `v1/<id>/base/` | hoja premium por identidad | **48×72 nativo**, 4 direcciones reales, 6 frames de walk | **nadie** (desconectado) |

El arte v1 es **coherente y ya está dibujado**. El problema es puramente de cableado. Existe además un pipeline "oficial" v1 (`resolveAvatarRenderPlan` + `CharacterManifestV1`) pero exige un manifest rico (geometría de frames, content-hashes, hashes de paleta, pivotes, hitboxes) que **no existe como dato** → fuera de alcance (ver §7).

## 3. Contrato de asset v1 (medido, no supuesto)

Frames de **48×72 px** (tamaño lógico nativo — pixel-art auténtico). Dimensiones reales de `v1/valentina/base/`:

| Hoja | PNG | Rejilla | Frames/dir | Uso en este alcance |
|---|---|---|---|---|
| `idle` | 192×288 | 4×4 | 4 | **núcleo** |
| `walk` | 288×288 | 6×4 | 6 (contactos en 0 y 3) | **núcleo** |
| `talk` | 192×288 | 4×4 | 4 | fuera (alcance completo) |
| `interact` | 192×288 | 4×4 | 4 | fuera |
| `turn` | 144×288 | 3×4 | 3 | fuera |
| `react` | 192×1152 | 4×16 | 4 | fuera |
| `portrait` | 384×768 | 4×8 (96×96) | — | solo frame neutral en lobby/resultados (opcional) |

**Orden de filas** (biblia visual v1): `down / left / right / up`. Izquierda y derecha están **dibujadas de forma independiente** — prohibido espejar.

**Identidades v1 disponibles (8):** valentina (default del roster), andres, camila, daniela, david, felipe, jorge, luisa. Las otras 4 de `PLAYABLE_CAST` (mariana, mateo, paula, samuel) **no tienen v1**.

## 4. Arquitectura de la solución

Extender la vía **`baked-cast` ya probada** (la que usan los NPCs) con una variante "v1", sin despertar el resolver pesado.

### 4.1 Resolución de plan de render del jugador (cadena de fallback)

Prioridad al elegir cómo dibujar al jugador, por `castId`:

```
v1  (si existe /assets/characters/v1/<castId>/base/)   →  kind: 'v1'
cast (si existe /assets/characters/cast/<castId>.png)  →  kind: 'cast'
modular (siempre disponible)                            →  kind: 'modular'
```

Se materializa como una utilidad pura análoga a `resolveCastId` (p. ej. `resolvePlayerVisualPlan(config)`), testeable en aislamiento, que devuelve `{ kind, textureKeys, assetPaths, animKeys }`. **Degradación elegante**: identidad sin v1 → cast; sin cast → modular. Idéntico principio que el resto del arte del mapa.

### 4.2 Renderer Phaser: soporte de 4 direcciones sin espejo

El motor hoy asume **3 filas + flipX** (`AVATAR_WALK_FRAMES` con `down/side/up`, `modularAvatarFlipX`). Para v1 se añade una vía paralela en `phaser-avatar-renderer.ts`:

- **Geometría v1:** frame 48×72; `idle` 4×4 y `walk` 6×4; índice = fila·cols + columna.
- **Direcciones:** 4 reales (`down/left/right/up`), **flipX = false siempre** para v1.
- **Animaciones:**
  - `idle`: 4 frames por fila, loop, ~4 fps.
  - `walk`: 6 frames por fila, loop, **10 fps** (spec de la biblia), contactos autorales en 0 y 3.
- Se registra como spritesheet propio (clave `v1-<id>-walk` / `-idle`), sin colisionar con las claves `avatar-*` (modular) ni `cast-*` ni `npc-*` existentes.

La selección de dirección del jugador ya distingue izquierda/derecha en el input; hoy las colapsa a `side`+flip. Para `kind: 'v1'` se enrutan a las filas `left`/`right` reales.

### 4.3 Escala de render y regla de oro

v1 es 48×72 nativo; legacy es 128×192 renderizado a ~0.425. La **escala de render de v1 se calibra contra una captura del juego real** para igualar la altura del personaje en pantalla (~54 px de silueta), **nunca contra el footprint de colisión ni contra el asset viejo** (regla de oro del proyecto, lección del fix #8). Constante dedicada (p. ej. `V1_AVATAR_SCALE`) documentada con su referencia.

### 4.4 Default y selección

- `defaultAvatar()` pasa a incluir `castId: 'valentina'` (o el `defaultCharacterId` del roster) → **nunca se cae al modular crudo por omisión**.
- El selector de personaje (`character-editor.component`) ofrece las 8 identidades v1 primero; las 4 sin v1 siguen disponibles y caen a su cast horneada. Sin regresión del flujo de selección existente.

## 5. Flujo de datos

```
AvatarConfig.castId
   → resolvePlayerVisualPlan(config)      // utilidad pura, §4.1
   → { kind: 'v1'|'cast'|'modular', ... }
   → game-world preload(): carga hojas según kind
   → game-world create(): registra animaciones (v1: 4-dir; cast/modular: 3-dir+flip)
   → runtime: input de dirección → clave de animación correcta
```

Lobby y pantalla de resultados: si `kind==='v1'`, usar frame idle-down (o retrato neutral) de la identidad; si no, la cadena actual.

## 6. Riesgo aceptado (E) y su verificación

**Riesgo:** migrar **solo** al jugador a v1 (píxeles gruesos auténticos a escala entera) mientras los NPCs siguen en legacy (128×192 @0.425, píxeles finos) puede hacer que el jugador se vea de **otra densidad de píxel** que los NPCs de la misma sala — cambiando una incoherencia (caras) por otra (jugador vs NPC).

**Decisión:** aceptado como riesgo conocido. **Verificación obligatoria:** smoke en vivo con **captura del juego real** del jugador caminando en las 4 direcciones dentro de una sala del caso, evaluando (a) fin del "flotar", (b) coherencia de cara entre direcciones, (c) magnitud del choque de densidad jugador-vs-NPC. Si el choque es visible e inaceptable, el fast-follow inmediato es migrar los NPCs del caso a v1 (alcance completo).

## 7. Fuera de alcance (frontera explícita)

- El resolver `resolveAvatarRenderPlan` / `CharacterManifestV1` permanece dormido; **no** se construye el manifest ni los content-hashes.
- Hojas `talk`, `interact`, `turn`, `react` y retrato de 8 estados → alcance "completo" futuro.
- Migración de NPCs del caso a v1 → fast-follow condicionado por §6 (los NPC presets no tienen hojas v1 hoy).
- No se toca el esquema de BD ni el contrato API (RNF-010). Cambio 100% de frontend/assets.

## 8. Verificación (gates)

1. **Jest rojo→verde** de las utilidades nuevas: resolución de plan de render del jugador (cadena v1→cast→modular), geometría de frames v1 (48×72, rejillas idle 4×4 / walk 6×4), enrutado de 4 direcciones sin flip. TDD por unidad.
2. **No regresión** de la suite existente (baked-cast, avatar-config, portrait-resolver, lobby-avatar): verde.
3. **`ng build`** limpio, sin ampliar presupuestos.
4. **Smoke en vivo con captura real** (§6): jugador v1 caminando 4 direcciones en sala del caso.

## 9. Invariantes respetadas

- Pixel art auténtico (v1 a escala entera, nearest-neighbor).
- Arte de escenario/personaje escalado contra la **altura del personaje en pantalla**, verificado con captura real.
- No romper el flujo del estudiante ni los tests verdes (extender, no reescribir).
- Degradación elegante: sin assets → fallback, nunca pantalla rota.
