# Diseño: elenco horneado + animación viva (jugador y NPCs)

**Fecha:** 2026-07-10
**Estado:** Aprobado (brainstorming). Rama: `feat/elenco-horneado-animacion`.

## Objetivo

Subir apariencia y animación de jugador y NPCs a calidad de juego profesional:
reemplazar los maniquíes modulares por un **elenco horneado** estilo chibi
(referencia `docs/skins1-4.png`) y darles **movimiento vivo** (caminata de ciclo
real + idle con respiración), generando el arte con Higgsfield.

## Contexto verificado

- Caminata actual: **3 frames por dirección** en loop lineal `[0,1,2]` a 7 fps
  (`phaser-avatar-renderer.ts`). Se lee como trote entrecortado.
- **No hay animación de idle**: en reposo todos los personajes se congelan.
- Cuerpos modulares: maniquíes rígidos de sombreado plano; por debajo del nivel
  que ya tienen muebles, puertas y retratos.
- Editor combinatorio: ~10 cuerpos × 20 pelos ≈ 200 combinaciones por capas que
  deben coincidir frame a frame.
- Fallos conocidos (no repetir): `autosprite` no sirve con chibi pixel (3
  intentos); `flux_kontext` editando frames sueltos no sostiene identidad
  (IoU 0.23). **Lo que sí funciona: la identidad se sostiene DENTRO de una misma
  generación** (así se hicieron los retratos).

## Decisiones (aprobadas)

1. **Elenco horneado**: 12 personajes jugables + 9 NPCs del caso. El editor pasa
   de "combina piezas" a "elige tu personaje". La cara no afecta gameplay.
2. **Enfoque A de generación**: cada personaje se genera como UNA imagen que ya
   es su hoja de sprites (4 columnas de caminata × 3 filas de dirección);
   jugables con `z_image` (gratis), NPCs con `flux_kontext` usando su retrato
   como referencia de identidad (~1.5 cr c/u). La rejilla imperfecta se corrige
   con herramienta determinista (registro por línea de pies + centroide), nunca
   editando frames con IA.
3. **Juice por código transversal** (beneficia también al sistema modular
   actual): idle con respiración, ciclo ping-pong, rebote al caminar, sombra
   viva; respetando `reduceMotion`.

## Arquitectura

### 1. `character-motion.util.ts` (nuevo, + spec)

Funciones **puras** (testables sin Phaser) que devuelven la deformación en
función del tiempo, y un pequeño aplicador de tweens:

- `breathScale(tMs, periodMs=2400, amp=0.015)` → factor de escala Y del idle.
- `walkBobOffset(tMs, periodMs≈420, amp=1.5)` → offset Y del sprite al caminar.
- Desfase aleatorio por actor (que no respiren sincronizados).
- Con `reduceMotion`: amplitudes 0.

Wiring en `game-world.component.ts`: jugador, NPCs de preset, PERSON markers y
guía. El movimiento del contenedor no se toca — solo el sprite interior.

### 2. Ciclo de caminata ping-pong (aplica YA al sistema modular)

`AVATAR_WALK_FRAMES` pasa de `[0,1,2]` a **`[1,0,2,0]`** (paso-apoyo-paso-apoyo,
ciclo de 4 tiempos con 3 frames, el estándar RPG) y `frameRate` 7→8. El mismo
cambio en el elenco horneado usa sus 4 frames reales `[0,1,2,3]`.

### 3. `baked-cast.util.ts` (nuevo, + spec)

- Manifiesto del elenco: `PLAYABLE_CAST` (12) y `NPC_CAST`
  (`Record<NpcAvatarPresetKey, asset>`), con `id`, `label`, `assetPath`,
  `textureKey` (`cast-<id>`).
- Layout de hoja: **4 col × 3 filas** (fila 0 frente, 1 lado-derecha, 2
  espalda), frames **128×192** (hoja 512×576) — mismas proporciones y escala de
  render (0.425) que el sistema actual, así el resto del mundo no se toca.
- Anims: `cast-<id>-walk-<dir>` con frames `[c, c+1, c+2, c+3]` de su fila,
  idle = columna 0. Lado izquierdo por `flipX` (como hoy).

### 4. Render del jugador y editor

- `AvatarConfig` gana **`castId?: string`** (opcional). `avatar-config.util`
  lo tolera en parse/coerce (retro-compatible: configs viejos siguen válidos).
- En `game-world`: si `castId` presente **y** su textura cargó → sprite del
  elenco; si no → composición modular actual (fallback intacto).
- Editor (`character-editor.component.ts`): sección nueva "Personaje" con la
  grilla del elenco (thumbnail = frame 0). El editor modular queda como modo
  clásico para configs sin `castId`. Sin migración destructiva de perfiles.

### 5. NPCs horneados

En el spawn de NPCs (`ensureNpcComposite` y PERSON markers con preset): si la
textura horneada del preset cargó → úsala; si no → preset modular actual.
`NPC_PRESET_RENDER` conserva escalas; el tint deja de aplicarse a los horneados
(la identidad ya viene en el arte).

### 6. Pipeline de herramientas — `tools/cast-assets/`

- `slice_register.py`: parte la hoja generada en celdas (detección de bandas de
  fondo), registra cada frame por **línea de pies + centroide horizontal**,
  normaliza a 128×192 y ensambla la hoja 512×576 con alfa binarizado y paleta
  cuantizada (mismo lenguaje del pipeline de puertas/muebles).
- `qc_cast_sheet.py`: valida por hoja — 12 frames presentes, la región de
  cabeza/torso consistente entre frames de una fila (IoU alto), las piernas con
  varianza (si no, no hay caminata), alturas uniformes entre filas.
- Hoja que no pasa QC → se regenera (z_image es gratis). Nada de edición
  por-frame con IA.
- `README.md` con el pipeline y los fallos conocidos.

## Generación (Higgsfield)

- **Jugables (12)**: `z_image`, prompt de hoja 4×3 con descripción por personaje
  (diversidad: género, tono de piel, edad, vestimenta profesional/casual, estilo
  chibi de los skins). Gratis; los fallos de QC se regeneran.
- **NPCs (9)**: `flux_kontext` con el retrato del personaje como referencia de
  identidad → hoja 4×3 (~1.5 cr c/u ≈ 13.5 cr; saldo actual 45.1).

## Fases

1. **F1 — Juice por código**: motion util + ping-pong + wiring + tests. Mejora
   inmediata sin arte nuevo.
2. **F2 — Sonda**: 1 jugable end-to-end (generar → registrar → QC → cablear
   detrás de `castId`) y verlo en el juego real antes de producir en masa.
3. **F3 — 12 jugables** + selector de personaje en el editor.
4. **F4 — 9 NPCs** horneados desde sus retratos + remapeo de presets.
5. **F5 — Verificación total**: jest + build + captura del juego real + PR.

## Verificación

- Unit: motion util (funciones puras), baked-cast (manifiesto/anims/fallback),
  coerce de `castId`.
- QC por hoja con `qc_cast_sheet.py` (reporte por personaje).
- `ng build` OK; captura en vivo del juego (idle respirando, caminata 4 tiempos,
  elenco en escena) con el truco de `game.loop.step`.

## No-objetivos

- No se tocan retratos de diálogo (ya resueltos) ni el seed/backend.
- No se elimina el sistema modular: queda como fallback y modo clásico.
- No hay animación de acciones (sentarse, gesticular) — solo caminata + idle.
- No se anima con video ni autosprite (fallos conocidos).
