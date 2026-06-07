"""Settings para tests en CI y desarrollo local.

En CI (GitHub Actions) todas las variables DB_* vienen del entorno.
En local, si no hay variables de entorno se usan los defaults de base.py.

Todos los modelos de dominio tienen ``managed = False`` (Flyway los posee),
por eso usamos ``--nomigrations`` en pytest.ini y apuntamos TEST.NAME
al esquema real cuando se ejecuta localmente contra la BD de desarrollo.
"""
import os

from .base import *  # noqa: F401, F403

# En CI se sobreescribe la BD con las vars del entorno; en local se hereda
# la configuración de base.py salvo que el desarrollador haya definido DB_*.
_db_name = os.environ.get("DB_NAME")
if _db_name:
    DATABASES = {  # noqa: F405
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _db_name,
            "USER": os.environ.get("DB_USER", "siep"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "siep_test"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }
else:
    # Desarrollo local: reusar el esquema psychosim existente (Flyway-owned).
    DATABASES["default"]["TEST"] = {"NAME": "psychosim"}  # noqa: F405

DEBUG = False
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "test-secret-key-not-for-production")
ALLOWED_HOSTS = ["*"]

# Sin caché externo en tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Email: consola en tests
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Desactivar logging verboso en tests
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}
