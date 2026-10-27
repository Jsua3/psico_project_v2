"""Modelo de respuesta · La migración 0031 (contracción) sobre filas con la forma antigua.

Como en ``test_system_evaluation_migration``, el ejecutor de migraciones corre sobre la base de la propia prueba (el DDL
de PostgreSQL es transaccional): se retrocede a la 0030 con la tabla vacía, se escriben filas con las columnas
antiguas (una opción SIN clase, cada una con lo que decía su clasificación, su severidad y su conducta prohibida) y se
vuelve a avanzar. La 0031 no tiene reversa de datos: retroceder devuelve las columnas con su valor por defecto (las opciones que ya
existían, como las del caso sembrado, quedan con ``classification = ADEQUATE``), pero no falla por tener filas.
"""
import json
from importlib import import_module
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.simulation.models import DecisionOption

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-08"), pytest.mark.req("RN-08")]

User = get_user_model()
migration = import_module("apps.simulation.migrations.0031_drop_legacy_metrics")
BEFORE = [("simulation", "0030_metrics_model_data")]
ATTEMPT_COLUMNS = {
    "accumulated_score", "stress_index", "victim_risk", "user_trust", "institutional_route_activated",
    "revictimization_risk",
}
EVENT_COLUMNS = {"score_delta", "stress_delta"}
OPTION_COLUMNS = {"classification", "score_delta", "stress_delta", "prohibited_penalty", "prohibited_conduct"}
DROPPED_CHECKS = {
    "ck_attempts_stress_range", "ck_attempts_victim_risk_range", "ck_attempts_user_trust_range",
    "decision_options_classification_check",
}


def _migrate(targets):
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    return MigrationExecutor(connection)  # el grafo y el estado ya recargados


def _latest():
    """Las hojas de ``simulation`` de HOY: la prueba no fija cuál es la última migración (otra rama puede añadir más)."""
    return list(MigrationExecutor(connection).loader.graph.leaf_nodes("simulation"))


def _immediate():
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # sin eventos de FK pendientes antes del DDL


def _columns(table):
    with connection.cursor() as cursor:
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", [table])
        return {name for (name,) in cursor.fetchall()}


def _is_nullable(table, column):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
            [table, column],
        )
        return cursor.fetchone()[0] == "YES"


def _constraints(table):
    with connection.cursor() as cursor:
        cursor.execute("SELECT conname FROM pg_constraint WHERE conrelid = %s::regclass", [table])
        return {name for (name,) in cursor.fetchall()}


@pytest.fixture
def before():
    """El esquema en la 0030 y las filas de la forma antigua: una opción por cada ruta de la conversión."""
    user = User.objects.create_user(email="mig0031@x.com", password="x", nombre="N", apellido="A", role="ADMIN")
    _immediate()
    state = _migrate(BEFORE).loader.project_state(BEFORE).apps
    Case, Version, Node = (state.get_model("simulation", name) for name in ("SimulationCase", "CaseVersion", "SimulationNode"))
    Option, Attempt, Event = (state.get_model("simulation", name) for name in ("DecisionOption", "SimulationAttempt", "AttemptEvent"))
    case = Case.objects.create(code="CASO-0031", title="Caso", created_by_id=user.pk)
    version = Version.objects.create(simulation_case=case, semantic_version="1.0", created_by_id=user.pk)
    start = Node.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="n", start_node=True)
    end = Node.objects.create(case_version=version, node_key="fin", title="Fin", narrative="n", terminal_node=True)

    def option(key, classification, response_class=None, prohibited=False, effects=None):
        return Option.objects.create(
            case_version=version, source_node=start, target_node=end, option_key=key, text=key,
            classification=classification, response_class=response_class, prohibited_conduct=prohibited,
            score_delta=7, stress_delta=-3, prohibited_penalty=-5, effects=json.dumps(effects or {}),
        )

    options = {
        "adecuada": option("adecuada", "ADEQUATE"),
        "riesgosa": option("riesgosa", "RISKY"),
        "inadecuada": option("inadecuada", "INADEQUATE"),
        "prohibida": option("prohibida", "ADEQUATE", prohibited=True),
        "aceptable": option("aceptable", "RISKY", effects={"severity": "acceptable"}),
        "critica": option("critica", "ADEQUATE", effects={"severity": "critical"}),
        "ya_tiene": option("ya_tiene", "INADEQUATE", response_class="RECOMMENDED"),
        "rota": option("rota", "ADEQUATE", effects=None),
    }
    Option.objects.filter(pk=options["rota"].pk).update(effects="no es json")
    attempt = Attempt.objects.create(
        attempt_token_hash="hash-0031", case_version=version, student_id=user.pk, current_node=start,
        accumulated_score=40, stress_index=30, victim_risk=60, user_trust=20,
    )
    Event.objects.create(attempt=attempt, event_type="DECISION_SELECTED", node=start, decision_option=options["adecuada"],
                         score_delta=5, stress_delta=2)
    _immediate()
    assert ATTEMPT_COLUMNS <= _columns("simulation_attempts_v2")
    assert options["adecuada"].response_class is None
    return SimpleNamespace(ids={key: row.pk for key, row in options.items()}, attempt_id=attempt.pk, state=state)


def test_la_clase_vacia_se_rellena_con_lo_que_decian_las_columnas_antiguas(before):
    _migrate(_latest())

    by_key = {key: DecisionOption.objects.get(pk=pk).response_class for key, pk in before.ids.items()}
    assert by_key == {
        "adecuada": "RECOMMENDED",
        "riesgosa": "RISKY",
        "inadecuada": "CONTRAINDICATED",
        "prohibida": "CONTRAINDICATED",  # conducta prohibida
        "aceptable": "ACCEPTABLE",  # la severidad manda sobre la clasificación
        "critica": "CONTRAINDICATED",  # severidad crítica
        "ya_tiene": "RECOMMENDED",  # la que ya traía no se toca
        "rota": "RECOMMENDED",  # unos effects ilegibles no rompen la migración
    }


def test_se_retiran_las_columnas_y_los_check_y_la_clase_pasa_a_not_null(before):
    _migrate(_latest())

    assert not ATTEMPT_COLUMNS & _columns("simulation_attempts_v2")
    assert not EVENT_COLUMNS & _columns("attempt_events")
    assert not OPTION_COLUMNS & _columns("decision_options")
    assert not DROPPED_CHECKS & (_constraints("simulation_attempts_v2") | _constraints("decision_options"))
    assert not _is_nullable("decision_options", "response_class")
    assert "decision_options_response_class_check" in _constraints("decision_options")  # su CHECK se conserva


def test_el_resto_de_las_columnas_y_las_filas_del_intento_siguen_donde_estaban(before):
    attempt_id = before.attempt_id

    _migrate(_latest())

    with connection.cursor() as cursor:
        cursor.execute("SELECT status, attempt_token_hash FROM simulation_attempts_v2 WHERE id = %s", [attempt_id])
        assert cursor.fetchone() == ("IN_PROGRESS", "hash-0031")
        cursor.execute("SELECT event_type FROM attempt_events WHERE attempt_id = %s", [attempt_id])
        assert cursor.fetchall() == [("DECISION_SELECTED",)]


def test_se_puede_retroceder_con_filas_y_las_opciones_vuelven_con_la_clasificacion_por_defecto():
    """Sin la prueba ``before``: el caso sembrado ya tiene sus opciones y la reversa no falla por ello."""
    seeded = DecisionOption.objects.count()
    assert seeded
    _immediate()

    state = _migrate(BEFORE).loader.project_state(BEFORE).apps

    Option = state.get_model("simulation", "DecisionOption")
    assert set(Option.objects.values_list("classification", flat=True)) == {"ADEQUATE"}
    assert Option.objects.count() == seeded
    _immediate()
    _migrate(_latest())
    assert DecisionOption.objects.count() == seeded
    assert not OPTION_COLUMNS & _columns("decision_options")


def test_el_relleno_es_idempotente(before):
    """Corre la función de datos dos veces sobre el estado de la 0030: la segunda no cambia ninguna fila."""
    Option = before.state.get_model("simulation", "DecisionOption")

    migration.fill_response_class(before.state, None)
    first = dict(Option.objects.values_list("pk", "response_class"))
    migration.fill_response_class(before.state, None)

    assert dict(Option.objects.values_list("pk", "response_class")) == first
    assert None not in first.values()
