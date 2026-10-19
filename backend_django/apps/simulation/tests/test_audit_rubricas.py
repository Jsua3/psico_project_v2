"""S4-1 · Quién cambió qué en las rúbricas y en el catálogo de competencias (RNF-007, SIEP-RNF-02).

Crear, editar, activar y desactivar una rúbrica, duplicarla, fijarla como predeterminada y asignarla a una versión de
caso dejan UNA fila con el actor y el recurso correctos; crear una competencia también. El contexto lleva ids y los
NOMBRES de los campos que cambiaron, nunca sus valores (ni el nombre ni los criterios de la rúbrica). Lo que falla no
deja fila. Sembrar la rúbrica por defecto (comando del sistema) no es un cambio de una persona y no deja ruido.
"""
import json
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseVersion, Rubric
from apps.simulation.services import audit_service
from apps.simulation.services.rubric_service import seed_default_rubric

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
RUBRICAS = "/api/rubrics"
IP = "198.51.100.55"
AGENTE = "agente-de-prueba/4.0"


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _persona(rol):
    return User.objects.create_user(
        email=f"s41.{secrets.token_hex(6)}@inst.test", password=secrets.token_urlsafe(24),
        nombre="Lucía", apellido="Ortiz", role=rol,
    )


def _como(usuario):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _cuerpo(nombre="Rúbrica de prueba", activa=False, pesos=(50, 50)):
    return {
        "name": nombre, "description": "d", "version": "1.0", "active": activa,
        "criteria": [
            {"title": f"C{i}", "competency": f"C{i}", "weight": peso, "displayOrder": i, "active": True}
            for i, peso in enumerate(pesos, start=1)
        ],
    }


def _crear(persona, **kwargs):
    respuesta = _como(persona).post(f"{RUBRICAS}/", _cuerpo(**kwargs), format="json")
    assert respuesta.status_code == 201, respuesta.data
    return respuesta.data["data"]["id"]


def _filas(accion, **filtros):
    return list(AuditLog.objects.filter(action=accion, **filtros).order_by("id"))


def _una(accion, **filtros):
    filas = _filas(accion, **filtros)
    assert len(filas) == 1, f"{accion}: {len(filas)} filas (se esperaba 1)"
    return filas[0]


def _contexto(fila):
    """El contexto sin lo que pone ``@auditable`` por su cuenta (nombre de la función y módulo)."""
    contexto = json.loads(fila.context_json)
    contexto.pop("method", None)
    contexto.pop("class", None)
    return contexto


def _afirmar_actor(fila, persona, rol, recurso):
    assert (fila.actor_id, fila.actor_role) == (persona.pk, rol)
    assert (fila.resource_type, fila.resource_id) == recurso
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)


def _post(persona, url, cuerpo=None):
    return _como(persona).post(url, cuerpo or {}, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)


# ── Escenarios: cada uno actúa y afirma ────────────────────────────────────────────────────────────────────────────
def _rubrica_creada(case_version_id):
    profesor = _persona("PROFESOR")

    respuesta = _post(profesor, f"{RUBRICAS}/", _cuerpo("Nombre que no debe quedar"))

    assert respuesta.status_code == 201
    rubrica = respuesta.data["data"]["id"]
    fila = _una("RUBRIC_CREATED")
    _afirmar_actor(fila, profesor, "PROFESOR", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {"taxonomy": "rubrica.crear", "rubricId": rubrica}
    assert "Nombre que no debe quedar" not in fila.context_json


def _rubrica_editada(case_version_id):
    profesor = _persona("PROFESOR")
    rubrica = _crear(profesor)

    respuesta = _como(profesor).put(
        f"{RUBRICAS}/{rubrica}", _cuerpo("Renombrada", pesos=(30, 70)), format="json",
        REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE,
    )

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_UPDATED")
    _afirmar_actor(fila, profesor, "PROFESOR", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {
        "taxonomy": "rubrica.actualizar", "rubricId": rubrica,
        "changed": ["name", "description", "version", "active", "criteria"],
    }
    assert "Renombrada" not in fila.context_json


def _rubrica_editada_por_patch(case_version_id):
    profesor = _persona("PROFESOR")
    rubrica = _crear(profesor)

    respuesta = _como(profesor).patch(
        f"{RUBRICAS}/{rubrica}", {"description": "otra"}, format="json", REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE
    )

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_UPDATED")
    _afirmar_actor(fila, profesor, "PROFESOR", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {"taxonomy": "rubrica.actualizar", "rubricId": rubrica, "changed": ["description"]}


def _rubrica_activada(case_version_id):
    profesor = _persona("PROFESOR")
    rubrica = _crear(profesor)

    respuesta = _post(profesor, f"{RUBRICAS}/{rubrica}/activate")

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_ACTIVATED")
    _afirmar_actor(fila, profesor, "PROFESOR", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {"taxonomy": "rubrica.activar", "rubricId": rubrica, "active": True}


def _rubrica_desactivada(case_version_id):
    profesor = _persona("PROFESOR")
    rubrica = _crear(profesor, activa=True)

    respuesta = _post(profesor, f"{RUBRICAS}/{rubrica}/deactivate")

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_ACTIVATED")  # el mismo evento: «activar» con la bandera apagada
    _afirmar_actor(fila, profesor, "PROFESOR", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {"taxonomy": "rubrica.activar", "rubricId": rubrica, "active": False}


def _rubrica_duplicada(case_version_id):
    profesor = _persona("PROFESOR")
    original = _crear(profesor)

    respuesta = _post(profesor, f"{RUBRICAS}/{original}/duplicate")

    assert respuesta.status_code == 200
    copia = respuesta.data["data"]["id"]
    filas = _filas("RUBRIC_CREATED", resource_id=str(copia))
    assert len(filas) == 1
    _afirmar_actor(filas[0], profesor, "PROFESOR", ("RUBRIC", str(copia)))
    assert _contexto(filas[0]) == {"taxonomy": "rubrica.crear", "rubricId": copia, "sourceId": original}


def _rubrica_predeterminada(case_version_id):
    admin = _persona("ADMIN")
    rubrica = _crear(admin, activa=True)

    respuesta = _post(admin, f"{RUBRICAS}/{rubrica}/default")

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_UPDATED")
    _afirmar_actor(fila, admin, "ADMIN", ("RUBRIC", str(rubrica)))
    assert _contexto(fila) == {"taxonomy": "rubrica.actualizar", "rubricId": rubrica, "changed": ["isDefault"]}


def _rubrica_asignada_a_una_version(case_version_id):
    admin = _persona("ADMIN")
    rubrica = _crear(admin, activa=True)

    respuesta = _como(admin).put(
        f"{RUBRICAS}/case-versions/{case_version_id}", {"rubricId": rubrica}, format="json",
        REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE,
    )

    assert respuesta.status_code == 200
    fila = _una("RUBRIC_UPDATED")
    _afirmar_actor(fila, admin, "ADMIN", ("CASE_VERSION", str(case_version_id)))
    assert _contexto(fila) == {
        "taxonomy": "rubrica.actualizar", "caseVersionId": case_version_id, "rubricId": rubrica,
        "changed": ["assignment"],
    }


def _competencia_creada(case_version_id):
    admin = _persona("ADMIN")
    codigo = f"AUD_{secrets.token_hex(4).upper()}"

    respuesta = _post(admin, "/api/competencies", {"code": codigo, "name": "Competencia de prueba"})

    assert respuesta.status_code == 201
    competencia = respuesta.data["data"]["id"]
    fila = _una("COMPETENCY_CREATED")
    _afirmar_actor(fila, admin, "ADMIN", ("COMPETENCY", str(competencia)))
    assert _contexto(fila) == {"taxonomy": "competencia.crear", "competencyId": competencia}
    assert codigo not in fila.context_json


ESCENARIOS = {
    "crear una rúbrica": _rubrica_creada,
    "editar una rúbrica (PUT)": _rubrica_editada,
    "editar una rúbrica (PATCH)": _rubrica_editada_por_patch,
    "activar una rúbrica": _rubrica_activada,
    "desactivar una rúbrica": _rubrica_desactivada,
    "duplicar una rúbrica": _rubrica_duplicada,
    "fijar la predeterminada": _rubrica_predeterminada,
    "asignarla a una versión de caso": _rubrica_asignada_a_una_version,
    "crear una competencia": _competencia_creada,
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
def test_lo_que_falla_no_deja_fila():
    profesor, otro = _persona("PROFESOR"), _persona("PROFESOR")
    ajena = _crear(otro)
    sin_criterios = {"name": "Vacía", "active": True, "criteria": []}

    ajena_editada = _como(profesor).put(f"{RUBRICAS}/{ajena}", _cuerpo("Mía ahora"), format="json")
    ajena_activada = _como(profesor).post(f"{RUBRICAS}/{ajena}/activate", {}, format="json")
    ajena_duplicada = _como(profesor).post(f"{RUBRICAS}/{ajena}/duplicate", {}, format="json")
    invalida = _como(profesor).post(f"{RUBRICAS}/", sin_criterios, format="json")
    default_de_profesor = _como(profesor).post(f"{RUBRICAS}/{_crear(profesor)}/default", {}, format="json")
    competencia_de_profesor = _como(profesor).post("/api/competencies", {"code": "X1", "name": "X"}, format="json")

    assert [r.status_code for r in (ajena_editada, ajena_activada, ajena_duplicada)] == [404, 404, 404]
    assert invalida.status_code == 400
    assert (default_de_profesor.status_code, competencia_de_profesor.status_code) == (403, 403)
    assert [fila.action for fila in AuditLog.objects.filter(action__in=(
        "RUBRIC_UPDATED", "RUBRIC_ACTIVATED", "COMPETENCY_CREATED"
    ))] == []
    # Las dos creaciones que sí salieron bien (la ajena y la propia): ninguna más.
    assert len(_filas("RUBRIC_CREATED")) == 2


def test_sembrar_la_rubrica_por_defecto_no_deja_filas_de_rubrica():
    """El sembrado del sistema (comandos de desarrollo) no es un cambio de una persona."""
    seed_default_rubric(_persona("ADMIN"))

    assert Rubric.objects.filter(is_default=True).exists()
    for accion in ("RUBRIC_CREATED", "RUBRIC_UPDATED", "RUBRIC_ACTIVATED"):
        assert _filas(accion) == [], accion


def test_una_rubrica_creada_como_predeterminada_lo_anota_en_su_contexto():
    admin = _persona("ADMIN")
    cuerpo = _cuerpo(activa=True)
    cuerpo["isDefault"] = True

    respuesta = _como(admin).post(f"{RUBRICAS}/", cuerpo, format="json")

    assert respuesta.status_code == 201
    assert _contexto(_una("RUBRIC_CREATED"))["isDefault"] is True
