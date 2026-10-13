"""Attempt-related models.

attempt_world_states is keyed 1:1 by attempt_id (no surrogate id).
Los CHECK, UNIQUE e índices que antes imponía el volcado de despliegue viven en
``Meta`` y los fija ``apps/simulation/tests/test_schema_contract.py``.
"""
import uuid

from django.conf import settings
from django.db import models

from .case import CaseVersion, DecisionOption, SimulationNode


class AttemptStatus(models.TextChoices):
    IN_PROGRESS = "IN_PROGRESS"
    # Pausa reanudable real (ETH-02, opción A): sin ended_at/locked_at.
    PAUSED = "PAUSED"
    # Salida segura terminal, solo histórica: antes de la pausa reanudable la
    # salida segura cerraba el intento. Ningún código nuevo la escribe.
    SAFE_EXITED = "SAFE_EXITED"
    COMPLETED = "COMPLETED"
    # Cierre terminal porque el estudiante empezó otro intento con forceNew. No
    # es una salida segura y no puntúa.
    REPLACED = "REPLACED"


#: Escala de los indicadores del intento: estrés, confianza en la persona y riesgo de la víctima.
INDICATOR_MIN = 0
INDICATOR_MAX = 100
#: Un intento nuevo arranca sin estrés y con la confianza y el riesgo a media escala.
INITIAL_STRESS_INDEX = 0
INITIAL_VICTIM_RISK = 50
INITIAL_USER_TRUST = 50


class SimulationAttempt(models.Model):
    AttemptStatus = AttemptStatus

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt_token_hash = models.CharField(max_length=255, unique=True)
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DO_NOTHING, db_column="case_version_id"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="student_id"
    )
    current_node = models.ForeignKey(
        SimulationNode, on_delete=models.DO_NOTHING, db_column="current_node_id"
    )
    status = models.CharField(
        max_length=24, choices=AttemptStatus.choices, default=AttemptStatus.IN_PROGRESS
    )
    accumulated_score = models.IntegerField(default=0, db_default=0)
    stress_index = models.IntegerField(default=INITIAL_STRESS_INDEX, db_default=0)
    # Clinical metrics (Flyway V8).
    victim_risk = models.IntegerField(default=INITIAL_VICTIM_RISK, db_default=50)
    user_trust = models.IntegerField(default=INITIAL_USER_TRUST, db_default=50)
    institutional_route_activated = models.BooleanField(default=False, db_default=False)
    revictimization_risk = models.BooleanField(default=False, db_default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "simulation_attempts_v2"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=AttemptStatus.values), name="simulation_attempts_v2_status_check"),
        ]
        indexes = [
            models.Index(fields=["student", "status"], name="idx_attempts_student_status"),
        ]


class AttemptEvent(models.Model):
    attempt = models.ForeignKey(
        SimulationAttempt, on_delete=models.DB_CASCADE, related_name="events", db_column="attempt_id"
    )
    event_type = models.CharField(max_length=50)
    node = models.ForeignKey(
        SimulationNode, on_delete=models.DO_NOTHING, null=True, blank=True, db_column="node_id"
    )
    decision_option = models.ForeignKey(
        DecisionOption, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="decision_option_id",
    )
    score_delta = models.IntegerField(default=0, db_default=0)
    stress_delta = models.IntegerField(default=0, db_default=0)
    detail = models.TextField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "attempt_events"
        indexes = [
            models.Index(fields=["attempt", "occurred_at"], name="idx_attempt_events_att_time"),
        ]
        ordering = ["occurred_at", "id"]


class ReflectionJournal(models.Model):
    attempt = models.ForeignKey(
        SimulationAttempt, on_delete=models.DB_CASCADE, related_name="reflections",
        db_column="attempt_id",
    )
    node = models.ForeignKey(SimulationNode, on_delete=models.DO_NOTHING, db_column="node_id")
    encrypted_text = models.TextField()
    encryption_key_ref = models.CharField(max_length=255)
    locked = models.BooleanField(default=False, db_default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reflection_journals"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "node"], name="reflection_journals_attempt_id_node_id_key"),
        ]


class AttemptWorldState(models.Model):
    attempt = models.OneToOneField(
        SimulationAttempt, on_delete=models.DB_CASCADE, primary_key=True,
        db_column="attempt_id", related_name="world_state",
    )
    scene_map = models.ForeignKey(
        "simulation.SceneMap", on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="scene_map_id",
    )
    player_x = models.IntegerField(default=0, db_default=0)
    player_y = models.IntegerField(default=0, db_default=0)
    inventory_json = models.TextField(default="[]", db_default="[]")
    inspected_object_keys_json = models.TextField(default="[]", db_default="[]")
    viewed_dialogue_keys_json = models.TextField(default="[]", db_default="[]")
    used_tool_keys_json = models.TextField(default="[]", db_default="[]")
    flags_json = models.TextField(default="{}", db_default="{}")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "attempt_world_states"
