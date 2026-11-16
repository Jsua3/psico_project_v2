"""Qué columnas de cada modelo del caso viajan en la definición y cuáles no (y por qué).

Es el contrato del exportador, el equivalente de ``case_cloning`` para el documento: una columna
nueva de un modelo del caso **debe** declararse aquí como exportada (y entonces el documento la lleva)
o como excluida con su motivo. ``tests/test_definition_coverage.py`` lo exige. Sin esto, una columna que
nadie exporta no entraría al documento, ni a la ida y vuelta, ni a la huella: la definición validada y la
que se ejecuta se separarían sin avisar. Los nombres son los de los modelos de ``apps.simulation.models``.
"""

#: modelo → columnas que el documento lleva (por su valor, por su orden o como clave de otra entidad).
EXPORTED = {
    "SimulationCase": {"code", "title", "description"},
    "CaseVersion": {
        "semantic_version", "status", "narrative_context", "learning_objectives", "world_schema_version",
        "rules",
    },
    # ``display_order`` viaja como el orden de la escena en el documento (``orden``), no como su valor.
    "SimulationNode": {
        "node_key", "title", "narrative", "support_resources_json", "required_tools_json",
        "sensitive_content", "safe_exit_required", "warning_message", "start_node", "terminal_node",
        "position_x", "position_y", "decision_prompt", "goal", "display_order", "intensity",
        # Bloque A2: viaja como ``comentarios`` de la escena (x-siep 2.1).
        "comments_json",
    },
    "DecisionOption": {
        "option_key", "source_node", "target_node", "text", "immediate_feedback",
        "prohibition_reason", "consequence_text", "theory_basis", "feedback_text", "effects", "requires_json", "reaction_json", "response_class",
    },
    # Bloque P3: ``structure`` viaja como ``mapa.estructura`` (x-siep 2.2).
    "SceneMap": {"node", "map_key", "title", "width", "height", "theme", "spawn_x", "spawn_y", "ambient_json", "structure"},
    "SceneHint": {"scene_map", "hint_order", "text"},
    "CaseCharacter": {
        "character_key", "display_name", "role_label", "portrait_key", "show_in_brief", "display_order",
    },
    "MapObject": {
        "scene_map", "object_key", "label", "object_type", "position_x", "position_y", "width", "height",
        "color_hex", "icon", "short_code", "collision", "visible", "interaction_prompt", "interaction_text",
        "decision_option", "character", "tool_code", "unlock_condition_json", "z_index", "facing",
        "movement_pattern_json", "metadata_json",
    },
    "CollisionZone": {"scene_map", "zone_key", "label", "position_x", "position_y", "width", "height"},
    "DialogueTree": {"scene_map", "map_object", "tree_key", "speaker_name", "portrait_key", "emotion"},
    "DialogueLine": {"dialogue_tree", "display_order", "speaker_name", "text", "emotion"},
    "DialogueChoice": {
        "dialogue_tree", "choice_key", "text", "decision_option", "required_tool_code", "effect_json",
        "display_order",
    },
    "ClinicalTool": {"tool_code", "label", "icon", "category", "description", "active"},
    "Rubric": {"name", "description", "active", "version"},
    # ``competency_ref`` viaja como el código de la competencia (``competenciaCodigo``).
    "RubricCriterion": {
        "competency", "competency_ref", "title", "description", "max_score", "weight", "active", "display_order",
    },
}

_ID = "identificador de la base de datos: el documento usa ids de DSL por posición"
_OWNER_VERSION = "la entidad es de la versión del documento"
_STAMP = "marca de tiempo de la fila; el documento no lleva fechas"
_AI_MARK = "marca de revisión del asistente de IA (P5): la lleva la compuerta de publicación, no el documento (se pierde al exportar e importar)"

#: modelo → {columna: motivo por el que no viaja}.
EXCLUDED = {
    "SimulationCase": {
        "id": _ID,
        "active": "estado operativo del caso en el catálogo, no de su definición",
        "created_by": "quién creó el caso: el documento no transporta personas (se importa a nombre de quien importa)",
        "created_at": _STAMP,
        "updated_at": _STAMP,
    },
    "CaseVersion": {
        "id": _ID,
        "simulation_case": "el caso va por `caso.id`",
        "cloned_from": "procedencia de la versión: la reutilización se mide aparte (`reuse_ratio`)",
        "published_at": "fecha de publicación: el documento no lleva fechas",
        "validated_at": "fecha del sello de la publicación: la escribe la compuerta; el documento no lleva fechas",
        "definition_hash": "huella del documento validado: se calcula DEL documento, no entra en él",
        "reuse_ratio": "medida derivada al publicar un clon (cuánto del original conserva): no es contenido",
        "created_by": "quién creó la versión: el documento no transporta personas",
        "created_at": _STAMP,
        "version": "revisión optimista del editor; no es contenido",
        "last_edited_by": "quién editó por última vez; no es contenido",
        "edited_alone_since": "tanda de ediciones del editor; no es contenido",
    },
    "SimulationNode": {"id": _ID, "case_version": _OWNER_VERSION, "ai_suggested": _AI_MARK},
    "DecisionOption": {"id": _ID, "case_version": _OWNER_VERSION, "ai_suggested": _AI_MARK},
    "SceneMap": {"id": _ID, "case_version": "la versión del mapa es la de su escena", "created_at": _STAMP,
                 "updated_at": _STAMP},
    "SceneHint": {"id": _ID},
    "CaseCharacter": {"id": _ID, "case_version": _OWNER_VERSION},
    "MapObject": {"id": _ID, "created_at": _STAMP, "updated_at": _STAMP, "ai_suggested": _AI_MARK},
    "CollisionZone": {"id": _ID},
    "DialogueTree": {"id": _ID, "created_at": _STAMP},
    "DialogueLine": {"id": _ID, "ai_suggested": _AI_MARK},
    "DialogueChoice": {"id": _ID},
    "ClinicalTool": {"id": _ID, "case_version": _OWNER_VERSION},
    "Rubric": {
        "id": _ID,
        "case_version": _OWNER_VERSION,
        "is_default": "marca global: copiarla dejaría dos rúbricas predeterminadas (igual que al clonar)",
        "updated_at": _STAMP,
        "created_by": "de quién es la rúbrica: el documento no transporta personas (se importa a nombre de quien importa)",
        "created_at": _STAMP,
    },
    "RubricCriterion": {"id": _ID, "rubric": "el criterio es de su rúbrica"},
}
