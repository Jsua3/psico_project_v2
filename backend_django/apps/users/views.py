import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import AuthenticationFailed, Throttled, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.security.limiter import hit, key_hash, peek, retry_after
from apps.security.limits import LIMITS
from apps.security.throttling import (
    AccessRequestEmailThrottle,
    AccessRequestGlobalThrottle,
    AccessRequestIpThrottle,
    FailFastThrottlesMixin,
    GoogleIpThrottle,
    LoginIpThrottle,
    PasswordChangeUserThrottle,
)
from shared.client_ip import client_ip
from shared.openapi import ApiEnvelopeSerializer
from shared.permissions import policy_permission
from shared.response import api_created, api_ok

from .models import AccessRequestStatus, burn_password_check
from .serializers import (
    AccessRequestCreateSerializer,
    AccessRequestSerializer,
    AccessRequestStatusSerializer,
    AdminUserStatusSerializer,
    AdminUserSerializer,
    AdminUserWriteSerializer,
    ApproveUsersSerializer,
    ChangePasswordSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSummarySerializer,
    generate_access_token,
    normalize_email_value,
)
from .services import access_request_service, account_service

User = get_user_model()
logger = logging.getLogger("siep.security")


class GoogleAuthenticationError(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "No fue posible iniciar sesión con Google"
    default_code = "google_auth_failed"


def verify_google_credential(credential, audience):
    try:
        from google.auth.transport import requests
        from google.oauth2 import id_token
    except ImportError as exc:
        raise ValidationError("El proveedor de Google no está instalado en el backend") from exc

    try:
        return id_token.verify_oauth2_token(
            credential,
            requests.Request(),
            audience,
        )
    except ValueError as exc:
        raise GoogleAuthenticationError("No fue posible validar la cuenta de Google") from exc


def _bloqueo_por_fallos(email, ip):
    """Lanza 429 si esta cuenta desde esta IP, o esta cuenta desde cualquier IP, ya agotó sus fallos (S1-2).

    Se mira ANTES de la contraseña: acertarla no salta el bloqueo. Solo cuentan los fallos; los aciertos no suman.
    """
    esperas = []
    if peek("login_fail_account_ip", key_hash(email, ip)) >= LIMITS["login_fail_account_ip"].limit:
        esperas.append(retry_after("login_fail_account_ip"))
    if peek("login_fail_account", key_hash(email)) >= LIMITS["login_fail_account"].limit:
        esperas.append(retry_after("login_fail_account"))
    if esperas:
        raise Throttled(wait=max(esperas))


def _registrar_fallo(email, ip):
    """Cuenta un fallo de contraseña (también de una cuenta que no existe: así no se adivinan nombres)."""
    hit("login_fail_account_ip", key_hash(email, ip))
    hit("login_fail_account", key_hash(email))


class LoginView(APIView):
    """POST /api/auth/login — public. Mirrors Spring AuthController.login."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginIpThrottle]

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]
        ip = client_ip(request)
        _bloqueo_por_fallos(email, ip)

        user = User.objects.filter(email=email).first()
        # S1-5 · una contraseña temporal caducada no entra: cuenta como credenciales inválidas (abajo) y la cuenta de
        # una persona vuelve a «pendiente». Se mira ANTES de decidir; el trabajo bcrypt de este intento no cambia.
        caducada = user is not None and account_service.temporary_password_expired(user)
        # S1-3 · exactamente un bcrypt.checkpw por intento: si no hay contraseña que comparar (correo inexistente
        # o cuenta sin clave usable) se gasta el mismo trabajo con un hash ficticio, y el tiempo no revela cuentas.
        if user is not None and user.has_usable_password():
            matched = user.check_password(password)
        else:
            burn_password_check(password)
            matched = False
        if caducada:
            account_service.return_expired_to_pending(user.id)
            matched = False
        if not (user is not None and user.activo and matched):
            _registrar_fallo(email, ip)
            # 401 "Credenciales inválidas" (Spring BadCredentialsException)
            raise AuthenticationFailed("Credenciales inválidas")

        return api_ok({
            "token": generate_access_token(user),
            "user": UserSummarySerializer(user).data,
        })


class GoogleConfigView(APIView):
    """GET /api/auth/google/config - expone el client id público de Google.

    El client id de OAuth no es secreto (se usa en el navegador). El frontend lo
    pide para inicializar Google Identity Services; si está vacío, oculta el botón.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or ""
        return api_ok({"clientId": client_id, "enabled": bool(client_id)})


class GoogleLoginView(APIView):
    """POST /api/auth/google - public Google Identity Services login."""

    permission_classes = [AllowAny]
    throttle_classes = [GoogleIpThrottle]

    def post(self, request):
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
        if not client_id:
            raise ValidationError("El inicio de sesión con Google no está configurado")

        ser = GoogleLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payload = verify_google_credential(ser.validated_data["credential"], client_id)

        if not payload.get("email_verified"):
            raise GoogleAuthenticationError("La cuenta de Google no tiene el correo verificado")

        email = normalize_email_value(payload.get("email", ""))
        if not email:
            raise GoogleAuthenticationError("La cuenta de Google no entregó un correo válido")

        # S1-3 · dominios permitidos (lista vacía = sin restricción, SD-14). Un dominio fuera de la lista recibe el
        # mismo error que una cuenta inexistente: la restricción no se revela.
        dominios = getattr(settings, "GOOGLE_ALLOWED_DOMAINS", [])
        if dominios and email.rsplit("@", 1)[-1] not in dominios:
            raise GoogleAuthenticationError("La cuenta de Google no está asociada a un usuario activo")

        # Un fallo de la base de datos no es un fallo de autenticación: se deja propagar (500).
        user = User.objects.filter(email=email).first()
        if not user or not user.activo:
            raise GoogleAuthenticationError("La cuenta de Google no está asociada a un usuario activo")

        if user.must_change_password:
            # Entró con su cuenta de Google: la contraseña temporal del correo ya no hace falta y
            # no debe seguir sirviendo (quien interceptara ese correo entraría sin el cambio
            # obligatorio). La cuenta queda sin contraseña propia hasta que la persona fije una.
            user.must_change_password = False
            user.set_password(None)
            # S1-5 · sin temporal no hay fecha de caducidad que contar.
            user.temp_password_set_at = None
            user.save(update_fields=["must_change_password", "password", "temp_password_set_at"])
            # S1-4 · un token emitido con la contraseña temporal no debe sobrevivir a su anulación.
            user.session_epoch = account_service.revoke_sessions(user.id)

        return api_ok({
            "token": generate_access_token(user),
            "user": UserSummarySerializer(user).data,
        })


class RegisterView(APIView):
    """POST /api/auth/register — ADMIN only. Mirrors Spring AuthController.register."""

    permission_classes = [policy_permission("user", "manage")]

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if User.objects.filter(email=ser.validated_data["email"]).exists():
            raise ValidationError("El email ya está registrado")
        user = ser.save()
        # Spring returns 200 OK with message + data.
        return api_ok(UserSummarySerializer(user).data, message="Usuario creado exitosamente")


class AccessRequestCreateView(FailFastThrottlesMixin, APIView):
    """POST /api/auth/access-request — public student access request."""

    permission_classes = [AllowAny]
    # El orden importa (FailFastThrottlesMixin): el tope global solo cuenta lo que pasó el de la IP y el del correo.
    throttle_classes = [AccessRequestIpThrottle, AccessRequestEmailThrottle, AccessRequestGlobalThrottle]

    @extend_schema(responses={201: ApiEnvelopeSerializer})
    def post(self, request):
        ser = AccessRequestCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = dict(ser.validated_data)
        # S1-3 · campo trampa: lo rellena un bot. Recibe la misma respuesta y no se guarda ni se avisa nada.
        if datos.pop("website", ""):
            logger.info("security_event", extra={"fields": {"event": "honeypot_hit"}})
        else:
            # La misma respuesta exista o no la cuenta o la solicitud pendiente: no revela qué correos existen.
            access_request_service.create_access_request(**datos)
        return api_created(
            {"status": AccessRequestStatus.PENDING},
            message="Solicitud enviada. El administrador revisará tu acceso pronto.",
        )


class AdminAccessRequestListView(APIView):
    """GET /api/admin/access-requests — ADMIN only."""

    permission_classes = [policy_permission("user", "manage")]

    def get(self, request):
        status = request.query_params.get("status")
        requests = access_request_service.list_access_requests(status=status)
        return api_ok(AccessRequestSerializer(requests, many=True).data)


class AdminAccessRequestStatusView(APIView):
    """PATCH /api/admin/access-requests/<id>/status — ADMIN only."""

    permission_classes = [policy_permission("user", "manage")]

    def patch(self, request, request_id):
        ser = AccessRequestStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        updated = access_request_service.update_access_request_status(
            request_id, status=ser.validated_data["status"]
        )
        return api_ok(
            AccessRequestSerializer(updated).data,
            message="Estado de solicitud actualizado.",
        )


class ChangePasswordView(APIView):
    """POST /api/auth/change-password — la propia persona, también con el cambio obligatorio."""

    permission_classes = [policy_permission("account", "self")]
    throttle_classes = [PasswordChangeUserThrottle]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = account_service.change_password(
            request.user, ser.validated_data["currentPassword"], ser.validated_data["newPassword"]
        )
        # S1-4 · cambiar la contraseña cierra las demás sesiones; la actual sigue con un token nuevo.
        return api_ok({"token": generate_access_token(user)}, message="Contraseña actualizada")


class LogoutView(APIView):
    """POST /api/auth/logout — la propia persona cierra todas sus sesiones (S1-4)."""

    permission_classes = [policy_permission("account", "self")]

    def post(self, request):
        account_service.revoke_sessions(request.user.id)
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        return api_ok(None, message="Sesión cerrada")


class AdminUserApproveView(APIView):
    """POST /api/admin/users/approve — ADMIN aprueba por lote las cuentas pendientes (E2-9)."""

    permission_classes = [policy_permission("user", "manage")]

    def post(self, request):
        ser = ApproveUsersSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = account_service.approve_pending(ser.validated_data["userIds"], request.user)
        return api_ok(result, message="Cuentas procesadas")


class MeView(APIView):
    """GET /api/auth/me — authenticated."""

    permission_classes = [policy_permission("account", "self")]

    def get(self, request):
        return api_ok(UserSummarySerializer(request.user).data)


class AdminUserListCreateView(APIView):
    """GET/POST /api/admin/users — ADMIN only."""

    permission_classes = [policy_permission("user", "manage")]

    def get(self, request):
        users = User.objects.order_by("id")
        return api_ok(AdminUserSerializer(users, many=True).data)

    def post(self, request):
        ser = AdminUserWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        access_request_service.resolve_pending_for_email(user.email)
        return api_ok(AdminUserSerializer(user).data, message="Usuario creado correctamente")


class AdminUserDetailView(APIView):
    """PUT /api/admin/users/<id> — ADMIN only."""

    permission_classes = [policy_permission("user", "manage")]

    def put(self, request, user_id):
        approve_after = False
        with transaction.atomic():
            account_service.lock_admins()
            user = get_object_or_404(User.objects.select_for_update(), pk=user_id)
            ser = AdminUserWriteSerializer(instance=user, data=request.data)
            ser.is_valid(raise_exception=True)
            if ser.validated_data.get("activo") and user.is_pending_approval:
                # «Activar» una cuenta pendiente es aprobarla: la activa y manda la contraseña
                # temporal por correo (abajo). Aquí solo se guardan los demás cambios.
                approve_after = True
                ser.validated_data.pop("activo")
            account_service.ensure_not_last_admin(
                user, role=ser.validated_data.get("role"), activo=ser.validated_data.get("activo")
            )
            user = ser.save()
        if approve_after:
            outcome = account_service.approve_if_pending(user.id, request.user)
            if outcome is not None and outcome["failed"]:
                raise account_service.approval_email_failed()
            user = get_object_or_404(User, pk=user.id)
        return api_ok(AdminUserSerializer(user).data, message="Usuario actualizado correctamente")


class AdminUserStatusView(APIView):
    """PATCH /api/admin/users/<id>/status — ADMIN only."""

    permission_classes = [policy_permission("user", "manage")]

    def patch(self, request, user_id):
        ser = AdminUserStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if ser.validated_data["activo"]:
            # «Activar» una cuenta pendiente es aprobarla (correo con la contraseña temporal): no
            # se deja activa y sin contraseña usable.
            outcome = account_service.approve_if_pending(user_id, request.user)
            if outcome is not None and outcome["failed"]:
                raise account_service.approval_email_failed()
            if outcome is not None and outcome["approved"]:
                return api_ok(
                    AdminUserSerializer(get_object_or_404(User, pk=user_id)).data,
                    message="Cuenta aprobada: la contraseña temporal se envió por correo",
                )
        with transaction.atomic():
            account_service.lock_admins()
            user = get_object_or_404(User.objects.select_for_update(), pk=user_id)
            account_service.ensure_not_last_admin(user, activo=ser.validated_data["activo"])
            cambia = user.activo != ser.validated_data["activo"]
            user.activo = ser.validated_data["activo"]
            user.save(update_fields=["activo"])
            if cambia:
                # S1-4 · desactivar o reactivar cierra las sesiones de la persona (en ambos sentidos).
                account_service.revoke_sessions(user.pk)
        return api_ok(AdminUserSerializer(user).data, message="Estado actualizado correctamente")


class AdminUserRevokeSessionsView(APIView):
    """POST /api/admin/users/<id>/revoke-sessions — ADMIN cierra todas las sesiones de una persona (S1-4)."""

    permission_classes = [policy_permission("user", "manage")]

    def post(self, request, user_id):
        get_object_or_404(User, pk=user_id)  # 404 si la cuenta no existe: no hay nada que cerrar ni auditar
        account_service.revoke_sessions(user_id)
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        return api_ok(None, message="Sesiones cerradas")
