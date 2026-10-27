"""Guía del asistente de autoría («¿dónde está X?» / «¿cómo hago X?»).

El catálogo de acciones lo manda el cliente (es del editor). El modelo elige una; nunca se confía en su salida:
un ``accionId`` fuera del catálogo es ``null``, un ``modo`` desconocido es ``foco`` y un mensaje inservible o con
contenido gráfico se cambia por un texto fijo.
"""
import re

from apps.simulation.services.ai_providers import ProviderError, provider_class

from . import prompts, schema

MAX_MESSAGE = 300
MAX_TOKENS = 600
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
FALLBACK_MESSAGE = "No encontré esa acción. Prueba con el buscador de acciones."


def _truncate(text: str) -> str:
    """Recorta en el límite de una palabra y agrega «…» (el resultado nunca pasa de ``MAX_MESSAGE``)."""
    if len(text) <= MAX_MESSAGE:
        return text
    cut = text[: MAX_MESSAGE - 1]
    if not text[MAX_MESSAGE - 1].isspace():
        cut = re.sub(r"\s*\S*$", "", cut) or cut
    return cut.rstrip() + "…"


def _message(raw) -> str:
    """El mensaje del modelo si sirve (texto no vacío, sin marcadores gráficos); si no, el texto fijo."""
    if not isinstance(raw, str) or not raw.strip():
        return FALLBACK_MESSAGE
    text = _truncate(raw.strip())
    if prompts.check_text(text) == prompts.GRAPHIC_REASON:
        return FALLBACK_MESSAGE
    return text


def answer(*, config, question, actions) -> dict:
    """Devuelve ``{accionId, modo, mensaje, model, changes}`` para ``question`` según el catálogo ``actions``."""
    if not config.api_key:
        raise ProviderError("http", "sin key configurada")
    result = {"accionId": None, "modo": "foco", "mensaje": FALLBACK_MESSAGE, "model": config.model_fast, "changes": 0}
    if not actions:
        return result
    provider = provider_class(config.provider)(config.api_key, config.model_fast)
    raw = provider.complete_structured(
        prompts.SYSTEM_GUIDE,
        [{"role": "user", "content": prompts.guide_message(question, actions)}],
        schema.GUIDE,
        config.model_fast,
        max_tokens=MAX_TOKENS,
    )
    if not isinstance(raw, dict):
        return result
    known = {action["id"] for action in actions}
    action_id = raw.get("accionId")
    result["accionId"] = action_id if isinstance(action_id, str) and action_id in known else None
    result["modo"] = raw["modo"] if raw.get("modo") in schema.GUIDE_MODES else "foco"
    result["mensaje"] = _message(raw.get("mensaje"))
    return result
