# Checkpoint Recovery, Performance, and Premium Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `SIM-VBG-001` conserve progreso sin duplicación ante red inestable y demostrar, con evidencia reproducible, rendimiento sostenido, accesibilidad y los gates premium aprobados.

**Architecture:** El checkpoint reutiliza la única primitiva `mutate_world_state`: bloquea siempre `SimulationAttempt` y después `AttemptWorldState`, valida sobre ese snapshot y conserva recibos idempotentes acotados en `flags_json`. El envelope porta posición y una proyección segura completa del estado ya autoritativo —referencia inmutable de personaje, evidencia, relación/presentación NPC, decisiones, consecuencias y reparación pendiente—; el servidor compara esa proyección dentro del lock y nunca reescribe dominio clínico desde el cliente. Angular separa durabilidad local de confirmación del servidor, mantiene una cola cancelable por generación con seis intentos automáticos máximos y coordina una sola pestaña escritora sin persistir tokens. La instrumentación solo existe en la configuración Angular `e2e`; un runner sobre HEAD limpio genera artefactos inmutables, los verifica y únicamente entonces promueve el manifiesto. La aceptación clínica permanece humana: después del runner, el plan consume el handoff Phase 4, verifica su hash y exige revisión SME firmada de las tres rutas y 19 opciones sobre ese mismo HEAD, sin autoaprobar ni mutar el manifest.

**Tech Stack:** Django REST Framework, PostgreSQL aislado, Angular 21, RxJS, Phaser 3, Jest, Node test runner, Playwright, Axe, NVDA manual.

---

## Prerrequisitos

Este es el último plan funcional del programa. Requiere que los planes de personajes, runtime, diálogo/HUD, caso vivo y audio estén integrados y verdes.

No ejecutar ninguna prueba contra una base compartida. Los comandos backend/E2E de este plan usan los runners aislados del repositorio.

El contrato relacional del plan de caso vivo es vinculante: `snapshot.npcs.states` contiene siempre y exactamente `familia-duelo`, `psicologa-acompanante`, `sobreviviente-consulta` y `profesional-psicosocial`. Cada actor porta `trust`, `tension`, `openness` (enteros 0–100), `available`, `emotion`, `pose` y `consequenceId`. Backend, repositorio local y E2E fallan cerrado si falta un actor/campo; checkpoint, restore y replay nunca calculan ni reaplican deltas.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `backend_django/apps/simulation/services/world_state_mutation.py` | Autoridad compartida de lock `attempt → world state` y fingerprint canónico. |
| `backend_django/apps/simulation/services/checkpoint_service.py` | Revisión, allowlist exacta de cuatro estados NPC completos, recibos idempotentes acotados y guardado atómico. |
| `backend_django/apps/simulation/services/world_service.py` | Validación espacial dentro del lock y delegación al checkpoint. |
| `backend_django/apps/simulation/views/game_views.py` | Recibir envelope y devolver conflicto 409 tipado. |
| `backend_django/apps/simulation/tests/test_checkpoint_recovery.py` | Validadores, replay, fingerprint, stale conflict y ausencia de eventos de posición. |
| `backend_django/apps/simulation/tests/test_world_state_mutation.py` | Carreras checkpoint/puerta/NPC/decisión sin pérdida de flags. |
| `backend_django/apps/simulation/tests/concurrency_helpers.py` | Barrera real entre transacciones independientes. |
| `frontend/src/app/core/models/simulation.model.ts` | Contratos de snapshot completo, `CheckpointRequest`, revisión y recibo. |
| `frontend/src/app/features/character/character-profile.repository.ts` | Resolver una referencia de personaje recuperada contra el manifest, sin cambiar el perfil vigente. |
| `frontend/src/app/core/api/simulation.service.ts` | PATCH versionado. |
| `frontend/src/app/features/simulator/checkpoint-fingerprint.ts` | Proyectar request y delegar SHA-256 al canonical JSON del runtime. |
| `frontend/src/app/features/simulator/checkpoint-snapshot.ts` | Adaptar snapshot GET→PATCH y ligar solo la referencia inmutable de personaje. |
| `frontend/src/app/features/simulator/runtime/canonical-json-sha256.ts` | Única implementación frontend de JSON canónico/SHA-256, propiedad del runtime previo. |
| `frontend/src/app/features/simulator/checkpoint-repository.ts` | Envelope local validado, TTL, cuota y limpieza sin secretos. |
| `frontend/src/app/features/simulator/checkpoint-writer-lease.ts` | Lease por pestaña con `localStorage` y `BroadcastChannel`. |
| `frontend/src/app/features/simulator/checkpoint-queue.service.ts` | Generaciones, abort, retry acotado, reconciliación y conflicto explícito. |
| `frontend/src/app/features/simulator/checkpoint-queue.service.spec.ts` | Offline, timeout, 409, replay y recovery. |
| `frontend/src/app/features/simulator/simulation-play.component.ts` | Flush en beats seguros y política local/ACK. |
| `frontend/src/app/features/simulator/save-status.component.ts` | `guardando/guardado/offline/retry manual/recuperado/conflicto`. |
| `frontend/src/environments/environment.ts` | Seam diagnóstico ya creado por audio, desactivado en builds normales. |
| `frontend/src/environments/environment.e2e.ts` | Seam diagnóstico ya creado por audio, habilitado solo en el stack aislado. |
| `frontend/angular.json` | Configuración build/serve `e2e` ya creada por audio; este plan la consume sin duplicarla. |
| `frontend/src/app/features/simulator/runtime/frame-metrics.ts` | Ring buffer y percentiles. |
| `frontend/src/app/features/simulator/runtime/frame-metrics.spec.ts` | Cálculo determinista de métricas. |
| `frontend/src/app/features/simulator/game-world.component.ts` | Alimentar métricas desde el loop; no decidir umbrales. |
| `scripts/verify-premium-performance.mjs` | Fallar si el JSON no cumple presupuesto. |
| `scripts/verify-premium-performance.test.mjs` | Tests del gate. |
| `frontend/e2e/reference-hardware-profiles.json` | Perfiles físicos versionados admitidos para certificar el soak de referencia. |
| `frontend/e2e/support/reference-hardware-attestation.ts` | Separar y adjuntar identidad física de referencia e identidad del runtime del soak. |
| `scripts/capture-reference-hardware.ps1` | Captura CIM mínima, sin nombre de equipo, usuario ni seriales. |
| `scripts/verify-reference-performance.mjs` | Gate read-only y fail-closed de hardware, navegador, GPU, HEAD, run y soak. |
| `frontend/e2e/premium-recovery.e2e.ts` | Fault injection y resume. |
| `scripts/checkpoint-boundary.test.mjs` | Gate estático: snapshot completo, canonical único, retry finito y cero secretos persistidos. |
| `frontend/e2e/premium-acceptance.e2e.ts` | Viewports, consola/red, chatbot, Axe y evidencia visual. |
| `frontend/e2e/support/premium-evidence-test.ts` | Fixture y adjuntos nombrados ligados al Git SHA esperado. |
| `frontend/e2e/support/persist-test-artifact.ts` | Escribir bytes físicos bajo `testInfo.outputPath` antes de adjuntar al reporter. |
| `frontend/e2e/support/premium-case-flow.ts` | Hook tipado de las seis capturas visuales exactas por viewport. |
| `scripts/run-premium-verification.mjs` | Matriz limpia, conteos, runtime profiles y manifest inmutable por HEAD/run. |
| `scripts/verify-premium-evidence-identity.mjs` | Exigir los seis artefactos, mismo SHA, GPU/URL/credencial segura y cero secretos. |
| `scripts/verify-clinical-review.mjs` | Validar handoff/hash, cobertura humana 3 rutas/19 opciones, firma y SHA final sin autoaprobar. |
| `docs/quality/premium-external-validation/owner-acceptance.template.md` | Instrumento humano del recorrido continuo del dueño sobre `FINAL_HEAD`. |
| `docs/quality/premium-external-validation/nvda-review.template.md` | Instrumento manual NVDA de las superficies críticas. |
| `docs/quality/premium-external-validation/participant-study.schema.json` | Contrato exacto del estudio de cinco participantes independientes. |
| `scripts/verify-premium-external-validation.mjs` | Validar los gates humanos sin escribir, firmar ni autoaprobar evidencia. |
| `docs/audits/2026-07-13-premium-gameplay-evidence.md` | Índice de evidencia del mismo commit. |

### Task 1: Cerrar el checkpoint sobre la primitiva transaccional compartida

**Files:**
- Create: `backend_django/apps/simulation/services/checkpoint_service.py`
- Create: `backend_django/apps/simulation/tests/test_checkpoint_recovery.py`
- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/tests/test_world_state_mutation.py`

- [ ] **Step 1: Escribir tests rojos del contrato**

```python
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest
from rest_framework.exceptions import APIException, ValidationError

from apps.simulation.models import AttemptEvent, DecisionOption, SimulationAttempt
from apps.simulation.services import checkpoint_service, game_service, world_service
from apps.simulation.services.case_effects import (
    NPC_ACTOR_KEYS,
    NPC_STATE_KEYS,
    initial_npc_states,
)
from apps.simulation.services.world_state_mutation import canonical_request_fingerprint
from .test_world import _start, case_version_id, cl, estudiante


CHARACTER_REF = {
    "schemaVersion": 1,
    "manifestVersion": "1.0.0",
    "characterId": "valentina",
    "variantId": "base",
    "contentHash": "a" * 64,
}


@pytest.fixture
def world_context(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, raw_token = _start(client, case_version_id)
    world = world_service.get_world(attempt_id, raw_token, estudiante)
    return SimpleNamespace(
        attempt_id=attempt_id,
        attempt=SimulationAttempt.objects.get(pk=attempt_id),
        actor=estudiante,
        client=client,
        raw_token=raw_token,
        map_key=world["map"]["key"],
        snapshot={
            **world["checkpointSnapshot"],
            "character": CHARACTER_REF,
        },
    )

def test_checkpoint_fingerprint_vector():
    assert canonical_request_fingerprint({
        "currentMapKey": "hospital-urgencias",
        "expectedRevision": 0,
        "playerX": 320,
        "playerY": 240,
        "reason": "periodic",
        "snapshot": {
            "schemaVersion": 1,
            "character": CHARACTER_REF,
            "evidence": {
                "inventory": [],
                "inspectedObjectKeys": [],
                "viewedDialogueKeys": [],
                "usedToolKeys": [],
            },
            "npcs": {"viewedKeys": [], "states": initial_npc_states()},
            "clinical": {
                "currentNodeId": 101,
                "decisionRevision": 0,
                "decisions": [],
                "lastConsequence": None,
                "pendingRepair": None,
            },
        },
    }) == "ed8f2d1ff1c074c7a711c62921d1202290b35589bc166771c4c06a1f09f0d606"


@pytest.mark.django_db
def test_checkpoint_snapshot_is_complete_and_secret_free(world_context):
    snapshot = world_context.snapshot
    assert set(snapshot) == {"schemaVersion", "character", "evidence", "npcs", "clinical"}
    assert set(snapshot["evidence"]) == {
        "inventory", "inspectedObjectKeys", "viewedDialogueKeys", "usedToolKeys",
    }
    assert set(snapshot["npcs"]) == {"viewedKeys", "states"}
    assert set(snapshot["npcs"]["states"]) == set(NPC_ACTOR_KEYS)
    for state in snapshot["npcs"]["states"].values():
        assert set(state) == set(NPC_STATE_KEYS)
        assert all(
            isinstance(state[field], int)
            and not isinstance(state[field], bool)
            and 0 <= state[field] <= 100
            for field in ("trust", "tension", "openness")
        )
    assert set(snapshot["clinical"]) == {
        "currentNodeId", "decisionRevision", "decisions",
        "lastConsequence", "pendingRepair",
    }
    raw = json.dumps(snapshot)
    assert "attemptToken" not in raw
    assert "psychosim_token" not in raw
    assert "password" not in raw.lower()


@pytest.mark.parametrize("mutate", [
    lambda value: value["clinical"].__setitem__("attemptToken", "secret"),
    lambda value: value["evidence"].__setitem__("inventory", ["PAP", "PAP"]),
    lambda value: value["npcs"].__setitem__("states", {"actor": {"pose": "idle"}}),
    lambda value: value["npcs"]["states"]["familia-duelo"].pop("trust"),
    lambda value: value["npcs"]["states"]["familia-duelo"].__setitem__("tension", 101),
    lambda value: value["npcs"]["states"].pop("profesional-psicosocial"),
    lambda value: value["npcs"]["states"].__setitem__(
        "actor-extra",
        deepcopy(value["npcs"]["states"]["familia-duelo"]),
    ),
    lambda value: value["clinical"].__setitem__("decisions", [{"fingerprint": "bad"}]),
])
def test_checkpoint_rejects_malformed_or_sensitive_nested_snapshot(
    world_context, mutate,
):
    malformed = deepcopy(world_context.snapshot)
    mutate(malformed)
    with pytest.raises(ValidationError):
        checkpoint_service.validated_snapshot(malformed)


@pytest.mark.django_db
@pytest.mark.parametrize(("section", "field", "value"), [
    ("evidence", "inventory", ["PAP"]),
    ("evidence", "inspectedObjectKeys", ["familia-crisis"]),
    ("npcs", "viewedKeys", ["enfermera-urgencias"]),
    ("npcs", "states", {"familia-duelo": {
        **initial_npc_states()["familia-duelo"], "trust": 47,
    }, **{
        key: state
        for key, state in initial_npc_states().items()
        if key != "familia-duelo"
    }}),
    ("clinical", "decisions", [{
        "idempotencyKey": "decision-fake",
        "fingerprint": "f" * 64,
        "decisionRevision": 1,
        "optionKey": "fake",
        "sourceNodeId": 1,
        "consequenceId": "decision:1:fake",
    }]),
    ("clinical", "lastConsequence", {"id": "forged"}),
    ("clinical", "pendingRepair", {
        "sourceNodeId": 1, "actorKey": "familia-duelo",
        "prompt": "forged", "consequenceId": "forged",
    }),
])
def test_checkpoint_rejects_tampered_authoritative_snapshot(
    world_context, section, field, value,
):
    tampered = deepcopy(world_context.snapshot)
    tampered[section][field] = value
    with pytest.raises(APIException) as exc:
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 320, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=0, idempotency_key="cp-tampered", reason="periodic",
            snapshot=tampered,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "checkpoint_snapshot_conflict"


@pytest.mark.django_db
def test_checkpoint_round_trip_and_replay_preserve_relational_state_once(
    world_context,
):
    decision = DecisionOption.objects.get(
        case_version_id=world_context.attempt.case_version_id,
        option_key="h1-noticia-sin-protocolo",
    )
    game_service.choose_decision(
        world_context.attempt_id,
        world_context.raw_token,
        decision.id,
        world_context.actor,
        decision_revision=0,
        idempotency_key="checkpoint-relation-decision",
    )
    before = world_service.get_world(
        world_context.attempt_id,
        world_context.raw_token,
        world_context.actor,
    )
    snapshot = {**before["checkpointSnapshot"], "character": CHARACTER_REF}
    internal_name_drift = deepcopy(snapshot)
    last_consequence = internal_name_drift["clinical"]["lastConsequence"]
    last_consequence["relationState"] = last_consequence.pop("relationalState")
    with pytest.raises(ValidationError):
        checkpoint_service.validated_snapshot(internal_name_drift)
    request = dict(
        current_map_key=before["map"]["key"],
        expected_revision=before["revision"],
        idempotency_key="checkpoint-relation-round-trip",
        reason="decision",
        snapshot=snapshot,
    )
    first = world_service.update_position(
        world_context.attempt_id,
        world_context.raw_token,
        before["player"]["x"],
        before["player"]["y"],
        world_context.actor,
        **request,
    )
    replay = world_service.update_position(
        world_context.attempt_id,
        world_context.raw_token,
        before["player"]["x"],
        before["player"]["y"],
        world_context.actor,
        **request,
    )
    restored = world_service.get_world(
        world_context.attempt_id,
        world_context.raw_token,
        world_context.actor,
    )

    expected_states = snapshot["npcs"]["states"]
    assert set(expected_states) == set(NPC_ACTOR_KEYS)
    assert expected_states["familia-duelo"] == {
        "trust": 24, "tension": 88, "openness": 20, "available": True,
        "emotion": "closed", "pose": "react",
        "consequenceId": "decision:1:h1-noticia-sin-protocolo",
    }
    assert first["checkpointSnapshot"]["npcs"]["states"] == expected_states
    assert replay["checkpointSnapshot"]["npcs"]["states"] == expected_states
    assert restored["checkpointSnapshot"]["npcs"]["states"] == expected_states
    assert replay["checkpointReceipt"]["replayed"] is True


@pytest.mark.django_db
def test_checkpoint_increments_revision_without_position_event(world_context):
    result = world_service.update_position(
        world_context.attempt_id,
        world_context.raw_token,
        320,
        240,
        world_context.actor,
        current_map_key=world_context.map_key,
        expected_revision=0,
        idempotency_key="cp-1",
        reason="periodic",
        snapshot=world_context.snapshot,
    )

    assert result["revision"] == 1
    assert result["checkpointReceipt"]["acceptedRevision"] == 1
    assert result["checkpointReceipt"]["idempotencyKey"] == "cp-1"
    assert AttemptEvent.objects.filter(
        attempt_id=world_context.attempt_id,
        event_type="WORLD_POSITION_UPDATED",
    ).count() == 0


@pytest.mark.django_db
def test_same_key_same_payload_replays_after_a_newer_checkpoint(world_context):
    first = world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 320, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=0, idempotency_key="cp-1", reason="periodic",
        snapshot=world_context.snapshot,
    )
    second = world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 324, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=1, idempotency_key="cp-2", reason="periodic",
        snapshot=world_context.snapshot,
    )
    replay = world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 320, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=0, idempotency_key="cp-1", reason="periodic",
        snapshot=world_context.snapshot,
    )

    assert first["checkpointReceipt"]["acceptedRevision"] == 1
    assert second["revision"] == 2
    assert replay["revision"] == 2
    assert replay["checkpointReceipt"]["acceptedRevision"] == 1
    assert replay["checkpointReceipt"]["replayed"] is True
    assert replay["player"] == second["player"]


@pytest.mark.django_db
def test_same_key_with_different_payload_is_a_conflict(world_context):
    world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 320, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=0, idempotency_key="cp-1", reason="periodic",
        snapshot=world_context.snapshot,
    )

    with pytest.raises(APIException) as exc:
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 321, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=0, idempotency_key="cp-1", reason="periodic",
            snapshot=world_context.snapshot,
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "checkpoint_idempotency_mismatch"


@pytest.mark.django_db
def test_character_reference_binds_once_per_attempt(world_context):
    first = world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 320, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=0, idempotency_key="cp-character-1", reason="periodic",
        snapshot=world_context.snapshot,
    )
    changed = deepcopy(first["checkpointSnapshot"])
    changed["character"] = {
        **changed["character"],
        "characterId": "felipe",
        "contentHash": "b" * 64,
    }
    with pytest.raises(APIException) as exc:
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 320, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=1, idempotency_key="cp-character-2", reason="periodic",
            snapshot=changed,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "checkpoint_character_conflict"


@pytest.mark.django_db
def test_new_key_with_stale_revision_is_a_conflict(world_context):
    world_service.update_position(
        world_context.attempt_id, world_context.raw_token, 320, 240,
        world_context.actor, current_map_key=world_context.map_key,
        expected_revision=0, idempotency_key="cp-1", reason="periodic",
        snapshot=world_context.snapshot,
    )
    with pytest.raises(APIException) as exc:
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 322, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=0, idempotency_key="cp-2", reason="periodic",
            snapshot=world_context.snapshot,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail == {
        "code": "checkpoint_revision_conflict",
        "currentRevision": 1,
    }


@pytest.mark.django_db
@pytest.mark.parametrize("value", [True, -1, 1.5, "1", None])
def test_expected_revision_requires_a_non_negative_integer(world_context, value):
    with pytest.raises(ValidationError):
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 320, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=value, idempotency_key="cp-valid", reason="periodic",
            snapshot=world_context.snapshot,
        )


@pytest.mark.django_db
@pytest.mark.parametrize("value", ["", " ", "x" * 129, "key with spaces", None])
def test_idempotency_key_is_bounded_and_safe(world_context, value):
    with pytest.raises(ValidationError):
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 320, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=0, idempotency_key=value, reason="periodic",
            snapshot=world_context.snapshot,
        )


@pytest.mark.django_db
@pytest.mark.parametrize("value", ["", "unknown", True, None])
def test_reason_is_required_and_enumerated(world_context, value):
    with pytest.raises(ValidationError):
        world_service.update_position(
            world_context.attempt_id, world_context.raw_token, 320, 240,
            world_context.actor, current_map_key=world_context.map_key,
            expected_revision=0, idempotency_key="cp-valid", reason=value,
            snapshot=world_context.snapshot,
        )
```

El fixture reutiliza exactamente el seed publicado y los helpers de
`test_world.py`; no introduce factories paralelas ni inventa un mapa distinto a
`SIM-VBG-001`.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm run test:backend -- apps/simulation/tests/test_checkpoint_recovery.py -q`

Expected: FAIL por módulo inexistente y firmas todavía no versionadas.

- [ ] **Step 3: Implementar el servicio transaccional**

```python
# backend_django/apps/simulation/services/checkpoint_service.py
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
import json
import re
from typing import Callable

from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.simulation.serializers.game_dtos import consequence_dto
from apps.simulation.services.case_effects import (
    NPC_ACTOR_KEYS,
    NPC_STATE_KEYS,
    npc_states_from_flags,
)
from apps.simulation.services.world_state_mutation import (
    WorldMutationContext,
    WorldMutationResult,
    canonical_request_fingerprint,
    mutate_world_state,
)
from shared.jsonutils import read_string_list

CHECKPOINT_REASONS = frozenset({
    "periodic", "pause", "room", "dialogue", "decision",
    "repair", "pagehide", "safe-exit",
})
IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
MAX_CHECKPOINT_RECEIPTS = 32
MAX_SNAPSHOT_BYTES = 65_536
SNAPSHOT_KEYS = frozenset({"schemaVersion", "character", "evidence", "npcs", "clinical"})
CHARACTER_KEYS = frozenset({
    "schemaVersion", "manifestVersion", "characterId", "variantId", "contentHash",
})
SENSITIVE_KEYS = frozenset({
    "attempttoken", "authorization", "cookie", "password",
    "accesstoken", "refreshtoken", "credential",
})


class CheckpointConflict(APIException):
    status_code = 409
    default_code = "checkpoint_revision_conflict"

    def __init__(self, code: str, revision: int):
        super().__init__({"code": code, "currentRevision": revision})


@dataclass(frozen=True)
class CheckpointPayload:
    expected_revision: int
    idempotency_key: str
    player_x: int
    player_y: int
    current_map_key: str
    reason: str
    snapshot: dict


@dataclass(frozen=True)
class CheckpointReceipt:
    idempotency_key: str
    request_fingerprint: str
    accepted_revision: int
    player_x: int
    player_y: int
    current_map_key: str
    reason: str
    accepted_at: str
    replayed: bool = False


@dataclass(frozen=True)
class CheckpointResult:
    revision: int
    receipt: CheckpointReceipt


def _require_non_negative_int(value, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValidationError({field: "Debe ser un entero no negativo."})
    return value


def _require_relation_score(value, field: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not 0 <= value <= 100
    ):
        raise ValidationError({field: "Debe ser un entero entre 0 y 100."})
    return value


def _require_idempotency_key(value) -> str:
    if not isinstance(value, str) or not IDEMPOTENCY_KEY_RE.fullmatch(value):
        raise ValidationError({
            "idempotencyKey": "Use 1-128 caracteres A-Z, a-z, 0-9, punto, guion, guion bajo o dos puntos.",
        })
    return value


def _require_reason(value) -> str:
    if not isinstance(value, str) or value not in CHECKPOINT_REASONS:
        raise ValidationError({
            "reason": "Debe ser uno de: " + ", ".join(sorted(CHECKPOINT_REASONS)),
        })
    return value


def _assert_secret_free(value, path="snapshot"):
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in SENSITIVE_KEYS:
                raise ValidationError({path: f"Campo sensible no permitido: {key}"})
            _assert_secret_free(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _assert_secret_free(child, f"{path}[{index}]")


def _validated_character_ref(value) -> dict:
    if not isinstance(value, dict) or set(value) != CHARACTER_KEYS:
        raise ValidationError({"snapshot.character": "Referencia de personaje incompleta."})
    if value.get("schemaVersion") != 1:
        raise ValidationError({"snapshot.character.schemaVersion": "Debe ser 1."})
    for field, pattern, limit in (
        ("manifestVersion", r"^[0-9]+\.[0-9]+\.[0-9]+$", 32),
        ("characterId", r"^[a-z0-9-]+$", 64),
        ("variantId", r"^[a-z0-9-]+$", 64),
        ("contentHash", r"^[a-f0-9]{64}$", 64),
    ):
        item = value.get(field)
        if not isinstance(item, str) or len(item) > limit or not re.fullmatch(pattern, item):
            raise ValidationError({f"snapshot.character.{field}": "Formato inválido."})
    return deepcopy(value)


def _exact_dict(value, keys, path):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValidationError({path: "Forma exacta inválida."})
    return value


def _safe_id(value, path):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", value):
        raise ValidationError({path: "Identificador inválido."})
    return value


def _validated_actor_key(value, path):
    actor_key = _safe_id(value, path)
    if actor_key not in NPC_ACTOR_KEYS:
        raise ValidationError({path: "Actor relacional desconocido."})
    return actor_key


def _safe_text(value, path, limit=2_000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValidationError({path: "Texto inválido."})
    return value


def _string_list(value, path, limit=128):
    if not isinstance(value, list) or len(value) > limit:
        raise ValidationError({path: "Lista inválida."})
    result = [_safe_id(item, f"{path}[]") for item in value]
    if len(set(result)) != len(result):
        raise ValidationError({path: "No admite duplicados."})
    return result


def _validated_evidence(value):
    value = _exact_dict(value, {
        "inventory", "inspectedObjectKeys", "viewedDialogueKeys", "usedToolKeys",
    }, "snapshot.evidence")
    return {
        key: _string_list(value[key], f"snapshot.evidence.{key}")
        for key in (
            "inventory", "inspectedObjectKeys", "viewedDialogueKeys", "usedToolKeys",
        )
    }


def _validated_npcs(value):
    value = _exact_dict(value, {"viewedKeys", "states"}, "snapshot.npcs")
    states = value["states"]
    if not isinstance(states, dict) or set(states) != set(NPC_ACTOR_KEYS):
        raise ValidationError({
            "snapshot.npcs.states": "Debe contener exactamente los cuatro NPC relacionales.",
        })
    projected = {}
    for actor_key in NPC_ACTOR_KEYS:
        _safe_id(actor_key, "snapshot.npcs.states.actorKey")
        state = states[actor_key]
        state = _exact_dict(
            state,
            NPC_STATE_KEYS,
            f"snapshot.npcs.states.{actor_key}",
        )
        if state["pose"] not in {"idle", "react"} or not isinstance(state["available"], bool):
            raise ValidationError({f"snapshot.npcs.states.{actor_key}": "Estado inválido."})
        consequence_id = state["consequenceId"]
        if consequence_id is not None:
            consequence_id = _safe_id(
                consequence_id,
                f"snapshot.npcs.states.{actor_key}.consequenceId",
            )
        projected[actor_key] = {
            "trust": _require_relation_score(
                state["trust"], f"snapshot.npcs.states.{actor_key}.trust",
            ),
            "tension": _require_relation_score(
                state["tension"], f"snapshot.npcs.states.{actor_key}.tension",
            ),
            "openness": _require_relation_score(
                state["openness"], f"snapshot.npcs.states.{actor_key}.openness",
            ),
            "available": state["available"],
            "emotion": _safe_id(
                state["emotion"], f"snapshot.npcs.states.{actor_key}.emotion",
            ),
            "pose": state["pose"],
            "consequenceId": consequence_id,
        }
    return {
        "viewedKeys": _string_list(value["viewedKeys"], "snapshot.npcs.viewedKeys"),
        "states": projected,
    }


def _validated_relation_delta(value, path):
    value = _exact_dict(
        value,
        {"trust", "tension", "openness", "available"},
        path,
    )
    projected = {}
    for field in ("trust", "tension", "openness"):
        delta = value[field]
        if (
            isinstance(delta, bool)
            or not isinstance(delta, int)
            or not -100 <= delta <= 100
        ):
            raise ValidationError({f"{path}.{field}": "Delta inválido."})
        projected[field] = delta
    if not any(projected.values()):
        raise ValidationError({path: "El delta no puede ser nulo."})
    available = value["available"]
    if available is not None and not isinstance(available, bool):
        raise ValidationError({f"{path}.available": "Override inválido."})
    projected["available"] = available
    return projected


def _validated_relation_state(value, path):
    value = _exact_dict(
        value,
        {"trust", "tension", "openness", "available"},
        path,
    )
    if not isinstance(value["available"], bool):
        raise ValidationError({f"{path}.available": "Debe ser booleano."})
    return {
        field: _require_relation_score(value[field], f"{path}.{field}")
        for field in ("trust", "tension", "openness")
    } | {"available": value["available"]}


def _validated_consequence(value):
    if value is None:
        return None
    value = _exact_dict(value, {
        "id", "actorKey", "emotion", "pose", "tone", "announcement",
        "relationDelta", "relationalState", "repairAvailable", "repairPrompt",
        "repaired", "optionKey", "sourceNodeId", "occurredAt",
    }, "snapshot.clinical.lastConsequence")
    if value["pose"] != "react" or value["tone"] not in {
        "relief", "steady", "tension", "rupture",
    }:
        raise ValidationError({"snapshot.clinical.lastConsequence": "Presentación inválida."})
    if not isinstance(value["repairAvailable"], bool) or not isinstance(value["repaired"], bool):
        raise ValidationError({"snapshot.clinical.lastConsequence": "Booleano inválido."})
    repair_prompt = value["repairPrompt"]
    if repair_prompt is not None:
        repair_prompt = _safe_text(repair_prompt, "snapshot.clinical.repairPrompt")
    occurred_at = _safe_text(value["occurredAt"], "snapshot.clinical.occurredAt", 64)
    try:
        datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError({"snapshot.clinical.occurredAt": "ISO-8601 inválido."}) from exc
    return {
        **deepcopy(value),
        "id": _safe_id(value["id"], "snapshot.clinical.consequence.id"),
        "actorKey": _validated_actor_key(
            value["actorKey"], "snapshot.clinical.consequence.actorKey",
        ),
        "emotion": _safe_id(value["emotion"], "snapshot.clinical.consequence.emotion"),
        "announcement": _safe_text(
            value["announcement"], "snapshot.clinical.consequence.announcement",
        ),
        "relationDelta": _validated_relation_delta(
            value["relationDelta"], "snapshot.clinical.consequence.relationDelta",
        ),
        "relationalState": _validated_relation_state(
            value["relationalState"], "snapshot.clinical.consequence.relationalState",
        ),
        "repairPrompt": repair_prompt,
        "optionKey": _safe_id(value["optionKey"], "snapshot.clinical.consequence.optionKey"),
        "sourceNodeId": _require_non_negative_int(
            value["sourceNodeId"], "snapshot.clinical.consequence.sourceNodeId",
        ),
        "occurredAt": occurred_at,
    }


def _validated_pending_repair(value):
    if value is None:
        return None
    value = _exact_dict(value, {
        "sourceNodeId", "actorKey", "prompt", "consequenceId",
    }, "snapshot.clinical.pendingRepair")
    return {
        "sourceNodeId": _require_non_negative_int(
            value["sourceNodeId"], "snapshot.clinical.pendingRepair.sourceNodeId",
        ),
        "actorKey": _validated_actor_key(
            value["actorKey"], "snapshot.clinical.pendingRepair.actorKey",
        ),
        "prompt": _safe_text(value["prompt"], "snapshot.clinical.pendingRepair.prompt"),
        "consequenceId": _safe_id(
            value["consequenceId"], "snapshot.clinical.pendingRepair.consequenceId",
        ),
    }


def _validated_clinical(value):
    value = _exact_dict(value, {
        "currentNodeId", "decisionRevision", "decisions",
        "lastConsequence", "pendingRepair",
    }, "snapshot.clinical")
    decisions = value["decisions"]
    if not isinstance(decisions, list) or len(decisions) > 32:
        raise ValidationError({"snapshot.clinical.decisions": "Lista inválida."})
    projected = []
    for item in decisions:
        item = _exact_dict(item, {
            "idempotencyKey", "fingerprint", "decisionRevision",
            "optionKey", "sourceNodeId", "consequenceId",
        }, "snapshot.clinical.decisions[]")
        fingerprint = item["fingerprint"]
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            raise ValidationError({"snapshot.clinical.decisions.fingerprint": "SHA-256 inválido."})
        projected.append({
            "idempotencyKey": _safe_id(item["idempotencyKey"], "snapshot.clinical.idempotencyKey"),
            "fingerprint": fingerprint,
            "decisionRevision": _require_non_negative_int(
                item["decisionRevision"], "snapshot.clinical.decisionRevision",
            ),
            "optionKey": _safe_id(item["optionKey"], "snapshot.clinical.optionKey"),
            "sourceNodeId": _require_non_negative_int(
                item["sourceNodeId"], "snapshot.clinical.sourceNodeId",
            ),
            "consequenceId": _safe_id(
                item["consequenceId"], "snapshot.clinical.consequenceId",
            ),
        })
    keys = [item["idempotencyKey"] for item in projected]
    if len(set(keys)) != len(keys):
        raise ValidationError({"snapshot.clinical.decisions": "Recibos duplicados."})
    return {
        "currentNodeId": _require_non_negative_int(
            value["currentNodeId"], "snapshot.clinical.currentNodeId",
        ),
        "decisionRevision": _require_non_negative_int(
            value["decisionRevision"], "snapshot.clinical.decisionRevision",
        ),
        "decisions": projected,
        "lastConsequence": _validated_consequence(value["lastConsequence"]),
        "pendingRepair": _validated_pending_repair(value["pendingRepair"]),
    }


def validated_snapshot(value) -> dict:
    if not isinstance(value, dict) or set(value) != SNAPSHOT_KEYS:
        raise ValidationError({"snapshot": "Debe contener schemaVersion, character, evidence, npcs y clinical."})
    if value.get("schemaVersion") != 1:
        raise ValidationError({"snapshot.schemaVersion": "Debe ser 1."})
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise ValidationError({"snapshot": "Supera 65536 bytes."})
    _assert_secret_free(value)
    return {
        "schemaVersion": 1,
        "character": _validated_character_ref(value.get("character")),
        "evidence": _validated_evidence(value.get("evidence")),
        "npcs": _validated_npcs(value.get("npcs")),
        "clinical": _validated_clinical(value.get("clinical")),
    }


def _decision_refs(flags: dict) -> list[dict]:
    receipts = flags.get("decisionReceipts")
    if not isinstance(receipts, dict):
        return []
    projected = []
    for key, receipt in receipts.items():
        if not isinstance(key, str) or not isinstance(receipt, dict):
            continue
        body = receipt.get("body")
        consequence = body.get("consequence") if isinstance(body, dict) else None
        revision = body.get("decisionRevision") if isinstance(body, dict) else None
        fingerprint = receipt.get("fingerprint")
        if not (
            isinstance(consequence, dict)
            and isinstance(revision, int) and not isinstance(revision, bool)
            and isinstance(fingerprint, str) and re.fullmatch(r"[a-f0-9]{64}", fingerprint)
            and isinstance(consequence.get("optionKey"), str)
            and isinstance(consequence.get("sourceNodeId"), int)
            and isinstance(consequence.get("id"), str)
        ):
            continue
        projected.append({
            "idempotencyKey": key,
            "fingerprint": fingerprint,
            "decisionRevision": revision,
            "optionKey": consequence.get("optionKey"),
            "sourceNodeId": consequence.get("sourceNodeId"),
            "consequenceId": consequence.get("id"),
        })
    return sorted(projected, key=lambda item: (item["decisionRevision"], item["idempotencyKey"]))


def _npc_state_projection(flags: dict) -> dict:
    if "npcStates" not in flags:
        raise ValidationError({"npcStates": "Falta el estado relacional autoritativo."})
    states = npc_states_from_flags(flags)
    if set(states) != set(NPC_ACTOR_KEYS):
        raise ValidationError({"npcStates": "Catálogo relacional incompleto."})
    return {
        actor_key: {
            field: deepcopy(states[actor_key][field])
            for field in NPC_STATE_KEYS
        }
        for actor_key in NPC_ACTOR_KEYS
    }


def authoritative_snapshot(attempt, state, flags: dict) -> dict:
    character = flags.get("checkpointCharacterRef")
    character = deepcopy(character) if isinstance(character, dict) else None
    pending = flags.get("pendingRepair")
    pending = {
        "sourceNodeId": pending.get("sourceNodeId"),
        "actorKey": pending.get("actorKey"),
        "prompt": pending.get("prompt"),
        "consequenceId": pending.get("consequenceId"),
    } if isinstance(pending, dict) else None
    return {
        "schemaVersion": 1,
        "character": character,
        "evidence": {
            "inventory": read_string_list(state.inventory_json),
            "inspectedObjectKeys": read_string_list(state.inspected_object_keys_json),
            "viewedDialogueKeys": read_string_list(state.viewed_dialogue_keys_json),
            "usedToolKeys": read_string_list(state.used_tool_keys_json),
        },
        "npcs": {
            "viewedKeys": list(flags.get("viewedNpcKeys", []))
                if isinstance(flags.get("viewedNpcKeys"), list) else [],
            "states": _npc_state_projection(flags),
        },
        "clinical": {
            "currentNodeId": attempt.current_node_id,
            "decisionRevision": int(flags.get("decisionRevision", 0)),
            "decisions": _decision_refs(flags),
            "lastConsequence": consequence_dto(flags.get("lastConsequence")),
            "pendingRepair": pending,
        },
    }


def validated_payload(
    *, expected_revision, idempotency_key, player_x, player_y,
    current_map_key, reason, snapshot,
) -> CheckpointPayload:
    map_key = current_map_key.strip() if isinstance(current_map_key, str) else ""
    if not map_key or len(map_key) > 128:
        raise ValidationError({"currentMapKey": "Es obligatorio y admite máximo 128 caracteres."})
    return CheckpointPayload(
        expected_revision=_require_non_negative_int(expected_revision, "expectedRevision"),
        idempotency_key=_require_idempotency_key(idempotency_key),
        player_x=_require_non_negative_int(player_x, "playerX"),
        player_y=_require_non_negative_int(player_y, "playerY"),
        current_map_key=map_key,
        reason=_require_reason(reason),
        snapshot=validated_snapshot(snapshot),
    )


def _fingerprint(payload: CheckpointPayload) -> str:
    return canonical_request_fingerprint({
        "currentMapKey": payload.current_map_key,
        "expectedRevision": payload.expected_revision,
        "playerX": payload.player_x,
        "playerY": payload.player_y,
        "reason": payload.reason,
        "snapshot": payload.snapshot,
    })


def _receipts(flags: dict) -> list[dict]:
    raw = flags.get("checkpointReceipts")
    return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []


def checkpoint_revision(flags: dict) -> int:
    meta = flags.get("checkpointMeta")
    value = meta.get("revision", 0) if isinstance(meta, dict) else 0
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def commit_checkpoint(
    attempt_id,
    payload: CheckpointPayload,
    validate_locked: Callable[[WorldMutationContext, CheckpointPayload], None],
) -> WorldMutationResult[CheckpointResult]:
    fingerprint = _fingerprint(payload)

    def mutation(ctx: WorldMutationContext) -> CheckpointResult:
        revision = checkpoint_revision(ctx.flags)
        receipts = _receipts(ctx.flags)
        existing = next(
            (item for item in receipts if item.get("idempotencyKey") == payload.idempotency_key),
            None,
        )
        if existing is not None:
            if existing.get("requestFingerprint") != fingerprint:
                raise CheckpointConflict("checkpoint_idempotency_mismatch", revision)
            return CheckpointResult(
                revision=revision,
                receipt=CheckpointReceipt(
                    idempotency_key=existing["idempotencyKey"],
                    request_fingerprint=existing["requestFingerprint"],
                    accepted_revision=existing["acceptedRevision"],
                    player_x=existing["playerX"],
                    player_y=existing["playerY"],
                    current_map_key=existing["currentMapKey"],
                    reason=existing["reason"],
                    accepted_at=existing["acceptedAt"],
                    replayed=True,
                ),
            )
        if payload.expected_revision != revision:
            raise CheckpointConflict("checkpoint_revision_conflict", revision)

        current_snapshot = authoritative_snapshot(ctx.attempt, ctx.state, ctx.flags)
        bound_character = current_snapshot["character"]
        if bound_character is not None and bound_character != payload.snapshot["character"]:
            raise CheckpointConflict("checkpoint_character_conflict", revision)
        expected_snapshot = {
            **current_snapshot,
            "character": bound_character or payload.snapshot["character"],
        }
        if canonical_request_fingerprint(expected_snapshot) != canonical_request_fingerprint(payload.snapshot):
            raise CheckpointConflict("checkpoint_snapshot_conflict", revision)
        if bound_character is None:
            ctx.flags["checkpointCharacterRef"] = deepcopy(payload.snapshot["character"])

        validate_locked(ctx, payload)
        ctx.state.player_x = payload.player_x
        ctx.state.player_y = payload.player_y
        accepted_revision = revision + 1
        receipt = CheckpointReceipt(
            idempotency_key=payload.idempotency_key,
            request_fingerprint=fingerprint,
            accepted_revision=accepted_revision,
            player_x=payload.player_x,
            player_y=payload.player_y,
            current_map_key=payload.current_map_key,
            reason=payload.reason,
            accepted_at=timezone.now().isoformat(),
        )
        ctx.flags["checkpointMeta"] = {"revision": accepted_revision}
        ctx.flags["positionSyncedAt"] = timezone.now().timestamp()
        ctx.flags["checkpointReceipts"] = [
            *receipts[-(MAX_CHECKPOINT_RECEIPTS - 1):],
            {
                "idempotencyKey": receipt.idempotency_key,
                "requestFingerprint": receipt.request_fingerprint,
                "acceptedRevision": receipt.accepted_revision,
                "playerX": receipt.player_x,
                "playerY": receipt.player_y,
                "currentMapKey": receipt.current_map_key,
                "reason": receipt.reason,
                "acceptedAt": receipt.accepted_at,
            },
        ]
        return CheckpointResult(accepted_revision, receipt)

    return mutate_world_state(
        attempt_id,
        mutation,
        synchronize_scene=False,
    )
```

`canonical_request_fingerprint` ya pertenece a `world_state_mutation.py` por el
plan de caso vivo. Confirmar que usa JSON UTF-8 con claves ordenadas,
separadores `(",", ":")` y SHA-256 hexadecimal. No crear otra implementación.
Los validators profundos son allowlists: un objeto con clave extra/tipo
incorrecto/campo sensible devuelve 400; un snapshot bien formado pero distinto
de `authoritative_snapshot` devuelve 409. `_decision_refs` lee únicamente
`decisionReceipts[*].fingerprint` y la allowlist sin token
`decisionReceipts[*].body` creada por el plan vivo; nunca copia el body entero y
nunca expone `attemptToken`.

El nombre interno en `flags.lastConsequence` es `relationState`; `consequence_dto` lo proyecta deliberadamente como `relationalState` antes de construir `checkpointSnapshot`. `_validated_consequence` y el repositorio local aceptan únicamente el nombre público. El test de round-trip renombra ese campo a la forma interna y exige 400, evitando drift silencioso entre flags, DTO y checkpoint.

- [ ] **Step 4: Delegar el guardado desde `world_service`**

Extender `world_service.update_position` con keyword obligatorio `snapshot` y
pasarlo a `validated_payload`. Puede validar sintaxis antes del lock, pero mapa,
estado del intento, hitbox, desplazamiento y colisión deben ejecutarse dentro de
`validate_locked`, después de que `mutate_world_state` haya bloqueado primero el
intento y luego el world state:

```python
payload = checkpoint_service.validated_payload(
    expected_revision=expected_revision,
    idempotency_key=idempotency_key,
    player_x=player_x,
    player_y=player_y,
    current_map_key=current_map_key,
    reason=reason,
    snapshot=snapshot,
)

def validate_locked(ctx, candidate):
    _require_in_progress(ctx.attempt)
    if candidate.current_map_key != ctx.state.scene_map.map_key:
        raise checkpoint_service.CheckpointConflict(
            "checkpoint_map_conflict",
            checkpoint_service.checkpoint_revision(ctx.flags),
        )
    map_w = ctx.state.scene_map.width or 960
    map_h = ctx.state.scene_map.height or 540
    hitbox_x, hitbox_y, hitbox_w, hitbox_h = _player_hitbox(
        candidate.player_x, candidate.player_y,
    )
    if not (
        0 <= hitbox_x and hitbox_x + hitbox_w <= map_w
        and 0 <= hitbox_y and hitbox_y + hitbox_h <= map_h
    ):
        raise ValidationError("La posición está fuera de los límites del mapa")
    _require_plausible_displacement(
        ctx.state, candidate.player_x, candidate.player_y,
    )
    if _position_blocked(
        ctx.state.scene_map_id, candidate.player_x, candidate.player_y,
    ):
        raise ValidationError("La posición cae dentro de un obstáculo del mapa")

authorized = game_service._require_attempt(attempt_id, attempt_token, actor)
committed = checkpoint_service.commit_checkpoint(
    authorized.id,
    payload,
    validate_locked,
)
return _to_world_state(
    committed.attempt,
    committed.state,
    revision=committed.value.revision,
    checkpoint_receipt=committed.value.receipt,
)
```

No llamar `require_world_state()` antes de `commit_checkpoint`: hacerlo invertiría
la garantía de snapshot. Eliminar cualquier llamada a `_save_event` cuyo
`event_type` sea `WORLD_POSITION_UPDATED` y todo guardado directo de posición.

Modificar `_to_world_state(attempt, state, revision=None,
checkpoint_receipt=None)` para leer una sola vez
`flags = _read_map(state.flags_json)` y emitir:

```python
meta = flags.get("checkpointMeta")
stored_revision = int(meta.get("revision", 0)) if isinstance(meta, dict) else 0
# Dentro del dict de respuesta:
"revision": stored_revision if revision is None else revision,
"flags": flags,
"checkpointSnapshot": checkpoint_service.authoritative_snapshot(
    attempt,
    state,
    flags,
),
"checkpointReceipt": (
    {
        "idempotencyKey": checkpoint_receipt.idempotency_key,
        "requestFingerprint": checkpoint_receipt.request_fingerprint,
        "acceptedRevision": checkpoint_receipt.accepted_revision,
        "playerX": checkpoint_receipt.player_x,
        "playerY": checkpoint_receipt.player_y,
        "currentMapKey": checkpoint_receipt.current_map_key,
        "reason": checkpoint_receipt.reason,
        "acceptedAt": checkpoint_receipt.accepted_at,
        "replayed": checkpoint_receipt.replayed,
    }
    if checkpoint_receipt is not None
    else _last_checkpoint_receipt(flags)
),
```

`GET /world` devuelve el último recibo, mientras un replay antiguo devuelve ese
recibo concreto aunque `revision` y el estado del mundo reflejen la versión
actual. Esto permite reconciliar una respuesta perdida sin retroceder el mundo.

- [ ] **Step 5: Extender las carreras reales del primitive compartido**

Importar `run_concurrently` desde
`apps.simulation.tests.concurrency_helpers`, creado por el plan de caso vivo.
Añadir a `test_world_state_mutation.py` tres pruebas. Cada operación abre su
propio cliente/conexión, la barrera se libera dentro del helper y después se
recarga `AttemptWorldState`:

```python
@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("other", ["door", "npc", "decision"])
def test_checkpoint_preserves_flags_written_concurrently(
    concurrent_world_case,
    other,
):
    case = concurrent_world_case(other)
    world = world_service.get_world(
        case.attempt.id,
        case.raw_token,
        case.actor,
    )
    snapshot = {
        **world["checkpointSnapshot"],
        "character": CHECKPOINT_CHARACTER_REF,
    }

    def patch_checkpoint():
        try:
            return world_service.update_position(
                case.attempt.id,
                case.raw_token,
                case.patch_x,
                case.patch_y,
                case.actor,
                current_map_key=case.map_key,
                expected_revision=0,
                idempotency_key=f"cp-race-{other}",
                reason="periodic",
                snapshot=snapshot,
            )
        except checkpoint_service.CheckpointConflict as exc:
            return {"conflict": str(exc.detail["code"])}

    checkpoint_result, _ = run_concurrently(
        patch_checkpoint,
        case.other_operation,
    )
    state = AttemptWorldState.objects.get(attempt=case.attempt)
    flags = read_map(state.flags_json)
    receipts = flags.get("checkpointReceipts", [])
    if "conflict" in checkpoint_result:
        assert checkpoint_result == {
            "conflict": "checkpoint_snapshot_conflict",
        }
    else:
        assert any(
            receipt["idempotencyKey"] == f"cp-race-{other}"
            for receipt in receipts
        )
    assert len({
        receipt["idempotencyKey"]
        for receipt in receipts
    }) == len(receipts)
    if other == "npc":
        assert case.npc_key in flags["viewedNpcKeys"]
    elif other == "door":
        assert state.scene_map.map_key == case.target_map_key
        assert flags["syncedNodeId"] == case.attempt.current_node_id
    else:
        assert flags["decisionRevision"] == 1
        assert flags["lastConsequence"]["optionKey"] == case.option.option_key
```

Declarar `CHECKPOINT_CHARACTER_REF` una sola vez en el módulo con el mismo
literal inmutable del test de recuperación. Reutilizar y ampliar el fixture
exacto `concurrent_world_case` creado por el plan
de caso vivo, incluidos sus positions/door requirements/decision option; no crear
otro seed. Añadir los imports `checkpoint_service`, `AttemptWorldState`,
`run_concurrently` y `read_map` ya usados por ese archivo. Solo la carrera donde
el checkpoint toma primero el lock puede producir recibo. Si cualquier writer
autoritativo gana primero, el snapshot que leyó el cliente queda obsoleto y el
resultado exacto es `checkpoint_snapshot_conflict`; el writer de NPC, puerta o
decisión debe conservarse. La validación del snapshot sucede antes que la
validación espacial, de modo que esta carrera no admite
`checkpoint_map_conflict`. No se aceptan mocks de `select_for_update`.

- [ ] **Step 6: Ejecutar la matriz backend**

Run: `npm run test:backend -- apps/simulation/tests/test_checkpoint_recovery.py apps/simulation/tests/test_world_state_mutation.py apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py -q`

Expected: PASS; las tres carreras conservan ambos dominios de flags, el snapshot
exige cuatro NPC/los siete campos, el round-trip y replay conservan la relación
sin reaplicar deltas, y no existe ningún evento de posición ordinaria. Esta
tarea introduce **37 casos pytest** en `test_checkpoint_recovery.py` y **3 casos
concurrentes** parametrizados en `test_world_state_mutation.py`, además de las
regresiones preexistentes de mundo/autoridad.

- [ ] **Step 7: Commit**

```powershell
git add backend_django/apps/simulation/services/checkpoint_service.py backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_checkpoint_recovery.py backend_django/apps/simulation/tests/test_world_state_mutation.py
git commit -m "feat(world): add idempotent checkpoint revisions"
```

### Task 2: Cablear el envelope HTTP versionado

**Files:**
- Modify: `backend_django/apps/simulation/views/game_views.py`
- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/tests/test_checkpoint_recovery.py`
- Modify: `backend_django/apps/simulation/tests/test_world.py`
- Modify: `backend_django/apps/simulation/tests/test_world_authority.py`
- Modify: `backend_django/apps/simulation/tests/test_safe_pause.py`
- Modify: `backend_django/apps/simulation/tests/test_caso_pdf.py`
- Modify: `frontend/src/app/core/models/simulation.model.ts`
- Modify: `frontend/src/app/core/api/simulation.service.ts`
- Modify: `frontend/src/app/core/api/simulation.service.spec.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-snapshot.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-snapshot.spec.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [ ] **Step 1: Escribir test API rojo**

```python
@pytest.mark.django_db
def test_world_state_patch_returns_revision_and_rejects_stale(
    world_context,
):
    world = world_service.get_world(
        world_context.attempt_id,
        world_context.raw_token,
        world_context.actor,
    )
    body = {
        "attemptToken": world_context.raw_token,
        "playerX": 460,
        "playerY": 430,
        "currentMapKey": world["map"]["key"],
        "expectedRevision": 0,
        "idempotencyKey": "cp-api-1",
        "reason": "periodic",
        "snapshot": {
            **world["checkpointSnapshot"],
            "character": CHARACTER_REF,
        },
    }
    first = world_context.client.patch(
        f"/api/simulation/attempts/{world_context.attempt.id}/world-state",
        body,
        format="json",
    )
    stale = world_context.client.patch(
        f"/api/simulation/attempts/{world_context.attempt.id}/world-state",
        {**body, "idempotencyKey": "cp-api-2"},
        format="json",
    )

    assert first.status_code == 200
    assert first.json()["data"]["revision"] == 1
    assert first.json()["data"]["checkpointReceipt"]["idempotencyKey"] == "cp-api-1"
    assert stale.status_code == 409
    assert stale.json()["code"] == "checkpoint_revision_conflict"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("expectedRevision", True),
        ("expectedRevision", -1),
        ("expectedRevision", "0"),
        ("idempotencyKey", ""),
        ("idempotencyKey", "x" * 129),
        ("reason", ""),
        ("reason", "autosave"),
        ("playerX", True),
        ("playerY", -1),
        ("currentMapKey", ""),
    ],
)
def test_world_state_patch_rejects_invalid_envelope(world_context, field, value):
    world = world_service.get_world(
        world_context.attempt_id,
        world_context.raw_token,
        world_context.actor,
    )
    body = {
        "attemptToken": world_context.raw_token,
        "playerX": 460,
        "playerY": 430,
        "currentMapKey": world_context.map_key,
        "expectedRevision": 0,
        "idempotencyKey": "cp-api-valid",
        "reason": "periodic",
        "snapshot": {
            **world["checkpointSnapshot"],
            "character": CHARACTER_REF,
        },
        field: value,
    }
    response = world_context.client.patch(
        f"/api/simulation/attempts/{world_context.attempt_id}/world-state",
        body,
        format="json",
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm run test:backend -- apps/simulation/tests/test_checkpoint_recovery.py -q`

Expected: FAIL; vista no pasa revision/idempotency.

- [ ] **Step 3: Modificar la vista y firma del servicio**

La vista no aplica defaults. Pasa los siete campos al servicio y deja que
`validated_payload` rechace ausencias, booleanos usados como enteros, negativos,
strings numéricos, claves vacías/largas y reasons fuera del enum:

Extender imports con `from rest_framework import status`,
`from rest_framework.response import Response` y
`from apps.simulation.services import checkpoint_service`:

```python
try:
    state = world_service.update_position(
        attempt_id,
        request.data.get("attemptToken"),
        request.data.get("playerX"),
        request.data.get("playerY"),
        request.user,
        current_map_key=request.data.get("currentMapKey"),
        expected_revision=request.data.get("expectedRevision"),
        idempotency_key=request.data.get("idempotencyKey"),
        reason=request.data.get("reason"),
        snapshot=request.data.get("snapshot"),
    )
except checkpoint_service.CheckpointConflict as exc:
    detail = exc.detail
    return Response({
        "success": False,
        "message": "El checkpoint compite con un estado más reciente.",
        "code": str(detail["code"]),
        "currentRevision": int(detail["currentRevision"]),
    }, status=status.HTTP_409_CONFLICT)
```

El `except` es necesario porque el handler global normaliza otros errores a
`{success,message}`; aquí el cliente necesita conservar `code` y
`currentRevision` para reconciliar sin heurísticas de texto.

El envelope es obligatorio. Actualizar todos los tests de regresión enumerados
en `Files` para enviar `expectedRevision`, `idempotencyKey` y el `snapshot`
devuelto por el `GET /world`, sustituyendo solo `character: null` por el literal
inmutable `CHARACTER_REF` ya definido en ese archivo. No construir evidencia, NPCs o clínica a
mano y no admitir un default de compatibilidad. En
`test_world.py::_move`, obtener `revision` con el `GET /world` inicial, usar una
clave determinista `test-move-{index}` en cada paso y sustituir `revision` por la
devuelta en cada PATCH; refrescar igualmente `checkpointSnapshot` después de
cualquier mutación autoritativa. `test_world_authority.py::_move` recibe también
`expected_revision`, `idempotency_key` y `snapshot`, de modo que los tests de
autoridad no quedan protegidos por un bypass de compatibilidad.

- [ ] **Step 4: Definir contratos frontend**

```typescript
import type { CharacterProfileSelectionV1 } from
  '../../features/character/character-manifest.model';

export type CheckpointReason =
  | 'periodic' | 'pause' | 'room' | 'dialogue'
  | 'decision' | 'repair' | 'pagehide' | 'safe-exit';

export interface CheckpointDecisionRef {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly decisionRevision: number;
  readonly optionKey: string;
  readonly sourceNodeId: number;
  readonly consequenceId: string;
}

export interface CheckpointEvidenceSnapshot {
  readonly inventory: readonly string[];
  readonly inspectedObjectKeys: readonly string[];
  readonly viewedDialogueKeys: readonly string[];
  readonly usedToolKeys: readonly string[];
}

export interface CheckpointNpcSnapshot {
  readonly viewedKeys: readonly string[];
  readonly states: Readonly<Record<ClinicalNpcActorKey, NpcConsequenceState>>;
}

export interface CheckpointClinicalSnapshot {
  readonly currentNodeId: number;
  readonly decisionRevision: number;
  readonly decisions: readonly CheckpointDecisionRef[];
  readonly lastConsequence: ClinicalConsequence | null;
  readonly pendingRepair: PendingRepairState | null;
}

export interface CheckpointSnapshot {
  readonly schemaVersion: 1;
  readonly character: CharacterProfileSelectionV1;
  readonly evidence: CheckpointEvidenceSnapshot;
  readonly npcs: CheckpointNpcSnapshot;
  readonly clinical: CheckpointClinicalSnapshot;
}

export interface CheckpointServerSnapshot
  extends Omit<CheckpointSnapshot, 'character'> {
  readonly character: CharacterProfileSelectionV1 | null;
}

export interface CheckpointRequest {
  readonly playerX: number;
  readonly playerY: number;
  readonly currentMapKey: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly reason: CheckpointReason;
  readonly snapshot: CheckpointSnapshot;
}

export interface CheckpointReceipt {
  idempotencyKey: string;
  requestFingerprint: string;
  acceptedRevision: number;
  playerX: number;
  playerY: number;
  currentMapKey: string;
  reason: CheckpointReason;
  acceptedAt: string;
  replayed: boolean;
}
```

Añadir a `SimulationWorldState`:

```typescript
revision: number;
checkpointReceipt: CheckpointReceipt | null;
checkpointSnapshot: CheckpointServerSnapshot;
```

`CheckpointDecisionRef` es una proyección allowlist del recibo autoritativo de
decisión. Nunca contiene `response`, `attemptToken` ni el receipt interno
completo. `CheckpointServerSnapshot` es el resultado que arma el backend desde
`SimulationWorldState`/flags autoritativos; `CheckpointSnapshot` solo estrecha
`character` a no nulo para un PATCH. No se persiste `AvatarRenderPlan`, hojas,
URLs ni secretos.

`ClinicalNpcActorKey`, `NpcConsequenceState`, `ClinicalConsequence` y sus tipos relacionales vienen del plan de caso vivo; no redeclararlos. `Record<ClinicalNpcActorKey, ...>` obliga los cuatro actores en compilación y los validators backend/local exigen el mismo set exacto en runtime. Un estado parcial no es un checkpoint recuperable.

Crear `checkpoint-snapshot.ts` como único adaptador de GET a PATCH:

```typescript
import type {
  CheckpointServerSnapshot,
  CheckpointSnapshot,
} from '../../core/models/simulation.model';
import type { CharacterProfileSelectionV1 } from
  '../character/character-manifest.model';

export function checkpointSnapshotForRequest(
  snapshot: CheckpointServerSnapshot,
  localCharacter: CharacterProfileSelectionV1,
): CheckpointSnapshot {
  return {
    ...snapshot,
    character: snapshot.character ?? localCharacter,
  };
}
```

En `character-profile.repository.ts`, exportar un adaptador puramente
estructural —no un segundo modelo—:

```typescript
export function characterReference(
  plan: AvatarRenderPlan,
): CharacterProfileSelectionV1 {
  return {
    schemaVersion: 1,
    manifestVersion: plan.manifestVersion,
    characterId: plan.characterId,
    variantId: plan.variantId,
    contentHash: plan.contentHash,
  };
}
```

Los specs prueban que un character ya ligado por servidor prevalece sobre el
perfil local y que un intento nuevo usa exactamente esas cinco claves del plan;
ningún helper serializa `displayName`, `sheets`, `portrait`, URLs o tokens.

- [ ] **Step 5: Escribir test rojo de `SimulationService`**

```typescript
it('sends checkpoint revision and idempotency key', () => {
  service.updateWorldState('attempt-1', 'token', CHECKPOINT).subscribe();
  const req = http.expectOne('/api/simulation/attempts/attempt-1/world-state');
  expect(req.request.method).toBe('PATCH');
  expect(req.request.body).toEqual({
    attemptToken: 'token',
    ...CHECKPOINT,
  });
});
```

- [ ] **Step 6: Implementar cliente**

```typescript
updateWorldState(
  attemptId: string,
  attemptToken: string,
  checkpoint: CheckpointRequest,
) {
  return this.http.patch<ApiResponse<SimulationWorldState>>(
    this.API + '/attempts/' + attemptId + '/world-state',
    { attemptToken, ...checkpoint },
  ).pipe(map(response => response.data));
}
```

- [ ] **Step 7: Migrar todos los callers frontend antes de cerrar la tarea**

En las dos llamadas actuales de `simulation-play.component.ts`, construir un
objeto completo. Esta adaptación transitoria mantiene el árbol compilable; Task
6 elimina ambos llamados directos al instalar la cola:

```typescript
const checkpoint: CheckpointRequest = {
  playerX: Math.round(synced.x),
  playerY: Math.round(synced.y),
  currentMapKey: world.map.key,
  expectedRevision: world.revision,
  idempotencyKey: crypto.randomUUID(),
  reason: 'periodic',
  snapshot: checkpointSnapshotForRequest(
    world.checkpointSnapshot,
    characterReference(this.characterProfiles.renderPlan()),
  ),
};
this.simulationService.updateWorldState(
  game.attemptId,
  game.attemptToken,
  checkpoint,
);
```

Importar los helpers puros creados en el Step 4 de esta tarea; no duplicar aquí la
serialización. Actualizar los spies de
`simulation-play.consent-gate.spec.ts` para exigir el objeto completo, incluidas
las cinco claves exactas de `snapshot.character` y las ramas `evidence`, `npcs`
y `clinical`. Ejecutar un scan que debe encontrar solo la firma nueva en el
servicio, su spec y esas dos llamadas transitorias:

Run:

```powershell
$hits = Get-ChildItem frontend/src -Recurse -File -Filter *.ts |
  Select-String -Pattern '\.updateWorldState\('
$hits | ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line.Trim())" }
if ($hits.Count -lt 3) { throw "Expected production and test call sites" }
```

Expected: cada hit de producción/spec pasa un `CheckpointRequest` como tercer
argumento; ninguno conserva los cinco argumentos legacy
`playerX, playerY, currentMapKey`.

- [ ] **Step 8: Ejecutar backend, frontend y build**

Run: `npm run test:backend -- apps/simulation/tests/test_checkpoint_recovery.py -q`

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/core/api/simulation.service.spec.ts src/app/features/character/character-profile.repository.spec.ts src/app/features/simulator/checkpoint-snapshot.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Run: `npm run build:frontend`

Expected: `test_checkpoint_recovery.py` termina con **48/48 casos PASS**
(37 de Task 1 + 11 del envelope API de esta tarea),
ambos archivos Jest terminan sin casos omitidos y el build Angular finaliza sin
errores de tipo. El log debe mostrar que todo PATCH contiene `snapshot`; una
ausencia es fallo del gate, no compatibilidad tolerada.

- [ ] **Step 9: Commit**

```powershell
git add backend_django/apps/simulation/views/game_views.py backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_checkpoint_recovery.py backend_django/apps/simulation/tests/test_world.py backend_django/apps/simulation/tests/test_world_authority.py backend_django/apps/simulation/tests/test_safe_pause.py backend_django/apps/simulation/tests/test_caso_pdf.py frontend/src/app/core/models/simulation.model.ts frontend/src/app/core/api/simulation.service.ts frontend/src/app/core/api/simulation.service.spec.ts frontend/src/app/features/character/character-profile.repository.ts frontend/src/app/features/character/character-profile.repository.spec.ts frontend/src/app/features/simulator/checkpoint-snapshot.ts frontend/src/app/features/simulator/checkpoint-snapshot.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "feat(world): version checkpoint api"
```

### Task 3: Crear un repositorio durable, validado y sin secretos

**Files:**
- Create: `frontend/src/app/features/simulator/checkpoint-fingerprint.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-fingerprint.spec.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-repository.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-repository.spec.ts`
- Modify: `frontend/src/app/features/simulator/runtime/canonical-json-sha256.spec.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.spec.ts`
- Modify: `frontend/src/app/core/auth/auth.service.ts`
- Create: `frontend/src/app/core/auth/auth.service.spec.ts`
- Create: `scripts/checkpoint-boundary.test.mjs`

- [ ] **Step 1: Escribir tests rojos**

```typescript
describe('CheckpointRepository', () => {
  beforeEach(() => localStorage.clear());

  it('namespaces a pending checkpoint by user, attempt and tab', () => {
    const repo = new CheckpointRepository(localStorage, () => NOW);
    expect(repo.save(ENVELOPE)).toEqual({ durable: true });

    expect(repo.load('user-7', 'attempt-a', 'tab-1')).toEqual(ENVELOPE);
    expect(repo.load('user-7', 'attempt-a', 'tab-2')).toBeNull();
    expect(repo.load('user-8', 'attempt-a', 'tab-1')).toBeNull();
  });

  it('never persists auth or attempt secrets', () => {
    const repo = new CheckpointRepository(localStorage, () => NOW);
    repo.save(ENVELOPE);

    const raw = localStorage.getItem(
      'siep.checkpoint.v2.user-7.attempt-a.tab-1',
    )!;
    expect(raw).not.toContain('attempt-token');
    expect(raw).not.toContain('psychosim_token');
    expect(raw).not.toMatch(/"(?:password|token|credential)"\s*:/i);
    expect(JSON.parse(raw).active.request).not.toHaveProperty('attemptToken');
  });

  it.each(['attemptToken', 'password', 'accessToken', 'credential'])(
    'rejects a nested secret-shaped field named %s',
    secretKey => {
      const poisoned = structuredClone(ENVELOPE) as any;
      poisoned.active.request.snapshot.clinical[secretKey] = 'must-not-persist';
      expect(repo.save(poisoned)).toEqual({
        durable: false,
        reason: 'storage-unavailable',
      });
      expect(JSON.stringify(localStorage)).not.toContain('must-not-persist');
    },
  );

  it.each([
    { ...ENVELOPE, active: { ...ENVELOPE.active!, request: { ...CHECKPOINT, reason: 'bad' } } },
    { ...ENVELOPE, active: { ...ENVELOPE.active!, request: { ...CHECKPOINT, expectedRevision: -1 } } },
    { ...ENVELOPE, active: { ...ENVELOPE.active!, request: { ...CHECKPOINT, playerX: NaN } } },
    { ...ENVELOPE, active: { ...ENVELOPE.active!, request: { ...CHECKPOINT, currentMapKey: '' } } },
    { ...ENVELOPE, active: { ...ENVELOPE.active!, request: { ...CHECKPOINT, idempotencyKey: 'x'.repeat(129) } } },
    { ...ENVELOPE, active: { ...ENVELOPE.active!, requestFingerprint: 'not-sha256' } },
  ])('drops malformed domain data', value => {
    localStorage.setItem(
      'siep.checkpoint.v2.user-7.attempt-a.tab-1',
      JSON.stringify(value),
    );
    const repo = new CheckpointRepository(localStorage, () => NOW);
    expect(repo.load('user-7', 'attempt-a', 'tab-1')).toBeNull();
  });

  it.each([
    ['missing actor', (snapshot: any) => {
      delete snapshot.npcs.states['profesional-psicosocial'];
    }],
    ['missing relational field', (snapshot: any) => {
      delete snapshot.npcs.states['familia-duelo'].trust;
    }],
    ['score above 100', (snapshot: any) => {
      snapshot.npcs.states['familia-duelo'].openness = 101;
    }],
    ['boolean score', (snapshot: any) => {
      snapshot.npcs.states['familia-duelo'].tension = true;
    }],
  ])('fails closed for an NPC snapshot with %s', (_name, poison) => {
    const invalid = structuredClone(ENVELOPE);
    poison(invalid.active!.request.snapshot);
    localStorage.setItem(
      'siep.checkpoint.v2.user-7.attempt-a.tab-1',
      JSON.stringify(invalid),
    );
    const repo = new CheckpointRepository(localStorage, () => NOW);
    expect(repo.load('user-7', 'attempt-a', 'tab-1')).toBeNull();
    expect(localStorage.getItem('siep.checkpoint.v2.user-7.attempt-a.tab-1'))
      .toBeNull();
  });

  it('expires records after 24 hours', () => {
    localStorage.setItem(
      'siep.checkpoint.v2.user-7.attempt-a.tab-1',
      JSON.stringify({ ...ENVELOPE, expiresAt: NOW - 1 }),
    );
    const repo = new CheckpointRepository(localStorage, () => NOW);
    expect(repo.load('user-7', 'attempt-a', 'tab-1')).toBeNull();
  });

  it('reports quota failure without pretending local durability', () => {
    const storage = new ThrowingStorage('QuotaExceededError');
    const repo = new CheckpointRepository(storage, () => NOW);
    expect(repo.save(ENVELOPE)).toEqual({
      durable: false,
      reason: 'quota-exceeded',
    });
  });

  it('clears only the selected user on logout', () => {
    const repo = new CheckpointRepository(localStorage, () => NOW);
    repo.save(ENVELOPE);
    repo.save({ ...ENVELOPE, userId: 'user-8' });
    repo.clearUser('user-7');
    expect(repo.listForAttempt('user-7', 'attempt-a')).toEqual([]);
    expect(repo.listForAttempt('user-8', 'attempt-a')).toHaveLength(1);
  });
});
```

Crear `auth.service.spec.ts` con el logout real y sin montar routing:

```typescript
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';

describe('AuthService checkpoint cleanup', () => {
  beforeEach(() => localStorage.clear());

  it('removes only the current user checkpoint namespace on logout', () => {
    const router = { navigate: jest.fn() } as unknown as Router;
    const service = new AuthService({} as HttpClient, router);
    service.currentUser.set({
      id: 7,
      nombre: 'Ada',
      apellido: 'Lovelace',
      email: 'ada@example.test',
      role: 'ESTUDIANTE',
    });
    localStorage.setItem('psychosim_token', 'opaque-token');
    localStorage.setItem('siep.checkpoint.v2.7.attempt-a.tab-a', '{}');
    localStorage.setItem('siep.checkpoint.v2.70.attempt-a.tab-a', '{}');
    localStorage.setItem('siep.checkpoint.v2.8.attempt-a.tab-a', '{}');

    service.logout();

    expect(localStorage.getItem('psychosim_token')).toBeNull();
    expect(localStorage.getItem('siep.checkpoint.v2.7.attempt-a.tab-a')).toBeNull();
    expect(localStorage.getItem('siep.checkpoint.v2.70.attempt-a.tab-a')).toBe('{}');
    expect(localStorage.getItem('siep.checkpoint.v2.8.attempt-a.tab-a')).toBe('{}');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
```

En `checkpoint-fingerprint.spec.ts`, fijar compatibilidad con el vector que usa
el test Python de `canonical_request_fingerprint`:

```typescript
const INITIAL_RELATIONAL_NPC_STATES = {
  'familia-duelo': {
    trust: 46, tension: 64, openness: 38, available: true,
    emotion: 'neutral', pose: 'idle', consequenceId: null,
  },
  'psicologa-acompanante': {
    trust: 58, tension: 42, openness: 60, available: true,
    emotion: 'neutral', pose: 'idle', consequenceId: null,
  },
  'sobreviviente-consulta': {
    trust: 34, tension: 72, openness: 30, available: true,
    emotion: 'neutral', pose: 'idle', consequenceId: null,
  },
  'profesional-psicosocial': {
    trust: 62, tension: 38, openness: 66, available: true,
    emotion: 'neutral', pose: 'idle', consequenceId: null,
  },
} as const;

it('matches the backend canonical SHA-256 vector', async () => {
  await expect(checkpointRequestFingerprint({
    playerX: 320,
    playerY: 240,
    currentMapKey: 'hospital-urgencias',
    expectedRevision: 0,
    idempotencyKey: 'ignored-by-fingerprint',
    reason: 'periodic',
    snapshot: {
      schemaVersion: 1,
      character: {
        schemaVersion: 1,
        manifestVersion: '1.0.0',
        characterId: 'valentina',
        variantId: 'base',
        contentHash: 'a'.repeat(64),
      },
      evidence: {
        inventory: [],
        inspectedObjectKeys: [],
        viewedDialogueKeys: [],
        usedToolKeys: [],
      },
      npcs: { viewedKeys: [], states: INITIAL_RELATIONAL_NPC_STATES },
      clinical: {
        currentNodeId: 101,
        decisionRevision: 0,
        decisions: [],
        lastConsequence: null,
        pendingRepair: null,
      },
    },
  })).resolves.toBe(
    'ed8f2d1ff1c074c7a711c62921d1202290b35589bc166771c4c06a1f09f0d606',
  );
});
```

El test Python `test_checkpoint_fingerprint_vector` usa exactamente el mismo
literal y payload; ambos lenguajes deben permanecer idénticos:

Run:

```powershell
npm run test:backend -- apps/simulation/tests/test_checkpoint_recovery.py::test_checkpoint_fingerprint_vector -q
```

Expected: PASS con SHA-256
`ed8f2d1ff1c074c7a711c62921d1202290b35589bc166771c4c06a1f09f0d606`.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/checkpoint-repository.spec.ts`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Implementar repositorio y validador**

Crear `checkpoint-fingerprint.ts` delegando en la única primitiva canónica que
ya pertenece al runtime; está prohibido reimplementar ordenamiento, UTF-8 o Web
Crypto en este módulo:

```typescript
import { CheckpointRequest } from '../../core/models/simulation.model';
import { canonicalSha256 } from './runtime/canonical-json-sha256';

export async function checkpointRequestFingerprint(
  request: CheckpointRequest,
): Promise<string> {
  const { idempotencyKey: _ignored, ...fingerprintedPayload } = request;
  return canonicalSha256(fingerprintedPayload);
}
```

Crear el repositorio con estas formas públicas:

```typescript
import { InjectionToken } from '@angular/core';

export interface CheckpointDraft {
  draftId: string;
  createdAt: number;
  playerX: number;
  playerY: number;
  currentMapKey: string;
  reason: CheckpointReason;
  snapshot: CheckpointSnapshot;
}

export interface PersistedCheckpoint {
  request: CheckpointRequest;
  requestFingerprint: string;
  draftId: string;
}

export interface CheckpointEnvelope {
  schemaVersion: 2;
  userId: string;
  attemptId: string;
  tabId: string;
  createdAt: number;
  expiresAt: number;
  active: PersistedCheckpoint | null;
  queued: CheckpointDraft | null;
}

export type RepositoryWriteResult =
  | { durable: true }
  | { durable: false; reason: 'quota-exceeded' | 'storage-unavailable' };

const PREFIX = 'siep.checkpoint.v2.';
const TTL_MS = 24 * 60 * 60 * 1000;
const REASONS = new Set<CheckpointReason>([
  'periodic', 'pause', 'room', 'dialogue', 'decision',
  'repair', 'pagehide', 'safe-exit',
]);

export class CheckpointRepository {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  static key(userId: string, attemptId: string, tabId: string): string {
    return PREFIX + [userId, attemptId, tabId].map(encodeURIComponent).join('.');
  }

  create(
    userId: string,
    attemptId: string,
    tabId: string,
  ): CheckpointEnvelope {
    const now = this.now();
    return {
      schemaVersion: 2,
      userId,
      attemptId,
      tabId,
      createdAt: now,
      expiresAt: now + TTL_MS,
      active: null,
      queued: null,
    };
  }

  save(value: CheckpointEnvelope): RepositoryWriteResult {
    value.expiresAt = this.now() + TTL_MS;
    if (!isEnvelope(value, this.now())) {
      return { durable: false, reason: 'storage-unavailable' };
    }
    try {
      this.storage.setItem(
        CheckpointRepository.key(value.userId, value.attemptId, value.tabId),
        JSON.stringify(value),
      );
      return { durable: true };
    } catch (error) {
      const errorName = (error as { name?: unknown } | null)?.name;
      return {
        durable: false,
        reason: errorName === 'QuotaExceededError'
          ? 'quota-exceeded'
          : 'storage-unavailable',
      };
    }
  }

  load(
    userId: string,
    attemptId: string,
    tabId: string,
  ): CheckpointEnvelope | null {
    const key = CheckpointRepository.key(userId, attemptId, tabId);
    try {
      const value = JSON.parse(this.storage.getItem(key) ?? 'null');
      if (!isEnvelope(value, this.now())) {
        this.storage.removeItem(key);
        return null;
      }
      return value;
    } catch {
      this.storage.removeItem(key);
      return null;
    }
  }

  listForAttempt(userId: string, attemptId: string): CheckpointEnvelope[] {
    const prefix = PREFIX + [userId, attemptId].map(encodeURIComponent).join('.') + '.';
    return this.keys()
      .filter(key => key.startsWith(prefix))
      .map(key => {
        const tabId = decodeURIComponent(key.slice(prefix.length));
        return this.load(userId, attemptId, tabId);
      })
      .filter((value): value is CheckpointEnvelope => value !== null);
  }

  clear(userId: string, attemptId: string, tabId: string): void {
    this.storage.removeItem(CheckpointRepository.key(userId, attemptId, tabId));
  }

  clearUser(userId: string): void {
    const prefix = PREFIX + encodeURIComponent(userId) + '.';
    this.keys().filter(key => key.startsWith(prefix))
      .forEach(key => this.storage.removeItem(key));
  }

  private keys(): string[] {
    return Array.from(
      { length: this.storage.length },
      (_, index) => this.storage.key(index),
    ).filter((key): key is string => key !== null);
  }
}

export const CHECKPOINT_REPOSITORY =
  new InjectionToken<CheckpointRepository>('CHECKPOINT_REPOSITORY', {
    providedIn: 'root',
    factory: () => new CheckpointRepository(window.localStorage),
  });
```

Implementar `isEnvelope` con guards explícitos:

```typescript
function validRequest(value: unknown): value is CheckpointRequest {
  if (!exactObject(value, [
    'playerX', 'playerY', 'currentMapKey', 'expectedRevision',
    'idempotencyKey', 'reason', 'snapshot',
  ])) return false;
  return nonNegativeInteger(value.playerX)
    && nonNegativeInteger(value.playerY)
    && nonNegativeInteger(value.expectedRevision)
    && safeId(value.currentMapKey)
    && typeof value.idempotencyKey === 'string'
    && /^[A-Za-z0-9._:-]{1,128}$/.test(value.idempotencyKey)
    && typeof value.reason === 'string'
    && REASONS.has(value.reason as CheckpointReason)
    && validSnapshot(value.snapshot);
}

function validDraft(value: unknown, now: number): value is CheckpointDraft {
  if (!exactObject(value, [
    'draftId', 'createdAt', 'playerX', 'playerY',
    'currentMapKey', 'reason', 'snapshot',
  ])) return false;
  return uuid(value.draftId)
    && Number.isFinite(value.createdAt)
    && value.createdAt >= 0
    && value.createdAt <= now
    && nonNegativeInteger(value.playerX)
    && nonNegativeInteger(value.playerY)
    && safeId(value.currentMapKey)
    && typeof value.reason === 'string'
    && REASONS.has(value.reason as CheckpointReason)
    && validSnapshot(value.snapshot);
}

function validPersisted(value: unknown): value is PersistedCheckpoint {
  return exactObject(value, ['request', 'requestFingerprint', 'draftId'])
    && validRequest(value.request)
    && sha256(value.requestFingerprint)
    && uuid(value.draftId);
}

function isEnvelope(value: unknown, now: number): value is CheckpointEnvelope {
  return exactObject(value, [
    'schemaVersion', 'userId', 'attemptId', 'tabId',
    'createdAt', 'expiresAt', 'active', 'queued',
  ])
    && value.schemaVersion === 2
    && safeId(value.userId)
    && safeId(value.attemptId)
    && safeId(value.tabId)
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.expiresAt)
    && value.createdAt <= now
    && value.expiresAt > now
    && value.expiresAt <= now + TTL_MS
    && value.expiresAt > value.createdAt
    && (value.active === null || validPersisted(value.active))
    && (value.queued === null || validDraft(value.queued, now))
    && noSensitiveKeys(value);
}
```

Las primitivas anteriores son obligatorias y se implementan en el mismo módulo
con límites cerrados; no se permite un cast que sustituya la validación:

```typescript
type UnknownRecord = Record<string, unknown>;
const MAX_SNAPSHOT_BYTES = 65_536;
const MAX_LIST_ITEMS = 128;
const SENSITIVE_KEY = /^(?:authorization|cookie|set-cookie|password|token|attemptToken|accessToken|refreshToken|credential)$/i;

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is UnknownRecord {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...keys].sort());
}
const nonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;
const relationScore = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const safeText = (value: unknown, max = 2_000): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value)
    && value.length <= MAX_LIST_ITEMS
    && value.every(safeId)
    && new Set(value).size === value.length;
const CLINICAL_NPC_ACTOR_KEYS = [
  'familia-duelo',
  'psicologa-acompanante',
  'sobreviviente-consulta',
  'profesional-psicosocial',
] as const;
const clinicalNpcActorKey = (value: unknown): boolean =>
  typeof value === 'string'
    && (CLINICAL_NPC_ACTOR_KEYS as readonly string[]).includes(value);

function noSensitiveKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(noSensitiveKeys);
  if (value === null || typeof value !== 'object') return true;
  return Object.entries(value as UnknownRecord).every(
    ([key, nested]) => !SENSITIVE_KEY.test(key) && noSensitiveKeys(nested),
  );
}

function validCharacter(value: unknown): boolean {
  return exactObject(value, [
    'schemaVersion', 'manifestVersion', 'characterId',
    'variantId', 'contentHash',
  ])
    && value.schemaVersion === 1
    && safeId(value.manifestVersion)
    && safeId(value.characterId)
    && safeId(value.variantId)
    && sha256(value.contentHash);
}

function validNpcState(value: unknown): boolean {
  return exactObject(value, [
    'trust', 'tension', 'openness', 'available',
    'emotion', 'pose', 'consequenceId',
  ])
    && relationScore(value.trust)
    && relationScore(value.tension)
    && relationScore(value.openness)
    && safeId(value.emotion)
    && (value.pose === 'idle' || value.pose === 'react')
    && typeof value.available === 'boolean'
    && (value.consequenceId === null || safeId(value.consequenceId));
}

function validDecision(value: unknown): boolean {
  return exactObject(value, [
    'idempotencyKey', 'fingerprint', 'decisionRevision',
    'optionKey', 'sourceNodeId', 'consequenceId',
  ])
    && safeId(value.idempotencyKey)
    && sha256(value.fingerprint)
    && nonNegativeInteger(value.decisionRevision)
    && safeId(value.optionKey)
    && nonNegativeInteger(value.sourceNodeId)
    && safeId(value.consequenceId);
}

function validRelationDelta(value: unknown): boolean {
  if (!exactObject(value, ['trust', 'tension', 'openness', 'available'])) {
    return false;
  }
  const deltas = [value.trust, value.tension, value.openness];
  return deltas.every(item => Number.isInteger(item) && Number(item) >= -100 && Number(item) <= 100)
    && deltas.some(item => Number(item) !== 0)
    && (value.available === null || typeof value.available === 'boolean');
}

function validRelationState(value: unknown): boolean {
  return exactObject(value, ['trust', 'tension', 'openness', 'available'])
    && relationScore(value.trust)
    && relationScore(value.tension)
    && relationScore(value.openness)
    && typeof value.available === 'boolean';
}

function validConsequence(value: unknown): boolean {
  return exactObject(value, [
    'id', 'actorKey', 'emotion', 'pose', 'tone', 'announcement',
    'relationDelta', 'relationalState', 'repairAvailable', 'repairPrompt',
    'repaired', 'optionKey', 'sourceNodeId', 'occurredAt',
  ])
    && safeId(value.id)
    && clinicalNpcActorKey(value.actorKey)
    && safeId(value.emotion)
    && value.pose === 'react'
    && ['relief', 'steady', 'tension', 'rupture'].includes(String(value.tone))
    && safeText(value.announcement)
    && validRelationDelta(value.relationDelta)
    && validRelationState(value.relationalState)
    && typeof value.repairAvailable === 'boolean'
    && (value.repairPrompt === null || safeText(value.repairPrompt))
    && typeof value.repaired === 'boolean'
    && safeId(value.optionKey)
    && nonNegativeInteger(value.sourceNodeId)
    && safeText(value.occurredAt, 64)
    && Number.isFinite(Date.parse(value.occurredAt as string));
}

function validPendingRepair(value: unknown): boolean {
  return exactObject(value, [
    'sourceNodeId', 'actorKey', 'prompt', 'consequenceId',
  ])
    && nonNegativeInteger(value.sourceNodeId)
    && clinicalNpcActorKey(value.actorKey)
    && safeText(value.prompt)
    && safeId(value.consequenceId);
}

function validSnapshot(value: unknown): value is CheckpointSnapshot {
  if (!exactObject(value, [
    'schemaVersion', 'character', 'evidence', 'npcs', 'clinical',
  ]) || value.schemaVersion !== 1 || !noSensitiveKeys(value)) return false;
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  if (encoded.byteLength > MAX_SNAPSHOT_BYTES) return false;
  if (!validCharacter(value.character)) return false;
  if (!exactObject(value.evidence, [
    'inventory', 'inspectedObjectKeys', 'viewedDialogueKeys', 'usedToolKeys',
  ])) return false;
  if (![value.evidence.inventory, value.evidence.inspectedObjectKeys,
    value.evidence.viewedDialogueKeys, value.evidence.usedToolKeys]
    .every(stringList)) return false;
  if (!exactObject(value.npcs, ['viewedKeys', 'states'])
    || !stringList(value.npcs.viewedKeys)
    || value.npcs.states === null
    || typeof value.npcs.states !== 'object'
    || Array.isArray(value.npcs.states)
    || JSON.stringify(Object.keys(value.npcs.states).sort())
      !== JSON.stringify([...CLINICAL_NPC_ACTOR_KEYS].sort())
    || !Object.entries(value.npcs.states).every(
      ([key, state]) => safeId(key) && validNpcState(state),
    )) return false;
  return exactObject(value.clinical, [
    'currentNodeId', 'decisionRevision', 'decisions',
    'lastConsequence', 'pendingRepair',
  ])
    && nonNegativeInteger(value.clinical.currentNodeId)
    && nonNegativeInteger(value.clinical.decisionRevision)
    && Array.isArray(value.clinical.decisions)
    && value.clinical.decisions.length <= 32
    && value.clinical.decisions.every(validDecision)
    && (value.clinical.lastConsequence === null
      || validConsequence(value.clinical.lastConsequence))
    && (value.clinical.pendingRepair === null
      || validPendingRepair(value.clinical.pendingRepair));
}
```

Extender además la autoridad de personaje sin mutar su selección activa:

```typescript
// character-profile.repository.ts
resolveReference(
  reference: CharacterProfileSelectionV1,
): AvatarRenderPlan {
  const manifest = this.manifest();
  if (manifest === null) throw new Error('character_manifest_unavailable');
  return resolveAvatarRenderPlan(manifest, reference);
}
```

El spec carga el repositorio, conserva `profile()` y `renderPlan()` por
referencia, resuelve un personaje/variante distinto existente en el manifiesto y
comprueba que devuelve el plan correcto sin cambiar ninguna de esas dos
signals. Un `contentHash` que no pertenece al manifiesto lanza el error del
resolver existente. Así recovery puede renderizar el personaje ligado al
checkpoint aunque el perfil local haya cambiado, sin convertir el checkpoint
en una segunda autoridad del editor.

Crear `scripts/checkpoint-boundary.test.mjs` con `node:test` y lecturas de
fuente. En esta tarea falla si:

- `checkpoint-fingerprint.ts` no importa y llama `canonicalSha256`, o contiene
  `crypto.subtle`, `TextEncoder` o una segunda función de canonicalización;
- `CheckpointRequest` no contiene `snapshot`, o el DTO no declara exactamente
  `character`, `evidence`, `npcs` y `clinical`;
- los validators backend/local no contienen los cuatro IDs relacionales exactos,
  alguno no exige `trust`, `tension`, `openness`, `available`, `emotion`, `pose`
  y `consequenceId`, o `_npc_state_projection` omite uno de esos campos;
- `CheckpointDraft` no contiene el snapshot completo;
- aparece `attemptToken` como propiedad de `CheckpointDraft`,
  `PersistedCheckpoint` o `CheckpointEnvelope` (el guard de claves sensibles sí
  puede mencionar ese texto).

El test extrae cada bloque de interfaz entre su `export interface` y la llave de
cierre antes de aplicar esas aserciones; no usa un grep global propenso a falsos
positivos.

- [ ] **Step 4: Limpiar checkpoints del usuario al cerrar sesión**

Antes de borrar `currentUser` en `AuthService.clearSession`, limpiar solo el
namespace del usuario actual:

```typescript
private clearCheckpointStorage(userId: number): void {
  const prefix = 'siep.checkpoint.v2.' + encodeURIComponent(String(userId)) + '.';
  const keys = Array.from(
    { length: localStorage.length },
    (_, index) => localStorage.key(index),
  ).filter((key): key is string => key !== null && key.startsWith(prefix));
  keys.forEach(key => localStorage.removeItem(key));
}

clearSession(): void {
  const userId = this.currentUser()?.id;
  if (userId !== undefined) this.clearCheckpointStorage(userId);
  localStorage.removeItem(this.TOKEN_KEY);
  this.currentUser.set(null);
}
```

Añadir un test con dos usuarios y una clave ajena: `logout()` elimina solamente
`siep.checkpoint.v2.<currentUserId>.*`, además del token, y conserva la clave del
otro usuario.

- [ ] **Step 5: Ejecutar tests**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/runtime/canonical-json-sha256.spec.ts src/app/features/simulator/checkpoint-fingerprint.spec.ts src/app/features/simulator/checkpoint-repository.spec.ts src/app/features/character/character-profile.repository.spec.ts src/app/core/auth/auth.service.spec.ts`

Run: `node --test scripts/checkpoint-boundary.test.mjs`

Expected: los **cinco archivos Jest** y el boundary test terminan PASS; el test
de cuota devuelve `durable:false`, el TTL elimina el registro, el vector
frontend/backend coincide y ningún JSON contiene tokens o claves sensibles.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/features/simulator/checkpoint-fingerprint.ts frontend/src/app/features/simulator/checkpoint-fingerprint.spec.ts frontend/src/app/features/simulator/checkpoint-repository.ts frontend/src/app/features/simulator/checkpoint-repository.spec.ts frontend/src/app/features/simulator/runtime/canonical-json-sha256.spec.ts frontend/src/app/features/character/character-profile.repository.ts frontend/src/app/features/character/character-profile.repository.spec.ts frontend/src/app/core/auth/auth.service.ts frontend/src/app/core/auth/auth.service.spec.ts scripts/checkpoint-boundary.test.mjs
git commit -m "feat(simulator): persist token-free checkpoint queue"
```

### Task 4: Elegir una sola pestaña escritora sin perder borradores

**Files:**
- Create: `frontend/src/app/features/simulator/checkpoint-writer-lease.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-writer-lease.spec.ts`

- [ ] **Step 1: Escribir tests rojos del lease**

```typescript
describe('CheckpointWriterLease', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('elects exactly one owner when two tabs contend', async () => {
    const bus = new FakeBroadcastBus();
    const a = lease('tab-a', bus);
    const b = lease('tab-b', bus);

    const pending = Promise.all([
      a.connect('user-7', 'attempt-a'),
      b.connect('user-7', 'attempt-a'),
    ]);
    await jest.advanceTimersByTimeAsync(50);
    await pending;

    expect(Number(a.isOwner()) + Number(b.isOwner())).toBe(1);
  });

  it('lets another tab take over only after expiry', async () => {
    const bus = new FakeBroadcastBus();
    const a = lease('tab-a', bus);
    const b = lease('tab-b', bus);
    await connectAndSettle(a);
    await connectAndSettle(b);
    expect(b.isOwner()).toBe(false);

    a.crashForTest();
    await jest.advanceTimersByTimeAsync(6_001);
    await b.retryClaim();
    await jest.advanceTimersByTimeAsync(50);

    expect(b.isOwner()).toBe(true);
  });

  it('release removes only the current owner lease', async () => {
    const bus = new FakeBroadcastBus();
    const a = lease('tab-a', bus);
    const b = lease('tab-b', bus);
    await connectAndSettle(a);
    await connectAndSettle(b);

    expect([a.state(), b.state()].sort()).toEqual(['owner', 'standby']);
    const owner = a.isOwner() ? a : b;
    const standby = a.isOwner() ? b : a;
    owner.disconnect();
    expect(standby.state()).toBe('standby');
    expect(localStorage.getItem('siep.checkpoint-lease.v1.user-7.attempt-a'))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/checkpoint-writer-lease.spec.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar lease `localStorage` + `BroadcastChannel`**

```typescript
import { InjectionToken, signal } from '@angular/core';

type LeaseState = 'disconnected' | 'owner' | 'standby';
type LeaseMessage = {
  type: 'claim' | 'heartbeat' | 'release';
  ownerTabId: string;
  expiresAt: number;
};
type LeaseRecord = { ownerTabId: string; expiresAt: number };

const HEARTBEAT_MS = 2_000;
const LEASE_MS = 6_000;
const SETTLE_MS = 50;

export interface BroadcastPort {
  postMessage(value: LeaseMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<LeaseMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<LeaseMessage>) => void): void;
  close(): void;
}

export class CheckpointWriterLease {
  readonly state = signal<LeaseState>('disconnected');
  readonly isOwner = () => this.state() === 'owner';
  private key = '';
  private port: BroadcastPort | null = null;
  private heartbeat: number | null = null;

  constructor(
    readonly tabId: string,
    private readonly storage: Storage,
    private readonly channelFactory: (name: string) => BroadcastPort,
    private readonly now: () => number = () => Date.now(),
    private readonly settle: (ms: number) => Promise<void> =
      ms => new Promise(resolve => window.setTimeout(resolve, ms)),
  ) {}

  async connect(userId: string, attemptId: string): Promise<boolean> {
    this.disconnect();
    this.key = 'siep.checkpoint-lease.v1.'
      + [userId, attemptId].map(encodeURIComponent).join('.');
    this.port = this.channelFactory(this.key);
    this.port.addEventListener('message', this.onMessage);
    window.addEventListener('storage', this.onStorage);
    return this.retryClaim();
  }

  async retryClaim(): Promise<boolean> {
    const existing = this.read();
    if (
      existing
      && existing.ownerTabId !== this.tabId
      && existing.expiresAt > this.now()
    ) {
      this.loseOwnership();
      return false;
    }
    const candidate = {
      ownerTabId: this.tabId,
      expiresAt: this.now() + LEASE_MS,
    };
    this.storage.setItem(this.key, JSON.stringify(candidate));
    this.port?.postMessage({ type: 'claim', ...candidate });
    await this.settle(SETTLE_MS);
    const settled = this.read();
    if (settled?.ownerTabId !== this.tabId) {
      this.loseOwnership();
      return false;
    }
    this.state.set('owner');
    this.startHeartbeat();
    return true;
  }

  disconnect(): void {
    if (this.isOwner()) {
      const current = this.read();
      if (current?.ownerTabId === this.tabId) this.storage.removeItem(this.key);
      this.port?.postMessage({
        type: 'release',
        ownerTabId: this.tabId,
        expiresAt: this.now(),
      });
    }
    this.loseOwnership();
    window.removeEventListener('storage', this.onStorage);
    this.port?.removeEventListener('message', this.onMessage);
    this.port?.close();
    this.port = null;
    this.key = '';
    this.state.set('disconnected');
  }

  private readonly onMessage = (event: MessageEvent<LeaseMessage>): void => {
    if (
      event.data.ownerTabId !== this.tabId
      && event.data.type !== 'release'
      && event.data.expiresAt > this.now()
    ) this.loseOwnership();
  };

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key !== this.key) return;
    const current = this.read();
    if (current?.ownerTabId !== this.tabId) this.loseOwnership();
  };

  private read(): LeaseRecord | null {
    try {
      const value = JSON.parse(this.storage.getItem(this.key) ?? 'null');
      return value
        && typeof value.ownerTabId === 'string'
        && Number.isFinite(value.expiresAt)
        ? value as LeaseRecord
        : null;
    } catch {
      return null;
    }
  }

  canRetryClaim(): boolean {
    const current = this.read();
    return !current
      || current.ownerTabId === this.tabId
      || current.expiresAt <= this.now();
  }

  private startHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => {
      const current = this.read();
      if (current?.ownerTabId !== this.tabId) {
        this.loseOwnership();
        return;
      }
      const next = { ownerTabId: this.tabId, expiresAt: this.now() + LEASE_MS };
      this.storage.setItem(this.key, JSON.stringify(next));
      this.port?.postMessage({ type: 'heartbeat', ...next });
    }, HEARTBEAT_MS);
  }

  private loseOwnership(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.state() !== 'disconnected') this.state.set('standby');
  }
}

export function checkpointTabId(storage: Storage): string {
  const key = 'siep.checkpoint.tab-id';
  const existing = storage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

export const CHECKPOINT_WRITER_LEASE =
  new InjectionToken<CheckpointWriterLease>('CHECKPOINT_WRITER_LEASE', {
    providedIn: 'root',
    factory: () => new CheckpointWriterLease(
      checkpointTabId(window.sessionStorage),
      window.localStorage,
      name => new BroadcastChannel(name),
    ),
  });
```

Persistir `tabId` en `sessionStorage` bajo `siep.checkpoint.tab-id`; una recarga
de la misma pestaña conserva identidad y una pestaña nueva recibe otro UUID.
Los fakes del spec implementan eventos `storage` y mensajes broadcast; no usar
dos mocks que no compartan estado.

- [ ] **Step 4: Ejecutar tests**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/checkpoint-writer-lease.spec.ts`

Expected: PASS; exactamente una instancia es owner y el takeover tarda al menos
6 segundos sin heartbeat.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/simulator/checkpoint-writer-lease.ts frontend/src/app/features/simulator/checkpoint-writer-lease.spec.ts
git commit -m "feat(simulator): elect one checkpoint writer tab"
```

### Task 5: Implementar cola cancelable, retry acotado y conflicto explícito

**Files:**
- Create: `frontend/src/app/features/simulator/checkpoint-queue.service.ts`
- Create: `frontend/src/app/features/simulator/checkpoint-queue.service.spec.ts`
- Create: `frontend/src/app/features/simulator/save-status.component.ts`
- Create: `frontend/src/app/features/simulator/save-status.component.spec.ts`
- Modify: `scripts/checkpoint-boundary.test.mjs`

- [ ] **Step 1: Escribir tests rojos de cola**

```typescript
beforeEach(async () => {
  await queue.connect({
    userId: 'user-7',
    attemptId: 'attempt-a',
    tabId: 'tab-1',
    token: () => 'attempt-token',
  }, { ...WORLD, revision: 3, checkpointReceipt: null });
});

it('retries timeout with the exact original key and clears after ack', fakeAsync(() => {
  api.updateWorldState
    .mockReturnValueOnce(throwError(() => new TimeoutError()))
    .mockReturnValueOnce(of({ ...WORLD, revision: 4 }));

  const pending = queue.enqueue(DRAFT, { requireServerAck: true });
  tick(1000);

  expect(api.updateWorldState).toHaveBeenCalledTimes(2);
  expect(api.updateWorldState.mock.calls[1][2].idempotencyKey)
    .toBe(api.updateWorldState.mock.calls[0][2].idempotencyKey);
  expect(repo.clear).toHaveBeenCalledWith('user-7', 'attempt-a', 'tab-1');
  let outcome: CheckpointFlushResult | undefined;
  void pending.then(value => { outcome = value; });
  flushMicrotasks();
  expect(outcome).toEqual({
    durableLocal: true,
    serverAck: true,
    disposition: 'acknowledged',
  });
}));

it('recognizes a committed request after its response was lost', fakeAsync(() => {
  const stored = envelopeWithActive(CHECKPOINT, FINGERPRINT);
  repo.load.mockReturnValue(stored);
  api.updateWorldState.mockReturnValue(of({
    ...WORLD,
    revision: 5,
    checkpointReceipt: receiptFor(CHECKPOINT, FINGERPRINT, 4, true),
  }));

  queue.connect(CONTEXT, {
    ...WORLD,
    revision: 5,
    checkpointReceipt: null,
  });
  tick();

  expect(api.updateWorldState).toHaveBeenCalledWith(
    'attempt-a', 'attempt-token', CHECKPOINT,
  );
  expect(repo.clear).toHaveBeenCalled();
  expect(queue.revision()).toBe(5);
  expect(queue.status()).toBe('saved');
}));

it.each([400, 401, 403, 404])(
  'stops on fatal HTTP %s without retrying',
  fakeAsync(status => {
  api.updateWorldState.mockReturnValue(throwError(() =>
    new HttpErrorResponse({ status })));
  void queue.enqueue(DRAFT, { requireServerAck: true });
  tick(60_000);
  expect(api.updateWorldState).toHaveBeenCalledTimes(1);
  expect(queue.status()).toBe('error');
  }),
);

it.each([0, 408, 429, 503])(
  'retries retryable HTTP %s once with the same body',
  fakeAsync(status => {
    api.updateWorldState
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })))
      .mockReturnValueOnce(of({ ...WORLD, revision: 4 }));
    void queue.enqueue(DRAFT, { requireServerAck: true });
    tick(30_000);
    expect(api.updateWorldState).toHaveBeenCalledTimes(2);
    expect(api.updateWorldState.mock.calls[1][2])
      .toEqual(api.updateWorldState.mock.calls[0][2]);
  }),
);

it('retries RxJS timeout once with the same body', fakeAsync(() => {
  api.updateWorldState
    .mockReturnValueOnce(throwError(() => new TimeoutError()))
    .mockReturnValueOnce(of({ ...WORLD, revision: 4 }));
  void queue.enqueue(DRAFT, { requireServerAck: true });
  tick(30_000);
  expect(api.updateWorldState).toHaveBeenCalledTimes(2);
  expect(api.updateWorldState.mock.calls[1][2])
    .toEqual(api.updateWorldState.mock.calls[0][2]);
}));

it('stops after exactly six automatic PATCH attempts', fakeAsync(() => {
  api.updateWorldState.mockReturnValue(throwError(() =>
    new HttpErrorResponse({ status: 503 })));
  let outcome: CheckpointFlushResult | undefined;
  void queue.enqueue(DRAFT, { requireServerAck: true })
    .then(value => { outcome = value; });

  for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000]) tick(delay);
  flushMicrotasks();

  expect(api.updateWorldState).toHaveBeenCalledTimes(6);
  expect(queue.status()).toBe('retry-required');
  expect(outcome).toEqual({
    durableLocal: true,
    serverAck: false,
    disposition: 'retry-exhausted',
  });
  expect(repo.clear).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
}));

it('manual retry reuses the exact request and idempotency key', fakeAsync(() => {
  api.updateWorldState
    .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
  void queue.enqueue(DRAFT, { requireServerAck: true });
  for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000]) tick(delay);
  const original = structuredClone(api.updateWorldState.mock.calls[0][2]);
  api.updateWorldState.mockReturnValueOnce(of({ ...WORLD, revision: 4 }));

  void queue.retryNow();
  tick();

  expect(api.updateWorldState).toHaveBeenCalledTimes(7);
  expect(api.updateWorldState.mock.calls[6][2]).toEqual(original);
  expect(queue.status()).toBe('saved');
  expect(jest.getTimerCount()).toBe(1); // solo el transient de saved
}));

it.each([1_000, 2_000, 4_000, 8_000, 16_000])(
  'disconnect at retry boundary %sms leaves no timer',
  fakeAsync(delay => {
    api.updateWorldState.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 503 })));
    void queue.enqueue(DRAFT, { requireServerAck: false });
    tick(delay - 1);
    queue.disconnect();
    tick(60_000);
    expect(jest.getTimerCount()).toBe(0);
  }),
);

it('aborts an old PATCH and GET when connect changes generation', fakeAsync(() => {
  const firstPatch = new Subject<SimulationWorldState>();
  api.updateWorldState.mockReturnValueOnce(firstPatch);
  void queue.enqueue(DRAFT, { requireServerAck: true });
  tick();

  queue.disconnect();
  queue.connect(OTHER_CONTEXT, OTHER_WORLD);
  firstPatch.next({ ...WORLD, revision: 99 });
  tick(60_000);

  expect(queue.revision()).toBe(OTHER_WORLD.revision);
  expect(api.updateWorldState).toHaveBeenCalledTimes(1);
  expect(queue.status()).toBe('idle');
}));

it('persists a standby-tab draft but never sends it', async () => {
  lease.isOwner.mockReturnValue(false);
  const result = await queue.enqueue(DRAFT, { requireServerAck: false });
  expect(result).toEqual({
    durableLocal: true,
    serverAck: false,
    disposition: 'standby-conflict',
  });
  expect(repo.save).toHaveBeenCalled();
  expect(api.updateWorldState).not.toHaveBeenCalled();
  expect(queue.status()).toBe('conflict');
});

it.each([
  [new HttpErrorResponse({ status: 0 }), 'retry-required'],
  [new HttpErrorResponse({ status: 503 }), 'retry-required'],
  [new HttpErrorResponse({ status: 409 }), 'conflict'],
] as const)(
  'retry-this-tab preserves the envelope when GET fails',
  async (failure, expectedStatus) => {
    const stored = envelopeWithActive(CHECKPOINT, FINGERPRINT);
    repo.load.mockReturnValue(stored);
    lease.isOwner.mockReturnValue(false);
    await queue.connect(CONTEXT, WORLD);
    const before = structuredClone(stored);
    repo.save.mockClear();
    lease.retryClaim.mockResolvedValue(true);
    api.getWorld.mockReturnValue(throwError(() => failure));

    await expect(queue.resolveConflict('retry-this-tab')).resolves.toBeUndefined();

    expect(queue.status()).toBe(expectedStatus);
    expect(stored).toEqual(before);
    expect(repo.save).not.toHaveBeenCalled();
    expect(api.updateWorldState).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  },
);

it('retry-this-tab handles lease storage failure without rejecting', async () => {
  const stored = envelopeWithActive(CHECKPOINT, FINGERPRINT);
  repo.load.mockReturnValue(stored);
  lease.isOwner.mockReturnValue(false);
  await queue.connect(CONTEXT, WORLD);
  const before = structuredClone(stored);
  repo.save.mockClear();
  lease.retryClaim.mockRejectedValue(new DOMException('blocked', 'SecurityError'));
  await expect(queue.resolveConflict('retry-this-tab')).resolves.toBeUndefined();
  expect(queue.status()).toBe('error');
  expect(stored).toEqual(before);
  expect(repo.save).not.toHaveBeenCalled();
  expect(api.getWorld).not.toHaveBeenCalled();
});

it('manual retry after a failed retry-this-tab repeats GET before PATCH', async () => {
  const stored = envelopeWithActive(CHECKPOINT, FINGERPRINT);
  repo.load.mockReturnValue(stored);
  lease.isOwner.mockReturnValue(false);
  lease.retryClaim.mockImplementation(async () => {
    lease.isOwner.mockReturnValue(true);
    return true;
  });
  await queue.connect(CONTEXT, WORLD);
  api.getWorld
    .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })))
    .mockReturnValueOnce(of(FRESH_WORLD));

  await queue.resolveConflict('retry-this-tab');
  expect(queue.status()).toBe('retry-required');
  await queue.retryNow();

  expect(api.getWorld).toHaveBeenCalledTimes(2);
  expect(api.getWorld.mock.invocationCallOrder[1])
    .toBeLessThan(api.updateWorldState.mock.invocationCallOrder[0]);
  expect(api.updateWorldState.mock.calls[0][2].snapshot)
    .toEqual(checkpointSnapshotForRequest(
      FRESH_WORLD.checkpointSnapshot,
      CHECKPOINT.snapshot.character,
    ));
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/checkpoint-queue.service.spec.ts`

Expected: FAIL por servicio inexistente.

- [ ] **Step 3: Implementar máquina de estados**

```typescript
import { Inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  firstValueFrom,
  fromEvent,
  Observable,
  takeUntil,
  timeout,
  TimeoutError,
} from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import {
  CheckpointReceipt,
  CheckpointRequest,
  SimulationWorldState,
} from '../../core/models/simulation.model';
import { checkpointRequestFingerprint } from './checkpoint-fingerprint';
import { checkpointSnapshotForRequest } from './checkpoint-snapshot';
import {
  CHECKPOINT_REPOSITORY,
  CheckpointDraft,
  CheckpointEnvelope,
  CheckpointRepository,
  PersistedCheckpoint,
  RepositoryWriteResult,
} from './checkpoint-repository';
import {
  CHECKPOINT_WRITER_LEASE,
  CheckpointWriterLease,
} from './checkpoint-writer-lease';

export type SaveStatus =
  | 'idle' | 'saving' | 'saved' | 'offline'
  | 'recovered' | 'retry-required' | 'conflict' | 'error';

export interface CheckpointFlushResult {
  durableLocal: boolean;
  serverAck: boolean;
  disposition:
    | 'acknowledged'
    | 'queued'
    | 'standby-conflict'
    | 'revision-conflict'
    | 'storage-failed'
    | 'fatal-http'
    | 'retry-exhausted'
    | 'disconnected';
}

interface CheckpointContext {
  userId: string;
  attemptId: string;
  tabId: string;
  token: () => string;
}

@Injectable({ providedIn: 'root' })
export class CheckpointQueueService {
  readonly status = signal<SaveStatus>('idle');
  readonly revision = signal(0);
  readonly canTakeLease = () => this.lease.canRetryClaim();
  private envelope: CheckpointEnvelope | null = null;
  private context: CheckpointContext | null = null;
  readonly worldSnapshot = signal<SimulationWorldState | null>(null);
  private draining: Promise<void> | null = null;
  private retryTimer: number | null = null;
  private idleTimer: number | null = null;
  private automaticAttempts = 0;
  private manualRetryMode: 'active-patch' | 'retry-this-tab' = 'active-patch';
  private generation = 0;
  private abortController = new AbortController();
  private readonly waiters = new Map<
    string,
    (result: CheckpointFlushResult) => void
  >();

  constructor(
    private readonly api: SimulationService,
    @Inject(CHECKPOINT_REPOSITORY)
    private readonly repo: CheckpointRepository,
    @Inject(CHECKPOINT_WRITER_LEASE)
    private readonly lease: CheckpointWriterLease,
  ) {}

  async connect(
    context: CheckpointContext,
    world: SimulationWorldState,
  ): Promise<void> {
    this.disconnect();
    const generation = this.generation;
    this.context = context;
    this.automaticAttempts = 0;
    this.manualRetryMode = 'active-patch';
    this.worldSnapshot.set(world);
    this.revision.set(world.revision);
    this.envelope = this.repo.load(
      context.userId, context.attemptId, context.tabId,
    ) ?? this.repo.create(context.userId, context.attemptId, context.tabId);
    if (
      this.envelope.active
      && receiptMatches(this.envelope.active, world.checkpointReceipt)
    ) {
      this.envelope.active = null;
      this.persistEnvelopeOrClear();
    }
    await this.lease.connect(context.userId, context.attemptId);
    if (generation !== this.generation || !this.context) return;
    if (this.lease.isOwner()) void this.startDrain(generation);
    else if (this.envelope.active || this.envelope.queued) this.status.set('conflict');
  }

  disconnect(): void {
    this.generation += 1;
    this.abortController.abort();
    this.abortController = new AbortController();
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.retryTimer = null;
    this.idleTimer = null;
    this.automaticAttempts = 0;
    this.manualRetryMode = 'active-patch';
    this.draining = null;
    this.lease.disconnect();
    for (const resolve of this.waiters.values()) {
      resolve({
        durableLocal: true,
        serverAck: false,
        disposition: 'disconnected',
      });
    }
    this.waiters.clear();
    this.context = null;
    this.worldSnapshot.set(null);
    this.envelope = null;
    this.status.set('idle');
  }

  async enqueue(
    input: Omit<CheckpointDraft, 'draftId' | 'createdAt'>,
    policy: { requireServerAck: boolean },
  ): Promise<CheckpointFlushResult> {
    if (!this.context) throw new Error('Checkpoint queue is not connected');
    if (!this.envelope) throw new Error('Checkpoint envelope is not loaded');
    const draft: CheckpointDraft = {
      ...input,
      draftId: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.envelope.queued = draft;
    const persisted = this.persistEnvelope();
    if (!persisted.durable) {
      this.status.set('error');
      return {
        durableLocal: false,
        serverAck: false,
        disposition: 'storage-failed',
      };
    }
    if (!this.lease.isOwner()) {
      this.status.set('conflict');
      return {
        durableLocal: true,
        serverAck: false,
        disposition: 'standby-conflict',
      };
    }
    const generation = this.generation;
    void this.startDrain(generation);
    if (!policy.requireServerAck) {
      return {
        durableLocal: true,
        serverAck: false,
        disposition: 'queued',
      };
    }
    return new Promise(resolve => this.waiters.set(draft.draftId, resolve));
  }

  private startDrain(generation: number): Promise<void> {
    if (
      generation !== this.generation
      || !this.context
      || !this.envelope
      || !this.lease.isOwner()
    ) return Promise.resolve();
    if (!this.draining) {
      this.draining = this.drain(generation).finally(() => {
        if (generation !== this.generation) return;
        this.draining = null;
        if (
          this.context
          && this.envelope
          && (this.envelope.active || this.envelope.queued)
          && ![
            'offline', 'retry-required', 'conflict', 'error',
          ].includes(this.status())
        ) void this.startDrain(generation);
      });
    }
    return this.draining;
  }

  private async drain(generation: number): Promise<void> {
    while (
      generation === this.generation
      && this.context
      && this.envelope
      && this.lease.isOwner()
    ) {
      if (!this.envelope.active && this.envelope.queued) {
        const draft = this.envelope.queued;
        const request: CheckpointRequest = {
          playerX: draft.playerX,
          playerY: draft.playerY,
          currentMapKey: draft.currentMapKey,
          reason: draft.reason,
          expectedRevision: this.revision(),
          idempotencyKey: 'cp:' + draft.draftId,
          snapshot: draft.snapshot,
        };
        this.envelope.active = {
          request,
          requestFingerprint: await checkpointRequestFingerprint(request),
          draftId: draft.draftId,
        };
        this.envelope.queued = null;
        if (!this.persistEnvelope().durable) {
          this.failDraft(draft.draftId, 'storage-failed');
          return;
        }
        this.automaticAttempts = 0;
      }
      const active = this.envelope.active;
      if (!active) return;
      const recovering = this.status() === 'offline';
      this.status.set('saving');
      try {
        this.automaticAttempts += 1;
        const world = await this.requestWithAbort(
          this.api.updateWorldState(
            this.context.attemptId,
            this.context.token(),
            active.request,
          ),
          2_500,
          generation,
        );
        if (!world) return;
        this.worldSnapshot.set(world);
        this.revision.set(world.revision);
        this.automaticAttempts = 0;
        this.envelope.active = null;
        this.persistEnvelopeOrClear();
        this.resolveDraft(active.draftId, 'acknowledged', true);
        this.showTransient(recovering ? 'recovered' : 'saved', generation);
      } catch (error) {
        if (generation !== this.generation) return;
        if (isRetryable(error)) {
          this.deferOrRequireManual(active, generation);
          return;
        }
        if (error instanceof HttpErrorResponse && error.status === 409) {
          await this.reconcileConflict(active, generation);
          return;
        }
        this.status.set('error');
        this.resolveDraft(active.draftId, 'fatal-http', false);
        return;
      }
    }
  }

  private async reconcileConflict(
    active: PersistedCheckpoint,
    generation: number,
  ): Promise<void> {
    try {
      const world = await this.requestWithAbort(
        this.api.getWorld(this.context!.attemptId, this.context!.token()),
        2_500,
        generation,
      );
      if (!world) return;
      this.worldSnapshot.set(world);
      this.revision.set(world.revision);
      if (receiptMatches(active, world.checkpointReceipt)) {
        this.automaticAttempts = 0;
        this.envelope!.active = null;
        this.persistEnvelopeOrClear();
        this.resolveDraft(active.draftId, 'acknowledged', true);
        this.showTransient('recovered', generation);
        return;
      }
      this.status.set('conflict');
      this.resolveDraft(active.draftId, 'revision-conflict', false);
    } catch (error) {
      if (generation !== this.generation) return;
      if (isRetryable(error)) {
        this.deferOrRequireManual(active, generation);
      } else {
        this.status.set('error');
        this.resolveDraft(active.draftId, 'fatal-http', false);
      }
    }
  }

  private deferOrRequireManual(
    active: PersistedCheckpoint,
    generation: number,
  ): void {
    if (this.automaticAttempts >= MAX_AUTOMATIC_ATTEMPTS) {
      this.clearRetryTimer();
      this.manualRetryMode = 'active-patch';
      this.status.set('retry-required');
      this.resolveDraft(active.draftId, 'retry-exhausted', false);
      return;
    }
    this.status.set('offline');
    this.scheduleRetry(generation, this.automaticAttempts);
  }

  private scheduleRetry(
    generation: number,
    failedAttempt: number,
  ): void {
    if (this.retryTimer !== null) return;
    const delay = RETRY_DELAYS[failedAttempt - 1];
    if (delay === undefined) throw new Error('retry_schedule_out_of_bounds');
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (
        generation === this.generation
        && this.context
        && this.envelope
        && this.lease.isOwner()
      ) void this.startDrain(generation);
    }, delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
```

Completar los helpers con estos contratos exactos:

```typescript
const MAX_AUTOMATIC_ATTEMPTS = 6;
const RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  return error instanceof HttpErrorResponse
    && (
      error.status === 0
      || error.status === 408
      || error.status === 429
      || error.status >= 500
    );
}

function receiptMatches(
  active: PersistedCheckpoint,
  receipt: CheckpointReceipt | null,
): boolean {
  return receipt?.idempotencyKey === active.request.idempotencyKey
    && receipt.requestFingerprint === active.requestFingerprint;
}
```

Añadir dentro del servicio:

```typescript
observeServerWorld(world: SimulationWorldState): void {
  this.worldSnapshot.set(world);
  this.revision.set(world.revision);
  const active = this.envelope?.active;
  if (active && receiptMatches(active, world.checkpointReceipt)) {
    this.clearRetryTimer();
    this.automaticAttempts = 0;
    this.envelope!.active = null;
    this.persistEnvelopeOrClear();
    this.resolveDraft(active.draftId, 'acknowledged', true);
  }
}

async retryNow(): Promise<void> {
  if (!this.context || !this.envelope?.active) return;
  this.clearRetryTimer();
  if (this.manualRetryMode === 'retry-this-tab') {
    await this.resolveConflict('retry-this-tab');
    return;
  }
  try {
    if (!this.lease.isOwner() && !(await this.lease.retryClaim())) {
      this.status.set('conflict');
      return;
    }
  } catch {
    this.status.set('error');
    return;
  }
  this.automaticAttempts = 0;
  this.status.set('saving');
  await this.startDrain(this.generation);
}

async resolveConflict(
  strategy: 'use-server' | 'retry-this-tab',
): Promise<void> {
  if (!this.context || !this.envelope) return;
  if (strategy === 'use-server') {
    const generation = this.generation;
    try {
      const world = await this.requestWithAbort(
        this.api.getWorld(this.context.attemptId, this.context.token()),
        2_500,
        generation,
      );
      if (!world || generation !== this.generation) return;
      this.worldSnapshot.set(world);
      this.revision.set(world.revision);
      this.clearRetryTimer();
      this.automaticAttempts = 0;
    } catch (error) {
      if (generation !== this.generation) return;
      this.status.set(isRetryable(error) ? 'conflict' : 'error');
      return;
    }
    this.envelope.active = null;
    this.envelope.queued = null;
    this.repo.clear(
      this.context.userId,
      this.context.attemptId,
      this.context.tabId,
    );
    this.status.set('idle');
    this.manualRetryMode = 'active-patch';
    return;
  }
  const generation = this.generation;
  let world: SimulationWorldState | null;
  try {
    if (!(await this.lease.retryClaim())) {
      this.status.set('conflict');
      return;
    }
    world = await this.requestWithAbort(
      this.api.getWorld(this.context.attemptId, this.context.token()),
      2_500,
      generation,
    );
  } catch (error) {
    if (generation !== this.generation) return;
    this.clearRetryTimer();
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.status.set('conflict');
    } else if (isRetryable(error)) {
      this.manualRetryMode = 'retry-this-tab';
      this.status.set('retry-required');
    } else {
      this.status.set('error');
    }
    return;
  }
  if (!world || generation !== this.generation) return;
  this.worldSnapshot.set(world);
  this.revision.set(world.revision);
  const stale = this.envelope.active;
  if (stale) {
    this.envelope.queued = {
      draftId: crypto.randomUUID(),
      createdAt: Date.now(),
      playerX: stale.request.playerX,
      playerY: stale.request.playerY,
      currentMapKey: stale.request.currentMapKey,
      reason: stale.request.reason,
      snapshot: checkpointSnapshotForRequest(
        world.checkpointSnapshot,
        stale.request.snapshot.character,
      ),
    };
    this.envelope.active = null;
  }
  if (!this.persistEnvelope().durable) {
    this.status.set('error');
    return;
  }
  this.automaticAttempts = 0;
  this.manualRetryMode = 'active-patch';
  this.status.set('idle');
  void this.startDrain(generation);
}

private async requestWithAbort<T>(
  source: Observable<T>,
  timeoutMs: number,
  generation: number,
): Promise<T | null> {
  const signal = this.abortController.signal;
  if (signal.aborted || generation !== this.generation) return null;
  const value = await firstValueFrom(
    source.pipe(
      timeout({ first: timeoutMs }),
      takeUntil(fromEvent(signal, 'abort')),
    ),
    { defaultValue: null },
  );
  return generation === this.generation ? value : null;
}

private persistEnvelope(): RepositoryWriteResult {
  return this.envelope
    ? this.repo.save(this.envelope)
    : { durable: false, reason: 'storage-unavailable' };
}

private persistEnvelopeOrClear(): void {
  if (!this.context || !this.envelope) return;
  if (!this.envelope.active && !this.envelope.queued) {
    this.repo.clear(
      this.context.userId,
      this.context.attemptId,
      this.context.tabId,
    );
    return;
  }
  this.persistEnvelope();
}

private resolveDraft(
  draftId: string,
  disposition: CheckpointFlushResult['disposition'],
  serverAck: boolean,
): void {
  const resolve = this.waiters.get(draftId);
  if (!resolve) return;
  this.waiters.delete(draftId);
  resolve({ durableLocal: true, serverAck, disposition });
}

private failDraft(
  draftId: string,
  disposition: 'storage-failed' | 'fatal-http',
): void {
  this.status.set('error');
  this.resolveDraft(draftId, disposition, false);
}

private showTransient(
  status: Extract<SaveStatus, 'saved' | 'recovered'>,
  generation: number,
): void {
  this.status.set(status);
  if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
  this.idleTimer = window.setTimeout(() => {
    this.idleTimer = null;
    if (
      generation === this.generation
      && this.context
      && this.envelope
      && !this.envelope.active
      && !this.envelope.queued
    ) this.status.set('idle');
  }, 2_000);
}
```

PATCH y GET se desuscriben al abortar. Nunca llamar `startDrain` desde `finally`
o un timer si `context === null` o la generación cambió.

Añadir pruebas independientes para:

- coalescing: durante un PATCH en vuelo, dos snapshots nuevos reemplazan solo
  `queued`; al ACK se materializa el último con una clave nueva;
- reconnect: `active.request` y su `idempotencyKey` quedan byte por byte iguales;
- GET de conflicto con timeout programa un único retry;
- `disconnect()` durante PATCH y durante GET impide cambios de revisión y
  relanzamientos;
- 400/401/403/404 son fatales; 0/timeout/408/429/5xx son reintentables;
- al perder el lease se persiste el draft propio, no se envía y no se borra el
  registro de la otra pestaña;
- `resolveConflict('use-server')` borra solo el registro de esta pestaña;
- `resolveConflict('retry-this-tab')` exige obtener el lease y un GET fresco
  antes de crear una nueva clave lógica;
- `saved` y `recovered` vuelven a `idle` tras 2 segundos.

- [ ] **Step 4: Implementar indicador accesible**

```typescript
import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-save-status',
  standalone: true,
  template: `
    <section class="save-status" [hidden]="status() === 'idle'">
      <span role="status" aria-live="polite">{{ label() }}</span>
      @if (status() === 'conflict') {
        <div class="save-status__actions">
          <button type="button" (click)="resolve.emit('use-server')">
            Usar progreso del servidor
          </button>
          <button
            type="button"
            [disabled]="!canTakeLease()"
            (click)="resolve.emit('retry-this-tab')">
            Conservar esta pestaña
          </button>
        </div>
      }
      @if (status() === 'retry-required') {
        <button type="button" (click)="retry.emit()">
          Reintentar ahora
        </button>
      }
    </section>
  `,
})
export class SaveStatusComponent {
  readonly status = input.required<SaveStatus>();
  readonly canTakeLease = input(false);
  readonly resolve = output<'use-server' | 'retry-this-tab'>();
  readonly retry = output<void>();
  readonly label = computed(() => ({
    idle: '',
    saving: 'Guardando…',
    saved: 'Guardado',
    offline: 'Sin conexión. Reintentando el progreso guardado…',
    recovered: 'Conexión recuperada. Progreso guardado.',
    'retry-required': 'El progreso sigue seguro en este dispositivo. Reintenta cuando haya conexión.',
    conflict: 'Otra pestaña tiene progreso pendiente. Elige qué versión conservar.',
    error: 'No fue posible conservar el progreso en este dispositivo.',
  })[this.status()]);
}
```

El segundo botón permanece deshabilitado hasta que el lease expire o se libere.
No aplicar “última escritura gana” de forma automática. El output `retry` se
cablea en Task 6 a `checkpoints.retryNow()`; es visible solo después de seis
PATCH automáticos fallidos. El estado `offline` nunca dura indefinidamente y
`retry-required` no conserva timers.

- [ ] **Step 5: Ejecutar tests**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/checkpoint-queue.service.spec.ts src/app/features/simulator/save-status.component.spec.ts`

Expected: PASS con timers falsos; claves estables durante retry/reconnect, GET
cancelable, exactamente seis intentos automáticos como máximo, cero timers tras
agotamiento/desconexión, recuperación manual con el mismo body/key y una sola
pestaña escritora. Extender `checkpoint-boundary.test.mjs` para exigir los
literales `MAX_AUTOMATIC_ATTEMPTS = 6`, los cinco delays exactos,
`retry-required` y un `catch` que cubra el GET de `retry-this-tab`.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/features/simulator/checkpoint-queue.service.ts frontend/src/app/features/simulator/checkpoint-queue.service.spec.ts frontend/src/app/features/simulator/save-status.component.ts frontend/src/app/features/simulator/save-status.component.spec.ts scripts/checkpoint-boundary.test.mjs
git commit -m "feat(simulator): recover checkpoint queue"
```

### Task 6: Aplicar la política local/ACK en cada beat seguro

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/src/app/features/simulator/save-status.component.ts`
- Modify: `frontend/src/app/features/simulator/save-status.component.spec.ts`
- Modify: `frontend/src/app/features/simulator/checkpoint-snapshot.spec.ts`
- Modify: `frontend/src/app/features/character/character-profile.repository.spec.ts`

- [ ] **Step 1: Escribir tests sobre los flujos públicos reales**

```typescript
it('waits for ACK before enterRoom', async () => {
  const ack = deferred<CheckpointFlushResult>();
  queue.enqueue.mockReturnValue(ack.promise);
  component.onDoorTrigger({
    targetNodeKey: LISTENING_ROOM_NODE_KEY,
    entryX: 160,
    entryY: 452,
  });

  expect(queue.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'room' }),
    { requireServerAck: true },
  );
  expect(simulationService.enterRoom).not.toHaveBeenCalled();
  ack.resolve({
    durableLocal: true,
    serverAck: true,
    disposition: 'acknowledged',
  });
  await fixture.whenStable();
  expect(simulationService.enterRoom).toHaveBeenCalledTimes(1);
});

it('waits for ACK before chooseDecision', async () => {
  const ack = deferred<CheckpointFlushResult>();
  queue.enqueue.mockReturnValue(ack.promise);
  component.executeDecision(RECOMMENDED_DECISION_ID);

  expect(queue.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'decision' }),
    { requireServerAck: true },
  );
  expect(simulationService.chooseDecision).not.toHaveBeenCalled();
  ack.resolve({
    durableLocal: true,
    serverAck: true,
    disposition: 'acknowledged',
  });
  await fixture.whenStable();
  expect(simulationService.chooseDecision).toHaveBeenCalledTimes(1);
});

it('uses repair reason for the second decision and still waits for ACK', async () => {
  const ack = deferred<CheckpointFlushResult>();
  queue.enqueue.mockReturnValue(ack.promise);
  component.handleFrontendChoice('frontend:repair-consequence');
  component.executeDecision(REPAIR_DECISION_ID);

  expect(queue.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'repair' }),
    { requireServerAck: true },
  );
  expect(simulationService.chooseDecision).not.toHaveBeenCalled();
  ack.resolve({
    durableLocal: true,
    serverAck: true,
    disposition: 'acknowledged',
  });
  await fixture.whenStable();
  expect(simulationService.chooseDecision).toHaveBeenCalledTimes(1);
});

it('safe exit proceeds after local durability without waiting for PATCH ack', async () => {
  queue.enqueue.mockResolvedValue({
    durableLocal: true,
    serverAck: false,
    disposition: 'queued',
  });
  component.safeExit();
  await fixture.whenStable();

  expect(simulationService.safeExit).toHaveBeenCalledTimes(1);
});

it('safe exit stops if local persistence failed', async () => {
  queue.enqueue.mockResolvedValue({
    durableLocal: false,
    serverAck: false,
    disposition: 'storage-failed',
  });
  component.safeExit();
  await fixture.whenStable();

  expect(simulationService.safeExit).not.toHaveBeenCalled();
  expect(component.actionError()).toContain('dispositivo');
});

it('pagehide persists locally and never waits for the network', () => {
  window.dispatchEvent(new PageTransitionEvent('pagehide'));
  expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    reason: 'pagehide',
    currentMapKey: WORLD.map.key,
  }), { requireServerAck: false });
});

it('persists the complete authoritative snapshot and immutable character ref', async () => {
  await component.flushCheckpointForTest('periodic', false);
  expect(queue.enqueue).toHaveBeenLastCalledWith({
    playerX: Math.round(PLAYER.x),
    playerY: Math.round(PLAYER.y),
    currentMapKey: WORLD.map.key,
    reason: 'periodic',
    snapshot: {
      ...WORLD.checkpointSnapshot,
      character: CHARACTER_REFERENCE,
    },
  }, { requireServerAck: false });
  expect(queue.enqueue.mock.calls.at(-1)?.[0].snapshot).toEqual({
    schemaVersion: 1,
    character: CHARACTER_REFERENCE,
    evidence: WORLD.checkpointSnapshot.evidence,
    npcs: WORLD.checkpointSnapshot.npcs,
    clinical: WORLD.checkpointSnapshot.clinical,
  });
});

it.each(['room', 'decision', 'repair'] as const)(
  'queues an authoritative post-mutation %s snapshot',
  async reason => {
    await completeSuccessfulMutationThroughPublicFlow(component, reason);
    simulationService.getWorld.mockReturnValueOnce(of(ACCEPTED_WORLD[reason]));
    await fixture.whenStable();
    expect(queue.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason,
        snapshot: checkpointSnapshotForRequest(
          ACCEPTED_WORLD[reason].checkpointSnapshot,
          CHARACTER_REFERENCE,
        ),
      }),
      { requireServerAck: false },
    );
  },
);

it('checkpoints dialogue open and close without creating a clinical event', async () => {
  component.openDialogue(DIALOGUE);
  component.closeDialogue();
  expect(queue.enqueue).toHaveBeenNthCalledWith(
    1, expect.objectContaining({ reason: 'dialogue' }),
    { requireServerAck: false },
  );
  expect(queue.enqueue).toHaveBeenNthCalledWith(
    2, expect.objectContaining({ reason: 'dialogue' }),
    { requireServerAck: false },
  );
  expect(simulationService.chooseDecision).not.toHaveBeenCalled();
});

it('renders the checkpoint-bound character without changing the editor profile', () => {
  const editorPlan = characterProfiles.renderPlan();
  characterProfiles.resolveReference.mockReturnValue(RECOVERED_PLAN);
  component.applyLoadedWorldForTest({
    ...WORLD,
    checkpointSnapshot: {
      ...WORLD.checkpointSnapshot,
      character: RECOVERED_CHARACTER_REFERENCE,
    },
  });
  expect(component.avatarRenderPlan()).toBe(RECOVERED_PLAN);
  expect(characterProfiles.renderPlan()).toBe(editorPlan);
});

it('fails closed before starting the world when the bound character is invalid', () => {
  characterProfiles.resolveReference.mockImplementation(() => {
    throw new Error('character_content_hash_mismatch');
  });
  component.applyLoadedWorldForTest(RECOVERED_WORLD);
  expect(gameWorld.start).not.toHaveBeenCalled();
  expect(queue.connect).not.toHaveBeenCalled();
  expect(component.actionError()).toContain('personaje guardado');
});
```

`LISTENING_ROOM_NODE_KEY`, `RECOMMENDED_DECISION_ID` y `REPAIR_DECISION_ID` se
obtienen del `WORLD`/`ATTEMPT` publicado por el fixture del spec; no se
hardcodean PKs. El caso de reparación prepara `pendingRepair` y
`repairDialogueSnapshot` mediante el resultado de decisión del plan de caso vivo,
antes de llamar la acción pública `frontend:repair-consequence`.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: FAIL porque el componente aún usa PATCH directo y `withSyncedPosition`.

- [ ] **Step 3: Implementar envelope y listeners**

```typescript
private async flushCheckpoint(
  reason: CheckpointReason,
  requireServerAck: boolean,
): Promise<CheckpointFlushResult> {
  const world = this.world();
  const position = this.gameWorld?.playerPosition() ?? this.lastPosition;
  if (!world || !position) {
    return {
      durableLocal: false,
      serverAck: false,
      disposition: 'storage-failed',
    };
  }
  return this.checkpoints.enqueue({
    playerX: Math.round(position.x),
    playerY: Math.round(position.y),
    currentMapKey: world.map.key,
    reason,
    snapshot: checkpointSnapshotForRequest(
      world.checkpointSnapshot,
      characterReference(this.avatarRenderPlan()),
    ),
  }, { requireServerAck });
}

readonly onPageHide = (): void => {
  void this.flushCheckpoint('pagehide', false);
};
```

Reemplazar la signal directa final `avatarRenderPlan =
characterProfiles.renderPlan` por una resolución de recovery que no toca el
perfil del editor:

```typescript
private readonly checkpointAvatarPlan = signal<AvatarRenderPlan | null>(null);
readonly avatarRenderPlan = computed(() =>
  this.checkpointAvatarPlan() ?? this.characterProfiles.renderPlan(),
);

private bindCheckpointCharacter(world: SimulationWorldState): boolean {
  const reference = world.checkpointSnapshot.character;
  if (reference === null) {
    this.checkpointAvatarPlan.set(null);
    return true;
  }
  try {
    this.checkpointAvatarPlan.set(
      this.characterProfiles.resolveReference(reference),
    );
    return true;
  } catch {
    this.checkpointAvatarPlan.set(null);
    this.showActionError(
      'No pudimos validar el personaje guardado. Sal de forma segura y vuelve a intentarlo.',
    );
    return false;
  }
}
```

La única entrada de un mundo cargado llama `bindCheckpointCharacter(world)`
**antes** de asignar `world`, crear/iniciar Phaser o conectar la cola. Si
devuelve `false`, la escena no arranca y solo quedan disponibles reintentar
carga/salida segura. Para un intento aún no ligado, `characterReference` toma
las cinco claves del plan activo. Para uno recuperado siempre prevalece la
referencia inmutable que devolvió el backend. No guardar nunca el render plan ni
sus sheets.

Al recibir el primer `SimulationWorldState`, conectar la cola con el snapshot
completo, no solo la revisión:

```typescript
private checkpointAttemptId: string | null = null;

private connectCheckpointQueue(world: SimulationWorldState): void {
  const game = this.attempt();
  const user = this.auth.currentUser();
  if (!game || !user) return;
  if (this.checkpointAttemptId === game.attemptId) {
    this.checkpoints.observeServerWorld(world);
    return;
  }
  this.checkpointAttemptId = game.attemptId;
  void this.checkpoints.connect({
    userId: String(user.id),
    attemptId: game.attemptId,
    tabId: checkpointTabId(sessionStorage),
    token: () => this.attempt()?.attemptToken ?? '',
  }, world);
}
```

Registrar `pagehide` en `ngOnInit`; removerlo y llamar
`checkpoints.disconnect()` en `ngOnDestroy`, poniendo también
`checkpointAttemptId = null`, `checkpointAvatarPlan.set(null)` y
`pendingPostMutationCheckpointReason = null`. El flush periódico usa un debounce
de 1.000 ms y `{ requireServerAck:false }`.

- [ ] **Step 4: Reemplazar el gate genérico por políticas explícitas**

Para puerta y decisión —incluida la segunda decisión de reparación—:

```typescript
private async requireCheckpointAck(
  reason: Extract<CheckpointReason, 'room' | 'decision' | 'repair'>,
  mutation: () => void,
): Promise<void> {
  const result = await this.flushCheckpoint(reason, true);
  if (!result.serverAck) {
    this.busy.set(false);
    this.showActionError(
      result.disposition === 'standby-conflict'
        ? 'Resuelve el conflicto entre pestañas antes de continuar.'
        : 'Conservamos tu posición localmente; esta acción requiere conexión.',
    );
    return;
  }
  mutation();
}
```

En `tryOpenDoor`, sustituir `withSyncedPosition` por
`void requireCheckpointAck('room', () => triggerFade(...enterRoom...))` y dejar
intacto el `simulationService.enterRoom(attemptId, attemptToken, target,
door.key)` existente.

En `executeDecision`, después de resolver el gate de evidencia y antes de cerrar
el diálogo, capturar:

```typescript
const transitionReason: Extract<CheckpointReason, 'decision' | 'repair'> =
  this.pendingRepair() !== null && this.repairDialogueSnapshot !== null
    ? 'repair'
    : 'decision';
```

Sustituir la llamada directa a `triggerFade(...chooseDecision...)` por
`void requireCheckpointAck(transitionReason, () => triggerFade(...))`. El
callback conserva exactamente el `chooseDecision(attemptId, attemptToken,
decisionOptionId, decisionRevision, idempotencyKey, evidenceOverride,
confirmedMissingEvidence)` versionado por el plan de caso vivo. No crear un
endpoint de reparación separado: `handleFrontendChoice('frontend:repair-consequence')` restaura
`repairDialogueSnapshot`, mantiene `pendingRepair()` y la opción vuelve por
`executeDecision`. `applyDecisionResult`/`finishPostDecision` siguen siendo los
únicos que cierran ese estado. Mover `dialogue.set(null)` y el inicio del fade al
callback confirmado: diálogo/confirmación permanece visible mientras falta ACK.

El ACK anterior a la mutación conserva el mundo previo: nunca presenta como
aceptada una consecuencia que el servidor aún no recibió. Después de una
respuesta autoritativa exitosa, persistir una segunda frontera con el snapshot
nuevo:

```typescript
private pendingPostMutationCheckpointReason:
  Extract<CheckpointReason, 'room' | 'decision' | 'repair'> | null = null;

private markAcceptedMutation(
  reason: Extract<CheckpointReason, 'room' | 'decision' | 'repair'>,
): void {
  this.pendingPostMutationCheckpointReason = reason;
}

private consumeAcceptedMutationCheckpoint(): void {
  const reason = this.pendingPostMutationCheckpointReason;
  if (reason === null) return;
  this.pendingPostMutationCheckpointReason = null;
  void this.flushCheckpoint(reason, false);
}
```

En el `next` exitoso de `enterRoom`, llamar `markAcceptedMutation('room')`
antes de aplicar/cargar su mundo. En el `next` exitoso de `chooseDecision`, usar
el `transitionReason` capturado (`decision` o `repair`) antes de `loadWorld`.
La única función que aplica el `SimulationWorldState` llama, en este orden:
validar personaje ligado, asignar mundo, `connectCheckpointQueue(world)`,
actualizar escena y finalmente `consumeAcceptedMutationCheckpoint()`. Así el
segundo envelope contiene la evidencia, estados NPC, consecuencia y reparación
pendiente que el backend acaba de aceptar; no una reconstrucción del cliente.
Un error HTTP no marca ni consume esta frontera.

Al abrir y al cerrar un diálogo llamar `flushCheckpoint('dialogue', false)`;
al entrar en pausa segura llamar `flushCheckpoint('pause', false)`. Son
fronteras de presentación/recuperación y no llaman `chooseDecision`, no añaden
eventos clínicos ni alteran flags autoritativos. El debounce periódico conserva
solo posición y siempre coalesce el snapshot completo más reciente.

La salida segura tiene otra semántica:

```typescript
async safeExit(): Promise<void> {
  const game = this.attempt();
  if (!game || this.inputBlocked() || this.busy()) return;
  this.busy.set(true);
  const result = await this.flushCheckpoint('safe-exit', false);
  if (!result.durableLocal) {
    this.busy.set(false);
    this.showActionError(
      'No pudimos conservar el progreso en este dispositivo. Libera espacio e inténtalo de nuevo.',
    );
    return;
  }
  this.pauseCurrentAttempt();
}
```

Por tanto, una caída del PATCH de posición nunca secuestra el acceso a salida
segura; la petición `safe-exit` conserva su propio manejo de error. No afirmar
que una salida offline quedó registrada en servidor: solo que el checkpoint
local no bloqueó el intento de salida.

Eliminar `withSyncedPosition`, `persistPosition` con PATCH directo y los dos
callers transitorios de Task 2. Interacciones sin mutación de DAG pueden encolar
`dialogue` localmente; puertas, decisiones y reparación nunca continúan con
`serverAck:false`.

- [ ] **Step 5: Renderizar estado y resolver conflicto**

```html
<app-save-status
  [status]="checkpoints.status()"
  [canTakeLease]="checkpoints.canTakeLease()"
  (resolve)="resolveCheckpointConflict($event)"
  (retry)="checkpoints.retryNow()" />
```

```typescript
async resolveCheckpointConflict(
  strategy: 'use-server' | 'retry-this-tab',
): Promise<void> {
  await this.checkpoints.resolveConflict(strategy);
  const world = this.checkpoints.worldSnapshot();
  if (strategy === 'use-server' && world) {
    this.world.set(world);
    this.lastPosition = { ...world.player };
  }
}
```

El indicador es discreto y se oculta cuando `idle`; el conflicto permanece
visible y operable con teclado hasta una elección explícita. El botón de
`retry-required` relanza el mismo `active.request` y no crea un idempotency key
nuevo.

- [ ] **Step 6: Ejecutar tests y scan de ownership**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/character/character-profile.repository.spec.ts src/app/features/simulator/checkpoint-snapshot.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts src/app/features/simulator/checkpoint-queue.service.spec.ts src/app/features/simulator/save-status.component.spec.ts`

Run:

```powershell
$hits = Get-ChildItem frontend/src/app/features/simulator -Recurse -File -Filter *.ts |
  Select-String -Pattern '\.updateWorldState\('
if ($hits) { $hits | ForEach-Object { "$($_.Path):$($_.LineNumber)" }; throw "Direct checkpoint caller remains" }
```

Expected: los **cinco archivos Jest** terminan PASS, hay cero callers directos
dentro del simulador, cada beat seguro lleva snapshot completo, el personaje de
recovery se resuelve sin mutar el perfil y no queda listener/timer al destruir el
componente.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/character/character-profile.repository.spec.ts frontend/src/app/features/simulator/checkpoint-snapshot.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/src/app/features/simulator/save-status.component.ts frontend/src/app/features/simulator/save-status.component.spec.ts
git commit -m "feat(simulator): checkpoint safe gameplay beats"
```

### Task 7: Probar recovery real, abort y conflicto 409

**Files:**
- Create: `frontend/e2e/premium-recovery.e2e.ts`
- Modify: `frontend/e2e/support/quality-gates.ts`
- Modify: `frontend/e2e/support/quality-gates.spec.ts`
- Modify: `frontend/e2e/support/premium-case-flow.ts`
- Modify: `frontend/e2e/support/siep-flow.ts`

- [ ] **Step 1: Escribir el test E2E de recuperación**

```typescript
import { expect, Request, test } from '@playwright/test';

import type {
  CheckpointNpcSnapshot,
  CheckpointRequest,
  SimulationWorldState,
} from '../src/app/core/models/simulation.model';

import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import { monitorRuntimeFailures } from './support/quality-gates';
import { enterPremiumWorld } from './support/premium-case-flow';
import {
  moveAndPersistPosition,
  reloadAndResumeAttempt,
} from './support/siep-flow';

const RELATIONAL_ACTORS = [
  'familia-duelo',
  'psicologa-acompanante',
  'sobreviviente-consulta',
  'profesional-psicosocial',
] as const;

function assertCompleteRelationalNpcSnapshot(npcs: CheckpointNpcSnapshot): void {
  expect(Object.keys(npcs.states).sort()).toEqual([...RELATIONAL_ACTORS].sort());
  for (const actorKey of RELATIONAL_ACTORS) {
    const state = npcs.states[actorKey];
    expect(Object.keys(state).sort()).toEqual([
      'available', 'consequenceId', 'emotion', 'openness',
      'pose', 'tension', 'trust',
    ]);
    expect(typeof state.available).toBe('boolean');
    expect(['idle', 'react']).toContain(state.pose);
    for (const score of [state.trust, state.tension, state.openness]) {
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  }
}

test('offline checkpoint recovers without loss or duplication', async ({ page, context }) => {
  const input = await enterPremiumWorld(page, REQUIRED_VIEWPORTS[0]);
  await moveAndPersistPosition(page, input, 'ArrowLeft', 120);
  const runtime = monitorRuntimeFailures(page, [{
    kind: 'requestfailed', method: 'PATCH', url: /\/world-state$/,
  }]);
  try {
    await context.setOffline(true);
    await input.moveFor('ArrowRight', 160);
    await expect(page.locator('app-save-status').getByRole('status'))
      .toContainText('Sin conexión', { timeout: 5_000 });

    const acknowledged = page.waitForResponse(response =>
      response.request().method() === 'PATCH'
        && /\/world-state$/.test(new URL(response.url()).pathname)
        && response.ok(),
    );
    await context.setOffline(false);
    await expect(page.locator('app-save-status').getByRole('status'))
      .toContainText('recuperada');
    const saved = (await (await acknowledged).json()).data;
    const resumed = await reloadAndResumeAttempt(page, 'IN_PROGRESS', saved.map.key);

    expect(resumed.world.player).toEqual(saved.player);
    expect(resumed.world.revision).toBe(saved.revision);
    expect(resumed.world.checkpointSnapshot).toEqual(saved.checkpointSnapshot);
    expect(resumed.world.checkpointSnapshot.character).not.toBeNull();
    expect(resumed.world.checkpointSnapshot.evidence)
      .toEqual(saved.checkpointSnapshot.evidence);
    expect(resumed.world.checkpointSnapshot.npcs)
      .toEqual(saved.checkpointSnapshot.npcs);
    assertCompleteRelationalNpcSnapshot(resumed.world.checkpointSnapshot.npcs);
    expect(resumed.world.checkpointSnapshot.clinical)
      .toEqual(saved.checkpointSnapshot.clinical);
    const checkpointStorage = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('siep.checkpoint.v2.')),
    );
    expect(JSON.stringify(checkpointStorage)).not.toMatch(
      /attemptToken|accessToken|refreshToken|password|credential|psychosim_token/i,
    );
    runtime.assertClean();
  } finally {
    runtime.dispose();
  }
});
```

- [ ] **Step 2: Simular 500/timeout sin relajar otros errores**

```typescript
for (const failure of ['500', 'timeout'] as const) {
  test(failure + ' keeps one pending checkpoint', async ({ page }) => {
    let patchCount = 0;
    const runtime = monitorRuntimeFailures(page, [failure === '500'
      ? { kind: 'response', method: 'PATCH', url: /\/world-state$/, status: 500 }
      : { kind: 'requestfailed', method: 'PATCH', url: /\/world-state$/ }]);
    try {
      await page.route('**/world-state', async route => {
        patchCount += 1;
        if (patchCount === 1) {
          if (failure === '500') {
            await route.fulfill({ status: 500, body: '{"detail":"injected"}' });
          } else {
            await new Promise(resolve => setTimeout(resolve, 3_000));
            await route.abort('timedout');
          }
        } else {
          await route.continue();
        }
      });
      const input = await enterPremiumWorld(page, REQUIRED_VIEWPORTS[0]);
      await input.moveFor('ArrowLeft', 160);
      const status = page.locator('app-save-status').getByRole('status');
      await expect(status).toContainText('Sin conexión');
      await expect(status).toContainText('recuperada', { timeout: 8_000 });
      await expect.poll(() => patchCount).toBe(2);
      runtime.assertClean();
    } finally {
      runtime.dispose();
    }
  });
}
```

- [ ] **Step 3: Probar “commit confirmado, respuesta perdida” con el backend real**

`route.fetch()` debe alcanzar el backend y esperar su commit; después
`route.abort()` impide que el navegador reciba la respuesta. El segundo PATCH
tras reload conserva exactamente `idempotencyKey`, `expectedRevision` y body:

```typescript
test('replays the same receipt after the server committed but response was dropped', async ({ page }) => {
  let firstBody: Record<string, unknown> | null = null;
  let replayBody: Record<string, unknown> | null = null;
  let firstAcceptedRevision = -1;
  let dropped = false;
  const runtime = monitorRuntimeFailures(page, [{
    kind: 'requestfailed',
    method: 'PATCH',
    url: /\/world-state$/,
  }]);
  try {
    await page.route('**/world-state', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (!dropped) {
        dropped = true;
        firstBody = body;
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        firstAcceptedRevision =
          ((await committed.json()).data.checkpointReceipt.acceptedRevision);
        await route.abort('failed');
        return;
      }
      replayBody = body;
      const replayed = await route.fetch();
      const data = (await replayed.json()).data;
      expect(data.checkpointReceipt.replayed).toBe(true);
      expect(data.checkpointReceipt.acceptedRevision).toBe(firstAcceptedRevision);
      await route.fulfill({ response: replayed });
    });

    const input = await enterPremiumWorld(page, REQUIRED_VIEWPORTS[0]);
    await input.moveFor('ArrowRight', 180);
    await expect(page.locator('app-save-status').getByRole('status'))
      .toContainText('Sin conexión');
    await reloadAndResumeAttempt(page, 'IN_PROGRESS', /.+/);
    await expect.poll(() => replayBody).not.toBeNull();

    expect(replayBody).toEqual(firstBody);
    runtime.assertClean();
  } finally {
    runtime.dispose();
  }
});
```

Modificar `reloadAndResumeAttempt` para aceptar `string | RegExp` como mapa
esperado sin cambiar el flujo de login/reanudación. El test backend de Task 1
demuestra además que el replay no incrementa la revisión.

Añadir dos variantes que atraviesan la ruta clínica real y pierden la respuesta
del **checkpoint posterior** a la mutación aceptada:

```typescript
for (const clinicalRoute of ['pending-repair', 'repaired'] as const) {
  test(`reload restores the complete ${clinicalRoute} clinical snapshot`,
    async ({ page }) => {
      const input = await enterPremiumWorld(page, REQUIRED_VIEWPORTS[0]);
      let committed: SimulationWorldState | null = null;
      let droppedBody: Record<string, unknown> | null = null;
      let replayBody: Record<string, unknown> | null = null;
      const runtime = monitorRuntimeFailures(page, [{
        kind: 'requestfailed', method: 'PATCH', url: /\/world-state$/,
      }]);
      await page.route('**/world-state', async route => {
        const body = route.request().postDataJSON() as CheckpointRequest;
        const clinical = body.snapshot.clinical;
        const isTarget = clinicalRoute === 'repaired'
          ? clinical.lastConsequence?.repaired === true
          : clinical.pendingRepair !== null;
        if (isTarget && droppedBody === null) {
          droppedBody = body as unknown as Record<string, unknown>;
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          committed = (await response.json()).data;
          await route.abort('failed');
          return;
        }
        if (isTarget && replayBody === null) {
          replayBody = body as unknown as Record<string, unknown>;
        }
        await route.continue();
      });
      try {
        await completeClinicalRoute(page, input, clinicalRoute);
        await expect(page.locator('app-save-status').getByRole('status'))
          .toContainText('Sin conexión');
        const resumed = await reloadAndResumeAttempt(page, 'IN_PROGRESS', /.+/);
        await expect.poll(() => replayBody).not.toBeNull();

        expect(replayBody).toEqual(droppedBody);
        expect(resumed.world.checkpointSnapshot)
          .toEqual(committed!.checkpointSnapshot);
        const snapshot = resumed.world.checkpointSnapshot;
        expect(snapshot.character).not.toBeNull();
        expect(snapshot.evidence).toEqual(committed!.checkpointSnapshot.evidence);
        expect(snapshot.npcs).toEqual(committed!.checkpointSnapshot.npcs);
        assertCompleteRelationalNpcSnapshot(snapshot.npcs);
        expect(snapshot.npcs.states['familia-duelo']).toEqual(
          expect.objectContaining(clinicalRoute === 'repaired'
            ? { trust: 40, tension: 68, openness: 34, available: true }
            : { trust: 24, tension: 88, openness: 20, available: true }),
        );
        expect(snapshot.clinical.decisionRevision)
          .toBe(committed!.checkpointSnapshot.clinical.decisionRevision);
        expect(new Set(snapshot.clinical.decisions.map(
          decision => decision.idempotencyKey,
        )).size).toBe(snapshot.clinical.decisions.length);
        expect(snapshot.clinical.lastConsequence)
          .toEqual(committed!.checkpointSnapshot.clinical.lastConsequence);
        expect(snapshot.clinical.pendingRepair)
          .toEqual(committed!.checkpointSnapshot.clinical.pendingRepair);
        expect(snapshot.clinical.lastConsequence?.repaired)
          .toBe(clinicalRoute === 'repaired');
        runtime.assertClean();
      } finally {
        runtime.dispose();
      }
    });
}
```

Implementar `completeClinicalRoute` en `premium-case-flow.ts` usando únicamente
controles visibles y datos publicados por el caso: selecciona una opción que
genera consecuencia reparable y, para `repaired`, abre la reparación y confirma
su segunda decisión. Espera la respuesta autoritativa de cada decisión antes de
continuar. No usa PKs, no escribe flags y no llama endpoints internos. El
handler distingue el post-checkpoint por `pendingRepair`/`repaired`, por lo que
no confunde el ACK previo a la decisión con el estado ya aceptado.

- [ ] **Step 4: Provocar un 409 real y verificar UX de conflicto**

Usar un `fetch` desde la propia página con su JWT y el token del intento para
adelantar la revisión en backend; no cumplir el test con `route.fulfill(409)`:

```typescript
test('offers an explicit server choice after a real competing revision', async ({ page }) => {
  const input = await enterPremiumWorld(page, REQUIRED_VIEWPORTS[0]);
  await moveAndPersistPosition(page, input, 'ArrowRight', 80);
  let patchCount = 0;
  const countPatch = (request: Request) => {
    if (request.method() === 'PATCH' && /\/world-state$/.test(request.url())) {
      patchCount += 1;
    }
  };
  page.on('request', countPatch);
  const runtime = monitorRuntimeFailures(page, [{
    kind: 'response',
    method: 'PATCH',
    url: /\/world-state$/,
    status: 409,
  }]);
  try {
const competing = await page.evaluate(async () => {
  const auth = localStorage.getItem('psychosim_token');
  const attemptKey = Object.keys(sessionStorage)
    .find(key => key.startsWith('siep_attempt_'));
  const attempt = JSON.parse(sessionStorage.getItem(attemptKey!)!);
  const worldResponse = await fetch(
    `/api/simulation/attempts/${attempt.attemptId}/world`,
    { headers: {
      Authorization: `Bearer ${auth}`,
      'X-SIEP-Attempt-Token': attempt.attemptToken,
    } },
  );
  const world = (await worldResponse.json()).data;
  const response = await fetch(
    `/api/simulation/attempts/${attempt.attemptId}/world-state`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attemptToken: attempt.attemptToken,
        playerX: world.player.x,
        playerY: world.player.y,
        currentMapKey: world.map.key,
        expectedRevision: world.revision,
        idempotencyKey: 'cp:e2e-competing-writer',
        reason: 'periodic',
        snapshot: world.checkpointSnapshot,
      }),
    },
  );
  return { status: response.status, data: (await response.json()).data };
});
expect(competing.status).toBe(200);

await input.moveFor('ArrowLeft', 160);
const saveStatus = page.locator('app-save-status');
await expect(saveStatus.getByRole('status')).toContainText('conflicto');
await expect(saveStatus.getByRole('button', { name: /usar progreso del servidor/i }))
  .toBeVisible();
await saveStatus.getByRole('button', { name: /usar progreso del servidor/i }).click();
await expect(saveStatus.getByRole('status')).toHaveText('');
const countAfterResolution = patchCount;
await page.waitForTimeout(2_000);
expect(patchCount).toBe(countAfterResolution);
runtime.assertClean();
  } finally {
    runtime.dispose();
    page.off('request', countPatch);
  }
});
```

El monitor permite exactamente un `PATCH 409` y falla cualquier otro 4xx/5xx.
Comprobar que después de elegir servidor no aparece otro PATCH automático.

- [ ] **Step 5: Unificar el monitor con API `{ assertClean, dispose }`**

No redeclarar `monitorRuntimeFailures`: el plan vivo de caso/NPC ya es dueño de
la función, de `ExpectedRuntimeFailure` y de `RuntimeFailureMonitor`, incluida
la API estable `{ assertClean, dispose }`. Extender solo el tipo de allowance y
la creación de su lista `pending` para poder expresar una cardinalidad exacta:

```typescript
export interface ExpectedRuntimeFailure {
  // conservar kind, method, url y status existentes
  kind: 'response' | 'requestfailed';
  method: string;
  url: RegExp;
  status?: number;
  times?: number;
}

// Dentro de la función existente; todo lo demás queda intacto.
const pending = allowed.flatMap(item => {
  const times = item.times ?? 1;
  if (!Number.isInteger(times) || times < 1 || times > 20) {
    throw new Error('ExpectedRuntimeFailure.times must be 1..20');
  }
  return Array.from({ length: times }, () => ({ ...item, times: undefined }));
});
```

Modificar el spec existente, no crear uno paralelo. Conservar sus casos de
errores inesperados y `dispose()`; añadir casos `times: 2` que consumen dos
fallos exactos, fallan si aparece solo uno y fallan si aparece un tercero. Las
allowances de esta tarea se pasan al monitor existente; cualquier otro console
error, pageerror, 4xx/5xx o requestfailed sigue fallando. Ningún archivo premium
redefine listeners ni cambia el contrato de retorno.

- [ ] **Step 6: Ejecutar tests**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath e2e/support/quality-gates.spec.ts`

Run: `npm run test:e2e -- premium-recovery.e2e.ts --project=chromium --retries=0`

Expected: `premium-recovery.e2e.ts` ejecuta **7/7 casos PASS**: offline, 500,
timeout, respuesta perdida simple, recovery clínico pending-repair, recovery
clínico repaired y 409 real. Ambos casos clínicos comparan el snapshot entero y
los cuatro estados relacionales; pending-repair conserva 24/88/20 y repaired
40/68/34 para `familia-duelo`, sin duplicar decisión, consecuencia ni delta. El spec del monitor PASS y no deja listeners
entre tests.

- [ ] **Step 7: Commit**

```powershell
git add frontend/e2e/premium-recovery.e2e.ts frontend/e2e/support/quality-gates.ts frontend/e2e/support/quality-gates.spec.ts frontend/e2e/support/premium-case-flow.ts frontend/e2e/support/siep-flow.ts
git commit -m "test(e2e): verify checkpoint recovery"
```

### Task 8: Extender el seam E2E existente con métricas de rendimiento

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Create: `frontend/src/app/features/simulator/runtime/e2e-performance-hook.ts`
- Create: `frontend/src/app/features/simulator/runtime/e2e-performance-hook.spec.ts`
- Create: `scripts/verify-production-instrumentation.mjs`
- Create: `scripts/verify-production-instrumentation.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Verificar el seam heredado antes de extenderlo**

El plan de audio ya crea `environment.ts`, `environment.e2e.ts`, las
configuraciones Angular `build:e2e`/`serve:e2e` y hace que
`buildAngularCommand()` pase `--configuration e2e`. Confirmar ese contrato sin
editarlo en esta tarea:

Run:

```powershell
$normal = Get-Content frontend/src/environments/environment.ts -Raw
$e2e = Get-Content frontend/src/environments/environment.e2e.ts -Raw
$angular = Get-Content frontend/angular.json -Raw | ConvertFrom-Json
if ($normal -notmatch 'e2eDiagnostics\s*:\s*false') { throw 'Normal environment must disable E2E diagnostics' }
if ($e2e -notmatch 'e2eDiagnostics\s*:\s*true') { throw 'E2E environment must enable diagnostics' }
if (-not $angular.projects.'psychosim-admin-panel'.architect.build.configurations.e2e) { throw 'Missing build:e2e' }
if (-not $angular.projects.'psychosim-admin-panel'.architect.serve.configurations.e2e) { throw 'Missing serve:e2e' }
npm run test:scripts
```

Expected: PASS; el test de `buildAngularCommand` del plan de audio confirma
`--configuration e2e`. Si falta este seam, detener la tarea y completar primero
el plan de audio; no crear una segunda configuración aquí.

- [ ] **Step 2: Escribir tests rojos del hook nuevo y del bundle**

Crear `e2e-performance-hook.spec.ts`: con `enabled=true`, el callback devuelve el
snapshot actual; al ejecutar el disposer, el callback desaparece y
`__SIEP_PERF_LAST__` conserva el snapshot final. Con `enabled=false`, el target
permanece sin ambas propiedades. El helper recibe un objeto target in-memory, no
ensucia `window` durante Jest.

En `verify-production-instrumentation.test.mjs`, crear tres directorios
temporales: uno con JS limpio, uno con `window.__SIEP_PERF__` y uno sin JS.
`verifyBundle(clean)` devuelve `[]`, `verifyBundle(instrumented)` identifica el
archivo/marker y el directorio vacío devuelve `['no JavaScript bundles found']`.

- [ ] **Step 3: Ejecutar y confirmar el fallo**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/runtime/e2e-performance-hook.spec.ts`

Run: `node --test scripts/verify-production-instrumentation.test.mjs`

Expected: FAIL porque el hook de rendimiento y el verificador aún no existen.

- [ ] **Step 4: Guardar hooks únicamente bajo `environment.e2eDiagnostics`**

Importar `environment` desde `../../../environments/environment` en
`game-world.component.ts`. Crear primero el helper puro:

```typescript
// runtime/e2e-performance-hook.ts
export interface E2ePerformanceTarget {
  __SIEP_PERF__?: () => unknown;
  __SIEP_PERF_LAST__?: unknown;
}

export function attachE2ePerformanceHook(
  enabled: boolean,
  target: E2ePerformanceTarget,
  snapshot: () => unknown,
): () => void {
  if (!enabled) return () => undefined;
  target.__SIEP_PERF_LAST__ = undefined;
  target.__SIEP_PERF__ = snapshot;
  return () => {
    target.__SIEP_PERF_LAST__ = snapshot();
    delete target.__SIEP_PERF__;
  };
}
```

Crear/eliminar el hook desde el lifecycle del componente solo dentro del branch
E2E, para que el optimizer pueda eliminar también el import del helper:

```typescript
import { environment } from '../../../environments/environment';
import { attachE2ePerformanceHook } from './runtime/e2e-performance-hook';

private disposeE2ePerformanceHook: () => void = () => undefined;

private installE2ePerformanceHook(): void {
  if (!environment.e2eDiagnostics) return;
  this.disposeE2ePerformanceHook = attachE2ePerformanceHook(
    true,
    window,
    () => this.frameMetrics.snapshot(),
  );
}

private removeE2ePerformanceHook(): void {
  if (!environment.e2eDiagnostics) return;
  this.disposeE2ePerformanceHook();
  this.disposeE2ePerformanceHook = () => undefined;
}
```

Importar el `environment` ya creado por audio; no modificar sus archivos ni
`angular.json`. El hook `__SIEP_AUDIO_DEBUG__` ya usa el mismo guard. Ningún hook
lee `process.env` desde el navegador.

- [ ] **Step 5: Implementar scan recursivo del bundle production**

```javascript
// scripts/verify-production-instrumentation.mjs
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKERS = ['__SIEP_PERF__', '__SIEP_AUDIO_DEBUG__'];

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(full) : [full];
  });
}

export function verifyBundle(directory) {
  const files = filesBelow(directory).filter(file => file.endsWith('.js'));
  if (files.length === 0) return ['no JavaScript bundles found'];
  return files.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    return MARKERS
      .filter(marker => source.includes(marker))
      .map(marker => `${path.relative(directory, file)} contains ${marker}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = verifyBundle(path.resolve(process.argv[2]));
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
```

Añadir:

```json
"verify:production-instrumentation": "node scripts/verify-production-instrumentation.mjs frontend/dist/psychosim-admin-panel/browser"
```

- [ ] **Step 6: Ejecutar tests y dos builds**

Run: `npm run test:scripts`

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/runtime/e2e-performance-hook.spec.ts`

Run: `npm run build:frontend`

Run: `npm run verify:production-instrumentation`

Run: `npm run build --prefix frontend -- --configuration e2e`

Expected: tests PASS; production contiene cero hooks; build E2E compila con los
hooks disponibles.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/runtime/e2e-performance-hook.ts frontend/src/app/features/simulator/runtime/e2e-performance-hook.spec.ts scripts/verify-production-instrumentation.mjs scripts/verify-production-instrumentation.test.mjs package.json
git commit -m "test(e2e): isolate simulator instrumentation"
```

### Task 9: Instrumentar y bloquear regresiones de frame time

**Files:**
- Create: `frontend/src/app/features/simulator/runtime/frame-metrics.ts`
- Create: `frontend/src/app/features/simulator/runtime/frame-metrics.spec.ts`
- Modify: `frontend/src/app/features/simulator/game-world.component.ts`
- Create: `scripts/verify-premium-performance.mjs`
- Create: `scripts/verify-premium-performance.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Escribir tests rojos de percentiles**

```typescript
import { FrameMetrics } from './frame-metrics';

it('reports median, p95 and slow-frame ratio', () => {
  const metrics = new FrameMetrics(10);
  [16, 16, 17, 18, 20, 22, 25, 30, 34, 40].forEach(ms => metrics.push(ms));
  expect(metrics.snapshot()).toEqual({
    samples: 10,
    retainedSamples: 10,
    droppedSamples: 0,
    medianFps: 50,
    p95FrameMs: 40,
    under33Ratio: 0.8,
    longestFrameMs: 40,
    longestSub50RunMs: 151,
  });
});

it('returns finite zeroes before the first frame', () => {
  expect(new FrameMetrics().snapshot()).toEqual({
    samples: 0,
    retainedSamples: 0,
    droppedSamples: 0,
    medianFps: 0,
    p95FrameMs: 0,
    under33Ratio: 0,
    longestFrameMs: 0,
    longestSub50RunMs: 0,
  });
});

it('uses an O(1) circular write and reports overwritten samples', () => {
  const metrics = new FrameMetrics(3);
  [10, 20, 30, 40].forEach(ms => metrics.push(ms));
  expect(metrics.snapshot()).toEqual(expect.objectContaining({
    samples: 4,
    retainedSamples: 3,
    droppedSamples: 1,
    longestFrameMs: 40,
  }));
});
```

- [ ] **Step 2: Implementar ring buffer**

```typescript
export interface FrameMetricSnapshot {
  samples: number;
  retainedSamples: number;
  droppedSamples: number;
  medianFps: number;
  p95FrameMs: number;
  under33Ratio: number;
  longestFrameMs: number;
  longestSub50RunMs: number;
}

export class FrameMetrics {
  private readonly values: Float64Array;
  private writeIndex = 0;
  private retainedSamples = 0;
  private totalSamples = 0;
  private under33Samples = 0;
  private currentSub50RunMs = 0;
  private longestSub50RunMs = 0;
  private longestFrameMs = 0;

  constructor(private readonly capacity = 150_000) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('FrameMetrics capacity must be a positive integer');
    }
    this.values = new Float64Array(capacity);
  }

  push(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.values[this.writeIndex] = deltaMs;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.retainedSamples = Math.min(this.retainedSamples + 1, this.capacity);
    this.totalSamples += 1;
    if (deltaMs < 33.3) this.under33Samples += 1;
    this.longestFrameMs = Math.max(this.longestFrameMs, deltaMs);
    if (deltaMs > 20) {
      this.currentSub50RunMs += deltaMs;
      this.longestSub50RunMs = Math.max(
        this.longestSub50RunMs,
        this.currentSub50RunMs,
      );
    } else {
      this.currentSub50RunMs = 0;
    }
  }

  snapshot(): FrameMetricSnapshot {
    const sorted = Array.from(
      this.values.subarray(0, this.retainedSamples),
    ).sort((a, b) => a - b);
    if (sorted.length === 0) {
      return {
        samples: 0,
        retainedSamples: 0,
        droppedSamples: 0,
        medianFps: 0,
        p95FrameMs: 0,
        under33Ratio: 0,
        longestFrameMs: 0,
        longestSub50RunMs: 0,
      };
    }
    const percentile = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
    const median = percentile(.5);
    return {
      samples: this.totalSamples,
      retainedSamples: this.retainedSamples,
      droppedSamples: this.totalSamples - this.retainedSamples,
      medianFps: Number((1000 / median).toFixed(2)),
      p95FrameMs: percentile(.95),
      under33Ratio: Number((this.under33Samples / this.totalSamples).toFixed(4)),
      longestFrameMs: Number(this.longestFrameMs.toFixed(2)),
      longestSub50RunMs: Number(this.longestSub50RunMs.toFixed(2)),
    };
  }
}
```

`push()` no usa `Array.shift`, `splice` ni ordenamiento. El único sort ocurre al
pedir un snapshot. El gate de soak exige `droppedSamples === 0`; 150.000 slots
cubren veinte minutos a 120 Hz con margen.

- [ ] **Step 3: Conectar al loop**

Crear una instancia por `GameWorldComponent` —no por sala— y llamar
`frameMetrics.push(delta)` al principio del callback `update`. Usar exactamente
`installE2ePerformanceHook()` y `removeE2ePerformanceHook()` de Task 8; al
destruir, copiar primero el snapshot a `__SIEP_PERF_LAST__` y eliminar el
callback.

- [ ] **Step 4: Crear gate Node**

```javascript
// scripts/verify-premium-performance.mjs
import { readFileSync } from 'node:fs';

export function verify(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return ['metrics must be an object'];
  }
  const failures = [];
  const numericFields = [
    'samples',
    'retainedSamples',
    'droppedSamples',
    'medianFps',
    'p95FrameMs',
    'under33Ratio',
    'longestFrameMs',
    'longestSub50RunMs',
  ];
  for (const field of numericFields) {
    if (typeof metrics[field] !== 'number' || !Number.isFinite(metrics[field])) {
      failures.push(`${field} must be a finite number`);
    }
  }
  if (!Number.isInteger(metrics.samples) || metrics.samples < 1) {
    failures.push('samples must be a positive integer');
  }
  if (!Number.isInteger(metrics.retainedSamples) || metrics.retainedSamples < 0) {
    failures.push('retainedSamples must be a non-negative integer');
  }
  if (!Number.isInteger(metrics.droppedSamples) || metrics.droppedSamples < 0) {
    failures.push('droppedSamples must be a non-negative integer');
  }
  if (
    Number.isInteger(metrics.samples)
    && Number.isInteger(metrics.retainedSamples)
    && Number.isInteger(metrics.droppedSamples)
    && metrics.retainedSamples + metrics.droppedSamples !== metrics.samples
  ) failures.push('sample accounting mismatch');
  if (metrics.retainedSamples !== metrics.samples) {
    failures.push('frame buffer dropped samples');
  }
  if (metrics.droppedSamples !== 0) failures.push('droppedSamples != 0');
  if (metrics.under33Ratio < 0 || metrics.under33Ratio > 1) {
    failures.push('under33Ratio outside [0,1]');
  }
  if (metrics.medianFps < 59) failures.push('medianFps < 59');
  if (metrics.p95FrameMs > 20) failures.push('p95FrameMs > 20');
  if (metrics.under33Ratio < 0.99) failures.push('under33Ratio < 0.99');
  if (metrics.longestFrameMs > 100) failures.push('longestFrameMs > 100');
  if (metrics.longestSub50RunMs > 1000) failures.push('longestSub50RunMs > 1000');
  return failures;
}

if (process.argv[1]?.endsWith('verify-premium-performance.mjs')) {
  const metrics = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const failures = verify(metrics);
  if (failures.length) {
    console.error(failures.join('\\n'));
    process.exitCode = 1;
  }
}
```

`scripts/verify-premium-performance.test.mjs` debe contener casos completos para
un objeto válido y para cada frontera:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { verify } from './verify-premium-performance.mjs';

const VALID = {
  samples: 72_000,
  retainedSamples: 72_000,
  droppedSamples: 0,
  medianFps: 60,
  p95FrameMs: 19.9,
  under33Ratio: 0.995,
  longestFrameMs: 99,
  longestSub50RunMs: 999,
};

test('accepts the complete valid frame contract', () => {
  assert.deepEqual(verify(VALID), []);
});

test('rejects missing and non-finite numeric fields', () => {
  assert.ok(verify({ ...VALID, p95FrameMs: undefined })
    .includes('p95FrameMs must be a finite number'));
  assert.ok(verify({ ...VALID, medianFps: Number.NaN })
    .includes('medianFps must be a finite number'));
});

for (const [field, value, message] of [
  ['samples', 0, 'samples must be a positive integer'],
  ['retainedSamples', 71_999, 'frame buffer dropped samples'],
  ['droppedSamples', 1, 'droppedSamples != 0'],
  ['medianFps', 58.99, 'medianFps < 59'],
  ['p95FrameMs', 20.01, 'p95FrameMs > 20'],
  ['under33Ratio', .9899, 'under33Ratio < 0.99'],
  ['longestFrameMs', 100.01, 'longestFrameMs > 100'],
  ['longestSub50RunMs', 1000.01, 'longestSub50RunMs > 1000'],
]) {
  test(`rejects ${field}`, () => {
    assert.ok(verify({ ...VALID, [field]: value }).includes(message));
  });
}
```

Añadir `"test:performance": "node --test scripts/verify-premium-performance.test.mjs"` a `package.json`.

- [ ] **Step 5: Ejecutar unit tests**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath src/app/features/simulator/runtime/frame-metrics.spec.ts`

Run: `npm run test:performance`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/features/simulator/runtime/frame-metrics.ts frontend/src/app/features/simulator/runtime/frame-metrics.spec.ts frontend/src/app/features/simulator/game-world.component.ts scripts/verify-premium-performance.mjs scripts/verify-premium-performance.test.mjs package.json
git commit -m "test(perf): enforce premium frame budgets"
```

### Task 10: Capturar soak, accesibilidad completa y HAR redactado

**Files:**
- Create: `frontend/e2e/accessibility-waivers.json`
- Modify: `frontend/e2e/support/quality-gates.ts`
- Modify: `frontend/e2e/support/quality-gates.spec.ts`
- Create: `frontend/e2e/support/premium-evidence-test.ts`
- Create: `frontend/e2e/support/premium-evidence-test.spec.ts`
- Create: `frontend/e2e/support/persist-test-artifact.ts`
- Create: `frontend/e2e/support/persist-test-artifact.spec.ts`
- Create: `frontend/e2e/support/premium-soak-flow.ts`
- Create: `frontend/e2e/premium-performance.e2e.ts`
- Create: `frontend/e2e/reference-hardware-profiles.json`
- Create: `frontend/e2e/support/reference-hardware-attestation.ts`
- Create: `frontend/e2e/support/reference-hardware-attestation.spec.ts`
- Create: `scripts/capture-reference-hardware.ps1`
- Create: `scripts/verify-reference-performance.mjs`
- Create: `scripts/verify-reference-performance.test.mjs`
- Modify: `scripts/verify-premium-performance.mjs`
- Modify: `scripts/verify-premium-performance.test.mjs`

- [ ] **Step 1: Persistir evidencia física y bloquear toda violación WCAG A/AA salvo waiver revisado**

Crear primero `persist-test-artifact.ts`. `testInfo.attach({ body })` por sí solo
no crea un archivo recorrible bajo el output de Playwright; todo gate posterior
usa este helper para escribir bytes físicos antes de adjuntarlos al reporter:

```typescript
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import type { TestInfo } from '@playwright/test';

const SAFE_ARTIFACT_NAME = /^[a-z0-9][a-z0-9._-]{0,119}$/;

export async function persistTestArtifact(
  testInfo: TestInfo,
  name: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (!SAFE_ARTIFACT_NAME.test(name) || name.includes('..')) {
    throw new Error(`Unsafe evidence artifact name: ${name}`);
  }
  const outputPath = testInfo.outputPath(name);
  writeFileSync(outputPath, body, { flag: 'wx' });
  await testInfo.attach(name, { body, contentType });
  return outputPath;
}

export async function persistJsonArtifact(
  testInfo: TestInfo,
  name: string,
  value: unknown,
): Promise<string> {
  return persistTestArtifact(
    testInfo,
    name,
    Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    'application/json',
  );
}
```

No usar `{ path }` después de escribir el original: Playwright copiaría otra
versión hashed bajo `attachments/` y rompería cardinalidades. La spec usa un
directorio temporal y un `TestInfo` mínimo para probar bytes exactos en disco,
attach con `body` solo para reporter, `flag:'wx'`, rechazo de traversal/nombre
duplicado y ausencia de un segundo archivo.

Crear:

```json
{
  "schemaVersion": 1,
  "waivers": []
}
```

Reemplazar el filtro por impacto de `quality-gates.ts`. Axe conserva tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, pero cada violación resultante
bloquea aunque su impacto sea `minor`, `moderate`, `serious`, `critical` o
`null`. Importar `persistJsonArtifact` desde `./persist-test-artifact` y persistir
siempre el resultado completo:

```typescript
await persistJsonArtifact(testInfo, `${stateLabel}-axe-complete.json`, results);
const unwaived = unwaivedViolations(results.violations, ACCESSIBILITY_WAIVERS);
expect(unwaived, formatAxeViolations(stateLabel, unwaived)).toEqual([]);
```

Un waiver válido exige `ruleId`, `target`, `reason`, `reviewer`, `reviewedAt`,
`expiresAt` y `evidenceUrl`; `expiresAt` debe ser posterior al día del run y
`reviewer` no puede ser `pending`, `unknown` ni un string vacío. El match cubre
solo el nodo cuyo `violation.id` y `node.target.join(' ')` coinciden exactamente.
`quality-gates.spec.ts` prueba que una violación `moderate` falla, que un waiver
vencido falla y que un waiver completo cubre solo su nodo. NVDA continúa como
gate humano separado; nunca se deriva de Axe.

- [ ] **Step 2: Crear fixture HAR con redacción estructural completa**

Crear primero `frontend/e2e/support/premium-evidence-test.ts`. El fixture conserva
video incluso al pasar, genera un HAR por test, omite cuerpos de respuesta
y redacta credenciales/tokens del HAR después de cerrar el contexto:

```typescript
import { expect, test as base } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const SENSITIVE_NAME =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|token|attemptToken|accessToken|refreshToken|credential)$/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi;

function activeSecrets(): string[] {
  return [
    process.env.E2E_STUDENT_EMAIL,
    process.env.E2E_STUDENT_PASSWORD,
    process.env.E2E_ATTEMPT_TOKEN,
    process.env.E2E_ACCESS_TOKEN,
    process.env.E2E_REFRESH_TOKEN,
  ].filter((value): value is string => typeof value === 'string' && value.length >= 4);
}

function redactText(value: string, secrets: readonly string[]): string {
  let redacted = value
    .replace(BEARER, 'Bearer <redacted>')
    .replace(JWT, '<redacted-jwt>');
  for (const secret of secrets) {
    redacted = redacted.split(secret).join('<redacted>');
    redacted = redacted
      .split(encodeURIComponent(secret))
      .join(encodeURIComponent('<redacted>'));
  }
  return redacted;
}

function redactObject(value: unknown, secrets: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map(item => redactObject(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_NAME.test(key)
        ? '<redacted>'
        : redactObject(item, secrets),
    ]));
  }
  return typeof value === 'string' ? redactText(value, secrets) : value;
}

function redactNameValue(
  values: Array<{ name: string; value: string }> | undefined,
  secrets: readonly string[],
  redactEveryValue = false,
): void {
  for (const item of values ?? []) {
    item.value = redactEveryValue || SENSITIVE_NAME.test(item.name)
      ? '<redacted>'
      : redactText(item.value, secrets);
  }
}

export function redactHar(path: string, secrets = activeSecrets()): void {
  const har = JSON.parse(readFileSync(path, 'utf8'));
  for (const entry of har.log?.entries ?? []) {
    const url = new URL(entry.request.url);
    for (const key of Array.from(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      url.searchParams.delete(key);
      values.forEach(value => url.searchParams.append(
        key,
        SENSITIVE_NAME.test(key) ? '<redacted>' : redactText(value, secrets),
      ));
    }
    entry.request.url = redactText(url.toString(), secrets);
    redactNameValue(entry.request.queryString, secrets);
    redactNameValue(entry.request.headers, secrets);
    redactNameValue(entry.response.headers, secrets);
    redactNameValue(entry.request.cookies, secrets, true);
    redactNameValue(entry.response.cookies, secrets, true);

    const post = entry.request.postData;
    redactNameValue(post?.params, secrets);
    if (typeof post?.text === 'string') {
      try {
        post.text = JSON.stringify(
          redactObject(JSON.parse(post.text), secrets),
        );
      } catch {
        post.text = redactText(post.text, secrets);
      }
    }
  }
  writeFileSync(path, JSON.stringify(har, null, 2));
}

export const test = base.extend({
  context: async ({ browser, contextOptions }, use, testInfo) => {
    const harPath = testInfo.outputPath('network.redacted.har');
    const context = await browser.newContext({
      ...contextOptions,
      recordHar: { path: harPath, content: 'omit', mode: 'minimal' },
      recordVideo: {
        dir: testInfo.outputPath('video'),
        size: contextOptions.viewport ?? { width: 1366, height: 768 },
      },
    });
    try {
      await use(context);
    } finally {
      await context.close();
      redactHar(harPath);
    }
  },
});

export { expect };
```

`premium-evidence-test.spec.ts` construye un HAR con:

- token en URL y `queryString[]`;
- `Authorization: Bearer ...`, JWT sin prefijo y cookies request/response;
- contraseña/token dentro de JSON anidado;
- `postData.params`;
- email y contraseña exactos en un header no sensible y texto libre.

Después de `redactHar`, ninguna cadena activa, JWT ni Bearer sobrevive; los
campos no sensibles se conservan. El test también verifica que `recordHar`
mantiene `content:'omit'`.

- [ ] **Step 3: Autorizar la secuencia real de beats del soak**

Crear `premium-soak-flow.ts` reutilizando helpers reales de `siep-flow.ts`:

```typescript
import { expect, Page } from '@playwright/test';
import {
  enterDoor,
  interactNearby,
  useToolChoice,
  WorldInputDriver,
} from './siep-flow';

export type SoakBeat =
  | 'movement' | 'dialogue' | 'hud' | 'audio' | 'room-change';

export async function exerciseRequiredSoakBeats(
  page: Page,
  input: WorldInputDriver,
  mark: (kind: SoakBeat) => void,
): Promise<void> {
  mark('movement');
  await input.moveFor('ArrowLeft', 450);
  await input.moveFor('ArrowRight', 450);

  await input.moveUntilNearby('ArrowLeft', /kit pap/i);
  await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
  await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
  mark('dialogue');
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
  await useToolChoice(
    page,
    /abuela de la niña/i,
    /aplicar pap a la familia en crisis/i,
  );

  mark('hud');
  await page.keyboard.press('j');
  await expect(page.locator('app-journal-panel')).toBeVisible();
  await page.keyboard.press('Escape');

  mark('audio');
  const music = page.getByRole('slider', { name: /volumen de música/i });
  await music.fill('0.35');
  await expect(music).toHaveValue('0.35');
  await music.fill('0.42');

  await input.moveUntilNearby('ArrowRight', /sala de escucha familiar/i);
  mark('room-change');
  await enterDoor(
    page,
    /sala de escucha familiar/i,
    'hospital-sala-escucha',
  );
}
```

El orden exigido es exactamente
`movement → dialogue → hud → audio → room-change`. Si cambia el seed, se cambia
el helper y su regresión en el mismo commit; no se marca un beat sin observar
su UI o respuesta real.

- [ ] **Step 4: Extender el verificador con el contrato de soak**

Añadir a `verify-premium-performance.mjs`:

```javascript
export const REQUIRED_SOAK_BEATS = [
  'movement', 'dialogue', 'hud', 'audio', 'room-change',
];

export function verifySoak(evidence) {
  const failures = verify(evidence);
  if (evidence?.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  const started = Date.parse(evidence.startedAt);
  const ended = Date.parse(evidence.endedAt);
  if (!Number.isFinite(started)) failures.push('startedAt is invalid');
  if (!Number.isFinite(ended)) failures.push('endedAt is invalid');
  if (!Number.isFinite(evidence.elapsedMs)) failures.push('elapsedMs is invalid');
  else if (evidence.elapsedMs < 1_200_000) failures.push('elapsedMs < 1200000');
  if (ended - started < 1_200_000) failures.push('wall clock duration < 1200000');
  if (
    Number.isFinite(started)
    && Number.isFinite(ended)
    && Number.isFinite(evidence.elapsedMs)
    && Math.abs((ended - started) - evidence.elapsedMs) > 5_000
  ) failures.push('elapsedMs differs from wall clock duration');
  if (evidence.samples < 60_000) failures.push('samples < 60000');
  const routeSequence = Array.isArray(evidence.routeSequence)
    ? evidence.routeSequence
    : [];
  const sequence = routeSequence.map(item => item?.kind);
  if (JSON.stringify(sequence) !== JSON.stringify(REQUIRED_SOAK_BEATS)) {
    failures.push('routeSequence is not the required ordered beat sequence');
  }
  let previousAt = -1;
  for (const item of routeSequence) {
    if (
      !Number.isFinite(item?.atMs)
      || item.atMs < 0
      || item.atMs < previousAt
      || item.atMs > evidence.elapsedMs
    ) failures.push('routeSequence timestamps are invalid');
    previousAt = item?.atMs;
  }
  if (!Number.isFinite(evidence.loadToControlMs)) {
    failures.push('loadToControlMs is invalid');
  } else if (evidence.loadToControlMs > 5_000) {
    failures.push('loadToControlMs > 5000');
  }
  return [...new Set(failures)];
}
```

Reemplazar en el branch CLI de `verify-premium-performance.mjs`
`const failures = verify(metrics)` por `const failures = verifySoak(metrics)`.
Añadir tests para fechas ausentes,
`elapsedMs=1_199_999`, menos de 60.000 samples, cada beat ausente/desordenado,
timestamp de beat negativo/desordenado/fuera del intervalo, buffer truncado y
objeto válido de 1.200.000 ms.

- [ ] **Step 5: Ejecutar la captura sostenida de veinte minutos**

Crear primero `frontend/e2e/support/reference-hardware-attestation.ts` con la
función exportada `captureReferenceHardwareBinding(page, testInfo)` descrita en
Step 6; su spec queda roja hasta completar allí perfil/captura y casos
fail-closed. Crear después `frontend/e2e/premium-performance.e2e.ts`:

```typescript
import { expect, test } from './support/premium-evidence-test';

import { enterPremiumWorld } from './support/premium-case-flow';
import { persistJsonArtifact } from './support/persist-test-artifact';
import { monitorRuntimeFailures } from './support/quality-gates';
import { PREMIUM_DESKTOP_VIEWPORTS } from './support/required-viewports';
import {
  exerciseRequiredSoakBeats,
  SoakBeat,
} from './support/premium-soak-flow';
import { captureReferenceHardwareBinding } from './support/reference-hardware-attestation';

const SOAK_MS = 20 * 60 * 1000;
const viewport = PREMIUM_DESKTOP_VIEWPORTS[1];

test.use({ viewport: { width: viewport.width, height: viewport.height } });

test('captures twenty continuous minutes at the laptop target', async ({ page }, testInfo) => {
  testInfo.setTimeout(SOAK_MS + 120_000);
  const runtime = monitorRuntimeFailures(page);
  const routeSequence: Array<{ kind: SoakBeat; atMs: number }> = [];
  try {
    const input = await enterPremiumWorld(page, viewport);
    const loadToControlMs = await page.evaluate(() =>
      performance.getEntriesByName('siep-control-load').at(-1)?.duration ?? Infinity);
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    await exerciseRequiredSoakBeats(page, input, kind => {
      routeSequence.push({ kind, atMs: Date.now() - startedAtMs });
    });

    const directions = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'] as const;
    const deadline = startedAtMs + SOAK_MS;
    let step = 0;
    while (Date.now() < deadline) {
      await input.moveFor(directions[step % directions.length], 900);
      step += 1;
    }

    const metrics = await page.evaluate(() => {
      const perfWindow = window as Window & { __SIEP_PERF__?: () => unknown };
      return perfWindow.__SIEP_PERF__?.();
    }) as Record<string, number>;
    const hardwareBinding = await captureReferenceHardwareBinding(page, testInfo);
    const endedAtMs = Date.now();
    const evidence = {
      schemaVersion: 1,
      startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      elapsedMs: endedAtMs - startedAtMs,
      routeSequence,
      loadToControlMs,
      ...hardwareBinding,
      ...metrics,
    };
    await persistJsonArtifact(testInfo, 'premium-performance.json', evidence);

    expect(evidence.elapsedMs).toBeGreaterThanOrEqual(SOAK_MS);
    expect(routeSequence.map(item => item.kind)).toEqual([
      'movement', 'dialogue', 'hud', 'audio', 'room-change',
    ]);
    expect(loadToControlMs).toBeLessThanOrEqual(5_000);
    expect(metrics.samples).toBeGreaterThanOrEqual(60_000);
    expect(metrics.retainedSamples).toBe(metrics.samples);
    expect(metrics.droppedSamples).toBe(0);
    expect(metrics.medianFps).toBeGreaterThanOrEqual(59);
    expect(metrics.p95FrameMs).toBeLessThanOrEqual(20);
    expect(metrics.under33Ratio).toBeGreaterThanOrEqual(0.99);
    expect(metrics.longestFrameMs).toBeLessThanOrEqual(100);
    expect(metrics.longestSub50RunMs).toBeLessThanOrEqual(1_000);
    runtime.assertClean();
  } finally {
    runtime.dispose();
  }
});
```

Run: `npm run test:e2e -- premium-performance.e2e.ts --project=chromium --retries=0`

Expected: 1/1 PASS después de al menos veinte minutos reales; no reducir
`SOAK_MS` ni ejecutar con tiempo simulado para aceptar el corte. En ejecución
aislada sin attestation, el archivo queda marcado `diagnostic-unattested` y no
puede promoverse; dentro del runner final, ausencia o mismatch de la attestation
es un fallo del propio E2E.

- [ ] **Step 6: Atar el soak a hardware físico de referencia comprobable**

Crear `reference-hardware-profiles.json` con un único perfil inicial
`win-chromium-uhd620-4c-8g-v1`. Su contrato exige Windows 10 u 11, el major de
Chromium actualmente incluido por Playwright en el lockfile, exactamente cuatro
núcleos físicos, entre 7.5 y 9.0 GiB de RAM instalada y un adaptador integrado
Intel UHD 620. Un adaptador que se considere equivalente requiere otro perfil
versionado y revisión explícita; el validador nunca lo infiere por parecido de
nombre, memoria compartida ni FPS observados.

`capture-reference-hardware.ps1` usa CIM para escribir JSON con
`schemaVersion`, `profileId`, `commit`, `runId`, `capturedAt`, caption/versión de
Windows, modelo de CPU, núcleos físicos/lógicos, memoria total y adaptadores de
vídeo. Omite deliberadamente hostname, dominio, nombre de usuario, seriales,
direcciones y PNP device IDs. El script rechaza working tree sucio, `runId`
vacío y una ruta fuera de `.superpowers/evidence/<HEAD>/<runId>/`.

`reference-hardware-attestation.ts` adjunta al soak dos objetos separados:

```typescript
export interface ReferenceHardwareAttestationV1 {
  readonly schemaVersion: 1;
  readonly profileId: 'win-chromium-uhd620-4c-8g-v1';
  readonly commit: string;
  readonly runId: string;
  readonly capturedAt: string;
  readonly os: { readonly caption: string; readonly version: string };
  readonly cpu: {
    readonly model: string;
    readonly physicalCores: 4;
    readonly logicalCores: number;
  };
  readonly totalMemoryBytes: number;
  readonly displayAdapters: readonly { readonly name: string }[];
}

export interface SoakRuntimeIdentityV1 {
  readonly commit: string;
  readonly runId: string;
  readonly browserName: 'chromium';
  readonly browserMajor: number;
  readonly playwrightVersion: string;
  readonly viewport: { readonly width: 1366; readonly height: 768 };
  readonly webglGpu: string;
}
```

No mezclar estos objetos con los dos `runtime-identity` generales de 1600×900 y
1366×768. `premium-performance.json` referencia por SHA-256 la attestation
física y contiene `soakRuntimeIdentity`; ambos declaran el mismo `commit` y
`runId` que el manifiesto.

Implementar `captureReferenceHardwareBinding(page, testInfo)` en el helper que
ya importa el E2E de Step 5. Lee bytes únicamente desde la ruta indicada por
`PREMIUM_REFERENCE_HARDWARE_ATTESTATION`, calcula su SHA-256 con `node:crypto`,
valida `PREMIUM_EXPECTED_HEAD` y `PREMIUM_EXPECTED_RUN_ID`, toma
`browser.version()`/major y la versión instalada de `@playwright/test`, y obtiene
el renderer WebGL real desde la página. Devuelve exactamente
`referenceHardwareSha256`, `referenceHardwareStatus` y `soakRuntimeIdentity`.
Cuando `PREMIUM_EXPECTED_HEAD` está presente, ruta/hash/HEAD/run son obligatorios
y cualquier ausencia lanza; solo un comando focalizado sin esas variables puede
devolver `referenceHardwareSha256:null` y `diagnostic-unattested`. La prueba del
helper cubre ambos modos y garantiza que jamás copie el objeto CIM dentro del
soak.

Crear `verify-reference-performance.mjs` como validador read-only. Debe fallar
cerrado salvo que perfil, captura CIM, attestation, soak, manifest y checkout
coincidan byte a byte en HEAD/run; el major de Chromium coincida con Playwright;
la GPU WebGL del runtime corresponda al único adaptador autorizado; y
`verifySoak` pase sin alterar sus umbrales. Probar en
`verify-reference-performance.test.mjs`: caso válido y rechazo de GPU dedicada
o no homologada, RAM/núcleos ausentes, OS distinto, perfil desconocido, major de
navegador distinto, HEAD/run distintos y hash de artifact/manifest distinto.
`reference-hardware-attestation.spec.ts` prueba además que no se serializa PII.

Si el agente no está ejecutando físicamente sobre un perfil conocido, permite
generar un soak diagnóstico, pero `externalGates.performanceReference` conserva
`pending`: no hay candidato premium ni publicación y jamás se rebajan los
presupuestos para hacer pasar otra máquina.

- [ ] **Step 7: Ejecutar unit tests de redacción, Axe y verificadores**

Run: `npm test --prefix frontend -- --runInBand --runTestsByPath e2e/support/persist-test-artifact.spec.ts e2e/support/premium-evidence-test.spec.ts e2e/support/quality-gates.spec.ts`

Run: `npm run test:performance`

Run: `node --test scripts/verify-reference-performance.test.mjs`

Expected: PASS; todos los impactos WCAG bloquean salvo waiver válido, cada
superficie sensible del HAR queda redactada y los verificadores exigen duración,
samples, secuencia exacta e identidad física de referencia.

- [ ] **Step 8: Commit**

```powershell
git add frontend/e2e/accessibility-waivers.json frontend/e2e/reference-hardware-profiles.json frontend/e2e/support/quality-gates.ts frontend/e2e/support/quality-gates.spec.ts frontend/e2e/support/persist-test-artifact.ts frontend/e2e/support/persist-test-artifact.spec.ts frontend/e2e/support/premium-evidence-test.ts frontend/e2e/support/premium-evidence-test.spec.ts frontend/e2e/support/premium-soak-flow.ts frontend/e2e/support/reference-hardware-attestation.ts frontend/e2e/support/reference-hardware-attestation.spec.ts frontend/e2e/premium-performance.e2e.ts scripts/capture-reference-hardware.ps1 scripts/verify-premium-performance.mjs scripts/verify-premium-performance.test.mjs scripts/verify-reference-performance.mjs scripts/verify-reference-performance.test.mjs
git commit -m "test(e2e): capture twenty minute premium soak"
```

### Task 11: Crear el gate final y paquete de evidencia

**Files:**
- Create: `frontend/e2e/premium-acceptance.e2e.ts`
- Modify: `frontend/e2e/premium-routes.e2e.ts`
- Modify: `frontend/e2e/support/required-viewports.ts`
- Modify: `frontend/e2e/support/quality-gates.ts`
- Modify: `frontend/e2e/support/premium-evidence-test.ts`
- Modify: `frontend/e2e/support/premium-evidence-test.spec.ts`
- Modify: `frontend/e2e/support/persist-test-artifact.ts`
- Modify: `frontend/e2e/support/persist-test-artifact.spec.ts`
- Modify: `frontend/e2e/support/premium-case-flow.ts`
- Modify: `frontend/e2e/character-editor-premium.e2e.ts`
- Modify: `frontend/e2e/world-runtime.e2e.ts`
- Modify: `frontend/e2e/dialogue-hud-premium.e2e.ts`
- Modify: `frontend/e2e/audio-settings.e2e.ts`
- Modify: `frontend/e2e/premium-recovery.e2e.ts`
- Create: `docs/audits/2026-07-13-premium-gameplay-evidence.md`
- Create: `scripts/run-premium-verification.mjs`
- Create: `scripts/verify-premium-evidence-identity.mjs`
- Create: `scripts/premium-evidence.test.mjs`
- Create: `scripts/verify-clinical-review.mjs`
- Create: `scripts/verify-clinical-review.test.mjs`
- Create: `docs/quality/premium-external-validation/owner-acceptance.template.md`
- Create: `docs/quality/premium-external-validation/nvda-review.template.md`
- Create: `docs/quality/premium-external-validation/participant-study.schema.json`
- Create: `scripts/verify-premium-external-validation.mjs`
- Create: `scripts/verify-premium-external-validation.test.mjs`
- Modify: `scripts/checkpoint-boundary.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Definir viewports prioritarios**

En `premium-routes.e2e.ts`, sustituir únicamente la importación de
`test`/`expect` de `@playwright/test` por
`./support/premium-evidence-test`; así las tres rutas ya existentes generan
video continuo y HAR redactado sin duplicar el recorrido.

```typescript
export const PREMIUM_DESKTOP_VIEWPORTS = [
  { name: 'desktop-1600', width: 1600, height: 900, inputMode: 'keyboard' },
  { name: 'laptop-1366', width: 1366, height: 768, inputMode: 'keyboard' },
] as const;

export const MOBILE_SMOKE_VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844, inputMode: 'touch' },
  { name: 'mobile-412', width: 412, height: 915, inputMode: 'touch' },
] as const;
```

- [ ] **Step 2: Escribir el gate de escritorio**

```typescript
import { expect, test } from './support/premium-evidence-test';

import { completePremiumCase, enterPremiumWorld } from './support/premium-case-flow';
import {
  persistJsonArtifact,
  persistTestArtifact,
  persistVisualCapture,
} from './support/persist-test-artifact';
import { assertQualityState, monitorRuntimeFailures } from './support/quality-gates';
import {
  MOBILE_SMOKE_VIEWPORTS,
  PREMIUM_DESKTOP_VIEWPORTS,
} from './support/required-viewports';

for (const viewport of PREMIUM_DESKTOP_VIEWPORTS) {
  test.describe('premium-' + viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(viewport.name + ' completes premium case cleanly', async ({ page }, testInfo) => {
      const runtime = monitorRuntimeFailures(page);
      try {
      await completePremiumCase(page, testInfo, viewport, 'recommended', {
        onVisualState: state => persistVisualCapture(page, testInfo, viewport, state),
      });
      await assertQualityState(page, testInfo, viewport.name + '-premium-outcome');
      await expect(page.locator('app-ai-assistant')).toHaveCount(0);
      await persistTestArtifact(
        testInfo,
        viewport.name + '-outcome.png',
        await page.screenshot(),
        'image/png',
      );
      const expectedCommit = process.env['PREMIUM_EXPECTED_HEAD'];
      expect(expectedCommit).toMatch(/^[a-f0-9]{40,64}$/);
      const runtimeIdentity = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (!gl) throw new Error('WebGL unavailable in premium evidence run');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = String(gl.getParameter(
          debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR,
        ) ?? '').trim();
        const renderer = String(gl.getParameter(
          debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
        ) ?? '').trim();
        if (!vendor || !renderer) throw new Error('GPU identity unavailable');
        return {
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemory:
            (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
          viewport: { width: innerWidth, height: innerHeight },
          gpu: {
            api: canvas.getContext('webgl2') ? 'webgl2' : 'webgl1',
            vendor,
            renderer,
          },
          urlProfile: {
            protocol: location.protocol,
            hostname: location.hostname,
            port: location.port,
            pathname: location.pathname,
            networkClass: 'loopback-isolated-e2e',
          },
          credentialProfile: {
            role: 'ESTUDIANTE',
            identityClass: 'seeded-isolated-test-user',
            secretSource: 'process-environment',
            containsSecret: false,
          },
        };
      });
      await persistJsonArtifact(
        testInfo,
        `${viewport.name}-runtime-identity.json`,
        {
          schemaVersion: 1,
          commit: expectedCommit,
          ...runtimeIdentity,
        },
      );

      const metrics = await page.evaluate(() => {
        const perfWindow = window as Window & {
          __SIEP_PERF__?: () => unknown;
          __SIEP_PERF_LAST__?: unknown;
        };
        return perfWindow.__SIEP_PERF__?.() ?? perfWindow.__SIEP_PERF_LAST__;
      }) as {
        samples: number;
        retainedSamples: number;
        droppedSamples: number;
        medianFps: number;
        p95FrameMs: number;
        under33Ratio: number;
        longestFrameMs: number;
        longestSub50RunMs: number;
      };
      await persistJsonArtifact(testInfo, `${viewport.name}-frame-sample.json`, metrics);
      expect(metrics.samples).toBeGreaterThanOrEqual(600);
      expect(metrics.retainedSamples).toBe(metrics.samples);
      expect(metrics.droppedSamples).toBe(0);
      expect(metrics.medianFps).toBeGreaterThanOrEqual(59);
      expect(metrics.p95FrameMs).toBeLessThanOrEqual(20);
      expect(metrics.under33Ratio).toBeGreaterThanOrEqual(0.99);
      expect(metrics.longestFrameMs).toBeLessThanOrEqual(100);
      expect(metrics.longestSub50RunMs).toBeLessThanOrEqual(1_000);
      runtime.assertClean();
      } finally {
        runtime.dispose();
      }
    });
  });
}
```

Extender `premium-case-flow.ts` con el union exacto
`PremiumVisualCaptureState = 'editor'|'exploration'|'interaction-person'|
'interaction-object'|'interaction-tool'|'interaction-exit'` y un callback
opcional `onVisualState`. Invocarlo una sola vez en cada estado real, después de
que la UI esté estable y antes de avanzar el beat; nunca recrear el estado con
mock, teleport o DOM artificial.

`persistVisualCapture` exige `E2E_VISUAL_CAPTURE_DIR`, acepta solo los dos nombres
de viewport y seis estados anteriores, hace screenshot sin animaciones pendientes,
resuelve y valida que el target permanezca bajo ese root y, **después** de esa
validación, ejecuta `mkdirSync(dirname(target), { recursive:true })`: Playwright
limpia su `outputDir` al arrancar. Luego escribe con `flag:'wx'` y adjunta el mismo
buffer al reporter. Las doce rutas son
exactamente:

```text
playwright/visual-captures/1366x768/{editor,exploration,interaction-person,interaction-object,interaction-tool,interaction-exit}.png
playwright/visual-captures/1600x900/{editor,exploration,interaction-person,interaction-object,interaction-tool,interaction-exit}.png
```

La spec del helper empieza con un root inexistente y prueba su recreación;
rechaza viewport/estado extra, path traversal, duplicado y captura vacía. El gate
final exige 12/12 archivos físicos con tamaño/hash, no un attachment en memoria.

Estos dos adjuntos cortos se llaman únicamente
`desktop-1600-frame-sample.json` y `laptop-1366-frame-sample.json`. El nombre
reservado `premium-performance.json` pertenece exclusivamente al soak continuo
de veinte minutos; ningún otro test puede producirlo.

- [ ] **Step 3: Añadir smoke móvil sin exigir composición premium**

```typescript
for (const viewport of MOBILE_SMOKE_VIEWPORTS) {
  test.describe('smoke-' + viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
    });

    test(viewport.name + ' remains operable', async ({ page }) => {
      const runtime = monitorRuntimeFailures(page);
      try {
        await enterPremiumWorld(page, viewport);
        await expect(page.getByTestId('touch-controls')).toBeVisible();
        await expect(page.getByRole('button', { name: /salida segura/i })).toBeVisible();
        runtime.assertClean();
      } finally {
        runtime.dispose();
      }
    });
  });
}
```

En `premium-evidence-test.ts`, exportar el contrato de artefactos nombrados y
un único adjuntador. El adjunto se crea **después** de que pasen las aserciones
de dominio del test fuente. Importar `persistJsonArtifact` desde
`./persist-test-artifact`:

```typescript
export const REQUIRED_PREMIUM_ARTIFACTS = [
  'visual-language',
  'character-parity',
  'motion-camera',
  'dialogue-liquid-glass',
  'audio-session',
  'checkpoint-recovery',
] as const;
export type PremiumArtifactName =
  typeof REQUIRED_PREMIUM_ARTIFACTS[number];

export async function attachPremiumArtifactIdentity(
  testInfo: TestInfo,
  artifactName: PremiumArtifactName,
  assertions: readonly string[],
): Promise<void> {
  const commit = process.env['PREMIUM_EXPECTED_HEAD'];
  if (!commit || !/^[a-f0-9]{40,64}$/.test(commit)) {
    throw new Error('PREMIUM_EXPECTED_HEAD is required for named evidence');
  }
  if (assertions.length === 0 || assertions.some(value => !value.trim())) {
    throw new Error('Named evidence requires non-empty assertions');
  }
  await persistJsonArtifact(
    testInfo,
    `${artifactName}.identity.json`,
    {
      schemaVersion: 1,
      artifactName,
      commit,
      projectName: testInfo.project.name,
      sourceTest: testInfo.titlePath().join(' > '),
      assertions,
    },
  );
}
```

Modificar exactamente un gate representativo en cada archivo y añadir
`testInfo` al callback si falta:

- `character-editor-premium.e2e.ts`: tras verificar las diez identidades,
  paridad editor/simulador y reload, adjuntar `character-parity`; en ese mismo
  test leer el visual manifest final y `E2E_VISUAL_EVIDENCE_DIR`, comprobar
  exactamente 10 identidades, 11 NPC, 14 mappings, 8 mapas y los cuatro contact
  sheets hasheados (`characters`, `npc`, `world-assets`, `hud-assets`), y solo
  entonces adjuntar por separado `visual-language`;
- `world-runtime.e2e.ts`: tras held-key, colisión, cámara pixel-perfect y
  reduced-motion, adjuntar `motion-camera`;
- `dialogue-hud-premium.e2e.ts`: tras HUD, retrato, corte vertical, Axe y
  ausencia del chatbot, adjuntar `dialogue-liquid-glass`;
- `audio-settings.e2e.ts`: tras sesión, persistencia de controles y ausencia de
  duplicación/reproducción fallida, adjuntar `audio-session`;
- `premium-recovery.e2e.ts`: al final de la variante clínica `repaired`, tras
  comparar el snapshot completo y la unicidad de decisiones, adjuntar
  `checkpoint-recovery`.

Cada llamada pasa una lista literal de las aserciones anteriores; no se permite
un test vacío dedicado solo a crear el marker. Ampliar
`premium-evidence-test.spec.ts` para probar los seis nombres, commit ausente o
inválido, lista vacía y JSON libre de password/token/email. Ningún adjunto
contiene credenciales, URL con query ni un render plan completo. Cada caso debe
comprobar además que el `.identity.json` original existe físicamente bajo
`outputPath`, sus bytes producen el hash esperado y no aparece una copia bajo
`attachments/`.

- [ ] **Step 4: Ejecutar gate**

Run: `npm run test:e2e -- premium-acceptance.e2e.ts --project=chromium --retries=0`

Expected: 4/4 PASS; screenshots, video, HAR redactado,
`premium-performance.json`, GPU/adapter y perfiles seguros de URL/credencial
pertenecen al mismo commit. La matriz completa de Task 12 es la que además debe
producir los seis artefactos nombrados.

- [ ] **Step 5: Crear índice de evidencia**

```markdown
# Evidencia de jugabilidad premium SIM-VBG-001

La evidencia de este documento se acepta solo si todos los artefactos indican el mismo commit.

## Identidad de ejecución

- Commit: se rellena automáticamente desde `git rev-parse HEAD`.
- Rama: `codex/calidad-9-10`.
- Base: PostgreSQL desechable del runner.
- Viewports: 1600×900, 1366×768; smoke 390×844 y 412×915.
- Runtime por viewport: WebGL version, GPU vendor/adapter, URL loopback segura y
  perfil de credencial `ESTUDIANTE` sin identificador ni secreto.

## Gates

- Personajes/editor: artefacto `character-parity`.
- Lenguaje visual global: artefacto `visual-language` y cuatro contact sheets exact-HEAD.
- Movimiento/cámara: artefacto `motion-camera`.
- Diálogo/HUD: artefacto `dialogue-liquid-glass`.
- Rutas: videos `recommended`, `repaired`, `unrepaired`.
- Audio: artefacto `audio-session`.
- Recovery: artefacto `checkpoint-recovery`.
- Rendimiento: `premium-performance.json`.
- Hardware de referencia: attestation `win-chromium-uhd620-4c-8g-v1`, separada
  de la identidad WebGL del soak y validada sobre 1366×768.
- Accesibilidad: Axe y registro manual NVDA.

## Gates humanos pendientes de ejecución real

- Partida completa del dueño del producto.
- Revisión NVDA manual del flujo completo.
- Cinco participantes ajenos al proyecto para afirmar públicamente 9/10.
- Firma SME para certificación clínica.
```

No inventar resultados ni firmas. El runner añade SHA/comandos/conteos reales al ejecutar.
Los seis JSON de identidad nombrados y cada `runtime-identity` deben declarar
el mismo Git SHA que el manifiesto; si falta uno, difiere o contiene un secreto,
el verificador bloquea la promoción.

- [ ] **Step 6: Crear el runner y el verificador de identidad**

El runner crea `visual-language/` dentro del run inmutable y, después del build,
ejecuta `render:visual-evidence -- --out <ruta>`. Deben aparecer exactamente
`characters.png`, `npc.png`, `world-assets.png` y `hud-assets.png`; el test E2E
los abre, cruza sus IDs/hash contra ambos manifests derivados y recién entonces
emite `visual-language.identity.json`. La caminata final hashea los cuatro PNG y
el verificador rechaza un nombre extra, ausente o modificado.

Crear `scripts/run-premium-verification.mjs`:

```javascript
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const git = args => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
}).trim();
const requireClean = label => {
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (dirty) throw new Error(`${label}: working tree is not clean\n${dirty}`);
};

requireClean('preflight');
const commit = git(['rev-parse', 'HEAD']);
const branch = git(['branch', '--show-current']);
const suppliedRunId = process.env.PREMIUM_RUN_ID;
const runId = suppliedRunId
  ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
if (!/^[A-Za-z0-9_-]{16,120}$/.test(runId)) {
  throw new Error('PREMIUM_RUN_ID must be 16-120 safe characters');
}
const commitRoot = path.resolve(root, '.superpowers', 'evidence', commit);
mkdirSync(commitRoot, { recursive: true });
const evidenceRoot = path.join(commitRoot, runId);
if (existsSync(evidenceRoot)) {
  throw new Error(`Evidence run already exists: ${evidenceRoot}`);
}
mkdirSync(evidenceRoot);
const logRoot = path.join(evidenceRoot, 'logs');
const playwrightRoot = path.join(evidenceRoot, 'playwright');
const visualEvidenceRoot = path.join(evidenceRoot, 'visual-language');
const visualCaptureRoot = path.join(playwrightRoot, 'visual-captures');
mkdirSync(logRoot, { recursive: true });
mkdirSync(playwrightRoot);
mkdirSync(visualEvidenceRoot);
mkdirSync(visualCaptureRoot);
const manifestPath = path.join(evidenceRoot, 'premium-evidence-manifest.json');
const referenceProfileId = process.env.PREMIUM_REFERENCE_PROFILE
  ?? 'win-chromium-uhd620-4c-8g-v1';
const referenceHardwarePath = path.join(
  evidenceRoot,
  'reference-hardware-attestation.json',
);
const capture = spawnSync('powershell.exe', [
  '-NoProfile', '-File', 'scripts/capture-reference-hardware.ps1',
  '-ProfileId', referenceProfileId,
  '-Commit', commit,
  '-RunId', runId,
  '-OutputPath', referenceHardwarePath,
], { cwd: root, encoding: 'utf8' });
if (capture.status !== 0) {
  throw new Error(`Reference hardware capture failed: ${capture.stderr}`);
}

const activeCredentials = {
  E2E_STUDENT_EMAIL:
    process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
  E2E_STUDENT_PASSWORD:
    process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
  SIEP_API_ADMIN_EMAIL:
    process.env.SIEP_API_ADMIN_EMAIL ?? 'admin@psychosim.edu.co',
  SIEP_API_ADMIN_PASSWORD:
    process.env.SIEP_API_ADMIN_PASSWORD ?? 'Admin123!',
  SIEP_API_PROFESOR_EMAIL:
    process.env.SIEP_API_PROFESOR_EMAIL ?? 'profesora@psychosim.edu.co',
  SIEP_API_PROFESOR_PASSWORD:
    process.env.SIEP_API_PROFESOR_PASSWORD ?? 'Profesor123!',
  SIEP_API_ESTUDIANTE_EMAIL:
    process.env.SIEP_API_ESTUDIANTE_EMAIL ?? 'estudiante@psychosim.edu.co',
  SIEP_API_ESTUDIANTE_PASSWORD:
    process.env.SIEP_API_ESTUDIANTE_PASSWORD ?? 'Estudiante123!',
};
const activeSecretValues = [...new Set(
  Object.values(activeCredentials).filter(value => value.length >= 4),
)];
const requiredPremiumArtifacts = [
  'visual-language',
  'character-parity',
  'motion-camera',
  'dialogue-liquid-glass',
  'audio-session',
  'checkpoint-recovery',
];

function redactForEvidence(value) {
  let safe = String(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer <redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<redacted-jwt>');
  for (const secret of activeSecretValues) {
    safe = safe.replaceAll(secret, '<redacted>');
    safe = safe.replaceAll(
      encodeURIComponent(secret),
      encodeURIComponent('<redacted>'),
    );
  }
  return safe;
}

const commands = [
  ['test-scripts', ['run', 'test:scripts']],
  ['check-backend', ['run', 'check:backend']],
  ['test-backend', ['run', 'test:backend']],
  ['test-frontend', ['run', 'test:frontend']],
  ['build-frontend', ['run', 'build:frontend']],
  ['render-visual-evidence', [
    'run', 'render:visual-evidence', '--', '--out', visualEvidenceRoot,
  ]],
  ['verify-production-instrumentation', ['run', 'verify:production-instrumentation']],
  ['test-api-e2e', ['run', 'test:api:e2e']],
  ['test-e2e', ['run', 'test:e2e', '--', '--project=chromium', '--retries=0']],
];

async function run(name, args, extraEnv = {}) {
  const started = Date.now();
  const captured = [];
  const logPath = path.join(logRoot, name + '.log');
  const log = createWriteStream(logPath);
  const child = spawn(npm, args, {
    cwd: root,
    env: { ...process.env, ...activeCredentials, ...extraEnv },
    windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      const safeChunk = redactForEvidence(chunk.toString());
      captured.push(safeChunk);
      log.write(safeChunk);
      process.stdout.write(safeChunk);
    });
  }
  const code = await new Promise(resolve => {
    child.once('error', error => {
      log.write(`\nspawn error: ${error.message}\n`);
      resolve(127);
    });
    child.once('close', value => resolve(value ?? 1));
  });
  log.end();
  await new Promise(resolve => log.on('finish', resolve));
  return {
    name,
    args,
    code,
    durationMs: Date.now() - started,
    log: path.relative(evidenceRoot, logPath),
    passedTests: code === 0
      ? passedTestCount(name, captured.join(''))
      : null,
  };
}

function passedTestCount(name, output) {
  if (!name.startsWith('test-')) return null;
  const patterns = [
    /Tests:\s+(\d+)\s+passed/gi,
    /(?:^|\n)\s*(\d+)\s+passed(?:\s|,|\()/gi,
    /# pass\s+(\d+)/gi,
  ];
  const counts = patterns.flatMap(pattern =>
    [...output.matchAll(pattern)].map(match => Number(match[1])));
  if (counts.length === 0 || counts.some(value => !Number.isInteger(value))) {
    throw new Error(`Could not extract passed test count for ${name}`);
  }
  return Math.max(...counts);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full === manifestPath ? [] : [full];
  });
}

function collectRuntimeProfiles() {
  return walk(playwrightRoot)
    .filter(file => path.basename(file).includes('runtime-identity'))
    .map(file => {
      const identity = JSON.parse(readFileSync(file, 'utf8'));
      return {
        commit: identity.commit,
        viewport: identity.viewport,
        gpu: identity.gpu,
        urlProfile: identity.urlProfile,
        credentialProfile: identity.credentialProfile,
      };
    });
}

function artifactIdentity(file) {
  const before = statSync(file);
  const bytes = readFileSync(file);
  const after = statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(`Artifact changed while hashing: ${file}`);
  }
  return {
    path: path.relative(evidenceRoot, file).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: after.size,
    mtimeMs: after.mtimeMs,
  };
}

let manifest = {
  schemaVersion: 2,
  commit,
  branch,
  runId,
  generatedAt: new Date().toISOString(),
  verifiedAt: null,
  status: 'verifying',
  system: {
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCores: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
    playwright: 'unavailable',
  },
  commands: [],
  artifacts: [],
  requiredPremiumArtifacts,
  runtimeProfiles: [],
  referenceHardware: {
    profileId: referenceProfileId,
    path: path.relative(evidenceRoot, referenceHardwarePath).replaceAll('\\', '/'),
    status: 'captured-not-approved',
  },
  externalGates: {
    ownerContinuousPlaythrough: 'pending',
    nvda: 'pending',
    fiveIndependentParticipants: 'pending',
    clinicalSme: 'pending',
    performanceReference: 'pending',
  },
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const results = [];
for (const [name, args] of commands) {
  const extraEnv = name === 'test-e2e'
    ? {
        E2E_ARTIFACTS_DIR: playwrightRoot,
        PREMIUM_EXPECTED_HEAD: commit,
        PREMIUM_EXPECTED_RUN_ID: runId,
        PREMIUM_REFERENCE_HARDWARE_ATTESTATION: referenceHardwarePath,
        E2E_VISUAL_EVIDENCE_DIR: visualEvidenceRoot,
        E2E_VISUAL_CAPTURE_DIR: visualCaptureRoot,
      }
    : {};
  const result = await run(name, args, extraEnv);
  results.push(result);
  if (result.code !== 0) break;
}
const cleanup = await run('cleanup-backend', ['run', 'test:backend:down']);
results.push(cleanup);

try {
  manifest.system.playwright = JSON.parse(readFileSync(
    path.join(root, 'frontend', 'node_modules', '@playwright', 'test', 'package.json'),
    'utf8',
  )).version;
} catch {}

const commandsPassed = results.length === commands.length + 1
  && results.every(result => result.code === 0);
if (git(['rev-parse', 'HEAD']) !== commit) {
  throw new Error('HEAD changed during verification');
}
requireClean('post-commands');
manifest.commands = results;
writeFileSync(path.join(evidenceRoot, 'premium-evidence-index.md'), [
  '# Evidencia premium SIM-VBG-001',
  '',
  `- Commit: ${commit}`,
  `- Rama: ${branch}`,
  `- Run: ${runId}`,
  `- Generado: ${manifest.generatedAt}`,
  '',
  '## Comandos automatizados',
  '',
  ...results.map(result =>
    `- ${result.name}: exit ${result.code}; ${result.durationMs} ms; tests ${result.passedTests ?? 'n/a'}; ${result.log}`),
  '',
  '## Artefactos premium obligatorios',
  '',
  ...requiredPremiumArtifacts.map(name => `- ${name}: requerido, mismo commit`),
  '',
  '## Runtime',
  '',
  '- GPU/adapter, URL loopback y perfil de credencial seguro: ver runtimeProfiles del manifiesto.',
  '',
  '## Gates humanos',
  '',
  '- Partida continua del dueño: pending',
  '- NVDA: pending',
  '- Cinco participantes independientes: pending',
  '- Firma SME clínica: pending',
  '',
].join('\n'));
manifest.runtimeProfiles = collectRuntimeProfiles();
manifest.artifacts = walk(evidenceRoot).map(artifactIdentity);
manifest.status = commandsPassed ? 'verifying' : 'failed';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

if (!commandsPassed) {
  console.error(`Evidence failed: ${manifestPath}`);
  process.exitCode = 1;
} else {
  const verifier = path.join(root, 'scripts', 'verify-premium-evidence-identity.mjs');
  const verify = extraArgs => spawnSync(
    process.execPath,
    [verifier, manifestPath, ...extraArgs],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...activeCredentials,
        EXPECTED_PREMIUM_HEAD: commit,
      },
      windowsHide: true,
    },
  );
  const candidate = verify(['--allow-verifying']);
  if (candidate.status !== 0) {
    throw new Error('Evidence candidate failed verification');
  }
  if (git(['rev-parse', 'HEAD']) !== commit) {
    throw new Error('HEAD changed before manifest promotion');
  }
  requireClean('pre-promotion');
  manifest = {
    ...manifest,
    status: 'automated-gates-passed',
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const final = verify([]);
  if (final.status !== 0) throw new Error('Promoted manifest failed verification');
  if (git(['rev-parse', 'HEAD']) !== commit) {
    throw new Error('HEAD changed during final verification');
  }
  requireClean('post-verification');
}

console.log(`Evidence manifest: ${manifestPath}`);
```

La ruta siempre es `.superpowers/evidence/<commit>/<runId>`; nunca se reutiliza
una carpeta de un run anterior. El runner aborta tanto si el checkout empieza
sucio como si HEAD/status cambian durante la matriz. Cada artefacto se identifica
por SHA-256, bytes y `mtimeMs`. El estado nace `verifying` y solo se promueve
después de que el verificador de candidato haya pasado.

Crear `scripts/verify-premium-evidence-identity.mjs` con exports testeables y CLI:

```javascript
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySoak } from './verify-premium-performance.mjs';

const SENSITIVE_NAME =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|token|attemptToken|accessToken|refreshToken|credential)$/i;
const TEXT_FILE = /\.(?:har|json|txt|log|html|md)$/i;
const REQUIRED_PREMIUM_ARTIFACTS = [
  'visual-language',
  'character-parity',
  'motion-camera',
  'dialogue-liquid-glass',
  'audio-session',
  'checkpoint-recovery',
];

export function detectSecrets(text, activeSecrets = []) {
  const hits = [
    [/"(?:attemptToken|accessToken|refreshToken|password|credential)"\s*:\s*"(?!<redacted>)[^"]+/i, 'secret JSON field'],
    [/[?&](?:token|attemptToken|accessToken|refreshToken)=(?!%3Credacted%3E|<redacted>)[^&#\s]+/i, 'secret query value'],
    [/\bBearer\s+(?!<redacted>)[A-Za-z0-9._~+\/=-]+/i, 'Bearer credential'],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, 'JWT'],
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  for (const secret of activeSecrets.filter(value => value?.length >= 4)) {
    if (text.includes(secret)) hits.push('active credential literal');
    if (text.includes(encodeURIComponent(secret))) {
      hits.push('encoded active credential literal');
    }
  }
  return [...new Set(hits)];
}

export function verifyHarRedaction(har, activeSecrets = []) {
  const errors = [];
  for (const [index, entry] of (har.log?.entries ?? []).entries()) {
    const prefix = `HAR entry ${index}`;
    for (const hit of detectSecrets(JSON.stringify(entry), activeSecrets)) {
      errors.push(`${prefix}: ${hit}`);
    }
    for (const scope of [entry.request, entry.response]) {
      for (const header of scope?.headers ?? []) {
        if (SENSITIVE_NAME.test(header.name) && header.value !== '<redacted>') {
          errors.push(`${prefix}: unredacted header ${header.name}`);
        }
      }
      for (const cookie of scope?.cookies ?? []) {
        if (cookie.value !== '<redacted>') {
          errors.push(`${prefix}: unredacted cookie ${cookie.name}`);
        }
      }
    }
    for (const item of entry.request?.queryString ?? []) {
      if (SENSITIVE_NAME.test(item.name) && item.value !== '<redacted>') {
        errors.push(`${prefix}: unredacted query ${item.name}`);
      }
    }
    for (const item of entry.request?.postData?.params ?? []) {
      if (SENSITIVE_NAME.test(item.name) && item.value !== '<redacted>') {
        errors.push(`${prefix}: unredacted postData param ${item.name}`);
      }
    }
  }
  return errors;
}

function artifactErrors(artifact, runRoot) {
  const errors = [];
  const full = path.resolve(runRoot, artifact.path);
  if (!full.startsWith(runRoot + path.sep)) {
    return [`artifact escapes run root: ${artifact.path}`];
  }
  let stat;
  let bytes;
  try {
    stat = statSync(full);
    bytes = readFileSync(full);
  } catch {
    return [`missing artifact: ${artifact.path}`];
  }
  if (stat.size !== artifact.size) errors.push(`size mismatch: ${artifact.path}`);
  if (stat.mtimeMs !== artifact.mtimeMs) errors.push(`mtime mismatch: ${artifact.path}`);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== artifact.sha256) errors.push(`sha256 mismatch: ${artifact.path}`);
  return errors;
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...expected].sort());
}

function runtimeProfileErrors(profile, head, label) {
  const errors = [];
  if (!exactKeys(profile, [
    'commit', 'viewport', 'gpu', 'urlProfile', 'credentialProfile',
  ])) return [`${label}: runtime profile shape differs`];
  if (profile.commit !== head) errors.push(`${label}: runtime commit differs`);
  if (!exactKeys(profile.viewport, ['width', 'height'])
    || !Number.isInteger(profile.viewport.width)
    || !Number.isInteger(profile.viewport.height)) {
    errors.push(`${label}: invalid viewport`);
  }
  if (!exactKeys(profile.gpu, ['api', 'vendor', 'renderer'])
    || !['webgl1', 'webgl2'].includes(profile.gpu.api)
    || typeof profile.gpu.vendor !== 'string' || !profile.gpu.vendor.trim()
    || typeof profile.gpu.renderer !== 'string' || !profile.gpu.renderer.trim()) {
    errors.push(`${label}: missing GPU/adapter identity`);
  }
  const url = profile.urlProfile;
  if (!exactKeys(url, [
    'protocol', 'hostname', 'port', 'pathname', 'networkClass',
  ])
    || !['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    || !/^\d{1,5}$/.test(url.port)
    || typeof url.pathname !== 'string' || !url.pathname.startsWith('/')
    || /[?#]/.test(url.pathname)
    || url.networkClass !== 'loopback-isolated-e2e') {
    errors.push(`${label}: unsafe URL profile`);
  }
  const credential = profile.credentialProfile;
  if (!exactKeys(credential, [
    'role', 'identityClass', 'secretSource', 'containsSecret',
  ])
    || credential.role !== 'ESTUDIANTE'
    || credential.identityClass !== 'seeded-isolated-test-user'
    || credential.secretSource !== 'process-environment'
    || credential.containsSecret !== false) {
    errors.push(`${label}: unsafe credential profile`);
  }
  return errors;
}

export function verifyManifest(
  manifest,
  { head, runRoot, allowVerifying = false, activeSecrets = [] },
) {
  const errors = [];
  if (manifest.schemaVersion !== 2) errors.push('manifest schemaVersion must be 2');
  if (manifest.commit !== head) errors.push('manifest commit differs from HEAD');
  if (manifest.runId !== path.basename(runRoot)) errors.push('runId differs from directory');
  if (path.basename(path.dirname(runRoot)) !== head) errors.push('run directory is outside HEAD namespace');
  if (!Number.isFinite(Date.parse(manifest.generatedAt))) {
    errors.push('generatedAt is invalid');
  }
  const allowedStatus = allowVerifying ? ['verifying'] : ['automated-gates-passed'];
  if (!allowedStatus.includes(manifest.status)) {
    errors.push(`invalid manifest status for this phase: ${manifest.status}`);
  }
  if (
    manifest.status === 'verifying' && manifest.verifiedAt !== null
    || manifest.status === 'automated-gates-passed'
      && !Number.isFinite(Date.parse(manifest.verifiedAt))
  ) errors.push('verifiedAt does not match manifest phase');
  const requiredCommands = [
    'test-scripts',
    'check-backend',
    'test-backend',
    'test-frontend',
    'build-frontend',
    'render-visual-evidence',
    'verify-production-instrumentation',
    'test-api-e2e',
    'test-e2e',
    'cleanup-backend',
  ];
  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  if (!Array.isArray(manifest.commands)) errors.push('commands must be an array');
  if (JSON.stringify(commands.map(item => item?.name)) !== JSON.stringify(requiredCommands)) {
    errors.push('command sequence differs from premium matrix');
  }
  if (commands.some(command =>
    command?.code !== 0
    || !Array.isArray(command.args)
    || !Number.isFinite(command.durationMs)
    || typeof command.log !== 'string'
    || !Object.hasOwn(command, 'passedTests'))) {
    errors.push('a command failed');
  }
  const countedCommands = new Set([
    'test-scripts', 'test-backend', 'test-frontend',
    'test-api-e2e', 'test-e2e',
  ]);
  for (const command of commands) {
    if (countedCommands.has(command?.name)) {
      if (!Number.isInteger(command.passedTests) || command.passedTests < 1) {
        errors.push(`missing passed test count for ${command?.name}`);
      }
    } else if (command?.passedTests !== null) {
      errors.push(`unexpected test count for ${command?.name}`);
    }
  }
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (!Array.isArray(manifest.artifacts)) errors.push('artifacts must be an array');
  const validArtifacts = artifacts.filter(artifact => {
    const normalizedPath = typeof artifact?.path === 'string'
      ? path.posix.normalize(artifact.path.replaceAll('\\', '/'))
      : '';
    const valid = artifact
      && typeof artifact.path === 'string'
      && artifact.path.length > 0
      && normalizedPath === artifact.path
      && !path.posix.isAbsolute(normalizedPath)
      && normalizedPath !== '..'
      && !normalizedPath.startsWith('../')
      && /^[a-f0-9]{64}$/.test(artifact.sha256)
      && Number.isInteger(artifact.size)
      && artifact.size >= 0
      && Number.isFinite(artifact.mtimeMs);
    if (!valid) errors.push('artifact identity has invalid shape');
    return valid;
  });
  const paths = validArtifacts.map(item => item.path);
  const comparablePaths = paths.map(file =>
    process.platform === 'win32' ? file.toLowerCase() : file);
  if (new Set(comparablePaths).size !== paths.length) {
    errors.push('duplicate artifact paths');
  }
  for (const artifact of validArtifacts) {
    errors.push(...artifactErrors(artifact, runRoot));
  }
  if (
    JSON.stringify(manifest.requiredPremiumArtifacts)
    !== JSON.stringify(REQUIRED_PREMIUM_ARTIFACTS)
  ) errors.push('required premium artifact set differs');
  for (const name of REQUIRED_PREMIUM_ARTIFACTS) {
    const candidates = validArtifacts.filter(artifact =>
      path.basename(artifact.path).includes(name)
      && artifact.path.endsWith('.json'));
    let validIdentity = false;
    for (const artifact of candidates) {
      try {
        const identity = JSON.parse(readFileSync(
          path.join(runRoot, artifact.path), 'utf8',
        ));
        if (identity.artifactName !== name) continue;
        if (!exactKeys(identity, [
          'schemaVersion', 'artifactName', 'commit',
          'projectName', 'sourceTest', 'assertions',
        ])
          || identity.schemaVersion !== 1
          || identity.commit !== head
          || typeof identity.projectName !== 'string' || !identity.projectName
          || typeof identity.sourceTest !== 'string' || !identity.sourceTest
          || !Array.isArray(identity.assertions) || identity.assertions.length === 0
          || identity.assertions.some(item =>
            typeof item !== 'string' || !item.trim())) {
          errors.push(`${name}: invalid identity or differing Git SHA`);
          continue;
        }
        validIdentity = true;
      } catch {
        errors.push(`${name}: invalid identity JSON`);
      }
    }
    if (!validIdentity) errors.push(`missing named premium artifact ${name}`);
  }

  const artifactRuntimeProfiles = [];
  for (const artifact of validArtifacts.filter(item =>
    path.basename(item.path).includes('runtime-identity')
    && item.path.endsWith('.json'))) {
    try {
      const identity = JSON.parse(readFileSync(
        path.join(runRoot, artifact.path), 'utf8',
      ));
      const profile = {
        commit: identity.commit,
        viewport: identity.viewport,
        gpu: identity.gpu,
        urlProfile: identity.urlProfile,
        credentialProfile: identity.credentialProfile,
      };
      errors.push(...runtimeProfileErrors(profile, head, artifact.path));
      artifactRuntimeProfiles.push(profile);
    } catch {
      errors.push(`${artifact.path}: invalid runtime identity JSON`);
    }
  }
  const viewportKeys = artifactRuntimeProfiles
    .map(item => `${item.viewport?.width}x${item.viewport?.height}`)
    .sort();
  if (JSON.stringify(viewportKeys) !== JSON.stringify([
    '1366x768', '1600x900',
  ])) errors.push('runtime identities must cover exactly both desktop viewports');
  const sortProfiles = values => [...values].sort((a, b) =>
    (a.viewport.width - b.viewport.width)
    || (a.viewport.height - b.viewport.height));
  const manifestProfilesValid = Array.isArray(manifest.runtimeProfiles)
    && manifest.runtimeProfiles.every(item =>
      item && Number.isInteger(item.viewport?.width)
      && Number.isInteger(item.viewport?.height));
  if (!manifestProfilesValid
    || JSON.stringify(sortProfiles(manifest.runtimeProfiles))
      !== JSON.stringify(sortProfiles(artifactRuntimeProfiles))) {
    errors.push('manifest runtimeProfiles differ from hashed runtime artifacts');
  }
  for (const route of ['recommended', 'repaired', 'unrepaired']) {
    if (!paths.some(file => file.includes(route) && file.endsWith('.webm'))) {
      errors.push(`missing continuous video for ${route}`);
    }
  }
  for (const required of ['network.redacted.har', '.png', 'axe-complete.json']) {
    if (!paths.some(file => file.includes(required))) errors.push(`missing ${required}`);
  }
  if (!paths.includes('premium-evidence-index.md')) {
    errors.push('missing premium-evidence-index.md');
  }
  const contactSheets = paths
    .filter(file => file.startsWith('visual-language/') && file.endsWith('.png'))
    .map(file => path.basename(file))
    .sort();
  if (JSON.stringify(contactSheets) !== JSON.stringify([
    'characters.png', 'hud-assets.png', 'npc.png', 'world-assets.png',
  ])) errors.push('visual contact sheet set differs from the required four');
  const visualStates = [
    'editor', 'exploration', 'interaction-person',
    'interaction-object', 'interaction-tool', 'interaction-exit',
  ];
  const requiredVisualCaptures = ['1366x768', '1600x900']
    .flatMap(viewport => visualStates.map(state =>
      `playwright/visual-captures/${viewport}/${state}.png`))
    .sort();
  const visualCaptures = paths
    .filter(file => file.startsWith('playwright/visual-captures/'))
    .sort();
  if (JSON.stringify(visualCaptures) !== JSON.stringify(requiredVisualCaptures)) {
    errors.push('visual capture set differs from the required twelve');
  }
  const soakFiles = paths.filter(file => path.basename(file) === 'premium-performance.json');
  if (soakFiles.length !== 1) {
    errors.push('expected exactly one premium-performance.json soak artifact');
  } else {
    try {
      const soak = JSON.parse(readFileSync(path.join(runRoot, soakFiles[0]), 'utf8'));
      if (verifySoak(soak).length !== 0) {
        errors.push('premium-performance.json is not a valid twenty-minute soak');
      }
    } catch {
      errors.push('premium-performance.json is unreadable');
    }
  }
  for (const artifact of validArtifacts) {
    const full = path.join(runRoot, artifact.path);
    if (!TEXT_FILE.test(full)) continue;
    const text = readFileSync(full, 'utf8');
    for (const hit of detectSecrets(text, activeSecrets)) {
      errors.push(`${artifact.path}: ${hit}`);
    }
    if (full.endsWith('.har')) {
      try {
        errors.push(...verifyHarRedaction(JSON.parse(text), activeSecrets)
          .map(error => `${artifact.path}: ${error}`));
      } catch {
        errors.push(`${artifact.path}: invalid HAR JSON`);
      }
    }
  }
  const requiredExternalGates = [
    'ownerContinuousPlaythrough',
    'nvda',
    'fiveIndependentParticipants',
    'clinicalSme',
    'performanceReference',
  ];
  const externalGates = manifest.externalGates ?? {};
  if (
    JSON.stringify(Object.keys(externalGates).sort())
    !== JSON.stringify([...requiredExternalGates].sort())
  ) errors.push('external gate set differs from required gates');
  for (const gate of requiredExternalGates) {
    if (externalGates[gate] !== 'pending') {
      errors.push(`external gate ${gate} must remain pending`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifestPath = path.resolve(process.argv[2]);
  const runRoot = path.dirname(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const expected = process.env.EXPECTED_PREMIUM_HEAD;
  const dirty = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' },
  ).trim();
  const activeSecrets = [
    process.env.E2E_STUDENT_EMAIL,
    process.env.E2E_STUDENT_PASSWORD,
    process.env.SIEP_API_ADMIN_EMAIL,
    process.env.SIEP_API_ADMIN_PASSWORD,
    process.env.SIEP_API_PROFESOR_EMAIL,
    process.env.SIEP_API_PROFESOR_PASSWORD,
    process.env.SIEP_API_ESTUDIANTE_EMAIL,
    process.env.SIEP_API_ESTUDIANTE_PASSWORD,
    process.env.E2E_ATTEMPT_TOKEN,
    process.env.E2E_ACCESS_TOKEN,
    process.env.E2E_REFRESH_TOKEN,
  ].filter(Boolean);
  const errors = verifyManifest(manifest, {
    head,
    runRoot,
    allowVerifying: process.argv.includes('--allow-verifying'),
    activeSecrets,
  });
  if (expected && expected !== head) errors.push('HEAD differs from runner expectation');
  if (dirty) errors.push(`working tree is dirty\n${dirty}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}
```

En `scripts/premium-evidence.test.mjs`, crear artefactos temporales reales y
cubrir: candidato `verifying` válido, manifiesto final válido, SHA/size/mtime
distintos, `runId`/HEAD distintos, comando fallido, carpeta/video/soak/Axe
ausentes, soak menor a veinte minutos, HAR con cada superficie sensible, Bearer,
JWT y cada credencial activa exacta. Añadir una tabla parametrizada que elimina
uno por uno `visual-language`, `character-parity`, `motion-camera`,
`dialogue-liquid-glass`, `audio-session` y `checkpoint-recovery`; cada caso debe fallar con el nombre
exacto. Cubrir además identity con Git SHA distinto, lista de assertions vacía,
runtime identity ausente para cada viewport, GPU vendor/renderer vacío, WebGL
inválido, hostname no loopback, pathname con query, perfil de credencial con
email/password/token, y `runtimeProfiles` que no coincide byte por byte con los
artefactos hasheados. Eliminar/mutar/añadir uno de los cuatro contact sheets o
de las doce capturas exactas, o omitir `render-visual-evidence`, también debe
fallar. Cubrir un comando de tests
sin `passedTests`, con cero y
con string, además de conteos positivos válidos. Un manifiesto
`automated-gates-passed` debe fallar en modo
candidato y uno `verifying` debe fallar en modo final.

La fixture final positiva contiene físicamente exactamente un
`premium-performance.json`, dos `*-runtime-identity.json`, seis
`*.identity.json`, todos los Axe JSON y las capturas requeridas; ningún resultado
se satisface solo con metadata de reporter. Añadir negativos de soak/runtime
duplicado y de artifact declarado en manifest pero ausente en disco.

Crear además `scripts/verify-clinical-review.mjs`. Es un validador documental
read-only; **nunca crea, completa, firma ni cambia un resultado**. Exporta
`verifyClinicalReview(input)` para tests y una CLI con:

```powershell
node scripts/verify-clinical-review.mjs `
  --handoff <living-case-clinical-handoff.json> `
  --review <clinical-review.md> `
  --manifest <premium-evidence-manifest.json> `
  --head <FINAL_HEAD> `
  [--require-approved]
```

El contrato cerrado del validador es:

```javascript
export const CLINICAL_OPTION_KEYS = [
  'h1-noticia-sin-protocolo', 'h1-pap-contencion', 'h1-interrogar-victima',
  'h2-solo-459', 'h2-459-1257', 'h2-459-1448',
  'h3-parcial-disonancia', 'h3-pap-epicee', 'h3-epicee-ciclo',
  'h3-integral-psicosocial',
  'c1-mediacion-perdon', 'c1-riesgo-proteccion-derechos',
  'c1-patrones-infancia',
  'c2-2126-1098-1257', 'c2-1098-1257', 'c2-eje-1448',
  'c3-parcial-clinica', 'c3-valoracion-dependientes',
  'c3-integral-derechos',
];
export const CLINICAL_ROUTE_KEYS = ['recommended', 'repaired', 'unrepaired'];
```

La CLI falla salvo que se cumpla todo lo siguiente:

- checkout `HEAD`, `manifest.commit`, namespace del manifest y línea
  `SHA revisado:` son el mismo SHA; el manifest continúa
  `automated-gates-passed` y `externalGates.clinicalSme === 'pending'`;
- el handoff estable existe, sigue `status: PENDING`, exige
  `HEAD_AFTER_AUDIO_AND_CHECKPOINT` y su template de ruta es el esperado;
- SHA-256 actual de `handoff.protocolSource` y `handoff.protocolCopy` coincide
  con `handoff.protocolSha256`; la revisión vive exactamente bajo
  `.superpowers/external-validation/<HEAD>/<safe-sessionId>/clinical-review.md`;
- la copia conserva título, estado Phase 4 PENDING, catálogo de opciones y
  rutas del protocolo. Los nueve campos `SHA revisado`, `Persona revisora`,
  `Rol clínico`, `Fecha y zona horaria`, `Navegador y versión`, `Resultado`,
  `Riesgos o bloqueos`, `Evidencia visual`, `Firma` aparecen exactamente una
  vez y ninguno conserva el valor `PENDIENTE`;
- fecha usa ISO-8601 con offset explícito, resultado es exactamente
  `APROBADO|BLOQUEADO`, firma/nombre/rol no están vacíos y no aparece Bearer,
  JWT, password, token o credencial activa;
- hay exactamente una línea
  `Opción <key>: APROBADA|BLOQUEADA | <observación>` por cada una de las 19
  claves, y una línea `Ruta <key>: APROBADA|BLOQUEADA | <evidencia>` por cada
  una de las tres rutas. No admite claves extra/duplicadas ni observación vacía;
- cualquier opción/ruta bloqueada obliga a `Resultado: BLOQUEADO`. Con
  `Resultado: APROBADO`, las 22 líneas deben estar aprobadas y
  `Riesgos o bloqueos:` debe declarar que no queda ninguno abierto;
- `--require-approved` devuelve non-zero si el documento falta o su resultado
  es `BLOQUEADO`. Sin ese flag, un BLOQUEADO estructuralmente válido se valida y
  se conserva como evidencia negativa, pero nunca se transforma en aprobado.

La CLI resuelve todas las rutas relativas del handoff contra la raíz Git, usa
`path.relative` para impedir escapes y solo lee archivos. No confía en un SHA
pasado por el documento para determinar HEAD: compara también
`git rev-parse HEAD`.

En `verify-clinical-review.test.mjs`, usar directorios temporales y bytes reales
para cubrir: APROBADO válido, BLOQUEADO válido aceptado sin
`--require-approved` pero rechazado con él, hash source/copy incorrecto,
manifest/HEAD/review-path diferentes, manifest que intenta cambiar
`clinicalSme`, campo pendiente, fecha sin offset, firma ausente, cada una de las
19 opciones ausente/duplicada, cada ruta ausente, subresultado bloqueado con
veredicto aprobado y secreto incrustado. El test comprueba además que mtimes y
contenido de handoff/review no cambian: el validador no autoaprueba.

Añadir a `package.json`:

```json
"render:visual-evidence": "node frontend/scripts/render-premium-contact-sheets.mjs",
"verify:premium": "node scripts/run-premium-verification.mjs"
```

Extender `checkpoint-boundary.test.mjs` para exigir que runner y verificador
contengan los seis nombres exactos, que el runner pase
`PREMIUM_EXPECTED_HEAD: commit`, `PREMIUM_EXPECTED_RUN_ID: runId` y
`E2E_VISUAL_EVIDENCE_DIR`/`E2E_VISUAL_CAPTURE_DIR`, que ambos runtime identities registren `gpu`,
`urlProfile` y `credentialProfile`, y que el verificador compare cada identity
contra `head`. Exigir también `render-visual-evidence` exactamente una vez antes
de `test-e2e`. Este boundary test complementa —no sustituye— las pruebas con
artefactos temporales.

Run: `npm run test:scripts`

Expected: PASS, incluidos el boundary checkpoint, evidencia premium,
performance y el validador clínico documental. Si `test:scripts` enumera
archivos en vez de usar glob, añadir explícitamente
`scripts/verify-clinical-review.test.mjs`,
`scripts/verify-reference-performance.test.mjs` y
`scripts/verify-premium-external-validation.test.mjs`; nunca dejar un validador
fuera de la matriz que genera `passedTests`.

- [ ] **Step 7: Definir y validar sin autoaprobar los gates humanos exactos**

Crear las dos plantillas Markdown y el schema JSON bajo
`docs/quality/premium-external-validation/`. Son instrumentos tracked, no
resultados. Los resultados viven únicamente en
`.superpowers/external-validation/<FINAL_HEAD>/<sessionId>/` y contienen un
`sessionId` seguro, `FINAL_HEAD`, `PREMIUM_RUN_ID`, timestamps ISO-8601 con
offset y referencias relativas a evidencia. No almacenan email, teléfono,
cuenta, voz, hostname, serial, token ni credencial.

`owner-acceptance.template.md` exige un recorrido continuo real
editor → advertencia → `SIM-VBG-001` → outcome, sin DevTools, teletransporte,
reload correctivo ni ayuda externa. Debe incluir exactamente un veredicto
humano `APROBADO|BLOQUEADO` para arte, movimiento/control, diálogo, jugabilidad
y sonido; cualquier bloqueo hace fallar el gate. También registra el SHA-256
exacto de `PremiumVisualManifestV1`, las contact sheets de las 10 identidades y
11 visuales NPC, la cobertura de los 14 actor mappings y screenshots en
1366×768 y 1600×900. Las referencias permitidas son exclusivamente los cuatro
PNG `visual-language/{characters,npc,world-assets,hud-assets}.png` y los doce
PNG `playwright/visual-captures/{1366x768,1600x900}/<seis-estados>.png` del mismo
manifest/run. La persona dueña declara
explícitamente que no observó assets fuera del lenguaje pixel-art común. Ningún
agente completa o infiere estas respuestas.

`nvda-review.template.md` exige persona revisora humana, versión de NVDA,
navegador/versión y el recorrido exacto por editor, advertencia, mundo, diálogo,
ajustes, diario y outcome. Cada superficie tiene `APROBADA|BLOQUEADA`, detalle
de foco/nombre/estado/anuncio y evidencia; para aprobar debe haber cero blockers
y un `Resultado: APROBADO`. Axe no sustituye esta revisión.

`participant-study.schema.json` es cerrado (`additionalProperties:false`) y
acepta exactamente cinco registros con IDs pseudónimos distintos. Cada registro
declara `independent:true`, `hasNotWorkedOnProject:true`, `firstRun:true`,
consentimiento, inicio/fin, duración derivada,
`completedWithoutExternalInstruction`, ratings enteros 1–5 para las cinco claves
exactas `visualCoherence`, `editorFidelity`, `control`, `reading`, `atmosphere`,
`decisionConsequenceExplained`, una explicación saneada, y el segmento obligatorio
`noAudioCheckpointCompleted:true` con `essentialInfoLost:false`.

Crear `verify-premium-external-validation.mjs` como validador documental
read-only. No crea directorios, no copia templates, no escribe en el manifest y
no convierte `PENDING`/`BLOQUEADO` en aprobación. Su CLI recibe:

```powershell
node scripts/verify-premium-external-validation.mjs `
  --manifest <premium-evidence-manifest.json> `
  --owner <owner-acceptance.md> `
  --nvda <nvda-review.md> `
  --participants <participant-study.json> `
  --visual-manifest <premium-visual-manifest.json> `
  --reference-attestation <reference-hardware-attestation.json> `
  --clinical-review <clinical-review.md> `
  --head <FINAL_HEAD> `
  --phase candidate|public-9
```

`--participants` es el único argumento condicional: se omite en `candidate` y
es obligatorio en `public-9`; todos los demás son obligatorios en ambas fases.

En fase `candidate` exige: manifest automatizado válido y aún con todos los
gates externos `pending`; mismo HEAD/run/session en evidencia; dueño aprobado;
NVDA aprobado; visual manifest/hash/contact sheets/screenshots exactos; hardware
de referencia aprobado por `verify-reference-performance.mjs`; y revisión SME
aprobada por `verify-clinical-review.mjs`. En fase `public-9` exige además el
estudio de exactamente cinco participantes y calcula literalmente:

El orquestador importa las funciones puras de ambos verificadores: resuelve el
único `premium-performance.json` desde los artifacts hasheados del manifest y el
handoff clínico estable desde
`.superpowers/evidence/living-case-clinical-handoff.json`. No confía en rutas o
resultados declarados dentro de los documentos humanos.

- al menos 4/5 terminan sin instrucción externa;
- para **cada** una de las cinco dimensiones, al menos 4/5 puntúan 4 o 5;
- al menos 4/5 explican correctamente decisión → consecuencia;
- la mediana de primera partida está entre 15 y 25 minutos, extremos incluidos;
- los cinco completan el segmento sin audio y ninguno pierde información esencial.

Si falta el estudio, solo puede emitirse verbalmente “candidato verificado”; no
puede afirmarse públicamente 9/10. El validador devuelve non-zero ante
PII/secreto, ruta fuera del namespace, HEAD/run/session distinto, hash visual
distinto, review humana pendiente o cualquier umbral incumplido.

`verify-premium-external-validation.test.mjs` cubre candidato válido y público
válido, además de: owner con recorrido interrumpido o ayuda externa; dimensión
bloqueada; NVDA con un blocker; visual hash o evidencia ausente; hardware sin
homologar; cualquiera de las cuatro contact sheets o doce capturas
ausente/extra/hash distinto; SME pendiente; participante ausente o sexto; IDs duplicados;
`independent:false`, `hasNotWorkedOnProject:false` o `firstRun:false`; solo 3/5
sin ayuda; cualquier dimensión con solo 3/5 en 4–5;
solo 3/5 explicaciones; mediana 14.99 o 25.01; cualquier pérdida esencial sin
audio; HEAD/run/session distintos; PII/secreto y un intento de mutar el manifest.
Los tests comparan bytes y mtimes antes/después para probar que todos los
validadores permanecen read-only.

Añadir ambos tests nuevos a `test:scripts` y extender el boundary test para
exigir los cinco gates externos exactos, las cinco dimensiones, los umbrales
literales y las dos fases. Ejecutar:

Run: `node --test scripts/verify-reference-performance.test.mjs scripts/verify-premium-external-validation.test.mjs scripts/verify-clinical-review.test.mjs`

Expected: PASS; ningún documento humano fue creado, completado, firmado ni
modificado por los tests.

- [ ] **Step 8: Commit**

```powershell
git add frontend/e2e/premium-acceptance.e2e.ts frontend/e2e/premium-routes.e2e.ts frontend/e2e/character-editor-premium.e2e.ts frontend/e2e/world-runtime.e2e.ts frontend/e2e/dialogue-hud-premium.e2e.ts frontend/e2e/audio-settings.e2e.ts frontend/e2e/premium-recovery.e2e.ts frontend/e2e/support/required-viewports.ts frontend/e2e/support/quality-gates.ts frontend/e2e/support/persist-test-artifact.ts frontend/e2e/support/persist-test-artifact.spec.ts frontend/e2e/support/premium-case-flow.ts frontend/e2e/support/premium-evidence-test.ts frontend/e2e/support/premium-evidence-test.spec.ts docs/audits/2026-07-13-premium-gameplay-evidence.md docs/quality/premium-external-validation/owner-acceptance.template.md docs/quality/premium-external-validation/nvda-review.template.md docs/quality/premium-external-validation/participant-study.schema.json scripts/run-premium-verification.mjs scripts/verify-premium-evidence-identity.mjs scripts/premium-evidence.test.mjs scripts/verify-clinical-review.mjs scripts/verify-clinical-review.test.mjs scripts/verify-premium-external-validation.mjs scripts/verify-premium-external-validation.test.mjs scripts/checkpoint-boundary.test.mjs package.json
git commit -m "test(e2e): define premium acceptance gate"
```

### Task 12: Ejecutar verificación fresca completa

**Files:**
- No tracked changes.

- [ ] **Step 1: Confirmar aislamiento antes de comandos mutantes**

Run: `git status --short --branch`

Expected: branch esperado y working tree limpio.

- [ ] **Step 2: Ejecutar la matriz completa una sola vez y capturar sus logs**

Run:

```powershell
$sha = (git rev-parse HEAD).Trim()
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-local-premium'
$runRoot = ".superpowers/evidence/$sha/$runId"
if (Test-Path -LiteralPath $runRoot) { throw "Run id already exists: $runId" }
$env:PREMIUM_RUN_ID = $runId
npm run verify:premium
if ($LASTEXITCODE -ne 0) { throw "Premium verification failed" }
```

Expected: PASS después de ejecutar, en orden, `test:scripts`, `check:backend`,
`test:backend`, `test:frontend`, `build:frontend`,
`render:visual-evidence`,
`verify:production-instrumentation`, `test:api:e2e`, Playwright completo con
`retries=0` —incluido el soak real de veinte minutos— y `test:backend:down`. El
runner imprime la ruta absoluta `<HEAD>/<runId>/premium-evidence-manifest.json`.
Cada comando de tests registra su conteo `passedTests`; un runner verde sin un
conteo parseable se considera fallo de evidencia.

- [ ] **Step 3: Verificar identidad, artefactos y secretos**

Run:

```powershell
$manifest = "$runRoot/premium-evidence-manifest.json"
node scripts/verify-premium-evidence-identity.mjs $manifest
if ($LASTEXITCODE -ne 0) { throw "Evidence identity verification failed" }
$referenceAttestation = "$runRoot/reference-hardware-attestation.json"
$soakArtifacts = @(Get-ChildItem -LiteralPath "$runRoot/playwright" -Recurse -File -Filter 'premium-performance.json')
if ($soakArtifacts.Count -ne 1) {
  throw "Se esperaba exactamente un premium-performance.json; encontrados: $($soakArtifacts.Count)"
}
$soakArtifact = $soakArtifacts[0].FullName
node scripts/verify-reference-performance.mjs `
  --manifest $manifest `
  --attestation $referenceAttestation `
  --soak $soakArtifact `
  --head $sha `
  --run-id $runId
if ($LASTEXITCODE -ne 0) {
  throw 'Hardware/performance de referencia no aprobado; solo hay evidencia diagnóstica'
}
```

Expected: PASS. El verificador exige mismo SHA, todos los comandos en cero,
SHA-256/size/mtime actuales, videos de tres rutas, screenshots, Axe completo,
soak exacto, HAR redactados y cero credencial activa, Bearer, JWT, token o
contraseña en archivos textuales. Exige además los seis artefactos nombrados
`visual-language`, `character-parity`, `motion-camera`, `dialogue-liquid-glass`,
`audio-session` y `checkpoint-recovery`, todos con el Git SHA del manifiesto; exactamente dos
runtime identities (1600×900 y 1366×768) con GPU/adapter no vacío, URL loopback
sin query y perfil `ESTUDIANTE` sin secreto. Falta o SHA distinto bloquea la
promoción.

El segundo verificador es obligatorio para denominar este corte “candidato
premium”: prueba Windows 10/11, cuatro núcleos físicos, 8 GiB, Intel UHD 620,
Chromium/Playwright, 1366×768 y el soak de veinte minutos sobre el mismo HEAD/run.
En otra máquina, la matriz automatizada puede diagnosticar el producto, pero el
gate `performanceReference` permanece `pending` y bloquea la candidatura.

- [ ] **Step 4: Revisar los gates externos sin falsear el estado**

Abrir el manifiesto y confirmar que partida del usuario, NVDA, cinco
participantes, SME y rendimiento físico de referencia siguen como `pending`
hasta que sus validadores externos pasen de verdad. El estado es
`automated-gates-passed`, nunca una nota automática; ningún validador reescribe
esos campos.

- [ ] **Step 5: Probar que el checkout no cambió**

Run: `git status --short`

Expected: vacío; `.superpowers/evidence` permanece gitignored. No crear un commit
después de esta ejecución, porque invalidaría la identidad de evidencia.

### Task 13: Handoff local previo a publicación

**Files:**
- No tracked changes.
- Create outside Git evidence: `.superpowers/external-validation/<HEAD>/<sessionId>/owner-acceptance.md`
- Create outside Git evidence: `.superpowers/external-validation/<HEAD>/<sessionId>/nvda-review.md`
- Create outside Git evidence: `.superpowers/external-validation/<HEAD>/<sessionId>/participant-study.json`
- Create outside Git evidence: `.superpowers/external-validation/<HEAD>/<sessionId>/clinical-review.md`

- [ ] **Step 1: Encender el stack de la rama**

Run: `npm run up`

Expected: frontend y backend saludables en los puertos reportados por el runner.

- [ ] **Step 2: Verificar login y caso con las credenciales demo documentadas**

Abrir la URL local, autenticar y recorrer editor → `SIM-VBG-001` → outcome. No usar un flujo distinto al que recibirá el usuario.

- [ ] **Step 3: Entregar URL y credenciales al usuario**

Informar URL exacta, cuenta demo y qué commit se está probando. Mantener servicios activos para su sesión.

- [ ] **Step 4: Recoger la evaluación continua del mismo HEAD**

Crear una sola sesión externa antes de copiar o completar cualquier instrumento;
todos los reviewers y participantes de este corte reutilizan ese mismo root:

```powershell
$finalHead = (git rev-parse HEAD).Trim()
if (git status --porcelain=v1 --untracked-files=all) {
  throw 'El checkout debe seguir limpio antes de la validación humana'
}
if (-not $env:PREMIUM_RUN_ID) {
  throw 'Reutiliza el PREMIUM_RUN_ID aprobado en Task 12'
}
$sessionId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-premium-' + ([guid]::NewGuid().ToString('N').Substring(0,8))
$validationRoot = ".superpowers/external-validation/$finalHead/$sessionId"
New-Item -ItemType Directory -Path $validationRoot | Out-Null
$ownerReview = "$validationRoot/owner-acceptance.md"
$nvdaReview = "$validationRoot/nvda-review.md"
Copy-Item -LiteralPath 'docs/quality/premium-external-validation/owner-acceptance.template.md' -Destination $ownerReview
Copy-Item -LiteralPath 'docs/quality/premium-external-validation/nvda-review.template.md' -Destination $nvdaReview
Write-Host "Sesión humana única: $validationRoot"
```

Durante la partida del usuario, conservar el stack/commit inmóvil y registrar la
sesión bajo `.superpowers/external-validation/<HEAD>/<sessionId>/`, fuera del
`runRoot` automatizado e inmutable. Copiar las plantillas tracked a
`owner-acceptance.md` y `nvda-review.md` sin cambiar sus campos/umbrales; luego
las personas humanas, no Codex, las completan.

La partida del dueño es una sola secuencia editor → advertencia → caso → outcome
sin DevTools, teletransporte, reload correctivo ni ayuda externa. Debe aprobar o
bloquear por separado arte, movimiento/control, diálogo, jugabilidad y sonido;
registrar el hash de `PremiumVisualManifestV1`; y revisar contact sheets de las
10 identidades, 11 NPC, los 14 actor mappings y screenshots
1366×768/1600×900 en las dieciséis rutas exactas del manifest, sin inconsistencias
del lenguaje pixel-art común. Ejecutar
también la lista de 20 minutos del plan de audio. Cualquier `BLOQUEADO` impide
la candidatura.

Otra persona ejecuta NVDA y recorre editor, advertencia, mundo, diálogo, ajustes,
diario y outcome con versión de NVDA/navegador, foco, nombre, estado y anuncios.
Debe dejar cero blockers y `Resultado: APROBADO`. No grabar voz o micrófono sin
consentimiento expreso. No editar el manifiesto automatizado: conservar todos
sus gates en `pending` y adjuntar por separado la validación humana fechada y
firmada.

- [ ] **Step 5: Consumir el handoff y ejecutar la revisión SME sobre `FINAL_HEAD`**

Esta revisión ocurre después de Task 12 y en el mismo checkout inmóvil. En la
misma PowerShell que conserva `PREMIUM_RUN_ID`, fijar y verificar identidad antes
de copiar la plantilla:

```powershell
$currentHead = (git rev-parse HEAD).Trim()
if ($currentHead -ne $finalHead -or (git status --porcelain=v1 --untracked-files=all)) {
  throw 'HEAD/checkout cambió desde la creación de la sesión humana'
}
$manifest = ".superpowers/evidence/$finalHead/$env:PREMIUM_RUN_ID/premium-evidence-manifest.json"
$handoffPath = '.superpowers/evidence/living-case-clinical-handoff.json'
foreach ($required in @($manifest, $handoffPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Falta recurso final: $required"
  }
}
node scripts/verify-premium-evidence-identity.mjs $manifest
if ($LASTEXITCODE -ne 0) { throw 'El manifest premium final no es válido' }

$handoff = Get-Content -LiteralPath $handoffPath -Raw | ConvertFrom-Json
if ($handoff.status -ne 'PENDING') { throw 'El handoff Phase 4 debe seguir PENDING' }
if ($handoff.requiredReviewHead -ne 'HEAD_AFTER_AUDIO_AND_CHECKPOINT') {
  throw 'El handoff no exige el HEAD final'
}
if ($handoff.finalReviewPathTemplate -ne '.superpowers/external-validation/<FINAL_HEAD>/<sessionId>/clinical-review.md') {
  throw 'Ruta final del handoff inesperada'
}
$sourceHash = (Get-FileHash -LiteralPath $handoff.protocolSource -Algorithm SHA256).Hash.ToLowerInvariant()
$copyHash = (Get-FileHash -LiteralPath $handoff.protocolCopy -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne $handoff.protocolSha256 -or $copyHash -ne $handoff.protocolSha256) {
  throw 'protocolSha256 no coincide con source/copy Phase 4'
}

$reviewPath = "$validationRoot/clinical-review.md"
Copy-Item -LiteralPath $handoff.protocolCopy -Destination $reviewPath
if ((Get-FileHash -LiteralPath $reviewPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $handoff.protocolSha256) {
  throw 'La plantilla copiada no coincide con protocolSha256'
}
Write-Host "Revisión clínica humana: $reviewPath"
```

La persona SME —no Codex— usa esa copia y sustituye todos los valores del
bloque de identidad. Debe registrar exactamente:

```text
SHA revisado: <FINAL_HEAD exacto>
Persona revisora: <nombre humano>
Rol clínico: <rol y cualificación>
Fecha y zona horaria: <ISO-8601 con offset>
Navegador y versión: <nombre y versión>
Resultado: APROBADO|BLOQUEADO
Riesgos o bloqueos: <ninguno abierto o detalle>
Evidencia visual: <rutas relativas dentro de validationRoot>
Firma: <firma/nombre de la persona revisora>
```

Con el stack y SHA sin cambios, la persona revisora recorre las tres rutas
completas (`recommended`, `repaired`, `unrepaired`) y, mediante intentos
adicionales cuando haga falta, observa las 19 opciones del catálogo del
protocolo. Añade al final del documento exactamente una línea por clave:

```text
Opción h1-noticia-sin-protocolo: APROBADA|BLOQUEADA | <observación>
Opción h1-pap-contencion: APROBADA|BLOQUEADA | <observación>
Opción h1-interrogar-victima: APROBADA|BLOQUEADA | <observación>
Opción h2-solo-459: APROBADA|BLOQUEADA | <observación>
Opción h2-459-1257: APROBADA|BLOQUEADA | <observación>
Opción h2-459-1448: APROBADA|BLOQUEADA | <observación>
Opción h3-parcial-disonancia: APROBADA|BLOQUEADA | <observación>
Opción h3-pap-epicee: APROBADA|BLOQUEADA | <observación>
Opción h3-epicee-ciclo: APROBADA|BLOQUEADA | <observación>
Opción h3-integral-psicosocial: APROBADA|BLOQUEADA | <observación>
Opción c1-mediacion-perdon: APROBADA|BLOQUEADA | <observación>
Opción c1-riesgo-proteccion-derechos: APROBADA|BLOQUEADA | <observación>
Opción c1-patrones-infancia: APROBADA|BLOQUEADA | <observación>
Opción c2-2126-1098-1257: APROBADA|BLOQUEADA | <observación>
Opción c2-1098-1257: APROBADA|BLOQUEADA | <observación>
Opción c2-eje-1448: APROBADA|BLOQUEADA | <observación>
Opción c3-parcial-clinica: APROBADA|BLOQUEADA | <observación>
Opción c3-valoracion-dependientes: APROBADA|BLOQUEADA | <observación>
Opción c3-integral-derechos: APROBADA|BLOQUEADA | <observación>
Ruta recommended: APROBADA|BLOQUEADA | <evidencia y cierre observado>
Ruta repaired: APROBADA|BLOQUEADA | <evidencia y cierre observado>
Ruta unrepaired: APROBADA|BLOQUEADA | <evidencia y cierre observado>
```

Después de la firma, ejecutar el gate documental estricto:

```powershell
node scripts/verify-clinical-review.mjs `
  --handoff $handoffPath `
  --review $reviewPath `
  --manifest $manifest `
  --head $finalHead `
  --require-approved
if ($LASTEXITCODE -ne 0) {
  throw 'Publicación y certificación bloqueadas por revisión clínica ausente o BLOQUEADA'
}
$manifestState = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($manifestState.externalGates.clinicalSme -ne 'pending') {
  throw 'La revisión externa no debe mutar el manifest automatizado'
}
if ((git rev-parse HEAD).Trim() -ne $finalHead -or (git status --porcelain=v1 --untracked-files=all)) {
  throw 'HEAD/checkout cambió durante la revisión clínica'
}
```

La ruta externa está gitignored y no se incorpora al manifest inmutable. Un
resultado `BLOQUEADO` se conserva como evidencia; obliga a corregir con un nuevo
commit y repetir Tasks 12–13 con otro HEAD/sessionId. Una firma del commit Phase
4 o de un HEAD previo nunca se reutiliza.

- [ ] **Step 6: Separar publicación, certificación y afirmación pública 9/10**

No solicitar push/merge/deploy/publicación hasta que pasen sobre el mismo
`FINAL_HEAD`: SME, hardware de referencia, owner continuo, NVDA y visual exacto.
Este plan no ejecuta ninguna operación de publicación. Validar el candidato con:

```powershell
$ownerReview = "$validationRoot/owner-acceptance.md"
$nvdaReview = "$validationRoot/nvda-review.md"
$visualManifest = 'frontend/src/assets/visual/v1/manifest.json'
$referenceAttestation = ".superpowers/evidence/$finalHead/$env:PREMIUM_RUN_ID/reference-hardware-attestation.json"
$soakArtifacts = @(Get-ChildItem -LiteralPath ".superpowers/evidence/$finalHead/$env:PREMIUM_RUN_ID/playwright" -Recurse -File -Filter 'premium-performance.json')
if ($soakArtifacts.Count -ne 1) {
  throw "Se esperaba exactamente un premium-performance.json; encontrados: $($soakArtifacts.Count)"
}
$soakArtifact = $soakArtifacts[0].FullName
node scripts/verify-reference-performance.mjs `
  --manifest $manifest `
  --attestation $referenceAttestation `
  --soak $soakArtifact `
  --head $finalHead `
  --run-id $env:PREMIUM_RUN_ID
if ($LASTEXITCODE -ne 0) { throw 'Hardware de referencia BLOQUEADO' }
node scripts/verify-premium-external-validation.mjs `
  --manifest $manifest `
  --owner $ownerReview `
  --nvda $nvdaReview `
  --visual-manifest $visualManifest `
  --reference-attestation $referenceAttestation `
  --clinical-review $reviewPath `
  --head $finalHead `
  --phase candidate
if ($LASTEXITCODE -ne 0) { throw 'Candidato premium BLOQUEADO' }
```

Solo entonces puede describirse como “candidato verificado”; el manifest
automatizado conserva sus gates humanos en `pending` porque la evidencia externa
es separada y read-only.

Para la afirmación pública mínima de 9/10, reclutar exactamente cinco personas
ajenas al proyecto. Cada una realiza una primera partida sin instrucciones
externas, completa un segmento crítico con audio silenciado, puntúa de 1 a 5
coherencia visual, fidelidad editor/simulador, control, lectura y atmósfera, y
explica con sus palabras una decisión y su consecuencia. Registrar únicamente
IDs pseudónimos, consentimiento, timestamps/duración, respuestas y evidencia
saneada conforme al schema; nada de datos personales ni grabación no consentida.

```powershell
$participantStudy = "$validationRoot/participant-study.json"
node scripts/verify-premium-external-validation.mjs `
  --manifest $manifest `
  --owner $ownerReview `
  --nvda $nvdaReview `
  --participants $participantStudy `
  --visual-manifest $visualManifest `
  --reference-attestation $referenceAttestation `
  --clinical-review $reviewPath `
  --head $finalHead `
  --phase public-9
if ($LASTEXITCODE -ne 0) {
  throw 'Afirmación pública 9/10 BLOQUEADA'
}
```

Un PASS de `public-9` demuestra únicamente el gate mínimo 9/10 aprobado por la
spec. No autoriza afirmar 10/10: esa nota queda sin reclamar hasta que exista una
rúbrica humana adicional, explícitamente aprobada, más exigente y validada sobre
otro corte exact-HEAD.

El gate vuelve a calcular los cortes: ≥4/5 sin ayuda, ≥4/5 con 4–5 en cada una
de las cinco dimensiones, ≥4/5 explicaciones correctas, mediana 15–25 minutos y
5/5 sin pérdida de información esencial en el segmento sin audio. Si falta un
participante o no se cumple cualquier corte, no se redondea ni se interpreta.

Si el usuario, SME, reviewer NVDA o una persona participante puntúa/bloquea una
dimensión, conservar el resultado negativo, registrar el defecto, añadir una
regresión, volver al plan correspondiente y generar un nuevo HEAD, run y sesión
completos. Nunca reutilizar firmas o respuestas del HEAD anterior.
