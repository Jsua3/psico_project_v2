"""E0-8 · Contrato congelado del esquema (sustituye al volcado ``deploy/db_seed.sql``).

Lo que el volcado de despliegue imponía en la base de datos y que ahora declaran
los modelos y construye ``migrate``. La suite corre sobre una base construida con
las migraciones, así que estas pruebas leen el catálogo de PostgreSQL: si alguien
quita un CHECK, un UNIQUE o un ``ON DELETE`` del modelo, falla aquí.

La incidencia que motivó esto: un CHECK de producción que la suite no veía porque
corría sobre un DDL más laxo (``PAUSED``, ``REPLACED``, y el tipo ``PROP`` del editor).
"""
import uuid

import pytest
from django.db import IntegrityError, connection, transaction

from apps.simulation.models import (
    CaseReview,
    CaseVersion,
    DecisionOption,
    MapObject,
    PublicationChecklist,
    Rubric,
    SimulationAttempt,
    SimulationNode,
    SimulationRubricAssignment,
)
from apps.users.models import CustomUser

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-08")]

TABLES = {
    "users", "access_requests", "grupos", "grupo_estudiante", "case_assignments",
    "student_case_completion", "simulation_cases", "case_versions", "simulation_nodes",
    "decision_options", "simulation_attempts_v2", "attempt_events", "reflection_journals",
    "attempt_world_states", "rubrics", "rubric_criteria", "rubric_evaluations",
    "criterion_scores", "simulation_rubric_assignments", "publication_checklists",
    "publication_checklist_items", "audit_logs", "scene_maps", "map_objects",
    "collision_zones", "dialogue_trees", "dialogue_lines", "dialogue_choices", "clinical_tools",
    "attempt_reports", "case_reviews", "case_characters", "scene_hints", "attempt_hint_views",
}

#: Vocabulario de objetos del mundo: los 6 del CHECK original más los que ofrece el editor.
MAP_OBJECT_TYPES = [
    "PERSON", "OBJECT", "ROUTE", "TOOL", "WARNING", "EXIT",
    "PROP", "TOOL_TARGET", "TRIGGER", "NOTE", "RESOURCE",
]

UNIQUE_COLUMNS = {
    "users": [("email",)],
    "grupos": [("codigo",)],
    "simulation_cases": [("code",)],
    "simulation_attempts_v2": [("attempt_token_hash",), ("student_id", "case_version_id")],  # el 2.º, parcial: solo abiertos
    "student_case_completion": [("student_id", "simulation_case_id")],
    "case_versions": [("simulation_case_id", "semantic_version")],
    "simulation_nodes": [("case_version_id", "node_key")],
    "decision_options": [("case_version_id", "option_key")],
    "reflection_journals": [("attempt_id", "node_id")],
    "attempt_events": [("attempt_id", "request_id")],
    "attempt_reports": [("attempt_id",)],
    "case_reviews": [("case_version_id",)],  # parcial: una sola revisión pendiente por versión
    # parciales: una asignación por (grupo, versión) y otra por (estudiante, versión)
    "case_assignments": [("grupo_id", "case_version_id"), ("estudiante_id", "case_version_id")],
    "rubric_evaluations": [("attempt_id", "rubric_id", "instructor_id")],
    "criterion_scores": [("rubric_evaluation_id", "rubric_criterion_id")],
    "publication_checklist_items": [("checklist_id", "code")],
    "scene_maps": [("case_version_id", "map_key"), ("node_id",)],
    "map_objects": [("scene_map_id", "object_key")],
    "collision_zones": [("scene_map_id", "zone_key")],
    "dialogue_trees": [("scene_map_id", "tree_key")],
    "dialogue_lines": [("dialogue_tree_id", "display_order")],
    "dialogue_choices": [("dialogue_tree_id", "choice_key")],
    "clinical_tools": [("case_version_id", "tool_code")],
    "case_characters": [("case_version_id", "character_key")],
    "attempt_hint_views": [("attempt_id", "hint_id")],
    "simulation_rubric_assignments": [("case_version_id",)],  # parcial: solo active = true
}

INDEXES = {
    "idx_attempts_student_status",
    "idx_attempt_events_att_time",
    "idx_case_versions_case_status",
    "idx_audit_logs_time",
    "idx_audit_logs_retention",
    "uq_active_case_version_rubric_assignment",
    "uq_attempts_open_per_student_case",
    "uq_case_reviews_one_pending",
    "idx_grupo_est_student_status",
    "idx_case_assign_group",
    "idx_case_assign_student",
    "idx_case_assign_version",
    "uq_case_assignments_group_version",
    "uq_case_assignments_student_version",
}

#: ON DELETE de cada FK de dominio (todas las demás de la lista son NO ACTION).
ON_DELETE = {
    ("attempt_events", "attempt_id"): "CASCADE",
    ("attempt_hint_views", "attempt_id"): "CASCADE",
    ("attempt_hint_views", "hint_id"): "CASCADE",
    ("attempt_reports", "attempt_id"): "CASCADE",
    ("attempt_world_states", "attempt_id"): "CASCADE",
    ("case_characters", "case_version_id"): "CASCADE",
    ("case_reviews", "case_version_id"): "CASCADE",
    ("case_versions", "last_edited_by"): "SET NULL",
    ("case_versions", "simulation_case_id"): "CASCADE",
    ("clinical_tools", "case_version_id"): "CASCADE",
    ("collision_zones", "scene_map_id"): "CASCADE",
    ("criterion_scores", "rubric_criterion_id"): "CASCADE",
    ("criterion_scores", "rubric_evaluation_id"): "CASCADE",
    ("decision_options", "case_version_id"): "CASCADE",
    ("decision_options", "source_node_id"): "CASCADE",
    ("decision_options", "target_node_id"): "CASCADE",
    ("dialogue_choices", "decision_option_id"): "SET NULL",
    ("dialogue_choices", "dialogue_tree_id"): "CASCADE",
    ("dialogue_lines", "dialogue_tree_id"): "CASCADE",
    ("dialogue_trees", "map_object_id"): "CASCADE",
    ("dialogue_trees", "scene_map_id"): "CASCADE",
    ("case_assignments", "assigned_by"): "SET NULL",
    ("case_assignments", "case_version_id"): "CASCADE",
    ("case_assignments", "estudiante_id"): "CASCADE",
    ("case_assignments", "grupo_id"): "CASCADE",
    ("grupo_estudiante", "estudiante_id"): "CASCADE",
    ("grupo_estudiante", "grupo_id"): "CASCADE",
    ("grupo_estudiante", "invited_by"): "SET NULL",
    ("map_objects", "character_id"): "SET NULL",
    ("map_objects", "decision_option_id"): "SET NULL",
    ("map_objects", "scene_map_id"): "CASCADE",
    ("publication_checklist_items", "checklist_id"): "CASCADE",
    ("publication_checklists", "case_version_id"): "CASCADE",
    ("reflection_journals", "attempt_id"): "CASCADE",
    ("simulation_attempts_v2", "replaced_by_id"): "SET NULL",
    ("rubric_criteria", "rubric_id"): "CASCADE",
    ("rubric_evaluations", "attempt_id"): "CASCADE",
    ("rubrics", "case_version_id"): "CASCADE",
    ("scene_hints", "scene_map_id"): "CASCADE",
    ("scene_maps", "case_version_id"): "CASCADE",
    ("scene_maps", "node_id"): "CASCADE",
    ("simulation_nodes", "case_version_id"): "CASCADE",
    ("simulation_rubric_assignments", "case_version_id"): "CASCADE",
}
NO_ACTION = {
    ("attempt_events", "decision_option_id"), ("attempt_events", "node_id"),
    ("attempt_world_states", "scene_map_id"), ("audit_logs", "actor_id"),
    ("case_reviews", "decided_by"), ("case_reviews", "requested_by"),
    ("case_versions", "cloned_from_id"), ("case_versions", "created_by"),
    ("grupos", "profesor_id"), ("publication_checklists", "submitted_by"),
    ("reflection_journals", "node_id"), ("rubric_evaluations", "instructor_id"),
    ("rubric_evaluations", "rubric_id"), ("rubrics", "created_by"),
    ("simulation_attempts_v2", "case_version_id"), ("simulation_attempts_v2", "current_node_id"),
    ("simulation_attempts_v2", "student_id"), ("simulation_cases", "created_by"),
    ("simulation_rubric_assignments", "assigned_by"), ("simulation_rubric_assignments", "rubric_id"),
}


def _admin():
    return CustomUser.objects.get(email="admin@psychosim.edu.co")


def _published_version():
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _users_role():
    CustomUser.objects.filter(pk=_admin().pk).update(role="ROOT")


def _case_versions_status():
    CaseVersion.objects.filter(pk=_published_version().pk).update(status="ZOMBIE")


def _decision_options_classification():
    DecisionOption.objects.filter(pk=DecisionOption.objects.first().pk).update(classification="MAYBE")


def _map_objects_object_type():
    MapObject.objects.filter(pk=MapObject.objects.first().pk).update(object_type="GHOST")


def _publication_checklists_status():
    PublicationChecklist.objects.create(
        case_version=_published_version(), submitted_by=_admin(), status="NOPE"
    )


def _grupo_estudiante_status():
    from apps.grupos.models import Grupo, GrupoEstudiante

    grupo = Grupo.objects.create(nombre="G", codigo="SCH-CK", profesor=_admin())
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=_admin(), status="TALVEZ")


def _case_assignments_target():
    from apps.grupos.models import CaseAssignment

    CaseAssignment.objects.create(case_version=_published_version())  # sin grupo ni estudiante


def _case_assignments_window():
    import datetime

    from apps.grupos.models import CaseAssignment, Grupo

    grupo = Grupo.objects.create(nombre="G", codigo="SCH-WIN", profesor=_admin())
    CaseAssignment.objects.create(
        grupo=grupo, case_version=_published_version(),
        opens_at=datetime.datetime(2026, 10, 20), closes_at=datetime.datetime(2026, 10, 19),
    )


def _case_review(**fields):
    CaseReview.objects.create(case_version=_published_version(), requested_by=_admin(), **fields)


def _case_reviews_decision():
    _case_review(decision="MAYBE")


def _case_reviews_reason():
    _case_review(decision="REJECTED", reason="OTRA", note="x")


def _case_reviews_rejection_has_reason():
    _case_review(decision="REJECTED", note="x")


def _attempt_with(**fields):
    version = _published_version()
    SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        case_version=version,
        student=_admin(),
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
        **fields,
    )


def _simulation_attempts_status():
    _attempt_with(status="LOST")


def _attempts_stress_range():
    _attempt_with(stress_index=101)


def _attempts_victim_risk_range():
    _attempt_with(victim_risk=-1)


def _attempts_user_trust_range():
    _attempt_with(user_trust=101)


CHECKS = {
    "users_role_check": _users_role,
    "case_versions_status_check": _case_versions_status,
    "decision_options_classification_check": _decision_options_classification,
    "map_objects_object_type_check": _map_objects_object_type,
    "publication_checklists_status_check": _publication_checklists_status,
    "simulation_attempts_v2_status_check": _simulation_attempts_status,
    "ck_attempts_stress_range": _attempts_stress_range,
    "ck_attempts_victim_risk_range": _attempts_victim_risk_range,
    "ck_attempts_user_trust_range": _attempts_user_trust_range,
    "grupo_estudiante_status_check": _grupo_estudiante_status,
    "case_assignments_target_check": _case_assignments_target,
    "case_assignments_window_check": _case_assignments_window,
    "case_reviews_decision_check": _case_reviews_decision,
    "case_reviews_reason_check": _case_reviews_reason,
    "case_reviews_rejection_has_reason_check": _case_reviews_rejection_has_reason,
}


def test_estan_las_29_tablas_de_dominio():
    assert TABLES <= set(connection.introspection.table_names())


@pytest.mark.parametrize("name", sorted(CHECKS))
def test_el_check_rechaza_un_valor_fuera_de_su_lista(name):
    with pytest.raises(IntegrityError, match=name):
        with transaction.atomic():
            CHECKS[name]()


@pytest.mark.parametrize("object_type", MAP_OBJECT_TYPES)
def test_los_objetos_del_mundo_admiten_el_vocabulario_del_editor(object_type):
    MapObject.objects.filter(pk=MapObject.objects.first().pk).update(object_type=object_type)

    assert MapObject.objects.get(pk=MapObject.objects.first().pk).object_type == object_type


@pytest.mark.parametrize("table", sorted(UNIQUE_COLUMNS))
def test_las_restricciones_unicas_estan_en_la_base(table):
    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(cursor, table)
    declared = {
        tuple(c["columns"]) for c in constraints.values() if c["unique"] and not c["primary_key"]
    }

    assert set(UNIQUE_COLUMNS[table]) <= declared, f"{table}: faltan {set(UNIQUE_COLUMNS[table]) - declared}"


def test_las_tablas_de_union_tienen_clave_primaria_compuesta():
    with connection.cursor() as cursor:
        for table, columns in {
            "grupo_estudiante": ["grupo_id", "estudiante_id"],
        }.items():
            constraints = connection.introspection.get_constraints(cursor, table)
            primary = [c["columns"] for c in constraints.values() if c["primary_key"]]
            assert primary == [columns], table


def test_los_indices_con_nombre_del_volcado_existen():
    with connection.cursor() as cursor:
        cursor.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
        present = {row[0] for row in cursor.fetchall()}

    assert INDEXES <= present, INDEXES - present


def test_una_version_solo_admite_una_revision_pendiente():
    version, admin = _published_version(), _admin()
    CaseReview.objects.create(case_version=version, requested_by=admin)

    with pytest.raises(IntegrityError, match="uq_case_reviews_one_pending"):
        with transaction.atomic():
            CaseReview.objects.create(case_version=version, requested_by=admin)

    CaseReview.objects.filter(case_version=version).update(decision="APPROVED")
    CaseReview.objects.create(case_version=version, requested_by=admin)


def test_una_version_solo_admite_una_rubrica_activa():
    version, admin = _published_version(), _admin()
    SimulationRubricAssignment.objects.filter(case_version=version).update(active=False)
    first = Rubric.objects.create(name="primera", created_by=admin)
    second = Rubric.objects.create(name="segunda", created_by=admin)
    SimulationRubricAssignment.objects.create(case_version=version, rubric=first, active=True)

    with pytest.raises(IntegrityError, match="uq_active_case_version_rubric_assignment"):
        with transaction.atomic():
            SimulationRubricAssignment.objects.create(case_version=version, rubric=second, active=True)

    SimulationRubricAssignment.objects.create(case_version=version, rubric=second, active=False)


def test_cada_fk_de_dominio_tiene_su_on_delete():
    codes = {"c": "CASCADE", "n": "SET NULL", "a": "NO ACTION", "r": "RESTRICT", "d": "SET DEFAULT"}
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.conrelid::regclass::text, a.attname, c.confdeltype
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
            """
        )
        found = {(table, column): codes[code] for table, column, code in cursor.fetchall() if table in TABLES}

    expected = {**ON_DELETE, **{key: "NO ACTION" for key in NO_ACTION}}
    assert found == expected
