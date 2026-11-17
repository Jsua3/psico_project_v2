"""C1 · Ensamblado del caso generado: el esqueleto y las escenas en un documento ``x-siep`` 2.1, su importación y las marcas.

``build`` es puro (recibe datos, devuelve un ``CaseDefinition`` con ``dataclasses.replace``). ``base_definition`` y
``assemble`` tocan la base de datos, pero ``base_definition`` no deja filas y ``assemble`` solo crea el borrador cuando decide
``imported``; con ``needs_repair`` o ``failed`` no queda ni un caso, ni una versión, ni una rúbrica a medias.

Python nunca confía en el modelo: el documento ensamblado pasa por ``validate_document`` antes de importarse y las faltas se
atribuyen a una escena por su ruta (``escenas[i]`` y ``x-siep.escenas[i]``).
"""
import json
import re
from dataclasses import dataclass, replace
from typing import Literal

from django.db import transaction

from apps.simulation.casedef import import_
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.model import CaseDefinition, Comment, DialogueChoice, DialogueLine, DialogueTree, Option, Scene, World
from apps.simulation.casedef.report import ERROR
from apps.simulation.casedef.validate import validate_document
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    DialogueLine as DialogueLineRow,
    MapObject,
    Rubric,
    RubricCriterion,
    SimulationNode,
)
from apps.simulation.services.authoring import importing
from apps.simulation.services.authoring.cases import create_case
from apps.simulation.services.authoring.definition_io import load_definition
from apps.simulation.services.authoring.validation import issue_dict
from shared.exceptions import ApiError
from shared.jsonutils import read_map

from . import checks, lifecycle
from .checks import SceneDraft, SkeletonDraft

#: Las faltas que son del contenido y no impiden importar (``importing.RULE_FAULT_PREFIXES``).
EDITORIAL_PREFIXES = importing.RULE_FAULT_PREFIXES

_PATH_SCENE = re.compile(r"^(?:x-siep\.)?escenas\[(\d+)\]")
_TREE_EMOTION = "neutral"


def is_editorial(issue) -> bool:
    """¿La falta (un ``Issue`` o su ``dict``) es del contenido (``DSL.OCL-*``, ``DSL.PROP-*``, ``DSL.TEXT_*``)?"""
    code = issue["code"] if isinstance(issue, dict) else issue.code
    return code.startswith(EDITORIAL_PREFIXES)


@dataclass
class AssembleResult:
    result: Literal["imported", "needs_repair", "failed"]
    case_version_id: int | None
    issues: list[dict]
    by_scene: dict[str, list[dict]]
    document: dict


class _Rollback(Exception):
    """Deshace la transacción de ``base_definition`` llevándose la definición (no deja filas)."""

    def __init__(self, definition: CaseDefinition):
        super().__init__("base_definition")
        self.definition = definition


def _copy_default_rubric(version, actor) -> None:
    """Una rúbrica propia de la versión, copia de la rúbrica por defecto (mismo recorrido que ``rubric_service.duplicate``)."""
    source = Rubric.objects.filter(is_default=True, active=True).order_by("id").first()
    if source is None:
        return
    copy = Rubric.objects.create(
        case_version=version, name=source.name, description=source.description, active=True, version=source.version,
        is_default=False, created_by=actor,
    )
    for c in RubricCriterion.objects.filter(rubric_id=source.id).order_by("display_order", "id"):
        RubricCriterion.objects.create(
            rubric=copy, competency=c.competency, competency_ref=c.competency_ref, title=c.title,
            description=c.description, weight=c.weight, max_score=c.max_score, active=c.active, display_order=c.display_order,
        )


def base_definition(lugar_id: str, sk: SkeletonDraft, actor) -> CaseDefinition:
    """La definición base: las salas del lugar copiadas, los personajes, las herramientas, los hitos y la rúbrica.

    Crea el borrador de verdad (con ``create_case``, que sabe copiar las salas), lo lee como ``CaseDefinition`` y **deshace
    todo**: no deja ninguna fila.
    """
    try:
        with transaction.atomic():
            created = create_case(
                {"title": sk.titulo, "description": sk.contexto, "lugarId": lugar_id, "salas": [e.sala for e in sk.escenas],
                 "porPiezas": True},
                actor,
            )
            version_id = created["caseVersionId"]
            _copy_default_rubric(CaseVersion.objects.get(pk=version_id), actor)
            raise _Rollback(load_definition(version_id).definition)
    except _Rollback as done:
        return done.definition


# ─── armado (puro) ────────────────────────────────────────────────────────────────────────────────


def _effects(option: dict) -> dict:
    effects = {}
    if option["efectoVinculo"] or option["efectoActivacion"]:
        effects["persona"] = {"bond": option["efectoVinculo"], "activation": option["efectoActivacion"]}
    if option["hitos"]:
        effects["milestones"] = list(option["hitos"])
    if option["competencias"]:
        effects["competencies"] = list(option["competencias"])
    return effects


def _reaction(option: dict) -> dict:
    pairs = (("linea", option["reaccionLinea"]), ("emocion", option["reaccionEmocion"]), ("gesto", option["reaccionGesto"]))
    return {key: value for key, value in pairs if value}


def _option(sala: str, option: dict) -> Option:
    return Option(
        key=f"{sala}-{option['clave']}", text=option["texto"], target=option["destino"], reason=option["razonProhibicion"],
        immediate_feedback=option["retroalimentacion"], feedback_text=option["retroalimentacion"],
        response_class=option["clase"], effects=_effects(option), requires=dict(option["requiere"]),
        reaction=_reaction(option),
    )


def _comment(comment: dict) -> Comment:
    return Comment(
        character=comment["personaje"], line=comment["linea"], when=dict(comment.get("cuando") or {}),
        emotion=comment.get("emocion", ""), gesture=comment.get("gesto", ""),
    )


def _world(world: World, outline, draft: SceneDraft, options: tuple[Option, ...], names: dict[str, str]) -> World:
    """La sala con la persona a atender marcada y el guion colgado de ella (como el del editor)."""
    objects = tuple(
        replace(obj, metadata={**obj.metadata, "personaClave": True}) if obj.key == outline.persona else obj
        for obj in world.objects
    )
    speaker = lambda character: names.get(character, character)  # noqa: E731
    tree = DialogueTree(
        key=f"guion-{outline.sala}", speaker=speaker(draft.lineas[0]["personaje"]) if draft.lineas else "Guion",
        portrait_key=None, emotion=_TREE_EMOTION, object_key=outline.persona,
        lines=tuple(
            DialogueLine(order=order, speaker=speaker(line["personaje"]), text=line["texto"], emotion=line["emocion"])
            for order, line in enumerate(draft.lineas, start=1)
        ),
        choices=tuple(
            DialogueChoice(key=option.key, text=option.text, option=option.key, order=order)
            for order, option in enumerate(options, start=1)
        ),
    )
    return replace(world, objects=objects, dialogues=(*world.dialogues, tree))


def build(base: CaseDefinition, sk: SkeletonDraft, scenes: dict[str, SceneDraft]) -> CaseDefinition:
    """La definición del caso generado: ``base`` (salas, personajes, herramientas, rúbrica) con lo que escribió la IA."""
    by_sala = {scene.key: scene for scene in base.scenes}
    names = {character.key: character.display_name for character in base.characters}
    built: list[Scene] = []
    salas_con_estructura: set[str] = set()
    for position, outline in enumerate(sk.escenas):
        draft = scenes[outline.sala]
        options = tuple(_option(outline.sala, option) for option in draft.opciones)
        scene = by_sala[outline.sala]
        world = scene.world
        if world is not None and draft.estructura is not None and outline.sala not in salas_con_estructura:
            world = replace(world, structure=draft.estructura)
            salas_con_estructura.add(outline.sala)
        built.append(replace(
            scene, title=outline.titulo, goal=outline.objetivo, intensity=outline.intensidad, warning=outline.advertencia,
            sensitive=outline.intensidad == "HIGH", start=position == 0, terminal=outline.final, narrative=draft.narracion,
            hints=tuple(draft.pistas), comments=tuple(_comment(c) for c in draft.comentarios), options=options,
            world=_world(world, outline, draft, options, names) if world is not None else None,
        ))
    milestones = [m for m in base.rules.get("milestones", []) if m.get("key") in sk.hitos]
    rules = {**base.rules, "milestones": milestones, "endings": [dict(final) for final in sk.finales]}
    return replace(
        base, title=sk.titulo, description=sk.contexto, context=sk.contexto, objectives=tuple(sk.objetivos),
        rules=rules, scenes=tuple(built),
    )


# ─── marcas de la IA ──────────────────────────────────────────────────────────────────────────────


def mark_ai_suggested(case_version_id: int, persona_keys: dict[str, str]) -> int:
    """``ai_suggested`` en los nodos, las opciones, las líneas de diálogo, la persona a atender de cada sala y los finales.

    ``persona_keys`` es ``{sala: clave de la persona}``. El objetivo, las pistas y los comentarios quedan cubiertos por la
    marca de su escena. Devuelve cuántas partes marcó.
    """
    marked = SimulationNode.objects.filter(case_version_id=case_version_id).update(ai_suggested=True)
    marked += DecisionOption.objects.filter(case_version_id=case_version_id).update(ai_suggested=True)
    marked += DialogueLineRow.objects.filter(dialogue_tree__scene_map__case_version_id=case_version_id).update(ai_suggested=True)
    for sala, key in persona_keys.items():
        marked += MapObject.objects.filter(
            scene_map__case_version_id=case_version_id, scene_map__node__node_key=sala, object_key=key, object_type="PERSON",
        ).update(ai_suggested=True)
    version = CaseVersion.objects.get(pk=case_version_id)
    raw = read_map(version.rules)
    endings = raw.get("endings") if isinstance(raw.get("endings"), list) else []
    for ending in endings:
        if isinstance(ending, dict):
            ending["aiSuggested"] = True
            marked += 1
    if endings:
        raw["endings"] = endings
        version.rules = json.dumps(raw, ensure_ascii=False)
        version.save(update_fields=["rules"])
    return marked


# ─── ensamblado ───────────────────────────────────────────────────────────────────────────────────


def _scene_of(path: str, document: dict, order: list[str]) -> str | None:
    """La sala de la escena a la que apunta la ruta de una falta (``escenas[i]`` o ``x-siep.escenas[i]``), o ``None``."""
    found = _PATH_SCENE.match(path or "")
    if found is None:
        return None
    index = int(found.group(1))
    entries = (document.get("x-siep") or {}).get("escenas")
    if isinstance(entries, list) and index < len(entries) and isinstance(entries[index], dict):
        key = entries[index].get("clave")
        if isinstance(key, str):
            return key
    return order[index] if index < len(order) else None


def _document(gen_lugar: str, sk: SkeletonDraft, scenes: dict[str, SceneDraft], actor) -> dict:
    return to_document(build(base_definition(gen_lugar, sk, actor), sk, scenes))


def assemble(gen, actor) -> AssembleResult:
    """Ensambla, valida y decide: ``imported`` (crea el borrador y lo marca), ``needs_repair`` o ``failed`` (no crean nada)."""
    sk = checks.from_json(SkeletonDraft, json.loads(gen.skeleton_json))
    scenes = {
        key: checks.from_json(SceneDraft, value["data"]) for key, value in json.loads(gen.scenes_json).items()
        if value.get("data")
    }
    order = [outline.sala for outline in sk.escenas]
    document = _document(gen.lugar_id, sk, scenes, actor)
    issues = validate_document(document) + import_.import_issues(document)
    errors = [issue for issue in issues if issue.severity == ERROR]

    by_scene: dict[str, list[dict]] = {}
    unattributed = []
    for issue in errors:
        sala = _scene_of(issue.path, document, order)
        if sala is None:
            unattributed.append(issue)
        else:
            by_scene.setdefault(sala, []).append(issue_dict(issue))
    blocking_unattributed = [issue for issue in unattributed if not is_editorial(issue)]
    rounds_left = gen.repair_rounds < lifecycle.MAX_REPAIR_ROUNDS
    remaining = [issue_dict(issue) for issue in errors]

    if errors and rounds_left and by_scene and not blocking_unattributed:
        return AssembleResult("needs_repair", None, remaining, by_scene, document)
    if any(not is_editorial(issue) for issue in errors):
        return AssembleResult("failed", None, remaining, by_scene, document)

    persona_keys = {outline.sala: outline.persona for outline in sk.escenas}
    for attempt in range(2):
        try:
            with transaction.atomic():
                imported = importing.import_document(document, actor, allow_rule_faults=True)
                mark_ai_suggested(imported["caseVersionId"], persona_keys)
            return AssembleResult("imported", imported["caseVersionId"], remaining, by_scene, document)
        except ApiError as exc:
            if exc.api_code == "CASE_VERSION_EXISTS" and attempt == 0:
                # Otra importación tomó el código que eligió ``base_definition``: se vuelve a armar con otro.
                document = _document(gen.lugar_id, sk, scenes, actor)
                continue
            if exc.api_code == "DSL_INVALID":
                return AssembleResult("failed", None, exc.extra.get("issues", remaining), {}, document)
            raise
    raise AssertionError("inalcanzable")  # pragma: no cover
