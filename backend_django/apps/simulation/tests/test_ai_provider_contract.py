"""Pruebas de caracterización del asistente de IA (RF-027) en la frontera HTTP.

Fijan lo que el asistente le manda y le exige al proveedor externo (OpenAI o
Anthropic) sin depender de cómo esté organizado el código por dentro: se
intercepta ``urllib.request.urlopen``, que es lo último que toca la red. Así
sirven igual antes y después de separar los proveedores en clases propias
(patrones Strategy / Adapter / Factory Method).
"""
import json
import urllib.error
import urllib.request

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseVersion
from apps.simulation.tests.test_ai_assistant import estudiante, intento  # noqa: F401  (fixtures)

URL = "/api/simulation/ai-assistant"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


class _FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def red(monkeypatch):
    """Intercepta la red: guarda cada petición y responde lo que se configure."""
    calls = []
    state = {"reply": {}, "error": None}

    def _urlopen(request, timeout=None):
        calls.append({
            "url": request.full_url,
            "method": request.get_method(),
            "headers": {k.lower(): v for k, v in request.header_items()},
            "body": json.loads(request.data.decode("utf-8")),
            "timeout": timeout,
        })
        if state["error"] is not None:
            raise state["error"]
        return _FakeResponse(state["reply"])

    monkeypatch.setattr(urllib.request, "urlopen", _urlopen)
    state["calls"] = calls
    return state


def _ask(estudiante, intento, question="¿Qué principios aplican?", **extra):
    client = APIClient()
    client.force_authenticate(user=estudiante)
    body = {"attempt_id": intento, "question": question, **extra}
    return client.post(URL, body, format="json")


def _openai_reply(text):
    return {"choices": [{"message": {"content": text}}]}


def _anthropic_reply(text):
    return {"content": [{"type": "text", "text": text}]}


# ─── OpenAI ──────────────────────────────────────────────────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="clave-openai", AI_ASSISTANT_MODEL="gpt-4o-mini")
def test_openai_arma_la_peticion_y_lee_la_respuesta(estudiante, intento, red):
    red["reply"] = _openai_reply("  ¿Qué observas en el caso?  ")

    response = _ask(estudiante, intento, question="¿Qué hago?")

    assert response.status_code == 200
    assert response.data == {"response": "¿Qué observas en el caso?"}  # sin espacios sobrantes
    assert len(red["calls"]) == 1
    call = red["calls"][0]
    assert call["url"] == OPENAI_URL
    assert call["method"] == "POST"
    assert call["timeout"] == 20
    assert call["headers"]["authorization"] == "Bearer clave-openai"
    assert call["headers"]["content-type"] == "application/json"
    body = call["body"]
    assert set(body) == {"model", "max_tokens", "messages"}
    assert body["model"] == "gpt-4o-mini"
    assert body["max_tokens"] == 512
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert body["messages"][1]["content"] == "¿Qué hago?"


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="gpt-4o-mini")
@pytest.mark.parametrize("provider", ["openai", "OpenAI", "desconocido", ""])
def test_cualquier_proveedor_que_no_sea_anthropic_usa_openai(estudiante, intento, red, provider):
    red["reply"] = _openai_reply("ok")

    with override_settings(AI_ASSISTANT_PROVIDER=provider):
        response = _ask(estudiante, intento)

    assert response.data == {"response": "ok"}
    assert red["calls"][0]["url"] == OPENAI_URL


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="gpt-4o-mini")
@pytest.mark.parametrize("reply", [{}, {"choices": []}, {"choices": [{}]}, {"choices": [{"message": {}}]}])
def test_openai_respuesta_vacia_o_incompleta_devuelve_cadena_vacia(estudiante, intento, red, reply):
    red["reply"] = reply

    response = _ask(estudiante, intento)

    assert response.status_code == 200
    assert response.data == {"response": ""}


# ─── Anthropic ───────────────────────────────────────────────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="anthropic",
                   AI_ASSISTANT_API_KEY="clave-anthropic", AI_ASSISTANT_MODEL="claude-modelo-x")
def test_anthropic_arma_la_peticion_y_lee_la_respuesta(estudiante, intento, red):
    red["reply"] = _anthropic_reply("  Piensa en la ruta institucional.  ")

    response = _ask(estudiante, intento, question="¿Y ahora?")

    assert response.status_code == 200
    assert response.data == {"response": "Piensa en la ruta institucional."}
    call = red["calls"][0]
    assert call["url"] == ANTHROPIC_URL
    assert call["timeout"] == 20
    assert call["headers"]["x-api-key"] == "clave-anthropic"
    assert call["headers"]["anthropic-version"] == "2023-06-01"
    assert "authorization" not in call["headers"]
    body = call["body"]
    assert set(body) == {"model", "max_tokens", "system", "messages"}
    assert body["model"] == "claude-modelo-x"
    assert body["max_tokens"] == 512
    assert body["messages"] == [{"role": "user", "content": "¿Y ahora?"}]


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("provider", ["anthropic", "ANTHROPIC", "Anthropic"])
def test_proveedor_anthropic_no_distingue_mayusculas(estudiante, intento, red, provider):
    red["reply"] = _anthropic_reply("ok")

    with override_settings(AI_ASSISTANT_PROVIDER=provider):
        _ask(estudiante, intento)

    assert red["calls"][0]["url"] == ANTHROPIC_URL


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="anthropic",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("reply", [{}, {"content": []}, {"content": [{}]}])
def test_anthropic_respuesta_vacia_o_incompleta_devuelve_cadena_vacia(estudiante, intento, red, reply):
    red["reply"] = reply

    response = _ask(estudiante, intento)

    assert response.status_code == 200
    assert response.data == {"response": ""}


# ─── Configuración y fallos (comunes a ambos proveedores) ────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("api_key", ["", "   "])
def test_sin_clave_no_se_toca_la_red(estudiante, intento, red, api_key):
    with override_settings(AI_ASSISTANT_API_KEY=api_key):
        response = _ask(estudiante, intento)

    assert response.status_code == 200
    assert "no está configurado" in response.data["response"]
    assert red["calls"] == []


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="  clave  ", AI_ASSISTANT_MODEL="  m  ")
def test_clave_y_modelo_se_recortan_antes_de_enviarse(estudiante, intento, red):
    red["reply"] = _openai_reply("ok")

    with override_settings(AI_ASSISTANT_PROVIDER="openai"):
        _ask(estudiante, intento)

    call = red["calls"][0]
    assert call["headers"]["authorization"] == "Bearer clave"
    assert call["body"]["model"] == "m"


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="sk-secreto", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("provider", ["openai", "anthropic"])
def test_error_http_del_proveedor_no_filtra_detalles_ni_la_clave(estudiante, intento, red, provider):
    import io
    red["error"] = urllib.error.HTTPError(
        "https://x", 401, "Unauthorized", {}, io.BytesIO(b'{"error":"invalid key sk-secreto"}')
    )

    with override_settings(AI_ASSISTANT_PROVIDER=provider):
        response = _ask(estudiante, intento)

    assert response.status_code == 200
    text = response.data["response"]
    assert "más tarde" in text
    assert "sk-secreto" not in text and "401" not in text


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("provider", ["openai", "anthropic"])
def test_error_de_red_se_traduce_a_mensaje_generico(estudiante, intento, red, provider):
    red["error"] = urllib.error.URLError("sin conexión")

    with override_settings(AI_ASSISTANT_PROVIDER=provider):
        response = _ask(estudiante, intento)

    assert response.status_code == 200
    assert "más tarde" in response.data["response"]


# ─── Contexto pedagógico (mismo para ambos proveedores) ──────────────────────
def _system_prompt(call):
    body = call["body"]
    return body["system"] if "system" in body else body["messages"][0]["content"]


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("provider", ["openai", "anthropic"])
def test_antes_de_decidir_el_contexto_prohibe_revelar_la_respuesta(estudiante, intento, red, provider):
    red["reply"] = _openai_reply("ok") if provider == "openai" else _anthropic_reply("ok")

    with override_settings(AI_ASSISTANT_PROVIDER=provider):
        _ask(estudiante, intento, current_node_id=7)

    prompt = _system_prompt(red["calls"][0])
    assert "NO ha tomado una decision" in prompt
    assert "No reveles la respuesta correcta" in prompt
    assert "Nodo actual: 7" in prompt
    assert "Caso actual: " in prompt


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("flag", [True, "true", "1", "yes", "si", " SI "])
def test_despues_de_decidir_el_contexto_permite_retroalimentacion(estudiante, intento, red, flag):
    red["reply"] = _openai_reply("ok")

    _ask(estudiante, intento, decision_already_taken=flag)

    prompt = _system_prompt(red["calls"][0])
    assert "ya tomo una decision" in prompt
    assert "No reveles" not in prompt
    assert "Nodo actual: sin nodo" in prompt


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
@pytest.mark.parametrize("flag", [False, "false", "0", "no", "", None])
def test_valores_falsos_de_la_bandera_cuentan_como_sin_decision(estudiante, intento, red, flag):
    red["reply"] = _openai_reply("ok")

    _ask(estudiante, intento, decision_already_taken=flag)

    assert "NO ha tomado una decision" in _system_prompt(red["calls"][0])


@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
def test_el_contexto_incluye_el_titulo_del_caso(estudiante, intento, red):
    red["reply"] = _openai_reply("ok")
    title = CaseVersion.objects.get(
        simulation_case__code="SIM-VBG-001", status="PUBLISHED"
    ).simulation_case.title

    _ask(estudiante, intento)

    assert f"Caso actual: {title}" in _system_prompt(red["calls"][0])


# ─── Auditoría ───────────────────────────────────────────────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True, AI_ASSISTANT_PROVIDER="openai",
                   AI_ASSISTANT_API_KEY="k", AI_ASSISTANT_MODEL="m")
def test_auditoria_registra_cuanto_se_pregunto_y_la_decision_pero_no_la_pregunta(estudiante, intento, red):
    red["reply"] = _openai_reply("respuesta")
    largo = "x" * 800

    _ask(estudiante, intento, question=largo, current_node_id=3, decision_already_taken="true")

    entry = AuditLog.objects.filter(action="AI_ASSISTANT_QUERY", resource_id=intento).order_by("-id").first()
    context = json.loads(entry.context_json)
    assert "question" not in context  # texto libre de una persona: la auditoría no lo guarda (revisión de E5, I-2)
    assert context["question_length"] == 800
    assert context["node"] == 3
    assert context["decision_taken"] is True
    assert context["response_length"] == len("respuesta")
    # La pregunta completa sí viaja al proveedor; la auditoría solo sabe cuánto preguntó.
    assert red["calls"][0]["body"]["messages"][-1]["content"] == largo
