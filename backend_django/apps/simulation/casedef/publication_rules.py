"""Las seis reglas de publicación del modelo de respuesta (Tarea 10 del modelo de métricas).

Python puro, sin Django: recibe un ``PublicationGraph`` (escenas, opciones, hitos, finales y los
códigos de competencia de la rúbrica; lo arma ``services/authoring/validation.py`` desde las filas)
y devuelve la lista de ``Issue``. Cada código es estable y bloquea la publicación (``error``) salvo
los dos avisos que se explican abajo:

1. ``scene-without-recommended``: una escena que no es final y tiene opciones, sin ninguna ``RECOMMENDED``.
2. ``contraindicated-without-reason``: una opción ``CONTRAINDICATED`` sin ``prohibition_reason``.
3. ``milestone-unreachable``: un hito declarado que ninguna opción de una escena alcanzable desde la
   inicial cumple (incluye el que ninguna opción cumple).
4. ``ending-unreachable``: un final con ``when`` que ningún camino completo (de la escena inicial a una
   final) puede satisfacer. Se evalúa cada ``when`` contra los contextos posibles de los caminos: los hitos
   reunidos, los conteos por clase y la persona avanzada paso a paso (el ``effects.persona`` de la opción o la
   tabla por clase). No se mira el orden de evaluación: un final es alcanzable si algún camino cumple su
   condición. Además ``ending-without-default``: el caso declara finales propios, ninguno es el de por defecto y
   algún camino no cumple ninguno. Un final PROPIO inalcanzable es ``error``; uno de la PLANTILLA es ``warning``
   (la plantilla es automática y un caso pequeño o sin hitos decisivos puede no darla). Los caminos se enumeran con tope (``MAX_PATHS`` caminos, ``MAX_STEPS`` pasos, ``MAX_DEPTH``
   escenas, un reencuentro con una escena ya visitada corta el camino): si el tope se alcanza no se afirma nada
   y sale un único aviso ``ending-reachability-skipped``. Sin ningún camino completo tampoco se dice nada: eso
   ya lo reporta el validador del mundo.
5. ``competency-without-evidence``: una competencia de la rúbrica que ninguna opción alcanzable declara en
   ``effects.competencies``. **Regla de transición** hasta que el editor (P4-P6) haga obligatoria la
   declaración: es ``error`` solo cuando alguna opción de la versión ya declara competencias (el autor empezó a
   declarar) y un ``warning`` («ninguna respuesta declara competencias todavía») si ninguna lo hace, para que un
   caso autorado antes de este modelo siga siendo publicable.
6. ``high-intensity-without-warning``: una escena de intensidad ``HIGH`` sin ``warning_message``.
"""
from collections import deque
from dataclasses import dataclass, field

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import (
    DEFAULT_PERSONA_STEP,
    INITIAL_PERSONA,
    ResponseClass,
    step_persona,
)

ERROR = "error"
WARNING = "warning"

#: Cuántos caminos completos se enumeran como máximo y cuántas escenas puede tener uno.
MAX_PATHS = 2000
MAX_DEPTH = 64
#: Cuántos pasos (opciones recorridas) se permiten en total: acota también las ramas sin salida, que no llegan a un camino.
MAX_STEPS = 20_000

SCENE_WITHOUT_RECOMMENDED = "scene-without-recommended"
CONTRAINDICATED_WITHOUT_REASON = "contraindicated-without-reason"
MILESTONE_UNREACHABLE = "milestone-unreachable"
ENDING_UNREACHABLE = "ending-unreachable"
ENDING_WITHOUT_DEFAULT = "ending-without-default"
ENDING_REACHABILITY_SKIPPED = "ending-reachability-skipped"
COMPETENCY_WITHOUT_EVIDENCE = "competency-without-evidence"
HIGH_INTENSITY_WITHOUT_WARNING = "high-intensity-without-warning"


@dataclass(frozen=True)
class OptionNode:
    key: str
    #: Clave de la escena a la que lleva, o ``None`` si no lleva a ninguna.
    target: str | None
    #: La clase efectiva de la respuesta (``ResponseClass`` como cadena en mayúscula).
    response_class: str
    prohibition_reason: str = ""
    #: Texto corto de la opción para nombrarla en el mensaje.
    label: str = ""
    milestones: tuple[str, ...] = ()
    #: ``(bond, activation)`` declarado en ``effects.persona`` o ``None`` (entonces manda la tabla de la clase).
    persona_step: tuple[int, int] | None = None
    competencies: tuple[str, ...] = ()


@dataclass(frozen=True)
class SceneNode:
    key: str
    title: str = ""
    start: bool = False
    terminal: bool = False
    intensity: str = "MEDIUM"
    warning_message: str = ""
    options: tuple[OptionNode, ...] = ()


@dataclass(frozen=True)
class MilestoneNode:
    key: str
    label: str = ""
    decisive: bool = False


@dataclass(frozen=True)
class EndingNode:
    key: str
    title: str = ""
    #: La condición ``when`` o ``None`` si es el final de por defecto.
    when: dict | None = None


@dataclass(frozen=True)
class PublicationGraph:
    scenes: tuple[SceneNode, ...] = ()
    milestones: tuple[MilestoneNode, ...] = ()
    #: Los finales del caso: los propios o, si no declara, los de la plantilla.
    endings: tuple[EndingNode, ...] = ()
    #: ``True`` si los finales son propios del caso (``rules.endings``); la plantilla siempre trae un final por defecto.
    own_endings: bool = False
    #: Códigos de competencia de la rúbrica (criterios activos enlazados al catálogo).
    rubric_competencies: tuple[str, ...] = ()


@dataclass(frozen=True)
class Issue:
    code: str
    severity: str
    field: str
    scene_key: str | None = None
    option_key: str | None = None
    milestone_key: str | None = None
    ending_key: str | None = None
    competency_code: str | None = None
    #: ``True`` si el final señalado es de la plantilla (cambia la frase del mensaje).
    template: bool = False
    #: Nombres legibles (título de la escena, etiqueta del hito…) para el mensaje; nunca ids.
    labels: dict = field(default_factory=dict, compare=False)


# ─── recorrido ────────────────────────────────────────────────────────────────────────────────
def _start_of(scenes):
    return next((scene for scene in scenes.values() if scene.start), None)


def _reachable_scenes(scenes):
    """Las escenas a las que se llega desde la inicial por alguna opción (la inicial incluida)."""
    start = _start_of(scenes)
    if start is None:
        return {}
    seen = {start.key: start}
    queue = deque([start])
    while queue:
        scene = queue.popleft()
        if scene.terminal:
            continue
        for option in scene.options:
            target = scenes.get(option.target) if option.target else None
            if target is not None and target.key not in seen:
                seen[target.key] = target
                queue.append(target)
    return seen


def _step_of(option):
    if option.persona_step is not None:
        return option.persona_step
    try:
        return DEFAULT_PERSONA_STEP[ResponseClass(option.response_class)]
    except ValueError:
        return (0, 0)


def _context(milestones, counts, persona):
    bond, activation = persona
    return {
        "milestones": set(milestones),
        "counts": dict(counts),
        "persona": {"bond": bond.value, "activation": activation.value},
    }


def _complete_contexts(scenes):
    """``(contextos, omitido)``: los contextos de los caminos completos y si el tope impidió enumerarlos todos."""
    start = _start_of(scenes)
    if start is None:
        return [], False
    contexts, seen, state = [], set(), {"paths": 0, "steps": 0, "skipped": False}
    class_names = tuple(member.value.lower() for member in ResponseClass)

    def walk(scene, visited, milestones, counts, persona):
        if state["skipped"]:
            return
        if scene.terminal:
            state["paths"] += 1
            if state["paths"] > MAX_PATHS:
                state["skipped"] = True
                return
            fingerprint = (frozenset(milestones), tuple(sorted(counts.items())), persona)
            if fingerprint not in seen:
                seen.add(fingerprint)
                contexts.append(_context(milestones, counts, persona))
            return
        if len(visited) >= MAX_DEPTH:
            state["skipped"] = True
            return
        for option in scene.options:
            state["steps"] += 1
            if state["steps"] > MAX_STEPS:
                state["skipped"] = True
                return
            target = scenes.get(option.target) if option.target else None
            if target is None or target.key in visited:
                continue
            next_counts = dict(counts)
            name = option.response_class.lower()
            if name in next_counts:
                next_counts[name] += 1
            next_persona = step_persona(*persona, *_step_of(option))
            walk(target, visited | {target.key}, milestones | set(option.milestones), next_counts, next_persona)

    walk(start, frozenset({start.key}), set(), {name: 0 for name in class_names}, INITIAL_PERSONA)
    return contexts, state["skipped"]


# ─── las reglas ───────────────────────────────────────────────────────────────────────────────
def _scene_labels(scene):
    return {"scene": scene.title or scene.key}


def _scene_rules(graph):
    issues = []
    for scene in graph.scenes:
        if not scene.terminal and scene.options and not any(
            option.response_class == ResponseClass.RECOMMENDED.value for option in scene.options
        ):
            issues.append(Issue(
                SCENE_WITHOUT_RECOMMENDED, ERROR, "responseClass", scene_key=scene.key, labels=_scene_labels(scene),
            ))
        for option in scene.options:
            if option.response_class == ResponseClass.CONTRAINDICATED.value and not option.prohibition_reason.strip():
                issues.append(Issue(
                    CONTRAINDICATED_WITHOUT_REASON, ERROR, "prohibitionReason", scene_key=scene.key,
                    option_key=option.key, labels={**_scene_labels(scene), "option": option.label or option.key},
                ))
        if scene.intensity == "HIGH" and not scene.warning_message.strip():
            issues.append(Issue(
                HIGH_INTENSITY_WITHOUT_WARNING, ERROR, "warningMessage", scene_key=scene.key,
                labels=_scene_labels(scene),
            ))
    return issues


def _milestone_rules(graph, reachable):
    marked = {key for scene in reachable.values() for option in scene.options for key in option.milestones}
    return [
        Issue(MILESTONE_UNREACHABLE, ERROR, "milestones", milestone_key=milestone.key,
              labels={"milestone": milestone.label or milestone.key})
        for milestone in graph.milestones
        if milestone.key not in marked
    ]


def _ending_rules(graph, scenes):
    contexts, skipped = _complete_contexts(scenes)
    if skipped:
        return [Issue(ENDING_REACHABILITY_SKIPPED, WARNING, "endings")]
    if not contexts:
        return []
    issues = []
    severity = ERROR if graph.own_endings else WARNING
    for ending in graph.endings:
        if ending.when is None or not conditions.is_valid(ending.when):
            continue  # el de por defecto siempre aplica; un ``when`` roto ya lo reporta la validación del documento
        if not any(conditions.evaluate(ending.when, context) for context in contexts):
            issues.append(Issue(
                ENDING_UNREACHABLE, severity, "endings", ending_key=ending.key,
                template=not graph.own_endings,
                labels={"ending": ending.title or ending.key},
            ))
    has_default = any(ending.when is None for ending in graph.endings)
    if graph.own_endings and graph.endings and not has_default and all(
        ending.when is None or conditions.is_valid(ending.when) for ending in graph.endings
    ) and any(
        not any(conditions.evaluate(ending.when, context) for ending in graph.endings) for context in contexts
    ):
        issues.append(Issue(ENDING_WITHOUT_DEFAULT, ERROR, "endings"))
    return issues


def _competency_rules(graph, reachable):
    if not graph.rubric_competencies:
        return []
    declared_anywhere = any(option.competencies for scene in graph.scenes for option in scene.options)
    if not declared_anywhere:
        return [Issue(COMPETENCY_WITHOUT_EVIDENCE, WARNING, "effects.competencies")]
    declared = {code for scene in reachable.values() for option in scene.options for code in option.competencies}
    return [
        Issue(COMPETENCY_WITHOUT_EVIDENCE, ERROR, "effects.competencies", competency_code=code,
              labels={"competency": code})
        for code in graph.rubric_competencies
        if code not in declared
    ]


def check(graph):
    """Las ``Issue`` de las seis reglas sobre ``graph`` (lista vacía = nada que resolver)."""
    scenes = {scene.key: scene for scene in graph.scenes}
    reachable = _reachable_scenes(scenes)
    return [
        *_scene_rules(graph),
        *_milestone_rules(graph, reachable),
        *_ending_rules(graph, scenes),
        *_competency_rules(graph, reachable),
    ]
