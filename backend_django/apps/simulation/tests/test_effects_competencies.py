"""E6-1a · Las competencias en los efectos de una opción (RQ-NEG-001, RQ-NEG-002; mesa §A20, R4 de la fase).

Una opción puede declarar a qué competencias aporta y con qué nivel (``effects.competencies``,
``{CÓDIGO: NIVEL}``). Sin esa declaración el perfil por competencia usa la severidad de la opción para todas las
de la rúbrica; con ella, la opción aporta SOLO a las que lista (E6-1b). Es un dato del caso: viaja en el editor,
en el documento DSL (``x-siep``) y en la huella, y un caso que no lo usa conserva su documento y su huella tal cual.

Leer es indulgente (descarta lo mal formado, nunca lanza: una versión con datos rotos no rompe una partida) y
escribir es estricto (400 con ``field: effects``). ``option_effects()`` NO gana la clave: sus consumidores comparan
el diccionario exacto; el perfil la lee con ``competency_overrides``.
"""
import copy
import json
from pathlib import Path

import jsonschema
import pytest

from apps.simulation.casedef.export import to_document
from apps.simulation.models import CaseVersion, DecisionOption
from apps.simulation.services import case_effects, case_rules
from apps.simulation.services.authoring import definition_io
from apps.simulation.tests.definition_samples import sample_definition

from .test_definition_import import _as, _comparable, admin, post, seeded  # noqa: F401  (fixtures y ayudantes)
from .test_effects_as_data import AUTHORING, _decide, case, cl, profesor  # noqa: F401  (fixtures y ayudantes)

pytestmark = [pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RNF-008")]

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "casedef" / "schema" / "x-siep.schema.json").read_text(encoding="utf-8")
)
COMPETENCIES = {"PAP": "LOGRADO", "ETICA_PROFESIONAL": "DESTACADO"}


# ─── leer: indulgente ─────────────────────────────────────────────────────────────────────────
def test_normalizar_conserva_las_competencias_bien_formadas():
    raw = {"severity": "risky", "competencies": dict(COMPETENCIES)}

    assert case_rules.normalize_effects(raw) == {"severity": "risky", "competencies": COMPETENCIES}


@pytest.mark.parametrize(
    ("competencies", "kept"),
    [
        ({"pap": "LOGRADO"}, None),  # el código va en mayúsculas
        ({"PAP": "EXCELENTE"}, None),  # nivel fuera del vocabulario
        ({"PAP": 3}, None),
        ({"PAP": None}, None),
        ({"": "LOGRADO"}, None),
        ({"A" * 101: "LOGRADO"}, None),
        ({"CON ESPACIO": "LOGRADO"}, None),
        (["PAP"], None),
        ("PAP", None),
        (3, None),
        ({}, None),
        ({"PAP": "LOGRADO", "malo": "x", "TAMBIEN_MALO": "otro"}, {"PAP": "LOGRADO"}),
    ],
)
def test_normalizar_descarta_lo_mal_formado_sin_lanzar(competencies, kept):
    result = case_rules.normalize_effects({"competencies": competencies})

    assert result == ({"competencies": kept} if kept else {})


def test_competency_overrides_lee_las_competencias_de_la_opcion():
    decision = DecisionOption(
        option_key="con", classification="RISKY", effects=json.dumps({"competencies": COMPETENCIES, "flags": {"a": True}})
    )
    sin = DecisionOption(option_key="sin", classification="RISKY")
    rota = DecisionOption(option_key="rota", classification="RISKY", effects="no es json")

    assert case_rules.competency_overrides(decision) == COMPETENCIES
    assert case_rules.competency_overrides(sin) == {}
    assert case_rules.competency_overrides(rota) == {}


def test_option_effects_no_gana_la_clave_de_competencias():
    """Sus consumidores y sus pruebas comparan el diccionario exacto: el perfil usa ``competency_overrides``."""
    decision = DecisionOption(
        option_key="con", classification="RISKY", effects=json.dumps({"competencies": COMPETENCIES})
    )

    assert case_effects.option_effects(decision) == {"severity": "risky", "flags": {}, "metrics": {}}


# ─── escribir: estricto (el editor) ───────────────────────────────────────────────────────────
def test_el_autor_guarda_las_competencias_y_el_editor_las_devuelve(profesor, case):
    effects = {"severity": "recommended", "competencies": dict(COMPETENCIES)}

    response = _decide(cl(profesor), case, effects=effects)

    assert response.status_code == 200, response.data
    assert response.data["data"]["decisions"][0]["effects"] == effects


@pytest.mark.parametrize(
    "competencies",
    [
        "PAP",
        ["PAP"],
        {"pap": "LOGRADO"},
        {"": "LOGRADO"},
        {"A" * 101: "LOGRADO"},
        {"CON ESPACIO": "LOGRADO"},
        {"PAP": "EXCELENTE"},
        {"PAP": "logrado"},
        {"PAP": 3},
        {f"C{i}": "LOGRADO" for i in range(21)},
    ],
)
def test_competencias_mal_formadas_son_un_400_con_el_campo_y_no_guardan_nada(profesor, case, competencies):
    response = _decide(cl(profesor), case, effects={"competencies": competencies})

    assert response.status_code == 400, response.data
    assert response.data["field"] == "effects"
    assert DecisionOption.objects.filter(case_version_id=case["cv"]).count() == 0


def test_un_objeto_vacio_de_competencias_se_limpia(profesor, case):
    response = _decide(cl(profesor), case, effects={"severity": "risky", "competencies": {}})

    assert response.status_code == 200, response.data
    assert response.data["data"]["decisions"][0]["effects"] == {"severity": "risky"}


# ─── el documento DSL ─────────────────────────────────────────────────────────────────────────
def _siep_with(effects):
    siep = copy.deepcopy(to_document(sample_definition())["x-siep"])
    scene = next(s for s in siep["escenas"] if s.get("opciones"))
    scene["opciones"][0]["efectos"] = effects
    return siep


def _errors(siep):
    return [e.message for e in jsonschema.Draft202012Validator(SCHEMA).iter_errors(siep)]


def test_el_esquema_de_x_siep_acepta_las_competencias_de_una_opcion():
    assert _errors(_siep_with({"competencies": dict(COMPETENCIES)})) == []


@pytest.mark.parametrize(
    "competencies",
    [
        ["PAP"],
        {"pap": "LOGRADO"},
        {"PAP": "EXCELENTE"},
        {"PAP": 3},
        {f"C{i}": "LOGRADO" for i in range(21)},
        {"A" * 101: "LOGRADO"},
    ],
)
def test_el_esquema_de_x_siep_rechaza_competencias_mal_formadas(competencies):
    assert _errors(_siep_with({"competencies": competencies})) != []


def test_el_caso_sembrado_no_gana_la_clave_ni_cambia_su_documento(db):
    """Una opción sin competencias exporta exactamente lo de antes: el hash de lo sellado no se mueve."""
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")

    document = definition_io.export_definition(seeded.id)

    effects = [o["efectos"] for s in document["x-siep"]["escenas"] for o in s.get("opciones", [])]
    assert effects and all("competencies" not in e for e in effects)


def test_las_competencias_hacen_la_ida_y_vuelta_por_el_documento(admin, seeded):
    document = definition_io.export_definition(seeded.id)
    scene = next(s for s in document["x-siep"]["escenas"] if s.get("opciones"))
    option = scene["opciones"][0]
    option["efectos"] = {**option["efectos"], "competencies": dict(COMPETENCIES)}

    response = post(admin, _as(document, "COPIA-COMPETENCIAS"))

    assert response.status_code == 201, response.data
    imported = response.data["data"]["caseVersionId"]
    stored = DecisionOption.objects.get(case_version_id=imported, option_key=option["clave"])
    assert json.loads(stored.effects)["competencies"] == COMPETENCIES
    assert definition_io.export_definition(imported) == _comparable(document, "COPIA-COMPETENCIAS")
