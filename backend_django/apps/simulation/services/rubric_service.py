import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from shared import policies
from shared.exceptions import ApiError

from apps.simulation.models import (
    LEVEL_INDEX,
    CaseVersion,
    CriterionScore,
    EvaluationOrigin,
    Rubric,
    RubricCriterion,
    RubricEvaluation,
    SimulationAttempt,
    SimulationRubricAssignment,
)

from . import competencies
from ..assessment import competencies as assessment_competencies
from .audit_service import arg, auditable
from .authoring.guards import ensure_draft

BASIC_RUBRIC_NAME = "R\u00fabrica b\u00e1sica de desempe\u00f1o SIEP"
BASIC_RUBRIC_DESCRIPTION = (
    "Instrumento general para evaluar el análisis, la toma de decisiones, "
    "la actuación profesional, la argumentación y la reflexión del estudiante "
    "durante una simulación psicosocial."
)

BASIC_CRITERIA = [
    (
        "COMPRENSION_SITUACION",
        "Identificación y comprensión de la situación",
        "Reconoce el problema central, factores personales, familiares, sociales y contextuales; diferencia hechos, interpretaciones y supuestos; reconoce señales de riesgo y protección.",
        Decimal("20.00"),
    ),
    (
        "ANALISIS_ARGUMENTACION",
        "Análisis psicosocial y argumentación",
        "Relaciona la información del caso, sustenta decisiones, emplea conceptos pertinentes, evita conclusiones sin evidencia y demuestra pensamiento crítico.",
        Decimal("20.00"),
    ),
    (
        "DECISION_RUTA",
        "Toma de decisiones y ruta de atención",
        "Selecciona acciones adecuadas, establece prioridades, reconoce remisiones pertinentes, aplica la ruta de atención y evita acciones que aumenten el riesgo.",
        Decimal("20.00"),
    ),
    (
        "COMUNICACION_EMPATIA",
        "Comunicación, empatía y trato profesional",
        "Usa lenguaje respetuoso, escucha activa, evita juicios y estigmatización, valida emocionalmente y mantiene actitud ética.",
        Decimal("15.00"),
    ),
    (
        "PAP",
        "Aplicación de primeros auxilios psicológicos",
        "Establece contacto seguro, identifica necesidades inmediatas, reduce activación emocional, orienta y conecta con apoyos adecuados; reconoce los límites de los primeros auxilios psicológicos.",
        Decimal("15.00"),
    ),
    (
        "REFLEXION",
        "Reflexión, bitácora y aprendizaje",
        "Registra decisiones relevantes, reconoce aciertos y errores, reflexiona sobre consecuencias, integra retroalimentación y propone mejoras.",
        Decimal("10.00"),
    ),
]


def _decimal(value, default="0"):
    if value in (None, ""):
        return Decimal(default)
    try:
        return Decimal(str(value))
    except InvalidOperation:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ValidationError("La calificación debe ser un número")


# ─── niveles formativos (E1-9, RN-09, ED-2) ───────────────────────────────────
_LEVEL_BY_INDEX = {index: level for level, index in LEVEL_INDEX.items()}


def _level_from_index(value):
    """El nivel más cercano a un índice 1–4 (promedio ponderado o equivalente de un score)."""
    index = int(Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return _LEVEL_BY_INDEX[max(1, min(4, index))]


def level_for_score(score):
    """El nivel que corresponde a un ``score`` heredado de 1.0–5.0 (la escala de antes de E1-9).

    Solo sirve para LEER filas viejas que traen ``score`` y no ``level``: ya no se acepta como entrada.
    """
    return _level_from_index(Decimal("1") + (Decimal(score) - Decimal("1")) * Decimal("3") / Decimal("4"))


def _level_of(criterion_score):
    """El nivel de una calificación guardada: su ``level`` o, en una fila anterior a E1, el que deriva su ``score``."""
    if criterion_score is None:
        return None
    if criterion_score.level:
        return criterion_score.level
    if criterion_score.score is None:
        return None
    return level_for_score(criterion_score.score)


#: Los niveles que el docente elige, con el descriptor que el selector muestra (el servidor es la única fuente).
LEVELS = [
    {
        "value": "EN_INICIO",
        "label": "En inicio",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "descriptor": "Muestra los primeros acercamientos al criterio; necesita acompañamiento para sostenerlo.",
    },
    {
        "value": "EN_PROCESO",
        "label": "En proceso",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "descriptor": "Aplica el criterio de forma parcial: acierta en algunos momentos y se le escapan otros.",
    },
    {
        "value": "LOGRADO",
        "label": "Logrado",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "descriptor": "Aplica el criterio con solidez y justifica lo que decide.",
    },
    {
        "value": "DESTACADO",
        "label": "Destacado",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "descriptor": "Aplica el criterio con criterio propio y anticipa lo que la situación pide.",
    },
]


def overall_level(weighted_levels):
    """Nivel global: promedio ponderado del índice de cada criterio.

    ``weighted_levels`` son pares ``(peso, nivel)`` de TODOS los criterios activos; si falta
    alguno calificado no hay nivel global (``None``): una evaluación pendiente no concluye nada.
    """
    if not weighted_levels or any(level is None for _, level in weighted_levels):
        return None
    total_weight = sum((Decimal(weight) for weight, _ in weighted_levels), Decimal("0"))
    if total_weight <= 0:
        return None
    weighted = sum((Decimal(weight) * LEVEL_INDEX[level] for weight, level in weighted_levels), Decimal("0"))
    return _level_from_index(weighted / total_weight)


def _criteria_qs(rubric):
    return RubricCriterion.objects.filter(rubric_id=rubric.id, active=True).order_by("display_order", "id")


def _weight(criterion):
    return Decimal(criterion.weight or criterion.max_score or 0)


def criterion_weight(criterion):
    """El peso de un criterio (su ponderación o, a falta de ella, su puntaje máximo)."""
    return _weight(criterion)


def _normalize_criteria_weights(criteria):
    total = sum((_weight(c) for c in criteria), Decimal("0"))
    if total == Decimal("100.00") or not criteria:
        return criteria
    each = (Decimal("100") / len(criteria)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rubric_id = criteria[0].rubric_id
    for index, criterion in enumerate(criteria):
        weight = each
        if index == 0:
            weight += Decimal("100.00") - (each * len(criteria))
        RubricCriterion.objects.filter(pk=criterion.id).update(weight=weight)
    return list(_criteria_qs(Rubric.objects.get(pk=rubric_id)))


def normalize_version_rubrics(case_version_id):
    """Deja las ponderaciones de las rúbricas activas de la versión sumando 100, como lo haría la primera evaluación.

    Se hace al importar y, como red de seguridad, antes de sellar: así el documento sellado ya trae los pesos
    que la evaluación usará y evaluar no reescribe filas de una versión publicada. Una rúbrica inactiva no
    se toca: ninguna evaluación la elige y activarla exige que sus pesos sumen 100.
    """
    for rubric in Rubric.objects.filter(case_version_id=case_version_id, active=True).order_by("id"):
        _normalize_criteria_weights(list(_criteria_qs(rubric)))


def _validate_weights(criteria):
    if not criteria:
        raise ValidationError("La rubrica debe tener al menos un criterio activo")
    total = sum((_weight(c) for c in criteria), Decimal("0"))
    if total != Decimal("100.00"):
        raise ValidationError("La suma de ponderaciones activas debe ser exactamente 100")


def _rubric_summary(rubric, actor=None):
    criteria = list(RubricCriterion.objects.filter(rubric_id=rubric.id).order_by("display_order", "id"))
    total = sum((_weight(c) for c in criteria if c.active), Decimal("0"))
    summary = {
        "id": rubric.id,
        "ownerId": rubric.created_by_id,
        "name": rubric.name,
        "description": rubric.description,
        "active": rubric.active,
        "version": rubric.version,
        "isDefault": rubric.is_default,
        "totalWeight": float(total),
        "criteriaCount": len(criteria),
        "createdAt": rubric.created_at.isoformat() if rubric.created_at else None,
        "updatedAt": rubric.updated_at.isoformat() if rubric.updated_at else None,
    }
    if actor is not None:
        # Quien mira sabe de antemano si puede escribirla (sin intentar guardar para enterarse).
        summary["editable"] = policies.can(actor, "rubric", "edit", owner_id=rubric.created_by_id)
    return summary


def rubric_detail(rubric, actor=None):
    data = _rubric_summary(rubric, actor)
    data["criteria"] = [
        {
            "id": c.id,
            "competency": c.competency,
            "competencyId": c.competency_ref_id,
            "title": c.title,
            "description": c.description,
            "weight": float(_weight(c)),
            "displayOrder": c.display_order,
            "active": c.active,
        }
        for c in RubricCriterion.objects.filter(rubric_id=rubric.id).order_by("display_order", "id")
    ]
    return data


def _visible(actor):
    """Las rúbricas que el actor ve: el ADMIN todas; el profesor las suyas y las del ADMIN (R12)."""
    rubrics = Rubric.objects.all()
    if getattr(actor, "role", None) == "ADMIN":
        return rubrics
    return rubrics.filter(Q(created_by_id=actor.id) | Q(created_by__role="ADMIN"))


def _load_visible(rubric_id, actor):
    """Una rúbrica visible o 404: no se confirma la existencia de la de otro docente (R3)."""
    rubric = _visible(actor).filter(pk=rubric_id).first()
    if not rubric:
        raise NotFound("Rubrica no encontrada")
    return rubric


def _load_editable(rubric_id, actor):
    """Una rúbrica que el actor puede modificar: la suya (o cualquiera, si es ADMIN)."""
    rubric = _load_visible(rubric_id, actor)
    if not policies.can(actor, "rubric", "edit", owner_id=rubric.created_by_id):
        raise ApiError(
            "RUBRIC_READ_ONLY",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Esta rúbrica es de solo lectura: duplícala para personalizarla.",
            status.HTTP_403_FORBIDDEN,
        )
    if rubric.case_version_id is not None:
        # Una rúbrica de la versión es parte del documento que se validó y se selló: solo se toca en un borrador.
        ensure_draft(rubric.case_version_id, revision_exempt=True)  # la ruta de rúbricas no lleva la revisión del caso
    return rubric


def list_rubrics(actor):
    return [
        _rubric_summary(r, actor)
        for r in _visible(actor).order_by("-is_default", "-active", "name", "id")
    ]


def get_rubric(rubric_id, actor):
    return rubric_detail(_load_visible(rubric_id, actor), actor)


def _write_criteria(rubric, criteria_payload):
    kept_ids = []
    for index, item in enumerate(criteria_payload or [], start=1):
        weight = _decimal(item.get("weight"))
        if weight < 0 or weight > 100:
            raise ValidationError("Cada ponderacion debe estar entre 0 y 100")
        criterion_id = item.get("id")
        criterion = None
        if criterion_id:
            criterion = RubricCriterion.objects.filter(pk=criterion_id, rubric_id=rubric.id).first()
        if not criterion:
            competency = str(item.get("competency") or item.get("title") or "").strip()[:100]
            criterion = RubricCriterion.objects.filter(rubric=rubric, competency=competency).first()
        if not criterion:
            criterion = RubricCriterion(rubric=rubric)
        previous_text = criterion.competency if criterion.pk is not None else None
        criterion.competency = str(item.get("competency") or item.get("title") or "").strip()[:100]
        # E3-9: el enlace con el catálogo; el texto libre de arriba se conserva siempre. Sin
        # ``competencyId``, el enlace sigue al texto **cuando este cambia** (si no, un texto nuevo
        # quedaría bajo la competencia vieja); con el mismo texto no se toca (un cliente que no
        # conoce el catálogo no borra un enlace elegido).
        competency, explicit = competencies.resolve_for_criterion(item)
        if explicit or previous_text is None or criterion.competency != previous_text:
            criterion.competency_ref = competency
        elif criterion.competency_ref_id is None and competency is not None:
            criterion.competency_ref = competency  # sin enlace y su texto ya está en el catálogo
        if competency is not None and explicit and not item.get("competency"):
            criterion.competency = competency.code
        criterion.title = str(item.get("title") or item.get("name") or "").strip()
        criterion.description = str(item.get("description") or "").strip()
        criterion.weight = weight
        criterion.max_score = int(weight)
        criterion.active = bool(item.get("active", True))
        criterion.display_order = int(item.get("displayOrder") or item.get("order") or index)
        criterion.save()
        kept_ids.append(criterion.id)
    if kept_ids:
        RubricCriterion.objects.filter(rubric_id=rubric.id).exclude(id__in=kept_ids).update(active=False)
    else:
        RubricCriterion.objects.filter(rubric_id=rubric.id).update(active=False)


def _require_can_set_default(actor, wants_default):
    if wants_default and not policies.can(actor, "rubric", "default"):
        raise ApiError(
            "RUBRIC_DEFAULT_ADMIN_ONLY",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Solo un administrador fija la rúbrica predeterminada.",
            status.HTTP_403_FORBIDDEN,
        )


#: Los campos de una rúbrica que puede editar ``update_rubric``, en el orden en que la auditoría los nombra (S4-1).
_CAMPOS_EDITABLES = ("name", "description", "version", "active", "criteria")


def _campos_enviados(data):
    """Los NOMBRES de los campos que la petición trajo (nunca sus valores: el nombre y los criterios son texto de una
    persona). ``isDefault`` cuenta solo si se pidió fijarla."""
    nombres = [campo for campo in _CAMPOS_EDITABLES if campo in data]
    if data.get("isDefault"):
        nombres.append("isDefault")
    return nombres


def _contexto_de_creacion(args, kwargs, result):
    contexto = {"rubricId": result["id"]}
    if arg(args, kwargs, 0, "data").get("isDefault"):
        contexto["isDefault"] = True
    return contexto


@auditable(
    "RUBRIC_CREATED", "RUBRIC", -1,
    resource_id=lambda args, kwargs, result: result["id"], context=_contexto_de_creacion,
)
@transaction.atomic
def create_rubric(data, user):
    _require_can_set_default(user, data.get("isDefault"))
    rubric = Rubric.objects.create(
        name=str(data.get("name") or "").strip(),
        description=data.get("description") or "",
        active=bool(data.get("active", False)),
        version=str(data.get("version") or "1.0"),
        is_default=False,
        updated_at=timezone.now(),
        created_by=user,
    )
    _write_criteria(rubric, data.get("criteria") or [])
    if rubric.active:
        _validate_weights(list(_criteria_qs(rubric)))
    if data.get("isDefault"):
        set_default(rubric.id)
    return rubric_detail(rubric, user)


@auditable(
    "RUBRIC_UPDATED", "RUBRIC", 0,
    context=lambda args, kwargs, result: {
        "rubricId": result["id"], "changed": _campos_enviados(arg(args, kwargs, 1, "data")),
    },
)
@transaction.atomic
def update_rubric(rubric_id, data, actor):
    rubric = _load_editable(rubric_id, actor)
    _require_can_set_default(actor, data.get("isDefault"))
    if "name" in data:
        rubric.name = str(data.get("name") or "").strip()
    if "description" in data:
        rubric.description = data.get("description") or ""
    if "version" in data:
        rubric.version = str(data.get("version") or rubric.version)
    if "active" in data:
        rubric.active = bool(data.get("active"))
    rubric.updated_at = timezone.now()
    rubric.save()
    if "criteria" in data:
        _write_criteria(rubric, data.get("criteria") or [])
    if rubric.active:
        _validate_weights(list(_criteria_qs(rubric)))
    if data.get("isDefault"):
        set_default(rubric.id)
    return rubric_detail(rubric, actor)


@auditable(
    "RUBRIC_ACTIVATED", "RUBRIC", 0,
    context=lambda args, kwargs, result: {"rubricId": result["id"], "active": bool(arg(args, kwargs, 1, "active"))},
)
@transaction.atomic
def activate(rubric_id, active, actor):
    rubric = _load_editable(rubric_id, actor)
    if active:
        _validate_weights(list(_criteria_qs(rubric)))
    rubric.active = active
    if not active and rubric.is_default:
        rubric.is_default = False
    rubric.updated_at = timezone.now()
    rubric.save()
    return rubric_detail(rubric, actor)


@auditable(
    "RUBRIC_CREATED", "RUBRIC", -1,
    resource_id=lambda args, kwargs, result: result["id"],
    context=lambda args, kwargs, result: {"rubricId": result["id"], "sourceId": arg(args, kwargs, 0, "rubric_id")},
)
@transaction.atomic
def duplicate(rubric_id, user):
    source = _load_visible(rubric_id, user)
    clone = Rubric.objects.create(
        name=f"Copia de {source.name}",
        description=source.description,
        active=False,
        version=source.version,
        is_default=False,
        updated_at=timezone.now(),
        created_by=user,
    )
    for c in RubricCriterion.objects.filter(rubric_id=source.id).order_by("display_order", "id"):
        RubricCriterion.objects.create(
            rubric=clone,
            competency=c.competency,
            competency_ref=c.competency_ref,
            title=c.title,
            description=c.description,
            weight=_weight(c),
            max_score=c.max_score,
            active=c.active,
            display_order=c.display_order,
        )
    return rubric_detail(clone, user)


@transaction.atomic
def set_default(rubric_id, actor=None):
    """Fija la rúbrica global por defecto. ``actor=None`` es el sembrado interno del sistema."""
    if actor is not None:
        _require_can_set_default(actor, True)
    rubric = Rubric.objects.filter(pk=rubric_id).first()
    if not rubric:
        raise NotFound("Rubrica no encontrada")
    if not rubric.active:
        raise ValidationError("La rubrica predeterminada debe estar activa")
    _validate_weights(list(_criteria_qs(rubric)))
    Rubric.objects.exclude(pk=rubric.id).update(is_default=False)
    rubric.is_default = True
    rubric.updated_at = timezone.now()
    rubric.save()
    return rubric_detail(rubric, actor)


@auditable(
    "RUBRIC_UPDATED", "RUBRIC", 0,
    context=lambda args, kwargs, result: {"rubricId": arg(args, kwargs, 0, "rubric_id"), "changed": ["isDefault"]},
)
def make_default(rubric_id, actor):
    """La ruta ``POST /api/rubrics/<id>/default``: fija la predeterminada y deja su fila (S4-1). Aparte de ``set_default``
    porque este también lo llaman la creación y la edición (que ya tienen su propia fila) y el sembrado del sistema (que no
    es un cambio de una persona y no debe dejar ruido)."""
    return set_default(rubric_id, actor)


@auditable(
    "RUBRIC_UPDATED", "CASE_VERSION", 0,
    context=lambda args, kwargs, result: {
        "caseVersionId": result["caseVersionId"], "rubricId": result["rubric"]["id"], "changed": ["assignment"],
    },
)
@transaction.atomic
def assign_to_case_version(case_version_id, rubric_id, user):
    case_version = (
        CaseVersion.objects.filter(pk=case_version_id).select_related("simulation_case").first()
    )
    if not case_version:
        raise NotFound("Version de caso no encontrada")
    # Cambiar la rúbrica de una versión afecta a quienes la evalúan: solo la autora del caso (o ADMIN).
    if not policies.can(user, "case", "author", owner_id=case_version.simulation_case.created_by_id):
        raise ApiError(
            "RUBRIC_CASE_NOT_OWNED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Solo quien autora el caso puede asignarle una rúbrica.",
            status.HTTP_403_FORBIDDEN,
        )
    rubric = _visible(user).filter(pk=rubric_id, active=True).first()
    if not rubric:
        raise NotFound("Rubrica activa no encontrada")
    _validate_weights(list(_criteria_qs(rubric)))
    SimulationRubricAssignment.objects.filter(case_version=case_version, active=True).update(active=False)
    SimulationRubricAssignment.objects.create(
        case_version=case_version,
        rubric=rubric,
        assigned_by=user,
        active=True,
    )
    return {"caseVersionId": case_version.id, "rubric": rubric_detail(rubric, user)}


def rubric_for_case_version(case_version_id):
    """La rúbrica con que se evalúa una versión: la asignada; si no, la propia de la versión; si no, la de la plataforma.

    Una asignación a la rúbrica POR DEFECTO no tapa la rúbrica propia de la versión: la de un caso importado o generado
    trae las competencias que declaran sus respuestas, y la por defecto (asignada en masa por ``seed_default_rubric`` antes
    de este arreglo) las dejaba todas «sin evidencia». Una asignación a cualquier otra rúbrica sigue mandando.
    """
    assignment = (
        SimulationRubricAssignment.objects.filter(case_version_id=case_version_id, active=True)
        .select_related("rubric")
        .first()
    )
    specific = Rubric.objects.filter(case_version_id=case_version_id, active=True).order_by("id").first()
    if assignment and not (specific and assignment.rubric.is_default):
        return assignment.rubric
    if specific:
        return specific
    default = Rubric.objects.filter(is_default=True, active=True).order_by("id").first()
    if default:
        return default
    raise NotFound("No existe rubrica activa para esta simulacion")


def case_version_rubric(case_version_id, actor):
    """La rúbrica de una versión, solo si el actor puede verla: es la de su propio caso (o es
    ADMIN) o es una que ya ve (la suya o la de un ADMIN). Lo demás es 404, igual que una versión
    que no existe: no se confirma la rúbrica privada de otro docente (R3)."""
    case_version = (
        CaseVersion.objects.filter(pk=case_version_id).select_related("simulation_case").first()
    )
    if not case_version:
        raise NotFound("Rubrica no encontrada")
    rubric = rubric_for_case_version(case_version.id)
    owns_the_case = policies.can(actor, "case", "author", owner_id=case_version.simulation_case.created_by_id)
    if not owns_the_case and not _visible(actor).filter(pk=rubric.pk).exists():
        raise NotFound("Rubrica no encontrada")
    return rubric_detail(rubric, actor)


def attempt_rubric_view(attempt_id, instructor=None):
    attempt = SimulationAttempt.objects.filter(pk=attempt_id).select_related("case_version").first()
    if not attempt:
        raise NotFound("Intento no encontrado")
    rubric = rubric_for_case_version(attempt.case_version_id)
    evaluation = (
        # Solo las del DOCENTE (E6-1e): la evaluación automática del sistema no es «la evaluación» del formulario.
        RubricEvaluation.objects.filter(attempt_id=attempt.id, rubric_id=rubric.id, origin=EvaluationOrigin.DOCENTE)
        .select_related("rubric")
        .order_by("-updated_at", "-evaluated_at", "-id")
        .first()
    )
    scores = {}
    if evaluation:
        scores = {
            s.rubric_criterion_id: s
            for s in CriterionScore.objects.filter(rubric_evaluation=evaluation)
        }
    criteria = list(_criteria_qs(rubric).select_related("competency_ref"))
    # El mismo código que `competencyLevels[].code` de la valoración del sistema: así se emparejan lado a lado.
    competency_codes = {c.id: assessment_competencies.competency_code_of(c) for c in criteria}
    items = []
    for c in criteria:
        score = scores.get(c.id)
        items.append({
            "criterion_id": c.id,
            "criterionId": c.id,
            "name": c.title,
            "title": c.title,
            "description": c.description,
            "weight": float(_weight(c)),
            "level": _level_of(score),
            "observations": score.comment if score else "",
            "comment": score.comment if score else "",
            "displayOrder": c.display_order,
        })
    return {
        "attempt_id": str(attempt.id),
        "attemptId": str(attempt.id),
        "rubric_id": rubric.id,
        "rubricId": rubric.id,
        "rubric_name": rubric.name,
        "rubricName": rubric.name,
        "description": rubric.description,
        "status": evaluation.status if evaluation else "PENDING",
        "items": items,
        "criteria": [
            {
                "id": item["criterionId"],
                "competency": competency_codes[item["criterionId"]],
                "title": item["title"],
                "description": item["description"],
                "weight": item["weight"],
                "displayOrder": item["displayOrder"],
            }
            for item in items
        ],
        "scores": [
            {
                "criterionId": item["criterionId"],
                "level": item["level"],
                "comment": item["comment"],
                "evidence": {},
            }
            for item in items if item["level"] is not None
        ],
        "levels": [dict(level) for level in LEVELS],
        "overallLevel": overall_level([(item["weight"], item["level"]) for item in items]),
        "origin": evaluation.origin if evaluation else None,
        "general_observations": evaluation.comment if evaluation else "",
        "comment": evaluation.comment if evaluation else "",
    }


def _rubric_snapshot(rubric, criteria):
    return json.dumps({
        "rubricId": rubric.id,
        "rubricName": rubric.name,
        "criteria": [
            {"id": c.id, "title": c.title, "weight": str(_weight(c)), "description": c.description}
            for c in criteria
        ],
    })


def rubric_snapshot(rubric, criteria):
    """El resumen de la rúbrica (criterios y pesos) que se guarda con cada evaluación."""
    return _rubric_snapshot(rubric, criteria)


@transaction.atomic
def save_attempt_evaluation(attempt_id, data, instructor):
    attempt = SimulationAttempt.objects.filter(pk=attempt_id).first()
    if not attempt:
        raise NotFound("Intento no encontrado")
    rubric = rubric_for_case_version(attempt.case_version_id)
    criteria = _normalize_criteria_weights(list(_criteria_qs(rubric)))
    _validate_weights(criteria)

    raw_scores = data.get("scores") or data.get("items") or []
    score_by_id = {}
    for item in raw_scores:
        try:
            cid = int(item.get("criterionId") or item.get("criterion_id"))
        except (TypeError, ValueError):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ValidationError("Cada calificacion necesita su criterionId")
        if "score" in item:
            # La entrada numérica de 1.0–5.0 se retiró (Tarea 14): la rúbrica se valora por niveles.
            raise ApiError(
                "VALIDATION_ERROR",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "La rúbrica se valora por niveles: usa level",
                status.HTTP_400_BAD_REQUEST,
                field="scores",
            )
        level = item.get("level")
        if level in (None, ""):
            continue
        if not isinstance(level, str) or level not in LEVEL_INDEX:
            raise ValidationError(
                "Nivel inválido: use EN_INICIO, EN_PROCESO, LOGRADO o DESTACADO"  # BORRADOR (VD-23)
            )
        score_by_id[cid] = {
            # Dato interno: el índice del nivel (1–4). Nunca viaja en un DTO.
            "score": Decimal(LEVEL_INDEX[level]),
            "level": level,
            "comment": item.get("comment") or item.get("observations") or "",
        }

    # Dato interno (reversible): el promedio ponderado de los índices. Nunca viaja en un DTO.
    total = Decimal("0")
    for criterion in criteria:
        if criterion.id in score_by_id:
            total += score_by_id[criterion.id]["score"] * _weight(criterion) / Decimal("100")
    total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    eval_status = "EVALUATED" if len(score_by_id) == len(criteria) else "PENDING"

    evaluation = RubricEvaluation.objects.filter(
        attempt_id=attempt.id, rubric_id=rubric.id, instructor_id=instructor.id
    ).first()
    if not evaluation:
        evaluation = RubricEvaluation(
            attempt=attempt,
            rubric=rubric,
            instructor=instructor,
            origin=EvaluationOrigin.DOCENTE,
            created_at=timezone.now(),
        )
    evaluation.total_score = total
    evaluation.comment = data.get("comment") or data.get("general_observations") or ""
    evaluation.status = eval_status
    evaluation.snapshot_json = _rubric_snapshot(rubric, criteria)
    evaluation.updated_at = timezone.now()
    evaluation.save()

    CriterionScore.objects.filter(rubric_evaluation=evaluation).delete()
    for criterion in criteria:
        payload = score_by_id.get(criterion.id)
        if not payload:
            continue
        CriterionScore.objects.create(
            rubric_evaluation=evaluation,
            rubric_criterion=criterion,
            score=payload["score"],
            level=payload["level"],
            comment=payload["comment"],
            evidence_json="{}",
        )
    return attempt_rubric_view(attempt.id, instructor)


def _evaluation_levels(evaluation):
    """Pares ``(peso, nivel)`` de los criterios activos de la evaluación y sus calificaciones."""
    scores = {
        s.rubric_criterion_id: s
        for s in CriterionScore.objects.filter(rubric_evaluation=evaluation)
    }
    return [
        (_weight(c), _level_of(scores.get(c.id)))
        for c in RubricCriterion.objects.filter(rubric_id=evaluation.rubric_id, active=True)
    ], scores


def evaluation_summary(evaluation):
    """La evaluación para la traza docente: solo niveles."""
    levels, _ = _evaluation_levels(evaluation)
    return {
        "id": evaluation.id,
        "rubricName": evaluation.rubric.name,
        "overallLevel": overall_level(levels),
        "origin": evaluation.origin,
        "comment": evaluation.comment,
        "evaluatedAt": evaluation.evaluated_at.isoformat() if evaluation.evaluated_at else None,
    }


def owner_evaluation_view(attempt_id, actor):
    """La evaluación del docente tal como la lee el dueño del intento: comentario y niveles.

    Nunca trae un número (RN-09): ni el ``score`` interno ni el total.
    Solo las evaluaciones concluidas (``EVALUATED``); una a medias no se muestra.
    """
    attempt = SimulationAttempt.objects.filter(pk=attempt_id).first()
    if not attempt:
        raise NotFound("Intento no encontrado")
    if attempt.student_id != actor.id:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise PermissionDenied("No tiene acceso a esta evaluación")
    evaluations = []
    queryset = (
        # Solo las del DOCENTE (E6-1e): el perfil del sistema le llega al estudiante en su reporte (`competencyLevels`).
        RubricEvaluation.objects.filter(
            attempt_id=attempt.id, status="EVALUATED", origin=EvaluationOrigin.DOCENTE
        )
        .select_related("rubric")
        .order_by("evaluated_at", "id")
    )
    for evaluation in queryset:
        levels, scores = _evaluation_levels(evaluation)
        criteria = [
            {
                "criterionId": c.id,
                "title": c.title,
                "level": _level_of(scores[c.id]),
                "comment": scores[c.id].comment or "",
            }
            for c in _criteria_qs(evaluation.rubric)
            if c.id in scores
        ]
        evaluations.append({
            "rubricName": evaluation.rubric.name,
            "origin": evaluation.origin,
            "evaluatedAt": evaluation.evaluated_at.isoformat() if evaluation.evaluated_at else None,
            "comment": evaluation.comment or "",
            "overallLevel": overall_level(levels),
            "criteria": criteria,
        })
    return {"attemptId": str(attempt.id), "evaluations": evaluations}


@transaction.atomic
def seed_default_rubric(user):
    rubric = Rubric.objects.filter(
        name__in=[
            BASIC_RUBRIC_NAME,
            "R\u00fabrica b\u00e1sica de desempe\u0144o SIEP",
            "Rubrica basica de desempeno SIEP",
        ]
    ).order_by("-is_default", "id").first()
    if not rubric:
        rubric = Rubric.objects.create(
            name=BASIC_RUBRIC_NAME,
            description=BASIC_RUBRIC_DESCRIPTION,
            active=True,
            version="1.0",
            is_default=False,
            updated_at=timezone.now(),
            created_by=user,
        )
    else:
        rubric.name = BASIC_RUBRIC_NAME
        rubric.description = BASIC_RUBRIC_DESCRIPTION
        rubric.active = True
        rubric.version = rubric.version or "1.0"
        rubric.updated_at = timezone.now()
        rubric.save()

    existing = {c.competency: c for c in RubricCriterion.objects.filter(rubric=rubric)}
    seen = set()
    for order, (competency, title, description, weight) in enumerate(BASIC_CRITERIA, start=1):
        seen.add(competency)
        criterion = existing.get(competency)
        if not criterion:
            criterion = RubricCriterion(rubric=rubric, competency=competency)
        criterion.title = title
        criterion.description = description
        criterion.weight = weight
        criterion.max_score = int(weight)
        criterion.display_order = order
        criterion.active = True
        criterion.save()
    RubricCriterion.objects.filter(rubric=rubric).exclude(competency__in=seen).update(active=False)
    competencies.link_unlinked_criteria(create=True)
    set_default(rubric.id)

    # Solo a las versiones publicadas que no tienen rúbrica propia: una propia (la del documento importado o la copia de la
    # generación) es la que corresponde a las competencias que declaran sus respuestas.
    for case_version in CaseVersion.objects.filter(status="PUBLISHED", simulation_case__active=True):
        if Rubric.objects.filter(case_version=case_version, active=True).exists():
            continue
        if not SimulationRubricAssignment.objects.filter(case_version=case_version, active=True).exists():
            SimulationRubricAssignment.objects.create(case_version=case_version, rubric=rubric, assigned_by=user)
    return rubric_detail(rubric)
