"""E3-3 · Catálogo de personajes del caso (RF-07, decisión 16).

Un personaje es un dato del caso (``case_characters``): nombre visible, rol, retrato y si aparece
en la ficha del caso (``show_in_brief``; Psicología decide cuáles). Un objeto del mundo puede
apuntar a un personaje (``characterId``). Autoría con propiedad y revisión, copia al clonar.
"""
import importlib

import pytest
from django.apps import apps as live_apps
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import (
    AuditLog,
    CaseCharacter,
    CaseVersion,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.authoring.characters import ensure_person_characters

pytestmark = [pytest.mark.req("RF-07")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role)


@pytest.fixture
def prof_a(db):
    return _user("chr_a@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("chr_b@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("chr_admin@x.com", "ADMIN")


def _case(owner, title="Caso con personajes"):
    response = cl(owner).post(AUTHORING, {"title": title}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


@pytest.fixture
def case_a(prof_a):
    return _case(prof_a)


def _character_body(key="ana", name="Ana Torres", **extra):
    return {"characterKey": key, "displayName": name, "roleLabel": "Madre", "portraitKey": "madre-1", **extra}


def _create(client, cv, **extra):
    return client.post(f"{AUTHORING}/{cv}/characters", _character_body(**extra), format="json")


def _object_body(**extra):
    return {"objectKey": "npc-1", "label": "Persona", "objectType": "PERSON", "x": 10, "y": 10, **extra}


# ─── CRUD con propiedad y revisión ────────────────────────────────────────────────────────────
def test_the_author_creates_updates_and_deletes_a_character(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)

    created = _create(client, cv, showInBrief=True, displayOrder=2)

    assert created.status_code == 200, created.data
    character = created.data["data"]["characters"][0]
    assert character["key"] == "ana" and character["displayName"] == "Ana Torres"
    assert (character["roleLabel"], character["portraitKey"]) == ("Madre", "madre-1")
    assert (character["showInBrief"], character["displayOrder"]) == (True, 2)
    assert created.data["data"]["revision"] == case_a["revision"] + 1

    updated = client.put(
        f"{AUTHORING}/{cv}/characters/{character['id']}",
        _character_body(name="Ana María Torres", showInBrief=False), format="json",
    )
    assert updated.status_code == 200
    assert updated.data["data"]["characters"][0]["displayName"] == "Ana María Torres"
    assert updated.data["data"]["characters"][0]["showInBrief"] is False

    deleted = client.delete(f"{AUTHORING}/{cv}/characters/{character['id']}")
    assert deleted.status_code == 200 and deleted.data["data"]["characters"] == []


def test_the_editor_lists_the_characters_in_display_order(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    _create(client, cv, key="b", displayOrder=2)
    _create(client, cv, key="a", displayOrder=1)

    editor = client.get(f"{AUTHORING}/{cv}/editor").data["data"]

    assert [c["key"] for c in editor["characters"]] == ["a", "b"]


@pytest.mark.parametrize(
    "extra,field",
    [
        ({"characterKey": ""}, "characterKey"),
        ({"displayName": ""}, "displayName"),
        ({"displayName": "x" * 256}, "displayName"),
        ({"roleLabel": "x" * 256}, "roleLabel"),
        ({"characterKey": "k" * 121}, "characterKey"),
    ],
)
def test_invalid_character_fields_are_a_400_naming_the_field(prof_a, case_a, extra, field):
    body = _character_body()
    body.update(extra)

    response = cl(prof_a).post(f"{AUTHORING}/{case_a['caseVersionId']}/characters", body, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == field


def test_a_repeated_key_is_a_400_on_the_key_not_a_500(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    assert _create(client, cv).status_code == 200

    again = _create(client, cv, name="Otra persona")

    assert again.status_code == 400
    assert again.data["field"] == "characterKey"


def test_a_foreign_professor_cannot_touch_the_characters(prof_b, case_a, prof_a):
    cv = case_a["caseVersionId"]
    character = _create(cl(prof_a), cv).data["data"]["characters"][0]

    assert _create(cl(prof_b), cv, key="x").status_code == 403
    assert cl(prof_b).put(
        f"{AUTHORING}/{cv}/characters/{character['id']}", _character_body(), format="json"
    ).status_code == 403
    assert cl(prof_b).delete(f"{AUTHORING}/{cv}/characters/{character['id']}").status_code == 403
    assert CaseCharacter.objects.filter(pk=character["id"]).exists()


def test_a_character_of_another_case_is_not_found_through_this_one(prof_a, case_a):
    other = _case(prof_a, "Otro caso")
    foreign = _create(cl(prof_a), other["caseVersionId"], key="ajeno").data["data"]["characters"][0]

    response = cl(prof_a).delete(f"{AUTHORING}/{case_a['caseVersionId']}/characters/{foreign['id']}")

    assert response.status_code == 400
    assert CaseCharacter.objects.filter(pk=foreign["id"]).exists()


def test_a_published_version_is_not_edited(prof_a, admin, case_a):
    cv = case_a["caseVersionId"]
    CaseVersion.objects.filter(pk=cv).update(status="PUBLISHED")

    response = _create(cl(prof_a), cv)

    assert response.status_code == 400
    assert not CaseCharacter.objects.filter(case_version_id=cv).exists()


def test_a_stale_revision_conflicts(prof_a, admin, case_a):
    cv = case_a["caseVersionId"]
    stale = case_a["revision"]
    assert cl(admin).post(f"{AUTHORING}/{cv}/characters", _character_body(key="x"), format="json").status_code == 200

    response = cl(prof_a).post(
        f"{AUTHORING}/{cv}/characters", _character_body(key="y", revision=stale), format="json"
    )

    assert response.status_code == 409
    assert response.data["code"] == "REVISION_CONFLICT"


# ─── el vínculo con los objetos del mundo ─────────────────────────────────────────────────────
def test_an_object_links_to_a_character_and_absent_keeps_the_link(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    map_id = case_a["maps"][0]["id"]
    character = _create(client, cv).data["data"]["characters"][0]

    made = client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/objects", _object_body(characterId=character["id"]), format="json"
    )
    obj = next(o for o in made.data["data"]["objects"] if o["key"] == "npc-1")
    edited = client.put(
        f"{AUTHORING}/{cv}/objects/{obj['id']}", _object_body(label="Persona editada"), format="json"
    )
    cleared = client.put(
        f"{AUTHORING}/{cv}/objects/{obj['id']}", _object_body(characterId=None), format="json"
    )

    assert obj["characterId"] == character["id"]
    assert next(o for o in edited.data["data"]["objects"] if o["id"] == obj["id"])["characterId"] == character["id"]
    assert next(o for o in cleared.data["data"]["objects"] if o["id"] == obj["id"])["characterId"] is None


def test_an_object_cannot_point_at_a_character_of_another_version(prof_a, case_a):
    other = _case(prof_a, "Otro caso")
    foreign = _create(cl(prof_a), other["caseVersionId"], key="ajeno").data["data"]["characters"][0]
    cv, map_id = case_a["caseVersionId"], case_a["maps"][0]["id"]

    response = cl(prof_a).post(
        f"{AUTHORING}/{cv}/maps/{map_id}/objects", _object_body(characterId=foreign["id"]), format="json"
    )

    assert response.status_code == 400
    assert not MapObject.objects.filter(scene_map__case_version_id=cv, object_key="npc-1").exists()


def test_deleting_a_character_unlinks_its_objects(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    character = _create(client, cv).data["data"]["characters"][0]
    client.post(
        f"{AUTHORING}/{cv}/maps/{case_a['maps'][0]['id']}/objects",
        _object_body(characterId=character["id"]), format="json",
    )

    client.delete(f"{AUTHORING}/{cv}/characters/{character['id']}")

    obj = MapObject.objects.get(scene_map__case_version_id=cv, object_key="npc-1")
    assert obj.character_id is None


def test_saving_the_world_keeps_the_character_links_unless_told_otherwise(prof_a, case_a):
    """El autoguardado del editor actual no manda ``characterId``: no puede borrar los vínculos."""
    cv, client = case_a["caseVersionId"], cl(prof_a)
    map_id = case_a["maps"][0]["id"]
    character = _create(client, cv).data["data"]["characters"][0]
    made = client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/objects", _object_body(characterId=character["id"]), format="json"
    )
    obj = next(o for o in made.data["data"]["objects"] if o["key"] == "npc-1")
    world = client.get(f"{AUTHORING}/{cv}/world-editor").data["data"]
    payload = {
        "revision": world["revision"],
        "objects": [{"id": obj["id"], "key": "npc-1", "label": "Persona", "type": "PERSON", "x": 11, "y": 10}],
    }

    kept = client.put(f"{AUTHORING}/{cv}/world", payload, format="json")
    assert kept.status_code == 200, kept.data
    assert MapObject.objects.get(pk=obj["id"]).character_id == character["id"]

    payload["revision"] = kept.data["data"]["revision"]
    payload["objects"][0]["characterId"] = None
    cleared = client.put(f"{AUTHORING}/{cv}/world", payload, format="json")
    assert cleared.status_code == 200
    assert MapObject.objects.get(pk=obj["id"]).character_id is None


# ─── clonar ───────────────────────────────────────────────────────────────────────────────────
def test_cloning_copies_the_characters_and_relinks_the_objects(prof_a, admin, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    map_id = case_a["maps"][0]["id"]
    character = _create(client, cv, showInBrief=True, displayOrder=3).data["data"]["characters"][0]
    client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/objects", _object_body(characterId=character["id"]), format="json"
    )

    cloned = cl(admin).post(f"{AUTHORING}/{cv}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    clone_id = cloned.data["data"]["caseVersionId"]
    copy = CaseCharacter.objects.get(case_version_id=clone_id)
    assert copy.id != character["id"]
    assert (copy.character_key, copy.display_name, copy.role_label, copy.portrait_key) == (
        "ana", "Ana Torres", "Madre", "madre-1",
    )
    assert (copy.show_in_brief, copy.display_order) == (True, 3)
    linked = MapObject.objects.get(scene_map__case_version_id=clone_id, object_key="npc-1")
    assert linked.character_id == copy.id
    # El original no se tocó.
    assert MapObject.objects.get(scene_map__case_version_id=cv, object_key="npc-1").character_id == character["id"]


# ─── los PERSON que ya existen se enlazan (migración de datos y semilla) ──────────────────────
def _person(case_version, map_key, object_key, label, tree_portrait=None):
    node = SimulationNode.objects.create(
        case_version=case_version, node_key=f"node-{map_key}", title=map_key, narrative="x"
    )
    scene_map = SceneMap.objects.create(
        case_version=case_version, node=node, map_key=map_key, title=map_key
    )
    obj = MapObject.objects.create(
        scene_map=scene_map, object_key=object_key, label=label, object_type="PERSON"
    )
    if tree_portrait is not None:
        DialogueTree.objects.create(
            scene_map=scene_map, map_object=obj, tree_key="d", speaker_name=label, portrait_key=tree_portrait
        )
    return obj


@pytest.fixture
def version(admin):
    case = SimulationCase.objects.create(code="CHR-MIG", title="Migración", created_by=admin)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=admin
    )


def _run_migration(version):
    module = importlib.import_module("apps.simulation.migrations.0016_link_person_objects")
    module.link_person_objects(live_apps, None)


def _run_service(version):
    ensure_person_characters(version.id)


@pytest.fixture(params=[_run_migration, _run_service], ids=["migration", "seed-service"])
def link_people(request, version):
    """La misma regla de enlace: como la corrió la migración y como la usa la semilla."""
    return lambda: request.param(version)


def test_one_character_is_created_per_person_object(version, link_people):
    obj = _person(version, "sala-1", "familia", "Familia en crisis", tree_portrait="familia-1")
    non_person = MapObject.objects.create(
        scene_map=obj.scene_map, object_key="mesa", label="Mesa", object_type="OBJECT"
    )

    link_people()

    character = CaseCharacter.objects.get(case_version=version)
    assert (character.character_key, character.display_name) == ("familia", "Familia en crisis")
    assert character.portrait_key == "familia-1"
    assert character.show_in_brief is False  # Psicología decide qué personajes se muestran
    obj.refresh_from_db()
    non_person.refresh_from_db()
    assert obj.character_id == character.id
    assert non_person.character_id is None


def test_the_same_key_and_label_in_two_rooms_is_one_character(version, link_people):
    first = _person(version, "sala-1", "psicologa", "Psicóloga")
    second = _person(version, "sala-2", "psicologa", "Psicóloga")

    link_people()

    assert CaseCharacter.objects.filter(case_version=version).count() == 1
    first.refresh_from_db()
    second.refresh_from_db()
    assert first.character_id == second.character_id


def test_the_same_key_with_another_label_gets_its_own_character(version, link_people):
    """Caso real del caso PDF: «familia-duelo» es «Familia en crisis» y luego «Familia acompañada»."""
    first = _person(version, "sala-1", "familia-duelo", "Familia en crisis")
    second = _person(version, "sala-2", "familia-duelo", "Familia acompañada")

    link_people()

    first.refresh_from_db()
    second.refresh_from_db()
    assert first.character_id != second.character_id
    keys = set(CaseCharacter.objects.filter(case_version=version).values_list("character_key", flat=True))
    assert keys == {"familia-duelo", "familia-duelo-sala-2"}


def test_linking_is_idempotent(version, link_people):
    _person(version, "sala-1", "familia", "Familia en crisis")

    link_people()
    link_people()

    assert CaseCharacter.objects.filter(case_version=version).count() == 1


def test_linking_reuses_a_character_the_author_already_edited(version, link_people):
    """Un personaje que Psicología ya editó (rol, ficha) no se duplica ni se pisa al enlazar."""
    edited = CaseCharacter.objects.create(
        case_version=version, character_key="familia", display_name="Familia en crisis",
        role_label="Víctima indirecta", show_in_brief=True,
    )
    obj = _person(version, "sala-1", "familia", "Familia en crisis")

    link_people()

    obj.refresh_from_db()
    assert obj.character_id == edited.id
    assert CaseCharacter.objects.filter(case_version=version).count() == 1
    edited.refresh_from_db()
    assert (edited.role_label, edited.show_in_brief) == ("Víctima indirecta", True)


def test_the_seeded_case_has_a_character_for_every_person(db):
    people = list(
        MapObject.objects.filter(
            scene_map__case_version__simulation_case__code="SIM-VBG-001",
            scene_map__case_version__status="PUBLISHED",
            object_type="PERSON",
        ).select_related("character")
    )

    assert people
    assert all(p.character_id is not None for p in people)
    assert all(p.character.display_name == p.label for p in people)
    # «familia-duelo» es dos personas del guion (otro nombre en otra sala): dos personajes.
    duelo = {p.character_id for p in people if p.object_key == "familia-duelo"}
    assert len(duelo) == 2


def test_reseeding_keeps_the_characters_the_author_edited(db):
    from django.core.management import call_command

    published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    character = CaseCharacter.objects.filter(case_version=published).order_by("id").first()
    CaseCharacter.objects.filter(pk=character.pk).update(role_label="Rol editado", show_in_brief=True)
    before = CaseCharacter.objects.filter(case_version=published).count()

    call_command("seed_caso_pdf", verbosity=0)

    assert CaseCharacter.objects.filter(case_version=published).count() == before
    character.refresh_from_db()
    assert (character.role_label, character.show_in_brief) == ("Rol editado", True)
    assert not MapObject.objects.filter(
        scene_map__case_version=published, object_type="PERSON", character__isnull=True
    ).exists()


# ─── auditoría ────────────────────────────────────────────────────────────────────────────────
def test_every_character_mutation_is_audited(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)

    created = _create(client, cv)
    character = created.data["data"]["characters"][0]
    client.put(f"{AUTHORING}/{cv}/characters/{character['id']}", _character_body(name="Otra"), format="json")
    client.delete(f"{AUTHORING}/{cv}/characters/{character['id']}")

    def audited(action, resource_type, resource_id):
        return AuditLog.objects.filter(
            action=action, resource_type=resource_type, resource_id=str(resource_id), actor_id=prof_a.id
        ).exists()

    assert audited("ADMIN_CREATE_CHARACTER", "CASE_VERSION", cv)
    assert audited("ADMIN_UPDATE_CHARACTER", "CHARACTER", character["id"])
    assert audited("ADMIN_DELETE_CHARACTER", "CHARACTER", character["id"])


# ─── «ausente = no tocar» en el propio personaje ──────────────────────────────────────────────
def test_updating_only_the_name_keeps_the_brief_flag_and_the_portrait(prof_a, case_a):
    cv, client = case_a["caseVersionId"], cl(prof_a)
    character = _create(client, cv, showInBrief=True, displayOrder=4).data["data"]["characters"][0]

    updated = client.put(
        f"{AUTHORING}/{cv}/characters/{character['id']}",
        {"characterKey": "ana", "displayName": "Ana T."}, format="json",
    )

    assert updated.status_code == 200, updated.data
    kept = updated.data["data"]["characters"][0]
    assert kept["displayName"] == "Ana T."
    assert (kept["showInBrief"], kept["displayOrder"]) == (True, 4)
    assert (kept["roleLabel"], kept["portraitKey"]) == ("Madre", "madre-1")
