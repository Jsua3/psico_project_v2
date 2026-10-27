"""Filas ↔ modelo ↔ documento (E4): cargar la definición de una versión, exportarla y escribirla.

``load_definition`` lee la versión con un número **constante** de consultas (una por tabla, nunca una
por escena) y la ordena con un ``ORDER BY`` explícito, que es el orden canónico del documento: el
mismo estado produce los mismos bytes. ``export_definition`` es ``to_document`` de ese modelo.
``write_definition`` es la inversa de ``load_definition``: crea la versión borrador y todas sus filas
(también con un número constante de consultas) en el orden en que el modelo las trae, que es el que
``load_definition`` vuelve a leer. Todo lo que no toca la base de datos vive en ``apps.simulation.casedef``.
"""
import json
from dataclasses import dataclass
from decimal import Decimal

from rest_framework.exceptions import NotFound

from apps.simulation.casedef.canonical import definition_hash
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
    Competency,
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
from apps.simulation.services import rubric_service
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
                reason=_text(row.prohibition_reason), consequence=_text(row.consequence_text),
                immediate_feedback=_text(row.immediate_feedback), feedback_text=_text(row.feedback_text),
                theory_basis=_text(row.theory_basis),
                response_class=row.response_class,
                effects=read_map(row.effects),
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
            safe_exit_required=node.safe_exit_required, intensity=node.intensity,
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


def definition_view(case_version_id):
    """``{definition, definitionHash, sealedHash, validatedAt, reuseRatio}`` de una versión, borrador o publicada (E4-7).

    ``definitionHash`` es el del documento tal como está **ahora**: en un borrador, el que tendría si se
    publicara. ``sealedHash`` es el que se selló al publicar (``None`` en lo que no tiene sello): en lo
    publicado deben coincidir, y si no, alguien tocó por fuera lo que se validó. ``validatedAt`` solo lo
    tiene lo sellado y ``reuseRatio`` solo un clon publicado.
    """
    loaded = load_definition(case_version_id)
    version = CaseVersion.objects.get(pk=case_version_id)
    document = to_document(loaded.definition)
    return {
        "definition": document,
        "definitionHash": definition_hash(document),
        "sealedHash": version.definition_hash or None,
        "validatedAt": version.validated_at.isoformat() if version.validated_at else None,
        "reuseRatio": float(version.reuse_ratio) if version.reuse_ratio is not None else None,
    }


# ─── escribir la definición ───────────────────────────────────────────────────────────────────
def _dump(value):
    return json.dumps(value, ensure_ascii=False)


def _nodes(version, scenes):
    return SimulationNode.objects.bulk_create([
        SimulationNode(
            case_version=version, node_key=scene.key, title=scene.title, narrative=scene.narrative,
            support_resources_json=_dump(list(scene.support)), required_tools_json=_dump(list(scene.required_tools)),
            sensitive_content=scene.sensitive, safe_exit_required=scene.safe_exit_required,
            warning_message=scene.warning, start_node=scene.start, terminal_node=scene.terminal,
            position_x=scene.x, position_y=scene.y, decision_prompt=scene.prompt, display_order=position,
            intensity=scene.intensity,
        )
        for position, scene in enumerate(scenes)
    ])


def _option_row(version, scene, option, node_by_key):
    """La fila de una opción: la definición ya trae la clase y los efectos en el modelo nuevo (el importador convierte
    el documento 1.0 al leerlo)."""
    return DecisionOption(
        case_version=version, source_node=node_by_key[scene.key], target_node=node_by_key.get(option.target),
        option_key=option.key, text=option.text,
        immediate_feedback=option.immediate_feedback, prohibition_reason=option.reason, consequence_text=option.consequence,
        theory_basis=option.theory_basis, feedback_text=option.feedback_text,
        effects=_dump(option.effects), response_class=option.response_class,
    )


def _options(version, scenes, node_by_key):
    return DecisionOption.objects.bulk_create([
        _option_row(version, scene, option, node_by_key) for scene in scenes for option in scene.options
    ])


def _world_rows(version, scenes, node_by_key, option_by_key, character_by_key):
    """Mapas, pistas, colisiones, objetos, diálogos, líneas y elecciones de todas las escenas."""
    with_world = [scene for scene in scenes if scene.world is not None]
    maps = SceneMap.objects.bulk_create([
        SceneMap(
            case_version=version, node=node_by_key[scene.key], map_key=scene.world.key, title=scene.world.title,
            width=scene.world.width, height=scene.world.height, theme=scene.world.theme,
            spawn_x=scene.world.spawn_x, spawn_y=scene.world.spawn_y, ambient_json=_dump(scene.world.ambient),
        )
        for scene in with_world
    ])
    pairs = list(zip(with_world, maps))
    SceneHint.objects.bulk_create([
        SceneHint(scene_map=scene_map, hint_order=order, text=text)
        for scene, scene_map in pairs for order, text in enumerate(scene.hints, start=1)
    ])
    CollisionZone.objects.bulk_create([
        CollisionZone(
            scene_map=scene_map, zone_key=zone.key, label=zone.label, position_x=zone.x, position_y=zone.y,
            width=zone.width, height=zone.height,
        )
        for scene, scene_map in pairs for zone in scene.world.collisions
    ])
    object_specs = [(scene_map, obj) for scene, scene_map in pairs for obj in scene.world.objects]
    objects = MapObject.objects.bulk_create([
        MapObject(
            scene_map=scene_map, object_key=obj.key, label=obj.label, object_type=obj.type, position_x=obj.x,
            position_y=obj.y, width=obj.width, height=obj.height, color_hex=obj.color_hex, icon=obj.icon,
            short_code=obj.short_code, collision=obj.collision, visible=obj.visible,
            interaction_prompt=obj.interaction_prompt, interaction_text=obj.interaction_text,
            decision_option=option_by_key.get(obj.option), character=character_by_key.get(obj.character),
            tool_code=obj.tool_code, unlock_condition_json=_dump(obj.unlock_condition), z_index=obj.z_index,
            facing=obj.facing, movement_pattern_json=_dump(obj.movement_pattern), metadata_json=_dump(obj.metadata),
        )
        for scene_map, obj in object_specs
    ])
    object_by_key = {(scene_map.id, obj.key): row for (scene_map, obj), row in zip(object_specs, objects)}
    tree_specs = [(scene_map, tree) for scene, scene_map in pairs for tree in scene.world.dialogues]
    trees = DialogueTree.objects.bulk_create([
        DialogueTree(
            scene_map=scene_map, map_object=object_by_key.get((scene_map.id, tree.object_key)), tree_key=tree.key,
            speaker_name=tree.speaker, portrait_key=tree.portrait_key, emotion=tree.emotion,
        )
        for scene_map, tree in tree_specs
    ])
    DialogueLine.objects.bulk_create([
        DialogueLine(
            dialogue_tree=row, display_order=line.order, speaker_name=line.speaker, text=line.text,
            emotion=line.emotion,
        )
        for (_, tree), row in zip(tree_specs, trees) for line in tree.lines
    ])
    DialogueChoice.objects.bulk_create([
        DialogueChoice(
            dialogue_tree=row, choice_key=choice.key, text=choice.text,
            decision_option=option_by_key.get(choice.option), required_tool_code=choice.required_tool,
            effect_json=_dump(choice.effect), display_order=choice.order,
        )
        for (_, tree), row in zip(tree_specs, trees) for choice in tree.choices
    ])


def _rubric_rows(version, rubrics, owner):
    codes = {c.competency_code for rubric in rubrics for c in rubric.criteria if c.competency_code}
    competencies = {row.code: row for row in Competency.objects.filter(code__in=codes)} if codes else {}
    rows = RubricRow.objects.bulk_create([
        RubricRow(
            case_version=version, name=rubric.name, description=rubric.description, active=rubric.active,
            version=rubric.version, created_by=owner,
        )
        for rubric in rubrics
    ])
    RubricCriterion.objects.bulk_create([
        RubricCriterion(
            rubric=row, competency=criterion.competency, competency_ref=competencies.get(criterion.competency_code),
            title=criterion.title, description=criterion.description, max_score=criterion.max_score,
            weight=Decimal(criterion.weight), active=criterion.active, display_order=order,
        )
        for rubric, row in zip(rubrics, rows) for order, criterion in enumerate(rubric.criteria, start=1)
    ])


def write_definition(definition, *, case, actor):
    """Crea la versión BORRADOR de ``definition`` bajo ``case`` con todas sus filas y la devuelve.

    Es la inversa de ``load_definition``: el orden de cada tupla del modelo es el orden en que se crean
    las filas (y el que ``load_definition`` vuelve a leer). Debe llamarse dentro de una transacción: si
    algo falla, no queda ninguna fila.

    La definición ya está en el modelo nuevo (clase, persona e hitos, ``rules`` con hitos, nivel de riesgo y finales por
    clases): el importador (``casedef.import_``) convierte el documento 1.0 al leerlo, y aquí las filas se escriben tal cual.
    """
    version = CaseVersion.objects.create(
        simulation_case=case, semantic_version=definition.semantic_version, status="DRAFT",
        narrative_context=definition.context, learning_objectives=_dump(list(definition.objectives)),
        rules=_dump(definition.rules), world_schema_version=definition.world_schema_version, created_by=actor,
    )
    node_by_key = {node.node_key: node for node in _nodes(version, definition.scenes)}
    characters = CaseCharacter.objects.bulk_create([
        CaseCharacter(
            case_version=version, character_key=c.key, display_name=c.display_name, role_label=c.role_label,
            portrait_key=c.portrait_key, show_in_brief=c.show_in_brief, display_order=c.display_order,
        )
        for c in definition.characters
    ])
    ClinicalTool.objects.bulk_create([
        ClinicalTool(
            case_version=version, tool_code=t.code, label=t.label, icon=t.icon, category=t.category,
            description=t.description, active=t.active,
        )
        for t in definition.tools
    ])
    option_by_key = {option.option_key: option for option in _options(version, definition.scenes, node_by_key)}
    character_by_key = {character.character_key: character for character in characters}
    _world_rows(version, definition.scenes, node_by_key, option_by_key, character_by_key)
    # Las rúbricas son de quien autora el caso: si las dejara a nombre de un ADMIN que importa, las vería todo docente.
    _rubric_rows(version, definition.rubrics, case.created_by or actor)
    # Un borrador nace con las ponderaciones que la evaluación usará: así su hash es el que tendría al publicarse.
    rubric_service.normalize_version_rubrics(version.id)
    return version
