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

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

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
