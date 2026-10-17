"""E4-1a · Exportar la definición de una versión (RF-12, RNF-07, TD-02).

``export_definition`` vuelve la versión de la base de datos en el documento canónico. Aquí, con filas
reales: el caso sembrado exporta una base que **pasa el validador del taller tal cual**, el orden de
inserción de las filas no cambia los bytes cuando el orden está declarado, y el número de consultas no
crece con el tamaño del caso.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import jsonschema
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.simulation.casedef import canonical
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.authoring.definition_io import export_definition, load_definition
from apps.users.models import CustomUser

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.req("RF-12"), pytest.mark.req("RNF-07"), pytest.mark.req("TD-02"),
]

TALLER = Path(__file__).resolve().parent / "taller_dsl"
SEEDED_CODE = "SIM-VBG-001"


def _seeded():
    return CaseVersion.objects.get(simulation_case__code=SEEDED_CODE, status="PUBLISHED")


def _owner():
    return CustomUser.objects.filter(role="ADMIN").first() or CustomUser.objects.create_user(
        email="e4-admin@example.org", password="Clave-Larga-123!", nombre="E4", apellido="Admin",
        role="ADMIN", activo=True,
    )


def _small_version(code, *, flip_creation_order=False, orders=(1, 2)):
    """Un caso de dos escenas y dos opciones con ``display_order`` declarado; ``flip_creation_order``
    crea las filas en el orden contrario (otros ids) sin cambiar su contenido ni su orden declarado."""
    case = SimulationCase.objects.create(
        code=code, title="Caso pequeño", description="Una descripción.", created_by=_owner(),
    )
    version = CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="DRAFT", created_by=case.created_by,
        narrative_context="Contexto.",
    )
    specs = [
        ("a", "Escena A", True, False, orders[0]),
        ("b", "Escena B", False, True, orders[1]),
    ]
    if flip_creation_order:
        specs.reverse()
    nodes = {}
    for key, title, start, terminal, order in specs:
        nodes[key] = SimulationNode.objects.create(
            case_version=version, node_key=key, title=title, narrative=f"Narrativa {title}",
            start_node=start, terminal_node=terminal, display_order=order,
        )
    for key, text in (("o1", "Primera"), ("o2", "Segunda")):
        DecisionOption.objects.create(
            case_version=version, option_key=key, source_node=nodes["a"], target_node=nodes["b"],
            text=text, classification="ADEQUATE" if key == "o1" else "RISKY", immediate_feedback="Ok",
        )
    return version


def _workshop_verdict(document):
    """El veredicto del validador del taller sobre la **base** de ``document`` (sin ``x-siep``), por subproceso."""
    document = {key: value for key, value in document.items() if key != "x-siep"}
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "documento.json"
        path.write_text(json.dumps({
            "dsl": {"nombre": "SIEP", "version": "1.0", "esquema": "dsl-casos.schema.json"},
            "escenarios": [{"id": "E", "nombre": "export", "tipo": "valido", "caso": document}],
        }, ensure_ascii=False), encoding="utf-8")
        done = subprocess.run(
            [sys.executable, "-I", "-B", str(TALLER / "validar_dsl.py"), str(path),
             "--esquema", str(TALLER / "dsl-casos.schema.json"), "--json"],
            capture_output=True, timeout=120,
        )
    report = json.loads(done.stdout.decode("utf-8"))
    scenario = report["escenarios"][0]
    return scenario["obtenido"], scenario["reglasIncumplidas"], done.returncode


# ─── el caso sembrado ─────────────────────────────────────────────────────────────────────────
def test_the_seeded_case_exports_a_json_document():
    document = export_definition(_seeded().id)
    assert document["versionDsl"] == "1.0"
    assert document["caso"]["id"] == SEEDED_CODE
    assert document["caso"]["estado"] == "PUBLICADO"
    json.dumps(document, ensure_ascii=False)  # serializable tal cual


def test_the_seeded_base_passes_the_workshop_validator_as_is():
    verdict, failed, code = _workshop_verdict(export_definition(_seeded().id))
    assert (verdict, failed, code) == ("valido", [], 0)


def test_the_seeded_case_keeps_its_chain_of_scenes_and_leaves_the_door_only_room_out_of_the_base():
    document = export_definition(_seeded().id)
    scenes = document["escenas"]
    assert len(scenes) == 7  # ocho nodos; «comisaria-recepcion» solo se alcanza por puertas
    assert document["caso"]["escenaInicial"] == "E01"
    assert sum(1 for s in scenes if "decision" in s) == 6
    assert sum(len(s["decision"]["opciones"]) for s in scenes if "decision" in s) == 19
    assert all(s["decision"]["pregunta"] for s in scenes if "decision" in s)


# ─── x-siep del caso sembrado (E4-1b) ─────────────────────────────────────────────────────────
def test_the_seeded_x_siep_validates_against_its_schema():
    schema = json.loads(
        (Path(__file__).resolve().parents[1] / "casedef" / "schema" / "x-siep.schema.json").read_text(encoding="utf-8")
    )
    errors = list(jsonschema.Draft202012Validator(schema).iter_errors(export_definition(_seeded().id)["x-siep"]))
    assert errors == [], [f"{list(e.absolute_path)}: {e.message}" for e in errors][:3]


def test_the_seeded_x_siep_carries_the_whole_world_including_the_door_only_room():
    version = _seeded()
    siep = export_definition(version.id)["x-siep"]
    scenes = siep["escenas"]
    assert [s["clave"] for s in scenes].count("comisaria-recepcion") == 1
    hub = next(s for s in scenes if s["clave"] == "comisaria-recepcion")
    assert "id" not in hub and hub["titulo"] and hub["mapa"]["objetos"]
    assert len(scenes) == 8
    assert sum(1 for s in scenes if "id" in s) == 7
    objects = [o for s in scenes for o in s.get("mapa", {}).get("objetos", [])]
    assert len(objects) == 41
    assert sum(1 for o in objects if o["tipo"] == "EXIT") == 10
    assert siep["reglas"] == json.loads(version.rules)
    assert siep["contexto"] == version.narrative_context
    assert sum(1 for s in scenes if s.get("preguntaDerivada")) == 6  # las 6 decisiones sembradas no traen enunciado
    assert [p["clave"] for p in siep["personajes"]] == [
        c.character_key for c in version.characters.order_by("display_order", "id")
    ]
    assert all("id" not in p for p in siep["personajes"])  # ninguno tiene rol: ninguno está en la base


def test_removing_x_siep_leaves_exactly_the_base():
    full = export_definition(_seeded().id)
    base = {key: value for key, value in full.items() if key != "x-siep"}
    assert set(base) == {"versionDsl", "caso", "personajes", "herramientas", "escenas", "retroalimentacion", "rubricas"}


# ─── determinismo ─────────────────────────────────────────────────────────────────────────────
def test_two_exports_of_the_same_version_have_the_same_bytes():
    version = _seeded()
    assert canonical.canonical_bytes(export_definition(version.id)) == canonical.canonical_bytes(
        export_definition(version.id)
    )


def test_rows_created_in_another_order_give_the_same_bytes_when_the_order_is_declared():
    a = _small_version("E4-ORDEN-A")
    b = _small_version("E4-ORDEN-B", flip_creation_order=True)
    doc_a, doc_b = export_definition(a.id), export_definition(b.id)
    for doc in (doc_a, doc_b):
        assert doc["caso"]["escenaInicial"] == "E01"
        assert [s["titulo"] for s in doc["escenas"]] == ["Escena A", "Escena B"]
        doc["caso"]["id"] = "CASO-IGUAL"  # el código del caso es lo único que las distingue
    assert canonical.canonical_bytes(doc_a) == canonical.canonical_bytes(doc_b)


def test_the_declared_order_decides_the_ids_not_the_creation_order():
    version = _small_version("E4-ORDEN-C", orders=(2, 1))
    document = export_definition(version.id)
    assert [s["titulo"] for s in document["escenas"]] == ["Escena B", "Escena A"]
    assert document["caso"]["escenaInicial"] == "E02"


# ─── un borrador incompleto se exporta, no falla ──────────────────────────────────────────────
def test_a_draft_without_a_start_scene_exports_without_an_initial_scene():
    version = _small_version("E4-SIN-INICIO")
    version.nodes.update(start_node=False)
    document = export_definition(version.id)
    assert "escenaInicial" not in document["caso"]
    assert len(document["escenas"]) == 2


def test_the_loader_returns_the_rows_behind_each_scene_for_the_validator():
    version = _small_version("E4-CARGA")
    loaded = load_definition(version.id)
    assert [s.key for s in loaded.definition.scenes] == ["a", "b"]
    assert set(loaded.scene_node_ids) == {"a", "b"}
    assert loaded.scene_node_ids["a"] == version.nodes.get(node_key="a").id


# ─── consultas constantes ─────────────────────────────────────────────────────────────────────
def _queries_to_export(version_id):
    with CaptureQueriesContext(connection) as captured:
        export_definition(version_id)
    return len(captured)


def test_the_number_of_queries_does_not_grow_with_the_size_of_the_case():
    small = _small_version("E4-CONSULTAS")
    export_definition(small.id)  # calienta cachés (tipos de contenido, etc.)
    export_definition(_seeded().id)
    assert _queries_to_export(small.id) == _queries_to_export(_seeded().id)


def test_exporting_does_not_change_the_version():
    version = _seeded()
    before = CaseVersion.objects.filter(pk=version.pk).values("version", "status", "published_at").get()
    export_definition(version.id)
    assert CaseVersion.objects.filter(pk=version.pk).values("version", "status", "published_at").get() == before
