"""E6-6a · La cohorte sintética de 40 intentos: las cifras de C13, derivadas a mano, a través del endpoint real.

Veinte estudiantes con dos intentos cerrados cada uno (cinco «clases» de estudiantes con el mismo patrón). Las cifras
esperadas están calculadas A MANO en la tabla de abajo y NO se copian de la salida: si una definición de la analítica
cambia, esta prueba falla a propósito y obliga a revisar la documentación (``docs/operacion/analitica-de-aprendizaje.md``).
Un grupo de 4 estudiantes de esa misma cohorte no revela ninguna cifra (celda mínima), ni con filtros ni sin ellos.

Tarea 8 (modelo de respuesta, ``borrador-2``): los niveles y las no recomendadas de esta cohorte NO se derivaron de
severidades ni de «aporte a todas»: el constructor (``analytics_support.v2_report``) inyecta directamente los reportes
congelados ya calculados (``levels``, ``non_recommended``), sin jugar ni leer opciones. Lo que la Tarea 8 cambia en la
analítica solo puede tocar dos cosas de esta cohorte, y se revisaron a mano:

  - ``PROFILE_RULES`` pasa de ``borrador-1`` a ``borrador-2``: el constructor sella cada reporte con la versión VIGENTE, así
    que los 40 reportes siguen coincidiendo con la regla y ningún bloque de niveles los deja fuera; la única cifra que
    cambia es ``definitions.profileRules`` (``"borrador-2"``).
  - ``firstVsSecond`` ahora solo empareja filas del MISMO ``schemaVersion``: los 40 reportes son ``schemaVersion 2``
    (columna y JSON), así que las 20 series siguen emparejando su 1.º y su 2.º intento y los números de ``firstVsSecond``
    (3.9 · 2.7 · −30.8) no cambian. El caso mezclado (v2 con v3) no existe aquí: lo cubre ``test_competencies_by_class``.

Todas las cifras de la derivación de abajo se conservan idénticas: la suma 37 y 60.5 de los índices, 78 y 54 de las no
recomendadas, 14 de 20, 24 de 40, 32 y 20 de 40, 17 respuestas y 13 pares valen lo mismo que antes de la Tarea 8.

Además, una prueba de punta a punta: un intento JUGADO de verdad por la API produce el reporte v2, la evaluación del
sistema, el evento de retroalimentación y la encuesta, y la lectura de la analítica los entiende (si el formato del
reporte cambia sin que cambie la lectura, esa prueba falla).

Clases (n estudiantes) · 1.er intento → 2.º intento: niveles (índice) · no recomendadas · reflexión/evidencia ·
extras (✓ evaluación del sistema, ◐ pendiente, ✗ ninguna; c = comentario del docente; v = vio la retroalimentación
ANTES del 2.º intento; v′ = la vio DESPUÉS; ★ = calificación de la encuesta del 2.º intento).

  A (6)  (INI, PRO) 1.5 · 5 · no  →  (LOG, LOG) 3.0 · 3 · sí     sistema ✓✓ · c en ambos · v los 6 · ★5 los 6
  B (5)  (PRO, PRO) 2.0 · 4 · sí  →  (LOG, DES) 3.5 · 2 · sí     sistema ✓✓ · c en el 2.º · v 3, v′ 2 · ★4 los 5
  C (4)  (INI)      1.0 · 6 · no  →  (PRO)      2.0 · 5 · no     sistema ◐✓ · sin c · sin v · ★2 en 3 de 4
  D (3)  (LOG, LOG) 3.0 · 0 · sí  →  (DES, DES) 4.0 · 0 · sí     sistema ✓✓ · c en el 1.º · v los 3 · ★3 los 3
  E (2)  (PRO, LOG) 2.5 · 2 · sí  →  (PRO, LOG) 2.5 · 3 · no     sistema ✗✗ · sin c · v 1 de 2 · sin ★

  índice del 1.º: 6·1.5 + 5·2.0 + 4·1.0 + 3·3.0 + 2·2.5 = 37       → pre  = 37 / 20     = 1.85
  índice del 2.º: 6·3.0 + 5·3.5 + 4·2.0 + 3·4.0 + 2·2.5 = 60.5     → post = 60.5 / 20   = 3.025 → 3.03 (mitad hacia arriba)
  deltaPct = (3.025 − 1.85) / 3 × 100 = 39.1666… → 39.2
  no recomendadas del 1.º: 30 + 20 + 24 + 0 + 4 = 78 → 3.9 · del 2.º: 18 + 10 + 20 + 0 + 6 = 54 → 2.7
  nonRecommendedDeltaPct = (2.7 − 3.9) / 3.9 × 100 = −30.769… → −30.8
  aceptable (todas las competencias en LOGRADO o más en algún intento): A 6 + B 5 + D 3 = 14 de 20 = 70.0 %
  reflexión (y evidencia clave): A 6 + B 10 + C 0 + D 6 + E 2 = 24 de 40 = 60.0 %
  evaluadas: sistema ✓ en A 12 + B 10 + C 4 + D 6 = 32 de 40 = 80.0 % · con comentario del docente 12 + 5 + 3 = 20 de 40 = 50.0 %
  encuesta: 6 + 5 + 3 + 3 = 17 respuestas, 4 o 5 en 6 + 5 = 11 → 64.7 %
  tras la retroalimentación: pares A 6 + B 3 + D 3 + E 1 = 13 · pre (9 + 6 + 9 + 2.5)/13 · post (18 + 10.5 + 12 + 2.5)/13
      deltaPct = (43 − 26.5) / 13 / 3 × 100 = 42.307… → 42.3
"""
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.assessment import analytics
from apps.simulation.models import AttemptEvent, AttemptFeedback, CaseVersion, Rubric, SimulationAttempt
from apps.simulation.tests.analytics_support import (
    T0,
    add_evaluation,
    add_rating,
    add_viewed,
    completed_attempt,
    make_student,
    v2_report,
)

from .competency_support import declare_all_seeded
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _complete,
    _start,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = [
    pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RQ-NEG-003"),
    pytest.mark.req("RQ-NEG-004"), pytest.mark.req("RQ-NEG-005"), pytest.mark.django_db,
]

User = get_user_model()
INI, PRO, LOG, DES = "EN_INICIO", "EN_PROCESO", "LOGRADO", "DESTACADO"
SECOND_START = T0 + timedelta(days=3)

#: Una clase de estudiantes con el mismo patrón. ``viewed``: cuántos vieron la retroalimentación ANTES del 2.º intento;
#: ``late``: cuántos DESPUÉS; ``rated``: cuántos respondieron la encuesta (con ``rating``) tras el 2.º intento.
CLASSES = [
    {"name": "A", "size": 6, "one": dict(levels=(INI, PRO), non_recommended=5, covered=False, key=False),
     "two": dict(levels=(LOG, LOG), non_recommended=3, covered=True, key=True),
     "system": ("EVALUATED", "EVALUATED"), "comment": (True, True), "viewed": 6, "late": 0, "rated": 6, "rating": 5},
    {"name": "B", "size": 5, "one": dict(levels=(PRO, PRO), non_recommended=4, covered=True, key=True),
     "two": dict(levels=(LOG, DES), non_recommended=2, covered=True, key=True),
     "system": ("EVALUATED", "EVALUATED"), "comment": (False, True), "viewed": 3, "late": 2, "rated": 5, "rating": 4},
    {"name": "C", "size": 4, "one": dict(levels=(INI,), non_recommended=6, covered=False, key=False),
     "two": dict(levels=(PRO,), non_recommended=5, covered=False, key=False),
     "system": ("PENDING", "EVALUATED"), "comment": (False, False), "viewed": 0, "late": 0, "rated": 3, "rating": 2},
    {"name": "D", "size": 3, "one": dict(levels=(LOG, LOG), non_recommended=0, covered=True, key=True),
     "two": dict(levels=(DES, DES), non_recommended=0, covered=True, key=True),
     "system": ("EVALUATED", "EVALUATED"), "comment": (True, False), "viewed": 3, "late": 0, "rated": 3, "rating": 3},
    {"name": "E", "size": 2, "one": dict(levels=(PRO, LOG), non_recommended=2, covered=True, key=True),
     "two": dict(levels=(PRO, LOG), non_recommended=3, covered=False, key=False),
     "system": (None, None), "comment": (False, False), "viewed": 1, "late": 0, "rated": 0, "rating": None},
]

EXPECTED = {
    "cohort": {"students": 20, "attempts": 40, "suppressed": False},
    "improvement": {"students": 20, "series": 20, "pre": 1.85, "post": 3.03, "deltaPct": 39.2},
    "firstVsSecond": {"students": 20, "series": 20, "firstMean": 3.9, "secondMean": 2.7, "nonRecommendedDeltaPct": -30.8},
    "acceptable": {"students": 20, "achieved": 14, "pct": 70.0, "levelThreshold": LOG},
    "reflectionCoverage": {"definition": "ANY", "attempts": 40, "covered": 24, "pct": 60.0},
    "keyEvidence": {"attempts": 40, "keyEvidence": 24, "pct": 60.0},
    "evaluated": {"attempts": 40, "systemPct": 80.0, "commentedPct": 50.0},
    "satisfaction": {"responses": 17, "satisfiedPct": 64.7},
    "improvementAfterFeedback": {"students": 13, "pairs": 13, "deltaPct": 42.3},
    "definitions": {
        "status": "BORRADOR", "acceptableLevel": LOG, "minCell": 5, "reflectionDefinition": "ANY",
        "profileRules": "borrador-2",
    },
}


@pytest.fixture
def teacher(db):
    return User.objects.create_user(
        email=f"sint_prof_{uuid.uuid4().hex[:6]}@x.com", password="x", nombre="Sin", apellido="Tético", role="PROFESOR"
    )


def _group(teacher, name):
    return Grupo.objects.create(nombre=name, codigo=f"SIN{uuid.uuid4().hex[:6].upper()}", profesor=teacher)


def _member(group, student):
    GrupoEstudiante.objects.create(grupo=group, estudiante=student, status=MembershipStatus.ACTIVE)


@pytest.fixture
def synthetic(teacher, case_version_id):
    """Los 20 estudiantes en un grupo grande, y cuatro de ellos (clase A) también en uno chico del mismo docente."""
    version = CaseVersion.objects.get(pk=case_version_id)
    rubric = Rubric.objects.create(case_version=version, name="Rúbrica sintética", active=True, created_by=teacher)
    big, small = _group(teacher, "Grupo grande"), _group(teacher, "Grupo de cuatro")
    students, class_a = [], []
    for spec in CLASSES:
        for index in range(spec["size"]):
            student = make_student(f"{spec['name']}{index}")
            _member(big, student)
            students.append(student)
            if spec["name"] == "A":
                class_a.append(student)
            first = completed_attempt(student, version, 1, report=v2_report(**spec["one"]), started_at=T0 + timedelta(days=1))
            second = completed_attempt(student, version, 2, report=v2_report(**spec["two"]), started_at=SECOND_START)
            for attempt, state, commented in zip((first, second), spec["system"], spec["comment"]):
                if state is not None:
                    add_evaluation(attempt, rubric, origin="SISTEMA", status=state)
                if commented:
                    add_evaluation(attempt, rubric, origin="DOCENTE", teacher=teacher, comment="Comentario accionable")
            if index < spec["viewed"]:
                add_viewed(first, SECOND_START - timedelta(hours=1))
            elif index < spec["viewed"] + spec["late"]:
                add_viewed(first, SECOND_START + timedelta(hours=1))
            if index < spec["rated"]:
                add_rating(second, spec["rating"], comment="texto privado del estudiante")
    for student in class_a[:4]:
        _member(small, student)
    return SimpleNamespace(teacher=teacher, big=big, small=small, version=version, students=students)


def get(user, **params):
    return cl(user).get("/api/reportes/analiticas", params)


def test_la_cohorte_tiene_40_intentos_de_20_estudiantes(synthetic):
    assert SimulationAttempt.objects.filter(student__in=synthetic.students, status="COMPLETED").count() == 40
    assert GrupoEstudiante.objects.filter(grupo=synthetic.big).count() == 20
    assert GrupoEstudiante.objects.filter(grupo=synthetic.small).count() == 4


def test_las_cifras_de_c13_son_exactamente_las_derivadas_a_mano(synthetic):
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        data = get(synthetic.teacher, grupoId=synthetic.big.id).data["data"]

    assert data == EXPECTED


def test_sin_filtros_el_alcance_del_docente_es_la_misma_cohorte(synthetic):
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        data = get(synthetic.teacher).data["data"]

    assert data == EXPECTED  # los 4 del grupo chico ya están en el grande: no se cuentan dos veces


def test_con_la_encuesta_apagada_la_satisfaccion_no_viaja_y_el_resto_no_cambia(synthetic):
    data = get(synthetic.teacher, grupoId=synthetic.big.id).data["data"]

    assert "satisfaction" not in data
    assert {key: value for key, value in EXPECTED.items() if key != "satisfaction"} == data


def test_un_grupo_de_cuatro_de_esa_misma_cohorte_no_revela_ninguna_cifra(synthetic):
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        response = get(synthetic.teacher, grupoId=synthetic.small.id)

    data = response.data["data"]
    assert data["cohort"] == {"students": 4, "attempts": 8, "suppressed": True}
    assert set(data) == {"cohort", "definitions"}
    body = response.content.decode("utf-8")
    for key in ("pct", "satisfiedPct", "systemPct", "deltaPct", "pre", "post", "firstMean", "secondMean", "achieved",
                "covered", "keyEvidence", "responses", "pairs", "series"):
        assert f'"{key}"' not in body  # ninguna clave de ningún bloque: solo `cohort` y `definitions`


def test_cada_bloque_se_calcula_sobre_los_estudiantes_que_lo_alimentan(synthetic):
    """Con la celda mínima en 17 la encuesta (17 estudiantes respondieron) pasa y con 18 no; la mejora tras la
    retroalimentación (13 estudiantes) no llega a ninguna de las dos; los bloques de los 20 pasan en ambas."""
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True, MIN_CELL_SIZE=17):
        at_17 = get(synthetic.teacher, grupoId=synthetic.big.id).data["data"]
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True, MIN_CELL_SIZE=18):
        at_18 = get(synthetic.teacher, grupoId=synthetic.big.id).data["data"]

    assert "satisfaction" in at_17 and "satisfaction" not in at_18  # 17 estudiantes respondieron
    assert "improvementAfterFeedback" not in at_17  # solo 13 vieron la retroalimentación antes del 2.º intento
    assert "improvement" in at_18 and "acceptable" in at_18  # los 20 estudiantes alimentan estos


def test_el_comentario_de_la_encuesta_y_el_del_docente_no_salen_en_ninguna_respuesta(synthetic):
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        body = get(synthetic.teacher, grupoId=synthetic.big.id).content.decode("utf-8")

    assert "texto privado del estudiante" not in body and "Comentario accionable" not in body


# ─── de punta a punta: un intento jugado de verdad alimenta la analítica ───────────────────────
def test_un_intento_jugado_de_verdad_alimenta_la_analitica(estudiante, case_version_id, settings):
    """Cierra el intento por la API, abre el reporte (evento) y responde la encuesta: la lectura entiende todo eso."""
    settings.ATTEMPT_FEEDBACK_SURVEY = True
    declare_all_seeded(case_version_id)  # el caso sembrado no declara competencias: sin declaración no hay niveles
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    assert client.get(f"{BASE}/attempts/{attempt_id}/student-report").status_code == 200  # FEEDBACK_VIEWED
    assert client.post(f"{BASE}/attempts/{attempt_id}/feedback", {"rating": 5, "comment": "Útil"}, format="json").status_code == 201

    (row,) = analytics.load_rows({attempt.student_id}, attempt.case_version_id)

    assert row.attempt_id == str(attempt_id) and row.schema_version == 2 and row.ordinal == 1
    assert row.levels and set(row.levels) <= {INI, PRO, LOG, DES}  # el perfil por competencia llegó
    assert isinstance(row.non_recommended, int) and row.non_recommended >= 0
    assert row.reflection_definition == "ANY" and isinstance(row.reflection_covered, bool)
    assert isinstance(row.key_evidence, bool)
    assert row.system_evaluated is True  # la evaluación del sistema se creó al cerrar
    assert row.feedback_viewed_at is not None and row.feedback_viewed_at >= attempt.started_at
    assert row.rating == 5
    assert AttemptFeedback.objects.get(attempt_id=attempt_id).comment == "Útil"  # y el comentario quedó donde debe
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="FEEDBACK_VIEWED").count() == 1
