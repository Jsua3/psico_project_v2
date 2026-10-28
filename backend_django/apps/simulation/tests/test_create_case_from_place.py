"""P6 · Tarea 2 · Crear un caso desde un lugar de la biblioteca (``POST …/cases`` con ``lugarId`` y ``salas``).

Elegir un lugar **copia** las salas elegidas al caso (escenas, mapas, muebles, objetos, personajes, herramientas, puertas,
hitos y nivel de riesgo): la biblioteca y los demás casos no cambian, y lo ya copiado no se mueve si la biblioteca cambia
después. Sin ``lugarId`` la creación es la de siempre.
"""
import copy
import json
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.biblioteca.services import copiar_al_caso, geometria, lugares
from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    MapObject,
    SceneMap,
    SimulationNode,
)
from apps.simulation.services import case_rules, world_service
from apps.simulation.services.authoring import world_definition

User = get_user_model()
AUTHORING = "/api/authoring/cases"
LEGACY = "/api/admin/cases"
URL = "/assets/biblioteca/escenarios/universidad/"
RECORRIDO = ["pasillo", "sala-espera", "bienestar", "consultorio"]


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def profesor(db):
    return User.objects.create_user(email="lugar_prof@x.com", password="pass1234", nombre="N", apellido="A", role="PROFESOR")


@pytest.fixture
def admin(db):
    return User.objects.create_user(email="lugar_admin@x.com", password="pass1234", nombre="N", apellido="A", role="ADMIN")


def _crear(user, salas=None, lugar="universidad", ruta=AUTHORING, **extra):
    cuerpo = {"title": "Caso desde un lugar", **extra}
    if lugar is not None:
        cuerpo["lugarId"] = lugar
    if salas is not None:
        cuerpo["salas"] = salas
    return cl(user).post(ruta, cuerpo, format="json")


@pytest.fixture
def caso(profesor):
    """Un caso creado desde la universidad con el recorrido de Bienestar."""
    response = _crear(profesor, RECORRIDO)
    assert response.status_code == 200, response.data
    return CaseVersion.objects.get(pk=response.data["data"]["caseVersionId"])


def _objetos(version, sala=None):
    consulta = MapObject.objects.filter(scene_map__case_version=version)
    if sala is not None:
        consulta = consulta.filter(scene_map__node__node_key=sala)
    return list(consulta.order_by("scene_map_id", "id"))


def _meta(objeto):
    return json.loads(objeto.metadata_json)


def _foto(version):
    """Todo lo que la copia escribió, como datos comparables (sin ids ni fechas que cambian)."""
    def filas(modelo, **filtro):
        return [
            {k: v for k, v in fila.items() if k not in {"id", "updated_at", "created_at"}}
            for fila in modelo.objects.filter(**filtro).order_by("id").values()
        ]
    return {
        "version": CaseVersion.objects.filter(pk=version.pk).values("rules").get(),
        "nodos": filas(SimulationNode, case_version=version),
        "mapas": filas(SceneMap, case_version=version),
        "objetos": filas(MapObject, scene_map__case_version=version),
        "zonas": filas(CollisionZone, scene_map__case_version=version),
        "personajes": filas(CaseCharacter, case_version=version),
        "herramientas": filas(ClinicalTool, case_version=version),
    }


# ─── una escena y un mapa por sala elegida ────────────────────────────────────────────────────
def test_crea_un_nodo_y_un_mapa_por_sala_elegida(caso):
    nodos = list(SimulationNode.objects.filter(case_version=caso).order_by("display_order"))
    assert [n.node_key for n in nodos] == RECORRIDO
    mapas = {m.node.node_key: m for m in SceneMap.objects.filter(case_version=caso).select_related("node")}
    assert set(mapas) == set(RECORRIDO)
    consultorio = lugares.cargar_lugar("universidad")["salas"]
    consultorio = next(s for s in consultorio if s["id"] == "consultorio")
    mapa = mapas["consultorio"]
    assert mapa.title == consultorio["nombre"] and nodos[-1].title == consultorio["nombre"]
    assert nodos[-1].narrative == consultorio["descripcion"]
    assert (mapa.width, mapa.height) == (960, 528)
    assert (mapa.spawn_x, mapa.spawn_y) == (consultorio["entrada"]["x"], consultorio["entrada"]["y"])
    ambiente = json.loads(mapa.ambient_json)
    assert ambiente["backgroundImage"] == URL + "arte/salas/consultorio.png"
    assert ambiente["encuadre"] == consultorio["encuadre"]


def test_cada_mapa_dice_a_que_sala_y_a_que_lugar_pertenece(caso):
    # El editor agrupa las escenas por sala: dos escenas en la misma sala son dos mapas con el mismo ``salaId``. Sin esto
    # un mapa es una sala en sí mismo y el caso no sabe de qué lugar salió (el editor no puede ofrecer su catálogo).
    mapas = SceneMap.objects.filter(case_version=caso).select_related("node")
    assert mapas.count() == len(RECORRIDO)
    for mapa in mapas:
        ambiente = json.loads(mapa.ambient_json)
        assert ambiente["salaId"] == mapa.node.node_key
        assert ambiente["lugarId"] == "universidad"
    # Y lo que ya decía el ambiente se conserva junto a la identidad.
    consultorio = json.loads(mapas.get(node__node_key="consultorio").ambient_json)
    assert set(consultorio) == {"backgroundImage", "encuadre", "salaId", "lugarId"}


def test_el_orden_de_las_salas_manda_y_la_primera_es_la_de_inicio(profesor):
    version = CaseVersion.objects.get(pk=_crear(profesor, ["consultorio", "pasillo"]).data["data"]["caseVersionId"])
    nodos = list(SimulationNode.objects.filter(case_version=version).order_by("display_order"))
    assert [n.node_key for n in nodos] == ["consultorio", "pasillo"]
    assert [n.start_node for n in nodos] == [True, False]
    assert not SimulationNode.objects.filter(case_version=version, node_key="inicio").exists()


def test_las_escenas_no_se_solapan_en_el_grafo(profesor):
    salas = [s["id"] for s in lugares.cargar_lugar("universidad")["salas"]]
    version = CaseVersion.objects.get(pk=_crear(profesor, salas).data["data"]["caseVersionId"])
    posiciones = [(n.position_x, n.position_y) for n in SimulationNode.objects.filter(case_version=version)]
    assert len(posiciones) == len(salas) == len(set(posiciones))


def test_la_respuesta_es_el_editor_del_borrador_nuevo(profesor):
    data = _crear(profesor, RECORRIDO).data["data"]
    assert data["caseVersionId"]
    assert len(data["nodes"]) == len(RECORRIDO)


def test_el_alias_heredado_tambien_crea_desde_un_lugar(admin):
    response = _crear(admin, ["pasillo"], ruta=LEGACY)
    assert response.status_code == 200, response.data
    version = CaseVersion.objects.get(pk=response.data["data"]["caseVersionId"])
    assert SimulationNode.objects.filter(case_version=version).count() == 1


# ─── sin lugar, igual que hoy ─────────────────────────────────────────────────────────────────
def test_sin_lugar_la_creacion_es_la_de_siempre(profesor):
    version = CaseVersion.objects.get(pk=_crear(profesor, lugar=None).data["data"]["caseVersionId"])
    assert [n.node_key for n in SimulationNode.objects.filter(case_version=version)] == ["inicio"]
    assert SceneMap.objects.get(case_version=version).map_key == "escena-inicial"
    assert not MapObject.objects.filter(scene_map__case_version=version).exists()
    assert version.rules == "{}"


def test_las_salas_sin_lugar_se_ignoran(profesor):
    version = CaseVersion.objects.get(pk=_crear(profesor, ["pasillo"], lugar=None).data["data"]["caseVersionId"])
    assert [n.node_key for n in SimulationNode.objects.filter(case_version=version)] == ["inicio"]


# ─── los errores del cuerpo ───────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "salas",
    [None, [], "pasillo", ["pasillo", "pasillo"], ["pasillo", "no-existe"], ["pasillo", None], [3]],
    ids=["ausente", "vacia", "no-es-lista", "repetida", "inexistente", "con-nulo", "numeros"],
)
def test_las_salas_invalidas_son_400_con_su_campo(profesor, salas):
    response = _crear(profesor, salas)
    assert response.status_code == 400, response.data
    assert response.data["code"] == "VALIDATION_ERROR"
    assert response.data["field"] == "salas"
    assert not SimulationNode.objects.filter(case_version__simulation_case__created_by=profesor).exists()


def test_una_sala_de_otro_lugar_es_400(profesor):
    """``estacion`` no existe en la universidad: la sala se busca solo en el lugar elegido."""
    comisaria = [s["id"] for s in lugares.cargar_lugar("comisaria")["salas"]]
    solo_comisaria = next(s for s in comisaria if s not in {x["id"] for x in lugares.cargar_lugar("universidad")["salas"]})
    response = _crear(profesor, [solo_comisaria])
    assert response.status_code == 400 and response.data["field"] == "salas"


def test_un_lugar_inexistente_es_404(profesor):
    response = _crear(profesor, ["pasillo"], lugar="no-existe")
    assert response.status_code == 404
    assert not SimulationNode.objects.filter(case_version__simulation_case__created_by=profesor).exists()


@pytest.mark.parametrize("lugar", ["", 7, ["universidad"]], ids=["vacio", "numero", "lista"])
def test_un_lugar_mal_formado_es_400_con_su_campo(profesor, lugar):
    response = _crear(profesor, ["pasillo"], lugar=lugar)
    assert response.status_code == 400 and response.data["field"] == "lugarId"


def test_el_titulo_sigue_siendo_obligatorio(profesor):
    response = cl(profesor).post(AUTHORING, {"title": "  ", "lugarId": "universidad", "salas": ["pasillo"]}, format="json")
    assert response.status_code == 400


# ─── las puertas ──────────────────────────────────────────────────────────────────────────────
def test_las_puertas_a_salas_no_elegidas_no_se_crean(caso):
    pasillo = {o.object_key: o for o in _objetos(caso, "pasillo") if o.object_type == "EXIT"}
    # El pasillo tiene siete puertas en la biblioteca; solo la de la sala de espera lleva a una sala elegida.
    assert set(pasillo) == {"puerta-sala-espera"}
    assert _meta(pasillo["puerta-sala-espera"])["targetNodeKey"] == "sala-espera"
    claves = {n.node_key for n in SimulationNode.objects.filter(case_version=caso)}
    for puerta in (o for o in _objetos(caso) if o.object_type == "EXIT"):
        assert _meta(puerta)["targetNodeKey"] in claves


def test_una_puerta_entre_salas_elegidas_lleva_a_la_entrada_de_la_otra(caso):
    lugar = lugares.cargar_lugar("universidad")
    puerta = next(o for o in _objetos(caso, "bienestar") if o.object_key == "puerta-consultorio")
    meta = _meta(puerta)
    consultorio = next(s for s in lugar["salas"] if s["id"] == "consultorio")
    original = next(p for s in lugar["salas"] if s["id"] == "bienestar" for p in s["puertas"] if p["id"] == "puerta-consultorio")
    assert puerta.object_type == "EXIT"
    assert meta == {
        "targetNodeKey": "consultorio", "entryX": consultorio["entrada"]["x"], "entryY": consultorio["entrada"]["y"],
        "pintada": True,  # la puerta ya está en el fondo: el juego no le pone otro dibujo encima
    }
    assert (puerta.position_x, puerta.position_y) == (original["x"], original["y"])
    assert puerta.label == original["etiqueta"] == puerta.interaction_prompt


# ─── hitos y riesgo ───────────────────────────────────────────────────────────────────────────
def test_los_hitos_y_el_riesgo_quedan_en_rules(caso):
    lugar = lugares.cargar_lugar("universidad")
    reglas = case_rules.rules_of(caso)
    assert [m.key for m in reglas.milestones] == [h["key"].replace("-", "_") for h in lugar["hitos"]]
    assert [m.label for m in reglas.milestones] == [h["label"] for h in lugar["hitos"]]
    assert [m.decisive for m in reglas.milestones] == [h["decisive"] for h in lugar["hitos"]]
    assert reglas.risk_level is not None and reglas.risk_level.value == lugar["nivelRiesgoPorDefecto"] == "MODERATE"
    assert len(reglas.milestones) == 6  # ninguno se pierde por una clave que el modelo no entienda


@pytest.mark.parametrize("lugar,riesgo", [("casa", "SEVERE"), ("comisaria", "EXTREME")])
def test_cada_lugar_trae_su_nivel_de_riesgo(profesor, lugar, riesgo):
    primera = lugares.cargar_lugar(lugar)["salas"][0]["id"]
    version = CaseVersion.objects.get(pk=_crear(profesor, [primera], lugar=lugar).data["data"]["caseVersionId"])
    assert case_rules.rules_of(version).risk_level.value == riesgo


# ─── muebles, objetos, personajes y herramientas ──────────────────────────────────────────────
def test_los_muebles_son_props_con_la_colision_y_el_tamano_del_catalogo(caso):
    lugar = lugares.cargar_lugar("universidad")
    catalogo = {m["id"]: m for m in lugar["catalogo"]["muebles"]}
    sala = next(s for s in lugar["salas"] if s["id"] == "bienestar")
    assert sala["muebles"]
    props = [o for o in _objetos(caso, "bienestar") if o.object_type == "PROP"][: len(sala["muebles"])]
    for objeto, colocado in zip(props, sala["muebles"]):
        modelo = catalogo[colocado["ref"]]
        assert objeto.object_key.startswith(colocado["ref"])
        assert objeto.label == modelo["nombre"]
        assert (objeto.position_x, objeto.position_y) == (colocado["x"], colocado["y"])
        assert (objeto.width, objeto.height) == (modelo["ancho"], modelo["alto"])
        # El choque lo lleva la zona del suelo; el objeto no bloquea (ver ``test_la_huella_bloquea_...``).
        assert objeto.collision is False
        assert _meta(objeto)["colision"] is modelo["colision"]
        assert objeto.interaction_prompt == "" and objeto.interaction_text == ""
        assert _meta(objeto)["arte"] == URL + modelo["arte"]
        assert ("espejo" in _meta(objeto)) is colocado["espejo"]


def test_las_claves_de_los_objetos_son_unicas_en_su_sala(caso):
    for sala in RECORRIDO:
        claves = [o.object_key for o in _objetos(caso, sala)]
        assert len(claves) == len(set(claves)), sala


def test_un_mueble_repetido_en_una_sala_recibe_claves_distintas(profesor):
    version = CaseVersion.objects.get(pk=_crear(profesor, ["cafeteria"]).data["data"]["caseVersionId"])
    sillas = [o.object_key for o in _objetos(version, "cafeteria") if o.object_key.startswith("silla-cafeteria")]
    assert len(sillas) > 1 and len(set(sillas)) == len(sillas)


def test_los_muebles_con_colision_dejan_su_zona_de_choque(caso):
    zonas = CollisionZone.objects.filter(scene_map__case_version=caso, zone_key__startswith="choque-")
    con_choque = [o for o in _objetos(caso) if o.object_type == "PROP" and _meta(o).get("colision") is True]
    assert zonas.count() == len(con_choque) > 0
    objeto = con_choque[0]
    zona = zonas.get(scene_map=objeto.scene_map, zone_key=f"choque-{objeto.object_key}")
    # La huella en el suelo: el punto de apoyo es el centro inferior de la caja.
    assert zona.width == objeto.width and zona.height == objeto.height
    assert zona.position_x == objeto.position_x - objeto.width // 2
    assert zona.position_y == objeto.position_y - objeto.height


def test_la_huella_bloquea_con_el_servidor_y_la_zona_fantasma_no(profesor):
    """``world_service._position_blocked`` lee la caja de un objeto con choque como esquina superior izquierda: la copia no
    debe dejar ahí una caja desplazada. Dentro de la huella (bien colocada) se bloquea; en la caja tomada como esquina, no."""
    version = CaseVersion.objects.get(pk=_crear(profesor, RECORRIDO).data["data"]["caseVersionId"])
    assert not MapObject.objects.filter(scene_map__case_version=version, collision=True).exists()
    revisados = 0
    for mueble in (o for o in _objetos(version) if o.object_type == "PROP" and _meta(o).get("colision") is True):
        zonas = list(CollisionZone.objects.filter(scene_map=mueble.scene_map))
        propia = next(z for z in zonas if z.zone_key == f"choque-{mueble.object_key}")
        estado = SimpleNamespace(scene_map_id=mueble.scene_map_id, inventory_json="[]")
        # Dentro de la huella: los pies en la base de la zona, a mitad de su ancho.
        centro = (propia.position_x + propia.width // 2, propia.position_y + propia.height)
        assert world_service._position_blocked(estado, *centro), mueble.object_key
        # En la caja fantasma (esquina superior izquierda = punto de apoyo), justo debajo de la huella.
        pies = (mueble.position_x + mueble.width // 2, mueble.position_y + world_service.PLAYER_HITBOX_HEIGHT)
        cuerpo = world_service._player_hitbox(*pies)
        dentro_de_la_caja = (
            mueble.height >= world_service.PLAYER_HITBOX_HEIGHT and cuerpo[0] >= mueble.position_x
            and cuerpo[0] + cuerpo[2] <= mueble.position_x + mueble.width
        )
        otra_zona = any(
            world_service._rectangles_intersect(*cuerpo, z.position_x, z.position_y, z.width, z.height) for z in zonas
        )
        if not dentro_de_la_caja or otra_zona:
            continue
        assert world_service._position_blocked(estado, *pies) is False, mueble.object_key
        revisados += 1
    assert revisados > 0


# ─── las paredes del encuadre (revisión final · B1) ───────────────────────────────────────────
def _zonas_de_pared(mapa):
    """Las zonas del mapa que no son la huella de un mueble: las paredes y los bordes de la sala."""
    return {
        z.zone_key: (z.position_x, z.position_y, z.width, z.height)
        for z in CollisionZone.objects.filter(scene_map=mapa) if not z.zone_key.startswith("choque-")
    }


@pytest.fixture
def universidad_entera(profesor):
    salas = [s["id"] for s in lugares.cargar_lugar("universidad")["salas"]]
    return CaseVersion.objects.get(pk=_crear(profesor, salas).data["data"]["caseVersionId"])


def test_cada_sala_copiada_lleva_las_paredes_de_su_encuadre(universidad_entera):
    """El fondo pintado dice dónde hay pared; sin una zona de choque ahí, el jugador y las personas que deambulan subirían."""
    encuadres = set()
    for mapa in SceneMap.objects.filter(case_version=universidad_entera):
        encuadre = json.loads(mapa.ambient_json)["encuadre"]
        encuadres.add(encuadre)
        esperadas = {p.clave: (p.x, p.y, p.ancho, p.alto) for p in geometria.paredes(encuadre)}
        assert _zonas_de_pared(mapa) == esperadas, mapa.map_key
    assert encuadres == {"tres-paredes", "dos-paredes-izquierda", "dos-paredes-derecha", "una-pared"}


def test_las_paredes_de_cada_encuadre_son_las_que_dice_la_tabla_compartida(caso):
    pasillo = SceneMap.objects.get(case_version=caso, map_key="sala-pasillo")  # una pared: fondo y bordes abiertos
    assert set(_zonas_de_pared(pasillo)) == {"pared-fondo", "borde-izquierdo", "borde-derecho", "borde-delantero"}
    bienestar = SceneMap.objects.get(case_version=caso, map_key="sala-bienestar")  # tres paredes
    assert set(_zonas_de_pared(bienestar)) == {"pared-fondo", "pared-izquierda", "pared-derecha", "borde-delantero"}
    assert _zonas_de_pared(bienestar)["pared-fondo"] == (0, 0, 960, 236)


def test_el_servidor_rechaza_la_pared_y_acepta_el_piso(universidad_entera):
    """Con el hitbox de pies del jugador (22 × 16): rechaza lo que pisa la pared y acepta lo que cae en el piso, al píxel."""
    CollisionZone.objects.filter(scene_map__case_version=universidad_entera, zone_key__startswith="choque-").delete()
    for mapa in SceneMap.objects.filter(case_version=universidad_entera):
        zx, zy, zancho, zalto = geometria.zona_caminable(json.loads(mapa.ambient_json)["encuadre"])
        estado = SimpleNamespace(scene_map_id=mapa.id, inventory_json="[]")
        bloqueado = lambda x, y: world_service._position_blocked(estado, x, y)  # noqa: E731
        medio_x, medio_y = zx + zancho // 2, zy + zalto // 2
        assert not bloqueado(medio_x, medio_y), mapa.map_key
        # Fondo: el hitbox sube 16 px desde los pies, así que los pies a menos de 16 px de la pared la pisan.
        assert bloqueado(medio_x, zy + 15) and not bloqueado(medio_x, zy + 16), mapa.map_key
        # Borde delantero: los pies no pasan del final del piso.
        assert not bloqueado(medio_x, zy + zalto) and bloqueado(medio_x, zy + zalto + 1), mapa.map_key
        # Laterales (pared o borde abierto): el hitbox mide 11 px a cada lado de los pies.
        assert bloqueado(zx + 10, medio_y) and not bloqueado(zx + 11, medio_y), mapa.map_key
        assert bloqueado(zx + zancho - 10, medio_y) and not bloqueado(zx + zancho - 11, medio_y), mapa.map_key


def test_la_entrada_y_las_personas_de_cada_sala_no_caen_en_la_pared(universidad_entera):
    """Quien aparece o está de pie en una sala copiada nunca queda dentro de la pared que acabamos de levantar."""
    CollisionZone.objects.filter(scene_map__case_version=universidad_entera, zone_key__startswith="choque-").delete()
    for mapa in SceneMap.objects.filter(case_version=universidad_entera):
        estado = SimpleNamespace(scene_map_id=mapa.id, inventory_json="[]")
        assert not world_service._position_blocked(estado, mapa.spawn_x, mapa.spawn_y), f"entrada de {mapa.map_key}"
        for persona in MapObject.objects.filter(scene_map=mapa, object_type="PERSON"):
            assert not world_service._position_blocked(estado, persona.position_x, persona.position_y), persona.object_key


# ─── el punto de apoyo y la puerta pintada (revisión final · B2 y B3) ─────────────────────────
def test_lo_que_se_apoya_en_el_suelo_lo_dice_en_su_metadata(caso):
    """El editor dibuja con la base en (x, y); ``apoyo: "pies"`` le dice lo mismo al juego (los casos viejos no lo traen)."""
    tipos = set()
    for objeto in _objetos(caso):
        if objeto.object_type == "EXIT":
            continue
        tipos.add(objeto.object_type)
        assert _meta(objeto)["apoyo"] == "pies", objeto.object_key
    assert {"PROP", "PERSON"} <= tipos


def test_las_puertas_copiadas_dicen_que_ya_estan_pintadas_en_el_fondo(caso):
    puertas = [o for o in _objetos(caso) if o.object_type == "EXIT"]
    assert puertas
    for puerta in puertas:
        assert _meta(puerta)["pintada"] is True, puerta.object_key
    # Y solo ellas: nada más lleva la marca.
    assert not any("pintada" in _meta(o) for o in _objetos(caso) if o.object_type != "EXIT")


def test_los_objetos_llevan_su_tipo_su_texto_y_su_animacion(caso):
    lugar = lugares.cargar_lugar("universidad")
    catalogo = {o["id"]: o for o in lugar["catalogo"]["objetos"]}
    folleto = catalogo["folleto-rutas"]
    en_sala = next(o for o in _objetos(caso, "sala-espera") if o.object_key == "folleto-rutas")
    assert en_sala.object_type == folleto["tipo"] == "RESOURCE"
    assert en_sala.label == folleto["nombre"]
    assert en_sala.interaction_text == folleto["alRevisar"]
    assert en_sala.interaction_prompt == folleto["textoInteraccion"] == "Revisar"
    meta = _meta(en_sala)
    assert meta["arte"] == URL + folleto["arte"]
    assert meta["animacionCerca"] == {"hoja": URL + folleto["animacionCerca"]["hoja"], "cuadros": 3, "fps": 6}
    assert en_sala.collision is False


def test_cada_sala_trae_exactamente_lo_que_la_biblioteca_pone_en_ella(caso):
    lugar = lugares.cargar_lugar("universidad")
    for sala in (s for s in lugar["salas"] if s["id"] in RECORRIDO):
        esperadas = [m["ref"] for m in sala["muebles"]] + [o["ref"] for o in sala["objetos"]]
        esperadas += [p["ref"] for p in sala["personajes"]]
        esperadas += [p["id"] for p in sala["puertas"] if p["hacia"] in RECORRIDO]
        hechas = [re.sub(r"-\d+$", "", o.object_key) for o in _objetos(caso, sala["id"])]
        assert sorted(hechas) == sorted(esperadas), sala["id"]


def test_los_personajes_son_personas_enlazadas_a_un_personaje_del_caso(caso):
    lugar = lugares.cargar_lugar("universidad")
    nombres = {p["id"]: p for p in lugar["personajes"]}
    assert any(s["personajes"] for s in lugar["salas"] if s["id"] in RECORRIDO)
    for sala in (s for s in lugar["salas"] if s["id"] in RECORRIDO):
        personas = [o for o in _objetos(caso, sala["id"]) if o.object_type == "PERSON"]
        assert len(personas) == len(sala["personajes"])
        for persona, original in zip(personas, sala["personajes"]):
            info = nombres[original["ref"]]
            assert persona.label == info["nombre"]
            assert persona.character.character_key == original["ref"]
            meta = _meta(persona)
            assert meta["recipeId"] == info["recipeId"]
            assert meta["movimiento"] == "quieto"
            assert meta["expresion"] == original["expresion"]
            assert "personaClave" not in meta  # solo la marca el docente
            assert persona.facing == {"izquierda": "left", "derecha": "right"}[original["mirando"]]
            assert (persona.position_x, persona.position_y) == (original["x"], original["y"])
            assert persona.interaction_prompt == "Hablar"


def test_un_personaje_en_varias_salas_es_un_solo_personaje_del_caso(profesor):
    version = CaseVersion.objects.get(pk=_crear(profesor, ["aula", "oficina-docente"]).data["data"]["caseVersionId"])
    docentes = [o for o in _objetos(version) if o.object_type == "PERSON" and o.character.character_key == "docente"]
    assert len(docentes) == 2
    assert len({d.character_id for d in docentes}) == 1
    assert CaseCharacter.objects.filter(case_version=version, character_key="docente").count() == 1


def test_solo_hay_personajes_de_las_salas_elegidas(caso):
    claves = set(CaseCharacter.objects.filter(case_version=caso).values_list("character_key", flat=True))
    lugar = lugares.cargar_lugar("universidad")
    esperados = {p["ref"] for s in lugar["salas"] if s["id"] in RECORRIDO for p in s["personajes"]}
    assert claves == esperados
    ejemplo = CaseCharacter.objects.get(case_version=caso, character_key="psicologa-bienestar")
    assert ejemplo.display_name == "Psicóloga de Bienestar" and ejemplo.role_label == "Profesional"


def test_las_herramientas_del_lugar_pasan_al_caso(caso):
    lugar = lugares.cargar_lugar("universidad")
    herramientas = {h.tool_code: h for h in ClinicalTool.objects.filter(case_version=caso)}
    assert set(herramientas) == {h["id"] for h in lugar["catalogo"]["herramientas"]}
    ficha = herramientas["ficha-riesgo"]
    assert ficha.label == "Ficha de riesgo" and ficha.active is True and ficha.description


def test_las_claves_de_nodo_y_mapa_son_legibles_y_unicas(caso):
    claves = list(SceneMap.objects.filter(case_version=caso).values_list("map_key", flat=True))
    assert sorted(claves) == sorted(f"sala-{s}" for s in RECORRIDO)


# ─── el mundo copiado pasa la validación del mundo ────────────────────────────────────────────
@pytest.mark.parametrize("lugar", ["universidad", "casa", "comisaria"])
def test_un_lugar_entero_copiado_no_trae_errores_de_geometria_ni_de_puertas(profesor, lugar):
    """Lo que falte (fin del caso, opciones de decisión) lo escribe la docente; la copia no debe sembrar errores de mundo."""
    salas = [s["id"] for s in lugares.cargar_lugar(lugar)["salas"]]
    version = CaseVersion.objects.get(pk=_crear(profesor, salas, lugar=lugar).data["data"]["caseVersionId"])
    codigos = {e["code"] for e in world_definition.run_world_validation(version)["errors"]}
    assert codigos <= {"NO_TERMINAL_NODE", "NODE_WITHOUT_OPTIONS"}, codigos


# ─── el resumen ───────────────────────────────────────────────────────────────────────────────
def test_copiar_al_caso_devuelve_el_resumen(caso, profesor):
    # Se vuelve a copiar sobre otro borrador vacío para ver el resumen.
    otro = CaseVersion.objects.get(pk=cl(profesor).post(AUTHORING, {"title": "Vacío"}, format="json").data["data"]["caseVersionId"])
    lugar = lugares.cargar_lugar("universidad")
    resumen = copiar_al_caso.copiar_al_caso(otro, lugar, ["pasillo", "sala-espera"])
    assert resumen.lugar_id == "universidad"
    assert resumen.salas == ("pasillo", "sala-espera")
    assert resumen.nodos == resumen.mapas == 2
    assert resumen.personajes == len([o for o in _objetos(otro) if o.object_type == "PERSON"])
    assert resumen.puertas == len([o for o in _objetos(otro) if o.object_type == "EXIT"]) == 2
    assert resumen.hitos == 6 and resumen.herramientas == 4


# ─── copia por valor ──────────────────────────────────────────────────────────────────────────
def _mutar(valor):
    """Cambia en su sitio TODO lo que cuelga del diccionario: textos, números, banderas y listas."""
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            if isinstance(hijo, str):
                valor[clave] = hijo + " (mutado)"
            elif isinstance(hijo, bool):
                valor[clave] = not hijo
            elif isinstance(hijo, int):
                valor[clave] = hijo + 1000
            else:
                _mutar(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            _mutar(hijo)
        if valor and isinstance(valor[0], str):
            valor.append("agregado")


def _sin_ids(foto):
    """La foto de un caso sin los ids de las filas (dos casos distintos tienen ids distintos)."""
    return json.loads(json.dumps(foto, default=str), object_hook=lambda d: {k: v for k, v in d.items() if not k.endswith("_id")})


def _borrador_vacio(profesor, titulo):
    respuesta = cl(profesor).post(AUTHORING, {"title": titulo}, format="json")
    return CaseVersion.objects.get(pk=respuesta.data["data"]["caseVersionId"])


def _lo_que_dice_la_biblioteca(version, original):
    """Comprueba el caso releído de la base contra los valores ORIGINALES de la biblioteca (una copia profunda tomada antes)."""
    reglas = case_rules.rules_of(version)
    assert [(m.label, m.description) for m in reglas.milestones] == [(h["label"], h["description"]) for h in original["hitos"]]
    assert reglas.risk_level.value == original["nivelRiesgoPorDefecto"]
    salas = {s["id"]: s for s in original["salas"]}
    nodos = SimulationNode.objects.filter(case_version=version).exclude(node_key="inicio")  # el borrador vacío trae el suyo
    assert nodos.count() == len(RECORRIDO)
    for nodo in nodos:
        assert nodo.title == salas[nodo.node_key]["nombre"] and nodo.narrative == salas[nodo.node_key]["descripcion"]
    muebles = {m["id"]: m for m in original["catalogo"]["muebles"]}
    objetos = {o["id"]: o for o in original["catalogo"]["objetos"]}
    visto = {"mueble": 0, "objeto": 0}
    for objeto in MapObject.objects.filter(scene_map__case_version=version):
        base = re.sub(r"-\d+$", "", objeto.object_key)
        if objeto.object_type == "PROP" and base in muebles:
            visto["mueble"] += 1
            assert (objeto.width, objeto.height, objeto.label) == (muebles[base]["ancho"], muebles[base]["alto"], muebles[base]["nombre"])
            assert _meta(objeto)["colision"] is muebles[base]["colision"]
        elif objeto.object_type != "PERSON" and base in objetos:
            visto["objeto"] += 1
            assert objeto.interaction_text == objetos[base]["alRevisar"] and objeto.label == objetos[base]["nombre"]
            animacion = objetos[base]["animacionCerca"]
            assert _meta(objeto)["animacionCerca"] == {
                "hoja": URL + animacion["hoja"], "cuadros": animacion["cuadros"], "fps": animacion["fps"]
            }
    assert visto["mueble"] and visto["objeto"]
    for personaje in CaseCharacter.objects.filter(case_version=version):
        esperado = next(p for p in original["personajes"] if p["id"] == personaje.character_key)
        assert (personaje.display_name, personaje.role_label) == (esperado["nombre"], esperado["rol"])


def test_editar_la_biblioteca_despues_de_copiar_no_toca_el_caso(profesor):
    """Review Focus 1. Se guarda una copia profunda del lugar, se copia, se muta el diccionario en su sitio (catálogo,
    ``animacionCerca``, hitos, salas, personajes…) y el caso releído de la base y el editor deben seguir diciendo lo ORIGINAL."""
    lugar = lugares.cargar_lugar("universidad")
    original = copy.deepcopy(lugar)
    version = _borrador_vacio(profesor, "Copia por valor")
    copiar_al_caso.copiar_al_caso(version, lugar, RECORRIDO)
    editor_antes = cl(profesor).get(f"{AUTHORING}/{version.pk}/editor").data["data"]
    _lo_que_dice_la_biblioteca(version, original)

    _mutar(lugar)

    assert lugar != original  # la mutación sí ocurrió
    _lo_que_dice_la_biblioteca(CaseVersion.objects.get(pk=version.pk), original)
    assert cl(profesor).get(f"{AUTHORING}/{version.pk}/editor").data["data"] == editor_antes


def test_mutar_el_lugar_mientras_se_copia_no_cambia_lo_copiado(profesor, monkeypatch):
    """Discrimina la copia por referencia: cada vez que la copia pide una URL de arte, el lugar se muta en su sitio. Una copia
    que lee del diccionario de quien llama sin tomar el suyo escribiría los valores ya mutados en las salas siguientes."""
    lugar = lugares.cargar_lugar("universidad")
    de_referencia = _borrador_vacio(profesor, "Referencia")
    copiar_al_caso.copiar_al_caso(de_referencia, copy.deepcopy(lugar), RECORRIDO)

    llamadas = []
    url_real = copiar_al_caso.url_de_arte

    def url_y_muta(lugar_id, ruta):
        llamadas.append(ruta)
        _mutar(lugar)
        return url_real(lugar_id, ruta)

    monkeypatch.setattr(copiar_al_caso, "url_de_arte", url_y_muta)
    mutada = _borrador_vacio(profesor, "Referencia")
    copiar_al_caso.copiar_al_caso(mutada, lugar, RECORRIDO)

    assert llamadas  # el gancho corrió
    assert _sin_ids(_foto(mutada)) == _sin_ids(_foto(de_referencia))


def test_cambiar_los_archivos_de_la_biblioteca_no_toca_un_caso_creado(profesor, tmp_path, settings):
    copia = tmp_path / "biblioteca"
    shutil.copytree(Path(settings.BIBLIOTECA_DIR) / "escenarios", copia / "escenarios",
                    ignore=shutil.ignore_patterns("arte", "fuentes", "*.png"))
    settings.BIBLIOTECA_DIR = copia
    version = CaseVersion.objects.get(pk=_crear(profesor, RECORRIDO).data["data"]["caseVersionId"])
    antes = _foto(version)

    archivo = copia / "escenarios" / "universidad" / "escenario.json"
    escenario = json.loads(archivo.read_text(encoding="utf-8"))
    escenario["hitos"][0]["label"] = "Otro nombre"
    escenario["nivelRiesgoPorDefecto"] = "EXTREME"
    escenario["catalogo"]["objetos"][0]["alRevisar"] = "Otro texto"
    escenario["catalogo"]["muebles"][0]["ancho"] = 999
    for sala in escenario["salas"]:
        sala["nombre"] = "Sala cambiada"
        for mueble in sala["muebles"]:
            mueble["x"] += 50
    archivo.write_text(json.dumps(escenario, ensure_ascii=False), encoding="utf-8")

    assert _foto(version) == antes
    # y un caso nuevo sí ve lo nuevo
    nueva = CaseVersion.objects.get(pk=_crear(profesor, RECORRIDO).data["data"]["caseVersionId"])
    assert case_rules.rules_of(nueva).risk_level.value == "EXTREME"
    assert case_rules.rules_of(nueva).milestones[0].label == "Otro nombre"
