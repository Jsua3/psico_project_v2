"""Ajustes del «modo aula»: la demostración compilada en un solo equipo, a la que otros equipos de la misma red entran con
``http://<ip-del-equipo>:<puerto>`` (la profesora proyecta y los estudiantes juegan desde sus portátiles).

Solo para este modo: ``production.py`` (HTTPS, Railway) y ``local.py`` (desarrollo) no cambian. Lo arranca el guion
``levantar-aula.ps1``, que pone estas variables; si falta alguna, el servidor no arranca y dice cuál.

- ``SIEP_AULA_HOSTS``: los nombres con que se entra, separados por comas (la IP del equipo en la red y ``localhost``).
  Sin comodines: un ``*`` dejaría entrar con cualquier Host.
- ``SIEP_AULA_PUERTO``: el puerto en que escucha. Con él se arman los orígenes de confianza (CSRF): ``http://<host>:<puerto>``.
- ``DJANGO_SECRET_KEY`` y ``REFLECTION_ENCRYPTION_KEY``: propias del aula (el guion las genera la primera vez y las guarda
  fuera del repositorio); nunca las de ejemplo.

En la red del aula no hay HTTPS: las cookies no llevan ``Secure``, no hay redirección a https ni HSTS. El cliente lo sirve
Django desde ``backend_django/frontend_dist`` (WhiteNoise, como en producción), en el mismo origen que la API: sin CORS.
"""
import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import SECRET_KEY as _SECRET_KEY_BASE

PREDETERMINADAS = ("django-insecure-change-in-production", "dev-only-reflection-key-never-use-in-production")


def _requerida(nombre):
    valor = os.environ.get(nombre, "").strip()
    if not valor:
        raise ImproperlyConfigured(f"Modo aula: falta la variable {nombre} (la pone levantar-aula.ps1).")
    return valor


def _clave(nombre):
    valor = _requerida(nombre)
    if valor in PREDETERMINADAS or len(valor) < 32:
        raise ImproperlyConfigured(f"Modo aula: {nombre} debe ser propia del aula, de 32 caracteres o más (valor no mostrado).")
    return valor


DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in _requerida("SIEP_AULA_HOSTS").split(",") if h.strip()]
if not ALLOWED_HOSTS or any("*" in h for h in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Modo aula: SIEP_AULA_HOSTS lista los nombres exactos, sin comodines.")

_puerto = _requerida("SIEP_AULA_PUERTO")
if not _puerto.isdigit() or not 1 <= int(_puerto) <= 65535:
    raise ImproperlyConfigured("Modo aula: SIEP_AULA_PUERTO debe ser un número de puerto.")
AULA_PUERTO = int(_puerto)

# El mismo origen sirve el cliente y la API: solo esos orígenes son de confianza para CSRF, y no hace falta CORS.
CSRF_TRUSTED_ORIGINS = [f"http://{h}:{AULA_PUERTO}" for h in ALLOWED_HOSTS]
CORS_ALLOWED_ORIGINS = []
CORS_ALLOW_ALL_ORIGINS = False

# Red local sin HTTPS: cookies sin Secure, sin redirección ni HSTS (en producción siguen encendidos).
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0

SECRET_KEY = _clave("DJANGO_SECRET_KEY")
if SECRET_KEY != _SECRET_KEY_BASE:  # base la leyó del mismo entorno: si no coincide, algo la cambió entre medias.
    raise ImproperlyConfigured("Modo aula: DJANGO_SECRET_KEY cambió al cargar los ajustes.")
REFLECTION_ENCRYPTION_KEY = _clave("REFLECTION_ENCRYPTION_KEY")
