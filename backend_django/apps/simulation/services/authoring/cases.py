"""Listar y crear casos."""
import re

from django.db import transaction
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

from .editor_view import editor
from .publication import create_draft_checklist


def list_authoring_cases():
    versions = (
        CaseVersion.objects.filter(simulation_case__active=True)
        .select_related("simulation_case")
        .order_by("-created_at", "-id")
    )
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
    description = (request.get("description") or "").strip()
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
