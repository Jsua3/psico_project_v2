"""Proveedores externos del asistente de IA (RF-027).

Cada proveedor es una *estrategia* intercambiable (patrón Strategy) con la misma
interfaz, ``AIProvider.complete(system, question) -> str``. Cada clase concreta
es además un *adaptador* (patrón Adapter): traduce esa interfaz única al formato
propio de la API que envuelve (URL, cabeceras, cuerpo y forma de la respuesta).

Agregar un proveedor nuevo es crear una clase y registrarla en ``PROVIDERS``;
la vista no se toca (principio abierto/cerrado).
"""
import json
import socket
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

MAX_TOKENS = 512
TIMEOUT_SECONDS = 20
#: Las llamadas del asistente de autoría devuelven JSON largo: más margen que la pregunta corta del estudiante.
AUTHORING_TIMEOUT_SECONDS = 30


class NotConfigured(Exception):
    """El asistente está encendido pero falta la clave del proveedor."""


def post_json(url: str, payload: dict, headers: dict, timeout: float = TIMEOUT_SECONDS) -> dict:
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
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        for secret in headers.values():  # primero se borra la clave y después se recorta: no puede quedar cortada a medias
            if len(secret) >= 8:
                body = body.replace(secret, "***")
        raise RuntimeError(f"provider returned {exc.code}: {body[:300]}") from exc


class ProviderError(Exception):
    """Fallo de una llamada estructurada. ``kind``: ``timeout``, ``http``, ``malformed`` o ``refusal``.

    El mensaje nunca lleva la clave del proveedor.
    """

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _es_timeout(exc: BaseException) -> bool:
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return True
    return isinstance(exc, urllib.error.URLError) and isinstance(exc.reason, (TimeoutError, socket.timeout))


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

    def complete_structured(
        self, system: str, messages: list[dict], schema: dict, model: str, max_tokens: int = 4000
    ) -> dict:
        """Una llamada con salida estructurada: el modelo responde un JSON que cumple ``schema``.

        Usa ``output_config.format`` (no ``tool_choice``, que Opus 5.5 y Sonnet 5.5 rechazan con 400).
        Lanza ``ProviderError`` con ``kind`` ``timeout``, ``http``, ``malformed`` o ``refusal``.
        """
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "output_config": {"format": {"type": "json_schema", "schema": schema}},
        }
        try:
            data = post_json(
                self.URL,
                payload,
                {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
                timeout=AUTHORING_TIMEOUT_SECONDS,
            )
        except RuntimeError as exc:  # post_json: respuesta no 2xx
            raise ProviderError("http", self._sin_clave(str(exc))) from None
        except OSError as exc:  # incluye URLError, TimeoutError y cortes de conexión durante la lectura
            if _es_timeout(exc):
                raise ProviderError("timeout", "el proveedor no respondió a tiempo") from None
            raise ProviderError("http", self._sin_clave(f"error de red: {exc}")) from None
        except ValueError:  # cuerpo 2xx que no es JSON ni UTF-8 (p. ej. HTML de un proxy)
            raise ProviderError("malformed", "el cuerpo de la respuesta no es JSON") from None

        if not isinstance(data, dict):
            raise ProviderError("malformed", "el cuerpo de la respuesta no es un objeto JSON")
        stop_reason = data.get("stop_reason")
        if stop_reason == "refusal":
            raise ProviderError("refusal", "el modelo se negó a responder")
        if stop_reason == "max_tokens":
            raise ProviderError("malformed", "la respuesta se cortó por max_tokens")
        text = next((b.get("text") for b in data.get("content") or [] if b.get("type") == "text"), None)
        if text is None:
            raise ProviderError("malformed", "la respuesta no trae un bloque de texto")
        try:
            result = json.loads(text)
        except ValueError:
            raise ProviderError("malformed", "el texto de la respuesta no es JSON") from None
        if not isinstance(result, dict):
            raise ProviderError("malformed", "el JSON de la respuesta no es un objeto")
        return result

    def _sin_clave(self, message: str) -> str:
        """El mensaje sin la clave (el proveedor podría repetirla en el cuerpo del error)."""
        return message.replace(self.api_key, "***") if self.api_key else message


PROVIDERS: dict[str, type[AIProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}
DEFAULT_PROVIDER = "openai"


def provider_class(name: str) -> type[AIProvider]:
    """Clase para el nombre configurado; un nombre desconocido cae en OpenAI (como antes)."""
    return PROVIDERS.get((name or "").lower(), PROVIDERS[DEFAULT_PROVIDER])
