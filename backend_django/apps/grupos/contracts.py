"""Formas documentadas de las respuestas de asignaciones y de acceso (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``apps/simulation/tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint.
"""
from rest_framework import serializers

from .access import REASONS as ACCESS_REASONS

ASSIGNMENT_STATES = ("SCHEDULED", "OPEN", "CLOSED")
ASSIGNMENT_TARGETS = ("GROUP", "STUDENT")

#: Las ventanas de asignación viajan con el desfase de Bogotá explícito (a diferencia del resto de fechas de la API).
WINDOW = "ISO 8601 con el desfase de Bogotá (-05:00)."


class AccessDecisionSerializer(serializers.Serializer):
    """La decisión de acceso del estudiante a una versión de caso: si puede empezar y, si no, por qué."""

    allowed = serializers.BooleanField()
    reason = serializers.ChoiceField(choices=ACCESS_REASONS, required=False, help_text="Solo si `allowed` es falso.")
    opensAt = serializers.DateTimeField(required=False, help_text=f"Apertura de la ventana. {WINDOW}")
    closesAt = serializers.DateTimeField(required=False, help_text=f"Cierre de la ventana. {WINDOW}")


class AssignmentTargetSerializer(serializers.Serializer):
    """A quién se asignó el caso: a un grupo o, directamente, a un estudiante."""

    type = serializers.ChoiceField(choices=ASSIGNMENT_TARGETS)
    groupId = serializers.IntegerField(required=False, help_text="Solo si `type` es `GROUP`.")
    studentId = serializers.IntegerField(required=False, help_text="Solo si `type` es `STUDENT`.")


class AssignmentSerializer(serializers.Serializer):
    """Una versión de caso asignada, con su ventana de apertura y cierre (C7)."""

    id = serializers.IntegerField()
    caseVersionId = serializers.IntegerField()
    target = AssignmentTargetSerializer()
    state = serializers.ChoiceField(choices=ASSIGNMENT_STATES, help_text="Dónde está la ventana hoy.")
    active = serializers.BooleanField(help_text="Una asignación en pausa no habilita nada.")
    sortOrder = serializers.IntegerField(help_text="Su lugar en la secuencia de casos.")
    opensAt = serializers.DateTimeField(required=False, help_text=f"Si no hay fecha, no viaja. {WINDOW}")
    closesAt = serializers.DateTimeField(required=False, help_text=f"Si no hay fecha, no viaja. {WINDOW}")
