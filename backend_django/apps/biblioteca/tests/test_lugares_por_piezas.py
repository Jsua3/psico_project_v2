"""Los tres lugares conservan el modo fijo y pueden copiarse por piezas."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.biblioteca.services import catalogo_piezas, lugares
from apps.simulation.casedef import validate
from apps.simulation.models import CaseVersion, SceneMap
from apps.simulation.services.authoring.definition_io import export_definition


@pytest.mark.parametrize("lugar_id", ["casa", "comisaria", "universidad"])
def test_copia_del_lugar_entero(db, lugar_id):
    catalogo_piezas.cargar_catalogo.cache_clear()
    lugar = lugares.cargar_lugar(lugar_id, por_piezas=True)
    assert lugar["esquema"] == 3 and all(s["estructura"] for s in lugar["salas"])
    assert lugares.cargar_lugar(lugar_id)["esquema"] == 2
    docente = get_user_model().objects.create_user(
        email=f"{lugar_id}@example.com", password="x", nombre="N", apellido="A", role="PROFESOR",
    )
    cliente = APIClient()
    cliente.force_authenticate(user=docente)
    respuesta = cliente.post("/api/authoring/cases", {
        "title": "Caso de prueba", "lugarId": lugar_id, "salas": [s["id"] for s in lugar["salas"]],
        "porPiezas": True,
    }, format="json")
    assert respuesta.status_code == 200, respuesta.data
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["caseVersionId"])
    mapas = SceneMap.objects.filter(case_version=version)
    assert mapas.count() == len(lugar["salas"])
    assert all(mapa.structure for mapa in mapas)
    documento = export_definition(version.id)
    assert documento["x-siep"]["version"] == "2.2"
    reglas = {f"OCL-{n}" for n in range(13, 19)}
    resultados = {r.rule: r for r in validate.run_rules(documento).results if r.rule in reglas}
    assert set(resultados) == reglas
    fallas = {regla: [(f.path, f.message) for f in r.findings] or r.state
              for regla, r in resultados.items() if r.state != "CUMPLE" or r.findings}
    assert not fallas, fallas
    catalogo_piezas.cargar_catalogo.cache_clear()


def test_crear_sin_opcion_conserva_imagen_fija(db):
    docente = get_user_model().objects.create_user(
        email="fijo@example.com", password="x", nombre="N", apellido="A", role="PROFESOR",
    )
    cliente = APIClient()
    cliente.force_authenticate(user=docente)
    sala = lugares.cargar_lugar("casa")["salas"][0]["id"]
    respuesta = cliente.post("/api/authoring/cases", {"title": "Caso fijo", "lugarId": "casa", "salas": [sala]}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    assert SceneMap.objects.get(case_version_id=respuesta.data["data"]["caseVersionId"]).structure is None


def test_hospital_usa_el_archivo_habitual():
    assert lugares.cargar_lugar("hospital", por_piezas=True) == lugares.cargar_lugar("hospital")
