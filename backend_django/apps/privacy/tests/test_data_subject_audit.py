"""S3-4 · Los tres eventos de auditoría de los derechos del titular (RNF-003, RNF-007).

``datos.exportar``, ``datos.suprimir`` y ``datos.depurar`` entran a la taxonomía como los demás eventos de comandos
(``ADMIN_CREATED_BY_COMMAND``): con su etiqueta ``entidad.verbo`` y su lista blanca de contexto. La lista blanca deja SOLO ids y
recuentos: nunca el correo, el nombre ni un texto de la persona. El actor de la fila es el ADMIN que ejecuta el comando.

Cada control lleva su control negativo: sin la lista blanca, el correo y el texto llegan a la fila.
"""
import json
import secrets

import pytest

from apps.privacy import audit_events
from apps.privacy.tests.support import crear_persona
from apps.simulation.models import AuditLog
from apps.simulation.services import audit_service

pytestmark = [pytest.mark.req("RNF-003", "RNF-007"), pytest.mark.security, pytest.mark.django_db]

ETIQUETAS = {
    "PERSONAL_DATA_EXPORTED": "datos.exportar",
    "PERSONAL_DATA_ERASED": "datos.suprimir",
    "EXPIRED_DATA_PURGED": "datos.depurar",
}


def _filas(accion):
    return list(AuditLog.objects.filter(action=accion).order_by("id"))


@pytest.mark.parametrize(("codigo", "etiqueta"), sorted(ETIQUETAS.items()))
def test_la_taxonomia_trae_el_evento_con_su_etiqueta(codigo, etiqueta):
    assert audit_service.AUDIT_TAXONOMY[codigo] == etiqueta
    assert audit_service.canonical_action(codigo) == etiqueta
    assert codigo in audit_service.matching_actions(etiqueta)


def test_ninguna_etiqueta_nueva_repite_una_que_ya_existia():
    etiquetas = list(audit_service.AUDIT_TAXONOMY.values())
    for etiqueta in ETIQUETAS.values():
        assert etiquetas.count(etiqueta) == 1, etiqueta


@pytest.mark.parametrize("codigo", sorted(ETIQUETAS))
def test_cada_evento_declara_su_lista_blanca_de_contexto(codigo):
    assert codigo in audit_service.CONTEXT_WHITELIST


def _contexto_sucio():
    """Un contexto con todo lo que NO puede llegar a la fila: el correo, el nombre, un texto de la persona y una clave."""
    return {
        "targetId": 7,
        "executedBy": 3,
        "email": f"{secrets.token_hex(6)}@example.com",
        "nombre": f"Nombre{secrets.token_hex(4)}",
        "texto": f"Reflexion {secrets.token_hex(8)}",
        "password": secrets.token_urlsafe(16),
        "rows": 12,
        "tables": 4,
        "changed": 9,
        "deleted": 3,
        "rateLimits": 1,
        "auditLogs": 2,
        "accessRequests": 5,
    }


def _afirmar_lista_blanca(codigo, esperado):
    sucio = _contexto_sucio()
    audit_service.record(codigo, "USER", 7, sucio)
    fila = _filas(codigo)[-1]
    contexto = json.loads(fila.context_json)
    assert contexto == {"taxonomy": ETIQUETAS[codigo], **esperado}
    for clave in ("email", "nombre", "texto", "password"):
        assert str(sucio[clave]) not in fila.context_json


CONTEXTOS_ESPERADOS = [
    ("PERSONAL_DATA_EXPORTED", {"targetId": 7, "executedBy": 3, "rows": 12, "tables": 4}),
    ("PERSONAL_DATA_ERASED", {"targetId": 7, "executedBy": 3, "changed": 9, "deleted": 3, "tables": 4}),
    ("EXPIRED_DATA_PURGED", {"executedBy": 3, "rateLimits": 1, "auditLogs": 2, "accessRequests": 5}),
]


@pytest.mark.parametrize(("codigo", "esperado"), CONTEXTOS_ESPERADOS)
def test_la_lista_blanca_deja_solo_ids_y_recuentos(codigo, esperado):
    _afirmar_lista_blanca(codigo, esperado)


@pytest.mark.parametrize(("codigo", "esperado"), CONTEXTOS_ESPERADOS)
def test_control_negativo_sin_lista_blanca_el_correo_y_el_texto_llegan_a_la_fila(monkeypatch, codigo, esperado):
    _afirmar_lista_blanca(codigo, esperado)  # con el control puesto se cumple
    monkeypatch.setattr(audit_service, "CONTEXT_WHITELIST", {})

    with pytest.raises(AssertionError):
        _afirmar_lista_blanca(codigo, esperado)  # con el control apagado, la MISMA afirmación deja de cumplirse


# ── Las funciones de eventos: actor, recurso y contexto ──────────────────────────────────────────────────────────


def test_persona_suprimida_escribe_una_fila_con_el_admin_como_actor_y_solo_ids_y_recuentos():
    admin = crear_persona("ADMIN", "admin")
    persona = crear_persona("ESTUDIANTE", "ana")

    audit_events.persona_suprimida(persona, admin, cambiadas=9, borradas=3, tablas=4)

    [fila] = _filas("PERSONAL_DATA_ERASED")
    assert (fila.actor_id, fila.actor_role) == (admin.pk, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("USER", str(persona.pk))
    assert json.loads(fila.context_json) == {
        "taxonomy": "datos.suprimir", "targetId": persona.pk, "executedBy": admin.pk,
        "changed": 9, "deleted": 3, "tables": 4,
    }
    volcado = json.dumps([fila.action, fila.resource_type, fila.resource_id, fila.context_json, fila.actor_role])
    assert persona.email not in volcado and persona.nombre not in volcado and admin.email not in volcado


def test_persona_exportada_escribe_una_fila_con_el_admin_como_actor_y_solo_ids_y_recuentos():
    admin = crear_persona("ADMIN", "admin")
    persona = crear_persona("ESTUDIANTE", "ana")

    audit_events.persona_exportada(persona, admin, filas=30, tablas=6)

    [fila] = _filas("PERSONAL_DATA_EXPORTED")
    assert (fila.actor_id, fila.resource_id) == (admin.pk, str(persona.pk))
    assert json.loads(fila.context_json) == {
        "taxonomy": "datos.exportar", "targetId": persona.pk, "executedBy": admin.pk, "rows": 30, "tables": 6,
    }


def test_datos_depurados_escribe_una_fila_con_el_admin_como_actor_y_solo_recuentos():
    admin = crear_persona("ADMIN", "admin")

    audit_events.datos_depurados(admin, contadores=4, auditoria=2, solicitudes=1)

    [fila] = _filas("EXPIRED_DATA_PURGED")
    assert fila.actor_id == admin.pk and fila.resource_id is None
    assert json.loads(fila.context_json) == {
        "taxonomy": "datos.depurar", "executedBy": admin.pk, "rateLimits": 4, "auditLogs": 2, "accessRequests": 1,
    }
