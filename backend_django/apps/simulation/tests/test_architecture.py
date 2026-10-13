"""E0-4 · Prueba de arquitectura con trinquete (RNF-07, TD-12, LS-6, LS-8, LS-13).

Las reglas viven en ``architecture_rules.py`` (lee el código con ``ast``, sin
importarlo). Aquí se prueba cada regla con código sintético (rojo → verde por
regla) y se aplica al código real contra ``architecture_baseline.json``.

El trinquete SOLO BAJA: el baseline lista las violaciones de hoy; una violación
nueva falla, y una entrada del baseline que ya no se viola también (hay que
borrarla), para que el archivo no se vuelva decorativo.
"""
import json
from pathlib import Path

import pytest

from .architecture_rules import BACKEND, check_architecture

pytestmark = pytest.mark.req("RNF-07")

BASELINE_FILE = Path(__file__).with_name("architecture_baseline.json")


def _tree(tmp_path, files):
    for rel, source in files.items():
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source, encoding="utf-8")
    return tmp_path


def _rules(tmp_path, files):
    return {v.rule for v in check_architecture(_tree(tmp_path, files))}


def test_casedef_no_importa_django(tmp_path):
    files = {"apps/simulation/casedef/model.py": "import django\nfrom apps.users.models import CustomUser\n"}
    assert "casedef-puro" in _rules(tmp_path, files)


def test_casedef_puede_importarse_a_si_mismo(tmp_path):
    files = {"apps/simulation/casedef/export.py": "from apps.simulation.casedef import model\nimport json\n"}
    assert check_architecture(_tree(tmp_path, files)) == []


def test_runtime_no_importa_authoring(tmp_path):
    files = {"apps/simulation/runtime/x.py": "from apps.simulation.services.authoring import graph\n"}
    assert "runtime-sin-authoring" in _rules(tmp_path, files)


def test_reportes_solo_lee(tmp_path):
    files = {"apps/reportes/services.py": "def f(x):\n    x.save()\n    Intento.objects.filter(a=1).update(b=2)\n"}
    found = check_architecture(_tree(tmp_path, files))
    assert {v.detail for v in found} == {"escribe con .save(", "escribe con .update("}


def test_reportes_permite_update_de_un_set(tmp_path):
    files = {"apps/reportes/services.py": "def f(ids, more):\n    ids.update(more)\n"}
    assert check_architecture(_tree(tmp_path, files)) == []


def test_policies_no_importa_servicios(tmp_path):
    files = {"shared/policies.py": "from apps.simulation.services import game_service\n"}
    assert "policies-sin-servicios" in _rules(tmp_path, files)


def test_dto_no_importa_servicios(tmp_path):
    files = {"apps/simulation/serializers/game_dtos.py": "from apps.simulation.services import case_effects\n"}
    assert "dto-sin-servicios" in _rules(tmp_path, files)


@pytest.mark.parametrize(
    "call",
    [
        'cursor.execute(f"SELECT {x}")',
        'cursor.execute("SELECT %s" % x)',
        'cursor.execute("SELECT " + x)',
        'cursor.execute("SELECT {}".format(x))',
        'Modelo.objects.raw("SELECT 1")',
        'Modelo.objects.extra(where=["1=1"])',
    ],
)
def test_sql_no_se_interpola(tmp_path, call):
    files = {"apps/x/services.py": f"def f(cursor, x):\n    {call}\n"}
    assert "sql-sin-interpolacion" in _rules(tmp_path, files)


def test_sql_parametrizado_es_valido(tmp_path):
    files = {"apps/x/services.py": 'def f(cursor, x):\n    cursor.execute("SELECT %s", [x])\n'}
    assert check_architecture(_tree(tmp_path, files)) == []


def test_serializers_sin_all_ni_exclude(tmp_path):
    files = {"apps/x/serializers.py": 'class S:\n    class Meta:\n        fields = "__all__"\n        exclude = ["a"]\n'}
    assert {v.detail for v in check_architecture(_tree(tmp_path, files))} == {
        'usa fields = "__all__"',
        "usa exclude",
    }


def test_allowany_solo_en_las_vistas_publicas(tmp_path):
    files = {
        "apps/users/views.py": "class LoginView:\n    permission_classes = [AllowAny]\n"
        "class MeView:\n    permission_classes = [AllowAny]\n",
    }
    found = check_architecture(_tree(tmp_path, files))
    assert [v.detail for v in found] == ["MeView declara AllowAny"]


def test_el_codigo_real_respeta_las_fronteras_con_trinquete():
    current: dict[str, set[str]] = {}
    for v in check_architecture(BACKEND):
        current.setdefault(v.rule, set()).add(v.key)
    baseline = {rule: set(keys) for rule, keys in json.loads(BASELINE_FILE.read_text(encoding="utf-8")).items()}

    new = {rule: sorted(keys - baseline.get(rule, set())) for rule, keys in current.items()}
    stale = {rule: sorted(keys - current.get(rule, set())) for rule, keys in baseline.items()}
    new = {rule: keys for rule, keys in new.items() if keys}
    stale = {rule: keys for rule, keys in stale.items() if keys}

    assert not new, f"Violaciones NUEVAS de arquitectura (el trinquete solo baja): {json.dumps(new, indent=2)}"
    assert not stale, (
        "El baseline lista violaciones que ya no existen; bórralas de "
        f"architecture_baseline.json (el trinquete solo baja): {json.dumps(stale, indent=2)}"
    )
