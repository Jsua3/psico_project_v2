"""E1-10 · Reporte de un estudiante (C3, RF-26, CU-15) y CSV seguro (D-8, D-13).

``GET /api/reportes/estudiante/{id}?caseVersionId=``: los intentos de un estudiante con su
tiempo activo y de reloj, el ordinal y un ``coverage {shown, total}`` («Mostrando X de N»).
El docente solo lee estudiantes de **sus** grupos activos; el ADMIN, cualquiera. El CSV de
grupo neutraliza las celdas que un programa de hojas de cálculo ejecutaría como fórmula.
"""
import csv
import io
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.grupos.models import Grupo
from apps.simulation.models import SimulationAttempt, SimulationNode

from .test_reportes import (  # noqa: F401  (fixtures y ayudantes de pytest)
    _add_student, _assign_case, _grupo, case_version_id, cl, estudiante, profesor,
)

pytestmark = [
    pytest.mark.req("RF-26"),
    pytest.mark.req("CU-15"),
    pytest.mark.usefixtures("fetch_raise"),  # DJA-7: un acceso perezoso accidental lanza
]

User = get_user_model()


def _usuario(role, nombre, apellido="Rep"):
    return User.objects.create_user(
        email=f"{role.lower()}_{uuid.uuid4().hex[:8]}@x.com", password="pass1234",
        nombre=nombre, apellido=apellido, role=role,
    )


@pytest.fixture
def admin(db):
    return _usuario("ADMIN", "Admin")


@pytest.fixture
def otro_profesor(db):
    return _usuario("PROFESOR", "Otro")


def _attempt(estudiante, case_version_id, status, started_at, active=0.0, ended_after=None):
    attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version_id=case_version_id,
        student_id=estudiante.id,
        current_node=SimulationNode.objects.filter(case_version_id=case_version_id, start_node=True).first(),
        status=status,
        active_seconds=active,
        ended_at=started_at + timedelta(seconds=ended_after) if ended_after is not None else None,
    )
    SimulationAttempt.objects.filter(pk=attempt.pk).update(started_at=started_at)
    return attempt


def _report(client, estudiante, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get(f"/api/reportes/estudiante/{estudiante.id}" + (f"?{query}" if query else ""))


@pytest.fixture
def con_intentos(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    base = timezone.now() - timedelta(days=3)
    first = _attempt(estudiante, case_version_id, "COMPLETED", base, active=120.4, ended_after=300)
    second = _attempt(estudiante, case_version_id, "PAUSED", base + timedelta(days=1), active=45.0)
    return grupo, first, second


def test_el_profesor_del_estudiante_lee_sus_intentos_con_tiempos_y_cobertura(
    profesor, estudiante, case_version_id, con_intentos
):
    response = _report(cl(profesor), estudiante)

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["student"] == {"ref": f"Estudiante-{estudiante.id}", "displayName": "Est Rep"}
    assert data["coverage"] == {"shown": 2, "total": 2}
    newest, oldest = data["attempts"]  # los más recientes primero
    assert (oldest["status"], oldest["ordinal"], oldest["activeSeconds"], oldest["clockSeconds"]) == (
        "COMPLETED", 1, 120, 300
    )
    assert (newest["status"], newest["ordinal"], newest["activeSeconds"], newest["clockSeconds"]) == (
        "PAUSED", 2, 45, None
    )
    assert set(oldest) == {
        "attemptId", "caseVersionId", "caseTitle", "status", "startedAt", "activeSeconds", "clockSeconds", "ordinal",
    }
    assert oldest["caseVersionId"] == case_version_id


def test_un_profesor_ajeno_no_lee_al_estudiante(otro_profesor, estudiante, con_intentos):
    assert _report(cl(otro_profesor), estudiante).status_code == 403


def test_un_grupo_inactivo_no_da_acceso(profesor, estudiante, con_intentos):
    grupo, _, _ = con_intentos
    Grupo.objects.filter(pk=grupo.pk).update(activo=False)

    response = _report(cl(profesor), estudiante)

    assert response.status_code == 403  # D-13: el reporte exige grupo activo


def test_el_admin_lee_a_cualquier_estudiante(admin, estudiante, con_intentos):
    response = _report(cl(admin), estudiante)

    assert response.status_code == 200
    assert response.data["data"]["coverage"]["total"] == 2


def test_un_estudiante_no_lee_reportes_de_otros_ni_el_suyo(estudiante, con_intentos):
    assert _report(cl(estudiante), estudiante).status_code == 403


def test_el_filtro_por_version_y_el_limite_acotan_lo_mostrado(profesor, estudiante, case_version_id, con_intentos):
    client = cl(profesor)

    limited = _report(client, estudiante, limit=1).data["data"]
    other_version = _report(client, estudiante, caseVersionId=case_version_id + 999).data["data"]

    assert limited["coverage"] == {"shown": 1, "total": 2}
    assert limited["attempts"][0]["status"] == "PAUSED"
    assert other_version["attempts"] == []
    assert other_version["coverage"] == {"shown": 0, "total": 0}


def test_un_estudiante_inexistente_responde_404(profesor):
    response = cl(profesor).get("/api/reportes/estudiante/999999")

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


def test_un_usuario_que_no_es_estudiante_responde_404(profesor, otro_profesor):
    response = cl(profesor).get(f"/api/reportes/estudiante/{otro_profesor.id}")

    assert response.status_code == 404


# ── CSV seguro (D-8) ─────────────────────────────────────────────────────────
def _csv_rows(profesor, grupo, case_version_id):
    response = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv;charset=UTF-8"
    return list(csv.reader(io.StringIO(response.content.decode("utf-8"))))


def test_el_csv_neutraliza_las_formulas_y_no_altera_los_numeros(profesor, case_version_id):
    grupo = _grupo(profesor)
    hostil = _usuario("ESTUDIANTE", '=HYPERLINK("http://x","clic")', apellido="+cmd")
    coma = _usuario("ESTUDIANTE", "Ana, la \"mejor\"", apellido="Pérez")
    for student in (hostil, coma):
        _add_student(grupo, student)
    _assign_case(grupo, case_version_id)
    _attempt(hostil, case_version_id, "COMPLETED", timezone.now(), ended_after=10)
    SimulationAttempt.objects.filter(student_id=hostil.id).update(accumulated_score=-15)

    rows = _csv_rows(profesor, grupo, case_version_id)

    names = {row[0] for row in rows[1:]}
    assert "'=HYPERLINK(\"http://x\",\"clic\") +cmd" in names  # neutralizada: empieza con '
    assert 'Ana, la "mejor" Pérez' in names  # el csv.reader la devuelve íntegra: iba entrecomillada
    hostile_row = next(row for row in rows[1:] if row[0].startswith("'="))
    assert hostile_row[5] == "-15.0"  # un número negativo NO se toca
    assert len(rows[0]) == len(hostile_row) == 12


def test_el_csv_declara_utf_8_y_conserva_el_encabezado(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)

    response = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}")

    assert response["Content-Type"] == "text/csv;charset=UTF-8"
    assert response.content.decode("utf-8").split("\n")[0] == (
        "Estudiante,Intentos,Completados,En progreso,Salida segura,Puntaje prom.,"
        "Adecuadas,Riesgosas,Inadecuadas,Bitacoras,Rubricas,Estado"
    )
