"""El plano de las salas por piezas de un caso para el editor (P4, Tarea 11): ``GET /api/authoring/cases/<id>/plan``."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.biblioteca.services import catalogo_piezas, lugares

AUTORIA = "/api/authoring/cases"


def _docente(email):
    return get_user_model().objects.create_user(email=email, password="x", nombre="N", apellido="A", role="PROFESOR")


def _cliente(usuario):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _crear(cliente, lugar_id, salas, **extra):
    respuesta = cliente.post(AUTORIA, {"title": "Caso de prueba", "lugarId": lugar_id, "salas": salas, **extra}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]["caseVersionId"]


@pytest.fixture
def hospital(db):
    catalogo_piezas.cargar_catalogo.cache_clear()
    docente = _docente("plano@example.com")
    salas = [s["id"] for s in lugares.cargar_lugar("hospital")["salas"]]
    yield docente, _crear(_cliente(docente), "hospital", salas), salas
    catalogo_piezas.cargar_catalogo.cache_clear()


def test_el_plano_de_autoria_trae_todas_las_salas_y_puertas(hospital):
    docente, version, salas = hospital
    respuesta = _cliente(docente).get(f"{AUTORIA}/{version}/plan")
    assert respuesta.status_code == 200, respuesta.data
    plano = respuesta.data["data"]["plan"]
    assert sorted(r["key"] for r in plano["rooms"]) == sorted(salas)
    assert all(isinstance(r["plan"]["x"], int) and isinstance(r["plan"]["y"], int) for r in plano["rooms"])
    assert all(r["visited"] is False for r in plano["rooms"])
    assert "currentRoom" not in plano
    claves = {r["key"] for r in plano["rooms"]}
    assert plano["doors"] and all(d["from"] in claves and d["to"] in claves for d in plano["doors"])
    # Ninguna sala se monta sobre otra (los grupos van uno al lado del otro).
    cajas = [(r["plan"]["x"], r["plan"]["y"], r["plan"]["x"] + r["width"], r["plan"]["y"] + 528) for r in plano["rooms"]]
    for i, a in enumerate(cajas):
        for b in cajas[i + 1:]:
            assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1], (a, b)


def test_ningun_objeto_ni_persona_en_el_plano(hospital):
    docente, version, _ = hospital
    plano = _cliente(docente).get(f"{AUTORIA}/{version}/plan").data["data"]["plan"]
    assert set(plano) == {"rooms", "doors"}
    assert all(set(r) == {"key", "title", "width", "frame", "plan", "visited"} for r in plano["rooms"])
    assert all(set(d) == {"key", "from", "to", "wall", "pos"} for d in plano["doors"])


def test_un_caso_de_imagen_fija_da_plan_null(db):
    docente = _docente("fijo-plano@example.com")
    sala = lugares.cargar_lugar("casa")["salas"][0]["id"]
    version = _crear(_cliente(docente), "casa", [sala])
    respuesta = _cliente(docente).get(f"{AUTORIA}/{version}/plan")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["plan"] is None


def test_otra_docente_no_ve_el_plano(hospital):
    _, version, _ = hospital
    ajena = _docente("ajena-plano@example.com")
    assert _cliente(ajena).get(f"{AUTORIA}/{version}/plan").status_code == 404
