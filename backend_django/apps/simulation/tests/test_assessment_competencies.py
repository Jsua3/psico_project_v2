"""E6-1b · El perfil por competencia de un intento (RQ-NEG-001, RQ-NEG-002; mesa §A20, R3 a R5 de la fase; ``borrador-2``).

Cada decisión registrada aporta SOLO a las competencias que su opción declara en ``effects.competencies`` y con el nivel
que declara; una opción que no declara nada no aporta a ninguna (la competencia queda «sin evidencia»: lo prueba
``test_competencies_by_class``). El nivel de una competencia es el promedio de sus aportes (mitad hacia arriba) con un
tope en ``EN_PROCESO`` si una respuesta contraindicada la tocó. Son definiciones en BORRADOR (Psicología): la regla es una
función y las tablas viven en ``assessment.competencies``.
"""
import json
import uuid
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.assessment import competencies as profile
from apps.simulation.assessment import definitions
from apps.simulation.models import (
    CaseVersion,
    Competency,
    DecisionOption,
    FormativeLevel,
    Rubric,
    RubricCriterion,
    SimulationCase,
)
from shared.testing import measure

pytestmark = [pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002")]

User = get_user_model()
D, L, P, I = (
    FormativeLevel.DESTACADO, FormativeLevel.LOGRADO, FormativeLevel.EN_PROCESO, FormativeLevel.EN_INICIO,
)


# ─── el nivel de una competencia: puro ────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("contributions", "expected"),
    [
        ([], None),
        ([(D, False)], D),
        ([(D, False)] * 5, D),
        ([(L, False), (P, False)], L),  # 2,5 → 3: la mitad sube
        ([(P, False), (I, False)], P),  # 1,5 → 2
        ([(D, False), (D, False), (L, False)], D),  # 3,67 → 4
        ([(D, False)] * 4 + [(I, True)] * 2, P),  # promedio 3,0 (LOGRADO) pero una crítica la deja en EN_PROCESO
        ([(I, True)], I),  # el tope no sube nada
        ([(D, False), (I, False)], L),  # un EN_INICIO explícito (no crítica por defecto) no pone tope: 2,5 → 3
        ([(P, True), (P, False)], P),
    ],
)
def test_el_nivel_de_una_competencia_es_el_promedio_con_tope_si_hubo_una_critica(contributions, expected):
    assert profile.level_of(contributions) == expected


# ─── lo que aporta una decisión: puro ─────────────────────────────────────────────────────────
def _option(classification="ADEQUATE", effects=None, prohibited=False):
    return DecisionOption(
        option_key=f"o-{uuid.uuid4().hex[:6]}", classification=classification, prohibited_conduct=prohibited,
        effects=json.dumps(effects) if effects is not None else None,
    )


CODES = {"PAP", "ETICA", "RUTA"}


def test_un_codigo_que_no_es_de_la_rubrica_se_ignora_y_si_no_queda_ninguno_no_aporta_a_nadie():
    mixed = _option("ADEQUATE", {"competencies": {"PAP": "LOGRADO", "OTRA": "DESTACADO"}})
    only_foreign = _option("ADEQUATE", {"competencies": {"OTRA": "DESTACADO"}})

    assert profile.contributions(mixed, CODES) == {"PAP": (L, False)}
    assert profile.contributions(only_foreign, CODES) == {}


# ─── las competencias de la rúbrica y el perfil: con base de datos ────────────────────────────
@pytest.fixture
def owner(db):
    return User.objects.create_user(
        email=f"perfil_{uuid.uuid4().hex[:6]}@x.com", password="pass1234", nombre="N", apellido="A", role="ADMIN"
    )


@pytest.fixture
def version(owner):
    case = SimulationCase.objects.create(code=f"PF-{uuid.uuid4().hex[:6].upper()}", title="Perfil", created_by=owner)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner
    )


def _catalog(code, name):
    return Competency.objects.create(code=code, name=name)


@pytest.fixture
def rubric(owner, version):
    """Tres competencias en cuatro criterios activos (dos son de la misma) y uno inactivo."""
    pap, etica = _catalog("T3_PAP", "Primeros auxilios psicológicos"), _catalog("T3_ETICA", "Ética profesional")
    rubric = Rubric.objects.create(case_version=version, name="Rúbrica del perfil", active=True, created_by=owner)
    for order, (text, ref, active) in enumerate([
        ("T3_PAP", pap, True), ("T3_ETICA", etica, True), ("T3_PAP", pap, True),
        ("Reflexión y bitácora", None, True), ("T3_INACTIVA", None, False),
    ]):
        RubricCriterion.objects.create(
            rubric=rubric, competency=text, competency_ref=ref, title=f"Criterio {order}", weight=20,
            display_order=order, active=active,
        )
    return rubric


def _attempt(version):
    return SimpleNamespace(case_version_id=version.id)


def _event(option, event_type="DECISION_SELECTED"):
    return SimpleNamespace(event_type=event_type, decision_option_id=1, decision_option=option)


def test_las_competencias_de_la_rubrica_salen_una_vez_en_el_orden_de_los_criterios(rubric):
    assert profile.rubric_competencies(rubric) == [
        profile.Competence("T3_PAP", "Primeros auxilios psicológicos"),
        profile.Competence("T3_ETICA", "Ética profesional"),
        profile.Competence("REFLEXION_Y_BITACORA", "Reflexión y bitácora"),  # sin enlace: el texto, normalizado
    ]


def test_un_recorrido_que_declara_destacado_en_todas_da_destacado_en_todas(version, rubric):
    declared = {"T3_PAP": "DESTACADO", "T3_ETICA": "DESTACADO", "REFLEXION_Y_BITACORA": "DESTACADO"}
    events = [_event(_option("ADEQUATE", {"competencies": declared})) for _ in range(4)]

    levels = profile.competency_profile(_attempt(version), events)

    assert [{k: v for k, v in e.items() if k != "evidence"} for e in levels] == [
        {"code": "T3_PAP", "name": "Primeros auxilios psicológicos", "level": "DESTACADO", "basis": "DECLARED"},
        {"code": "T3_ETICA", "name": "Ética profesional", "level": "DESTACADO", "basis": "DECLARED"},
        {"code": "REFLEXION_Y_BITACORA", "name": "Reflexión y bitácora", "level": "DESTACADO", "basis": "DECLARED"},
    ]
    assert all(len(e["evidence"]) == 4 for e in levels)


def test_una_contraindicada_que_declara_todas_las_deja_en_en_proceso_como_maximo(version, rubric):
    declared = {"T3_PAP": "DESTACADO", "T3_ETICA": "DESTACADO", "REFLEXION_Y_BITACORA": "DESTACADO"}
    events = [_event(_option("ADEQUATE", {"competencies": declared})) for _ in range(5)]
    events.append(_event(_option("INADEQUATE", {"competencies": declared})))

    levels = profile.competency_profile(_attempt(version), events)

    assert {entry["level"] for entry in levels} == {"EN_PROCESO"}  # el promedio es 4, con tope


def test_cada_decision_aporta_solo_a_las_competencias_que_declara(version, rubric):
    events = [
        _event(_option("RISKY", {"competencies": {"T3_PAP": "DESTACADO"}})),  # solo PAP, con DESTACADO
        _event(_option("ADEQUATE", {"competencies": {"T3_ETICA": "LOGRADO"}})),  # solo ETICA, con LOGRADO
        _event(_option("INADEQUATE")),  # no declara nada: no aporta a nadie
    ]

    by_code = {e["code"]: e["level"] for e in profile.competency_profile(_attempt(version), events)}

    assert by_code == {"T3_PAP": "DESTACADO", "T3_ETICA": "LOGRADO", "REFLEXION_Y_BITACORA": None}


def test_una_competencia_sin_ninguna_decision_que_la_toque_queda_sin_nivel(version, rubric):
    events = [_event(_option("ADEQUATE", {"competencies": {"T3_PAP": "LOGRADO"}}))]

    by_code = {e["code"]: e["level"] for e in profile.competency_profile(_attempt(version), events)}

    assert by_code == {"T3_PAP": "LOGRADO", "T3_ETICA": None, "REFLEXION_Y_BITACORA": None}


def test_una_conducta_prohibida_con_el_nivel_declarado_nunca_da_logrado_en_la_competencia(version, rubric):
    events = [_event(_option("ADEQUATE", {"competencies": {"T3_PAP": "DESTACADO"}}, prohibited=True))]

    by_code = {e["code"]: e["level"] for e in profile.competency_profile(_attempt(version), events)}

    assert by_code["T3_PAP"] == "EN_PROCESO"  # DESTACADO declarado, con el tope de la conducta prohibida


# ─── de dónde sale el nivel: siempre lo declara el autor ──────────────────────────────────────
def test_cada_entrada_dice_que_su_nivel_lo_declaro_el_autor_o_que_no_tiene_base(version, rubric):
    declared = _event(_option("RISKY", {"competencies": {"T3_PAP": "DESTACADO"}}))
    undeclared = _event(_option("ADEQUATE"))

    only_undeclared = profile.competency_profile(_attempt(version), [undeclared])
    mixed = profile.competency_profile(_attempt(version), [declared, undeclared])

    assert {e["code"]: e["basis"] for e in only_undeclared} == {
        "T3_PAP": None, "T3_ETICA": None, "REFLEXION_Y_BITACORA": None}  # lo no declarado no es evidencia
    assert {e["code"]: e["basis"] for e in mixed} == {
        "T3_PAP": "DECLARED", "T3_ETICA": None, "REFLEXION_Y_BITACORA": None}


def test_una_competencia_sin_evidencia_no_tiene_nivel_ni_base(version, rubric):
    entries = profile.competency_profile(_attempt(version), [])

    assert [(e["level"], e["basis"], e["evidence"]) for e in entries] == [(None, None, [])] * 3


def test_la_version_de_la_regla_del_perfil_es_la_de_las_definiciones():
    """Se sella en cada reporte; cambia al cambiar las tablas de nivel, el tope o el promedio."""
    assert profile.PROFILE_RULES == definitions.PROFILE_RULES and definitions.PROFILE_RULES == "borrador-2"


def test_solo_cuentan_las_decisiones_registradas(version, rubric):
    """Los reintentos (la primera respuesta que el juego no aplicó) y los demás eventos no aportan."""
    declared = {"T3_PAP": "DESTACADO", "T3_ETICA": "DESTACADO", "REFLEXION_Y_BITACORA": "DESTACADO"}
    events = [
        _event(_option("INADEQUATE", {"competencies": declared}), "DECISION_RETRY_REQUIRED"),
        _event(_option("INADEQUATE", {"competencies": declared}), "PROHIBITED_DECISION_RETRY_REQUIRED"),
        SimpleNamespace(event_type="NODE_ENTERED", decision_option_id=None, decision_option=None),
        _event(_option("ADEQUATE", {"competencies": declared})),
    ]

    levels = profile.competency_profile(_attempt(version), events)

    assert {entry["level"] for entry in levels} == {"DESTACADO"}


def test_sin_rubrica_activa_el_perfil_esta_vacio(version, db):
    Rubric.objects.update(active=False)  # ni la del caso ni la rúbrica por defecto

    assert profile.competency_profile(_attempt(version), [_event(_option("ADEQUATE"))]) == []


def test_una_rubrica_sin_criterios_activos_da_un_perfil_vacio(owner, version):
    Rubric.objects.update(active=False)
    Rubric.objects.create(case_version=version, name="Vacía", active=True, created_by=owner)

    assert profile.competency_profile(_attempt(version), [_event(_option("ADEQUATE"))]) == []


def test_el_numero_de_consultas_no_crece_con_las_decisiones(version, rubric):
    declared = {"T3_PAP": "LOGRADO", "T3_ETICA": "LOGRADO"}
    few = [_event(_option("ADEQUATE", {"competencies": declared})) for _ in range(1)]
    many = [_event(_option("RISKY", {"competencies": declared})) for _ in range(40)]

    _, small = measure(lambda: profile.competency_profile(_attempt(version), few))
    _, large = measure(lambda: profile.competency_profile(_attempt(version), many))

    assert small.queries == large.queries
    assert small.queries <= 4
