"""Serializadores de entrada de la autoría (E2-6, R13 del plan de fase E2).

Un campo obligatorio ausente deja de ser un 500 de la base de datos: es un 400 que nombra el
campo (``field``). Se conserva la semántica de siempre:

- **«Ausente = no tocar»**: un campo opcional que no viene no aparece en ``validated_data``
  (``requiredTools``, ``supportResources``, los textos de consecuencia), así que
  ``"requiredTools" in request`` sigue distinguiendo «lista vacía» de «no la mandó».
- **Números permisivos**: ``LenientIntegerField`` trunca un decimal (el editor visual puede
  mandar ``10.5``), como hacía ``coerce_int``.
- **Mensajes de negocio intactos**: la clasificación inválida y los nodos inexistentes los
  sigue resolviendo el servicio con su mensaje y su estado (404/400) de siempre.
"""
import math

from rest_framework import serializers

from apps.simulation.models.world import MAP_OBJECT_TYPES
from shared.jsonutils import INT4_MAX, INT4_MIN


class LenientIntegerField(serializers.IntegerField):
    """Entero que acepta un decimal truncándolo (``coerce_int``) en vez de rechazarlo."""

    def to_internal_value(self, data):
        if isinstance(data, float) and math.isfinite(data):
            return int(data)
        return super().to_internal_value(data)


def _text(max_length=None, **kwargs):
    kwargs.setdefault("required", False)
    kwargs.setdefault("allow_null", True)
    kwargs.setdefault("allow_blank", True)
    return serializers.CharField(max_length=max_length, trim_whitespace=False, **kwargs)


def _flag():
    return serializers.BooleanField(required=False, allow_null=True)


def _number(**kwargs):
    kwargs.setdefault("required", False)
    kwargs.setdefault("allow_null", True)
    return LenientIntegerField(**kwargs)


def _columna(**kwargs):
    """Un entero que se guarda en una columna int4 (S2-6b): fuera de su rango, un 400 que nombra el campo."""
    kwargs.setdefault("required", False)
    kwargs.setdefault("allow_null", True)
    return LenientIntegerField(min_value=INT4_MIN, max_value=INT4_MAX, **kwargs)


class LifecycleRequest(serializers.Serializer):
    """``POST …/lifecycle``: la acción y lo que cada una lleva (``revision`` va aparte)."""

    action = serializers.ChoiceField(choices=["submit", "approve", "reject", "archive", "clone"])
    note = _text(4000)
    reason = _text(20)
    scope = serializers.ChoiceField(choices=["version", "case"], required=False, allow_null=True)
    contentReview = serializers.DictField(required=False, allow_null=True)


class PublishRequest(serializers.Serializer):
    """``POST …/publish`` (alias de aprobar): nota y constancia opcionales."""

    note = _text(4000)
    contentReview = serializers.DictField(required=False, allow_null=True)


class NodeRequest(serializers.Serializer):
    nodeKey = serializers.CharField(max_length=120)
    title = serializers.CharField(max_length=255)
    narrative = serializers.CharField(allow_blank=True, trim_whitespace=False)
    requiredTools = serializers.ListField(
        child=serializers.CharField(max_length=500), required=False, allow_null=True
    )
    supportResources = serializers.ListField(
        child=serializers.CharField(max_length=500), required=False, allow_null=True
    )
    sensitiveContent = _flag()
    safeExitRequired = _flag()
    warningMessage = _text()
    terminal = _flag()
    startNode = _flag()
    positionX = _columna()
    positionY = _columna()
    # El servicio lo valida (plano y con tope) y lo nombra en el 400; ausente = no tocar (E3-6).
    decisionPrompt = _text()


class NodeReorderRequest(serializers.Serializer):
    """``PATCH …/nodes/reorder``: los ids de todos los nodos, en el orden pedido (E3-6)."""

    order = serializers.ListField(child=LenientIntegerField())


class DecisionRequest(serializers.Serializer):
    sourceNodeId = LenientIntegerField()
    targetNodeId = LenientIntegerField()
    optionKey = _text(120)
    text = serializers.CharField(trim_whitespace=False)
    # La clasificación la valida el servicio (mensaje y estado de siempre: «Clasificación inválida: X»).
    classification = serializers.CharField(max_length=40)
    prohibitedConduct = _flag()
    prohibitionReason = _text()
    scoreDelta = _columna()
    stressDelta = _columna()
    prohibitedPenalty = _columna()
    immediateFeedback = _text()
    consequenceText = _text()
    theoryBasis = _text()
    feedbackText = _text()
    # Los efectos de la opción (E3-8): el servicio los valida con su forma y su campo.
    effects = serializers.DictField(required=False, allow_null=True)


class MapRequest(serializers.Serializer):
    """Crear un mapa: el nodo es obligatorio."""

    mapKey = serializers.CharField(max_length=120)
    title = serializers.CharField(max_length=255)
    nodeId = LenientIntegerField()
    width = _columna()
    height = _columna()
    theme = _text(100)
    spawnX = _columna()
    spawnY = _columna()


class MapUpdateRequest(MapRequest):
    """Actualizar un mapa: el nodo es opcional (no se reasigna si no viene)."""

    nodeId = _number()


class ObjectRequest(serializers.Serializer):
    objectKey = serializers.CharField(max_length=120)
    label = serializers.CharField(max_length=255)
    objectType = serializers.ChoiceField(choices=MAP_OBJECT_TYPES)
    x = _columna()
    y = _columna()
    width = _columna()
    height = _columna()
    colorHex = _text(20)
    icon = _text(80)
    shortCode = _text(20)
    collision = _flag()
    visible = _flag()
    interactionPrompt = _text(255, default="")
    interactionText = _text(default="")
    toolCode = _text(80)
    decisionOptionId = _number()
    # «Ausente = no tocar»; ``null`` desvincula el personaje (E3-3).
    characterId = _number()


class DialogueLineRequest(serializers.Serializer):
    displayOrder = _columna()
    speakerName = _text(255)
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)
    emotion = _text(60)


class DialogueRequest(serializers.Serializer):
    treeKey = serializers.CharField(max_length=120)
    speakerName = serializers.CharField(max_length=255)
    portraitKey = _text(120)
    emotion = _text(60)
    mapObjectId = _number()
    lines = serializers.ListField(child=DialogueLineRequest(), required=False, allow_null=True)


class ToolRequest(serializers.Serializer):
    toolCode = serializers.CharField(max_length=80)
    label = serializers.CharField(max_length=255)
    icon = _text(80)
    category = _text(80)
    description = _text(default="")


class CharacterRequest(serializers.Serializer):
    """Un personaje del caso (E3-3); los opcionales ausentes no se tocan."""

    characterKey = serializers.CharField(max_length=120)
    displayName = serializers.CharField(max_length=255)
    roleLabel = _text(255)
    portraitKey = _text(120)
    showInBrief = _flag()
    displayOrder = _columna()


class BriefRequest(serializers.Serializer):
    """La ficha del caso (E3-4): contexto y objetivos; el servicio valida el texto y los topes."""

    context = _text()
    learningObjectives = serializers.ListField(
        child=serializers.CharField(allow_blank=True, trim_whitespace=False),
        required=False, allow_null=True,
    )


class HintRequest(serializers.Serializer):
    """Una pista de escena (E3-5): el texto lo valida el servicio (plano, ≤ 280)."""

    text = serializers.CharField(trim_whitespace=False)
    hintOrder = _columna()


class ChecklistRequest(serializers.Serializer):
    contentOriginal = _flag()
    ethicsReviewed = _flag()
    safetyProtocols = _flag()
    noStigmatizing = _flag()
    triggerWarnings = _flag()
    accessibilityOk = _flag()
    scopeEducational = _flag()


# ─── Guardado del mundo: solo se valida; el servicio lee el cuerpo original ──────────────
class WorldObjectRequest(serializers.Serializer):
    key = serializers.CharField(max_length=120)
    label = serializers.CharField(max_length=255)
    type = serializers.ChoiceField(choices=MAP_OBJECT_TYPES)


class WorldZoneRequest(serializers.Serializer):
    # Una zona sin clave se guarda con la clave vacía (valores mínimos): no se exige.
    key = _text(120)


class WorldDialogueRequest(serializers.Serializer):
    key = _text(120)


class WorldSaveRequest(serializers.Serializer):
    revision = _number()
    map = serializers.DictField(required=False, allow_null=True)
    objects = serializers.ListField(child=WorldObjectRequest(), required=False, allow_null=True)
    collisionZones = serializers.ListField(child=WorldZoneRequest(), required=False, allow_null=True)
    dialogues = serializers.ListField(child=WorldDialogueRequest(), required=False, allow_null=True)
