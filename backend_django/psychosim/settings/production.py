"""Production settings.

Everything sensitive (SECRET_KEY, DB credentials, JWT secret, reflection
encryption key) is read from environment variables in ``base.py``; this module
turns off DEBUG, locks down ALLOWED_HOSTS/CORS, and fails fast if any critical
secret was left at its insecure development default.

Required environment variables:
    DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, DB_PASSWORD, JWT_SECRET, SIEP_TRUSTED_PROXIES
    (entero ≥ 0: proxies de confianza delante de Django; sin valor por defecto).
Optional:
    CORS_ALLOWED_ORIGINS (comma-separated), REFLECTION_ENCRYPTION_KEY
    (defaults to JWT_SECRET, like Spring), DB_NAME/DB_USER/DB_HOST/DB_PORT,
    DJANGO_SECURE_SSL_REDIRECT (default "false").
"""
import os

from django.core.exceptions import ImproperlyConfigured


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise ImproperlyConfigured(
            f"Environment variable {name} is required when DJANGO_SETTINGS_MODULE="
            "psychosim.settings.production"
        )
    return value


# S1-1 · base.py convierte SIEP_TRUSTED_PROXIES con int() al importarse: un valor que no sea un entero ≥ 0 se
# rechaza AQUÍ, antes del ``from .base import *``, para que la causa salga como ImproperlyConfigured.
def _validate_trusted_proxies():
    value = _require_env("SIEP_TRUSTED_PROXIES").strip()
    try:
        valid = int(value) >= 0
    except ValueError:
        valid = False
    if not valid:
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_TRUSTED_PROXIES debe ser un entero ≥ 0: número de proxies de confianza delante de Django "
            "(0 = ninguno)."
        )


_validate_trusted_proxies()

from .base import *  # noqa

DEBUG = False


def _split_csv(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]


# Hosts permitidos: lo configurado en DJANGO_ALLOWED_HOSTS MÁS el dominio público
# que Railway inyecta automáticamente (RAILWAY_PUBLIC_DOMAIN). Así el deploy
# funciona aunque la variable esté vacía o desactualizada tras generar el dominio.
_railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
ALLOWED_HOSTS = _split_csv(os.environ.get("DJANGO_ALLOWED_HOSTS"))
if _railway_domain and _railway_domain not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_railway_domain)
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "Define DJANGO_ALLOWED_HOSTS (o despliega en Railway, que provee "
        "RAILWAY_PUBLIC_DOMAIN) para psychosim.settings.production"
    )

# CSRF: confía en el origen https del dominio público (por si algún flujo usa CSRF).
CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in ALLOWED_HOSTS if h and h != "*"]

# Railway sondea el healthcheck (/api/health) con «Host: healthcheck.railway.app»: sin este
# host Django responde 400 (DisallowedHost) y el despliegue nunca se promueve. Va DESPUÉS de
# calcular CSRF_TRUSTED_ORIGINS: es un host de sondeo, no un origen de navegador.
ALLOWED_HOSTS.append("healthcheck.railway.app")

# base.py already read SECRET_KEY from DJANGO_SECRET_KEY; require it explicitly
# and refuse the insecure development default.
SECRET_KEY = _require_env("DJANGO_SECRET_KEY")  # noqa: F811
if SECRET_KEY == "django-insecure-change-in-production":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must not be the insecure default in production")

# La base de datos llega como DATABASE_URL (Railway) o como variables DB_*.
# Solo exigimos DB_PASSWORD cuando NO se usa DATABASE_URL.
if not os.environ.get("DATABASE_URL"):
    _require_env("DB_PASSWORD")
_require_env("JWT_SECRET")

# CORS — al servir el SPA desde el mismo servicio Django el origen es el mismo y
# no hace falta CORS; si el frontend vive en otro dominio, se listan aquí.
CORS_ALLOWED_ORIGINS = _split_csv(os.environ.get("CORS_ALLOWED_ORIGINS"))

# ── Correo (E2-12) ─────────────────────────────────────────────────────────────────────────────
# El correo lleva avisos y la contraseña temporal de las cuentas aprobadas: con el backend de
# consola esa contraseña iría al registro de la plataforma, así que producción exige un backend
# real (o declararlo explícitamente con SIEP_ALLOW_CONSOLE_EMAIL=true) y un destino para el aviso
# de solicitudes de acceso (o declarar que no lo hay con ACCESS_REQUEST_NOTIFY_DISABLED=true).
def _declared(name):
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


if MAILERS["default"]["BACKEND"].endswith("console.EmailBackend") and not _declared("SIEP_ALLOW_CONSOLE_EMAIL"):
    raise ImproperlyConfigured(
        "Define EMAIL_BACKEND (y EMAIL_HOST…) para el correo en producción, o declara "
        "SIEP_ALLOW_CONSOLE_EMAIL=true: el backend de consola escribe en el registro la "
        "contraseña temporal de las cuentas aprobadas."
    )
_notify = _split_csv(os.environ.get("ACCESS_REQUEST_NOTIFY_EMAILS"))
if _declared("ACCESS_REQUEST_NOTIFY_DISABLED"):
    ACCESS_REQUEST_NOTIFY_EMAILS = []
elif not _notify:
    raise ImproperlyConfigured(
        "Define ACCESS_REQUEST_NOTIFY_EMAILS (correos separados por comas que reciben el aviso de "
        "una solicitud de acceso) o declara ACCESS_REQUEST_NOTIFY_DISABLED=true."
    )
else:
    ACCESS_REQUEST_NOTIFY_EMAILS = _notify

# Railway termina TLS en el borde: las cookies seguras y la cabecera de proxy
# funcionan, pero el redirect a HTTPS lo maneja la plataforma. Por defecto NO
# forzamos el redirect en Django para evitar bucles; se puede activar con env.
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "false").lower() == "true"

# HTTPS hardening (assumes a TLS-terminating reverse proxy in front).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
