"""Copia de una versión de caso (P-03 · Prototype declarativo).

Clonar una versión significa crear, para cada entidad del caso, una copia de su fila.
Cada entidad declara aquí **qué campos se copian tal cual** (``CopySpec``); quien clona
(``authoring/publication.py::clone_version``) pone solo los vínculos que cambian: la versión
nueva, los nodos, mapas y decisiones ya copiados. Antes, diez funciones repetían campo
por campo el mismo ``objects.create(...)``.

Lo que NO se declara no se copia. Hoy no se copian, a propósito o por olvido que el
equipo debe decidir: ``CaseVersion.world_schema_version``, ``Rubric.version``,
``Rubric.is_default``, ``RubricCriterion.weight`` y ``RubricCriterion.active`` (valen el
valor por defecto del modelo en el clon). ``test_clone_version_contract`` fija esa lista
y falla si un campo nuevo del modelo no se declara ni se excluye.
"""
from dataclasses import dataclass

from ..models import (
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    Rubric,
    RubricCriterion,
    SceneMap,
    SimulationNode,
)


@dataclass(frozen=True)
class CopySpec:
    """Qué campos de un modelo se copian al clonar; ``copy`` crea la copia y la guarda."""

    model: type
    fields: tuple

    def copy(self, source, **links):
        values = {name: getattr(source, name) for name in self.fields}
        return self.model.objects.create(**values, **links)


CASE_VERSION = CopySpec(CaseVersion, ("narrative_context",))

NODE = CopySpec(SimulationNode, (
    "node_key", "title", "narrative", "support_resources_json", "required_tools_json",
    "sensitive_content", "safe_exit_required", "warning_message", "start_node",
    "terminal_node", "position_x", "position_y",
))

DECISION = CopySpec(DecisionOption, (
    "option_key", "text", "classification", "score_delta", "stress_delta",
    "prohibited_penalty", "immediate_feedback", "prohibited_conduct", "prohibition_reason",
))

MAP = CopySpec(SceneMap, (
    "map_key", "title", "width", "height", "theme", "spawn_x", "spawn_y", "ambient_json",
))

COLLISION_ZONE = CopySpec(CollisionZone, (
    "zone_key", "label", "position_x", "position_y", "width", "height",
))

MAP_OBJECT = CopySpec(MapObject, (
    "object_key", "label", "object_type", "position_x", "position_y", "width", "height",
    "color_hex", "icon", "short_code", "collision", "visible", "interaction_prompt",
    "interaction_text", "tool_code", "unlock_condition_json", "z_index", "facing",
    "movement_pattern_json", "metadata_json",
))

DIALOGUE_TREE = CopySpec(DialogueTree, ("tree_key", "speaker_name", "portrait_key", "emotion"))

DIALOGUE_LINE = CopySpec(DialogueLine, ("display_order", "speaker_name", "text", "emotion"))

DIALOGUE_CHOICE = CopySpec(DialogueChoice, (
    "choice_key", "text", "required_tool_code", "effect_json", "display_order",
))

CLINICAL_TOOL = CopySpec(ClinicalTool, (
    "tool_code", "label", "icon", "category", "description", "active",
))

RUBRIC = CopySpec(Rubric, ("name", "description", "active"))

RUBRIC_CRITERION = CopySpec(RubricCriterion, (
    "competency", "title", "description", "max_score", "display_order",
))
