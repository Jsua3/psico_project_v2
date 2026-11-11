"""SIM-VBG-001 2.1: el documento del caso real usa los campos nuevos (requiere, reaccion, objetivo).

La versión publicada 2.0.0 no se toca: la siembra publica la 2.1.0 como versión nueva. La copia del documento
2.0.0 vive en ``fixtures/`` para probar justo eso. El contenido clínico es un borrador que Psicología debe confirmar.
"""
import json
from pathlib import Path
from unittest import mock

import pytest
from django.core.management import call_command

from apps.simulation.casedef import report, validate
from apps.simulation.management.commands import seed_caso_pdf
from apps.simulation.models import CaseVersion

DOCUMENT = Path(seed_caso_pdf.__file__).resolve().parents[2] / "data" / "cases" / "SIM-VBG-001.dsl.json"
V200 = Path(__file__).parent / "fixtures" / "SIM-VBG-001.v2-0-0.dsl.json"


def _scenes():
    return {s["clave"]: s for s in json.loads(DOCUMENT.read_text(encoding="utf-8"))["x-siep"]["escenas"]}


def test_the_case_document_is_2_1_and_valid():
    document = json.loads(DOCUMENT.read_text(encoding="utf-8"))
    assert document["x-siep"]["version"] == "2.1"
    assert [i for i in validate.validate_document(document) if i.severity == report.ERROR] == []
    states = {r.rule: r.state for r in validate.run_rules(document).results}
    assert [states[f"OCL-{n}"] for n in ("09", "10", "11", "12")] == ["CUMPLE"] * 4


def test_every_decision_scene_has_a_goal():
    scenes = json.loads(DOCUMENT.read_text(encoding="utf-8"))["x-siep"]["escenas"]
    assert all(s.get("objetivo") for s in scenes if s["opciones"])


REQUIREMENTS = {
    "hospital-urgencias": {"all": [{"talked": "enfermera-urgencias"}, {"used": "PAP"}]},
    "hospital-accion-etica": {"has": "SPIKES"},
    "hospital-cierre-bloque": {"used": "RISK_METER"},
    "comisaria-accion-final": {"used": "RISK_METER"},
}


def test_only_the_recommended_options_of_the_listed_scenes_carry_a_requirement():
    for key, scene in _scenes().items():
        for option in scene["opciones"]:
            expected = REQUIREMENTS.get(key) if option["clase"] == "RECOMMENDED" else None
            assert option.get("requiere") == expected, (key, option["clave"])


def test_the_recommended_options_of_the_urgencias_scene_react_and_the_nurse_has_a_label():
    scene = _scenes()["hospital-urgencias"]
    for option in scene["opciones"]:
        reaction = option.get("reaccion")
        if option["clase"] != "RECOMMENDED":
            assert reaction is None
            continue
        assert reaction["emocion"] == "triste" and reaction["gesto"] == "se-acerca" and "personaje" not in reaction
        assert reaction["linea"].startswith("(La abuela respira un poco más despacio")
    npcs = scene["mapa"]["ambiente"]["ambientNpcs"]
    assert {n["key"]: n.get("label") for n in npcs}["enfermera-urgencias"] == "Enfermera de urgencias"


def test_seeding_publishes_2_1_0_and_keeps_2_0_0(db):
    """La base de pruebas ya trae sembrada la 2.1.0 de SIM-VBG-001: se usa un código aparte para ver el orden real."""
    code = "SIM-V21-001"
    with mock.patch.object(seed_caso_pdf, "DOCUMENT", V200):
        call_command("seed_caso_pdf", case_code=code, semantic_version="2.0.0")
    old = CaseVersion.objects.get(simulation_case__code=code, semantic_version="2.0.0")
    assert (old.status, old.definition_hash is not None) == ("PUBLISHED", True)

    call_command("seed_caso_pdf", case_code=code)

    versions = dict(CaseVersion.objects.filter(simulation_case__code=code).values_list("semantic_version", "status"))
    assert versions == {"2.0.0": "ARCHIVED", "2.1.0": "PUBLISHED"}
    kept = CaseVersion.objects.get(pk=old.pk)
    assert (kept.definition_hash, kept.validated_at) == (old.definition_hash, old.validated_at)
