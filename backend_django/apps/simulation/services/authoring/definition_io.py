"""Filas ↔ modelo ↔ documento (E4): cargar la definición de una versión y exportarla.

``load_definition`` lee la versión con un número **constante** de consultas (una por tabla, nunca una
por escena) y la ordena con un ``ORDER BY`` explícito, que es el orden canónico del documento: el
mismo estado produce los mismos bytes. ``export_definition`` es ``to_document`` de ese modelo. Todo lo
que no toca la base de datos vive en ``apps.simulation.casedef``.
"""
from dataclasses import dataclass
from decimal import Decimal

from rest_framework.exceptions import NotFound

from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.model import (
    CaseDefinition,
    Character,
    CollisionZone as CollisionZoneModel,
    Criterion,
    DialogueChoice as DialogueChoiceModel,
    DialogueLine as DialogueLineModel,
    DialogueTree as DialogueTreeModel,
    Option,
    Rubric,
    Scene,
    Tool,
    World,
    WorldObject,
)
from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    Rubric as RubricRow,
    RubricCriterion,
    SceneHint,
    SceneMap,
    SimulationNode,
)
from shared.jsonutils import read_map, read_string_list


@dataclass(frozen=True)
class Loaded:
    """La definición y las filas que hay detrás de cada escena (para llevar el foco del editor)."""

    definition: CaseDefinition
    #: clave de escena → id del nodo.
    scene_node_ids: dict
    #: clave de escena → id de su mapa (si lo tiene).
    scene_map_ids: dict


def _text(value):
    return value if isinstance(value, str) else ""


def _weight(value):
    return f"{Decimal(value):.2f}"


def _options_by_source(rows, node_keys):
    grouped = {}
    for row in rows:
        grouped.setdefault(row.source_node_id, []).append(
            Option(
                key=row.option_key, text=row.text, target=node_keys.get(row.target_node_id, ""),
                classification=row.classification, prohibited=row.prohibited_conduct,
                reason=_text(row.prohibition_reason), consequence=_text(row.consequence_text),
                immediate_feedback=_text(row.immediate_feedback), feedback_text=_text(row.feedback_text),
                theory_basis=_text(row.theory_basis), score=row.score_delta, stress=row.stress_delta,
                penalty=row.prohibited_penalty, effects=read_map(row.effects),
            )
        )
    return grouped


def _worlds(version_id, option_keys, character_keys):
    """``{id de mapa: World}`` con cinco consultas más (colisiones, objetos, árboles, líneas y elecciones)."""
    collisions, objects, objects_by_id = {}, {}, {}
    for zone in CollisionZone.objects.filter(scene_map__case_version_id=version_id).order_by("scene_map_id", "id"):
        collisions.setdefault(zone.scene_map_id, []).append(CollisionZoneModel(
            key=zone.zone_key, label=_text(zone.label), x=zone.position_x, y=zone.position_y,
            width=zone.width, height=zone.height,
        ))
    for row in MapObject.objects.filter(scene_map__case_version_id=version_id).order_by("scene_map_id", "id"):
        objects_by_id[row.id] = row.object_key
        objects.setdefault(row.scene_map_id, []).append(WorldObject(
            key=row.object_key, label=row.label, type=row.object_type, x=row.position_x, y=row.position_y,
            width=row.width, height=row.height, z_index=row.z_index, facing=row.facing,
            color_hex=row.color_hex, icon=row.icon, short_code=row.short_code, collision=row.collision,
            visible=row.visible, interaction_prompt=row.interaction_prompt,
            interaction_text=row.interaction_text, option=option_keys.get(row.decision_option_id),
            character=character_keys.get(row.character_id), tool_code=row.tool_code,
            unlock_condition=read_map(row.unlock_condition_json),
            movement_pattern=read_map(row.movement_pattern_json), metadata=read_map(row.metadata_json),
        ))
    lines, choices = {}, {}
    for line in DialogueLine.objects.filter(dialogue_tree__scene_map__case_version_id=version_id).order_by(
        "dialogue_tree_id", "display_order", "id"
    ):
        lines.setdefault(line.dialogue_tree_id, []).append(DialogueLineModel(
            order=line.display_order, speaker=line.speaker_name, text=line.text, emotion=line.emotion,
        ))
    for choice in DialogueChoice.objects.filter(dialogue_tree__scene_map__case_version_id=version_id).order_by(
        "dialogue_tree_id", "display_order", "id"
    ):
        choices.setdefault(choice.dialogue_tree_id, []).append(DialogueChoiceModel(
            key=choice.choice_key, text=choice.text, option=option_keys.get(choice.decision_option_id),
            required_tool=choice.required_tool_code, effect=read_map(choice.effect_json),
            order=choice.display_order,
        ))
    trees = {}
    for tree in DialogueTree.objects.filter(scene_map__case_version_id=version_id).order_by("scene_map_id", "id"):
        trees.setdefault(tree.scene_map_id, []).append(DialogueTreeModel(
            key=tree.tree_key, speaker=tree.speaker_name, portrait_key=tree.portrait_key, emotion=tree.emotion,
            object_key=objects_by_id.get(tree.map_object_id), lines=tuple(lines.get(tree.id, ())),
            choices=tuple(choices.get(tree.id, ())),
        ))
    worlds = {}
    for scene_map in SceneMap.objects.filter(case_version_id=version_id).order_by("id"):
        worlds[scene_map.id] = (scene_map, World(
            key=scene_map.map_key, title=scene_map.title, width=scene_map.width, height=scene_map.height,
            theme=scene_map.theme, spawn_x=scene_map.spawn_x, spawn_y=scene_map.spawn_y,
            ambient=read_map(scene_map.ambient_json), collisions=tuple(collisions.get(scene_map.id, ())),
            objects=tuple(objects.get(scene_map.id, ())), dialogues=tuple(trees.get(scene_map.id, ())),
        ))
    return worlds


def _rubrics(version_id):
    rubric_rows = list(RubricRow.objects.filter(case_version_id=version_id).order_by("id"))
    criteria = {}
    for row in (
        RubricCriterion.objects.filter(rubric__case_version_id=version_id)
        .select_related("competency_ref").order_by("rubric_id", "display_order", "id")
    ):
        criteria.setdefault(row.rubric_id, []).append(
            Criterion(
                competency=row.competency, title=row.title, description=_text(row.description),
                max_score=row.max_score, weight=_weight(row.weight), active=row.active,
                competency_code=row.competency_ref.code if row.competency_ref_id else None,
            )
        )
    return tuple(
        Rubric(
            name=row.name, description=_text(row.description), version=row.version, active=row.active,
            criteria=tuple(criteria.get(row.id, ())),
        )
        for row in rubric_rows
    )


def load_definition(case_version_id):
    """La definición de la versión como modelo puro, con consultas constantes."""
    version = (
        CaseVersion.objects.select_related("simulation_case").filter(pk=case_version_id).first()
    )
    if version is None:
        raise NotFound("Version de caso no encontrada")

    nodes = list(
        SimulationNode.objects.filter(case_version_id=version.id).order_by("display_order", "id")
    )
    node_keys = {node.id: node.node_key for node in nodes}
    option_rows = list(DecisionOption.objects.filter(case_version_id=version.id).order_by("id"))
    option_keys = {row.id: row.option_key for row in option_rows}
    options = _options_by_source(option_rows, node_keys)
    character_rows = list(
        CaseCharacter.objects.filter(case_version_id=version.id).order_by("display_order", "id")
    )
    worlds = _worlds(version.id, option_keys, {row.id: row.character_key for row in character_rows})
    maps = {scene_map.node_id: map_id for map_id, (scene_map, _) in worlds.items()}
    hints = {}
    for hint in SceneHint.objects.filter(scene_map__case_version_id=version.id).order_by(
        "scene_map_id", "hint_order", "id"
    ):
        hints.setdefault(hint.scene_map_id, []).append(hint.text)

    scenes = tuple(
        Scene(
            key=node.node_key, title=node.title, narrative=_text(node.narrative),
            sensitive=node.sensitive_content, warning=_text(node.warning_message),
            start=node.start_node, terminal=node.terminal_node,
            support=tuple(read_string_list(node.support_resources_json)),
            required_tools=tuple(read_string_list(node.required_tools_json)),
            safe_exit_required=node.safe_exit_required,
            x=node.position_x or 0, y=node.position_y or 0, prompt=_text(node.decision_prompt),
            hints=tuple(hints.get(maps.get(node.id), ())),
            options=tuple(options.get(node.id, ())),
            world=worlds[maps[node.id]][1] if node.id in maps else None,
        )
        for node in nodes
    )
    characters = tuple(
        Character(
            key=row.character_key, display_name=row.display_name, role_label=row.role_label,
            portrait_key=row.portrait_key, show_in_brief=row.show_in_brief,
            display_order=row.display_order,
        )
        for row in character_rows
    )
    tools = tuple(
        Tool(
            code=row.tool_code, label=row.label, icon=row.icon, category=row.category,
            description=_text(row.description), active=row.active,
        )
        for row in ClinicalTool.objects.filter(case_version_id=version.id).order_by("id")
    )
    definition = CaseDefinition(
        code=version.simulation_case.code, title=version.simulation_case.title,
        description=_text(version.simulation_case.description),
        semantic_version=version.semantic_version, status=version.status,
        context=_text(version.narrative_context),
        objectives=tuple(read_string_list(version.learning_objectives)),
        rules=read_map(version.rules), world_schema_version=version.world_schema_version,
        characters=characters, tools=tools, scenes=scenes, rubrics=_rubrics(version.id),
    )
    return Loaded(
        definition=definition,
        scene_node_ids={node.node_key: node.id for node in nodes},
        scene_map_ids={node_keys[node_id]: map_id for node_id, map_id in maps.items() if node_id in node_keys},
    )


def export_definition(case_version_id):
    """El documento canónico de la versión (borrador o publicada)."""
    return to_document(load_definition(case_version_id).definition)
