"""El plano del lugar en el mundo del estudiante (contrato x-siep 2.2, secciones 5.2 y 5.3).

El caso es el hospital por piezas de ``apps/biblioteca/tests/test_copiar_estructura.py``: entrada de urgencias (inicial),
sala de espera y pasillo. Sus posiciones son las del ejemplo de la sección 5.2 del contrato.
"""
import json
from types import SimpleNamespace

from apps.biblioteca.tests.test_copiar_estructura import biblioteca, version  # noqa: F401 (fixtures)
from apps.simulation.models import SceneMap
from apps.simulation.services import world_layout
from apps.simulation.services.world_layout import _colocar, _Sala, muro_de_puerta

SALA = {"key", "title", "width", "frame", "plan", "visited"}
PUERTA = {"key", "from", "to", "wall", "pos"}


def _plan(layout):
    return {r["key"]: (r["plan"]["x"], r["plan"]["y"]) for r in layout["rooms"]}


def _ambiente(version, sala, **cambios):
    mapa = SceneMap.objects.get(case_version=version, node__node_key=sala)
    ambiente = json.loads(mapa.ambient_json)
    ambiente.update(cambios)
    mapa.ambient_json = json.dumps(ambiente)
    mapa.save()


def test_las_posiciones_del_ejemplo_del_contrato(version):
    plano = world_layout.plano_de_version(version.id)
    layout = world_layout.recortar(plano, "sala-espera", {"entrada-urgencias", "sala-espera"})
    assert layout["currentRoom"] == "sala-espera"
    assert _plan(layout) == {"entrada-urgencias": (0, 0), "sala-espera": (-120, -624), "pasillo": (-1776, 0)}
    assert {r["key"]: (r["width"], r["frame"], r["visited"]) for r in layout["rooms"]} == {
        "entrada-urgencias": (1200, "tres-paredes", True),
        "sala-espera": (1440, "tres-paredes", True),
        "pasillo": (1680, "tres-paredes", False),
    }


def test_las_puertas_del_plano(version):
    layout = world_layout.recortar(world_layout.plano_de_version(version.id), "pasillo", set())
    puertas = {(d["from"], d["key"]): (d["to"], d["wall"], d["pos"]) for d in layout["doors"]}
    assert puertas[("entrada-urgencias", "a-espera")] == ("sala-espera", "fondo", 485)
    assert puertas[("pasillo", "a-sala-espera")] == ("sala-espera", "derecha", 160)
    assert puertas[("pasillo", "a-servicio")] == ("entrada-urgencias", "camara", 1032)
    assert len(puertas) == 7


def test_el_plano_no_trae_objetos_ni_personajes(version):
    layout = world_layout.recortar(world_layout.plano_de_version(version.id), "sala-espera", set())
    assert set(layout) == {"currentRoom", "rooms", "doors"}
    assert all(set(r) == SALA for r in layout["rooms"])
    assert all(set(d) == PUERTA for d in layout["doors"])
    assert "abuela" not in json.dumps(layout).lower()


def test_otra_sala_de_otro_lugar_no_entra(version):
    _ambiente(version, "pasillo", lugarId="comisaria")
    layout = world_layout.recortar(world_layout.plano_de_version(version.id), "sala-espera", set())
    assert set(_plan(layout)) == {"entrada-urgencias", "sala-espera"}
    assert all("pasillo" not in (d["from"], d["to"]) for d in layout["doors"])


def test_el_ajuste_manual_manda(version):
    _ambiente(version, "sala-espera", plano={"x": 4000, "y": 8})
    layout = world_layout.recortar(world_layout.plano_de_version(version.id), "sala-espera", set())
    assert _plan(layout)["sala-espera"] == (4000, 8)
    assert _plan(layout)["entrada-urgencias"] == (0, 0)


def test_las_visitadas_salen_de_los_eventos_del_intento(version):
    plano = world_layout.plano_de_version(version.id)
    eventos = [("NODE_ENTERED", "entrada-urgencias", ""), ("ROOM_ENTERED", "entrada-urgencias", "Puerta hacia sala pasillo")]
    assert world_layout.salas_visitadas(plano, eventos, "pasillo") == {"entrada-urgencias", "pasillo"}


def test_layout_para_un_intento_sin_eventos(version):
    mapa = SceneMap.objects.select_related("node").get(case_version=version, node__node_key="pasillo")
    layout = world_layout.layout_para(SimpleNamespace(id=0, case_version=version), mapa)
    assert layout["currentRoom"] == "pasillo"
    assert {r["key"] for r in layout["rooms"] if r["visited"]} == {"entrada-urgencias", "pasillo"}


def test_dos_salas_en_el_mismo_sitio_se_corren_a_lo_largo_del_muro():
    salas = {
        "a": _Sala("a", "A", 960, "tres-paredes", None, (0, 1), None, [("p1", "b", "fondo", 400), ("p2", "c", "fondo", 432)]),
        "b": _Sala("b", "B", 960, "tres-paredes", None, (1, 2), None, []),
        "c": _Sala("c", "C", 960, "tres-paredes", None, (2, 3), None, []),
    }
    posicion = _colocar(salas, {"a", "b", "c"}, "a")
    assert posicion["b"] == (16, -624)  # piso8(0 + 96 + 400 − 480)
    assert posicion["c"] == (1072, -624)  # caía en (48, −624): se corre de 8 en 8 hasta quedar a 96 de B


def test_una_sala_que_solo_tiene_puerta_hacia_la_otra_se_ubica_al_reves():
    salas = {
        "a": _Sala("a", "A", 960, "tres-paredes", None, (0, 1), None, []),
        "b": _Sala("b", "B", 960, "tres-paredes", None, (1, 2), None, [("p", "a", "derecha", 160)]),
    }
    assert _colocar(salas, {"a", "b"}, "a")["b"] == (-1056, 0)  # A está a la derecha de B


def test_el_muro_de_una_puerta_de_imagen_fija_se_deduce_del_umbral():
    assert muro_de_puerta({}, 480, 236, "tres-paredes", 960) == ("fondo", 384)
    assert muro_de_puerta({}, 480, 480, "tres-paredes", 960) == ("camara", 384)
    assert muro_de_puerta({}, 100, 300, "tres-paredes", 960) == ("izquierda", 70)
    assert muro_de_puerta({}, 860, 300, "tres-paredes", 960) == ("derecha", 70)
    assert muro_de_puerta({"muro": "fondo", "pos": 12}, 0, 0, "tres-paredes", 960) == ("fondo", 12)
