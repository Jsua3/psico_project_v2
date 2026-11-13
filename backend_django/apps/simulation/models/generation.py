"""C1 · Generación del caso completo por etapas con IA: una fila por intento de una docente.

El ciclo de vida (qué transiciones admite cada estado) vive en
``services/authoring/generation/lifecycle.py``, que es Python puro y repite los valores de ``GenerationStatus`` como
cadenas; una prueba (``test_generation_lifecycle``) vigila que no se separen.
"""
import uuid

from django.conf import settings
from django.db import models

from .case import CaseVersion


class GenerationStatus(models.TextChoices):
    CREATED = "created"
    SKELETON_READY = "skeleton_ready"
    SCENES_READY = "scenes_ready"
    NEEDS_REPAIR = "needs_repair"
    IMPORTED = "imported"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Los estados no terminales: una docente tiene a lo sumo una generación en alguno de ellos.
GenerationStatus.IN_PROGRESS = (
    GenerationStatus.CREATED, GenerationStatus.SKELETON_READY, GenerationStatus.SCENES_READY,
    GenerationStatus.NEEDS_REPAIR,
)


class CaseGeneration(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DB_CASCADE, db_column="owner_id", related_name="case_generations",
    )
    lugar_id = models.CharField(max_length=64)
    description = models.TextField()
    status = models.CharField(
        max_length=20, choices=GenerationStatus.choices, default=GenerationStatus.CREATED,
        db_default=GenerationStatus.CREATED,
    )
    skeleton_json = models.TextField(default="{}", db_default="{}")
    # {clave: {"state", "data", "error", "started_at"}}
    scenes_json = models.TextField(default="{}", db_default="{}")
    skeleton_started_at = models.DateTimeField(null=True)
    repair_rounds = models.PositiveSmallIntegerField(default=0, db_default=0)
    repair_json = models.TextField(default="{}", db_default="{}")
    report_json = models.TextField(default="[]", db_default="[]")
    document_json = models.TextField(default="", db_default="")  # solo con ``failed``
    last_error_json = models.TextField(default="{}", db_default="{}")
    calls = models.PositiveSmallIntegerField(default=0, db_default=0)
    tokens_in = models.PositiveIntegerField(default=0, db_default=0)
    tokens_out = models.PositiveIntegerField(default=0, db_default=0)
    # Variante de base de datos: CaseVersion ya la usa y Django (E323/E050) no admite mezclar con SET_NULL/CASCADE.
    case_version = models.ForeignKey(
        CaseVersion, null=True, on_delete=models.DB_SET_NULL, db_column="case_version_id", related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "authoring_generations"
        constraints = [
            models.UniqueConstraint(
                fields=["owner"], condition=models.Q(status__in=GenerationStatus.IN_PROGRESS),
                name="uq_generation_in_progress_per_owner",
            ),
        ]
        indexes = [models.Index(fields=["owner", "created_at"], name="idx_generation_owner_created")]
