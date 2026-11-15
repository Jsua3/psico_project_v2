"""Tarea 3 (bloque A2) · la base guarda los comentarios por escena y la marca de ensayo del intento."""
import json
import uuid
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from apps.simulation.casedef.export import to_document
from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationCase, SimulationNode
from apps.simulation.services import case_rules
from apps.simulation.services.authoring import definition_io
from apps.simulation.services.authoring.publication import clone_version
from apps.simulation.tests.definition_samples import sample_definition, sample_definition_with_comments

User = get_user_model()


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="a2_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def case(actor):
    return SimulationCase.objects.create(code="A2-CASO", title="Caso A2", created_by=actor)


def _comments_of_loaded(version):
    loaded = definition_io.load_definition(version.id).definition
    return [scene.comments for scene in loaded.scenes]


def test_importar_guarda_los_comentarios_y_exportar_los_devuelve(case, actor):
    definition = sample_definition_with_comments()
    version = definition_io.write_definition(definition, case=case, actor=actor)
    assert _comments_of_loaded(version) == [scene.comments for scene in definition.scenes]
    assert any(_comments_of_loaded(version))
    exported = definition_io.export_definition(version.id)
    assert exported["x-siep"]["escenas"] == to_document(definition)["x-siep"]["escenas"]
    inicio = next(scene for scene in exported["x-siep"]["escenas"] if scene.get("comentarios"))
    assert [c["personaje"] for c in inicio["comentarios"]] == ["laura", "laura"]


def test_clonar_la_version_copia_los_comentarios(case, actor):
    version = definition_io.write_definition(sample_definition_with_comments(), case=case, actor=actor)
    clone_version(version.id, actor)
    clone = CaseVersion.objects.get(cloned_from=version)
    rows = lambda v: list(  # noqa: E731
        SimulationNode.objects.filter(case_version=v).order_by("id").values_list("node_key", "comments_json")
    )
    assert rows(clone) == rows(version)
    assert any(raw != "[]" for _, raw in rows(clone))


def test_un_caso_sin_comentarios_guarda_lista_vacia_y_exporta_igual(case, actor):
    definition = sample_definition()
    version = definition_io.write_definition(definition, case=case, actor=actor)
    assert set(SimulationNode.objects.filter(case_version=version).values_list("comments_json", flat=True)) == {"[]"}
    exported = definition_io.export_definition(version.id)
    assert all("comentarios" not in scene for scene in exported["x-siep"]["escenas"])
    assert exported["x-siep"]["version"] == "2.0"


def test_comments_of_lee_indulgente():
    assert case_rules.comments_of(SimpleNamespace(comments_json="{roto")) == []
    assert case_rules.comments_of(SimpleNamespace(comments_json='[{"linea": "x"}]')) == []
    assert case_rules.comments_of(SimpleNamespace(comments_json='{"personaje": "a", "linea": "b"}')) == []
    assert case_rules.comments_of(SimpleNamespace(comments_json=None)) == []
    assert case_rules.comments_of(SimpleNamespace()) == []
    raw = json.dumps([
        {"personaje": "laura", "linea": "Hola", "cuando": {"inspected": "x"}, "emocion": "alegre", "gesto": "asiente"},
        {"personaje": "laura", "linea": 5},
        "texto",
        {"personaje": "", "linea": "sin personaje"},
        {"personaje": "laura", "linea": "Sola"},
    ])
    assert case_rules.comments_of(SimpleNamespace(comments_json=raw)) == [
        {"personaje": "laura", "linea": "Hola", "cuando": {"inspected": "x"}, "emocion": "alegre", "gesto": "asiente"},
        {"personaje": "laura", "linea": "Sola"},
    ]


def _attempt(student, version, *, rehearsal, status="IN_PROGRESS"):
    node = SimulationNode.objects.filter(case_version=version, start_node=True).first()
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, student=student, case_version=version, current_node=node,
        status=status, is_rehearsal=rehearsal,
    )


def test_un_ensayo_abierto_y_un_intento_abierto_del_mismo_usuario_y_version_conviven(case, actor):
    version = definition_io.write_definition(sample_definition(), case=case, actor=actor)
    play = _attempt(actor, version, rehearsal=False)
    rehearsal = _attempt(actor, version, rehearsal=True)
    assert play.is_rehearsal is False and rehearsal.is_rehearsal is True
    # El gestor por defecto oculta los ensayos (PlayableAttemptManager): para contar los dos hace falta ``all_objects``.
    assert SimulationAttempt.all_objects.filter(student=actor, case_version=version).count() == 2


def test_dos_ensayos_abiertos_del_mismo_autor_y_version_violan_la_restriccion(case, actor):
    version = definition_io.write_definition(sample_definition(), case=case, actor=actor)
    _attempt(actor, version, rehearsal=True)
    with pytest.raises(IntegrityError), transaction.atomic():
        _attempt(actor, version, rehearsal=True)


def test_dos_intentos_abiertos_de_juego_siguen_violando_la_restriccion(case, actor):
    version = definition_io.write_definition(sample_definition(), case=case, actor=actor)
    _attempt(actor, version, rehearsal=False)
    with pytest.raises(IntegrityError), transaction.atomic():
        _attempt(actor, version, rehearsal=False)


def test_un_ensayo_cerrado_deja_abrir_otro(case, actor):
    version = definition_io.write_definition(sample_definition(), case=case, actor=actor)
    _attempt(actor, version, rehearsal=True, status="COMPLETED")
    _attempt(actor, version, rehearsal=True)
