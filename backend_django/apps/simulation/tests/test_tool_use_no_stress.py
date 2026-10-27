"""Tarea 5 · Usar una herramienta no mueve ninguna cifra.

Antes cada uso sumaba o restaba estrés al intento (``TOOL_PERTINENT_STRESS_DELTA`` y
``TOOL_IMPERTINENT_STRESS_DELTA``) y la respuesta devolvía ``stressDelta``. En el modelo de respuesta
la herramienta se sigue registrando (evento, inventario, uso único) pero no mueve al intento: ni su estado, ni la
persona, ni los hitos; la respuesta no trae ``stressDelta`` y el detalle del evento no menciona estrés ni porcentajes.
"""
import pytest

from apps.simulation.models import AttemptEvent, SimulationAttempt
from apps.simulation.services import case_state, world_service

from .test_world import _move, _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RN-08")]

BASE = "/api/simulation"


def _con_pap_en_el_inventario(client, case_version_id):
    attempt_id, token = _start(client, case_version_id)
    world = client.get(
        f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token
    ).data["data"]
    _move(client, attempt_id, token, world["map"]["key"], (340, 430))
    pickup = client.post(
        f"{BASE}/attempts/{attempt_id}/interactions/tool-pap", {"attemptToken": token}, format="json"
    )
    assert pickup.status_code == 200, pickup.data
    return attempt_id, token


def _usar_pap(client, attempt_id, token, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/tools/use",
        {"attemptToken": token, "toolCode": "PAP", **extra},
        format="json",
    )


def _estado(attempt_id):
    """Lo que una herramienta no debe mover: el estado del intento, su escena, la persona y los hitos."""
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    return attempt.status, attempt.current_node_id, case_state.read(attempt)


def test_la_respuesta_de_usar_una_herramienta_no_trae_stress_delta(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)

    response = _usar_pap(c, attempt_id, token)

    assert response.status_code == 200
    assert response.data["message"] == "Herramienta usada"
    result = response.data["data"]
    assert "stressDelta" not in result
    assert set(result) == {"world", "toolCode", "targetKey", "pertinent", "feedbackMessage", "alreadyUsed"}
    assert result["toolCode"] == "PAP"
    assert result["alreadyUsed"] is False


@pytest.mark.parametrize("pertinente", [False, True])
def test_usar_una_herramienta_no_mueve_el_estado_del_intento(
    estudiante, case_version_id, monkeypatch, pertinente
):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)
    before = _estado(attempt_id)
    monkeypatch.setattr(world_service, "_evaluate_tool_pertinence", lambda *args: pertinente)

    result = _usar_pap(c, attempt_id, token).data["data"]

    assert result["pertinent"] is pertinente
    assert _estado(attempt_id) == before


def test_el_evento_de_la_herramienta_no_habla_de_estres(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)

    _usar_pap(c, attempt_id, token)

    event = AttemptEvent.objects.get(attempt_id=attempt_id, event_type="TOOL_USED")
    assert event.detail == "Herramienta usada: PAP — no pertinente"
    assert "estrés" not in event.detail and "%" not in event.detail


def test_usar_la_herramienta_sigue_contando_como_actividad(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)
    before = SimulationAttempt.objects.get(pk=attempt_id).last_activity_at

    _usar_pap(c, attempt_id, token)

    assert SimulationAttempt.objects.get(pk=attempt_id).last_activity_at > before


def test_repetir_el_mismo_uso_devuelve_lo_mismo_sin_stress_delta(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)

    first = _usar_pap(c, attempt_id, token, requestId="req-sin-estres-01")
    second = _usar_pap(c, attempt_id, token, requestId="req-sin-estres-01")

    assert first.status_code == second.status_code == 200
    assert "stressDelta" not in second.data["data"]
    assert second.data["data"]["pertinent"] == first.data["data"]["pertinent"]
    assert second.data["data"]["alreadyUsed"] is False
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="TOOL_USED").count() == 1


def test_un_uso_ya_hecho_tampoco_trae_stress_delta(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)
    _usar_pap(c, attempt_id, token)

    again = _usar_pap(c, attempt_id, token).data["data"]

    assert again["alreadyUsed"] is True
    assert "stressDelta" not in again
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="TOOL_USED").count() == 1


def test_la_repeticion_de_un_evento_antiguo_con_el_fragmento_de_estres_se_reconoce(
    estudiante, case_version_id
):
    """Un uso guardado antes de la Tarea 5 lleva «(estrés +3%)» en su detalle: repetirlo sigue funcionando."""
    c = cl(estudiante)
    attempt_id, token = _con_pap_en_el_inventario(c, case_version_id)
    _usar_pap(c, attempt_id, token, requestId="req-evento-viejo-1")
    AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="TOOL_USED").update(
        detail="Herramienta usada: PAP — no pertinente (estrés +3%)"
    )

    again = _usar_pap(c, attempt_id, token, requestId="req-evento-viejo-1")

    assert again.status_code == 200
    assert again.data["data"]["pertinent"] is False
    assert "stressDelta" not in again.data["data"]


def test_las_constantes_de_estres_de_las_herramientas_ya_no_existen():
    assert not hasattr(world_service, "TOOL_PERTINENT_STRESS_DELTA")
    assert not hasattr(world_service, "TOOL_IMPERTINENT_STRESS_DELTA")
