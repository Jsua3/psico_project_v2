"""
Tests estructurales para comisaria-sala-espera.json.
Ejecutar: python tools/map-generator/test_generated_map.py
(También compatible con pytest si está instalado.)
"""
import json
import sys
from pathlib import Path

MAP_PATH = Path("frontend/src/assets/game/maps/comisaria-sala-espera.json")
MAP_W, MAP_H = 60, 33


def _load():
    if not MAP_PATH.exists():
        raise AssertionError(f"Archivo no encontrado: {MAP_PATH}")
    return json.loads(MAP_PATH.read_text(encoding="utf-8"))


def _layer(data, name):
    return next((l for l in data["layers"] if l["name"] == name), None)


def test_map_file_exists():
    assert MAP_PATH.exists(), f"Archivo no encontrado: {MAP_PATH}"


def test_dimensions_60x33():
    d = _load()
    assert d["width"] == MAP_W and d["height"] == MAP_H, \
        f"Esperado {MAP_W}×{MAP_H}, obtenido {d['width']}×{d['height']}"


def test_required_2_5d_layers_present():
    names = {l["name"] for l in _load()["layers"]}
    for req in ("floor", "walls", "props_back", "props_front", "lighting", "overlay", "Objects"):
        assert req in names, f"Capa requerida ausente: {req}"


def test_floor_has_tiles():
    layer = _layer(_load(), "floor")
    assert layer is not None, "Capa floor no encontrada"
    nonzero = sum(1 for g in layer["data"] if g != 0)
    assert nonzero > 1000, f"floor tiene {nonzero} tiles — esperado > 1000"


def test_props_back_has_furniture():
    layer = _layer(_load(), "props_back")
    assert layer is not None, "Capa props_back no encontrada"
    nonzero = sum(1 for g in layer["data"] if g != 0)
    assert nonzero > 0, "props_back está vacío — sin mobiliario"


def test_props_front_has_counter():
    layer = _layer(_load(), "props_front")
    assert layer is not None, "Capa props_front no encontrada"
    nonzero = sum(1 for g in layer["data"] if g != 0)
    # rows 19-21 × cols 8-36 = ~63 tiles (brazo L + superficie + frente)
    assert nonzero >= 58, f"props_front tiene {nonzero} tiles — esperado ≥ 58 (mostrador rows 19-21, cols 8-36)"


def test_objects_layer_preserved():
    obj_layer = _layer(_load(), "Objects")
    assert obj_layer is not None, "Capa Objects no encontrada"
    names = {o["name"] for o in obj_layer["objects"]}
    for expected in ("EXIT_to_entrevista", "familiar-comisaria", "colega-comisaria"):
        assert expected in names, f"Objeto faltante: {expected}"


def test_tilesets_include_both():
    ts_names = {t["name"] for t in _load()["tilesets"]}
    assert "tiny-dungeon" in ts_names, "tiny-dungeon ausente de tilesets"
    assert "rpg-urban" in ts_names, "rpg-urban ausente de tilesets"


def test_rpg_urban_firstgid_is_133():
    tilesets = _load()["tilesets"]
    ru = next((t for t in tilesets if t["name"] == "rpg-urban"), None)
    assert ru is not None, "tileset rpg-urban no encontrado"
    assert ru["firstgid"] == 133, f"rpg-urban firstgid={ru['firstgid']}, esperado 133"


def test_walls_border_top_row_closed():
    layer = _layer(_load(), "walls")
    assert layer is not None, "Capa walls no encontrada"
    top_row = layer["data"][:MAP_W]
    assert all(g != 0 for g in top_row), "Fila norte de paredes tiene celdas vacías"


def test_walls_border_bottom_row_closed():
    layer = _layer(_load(), "walls")
    assert layer is not None, "Capa walls no encontrada"
    bot_row = layer["data"][(MAP_H - 1) * MAP_W:]
    assert all(g != 0 for g in bot_row), "Fila sur de paredes tiene celdas vacías"


def test_door_gap_on_right_wall_rows_14_to_16():
    """El hueco de la puerta (EXIT_to_entrevista, col 59, filas 14-16) debe ser GID 0."""
    layer = _layer(_load(), "walls")
    assert layer is not None, "Capa walls no encontrada"
    for r in (14, 15, 16):
        idx = r * MAP_W + (MAP_W - 1)  # col 59
        assert layer["data"][idx] == 0, f"Fila {r} col 59 debería ser 0 (hueco de puerta), es {layer['data'][idx]}"


# ── Runner autónomo ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = sorted((n, f) for n, f in globals().items() if n.startswith("test_"))
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as e:
            print(f"FAIL  {name}: {e}")
            failed += 1
    status = "Todos los tests pasaron" if not failed else f"{failed} test(s) fallaron"
    print(f"\n{status}")
    sys.exit(failed)
