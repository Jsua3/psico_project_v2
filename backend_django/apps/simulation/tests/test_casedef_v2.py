"""Modelo de métricas · Tarea 12: el documento del caso 2.0 (``x-siep.version "2.0"``) y el caso sembrado.

El documento 2.0 describe cada opción por su ``clase``, los hitos que marca y el paso de la persona (``efectos``), cada
escena por su ``intensidad`` y las ``reglas`` por hitos, nivel de riesgo y finales; no lleva ``puntaje``, ``estres``,
``penalizacion`` ni ``metrics``. El importador lee el 2.0 tal cual y **convierte** el 1.0 (y el del taller, sin
``x-siep``) con la misma tabla de ``casedef.legacy`` que usa la migración ``0030``. Las pruebas puras no tocan la base
de datos; las que importan filas la usan.
"""
import copy
import json
from dataclasses import replace
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef import canonical, import_, legacy
from apps.simulation.casedef.export import to_base_document, to_document
from apps.simulation.casedef.report import ERROR
from apps.simulation.casedef.validate import validate_document
from apps.simulation.casedef.vocabulary import Intensity, ResponseClass, legacy_class
from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode
from apps.simulation.services.authoring import definition_io, importing
from apps.simulation.tests.definition_samples import sample_definition

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RN-05")]

DATA = Path(__file__).resolve().parents[1]
SEEDED = DATA / "data" / "cases" / "SIM-VBG-001.dsl.json"
LEGACY = DATA / "tests" / "fixtures" / "SIM-VBG-001.v1.dsl.json"
RETIRED = {"puntaje", "estres", "penalizacion", "metrics", "severity", "flags"}
User = get_user_model()


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _keys(item)


def _read(document):
    return import_.read_document(canonical.canonical_bytes(document))


def _errors(document):
    return [(i.code, i.path) for i in validate_document(document) if i.severity == ERROR]


# ─── exportar → importar → exportar ───────────────────────────────────────────────────────────
def _definition_with_a_world_for_every_hint():
    """La muestra sin las pistas de la escena que no tiene mapa: el importador les genera su sala (``scaffold``)."""
    definition = sample_definition()
    return replace(definition, scenes=tuple(
        replace(scene, hints=()) if scene.world is None else scene for scene in definition.scenes
    ))


def test_export_import_export_is_stable_in_2_0():
    first = to_document(_definition_with_a_world_for_every_hint())

    read = import_.to_definition(_read(first))
    again = to_document(read)

    assert canonical.canonical_bytes(again) == canonical.canonical_bytes(first)
    assert import_.to_definition(_read(again)) == read


def test_the_exporter_writes_a_2_0_x_siep_without_the_retired_fields():
    document = to_document(sample_definition())

    assert document["x-siep"]["version"] == "2.0"
    assert not RETIRED & set(_keys(document))
    options = [o for scene in document["x-siep"]["escenas"] for o in scene["opciones"]]
    assert {o["clase"] for o in options} == {"RECOMMENDED", "RISKY", "ACCEPTABLE"}
    assert {scene["intensidad"] for scene in document["x-siep"]["escenas"]} == {"MEDIUM", "HIGH"}


def test_the_workshop_base_keeps_its_classification_and_is_untouched_by_the_class():
    base = to_base_document(sample_definition())

    assert base["versionDsl"] == "1.0"
    assert [o["clasificacion"] for o in base["escenas"][0]["decision"]["opciones"]] == ["ADECUADA", "RIESGOSA"]
    assert "clase" not in set(_keys(base))


@pytest.mark.parametrize(
    ("response_class", "classification", "prohibited"),
    [("RECOMMENDED", "ADECUADA", False), ("ACCEPTABLE", "ADECUADA", False), ("RISKY", "RIESGOSA", False),
     ("CONTRAINDICATED", "INADECUADA", True)],
)
def test_the_workshop_base_derives_its_classification_and_prohibition_from_the_class(
    response_class, classification, prohibited
):
    definition = sample_definition()
    scene = definition.scenes[0]
    option = replace(scene.options[0], response_class=response_class, reason="Revictimiza." if prohibited else "")
    scenes = (replace(scene, options=(option, *scene.options[1:])), *definition.scenes[1:])

    written = to_base_document(replace(definition, scenes=scenes))["escenas"][0]["decision"]["opciones"][0]

    assert written["clasificacion"] == classification
    assert written.get("conductaProhibida", False) is prohibited


def test_a_2_0_import_ignores_the_base_classification_and_the_class_comes_from_x_siep():
    document = to_document(_definition_with_a_world_for_every_hint())
    first = document["escenas"][0]["decision"]["opciones"][0]
    assert first["clasificacion"] == "ADECUADA"
    first["clasificacion"] = "INADECUADA"
    first["conductaProhibida"] = True

    read = import_.to_definition(_read(document))

    assert read.scenes[0].options[0].response_class == "RECOMMENDED"
    assert to_document(read)["escenas"][0]["decision"]["opciones"][0]["clasificacion"] == "ADECUADA"
    assert "conductaProhibida" not in to_document(read)["escenas"][0]["decision"]["opciones"][0]


def test_a_1_0_import_still_converts_the_base_classification_through_legacy_class():
    document = to_document(sample_definition())
    document["x-siep"]["version"] = "1.0"
    for entry in document["x-siep"]["escenas"]:
        for option in entry["opciones"]:
            option.pop("clase")
            option.update({"puntaje": 0, "estres": 0, "penalizacion": 0})
        entry.pop("intensidad")
    document["x-siep"]["reglas"] = {}
    document["escenas"][0]["decision"]["opciones"][1]["clasificacion"] = "INADECUADA"
    document["escenas"][0]["decision"]["opciones"][1]["motivoProhibicion"] = "Revictimiza."

    read = import_.to_definition(_read(document))

    assert [o.response_class for o in read.scenes[0].options] == ["RECOMMENDED", "CONTRAINDICATED"]


def test_a_2_0_document_is_read_as_is():
    definition = _definition_with_a_world_for_every_hint()

    read = import_.to_definition(_read(to_document(definition)))

    assert [(o.key, o.response_class, o.effects) for s in read.scenes for o in s.options] == [
        (o.key, o.response_class, o.effects) for s in definition.scenes for o in s.options
    ]
    assert [(s.key, s.intensity) for s in read.scenes] == [(s.key, s.intensity) for s in definition.scenes]
    assert read.rules == definition.rules  # tal cual: no se vuelve a convertir


def test_a_2_0_option_with_empty_effects_stays_empty():
    """Leer el 2.0 no completa los efectos con la persona por defecto: ``{}`` vuelve como ``{}``."""
    read = import_.to_definition(_read(to_document(_definition_with_a_world_for_every_hint())))

    assert next(o for s in read.scenes for o in s.options if o.key == "salir").effects == {}


# ─── el documento 1.0 se convierte al importar ────────────────────────────────────────────────
def test_the_1_0_seeded_document_is_valid_and_imports_with_the_conversion_table():
    document = _load(LEGACY)
    assert _errors(document) == []

    definition = import_.to_definition(_read(document))

    base_options = {
        o["id"]: o for scene in document["escenas"] for o in (scene.get("decision") or {}).get("opciones", [])
    }
    raw = {o["clave"]: o for entry in document["x-siep"]["escenas"] for o in entry["opciones"]}
    ids = {o["clave"]: o["id"] for entry in document["x-siep"]["escenas"] for o in entry["opciones"] if "id" in o}
    assert len(raw) == len(ids) == 19
    for scene in definition.scenes:
        for option in scene.options:
            source = base_options[ids[option.key]]
            expected = legacy_class(
                {"ADECUADA": "ADEQUATE", "RIESGOSA": "RISKY", "INADECUADA": "INADEQUATE"}[source["clasificacion"]],
                raw[option.key]["efectos"].get("severity"), bool(source.get("conductaProhibida")),
            )
            assert option.response_class == expected.value
            assert option.effects == legacy.convert_effects(raw[option.key]["efectos"], expected)
            assert "persona" in option.effects and isinstance(option.effects["milestones"], list)
    assert {o.response_class for s in definition.scenes for o in s.options} >= {"RECOMMENDED", "CONTRAINDICATED"}


def test_a_1_0_document_turns_its_flags_into_milestones_and_its_endings_into_the_template():
    document = _load(LEGACY)
    flags = [key for entry in document["x-siep"]["escenas"] for o in entry["opciones"] for key in o["efectos"].get("flags", {})]

    rules = import_.to_definition(_read(document)).rules

    assert "metrics" not in rules
    assert [m["key"] for m in rules["milestones"]] == [k for k in dict.fromkeys(flags) if k not in legacy.NEGATIVE_FLAGS]
    assert {m["key"] for m in rules["milestones"] if m["decisive"]} == set(legacy.DECISIVE_BY_CASE["SIM-VBG-001"])
    assert "mediacion_agresor_intentada" not in {m["key"] for m in rules["milestones"]}
    assert rules["riskLevel"] == "EXTREME"
    assert [e["key"] for e in rules["endings"]] == list(legacy.TEMPLATE_ORDER)
    assert not any(legacy.uses_legacy_condition(e.get("when", {})) for e in rules["endings"])


def test_a_1_0_document_takes_the_intensity_from_the_sensitivity_of_the_scene():
    document = _load(LEGACY)
    sensitive = {e["clave"] for e in document["x-siep"]["escenas"] if any(
        s.get("contenidoSensible") for s in document["escenas"] if s["id"] == e.get("id"))}

    definition = import_.to_definition(_read(document))

    assert sensitive
    for scene in definition.scenes:
        assert scene.intensity == (Intensity.HIGH.value if scene.key in sensitive else Intensity.MEDIUM.value)


def test_a_workshop_document_without_x_siep_is_converted_too():
    base = to_base_document(sample_definition())

    definition = import_.to_definition(_read(base))

    assert [o.response_class for o in definition.scenes[0].options] == ["RECOMMENDED", "RISKY"]
    assert definition.scenes[0].options[0].effects == {"persona": {"bond": 1, "activation": -1}, "milestones": []}
    assert {s.intensity for s in definition.scenes} == {"MEDIUM"}
    assert definition.rules == {}


def test_a_1_0_option_marked_as_prohibited_conduct_becomes_contraindicated():
    document = to_document(sample_definition())
    document["x-siep"]["version"] = "1.0"
    for entry in document["x-siep"]["escenas"]:
        for option in entry["opciones"]:
            option.pop("clase")
            option.update({"puntaje": 0, "estres": 0, "penalizacion": 0})
        entry.pop("intensidad")
    document["x-siep"]["reglas"] = {"metrics": [{"key": "m"}]}
    document["escenas"][0]["decision"]["opciones"][0].update({"conductaProhibida": True, "motivoProhibicion": "Revictimiza."})

    definition = import_.to_definition(_read(document))

    assert definition.scenes[0].options[0].response_class == ResponseClass.CONTRAINDICATED.value
    assert "metrics" not in definition.rules


def test_another_x_siep_version_is_not_converted():
    document = to_document(sample_definition())
    document["x-siep"]["version"] = "3.0"

    assert ("DSL.SIEP_SCHEMA", "x-siep.version") in _errors(document)
    with pytest.raises(ValueError):
        import_.to_definition(_read(document))


# ─── el documento sembrado ────────────────────────────────────────────────────────────────────
def test_the_seeded_document_is_2_0_without_the_retired_fields():
    document = _load(SEEDED)

    assert document["x-siep"]["version"] == "2.0"
    assert not RETIRED & set(_keys(document))
    assert _errors(document) == []
    options = [o for e in document["x-siep"]["escenas"] for o in e["opciones"]]
    assert len(options) == 19 and all(o["clase"] in ResponseClass._value2member_map_ for o in options)
    assert all(e["intensidad"] in Intensity._value2member_map_ for e in document["x-siep"]["escenas"])


def test_the_seeded_document_declares_its_milestones_in_proper_spanish():
    rules = _load(SEEDED)["x-siep"]["reglas"]

    labels = {m["key"]: m["label"] for m in rules["milestones"]}
    assert len(labels) == 11  # los actos desaconsejados no son hitos (legacy.NEGATIVE_FLAGS)
    assert not set(legacy.NEGATIVE_FLAGS) & set(labels)
    assert labels["riesgo_feminicidio_valorado"] == "Valorar el riesgo de feminicidio"
    assert labels["medidas_proteccion_activadas"] == "Recomendar medidas de protección"
    assert labels["asesoria_derechos_realizada"] == "Informar sobre derechos"
    assert labels["pap_aplicado"] == "Aplicar primeros auxilios psicológicos"
    assert all("_" not in label and label != legacy.milestone_label(key) for key, label in labels.items())
    assert all(m["description"] == "A confirmar con Psicología." for m in rules["milestones"])


def test_the_seeded_document_is_the_conversion_of_the_1_0_one():
    """El 2.0 sembrado dice lo mismo que el 1.0 convertido: salvo los rótulos de los hitos, las reglas son iguales."""
    seeded = import_.to_definition(_read(_load(SEEDED)))
    converted = import_.to_definition(_read(_load(LEGACY)))

    def signature(definition):
        return [(s.key, s.intensity, [(o.key, o.response_class, o.effects) for o in s.options]) for s in definition.scenes]

    assert signature(seeded) == signature(converted)
    strip = lambda rules: {**rules, "milestones": [{k: v for k, v in m.items() if k not in ("label", "description")} for m in rules["milestones"]]}  # noqa: E731
    assert strip(seeded.rules) == strip(converted.rules)


# ─── las filas ────────────────────────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_importing_the_1_0_document_writes_the_same_rows_as_the_2_0_one():
    admin = User.objects.get(email="admin@psychosim.edu.co")
    document = _load(LEGACY)
    document["caso"]["id"] = "SIM-V1-001"
    version = CaseVersion.objects.get(pk=importing.import_document(document, admin)["caseVersionId"])
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")

    def rows(v):
        return (
            list(DecisionOption.objects.filter(case_version=v).order_by("option_key")
                 .values_list("option_key", "response_class")),
            [(o.option_key, json.loads(o.effects)) for o in DecisionOption.objects.filter(case_version=v).order_by("option_key")],
            list(SimulationNode.objects.filter(case_version=v).order_by("node_key").values_list("node_key", "intensity")),
        )

    assert rows(version) == rows(seeded)
    exported = definition_io.export_definition(version.id)
    assert exported["x-siep"]["version"] == "2.0" and not RETIRED & set(_keys(exported))


@pytest.mark.django_db
def test_a_2_0_document_exported_from_rows_imports_back_to_the_same_document():
    admin = User.objects.get(email="admin@psychosim.edu.co")
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    first = definition_io.export_definition(seeded.id)
    again = copy.deepcopy(first)
    again["caso"]["id"] = "SIM-V2-001"

    version = CaseVersion.objects.get(pk=importing.import_document(again, admin)["caseVersionId"])
    second = definition_io.export_definition(version.id)

    second["caso"]["id"], second["caso"]["estado"] = first["caso"]["id"], first["caso"]["estado"]
    assert canonical.canonical_bytes(second) == canonical.canonical_bytes(first)


def test_the_discouraged_acts_are_not_milestones_anywhere_in_the_seeded_document():
    """Ni en ``reglas`` ni en los ``efectos`` de ninguna opción; la opción que los encendía conserva su clase."""
    document = _load(SEEDED)
    options = {o["clave"]: o for e in document["x-siep"]["escenas"] for o in e["opciones"]}

    for flag in legacy.NEGATIVE_FLAGS:
        assert flag not in json.dumps(document["x-siep"]["reglas"])
        assert all(flag not in o["efectos"].get("milestones", []) for o in options.values())
    assert options["c1-mediacion-perdon"]["clase"] == "CONTRAINDICATED"
    assert sum(1 for o in options.values() if o["clase"] == "CONTRAINDICATED") == 3
