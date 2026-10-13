"""Alcance por docente en reportes (ola 0 del contraste PN3: D-1, D-2 y D-3).

RF-25: «El profesor debe poder revisar las respuestas, el recorrido, los tiempos y los
resultados de **sus** estudiantes». El reporte de grupo (y su CSV), el tablero y el reporte
de un intento solo exigían ser PROFESOR: cualquier docente leía nombres y puntajes de
estudiantes de otro. Los endpoints de `/api/instructor/*` ya limitaban al profesor a sus
grupos; estas pruebas fijan lo mismo aquí. El ADMIN conserva el alcance global.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model

from .test_reportes import (  # noqa: F401
    _add_student, _assign_case, _closed_attempt, _grupo, case_version_id, cl, estudiante, profesor,
)

pytestmark = pytest.mark.usefixtures("fetch_raise")  # DJA-7: un acceso perezoso accidental lanza

User = get_user_model()
DASHBOARD = "/api/reportes/dashboard"


def _usuario(role, nombre):
    return User.objects.create_user(
        email=f"{role.lower()}_{uuid.uuid4().hex[:8]}@x.com",
        password="pass1234",
        nombre=nombre,
        apellido="Alcance",
        role=role,
    )


@pytest.fixture
def otro_profesor(db):
    return _usuario("PROFESOR", "Otro")


@pytest.fixture
def admin(db):
    return _usuario("ADMIN", "Admin")


@pytest.fixture
def ajeno(db):
    """Estudiante que no pertenece a ningún grupo de `profesor`."""
    return _usuario("ESTUDIANTE", "Ajeno")


# --- reporte de grupo y CSV --------------------------------------------------
def test_un_profesor_no_lee_el_reporte_de_un_grupo_ajeno(profesor, otro_profesor, estudiante, case_version_id):
    grupo = _grupo(otro_profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)

    resp = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}")

    assert resp.status_code == 403


def test_un_profesor_no_exporta_el_csv_de_un_grupo_ajeno(profesor, otro_profesor, estudiante, case_version_id):
    grupo = _grupo(otro_profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)

    resp = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}")

    assert resp.status_code == 403


def test_el_admin_lee_el_reporte_y_el_csv_de_cualquier_grupo(admin, otro_profesor, estudiante, case_version_id):
    grupo = _grupo(otro_profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)

    assert cl(admin).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").status_code == 200
    assert cl(admin).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}").status_code == 200


def test_un_grupo_inexistente_sigue_siendo_404_para_el_profesor(profesor):
    assert cl(profesor).get("/api/reportes/grupo/99999999").status_code == 404


# --- tablero ----------------------------------------------------------------
def test_el_tablero_del_profesor_solo_cuenta_a_sus_estudiantes(
    profesor, otro_profesor, estudiante, ajeno, case_version_id
):
    _add_student(_grupo(profesor), estudiante)
    _add_student(_grupo(otro_profesor), ajeno)
    before = cl(profesor).get(DASHBOARD).data["data"]

    _closed_attempt(estudiante, case_version_id, "COMPLETED")
    _closed_attempt(ajeno, case_version_id, "COMPLETED")

    after = cl(profesor).get(DASHBOARD).data["data"]
    assert after["simulacionesCompletadas"] - before["simulacionesCompletadas"] == 1
    assert after["simulacionesCompletadasHoy"] - before["simulacionesCompletadasHoy"] == 1


def test_el_tablero_del_profesor_no_lista_a_estudiantes_ajenos(
    profesor, otro_profesor, estudiante, ajeno, case_version_id
):
    _add_student(_grupo(profesor), estudiante)
    _add_student(_grupo(otro_profesor), ajeno)
    _closed_attempt(estudiante, case_version_id, "COMPLETED")
    _closed_attempt(ajeno, case_version_id, "COMPLETED")

    data = cl(profesor).get(DASHBOARD).data["data"]

    nombres = {i["estudiante"] for i in data["ultimosIntentos"] + data["intentosRecientes"]}
    assert "Est Rep" in nombres
    assert "Ajeno Alcance" not in nombres


def test_un_profesor_sin_estudiantes_ve_el_tablero_vacio(otro_profesor, estudiante, case_version_id):
    _closed_attempt(estudiante, case_version_id, "COMPLETED")

    data = cl(otro_profesor).get(DASHBOARD).data["data"]

    assert data["ultimosIntentos"] == []
    assert data["intentosRecientes"] == []
    assert data["simulacionesCompletadas"] == 0
    assert data["simulacionesEnProgreso"] == 0
    assert data["decisionesAdecuadas"] == 0
    assert data["puntajePromedioGlobal"] == 0


def test_el_tablero_del_admin_sigue_siendo_global(admin, estudiante, ajeno, case_version_id):
    before = cl(admin).get(DASHBOARD).data["data"]

    _closed_attempt(estudiante, case_version_id, "COMPLETED")
    _closed_attempt(ajeno, case_version_id, "COMPLETED")

    after = cl(admin).get(DASHBOARD).data["data"]
    assert after["simulacionesCompletadas"] - before["simulacionesCompletadas"] == 2


# --- reporte de un intento --------------------------------------------------
def test_un_profesor_no_lee_el_reporte_de_un_intento_de_un_estudiante_ajeno(
    profesor, otro_profesor, ajeno, case_version_id
):
    _add_student(_grupo(otro_profesor), ajeno)
    intento = _closed_attempt(ajeno, case_version_id, "COMPLETED")

    resp = cl(profesor).get(f"/api/simulation/attempts/{intento.id}/student-report")

    assert resp.status_code == 403


def test_el_profesor_lee_el_reporte_de_un_intento_de_su_grupo(profesor, estudiante, case_version_id):
    _add_student(_grupo(profesor), estudiante)
    intento = _closed_attempt(estudiante, case_version_id, "COMPLETED")

    resp = cl(profesor).get(f"/api/simulation/attempts/{intento.id}/student-report")

    assert resp.status_code == 200


def test_el_admin_lee_el_reporte_de_cualquier_intento(admin, ajeno, case_version_id):
    intento = _closed_attempt(ajeno, case_version_id, "COMPLETED")

    resp = cl(admin).get(f"/api/simulation/attempts/{intento.id}/student-report")

    assert resp.status_code == 200
