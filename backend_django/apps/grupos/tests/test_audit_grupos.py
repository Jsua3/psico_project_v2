"""S4-1 · Quién cambió qué en los grupos y en lo que se les asigna (RNF-007, SIEP-RNF-02).

La taxonomía ya traía ``grupo.crear``, ``grupo.actualizar`` y ``grupo.eliminar``, pero ningún código las escribía: crear,
renombrar y borrar un grupo no dejaba rastro. Y las dos rutas heredadas que asignan y retiran un caso de un grupo
(``/api/grupos/<id>/casos``) cambiaban lo mismo que ``/api/assignments`` sin auditarlo. Aquí quedan con las mismas
etiquetas que ya tenía la ruta nueva (``asignacion.crear`` y ``asignacion.eliminar``). El contexto lleva ids y los
NOMBRES de los campos cambiados, nunca el nombre ni el código del grupo.
"""
import json
import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo
from apps.simulation.models import AuditLog, CaseVersion
from apps.simulation.services import audit_service

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
GRUPOS = "/api/grupos"
IP = "198.51.100.66"
AGENTE = "agente-de-prueba/5.0"


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _profesor():
    return User.objects.create_user(
        email=f"s41.{secrets.token_hex(6)}@inst.test", password=secrets.token_urlsafe(24),
        nombre="Pro", apellido="Fesor", role="PROFESOR",
    )


def _como(usuario):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _codigo():
    return f"A{uuid.uuid4().hex[:8].upper()}"


def _grupo(profesor):
    return Grupo.objects.create(nombre="Grupo de prueba", codigo=_codigo(), profesor=profesor)


def _filas(accion, **filtros):
    return list(AuditLog.objects.filter(action=accion, **filtros).order_by("id"))


def _una(accion, **filtros):
    filas = _filas(accion, **filtros)
    assert len(filas) == 1, f"{accion}: {len(filas)} filas (se esperaba 1)"
    return filas[0]


def _contexto(fila):
    contexto = json.loads(fila.context_json)
    contexto.pop("method", None)
    contexto.pop("class", None)
    return contexto


def _afirmar_actor(fila, profesor, recurso):
    assert (fila.actor_id, fila.actor_role) == (profesor.pk, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == recurso
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)


def _enviar(metodo, profesor, url, cuerpo=None):
    return getattr(_como(profesor), metodo)(url, cuerpo, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)


# ── Escenarios: cada uno actúa y afirma ────────────────────────────────────────────────────────────────────────────
def _grupo_creado(case_version_id):
    profesor = _profesor()

    respuesta = _enviar("post", profesor, GRUPOS, {"nombre": "Nombre que no debe quedar", "codigo": _codigo()})

    assert respuesta.status_code == 201
    grupo = respuesta.data["data"]["id"]
    fila = _una("GROUP_CREATED")
    _afirmar_actor(fila, profesor, ("GRUPO", str(grupo)))
    assert _contexto(fila) == {"taxonomy": "grupo.crear", "groupId": grupo}
    assert "Nombre que no debe quedar" not in fila.context_json


def _grupo_renombrado(case_version_id):
    profesor = _profesor()
    grupo = _grupo(profesor)

    respuesta = _enviar("patch", profesor, f"{GRUPOS}/{grupo.pk}", {"nombre": "Otro nombre"})

    assert respuesta.status_code == 200
    fila = _una("GROUP_UPDATED")
    _afirmar_actor(fila, profesor, ("GRUPO", str(grupo.pk)))
    assert _contexto(fila) == {"taxonomy": "grupo.actualizar", "groupId": grupo.pk, "changed": ["nombre"]}


def _grupo_con_codigo_nuevo(case_version_id):
    profesor = _profesor()
    grupo = _grupo(profesor)

    respuesta = _enviar("put", profesor, f"{GRUPOS}/{grupo.pk}", {"nombre": "Otro", "codigo": _codigo()})

    assert respuesta.status_code == 200
    fila = _una("GROUP_UPDATED")
    _afirmar_actor(fila, profesor, ("GRUPO", str(grupo.pk)))
    assert _contexto(fila) == {"taxonomy": "grupo.actualizar", "groupId": grupo.pk, "changed": ["nombre", "codigo"]}


def _grupo_eliminado(case_version_id):
    profesor = _profesor()
    grupo = _grupo(profesor)

    respuesta = _enviar("delete", profesor, f"{GRUPOS}/{grupo.pk}")

    assert respuesta.status_code == 200
    fila = _una("GROUP_DELETED")
    _afirmar_actor(fila, profesor, ("GRUPO", str(grupo.pk)))
    assert _contexto(fila) == {"taxonomy": "grupo.eliminar", "groupId": grupo.pk}


def _caso_asignado_por_la_ruta_heredada(case_version_id):
    profesor = _profesor()
    grupo = _grupo(profesor)

    respuesta = _enviar("post", profesor, f"{GRUPOS}/{grupo.pk}/casos", {"caseVersionId": case_version_id})

    assert respuesta.status_code == 200
    fila = _una("asignacion.crear")  # la misma acción que escribe la ruta nueva (/api/assignments)
    _afirmar_actor(fila, profesor, ("ASSIGNMENT", None))
    assert _contexto(fila) == {"taxonomy": "asignacion.crear", "groupId": grupo.pk, "caseVersionId": case_version_id}


def _caso_retirado_por_la_ruta_heredada(case_version_id):
    profesor = _profesor()
    grupo = _grupo(profesor)
    CaseAssignment.objects.create(case_version_id=case_version_id, grupo=grupo)

    respuesta = _enviar("delete", profesor, f"{GRUPOS}/{grupo.pk}/casos/{case_version_id}")

    assert respuesta.status_code == 200
    fila = _una("asignacion.eliminar")
    _afirmar_actor(fila, profesor, ("ASSIGNMENT", None))
    assert _contexto(fila) == {"taxonomy": "asignacion.eliminar", "groupId": grupo.pk, "caseVersionId": case_version_id}


ESCENARIOS = {
    "crear un grupo": _grupo_creado,
    "renombrar un grupo": _grupo_renombrado,
    "cambiar nombre y código": _grupo_con_codigo_nuevo,
    "eliminar un grupo": _grupo_eliminado,
    "asignar un caso (ruta heredada)": _caso_asignado_por_la_ruta_heredada,
    "retirar un caso (ruta heredada)": _caso_retirado_por_la_ruta_heredada,
}


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_el_cambio_deja_una_fila_con_el_actor_y_el_recurso_correctos(escenario, case_version_id):
    escenario(case_version_id)


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_control_negativo_con_la_escritura_apagada_cada_cambio_cae(escenario, case_version_id, monkeypatch):
    monkeypatch.setattr(audit_service, "append", lambda *args, **kwargs: None)

    with pytest.raises(AssertionError):
        escenario(case_version_id)


# ── Lo que NO deja fila ────────────────────────────────────────────────────────────────────────────────────────────
def test_lo_que_falla_no_deja_fila(case_version_id):
    dueno, otro = _profesor(), _profesor()
    grupo = _grupo(dueno)
    repetido = _grupo(dueno)

    ajeno_editado = _enviar("patch", otro, f"{GRUPOS}/{grupo.pk}", {"nombre": "Mío ahora"})
    ajeno_eliminado = _enviar("delete", otro, f"{GRUPOS}/{grupo.pk}")
    caso_en_grupo_ajeno = _enviar("post", otro, f"{GRUPOS}/{grupo.pk}/casos", {"caseVersionId": case_version_id})
    codigo_repetido = _enviar("post", dueno, GRUPOS, {"nombre": "Otro", "codigo": repetido.codigo})

    assert ajeno_editado.status_code == ajeno_eliminado.status_code == caso_en_grupo_ajeno.status_code == 400
    assert codigo_repetido.status_code == 400
    for accion in ("GROUP_CREATED", "GROUP_UPDATED", "GROUP_DELETED", "asignacion.crear"):
        assert _filas(accion) == [], accion
    assert Grupo.objects.filter(pk=grupo.pk).exists()
