"""I-2 (R-17) · Un reporte congelado v1/v2 llega al ESTUDIANTE sin las claves del modelo numérico viejo.

La regla «ninguna cifra al estudiante» es del contrato HTTP, no solo de la pantalla: un intento cerrado antes del modelo
de métricas guarda su reporte con puntaje, estrés y conteos por severidad, y esos bytes no se tocan (ni se reescriben ni
se recalculan). Lo que cambia es la proyección de SOLO LECTURA que se sirve al rol estudiante cuando
``schemaVersion < 3``. El docente, el ADMIN y la analítica leen lo guardado tal cual.
"""
import copy
import json

import pytest

from apps.simulation.models import AttemptReport
from apps.simulation.services import attempt_report

from .test_attempt_report_frozen import V2_CONGELADO, _congelar_v2, _reports, completed  # noqa: F401  (fixtures)
from .test_no_numbers_to_student import RETIRED_KEYS, _allowed, _scan
from .test_world import case_version_id, cl, estudiante  # noqa: F401  (fixtures)

BASE = "/api/simulation"

#: El final tal como lo cerraba el motor viejo: con las métricas, las banderas y los conteos por severidad del caso.
FINAL_VIEJO = {
    "key": "protectora", "title": "Intervención protectora", "message": "Cuidaste a la persona usuaria.", "tone": "positive",
    "severityCounts": {"adequate": 4, "risky": 1, "inadequate": 2, "prohibited": 1},
    "caseFlags": {"derivo_a_proteccion": True}, "caseMetrics": {"confianza": 62, "riesgo": 18},
}


def _v2_con_final():
    reporte = copy.deepcopy(V2_CONGELADO)
    reporte["ending"] = copy.deepcopy(FINAL_VIEJO)
    return reporte


def _congelar(attempt_id, reporte, version):
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()
    return AttemptReport.objects.create(
        attempt_id=attempt_id, report_json=json.dumps(reporte, ensure_ascii=False), report_schema_version=version,
        definition_hash="b" * 64, attempt_ordinal=1,
    )


def _lo_que_ve_el_estudiante(client, attempt_id, token):
    """Las cuatro respuestas que sirven el reporte cerrado: tres rutas de reporte y el estado del intento."""
    reportes = _reports(client, attempt_id, token)
    estado = client.get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    return {**reportes, "state": estado["completionReport"]}


def _sin_cifras(reportes):
    registro = [(nombre, 200, cuerpo) for nombre, cuerpo in reportes.items()]
    numeros, claves = _scan(registro)
    retiradas = sorted({(donde, clave) for donde, clave in claves if clave in RETIRED_KEYS})
    medidas = sorted({(donde, clave, valor) for donde, clave, valor in numeros if not _allowed(clave)}, key=str)
    return retiradas, medidas


def test_un_reporte_v2_llega_al_estudiante_sin_claves_retiradas_ni_medidas(completed):
    client, attempt_id, token = completed
    _congelar(attempt_id, _v2_con_final(), 2)

    reportes = _lo_que_ve_el_estudiante(client, attempt_id, token)

    retiradas, medidas = _sin_cifras(reportes)
    assert retiradas == [] and medidas == []
    for nombre, reporte in reportes.items():
        assert reporte["schemaVersion"] == 2, nombre  # sigue siendo el reporte v2: solo se le quitó lo numérico
        assert reporte["caseTitle"] == "Caso" and reporte["recommendations"], nombre
        assert "counts" not in reporte, nombre  # sus conteos eran por severidad
        assert reporte["ending"]["title"] == "Intervención protectora", nombre  # el final conserva lo que se lee
        assert reporte["timeline"][0]["type"] == "DECISION_SELECTED", nombre


def test_un_reporte_v1_tambien_se_proyecta(completed):
    client, attempt_id, token = completed
    v1 = {"schemaVersion": 1, "attemptId": "x", "caseTitle": "Caso", "status": "COMPLETED", "finalScore": 55,
          "finalStress": 40, "metrics": {"professionalScore": 55}, "adequateDecisions": 3,
          "recommendations": ["Revisa el caso."], "ending": copy.deepcopy(FINAL_VIEJO)}
    _congelar(attempt_id, v1, 1)

    reportes = _lo_que_ve_el_estudiante(client, attempt_id, token)

    assert _sin_cifras(reportes) == ([], [])
    assert all(reporte["recommendations"] == ["Revisa el caso."] for reporte in reportes.values())


def test_el_docente_y_el_admin_leen_el_v2_tal_cual(completed, django_user_model):
    client, attempt_id, _token = completed
    _congelar(attempt_id, _v2_con_final(), 2)
    admin = django_user_model.objects.create_user(
        email="admin_proyeccion@x.com", password="x", nombre="Ad", apellido="Min", role="ADMIN"
    )

    leido = cl(admin).get(f"{BASE}/attempts/{attempt_id}/student-report").data["data"]

    assert leido == _v2_con_final()  # el puntaje, el estrés, los conteos y el final viejo, intactos


def test_la_proyeccion_no_reescribe_lo_guardado(completed):
    client, attempt_id, token = completed
    fila = _congelar(attempt_id, _v2_con_final(), 2)
    guardado = AttemptReport.objects.get(pk=fila.pk).report_json

    _lo_que_ve_el_estudiante(client, attempt_id, token)

    despues = AttemptReport.objects.get(pk=fila.pk)
    assert despues.report_json == guardado and despues.report_schema_version == 2
    assert attempt_report.frozen_report_for(attempt_id) == _v2_con_final()


def test_un_reporte_v3_no_se_proyecta(completed):
    client, attempt_id, token = completed
    guardado = json.loads(AttemptReport.objects.get(attempt_id=attempt_id).report_json)

    reportes = _lo_que_ve_el_estudiante(client, attempt_id, token)

    assert reportes["report"] == guardado and reportes["state"] == guardado


def test_la_proyeccion_es_una_copia_y_no_toca_el_diccionario_de_entrada():
    original = _v2_con_final()
    copia = copy.deepcopy(original)

    proyectado = attempt_report.for_student(original)

    assert original == copia and proyectado is not original
    assert "finalScore" not in proyectado and "caseMetrics" not in proyectado["ending"]
    assert attempt_report.for_student(None) is None
    v3 = {"schemaVersion": 3, "milestones": {"done": [], "missing": []}}
    assert attempt_report.for_student(v3) is v3
