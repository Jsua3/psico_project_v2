"""E1-9 · Evaluación formativa por niveles (RN-09, SIEP-CU-04, ED-2).

La evaluación del docente es **cualitativa**: cada criterio recibe un nivel (``EN_INICIO``,
``EN_PROCESO``, ``LOGRADO`` o ``DESTACADO``) y ningún DTO lleva un número (Tarea 14: se retiró la bandera
``RUBRIC_NUMERIC_TOTAL`` y la entrada ``score`` de 1.0–5.0). Las columnas ``score`` y ``total_score`` se conservan como
dato interno; una fila vieja sin ``level`` se lee con el nivel que su ``score`` deriva.
"""
import json
from decimal import ROUND_HALF_UP, Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from apps.simulation.models import LEVEL_INDEX, CriterionScore, RubricEvaluation, SimulationAttempt
from apps.simulation.services.rubric_service import overall_level

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RN-09"), pytest.mark.req("SIEP-CU-04")]

BASE = "/api/simulation"
User = get_user_model()


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_niveles@x.com", password="x", nombre="Ad", apellido="Niveles", role="ADMIN"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_niveles@x.com", password="x", nombre="Pro", apellido="Niveles", role="PROFESOR"
    )


@pytest.fixture
def attempt(estudiante, case_version_id):
    attempt_id, _ = _start(cl(estudiante), case_version_id)
    return attempt_id


def _criteria(client, attempt_id):
    view = client.get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation").data["data"]
    return [c["id"] for c in view["criteria"]]


def _save(client, attempt_id, items, comment="Buen trabajo"):
    return client.post(
        f"/api/instructor/attempts/{attempt_id}/rubric-evaluation",
        {"comment": comment, "scores": items},
        format="json",
    )


def test_guardar_con_niveles_persiste_level_origin_y_calcula_el_nivel_global(admin, attempt):
    client = cl(admin)
    ids = _criteria(client, attempt)

    response = _save(client, attempt, [{"criterionId": cid, "level": "LOGRADO", "comment": "ok"} for cid in ids])

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["overallLevel"] == "LOGRADO"
    assert {item["level"] for item in data["items"]} == {"LOGRADO"}
    evaluation = RubricEvaluation.objects.get(attempt_id=attempt)
    assert evaluation.origin == "DOCENTE" and evaluation.status == "EVALUATED"
    assert set(CriterionScore.objects.filter(rubric_evaluation=evaluation).values_list("level", flat=True)) == {"LOGRADO"}


def test_el_nivel_global_pondera_los_criterios(admin, attempt):
    client = cl(admin)
    view = client.get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]
    ids = [c["id"] for c in view["criteria"]]
    weights = {item["criterionId"]: Decimal(str(item["weight"])) for item in view["items"]}
    lightest = min(ids, key=lambda cid: weights[cid])
    levels = {cid: "DESTACADO" for cid in ids}
    levels[lightest] = "EN_INICIO"  # el criterio de menor peso no hunde un desempeño destacado

    data = _save(client, attempt, [{"criterionId": c, "level": levels[c]} for c in ids]).data["data"]

    expected = sum(weights[c] * LEVEL_INDEX[levels[c]] for c in ids) / sum(weights.values())
    assert data["overallLevel"] == {1: "EN_INICIO", 2: "EN_PROCESO", 3: "LOGRADO", 4: "DESTACADO"}[
        int(expected.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    ]


def test_el_nivel_global_pesa_mas_el_criterio_de_mas_peso():
    # Sin ponderar: (1 + 4) / 2 = 2,5 → LOGRADO; ponderado 70/30: 1,9 → EN_PROCESO.
    assert overall_level([(Decimal("70"), "EN_INICIO"), (Decimal("30"), "DESTACADO")]) == "EN_PROCESO"
    assert overall_level([(Decimal("30"), "EN_INICIO"), (Decimal("70"), "DESTACADO")]) == "LOGRADO"  # 3,1
    assert overall_level([(Decimal("10"), "EN_INICIO"), (Decimal("90"), "DESTACADO")]) == "DESTACADO"  # 3,7
    assert overall_level([(Decimal("50"), "LOGRADO"), (Decimal("50"), None)]) is None
    assert overall_level([]) is None


@pytest.mark.parametrize("level", ["EXCELENTE", "logrado", 3, "", "NO_LOGRADO"])
def test_un_nivel_fuera_del_vocabulario_responde_400(admin, attempt, level):
    client = cl(admin)
    cid = _criteria(client, attempt)[0]

    response = _save(client, attempt, [{"criterionId": cid, "level": level}])

    # ``""`` equivale a «sin calificar»: no se rechaza, queda pendiente.
    if level == "":
        assert response.status_code == 200
        assert response.data["data"]["overallLevel"] is None
    else:
        assert response.status_code == 400, response.data
        assert response.data["code"] == "VALIDATION_ERROR"
    assert not CriterionScore.objects.filter(level=level if level else "__none__").exists()


@pytest.mark.parametrize("score", [0, "0", 0.5, 3, 3.0, 5.5, -1])
def test_un_score_heredado_responde_400_con_el_campo(admin, attempt, score):
    client = cl(admin)
    cid = _criteria(client, attempt)[0]

    response = _save(client, attempt, [{"criterionId": cid, "score": score}])

    assert response.status_code == 400, response.data
    assert response.data["field"] == "scores"
    assert "level" in response.data["message"]
    assert not RubricEvaluation.objects.filter(attempt_id=attempt).exists()


def test_un_score_junto_al_nivel_tambien_se_rechaza(admin, attempt):
    client = cl(admin)
    cid = _criteria(client, attempt)[0]

    response = _save(client, attempt, [{"criterionId": cid, "level": "LOGRADO", "score": 4}])

    assert response.status_code == 400 and response.data["field"] == "scores"


def _claves(valor):
    """Todas las claves de un DTO, a cualquier profundidad."""
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            yield clave
            yield from _claves(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            yield from _claves(hijo)


NUMERICAS = {"score", "total_score", "totalScore", "minScore", "maxScore", "step"}


def test_ningun_dto_de_la_rubrica_lleva_un_puntaje(admin, estudiante, attempt):
    client = cl(admin)
    vacia = client.get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]
    ids = [c["id"] for c in vacia["criteria"]]
    guardada = _save(client, attempt, [{"criterionId": c, "level": "LOGRADO", "comment": "ok"} for c in ids]).data["data"]
    trace = client.get(f"/api/instructor/attempts/{attempt}/trace").data["data"]
    propia = cl(estudiante).get(f"{BASE}/attempts/{attempt}/evaluation").data["data"]
    plantilla = client.get(f"/api/rubrics/{guardada['rubricId']}").data["data"]

    for nombre, dto in (("vacia", vacia), ("guardada", guardada), ("traza", trace), ("propia", propia), ("rubrica", plantilla)):
        assert not NUMERICAS & set(_claves(dto)), nombre
    # Las columnas internas siguen escritas: el cambio es reversible.
    evaluation = RubricEvaluation.objects.get(attempt_id=attempt)
    assert evaluation.total_score == Decimal("3.00")
    assert set(CriterionScore.objects.filter(rubric_evaluation=evaluation).values_list("score", flat=True)) == {Decimal("3.00")}


def test_la_vista_trae_los_niveles_con_su_descriptor(admin, attempt):
    view = cl(admin).get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]

    assert [(n["value"], n["label"]) for n in view["levels"]] == [
        ("EN_INICIO", "En inicio"), ("EN_PROCESO", "En proceso"), ("LOGRADO", "Logrado"), ("DESTACADO", "Destacado"),
    ]
    assert all(n["descriptor"] for n in view["levels"])


def test_cada_criterio_trae_el_codigo_de_su_competencia_el_mismo_de_la_valoracion_del_sistema(admin, attempt):
    """El docente ve su valoración junto a la del sistema emparejando por código de competencia."""
    from apps.simulation.models import RubricCriterion
    from apps.simulation.assessment.competencies import competency_code_of

    view = cl(admin).get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]

    assert view["criteria"]
    criteria = {c.id: c for c in RubricCriterion.objects.filter(id__in=[c["id"] for c in view["criteria"]]).select_related("competency_ref")}
    for served in view["criteria"]:
        assert served["competency"], f"el criterio {served['id']} no trae su competencia"
        assert served["competency"] == competency_code_of(criteria[served["id"]])


def test_una_fila_vieja_con_score_y_sin_nivel_se_lee_con_el_nivel_derivado(admin, estudiante, attempt):
    client = cl(admin)
    ids = _criteria(client, attempt)
    _save(client, attempt, [{"criterionId": c, "level": "EN_INICIO"} for c in ids])
    # Fila anterior a E1: score en la escala 1–5 y nivel vacío.
    CriterionScore.objects.filter(rubric_evaluation__attempt_id=attempt).update(score=Decimal("5.0"), level=None)

    view = client.get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]
    propia = cl(estudiante).get(f"{BASE}/attempts/{attempt}/evaluation").data["data"]
    trace = client.get(f"/api/instructor/attempts/{attempt}/trace").data["data"]

    assert {item["level"] for item in view["items"]} == {"DESTACADO"}
    assert view["overallLevel"] == "DESTACADO"
    assert {c["level"] for c in propia["evaluations"][0]["criteria"]} == {"DESTACADO"}
    assert trace["rubricEvaluations"][0]["overallLevel"] == "DESTACADO"


def test_la_bandera_de_total_numerico_ya_no_existe(settings):
    assert not hasattr(settings, "RUBRIC_NUMERIC_TOTAL")
    assert "RUBRIC_NUMERIC_TOTAL" not in settings.CONTRACT_FLAGS_REGISTRY


def test_el_dueno_lee_su_evaluacion_sin_ningun_numero(admin, estudiante, attempt):
    client = cl(admin)
    ids = _criteria(client, attempt)
    _save(client, attempt, [{"criterionId": c, "level": "EN_PROCESO", "comment": "sigue así"} for c in ids],
          comment="Vas bien")

    response = cl(estudiante).get(f"{BASE}/attempts/{attempt}/evaluation")

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["attemptId"] == attempt
    [evaluation] = data["evaluations"]
    assert evaluation["comment"] == "Vas bien"
    assert evaluation["overallLevel"] == "EN_PROCESO"
    assert evaluation["origin"] == "DOCENTE"
    assert [c["level"] for c in evaluation["criteria"]] == ["EN_PROCESO"] * len(ids)
    dumped = json.dumps(data)
    for forbidden in ("score", "Score", "weight", "total", "maxScore"):
        assert forbidden not in dumped, forbidden
    assert not NUMERICAS & set(_claves(data))


def test_una_evaluacion_pendiente_no_se_muestra_al_estudiante(admin, estudiante, attempt):
    client = cl(admin)
    cid = _criteria(client, attempt)[0]
    _save(client, attempt, [{"criterionId": cid, "level": "LOGRADO"}])  # falta el resto: PENDING

    response = cl(estudiante).get(f"{BASE}/attempts/{attempt}/evaluation")

    assert response.status_code == 200
    assert response.data["data"]["evaluations"] == []


def test_otro_estudiante_y_el_profesor_no_leen_la_evaluacion_del_dueno(admin, profesor, attempt):
    other = User.objects.create_user(
        email="otro_niveles@x.com", password="x", nombre="O", apellido="N", role="ESTUDIANTE"
    )

    assert cl(other).get(f"{BASE}/attempts/{attempt}/evaluation").status_code == 403
    assert cl(profesor).get(f"{BASE}/attempts/{attempt}/evaluation").status_code == 403


def test_el_check_de_la_base_rechaza_un_nivel_fuera_del_vocabulario(admin, attempt):
    client = cl(admin)
    ids = _criteria(client, attempt)
    _save(client, attempt, [{"criterionId": ids[0], "level": "LOGRADO"}])
    score = CriterionScore.objects.get(rubric_evaluation__attempt_id=attempt, rubric_criterion_id=ids[0])

    with pytest.raises(IntegrityError, match="criterion_scores_level_check"), transaction.atomic():
        CriterionScore.objects.filter(pk=score.pk).update(level="EXCELENTE")


def test_el_estudiante_dueno_es_quien_inicio_el_intento(estudiante, attempt):
    assert SimulationAttempt.objects.get(pk=attempt).student_id == estudiante.id


def test_la_migracion_deriva_el_nivel_de_las_calificaciones_anteriores_a_e1(admin, attempt):
    """Revisión de E1 (I-5): una evaluación guardada con scores 1–5 no queda sin niveles."""
    import importlib

    from django.apps import apps as django_apps

    migration = importlib.import_module("apps.simulation.migrations.0012_formative_levels_backfill")
    client = cl(admin)
    ids = _criteria(client, attempt)
    _save(client, attempt, [{"criterionId": c, "level": "LOGRADO"} for c in ids])
    for c, sc in zip(ids, [4.0, 3.0, 5.0, 1.0, 2.0, 3.0]):  # fila anterior a E1: score 1–5 y sin nivel
        CriterionScore.objects.filter(rubric_evaluation__attempt_id=attempt, rubric_criterion_id=c).update(
            score=Decimal(str(sc)), level=None)

    migration.backfill_levels(django_apps, None)

    by_criterion = dict(CriterionScore.objects.filter(
        rubric_evaluation__attempt_id=attempt).values_list("rubric_criterion_id", "level"))
    expected = ["LOGRADO", "LOGRADO", "DESTACADO", "EN_INICIO", "EN_PROCESO", "LOGRADO"][: len(ids)]
    assert [by_criterion[c] for c in ids] == expected
    view = client.get(f"/api/instructor/attempts/{attempt}/rubric-evaluation").data["data"]
    assert view["overallLevel"] is not None
