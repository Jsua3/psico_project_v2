"""El plano del lugar que recibe el estudiante: ``layout`` (contrato x-siep 2.2, secciones 5.2 y 5.3).

Los nodos son las salas (``ambient.salaId``, o la escena si no lo trae) y las uniones, sus puertas. La posición de cada
sala se deduce del muro de la puerta que lleva a ella (derecha → a la derecha, fondo → arriba…) recorriendo a lo ancho
desde la sala de arranque; ``ambient.plano`` la fija a mano. El plano **no lleva objetos ni personajes** (VD-19): solo
salas y puertas, que el estudiante ya ve al recorrer.

``plano_de_version`` no depende del intento (es el mismo para todo estudiante y se guarda en caché si la versión está
publicada); ``layout_para`` lo recorta al lugar de la sala actual y marca la actual y las visitadas.
"""
from collections import deque
from dataclasses import dataclass, field

from apps.simulation.casedef import geometria
from apps.simulation.models import AttemptEvent, MapObject, SceneMap
from shared.jsonutils import read_map

SEPARACION = 96
FILA = geometria.ALTO_SALA + SEPARACION
PASO, MAX_PASOS, MAX_FILAS = 8, 400, 12
ROOM_ENTERED_PREFIJO = "Puerta hacia sala "
OPUESTO = {"derecha": "izquierda", "izquierda": "derecha", "fondo": "camara", "camara": "fondo"}


@dataclass
class _Sala:
    clave: str
    titulo: str
    ancho: int
    encuadre: str
    lugar: object
    orden: tuple
    manual: tuple | None
    puertas: list = field(default_factory=list)  # (clave, sala destino, muro, pos)

    @property
    def xl(self):
        return geometria.limites(self.encuadre, _ancho_geo(self.ancho))[0]


def _ancho_geo(ancho):
    return ancho if ancho in geometria.ANCHOS else geometria.ANCHO_SALA


def _sala_de(scene_map, ambiente):
    sala = ambiente.get("salaId")
    return sala if isinstance(sala, str) and sala else scene_map.node.node_key


def _entero(valor):
    return isinstance(valor, int) and not isinstance(valor, bool)


def muro_de_puerta(meta, x, y, encuadre, ancho):
    """``(muro, pos)`` de una puerta: los suyos si está en un muro; si no (imagen fija), deducidos de su umbral."""
    ancho = _ancho_geo(ancho)
    if meta.get("muro") in geometria.MUROS and _entero(meta.get("pos")):
        return meta["muro"], meta["pos"]
    x0, _, w, _ = geometria.zona_caminable(encuadre, ancho)
    if y >= 470:
        muro = "camara"
    elif x <= x0 + 24:
        muro = "izquierda"
    elif x >= x0 + w - 24:
        muro = "derecha"
    else:
        muro = "fondo"
    xl, _ = geometria.limites(encuadre, ancho)
    pos = x - xl if muro in ("fondo", "camara") else y - geometria.PISO
    return muro, min(max(pos, 0), geometria.largo_muro(muro, encuadre, ancho))


def _salas_de_version(case_version_id):
    """Las salas de la versión (con su representante) y a qué sala pertenece cada escena."""
    mapas = list(
        SceneMap.objects.filter(case_version_id=case_version_id).select_related("node")
        .order_by("node__display_order", "node__id", "id")
    )
    salas, sala_de_escena, representantes = {}, {}, {}
    inicial = None
    for mapa in mapas:
        ambiente = read_map(mapa.ambient_json)
        clave = _sala_de(mapa, ambiente)
        sala_de_escena[mapa.node.node_key] = clave
        sala_de_escena[mapa.node_id] = clave  # también por id de nodo: así el intento no tiene que leer su escena
        if mapa.node.start_node and inicial is None:
            inicial = clave
        if clave in salas:
            continue
        estructura = mapa.structure if isinstance(mapa.structure, dict) else {}
        encuadre = ambiente.get("encuadre") if ambiente.get("encuadre") in geometria.LATERALES else "tres-paredes"
        plano = ambiente.get("plano")
        manual = (plano["x"], plano["y"]) if isinstance(plano, dict) and _entero(plano.get("x")) and _entero(plano.get("y")) else None
        lugar = ambiente.get("lugarId") if isinstance(ambiente.get("lugarId"), str) else None
        ancho = estructura.get("ancho") if estructura.get("ancho") in geometria.ANCHOS else (mapa.width or geometria.ANCHO_SALA)
        salas[clave] = _Sala(clave, mapa.title or mapa.node.title, ancho, encuadre, lugar, (mapa.node.display_order, mapa.node.id), manual)
        representantes[mapa.id] = salas[clave]
    for obj in MapObject.objects.filter(scene_map_id__in=list(representantes), object_type="EXIT", visible=True).order_by("id"):
        sala = representantes[obj.scene_map_id]
        meta = read_map(obj.metadata_json)
        destino = sala_de_escena.get(meta.get("targetNodeKey"))
        if destino is None or destino == sala.clave:
            continue
        muro, pos = muro_de_puerta(meta, obj.position_x, obj.position_y, sala.encuadre, sala.ancho)
        sala.puertas.append((obj.object_key, destino, muro, pos))
    return salas, sala_de_escena, inicial


def _componentes(salas):
    """Grupos de salas unidas por puertas (en cualquier sentido) entre salas del mismo lugar."""
    vecinos = {clave: set() for clave in salas}
    for sala in salas.values():
        for _, destino, _, _ in sala.puertas:
            if destino in salas and salas[destino].lugar == sala.lugar:
                vecinos[sala.clave].add(destino)
                vecinos[destino].add(sala.clave)
    grupo, n = {}, 0
    for clave in salas:
        if clave in grupo:
            continue
        pendientes = [clave]
        grupo[clave] = n
        while pendientes:
            actual = pendientes.pop()
            for otra in vecinos[actual]:
                if otra not in grupo:
                    grupo[otra] = n
                    pendientes.append(otra)
        n += 1
    return grupo


def _choca(rect, puestos):
    x, y, w = rect
    return any(
        x < ox + ow + SEPARACION and ox < x + w + SEPARACION
        and y < oy + geometria.ALTO_SALA + SEPARACION and oy < y + geometria.ALTO_SALA + SEPARACION
        for ox, oy, ow in puestos
    )


def _candidato(a, pos_a, b, muro, pos):
    """Dónde va la sala ``b`` si la puerta de ``a`` en ``(muro, pos)`` lleva a ella (contrato 5.3, paso 3)."""
    ax, ay = pos_a
    if muro == "derecha":
        return ax + a.ancho + SEPARACION, ay
    if muro == "izquierda":
        return ax - SEPARACION - b.ancho, ay
    x = PASO * ((ax + a.xl + pos - b.ancho // 2) // PASO)
    return x, (ay - FILA if muro == "fondo" else ay + FILA)


def _candidato_inverso(a, pos_a, b, muro_de_b, pos_de_b):
    """Dónde va ``b`` si solo ``b`` tiene puerta hacia ``a``: ``a`` está del lado de ese muro de ``b``."""
    ax, ay = pos_a
    if muro_de_b == "derecha":  # a está a la derecha de b
        return ax - SEPARACION - b.ancho, ay
    if muro_de_b == "izquierda":
        return ax + a.ancho + SEPARACION, ay
    x = PASO * ((ax + a.ancho // 2 - b.xl - pos_de_b) // PASO)
    return x, (ay + FILA if muro_de_b == "fondo" else ay - FILA)


def _ubicar(b, rect, muro, puestos):
    """Corre el rectángulo a lo largo del muro (±8k) y, si no cabe, lo aleja una fila (contrato 5.3, paso 4)."""
    x, y = rect
    for _ in range(MAX_FILAS):
        if not _choca((x, y, b.ancho), puestos):
            return x, y
        for k in range(1, MAX_PASOS + 1):
            for signo in (1, -1):
                if muro in ("fondo", "camara"):
                    prueba = (x + signo * PASO * k, y)
                else:
                    prueba = (x, y + signo * PASO * k)
                if not _choca((*prueba, b.ancho), puestos):
                    return prueba
        if muro == "fondo":
            y -= FILA
        elif muro == "camara":
            y += FILA
        elif muro == "derecha":
            x += b.ancho + SEPARACION
        else:
            x -= b.ancho + SEPARACION
    return None


def _colocar(salas, miembros, inicial):
    """Posición en el plano de cada sala de un grupo."""
    posicion = {c: salas[c].manual for c in miembros if salas[c].manual is not None}
    puestos = [(x, y, salas[c].ancho) for c, (x, y) in posicion.items()]
    arranque = inicial if inicial in miembros else min(miembros, key=lambda c: salas[c].orden)
    if arranque not in posicion:
        posicion[arranque] = (0, 0)
        puestos.append((0, 0, salas[arranque].ancho))
    entrantes = {c: [] for c in miembros}
    for c in miembros:
        for _, destino, muro, pos in salas[c].puertas:
            if destino in entrantes:
                entrantes[destino].append((c, muro, pos))
    cola, vistos = deque([arranque]), {arranque}
    while cola:
        a = salas[cola.popleft()]
        siguientes = [(d, muro, pos, False) for _, d, muro, pos in a.puertas if d in miembros]
        siguientes += [(origen, muro, pos, True) for origen, muro, pos in entrantes[a.clave]]
        for destino, muro, pos, inverso in siguientes:
            if destino not in vistos:
                vistos.add(destino)
                cola.append(destino)
            if destino in posicion:
                continue
            b = salas[destino]
            rect = (_candidato_inverso if inverso else _candidato)(a, posicion[a.clave], b, muro, pos)
            lugar = _ubicar(b, rect, OPUESTO[muro] if inverso else muro, puestos)
            if lugar is None:
                # Sin sitio tras MAX_FILAS filas: va a la derecha de todo ya (paso 5), porque ya está en la cola y su turno
                # necesita una posición (revisión de Codex, hallazgo 6).
                lugar = (max((x + w for x, _, w in puestos), default=0) + SEPARACION, 0)
            posicion[destino] = lugar
            puestos.append((*lugar, b.ancho))
    # Paso 5: lo que quedó sin sitio va en fila a la derecha de todo.
    derecha = max((x + w for x, _, w in puestos), default=0) + SEPARACION
    for c in sorted(miembros, key=lambda c: salas[c].orden):
        if c not in posicion:
            posicion[c] = (derecha, 0)
            derecha += salas[c].ancho + SEPARACION
    return posicion


def plano_de_version(case_version_id):
    """El plano de toda la versión: salas (con grupo y posición), puertas y a qué sala pertenece cada escena."""
    salas, sala_de_escena, inicial = _salas_de_version(case_version_id)
    grupo = _componentes(salas)
    miembros = {}
    for clave, n in grupo.items():
        miembros.setdefault(n, set()).add(clave)
    posicion = {}
    for conjunto in miembros.values():
        posicion.update(_colocar(salas, conjunto, inicial))
    orden = sorted(salas.values(), key=lambda s: s.orden)
    return {
        "rooms": [
            {"key": s.clave, "title": s.titulo, "width": s.ancho, "frame": s.encuadre,
             "plan": {"x": posicion[s.clave][0], "y": posicion[s.clave][1]}, "group": grupo[s.clave]}
            for s in orden
        ],
        "doors": [
            {"key": clave, "from": s.clave, "to": destino, "wall": muro, "pos": pos}
            for s in orden for clave, destino, muro, pos in s.puertas
        ],
        "sceneRooms": sala_de_escena,
        "startRoom": inicial,
    }


def _plano_en_cache(case_version):
    from shared import cache as shared_cache

    clave = shared_cache.static_world_key(f"plano-{case_version.id}", case_version)
    if clave is None:
        return plano_de_version(case_version.id)
    return shared_cache.get_or_set(clave, lambda: plano_de_version(case_version.id))


def salas_visitadas(plano, eventos, escena_actual):
    """Las salas de la escena inicial, de cada escena con un evento del intento, de cada puerta cruzada y la actual."""
    sala_de = plano["sceneRooms"]
    visitadas = {plano["startRoom"], sala_de.get(escena_actual)}
    for evento_tipo, nodo, detalle in eventos:
        visitadas.add(sala_de.get(nodo))
        if evento_tipo == "ROOM_ENTERED" and isinstance(detalle, str) and detalle.startswith(ROOM_ENTERED_PREFIJO):
            visitadas.add(sala_de.get(detalle[len(ROOM_ENTERED_PREFIJO):]))
    visitadas.discard(None)
    return visitadas


def recortar(plano, escena_actual, visitadas):
    """El ``layout`` del estudiante: solo el grupo de la sala actual, con la actual y las visitadas marcadas."""
    actual = plano["sceneRooms"].get(escena_actual)
    grupo = next((r["group"] for r in plano["rooms"] if r["key"] == actual), None)
    salas = [r for r in plano["rooms"] if r["group"] == grupo]
    claves = {r["key"] for r in salas}
    return {
        "currentRoom": actual,
        "rooms": [
            {"key": r["key"], "title": r["title"], "width": r["width"], "frame": r["frame"], "plan": dict(r["plan"]),
             "visited": r["key"] in visitadas}
            for r in salas
        ],
        "doors": [dict(d) for d in plano["doors"] if d["from"] in claves and d["to"] in claves],
    }


def layout_para(attempt, scene_map):
    """El ``layout`` del mundo del intento en el mapa ``scene_map`` (contrato 5.2), o ``None`` si la sala es de imagen fija.

    Solo una sala armada por piezas lleva plano: un caso de antes (``SIM-VBG-001``) se ve y se juega igual que siempre (M10)
    y su mundo no gasta consultas de más. Las escenas se nombran por id de nodo (``sceneRooms`` tiene los dos): ni la escena
    actual ni los eventos piden otra consulta.
    """
    if scene_map is None or not isinstance(scene_map.structure, dict):
        return None
    plano = _plano_en_cache(attempt.case_version)
    eventos = AttemptEvent.objects.filter(attempt_id=attempt.id).values_list("event_type", "node_id", "detail")
    return recortar(plano, scene_map.node_id, salas_visitadas(plano, eventos, scene_map.node_id))
