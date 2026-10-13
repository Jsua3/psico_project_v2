"""T15.1 — Asistente de IA (RF-027): apagado por defecto y con el sobre habitual.

El asistente enviaría la pregunta y el contexto del caso a un proveedor externo
(privacidad, Ley 1581/2012), así que la bandera ``AI_ASSISTANT_ENABLED`` nace
apagada. Con la bandera apagada la vista responde 404 con el sobre
``{success: false, message}`` de las demás vistas, sin consultar al proveedor ni
escribir auditoría, y sin nombrar variables internas. Encendida, valida el UUID del
intento y devuelve el sobre en lugar de un 500.
"""
import importlib.util
import json
import uuid
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import AuditLog, CaseVersion
from apps.simulation.services import ai_providers
from apps.simulation.views.ai_assistant import AIAssistantView
from psychosim.settings import base as base_settings

User = get_user_model()
URL = "/api/simulation/ai-assistant"
#: Nombres internos que nunca deben llegar al jugador.
INTERNAL_NAMES = ("AI_ASSISTANT", "API_KEY", "ENABLED", "entorno", "variable")


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_ai@x.com", password="x", nombre="Est", apellido="Ai", role="ESTUDIANTE"
    )


@pytest.fixture
def intento(estudiante):
    """Intento activo del estudiante (grupo con el caso asignado)."""
    case_version_id = CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001", status="PUBLISHED"
    ).id
    profesor = User.objects.create_user(
        email="prof_ai@x.com", password="x", nombre="Pro", apellido="Ai", role="PROFESOR"
    )
    grupo = Grupo.objects.create(nombre="Grupo AI", codigo="AI-G", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO grupo_case_version (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    data = cl(estudiante).post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    return data["attemptId"]


@pytest.fixture
def sin_proveedor(monkeypatch):
    """El proveedor externo nunca debe consultarse en estas pruebas."""
    def _prohibido(*args, **kwargs):  # pragma: no cover - solo si falla la prueba
        raise AssertionError("no debe consultarse al proveedor externo")

    monkeypatch.setattr(AIAssistantView, "_call_llm", _prohibido)
    monkeypatch.setattr(ai_providers, "post_json", _prohibido)


def _load_base_settings():
    """Evalúa una copia de settings/base.py con el entorno actual (sin tocar la real)."""
    spec = importlib.util.spec_from_file_location("base_settings_probe", Path(base_settings.__file__))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _ask(client, attempt_id, question="¿Qué principios aplican aquí?", **extra):
    body = {"attempt_id": attempt_id, "question": question, **extra}
    return client.post(URL, body, format="json")


def _assert_envelope(response, status, *, message_contains=None):
    assert response.status_code == status
    assert set(response.data) == {"success", "code", "message"}
    assert response.data["success"] is False
    assert isinstance(response.data["code"], str) and response.data["code"]
    assert isinstance(response.data["message"], str) and response.data["message"]
    if message_contains:
        assert message_contains in response.data["message"]
    for name in INTERNAL_NAMES:
        assert name not in response.data["message"], response.data["message"]


# ─── bandera apagada (por defecto) ───────────────────────────────────────────
def test_bandera_nace_apagada_en_la_configuracion_base(monkeypatch):
    monkeypatch.delenv("AI_ASSISTANT_ENABLED", raising=False)
    assert _load_base_settings().AI_ASSISTANT_ENABLED is False


@pytest.mark.parametrize("value, expected", [
    ("true", True), ("TRUE", True), ("1", True), ("yes", True), ("on", True),
    ("false", False), ("0", False), ("", False), ("quizá", False),
])
def test_bandera_solo_se_enciende_con_un_valor_explicito(monkeypatch, value, expected):
    monkeypatch.setenv("AI_ASSISTANT_ENABLED", value)
    assert _load_base_settings().AI_ASSISTANT_ENABLED is expected


def test_apagado_responde_404_con_el_sobre_y_sin_nombrar_variables(estudiante, intento, sin_proveedor):
    audit_before = AuditLog.objects.filter(action="AI_ASSISTANT_QUERY").count()

    response = _ask(cl(estudiante), intento)

    _assert_envelope(response, 404, message_contains="asistente")
    assert AuditLog.objects.filter(action="AI_ASSISTANT_QUERY").count() == audit_before


def test_apagado_no_distingue_peticiones_invalidas(estudiante, sin_proveedor):
    """Apagado manda sobre la validación: ni un UUID inválido ni parámetros vacíos filtran nada."""
    c = cl(estudiante)
    for body in ({}, {"attempt_id": "no-es-uuid", "question": "hola"}, {"attempt_id": str(uuid.uuid4())}):
        _assert_envelope(c.post(URL, body, format="json"), 404)


def test_apagado_exige_autenticacion(sin_proveedor):
    response = APIClient().post(URL, {"attempt_id": str(uuid.uuid4()), "question": "x"}, format="json")
    assert response.status_code == 401
    assert response.data["success"] is False


# ─── bandera encendida ───────────────────────────────────────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True)
def test_encendido_uuid_invalido_devuelve_el_sobre_no_un_500(estudiante, sin_proveedor):
    response = _ask(cl(estudiante), "esto-no-es-un-uuid")
    _assert_envelope(response, 400)


@override_settings(AI_ASSISTANT_ENABLED=True)
@pytest.mark.parametrize("body", [
    {},
    {"question": "¿Qué hago?"},
    {"attempt_id": str(uuid.uuid4())},
    {"attempt_id": str(uuid.uuid4()), "question": "   "},
])
def test_encendido_parametros_incompletos_devuelven_el_sobre(estudiante, sin_proveedor, body):
    _assert_envelope(cl(estudiante).post(URL, body, format="json"), 400)


@override_settings(AI_ASSISTANT_ENABLED=True)
def test_encendido_intento_inexistente_o_ajeno_es_404_con_el_sobre(estudiante, intento, sin_proveedor):
    c = cl(estudiante)
    _assert_envelope(_ask(c, str(uuid.uuid4())), 404, message_contains="Intento no encontrado")

    otro = User.objects.create_user(
        email="otro_ai@x.com", password="x", nombre="Otro", apellido="Ai", role="ESTUDIANTE"
    )
    _assert_envelope(_ask(cl(otro), intento), 404, message_contains="Intento no encontrado")


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="")
def test_encendido_sin_clave_responde_sin_nombrar_variables(estudiante, intento):
    response = _ask(cl(estudiante), intento)
    assert response.status_code == 200
    text = response.data["response"]
    for name in INTERNAL_NAMES:
        assert name not in text, text


@override_settings(AI_ASSISTANT_ENABLED=True)
def test_encendido_responde_y_deja_auditoria(estudiante, intento, monkeypatch):
    monkeypatch.setattr(AIAssistantView, "_call_llm", lambda self, question, context: "¿Qué observas?")

    response = _ask(cl(estudiante), intento, question="¿Qué principios aplican?", current_node_id=7)

    assert response.status_code == 200
    assert response.data == {"response": "¿Qué observas?"}
    entry = AuditLog.objects.filter(
        action="AI_ASSISTANT_QUERY", resource_id=intento
    ).order_by("-id").first()
    assert entry is not None
    assert json.loads(entry.context_json)["response_length"] == len("¿Qué observas?")


@override_settings(AI_ASSISTANT_ENABLED=True)
def test_encendido_error_del_proveedor_no_filtra_detalles(estudiante, intento, monkeypatch):
    def _falla(self, question, context):
        raise RuntimeError("provider returned 401: sk-secreto-del-proveedor")

    monkeypatch.setattr(AIAssistantView, "_call_llm", _falla)

    response = _ask(cl(estudiante), intento)

    assert response.status_code == 200
    assert "sk-secreto" not in response.data["response"]
    assert "provider" not in response.data["response"]
    assert "más tarde" in response.data["response"]
