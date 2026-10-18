"""Formas documentadas de las respuestas de simulación (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint; si un servicio cambia una
clave, esa prueba falla hasta que se corrige aquí, y ``test_openapi_contract`` exige regenerar los tipos de
``frontend/`` (``node scripts/openapi/generate-types.mjs``).

Los nombres de los campos son los del servicio (camelCase), no los de las columnas.
"""
from rest_framework import serializers

from apps.simulation.models import AttemptStatus, CaseVersionStatus

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
