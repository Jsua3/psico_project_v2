"""E4-1a · El documento base canónico y su huella (RF-12, RNF-07, TD-02).

Sin base de datos: una ``CaseDefinition`` armada a mano se vuelve el documento del DSL del taller
(``to_document``) con ids por posición, y los mismos datos dan siempre los mismos bytes y la misma
huella. La base es una **proyección fiel** (R7): lo que no cabe en el esquema del taller (un
personaje sin rol, una herramienta sin descripción, una escena que solo se alcanza por una puerta) no
se inventa ni se completa: se omite de la base.
"""
import copy
import json

import pytest

from apps.simulation.casedef import canonical
from apps.simulation.casedef.export import DERIVED_PROMPT, ids_of, to_document
from apps.simulation.casedef.model import (
    CaseDefinition,
    Character,
    Criterion,
    Option,
    Rubric,
    Scene,
    Tool,
)

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RNF-07"), pytest.mark.req("TD-02")]


def _option(key, text, target, classification="ADEQUATE", **extra):
    return Option(key=key, text=text, target=target, classification=classification, **extra)


def _definition(**overrides):
    scenes = (
        Scene(
            key="inicio", title="Reunión de equipo", narrative="El equipo discute.", start=True,
            prompt="¿Qué haces primero?", hints=("Piensa en los actores.",),
            options=(
                _option(
                    "analizar", "Analizar a los actores", "mapa", "ADEQUATE",
                    consequence="El mapa muestra las posiciones.", feedback_text="Analizar primero ayuda.",
                    theory_basis="Psicología social", immediate_feedback="Bien.",
                ),
                _option("intervenir", "Intervenir ya", "cierre", "RISKY", immediate_feedback="Apresurado."),
            ),
        ),
        Scene(key="mapa", title="Mapa de actores", narrative="Se ordenan los actores.",
              options=(_option("seguir", "Seguir", "cierre", "ADEQUATE"), _option("volver", "Volver", "cierre", "RISKY"))),
        Scene(key="cierre", title="Cierre", narrative="Fin del caso.", terminal=True),
    )
    base = dict(
        code="CASO-001", title="Conflicto en una organización",
        description="Un conflicto entre dos integrantes.", semantic_version="1.2.0", status="DRAFT",
        objectives=("Identificar a los actores.", "Elegir una intervención."),
        characters=(
            Character(key="laura", display_name="Laura", role_label="Líder del equipo", display_order=1),
            Character(key="figurante", display_name="Figurante", role_label=""),
        ),
        tools=(
            Tool(code="MAPA", label="Mapa de actores", description="Para ver intereses.", category="evaluacion"),
            Tool(code="SIN_DESCRIPCION", label="Sin descripción", description=""),
        ),
        scenes=scenes,
        rubrics=(
            Rubric(
                name="Rúbrica formativa", description="Valora el análisis.", version="1.0", active=True,
                criteria=(
                    Criterion(competency="ANALISIS", title="Análisis", description="Identifica actores."),
                    Criterion(competency="DECISION", title="Decisión", description="Elige bien."),
                ),
            ),
        ),
    )
    base.update(overrides)
    return CaseDefinition(**base)


# ─── ids por posición y mapeo de la base (R6, R8) ─────────────────────────────────────────────
def test_ids_are_assigned_by_position():
    doc = to_document(_definition())
    assert [s["id"] for s in doc["escenas"]] == ["E01", "E02", "E03"]
    assert [s["orden"] for s in doc["escenas"]] == [1, 2, 3]
    assert doc["escenas"][0]["decision"]["id"] == "D01"
    assert doc["escenas"][1]["decision"]["id"] == "D02"
    options = [o["id"] for s in doc["escenas"] if "decision" in s for o in s["decision"]["opciones"]]
    assert options == ["OP01", "OP02", "OP03", "OP04"]
    assert [p["id"] for p in doc["personajes"]] == ["P01"]
    assert [h["id"] for h in doc["herramientas"]] == ["H01"]
    assert [r["id"] for r in doc["rubricas"]] == ["RUB-01"]
    assert [c["id"] for c in doc["rubricas"][0]["criterios"]] == ["CR01", "CR02"]
    assert [r["id"] for r in doc["retroalimentacion"]] == ["R01"]


def test_the_case_block_follows_the_correspondence_table():
    caso = to_document(_definition())["caso"]
    assert caso == {
        "id": "CASO-001", "titulo": "Conflicto en una organización",
        "descripcion": "Un conflicto entre dos integrantes.", "version": "1.2.0", "estado": "BORRADOR",
        "objetivosAprendizaje": ["Identificar a los actores.", "Elegir una intervención."],
        "escenaInicial": "E01", "rubrica": "RUB-01",
    }


@pytest.mark.parametrize(
    ("status", "estado"),
    [("DRAFT", "BORRADOR"), ("IN_REVIEW", "BORRADOR"), ("PUBLISHED", "PUBLICADO"), ("ARCHIVED", "ARCHIVADO")],
)
def test_the_state_is_translated(status, estado):
    assert to_document(_definition(status=status))["caso"]["estado"] == estado


def test_a_scene_with_options_carries_a_decision_with_classification_and_hints():
    first = to_document(_definition())["escenas"][0]
    assert first["titulo"] == "Reunión de equipo"
    assert first["descripcion"] == "El equipo discute."
    decision = first["decision"]
    assert decision["pregunta"] == "¿Qué haces primero?"
    assert decision["pistas"] == ["Piensa en los actores."]
    assert decision["opciones"][0] == {
        "id": "OP01", "texto": "Analizar a los actores", "siguienteEscena": "E02",
        "clasificacion": "ADECUADA", "consecuencia": "El mapa muestra las posiciones.",
    }
    assert decision["opciones"][1]["clasificacion"] == "RIESGOSA"
    assert "consecuencia" not in decision["opciones"][1]


def test_a_scene_without_options_is_a_conclusion_without_a_decision():
    last = to_document(_definition())["escenas"][2]
    assert "decision" not in last


def test_a_prohibited_option_carries_its_reason():
    scenes = list(_definition().scenes)
    options = list(scenes[0].options)
    options[1] = _option(
        "intervenir", "Intervenir ya", "cierre", "INADEQUATE", prohibited=True, reason="Revictimiza.",
    )
    scenes[0] = Scene(**{**scenes[0].__dict__, "options": tuple(options)})
    option = to_document(_definition(scenes=tuple(scenes)))["escenas"][0]["decision"]["opciones"][1]
    assert option["conductaProhibida"] is True
    assert option["motivoProhibicion"] == "Revictimiza."
    assert option["clasificacion"] == "INADECUADA"


def test_sensitive_scenes_carry_their_warning():
    scenes = list(_definition().scenes)
    scenes[1] = Scene(**{**scenes[1].__dict__, "sensitive": True, "warning": "Contenido sensible."})
    scene = to_document(_definition(scenes=tuple(scenes)))["escenas"][1]
    assert scene["contenidoSensible"] is True
    assert scene["advertencia"] == "Contenido sensible."
    assert "contenidoSensible" not in to_document(_definition())["escenas"][0]


# ─── la base es una proyección fiel: no se inventa nada (R7) ──────────────────────────────────
def test_a_character_without_a_role_and_a_tool_without_a_description_stay_out_of_the_base():
    doc = to_document(_definition())
    assert [p["nombre"] for p in doc["personajes"]] == ["Laura"]
    assert doc["personajes"][0] == {"id": "P01", "nombre": "Laura", "rol": "Líder del equipo"}
    assert [h["nombre"] for h in doc["herramientas"]] == ["Mapa de actores"]
    assert doc["herramientas"][0] == {
        "id": "H01", "nombre": "Mapa de actores", "descripcion": "Para ver intereses.", "categoria": "evaluacion",
    }


def test_missing_text_is_omitted_not_invented():
    doc = to_document(_definition(description="   "))
    assert "descripcion" not in doc["caso"]
    doc = to_document(_definition(objectives=()))
    assert "objetivosAprendizaje" not in doc["caso"]


def test_a_draft_without_a_start_scene_exports_without_an_initial_scene():
    scenes = tuple(Scene(**{**s.__dict__, "start": False}) for s in _definition().scenes)
    doc = to_document(_definition(scenes=scenes))
    assert "escenaInicial" not in doc["caso"]
    assert [s["id"] for s in doc["escenas"]] == ["E01", "E02", "E03"]  # sin inicio nada queda fuera


def test_a_scene_that_options_never_reach_stays_out_of_the_base():
    hub = Scene(key="recepcion", title="Recepción", narrative="Un pasillo que solo se alcanza por una puerta.")
    definition = _definition(scenes=_definition().scenes + (hub,))
    doc = to_document(definition)
    assert [s["id"] for s in doc["escenas"]] == ["E01", "E02", "E03"]
    assert "recepcion" not in ids_of(definition).scene
    assert ids_of(definition).base_scenes == ("inicio", "mapa", "cierre")


def test_an_empty_prompt_is_derived_with_a_neutral_text():
    scenes = list(_definition().scenes)
    scenes[0] = Scene(**{**scenes[0].__dict__, "prompt": ""})
    doc = to_document(_definition(scenes=tuple(scenes)))
    assert doc["escenas"][0]["decision"]["pregunta"] == DERIVED_PROMPT


def test_feedback_is_a_separate_entry_only_with_text_and_theory():
    doc = to_document(_definition())
    assert doc["retroalimentacion"] == [{
        "id": "R01", "opcion": "OP01", "mensaje": "Analizar primero ayuda.",
        "fundamentoTeorico": "Psicología social",
    }]


def test_a_rubric_without_usable_criteria_stays_out_and_the_case_has_no_rubric():
    empty = Rubric(name="Sin criterios", criteria=())
    doc = to_document(_definition(rubrics=(empty,)))
    assert doc["rubricas"] == []
    assert "rubrica" not in doc["caso"]


def test_the_case_rubric_is_the_first_active_one():
    inactive = Rubric(name="Vieja", active=False, criteria=(Criterion(competency="X", title="X"),))
    active = Rubric(name="Vigente", active=True, criteria=(Criterion(competency="Y", title="Y"),))
    doc = to_document(_definition(rubrics=(inactive, active)))
    assert doc["caso"]["rubrica"] == "RUB-02"
    assert [r["activa"] for r in doc["rubricas"]] == [False, True]
    assert [c["id"] for r in doc["rubricas"] for c in r["criterios"]] == ["CR01", "CR02"]


# ─── determinismo y huella (R11) ──────────────────────────────────────────────────────────────
def test_the_same_definition_gives_the_same_bytes():
    a = canonical.canonical_bytes(to_document(_definition()))
    b = canonical.canonical_bytes(to_document(copy.deepcopy(_definition())))
    assert a == b
    assert a == json.dumps(json.loads(a), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def test_text_keeps_accents_and_the_enie_as_utf8():
    raw = canonical.canonical_bytes(to_document(_definition(title="Año de la niña")))
    assert "Año de la niña".encode("utf-8") in raw
    assert b"\\u" not in raw


def test_the_hash_ignores_the_state_and_follows_the_content():
    draft = canonical.definition_hash(to_document(_definition(status="DRAFT")))
    published = canonical.definition_hash(to_document(_definition(status="PUBLISHED")))
    assert draft == published
    assert draft.startswith("sha256:") and len(draft) == 71
    assert canonical.definition_hash(to_document(_definition(title="Otro título"))) != draft


def test_a_golden_hash_pins_the_format():
    minimal = {
        "versionDsl": "1.0",
        "caso": {"id": "CASO-001", "titulo": "T", "descripcion": "D", "version": "1.0.0", "estado": "BORRADOR",
                 "escenaInicial": "E01"},
        "escenas": [{"id": "E01", "titulo": "A", "descripcion": "B"}],
    }
    assert canonical.canonical_bytes(minimal) == (
        '{"caso":{"descripcion":"D","escenaInicial":"E01","estado":"BORRADOR","id":"CASO-001",'
        '"titulo":"T","version":"1.0.0"},"escenas":[{"descripcion":"B","id":"E01","titulo":"A"}],'
        '"versionDsl":"1.0"}'
    ).encode("utf-8")
    # El oro se calculó aparte, con ``hashlib`` sobre esos bytes y ``estado`` en ``PUBLICADO``.
    assert canonical.definition_hash(minimal) == (
        "sha256:ed18f05e17dec201dc423afead84d3604afa500a3ab0f756da69c07e70c5c67a"
    )


def test_the_document_text_is_indented_sorted_and_ends_with_a_newline():
    text = canonical.document_text({"b": 1, "a": "ñ"})
    assert text == '{\n  "a": "ñ",\n  "b": 1\n}\n'


def test_nan_cannot_enter_the_canonical_bytes():
    with pytest.raises(ValueError):
        canonical.canonical_bytes({"x": float("nan")})
