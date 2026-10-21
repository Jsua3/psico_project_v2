"""S1-5 · Una contraseña que fija un ADMIN es temporal (SF-21).

Quien la fija no debe quedar con una clave que solo conoce el administrador: la persona cambia la clave al entrar, la
temporal caduca, sus sesiones se cierran y recibe un aviso que NO trae la contraseña ni enlaces. El cambio se audita
con su actor y solo con ids.

Incluye «ninguna fuga»: la contraseña temporal solo aparece en el cuerpo del correo, nunca en un enlace, un registro,
una fila de auditoría ni una respuesta de la API.
"""
import io
import json
import logging
import re
import secrets
from contextlib import contextmanager

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog
from apps.users.serializers import generate_access_token
from shared.jsonlog import JsonFormatter, RequestIdFilter

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()
ASUNTO_AVISO = "[SIEP] Un administrador cambió tu contraseña"
ME = "/api/auth/me"


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


@pytest.fixture
def log_capturado():
    """Los registros del proceso en formato JSON, tal como salen por consola (``shared.jsonlog``)."""

    @contextmanager
    def capturar():
        flujo = io.StringIO()
        manejador = logging.StreamHandler(flujo)
        manejador.setFormatter(JsonFormatter())
        manejador.addFilter(RequestIdFilter())
        raiz = logging.getLogger()
        raiz.addHandler(manejador)
        try:
            # Sonda: si la captura no funciona, la prueba de «ninguna fuga» no vale nada.
            logging.getLogger("siep.security").info("captura_activa")
            yield flujo
        finally:
            raiz.removeHandler(manejador)

    return capturar


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _admin():
    return User.objects.create_user(
        email=f"admin.{secrets.token_hex(6)}@inst.test",
        password=_clave(),
        nombre="Ad",
        apellido="Min",
        role="ADMIN",
    )


def _persona(clave=None, **extra):
    return User.objects.create_user(
        email=f"persona.{secrets.token_hex(6)}@inst.test",
        password=clave or _clave(),
        nombre="Lucía",
        apellido="Ortiz",
        role="ESTUDIANTE",
        **extra,
    )


def _como_admin(admin):
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    return cliente


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
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


def _no_aparece(clave, respuesta, registros):
    """La clave no está en la respuesta de la API, en los registros ni en ninguna fila de auditoría."""
    assert registros.getvalue(), "la captura de registros no funcionó"
    assert clave not in respuesta.content.decode("utf-8")
    assert clave not in registros.getvalue()
    assert clave not in repr(list(AuditLog.objects.values()))


def test_admin_fija_la_clave_en_put_y_la_deja_temporal(db, django_capture_on_commit_callbacks):
    admin = _admin()
    persona = _persona(must_change_password=False)
    token_viejo = generate_access_token(persona)
    epoca_antes = persona.session_epoch
    clave_nueva = _clave()

    antes = timezone.now()
    with django_capture_on_commit_callbacks(execute=True):
        resp = _como_admin(admin).put(
            f"/api/admin/users/{persona.id}",
            _cuerpo_de_cuenta(persona, password=clave_nueva),
            format="json",
        )
    despues = timezone.now()

    assert resp.status_code == 200, resp.data
    persona.refresh_from_db()
    assert persona.must_change_password is True
    assert antes <= persona.temp_password_set_at <= despues
    assert persona.session_epoch > epoca_antes
    assert persona.check_password(clave_nueva)
    # El token que tenía la persona ya no sirve: la sesión abierta con la clave anterior se cerró.
    assert _como(token_viejo).get(ME).status_code == 401


def test_el_aviso_al_cambio_del_admin_va_sin_contrasena_ni_enlaces(db, django_capture_on_commit_callbacks):
    admin = _admin()
    persona = _persona()
    clave_nueva = _clave()

    with django_capture_on_commit_callbacks(execute=True):
        resp = _como_admin(admin).put(
            f"/api/admin/users/{persona.id}",
            _cuerpo_de_cuenta(persona, password=clave_nueva),
            format="json",
        )

    assert resp.status_code == 200, resp.data
    assert len(mail.outbox) == 1
    aviso = mail.outbox[0]
    assert aviso.subject == ASUNTO_AVISO
    assert aviso.to == [persona.email]
    assert clave_nueva not in aviso.body
    assert "http" not in aviso.body
    # Dice «un administrador», no quién: el correo del ADMIN que actuó no aparece.
    assert admin.email not in aviso.body


def test_admin_que_crea_una_cuenta_con_clave_la_deja_temporal_sin_correo(db):
    admin = _admin()
    correo = f"nueva.{secrets.token_hex(6)}@inst.test"

    resp = _como_admin(admin).post(
        "/api/admin/users",
        {"email": correo, "password": _clave(), "nombre": "Nueva", "apellido": "Persona", "role": "ESTUDIANTE"},
        format="json",
    )

    assert resp.status_code == 200, resp.data
    nueva = User.objects.get(email=correo)
    assert nueva.must_change_password is True
    assert nueva.temp_password_set_at is not None
    assert mail.outbox == []


def test_el_cambio_del_admin_se_audita_con_el_actor_y_sin_la_clave(db, django_capture_on_commit_callbacks):
    admin = _admin()
    persona = _persona()
    clave_nueva = _clave()

    with django_capture_on_commit_callbacks(execute=True):
        resp = _como_admin(admin).put(
            f"/api/admin/users/{persona.id}",
            _cuerpo_de_cuenta(persona, password=clave_nueva),
            format="json",
        )

    assert resp.status_code == 200, resp.data
    filas = list(AuditLog.objects.filter(action="PASSWORD_SET_BY_ADMIN"))
    assert len(filas) == 1
    assert filas[0].actor_id == admin.pk
    assert json.loads(filas[0].context_json)["targetId"] == persona.pk
    assert clave_nueva not in repr(list(AuditLog.objects.values()))


def test_la_clave_temporal_de_una_aprobacion_solo_aparece_en_el_correo(db, log_capturado):
    admin = _admin()
    pendiente = User.objects.create_user(
        email=f"pendiente.{secrets.token_hex(6)}@inst.test",
        password=None,
        nombre="Pendiente",
        apellido="Cuenta",
        role="ESTUDIANTE",
        activo=False,
        must_change_password=True,
    )

    with log_capturado() as registros:
        resp = _como_admin(admin).post("/api/admin/users/approve", {"userIds": [pendiente.id]}, format="json")

    assert resp.status_code == 200, resp.data
    cuerpo = mail.outbox[-1].body
    temporal = re.search(r"Contraseña temporal: (\S+)", cuerpo).group(1)
    assert cuerpo.count(temporal) == 1
    assert "http" not in cuerpo
    _no_aparece(temporal, resp, registros)


def test_la_clave_fijada_por_un_admin_no_se_filtra_en_registros_auditoria_ni_respuesta(
    db, log_capturado, django_capture_on_commit_callbacks
):
    admin = _admin()
    persona = _persona()
    clave_nueva = _clave()

    with log_capturado() as registros, django_capture_on_commit_callbacks(execute=True):
        resp = _como_admin(admin).put(
            f"/api/admin/users/{persona.id}",
            _cuerpo_de_cuenta(persona, password=clave_nueva),
            format="json",
        )

    assert resp.status_code == 200, resp.data
    assert clave_nueva not in mail.outbox[0].body
    _no_aparece(clave_nueva, resp, registros)
