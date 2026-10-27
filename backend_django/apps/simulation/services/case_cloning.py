"""Copia de una versión de caso (P-03 · Prototype declarativo).

Clonar una versión significa crear, para cada entidad del caso, una copia de su fila.
Cada entidad declara aquí **qué campos se copian tal cual** (``CopySpec``); quien clona
(``authoring/publication.py::clone_version``) pone solo los vínculos que cambian: la versión
nueva, los nodos, mapas y decisiones ya copiados. Antes, diez funciones repetían campo
por campo el mismo ``objects.create(...)``.

Lo que NO se declara no se copia, y recibe el valor por defecto del modelo. Hoy solo
queda ``Rubric.is_default``, **a propósito**: es una marca global (``set_default`` apaga la
de todas las demás rúbricas), así que copiarla dejaría dos rúbricas predeterminadas. Hasta
A-07 tampoco se copiaban ``CaseVersion.world_schema_version``, ``Rubric.version`` ni
``RubricCriterion.weight`` y ``.active``: eran olvidos, y el peso personalizado de un
criterio se perdía al clonar. ``test_clone_version_contract`` fija la lista de lo no
copiado y falla si un campo nuevo del modelo no se declara ni se excluye.
"""
from dataclasses import dataclass

from ..models import (
    CaseCharacter,
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
    SceneHint,
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


CASE_VERSION = CopySpec(CaseVersion, (
    "narrative_context", "learning_objectives", "world_schema_version", "rules",
))

NODE = CopySpec(SimulationNode, (
    "node_key", "title", "narrative", "support_resources_json", "required_tools_json",
    "sensitive_content", "safe_exit_required", "warning_message", "start_node",
    "terminal_node", "position_x", "position_y", "decision_prompt", "display_order",
    "intensity", "ai_suggested",
))

DECISION = CopySpec(DecisionOption, (
    "option_key", "text", "classification", "score_delta", "stress_delta",
    "prohibited_penalty", "immediate_feedback", "prohibited_conduct", "prohibition_reason",
    "consequence_text", "theory_basis", "feedback_text", "effects", "response_class",
    "ai_suggested",
))

MAP = CopySpec(SceneMap, (
    "map_key", "title", "width", "height", "theme", "spawn_x", "spawn_y", "ambient_json",
))

COLLISION_ZONE = CopySpec(CollisionZone, (
    "zone_key", "label", "position_x", "position_y", "width", "height",
))

HINT = CopySpec(SceneHint, ("hint_order", "text"))

CHARACTER = CopySpec(CaseCharacter, (
    "character_key", "display_name", "role_label", "portrait_key", "show_in_brief", "display_order",
))

MAP_OBJECT = CopySpec(MapObject, (
    "object_key", "label", "object_type", "position_x", "position_y", "width", "height",
    "color_hex", "icon", "short_code", "collision", "visible", "interaction_prompt",
    "interaction_text", "tool_code", "unlock_condition_json", "z_index", "facing",
    "movement_pattern_json", "metadata_json", "ai_suggested",
))

DIALOGUE_TREE = CopySpec(DialogueTree, ("tree_key", "speaker_name", "portrait_key", "emotion"))

DIALOGUE_LINE = CopySpec(DialogueLine, ("display_order", "speaker_name", "text", "emotion", "ai_suggested"))

DIALOGUE_CHOICE = CopySpec(DialogueChoice, (
    "choice_key", "text", "required_tool_code", "effect_json", "display_order",
))

CLINICAL_TOOL = CopySpec(ClinicalTool, (
    "tool_code", "label", "icon", "category", "description", "active",
))

RUBRIC = CopySpec(Rubric, ("name", "description", "active", "version"))

RUBRIC_CRITERION = CopySpec(RubricCriterion, (
    "competency", "title", "description", "weight", "max_score", "active", "display_order",
))
