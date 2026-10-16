"""E3-3 · Cada objeto PERSON que ya existe queda enlazado a un personaje del caso (RF-07).

0015 creó ``case_characters`` y ``map_objects.character_id`` vacíos. Aquí se traslada lo que los
casos ya tenían: por cada objeto PERSON se crea (o se reutiliza) un personaje y se enlaza.

- ``character_key = object_key`` y ``display_name = label``; ``role_label`` queda vacío.
- ``portrait_key`` sale del diálogo del objeto, si lo tiene.
- ``show_in_brief = false``: qué personajes se muestran en la ficha lo decide Psicología.
- La misma clave **y** el mismo nombre en dos salas es **un** personaje (la psicóloga que aparece
  en varias salas). La misma clave con otro nombre (el caso real «familia-duelo»: «Familia en
  crisis» y luego «Familia acompañada») es otro personaje, con la clave ``<object_key>-<map_key>``.
- Es idempotente: solo toca los objetos PERSON que aún no tienen personaje.
"""
from django.db import migrations

KEY_MAX = 120


def _free_key(wanted, taken):
    """``wanted`` o, si ya está tomada, la primera ``wanted-2``, ``wanted-3``… libre (≤ 120)."""
    base = wanted[:KEY_MAX]
    if base not in taken:
        return base
    number = 2
    while True:
        suffix = f"-{number}"
        candidate = base[: KEY_MAX - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
        number += 1


def link_person_objects(apps, schema_editor):
    MapObject = apps.get_model("simulation", "MapObject")
    CaseCharacter = apps.get_model("simulation", "CaseCharacter")
    DialogueTree = apps.get_model("simulation", "DialogueTree")

    portraits = {}
    trees = (
        DialogueTree.objects.filter(map_object__isnull=False, portrait_key__isnull=False)
        .exclude(portrait_key="")
        .order_by("id")
        .values_list("map_object_id", "portrait_key")
    )
    for map_object_id, portrait_key in trees:
        portraits.setdefault(map_object_id, portrait_key)

    #: versión → {clave: personaje}, cargado la primera vez que se necesita.
    catalog = {}

    def characters_of(version_id):
        if version_id not in catalog:
            catalog[version_id] = {
                c.character_key: c for c in CaseCharacter.objects.filter(case_version_id=version_id)
            }
        return catalog[version_id]

    people = (
        MapObject.objects.filter(object_type="PERSON", character__isnull=True)
        .select_related("scene_map")
        .order_by("scene_map__case_version_id", "id")
    )
    for obj in people:
        version_id = obj.scene_map.case_version_id
        characters = characters_of(version_id)
        name = obj.label or obj.object_key

        wanted = obj.object_key
        character = characters.get(wanted[:KEY_MAX])
        if character is not None and character.display_name != name:
            # La clave ya es de otra persona (otro nombre): esta es otra, con la clave de su sala.
            wanted = f"{obj.object_key}-{obj.scene_map.map_key}"
            character = characters.get(wanted[:KEY_MAX])
            if character is not None and character.display_name != name:
                character = None
        if character is None:
            character = CaseCharacter.objects.create(
                case_version_id=version_id,
                character_key=_free_key(wanted, characters),
                display_name=name,
                portrait_key=portraits.get(obj.id, ""),
                show_in_brief=False,
                display_order=len(characters),
            )
            characters[character.character_key] = character

        # ``update``: enlazar no debe mover la marca de última modificación del objeto.
        MapObject.objects.filter(pk=obj.pk).update(character_id=character.id)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0015_case_characters"),
    ]

    operations = [
        migrations.RunPython(link_person_objects, migrations.RunPython.noop),
    ]
