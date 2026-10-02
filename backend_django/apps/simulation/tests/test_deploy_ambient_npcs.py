"""Contrato despliegue ↔ autoridad espacial de NPCs (GAME-01).

record_npc_interaction exige la geometría de cada NPC ambiental en
``scene_maps.ambient_json["ambientNpcs"]``. seed_caso_pdf la siembra, pero el
volcado ``deploy/db_seed.sql`` (lo que se restaura en producción) no la tenía:
hablar con cualquier NPC ambiental del caso publicado respondía 400 y el
diálogo nunca se abría. La BD de pruebas se siembra con seed_caso_pdf, así que
sin estas pruebas el fallo solo aparecía en producción.
"""
import json
import re
from pathlib import Path

import pytest
from django.db import connection

from apps.simulation.management.commands.seed_caso_pdf import MAPS
from apps.simulation.models import SceneMap

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401
from .test_world_authority import _move, _world

ROOT = Path(__file__).resolve().parents[4]
DB_SEED = ROOT / "deploy" / "db_seed.sql"
UPGRADE = ROOT / "deploy" / "upgrades" / "2026-10-01-ambient-npcs-caso-pdf.sql"

SEED_AMBIENT = {scene["key"]: scene["ambient"] for scene in MAPS}
NPC_KEYS = ("ambientNpcs", "ambientNpcKeys")

_COPY_ESCAPES = {"t": "\t", "n": "\n", "r": "\r", "\\": "\\"}


def _copy_unescape(field):
    """Decodifica un campo del formato de texto de COPY (\\\\ → \\, \\t → tab…)."""
    return re.sub(r"\\(.)", lambda m: _COPY_ESCAPES.get(m.group(1), m.group(1)), field)


def _dumped_scene_map_ambient():
    sql = DB_SEED.read_text(encoding="utf-8")
    header = re.search(r"^COPY public\.scene_maps \(([^)]*)\) FROM stdin;\n", sql, re.MULTILINE)
    assert header, f"No se encontró el COPY de scene_maps en {DB_SEED}"
    columns = [column.strip() for column in header.group(1).split(",")]
    body = sql[header.end():sql.index("\n\\.\n", header.end())]
    ambient = {}
    for line in body.splitlines():
        row = dict(zip(columns, line.split("\t")))
        ambient[row["map_key"]] = json.loads(_copy_unescape(row["ambient_json"]))
    return ambient


@pytest.mark.parametrize("map_key", sorted(SEED_AMBIENT))
def test_volcado_trae_la_geometria_de_npcs_del_seed(map_key):
    dumped = _dumped_scene_map_ambient()

    assert map_key in dumped, f"{map_key} no está en deploy/db_seed.sql"
    for key in NPC_KEYS:
        assert dumped[map_key].get(key) == SEED_AMBIENT[map_key][key], (
            f"{map_key}.{key} de deploy/db_seed.sql no coincide con seed_caso_pdf; "
            "actualiza el volcado y deploy/upgrades/."
        )


def _restore_legacy_ambient(case_version_id):
    """Deja los mapas del caso como en un volcado anterior: sin geometría de NPCs."""
    for scene_map in SceneMap.objects.filter(case_version_id=case_version_id):
        ambient = json.loads(scene_map.ambient_json)
        for key in NPC_KEYS:
            ambient.pop(key, None)
        scene_map.ambient_json = json.dumps(ambient)
        scene_map.save(update_fields=["ambient_json"])


def _apply_upgrade():
    with connection.cursor() as cursor:
        cursor.execute(UPGRADE.read_text(encoding="utf-8"))


def _talk_to_nurse(client, attempt_id, token):
    return client.post(
        f"/api/simulation/attempts/{attempt_id}/npcs/enfermera-urgencias",
        {"attemptToken": token}, format="json",
    )


def test_upgrade_devuelve_los_npcs_a_una_bd_restaurada(estudiante, case_version_id):
    _restore_legacy_ambient(case_version_id)
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    assert _move(c, attempt_id, token, 560, 380, world["map"]["key"]).status_code == 200
    assert _talk_to_nurse(c, attempt_id, token).status_code == 400  # el fallo de producción

    _apply_upgrade()
    _apply_upgrade()  # idempotente

    resp = _talk_to_nurse(c, attempt_id, token)
    assert resp.status_code == 200
    assert "enfermera-urgencias" in resp.data["data"]["flags"]["viewedNpcKeys"]
    for scene_map in SceneMap.objects.filter(case_version_id=case_version_id):
        ambient = json.loads(scene_map.ambient_json)
        expected = SEED_AMBIENT[scene_map.map_key]
        assert ambient == expected, f"{scene_map.map_key} quedó distinto del seed"
