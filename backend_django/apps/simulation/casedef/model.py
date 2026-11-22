"""El modelo de la definición del caso: lo que el documento describe, sin ids de base de datos.

Son dataclasses congeladas con tuplas: el **orden de cada tupla es el orden canónico** (quien carga
la definición, ``definition_io.load_definition``, ordena con un ``ORDER BY`` explícito). Las claves
del producto (``node_key``, ``option_key``, ``character_key``, ``tool_code``…) son cadenas; las
referencias entre entidades van por clave. Nada de aquí importa Django.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Character:
    key: str
    display_name: str
    role_label: str = ""
    portrait_key: str = ""
    show_in_brief: bool = False
    display_order: int = 0


@dataclass(frozen=True)
class Tool:
    code: str
    label: str
    icon: str = ""
    category: str = ""
    description: str = ""
    active: bool = True


@dataclass(frozen=True)
class Criterion:
    competency: str
    title: str
    description: str = ""
    max_score: int = 0
    #: El peso como texto exacto (``"20.00"``): un ``Decimal`` no viaja como número sin perder exactitud.
    weight: str = "0.00"
    active: bool = True
    #: ``Competency.code`` del catálogo al que apunta el criterio, o ``None`` si solo tiene el texto libre.
    competency_code: str | None = None
    #: RK-2 · Lo que significa cada nivel en este criterio: ``{nivel: texto}`` solo con los niveles que el autor escribió.
    #: Vacío = el criterio usa los descriptores generales de los niveles.
    level_descriptors: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Rubric:
    name: str
    description: str = ""
    version: str = "1.0"
    active: bool = True
    criteria: tuple[Criterion, ...] = ()


@dataclass(frozen=True)
class CollisionZone:
    key: str
    label: str
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class WorldObject:
    key: str
    label: str
    #: ``PERSON`` | ``OBJECT`` | ``EXIT`` | ``TOOL``… (``map_objects.object_type``).
    type: str
    x: int
    y: int
    width: int
    height: int
    z_index: int = 0
    facing: str = ""
    color_hex: str = ""
    icon: str = ""
    short_code: str = ""
    collision: bool = False
    visible: bool = True
    interaction_prompt: str = ""
    interaction_text: str = ""
    #: Clave de la opción que ofrece el objeto, si ofrece alguna.
    option: str | None = None
    #: Clave del personaje que representa (solo los ``PERSON``).
    character: str | None = None
    tool_code: str | None = None
    unlock_condition: dict = field(default_factory=dict)
    movement_pattern: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class DialogueLine:
    order: int
    speaker: str
    text: str
    emotion: str = ""


@dataclass(frozen=True)
class DialogueChoice:
    key: str
    text: str
    #: Clave de la opción que la elección ofrece, si ofrece alguna.
    option: str | None = None
    required_tool: str | None = None
    effect: dict = field(default_factory=dict)
    order: int = 0


@dataclass(frozen=True)
class DialogueTree:
    key: str
    speaker: str
    portrait_key: str | None = None
    emotion: str = ""
    #: Clave del objeto del que cuelga el diálogo.
    object_key: str | None = None
    lines: tuple[DialogueLine, ...] = ()
    choices: tuple[DialogueChoice, ...] = ()


@dataclass(frozen=True)
class World:
    """La sala de una escena: su mapa, los objetos, las colisiones y los diálogos."""

    key: str
    title: str
    width: int
    height: int
    theme: str
    spawn_x: int
    spawn_y: int
    ambient: dict = field(default_factory=dict)
    collisions: tuple[CollisionZone, ...] = ()
    objects: tuple[WorldObject, ...] = ()
    dialogues: tuple[DialogueTree, ...] = ()
    #: La sala armada por piezas (``SceneMap.structure``, x-siep 2.2); ``None`` en una sala de imagen fija.
    structure: dict | None = None


@dataclass(frozen=True)
class Option:
    key: str
    text: str
    #: Clave de la escena a la que conduce.
    target: str
    reason: str = ""
    consequence: str = ""
    immediate_feedback: str = ""
    feedback_text: str = ""
    theory_basis: str = ""
    #: ``RECOMMENDED`` | ``ACCEPTABLE`` | ``RISKY`` | ``CONTRAINDICATED`` (``vocabulary.ResponseClass``).
    response_class: str = "ACCEPTABLE"
    #: ``{persona?, milestones?, competencies?}``: lo que la opción mueve (el documento 2.0 no lleva puntaje).
    effects: dict = field(default_factory=dict)
    #: Condición para que la opción se ofrezca (hechos de ``conditions``); ``{}`` = siempre disponible (documento 2.1).
    requires: dict = field(default_factory=dict)
    #: ``{linea?, emocion?, gesto?, personaje?}``: cómo reacciona la persona; ``{}`` = la reacción por defecto (2.1).
    reaction: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Comment:
    """Un comentario de un personaje presente en la sala de la escena (documento 2.1)."""
    character: str
    line: str
    #: Condición con hechos para que el comentario se diga; ``{}`` = siempre.
    when: dict = field(default_factory=dict)
    emotion: str = ""
    gesture: str = ""


@dataclass(frozen=True)
class Scene:
    key: str
    title: str
    narrative: str
    sensitive: bool = False
    warning: str = ""
    start: bool = False
    terminal: bool = False
    support: tuple[str, ...] = ()
    required_tools: tuple[str, ...] = ()
    safe_exit_required: bool = False
    #: ``LOW`` | ``MEDIUM`` | ``HIGH`` (``vocabulary.Intensity``).
    intensity: str = "MEDIUM"
    x: int = 0
    y: int = 0
    #: El enunciado de la decisión (``decision_prompt``); vacío = la escena no lo declara.
    prompt: str = ""
    #: Las pistas del mapa de la escena, por ``hint_order``.
    hints: tuple[str, ...] = ()
    options: tuple[Option, ...] = ()
    #: La sala de la escena, o ``None`` si la escena no tiene mapa.
    world: World | None = None
    #: Lo que el estudiante debe lograr en la escena, en una frase; vacío = la escena no lo declara (documento 2.1).
    goal: str = ""
    #: Lo que los personajes comentan en la sala de la escena (documento 2.1).
    comments: tuple[Comment, ...] = ()


@dataclass(frozen=True)
class CaseDefinition:
    code: str
    title: str
    description: str
    semantic_version: str
    #: ``DRAFT`` | ``IN_REVIEW`` | ``PUBLISHED`` | ``ARCHIVED``.
    status: str
    context: str = ""
    objectives: tuple[str, ...] = ()
    rules: dict = field(default_factory=dict)
    world_schema_version: int = 1
    characters: tuple[Character, ...] = ()
    tools: tuple[Tool, ...] = ()
    scenes: tuple[Scene, ...] = ()
    rubrics: tuple[Rubric, ...] = ()
    #: RK-7 · Temas sensibles que la ficha declara al estudiante antes de entrar (vacío = el caso no declara ninguno).
    content_warnings: tuple[str, ...] = ()
