"""Asistente de IA de autoría (P5) · ``…/cases/{id}/assistant/{status,propose,guide}``.

Montadas en ``/api/authoring/cases`` (canónico) y ``/api/admin/cases`` (alias). Permiso ``case.author`` + propiedad del
caso (403 para un caso ajeno, 404 si la versión no existe) y, para ``propose``/``guide``, que la versión sea un borrador.
Apagado (``AI_AUTHORING_ENABLED``) las tres rutas son un 404 y no tocan al proveedor.

El cupo se reserva ANTES de llamar al proveedor y se devuelve si éste falla (502). Al cliente solo le llegan los
mensajes fijos de abajo: ni la clave ni el texto del proveedor salen del servidor (al registro va solo el ``kind``).
La auditoría guarda pantalla, modelo, recuento de cambios, duración y resultado: nunca el texto de la petición ni de
la respuesta.
"""
import logging
import re
import time

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound

from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.response import api_ok

from ..serializers.contracts import AssistantResultSerializer, AssistantStatusSerializer
from ..services import audit_service
from ..services.ai_providers import ProviderError
from ..services.authoring import guards
from ..services.authoring.assistant import config as assistant_config
from ..services.authoring.assistant import guide, limits, proposals
from ..services.authoring.assistant.proposals import InvalidProposal
from .authoring_views import _AuthoringView

logger = logging.getLogger(__name__)

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
PROVIDER_ERROR_MESSAGE = "La IA no respondió. Inténtalo de nuevo en un momento."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
REFUSED_MESSAGE = "La IA no puede ayudar con esa petición. Prueba a pedirla de otra forma."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
INVALID_PROPOSAL_MESSAGE = "La propuesta no se pudo usar. Pídela de nuevo con otras palabras."
MAX_REQUEST_LENGTH = 400

_UNSAFE_SCREEN_CHARS = re.compile(r"[^a-z0-9_-]")
MAX_SCREEN_LENGTH = 64


def normalize_screen(raw) -> str:
    """La pantalla como una palabra segura para la auditoría: minúsculas, ``[a-z0-9_-]``, a lo más 64."""
    return _UNSAFE_SCREEN_CHARS.sub("", str(raw).lower())[:MAX_SCREEN_LENGTH]


class _Text(serializers.CharField):
    """Un texto de verdad: DRF acepta un número como cadena, y aquí un ``3`` no es una petición."""

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class _ProposeInput(serializers.Serializer):
    peticion = _Text(max_length=MAX_REQUEST_LENGTH)
    pantalla = _Text(allow_blank=True)
    seleccion = serializers.JSONField(required=False, allow_null=True)

    def validate_pantalla(self, value):
        screen = normalize_screen(value)
        if not screen:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise serializers.ValidationError("Indica la pantalla del editor.")
        return screen


class _GuideInput(serializers.Serializer):
    pregunta = _Text()
    acciones = serializers.ListField(child=serializers.JSONField())


class _AssistantView(_AuthoringView):
    """Base: propiedad del caso (403/404) y luego el apagado (404)."""

    def gate(self, request, case_version_id):
        """La versión y la configuración si el actor es el autor y el asistente está encendido.

        La propiedad va primero: un caso ajeno es 403 con la bandera como esté, así la ruta no deja
        adivinar si el asistente existe a quien no es su autor.
        """
        version = self.version_for(request, case_version_id, mutate=True)
        config = assistant_config.current()
        if not config.enabled:
            # Mismo texto que el asistente del estudiante.
            raise NotFound("El asistente no está disponible")
        return version, config

    def run(self, request, case_version_id, *, action, input_class, call, default_model):
        """Valida el cuerpo, reserva el cupo, llama al proveedor (``call``) y audita."""
        version, config = self.gate(request, case_version_id)
        body = input_class(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            guards.ensure_draft(version.id, revision_exempt=True)
        limits.consume(request.user)  # 429 sin fila de auditoría

        started = time.monotonic()
        model, changes = default_model(config), 0
        try:
            result = call(config, version, body.validated_data)
        except ProviderError as error:
            logger.warning("Asistente de autoría: fallo del proveedor (kind=%s)", error.kind)
            if error.kind == "refusal":
                outcome = "refusal"
                failure = ApiError("AI_REFUSED", REFUSED_MESSAGE, status.HTTP_422_UNPROCESSABLE_ENTITY)
            else:
                limits.refund(request.user)
                outcome = "error"
                failure = ApiError("AI_PROVIDER_ERROR", PROVIDER_ERROR_MESSAGE, status.HTTP_502_BAD_GATEWAY)
            self.audit(request, action, version.id, body, model, 0, started, outcome)
            raise failure from None
        except InvalidProposal as invalid:
            # La llamada ocurrió: el cupo se gasta. Al cliente solo le llega el motivo fijo, nunca texto del modelo.
            self.audit(request, action, version.id, body, model, 0, started, "invalid")
            raise ApiError(
                "AI_PROPOSAL_INVALID", INVALID_PROPOSAL_MESSAGE, status.HTTP_422_UNPROCESSABLE_ENTITY, motivo=invalid.motivo
            ) from None
        except Exception:
            limits.refund(request.user)
            raise
        if isinstance(result.get("model"), str) and audit_service._VALOR_SEGURO.fullmatch(result["model"]):
            model = result["model"]
        if isinstance(result.get("changes"), int) and not isinstance(result["changes"], bool):
            changes = result["changes"]
        self.audit(request, action, version.id, body, model, changes, started, "ok")
        return api_ok(result)

    @staticmethod
    def audit(request, action, case_version_id, body, model, changes, started, outcome):
        """Una fila de auditoría sin el texto de la petición ni el de la respuesta."""
        context = {
            "model": model,
            "changes": changes,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "outcome": outcome,
        }
        screen = body.validated_data.get("pantalla")
        if screen:
            context["screen"] = screen
        audit_service.record(action, "CASE_VERSION", case_version_id, context, actor=request.user)


class AssistantStatusView(_AssistantView):
    """``GET …/assistant/status``: si el asistente está listo y cuánto le queda hoy a quien lo usa."""

    @extend_schema(responses={200: envelope_of(AssistantStatusSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        _, config = self.gate(request, case_version_id)
        connected = bool(config.api_key)
        return api_ok(
            {
                "enabled": connected,
                "remainingToday": limits.remaining_today(request.user, config),
                "mode": "connected" if connected else "disabled",
            }
        )


class AssistantProposeView(_AssistantView):
    """``POST …/assistant/propose``: una propuesta de cambios para la pantalla del editor."""

    @extend_schema(
        request=_ProposeInput,
        responses={200: envelope_of(AssistantResultSerializer), **error_responses(400, 401, 403, 404, 422, 429, 502)},
    )
    def post(self, request, case_version_id):
        def call(config, version, data):
            return proposals.propose(
                config=config,
                case_version=version,
                request_text=data["peticion"],
                screen=data["pantalla"],
                selection=data.get("seleccion"),
                actor=request.user,
            )

        return self.run(
            request, case_version_id, action="AI_AUTHORING_PROPOSE", input_class=_ProposeInput, call=call,
            default_model=lambda config: config.model_capable,
        )


class AssistantGuideView(_AssistantView):
    """``POST …/assistant/guide``: una respuesta de guía («¿cómo hago X?») según lo que la persona ya hizo."""

    @extend_schema(
        request=_GuideInput,
        responses={200: envelope_of(AssistantResultSerializer), **error_responses(400, 401, 403, 404)},
    )
    def post(self, request, case_version_id):
        def call(config, version, data):
            return guide.answer(config=config, question=data["pregunta"], actions=data["acciones"])

        return self.run(
            request, case_version_id, action="AI_AUTHORING_GUIDE", input_class=_GuideInput, call=call,
            default_model=lambda config: config.model_fast,
        )
