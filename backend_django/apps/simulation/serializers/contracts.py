"""Formas documentadas de las respuestas de simulación (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint; si un servicio cambia una
clave, esa prueba falla hasta que se corrige aquí, y ``test_openapi_contract`` exige regenerar los tipos de
``frontend/`` (``node scripts/openapi/generate-types.mjs``).

Los nombres de los campos son los del servicio (camelCase), no los de las columnas.
"""
from rest_framework import serializers

from apps.grupos.contracts import AccessDecisionSerializer
from apps.simulation.models import AttemptStatus, CaseVersionStatus
from shared.openapi import ErrorEnvelopeSerializer

ISSUE_SEVERITIES = ("error", "warning")
HINT_REASONS = ("NONE_FOR_SCENE", "ALL_SHOWN")

#: Las fechas de la API son la hora local del servidor, sin desfase (``USE_TZ = False``): un cliente que las
#: reciba debe leerlas como hora de Bogotá, no como UTC.
LOCAL_TIME = "Hora local del servidor (America/Bogota), sin zona horaria."


class PageCoverageSerializer(serializers.Serializer):
    """Cuántos resultados trae la página (`shown`) y cuántos hay en total (`total`)."""

    shown = serializers.IntegerField()
    total = serializers.IntegerField()


# ─── GET /api/admin/audit ─────────────────────────────────────────────────────
class AuditLogItemSerializer(serializers.Serializer):
    """Una fila de la auditoría. Los campos opcionales son nulos en los eventos de sistema (sin actor ni recurso)."""

    id = serializers.IntegerField()
    actorId = serializers.IntegerField(allow_null=True)
    actorRole = serializers.CharField(allow_null=True)
    action = serializers.CharField(help_text="Código tal como se guardó (`entidad.verbo` o el legado).")
    taxonomy = serializers.CharField(help_text="El código canónico `entidad.verbo` de la acción.")
    resourceType = serializers.CharField(allow_null=True)
    resourceId = serializers.CharField(allow_null=True)
    context = serializers.DictField(help_text="Contexto libre de la acción (método, clase, taxonomía…).")
    ipAddress = serializers.CharField(allow_null=True)
    userAgent = serializers.CharField(allow_null=True)
    occurredAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    retentionUntil = serializers.DateTimeField(help_text=f"Hasta cuándo se conserva la fila. {LOCAL_TIME}")


class ReviewQualitySerializer(serializers.Serializer):
    """Devoluciones por CONTENIDO frente a FORMA entre las revisiones decididas (alarma de sello de goma)."""

    decidedReviews = serializers.IntegerField()
    approved = serializers.IntegerField()
    rejectedTotal = serializers.IntegerField()
    rejectedByContent = serializers.IntegerField()
    rejectedByForm = serializers.IntegerField()
    contentRejectionRate = serializers.FloatField(help_text="Devueltas por contenido / decididas (0 a 1).")
    formRejectionRate = serializers.FloatField(help_text="Devueltas por forma / decididas (0 a 1).")
    rubberStampAlarm = serializers.BooleanField()


class AuditListSerializer(serializers.Serializer):
    """Página de auditoría, de la más reciente a la más antigua, con el resumen de calidad de las revisiones."""

    items = AuditLogItemSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = PageCoverageSerializer()
    retentionDays = serializers.IntegerField(help_text="Días que se conserva la auditoría (nunca menos de 360).")
    reviewQuality = ReviewQualitySerializer()


# ─── GET /api/instructor/attempts ─────────────────────────────────────────────
class InstructorAttemptItemSerializer(serializers.Serializer):
    """Un intento en la revisión docente. El estudiante se identifica solo por su alias (nunca por su id)."""

    attemptId = serializers.UUIDField()
    studentAlias = serializers.CharField(help_text="`Estudiante-<hash>`: el mismo en todas las vistas del docente.")
    caseVersionId = serializers.IntegerField()
    caseVersionStatus = serializers.ChoiceField(choices=CaseVersionStatus.choices)
    caseTitle = serializers.CharField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    accumulatedScore = serializers.IntegerField()
    stressIndex = serializers.IntegerField()
    activeSeconds = serializers.IntegerField()
    startedAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    endedAt = serializers.DateTimeField(allow_null=True, help_text=f"Nulo mientras el intento está abierto. {LOCAL_TIME}")


class InstructorAttemptsListSerializer(serializers.Serializer):
    """Página de intentos dentro del alcance del docente, del más reciente al más antiguo."""

    items = InstructorAttemptItemSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = PageCoverageSerializer()


# ─── PATCH /api/simulation/attempts/{attempt_id}/world-state ──────────────────
class WorldPatchAckMapSerializer(serializers.Serializer):
    """La sala en la que quedó guardado el jugador."""

    key = serializers.CharField()


class PlayerPositionSerializer(serializers.Serializer):
    """Posición del jugador en el mapa, en píxeles."""

    x = serializers.IntegerField()
    y = serializers.IntegerField()


class WorldPatchAckSerializer(serializers.Serializer):
    """Acuse de la posición guardada (E5-1): sin releer objetos, diálogos ni herramientas.

    Si la sala del cliente ya no es la actual, la respuesta es el mundo completo: estas mismas claves y además
    `objects`, `collisions`, `tools`, `inventory`… El cliente solo debe leer de aquí `map.key` y `player`.
    """

    attemptId = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    map = WorldPatchAckMapSerializer()
    player = PlayerPositionSerializer()


# ─── POST /api/{admin,authoring}/cases/{id}/validate  (C6) ────────────────────
class ValidationIssueSerializer(serializers.Serializer):
    """Un hallazgo del validador. El mensaje está en lenguaje llano: nombra los elementos por su título, sin ids."""

    code = serializers.CharField(help_text="Estable: `DSL.OCL-02`, `WORLD.OPTION_WITHOUT_TRIGGER`…")
    severity = serializers.ChoiceField(choices=ISSUE_SEVERITIES)
    message = serializers.CharField()
    path = serializers.CharField(
        required=False, help_text="Dónde está en el documento (`DSL.*`); no viaja si el hallazgo es del documento entero."
    )
    nodeId = serializers.IntegerField(required=False, help_text="La escena a la que el editor lleva el foco.")
    mapId = serializers.IntegerField(required=False, help_text="El mapa al que el editor lleva el foco.")


class CaseValidationSerializer(serializers.Serializer):
    """El resultado de validar una versión: sus hallazgos y si puede publicarse."""

    issues = ValidationIssueSerializer(many=True)
    canPublish = serializers.BooleanField(help_text="Falso mientras haya algún error; los avisos no impiden publicar.")


# ─── GET /api/{admin,authoring}/cases/{id}/definition y POST …/cases/import  (C10) ───
class CaseDefinitionSerializer(serializers.Serializer):
    """El documento de una versión (borrador o publicada) con su hash, su sello y su reutilización."""

    definition = serializers.DictField(help_text="El documento del caso: el mismo formato que se exporta y se importa.")
    definitionHash = serializers.CharField(help_text="Hash del documento tal como está ahora (`sha256:<hex>`).")
    sealedHash = serializers.CharField(
        allow_null=True, help_text="El hash que se selló al publicar; nulo en lo que no tiene sello."
    )
    validatedAt = serializers.DateTimeField(allow_null=True, help_text=f"Solo lo sellado la tiene. {LOCAL_TIME}")
    reuseRatio = serializers.FloatField(
        allow_null=True, help_text="Qué parte del caso reutiliza de su versión anterior (0 a 1); solo un clon publicado."
    )


class CaseImportedSerializer(serializers.Serializer):
    """El borrador que creó la importación y los avisos del documento (lo que no se guarda)."""

    caseVersionId = serializers.IntegerField()
    caseId = serializers.IntegerField()
    issues = ValidationIssueSerializer(many=True, help_text="Solo avisos: con algún error no se crea nada.")


class ImportRejectedEnvelopeSerializer(ErrorEnvelopeSerializer):
    """El sobre de error de una importación rechazada (`DSL_INVALID`): lleva los hallazgos en la raíz."""

    issues = ValidationIssueSerializer(many=True)


# ─── GET /api/simulation/cases/{id}/brief  (C8) ───────────────────────────────
class BriefCharacterSerializer(serializers.Serializer):
    """Un personaje que Psicología marcó para la ficha del caso."""

    id = serializers.IntegerField()
    displayName = serializers.CharField()
    roleLabel = serializers.CharField(help_text="Puede venir vacío.")
    portraitKey = serializers.CharField(help_text="Puede venir vacío.")


class CaseBriefSerializer(serializers.Serializer):
    """La ficha del caso: lo que el estudiante lee antes de jugar. No crea intento."""

    caseVersionId = serializers.IntegerField()
    title = serializers.CharField()
    context = serializers.CharField(help_text="Puede venir vacío.")
    characters = BriefCharacterSerializer(many=True)
    learningObjectives = serializers.ListField(child=serializers.CharField())
    hasSensitiveContent = serializers.BooleanField()
    access = AccessDecisionSerializer()


# ─── GET /api/simulation/attempts/{id}/hints  (C9) ────────────────────────────
class ShownHintSerializer(serializers.Serializer):
    """Una pista que el intento ya pidió. El texto de las que no pidió nunca sale."""

    id = serializers.IntegerField()
    order = serializers.IntegerField()
    text = serializers.CharField()


class HintStateSerializer(serializers.Serializer):
    """Las pistas de la escena actual: las que el intento ya pidió y cuántas quedan."""

    available = serializers.IntegerField(help_text="Cuántas quedan por pedir en esta escena.")
    shown = ShownHintSerializer(many=True)
    reason = serializers.ChoiceField(
        choices=HINT_REASONS, required=False, help_text="Solo si no quedan: la escena no tiene o ya se pidieron todas."
    )
