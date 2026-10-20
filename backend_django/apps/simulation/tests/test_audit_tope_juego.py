"""La auditoría de solo añadir no se llena con órdenes de juego repetidas de un estudiante (revisión S7-2, #2; RNF-007).

Empezar un intento, decidir, guardar la bitácora, la salida segura y reanudar escriben una fila de ``audit_logs`` por llamada,
aunque la orden no cambie nada, y las rutas de ``api/simulation/`` no llevan limitador. Una cuenta (o quien le robe el token)
repitiendo ``safe-exit`` dejaba ~66 filas por segundo en una tabla que no se puede podar en un año. Ahora un estudiante deja a
lo más ``audit_game_user`` filas por hora: lo que pasa del tope no se escribe, la orden se atiende igual (REGLA-004) y sale UN
aviso por ventana.
"""
import logging
import secrets

import pytest
from django.contrib.auth import get_user_model

from apps.reportes.tests.test_reportes import (  # noqa: F401
    _add_student,
    _assign_case,
    _grupo,
    case_version_id,
    cl,
    estudiante,
    profesor,
)
from apps.security.limits import LIMITS, Limit
from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service

pytestmark = [pytest.mark.req("RNF-007"), pytest.mark.security]

TOPE = 5


@pytest.fixture
def con_tope(settings, monkeypatch):
    """El limitador encendido y el tope de filas de juego en ``TOPE`` (el de verdad, 1200, tardaría minutos en llegar)."""
    settings.SIEP_THROTTLE_ENABLED = True
    monkeypatch.setitem(LIMITS, "audit_game_user", Limit(TOPE, 3600))


def _empezar(profesor, estudiante, case_version_id):
    grupo = _grupo(profesor)
    _add_student(grupo, estudiante)
    _assign_case(grupo, case_version_id)
    cliente = cl(estudiante)
    inicio = cliente.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json")
    assert inicio.status_code == 200, inicio.data
    return cliente, inicio.data["data"]


def _salida_segura(cliente, intento):
    return cliente.post(
        f"/api/simulation/attempts/{intento['attemptId']}/safe-exit",
        {"attemptToken": intento["attemptToken"], "reason": "Necesito parar"},
        format="json",
    )


def _filas_de(persona):
    return AuditLog.objects.filter(actor_id=persona.id).count()


@pytest.mark.django_db
def test_repetir_la_salida_segura_no_llena_la_auditoria_y_la_orden_se_atiende_siempre(
    profesor, estudiante, case_version_id, con_tope
):
    cliente, intento = _empezar(profesor, estudiante, case_version_id)

    estados = [_salida_segura(cliente, intento).status_code for _ in range(40)]

    assert estados == [200] * 40, "el tope NO bloquea la orden: la salida segura siempre se alcanza (REGLA-004)"
    assert _filas_de(estudiante) == TOPE, "las filas de la persona se quedan en el tope y no crecen con cada repetición"


@pytest.mark.django_db
def test_pasado_el_tope_sale_un_solo_aviso_sin_datos_de_la_persona(
    profesor, estudiante, case_version_id, con_tope, caplog
):
    cliente, intento = _empezar(profesor, estudiante, case_version_id)

    with caplog.at_level(logging.INFO, logger="siep.security"):
        for _ in range(30):
            _salida_segura(cliente, intento)

    avisos = [r.fields for r in caplog.records if r.name == "siep.security" and r.fields.get("event") == "audit_game_user_capped"]
    assert avisos == [{"event": "audit_game_user_capped", "scope": "audit_game_user", "actor_id": estudiante.id}]


@pytest.mark.django_db
def test_el_tope_es_por_persona_otro_estudiante_sigue_dejando_su_rastro(
    profesor, estudiante, case_version_id, con_tope
):
    cliente, intento = _empezar(profesor, estudiante, case_version_id)
    for _ in range(20):
        _salida_segura(cliente, intento)
    assert _filas_de(estudiante) == TOPE

    otra = get_user_model().objects.create_user(
        email=f"otra.{secrets.token_hex(4)}@example.com", password=secrets.token_urlsafe(24),
        nombre="Otra", apellido="Estudiante", role="ESTUDIANTE",
    )
    for _ in range(TOPE):
        audit_service.append(str(otra.id), "ESTUDIANTE", "ATTEMPT_STARTED", "CASE_VERSION", "1", {}, None, None, None)

    assert _filas_de(otra) == TOPE, "el contador de una persona no gasta el de otra"
    assert _filas_de(estudiante) == TOPE


@pytest.mark.django_db
def test_los_demas_roles_no_se_acotan_por_este_tope(profesor, con_tope):
    for _ in range(TOPE * 3):
        audit_service.append(str(profesor.id), "PROFESOR", "GROUP_CREATED", "GRUPO", "1", {}, None, None, None)

    assert _filas_de(profesor) == TOPE * 3, "el tope es de los estudiantes; docentes y ADMIN tienen sus límites en las rutas pesadas"


@pytest.mark.django_db
def test_control_negativo_sin_el_limitador_la_repeticion_si_llena_la_auditoria(
    profesor, estudiante, case_version_id, settings
):
    settings.SIEP_THROTTLE_ENABLED = False
    cliente, intento = _empezar(profesor, estudiante, case_version_id)

    for _ in range(40):
        _salida_segura(cliente, intento)

    assert _filas_de(estudiante) > TOPE * 5, "sin el limitador cada repetición deja su fila: la prueba de arriba sí vigila el tope"


@pytest.mark.django_db
def test_control_negativo_con_el_tope_apagado_en_el_codigo_la_repeticion_si_llena_la_auditoria(
    profesor, estudiante, case_version_id, settings, monkeypatch
):
    settings.SIEP_THROTTLE_ENABLED = True
    monkeypatch.setattr(audit_service, "_cabe_la_fila_del_estudiante", lambda actor_fk, actor_role: True)
    cliente, intento = _empezar(profesor, estudiante, case_version_id)

    for _ in range(40):
        _salida_segura(cliente, intento)

    assert _filas_de(estudiante) > TOPE * 5
