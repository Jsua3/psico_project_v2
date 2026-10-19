"""Formas documentadas de las respuestas de reportes (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``apps/simulation/tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint.
"""
from rest_framework import serializers

from apps.simulation.models import AttemptStatus
from apps.simulation.serializers.contracts import LOCAL_TIME, PageCoverageSerializer


class ReportStudentSerializer(serializers.Serializer):
    """El estudiante del reporte. `ref` es `Estudiante-<id>` (su id numérico) y NO el alias `Estudiante-<hash>` que la
    revisión docente muestra en `studentAlias`: los dos no se pueden cruzar."""

    ref = serializers.CharField()
    displayName = serializers.CharField()


class ReportAttemptSerializer(serializers.Serializer):
    """Un intento del estudiante con sus tiempos y su n.º de intento en el caso."""

    attemptId = serializers.UUIDField()
    caseVersionId = serializers.IntegerField()
    caseTitle = serializers.CharField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    startedAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    activeSeconds = serializers.IntegerField(help_text="Tiempo de juego real: lo que el estudiante estuvo en el caso.")
    clockSeconds = serializers.IntegerField(
        allow_null=True, help_text="De reloj, entre el inicio y el cierre; nulo mientras el intento está abierto."
    )
    ordinal = serializers.IntegerField(help_text="El n.º de intento del estudiante en el CASO (todas sus versiones).")


class StudentReportSerializer(serializers.Serializer):
    """El reporte de un estudiante para su docente (C3): los intentos más recientes y cuántos hay en total."""

    student = ReportStudentSerializer()
    attempts = ReportAttemptSerializer(many=True)
    coverage = PageCoverageSerializer(help_text="«Mostrando `shown` de `total`»: los intentos que trae y los que hay.")
