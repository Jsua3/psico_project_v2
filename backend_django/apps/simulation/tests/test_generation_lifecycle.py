"""C1 · Ciclo de vida de una generación por etapas: máquina de estados pura, tabla y restricción de una en curso."""
from datetime import datetime, timedelta, timezone as dt_timezone
from importlib import import_module

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor

from apps.simulation.models import CaseGeneration, GenerationStatus
from apps.simulation.services.authoring.generation import lifecycle

User = get_user_model()
NOW = datetime(2026, 11, 12, 12, 0, 0, tzinfo=dt_timezone.utc)


@pytest.mark.parametrize("status, transition, ok", [
    ("created", "skeleton", True), ("skeleton_ready", "skeleton", False),
    ("skeleton_ready", "scene", True), ("scenes_ready", "assemble", True),
    ("needs_repair", "repair_scene", True), ("needs_repair", "assemble", False),
    ("imported", "cancel", False), ("failed", "cancel", False), ("needs_repair", "cancel", True),
    ("created", "cancel", True), ("cancelled", "cancel", False), ("created", "scene", False),
    ("scenes_ready", "scene", False), ("skeleton_ready", "repair_scene", False), ("created", "desconocida", False),
])
def test_transiciones(status, transition, ok):
    assert lifecycle.can(status, transition) is ok


def test_los_valores_del_ciclo_de_vida_son_los_del_modelo():
    assert lifecycle.TERMINAL == (GenerationStatus.IMPORTED, GenerationStatus.FAILED, GenerationStatus.CANCELLED)
    assert lifecycle.IN_PROGRESS == GenerationStatus.IN_PROGRESS
    assert set(lifecycle.TERMINAL).isdisjoint(lifecycle.IN_PROGRESS)
    assert {*lifecycle.IN_PROGRESS, *lifecycle.TERMINAL} == set(GenerationStatus.values)
    assert lifecycle.MAX_REPAIR_ROUNDS == 2


def test_after_scene_pasa_a_scenes_ready_solo_con_todas_hechas():
    order = ["a", "b"]
    assert lifecycle.after_scene({"a": {"state": "done"}, "b": {"state": "pending"}}, order) == "skeleton_ready"
    assert lifecycle.after_scene({"a": {"state": "done"}}, order) == "skeleton_ready"  # falta una clave
    assert lifecycle.after_scene({"a": {"state": "done"}, "b": {"state": "error"}}, order) == "skeleton_ready"
    assert lifecycle.after_scene({"a": {"state": "done"}, "b": {"state": "done"}}, order) == "scenes_ready"
    assert lifecycle.after_scene({}, []) == "skeleton_ready"  # sin escenas no hay nada que ensamblar


def test_stale_a_los_150_segundos_y_abandonada_a_las_24_horas():
    assert lifecycle.is_stale(NOW - timedelta(seconds=149), NOW) is False
    assert lifecycle.is_stale(NOW - timedelta(seconds=150), NOW) is True
    assert lifecycle.is_stale(None, NOW) is False
    assert lifecycle.is_stale(NOW - timedelta(seconds=10), NOW, seconds=5) is True
    assert lifecycle.is_abandoned(NOW - timedelta(hours=23, minutes=59), NOW) is False
    assert lifecycle.is_abandoned(NOW - timedelta(hours=24), NOW) is True


@pytest.fixture
def teacher(db):
    return User.objects.create_user(email="gen-lc@x.com", password="x", nombre="N", apellido="A", role="ADMIN")


def _generation(owner, status=GenerationStatus.CREATED):
    return CaseGeneration.objects.create(owner=owner, lugar_id="bienestar", description="d", status=status)


def test_los_valores_por_defecto_de_una_generacion_nueva(teacher):
    row = _generation(teacher)
    row.refresh_from_db()
    assert row.status == "created"
    assert (row.skeleton_json, row.scenes_json, row.repair_json, row.report_json) == ("{}", "{}", "{}", "[]")
    assert (row.document_json, row.last_error_json) == ("", "{}")
    assert (row.repair_rounds, row.calls, row.tokens_in, row.tokens_out) == (0, 0, 0, 0)
    assert row.skeleton_started_at is None and row.case_version_id is None


def test_una_sola_generacion_en_curso_por_docente(teacher):
    _generation(teacher, GenerationStatus.SKELETON_READY)
    with pytest.raises(IntegrityError), transaction.atomic():
        _generation(teacher, GenerationStatus.CREATED)


def test_una_terminada_no_cuenta_para_la_restriccion(teacher):
    for status in lifecycle.TERMINAL:
        _generation(teacher, status)
    _generation(teacher, GenerationStatus.CREATED)  # una en curso junto a tres terminadas
    other = User.objects.create_user(email="gen-lc2@x.com", password="x", nombre="N", apellido="A", role="ADMIN")
    _generation(other, GenerationStatus.NEEDS_REPAIR)  # otra docente, otra en curso


def _migrate(targets):
    MigrationExecutor(connection).migrate(targets)


def _tables():
    with connection.cursor() as cursor:
        return set(connection.introspection.table_names(cursor))


@pytest.mark.django_db
def test_la_migracion_aplica_y_revierte():
    leaf = list(MigrationExecutor(connection).loader.graph.leaf_nodes("simulation"))
    migration = import_module("apps.simulation.migrations.0035_authoring_generations")
    assert ("simulation", "0034_node_comments_attempt_rehearsal") in migration.Migration.dependencies
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        _migrate([("simulation", "0034_node_comments_attempt_rehearsal")])
        assert "authoring_generations" not in _tables()
        _migrate([("simulation", "0035_authoring_generations")])
        assert "authoring_generations" in _tables()
        with connection.cursor() as cursor:
            # una restricción única condicional es un índice único parcial en PostgreSQL
            cursor.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'authoring_generations'")
            assert "uq_generation_in_progress_per_owner" in {name for (name,) in cursor.fetchall()}
    finally:
        _migrate(leaf)
