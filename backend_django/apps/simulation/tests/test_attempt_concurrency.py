"""E1-3 · Cerrojo e idempotencia de las órdenes del intento (RNF-08, TD-04, Review Focus 1).

Hoy un doble clic sobre una opción riesgosa cuenta como la «segunda oportunidad» y la
aplica. Con ``@locked_attempt`` (``SELECT … FOR UPDATE`` de la fila del intento) y un
``requestId`` por orden, la misma orden dos veces deja **un** evento y la **misma**
respuesta; sin ``requestId``, la misma decisión dentro de 2 s es un duplicado.
"""
import json
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.grupos.models import Grupo, GrupoCaseVersion, GrupoEstudiante
from apps.simulation.models import (
    AttemptEvent,
    CaseVersion,
    DecisionOption,
    ReflectionJournal,
    SimulationAttempt,
)
from apps.simulation.models.rubric import AuditLog
from apps.simulation.services import case_effects, game_service
from shared.testing import measure, run_concurrently

from .test_world import _move, _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RNF-08"), pytest.mark.req("TD-04")]

BASE = "/api/simulation"
User = get_user_model()
RETRY = case_effects.RETRY_EVENT_TYPES
REGISTERED = case_effects.REGISTERED_DECISION_EVENT_TYPES


def _decide(client, attempt_id, token, option_id, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id, **extra},
        format="json",
    )


def _option(node_id, *classifications):
    return DecisionOption.objects.filter(
        source_node_id=node_id, classification__in=classifications
    ).order_by("id").first()


def _events(attempt_id, *types):
    return list(AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=types))


def _begin(client, case_version_id):
    data = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    return data["attemptId"], data["attemptToken"], data["currentNode"]


# ── secuencial: misma orden dos veces ────────────────────────────────────────
def test_la_misma_decision_con_el_mismo_request_id_deja_un_evento_y_la_misma_respuesta(
    estudiante, case_version_id
):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    good = _option(node["id"], "ADEQUATE")

    first = _decide(c, attempt_id, token, good.id, requestId="req-decision-0001")
    second = _decide(c, attempt_id, token, good.id, requestId="req-decision-0001")

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"]
    assert len(_events(attempt_id, *REGISTERED)) == 1
    assert len(_events(attempt_id, "NODE_ENTERED")) == 2  # nodo inicial + destino, una sola vez


def test_un_doble_clic_sobre_una_opcion_riesgosa_no_gasta_la_segunda_oportunidad(
    estudiante, case_version_id, monkeypatch
):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    bad = _option(node["id"], "RISKY", "INADEQUATE")

    first = _decide(c, attempt_id, token, bad.id)
    second = _decide(c, attempt_id, token, bad.id)  # el segundo clic, sin requestId, dentro de 2 s

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"]
    assert first.data["data"]["feedback"]["retryRequired"] is True
    assert first.data["data"]["currentNode"]["key"] == node["key"]
    assert len(_events(attempt_id, *RETRY)) == 1
    assert _events(attempt_id, *REGISTERED) == []

    # Pasada la ventana, el mismo clic ya es una respuesta nueva: la segunda oportunidad se gasta.
    real_now = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=5))
    third = _decide(c, attempt_id, token, bad.id)

    assert third.status_code == 200
    assert third.data["data"]["feedback"]["retryRequired"] is False
    assert third.data["data"]["currentNode"]["key"] != node["key"]
    assert len(_events(attempt_id, *REGISTERED)) == 1


def test_un_doble_clic_con_un_request_id_por_clic_tampoco_gasta_la_segunda_oportunidad(
    estudiante, case_version_id
):
    """Un cliente que genera un id por invocación del manejador manda dos ids en un doble clic."""
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    bad = _option(node["id"], "RISKY", "INADEQUATE")

    first = _decide(c, attempt_id, token, bad.id, requestId="req-primer-clic-01")
    second = _decide(c, attempt_id, token, bad.id, requestId="req-segundo-clic-2")

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"]
    assert first.data["data"]["feedback"]["retryRequired"] is True
    assert len(_events(attempt_id, *RETRY)) == 1
    assert _events(attempt_id, *REGISTERED) == []


def test_con_request_id_distintos_y_pasada_la_ventana_la_respuesta_es_deliberada(
    estudiante, case_version_id, monkeypatch
):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    bad = _option(node["id"], "RISKY", "INADEQUATE")

    first = _decide(c, attempt_id, token, bad.id, requestId="req-primera-resp")
    real_now = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=5))
    second = _decide(c, attempt_id, token, bad.id, requestId="req-segunda-resp")

    assert first.data["data"]["feedback"]["retryRequired"] is True
    assert second.data["data"]["feedback"]["retryRequired"] is False
    assert second.data["data"]["currentNode"]["key"] != node["key"]


def test_un_request_id_reutilizado_con_otra_opcion_responde_409(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    good = _option(node["id"], "ADEQUATE")
    other = _option(node["id"], "RISKY", "INADEQUATE")
    _decide(c, attempt_id, token, good.id, requestId="req-reutilizado")

    response = _decide(c, attempt_id, token, other.id, requestId="req-reutilizado")

    assert response.status_code == 409
    assert response.data["code"] == "REQUEST_ID_REUSED"


@pytest.mark.parametrize("bad_id", ["x", "con espacios y más", "a" * 65, "emoji-😀-id-largo"])
def test_un_request_id_mal_formado_responde_400(estudiante, case_version_id, bad_id):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    good = _option(node["id"], "ADEQUATE")

    response = _decide(c, attempt_id, token, good.id, requestId=bad_id)

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert _events(attempt_id, *REGISTERED) == []


def test_una_orden_mutante_toma_el_cerrojo_de_la_fila_del_intento(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    good = _option(node["id"], "ADEQUATE")

    _, cost = measure(lambda: _decide(c, attempt_id, token, good.id))

    assert any("FOR UPDATE" in statement.upper() for statement in cost.statements)


# ── herramienta y bitácora ───────────────────────────────────────────────────
def test_usar_la_herramienta_con_el_mismo_request_id_deja_un_evento_y_la_misma_respuesta(
    estudiante, case_version_id
):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = c.get(f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    _move(c, attempt_id, token, world["map"]["key"], (340, 430))
    c.post(f"{BASE}/attempts/{attempt_id}/interactions/tool-pap", {"attemptToken": token}, format="json")
    body = {"attemptToken": token, "toolCode": "PAP", "requestId": "req-herramienta-01"}

    first = c.post(f"{BASE}/attempts/{attempt_id}/tools/use", body, format="json")
    second = c.post(f"{BASE}/attempts/{attempt_id}/tools/use", body, format="json")

    assert first.status_code == second.status_code == 200
    assert first.data["data"]["stressDelta"] == 3
    assert second.data["data"]["stressDelta"] == first.data["data"]["stressDelta"]
    assert second.data["data"]["alreadyUsed"] is False
    assert second.data["data"]["pertinent"] == first.data["data"]["pertinent"]
    assert len(_events(attempt_id, "TOOL_USED")) == 1
    assert SimulationAttempt.objects.get(pk=attempt_id).stress_index == 3


def test_guardar_la_bitacora_con_el_mismo_request_id_deja_un_evento_y_la_misma_respuesta(
    estudiante, case_version_id
):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    body = {"attemptToken": token, "nodeId": node["id"], "text": "Mi nota", "requestId": "req-bitacora-01"}

    first = c.post(f"{BASE}/attempts/{attempt_id}/reflections", body, format="json")
    second = c.post(f"{BASE}/attempts/{attempt_id}/reflections", body, format="json")

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"] == {"nodeId": node["id"], "locked": False}
    assert len(_events(attempt_id, "REFLECTION_SAVED")) == 1
    assert ReflectionJournal.objects.filter(attempt_id=attempt_id).count() == 1


# ── hilos con commits reales ─────────────────────────────────────────────────
@pytest.fixture
def committed_attempt(real_commits):
    """Estudiante, grupo y un intento ya iniciado, con commits reales; se limpia al terminar."""
    suffix = uuid.uuid4().hex[:8]
    profesor = User.objects.get(email="profesora@psychosim.edu.co")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    student = User.objects.create_user(
        email=f"hilos_{suffix}@x.com", password="pass1234", nombre="Hilos", apellido="Intento", role="ESTUDIANTE"
    )
    grupo = Grupo.objects.create(nombre=f"Hilos {suffix}", codigo=f"HI-{suffix}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=student, status="ACTIVE")
    GrupoCaseVersion.objects.create(grupo=grupo, case_version=version)
    started = timezone.now()
    state = game_service.start_attempt(version.id, student)
    try:
        yield SimpleNamespace(
            student=student,
            attempt_id=state["attemptId"],
            token=state["attemptToken"],
            node=state["currentNode"],
        )
    finally:
        SimulationAttempt.objects.filter(student_id=student.id).delete()
        GrupoCaseVersion.objects.filter(grupo=grupo).delete()
        GrupoEstudiante.objects.filter(grupo=grupo).delete()
        grupo.delete()
        AuditLog.objects.filter(occurred_at__gte=started).delete()
        student.delete()


def test_dos_hilos_con_la_misma_decision_riesgosa_registran_un_solo_reintento(committed_attempt):
    a = committed_attempt
    bad = _option(a.node["id"], "RISKY", "INADEQUATE")

    def decide():
        return game_service.choose_decision(a.attempt_id, a.token, bad.id, a.student)

    outcomes = run_concurrently(decide, decide)

    assert [o.error for o in outcomes] == [None, None]
    assert [o.value["feedback"]["retryRequired"] for o in outcomes] == [True, True]
    assert len(_events(a.attempt_id, *RETRY)) == 1
    assert _events(a.attempt_id, *REGISTERED) == []
    assert SimulationAttempt.objects.get(pk=a.attempt_id).current_node_id == a.node["id"]


def test_dos_hilos_con_el_mismo_request_id_registran_una_sola_decision(committed_attempt):
    a = committed_attempt
    good = _option(a.node["id"], "ADEQUATE")

    def decide():
        return game_service.choose_decision(
            a.attempt_id, a.token, good.id, a.student, request_id="req-hilos-mismo-id"
        )

    outcomes = run_concurrently(decide, decide)

    assert [o.error for o in outcomes] == [None, None]
    assert outcomes[0].value["accumulatedScore"] == outcomes[1].value["accumulatedScore"] == good.score_delta
    assert len(_events(a.attempt_id, *REGISTERED)) == 1


def test_dos_pestanas_con_la_misma_decision_avanzan_una_sola_vez(committed_attempt):
    """Dos clientes (request_id distintos) eligen la misma opción a la vez: avanza una sola vez y
    ambos reciben la misma respuesta (la segunda se trata como un duplicado, no como un error)."""
    a = committed_attempt
    good = _option(a.node["id"], "ADEQUATE")

    def decide(request_id):
        return lambda: game_service.choose_decision(
            a.attempt_id, a.token, good.id, a.student, request_id=request_id
        )

    outcomes = run_concurrently(decide("req-pestana-uno-1"), decide("req-pestana-dos-2"))

    assert [o.error for o in outcomes] == [None, None]
    assert outcomes[0].value["currentNode"]["id"] == outcomes[1].value["currentNode"]["id"] == good.target_node_id
    assert len(_events(a.attempt_id, *REGISTERED)) == 1
    attempt = SimulationAttempt.objects.get(pk=a.attempt_id)
    assert attempt.accumulated_score == good.score_delta  # los efectos se aplicaron una sola vez
    assert attempt.current_node_id == good.target_node_id


def test_dos_decisiones_distintas_a_la_vez_desde_el_mismo_nodo_se_serializan(committed_attempt):
    """Con el cerrojo, la segunda orden lee el estado que dejó la primera: una opción que ya no
    está disponible desde la escena actual se rechaza (sin cerrojo, ambas avanzarían)."""
    a = committed_attempt
    options = list(DecisionOption.objects.filter(source_node_id=a.node["id"], classification="ADEQUATE")[:1])
    other = DecisionOption.objects.filter(source_node_id=a.node["id"]).exclude(pk=options[0].pk).first()
    # Se aplana el reintento: sin segunda oportunidad la otra opción también avanza el intento.
    CaseVersion.objects.filter(pk=SimulationAttempt.objects.get(pk=a.attempt_id).case_version_id).update(
        rules=json.dumps({"secondChance": False})
    )

    def decide(option):
        return lambda: game_service.choose_decision(
            a.attempt_id, a.token, option.id, a.student, request_id=f"req-dist-{option.id:05d}"
        )

    try:
        outcomes = run_concurrently(decide(options[0]), decide(other))

        winners = [o for o in outcomes if o.error is None]
        losers = [o for o in outcomes if o.error is not None]
        assert len(winners) == 1 and len(losers) == 1
        assert isinstance(losers[0].error, ValidationError)
        assert len(_events(a.attempt_id, *REGISTERED)) == 1
    finally:
        CaseVersion.objects.filter(pk=SimulationAttempt.objects.get(pk=a.attempt_id).case_version_id).update(
            rules=json.dumps({"secondChance": True})
        )
