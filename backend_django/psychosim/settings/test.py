"""Settings de pruebas AISLADOS (ENV-01).

Las tablas de dominio son ``managed = False``, así que el runner no crea el
esquema: las pruebas corren contra una base ya sembrada. Antes este módulo
apuntaba al esquema real ``psychosim`` compartido con desarrollo; ahora exige
un target explícito y desechable (docker-compose.test.yml) y FALLA en el
arranque si el DSN huele a desarrollo o producción.

Nunca uses ``transactional_db`` / ``TransactionTestCase``: truncan tablas.
El aislamiento por prueba sigue siendo el rollback de ``django_db``.

Variables obligatorias (las exporta scripts/test-backend.mjs):
    SIEP_TEST_DB_NAME, SIEP_TEST_DB_HOST, SIEP_TEST_DB_PORT,
    SIEP_TEST_DB_USER, SIEP_TEST_DB_PASSWORD
"""
import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False
# El test client de Django usa el host "testserver".
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
MIDDLEWARE = [
    *MIDDLEWARE,  # noqa: F405
    "shared.test_attestation.TestEnvironmentAttestationMiddleware",
]

_REQUIRED_VARS = (
    "SIEP_TEST_DB_NAME",
    "SIEP_TEST_DB_HOST",
    "SIEP_TEST_DB_PORT",
    "SIEP_TEST_DB_USER",
    "SIEP_TEST_DB_PASSWORD",
    "SIEP_TEST_ATTESTATION_NONCE",
)
_missing = [name for name in _REQUIRED_VARS if not os.environ.get(name)]
if _missing:
    raise ImproperlyConfigured(
        "Faltan variables del entorno de pruebas aislado: "
        + ", ".join(_missing)
        + ". Usa `npm run test:backend` (levanta la BD desechable y las exporta)."
    )

_TEST_NAME = os.environ["SIEP_TEST_DB_NAME"]
_TEST_HOST = os.environ["SIEP_TEST_DB_HOST"]
_TEST_PORT = os.environ["SIEP_TEST_DB_PORT"]
SIEP_TEST_ATTESTATION_NONCE = os.environ["SIEP_TEST_ATTESTATION_NONCE"]

# Guardas anti-coincidencia: mismo espíritu que scripts/dev-environment-guard.mjs.
if os.environ.get("DATABASE_URL"):
    raise ImproperlyConfigured(
        "DATABASE_URL está definido (producción/PaaS); no se ejecutan pruebas con esa configuración."
    )
if _TEST_NAME == "psychosim":
    raise ImproperlyConfigured(
        "La base 'psychosim' es la de desarrollo/producción; está prohibida como target de pruebas."
    )
if _TEST_HOST not in ("localhost", "127.0.0.1", "::1"):
    raise ImproperlyConfigured(
        f"El host de pruebas '{_TEST_HOST}' no es local; solo se permite localhost/127.0.0.1."
    )
_DEV_DSN = (
    os.environ.get("DB_NAME", "psychosim"),
    os.environ.get("DB_PORT", "5433"),
)
if (_TEST_NAME, _TEST_PORT) == _DEV_DSN:
    raise ImproperlyConfigured(
        "El DSN de pruebas coincide con el de desarrollo (mismo nombre y puerto)."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _TEST_NAME,
        "USER": os.environ["SIEP_TEST_DB_USER"],
        "PASSWORD": os.environ["SIEP_TEST_DB_PASSWORD"],
        "HOST": _TEST_HOST,
        "PORT": _TEST_PORT,
        # --reuse-db: pytest-django se conecta directo a esta base ya sembrada.
        "TEST": {"NAME": _TEST_NAME},
    }
}
