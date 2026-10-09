"""T11.3 — textos visibles del mundo con tildes (límite 7: español correcto).

El feedback de herramienta y el detalle del evento TOOL_USED llegan al jugador y
al docente; no pueden salir sin tildes ("intervencion", "mas apropiado").
"""
import re

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import AttemptEvent, ClinicalTool
from apps.simulation.services import world_service

from .test_world import _assign_case_to_student, _start, case_version_id, cl, estudiante  # noqa: F401
from .test_world_authority import _move, _pickup_pap, _world

User = get_user_model()

#: Palabras de los mensajes del mundo que NUNCA deben aparecer sin tilde.
UNACCENTED = re.compile(
    r"\b(estres|intervencion|etica|etico|mas apropiado|situacion|que herramienta)\b",
    re.IGNORECASE,
)


@pytest.mark.parametrize("pertinent", [True, False])
@pytest.mark.parametrize("target_key", [None, "familia-crisis"])
def test_feedback_de_herramienta_lleva_tildes(pertinent, target_key):
    tool = ClinicalTool(tool_code="PAP", label="Primeros auxilios psicológicos")

    message = world_service._generate_tool_feedback(tool, target_key, pertinent)

    assert not UNACCENTED.search(message), message
    if pertinent:
        assert "intervención profesional y ética" in message
    else:
        assert "más apropiado" in message
        assert "qué herramienta" in message
        assert "situación actual" in message


def test_evento_de_herramienta_dice_estres_con_tilde(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _pickup_pap(c, attempt_id, token, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "familia-crisis"},
        format="json",
    )

    assert resp.status_code == 200
    assert not UNACCENTED.search(resp.data["data"]["feedbackMessage"])
    detail = AttemptEvent.objects.get(attempt_id=attempt_id, event_type="TOOL_USED").detail
    assert "(estrés -5%)" in detail
    assert not UNACCENTED.search(detail), detail


def test_linea_de_tiempo_del_estudiante_no_muestra_claves_internas(estudiante, case_version_id):
    """L-08: «PAP sobre familia-crisis» es un identificador interno; el estudiante lee nombres."""
    from apps.simulation.models import SimulationAttempt as Attempt
    from apps.simulation.serializers import game_dtos

    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _pickup_pap(c, attempt_id, token, world["map"]["key"])
    _move(c, attempt_id, token, 250, 430, world["map"]["key"])
    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP", "targetInteractionKey": "familia-crisis"},
        format="json",
    )
    assert resp.status_code == 200

    attempt = Attempt.objects.get(pk=attempt_id)
    events = list(AttemptEvent.objects.filter(attempt_id=attempt_id).order_by("occurred_at", "id"))
    labels = [row["label"] for row in game_dtos.build_timeline(attempt, events) if row["type"] == "TOOL_USED"]

    assert labels, "el evento de herramienta debe aparecer en la línea de tiempo"
    label = labels[0]
    assert label.startswith("Herramienta aplicada: ")
    assert "familia-crisis" not in label and "PAP" not in label and "@" not in label, label
    assert "Familia en crisis" in label
    assert label.endswith("pertinente")
