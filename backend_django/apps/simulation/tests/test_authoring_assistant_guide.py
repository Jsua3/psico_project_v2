"""P5 · Tarea 4 · La guía del editor: elige una acción del catálogo que manda el cliente.

El proveedor es simulado (``AnthropicProvider.complete_structured`` reemplazado): jamás hay red. Se prueba que la
respuesta nunca confía en el modelo (id inventado → ``null``, modo raro → ``foco``, mensaje malo → texto fijo), que
se usa el modelo rápido, que el catálogo vacío no llama al proveedor y que la ruta valida la forma antes del cupo.
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, AuthoringAssistantUsage
from apps.simulation.services.ai_providers import AnthropicProvider, ProviderError
from apps.simulation.services.authoring.assistant import config as assistant_config
from apps.simulation.services.authoring.assistant import guide, prompts, schema

User = get_user_model()
AUTHORING = "/api/authoring/cases"
KEY = "sk-ant-clave-de-prueba-0123456789"
ON = dict(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY=KEY, AI_AUTHORING_DAILY_LIMIT_PER_USER=5,
          AI_AUTHORING_MONTHLY_LIMIT=100)
FALLBACK = "No encontré esa acción. Prueba con el buscador de acciones."
FOUND = "Te muestro dónde está."
CATALOG = [
    {"id": "mapa.agregar-sala", "nombre": "Agregar una sala", "pantalla": "editor-mapa"},
    {"id": "dialogo.nueva-linea", "nombre": "Escribir una línea de diálogo", "pantalla": "editor-dialogo"},
]


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def prof(db):
    return User.objects.create_user(email="guia_prof@x.com", password="pass1234", nombre="N", apellido="A", role="PROFESOR")


@pytest.fixture
def cv(prof):
    response = cl(prof).post(AUTHORING, {"title": "Caso con guía"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]["caseVersionId"]


@pytest.fixture
def provider(monkeypatch):
    """Un ``complete_structured`` simulado que registra lo que recibe y devuelve ``reply['value']``."""
    seen = {"calls": 0}
    reply = {"value": {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": "Aquí está."}}

    def complete_structured(self, system, messages, schema_, model, max_tokens=4000, timeout=30):
        seen.update(calls=seen["calls"] + 1, system=system, messages=messages, schema=schema_, model=model,
                    max_tokens=max_tokens, timeout=timeout, key=self.api_key)
        return reply["value"]

    monkeypatch.setattr(AnthropicProvider, "complete_structured", complete_structured)
    seen["reply"] = reply
    return seen


def _answer(question="¿Dónde agrego una sala?", actions=None, **config_overrides):
    with override_settings(**ON):
        config = assistant_config.current()
    if config_overrides:
        config = type(config)(**{**config.__dict__, **config_overrides})
    return guide.answer(config=config, question=question, actions=CATALOG if actions is None else actions)


# ─── el servicio ────────────────────────────────────────────────────────────────────────
def test_devuelve_una_accion_del_catalogo_enviado_y_nunca_una_inventada(provider):
    assert _answer() == {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": "Aquí está.",
                         "model": "claude-haiku-5-5", "changes": 0}

    provider["reply"]["value"] = {"accionId": "borrar.todo", "modo": "foco", "mensaje": "Ahí."}
    result = _answer()
    assert result["accionId"] is None and result["mensaje"] == "Ahí."


def test_pregunta_fuera_de_lugar_devuelve_accion_null(provider):
    provider["reply"]["value"] = {"accionId": None, "modo": "foco", "mensaje": "Eso no está en el editor."}

    result = _answer("¿Cuál es la capital de Francia?")

    assert result["accionId"] is None and result["mensaje"] == "Eso no está en el editor."
    assert provider["calls"] == 1


def test_usa_model_fast_con_el_sistema_y_el_esquema_de_la_guia(provider):
    result = _answer(model_fast="claude-haiku-9-9")

    assert provider["model"] == "claude-haiku-9-9" and result["model"] == "claude-haiku-9-9"
    assert provider["system"] == prompts.SYSTEM_GUIDE
    assert provider["schema"] is schema.GUIDE
    assert provider["max_tokens"] == 600 and provider["key"] == KEY
    assert provider["timeout"] == 60  # AI_AUTHORING_TIMEOUT_SECONDS por defecto


def test_el_mensaje_lleva_la_pregunta_y_el_catalogo_y_nada_mas(provider):
    _answer("¿Dónde agrego una sala?")

    (message,) = provider["messages"]
    assert message["role"] == "user"
    assert message == {"role": "user", "content": prompts.guide_message("¿Dónde agrego una sala?", CATALOG)}
    content = message["content"]
    assert "¿Dónde agrego una sala?" in content
    for action in CATALOG:
        assert action["id"] in content and action["nombre"] in content and action["pantalla"] in content


def test_el_esquema_de_la_guia_es_cerrado():
    assert schema.GUIDE["additionalProperties"] is False
    assert set(schema.GUIDE["required"]) == {"accionId", "modo", "mensaje"}
    assert schema.GUIDE["properties"]["modo"]["enum"] == ["resaltar", "foco", "recorrido"]


@pytest.mark.parametrize("modo", ["otro", None, 3, "RESALTAR"])
def test_un_modo_raro_se_vuelve_foco(provider, modo):
    provider["reply"]["value"] = {"accionId": "mapa.agregar-sala", "modo": modo, "mensaje": "Aquí."}

    assert _answer()["modo"] == "foco"


@pytest.mark.parametrize("mensaje", ["", "   ", None, 7, ["x"]])
def test_un_mensaje_malo_se_vuelve_el_texto_fijo(provider, mensaje):
    provider["reply"]["value"] = {"accionId": None, "modo": "foco", "mensaje": mensaje}

    assert _answer()["mensaje"] == FALLBACK


def test_un_mensaje_con_marcador_grafico_se_vuelve_el_texto_fijo(provider):
    provider["reply"]["value"] = {"accionId": "mapa.agregar-sala", "modo": "foco", "mensaje": "Mira el charco de sangre."}

    result = _answer()

    assert result["mensaje"] == FOUND and result["accionId"] == "mapa.agregar-sala"


@pytest.mark.parametrize("mensaje", ["", None, "Hay un charco de sangre."])
def test_con_accion_valida_y_mensaje_inservible_el_texto_es_neutro(provider, mensaje):
    provider["reply"]["value"] = {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": mensaje}

    result = _answer()

    assert result["accionId"] == "mapa.agregar-sala" and result["mensaje"] == FOUND


def test_un_mensaje_largo_se_recorta_en_una_palabra_con_puntos_suspensivos(provider):
    provider["reply"]["value"] = {"accionId": None, "modo": "foco", "mensaje": "palabra " * 80}

    message = _answer()["mensaje"]

    assert len(message) <= 300 and message.endswith("palabra…")


def test_una_respuesta_que_no_es_un_objeto_no_rompe(provider):
    provider["reply"]["value"] = ["no", "soy", "un", "objeto"]

    assert _answer() == {"accionId": None, "modo": "foco", "mensaje": FALLBACK, "model": "claude-haiku-5-5", "changes": 0}


def test_con_el_catalogo_vacio_no_se_llama_al_proveedor(provider):
    result = _answer(actions=[])

    assert provider["calls"] == 0
    assert result == {"accionId": None, "modo": "foco", "mensaje": FALLBACK, "model": "claude-haiku-5-5", "changes": 0}


def test_sin_key_es_error_del_proveedor_sin_llamar_a_la_red(provider):
    with pytest.raises(ProviderError) as error:
        _answer(api_key="")

    assert error.value.kind == "http" and provider["calls"] == 0


# ─── la ruta ────────────────────────────────────────────────────────────────────────────
def _post(client, cv, body):
    return client.post(f"{AUTHORING}/{cv}/assistant/guide", body, format="json")


@override_settings(**ON)
def test_la_ruta_responde_el_sobre_audita_sin_texto_y_no_filtra_la_key(prof, cv, provider):
    response = _post(cl(prof), cv, {"pregunta": "PREGUNTA-SECRETA dónde agrego una sala", "acciones": CATALOG})

    assert response.status_code == 200, response.data
    assert response.data["data"] == {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": "Aquí está.",
                                     "model": "claude-haiku-5-5", "changes": 0}
    assert KEY not in response.content.decode()
    row = AuditLog.objects.get(action="AI_AUTHORING_GUIDE")
    context = json.loads(row.context_json)
    assert context["model"] == "claude-haiku-5-5" and context["changes"] == 0 and context["outcome"] == "ok"
    assert "PREGUNTA-SECRETA" not in row.context_json and "Aquí está." not in row.context_json
    assert "mapa.agregar-sala" not in row.context_json


@pytest.mark.parametrize("body", [
    {"pregunta": "", "acciones": []},
    {"pregunta": "x" * 501, "acciones": []},
    {"pregunta": "x", "acciones": [{"id": "a", "nombre": "A"}]},
    {"pregunta": "x", "acciones": [{"id": "", "nombre": "A", "pantalla": "p"}]},
    {"pregunta": "x", "acciones": [{"id": "con espacio", "nombre": "A", "pantalla": "p"}]},
    {"pregunta": "x", "acciones": [{"id": "a" * 81, "nombre": "A", "pantalla": "p"}]},
    {"pregunta": "x", "acciones": [{"id": "a", "nombre": "A" * 121, "pantalla": "p"}]},
    {"pregunta": "x", "acciones": [{"id": "a", "nombre": "A", "pantalla": "p" * 65}]},
    {"pregunta": "x", "acciones": [{"id": 5, "nombre": "A", "pantalla": "p"}]},
    {"pregunta": "x", "acciones": ["texto"]},
    {"pregunta": "x", "acciones": [{"id": f"a{i}", "nombre": "A", "pantalla": "p"} for i in range(61)]},
])
@override_settings(**ON)
def test_un_cuerpo_mal_formado_es_400_antes_del_cupo(prof, cv, provider, body):
    response = _post(cl(prof), cv, body)

    assert response.status_code == 400
    assert provider["calls"] == 0 and not AuthoringAssistantUsage.objects.exists()


@override_settings(**ON)
def test_sesenta_acciones_es_el_tope_que_si_pasa(prof, cv, provider):
    actions = [{"id": f"a.{i}", "nombre": "A", "pantalla": "p"} for i in range(60)]

    assert _post(cl(prof), cv, {"pregunta": "x", "acciones": actions}).status_code == 200
