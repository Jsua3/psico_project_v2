"""Modelo de respuesta · La conversión del documento 1.0 al modelo nuevo (``casedef.legacy``) y el importador.

La mayor parte es pura (sin base de datos): efectos, reglas, finales e intensidad. La última prueba siembra
SIM-VBG-001 por el importador y mira las filas reales: deben nacer en la forma nueva, sin pasar por la migración 0030.
"""
import json

import pytest

from apps.simulation.casedef import legacy
from apps.simulation.casedef.conditions import evaluate
from apps.simulation.casedef.vocabulary import DEFAULT_PERSONA_STEP, Intensity, ResponseClass, RiskLevel

from .test_world import case_version_id  # noqa: F401  (fixture)

pytestmark = pytest.mark.req("RN-08")

VBG = "SIM-VBG-001"
DECISIVE = ["riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada"]
NEGATIVE = "mediacion_agresor_intentada"


# ─── el vocabulario antiguo de las condiciones ────────────────────────────────────────────────
@pytest.mark.parametrize("condition", [
    {"flag": "pap_aplicado"},
    {"metric": "confianza", "gte": 50},
    {"count": "critical", "eq": 0},
    {"count": "risky", "lte": 1},
    {"milestone": "a"},
    {"not": {"any": [{"flag": "a"}, {"metric": "m", "lt": 3}]}},
])
def test_el_validador_del_documento_1_0_acepta_el_vocabulario_antiguo_y_el_nuevo(condition):
    assert legacy.is_valid_condition(condition) is True


@pytest.mark.parametrize("condition", [
    {}, {"flag": ""}, {"flag": 3}, {"metric": "m"}, {"metric": "m", "gte": "1"}, {"count": "critical"},
    {"count": "mortal", "gte": 1}, {"flag": "a", "extra": 1}, {"all": [{"flag": "a"}, {"nope": 1}]}, "texto", None,
])
def test_el_validador_del_documento_1_0_rechaza_lo_mal_formado(condition):
    assert legacy.is_valid_condition(condition) is False


def test_el_validador_del_documento_1_0_acota_la_profundidad():
    deep = {"flag": "x"}
    for _ in range(20):
        deep = {"not": deep}

    assert legacy.is_valid_condition(deep) is False


# ─── las tablas ───────────────────────────────────────────────────────────────────────────────
def test_las_tablas_de_conversion_son_las_de_la_migracion_0030():
    assert legacy.NEGATIVE_FLAGS == (NEGATIVE, "noticia_muerte_mal_manejada", "interrogatorio_prematuro")
    assert legacy.DECISIVE_BY_CASE == {VBG: tuple(DECISIVE)}
    assert legacy.RISK_LEVEL_BY_CASE == {VBG: RiskLevel.EXTREME}
    assert legacy.TEMPLATE_ORDER == ("critica", "protectora", "riesgo_persistente", "con_brechas")
    assert legacy.ENDING_KEY_MAP == {
        "critico": "critica", "integral": "protectora", "riesgo": "riesgo_persistente", "brechas": "con_brechas",
    }


# ─── los efectos de una opción ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("response_class", list(ResponseClass))
def test_los_efectos_toman_el_paso_de_persona_por_defecto_de_la_clase(response_class):
    d_bond, d_act = DEFAULT_PERSONA_STEP[response_class]

    assert legacy.convert_effects({"severity": "acceptable", "metrics": {"confianza": 5}}, response_class) == {
        "persona": {"bond": d_bond, "activation": d_act}, "milestones": [],
    }


def test_las_banderas_encendidas_son_hitos_sin_la_negativa_y_en_orden():
    raw = {
        "severity": "critical",
        "flags": {"b_primero": True, "apagada": False, NEGATIVE: True, "a_segundo": True},
        "metrics": {"confianza": -20},
    }

    effects = legacy.convert_effects(raw, ResponseClass.CONTRAINDICATED)

    assert effects == {"persona": {"bond": -1, "activation": 1}, "milestones": ["b_primero", "a_segundo"]}
    assert not {"severity", "flags", "metrics"} & set(effects)


def test_las_competencias_se_conservan_si_las_traia_y_no_se_inventan():
    with_competencies = legacy.convert_effects({"flags": {"x": True}, "competencies": {"empatia": 2}}, ResponseClass.RECOMMENDED)
    empty_competencies = legacy.convert_effects({"competencies": {}}, ResponseClass.RECOMMENDED)

    assert with_competencies["competencies"] == {"empatia": 2}
    assert "competencies" not in empty_competencies
    assert legacy.convert_effects({}, ResponseClass.ACCEPTABLE) == {"persona": {"bond": 0, "activation": 0}, "milestones": []}


def test_convertir_efectos_ya_convertidos_los_deja_igual():
    once = legacy.convert_effects({"severity": "risky", "flags": {"x": True}, "competencies": {"a": 1}}, ResponseClass.RISKY)

    again = legacy.convert_effects(once, ResponseClass.RECOMMENDED)  # la clase no los vuelve a mover

    assert again == once and again is not once


# ─── los hitos que usan las opciones ──────────────────────────────────────────────────────────
def test_las_claves_de_hito_salen_en_orden_sin_repetir_y_sin_la_negativa():
    effects = [
        {"flags": {"uno": True, NEGATIVE: True}},
        {"flags": {"dos": False, "uno": True}},  # una bandera apagada sigue siendo una bandera del caso
        {"milestones": ["tres", "uno"], "persona": {"bond": 0, "activation": 0}},
        {}, None,
    ]

    assert legacy.milestone_keys(effects) == ["uno", "dos", "tres"]


# ─── las reglas de la versión ─────────────────────────────────────────────────────────────────
OLD_RULES = {
    "secondChance": True,
    "metrics": [{"key": "confianza", "initial": 50}],
    "endings": [
        {"key": "critico", "title": "Final 4", "message": "m4", "tone": "critical", "when": {"flag": NEGATIVE}},
        {"key": "integral", "title": "Final 1", "message": "m1", "tone": "success", "when": {"count": "critical", "eq": 0}},
        {"key": "riesgo", "title": "Final 3", "message": "m3", "tone": "warning", "when": {"metric": "confianza", "lte": 10}},
        {"key": "brechas", "title": "Final 2", "message": "m2", "tone": "info"},
    ],
}
KEYS = ["pap_aplicado", NEGATIVE, *DECISIVE]


def test_las_reglas_de_sim_vbg_001_traen_hitos_decisivos_riesgo_extremo_y_sin_metricas():
    rules = legacy.convert_rules(OLD_RULES, VBG, KEYS)

    assert "metrics" not in rules and rules["secondChance"] is True and rules["riskLevel"] == "EXTREME"
    assert rules["milestones"] == [
        {"key": "pap_aplicado", "label": "Pap aplicado", "description": "", "decisive": False},
        *({"key": key, "label": legacy.milestone_label(key), "description": "", "decisive": True} for key in DECISIVE),
    ]
    assert rules["milestones"][1]["label"] == "Riesgo feminicidio valorado"


def test_en_otro_caso_ningun_hito_es_decisivo_y_no_hay_nivel_de_riesgo():
    rules = legacy.convert_rules({"metrics": []}, "CASO-OTRO", ["a_b", *DECISIVE])

    assert [item["decisive"] for item in rules["milestones"]] == [False] * 4
    assert "riskLevel" not in rules and "metrics" not in rules and "endings" not in rules


def test_los_finales_se_reescriben_en_orden_de_plantilla_conservando_los_textos():
    endings = legacy.convert_rules(OLD_RULES, VBG, KEYS)["endings"]

    assert [ending["key"] for ending in endings] == ["critica", "protectora", "riesgo_persistente", "con_brechas"]
    assert [(e["title"], e["message"], e["tone"]) for e in endings] == [
        ("Final 4", "m4", "critical"), ("Final 1", "m1", "success"), ("Final 3", "m3", "warning"), ("Final 2", "m2", "info"),
    ]
    assert "when" not in endings[3]
    assert [ending.get("when") for ending in endings[:3]] == [
        legacy.template_endings_when(DECISIVE)[key] for key in legacy.TEMPLATE_ORDER[:3]
    ]
    assert "flag" not in json.dumps(endings) and "metric" not in json.dumps(endings)


def test_un_final_propio_conserva_clave_y_textos_y_solo_pierde_un_when_antiguo():
    rules = legacy.convert_rules({"endings": [
        {"key": "viejo", "title": "Viejo", "tone": "warning", "when": {"metric": "confianza", "gte": 10}},
        {"key": "nuevo", "title": "Nuevo", "when": {"count": "risky", "gte": 1}},
        {"key": "sev", "title": "Sev", "when": {"all": [{"count": "critical", "gte": 1}]}},
        {"key": "defecto", "title": "Defecto"},
        {"key": "brechas", "title": "Brechas"},
    ]}, "CASO-OTRO", [])

    endings = rules["endings"]
    assert [e["key"] for e in endings] == ["viejo", "nuevo", "sev", "defecto", "con_brechas"]
    assert "when" not in endings[0] and endings[0]["tone"] == "warning"
    assert endings[1]["when"] == {"count": "risky", "gte": 1}
    assert "when" not in endings[2] and "when" not in endings[3] and "when" not in endings[4]
    assert "milestones" not in rules  # sin banderas no hay hitos


def test_sin_endings_no_se_crean():
    assert "endings" not in legacy.convert_rules({"secondChance": True}, VBG, KEYS)


@pytest.mark.parametrize("case_code, rules", [(VBG, OLD_RULES), ("CASO-OTRO", {"metrics": [], "endings": [{"key": "x", "title": "X"}]})])
def test_convertir_reglas_ya_convertidas_las_deja_igual(case_code, rules):
    once = legacy.convert_rules(rules, case_code, KEYS)

    again = legacy.convert_rules(once, case_code, [])

    assert again == once and again is not once


def test_la_plantilla_trae_las_cuatro_condiciones_y_la_de_brechas_es_la_de_por_defecto():
    conditions = legacy.template_endings_when(DECISIVE)

    assert list(conditions) == list(legacy.TEMPLATE_ORDER)
    assert conditions["con_brechas"] is None
    assert all(conditions[key] for key in legacy.TEMPLATE_ORDER[:3])
    assert legacy.template_endings_when([])["critica"] == {"any": [{"count": "contraindicated", "gte": 2}]}
    assert legacy.template_endings_when([])["protectora"] == {"all": [
        {"count": "contraindicated", "eq": 0}, {"count": "risky", "lte": 1},
    ]}


@pytest.mark.parametrize("contraindicated, risky, done, expected", [
    (2, 0, DECISIVE, "critica"),
    (1, 0, DECISIVE[:2], "critica"),
    (0, 1, DECISIVE, "protectora"),
    (1, 0, DECISIVE, "con_brechas"),
    (0, 0, DECISIVE[:2], "riesgo_persistente"),
    (0, 3, DECISIVE, "riesgo_persistente"),
    (0, 2, DECISIVE, "con_brechas"),
])
def test_los_finales_convertidos_se_resuelven_por_clases_e_hitos(contraindicated, risky, done, expected):
    endings = legacy.convert_rules(OLD_RULES, VBG, KEYS)["endings"]
    context = {"counts": {"contraindicated": contraindicated, "risky": risky}, "milestones": set(done)}

    assert next(e["key"] for e in endings if "when" not in e or evaluate(e["when"], context)) == expected


# ─── la intensidad ────────────────────────────────────────────────────────────────────────────
def test_la_intensidad_es_alta_si_la_escena_es_sensible_y_media_si_no():
    assert legacy.intensity_for(True) is Intensity.HIGH
    assert legacy.intensity_for(False) is Intensity.MEDIUM


# ─── el importador escribe filas en la forma nueva ────────────────────────────────────────────
@pytest.mark.django_db
def test_el_importador_siembra_sim_vbg_001_en_la_forma_nueva(case_version_id):
    from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode

    options = list(DecisionOption.objects.filter(case_version_id=case_version_id).order_by("id"))
    assert len(options) == 19
    for option in options:
        effects = json.loads(option.effects)
        d_bond, d_act = DEFAULT_PERSONA_STEP[ResponseClass(option.response_class)]
        assert not {"severity", "flags", "metrics"} & set(effects)
        assert effects["persona"] == {"bond": d_bond, "activation": d_act}
        assert isinstance(effects["milestones"], list) and NEGATIVE not in effects["milestones"]
    assert set(DECISIVE) <= {key for option in options for key in json.loads(option.effects)["milestones"]}
    assert [o.response_class for o in options if o.response_class == "CONTRAINDICATED"]  # la mediación sigue contraindicada

    rules = json.loads(CaseVersion.objects.get(pk=case_version_id).rules)
    milestones = {item["key"]: item for item in rules["milestones"]}
    assert {key for key, item in milestones.items() if item["decisive"]} == set(DECISIVE)
    assert NEGATIVE not in milestones and "pap_aplicado" in milestones
    assert rules["riskLevel"] == "EXTREME" and rules["secondChance"] is True
    assert [e["key"] for e in rules["endings"]] == list(legacy.TEMPLATE_ORDER)
    assert "metrics" not in rules and "metric" not in json.dumps(rules) and "flag" not in json.dumps(rules["endings"])

    for node in SimulationNode.objects.filter(case_version_id=case_version_id):
        assert node.intensity == ("HIGH" if node.sensitive_content else "MEDIUM")
