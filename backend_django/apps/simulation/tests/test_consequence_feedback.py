"""La decisión devuelve solo la consecuencia (RN-08, RF-17, N8; Tarea 5 del modelo de métricas).

Al decidir, la persona ve la **consecuencia** de lo que eligió y nada más: ni clasificación, ni
cifras, ni mensaje evaluativo. La respuesta tiene UNA sola forma, en todos los casos:
``{attempt, consequence}`` y, cuando se concede la segunda oportunidad, ``{attempt, consequence, retry}``.
Lo evaluativo llega al cierre, por el reporte congelado. La segunda oportunidad es una regla de la versión
(``rules.secondChance``) y la clase de la respuesta sale del motor (``response_effects``).
"""
import importlib
import json

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import (
    REGISTERED_DECISION_EVENT_TYPES,
    RETRY_EVENT_TYPES,
    AttemptEvent,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
)
from apps.simulation.services import case_state
from apps.simulation.services.case_rules import rules_of
from apps.simulation.services.game_service import RETRY_NEUTRAL_MESSAGE

from .case_exploration import explore_what_the_case_asks_for
from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RN-08"), pytest.mark.req("RF-17")]

BASE = "/api/simulation"
User = get_user_model()
RETRY = RETRY_EVENT_TYPES
REGISTERED = REGISTERED_DECISION_EVENT_TYPES

#: Claves que revelan la evaluación de la decisión: no viajan al decidir, en ningún caso.
#: (Las cifras viejas del estado del intento ya no existen: ``test_no_numbers_to_student`` vigila que no vuelvan.)
EVALUATIVE_KEYS = {
    "feedback", "classification", "class", "responseClass", "scoreDelta", "stressDelta", "trustDelta",
    "victimRiskDelta", "prohibitedConduct", "prohibitionReason", "message", "retryRequired",
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
    explore_what_the_case_asks_for(attempt_id)  # el caso 2.1 retiene la recomendada hasta explorar
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    return client, attempt_id, token, node_id


def _decide(client, attempt_id, token, option_id, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id, **extra},
        format="json",
    )


def _option(node_id, *response_classes):
    """La primera opción de la escena con alguna de esas clases (la primera escena sembrada solo tiene
    «Recomendada» y «Contraindicada»)."""
    return DecisionOption.objects.filter(
        source_node_id=node_id, response_class__in=response_classes
    ).order_by("id").first()


def _contraindicated_option(node_id):
    return _option(node_id, "CONTRAINDICATED")


def _sin_nada_evaluativo(data):
    """Nada evaluativo en ninguna parte de la respuesta (el aviso neutro de ``retry`` es el único ``message``)."""
    sin_aviso = {key: value for key, value in data.items() if key != "retry"}
    assert _keys(sin_aviso) & EVALUATIVE_KEYS == set()


# ── la forma única de la respuesta ───────────────────────────────────────────
@pytest.mark.parametrize("clase", [("RECOMMENDED",), ("CONTRAINDICATED",)])
def test_la_respuesta_de_una_decision_registrada_es_attempt_y_consequence(
    estudiante, case_version_id, clase
):
    _set_rules(case_version_id, secondChance=False)  # la respuesta mala se registra de inmediato
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    option = _option(node_id, *clase)

    response = _decide(client, attempt_id, token, option.id)

    data = response.data["data"]
    assert response.status_code == 200
    assert set(data) == {"attempt", "consequence", "reaction"}
    assert data["attempt"]["currentNode"]["id"] != node_id
    assert data["consequence"]["source"] in ("OPTION", "NODE")
    _sin_nada_evaluativo(data)


def test_la_consecuencia_sale_de_la_narrativa_del_nodo_destino(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=good.pk).update(consequence_text=None)

    data = _decide(client, attempt_id, token, good.id).data["data"]

    assert data["consequence"] == {"text": good.target_node.narrative, "source": "NODE"}
    assert "retry" not in data


def test_la_consecuencia_sale_del_texto_de_la_opcion_cuando_existe(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=good.pk).update(consequence_text="La familia respira y te escucha.")

    data = _decide(client, attempt_id, token, good.id).data["data"]

    assert data["consequence"] == {"text": "La familia respira y te escucha.", "source": "OPTION"}


def test_la_bandera_feedback_at_close_only_ya_no_existe(settings):
    from psychosim.settings import base

    assert not hasattr(settings, "FEEDBACK_AT_CLOSE_ONLY")
    assert "FEEDBACK_AT_CLOSE_ONLY" not in base.CONTRACT_FLAGS_REGISTRY


@pytest.mark.parametrize("timing", ["IMMEDIATE", "AT_CLOSE", "NUNCA"])
def test_feedback_timing_de_la_version_no_cambia_la_respuesta(estudiante, case_version_id, timing):
    _set_rules(case_version_id, feedbackTiming=timing)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)

    data = _decide(client, attempt_id, token, _option(node_id, "RECOMMENDED").id).data["data"]

    assert set(data) == {"attempt", "consequence", "reaction"}
    _sin_nada_evaluativo(data)


# ── la segunda oportunidad como regla del caso ───────────────────────────────
def test_la_primera_respuesta_con_riesgo_concede_la_segunda_oportunidad_sin_decir_que_estuvo_mal(
    estudiante, case_version_id
):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "CONTRAINDICATED", "RISKY")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert set(data) == {"attempt", "consequence", "reaction", "retry"}
    assert data["consequence"] is None
    assert data["retry"] == {"allowed": True, "message": RETRY_NEUTRAL_MESSAGE}
    assert data["attempt"]["currentNode"]["id"] == node_id
    assert not {"riesgosa", "inadecuada", "inadecuado", "mal", "error"} & set(data["retry"]["message"].lower().split())
    _sin_nada_evaluativo(data)
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=RETRY).count() == 1
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=REGISTERED).count() == 0


@pytest.mark.parametrize("timing", ["IMMEDIATE", "AT_CLOSE"])
def test_el_aviso_del_reintento_es_el_mismo_con_cualquier_feedback_timing(estudiante, case_version_id, timing):
    _set_rules(case_version_id, secondChance=True, feedbackTiming=timing)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)

    data = _decide(client, attempt_id, token, _option(node_id, "CONTRAINDICATED", "RISKY").id).data["data"]

    assert data["retry"]["message"] == RETRY_NEUTRAL_MESSAGE


def test_el_reintento_no_cambia_el_estado_del_intento_ni_cumple_hitos(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    before = case_state.read(SimulationAttempt.objects.get(pk=attempt_id))

    _decide(client, attempt_id, token, _option(node_id, "CONTRAINDICATED", "RISKY").id)

    assert case_state.read(SimulationAttempt.objects.get(pk=attempt_id)) == before


def test_una_respuesta_contraindicada_usa_el_evento_de_reintento_prohibido(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    prohibited = _contraindicated_option(node_id)

    data = _decide(client, attempt_id, token, prohibited.id).data["data"]

    assert data["retry"]["allowed"] is True
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type="PROHIBITED_DECISION_RETRY_REQUIRED", decision_option_id=prohibited.id
    ).exists()


def test_una_respuesta_con_riesgo_usa_el_evento_de_reintento_comun(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    risky = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=risky.pk).update(response_class="RISKY")

    _decide(client, attempt_id, token, risky.id)

    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type="DECISION_RETRY_REQUIRED", decision_option_id=risky.id
    ).exists()


def test_la_segunda_oportunidad_se_decide_por_la_clase_de_la_respuesta_no_por_la_clasificacion_antigua(
    estudiante, case_version_id
):
    """Una opción declarada «Contraindicada» pide reintento aunque su clasificación antigua diga ADEQUATE."""
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=good.pk).update(
        response_class="CONTRAINDICATED", prohibition_reason="Revictimiza a la persona usuaria."
    )

    data = _decide(client, attempt_id, token, good.id).data["data"]

    assert data["retry"]["allowed"] is True
    assert data["attempt"]["currentNode"]["id"] == node_id


def test_una_opcion_recomendada_nunca_pide_reintento_aunque_su_dato_antiguo_sea_malo(
    estudiante, case_version_id
):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "CONTRAINDICATED", "RISKY")
    DecisionOption.objects.filter(pk=bad.pk).update(response_class="RECOMMENDED")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert set(data) == {"attempt", "consequence", "reaction"}
    assert data["attempt"]["currentNode"]["id"] != node_id


def test_sin_segunda_oportunidad_la_respuesta_mala_se_registra_de_inmediato(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=False)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "CONTRAINDICATED", "RISKY")

    data = _decide(client, attempt_id, token, bad.id).data["data"]

    assert set(data) == {"attempt", "consequence", "reaction"}
    assert data["attempt"]["currentNode"]["id"] != node_id
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=RETRY).count() == 0
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=REGISTERED).count() == 1


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
        assert rules_of(version).second_chance is False


# ── lo que queda en el evento ────────────────────────────────────────────────
def test_el_detalle_del_evento_es_la_explicacion_de_la_opcion_sin_prefijos_evaluativos(
    estudiante, case_version_id
):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=good.pk).update(feedback_text="Porque estabiliza a la familia.")

    _decide(client, attempt_id, token, good.id)

    event = AttemptEvent.objects.get(attempt_id=attempt_id, event_type="DECISION_SELECTED")
    assert event.detail == "Porque estabiliza a la familia."


def test_sin_feedback_text_el_detalle_es_la_retroalimentacion_inmediata(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")
    DecisionOption.objects.filter(pk=good.pk).update(feedback_text=None, immediate_feedback="Explicación propia.")

    _decide(client, attempt_id, token, good.id)

    assert AttemptEvent.objects.get(attempt_id=attempt_id, event_type="DECISION_SELECTED").detail == (
        "Explicación propia."
    )


def test_una_respuesta_contraindicada_registrada_usa_el_evento_prohibido(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=False)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    prohibited = _contraindicated_option(node_id)

    data = _decide(client, attempt_id, token, prohibited.id).data["data"]

    assert set(data) == {"attempt", "consequence", "reaction"}
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type="PROHIBITED_DECISION_SELECTED", decision_option_id=prohibited.id
    ).exists()


def test_el_override_de_evidencia_queda_en_el_evento_y_no_en_la_respuesta(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")

    data = _decide(
        client, attempt_id, token, good.id, evidenceOverride=True, missingEvidence=["Usar PAP"]
    ).data["data"]

    event = AttemptEvent.objects.get(attempt_id=attempt_id, event_type="DECISION_SELECTED")
    assert "Override de evidencia: Usar PAP" in event.detail
    assert "Usar PAP" not in json.dumps(data)


# ── la repetición de una decisión ────────────────────────────────────────────
def test_repetir_una_decision_devuelve_la_misma_forma_unica(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    good = _option(node_id, "RECOMMENDED")

    first = _decide(client, attempt_id, token, good.id, requestId="req-forma-unica-1")
    second = _decide(client, attempt_id, token, good.id, requestId="req-forma-unica-1")

    assert second.data["data"] == first.data["data"]
    assert set(second.data["data"]) == {"attempt", "consequence", "reaction"}
    _sin_nada_evaluativo(second.data["data"])


def test_repetir_un_reintento_devuelve_el_mismo_aviso_neutro(estudiante, case_version_id):
    _set_rules(case_version_id, secondChance=True)
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    bad = _option(node_id, "CONTRAINDICATED", "RISKY")

    first = _decide(client, attempt_id, token, bad.id, requestId="req-reintento-1")
    second = _decide(client, attempt_id, token, bad.id, requestId="req-reintento-1")

    assert second.data["data"] == first.data["data"]
    assert set(second.data["data"]) == {"attempt", "consequence", "reaction", "retry"}
    assert second.data["data"]["retry"]["message"] == RETRY_NEUTRAL_MESSAGE
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type__in=RETRY).count() == 1


# ── el estado del intento nunca trae `feedback` ──────────────────────────────
def test_el_estado_del_intento_ya_no_tiene_la_clave_feedback(estudiante, case_version_id):
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)

    state = client.get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    decided = _decide(client, attempt_id, token, _option(node_id, "RECOMMENDED").id).data["data"]["attempt"]
    paused = client.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json"
    ).data["data"]

    for payload in (state, decided, paused):
        assert "feedback" not in payload


def test_un_intento_sin_completar_no_trae_el_reporte_en_vivo(estudiante, case_version_id):
    """Antes del cierre no viaja la evaluación por el reporte en vivo (clases, conteos, línea de tiempo)."""
    client, attempt_id, token, node_id = _first_node(estudiante, case_version_id)
    _decide(client, attempt_id, token, _option(node_id, "RECOMMENDED").id)
    paused = client.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json"
    ).data["data"]

    state = client.get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]
    active = client.get(f"{BASE}/cases/{case_version_id}/active-attempt").data["data"]

    for payload in (paused, state, active):
        assert payload["status"] == "PAUSED"
        assert payload["completionReport"] is None
        assert payload["supportResources"], "los recursos de apoyo siguen llegando"


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


def test_la_migracion_0009_funciona_sobre_filas_reales(db):
    migration = importlib.import_module("apps.simulation.migrations.0009_case_rules_existing_second_chance")
    from django.apps import apps as django_apps

    CaseVersion.objects.update(rules="{}")

    migration.enable_second_chance_on_existing_versions(django_apps, None)

    assert {json.loads(rules).get("secondChance") for rules in CaseVersion.objects.values_list("rules", flat=True)} == {True}
