"""Las herramientas clínicas del caso."""
from django.db import transaction

from apps.simulation.models import ClinicalTool

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version
from .icons import validate_icon


@transaction.atomic
def create_tool(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    tool = ClinicalTool(case_version=version)
    _apply_tool_request(tool, request)
    tool.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_tool(case_version_id, tool_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    tool = in_version(ClinicalTool, tool_id, case_version_id)
    _apply_tool_request(tool, request)
    tool.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_tool(case_version_id, tool_id, revision=None):
    ensure_draft(case_version_id, revision)
    tool = in_version(ClinicalTool, tool_id, case_version_id)
    tool.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_tool_request(tool, request):
    tool.tool_code = request.get("toolCode")
    tool.label = request.get("label")
    validate_icon(request.get("icon"), current=tool.icon)
    tool.icon = request.get("icon") if request.get("icon") is not None else "psychology"
    tool.category = request.get("category") if request.get("category") is not None else "clinical"
    tool.description = request.get("description") if request.get("description") is not None else ""
    tool.active = True
