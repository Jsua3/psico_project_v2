"""Tarea 8 · Competencias y evidencia por clase de respuesta (RQ-NEG-001, RQ-NEG-002; Revisión de foco 3).

Con el modelo de respuesta (``borrador-2``) el nivel de una competencia sale SOLO de lo que el autor declara en
``effects.competencies`` de las opciones que el estudiante eligió:

- una opción que no declara nada no aporta a ninguna competencia (se acabó el «a todas por defecto»): la competencia
  queda «sin evidencia» (``level None``, ``basis None``, ``evidence []``);
- ``CONTRAINDICATED`` pone el tope ``EN_PROCESO`` a cada competencia que toca, aunque el autor declare más;
- cada entrada del perfil lleva ``evidence[]``: las decisiones registradas que la sostienen, en orden, con su clase y el
  nivel que el autor declaró;
- la analítica solo compara el primer y el segundo intento de una serie si ambos se cerraron con el MISMO
  ``schemaVersion`` (un reporte v2 y uno v3 no se miden con la misma vara).
"""
import json
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.assessment import analytics, definitions, evidence
from apps.simulation.assessment import competencies as profile
from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.models import (
    CaseVersion,
    Competency,
    DecisionOption,
    FormativeLevel,
    Rubric,
    RubricCriterion,
    SimulationCase,
)

pytestmark = [pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002")]

User = get_user_model()
D, L, P, I = (
    FormativeLevel.DESTACADO, FormativeLevel.LOGRADO, FormativeLevel.EN_PROCESO, FormativeLevel.EN_INICIO,
)
REC, ACC, RISKY, CONTRA = (
    ResponseClass.RECOMMENDED, ResponseClass.ACCEPTABLE, ResponseClass.RISKY, ResponseClass.CONTRAINDICATED,
)
CODES = {"PAP", "ETICA", "RUTA"}


def _option(response_class, competencies=None, text="Una respuesta"):
    effects = {}
    if competencies is not None:
        effects["competencies"] = competencies
    return DecisionOption(
        option_key=f"o-{uuid.uuid4().hex[:6]}", text=text, response_class=response_class.value,
        prohibited_conduct=response_class is CONTRA, effects=json.dumps(effects),
    )


# ─── la tabla de referencia y el tope ─────────────────────────────────────────────────────────
def test_la_tabla_por_clase_es_la_del_borrador_y_el_tope_es_en_proceso():
    assert profile.LEVEL_BY_CLASS == {REC: D, ACC: L, RISKY: P, CONTRA: I}
    assert profile.CONTRAINDICATED_CAP == P
    assert not hasattr(profile, "LEVEL_BY_SEVERITY") and not hasattr(profile, "CRITICAL_CAP")


# ─── lo que aporta una opción: puro ───────────────────────────────────────────────────────────
@pytest.mark.parametrize("response_class", list(ResponseClass))
def test_una_opcion_sin_competencias_declaradas_no_aporta_a_ninguna(response_class):
    """Revisión de foco 3: el «a todas por defecto» desapareció; sin declaración no hay aporte."""
    assert profile.contributions(_option(response_class), CODES) == {}
    assert profile.contributions(_option(response_class, {}), CODES) == {}


def test_con_competencias_declaradas_aporta_solo_a_esas_y_con_esos_niveles():
    option = _option(RISKY, {"PAP": "DESTACADO", "ETICA": "EN_INICIO"})

    assert profile.contributions(option, CODES) == {"PAP": (D, False), "ETICA": (I, False)}


def test_un_codigo_que_no_es_de_la_rubrica_se_ignora():
    mixed = _option(ACC, {"PAP": "LOGRADO", "OTRA": "DESTACADO"})
    only_foreign = _option(ACC, {"OTRA": "DESTACADO"})

    assert profile.contributions(mixed, CODES) == {"PAP": (L, False)}
    assert profile.contributions(only_foreign, CODES) == {}


def test_una_contraindicada_pone_el_tope_aunque_el_autor_declare_destacado():
    """«Una conducta revictimizante no puede dar logrado»: el tope es de la clase, no del nivel que se declaró."""
    option = _option(CONTRA, {"PAP": "DESTACADO"})

    contributions = profile.contributions(option, CODES)

    assert contributions == {"PAP": (D, True)}
    assert profile.level_of([contributions["PAP"]]) == P


def test_la_clase_se_lee_de_la_opcion_con_el_respaldo_de_los_datos_antiguos():
    """Sin ``response_class`` manda lo antiguo (R-8): la conducta prohibida es contraindicada y pone el tope."""
    legacy = DecisionOption(
        option_key="vieja", classification="ADEQUATE", prohibited_conduct=True,
        effects=json.dumps({"competencies": {"PAP": "DESTACADO"}}),
    )

    assert profile.contributions(legacy, CODES) == {"PAP": (D, True)}


# ─── el perfil: con base de datos ─────────────────────────────────────────────────────────────
@pytest.fixture
def owner(db):
    return User.objects.create_user(
        email=f"clase_{uuid.uuid4().hex[:6]}@x.com", password="pass1234", nombre="N", apellido="A", role="ADMIN"
    )


@pytest.fixture
def version(owner):
    case = SimulationCase.objects.create(code=f"CL-{uuid.uuid4().hex[:6].upper()}", title="Clases", created_by=owner)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner
    )


@pytest.fixture
def rubric(owner, version):
    """Tres competencias, una por criterio."""
    rubric = Rubric.objects.create(case_version=version, name="Rúbrica por clase", active=True, created_by=owner)
    for order, (code, name) in enumerate([("T8_PAP", "Primeros auxilios"), ("T8_ETICA", "Ética"), ("T8_RUTA", "Ruta")]):
        RubricCriterion.objects.create(
            rubric=rubric, competency=code, competency_ref=Competency.objects.create(code=code, name=name),
            title=f"Criterio {order}", weight=30, display_order=order, active=True,
        )
    return rubric


def _attempt(version):
    return SimpleNamespace(case_version_id=version.id)


def _event(option, node_title, event_type="DECISION_SELECTED"):
    return SimpleNamespace(
        event_type=event_type, decision_option_id=1, decision_option=option, node=SimpleNamespace(title=node_title),
    )


def _profile_of(version, events):
    return {entry["code"]: entry for entry in profile.competency_profile(_attempt(version), events)}


def test_un_recorrido_sin_declaraciones_deja_todas_las_competencias_sin_evidencia(version, rubric):
    events = [_event(_option(REC), "Escena 1"), _event(_option(ACC), "Escena 2"), _event(_option(CONTRA), "Escena 3")]

    entries = profile.competency_profile(_attempt(version), events)

    assert [e["code"] for e in entries] == ["T8_PAP", "T8_ETICA", "T8_RUTA"]
    assert all(e["level"] is None and e["basis"] is None and e["evidence"] == [] for e in entries)


def test_el_nivel_sale_solo_de_lo_declarado_y_la_base_es_declared(version, rubric):
    events = [
        _event(_option(REC, {"T8_PAP": "DESTACADO"}), "Escena 1"),
        _event(_option(ACC, {"T8_PAP": "EN_PROCESO", "T8_ETICA": "LOGRADO"}), "Escena 2"),
        _event(_option(REC), "Escena 3"),  # sin declaración: no aporta a nadie
    ]

    by_code = _profile_of(version, events)

    assert by_code["T8_PAP"]["level"] == "LOGRADO"  # (4 + 2) / 2 = 3
    assert by_code["T8_ETICA"]["level"] == "LOGRADO"
    assert by_code["T8_RUTA"]["level"] is None
    assert [by_code[c]["basis"] for c in ("T8_PAP", "T8_ETICA", "T8_RUTA")] == ["DECLARED", "DECLARED", None]


def test_una_contraindicada_deja_en_en_proceso_como_maximo_la_competencia_que_toca(version, rubric):
    events = [
        _event(_option(REC, {"T8_PAP": "DESTACADO", "T8_ETICA": "DESTACADO"}), "Escena 1"),
        _event(_option(CONTRA, {"T8_PAP": "DESTACADO"}), "Escena 2"),
    ]

    by_code = _profile_of(version, events)

    assert by_code["T8_PAP"]["level"] == "EN_PROCESO"  # el promedio da DESTACADO; el tope lo baja
    assert by_code["T8_ETICA"]["level"] == "DESTACADO"  # la contraindicada no la tocó


def test_la_evidencia_lista_las_decisiones_que_sostienen_el_nivel_en_orden(version, rubric):
    events = [
        _event(_option(REC, {"T8_PAP": "DESTACADO"}, text="Contener"), "Escena 1"),
        _event(_option(RISKY, {"T8_ETICA": "EN_PROCESO"}, text="Preguntar"), "Escena 2"),
        _event(_option(RISKY, text="No declara"), "Escena 3"),
        _event(_option(ACC, {"T8_PAP": "LOGRADO", "T8_ETICA": "LOGRADO"}, text="Derivar"), "Escena 4"),
    ]

    by_code = _profile_of(version, events)

    assert by_code["T8_PAP"]["evidence"] == [
        {"order": 1, "nodeTitle": "Escena 1", "optionText": "Contener", "class": "RECOMMENDED", "level": "DESTACADO"},
        {"order": 4, "nodeTitle": "Escena 4", "optionText": "Derivar", "class": "ACCEPTABLE", "level": "LOGRADO"},
    ]
    assert by_code["T8_ETICA"]["evidence"] == [
        {"order": 2, "nodeTitle": "Escena 2", "optionText": "Preguntar", "class": "RISKY", "level": "EN_PROCESO"},
        {"order": 4, "nodeTitle": "Escena 4", "optionText": "Derivar", "class": "ACCEPTABLE", "level": "LOGRADO"},
    ]
    assert by_code["T8_RUTA"]["evidence"] == []


def test_la_evidencia_lleva_el_nivel_declarado_aunque_el_tope_lo_baje(version, rubric):
    events = [_event(_option(CONTRA, {"T8_PAP": "DESTACADO"}, text="Revictimizar"), "Escena 1")]

    entry = _profile_of(version, events)["T8_PAP"]

    assert entry["level"] == "EN_PROCESO"
    assert entry["evidence"] == [
        {"order": 1, "nodeTitle": "Escena 1", "optionText": "Revictimizar", "class": "CONTRAINDICATED",
         "level": "DESTACADO"},
    ]


def test_el_orden_cuenta_las_decisiones_registradas_y_no_los_reintentos(version, rubric):
    events = [
        _event(_option(RISKY, {"T8_PAP": "EN_INICIO"}, text="Primera"), "Escena 1", "DECISION_RETRY_REQUIRED"),
        _event(_option(ACC, {"T8_PAP": "LOGRADO"}, text="Segunda"), "Escena 1"),
        _event(_option(REC, {"T8_PAP": "DESTACADO"}, text="Tercera"), "Escena 2"),
    ]

    entry = _profile_of(version, events)["T8_PAP"]

    assert [e["order"] for e in entry["evidence"]] == [1, 2]
    assert [e["optionText"] for e in entry["evidence"]] == ["Segunda", "Tercera"]


def test_la_regla_sellada_es_borrador_2():
    assert definitions.PROFILE_RULES == "borrador-2" and profile.PROFILE_RULES == "borrador-2"


# ─── lo no recomendado se mide por clase ──────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("response_class", "expected"), [(REC, 0), (ACC, 0), (RISKY, 1), (CONTRA, 1)],
)
def test_no_recomendada_es_riesgosa_o_contraindicada(response_class, expected):
    event = SimpleNamespace(event_type="DECISION_SELECTED", decision_option_id=1, decision_option=_option(response_class))

    assert evidence.non_recommended_count([event]) == expected


def test_una_decision_sin_clase_declarada_cae_a_los_datos_antiguos():
    legacy = DecisionOption(option_key="v", classification="INADEQUATE", prohibited_conduct=False)
    event = SimpleNamespace(event_type="DECISION_SELECTED", decision_option_id=1, decision_option=legacy)

    assert evidence.non_recommended_count([event]) == 1


# ─── la analítica compara solo filas del mismo schemaVersion ──────────────────────────────────
def _row(student, ordinal, non_recommended, schema_version, started_days=0):
    return analytics.AttemptRow(
        attempt_id=f"{student}-{ordinal}", student_id=student, case_id=1,
        started_at=datetime(2026, 10, 1) + timedelta(days=started_days), ordinal=ordinal,
        schema_version=schema_version, non_recommended=non_recommended,
    )


def _series_of(*pairs):
    """Una serie por estudiante; ``pairs`` son ``(estudiante, primera fila, segunda fila)``."""
    return analytics._series([row for _, one, two in pairs for row in (one, two)])


def test_primero_frente_a_segundo_solo_empareja_filas_del_mismo_schema_version():
    same = [(s, _row(s, 1, 4, 3), _row(s, 2, 2, 3, 1)) for s in range(5)]
    mixed = [(s, _row(s, 1, 6, 2), _row(s, 2, 0, 3, 1)) for s in range(10, 15)]

    result = analytics._first_vs_second(_series_of(*same, *mixed), 5)

    assert result == {
        "students": 5, "series": 5, "firstMean": 4.0, "secondMean": 2.0, "nonRecommendedDeltaPct": -50.0,
    }


def test_una_cohorte_solo_con_series_mezcladas_no_aporta_nada():
    mixed = [(s, _row(s, 1, 6, 2), _row(s, 2, 0, 3, 1)) for s in range(6)]

    assert analytics._first_vs_second(_series_of(*mixed), 5) is None


def test_el_tercer_intento_del_mismo_schema_version_se_empareja_con_el_primero():
    """La serie v2, v3, v3: el primer par de la MISMA versión son los dos v3; el v2 queda fuera."""
    rows = []
    for student in range(5):
        rows += [_row(student, 1, 9, 2), _row(student, 2, 4, 3, 1), _row(student, 3, 2, 3, 2)]

    result = analytics._first_vs_second(analytics._series(rows), 5)

    assert result["firstMean"] == 4.0 and result["secondMean"] == 2.0
