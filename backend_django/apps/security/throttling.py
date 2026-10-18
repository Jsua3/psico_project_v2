"""Clases de límite por alcance para las vistas (S1-2, DJA-2).

Cada clase lleva el alcance de ``limits.LIMITS``. Las de IP cuentan por ``client_ip`` (S1-1); las de cuenta, por el
id de la persona autenticada. Una petición sin clave utilizable (p. ej. sin correo) pasa sin contar. El 429 lo
convierte ``shared.exceptions`` en la forma ``THROTTLED``.
"""
from rest_framework.throttling import BaseThrottle

from shared.client_ip import client_ip

from .limiter import hit, key_hash, retry_after
from .limits import LIMITS


class FailFastThrottlesMixin:
    """Evalúa los límites de la vista EN ORDEN y se detiene en el primero que rechaza.

    DRF evalúa todos aunque el primero ya haya rechazado, y cada ``allow_request`` suma a su contador: un intento
    frenado por IP seguiría gastando el tope global de solicitudes de acceso (200 al día) y el del correo. Con este
    corte, los contadores posteriores solo cuentan lo que pasó los anteriores.
    """

    def check_throttles(self, request):
        for throttle in self.get_throttles():
            if not throttle.allow_request(request, self):
                self.throttled(request, throttle.wait())


class ScopedThrottle(BaseThrottle):
    scope = ""

    def key(self, request, view):
        """Clave del contador (un hash de la IP del cliente). ``None`` significa que la petición no cuenta."""
        return key_hash(client_ip(request))

    def allow_request(self, request, view):
        clave = self.key(request, view)
        if clave is None:
            return True
        if hit(self.scope, clave) <= LIMITS[self.scope].limit:
            return True
        self._espera = retry_after(self.scope)
        return False

    def wait(self):
        return getattr(self, "_espera", None)


class LoginIpThrottle(ScopedThrottle):
    scope = "login_ip"


class GoogleIpThrottle(ScopedThrottle):
    scope = "google_ip"


class AccessRequestIpThrottle(ScopedThrottle):
    scope = "access_request_ip"


def _correo_de(request) -> str:
    datos = request.data
    valor = datos.get("email") if hasattr(datos, "get") else None
    return valor.strip().lower() if isinstance(valor, str) else ""


class AccessRequestEmailThrottle(ScopedThrottle):
    scope = "access_request_email"

    def key(self, request, view):
        correo = _correo_de(request)
        return key_hash(correo) if correo else None


class AccessRequestGlobalThrottle(ScopedThrottle):
    scope = "access_request_global"

    def key(self, request, view):
        # Una sola clave para toda la solicitud de acceso: es el tope diario de todo el sistema.
        return key_hash("global")


class _PersonaThrottle(ScopedThrottle):
    def key(self, request, view):
        pk = getattr(getattr(request, "user", None), "pk", None)
        return key_hash(pk) if pk is not None else None


class ImportUserThrottle(_PersonaThrottle):
    scope = "import_user"


class HeavyUserThrottle(_PersonaThrottle):
    scope = "heavy_user"


class PasswordChangeUserThrottle(_PersonaThrottle):
    scope = "password_change_user"
