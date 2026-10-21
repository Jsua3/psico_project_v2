"""S4-1 · Quién leyó datos de otra persona: reportes, analítica, exportación, auditoría y listas (RNF-007, SIEP-RNF-02).

Una lectura deja su fila DESPUÉS de que sale bien (una negada 403/404 no deja fila), con el actor y el recurso
correctos y un contexto que solo lleva ids (jamás nombres, correos ni el contenido del reporte). La exportación CSV deja
``reporte.exportar`` y no, además, ``reporte.leer``. La lectura de la propia auditoría también queda en la auditoría.

Cierra con la prueba de punta a punta del plan (criterio 14): un inicio de sesión, un cambio de usuario y la exportación
de un reporte dejan cada uno su fila.
"""
import json
import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import AuditLog, CaseVersion
from apps.simulation.services import audit_service

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
IP = "198.51.100.99"
AGENTE = "agente-de-prueba/3.0"


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


def _grupo_con_estudiante(profesor, estudiante):
    grupo = Grupo.objects.create(nombre="G-lecturas", codigo=f"L{uuid.uuid4().hex[:8].upper()}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status=MembershipStatus.ACTIVE)
    return grupo


def _intento_en_pausa(estudiante, grupo, case_version_id):
    """Un intento del estudiante, ya pausado (así su reporte se puede leer): devuelve su id."""
    CaseAssignment.objects.create(case_version_id=case_version_id, grupo=grupo)
    cliente = _como(estudiante)
    datos = cliente.post("/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    pausa = cliente.post(
        f"/api/simulation/attempts/{datos['attemptId']}/safe-exit",
        {"attemptToken": datos["attemptToken"], "reason": "prueba de auditoría"}, format="json",
    )
    assert pausa.status_code == 200, pausa.data
    return datos["attemptId"]


def _filas(accion, **filtros):
    return list(AuditLog.objects.filter(action=accion, **filtros).order_by("id"))


def _una(accion, **filtros):
    filas = _filas(accion, **filtros)
    assert len(filas) == 1, f"{accion}: {len(filas)} filas (se esperaba 1)"
    return filas[0]


def _contexto(fila):
    return json.loads(fila.context_json)


def _get(cliente, url, **params):
    return cliente.get(url, params, REMOTE_ADDR=IP, HTTP_USER_AGENT=AGENTE)


def _afirmar_actor(fila, persona, rol):
    assert (fila.actor_id, fila.actor_role) == (persona.pk, rol)
    assert (fila.ip_address, fila.user_agent) == (IP, AGENTE)


# ── Escenarios: cada uno actúa y afirma ────────────────────────────────────────────────────────────────────────────
def _reporte_de_grupo(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)

    respuesta = _get(_como(profesor), f"/api/reportes/grupo/{grupo.pk}", caseVersionId=case_version_id)

    assert respuesta.status_code == 200
    fila = _una("REPORT_VIEWED")
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == ("GRUPO", str(grupo.pk))
    assert _contexto(fila) == {"taxonomy": "reporte.leer", "groupId": grupo.pk, "caseVersionId": case_version_id}
    assert estudiante.nombre not in fila.context_json  # ni nombres ni contenido: solo ids


def _reporte_de_un_estudiante(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    _grupo_con_estudiante(profesor, estudiante)

    respuesta = _get(_como(profesor), f"/api/reportes/estudiante/{estudiante.pk}")

    assert respuesta.status_code == 200
    fila = _una("REPORT_VIEWED")
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == ("USER", str(estudiante.pk))
    assert _contexto(fila) == {"taxonomy": "reporte.leer", "studentId": estudiante.pk}


def _analitica(case_version_id):
    admin = _persona("ADMIN")

    respuesta = _get(_como(admin), "/api/reportes/dashboard")

    assert respuesta.status_code == 200
    fila = _una("ANALYTICS_VIEWED")
    _afirmar_actor(fila, admin, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("DASHBOARD", None)
    assert _contexto(fila) == {"taxonomy": "analitica.ver"}


def _exportacion_csv(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)

    respuesta = _get(_como(profesor), f"/api/reportes/grupo/{grupo.pk}/export", caseVersionId=case_version_id)

    assert respuesta.status_code == 200
    assert respuesta["Content-Type"].startswith("text/csv")
    fila = _una("REPORT_EXPORTED")
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == ("GRUPO", str(grupo.pk))
    assert _contexto(fila) == {"taxonomy": "reporte.exportar", "groupId": grupo.pk, "caseVersionId": case_version_id}
    assert _filas("REPORT_VIEWED") == []  # exportar no es, además, leer el reporte en pantalla


def _reporte_de_un_intento_ajeno(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)
    intento = _intento_en_pausa(estudiante, grupo, case_version_id)

    respuesta = _get(_como(profesor), f"/api/simulation/attempts/{intento}/student-report")

    assert respuesta.status_code == 200
    fila = _una("REPORT_VIEWED")
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == ("ATTEMPT", intento)
    assert _contexto(fila) == {"taxonomy": "reporte.leer", "attemptId": intento, "studentId": estudiante.pk}


def _evaluacion_de_un_intento_ajeno(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)
    intento = _intento_en_pausa(estudiante, grupo, case_version_id)

    respuesta = _get(_como(profesor), f"/api/instructor/attempts/{intento}/rubric-evaluation")

    assert respuesta.status_code == 200
    fila = _una("traza.leer", resource_id=intento)
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert fila.resource_type == "ATTEMPT"
    assert _contexto(fila)["method"] == "rubric"  # la misma etiqueta que la traza; el método dice qué parte se leyó


def _lista_de_estudiantes_de_un_grupo(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)

    respuesta = _get(_como(profesor), f"/api/grupos/{grupo.pk}/estudiantes")

    assert respuesta.status_code == 200
    fila = _una("GROUP_STUDENTS_VIEWED")
    _afirmar_actor(fila, profesor, "PROFESOR")
    assert (fila.resource_type, fila.resource_id) == ("GRUPO", str(grupo.pk))
    assert _contexto(fila) == {"taxonomy": "grupo.listar_estudiantes", "groupId": grupo.pk, "count": 1}
    assert estudiante.email not in fila.context_json


def _lectura_de_la_auditoria(case_version_id):
    admin, otra = _persona("ADMIN"), _persona("PROFESOR")

    respuesta = _get(_como(admin), "/api/admin/audit", actorId=otra.pk, action="intento.iniciar", page=1)

    assert respuesta.status_code == 200
    fila = _una("AUDIT_VIEWED")
    _afirmar_actor(fila, admin, "ADMIN")
    assert (fila.resource_type, fila.resource_id) == ("AUDIT", None)
    assert _contexto(fila) == {
        "taxonomy": "auditoria.leer", "filters": ["actorId", "action"], "actorId": otra.pk, "page": 1,
    }  # qué filtros y a quién; el texto del filtro no se guarda
    # La lectura queda en la propia auditoría: la siguiente consulta del ADMIN la ve, con quién la hizo.
    siguiente = _get(_como(admin), "/api/admin/audit", action="auditoria.leer").data["data"]["items"]
    assert [item["actorId"] for item in siguiente if item["taxonomy"] == "auditoria.leer"] == [admin.pk]


ESCENARIOS = {
    "reporte de un grupo": _reporte_de_grupo,
    "reporte de un estudiante": _reporte_de_un_estudiante,
    "analítica": _analitica,
    "exportación CSV": _exportacion_csv,
    "reporte de un intento ajeno": _reporte_de_un_intento_ajeno,
    "evaluación de un intento ajeno": _evaluacion_de_un_intento_ajeno,
    "lista de estudiantes de un grupo": _lista_de_estudiantes_de_un_grupo,
    "lectura de la auditoría": _lectura_de_la_auditoria,
}


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_la_lectura_deja_una_fila_con_el_actor_y_el_recurso_correctos(escenario, case_version_id):
    escenario(case_version_id)


@pytest.mark.parametrize("escenario", list(ESCENARIOS.values()), ids=list(ESCENARIOS))
def test_control_negativo_con_la_escritura_apagada_cada_lectura_cae(escenario, case_version_id, monkeypatch):
    monkeypatch.setattr(audit_service, "append", lambda *args, **kwargs: None)

    with pytest.raises(AssertionError):
        escenario(case_version_id)


# ── Lo que NO deja fila ────────────────────────────────────────────────────────────────────────────────────────────
def test_leer_el_propio_reporte_no_es_leer_datos_de_otra_persona(case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)
    intento = _intento_en_pausa(estudiante, grupo, case_version_id)

    respuesta = _get(_como(estudiante), f"/api/simulation/attempts/{intento}/student-report")

    assert respuesta.status_code == 200
    assert _filas("REPORT_VIEWED") == []


@pytest.mark.parametrize("quien", ["estudiante", "profesor ajeno"])
def test_una_lectura_negada_no_deja_fila(quien, case_version_id):
    profesor, estudiante = _persona("PROFESOR"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)
    intento = _intento_en_pausa(estudiante, grupo, case_version_id)
    lector = _persona("ESTUDIANTE") if quien == "estudiante" else _persona("PROFESOR")
    cliente = _como(lector)

    negadas = [
        _get(cliente, f"/api/reportes/grupo/{grupo.pk}", caseVersionId=case_version_id),
        _get(cliente, f"/api/reportes/grupo/{grupo.pk}/export", caseVersionId=case_version_id),
        _get(cliente, f"/api/reportes/estudiante/{estudiante.pk}"),
        _get(cliente, f"/api/grupos/{grupo.pk}/estudiantes"),
        _get(cliente, f"/api/simulation/attempts/{intento}/student-report"),
        _get(cliente, "/api/admin/audit"),
    ]

    assert all(respuesta.status_code in (403, 404, 400) for respuesta in negadas), [r.status_code for r in negadas]
    for accion in ("REPORT_VIEWED", "REPORT_EXPORTED", "GROUP_STUDENTS_VIEWED", "AUDIT_VIEWED"):
        assert _filas(accion) == [], accion


def test_una_lectura_de_la_auditoria_con_un_parametro_invalido_no_deja_fila():
    admin = _persona("ADMIN")

    respuesta = _get(_como(admin), "/api/admin/audit", page="no-es-un-numero")

    assert respuesta.status_code == 400
    assert _filas("AUDIT_VIEWED") == []


def test_un_reporte_de_un_grupo_inexistente_no_deja_fila():
    admin = _persona("ADMIN")

    respuesta = _get(_como(admin), "/api/reportes/grupo/999999999", caseVersionId=1)

    assert respuesta.status_code == 404
    assert _filas("REPORT_VIEWED") == []


# ── De punta a punta (plan 03, criterio 14) ────────────────────────────────────────────────────────────────────────
def test_de_punta_a_punta_un_acceso_un_cambio_de_usuario_y_una_exportacion_dejan_su_fila(case_version_id):
    """Con credenciales reales: la persona entra, el ADMIN cambia a un usuario y el docente exporta un reporte."""
    clave = secrets.token_urlsafe(24)
    profesor = User.objects.create_user(
        email=f"s41.{secrets.token_hex(6)}@inst.test", password=clave, nombre="Pro", apellido="Fesor", role="PROFESOR"
    )
    admin, estudiante = _persona("ADMIN"), _persona("ESTUDIANTE")
    grupo = _grupo_con_estudiante(profesor, estudiante)

    entrada = APIClient().post(
        "/api/auth/login", {"email": profesor.email, "password": clave}, format="json", REMOTE_ADDR=IP
    )
    assert entrada.status_code == 200
    token = entrada.data["data"]["token"]
    cambio = _como(admin).put(
        f"/api/admin/users/{estudiante.pk}",
        {"email": estudiante.email, "nombre": estudiante.nombre, "apellido": estudiante.apellido,
         "role": "PROFESOR", "activo": True},
        format="json", REMOTE_ADDR=IP,
    )
    assert cambio.status_code == 200
    docente = APIClient()
    docente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")  # la sesión que abrió el acceso de arriba
    exportado = docente.get(f"/api/reportes/grupo/{grupo.pk}/export", {"caseVersionId": case_version_id}, REMOTE_ADDR=IP)
    assert exportado.status_code == 200

    entrada_auditada = _una("LOGIN_SUCCEEDED", resource_id=str(profesor.pk))
    cambio_auditado = _una("USER_ROLE_CHANGED", resource_id=str(estudiante.pk))
    exportacion_auditada = _una("REPORT_EXPORTED", resource_id=str(grupo.pk))
    assert entrada_auditada.actor_id == profesor.pk
    assert cambio_auditado.actor_id == admin.pk
    assert exportacion_auditada.actor_id == profesor.pk  # el actor de la exportación sale de la sesión real
    # Y la auditoría las devuelve por su etiqueta.
    for etiqueta in ("sesion.entrar", "usuario.rol", "reporte.exportar"):
        pagina = _get(_como(admin), "/api/admin/audit", action=etiqueta).data["data"]
        assert pagina["coverage"]["total"] >= 1, etiqueta
