# SIM-VBG-001 Living Case and Consequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir las seis decisiones de `SIM-VBG-001` en un caso vivo con consecuencias clínicas autoritativas, reacciones NPC persistentes y rutas completas de acierto, error reparado y error no reparado, sin carreras ni dobles efectos.

**Architecture:** Django conserva la autoridad clínica y serializa toda mutación de `AttemptWorldState` con un único primitive que bloquea siempre `SimulationAttempt` y luego `AttemptWorldState`. Cada decisión exige revisión e idempotency key, guarda fingerprint y un body mínimo sin token en `flags_json`, y aplica una sola vez un delta clínicamente autorado sobre `trust`, `tension`, `openness` y `available` del NPC afectado; el mismo snapshot conserva también `emotion`, `pose` y `consequenceId`. Los cuatro actores relevantes existen desde el estado inicial, y `npcStates`, `lastConsequence`, `pendingRepair` y el timeline proyectan el resultado completo; el replay vuelve a adjuntar únicamente el token presentado y ya autorizado, sin reaplicar el delta. Angular mantiene la autoridad de sesión en `SimulationPlayComponent`, publica el `actorPresentation` ya existente y deja que `GameWorldComponent` lo traduzca a su `GameWorldPort` privado. El contrato expone un tono semántico, nunca un nombre de archivo o cue de audio; el plan de audio posterior será el único que lo traduzca a sonido.

**Tech Stack:** Django REST Framework, PostgreSQL aislado, Angular 21 Signals, Phaser 3, TypeScript 5.9, Jest, pytest y Playwright.

---

## Prerrequisitos y límites

Ejecutar después de estos planes, en este orden:

1. `2026-07-13-character-manifest-editor-premium.md`.
2. `2026-07-13-world-runtime-motion-camera.md`.
3. `2026-07-13-dialogue-hud-liquid-glass.md`.

Este plan importa, sin redefinir, `ActorRenderPlan`, `ActorPresentationState`, `InputLockState`, `GameWorldPort` y el `ConsequenceTone` compartido que Plan 1 crea en `frontend/src/app/core/models/consequence-tone.model.ts`. También consume las cuatro emociones de consecuencia `receptive|calm|worried|closed` que Plan 1 ya reservó en `clinicalEmotionPortraitStates`; una quinta emoción exige extender primero esa autoridad y sus tests. No crea `simulation-session.facade.ts`, `npc-controller.ts` ni otro store de sesión: esos archivos no existen y duplicarían la autoridad de `SimulationPlayComponent` y `GameWorldComponent`. Tampoco reproduce audio; `ClinicalConsequence.tone` queda listo para que el plan de audio lo convierta después en un `AudioCue` tipado.

La revisión clínica continúa siendo humana. Este plan solo congela su protocolo y un handoff `PENDING`; la ejecución y firma SME ocurren en el plan final de aceptación sobre el HEAD que ya incluye audio y checkpoint. Suites verdes y tres rutas automatizadas no equivalen a aprobación clínica ni autorizan publicar una nota 9/10.

## Invariantes vinculantes

1. Toda escritura de `AttemptWorldState`, incluidas posición, interacción, NPC, herramienta, puerta, consecuencia y checkpoint posterior, usa `mutate_world_state`.
2. El orden de bloqueo es siempre `SimulationAttempt` → `AttemptWorldState`; ninguna validación espacial basada en estado ocurre antes de ambos locks.
3. `start_attempt` crea el estado de mundo inicial. La primera decisión funciona sin un `GET /world` previo.
4. Una idempotency key representa un único payload. Repetir clave y payload devuelve el mismo receipt; reutilizar clave con otro payload responde HTTP 409.
5. Dos requests con la misma revisión no pueden aplicar dos decisiones: uno gana y el otro recibe HTTP 409, salvo que ambos sean el mismo request idempotente.
6. `consequenceActorKey` es contenido autorado por `option_key` y debe existir como actor real de la escena; nunca se infiere por prefijo.
7. El beat live anuncia y anima una vez. La hidratación tras reload restaura cuerpo y reparación en silencio: no repite ARIA ni sonido.
8. Antes de elegir no se exponen `classification`, `prohibitedConduct`, `isRecommended`, `isProhibited`, `evidenceWarning` ni texto “información incompleta”.
9. Ningún receipt persiste `attemptToken` ni su valor: guarda solo el body público allowlisted y el replay adjunta el token actualmente presentado después de autorizarlo.
10. `npcStates` contiene siempre y exactamente `familia-duelo`, `psicologa-acompanante`, `sobreviviente-consulta` y `profesional-psicosocial`; cada estado contiene `trust`, `tension`, `openness` en 0–100, `available`, `emotion`, `pose` y `consequenceId`.
11. Las 19 opciones canónicas tienen un delta relacional explícito y no nulo. La aplicación, el efecto clínico, el evento, la revisión, el receipt y la reparación ocurren dentro del mismo lock; cualquier excepción revierte todo.
12. La reparación aplica el delta de su propia opción exactamente una vez y conserva el impacto anterior. Ninguna hidratación, reload, timeline, checkpoint o replay vuelve a ejecutar deltas.
13. El conjunto de `REACTION_BY_SEVERITY[*].emotion` es exactamente `receptive|calm|worried|closed` y coincide con las claves reservadas por `CharacterManifestV1.clinicalEmotionPortraitStates`; no existe fallback narrativo.

## Mapa de archivos

| Archivo | Acción y responsabilidad |
|---|---|
| `backend_django/apps/simulation/services/world_state_mutation.py` | Crear; lock order, creación inicial, JSON canónico y primitive transaccional único. |
| `backend_django/apps/simulation/tests/conftest.py` | Crear; fixtures ejecutables compartidos del caso sembrado, intento y ruta reparada. |
| `backend_django/apps/simulation/tests/concurrency_helpers.py` | Crear; barrera reusable para concurrencia PostgreSQL real. |
| `backend_django/apps/simulation/tests/test_world_state_mutation.py` | Crear; estado inicial, orden de locks, ausencia de writers paralelos y carreras PATCH. |
| `backend_django/apps/simulation/services/world_service.py` | Modificar; todos los writers usan el primitive. |
| `backend_django/apps/simulation/services/case_effects.py` | Modificar; estado inicial de cuatro NPC, catálogo 19/19 de actor/delta y efectos puros sobre el contexto bloqueado. |
| `backend_django/apps/simulation/services/clinical_consequence.py` | Crear; resolver consecuencia y aplicar/clamp del estado relacional una sola vez dentro del contexto bloqueado. |
| `backend_django/apps/simulation/services/game_service.py` | Modificar; decisión fail-forward, revisión, idempotencia, receipt y eventos. |
| `backend_django/apps/simulation/serializers/requests.py` | Modificar; validar `decisionRevision` e `idempotencyKey`. |
| `backend_django/apps/simulation/serializers/game_dtos.py` | Modificar; DTO de consecuencia/relación, revisión y timeline proyectado desde snapshots relacionales persistidos. |
| `backend_django/apps/simulation/services/instructor_service.py` | Modificar; decodificar el envelope de evento para conservar texto humano y exponer `npcState` sin JSON crudo. |
| `backend_django/apps/simulation/views/game_views.py` | Modificar; pasar contrato completo y conservar HTTP 409. |
| `backend_django/apps/simulation/management/commands/seed_caso_pdf.py` | Modificar; validar que cada opción resuelve un actor real. |
| `backend_django/apps/simulation/tests/test_case_consequences.py` | Crear; contrato, reparación, rutas, receipts y concurrencia. |
| `backend_django/apps/simulation/tests/test_game.py` | Modificar; semántica fail-forward e idempotente. |
| `backend_django/apps/simulation/tests/test_instructor.py` | Modificar; traza docente conserva detail legible y snapshot relacional. |
| `backend_django/apps/simulation/tests/test_world.py` | Modificar; proyección persistida y writers serializados. |
| `frontend/src/app/core/models/simulation.model.ts` | Modificar; consecuencia, reparación, NPC state y revisión. |
| `frontend/src/app/core/models/consequence-tone.model.ts` | Verificar; autoridad compartida de `ConsequenceTone` creada por Plan 1, no modificar ni duplicar. |
| `frontend/src/app/core/api/simulation.service.ts` | Modificar; request de decisión revisado e idempotente. |
| `frontend/src/app/features/simulator/clinical-consequence.util.ts` | Crear; convertir DTO+actor real en `ActorPresentationState`. |
| `frontend/src/app/features/simulator/clinical-consequence.util.spec.ts` | Crear; mapping exacto y fail-closed. |
| `frontend/src/app/features/simulator/consequence-beat.component.ts` | Crear; beat breve, sobrio y accesible. |
| `frontend/src/app/features/simulator/consequence-beat.component.spec.ts` | Crear; una sola locución, timer y reduced motion. |
| `frontend/src/app/features/simulator/simulation-play.component.ts` | Modificar; coordinación live/hydration, repair flow y port existente. |
| `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` | Modificar; comandos, locks, reload silencioso e idempotency key. |
| `frontend/src/app/features/simulator/game-world.component.ts` | Verificar; ya adjunta el port existente y no recibe un controlador paralelo. |
| `frontend/src/app/features/simulator/dialogue-panel.component.ts` | Modificar solo si quedó un hint legacy. |
| `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts` | Modificar; regresión de opciones imparciales. |
| `frontend/e2e/support/premium-case-flow.ts` | Crear; recorrido espacial completo y tres variantes H1. |
| `frontend/e2e/support/quality-gates.ts` | Modificar; monitor único `{ assertClean, dispose }`. |
| `frontend/e2e/support/required-viewports.ts` | Modificar; exportar el tipo de viewport. |
| `frontend/e2e/full-case.e2e.ts` | Modificar; consumir el driver recomendado. |
| `frontend/e2e/premium-routes.e2e.ts` | Crear; tabla exacta de tres rutas. |
| `docs/clinical/SIM-VBG-001-consequence-review-protocol.md` | Crear; protocolo versionado que Phase 4 congela como `PENDING` para revisión SME en el HEAD final. |

### Task 1: Crear la frontera transaccional única del estado de mundo

**Files:**
- Create: `backend_django/apps/simulation/services/world_state_mutation.py`
- Create: `backend_django/apps/simulation/tests/conftest.py`
- Create: `backend_django/apps/simulation/tests/concurrency_helpers.py`
- Create: `backend_django/apps/simulation/tests/test_world_state_mutation.py`
- Modify: `backend_django/apps/simulation/services/game_service.py`
- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/services/case_effects.py`
- Modify: `backend_django/apps/simulation/tests/test_world.py`

- [ ] **Step 1: Escribir tests rojos del estado inicial y fingerprint canónico**

Crear primero los fixtures compartidos que usan los tests de este plan. No llaman a `world_service.get_world` ni alteran las opciones sembradas:

```python
# backend_django/apps/simulation/tests/conftest.py
from dataclasses import dataclass

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion, DecisionOption, SimulationAttempt
from apps.simulation.services import game_service

User = get_user_model()


@dataclass(frozen=True)
class StartedCase:
    attempt: SimulationAttempt
    raw_token: str
    actor: object


@pytest.fixture
def case_version(db):
    return CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001",
        status="PUBLISHED",
    )


@pytest.fixture
def student(db):
    return User.objects.create_user(
        email="living_case_student@x.com",
        password="x",
        nombre="Living",
        apellido="Case",
        role="ESTUDIANTE",
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def assigned_case(case_version, student):
    professor = User.objects.create_user(
        email="living_case_professor@x.com",
        password="x",
        nombre="Clinical",
        apellido="Reviewer",
        role="PROFESOR",
    )
    group = Grupo.objects.create(
        nombre="Living case tests",
        codigo="LIVING1",
        profesor=professor,
    )
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [group.id, student.id],
        )
        cursor.execute(
            "INSERT INTO grupo_case_version (grupo_id, case_version_id) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [group.id, case_version.id],
        )
    return case_version


@pytest.fixture
def started_case(assigned_case, student):
    payload = game_service.start_attempt(assigned_case.id, student)
    return StartedCase(
        attempt=SimulationAttempt.objects.get(pk=payload["attemptId"]),
        raw_token=payload["attemptToken"],
        actor=student,
    )


def _option(case_version, option_key):
    return DecisionOption.objects.get(
        case_version=case_version,
        option_key=option_key,
    )


@pytest.fixture
def h1_critical(case_version):
    return _option(case_version, "h1-noticia-sin-protocolo")


@pytest.fixture
def h1_adequate(case_version):
    return _option(case_version, "h1-pap-contencion")


@pytest.fixture
def h1_second_critical(case_version):
    return _option(case_version, "h1-interrogar-victima")


@pytest.fixture
def completed_repaired_case(started_case, case_version):
    option_keys = (
        "h1-noticia-sin-protocolo",
        "h1-pap-contencion",
        "h2-459-1257",
        "h3-integral-psicosocial",
        "c1-riesgo-proteccion-derechos",
        "c2-2126-1098-1257",
        "c3-integral-derechos",
    )
    result = None
    for revision, option_key in enumerate(option_keys):
        option = _option(case_version, option_key)
        result = game_service.choose_decision(
            started_case.attempt.id,
            started_case.raw_token,
            option.id,
            started_case.actor,
            decision_revision=revision,
            idempotency_key=f"fixture:{revision}:{option_key}",
        )
    assert result is not None
    return result
```

```python
# backend_django/apps/simulation/tests/test_world_state_mutation.py
import pytest

from apps.simulation.models import AttemptWorldState
from apps.simulation.services import game_service, world_state_mutation
from apps.simulation.services.case_effects import (
    NPC_ACTOR_KEYS,
    NPC_STATE_KEYS,
    initial_npc_states,
)
from apps.simulation.services.world_state_mutation import (
    canonical_request_fingerprint,
    mutate_world_state,
)
from shared.jsonutils import read_map


@pytest.mark.django_db
def test_start_attempt_creates_world_state_without_world_get(assigned_case, student):
    payload = game_service.start_attempt(assigned_case.id, student)

    state = AttemptWorldState.objects.get(attempt_id=payload["attemptId"])
    flags = read_map(state.flags_json)
    assert state.scene_map.node_id == payload["currentNode"]["id"]
    assert (state.player_x, state.player_y) == (
        state.scene_map.spawn_x,
        state.scene_map.spawn_y,
    )
    assert flags["syncedNodeId"] == payload["currentNode"]["id"]
    assert flags["decisionRevision"] == 0
    assert flags["npcStates"] == initial_npc_states()
    assert set(flags["npcStates"]) == set(NPC_ACTOR_KEYS)
    assert all(set(value) == set(NPC_STATE_KEYS) for value in flags["npcStates"].values())


def test_request_fingerprint_is_order_independent_and_value_sensitive():
    left = canonical_request_fingerprint({"b": [2, 1], "a": 7})
    right = canonical_request_fingerprint({"a": 7, "b": [2, 1]})
    changed = canonical_request_fingerprint({"a": 8, "b": [2, 1]})

    assert left == right
    assert left != changed
    assert len(left) == 64


@pytest.mark.django_db(transaction=True)
def test_mutation_locks_attempt_before_world_state(started_case, monkeypatch):
    calls = []
    original_attempt = world_state_mutation.SimulationAttempt.objects.select_for_update
    original_world = AttemptWorldState.objects.select_for_update

    monkeypatch.setattr(
        world_state_mutation.SimulationAttempt.objects,
        "select_for_update",
        lambda *args, **kwargs: (calls.append("attempt"), original_attempt(*args, **kwargs))[1],
    )
    monkeypatch.setattr(
        AttemptWorldState.objects,
        "select_for_update",
        lambda *args, **kwargs: (calls.append("world"), original_world(*args, **kwargs))[1],
    )

    mutate_world_state(started_case.attempt.id, lambda context: context.flags.update(probe=True))

    assert calls[:2] == ["attempt", "world"]
```

En los fixtures, no usar `world_service.get_world`; `started_case` debe devolver el estado creado por `start_attempt`. El test lee `flags_json` con el helper compartido y no añade API al modelo.

- [ ] **Step 2: Ejecutar y verificar el fallo**

Run: `npm run test:backend -- apps/simulation/tests/test_world_state_mutation.py -q`

Expected: FAIL con `ModuleNotFoundError: apps.simulation.services.world_state_mutation` y ausencia del estado inicial.

- [ ] **Step 3: Implementar el primitive completo**

```python
# backend_django/apps/simulation/services/world_state_mutation.py
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Callable, Generic, TypeVar

from django.db import transaction
from rest_framework.exceptions import NotFound

from apps.simulation.models import AttemptWorldState, SceneMap, SimulationAttempt
from apps.simulation.services.case_effects import ensure_npc_states
from shared.jsonutils import read_map, write_map

T = TypeVar("T")


@dataclass
class WorldMutationContext:
    attempt: SimulationAttempt
    state: AttemptWorldState
    flags: dict


@dataclass(frozen=True)
class WorldMutationResult(Generic[T]):
    value: T
    attempt: SimulationAttempt
    state: AttemptWorldState


def canonical_request_fingerprint(payload: dict) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _expected_map(attempt: SimulationAttempt) -> SceneMap:
    scene_map = SceneMap.objects.filter(node_id=attempt.current_node_id).first()
    if scene_map is None:
        raise NotFound("La escena no tiene mapa configurado")
    return scene_map


def _lock_context(attempt_id, synchronize_scene: bool) -> WorldMutationContext:
    attempt = (
        SimulationAttempt.objects.select_for_update()
        .select_related("case_version__simulation_case", "current_node", "student")
        .filter(pk=attempt_id)
        .first()
    )
    if attempt is None:
        raise NotFound("Intento no encontrado")

    expected_map = _expected_map(attempt)
    state = (
        AttemptWorldState.objects.select_for_update()
        .select_related("scene_map")
        .filter(attempt_id=attempt.id)
        .first()
    )
    if state is None:
        state = AttemptWorldState.objects.create(
            attempt=attempt,
            scene_map=expected_map,
            player_x=expected_map.spawn_x,
            player_y=expected_map.spawn_y,
            flags_json="{}",
        )

    flags = read_map(state.flags_json)
    flags.setdefault("decisionRevision", 0)
    ensure_npc_states(flags)
    if synchronize_scene and (
        state.scene_map_id is None
        or flags.get("syncedNodeId") != attempt.current_node_id
    ):
        state.scene_map = expected_map
        state.player_x = expected_map.spawn_x
        state.player_y = expected_map.spawn_y
        flags["syncedNodeId"] = attempt.current_node_id
    return WorldMutationContext(attempt=attempt, state=state, flags=flags)


def mutate_world_state(
    attempt_id,
    mutation: Callable[[WorldMutationContext], T],
    *,
    synchronize_scene: bool = True,
) -> WorldMutationResult[T]:
    with transaction.atomic():
        context = _lock_context(attempt_id, synchronize_scene)
        value = mutation(context)
        context.state.flags_json = write_map(context.flags)
        context.state.save()
        return WorldMutationResult(
            value=value,
            attempt=context.attempt,
            state=context.state,
        )
```

`mutation` puede cambiar y guardar `context.attempt` mientras el lock sigue vigente. El primitive guarda el world state una sola vez al salir. Una excepción del callback revierte attempt, state, eventos y receipt dentro de la misma transacción.

- [ ] **Step 4: Crear el helper de concurrencia PostgreSQL**

```python
# backend_django/apps/simulation/tests/concurrency_helpers.py
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections


def run_concurrently(*operations):
    barrier = Barrier(len(operations))

    def invoke(operation):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            return operation()
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        futures = [pool.submit(invoke, operation) for operation in operations]
        return [future.result(timeout=30) for future in futures]
```

- [ ] **Step 5: Crear el state al iniciar y eliminar writers paralelos**

En `start_attempt`, inmediatamente después de los eventos iniciales y antes de construir el DTO:

```python
from .world_state_mutation import mutate_world_state

mutate_world_state(attempt.id, lambda context: None)
```

En `world_service.py`, cada método obtiene primero autorización con `_require_attempt`, después llama al primitive y hace toda validación dependiente del mapa dentro del callback. Aplicar esta matriz exacta:

| Método | `synchronize_scene` | Mutación dentro del callback |
|---|---:|---|
| `get_world` / `world_for_attempt` | `True` | Solo sincronización al nodo y DTO. |
| `update_position` | `True` | Validar map key, límites, desplazamiento y colisión; cambiar posición y `positionSyncedAt`. |
| `open_interaction` | `True` | Validar cercanía; mutar inspected, dialogue, inventory y `viewedNpcKeys`. |
| `use_tool` | `True` | Validar inventario/target; mutar used tools y attempt stress exactamente una vez. |
| `record_npc_interaction` | `True` | Validar NPC/cercanía y mutar `viewedNpcKeys`. |
| `enter_room` | `False` | Validar la puerta contra el mapa actualmente mostrado y cambiar mapa/spawn. |

Añadir este único wrapper privado a `world_service.py`; todos los métodos de la tabla lo usan y su closure `operation` contiene las validaciones y mutaciones indicadas:

```python
def _mutate_authorized_world(
    attempt_id,
    attempt_token,
    actor,
    operation,
    *,
    synchronize_scene=True,
):
    authorized = game_service._require_attempt(attempt_id, attempt_token, actor)

    def mutation(context):
        if context.attempt.id != authorized.id:
            raise ValidationError("El intento autorizado no coincide")
        _require_in_progress(context.attempt)
        return operation(context)

    return mutate_world_state(
        authorized.id,
        mutation,
        synchronize_scene=synchronize_scene,
    ).value
```

Mover el cuerpo actual de cada writer a su closure `operation(context)`: sustituir el estado consultado por `context.state`, sustituir el mapa de flags por `context.flags` y devolver el DTO actual. El criterio verificable es que `world_service.py` no importe `AttemptWorldState`, no ejecute `.save()` sobre world state y no escriba `flags_json`; solo `world_state_mutation.py` puede hacerlo. Para `enter_room`, pasar `synchronize_scene=False` de forma explícita.

Eliminar `require_world_state`. `world_for_attempt(attempt)` debe llamar directamente `mutate_world_state(attempt.id, lambda context: _to_world_state(context.attempt, context.state, context.flags)).value`, de modo que la vista de instructor respete el mismo lock order. Cambiar también estos helpers para que no lean ni serialicen un segundo mapa de flags:

```python
def _stamp_position_sync(flags):
    flags["positionSyncedAt"] = timezone.now().timestamp()


def _require_plausible_displacement(world_state, flags, x, y):
    synced_at = flags.get("positionSyncedAt")
    if not isinstance(synced_at, (int, float)):
        return
    elapsed = min(
        max(timezone.now().timestamp() - synced_at, 0.0),
        POSITION_BUDGET_MAX_SECONDS,
    )
    allowed = POSITION_BASE_ALLOWANCE_PX + PLAYER_MAX_SPEED_PPS * elapsed
    delta = math.hypot(x - world_state.player_x, y - world_state.player_y)
    if delta > allowed:
        raise ValidationError("Desplazamiento no plausible para el tiempo transcurrido")
```

`_to_world_state` recibe `flags` como tercer argumento obligatorio. Ningún caller vuelve a ejecutar `read_map(state.flags_json)` dentro de una mutación.

En `case_effects.py`, reemplazar query/save propios por funciones puras sobre el contexto:

```python
from copy import deepcopy

from rest_framework.exceptions import ValidationError


NPC_ACTOR_KEYS = (
    "familia-duelo",
    "psicologa-acompanante",
    "sobreviviente-consulta",
    "profesional-psicosocial",
)
NPC_STATE_KEYS = (
    "trust", "tension", "openness", "available",
    "emotion", "pose", "consequenceId",
)
INITIAL_NPC_STATES = {
    "familia-duelo": {
        "trust": 46, "tension": 64, "openness": 38, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "psicologa-acompanante": {
        "trust": 58, "tension": 42, "openness": 60, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "sobreviviente-consulta": {
        "trust": 34, "tension": 72, "openness": 30, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "profesional-psicosocial": {
        "trust": 62, "tension": 38, "openness": 66, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
}


def initial_npc_states() -> dict:
    return deepcopy(INITIAL_NPC_STATES)


def validated_npc_state(actor_key: str, state) -> dict:
    path = f"npcStates.{actor_key}"
    if not isinstance(state, dict) or set(state) != set(NPC_STATE_KEYS):
        raise ValidationError({path: "Estado NPC incompleto."})
    for field in ("trust", "tension", "openness"):
        value = state[field]
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100:
            raise ValidationError({f"{path}.{field}": "Debe estar entre 0 y 100."})
    if not isinstance(state["available"], bool):
        raise ValidationError({f"{path}.available": "Debe ser booleano."})
    if state["pose"] not in {"idle", "react"}:
        raise ValidationError({f"{path}.pose": "Pose inválida."})
    if not isinstance(state["emotion"], str) or not state["emotion"]:
        raise ValidationError({f"{path}.emotion": "Emoción inválida."})
    consequence_id = state["consequenceId"]
    if consequence_id is not None and (
        not isinstance(consequence_id, str) or not consequence_id
    ):
        raise ValidationError({f"{path}.consequenceId": "Identificador inválido."})
    return deepcopy(state)


def npc_states_from_flags(raw: dict) -> dict:
    states = raw.get("npcStates")
    if states is None:
        return initial_npc_states()
    if not isinstance(states, dict) or set(states) != set(NPC_ACTOR_KEYS):
        raise ValidationError({"npcStates": "Catálogo autoritativo incompleto."})
    return {
        actor_key: validated_npc_state(actor_key, states[actor_key])
        for actor_key in NPC_ACTOR_KEYS
    }


def ensure_npc_states(raw: dict) -> dict:
    states = npc_states_from_flags(raw)
    raw["npcStates"] = states
    return states


def read_case_state_from_flags(raw):
    flags = raw.get("caseFlags") if isinstance(raw.get("caseFlags"), dict) else {}
    metrics_raw = raw.get("caseMetrics") if isinstance(raw.get("caseMetrics"), dict) else {}
    metrics = {key: int(metrics_raw.get(key, 50)) for key in CASE_METRIC_KEYS}
    return flags, metrics


def apply_case_effects(context, decision):
    entry = OPTION_EFFECTS.get(decision.option_key)
    if entry is None:
        return
    flags, metrics = read_case_state_from_flags(context.flags)
    flags.update(entry["flags"])
    for key, delta in entry["metrics"].items():
        metrics[key] = _clamp(metrics.get(key, 50) + delta)
    context.flags["caseFlags"] = flags
    context.flags["caseMetrics"] = metrics
```

`ensure_npc_states` solo rellena el catálogo cuando `npcStates` todavía no existe (compatibilidad de intentos activos anteriores al corte). Si la clave existe pero falta un actor/campo, tiene un score fuera de rango o un tipo inválido, falla cerrado; nunca recompone parcialmente un estado clínico corrupto.

Conservar `_load_state`, `read_case_state` y `clinical_state` como proyecciones **solo lectura** para callers legacy. Añadir la variante pura usada dentro del lock y permitir que el reporte reciba el mismo snapshot:

```python
def clinical_state_from_flags(raw):
    flags, metrics = read_case_state_from_flags(raw)
    trust = metrics["confianza"]
    return {
        "papApplied": bool(flags.get("pap_aplicado")),
        "patient": {
            "emotionalState": metrics["calidad_duelo"],
            "trustLevel": trust,
            "openness": trust,
            "crisisLevel": metrics["crisis_emocional"],
        },
    }


def clinical_state(attempt):
    state = _load_state(attempt)
    raw = _read_map(state.flags_json) if state else {}
    return clinical_state_from_flags(raw)
```

Cambiar `compute_ending(attempt, events)` a `compute_ending(attempt, events, *, world_flags=None)` y sustituir su llamada a `read_case_state(attempt)` por:

```python
flags, metrics = (
    read_case_state_from_flags(world_flags)
    if isinstance(world_flags, dict)
    else read_case_state(attempt)
)
```

Ninguna mutación invoca una proyección legacy antes de guardar el contexto.

Antes de Task 3, `choose_decision` aún conserva su semántica legacy de retry, pero debe dejar de ser un writer paralelo. Quitar su `@transaction.atomic`, resolver autorización fuera del callback y mover dentro de una sola llamada a `mutate_world_state` todas las validaciones, eventos, efectos y el `attempt.save()` existentes. La transformación exacta es:

```python
def choose_decision(
    attempt_id,
    attempt_token,
    decision_option_id,
    actor,
    evidence_override=False,
    missing_evidence=None,
):
    authorized = _require_attempt(attempt_id, attempt_token, actor)

    def mutation(context):
        attempt = context.attempt
        if attempt.id != authorized.id:
            raise ValidationError("El intento autorizado no coincide")
        if attempt.status != "IN_PROGRESS":
            raise ValidationError("El intento ya no acepta decisiones")
        decision = (
            DecisionOption.objects.filter(pk=decision_option_id)
            .select_related("source_node", "target_node", "case_version")
            .first()
        )
        if decision is None:
            raise NotFound("Decisión no encontrada")
        if decision.source_node_id != attempt.current_node_id:
            raise ValidationError("La decisión no está disponible desde la escena actual")
        if decision.case_version_id != attempt.case_version_id:
            raise ValidationError("La decisión no pertenece al caso del intento")

        effects = decision_effects.resolve(decision)
        is_bad_answer = (
            decision.prohibited_conduct
            or decision.classification in {"RISKY", "INADEQUATE"}
        )
        prior_retries = AttemptEvent.objects.filter(
            attempt_id=attempt.id,
            node_id=attempt.current_node_id,
            event_type__in=[
                "DECISION_RETRY_REQUIRED",
                "PROHIBITED_DECISION_RETRY_REQUIRED",
            ],
        ).count()
        if is_bad_answer and prior_retries == 0:
            message = (
                "La respuesta seleccionada puede ser riesgosa o inadecuada para este momento. "
                "Tienes una última oportunidad para volver a responder esta escena."
            )
            event_type = (
                "PROHIBITED_DECISION_RETRY_REQUIRED"
                if decision.prohibited_conduct
                else "DECISION_RETRY_REQUIRED"
            )
            _save_event(attempt, event_type, decision.source_node, decision, 0, 0, message)
            return dto.feedback_dto(
                decision,
                effects,
                message,
                retry_required=True,
            )

        decision_effects.apply(attempt, effects)
        case_effects.apply_case_effects(context, decision)
        event_type = (
            "PROHIBITED_DECISION_SELECTED"
            if decision.prohibited_conduct
            else "DECISION_SELECTED"
        )
        message = decision_effects.format_feedback(decision, effects)
        if evidence_override:
            labels = _override_evidence_labels(missing_evidence)
            if labels:
                message = f"{message} | Override de evidencia: {', '.join(labels)}"
        attempt.current_node = decision.target_node
        _save_event(
            attempt,
            event_type,
            decision.source_node,
            decision,
            effects.score_delta,
            effects.stress_delta,
            message,
        )
        _save_event(attempt, "NODE_ENTERED", decision.target_node, None, 0, 0, "Nodo visitado")
        if decision.target_node.terminal_node:
            now = timezone.now()
            attempt.status = "COMPLETED"
            attempt.ended_at = now
            attempt.locked_at = now
            _lock_reflections(attempt)
        attempt.save()
        if attempt.status == "COMPLETED":
            _save_event(
                attempt,
                "ATTEMPT_COMPLETED",
                decision.target_node,
                None,
                0,
                0,
                "Intento finalizado",
            )
            from apps.progression.services import record_case_completion
            record_case_completion(
                attempt.student_id,
                attempt.case_version.simulation_case_id,
            )
        return dto.feedback_dto(decision, effects, message)

    result = mutate_world_state(authorized.id, mutation)
    return dto.attempt_state(result.attempt, attempt_token, result.value)
```

Así Task 1 deja todos los writers bajo el primitive; Task 3 reemplaza únicamente la semántica legacy por revisión, receipt y fail-forward.

- [ ] **Step 6: Añadir gate estático de writers y ejecutar**

```python
def test_only_mutation_service_writes_world_state():
    import re
    from pathlib import Path

    services = Path(__file__).resolve().parents[1] / "services"
    offenders = []
    for path in services.glob("*.py"):
        if path.name == "world_state_mutation.py":
            continue
        source = path.read_text(encoding="utf-8")
        patterns = (
            r"AttemptWorldState\.objects\.(?:create|update|update_or_create|get_or_create)",
            r"\.flags_json\s*=",
            r"\b(?:state|world_state)\.save\s*\(",
        )
        if any(re.search(pattern, source) for pattern in patterns):
            offenders.append(path.name)
    assert offenders == []
```

Run: `npm run test:backend -- apps/simulation/tests/test_world_state_mutation.py apps/simulation/tests/test_world.py -q`

Expected: PASS; el estado existe sin `GET /world`, el fingerprint es estable y no hay writers directos.

- [ ] **Step 7: Commit**

```powershell
git add backend_django/apps/simulation/services/world_state_mutation.py `
  backend_django/apps/simulation/tests/conftest.py `
  backend_django/apps/simulation/tests/concurrency_helpers.py `
  backend_django/apps/simulation/tests/test_world_state_mutation.py `
  backend_django/apps/simulation/services/game_service.py `
  backend_django/apps/simulation/services/world_service.py `
  backend_django/apps/simulation/services/case_effects.py `
  backend_django/apps/simulation/tests/test_world.py
git commit -m "refactor(simulation): serializar mutaciones del mundo"
```

### Task 2: Autorar actor, relación, reacción y tono por opción

**Files:**
- Create: `backend_django/apps/simulation/services/clinical_consequence.py`
- Create: `backend_django/apps/simulation/tests/test_case_consequences.py`
- Modify: `backend_django/apps/simulation/services/case_effects.py`
- Modify: `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`

- [ ] **Step 1: Escribir tests rojos del catálogo exacto**

```python
# backend_django/apps/simulation/tests/test_case_consequences.py
import pytest

from apps.simulation.models import DecisionOption, DialogueChoice, MapObject
from apps.simulation.services.case_effects import (
    CONSEQUENCE_ACTOR_BY_OPTION_KEY,
    INITIAL_NPC_STATES,
    NPC_ACTOR_KEYS,
    NPC_STATE_KEYS,
    OPTION_EFFECTS,
    RELATION_DELTA_BY_OPTION_KEY,
    initial_npc_states,
)
from apps.simulation.services.clinical_consequence import derive_consequence


EXPECTED_ACTORS = {
    "h1-noticia-sin-protocolo": "familia-duelo",
    "h1-pap-contencion": "familia-duelo",
    "h1-interrogar-victima": "familia-duelo",
    "h2-solo-459": "psicologa-acompanante",
    "h2-459-1257": "psicologa-acompanante",
    "h2-459-1448": "psicologa-acompanante",
    "h3-parcial-disonancia": "psicologa-acompanante",
    "h3-pap-epicee": "psicologa-acompanante",
    "h3-epicee-ciclo": "psicologa-acompanante",
    "h3-integral-psicosocial": "psicologa-acompanante",
    "c1-mediacion-perdon": "sobreviviente-consulta",
    "c1-riesgo-proteccion-derechos": "sobreviviente-consulta",
    "c1-patrones-infancia": "sobreviviente-consulta",
    "c2-2126-1098-1257": "profesional-psicosocial",
    "c2-1098-1257": "profesional-psicosocial",
    "c2-eje-1448": "profesional-psicosocial",
    "c3-parcial-clinica": "profesional-psicosocial",
    "c3-valoracion-dependientes": "profesional-psicosocial",
    "c3-integral-derechos": "profesional-psicosocial",
}

EXPECTED_INITIAL_NPC_STATES = {
    "familia-duelo": {
        "trust": 46, "tension": 64, "openness": 38, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "psicologa-acompanante": {
        "trust": 58, "tension": 42, "openness": 60, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "sobreviviente-consulta": {
        "trust": 34, "tension": 72, "openness": 30, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
    "profesional-psicosocial": {
        "trust": 62, "tension": 38, "openness": 66, "available": True,
        "emotion": "neutral", "pose": "idle", "consequenceId": None,
    },
}


@pytest.mark.django_db
def test_every_canonical_option_has_an_authored_actor_in_every_playable_dialogue_scene(
    case_version,
):
    decisions = DecisionOption.objects.filter(case_version=case_version)
    assert set(CONSEQUENCE_ACTOR_BY_OPTION_KEY) == set(OPTION_EFFECTS)
    assert CONSEQUENCE_ACTOR_BY_OPTION_KEY == EXPECTED_ACTORS
    assert len(EXPECTED_ACTORS) == 19
    for decision in decisions:
        actor_key = CONSEQUENCE_ACTOR_BY_OPTION_KEY[decision.option_key]
        scene_map_ids = set(
            DialogueChoice.objects.filter(decision_option=decision)
            .values_list("dialogue_tree__scene_map_id", flat=True)
        )
        assert scene_map_ids, decision.option_key
        for scene_map_id in scene_map_ids:
            assert MapObject.objects.filter(
                scene_map_id=scene_map_id,
                object_key=actor_key,
                object_type="PERSON",
                visible=True,
            ).exists(), (decision.option_key, actor_key, scene_map_id)


def test_initial_npc_states_are_complete_bounded_and_fresh():
    first = initial_npc_states()
    second = initial_npc_states()

    assert first == EXPECTED_INITIAL_NPC_STATES == INITIAL_NPC_STATES
    assert set(first) == set(NPC_ACTOR_KEYS) == set(EXPECTED_ACTORS.values())
    for state in first.values():
        assert set(state) == set(NPC_STATE_KEYS)
        assert all(
            isinstance(state[field], int)
            and not isinstance(state[field], bool)
            and 0 <= state[field] <= 100
            for field in ("trust", "tension", "openness")
        )
        assert state["available"] is True
        assert state["pose"] == "idle"
        assert state["consequenceId"] is None

    first["familia-duelo"]["trust"] = 0
    assert second["familia-duelo"]["trust"] == 46


def test_all_19_options_have_one_nonzero_authored_relational_delta():
    assert set(RELATION_DELTA_BY_OPTION_KEY) == set(EXPECTED_ACTORS) == set(OPTION_EFFECTS)
    assert len(RELATION_DELTA_BY_OPTION_KEY) == 19
    for option_key, delta in RELATION_DELTA_BY_OPTION_KEY.items():
        assert set(delta) == {"trust", "tension", "openness", "available"}
        assert all(
            isinstance(delta[field], int)
            and not isinstance(delta[field], bool)
            and -100 <= delta[field] <= 100
            for field in ("trust", "tension", "openness")
        ), option_key
        assert any(delta[field] != 0 for field in ("trust", "tension", "openness")), option_key
        assert delta["available"] is None or isinstance(delta["available"], bool)


@pytest.mark.parametrize(
    ("option_key", "tone", "emotion", "repair_available"),
    [
        ("h1-pap-contencion", "relief", "receptive", False),
        ("h2-solo-459", "steady", "calm", False),
        ("h3-parcial-disonancia", "tension", "worried", True),
        ("h1-noticia-sin-protocolo", "rupture", "closed", True),
    ],
)
@pytest.mark.django_db
def test_consequence_is_semantic_and_actor_authored(
    case_version, option_key, tone, emotion, repair_available,
):
    decision = DecisionOption.objects.get(case_version=case_version, option_key=option_key)
    result = derive_consequence(decision)

    assert result["actorKey"] == EXPECTED_ACTORS[option_key]
    assert result["tone"] == tone
    assert result["emotion"] == emotion
    assert result["pose"] == "react"
    assert result["relationDelta"] == RELATION_DELTA_BY_OPTION_KEY[option_key]
    assert result["repairAvailable"] is repair_available
    assert result["announcement"]
    assert "correct" not in result["announcement"].lower()
    assert "audioCue" not in result
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py -q`

Expected: FAIL porque el catálogo y `clinical_consequence.py` aún no existen.

- [ ] **Step 3: Añadir el catálogo autorado por option key**

```python
# backend_django/apps/simulation/services/case_effects.py
CONSEQUENCE_ACTOR_BY_OPTION_KEY = {
    "h1-noticia-sin-protocolo": "familia-duelo",
    "h1-pap-contencion": "familia-duelo",
    "h1-interrogar-victima": "familia-duelo",
    "h2-solo-459": "psicologa-acompanante",
    "h2-459-1257": "psicologa-acompanante",
    "h2-459-1448": "psicologa-acompanante",
    "h3-parcial-disonancia": "psicologa-acompanante",
    "h3-pap-epicee": "psicologa-acompanante",
    "h3-epicee-ciclo": "psicologa-acompanante",
    "h3-integral-psicosocial": "psicologa-acompanante",
    "c1-mediacion-perdon": "sobreviviente-consulta",
    "c1-riesgo-proteccion-derechos": "sobreviviente-consulta",
    "c1-patrones-infancia": "sobreviviente-consulta",
    "c2-2126-1098-1257": "profesional-psicosocial",
    "c2-1098-1257": "profesional-psicosocial",
    "c2-eje-1448": "profesional-psicosocial",
    "c3-parcial-clinica": "profesional-psicosocial",
    "c3-valoracion-dependientes": "profesional-psicosocial",
    "c3-integral-derechos": "profesional-psicosocial",
}

RELATION_DELTA_BY_OPTION_KEY = {
    "h1-noticia-sin-protocolo": {
        "trust": -22, "tension": 24, "openness": -18, "available": None,
    },
    "h1-pap-contencion": {
        "trust": 16, "tension": -20, "openness": 14, "available": None,
    },
    "h1-interrogar-victima": {
        "trust": -18, "tension": 20, "openness": -16, "available": None,
    },
    "h2-solo-459": {
        "trust": 2, "tension": -4, "openness": 2, "available": None,
    },
    "h2-459-1257": {
        "trust": 10, "tension": -10, "openness": 8, "available": None,
    },
    "h2-459-1448": {
        "trust": -8, "tension": 10, "openness": -6, "available": None,
    },
    "h3-parcial-disonancia": {
        "trust": -10, "tension": 14, "openness": -8, "available": None,
    },
    "h3-pap-epicee": {
        "trust": 5, "tension": -7, "openness": 6, "available": None,
    },
    "h3-epicee-ciclo": {
        "trust": 6, "tension": -6, "openness": 5, "available": None,
    },
    "h3-integral-psicosocial": {
        "trust": 13, "tension": -15, "openness": 12, "available": None,
    },
    "c1-mediacion-perdon": {
        "trust": -18, "tension": 22, "openness": -18, "available": None,
    },
    "c1-riesgo-proteccion-derechos": {
        "trust": 16, "tension": -18, "openness": 15, "available": None,
    },
    "c1-patrones-infancia": {
        "trust": -8, "tension": 10, "openness": -7, "available": None,
    },
    "c2-2126-1098-1257": {
        "trust": 12, "tension": -12, "openness": 11, "available": None,
    },
    "c2-1098-1257": {
        "trust": 6, "tension": -7, "openness": 6, "available": None,
    },
    "c2-eje-1448": {
        "trust": -9, "tension": 11, "openness": -8, "available": None,
    },
    "c3-parcial-clinica": {
        "trust": -10, "tension": 12, "openness": -9, "available": None,
    },
    "c3-valoracion-dependientes": {
        "trust": 5, "tension": -6, "openness": 5, "available": None,
    },
    "c3-integral-derechos": {
        "trust": 14, "tension": -16, "openness": 14, "available": None,
    },
}

_canonical_option_keys = set(OPTION_EFFECTS)
for catalog_name, catalog in (
    ("consequenceActorKey", CONSEQUENCE_ACTOR_BY_OPTION_KEY),
    ("relationDelta", RELATION_DELTA_BY_OPTION_KEY),
):
    if set(catalog) != _canonical_option_keys:
        missing = _canonical_option_keys ^ set(catalog)
        raise RuntimeError(f"Catálogo {catalog_name} incompleto: {sorted(missing)}")

for option_key, delta in RELATION_DELTA_BY_OPTION_KEY.items():
    if set(delta) != {"trust", "tension", "openness", "available"}:
        raise RuntimeError(f"Delta relacional mal formado: {option_key}")
    if not any(delta[field] != 0 for field in ("trust", "tension", "openness")):
        raise RuntimeError(f"Delta relacional nulo: {option_key}")
```

No usar `option_key.split('-')[0]`, `source_node.node_key`, un delta derivado solo de severidad ni un fallback de actor. Una opción nueva sin actor o sin delta explícito no arranca y no se publica. Los números anteriores son contenido clínico autorado: el gate SME final debe revisarlos junto con actor, texto, tono y efecto; no se recalculan desde score o clasificación.

- [ ] **Step 4: Implementar el resolver semántico**

```python
# backend_django/apps/simulation/services/clinical_consequence.py
from __future__ import annotations

import json
from typing import Literal, TypedDict

from django.utils import timezone

from .case_effects import (
    CONSEQUENCE_ACTOR_BY_OPTION_KEY,
    NPC_ACTOR_KEYS,
    NPC_STATE_KEYS,
    RELATION_DELTA_BY_OPTION_KEY,
    SEVERITY_ACCEPTABLE,
    SEVERITY_CRITICAL,
    SEVERITY_RECOMMENDED,
    SEVERITY_RISKY,
    ensure_npc_states,
    option_severity,
    validated_npc_state,
)

ConsequenceToneValue = Literal["relief", "steady", "tension", "rupture"]
NpcActorKey = Literal[
    "familia-duelo",
    "psicologa-acompanante",
    "sobreviviente-consulta",
    "profesional-psicosocial",
]


class RelationDelta(TypedDict):
    trust: int
    tension: int
    openness: int
    available: bool | None


class RelationState(TypedDict):
    trust: int
    tension: int
    openness: int
    available: bool


class NpcRelationalState(RelationState):
    emotion: str
    pose: Literal["idle", "react"]
    consequenceId: str | None


class ConsequenceSpec(TypedDict):
    actorKey: NpcActorKey
    emotion: str
    pose: Literal["react"]
    tone: ConsequenceToneValue
    announcement: str
    relationDelta: RelationDelta
    repairAvailable: bool
    repairPrompt: str | None


class AppliedConsequence(ConsequenceSpec):
    id: str
    optionKey: str
    sourceNodeId: int
    repaired: bool
    relationState: RelationState
    occurredAt: str


REACTION_BY_SEVERITY = {
    SEVERITY_RECOMMENDED: (
        "receptive", "relief", False,
        "La persona muestra mayor apertura y seguridad en la relación.",
    ),
    SEVERITY_ACCEPTABLE: (
        "calm", "steady", False,
        "La escena se estabiliza, aunque todavía quedan necesidades por atender.",
    ),
    SEVERITY_RISKY: (
        "worried", "tension", True,
        "La persona duda y la tensión aumenta ante el impacto de la intervención.",
    ),
    SEVERITY_CRITICAL: (
        "closed", "rupture", True,
        "La persona se cierra y la confianza se fractura de forma visible.",
    ),
}

if {value[0] for value in REACTION_BY_SEVERITY.values()} != {
    "receptive", "calm", "worried", "closed",
}:
    raise RuntimeError(
        "REACTION_BY_SEVERITY debe coincidir con clinicalEmotionPortraitStates v1"
    )


def derive_consequence(decision) -> ConsequenceSpec:
    actor_key = CONSEQUENCE_ACTOR_BY_OPTION_KEY[decision.option_key]
    emotion, tone, repair_available, announcement = REACTION_BY_SEVERITY[
        option_severity(decision)
    ]
    return {
        "actorKey": actor_key,
        "emotion": emotion,
        "pose": "react",
        "tone": tone,
        "announcement": announcement,
        "relationDelta": dict(RELATION_DELTA_BY_OPTION_KEY[decision.option_key]),
        "repairAvailable": repair_available,
        "repairPrompt": (
            "Reconoce el impacto y reformula la intervención."
            if repair_available
            else None
        ),
    }


def _clamp_relation(value: int) -> int:
    return max(0, min(100, value))


def apply_relational_delta(
    npc_states: dict,
    spec: ConsequenceSpec,
    *,
    consequence_id: str,
) -> NpcRelationalState:
    actor_key = spec["actorKey"]
    current = npc_states[actor_key]
    delta = spec["relationDelta"]
    available_override = delta["available"]
    updated: NpcRelationalState = {
        "trust": _clamp_relation(current["trust"] + delta["trust"]),
        "tension": _clamp_relation(current["tension"] + delta["tension"]),
        "openness": _clamp_relation(current["openness"] + delta["openness"]),
        "available": (
            current["available"]
            if available_override is None
            else available_override
        ),
        "emotion": spec["emotion"],
        "pose": "react",
        "consequenceId": consequence_id,
    }
    npc_states[actor_key] = updated
    return updated


def consequence_event_detail(
    message: str,
    consequence: AppliedConsequence,
) -> str:
    relation = consequence["relationState"]
    payload = {
        "schemaVersion": 1,
        "message": message,
        "npcState": {
            "actorKey": consequence["actorKey"],
            "trust": relation["trust"],
            "tension": relation["tension"],
            "openness": relation["openness"],
            "available": relation["available"],
            "emotion": consequence["emotion"],
            "pose": consequence["pose"],
            "consequenceId": consequence["id"],
        },
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def parse_consequence_event_detail(raw: str) -> tuple[str, dict]:
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Detalle de consecuencia inválido") from exc
    if not isinstance(payload, dict) or set(payload) != {
        "schemaVersion", "message", "npcState",
    } or payload["schemaVersion"] != 1:
        raise ValueError("Envelope de consecuencia inválido")
    message = payload["message"]
    npc_state = payload["npcState"]
    if not isinstance(message, str) or not message.strip() or not isinstance(npc_state, dict):
        raise ValueError("Contenido de consecuencia inválido")
    actor_key = npc_state.get("actorKey")
    if actor_key not in NPC_ACTOR_KEYS:
        raise ValueError("Actor de consecuencia inválido")
    if set(npc_state) != {"actorKey"} | set(NPC_STATE_KEYS):
        raise ValueError("Estado de consecuencia incompleto")
    state = validated_npc_state(
        actor_key,
        {key: value for key, value in npc_state.items() if key != "actorKey"},
    )
    return message, {"actorKey": actor_key, **state}


def apply_consequence(
    context,
    decision,
    *,
    decision_revision: int,
) -> AppliedConsequence:
    spec = derive_consequence(decision)
    pending = context.flags.get("pendingRepair")
    same_pending_node = bool(
        isinstance(pending, dict)
        and pending.get("sourceNodeId") == decision.source_node_id
    )
    is_bad = spec["repairAvailable"]
    repaired = bool(same_pending_node and not is_bad)
    repair_available = bool(is_bad and not same_pending_node)
    consequence_id = f"decision:{decision_revision}:{decision.option_key}"
    npc_states = ensure_npc_states(context.flags)
    npc_state = apply_relational_delta(
        npc_states,
        spec,
        consequence_id=consequence_id,
    )
    consequence = {
        **spec,
        "id": consequence_id,
        "optionKey": decision.option_key,
        "sourceNodeId": decision.source_node_id,
        "repaired": repaired,
        "repairAvailable": repair_available,
        "repairPrompt": spec["repairPrompt"] if repair_available else None,
        "relationState": {
            field: npc_state[field]
            for field in ("trust", "tension", "openness", "available")
        },
        "occurredAt": timezone.now().isoformat(),
    }

    context.flags["lastConsequence"] = consequence
    if repair_available:
        context.flags["pendingRepair"] = {
            "sourceNodeId": decision.source_node_id,
            "actorKey": spec["actorKey"],
            "prompt": spec["repairPrompt"],
            "consequenceId": consequence["id"],
        }
    elif same_pending_node:
        context.flags.pop("pendingRepair", None)
    return consequence
```

`ensure_npc_states`, `apply_case_effects`, `apply_relational_delta`, el evento con su snapshot relacional, `decisionRevision`, el receipt y `pendingRepair` se ejecutan dentro del mismo callback de `mutate_world_state`. `apply_relational_delta` solo se llama en esa escritura autoritativa: serializers, hydration, timeline, checkpoint y frontend leen snapshots persistidos. El timeline decodifica `AttemptEvent.detail` mediante `parse_consequence_event_detail`; nunca recalcula una relación desde el catálogo.

- [ ] **Step 5: Validar el catálogo durante el seed**

En `seed_caso_pdf.py`, después de crear mapas/objetos y antes de publicar la versión:

```python
from apps.simulation.services.case_effects import (
    CONSEQUENCE_ACTOR_BY_OPTION_KEY,
    NPC_ACTOR_KEYS,
    RELATION_DELTA_BY_OPTION_KEY,
)


def _validate_consequence_actors(version):
    decisions = DecisionOption.objects.filter(case_version=version)
    option_keys = set(decisions.values_list("option_key", flat=True))
    if option_keys != set(CONSEQUENCE_ACTOR_BY_OPTION_KEY):
        raise ValueError("Catálogo de actores no coincide con las 19 opciones sembradas")
    if option_keys != set(RELATION_DELTA_BY_OPTION_KEY):
        raise ValueError("Catálogo de deltas no coincide con las 19 opciones sembradas")
    if set(CONSEQUENCE_ACTOR_BY_OPTION_KEY.values()) != set(NPC_ACTOR_KEYS):
        raise ValueError("Los cuatro NPC relacionales no están cubiertos")
    for decision in decisions:
        actor_key = CONSEQUENCE_ACTOR_BY_OPTION_KEY.get(decision.option_key)
        if not actor_key:
            raise ValueError(f"Falta consequenceActorKey para {decision.option_key}")
        scene_map_ids = set(
            DialogueChoice.objects.filter(decision_option=decision)
            .values_list("dialogue_tree__scene_map_id", flat=True)
        )
        if not scene_map_ids:
            raise ValueError(f"{decision.option_key} no tiene diálogo jugable")
        for scene_map_id in scene_map_ids:
            exists = MapObject.objects.filter(
                scene_map_id=scene_map_id,
                object_key=actor_key,
                object_type="PERSON",
                visible=True,
            ).exists()
            if not exists:
                raise ValueError(
                    f"{decision.option_key} referencia actor ausente {actor_key} "
                    f"en scene_map {scene_map_id}"
                )
        delta = RELATION_DELTA_BY_OPTION_KEY[decision.option_key]
        if not any(delta[field] != 0 for field in ("trust", "tension", "openness")):
            raise ValueError(f"{decision.option_key} no cambia ninguna relación")


_validate_consequence_actors(version)
```

- [ ] **Step 6: Ejecutar tests y seed aislado**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py -q`

Expected: PASS, 7 tests; estado inicial exacto, catálogo 19/19 y cada delta no nulo quedan cubiertos.

Run: `npm run test:backend -- apps/simulation/tests/test_caso_pdf.py -q`

Expected: PASS; las 19 opciones canónicas resuelven actor real (H3 tiene cuatro opciones).

- [ ] **Step 7: Commit**

```powershell
git add backend_django/apps/simulation/services/clinical_consequence.py `
  backend_django/apps/simulation/services/case_effects.py `
  backend_django/apps/simulation/management/commands/seed_caso_pdf.py `
  backend_django/apps/simulation/tests/test_case_consequences.py
git commit -m "feat(simulation): autorar consecuencias por decision"
```

### Task 3: Hacer la decisión fail-forward, revisada e idempotente

**Files:**
- Modify: `backend_django/apps/simulation/serializers/requests.py`
- Modify: `backend_django/apps/simulation/views/game_views.py`
- Modify: `backend_django/apps/simulation/services/game_service.py`
- Modify: `backend_django/apps/simulation/serializers/game_dtos.py`
- Modify: `backend_django/apps/simulation/tests/test_case_consequences.py`
- Modify: `backend_django/apps/simulation/tests/test_game.py`
- Modify: `backend_django/apps/simulation/tests/test_world_state_mutation.py`

- [ ] **Step 1: Escribir tests rojos de primera decisión, replay y conflicto**

```python
import json
from copy import deepcopy

from apps.simulation.models import AttemptEvent, AttemptWorldState
from apps.simulation.services import game_service
from apps.simulation.services.clinical_consequence import (
    parse_consequence_event_detail,
)
from apps.simulation.tests.concurrency_helpers import run_concurrently
from shared.jsonutils import read_map


def choose(started_case, option, *, revision, key):
    return game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        option.id,
        started_case.actor,
        decision_revision=revision,
        idempotency_key=key,
    )


def decision_payload(started_case, option, revision=0, key="decision-h1-0001"):
    return {
        "attemptToken": started_case.raw_token,
        "decisionOptionId": option.id,
        "decisionRevision": revision,
        "idempotencyKey": key,
        "evidenceOverride": False,
        "missingEvidence": [],
    }


@pytest.mark.django_db
def test_first_decision_works_without_get_world(started_case, h1_critical):
    result = game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_critical.id,
        started_case.actor,
        decision_revision=0,
        idempotency_key="decision-h1-0001",
    )

    assert result["decisionRevision"] == 1
    assert result["currentNode"]["id"] == h1_critical.source_node_id
    assert result["consequence"]["repairAvailable"] is True
    assert result["accumulatedScore"] == -15
    assert result["stressIndex"] == 65


@pytest.mark.django_db
def test_adequate_second_decision_repairs_without_erasing_first_effect(
    started_case,
    h1_critical,
    h1_adequate,
):
    game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_critical.id,
        started_case.actor,
        decision_revision=0,
        idempotency_key="repair-h1-first",
    )
    repaired = game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_adequate.id,
        started_case.actor,
        decision_revision=1,
        idempotency_key="repair-h1-second",
    )

    assert repaired["currentNode"]["id"] == h1_adequate.target_node_id
    assert repaired["decisionRevision"] == 2
    assert repaired["accumulatedScore"] == -5
    assert repaired["stressIndex"] == 60
    assert repaired["metrics"]["userTrust"] == 28
    assert repaired["metrics"]["victimRisk"] == 72
    assert repaired["clinicalState"]["papApplied"] is True
    assert repaired["consequence"]["repaired"] is True
    assert repaired["consequence"]["repairAvailable"] is False
    flags = read_map(AttemptWorldState.objects.get(attempt=started_case.attempt).flags_json)
    assert "pendingRepair" not in flags
    assert flags["npcStates"]["familia-duelo"] == {
        "trust": 40,
        "tension": 68,
        "openness": 34,
        "available": True,
        "emotion": "receptive",
        "pose": "react",
        "consequenceId": "decision:2:h1-pap-contencion",
    }
    assert AttemptEvent.objects.filter(
        attempt=started_case.attempt,
        event_type="DECISION_REPAIRED",
    ).count() == 1


@pytest.mark.django_db
def test_second_critical_decision_advances_with_both_effects_and_no_third_try(
    started_case,
    h1_critical,
    h1_second_critical,
):
    game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_critical.id,
        started_case.actor,
        decision_revision=0,
        idempotency_key="unrepaired-h1-first",
    )
    unrepaired = game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_second_critical.id,
        started_case.actor,
        decision_revision=1,
        idempotency_key="unrepaired-h1-second",
    )

    assert unrepaired["currentNode"]["id"] == h1_second_critical.target_node_id
    assert unrepaired["decisionRevision"] == 2
    assert unrepaired["accumulatedScore"] == -30
    assert unrepaired["stressIndex"] == 100
    assert unrepaired["metrics"]["userTrust"] == 0
    assert unrepaired["metrics"]["victimRisk"] == 100
    assert unrepaired["clinicalState"]["papApplied"] is False
    assert unrepaired["consequence"]["repaired"] is False
    assert unrepaired["consequence"]["repairAvailable"] is False
    flags = read_map(AttemptWorldState.objects.get(attempt=started_case.attempt).flags_json)
    assert "pendingRepair" not in flags
    assert flags["npcStates"]["familia-duelo"] == {
        "trust": 6,
        "tension": 100,
        "openness": 4,
        "available": True,
        "emotion": "closed",
        "pose": "react",
        "consequenceId": "decision:2:h1-interrogar-victima",
    }


@pytest.mark.django_db(transaction=True)
def test_same_key_and_payload_is_exactly_once(started_case, h1_critical):
    call = lambda: game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        h1_critical.id,
        started_case.actor,
        decision_revision=0,
        idempotency_key="decision-h1-race",
    )
    first, second = run_concurrently(call, call)

    assert first == second
    event = AttemptEvent.objects.get(
        attempt=started_case.attempt,
        event_type="DECISION_REPAIR_AVAILABLE",
    )
    event_message, event_npc_state = parse_consequence_event_detail(event.detail)
    assert event_message
    assert event_npc_state == {
        "actorKey": "familia-duelo",
        "trust": 24, "tension": 88, "openness": 20, "available": True,
        "emotion": "closed", "pose": "react",
        "consequenceId": "decision:1:h1-noticia-sin-protocolo",
    }
    started_case.attempt.refresh_from_db()
    assert started_case.attempt.accumulated_score == -15
    assert started_case.attempt.stress_index == 65
    flags = read_map(AttemptWorldState.objects.get(attempt=started_case.attempt).flags_json)
    assert flags["npcStates"]["familia-duelo"]["trust"] == 24
    assert flags["npcStates"]["familia-duelo"]["tension"] == 88
    assert flags["npcStates"]["familia-duelo"]["openness"] == 20


@pytest.mark.django_db
def test_decision_receipt_never_persists_token_and_replay_uses_presented_token(
    started_case,
    h1_critical,
):
    key = "decision-token-free-receipt"
    first = choose(started_case, h1_critical, revision=0, key=key)
    state = AttemptWorldState.objects.get(attempt=started_case.attempt)
    first_raw_flags = state.flags_json
    first_receipt = read_map(first_raw_flags)["decisionReceipts"][key]
    first_serialized_receipt = json.dumps(first_receipt, sort_keys=True)
    relation_before_replay = deepcopy(read_map(first_raw_flags)["npcStates"])

    assert first["attemptToken"] == started_case.raw_token
    assert started_case.raw_token not in first_raw_flags
    assert started_case.raw_token not in first_serialized_receipt
    assert "attemptToken" not in first_raw_flags
    assert "attemptToken" not in first_serialized_receipt

    started_case.attempt.refresh_from_db()
    presented_token = game_service._reissue_token(started_case.attempt)
    replay = game_service.choose_decision(
        started_case.attempt.id,
        presented_token,
        h1_critical.id,
        started_case.actor,
        decision_revision=0,
        idempotency_key=key,
    )

    first_body = deepcopy(first)
    replay_body = deepcopy(replay)
    first_body.pop("attemptToken")
    replay_body.pop("attemptToken")
    assert replay["attemptToken"] == presented_token
    assert replay_body == first_body
    assert AttemptEvent.objects.filter(
        attempt=started_case.attempt,
        event_type="DECISION_REPAIR_AVAILABLE",
    ).count() == 1

    state.refresh_from_db()
    replay_raw_flags = state.flags_json
    replay_receipt = read_map(replay_raw_flags)["decisionReceipts"][key]
    replay_serialized_receipt = json.dumps(replay_receipt, sort_keys=True)
    assert read_map(replay_raw_flags)["npcStates"] == relation_before_replay
    assert replay["consequence"]["relationalState"] == {
        "trust": 24, "tension": 88, "openness": 20, "available": True,
    }
    assert started_case.raw_token not in replay_raw_flags
    assert presented_token not in replay_raw_flags
    assert started_case.raw_token not in replay_serialized_receipt
    assert presented_token not in replay_serialized_receipt
    assert "attemptToken" not in replay_raw_flags
    assert "attemptToken" not in replay_serialized_receipt


@pytest.mark.django_db
def test_terminal_decision_receipt_replays_after_completion(
    started_case,
    case_version,
    completed_repaired_case,
):
    final_option = DecisionOption.objects.get(
        case_version=case_version,
        option_key="c3-integral-derechos",
    )

    replay = game_service.choose_decision(
        started_case.attempt.id,
        started_case.raw_token,
        final_option.id,
        started_case.actor,
        decision_revision=6,
        idempotency_key="fixture:6:c3-integral-derechos",
    )

    assert replay == completed_repaired_case
    assert AttemptEvent.objects.filter(
        attempt=started_case.attempt,
        event_type="ATTEMPT_COMPLETED",
    ).count() == 1


@pytest.mark.django_db
def test_same_key_with_different_payload_returns_409(api_client, started_case, h1_critical, h1_adequate):
    url = f"/api/simulation/attempts/{started_case.attempt.id}/decisions"
    api_client.force_authenticate(started_case.actor)
    first = api_client.post(
        url,
        decision_payload(started_case, h1_critical),
        format="json",
    )
    changed = decision_payload(started_case, h1_adequate)
    second = api_client.post(url, changed, format="json")

    assert first.status_code == 200
    assert second.status_code == 409
    assert "idempotencyKey" in str(second.data)


@pytest.mark.django_db(transaction=True)
def test_two_keys_at_same_revision_apply_only_one(started_case, h1_critical, h1_adequate):
    def call(option, key):
        return game_service.choose_decision(
            started_case.attempt.id,
            started_case.raw_token,
            option.id,
            started_case.actor,
            decision_revision=0,
            idempotency_key=key,
        )

    outcomes = []
    for operation in (
        lambda: call(h1_critical, "decision-race-a"),
        lambda: call(h1_adequate, "decision-race-b"),
    ):
        outcomes.append(operation)

    results = run_concurrently(*[
        lambda op=operation: capture_conflict(op)
        for operation in outcomes
    ])
    assert sorted(result[0] for result in results) == ["conflict", "ok"]
    assert AttemptEvent.objects.filter(
        attempt=started_case.attempt,
        event_type__in=[
            "DECISION_SELECTED",
            "DECISION_REPAIR_AVAILABLE",
            "PROHIBITED_DECISION_SELECTED",
        ],
    ).count() == 1
```

Definir en el mismo test, sin ocultar errores no esperados:

```python
from apps.simulation.services.game_service import DecisionConflict


def capture_conflict(operation):
    try:
        return "ok", operation()
    except DecisionConflict as exc:
        return "conflict", str(exc.detail)
```

- [ ] **Step 2: Ejecutar y confirmar los fallos**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py -q`

Expected: FAIL por argumentos y campos inexistentes; la primera respuesta mala todavía no aplica efectos.

- [ ] **Step 3: Validar el request y pasarlo desde la vista**

```python
# backend_django/apps/simulation/serializers/requests.py
class SelectDecisionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    decisionOptionId = serializers.IntegerField(min_value=1)
    decisionRevision = serializers.IntegerField(min_value=0)
    idempotencyKey = serializers.RegexField(
        regex=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
        max_length=128,
    )
    evidenceOverride = serializers.BooleanField(required=False, default=False)
    missingEvidence = serializers.ListField(
        child=serializers.CharField(max_length=160),
        required=False,
        default=list,
        max_length=8,
    )
```

```python
# backend_django/apps/simulation/views/game_views.py, DecisionsView.post
state = game_service.choose_decision(
    attempt_id,
    ser.validated_data["attemptToken"],
    ser.validated_data["decisionOptionId"],
    request.user,
    decision_revision=ser.validated_data["decisionRevision"],
    idempotency_key=ser.validated_data["idempotencyKey"],
    evidence_override=ser.validated_data["evidenceOverride"],
    missing_evidence=ser.validated_data["missingEvidence"],
)
```

- [ ] **Step 4: Implementar conflicto, fingerprint y receipt**

```python
# backend_django/apps/simulation/services/game_service.py
from copy import deepcopy

from rest_framework.exceptions import APIException

from .clinical_consequence import apply_consequence, consequence_event_detail
from .world_state_mutation import (
    canonical_request_fingerprint,
    mutate_world_state,
)


class DecisionConflict(APIException):
    status_code = 409
    default_code = "decision_conflict"
    default_detail = "La decisión ya cambió; recarga el estado autoritativo."


def _decision_fingerprint_payload(
    decision_option_id,
    decision_revision,
    evidence_override,
    missing_evidence,
):
    return {
        "decisionOptionId": int(decision_option_id),
        "decisionRevision": int(decision_revision),
        "evidenceOverride": bool(evidence_override),
        "missingEvidence": _override_evidence_labels(missing_evidence),
    }


def _read_receipts(flags):
    value = flags.get("decisionReceipts")
    return value if isinstance(value, dict) else {}


DECISION_RECEIPT_BODY_FIELDS = (
    "attemptId",
    "caseVersionId",
    "caseTitle",
    "status",
    "accumulatedScore",
    "stressIndex",
    "metrics",
    "clinicalState",
    "currentNode",
    "feedback",
    "completionReport",
    "supportResources",
    "decisionRevision",
    "consequence",
)


def _decision_receipt_body(response):
    expected = set(DECISION_RECEIPT_BODY_FIELDS) | {"attemptToken"}
    if set(response) != expected:
        raise RuntimeError("Contrato de attempt_state cambió sin actualizar el receipt")
    return {
        field: deepcopy(response[field])
        for field in DECISION_RECEIPT_BODY_FIELDS
    }


def _response_from_receipt(receipt, presented_token):
    body = receipt.get("body")
    if (
        not isinstance(body, dict)
        or set(body) != set(DECISION_RECEIPT_BODY_FIELDS)
        or "attemptToken" in body
    ):
        raise DecisionConflict("Receipt idempotente inválido")
    return {**deepcopy(body), "attemptToken": presented_token}


def _store_receipt(flags, key, fingerprint, response):
    receipts = _read_receipts(flags)
    receipts[key] = {
        "fingerprint": fingerprint,
        "body": _decision_receipt_body(response),
    }
    while len(receipts) > 32:
        receipts.pop(next(iter(receipts)))
    flags["decisionReceipts"] = receipts
```

La allowlist coincide exactamente con el contrato de `attempt_state` salvo `attemptToken`; no reemplazarla por `deepcopy(response)` seguido de `pop`, porque un campo secreto futuro podría persistirse por defecto. `_response_from_receipt` se ejecuta después de `_require_attempt`, recibe el `attempt_token` presentado en esa llamada y es el único lugar donde se vuelve a añadir. Si cambia `attempt_state`, el `RuntimeError` obliga a revisar explícitamente la allowlist y el test de ausencia de token.

En `game_dtos.py`, añadir el DTO de consecuencia antes de `attempt_state`:

```python
def consequence_dto(value):
    if not value:
        return None
    return {
        "id": value["id"],
        "actorKey": value["actorKey"],
        "emotion": value["emotion"],
        "pose": value["pose"],
        "tone": value["tone"],
        "announcement": value["announcement"],
        "relationDelta": {
            field: value["relationDelta"][field]
            for field in ("trust", "tension", "openness", "available")
        },
        "relationalState": {
            field: value["relationState"][field]
            for field in ("trust", "tension", "openness", "available")
        },
        "repairAvailable": bool(value["repairAvailable"]),
        "repairPrompt": value.get("repairPrompt"),
        "repaired": bool(value["repaired"]),
        "optionKey": value["optionKey"],
        "sourceNodeId": value["sourceNodeId"],
        "occurredAt": value["occurredAt"],
    }
```

Cambiar `build_completion_report(attempt, events)` a `build_completion_report(attempt, events, *, world_flags=None)` y pasar `world_flags=world_flags` a `case_effects.compute_ending`. Reemplazar `attempt_state` completo por esta variante, que proyecta el snapshot aún bloqueado sin volver a leer estado stale:

```python
def attempt_state(
    attempt,
    raw_token,
    feedback,
    events=None,
    *,
    consequence=None,
    decision_revision=None,
    world_flags=None,
):
    has_world_snapshot = isinstance(world_flags, dict)
    flags = world_flags if has_world_snapshot else {}
    revision = int(
        decision_revision
        if decision_revision is not None
        else flags.get("decisionRevision", 0)
    )
    in_progress = attempt.status == "IN_PROGRESS"
    completion_report = None
    if not in_progress:
        if events is None:
            from apps.simulation.models import AttemptEvent
            events = list(
                AttemptEvent.objects.filter(attempt_id=attempt.id)
                .order_by("occurred_at", "id")
            )
        completion_report = build_completion_report(
            attempt,
            events,
            world_flags=flags if has_world_snapshot else None,
        )
    payload = {
        "attemptId": str(attempt.id),
        "attemptToken": raw_token,
        "caseVersionId": attempt.case_version_id,
        "caseTitle": attempt.case_version.simulation_case.title,
        "status": attempt.status,
        "accumulatedScore": attempt.accumulated_score,
        "stressIndex": attempt.stress_index,
        "metrics": metrics(attempt),
        "clinicalState": (
            case_effects.clinical_state_from_flags(flags)
            if has_world_snapshot
            else case_effects.clinical_state(attempt)
        ),
        "currentNode": node_state(attempt.current_node, in_progress),
        "feedback": feedback,
        "completionReport": completion_report,
        "supportResources": (
            SAFE_EXIT_RESOURCES
            if attempt.status in ("SAFE_EXITED", "PAUSED")
            else []
        ),
        "decisionRevision": revision,
        "consequence": consequence_dto(consequence),
    }
    return payload
```

Reescribir `choose_decision` como una única llamada a `mutate_world_state`. Dentro del callback y en este orden exacto:

```python
def choose_decision(
    attempt_id,
    attempt_token,
    decision_option_id,
    actor,
    *,
    decision_revision,
    idempotency_key,
    evidence_override=False,
    missing_evidence=None,
):
    authorized = _require_attempt(attempt_id, attempt_token, actor)
    fingerprint = canonical_request_fingerprint(_decision_fingerprint_payload(
        decision_option_id,
        decision_revision,
        evidence_override,
        missing_evidence,
    ))

    def mutation(context):
        attempt = context.attempt
        if attempt.id != authorized.id:
            raise DecisionConflict()

        receipt = _read_receipts(context.flags).get(idempotency_key)
        if receipt is not None:
            if receipt.get("fingerprint") != fingerprint:
                raise DecisionConflict("idempotencyKey reutilizada con otro payload")
            return _response_from_receipt(receipt, attempt_token)

        if attempt.status != "IN_PROGRESS":
            raise DecisionConflict()

        current_revision = int(context.flags.get("decisionRevision", 0))
        if decision_revision != current_revision:
            raise DecisionConflict(
                f"decisionRevision obsoleta: {decision_revision}; actual: {current_revision}"
            )

        decision = (
            DecisionOption.objects.filter(pk=decision_option_id)
            .select_related("source_node", "target_node", "case_version")
            .first()
        )
        if decision is None:
            raise NotFound("Decisión no encontrada")
        if decision.source_node_id != attempt.current_node_id:
            raise ValidationError("La decisión no está disponible desde la escena actual")
        if decision.case_version_id != attempt.case_version_id:
            raise ValidationError("La decisión no pertenece al caso del intento")

        next_revision = current_revision + 1
        effects = decision_effects.resolve(decision)
        decision_effects.apply(attempt, effects)
        case_effects.apply_case_effects(context, decision)
        consequence = apply_consequence(
            context,
            decision,
            decision_revision=next_revision,
        )

        if consequence["repairAvailable"]:
            event_type = "DECISION_REPAIR_AVAILABLE"
        elif consequence["repaired"]:
            event_type = "DECISION_REPAIRED"
            attempt.current_node = decision.target_node
        else:
            event_type = (
                "PROHIBITED_DECISION_SELECTED"
                if decision.prohibited_conduct
                else "DECISION_SELECTED"
            )
            attempt.current_node = decision.target_node

        message = decision_effects.format_feedback(decision, effects)
        if evidence_override:
            labels = _override_evidence_labels(missing_evidence)
            if labels:
                message = f"{message} | Override de evidencia: {', '.join(labels)}"
        event_detail = consequence_event_detail(message, consequence)
        _save_event(
            attempt,
            event_type,
            decision.source_node,
            decision,
            effects.score_delta,
            effects.stress_delta,
            event_detail,
        )

        if not consequence["repairAvailable"]:
            _save_event(
                attempt,
                "NODE_ENTERED",
                decision.target_node,
                None,
                0,
                0,
                "Nodo visitado",
            )
        if attempt.current_node.terminal_node:
            now = timezone.now()
            attempt.status = "COMPLETED"
            attempt.ended_at = now
            attempt.locked_at = now
            _lock_reflections(attempt)

        context.flags["decisionRevision"] = next_revision
        attempt.save()
        if attempt.status == "COMPLETED":
            _save_event(
                attempt,
                "ATTEMPT_COMPLETED",
                decision.target_node,
                None,
                0,
                0,
                "Intento finalizado",
            )
            from apps.progression.services import record_case_completion
            record_case_completion(attempt.student_id, attempt.case_version.simulation_case_id)

        feedback = dto.feedback_dto(
            decision,
            effects,
            message,
            retry_required=consequence["repairAvailable"],
        )
        response = dto.attempt_state(
            attempt,
            attempt_token,
            feedback,
            consequence=consequence,
            decision_revision=next_revision,
            world_flags=context.flags,
        )
        _store_receipt(context.flags, idempotency_key, fingerprint, response)
        return response

    return mutate_world_state(authorized.id, mutation).value
```

No conservar el early-return legacy que otorgaba retry sin métricas, ni llamar `decision_effects.apply`/`case_effects.apply_case_effects` en otro lugar. El decorator `@transaction.atomic` externo puede retirarse: `mutate_world_state` ya contiene la transacción y el lock order.

- [ ] **Step 5: Añadir carreras PATCH con NPC, puerta y decisión**

En `test_world_state_mutation.py`, añadir los imports, el fixture y el test parametrizado completos. El fixture prepara estado válido antes de que `run_concurrently` abra su barrera:

```python
import json
from types import SimpleNamespace

from django.utils import timezone

from apps.simulation.models import AttemptWorldState, DecisionOption
from apps.simulation.services import game_service, world_service
from apps.simulation.services.world_state_mutation import mutate_world_state
from apps.simulation.tests.concurrency_helpers import run_concurrently
from shared.jsonutils import read_map


@pytest.fixture
def concurrent_world_case(started_case):
    def build(other):
        option = DecisionOption.objects.get(
            case_version_id=started_case.attempt.case_version_id,
            option_key="h1-pap-contencion",
        )
        positions = {
            "npc": (560, 330),
            "door": (790, 445),
            "decision": (480, 430),
        }
        player_x, player_y = positions[other]

        def prepare(context):
            context.state.player_x = player_x
            context.state.player_y = player_y
            context.flags["positionSyncedAt"] = timezone.now().timestamp() - 5
            if other == "door":
                context.state.inspected_object_keys_json = json.dumps(["familia-crisis"])

        mutate_world_state(started_case.attempt.id, prepare)

        operations = {
            "npc": lambda: world_service.record_npc_interaction(
                started_case.attempt.id,
                started_case.raw_token,
                "enfermera-urgencias",
                started_case.actor,
            ),
            "door": lambda: world_service.enter_room(
                started_case.attempt.id,
                started_case.raw_token,
                "hospital-sala-escucha",
                started_case.actor,
                door_key="puerta-sala-escucha",
            ),
            "decision": lambda: game_service.choose_decision(
                started_case.attempt.id,
                started_case.raw_token,
                option.id,
                started_case.actor,
                decision_revision=0,
                idempotency_key="decision-position-race",
            ),
        }
        return SimpleNamespace(
            attempt=started_case.attempt,
            raw_token=started_case.raw_token,
            actor=started_case.actor,
            patch_x=player_x,
            patch_y=player_y,
            map_key="hospital-urgencias",
            npc_key="enfermera-urgencias",
            target_map_key="hospital-sala-escucha",
            option=option,
            other_operation=operations[other],
        )

    return build


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("other", ["npc", "door", "decision"])
def test_position_patch_never_erases_concurrent_world_flags(
    concurrent_world_case,
    other,
):
    case = concurrent_world_case(other)

    patch = lambda: world_service.update_position(
        case.attempt.id,
        case.raw_token,
        case.patch_x,
        case.patch_y,
        case.actor,
        current_map_key=case.map_key,
    )
    run_concurrently(patch, case.other_operation)

    state = AttemptWorldState.objects.get(attempt=case.attempt)
    flags = read_map(state.flags_json)
    assert isinstance(flags.get("positionSyncedAt"), (int, float))
    if other == "npc":
        assert case.npc_key in flags["viewedNpcKeys"]
    elif other == "door":
        assert state.scene_map.map_key == case.target_map_key
        assert flags["syncedNodeId"] == case.attempt.current_node_id
    else:
        assert flags["decisionRevision"] == 1
        assert flags["lastConsequence"]["optionKey"] == case.option.option_key
```

Si el PATCH pierde por cambio de mapa, puede devolver el snapshot nuevo sin mover al jugador, pero nunca puede borrar los flags de la otra operación. No capturar excepciones en estas tres carreras: una validación fallida también es una regresión del setup autoritativo.

- [ ] **Step 6: Ejecutar backend focalizado**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py apps/simulation/tests/test_world_state_mutation.py apps/simulation/tests/test_game.py apps/simulation/tests/test_world.py -q`

Expected: PASS; replay idéntico no duplica evento, el receipt/`flags_json` no contienen tokens, la rotación devuelve el token presentado, payload distinto da 409 y todas las carreras conservan flags.

- [ ] **Step 7: Commit**

```powershell
git add backend_django/apps/simulation/serializers/requests.py `
  backend_django/apps/simulation/views/game_views.py `
  backend_django/apps/simulation/services/game_service.py `
  backend_django/apps/simulation/serializers/game_dtos.py `
  backend_django/apps/simulation/tests/test_case_consequences.py `
  backend_django/apps/simulation/tests/test_game.py `
  backend_django/apps/simulation/tests/test_world_state_mutation.py
git commit -m "feat(simulation): aplicar decisiones idempotentes fail forward"
```

### Task 4: Exponer consecuencia, reparación y timeline sin filtrar respuestas

**Files:**
- Modify: `backend_django/apps/simulation/serializers/game_dtos.py`
- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/services/instructor_service.py`
- Modify: `backend_django/apps/simulation/tests/test_case_consequences.py`
- Modify: `backend_django/apps/simulation/tests/test_instructor.py`
- Modify: `frontend/src/app/core/models/simulation.model.ts`
- Verify: `frontend/src/app/core/models/consequence-tone.model.ts`

- [ ] **Step 1: Escribir tests rojos del contrato JSON**

```python
from apps.simulation.services import world_service
from apps.simulation.services import instructor_service


@pytest.mark.django_db
def test_attempt_and_world_expose_persisted_consequence_without_answer_hint(
    started_case,
    h1_critical,
):
    attempt_payload = choose(started_case, h1_critical, revision=0, key="contract-h1-1")
    world_payload = world_service.get_world(
        started_case.attempt.id,
        started_case.raw_token,
        started_case.actor,
    )

    assert attempt_payload["decisionRevision"] == 1
    assert attempt_payload["consequence"]["actorKey"] == "familia-duelo"
    assert attempt_payload["consequence"]["relationDelta"] == {
        "trust": -22, "tension": 24, "openness": -18, "available": None,
    }
    assert attempt_payload["consequence"]["relationalState"] == {
        "trust": 24, "tension": 88, "openness": 20, "available": True,
    }
    assert world_payload["decisionRevision"] == 1
    assert world_payload["npcStates"]["familia-duelo"]["emotion"] == "closed"
    assert set(world_payload["npcStates"]) == {
        "familia-duelo", "psicologa-acompanante",
        "sobreviviente-consulta", "profesional-psicosocial",
    }
    assert world_payload["npcStates"]["familia-duelo"] == {
        "trust": 24, "tension": 88, "openness": 20, "available": True,
        "emotion": "closed", "pose": "react",
        "consequenceId": attempt_payload["consequence"]["id"],
    }
    assert world_payload["npcStates"]["psicologa-acompanante"]["pose"] == "idle"
    assert world_payload["lastConsequence"]["id"] == attempt_payload["consequence"]["id"]
    assert world_payload["pendingRepair"]["actorKey"] == "familia-duelo"

    pre_answer = json.dumps(attempt_payload["currentNode"]["options"])
    assert "classification" not in pre_answer
    assert "prohibitedConduct" not in pre_answer
    persisted = json.dumps(world_payload)
    assert "audioCue" not in persisted


@pytest.mark.django_db
def test_completion_timeline_includes_repair_events(
    completed_repaired_case,
    started_case,
):
    timeline = completed_repaired_case["completionReport"]["timeline"]
    event_types = [entry["type"] for entry in timeline]
    assert "DECISION_REPAIR_AVAILABLE" in event_types
    assert "DECISION_REPAIRED" in event_types
    decision_entries = [entry for entry in timeline if entry["npcState"] is not None]
    assert len(decision_entries) == 7
    assert decision_entries[0]["npcState"] == {
        "actorKey": "familia-duelo",
        "trust": 24, "tension": 88, "openness": 20, "available": True,
        "emotion": "closed", "pose": "react",
        "consequenceId": "decision:1:h1-noticia-sin-protocolo",
    }
    assert decision_entries[1]["npcState"]["trust"] == 40
    assert decision_entries[1]["npcState"]["tension"] == 68
    assert decision_entries[1]["npcState"]["openness"] == 34
    world = world_service.get_world(
        started_case.attempt.id,
        started_case.raw_token,
        started_case.actor,
    )
    latest_by_actor = {
        entry["npcState"]["actorKey"]: {
            key: value
            for key, value in entry["npcState"].items()
            if key != "actorKey"
        }
        for entry in decision_entries
    }
    assert latest_by_actor == world["npcStates"]


@pytest.mark.django_db
def test_instructor_trace_decodes_human_detail_and_relational_snapshot(
    started_case,
    h1_critical,
):
    choose(started_case, h1_critical, revision=0, key="trace-h1-relation")
    event = AttemptEvent.objects.get(
        attempt=started_case.attempt,
        event_type="DECISION_REPAIR_AVAILABLE",
    )
    trace = instructor_service._to_trace_event(event)

    assert trace["detail"]
    assert not trace["detail"].lstrip().startswith("{")
    assert trace["npcState"] == {
        "actorKey": "familia-duelo",
        "trust": 24, "tension": 88, "openness": 20, "available": True,
        "emotion": "closed", "pose": "react",
        "consequenceId": "decision:1:h1-noticia-sin-protocolo",
    }
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py -q`

Expected: FAIL porque el mundo aún no proyecta consecuencia/reparación, el timeline omite los eventos nuevos y las opciones todavía filtran clasificación.

- [ ] **Step 3: Implementar la proyección backend**

```python
# backend_django/apps/simulation/serializers/game_dtos.py
def decision_option_state(option):
    return {"id": option.id, "text": option.text}


TIMELINE_EVENT_TYPES = {
    "DECISION_SELECTED",
    "PROHIBITED_DECISION_SELECTED",
    "DECISION_REPAIR_AVAILABLE",
    "DECISION_REPAIRED",
    "TOOL_USED",
    "ROOM_ENTERED",
    "SAFE_EXIT_REQUESTED",
}
```

Importar únicamente el parser del envelope persistido y reemplazar `build_timeline` por una proyección de eventos. Nunca consulta el catálogo de deltas ni ejecuta efectos de dominio:

```python
from apps.simulation.services.clinical_consequence import (
    parse_consequence_event_detail,
)


DECISION_TIMELINE_EVENT_TYPES = {
    "DECISION_SELECTED",
    "PROHIBITED_DECISION_SELECTED",
    "DECISION_REPAIR_AVAILABLE",
    "DECISION_REPAIRED",
}


def build_timeline(attempt, events):
    start = attempt.started_at
    timeline = []
    for ev in events:
        if ev.event_type not in TIMELINE_EVENT_TYPES:
            continue
        seconds = (
            int((ev.occurred_at - start).total_seconds())
            if start and ev.occurred_at
            else None
        )
        decision = ev.decision_option if ev.decision_option_id else None
        npc_state = None
        label = (decision.text if decision else ev.detail) or ""
        if ev.event_type in DECISION_TIMELINE_EVENT_TYPES:
            if decision is None:
                raise RuntimeError(f"Evento {ev.id} perdió su DecisionOption")
            try:
                _message, npc_state = parse_consequence_event_detail(ev.detail)
            except ValueError as exc:
                raise RuntimeError(
                    f"Evento {ev.id} perdió su snapshot relacional",
                ) from exc
        timeline.append({
            "atSeconds": seconds,
            "time": _format_mmss(seconds),
            "type": ev.event_type,
            "classification": decision.classification if decision else None,
            "prohibited": bool(decision.prohibited_conduct) if decision else False,
            "label": label,
            "scoreDelta": ev.score_delta,
            "stressDelta": ev.stress_delta,
            "npcState": npc_state,
        })
    return timeline
```

En `instructor_service.py`, importar el mismo parser y reemplazar `_to_trace_event` para que la traza no muestre el JSON interno como texto:

```python
from apps.simulation.services.clinical_consequence import (
    parse_consequence_event_detail,
)
from apps.simulation.serializers.game_dtos import DECISION_TIMELINE_EVENT_TYPES


def _to_trace_event(event):
    classification = event.decision_option.classification if event.decision_option_id else None
    detail = event.detail
    npc_state = None
    if event.event_type in DECISION_TIMELINE_EVENT_TYPES:
        try:
            detail, npc_state = parse_consequence_event_detail(event.detail)
        except ValueError as exc:
            raise RuntimeError(
                f"Evento {event.id} perdió su snapshot relacional",
            ) from exc
    return {
        "type": event.event_type,
        "classification": classification,
        "nodeTitle": event.node.title if event.node_id else None,
        "decisionText": event.decision_option.text if event.decision_option_id else None,
        "scoreDelta": event.score_delta,
        "stressDelta": event.stress_delta,
        "detail": detail,
        "npcState": npc_state,
        "occurredAt": _dt(event.occurred_at),
}
```

En `test_instructor.py`, actualizar `_play_one_decision` para el request revisado y ampliar `test_trace_has_events_world_and_decrypted_reflection`:

```python
    response = client.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {
            "attemptToken": token,
            "decisionOptionId": option_id,
            "decisionRevision": 0,
            "idempotencyKey": f"instructor-trace:{attempt_id}",
            "evidenceOverride": False,
            "missingEvidence": [],
        },
        format="json",
    )
    assert response.status_code == 200

    # Dentro de test_trace_has_events_world_and_decrypted_reflection:
    decision_event = next(
        event for event in trace["events"]
        if event["type"] in {
            "DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED",
            "DECISION_REPAIR_AVAILABLE", "DECISION_REPAIRED",
        }
    )
    assert decision_event["detail"]
    assert not decision_event["detail"].lstrip().startswith("{")
    assert set(decision_event["npcState"]) == {
        "actorKey", "trust", "tension", "openness", "available",
        "emotion", "pose", "consequenceId",
    }
```

La prueba compara el último `npcState` persistido de cada actor con `world.npcStates` en el mismo intento. Si aparece un evento de decisión sin `DecisionOption`, con envelope inválido, actor fuera del catálogo o snapshot incompleto, la construcción falla cerrado; no recalcula desde la opción ni devuelve una línea sin relación que oculte la inconsistencia.

`consequence_dto` y la firma extendida de `attempt_state` ya quedaron introducidos en Task 3 porque los receipts los necesitan; no duplicarlos. Añadir un único helper de proyección en `game_service.py` para todos los reads de intento:

```python
def _attempt_state_with_world(attempt_id, raw_token, feedback=None):
    return mutate_world_state(
        attempt_id,
        lambda context: dto.attempt_state(
            context.attempt,
            raw_token,
            feedback,
            world_flags=context.flags,
        ),
    ).value
```

Usarlo en `start_attempt` después de los eventos iniciales, `find_active_attempt` después de `_reissue_token`, y `get_attempt` después de `_require_attempt`. El `mutate_world_state` inicial de Task 1 se reemplaza por `_attempt_state_with_world`; no ejecutar dos mutaciones para iniciar.

Refactorizar `safe_exit` y `resume_attempt`: quitar sus decorators `@transaction.atomic`, conservar `_require_attempt` solo como autorización previa y mover comprobación de status, cambio de status, `attempt.save()`, evento y `dto.attempt_state(..., world_flags=context.flags)` al callback de `mutate_world_state`. El callback compara primero `context.attempt.id == authorized.id`. Así pausa/reanudación se serializan con decisión, puerta y checkpoint en el mismo orden de locks.

Cambiar `get_completion_report` y `get_student_report` para autorizar primero y después construir dentro de `mutate_world_state` los eventos ordenados y `dto.build_completion_report(context.attempt, events, world_flags=context.flags)`. La comprobación “aún en progreso” de `get_completion_report` ocurre dentro del callback. Ninguna ruta devuelve revisión 0 tras una reanudación ni calcula un final contra flags stale.

En `world_service.py`, importar `consequence_dto` con `from ..serializers.game_dtos import consequence_dto`. `_to_world_state` ya recibe `flags` obligatorios desde Task 1; añadir estas propiedades a su literal:

```python
"decisionRevision": int(flags.get("decisionRevision", 0)),
"npcStates": flags.get("npcStates") if isinstance(flags.get("npcStates"), dict) else {},
"lastConsequence": consequence_dto(flags.get("lastConsequence")),
"pendingRepair": flags.get("pendingRepair") if isinstance(flags.get("pendingRepair"), dict) else None,
```

- [ ] **Step 4: Añadir contratos TypeScript exactos**

```typescript
// frontend/src/app/core/models/simulation.model.ts
import type { ConsequenceTone } from './consequence-tone.model';

export type { ConsequenceTone } from './consequence-tone.model';

export type ClinicalNpcActorKey =
  | 'familia-duelo'
  | 'psicologa-acompanante'
  | 'sobreviviente-consulta'
  | 'profesional-psicosocial';

export interface NpcRelationDelta {
  trust: number;
  tension: number;
  openness: number;
  available: boolean | null;
}

export interface NpcRelationState {
  trust: number;
  tension: number;
  openness: number;
  available: boolean;
}

export interface ClinicalConsequence {
  id: string;
  actorKey: ClinicalNpcActorKey;
  emotion: string;
  pose: 'react';
  tone: ConsequenceTone;
  announcement: string;
  relationDelta: NpcRelationDelta;
  relationalState: NpcRelationState;
  repairAvailable: boolean;
  repairPrompt: string | null;
  repaired: boolean;
  optionKey: string;
  sourceNodeId: number;
  occurredAt: string;
}

export interface NpcConsequenceState {
  trust: number;
  tension: number;
  openness: number;
  emotion: string;
  pose: 'idle' | 'react';
  available: boolean;
  consequenceId: string | null;
}

export interface TimelineNpcState extends NpcConsequenceState {
  actorKey: ClinicalNpcActorKey;
}

export interface PendingRepairState {
  sourceNodeId: number;
  actorKey: ClinicalNpcActorKey;
  prompt: string;
  consequenceId: string;
}

export interface SimulationDecisionOption {
  id: number;
  text: string;
}

export type AttemptTimelineEventType =
  | 'DECISION_SELECTED'
  | 'PROHIBITED_DECISION_SELECTED'
  | 'DECISION_REPAIR_AVAILABLE'
  | 'DECISION_REPAIRED'
  | 'TOOL_USED'
  | 'ROOM_ENTERED'
  | 'SAFE_EXIT_REQUESTED';
```

La re-exportación conserva los imports públicos existentes desde `simulation.model.ts`, pero la unión se declara una sola vez en `consequence-tone.model.ts`. No editar ese archivo en esta tarea ni crear otra unión equivalente en consecuencia, HUD o audio.

Cambiar `AttemptTimelineEntry.type` de `string` a `AttemptTimelineEventType` y añadir `npcState: TimelineNpcState | null`. Si el backend proyecta un tipo fuera de `TIMELINE_EVENT_TYPES`, debe omitirlo del timeline público en vez de ensanchar el tipo frontend. Scores relacionales fuera de 0–100, `NaN`, booleanos usados como número o estados sin alguno de los cuatro actores fallan en el validator del checkpoint; no se corrigen en la UI.

Añadir a `SimulationAttemptState`:

```typescript
decisionRevision: number;
consequence: ClinicalConsequence | null;
```

Añadir a `SimulationWorldState`:

```typescript
decisionRevision: number;
npcStates: Readonly<Record<ClinicalNpcActorKey, NpcConsequenceState>>;
lastConsequence: ClinicalConsequence | null;
pendingRepair: PendingRepairState | null;
```

Eliminar `classification` y `prohibitedConduct` únicamente del modelo pre-answer. `SimulationFeedback` y timeline conservan clasificación después de que el servidor procesa la decisión.

- [ ] **Step 5: Ejecutar backend, frontend typecheck y build**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py apps/simulation/tests/test_game.py apps/simulation/tests/test_instructor.py -q`

Expected: PASS.

Run: `npm run test:frontend -- --runInBand`

Expected: PASS tras actualizar los fixtures de `SimulationAttemptState` con `decisionRevision: 0` y `consequence: null`, cada fixture de `SimulationWorldState` con `decisionRevision: 0`, los cuatro `npcStates` iniciales completos, `lastConsequence: null` y `pendingRepair: null`, y cada `AttemptTimelineEntry` con `npcState`. Los campos son obligatorios; no volverlos opcionales ni usar `{}`/casts para silenciar el typecheck.

Run: `npm run build:frontend`

Expected: PASS sin propiedades legacy en consumidores pre-answer.

- [ ] **Step 6: Commit**

```powershell
git add backend_django/apps/simulation/serializers/game_dtos.py `
  backend_django/apps/simulation/services/world_service.py `
  backend_django/apps/simulation/services/instructor_service.py `
  backend_django/apps/simulation/tests/test_case_consequences.py `
  backend_django/apps/simulation/tests/test_instructor.py `
  frontend/src/app/core/models/simulation.model.ts
git commit -m "feat(simulation): proyectar consecuencias persistidas"
```

### Task 5: Convertir la consecuencia en un beat visual tipado

**Files:**
- Create: `frontend/src/app/features/simulator/clinical-consequence.util.ts`
- Create: `frontend/src/app/features/simulator/clinical-consequence.util.spec.ts`
- Create: `frontend/src/app/features/simulator/consequence-beat.component.ts`
- Create: `frontend/src/app/features/simulator/consequence-beat.component.spec.ts`

- [ ] **Step 1: Escribir tests rojos del mapper fail-closed**

```typescript
// frontend/src/app/features/simulator/clinical-consequence.util.spec.ts
import type { SceneActorV1 } from './runtime/scene-package.model';
import { resolveActorRenderPlan } from '../character/actor-render-plan.util';
import { makeCharacterManifestFixture } from '../character/character-test.fixture';
import { toConsequenceBeat } from './clinical-consequence.util';

const MANIFEST = makeCharacterManifestFixture();
const ACTOR: SceneActorV1 = {
  actorId: 'familia-duelo',
  displayName: 'Abuela de la niña',
  position: { x: 168, y: 408 },
  interactionRadius: 60,
  renderPlan: resolveActorRenderPlan(MANIFEST, 'familia-duelo'),
  facing: 'down',
  emotion: 'worried',
  motion: { behavior: 'idle' },
};

const CONSEQUENCE = {
  id: 'decision:1:h1-noticia-sin-protocolo',
  actorKey: 'familia-duelo',
  emotion: 'closed',
  pose: 'react' as const,
  tone: 'rupture' as const,
  announcement: 'La persona se cierra y la confianza se fractura de forma visible.',
  repairAvailable: true,
  repairPrompt: 'Reconoce el impacto y reformula la intervención.',
  repaired: false,
  optionKey: 'h1-noticia-sin-protocolo',
  sourceNodeId: 17,
  occurredAt: '2026-07-13T12:00:00Z',
};

describe('toConsequenceBeat', () => {
  it('uses the real scene actor and the runtime ActorPresentation contract', () => {
    const beat = toConsequenceBeat(CONSEQUENCE, [ACTOR]);

    expect(beat.presentation).toEqual({
      dialogueKey: CONSEQUENCE.id,
      speakerId: 'familia-duelo',
      listenerId: 'player',
      speakerName: 'Abuela de la niña',
      role: null,
      emotion: 'closed',
      facing: 'toward-listener',
      pose: 'react',
      consequenceTone: CONSEQUENCE.tone,
      speaking: false,
      portraitSrc: ACTOR.renderPlan.portrait.src,
      usesPixelFallback: false,
    });
    expect(beat.presentation.consequenceTone).toBe(CONSEQUENCE.tone);
    expect(beat.tone).toBe('rupture');
    expect(beat.announcement).toBe(CONSEQUENCE.announcement);
    expect(JSON.stringify(beat)).not.toMatch(/audioCue|correct|incorrect|recommended/i);
  });

  it('fails closed when authored actor is absent', () => {
    expect(() => toConsequenceBeat(CONSEQUENCE, [])).toThrow(
      'Actor de consecuencia ausente: familia-duelo',
    );
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/clinical-consequence.util.spec.ts`

Expected: FAIL porque `clinical-consequence.util.ts` no existe.

- [ ] **Step 3: Implementar el mapper sobre contratos existentes**

```typescript
// frontend/src/app/features/simulator/clinical-consequence.util.ts
import type { ClinicalConsequence } from '../../core/models/simulation.model';
import type { ConsequenceTone } from '../../core/models/consequence-tone.model';
import type { ActorPresentationState } from './runtime/actor-presentation.model';
import type { SceneActorV1 } from './runtime/scene-package.model';

export interface ConsequenceBeat {
  readonly id: string;
  readonly presentation: ActorPresentationState;
  readonly tone: ConsequenceTone;
  readonly announcement: string;
  readonly repairAvailable: boolean;
  readonly durationMs: number;
}

export function toConsequenceBeat(
  value: ClinicalConsequence,
  actors: readonly SceneActorV1[],
): ConsequenceBeat {
  const actor = actors.find(candidate => candidate.actorId === value.actorKey);
  if (!actor) {
    throw new Error(`Actor de consecuencia ausente: ${value.actorKey}`);
  }
  return Object.freeze({
    id: value.id,
    presentation: Object.freeze({
      dialogueKey: value.id,
      speakerId: actor.actorId,
      listenerId: 'player',
      speakerName: actor.displayName,
      role: null,
      emotion: value.emotion,
      facing: 'toward-listener',
      pose: 'react',
      consequenceTone: value.tone,
      speaking: false,
      portraitSrc: actor.renderPlan.portrait.src,
      usesPixelFallback: false,
    }),
    tone: value.tone,
    announcement: value.announcement,
    repairAvailable: value.repairAvailable,
    durationMs: value.repairAvailable ? 1800 : 1200,
  });
}
```

- [ ] **Step 4: Escribir tests rojos del componente accesible**

```typescript
// frontend/src/app/features/simulator/consequence-beat.component.spec.ts
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { ConsequenceBeatComponent } from './consequence-beat.component';
import type { ConsequenceBeat } from './clinical-consequence.util';

const BEAT: ConsequenceBeat = Object.freeze({
  id: 'decision:1:h1-noticia-sin-protocolo',
  presentation: Object.freeze({
    dialogueKey: 'decision:1:h1-noticia-sin-protocolo',
    speakerId: 'familia-duelo',
    listenerId: 'player',
    speakerName: 'Abuela de la niña',
    role: null,
    emotion: 'closed',
    facing: 'toward-listener',
    pose: 'react',
    consequenceTone: 'rupture',
    speaking: false,
    portraitSrc: '/assets/characters/v1/cuidadora-familia-vbg/base/portrait.png',
    usesPixelFallback: false,
  }),
  tone: 'rupture',
  announcement: 'Reconoce el impacto y reformula la intervención.',
  repairAvailable: true,
  durationMs: 1800,
});

describe('ConsequenceBeatComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [ConsequenceBeatComponent],
  }));

  it('announces once and completes at the authored duration', fakeAsync(() => {
    const fixture = TestBed.createComponent(ConsequenceBeatComponent);
    fixture.componentRef.setInput('beat', BEAT);
    fixture.componentRef.setInput('reducedMotion', false);
    fixture.detectChanges();

    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="status"]')?.textContent)
      .toContain(BEAT.announcement);

    tick(BEAT.durationMs - 1);
    expect(completed).not.toHaveBeenCalled();
    tick(1);
    expect(completed).toHaveBeenCalledTimes(1);
  }));

  it('uses the same meaning and a 400 ms reduced transition', fakeAsync(() => {
    const fixture = TestBed.createComponent(ConsequenceBeatComponent);
    fixture.componentRef.setInput('beat', BEAT);
    fixture.componentRef.setInput('reducedMotion', true);
    fixture.detectChanges();
    const completed = jest.fn();
    fixture.componentInstance.completed.subscribe(completed);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-tone="rupture"]')).not.toBeNull();
    tick(399);
    expect(completed).not.toHaveBeenCalled();
    tick(1);
    expect(completed).toHaveBeenCalledTimes(1);
  }));
});
```

- [ ] **Step 5: Implementar el componente pixel-first**

```typescript
// frontend/src/app/features/simulator/consequence-beat.component.ts
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

import type { ConsequenceBeat } from './clinical-consequence.util';

@Component({
  selector: 'app-consequence-beat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside
        class="consequence-beat"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        [attr.data-tone]="beat().tone"
      >
        <span class="pixel-corner" aria-hidden="true"></span>
        <p>{{ beat().announcement }}</p>
      </aside>
    }
  `,
  styles: [`
    :host { position: absolute; inset: 0; z-index: 42; pointer-events: none; }
    .consequence-beat {
      position: absolute; left: 50%; bottom: 7rem; width: min(34rem, calc(100% - 2rem));
      transform: translateX(-50%); padding: .85rem 1rem; color: #f5f7fb;
      background: linear-gradient(180deg, rgba(24,31,49,.94), rgba(12,18,31,.96));
      border: 2px solid #9b8bd0; box-shadow: 0 8px 24px rgba(0,0,0,.34);
      image-rendering: pixelated;
    }
    .consequence-beat[data-tone='relief'] { border-color: #76c7a5; }
    .consequence-beat[data-tone='steady'] { border-color: #91a8c8; }
    .consequence-beat[data-tone='tension'] { border-color: #d4aa62; }
    .consequence-beat[data-tone='rupture'] { border-color: #cf6f73; }
    .consequence-beat p { margin: 0; font: 500 1rem/1.5 Poppins, sans-serif; }
    .pixel-corner { position: absolute; width: 4px; height: 4px; inset: 4px auto auto 4px; background: currentColor; }
  `],
})
export class ConsequenceBeatComponent {
  readonly beat = input.required<ConsequenceBeat>();
  readonly reducedMotion = input(false);
  readonly completed = output<void>();
  readonly visible = signal(true);

  private readonly timer = effect(onCleanup => {
    const beat = this.beat();
    this.visible.set(true);
    const duration = this.reducedMotion() ? 400 : beat.durationMs;
    const id = window.setTimeout(() => {
      this.visible.set(false);
      this.completed.emit();
    }, duration);
    onCleanup(() => window.clearTimeout(id));
  });
}
```

- [ ] **Step 6: Ejecutar ambos tests y build**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/clinical-consequence.util.spec.ts src/app/features/simulator/consequence-beat.component.spec.ts`

Expected: PASS, 4 tests.

Run: `npm run build:frontend`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/simulator/clinical-consequence.util.ts `
  frontend/src/app/features/simulator/clinical-consequence.util.spec.ts `
  frontend/src/app/features/simulator/consequence-beat.component.ts `
  frontend/src/app/features/simulator/consequence-beat.component.spec.ts
git commit -m "feat(simulator): presentar beats de consecuencia"
```

### Task 6: Coordinar live, reparación e hidratación desde `SimulationPlayComponent`

**Files:**
- Modify: `frontend/src/app/core/api/simulation.service.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Verify: `frontend/src/app/features/simulator/game-world.component.ts`

- [ ] **Step 1: Escribir tests rojos de request, port y reload silencioso**

```typescript
it('sends revision and one stable idempotency key for a user decision', () => {
  component.attempt.set({ ...ATTEMPT, decisionRevision: 4 });
  component.dialogue.set(H1_DIALOGUE);
  component.executeDecision(41);

  expect(simulationService.chooseDecision).toHaveBeenCalledWith(
    ATTEMPT.attemptId,
    ATTEMPT.attemptToken,
    41,
    4,
    expect.stringMatching(/^[0-9a-f-]{36}$/i),
    false,
    [],
  );
});

it('publishes a live consequence once through the existing presentation input', () => {
  component.applyDecisionResult(ATTEMPT_WITH_RUPTURE);

  expect(component.actorPresentation()).toEqual(expect.objectContaining({
    dialogueKey: 'decision:1:h1-noticia-sin-protocolo',
    speakerId: 'familia-duelo',
    listenerId: 'player',
    facing: 'toward-listener',
    pose: 'react',
    consequenceTone: 'rupture',
  }));
  expect(component.consequenceBeat()?.tone).toBe('rupture');
  expect(component.busy()).toBe(true);
});

it('hydrates body and pending repair without replaying beat or aria', () => {
  const persistedRelations = structuredClone(WORLD_WITH_PERSISTED_RUPTURE.npcStates);
  component.hydrateWorldConsequences(WORLD_WITH_PERSISTED_RUPTURE);
  fixture.detectChanges();

  expect(component.actorPresentation()).toEqual(expect.objectContaining({
    speakerId: 'familia-duelo',
    pose: 'react',
    consequenceTone: 'rupture',
  }));
  expect(component.pendingRepair()?.actorKey).toBe('familia-duelo');
  expect(WORLD_WITH_PERSISTED_RUPTURE.npcStates).toEqual(persistedRelations);
  expect(WORLD_WITH_PERSISTED_RUPTURE.npcStates['familia-duelo']).toEqual(
    expect.objectContaining({ trust: 24, tension: 88, openness: 20, available: true }),
  );
  expect(Object.keys(WORLD_WITH_PERSISTED_RUPTURE.npcStates).sort()).toEqual([
    'familia-duelo', 'profesional-psicosocial',
    'psicologa-acompanante', 'sobreviviente-consulta',
  ]);
  expect(component.consequenceBeat()).toBeNull();
  expect(fixture.nativeElement.querySelector('app-consequence-beat')).toBeNull();
});

it('does not present the same consequence receipt twice', () => {
  const presentationSet = jest.spyOn(component.actorPresentation, 'set');
  component.applyDecisionResult(ATTEMPT_WITH_RUPTURE);
  component.applyDecisionResult(ATTEMPT_WITH_RUPTURE);

  expect(presentationSet).toHaveBeenCalledTimes(1);
  expect(component.consequenceBeat()?.id).toBe(ATTEMPT_WITH_RUPTURE.consequence?.id);
});
```

Los fixtures usan un `ScenePackageV1` con actor `familia-duelo` y su `ActorRenderPlan` real de fixture; no hacer cast de objeto vacío.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: FAIL por la nueva firma, `consequenceBeat`, `pendingRepair` y los métodos de coordinación todavía inexistentes.

- [ ] **Step 3: Extender el cliente HTTP sin regenerar la key internamente**

```typescript
// frontend/src/app/core/api/simulation.service.ts
chooseDecision(
  attemptId: string,
  attemptToken: string,
  decisionOptionId: number,
  decisionRevision: number,
  idempotencyKey: string,
  evidenceOverride = false,
  missingEvidence: string[] = [],
) {
  return this.http.post<ApiResponse<SimulationAttemptState>>(
    `${this.API}/attempts/${attemptId}/decisions`,
    {
      attemptToken,
      decisionOptionId,
      decisionRevision,
      idempotencyKey,
      evidenceOverride,
      missingEvidence,
    },
  ).pipe(map(response => response.data));
}
```

La key nace en el gesto de usuario de `SimulationPlayComponent`. Si el caller reintenta el mismo Observable/request por error de red, reutiliza esa key; `SimulationService` nunca llama `crypto.randomUUID()`.

- [ ] **Step 4: Añadir el estado de coordinación a la autoridad existente**

```typescript
// Dentro de SimulationPlayComponent
readonly consequenceBeat = signal<ConsequenceBeat | null>(null);
readonly pendingRepair = signal<PendingRepairState | null>(null);
private lastPresentedConsequenceId: string | null = null;
private repairDialogueSnapshot: DialogueState | null = null;
private postBeatAttempt: SimulationAttemptState | null = null;

private sceneActors(): readonly SceneActorV1[] {
  const scene = this.scenePackage();
  if (!scene) throw new Error('ScenePackage ausente al presentar consecuencia');
  return scene.actors;
}

applyDecisionResult(updated: SimulationAttemptState): void {
  this.attempt.set(updated);
  this.hydrateClinicalState(updated);
  this.persistAttemptToken(updated);
  const consequence = updated.consequence;
  if (!consequence) {
    this.finishPostDecision(updated);
    return;
  }
  if (consequence.id === this.lastPresentedConsequenceId) return;
  this.postBeatAttempt = updated;

  const beat = toConsequenceBeat(consequence, this.sceneActors());
  this.lastPresentedConsequenceId = consequence.id;
  this.pendingRepair.set(consequence.repairAvailable ? {
    sourceNodeId: consequence.sourceNodeId,
    actorKey: consequence.actorKey,
    prompt: consequence.repairPrompt ?? 'Reformula la intervención.',
    consequenceId: consequence.id,
  } : null);
  this.actorPresentation.set(beat.presentation);
  this.consequenceBeat.set(beat);
  this.busy.set(true);
}

hydrateWorldConsequences(world: SimulationWorldState): void {
  this.pendingRepair.set(world.pendingRepair);
  this.consequenceBeat.set(null);
  const consequence = world.lastConsequence;
  if (!consequence) {
    this.lastPresentedConsequenceId = null;
    this.actorPresentation.set(null);
    return;
  }
  this.lastPresentedConsequenceId = consequence.id;
  if (!this.sceneActors().some(actor => actor.actorId === consequence.actorKey)) {
    this.actorPresentation.set(null);
    this.consequenceBeat.set(null);
    return;
  }
  const beat = toConsequenceBeat(consequence, this.sceneActors());
  this.actorPresentation.set(beat.presentation);
  this.consequenceBeat.set(null);
}

completeConsequenceBeat(): void {
  const beat = this.consequenceBeat();
  const updated = this.postBeatAttempt;
  this.consequenceBeat.set(null);
  if (!beat || !updated) return;
  if (beat.repairAvailable && this.repairDialogueSnapshot) {
    this.dialogue.set(this.buildRepairSupervision(updated.feedback));
    this.busy.set(false);
    return;
  }
  this.finishPostDecision(updated);
}

private finishPostDecision(updated: SimulationAttemptState): void {
  this.selectedInteraction.set(null);
  this.nearbyInteraction.set(null);
  this.journalPanel?.clear();
  this.loadProgressMap(updated);
  this.loadWorld(updated);
  this.dialogue.set(updated.feedback ? this.buildSupervisionDialogue(updated.feedback) : null);
  this.repairDialogueSnapshot = null;
  this.postBeatAttempt = null;
}
```

`hydrateWorldConsequences` solo deriva presentación desde `emotion`, `pose` y `consequenceId`; no llama `apply_relational_delta`, no modifica `world.npcStates` y no vuelve a anunciar. El mapa completo de cuatro actores permanece en el `SimulationWorldState` autoritativo y el siguiente GET/checkpoint lo conserva byte por byte. La reparación usa una segunda respuesta de `chooseDecision`, cuya transacción aplica únicamente el delta de esa segunda opción.

`finishPostDecision` conserva `busy=true`; solo `applyLoadedWorld` lo libera cuando el nuevo mundo y su escenario ya están publicados, y la rama `error` de `loadWorld` lo libera al fallar. `actorPresentation` ya existe en `SimulationPlayComponent` por el plan del HUD; usar esa signal y no declararla otra vez. `hydrateWorldConsequences` se llama desde `applyWorldWithScenario` después de publicar `scenePackage`; jamás desde `applyDecisionResult`, porque esa ruta es live. No instancia `ConsequenceBeatComponent`, no dispara audio y no falla si `lastConsequence.actorKey` pertenece a la sala anterior. El único anuncio del beat live es el `role="status"` del componente; `SimulationPlayComponent` no llama además a `LiveAnnouncer`, evitando una locución doble. No acceder al `GameWorldPort` desde `SimulationPlayComponent`: el binding ya existente `[actorPresentation]="actorPresentation()"` llega a `GameWorldComponent`, cuyo `ngOnChanges` emite exactamente `{ type: 'set-actor-presentation', state }` sobre su port privado.

- [ ] **Step 5: Restaurar las opciones después de supervisión**

Antes de cerrar el diálogo al ejecutar una decisión, guardar una copia inmutable solo si contiene la opción elegida:

```typescript
const activeDialogue = this.dialogue();
if (activeDialogue?.choices.some(choice => choice.decisionOptionId === decisionOptionId)) {
  this.repairDialogueSnapshot = structuredClone(activeDialogue);
}
const idempotencyKey = crypto.randomUUID();
this.simulationService.chooseDecision(
  game.attemptId,
  game.attemptToken,
  decisionOptionId,
  game.decisionRevision,
  idempotencyKey,
  evidenceOverride,
  confirmedMissingEvidence,
).subscribe({
  next: updated => this.applyDecisionResult(updated),
  error: error => {
    if (error?.status === 409) {
      this.simulationService.getAttempt(game.attemptId, game.attemptToken).subscribe({
        next: authoritative => {
          this.attempt.set(authoritative);
          this.hydrateClinicalState(authoritative);
          this.persistAttemptToken(authoritative);
          this.dialogue.set(null);
          this.loadProgressMap(authoritative);
          this.loadWorld(authoritative);
          this.showActionError('El estado cambió en otra solicitud; cargamos la revisión autoritativa.');
        },
        error: () => {
          this.showActionError('El estado cambió y no pudimos recargarlo. Actualiza la página.');
          this.busy.set(false);
          this.fadeActive.set(false);
        },
      });
      return;
    }
    this.showActionError('No pudimos ejecutar la intervención.');
    this.busy.set(false);
    this.fadeActive.set(false);
  },
});
```

Insertar la captura de `activeDialogue` antes de la rama existente que muestra el gate de evidencia. Si esa rama obliga a confirmar información incompleta, la segunda llamada desde `frontend:proceed-evidence:*` no sobrescribe el snapshot porque el diálogo de evidencia no contiene el `decisionOptionId`; así la reparación siempre restaura las opciones clínicas originales.

Crear el diálogo de supervisión de reparación con una acción explícita:

```typescript
private buildRepairSupervision(feedback: SimulationFeedback | null): DialogueState {
  const message = feedback?.message
    ?? 'La intervención produjo una ruptura que quedó registrada.';
  return {
    key: 'supervision-repair',
    speakerName: 'Supervisión clínica',
    portraitKey: null,
    emotion: 'concerned',
    lines: [
      { order: 1, speakerName: 'Supervisión clínica', text: message, emotion: 'concerned' },
      {
        order: 2,
        speakerName: 'Supervisión clínica',
        text: 'El efecto no se borra. Puedes reconocer el impacto y reformular una vez.',
        emotion: 'neutral',
      },
    ],
    choices: [{
      key: 'frontend:repair-consequence',
      text: 'Reformular ahora',
      decisionOptionId: null,
      requiredToolCode: null,
      effect: {},
    }],
  };
}
```

Añadir al inicio de `handleFrontendChoice`:

```typescript
if (key === 'frontend:repair-consequence') {
  const original = this.repairDialogueSnapshot;
  if (!original) throw new Error('No existe diálogo autorado para reparar');
  this.dialogue.set(structuredClone(original));
  return;
}
```

Si la segunda respuesta es adecuada, el servidor marca `repaired: true` y avanza. Si vuelve a ser mala, el servidor aplica el segundo efecto y avanza con `repairAvailable: false`. En ambos casos se limpia `repairDialogueSnapshot` dentro de `finishPostDecision`.

- [ ] **Step 6: Renderizar el beat y conservar el lock único**

Importar `ConsequenceBeatComponent` en el array `imports` del componente y añadir junto a los demás overlays:

```html
@if (consequenceBeat(); as beat) {
  <app-consequence-beat
    [beat]="beat"
    [reducedMotion]="effectiveReducedMotion()"
    (completed)="completeConsequenceBeat()"
  />
}
```

Mientras existe el beat, `busy()` permanece `true`; el effect del runtime ya deriva y envía un único `{ type: 'set-input-lock', state }` que bloquea player, NPC, doors, interactions y position events. No añadir otra bandera de pausa a `GameWorldComponent`, no exponer su port y no duplicar el binding `[actorPresentation]`. Ese archivo solo continúa adjuntando su port privado y aplicando `set-actor-presentation` con el reducer de runtime.

- [ ] **Step 7: Ejecutar tests y build**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/clinical-consequence.util.spec.ts src/app/features/simulator/consequence-beat.component.spec.ts`

Expected: PASS; live anuncia una vez, reload restaura en silencio y repair vuelve a opciones autoradas.

Run: `npm run build:frontend`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/app/core/api/simulation.service.ts `
  frontend/src/app/features/simulator/simulation-play.component.ts `
  frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "feat(simulator): coordinar consecuencias y reparacion"
```

### Task 7: Cerrar la regresión de pistas pre-answer

**Files:**
- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/serializers/game_dtos.py`
- Modify: `backend_django/apps/simulation/tests/test_case_consequences.py`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts` only if the gate identifies a legacy binding
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` only if the gate identifies a legacy enrichment

- [ ] **Step 1: Añadir un gate de caracterización explícito**

```python
@pytest.mark.django_db
def test_all_pre_answer_surfaces_are_semantically_neutral(started_case):
    attempt = game_service.get_attempt(
        started_case.attempt.id,
        started_case.raw_token,
        started_case.actor,
    )
    world = world_service.get_world(
        started_case.attempt.id,
        started_case.raw_token,
        started_case.actor,
    )
    serialized = json.dumps({
        "nodeOptions": attempt["currentNode"]["options"],
        "worldChoices": [
            choice
            for obj in world["objects"]
            if obj.get("dialogue")
            for choice in obj["dialogue"]["choices"]
        ],
    })
    for forbidden in (
        "classification",
        "prohibitedConduct",
        "isRecommended",
        "isProhibited",
        "evidenceWarning",
    ):
        assert forbidden not in serialized
```

```typescript
it('renders four clinically plausible choices without correctness hints', () => {
  fixture.componentRef.setInput('dialogue', DIALOGUE_WITH_FOUR_CHOICES);
  fixture.detectChanges();

  const panel = fixture.nativeElement as HTMLElement;
  const choices = [...panel.querySelectorAll<HTMLButtonElement>('.dialogue-choice')];
  expect(choices).toHaveLength(4);
  expect(choices.map(choice => choice.className).join(' '))
    .not.toMatch(/recommended|prohibited|correct|incorrect/i);
  expect(panel.textContent).not.toMatch(/información incompleta|recomendada|prohibida/i);
  expect(choices.every(choice => choice.getAttribute('aria-describedby') === null)).toBe(true);
});
```

Este gate puede pasar de inmediato porque el plan de diálogo es prerrequisito y Task 4 ya neutralizó `currentNode.options`. No afirmar que existe un fallo legacy si el test está verde; aquí la práctica correcta es caracterizar la integración entre planes.

- [ ] **Step 2: Ejecutar el gate y retirar únicamente residuos observados**

Run: `npm run test:backend -- apps/simulation/tests/test_case_consequences.py -q`

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/dialogue-panel.component.spec.ts`

Expected: PASS. Si cualquiera falla, aplicar estas eliminaciones exactas y volver a correr:

- En `_to_dialogue`, cada choice contiene solo `key`, `text`, `decisionOptionId`, `requiredToolCode` y `effect`.
- En `DialogueChoiceState`, eliminar `isRecommended`, `isProhibited` y `evidenceWarning`.
- En `SimulationPlayComponent`, eliminar el merge de `option.classification`/`option.prohibitedConduct` y el armado del diálogo “información incompleta”.
- En `dialogue-panel.component.ts`, eliminar badges, clases y `aria-describedby` dependientes de corrección; conservar focus, numeración y texto.

No eliminar `classification` de `SimulationFeedback` ni de `AttemptTimelineEntry`: ambos son posteriores a la elección.

- [ ] **Step 3: Ejecutar scan estático**

```powershell
$targets = @(
  'frontend/src/app/features/simulator/dialogue-panel.component.ts',
  'frontend/src/app/features/simulator/simulation-play.component.ts'
)
$hits = Select-String -Path $targets -Pattern 'isRecommended|isProhibited|evidenceWarning|información incompleta'
if ($hits) { $hits | Format-Table Path,LineNumber,Line; exit 1 }
```

Expected: exit 0 y ninguna fila.

- [ ] **Step 4: Commit**

```powershell
git add backend_django/apps/simulation/services/world_service.py `
  backend_django/apps/simulation/serializers/game_dtos.py `
  backend_django/apps/simulation/tests/test_case_consequences.py `
  frontend/src/app/features/simulator/dialogue-panel.component.spec.ts `
  frontend/src/app/features/simulator/dialogue-panel.component.ts `
  frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "fix(simulation): ocultar pistas antes de decidir"
```

### Task 8: Probar tres rutas completas por UI y dejar un monitor sin fugas

**Files:**
- Modify: `frontend/e2e/support/required-viewports.ts`
- Create: `frontend/e2e/support/premium-case-flow.ts`
- Modify: `frontend/e2e/support/quality-gates.ts`
- Create: `frontend/e2e/premium-routes.e2e.ts`
- Modify: `frontend/e2e/full-case.e2e.ts`

- [ ] **Step 1: Escribir primero el E2E rojo de las tres rutas**

```typescript
// frontend/e2e/premium-routes.e2e.ts
import { expect, test } from '@playwright/test';

import {
  completePremiumCase,
  PREMIUM_ROUTE_EXPECTATIONS,
  type PremiumRoute,
} from './support/premium-case-flow';
import { monitorRuntimeFailures } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';

const LAPTOP = REQUIRED_VIEWPORTS[1];
const ROUTES: readonly PremiumRoute[] = ['recommended', 'repaired', 'unrepaired'];

test.use({ viewport: { width: LAPTOP.width, height: LAPTOP.height } });

for (const route of ROUTES) {
  test(`@premium-route completes ${route} through visible gameplay`, async ({ page }, testInfo) => {
    const runtime = monitorRuntimeFailures(page);
    try {
      const completed = await completePremiumCase(page, testInfo, LAPTOP, route);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completionReport.ending.key)
        .toBe(PREMIUM_ROUTE_EXPECTATIONS[route].ending);
      runtime.assertClean();
    } finally {
      runtime.dispose();
    }
  });
}
```

- [ ] **Step 2: Ejecutar y comprobar que falla por el helper ausente**

Run: `npm run test:e2e -- premium-routes.e2e.ts --project=chromium --retries=0`

Expected: FAIL de compilación porque `premium-case-flow.ts` y el nuevo contrato del monitor todavía no existen.

- [ ] **Step 3: Exportar el viewport y crear el driver con tabla exacta**

Al final de `required-viewports.ts` añadir:

```typescript
export type RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];
```

Crear `premium-case-flow.ts` con este contrato, esta tabla canónica y estos helpers:

```typescript
// frontend/e2e/support/premium-case-flow.ts
import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

import type { RequiredViewport } from './required-viewports';
import { assertQualityState } from './quality-gates';
import {
  acceptContentWarning,
  advanceDialogueToChoices,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  enterDoor,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
  type WorldInputDriver,
} from './siep-flow';

export type PremiumRoute = 'recommended' | 'repaired' | 'unrepaired';
export type PremiumDecisionResult = Awaited<ReturnType<typeof chooseDecision>>;

interface PremiumRouteExpectation {
  readonly ending: 'integral' | 'brechas' | 'critico';
  readonly finalScore: number;
  readonly finalStress: number;
  readonly userTrust: number;
  readonly victimRisk: number;
  readonly papApplied: boolean;
  readonly revictimizationRisk: boolean;
  readonly severity: Readonly<Record<'recommended' | 'acceptable' | 'risky' | 'critical', number>>;
  readonly timelineIncludes: readonly string[];
  readonly timelineExcludes: readonly string[];
}

export const PREMIUM_ROUTE_EXPECTATIONS = {
  recommended: {
    ending: 'integral', finalScore: 66, finalStress: 0,
    userTrust: 100, victimRisk: 20, papApplied: true,
    revictimizationRisk: false,
    severity: { recommended: 6, acceptable: 0, risky: 0, critical: 0 },
    timelineIncludes: ['DECISION_SELECTED'],
    timelineExcludes: ['DECISION_REPAIR_AVAILABLE', 'DECISION_REPAIRED'],
  },
  repaired: {
    ending: 'brechas', finalScore: 51, finalStress: 35,
    userTrust: 78, victimRisk: 47, papApplied: true,
    revictimizationRisk: true,
    severity: { recommended: 6, acceptable: 0, risky: 0, critical: 1 },
    timelineIncludes: ['DECISION_REPAIR_AVAILABLE', 'DECISION_REPAIRED'],
    timelineExcludes: [],
  },
  unrepaired: {
    ending: 'critico', finalScore: 26, finalStress: 75,
    userTrust: 50, victimRisk: 75, papApplied: false,
    revictimizationRisk: true,
    severity: { recommended: 5, acceptable: 0, risky: 0, critical: 2 },
    timelineIncludes: ['DECISION_REPAIR_AVAILABLE'],
    timelineExcludes: ['DECISION_REPAIRED'],
  },
} as const satisfies Record<PremiumRoute, PremiumRouteExpectation>;

export async function enterPremiumWorld(
  page: Page,
  viewport: RequiredViewport,
): Promise<WorldInputDriver> {
  const input = createWorldInputDriver(page, viewport.inputMode);
  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
  return input;
}

async function waitForConsequenceBeat(
  page: Page,
  decision: PremiumDecisionResult,
): Promise<void> {
  expect(decision.consequence).not.toBeNull();
  const consequence = decision.consequence;
  if (!consequence) throw new Error('La decisión no devolvió consecuencia clínica');
  const beat = page.locator('app-consequence-beat [role="status"]');
  await expect(beat).toBeVisible({ timeout: 5_000 });
  await expect(beat).toHaveAttribute('data-tone', consequence.tone);
  await expect(beat).not.toHaveText('');
  await expect(beat).toBeHidden({ timeout: 10_000 });
}

async function chooseAndAdvance(
  page: Page,
  dialogueName: RegExp,
  optionText: RegExp,
): Promise<PremiumDecisionResult> {
  const decision = await chooseDecision(page, dialogueName, optionText);
  await waitForConsequenceBeat(page, decision);
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);
  return decision;
}

async function completeH1(
  page: Page,
  route: PremiumRoute,
): Promise<PremiumDecisionResult> {
  if (route === 'recommended') {
    return chooseAndAdvance(
      page,
      /abuela de la niña/i,
      /aplicar pap: contención emocional, acompañamiento en duelo/i,
    );
  }

  const first = await chooseDecision(
    page,
    /abuela de la niña/i,
    /notificar de inmediato la muerte de la niña a la familia/i,
  );
  expect(first.consequence).toMatchObject({
    actorKey: 'familia-duelo', tone: 'rupture', repairAvailable: true,
    relationalState: { trust: 24, tension: 88, openness: 20, available: true },
  });
  await waitForConsequenceBeat(page, first);
  const supervision = await advanceDialogueToChoices(page, /supervisión clínica/i);
  await supervision.getByRole('button', { name: /reformular ahora/i }).click();

  const second = await chooseDecision(
    page,
    /abuela de la niña/i,
    route === 'repaired'
      ? /aplicar pap: contención emocional, acompañamiento en duelo/i
      : /interrogar a la víctima herida sobre el agresor antes de cirugía/i,
  );
  await waitForConsequenceBeat(page, second);
  expect(second.consequence?.repairAvailable).toBe(false);
  expect(second.consequence?.repaired).toBe(route === 'repaired');
  expect(second.consequence?.relationalState).toEqual(route === 'repaired'
    ? { trust: 40, tension: 68, openness: 34, available: true }
    : { trust: 6, tension: 100, openness: 4, available: true });
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);
  return second;
}
```

Debajo de esos helpers, añadir la aserción autoritativa y el recorrido completo restante. No usar llamadas API para avanzar, no alterar coordenadas desde el test y no saltar diálogos:

```typescript
function assertRouteOutcome(
  decision: PremiumDecisionResult,
  route: PremiumRoute,
): void {
  const expected = PREMIUM_ROUTE_EXPECTATIONS[route];
  const report = decision.completionReport;
  expect(decision.status).toBe('COMPLETED');
  expect(decision.currentNode.key).toBe('cierre-caso');
  expect(decision.accumulatedScore).toBe(expected.finalScore);
  expect(decision.stressIndex).toBe(expected.finalStress);
  expect(decision.metrics.userTrust).toBe(expected.userTrust);
  expect(decision.metrics.victimRisk).toBe(expected.victimRisk);
  expect(decision.metrics.institutionalRouteActivated).toBe(true);
  expect(decision.metrics.revictimizationRisk).toBe(expected.revictimizationRisk);
  expect(decision.clinicalState?.papApplied).toBe(expected.papApplied);
  expect(report.finalScore).toBe(expected.finalScore);
  expect(report.finalStress).toBe(expected.finalStress);
  expect(report.ending?.key).toBe(expected.ending);
  expect(report.ending?.severityCounts).toEqual(expected.severity);
  const timelineTypes = (report.timeline ?? []).map(entry => entry.type);
  expect(timelineTypes).toEqual(expect.arrayContaining([...expected.timelineIncludes]));
  for (const excluded of expected.timelineExcludes) {
    expect(timelineTypes).not.toContain(excluded);
  }
  const relationEntries = report.timeline.filter(entry => entry.npcState !== null);
  expect(relationEntries).toHaveLength(route === 'recommended' ? 6 : 7);
  for (const entry of relationEntries) {
    expect(entry.npcState).toEqual(expect.objectContaining({
      actorKey: expect.stringMatching(
        /^(familia-duelo|psicologa-acompanante|sobreviviente-consulta|profesional-psicosocial)$/,
      ),
      trust: expect.any(Number),
      tension: expect.any(Number),
      openness: expect.any(Number),
      available: expect.any(Boolean),
      emotion: expect.any(String),
      pose: 'react',
      consequenceId: expect.any(String),
    }));
    for (const value of [
      entry.npcState!.trust,
      entry.npcState!.tension,
      entry.npcState!.openness,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  }
}

export async function completePremiumCase(
  page: Page,
  testInfo: TestInfo,
  viewport: RequiredViewport,
  route: PremiumRoute = 'recommended',
): Promise<PremiumDecisionResult> {
  testInfo.setTimeout(300_000);
  const input = await enterPremiumWorld(page, viewport);

  await input.moveUntilNearby('ArrowLeft', /kit pap/i);
  const pap = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
  expect(pap.world.inventory).toContain('PAP');
  await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
  const papUse = await useToolChoice(
    page,
    /abuela de la niña/i,
    /aplicar pap a la familia en crisis/i,
  );
  expect(papUse.pertinent).toBe(true);
  expect(papUse.world.usedToolKeys).toContain('PAP@familia-crisis');
  await closeDialogue(page, /herramienta pertinente/i);

  await input.moveUntilNearby('ArrowRight', /sala de escucha familiar/i);
  await input.moveFor('ArrowLeft', 1_350);
  await input.moveFor('ArrowUp', 330);
  await seekNpcDialogue(page, /enfermera de urgencias/i, input);
  await closeDialogue(page, /enfermera de urgencias/i);
  await input.moveFor('ArrowDown', 550);
  await input.moveUntilNearby('ArrowRight', /sala de escucha familiar/i);
  const escuchaEntry = await enterDoor(
    page,
    /sala de escucha familiar/i,
    'hospital-sala-escucha',
  );
  expect(escuchaEntry.player).toMatchObject({ x: 160, y: 452 });

  await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
  let decision = await completeH1(page, route);
  expect(decision.currentNode.key).toBe('hospital-sala-escucha');

  await input.moveUntilNearby('ArrowRight', /bitácora/i);
  await input.moveFor('ArrowRight', 800);
  await input.moveUntilNearby('ArrowUp', /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-hospital$/);
  decision = await chooseAndAdvance(
    page,
    /marco normativo y técnico/i,
    /resolución 459 de 2012 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('hospital-accion-etica');

  await input.moveUntilNearby('ArrowUp', /protocolo epicee/i);
  const spikes = await interactNearby(page, /protocolo epicee/i, /\/interactions\/tool-spikes$/);
  expect(spikes.world.inventory).toContain('SPIKES');
  await input.moveFor('ArrowDown', 330);
  await input.moveUntilNearby('ArrowRight', /psicóloga hospitalaria/i);
  await interactNearby(page, /psicóloga hospitalaria/i, /\/interactions\/psicologa-acompanante$/);
  decision = await chooseAndAdvance(
    page,
    /psicóloga hospitalaria/i,
    /pap \+ escucha \+ epicee\/spikes \+ evaluación psicosocial familiar/i,
  );
  expect(decision.currentNode.key).toBe('hospital-cierre-bloque');

  await input.moveUntilNearby('ArrowRight', /salida institucional/i);
  await enterDoor(page, /salida institucional/i, 'comisaria-recepcion');
  await input.moveUntilNearby('ArrowRight', /consultorio/i);
  await input.moveFor('ArrowLeft', 400);
  await input.moveUntilNearby('ArrowUp', /expediente del caso/i);
  await interactNearby(page, /expediente del caso/i, /\/interactions\/expediente-caso$/);
  await closeDialogue(page, /expediente del caso/i);
  await input.moveFor('ArrowDown', 450);
  await input.moveUntilNearby('ArrowRight', /consultorio/i);
  await enterDoor(page, /consultorio/i, 'comisaria-consultorio');

  await input.moveUntilNearby('ArrowRight', /valoración de riesgo/i);
  const risk = await interactNearby(page, /valoración de riesgo/i, /\/interactions\/tool-riesgo$/);
  expect(risk.world.inventory).toContain('RISK_METER');
  await input.moveUntilNearby('ArrowLeft', /sobreviviente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  const riskUse = await useToolChoice(
    page,
    /sobreviviente \(22 años\)/i,
    /aplicar valoración estructurada de riesgo de feminicidio/i,
  );
  expect(riskUse.pertinent).toBe(true);
  expect(riskUse.world.usedToolKeys).toContain('RISK_METER@sobreviviente-consulta');
  await closeDialogue(page, /herramienta pertinente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  decision = await chooseAndAdvance(
    page,
    /sobreviviente \(22 años\)/i,
    /valorar riesgo de feminicidio \+ medidas de protección \+ derechos/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-consultorio');

  await input.moveUntilNearby('ArrowRight', /ruta de protección/i);
  await input.moveFor('ArrowRight', 1_200);
  await input.moveUntilNearby('ArrowUp', /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-comisaria$/);
  decision = await chooseAndAdvance(
    page,
    /marco normativo y técnico/i,
    /ley 2126 de 2021 \+ ley 1098 de 2006 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-accion-final');

  await input.moveUntilNearby('ArrowRight', /profesional psicosocial/i);
  await interactNearby(page, /profesional psicosocial/i, /\/interactions\/profesional-psicosocial$/);
  decision = await chooseDecision(
    page,
    /profesional psicosocial/i,
    /lo anterior \+ nivel de vulneración de derechos \+ valoración de feminicidio \+ rutas/i,
  );
  await waitForConsequenceBeat(page, decision);

  assertRouteOutcome(decision, route);
  const outcome = page.getByRole('alertdialog', { name: /intento finalizado/i });
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await expect(outcome.getByText(`Recomendadas: ${PREMIUM_ROUTE_EXPECTATIONS[route].severity.recommended}`))
    .toBeVisible();
  await expect(outcome.getByText(/métricas del caso/i)).toBeVisible();
  await expect(outcome.getByRole('button', { name: /reintentar caso/i })).toBeVisible();
  await expect(outcome.getByRole('link', { name: /volver al simulador/i })).toBeVisible();
  await assertQualityState(page, testInfo, `${viewport.name}-${route}-outcome`);
  return decision;
}
```

- [ ] **Step 4: Implementar el monitor con ownership explícito**

En `quality-gates.ts`, conservar el import de `expect`, sustituir su import de tipos por el siguiente y añadir los tipos/función después de `assertQualityState`. El plan de checkpoint puede ampliar el allowlist, pero no puede volver a la API de función anónima:

```typescript
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
  TestInfo,
} from '@playwright/test';

export interface ExpectedRuntimeFailure {
  readonly kind: 'response' | 'requestfailed';
  readonly method: string;
  readonly url: RegExp;
  readonly status?: number;
}

export interface RuntimeFailureMonitor {
  assertClean(): void;
  dispose(): void;
}

export function monitorRuntimeFailures(
  page: Page,
  allowed: readonly ExpectedRuntimeFailure[] = [],
): RuntimeFailureMonitor {
  const pending = [...allowed];
  const unexpected: string[] = [];
  const consume = (
    kind: ExpectedRuntimeFailure['kind'],
    method: string,
    url: string,
    status?: number,
  ): boolean => {
    const index = pending.findIndex(item =>
      item.kind === kind
      && item.method === method
      && item.url.test(url)
      && (item.status === undefined || item.status === status));
    if (index < 0) return false;
    pending.splice(index, 1);
    return true;
  };
  const onConsole = (message: ConsoleMessage): void => {
    if (message.type() === 'error') unexpected.push(`console: ${message.text()}`);
  };
  const onPageError = (error: Error): void => {
    unexpected.push(`pageerror: ${error.message}`);
  };
  const onResponse = (response: Response): void => {
    if (response.status() < 400) return;
    const method = response.request().method();
    if (!consume('response', method, response.url(), response.status())) {
      unexpected.push(`${method} ${response.status()} ${response.url()}`);
    }
  };
  const onRequestFailed = (request: Request): void => {
    if (!consume('requestfailed', request.method(), request.url())) {
      unexpected.push(`${request.method()} failed ${request.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  let disposed = false;
  return Object.freeze({
    assertClean(): void {
      expect(unexpected, 'fallos runtime inesperados').toEqual([]);
      expect(pending, 'fallos runtime esperados que no ocurrieron').toEqual([]);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
  });
}
```

- [ ] **Step 5: Sustituir el E2E duplicado por el helper compartido**

Reemplazar por completo `full-case.e2e.ts`:

```typescript
import { test } from '@playwright/test';

import { completePremiumCase } from './support/premium-case-flow';
import { monitorRuntimeFailures } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';

for (const viewport of REQUIRED_VIEWPORTS) {
  test.describe(`full-case-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@full-case completes the recommended route (${viewport.name})`, async ({ page }, testInfo) => {
      const runtime = monitorRuntimeFailures(page);
      try {
        await completePremiumCase(page, testInfo, viewport, 'recommended');
        runtime.assertClean();
      } finally {
        runtime.dispose();
      }
    });
  });
}
```

- [ ] **Step 6: Ejecutar las rutas, typecheck y comprobar ausencia de atajos**

Run: `npm run test:e2e -- premium-routes.e2e.ts full-case.e2e.ts --project=chromium --retries=0`

Expected: 7/7 PASS; cada ruta termina por movimiento, interacción, diálogo y decisión visibles, con la tabla exacta correspondiente y monitor limpio.

Run: `npm run build:frontend`

Expected: PASS; `PremiumDecisionResult`, timeline y viewports compilan sin `any` ni casts vacíos.

Run:

```powershell
$hits = Select-String -Path `
  frontend/e2e/support/premium-case-flow.ts,frontend/e2e/premium-routes.e2e.ts `
  -Pattern 'page\.request|fetch\(|evaluate\([^)]*(attempt|world|decision)|playerX|playerY'
if ($hits) { $hits | Format-Table Path,LineNumber,Line; exit 1 }
```

Expected: exit 0; el driver no teletransporta, no muta estado por API y no omite la reparación visible.

- [ ] **Step 7: Commit**

```powershell
git add frontend/e2e/support/required-viewports.ts `
  frontend/e2e/support/premium-case-flow.ts `
  frontend/e2e/support/quality-gates.ts `
  frontend/e2e/premium-routes.e2e.ts `
  frontend/e2e/full-case.e2e.ts
git commit -m "test(simulator): cubrir consecuencias y reparacion completa"
```

### Task 9: Cerrar verificación técnica y congelar el handoff clínico pendiente

**Files:**
- Create: `docs/clinical/SIM-VBG-001-consequence-review-protocol.md`
- Runtime evidence only: `.superpowers/evidence/<phase4-commit>/living-case/`
- Handoff consumer, no modificar aquí: `docs/superpowers/plans/2026-07-13-checkpoint-performance-acceptance.md`

- [ ] **Step 1: Crear y commitear el protocolo de revisión pendiente**

```markdown
# Protocolo de revisión clínica — SIM-VBG-001 consecuencias

Este protocolo no constituye aprobación. Phase 4 lo versiona y congela con
`Estado del paquete Phase 4: PENDING`; no ejecuta revisión ni recoge firma.
El plan final `2026-07-13-checkpoint-performance-acceptance.md` lo consume solo
después de integrar audio y checkpoint y de fijar el HEAD final de aceptación.
Solo una persona revisora clínica humana autorizada puede completar y firmar el
registro final. Codex, tests automáticos y métricas no pueden marcar este gate.

Estado del paquete Phase 4: PENDING

El registro final se crea en
`.superpowers/external-validation/<FINAL_HEAD>/<sessionId>/clinical-review.md`.
Su `SHA revisado` debe ser `FINAL_HEAD`, no el commit intermedio de Phase 4.

## Identidad obligatoria del registro

- SHA revisado
- Nombre y rol de la persona revisora
- Fecha, zona horaria y versión del navegador
- Una línea exacta `Resultado: APROBADO` o `Resultado: BLOQUEADO`
- Riesgos/bloqueos observados y evidencia visual relacionada

Al copiar este protocolo desde el handoff al registro final, completar y conservar este bloque:

SHA revisado: PENDIENTE
Persona revisora: PENDIENTE
Rol clínico: PENDIENTE
Fecha y zona horaria: PENDIENTE
Navegador y versión: PENDIENTE
Resultado: PENDIENTE
Riesgos o bloqueos: PENDIENTE
Evidencia visual: PENDIENTE
Firma: PENDIENTE

Solo durante la aceptación final, reemplazar todos los `PENDIENTE` y hacer que
`Resultado:` sea exactamente `APROBADO` o `BLOQUEADO`. La copia congelada de
Phase 4 debe conservarlos.

## Cobertura de opciones

- H1: `h1-noticia-sin-protocolo`, `h1-pap-contencion`, `h1-interrogar-victima`
- H2: `h2-solo-459`, `h2-459-1257`, `h2-459-1448`
- H3: `h3-parcial-disonancia`, `h3-pap-epicee`, `h3-epicee-ciclo`, `h3-integral-psicosocial`
- C1: `c1-mediacion-perdon`, `c1-riesgo-proteccion-derechos`, `c1-patrones-infancia`
- C2: `c2-2126-1098-1257`, `c2-1098-1257`, `c2-eje-1448`
- C3: `c3-parcial-clinica`, `c3-valoracion-dependientes`, `c3-integral-derechos`

Para cada una de las 19 opciones, la persona revisora confirma o bloquea:

- El actor afectado es clínicamente y narrativamente correcto.
- El delta explícito de `trust`, `tension`, `openness` y cualquier cambio de
  `available` es proporcional, comprensible y no estigmatizante; nunca es nulo.
- El estado inicial de los cuatro actores y el estado acumulado 0–100 después de
  la opción son coherentes, y una reparación mejora sin borrar el impacto previo.
- Emoción, pose y tono representan impacto sin caricaturizar sufrimiento.
- El feedback aparece después de decidir y no delata la respuesta antes.
- Puntaje, estrés, confianza, riesgo y flags corresponden al contenido.
- El lenguaje evita culpa, coerción, revictimización y falsas garantías.

## Rutas jugables obligatorias

- Recomendada: final `integral`, 66 puntos, estrés 0, PAP aplicado.
- Error reparado: primer impacto persiste, reparación explícita, final `brechas`, 51 puntos.
- Error no reparado: dos impactos persistentes, final `critico`, 26 puntos, PAP no aplicado.

En cada ruta se revisan continuidad humana, claridad de la supervisión, tiempo del
beat, restauración de opciones, coherencia del NPC y lectura del cierre. Una sola
objeción clínica sin resolver fija el resultado en `BLOQUEADO`.

## Handoff y regla de publicación

Phase 4 entrega el hash de este protocolo, su commit de origen y estado
`PENDING` mediante `clinical-review-handoff.json`. El plan final verifica ese
hash, copia la plantilla y ejecuta la revisión sobre el mismo `FINAL_HEAD` que
identifica el manifiesto premium. La publicación queda bloqueada si falta firma
humana, si el SHA final del registro no coincide con el HEAD/evidencia final o si
existe una observación clínica abierta. Una firma sobre el commit de Phase 4 no
es válida para certificar commits posteriores.
```

```powershell
git add docs/clinical/SIM-VBG-001-consequence-review-protocol.md
git commit -m "docs(clinical): definir gate humano de consecuencias"
```

- [ ] **Step 2: Ejecutar la verificación automatizada de Phase 4 sobre un árbol limpio**

```powershell
$dirty = git status --porcelain
if ($dirty) { $dirty; throw 'El árbol debe estar limpio antes de generar evidencia' }
$phase4Sha = (git rev-parse HEAD).Trim()
$evidence = ".superpowers/evidence/$phase4Sha/living-case"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$phase4Sha | Set-Content -Encoding UTF8 "$evidence/phase4-commit.txt"
```

```powershell
npm run test:backend -- apps/simulation/tests/test_world_state_mutation.py apps/simulation/tests/test_case_consequences.py apps/simulation/tests/test_game.py apps/simulation/tests/test_world.py apps/simulation/tests/test_instructor.py apps/simulation/tests/test_caso_pdf.py -q 2>&1 |
  Tee-Object "$evidence/backend-focused.log"
if ($LASTEXITCODE -ne 0) { throw 'backend-focused falló' }
```

Expected: PASS sin skips nuevos; estado inicial completo de cuatro actores, cobertura 19/19 con delta no nulo, clamps, reparación, locks, carreras, replay idempotente sin reaplicación y timeline relacional quedan cubiertos.

```powershell
npm run test:backend 2>&1 | Tee-Object "$evidence/backend-full.log"
if ($LASTEXITCODE -ne 0) { throw 'backend-full falló' }
```

Expected: suite backend completa PASS.

```powershell
npm run test:frontend 2>&1 | Tee-Object "$evidence/frontend-tests.log"
if ($LASTEXITCODE -ne 0) { throw 'frontend-tests falló' }
```

Expected: suite frontend completa PASS, sin handles abiertos.

```powershell
npm run build:frontend 2>&1 | Tee-Object "$evidence/frontend-build.log"
if ($LASTEXITCODE -ne 0) { throw 'frontend-build falló' }
```

Expected: PASS.

```powershell
npm run test:e2e -- premium-routes.e2e.ts full-case.e2e.ts --project=chromium --retries=0 2>&1 |
  Tee-Object "$evidence/playwright-routes.log"
if ($LASTEXITCODE -ne 0) { throw 'playwright-routes falló' }
```

Expected: 7/7 PASS y artefactos Playwright del mismo SHA.

No encadenar el siguiente gate si el anterior lanza una excepción; los cinco logs quedan asociados al SHA intermedio de `phase4-commit.txt`. Estos logs prueban el slice de caso vivo, no el HEAD final todavía inexistente.

- [ ] **Step 3: Ejecutar gates estáticos de ownership y semántica**

```powershell
$worldWriters = Get-ChildItem backend_django/apps/simulation/services -File -Filter *.py |
  Where-Object Name -ne 'world_state_mutation.py' |
  Select-String -Pattern 'AttemptWorldState\.objects\.(create|update|update_or_create|get_or_create)|\.flags_json\s*=|\b(state|world_state)\.save\s*\('
if ($worldWriters) { $worldWriters | Format-Table Path,LineNumber,Line; exit 1 }

$facades = Get-ChildItem frontend/src/app/features/simulator -Recurse -File -Filter *.ts |
  Select-String -Pattern 'LivingCaseFacade|NpcConsequenceController|SET_ACTOR_PRESENTATION'
if ($facades) { $facades | Format-Table Path,LineNumber,Line; exit 1 }

$toneAuthority = (Resolve-Path 'frontend/src/app/core/models/consequence-tone.model.ts').Path
$toneDeclarations = Get-ChildItem frontend/src/app -Recurse -File -Filter *.ts |
  Where-Object FullName -ne $toneAuthority |
  Select-String -Pattern 'export\s+type\s+ConsequenceTone\s*='
if ($toneDeclarations) { $toneDeclarations | Format-Table Path,LineNumber,Line; exit 1 }

$audioCoupling = Select-String -Path `
  backend_django/apps/simulation/services/clinical_consequence.py,`
  backend_django/apps/simulation/serializers/game_dtos.py,`
  frontend/src/app/features/simulator/clinical-consequence.util.ts `
  -Pattern 'audioCue|playAudio|new Audio'
if ($audioCoupling) { $audioCoupling | Format-Table Path,LineNumber,Line; exit 1 }
```

Expected: cuatro gates con exit 0; las proyecciones legacy de solo lectura pueden consultar `AttemptWorldState`, pero ningún servicio paralelo lo escribe. `ConsequenceTone` (`relief`, `steady`, `tension`, `rupture`) se declara únicamente en la autoridad compartida de Plan 1 y es el único contrato semántico que un plan de audio posterior puede mapear; este slice no reproduce audio ni guarda nombres de assets.

- [ ] **Step 4: Congelar el paquete clínico `PENDING` y escribir el handoff**

No solicitar firma ni editar campos clínicos en Phase 4. Crear una copia inmutable del protocolo y un manifiesto explícito para los planes posteriores:

```powershell
$phase4Sha = (git rev-parse HEAD).Trim()
$evidence = ".superpowers/evidence/$phase4Sha/living-case"
$protocol = "docs/clinical/SIM-VBG-001-consequence-review-protocol.md"
$protocolCopy = "$evidence/clinical-review-protocol.md"
$handoffPath = "$evidence/clinical-review-handoff.json"
$stableHandoffPath = ".superpowers/evidence/living-case-clinical-handoff.json"
$audioPlan = "docs/superpowers/plans/2026-07-13-audio-atmosphere-premium.md"
$finalPlan = "docs/superpowers/plans/2026-07-13-checkpoint-performance-acceptance.md"

if ((Get-Content "$evidence/phase4-commit.txt" -Raw).Trim() -ne $phase4Sha) {
  throw 'SHA de evidencia Phase 4 no coincide'
}
foreach ($required in @($protocol, $audioPlan, $finalPlan)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Falta recurso de handoff: $required" }
}
Copy-Item -LiteralPath $protocol -Destination $protocolCopy -Force
$protocolHash = (Get-FileHash -LiteralPath $protocol -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-FileHash -LiteralPath $protocolCopy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $protocolHash) {
  throw 'La copia congelada del protocolo no coincide'
}

$handoff = [ordered]@{
  schemaVersion = 1
  sourcePlan = "2026-07-13-living-case-npc-consequences.md"
  sourcePhase = 4
  status = "PENDING"
  phase4Commit = $phase4Sha
  protocolSource = $protocol
  protocolCopy = $protocolCopy
  protocolSha256 = $protocolHash
  phase4HandoffPath = $handoffPath
  stableHandoffPath = $stableHandoffPath
  nextPlan = $audioPlan
  finalAcceptancePlan = $finalPlan
  requiredReviewHead = "HEAD_AFTER_AUDIO_AND_CHECKPOINT"
  finalReviewPathTemplate = ".superpowers/external-validation/<FINAL_HEAD>/<sessionId>/clinical-review.md"
}
$handoffJson = $handoff | ConvertTo-Json -Depth 4
$handoffJson | Set-Content -Encoding UTF8 $handoffPath
$handoffJson | Set-Content -Encoding UTF8 $stableHandoffPath
```

Expected: `clinical-review-protocol.md` y `clinical-review-handoff.json` existen bajo el commit de Phase 4, el JSON dice `PENDING` y ninguna persona ha firmado todavía.

- [ ] **Step 5: Auditar el handoff pendiente y liberar Plan 5**

```powershell
$phase4Sha = (git rev-parse HEAD).Trim()
$evidence = ".superpowers/evidence/$phase4Sha/living-case"
$handoffPath = "$evidence/clinical-review-handoff.json"
$stableHandoffPath = ".superpowers/evidence/living-case-clinical-handoff.json"
$phase4HandoffJson = Get-Content -LiteralPath $handoffPath -Raw
$stableHandoffJson = Get-Content -LiteralPath $stableHandoffPath -Raw
if ($phase4HandoffJson.Trim() -ne $stableHandoffJson.Trim()) {
  throw 'El puntero estable no coincide con el handoff de Phase 4'
}
$handoff = $stableHandoffJson | ConvertFrom-Json

if ($handoff.status -ne 'PENDING') { throw 'Phase 4 debe entregar revisión clínica PENDING' }
if ($handoff.phase4Commit -ne $phase4Sha) { throw 'Commit de handoff no coincide' }
if ($handoff.requiredReviewHead -ne 'HEAD_AFTER_AUDIO_AND_CHECKPOINT') {
  throw 'El handoff no exige el HEAD final'
}
if (-not (Test-Path -LiteralPath $handoff.finalAcceptancePlan)) {
  throw 'Falta el plan final que consume el handoff'
}
$sourceHash = (Get-FileHash -LiteralPath $handoff.protocolSource -Algorithm SHA256).Hash.ToLowerInvariant()
$copyHash = (Get-FileHash -LiteralPath $handoff.protocolCopy -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $handoff.protocolSha256 -or $copyHash -ne $handoff.protocolSha256) {
  throw 'Hash del protocolo de handoff no coincide'
}
if (-not (Select-String -LiteralPath $handoff.protocolCopy -Pattern '^Estado del paquete Phase 4:\s+PENDING\s*$')) {
  throw 'El protocolo no conserva estado PENDING'
}
if (-not (Select-String -LiteralPath $handoff.protocolCopy -Pattern '^Resultado:\s+PENDIENTE\s*$')) {
  throw 'La plantilla clínica fue completada antes del HEAD final'
}
if (Select-String -LiteralPath $handoff.protocolCopy -Pattern '^Resultado:\s+(APROBADO|BLOQUEADO)\s*$') {
  throw 'Phase 4 no puede contener una decisión SME final'
}
if (git status --porcelain) { throw 'El árbol cambió después de la evidencia Phase 4' }
```

Expected: PASS con estado `PENDING` y un puntero estable consumible por el plan final. Este gate libera `2026-07-13-audio-atmosphere-premium.md` (Plan 5); no requiere ni simula aprobación SME.

El contrato de consumo para `2026-07-13-checkpoint-performance-acceptance.md` es vinculante: lee `.superpowers/evidence/living-case-clinical-handoff.json`; tras el último commit tracked de audio y checkpoint, su runner fija un HEAD limpio, verifica la matriz premium y conserva `clinicalSme: pending`; después verifica `protocolSha256`, copia la plantilla a `.superpowers/external-validation/<FINAL_HEAD>/<sessionId>/clinical-review.md`, exige que la persona SME juegue las tres rutas y revise las 19 opciones, y solo entonces acepta `Resultado: APROBADO`, firma no pendiente y `SHA revisado: <FINAL_HEAD>`. Un resultado `BLOQUEADO` obliga a un nuevo commit y a repetir toda la aceptación con otro HEAD. No se modifica el manifiesto automatizado ni se reutiliza una firma del commit de Phase 4.

## Revisión de consistencia del plan

| Requisito | Autoridad y prueba |
|---|---|
| Estado inicial y writers concurrentes | Task 1, primitive único y lock attempt → world state. |
| Decisión revisada, idempotente y exactly-once | Task 3, fingerprint, receipt allowlisted sin token, reattachment del token presentado, 409 y carreras PostgreSQL. |
| Actor real y consecuencia semántica | Task 2, catálogo cerrado de 19 opciones y validación de seed. |
| Estado relacional autoritativo por NPC | Tasks 1–4, cuatro estados iniciales completos, 19 deltas no nulos, clamp 0–100, DTO y timeline. |
| Fail-forward con reparación visible | Tasks 3, 6 y 8, dos decisiones reales y opciones restauradas. |
| Contratos backend/frontend y timeline | Task 4, DTOs y union `AttemptTimelineEventType`. |
| Runtime existente, sin controladores paralelos | Tasks 5 y 6, `ActorPresentationState` y `GameWorldPort`. |
| Reload sin replay | Tasks 3, 4 y 6, estado relacional persistido, hidratación corporal silenciosa, deduplicación por consequence id y replay que no reaplica delta. |
| Sin pistas antes de responder | Task 7, caracterización y scan estático. |
| Tres rutas completas y monitor liberado | Task 8, tabla exacta, `{ assertClean, dispose }`, 7 E2E. |
| Validez clínica | Task 9 congela protocolo/hash/handoff `PENDING`; el plan final ejecuta y firma la revisión SME sobre el HEAD posterior a audio y checkpoint. |

El slice de caso vivo queda listo para continuar a Plan 5 solo cuando Tasks 1–9 están completas, sus suites están verdes y el handoff clínico de Phase 4 pasa íntegro con estado `PENDING`. Este corte no exige firma SME y no declara aceptación integrada. La aceptación del programa ocurre exclusivamente en `2026-07-13-checkpoint-performance-acceptance.md`, sobre el HEAD final posterior a audio y checkpoint, cuando su matriz está verde y el registro humano de ese mismo HEAD queda firmado con `Resultado: APROBADO`.
