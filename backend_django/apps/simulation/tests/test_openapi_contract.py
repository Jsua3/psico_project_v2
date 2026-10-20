"""E5-9 · Contrato OpenAPI con trinquete de avisos y tipos TypeScript (DJG-6, §5.1).

Verifica que:
1. ``drf-spectacular`` genera el esquema completo con 0 errores y 0 avisos (trinquete en 0).
2. Ningún esquema de respuesta expone campos prohibidos (``password*``, ``encrypted*``, ``token``, ``secret``), se
   escriban en snake_case o en camelCase.
3. Las rutas canónicas ``/api/...`` están documentadas sin duplicados con barra final y con ``BearerAuth``.
4. El archivo TypeScript generado ``frontend/src/app/core/api/generated/openapi-contracts.d.ts``
   coincide exactamente con el esquema OpenAPI actual.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from drf_spectacular.drainage import GENERATOR_STATS
from drf_spectacular.generators import SchemaGenerator

from shared.contract_testing import typed_operations
from shared.openapi import is_prohibited_field, render_typescript_contracts

pytestmark = pytest.mark.req("RNF-07")

MAX_OPENAPI_WARNINGS = 0
MAX_OPENAPI_ERRORS = 0
#: Contratos tipados del documento (respuesta de éxito con ``data`` de forma conocida). El trinquete va en los dos
#: sentidos, como el baseline de arquitectura: bajar es perder un contrato; subir exige anotarlo aquí. Cada uno tiene
#: su caso contra el servidor en ``test_openapi_matches_responses.CALLS``.
TYPED_CONTRACTS = 27  # 14 + 10 de F9-10 (C3, C4 y C5) + el consentimiento al aviso de contenido: GET, POST y DELETE (S3-2a, C12)

REPO_ROOT = Path(__file__).resolve().parents[4]
TS_CONTRACTS_FILE = REPO_ROOT / "frontend" / "src" / "app" / "core" / "api" / "generated" / "openapi-contracts.d.ts"


def _collect_schema_property_names(node: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            for prop_name, prop_val in props.items():
                found.add(str(prop_name))
                found.update(_collect_schema_property_names(prop_val))
        for key, value in node.items():
            if key != "properties":
                found.update(_collect_schema_property_names(value))
    elif isinstance(node, list):
        for item in node:
            found.update(_collect_schema_property_names(item))
    return found


def test_openapi_schema_generates_with_zero_warnings_and_zero_errors():
    GENERATOR_STATS.reset()
    schema = SchemaGenerator().get_schema(request=None, public=True)
    warnings = list(GENERATOR_STATS._warn_cache)
    errors = list(GENERATOR_STATS._error_cache)

    assert len(errors) <= MAX_OPENAPI_ERRORS, f"Errores OpenAPI sobre el trinquete ({MAX_OPENAPI_ERRORS}): {errors}"
    assert len(warnings) <= MAX_OPENAPI_WARNINGS, f"Avisos OpenAPI sobre el trinquete ({MAX_OPENAPI_WARNINGS}): {warnings}"
    assert schema.get("openapi", "").startswith("3.0.")


def test_openapi_schema_covers_canonical_endpoints_and_bearer_auth():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    paths = schema.get("paths", {})

    expected_paths = {
        "/api/auth/login",
        "/api/admin/audit",
        "/api/instructor/attempts",
        "/api/simulation/catalog",
        "/api/simulation/cases",
        "/api/simulation/attempts/{attempt_id}/world",
        "/api/simulation/attempts/{attempt_id}/world-state",
        "/api/grupos",
        "/api/assignments",
        "/api/rubrics",
    }
    missing = expected_paths - set(paths.keys())
    assert not missing, f"Faltan rutas canónicas en OpenAPI: {sorted(missing)}"

    trailing_duplicates = [p for p in paths.keys() if p != "/api/" and p.endswith("/")]
    assert not trailing_duplicates, f"Rutas con barra final duplicada en OpenAPI: {trailing_duplicates}"

    security_schemes = schema.get("components", {}).get("securitySchemes", {})
    assert "BearerAuth" in security_schemes
    assert security_schemes["BearerAuth"]["scheme"] == "bearer"


def test_openapi_schema_never_exposes_prohibited_fields():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    components = schema.get("components", {}).get("schemas", {})
    exposed = {name for name in _collect_schema_property_names(components) if is_prohibited_field(name)}
    assert not exposed, f"Campos prohibidos expuestos en components.schemas: {sorted(exposed)}"


@pytest.mark.parametrize(
    "name",
    [
        "password", "password_hash", "passwordHash", "PASSWORD",
        "encrypted_text", "encryptedText", "encrypted-text",
        "jwt_secret", "clientSecret", "secret_key", "secretKey",
        "reflection_encryption_key", "reflectionEncryptionKey",
        "token", "accessToken", "attemptToken", "attempt_token_hash", "refresh-token",
    ],
)
def test_un_nombre_de_campo_prohibido_se_reconoce_en_snake_case_y_en_camel_case(name):
    """La API habla camelCase y la base snake_case: el mismo secreto no puede colarse con el otro nombre."""
    assert is_prohibited_field(name)


@pytest.mark.parametrize(
    "name",
    ["definitionHash", "sealedHash", "portraitKey", "key", "caseVersionId", "displayName", "retentionDays", "passed"],
)
def test_los_campos_corrientes_no_se_marcan_como_prohibidos(name):
    assert not is_prohibited_field(name)


def test_generated_typescript_contracts_match_openapi_schema():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    expected = render_typescript_contracts(schema).replace("\r\n", "\n")
    assert TS_CONTRACTS_FILE.exists(), f"No existe {TS_CONTRACTS_FILE}; ejecuta `node scripts/openapi/generate-types.mjs`."
    current = TS_CONTRACTS_FILE.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert current == expected, (
        "Los tipos TypeScript de OpenAPI están desactualizados respecto al esquema actual. "
        "Ejecuta `node scripts/openapi/generate-types.mjs`."
    )


def test_typed_contracts_ratchet():
    typed = typed_operations(SchemaGenerator().get_schema(request=None, public=True))
    assert len(typed) >= TYPED_CONTRACTS, (
        f"Bajó el número de contratos tipados ({len(typed)} < {TYPED_CONTRACTS}); hoy: {sorted(typed)}"
    )
    assert len(typed) <= TYPED_CONTRACTS, (
        f"Hay {len(typed)} contratos tipados: sube TYPED_CONTRACTS a {len(typed)} y dale su caso contra el servidor "
        "en test_openapi_matches_responses.CALLS"
    )
