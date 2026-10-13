"""E0-12 · El grafo de migraciones está sano (R2 del plan estructural).

Dos ramas en paralelo (visual y estructural, varias tareas) pueden crear cada una
su ``0005_*``: el grafo queda con dos hojas y ``migrate`` se niega. Esta prueba
lo detecta en local antes de fusionar, y ``makemigrations --check`` detecta un
modelo cambiado sin su migración.

OJO: hasta E0-8 ``pytest.ini`` corría con ``--nomigrations``, que sustituye
``MIGRATION_MODULES`` por un objeto que dice «sin migraciones» para toda app, y estas
dos comprobaciones pasaban en el vacío. Aunque ya no se use, cada prueba restaura
``MIGRATION_MODULES = {}``: quien vuelva a poner ``--nomigrations`` no las vacía.
"""
import pytest
from django.core.management import call_command
from django.db.migrations.graph import MigrationGraph
from django.db.migrations.loader import MigrationLoader

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-08")]


def leaf_conflicts(graph):
    """``{app: [hojas]}`` de las apps que tienen más de un nodo hoja."""
    leaves = {}
    for app, name in graph.leaf_nodes():
        leaves.setdefault(app, []).append(name)
    return {app: sorted(names) for app, names in leaves.items() if len(names) > 1}


def test_un_grafo_con_dos_hojas_se_detecta():
    graph = MigrationGraph()
    graph.add_node(("a", "0001_initial"), None)
    graph.add_node(("a", "0002_x"), None)
    graph.add_node(("a", "0002_y"), None)
    graph.add_dependency(None, ("a", "0002_x"), ("a", "0001_initial"))
    graph.add_dependency(None, ("a", "0002_y"), ("a", "0001_initial"))

    assert leaf_conflicts(graph) == {"a": ["0002_x", "0002_y"]}


def test_el_grafo_real_no_esta_vacio_y_tiene_una_hoja_por_app(settings):
    settings.MIGRATION_MODULES = {}  # por si algún día vuelve --nomigrations
    loader = MigrationLoader(None, ignore_no_migrations=True)

    apps_con_migraciones = {app for app, _ in loader.graph.leaf_nodes()}
    assert {"users", "grupos", "simulation", "progression"} <= apps_con_migraciones
    assert leaf_conflicts(loader.graph) == {}


def test_los_modelos_no_tienen_cambios_sin_migrar(settings):
    settings.MIGRATION_MODULES = {}  # por si algún día vuelve --nomigrations
    try:
        call_command("makemigrations", check=True, dry_run=True, verbosity=0)
    except SystemExit:
        pytest.fail(
            "Hay cambios de modelos sin su migración: corre makemigrations y revisa el resultado.",
            pytrace=False,
        )
