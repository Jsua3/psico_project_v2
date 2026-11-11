"""Una definición de muestra con mundo, personajes, herramientas y una escena que solo se alcanza por una puerta.

La usan las pruebas puras de ``x-siep`` (E4-1b) y las del validador unificado (E4-2b): cuatro escenas
(``inicio``, ``mapa`` y ``cierre`` en la base; ``recepcion`` solo en ``x-siep``), un personaje con rol y
otro sin él, dos herramientas (una sin descripción), reglas con hitos y finales, y dos rúbricas.
"""
from dataclasses import replace

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


def make_object(key, kind="OBJECT", **extra):
    return WorldObject(key=key, label=key.title(), type=kind, x=10, y=20, width=48, height=48, **extra)


def make_world(key, objects=(), dialogues=(), spawn=(100, 120)):
    return World(
        key=key, title=f"Sala {key}", width=960, height=540, theme="hospital", spawn_x=spawn[0], spawn_y=spawn[1],
        ambient={"music": "calma"},
        collisions=(CollisionZone(key="pared", label="pared", x=0, y=0, width=960, height=20),),
        objects=tuple(objects), dialogues=tuple(dialogues),
    )


def sample_definition():
    inicio = Scene(
        key="inicio", title="Reunión", narrative="El equipo discute.", start=True, prompt="",
        hints=("Piensa en los actores.",), x=40, y=60, support=("Línea 106",),
        options=(
            Option(
                key="analizar", text="Analizar", target="mapa",
                consequence="Se ve el mapa.", feedback_text="Analizar ayuda.", theory_basis="Psicología social",
                immediate_feedback="Bien.", response_class="RECOMMENDED",
                effects={"persona": {"bond": 1, "activation": -1}, "milestones": ["analizo"]},
            ),
            Option(key="intervenir", text="Intervenir", target="cierre",
                   feedback_text="Solo el mensaje.", immediate_feedback="Apresurado.", response_class="RISKY",
                   effects={"persona": {"bond": -1, "activation": 0}}),
        ),
        world=make_world(
            "sala-inicio",
            objects=(
                make_object("laura", "PERSON", character="laura", interaction_prompt="Hablar", interaction_text="Hola",
                        metadata={"npc": True}),
                make_object("puerta", "EXIT", metadata={"targetNodeKey": "mapa"}, icon="door_front"),
                make_object("kit", "TOOL", tool_code="MAPA", option="analizar"),
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
        options=(Option(key="seguir", text="Seguir", target="cierre", response_class="RECOMMENDED"),
                 Option(key="volver", text="Volver", target="cierre", response_class="RISKY")),
        world=make_world("sala-mapa"),
    )
    cierre = Scene(key="cierre", title="Cierre", narrative="Fin.", terminal=True, hints=("Una pista suelta.",))
    recepcion = Scene(
        key="recepcion", title="Recepción", narrative="Un pasillo que solo se alcanza por una puerta.",
        sensitive=True, warning="Contenido sensible.", intensity="HIGH",
        options=(Option(key="salir", text="Salir", target="cierre", response_class="ACCEPTABLE"),),
        world=make_world("sala-recepcion"),
    )
    return CaseDefinition(
        code="CASO-001", title="Conflicto", description="Descripción.", semantic_version="1.0.0",
        status="DRAFT", context="Contexto largo.", objectives=("Objetivo uno.",),
        rules={"secondChance": True, "feedbackTiming": "IMMEDIATE",
               "milestones": [{"key": "analizo", "label": "Analizar a los actores", "description": "",
                               "decisive": True}],
               "riskLevel": "MODERATE",
               "endings": [{"key": "bueno", "title": "Bueno", "message": "Bien.", "tone": "positive",
                            "when": {"milestone": "analizo"}},
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


def sample_definition_v21():
    """La muestra 2.0 con los campos del 2.1: ``inicio`` gana un objetivo y un objeto ``carpeta``; la opción ``analizar``
    exige haber inspeccionado la carpeta y trae una reacción; ``intervenir`` queda sin requisito ni reacción."""
    base = sample_definition()
    inicio = base.scenes[0]
    options = tuple(
        replace(
            option,
            requires={"inspected": "carpeta"},
            reaction={"linea": "Gracias por quedarse.", "emocion": "triste", "gesto": "se-acerca"},
        )
        if option.key == "analizar" else option
        for option in inicio.options
    )
    world = replace(
        inicio.world,
        objects=(*inicio.world.objects, make_object("carpeta", "OBJECT", interaction_text="Una carpeta con notas.")),
    )
    scene = replace(inicio, goal="Entiende qué le preocupa al equipo antes de decidir.", options=options, world=world)
    # ``cierre`` trae pistas sin mapa: el importador le generaría una sala; con la suya la ida y vuelta es exacta.
    closing = replace(base.scenes[2], world=make_world("sala-cierre"))
    return replace(base, scenes=(scene, base.scenes[1], closing, *base.scenes[3:]))
