"""S7-1a · La tabla de casos de abuso (plan 03, S7-1): «un atacante con una cuenta de estudiante no puede X», fila por fila.

SIEP lleva meses con controles de acceso, límites y sesión repartidos en decenas de archivos de prueba. Esta es UNA tabla
que se corre con ``-m security``: cada familia es una tabla parametrizada (``pytest.param(..., id="…")``, una fila por
caso concreto) contra el cliente de pruebas de DRF con tokens JWT REALES (nunca contra una red). Cada familia lleva su
**control negativo**: ``afirmar_que_cae(fila, apagar)`` comprueba que la fila se cumple con el control puesto y que, con
el control APAGADO (``monkeypatch`` u ``override_settings``), la MISMA fila deja de cumplirse. Así ninguna fila pasa en vacío.
Las contraseñas, las llaves y los tokens se generan en cada ejecución; ningún valor es un literal. Los ataques al token
(``alg: none``, otra llave, ``ep`` viejo, claims manipuladas, cabeceras raras) están en ``test_jwt_attacks.py``.

Familias, y el código existente que ya las cubría (se cita para no duplicar la lógica; aquí la fila se repite con su control):

1. Aislamiento entre personas, la estudiante A contra B (``apps/simulation/tests/test_attempt_owner_only.py``: token ajeno →
   403; ``apps/privacy/tests/test_consent_api.py``). Aquí se añaden el token propio sobre el intento ajeno, la falta de
   token, la comprobación de que una orden rechazada no cambia nada y los controles.
2. Docente fuera de sus grupos (``apps/reportes/tests/test_alcance_docente.py``, ``apps/simulation/tests/test_instructor.py``,
   ``apps/simulation/tests/test_policy_matrix_http.py``).
3. Estudiante o docente en rutas de ADMIN (``apps/simulation/tests/test_policy_matrix_http.py``).
4. Anónimo contra toda ruta privada del inventario de superficie (``shared/tests/test_public_routes.py`` mira la
   exposición; aquí se llama a cada ruta con ids ficticios).
5. Reenvío de órdenes (``apps/simulation/tests/test_attempt_concurrency.py``, ``apps/simulation/tests/test_scene_hints.py``).
6. IP falsa contra el limitador, de punta a punta (``shared/tests/test_client_ip.py`` y
   ``apps/security/tests/test_throttled_views.py`` prueban las piezas por separado).
7. Cuerpos hostiles (``shared/tests/test_body_limits.py`` prueba el middleware con peticiones armadas a mano).
8. Inyección en parámetros de búsqueda, de ruta y en textos que el servicio lee crudos del cuerpo.
9. XSS almacenado (``apps/simulation/tests/test_plain_text_parity.py``, ``shared/tests/test_texto_de_persona.py``).
10. Salida sin campos prohibidos ni cadenas de conexión, y vistas del docente con alias (``test_openapi_matches_responses.py``
    fija las formas).
11. Importación hostil (``apps/simulation/tests/test_import_hostile.py``, ``apps/grupos/tests/test_import_hardening.py``).
12. CORS.
13. Los defectos que el plan vigila en S7-1: D-6 (último ADMIN), D-8 (CSV con fórmulas), D-12 (referencias del editor a
    otro caso) y D-17 (rúbricas globales).

Controles que NO se pueden apagar, y por qué: la forma ``alg: none`` sin el punto final la rechaza el lector de PyJWT antes de
mirar la firma (su control es el de la fila hermana); la consulta parametrizada del ORM no tiene interruptor (los controles de
la inyección apagan la lista blanca de estados y simulan un filtro comodín); y un ``Content-Length`` MAYOR que el cuerpo real no
se puede enviar con el cliente de pruebas (su ``FakePayload`` lanza al leer más allá del cuerpo): queda para S7-1b, contra el
servidor real (``scripts/api-e2e.mjs``).

Hallazgos: una fila que REVELA un defecto real no se arregla aquí ni queda en rojo; va ``xfail(strict=True, raises=
AssertionError)`` con la razón ``HALLAZGO: …``. Si algún día se arregla, el XPASS estricto avisa de que hay que quitar la marca.

Pendiente de S7-1b: ``returnUrl`` hostil (es de interfaz) y ``scripts/api-e2e.mjs`` (la misma tabla contra el servidor local).
"""
import copy
import csv
import io
import ipaddress
import json
import re
import secrets
import threading
import xml.etree.ElementTree as ElementTreeEstandar
from collections import namedtuple
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DEFAULT_DB_ALIAS, connections
from django.test import override_settings
from django.urls import Resolver404, resolve
from rest_framework import serializers
from rest_framework.test import APIClient

from apps.grupos import memberships
from apps.grupos import serializers as serializadores_de_grupos
from apps.grupos import services as servicios_de_grupos
from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.grupos.tests.test_import_hardening import NS as ESPACIO_DE_HOJA
from apps.grupos.tests.test_import_hardening import _workbook
from apps.privacy import consent_service
from apps.privacy.models import ConsentRecord
from apps.reportes import services as servicios_de_reportes
from apps.security import limiter
from apps.security.limits import LIMITS, Limit
from apps.simulation.casedef import import_ as lectura_dsl
from apps.simulation.casedef import limits as limites_dsl
from apps.simulation.models import (
    AttemptEvent,
    AttemptHintView,
    AuditLog,
    CaseVersion,
    DecisionOption,
    ReflectionJournal,
    SceneHint,
    SceneMap,
    SimulationAttempt,
)
from apps.simulation.services import audit_service, game_service, instructor_service, text_rules
from apps.simulation.services import hints as servicio_de_pistas
from apps.simulation.services.authoring import graph as servicio_del_grafo
from apps.simulation.tests import dsl_support
from apps.simulation.views import instructor_views
from apps.users import serializers as serializadores_de_cuentas
from apps.users.models import AccessRequest
from apps.users.serializers import generate_access_token
from apps.users.services import account_service
from shared import client_ip as modulo_ip
from shared import policies, surface
from shared.spa import spa_index

pytestmark = [
    pytest.mark.req("RNF-002"),
    pytest.mark.req("BLOQUE-L"),
    pytest.mark.security,
    pytest.mark.django_db,
]

User = get_user_model()

MIB = 1024 * 1024
LOGIN = "/api/auth/login"
ORDEN = "/api/simulation/attempts"
INTENTO = "/api/simulation/attempts/{intento_b}"
TOKEN_DEL_INTENTO = "HTTP_X_SIEP_ATTEMPT_TOKEN"
INVENTARIO = Path(surface.__file__).with_name("surface-inventory.json")


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  Piezas comunes
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════


def afirmar_que_cae(fila, apagar):
    """Control negativo: ``fila()`` se cumple con el control puesto y deja de cumplirse con el control APAGADO.

    ``fila`` es una función sin argumentos que pide y afirma (lanza ``AssertionError`` si no se cumple); ``apagar`` es una
    función sin argumentos que devuelve el administrador de contexto que apaga el control real (``monkeypatch`` u
    ``override_settings``). Primero se corre la fila tal cual: si no se cumple ya, el control no prueba nada. Una excepción
    distinta de ``AssertionError`` con el control apagado también cuenta como fila que no se cumple.
    """
    fila()
    with apagar():
        try:
            fila()
        except Exception:  # noqa: BLE001  (con el control apagado, una fila que revienta tampoco se cumple)
            return
    pytest.fail("el control negativo no tumbó la fila: con el control apagado la fila se siguió cumpliendo")


@contextmanager
def _parchado(monkeypatch, *cambios):
    """Pone ``(objeto, nombre, valor)`` mientras dura el bloque y lo deja todo como estaba al salir."""
    with monkeypatch.context() as parche:
        for objeto, nombre, valor in cambios:
            parche.setattr(objeto, nombre, valor)
        yield


@contextmanager
def _politica_abierta(monkeypatch, *acciones):
    """``policies.can`` dice que sí a estas ``(recurso, acción)``: la guarda de dueño o de alcance, apagada."""
    original = policies.can

    def can(actor, resource, action, **datos):
        if (resource, action) in acciones:
            return True
        return original(actor, resource, action, **datos)

    with _parchado(monkeypatch, (policies, "can", can)):
        yield


def _roles_abiertos(monkeypatch):
    """``policies.has_role`` dice que sí a cualquiera, hasta a quien no tiene sesión: la puerta de rol, apagada."""
    return _parchado(monkeypatch, (policies, "has_role", lambda actor, *roles: True))


class Persona:
    """Una cuenta con su token de sesión REAL (el que emite el servidor): lo que lleva quien ataca en su cabecera."""

    def __init__(self, cuenta):
        self.cuenta = cuenta
        self.token = generate_access_token(cuenta)

    @property
    def id(self):
        return self.cuenta.id

    @property
    def email(self):
        return self.cuenta.email

    def cliente(self):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")
        return cliente


def _persona(rol, etiqueta, clave=None):
    """Una cuenta nueva; su nombre y apellido son únicos, para buscarlos en una respuesta que no debería traerlos."""
    return Persona(
        User.objects.create_user(
            email=f"{etiqueta}-{secrets.token_hex(4)}@example.com",
            password=clave,
            nombre=f"{etiqueta.title()}{secrets.token_hex(3)}",
            apellido=f"Apellido{secrets.token_hex(3)}",
            role=rol,
        )
    )


class Mundo:
    """Dos estudiantes (A y B), cada uno con su docente, su grupo, su intento en juego y su bitácora; y un ADMIN.

    También una invitación PENDIENTE de B a un tercer grupo del docente de A, y el caso sembrado asignado a los dos grupos.
    """

    def __init__(self):
        self.version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
        self.clave_del_admin = secrets.token_urlsafe(24)
        self.admin = _persona("ADMIN", "admin", self.clave_del_admin)
        self.docente_a = _persona("PROFESOR", "docentea")
        self.docente_b = _persona("PROFESOR", "docenteb")
        self.estudiante_a = _persona("ESTUDIANTE", "estudiantea")
        self.estudiante_b = _persona("ESTUDIANTE", "estudianteb")
        self.grupo_a = self._grupo(self.docente_a, self.estudiante_a, "A")
        self.grupo_b = self._grupo(self.docente_b, self.estudiante_b, "B")
        self.asignacion_a = CaseAssignment.objects.get(grupo=self.grupo_a, case_version=self.version)
        self.asignacion_b = CaseAssignment.objects.get(grupo=self.grupo_b, case_version=self.version)
        self.grupo_invitacion = Grupo.objects.create(
            nombre=f"GrupoInv{secrets.token_hex(3)}", codigo=f"INV{secrets.token_hex(4)}", profesor=self.docente_a.cuenta
        )
        GrupoEstudiante.objects.create(
            grupo=self.grupo_invitacion, estudiante=self.estudiante_b.cuenta, status="INVITED"
        )
        self.intento_a = self._empezar(self.estudiante_a)
        self.intento_b = self._empezar(self.estudiante_b)
        self.reflexion = {
            "a": self._reflexionar(self.estudiante_a, self.intento_a),
            "b": self._reflexionar(self.estudiante_b, self.intento_b),
        }
        self.nodo_b = self.intento_b["currentNode"]["id"]
        self.opcion_b = self.intento_b["currentNode"]["options"][0]["id"]

    def _grupo(self, docente, estudiante, etiqueta):
        grupo = Grupo.objects.create(
            nombre=f"Grupo{etiqueta}{secrets.token_hex(3)}", codigo=f"{etiqueta}{secrets.token_hex(4)}", profesor=docente.cuenta
        )
        GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante.cuenta, status="ACTIVE")
        CaseAssignment.objects.create(grupo=grupo, case_version=self.version)
        return grupo

    def _empezar(self, estudiante):
        respuesta = estudiante.cliente().post(ORDEN, {"caseVersionId": self.version.id}, format="json")
        assert respuesta.status_code == 200, respuesta.data
        return respuesta.data["data"]

    def _reflexionar(self, estudiante, intento):
        texto = f"REFLEXION-{secrets.token_hex(6)}"
        respuesta = estudiante.cliente().post(
            f"{ORDEN}/{intento['attemptId']}/reflections",
            {"attemptToken": intento["attemptToken"], "nodeId": intento["currentNode"]["id"], "text": texto},
            format="json",
        )
        assert respuesta.status_code == 200, respuesta.data
        return texto

    @property
    def ids(self):
        return {
            "intento_a": self.intento_a["attemptId"],
            "intento_b": self.intento_b["attemptId"],
            "grupo_a": self.grupo_a.id,
            "grupo_b": self.grupo_b.id,
            "grupo_invitacion": self.grupo_invitacion.id,
            "estudiante_a": self.estudiante_a.id,
            "estudiante_b": self.estudiante_b.id,
            "docente_a": self.docente_a.id,
            "docente_b": self.docente_b.id,
            "admin": self.admin.id,
            "version": self.version.id,
            "asignacion_a": self.asignacion_a.id,
            "asignacion_b": self.asignacion_b.id,
        }

    def token_del_intento(self, lado):
        return (self.intento_a if lado == "a" else self.intento_b)["attemptToken"]

    def datos_de(self, lado):
        """Lo que identifica a un lado (A o B) y que NINGUNA respuesta dirigida al otro lado debe traer."""
        estudiante, docente, grupo = (
            (self.estudiante_a, self.docente_a, self.grupo_a) if lado == "a" else (self.estudiante_b, self.docente_b, self.grupo_b)
        )
        return [
            estudiante.email,
            estudiante.cuenta.nombre,
            estudiante.cuenta.apellido,
            docente.email,
            docente.cuenta.nombre,
            docente.cuenta.apellido,
            grupo.nombre,
            grupo.codigo,
            self.reflexion[lado],
            self.token_del_intento(lado),
        ]


@pytest.fixture
def mundo(db):
    return Mundo()


def _instantanea():
    """Lo que una orden rechazada no puede haber cambiado: eventos, bitácoras, pistas, grupos, cuentas, consentimientos…"""
    return {
        "eventos": AttemptEvent.objects.count(),
        "bitacoras": ReflectionJournal.objects.count(),
        "pistas": AttemptHintView.objects.count(),
        "membresias": sorted(GrupoEstudiante.objects.values_list("grupo_id", "estudiante_id", "status")),
        "grupos": sorted(Grupo.objects.values_list("id", "nombre", "codigo", "activo")),
        "asignaciones": sorted(CaseAssignment.objects.values_list("id", "active")),
        "cuentas": sorted(User.objects.values_list("id", "role", "activo", "session_epoch")),
        "consentimientos": sorted(ConsentRecord.objects.values_list("id", "withdrawn_at")),
        "intentos": sorted(SimulationAttempt.objects.values_list("id", "status", "current_node_id")),
    }


Fila = namedtuple("Fila", "quien metodo ruta estado codigo cuerpo token ajeno")


def _fila(nombre, quien, metodo, ruta, estado, codigo=None, *, cuerpo=None, token=None, ajeno=None):
    """Una fila de la tabla: quién llama, qué llama, qué debe contestar el servidor y qué datos ajenos NO pueden salir.

    ``ruta`` lleva los ids del mundo entre llaves (``{intento_b}``); ``cuerpo`` es un diccionario o una función del mundo;
    ``token`` (``a`` o ``b``) es de quién es el token del intento que se manda (en la cabecera y en el cuerpo).
    """
    return pytest.param(Fila(quien, metodo, ruta, estado, codigo, cuerpo, token, ajeno), id=nombre)


def _cliente_de(mundo, quien):
    return APIClient() if quien == "anonimo" else getattr(mundo, quien).cliente()


def _ejecutar(mundo, fila):
    """Llama a la ruta de la fila y afirma el estado, el código, que no salga ningún dato ajeno y que nada haya cambiado."""
    antes = _instantanea()
    cliente = _cliente_de(mundo, fila.quien)
    url = fila.ruta.format(**mundo.ids)
    cuerpo = fila.cuerpo(mundo) if callable(fila.cuerpo) else fila.cuerpo
    extra = {}
    if fila.token:
        token = mundo.token_del_intento(fila.token)
        extra[TOKEN_DEL_INTENTO] = token
        if cuerpo is not None:
            cuerpo = {**cuerpo, "attemptToken": token}
    if fila.metodo in ("GET", "DELETE"):
        respuesta = getattr(cliente, fila.metodo.lower())(url, **extra)
    else:
        respuesta = getattr(cliente, fila.metodo.lower())(url, {} if cuerpo is None else cuerpo, format="json", **extra)
    assert respuesta.status_code == fila.estado, (fila.metodo, url, respuesta.status_code, getattr(respuesta, "data", None))
    if fila.codigo is not None:
        codigos = fila.codigo if isinstance(fila.codigo, tuple) else (fila.codigo,)
        assert respuesta.data["code"] in codigos, respuesta.data
    if fila.ajeno is not None:
        contenido = respuesta.content.decode("utf-8", "replace")
        for dato in mundo.datos_de(fila.ajeno):
            assert dato not in contenido, f"{fila.metodo} {url}: la respuesta trae un dato ajeno ({dato[:14]}…)"
    if fila.estado >= 400:
        assert _instantanea() == antes, f"{fila.metodo} {url}: una orden rechazada cambió algo"
    return respuesta


def _filas_por_id(tabla):
    return {parametro.id: parametro.values[0] for parametro in tabla}


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  1 · Aislamiento entre personas: la estudiante A contra los datos de B  (D-11, LS-7, SIEP-RNF-04)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

#: (nombre, método, ruta, cuerpo): lo que el juego ofrece sobre UN intento. Cada una se prueba con el token de B (filtrado),
#: con el token propio de A y sin token.
ENDPOINTS_DE_INTENTO = [
    ("intento", "GET", INTENTO, None),
    ("mundo", "GET", INTENTO + "/world", None),
    ("pistas", "GET", INTENTO + "/hints", None),
    ("mapa-de-progreso", "GET", INTENTO + "/progress-map", None),
    ("reporte", "GET", INTENTO + "/report", None),
    ("reporte-de-cierre", "GET", INTENTO + "/completion-report", None),
    ("decision", "POST", INTENTO + "/decisions", lambda m: {"decisionOptionId": m.opcion_b}),
    ("bitacora", "POST", INTENTO + "/reflections", lambda m: {"nodeId": m.nodo_b, "text": "texto del intruso"}),
    ("pedir-pista", "POST", INTENTO + "/hints/next", {}),
    ("posicion", "PATCH", INTENTO + "/world-state", {"playerX": 1, "playerY": 1}),
    ("salida-segura", "POST", INTENTO + "/safe-exit", {"reason": "x"}),
    ("reanudar", "POST", INTENTO + "/resume", {}),
    ("cruzar-puerta", "POST", INTENTO + "/enter-room", {"targetNodeKey": "x"}),
    ("interaccion", "POST", INTENTO + "/interactions/x", {}),
    ("npc", "POST", INTENTO + "/npcs/x", {}),
    ("herramienta", "POST", INTENTO + "/tools/use", {"toolCode": "x"}),
]


def _filas_de_intento_ajeno():
    filas = []
    for nombre, metodo, ruta, cuerpo in ENDPOINTS_DE_INTENTO:
        filas += [
            # A conoce el id y el token de B (se filtró): la guarda de dueño de ``_require_attempt`` lo frena.
            _fila(f"{nombre}-con-el-token-de-b", "estudiante_a", metodo, ruta, 403, "FORBIDDEN", cuerpo=cuerpo, token="b", ajeno="b"),
            # A solo conoce el id: su propio token no abre el intento de B (el token es la llave de cada intento).
            _fila(f"{nombre}-con-su-propio-token", "estudiante_a", metodo, ruta, 404, "NOT_FOUND", cuerpo=cuerpo, token="a", ajeno="b"),
            _fila(f"{nombre}-sin-token", "estudiante_a", metodo, ruta, 400, "VALIDATION_ERROR", cuerpo=cuerpo, ajeno="b"),
        ]
    return filas


TABLA_DE_AISLAMIENTO = [
    *_filas_de_intento_ajeno(),
    # Las rutas que no piden el token del intento.
    _fila("reporte-de-estudiante-del-intento-de-b", "estudiante_a", "GET", INTENTO + "/student-report", 403, "FORBIDDEN", ajeno="b"),
    _fila("evaluacion-del-intento-de-b", "estudiante_a", "GET", INTENTO + "/evaluation", 403, "FORBIDDEN", ajeno="b"),
    # La bitácora de B la lee el docente descifrada, no un estudiante: ni la traza ni la evaluación son de A.
    _fila("traza-con-la-bitacora-de-b", "estudiante_a", "GET", "/api/instructor/attempts/{intento_b}/trace", 403, "FORBIDDEN", ajeno="b"),
    _fila("evaluar-el-intento-de-b", "estudiante_a", "POST", "/api/instructor/attempts/{intento_b}/rubric-evaluation", 403, "FORBIDDEN", ajeno="b"),
    _fila("reemplazar-el-intento-de-b", "estudiante_a", "POST", "/api/instructor/attempts/{intento_b}/replace", 403, "FORBIDDEN", cuerpo={"reason": "x"}, ajeno="b"),
    _fila("listado-de-intentos-del-docente", "estudiante_a", "GET", "/api/instructor/attempts", 403, "FORBIDDEN", ajeno="b"),
    _fila("reporte-de-b-por-su-id", "estudiante_a", "GET", "/api/reportes/estudiante/{estudiante_b}", 403, "FORBIDDEN", ajeno="b"),
    _fila("reporte-del-grupo-de-b", "estudiante_a", "GET", "/api/reportes/grupo/{grupo_b}", 403, "FORBIDDEN", ajeno="b"),
    _fila("tablero-del-docente", "estudiante_a", "GET", "/api/reportes/dashboard", 403, "FORBIDDEN", ajeno="b"),
    _fila("estudiantes-del-grupo-de-b", "estudiante_a", "GET", "/api/grupos/{grupo_b}/estudiantes", 403, "FORBIDDEN", ajeno="b"),
    _fila("invitar-al-grupo-de-b", "estudiante_a", "POST", "/api/grupos/{grupo_b}/estudiantes", 403, "FORBIDDEN", cuerpo={"email": "otra@example.com"}, ajeno="b"),
    # Invitaciones y membresías de otro.
    _fila("aceptar-la-invitacion-de-b", "estudiante_a", "POST", "/api/me/invitations/{grupo_invitacion}/accept", 404, "NOT_FOUND", cuerpo={}, ajeno="b"),
    _fila("rechazar-la-invitacion-de-b", "estudiante_a", "POST", "/api/me/invitations/{grupo_invitacion}/decline", 404, "NOT_FOUND", cuerpo={}, ajeno="b"),
    _fila("salir-del-grupo-de-b", "estudiante_a", "POST", "/api/me/invitations/{grupo_b}/leave", 404, "NOT_FOUND", cuerpo={}, ajeno="b"),
    _fila("activar-la-membresia-de-b", "estudiante_a", "POST", "/api/grupos/{grupo_invitacion}/estudiantes/{estudiante_b}/activar", 403, "FORBIDDEN", cuerpo={}, ajeno="b"),
    # Lo propio de A nunca trae lo de B.
    _fila("historial-propio", "estudiante_a", "GET", "/api/simulation/attempts/history", 200, ajeno="b"),
    _fila("intento-abierto-propio", "estudiante_a", "GET", "/api/simulation/cases/{version}/active-attempt", 200, ajeno="b"),
    _fila("invitaciones-propias", "estudiante_a", "GET", "/api/me/invitations", 200, ajeno="b"),
    _fila("catalogo-de-casos", "estudiante_a", "GET", "/api/simulation/cases", 200, ajeno="b"),
]
FILAS_DE_AISLAMIENTO = _filas_por_id(TABLA_DE_AISLAMIENTO)


@pytest.mark.req("D-11")
@pytest.mark.req("LS-7")
@pytest.mark.req("SIEP-RNF-04")
@pytest.mark.parametrize("fila", TABLA_DE_AISLAMIENTO)
def test_la_estudiante_a_no_alcanza_lo_de_b(mundo, fila):
    _ejecutar(mundo, fila)


@pytest.mark.req("D-11")
@pytest.mark.req("LS-7")
@pytest.mark.parametrize(
    ("nombre", "acciones"),
    [
        ("intento-con-el-token-de-b", [("attempt", "play")]),
        ("bitacora-con-el-token-de-b", [("attempt", "play")]),
        ("decision-con-el-token-de-b", [("attempt", "play")]),
        ("reporte-de-estudiante-del-intento-de-b", [("attempt", "report")]),
        ("activar-la-membresia-de-b", [("membership", "respond")]),
    ],
)
def test_control_negativo_sin_la_guarda_de_dueno_a_alcanza_lo_de_b(mundo, monkeypatch, nombre, acciones):
    """Apagada la guarda de dueño (``policies.can`` de ese recurso), la MISMA fila deja de cumplirse."""
    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_AISLAMIENTO[nombre]),
        lambda: _politica_abierta(monkeypatch, *acciones),
    )


@pytest.mark.req("D-11")
def test_control_negativo_sin_el_token_como_llave_el_token_propio_ya_no_da_404(mundo, monkeypatch):
    """El 404 de «su propio token sobre el intento de B» lo da la búsqueda por el hash del token: si no se mira el token,
    solo queda la guarda de dueño (403) y la fila deja de cumplirse."""
    hash_de_b = SimulationAttempt.objects.get(pk=mundo.intento_b["attemptId"]).attempt_token_hash
    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_AISLAMIENTO["mundo-con-su-propio-token"]),
        lambda: _parchado(monkeypatch, (game_service, "_hash_token", lambda crudo: hash_de_b)),
    )


@pytest.mark.req("D-11")
def test_control_negativo_si_el_servicio_actuara_por_b_la_invitacion_de_b_se_aceptaria(mundo, monkeypatch):
    original = memberships.accept
    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_AISLAMIENTO["aceptar-la-invitacion-de-b"]),
        lambda: _parchado(monkeypatch, (memberships, "accept", lambda grupo, estudiante: original(grupo, mundo.estudiante_b.id))),
    )


# ── El consentimiento solo opera sobre quien llama ───────────────────────────────────────────────────────────────


def _el_consentimiento_es_de_quien_llama(mundo):
    version = mundo.version.id
    url = f"/api/simulation/cases/{version}/consent"
    aviso = settings.SIEP_CONTENT_NOTICE_VERSION
    a, b = mundo.estudiante_a.cliente(), mundo.estudiante_b.cliente()
    registros = lambda: ConsentRecord.objects.filter(case_version_id=version)  # noqa: E731

    assert a.post(url, {"noticeVersion": aviso}, format="json").status_code == 201
    # B no ve el consentimiento de A…
    visto_por_b = b.get(url)
    assert visto_por_b.status_code == 200 and visto_por_b.data["data"]["accepted"] is False, visto_por_b.data
    # …ni lo retira: su DELETE solo busca lo suyo (no hay nada) y el de A sigue vigente.
    assert b.delete(url).status_code == 200
    assert a.get(url).data["data"]["accepted"] is True
    assert registros().filter(person_id=mundo.estudiante_a.id, withdrawn_at__isnull=True).count() == 1
    # B acepta mandando el id de A en el cuerpo: la aceptación queda a nombre de B, y nada se escribe a nombre de A.
    de_mas = {"personId": mundo.estudiante_a.id, "person_id": mundo.estudiante_a.id, "userId": mundo.estudiante_a.id}
    assert b.post(url, {"noticeVersion": aviso, **de_mas}, format="json").status_code == 201
    assert sorted(registros().values_list("person_id", flat=True)) == sorted([mundo.estudiante_a.id, mundo.estudiante_b.id])
    # Cuando A lo retira, el de B sigue vigente.
    assert a.delete(url).status_code == 200
    assert registros().filter(person_id=mundo.estudiante_b.id, withdrawn_at__isnull=True).count() == 1
    assert a.get(url).data["data"]["accepted"] is False


@pytest.mark.req("LS-7")
@pytest.mark.req("SIEP-RNF-04")
def test_el_consentimiento_se_lee_se_acepta_y_se_retira_solo_para_quien_llama(mundo):
    """Cubierto en parte por ``apps/privacy/tests/test_consent_api.py``; aquí A y B juntos, con el id ajeno en el cuerpo."""
    _el_consentimiento_es_de_quien_llama(mundo)


@pytest.mark.req("LS-7")
def test_control_negativo_si_el_servicio_tomara_a_la_persona_de_otro_lado_b_veria_el_consentimiento_de_a(mundo, monkeypatch):
    a = mundo.estudiante_a.id
    afirmar_que_cae(
        lambda: _el_consentimiento_es_de_quien_llama(mundo),
        lambda: _parchado(monkeypatch, (consent_service, "_person_id", lambda persona: a)),
    )


def _el_consentimiento_de_a_no_abre_el_mundo_de_b(mundo, settings_):
    settings_.SIEP_CONSENT_REQUIRED = True
    url = f"/api/simulation/cases/{mundo.version.id}/consent"
    assert mundo.estudiante_a.cliente().post(url, {"noticeVersion": settings_.SIEP_CONTENT_NOTICE_VERSION}, format="json").status_code == 201
    propio = mundo.estudiante_a.cliente().get(
        f"{ORDEN}/{mundo.intento_a['attemptId']}/world", **{TOKEN_DEL_INTENTO: mundo.token_del_intento("a")}
    )
    assert propio.status_code == 200, propio.data
    ajeno = mundo.estudiante_b.cliente().get(
        f"{ORDEN}/{mundo.intento_b['attemptId']}/world", **{TOKEN_DEL_INTENTO: mundo.token_del_intento("b")}
    )
    assert ajeno.status_code == 403 and ajeno.data["code"] == "CONSENT_REQUIRED", (ajeno.status_code, ajeno.data)


@pytest.mark.req("LS-7")
def test_con_el_consentimiento_exigido_el_de_a_no_abre_el_mundo_de_b(mundo, settings):
    _el_consentimiento_de_a_no_abre_el_mundo_de_b(mundo, settings)


@pytest.mark.req("LS-7")
def test_control_negativo_si_el_consentimiento_se_heredara_el_mundo_de_b_se_abriria(mundo, settings, monkeypatch):
    a = mundo.estudiante_a.id
    afirmar_que_cae(
        lambda: _el_consentimiento_de_a_no_abre_el_mundo_de_b(mundo, settings),
        lambda: _parchado(monkeypatch, (consent_service, "_person_id", lambda persona: a)),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  2 · Docente fuera de sus grupos: el PROFESOR B contra lo del PROFESOR A  (LS-7, SIEP-RNF-05, D-11)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Los 400 de las rutas de grupo son los reales: ``apps/grupos/services._require_grupo`` responde «No tiene permiso sobre
# este grupo» como ``VALIDATION_ERROR`` (paridad con Spring, ya fijada en ``test_policy_matrix_http``). Los reportes y la
# traza responden 403; las asignaciones, 403 ``GROUP_NOT_OWNED`` al crear y 404 al leer o tocar una ajena.

SIN_PERMISO_DE_GRUPO = ("VALIDATION_ERROR",)

TABLA_DE_DOCENTE = [
    _fila("traza-del-intento-de-a", "docente_b", "GET", "/api/instructor/attempts/{intento_a}/trace", 403, "FORBIDDEN", ajeno="a"),
    _fila("rubrica-del-intento-de-a", "docente_b", "GET", "/api/instructor/attempts/{intento_a}/rubric-evaluation", 403, "FORBIDDEN", ajeno="a"),
    _fila("evaluar-el-intento-de-a", "docente_b", "POST", "/api/instructor/attempts/{intento_a}/rubric-evaluation", 403, "FORBIDDEN", cuerpo={}, ajeno="a"),
    _fila("reemplazar-el-intento-de-a", "docente_b", "POST", "/api/instructor/attempts/{intento_a}/replace", 403, "FORBIDDEN", cuerpo={"reason": "x"}, ajeno="a"),
    _fila("reporte-de-estudiante-del-intento-de-a", "docente_b", "GET", "/api/simulation/attempts/{intento_a}/student-report", 403, "FORBIDDEN", ajeno="a"),
    _fila("reporte-del-estudiante-a", "docente_b", "GET", "/api/reportes/estudiante/{estudiante_a}", 403, "FORBIDDEN", ajeno="a"),
    _fila("reporte-del-grupo-de-a", "docente_b", "GET", "/api/reportes/grupo/{grupo_a}?caseVersionId={version}", 403, "FORBIDDEN", ajeno="a"),
    _fila("exportar-el-grupo-de-a", "docente_b", "GET", "/api/reportes/grupo/{grupo_a}/export?caseVersionId={version}", 403, "FORBIDDEN", ajeno="a"),
    _fila("intentos-del-grupo-de-a", "docente_b", "GET", "/api/instructor/attempts?grupoId={grupo_a}", 403, "FORBIDDEN", ajeno="a"),
    _fila("intentos-del-estudiante-a", "docente_b", "GET", "/api/instructor/attempts?estudianteId={estudiante_a}", 200, ajeno="a"),
    _fila("mis-intentos", "docente_b", "GET", "/api/instructor/attempts", 200, ajeno="a"),
    _fila("mis-intentos-recientes", "docente_b", "GET", "/api/instructor/attempts/recent", 200, ajeno="a"),
    _fila("mi-tablero", "docente_b", "GET", "/api/reportes/dashboard", 200, ajeno="a"),
    _fila("mis-grupos", "docente_b", "GET", "/api/grupos", 200, ajeno="a"),
    _fila("estudiantes-del-grupo-de-a", "docente_b", "GET", "/api/grupos/{grupo_a}/estudiantes", 400, SIN_PERMISO_DE_GRUPO, ajeno="a"),
    _fila("invitar-al-grupo-de-a", "docente_b", "POST", "/api/grupos/{grupo_a}/estudiantes", 400, SIN_PERMISO_DE_GRUPO, cuerpo={"email": "otra@example.com"}, ajeno="a"),
    _fila("retirar-al-estudiante-a", "docente_b", "DELETE", "/api/grupos/{grupo_a}/estudiantes/{estudiante_a}", 400, SIN_PERMISO_DE_GRUPO, ajeno="a"),
    _fila("renombrar-el-grupo-de-a", "docente_b", "PUT", "/api/grupos/{grupo_a}", 400, SIN_PERMISO_DE_GRUPO, cuerpo={"nombre": "Tomado"}, ajeno="a"),
    _fila("editar-el-grupo-de-a", "docente_b", "PATCH", "/api/grupos/{grupo_a}", 400, SIN_PERMISO_DE_GRUPO, cuerpo={"nombre": "Tomado"}, ajeno="a"),
    _fila("borrar-el-grupo-de-a", "docente_b", "DELETE", "/api/grupos/{grupo_a}", 400, SIN_PERMISO_DE_GRUPO, ajeno="a"),
    _fila("casos-del-grupo-de-a", "docente_b", "GET", "/api/grupos/{grupo_a}/casos", 400, SIN_PERMISO_DE_GRUPO, ajeno="a"),
    _fila("asignar-un-caso-al-grupo-de-a", "docente_b", "POST", "/api/grupos/{grupo_a}/casos", 400, SIN_PERMISO_DE_GRUPO, cuerpo=lambda m: {"caseVersionId": m.version.id}, ajeno="a"),
    _fila("quitar-un-caso-del-grupo-de-a", "docente_b", "DELETE", "/api/grupos/{grupo_a}/casos/{version}", 400, SIN_PERMISO_DE_GRUPO, ajeno="a"),
    _fila("asignaciones-del-grupo-de-a", "docente_b", "GET", "/api/assignments?groupId={grupo_a}", 404, "NOT_FOUND", ajeno="a"),
    _fila(
        "crear-una-asignacion-en-el-grupo-de-a", "docente_b", "POST", "/api/assignments", 403, "GROUP_NOT_OWNED",
        cuerpo=lambda m: {"caseVersionId": m.version.id, "target": {"type": "GROUP", "groupId": m.grupo_a.id}}, ajeno="a",
    ),
    _fila("cambiar-la-asignacion-de-a", "docente_b", "PATCH", "/api/assignments/{asignacion_a}", 404, "NOT_FOUND", cuerpo={"active": False}, ajeno="a"),
    _fila("retirar-la-asignacion-de-a", "docente_b", "DELETE", "/api/assignments/{asignacion_a}", 404, "NOT_FOUND", ajeno="a"),
]
FILAS_DE_DOCENTE = _filas_por_id(TABLA_DE_DOCENTE)


@pytest.mark.req("LS-7")
@pytest.mark.req("SIEP-RNF-05")
@pytest.mark.req("D-11")
@pytest.mark.parametrize("fila", TABLA_DE_DOCENTE)
def test_el_docente_b_no_alcanza_lo_del_docente_a(mundo, fila):
    _ejecutar(mundo, fila)


@pytest.mark.req("LS-7")
def test_el_docente_b_no_importa_estudiantes_al_grupo_de_a(mundo):
    """Importar crea cuentas: un docente ajeno no las crea ni invita a nadie al grupo de A (la transacción se deshace)."""
    from apps.grupos.tests.test_grupos import _xlsx_upload

    cuentas = User.objects.count()
    archivo = _xlsx_upload([["nombre", "apellido", "email"], ["Ana", "Gil", f"intruso-{secrets.token_hex(4)}@example.com"]])
    respuesta = mundo.docente_b.cliente().post(
        f"/api/grupos/{mundo.grupo_a.id}/estudiantes/import", {"file": archivo}, format="multipart"
    )
    assert respuesta.status_code == 400, (respuesta.status_code, respuesta.data)
    assert respuesta.data["code"] == "VALIDATION_ERROR"
    assert User.objects.count() == cuentas


@pytest.mark.req("LS-7")
@pytest.mark.parametrize(
    "nombre",
    ["traza-del-intento-de-a", "reporte-de-estudiante-del-intento-de-a", "reporte-del-estudiante-a"],
)
def test_control_negativo_sin_el_alcance_del_docente_b_lee_lo_de_a(mundo, monkeypatch, nombre):
    """Si el alcance del docente (los estudiantes de sus grupos) dejara de aplicarse, el docente B leería lo de A."""
    sin_limite = lambda instructor: None  # noqa: E731  (None = el ADMIN: sin restricción)
    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_DOCENTE[nombre]),
        lambda: _parchado(
            monkeypatch,
            (instructor_service, "student_ids_for_instructor", sin_limite),
            (servicios_de_reportes, "student_ids_for_instructor", sin_limite),
            (game_service, "student_ids_for_instructor", sin_limite),
        ),
    )


@pytest.mark.req("LS-7")
def test_control_negativo_sin_la_guarda_del_grupo_el_docente_b_lista_a_los_estudiantes_de_a(mundo, monkeypatch):
    def sin_dueno(grupo_id, profesor):
        return Grupo.objects.get(pk=grupo_id)

    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_DOCENTE["estudiantes-del-grupo-de-a"]),
        lambda: _parchado(monkeypatch, (servicios_de_grupos, "_require_grupo", sin_dueno)),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  3 · Estudiante o docente en rutas de ADMIN  (RNF-002)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

RUTAS_DEL_ADMIN = [
    ("listar-cuentas", "GET", "/api/admin/users", None),
    ("crear-cuenta", "POST", "/api/admin/users", lambda m: {"email": f"nueva-{secrets.token_hex(4)}@example.com", "password": secrets.token_urlsafe(16), "nombre": "Ana", "apellido": "Gil", "role": "ADMIN"}),
    ("editar-cuenta", "PUT", "/api/admin/users/{estudiante_b}", lambda m: {"email": m.estudiante_b.email, "nombre": "Ana", "apellido": "Gil", "role": "ADMIN", "activo": True}),
    ("cambiar-estado-de-cuenta", "PATCH", "/api/admin/users/{estudiante_b}/status", {"activo": False}),
    ("cerrar-sesiones-de-otra-persona", "POST", "/api/admin/users/{estudiante_b}/revoke-sessions", {}),
    ("aprobar-cuentas", "POST", "/api/admin/users/approve", lambda m: {"userIds": [m.estudiante_b.id]}),
    ("leer-la-auditoria", "GET", "/api/admin/audit", None),
    ("listar-solicitudes-de-acceso", "GET", "/api/admin/access-requests", None),
    ("resolver-una-solicitud-de-acceso", "PATCH", "/api/admin/access-requests/1/status", {"status": "REVIEWED"}),
    ("publicar-un-caso", "POST", "/api/authoring/cases/{version}/publish", {}),
    ("publicar-un-caso-por-el-alias-admin", "POST", "/api/admin/cases/{version}/publish", {}),
    ("aprobar-un-caso", "POST", "/api/authoring/cases/{version}/lifecycle", {"action": "approve"}),
    ("rubrica-por-defecto", "POST", "/api/rubrics/1/default", {}),
    ("ampliar-el-catalogo-de-competencias", "POST", "/api/competencies", {"code": "COMP-X", "name": "Competencia"}),
]
TABLA_DE_RUTAS_DE_ADMIN = [
    _fila(f"{quien}-{nombre}", quien, metodo, ruta, 403, ("FORBIDDEN", "CASE_ACTION_FORBIDDEN"), cuerpo=cuerpo)
    for quien in ("estudiante_a", "docente_a")
    for nombre, metodo, ruta, cuerpo in RUTAS_DEL_ADMIN
]
FILAS_DE_RUTAS_DE_ADMIN = _filas_por_id(TABLA_DE_RUTAS_DE_ADMIN)


@pytest.mark.req("RNF-002")
@pytest.mark.req("SIEP-RNF-04")
@pytest.mark.parametrize("fila", TABLA_DE_RUTAS_DE_ADMIN)
def test_un_estudiante_o_un_docente_no_entra_a_las_rutas_del_admin(mundo, fila):
    _ejecutar(mundo, fila)


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize(
    "nombre",
    ["estudiante_a-listar-cuentas", "docente_a-cerrar-sesiones-de-otra-persona", "estudiante_a-leer-la-auditoria"],
)
def test_control_negativo_sin_la_puerta_de_rol_el_estudiante_o_el_docente_entra(mundo, monkeypatch, nombre):
    """Apagada la puerta de rol (``policies.has_role``), la MISMA fila deja de cumplirse."""
    afirmar_que_cae(
        lambda: _ejecutar(mundo, FILAS_DE_RUTAS_DE_ADMIN[nombre]),
        lambda: _roles_abiertos(monkeypatch),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  4 · Anónimo: toda ruta privada del inventario de superficie responde 401 sin token  (RNF-002, LS-7)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

_EJEMPLOS_DE_PARAMETRO = {"int": "1", "uuid": "00000000-0000-4000-8000-000000000001", "str": "x"}
_PARAMETRO_DE_RUTA = re.compile(r"<(?:(?P<tipo>[a-z]+):)?(?P<nombre>[a-z_]+)>")
_DOCUMENTACION = {"schema", "swagger-ui.html"}


def _rutas_privadas():
    """``(método, ruta)`` de cada fila del inventario versionado cuya exposición no es pública."""
    filas = json.loads(INVENTARIO.read_text(encoding="utf-8"))["routes"]
    return [(fila["method"], fila["route"]) for fila in filas if fila["exposure"] != surface.PUBLIC]


def _url_de_ejemplo(ruta):
    """La ruta del inventario con ids ficticios: el 401 llega antes de resolver el recurso."""
    url = "/" + _PARAMETRO_DE_RUTA.sub(lambda m: _EJEMPLOS_DE_PARAMETRO[m.group("tipo") or "str"], ruta)
    for candidata in (url, url + "/"):  # el inventario guarda las rutas sin la barra final
        try:
            if resolve(candidata).func is not spa_index:  # sin la barra, «schema» cae en el comodín que sirve el SPA
                return candidata
        except Resolver404:
            continue
    raise AssertionError(f"la ruta del inventario no resuelve a ninguna vista de la API: {ruta}")


def _anonimo_rechazado(metodo, ruta):
    url = _url_de_ejemplo(ruta)
    cliente = APIClient()
    if metodo in ("POST", "PUT", "PATCH"):
        respuesta = cliente.generic(metodo, url, data=b"{}", content_type="application/json")
    else:
        respuesta = cliente.generic(metodo, url)
    assert respuesta.status_code == 401, (metodo, url, respuesta.status_code)
    if respuesta["Content-Type"].startswith("application/json"):  # el visor de la documentación contesta en HTML
        assert respuesta.json()["code"] == "UNAUTHENTICATED", respuesta.json()


@pytest.mark.req("RNF-002")
@pytest.mark.req("LS-7")
@pytest.mark.parametrize(
    ("metodo", "ruta"), _rutas_privadas(), ids=[f"{metodo} {ruta}" for metodo, ruta in _rutas_privadas()]
)
def test_una_ruta_privada_del_inventario_responde_401_sin_token(metodo, ruta):
    """El esquema OpenAPI y su visor responden 404 con su bandera apagada (``test_api_docs_closed``); aquí se enciende para
    comprobar que, abiertos, también piden sesión."""
    if ruta in _DOCUMENTACION:
        with override_settings(SIEP_EXPOSE_API_DOCS=True):
            _anonimo_rechazado(metodo, ruta)
    else:
        _anonimo_rechazado(metodo, ruta)


def test_el_inventario_trae_rutas_privadas_de_todas_las_clases():
    """La tabla de arriba no puede quedarse vacía en silencio: hay rutas de rol, de varios métodos y de documentación."""
    privadas = _rutas_privadas()
    assert len(privadas) > 100
    assert {metodo for metodo, _ in privadas} == {"GET", "POST", "PUT", "PATCH", "DELETE"}
    assert _DOCUMENTACION <= {ruta for _, ruta in privadas}


@pytest.mark.req("RNF-002")
def test_control_negativo_si_la_puerta_de_rol_dejara_pasar_al_anonimo_la_ruta_privada_dejaria_de_dar_401(monkeypatch):
    afirmar_que_cae(lambda: _anonimo_rechazado("GET", "api/admin/users"), lambda: _roles_abiertos(monkeypatch))


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  5 · Reenvío de órdenes: el mismo requestId no duplica el efecto  (SIEP-RNF-04)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def ventana_larga(monkeypatch):
    """La ventana de «doble clic» (2 s) se alarga a una hora: las filas no dependen del reloj de la máquina."""
    monkeypatch.setattr(game_service, "DUPLICATE_WINDOW_SECONDS", 3600)
    monkeypatch.setattr(servicio_de_pistas, "DUPLICATE_WINDOW_SECONDS", 3600)


def _opcion_adecuada(intento):
    for opcion in intento["currentNode"]["options"]:
        decision = DecisionOption.objects.get(pk=opcion["id"])
        if decision.response_class == "RECOMMENDED":
            return decision.id
    raise AssertionError("la primera escena del caso sembrado no tiene una opción adecuada")


def _opcion_mala(intento):
    for opcion in intento["currentNode"]["options"]:
        decision = DecisionOption.objects.get(pk=opcion["id"])
        if decision.response_class in ("RISKY", "CONTRAINDICATED"):
            return decision.id
    raise AssertionError("la primera escena del caso sembrado no tiene una opción riesgosa o inadecuada")


def _decidir(mundo, opcion, request_id):
    intento = mundo.intento_a
    return mundo.estudiante_a.cliente().post(
        f"{ORDEN}/{intento['attemptId']}/decisions",
        {"attemptToken": intento["attemptToken"], "decisionOptionId": opcion, "requestId": request_id},
        format="json",
    )


def _eventos_de_la_decision(mundo, opcion):
    return AttemptEvent.objects.filter(attempt_id=mundo.intento_a["attemptId"], decision_option_id=opcion).count()


def _decision_adecuada_con_el_mismo_request_id(mundo):
    opcion, rid = _opcion_adecuada(mundo.intento_a), secrets.token_hex(8)
    primera, segunda = _decidir(mundo, opcion, rid), _decidir(mundo, opcion, rid)
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    assert segunda.data["data"]["attempt"]["currentNode"]["id"] == primera.data["data"]["attempt"]["currentNode"]["id"]
    assert _eventos_de_la_decision(mundo, opcion) == 1


def _decision_mala_con_el_mismo_request_id(mundo):
    """La segunda oportunidad es una sola: reenviar la misma respuesta mala no la gasta ni registra la decisión."""
    opcion, rid = _opcion_mala(mundo.intento_a), secrets.token_hex(8)
    nodo = mundo.intento_a["currentNode"]["id"]
    primera, segunda = _decidir(mundo, opcion, rid), _decidir(mundo, opcion, rid)
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    assert primera.data["data"]["retry"]["allowed"] is True and segunda.data["data"]["retry"]["allowed"] is True
    assert _eventos_de_la_decision(mundo, opcion) == 1
    assert SimulationAttempt.objects.get(pk=mundo.intento_a["attemptId"]).current_node_id == nodo


def _decision_adecuada_con_otro_request_id(mundo):
    opcion = _opcion_adecuada(mundo.intento_a)
    primera, segunda = _decidir(mundo, opcion, secrets.token_hex(8)), _decidir(mundo, opcion, secrets.token_hex(8))
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    assert segunda.data["data"]["attempt"]["currentNode"]["id"] == primera.data["data"]["attempt"]["currentNode"]["id"]
    assert _eventos_de_la_decision(mundo, opcion) == 1


def _request_id_reutilizado_con_otra_opcion(mundo):
    adecuada = _opcion_adecuada(mundo.intento_a)
    otra = next(o["id"] for o in mundo.intento_a["currentNode"]["options"] if o["id"] != adecuada)
    rid = secrets.token_hex(8)
    assert _decidir(mundo, adecuada, rid).status_code == 200
    segunda = _decidir(mundo, otra, rid)
    assert segunda.status_code == 409 and segunda.data["code"] == "REQUEST_ID_REUSED", (segunda.status_code, segunda.data)
    assert _eventos_de_la_decision(mundo, otra) == 0


def _con_pistas(mundo, cuantas=3):
    intento = SimulationAttempt.objects.get(pk=mundo.intento_a["attemptId"])
    escena = SceneMap.objects.get(case_version_id=intento.case_version_id, node_id=intento.current_node_id)
    for numero in range(1, cuantas + 1):
        SceneHint.objects.create(scene_map=escena, hint_order=numero * 10, text=f"Pista {numero}.")


def _pedir_pista(mundo, request_id):
    intento = mundo.intento_a
    return mundo.estudiante_a.cliente().post(
        f"{ORDEN}/{intento['attemptId']}/hints/next",
        {"attemptToken": intento["attemptToken"], "requestId": request_id},
        format="json",
    )


def _pista_con_el_mismo_request_id(mundo):
    _con_pistas(mundo)
    rid = secrets.token_hex(8)
    primera, segunda = _pedir_pista(mundo, rid), _pedir_pista(mundo, rid)
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    assert segunda.data["data"] == primera.data["data"] and len(primera.data["data"]["shown"]) == 1
    assert AttemptHintView.objects.filter(attempt_id=mundo.intento_a["attemptId"]).count() == 1


def _pista_con_otro_request_id_dentro_de_la_ventana(mundo):
    _con_pistas(mundo)
    primera, segunda = _pedir_pista(mundo, secrets.token_hex(8)), _pedir_pista(mundo, secrets.token_hex(8))
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    assert len(segunda.data["data"]["shown"]) == 1
    assert AttemptHintView.objects.filter(attempt_id=mundo.intento_a["attemptId"]).count() == 1


def _bitacora_con_el_mismo_request_id(mundo):
    intento = mundo.intento_a
    antes = AttemptEvent.objects.filter(attempt_id=intento["attemptId"], event_type="REFLECTION_SAVED").count()
    cuerpo = {
        "attemptToken": intento["attemptToken"],
        "nodeId": intento["currentNode"]["id"],
        "text": "Una reflexión nueva",
        "requestId": secrets.token_hex(8),
    }
    cliente = mundo.estudiante_a.cliente()
    primera = cliente.post(f"{ORDEN}/{intento['attemptId']}/reflections", cuerpo, format="json")
    segunda = cliente.post(f"{ORDEN}/{intento['attemptId']}/reflections", cuerpo, format="json")
    assert (primera.status_code, segunda.status_code) == (200, 200), (primera.data, segunda.data)
    despues = AttemptEvent.objects.filter(attempt_id=intento["attemptId"], event_type="REFLECTION_SAVED").count()
    assert despues == antes + 1


def _sin_la_repeticion_de_decisiones(monkeypatch):
    return _parchado(monkeypatch, (game_service, "_find_decision_replay", lambda *args, **kwargs: None))


def _sin_la_idempotencia_de_pistas(monkeypatch):
    return _parchado(
        monkeypatch,
        (servicio_de_pistas, "normalize_request_id", lambda valor: None),
        (servicio_de_pistas, "DUPLICATE_WINDOW_SECONDS", 0),
    )


def _sin_la_ventana_de_pistas(monkeypatch):
    return _parchado(monkeypatch, (servicio_de_pistas, "DUPLICATE_WINDOW_SECONDS", 0))


def _sin_la_idempotencia_de_la_bitacora(monkeypatch):
    return _parchado(monkeypatch, (game_service, "normalize_request_id", lambda valor: None))


#: nombre de la fila → (la fila, qué control apaga lo que la hace cumplirse)
FILAS_DE_REENVIO = {
    "decision-adecuada-con-el-mismo-requestId": (_decision_adecuada_con_el_mismo_request_id, _sin_la_repeticion_de_decisiones),
    "decision-mala-con-el-mismo-requestId-no-gasta-la-segunda-oportunidad": (_decision_mala_con_el_mismo_request_id, _sin_la_repeticion_de_decisiones),
    "decision-adecuada-con-otro-requestId-en-la-ventana": (_decision_adecuada_con_otro_request_id, _sin_la_repeticion_de_decisiones),
    "requestId-reutilizado-con-otra-opcion": (_request_id_reutilizado_con_otra_opcion, _sin_la_repeticion_de_decisiones),
    "pista-con-el-mismo-requestId": (_pista_con_el_mismo_request_id, _sin_la_idempotencia_de_pistas),
    "pista-con-otro-requestId-en-la-ventana": (_pista_con_otro_request_id_dentro_de_la_ventana, _sin_la_ventana_de_pistas),
    "bitacora-con-el-mismo-requestId": (_bitacora_con_el_mismo_request_id, _sin_la_idempotencia_de_la_bitacora),
}


@pytest.mark.req("SIEP-RNF-04")
@pytest.mark.req("LS-7")
@pytest.mark.parametrize("nombre", FILAS_DE_REENVIO)
def test_reenviar_una_orden_no_duplica_su_efecto(ventana_larga, nombre):
    FILAS_DE_REENVIO[nombre][0](Mundo())


@pytest.mark.req("SIEP-RNF-04")
@pytest.mark.parametrize("nombre", FILAS_DE_REENVIO)
def test_control_negativo_sin_la_idempotencia_la_orden_reenviada_duplica_su_efecto(ventana_larga, monkeypatch, nombre):
    fila, apagar = FILAS_DE_REENVIO[nombre]
    afirmar_que_cae(lambda: fila(Mundo()), lambda: apagar(monkeypatch))


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  6 · IP falsa contra el limitador  (SIEP-RNF-02, BLOQUE-L)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Con SIEP_TRUSTED_PROXIES=1 hay un proxy delante: añade a la cola de X-Forwarded-For la dirección que ve. El cliente solo
# controla lo de la izquierda, así que la IP que cuenta es la entrada de la DERECHA. Con 0 saltos la cabecera se ignora.

INSTANTE = 1_800_000_000.0


@pytest.fixture
def limitador(settings, monkeypatch):
    settings.SIEP_THROTTLE_ENABLED = True
    monkeypatch.setattr(limiter, "_now", lambda: INSTANTE)  # ninguna ventana cambia a mitad de una prueba


def _ip_al_azar():
    return str(ipaddress.IPv4Address(secrets.randbits(32)))


def _entrar(email, clave, reenviada=None, remota="10.0.0.1"):
    extra = {"REMOTE_ADDR": remota}
    if reenviada is not None:
        extra["HTTP_X_FORWARDED_FOR"] = reenviada
    return APIClient().post(LOGIN, {"email": email, "password": clave}, format="json", **extra)


def _cuenta_con_clave():
    clave = secrets.token_urlsafe(24)
    cuenta = User.objects.create_user(
        email=f"ip-{secrets.token_hex(5)}@example.com", password=clave, nombre="Ana", apellido="Prueba", role="ESTUDIANTE"
    )
    return cuenta, clave


def _seis_fallos_con_la_cabecera_cambiando(con_proxy):
    """Cinco fallos desde UN mismo cliente que cambia el X-Forwarded-For en cada intento: el sexto, aunque traiga la clave
    buena, es 429. Con ``con_proxy`` hay un proxy delante: su conexión llega desde ``10.0.0.1`` y añade a la cola de la
    cabecera la IP real del cliente (lo único que el cliente no controla). Sin proxy el cliente llega directo (esa es su
    ``REMOTE_ADDR``) y la cabecera es solo lo que él escribe."""
    cuenta, clave = _cuenta_con_clave()
    ip_real = _ip_al_azar()
    remota = "10.0.0.1" if con_proxy else ip_real

    def intento(contrasena):
        falsa = _ip_al_azar()
        return _entrar(cuenta.email, contrasena, f"{falsa}, {ip_real}" if con_proxy else falsa, remota=remota)

    estados = [intento(secrets.token_urlsafe(16)).status_code for _ in range(5)]
    sexto = intento(clave)
    assert estados == [401] * 5, estados
    assert sexto.status_code == 429, (sexto.status_code, sexto.data)
    assert sexto.data["code"] == "THROTTLED"


def _cuatro_inicios_con_la_cabecera_cambiando(monkeypatch):
    monkeypatch.setitem(LIMITS, "login_ip", Limit(3, 600))
    ip_real = _ip_al_azar()
    estados = [
        _entrar(f"nadie-{secrets.token_hex(4)}@example.com", secrets.token_urlsafe(16), f"{_ip_al_azar()}, {ip_real}").status_code
        for _ in range(4)
    ]
    assert estados == [401, 401, 401, 429], estados


def _ip_por_la_izquierda(request):
    """La mala práctica que la fila vigila: creer la PRIMERA entrada de X-Forwarded-For (la que escribe el cliente)."""
    reenviada = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    return reenviada.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.req("DJA-2")
def test_con_un_salto_de_confianza_el_x_forwarded_for_falso_no_evade_el_bloqueo_de_la_cuenta(limitador, settings):
    settings.SIEP_TRUSTED_PROXIES = 1
    _seis_fallos_con_la_cabecera_cambiando(True)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.req("DJA-2")
def test_con_un_salto_de_confianza_el_x_forwarded_for_falso_no_evade_el_limite_por_ip(limitador, settings, monkeypatch):
    settings.SIEP_TRUSTED_PROXIES = 1
    _cuatro_inicios_con_la_cabecera_cambiando(monkeypatch)


@pytest.mark.req("SIEP-RNF-02")
@pytest.mark.req("DJA-2")
def test_sin_saltos_de_confianza_la_cabecera_x_forwarded_for_se_ignora(limitador, settings):
    settings.SIEP_TRUSTED_PROXIES = 0
    _seis_fallos_con_la_cabecera_cambiando(False)


@pytest.mark.req("SIEP-RNF-02")
def test_control_negativo_creer_la_entrada_de_la_izquierda_evade_el_bloqueo_de_la_cuenta(limitador, settings, monkeypatch):
    settings.SIEP_TRUSTED_PROXIES = 1
    afirmar_que_cae(
        lambda: _seis_fallos_con_la_cabecera_cambiando(True),
        lambda: _parchado(monkeypatch, (modulo_ip, "client_ip", _ip_por_la_izquierda)),
    )


@pytest.mark.req("SIEP-RNF-02")
def test_control_negativo_creer_la_entrada_de_la_izquierda_evade_el_limite_por_ip(limitador, settings, monkeypatch):
    settings.SIEP_TRUSTED_PROXIES = 1
    afirmar_que_cae(
        lambda: _cuatro_inicios_con_la_cabecera_cambiando(monkeypatch),
        lambda: _parchado(monkeypatch, (modulo_ip, "client_ip", _ip_por_la_izquierda)),
    )


@pytest.mark.req("SIEP-RNF-02")
def test_control_negativo_confiar_en_un_proxy_que_no_existe_deja_que_la_cabecera_falsa_evada_el_bloqueo(limitador, settings):
    """Con 1 salto declarado y SIN proxy que añada la IP real, la cabecera la escribe el cliente: la fila de «0 saltos»
    deja de cumplirse (es la mala configuración que ``SIEP_TRUSTED_PROXIES`` obliga a declarar bien)."""
    settings.SIEP_TRUSTED_PROXIES = 0
    afirmar_que_cae(
        lambda: _seis_fallos_con_la_cabecera_cambiando(False),
        lambda: override_settings(SIEP_TRUSTED_PROXIES=1),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  7 · Cuerpos hostiles  (RNF-002)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════


def _json_crudo(cliente, ruta, cuerpo, **extra):
    return cliente.generic("POST", ruta, data=cuerpo, content_type="application/json", **extra)


def _cuerpo_de_1_1_mib(mundo):
    cuerpo = json.dumps({"email": "a@example.com", "password": "x" * int(1.1 * MIB)}).encode()
    return _json_crudo(APIClient(), LOGIN, cuerpo)


#: Python 3.13 corta el JSON anidado por un contador (~1000 niveles, RecursionError); el 3.14 corta por la pila de C REAL del hilo.
#: Con los 8 MiB de pila de un contenedor, 100 mil niveles revientan el decodificador, pero con una pila mayor o sin límite (la del
#: runner de GitHub) se leen enteros: la fila se cumple por otro camino (raíz que no es objeto, campo inválido) y el control
#: negativo deja de probar que corta el parser acotado. Por eso los cuerpos anidados viajan en un hilo con una pila FIJA de 4 MiB:
#: ahí 100 mil niveles (200 KB, bajo el tope del cuerpo) revientan el decodificador en cualquier versión y en cualquier equipo.
NIVELES_DE_ANIDADO = 100_000
PILA_DEL_HILO_ANIDADO = 4 * MIB
ARREGLO_ANIDADO = b"[" * NIVELES_DE_ANIDADO + b"]" * NIVELES_DE_ANIDADO
OBJETO_ANIDADO = b'{"a":' * NIVELES_DE_ANIDADO + b"1" + b"}" * NIVELES_DE_ANIDADO


def _en_un_hilo_de_pila_corta(funcion):
    """Corre ``funcion()`` en un hilo con ``PILA_DEL_HILO_ANIDADO`` de pila; devuelve lo que devuelva o relanza lo que lance.

    El hilo usa la MISMA conexión de la base que la prueba (y su transacción), como el hilo del servidor de
    ``LiveServerTestCase``. ``threading.stack_size`` vale para los hilos que arrancan mientras está puesto: se restaura al
    arrancar este.
    """
    conexion = connections[DEFAULT_DB_ALIAS]
    salida = {}

    def correr():
        connections[DEFAULT_DB_ALIAS] = conexion
        try:
            salida["valor"] = funcion()
        except BaseException as error:  # noqa: BLE001  (se relanza en el hilo de la prueba)
            salida["error"] = error

    hilo = threading.Thread(target=correr, name="cuerpo-anidado")
    conexion.inc_thread_sharing()
    try:
        anterior = threading.stack_size(PILA_DEL_HILO_ANIDADO)
        try:
            hilo.start()
        finally:
            threading.stack_size(anterior)
        hilo.join()
    finally:
        conexion.dec_thread_sharing()
    if "error" in salida:
        raise salida["error"]
    return salida["valor"]


def _anidado_en_un_arreglo(mundo):
    return _en_un_hilo_de_pila_corta(lambda: _json_crudo(APIClient(), LOGIN, ARREGLO_ANIDADO))


def _anidado_en_un_objeto(mundo):
    return _en_un_hilo_de_pila_corta(lambda: _json_crudo(APIClient(), LOGIN, OBJETO_ANIDADO))


def _anidado_dentro_de_un_campo(mundo):
    cuerpo = b'{"nombre": ' + ARREGLO_ANIDADO + b"}"
    return _en_un_hilo_de_pila_corta(lambda: _json_crudo(APIClient(), "/api/auth/access-request", cuerpo))


def _anidado_en_una_ruta_con_sesion(mundo):
    cliente = mundo.docente_a.cliente()
    cuerpo = b'{"nombre": ' + ARREGLO_ANIDADO + b"}"
    return _en_un_hilo_de_pila_corta(lambda: _json_crudo(cliente, "/api/grupos", cuerpo))


def _con_content_length(valor):
    def construir(mundo):
        cuerpo = json.dumps({"email": "a@example.com", "password": "x"}).encode()
        return _json_crudo(APIClient(), LOGIN, cuerpo, CONTENT_LENGTH=valor)

    return construir


def _importacion_de_mas_de_3_mib(mundo):
    archivo = SimpleUploadedFile("lista.xlsx", b"x" * (3 * MIB + 10), content_type="application/octet-stream")
    return mundo.docente_a.cliente().post(
        f"/api/grupos/{mundo.grupo_a.id}/estudiantes/import", {"file": archivo}, format="multipart"
    )


def _nombre_de_grupo_de_300_mil(mundo):
    return mundo.docente_a.cliente().post(
        "/api/grupos", {"nombre": "a" * 300_000, "codigo": f"C{secrets.token_hex(4)}"}, format="json"
    )


def _nombre_de_solicitud_de_300_mil(mundo):
    return APIClient().post(
        "/api/auth/access-request",
        {"nombre": "a" * 300_000, "apellido": "Gil", "email": f"x-{secrets.token_hex(4)}@example.com"},
        format="json",
    )


def _correo_de_inicio_de_sesion_de_300_mil(mundo):
    return APIClient().post(LOGIN, {"email": "a" * 300_000 + "@example.com", "password": "x"}, format="json")


TABLA_DE_CUERPOS = [
    pytest.param(_cuerpo_de_1_1_mib, 413, "REQUEST_TOO_LARGE", id="json-de-1,1-MiB"),
    pytest.param(_anidado_en_un_arreglo, 400, None, id="json-anidado-100-mil-niveles-en-un-arreglo"),
    pytest.param(_anidado_en_un_objeto, 400, None, id="json-anidado-100-mil-niveles-en-un-objeto"),
    pytest.param(_anidado_dentro_de_un_campo, 400, None, id="json-anidado-100-mil-niveles-dentro-de-un-campo"),
    pytest.param(_anidado_en_una_ruta_con_sesion, 400, None, id="json-anidado-100-mil-niveles-con-sesion"),
    pytest.param(_con_content_length("-5"), 400, "REQUEST_INVALID_LENGTH", id="content-length-negativo"),
    pytest.param(_con_content_length("abc"), 400, "REQUEST_INVALID_LENGTH", id="content-length-no-numerico"),
    pytest.param(_con_content_length("1e3"), 400, "REQUEST_INVALID_LENGTH", id="content-length-con-exponente"),
    pytest.param(_con_content_length("9" * 20), 400, "REQUEST_INVALID_LENGTH", id="content-length-de-20-cifras"),
    pytest.param(_con_content_length(str(5 * MIB)), 413, "REQUEST_TOO_LARGE", id="content-length-mayor-al-tope-con-cuerpo-corto"),
    pytest.param(_con_content_length("5"), 400, "PARSE_ERROR", id="content-length-menor-que-el-cuerpo"),
    pytest.param(_importacion_de_mas_de_3_mib, 413, "REQUEST_TOO_LARGE", id="multipart-de-mas-de-3-MiB-a-la-importacion"),
    pytest.param(_nombre_de_grupo_de_300_mil, 400, "VALIDATION_ERROR", id="300-mil-caracteres-en-el-nombre-de-un-grupo"),
    pytest.param(_nombre_de_solicitud_de_300_mil, 400, "VALIDATION_ERROR", id="300-mil-caracteres-en-el-nombre-de-una-solicitud"),
    pytest.param(_correo_de_inicio_de_sesion_de_300_mil, 400, "VALIDATION_ERROR", id="300-mil-caracteres-en-el-correo-de-entrar"),
]
FILAS_DE_CUERPO = {parametro.id: parametro.values for parametro in TABLA_DE_CUERPOS}


def _cuerpo_hostil_rechazado(mundo, construir, estado, codigo):
    respuesta = construir(mundo)
    assert respuesta.status_code == estado, (respuesta.status_code, getattr(respuesta, "data", None))
    cuerpo = respuesta.json()
    assert cuerpo["success"] is False
    if codigo is not None:
        assert cuerpo["code"] == codigo, cuerpo
    if codigo == "VALIDATION_ERROR":
        assert cuerpo.get("field"), cuerpo  # el 400 nombra el campo


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize(("construir", "estado", "codigo"), TABLA_DE_CUERPOS)
def test_un_cuerpo_hostil_se_rechaza_con_su_estado_y_sin_500(mundo, construir, estado, codigo):
    _cuerpo_hostil_rechazado(mundo, construir, estado, codigo)


def _sin_el_tope_del_cuerpo():
    cadena = [middleware for middleware in settings.MIDDLEWARE if middleware != "shared.body_limit.BodyLimitMiddleware"]
    return override_settings(MIDDLEWARE=cadena)


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize(
    "nombre",
    ["json-de-1,1-MiB", "content-length-negativo", "multipart-de-mas-de-3-MiB-a-la-importacion"],
)
def test_control_negativo_sin_el_tope_del_cuerpo_la_peticion_hostil_llega_a_la_vista(mundo, nombre):
    construir, estado, codigo = FILAS_DE_CUERPO[nombre]
    afirmar_que_cae(
        lambda: _cuerpo_hostil_rechazado(mundo, construir, estado, codigo),
        _sin_el_tope_del_cuerpo,
    )


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize("cuerpo", [pytest.param(ARREGLO_ANIDADO, id="arreglo"), pytest.param(OBJETO_ANIDADO, id="objeto")])
def test_el_json_anidado_revienta_el_decodificador_en_el_hilo_de_pila_corta(cuerpo):
    """Premisa de las filas anidadas y de su control negativo: en el hilo de ``PILA_DEL_HILO_ANIDADO`` el ``json`` de Python NO
    puede leer el cuerpo. Si esto falla, el decodificador lee 100 mil niveles en esa pila y el parser acotado ya no es lo
    que corta: hay que subir ``NIVELES_DE_ANIDADO`` (sin pasar del tope del cuerpo) o bajar la pila."""
    with pytest.raises(RecursionError):
        _en_un_hilo_de_pila_corta(lambda: json.loads(cuerpo))


@pytest.mark.req("RNF-002")
def test_control_negativo_sin_el_parser_acotado_el_json_anidado_revienta(mundo, monkeypatch):
    """S7-1a · con el ``JSONParser`` de DRF a secas (sin atrapar ``RecursionError``), el JSON anidado deja de ser un 400."""
    from rest_framework.parsers import JSONParser

    from shared import parsers

    construir, estado, codigo = FILAS_DE_CUERPO["json-anidado-100-mil-niveles-en-un-arreglo"]
    afirmar_que_cae(
        lambda: _cuerpo_hostil_rechazado(mundo, construir, estado, codigo),
        lambda: _parchado(monkeypatch, (parsers.ObjectJSONParser, "parse", JSONParser.parse)),
    )


@pytest.mark.req("RNF-002")
def test_control_negativo_sin_la_validacion_del_correo_la_cadena_enorme_llega_a_la_base(mundo, monkeypatch):
    """Los campos de DRF se clonan por sus argumentos en cada serializador, así que el control apaga la ejecución de los
    validadores en la clase del campo (``EmailField``)."""
    construir, estado, codigo = FILAS_DE_CUERPO["300-mil-caracteres-en-el-correo-de-entrar"]
    afirmar_que_cae(
        lambda: _cuerpo_hostil_rechazado(mundo, construir, estado, codigo),
        lambda: _parchado(monkeypatch, (serializers.EmailField, "run_validators", lambda self, valor: None)),
    )


@pytest.mark.req("RNF-002")
def test_control_negativo_sin_los_topes_del_nombre_de_grupo_la_cadena_enorme_revienta_la_base(mundo, monkeypatch):
    """El nombre de un grupo lo frenan DOS capas (el ``max_length`` del campo y la regla de texto visible); sin ninguna, la
    cadena llega a la columna ``varchar(255)`` y la base la rechaza: la fila (400 con el campo) deja de cumplirse."""
    construir, estado, codigo = FILAS_DE_CUERPO["300-mil-caracteres-en-el-nombre-de-un-grupo"]
    afirmar_que_cae(
        lambda: _cuerpo_hostil_rechazado(mundo, construir, estado, codigo),
        lambda: _parchado(
            monkeypatch,
            (serializers.CharField, "run_validators", lambda self, valor: None),
            (serializadores_de_grupos, "texto_visible_problem", lambda valor, largo: None),
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  8 · Inyección en parámetros de búsqueda y de ruta  (LS-13)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CARGAS_DE_INYECCION = {
    "or-1-igual-1": "' OR 1=1 --",
    "drop-table": '"; DROP TABLE users; --',
    "union-select": "' UNION SELECT password FROM users --",
    "comodin-porcentaje": "%",
    "comodin-guion-bajo": "_",
    "unicode-raro": "\u202e\u0130\u00df\U0001f600",
}
_NUL = "\x00"
class _Cualquiera(list):
    """Una lista blanca que lo admite todo: el filtro de ``estado`` apagado."""

    def __contains__(self, elemento):
        return True


def _auditoria_de_base(mundo):
    """Deja al menos una fila en la auditoría y devuelve cuántas hay (el punto de comparación de «más filas de las debidas»)."""
    admin = mundo.admin.cliente()
    admin.get("/api/admin/users")
    total = admin.get("/api/admin/audit").data["data"]["coverage"]["total"]
    assert total >= 1
    return total


Busqueda = namedtuple("Busqueda", "quien metodo plantilla cuerpo afirma con_token")


def _busqueda(quien, metodo, plantilla, afirma, *, cuerpo=None, con_token=False):
    """Una superficie de entrada de texto: ``plantilla`` lleva ``{carga}`` (se escapa para la URL); ``cuerpo`` arma el JSON
    con la carga cruda; ``con_token`` manda el token del intento de A; ``afirma(mundo, respuesta, carga)`` es lo que se
    exige de la respuesta además de «nunca 500»."""
    return Busqueda(quien, metodo, plantilla, cuerpo, afirma, con_token)


def _afirma_cero_filas_en_la_auditoria(mundo, respuesta, carga):
    assert respuesta.status_code == 200, (respuesta.status_code, respuesta.data)
    assert respuesta.data["data"]["coverage"]["total"] == 0


def _afirma_cero_solicitudes(mundo, respuesta, carga):
    assert respuesta.status_code == 200, (respuesta.status_code, respuesta.data)
    assert respuesta.data["data"] == []


def _afirma_400_de_parametro(mundo, respuesta, carga):
    assert respuesta.status_code == 400, (respuesta.status_code, getattr(respuesta, "data", None))
    assert respuesta.data["code"] in ("INVALID_QUERY_PARAM", "VALIDATION_ERROR"), respuesta.data


def _afirma_mis_grupos_intactos(mundo, respuesta, carga):
    assert respuesta.status_code == 200, (respuesta.status_code, respuesta.data)
    assert len(respuesta.data["data"]) == 2  # grupo_a y grupo_invitacion: lo del docente A, ni una fila más


def _afirma_reporte_sin_simulacion(mundo, respuesta, carga):
    assert respuesta.status_code == 200, (respuesta.status_code, respuesta.data)
    assert respuesta.data["data"]["simulacion"] is None


def _afirma_ruta_inexistente_o_invalida(mundo, respuesta, carga):
    assert respuesta.status_code in (400, 404), (respuesta.status_code, getattr(respuesta, "data", None))


def _afirma_caso_guardado_tal_cual(mundo, respuesta, carga):
    """Un título hostil es solo texto: el caso nace con ese título, tal cual (la consulta va parametrizada)."""
    assert respuesta.status_code == 200, (respuesta.status_code, getattr(respuesta, "data", None))
    assert respuesta.data["data"]["title"] == carga.strip()


BUSQUEDAS = {
    "auditoria-action": _busqueda("admin", "GET", "/api/admin/audit?action={carga}", _afirma_cero_filas_en_la_auditoria),
    "auditoria-resourceType": _busqueda("admin", "GET", "/api/admin/audit?resourceType={carga}", _afirma_cero_filas_en_la_auditoria),
    "auditoria-actorId": _busqueda("admin", "GET", "/api/admin/audit?actorId={carga}", _afirma_400_de_parametro),
    "auditoria-from": _busqueda("admin", "GET", "/api/admin/audit?from={carga}", _afirma_400_de_parametro),
    "solicitudes-status": _busqueda("admin", "GET", "/api/admin/access-requests?status={carga}", _afirma_cero_solicitudes),
    "intentos-del-docente-estado": _busqueda("docente_a", "GET", "/api/instructor/attempts?estado={carga}", _afirma_400_de_parametro),
    "intentos-del-docente-grupoId": _busqueda("docente_a", "GET", "/api/instructor/attempts?grupoId={carga}", _afirma_400_de_parametro),
    "grupos-q": _busqueda("docente_a", "GET", "/api/grupos?q={carga}", _afirma_mis_grupos_intactos),
    "reporte-de-grupo-caseVersionId": _busqueda(
        "docente_a", "GET", "/api/reportes/grupo/{{grupo_a}}?caseVersionId={carga}", _afirma_reporte_sin_simulacion
    ),
    "asignaciones-groupId": _busqueda("docente_a", "GET", "/api/assignments?groupId={carga}", _afirma_400_de_parametro),
    "ruta-interactions": _busqueda(
        "estudiante_a", "POST", "/api/simulation/attempts/{{intento_a}}/interactions/{carga}",
        _afirma_ruta_inexistente_o_invalida, con_token=True,
    ),
    "ruta-npcs": _busqueda(
        "estudiante_a", "POST", "/api/simulation/attempts/{{intento_a}}/npcs/{carga}",
        _afirma_ruta_inexistente_o_invalida, con_token=True,
    ),
    # Campos de texto que el servicio lee crudos del cuerpo (sin pasar por un serializador): también son entrada.
    "cuerpo-herramienta-toolCode": _busqueda(
        "estudiante_a", "POST", "/api/simulation/attempts/{{intento_a}}/tools/use",
        _afirma_ruta_inexistente_o_invalida, cuerpo=lambda carga: {"toolCode": carga}, con_token=True,
    ),
    "cuerpo-titulo-del-caso": _busqueda(
        "docente_a", "POST", "/api/authoring/cases", _afirma_caso_guardado_tal_cual,
        cuerpo=lambda carga: {"title": carga, "description": "ok"},
    ),
}
def _parametros_de_inyeccion():
    parametros = []
    for nombre in BUSQUEDAS:
        for etiqueta, carga in CARGAS_DE_INYECCION.items():
            parametros.append(pytest.param(nombre, carga, id=f"{nombre}-{etiqueta}"))
        parametros.append(pytest.param(nombre, _NUL, id=f"{nombre}-nul"))
    return parametros


def _buscar(mundo, nombre, carga):
    busqueda = BUSQUEDAS[nombre]
    cliente = getattr(mundo, busqueda.quien).cliente()
    ruta = busqueda.plantilla.format(carga=quote(carga, safe="")).format(**mundo.ids)
    extra, cuerpo = {}, (busqueda.cuerpo(carga) if busqueda.cuerpo else {})
    if busqueda.con_token:
        token = mundo.token_del_intento("a")
        extra[TOKEN_DEL_INTENTO] = token
        cuerpo = {**cuerpo, "attemptToken": token}
    if busqueda.metodo == "GET":
        return cliente.get(ruta, **extra)
    return cliente.post(ruta, cuerpo, format="json", **extra)


def _fila_de_inyeccion(mundo, nombre, carga):
    """Nunca 500, nunca más filas de las debidas y la tabla ``users`` sigue entera."""
    if nombre.startswith("auditoria-"):
        _auditoria_de_base(mundo)
    if nombre == "solicitudes-status":
        AccessRequest.objects.create(nombre="Ana", apellido="Gil", email=f"sol-{secrets.token_hex(4)}@example.com")
    cuentas = sorted(User.objects.values_list("id", "email"))
    respuesta = _buscar(mundo, nombre, carga)
    assert respuesta.status_code < 500, (nombre, respuesta.status_code, getattr(respuesta, "data", None))
    if carga == _NUL:
        # S7-1a · un NUL no llega a la base: ni la ruta, ni la consulta, ni el cuerpo JSON lo admiten (400 uniforme).
        assert respuesta.status_code == 400, (nombre, respuesta.status_code)
        assert respuesta.json()["code"] == "REQUEST_INVALID_TEXT", respuesta.json()
    else:
        BUSQUEDAS[nombre].afirma(mundo, respuesta, carga)
    assert sorted(User.objects.values_list("id", "email")) == cuentas, "la tabla users cambió"


@pytest.mark.req("LS-13")
@pytest.mark.parametrize(("nombre", "carga"), _parametros_de_inyeccion())
def test_un_parametro_hostil_no_da_500_ni_filas_de_mas(mundo, nombre, carga):
    _fila_de_inyeccion(mundo, nombre, carga)


@pytest.mark.req("LS-13")
@pytest.mark.parametrize("nombre", ["auditoria-action", "solicitudes-status", "ruta-interactions"])
def test_control_negativo_sin_el_middleware_del_nul_la_ruta_o_la_consulta_llegan_a_la_base(mundo, nombre):
    """S7-1a · sin ``NulByteMiddleware`` el NUL de la ruta o la consulta llega a PostgreSQL y la respuesta es un 500."""
    sin_el_middleware = lambda: override_settings(  # noqa: E731
        MIDDLEWARE=[m for m in settings.MIDDLEWARE if m != "shared.text_guard.NulByteMiddleware"]
    )
    afirmar_que_cae(lambda: _fila_de_inyeccion(mundo, nombre, _NUL), sin_el_middleware)


@pytest.mark.req("LS-13")
@pytest.mark.parametrize("nombre", ["cuerpo-herramienta-toolCode", "cuerpo-titulo-del-caso"])
def test_control_negativo_sin_la_revision_del_cuerpo_el_nul_del_json_llega_a_la_base(mundo, monkeypatch, nombre):
    """S7-1a · sin la revisión de NUL del parser (y sin la regla de texto plano en el título) el cuerpo llega a la base."""
    from shared import parsers

    afirmar_que_cae(
        lambda: _fila_de_inyeccion(mundo, nombre, _NUL),
        lambda: _parchado(
            monkeypatch,
            (parsers, "contiene_nul", lambda valor: False),
            (text_rules, "plain_text_problem", lambda *args, **kwargs: None),
        ),
    )


@pytest.mark.req("LS-13")
def test_control_negativo_sin_la_lista_blanca_de_estados_el_valor_hostil_llega_al_filtro(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _fila_de_inyeccion(mundo, "intentos-del-docente-estado", CARGAS_DE_INYECCION["or-1-igual-1"]),
        lambda: _parchado(monkeypatch, (instructor_views, "AttemptStatus", SimpleNamespace(values=_Cualquiera()))),
    )


@pytest.mark.req("LS-13")
def test_control_negativo_si_el_filtro_de_accion_fuera_un_comodin_el_comodin_traeria_filas_de_mas(mundo, monkeypatch):
    todas = lambda accion: list(AuditLog.objects.values_list("action", flat=True).distinct())  # noqa: E731
    afirmar_que_cae(
        lambda: _fila_de_inyeccion(mundo, "auditoria-action", CARGAS_DE_INYECCION["comodin-porcentaje"]),
        lambda: _parchado(monkeypatch, (audit_service, "matching_actions", todas)),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  9 · XSS almacenado  (LS-15)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Qué regla aplica a cada campo: la API RECHAZA con 400 (``VALIDATION_ERROR`` con su ``field``) el nombre y apellido de una
# cuenta, el nombre de un grupo, el nombre de un personaje y el texto de un caso (contexto, objetivos, descripción y
# título del caso (S7-1a: antes se aceptaba al crear y solo la compuerta de publicación lo bloqueaba).

CARGAS_XSS = {
    "script": "<script>alert(1)</script>",
    "img-onerror": "<img src=x onerror=alert(1)>",
    "javascript": "javascript:alert(1)",
}


def _caso_borrador(mundo):
    respuesta = mundo.docente_a.cliente().post(
        "/api/authoring/cases", {"title": f"Caso de abuso {secrets.token_hex(3)}", "description": "ok"}, format="json"
    )
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]["caseVersionId"], respuesta.data["data"]["revision"]


def _cuenta_con_nombre(mundo, carga):
    return mundo.admin.cliente().post(
        "/api/admin/users",
        {"email": f"xss-{secrets.token_hex(4)}@example.com", "password": secrets.token_urlsafe(16), "nombre": carga, "apellido": "Gil", "role": "ESTUDIANTE"},
        format="json",
    )


def _cuenta_con_apellido(mundo, carga):
    return mundo.admin.cliente().post(
        "/api/admin/users",
        {"email": f"xss-{secrets.token_hex(4)}@example.com", "password": secrets.token_urlsafe(16), "nombre": "Ana", "apellido": carga, "role": "ESTUDIANTE"},
        format="json",
    )


def _cuenta_editada_con_nombre(mundo, carga):
    cuenta = mundo.estudiante_b.cuenta
    return mundo.admin.cliente().put(
        f"/api/admin/users/{cuenta.id}",
        {"email": cuenta.email, "nombre": carga, "apellido": "Gil", "role": "ESTUDIANTE", "activo": True},
        format="json",
    )


def _solicitud_con_nombre(mundo, carga):
    return APIClient().post(
        "/api/auth/access-request",
        {"nombre": carga, "apellido": "Gil", "email": f"sol-{secrets.token_hex(4)}@example.com"},
        format="json",
    )


def _solicitud_con_apellido(mundo, carga):
    return APIClient().post(
        "/api/auth/access-request",
        {"nombre": "Ana", "apellido": carga, "email": f"sol-{secrets.token_hex(4)}@example.com"},
        format="json",
    )


def _grupo_con_nombre(mundo, carga):
    return mundo.docente_a.cliente().post("/api/grupos", {"nombre": carga, "codigo": f"X{secrets.token_hex(4)}"}, format="json")


def _grupo_renombrado(mundo, carga):
    return mundo.docente_a.cliente().put(f"/api/grupos/{mundo.grupo_a.id}", {"nombre": carga}, format="json")


def _personaje_con_nombre(mundo, carga):
    caso, revision = _caso_borrador(mundo)
    return mundo.docente_a.cliente().post(
        f"/api/authoring/cases/{caso}/characters",
        {"characterKey": f"k{secrets.token_hex(3)}", "displayName": carga, "revision": revision},
        format="json",
    )


def _caso_con_descripcion(mundo, carga):
    return mundo.docente_a.cliente().post(
        "/api/authoring/cases", {"title": f"Caso {secrets.token_hex(3)}", "description": carga}, format="json"
    )


def _caso_con_titulo(mundo, carga):
    return mundo.docente_a.cliente().post("/api/authoring/cases", {"title": carga, "description": "ok"}, format="json")


def _caso_con_contexto(mundo, carga):
    caso, revision = _caso_borrador(mundo)
    return mundo.docente_a.cliente().put(f"/api/authoring/cases/{caso}/brief", {"context": carga, "revision": revision}, format="json")


def _caso_con_objetivo(mundo, carga):
    caso, revision = _caso_borrador(mundo)
    return mundo.docente_a.cliente().put(
        f"/api/authoring/cases/{caso}/brief", {"learningObjectives": [carga], "revision": revision}, format="json"
    )


def _caso_con_pista(mundo, carga):
    caso, revision = _caso_borrador(mundo)
    docente = mundo.docente_a.cliente()
    mapa = docente.get(f"/api/authoring/cases/{caso}/editor").data["data"]["maps"][0]["id"]
    return docente.post(f"/api/authoring/cases/{caso}/maps/{mapa}/hints", {"text": carga, "hintOrder": 1}, format="json")


CAMPOS_CON_XSS = {
    "nombre-de-cuenta-al-crearla": _cuenta_con_nombre,
    "apellido-de-cuenta-al-crearla": _cuenta_con_apellido,
    "nombre-de-cuenta-al-editarla": _cuenta_editada_con_nombre,
    "nombre-de-solicitud-de-acceso": _solicitud_con_nombre,
    "apellido-de-solicitud-de-acceso": _solicitud_con_apellido,
    "nombre-de-grupo-al-crearlo": _grupo_con_nombre,
    "nombre-de-grupo-al-renombrarlo": _grupo_renombrado,
    "nombre-de-personaje": _personaje_con_nombre,
    "titulo-del-caso-al-crearlo": _caso_con_titulo,
    "descripcion-del-caso-al-crearlo": _caso_con_descripcion,
    "contexto-del-caso": _caso_con_contexto,
    "objetivo-del-caso": _caso_con_objetivo,
    "pista-del-caso": _caso_con_pista,
}


def _nadie_lo_ve(mundo, carga):
    """El marcado no sale tal cual en ningún listado de otra persona (ADMIN, estudiante) ni en el editor del caso."""
    admin, estudiante = mundo.admin.cliente(), mundo.estudiante_a.cliente()
    listados = [
        admin.get("/api/admin/users"),
        admin.get("/api/admin/access-requests"),
        admin.get("/api/grupos"),
        admin.get("/api/authoring/cases"),
        estudiante.get("/api/me/invitations"),
        estudiante.get("/api/simulation/cases"),
    ]
    for listado in listados:
        assert listado.status_code == 200, listado.data
        assert carga not in listado.content.decode("utf-8"), "el marcado salió tal cual en un listado"


def _fila_de_xss(mundo, campo, carga):
    respuesta = CAMPOS_CON_XSS[campo](mundo, carga)
    assert respuesta.status_code == 400, (campo, respuesta.status_code, getattr(respuesta, "data", None))
    assert respuesta.data["code"] == "VALIDATION_ERROR", respuesta.data
    assert respuesta.data.get("field"), respuesta.data
    _nadie_lo_ve(mundo, carga)


@pytest.mark.req("LS-15")
@pytest.mark.parametrize(
    ("campo", "carga"),
    [pytest.param(campo, carga, id=f"{campo}-{etiqueta}") for campo in CAMPOS_CON_XSS for etiqueta, carga in CARGAS_XSS.items()],
)
def test_el_marcado_se_rechaza_al_guardarlo_y_no_sale_en_ningun_listado(mundo, campo, carga):
    _fila_de_xss(mundo, campo, carga)


def _sin_la_regla_de_texto(monkeypatch, campo):
    nada = lambda *args, **kwargs: None  # noqa: E731
    if campo.startswith(("nombre-de-cuenta", "apellido-de-cuenta", "nombre-de-solicitud", "apellido-de-solicitud")):
        return _parchado(monkeypatch, (serializadores_de_cuentas, "person_text_problem", nada))
    if campo.startswith("nombre-de-grupo"):
        return _parchado(monkeypatch, (serializadores_de_grupos, "texto_visible_problem", nada))
    return _parchado(monkeypatch, (text_rules, "plain_text_problem", nada))


@pytest.mark.req("LS-15")
@pytest.mark.parametrize(
    "campo",
    [
        "nombre-de-cuenta-al-crearla",
        "apellido-de-solicitud-de-acceso",
        "nombre-de-grupo-al-crearlo",
        "nombre-de-personaje",
        "titulo-del-caso-al-crearlo",
        "contexto-del-caso",
    ],
)
def test_control_negativo_sin_la_regla_de_texto_plano_el_marcado_se_guarda(mundo, monkeypatch, campo):
    afirmar_que_cae(
        lambda: _fila_de_xss(mundo, campo, CARGAS_XSS["script"]),
        lambda: _sin_la_regla_de_texto(monkeypatch, campo),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  10 · Salida sin campos prohibidos  (LS-17, LS-3, SIEP-RNF-05)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

#: Los nombres de campo que ninguna respuesta de la API puede traer (sin guiones bajos ni mayúsculas: ``password_hash`` y
#: ``passwordHash`` son el mismo). ``mustChangePassword`` NO está aquí: es otro campo.
CLAVES_PROHIBIDAS = {"password", "passwordhash", "encryptedtext", "attempttokenhash", "sessionepoch"}

RUTAS_DE_SALIDA = {
    "estudiante_a": [
        "/api/auth/me",
        "/api/simulation/attempts/{intento_a}",
        "/api/simulation/attempts/{intento_a}/world",
        "/api/simulation/attempts/{intento_a}/hints",
        "/api/simulation/attempts/{intento_a}/progress-map",
        "/api/simulation/attempts/{intento_a}/student-report",
        "/api/simulation/attempts/history",
        "/api/simulation/cases",
        "/api/simulation/catalog",
        "/api/simulation/cases/{version}/consent",
        "/api/simulation/cases/{version}/brief",
        "/api/me/invitations",
        "/api/health",
    ],
    "docente_a": [
        "/api/auth/me",
        "/api/grupos",
        "/api/grupos/{grupo_a}/estudiantes",
        "/api/reportes/dashboard",
        "/api/reportes/grupo/{grupo_a}?caseVersionId={version}",
        "/api/reportes/grupo/{grupo_a}/export?caseVersionId={version}",
        "/api/reportes/estudiante/{estudiante_a}",
        "/api/instructor/attempts",
        "/api/instructor/attempts/recent",
        "/api/instructor/attempts/{intento_a}/trace",
        "/api/rubrics/",
        "/api/competencies",
        "/api/assignments",
        "/api/authoring/cases",
    ],
    "admin": [
        "/api/auth/me",
        "/api/admin/users",
        "/api/admin/audit",
        "/api/admin/access-requests",
        "/api/authoring/cases",
        "/api/rubrics/",
        "/api/competencies",
        "/api/grupos",
        "/api/instructor/attempts",
        "/api/instructor/attempts/{intento_a}/trace",
        "/api/reportes/dashboard",
    ],
    "anonimo": ["/api/auth/google/config", "/api/health"],
}
TABLA_DE_SALIDA = [
    pytest.param(quien, ruta, id=f"{quien}:{ruta}") for quien, rutas in RUTAS_DE_SALIDA.items() for ruta in rutas
]


def _claves(valor):
    """Todas las claves de todos los objetos de un JSON, a cualquier profundidad."""
    if isinstance(valor, dict):
        for clave, contenido in valor.items():
            yield str(clave)
            yield from _claves(contenido)
    elif isinstance(valor, list):
        for elemento in valor:
            yield from _claves(elemento)


def _cadenas_prohibidas(mundo):
    """Valores que ninguna respuesta puede traer: cadenas de conexión, llaves del servidor y lo guardado cifrado o hasheado."""
    base = settings.DATABASES["default"]
    candidatas = [
        "postgres://",
        "postgresql://",
        "DATABASE_URL",
        settings.SECRET_KEY,
        settings.SIMPLE_JWT["SIGNING_KEY"],
        settings.REFLECTION_ENCRYPTION_KEY,
        base.get("PASSWORD") or "",
        User.objects.get(pk=mundo.admin.id).password,  # el hash bcrypt de una contraseña real
        *ReflectionJournal.objects.values_list("encrypted_text", flat=True),
        *SimulationAttempt.objects.values_list("attempt_token_hash", flat=True),
    ]
    return [cadena for cadena in candidatas if isinstance(cadena, str) and len(cadena) >= 8]


def _afirmar_sin_prohibidos(respuesta, prohibidas):
    texto = respuesta.content.decode("utf-8", "replace")
    try:
        cuerpo = json.loads(texto)
    except ValueError:  # un CSV
        cuerpo = None
    for clave in _claves(cuerpo):
        normalizada = clave.replace("_", "").replace("-", "").lower()
        assert normalizada not in CLAVES_PROHIBIDAS, f"la respuesta trae el campo prohibido {clave!r}"
    for cadena in prohibidas:
        assert cadena not in texto, "la respuesta trae una cadena que no puede salir del servidor"


def _fila_de_salida(mundo, quien, ruta):
    cliente = APIClient() if quien == "anonimo" else mundo.admin.cliente() if quien == "admin" else getattr(mundo, quien).cliente()
    extra = {TOKEN_DEL_INTENTO: mundo.token_del_intento("a")} if "/attempts/" in ruta and quien == "estudiante_a" else {}
    respuesta = cliente.get(ruta.format(**mundo.ids), **extra)
    assert respuesta.status_code == 200, (quien, ruta, respuesta.status_code, getattr(respuesta, "data", None))
    _afirmar_sin_prohibidos(respuesta, _cadenas_prohibidas(mundo))


@pytest.mark.req("LS-17")
@pytest.mark.req("LS-3")
@pytest.mark.parametrize(("quien", "ruta"), TABLA_DE_SALIDA)
def test_ninguna_respuesta_trae_campos_prohibidos_ni_cadenas_de_conexion(mundo, quien, ruta):
    _fila_de_salida(mundo, quien, ruta)


def _con_un_campo_prohibido(monkeypatch):
    campos = [*serializadores_de_cuentas.UserSummarySerializer.Meta.fields, "password"]
    return _parchado(monkeypatch, (serializadores_de_cuentas.UserSummarySerializer.Meta, "fields", campos))


@pytest.mark.req("LS-17")
def test_control_negativo_si_el_serializador_agregara_password_la_salida_dejaria_de_estar_limpia(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _fila_de_salida(mundo, "estudiante_a", "/api/auth/me"),
        lambda: _con_un_campo_prohibido(monkeypatch),
    )


@pytest.mark.req("LS-3")
def test_control_negativo_si_una_respuesta_llevara_una_cadena_de_conexion_la_fila_caeria(mundo):
    afirmar_que_cae(
        lambda: _fila_de_salida(mundo, "anonimo", "/api/auth/google/config"),
        lambda: override_settings(GOOGLE_OAUTH_CLIENT_ID="postgres://usuario@servidor/base"),
    )


# ── Anonimización de las vistas del docente (SIEP-RNF-05): alias, nunca el nombre ni el correo ──────────────────

RUTAS_CON_ALIAS = ["/api/instructor/attempts", "/api/instructor/attempts/recent", "/api/instructor/attempts/{intento_a}/trace"]


def _el_docente_ve_un_alias(mundo, ruta):
    respuesta = mundo.docente_a.cliente().get(ruta.format(**mundo.ids))
    assert respuesta.status_code == 200, (ruta, respuesta.status_code, respuesta.data)
    contenido = respuesta.content.decode("utf-8")
    assert "Estudiante-" in contenido
    for dato in (mundo.estudiante_a.email, mundo.estudiante_a.cuenta.nombre, mundo.estudiante_a.cuenta.apellido):
        assert dato not in contenido, f"{ruta}: la vista del docente trae un dato que identifica al estudiante"


@pytest.mark.req("SIEP-RNF-05")
@pytest.mark.parametrize("ruta", RUTAS_CON_ALIAS)
def test_las_vistas_de_revision_del_docente_muestran_un_alias_y_no_la_identidad(mundo, ruta):
    _el_docente_ve_un_alias(mundo, ruta)


@pytest.mark.req("SIEP-RNF-05")
def test_control_negativo_si_el_alias_fuera_el_nombre_la_vista_del_docente_identificaria_al_estudiante(mundo, monkeypatch):
    from shared.identity import IdentityPresenter

    nombres = {persona.id: persona.cuenta for persona in (mundo.estudiante_a, mundo.estudiante_b)}
    afirmar_que_cae(
        lambda: _el_docente_ve_un_alias(mundo, "/api/instructor/attempts"),
        lambda: _parchado(
            monkeypatch,
            (IdentityPresenter, "alias_for", staticmethod(lambda student_id, viewer=None: f"Estudiante-{nombres[student_id].email}")),
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  11 · Importación hostil: 400 estructurado, nunca 500  (RNF-002, BLOQUE-L)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Cubierto por ``apps/simulation/tests/test_import_hostile.py`` (el DSL) y ``apps/grupos/tests/test_import_hardening.py``
# (el .xlsx): aquí las filas más graves, con el estado y el código estable, y su control negativo.

_HOJA_CON_ENTIDAD = (
    '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]>'
    f'<worksheet xmlns="{ESPACIO_DE_HOJA}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol;</t></is></c></row>'
    "</sheetData></worksheet>"
)
_HOJA_BILLION_LAUGHS = (
    '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">'
    '<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">]>'
    f'<worksheet xmlns="{ESPACIO_DE_HOJA}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&d;</t></is></c></row>'
    "</sheetData></worksheet>"
)
_HOJA_CON_ENTIDAD_EXTERNA = (
    '<?xml version="1.0"?><!DOCTYPE xxe [<!ENTITY externa SYSTEM "file:///no-existe/entidad-externa">]>'
    f'<worksheet xmlns="{ESPACIO_DE_HOJA}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&externa;</t></is></c></row>'
    "</sheetData></worksheet>"
)


def _xlsx_hostil(hoja):
    def subir(mundo):
        cuentas = User.objects.count()
        respuesta = mundo.docente_a.cliente().post(
            f"/api/grupos/{mundo.grupo_a.id}/estudiantes/import/", {"file": _workbook(hoja)}, format="multipart"
        )
        assert User.objects.count() == cuentas, "una importación hostil creó cuentas"
        return respuesta

    return subir


def _dsl_con_niveles(niveles):
    return lambda mundo: mundo.admin.cliente().generic(
        "POST", "/api/authoring/cases/import", data=b"[" * niveles + b"]" * niveles, content_type="application/json"
    )


def _dsl_con_100_mil_corchetes(mundo):
    return mundo.admin.cliente().generic(
        "POST", "/api/authoring/cases/import", data=b"[" * 100_000, content_type="application/json"
    )


def _dsl_con_201_escenas(mundo):
    _, _, documento = next(s for s in dsl_support.scenarios() if s[1] == "valido")

    documento = copy.deepcopy(documento)
    documento.pop("ejecucion", None)
    documento["caso"]["id"] = f"HOSTIL-{secrets.token_hex(3).upper()}"
    plantilla = documento["escenas"][-1]
    documento["escenas"] = [{**plantilla, "id": f"E{n:03d}", "orden": n} for n in range(1, 202)]
    documento["caso"]["escenaInicial"] = "E001"
    cuerpo = json.dumps(documento, ensure_ascii=False).encode("utf-8")
    return mundo.admin.cliente().generic("POST", "/api/authoring/cases/import", data=cuerpo, content_type="application/json")


TABLA_DE_IMPORTACION = [
    pytest.param(_xlsx_hostil(_HOJA_CON_ENTIDAD), 400, "IMPORT_INVALID", None, id="xlsx-con-dtd-y-entidad"),
    pytest.param(_xlsx_hostil(_HOJA_BILLION_LAUGHS), 400, "IMPORT_INVALID", None, id="xlsx-billion-laughs"),
    pytest.param(_xlsx_hostil(_HOJA_CON_ENTIDAD_EXTERNA), 400, "IMPORT_INVALID", None, id="xlsx-con-entidad-externa"),
    pytest.param(_dsl_con_niveles(21), 400, "DSL_INVALID", "DSL.LIMIT_EXCEEDED", id="dsl-anidado-a-21-niveles"),
    pytest.param(_dsl_con_100_mil_corchetes, 400, "DSL_INVALID", "DSL.LIMIT_EXCEEDED", id="dsl-con-100-mil-corchetes-abiertos"),
    pytest.param(_dsl_con_201_escenas, 400, "DSL_INVALID", "DSL.LIMIT_EXCEEDED", id="dsl-ancho-con-201-escenas"),
]
FILAS_DE_IMPORTACION = {parametro.id: parametro.values for parametro in TABLA_DE_IMPORTACION}


def _importacion_rechazada(mundo, subir, estado, codigo, hallazgo):
    respuesta = subir(mundo)
    assert respuesta.status_code == estado, (respuesta.status_code, getattr(respuesta, "data", None))
    assert respuesta.data["code"] == codigo, respuesta.data
    if hallazgo is not None:
        assert hallazgo in {issue["code"] for issue in respuesta.data["issues"]}, respuesta.data["issues"]


@pytest.mark.req("RNF-002")
@pytest.mark.req("LS-13")
@pytest.mark.parametrize(("subir", "estado", "codigo", "hallazgo"), TABLA_DE_IMPORTACION)
def test_una_importacion_hostil_se_rechaza_con_un_400_estructurado_y_sin_500(mundo, subir, estado, codigo, hallazgo):
    _importacion_rechazada(mundo, subir, estado, codigo, hallazgo)


@pytest.mark.req("RNF-002")
def test_control_negativo_sin_las_defensas_del_xlsx_la_entidad_se_expande(mundo, monkeypatch):
    """Dos capas rechazan el DOCTYPE (``_read_xml`` y defusedxml): apagadas las dos, la entidad se expande y la fila ya no
    recibe el ``IMPORT_INVALID`` de siempre."""

    afirmar_que_cae(
        lambda: _importacion_rechazada(mundo, *FILAS_DE_IMPORTACION["xlsx-con-dtd-y-entidad"]),
        lambda: _parchado(
            monkeypatch,
            (servicios_de_grupos, "_read_xml", lambda zf, nombre: zf.read(nombre)),
            (servicios_de_grupos, "SafeET", ElementTreeEstandar),
        ),
    )


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize("nombre", ["dsl-anidado-a-21-niveles", "dsl-con-100-mil-corchetes-abiertos"])
def test_control_negativo_sin_el_tope_de_profundidad_el_dsl_profundo_ya_no_da_el_400_de_limite(mundo, monkeypatch, nombre):
    afirmar_que_cae(
        lambda: _importacion_rechazada(mundo, *FILAS_DE_IMPORTACION[nombre]),
        lambda: _parchado(monkeypatch, (lectura_dsl, "MAX_DEPTH", 10**9)),
    )


@pytest.mark.req("RNF-002")
def test_control_negativo_sin_el_tope_de_escenas_el_dsl_ancho_ya_no_da_el_400_de_limite(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _importacion_rechazada(mundo, *FILAS_DE_IMPORTACION["dsl-ancho-con-201-escenas"]),
        lambda: _parchado(monkeypatch, (limites_dsl, "MAX_SCENES", 10**9)),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  12 · CORS: una consulta previa desde un origen ajeno no recibe Access-Control-Allow-Origin  (RNF-002)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ORIGEN_AJENO = "https://ajeno.example"
ORIGEN_PERMITIDO = "https://permitido.example"
RUTAS_DE_CORS = ["/api/auth/login", "/api/grupos", "/api/admin/users"]


def _consulta_previa(ruta, origen):
    return APIClient().options(
        ruta, HTTP_ORIGIN=origen, HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST", HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization"
    )


def _origen_ajeno_sin_permiso(ruta):
    respuesta = _consulta_previa(ruta, ORIGEN_AJENO)
    assert "Access-Control-Allow-Origin" not in respuesta.headers, dict(respuesta.headers)
    assert "Access-Control-Allow-Credentials" not in respuesta.headers, dict(respuesta.headers)
    # Una petición normal (no previa) desde el origen ajeno tampoco recibe el permiso.
    normal = APIClient().get("/api/health", HTTP_ORIGIN=ORIGEN_AJENO)
    assert "Access-Control-Allow-Origin" not in normal.headers, dict(normal.headers)


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize("ruta", RUTAS_DE_CORS)
def test_una_consulta_previa_desde_un_origen_ajeno_no_recibe_el_permiso(ruta):
    _origen_ajeno_sin_permiso(ruta)


@pytest.mark.req("RNF-002")
@pytest.mark.parametrize("ruta", RUTAS_DE_CORS)
def test_con_el_origen_permitido_de_los_ajustes_la_consulta_previa_si_lo_recibe(ruta):
    with override_settings(CORS_ALLOWED_ORIGINS=[ORIGEN_PERMITIDO]):
        permitido = _consulta_previa(ruta, ORIGEN_PERMITIDO)
        ajeno = _consulta_previa(ruta, ORIGEN_AJENO)

    assert permitido.headers.get("Access-Control-Allow-Origin") == ORIGEN_PERMITIDO, dict(permitido.headers)
    assert "authorization" in permitido.headers.get("Access-Control-Allow-Headers", "").lower()
    assert "Access-Control-Allow-Origin" not in ajeno.headers, dict(ajeno.headers)  # el permiso es solo del origen listado


@pytest.mark.req("RNF-002")
def test_control_negativo_con_todos_los_origenes_permitidos_el_origen_ajeno_recibe_el_permiso():
    afirmar_que_cae(
        lambda: _origen_ajeno_sin_permiso("/api/auth/login"),
        lambda: override_settings(CORS_ALLOW_ALL_ORIGINS=True),
    )


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  13 · Defectos que el plan vigila: D-6, D-8, D-12 y D-17
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════


def _el_unico_admin_no_se_desactiva_ni_pierde_el_rol(mundo):
    """D-6: con un solo ADMIN activo, ni desactivarse ni quitarse el rol (el sistema no puede quedarse sin ADMIN)."""
    User.objects.filter(role="ADMIN").exclude(pk=mundo.admin.id).update(activo=False)
    admin = mundo.admin.cliente()
    desactivar = admin.patch(f"/api/admin/users/{mundo.admin.id}/status", {"activo": False}, format="json")
    assert desactivar.status_code == 400 and desactivar.data["code"] == "LAST_ADMIN", (desactivar.status_code, desactivar.data)
    bajar = admin.put(
        f"/api/admin/users/{mundo.admin.id}",
        {"email": mundo.admin.email, "nombre": "Ana", "apellido": "Gil", "role": "PROFESOR", "activo": True},
        format="json",
    )
    assert bajar.status_code == 400 and bajar.data["code"] == "LAST_ADMIN", (bajar.status_code, bajar.data)
    cuenta = User.objects.get(pk=mundo.admin.id)
    assert (cuenta.role, cuenta.activo) == ("ADMIN", True)


@pytest.mark.req("D-6")
def test_el_ultimo_admin_no_puede_desactivarse_ni_quitarse_el_rol(mundo):
    _el_unico_admin_no_se_desactiva_ni_pierde_el_rol(mundo)


@pytest.mark.req("D-6")
def test_control_negativo_sin_la_guarda_del_ultimo_admin_el_sistema_se_queda_sin_admin(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _el_unico_admin_no_se_desactiva_ni_pierde_el_rol(mundo),
        lambda: _parchado(monkeypatch, (account_service, "ensure_not_last_admin", lambda *args, **kwargs: None)),
    )


def _el_csv_neutraliza_las_formulas(mundo):
    """D-8: el nombre de un estudiante que empieza como fórmula sale en el CSV como texto (con un apóstrofo delante)."""
    peligroso = "=cmd|' /C calc'!A0"
    User.objects.filter(pk=mundo.estudiante_a.id).update(nombre=peligroso)
    respuesta = mundo.docente_a.cliente().get(f"/api/reportes/grupo/{mundo.grupo_a.id}/export?caseVersionId={mundo.version.id}")
    assert respuesta.status_code == 200, respuesta.status_code
    filas = [fila for fila in csv.reader(io.StringIO(respuesta.content.decode("utf-8"))) if fila]
    propia = [fila for fila in filas if "cmd|" in fila[0]]
    assert propia, filas
    for fila in filas:
        for celda in (fila[0], fila[-1]):  # las columnas de texto: estudiante y estado
            assert not celda.startswith(("=", "+", "-", "@")), f"el CSV deja pasar una fórmula: {celda!r}"
    assert propia[0][0].startswith("'=")


@pytest.mark.req("D-8")
def test_el_csv_del_grupo_no_deja_pasar_formulas(mundo):
    _el_csv_neutraliza_las_formulas(mundo)


@pytest.mark.req("D-8")
def test_control_negativo_sin_neutralizar_las_celdas_el_csv_deja_pasar_la_formula(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _el_csv_neutraliza_las_formulas(mundo),
        lambda: _parchado(monkeypatch, (servicios_de_reportes, "csv_cell", lambda valor: "" if valor is None else str(valor))),
    )


def _el_editor_no_acepta_referencias_de_otro_caso(mundo):
    """D-12: una referencia del editor a un nodo o decisión de OTRA versión se rechaza (400) y la otra versión no cambia."""
    caso, revision = _caso_borrador(mundo)
    docente = mundo.docente_a.cliente()
    ajeno = CaseVersion.objects.get(pk=mundo.version.id)
    nodo = ajeno.nodes.first()
    decision = DecisionOption.objects.filter(case_version_id=ajeno.id).first()
    titulo = nodo.title
    cambio = docente.put(
        f"/api/authoring/cases/{caso}/nodes/{nodo.id}",
        {"title": "Tomado", "narrative": "x", "decisionPrompt": "x", "revision": revision},
        format="json",
    )
    assert cambio.status_code == 400 and cambio.data["code"] == "VALIDATION_ERROR", (cambio.status_code, cambio.data)
    borrado = docente.delete(f"/api/authoring/cases/{caso}/decisions/{decision.id}?revision={revision}")
    assert borrado.status_code == 400 and borrado.data["code"] == "VALIDATION_ERROR", (borrado.status_code, borrado.data)
    nodo.refresh_from_db()
    assert nodo.title == titulo
    assert DecisionOption.objects.filter(pk=decision.id).exists()


@pytest.mark.req("D-12")
def test_el_editor_no_acepta_referencias_a_nodos_o_decisiones_de_otro_caso(mundo):
    _el_editor_no_acepta_referencias_de_otro_caso(mundo)


@pytest.mark.req("D-12")
def test_control_negativo_sin_la_guarda_de_version_el_editor_toca_el_nodo_de_otro_caso(mundo, monkeypatch):
    def sin_version(modelo, pk, case_version_id, **resto):
        return modelo.objects.get(pk=pk)

    afirmar_que_cae(
        lambda: _el_editor_no_acepta_referencias_de_otro_caso(mundo),
        lambda: _parchado(monkeypatch, (servicio_del_grafo, "in_version", sin_version)),
    )


def _rubrica(nombre):
    return {
        "name": f"{nombre} {secrets.token_hex(3)}", "description": "d", "version": "1.0", "active": False,
        "criteria": [{"title": "Uno", "weight": 50}, {"title": "Dos", "weight": 50}],
    }


def _la_rubrica_ajena_no_se_edita(mundo):
    """D-17: un docente no edita la rúbrica global (la crea un ADMIN: se duplica) ni la de otro docente."""
    global_ = mundo.admin.cliente().post("/api/rubrics/", _rubrica("Global"), format="json")
    assert global_.status_code == 201, global_.data
    de_a = mundo.docente_a.cliente().post("/api/rubrics/", _rubrica("De A"), format="json")
    assert de_a.status_code == 201, de_a.data
    docente_b = mundo.docente_b.cliente()
    # La global la ve el docente, pero es de solo lectura.
    editar_global = docente_b.put(f"/api/rubrics/{global_.data['data']['id']}", _rubrica("Tomada"), format="json")
    assert editar_global.status_code == 403 and editar_global.data["code"] == "RUBRIC_READ_ONLY", (
        editar_global.status_code, editar_global.data,
    )
    # La de A ni se le muestra ni la toca.
    identificador = de_a.data["data"]["id"]
    for metodo, ruta, cuerpo in (
        ("put", f"/api/rubrics/{identificador}", _rubrica("Tomada")),
        ("post", f"/api/rubrics/{identificador}/activate", {}),
        ("post", f"/api/rubrics/{identificador}/deactivate", {}),
    ):
        respuesta = getattr(docente_b, metodo)(ruta, cuerpo, format="json")
        assert respuesta.status_code in (403, 404), (metodo, ruta, respuesta.status_code, respuesta.data)
    assert mundo.docente_a.cliente().get(f"/api/rubrics/{identificador}").data["data"]["name"] == de_a.data["data"]["name"]


@pytest.mark.req("D-17")
def test_un_docente_no_edita_la_rubrica_global_ni_la_de_otro(mundo):
    _la_rubrica_ajena_no_se_edita(mundo)


@pytest.mark.req("D-17")
def test_control_negativo_sin_la_guarda_de_dueno_de_rubricas_el_docente_edita_la_global(mundo, monkeypatch):
    afirmar_que_cae(
        lambda: _la_rubrica_ajena_no_se_edita(mundo),
        lambda: _politica_abierta(monkeypatch, ("rubric", "edit")),
    )
