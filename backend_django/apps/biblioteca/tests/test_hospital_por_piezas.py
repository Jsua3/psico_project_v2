"""De punta a punta con la biblioteca real: el hospital por piezas (esquema 3) llega al mundo del estudiante.

1. La biblioteca lista el hospital junto a los lugares de imagen fija (conviven).
2. Crear un caso desde el hospital copia sus 8 salas con su ``estructura``, sus puertas en el muro y el arte de los
   muebles desde el catálogo de piezas.
3. El documento del caso es 2.2 y cumple OCL-13 a OCL-18 con el catálogo real de P1.
4. Un ensayo del caso recibe del servidor ``map.structure`` y ``layout`` en el mundo, como el estudiante.
"""
import io

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.biblioteca.services import catalogo_piezas, lugares
from apps.simulation.casedef import validate
from apps.simulation.models import CaseVersion, MapObject, SceneMap
from apps.simulation.services.authoring.definition_io import export_definition

User = get_user_model()
SALAS = [
    "entrada-urgencias", "sala-espera", "pasillo", "triaje", "estacion-enfermeria", "sala-escucha", "trabajo-social",
    "habitacion-recuperacion",
]
REGLAS = ("OCL-13", "OCL-14", "OCL-15", "OCL-16", "OCL-17", "OCL-18")


@pytest.fixture(autouse=True)
def _catalogo_real():
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


@pytest.fixture
def profesor(db):
    return User.objects.create_user(email="hospital_prof@x.com", password="x", nombre="N", apellido="A", role="PROFESOR")


def _cliente(usuario):
    client = APIClient()
    client.force_authenticate(user=usuario)
    return client


@pytest.fixture
def version(profesor):
    response = _cliente(profesor).post(
        "/api/authoring/cases", {"title": "Urgencias de noche", "lugarId": "hospital", "salas": SALAS}, format="json",
    )
    assert response.status_code == 200, response.data
    return CaseVersion.objects.get(pk=response.data["data"]["caseVersionId"])


def test_la_biblioteca_lista_el_hospital_junto_a_los_lugares_de_siempre(db):
    por_id = {lugar["id"]: lugar for lugar in lugares.listar_lugares()}
    assert {"universidad", "casa", "comisaria", "hospital"} <= set(por_id)
    assert por_id["hospital"]["salas"] == 8 and por_id["hospital"]["portada"] is None
    assert por_id["universidad"]["portada"].startswith("/assets/biblioteca/escenarios/universidad/")


def test_el_hospital_se_copia_con_su_estructura_y_sus_muebles(version):
    pasillo = SceneMap.objects.get(case_version=version, node__node_key="pasillo")
    assert pasillo.structure["ancho"] == pasillo.width == 1680
    assert SceneMap.objects.filter(case_version=version, structure__isnull=False).count() == 8
    camilla = MapObject.objects.filter(scene_map__case_version=version, object_type="PROP").first()
    assert '"/assets/biblioteca/piezas/muebles/hospital/' in camilla.metadata_json
    puertas = MapObject.objects.filter(scene_map=pasillo, object_type="EXIT")
    assert puertas.count() >= 7 and all('"muro"' in p.metadata_json for p in puertas)


def test_el_documento_del_hospital_cumple_las_reglas_de_las_salas_por_piezas(version):
    documento = export_definition(version.id)
    assert documento["x-siep"]["version"] == "2.2"
    resultados = {r.rule: r for r in validate.run_rules(documento).results if r.rule in REGLAS}
    hallazgos = {regla: [f.message for f in r.findings] for regla, r in resultados.items() if r.findings}
    assert hallazgos == {}
    assert {regla: r.state for regla, r in resultados.items()} == {regla: "CUMPLE" for regla in REGLAS}


def test_el_comando_de_siembra_crea_el_hospital_por_piezas(profesor):
    salida = io.StringIO()
    call_command("crear_caso_desde_lugar", "--autor", profesor.email, stdout=salida)
    assert "8 salas" in salida.getvalue()
    version = CaseVersion.objects.filter(simulation_case__created_by=profesor).latest("id")
    assert SceneMap.objects.filter(case_version=version, structure__isnull=False).count() == 8


def test_el_ensayo_recibe_la_estructura_y_el_plano(version, profesor):
    client = _cliente(profesor)
    inicio = client.post(f"/api/authoring/cases/{version.id}/rehearsal", {}, format="json")
    assert inicio.status_code == 200, inicio.data
    datos = inicio.data["data"]
    mundo = client.get(
        f"/api/simulation/attempts/{datos['attemptId']}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=datos["attemptToken"],
    )
    assert mundo.status_code == 200, mundo.data
    mapa, layout = mundo.data["data"]["map"], mundo.data["data"]["layout"]
    assert mapa["structure"]["ancho"] == mapa["width"] == 1200  # la entrada de urgencias
    assert "backgroundImage" not in mapa["ambient"]
    assert layout["currentRoom"] == "entrada-urgencias"
    assert {sala["key"] for sala in layout["rooms"]} == set(SALAS)
    assert {sala["key"] for sala in layout["rooms"] if sala["visited"]} == {"entrada-urgencias"}
    assert all(set(sala) == {"key", "title", "width", "frame", "plan", "visited"} for sala in layout["rooms"])
