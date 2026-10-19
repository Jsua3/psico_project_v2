"""Las siembras de demostración solo corren en desarrollo (S5-4, SF-19).

``seed_demo_access``, ``seed_demo_users`` y ``bootstrap_dev_db`` se niegan con los ajustes de
producción o con ``DATABASE_URL`` definido, salvo la excepción ``SIEP_ALLOW_DEMO_SEED``; una cuenta
demo que ya existe no se repone sin ``--reset``; ``seed_caso_pdf`` no restablece la clave del admin
y ``seed_caso_pdf``/``seed_default_rubric`` solo crean la cuenta demo en desarrollo.
"""
import secrets
from io import StringIO

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.simulation.management.commands import bootstrap_dev_db as bootstrap_cmd
from apps.simulation.management.commands import seed_caso_pdf as caso_cmd
from apps.simulation.management.commands import seed_demo_access
from apps.users.models import CustomUser, UserRole
from shared import dev_only
from shared.testing import assert_queries_at_most

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.req("RNF-01"),
    pytest.mark.req("D-5"),
    pytest.mark.security,
]

ADMIN_EMAIL = "admin@psychosim.edu.co"
DSN_DE_PLATAFORMA = "postgresql://u@h/d"  # no es un secreto: el guard solo comprueba que exista
COMANDOS = ("seed_demo_users", "seed_demo_access")
DEMO_ADMIN = next(spec for spec in seed_demo_access.DEMO_USERS if spec["role"] == "ADMIN")


def _correr(comando, *args):
    """Corre la siembra como la corre el operador; ``seed_demo_access`` sin el caso completo."""
    salida = StringIO()
    extra = ("--skip-case-seed",) if comando == "seed_demo_access" else ()
    call_command(comando, *extra, *args, stdout=salida)
    return salida.getvalue()


def _cuenta_demo_admin_existente(clave):
    """Deja la cuenta admin demo como la tendría alguien que la cambió: otro rol, inactiva, otra clave."""
    cuenta = CustomUser.objects.filter(email=ADMIN_EMAIL).first()
    if cuenta is None:
        cuenta = CustomUser.objects.create_user(
            email=ADMIN_EMAIL,
            password=clave,
            nombre="Cuenta",
            apellido="Existente",
            role=UserRole.ESTUDIANTE,
            activo=True,
        )
    cuenta.set_password(clave)
    cuenta.nombre = "Cuenta"
    cuenta.apellido = "Existente"
    cuenta.role = UserRole.ESTUDIANTE
    cuenta.activo = False
    cuenta.save()
    return cuenta


def _retirar_admin_demo():
    """Saca la cuenta admin demo de la prueba: otro correo y sin rol ADMIN (la transacción lo deshace)."""
    CustomUser.objects.filter(email=ADMIN_EMAIL).update(
        email=f"retirado-{secrets.token_hex(8)}@example.org", role=UserRole.PROFESOR
    )


def _admin_alterno(activo=True):
    """Crea un ADMIN distinto del demo; con ``activo=False``, uno inactivo."""
    return CustomUser.objects.create_user(
        email=f"alterno-{secrets.token_hex(8)}@example.org",
        password=secrets.token_urlsafe(24),
        nombre="Otro",
        apellido="Admin",
        role=UserRole.ADMIN,
        activo=activo,
    )


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch):
    """Ni la excepción ni una base de plataforma del shell de quien corre la prueba."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SIEP_ALLOW_DEMO_SEED", raising=False)


@pytest.mark.parametrize("comando", COMANDOS)
def test_se_niega_con_los_ajustes_de_produccion_antes_de_tocar_la_base(comando, settings):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    cuentas_antes = CustomUser.objects.count()

    with assert_queries_at_most(0):
        with pytest.raises(CommandError, match=comando):
            _correr(comando)

    assert CustomUser.objects.count() == cuentas_antes


@pytest.mark.parametrize("comando", COMANDOS)
def test_se_niega_con_database_url_sin_imprimir_su_valor(comando, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", DSN_DE_PLATAFORMA)
    cuentas_antes = CustomUser.objects.count()

    with assert_queries_at_most(0):
        with pytest.raises(CommandError, match="DATABASE_URL") as error:
            _correr(comando)

    assert DSN_DE_PLATAFORMA not in str(error.value)
    assert CustomUser.objects.count() == cuentas_antes


@pytest.mark.parametrize("comando", COMANDOS)
@pytest.mark.parametrize("valor", ["1", "true", "YES", "On"])
def test_la_excepcion_explicita_permite_correr_aunque_haya_senales(comando, valor, settings, monkeypatch):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    monkeypatch.setenv("DATABASE_URL", DSN_DE_PLATAFORMA)
    monkeypatch.setenv("SIEP_ALLOW_DEMO_SEED", valor)

    _correr(comando)


@pytest.mark.parametrize("valor", ["0", "false", "no", ""])
def test_otros_valores_de_la_excepcion_no_la_activan(valor, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", DSN_DE_PLATAFORMA)
    monkeypatch.setenv("SIEP_ALLOW_DEMO_SEED", valor)

    with pytest.raises(CommandError, match="seed_demo_users"):
        _correr("seed_demo_users")


@pytest.mark.parametrize("comando", COMANDOS)
def test_el_error_fuera_de_desarrollo_no_enseña_como_saltarse_la_guarda(comando, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", DSN_DE_PLATAFORMA)

    with pytest.raises(CommandError) as error:
        _correr(comando)

    assert dev_only.ALLOW_ENV not in str(error.value)
    assert "create_admin" in str(error.value)


@pytest.mark.parametrize("comando", COMANDOS)
def test_sin_senales_corre_como_en_las_pruebas(comando):
    _correr(comando)


def test_seed_demo_access_no_repone_una_cuenta_que_ya_existe():
    clave = secrets.token_urlsafe(24)
    cuenta = _cuenta_demo_admin_existente(clave)

    salida = _correr("seed_demo_access")

    cuenta.refresh_from_db()
    assert cuenta.check_password(clave)
    assert cuenta.role == UserRole.ESTUDIANTE
    assert cuenta.activo is False
    assert cuenta.nombre == "Cuenta"
    assert cuenta.apellido == "Existente"
    assert f"Ya existe: {ADMIN_EMAIL}" in salida


def test_seed_demo_users_no_repone_una_cuenta_que_ya_existe():
    clave = secrets.token_urlsafe(24)
    cuenta = _cuenta_demo_admin_existente(clave)

    salida = _correr("seed_demo_users")

    cuenta.refresh_from_db()
    assert cuenta.check_password(clave)
    assert cuenta.role == UserRole.ESTUDIANTE
    assert cuenta.activo is False
    assert f"Ya existe: {ADMIN_EMAIL}" in salida


def test_con_reset_seed_demo_access_repone_la_cuenta_existente():
    clave = secrets.token_urlsafe(24)
    cuenta = _cuenta_demo_admin_existente(clave)

    _correr("seed_demo_access", "--reset")

    cuenta.refresh_from_db()
    assert cuenta.check_password(DEMO_ADMIN["password"])
    assert cuenta.role == UserRole.ADMIN
    assert cuenta.activo is True
    assert cuenta.nombre == DEMO_ADMIN["nombre"]
    assert cuenta.apellido == DEMO_ADMIN["apellido"]


def test_seed_caso_pdf_no_repone_clave_rol_ni_activo_de_un_admin_existente():
    clave = secrets.token_urlsafe(24)
    cuenta = _cuenta_demo_admin_existente(clave)

    call_command("seed_caso_pdf", stdout=StringIO())

    cuenta.refresh_from_db()
    assert cuenta.check_password(clave)
    assert cuenta.role == UserRole.ESTUDIANTE
    assert cuenta.activo is False


def test_seed_caso_pdf_fuera_de_desarrollo_sin_admin_activo_se_niega_sin_crear_la_demo(settings):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    _retirar_admin_demo()
    _admin_alterno(activo=False)

    with pytest.raises(CommandError, match="ningún ADMIN activo"):
        call_command("seed_caso_pdf", stdout=StringIO())

    assert not CustomUser.objects.filter(email=ADMIN_EMAIL).exists()


def test_seed_caso_pdf_fuera_de_desarrollo_usa_el_admin_activo_que_no_es_el_demo(settings):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    _retirar_admin_demo()
    alterno = _admin_alterno()

    assert caso_cmd.Command()._admin() == alterno
    call_command("seed_caso_pdf", stdout=StringIO())

    assert not CustomUser.objects.filter(email=ADMIN_EMAIL).exists()


def test_en_desarrollo_seed_caso_pdf_crea_la_cuenta_demo_si_falta():
    _retirar_admin_demo()

    call_command("seed_caso_pdf", stdout=StringIO())

    cuenta = CustomUser.objects.get(email=ADMIN_EMAIL)
    assert cuenta.role == UserRole.ADMIN
    assert cuenta.activo is True


def test_seed_default_rubric_fuera_de_desarrollo_sin_admin_se_niega_sin_crear_la_demo(settings):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    _retirar_admin_demo()

    with pytest.raises(CommandError, match="ningún ADMIN"):
        call_command("seed_default_rubric", stdout=StringIO())

    assert not CustomUser.objects.filter(email=ADMIN_EMAIL).exists()


def test_seed_default_rubric_fuera_de_desarrollo_usa_un_admin_existente(settings):
    settings.SETTINGS_MODULE = "psychosim.settings.production"
    _retirar_admin_demo()
    _admin_alterno()

    call_command("seed_default_rubric", stdout=StringIO())

    assert not CustomUser.objects.filter(email=ADMIN_EMAIL).exists()


def test_en_desarrollo_seed_default_rubric_crea_la_cuenta_demo_si_falta():
    _retirar_admin_demo()

    call_command("seed_default_rubric", stdout=StringIO())

    assert CustomUser.objects.filter(email=ADMIN_EMAIL, role=UserRole.ADMIN).exists()


@pytest.mark.parametrize("senal", ["ajustes_de_produccion", "database_url"])
def test_bootstrap_dev_db_se_niega_fuera_de_desarrollo_sin_llegar_a_migrar(senal, settings, monkeypatch):
    llamadas = []
    monkeypatch.setattr(bootstrap_cmd, "call_command", lambda nombre, *args, **kwargs: llamadas.append(nombre))
    if senal == "ajustes_de_produccion":
        settings.SETTINGS_MODULE = "psychosim.settings.production"
    else:
        monkeypatch.setenv("DATABASE_URL", DSN_DE_PLATAFORMA)

    with pytest.raises(CommandError, match="bootstrap_dev_db"):
        call_command("bootstrap_dev_db", stdout=StringIO())

    assert llamadas == []


@pytest.mark.parametrize(
    ("ajustes", "database_url", "excepcion", "esperado"),
    [
        ("psychosim.settings.test", None, None, True),
        ("psychosim.settings.production", None, None, False),
        ("psychosim.settings.test", DSN_DE_PLATAFORMA, None, False),
        ("psychosim.settings.production", DSN_DE_PLATAFORMA, "true", True),
        ("psychosim.settings.test", None, "0", True),
    ],
)
def test_is_dev_environment_usa_las_mismas_senales(ajustes, database_url, excepcion, esperado, settings, monkeypatch):
    settings.SETTINGS_MODULE = ajustes
    if database_url is not None:
        monkeypatch.setenv("DATABASE_URL", database_url)
    if excepcion is not None:
        monkeypatch.setenv("SIEP_ALLOW_DEMO_SEED", excepcion)

    assert dev_only.is_dev_environment() is esperado


def test_is_dev_environment_no_lanza_sin_ajustes_configurados(monkeypatch):
    class SinAjustes:
        @property
        def SETTINGS_MODULE(self):
            raise ImproperlyConfigured("sin ajustes")

    monkeypatch.setattr(dev_only, "settings", SinAjustes())

    assert dev_only.is_dev_environment() is False
