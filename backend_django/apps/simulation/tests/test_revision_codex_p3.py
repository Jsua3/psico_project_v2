"""Los hallazgos de la revisión de Codex sobre el bloque P3 (``.superpowers/codex/2026-11-15-revision-P3.md``).

Una prueba por hallazgo, sobre el hospital por piezas de ``apps/biblioteca/tests/test_copiar_estructura.py``. El 1 (dos
hojas de migraciones al juntar C1 y P3) lo vigila ``test_migrations_state.py``, con la regla en su mensaje.
"""
import json
from pathlib import Path

import pytest
from django.db import transaction

from apps.biblioteca.services import catalogo_piezas
from apps.biblioteca.tests.test_copiar_estructura import biblioteca, version  # noqa: F401 (fixtures)
from apps.simulation.casedef import rules_estructura, siep_check, validate
from apps.simulation.models import CaseVersion, MapObject, SceneMap
from apps.simulation.services import world_layout, world_service
from apps.simulation.services.authoring import world_definition
from apps.simulation.services.authoring.definition_io import export_definition
from apps.simulation.services.world_layout import _colocar, _Sala

FICHA = Path(__file__).resolve().parents[2] / "biblioteca" / "tests" / "fixtures" / "piezas" / "manifiesto.json"


@pytest.fixture(autouse=True)
def catalogo(settings):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(FICHA)
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


@pytest.fixture
def documento(version):
    return export_definition(version.id)


def _mapa(documento, clave):
    return next(e["mapa"] for e in documento["x-siep"]["escenas"] if e.get("clave") == clave)


def _puerta(documento, sala, clave):
    return next(o for o in _mapa(documento, sala)["objetos"] if o["clave"] == clave)


def _estado(documento, regla):
    return next(r.state for r in validate.run_rules(documento).results if r.rule == regla)


# ─── 2. Una puerta con muro o pos inválidos no se salta las reglas ───
@pytest.mark.parametrize("cambio", [
    {"pos": "100"}, {"muro": "techo"}, {"pos": None},
])
def test_2_una_puerta_mal_puesta_es_un_hallazgo_de_ocl_13(documento, cambio):
    meta = _puerta(documento, "pasillo", "a-sala-espera")["metadatos"]
    for campo, valor in cambio.items():
        if valor is None:
            meta.pop(campo)
        else:
            meta[campo] = valor
    assert _estado(documento, "OCL-13") == "INCUMPLE"


def test_2_una_puerta_sin_muro_en_una_sala_por_piezas_es_un_hallazgo(documento):
    meta = _puerta(documento, "pasillo", "a-sala-espera")["metadatos"]
    for campo in ("muro", "pos", "modelo"):
        meta.pop(campo)
    assert _estado(documento, "OCL-13") == "INCUMPLE"


def test_2_una_puerta_mal_puesta_igual_debe_llevar_a_una_sala(documento):
    meta = _puerta(documento, "pasillo", "a-sala-espera")["metadatos"]
    meta["pos"], meta["targetNodeKey"] = "100", "azotea"
    assert _estado(documento, "OCL-15") == "INCUMPLE"


def test_2_una_puerta_sin_modelo_es_un_hallazgo_de_ocl_18(documento):
    _puerta(documento, "pasillo", "a-sala-espera")["metadatos"].pop("modelo")
    assert _estado(documento, "OCL-18") == "INCUMPLE"


def test_2_par_y_sentido_unico_con_el_tipo_equivocado(documento):
    meta = _puerta(documento, "pasillo", "a-sala-espera")["metadatos"]
    meta["par"], meta["sentidoUnico"] = 7, "si"
    assert _estado(documento, "OCL-15") == "INCUMPLE"


# ─── 3. Cambiar la aparición de un destino de imagen fija mueve la llegada ───
def test_3_la_llegada_sigue_a_la_aparicion_de_un_destino_de_imagen_fija(version):
    pasillo = SceneMap.objects.get(case_version=version, node__node_key="pasillo")
    with transaction.atomic():
        world_definition.save_world(version.id, pasillo.node_id, {
            "revision": CaseVersion.objects.get(pk=version.id).version,
            "map": {"structure": None, "spawnX": 500, "spawnY": 400},
        })
    puerta = MapObject.objects.get(scene_map__case_version=version, scene_map__node__node_key="sala-espera", object_key="a-pasillo")
    meta = json.loads(puerta.metadata_json)
    assert (meta["entryX"], meta["entryY"]) == (500, 400)


# ─── 4. OCL-16 exige que quepa el pie entero en el mapa ───
def test_4_una_llegada_con_el_pie_fuera_del_mapa(documento):
    _mapa(documento, "pasillo")["colisiones"] = []
    meta = _puerta(documento, "sala-espera", "a-pasillo")["metadatos"]
    meta["entryX"], meta["entryY"] = 5, 390  # el pie empezaría en x = −6
    assert _estado(documento, "OCL-16") == "INCUMPLE"


# ─── 5. OCL-17: la aparición y la rejilla respetan la caja del pie ───
def test_5_una_aparicion_fuera_del_mapa_no_alcanza_nada(documento):
    pasillo = _mapa(documento, "pasillo")
    pasillo["colisiones"] = []
    pasillo["aparicion"] = {"x": -1, "y": 400}
    assert _estado(documento, "OCL-17") == "INCUMPLE"


def test_5_la_rejilla_no_saca_el_pie_por_ningun_borde():
    mapa = {"ancho": 960, "alto": 528, "aparicion": {"x": 480, "y": 300}, "colisiones": [], "objetos": []}
    puntos = rules_estructura.alcanzables(mapa)
    assert min(x for x, _ in puntos) >= 11 and max(x for x, _ in puntos) <= 960 - 11
    assert min(y for _, y in puntos) >= 16 and max(y for _, y in puntos) <= 528


# ─── 6. El plano no se cae cuando una sala no encuentra sitio ───
def test_6_una_sala_sin_sitio_no_tumba_el_plano(monkeypatch):
    monkeypatch.setattr(world_layout, "MAX_FILAS", 0)  # ningún candidato sirve
    salas = {
        "a": _Sala("a", "A", 960, "tres-paredes", None, (0, 1), None, [("p", "b", "fondo", 400)]),
        "b": _Sala("b", "B", 960, "tres-paredes", None, (1, 2), None, [("q", "c", "derecha", 160)]),
        "c": _Sala("c", "C", 960, "tres-paredes", None, (2, 3), None, []),
    }
    posicion = _colocar(salas, {"a", "b", "c"}, "a")
    assert set(posicion) == {"a", "b", "c"}
    rects = [(x, y, salas[c].ancho) for c, (x, y) in posicion.items()]
    for i, (x, y, w) in enumerate(rects):
        for ox, oy, ow in rects[i + 1:]:
            assert not (x < ox + ow and ox < x + w and y < oy + 528 and oy < y + 528)


# ─── 7. Ids de pieza repetidos ───
def test_7_ids_de_pieza_repetidos_en_el_documento(documento):
    piezas = _mapa(documento, "sala-espera")["estructura"]["piezas"]
    piezas.append({**piezas[0], "pos": 900})
    assert any(i.severity == "error" for i in siep_check.check(documento))


def test_7_ids_de_pieza_repetidos_en_el_editor():
    estructura = {
        "ancho": 960, "momento": "dia", "acabados": {"piso": "madera", "muro": "pintura", "paleta": "casa"},
        "piezas": [
            {"id": "v1", "tipo": "ventana", "modelo": "alta", "muro": "fondo", "pos": 200},
            {"id": "v1", "tipo": "ventana", "modelo": "alta", "muro": "fondo", "pos": 600},
        ],
    }
    assert siep_check.structure_errors(estructura)


# ─── 8. Una sala por piezas no entrega fondo ───
def test_8_una_sala_por_piezas_no_entrega_backgroundimage(version):
    mapa = SceneMap.objects.get(case_version=version, node__node_key="pasillo")
    ambiente = json.loads(mapa.ambient_json)
    ambiente["backgroundImage"] = "/assets/biblioteca/escenarios/universidad/arte/salas/pasillo.png"
    mapa.ambient_json = json.dumps(ambiente)
    mapa.save()
    estatico = world_service._build_static_world(mapa, version.id)
    assert "backgroundImage" not in estatico["map"]["ambient"]
    assert estatico["map"]["structure"]["ancho"] == 1680
