"""El documento base del caso: el DSL v1.0 del taller a partir del modelo (R6–R9 de E4).

La base es una **proyección fiel** de lo que el esquema del taller puede expresar: nunca se inventa un
valor para completarlo. Lo que no cabe —un personaje sin ``rol``, una herramienta sin descripción, una
escena que solo se alcanza por una puerta— queda fuera de la base (E4-1b lo lleva completo a
``x-siep``). Los ids de DSL (``E01``, ``OP02``…) son la posición dentro de la tupla del modelo, que ya
viene en el orden canónico.
"""
from dataclasses import dataclass

from .model import CaseDefinition

#: ``caso.estado``: ``IN_REVIEW`` no tiene equivalente en el taller y se lee como borrador.
STATE = {"DRAFT": "BORRADOR", "IN_REVIEW": "BORRADOR", "PUBLISHED": "PUBLICADO", "ARCHIVED": "ARCHIVADO"}
CLASSIFICATION = {"ADEQUATE": "ADECUADA", "RISKY": "RIESGOSA", "INADEQUATE": "INADECUADA"}
#: El esquema exige ``decision.pregunta`` y el producto la tiene como dato blando (``decision_prompt``,
#: vacío en el caso sembrado). Cuando falta se escribe este texto neutral —solo en el documento: el
#: importador lo descarta (``x-siep.escenas[].preguntaDerivada``)—.
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
DERIVED_PROMPT = "¿Qué decisión tomas en esta escena?"


@dataclass(frozen=True)
class Ids:
    """Los ids de DSL de cada entidad de la base, por las claves del producto."""

    #: Claves de las escenas de la base, en el orden del modelo.
    base_scenes: tuple
    scene: dict
    #: clave de escena → id de su decisión (solo las escenas con opciones).
    decision: dict
    #: (clave de escena, clave de opción) → ``OP01``.
    option: dict
    #: (clave de escena, clave de opción) → ``R01`` (solo las que llevan retroalimentación propia).
    feedback: dict
    #: clave de personaje → ``P01`` (solo los que tienen rol).
    character: dict
    #: código de herramienta → ``H01`` (solo las que tienen descripción).
    tool: dict
    #: índice de rúbrica → ``RUB-01`` (solo las que tienen criterios usables).
    rubric: dict
    #: (índice de rúbrica, índice de criterio) → ``CR01`` (numeración global: PROP-01).
    criterion: dict


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _width(total):
    return max(2, len(str(total)))


def _number(prefix, position, total):
    return f"{prefix}{position:0{_width(total)}d}"


def _reachable(scenes, start_key):
    """Las claves de las escenas a las que se llega desde ``start_key`` por las opciones."""
    by_key = {scene.key: scene for scene in scenes}
    seen, pending = {start_key}, [start_key]
    while pending:
        scene = by_key.get(pending.pop())
        if scene is None:
            continue
        for option in scene.options:
            if option.target in by_key and option.target not in seen:
                seen.add(option.target)
                pending.append(option.target)
    return seen


def _usable_criteria(rubric):
    return [
        (index, criterion) for index, criterion in enumerate(rubric.criteria)
        if _text(criterion.competency) and _text(criterion.title)
    ]


def ids_of(definition):
    """Asigna los ids de DSL de la base (R6)."""
    scenes = definition.scenes
    start = next((scene for scene in scenes if scene.start), None)
    if start is None:
        base = list(scenes)  # sin inicio no hay desde dónde medir: nada se deja fuera en silencio
    else:
        reached = _reachable(scenes, start.key)
        base = [scene for scene in scenes if scene.key in reached]

    scene_ids = {scene.key: _number("E", n, len(base)) for n, scene in enumerate(base, 1)}
    with_options = [scene for scene in base if scene.options]
    decision_ids = {scene.key: _number("D", n, len(with_options)) for n, scene in enumerate(with_options, 1)}
    all_options = [(scene.key, option) for scene in base for option in scene.options]
    option_ids = {
        (scene_key, option.key): _number("OP", n, len(all_options))
        for n, (scene_key, option) in enumerate(all_options, 1)
    }
    with_feedback = [
        (scene_key, option) for scene_key, option in all_options
        if _text(option.feedback_text) and _text(option.theory_basis)
    ]
    feedback_ids = {
        (scene_key, option.key): _number("R", n, len(with_feedback))
        for n, (scene_key, option) in enumerate(with_feedback, 1)
    }
    characters = [c for c in definition.characters if _text(c.role_label) and _text(c.display_name)]
    character_ids = {c.key: _number("P", n, len(characters)) for n, c in enumerate(characters, 1)}
    tools = [t for t in definition.tools if _text(t.label) and _text(t.description)]
    tool_ids = {t.code: _number("H", n, len(tools)) for n, t in enumerate(tools, 1)}

    usable = [
        (index, rubric) for index, rubric in enumerate(definition.rubrics)
        if _text(rubric.name) and _usable_criteria(rubric)
    ]
    rubric_ids = {index: _number("RUB-", n, len(usable)) for n, (index, _) in enumerate(usable, 1)}
    flat = [(index, c_index) for index, rubric in usable for c_index, _ in _usable_criteria(rubric)]
    criterion_ids = {pair: _number("CR", n, len(flat)) for n, pair in enumerate(flat, 1)}

    return Ids(
        base_scenes=tuple(scene.key for scene in base), scene=scene_ids, decision=decision_ids,
        option=option_ids, feedback=feedback_ids, character=character_ids, tool=tool_ids,
        rubric=rubric_ids, criterion=criterion_ids,
    )


def _option_document(scene, option, ids):
    document = {
        "id": ids.option[(scene.key, option.key)],
        "texto": option.text,
        "siguienteEscena": ids.scene.get(option.target, ""),
        "clasificacion": CLASSIFICATION.get(option.classification, option.classification),
    }
    if option.prohibited:
        document["conductaProhibida"] = True
    if _text(option.reason):
        document["motivoProhibicion"] = option.reason
    if _text(option.consequence):
        document["consecuencia"] = option.consequence
    return document


def _scene_document(scene, position, ids):
    document = {"id": ids.scene[scene.key], "orden": position}
    if _text(scene.title):
        document["titulo"] = scene.title
    if _text(scene.narrative):
        document["descripcion"] = scene.narrative
    if scene.sensitive:
        document["contenidoSensible"] = True
    if _text(scene.warning):
        document["advertencia"] = scene.warning
    if scene.options:
        decision = {
            "id": ids.decision[scene.key],
            "pregunta": scene.prompt if _text(scene.prompt) else DERIVED_PROMPT,
            "opciones": [_option_document(scene, option, ids) for option in scene.options],
        }
        hints = [hint for hint in scene.hints if _text(hint)]
        if hints:
            decision["pistas"] = hints
        document["decision"] = decision
    return document


def _feedback_documents(definition, ids):
    documents = []
    by_key = {scene.key: scene for scene in definition.scenes}
    for scene_key in ids.base_scenes:
        for option in by_key[scene_key].options:
            feedback_id = ids.feedback.get((scene_key, option.key))
            if feedback_id:
                documents.append({
                    "id": feedback_id, "opcion": ids.option[(scene_key, option.key)],
                    "mensaje": option.feedback_text, "fundamentoTeorico": option.theory_basis,
                })
    return documents


def _rubric_documents(definition, ids):
    documents = []
    for index, rubric in enumerate(definition.rubrics):
        if index not in ids.rubric:
            continue
        criteria = []
        for position, (c_index, criterion) in enumerate(_usable_criteria(rubric), 1):
            item = {
                "id": ids.criterion[(index, c_index)], "competencia": criterion.competency,
                "titulo": criterion.title, "orden": position,
            }
            if _text(criterion.description):
                item["descripcion"] = criterion.description
            criteria.append(item)
        document = {
            "id": ids.rubric[index], "nombre": rubric.name, "version": rubric.version,
            "activa": bool(rubric.active), "criterios": criteria,
        }
        if _text(rubric.description):
            document["descripcion"] = rubric.description
        documents.append(document)
    return documents


def to_document(definition: CaseDefinition):
    """El documento del DSL v1.0 (la «base») de ``definition``; ``x-siep`` lo añade E4-1b."""
    ids = ids_of(definition)
    by_key = {scene.key: scene for scene in definition.scenes}
    base_scenes = [by_key[key] for key in ids.base_scenes]

    caso = {
        "id": definition.code, "version": definition.semantic_version,
        "estado": STATE.get(definition.status, "BORRADOR"),
    }
    if _text(definition.title):
        caso["titulo"] = definition.title
    if _text(definition.description):
        caso["descripcion"] = definition.description
    objectives = [text for text in definition.objectives if _text(text)]
    if objectives:
        caso["objetivosAprendizaje"] = objectives
    start = next((scene for scene in base_scenes if scene.start), None)
    if start is not None:
        caso["escenaInicial"] = ids.scene[start.key]
    active_rubric = next(
        (ids.rubric[index] for index, rubric in enumerate(definition.rubrics)
         if index in ids.rubric and rubric.active),
        None,
    )
    if active_rubric:
        caso["rubrica"] = active_rubric

    return {
        "versionDsl": "1.0",
        "caso": caso,
        "personajes": [
            {"id": ids.character[c.key], "nombre": c.display_name, "rol": c.role_label}
            for c in definition.characters if c.key in ids.character
        ],
        "herramientas": [_tool_document(t, ids) for t in definition.tools if t.code in ids.tool],
        "escenas": [_scene_document(scene, n, ids) for n, scene in enumerate(base_scenes, 1)],
        "retroalimentacion": _feedback_documents(definition, ids),
        "rubricas": _rubric_documents(definition, ids),
    }


def _tool_document(tool, ids):
    document = {"id": ids.tool[tool.code], "nombre": tool.label, "descripcion": tool.description}
    if _text(tool.category):
        document["categoria"] = tool.category
    return document
