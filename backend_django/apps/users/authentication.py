"""Autenticación JWT con el cambio de contraseña obligatorio (E2-9, RN-10).

Una cuenta aprobada por el ADMIN nace con una contraseña temporal y ``must_change_password``:
hasta que la persona fije la suya, **toda** orden responde 403 ``PASSWORD_CHANGE_REQUIRED``
salvo las de autenticación (``/api/auth/**``: entrar, ver quién soy, cambiar la contraseña) y
la salud del servicio. Es la autenticación por defecto de DRF (``REST_FRAMEWORK``).
"""
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

#: Rutas que una cuenta con cambio pendiente sí puede usar.
ALLOWED_PREFIXES = ("/api/auth/", "/api/health")


class SiepJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, _ = result
        # Importación perezosa: DRF carga esta clase al leer sus ajustes, mientras
        # ``shared.exceptions`` (que importa DRF) todavía se está inicializando.
        from shared.exceptions import ApiError

        if getattr(user, "must_change_password", False) and not request.path.startswith(ALLOWED_PREFIXES):
            raise ApiError(
                "PASSWORD_CHANGE_REQUIRED",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Debes cambiar tu contraseña temporal antes de continuar.",
                status.HTTP_403_FORBIDDEN,
            )
        return result
