"""Las reglas OCL-13 a OCL-18 de las salas por piezas (contrato x-siep 2.2, sección 4.1).

El documento que cumple es el del hospital por piezas (``apps/biblioteca/tests/test_copiar_estructura.py``) exportado tal
cual; cada prueba que incumple le cambia una sola cosa. ``SIM-VBG-001`` da «no aplica» en las seis.
"""
import copy
import json
import time
from pathlib import Path

import pytest

from apps.biblioteca.services import catalogo_piezas
from apps.biblioteca.tests.test_copiar_estructura import biblioteca, version  # noqa: F401 (fixtures)
from apps.simulation.casedef import rules_estructura, validate
from apps.simulation.services.authoring.definition_io import export_definition

FICHA = Path(__file__).resolve().parents[2] / "biblioteca" / "tests" / "fixtures" / "piezas" / "manifiesto.json"
SIM_VBG_001 = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-001.dsl.json"
REGLAS = ("OCL-13", "OCL-14", "OCL-15", "OCL-16", "OCL-17", "OCL-18")


@pytest.fixture(autouse=True)
def catalogo(settings):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(FICHA)
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


@pytest.fixture
def documento(version):
    return export_definition(version.id)


def _estados(documento):
    return {r.rule: r.state for r in validate.run_rules(documento).results if r.rule in REGLAS}


def _hallazgos(documento, regla):
    return [f for r in validate.run_rules(documento).results if r.rule == regla for f in r.findings]


def _mapa(documento, clave):
    return next(e["mapa"] for e in documento["x-siep"]["escenas"] if e.get("clave") == clave)


def _puerta(documento, sala, clave):
    return next(o for o in _mapa(documento, sala)["objetos"] if o["clave"] == clave)


def test_el_hospital_por_piezas_cumple_las_seis(documento):
    assert _estados(documento) == {regla: "CUMPLE" for regla in REGLAS}


def test_sim_vbg_001_no_aplica_en_ninguna():
    documento = json.loads(SIM_VBG_001.read_text(encoding="utf-8"))
    assert _estados(documento) == {regla: "NO_APLICA" for regla in REGLAS}


def test_las_nuevas_van_despues_de_las_de_la_2_1():
    orden = [r.rule for r in validate.run_rules({}).results]
    assert orden.index("OCL-12") < orden.index("OCL-13") < orden.index("OCL-18")


# ─── OCL-13 ───
def test_ocl_13_una_pieza_que_se_sale_del_muro(documento):
    _mapa(documento, "sala-espera")["estructura"]["piezas"][0]["pos"] = 1150  # ventana de 136 en un fondo de 1172
    assert _estados(documento)["OCL-13"] == "INCUMPLE"


def test_ocl_13_una_puerta_en_un_muro_que_el_encuadre_no_tiene(documento):
    _mapa(documento, "pasillo")["ambiente"]["encuadre"] = "dos-paredes-izquierda"  # sin muro derecho
    (hallazgo,) = _hallazgos(documento, "OCL-13")
    assert "derecha" in hallazgo.message


def test_ocl_13_una_lampara_de_suelo_fuera_de_la_zona(documento):
    _mapa(documento, "sala-espera")["estructura"]["piezas"][2]["y"] = 120
    assert _estados(documento)["OCL-13"] == "INCUMPLE"


# ─── OCL-14 ───
def test_ocl_14_un_cuadro_sobre_la_ventana(documento):
    _mapa(documento, "sala-espera")["estructura"]["piezas"].append(
        {"id": "c9", "tipo": "cuadro", "modelo": "cuadro", "muro": "fondo", "pos": 540},
    )
    assert _estados(documento)["OCL-14"] == "INCUMPLE"


def test_ocl_14_un_tubo_encima_de_la_puerta_no_choca(documento):
    _mapa(documento, "entrada-urgencias")["estructura"]["piezas"].append(
        {"id": "t9", "tipo": "lampara", "modelo": "tubo", "muro": "fondo", "pos": 485},
    )
    assert _estados(documento)["OCL-14"] == "CUMPLE"


def test_ocl_14_un_extintor_pegado_a_la_puerta_choca(documento):
    # Puerta corrediza de 144 en 485 (413–557); extintor de 24 en 565 (553–577): a menos de 8 px y a la misma altura.
    _mapa(documento, "entrada-urgencias")["estructura"]["piezas"].append(
        {"id": "e9", "tipo": "extintor", "modelo": "extintor", "muro": "fondo", "pos": 565},
    )
    assert _estados(documento)["OCL-14"] == "INCUMPLE"


# ─── OCL-15 ───
def test_ocl_15_una_puerta_hacia_una_sala_que_no_existe(documento):
    _puerta(documento, "sala-espera", "a-pasillo")["metadatos"]["targetNodeKey"] = "azotea"
    assert _estados(documento)["OCL-15"] == "INCUMPLE"


def test_ocl_15_sin_puerta_de_regreso(documento):
    pasillo = _mapa(documento, "pasillo")
    pasillo["objetos"] = [o for o in pasillo["objetos"] if o["clave"] != "a-sala-espera"]
    hallazgos = _hallazgos(documento, "OCL-15")
    assert hallazgos and "a-sala-espera" in hallazgos[0].message


def test_ocl_15_el_sentido_unico_no_pide_regreso(documento):
    entrada = _mapa(documento, "entrada-urgencias")
    entrada["objetos"] = [o for o in entrada["objetos"] if o["clave"] != "a-pasillo"]
    _puerta(documento, "pasillo", "a-entrada")["metadatos"]["sentidoUnico"] = True
    assert _estados(documento)["OCL-15"] == "CUMPLE"


# ─── OCL-16 ───
def test_ocl_16_la_llegada_cae_sobre_un_mueble(documento):
    # La puerta de la sala de espera hacia el pasillo llega a (1511, 390): se pone una caja encima.
    _mapa(documento, "pasillo")["colisiones"].append(
        {"clave": "choque-camilla", "etiqueta": "Camilla", "x": 1480, "y": 360, "ancho": 60, "alto": 40},
    )
    assert _estados(documento)["OCL-16"] == "INCUMPLE"


# ─── OCL-17 ───
def test_ocl_17_un_mueble_que_corta_la_sala(documento):
    _mapa(documento, "sala-espera")["colisiones"].append(
        {"clave": "choque-biombo", "etiqueta": "Biombo", "x": 400, "y": 236, "ancho": 24, "alto": 250},
    )
    hallazgos = _hallazgos(documento, "OCL-17")
    assert any("Pasar al pasillo" in h.message for h in hallazgos)


def test_ocl_17_aparecer_sobre_un_mueble(documento):
    _mapa(documento, "pasillo")["colisiones"].append(
        {"clave": "choque-mesa", "etiqueta": "Mesa", "x": 820, "y": 380, "ancho": 40, "alto": 40},
    )
    assert _estados(documento)["OCL-17"] == "INCUMPLE"


def test_ocl_17_en_1920_px_con_40_muebles_es_rapido():
    mapa = {
        "ancho": 1920, "alto": 528, "aparicion": {"x": 960, "y": 470},
        "colisiones": [{"x": 0, "y": 0, "ancho": 1920, "alto": 236}, {"x": 0, "y": 486, "ancho": 1920, "alto": 42}]
        + [{"x": 200 + 40 * k, "y": 260 + (k % 5) * 40, "ancho": 24, "alto": 20} for k in range(40)],
        "objetos": [],
    }
    inicio = time.perf_counter()
    puntos = rules_estructura.alcanzables(mapa)
    assert time.perf_counter() - inicio < 0.2
    assert (960, 470) in puntos and len(puntos) > 3000


# ─── OCL-18 ───
def test_ocl_18_una_paleta_que_no_existe(documento):
    _mapa(documento, "sala-espera")["estructura"]["acabados"]["paleta"] = "marte"
    assert _estados(documento)["OCL-18"] == "INCUMPLE"


def test_ocl_18_un_modelo_de_puerta_que_no_existe(documento):
    _puerta(documento, "pasillo", "a-servicio")["metadatos"]["modelo"] = "giratoria"
    assert _estados(documento)["OCL-18"] == "INCUMPLE"


def test_ocl_18_sin_catalogo_lo_dice(documento, settings, tmp_path):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(tmp_path / "no-existe.json")
    (hallazgo,) = _hallazgos(copy.deepcopy(documento), "OCL-18")
    assert "catálogo" in hallazgo.message
