"""El catálogo de piezas que lee el servidor (contrato x-siep 2.2, sección 2.2): lo que necesitan las reglas OCL-13 a 18."""
from pathlib import Path

import pytest

from apps.biblioteca.services import catalogo_piezas, geometria

FICHA = Path(__file__).parent / "fixtures" / "piezas" / "manifiesto.json"


@pytest.fixture(autouse=True)
def _sin_cache():
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


def test_lee_las_piezas_con_muros_ocupa_y_franja():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    puerta = catalogo.piezas["puerta/madera"]
    assert puerta.muros == frozenset({"fondo", "izquierda", "derecha", "camara"})
    assert (puerta.ocupa, puerta.franja) == (64, (0, 101))
    assert puerta.es_puerta
    assert catalogo.piezas["lampara/pie"].de_suelo
    assert not catalogo.piezas["lampara/tubo"].es_puerta


def test_lee_pisos_variantes_muros_paletas_y_propios():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    assert {"vinilo", "damero", "madera"} <= catalogo.pisos
    assert catalogo.tiene_piso("vinilo", "a") and catalogo.tiene_piso("vinilo", "b")
    assert catalogo.tiene_piso("damero", "universidad-cafeteria")
    assert not catalogo.tiene_piso("vinilo", "z")
    assert catalogo.tiene_muro("zocalo-alto", "hospital")
    assert catalogo.tiene_muro("azulejo", "casa-cocina")
    assert not catalogo.tiene_muro("pintura", "marte")
    assert "piezas/propios/casa-cocina.png" in catalogo.propios
    assert "piezas/tapetes/hospital-sala-escucha-1.png" in catalogo.tapetes


def test_los_anchos_y_bordes_del_manifiesto_son_los_de_la_geometria():
    catalogo = catalogo_piezas.cargar_catalogo(FICHA)
    assert catalogo.anchos == geometria.ANCHOS
    assert catalogo.bordes == {ancho: geometria.borde(ancho) for ancho in geometria.ANCHOS}


def test_sin_manifiesto_no_hay_catalogo(tmp_path):
    assert catalogo_piezas.cargar_catalogo(tmp_path / "no-existe.json") is None


def test_un_manifiesto_roto_no_es_catalogo(tmp_path):
    roto = tmp_path / "manifiesto.json"
    roto.write_text("{ no es json", encoding="utf-8")
    assert catalogo_piezas.cargar_catalogo(roto) is None


def test_por_omision_lee_la_ruta_de_la_configuracion(settings):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(FICHA)
    assert catalogo_piezas.catalogo_vigente().piezas["ventana/alta"].ocupa == 136
