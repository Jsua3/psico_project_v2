"""Los NPC ambientales del caso sembrado traen su geometría (GAME-01).

``record_npc_interaction`` exige la geometría de cada NPC ambiental en
``scene_maps.ambient_json["ambientNpcs"]``. Antes un volcado de despliegue sin ella
hacía que hablar con el NPC respondiera 400; ahora la base la construye ``migrate``
y la siembra ``seed_caso_pdf``, y estas pruebas fijan que llegue.
"""
import json
from pathlib import Path

import pytest

from apps.simulation.models import SceneMap

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401
from .test_world_authority import _move, _world

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-17")]

#: La semilla es un documento (E4-6): sus mapas son ``x-siep.escenas[].mapa``.
DOCUMENT = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"
SEED_AMBIENT = {
    entry["mapa"]["clave"]: entry["mapa"]["ambiente"]
    for entry in json.loads(DOCUMENT.read_text(encoding="utf-8"))["x-siep"]["escenas"]
    if entry.get("mapa")
}
NPC_KEYS = ("ambientNpcs", "ambientNpcKeys")


@pytest.mark.parametrize("map_key", sorted(SEED_AMBIENT))
def test_el_caso_sembrado_trae_la_geometria_de_npcs(map_key, case_version_id):
    scene_map = SceneMap.objects.get(case_version_id=case_version_id, map_key=map_key)
    ambient = json.loads(scene_map.ambient_json)

    for key in NPC_KEYS:
        assert ambient.get(key) == SEED_AMBIENT[map_key][key], f"{map_key}.{key}"


def test_se_puede_hablar_con_un_npc_ambiental_del_caso_sembrado(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    assert _move(c, attempt_id, token, 560, 380, world["map"]["key"]).status_code == 200

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
        {"attemptToken": token},
        format="json",
    )

    assert resp.status_code == 200
    assert "enfermera-urgencias" in resp.data["data"]["flags"]["viewedNpcKeys"]
