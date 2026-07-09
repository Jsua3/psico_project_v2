# Diseño: Spike de retratos NPC con Higgsfield + limpieza gated

**Fecha:** 2026-07-08
**Estado:** Aprobado (brainstorming). Siguiente paso: plan de implementación.
**Rama:** `feat/spike-retratos-npc-higgsfield`

## 1. Objetivo y filosofía

Un **spike de aprendizaje**: producir evidencia real de qué da la herramienta Higgsfield con los personajes del simulador SIEP, **antes** de comprometer alcance de arte de producción. No es arte final; es un experimento acotado con criterios de éxito explícitos.

Driver elegido por el usuario: *explorar Higgsfield primero* (aprender antes de comprometer alcance). Todo lo destructivo (borrar assets huérfanos) queda **gated por lo que veamos en el spike** — no se borra nada en esta ronda.

### Contexto verificado del sistema actual (2026-07-08)

- El avatar del jugador es un sistema **modular por capas** (cuerpo → cabello-atrás → rostro → cabello-frente) compuesto en una `CanvasTexture` de Phaser de 9 frames (3 caminata × 3 direcciones). Assets en `frontend/src/assets/characters/modular/`, hojas de 192×288 px (frame 64×96).
- Los mismos PNG sirven al editor DOM (`avatar-figure.component.ts`, vía `background-position`) y al runtime Phaser (`phaser-avatar-renderer.ts`, vía canvas). El avatar personalizado **sí** llega al juego (`game-world.component.ts:276` compone, `:1526` crea el sprite).
- Los NPC usan el mismo universo modular vía `npc-avatar-presets.ts` (9 presets `AvatarConfig`).
- Los **retratos de diálogo** hoy son siluetas SVG grises genéricas (`dialogue-panel.component.ts:26`).
- El motor de diálogo entrega por cada `DialogueState` (`core/models/simulation.model.ts:224`) los campos `portraitKey: string | null` y `emotion: string`. `emotionToExpression()` mapea emociones a `{happy, worried, sad, neutral}`.

### Problemas que motivan el trabajo (del análisis previo)

1. Los sheets de rostro que el código usa (`face/face_{expr}.png`) están casi vacíos (marcas mínimas flotando, sin forma de cara). Es el mayor hueco visual.
2. `face/expressions/` tiene **60 archivos** pixel-art (12 expresiones × 5 poses) de tamaños dispares (81×48, 27×43…) **no referenciados por ningún código** — pipeline huérfano/abandonado.
3. Dos lenguajes visuales sin cohesión (sheets minimalistas vs. expressions cartoon pixel).
4. Retratos NPC = siluetas SVG sin identidad.
5. Cuerpos de NPC (`body_default`, `body_orientadora_purple`) mezclados con cuerpos de jugador en la misma carpeta.

## 2. Track B — el spike (entregable principal)

### Sujeto
La sobreviviente: preset `paciente-vbg` (`npc-avatar-presets.ts:27`): mujer, ropa gris, piel clara, cabello largo castaño, expresión base `sad`.

**Restricción de contenido (vinculante):** es una víctima de VBG. El retrato debe ser **digno y no sensacionalista** — expresión humana y respetuosa, sin morbo, sin heridas visibles, sin dramatización explícita. El prompt lo declara explícitamente.

### Volumen
3 retratos: **una sola identidad × 3 emociones** que el motor de diálogo ya produce: `neutral`, `worried` (preocupada), `sad` (triste). El objetivo es probar lo más difícil de la IA generativa: **mantener la misma cara reconocible entre emociones**.

### Estilo
Retrato **pixel-art**, coherente con el sprite del mapa y compatible con el tema liquid-glass morado de la UI. Se acepta que el pixel-art es el punto débil de los modelos de difusión.

### Pipeline Higgsfield
1. `models_explore(action:'recommend')` con el objetivo (retrato pixel-art de personaje) para elegir el modelo más apto.
2. `generate_image` con un **prompt de identidad fija** (mismos rasgos, ropa gris, cabello largo castaño, piel clara) variando **solo** la emoción entre las 3 generaciones. Objetivo: consistencia de personaje.
3. **Post-proceso a pixel limpio** (los difusores dan rejilla "sucia"): reescalado a resolución baja fija (objetivo 96×96 px) + cuantización de paleta. Herramienta local de imagen (p. ej. Pillow) — decisión de implementación en el plan.
4. `remove_background` para transparencia (PNG con alfa).

### Integración real (cablear uno)
Cablear **un** retrato en `dialogue-panel.component.ts`:
- El panel ya recibe `d.portraitKey` y `d.emotion`.
- Añadir una capa `<img>` que carga `assets/characters/portraits/{portraitKey}_{emotion}.png` **cuando el asset existe**; si no existe (o falla la carga), **cae a la silueta SVG actual** (cero regresión para NPCs sin retrato).
- La lógica de resolución de ruta y el fallback deben ser una función pura testeable (unit test: existe→ruta correcta; ausente→null/fallback).
- **Detalle a resolver en el plan:** confirmar el valor real de `portraitKey` que trae el diálogo sembrado de la sobreviviente en el caso PDF (`seed_caso_pdf`), para nombrar los assets en consecuencia.

### Página de evaluación
Un Artifact/HTML (o página estática) que muestre lado a lado: los 3 retratos generados + post-procesados, la silueta SVG actual, y una carita `face/expressions/` existente — para decidir con las imágenes en la mano.

## 3. Track A — limpieza no destructiva (esta ronda)

Como las caritas huérfanas se evalúan **dentro** del spike, Track A aquí es **sin borrados ni movimientos**:

- **Documentar la especificación** en un `README.md` nuevo dentro de `frontend/src/assets/characters/`:
  - Spritesheet modular: 192×288, 9 frames (3×3), frame 64×96, orden de capas (`avatarRowLayerOrder`), filas = direcciones (frente/lado-derecha/espalda).
  - Retratos: resolución objetivo (96×96), naming `{portraitKey}_{emotion}.png`, PNG con transparencia, carpeta `assets/characters/portraits/`.
- **Inventariar** en ese README lo huérfano y lo mezclado, marcado como *"pendiente de decisión tras el spike"*:
  - `face/expressions/` (60 archivos, sin uso).
  - `body_default.png`, `body_orientadora_purple.png` (usados por NPC/escenarios, no por el editor del jugador).
- **No se borra ni se mueve nada.** Las decisiones destructivas quedan como follow-up explícito alimentado por el veredicto del spike.

## 4. Criterio de éxito del spike

El spike es **exitoso como aprendizaje pase lo que pase** (aprendemos aunque Higgsfield no sirva para esto). Para decidir si se escala, se evalúa el output contra:

1. **Consistencia** — ¿es reconociblemente la misma persona en las 3 emociones?
2. **Coherencia** — ¿convive con el sprite del mapa y el tema morado de la UI?
3. **Dignidad** — ¿es respetuoso para el contexto clínico/VBG?
4. **Esfuerzo** — ¿cuánto post-proceso costó lograr un pixel limpio? (extrapolable a ~9 NPCs × N emociones).

El veredicto (documentado al final) alimenta: (a) si se escala Track B a más NPCs; (b) si se borran las `expressions/` huérfanas; (c) si se aborda el arreglo de las caras del avatar modular.

## 5. Prerrequisitos, riesgos y no-objetivos

**Prerrequisito bloqueante:** cuenta Higgsfield con créditos disponibles (servicio externo de pago). Se verifica al arrancar la ejecución (`show_plans_and_credits`/`balance`). Sin acceso/créditos, el spike se bloquea en ese punto y se escala al usuario.

**Riesgos:**
- El pixel-art es el punto débil de los modelos de difusión; un veredicto válido posible es *"no vale la pena para retratos pixel, sí quizá para otro uso"*.
- La consistencia de personaje entre emociones puede requerir varias iteraciones de prompt / seeds fijas.

**Publicación externa:** generar con Higgsfield envía el prompt a un servicio externo. Los prompts describen **personajes ficticios, sin datos reales de pacientes** (coherente con las reglas del proyecto: no sembrar datos reales en ningún entorno).

**No-objetivos de este spike:**
- No se generan sprites de caminata modulares con IA (mal fit técnico documentado; no se intenta).
- No se arreglan las caras del avatar modular del jugador (follow-up gated).
- No se escala a los 9 NPCs (follow-up gated).
- No se borra ni reorganiza ningún asset existente (follow-up gated).
- No se toca el backend (la integración usa `portraitKey`/`emotion` ya existentes).

## 6. Alcance de archivos (previsto)

- **Crear:** `frontend/src/assets/characters/portraits/paciente-vbg_{neutral,worried,sad}.png` (3 assets generados).
- **Crear:** `frontend/src/assets/characters/README.md` (especificación + inventario).
- **Modificar:** `frontend/src/app/features/simulator/dialogue-panel.component.ts` (capa `<img>` con fallback SVG) + su lógica de resolución de ruta (función pura + unit test).
- **Crear:** página/Artifact de evaluación comparativa (no entra al bundle de producción).
- **Crear:** nota de veredicto del spike (en `docs/` o el propio README), a completar tras la evaluación.

## 7. Testing

- Unit test de la función de resolución de retrato: `(portraitKey, emotion)` con asset presente → ruta esperada; con asset ausente → fallback a SVG.
- Regresión: jest completo (203/203) sigue verde; un NPC sin retrato sigue mostrando la silueta SVG sin error.
- Verificación en vivo: entrar al caso, disparar el diálogo de la sobreviviente, confirmar que el retrato pixel se renderiza en el panel real.
