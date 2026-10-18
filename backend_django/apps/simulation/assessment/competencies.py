"""El perfil por competencia de un intento (E6-1b, RQ-NEG-001, RQ-NEG-002; mesa §A20).

Cada decisión registrada aporta un nivel formativo a las competencias de la rúbrica del caso:

- **por defecto** el de su severidad (``LEVEL_BY_SEVERITY``) a TODAS las competencias de la rúbrica;
- si la opción declara ``effects.competencies`` aporta SOLO a esas y con esos niveles (los datos del autor mandan);
  un código que no es de la rúbrica se ignora.

El nivel de una competencia es el **promedio** de los índices (1–4) de sus aportes, con la mitad hacia arriba, y
``CRITICAL_CAP`` como tope si la tocó una decisión crítica *por defecto*: una conducta revictimizante no puede dar
«logrado» en la competencia. Todo esto son definiciones en **BORRADOR** hasta que Psicología las confirme: la regla es
``level_of`` y la tabla ``LEVEL_BY_SEVERITY``.

Lo puro (``level_of``, ``contributions``) no toca la base; ``rubric_competencies`` y ``competency_profile`` leen la
rúbrica del caso con un número constante de consultas. El catálogo (alta y lectura) sigue en ``services.competencies``.
"""
from collections import namedtuple
from decimal import ROUND_HALF_UP, Decimal

from rest_framework.exceptions import NotFound

from apps.simulation.models import LEVEL_INDEX, FormativeLevel, RubricCriterion
from apps.simulation.services import case_effects, case_rules, rubric_service
from apps.simulation.services.competencies import normalize_code

from .definitions import PROFILE_RULES  # noqa: F401  (la versión de la regla vive con las definiciones y se sella en el reporte)

Competence = namedtuple("Competence", ["code", "name"])

#: Nivel que aporta una decisión según su severidad (R3, BORRADOR).
LEVEL_BY_SEVERITY = {
    case_rules.SEVERITY_RECOMMENDED: FormativeLevel.DESTACADO,
    case_rules.SEVERITY_ACCEPTABLE: FormativeLevel.LOGRADO,
    case_rules.SEVERITY_RISKY: FormativeLevel.EN_PROCESO,
    case_rules.SEVERITY_CRITICAL: FormativeLevel.EN_INICIO,
}
#: Techo de una competencia a la que aportó una decisión crítica por defecto (R3, BORRADOR).
CRITICAL_CAP = FormativeLevel.EN_PROCESO

_LEVEL_OF_INDEX = {index: level for level, index in LEVEL_INDEX.items()}


def level_of(contributions):
    """El nivel de una competencia a partir de sus aportes ``(nivel, crítica)``; ``None`` si no hubo ninguno."""
    contributions = list(contributions)
    if not contributions:
        return None
    mean = Decimal(sum(LEVEL_INDEX[level] for level, _ in contributions)) / len(contributions)
    index = int(mean.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if any(critical for _, critical in contributions):
        index = min(index, LEVEL_INDEX[CRITICAL_CAP])
    return _LEVEL_OF_INDEX[max(1, min(4, index))]


def contributions(decision, codes):
    """Lo que aporta una opción: ``{código: (nivel, crítica)}`` para las competencias de ``codes`` que toca.

    ``crítica`` marca el aporte que pone el tope ``CRITICAL_CAP``: el POR DEFECTO de una decisión de severidad crítica
    y el de CUALQUIER conducta prohibida —aunque el autor le fije otra severidad o le declare el nivel—, porque una
    conducta revictimizante no puede dar «logrado». Fuera de eso, cuando el autor declara el nivel de una competencia,
    ese nivel es el que quiso y no se le pone tope.
    """
    prohibited = bool(getattr(decision, "prohibited_conduct", False))
    overrides = case_rules.competency_overrides(decision)
    if overrides:
        return {
            code: (FormativeLevel(level), prohibited) for code, level in overrides.items() if code in codes
        }
    severity = case_effects.option_severity(decision)
    level = LEVEL_BY_SEVERITY[severity]
    critical = prohibited or severity == case_rules.SEVERITY_CRITICAL
    return {code: (level, critical) for code in codes}


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


BASIS_DEFAULT, BASIS_DECLARED, BASIS_MIXED = "DEFAULT", "DECLARED", "MIXED"


def _basis(declared_flags):
    """De dónde salió el nivel: ``DECLARED`` (todas las decisiones que la tocaron declaran ``effects.competencies``),
    ``DEFAULT`` (ninguna: se infirió de su severidad) o ``MIXED``; ``None`` si ninguna la tocó."""
    if not declared_flags:
        return None
    if all(declared_flags):
        return BASIS_DECLARED
    return BASIS_DEFAULT if not any(declared_flags) else BASIS_MIXED


def competency_profile(attempt, events):
    """``[{"code", "name", "level", "basis"}]`` del intento: una entrada por competencia de la rúbrica del caso.

    ``events`` son los eventos del intento con ``decision_option`` cargada. Solo cuentan las decisiones registradas
    (no los reintentos). ``level`` es ``None`` si ninguna decisión tocó la competencia («sin evidencia»). ``basis``
    dice si el nivel lo DECLARÓ el autor del caso o se INFIRIÓ de la severidad de las decisiones: sin declaraciones,
    todas las competencias salen con el mismo nivel (el de la severidad media) y quien lee el reporte debe saberlo.
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
    declared = {code: [] for code in codes}
    for event in events:
        if event.decision_option_id is None or event.event_type not in case_effects.REGISTERED_DECISION_EVENT_TYPES:
            continue
        is_declared = bool(case_rules.competency_overrides(event.decision_option))
        for code, contribution in contributions(event.decision_option, codes).items():
            gathered[code].append(contribution)
            declared[code].append(is_declared)
    profile = []
    for competence in competences:
        level = level_of(gathered[competence.code])
        profile.append({
            "code": competence.code, "name": competence.name,
            "level": level.value if level else None, "basis": _basis(declared[competence.code]),
        })
    return profile
