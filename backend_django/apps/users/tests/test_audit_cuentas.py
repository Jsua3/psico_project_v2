"""S4-1 · Quién cambió qué sobre las cuentas y las solicitudes de acceso (RNF-007, SIEP-RNF-02).

Alta y edición de usuarios por el ADMIN (con ``usuario.estado`` y ``usuario.rol`` cuando eso es lo que cambia), la
solicitud de acceso creada (pública: actor anónimo, contexto SOLO su id) y su resolución, y las dos listas que leen datos
de otras personas (usuarios y solicitudes). Cada evento deja UNA fila con el actor y el recurso correctos; ningún valor
de un correo, una contraseña o un nombre llega a la fila.

Cada escenario actúa y afirma; las mismas funciones sirven al control negativo (con la escritura apagada, cada una cae).
"""
import json
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service
from apps.users.models import AccessRequest, AccessRequestStatus

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
USUARIOS = "/api/admin/users"
SOLICITUDES = "/api/admin/access-requests"
SOLICITUD_PUBLICA = "/api/auth/access-request"
IP = "198.51.100.88"
AGENTE = "agente-de-prueba/2.0"


@pytest.fixture(autouse=True)
def correo_en_memoria(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


def _clave():
    return secrets.token_urlsafe(24)


def _correo():
    return f"s41.{secrets.token_hex(6)}@inst.test"


def _persona(rol="ESTUDIANTE", **extra):
    return User.objects.create_user(
        email=_correo(), password=_clave(), nombre="Lucía", apellido="Ortiz", role=rol, **extra
    )


def _como(usuario=None):
    cliente = APIClient()
    if usuario is not None:
        cliente.force_authenticate(user=usuario)
    return cliente


def _cuerpo(usuario, **cambios):
    """Cuerpo completo de ``PUT /api/admin/users/<id>``: lo que pide el serializador, con los cambios."""
    cuerpo = {
        "email": usuario.email, "nombre": usuario.nombre, "apellido": usuario.apellido,
        "role": usuario.role, "activo": usuario.activo,
    }
    cuerpo.update(cambios)
    return cuerpo


def _filas(accion, **filtros):
    return list(AuditLog.objects.filter(action=accion, **filtros).order_by("id"))


def _una(accion, **filtros):
    filas = _filas(accion, **filtros)
    assert len(filas) == 1, f"{accion}: {len(filas)} filas (se esperaba 1)"
    return filas[0]


def _contexto(fila):
    return json.loads(fila.context_json)


def _sin_secretos(*secretos):
    volcado = repr(list(AuditLog.objects.values()))
    for secreto in secretos:
        assert secreto not in volcado, "un dato de la persona llegó a la auditoría"


def _afirmar_actor_y_recurso(fila, admin, persona):
    assert (fila.actor_id, fila.actor_role) == (admin.pk, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("USER", str(persona.pk))
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)


def _put(admin, persona, **cambios):
    return _como(admin).put(
        f"{USUARIOS}/{persona.pk}", _cuerpo(persona, **cambios), format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE
    )


def _no_hay_filas_de(*acciones):
    for accion in acciones:
        assert _filas(accion) == [], accion


# ── Alta y edición de usuarios ─────────────────────────────────────────────────────────────────────────────────────
def _alta_de_usuario():
    admin = _persona("ADMIN")
    correo, clave = _correo(), _clave()
    solicitud = AccessRequest.objects.create(nombre="Marta", apellido="Solicita", email=correo)

    respuesta = _como(admin).post(
        USUARIOS,
        {"email": correo, "password": clave, "nombre": "Nueva", "apellido": "Persona", "role": "PROFESOR", "activo": True},
        format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE,
    )

    assert respuesta.status_code == 200
    nueva = User.objects.get(email=correo)
    fila = _una("USER_CREATED")
    _afirmar_actor_y_recurso(fila, admin, nueva)
    assert _contexto(fila) == {"taxonomy": "usuario.crear", "targetId": nueva.pk, "role": "PROFESOR", "activo": True}
    # La solicitud pendiente del mismo correo se resuelve sola: es otro cambio y deja su propia fila.
    resuelta = _una("ACCESS_REQUEST_RESOLVED")
    assert (resuelta.resource_type, resuelta.resource_id) == ("ACCESS_REQUEST", str(solicitud.pk))
    assert (resuelta.actor_id, resuelta.actor_role) == (admin.pk, "ADMIN")
    assert _contexto(resuelta) == {"taxonomy": "solicitud.resolver", "requestId": solicitud.pk, "status": "REVIEWED"}
    _sin_secretos(correo, clave)


def _edicion_de_datos():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")
    correo_anterior, correo_nuevo = persona.email, _correo()

    respuesta = _put(admin, persona, nombre="Otra", apellido="Distinta", email=correo_nuevo)

    assert respuesta.status_code == 200
    fila = _una("USER_UPDATED")
    _afirmar_actor_y_recurso(fila, admin, persona)
    assert _contexto(fila) == {
        "taxonomy": "usuario.actualizar", "targetId": persona.pk, "changed": ["nombre", "apellido", "email"],
    }
    _no_hay_filas_de("USER_ROLE_CHANGED", "USER_STATUS_CHANGED")
    _sin_secretos(correo_nuevo, correo_anterior)  # los nombres de los campos, nunca sus valores


def _cambio_de_rol():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")

    respuesta = _put(admin, persona, role="PROFESOR")

    assert respuesta.status_code == 200
    fila = _una("USER_ROLE_CHANGED")
    _afirmar_actor_y_recurso(fila, admin, persona)
    assert _contexto(fila) == {
        "taxonomy": "usuario.rol", "targetId": persona.pk, "changed": ["role"], "role": "PROFESOR",
        "previousRole": "ESTUDIANTE",
    }
    _no_hay_filas_de("USER_UPDATED", "USER_STATUS_CHANGED")


def _cambio_de_estado_por_put():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")

    respuesta = _put(admin, persona, activo=False)

    assert respuesta.status_code == 200
    fila = _una("USER_STATUS_CHANGED")
    _afirmar_actor_y_recurso(fila, admin, persona)
    assert _contexto(fila) == {
        "taxonomy": "usuario.estado", "targetId": persona.pk, "changed": ["activo"], "activo": False,
    }
    _no_hay_filas_de("USER_UPDATED", "USER_ROLE_CHANGED")


def _cambio_de_estado_por_patch():
    admin, persona = _persona("ADMIN"), _persona("PROFESOR")

    respuesta = _como(admin).patch(
        f"{USUARIOS}/{persona.pk}/status", {"activo": False}, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE
    )

    assert respuesta.status_code == 200
    fila = _una("USER_STATUS_CHANGED")
    _afirmar_actor_y_recurso(fila, admin, persona)
    assert _contexto(fila) == {
        "taxonomy": "usuario.estado", "targetId": persona.pk, "changed": ["activo"], "activo": False,
    }


# ── Solicitudes de acceso ──────────────────────────────────────────────────────────────────────────────────────────
def _solicitud_creada():
    correo = _correo()

    respuesta = _como().post(
        SOLICITUD_PUBLICA, {"nombre": "Zoraida", "apellido": "Quispe", "email": correo},
        format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE,
    )

    assert respuesta.status_code == 201
    solicitud = AccessRequest.objects.get(email=correo)
    fila = _una("ACCESS_REQUEST_CREATED")
    assert (fila.actor_id, fila.actor_role) == (None, "ANONYMOUS")
    assert (fila.resource_type, fila.resource_id) == ("ACCESS_REQUEST", str(solicitud.pk))
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)
    assert _contexto(fila) == {"taxonomy": "solicitud.crear", "requestId": solicitud.pk}  # SOLO su id
    _sin_secretos(correo, "Zoraida", "Quispe")


def _solicitud_resuelta():
    admin = _persona("ADMIN")
    solicitud = AccessRequest.objects.create(nombre="Marta", apellido="Solicita", email=_correo())

    respuesta = _como(admin).patch(
        f"{SOLICITUDES}/{solicitud.pk}/status", {"status": "DISMISSED"},
        format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE,
    )

    assert respuesta.status_code == 200
    fila = _una("ACCESS_REQUEST_RESOLVED")
    assert (fila.actor_id, fila.actor_role) == (admin.pk, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("ACCESS_REQUEST", str(solicitud.pk))
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)
    assert _contexto(fila) == {"taxonomy": "solicitud.resolver", "requestId": solicitud.pk, "status": "DISMISSED"}
    _sin_secretos(solicitud.email)


# ── Las listas que leen datos de otras personas ────────────────────────────────────────────────────────────────────
def _lista_de_usuarios():
    admin = _persona("ADMIN")
    _persona("ESTUDIANTE")

    respuesta = _como(admin).get(USUARIOS, REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)

    assert respuesta.status_code == 200
    fila = _una("USER_LIST_VIEWED")
    assert (fila.actor_id, fila.actor_role) == (admin.pk, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("USER", None)
    assert _contexto(fila) == {"taxonomy": "usuario.listar", "count": len(respuesta.data["data"])}  # cuántas, no cuáles


def _lista_de_solicitudes():
    admin = _persona("ADMIN")
    for _ in range(2):
        AccessRequest.objects.create(nombre="Marta", apellido="Solicita", email=_correo())

    respuesta = _como(admin).get(SOLICITUDES, REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)

    assert respuesta.status_code == 200
    fila = _una("ACCESS_REQUEST_LIST_VIEWED")
    assert (fila.actor_id, fila.actor_role) == (admin.pk, "ADMIN")
    assert _contexto(fila) == {"taxonomy": "solicitud.listar", "count": len(respuesta.data["data"])}


ESCENARIOS = {
    "alta de usuario": _alta_de_usuario,
    "edición de datos": _edicion_de_datos,
    "cambio de rol": _cambio_de_rol,
    "cambio de estado por PUT": _cambio_de_estado_por_put,
    "cambio de estado por PATCH": _cambio_de_estado_por_patch,
    "solicitud de acceso creada": _solicitud_creada,
    "solicitud de acceso resuelta": _solicitud_resuelta,
    "lista de usuarios": _lista_de_usuarios,
    "lista de solicitudes": _lista_de_solicitudes,
}


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_el_evento_deja_una_fila_con_el_actor_y_el_recurso_correctos(escenario):
    escenario()


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_control_negativo_con_la_escritura_apagada_cada_evento_cae(escenario, monkeypatch):
    monkeypatch.setattr(audit_service, "append", lambda *args, **kwargs: None)

    with pytest.raises(AssertionError):
        escenario()


# ── Lo que NO deja fila ────────────────────────────────────────────────────────────────────────────────────────────
def test_un_cambio_mixto_deja_una_fila_por_clase_de_cambio():
    """Un rol nuevo y un nombre nuevo en el mismo PUT: el rol sigue siendo hallable por ``usuario.rol``."""
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")

    assert _put(admin, persona, role="PROFESOR", nombre="Otra").status_code == 200

    assert _contexto(_una("USER_ROLE_CHANGED"))["changed"] == ["role"]
    assert _contexto(_una("USER_UPDATED"))["changed"] == ["nombre"]
    _no_hay_filas_de("USER_STATUS_CHANGED")


def test_un_put_sin_cambios_no_deja_fila_de_usuario():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")

    assert _put(admin, persona).status_code == 200

    _no_hay_filas_de("USER_UPDATED", "USER_ROLE_CHANGED", "USER_STATUS_CHANGED")


def test_un_patch_de_estado_que_no_cambia_nada_no_deja_fila():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")

    respuesta = _como(admin).patch(f"{USUARIOS}/{persona.pk}/status", {"activo": True}, format="json")

    assert respuesta.status_code == 200
    _no_hay_filas_de("USER_STATUS_CHANGED")


def test_fijar_la_clave_deja_su_propio_evento_y_nunca_la_clave():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")
    clave = _clave()

    assert _put(admin, persona, password=clave).status_code == 200

    _una("PASSWORD_SET_BY_ADMIN")  # el evento que ya existía
    _no_hay_filas_de("USER_UPDATED")  # la clave no es un «dato» que cambió: tiene su evento
    _sin_secretos(clave)


def test_activar_una_cuenta_pendiente_es_aprobarla_y_no_un_cambio_de_estado():
    admin = _persona("ADMIN")
    pendiente = User.objects.create_user(
        email=_correo(), password=None, nombre="Pía", apellido="Pendiente", role="ESTUDIANTE",
        activo=False, must_change_password=True,
    )

    respuesta = _como(admin).patch(f"{USUARIOS}/{pendiente.pk}/status", {"activo": True}, format="json")

    assert respuesta.status_code == 200
    _una("USER_APPROVED")
    _no_hay_filas_de("USER_STATUS_CHANGED")


def test_una_edicion_rechazada_no_deja_fila():
    admin, persona = _persona("ADMIN"), _persona("ESTUDIANTE")
    otra = _persona("ESTUDIANTE")

    respuesta = _put(admin, persona, email=otra.email)  # el correo ya está registrado

    assert respuesta.status_code == 400
    _no_hay_filas_de("USER_UPDATED")


def test_el_ultimo_admin_no_puede_cambiar_de_rol_y_el_intento_no_deja_fila():
    admin = _persona("ADMIN")
    User.objects.exclude(pk=admin.pk).filter(role="ADMIN").update(activo=False)

    respuesta = _put(admin, admin, role="PROFESOR")

    assert respuesta.status_code == 400
    _no_hay_filas_de("USER_ROLE_CHANGED")


@pytest.mark.parametrize("variante", ["campo trampa", "correo con cuenta", "solicitud pendiente del correo"])
def test_una_solicitud_que_no_se_guarda_no_deja_fila(variante):
    correo = _correo()
    cuerpo = {"nombre": "Zoraida", "apellido": "Quispe", "email": correo}
    if variante == "campo trampa":
        cuerpo["website"] = "https://spam.test"
    elif variante == "correo con cuenta":
        cuerpo["email"] = _persona().email
    else:
        AccessRequest.objects.create(nombre="Zoraida", apellido="Quispe", email=correo, status=AccessRequestStatus.PENDING)

    respuesta = _como().post(SOLICITUD_PUBLICA, cuerpo, format="json", REMOTE_ADDR=IP)

    assert respuesta.status_code == 201  # la misma respuesta: no se revela nada
    _no_hay_filas_de("ACCESS_REQUEST_CREATED")


def test_resolver_una_solicitud_con_un_estado_invalido_o_inexistente_no_deja_fila():
    admin = _persona("ADMIN")
    solicitud = AccessRequest.objects.create(nombre="Marta", apellido="Solicita", email=_correo())

    invalido = _como(admin).patch(f"{SOLICITUDES}/{solicitud.pk}/status", {"status": "NO_EXISTE"}, format="json")
    inexistente = _como(admin).patch(f"{SOLICITUDES}/999999999/status", {"status": "REVIEWED"}, format="json")

    assert (invalido.status_code, inexistente.status_code) == (400, 400)
    _no_hay_filas_de("ACCESS_REQUEST_RESOLVED")
