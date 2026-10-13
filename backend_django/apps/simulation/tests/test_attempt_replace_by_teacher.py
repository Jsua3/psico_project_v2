"""E1-2 · Reemplazar un intento es una acción docente (RN-07, D-11 en su parte).

``POST /api/instructor/attempts/{id}/replace`` con ``reason`` obligatorio: el
estudiante nunca reemplaza al abierto (E1-1); un docente de **sus** estudiantes o
el ADMIN sí, con motivo, bitácora bloqueada y rastro de auditoría.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model

from apps.grupos.models import Grupo
from apps.simulation.models import AttemptEvent, AuditLog, ReflectionJournal, SimulationAttempt

from .test_game import (  # noqa: F401  (fixtures de pytest)
    assign_case_to_student,
    attempt_headers,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = [pytest.mark.req("RN-07"), pytest.mark.usefixtures("fetch_raise")]

BASE = "/api/simulation"
User = get_user_model()


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_replace@x.com", password="pass1234", nombre="Pro", apellido="Replace", role="PROFESOR"
    )


@pytest.fixture
def profesor_ajeno(db):
    return User.objects.create_user(
        email="prof_ajeno@x.com", password="pass1234", nombre="Pro", apellido="Ajeno", role="PROFESOR"
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_replace@x.com", password="pass1234", nombre="Ad", apellido="Replace", role="ADMIN"
    )


@pytest.fixture
def abierto(estudiante, profesor, case_version_id):
    """Un intento en juego del estudiante cuyo grupo pertenece a ``profesor``."""
    grupo = assign_case_to_student(estudiante, case_version_id, "REPL-1")
    Grupo.objects.filter(pk=grupo.pk).update(profesor=profesor)
    data = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    return data


def _replace(client, attempt, **body):
    return client.post(f"/api/instructor/attempts/{attempt['attemptId']}/replace", body, format="json")


def test_el_estudiante_no_puede_reemplazar(estudiante, abierto):
    response = _replace(cl(estudiante), abierto, reason="quiero otro")

    assert response.status_code == 403
    assert response.data["code"] == "FORBIDDEN"
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).status == "IN_PROGRESS"


def test_un_profesor_ajeno_no_puede_reemplazar(profesor_ajeno, abierto):
    response = _replace(cl(profesor_ajeno), abierto, reason="no es mío")

    assert response.status_code == 403
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).status == "IN_PROGRESS"


def test_el_profesor_del_estudiante_reemplaza_con_motivo(estudiante, profesor, abierto):
    client = cl(estudiante)
    client.post(
        f"{BASE}/attempts/{abierto['attemptId']}/reflections",
        {"attemptToken": abierto["attemptToken"], "nodeId": abierto["currentNode"]["id"], "text": "mi nota"},
        format="json",
    )

    response = _replace(cl(profesor), abierto, reason="  El estudiante pidió empezar de nuevo  ")

    assert response.status_code == 200
    body = response.data["data"]
    assert body["attemptId"] == abierto["attemptId"]
    assert body["status"] == "REPLACED"
    assert body["reason"] == "El estudiante pidió empezar de nuevo"
    attempt = SimulationAttempt.objects.get(pk=abierto["attemptId"])
    assert attempt.status == "REPLACED"
    assert attempt.replace_reason == "El estudiante pidió empezar de nuevo"
    assert attempt.replaced_by_id == profesor.id
    assert attempt.ended_at is not None and attempt.locked_at is not None
    event = AttemptEvent.objects.get(attempt_id=attempt.id, event_type="ATTEMPT_REPLACED")
    assert event.detail == "El estudiante pidió empezar de nuevo"
    assert ReflectionJournal.objects.get(attempt_id=attempt.id).locked is True
    audit = AuditLog.objects.filter(action="ATTEMPT_REPLACED", resource_id=str(attempt.id))
    assert audit.count() == 1
    assert audit.get().actor_id == profesor.id


def test_el_admin_reemplaza(admin, abierto):
    response = _replace(cl(admin), abierto, reason="revisión del ADMIN")

    assert response.status_code == 200
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).replaced_by_id == admin.id


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "   "}, {"reason": "x" * 501}])
def test_sin_motivo_valido_responde_400(profesor, abierto, body):
    response = _replace(cl(profesor), abierto, **body)

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).status == "IN_PROGRESS"


def test_un_intento_cerrado_responde_409(profesor, abierto):
    SimulationAttempt.objects.filter(pk=abierto["attemptId"]).update(status="COMPLETED")

    response = _replace(cl(profesor), abierto, reason="ya terminó")

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_NOT_OPEN"


def test_un_intento_pausado_tambien_se_reemplaza(estudiante, profesor, abierto):
    cl(estudiante).post(
        f"{BASE}/attempts/{abierto['attemptId']}/safe-exit",
        {"attemptToken": abierto["attemptToken"], "reason": "pausa"}, format="json",
    )

    response = _replace(cl(profesor), abierto, reason="pausado hace días")

    assert response.status_code == 200
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).status == "REPLACED"


def test_intento_inexistente_responde_404(profesor):
    response = cl(profesor).post(
        f"/api/instructor/attempts/{uuid.uuid4()}/replace", {"reason": "x"}, format="json"
    )

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


def test_tras_reemplazar_el_estudiante_inicia_otro_y_el_viejo_no_se_toca(
    estudiante, profesor, abierto, case_version_id
):
    _replace(cl(profesor), abierto, reason="empezar de nuevo")

    fresh = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]

    assert fresh["attemptId"] != abierto["attemptId"]
    assert fresh["resumed"] is False
    assert SimulationAttempt.objects.get(pk=abierto["attemptId"]).status == "REPLACED"


def test_el_reemplazo_del_propio_estudiante_por_force_new_deja_quien_y_por_que(
    settings, estudiante, case_version_id
):
    settings.ATTEMPT_START_STRICT = False
    assign_case_to_student(estudiante, case_version_id, "REPL-2")
    client = cl(estudiante)
    old = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]

    client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json")

    attempt = SimulationAttempt.objects.get(pk=old["attemptId"])
    assert attempt.status == "REPLACED"
    assert attempt.replaced_by_id == estudiante.id
    assert attempt.replace_reason == "Reemplazado por nuevo intento"
