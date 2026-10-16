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


@dataclass(frozen=True)
class Rubric:
    name: str
    description: str = ""
    version: str = "1.0"
    active: bool = True
    criteria: tuple[Criterion, ...] = ()


@dataclass(frozen=True)
class Option:
    key: str
    text: str
    #: Clave de la escena a la que conduce.
    target: str
    #: ``ADEQUATE`` | ``RISKY`` | ``INADEQUATE``.
    classification: str
    prohibited: bool = False
    reason: str = ""
    consequence: str = ""
    immediate_feedback: str = ""
    feedback_text: str = ""
    theory_basis: str = ""
    score: int = 0
    stress: int = 0
    penalty: int = 0
    effects: dict = field(default_factory=dict)


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
    x: int = 0
    y: int = 0
    #: El enunciado de la decisión (``decision_prompt``); vacío = la escena no lo declara.
    prompt: str = ""
    #: Las pistas del mapa de la escena, por ``hint_order``.
    hints: tuple[str, ...] = ()
    options: tuple[Option, ...] = ()
    #: El mundo (mapa, objetos, diálogos): ``None`` hasta que E4-1b lo carga.
    world: object = None


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
