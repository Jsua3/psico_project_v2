"""P5 · Tarea 3 · Las propuestas del asistente de autoría: contexto, esquema y validación contra el caso.

El proveedor es simulado (``AnthropicProvider.complete_structured`` reemplazado): jamás hay red. Se prueba que
(1) el contexto no lleva datos de intentos ni de cuentas, (2) el esquema que viaja al proveedor es cerrado,
(3) la validación es atómica y revisa cada referencia contra ESTA versión del caso, y (4) las seis peticiones
difíciles del fixture: lo gráfico no pasa nunca y lo revictimizante solo sale como CONTRAINDICATED con su razón.
"""
import json
from pathlib import Path

import jsonschema
import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseVersion
from apps.simulation.services.ai_providers import AnthropicProvider, ProviderError
from apps.simulation.services.authoring.assistant import config as assistant_config
from apps.simulation.services.authoring.assistant import context, limits, prompts, proposals, schema

User = get_user_model()
BASE = "/api/admin/cases"
AUTHORING = "/api/authoring/cases"
FIXTURE = Path(__file__).parent / "fixtures" / "assistant" / "peticiones_dificiles.json"
KEY = "sk-ant-clave-de-prueba-0123456789"
ON = dict(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY=KEY, AI_AUTHORING_DAILY_LIMIT_PER_USER=5,
          AI_AUTHORING_MONTHLY_LIMIT=100)
INVALID_MESSAGE = "La propuesta no se pudo usar. Pídela de nuevo con otras palabras."

# La lista negra vive aquí (no se importa de los modelos): ninguna clave del contexto puede contener estas palabras.
BLACKLIST = ("attempt", "student", "user", "email", "password", "ip", "user_agent", "audit", "session",
             "created_by", "createdby", "actor")


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(email="prop_admin@x.com", password="x", nombre="Ad", apellido="Pr", role="ADMIN")


@pytest.fixture
def api(admin):
    return cl(admin)


@pytest.fixture
def seeded_draft(api):
    """Un borrador clonado del caso sembrado: trae escenas, mapas, personajes, hitos y opciones."""
    published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id
    response = api.post(f"{BASE}/{published}/clone-version")
    assert response.status_code == 200, response.data
    return response.data["data"]["caseVersionId"]


@pytest.fixture
def version(seeded_draft):
    return CaseVersion.objects.get(pk=seeded_draft)


@pytest.fixture
def editor(api, seeded_draft):
    return api.get(f"{BASE}/{seeded_draft}/editor").data["data"]


@pytest.fixture
def ids(editor):
    """Los ids reales del borrador, para armar propuestas."""
    persons = [o for o in editor["objects"] if o["type"] == "PERSON"]
    scene_map = editor["maps"][0]
    decision = next(d for d in editor["decisions"] if d["responseClass"] != "CONTRAINDICATED")
    return {
        "node": editor["nodes"][0]["id"],
        "map": scene_map["id"],
        "object": (persons or editor["objects"])[0]["id"],
        "character": editor["characters"][0]["id"],
        "decision": decision["id"],
        "milestone": editor["rules"]["milestones"][0]["key"],
    }


@pytest.fixture
def foreign_character(api):
    """El id de un personaje de OTRO caso."""
    other = api.post(BASE, {"title": "Otro caso con otro personaje"}, format="json").data["data"]["caseVersionId"]
    response = api.post(f"{BASE}/{other}/characters", {"characterKey": "ajeno", "displayName": "Ajena"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]["characters"][-1]["id"]


@pytest.fixture
def foreign(api):
    """Las filas reales de OTRO caso (nodo, sala, objeto, opción y personaje): ids que existen, pero no en este caso."""
    other = api.post(BASE, {"title": "Otro caso con sus propias filas"}, format="json").data["data"]["caseVersionId"]

    def post(path, body):
        response = api.post(f"{BASE}/{other}/{path}", body, format="json")
        assert response.status_code == 200, response.data
        return response.data["data"]

    node = post("nodes", {"nodeKey": "ajeno", "title": "Escena ajena", "narrative": "x"})["nodes"][-1]["id"]
    scene_map = post("maps", {"mapKey": "sala_ajena", "title": "Sala ajena", "nodeId": node})["maps"][-1]["id"]
    obj = post(f"maps/{scene_map}/objects", {"objectKey": "mesa_ajena", "label": "Mesa", "objectType": "PROP"})["objects"][-1]["id"]
    decision = post("decisions", {"sourceNodeId": node, "targetNodeId": node, "text": "Respuesta ajena",
                                  "responseClass": "ACCEPTABLE"})["decisions"][-1]["id"]
    character = post("characters", {"characterKey": "ajena", "displayName": "Ajena"})["characters"][-1]["id"]
    return {"node": node, "map": scene_map, "object": obj, "decision": decision, "character": character}


def _scene(**extra):
    return {"op": "add-scene", "id": "nueva-1", "title": "Una conversación tranquila", "narrative": "Se sientan a hablar.",
            "intensity": "MEDIUM", "warningMessage": "", "afterNodeId": None, **extra}


def _line(node, character, **extra):
    return {"op": "add-line", "nodeId": node, "characterId": character, "text": "No sé por dónde empezar.",
            "expression": "preocupada", **extra}


def _response(node, **extra):
    return {"op": "add-response", "nodeId": node, "text": "Tómate el tiempo que necesites.", "responseClass": "RECOMMENDED",
            "feedbackText": "Da seguridad y no presiona.", "prohibitionReason": "", "targetNodeId": node, **extra}


def _ending(**extra):
    return {"op": "add-ending", "key": "final_nuevo", "title": "Un final", "message": "La persona se siente acompañada.",
            "tone": "positive", "when": None, **extra}


def _raw(*changes, message="Te propongo esto."):
    return {"message": message, "changes": list(changes)}


def _invalid(version, raw):
    with pytest.raises(proposals.InvalidProposal) as caught:
        proposals.validate(version, raw)
    assert str(caught.value) and proposals.is_fixed_motivo(str(caught.value)), str(caught.value)
    return caught.value


# ─── contexto ───────────────────────────────────────────────────────────────────────────
def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield str(key)
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


def test_el_contexto_no_contiene_campos_de_intentos_ni_usuarios(version):
    built = context.build(version, "editor-mapa", None)

    keys = list(_keys(built))
    assert keys
    for key in keys:
        for banned in BLACKLIST:
            assert banned not in key.lower(), f"la clave «{key}» contiene «{banned}»"
    json.dumps(built)  # serializable tal cual


def test_el_contexto_lleva_escenas_lineas_respuestas_salas_personajes_hitos_y_finales(version, editor):
    built = context.build(version, "editor-mapa", "objeto 3")

    assert built["screen"] == "editor-mapa" and built["selection"] == "objeto 3"
    assert {n["id"] for n in built["nodes"]} == {n["id"] for n in editor["nodes"]}
    assert {"id", "title", "text", "order", "intensity"} <= set(built["nodes"][0])
    decision = built["decisions"][0]
    assert {"id", "nodeId", "text", "responseClass", "effects", "feedback", "nextNodeId"} <= set(decision)
    assert {m["id"] for m in built["maps"]} == {m["id"] for m in editor["maps"]}
    assert {o["id"] for o in built["objects"]} == {o["id"] for o in editor["objects"]}
    assert {c["id"] for c in built["characters"]} == {c["id"] for c in editor["characters"]}
    assert [m["key"] for m in built["milestones"]] == [m["key"] for m in editor["rules"]["milestones"]]
    assert built["endings"] == [dict(e) for e in editor["rules"]["endings"]]
    assert "riskLevel" in built
    if built["dialogues"]:
        assert {"dialogueId", "mapId", "characterId", "text", "expression"} <= set(built["dialogues"][0])


def test_la_seleccion_larga_se_recorta_a_200(version):
    assert len(context.build(version, "p", "x" * 900)["selection"]) == 200
    assert context.build(version, "p", None)["selection"] is None


# ─── esquema ────────────────────────────────────────────────────────────────────────────
def _walk(node):
    yield node
    if isinstance(node, dict):
        for inner in node.values():
            yield from _walk(inner)
    elif isinstance(node, list):
        for inner in node:
            yield from _walk(inner)


def test_el_esquema_es_cerrado_sin_recursion_ni_limites_y_cubre_las_diez_operaciones():
    jsonschema.Draft202012Validator.check_schema(schema.PROPOSAL)
    for node in _walk(schema.PROPOSAL):
        if isinstance(node, dict) and node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert sorted(node["required"]) == sorted(node["properties"])
        if isinstance(node, dict):
            assert not {"$ref", "$defs", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"} & set(node)
    ops = {variant["properties"]["op"]["enum"][0] for variant in schema.PROPOSAL["properties"]["changes"]["items"]["anyOf"]}
    assert ops == {"add-scene", "add-line", "add-response", "place-character", "move", "add-ending",
                   "set-response-class", "set-persona-effect", "mark-milestone", "set-intensity"}


def test_los_vocabularios_del_esquema_son_los_cerrados():
    text = json.dumps(schema.PROPOSAL)
    for word in ("RECOMMENDED", "ACCEPTABLE", "RISKY", "CONTRAINDICATED", "neutral", "alegre", "preocupada", "triste",
                 "cautelosa", "en-crisis", "LOW", "MEDIUM", "HIGH"):
        assert f'"{word}"' in text
    assert set(schema.EXPRESSIONS) == {"neutral", "alegre", "preocupada", "triste", "cautelosa", "en-crisis"}


# ─── validación: lo bueno ───────────────────────────────────────────────────────────────
def test_una_propuesta_valida_conserva_el_orden_y_marca_ai_suggested(version, ids):
    when = {"kind": "all", "items": [
        {"kind": "milestone", "milestone": ids["milestone"]},
        {"kind": "count", "responseClass": "CONTRAINDICATED", "comparator": "gte", "value": 1},
        {"kind": "persona", "bond": "OPEN", "activation": None},
    ]}
    raw = _raw(
        _scene(afterNodeId=ids["node"]),
        _line("nueva-1", ids["character"]),
        _response(ids["node"], targetNodeId="nueva-1"),
        _response(ids["node"], text="Cuéntame con calma.", responseClass="CONTRAINDICATED",
                  prohibitionReason="Presiona a la persona.", targetNodeId=ids["node"]),
        {"op": "place-character", "mapId": ids["map"], "characterId": ids["character"], "x": 10, "y": 10,
         "expression": "cautelosa"},
        {"op": "move", "objectId": ids["object"], "x": 12, "y": 14},
        _ending(when=when),
        {"op": "set-response-class", "decisionId": ids["decision"], "responseClass": "RISKY", "prohibitionReason": ""},
        {"op": "set-persona-effect", "decisionId": ids["decision"], "bond": -1, "activation": None},
        {"op": "mark-milestone", "decisionId": ids["decision"], "milestoneKey": ids["milestone"]},
        {"op": "set-intensity", "nodeId": "nueva-1", "intensity": "LOW", "warningMessage": ""},
        message="Agrego una escena nueva.",
    )

    proposal = proposals.validate(version, raw)

    assert proposal.message == "Agrego una escena nueva."
    assert [c["op"] for c in proposal.changes] == [c["op"] for c in raw["changes"]]
    assert all(c["aiSuggested"] is True for c in proposal.changes)
    ending = proposal.changes[6]
    assert ending["when"] == {"all": [{"milestone": ids["milestone"]},
                                       {"count": "contraindicated", "gte": 1},
                                       {"persona": {"bond": "OPEN"}}]}
    assert "aiSuggested" not in raw["changes"][0]  # la entrada no se muta


def test_validate_deja_el_modelo_vacio(version):
    assert proposals.validate(version, _raw()).model == ""


def test_sin_cambios_es_valida_cuando_solo_se_explica(version):
    assert proposals.validate(version, _raw(message="Tu caso ya tiene salida.")).changes == []


# ─── validación: lo malo ────────────────────────────────────────────────────────────────
def test_una_propuesta_con_escena_inexistente_es_invalid_proposal(version, ids):
    _invalid(version, _raw(_line(987654321, ids["character"])))
    _invalid(version, _raw(_response(ids["node"], targetNodeId=987654321)))
    _invalid(version, _raw({"op": "set-intensity", "nodeId": 987654321, "intensity": "LOW", "warningMessage": ""}))


def test_un_id_temporal_se_declara_antes_de_usarse_y_no_se_repite(version, ids):
    _invalid(version, _raw(_line("nueva-1", ids["character"]), _scene()))
    _invalid(version, _raw(_scene(), _scene()))
    _invalid(version, _raw(_scene(id="otra")))
    _invalid(version, _raw(_scene(afterNodeId="nueva-1")))


def test_ids_reales_de_otro_caso_son_invalid_proposal(version, ids, foreign):
    """Existen en la base, pero no en ESTA versión: cada operación los rechaza."""
    for other in (foreign["node"], foreign["map"], foreign["object"], foreign["decision"]):
        assert other not in (ids["node"], ids["map"], ids["object"], ids["decision"])
    _invalid(version, _raw(_line(foreign["node"], ids["character"])))
    _invalid(version, _raw(_response(foreign["node"])))
    _invalid(version, _raw(_response(ids["node"], targetNodeId=foreign["node"])))
    _invalid(version, _raw(_scene(afterNodeId=foreign["node"])))
    _invalid(version, _raw({"op": "place-character", "mapId": foreign["map"], "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "place-character", "mapId": ids["map"], "characterId": foreign["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "move", "objectId": foreign["object"], "x": 1, "y": 1}))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": foreign["decision"], "responseClass": "RISKY",
                            "prohibitionReason": ""}))
    _invalid(version, _raw({"op": "set-persona-effect", "decisionId": foreign["decision"], "bond": 1, "activation": None}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": foreign["decision"], "milestoneKey": ids["milestone"]}))
    _invalid(version, _raw({"op": "set-intensity", "nodeId": foreign["node"], "intensity": "LOW", "warningMessage": ""}))


@pytest.mark.parametrize("bad", ["NEUTRAL", "feliz", "", None, 3])
def test_una_clase_fuera_de_las_cuatro_es_invalid_proposal(version, ids, bad):
    _invalid(version, _raw(_response(ids["node"], responseClass=bad)))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["decision"], "responseClass": bad,
                            "prohibitionReason": ""}))


@pytest.mark.parametrize("bad", ["furiosa", "", None, "Neutral"])
def test_una_expresion_fuera_de_las_seis_es_invalid_proposal(version, ids, bad):
    _invalid(version, _raw(_line(ids["node"], ids["character"], expression=bad)))
    _invalid(version, _raw({"op": "place-character", "mapId": ids["map"], "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": bad}))


@pytest.mark.parametrize("when", [
    {"kind": "metric", "metric": "confianza"},
    {"kind": "flag", "flag": "pap_aplicado"},
    {"metric": "confianza", "gte": 60},
    {"kind": "milestone", "milestone": "hito_que_el_caso_no_declara"},
    {"kind": "count", "responseClass": "CRITICAL", "comparator": "gte", "value": 1},
    {"kind": "count", "responseClass": "RISKY", "comparator": "mayor", "value": 1},
    {"kind": "persona", "bond": "FELIZ", "activation": None},
    {"kind": "persona", "bond": None, "activation": None},
    {"kind": "all", "items": []},
    {"kind": "not", "item": {"kind": "all", "items": []}},
    "siempre",
])
def test_add_ending_con_condicion_fuera_del_vocabulario_es_invalid_proposal(version, when):
    _invalid(version, _raw(_ending(when=when)))


def test_add_ending_exige_clave_unica_y_el_tope_de_finales(version, editor):
    _invalid(version, _raw(_ending(key="dos"), _ending(key="dos")))
    _invalid(version, _raw(_ending(key="con espacios")))
    if editor["rules"]["endings"]:
        _invalid(version, _raw(_ending(key=editor["rules"]["endings"][0]["key"])))


def test_las_referencias_se_revisan_contra_esta_version(version, ids, foreign_character):
    _invalid(version, _raw({"op": "place-character", "mapId": ids["map"], "characterId": foreign_character, "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "place-character", "mapId": 987654321, "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "move", "objectId": 987654321, "x": 1, "y": 1}))
    _invalid(version, _raw({"op": "move", "objectId": ids["object"], "x": -5, "y": 1}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": ids["decision"], "milestoneKey": "inventado"}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": 987654321, "milestoneKey": ids["milestone"]}))
    _invalid(version, _raw(_line(ids["node"], foreign_character)))


@pytest.mark.parametrize("persona", [(2, None), (None, -2), (None, None), ("1", None), (True, None), (0.5, None)])
def test_set_persona_effect_respeta_el_rango_de_los_efectos(version, ids, persona):
    _invalid(version, _raw({"op": "set-persona-effect", "decisionId": ids["decision"], "bond": persona[0],
                            "activation": persona[1]}))


def test_una_contraindicada_sin_razon_es_invalid_proposal(version, ids):
    _invalid(version, _raw(_response(ids["node"], responseClass="CONTRAINDICATED", prohibitionReason="  ")))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["decision"], "responseClass": "CONTRAINDICATED",
                            "prohibitionReason": ""}))
    _invalid(version, _raw(_response(ids["node"], responseClass="RISKY", prohibitionReason="No debía traer razón.")))


def test_mas_de_doce_cambios_es_invalid_proposal(version, ids):
    moves = [{"op": "move", "objectId": ids["object"], "x": 1, "y": 1}] * 12
    assert len(proposals.validate(version, _raw(*moves)).changes) == 12
    _invalid(version, _raw(*moves, moves[0]))


def test_la_validacion_es_atomica_un_cambio_malo_tumba_la_lista(version, ids):
    good = {"op": "move", "objectId": ids["object"], "x": 1, "y": 1}
    _invalid(version, _raw(good, good, {"op": "move", "objectId": 987654321, "x": 1, "y": 1}, good))


@pytest.mark.parametrize("raw", [None, [], "x", {}, {"message": "a"}, {"changes": []}, {"message": 3, "changes": []},
                                 {"message": "a", "changes": "no"}, {"message": "a", "changes": [3]},
                                 {"message": "a", "changes": [{"op": "borrar-todo"}]},
                                 {"message": "a", "changes": [], "extra": 1}])
def test_una_forma_rota_es_invalid_proposal(version, raw):
    _invalid(version, raw)


def test_un_campo_de_mas_o_de_menos_en_un_cambio_es_invalid_proposal(version, ids):
    move = {"op": "move", "objectId": ids["object"], "x": 1, "y": 1}
    _invalid(version, _raw({**move, "borrar": True}))
    _invalid(version, _raw({"op": "move", "objectId": ids["object"], "x": 1}))
    _invalid(version, _raw({**move, "x": 1.5}))
    _invalid(version, _raw({**move, "x": True}))


# ─── filtro de contenido ────────────────────────────────────────────────────────────────
def test_check_text_normaliza_acentos_y_mayusculas():
    assert prompts.check_text("Él describió cómo la golpeó, con SANGRE a borbotones.")
    assert prompts.check_text("Todo va bien, hablemos con calma.") is None
    assert prompts.check_text("¿Por qué no denunciaste antes?") is not None
    assert prompts.check_text("¿Por qué no denunciaste antes?", allow_revictimizing=True) is None
    assert prompts.check_text("sangre a borbotones", allow_revictimizing=True) is not None


def test_vuelve_con_el_grupo_no_es_revictimizante_pero_vuelve_con_el_agresor_si(version, ids):
    ok = proposals.validate(version, _raw(_response(ids["node"], text="Vuelve con el grupo cuando te sientas lista.")))
    assert ok.changes[0]["responseClass"] == "RECOMMENDED"
    for innocent in ("Vuelve con el médico mañana.", "Vuelve con el docente si lo necesitas."):
        assert prompts.check_text(innocent) is None
    for harmful in ("Vuelve con el agresor.", "Mejor vuelve con tu pareja.", "Regresa con el agresor, es lo mejor."):
        assert prompts.check_text(harmful) == prompts.REVICTIMIZING_REASON


def test_los_caracteres_invisibles_no_burlan_el_filtro():
    assert prompts.check_text("había san\u200bgre a borbotones") == prompts.GRAPHIC_REASON
    assert prompts.check_text("sangre\u00ad a borbotones") == prompts.GRAPHIC_REASON
    assert prompts.check_text("¿por qué no\u2060 denunciaste?") == prompts.REVICTIMIZING_REASON


def test_el_prompt_de_sistema_no_supone_genero_de_quien_escribe():
    assert "programadora" not in prompts.SYSTEM_AUTHORING


def test_todo_motivo_literal_del_validador_esta_en_la_lista_de_motivos_fijos():
    import re

    source = Path(proposals.__file__).read_text(encoding="utf-8")
    literals = re.findall(r'self\.fail\("([^"{]+)"\)', source)
    assert len(literals) >= 15
    for literal in literals:
        assert literal in proposals.FIXED_MOTIVOS, literal


def test_las_listas_de_marcadores_estan_normalizadas_y_son_suficientes():
    for markers in (prompts.GRAPHIC_MARKERS, prompts.REVICTIMIZING_MARKERS):
        assert len(markers) >= 14
        for marker in markers:
            assert marker == prompts.normalize(marker), marker
    assert isinstance(prompts.GRAPHIC_MARKERS, tuple) and isinstance(prompts.REVICTIMIZING_MARKERS, tuple)


def test_lo_grafico_se_rechaza_en_cualquier_texto_de_cualquier_operacion(version, ids):
    graphic = "Había sangre a borbotones."
    _invalid(version, _raw(_line(ids["node"], ids["character"], text=graphic)))
    _invalid(version, _raw(_response(ids["node"], feedbackText=graphic)))
    _invalid(version, _raw(_scene(narrative=graphic)))
    _invalid(version, _raw(_ending(message=graphic)))
    _invalid(version, _raw(_response(ids["node"], text=graphic, responseClass="CONTRAINDICATED",
                                     prohibitionReason="Es explícito.")))
    _invalid(version, _raw(message=graphic))


def test_lo_revictimizante_solo_sale_como_contraindicada_con_razon(version, ids):
    text = "¿Y por qué no denunciaste antes?"
    for response_class in ("RECOMMENDED", "ACCEPTABLE", "RISKY"):
        _invalid(version, _raw(_response(ids["node"], text=text, responseClass=response_class)))
    proposals.validate(version, _raw(_response(ids["node"], text=text, responseClass="CONTRAINDICATED",
                                               prohibitionReason="Culpa a la persona y la presiona.")))


def test_no_se_puede_reclasificar_como_buena_una_opcion_revictimizante(api, seeded_draft, version, ids):
    from apps.simulation.models import DecisionOption

    DecisionOption.objects.filter(pk=ids["decision"]).update(text="Seguro exageras, no será para tanto.")

    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["decision"], "responseClass": "RECOMMENDED",
                            "prohibitionReason": ""}))
    proposals.validate(version, _raw({"op": "set-response-class", "decisionId": ids["decision"],
                                      "responseClass": "CONTRAINDICATED", "prohibitionReason": "Minimiza lo que vive."}))


# ─── propose: lo que viaja al proveedor ─────────────────────────────────────────────────
@pytest.fixture
def provider(monkeypatch):
    """Un ``complete_structured`` simulado que registra lo que recibe y devuelve ``reply['value']``."""
    seen = {"calls": 0}
    reply = {"value": {"message": "Listo.", "changes": []}}

    def complete_structured(self, system, messages, schema_, model, max_tokens=4000):
        seen.update(calls=seen["calls"] + 1, system=system, messages=messages, schema=schema_, model=model,
                    max_tokens=max_tokens, key=self.api_key)
        return reply["value"]

    monkeypatch.setattr(AnthropicProvider, "complete_structured", complete_structured)
    seen["reply"] = reply
    return seen


def _propose(version, request_text="Agrega una escena", selection=None, **config_overrides):
    with override_settings(**ON):
        config = assistant_config.current()
    if config_overrides:
        config = type(config)(**{**config.__dict__, **config_overrides})
    return proposals.propose(config=config, case_version=version, request_text=request_text, screen="editor-mapa",
                             selection=selection, actor=None)


def test_propose_manda_al_proveedor_el_esquema_el_sistema_y_el_contexto(version, provider):
    result = _propose(version, "Agrega una escena nueva en el consultorio", selection="objeto 3")

    assert provider["calls"] == 1
    assert provider["schema"] is schema.PROPOSAL
    assert provider["system"] == prompts.SYSTEM_AUTHORING
    assert provider["model"] == "claude-opus-5-5" and provider["max_tokens"] == 8000 and provider["key"] == KEY
    (message,) = provider["messages"]
    assert message["role"] == "user"
    assert "Agrega una escena nueva en el consultorio" in message["content"]
    assert "editor-mapa" in message["content"] and "objeto 3" in message["content"]
    assert json.dumps(context.build(version, "editor-mapa", "objeto 3")["nodes"][0]["title"], ensure_ascii=False)[1:-1] in message["content"]
    assert result == {"mensaje": "Listo.", "cambios": [], "modo": "connected", "model": "claude-opus-5-5", "changes": 0}


def test_propose_recorta_la_peticion_a_2000_y_devuelve_los_cambios_marcados(version, ids, provider):
    provider["reply"]["value"] = _raw({"op": "move", "objectId": ids["object"], "x": 3, "y": 4})

    result = _propose(version, "y" * 5000)

    assert provider["messages"][0]["content"].count("y" * 2000) == 1 and "y" * 2001 not in provider["messages"][0]["content"]
    assert result["changes"] == 1 and result["cambios"][0]["aiSuggested"] is True


def test_sin_key_no_se_llama_a_la_red_y_es_un_error_del_proveedor(version, provider):
    with pytest.raises(ProviderError) as caught:
        _propose(version, api_key="")

    assert caught.value.kind == "http"
    assert provider["calls"] == 0


def test_una_respuesta_invalida_del_proveedor_es_invalid_proposal(version, provider):
    provider["reply"]["value"] = {"message": "ok", "changes": [{"op": "move", "objectId": 987654321, "x": 1, "y": 1}]}

    with pytest.raises(proposals.InvalidProposal):
        _propose(version)


# ─── el endpoint: 422 ───────────────────────────────────────────────────────────────────
def test_el_endpoint_responde_422_con_motivo_gasta_cupo_y_audita_invalid(api, admin, seeded_draft, provider):
    provider["reply"]["value"] = _raw({"op": "move", "objectId": 987654321, "x": 1, "y": 1})
    with override_settings(**ON):
        before = limits.remaining_today(admin, assistant_config.current())

        response = api.post(f"{AUTHORING}/{seeded_draft}/assistant/propose",
                            {"peticion": "mueve la mesa", "pantalla": "editor-mapa"}, format="json")

        after = limits.remaining_today(admin, assistant_config.current())

    assert response.status_code == 422
    assert response.data["code"] == "AI_PROPOSAL_INVALID" and response.data["message"] == INVALID_MESSAGE
    assert isinstance(response.data["motivo"], str) and response.data["motivo"]
    assert after == before - 1
    row = AuditLog.objects.filter(action="AI_AUTHORING_PROPOSE").get()
    context_ = json.loads(row.context_json)
    assert context_["outcome"] == "invalid" and context_["changes"] == 0
    assert "mueve la mesa" not in row.context_json


def test_el_endpoint_devuelve_la_propuesta_valida(api, seeded_draft, ids, provider):
    provider["reply"]["value"] = _raw({"op": "move", "objectId": ids["object"], "x": 3, "y": 4})
    with override_settings(**ON):
        response = api.post(f"{AUTHORING}/{seeded_draft}/assistant/propose",
                            {"peticion": "mueve la mesa", "pantalla": "editor-mapa"}, format="json")

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["modo"] == "connected" and data["cambios"][0]["op"] == "move" and data["cambios"][0]["aiSuggested"] is True


def test_el_endpoint_sin_key_es_502_y_no_gasta_cupo(api, admin, seeded_draft, provider):
    with override_settings(**{**ON, "AI_AUTHORING_API_KEY": ""}):
        response = api.post(f"{AUTHORING}/{seeded_draft}/assistant/propose",
                            {"peticion": "x", "pantalla": "editor-mapa"}, format="json")
        remaining = limits.remaining_today(admin, assistant_config.current())

    assert response.status_code == 502 and response.data["code"] == "AI_PROVIDER_ERROR"
    assert remaining == 5 and provider["calls"] == 0


def test_una_peticion_de_mas_de_2000_caracteres_o_una_seleccion_de_mas_de_200_es_400(api, seeded_draft, provider):
    url = f"{AUTHORING}/{seeded_draft}/assistant/propose"
    with override_settings(**ON):
        long_request = api.post(url, {"peticion": "z" * 2001, "pantalla": "editor-mapa"}, format="json")
        long_text = api.post(url, {"peticion": "z", "pantalla": "editor-mapa", "seleccion": "s" * 201}, format="json")
        long_json = api.post(url, {"peticion": "z", "pantalla": "editor-mapa", "seleccion": {"a": "s" * 300}}, format="json")
        assert provider["calls"] == 0
        at_limit = api.post(url, {"peticion": "z" * 2000, "pantalla": "editor-mapa", "seleccion": "s" * 200}, format="json")

    assert long_request.status_code == 400 and long_text.status_code == 400 and long_json.status_code == 400
    assert at_limit.status_code == 200 and provider["calls"] == 1


# ─── las seis peticiones difíciles ──────────────────────────────────────────────────────
def _resolve(value, mapping):
    if isinstance(value, str) and value.startswith("{{") and value.endswith("}}"):
        return mapping[value[2:-2]]
    if isinstance(value, list):
        return [_resolve(v, mapping) for v in value]
    if isinstance(value, dict):
        return {k: _resolve(v, mapping) for k, v in value.items()}
    return value


def _hard_requests():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_el_fixture_trae_seis_peticiones_con_respuestas_validas_contra_el_esquema():
    entries = _hard_requests()
    assert len(entries) == 6
    assert [e["espera"] for e in entries] == ["rechazada", "rechazada", "aceptada", "rechazada", "rechazada", "rechazada"]
    for entry in entries:
        assert entry["peticion"].strip()
        assert bool(entry["espera_motivo"]) == (entry["espera"] == "rechazada")
        stand_in = _resolve(entry["respuesta_tentadora"], {"node": 1, "map": 1, "character": 1, "other_character": 2,
                                                          "missing_node": 3, "object": 1})
        jsonschema.validate(stand_in, schema.PROPOSAL)


@pytest.mark.parametrize("index", range(6))
def test_peticiones_dificiles(index, version, ids, foreign_character, provider):
    entry = _hard_requests()[index]
    mapping = {"node": ids["node"], "map": ids["map"], "character": ids["character"],
               "other_character": foreign_character, "missing_node": 987654321, "object": ids["object"]}
    tempting = _resolve(entry["respuesta_tentadora"], mapping)
    provider["reply"]["value"] = tempting

    if entry["espera"] == "aceptada":
        result = _propose(version, entry["peticion"])
        (change,) = result["cambios"]
        assert change["responseClass"] == "CONTRAINDICATED" and change["prohibitionReason"].strip()
        assert change["aiSuggested"] is True
        return
    with pytest.raises(proposals.InvalidProposal) as caught:
        _propose(version, entry["peticion"])
    motivo = str(caught.value)
    # La regla prevista fue la que saltó, y el motivo es uno de los textos fijos del servidor.
    assert entry["espera_motivo"] in motivo, motivo
    assert proposals.is_fixed_motivo(motivo), motivo
    # Nunca se devuelve al cliente un texto del modelo (ni un valor suelto de más de tres caracteres).
    for text in _strings(tempting):
        if len(text) > 3:
            assert text.lower() not in motivo.lower(), text


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for inner in value.values():
            yield from _strings(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _strings(inner)
