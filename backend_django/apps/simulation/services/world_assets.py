"""Las URL de los recursos del mundo (S2-6b).

El fondo de sala lo carga el navegador de CADA estudiante: una URL ajena le manda a un tercero su IP y su navegador
(SF-24). Por eso solo se admiten rutas propias de ``/assets/`` y enlaces ``https://`` de hosts que el servidor permita
(``SIEP_ALLOWED_ASSET_HOSTS``, lista separada por comas en el entorno; vacía por defecto: solo rutas propias).
"""
import ipaddress
import re
from urllib.parse import urlsplit

from django.conf import settings

MAX_URL_LENGTH = 300
OWN_ASSET_PREFIX = "/assets/"
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
# Un punto, una barra o una barra invertida codificados (%2e, %2f, %5c, en cualquier mayúscula): el navegador los
# normaliza como «..», «/» o «\» y así se sale de /assets/ o cambia de host.
_CODIFICADO = re.compile(r"%(?:2e|2f|5c)", re.IGNORECASE)

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
_NO_ES_TEXTO = "La ruta del recurso debe ser un texto."
_CODIFICADO_MSG = "La ruta del recurso no puede llevar %2e, %2f ni %5c (puntos, barras o barras invertidas codificados)."
_DEMASIADO_LARGA = f"La ruta del recurso no puede superar los {MAX_URL_LENGTH} caracteres."
_CARACTERES = "La ruta del recurso no puede tener barras invertidas ni caracteres de control."
_RUTA_PROPIA = "La ruta propia no puede tener «..» ni «//»."
_NO_PERMITIDA = "Solo se admiten rutas de /assets/ o enlaces https:// de hosts que el servidor permite."
_CREDENCIALES = "El enlace no puede llevar usuario ni contraseña."
_PUERTO = "El enlace no puede llevar puerto."
_IP = "El enlace no puede usar una dirección IP: usa un nombre de host."
_SIN_ARCHIVO = "El enlace https:// debe apuntar a un archivo, p. ej. https://host/imagen.png."
_HOST = "El host del enlace no está permitido por el servidor."


def world_asset_url_problem(value):
    """El problema de la URL de un recurso del mundo (texto), o ``None`` si es válida.

    Son válidos: ``None`` o la cadena vacía (sin recurso); una ruta propia que empieza por ``/assets/``, sin ``..``,
    sin ``//``, sin barras invertidas, sin ``%2e``/``%2f``/``%5c`` (en cualquier mayúscula), sin caracteres de control
    y de hasta 300 caracteres; y ``https://host/ruta`` cuyo
    host (en minúsculas) está en ``settings.SIEP_ALLOWED_ASSET_HOSTS``, sin usuario, contraseña ni puerto, sin IP
    literal y con ruta de archivo. La lista la fija ``SIEP_ALLOWED_ASSET_HOSTS`` en el entorno (vacía por defecto).
    Todo lo demás es un problema: ``http://``, ``//host``, ``javascript:``, ``data:``, ``file:``, rutas relativas.
    """
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        return _NO_ES_TEXTO
    if len(value) > MAX_URL_LENGTH:
        return _DEMASIADO_LARGA
    if _CONTROL.search(value) or "\\" in value:
        return _CARACTERES
    if _CODIFICADO.search(value):
        return _CODIFICADO_MSG
    if value.startswith(OWN_ASSET_PREFIX):
        return _RUTA_PROPIA if (".." in value or "//" in value) else None
    if value[:8].lower() == "https://":
        return _problema_https(value)
    return _NO_PERMITIDA


def _problema_https(value):
    try:
        partes = urlsplit(value)
    except ValueError:  # un corchete sin cerrar y otros textos que urlsplit no lee
        return _NO_PERMITIDA
    netloc = partes.netloc
    if "[" in netloc:
        return _IP
    if "@" in netloc:
        return _CREDENCIALES
    if ":" in netloc:
        return _PUERTO
    host = partes.hostname or ""
    if not host:
        return _HOST
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return _IP
    if partes.path in ("", "/"):
        return _SIN_ARCHIVO
    if host not in {permitido.lower() for permitido in settings.SIEP_ALLOWED_ASSET_HOSTS}:
        return _HOST
    return None
