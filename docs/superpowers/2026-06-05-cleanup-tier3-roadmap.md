# Limpieza Tier 3 — Roadmap (decisiones, sin ejecutar)

- **Fecha:** 2026-06-05
- **Estado:** Roadmap / decisiones. **No se ejecuta nada aquí.** Cada sub-proyecto se aborda luego como su propio slice (brainstorming → spec → plan → TDD → verify).
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

**Esfuerzo:** alto (migración de contenido + remoción de código). **Riesgo:** medio (cambia lo que juega el estudiante en esas escenas). **Decisión:** cuándo hacerlo y con qué fidelidad de contenido.

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

---

## T3.3 — Retirar el backend Spring (el respaldo)

**Qué es hoy:** `psicologia_proyecto/backend/` (Spring Boot, 145 archivos) — **congelado, es el respaldo**. Además: el servicio `backend` de `docker-compose`, `proxy.spring.json`, referencias en README.

**Por qué (eventualmente):** Django es el backend activo; Spring solo es la red de seguridad.

**Decisión (RIESGO ALTO):** retirar **solo** cuando Django esté **validado en PRODUCCIÓN** (no solo en dev). Hasta entonces, **mantener** como respaldo (regla de oro).

**⚠️ Implicación crítica:** **Flyway (dueño del esquema) vive en Spring.** Si Spring se retira, la propiedad del esquema debe migrarse (migraciones Django gestionadas, o un Flyway/estandalone separado) — un cambio arquitectónico real (RNF-010). Por eso es el **último** y el más delicado; necesita su propio plan de "ownership de esquema" antes de tocar nada.

**Esfuerzo:** medio (remoción) pero **alto** en implicación (ownership de esquema). **Defer** hasta validación en producción.

---

## Secuencia recomendada

1. **T3.1** (convergencia ScenarioConfig → BD): mayor valor de unificación; hazlo cuando quieras invertir en la migración de contenido.
2. **T3.2** (retiro quiz legacy): tras confirmar que ningún curso lo usa.
3. **T3.3** (retiro Spring): el último, tras validar Django en producción y resolver el ownership del esquema (Flyway).

Cada uno: su propio brainstorming → spec → plan → build → verify, en rama propia, sin romper el flujo del estudiante. Nada de esto está ejecutado.
