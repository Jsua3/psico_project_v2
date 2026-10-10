"""Las herramientas clínicas del caso."""
from django.db import transaction

from apps.simulation.models import ClinicalTool

from .editor_view import editor
from .guards import ensure_draft, require_tool_in_version


@transaction.atomic
def create_tool(case_version_id, request):
    version = ensure_draft(case_version_id)
    tool = ClinicalTool(case_version=version)
    _apply_tool_request(tool, request)
    tool.save()
    return editor(case_version_id)


@transaction.atomic
def update_tool(case_version_id, tool_id, request):
    ensure_draft(case_version_id)
    tool = require_tool_in_version(tool_id, case_version_id)
    _apply_tool_request(tool, request)
    tool.save()
    return editor(case_version_id)


@transaction.atomic
def delete_tool(case_version_id, tool_id):
    ensure_draft(case_version_id)
    tool = require_tool_in_version(tool_id, case_version_id)
    tool.delete()
    return editor(case_version_id)


def _apply_tool_request(tool, request):
    tool.tool_code = request.get("toolCode")
    tool.label = request.get("label")
    tool.icon = request.get("icon") if request.get("icon") is not None else "psychology"
    tool.category = request.get("category") if request.get("category") is not None else "clinical"
    tool.description = request.get("description")
    tool.active = True
