from unittest.mock import patch
import socket

import pytest
from django.test import override_settings

from apps.simulation.services import ai_providers as ai
from apps.simulation.services.authoring.assistant import config

KEY = 'clave-de-prueba-secreta'
SCHEMA = {'type': 'object', 'properties': {'a': {'type': 'integer'}}, 'required': ['a'], 'additionalProperties': False}
MENSAJES = [{'role': 'user', 'content': [{'type': 'text', 'text': 'hola', 'cache_control': {'type': 'ephemeral'}}]}]


def respuesta(content='{"a": 1}', finish='stop', **message):
    return {'model': 'respondio', 'usage': {'prompt_tokens': 4, 'completion_tokens': 7}, 'choices': [{'finish_reason': finish, 'message': {'content': content, **message}}]}


def llamada(data):
    with patch.object(ai, 'post_json', return_value=data) as post:
        meta = {}
        valor = ai.OpenAICompatibleProvider(KEY, 'modelo').complete_structured('s', MENSAJES, SCHEMA, 'otro', max_tokens=123, timeout=90, effort='high', fallbacks='default', meta=meta)
    return valor, post, meta


def test_respuesta_y_contrato():
    with override_settings(AI_AUTHORING_BASE_URL='https://ejemplo.test/v1/'):
        valor, post, meta = llamada(respuesta())
    assert valor == {'a': 1}
    url, payload, headers = post.call_args.args
    assert url == 'https://ejemplo.test/v1/chat/completions'
    assert headers['Authorization'] == f'Bearer {KEY}'
    assert payload['response_format'] == {'type': 'json_schema', 'json_schema': {'name': 'respuesta', 'schema': SCHEMA, 'strict': True}}
    assert payload['messages'][0]['role'] == 'system' and '"required"' in payload['messages'][0]['content']
    assert payload['messages'][1] == {'role': 'user', 'content': 'hola'}
    # Piso de salida: 123 pedidos no alcanzan para razonar y responder.
    assert payload['model'] == 'otro' and payload['max_tokens'] == ai.OpenAICompatibleProvider.MIN_OUTPUT_TOKENS
    assert 'effort' not in payload and 'fallbacks' not in payload
    assert post.call_args.kwargs['timeout'] == 90
    assert meta == {'model': 'respondio', 'fallback': False, 'usage': {'input_tokens': 4, 'output_tokens': 7, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}}


def test_json_envuelto():
    assert llamada(respuesta('Aquí está:\n```json\n{"a": 1}\n```\nfin'))[0] == {'a': 1}


def test_vale_el_primer_objeto_que_cumple_el_esquema():
    texto = 'Pienso en {"borrador": true} y luego respondo {"a": 2}'
    assert llamada(respuesta(texto))[0] == {'a': 2}


def test_sin_json_schema_repite_con_json_object():
    rechazo = RuntimeError('provider returned 400: response_format json_schema no admitido')
    with patch.object(ai, 'post_json', side_effect=[rechazo, respuesta()]) as post:
        valor = ai.OpenAICompatibleProvider(KEY, 'm').complete_structured('s', MENSAJES, SCHEMA, 'm')
    assert valor == {'a': 1}
    primero, segundo = (llamada_.args[1] for llamada_ in post.call_args_list)
    assert primero['response_format']['type'] == 'json_schema'
    assert segundo['response_format'] == {'type': 'json_object'}


@pytest.mark.parametrize('error', [RuntimeError('provider returned 500: caído'), socket.timeout()])
def test_otros_fallos_no_repiten(error):
    with patch.object(ai, 'post_json', side_effect=error) as post, pytest.raises(ai.ProviderError):
        ai.OpenAICompatibleProvider(KEY, 'm').complete_structured('s', MENSAJES, SCHEMA, 'm')
    assert post.call_count == 1


def test_la_guia_de_600_tokens_sube_al_piso_y_anthropic_no_cambia():
    with patch.object(ai, 'post_json', return_value=respuesta()) as post:
        ai.OpenAICompatibleProvider(KEY, 'm').complete_structured('s', MENSAJES, SCHEMA, 'm', max_tokens=600)
    assert post.call_args.args[1]['max_tokens'] == ai.OpenAICompatibleProvider.MIN_OUTPUT_TOKENS >= 2000
    anthropic = {'model': 'm', 'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '{"a": 1}'}]}
    with patch.object(ai, 'post_json', return_value=anthropic) as post:
        ai.AnthropicProvider(KEY, 'm').complete_structured('s', MENSAJES, SCHEMA, 'm', max_tokens=600)
    assert post.call_args.args[1]['max_tokens'] == 600


def test_complete_tolera_contenido_nulo():
    with patch.object(ai, 'post_json', return_value=respuesta(None)):
        assert ai.OpenAICompatibleProvider(KEY, 'm').complete('s', 'pregunta') == ''


@pytest.mark.parametrize('data,kind', [
    (respuesta('', reasoning_content='pensando'), 'malformed'),
    (respuesta('{"a": "mal"}'), 'malformed'),
    (respuesta('{"a": 1}', finish='length'), 'malformed'),
    (respuesta(None, refusal='No puedo'), 'refusal'),
    (respuesta('', finish='content_filter'), 'refusal'),
    (respuesta('', finish='refusal'), 'refusal'),
    (respuesta('{"a": 1}', finish=None), 'malformed'),
    ({'choices': []}, 'malformed'),
])
def test_respuestas_invalidas(data, kind):
    with pytest.raises(ai.ProviderError) as exc:
        llamada(data)
    assert exc.value.kind == kind


@pytest.mark.parametrize('error,kind', [(socket.timeout(), 'timeout'), (RuntimeError('fallo ' + KEY), 'http')])
def test_errores_sin_clave(error, kind):
    with patch.object(ai, 'post_json', side_effect=error), pytest.raises(ai.ProviderError) as exc:
        ai.OpenAICompatibleProvider(KEY, 'm').complete_structured('s', MENSAJES, SCHEMA, 'm')
    assert exc.value.kind == kind and KEY not in str(exc.value)


def test_complete():
    with patch.object(ai, 'post_json', return_value=respuesta(' texto ')):
        assert ai.OpenAICompatibleProvider(KEY, 'm').complete('s', 'pregunta') == 'texto'


def test_seleccion_y_clave():
    assert ai.provider_class('anthropic') is ai.AnthropicProvider
    assert ai.provider_class('fake') is ai.FakeProvider
    assert ai.provider_class('openai-compatible') is ai.OpenAICompatibleProvider
    for clave, listo in [('', False), (KEY, True)]:
        with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_PROVIDER='openai-compatible', AI_AUTHORING_API_KEY=clave):
            assert config.current().generation_ready is listo


def test_produccion_acepta_proveedor(monkeypatch):
    from shared.tests.test_production_settings import _production, _restore_base_settings  # noqa: F401
    assert _production(monkeypatch, AI_AUTHORING_PROVIDER='openai-compatible')['AI_AUTHORING_PROVIDER'] == 'openai-compatible'


def test_esquemas_reales_con_respuestas_falsas():
    from apps.simulation.services.authoring.assistant.schema import PROPOSAL
    from apps.simulation.services.authoring.generation import prompts
    from apps.simulation.services.authoring.generation.schema import SCENE, SKELETON
    import json

    falso = ai.FakeProvider('', 'fake')
    contexto = {'lugar': {'id': 'universidad'}}
    mensajes_esqueleto = prompts.skeleton_messages(contexto, 'Caso de prueba')
    esqueleto = falso.complete_structured('s', mensajes_esqueleto, SKELETON, 'fake')
    mensajes_escena = prompts.scene_messages(contexto, esqueleto, 'aula', None)
    for schema, mensajes in ((SKELETON, mensajes_esqueleto), (SCENE, mensajes_escena),
                             (PROPOSAL, [{'role': 'user', 'content': 'hola'}])):
        esperado = falso.complete_structured('s', mensajes, schema, 'fake')
        with patch.object(ai, 'post_json', return_value=respuesta(json.dumps(esperado))):
            assert ai.OpenAICompatibleProvider(KEY, 'm').complete_structured('s', mensajes, schema, 'm') == esperado
