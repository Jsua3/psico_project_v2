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
