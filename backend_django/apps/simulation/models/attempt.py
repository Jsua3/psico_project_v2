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


#: Estados de un intento abierto: el «intento activo» del estudiante (se reanuda o se reemplaza).
#: ``lifecycle.OPEN_STATUSES`` los deriva de la tabla de transiciones; una prueba exige que coincidan.
OPEN_ATTEMPT_STATUSES = (AttemptStatus.IN_PROGRESS, AttemptStatus.PAUSED)

#: Eventos de decisión REGISTRADA: los únicos que cuentan en el reporte y en el final. La primera respuesta riesgosa
#: o contraindicada de una escena no se aplica (regla de reintento) y queda como evento ``*_RETRY_REQUIRED``, que se
#: reporta aparte: contarla contradiría lo que el juego le promete a la persona.
REGISTERED_DECISION_EVENT_TYPES = ("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")
RETRY_EVENT_TYPES = ("DECISION_RETRY_REQUIRED", "PROHIBITED_DECISION_RETRY_REQUIRED")


def new_attempt_id():
    """UUID v7 (ordenado en el tiempo: mejor localidad de índice) desde Python 3.14; v4 antes."""
    return uuid.uuid7() if hasattr(uuid, "uuid7") else uuid.uuid4()


class SimulationAttempt(models.Model):
    AttemptStatus = AttemptStatus

    id = models.UUIDField(primary_key=True, default=new_attempt_id, editable=False)
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
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    # Quién y por qué cerró el intento como REPLACED (E1-2): el docente o el ADMIN en la acción
    # docente, el propio estudiante en el ``forceNew`` heredado. Vacíos en cualquier otro estado.
    replaced_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DB_SET_NULL, null=True, blank=True,
        db_column="replaced_by_id", related_name="+",
    )
    replace_reason = models.TextField(null=True, blank=True)
    # Tiempo activo acumulado (E1-5, decisión 14): cada orden que cambia el intento suma
    # ``min(ahora − last_activity_at, 300)``; la pausa no suma. Reemplaza los eventos
    # WORLD_POSITION_UPDATED como fuente del tiempo (ver ``services/attempt_duration``).
    active_seconds = models.FloatField(default=0.0, db_default=0)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    # Ensayo del borrador para la docente (bloque A2): un intento de juego que no cuenta como intento de estudiante.
    is_rehearsal = models.BooleanField(default=False, db_default=False)

    class Meta:
        db_table = "simulation_attempts_v2"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=AttemptStatus.values), name="simulation_attempts_v2_status_check"),
            # DM-5.4: un intento abierto por estudiante y caso. Última defensa de la política de
            # inicio (E1-1): dos POST simultáneos no pueden crear dos intentos abiertos.
            models.UniqueConstraint(
                fields=["student", "case_version"],
                condition=models.Q(status__in=OPEN_ATTEMPT_STATUSES, is_rehearsal=False),
                name="uq_attempts_open_per_student_case",
            ),
            # Un ensayo abierto por autor y versión: dos pestañas no pueden abrir dos ensayos a la vez.
            models.UniqueConstraint(
                fields=["student", "case_version"],
                condition=models.Q(status__in=OPEN_ATTEMPT_STATUSES, is_rehearsal=True),
                name="uq_rehearsal_open_per_author_case",
            ),
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
    detail = models.TextField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    # Idempotencia (E1-3): el ``requestId`` que el cliente puso a la orden, en el evento primario de
    # esa orden. Único por intento: la misma orden dos veces deja un solo evento. NULL = sin clave.
    request_id = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        db_table = "attempt_events"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "request_id"], name="uq_attempt_events_attempt_request"),
        ]
        indexes = [
            models.Index(fields=["attempt", "occurred_at"], name="idx_attempt_events_att_time"),
        ]
        ordering = ["occurred_at", "id"]


class AttemptHintView(models.Model):
    """Una pista que el estudiante ya pidió en un intento (E3-5, C9); única por intento y pista."""

    attempt = models.ForeignKey(
        SimulationAttempt, on_delete=models.DB_CASCADE, related_name="hint_views",
        db_column="attempt_id",
    )
    hint = models.ForeignKey(
        "simulation.SceneHint", on_delete=models.DB_CASCADE, related_name="views", db_column="hint_id",
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "attempt_hint_views"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "hint"], name="uq_attempt_hint_views_attempt_hint"),
        ]


class AttemptReport(models.Model):
    """El reporte del intento, congelado al completarse (E1-8, RF-22, CU-12, TD-08, N2).

    Se escribe una sola vez, dentro de la transacción que completa el intento, y no se
    vuelve a guardar: lo que la persona vio al cerrar no cambia cuando después cambian las
    reglas o los textos del caso (Review Focus 5). ``report_json`` es un superconjunto del
    reporte de cierre de siempre (más ``decisionReview[]``, el ordinal y el tiempo por escena);
    ``definition_hash`` es la huella de la definición del caso con la que se cerró y
    ``attempt_ordinal`` el n.º de intento del estudiante en el caso (RQ-NEG-001/003).
    """

    attempt = models.OneToOneField(
        SimulationAttempt, on_delete=models.DB_CASCADE, related_name="report", db_column="attempt_id",
    )
    report_json = models.TextField()
    report_schema_version = models.IntegerField(default=1, db_default=1)
    definition_hash = models.CharField(max_length=64)
    attempt_ordinal = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "attempt_reports"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RuntimeError("attempt_reports es inmutable: un reporte cerrado no se vuelve a guardar")
        super().save(*args, **kwargs)


class AttemptFeedback(models.Model):
    """La encuesta breve opcional de un intento completado (E6-3, RQ-NEG-004; contrato C14).

    Una respuesta por intento: ``rating`` de 1 a 5 y un comentario opcional de texto plano. Solo existe si Psicología
    aprueba la encuesta (``ATTEMPT_FEEDBACK_SURVEY``); el comentario es del estudiante y no viaja al reporte, a la
    auditoría ni a la analítica (solo la calificación se agrega, con celda mínima).
    """

    attempt = models.OneToOneField(
        SimulationAttempt, on_delete=models.DB_CASCADE, related_name="survey_response", db_column="attempt_id",
    )
    rating = models.SmallIntegerField()
    comment = models.TextField(default="", db_default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "attempt_feedback"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1, rating__lte=5), name="attempt_feedback_rating_check",
            ),
        ]


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
