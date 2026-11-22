from rest_framework import serializers


class StartAttemptRequest(serializers.Serializer):
    caseVersionId = serializers.IntegerField()
    forceNew = serializers.BooleanField(required=False, default=False)
    # Pasada final (DP-26): el intento que la persona vio y aceptó perder. Opcional y solo con ``forceNew``: si el abierto
    # ya no es ese (otra pestaña lo reemplazó), 409 ``ATTEMPT_CHANGED`` y no se reemplaza nada. Sin él, lo de siempre.
    expectedAttemptId = serializers.UUIDField(required=False, allow_null=True)
    # Reservado (C1): iniciar ya es idempotente por el índice único del intento abierto; se valida
    # el formato para que un cliente que lo envíe no reciba un 500 cuando se use.
    requestId = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)


def _request_id_field():
    """Idempotencia (E1-3): clave opcional de la orden; el formato lo valida ``normalize_request_id``."""
    return serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)


class SelectDecisionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    decisionOptionId = serializers.IntegerField()
    requestId = _request_id_field()
    evidenceOverride = serializers.BooleanField(required=False, default=False)
    missingEvidence = serializers.ListField(
        child=serializers.CharField(max_length=160),
        required=False,
        default=list,
        max_length=8,
    )


#: Tope de la bitácora reflexiva (S2-6b, SF-22): el cliente no tiene uno, así que el servidor pone 5000 caracteres.
TEXTO_BITACORA_MAX = 5000


class ReflectionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    nodeId = serializers.IntegerField()
    text = serializers.CharField(allow_blank=True, trim_whitespace=False, max_length=TEXTO_BITACORA_MAX)
    requestId = _request_id_field()


class SafeExitRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class ResumeAttemptRequest(serializers.Serializer):
    attemptToken = serializers.CharField()


class ReplaceAttemptRequest(serializers.Serializer):
    """Reemplazo por acción docente (E1-2): el motivo es obligatorio y queda en el intento."""

    reason = serializers.CharField(max_length=500)
