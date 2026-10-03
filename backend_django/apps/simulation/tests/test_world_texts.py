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
