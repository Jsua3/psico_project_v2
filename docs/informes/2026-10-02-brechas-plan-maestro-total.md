# Brechas del PLAN MAESTRO TOTAL frente a master

> **Nota de la limpieza del repositorio (2026-10-10):** las menciones a documentos retirados (planes ya ejecutados, informes y especificaciones superados) se conservan como texto, sin enlace. Se recuperan del historial: `git show 9931599:<ruta>`.

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
| **C** Diálogo texto-como-síntoma + retratos dinámicos | ⚠️ Parcial · 📝 propuesta lista (2026-10-03) | Retratos emocionales de NPC (`portrait-resolver.util.ts`) | Modulación del texto según el estado del paciente («texto como síntoma») e interrupciones tipo QTE | **Decisión del equipo de Psicología** sobre la propuesta [`bloque-c-dialogo-sintoma.md`](../pendientes/propuestas/bloque-c-dialogo-sintoma.md) (resumen de las tres: [`propuestas-c-e-f-resumen.md`](../pendientes/propuestas/propuestas-c-e-f-resumen.md)) |
| **D** Avatar pixel art conectado a Phaser | ✅ Hecho | Elenco v1 horneado (`v1-avatar.util.ts`, `baked-cast.util.ts`, `phaser-avatar-renderer`) | — | — |
| **E** Social Mapping (sub-proyecto G) | ❌ No existe · 📝 propuesta lista (2026-10-03) | Ninguna pieza | Todo el bloque | **Decisión del equipo de Psicología** sobre la propuesta [`bloque-e-social-mapping.md`](../pendientes/propuestas/bloque-e-social-mapping.md): qué red se mapea, quién aparece en ella y cómo se observa. Fuente: sub-proyecto G de `docs/historico/psychosocial-sim-roadmap.md` |
| **F** Verbal Tension Box (sub-proyecto I) | ❌ No existe · 📝 propuesta lista (2026-10-03) | Ninguna pieza | Todo el bloque | **Decisión del equipo de Psicología** sobre la propuesta [`bloque-f-verbal-tension-box.md`](../pendientes/propuestas/bloque-f-verbal-tension-box.md): la propuesta recomienda resolver D1 (tono sobrio) y D2 (por turnos, sin tiempo real). Fuente: sub-proyecto I del mismo roadmap |
| **G** RF-027 Asistente IA contextual | ⚠️ Parcial · 📝 propuesta de alcance lista (2026-10-03) | Backend: `apps/simulation/views/ai_assistant.py`, ruta `/api/simulation/ai-assistant` | Ninguna pantalla lo usa. RF-027 pide Estudiante **y** Docente; el backend filtra solo al estudiante. La ruta no tiene bandera de apagado, guarda la pregunta en claro en `audit_logs` y no tiene pruebas | **Decisión de alcance y de privacidad** (Ley 1581/2012) sobre [`bloque-g-asistente-ia.md`](../pendientes/propuestas/bloque-g-asistente-ia.md), que recomienda empezar por una ayuda curada sin proveedor externo. `AI_ASSISTANT_API_KEY` sigue sin configurar (modo degradado) |
| **H** WCAG 2.2 AA (el plan decía 2.1) | ⚠️ Parcial · auditado y arreglos claros hechos (2026-10-03) | Enlace de salto en `app.component.ts`; axe en las puertas de calidad e2e (`e2e/support/quality-gates.ts`). **Nuevo:** auditoría de 35 hallazgos ([`2026-10-03-bloque-h-accesibilidad-brechas.md`](2026-10-03-bloque-h-accesibilidad-brechas.md)) y 15 de ellos arreglados con prueba (tareas 1-8 del plan): contraste de portada y login, anillos de foco y texto del diálogo en el juego, foco en Grupos y en el editor DAG, nombres accesibles del login, el diálogo respeta «Movimiento reducido», semántica de portada y HUD | **3 bloqueantes sin arreglar:** con un diálogo de decisión abierto no hay botón de pausa (en táctil o ratón solo se sale eligiendo una opción, H-01); la introducción no tiene salida segura (H-02); el mundo de Phaser no tiene alternativa para lector de pantalla (H-06). Además: atajos de una tecla sin desactivar (H-07), anuncios de estrés y regiones vivas, borde y etiquetas de los campos del login, puertas axe con `wcag22aa` | **Decisión del equipo** (preguntas 1-10 de la auditoría; la salida segura dentro de diálogos e introducción toca REGLA-004 y conviene decidirla antes de la beta) y **verificación manual** con NVDA/VoiceOver y axe. Tareas 10-15 del plan, ya especificadas |
| **I** CI Quality Gates | ✅ Hecho | `.github/workflows/ci.yml` (scripts, backend, frontend, e2e) y `e2e-full-case.yml` | — | — |
| **J** Escenarios adicionales (hospital, comisaría, hogar) | ⚠️ Parcial · 📝 propuesta lista (2026-10-03) | Un solo caso sembrado: `SIM-VBG-001` (hospital + comisaría) | Escenario de hogar/consultorio y más casos. Antes hay que generalizar lo que está atado en código a `SIM-VBG-001` (finales, métricas y banderas del caso, aviso de contenido, introducción, renderer de salas) | **Contenido clínico** del nuevo caso y arte de sus salas. La propuesta [`bloque-j-escenario-hogar-consultorio.md`](../pendientes/propuestas/bloque-j-escenario-hogar-consultorio.md) recomienda empezar por un consultorio de primera escucha y trae la plantilla de lo que Psicología tendría que entregar |
| **K** Landing y onboarding | ✅ Hecho | Landing en `frontend/src/app` (5 archivos) | Solo el contraste (va con H) | — |
| **L** Repo privado + auditoría de secretos | ✅ Hecho | Los dos repos son privados desde el 2026-09-29 | — | — |

## Bloques visuales (ChatGPT / generación de arte)

Buena parte del arte se produjo después con otros pipelines (`tools/`), así que el plan visual se cumple en gran medida por otra vía. **Auditado pieza por pieza el 2026-10-03:** [`2026-10-03-bloques-visuales-auditoria.md`](2026-10-03-bloques-visuales-auditoria.md). Ningún bloque está hecho tal como lo pedía el plan (ninguna ruta ni nombre de archivo del plan existe en el repo); todo lo cumplido lo está con otro formato.

| Bloque visual | Estado (auditado 2026-10-03) | Evidencia o nota |
|---|---|---|
| A Iconos de audio | Hecho por otra vía | El HUD usa Material Symbols (ojo: la biblia premium los prohíbe) |
| B Tilesets de escenarios | Parcial | Salas del caso PDF con muebles y puertas propios (`tools/furniture-assets/`, `tools/door-assets/`); faltan muebles de vivienda y props pequeños. Los tilesets Kenney del repo son de exterior y no sirven para interiores |
| C Retratos de NPC | Hecho por otra vía, con huecos | 10 PNG de 96×96 de 5 personajes; falta la variante «cerrada» que piden las propuestas C y F |
| D Sprites del avatar | Hecho por otra vía | 8 identidades v1 y elenco jugable horneado (12 personajes); la escala v1 frente a los NPC sigue sin calibrar a la vista |
| E NPC ambientales | Hecho por otra vía | 9 hojas de NPC del caso, todas en uso |
| F Overlays de iluminación | Hecho por otra vía | Viñetas de tono y de crisis, luces y motas por código (bloque B); 0 de los 9 PNG del plan existen y no hacen falta. Falta calibrarlo a la vista |
| G UI Kit (corazones, iconos) | Parcial | Corazones de calma (`stress-hearts.util.ts`); faltan cursores, flecha guía e iconos de genograma/ecomapa (estos últimos solo si se aprueba el bloque E) |
| H Efectos visuales de decisión | Hecho por otra vía | Destello y sacudida por código (bloque B); 2 de las 5 piezas del plan ya no aplican |
| I Mapas Tiled (.json) | Hecho por otra vía | Los 3 mapas Tiled del plan no existen y ya no aplican: las salas se pintan con renderers. Para un caso nuevo (bloque J) hace falta un renderer y la semilla, no mapas Tiled |
| J Fondos | Hecho por otra vía | Fondos por código y CSS; 2 de las 4 piezas del plan ya no aplican |

## Orden de ejecución propuesto

1. **B** — ahora: no depende de nadie y se puede probar sin datos nuevos.
2. **H** — cerrar las brechas de accesibilidad conocidas (contraste, foco, juego con lector de pantalla).
3. **G** — interfaz del asistente, en cuanto se decida su alcance para docentes.
4. **C, E y F** — en paralelo con 1-3, diseño con el equipo de Psicología; cada uno tendrá su spec en `docs/superpowers/specs/` antes de programar.
5. **J** — cuando exista el contenido clínico del nuevo escenario.
6. Auditoría pieza por pieza de los bloques visuales sin auditar.

### Actualización tras la sesión nocturna (2026-10-03)

Hecho: 1 (B, falta el pase visual), los arreglos claros de 2 (H), las propuestas de 3 (G), 4 (C, E, F) y 5 (J), y la auditoría de 6. Detalle y decisiones en el [informe de la sesión](2026-10-03-informe-sesion-nocturna.md). Lo que sigue, por orden de lo que más bloquea:

1. **Decidir la salida segura dentro de diálogos e introducción** (REGLA-004; auditoría H §4, tarea 10 del plan H). Es además la «Fase 0b» que comparten C, E y F.
2. **Reunión con Psicología** sobre C, E y F con el [resumen de una página](../pendientes/propuestas/propuestas-c-e-f-resumen.md).
3. **Pase visual del bloque B** en un navegador real y calibración de sus valores.
4. Decidir el alcance y la privacidad del asistente (G) y el primer escenario nuevo (J).
5. Verificación manual de accesibilidad con lector de pantalla y axe (auditoría H §6).

## Reglas del plan que cambiaron desde junio

- **REGLA-002** (sin migraciones Django): sigue en pie, pero ahora los cambios de esquema se discuten antes y se publican como script idempotente en `deploy/upgrades/`, con el CHECK de `deploy/db_seed.sql` vigilado por `test_deploy_schema_contract.py`.
- **REGLA-004** (salida segura siempre alcanzable): desde ETH-02 la salida segura es una pausa reanudable (`PAUSED`); reemplazar un intento con forceNew lo cierra como `REPLACED`, que no es una salida segura.
- **REGLA-009** (Phaser con `pixelArt`, `roundPixels`, zoom 2×): sigue vigente en `game-world.component.ts`.
- **IDs de requisitos (corregido el 2026-10-03):** hay dos numeraciones de RQ-NEG en el repo. En el catálogo (`docs/Requisitos de Negocio (Simulador)/`), RQ-NEG-002 es «Entrenar competencias psicosociales transferibles» y RQ-NEG-003 es «Garantizar enfoque ético y de derechos en simulaciones». En `docs/historico/PROMPT_MIGRACION_DJANGO.md` §3, RQ-NEG-002 es «Inmutabilidad de lo publicado» y RQ-NEG-003 es «Motor por grafos (DAG)» (la primera versión de esta nota atribuyó estos dos nombres al catálogo por error). El plan cita RQ-NEG-002 para C y E y RQ-NEG-003 para F; ninguna de las dos numeraciones define esos bloques, así que no se usan como fuente. Es la misma clase de colisión que la de RNF-010; la fuente real de E y F es `docs/historico/psychosocial-sim-roadmap.md` (sub-proyectos G e I).

### Actualización tras la sesión de jugabilidad (2026-10-03/04)

Medido contra `claude/peaceful-goodall-a2gobv` (sale de `master` @ `51d1409`, sin PR ni merge). Informe completo: [`2026-10-04-informe-sesion-jugabilidad.md`](2026-10-04-informe-sesion-jugabilidad.md). El diagnóstico (3 playtests con Chromium real, 4 auditorías de código, panel de diseño) está en [`2026-10-03-diagnostico-jugabilidad/`](2026-10-03-diagnostico-jugabilidad) y la revisión adversarial posterior en [`2026-10-04-revision-adversarial/`](2026-10-04-revision-adversarial).

| Bloque | Antes | Ahora | Evidencia |
|---|---|---|---|
| **A** Audio | ✅ (1 de 4 capas; la música se callaba en crisis) | ◐ Piso de volumen 0,6 con una sola capa, `item_pickup` y `door_open` con sonidos neutros de Kenney; siguen faltando las capas `tension`, `resolution` y `crisis` (música propia) | `audio-director.service.ts`, `stress-tier.util.ts` |
| **B** Game feel | ✅ falta verlo | ✅ **Visto y calibrado.** El destello con tope 0,45 saltaba 0,17 de luminancia (umbral WCAG 2.3.1 = 0,10) y lavaba la escena: ahora 0,20 (salto 0,056) con una prueba que lo vigila; el alfa fijo con movimiento reducido baja de 0,70 a 0,55 (sin escalón al reanudar); la viñeta de Phaser usa los umbrales únicos de `stress-tier.util`; la viñeta DOM antigua se retiró. **Pendiente de Producto:** la sacudida tras una opción riesgosa (se recomienda limitarla a conducta prohibida) | [`2026-10-03-pase-visual-bloque-b.md`](2026-10-03-pase-visual-bloque-b.md) |
| **C** Diálogo-síntoma | ⚠️ | ⚠️ **Fase 1 hecha sin contenido nuevo:** retratos solo con assets que existen, sin sonrisa de la Abuela en el duelo, sin chips de emoción para personas. Siguen pendientes (Psicología): ritmo y pausas, retrato `closed`, validar los alias | `portrait-resolver.util.ts` |
| **E, F** | ❌ propuesta | ❌ sin cambios: todo su contenido es clínico y lo debe redactar y validar Psicología | — |
| **G** Asistente IA | ⚠️ ruta abierta | ⚠️ **Apagado por defecto** (`AI_ASSISTANT_ENABLED=false`, 404 con el sobre habitual, UUID validado, sin nombrar variables internas) con 22 pruebas. Hay una pantalla «Cómo se juega» **sin IA** (controles y descripciones ya sembradas). El proveedor externo sigue sin autorizarse | `ai_assistant.py`, `game-help.*` |
| **H** WCAG 2.2 AA | ⚠️ T1-T9 | ⚠️ **T10 hecha** (la salida segura es alcanzable en introducción, contexto, diálogos con y sin opciones, supervisión, bitácora, ajustes y ayuda, con Esc y con el toque; ver la matriz de la revisión). T12 parcial: la tarjeta «Qué hacer» y «También en esta sala» cubren la orientación, sin «Ir a…». **Pendientes:** T11 (atajos de una tecla, 2.1.4), T13 (anuncios de estrés), T14 (campos del login), T15 (foco, `aria-modal`, `wcag22aa` en las puertas axe) | `docs/audits/2026-10-04-revision-adversarial/` |
| **I** CI | ◐ | ◐ Job de secretos con gitleaks (binario fijado y verificado por suma de comprobación; los 33 hallazgos del historial son falsos positivos silenciados por patrón en `.github/gitleaks.toml`) y un job nocturno paralelo con las pruebas `@orientation`. Falta decidir el job de caso completo en los PR (borrador inactivo en `docs/pendientes/deudas/e2e-full-case-pr.yml.draft`) | `.github/workflows/` |
| **J** Escenarios | ⚠️ | ⚠️ sin cambios (generalizar finales, métricas, aviso e introducción por caso sigue siendo el trabajo previo a un segundo caso) | — |
| **K** Landing y onboarding | ◐ onboarding ✘ | ◐ **Onboarding hecho:** tarjeta de primera vez, pantalla permanente «Cómo se juega» (botón «?» del HUD, Ajustes y lobby) y la lista «Qué hacer». La portada ya no promete tres casos (los otros dos dicen «Próximamente»), «Ver todos los casos» deja de apuntar a sí misma y el catálogo muestra «Publicado» | `landing.component.*`, `game-help.*` |
| **L** Repo y secretos | ✅ con riesgos | ✅ con riesgos: **no se tocaron** `JWT_SECRET` por defecto ni la contraseña del administrador de la semilla (endurecerlos podría tumbar un despliegue existente; pregunta 13 del backlog) | — |

Lo que sigue, por orden de lo que más bloquea: (1) que Psicología responda las preguntas del informe (en especial la validación de T11.1, la longitud de las opciones y el copy de puntaje); (2) decidir la sacudida de cámara; (3) T11, T13 y T15 de H en un carril por archivo grande; (4) la decisión en dos tiempos (T9.12), que haría que la supervisión de cada decisión se lea sobre la escena donde se decidió; (5) reunión de C, E y F con el [resumen de una página](../pendientes/propuestas/propuestas-c-e-f-resumen.md).

