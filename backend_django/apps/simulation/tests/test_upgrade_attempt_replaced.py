"""deploy/upgrades/2026-10-01-attempt-status-replaced.sql contra Postgres real.

El script se ejecuta sin su BEGIN/COMMIT, dentro de la transacción de la
prueba (rollback al terminar), sobre filas que imitan los datos históricos:

- reemplazo con forceNew: SAFE_EXITED + SAFE_EXIT_REQUESTED «Reemplazado por
  nuevo intento» (lo único que lo distinguía de una salida segura real);
- salida segura real anterior a la pausa reanudable: SAFE_EXITED +
  SAFE_EXIT_REQUESTED con el motivo del estudiante;
- pausa real luego reemplazada: SAFE_EXITED + los dos eventos.
"""
import uuid
from pathlib import Path

import pytest
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.simulation.models import AttemptEvent, SimulationAttempt, SimulationNode

from .test_game import case_version_id, estudiante  # noqa: F401

UPGRADE = (
    Path(__file__).resolve().parents[4]
    / "deploy" / "upgrades" / "2026-10-01-attempt-status-replaced.sql"
)
REPLACEMENT_DETAIL = "Reemplazado por nuevo intento"


def _run_upgrade():
    body = "\n".join(
        line for line in UPGRADE.read_text(encoding="utf-8").splitlines()
        if line.strip().upper() not in ("BEGIN;", "COMMIT;")
    )
    with connection.cursor() as cur:
        cur.execute(body)


def _legacy_attempt(estudiante, case_version_id, *details):
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version_id=case_version_id,
        student_id=estudiante.id,
        current_node=SimulationNode.objects.filter(
            case_version_id=case_version_id, start_node=True
        ).first(),
        status="SAFE_EXITED",
        ended_at=timezone.now(),
    )
    for detail in details:
        AttemptEvent.objects.create(
            attempt=attempt, event_type="SAFE_EXIT_REQUESTED", detail=detail
        )
    return attempt


def _state(attempt):
    attempt.refresh_from_db()
    events = list(
        AttemptEvent.objects.filter(attempt_id=attempt.id).values_list("event_type", "detail")
    )
    return attempt.status, events


@pytest.fixture
def legacy(estudiante, case_version_id):
    return {
        "replaced": _legacy_attempt(estudiante, case_version_id, REPLACEMENT_DETAIL),
        "safe_exit": _legacy_attempt(estudiante, case_version_id, "Salida segura solicitada"),
        "paused_then_replaced": _legacy_attempt(
            estudiante, case_version_id, "Necesito parar", REPLACEMENT_DETAIL
        ),
    }


def test_reclasifica_los_reemplazos_y_respeta_las_salidas_seguras(legacy):
    _run_upgrade()

    assert _state(legacy["replaced"]) == (
        "REPLACED", [("ATTEMPT_REPLACED", REPLACEMENT_DETAIL)]
    )
    assert _state(legacy["safe_exit"]) == (
        "SAFE_EXITED", [("SAFE_EXIT_REQUESTED", "Salida segura solicitada")]
    )
    assert _state(legacy["paused_then_replaced"]) == (
        "REPLACED",
        [("SAFE_EXIT_REQUESTED", "Necesito parar"), ("ATTEMPT_REPLACED", REPLACEMENT_DETAIL)],
    )


def test_es_idempotente(legacy):
    _run_upgrade()
    first = {key: _state(attempt) for key, attempt in legacy.items()}

    _run_upgrade()

    assert {key: _state(attempt) for key, attempt in legacy.items()} == first


def test_el_check_admite_replaced_y_rechaza_estados_desconocidos(legacy):
    _run_upgrade()

    with pytest.raises(IntegrityError), transaction.atomic():
        SimulationAttempt.objects.filter(pk=legacy["safe_exit"].pk).update(status="ABANDONED")
