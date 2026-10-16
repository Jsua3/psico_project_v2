"""P-13 — Observer: completar un intento emite `attempt_completed` y progresión se suscribe.

Antes, `game_service.choose_decision` importaba `apps.progression.services` y llamaba a
`record_case_completion` en línea. Ahora anuncia el hecho con una señal síncrona y la app de
progresión se suscribe. Lo que no debe cambiar: la finalización se registra dentro de la
misma transacción, una sola vez por estudiante y caso, y **nada de lo que haga un suscriptor
rompe el juego**.
"""
import ast
from pathlib import Path
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import AttemptEvent, CaseVersion, DecisionOption, SimulationAttempt
from apps.simulation.signals import attempt_completed

User = get_user_model()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_p13@x.com", password="x", nombre="Est", apellido="P13", role="ESTUDIANTE"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


@pytest.fixture
def api(estudiante, case_version_id):
    profesor = User.objects.create_user(
        email="prof_p13@x.com", password="x", nombre="Pro", apellido="P13", role="PROFESOR"
    )
    grupo = Grupo.objects.create(nombre="Grupo P13", codigo="p13-grupo", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    client = APIClient()
    client.force_authenticate(user=estudiante)
    return client


def _start(api, case_version_id):
    return api.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]


def _decide(api, state, adequate=True):
    options = state["currentNode"]["options"]
    option = next(
        (o for o in options if DecisionOption.objects.get(pk=o["id"]).classification == "ADEQUATE"),
        options[0],
    ) if adequate else options[0]
    resp = api.post(
        f"/api/simulation/attempts/{state['attemptId']}/decisions",
        {"attemptToken": state["attemptToken"], "decisionOptionId": option["id"]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    return resp.data["data"]


def _play_to_completion(api, case_version_id):
    state = _start(api, case_version_id)
    for _ in range(40):
        if state["status"] != "IN_PROGRESS":
            break
        state = _decide(api, state)
    assert state["status"] == "COMPLETED"
    return state


@pytest.fixture
def listener():
    """Se suscribe a la señal y anota, en el momento de recibirla, qué se veía en la base."""
    received = []

    def receiver(sender, attempt, **kwargs):
        received.append({
            "sender": sender,
            "attempt_id": str(attempt.id),
            "status": attempt.status,
            "event_saved": AttemptEvent.objects.filter(
                attempt_id=attempt.id, event_type="ATTEMPT_COMPLETED"
            ).exists(),
        })

    attempt_completed.connect(receiver, weak=False, dispatch_uid="test-p13-listener")
    yield received
    attempt_completed.disconnect(dispatch_uid="test-p13-listener")


def test_completar_un_intento_emite_la_senal_una_vez_con_el_evento_ya_guardado(api, case_version_id, listener):
    state = _play_to_completion(api, case_version_id)

    assert len(listener) == 1
    assert listener[0]["attempt_id"] == state["attemptId"]
    assert listener[0]["sender"] is SimulationAttempt
    assert listener[0]["status"] == "COMPLETED"
    assert listener[0]["event_saved"] is True


def test_una_decision_que_no_completa_no_emite_la_senal(api, case_version_id, listener):
    state = _start(api, case_version_id)

    after = _decide(api, state)

    assert after["status"] == "IN_PROGRESS"
    assert listener == []


def test_la_salida_segura_no_emite_la_senal(api, case_version_id, listener):
    state = _start(api, case_version_id)

    api.post(
        f"/api/simulation/attempts/{state['attemptId']}/safe-exit",
        {"attemptToken": state["attemptToken"], "reason": "pausa"},
        format="json",
    )

    assert listener == []


def test_un_suscriptor_que_falla_no_rompe_la_decision_ni_el_registro_de_la_finalizacion(
    api, estudiante, case_version_id
):
    def explota(sender, attempt, **kwargs):
        raise RuntimeError("un suscriptor roto")

    attempt_completed.connect(explota, weak=False, dispatch_uid="test-p13-explota")
    try:
        state = _play_to_completion(api, case_version_id)
    finally:
        attempt_completed.disconnect(dispatch_uid="test-p13-explota")

    case_id = CaseVersion.objects.get(pk=case_version_id).simulation_case_id
    assert state["status"] == "COMPLETED"
    assert StudentCaseCompletion.objects.filter(student_id=estudiante.id, simulation_case_id=case_id).count() == 1


def test_un_fallo_al_registrar_la_finalizacion_no_rompe_el_juego(api, case_version_id):
    class Roto:
        class objects:
            @staticmethod
            def get_or_create(**kwargs):
                raise RuntimeError("la base de progresión no responde")

    with patch("apps.progression.services.StudentCaseCompletion", Roto):
        state = _play_to_completion(api, case_version_id)

    assert state["status"] == "COMPLETED"


def test_la_finalizacion_se_registra_una_sola_vez_por_estudiante_y_caso(api, estudiante, case_version_id):
    _play_to_completion(api, case_version_id)
    _play_to_completion(api, case_version_id)

    case_id = CaseVersion.objects.get(pk=case_version_id).simulation_case_id
    assert StudentCaseCompletion.objects.filter(student_id=estudiante.id, simulation_case_id=case_id).count() == 1


def test_progresion_esta_suscrita_a_la_senal(estudiante, case_version_id):
    """El suscriptor lee del intento solo `student_id` y `case_version.simulation_case_id`."""
    case_id = CaseVersion.objects.get(pk=case_version_id).simulation_case_id

    class Intento:
        id = 0
        student_id = estudiante.id

        class case_version:
            simulation_case_id = case_id

    attempt_completed.send(sender=SimulationAttempt, attempt=Intento())

    assert StudentCaseCompletion.objects.filter(student_id=estudiante.id, simulation_case_id=case_id).count() == 1


def test_el_servicio_del_juego_ya_no_importa_la_app_de_progresion():
    source = Path(__file__).resolve().parents[1] / "services" / "game_service.py"
    imported = set()
    for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)

    assert not {name for name in imported if name.startswith("apps.progression")}
