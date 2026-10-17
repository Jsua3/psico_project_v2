import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
#: La semilla es un documento (E4-6): sus mapas son ``x-siep.escenas[].mapa``.
SEED_DOCUMENT = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"
VISUAL_INVENTORY_PATH = (
    REPO_ROOT / "frontend" / "src" / "assets" / "visual" / "v1" / "inventory.v1.json"
)
KIT_PATH = REPO_ROOT / "frontend" / "src" / "assets" / "characters" / "kit" / "kit.json"
PORTRAIT_STATES = {"neutral", "alegre", "preocupada", "triste"}

EXPECTED_MAP_BINDINGS = {
    "hospital-urgencias": "hospital-urgencias",
    "hospital-sala-escucha": "hospital-sala-escucha",
    "hospital-sala-accion": "hospital-sala-escucha",
    "hospital-sala-cierre": "hospital-sala-escucha",
    "comisaria-recepcion": "comisaria-recepcion",
    "comisaria-consultorio": "comisaria-consultorio",
    "comisaria-marco": "comisaria-consultorio",
    "comisaria-cierre": "comisaria-consultorio",
}
EXPECTED_BACKEND_MAP_BINDINGS = {
    "hospital-urgencias": "hospital-urgencias",
    "hospital-sala-escucha": "hospital-sala-escucha",
    "hospital-sala-accion": "hospital-sala-escucha-accion",
    "hospital-sala-cierre": "hospital-sala-escucha-cierre",
    "comisaria-recepcion": "comisaria-recepcion",
    "comisaria-consultorio": "comisaria-consultorio",
    "comisaria-marco": "comisaria-consultorio-marco",
    "comisaria-cierre": "comisaria-consultorio-cierre",
}
EXPECTED_OBJECT_TYPES = {"PERSON", "OBJECT", "TOOL", "EXIT"}
TREE_PROJECTION_EMOTIONS = {"neutral", "positive", "concerned", "danger"}
FUTURE_CONSEQUENCE_EMOTIONS = {"receptive", "calm", "worried", "closed"}


def _read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def _seeded_maps() -> list[dict]:
    return [
        entry["mapa"] for entry in _read_json(SEED_DOCUMENT)["x-siep"]["escenas"] if entry.get("mapa")
    ]


MAPS = [{"key": scene_map["clave"]} for scene_map in _seeded_maps()]
MAP_OBJECTS = {
    scene_map["clave"]: [{"type": map_object["tipo"]} for map_object in scene_map["objetos"]]
    for scene_map in _seeded_maps()
}


def _seeded_line_emotions() -> set[str]:
    return {
        line["emocion"]
        for scene_map in _seeded_maps()
        for tree in scene_map["dialogos"]
        for line in tree["lineas"]
    }


def test_visual_inventory_tracks_all_seeded_backend_maps_and_exact_bindings():
    inventory = _read_json(VISUAL_INVENTORY_PATH)
    seeded_map_keys = {entry["key"] for entry in MAPS}
    inventory_backend_bindings = {
        entry["mapKey"]: entry["backendMapKey"] for entry in inventory["maps"]
    }

    assert len(MAPS) == 8
    assert len(inventory["maps"]) == 8
    assert set(MAP_OBJECTS) == seeded_map_keys
    assert inventory_backend_bindings == EXPECTED_BACKEND_MAP_BINDINGS
    assert set(inventory_backend_bindings.values()) == seeded_map_keys
    assert inventory["mapBindings"] == EXPECTED_MAP_BINDINGS


def test_seeded_map_objects_use_only_the_four_inventory_categories():
    actual_types = {
        map_object["type"]
        for objects in MAP_OBJECTS.values()
        for map_object in objects
    }

    assert actual_types == EXPECTED_OBJECT_TYPES


def test_every_emotion_the_backend_can_emit_has_a_portrait_in_the_kit():
    projection = _read_json(KIT_PATH)["catalog"]["emotionToPortrait"]
    expected_emotions = (
        _seeded_line_emotions()
        | TREE_PROJECTION_EMOTIONS
        | FUTURE_CONSEQUENCE_EMOTIONS
    )

    assert expected_emotions - set(projection) == set()
    assert set(projection.values()) <= PORTRAIT_STATES
