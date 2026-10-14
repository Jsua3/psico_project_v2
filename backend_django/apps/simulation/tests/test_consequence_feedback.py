"""E1-7 · Consecuencia narrativa ≠ retroalimentación pedagógica (RN-08 en el servidor, RF-17, N8).

Decisiones 6 y 10: en el momento de decidir la persona ve la **consecuencia** de lo que
eligió; la **retroalimentación** pedagógica (clasificación, deltas, mensaje evaluativo)
llega al cierre. Contrato C2, en modo *expand*: la respuesta de una decisión añade
``consequence`` (y ``retry``); con ``FEEDBACK_AT_CLOSE_ONLY`` no trae nada evaluativo. La
segunda oportunidad pasa a ser una regla de la versión del caso (``rules.secondChance``).
"""
import importlib
import json

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import AttemptEvent, CaseVersion, DecisionOption, SimulationAttempt
from apps.simulation.services import case_effects
from apps.simulation.services.case_rules import rules_of

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RN-08"), pytest.mark.req("RF-17")]

BASE = "/api/simulation"
User = get_user_model()
RETRY = case_effects.RETRY_EVENT_TYPES
REGISTERED = case_effects.REGISTERED_DECISION_EVENT_TYPES

#: Claves que revelan la evaluación de la decisión: no pueden viajar antes del cierre.
EVALUATIVE_KEYS = {
    "classification", "scoreDelta", "stressDelta", "trustDelta", "victimRiskDelta",
    "prohibitedConduct", "prohibitionReason", "message", "retryRequired",
}


def _keys(value):
    """Todas las claves de un JSON anidado."""
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            found.add(key)
            found |= _keys(child)
    elif isinstance(value, list):
        for child in value:
            found |= _keys(child)
    return found


def _set_rules(case_version_id, **rules):
    CaseVersion.objects.filter(pk=case_version_id).update(rules=json.dumps(rules))


def _first_node(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    return client, attempt_id, token, node_id


def _decide(client, attempt_id, token, option_id, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id, **extra},
        format="json",
    )


def _option(node_id, *classifications):
    return DecisionOption.objects.filter(
        source_node_id=node_id, classification__in=classifications
    ).order_by("id").first()


# ── la consecuencia ──────────────────────────────────────────────────────────
def test_con_la_bandera_apagada_conserva_el_feedback_y_agrega_la_consecuencia_del_nodo(
    estudiante, case_version_id, settings
):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "ADEQUATE")

    data = _decide(client, attempt_id, token, good.id).data["data"]

    assert data["feedback"]["classification"] == "ADEQUATE"
    assert data["consequence"] == {"text": good.target_node.narrative, "source": "NODE"}
    assert "retry" not in data


def test_la_consecuencia_sale_del_texto_de_la_opcion_cuando_existe(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "ADEQUATE")
    DecisionOption.objects.filter(pk=good.pk).update(consequence_text="La familia respira y te escucha.")

    data = _decide(client, attempt_id, token, good.id).data["data"]

    assert data["consequence"] == {"text": "La familia respira y te escucha.", "source": "OPTION"}


# ── la bandera FEEDBACK_AT_CLOSE_ONLY ────────────────────────────────────────
def test_con_la_bandera_encendida_la_respuesta_no_trae_nada_evaluativo(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = True
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "ADEQUATE")

    response = _decide(client, attempt_id, token, good.id)

    data = response.data["data"]
    assert response.status_code == 200
    assert set(data) == {"attempt", "consequence"}
    assert data["attempt"]["feedback"] is None
    assert data["attempt"]["currentNode"]["key"] != "hospital-urgencias"
    assert _keys(data) & EVALUATIVE_KEYS == set()
    assert data["consequence"]["source"] in ("OPTION", "NODE")


def test_con_la_bandera_encendida_el_reintento_no_es_evaluativo(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = True
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "RISKY", "INADEQUATE")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert set(data) == {"attempt", "consequence", "retry"}
    assert data["consequence"] is None
    assert data["retry"]["allowed"] is True
    assert not {"riesgosa", "inadecuada", "inadecuado"} & set(data["retry"]["message"].lower().split())
    # ``retry.message`` es el aviso neutro; lo evaluativo no puede viajar en ninguna otra parte.
    assert _keys({key: value for key, value in data.items() if key != "retry"}) & EVALUATIVE_KEYS == set()
    assert set(data["retry"]) == {"allowed", "message"}
    assert len(AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=RETRY)) == 1


def test_la_bandera_tambien_cubre_la_repeticion_de_una_decision(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = True
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "ADEQUATE")

    first = _decide(client, attempt_id, token, good.id, requestId="req-bandera-0001")
    second = _decide(client, attempt_id, token, good.id, requestId="req-bandera-0001")

    assert second.data["data"] == first.data["data"]
    assert _keys(second.data["data"]) & EVALUATIVE_KEYS == set()


def test_feedback_timing_at_close_en_la_version_oculta_lo_evaluativo_sin_la_bandera(
    estudiante, case_version_id, settings
):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    _set_rules(case_version_id, feedbackTiming="AT_CLOSE")
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)

    data = _decide(client, attempt_id, token, _option(node_id, "ADEQUATE").id).data["data"]

    assert set(data) == {"attempt", "consequence"}


# ── la segunda oportunidad como regla del caso ───────────────────────────────
def test_sin_segunda_oportunidad_la_respuesta_mala_se_registra_de_inmediato(
    estudiante, case_version_id, settings
):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    _set_rules(case_version_id, secondChance=False)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "RISKY", "INADEQUATE")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert data["feedback"]["retryRequired"] is False
    assert data["currentNode"]["id"] != node_id
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=RETRY).count() == 0
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=REGISTERED).count() == 1


def test_con_segunda_oportunidad_el_flujo_de_reintento_se_conserva(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "RISKY", "INADEQUATE")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert data["feedback"]["retryRequired"] is True
    assert data["retry"]["allowed"] is True
    assert data["currentNode"]["id"] == node_id


def test_el_caso_sembrado_conserva_la_segunda_oportunidad(db):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")

    assert rules_of(version).second_chance is True


def test_un_caso_creado_por_autoria_nace_sin_segunda_oportunidad(db):
    from apps.simulation.services.authoring.cases import create_case

    admin = User.objects.create_user(
        email="admin_reglas@x.com", password="x", nombre="Ad", apellido="Reglas", role="ADMIN"
    )

    editor = create_case({"title": "Caso de reglas"}, admin)

    assert rules_of(CaseVersion.objects.get(pk=editor["caseVersionId"])).second_chance is False


def test_las_reglas_ausentes_o_invalidas_toman_los_valores_por_defecto(db):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    for raw in ("{}", "", "no es json", "[1, 2]", '{"secondChance": "si", "feedbackTiming": "NUNCA"}'):
        version.rules = raw
        rules = rules_of(version)
        assert rules.second_chance is False
        assert rules.feedback_timing == "IMMEDIATE"


# ── la migración de datos ────────────────────────────────────────────────────
def test_la_migracion_enciende_la_segunda_oportunidad_en_las_versiones_existentes():
    migration = importlib.import_module("apps.simulation.migrations.0009_case_rules_existing_second_chance")

    assert json.loads(migration.with_second_chance("{}")) == {"secondChance": True}
    assert json.loads(migration.with_second_chance("")) == {"secondChance": True}
    assert json.loads(migration.with_second_chance("no es json")) == {"secondChance": True}
    assert json.loads(migration.with_second_chance('{"feedbackTiming": "AT_CLOSE"}')) == {
        "feedbackTiming": "AT_CLOSE", "secondChance": True,
    }
    assert json.loads(migration.with_second_chance('{"secondChance": false}')) == {"secondChance": False}


def test_con_la_bandera_encendida_un_intento_en_pausa_no_trae_el_reporte_en_vivo(
    estudiante, case_version_id, settings
):
    """Revisión de E1 (I-4): antes del cierre no viaja la evaluación por el reporte en vivo."""
    settings.FEEDBACK_AT_CLOSE_ONLY = True
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    _decide(client, attempt_id, token, _option(node_id, "ADEQUATE").id)
    paused = client.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json"
    ).data["data"]

    state = client.get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    active = client.get(f"{BASE}/cases/{case_version_id}/active-attempt").data["data"]

    for payload in (paused, state, active):
        assert payload["status"] == "PAUSED"
        assert payload["completionReport"] is None
        assert payload["supportResources"], "los recursos de apoyo siguen llegando"


def test_con_la_bandera_apagada_el_intento_en_pausa_conserva_su_resumen(estudiante, case_version_id, settings):
    settings.FEEDBACK_AT_CLOSE_ONLY = False
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)

    paused = client.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json"
    ).data["data"]

    assert paused["completionReport"]["status"] == "PAUSED"


def test_la_migracion_0009_funciona_sobre_filas_reales(db):
    migration = importlib.import_module("apps.simulation.migrations.0009_case_rules_existing_second_chance")
    from django.apps import apps as django_apps

    CaseVersion.objects.update(rules="{}")

    migration.enable_second_chance_on_existing_versions(django_apps, None)

    assert {json.loads(rules).get("secondChance") for rules in CaseVersion.objects.values_list("rules", flat=True)} == {True}
