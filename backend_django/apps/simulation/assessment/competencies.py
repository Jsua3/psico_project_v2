"""El perfil por competencia de un intento (E6-1b, RQ-NEG-001, RQ-NEG-002; mesa §A20; ``borrador-2``).

El nivel de una competencia sale SOLO de lo que el autor declara. Cada decisión registrada cuya opción declara
``effects.competencies`` (``{código: nivel}``) aporta a esas competencias —las de la rúbrica del caso— y con esos
niveles; un código que no es de la rúbrica se ignora. Una opción que no declara nada **no aporta a ninguna**: la
competencia que ninguna decisión tocó queda «sin evidencia» (``level None``). Ya no hay aporte «a todas por defecto»
según la severidad (Revisión de foco 3): inventarle un nivel a una competencia que la persona nunca puso a prueba
era una afirmación que el caso no hacía.

El nivel es el **promedio** de los índices (1–4) de los aportes, con la mitad hacia arriba, y ``CONTRAINDICATED_CAP``
como tope si la tocó una respuesta contraindicada —aunque el autor declare un nivel más alto—: una conducta
revictimizante no puede dar «logrado» en la competencia. Cada entrada del perfil trae ``evidence[]``: las decisiones
registradas que la sostienen, en orden, con su clase y el nivel declarado (lo que el informe del reporte v3 muestra).
Todo esto son definiciones en **BORRADOR** hasta que Psicología las confirme: la regla es ``level_of`` y las tablas
``LEVEL_BY_CLASS`` y ``CONTRAINDICATED_CAP``.

Lo puro (``level_of``, ``contributions``) no toca la base; ``rubric_competencies`` y ``competency_profile`` leen la
rúbrica del caso con un número constante de consultas. El catálogo (alta y lectura) sigue en ``services.competencies``.
"""
from collections import namedtuple
from decimal import ROUND_HALF_UP, Decimal

from rest_framework.exceptions import NotFound

from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.models import LEVEL_INDEX, FormativeLevel, RubricCriterion
from apps.simulation.services import case_effects, case_rules, rubric_service
from apps.simulation.services.case_state import response_class_of
from apps.simulation.services.competencies import normalize_code

from .definitions import PROFILE_RULES  # noqa: F401  (la versión de la regla vive con las definiciones y se sella en el reporte)

Competence = namedtuple("Competence", ["code", "name"])

#: Nivel de referencia de cada clase de respuesta (R3, BORRADOR): lo que una respuesta de esa clase suele evidenciar.
#: Es la tabla que Psicología revisa; el perfil NO la aplica sola: aporta solo el nivel que el autor declara.
LEVEL_BY_CLASS = {
    ResponseClass.RECOMMENDED: FormativeLevel.DESTACADO,
    ResponseClass.ACCEPTABLE: FormativeLevel.LOGRADO,
    ResponseClass.RISKY: FormativeLevel.EN_PROCESO,
    ResponseClass.CONTRAINDICATED: FormativeLevel.EN_INICIO,
}
#: Techo de una competencia a la que aportó una respuesta contraindicada (R3, BORRADOR).
CONTRAINDICATED_CAP = FormativeLevel.EN_PROCESO

_LEVEL_OF_INDEX = {index: level for level, index in LEVEL_INDEX.items()}


def level_of(contributions):
    """El nivel de una competencia a partir de sus aportes ``(nivel, contraindicada)``; ``None`` si no hubo ninguno."""
    contributions = list(contributions)
    if not contributions:
        return None
    mean = Decimal(sum(LEVEL_INDEX[level] for level, _ in contributions)) / len(contributions)
    index = int(mean.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if any(capped for _, capped in contributions):
        index = min(index, LEVEL_INDEX[CONTRAINDICATED_CAP])
    return _LEVEL_OF_INDEX[max(1, min(4, index))]


def contributions(decision, codes):
    """Lo que aporta una opción: ``{código: (nivel, contraindicada)}`` para las competencias de ``codes`` que declara.

    Solo aporta a las competencias que la opción declara en ``effects.competencies`` (y que son de ``codes``), con el
    nivel declarado; sin declaración no aporta a ninguna. ``contraindicada`` marca el aporte de una respuesta
    ``CONTRAINDICATED`` (la clase la da ``response_class_of``, con el respaldo de los datos antiguos), que pone el tope
    ``CONTRAINDICATED_CAP`` aunque el autor declare un nivel más alto: una conducta revictimizante no puede dar
    «logrado». Fuera de eso, el nivel que el autor declara es el que quiso y no se le pone tope.
    """
    capped = response_class_of(decision) is ResponseClass.CONTRAINDICATED
    return {
        code: (FormativeLevel(level), capped)
        for code, level in case_rules.competency_overrides(decision).items() if code in codes
    }


def competency_code_of(criterion):
    """El código de la competencia de un criterio: el del catálogo si está enlazado o el de su texto normalizado."""
    ref = criterion.competency_ref
    return ref.code if ref is not None else normalize_code(criterion.competency)


def active_criteria(rubric):
    """Los criterios activos de la rúbrica con su competencia del catálogo, en orden (una consulta)."""
    return list(
        RubricCriterion.objects.filter(rubric_id=rubric.id, active=True)
        .select_related("competency_ref")
        .order_by("display_order", "id")
    )


def rubric_competencies(rubric, criteria=None):
    """Las competencias de la rúbrica, una vez cada una y en el orden de sus criterios."""
    found = {}
    for criterion in criteria if criteria is not None else active_criteria(rubric):
        code = competency_code_of(criterion)
        if not code or code in found:
            continue
        ref = criterion.competency_ref
        found[code] = Competence(code, ref.name if ref is not None else (criterion.competency or code))
    return list(found.values())


def rubric_of(case_version_id):
    """La rúbrica que aplica al caso o ``None`` si no hay ninguna (un caso sin rúbrica no tiene perfil)."""
    try:
        return rubric_service.rubric_for_case_version(case_version_id)
    except NotFound:
        return None


BASIS_DECLARED = "DECLARED"


def competency_profile(attempt, events):
    """``[{"code", "name", "level", "basis", "evidence"}]`` del intento: una entrada por competencia de la rúbrica.

    ``events`` son los eventos del intento con ``decision_option`` y ``node`` cargados. Solo cuentan las decisiones
    registradas (no los reintentos). ``level`` es ``None`` si ninguna decisión tocó la competencia («sin evidencia»).
    ``basis`` es ``DECLARED`` si alguna decisión la tocó y ``None`` si no: el nivel siempre lo declara el autor del caso.
    Las bases ``DEFAULT`` y ``MIXED`` (nivel inferido de la severidad) existían hasta ``borrador-1`` y ya no se dan; la
    clave se conserva para quienes leen los reportes cerrados. ``evidence`` lista las decisiones que la sostienen, en
    orden: ``{"order", "nodeTitle", "optionText", "class", "level"}`` con ``order`` la posición de la decisión entre
    las registradas (la de ``decisionReview``) y ``level`` el nivel declarado, antes del tope.
    Sin rúbrica, o sin criterios con competencia, el perfil está vacío.
    """
    rubric = rubric_of(attempt.case_version_id)
    if rubric is None:
        return []
    competences = rubric_competencies(rubric)
    if not competences:
        return []
    codes = {competence.code for competence in competences}
    gathered = {code: [] for code in codes}
    supporting = {code: [] for code in codes}
    order = 0
    for event in events:
        if event.decision_option_id is None or event.event_type not in case_effects.REGISTERED_DECISION_EVENT_TYPES:
            continue
        order += 1
        option = event.decision_option
        for code, contribution in contributions(option, codes).items():
            gathered[code].append(contribution)
            supporting[code].append({
                "order": order,
                "nodeTitle": _node_title(event),
                "optionText": option.text,
                "class": response_class_of(option).value,
                "level": contribution[0].value,
            })
    profile = []
    for competence in competences:
        level = level_of(gathered[competence.code])
        profile.append({
            "code": competence.code, "name": competence.name,
            "level": level.value if level else None,
            "basis": BASIS_DECLARED if gathered[competence.code] else None,
            "evidence": supporting[competence.code],
        })
    return profile


def _node_title(event):
    node = getattr(event, "node", None)
    return node.title if node is not None else ""
