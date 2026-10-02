# 05 — Datos honestos en el dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** ALTA (la pantalla más visitada muestra cifras falsas)
- **Categoría:** Usabilidad / honestidad de datos
- **Alcance estimado:** backend 1 servicio + 1 módulo nuevo + tests; frontend 1 util nuevo + tests, 4 archivos editados

**Goal:** Que el dashboard muestre cifras verdaderas y un solo camino claro: 0 se muestra como 0, «Intentos completados» cuenta solo los completados, el tiempo refleja tiempo activo (no días de pausa), no hay indicadores de relleno y «Continuar simulación» deja de aparecer seis veces.

**Architecture:** El «Tiempo total: 2239 h» sale de `ended_at − started_at` por intento. Eso incluye las pausas de la salida segura y los intentos abandonados, cuyo `ended_at` se fija cuando el estudiante empieza otro intento, a veces días después. Se añade en el backend un cálculo puro de **tiempo activo estimado** a partir de los eventos del intento: suma los intervalos entre eventos con un tope de 5 minutos por intervalo y descarta el intervalo que sigue a una salida segura. Se expone como `activeDurationSeconds` en el historial del estudiante, sin romper `totalDurationSeconds`. En el frontend, la lógica de cifras se extrae a funciones puras con pruebas, y las plantillas dejan de repetir el mismo botón.

**Tech Stack:** Django 5.1 + DRF (pytest), Angular 21 con signals (Jest 30).

**Spec:** Auditoría estética y técnica del 2026-09-29, problema de fondo 3 («La interfaz no avisa lo que pasa») y tabla «Portal docente y administrativo». Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No cambiar el significado de `totalDurationSeconds` (lo usan el reporte, la trazabilidad y el catálogo).
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- Tope de inactividad: `IDLE_CAP_SECONDS = 300`. Evento de pausa: `"SAFE_EXIT_REQUESTED"`.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Textos visibles en español con tildes. Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Estudiante sin ningún intento: las tarjetas muestran 0 donde el dato es un conteo, y «Sin datos» donde no hay nada que medir (tiempo, mejor puntaje).
- Intento en curso (sin `ended_at`): no suma tiempo; `activeDurationSeconds` es `null`.
- Intento pausado días con la salida segura y luego reanudado: esos días no cuentan.
- Intento abandonado al empezar otro: suma como mucho 5 minutos por el último tramo, no días.
- Profesor y administrador: siguen viendo sus acciones rápidas; solo el estudiante deja de ver la sección duplicada.

## Problema

**Backend.** `backend_django/apps/simulation/services/game_service.py:274-277` (dentro de `list_attempt_history`, actual):

```python
            "totalDurationSeconds": (
                int((a.ended_at - a.started_at).total_seconds())
                if a.started_at and a.ended_at else None
            ),
```

`game_service.py:141-146`: al empezar un intento nuevo, los intentos activos o pausados pasan a `SAFE_EXITED` con `ended_at = now`. `safe_exit` (`:420-435`) pone `PAUSED` y registra `SAFE_EXIT_REQUESTED`; `resume_attempt` (`:438-453`) registra `ATTEMPT_RESUMED`. Los eventos viven en `AttemptEvent` (`apps/simulation/models/attempt.py:57-77`, campos `event_type` y `occurred_at`).

**Frontend.** `frontend/src/app/features/dashboard/dashboard.component.ts:612-621` (actual):

```ts
  private metric(
    icon: string,
    value: number | string,
    label: string,
    status: string,
    badgeClass: DashboardMetric['badgeClass']
  ): DashboardMetric {
    const display = typeof value === 'number'
      ? (value > 0 ? String(value) : 'Pendiente')
      : value;
    return { icon, value: display, label, status, badgeClass };
  }
```

`dashboard.component.ts:414-422` (dentro de `studentMetrics`, actual):

```ts
    const completed = history.filter(a => a.status === 'COMPLETED' || a.status === 'SAFE_EXITED').length;
    const assignedCases = cases.length > 0 ? cases.length : new Set(history.map(h => h.caseTitle)).size;
    const scores = history.filter(h => h.accumulatedScore > 0).map(h => h.accumulatedScore);
    const bestScore = scores.length ? String(Math.max(...scores)) : 'Pendiente';
    const totalSeconds = history.reduce((sum, h) => sum + (h.totalDurationSeconds ?? 0), 0);
    const totalTime = totalSeconds > 0 ? this.formatDuration(totalSeconds) : 'Pendiente';
```

`dashboard.component.ts:432`:

```ts
      this.metric('schedule', totalTime, 'Tiempo total', totalTime === 'Pendiente' ? 'Sin datos suficientes todavía' : 'Acumulado', totalTime === 'Pendiente' ? 'neutral' : 'blue'),
```

`dashboard.component.ts:437-441` (actual):

```ts
  studentCompletedCount(): number {
    return this.studentHistory().filter(
      a => a.status === 'COMPLETED' || a.status === 'SAFE_EXITED'
    ).length;
  }
```

`dashboard.component.ts:312-316` (dentro de `heroStatusStudentCard`, actual):

```ts
    const scores = history.filter(h => h.accumulatedScore > 0).map(h => h.accumulatedScore);
    const bestScore = scores.length ? String(Math.max(...scores)) : 'Pendiente';
    const totalSeconds = history.reduce((sum, h) => sum + (h.totalDurationSeconds ?? 0), 0);
    const totalTime = totalSeconds > 0 ? this.formatDuration(totalSeconds) : 'Pendiente';
```

`:334-339`:

```ts
        {
          label: 'Tiempo total',
          value: totalTime
        }
      ],
      action: { label: 'Continuar simulación', route: '/portal/simulador', icon: 'play_arrow', accent: true }
```

KPI de relleno del profesor: `:280` `chips: ['Grupos', 'Intentos', 'Rúbricas'],`, `:294-297`:

```ts
        {
          label: 'Rúbricas pendientes',
          value: 'Pendiente'
        }
```

y `:408`:

```ts
      this.metric('grading', 'Pendiente', 'Rúbricas pendientes', 'Sin datos suficientes todavía', 'neutral')
```

Botón repetido para el estudiante: acciones rápidas (`:179-183`, tres enlaces a la misma ruta `/portal/simulador`), hero (`dashboard.component.html:16-31`), tarjeta de estado (`:339`), sección `<app-quick-actions>` (`dashboard.component.html:101`), panel de entrenamiento y barra lateral. Estado vacío con título engañoso (`dashboard.component.html:159-161`):

```html
        <h2 id="training-empty-title">
          @if (isEstudiante()) { Continuar simulación } @else { Continuar entrenamiento }
        </h2>
```

Gráfico mal etiquetado: `dashboard-charts.component.html:95-96` dice «Decisiones críticas por caso» / «Intentos que requieren revisión», pero `dashboard-charts.component.ts:143-145` cuenta todos los intentos recientes por caso, con tono naranja de alerta (`:152`).

## Objetivo

- Backend: `activeDurationSeconds` en cada elemento de `GET /api/simulation/attempts/history`.
- Frontend: funciones puras `metricDisplay`, `completedAttemptCount` y `totalActiveSeconds` en `frontend/src/app/features/dashboard/dashboard-metrics.util.ts`, con spec.
- Dashboard del estudiante: «Intentos completados» = COMPLETED; «Tiempo activo» estimado; 0 = «0»; el botón «Continuar simulación» solo en el hero y en el panel del caso activo (más la barra lateral, que no se toca).
- Profesor: sin «Rúbricas pendientes».
- Gráfico: «Intentos recientes por caso», tono azul.

## Convenciones del repo

- Módulos de servicio en `backend_django/apps/simulation/services/`; tests en `backend_django/apps/simulation/tests/test_*.py`; ejecución `npm run test:backend -- <ruta> -q` desde la raíz (PostgreSQL desechable).
- Utilidades puras del dashboard con spec: `frontend/src/app/features/dashboard/dashboard-charts.util.ts` + `dashboard-charts.component.spec.ts`.
- Jest: `npm test --prefix frontend -- --runInBand <ruta del spec>`.

---

### Task 1: Cálculo puro del tiempo activo (backend)

**Files:**
- Create: `backend_django/apps/simulation/services/attempt_duration.py`
- Create: `backend_django/apps/simulation/tests/test_attempt_duration.py`

**Interfaces:**
- Produces: `active_duration_seconds(started_at, ended_at, events, idle_cap=IDLE_CAP_SECONDS) -> int | None`, donde `events` es una lista ordenada de tuplas `(event_type: str, occurred_at: datetime)`.

- [ ] **Step 1: Escribir las pruebas**

```python
from datetime import datetime, timedelta, timezone

from apps.simulation.services.attempt_duration import IDLE_CAP_SECONDS, active_duration_seconds

T0 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)


def at(seconds):
    return T0 + timedelta(seconds=seconds)


def test_intento_sin_terminar_no_informa_tiempo():
    assert active_duration_seconds(T0, None, [("DECISION_MADE", at(60))]) is None


def test_actividad_continua_suma_los_intervalos():
    events = [("DECISION_MADE", at(60)), ("DECISION_MADE", at(120))]
    assert active_duration_seconds(T0, at(180), events) == 180


def test_una_espera_larga_cuenta_como_maximo_el_tope():
    events = [("DECISION_MADE", at(60))]
    assert active_duration_seconds(T0, at(60 + 3600), events) == 60 + IDLE_CAP_SECONDS


def test_el_tiempo_en_pausa_segura_no_cuenta():
    day = 86_400
    events = [
        ("DECISION_MADE", at(60)),
        ("SAFE_EXIT_REQUESTED", at(120)),
        ("ATTEMPT_RESUMED", at(120 + day)),
        ("DECISION_MADE", at(180 + day)),
    ]
    assert active_duration_seconds(T0, at(240 + day), events) == 60 + 60 + 60 + 60


def test_intervalos_nulos_o_negativos_se_ignoran():
    events = [("DECISION_MADE", at(0)), ("DECISION_MADE", at(0))]
    assert active_duration_seconds(T0, at(30), events) == 30
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm run test:backend -- apps/simulation/tests/test_attempt_duration.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'apps.simulation.services.attempt_duration'`.

- [ ] **Step 3: Implementar**

`backend_django/apps/simulation/services/attempt_duration.py`:

```python
"""Tiempo activo estimado de un intento.

`ended_at - started_at` mide tiempo transcurrido: incluye las pausas de la
salida segura y los intentos abandonados cuyo `ended_at` se fija cuando el
estudiante empieza otro intento, a veces días después. Esta estimación suma los
intervalos entre marcas consecutivas (inicio, eventos, fin), acota cada una a
`idle_cap` segundos y descarta el intervalo que sigue a una salida segura.
"""

IDLE_CAP_SECONDS = 300
PAUSE_EVENT = "SAFE_EXIT_REQUESTED"


def active_duration_seconds(started_at, ended_at, events, idle_cap=IDLE_CAP_SECONDS):
    """Devuelve segundos enteros de actividad, o None si el intento no terminó.

    `events` es una lista de tuplas (event_type, occurred_at) ordenada por
    occurred_at.
    """
    if started_at is None or ended_at is None:
        return None
    marks = [("START", started_at), *events, ("END", ended_at)]
    total = 0.0
    for (previous_type, previous_at), (_, current_at) in zip(marks, marks[1:]):
        if previous_type == PAUSE_EVENT:
            continue
        gap = (current_at - previous_at).total_seconds()
        if gap <= 0:
            continue
        total += min(gap, idle_cap)
    return int(total)
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm run test:backend -- apps/simulation/tests/test_attempt_duration.py -q`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend_django/apps/simulation/services/attempt_duration.py backend_django/apps/simulation/tests/test_attempt_duration.py
git commit -m "feat(simulation): estimar el tiempo activo de un intento sin pausas ni esperas largas"
```

---

### Task 2: Exponer `activeDurationSeconds` en el historial

**Files:**
- Modify: `backend_django/apps/simulation/services/game_service.py` (función `list_attempt_history`, líneas 226-282)
- Modify: `backend_django/apps/simulation/tests/test_game.py` (función `test_attempt_history_lists_own_attempts`, líneas 398-416)

**Interfaces:**
- Consumes: `active_duration_seconds` de la Task 1.
- Produces: campo JSON `activeDurationSeconds: int | null` en cada elemento del historial.

- [ ] **Step 1: Ampliar la prueba existente**

Al final de `test_attempt_history_lists_own_attempts` (después de `assert "startedAt" in mine`), añadir:

```python
    # Intento en curso: el tiempo activo solo se informa al terminar.
    assert "activeDurationSeconds" in mine
    assert mine["activeDurationSeconds"] is None
```

Run: `npm run test:backend -- apps/simulation/tests/test_game.py -k history -q`
Expected: FAIL (`KeyError` o assertion sobre `activeDurationSeconds`).

- [ ] **Step 2: Implementar**

En `game_service.py`, añadir junto a los otros imports de servicios:

```python
from apps.simulation.services.attempt_duration import active_duration_seconds
```

En `list_attempt_history`, justo antes de `return [` (línea ~264), añadir:

```python
    event_marks = {aid: [] for aid in attempt_ids}
    for attempt_id, event_type, occurred_at in (
        AttemptEvent.objects.filter(attempt_id__in=attempt_ids)
        .order_by("attempt_id", "occurred_at", "id")
        .values_list("attempt_id", "event_type", "occurred_at")
    ):
        event_marks[attempt_id].append((event_type, occurred_at))
```

En el diccionario de cada intento, justo debajo del bloque `"totalDurationSeconds": (…),`, añadir:

```python
            "activeDurationSeconds": active_duration_seconds(
                a.started_at, a.ended_at, event_marks[a.id]
            ),
```

- [ ] **Step 3: Ejecutar las pruebas del backend**

Run: `npm run test:backend -- apps/simulation/tests/test_game.py apps/simulation/tests/test_attempt_duration.py -q`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add backend_django/apps/simulation/services/game_service.py backend_django/apps/simulation/tests/test_game.py
git commit -m "feat(simulation): tiempo activo en el historial de intentos del estudiante"
```

---

### Task 3: Funciones puras de cifras (frontend)

**Files:**
- Create: `frontend/src/app/features/dashboard/dashboard-metrics.util.ts`
- Create: `frontend/src/app/features/dashboard/dashboard-metrics.util.spec.ts`
- Modify: `frontend/src/app/core/models/simulation.model.ts:343-356` (interfaz `StudentAttemptSummary`)

**Interfaces:**
- Produces: `metricDisplay(value: number | string): string`, `completedAttemptCount(history): number`, `totalActiveSeconds(history): number | null`.

- [ ] **Step 1: Añadir el campo al modelo**

En `StudentAttemptSummary`, debajo de `totalDurationSeconds: number | null;`, añadir:

```ts
  /** Tiempo activo estimado (sin pausas ni esperas > 5 min). null si no terminó. */
  activeDurationSeconds: number | null;
```

- [ ] **Step 2: Escribir las pruebas**

```ts
import { StudentAttemptSummary } from '../../core/models/simulation.model';
import { completedAttemptCount, metricDisplay, totalActiveSeconds } from './dashboard-metrics.util';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

describe('dashboard-metrics.util', () => {
  it('metricDisplay muestra el 0 como 0 y respeta los textos', () => {
    expect(metricDisplay(0)).toBe('0');
    expect(metricDisplay(12)).toBe('12');
    expect(metricDisplay('Sin datos')).toBe('Sin datos');
  });

  it('completedAttemptCount solo cuenta los intentos COMPLETED', () => {
    const history = [
      attempt({ status: 'COMPLETED' }),
      attempt({ status: 'SAFE_EXITED' }),
      attempt({ status: 'PAUSED' }),
      attempt({ status: 'IN_PROGRESS' }),
      attempt({ status: 'COMPLETED' }),
    ];
    expect(completedAttemptCount(history)).toBe(2);
  });

  it('totalActiveSeconds suma solo los tiempos informados', () => {
    expect(totalActiveSeconds([])).toBeNull();
    expect(totalActiveSeconds([attempt({ activeDurationSeconds: null })])).toBeNull();
    expect(totalActiveSeconds([
      attempt({ activeDurationSeconds: 300 }),
      attempt({ activeDurationSeconds: null, totalDurationSeconds: 86_400 }),
      attempt({ activeDurationSeconds: 120 }),
    ])).toBe(420);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/dashboard/dashboard-metrics.util.spec.ts`
Expected: FAIL (`Cannot find module './dashboard-metrics.util'`).

- [ ] **Step 3: Implementar**

`frontend/src/app/features/dashboard/dashboard-metrics.util.ts`:

```ts
import { StudentAttemptSummary } from '../../core/models/simulation.model';

/** Un conteo se muestra tal cual, también el 0. Un texto se respeta. */
export function metricDisplay(value: number | string): string {
  return typeof value === 'number' ? String(value) : value;
}

/** Intentos terminados de verdad. SAFE_EXITED significa interrumpido, no completado. */
export function completedAttemptCount(history: readonly StudentAttemptSummary[]): number {
  return history.filter(attempt => attempt.status === 'COMPLETED').length;
}

/** Suma del tiempo activo estimado; null si ningún intento lo informa. */
export function totalActiveSeconds(history: readonly StudentAttemptSummary[]): number | null {
  const values = history
    .map(attempt => attempt.activeDurationSeconds)
    .filter((seconds): seconds is number => typeof seconds === 'number');
  return values.length ? values.reduce((sum, seconds) => sum + seconds, 0) : null;
}
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/dashboard/dashboard-metrics.util.spec.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/dashboard/dashboard-metrics.util.ts frontend/src/app/features/dashboard/dashboard-metrics.util.spec.ts frontend/src/app/core/models/simulation.model.ts
git commit -m "feat(dashboard): funciones puras para cifras honestas del estudiante"
```

---

### Task 4: Usar las cifras honestas en el dashboard

**Files:**
- Modify: `frontend/src/app/features/dashboard/dashboard.component.ts`

- [ ] **Step 1: Importar las funciones**

Junto a los imports del archivo, añadir:

```ts
import { completedAttemptCount, metricDisplay, totalActiveSeconds } from './dashboard-metrics.util';
```

- [ ] **Step 2: `metric()` muestra el 0**

Reemplazar en `metric()`:

```ts
    const display = typeof value === 'number'
      ? (value > 0 ? String(value) : 'Pendiente')
      : value;
```

por:

```ts
    const display = metricDisplay(value);
```

- [ ] **Step 3: Métricas del estudiante**

En `studentMetrics()`, reemplazar:

```ts
    const completed = history.filter(a => a.status === 'COMPLETED' || a.status === 'SAFE_EXITED').length;
```

por:

```ts
    const completed = completedAttemptCount(history);
```

y reemplazar:

```ts
    const totalSeconds = history.reduce((sum, h) => sum + (h.totalDurationSeconds ?? 0), 0);
    const totalTime = totalSeconds > 0 ? this.formatDuration(totalSeconds) : 'Pendiente';
```

por:

```ts
    const activeSeconds = totalActiveSeconds(history);
    const totalTime = activeSeconds !== null ? this.formatDuration(activeSeconds) : 'Sin datos';
```

Reemplazar la línea de la métrica de tiempo:

```ts
      this.metric('schedule', totalTime, 'Tiempo total', totalTime === 'Pendiente' ? 'Sin datos suficientes todavía' : 'Acumulado', totalTime === 'Pendiente' ? 'neutral' : 'blue'),
```

por:

```ts
      this.metric('schedule', totalTime, 'Tiempo activo', totalTime === 'Sin datos' ? 'Se calcula al terminar un intento' : 'Estimado, sin pausas', totalTime === 'Sin datos' ? 'neutral' : 'blue'),
```

- [ ] **Step 4: `studentCompletedCount()`**

Reemplazar el cuerpo por:

```ts
  studentCompletedCount(): number {
    return completedAttemptCount(this.studentHistory());
  }
```

- [ ] **Step 5: Tarjeta de estado del estudiante**

En `heroStatusStudentCard()`, reemplazar:

```ts
    const totalSeconds = history.reduce((sum, h) => sum + (h.totalDurationSeconds ?? 0), 0);
    const totalTime = totalSeconds > 0 ? this.formatDuration(totalSeconds) : 'Pendiente';
```

por:

```ts
    const activeSeconds = totalActiveSeconds(history);
    const totalTime = activeSeconds !== null ? this.formatDuration(activeSeconds) : 'Sin datos';
```

Cambiar la etiqueta `label: 'Tiempo total',` por `label: 'Tiempo activo',` y BORRAR la línea:

```ts
      action: { label: 'Continuar simulación', route: '/portal/simulador', icon: 'play_arrow', accent: true }
```

(La coma que queda después de `]` es válida en TypeScript; no hace falta tocarla.)

- [ ] **Step 6: La acción de la tarjeta pasa a ser opcional**

En la interfaz `HeroStatusCard` (línea 54-59), reemplazar `action: QuickAction;` por:

```ts
  action?: QuickAction;
```

- [ ] **Step 7: Quitar el KPI de relleno del profesor**

En la tarjeta de estado del profesor, cambiar `chips: ['Grupos', 'Intentos', 'Rúbricas'],` por `chips: ['Grupos', 'Intentos'],` y borrar el objeto:

```ts
        {
          label: 'Rúbricas pendientes',
          value: 'Pendiente'
        }
```

(las comas finales sobrantes son válidas en TypeScript). En `professorMetrics()`, borrar la línea:

```ts
      this.metric('grading', 'Pendiente', 'Rúbricas pendientes', 'Sin datos suficientes todavía', 'neutral')
```

(la coma final que queda en la línea anterior es válida).

- [ ] **Step 8: Acciones rápidas del estudiante sin duplicados**

En `quickActions()`, reemplazar el `return [ … ]` final (el del estudiante) por:

```ts
    return [
      { label: 'Ver casos y resultados', route: '/portal/simulador', icon: 'folder_open', accent: true }
    ];
```

En el mismo método, dentro del bloque del profesor, cambiar la ruta de «Revisar rúbricas» de `'/portal/docente/trazabilidad'` a `'/portal/rubricas'`.

- [ ] **Step 9: Build**

Run: `npm run build:frontend`
Expected: build OK (si el compilador marca `statusCard.action` como posiblemente indefinido, se corrige en la Task 5).

---

### Task 5: Plantillas y gráfico

**Files:**
- Modify: `frontend/src/app/features/dashboard/dashboard.component.html:54-60`, `:101`, `:159-161`
- Modify: `frontend/src/app/features/dashboard/dashboard-charts.component.html:95-96`
- Modify: `frontend/src/app/features/dashboard/dashboard-charts.component.ts:152`

- [ ] **Step 1: Acción opcional en la tarjeta de estado**

En `dashboard.component.html`, reemplazar:

```html
        <a
          class="pixel-button pixel-button--accent hero-status-card__action"
          [routerLink]="statusCard.action.route"
        >
          <mat-icon aria-hidden="true">{{ statusCard.action.icon }}</mat-icon>
          {{ statusCard.action.label }}
        </a>
```

por:

```html
        @if (statusCard.action; as action) {
          <a
            class="pixel-button pixel-button--accent hero-status-card__action"
            [routerLink]="action.route"
          >
            <mat-icon aria-hidden="true">{{ action.icon }}</mat-icon>
            {{ action.label }}
          </a>
        }
```

- [ ] **Step 2: Sección de acciones rápidas solo para docente y administración**

Reemplazar:

```html
  <app-quick-actions [actions]="quickActions()" />
```

por:

```html
  @if (!isEstudiante()) {
    <app-quick-actions [actions]="quickActions()" />
  }
```

- [ ] **Step 3: Estado vacío con título honesto**

Reemplazar:

```html
          @if (isEstudiante()) { Continuar simulación } @else { Continuar entrenamiento }
```

(la que está dentro de `<h2 id="training-empty-title">`) por:

```html
          @if (isEstudiante()) { Sin simulaciones activas } @else { Sin entrenamientos activos }
```

- [ ] **Step 4: Gráfico con el nombre de lo que muestra**

En `dashboard-charts.component.html:95-96`, reemplazar:

```html
        <h2>Decisiones críticas por caso</h2>
        <p>Intentos que requieren revisión</p>
```

por:

```html
        <h2>Intentos recientes por caso</h2>
        <p>Número de intentos en el periodo reciente</p>
```

En `dashboard-charts.component.ts`, dentro de `professorCaseChart()`, cambiar `tone: 'orange' as const` por `tone: 'blue' as const`.

- [ ] **Step 5: Pruebas y build**

Run: `npm run test:frontend`
Expected: todas las suites en verde (incluida `dashboard-metrics.util.spec.ts`).

Run: `npm run build:frontend`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/dashboard
git commit -m "fix(dashboard): cifras honestas y un solo botón principal para el estudiante"
```

## Límites

- NO tocar la barra lateral del shell (su botón «Continuar simulación» se queda).
- NO cambiar el panel «Continuar simulación» del caso activo (su botón es el contextual).
- NO cambiar la escala del gráfico «Desempeño por estudiante» ni otros gráficos.
- NO tocar `totalDurationSeconds` ni el reporte de finalización.
- NO borrar `formatDuration` (lo siguen usando otras métricas).

## Verificación

- **Mecánica:** `npm run test:backend -- apps/simulation/tests/test_attempt_duration.py apps/simulation/tests/test_game.py -q`, `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión en vivo** (`npm run up`, http://localhost:4200, botón «Usar demo» del login de estudiante):
  - El «Tiempo activo» del dashboard muestra una cifra plausible (horas o minutos, no miles de horas). Contrastar con la base: `GET /api/simulation/attempts/history` en DevTools › Network trae `activeDurationSeconds`.
  - «Intentos completados» coincide con los intentos COMPLETED del historial, no con los interrumpidos.
  - En la primera pantalla hay un solo «Continuar simulación» en el contenido (hero), más el del panel del caso activo abajo y el de la barra lateral. La sección «Acciones rápidas» no aparece para el estudiante.
  - Con un usuario docente: no aparece «Rúbricas pendientes»; «Revisar rúbricas» lleva a Rúbricas; el gráfico se titula «Intentos recientes por caso».
  - Con un usuario sin intentos: los conteos muestran 0 y el tiempo «Sin datos».
- **Hecho cuando:** ninguna cifra del dashboard contradice los datos del historial y el estudiante ve un solo camino principal.
