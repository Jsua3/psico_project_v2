"""SIEP-RNF-03 · La primera cuenta ADMIN de un despliegue se crea por terminal, con clave temporal (plan 03, R1b).

``create_admin`` es el camino legítimo para el primer administrador: crea UNA cuenta activa, con la clave que llega por
variable de entorno (o pedida dos veces en una terminal interactiva), y esa clave es temporal (cambio obligatorio y
fecha de caducidad). La clave nunca va como argumento de línea de comandos ni sale en la salida ni en la auditoría.
"""
import getpass
import io
import json
import secrets
import sys
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()
VARIABLE = "SIEP_ADMIN_PASSWORD"
CORREO = "primer.admin@inst.test"
NOMBRE = "Ana"
APELLIDO = "Ruiz"


class _Entrada:
    """Sustituto de ``sys.stdin`` con o sin terminal: el comando solo pregunta ``isatty()``."""

    def __init__(self, interactiva):
        self._interactiva = interactiva

    def isatty(self):
        return self._interactiva


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch):
    """Ni una variable ni una terminal del shell de quien corre la prueba."""
    monkeypatch.delenv(VARIABLE, raising=False)
    monkeypatch.setattr(sys, "stdin", _Entrada(False))


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _crear(*extra, correo=CORREO):
    salida = io.StringIO()
    call_command(
        "create_admin", "--email", correo, "--nombre", NOMBRE, "--apellido", APELLIDO, *extra, stdout=salida
    )
    return salida.getvalue()


def test_crea_un_admin_activo_con_clave_temporal_y_fecha(monkeypatch):
    clave = _clave()
    monkeypatch.setenv(VARIABLE, clave)
    antes = timezone.now()

    _crear()

    cuenta = User.objects.get(email=CORREO)
    assert cuenta.role == "ADMIN"
    assert cuenta.activo is True
    assert cuenta.must_change_password is True
    assert cuenta.temp_password_set_at is not None
    assert cuenta.temp_password_set_at >= antes
    assert cuenta.check_password(clave)
    assert cuenta.session_epoch == 0


def test_la_auditoria_guarda_el_id_de_la_cuenta_y_nunca_la_clave(monkeypatch):
    clave = _clave()
    monkeypatch.setenv(VARIABLE, clave)

    _crear()

    cuenta = User.objects.get(email=CORREO)
    filas = list(AuditLog.objects.filter(action="ADMIN_CREATED_BY_COMMAND"))
    assert len(filas) == 1
    contexto = json.loads(filas[0].context_json)
    assert contexto["targetId"] == cuenta.pk
    assert filas[0].resource_id == str(cuenta.pk), "el recurso de la fila es la cuenta creada (S7-5)"
    volcado = json.dumps(
        {"action": filas[0].action, "resource": filas[0].resource_type, "context": contexto}
    )
    assert clave not in volcado
    assert CORREO not in volcado


def test_la_salida_no_muestra_la_clave_ni_el_correo(monkeypatch):
    clave = _clave()
    monkeypatch.setenv(VARIABLE, clave)

    salida = _crear()

    assert clave not in salida
    assert CORREO not in salida
    assert str(User.objects.get(email=CORREO).pk) in salida


@pytest.mark.parametrize(
    "valor",
    [
        "",
        secrets.token_urlsafe(4),
        "".join(secrets.choice("0123456789") for _ in range(14)),
        CORREO,
    ],
    ids=["vacia", "corta", "solo_digitos", "igual_al_correo"],
)
def test_rechaza_una_clave_vacia_corta_numerica_o_parecida_a_la_cuenta(monkeypatch, valor):
    monkeypatch.setenv(VARIABLE, valor)

    with pytest.raises(CommandError):
        _crear()

    assert not User.objects.filter(email=CORREO).exists()


@pytest.mark.parametrize("nombre", ["Ana@Lopez", "Ana" + chr(0x202E) + "Lopez", "Ana2"])
def test_rechaza_un_nombre_que_no_es_de_persona_como_el_alta_de_admin(monkeypatch, nombre):
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError):
        call_command(
            "create_admin", "--email", CORREO, "--nombre", nombre, "--apellido", APELLIDO, stdout=io.StringIO()
        )

    assert not User.objects.filter(email=CORREO).exists()


def test_rechaza_un_correo_repetido_sin_tocar_la_cuenta_existente(monkeypatch):
    existente = User.objects.create_user(
        email=CORREO, password=_clave(), nombre="Otra", apellido="Persona", role="ESTUDIANTE", activo=True
    )
    antes = (existente.role, existente.activo, existente.password, existente.nombre, existente.apellido)
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError):
        _crear(correo=CORREO.upper())

    existente.refresh_from_db()
    assert (existente.role, existente.activo, existente.password, existente.nombre, existente.apellido) == antes
    assert User.objects.filter(email=CORREO).count() == 1
    assert not AuditLog.objects.filter(action="ADMIN_CREATED_BY_COMMAND").exists()


def test_sin_variable_y_sin_terminal_falla_y_no_crea_nada():
    with pytest.raises(CommandError, match=VARIABLE):
        _crear()

    assert not User.objects.filter(email=CORREO).exists()


def test_en_terminal_pide_la_clave_dos_veces_y_crea_la_cuenta(monkeypatch):
    clave = _clave()
    monkeypatch.setattr(sys, "stdin", _Entrada(True))
    pedidas = []

    def pedir(prompt=""):
        pedidas.append(prompt)
        return clave

    monkeypatch.setattr(getpass, "getpass", pedir)

    _crear()

    assert len(pedidas) == 2
    assert User.objects.get(email=CORREO).check_password(clave)


def test_en_terminal_con_claves_distintas_falla_y_no_crea_nada(monkeypatch):
    monkeypatch.setattr(sys, "stdin", _Entrada(True))
    claves = iter([_clave(), _clave()])
    monkeypatch.setattr(getpass, "getpass", lambda prompt="": next(claves))

    with pytest.raises(CommandError):
        _crear()

    assert not User.objects.filter(email=CORREO).exists()


def test_la_clave_no_se_acepta_como_argumento_de_linea_de_comandos(monkeypatch):
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError):
        _crear("--password", _clave())

    assert not User.objects.filter(email=CORREO).exists()


# --- R1b2 · ``create_admin --reset``: reponer la clave del único ADMIN cuando la pierde o su temporal caducó. ---------
LOGIN = "/api/auth/login"
ME = "/api/auth/me"
USUARIOS = "/api/admin/users"
CORREO_SIN_CUENTA = "nadie.repone@inst.test"


def _reponer(correo=CORREO):
    salida = io.StringIO()
    call_command("create_admin", "--email", correo, "--reset", stdout=salida)
    return salida.getvalue()


def _cuenta(role="ADMIN", clave=None, **extra):
    """Cuenta existente en ``CORREO`` con su clave (o una generada en ejecución). Devuelve ``(cuenta, clave)``."""
    clave = clave or _clave()
    cuenta = User.objects.create_user(email=CORREO, password=clave, nombre="Ana", apellido="Ruiz", role=role, **extra)
    return cuenta, clave


def _caducada():
    """Temporal fijada hace 8 días: ya caducó (``SIEP_TEMP_PASSWORD_DAYS`` vale 7)."""
    return {"must_change_password": True, "temp_password_set_at": timezone.now() - timedelta(days=8)}


def _estado(cuenta):
    """Lo que el comando puede cambiar en una cuenta. Recarga desde la base."""
    cuenta.refresh_from_db()
    return (
        cuenta.role,
        cuenta.activo,
        cuenta.password,
        cuenta.must_change_password,
        cuenta.temp_password_set_at,
        cuenta.session_epoch,
    )


def _entrar(clave):
    return APIClient().post(LOGIN, {"email": CORREO, "password": clave}, format="json")


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


@pytest.mark.parametrize("estado", ["caducada", "desactivado"])
def test_reponer_deja_al_admin_activo_con_clave_temporal_nueva_y_fecha(monkeypatch, estado):
    admin, vieja = _cuenta(**(_caducada() if estado == "caducada" else {"activo": False}))
    nueva = _clave()
    monkeypatch.setenv(VARIABLE, nueva)
    antes = timezone.now()

    _reponer()

    admin.refresh_from_db()
    assert admin.activo is True
    assert admin.must_change_password is True
    assert admin.temp_password_set_at >= antes
    assert admin.check_password(nueva)
    assert not admin.check_password(vieja)
    assert _entrar(vieja).status_code == 401
    entrada = _entrar(nueva)
    assert entrada.status_code == 200, entrada.data
    assert entrada.data["data"]["user"]["mustChangePassword"] is True
    bloqueada = _como(entrada.data["data"]["token"]).get(USUARIOS)
    assert bloqueada.status_code == 403
    assert bloqueada.data["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_reponer_cierra_las_sesiones_anteriores_y_su_token_da_401(monkeypatch):
    admin, clave = _cuenta()
    token = _entrar(clave).data["data"]["token"]
    assert _como(token).get(ME).status_code == 200
    monkeypatch.setenv(VARIABLE, _clave())

    _reponer()

    admin.refresh_from_db()
    assert admin.session_epoch == 1
    respuesta = _como(token).get(ME)
    assert respuesta.status_code == 401
    assert respuesta.data["code"] == "TOKEN_INVALID"


@pytest.mark.parametrize("rol", ["PROFESOR", "ESTUDIANTE"])
def test_rechaza_reponer_una_cuenta_que_no_es_de_admin_sin_tocarla(monkeypatch, rol):
    cuenta, _ = _cuenta(role=rol)
    antes = _estado(cuenta)
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError, match="no es de ADMIN"):
        _reponer()

    assert _estado(cuenta) == antes
    assert not AuditLog.objects.filter(action="ADMIN_RESET_BY_COMMAND").exists()


def test_rechaza_reponer_un_correo_sin_cuenta_y_no_crea_nada(monkeypatch):
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError, match="(?i)no hay una cuenta con ese correo para reponer"):
        _reponer(correo=CORREO_SIN_CUENTA)

    assert not User.objects.filter(email=CORREO_SIN_CUENTA).exists()
    assert not AuditLog.objects.filter(action="ADMIN_RESET_BY_COMMAND").exists()


@pytest.mark.parametrize(
    "valor",
    [secrets.token_urlsafe(4), "".join(secrets.choice("0123456789") for _ in range(14))],
    ids=["corta", "solo_digitos"],
)
def test_la_clave_de_reposicion_cumple_las_reglas_y_si_no_cumple_no_toca_nada(monkeypatch, valor):
    admin, _ = _cuenta(**_caducada())
    antes = _estado(admin)
    monkeypatch.setenv(VARIABLE, valor)

    # El aviso lo da AUTH_PASSWORD_VALIDATORS (idioma «es»): siempre habla de la contraseña.
    with pytest.raises(CommandError, match="contrase"):
        _reponer()

    assert _estado(admin) == antes
    assert not AuditLog.objects.filter(action="ADMIN_RESET_BY_COMMAND").exists()


def test_la_auditoria_de_la_reposicion_tiene_el_id_y_nunca_la_clave_ni_el_correo(monkeypatch):
    admin, _ = _cuenta(**_caducada())
    nueva = _clave()
    monkeypatch.setenv(VARIABLE, nueva)

    _reponer()

    filas = list(AuditLog.objects.filter(action="ADMIN_RESET_BY_COMMAND"))
    assert len(filas) == 1
    assert json.loads(filas[0].context_json)["targetId"] == admin.pk
    assert filas[0].resource_id == str(admin.pk), "el recurso de la fila es la cuenta repuesta (S7-5)"
    for fila in AuditLog.objects.all():
        volcado = f"{fila.action} {fila.resource_type} {fila.context_json}"
        assert nueva not in volcado
        assert CORREO not in volcado


def test_la_salida_de_la_reposicion_muestra_el_id_y_no_la_clave_ni_el_correo(monkeypatch):
    admin, _ = _cuenta(**_caducada())
    nueva = _clave()
    monkeypatch.setenv(VARIABLE, nueva)

    salida = _reponer()

    assert nueva not in salida
    assert CORREO not in salida
    assert str(admin.pk) in salida
    assert "temporal" in salida


def test_sin_reset_un_admin_existente_sigue_sin_tocarse(monkeypatch):
    admin, _ = _cuenta(**_caducada())
    antes = _estado(admin)
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError, match="ya está registrado"):
        _crear()

    assert _estado(admin) == antes
    assert not AuditLog.objects.filter(action="ADMIN_RESET_BY_COMMAND").exists()


def test_sin_reset_el_nombre_y_el_apellido_siguen_siendo_obligatorios(monkeypatch):
    monkeypatch.setenv(VARIABLE, _clave())

    with pytest.raises(CommandError, match="--nombre"):
        call_command("create_admin", "--email", CORREO, stdout=io.StringIO())

    assert not User.objects.filter(email=CORREO).exists()
