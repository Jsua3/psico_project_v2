"""El catálogo de competencias (RQ-NEG-002, E3-9) y su enlace con los criterios de las rúbricas.

Los criterios traen desde siempre un texto libre ``competency``. El catálogo no lo reemplaza
(expand → migrate → contract): un criterio puede apuntar además a una competencia con
``competencyId``. Un criterio que solo trae texto se enlaza **si** su código normalizado ya está
en el catálogo; nunca crea competencias (el catálogo lo amplía el ADMIN).
"""
import re
import unicodedata

from django.db import transaction
from rest_framework import status

from apps.simulation.models import Competency, RubricCriterion
from apps.simulation.services.audit_service import auditable
from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError

MAX_CODE_LENGTH = 100
MAX_NAME_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 1000


def normalize_code(text):
    """``«Ética profesional»`` → ``ETICA_PROFESIONAL``; ``""`` si no queda ninguna letra o número."""
    if not isinstance(text, str):
        return ""
    plain = unicodedata.normalize("NFKD", text)
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    code = re.sub(r"[^A-Z0-9]+", "_", plain.upper()).strip("_")
    return code[:MAX_CODE_LENGTH].strip("_")


def competency_dto(competency):
    return {
        "id": competency.id,
        "code": competency.code,
        "name": competency.name,
        "description": competency.description,
        "active": competency.active,
        "sortOrder": competency.sort_order,
    }


def list_competencies():
    return [competency_dto(c) for c in Competency.objects.order_by("sort_order", "code")]


def _invalid(message, field):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


@auditable(
    "COMPETENCY_CREATED", "COMPETENCY", -1,
    resource_id=lambda args, kwargs, result: result["id"],
    context=lambda args, kwargs, result: {"competencyId": result["id"]},
)
@transaction.atomic
def create_competency(data):
    """``POST /api/competencies`` (ADMIN): una competencia nueva con su código normalizado."""
    code = normalize_code(data.get("code"))
    if not code:
        raise _invalid("El código debe tener al menos una letra o un número.", "code")
    name = validate_plain_text(data.get("name"), MAX_NAME_LENGTH, "name", required=True)
    description = validate_plain_text(
        data.get("description"), MAX_DESCRIPTION_LENGTH, "description", multiline=True
    )
    sort_order = data.get("sortOrder", 0)
    if isinstance(sort_order, bool) or not isinstance(sort_order, int):
        raise _invalid("El orden debe ser un número entero.", "sortOrder")
    if Competency.objects.filter(code=code).exists():
        raise _invalid("Ya existe una competencia con ese código.", "code")
    competency = Competency.objects.create(
        code=code, name=name, description=description, sort_order=sort_order
    )
    return competency_dto(competency)


def resolve_for_criterion(item):
    """La competencia de un criterio del cuerpo de una rúbrica: ``(competencia o None, explícito)``.

    ``competencyId`` presente y no nulo debe existir y estar activa (400 con el campo); ``null``
    desvincula (explícito); ausente, y con texto cuyo código ya está en el catálogo, se enlaza por
    el texto. ``explícito`` dice si el cuerpo habló del enlace (para no tocarlo si no lo hizo).
    """
    if "competencyId" in item:
        raw = item.get("competencyId")
        if raw is None:
            return None, True
        competency = None
        if isinstance(raw, int) and not isinstance(raw, bool):
            competency = Competency.objects.filter(pk=raw, active=True).first()
        if competency is None:
            raise _invalid("La competencia no existe o está inactiva.", "competencyId")
        return competency, True
    code = normalize_code(item.get("competency"))
    if code:
        return Competency.objects.filter(code=code, active=True).first(), False
    return None, False


def link_unlinked_criteria(create=False):
    """Enlaza los criterios sin competencia por el código de su texto; con ``create``, crea la
    competencia que falte. Idempotente. Lo usan las semillas; devuelve cuántos enlazó."""
    linked = 0
    cache = {}
    for criterion in RubricCriterion.objects.filter(competency_ref__isnull=True).order_by("id"):
        code = normalize_code(criterion.competency)
        if not code:
            continue
        if code not in cache:
            competency = Competency.objects.filter(code=code).first()
            if competency is None and create:
                # El nombre es el título del criterio (con sus tildes), no el código: es lo que lee el estudiante.
                competency = Competency.objects.create(
                    code=code, name=(criterion.title or "").strip()[:255] or _nombre_del_codigo(code)
                )
            cache[code] = competency
        competency = cache[code]
        if competency is not None:
            RubricCriterion.objects.filter(pk=criterion.pk).update(competency_ref=competency)
            linked += 1
    if create:
        nombrar_competencias_crudas()
    return linked


def _nombre_del_codigo(code):
    """``COMPRENSION_SITUACION`` → «Comprension situacion»: el nombre que se ponía antes, sin tildes."""
    return code.replace("_", " ").capitalize()


def nombrar_competencias_crudas():
    """Las competencias que aún llevan el nombre sacado de su código («Comprension situacion», «Pap») toman el título del
    primer criterio que las usa («Identificación y comprensión de la situación»). Idempotente; no toca un nombre que alguien
    escribió. Devuelve cuántas renombró."""
    renombradas = 0
    for competency in Competency.objects.order_by("id"):
        if competency.name != _nombre_del_codigo(competency.code):
            continue
        titulo = (
            RubricCriterion.objects.filter(competency_ref=competency).exclude(title="").order_by("id")
            .values_list("title", flat=True).first()
        )
        if titulo and titulo.strip() and titulo.strip() != competency.name:
            Competency.objects.filter(pk=competency.pk).update(name=titulo.strip()[:255])
            renombradas += 1
    return renombradas
