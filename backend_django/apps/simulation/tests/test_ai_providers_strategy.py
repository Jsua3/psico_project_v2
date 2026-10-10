"""Pruebas de las costuras que introduce P-01 (Strategy / Adapter / Factory Method).

Las pruebas de ``test_ai_provider_contract`` fijan lo que viaja por la red; estas
fijan que las piezas nuevas sean realmente intercambiables: elegir proveedor por
nombre, registrar uno nuevo sin tocar la vista y sustituir el proveedor entero
sin red.
"""
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.simulation.services import ai_providers
from apps.simulation.services.ai_providers import (
    AIProvider,
    AnthropicProvider,
    NotConfigured,
    OpenAIProvider,
    provider_class,
)
from apps.simulation.tests.test_ai_assistant import estudiante, intento  # noqa: F401  (fixtures)
from apps.simulation.views.ai_assistant import AIAssistantView

URL = "/api/simulation/ai-assistant"


# ─── Factory: nombre configurado → clase concreta ────────────────────────────
@pytest.mark.parametrize("name,expected", [
    ("openai", OpenAIProvider),
    ("OpenAI", OpenAIProvider),
    ("anthropic", AnthropicProvider),
    ("ANTHROPIC", AnthropicProvider),
    ("desconocido", OpenAIProvider),   # igual que antes del refactor
    ("", OpenAIProvider),
    (None, OpenAIProvider),
])
def test_el_nombre_elige_la_clase(name, expected):
    assert provider_class(name) is expected


@override_settings(AI_ASSISTANT_API_KEY="  ", AI_ASSISTANT_PROVIDER="anthropic")
def test_el_metodo_de_fabrica_exige_clave():
    with pytest.raises(NotConfigured):
        AIAssistantView().create_provider()


@override_settings(AI_ASSISTANT_API_KEY=" k ", AI_ASSISTANT_PROVIDER="anthropic", AI_ASSISTANT_MODEL=" m ")
def test_el_metodo_de_fabrica_construye_el_proveedor_con_clave_y_modelo_recortados():
    provider = AIAssistantView().create_provider()

    assert isinstance(provider, AnthropicProvider)
    assert (provider.api_key, provider.model) == ("k", "m")


def test_registrar_un_proveedor_nuevo_no_toca_la_vista(monkeypatch):
    class Eco(AIProvider):
        def complete(self, system, question):
            return f"eco:{question}"

    monkeypatch.setitem(ai_providers.PROVIDERS, "eco", Eco)

    with override_settings(AI_ASSISTANT_PROVIDER="eco", AI_ASSISTANT_API_KEY="k"):
        provider = AIAssistantView().create_provider()

    assert isinstance(provider, Eco)
    assert provider.complete("ctx", "hola") == "eco:hola"


def test_la_interfaz_no_se_puede_instanciar_sin_complete():
    with pytest.raises(TypeError):
        AIProvider("k", "m")


# ─── Adapter: la misma interfaz, dos formatos de API ─────────────────────────
def _capturar(monkeypatch, reply):
    calls = []

    def _post(url, payload, headers):
        calls.append((url, payload, headers))
        return reply

    monkeypatch.setattr(ai_providers, "post_json", _post)
    return calls


def test_openai_adapta_la_interfaz_comun(monkeypatch):
    calls = _capturar(monkeypatch, {"choices": [{"message": {"content": " hola "}}]})

    text = OpenAIProvider("kk", "gpt-x").complete("sistema", "pregunta")

    assert text == "hola"
    url, payload, headers = calls[0]
    assert url == OpenAIProvider.URL
    assert headers == {"Authorization": "Bearer kk"}
    assert payload["messages"] == [
        {"role": "system", "content": "sistema"},
        {"role": "user", "content": "pregunta"},
    ]


def test_anthropic_adapta_la_misma_interfaz(monkeypatch):
    calls = _capturar(monkeypatch, {"content": [{"text": " hola "}]})

    text = AnthropicProvider("kk", "claude-x").complete("sistema", "pregunta")

    assert text == "hola"
    url, payload, headers = calls[0]
    assert url == AnthropicProvider.URL
    assert headers == {"x-api-key": "kk", "anthropic-version": "2023-06-01"}
    assert payload["system"] == "sistema"
    assert payload["messages"] == [{"role": "user", "content": "pregunta"}]


@pytest.mark.parametrize("provider,reply", [
    (OpenAIProvider, {}),
    (OpenAIProvider, {"choices": []}),
    (AnthropicProvider, {}),
    (AnthropicProvider, {"content": []}),
])
def test_respuesta_vacia_da_texto_vacio(monkeypatch, provider, reply):
    _capturar(monkeypatch, reply)

    assert provider("k", "m").complete("s", "q") == ""


# ─── Strategy: la vista funciona con cualquier proveedor ─────────────────────
@override_settings(AI_ASSISTANT_ENABLED=True)
def test_la_vista_usa_el_proveedor_que_le_da_la_fabrica(estudiante, intento, monkeypatch):
    visto = {}

    class Falso(AIProvider):
        def complete(self, system, question):
            visto["system"], visto["question"] = system, question
            return "respuesta del falso"

    monkeypatch.setattr(AIAssistantView, "create_provider", lambda self: Falso("k", "m"))
    # Sin red: cualquier intento de salir al exterior hace fallar la prueba.
    monkeypatch.setattr(ai_providers, "post_json", lambda *a, **k: pytest.fail("no debe usar la red"))
    client = APIClient()
    client.force_authenticate(user=estudiante)

    response = client.post(URL, {"attempt_id": intento, "question": "¿Y ahora?"}, format="json")

    assert response.data == {"response": "respuesta del falso"}
    assert visto["question"] == "¿Y ahora?"
    assert "SIEP" in visto["system"]
