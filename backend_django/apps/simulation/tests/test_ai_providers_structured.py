"""P5-1 · Salida estructurada del proveedor Anthropic y configuración del asistente de autoría.

El transporte HTTP se simula parchando ``urllib.request.urlopen``: nada toca la red.
"""
import io
import json
import socket
import urllib.error
from unittest import mock

import pytest
from django.test import override_settings

from apps.simulation.services.ai_providers import AnthropicProvider, ProviderError
from apps.simulation.services.authoring.assistant import config

KEY = "sk-ant-clave-secreta-123"
SCHEMA = {"type": "object", "properties": {"titulo": {"type": "string"}}, "required": ["titulo"]}
MESSAGES = [{"role": "user", "content": "propón un título"}]


class _Respuesta:
    def __init__(self, data):
        self._raw = json.dumps(data).encode("utf-8")

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _ok(text, stop_reason="end_turn"):
    return _Respuesta({"content": [{"type": "text", "text": text}], "stop_reason": stop_reason})


def _provider():
    return AnthropicProvider(KEY, "claude-haiku-5-5")


def _llamar(respuesta=None, error=None):
    """Ejecuta complete_structured con urlopen simulado; devuelve (resultado, request enviada, kwargs)."""
    with mock.patch("urllib.request.urlopen", side_effect=error, return_value=respuesta) as urlopen:
        resultado = _provider().complete_structured("sistema", MESSAGES, SCHEMA, "claude-opus-5-5", max_tokens=1234)
    request = urlopen.call_args.args[0]
    return resultado, request, urlopen.call_args.kwargs


def test_envia_el_esquema_como_salida_estructurada_y_devuelve_el_json():
    resultado, request, kwargs = _llamar(_ok('{"titulo": "Duelo"}'))
    body = json.loads(request.data)
    assert resultado == {"titulo": "Duelo"}
    assert body["output_config"] == {"format": {"type": "json_schema", "schema": SCHEMA}}
    assert "tool_choice" not in body and "tools" not in body
    assert body["model"] == "claude-opus-5-5"
    assert body["max_tokens"] == 1234
    assert body["system"] == "sistema"
    assert body["messages"] == MESSAGES
    assert kwargs["timeout"] == 30


def test_la_key_viaja_solo_en_la_cabecera_x_api_key():
    _, request, _ = _llamar(_ok("{}"))
    headers = {k.lower(): v for k, v in request.header_items()}
    assert headers["x-api-key"] == KEY
    assert headers["anthropic-version"] == "2023-06-01"
    assert KEY not in request.data.decode("utf-8")


def test_una_respuesta_sin_bloque_de_texto_json_es_provider_error_malformed():
    for respuesta in (
        _Respuesta({"content": [], "stop_reason": "end_turn"}),
        _ok("esto no es json"),
        _ok("[1, 2]"),
    ):
        with pytest.raises(ProviderError) as info:
            _llamar(respuesta)
        assert info.value.kind == "malformed"


def test_cortar_por_max_tokens_es_malformed():
    with pytest.raises(ProviderError) as info:
        _llamar(_ok('{"titulo": "Du', stop_reason="max_tokens"))
    assert info.value.kind == "malformed"


def test_una_negativa_es_provider_error_refusal():
    with pytest.raises(ProviderError) as info:
        _llamar(_Respuesta({"content": [], "stop_reason": "refusal"}))
    assert info.value.kind == "refusal"


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError("agotado"),
        socket.timeout("agotado"),
        urllib.error.URLError(socket.timeout("agotado")),
    ],
)
def test_timeout_es_provider_error_timeout(error):
    with pytest.raises(ProviderError) as info:
        _llamar(error=error)
    assert info.value.kind == "timeout"


def test_un_error_de_red_que_no_es_timeout_es_http():
    with pytest.raises(ProviderError) as info:
        _llamar(error=urllib.error.URLError(ConnectionRefusedError("rechazada")))
    assert info.value.kind == "http"


def test_un_estado_no_2xx_es_http_con_el_codigo_y_sin_la_key():
    cuerpo = ("x" * 400 + KEY).encode("utf-8")
    error = urllib.error.HTTPError("https://api", 429, "Too Many", {}, io.BytesIO(cuerpo))
    with pytest.raises(ProviderError) as info:
        _llamar(error=error)
    assert info.value.kind == "http"
    assert "429" in str(info.value)
    assert KEY not in str(info.value)
    assert len(str(info.value)) < 400


def test_la_key_en_el_cuerpo_del_error_se_borra():
    cuerpo = f"clave invalida: {KEY}".encode("utf-8")
    error = urllib.error.HTTPError("https://api", 401, "Unauthorized", {}, io.BytesIO(cuerpo))
    with pytest.raises(ProviderError) as info:
        _llamar(error=error)
    assert KEY not in str(info.value)


def test_la_configuracion_se_lee_de_los_settings():
    with override_settings(
        AI_AUTHORING_ENABLED=True,
        AI_AUTHORING_PROVIDER="anthropic",
        AI_AUTHORING_API_KEY=KEY,
        AI_AUTHORING_MODEL_FAST="rapido",
        AI_AUTHORING_MODEL_CAPABLE="capaz",
        AI_AUTHORING_DAILY_LIMIT_PER_USER=7,
        AI_AUTHORING_MONTHLY_LIMIT=70,
    ):
        cfg = config.current()
    assert cfg == config.AuthoringAssistantConfig(True, "anthropic", KEY, "rapido", "capaz", 7, 70)


def test_la_configuracion_por_defecto_esta_apagada():
    cfg = config.current()
    assert cfg.enabled is False
    assert cfg.provider == "anthropic"
    assert cfg.model_capable == "claude-opus-5-5"
    assert cfg.model_fast == "claude-haiku-5-5"


def test_el_repr_de_la_configuracion_no_muestra_la_key():
    with override_settings(AI_AUTHORING_API_KEY=KEY):
        cfg = config.current()
    assert KEY not in repr(cfg)
    assert KEY not in str(cfg)
    assert "***" in repr(cfg)
