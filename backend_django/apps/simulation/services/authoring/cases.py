"""Listar y crear casos, y escribir su ficha (contexto y objetivos de aprendizaje)."""
import json
import re

from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.simulation.models import (
    DEFAULT_MAP_HEIGHT,
    DEFAULT_MAP_WIDTH,
    CaseVersion,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.serializers import game_dtos as dto
from apps.simulation.services.text_rules import validate_plain_text
from shared import policies
from shared.exceptions import ApiError

from .editor_view import editor
from .guards import bump_revision, ensure_draft
from .publication import create_draft_checklist

#: Topes de la ficha (E3-4): un objetivo cabe en una línea de la pantalla; el contexto, en unos
#: cuantos párrafos. Doce objetivos son más de los que un caso formativo declara.
MAX_CONTEXT_LENGTH = 4000
MAX_OBJECTIVE_LENGTH = 280
MAX_OBJECTIVES = 12


def list_authoring_cases(actor):
    """Los casos que el actor autora: los suyos si es profesor, todos si es ADMIN (R3)."""
    versions = (
        CaseVersion.objects.filter(simulation_case__active=True)
        .select_related("simulation_case")
        .order_by("-created_at", "-id")
    )
    scope = policies.scope_of(actor, "case", "author")
    if scope == policies.OWN:
        versions = versions.filter(simulation_case__created_by_id=actor.id)
    elif scope != policies.ALL:
        versions = versions.none()
    result = []
    for version in versions:
        node_count = SimulationNode.objects.filter(case_version_id=version.id).count()
        result.append(dto.case_summary(version, node_count))
    return result


@transaction.atomic
def create_case(request, actor):
    title = (request.get("title") or "").strip()
    if not title:
        raise ValidationError("El titulo del caso es obligatorio")
    # Es también el contexto que lee el estudiante (``narrative_context``): texto plano con tope.
    description = validate_plain_text(
        request.get("description"), MAX_CONTEXT_LENGTH, "description", multiline=True
    )
    requested_code = (request.get("code") or "").strip()
    if requested_code:
        code = _normalize_case_code(requested_code)
        if SimulationCase.objects.filter(code=code).exists():
            raise ValidationError(f"Ya existe un caso con el codigo: {code}")
    else:
        code = _unique_case_code(_normalize_case_code(title))

    case = SimulationCase.objects.create(
        code=code,
        title=title,
        description=description,
        active=True,
        created_by=actor,
    )
    version = CaseVersion.objects.create(
        simulation_case=case,
        semantic_version="0.1.0",
        status="DRAFT",
        narrative_context=description,
        created_by=actor,
        world_schema_version=2,
    )
    node = SimulationNode.objects.create(
        case_version=version,
        node_key="inicio",
        title="Inicio del caso",
        narrative="Describe aqui el contexto inicial que vera el estudiante.",
        support_resources_json="[]",
        required_tools_json="[]",
        start_node=True,
        terminal_node=False,
        position_x=180,
        position_y=180,
    )
    SceneMap.objects.create(
        case_version=version,
        node=node,
        map_key="escena-inicial",
        title="Escena inicial",
        width=DEFAULT_MAP_WIDTH,
        height=DEFAULT_MAP_HEIGHT,
        theme="clinical-soft",
        spawn_x=145,
        spawn_y=430,
        ambient_json="{}",
    )
    create_draft_checklist(version, actor)
    return editor(version.id)


@transaction.atomic
def update_brief(case_version_id, request):
    """``PUT …/brief``: el contexto y los objetivos de aprendizaje de un borrador.

    «Ausente = no tocar»: un cuerpo sin ``context`` deja el contexto como estaba, y uno sin
    ``learningObjectives`` deja la lista; ``[]`` la vacía. Todo es texto plano con tope.
    """
    version = ensure_draft(case_version_id, request.get("revision"))
    fields = []
    if "context" in request:
        version.narrative_context = validate_plain_text(
            request.get("context"), MAX_CONTEXT_LENGTH, "context", multiline=True
        )
        fields.append("narrative_context")
    if "learningObjectives" in request:
        version.learning_objectives = json.dumps(
            _validated_objectives(request.get("learningObjectives")), ensure_ascii=False
        )
        fields.append("learning_objectives")
    if fields:
        version.save(update_fields=fields)
    bump_revision(case_version_id)
    return editor(case_version_id)


def _validated_objectives(raw):
    if raw is None:
        return []
    if len(raw) > MAX_OBJECTIVES:
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"Un caso admite hasta {MAX_OBJECTIVES} objetivos de aprendizaje.",
            status.HTTP_400_BAD_REQUEST,
            field="learningObjectives",
        )
    return [
        validate_plain_text(
            item, MAX_OBJECTIVE_LENGTH, "learningObjectives", required=True, index=position
        )
        for position, item in enumerate(raw)
    ]


def _normalize_case_code(value):
    code = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").upper()
    return (code[:40] or "CASO")


def _unique_case_code(base):
    candidate = base
    suffix = 2
    while SimulationCase.objects.filter(code=candidate).exists():
        candidate = f"{base[:36]}-{suffix}"
        suffix += 1
    return candidate
