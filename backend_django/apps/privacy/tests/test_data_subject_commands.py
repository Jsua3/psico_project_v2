"""S3-4 · Los comandos ``export_personal_data`` y ``erase_personal_data`` (RNF-003).

Reglas comunes: la persona se identifica por ``--email`` (normalizado como el resto del proyecto) o ``--user-id``;
``--executed-by`` (el correo de un ADMIN activo) es OBLIGATORIO, se verifica y se audita por su **id**; ``--dry-run`` no escribe
nada, ni la auditoría; sin ``--dry-run``, ``--confirm`` es obligatorio; la salida nombra cuentas por id y da recuentos, nunca
correos, nombres ni textos. La exportación escribe un archivo nuevo (``--out``), con permisos restringidos en POSIX, y se niega a
sobrescribir uno existente.

Cada garantía lleva su control negativo: con la comprobación apagada, la misma afirmación deja de cumplirse.
"""
import io
import json
import os
import stat

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.privacy import services
from apps.privacy.management.commands import _comun as comun
from apps.privacy.tests.data_subject_support import Entorno, Mundo, volcado
from apps.simulation.models import AuditLog

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
SOLO_POSIX = pytest.mark.skipif(os.name != "posix", reason="los permisos y los enlaces simbólicos de POSIX no existen en Windows")


@pytest.fixture
def entorno(db):
    return Entorno()


@pytest.fixture
def mundo(entorno):
    return Mundo("ana", entorno)


def _llamar(comando, *argumentos):
    salida = io.StringIO()
    call_command(comando, *argumentos, stdout=salida, stderr=io.StringIO())
    return salida.getvalue()


def _suprimir(mundo, *extra, persona=None, ejecutor=None):
    persona = persona or ["--email", mundo.persona.email]
    ejecutor = ejecutor or mundo.entorno.admin.email
    return _llamar("erase_personal_data", *persona, "--executed-by", ejecutor, *extra)


def _exportar(mundo, *extra, persona=None):
    persona = persona or ["--email", mundo.persona.email]
    return _llamar("export_personal_data", *persona, "--executed-by", mundo.entorno.admin.email, *extra)


def _datos_personales(mundo):
    """Todo lo que ninguna salida de un comando puede traer."""
    persona, entorno = mundo.persona, mundo.entorno
    return [
        persona.email, persona.nombre, persona.apellido, entorno.admin.email, entorno.docente.email, entorno.alumno.email,
        *mundo.marcadores_a_borrar(), mundo.m["comentario"],
    ]


def _afirmar_salida_limpia(salida, mundo, *rutas):
    for dato in (*_datos_personales(mundo), *rutas):
        assert dato not in salida, f"la salida trae «{dato}»"


# ── erase_personal_data ──────────────────────────────────────────────────────────────────────────────────────────


def test_suprimir_con_confirm_suprime_y_la_salida_nombra_ids_y_recuentos_sin_datos_personales(mundo):
    salida = _suprimir(mundo, "--confirm")

    mundo.persona.refresh_from_db()
    assert mundo.persona.activo is False and mundo.persona.email.startswith("eliminada-")
    assert str(mundo.persona.pk) in salida and str(mundo.entorno.admin.pk) in salida
    assert "users" in salida and "reflection_journals" in salida  # recuentos por tabla
    _afirmar_salida_limpia(salida, mundo)


def test_suprimir_sin_confirm_falla_y_no_toca_nada(mundo):
    antes = volcado()

    with pytest.raises(CommandError, match="--confirm"):
        _suprimir(mundo)

    assert volcado() == antes


def test_control_negativo_sin_la_comprobacion_de_confirm_el_comando_suprimiria(mundo, monkeypatch):
    antes = volcado()
    monkeypatch.setattr(comun, "exigir_confirmacion", lambda opciones: None)

    _suprimir(mundo)

    assert volcado() != antes


def test_suprimir_sin_executed_by_falla_y_no_toca_nada(mundo):
    antes = volcado()

    with pytest.raises(CommandError, match="executed-by"):
        _llamar("erase_personal_data", "--email", mundo.persona.email, "--confirm")

    assert volcado() == antes


@pytest.mark.parametrize("quien", ["estudiante", "docente", "admin_inactivo", "correo_inexistente", "la_propia_persona"])
def test_suprimir_con_un_executed_by_que_no_es_un_admin_activo_falla_sin_decir_el_correo_y_sin_tocar_nada(mundo, quien):
    entorno = mundo.entorno
    if quien == "admin_inactivo":
        User.objects.filter(pk=entorno.admin.pk).update(activo=False)
    correo = {
        "estudiante": entorno.alumno.email,
        "docente": entorno.docente.email,
        "admin_inactivo": entorno.admin.email,
        "correo_inexistente": "nadie@example.com",
        "la_propia_persona": mundo.persona.email,
    }[quien]
    antes = volcado()

    with pytest.raises(CommandError) as error:
        _suprimir(mundo, "--confirm", ejecutor=correo)

    assert correo not in str(error.value)
    assert volcado() == antes


def test_control_negativo_sin_verificar_a_quien_ejecuta_un_estudiante_suprimiria(mundo, monkeypatch):
    antes = volcado()
    monkeypatch.setattr(services, "verificar_ejecutor", lambda executed_by: executed_by)

    _suprimir(mundo, "--confirm", ejecutor=mundo.entorno.alumno.email)

    assert volcado() != antes


def test_suprimir_con_dry_run_no_escribe_nada_ni_la_auditoria_y_dice_que_haria(mundo):
    antes = volcado()

    salida = _suprimir(mundo, "--dry-run")

    assert volcado() == antes
    assert "simulacro" in salida.lower() and "users" in salida
    _afirmar_salida_limpia(salida, mundo)


def test_el_dry_run_no_pide_confirm(mundo):
    assert _suprimir(mundo, "--dry-run")


def test_suprimir_encuentra_a_la_persona_por_su_correo_normalizado_o_por_su_id(mundo, entorno):
    otra = Mundo("beto", entorno)
    _suprimir(mundo, "--confirm", persona=["--email", f"  {mundo.persona.email.upper()}  "])
    mundo.persona.refresh_from_db()
    assert mundo.persona.activo is False

    _suprimir(otra, "--confirm", persona=["--user-id", str(otra.persona.pk)])
    otra.persona.refresh_from_db()
    assert otra.persona.activo is False


def test_hay_que_dar_el_correo_o_el_id_pero_no_los_dos(mundo):
    antes = volcado()

    with pytest.raises(CommandError):
        _llamar("erase_personal_data", "--executed-by", mundo.entorno.admin.email, "--confirm")
    with pytest.raises(CommandError):
        _suprimir(mundo, "--confirm", persona=["--email", mundo.persona.email, "--user-id", str(mundo.persona.pk)])

    assert volcado() == antes


def test_las_opciones_no_se_abrevian_ni_aceptan_un_id_que_no_es_un_numero(mundo):
    """Sin abreviaturas: un «--exec» no puede colarse como «--executed-by»; y un id no numérico es un error de uso."""
    antes = volcado()

    with pytest.raises(CommandError):
        _llamar(
            "erase_personal_data", "--email", mundo.persona.email, "--exec", mundo.entorno.admin.email, "--confirm"
        )
    with pytest.raises(CommandError):
        _llamar(
            "erase_personal_data", "--user-id", "no-es-un-numero", "--executed-by", mundo.entorno.admin.email, "--confirm"
        )

    assert volcado() == antes


@pytest.mark.parametrize("persona", [["--email", "nadie-de-nada@example.com"], ["--user-id", "2000000000"]])
def test_una_persona_que_no_existe_falla_con_un_mensaje_claro_sin_repetir_el_correo(mundo, persona):
    antes = volcado()

    with pytest.raises(CommandError, match="cuenta") as error:
        _suprimir(mundo, "--confirm", persona=persona)

    assert "nadie-de-nada" not in str(error.value)
    assert volcado() == antes


def test_un_admin_no_se_suprime_por_el_comando(mundo):
    User.objects.filter(pk=mundo.persona.pk).update(role="ADMIN")
    antes = volcado()

    with pytest.raises(CommandError, match="quita el rol"):
        _suprimir(mundo, "--confirm")

    assert volcado() == antes


def test_repetir_el_comando_no_falla_ni_cambia_nada(mundo):
    _suprimir(mundo, "--confirm", persona=["--user-id", str(mundo.persona.pk)])
    despues = volcado()

    salida = _suprimir(mundo, "--confirm", persona=["--user-id", str(mundo.persona.pk)])

    assert volcado() == despues
    assert "ya estaba suprimida" in salida.lower()


def test_el_comando_audita_con_el_id_del_admin_y_nunca_con_su_correo(mundo):
    _suprimir(mundo, "--confirm")

    [evento] = AuditLog.objects.filter(action="PERSONAL_DATA_ERASED")
    assert evento.actor_id == mundo.entorno.admin.pk
    contexto = json.loads(evento.context_json)
    assert contexto["executedBy"] == mundo.entorno.admin.pk and contexto["targetId"] == mundo.persona.pk
    assert mundo.entorno.admin.email not in json.dumps([evento.context_json, evento.resource_id, evento.user_agent])


# ── export_personal_data ─────────────────────────────────────────────────────────────────────────────────────────


def _leer(ruta):
    with open(ruta, encoding="utf-8") as archivo:
        return json.load(archivo)


def test_exportar_escribe_el_archivo_con_todo_lo_suyo_y_la_salida_no_trae_datos_personales(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"

    salida = _exportar(mundo, "--confirm", "--out", str(ruta))

    contenido = _leer(ruta)
    esperado = services.export_person(mundo.persona)
    contenido.pop("generadoEn"), esperado.pop("generadoEn")
    assert contenido == esperado
    assert contenido["tablas"]["users"][0]["email"] == mundo.persona.email
    assert [f["text"] for f in contenido["tablas"]["reflection_journals"]] == [f"Reflexion {mundo.m['reflexion']}"]
    assert str(mundo.persona.pk) in salida
    _afirmar_salida_limpia(salida, mundo, str(ruta), ruta.name)


def test_exportar_nunca_escribe_el_contenido_por_la_salida_estandar(mundo, tmp_path):
    salida = _exportar(mundo, "--confirm", "--out", str(tmp_path / "x.json"))

    assert len(salida) < 600, "la salida es un resumen, no la exportación"
    assert "{" not in salida


def test_exportar_sin_out_falla_y_no_deja_nada(mundo):
    antes = volcado()

    with pytest.raises(CommandError, match="--out"):
        _exportar(mundo, "--confirm")

    assert volcado() == antes


def test_exportar_sin_confirm_falla_y_no_crea_el_archivo(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"

    with pytest.raises(CommandError, match="--confirm"):
        _exportar(mundo, "--out", str(ruta))

    assert not ruta.exists()


def test_exportar_se_niega_a_sobrescribir_un_archivo_existente_y_no_lo_toca(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"
    ruta.write_text("contenido de antes", encoding="utf-8")

    with pytest.raises(CommandError, match="existe"):
        _exportar(mundo, "--confirm", "--out", str(ruta))

    assert ruta.read_text(encoding="utf-8") == "contenido de antes"
    assert not AuditLog.objects.filter(action="PERSONAL_DATA_EXPORTED").exists()


def test_control_negativo_si_el_archivo_se_abriera_para_truncar_se_sobrescribiria(mundo, tmp_path, monkeypatch):
    ruta = tmp_path / "exportacion.json"
    ruta.write_text("contenido de antes", encoding="utf-8")
    monkeypatch.setattr(comun, "BANDERAS_DE_APERTURA", os.O_WRONLY | os.O_CREAT | os.O_TRUNC)

    _exportar(mundo, "--confirm", "--out", str(ruta))

    assert ruta.read_text(encoding="utf-8") != "contenido de antes"


def test_exportar_a_una_carpeta_que_no_existe_falla_con_un_mensaje_claro(mundo, tmp_path):
    with pytest.raises(CommandError, match="carpeta"):
        _exportar(mundo, "--confirm", "--out", str(tmp_path / "no-existe" / "x.json"))


@SOLO_POSIX
def test_el_archivo_exportado_queda_con_permisos_restringidos(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"

    _exportar(mundo, "--confirm", "--out", str(ruta))

    assert stat.S_IMODE(os.stat(ruta).st_mode) == 0o600


@SOLO_POSIX
def test_control_negativo_con_otros_permisos_el_archivo_quedaria_abierto(mundo, tmp_path, monkeypatch):
    ruta = tmp_path / "exportacion.json"
    monkeypatch.setattr(comun, "PERMISOS_DEL_ARCHIVO", 0o666)
    antigua = os.umask(0)
    try:
        _exportar(mundo, "--confirm", "--out", str(ruta))
    finally:
        os.umask(antigua)

    assert stat.S_IMODE(os.stat(ruta).st_mode) != 0o600


@SOLO_POSIX
def test_exportar_no_sigue_un_enlace_simbolico_hacia_otro_archivo(mundo, tmp_path):
    destino = tmp_path / "destino.json"
    destino.write_text("contenido de antes", encoding="utf-8")
    enlace = tmp_path / "enlace.json"
    os.symlink(destino, enlace)

    with pytest.raises(CommandError):
        _exportar(mundo, "--confirm", "--out", str(enlace))

    assert destino.read_text(encoding="utf-8") == "contenido de antes"


def test_exportar_con_dry_run_no_escribe_el_archivo_ni_la_auditoria_y_cuenta_lo_que_haria(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"
    antes = volcado()

    salida = _exportar(mundo, "--dry-run", "--out", str(ruta))

    assert not ruta.exists()
    assert volcado() == antes
    assert "simulacro" in salida.lower()
    _afirmar_salida_limpia(salida, mundo, str(ruta))


def test_exportar_con_dry_run_funciona_sin_out_y_se_niega_si_el_archivo_existe(mundo, tmp_path):
    assert _exportar(mundo, "--dry-run")
    ruta = tmp_path / "ya-existe.json"
    ruta.write_text("x", encoding="utf-8")

    with pytest.raises(CommandError, match="existe"):
        _exportar(mundo, "--dry-run", "--out", str(ruta))


def test_exportar_deja_un_evento_con_los_ids_y_los_recuentos(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"

    _exportar(mundo, "--confirm", "--out", str(ruta))

    [evento] = AuditLog.objects.filter(action="PERSONAL_DATA_EXPORTED")
    contenido = _leer(ruta)
    assert evento.actor_id == mundo.entorno.admin.pk and evento.resource_id == str(mundo.persona.pk)
    assert json.loads(evento.context_json) == {
        "taxonomy": "datos.exportar", "targetId": mundo.persona.pk, "executedBy": mundo.entorno.admin.pk,
        "rows": contenido["resumen"]["filas"], "tables": contenido["resumen"]["tablas"],
    }


def test_exportar_no_cambia_ningun_dato_de_la_persona(mundo, tmp_path):
    antes = {t: filas for t, filas in volcado().items() if t != "audit_logs"}

    _exportar(mundo, "--confirm", "--out", str(tmp_path / "exportacion.json"))

    assert {t: filas for t, filas in volcado().items() if t != "audit_logs"} == antes


def test_exportar_comprueba_a_quien_ejecuta_antes_de_escribir(mundo, tmp_path):
    ruta = tmp_path / "exportacion.json"

    with pytest.raises(CommandError):
        _llamar(
            "export_personal_data", "--email", mundo.persona.email, "--executed-by", mundo.entorno.alumno.email,
            "--confirm", "--out", str(ruta),
        )

    assert not ruta.exists()
