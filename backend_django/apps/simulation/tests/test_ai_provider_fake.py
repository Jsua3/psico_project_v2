"""C1-2 · El proveedor falso: respuestas fijas para la generación por etapas, sin red, y solo fuera de producción."""
import json
import re
from pathlib import Path

import pytest
from django.test import override_settings

from apps.biblioteca.services import copiar_al_caso
from apps.simulation.casedef import conditions, vocabulary
from apps.simulation.services import ai_providers
from apps.simulation.services.ai_providers import PROVIDERS, AnthropicProvider, FakeProvider, ProviderError
from apps.simulation.services.authoring.assistant import config
from apps.simulation.services.authoring.assistant.schema import PROPOSAL
from apps.simulation.services.authoring.generation import prompts
from apps.simulation.services.authoring.generation.schema import SCENE, SKELETON

CONTEXTO = {"lugar": {"id": "universidad"}}
SALAS_ESPERADAS = ["aula", "bienestar", "sala-espera", "consultorio"]
COMPETENCIAS = {"PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION", "ANALISIS_ARGUMENTACION"}
LUGAR = Path(__file__).resolve().parents[4] / "biblioteca" / "escenarios" / "universidad" / "escenario.json"


@pytest.fixture
def falso():
    return FakeProvider("", "fake")


@pytest.fixture(scope="module")
def lugar():
    return json.loads(LUGAR.read_text(encoding="utf-8"))


def _esqueleto(falso, descripcion="Un caso de prueba."):
    return falso.complete_structured(
        prompts.SYSTEM_GENERATE, prompts.skeleton_messages(CONTEXTO, descripcion), SKELETON, "fake"
    )


def _escena(falso, esqueleto, clave, reparar=None):
    return falso.complete_structured(
        prompts.SYSTEM_GENERATE, prompts.scene_messages(CONTEXTO, esqueleto, clave, reparar), SCENE, "fake"
    )


def _conforma(valor, esquema, ruta="raiz"):
    """Validador mínimo del subconjunto de JSON Schema que usan SKELETON y SCENE."""
    tipo = esquema["type"]
    if tipo == "object":
        assert isinstance(valor, dict), ruta
        assert set(valor) == set(esquema["properties"]), f"{ruta}: claves {sorted(valor)}"
        for nombre, sub in esquema["properties"].items():
            _conforma(valor[nombre], sub, f"{ruta}.{nombre}")
    elif tipo == "array":
        assert isinstance(valor, list), ruta
        for i, item in enumerate(valor):
            _conforma(item, esquema["items"], f"{ruta}[{i}]")
    elif tipo == "string":
        assert isinstance(valor, str), ruta
        if "enum" in esquema:
            assert valor in esquema["enum"], f"{ruta}: {valor!r}"
    elif tipo == "integer":
        assert isinstance(valor, int) and not isinstance(valor, bool) and valor in esquema["enum"], ruta
    elif tipo == "boolean":
        assert isinstance(valor, bool), ruta


def _claves(lugar, sala_id):
    return copiar_al_caso.claves_de_sala(next(s for s in lugar["salas"] if s["id"] == sala_id))


def test_el_falso_esta_registrado_y_hereda_el_contrato_de_anthropic():
    assert PROVIDERS["fake"] is FakeProvider
    assert issubclass(FakeProvider, AnthropicProvider)


def test_el_esqueleto_del_falso_es_un_caso_de_cuatro_salas_distintas(falso, lugar):
    esqueleto = _esqueleto(falso)

    _conforma(esqueleto, SKELETON)
    assert [e["sala"] for e in esqueleto["escenas"]] == SALAS_ESPERADAS
    assert esqueleto["escenas"][-1]["final"] is True and esqueleto["escenas"][-1]["siguientes"] == []
    assert sum(1 for e in esqueleto["escenas"] if len(e["siguientes"]) == 2) == 1
    for escena in esqueleto["escenas"]:
        assert escena["persona"] in _claves(lugar, escena["sala"])["personajes"]
        assert (escena["intensidad"] != "HIGH") or escena["advertencia"]
    assert set(esqueleto["hitos"]) <= {copiar_al_caso.clave_de_hito(h["key"]) for h in lugar["hitos"]}
    finales = esqueleto["finales"]
    assert 2 <= len(finales) <= 4 and finales[-1]["cuando"] == ""
    assert len({f["clave"] for f in finales}) == len(finales)
    for final in finales:
        assert re.fullmatch(r"[A-Za-z0-9_]+", final["clave"])  # case_rules.NAME: sin guiones
        if final["cuando"]:
            condicion = json.loads(final["cuando"])
            assert conditions.is_valid(condicion, facts=False)
            hitos = [m for m in _hitos_de(condicion)]
            assert set(hitos) <= set(esqueleto["hitos"])


def _hitos_de(condicion):
    if isinstance(condicion, dict):
        for clave, valor in condicion.items():
            if clave == "milestone":
                yield valor
            else:
                yield from _hitos_de(valor)
    elif isinstance(condicion, list):
        for item in condicion:
            yield from _hitos_de(item)


def test_cada_escena_del_falso_cumple_las_reglas_de_una_escena(falso, lugar):
    esqueleto = _esqueleto(falso)
    requisitos, comentarios, pistas = [], [], 0

    for sala_esq in esqueleto["escenas"]:
        claves = _claves(lugar, sala_esq["sala"])
        escena = _escena(falso, esqueleto, sala_esq["sala"])
        _conforma(escena, SCENE)
        assert 1 <= len(escena["lineas"]) <= 8
        assert all(linea["personaje"] in claves["personajes"] for linea in escena["lineas"])
        if sala_esq["final"]:
            assert escena["opciones"] == []
        else:
            opciones = escena["opciones"]
            assert 3 <= len(opciones) <= 4
            assert {o["destino"] for o in opciones} == set(sala_esq["siguientes"])
            clases = [o["clase"] for o in opciones]
            assert "RECOMMENDED" in clases and any(c != "RECOMMENDED" for c in clases)
            assert any(o["requiere"] == "" for o in opciones)
            assert len({o["clave"] for o in opciones}) == len(opciones)
            for o in opciones:
                assert re.fullmatch(r"[a-z0-9-]{1,40}", o["clave"])
                assert bool(o["razonProhibicion"]) == (o["clase"] == "CONTRAINDICATED")
                assert o["retroalimentacion"]
                assert set(o["hitos"]) <= set(esqueleto["hitos"])
                assert set(o["competencias"]) <= COMPETENCIAS
                assert o["reaccionGesto"] in ("", *vocabulary.GESTURES)
        textos = [o["requiere"] for o in escena["opciones"]] + [c["cuando"] for c in escena["comentarios"]]
        for texto in filter(None, textos):
            requisito = json.loads(texto)
            assert conditions.is_valid(requisito, facts=True)
            for tipo, clave in conditions.facts_in(requisito):
                assert clave in {"talked": claves["personajes"], "inspected": claves["objetos"]}[tipo]
                requisitos.append(tipo)
        for c in escena["comentarios"]:
            assert c["personaje"] in claves["personajes"]
            assert c["gesto"] in ("", *vocabulary.GESTURES)
        comentarios += escena["comentarios"]
        pistas += len(escena["pistas"])

    assert "talked" in requisitos and "inspected" in requisitos
    assert any(c["cuando"] == "" for c in comentarios)
    assert any("inspected" in c["cuando"] for c in comentarios)
    assert pistas == 3


def test_el_falso_con_el_esquema_del_asistente_da_la_propuesta_vacia(falso):
    propuesta = falso.complete_structured("s", [{"role": "user", "content": "hola"}], PROPOSAL, "fake")

    assert isinstance(propuesta, dict)
    assert set(propuesta) == set(PROPOSAL["properties"])


@pytest.mark.parametrize("marca, kind", [
    ("[falso:timeout]", "timeout"), ("[falso:http]", "http"),
    ("[falso:malformed]", "malformed"), ("[falso:refusal]", "refusal"),
])
def test_el_falso_lanza_cada_kind_con_su_marca(falso, marca, kind):
    with pytest.raises(ProviderError) as info:
        _esqueleto(falso, f"Un caso {marca} de prueba.")

    assert info.value.kind == kind


def test_el_falso_con_reparar_da_la_variante_solo_la_primera_vez(falso):
    esqueleto = _esqueleto(falso, "Un caso [falso:reparar] de prueba.")
    primera, otra = esqueleto["escenas"][0]["sala"], esqueleto["escenas"][1]["sala"]
    buena = _escena(falso, _esqueleto(falso), primera)

    defectuosa = _escena(falso, esqueleto, primera)
    reparada = _escena(falso, esqueleto, primera, reparar={"anterior": defectuosa, "faltas": ["falta fija"]})

    assert defectuosa != buena
    assert set(defectuosa) == set(SCENE["properties"])
    # la falta es una ruta ``file:`` pegada en la narración: ``checks.py`` no la ve; solo el ensamblado (DSL.TEXT_LINK, en
    # ``x-siep.escenas[i].descripcion``) la señala, y es editorial (no bloquea la importación)
    assert "file:" in defectuosa["narracion"] and "file:" not in buena["narracion"]
    gestos = [c["gesto"] for c in defectuosa["comentarios"]] + [o["reaccionGesto"] for o in defectuosa["opciones"]]
    assert all(g in ("", *vocabulary.GESTURES) for g in gestos)
    assert reparada == buena
    # solo la primera escena tiene variante; sin la marca no hay variante nunca
    assert _escena(falso, esqueleto, otra) == _escena(falso, _esqueleto(falso), otra)


def test_el_falso_no_guarda_estado_entre_llamadas(falso):
    esqueleto = _esqueleto(falso, "Un caso [falso:reparar] de prueba.")
    primera = esqueleto["escenas"][0]["sala"]

    assert _escena(falso, esqueleto, primera) == _escena(falso, esqueleto, primera)


def test_el_falso_con_etapa_o_lugar_sin_archivo_es_malformed(falso):
    esqueleto = _esqueleto(falso)
    with pytest.raises(ProviderError) as info:
        _escena(falso, esqueleto, "cafeteria")
    assert info.value.kind == "malformed"

    with pytest.raises(ProviderError) as info:
        falso.complete_structured("s", prompts.skeleton_messages({"lugar": {"id": "hospital"}}, "x"), SKELETON, "fake")
    assert info.value.kind == "malformed"

    sin_etapa = [{"role": "user", "content": [{"type": "text", "text": "Etapa: nada\nLugar: universidad"}]}]
    with pytest.raises(ProviderError) as info:
        falso.complete_structured("s", sin_etapa, SKELETON, "fake")
    assert info.value.kind == "malformed"


def test_el_falso_no_deja_salir_de_su_carpeta_con_un_lugar_o_una_clave_raros(falso):
    for lugar_id, etapa in (("../..", "esqueleto"), ("universidad", "escena ../esqueleto"), ("universidad", "escena aula/..")):
        texto = f"Etapa: {etapa}\nLugar: {lugar_id}"
        with pytest.raises(ProviderError) as info:
            falso.complete_structured("s", [{"role": "user", "content": [{"type": "text", "text": texto}]}], SCENE, "fake")
        assert info.value.kind == "malformed"


def test_el_falso_llena_meta(falso):
    meta = {}
    falso.complete_structured("s", prompts.skeleton_messages(CONTEXTO, "x"), SKELETON, "fake", meta=meta)

    assert meta == {
        "model": "fake", "fallback": False,
        "usage": {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0},
    }


def test_el_falso_no_llama_a_la_red(monkeypatch, falso):
    def no_debe_llamar(*args, **kwargs):
        raise AssertionError("el proveedor falso tocó la red")

    monkeypatch.setattr(ai_providers, "post_json", no_debe_llamar)

    esqueleto = _esqueleto(falso)
    _escena(falso, esqueleto, "aula")
    falso.complete_structured("s", [{"role": "user", "content": "x"}], PROPOSAL, "fake")


def test_produccion_rechaza_el_proveedor_falso(monkeypatch):
    from django.core.exceptions import ImproperlyConfigured

    from shared.tests.test_production_settings import _production, _restore_base_settings  # noqa: F401

    for variable in ("AI_AUTHORING_PROVIDER", "AI_ASSISTANT_PROVIDER"):
        monkeypatch.delenv("AI_AUTHORING_PROVIDER", raising=False)
        monkeypatch.delenv("AI_ASSISTANT_PROVIDER", raising=False)
        with pytest.raises(ImproperlyConfigured) as info:
            _production(monkeypatch, **{variable: "fake"})
        assert variable in str(info.value) and "fake" in str(info.value)
    monkeypatch.delenv("AI_ASSISTANT_PROVIDER", raising=False)
    assert _production(monkeypatch, AI_AUTHORING_PROVIDER="anthropic")["AI_AUTHORING_PROVIDER"] == "anthropic"


def test_generation_ready():
    with override_settings(AI_AUTHORING_ENABLED=False, AI_AUTHORING_PROVIDER="anthropic", AI_AUTHORING_API_KEY="k"):
        assert config.current().generation_ready is False
    with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_PROVIDER="anthropic", AI_AUTHORING_API_KEY=""):
        assert config.current().generation_ready is False
    with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_PROVIDER="anthropic", AI_AUTHORING_API_KEY="k"):
        assert config.current().generation_ready is True
    with override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_PROVIDER="fake", AI_AUTHORING_API_KEY=""):
        assert config.current().generation_ready is True
    with override_settings(AI_AUTHORING_ENABLED=False, AI_AUTHORING_PROVIDER="fake", AI_AUTHORING_API_KEY=""):
        assert config.current().generation_ready is False


def test_la_configuracion_de_generacion_trae_los_valores_medidos():
    cfg = config.current()

    assert cfg.model_generate == "claude-fable-5-2"
    assert cfg.generate_timeout_seconds == 100
    assert cfg.generations_per_day == 5
    assert cfg.generation_max_calls == 20
    assert cfg.generate_max_tokens == 16000
    assert cfg.generate_effort_skeleton == "high"
    assert cfg.generate_effort_scene == "medium"
    assert cfg.generate_fallbacks == "default"


def test_la_configuracion_de_generacion_se_lee_de_los_settings():
    with override_settings(
        AI_AUTHORING_MODEL_GENERATE="m", AI_AUTHORING_GENERATE_TIMEOUT_SECONDS=11, AI_AUTHORING_GENERATIONS_PER_DAY=2,
        AI_AUTHORING_GENERATION_MAX_CALLS=3, AI_AUTHORING_GENERATE_MAX_TOKENS=4,
        AI_AUTHORING_GENERATE_EFFORT_SKELETON="low", AI_AUTHORING_GENERATE_EFFORT_SCENE="max",
        AI_AUTHORING_GENERATE_FALLBACKS="",
    ):
        cfg = config.current()

    assert (cfg.model_generate, cfg.generate_timeout_seconds, cfg.generations_per_day) == ("m", 11, 2)
    assert (cfg.generation_max_calls, cfg.generate_max_tokens) == (3, 4)
    assert (cfg.generate_effort_skeleton, cfg.generate_effort_scene, cfg.generate_fallbacks) == ("low", "max", "")
