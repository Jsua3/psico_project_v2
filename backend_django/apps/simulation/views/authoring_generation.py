"""Generación de un caso por etapas con IA (C1) · ``/api/authoring/generations``.

Las vistas no tienen lógica: leen el cuerpo, llaman al servicio (``services/authoring/generation/service.py``, que valida,
comprueba la propiedad y el apagado y lanza los errores del contrato) y responden en el sobre ``{success, data}``. Permiso
``case.author``; una generación de otra persona es un 404 también para ADMIN.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from ..serializers.contracts import (
    GenerationErrorEnvelopeSerializer,
    GenerationSerializer,
    GenerationStatusSerializer,
)
from ..services.authoring.generation import service

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
REPAIR_MESSAGE = "El parámetro repair solo admite 1."
_STAGE_ERRORS = (404, 409, 422, 429, 502)
_CONFLICT = OpenApiResponse(GenerationErrorEnvelopeSerializer, description="Choca con el estado actual (`GENERATION_STATE`, `GENERATION_BUSY`, `GENERATION_IN_PROGRESS`).")
_LIMIT = OpenApiResponse(GenerationErrorEnvelopeSerializer, description="Se agotó un límite de uso (`AI_LIMIT_EXCEEDED`, `GENERATION_CALLS_EXHAUSTED`).")
_PROVIDER = OpenApiResponse(GenerationErrorEnvelopeSerializer, description="Falló la IA (`AI_PROVIDER_ERROR`; su `kind` dice cómo).")


def _errors(*statuses):
    """Los errores comunes del sobre de error y, para 409, 429 y 502, el sobre con el campo propio de cada motivo."""
    special = {409: _CONFLICT, 429: _LIMIT, 502: _PROVIDER}
    plain = error_responses(*(s for s in statuses if s not in special))
    return {**plain, **{s: special[s] for s in statuses if s in special}}


class GenerationStartBody(serializers.Serializer):
    """Solo describe el cuerpo para el esquema: el servicio valida ``lugarId`` y ``descripcion`` con mensajes fijos."""

    lugarId = serializers.CharField(help_text="El lugar donde pasa el caso.")
    descripcion = serializers.CharField(help_text="Entre 40 y 2000 caracteres, texto plano y sin datos personales.")


class _GenerationView(APIView):
    permission_classes = [policy_permission("case", "author")]


class GenerationStatusView(_GenerationView):
    """``GET …/generations/status``: si está disponible, cuántas le quedan hoy y la generación en curso."""

    @extend_schema(responses={200: envelope_of(GenerationStatusSerializer), **_errors(401, 403)})
    def get(self, request):
        return api_ok(service.status(request.user))


class GenerationListCreateView(_GenerationView):
    """``POST …/generations``: abre una generación (``created``)."""

    @extend_schema(
        request=GenerationStartBody,
        responses={201: envelope_of(GenerationSerializer), **_errors(400, 401, 403, 404, 409, 429)},
    )
    def post(self, request):
        body = request.data if hasattr(request.data, "get") else {}
        return api_ok(service.start(request.user, body.get("lugarId"), body.get("descripcion")), http_status=201)


class GenerationDetailView(_GenerationView):
    """``GET …/generations/{id}`` lee el avance; ``DELETE`` cancela."""

    @extend_schema(responses={200: envelope_of(GenerationSerializer), **_errors(401, 403, 404)})
    def get(self, request, gen_id):
        return api_ok(service.get(request.user, gen_id))

    @extend_schema(responses={200: envelope_of(GenerationSerializer), **_errors(401, 403, 404, 409)})
    def delete(self, request, gen_id):
        return api_ok(service.cancel(request.user, gen_id))


class GenerationSkeletonView(_GenerationView):
    """``POST …/generations/{id}/skeleton``: pide el esqueleto al proveedor."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **_errors(401, 403, *_STAGE_ERRORS)},
    )
    def post(self, request, gen_id):
        return api_ok(service.run_skeleton(request.user, gen_id))


def _repair_flag(request) -> bool:
    """``?repair=1`` o ``?repair=true`` pide la reparación; sin el parámetro, la escena normal; otro valor es un 400."""
    value = request.query_params.get("repair")
    if value is None or value == "":
        return False
    if value in ("1", "true"):
        return True
    raise ApiError("VALIDATION_ERROR", REPAIR_MESSAGE, 400, field="repair")


class GenerationSceneView(_GenerationView):
    """``POST …/generations/{id}/scenes/{clave}``: escribe una escena; con ``?repair=1`` la rehace en una ronda de reparación."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **_errors(400, 401, 403, *_STAGE_ERRORS)},
    )
    def post(self, request, gen_id, clave):
        return api_ok(service.run_scene(request.user, gen_id, clave, repair=_repair_flag(request)))


class GenerationAssembleView(_GenerationView):
    """``POST …/generations/{id}/assemble``: ensambla las escenas; importa, pide reparación o falla."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **_errors(401, 403, 404, 409)},
    )
    def post(self, request, gen_id):
        return api_ok(service.run_assemble(request.user, gen_id))
