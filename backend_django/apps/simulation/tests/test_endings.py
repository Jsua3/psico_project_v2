"""Tarea 6 · Finales por hitos y clases con plantilla automática (``services.endings``).

La tabla de decisión de la plantilla se prueba sin base de datos: el intento, sus decisiones y su estado son objetos
simples y ``case_state.read`` se reemplaza por el estado que cada caso necesita. Los finales propios, la condición
rota y el final de un caso sin finales ni hitos decisivos se prueban de punta a punta en ``test_effects_as_data.py``
y ``test_caso_pdf.py``.
"""
import json
from types import SimpleNamespace

import pytest

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import INITIAL_PERSONA, Activation, Bond
from apps.simulation.models import AttemptStatus
from apps.simulation.services import case_rules, case_state, endings

pytestmark = pytest.mark.req("RNF-008")

DECISIVE = ["riesgo_valorado", "proteccion_recomendada", "derechos_informados"]
MILESTONES = [
    {"key": "saludo", "label": "Saludar", "decisive": False},
    {"key": "riesgo_valorado", "label": "Valorar el riesgo", "decisive": True},
    {"key": "proteccion_recomendada", "label": "Recomendar medidas de protección", "decisive": True},
    {"key": "derechos_informados", "label": "Informar derechos", "decisive": True},
]
TEMPLATE_KEYS = ["critica", "protectora", "riesgo_persistente", "con_brechas"]


def _rules(**extra):
    return {"milestones": MILESTONES, **extra}


def _play(monkeypatch, *, rules, done=(), contraindicated=0, risky=0, recommended=0, persona=INITIAL_PERSONA,
          status=AttemptStatus.COMPLETED):
    """``compute_ending`` de un intento simulado: las clases de sus decisiones registradas y su estado de hitos."""
    monkeypatch.setattr(case_state, "read", lambda attempt: case_state.CaseState(frozenset(done), persona))
    classes = ["CONTRAINDICATED"] * contraindicated + ["RISKY"] * risky + ["RECOMMENDED"] * recommended
    events = [
        SimpleNamespace(decision_option_id=index, event_type="DECISION_SELECTED",
                        decision_option=SimpleNamespace(response_class=name))
        for index, name in enumerate(classes, start=1)
    ]
    # Un reintento y un evento sin opción nunca cuentan para el final.
    events.append(SimpleNamespace(decision_option_id=99, event_type="DECISION_RETRY_REQUIRED",
                                  decision_option=SimpleNamespace(response_class="CONTRAINDICATED")))
    events.append(SimpleNamespace(decision_option_id=None, event_type="NODE_ENTERED", decision_option=None))
    attempt = SimpleNamespace(status=status, case_version=SimpleNamespace(rules=json.dumps(rules)))
    return endings.compute_ending(attempt, events)


# ─── la plantilla ─────────────────────────────────────────────────────────────────────────────
def test_la_plantilla_trae_los_cuatro_finales_en_orden_y_el_de_por_defecto_sin_condicion():
    template = endings.build_template(case_rules.rules_of(SimpleNamespace(rules=json.dumps(_rules()))))

    assert [ending["key"] for ending in template] == TEMPLATE_KEYS
    assert [ending["tone"] for ending in template] == ["critical", "positive", "warning", "neutral"]
    assert [("when" in ending) for ending in template] == [True, True, True, False]
    assert all(ending["title"] and ending["message"] for ending in template)


def test_los_textos_de_la_plantilla_no_llevan_vocabulario_prohibido():
    template = endings.build_template(case_rules.CaseRules())
    text = " ".join(f"{ending['title']} {ending['message']}" for ending in template).lower()

    for word in ("puntaje", "estrés", "ranking", "desempeño", "paciente"):
        assert word not in text


def test_sin_hitos_decisivos_la_plantilla_ya_no_pide_hitos():
    rules = case_rules.CaseRules()
    template = {ending["key"]: ending for ending in endings.build_template(rules)}

    # «Todos los hitos decisivos» es verdadero con cero hitos y «falta alguno» es falso: la condición no los menciona.
    assert "milestone" not in json.dumps(template)
    assert conditions.evaluate({"all": []}, {}) is True
    assert conditions.evaluate({"not": {"all": []}}, {}) is False


# ─── la tabla de decisión ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "contraindicated, risky, done, expected",
    [
        # críticas: dos o más contraindicadas, o una y falta un hito decisivo
        (2, 0, DECISIVE, "critica"),
        (3, 0, [], "critica"),
        (1, 0, DECISIVE[:2], "critica"),
        (1, 0, [], "critica"),
        # una contraindicada con todos los hitos decisivos no es crítica: deja brechas
        (1, 0, DECISIVE, "con_brechas"),
        # protectora: ninguna contraindicada, todos los hitos decisivos y a lo sumo una con riesgo
        (0, 0, DECISIVE, "protectora"),
        (0, 1, DECISIVE, "protectora"),
        (0, 1, ["saludo", *DECISIVE], "protectora"),
        # con riesgo: dos con todos los hitos no es protectora ni persistente
        (0, 2, DECISIVE, "con_brechas"),
        # riesgo persistente: falta un hito decisivo o tres o más con riesgo
        (0, 0, DECISIVE[:2], "riesgo_persistente"),
        (0, 0, ["saludo"], "riesgo_persistente"),
        (0, 3, DECISIVE, "riesgo_persistente"),
        (0, 4, DECISIVE, "riesgo_persistente"),
        # una contraindicada con los tres hitos y tres con riesgo: la primera condición no aplica
        (1, 3, DECISIVE, "riesgo_persistente"),
    ],
)
def test_la_tabla_de_decision_de_la_plantilla(monkeypatch, contraindicated, risky, done, expected):
    ending = _play(monkeypatch, rules=_rules(), done=done, contraindicated=contraindicated, risky=risky, recommended=2)

    assert ending["key"] == expected


@pytest.mark.parametrize(
    "contraindicated, risky, expected",
    [
        (2, 0, "critica"),
        (1, 0, "con_brechas"),  # sin hitos decisivos no «falta» ninguno
        (0, 0, "protectora"),
        (0, 1, "protectora"),
        (0, 2, "con_brechas"),
        (0, 3, "riesgo_persistente"),
    ],
)
def test_un_caso_sin_hitos_decisivos_ni_finales_propios_termina_con_un_final(monkeypatch, contraindicated, risky, expected):
    rules = {"milestones": [{"key": "saludo", "label": "Saludar", "decisive": False}]}

    ending = _play(monkeypatch, rules=rules, done=["saludo"], contraindicated=contraindicated, risky=risky)

    assert ending is not None and ending["key"] == expected


@pytest.mark.parametrize("rules", [{}, {"milestones": []}, "no es json", "[]"])
def test_un_caso_sin_reglas_ni_hitos_termina_con_la_plantilla(monkeypatch, rules):
    ending = _play(monkeypatch, rules=rules)

    assert ending["key"] == "protectora"  # nada contraindicado, nada con riesgo


def test_un_intento_completado_sin_decisiones_registradas_tambien_recibe_un_final_de_la_plantilla(monkeypatch):
    # Revisión de foco 2: todo caso termina con un final; el viejo motor devolvía ``None`` aquí.
    ending = _play(monkeypatch, rules=_rules())

    assert ending["key"] == "riesgo_persistente"  # faltan los hitos decisivos


def test_el_final_de_un_intento_no_completado_es_none(monkeypatch):
    for status in (AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED):
        assert _play(monkeypatch, rules=_rules(), done=DECISIVE, status=status) is None


# ─── el resultado ─────────────────────────────────────────────────────────────────────────────
def test_el_resultado_trae_solo_clave_titulo_mensaje_tono_y_razon(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(), done=DECISIVE, recommended=3)

    assert set(ending) == {"key", "title", "message", "tone", "reason"}
    assert ending["tone"] == "positive"


def test_la_razon_cuenta_en_palabras_los_hitos_decisivos_y_las_respuestas(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(), done=["riesgo_valorado", "saludo"], contraindicated=2, risky=1)

    assert ending["reason"] == [
        "Cumpliste: Valorar el riesgo",
        "Faltó: Recomendar medidas de protección",
        "Faltó: Informar derechos",
        "2 respuestas contraindicadas",
        "Una respuesta con riesgo",
    ]


def test_la_razon_usa_el_singular_y_calla_lo_que_no_ocurrio(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(), done=DECISIVE, contraindicated=1, risky=3)

    assert ending["reason"] == [
        "Cumpliste: Valorar el riesgo",
        "Cumpliste: Recomendar medidas de protección",
        "Cumpliste: Informar derechos",
        "Una respuesta contraindicada",
        "3 respuestas con riesgo",
    ]
    clean = _play(monkeypatch, rules=_rules(), done=DECISIVE, recommended=2)
    assert clean["reason"] == [
        "Cumpliste: Valorar el riesgo", "Cumpliste: Recomendar medidas de protección", "Cumpliste: Informar derechos",
    ]


def test_la_razon_explica_tambien_los_hitos_que_nombra_el_final_alcanzado(monkeypatch):
    """V4 (SIM-VBG-002, «Protección lograda, duelo desatendido»): el final depende de hitos que no son decisivos; la razón
    los nombra (cumplidos o no) para que «Cómo llegaste aquí» explique el final, no solo los hitos decisivos."""
    own = [{"key": "sin-saludo", "title": "Sin saludo", "message": "Faltó saludar.", "tone": "warning",
            "when": {"all": [{"milestone": "riesgo_valorado"}, {"not": {"milestone": "saludo"}}]}}]

    ending = _play(monkeypatch, rules=_rules(endings=own), done=["riesgo_valorado"])

    assert ending["key"] == "sin-saludo"
    # En el orden en que el caso declara sus hitos, como siempre.
    assert ending["reason"] == [
        "Faltó: Saludar",
        "Cumpliste: Valorar el riesgo",
        "Faltó: Recomendar medidas de protección",
        "Faltó: Informar derechos",
    ]


def test_un_hito_que_el_final_no_nombra_y_no_es_decisivo_no_entra_en_la_razon(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(), done=DECISIVE + ["saludo"])

    assert not any("Saludar" in phrase for phrase in ending["reason"])


def test_el_resultado_no_lleva_cifras_de_puntaje_ni_conteos_por_severidad(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(), done=DECISIVE, contraindicated=1)

    assert not {"severityCounts", "caseFlags", "caseMetrics"} & set(ending)


# ─── los finales propios ──────────────────────────────────────────────────────────────────────
OWN = [
    {"key": "abierta", "title": "Persona abierta", "message": "Se abrió.", "tone": "positive",
     "when": {"all": [{"persona": {"bond": "OPEN"}}, {"milestone": "saludo"}]}},
    {"key": "muchos", "title": "Muchas", "message": "Varias.", "tone": "warning", "when": {"count": "risky", "gte": 2}},
    {"key": "otro", "title": "Otro", "message": "Terminó.", "tone": "neutral"},
]


def test_los_finales_propios_ganan_a_la_plantilla(monkeypatch):
    # Con la plantilla esto sería ``protectora`` (todo cumplido y nada contraindicado): el propio gana.
    ending = _play(monkeypatch, rules=_rules(endings=OWN), done=[*DECISIVE, "saludo"],
                   persona=(Bond.OPEN, Activation.CALM))

    assert ending["key"] == "abierta"
    assert endings.endings_of(case_rules.rules_of(SimpleNamespace(rules=json.dumps(_rules(endings=OWN))))) [0]["key"] == "abierta"


def test_un_final_propio_que_mira_a_la_persona_la_describe_en_la_razon(monkeypatch):
    ending = _play(monkeypatch, rules=_rules(endings=OWN), done=["saludo"], persona=(Bond.OPEN, Activation.CALM))

    assert ending["reason"][-1] == "La persona usuaria se muestra abierta y serena"
    other = _play(monkeypatch, rules=_rules(endings=OWN), risky=2)
    assert other["key"] == "muchos"
    assert not any(phrase.startswith("La persona usuaria") for phrase in other["reason"])


def test_el_final_sin_condicion_de_los_propios_es_el_de_por_defecto(monkeypatch):
    assert _play(monkeypatch, rules=_rules(endings=OWN))["key"] == "otro"


def test_si_los_propios_traen_condicion_y_ninguno_se_cumple_no_hay_final(monkeypatch):
    own = [{"key": "solo", "title": "Solo", "when": {"milestone": "saludo"}}]

    assert _play(monkeypatch, rules=_rules(endings=own)) is None


@pytest.mark.parametrize(
    "broken",
    [
        {"eval": "1 + 1"},
        {"milestone": ""},
        {"count": "inventada", "gte": 1},
        {"persona": {"bond": "OTRA"}},
        {"all": "nada"},
        "texto",
        7,
        None,
    ],
)
def test_una_condicion_rota_no_aplica_y_nunca_rompe_la_partida(monkeypatch, broken):
    own = [
        {"key": "roto", "title": "Roto", "message": "", "tone": "neutral", "when": broken},
        {"key": "por_defecto", "title": "Por defecto", "message": "Fin.", "tone": "neutral"},
    ]

    assert _play(monkeypatch, rules=_rules(endings=own), done=DECISIVE)["key"] == "por_defecto"


def test_una_condicion_rota_dentro_de_not_tampoco_se_vuelve_verdadera(monkeypatch):
    own = [
        {"key": "roto", "title": "Roto", "when": {"not": {"eval": "x"}}},
        {"key": "por_defecto", "title": "Por defecto"},
    ]

    assert _play(monkeypatch, rules=_rules(endings=own))["key"] == "por_defecto"


# ─── los finales de plantilla guardados con el texto reescrito siguen siendo la plantilla ───────────────────────────
def _leer(rules):
    return case_rules.rules_of(SimpleNamespace(rules=json.dumps(rules)))


def _guardados(rules, **cambios):
    """Los cuatro finales de plantilla tal como los guarda el editor, con los cambios por clave (p. ej. ``protectora={...}``)."""
    base = [dict(ending) for ending in endings.build_template(_leer(rules))]
    return [{**ending, **cambios.get(ending["key"], {})} for ending in base]


def test_los_finales_de_plantilla_con_texto_reescrito_se_reconocen_como_plantilla():
    rules = _rules(endings=_guardados(_rules(), protectora={"title": "Cuidaste bien", "message": "Mi texto."}))

    assert endings.stored_endings_are_template(_leer(rules)) is True


def test_sin_finales_guardados_no_hay_plantilla_que_reconocer():
    assert endings.stored_endings_are_template(_leer(_rules())) is False


@pytest.mark.parametrize(
    "cambio",
    [
        {"protectora": {"when": {"count": "risky", "lte": 7}}},  # otra condición
        {"con_brechas": {"when": {"count": "risky", "gte": 1}}},  # el de por defecto con condición
        {"critica": {"key": "otra_clave"}},  # otra clave
    ],
)
def test_otra_condicion_o_otra_clave_son_finales_propios(cambio):
    rules = _rules(endings=_guardados(_rules(), **cambio))

    assert endings.stored_endings_are_template(_leer(rules)) is False


def test_menos_de_cuatro_finales_o_en_otro_orden_son_propios():
    cuatro = _guardados(_rules())

    assert endings.stored_endings_are_template(_leer(_rules(endings=cuatro[:3]))) is False
    assert endings.stored_endings_are_template(_leer(_rules(endings=[cuatro[1], cuatro[0], *cuatro[2:]]))) is False


def test_la_condicion_debe_seguir_a_los_hitos_decisivos_de_ahora():
    """Si el docente cambia qué hitos son decisivos y los finales guardados no se regeneraron, ya no son la plantilla."""
    guardados = _guardados(_rules())
    otros = [{**m, "decisive": not m["decisive"]} for m in MILESTONES]

    assert endings.stored_endings_are_template(_leer({"milestones": otros, "endings": guardados})) is False
