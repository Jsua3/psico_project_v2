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
| **B** WebGL Pipeline + GameFeel | ✅ Hecho (2026-10-02) · **falta verlo en un navegador real** | Viñeta de tono (`applyLightingOverlay`) + viñeta de crisis atada al estrés que pulsa > 85 (`applyCrisisVignette`), destello suave al cambiar de sala (`playPendingRoomFlash`) y sacudida en decisiones de alto impacto (`playDecisionImpact`), disparados cuando la sala ya se ve (`playRevealEffects`); reglas en `game-feel.util.ts`. Probado con Jest (unitarias, contrato y comportamiento con dobles de Phaser) y con el e2e de caso completo | Pase visual para calibrar color, opacidad, tope del destello (0.45) e intensidad de la sacudida: el Browser pane de la sesión no pudo mostrar esta rama. Decidir si se retira la viñeta DOM de estrés que ya existía (`.stress-vignette` en `simulation-play`, muy tenue, sin pulso) | Se usó Graphics en vez de `PostFXPipeline`: funciona también en Canvas y no duplica la viñeta existente. Las dos viñetas se pintan compensando el zoom de la cámara (antes la de tono quedaba fuera de pantalla con zoom 2). El pulso se detiene con movimiento reducido y mientras hay un diálogo, la bitácora o el cierre abiertos. Detalle: [informe de la sesión](2026-10-03-informe-sesion-nocturna.md) |
| **C** Diálogo texto-como-síntoma + retratos dinámicos | ⚠️ Parcial · 📝 propuesta lista (2026-10-03) | Retratos emocionales de NPC (`portrait-resolver.util.ts`) | Modulación del texto según el estado del paciente («texto como síntoma») e interrupciones tipo QTE | **Decisión del equipo de Psicología** sobre la propuesta [`2026-10-03-bloque-c-dialogo-sintoma-propuesta.md`](../superpowers/specs/2026-10-03-bloque-c-dialogo-sintoma-propuesta.md) (resumen de las tres: [`…-propuestas-c-e-f-resumen.md`](../superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md)) |
| **D** Avatar pixel art conectado a Phaser | ✅ Hecho | Elenco v1 horneado (`v1-avatar.util.ts`, `baked-cast.util.ts`, `phaser-avatar-renderer`) | — | — |
| **E** Social Mapping (sub-proyecto G) | ❌ No existe · 📝 propuesta lista (2026-10-03) | Ninguna pieza | Todo el bloque | **Decisión del equipo de Psicología** sobre la propuesta [`2026-10-03-bloque-e-social-mapping-propuesta.md`](../superpowers/specs/2026-10-03-bloque-e-social-mapping-propuesta.md): qué red se mapea, quién aparece en ella y cómo se observa. Fuente: sub-proyecto G de `docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md` |
| **F** Verbal Tension Box (sub-proyecto I) | ❌ No existe · 📝 propuesta lista (2026-10-03) | Ninguna pieza | Todo el bloque | **Decisión del equipo de Psicología** sobre la propuesta [`2026-10-03-bloque-f-verbal-tension-box-propuesta.md`](../superpowers/specs/2026-10-03-bloque-f-verbal-tension-box-propuesta.md): la propuesta recomienda resolver D1 (tono sobrio) y D2 (por turnos, sin tiempo real). Fuente: sub-proyecto I del mismo roadmap |
| **G** RF-027 Asistente IA contextual | ⚠️ Parcial · 📝 propuesta de alcance lista (2026-10-03) | Backend: `apps/simulation/views/ai_assistant.py`, ruta `/api/simulation/ai-assistant` | Ninguna pantalla lo usa. RF-027 pide Estudiante **y** Docente; el backend filtra solo al estudiante. La ruta no tiene bandera de apagado, guarda la pregunta en claro en `audit_logs` y no tiene pruebas | **Decisión de alcance y de privacidad** (Ley 1581/2012) sobre [`2026-10-03-bloque-g-asistente-ia-propuesta.md`](../superpowers/specs/2026-10-03-bloque-g-asistente-ia-propuesta.md), que recomienda empezar por una ayuda curada sin proveedor externo. `AI_ASSISTANT_API_KEY` sigue sin configurar (modo degradado) |
| **H** WCAG 2.1 AA | ⚠️ Parcial | Enlace de salto en `app.component.ts`; axe en las puertas de calidad e2e (`e2e/support/quality-gates.ts`) | Auditoría completa: contraste en landing y login (pendiente conocido), foco, lectores de pantalla en el juego. Informe previo: auditoría de UI 2026-09 | Nada externo |
| **I** CI Quality Gates | ✅ Hecho | `.github/workflows/ci.yml` (scripts, backend, frontend, e2e) y `e2e-full-case.yml` | — | — |
| **J** Escenarios adicionales (hospital, comisaría, hogar) | ⚠️ Parcial · 📝 propuesta lista (2026-10-03) | Un solo caso sembrado: `SIM-VBG-001` (hospital + comisaría) | Escenario de hogar/consultorio y más casos. Antes hay que generalizar lo que está atado en código a `SIM-VBG-001` (finales, métricas y banderas del caso, aviso de contenido, introducción, renderer de salas) | **Contenido clínico** del nuevo caso y arte de sus salas. La propuesta [`2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md`](../superpowers/specs/2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md) recomienda empezar por un consultorio de primera escucha y trae la plantilla de lo que Psicología tendría que entregar |
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
- **IDs de requisitos (corregido el 2026-10-03):** hay dos numeraciones de RQ-NEG en el repo. En el catálogo (`docs/Requisitos de Negocio (Simulador)/`), RQ-NEG-002 es «Entrenar competencias psicosociales transferibles» y RQ-NEG-003 es «Garantizar enfoque ético y de derechos en simulaciones». En `docs/PROMPT_MIGRACION_DJANGO.md` §3, RQ-NEG-002 es «Inmutabilidad de lo publicado» y RQ-NEG-003 es «Motor por grafos (DAG)» (la primera versión de esta nota atribuyó estos dos nombres al catálogo por error). El plan cita RQ-NEG-002 para C y E y RQ-NEG-003 para F; ninguna de las dos numeraciones define esos bloques, así que no se usan como fuente. Es la misma clase de colisión que la de RNF-010; la fuente real de E y F es `docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md` (sub-proyectos G e I).
