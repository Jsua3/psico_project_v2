"""Formas documentadas de las respuestas de reportes: la analítica de aprendizaje (E6-2b, contrato C13) y el reporte de un
estudiante (E5-9, contrato C3).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. La prueba
``apps/simulation/tests/test_openapi_matches_responses.py`` las compara con la respuesta real, clave por clave.

La analítica es un AGREGADO con celda mínima (un bloque con menos de ``minCellSize`` estudiantes se omite) y todas sus
definiciones son BORRADOR hasta que Psicología las confirme: ver ``docs/operacion/analitica-de-aprendizaje.md``. El «índice»
es la escala interna 1–4 (EN_INICIO 1, EN_PROCESO 2, LOGRADO 3, DESTACADO 4): NO es una nota (RN-09).
"""
from rest_framework import serializers

from apps.simulation.assessment.definitions import DEFINITIONS_STATUS, REFLECTION_DEFINITIONS
from apps.simulation.models import AttemptStatus, FormativeLevel
from apps.simulation.serializers.contracts import LOCAL_TIME, PageCoverageSerializer

#: Los nombres de los niveles formativos, tal cual (valor = etiqueta): así ``drf-spectacular`` los reconoce como un solo enum.
FORMATIVE_LEVELS = tuple(FormativeLevel.values)
PERCENT = "Porcentaje de 0 a 100, con un decimal."
DELTA = "Cambio en porcentaje (puede ser negativo), con un decimal."
INDEX = "Índice interno de 1 a 4 (no es una nota), con dos decimales."


class AnalyticsCohortSerializer(serializers.Serializer):
    """Quién aporta datos. Con `suppressed` verdadero solo viajan este bloque y `definitions`."""

    students = serializers.IntegerField(help_text="Estudiantes distintos con al menos un intento completado en el alcance.")
    attempts = serializers.IntegerField(help_text="Intentos completados en el alcance.")
    suppressed = serializers.BooleanField(help_text="Verdadero si hay menos estudiantes que la celda mínima.")


class AnalyticsImprovementSerializer(serializers.Serializer):
    """RQ-NEG-001 · primer frente al último intento de cada serie (estudiante, caso) con al menos dos intentos."""

    students = serializers.IntegerField()
    series = serializers.IntegerField()
    pre = serializers.FloatField(help_text=f"Media del índice del primer intento. {INDEX}")
    post = serializers.FloatField(help_text=f"Media del índice del último intento. {INDEX}")
    deltaPct = serializers.FloatField(help_text=f"Mejora como porcentaje del recorrido posible (3 puntos). {DELTA}")


class AnalyticsFirstVsSecondSerializer(serializers.Serializer):
    """RQ-NEG-003 · decisiones no recomendadas del primer frente al segundo intento (se omite si el primero no tuvo)."""

    students = serializers.IntegerField()
    series = serializers.IntegerField()
    firstMean = serializers.FloatField(help_text="Media de no recomendadas del primer intento, con dos decimales.")
    secondMean = serializers.FloatField(help_text="Media de no recomendadas del segundo intento, con dos decimales.")
    nonRecommendedDeltaPct = serializers.FloatField(help_text=f"Cambio de la media. {DELTA}")


class AnalyticsAcceptableSerializer(serializers.Serializer):
    """RQ-NEG-002 · estudiantes con algún intento cuyas competencias con nivel están todas en el nivel aceptable o más."""

    students = serializers.IntegerField(help_text="Estudiantes con al menos un intento con alguna competencia con nivel.")
    achieved = serializers.IntegerField()
    pct = serializers.FloatField(help_text=PERCENT)
    levelThreshold = serializers.ChoiceField(choices=FORMATIVE_LEVELS, help_text="El nivel aceptable con el que se calculó.")


class AnalyticsReflectionSerializer(serializers.Serializer):
    """RQ-NEG-003 · intentos con reflexión, según la definición vigente (los cerrados con otra no se mezclan)."""

    definition = serializers.ChoiceField(choices=REFLECTION_DEFINITIONS)
    attempts = serializers.IntegerField()
    covered = serializers.IntegerField()
    pct = serializers.FloatField(help_text=PERCENT)


class AnalyticsKeyEvidenceSerializer(serializers.Serializer):
    """RQ-NEG-004 · intentos que son evidencia clave de aprendizaje (completados, con reflexión y con perfil)."""

    attempts = serializers.IntegerField()
    keyEvidence = serializers.IntegerField()
    pct = serializers.FloatField(help_text=PERCENT)


class AnalyticsEvaluatedSerializer(serializers.Serializer):
    """RQ-NEG-005 · intentos con evaluación automática completa y con evaluación del docente comentada."""

    attempts = serializers.IntegerField()
    systemPct = serializers.FloatField(help_text=PERCENT)
    commentedPct = serializers.FloatField(help_text=PERCENT)


class AnalyticsSatisfactionSerializer(serializers.Serializer):
    """RQ-NEG-004 · respuestas de la encuesta con 4 o 5 de 5. Solo existe con la encuesta encendida."""

    responses = serializers.IntegerField()
    satisfiedPct = serializers.FloatField(help_text=PERCENT)


class AnalyticsImprovementAfterFeedbackSerializer(serializers.Serializer):
    """RQ-NEG-005 · mejora entre intentos consecutivos cuando se vio la retroalimentación antes del siguiente."""

    students = serializers.IntegerField()
    pairs = serializers.IntegerField()
    deltaPct = serializers.FloatField(help_text=f"Mejora como porcentaje del recorrido posible (3 puntos). {DELTA}")


class AnalyticsDefinitionsSerializer(serializers.Serializer):
    """Con qué reglas se calculó. Mientras `status` sea `BORRADOR` ninguna cifra es oficial."""

    status = serializers.ChoiceField(choices=(DEFINITIONS_STATUS,))
    acceptableLevel = serializers.ChoiceField(choices=FORMATIVE_LEVELS)
    minCell = serializers.IntegerField(help_text="Celda mínima: estudiantes distintos que hacen falta para publicar un bloque.")
    reflectionDefinition = serializers.ChoiceField(choices=REFLECTION_DEFINITIONS)
    profileRules = serializers.CharField(
        help_text="Versión de la regla que convierte decisiones en niveles; solo se cuentan los intentos calculados con ella."
    )


class LearningAnalyticsSerializer(serializers.Serializer):
    """Los agregados de aprendizaje del alcance pedido. Cada bloque falta si no alcanza la celda mínima."""

    cohort = AnalyticsCohortSerializer()
    improvement = AnalyticsImprovementSerializer(required=False)
    firstVsSecond = AnalyticsFirstVsSecondSerializer(required=False)
    acceptable = AnalyticsAcceptableSerializer(required=False)
    reflectionCoverage = AnalyticsReflectionSerializer(required=False)
    keyEvidence = AnalyticsKeyEvidenceSerializer(required=False)
    evaluated = AnalyticsEvaluatedSerializer(required=False)
    satisfaction = AnalyticsSatisfactionSerializer(required=False)
    improvementAfterFeedback = AnalyticsImprovementAfterFeedbackSerializer(required=False)
    definitions = AnalyticsDefinitionsSerializer()


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
