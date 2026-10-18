"""S3-2a · El servicio de consentimiento (``consent_service``), sin pasar por HTTP.

Cubre lo que las rutas y la exigencia comparten: la versión vigente, el registro idempotente y atómico (también con dos
hilos a la vez), el retiro, y la matriz de ``require_consent`` con sus dos banderas. ``DATA_TREATMENT`` no tiene ruta
todavía: se registra con el servicio.
"""
import json
import secrets
import threading

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status

from apps.privacy import consent_service
from apps.privacy.models import ConsentRecord, ConsentType
from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service
from shared.exceptions import ApiError
from shared.testing import run_concurrently

from .support import crear_persona, crear_version, version_publicada as _version_publicada

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]


def _vigente(settings):
    return settings.SIEP_CONTENT_NOTICE_VERSION


def _error(llamada):
    """El ``ApiError`` que lanza ``llamada`` (la prueba falla si no lanza ninguno)."""
    with pytest.raises(ApiError) as capturado:
        llamada()
    return capturado.value


# ── El estado ────────────────────────────────────────────────────────────────────────────────────────────


def test_el_estado_sin_registro(settings, estudiante_a, version_publicada):
    estado = consent_service.consent_state(estudiante_a, version_publicada)

    assert (estado.required, estado.notice_version, estado.accepted, estado.accepted_at) == (
        False, _vigente(settings), False, None
    )


def test_el_estado_tras_aceptar_trae_la_hora_y_acepta_el_caso_como_objeto_o_como_id(settings, estudiante_a, version_publicada):
    registro, _ = consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))

    por_objeto = consent_service.consent_state(estudiante_a, version_publicada)
    por_id = consent_service.consent_state(estudiante_a, version_publicada.id)

    assert por_objeto == por_id
    assert por_objeto.accepted is True and por_objeto.accepted_at == registro.accepted_at


def test_el_estado_dice_si_el_servidor_exige_el_consentimiento(settings, estudiante_a, version_publicada):
    settings.SIEP_CONSENT_REQUIRED = True

    assert consent_service.consent_state(estudiante_a, version_publicada).required is True


# ── Aceptar ──────────────────────────────────────────────────────────────────────────────────────────────


def test_aceptar_devuelve_el_registro_y_si_se_creo(settings, estudiante_a, version_publicada):
    primero, creado = consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))
    segundo, creado_otra_vez = consent_service.accept_content_notice(estudiante_a, version_publicada.id, _vigente(settings))

    assert (creado, creado_otra_vez) == (True, False)
    assert segundo.pk == primero.pk
    assert (primero.consent_type, primero.case_version_id, primero.person_id) == (
        ConsentType.CONTENT_NOTICE, version_publicada.id, estudiante_a.id
    )
    assert ConsentRecord.objects.count() == 1


@pytest.mark.parametrize("enviada", ["otra-version", "", "   ", None], ids=["otra", "vacía", "espacios", "nula"])
def test_aceptar_con_una_version_que_no_es_la_vigente_lanza_409_con_la_vigente(settings, estudiante_a, version_publicada, enviada):
    error = _error(lambda: consent_service.accept_content_notice(estudiante_a, version_publicada, enviada))

    assert (error.api_code, error.status_code) == ("NOTICE_VERSION_STALE", status.HTTP_409_CONFLICT)
    assert error.extra == {"noticeVersion": _vigente(settings)}
    assert not ConsentRecord.objects.exists()


def test_cambiar_la_version_vigente_invalida_lo_aceptado_y_se_acepta_de_nuevo_la_nueva(settings, estudiante_a, version_publicada):
    consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))
    settings.SIEP_CONTENT_NOTICE_VERSION = "2026-11-borrador"

    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False
    nuevo, creado = consent_service.accept_content_notice(estudiante_a, version_publicada, "2026-11-borrador")

    assert creado is True and consent_service.has_valid_consent(estudiante_a, version_publicada) is True
    assert nuevo.notice_version == "2026-11-borrador"
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 2  # la aceptación vieja sigue como evidencia


def test_dos_aceptaciones_a_la_vez_dejan_una_sola_fila_una_sola_creacion_y_una_sola_auditoria(real_commits, monkeypatch):
    """La última defensa es el índice único: quien pierde la carrera recibe el registro ganador, no un 500."""
    persona = crear_persona("ESTUDIANTE", "carrera")
    version = _version_publicada()
    vigente = consent_service.content_notice_version()
    auditorias, cerrojo = [], threading.Lock()

    def anotar(actor_id, actor_role, action, *resto):
        with cerrojo:
            auditorias.append(action)

    # La auditoría real haría commits que esta prueba tendría que borrar: aquí solo se cuenta lo que se habría escrito.
    monkeypatch.setattr(audit_service, "append", anotar)

    def aceptar():
        return consent_service.accept_content_notice(persona, version, vigente)

    try:
        resultados = run_concurrently(aceptar, aceptar)

        assert [r.error for r in resultados] == [None, None]
        assert sorted(creado for _registro, creado in (r.value for r in resultados)) == [False, True]
        assert resultados[0].value[0].pk == resultados[1].value[0].pk
        assert ConsentRecord.objects.filter(person=persona).count() == 1
        assert auditorias == ["consentimiento.aceptar"]
    finally:
        ConsentRecord.objects.filter(person=persona).delete()
        persona.delete()


def test_dos_retiros_a_la_vez_retiran_una_vez_y_dejan_una_sola_auditoria(real_commits, monkeypatch):
    persona = crear_persona("ESTUDIANTE", "retiro")
    version = _version_publicada()
    vigente = consent_service.content_notice_version()
    auditorias, cerrojo = [], threading.Lock()

    def anotar(actor_id, actor_role, action, *resto):
        with cerrojo:
            auditorias.append(action)

    monkeypatch.setattr(audit_service, "append", anotar)

    def retirar():
        return consent_service.withdraw_content_notice(persona, version)

    try:
        consent_service.accept_content_notice(persona, version, vigente)
        auditorias.clear()  # solo interesa lo que escriba el retiro

        resultados = run_concurrently(retirar, retirar)

        assert [r.error for r in resultados] == [None, None]
        assert sorted(r.value is None for r in resultados) == [False, True]  # una retiró, la otra no encontró nada vigente
        assert ConsentRecord.objects.get(person=persona).withdrawn_at is not None
        assert auditorias == ["consentimiento.retirar"]
    finally:
        ConsentRecord.objects.filter(person=persona).delete()
        persona.delete()


# ── Retirar ──────────────────────────────────────────────────────────────────────────────────────────────


def test_retirar_devuelve_la_hora_y_marca_lo_vigente(settings, estudiante_a, version_publicada):
    registro, _ = consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))

    retirado_en = consent_service.withdraw_content_notice(estudiante_a, version_publicada)

    registro.refresh_from_db()
    assert retirado_en is not None and registro.withdrawn_at == retirado_en
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False


def test_retirar_sin_nada_vigente_devuelve_nulo_y_no_toca_nada(estudiante_a, version_publicada):
    assert consent_service.withdraw_content_notice(estudiante_a, version_publicada) is None
    assert not ConsentRecord.objects.exists()


def test_retirar_no_cambia_lo_ya_retirado(settings, estudiante_a, version_publicada):
    consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))
    primero = consent_service.withdraw_content_notice(estudiante_a, version_publicada)

    segundo = consent_service.withdraw_content_notice(estudiante_a, version_publicada)

    assert segundo is None
    assert ConsentRecord.objects.get().withdrawn_at == primero


def test_retirar_solo_afecta_a_esa_persona_y_a_ese_caso(settings, estudiante_a, estudiante_b, version_publicada, docente):
    otra = crear_version(docente, estado="PUBLISHED")
    for persona, version in ((estudiante_a, version_publicada), (estudiante_a, otra), (estudiante_b, version_publicada)):
        consent_service.accept_content_notice(persona, version, _vigente(settings))

    consent_service.withdraw_content_notice(estudiante_a, version_publicada)

    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False
    assert consent_service.has_valid_consent(estudiante_a, otra) is True
    assert consent_service.has_valid_consent(estudiante_b, version_publicada) is True


# ── has_valid_consent ────────────────────────────────────────────────────────────────────────────────────


def test_solo_cuenta_el_consentimiento_vigente_de_la_version_actual_del_aviso(settings, estudiante_a, version_publicada):
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=version_publicada, notice_version="aviso-viejo"
    )
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False  # es de otra versión del aviso
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=version_publicada,
        notice_version=_vigente(settings), withdrawn_at=timezone.now(),
    )
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False  # está retirado
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.DATA_TREATMENT, case_version=None, notice_version=_vigente(settings)
    )
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is False  # es de otro tipo
    consent_service.accept_content_notice(estudiante_a, version_publicada, _vigente(settings))
    assert consent_service.has_valid_consent(estudiante_a, version_publicada) is True


# ── require_consent: la matriz de las dos banderas ───────────────────────────────────────────────────────


def _con_aviso(persona, version, settings):
    consent_service.accept_content_notice(persona, version, _vigente(settings))


def _con_tratamiento(persona, settings):
    consent_service.accept_data_treatment(persona, settings.SIEP_DATA_TREATMENT_NOTICE_VERSION)


@pytest.fixture
def tratamiento_configurado(settings):
    settings.SIEP_DATA_TREATMENT_NOTICE_VERSION = "datos-1"
    return settings


def test_con_las_dos_banderas_apagadas_no_hace_nada_ni_consulta_la_base(settings, estudiante_a, version_publicada):
    assert settings.SIEP_CONSENT_REQUIRED is False and settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED is False

    with CaptureQueriesContext(connection) as capturadas:
        assert consent_service.require_consent(estudiante_a, version_publicada) is None
        assert consent_service.require_consent(estudiante_a, version_publicada.id) is None

    assert len(capturadas) == 0


def test_con_la_bandera_del_aviso_encendida_y_sin_consentimiento_lanza_403_con_la_version_vigente(settings, estudiante_a, version_publicada):
    settings.SIEP_CONSENT_REQUIRED = True

    error = _error(lambda: consent_service.require_consent(estudiante_a, version_publicada))

    assert (error.api_code, error.status_code) == ("CONSENT_REQUIRED", status.HTTP_403_FORBIDDEN)
    assert error.extra == {"noticeVersion": _vigente(settings)}


def test_con_la_bandera_del_aviso_encendida_y_consentimiento_vigente_pasa(settings, estudiante_a, version_publicada):
    settings.SIEP_CONSENT_REQUIRED = True
    _con_aviso(estudiante_a, version_publicada, settings)

    assert consent_service.require_consent(estudiante_a, version_publicada) is None


def test_el_consentimiento_de_otro_caso_o_de_otra_version_del_aviso_no_sirve(settings, estudiante_a, version_publicada, docente):
    settings.SIEP_CONSENT_REQUIRED = True
    consent_service.accept_content_notice(estudiante_a, crear_version(docente, estado="PUBLISHED"), _vigente(settings))
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=version_publicada, notice_version="aviso-viejo"
    )

    assert _error(lambda: consent_service.require_consent(estudiante_a, version_publicada)).api_code == "CONSENT_REQUIRED"


def test_con_la_bandera_del_tratamiento_encendida_y_sin_registro_lanza_403(settings, tratamiento_configurado, estudiante_a, version_publicada):
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True

    error = _error(lambda: consent_service.require_consent(estudiante_a, version_publicada))

    assert (error.api_code, error.status_code) == ("DATA_TREATMENT_CONSENT_REQUIRED", status.HTTP_403_FORBIDDEN)
    assert error.extra == {"noticeVersion": "datos-1"}


def test_con_la_bandera_del_tratamiento_encendida_y_registrado_con_el_servicio_pasa(settings, tratamiento_configurado, estudiante_a, version_publicada):
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True
    _con_tratamiento(estudiante_a, settings)

    assert consent_service.require_consent(estudiante_a, version_publicada) is None


def test_el_tratamiento_de_datos_no_depende_del_caso(settings, tratamiento_configurado, estudiante_a, docente):
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True
    _con_tratamiento(estudiante_a, settings)

    for _ in range(2):
        assert consent_service.require_consent(estudiante_a, crear_version(docente, estado="PUBLISHED")) is None


def test_con_las_dos_banderas_encendidas_se_exige_primero_el_aviso_y_despues_el_tratamiento(settings, tratamiento_configurado, estudiante_a, version_publicada):
    settings.SIEP_CONSENT_REQUIRED = True
    settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED = True

    assert _error(lambda: consent_service.require_consent(estudiante_a, version_publicada)).api_code == "CONSENT_REQUIRED"
    _con_aviso(estudiante_a, version_publicada, settings)
    assert _error(lambda: consent_service.require_consent(estudiante_a, version_publicada)).api_code == "DATA_TREATMENT_CONSENT_REQUIRED"
    _con_tratamiento(estudiante_a, settings)
    assert consent_service.require_consent(estudiante_a, version_publicada) is None


# ── DATA_TREATMENT (sin ruta todavía) ────────────────────────────────────────────────────────────────────


def test_aceptar_el_tratamiento_de_datos_es_idempotente_y_no_lleva_caso(settings, tratamiento_configurado, estudiante_a):
    primero, creado = consent_service.accept_data_treatment(estudiante_a, "datos-1")
    segundo, creado_otra_vez = consent_service.accept_data_treatment(estudiante_a, "datos-1")

    assert (creado, creado_otra_vez) == (True, False) and segundo.pk == primero.pk
    assert (primero.consent_type, primero.case_version_id, primero.notice_version) == (ConsentType.DATA_TREATMENT, None, "datos-1")
    assert ConsentRecord.objects.count() == 1


@pytest.mark.parametrize("enviada", ["otra", "", None])
def test_aceptar_el_tratamiento_con_otra_version_lanza_409(settings, tratamiento_configurado, estudiante_a, enviada):
    error = _error(lambda: consent_service.accept_data_treatment(estudiante_a, enviada))

    assert (error.api_code, error.status_code, error.extra) == ("NOTICE_VERSION_STALE", 409, {"noticeVersion": "datos-1"})
    assert not ConsentRecord.objects.exists()


def test_sin_version_configurada_del_aviso_de_datos_no_hay_nada_que_aceptar(settings, estudiante_a):
    assert settings.SIEP_DATA_TREATMENT_NOTICE_VERSION == ""

    assert _error(lambda: consent_service.accept_data_treatment(estudiante_a, "")).api_code == "NOTICE_VERSION_STALE"
    assert not ConsentRecord.objects.exists()


def test_aceptar_el_tratamiento_deja_una_fila_de_auditoria_solo_cuando_crea(settings, tratamiento_configurado, estudiante_a):
    consent_service.accept_data_treatment(estudiante_a, "datos-1")
    consent_service.accept_data_treatment(estudiante_a, "datos-1")

    (fila,) = AuditLog.objects.filter(action="consentimiento.aceptar")
    contexto = json.loads(fila.context_json)
    assert {k: v for k, v in contexto.items() if k not in {"method", "class", "taxonomy"}} == {"noticeVersion": "datos-1"}
    assert fila.resource_type == "DATA_TREATMENT" and fila.resource_id is None


# ── La exigencia no se cuela en el resto de la persona ──────────────────────────────────────────────────


def test_la_version_vigente_se_lee_en_cada_llamada_y_no_al_importar(settings):
    settings.SIEP_CONTENT_NOTICE_VERSION = f"v-{secrets.token_hex(3)}"

    assert consent_service.content_notice_version() == settings.SIEP_CONTENT_NOTICE_VERSION
