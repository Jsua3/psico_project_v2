"""E5-9 · Esquema OpenAPI canónico, extensión JWT y trinquete de avisos (DJG-6, §5.1).

Elimina falsos positivos de ``drf-spectacular`` en vistas basadas en ``APIView``
que devuelven ``ApiResponse`` sin ``serializer_class`` declarativa, registra el
esquema ``BearerAuth`` para ``SiepJWTAuthentication`` y deduplica rutas con y
sin barra final (``/api/x`` frente a ``/api/x/``) para evitar colisiones de
``operationId``.
"""
from __future__ import annotations

from typing import Any

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema
from rest_framework import serializers


class ApiEnvelopeSerializer(serializers.Serializer):
    """Sobre estándar ``{status, message, data}`` devuelto por ``shared.responses.ApiResponse``."""

    status = serializers.ChoiceField(choices=["success", "error"])
    message = serializers.CharField(allow_null=True, required=False)
    data = serializers.JSONField(allow_null=True, required=False)


class GenericJsonPayloadSerializer(serializers.Serializer):
    """Cuerpo JSON genérico para vistas ``APIView`` sin serializer declarativo."""

    def to_internal_value(self, data: Any) -> Any:
        return data


class AuditLogItemSchemaSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    taxonomy = serializers.CharField()
    entityType = serializers.CharField(allow_null=True)
    entityId = serializers.CharField(allow_null=True)
    actorUserId = serializers.IntegerField(allow_null=True)
    actorEmail = serializers.CharField(allow_null=True)
    actorRole = serializers.CharField(allow_null=True)
    ipAddress = serializers.CharField(allow_null=True)
    context = serializers.DictField()
    createdAt = serializers.CharField(allow_null=True)


class CoverageSchemaSerializer(serializers.Serializer):
    shown = serializers.IntegerField()
    total = serializers.IntegerField()


class ReviewQualitySchemaSerializer(serializers.Serializer):
    contentCommentCount = serializers.IntegerField()
    formOnlyCount = serializers.IntegerField()
    totalReviews = serializers.IntegerField()
    formRatio = serializers.FloatField()
    rubberStampWarning = serializers.BooleanField()


class AuditListResponseSchemaSerializer(serializers.Serializer):
    items = AuditLogItemSchemaSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = CoverageSchemaSerializer()
    retentionDays = serializers.IntegerField()
    reviewQuality = ReviewQualitySchemaSerializer()


class InstructorAttemptItemSchemaSerializer(serializers.Serializer):
    attemptId = serializers.IntegerField()
    studentId = serializers.IntegerField(allow_null=True)
    studentName = serializers.CharField(allow_null=True)
    studentCode = serializers.CharField(allow_null=True)
    studentProgram = serializers.CharField(allow_null=True)
    studentSemester = serializers.IntegerField(allow_null=True)
    groupId = serializers.IntegerField(allow_null=True)
    groupCode = serializers.CharField(allow_null=True)
    caseId = serializers.IntegerField(allow_null=True)
    caseCode = serializers.CharField(allow_null=True)
    caseTitle = serializers.CharField(allow_null=True)
    caseVersionId = serializers.IntegerField(allow_null=True)
    caseVersionStatus = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    outcome = serializers.CharField(allow_null=True)
    rapportScore = serializers.IntegerField()
    totalDecisions = serializers.IntegerField()
    startedAt = serializers.CharField(allow_null=True)
    finishedAt = serializers.CharField(allow_null=True)


class InstructorAttemptsListSchemaSerializer(serializers.Serializer):
    items = InstructorAttemptItemSchemaSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = CoverageSchemaSerializer()


class WorldPatchAckSchemaSerializer(serializers.Serializer):
    currentLocation = serializers.CharField()
    playerX = serializers.IntegerField()
    playerY = serializers.IntegerField()


class SiepJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "apps.users.authentication.SiepJWTAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema: AutoSchema) -> dict[str, Any]:
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


_LIST_GET_PATHS = frozenset({
    "/api/rubrics",
    "/api/admin/cases",
    "/api/authoring/cases",
    "/api/grupos",
    "/api/assignments",
    "/api/admin/audit",
    "/api/instructor/attempts",
    "/api/simulation/catalog",
    "/api/simulation/cases",
})

_ENDPOINT_RESPONSE_SERIALIZERS: dict[tuple[str, str], type[serializers.Serializer]] = {
    ("/api/admin/audit", "GET"): AuditListResponseSchemaSerializer,
    ("/api/instructor/attempts", "GET"): InstructorAttemptsListSchemaSerializer,
    ("/api/simulation/attempts/{attempt_id}/world-state", "PATCH"): WorldPatchAckSchemaSerializer,
}


class SiepAutoSchema(AutoSchema):
    """AutoSchema que provee el sobre ``ApiEnvelopeSerializer`` por defecto en ``APIView``."""

    def _is_list_view(self, serializer: Any = None) -> bool:
        if self.method == "GET" and self.path.rstrip("/") in _LIST_GET_PATHS:
            return True
        return super()._is_list_view(serializer)

    def get_request_serializer(self) -> Any:
        override = self._get_Serializer_override("request")
        if override is not None:
            return override
        view = self.view
        if hasattr(view, "get_serializer_class") or getattr(view, "serializer_class", None) is not None:
            return super().get_request_serializer()
        if self.method in ("POST", "PUT", "PATCH"):
            return GenericJsonPayloadSerializer()
        return None

    def get_response_serializers(self) -> Any:
        override = self._get_Serializer_override("response")
        if override is not None:
            return override
        mapped = _ENDPOINT_RESPONSE_SERIALIZERS.get((self.path.rstrip("/"), self.method))
        if mapped is not None:
            return mapped()
        view = self.view
        if hasattr(view, "get_serializer_class") or getattr(view, "serializer_class", None) is not None:
            return super().get_response_serializers()
        return ApiEnvelopeSerializer()

    def _get_Serializer_override(self, direction: str) -> Any:
        override = getattr(self.view, "_spectacular_annotation", None)
        if not override:
            method_func = getattr(self.view, self.method.lower(), None)
            override = getattr(method_func, "_spectacular_annotation", None)
        if not override:
            return None
        if direction == "request" and "request" in override:
            return override["request"]
        if direction == "response" and "responses" in override:
            return override["responses"]
        return None


def preprocess_canonical_api_endpoints(
    endpoints: list[tuple[str, str, str, Any]],
) -> list[tuple[str, str, str, Any]]:
    """Conserva las rutas ``/api/...`` y deduplica alias con barra final ``/``."""
    canonical_pairs: set[tuple[str, str]] = set()
    for path, _path_regex, method, _callback in endpoints:
        if path.startswith("/api/") and path != "/api/" and not path.endswith("/"):
            canonical_pairs.add((path, method))

    filtered: list[tuple[str, str, str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for path, path_regex, method, callback in endpoints:
        if not path.startswith("/api/"):
            continue
        stripped = path[:-1] if path.endswith("/") and path != "/api/" else path
        if path.endswith("/") and (stripped, method) in canonical_pairs:
            continue
        normalized_key = (stripped, method)
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        filtered.append((stripped, path_regex, method, callback))
    return filtered


PROHIBITED_SCHEMA_FIELDS = frozenset({
    "password",
    "password_hash",
    "encrypted_text",
    "jwt_secret",
    "secret_key",
    "reflection_encryption_key",
})


def _openapi_type_to_ts(prop: dict[str, Any]) -> str:
    if "$ref" in prop:
        ref_name = prop["$ref"].rsplit("/", 1)[-1]
        base = ref_name
    elif "enum" in prop:
        base = " | ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in prop["enum"])
    else:
        kind = prop.get("type", "unknown")
        if kind in ("integer", "number"):
            base = "number"
        elif kind == "string":
            base = "string"
        elif kind == "boolean":
            base = "boolean"
        elif kind == "array":
            item_ts = _openapi_type_to_ts(prop.get("items", {}))
            base = f"ReadonlyArray<{item_ts}>"
        elif kind == "object":
            additional = prop.get("additionalProperties")
            if isinstance(additional, dict):
                val_ts = _openapi_type_to_ts(additional)
                base = f"Readonly<Record<string, {val_ts}>>"
            else:
                base = "Readonly<Record<string, unknown>>"
        else:
            base = "unknown"
    if prop.get("nullable"):
        return f"{base} | null"
    return base


def render_typescript_contracts(schema: dict[str, Any]) -> str:
    """Genera definiciones TypeScript deterministas desde el esquema OpenAPI 3.0."""
    lines: list[str] = [
        "// ARCHIVO GENERADO AUTOMÁTICAMENTE DESDE EL CONTRATO OPENAPI (E5-9 · DJG-6).",
        "// No editar a mano: regenerar con `node scripts/openapi/generate-types.mjs`.",
        "",
    ]

    schemas: dict[str, Any] = schema.get("components", {}).get("schemas", {})
    for name in sorted(schemas.keys()):
        defn = schemas[name]
        if "enum" in defn and "properties" not in defn:
            union = " | ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in defn["enum"])
            lines.append(f"export type {name} = {union};")
            lines.append("")
            continue
        props: dict[str, Any] = defn.get("properties", {})
        required = set(defn.get("required", []))
        lines.append(f"export interface {name} {{")
        for prop_name in sorted(props.keys()):
            opt = "" if prop_name in required else "?"
            ts_type = _openapi_type_to_ts(props[prop_name])
            lines.append(f"  readonly {prop_name}{opt}: {ts_type};")
        lines.append("}")
        lines.append("")

    paths: dict[str, Any] = schema.get("paths", {})
    lines.append("export interface OpenApiPaths {")
    for path_key in sorted(paths.keys()):
        methods_obj = paths[path_key]
        method_names = sorted(
            m.upper()
            for m in methods_obj.keys()
            if m.lower() in {"get", "post", "put", "patch", "delete"}
        )
        methods_union = " | ".join(f"'{m}'" for m in method_names) or "never"
        lines.append(f"  readonly '{path_key}': {methods_union};")
    lines.append("}")
    lines.append("")
    lines.append("export type OpenApiEndpointPath = keyof OpenApiPaths;")
    lines.append("")
    return "\n".join(lines)

