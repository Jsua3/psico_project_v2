"""Generación de un caso por etapas con IA (C1) · ``/api/authoring/generations``.

Las vistas no tienen lógica: leen el cuerpo, llaman al servicio (``services/authoring/generation/service.py``, que valida,
comprueba la propiedad y el apagado y lanza los errores del contrato) y responden en el sobre ``{success, data}``. Permiso
``case.author``; una generación de otra persona es un 404 también para ADMIN.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from ..serializers.contracts import GenerationSerializer, GenerationStatusSerializer
from ..services.authoring.generation import service

_STAGE_ERRORS = (404, 409, 422, 429, 502)


class GenerationStartBody(serializers.Serializer):
    """Solo describe el cuerpo para el esquema: el servicio valida ``lugarId`` y ``descripcion`` con mensajes fijos."""

    lugarId = serializers.CharField(help_text="El lugar donde pasa el caso.")
    descripcion = serializers.CharField(help_text="Entre 40 y 2000 caracteres, texto plano y sin datos personales.")


class _GenerationView(APIView):
    permission_classes = [policy_permission("case", "author")]


class GenerationStatusView(_GenerationView):
    """``GET …/generations/status``: si está disponible, cuántas le quedan hoy y la generación en curso."""

    @extend_schema(responses={200: envelope_of(GenerationStatusSerializer), **error_responses(401, 403)})
    def get(self, request):
        return api_ok(service.status(request.user))


class GenerationListCreateView(_GenerationView):
    """``POST …/generations``: abre una generación (``created``)."""

    @extend_schema(
        request=GenerationStartBody,
        responses={201: envelope_of(GenerationSerializer), **error_responses(400, 401, 403, 404, 409, 429)},
    )
    def post(self, request):
        body = request.data if hasattr(request.data, "get") else {}
        return api_ok(service.start(request.user, body.get("lugarId"), body.get("descripcion")), http_status=201)


class GenerationDetailView(_GenerationView):
    """``GET …/generations/{id}`` lee el avance; ``DELETE`` cancela."""

    @extend_schema(responses={200: envelope_of(GenerationSerializer), **error_responses(401, 403, 404)})
    def get(self, request, gen_id):
        return api_ok(service.get(request.user, gen_id))

    @extend_schema(responses={200: envelope_of(GenerationSerializer), **error_responses(401, 403, 404, 409)})
    def delete(self, request, gen_id):
        return api_ok(service.cancel(request.user, gen_id))


class GenerationSkeletonView(_GenerationView):
    """``POST …/generations/{id}/skeleton``: pide el esqueleto al proveedor."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **error_responses(401, 403, *_STAGE_ERRORS)},
    )
    def post(self, request, gen_id):
        return api_ok(service.run_skeleton(request.user, gen_id))


class GenerationSceneView(_GenerationView):
    """``POST …/generations/{id}/scenes/{clave}``: escribe una escena; con ``?repair=1`` la rehace en una ronda de reparación."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **error_responses(401, 403, *_STAGE_ERRORS)},
    )
    def post(self, request, gen_id, clave):
        return api_ok(service.run_scene(request.user, gen_id, clave, repair=request.query_params.get("repair") == "1"))


class GenerationAssembleView(_GenerationView):
    """``POST …/generations/{id}/assemble``: ensambla las escenas; importa, pide reparación o falla."""

    @extend_schema(
        request=None,
        responses={200: envelope_of(GenerationSerializer), **error_responses(401, 403, 404, 409)},
    )
    def post(self, request, gen_id):
        return api_ok(service.run_assemble(request.user, gen_id))
