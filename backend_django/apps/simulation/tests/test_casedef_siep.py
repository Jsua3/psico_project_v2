"""E4-1b · ``x-siep``: el mundo, las reglas y los extras del producto (RNF-07, TD-02).

Sin base de datos. La base del DSL (E4-1a) lleva lo que el esquema del taller puede expresar;
``x-siep`` lleva el resto **sin duplicarlo**: cada entidad que está en la base se enlaza por su ``id``
de DSL y las que no caben (un personaje sin rol, una herramienta sin descripción, una escena que solo se
alcanza por una puerta) van completas. Dentro del mundo las referencias van por la **clave del
producto** (opción, personaje, herramienta, objeto), no por ids de DSL.
"""
import copy
import json
from pathlib import Path

import jsonschema
import pytest

from apps.simulation.casedef import canonical
from apps.simulation.casedef.export import DERIVED_PROMPT, to_base_document, to_document
from apps.simulation.casedef.model import (
    CaseDefinition,
    Character,
    CollisionZone,
    Criterion,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    Option,
    Rubric,
    Scene,
    Tool,
    World,
    WorldObject,
)

pytestmark = [pytest.mark.req("RNF-07"), pytest.mark.req("TD-02")]

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "casedef" / "schema" / "x-siep.schema.json").read_text(encoding="utf-8")
)


def _object(key, kind="OBJECT", **extra):
    return WorldObject(key=key, label=key.title(), type=kind, x=10, y=20, width=48, height=48, **extra)


def _world(key, objects=(), dialogues=(), spawn=(100, 120)):
    return World(
        key=key, title=f"Sala {key}", width=960, height=540, theme="hospital", spawn_x=spawn[0], spawn_y=spawn[1],
        ambient={"music": "calma"},
        collisions=(CollisionZone(key="pared", label="pared", x=0, y=0, width=960, height=20),),
        objects=tuple(objects), dialogues=tuple(dialogues),
    )


def _definition():
    inicio = Scene(
        key="inicio", title="Reunión", narrative="El equipo discute.", start=True, prompt="",
        hints=("Piensa en los actores.",), x=40, y=60, support=("Línea 106",),
        options=(
            Option(
                key="analizar", text="Analizar", target="mapa", classification="ADEQUATE",
                consequence="Se ve el mapa.", feedback_text="Analizar ayuda.", theory_basis="Psicología social",
                immediate_feedback="Bien.", score=10, stress=-5, penalty=0,
                effects={"severity": "recommended", "flags": {"analizo": True}, "metrics": {"confianza": 5}},
            ),
            Option(key="intervenir", text="Intervenir", target="cierre", classification="RISKY",
                   feedback_text="Solo el mensaje.", immediate_feedback="Apresurado."),
        ),
        world=_world(
            "sala-inicio",
            objects=(
                _object("laura", "PERSON", character="laura", interaction_prompt="Hablar", interaction_text="Hola",
                        metadata={"npc": True}),
                _object("puerta", "EXIT", metadata={"targetNodeKey": "mapa"}, icon="door_front"),
                _object("kit", "TOOL", tool_code="MAPA", option="analizar"),
            ),
            dialogues=(
                DialogueTree(
                    key="laura", speaker="Laura", portrait_key="laura-1", emotion="neutral", object_key="laura",
                    lines=(DialogueLine(order=1, speaker="Laura", text="Necesito hablar.", emotion="concerned"),),
                    choices=(
                        DialogueChoice(key="c1", text="Analizar los actores", option="analizar", required_tool="MAPA",
                                       effect={}, order=1),
                        DialogueChoice(key="c2", text="Intervenir ya", option="intervenir", required_tool=None,
                                       effect={"x": 1}, order=2),
                    ),
                ),
            ),
        ),
    )
    mapa = Scene(
        key="mapa", title="Mapa de actores", narrative="Se ordenan.", prompt="¿Y ahora?",
        options=(Option(key="seguir", text="Seguir", target="cierre", classification="ADEQUATE"),
                 Option(key="volver", text="Volver", target="cierre", classification="RISKY")),
        world=_world("sala-mapa"),
    )
    cierre = Scene(key="cierre", title="Cierre", narrative="Fin.", terminal=True, hints=("Una pista suelta.",))
    recepcion = Scene(
        key="recepcion", title="Recepción", narrative="Un pasillo que solo se alcanza por una puerta.",
        sensitive=True, warning="Contenido sensible.",
        options=(Option(key="salir", text="Salir", target="cierre", classification="ADEQUATE"),),
        world=_world("sala-recepcion"),
    )
    return CaseDefinition(
        code="CASO-001", title="Conflicto", description="Descripción.", semantic_version="1.0.0",
        status="DRAFT", context="Contexto largo.", objectives=("Objetivo uno.",),
        rules={"secondChance": True, "feedbackTiming": "IMMEDIATE",
               "metrics": [{"key": "confianza", "initial": 50}],
               "endings": [{"key": "bueno", "title": "Bueno", "message": "Bien.", "tone": "positive",
                            "when": {"metric": "confianza", "gte": 60}},
                           {"key": "base", "title": "Base", "message": "", "tone": "neutral"}]},
        world_schema_version=2,
        characters=(
            Character(key="laura", display_name="Laura", role_label="Líder", portrait_key="laura-1",
                      show_in_brief=True, display_order=1),
            Character(key="figurante", display_name="Figurante", role_label="", display_order=2),
        ),
        tools=(
            Tool(code="MAPA", label="Mapa de actores", description="Para ver intereses.", category="evaluacion",
                 icon="map"),
            Tool(code="SIN_DESCRIPCION", label="Sin descripción", description="", icon="x", active=False),
        ),
        scenes=(inicio, mapa, cierre, recepcion),
        rubrics=(
            Rubric(name="Rúbrica", description="Valora.", version="1.0", active=True, criteria=(
                Criterion(competency="ANALISIS", title="Análisis", description="Identifica.", max_score=5,
                          weight="60.00", competency_code="ANALISIS"),
                Criterion(competency="", title="", description="Sin competencia", max_score=5, weight="40.00",
                          active=False),
            )),
            Rubric(name="", description="Sin nombre", criteria=(Criterion(competency="X", title="X"),)),
        ),
    )


def _siep(definition=None):
    return to_document(definition or _definition())["x-siep"]


# ─── el documento completo y su relación con la base ──────────────────────────────────────────
def test_the_full_document_is_the_base_plus_x_siep():
    full = to_document(_definition())
    assert full["x-siep"]
    base = {key: value for key, value in full.items() if key != "x-siep"}
    assert base == to_base_document(_definition())
    assert to_base_document(_definition()).get("x-siep") is None


def test_the_case_level_extras():
    siep = _siep()
    assert siep["version"] == "1.0"
    assert siep["contexto"] == "Contexto largo."
    assert siep["mundoVersion"] == 2
    assert siep["reglas"] == _definition().rules


def test_an_empty_context_is_omitted():
    definition = _definition()
    siep = to_document(CaseDefinition(**{**definition.__dict__, "context": ""}))["x-siep"]
    assert "contexto" not in siep


# ─── personajes y herramientas ────────────────────────────────────────────────────────────────
def test_characters_in_the_base_are_linked_by_id_and_the_others_travel_complete():
    siep = _siep()
    assert siep["personajes"] == [
        {"id": "P01", "clave": "laura", "retrato": "laura-1", "enFicha": True, "orden": 1},
        {"clave": "figurante", "nombre": "Figurante", "rol": "", "retrato": "", "enFicha": False, "orden": 2},
    ]


def test_tools_in_the_base_are_linked_by_id_and_the_others_travel_complete():
    siep = _siep()
    assert siep["herramientas"] == [
        {"id": "H01", "codigo": "MAPA", "icono": "map", "activa": True},
        {"codigo": "SIN_DESCRIPCION", "etiqueta": "Sin descripción", "descripcion": "", "categoria": "",
         "icono": "x", "activa": False},
    ]


def test_the_base_lists_as_participants_only_the_characters_with_a_role_whose_person_is_in_the_room():
    base = to_base_document(_definition())
    first = base["escenas"][0]
    assert first["participantes"] == ["P01"]
    assert "participantes" not in base["escenas"][1]  # una sala sin personas


def test_an_option_takes_its_tool_from_the_dialogue_choices_that_offer_it():
    options = to_base_document(_definition())["escenas"][0]["decision"]["opciones"]
    assert options[0]["herramienta"] == "H01"  # c1 exige MAPA
    assert "herramienta" not in options[1]  # c2 no exige ninguna


def test_an_option_whose_choices_disagree_about_the_tool_gets_none():
    definition = _definition()
    first = definition.scenes[0]
    tree = first.world.dialogues[0]
    choices = (
        tree.choices[0],
        DialogueChoice(key="c3", text="Otra vez", option="analizar", required_tool=None, effect={}, order=3),
    )
    world = World(**{**first.world.__dict__, "dialogues": (DialogueTree(**{**tree.__dict__, "choices": choices}),)})
    scenes = (Scene(**{**first.__dict__, "world": world}),) + definition.scenes[1:]
    options = to_base_document(CaseDefinition(**{**definition.__dict__, "scenes": scenes}))["escenas"][0]["decision"]["opciones"]
    assert "herramienta" not in options[0]


# ─── escenas ──────────────────────────────────────────────────────────────────────────────────
def test_a_scene_in_the_base_is_linked_by_id_and_carries_its_product_extras():
    entry = _siep()["escenas"][0]
    assert entry["id"] == "E01"
    assert entry["clave"] == "inicio"
    assert entry["inicial"] is True and entry["terminal"] is False
    assert entry["salidaSeguraObligatoria"] is False
    assert entry["apoyo"] == ["Línea 106"]
    assert entry["herramientasRequeridas"] == []
    assert entry["posicion"] == {"x": 40, "y": 60}
    assert entry["preguntaDerivada"] is True  # su enunciado estaba vacío y la base lleva el texto neutral
    assert to_base_document(_definition())["escenas"][0]["decision"]["pregunta"] == DERIVED_PROMPT
    assert "titulo" not in entry and "descripcion" not in entry  # ya están en la base


def test_a_real_prompt_is_not_marked_as_derived():
    assert "preguntaDerivada" not in _siep()["escenas"][1]


def test_a_scene_the_options_never_reach_travels_complete():
    entries = _siep()["escenas"]
    hub = entries[3]
    assert "id" not in hub
    assert hub["clave"] == "recepcion"
    assert hub["titulo"] == "Recepción"
    assert hub["descripcion"] == "Un pasillo que solo se alcanza por una puerta."
    assert hub["sensible"] is True and hub["advertencia"] == "Contenido sensible."
    assert hub["pregunta"] == ""
    assert hub["opciones"] == [{
        "clave": "salir", "texto": "Salir", "destino": "cierre", "clasificacion": "ADEQUATE",
        "prohibida": False, "motivo": "", "consecuencia": "", "puntaje": 0, "estres": 0, "penalizacion": 0,
        "retroalimentacionInmediata": "", "mensaje": "", "fundamento": "", "efectos": {},
    }]
    assert hub["mapa"]["clave"] == "sala-recepcion"


def test_the_scenes_keep_the_model_order():
    assert [e["clave"] for e in _siep()["escenas"]] == ["inicio", "mapa", "cierre", "recepcion"]


def test_hints_travel_in_x_siep_only_when_the_base_has_no_decision_to_hold_them():
    entries = _siep()["escenas"]
    assert "pistas" not in entries[0]  # van en la decisión de la base
    assert entries[2]["pistas"] == ["Una pista suelta."]  # la escena final no tiene decisión


# ─── opciones ─────────────────────────────────────────────────────────────────────────────────
def test_options_in_the_base_carry_only_the_extras():
    options = _siep()["escenas"][0]["opciones"]
    assert options[0] == {
        "id": "OP01", "clave": "analizar", "puntaje": 10, "estres": -5, "penalizacion": 0,
        "retroalimentacionInmediata": "Bien.",
        "efectos": {"severity": "recommended", "flags": {"analizo": True}, "metrics": {"confianza": 5}},
    }


def test_a_lonely_feedback_text_travels_in_x_siep():
    option = _siep()["escenas"][0]["opciones"][1]
    assert option["mensaje"] == "Solo el mensaje."
    assert "fundamento" not in option
    assert "mensaje" not in _siep()["escenas"][0]["opciones"][0]  # esa sí tiene entrada en la base


# ─── el mundo ─────────────────────────────────────────────────────────────────────────────────
def test_the_map_carries_the_whole_room_with_product_keys_for_the_references():
    mapa = _siep()["escenas"][0]["mapa"]
    assert mapa["clave"] == "sala-inicio"
    assert mapa["titulo"] == "Sala sala-inicio"
    assert (mapa["ancho"], mapa["alto"], mapa["tema"]) == (960, 540, "hospital")
    assert mapa["aparicion"] == {"x": 100, "y": 120}
    assert mapa["ambiente"] == {"music": "calma"}
    assert mapa["colisiones"] == [{"clave": "pared", "etiqueta": "pared", "x": 0, "y": 0, "ancho": 960, "alto": 20}]
    person = mapa["objetos"][0]
    assert person == {
        "clave": "laura", "etiqueta": "Laura", "tipo": "PERSON", "x": 10, "y": 20, "ancho": 48, "alto": 48,
        "z": 0, "orientacion": "", "color": "", "icono": "", "codigoCorto": "", "colision": False,
        "visible": True, "indicacion": "Hablar", "texto": "Hola", "opcion": None, "personaje": "laura",
        "herramienta": None, "desbloqueo": {}, "movimiento": {}, "metadatos": {"npc": True},
    }
    assert mapa["objetos"][2]["opcion"] == "analizar" and mapa["objetos"][2]["herramienta"] == "MAPA"
    assert mapa["objetos"][1]["metadatos"] == {"targetNodeKey": "mapa"}


def test_dialogues_carry_their_lines_and_choices():
    dialogue = _siep()["escenas"][0]["mapa"]["dialogos"][0]
    assert dialogue == {
        "clave": "laura", "hablante": "Laura", "retrato": "laura-1", "emocion": "neutral", "objeto": "laura",
        "lineas": [{"orden": 1, "hablante": "Laura", "texto": "Necesito hablar.", "emocion": "concerned"}],
        "elecciones": [
            {"clave": "c1", "texto": "Analizar los actores", "opcion": "analizar", "herramientaRequerida": "MAPA",
             "efecto": {}, "orden": 1},
            {"clave": "c2", "texto": "Intervenir ya", "opcion": "intervenir", "herramientaRequerida": None,
             "efecto": {"x": 1}, "orden": 2},
        ],
    }


def test_a_scene_without_a_world_has_no_map():
    assert "mapa" not in _siep()["escenas"][2]


# ─── rúbricas ─────────────────────────────────────────────────────────────────────────────────
def test_rubrics_link_by_id_and_unusable_parts_travel_complete():
    rubrics = _siep()["rubricas"]
    assert rubrics[0] == {
        "id": "RUB-01",
        "criterios": [
            {"id": "CR01", "puntajeMaximo": 5, "peso": "60.00", "activo": True, "competenciaCodigo": "ANALISIS"},
            {"competencia": "", "titulo": "", "descripcion": "Sin competencia", "puntajeMaximo": 5,
             "peso": "40.00", "activo": False},
        ],
    }
    assert rubrics[1] == {
        "nombre": "", "descripcion": "Sin nombre", "version": "1.0", "activa": True,
        "criterios": [{"competencia": "X", "titulo": "X", "descripcion": "", "puntajeMaximo": 0,
                       "peso": "0.00", "activo": True}],
    }


# ─── forma, determinismo y esquema ────────────────────────────────────────────────────────────
def test_x_siep_validates_against_its_schema():
    errors = list(jsonschema.Draft202012Validator(SCHEMA).iter_errors(_siep()))
    assert errors == [], [e.message for e in errors][:3]


def test_x_siep_is_closed_and_a_stray_key_is_an_error():
    siep = copy.deepcopy(_siep())
    siep["clave-rara"] = 1
    siep["escenas"][0]["mapa"]["objetos"][0]["sobra"] = True
    messages = " ".join(e.message for e in jsonschema.Draft202012Validator(SCHEMA).iter_errors(siep))
    assert "clave-rara" in messages and "sobra" in messages


def test_the_full_document_is_deterministic():
    a = canonical.canonical_bytes(to_document(_definition()))
    b = canonical.canonical_bytes(to_document(copy.deepcopy(_definition())))
    assert a == b


def test_the_hash_covers_x_siep():
    definition = _definition()
    changed = CaseDefinition(**{**definition.__dict__, "rules": {**definition.rules, "secondChance": False}})
    assert canonical.definition_hash(to_document(changed)) != canonical.definition_hash(to_document(definition))
