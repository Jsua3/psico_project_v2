"""S1-4 · Sesión revocable: la época de sesión corta los tokens de acceso que ya se emitieron.

Cada token de acceso lleva la claim ``ep`` (la época de su dueño cuando se emitió). Cerrar la sesión, cambiar la
contraseña, desactivar o reactivar la cuenta y cambiar el rol suben la época en la base de datos: desde entonces,
``SiepJWTAuthentication`` responde 401 ``TOKEN_INVALID`` a los tokens con una ``ep`` menor. Un token sin la claim
cuenta como época 0.
"""
import io
import secrets

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.simulation.models import AuditLog
from apps.users.serializers import PsychoSimTokenObtainSerializer, generate_access_token
from apps.users.services import account_service
from shared.testing import purge_audit_rows, run_concurrently

pytestmark = [pytest.mark.req("SIEP-RNF-04"), pytest.mark.security]

User = get_user_model()
RUTA_YO = "/api/auth/me"
RUTA_GRUPOS = "/api/grupos"


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _cuenta(role="ESTUDIANTE", clave=None, **extra):
    """Crea una cuenta con contraseña propia. Devuelve ``(usuario, contraseña)``."""
    clave = clave or _clave()
    usuario = User.objects.create_user(
        email=f"sesion.{secrets.token_hex(6)}@x.com",
        password=clave,
        nombre="Ana",
        apellido="Prueba",
        role=role,
        **extra,
    )
    return usuario, clave


def _entrar(usuario, clave):
    respuesta = APIClient().post("/api/auth/login", {"email": usuario.email, "password": clave}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]["token"]


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


def _forzado(usuario):
    """Cliente autenticado sin token, para las órdenes de administración."""
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _cuerpo_de_cuenta(usuario, **cambios):
    """Cuerpo completo de ``PUT /api/admin/users/<id>``: lo que pide el serializador, con los cambios."""
    cuerpo = {
        "email": usuario.email,
        "nombre": usuario.nombre,
        "apellido": usuario.apellido,
        "role": usuario.role,
        "activo": usuario.activo,
    }
    cuerpo.update(cambios)
    return cuerpo


def _revocado(respuesta):
    """401 ``TOKEN_INVALID``: el token tiene firma válida, pero su sesión ya se cerró."""
    assert respuesta.status_code == 401, respuesta.data
    assert respuesta.data["code"] == "TOKEN_INVALID", respuesta.data


def test_el_cierre_de_sesion_mata_el_mismo_token_y_permite_entrar_de_nuevo(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    assert _como(token).get(RUTA_YO).status_code == 200

    assert _como(token).post("/api/auth/logout").status_code == 200

    _revocado(_como(token).get(RUTA_YO))
    nuevo = _entrar(usuario, clave)
    assert _como(nuevo).get(RUTA_YO).status_code == 200


def test_el_cierre_de_sesion_de_una_persona_no_afecta_a_otra(db):
    ana, clave_ana = _cuenta()
    luis, clave_luis = _cuenta()
    token_ana = _entrar(ana, clave_ana)
    token_luis = _entrar(luis, clave_luis)

    assert _como(token_ana).post("/api/auth/logout").status_code == 200

    _revocado(_como(token_ana).get(RUTA_YO))
    assert _como(token_luis).get(RUTA_YO).status_code == 200


def test_un_token_sin_la_claim_ep_vale_como_epoca_cero(db):
    usuario, clave = _cuenta()
    sin_ep = str(AccessToken.for_user(usuario))
    assert "ep" not in AccessToken(sin_ep)
    assert _como(sin_ep).get(RUTA_YO).status_code == 200  # la época de la base es 0

    # Otra sesión de la misma persona la cierra: la época sube a 1 y el token sin claim deja de valer.
    assert _como(_entrar(usuario, clave)).post("/api/auth/logout").status_code == 200
    _revocado(_como(sin_ep).get(RUTA_YO))


@pytest.mark.parametrize("valor", ["no-es-entero", None, [1]])
def test_una_ep_que_no_es_entera_cuenta_como_epoca_cero(db, valor):
    usuario, _ = _cuenta()
    token = AccessToken.for_user(usuario)
    token["ep"] = valor  # firmado por nosotros: la firma vale, solo el tipo del valor es raro
    assert _como(str(token)).get(RUTA_YO).status_code == 200

    User.objects.filter(pk=usuario.pk).update(session_epoch=1)
    _revocado(_como(str(token)).get(RUTA_YO))


def test_el_token_emitido_lleva_la_epoca_entera_de_la_base(db):
    usuario, _ = _cuenta()
    User.objects.filter(pk=usuario.pk).update(session_epoch=3)
    usuario.refresh_from_db()

    claim = AccessToken(generate_access_token(usuario))["ep"]
    assert type(claim) is int and claim == 3
    assert PsychoSimTokenObtainSerializer.get_token(usuario)["ep"] == 3


def test_cambiar_la_contrasena_invalida_los_tokens_anteriores(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    nueva = _clave()

    respuesta = _como(token).post(
        "/api/auth/change-password", {"currentPassword": clave, "newPassword": nueva}, format="json"
    )
    assert respuesta.status_code == 200, respuesta.data

    _revocado(_como(token).get(RUTA_YO))
    assert _entrar(usuario, nueva)


def test_desactivar_la_cuenta_invalida_los_tokens_anteriores(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    admin, _ = _cuenta(role="ADMIN")

    respuesta = _forzado(admin).patch(f"/api/admin/users/{usuario.pk}/status", {"activo": False}, format="json")
    assert respuesta.status_code == 200, respuesta.data

    usuario.refresh_from_db()
    assert usuario.session_epoch == 1
    # La cuenta está inactiva: el token ya no entra. La época cubre también la reactivación (siguiente prueba).
    assert _como(token).get(RUTA_YO).status_code == 401


def test_reactivar_la_cuenta_invalida_los_tokens_aunque_la_desactivacion_no_los_cerrara(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    # Una desactivación que no cerró sesiones (anterior a S1-4): la época sigue en 0 y el token viviría.
    User.objects.filter(pk=usuario.pk).update(activo=False)
    admin, _ = _cuenta(role="ADMIN")

    respuesta = _forzado(admin).patch(f"/api/admin/users/{usuario.pk}/status", {"activo": True}, format="json")
    assert respuesta.status_code == 200, respuesta.data

    _revocado(_como(token).get(RUTA_YO))


def test_cambiar_el_rol_invalida_los_tokens_anteriores(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    admin, _ = _cuenta(role="ADMIN")

    respuesta = _forzado(admin).put(
        f"/api/admin/users/{usuario.pk}", _cuerpo_de_cuenta(usuario, role="PROFESOR"), format="json"
    )
    assert respuesta.status_code == 200, respuesta.data

    _revocado(_como(token).get(RUTA_YO))


def test_fijar_la_contrasena_desde_admin_invalida_los_tokens_de_esa_persona(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    admin, _ = _cuenta(role="ADMIN")
    nueva = _clave()

    respuesta = _forzado(admin).put(
        f"/api/admin/users/{usuario.pk}", _cuerpo_de_cuenta(usuario, password=nueva), format="json"
    )
    assert respuesta.status_code == 200, respuesta.data

    _revocado(_como(token).get(RUTA_YO))
    assert _entrar(usuario, nueva)


def test_aprobar_una_cuenta_pendiente_invalida_los_tokens_anteriores(db, settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    # Cuenta pendiente de aprobación, como queda tras una desactivación anterior a S1-4 (sin cerrar sesiones).
    User.objects.filter(pk=usuario.pk).update(activo=False, must_change_password=True, password="!")
    admin, _ = _cuenta(role="ADMIN")

    respuesta = _forzado(admin).post("/api/admin/users/approve", {"userIds": [usuario.pk]}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.data["data"]["approvedIds"] == [usuario.pk]

    _revocado(_como(token).get(RUTA_YO))


def test_el_comando_que_fuerza_el_cambio_cierra_las_sesiones_de_esas_cuentas(db):
    clave_compartida = _clave()  # la que tenían las cuentas importadas antes de E2-9
    usuario, _ = _cuenta(clave=clave_compartida)
    token = _entrar(usuario, clave_compartida)
    assert _como(token).get(RUTA_YO).status_code == 200

    call_command(
        "force_password_change_for_shared_passwords", f"--password={clave_compartida}", stdout=io.StringIO()
    )

    usuario.refresh_from_db()
    assert usuario.must_change_password is True
    assert usuario.session_epoch == 1
    _revocado(_como(token).get(RUTA_YO))


def test_el_token_revocado_responde_401_antes_que_el_cambio_obligatorio(db):
    usuario, clave = _cuenta(must_change_password=True)
    token = _entrar(usuario, clave)

    # Con el cambio pendiente, una orden fuera de /api/auth/ responde 403: esa comprobación sigue viva.
    respuesta = _como(token).get(RUTA_GRUPOS)
    assert respuesta.status_code == 403, respuesta.data
    assert respuesta.data["code"] == "PASSWORD_CHANGE_REQUIRED", respuesta.data

    # Con la sesión cerrada, el 401 llega antes que el 403.
    assert _como(token).post("/api/auth/logout").status_code == 200
    _revocado(_como(token).get(RUTA_GRUPOS))


def test_el_admin_cierra_las_sesiones_de_una_persona_y_queda_auditado(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    admin, _ = _cuenta(role="ADMIN")

    respuesta = _forzado(admin).post(f"/api/admin/users/{usuario.pk}/revoke-sessions")
    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.data["message"] == "Sesiones cerradas"

    _revocado(_como(token).get(RUTA_YO))
    assert AuditLog.objects.filter(
        action="SESSIONS_REVOKED", resource_type="USER", resource_id=str(usuario.pk), actor_id=admin.pk
    ).exists()


@pytest.mark.parametrize("rol", ["PROFESOR", "ESTUDIANTE"])
def test_solo_el_admin_cierra_las_sesiones_de_otra_persona(db, rol):
    objetivo, clave = _cuenta()
    token = _entrar(objetivo, clave)
    actor, _ = _cuenta(role=rol)

    respuesta = _forzado(actor).post(f"/api/admin/users/{objetivo.pk}/revoke-sessions")
    assert respuesta.status_code == 403, respuesta.data
    assert _como(token).get(RUTA_YO).status_code == 200


def test_cerrar_sesiones_sin_sesion_responde_401_y_de_una_cuenta_inexistente_404(db):
    objetivo, _ = _cuenta()
    assert APIClient().post(f"/api/admin/users/{objetivo.pk}/revoke-sessions").status_code == 401

    admin, _ = _cuenta(role="ADMIN")
    inexistente = max(User.objects.values_list("pk", flat=True)) + 1000
    respuesta = _forzado(admin).post(f"/api/admin/users/{inexistente}/revoke-sessions")
    assert respuesta.status_code == 404, respuesta.data


def test_con_la_bandera_apagada_la_epoca_se_emite_pero_no_se_exige(db, settings):
    settings.SIEP_SESSION_EPOCH_ENFORCE = False
    usuario, clave = _cuenta()
    viejo = _entrar(usuario, clave)
    assert _como(viejo).post("/api/auth/logout").status_code == 200  # el cierre sí sube la época

    nuevo = _entrar(usuario, clave)
    usuario.refresh_from_db()
    assert AccessToken(nuevo)["ep"] == usuario.session_epoch == 1
    assert _como(viejo).get(RUTA_YO).status_code == 200  # sin exigirla, el token viejo sigue pasando


def test_dos_revocaciones_simultaneas_suman_dos(real_commits):
    usuario = User.objects.create_user(
        email=f"concurrente.{secrets.token_hex(6)}@x.com",
        password=_clave(),
        nombre="Ana",
        apellido="Prueba",
        role="ESTUDIANTE",
    )
    try:
        resultados = run_concurrently(
            lambda: account_service.revoke_sessions(usuario.pk),
            lambda: account_service.revoke_sessions(usuario.pk),
        )
        assert [resultado.error for resultado in resultados] == [None, None]
        usuario.refresh_from_db()
        assert usuario.session_epoch == 2
    finally:
        purge_audit_rows(AuditLog.objects.filter(action="SESSIONS_REVOKED", resource_id=str(usuario.pk)))
        usuario.delete()


def test_cambiar_la_contrasena_reemite_un_token_vigente_para_la_sesion_actual(db):
    usuario, clave = _cuenta()
    token = _entrar(usuario, clave)
    nueva = _clave()

    respuesta = _como(token).post(
        "/api/auth/change-password", {"currentPassword": clave, "newPassword": nueva}, format="json"
    )

    assert respuesta.status_code == 200, respuesta.data
    reemitido = respuesta.data["data"]["token"]
    assert reemitido != token
    assert _como(reemitido).get(RUTA_YO).status_code == 200
    _revocado(_como(token).get(RUTA_YO))


def test_entrar_con_google_anula_la_temporal_y_cierra_las_sesiones_que_la_usaron(db, monkeypatch, settings):
    settings.GOOGLE_OAUTH_CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com"
    usuario, clave = _cuenta()
    User.objects.filter(pk=usuario.pk).update(must_change_password=True)
    token_con_la_temporal = _entrar(usuario, clave)
    monkeypatch.setattr(
        "apps.users.views.verify_google_credential",
        lambda credential, audience: {"email": usuario.email, "email_verified": True},
    )

    respuesta = APIClient().post("/api/auth/google", {"credential": "x"}, format="json")

    assert respuesta.status_code == 200, respuesta.data
    _revocado(_como(token_con_la_temporal).get(RUTA_YO))
    assert _como(respuesta.data["data"]["token"]).get(RUTA_YO).status_code == 200


def test_una_clave_que_empieza_por_guion_tambien_se_acepta(db):
    """Con ``--password <clave>`` argparse toma una clave que empieza por «-» por una opción (hallazgo #9); la forma
    segura es ``--password=<clave>``. La clave de esta prueba empieza por guion a propósito: el fallo no depende del azar."""
    clave_compartida = "-" + _clave()
    usuario, _ = _cuenta(clave=clave_compartida)

    call_command(
        "force_password_change_for_shared_passwords", f"--password={clave_compartida}", stdout=io.StringIO()
    )

    usuario.refresh_from_db()
    assert usuario.must_change_password is True
