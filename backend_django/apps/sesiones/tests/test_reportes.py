"""T8 — Reportes. Contract-faithful to Spring ReporteController/ReporteService.

These run against the real ``psychosim`` DB (rolled back per test). The dashboard
aggregates are GLOBAL, so absolute counts are non-deterministic; tests assert
structure, permissions, and deterministic deltas/derived rows we create here.
Freshly-created students have no pre-existing attempts, so their simulation
counts ARE deterministic.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.casos.models import Caso, Escenario, Opcion, Pregunta
from apps.grupos.models import Grupo
from apps.sesiones.models import RespuestaEstudiante, SesionJuego
from apps.simulation.models import CaseVersion

User = get_user_model()

DASHBOARD_KEYS = [
    "estudiantesActivos", "casosCompletadosHoy", "puntajePromedioGlobal",
    "ultimasSesiones", "simulacionesCompletadas", "simulacionesEnProgreso",
    "puntajePromedioSimulacion", "decisionesAdecuadas", "decisionesRiesgosas",
    "decisionesInadecuadas", "decisionesProhibidas", "ultimosIntentos",
    "intentosRecientes",
]


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_rep@x.com", password="pass1234", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_rep@x.com", password="pass1234", nombre="Est", apellido="Rep", role="ESTUDIANTE"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001", status="PUBLISHED"
    ).id


def _grupo(profesor):
    return Grupo.objects.create(
        nombre="G-rep", codigo=f"REP{uuid.uuid4().hex[:6].upper()}", profesor=profesor
    )


def _add_student(grupo, estudiante):
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) "
            "ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )


def _caso_con_pregunta(profesor):
    caso = Caso.objects.create(titulo="C-rep", created_by=profesor)
    esc = Escenario.objects.create(caso=caso, orden=0, nombre="E", mapa_key="m")
    preg = Pregunta.objects.create(escenario=esc, orden=0, enunciado="Q", puntos_correcta=10)
    op_ok = Opcion.objects.create(pregunta=preg, texto="A", es_correcta=True)
    op_bad = Opcion.objects.create(pregunta=preg, texto="B", es_correcta=False)
    return caso, preg, op_ok, op_bad


# --- permissions -----------------------------------------------------------
def test_dashboard_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).get("/api/reportes/dashboard").status_code == 403


def test_grupo_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).get("/api/reportes/grupo/1").status_code == 403


# --- dashboard -------------------------------------------------------------
def test_dashboard_structure(profesor):
    resp = cl(profesor).get("/api/reportes/dashboard")
    assert resp.status_code == 200
    data = resp.data["data"]
    for key in DASHBOARD_KEYS:
        assert key in data, f"missing {key}"
    assert isinstance(data["ultimasSesiones"], list)
    assert isinstance(data["intentosRecientes"], list)


def test_dashboard_counts_completed_legacy_session_today(profesor, estudiante):
    base = cl(profesor).get("/api/reportes/dashboard").data["data"]
    caso, *_ = _caso_con_pregunta(profesor)
    s = SesionJuego.objects.create(
        estudiante=estudiante, caso=caso, completado=True,
        fecha_fin=timezone.now(), puntaje_total=42,
    )
    after = cl(profesor).get("/api/reportes/dashboard").data["data"]
    assert after["estudiantesActivos"] == base["estudiantesActivos"] + 1
    ids = [u["id"] for u in after["ultimasSesiones"]]
    assert s.id in ids
    row = next(u for u in after["ultimasSesiones"] if u["id"] == s.id)
    assert row["estudiante"] == "Est Rep"
    assert row["casoTitulo"] == "C-rep"
    assert row["puntaje"] == 42
    assert row["completado"] is True


# --- group report (legacy) -------------------------------------------------
def test_grupo_report_404(profesor):
    assert cl(profesor).get("/api/reportes/grupo/99999999").status_code == 404


def test_grupo_report_no_caso_is_empty(profesor):
    grupo = _grupo(profesor)
    d = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}").data["data"]
    assert d["grupoId"] == grupo.id
    assert d["casoId"] is None
    assert d["caseVersionId"] is None
    assert d["totalSesiones"] == 0
    assert d["estudiantes"] == []
    assert d["simulacion"] is None


def test_grupo_report_legacy_aggregates(profesor, estudiante):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    caso, preg, op_ok, op_bad = _caso_con_pregunta(profesor)
    s = SesionJuego.objects.create(
        estudiante=estudiante, caso=caso, completado=True,
        fecha_fin=timezone.now(), puntaje_total=10,
    )
    RespuestaEstudiante.objects.create(
        sesion=s, pregunta=preg, opcion=op_ok, es_correcta=True, tiempo_respuesta_ms=1000
    )
    RespuestaEstudiante.objects.create(
        sesion=s, pregunta=preg, opcion=op_bad, es_correcta=False, tiempo_respuesta_ms=3000
    )
    d = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?casoId={caso.id}").data["data"]
    assert d["grupoId"] == grupo.id
    assert d["casoId"] == caso.id
    assert d["caseVersionId"] is None
    assert d["totalSesiones"] == 1
    assert d["puntajePromedio"] == 10.0
    assert d["tasaAciertos"] == 50.0
    assert d["tiempoPromedioMs"] == 2000
    assert d["simulacion"] is None
    est = d["estudiantes"]
    assert len(est) == 1
    assert est[0]["nombre"] == "Est Rep"
    assert est[0]["puntaje"] == 10
    assert est[0]["porcentajeAciertos"] == 50.0
    assert est[0]["tiempoPromedioMs"] == 2000.0
    assert est[0]["estado"] == "COMPLETADO"


# --- group report (simulation) --------------------------------------------
def test_grupo_report_simulation_block(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    # Play one real decision so an attempt + decision event exist.
    c = cl(estudiante)
    start = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    option_id = start["currentNode"]["options"][0]["id"]
    c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id},
        format="json",
    )
    d = cl(profesor).get(
        f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}"
    ).data["data"]
    sim = d["simulacion"]
    assert sim is not None
    assert d["caseVersionId"] == case_version_id
    assert sim["totalIntentos"] == 1
    assert sim["intentosEnProgreso"] == 1
    decisiones = (
        sim["decisionesAdecuadas"] + sim["decisionesRiesgosas"] + sim["decisionesInadecuadas"]
    )
    assert decisiones == 1
    nombres = {e["nombre"] for e in sim["estudiantes"]}
    assert "Est Rep" in nombres
    mine = next(e for e in sim["estudiantes"] if e["nombre"] == "Est Rep")
    assert mine["totalIntentos"] == 1
    assert mine["estado"] == "EN_PROGRESO"


# --- CSV export ------------------------------------------------------------
def test_export_csv_legacy_format(profesor, estudiante):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    caso, preg, op_ok, op_bad = _caso_con_pregunta(profesor)
    s = SesionJuego.objects.create(
        estudiante=estudiante, caso=caso, completado=True,
        fecha_fin=timezone.now(), puntaje_total=10,
    )
    RespuestaEstudiante.objects.create(
        sesion=s, pregunta=preg, opcion=op_ok, es_correcta=True, tiempo_respuesta_ms=1000
    )
    RespuestaEstudiante.objects.create(
        sesion=s, pregunta=preg, opcion=op_bad, es_correcta=False, tiempo_respuesta_ms=3000
    )
    resp = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?casoId={caso.id}")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "text/csv;charset=UTF-8"
    assert resp["Content-Disposition"] == f'attachment; filename="reporte-grupo-{grupo.id}.csv"'
    # Not wrapped in the JSON envelope.
    content = resp.content.decode("utf-8")
    assert "success" not in content
    lines = content.split("\n")
    assert lines[0] == "Estudiante,Puntaje,% Aciertos,Tiempo Promedio (ms),Estado"
    assert lines[1] == "Est Rep,10,50.0,2000,COMPLETADO"
    assert content.endswith("\n")


def test_export_csv_simulation_format(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    c = cl(estudiante)
    start = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    resp = cl(profesor).get(
        f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}"
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8")
    lines = content.split("\n")
    assert lines[0] == (
        "Estudiante,Intentos,Completados,En progreso,Salida segura,Puntaje prom.,"
        "Adecuadas,Riesgosas,Inadecuadas,Bitacoras,Rubricas,Estado"
    )
    assert any(line.startswith("Est Rep,1,") for line in lines)
