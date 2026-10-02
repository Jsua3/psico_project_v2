# Brechas del PLAN MAESTRO TOTAL frente a master

**Fecha:** 2026-10-02 · **Medido contra:** `master` @ `0f930b1` (tras mergear los PR #10 a #14)
**Plan de origen:** [`docs/PLAN_MAESTRO_TOTAL.md`](../PLAN_MAESTRO_TOTAL.md), versión 1.0 del 2026-06-07, que vivía solo en la rama `feat/plan-maestro-total`.

El usuario pidió terminar el plan «de la A a la Z» antes de pasar de la alpha a la beta. Este documento dice qué bloques ya existen en `master` (aunque se hayan construido de otra forma), qué falta y qué necesita cada pieza para cerrarse.

## Cómo se midió

Para cada bloque se buscó en `master` la pieza que el plan exige (archivo, clase, endpoint o dependencia) y se comparó con su «Criterio de Done». «Hecho» significa que el criterio se cumple aunque el código no sea el que proponía el plan; desde junio el proyecto avanzó mucho por otras vías (calidad 9-10, personajes v1, interfaz de la semana y del mes).

## La rama `feat/plan-maestro-total` no se mergea tal cual

Tiene 49 commits del 7 al 9 de junio (178 archivos) y lleva cuatro meses separada. Su HUD, su avatar (`AvatarConfig`/`AvatarRenderer`) y su barra superior quedaron superados por trabajo posterior; mezclarla rompería lo que ya funciona. Lo aprovechable se porta pieza por pieza: hoy, solo la idea del bloque B (`effects/vignette-pipeline.ts` y `effects/game-feel.service.ts`).

## Bloques de código (Claude Code)

| Bloque | Estado | Evidencia en `master` | Qué falta | Qué necesita |
|---|---|---|---|---|
| **A** AudioDirector con Howler (música adaptativa) | ✅ Hecho | `howler` en `frontend/package.json`; `features/simulator/audio-director.service.ts` con `setStressLevel()` | — | — |
| **B** WebGL Pipeline + GameFeel | ⚠️ Parcial | Viñeta procedural estática por tono del mapa (`applyLightingOverlay` en `game-world.component.ts`); fundidos al cambiar de sala (`transitionToRoom`) e intro (`playIntroFade`) | Viñeta que reaccione al estrés y pulse por encima de 85; destello al entrar a una sala; sacudida en decisiones de alto impacto | Nada externo. **Plan:** [`2026-10-02-bloque-b-game-feel.md`](../superpowers/plans/2026-10-02-bloque-b-game-feel.md) |
| **C** Diálogo texto-como-síntoma + retratos dinámicos | ⚠️ Parcial | Retratos emocionales de NPC (`portrait-resolver.util.ts`) | Modulación del texto según el estado del paciente («texto como síntoma») e interrupciones tipo QTE | **Diseño con el equipo de Psicología**: qué síntomas se representan y cómo afectan la evaluación |
| **D** Avatar pixel art conectado a Phaser | ✅ Hecho | Elenco v1 horneado (`v1-avatar.util.ts`, `baked-cast.util.ts`, `phaser-avatar-renderer`) | — | — |
| **E** Social Mapping (sub-proyecto G) | ❌ No existe | Ninguna pieza | Todo el bloque | **Diseño con el equipo de Psicología**: qué red social se mapea y cómo se puntúa. Fuente: sub-proyecto G de `docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md` |
| **F** Verbal Tension Box (sub-proyecto I) | ❌ No existe | Ninguna pieza | Todo el bloque | **Diseño con el equipo de Psicología**: qué es la tensión verbal y qué la mueve. Fuente: sub-proyecto I del mismo roadmap (decisiones D1 y D2 pendientes) |
| **G** RF-027 Asistente IA contextual | ⚠️ Parcial | Backend: `apps/simulation/views/ai_assistant.py`, ruta `/api/simulation/ai-assistant` | Ninguna pantalla lo usa. RF-027 pide Estudiante **y** Docente; el backend filtra solo al estudiante | Decidir el alcance para docente y configurar `AI_ASSISTANT_API_KEY` (hoy sin configurar: modo degradado) |
| **H** WCAG 2.1 AA | ⚠️ Parcial | Enlace de salto en `app.component.ts`; axe en las puertas de calidad e2e (`e2e/support/quality-gates.ts`) | Auditoría completa: contraste en landing y login (pendiente conocido), foco, lectores de pantalla en el juego. Informe previo: auditoría de UI 2026-09 | Nada externo |
| **I** CI Quality Gates | ✅ Hecho | `.github/workflows/ci.yml` (scripts, backend, frontend, e2e) y `e2e-full-case.yml` | — | — |
| **J** Escenarios adicionales (hospital, comisaría, hogar) | ⚠️ Parcial | Un solo caso sembrado: `SIM-VBG-001` (hospital + comisaría) | Escenario de hogar/consultorio y más casos | **Contenido clínico** del nuevo caso y arte de sus salas |
| **K** Landing y onboarding | ✅ Hecho | Landing en `frontend/src/app` (5 archivos) | Solo el contraste (va con H) | — |
| **L** Repo privado + auditoría de secretos | ✅ Hecho | Los dos repos son privados desde el 2026-09-29 | — | — |

## Bloques visuales (ChatGPT / generación de arte)

Buena parte del arte se produjo después con otros pipelines (`tools/`), así que el plan visual se cumple en gran medida por otra vía. Falta auditarlo pieza por pieza contra cada especificación del plan.

| Bloque visual | Estado | Evidencia o nota |
|---|---|---|
| A Iconos de audio | Sin auditar | — |
| B Tilesets de escenarios | Parcial | Salas del caso PDF con muebles y puertas propios (`tools/furniture-assets/`, `tools/door-assets/`); los tilesets Kenney del repo son de exterior y no sirven para interiores |
| C Retratos de NPC | Hecho por otra vía | Retratos emocionales de NPC (PR #5-#7) |
| D Sprites del avatar | Hecho por otra vía | Elenco jugable horneado (12 personajes) |
| E NPC ambientales | Hecho por otra vía | 9 NPC del caso horneados (PR #9) |
| F Overlays de iluminación | Parcial | Viñeta procedural por código, sin assets; el bloque B la amplía |
| G UI Kit (corazones, iconos) | Parcial | Corazones de calma (`stress-hearts.util.ts`); falta revisar el resto del kit |
| H Efectos visuales de decisión | Sin auditar | Relacionado con el bloque B (destello y sacudida) |
| I Mapas Tiled (.json) | Parcial | Mapas del caso PDF; faltan los de nuevos escenarios (bloque J) |
| J Fondos | Sin auditar | — |

## Orden de ejecución propuesto

1. **B** — ahora: no depende de nadie y se puede probar sin datos nuevos.
2. **H** — cerrar las brechas de accesibilidad conocidas (contraste, foco, juego con lector de pantalla).
3. **G** — interfaz del asistente, en cuanto se decida su alcance para docentes.
4. **C, E y F** — en paralelo con 1-3, diseño con el equipo de Psicología; cada uno tendrá su spec en `docs/superpowers/specs/` antes de programar.
5. **J** — cuando exista el contenido clínico del nuevo escenario.
6. Auditoría pieza por pieza de los bloques visuales sin auditar.

## Reglas del plan que cambiaron desde junio

- **REGLA-002** (sin migraciones Django): sigue en pie, pero ahora los cambios de esquema se discuten antes y se publican como script idempotente en `deploy/upgrades/`, con el CHECK de `deploy/db_seed.sql` vigilado por `test_deploy_schema_contract.py`.
- **REGLA-004** (salida segura siempre alcanzable): desde ETH-02 la salida segura es una pausa reanudable (`PAUSED`); reemplazar un intento con forceNew lo cierra como `REPLACED`, que no es una salida segura.
- **REGLA-009** (Phaser con `pixelArt`, `roundPixels`, zoom 2×): sigue vigente en `game-world.component.ts`.
- **IDs de requisitos:** el plan cita RQ-NEG-002 para Social Mapping y RQ-NEG-003 para la Verbal Tension Box, pero en el catálogo (`docs/Requisitos de Negocio (Simulador)/`) RQ-NEG-002 es «Inmutabilidad de lo publicado» y RQ-NEG-003 es «Motor por grafos (DAG)». Es la misma clase de colisión que la de RNF-010; la fuente real de E y F es `docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md` (sub-proyectos G e I).
