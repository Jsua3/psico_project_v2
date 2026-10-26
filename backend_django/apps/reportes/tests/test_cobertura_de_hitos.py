"""Tarea 13 · Los reportes docentes miden por COBERTURA DE HITOS, no por puntaje.

El reporte de grupo, el CSV, el tablero, la analítica y la traza del intento no llevan puntaje, promedio ni estrés. Cada
hito declarado por el caso trae su cobertura en el grupo con la celda mínima: con menos de 5 estudiantes DISTINTOS con un
intento completado, nada (``None``); de 5 a 19, dos categorías (la mayoría lo cumplió / menos de la mitad) sin conteos al
lado; con 20 o más, además el porcentaje. Las cohortes se arman con reportes congelados v3 (como los deja el cierre real),
sin jugar: lo que se prueba es la agregación, a través de los endpoints.
"""
import csv
import io
import json

import pytest

from apps.simulation.models import AttemptEvent, CaseVersion, DecisionOption, SimulationNode
from apps.simulation.tests.analytics_support import completed_attempt, make_student

from .test_reportes import (  # noqa: F401  (fixtures y ayudantes)
    _add_student,
    _assign_case,
    _grupo,
    case_version_id,
    cl,
    estudiante,
    profesor,
)

pytestmark = [pytest.mark.usefixtures("fetch_raise"), pytest.mark.django_db]

MILESTONES = [
    {"key": "saludo", "label": "Saludar", "decisive": False},
    {"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True},
    {"key": "proteccion", "label": "Recomendar medidas de protección", "decisive": True},
]
FORBIDDEN_KEYS = {"puntaje", "puntajepromedio", "puntajepromedioglobal", "accumulatedscore", "stressindex"}


def _declare(case_version_id):
    CaseVersion.objects.filter(pk=case_version_id).update(rules=json.dumps({"milestones": MILESTONES}))


def _report(done):
    """El reporte congelado v3 con solo lo que los reportes de grupo leen: los hitos cumplidos."""
    return {
        "schemaVersion": 3,
        "milestones": {
            "done": [{"key": key, "label": key, "decisive": False} for key in done],
            "missing": [],
        },
    }


def _cohort(profesor, case_version_id, done_by_student, names=None):
    """Un grupo del docente con un estudiante por elemento; cada uno con UN intento completado que cumplió esos hitos."""
    _declare(case_version_id)
    grupo = _grupo(profesor)
    _assign_case(grupo, case_version_id)
    version = CaseVersion.objects.get(pk=case_version_id)
    students = []
    for index, done in enumerate(done_by_student):
        student = make_student(f"c{index}")
        if names:
            student.nombre, student.apellido = names[index], "X"
            student.save(update_fields=["nombre", "apellido"])
        _add_student(grupo, student)
        completed_attempt(student, version, 1, report=_report(done), schema_version=3)
        students.append(student)
    return grupo, students


def _simulacion(profesor, grupo, case_version_id):
    resp = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]["simulacion"]


def _keys(node):
    """Todas las claves de un JSON, a cualquier profundidad."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _keys(item)


def _assert_sin_puntaje(data):
    assert not {str(key).lower() for key in _keys(data)} & FORBIDDEN_KEYS


# ─── la celda mínima ──────────────────────────────────────────────────────────────────────────
def test_con_menos_de_cinco_estudiantes_la_cobertura_se_suprime(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo"]] * 4)

    sim = _simulacion(profesor, grupo, case_version_id)

    assert [h["key"] for h in sim["hitos"]] == ["saludo", "riesgo_valorado", "proteccion"]
    assert all(h["cobertura"] is None for h in sim["hitos"])
    assert all("porcentaje" not in h for h in sim["hitos"])


def test_la_celda_cuenta_estudiantes_distintos_no_intentos(profesor, case_version_id):
    grupo, students = _cohort(profesor, case_version_id, [["saludo"]] * 4)
    version = CaseVersion.objects.get(pk=case_version_id)
    for student in students:  # ocho intentos completados, cuatro personas
        completed_attempt(student, version, 2, report=_report(["saludo"]), schema_version=3)

    sim = _simulacion(profesor, grupo, case_version_id)

    assert sim["intentosCompletados"] == 8
    assert all(h["cobertura"] is None for h in sim["hitos"])


def test_de_cinco_a_diecinueve_solo_hay_dos_categorias_y_ningun_conteo(profesor, case_version_id):
    # 6 estudiantes: saludo 4/6 (más de la mitad), riesgo 3/6 (justo la mitad), protección 2/6.
    done = [["saludo", "riesgo_valorado", "proteccion"], ["saludo", "riesgo_valorado", "proteccion"],
            ["saludo", "riesgo_valorado"], ["saludo"], [], []]
    grupo, _ = _cohort(profesor, case_version_id, done)

    sim = _simulacion(profesor, grupo, case_version_id)

    assert {h["key"]: h["cobertura"] for h in sim["hitos"]} == {
        "saludo": "MAYORIA", "riesgo_valorado": "MAYORIA", "proteccion": "MENOS_DE_LA_MITAD",
    }
    assert all(set(h) == {"key", "label", "decisive", "cobertura"} for h in sim["hitos"])  # sin porcentaje ni conteo


def test_con_veinte_estudiantes_viaja_tambien_el_porcentaje(profesor, case_version_id):
    done = [["saludo", "riesgo_valorado"]] * 15 + [["saludo"]] * 5
    grupo, _ = _cohort(profesor, case_version_id, done)

    sim = _simulacion(profesor, grupo, case_version_id)

    by_key = {h["key"]: h for h in sim["hitos"]}
    assert (by_key["saludo"]["cobertura"], by_key["saludo"]["porcentaje"]) == ("MAYORIA", 100)
    assert (by_key["riesgo_valorado"]["cobertura"], by_key["riesgo_valorado"]["porcentaje"]) == ("MAYORIA", 75)
    assert (by_key["proteccion"]["cobertura"], by_key["proteccion"]["porcentaje"]) == ("MENOS_DE_LA_MITAD", 0)


def test_cada_hito_trae_su_etiqueta_y_si_es_decisivo_en_el_orden_del_caso(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [[]] * 5)

    sim = _simulacion(profesor, grupo, case_version_id)

    assert [(h["key"], h["label"], h["decisive"]) for h in sim["hitos"]] == [
        ("saludo", "Saludar", False),
        ("riesgo_valorado", "Valorar el riesgo", True),
        ("proteccion", "Recomendar medidas de protección", True),
    ]


def test_un_reporte_anterior_a_la_v3_no_cuenta_como_no_cumplido(profesor, case_version_id):
    grupo, students = _cohort(profesor, case_version_id, [["saludo"]] * 5)
    version = CaseVersion.objects.get(pk=case_version_id)
    for n in range(5):  # cinco estudiantes con un reporte v2 (sin hitos): no suman al grupo ni lo restan
        old = make_student(f"v2{n}")
        _add_student(grupo, old)
        completed_attempt(old, version, 1, report={"schemaVersion": 2}, schema_version=2)

    sim = _simulacion(profesor, grupo, case_version_id)

    assert {h["key"]: h["cobertura"] for h in sim["hitos"]}["saludo"] == "MAYORIA"


# ─── por estudiante ───────────────────────────────────────────────────────────────────────────
def test_el_estudiante_trae_sus_hitos_aunque_el_grupo_este_suprimido(profesor, case_version_id):
    grupo, students = _cohort(profesor, case_version_id, [["saludo", "proteccion"], ["saludo"]], names=["Ana", "Beto"])

    sim = _simulacion(profesor, grupo, case_version_id)

    assert all(h["cobertura"] is None for h in sim["hitos"])
    assert {e["id"]: e["hitosCumplidos"] for e in sim["estudiantes"]} == {
        students[0].id: ["saludo", "proteccion"], students[1].id: ["saludo"],
    }


def test_ningun_listado_ordena_a_los_estudiantes_por_desempeno(profesor, case_version_id):
    # Quien cumplió más hitos se llama «Zoe»: si se ordenara por desempeño saldría primero.
    names = ["Zoe", "Carlos", "Ana", "Mario", "Bea"]
    done = [["saludo", "riesgo_valorado", "proteccion"], ["saludo", "riesgo_valorado"], ["saludo"], [], []]
    grupo, _ = _cohort(profesor, case_version_id, done, names=names)

    sim = _simulacion(profesor, grupo, case_version_id)

    nombres = [e["nombre"] for e in sim["estudiantes"]]
    assert nombres == sorted(nombres) and nombres[-1].startswith("Zoe")


# ─── ningún puntaje en ningún reporte ─────────────────────────────────────────────────────────
def test_ningun_endpoint_de_reportes_lleva_puntaje_ni_estres(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo"]] * 5)

    for url in (
        "/api/reportes/dashboard",
        f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}",
        f"/api/reportes/analiticas?grupoId={grupo.id}&caseVersionId={case_version_id}",
    ):
        resp = cl(profesor).get(url)
        assert resp.status_code == 200, (url, resp.data)
        _assert_sin_puntaje(resp.data["data"])


def test_el_reporte_de_un_estudiante_no_lleva_puntaje(profesor, case_version_id):
    _, students = _cohort(profesor, case_version_id, [["saludo"]])

    resp = cl(profesor).get(f"/api/reportes/estudiante/{students[0].id}")

    assert resp.status_code == 200, resp.data
    _assert_sin_puntaje(resp.data["data"])


# ─── CSV ──────────────────────────────────────────────────────────────────────────────────────
def _csv(profesor, grupo, case_version_id):
    resp = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}/export?caseVersionId={case_version_id}")
    assert resp.status_code == 200
    return list(csv.reader(io.StringIO(resp.content.decode("utf-8"))))


def test_el_csv_pierde_el_puntaje_y_gana_una_columna_por_hito(profesor, case_version_id):
    done = [["saludo", "riesgo_valorado", "proteccion"], ["saludo", "riesgo_valorado"], ["saludo"], [], []]
    grupo, _ = _cohort(profesor, case_version_id, done, names=["Ana", "Beto", "Carla", "Dani", "Eva"])

    rows = _csv(profesor, grupo, case_version_id)

    header = rows[0]
    assert "Puntaje prom." not in header and not {"Adecuadas", "Riesgosas", "Inadecuadas"} & set(header)
    assert header[-3:] == ["Saludar", "Valorar el riesgo", "Recomendar medidas de protección"]
    by_name = {row[0]: row for row in rows[1:-1]}
    assert by_name["Ana X"][-3:] == ["Sí", "Sí", "Sí"]
    assert by_name["Carla X"][-3:] == ["Sí", "No", "No"]
    assert by_name["Eva X"][-3:] == ["No", "No", "No"]


def test_el_csv_cierra_con_la_cobertura_del_grupo_en_palabras(profesor, case_version_id):
    done = [["saludo", "riesgo_valorado"], ["saludo", "riesgo_valorado"], ["saludo", "riesgo_valorado"], ["saludo"], []]
    grupo, _ = _cohort(profesor, case_version_id, done)

    last = _csv(profesor, grupo, case_version_id)[-1]

    assert last[0] == "Cobertura del grupo"
    assert last[-3:] == ["La mayoría lo cumplió", "La mayoría lo cumplió", "Menos de la mitad"]


def test_el_csv_suprimido_dice_raya_y_no_la_cobertura(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo"]] * 4)

    rows = _csv(profesor, grupo, case_version_id)

    assert rows[-1][-3:] == ["—", "—", "—"]
    assert rows[1][-3:] == ["Sí", "No", "No"]  # lo individual, el docente sí lo ve


def test_el_csv_con_veinte_estudiantes_trae_el_porcentaje(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo", "riesgo_valorado"]] * 15 + [["saludo"]] * 5)

    last = _csv(profesor, grupo, case_version_id)[-1]

    assert last[-3:] == ["La mayoría lo cumplió (100 %)", "La mayoría lo cumplió (75 %)", "Menos de la mitad (0 %)"]


# ─── el tablero ───────────────────────────────────────────────────────────────────────────────
def _option_with_class(case_version_id, response_class, n):
    options = list(DecisionOption.objects.filter(case_version_id=case_version_id).order_by("id")[:4])
    option = options[n]
    DecisionOption.objects.filter(pk=option.pk).update(response_class=response_class)
    return DecisionOption.objects.get(pk=option.pk)


def test_el_tablero_cuenta_las_decisiones_por_clase_de_respuesta(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    version = CaseVersion.objects.get(pk=case_version_id)
    attempt = completed_attempt(estudiante, version, 1, report=_report([]), schema_version=3)
    node = SimulationNode.objects.filter(case_version_id=case_version_id, start_node=True).first()
    plan = [("RECOMMENDED", 0, 2), ("RISKY", 1, 1), ("CONTRAINDICATED", 2, 1)]
    for response_class, n, times in plan:
        option = _option_with_class(case_version_id, response_class, n)
        for _ in range(times):
            AttemptEvent.objects.create(attempt=attempt, event_type="DECISION_SELECTED", node=node, decision_option=option)
    option = _option_with_class(case_version_id, "RISKY", 1)
    AttemptEvent.objects.create(attempt=attempt, event_type="DECISION_RETRY_REQUIRED", node=node, decision_option=option)

    data = cl(profesor).get("/api/reportes/dashboard").data["data"]

    assert data["decisiones"] == {"recommended": 2, "acceptable": 0, "risky": 1, "contraindicated": 1}  # el reintento no cuenta
    sim = cl(profesor).get(f"/api/reportes/grupo/{grupo.id}?caseVersionId={case_version_id}").data["data"]["simulacion"]
    assert sim["estudiantes"][0]["clases"] == {"recommended": 2, "acceptable": 0, "risky": 1, "contraindicated": 1}


def test_los_intentos_recientes_van_por_fecha_de_inicio_no_por_desempeno(profesor, case_version_id):
    _, students = _cohort(profesor, case_version_id, [[]] * 3)

    data = cl(profesor).get("/api/reportes/dashboard").data["data"]

    assert [i["attemptId"] for i in data["intentosRecientes"]] == [i["attemptId"] for i in data["ultimosIntentos"]]
    assert len(data["intentosRecientes"]) == 3


# ─── el bloque de hitos de la analítica ───────────────────────────────────────────────────────
def _analiticas(profesor, grupo, case_version_id):
    resp = cl(profesor).get(f"/api/reportes/analiticas?grupoId={grupo.id}&caseVersionId={case_version_id}")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]


def test_la_analitica_trae_el_bloque_de_hitos_con_la_misma_celda_minima(profesor, case_version_id):
    done = [["saludo", "riesgo_valorado"]] * 4 + [["saludo"]] * 2
    grupo, _ = _cohort(profesor, case_version_id, done)

    block = _analiticas(profesor, grupo, case_version_id)["milestones"]

    assert block == [
        {"key": "saludo", "label": "Saludar", "decisive": False, "share": None, "category": "MAYORIA"},
        {"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True, "share": None, "category": "MAYORIA"},
        {"key": "proteccion", "label": "Recomendar medidas de protección", "decisive": True, "share": None,
         "category": "MENOS_DE_LA_MITAD"},
    ]


def test_la_analitica_trae_el_porcentaje_solo_con_veinte_estudiantes(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo", "riesgo_valorado"]] * 15 + [["saludo"]] * 5)

    block = _analiticas(profesor, grupo, case_version_id)["milestones"]

    assert [(b["key"], b["share"], b["category"]) for b in block] == [
        ("saludo", 100.0, "MAYORIA"), ("riesgo_valorado", 75.0, "MAYORIA"), ("proteccion", 0.0, "MENOS_DE_LA_MITAD"),
    ]


def test_con_menos_de_cinco_estudiantes_la_analitica_no_trae_el_bloque(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo"]] * 4)

    data = _analiticas(profesor, grupo, case_version_id)

    assert data["cohort"]["suppressed"] is True and "milestones" not in data


def test_sin_reportes_con_hitos_la_analitica_no_inventa_el_bloque(profesor, case_version_id):
    _declare(case_version_id)
    grupo = _grupo(profesor)
    version = CaseVersion.objects.get(pk=case_version_id)
    for n in range(5):
        student = make_student(f"old{n}")
        _add_student(grupo, student)
        completed_attempt(student, version, 1, report={"schemaVersion": 2}, schema_version=2)

    assert "milestones" not in _analiticas(profesor, grupo, case_version_id)


def test_sin_version_la_analitica_lista_los_hitos_observados_por_clave(profesor, case_version_id):
    grupo, _ = _cohort(profesor, case_version_id, [["saludo"]] * 5)

    resp = cl(profesor).get(f"/api/reportes/analiticas?grupoId={grupo.id}")

    assert [(b["key"], b["label"], b["category"]) for b in resp.data["data"]["milestones"]] == [
        ("saludo", "saludo", "MAYORIA"),
    ]
