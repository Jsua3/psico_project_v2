"""E5-2 · Caché del mundo publicado (DJA-8, RNF-05).

La parte estática de un mapa (sala, objetos con sus árboles de diálogo, zonas de
colisión y herramientas clínicas) se cachea cuando la versión del caso es
``PUBLISHED`` y tiene ``published_at``: su clave ``(map_id, published_at)`` es
inmutable (C7), así que nunca sirve datos viejos entre procesos ni requiere
invalidación manual. Un borrador (``DRAFT``) o una versión en revisión
(``IN_REVIEW``) jamás se cachea.
"""
import multiprocessing
from datetime import datetime

import pytest
from django.utils import timezone

from apps.simulation.models import CaseVersion, MapObject, SceneMap, SimulationNode
from apps.simulation.services import world_service
from shared import cache as shared_cache
from shared.testing import measure

from .test_world import _start, attempt_headers, case_version_id, cl, estudiante  # noqa: F401

pytestmark = pytest.mark.req("RNF-05")


@pytest.fixture(autouse=True)
def _clean_cache():
    shared_cache.clear()
    yield
    shared_cache.clear()


def test_published_world_caches_static_part_after_first_load(estudiante, case_version_id):
    Version = CaseVersion.objects.filter(pk=case_version_id)
    if Version.first().published_at is None:
        Version.update(published_at=datetime(2026, 10, 1, 12, 0, 0))
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    url = f"/api/simulation/attempts/{attempt_id}/world"

    first_resp, first_cost = measure(lambda: c.get(url, **attempt_headers(token)))
    second_resp, second_cost = measure(lambda: c.get(url, **attempt_headers(token)))

    assert first_resp.status_code == 200
    assert second_resp.status_code == 200
    assert first_resp.data["data"] == second_resp.data["data"]
    # La primera llena el caché (9 consultas); la segunda no relee objetos, diálogos, colisiones ni herramientas (3 consultas).
    # Bloque A: +1 en cada una, las opciones de la escena (``decisionOptions``): son filas por intento y requisito, no
    # parte estática del mundo, así que no entran al caché.
    assert first_cost.queries == 9
    assert second_cost.queries == 3


def test_draft_version_is_never_cached(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    # Si la versión está en DRAFT, el mundo nunca se guarda en el caché.
    CaseVersion.objects.filter(pk=case_version_id).update(status="DRAFT")
    url = f"/api/simulation/attempts/{attempt_id}/world"

    _, first_cost = measure(lambda: c.get(url, **attempt_headers(token)))
    scene_map = SceneMap.objects.filter(case_version_id=case_version_id).first()
    MapObject.objects.filter(scene_map_id=scene_map.id, object_key="familia-crisis").update(
        label="Familia editada en borrador"
    )
    second_resp, second_cost = measure(lambda: c.get(url, **attempt_headers(token)))

    assert first_cost.queries == 9  # las 8 de siempre + las opciones de la escena (bloque A)
    assert second_cost.queries == 9
    labels = {o["key"]: o["label"] for o in second_resp.data["data"]["objects"]}
    assert labels["familia-crisis"] == "Familia editada en borrador"


def test_cache_key_is_deterministic_across_two_processes_and_changes_on_new_publication():
    import subprocess
    import sys

    script = (
        "import sys; "
        "from datetime import datetime; "
        "from types import SimpleNamespace; "
        "from shared.cache import static_world_key; "
        "v = SimpleNamespace(status='PUBLISHED', published_at=datetime.fromisoformat(sys.argv[1])); "
        "print(static_world_key(int(sys.argv[2]), v))"
    )
    cmd = [sys.executable, "-c", script]
    p1 = subprocess.run([*cmd, "2026-10-17T10:00:00", "42"], capture_output=True, text=True, check=True)
    p2 = subprocess.run([*cmd, "2026-10-17T10:00:00", "42"], capture_output=True, text=True, check=True)
    p3 = subprocess.run([*cmd, "2026-10-17T11:30:00", "42"], capture_output=True, text=True, check=True)

    k1_proc_a = p1.stdout.strip()
    k1_proc_b = p2.stdout.strip()
    k2_proc_a = p3.stdout.strip()
    assert k1_proc_a == k1_proc_b == "siep:world:static:42:2026-10-17T10:00:00"
    assert k2_proc_a != k1_proc_a


