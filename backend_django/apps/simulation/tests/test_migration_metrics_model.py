"""Modelo de respuesta · Las migraciones 0029 (columnas) y 0030 (datos) sobre filas reales (RN-08).

La base de la prueba ya está en el esquema más reciente (``--reuse-db``) y el importador siembra SIM-VBG-001 en la
forma NUEVA (``casedef.legacy``); la ``0030`` actúa sobre filas en la forma VIEJA. Por eso la prueba fabrica las filas
viejas: ``case_version_id`` devuelve los ``effects`` y las ``rules`` sembradas a lo que dice el documento 1.0 (severidad,
banderas, métricas, finales por banderas) ANTES de jugar, para que el motor actual produzca el estado antiguo de los
intentos; y la fixture ``run`` deja además ``response_class`` vacía e ``intensity`` en ``MEDIUM`` antes de llamar
directamente a la función de la ``0030``. Se prueba con un intento abierto que ya tomó decisiones con el motor actual
y un intento completado con su reporte congelado.
"""
import json
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model

from apps.simulation.casedef.conditions import evaluate
from apps.simulation.casedef.vocabulary import DEFAULT_PERSONA_STEP, INITIAL_PERSONA, ResponseClass, step_persona
from apps.simulation.models import (
    AttemptEvent,
    AttemptReport,
    AttemptWorldState,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)

from .test_attempt_report_frozen import _congelar_v2, _decide, cl, completed, estudiante  # noqa: F401  (fixtures)
from .test_attempt_report_frozen import case_version_id as seeded_case_version_id  # noqa: F401  (fixture)
from .test_world import _start

pytestmark = [pytest.mark.django_db, pytest.mark.req("RN-08")]

migration = import_module("apps.simulation.migrations.0030_metrics_model_data")
User = get_user_model()
NEGATIVE = "mediacion_agresor_intentada"  # marca un acto contraindicado: no es un hito
DECISIVE = ["riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada"]


DOCUMENT = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"


@pytest.fixture
def case_version_id(seeded_case_version_id):
    """SIM-VBG-001 sembrado, con las filas devueltas a la forma 1.0 que la ``0030`` sabe convertir."""
    siep = json.loads(DOCUMENT.read_text(encoding="utf-8"))["x-siep"]
    effects_by_key = {option["clave"]: option["efectos"] for scene in siep["escenas"] for option in scene["opciones"]}
    for option in DecisionOption.objects.filter(case_version_id=seeded_case_version_id):
        option.effects = json.dumps(effects_by_key[option.option_key], ensure_ascii=False)
        option.save(update_fields=["effects"])
    CaseVersion.objects.filter(pk=seeded_case_version_id).update(rules=json.dumps(siep["reglas"], ensure_ascii=False))
    return seeded_case_version_id


def _flags(attempt_id):
    return json.loads(AttemptWorldState.objects.get(pk=attempt_id).flags_json)


def _snapshot(version_id):
    return {
        "options": list(DecisionOption.objects.filter(case_version_id=version_id).order_by("id").values_list(
            "id", "response_class", "effects")),
        "nodes": list(SimulationNode.objects.filter(case_version_id=version_id).order_by("id").values_list(
            "id", "intensity")),
        "rules": CaseVersion.objects.get(pk=version_id).rules,
        "states": list(AttemptWorldState.objects.order_by("attempt_id").values_list("attempt_id", "flags_json")),
    }


def test_el_importador_escribe_la_clase_y_la_intensidad_al_crear(case_version_id):
    options = DecisionOption.objects.filter(case_version_id=case_version_id)

    assert options.count() == 19
    assert not options.filter(response_class__isnull=True).exists()
    for node in SimulationNode.objects.filter(case_version_id=case_version_id):
        assert node.intensity == ("HIGH" if node.sensitive_content else "MEDIUM")


def _to_legacy_state(attempt_id):
    """Devuelve el mundo del intento a su forma 1.0: ``caseFlags`` y ``caseMetrics``, sin ``milestones`` ni ``persona``.

    Desde la Tarea 5 el motor ya escribe hitos y persona, así que el estado antiguo que la ``0030`` convierte hay que
    fabricarlo: las banderas son las que encendían los ``effects`` 1.0 de las decisiones registradas del intento.
    """
    state = AttemptWorldState.objects.get(pk=attempt_id)
    raw = json.loads(state.flags_json)
    flags = {}
    for event in AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type__in=migration.REGISTERED_EVENTS, decision_option__isnull=False,
    ).order_by("occurred_at", "id").select_related("decision_option"):
        flags.update(json.loads(event.decision_option.effects).get("flags", {}))
    raw.pop("milestones", None)
    raw.pop("persona", None)
    raw["caseFlags"] = flags
    raw["caseMetrics"] = {"confianza": 50}
    state.flags_json = json.dumps(raw, ensure_ascii=False)
    state.save(update_fields=["flags_json"])
    return raw


@pytest.fixture
def run(completed, case_version_id, capsys):
    """Un intento completado, otro abierto con decisiones y las filas en su forma antigua; luego la ``0030``."""
    client, completed_id, _ = completed
    # Desde la Tarea 9 los intentos nuevos cierran en v3: el cerrado «de antes» es un v2 escrito a mano.
    _congelar_v2(completed_id)
    frozen_before = list(AttemptReport.objects.filter(attempt_id=completed_id).values())

    open_id, token = _start(client, case_version_id)
    for step in range(2):
        attempt = SimulationAttempt.objects.get(pk=open_id)
        option = DecisionOption.objects.filter(source_node_id=attempt.current_node_id, classification="ADEQUATE").first()
        assert _decide(client, open_id, token, option.id, requestId=f"req-abierto-{step:04d}").status_code == 200
    legacy_state = _to_legacy_state(open_id)
    assert legacy_state["caseFlags"] and legacy_state["caseMetrics"]  # el intento abierto trae el estado antiguo

    # Las filas, como estaban antes de la migración (los effects y las reglas ya las devolvió ``case_version_id``).
    DecisionOption.objects.update(response_class=None)
    SimulationNode.objects.update(intensity="MEDIUM")
    assert "severity" in DecisionOption.objects.filter(case_version_id=case_version_id).first().effects
    assert "metrics" in json.loads(CaseVersion.objects.get(pk=case_version_id).rules)
    with_negative = [
        option.id for option in DecisionOption.objects.filter(case_version_id=case_version_id)
        if json.loads(option.effects).get("flags", {}).get(NEGATIVE)
    ]
    assert with_negative  # la siembra trae al menos una opción que enciende la bandera
    capsys.readouterr()

    migration.forward(django_apps, None)
    return SimpleNamespace(
        client=client, token=token, completed_id=completed_id, open_id=open_id, legacy_state=legacy_state,
        frozen_before=frozen_before, with_negative=with_negative, version_id=case_version_id, report=capsys.readouterr().out,
    )


# ─── (a) las 19 opciones de SIM-VBG-001 ───────────────────────────────────────────────────────────
def test_las_19_opciones_de_sim_vbg_001_quedan_con_la_clase_esperada(run):
    options = DecisionOption.objects.filter(case_version_id=run.version_id)
    counts = {member.value: options.filter(response_class=member.value).count() for member in ResponseClass}

    assert options.count() == 19
    assert counts == {"RECOMMENDED": 6, "ACCEPTABLE": 5, "RISKY": 5, "CONTRAINDICATED": 3}


def test_los_efectos_de_las_opciones_pasan_a_persona_e_hitos(run):
    for option in DecisionOption.objects.filter(case_version_id=run.version_id):
        effects = json.loads(option.effects)
        d_bond, d_act = DEFAULT_PERSONA_STEP[ResponseClass(option.response_class)]

        assert set(effects) <= {"persona", "milestones", "competencies"}
        assert effects["persona"] == {"bond": d_bond, "activation": d_act}
        assert isinstance(effects["milestones"], list)
    # las banderas encendidas son hitos y las apagadas desaparecen
    flagged = {key for option in DecisionOption.objects.filter(case_version_id=run.version_id)
               for key in json.loads(option.effects)["milestones"]}
    assert set(DECISIVE) <= flagged and NEGATIVE not in flagged


def test_la_mediacion_con_el_agresor_no_es_un_hito_y_su_opcion_queda_contraindicada(run):
    rules = json.loads(CaseVersion.objects.get(pk=run.version_id).rules)

    assert NEGATIVE not in {item["key"] for item in rules["milestones"]}
    assert NEGATIVE not in json.dumps(rules["endings"])
    for option in DecisionOption.objects.filter(pk__in=run.with_negative):
        assert option.response_class == "CONTRAINDICATED"  # la clase ya lleva el hecho
        assert NEGATIVE not in json.loads(option.effects)["milestones"]
    assert NEGATIVE in migration.NEGATIVE_FLAGS


def test_las_escenas_sensibles_quedan_en_intensidad_alta(run):
    nodes = SimulationNode.objects.filter(case_version_id=run.version_id)

    assert nodes.filter(sensitive_content=True).exists()
    for node in nodes:
        assert node.intensity == ("HIGH" if node.sensitive_content else "MEDIUM")


def test_las_reglas_de_sim_vbg_001_traen_hitos_riesgo_y_los_finales_de_plantilla(run):
    rules = json.loads(CaseVersion.objects.get(pk=run.version_id).rules)

    assert "metrics" not in rules
    assert rules["riskLevel"] == "EXTREME"
    assert rules["secondChance"] is True  # lo que no era de métricas se conserva
    milestones = {item["key"]: item for item in rules["milestones"]}
    assert {key for key, item in milestones.items() if item["decisive"]} == set(DECISIVE)
    assert milestones["pap_aplicado"]["label"] == "Pap aplicado" and milestones["pap_aplicado"]["description"] == ""
    assert [ending["key"] for ending in rules["endings"]] == ["critica", "protectora", "riesgo_persistente", "con_brechas"]
    assert rules["endings"][0]["title"].startswith("Final 4") and rules["endings"][0]["tone"] == "critical"
    assert "when" not in rules["endings"][3]
    assert "flag" not in json.dumps(rules) and "metric" not in json.dumps(rules)


@pytest.mark.parametrize("contraindicated, risky, done, expected", [
    (2, 0, DECISIVE, "critica"),
    (1, 0, DECISIVE[:2], "critica"),
    (0, 1, DECISIVE, "protectora"),
    (1, 0, DECISIVE, "con_brechas"),
    (0, 0, DECISIVE[:2], "riesgo_persistente"),
    (0, 3, DECISIVE, "riesgo_persistente"),
    (0, 2, DECISIVE, "con_brechas"),
])
def test_los_finales_migrados_se_resuelven_por_clases_e_hitos(run, contraindicated, risky, done, expected):
    endings = json.loads(CaseVersion.objects.get(pk=run.version_id).rules)["endings"]
    context = {"counts": {"contraindicated": contraindicated, "risky": risky}, "milestones": set(done)}

    winner = next(ending["key"] for ending in endings if "when" not in ending or evaluate(ending["when"], context))

    assert winner == expected


def test_la_migracion_imprime_el_informe_para_psicologia(run):
    assert "Opciones por clase: RECOMMENDED=6, ACCEPTABLE=5, RISKY=5, CONTRAINDICATED=3." in run.report
    assert "Opciones con severidad crítica SIN conducta prohibida" in run.report
    assert "Hitos de SIM-VBG-001" in run.report and "riesgo_feminicidio_valorado" in run.report
    assert f"NO pasan a hitos (marcan un acto contraindicado): {NEGATIVE}." in run.report


# ─── (b) un intento abierto sigue jugable ─────────────────────────────────────────────────────────
def test_un_intento_abierto_conserva_sus_hitos_y_su_persona_y_sigue_jugable(run):
    state = _flags(run.open_id)
    expected_milestones = [key for key, value in run.legacy_state["caseFlags"].items() if value is True]
    bond, activation = INITIAL_PERSONA
    for event in AttemptEvent.objects.filter(
        attempt_id=run.open_id, event_type__in=migration.REGISTERED_EVENTS, decision_option__isnull=False,
    ).order_by("occurred_at", "id"):
        bond, activation = step_persona(bond, activation, *DEFAULT_PERSONA_STEP[ResponseClass(event.decision_option.response_class)])

    assert state["milestones"] == expected_milestones and expected_milestones
    assert state["persona"] == {"bond": bond.value, "activation": activation.value}
    assert "caseFlags" not in state and "caseMetrics" not in state

    attempt = SimulationAttempt.objects.get(pk=run.open_id)
    option = DecisionOption.objects.filter(source_node_id=attempt.current_node_id, classification="ADEQUATE").first()
    response = _decide(run.client, run.open_id, run.token, option.id, requestId="req-despues-0001")

    assert response.status_code == 200, response.data
    after = _flags(run.open_id)
    assert isinstance(after["milestones"], list) and set(after["persona"]) == {"bond", "activation"}


def test_un_intento_abierto_migrado_termina_con_el_final_de_plantilla_que_le_corresponde(run):
    """R-1: el intento que seguía abierto tras la ``0030``, ya completado, termina con el final de la tabla de plantilla."""
    for step in range(30):
        attempt = SimulationAttempt.objects.get(pk=run.open_id)
        if attempt.status != "IN_PROGRESS":
            break
        option = DecisionOption.objects.filter(source_node_id=attempt.current_node_id, classification="ADEQUATE").first()
        response = _decide(run.client, run.open_id, run.token, option.id, requestId=f"req-cierre-{step:04d}")
        assert response.status_code == 200, response.data
    assert SimulationAttempt.objects.get(pk=run.open_id).status == "COMPLETED"

    ending = run.client.get(
        f"/api/simulation/attempts/{run.open_id}/completion-report",
        HTTP_X_SIEP_ATTEMPT_TOKEN=run.token,
    ).data["data"]["ending"]

    # La tabla de la plantilla, escrita aparte de ``legacy``: críticas, protectora, riesgo persistente, brechas.
    classes = [
        event.decision_option.response_class
        for event in AttemptEvent.objects.filter(
            attempt_id=run.open_id, event_type__in=("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"),
        ).select_related("decision_option")
    ]
    contraindicated, risky = classes.count("CONTRAINDICATED"), classes.count("RISKY")
    missing = set(DECISIVE) - set(_flags(run.open_id)["milestones"])
    if contraindicated >= 2 or (contraindicated and missing):
        expected = "critica"
    elif not contraindicated and risky <= 1 and not missing:
        expected = "protectora"
    elif missing or risky >= 3:
        expected = "riesgo_persistente"
    else:
        expected = "con_brechas"
    assert ending["key"] == expected
    assert ending["reason"] and not {"severityCounts", "caseFlags", "caseMetrics"} & set(ending)
    assert ending["title"].startswith("Final")  # los textos migrados de SIM-VBG-001 se conservan


# ─── (c) los reportes congelados no se tocan ──────────────────────────────────────────────────────
def test_un_reporte_v2_congelado_queda_byte_a_byte_igual(run):
    after = list(AttemptReport.objects.filter(attempt_id=run.completed_id).values())

    assert after == run.frozen_before
    assert json.loads(after[0]["report_json"])["schemaVersion"] == 2


# ─── (d) idempotencia ─────────────────────────────────────────────────────────────────────────────
def test_la_migracion_es_idempotente_sobre_filas_ya_migradas(run, capsys):
    first = _snapshot(run.version_id)

    migration.forward(django_apps, None)

    assert _snapshot(run.version_id) == first
    assert "Opciones con severidad crítica SIN conducta prohibida (pasan a CONTRAINDICATED; revisar): 0." in capsys.readouterr().out


# ─── otras versiones ──────────────────────────────────────────────────────────────────────────────
def test_otras_versiones_conservan_sus_finales_propios_y_las_sin_finales_no_ganan_ninguno(estudiante, capsys):
    case = SimulationCase.objects.create(code="CASO-MIG-1", title="Caso de prueba", created_by=estudiante)

    def version(number, rules):
        return CaseVersion.objects.create(
            simulation_case=case, semantic_version=number, created_by=estudiante, rules=json.dumps(rules)
        )

    own = version("1.0", {
        "secondChance": True, "metrics": [{"key": "confianza", "initial": 50}],
        "endings": [
            {"key": "propio", "title": "Propio", "message": "m", "tone": "warning", "when": {"metric": "confianza", "gte": 10}},
            {"key": "otro", "title": "Otro", "when": {"count": "risky", "gte": 1}},
            {"key": "defecto", "title": "Defecto"},
        ],
    })
    without = version("2.0", {"metrics": [{"key": "confianza", "initial": 50}]})
    empty = version("3.0", {})

    migration.forward(django_apps, None)

    rules = json.loads(CaseVersion.objects.get(pk=own.pk).rules)
    assert "metrics" not in rules and rules["secondChance"] is True and "riskLevel" not in rules
    assert [ending["key"] for ending in rules["endings"]] == ["propio", "otro", "defecto"]
    assert "when" not in rules["endings"][0] and rules["endings"][0]["tone"] == "warning"
    assert rules["endings"][1]["when"] == {"count": "risky", "gte": 1}
    assert json.loads(CaseVersion.objects.get(pk=without.pk).rules) == {}
    assert CaseVersion.objects.get(pk=empty.pk).rules == "{}"
    assert "final «propio» no es de plantilla" in capsys.readouterr().out
