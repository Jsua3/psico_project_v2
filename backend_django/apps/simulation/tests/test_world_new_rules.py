"""E4-2b · Tres reglas nuevas del mundo (R21): ``OPTION_WITHOUT_TRIGGER``, ``REQUIRES_UNKNOWN`` y
``DOOR_TARGET_MISSING``.

Antes la compuerta de publicación veía nodos, decisiones, geometría, salida y límites, pero no los
diálogos: un caso con una sala mínima y una salida segura se podía publicar y no se podía jugar (taller,
fase 3 §7.3 punto 16). Pruebas sobre la función pura (no tocan la base de datos); el snapshot que no trae
``choices`` o ``tools`` (el formato de antes) no evalúa estas reglas.
"""
import pytest

from apps.simulation.services import validation_issues, world_validation

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RN-05"), pytest.mark.req("RF-17")]


def _snapshot(**changes):
    base = {
        "nodes": [
            {"id": 1, "key": "inicio", "startNode": True, "terminalNode": False, "x": 0, "y": 0},
            {"id": 2, "key": "cierre", "startNode": False, "terminalNode": True, "x": 0, "y": 0},
        ],
        "decisions": [
            {"id": 10, "sourceNodeId": 1, "targetNodeId": 2, "prohibitedConduct": False, "prohibitionReason": None,
             "feedbackText": "Explicación."},
        ],
        "maps": [
            {"id": 100, "nodeId": 1, "width": 960, "height": 540, "spawnX": 10, "spawnY": 10},
            {"id": 101, "nodeId": 2, "width": 960, "height": 540, "spawnX": 10, "spawnY": 10},
        ],
        "objects": [],
        "collisions": [],
        "dialogues": [],
        "choices": [{"id": 1000, "mapId": 100, "optionId": 10, "requiredTool": None}],
        "tools": [{"code": "PAP"}],
        "hasSafeExit": True,
    }
    base.update(changes)
    return base


def _door(id_, key="puerta", meta=None, kind="EXIT", **extra):
    return {"id": id_, "mapId": 100, "key": key, "x": 10, "y": 10, "width": 36, "height": 48, "type": kind,
            "meta": meta or {}, "optionId": None, "toolCode": None, **extra}


def _codes(result, key="errors"):
    return [i["code"] for i in result[key]]


def test_a_well_formed_snapshot_with_choices_and_tools_has_no_new_errors():
    result = world_validation.validate(_snapshot())
    assert result["errors"] == [] and result["warnings"] == []


# ─── OPTION_WITHOUT_TRIGGER ───────────────────────────────────────────────────────────────────
def test_an_option_no_dialogue_or_object_offers_is_an_error():
    result = world_validation.validate(_snapshot(choices=[]))
    assert _codes(result) == ["OPTION_WITHOUT_TRIGGER"]
    assert result["errors"][0]["entityRef"] == "decision:10"
    assert result["canPublish"] is False


def test_an_option_offered_by_a_choice_is_reachable():
    assert _codes(world_validation.validate(_snapshot())) == []


def test_an_option_offered_by_an_object_is_reachable():
    objects = [_door(5, key="kit", kind="TOOL", optionId=10)]
    result = world_validation.validate(_snapshot(choices=[], objects=objects))
    assert "OPTION_WITHOUT_TRIGGER" not in _codes(result)


def test_a_choice_that_offers_no_option_does_not_make_another_option_reachable():
    result = world_validation.validate(_snapshot(choices=[{"id": 1, "mapId": 100, "optionId": None, "requiredTool": None}]))
    assert _codes(result) == ["OPTION_WITHOUT_TRIGGER"]


def test_the_old_snapshot_without_choices_does_not_evaluate_the_rule():
    snapshot = _snapshot()
    del snapshot["choices"]
    assert "OPTION_WITHOUT_TRIGGER" not in _codes(world_validation.validate(snapshot))


# ─── REQUIRES_UNKNOWN ─────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "meta",
    [
        {"requiresTools": ["FANTASMA"]},
        {"requiresNodes": ["no-existe"]},
        {"requiresInspected": ["objeto-fantasma"]},
        {"requiresNpcs": ["npc-fantasma"]},
    ],
)
def test_a_door_that_requires_something_the_case_does_not_have_is_an_error(meta):
    result = world_validation.validate(_snapshot(objects=[_door(5, meta=meta)]))
    assert _codes(result) == ["REQUIRES_UNKNOWN"]
    assert result["errors"][0]["entityRef"] == "object:5"


def test_a_door_that_requires_what_exists_is_valid():
    objects = [
        _door(5, meta={"requiresTools": ["PAP"], "requiresNodes": ["inicio"], "requiresInspected": ["kit"]}),
        _door(6, key="kit", kind="OBJECT"),
    ]
    assert _codes(world_validation.validate(_snapshot(objects=objects))) == []


def test_a_choice_that_requires_an_undefined_tool_is_an_error():
    choices = [{"id": 1000, "mapId": 100, "optionId": 10, "requiredTool": "FANTASMA"}]
    result = world_validation.validate(_snapshot(choices=choices))
    assert _codes(result) == ["REQUIRES_UNKNOWN"]
    assert result["errors"][0]["entityRef"] == "map:100"


def test_an_object_with_an_undefined_tool_code_is_an_error():
    result = world_validation.validate(_snapshot(objects=[_door(5, key="kit", kind="TOOL", toolCode="FANTASMA")]))
    assert _codes(result) == ["REQUIRES_UNKNOWN"]


def test_the_old_snapshot_without_tools_does_not_evaluate_the_rule():
    snapshot = _snapshot(objects=[_door(5, meta={"requiresTools": ["FANTASMA"]})])
    del snapshot["tools"]
    assert "REQUIRES_UNKNOWN" not in _codes(world_validation.validate(snapshot))


# ─── DOOR_TARGET_MISSING ──────────────────────────────────────────────────────────────────────
def test_a_door_whose_target_scene_does_not_exist_is_an_error():
    result = world_validation.validate(_snapshot(objects=[_door(5, meta={"targetNodeKey": "no-existe"})]))
    assert _codes(result) == ["DOOR_TARGET_MISSING"]
    assert result["errors"][0]["entityRef"] == "object:5"


def test_a_door_to_an_existing_scene_is_valid():
    assert _codes(world_validation.validate(_snapshot(objects=[_door(5, meta={"targetNodeKey": "cierre"})]))) == []


def test_an_exit_without_a_target_is_the_safe_exit_and_is_valid():
    assert _codes(world_validation.validate(_snapshot(objects=[_door(5)]))) == []


def test_only_exit_objects_are_doors():
    objects = [_door(5, key="nota", kind="NOTE", meta={"targetNodeKey": "no-existe"})]
    assert _codes(world_validation.validate(_snapshot(objects=objects))) == []


# ─── mensajes llanos ──────────────────────────────────────────────────────────────────────────
def test_every_new_code_has_a_plain_template_without_digits_or_ids():
    for code in ("OPTION_WITHOUT_TRIGGER", "REQUIRES_UNKNOWN", "DOOR_TARGET_MISSING"):
        template = validation_issues.PLAIN[code]
        assert template and not any(ch.isdigit() for ch in template), code
