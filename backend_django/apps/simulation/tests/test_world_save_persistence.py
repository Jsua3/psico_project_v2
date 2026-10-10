"""A-05 — El guardado del mundo (`PUT /world`) persiste lo que el editor manda.

El editor de mundo envía, en cada guardado, el estado completo de la sala: mapa, objetos,
zonas de colisión y diálogos. Antes de A-05 el backend solo hacía *upsert* de los objetos
recibidos (no borraba los ausentes), ignoraba por completo `collisionZones` y buscaba cada
objeto por `id` en toda la base, así que un objeto nuevo cuyo identificador local coincidía
con el de otra sala se llevaba ese objeto. Estas pruebas fijan el comportamiento nuevo y lo
que no debe cambiar: omitir una lista no toca nada y las otras salas no se tocan nunca.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, CollisionZone, DialogueTree, MapObject, SceneMap

User = get_user_model()
BASE = "/api/admin/cases"


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_a05@x.com", password="x", nombre="Ad", apellido="A05", role="ADMIN"
    )


@pytest.fixture
def api(admin):
    client = APIClient()
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def draft(api):
    published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id
    resp = api.post(f"{BASE}/{published}/clone-version")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]["caseVersionId"]


def _world(api, cv, node_id=None):
    url = f"{BASE}/{cv}/world-editor" + (f"?nodeId={node_id}" if node_id is not None else "")
    return api.get(url).data["data"]


def _save(api, cv, world, **overrides):
    """Guarda como lo hace el editor: el estado completo de la sala que acaba de leer."""
    body = {
        "revision": world["revision"],
        "map": world["map"],
        "objects": world["objects"],
        "collisionZones": world["collisionZones"],
        "dialogues": world["dialogues"],
        "clinicalTools": world["clinicalTools"],
    }
    body.update(overrides)
    resp = api.put(f"{BASE}/{cv}/world?nodeId={world['nodeId']}", body, format="json")
    assert resp.status_code == 200, resp.data
    return resp.data["data"]


def _new_object(key, **overrides):
    obj = {"key": key, "label": "Nuevo", "type": "PROP", "x": 10, "y": 20, "width": 40, "height": 40,
           "visible": True, "collision": False}
    obj.update(overrides)
    return obj


def _object_with_dialogue(api, cv):
    """Deja un diálogo colgado del primer objeto de la sala y devuelve (mundo, objeto, árbol)."""
    world = _world(api, cv)
    target = world["objects"][0]
    saved = _save(api, cv, world, dialogues=[{
        "id": None, "key": "dlg-a05", "speakerName": "Voz", "portraitKey": None, "emotion": "neutral",
        "mapObjectId": None, "mapObjectKey": target["key"], "lines": [], "choices": [],
    }])
    tree = next(t for t in saved["dialogues"] if t["key"] == "dlg-a05")
    assert tree["mapObjectId"] == target["id"]
    return saved, target, tree


# ── objetos ──────────────────────────────────────────────────────────────────
def test_un_objeto_ausente_del_cuerpo_se_borra(api, draft):
    world = _world(api, draft)
    assert len(world["objects"]) >= 2
    gone, kept = world["objects"][0], world["objects"][1:]

    saved = _save(api, draft, world, objects=kept)

    assert gone["id"] not in {o["id"] for o in saved["objects"]}
    assert not MapObject.objects.filter(pk=gone["id"]).exists()
    assert {o["id"] for o in saved["objects"]} == {o["id"] for o in kept}


def test_borrar_un_objeto_y_su_dialogo_y_guardar_no_lo_deja_reaparecer(api, draft):
    """El macro «borrar objeto + diálogo» de P-07: al recargar no vuelve el objeto sin su diálogo."""
    world, target, tree = _object_with_dialogue(api, draft)
    objects = [o for o in world["objects"] if o["id"] != target["id"]]
    dialogues = [t for t in world["dialogues"] if t["id"] != tree["id"]]

    saved = _save(api, draft, world, objects=objects, dialogues=dialogues)

    assert target["id"] not in {o["id"] for o in saved["objects"]}
    assert tree["id"] not in {t["id"] for t in saved["dialogues"]}
    assert not MapObject.objects.filter(pk=target["id"]).exists()
    assert not DialogueTree.objects.filter(pk=tree["id"]).exists()


def test_el_objeto_borrado_se_lleva_su_dialogo_aunque_no_se_mande_la_lista_de_dialogos(api, draft):
    """Con la clave foránea de producción en cascada el diálogo desaparece con su objeto; con la del
    esquema de desarrollo (sin cascada) borrar el objeto fallaría. Se borra el árbol explícitamente."""
    world, target, tree = _object_with_dialogue(api, draft)
    objects = [o for o in world["objects"] if o["id"] != target["id"]]

    body = {"revision": world["revision"], "objects": objects}
    resp = api.put(f"{BASE}/{draft}/world?nodeId={world['nodeId']}", body, format="json")

    assert resp.status_code == 200, resp.data
    assert not MapObject.objects.filter(pk=target["id"]).exists()
    assert not DialogueTree.objects.filter(pk=tree["id"]).exists()


def test_un_dialogo_cuyo_objeto_se_borro_queda_sin_dueno_en_vez_de_borrarse(api, draft):
    world, target, tree = _object_with_dialogue(api, draft)
    objects = [o for o in world["objects"] if o["id"] != target["id"]]
    kept_tree = {**next(t for t in world["dialogues"] if t["id"] == tree["id"]), "mapObjectKey": target["key"]}

    saved = _save(api, draft, world, objects=objects, dialogues=[kept_tree])

    survivor = next(t for t in saved["dialogues"] if t["id"] == tree["id"])
    assert survivor["mapObjectId"] is None
    assert not MapObject.objects.filter(pk=target["id"]).exists()


def test_los_objetos_existentes_se_actualizan_por_id_y_los_nuevos_se_crean(api, draft):
    world = _world(api, draft)
    first = {**world["objects"][0], "label": "Renombrado", "x": 123}
    brand_new = _new_object("a05-nuevo", id=None)

    saved = _save(api, draft, world, objects=[first] + world["objects"][1:] + [brand_new])

    by_id = {o["id"]: o for o in saved["objects"]}
    assert (by_id[first["id"]]["label"], by_id[first["id"]]["x"]) == ("Renombrado", 123)
    created = next(o for o in saved["objects"] if o["key"] == "a05-nuevo")
    assert created["id"] not in {o["id"] for o in world["objects"]}
    assert len(saved["objects"]) == len(world["objects"]) + 1


def test_un_objeto_nuevo_con_el_id_de_otra_sala_no_se_lleva_el_de_esa_sala(api, draft):
    """El editor numera los objetos nuevos con «el mayor id de la sala + 1», que puede ser el id real
    de un objeto de otra sala."""
    world = _world(api, draft)
    other = (
        MapObject.objects.filter(scene_map__case_version_id=draft)
        .exclude(scene_map_id=world["map"]["id"]).order_by("id").first()
    )
    assert other is not None
    original = (other.scene_map_id, other.object_key, other.label)

    saved = _save(api, draft, world, objects=world["objects"] + [_new_object("a05-ajeno", id=other.id)])

    other.refresh_from_db()
    assert (other.scene_map_id, other.object_key, other.label) == original
    created = next(o for o in saved["objects"] if o["key"] == "a05-ajeno")
    assert created["id"] != other.id


# ── zonas de colisión ────────────────────────────────────────────────────────
def test_las_zonas_de_colision_se_actualizan_se_crean_y_se_borran(api, draft):
    world = _world(api, draft)
    assert len(world["collisionZones"]) >= 2
    edited = {**world["collisionZones"][0], "label": "Etiqueta nueva", "x": 77, "width": 55}
    untouched = world["collisionZones"][1]
    brand_new = {"id": None, "key": "a05-zona", "label": "Zona nueva", "x": 5, "y": 6, "width": 70, "height": 80}

    saved = _save(api, draft, world, collisionZones=[edited, untouched, brand_new])

    by_key = {z["key"]: z for z in saved["collisionZones"]}
    assert set(by_key) == {edited["key"], untouched["key"], "a05-zona"}
    assert (by_key[edited["key"]]["label"], by_key[edited["key"]]["x"], by_key[edited["key"]]["width"]) == ("Etiqueta nueva", 77, 55)
    assert by_key["a05-zona"]["label"] == "Zona nueva"
    assert (by_key["a05-zona"]["x"], by_key["a05-zona"]["y"], by_key["a05-zona"]["width"], by_key["a05-zona"]["height"]) == (5, 6, 70, 80)
    assert CollisionZone.objects.filter(scene_map_id=world["map"]["id"]).count() == 3


def test_una_zona_sin_clave_ni_tamano_se_guarda_con_los_valores_minimos(api, draft):
    world = _world(api, draft)

    saved = _save(api, draft, world, collisionZones=[
        {"id": None, "key": None, "label": None, "x": 1, "y": 2, "width": 0, "height": -5}
    ])

    (zone,) = saved["collisionZones"]
    assert (zone["key"], zone["label"]) == ("", None)
    assert (zone["x"], zone["y"], zone["width"], zone["height"]) == (1, 2, 1, 1)


def test_una_zona_nueva_con_el_id_de_otra_sala_no_se_lleva_la_de_esa_sala(api, draft):
    world = _world(api, draft)
    other = (
        CollisionZone.objects.filter(scene_map__case_version_id=draft)
        .exclude(scene_map_id=world["map"]["id"]).order_by("id").first()
    )
    assert other is not None
    original = (other.scene_map_id, other.zone_key, other.label)

    saved = _save(
        api, draft, world,
        collisionZones=world["collisionZones"] + [
            {"id": other.id, "key": "a05-zona-ajena", "label": "x", "x": 1, "y": 1, "width": 10, "height": 10}
        ],
    )

    other.refresh_from_db()
    assert (other.scene_map_id, other.zone_key, other.label) == original
    assert "a05-zona-ajena" in {z["key"] for z in saved["collisionZones"]}


# ── lo que no cambia ─────────────────────────────────────────────────────────
def test_omitir_las_listas_no_toca_nada(api, draft):
    world = _world(api, draft)
    before = (
        MapObject.objects.filter(scene_map_id=world["map"]["id"]).count(),
        CollisionZone.objects.filter(scene_map_id=world["map"]["id"]).count(),
        DialogueTree.objects.filter(scene_map_id=world["map"]["id"]).count(),
    )

    resp = api.put(
        f"{BASE}/{draft}/world?nodeId={world['nodeId']}",
        {"revision": world["revision"], "map": {**world["map"], "theme": "a05-tema"}},
        format="json",
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["data"]["map"]["theme"] == "a05-tema"
    assert (
        MapObject.objects.filter(scene_map_id=world["map"]["id"]).count(),
        CollisionZone.objects.filter(scene_map_id=world["map"]["id"]).count(),
        DialogueTree.objects.filter(scene_map_id=world["map"]["id"]).count(),
    ) == before


def test_guardar_una_sala_no_toca_las_otras(api, draft):
    world = _world(api, draft)
    other_map = SceneMap.objects.filter(case_version_id=draft).exclude(pk=world["map"]["id"]).order_by("id").first()
    assert other_map is not None

    def snapshot():
        return (
            list(MapObject.objects.filter(scene_map_id=other_map.id).order_by("id").values()),
            list(CollisionZone.objects.filter(scene_map_id=other_map.id).order_by("id").values()),
        )

    before = snapshot()

    _save(api, draft, world, objects=[], collisionZones=[], dialogues=[])

    assert snapshot() == before
    assert not MapObject.objects.filter(scene_map_id=world["map"]["id"]).exists()
    assert not CollisionZone.objects.filter(scene_map_id=world["map"]["id"]).exists()
