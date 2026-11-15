"""El documento del caso 2.2 (contrato x-siep 2.2, sección 4): ``mapa.estructura``, la versión y la forma.

El caso de prueba es el hospital por piezas de ``apps/biblioteca/tests/test_copiar_estructura.py`` (entrada de urgencias,
sala de espera y pasillo). La regresión de los casos sin estructura —``SIM-VBG-001`` y su huella— la cubren
``test_casedef_v2``, ``test_caso_pdf_v21`` y ``test_seed_is_import``, que deben seguir en verde sin cambios.
"""
import copy
import dataclasses

import pytest
from django.db import transaction

from apps.biblioteca.tests.test_copiar_estructura import ESPERA, PASILLO, biblioteca, version  # noqa: F401 (fixtures)
from apps.simulation.casedef import import_, siep_check
from apps.simulation.casedef.report import ERROR
from apps.simulation.casedef.siep import STRUCTURE_VERSION, version_of
from apps.simulation.models import MapObject, SceneMap
from apps.simulation.services.authoring.definition_io import export_definition, load_definition, write_definition

SIEP = "x-siep"


def _mapa(documento, clave):
    return next(e["mapa"] for e in documento[SIEP]["escenas"] if e.get("clave") == clave)


def _puertas(mapa):
    return {o["clave"]: o for o in mapa["objetos"] if o["tipo"] == "EXIT"}


def _hallazgos_de_forma(documento):
    return [i for i in siep_check.check(documento) if i.severity == ERROR]


def _escribir(definicion, version, semantica):
    """La definición como otra versión del mismo caso (la versión semántica es única por caso)."""
    with transaction.atomic():
        return write_definition(
            dataclasses.replace(definicion, semantic_version=semantica), case=version.simulation_case, actor=version.created_by,
        )


def test_un_caso_con_estructura_se_exporta_en_2_2(version):
    documento = export_definition(version.id)
    assert documento[SIEP]["version"] == STRUCTURE_VERSION == "2.2"
    espera = _mapa(documento, "sala-espera")
    assert espera["estructura"] == ESPERA
    assert (espera["ancho"], espera["alto"]) == (1440, 528)
    assert list(espera)[:8] == ["clave", "titulo", "ancho", "alto", "tema", "aparicion", "ambiente", "estructura"]
    puerta = _puertas(_mapa(documento, "pasillo"))["a-sala-espera"]
    assert (puerta["x"], puerta["y"]) == (1511, 390)
    assert puerta["metadatos"]["muro"] == "derecha" and puerta["metadatos"]["entryX"] == 150


def test_el_documento_2_2_tiene_buena_forma(version):
    assert _hallazgos_de_forma(export_definition(version.id)) == []


def test_ida_y_vuelta_conserva_la_estructura_y_las_puertas(version):
    documento = export_definition(version.id)
    copia = _escribir(import_.to_definition(documento), version, "0.2.0")
    assert SceneMap.objects.get(case_version=copia, node__node_key="pasillo").structure == PASILLO
    otra_vez = export_definition(copia.id)
    for clave in ("entrada-urgencias", "sala-espera", "pasillo"):
        assert _mapa(otra_vez, clave)["estructura"] == _mapa(documento, clave)["estructura"]
        assert _puertas(_mapa(otra_vez, clave)) == _puertas(_mapa(documento, clave))


def test_importar_recalcula_lo_que_el_documento_traiga_mal(version):
    documento = export_definition(version.id)
    pasillo = _mapa(documento, "pasillo")
    puerta = _puertas(pasillo)["a-sala-espera"]
    puerta["x"], puerta["y"], puerta["metadatos"]["entryX"] = 1, 1, 1
    pasillo["ancho"] = 960
    copia = _escribir(import_.to_definition(documento), version, "0.3.0")
    mapa =SceneMap.objects.get(case_version=copia, node__node_key="pasillo")
    objeto = MapObject.objects.get(scene_map=mapa, object_key="a-sala-espera")
    assert mapa.width == 1680 and (objeto.position_x, objeto.position_y) == (1511, 390)


def test_sin_estructura_la_version_no_sube(version):
    definicion = load_definition(version.id).definition
    escenas = tuple(
        s if s.world is None else type(s)(**{**s.__dict__, "world": type(s.world)(**{**s.world.__dict__, "structure": None})})
        for s in definicion.scenes
    )
    assert version_of(type(definicion)(**{**definicion.__dict__, "scenes": escenas})) in ("2.0", "2.1")


def _con(version, cambio):
    documento = copy.deepcopy(export_definition(version.id))
    cambio(documento)
    return documento


def test_una_clave_desconocida_en_la_estructura_es_error_de_forma(version):
    documento = _con(version, lambda d: _mapa(d, "sala-espera")["estructura"].update(color="rojo"))
    assert _hallazgos_de_forma(documento)


def test_una_ruta_propia_que_sale_de_la_carpeta_es_error_de_forma(version):
    def poner(d):
        _mapa(d, "sala-espera")["estructura"]["propios"] = [{"ref": "x", "ruta": "piezas/propios/../../secreto.png"}]
    assert _hallazgos_de_forma(_con(version, poner))


def test_una_pieza_con_muro_y_coordenadas_a_la_vez_es_error_de_forma(version):
    def poner(d):
        _mapa(d, "pasillo")["estructura"]["piezas"].append(
            {"id": "mala", "tipo": "cuadro", "modelo": "cuadro", "muro": "fondo", "pos": 40, "x": 10, "y": 10}
        )
    assert _hallazgos_de_forma(_con(version, poner))


def test_estructura_con_version_2_1_es_error_de_forma(version):
    documento = _con(version, lambda d: d[SIEP].update(version="2.1"))
    assert _hallazgos_de_forma(documento)


@pytest.mark.parametrize("valor", [
    ESPERA, {**PASILLO, "exterior": True},
    {**ESPERA, "tapetes": [{"ruta": "piezas/tapetes/hospital-sala-escucha-1.png", "x": 300, "y": 320}]},
])
def test_la_forma_suelta_de_la_estructura_acepta_lo_del_contrato(valor):
    assert siep_check.structure_errors(valor) == []


def test_la_forma_suelta_rechaza_un_ancho_fuera_del_catalogo():
    assert siep_check.structure_errors({**ESPERA, "ancho": 1000})
