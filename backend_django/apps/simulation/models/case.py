"""Simulation core models.

Note: support_resources_json / required_tools_json are TEXT columns holding
JSON strings (not jsonb), so they are TextField and parsed in serializers.
"""
from django.conf import settings
from django.db import models


class CaseVersionStatus(models.TextChoices):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class ReviewDecision(models.TextChoices):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ReviewReason(models.TextChoices):
    """Por qué una revisión devuelve el caso a borrador: de forma o de contenido (consejo §9.1-B)."""

    FORMA = "FORMA"
    CONTENIDO = "CONTENIDO"


class DecisionClassification(models.TextChoices):
    ADEQUATE = "ADEQUATE"
    RISKY = "RISKY"
    INADEQUATE = "INADEQUATE"


class SimulationCase(models.Model):
    code = models.CharField(max_length=80, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    active = models.BooleanField(default=True, db_default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by",
        related_name="simulation_cases",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "simulation_cases"

    def __str__(self):
        return self.code


class CaseVersion(models.Model):
    simulation_case = models.ForeignKey(
        SimulationCase, on_delete=models.DB_CASCADE, related_name="versions",
        db_column="simulation_case_id",
    )
    semantic_version = models.CharField(max_length=32)
    status = models.CharField(
        max_length=24, choices=CaseVersionStatus.choices, default=CaseVersionStatus.DRAFT
    )
    narrative_context = models.TextField(blank=True, null=True)
    # Los objetivos de aprendizaje del caso (E3-4, RF-16): una lista de textos planos en JSON
    # (como los demás ``*_json``). Los redacta Psicología; ``[]`` = el caso aún no los tiene.
    learning_objectives = models.TextField(default="[]", db_default="[]")
    cloned_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.DO_NOTHING, db_column="cloned_from_id"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by",
        related_name="created_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Optimistic-lock column (Spring @Version) + world schema version.
    version = models.BigIntegerField(default=0, db_default=0)
    world_schema_version = models.IntegerField(default=1, db_default=1)
    # Reglas de la versión (JSON en TEXT, como los demás): ``secondChance`` (¿se concede una
    # segunda oportunidad ante una primera respuesta riesgosa o inadecuada?) y ``feedbackTiming``
    # (``IMMEDIATE`` | ``AT_CLOSE``). Ausente = segunda oportunidad apagada (ED-7). Ver
    # ``services/case_rules.py``.
    rules = models.TextField(default="{}", db_default="{}")
    # E2 (revisión de fase, R15): quién editó por última vez y desde qué revisión lo hace en
    # solitario. Una revisión vencida de la MISMA persona (otra pestaña, un guardado cuya respuesta
    # se canceló) no es un conflicto mientras nadie más haya editado después
    # (``authoring.guards.check_revision``). Un clon empieza sin historial.
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DB_SET_NULL, null=True, blank=True,
        db_column="last_edited_by", related_name="+",
    )
    edited_alone_since = models.BigIntegerField(default=0, db_default=0)

    class Meta:
        db_table = "case_versions"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=CaseVersionStatus.values), name="case_versions_status_check"),
            models.UniqueConstraint(fields=["simulation_case", "semantic_version"], name="case_versions_simulation_case_id_semantic_version_key"),
        ]
        indexes = [
            models.Index(fields=["simulation_case", "status"], name="idx_case_versions_case_status"),
        ]

    def __str__(self):
        return f"{self.simulation_case.code} v{self.semantic_version}"


class CaseReview(models.Model):
    """Una revisión de una versión del caso (E2-5): quién la pidió y quién la decidió.

    Mientras ``decision`` es nulo la revisión está **pendiente** (la versión está en
    ``IN_REVIEW``); solo puede haber una pendiente por versión. La constancia de revisión de
    contenido de Psicología (revisor, fecha y referencia o acta) se registra al aprobar y es
    obligatoria con ``REVIEW_WORKFLOW_STRICT`` (R5 del plan E2).
    """

    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="reviews", db_column="case_version_id"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="requested_by",
        related_name="case_reviews_requested",
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="decided_by", related_name="case_reviews_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision = models.CharField(max_length=10, choices=ReviewDecision.choices, null=True, blank=True)
    reason = models.CharField(max_length=10, choices=ReviewReason.choices, null=True, blank=True)
    note = models.TextField(blank=True, default="", db_default="")
    content_reviewer = models.CharField(max_length=255, null=True, blank=True)
    content_reviewed_on = models.DateField(null=True, blank=True)
    content_reference = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "case_reviews"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(decision__isnull=True) | models.Q(decision__in=ReviewDecision.values),
                name="case_reviews_decision_check",
            ),
            models.CheckConstraint(
                condition=models.Q(reason__isnull=True) | models.Q(reason__in=ReviewReason.values),
                name="case_reviews_reason_check",
            ),
            models.CheckConstraint(
                condition=~models.Q(decision=ReviewDecision.REJECTED) | models.Q(reason__isnull=False),
                name="case_reviews_rejection_has_reason_check",
            ),
            models.UniqueConstraint(
                fields=["case_version"],
                condition=models.Q(decision__isnull=True),
                name="uq_case_reviews_one_pending",
            ),
        ]
        indexes = [
            models.Index(fields=["case_version", "requested_at"], name="idx_case_reviews_version"),
        ]

    def __str__(self):
        return f"revisión {self.pk} de la versión {self.case_version_id} ({self.decision or 'PENDIENTE'})"


class SimulationNode(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="nodes", db_column="case_version_id"
    )
    node_key = models.CharField(max_length=120)
    title = models.CharField(max_length=255)
    narrative = models.TextField()
    support_resources_json = models.TextField(default="[]", db_default="[]")
    required_tools_json = models.TextField(default="[]", db_default="[]")
    sensitive_content = models.BooleanField(default=False, db_default=False)
    safe_exit_required = models.BooleanField(default=False, db_default=False)
    warning_message = models.TextField(blank=True, null=True)
    start_node = models.BooleanField(default=False, db_default=False)
    terminal_node = models.BooleanField(default=False, db_default=False)
    position_x = models.IntegerField(null=True, blank=True, default=0)
    position_y = models.IntegerField(null=True, blank=True, default=0)

    class Meta:
        db_table = "simulation_nodes"
        constraints = [
            models.UniqueConstraint(fields=["case_version", "node_key"], name="simulation_nodes_case_version_id_node_key_key"),
        ]

    def __str__(self):
        return self.node_key


class DecisionOption(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="decisions", db_column="case_version_id"
    )
    option_key = models.CharField(max_length=120)
    source_node = models.ForeignKey(
        SimulationNode, on_delete=models.DB_CASCADE, related_name="options", db_column="source_node_id"
    )
    target_node = models.ForeignKey(
        SimulationNode, on_delete=models.DB_CASCADE, related_name="incoming_options",
        db_column="target_node_id",
    )
    text = models.TextField()
    classification = models.CharField(max_length=24, choices=DecisionClassification.choices)
    score_delta = models.IntegerField(default=0, db_default=0)
    stress_delta = models.IntegerField(default=0, db_default=0)
    prohibited_penalty = models.IntegerField(default=0, db_default=0)
    immediate_feedback = models.TextField(default="")
    prohibited_conduct = models.BooleanField(default=False, db_default=False)
    prohibition_reason = models.TextField(blank=True, null=True)
    # Consecuencia narrativa (lo que se ve al elegir) frente a retroalimentación pedagógica (lo
    # que se explica al cierre, con su fundamento): decisiones 6 y 10, RN-08 (E1-7). Vacíos: la
    # consecuencia cae a la narrativa del nodo destino y la explicación a ``immediate_feedback``.
    consequence_text = models.TextField(blank=True, null=True)
    theory_basis = models.TextField(blank=True, null=True)
    feedback_text = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "decision_options"
        constraints = [
            models.CheckConstraint(condition=models.Q(classification__in=DecisionClassification.values), name="decision_options_classification_check"),
            models.UniqueConstraint(fields=["case_version", "option_key"], name="decision_options_case_version_id_option_key_key"),
        ]

    def __str__(self):
        return self.option_key
