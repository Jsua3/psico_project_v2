# Limpieza Tier 3 — Roadmap (decisiones, sin ejecutar)

- **Fecha:** 2026-06-05
- **Estado:** Roadmap / decisiones. Cada sub-proyecto se aborda como su propio slice (brainstorming → spec → plan → TDD → verify).
- **Actualización 2026-06-05:** **T3.1 → coexistencia justificada** (no se converge; razón abajo). **T3.2 → ✅ HECHA** (rama `feat/retire-legacy-quiz`, ambos repos). **T3.3 → diferida** (sin cambios).
- **Contexto:** la limpieza **Tier 1 + Tier 2 ya se hizo** (rama `chore/cleanup-django`: borrado `client/` JavaFX + `engine/` muerto, `desktop.ini` des-trackeado, `.env.example` + `docker-compose` env-izado, dedupe a `shared/jsonutils`, assets huérfanos). El **Tier 3** son 3 piezas que tocan **features en uso** o el **respaldo Spring**, así que requieren decisión y se documentan aquí.

---

## T3.1 — Converger `ScenarioConfig` → mundo BD (jubilar lo hardcodeado)

**Qué es hoy:** el runtime tiene dos caminos de mundo:
- **BD-driven** (`/world` → `renderWorld`), autorado con el editor (Fases 1‑5). Fuente de verdad.
- **`ScenarioConfig` hardcodeado**: `simulation-play.component.ts` hace `fetch('/assets/game/scenarios/<key>.json')` y `gameWorld.setScenarioConfig(...)`; lo usan las salas comisaría/hospital con `renderRoom`/`transitionToRoom`/`checkExitTriggers`. Apoyado por configs: `comisaria-map.config.ts`, `hospital-map.config.ts`, `risky-interaction.config.ts`, `scene-guide.config.ts`, `scene-objectives.config.ts`, `scene-map-display.util.ts`, `kenney-frames.constants.ts`.

**Por qué converger:** con Fases 1‑5 el multi-sala (salas + puertas + zoom + fondo + NPCs + diálogos) ya es **autorable y jugable desde BD**. El camino hardcodeado es redundante → una sola verdad.

**Aproximación (por slices):**
1. Autorar las escenas comisaría/hospital como **casos BD multi-sala** (salas=nodos, puertas, NPCs, diálogos) replicando el contenido de los JSON de escenario.
2. Cambiar el runtime para cargarlas desde BD (dejar de llamar `setScenarioConfig` para esos casos).
3. Una vez ningún caso use `ScenarioConfig`: eliminar `renderRoom`/`transitionToRoom`/`checkExitTriggers`, `ScenarioConfig`, los `assets/game/scenarios/*.json` y los configs hardcodeados.

**Esfuerzo:** alto (migración de contenido + remoción de código). **Riesgo:** medio (cambia lo que juega el estudiante en esas escenas).

**✅ RESOLUCIÓN (2026-06-05): coexistencia justificada — NO se converge.** Al diseñarlo se halló el muro del modelo: las escenas hardcodeadas tienen **varias salas espaciales dentro de UN nodo clínico** (p.ej. comisaría: sala-espera→consultorio→supervisor, conectadas por puertas), y la BD es **1 `scene_map` por nodo (UNIQUE)**. `ScenarioConfig` existe precisamente para eso. Converger exigiría (a) cambiar el esquema (N salas/nodo) → Flyway en el Spring **congelado** (RNF-010), o (b) convertir cada sala en un nodo del DAG → **distorsiona el grafo clínico**. Conclusión: `ScenarioConfig` (salas espaciales intra-nodo) y el mundo BD (DAG + casos autorados) **sirven cosas distintas y coexisten a propósito** — no es deuda. Se retoma solo si se decide deliberadamente el modelo multi-sala-por-nodo.

---

## T3.2 — Retirar el quiz legacy (`casos` / `sesiones`)

**Qué es hoy:** el **quiz ABCD original** (anterior al simulador). Cableado en:
- Backend: apps `casos`, `sesiones` (+ reportes legacy).
- Frontend: `features/casos/` (`caso-list`, `caso-form`), rutas en `app.routes.ts`, e integración en `dashboard.component.ts` y `reportes/reporte-grupo.component.ts`.
- Tablas Flyway: `casos`, `escenarios`, `preguntas`, `opciones`, `sesiones_juego`, `respuestas`.

**Por qué retirar:** el **simulador** (app `simulation` + DAG + editor) es el camino moderno y más rico; el quiz es el MVP original.

**Decisión (PRODUCTO):** ¿algún curso/cohorte **todavía usa** el quiz ABCD?
- **Sí** → conservar (no tocar).
- **No** → retirar el **camino de código** (rutas/componentes frontend + integración dashboard/reportes + apps backend `casos`/`sesiones`), con pytest/jest/build verdes. **Las tablas Flyway NO se borran** (retención de datos; RNF-010).

**Esfuerzo:** medio. **Riesgo:** medio (dashboard/reportes pueden referenciar datos legacy; revisar al ejecutar).

**✅ RESOLUCIÓN (2026-06-05): HECHA.** Confirmado por producto que el quiz ya no se usa. Resultó un **refactor, no un borrado**: `reportes` vivía dentro de `sesiones` pero es la capa de reporting del **simulador** (mezclaba `SesionJuego` con datos de simulación), y el dashboard depende de ella. Pasos (spec `specs/2026-06-05-retire-legacy-quiz-design.md`, plan `plans/2026-06-05-retire-legacy-quiz.md`):
1. Extraído el reporting a una app nueva **`apps.reportes`** (sin modelos, **solo-simulador**); purgada la mezcla legacy; `api/reportes` re-cableado.
2. Borradas las apps **`casos`** y **`sesiones`** (+ rutas + INSTALLED_APPS). **Tablas Flyway intactas** (`managed=False`).
3. Frontend: borrado `features/casos` + rutas legacy (conservado `casos/:id/editor` = editor del simulador); dashboard/reporte/servicio/nav → **solo-simulador**.
Verificado: **pytest 107**, **jest 55**, **ng build**, smoke en vivo (dashboard sim-only; `/api/casos` y `/api/sesiones` → 404). Rama `feat/retire-legacy-quiz` (ambos repos, pusheada).

---

## T3.3 — Retirar el backend Spring (el respaldo)

**Qué es hoy:** `psicologia_proyecto/backend/` (Spring Boot, 145 archivos) — **congelado, es el respaldo**. Además: el servicio `backend` de `docker-compose`, `proxy.spring.json`, referencias en README.

**Por qué (eventualmente):** Django es el backend activo; Spring solo es la red de seguridad.

**Decisión (RIESGO ALTO):** retirar **solo** cuando Django esté **validado en PRODUCCIÓN** (no solo en dev). Hasta entonces, **mantener** como respaldo (regla de oro).

**⚠️ Implicación crítica:** **Flyway (dueño del esquema) vive en Spring.** Si Spring se retira, la propiedad del esquema debe migrarse (migraciones Django gestionadas, o un Flyway/estandalone separado) — un cambio arquitectónico real (RNF-010). Por eso es el **último** y el más delicado; necesita su propio plan de "ownership de esquema" antes de tocar nada.

**Esfuerzo:** medio (remoción) pero **alto** en implicación (ownership de esquema). **Defer** hasta validación en producción.

---

## Secuencia recomendada

1. ~~**T3.1** (convergencia ScenarioConfig → BD)~~ → **coexistencia justificada** (cerrado; ver resolución). Se retoma solo con decisión de modelo multi-sala-por-nodo.
2. ~~**T3.2** (retiro quiz legacy)~~ → **✅ HECHA** (rama `feat/retire-legacy-quiz`).
3. **T3.3** (retiro Spring): pendiente, el último — tras validar Django en producción y resolver el ownership del esquema (Flyway).

Cada uno: su propio brainstorming → spec → plan → build → verify, en rama propia, sin romper el flujo del estudiante.
