"""Proveedores externos del asistente de IA (RF-027).

Cada proveedor es una *estrategia* intercambiable (patrón Strategy) con la misma
interfaz, ``AIProvider.complete(system, question) -> str``. Cada clase concreta
es además un *adaptador* (patrón Adapter): traduce esa interfaz única al formato
propio de la API que envuelve (URL, cabeceras, cuerpo y forma de la respuesta).

Agregar un proveedor nuevo es crear una clase y registrarla en ``PROVIDERS``;
la vista no se toca (principio abierto/cerrado).
"""
import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

MAX_TOKENS = 512
TIMEOUT_SECONDS = 20


class NotConfigured(Exception):
    """El asistente está encendido pero falta la clave del proveedor."""


def post_json(url: str, payload: dict, headers: dict) -> dict:
    """Transporte HTTP común a todos los proveedores (lo único que toca la red)."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            **headers,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"provider returned {exc.code}: {body[:300]}") from exc


class AIProvider(ABC):
    """Estrategia: cómo se obtiene una respuesta de un modelo de lenguaje."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    @abstractmethod
    def complete(self, system: str, question: str) -> str:
        """Devuelve el texto de la respuesta (ya recortado)."""


class OpenAIProvider(AIProvider):
    """Adaptador de la API Chat Completions de OpenAI."""

    URL = "https://api.openai.com/v1/chat/completions"

    def complete(self, system: str, question: str) -> str:
        payload = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": question},
            ],
        }
        data = post_json(self.URL, payload, {"Authorization": f"Bearer {self.api_key}"})
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()


class AnthropicProvider(AIProvider):
    """Adaptador de la API Messages de Anthropic."""

    URL = "https://api.anthropic.com/v1/messages"

    def complete(self, system: str, question: str) -> str:
        payload = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": question}],
        }
        data = post_json(self.URL, payload, {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        })
        content = data.get("content") or []
        return (content[0].get("text", "") if content else "").strip()


PROVIDERS: dict[str, type[AIProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}
DEFAULT_PROVIDER = "openai"


def provider_class(name: str) -> type[AIProvider]:
    """Clase para el nombre configurado; un nombre desconocido cae en OpenAI (como antes)."""
    return PROVIDERS.get((name or "").lower(), PROVIDERS[DEFAULT_PROVIDER])
