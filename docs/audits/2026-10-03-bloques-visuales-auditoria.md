# Auditoría pieza por pieza de los bloques visuales del PLAN MAESTRO TOTAL

**Fecha:** 2026-10-03 · **Medido contra:** rama `feat/cierre-plan-maestro` · **Plan de origen:** `docs/PLAN_MAESTRO_TOTAL.md`, sección «PARA CHATGPT — ASSETS VISUALES» (líneas 1781-2382; bloques visuales A-J) · **Se confirma o corrige:** la tabla «Bloques visuales» de [`2026-10-02-brechas-plan-maestro-total.md`](2026-10-02-brechas-plan-maestro-total.md).

Abreviaturas: `assets/` = `frontend/src/assets/`; `sim/` = `frontend/src/app/features/simulator/`. «(inferencia)» = deducción por lectura, no comprobada en el juego. «No encontrado» = se buscó (Glob/Grep) y no está. Estados: Hecho / Hecho por otra vía / Parcial / No existe / Ya no aplica. Veredictos por pieza: cumple / cumple por otra vía / falta / sobra-obsoleta.

---

## 1. Alcance y método

- **Por listado:** todo `assets/` (13,0 MB: `characters` 6,4 · `game` 5,3 · `fonts` 0,6 · `images` 0,6), `tools/`, `docs/visual/` y `docs/superpowers/specs/` de arte. Dimensiones reales de PNG leídas con `System.Drawing` en retratos, elenco, v1, modular, puertas, muebles, objetos y Kenney; número de colores y alfa binario medidos en 9 muestras (retratos, mostrador, silla, planta, puerta, 2 objetos).
- **Abriendo la imagen (8):** retrato `paciente-vbg_sad`, hoja `npc_madre-vbg`, `portrait.png` v1 de valentina, `counter`, `tool_pap`, tilemap Kenney `tiny-dungeon`, `Login.jpeg`, `landing1.png`.
- **Por código:** quién consume cada asset (`*-sprite.util.ts`, `baked-cast.util.ts`, `v1-avatar.util.ts`, `portrait-resolver.util.ts`, `game-feel.util.ts`, HUD, `game-world.component.ts`, renderers de salas, `angular.json`).
- **No se pudo comprobar sin el juego en marcha:** cómo se ven la viñeta, el destello y la sacudida (calibración pendiente del bloque B); la escala real del jugador v1 frente a los NPC horneados; si un asset huérfano se pide por red; el estilo de los retratos dentro del panel de diálogo. No se ejecutó nada (ni build, ni Jest, ni servidores, ni git que escriba).
- **Criterio de «cumple»:** el requisito funcional que motivaba la pieza está cubierto aunque archivo, tamaño o ruta no coincidan con el plan. Hechos de la sesión (bloque B por código, 10 retratos, Kenney de exterior, ~46 px/m, pixel art auténtico) se usan sin reverificar.
- **Hallazgo transversal:** ninguna de las rutas de destino del plan existe (`assets/ui/`, `tilesets/`, `portraits/`, `sprites/`, `overlays/`, `effects/`, `maps/`, `backgrounds/`) y ninguno de sus nombres de archivo está en el repo (Glob de `tileset_*`, `portrait_*`, `overlay_*`, `effect_*`, `bg_*`, `heart_*`, `icon_audio*`, `consultorio_principal*`: sin resultados). El arte real nació en `assets/game/` y `assets/characters/` con otros formatos.

## 2. Resumen

| Bloque | Hoja de ruta | Estado propuesto | Evidencia | Qué falta |
|---|---|---|---|---|
| **A** Iconos de audio | Sin auditar | **Hecho por otra vía** | 0 de 4 PNG; el HUD usa Material Symbols (`music_note`/`music_off`, `graphic_eq`/`volume_off`), `sim/simulation-hud.component.ts:128,133` | Nada funcional. Decidir si la biblia premium (prohíbe Material Icons) sigue vigente (P1) |
| **B** Tilesets | Parcial | **Parcial** (confirmado) | 0 de 4 tilesets 32 px; 4 salas del caso pintadas por renderer con 10 muebles, 10 puertas y 10 objetos pixel-art | Muebles de vivienda y props pequeños; suelos y paredes siguen siendo vector |
| **C** Retratos | Hecho por otra vía | **Hecho por otra vía, con huecos** | 10 PNG 96×96 de 5 personajes (10 de 25 celdas del mapa de arte de C) | `closed` (×2, lo piden C y F), `sad` de la madre, 4 presets de NPC sin retrato |
| **D** Avatar | Hecho por otra vía | **Hecho por otra vía** (confirmado) | v1: 8 identidades 48×72 con idle y walk de 4 direcciones; cast: 12 jugables; modular como respaldo | 4 jugables sin v1; bata y accesorios «Próximamente» |
| **E** NPC ambientales | Hecho por otra vía | **Hecho por otra vía** (confirmado) | 9 hojas `cast/npc_*.png` 384×576, todas usadas | `npc_vecino` (solo si hay hogar); 0 de 11 actores premium |
| **F** Overlays | Parcial | **Hecho por otra vía** (corregido) | Viñeta de tono, viñeta de crisis, pools de luz, haz de ventana y motas por código; 0 de 9 PNG | Calibrar a ojo; 3 de 9 piezas ya no aplican |
| **G** UI kit | Parcial | **Parcial** (confirmado) | Corazones SVG y barras CSS; 5 `tool_*.png` 64×64; glifo y favicon SVG | Cursores, flecha guía, íconos de genograma/ecomapa; los 18 PNG de HUD premium |
| **H** Efectos de decisión | Sin auditar | **Hecho por otra vía** (2 de 5 piezas: Ya no aplica) | Viñeta que pulsa >85, fundido+destello al cambiar de sala, sacudida en riesgosas | Ver en navegador real; bueno/neutral no deben existir (regla §6.7) |
| **I** Mapas Tiled | Parcial | **Hecho por otra vía** (los 3 mapas del plan: Ya no aplica) | 14 JSON Tiled de 16 px con Kenney (flujos anteriores); el caso actual va por renderer + BD | No faltan mapas Tiled: faltan renderer y semilla del caso nuevo (bloque J de código) |
| **J** Fondos | Sin auditar | **Hecho por otra vía** (2 de 4 piezas: Ya no aplica) | 0 de 4 PNG; carga, resultados y editor se resuelven con CSS y pantalla de arranque SVG | Nada para la beta |

**Cambios respecto a la hoja de ruta:** A, H y J pasan de «Sin auditar» a «Hecho por otra vía»; F pasa de «Parcial» a «Hecho por otra vía» (no hay nada que producir, solo calibrar); I pasa de «Parcial» a «Hecho por otra vía» (su faltante real es de renderer, no de mapas); C se mantiene pero con huecos concretos; B, D, E y G se confirman. **Ningún bloque visual está «Hecho» tal como lo pedía el plan**: todo se cumplió con otro formato.

---

## 3. Detalle por bloque

### A. Iconos de audio (plan 1821-1830)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `icon_audio_on.png` 16×16 | No encontrado | HUD `mat-icon` `graphic_eq` (`simulation-hud.component.ts:133`) | cumple por otra vía |
| `icon_audio_off.png` 16×16 | No encontrado | `volume_off` (mismo archivo) | cumple por otra vía |
| `icon_music.png` 16×16 | No encontrado | `music_note`/`music_off` en el HUD (`:128`) y en la tarjeta de intro (`sim/simulation-play.component.ts:172-191`) | cumple por otra vía |
| `icon_sfx.png` 16×16 | No encontrado | `graphic_eq` | cumple por otra vía |

- La fuente Material Symbols está autoalojada: `assets/fonts/material-symbols-rounded.woff2` (536 KB).
- **Contradicción abierta:** la biblia `docs/visual/premium-visual-bible-v1.md` §3 prohíbe Material Icons en el HUD y pide sprites propios; su inventario `assets/visual/v1/inventory.v1.json` declara `icon-audio` en `game/ui/premium-v1/icon-audio.png`, que no existe. Hoy manda el HUD con Material Symbols.
- Fuera de lo visual: el bloque A de código pedía `assets/audio/{music,sfx}/siep_*.ogg`; esas carpetas solo tienen `.gitkeep`. El audio real está en `assets/game/audio/` (2 MP3 de ~2,4 MB y 4 OGG) y `assets/game/kenney/ui-audio/`; `audio-director.service.ts:56-61` lo dice (no hay stems propios).

### B. Tilesets de escenarios (plan 1834-1921)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `tileset_consultorio.png` 256×256, tile 32 px | No encontrado. Los 3 tilesets Kenney (`assets/game/kenney/*/…/tilemap_packed.png`: 192×176 ×2 y 432×288) son de 16 px y de mazmorra/exterior (abierto: `tiny-dungeon`) | Solo los 14 mapas Tiled antiguos y los respaldos de marcadores y jugador (`game-world.component.ts:259-271`) | sobra-obsoleta (decisión de 2026-07-10: sprites por pieza, no tilesets) |
| Suelos, paredes, ventana, cuadro (filas 0-1) | Pintados por código: `sim/case-pdf-rooms.renderer.ts` (`paintWindowCool/Warm`, `:456,466`) y `sim/premium-clinical-room.renderer.ts` | Sí | cumple por otra vía (vector, no pixel art) |
| Escritorio 64×32 | `assets/game/furniture/desk.png` 224×106 | `sim/furniture-sprite.util.ts` | cumple |
| Silla del psicólogo / del paciente | `furniture/chair.png` 27×46 (un solo tipo) | Sí | cumple por otra vía |
| Diván / camilla | `furniture/sofa.png` 146×74 · `gurney.png` 122×46 | Sí | cumple |
| Librería · planta · mesa de centro | `shelf.png` 142×150 · `plant.png` 49×64 · `coffee_table.png` 96×60 | Sí | cumple (la mesa de centro no la pedía el plan) |
| Lámpara de mesa con halo · carpeta | Lámpara y halo por Graphics (`case-pdf-rooms.renderer.ts:375`, `paintLighting :283`) · `game/objects/object_expediente.png` 64×64 | Sí (`sim/object-sprite.util.ts`) | cumple por otra vía |
| Caja de pañuelos, teléfono, taza, marco de foto, maceta pequeña, papelera | No encontrado | — | falta (solo si se quiere detalle de consultorio) |
| `tileset_hospital.png`: cama, camilla, monitor, puertas | `gurney.png` · `objects/tool_risk_meter.png` (monitor con aguja) · `doors/door_urgencias(_side).png` 48×64 | Sí | cumple por otra vía |
| Hospital: silla de ruedas, mesa de noche, gotero, mesita, papelera | No encontrado | — | falta (no lo exige el guion actual, inferencia) |
| `tileset_comisaria.png`: escritorio, silla de espera, archivador, formularios, cartel | `desk.png` · `waiting_chairs.png` 156×62 · `file_cabinet.png` 130×97 · `objects/object_registro.png` · `object_marco_normativo.png` · `doors/door_recepcion*.png` | Sí | cumple por otra vía |
| Comisaría: sello, teléfono institucional | No encontrado | — | falta (menor) |
| `tileset_vivienda.png`: sofá, mesa y silla de comedor, TV, foto familiar, estante, cocina | `sofa.png`, `chair.png`, `shelf.png` sí; mesa de comedor, TV, cocina, foto: no encontrado | — | falta (necesario solo si el caso 2 es de hogar) |

- 4 salas del caso: `hospital-urgencias`, `hospital-sala-escucha`, `comisaria-recepcion`, `comisaria-consultorio` (con copias por etapa); mobiliario con `contactShadow` y `actorDepth`, ancla a los pies.
- Todo pasa por el pipeline de `tools/furniture-assets/` y `tools/door-assets/`: paleta cuantizada de 18-24 colores y alfa binario (medido en `counter`, `chair`, `plant`, `door_urgencias`).

### C. Retratos de NPC (plan 1925-1981)

| Pieza del plan (320×80, 5 columnas de 64×80) | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `portrait_paciente_adulto_f.png` | `assets/characters/portraits/paciente-vbg_{neutral,worried,sad}.png`, 96×96 | `sim/portrait-resolver.util.ts` (Consultante, Sobreviviente) | cumple por otra vía |
| `portrait_familiar_m.png` | `portraits/madre-vbg_{neutral,worried,happy}.png` (la Abuela; el plan decía masculino) | Sí | cumple por otra vía |
| `portrait_funcionario_m.png` | `portraits/funcionaria-recepcion_neutral.png` · `comisaria-profesional_neutral.png` | Sí (neutral forzado) | cumple por otra vía |
| `portrait_guia_f.png` (bata blanca, calmada) | `portraits/psicologa-hospitalaria_{neutral,happy}.png` | Sí | cumple por otra vía |
| `portrait_paciente_adulto_m.png`, `portrait_paciente_joven_f.png` | No encontrado; `adolescente-nna` y los demás presets no tienen retrato | — | sobra-obsoleta (personajes ajenos al caso: propuesta C, tabla de descartes, línea 202) |
| Columna 1 «positivo» · 2 «tristeza» · 3 «ansioso» | `happy` ×2 personajes · `sad` ×1 · `worried` ×2 | Sí | cumple por otra vía |
| Columna 4 «crisis/colapso» | No existe | — | sobra-obsoleta (caricatura; C propone `anxious` con intensidad alta) |
| Estado `closed` (no pedido por el plan; lo piden C y F) | No existe | Hoy cae a `neutral` | **falta** |

- Contrato real: PNG individual 96×96 RGBA en `assets/characters/portraits/<slug>_<variante>.png`, variantes `neutral|worried|sad|happy` (10 archivos). Medido: 16-20 colores, alfa binario. Abierto `paciente-vbg_sad`: se lee como ilustración reducida y cuantizada, no como pixel art dibujado a mano (inferencia: la dirección de arte pide pixel auténtico; ver P5).
- Pipeline: spec `2026-07-09-retratos-emocionales-design.md` (`flux_kontext` desde el neutral → `remove_background` → pixelado 96×96). **El script de pixelado no está en el repo** (Glob `**/pixelate_object*` y `tools/`: no encontrado).
- Además existen `assets/characters/v1/<id>/base/portrait.png` (384×768 = 4×8 de 96×96, 8 estados, abierto el de valentina) para los 8 jugables: sin consumidor de runtime; son retratos del estudiante, no de NPC.

### D. Sprites del avatar (plan 1985-2097)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `avatar_body.png`, hoja 288×512 (frame 48×64) | `assets/characters/modular/body/body_*.png` ×12, 384×576 (3×3 de 128×192) | `features/character/avatar-figure.component.ts`, `sim/phaser-avatar-renderer.ts` | cumple por otra vía (respaldo) |
| `avatar_skin_*` ×4 | No separadas: la piel va integrada en cuerpos y hojas | — | sobra-obsoleta |
| `avatar_uniform_*` ×3 | Color de ropa en el nombre del cuerpo (5 colores × 2 géneros) | Sí | cumple por otra vía |
| `avatar_labcoat.png` | No encontrado; el editor la deshabilita «Próximamente» (`character-editor.component.ts:141`) | — | falta (deseable) |
| `avatar_hair_<0-9>_<0-7>` (80; prioridad 18) | `modular/hair/hair_{short,medium,long,tied}_{5 colores}_{back,front}.png` ×40 + `hair_red_{back,front}` ×2 | Sí | cumple por otra vía (4 formas × 5 colores) |
| `avatar_face_<ojo>_<ceja>_<boca>` (24 prioritarias) | `modular/face/face_<12 expresiones>.png`; 60 recortes en `face/expressions/` | Sí | cumple por otra vía |
| `avatar_acc_glasses/stethoscope/badge` | No encontrado; `ACCESSORIES` (`gafas`, `pin`) en `avatar.model.ts:140` no tiene capa | — | falta (deseable) |
| Idle 4 + walk 6 frames × 4 direcciones | `assets/characters/v1/<id>/base/idle.png` 192×288 (4×4 de 48×72) y `walk.png` 288×288 (6×4), 8 identidades | `sim/v1-avatar.util.ts`, `game-world.component.ts:280-286` | cumple y supera el plan |
| (no pedido) elenco horneado | `assets/characters/cast/<id>.png` ×12 jugables, 384×576 | `sim/baked-cast.util.ts` | cumple por otra vía |

- El editor combina «piezas» en el modo clásico (modular); los 12 personajes del elenco son la vía principal. `defaultAvatar()` ya trae `castId`.
- **Incoherencias:** `roster.v1.json` declara 10 identidades pero solo 8 tienen carpeta `v1/` (faltan `mariana` y `mateo`); `PLAYABLE_CAST` tiene 12; `V1_ROSTER` 8.
- **Escala (inferencia con números documentados, no medida en el juego):** silueta cast 168 px × 0,425 ≈ 71 px (`tools/cast-assets/README.md`); NPC adultos a 0,39-0,42 ≈ 65-71 px; v1 a `V1_AVATAR_SCALE = 1` ≈ 60-66 px (biblia §1). La altura es coherente; la densidad de píxel no (riesgo E ya aceptado en el spec 2026-07-20 §6). El comentario del código dice «se ajusta en el smoke» y la constante sigue en 1.

### E. NPC ambientales (plan 2101-2135)

| Pieza del plan (128×48, 16 frames) | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `npc_enfermero.png` | `cast/npc_colega-clinica.png` 384×576; `npc_seguridad.png`, `npc_supervisor-clinico.png` (inferencia: el rol de enfermería lo cubre la colega clínica) | `NPC_CAST` + `avatarPresetKey` de `assets/game/scenarios/*.json` | cumple por otra vía |
| `npc_paciente_espera.png` | `cast/npc_paciente-vbg.png` | Sí | cumple por otra vía |
| `npc_familiar_visita.png` | `cast/npc_madre-vbg.png` · `npc_adolescente-nna.png` | Sí | cumple por otra vía |
| `npc_funcionario_comisaria.png` | `cast/npc_funcionaria-recepcion.png` · `npc_comisaria-profesional.png` · `npc_psicologa-hospitalaria.png` | Sí | cumple por otra vía |
| `npc_vecino.png` | No encontrado | — | falta (solo si hay caso de hogar) |
| Sombra elíptica 20×6 en la hoja | Sombra por código: dos elipses (`game-world.component.ts:1432-1433`) | Sí | cumple por otra vía |

- Contrato real: 384×576, 3 columnas de caminata × 3 filas (frente, lado-derecha, espalda; izquierda = `flipX`), frame 128×192. Los 9 NPC horneados están en uso. Abierta `npc_madre-vbg`: pixel art limpio con contorno, coherente con el elenco jugable.
- Premium sin producir: `actor-roster.v1.json` declara 11 visuales NPC bajo `characters/v1/actors/*`; ninguno existe (0 de 11).

### F. Overlays de iluminación (plan 2139-2178)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `overlay_day_neutral` 640×480 | No encontrado. Viñeta de tono por Graphics, tonos `warm|clinical|tense|calm` (`game-world.component.ts:1750`) | Sí | cumple por otra vía |
| `overlay_hospital_fluorescente` | Tono `clinical` + pools de `paintLighting` | Sí | cumple por otra vía |
| `overlay_crisis` | Viñeta de crisis atada al estrés (`applyCrisisVignette`, `sim/game-feel.util.ts`) | Sí | cumple por otra vía |
| `overlay_evening`, `overlay_night` | No existen | — | sobra-obsoleta (casos de interior, sin hora del día; inferencia) |
| `light_cone_warm`/`cool` 128×200 | Pools elípticos y haz de ventana (`case-pdf-rooms.renderer.ts:283`, `premium-clinical-room.renderer.ts:603-630`) | Sí | cumple por otra vía |
| `particle_dust` 4×4 | Motas con círculos y tweens (`premium-clinical-room.renderer.ts:632-646`), solo sin movimiento reducido | Solo ese renderer | cumple por otra vía |
| `particle_leaf` 8×8 | No existe | — | sobra-obsoleta (sin exteriores) |

- Calibración visual pendiente (color, opacidad, tope del destello 0,45, intensidad de la sacudida): el Browser pane no mostró la rama. No se puede cerrar sin verlo.

### G. UI kit (plan 2182-2220)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `heart_full/half/empty.png` 16×16 | No encontrado. Corazones SVG inline (5, de «calma restante») en `simulation-hud.component.ts:64-76` + `sim/stress-hearts.util.ts` | Sí | cumple por otra vía (vector) |
| `progress_fill.png` 4×8 | No encontrado; barras CSS `.mini-track` (el plan lo marca opcional) | Sí | cumple por otra vía |
| `icon_tool_interview/observation/assessment/notes` 16×16 | No encontrado. Las herramientas del caso son otras 5: `assets/game/objects/tool_{pap,spikes,reflection_journal,safety_route,risk_meter}.png` 64×64 | `sim/object-sprite.util.ts`, `game-world.component.ts:2026` | cumple por otra vía en el mundo; el HUD usa nombres de Material (`seed_caso_pdf.py`: `healing`, `monitor_heart`…) |
| `icon_tool_genogram/ecomap` 16×16 | No encontrado | — | falta (depende de E; su propuesta pide texto + ícono + patrón de línea, no necesariamente pixel) |
| `cursor_default/interact` 16×16 | No encontrado (Grep `cursor:\s*url`) | — | falta, opcional |
| `siep_logo.svg`, `siep_logo_small.png` | `assets/favicon-siep.svg` (404 B); glifo SVG inline en el HUD (`:25-33`); logos institucionales en `assets/images/institution/` | `index.html:11,80` | cumple por otra vía |
| `guide_arrow.png` 32×32, 4 frames | No encontrado; los objetos interactivos usan pulso y «door hint» de texto | Sí | cumple por otra vía (parcial) |

- Premium sin producir: el inventario declara 6 marcos de HUD, 8 íconos de HUD, 4 señales y 4 prompts en `game/ui/premium-v1/` (22 PNG); ninguno existe.

### H. Efectos visuales de decisión (plan 2224-2251)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `effect_good_decision` 288×48 | No encontrado | — | sobra-obsoleta: la base común §6.7 prohíbe puntos flotantes, efectos de combate y victoria sobre el duelo |
| `effect_neutral_decision` 32×32 | No encontrado | — | sobra-obsoleta (mismo motivo) |
| `effect_bad_decision` 288×48 | No existe el sprite; sacudida de cámara 200-260 ms en riesgosas, inadecuadas y prohibidas (`decisionShake`) | `game-world.component.ts:568-582` | cumple por otra vía (sin fragmentos) |
| `effect_crisis_pulse` 64×64 ×8 | Viñeta de crisis que pulsa 0,55↔0,85 a 800 ms con estrés >85 (`crisisVignetteState`) | `game-world.component.ts:1783-1820` | cumple por otra vía |
| `effect_door_transition` 320×240 ×4 | Fundido 180 ms + destello suave 120 ms al entrar a otra sala (`roomEntryFlash`) | `:607-612`, `:1822` | cumple por otra vía |

- Todo respeta `reduceMotion`. No existe carpeta `assets/effects/`.

### I. Mapas Tiled (plan 2255-2324)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `consultorio_principal.json` 20×15, 9 capas | No encontrado | — | sobra-obsoleta |
| `hospital_sala_espera.json` 24×18 | No encontrado | — | sobra-obsoleta |
| `comisaria_entrevista.json` 16×12 | No encontrado | — | sobra-obsoleta |
| (equivalente real) | 14 JSON en `assets/game/maps/`: 60×33 o 40×25 tiles de 16 px (960×528 / 640×400), capas `Floor`, `Walls`, `Objects`, tileset Kenney; los genera `generate-rooms.mjs` | Cargados en `game-world.component.ts:339-361` | cumple por otra vía, pero de flujos anteriores |
| (equivalente real) salas de `SIM-VBG-001` | Sin JSON: `scene_maps` y `map_objects` en BD + `case-pdf-rooms.renderer.ts` | Sí | cumple por otra vía |

- El plan pedía 32 px, 9 capas y objetos `triggers`; el proyecto adoptó 16 px, 3 capas y objetos en BD. Seis de las 14 claves aparecen en `deploy/db_seed.sql` (versión 1.0.0, archivada según la propuesta J §2); las salas del caso publicado no usan Tiled (inferencia).

### J. Fondos (plan 2328-2352)

| Pieza del plan | ¿Existe? Ruta y tamaño real | ¿Lo usa el código? | Veredicto |
|---|---|---|---|
| `bg_loading.png` 1280×720 | No encontrado | Carga: `mat-progress-bar` y pantalla de arranque con `favicon-siep.svg` (`index.html:80`) | cumple por otra vía |
| `bg_outcome_success.png`, `bg_outcome_failure.png` | No encontrado | Resultados: `linear-gradient` en `attempt-outcome.component.ts:158` | sobra-obsoleta («éxito/fracaso» choca con el límite §6.7; inferencia sobre el texto de la pantalla) |
| `bg_character_editor.png` | No encontrado | Halo CSS `.ce-halo` (`character-editor.component.ts:210`) | cumple por otra vía |
| (no pedido) | `assets/images/login/Login.jpeg` 1600×900 (consultorio ilustrado, violeta; abierto) · `images/institution/landing1.png` 581×415 | `login-assets.config.ts:8`, `landing.component.ts:49` | no son pixel art duro; `Login.jpeg` sirve de referencia visual del consultorio |

- No confundir con el bloque J de código (escenario adicional): su propuesta es [`2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md`](../superpowers/specs/2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md).

---

## 4. Assets huérfanos o dudosos (no se borró nada)

1. **`assets/characters/modular-legacy/`** (129 archivos, 1,9 MB): solo lo lee `tools/character-assets/remaster_2x.py`. Es intocable por regla (`docs/superpowers/plans/2026-09-29-ui-semana-08-poda.md:24`), pero `angular.json` copia **todo** `src/assets` al build.
2. **`v1/<id>/base/{talk,interact,turn,react,portrait}.png`** (40 archivos, ~1,2 MB): sin consumidor de runtime; solo specs (`avatar-render-plan.util.spec.ts`) y scripts (`frontend/scripts/`). Reservados para el «alcance completo» (spec 2026-07-20 §7).
3. **`modular/face/expresiones.png`** (1448×1086, 1,0 MB) y **`face/expressions/`** (60 recortes): fuente del remaster; idénticos byte a byte en `modular-legacy/` (63 archivos iguales entre ambas carpetas: duplicados).
4. **`modular/manifest.json` y `README.md` desactualizados:** dicen hojas 192×288 y frame 64×96 (reales: 384×576 y 128×192) y citan `face_calm.png`, que no existe en ninguna carpeta (Glob `**/face_calm*`: sin resultados).
5. **`assets/visual/v1/inventory.v1.json`** (`status: unreviewed`): de 74 entradas, 41 apuntan a archivos inexistentes (8 mapas `game/maps/premium-v1/`, 11 actores `characters/v1/actors/`, 22 piezas `game/ui/premium-v1/`). Solo lo leen `frontend/scripts/validate-premium-visual-assets.mjs` y su test (`npm run test:character-assets`); se despliega con la app.
6. **`assets/game/kenney/ui-audio/`** (51 archivos, 308 KB): `audio-director.service.ts:78-89` usa 7 (`click1`, `click2`, `click5`, `mouserelease1`, `rollover1`, `switch3`, `switch13`).
7. **Carpetas vacías heredadas:** `assets/audio/music/`, `assets/audio/sfx/`, `assets/game/kenney/` (solo `.gitkeep`).
8. **`assets/images/institution/ascofapsi-logo.png`** (150×82): sin referencias (Grep `ascofapsi` en `frontend/src`).
9. **`assets/game/maps/generate-rooms.mjs`** (script con mojibake en el encabezado) se despliega con la app; los 14 JSON son de flujos anteriores (ver bloque I).
10. **Opciones sin arte:** `ACCESSORIES` (`gafas`, `pin`) y `con-bata` (deshabilitada en el editor). `angular.json` lista `src/favicon.ico`, que no existe (el favicon real es `favicon-siep.svg`).
11. **Peso:** los dos MP3 de `assets/game/audio/` suman 4,7 MB, el 36 % de `assets/`.

## 5. Arte pendiente priorizado

Pipelines vigentes en `tools/`: **retratos** (flux_kontext → remove_background → pixelado 96×96; script ausente), **muebles** (`furniture-assets`: z_image → `local_bgremove` → `drop_ground_shadow` → `pixelate_furniture`), **puertas** (`door-assets`: `sidify_door` + `pixelate_door`, 48×64), **elenco** (`cast-assets/harvest_cast_sheet.py`, 384×576), **objetos/herramientas** (spec 2026-07-09; script ausente).

### Necesario para la beta

| # | Pieza | Lo necesita | Pipeline | Esfuerzo orientativo |
|---|---|---|---|---|
| 1 | `madre-vbg_closed.png` y `paciente-vbg_closed.png` (96×96, cabeza baja, sin patologizar el silencio) | Bloque C (hueco 1, estado `closed`, fase 4) y bloque F (dependencia: cierre de la conversación). **Condicional** a que C y F se aprueben | Retratos. Recuperar o reescribir el script de pixelado (base: `tools/door-assets/pixelate_door.py`) | 1-2 d (C estima 1-3 d el lote F4 completo) |
| 2 | Pase visual de calibración: viñeta, destello, sacudida y escala v1 frente a NPC | Bloque B (cierre) y bloque D (riesgo E) | No es arte nuevo: captura del juego real | 0,5 d |
| 3 | Si el caso 2 entra en la beta: 2 salas (consultorio de primera escucha y espera) con mobiliario nuevo, hojas de NPC, retratos, puertas e íconos | Bloque J de código (E3 y A1-A5 de su propuesta §6) | Muebles, elenco, retratos y puertas, según arriba; reusa `desk`, `chair`, `sofa`, `coffee_table`, `shelf`, `plant`, `waiting_chairs`, `counter`, `file_cabinet` | 5-16 d (J §6); el cuello de botella es el contenido de Psicología, no el arte |

### Deseable

| # | Pieza | Para qué | Pipeline | Esfuerzo orientativo |
|---|---|---|---|---|
| 4 | `madre-vbg_sad.png` | C hueco 2: hoy la Abuela afligida usa `worried` | Retratos | 0,5 d |
| 5 | Retrato neutral de enfermera y médico de guardia | C hueco 3 (hoy silueta) | Retratos, desde sus hojas del elenco | 0,5-1 d |
| 6 | Props pequeños: caja de pañuelos, teléfono, papelera, silla de ruedas, gotero, mesa de noche | Detalle de consultorio y urgencias (bloque B) | Muebles | 1-2 d por 6-8 piezas (inferencia) |
| 7 | v1 para `mariana`, `mateo`, `paula`, `samuel` | Bloque D: nivelar el elenco jugable (hoy caen a `cast`) | Biblia v1 (PR #10 hizo 8 identidades en 8 commits) | 0,5-1 d cada una (inferencia, sin histórico) |
| 8 | v1 para los 9 NPC (+2 del roster premium) | Resolver el riesgo E si el smoke muestra choque de densidad | Biblia v1 | 5-10 d (inferencia); solo si P4 lo exige |
| 9 | Íconos de vínculos (si E se hace en pixel) | Bloque E | Objetos | 1-2 d |
| 10 | 22 PNG de HUD, señales y prompts premium; corazones, íconos y cursores en pixel | Bloques A y G, solo si la biblia sigue vigente (P1) | Objetos | 3-6 d (inferencia) |
| 11 | Mobiliario y salas de hogar | Bloque J, alternativa B | Según J §6 | 11-24 d; después de la beta |

## 6. Preguntas abiertas

**Arte**
1. **(bloquea el punto 10 de la sección 5)** ¿Sigue vigente la biblia visual premium (prohíbe Material Icons y exige 22 sprites de UI) o se difiere? Hoy el HUD la incumple. *Por defecto: diferir, y marcar `inventory.v1.json` como no bloqueante.*
2. ¿Qué fuente de arte queda: Higgsfield (créditos) u otra persona o proveedor? Todos los pipelines asumen Higgsfield.
3. ¿El estilo de los retratos de 96×96 (ilustración reducida y cuantizada) es aceptable como «pixel art auténtico» o se rehacen más duros? *Por defecto: aceptar y mantener coherencia en los nuevos.*
4. ¿Se acepta el riesgo E (jugador v1 de píxel grueso frente a NPC horneados de píxel fino) o se migran los NPC a v1? Depende del pase visual.
5. ¿`madre-vbg_happy` (sonrisa suave en una escena de duelo) pasa la revisión de Psicología? (C, P4).

**Psicología**
6. **(bloquea el punto 3 de la sección 5)** ¿El caso 2 es consultorio, hogar o seguimiento? Define muebles, personajes y salas.
7. ¿Qué estados de retrato son clínicamente aceptables en esta cohorte (`closed`, `sad`, `relieved`) y se aprueba representar el silencio como cabeza baja?
8. ¿Pueden aparecer menores con retrato (hoy `adolescente-nna` no tiene)?
9. ¿La pantalla de resultados mantiene lenguaje de seguimiento formativo (sin «éxito/fracaso»), lo que deja sin objeto los fondos de resultado del plan?

**Ingeniería**
10. ¿Se poda el empaquetado? `angular.json` copia 13,0 MB de `src/assets` (incluye `modular-legacy`, hojas v1 sin uso, Kenney sin uso, `generate-rooms.mjs`, `visual/`). *Por defecto: mover fuentes de pipeline a `tools/` o excluirlas con glob, sin borrar.*
11. ¿Se corrigen `modular/manifest.json` y `README.md` (tamaños 2×, `face_calm` inexistente)?
12. ¿Se recupera o reescribe el script de pixelado de retratos y objetos, que solo vive en los specs?
13. ¿`roster.v1.json` baja a 8 identidades o se producen `mariana` y `mateo`?
14. ¿Se calibra `V1_AVATAR_SCALE` (hoy 1) contra una captura real, regla de oro de escala?
15. ¿Se eliminan las carpetas vacías `assets/audio/{music,sfx}` o se mueve allí el audio de `game/audio/`?
