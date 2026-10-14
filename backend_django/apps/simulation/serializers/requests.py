from rest_framework import serializers


class StartAttemptRequest(serializers.Serializer):
    caseVersionId = serializers.IntegerField()
    forceNew = serializers.BooleanField(required=False, default=False)
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


class ReflectionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    nodeId = serializers.IntegerField()
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)
    requestId = _request_id_field()


class SafeExitRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class ResumeAttemptRequest(serializers.Serializer):
    attemptToken = serializers.CharField()


class ReplaceAttemptRequest(serializers.Serializer):
    """Reemplazo por acción docente (E1-2): el motivo es obligatorio y queda en el intento."""

    reason = serializers.CharField(max_length=500)
