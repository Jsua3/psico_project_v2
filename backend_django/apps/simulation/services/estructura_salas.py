"""Lo que el servidor deduce de una sala armada por piezas (contrato x-siep 2.2, secciones 1.5, 1.6 y 3).

Un mapa con ``structure`` no guarda a mano ni su ancho, ni sus paredes, ni dónde están sus puertas: todo sale de la
estructura con la geometría de ``apps.simulation.casedef.geometria``. ``recalcular_salas`` lo fija tras copiar una sala
de la biblioteca, importar un documento 2.2 o guardar el mapa en el editor, y lo que el cliente haya mandado en esos
campos se reemplaza:

- ``width = estructura.ancho`` y ``height = 528``;
- las zonas ``pared-*`` y ``borde-*`` son las de ``paredes(encuadre, ancho)`` (las ``choque-*`` de los muebles no se tocan);
- cada ``EXIT`` con ``metadata.muro`` y ``metadata.pos`` va al umbral (``llegada`` de su propia puerta) y su
  ``entryX/entryY`` es la llegada de la puerta par en el mapa de destino, o la aparición de ese mapa si no hay par.

La lógica de recorrido del servidor (``enter_room``) no cambia: sigue leyendo ``targetNodeKey`` y ``entryX/entryY``.
"""
import json
from collections import defaultdict

from apps.simulation.casedef import geometria
from apps.simulation.models import CollisionZone, MapObject, SceneMap
from shared.jsonutils import read_map

#: Las zonas que levanta la geometría (y que el recálculo reemplaza); las demás son de la autora o de los muebles.
CLAVES_DE_PARED = frozenset({
    "pared-fondo", "pared-izquierda", "pared-derecha", "borde-izquierdo", "borde-derecho", "borde-delantero",
})
ENCUADRE_POR_OMISION = "tres-paredes"


def geometria_de(scene_map):
    """``(encuadre, ancho)`` de un mapa armado por piezas, o ``None`` si no tiene una estructura con ancho del catálogo."""
    estructura = scene_map.structure
    if not isinstance(estructura, dict):
        return None
    ancho = estructura.get("ancho")
    if isinstance(ancho, bool) or ancho not in geometria.ANCHOS:
        return None
    encuadre = read_map(scene_map.ambient_json).get("encuadre")
    return (encuadre if encuadre in geometria.LATERALES else ENCUADRE_POR_OMISION), ancho


def sala_de(scene_map):
    """La sala a la que pertenece el mapa: ``ambient.salaId``, o la clave de su escena si no lo trae."""
    sala = read_map(scene_map.ambient_json).get("salaId")
    return sala if isinstance(sala, str) and sala else scene_map.node.node_key


def muro_y_pos(metadata):
    """``(muro, pos)`` de una puerta puesta en un muro, o ``None`` si es una puerta de imagen fija (o mal formada)."""
    muro, pos = metadata.get("muro"), metadata.get("pos")
    if muro not in geometria.MUROS or isinstance(pos, bool) or not isinstance(pos, int):
        return None
    return muro, pos


def puerta_par(metadata, escena_origen, puertas_destino, sala_de_escena):
    """La puerta de regreso en el destino (contrato 3.3): la que nombra ``par`` o, sin él, la primera que vuelve a la
    escena de origen o a otra escena de su misma sala. ``puertas_destino`` es una lista de ``(objeto, metadata)``."""
    par = metadata.get("par")
    if isinstance(par, str):
        return next(((obj, meta) for obj, meta in puertas_destino if obj.object_key == par), None)
    sala_origen = sala_de_escena.get(escena_origen)
    for obj, meta in puertas_destino:
        objetivo = meta.get("targetNodeKey")
        if objetivo == escena_origen or (sala_origen is not None and sala_de_escena.get(objetivo) == sala_origen):
            return obj, meta
    return None


def _llegada_al_destino(metadata, escena_origen, destino, puertas, sala_de_escena):
    """Dónde aparece quien cruza: la llegada de la puerta par, o la aparición del destino."""
    forma = geometria_de(destino)
    par = puerta_par(metadata, escena_origen, puertas[destino.id], sala_de_escena) if forma else None
    lugar = muro_y_pos(par[1]) if par else None
    if forma and lugar:
        return geometria.llegada(*lugar, *forma)
    return destino.spawn_x, destino.spawn_y


def _poner_paredes(scene_map, encuadre, ancho):
    actuales = {
        (z.zone_key, z.label, z.position_x, z.position_y, z.width, z.height)
        for z in CollisionZone.objects.filter(scene_map=scene_map, zone_key__in=CLAVES_DE_PARED)
    }
    nuevas = geometria.paredes(encuadre, ancho)
    if actuales == {(p.clave, p.etiqueta, p.x, p.y, p.ancho, p.alto) for p in nuevas}:
        return
    CollisionZone.objects.filter(scene_map=scene_map, zone_key__in=CLAVES_DE_PARED).delete()
    CollisionZone.objects.bulk_create([
        CollisionZone(
            scene_map=scene_map, zone_key=p.clave, label=p.etiqueta,
            position_x=p.x, position_y=p.y, width=p.ancho, height=p.alto,
        )
        for p in nuevas
    ])


def recalcular_salas(case_version):
    """Fija ancho, paredes, umbral y llegada de las puertas en cada mapa de la versión armado por piezas.

    Devuelve cuántos mapas tienen estructura. Es idempotente: lo que ya está bien no se vuelve a escribir.
    """
    mapas = list(SceneMap.objects.filter(case_version=case_version).select_related("node").order_by("id"))
    con_forma = [(m, geometria_de(m)) for m in mapas]
    con_forma = [(m, forma) for m, forma in con_forma if forma]
    if not con_forma:
        return 0
    por_escena = {m.node.node_key: m for m in mapas}
    sala_de_escena = {m.node.node_key: sala_de(m) for m in mapas}
    puertas = defaultdict(list)
    for obj in MapObject.objects.filter(scene_map__case_version=case_version, object_type="EXIT").order_by("id"):
        puertas[obj.scene_map_id].append((obj, read_map(obj.metadata_json)))

    for scene_map, (encuadre, ancho) in con_forma:
        if (scene_map.width, scene_map.height) != (ancho, geometria.ALTO_SALA):
            scene_map.width, scene_map.height = ancho, geometria.ALTO_SALA
            scene_map.save(update_fields=["width", "height", "updated_at"])
        _poner_paredes(scene_map, encuadre, ancho)
        for obj, meta in puertas[scene_map.id]:
            lugar = muro_y_pos(meta)
            if lugar is None:
                continue
            x, y = geometria.llegada(*lugar, encuadre, ancho)
            nueva = dict(meta)
            destino = por_escena.get(meta.get("targetNodeKey"))
            if destino is not None:
                nueva["entryX"], nueva["entryY"] = _llegada_al_destino(
                    meta, scene_map.node.node_key, destino, puertas, sala_de_escena,
                )
            if (obj.position_x, obj.position_y) == (x, y) and nueva == meta:
                continue
            obj.position_x, obj.position_y = x, y
            obj.metadata_json = json.dumps(nueva, ensure_ascii=False)
            obj.save(update_fields=["position_x", "position_y", "metadata_json"])
    return len(con_forma)
