"""Explorable-world models."""
from django.db import models

from .case import CaseVersion, DecisionOption, SimulationNode

#: Tamaño con el que se trata un mapa sin ancho o alto guardado (el campo vale 0 si no se fijó).
DEFAULT_MAP_WIDTH = 960
DEFAULT_MAP_HEIGHT = 540

#: Tipos de objeto del mundo que admite el CHECK ``map_objects_object_type_check``: los
#: 6 del volcado original más los que ofrece el editor (``WorldObjectType`` en el
#: cliente). Sin los segundos, guardar un ``PROP`` daba 500 con la BD de producción.
MAP_OBJECT_TYPES = [
    "PERSON", "OBJECT", "ROUTE", "TOOL", "WARNING", "EXIT",
    "PROP", "TOOL_TARGET", "TRIGGER", "NOTE", "RESOURCE",
]


class SceneMap(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="scene_maps", db_column="case_version_id"
    )
    node = models.ForeignKey(SimulationNode, on_delete=models.DB_CASCADE, db_column="node_id")
    map_key = models.CharField(max_length=120)
    title = models.CharField(max_length=255)
    width = models.IntegerField(default=0, db_default=0)
    height = models.IntegerField(default=0, db_default=0)
    theme = models.CharField(max_length=100, default="", db_default="")
    spawn_x = models.IntegerField(default=0, db_default=0)
    spawn_y = models.IntegerField(default=0, db_default=0)
    ambient_json = models.TextField(default="{}", db_default="{}")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "scene_maps"
        constraints = [
            models.UniqueConstraint(fields=["case_version", "map_key"], name="scene_maps_case_version_id_map_key_key"),
            models.UniqueConstraint(fields=["node"], name="scene_maps_node_id_key"),
        ]


class CaseCharacter(models.Model):
    """Un personaje del caso (RF-07, decisión 16): dato autorable al que apuntan los objetos PERSON.

    ``show_in_brief`` lo decide Psicología: solo los marcados aparecen en la ficha del caso.
    """

    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="characters", db_column="case_version_id"
    )
    character_key = models.CharField(max_length=120)
    display_name = models.CharField(max_length=255)
    role_label = models.CharField(max_length=255, default="", db_default="")
    portrait_key = models.CharField(max_length=120, default="", db_default="")
    show_in_brief = models.BooleanField(default=False, db_default=False)
    display_order = models.IntegerField(default=0, db_default=0)

    class Meta:
        db_table = "case_characters"
        constraints = [
            models.UniqueConstraint(
                fields=["case_version", "character_key"],
                name="case_characters_case_version_id_character_key_key",
            ),
        ]


class MapObject(models.Model):
    scene_map = models.ForeignKey(
        SceneMap, on_delete=models.DB_CASCADE, related_name="map_objects", db_column="scene_map_id"
    )
    object_key = models.CharField(max_length=120)
    label = models.CharField(max_length=255)
    object_type = models.CharField(max_length=50)
    position_x = models.IntegerField(default=0)
    position_y = models.IntegerField(default=0)
    width = models.IntegerField(default=1, db_default=1)
    height = models.IntegerField(default=1, db_default=1)
    color_hex = models.CharField(max_length=20, default="", db_default="")
    icon = models.CharField(max_length=80, default="", db_default="")
    short_code = models.CharField(max_length=20, default="", db_default="")
    collision = models.BooleanField(default=False, db_default=False)
    visible = models.BooleanField(default=True, db_default=True)
    interaction_prompt = models.CharField(max_length=255, default="")
    interaction_text = models.TextField(default="")
    decision_option = models.ForeignKey(
        DecisionOption, on_delete=models.DB_SET_NULL, null=True, blank=True,
        db_column="decision_option_id",
    )
    #: El personaje que este objeto representa (solo los PERSON lo usan); se desvincula al borrarlo.
    character = models.ForeignKey(
        CaseCharacter, on_delete=models.DB_SET_NULL, null=True, blank=True,
        related_name="map_objects", db_column="character_id",
    )
    tool_code = models.CharField(max_length=80, null=True, blank=True)
    unlock_condition_json = models.TextField(default="{}", db_default="{}")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    z_index = models.IntegerField(default=0, db_default=0)
    facing = models.CharField(max_length=20, default="", db_default="")
    movement_pattern_json = models.TextField(default="{}", db_default="{}")
    metadata_json = models.TextField(default="{}", db_default="{}")

    class Meta:
        db_table = "map_objects"
        constraints = [
            models.CheckConstraint(condition=models.Q(object_type__in=MAP_OBJECT_TYPES), name="map_objects_object_type_check"),
            models.UniqueConstraint(fields=["scene_map", "object_key"], name="map_objects_scene_map_id_object_key_key"),
        ]


class CollisionZone(models.Model):
    scene_map = models.ForeignKey(
        SceneMap, on_delete=models.DB_CASCADE, related_name="collision_zones", db_column="scene_map_id"
    )
    zone_key = models.CharField(max_length=120)
    label = models.CharField(max_length=255, null=True, blank=True)
    position_x = models.IntegerField(default=0)
    position_y = models.IntegerField(default=0)
    width = models.IntegerField(default=1)
    height = models.IntegerField(default=1)

    class Meta:
        db_table = "collision_zones"
        constraints = [
            models.UniqueConstraint(fields=["scene_map", "zone_key"], name="collision_zones_scene_map_id_zone_key_key"),
        ]


class DialogueTree(models.Model):
    scene_map = models.ForeignKey(
        SceneMap, on_delete=models.DB_CASCADE, related_name="dialogue_trees", db_column="scene_map_id"
    )
    map_object = models.ForeignKey(
        MapObject, on_delete=models.DB_CASCADE, null=True, blank=True, db_column="map_object_id"
    )
    tree_key = models.CharField(max_length=120)
    speaker_name = models.CharField(max_length=255)
    portrait_key = models.CharField(max_length=120, null=True, blank=True)
    emotion = models.CharField(max_length=60, default="", db_default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dialogue_trees"
        constraints = [
            models.UniqueConstraint(fields=["scene_map", "tree_key"], name="dialogue_trees_scene_map_id_tree_key_key"),
        ]


class DialogueLine(models.Model):
    dialogue_tree = models.ForeignKey(
        DialogueTree, on_delete=models.DB_CASCADE, related_name="lines", db_column="dialogue_tree_id"
    )
    display_order = models.IntegerField(default=0, db_default=0)
    speaker_name = models.CharField(max_length=255)
    text = models.TextField()
    emotion = models.CharField(max_length=60, default="", db_default="")

    class Meta:
        db_table = "dialogue_lines"
        constraints = [
            models.UniqueConstraint(fields=["dialogue_tree", "display_order"], name="dialogue_lines_dialogue_tree_id_display_order_key"),
        ]
        ordering = ["display_order"]


class DialogueChoice(models.Model):
    dialogue_tree = models.ForeignKey(
        DialogueTree, on_delete=models.DB_CASCADE, related_name="choices", db_column="dialogue_tree_id"
    )
    choice_key = models.CharField(max_length=120)
    text = models.TextField()
    decision_option = models.ForeignKey(
        DecisionOption, on_delete=models.DB_SET_NULL, null=True, blank=True,
        db_column="decision_option_id",
    )
    required_tool_code = models.CharField(max_length=80, null=True, blank=True)
    effect_json = models.TextField(default="{}", db_default="{}")
    display_order = models.IntegerField(default=0, db_default=0)

    class Meta:
        db_table = "dialogue_choices"
        constraints = [
            models.UniqueConstraint(fields=["dialogue_tree", "choice_key"], name="dialogue_choices_dialogue_tree_id_choice_key_key"),
        ]
        ordering = ["display_order"]


class ClinicalTool(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, null=True, blank=True,
        related_name="clinical_tools", db_column="case_version_id",
    )
    tool_code = models.CharField(max_length=80)
    label = models.CharField(max_length=255)
    icon = models.CharField(max_length=80, default="", db_default="")
    category = models.CharField(max_length=80, default="", db_default="")
    description = models.TextField(default="")
    active = models.BooleanField(default=True, db_default=True)

    class Meta:
        db_table = "clinical_tools"
        constraints = [
            models.UniqueConstraint(fields=["case_version", "tool_code"], name="clinical_tools_case_version_id_tool_code_key"),
        ]
