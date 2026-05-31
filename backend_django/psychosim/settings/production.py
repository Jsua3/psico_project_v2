"""Production settings.

Everything sensitive (SECRET_KEY, DB credentials, JWT secret, reflection
encryption key) is read from environment variables in ``base.py``; this module
turns off DEBUG, locks down ALLOWED_HOSTS/CORS, and fails fast if any critical
secret was left at its insecure development default.

Required environment variables:
    DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, DB_PASSWORD, JWT_SECRET
Optional:
    CORS_ALLOWED_ORIGINS (comma-separated), REFLECTION_ENCRYPTION_KEY
    (defaults to JWT_SECRET, like Spring), DB_NAME/DB_USER/DB_HOST/DB_PORT,
    DJANGO_SECURE_SSL_REDIRECT (default "true").
"""
import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa

DEBUG = False


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise ImproperlyConfigured(
            f"Environment variable {name} is required when DJANGO_SETTINGS_MODULE="
            "psychosim.settings.production"
        )
    return value


def _split_csv(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]


ALLOWED_HOSTS = _split_csv(_require_env("DJANGO_ALLOWED_HOSTS"))

# base.py already read SECRET_KEY from DJANGO_SECRET_KEY; require it explicitly
# and refuse the insecure development default.
SECRET_KEY = _require_env("DJANGO_SECRET_KEY")  # noqa: F811
if SECRET_KEY == "django-insecure-change-in-production":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must not be the insecure default in production")

# DB password and JWT secret must be provided (not the dev fallbacks).
_require_env("DB_PASSWORD")
_require_env("JWT_SECRET")

# CORS — restrict to explicitly configured frontend origins.
CORS_ALLOWED_ORIGINS = _split_csv(os.environ.get("CORS_ALLOWED_ORIGINS"))

# HTTPS hardening (assumes a TLS-terminating reverse proxy in front).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "true").lower() == "true"
