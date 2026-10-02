import json
from pathlib import Path

from apps.simulation.management.commands.seed_caso_pdf import MAPS, MAP_OBJECTS


REPO_ROOT = Path(__file__).resolve().parents[4]
VISUAL_INVENTORY_PATH = (
    REPO_ROOT / "frontend" / "src" / "assets" / "visual" / "v1" / "inventory.v1.json"
)
CLINICAL_EMOTION_MAP_PATH = (
    REPO_ROOT
    / "frontend"
    / "src"
    / "assets"
    / "characters"
    / "v1"
    / "clinical-emotion-map.v1.json"
)

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
EXPECTED_CLINICAL_EMOTION_MAP = {
    "neutral": "neutral",
    "positive": "relieved",
    "negative": "concerned",
    "anxious": "concerned",
    "danger": "concerned",
    "sad": "concerned",
    "worried": "concerned",
    "concerned": "concerned",
    "relieved": "relieved",
    "receptive": "relief",
    "calm": "steady",
    "closed": "rupture",
}
EXPECTED_OBJECT_TYPES = {"PERSON", "OBJECT", "TOOL", "EXIT"}
TREE_PROJECTION_EMOTIONS = {"neutral", "positive", "concerned", "danger"}
FUTURE_CONSEQUENCE_EMOTIONS = {"receptive", "calm", "worried", "closed"}


def _read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def _seeded_line_emotions() -> set[str]:
    emotions: set[str] = set()
    for objects in MAP_OBJECTS.values():
        for map_object in objects:
            dialogue = map_object.get("dialogue")
            if dialogue is None:
                continue
            _speaker, lines = dialogue
            emotions.update(emotion for _text, emotion in lines)
    return emotions


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


def test_clinical_emotion_authority_covers_seeded_tree_and_future_consequences_exactly():
    clinical_map = _read_json(CLINICAL_EMOTION_MAP_PATH)
    expected_emotions = (
        _seeded_line_emotions()
        | TREE_PROJECTION_EMOTIONS
        | FUTURE_CONSEQUENCE_EMOTIONS
    )

    assert clinical_map["schemaVersion"] == 1
    assert clinical_map["mappings"] == EXPECTED_CLINICAL_EMOTION_MAP
    assert set(EXPECTED_CLINICAL_EMOTION_MAP) == expected_emotions
