"""El catálogo de personajes del caso (RF-07, decisión 16).

Un personaje es un dato del caso: su clave, el nombre que ve el estudiante, su rol, su retrato y
si aparece en la ficha del caso. Los objetos PERSON del mundo apuntan a él (``characterId``).
Borrar un personaje desvincula sus objetos (``ON DELETE SET NULL`` en la base): no los borra.
"""
from django.db import transaction
from rest_framework import status

from apps.simulation.models import CaseCharacter, DialogueTree, MapObject
from shared.exceptions import ApiError
from shared.jsonutils import coerce_int as _int

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version

#: Los campos opcionales del cuerpo y el valor con que nace un personaje nuevo.
_OPTIONAL = {
    "roleLabel": ("role_label", ""),
    "portraitKey": ("portrait_key", ""),
    "showInBrief": ("show_in_brief", False),
    "displayOrder": ("display_order", 0),
}


@transaction.atomic
def create_character(case_version_id, request):
    version = ensure_draft(case_version_id, request.get("revision"))
    character = CaseCharacter(case_version=version)
    _apply_character_request(character, request)
    character.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def update_character(case_version_id, character_id, request):
    ensure_draft(case_version_id, request.get("revision"))
    character = in_version(CaseCharacter, character_id, case_version_id)
    _apply_character_request(character, request)
    character.save()
    bump_revision(case_version_id)
    return editor(case_version_id)


@transaction.atomic
def delete_character(case_version_id, character_id, revision=None):
    ensure_draft(case_version_id, revision)
    character = in_version(CaseCharacter, character_id, case_version_id)
    character.delete()
    bump_revision(case_version_id)
    return editor(case_version_id)


def _apply_character_request(character, request):
    key = request.get("characterKey")
    clash = CaseCharacter.objects.filter(
        case_version_id=character.case_version_id, character_key=key
    )
    if character.pk is not None:
        clash = clash.exclude(pk=character.pk)
    if clash.exists():
        raise ApiError(
            "VALIDATION_ERROR",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Ya hay un personaje con esa clave en el caso.",
            status.HTTP_400_BAD_REQUEST,
            field="characterKey",
        )
    character.character_key = key
    character.display_name = request.get("displayName")
    # «Ausente = no tocar»: un cliente que solo cambia el nombre no apaga la ficha ni el retrato.
    for field, (attribute, default) in _OPTIONAL.items():
        if field in request:
            value = request.get(field)
        elif character.pk is not None:
            continue
        else:
            value = default
        if field == "displayOrder":
            value = _int(value)
        elif field == "showInBrief":
            value = bool(value)
        else:
            value = value or ""
        setattr(character, attribute, value)


def ensure_person_characters(case_version_id):
    """Enlaza cada objeto PERSON de la versión que aún no tiene personaje (idempotente).

    Es la misma regla que aplicó la migración ``0016_link_person_objects`` a lo que ya existía:
    la misma clave **y** el mismo nombre es un solo personaje; la misma clave con otro nombre es
    otro, con la clave ``<object_key>-<map_key>``. Lo usa la semilla del caso PDF para que una base
    nueva quede igual que una migrada.
    """
    portraits = {}
    trees = (
        DialogueTree.objects.filter(
            scene_map__case_version_id=case_version_id, map_object__isnull=False,
            portrait_key__isnull=False,
        )
        .exclude(portrait_key="")
        .order_by("id")
        .values_list("map_object_id", "portrait_key")
    )
    for map_object_id, portrait_key in trees:
        portraits.setdefault(map_object_id, portrait_key)

    characters = {
        c.character_key: c for c in CaseCharacter.objects.filter(case_version_id=case_version_id)
    }
    people = (
        MapObject.objects.filter(
            scene_map__case_version_id=case_version_id, object_type="PERSON", character__isnull=True
        )
        .select_related("scene_map")
        .order_by("id")
    )
    linked = 0
    for obj in people:
        name = obj.label or obj.object_key
        wanted = obj.object_key
        character = characters.get(wanted)
        if character is not None and character.display_name != name:
            wanted = f"{obj.object_key}-{obj.scene_map.map_key}"
            character = characters.get(wanted[:120])
            if character is not None and character.display_name != name:
                character = None
        if character is None:
            character = CaseCharacter.objects.create(
                case_version_id=case_version_id,
                character_key=_free_key(wanted, characters),
                display_name=name,
                portrait_key=portraits.get(obj.id, ""),
                show_in_brief=False,
                display_order=len(characters),
            )
            characters[character.character_key] = character
        MapObject.objects.filter(pk=obj.pk).update(character_id=character.id)
        linked += 1
    return linked


def _free_key(wanted, taken):
    """``wanted`` o, si ya está tomada, la primera ``wanted-2``, ``wanted-3``… libre (≤ 120)."""
    base = wanted[:120]
    if base not in taken:
        return base
    number = 2
    while True:
        suffix = f"-{number}"
        candidate = base[: 120 - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
        number += 1
