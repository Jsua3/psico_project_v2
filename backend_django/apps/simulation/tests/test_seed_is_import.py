"""E4-6 · La semilla del caso PDF es una importación (D-10, SIEP-RN-02, REGLA-005, TD-11).

``seed_caso_pdf`` ya no construye el caso a mano: lee el documento del repositorio
(``apps/simulation/data/cases/SIM-VBG-001.dsl.json``, el DSL del taller con ``x-siep``), lo importa, lo
valida y lo publica por la misma compuerta que cualquier otro caso. Y **no reescribe lo publicado**
(REGLA-005): una versión publicada se queda como está, con sus intentos; si le falta el sello (se publicó
antes de E4) se sella sin tocarla y si su sello difiere del documento del repositorio, se avisa.
"""
import json
from io import StringIO
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.simulation.casedef.canonical import canonical_bytes, definition_hash, document_text
from apps.simulation.models import (
    AttemptEvent,
    CaseVersion,
    Competency,
    DecisionOption,
    MapObject,
    SceneMap,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services import game_service
from apps.simulation.services.authoring import definition_io

from .test_game import assign_case_to_student

pytestmark = [pytest.mark.req("SIEP-RN-02"), pytest.mark.req("RN-05"), pytest.mark.req("RF-12")]

User = get_user_model()
DOCUMENT = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"
CODE = "SIM-VBG-001"


def _document():
    return json.loads(DOCUMENT.read_text(encoding="utf-8"))


def _seeded():
    return CaseVersion.objects.get(simulation_case__code=CODE, status="PUBLISHED")


def _seed(*args, **options):
    out, err = StringIO(), StringIO()
    call_command("seed_caso_pdf", *args, stdout=out, stderr=err, **options)
    return out.getvalue(), err.getvalue()


def _rows(version):
    """Las filas que cuelgan de la versión, por identificador: si la semilla las reescribiera, cambiarían."""
    return {
        "nodes": sorted(SimulationNode.objects.filter(case_version=version).values_list("id", flat=True)),
        "options": sorted(DecisionOption.objects.filter(case_version=version).values_list("id", flat=True)),
        "maps": sorted(SceneMap.objects.filter(case_version=version).values_list("id", flat=True)),
        "objects": sorted(MapObject.objects.filter(scene_map__case_version=version).values_list("id", flat=True)),
    }


@pytest.fixture
def student(db):
    return User.objects.create_user(
        email="seed_student@x.com", password="pass1234", nombre="Est", apellido="Semilla", role="ESTUDIANTE"
    )


# ─── el documento ES la semilla ───────────────────────────────────────────────────────────────
def test_the_published_seed_is_exactly_the_document_of_the_repository(db):
    version = _seeded()

    assert canonical_bytes(definition_io.export_definition(version.id)) == canonical_bytes(_document())
    assert version.definition_hash == definition_hash(_document())
    assert version.validated_at is not None


def test_the_document_is_written_in_the_readable_canonical_format(db):
    document = _document()

    assert DOCUMENT.read_text(encoding="utf-8") == document_text(document)


def _keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _keys(item)


def test_the_legacy_immediate_feedback_only_travels_inside_x_siep(db):
    """``immediate_feedback`` (el campo heredado que hoy hace de retroalimentación) no es de la base del taller."""
    document = _document()
    base = {key: value for key, value in document.items() if key != "x-siep"}

    assert "retroalimentacionInmediata" not in set(_keys(base))
    assert "retroalimentacionInmediata" in set(_keys(document["x-siep"]))  # y sí viaja donde corresponde


# ─── no reescribe lo publicado (REGLA-005) ────────────────────────────────────────────────────
def test_seeding_again_changes_no_row_and_no_hash(db):
    version = _seeded()
    before = (_rows(version), version.definition_hash, version.validated_at, version.published_at, version.version)

    _seed()
    _seed()

    after = _seeded()
    assert (_rows(after), after.definition_hash, after.validated_at, after.published_at, after.version) == before
    assert after.id == version.id


def test_a_published_version_with_attempts_keeps_every_one_of_them(student):
    version = _seeded()
    assign_case_to_student(student, version.id, "SEED-A")
    game_service.start_attempt(version.id, student)
    attempts = SimulationAttempt.objects.filter(case_version=version).count()
    events = AttemptEvent.objects.filter(attempt__case_version=version).count()
    seal = (version.definition_hash, version.validated_at)

    _seed()

    version.refresh_from_db()
    assert SimulationAttempt.objects.filter(case_version=version).count() == attempts == 1
    assert AttemptEvent.objects.filter(attempt__case_version=version).count() == events > 0
    assert (version.definition_hash, version.validated_at) == seal


def test_a_published_version_without_a_seal_is_sealed_without_being_rewritten(db):
    version = _seeded()
    rows = _rows(version)
    CaseVersion.objects.filter(pk=version.pk).update(validated_at=None, definition_hash=None)

    out, _ = _seed()

    sealed = CaseVersion.objects.get(pk=version.pk)
    assert sealed.definition_hash == definition_hash(definition_io.export_definition(version.id))
    assert sealed.validated_at is not None
    assert _rows(sealed) == rows
    assert "sell" in out.lower()


def test_a_published_version_whose_seal_differs_from_the_document_is_left_alone_and_reported(db):
    version = _seeded()
    rows = _rows(version)
    stale = "sha256:" + "1" * 64
    CaseVersion.objects.filter(pk=version.pk).update(definition_hash=stale)

    _, err = _seed()

    after = CaseVersion.objects.get(pk=version.pk)
    assert after.definition_hash == stale  # no se re-sella: un sello distinto se avisa, no se tapa
    assert _rows(after) == rows
    assert "difiere" in err


def test_a_version_that_exists_but_is_not_published_is_neither_published_nor_rewritten(db):
    version = _seeded()
    rows = _rows(version)
    CaseVersion.objects.filter(pk=version.pk).update(status="ARCHIVED")

    out, err = _seed()

    after = CaseVersion.objects.get(pk=version.pk)
    assert after.status == "ARCHIVED" and _rows(after) == rows
    assert "ARCHIVED" in err and "no se publica" in err
    assert not CaseVersion.objects.filter(simulation_case=after.simulation_case, status="PUBLISHED").exists()


# ─── opciones, instalación nueva y limpieza ───────────────────────────────────────────────────
def test_the_case_code_and_the_semantic_version_options_still_work(db):
    out, _ = _seed(case_code="SIM-ALT-001", semantic_version="3.1.4")

    version = CaseVersion.objects.get(simulation_case__code="SIM-ALT-001", semantic_version="3.1.4")
    expected = _document()
    expected["caso"]["id"], expected["caso"]["version"] = "SIM-ALT-001", "3.1.4"
    assert version.status == "PUBLISHED" and version.definition_hash is not None
    assert canonical_bytes(definition_io.export_definition(version.id)) == canonical_bytes(expected)
    assert _seeded().semantic_version == "2.1.0"  # el canónico no se movió
    assert "SIM-ALT-001" in out


def test_the_competencies_of_the_criteria_are_linked_before_publishing_on_a_fresh_catalog(db):
    """En una instalación nueva el catálogo de competencias está vacío: se crea y se enlaza antes de sellar."""
    Competency.objects.all().delete()

    _seed(case_code="SIM-ALT-003", semantic_version="1.0.0")

    version = CaseVersion.objects.get(simulation_case__code="SIM-ALT-003")
    expected = _document()
    expected["caso"]["id"], expected["caso"]["version"] = "SIM-ALT-003", "1.0.0"
    assert canonical_bytes(definition_io.export_definition(version.id)) == canonical_bytes(expected)
    assert version.definition_hash == definition_hash(expected)
    assert Competency.objects.exists()


def test_a_case_shell_without_versions_takes_the_title_of_the_document_and_receives_the_version(db):
    admin = User.objects.get(email="admin@psychosim.edu.co")
    shell = SimulationCase.objects.create(code="SIM-SHELL-001", title="Cáscara", description="Vacía.", created_by=admin)

    _seed(case_code="SIM-SHELL-001")

    shell.refresh_from_db()
    assert shell.title == _document()["caso"]["titulo"]
    assert CaseVersion.objects.filter(simulation_case=shell, status="PUBLISHED").count() == 1
    assert SimulationCase.objects.filter(code="SIM-SHELL-001").count() == 1


def test_the_other_published_versions_of_the_case_are_archived(db):
    admin = User.objects.get(email="admin@psychosim.edu.co")
    stray = CaseVersion.objects.create(
        simulation_case=_seeded().simulation_case, semantic_version="9.9.9", status="PUBLISHED", created_by=admin
    )

    _seed()

    stray.refresh_from_db()
    assert stray.status == "ARCHIVED"
    assert _seeded().semantic_version == "2.1.0"


def test_the_legacy_duplicate_cases_are_still_retired(db):
    admin = User.objects.get(email="admin@psychosim.edu.co")
    legacy = SimulationCase.objects.create(code="SOC-FEM-001", title="Viejo", created_by=admin)
    version = CaseVersion.objects.create(
        simulation_case=legacy, semantic_version="1.0.0", status="PUBLISHED", created_by=admin
    )

    _seed()

    legacy.refresh_from_db()
    version.refresh_from_db()
    assert legacy.active is False and version.status == "ARCHIVED"


def test_the_seed_publishes_through_the_single_gate_and_leaves_no_attempts_behind(db):
    """Sembrar un caso nuevo no deja intentos ni borra los de otros casos."""
    before = SimulationAttempt.objects.count()

    _seed(case_code="SIM-ALT-002", semantic_version="1.0.0")

    assert SimulationAttempt.objects.count() == before
    version = CaseVersion.objects.get(simulation_case__code="SIM-ALT-002")
    assert version.definition_hash == definition_hash(definition_io.export_definition(version.id))
