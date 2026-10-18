"""Las pistas de cada escena del caso (E3-5, RF-11): autoría con propiedad, revisión y texto plano."""
from django.db import models, transaction

from apps.simulation.models import SceneHint, SceneMap
from apps.simulation.services.text_rules import validate_plain_text
from shared.jsonutils import coerce_int as _int

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version

#: Una pista cabe en una línea de la ficha del juego (E3-5, R9).
MAX_HINT_LENGTH = 280


@transaction.atomic
def create_hint(case_version_id, map_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    scene_map = in_version(SceneMap, map_id, case_version_id)
    hint = SceneHint(scene_map=scene_map)
    hint.text = validate_plain_text(request.get("text"), MAX_HINT_LENGTH, "text", required=True)
    if request.get("hintOrder") is not None:
        hint.hint_order = _int(request.get("hintOrder"))
    else:
        last = SceneHint.objects.filter(scene_map=scene_map).aggregate(top=models.Max("hint_order"))["top"]
        hint.hint_order = (last or 0) + 1
    hint.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_hint(case_version_id, hint_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    hint = in_version(SceneHint, hint_id, case_version_id)
    hint.text = validate_plain_text(request.get("text"), MAX_HINT_LENGTH, "text", required=True)
    if request.get("hintOrder") is not None:
        hint.hint_order = _int(request.get("hintOrder"))
    hint.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_hint(case_version_id, hint_id, revision=None):
    ensure_draft(case_version_id, revision)
    hint = in_version(SceneHint, hint_id, case_version_id)
    hint.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)
