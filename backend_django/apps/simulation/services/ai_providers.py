"""Proveedores externos del asistente de IA (RF-027).

Cada proveedor es una *estrategia* intercambiable (patrón Strategy) con la misma
interfaz, ``AIProvider.complete(system, question) -> str``. Cada clase concreta
es además un *adaptador* (patrón Adapter): traduce esa interfaz única al formato
propio de la API que envuelve (URL, cabeceras, cuerpo y forma de la respuesta).

Agregar un proveedor nuevo es crear una clase y registrarla en ``PROVIDERS``;
la vista no se toca (principio abierto/cerrado).
"""
import http.client
import json
import re
import socket
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path

MAX_TOKENS = 512
TIMEOUT_SECONDS = 20
#: Las llamadas del asistente de autoría devuelven JSON largo: más margen que la pregunta corta del estudiante.
AUTHORING_TIMEOUT_SECONDS = 30
#: Cabecera beta que activa ``fallbacks`` (el respaldo de la propia API ante una negativa o un fallo del modelo pedido).
STRUCTURED_FALLBACK_BETA = "server-side-fallback-2026-07-01"


#: Los contadores de uso que se miden de cada llamada estructurada.
USAGE_FIELDS = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


class NotConfigured(Exception):
    """El asistente está encendido pero falta la clave del proveedor."""


#: Cabeceras cuyo valor es una credencial y se borra de los mensajes de error.
_CABECERAS_SECRETAS = frozenset({"x-api-key", "authorization"})


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
        for name, secret in headers.items():  # primero se borra la clave y después se recorta: no puede quedar cortada a medias
            if name.lower() in _CABECERAS_SECRETAS and secret:
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
        self,
        system: str,
        messages: list[dict],
        schema: dict,
        model: str,
        max_tokens: int = 4000,
        timeout: float = AUTHORING_TIMEOUT_SECONDS,
        *,
        effort: str | None = None,
        fallbacks: str | None = None,
        meta: dict | None = None,
    ) -> dict:
        """Una llamada con salida estructurada: el modelo responde un JSON que cumple ``schema``.

        Usa ``output_config.format`` (no ``tool_choice``, que Opus 5.5 y Sonnet 5.5 rechazan con 400).
        Lanza ``ProviderError`` con ``kind`` ``timeout``, ``http``, ``malformed`` o ``refusal``.

        Los tres parámetros de solo palabra clave son opcionales (sin ellos el cuerpo y las cabeceras son los de siempre):
        ``effort`` va en ``output_config.effort``; ``fallbacks`` agrega ``"fallbacks"`` y la cabecera beta; ``meta``, si se
        pasa, se llena con el modelo que respondió, si hubo respaldo y el uso de tokens.
        """
        output_config = {"format": {"type": "json_schema", "schema": schema}}
        if effort:
            output_config["effort"] = effort
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "output_config": output_config,
        }
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"}
        if fallbacks:
            payload["fallbacks"] = fallbacks
            headers["anthropic-beta"] = STRUCTURED_FALLBACK_BETA
        try:
            data = post_json(self.URL, payload, headers, timeout=timeout)
        except RuntimeError as exc:  # post_json: respuesta no 2xx
            raise ProviderError("http", self._sin_clave(str(exc))) from None
        except OSError as exc:  # incluye URLError, TimeoutError y cortes de conexión durante la lectura
            if _es_timeout(exc):
                raise ProviderError("timeout", "el proveedor no respondió a tiempo") from None
            raise ProviderError("http", self._sin_clave(f"error de red: {exc}")) from None
        except http.client.HTTPException as exc:  # IncompleteRead, BadStatusLine, RemoteDisconnected...
            raise ProviderError("http", self._sin_clave(f"respuesta HTTP inválida: {type(exc).__name__}")) from None
        except ValueError:  # cuerpo 2xx que no es JSON ni UTF-8 (p. ej. HTML de un proxy)
            raise ProviderError("malformed", "el cuerpo de la respuesta no es JSON") from None

        if not isinstance(data, dict):
            raise ProviderError("malformed", "el cuerpo de la respuesta no es un objeto JSON")
        if meta is not None:
            meta.update(self._medida(data, model))
        stop_reason = data.get("stop_reason")
        if stop_reason == "refusal":
            raise ProviderError("refusal", "el modelo se negó a responder")
        if stop_reason == "max_tokens":
            raise ProviderError("malformed", "la respuesta se cortó por max_tokens")
        content = data.get("content")
        if not isinstance(content, list):
            raise ProviderError("malformed", "el contenido de la respuesta no es una lista")
        text = next(
            (b.get("text") for b in content if isinstance(b, dict) and b.get("type") == "text"),
            None,
        )
        if text is not None and not isinstance(text, str):
            raise ProviderError("malformed", "el bloque de texto no es una cadena")
        if text is None:
            raise ProviderError("malformed", "la respuesta no trae un bloque de texto")
        try:
            result = json.loads(text)
        except ValueError:
            raise ProviderError("malformed", "el texto de la respuesta no es JSON") from None
        if not isinstance(result, dict):
            raise ProviderError("malformed", "el JSON de la respuesta no es un objeto")
        return result

    @staticmethod
    def _medida(data: dict, pedido: str) -> dict:
        """El modelo que respondió, si hubo respaldo y el uso de tokens de una respuesta (enteros; 0 si faltan)."""
        content = data.get("content")
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        modelo = data.get("model")
        return {
            "model": modelo if isinstance(modelo, str) and modelo else pedido,
            "fallback": isinstance(content, list)
            and any(isinstance(b, dict) and b.get("type") == "fallback" for b in content),
            "usage": {
                nombre: usage[nombre] if isinstance(usage.get(nombre), int) and not isinstance(usage.get(nombre), bool) else 0
                for nombre in USAGE_FIELDS
            },
        }

    def _sin_clave(self, message: str) -> str:
        """El mensaje sin la clave (el proveedor podría repetirla en el cuerpo del error)."""
        return message.replace(self.api_key, "***") if self.api_key else message


#: Las respuestas fijas del proveedor falso (datos de borrador clínico, pendientes de la aprobación de Psicología).
FAKE_FIXTURES = Path(__file__).resolve().parent / "authoring" / "generation" / "fixtures"
#: Marcas que la descripción de la docente puede llevar para provocar un fallo en las pruebas y el e2e.
_FAKE_FAILURES = {
    "[falso:timeout]": ("timeout", "el proveedor falso simuló una espera agotada"),
    "[falso:http]": ("http", "el proveedor falso simuló un error de red"),
    "[falso:malformed]": ("malformed", "el proveedor falso simuló una respuesta mal formada"),
    "[falso:refusal]": ("refusal", "el proveedor falso simuló una negativa"),
}
_FAKE_REPAIR = "[falso:reparar]"
_FAKE_STAGE = re.compile(r"\AEtapa: (esqueleto|escena ([a-z0-9-]{1,64}))[ \t]*$", re.MULTILINE)
_FAKE_PLACE = re.compile(r"^Lugar: ([a-z0-9-]{1,64})[ \t]*$", re.MULTILINE)
_FAKE_PREVIOUS_SCENE = "Escena anterior (JSON):"


class FakeProvider(AnthropicProvider):
    """Proveedor de pruebas y del e2e: responde archivos fijos y no toca la red (nunca se admite en producción).

    ``complete`` es el de ``AnthropicProvider`` (pasa por ``post_json``). ``complete_structured`` lee del último bloque del
    mensaje la ``Etapa:`` y el ``Lugar:`` y devuelve ``fixtures/<lugar>/esqueleto.json`` o ``escena-<sala>.json``; con el
    esquema del asistente devuelve ``fixtures/propuesta-vacia.json``. No guarda estado: lo que cambia entre una llamada y
    otra sale del texto de la etapa (la reparación trae el bloque ``Escena anterior (JSON):``).
    """

    def complete_structured(
        self,
        system: str,
        messages: list[dict],
        schema: dict,
        model: str,
        max_tokens: int = 4000,
        timeout: float = AUTHORING_TIMEOUT_SECONDS,
        *,
        effort: str | None = None,
        fallbacks: str | None = None,
        meta: dict | None = None,
    ) -> dict:
        from apps.simulation.services.authoring.assistant.schema import PROPOSAL  # difiere: el asistente importa este módulo

        if meta is not None:
            meta.update({"model": "fake", "fallback": False, "usage": dict.fromkeys(USAGE_FIELDS, 0)})
        if schema == PROPOSAL:
            return self._leer(FAKE_FIXTURES / "propuesta-vacia.json")
        texto = self._ultimo_texto(messages)
        for marca, (kind, mensaje) in _FAKE_FAILURES.items():
            if marca in texto:
                raise ProviderError(kind, mensaje)
        etapa, lugar = _FAKE_STAGE.search(texto), _FAKE_PLACE.search(texto)
        if not etapa or not lugar:
            raise ProviderError("malformed", "el proveedor falso no reconoce la etapa o el lugar")
        carpeta = FAKE_FIXTURES / lugar.group(1)
        if etapa.group(1) == "esqueleto":
            esqueleto = self._leer(carpeta / "esqueleto.json")
            if _FAKE_REPAIR in texto:  # la marca viaja con el esqueleto hasta las escenas
                esqueleto["contexto"] = f"{esqueleto['contexto']} {_FAKE_REPAIR}"
            return esqueleto
        clave = etapa.group(2)
        if _FAKE_REPAIR in texto and _FAKE_PREVIOUS_SCENE not in texto:
            variante = carpeta / f"escena-{clave}.reparar.json"
            if variante.is_file():
                return self._leer(variante)
        return self._leer(carpeta / f"escena-{clave}.json")

    @staticmethod
    def _ultimo_texto(messages: list[dict]) -> str:
        """El texto del último bloque del último mensaje (``""`` si no hay)."""
        contenido = messages[-1].get("content") if messages and isinstance(messages[-1], dict) else None
        if isinstance(contenido, list):
            contenido = contenido[-1].get("text") if contenido and isinstance(contenido[-1], dict) else None
        return contenido if isinstance(contenido, str) else ""

    @staticmethod
    def _leer(ruta: Path) -> dict:
        try:
            return json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise ProviderError("malformed", "el proveedor falso no tiene esa etapa para ese lugar") from None


PROVIDERS: dict[str, type[AIProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "fake": FakeProvider,
}
DEFAULT_PROVIDER = "openai"


def provider_class(name: str) -> type[AIProvider]:
    """Clase para el nombre configurado; un nombre desconocido cae en OpenAI (como antes)."""
    return PROVIDERS.get((name or "").lower(), PROVIDERS[DEFAULT_PROVIDER])
