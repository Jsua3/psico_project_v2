"""Las reglas ``OCL-13`` a ``OCL-18`` sobre las salas armadas por piezas (``x-siep`` 2.2, contrato sección 4.1).

Como ``OCL-09…12``, son del servidor y leen ``doc["x-siep"]``; lo que no tiene la forma esperada se ignora (la forma la
vigila ``siep_check``). Solo miran los mapas que traen ``estructura`` y sus puertas con ``muro``: un caso de imagen fija
(todos los de antes, ``SIM-VBG-001`` incluido) da «no aplica» en las seis y su veredicto no cambia.

- OCL-13: cada pieza y cada puerta está en un muro que su encuadre tiene y que su modelo admite, y dentro de su largo.
- OCL-14: dos piezas del mismo muro no se estorban (a lo largo del muro y en altura, con 8 px más si una es puerta).
- OCL-15: cada puerta lleva a una escena que existe y que tiene puerta de regreso, salvo ``sentidoUnico``.
- OCL-16: la llegada de cada puerta es caminable: el pie del jugador no toca ninguna colisión del destino.
- OCL-17: desde la aparición se alcanza, caminando por una rejilla de 8 px, toda puerta, persona y objeto interactivo.
- OCL-18: ancho, acabados y modelos están en el catálogo de piezas.
"""
# Las reglas se registran en el orden en que se importan: las de antes van primero aunque alguien importe este módulo solo.
from . import catalogo as catalogo_piezas
from . import geometria
from . import rules_ocl, rules_prop, rules_xsiep  # noqa: F401, I001
from .doc import _objetos, _texto_id
from .report import Finding as _h
from .report import Outcome
from .rules import rule

SIEP = "x-siep"
#: El pie del jugador (``world_service.PLAYER_HITBOX_*``): 22 × 16, anclado en (x − 11, y − 16).
PIE_ANCHO, PIE_ALTO = 22, 16
REJILLA = 8
#: A qué distancia se alcanza cada cosa: los radios del juego (puerta 56, persona 72, otro objeto 74).
RADIO_PUERTA, RADIO_PERSONA, RADIO_OBJETO = 56, 72, 74
NO_INTERACTIVOS = frozenset({"PROP", "EXIT"})
SIN_ESTRUCTURA = "ningún mapa del caso está armado por piezas"

# BORRADOR: los textos de los hallazgos son nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).


class _Sala:
    """Un mapa con estructura, ya leído: su ruta, geometría, piezas, puertas, colisiones y objetos."""

    def __init__(self, i, escena, mapa):
        self.i, self.escena, self.mapa = i, escena, mapa
        self.estructura = mapa["estructura"]
        self.clave = _texto_id(escena.get("clave")) or ""
        self.nombre = _texto_id(mapa.get("titulo")) or self.clave or "(sin nombre)"
        ambiente = mapa.get("ambiente") if isinstance(mapa.get("ambiente"), dict) else {}
        encuadre = ambiente.get("encuadre")
        self.encuadre = encuadre if encuadre in geometria.LATERALES else "tres-paredes"
        sala = ambiente.get("salaId")
        self.sala_id = sala if isinstance(sala, str) and sala else self.clave
        ancho = self.estructura.get("ancho")
        self.ancho = ancho if ancho in geometria.ANCHOS and not isinstance(ancho, bool) else None
        self.objetos = list(_objetos(mapa.get("objetos")))

    @property
    def ruta(self):
        return f"{SIEP}.escenas[{self.i}].mapa"

    @property
    def elemento(self):
        return f"Sala {self.nombre}"

    def piezas(self):
        return list(_objetos(self.estructura.get("piezas")))

    def puertas(self):
        """``(posición, objeto, metadatos)`` de TODO ``EXIT`` de la sala, esté bien puesto o no.

        En una sala por piezas toda puerta va en un muro: una con ``muro`` o ``pos`` que falten o no sirvan no se salta las
        reglas (revisión de Codex, hallazgo 2); OCL-13 la informa y las demás la juzgan con lo que sí trae.
        """
        resultado = []
        for k, obj in self.objetos:
            if obj.get("tipo") == "EXIT":
                meta = obj.get("metadatos") if isinstance(obj.get("metadatos"), dict) else {}
                resultado.append((k, obj, meta))
        return resultado


def _entero(valor):
    return isinstance(valor, int) and not isinstance(valor, bool)


def _siep(doc):
    siep = doc.get(SIEP) if isinstance(doc, dict) else None
    return siep if isinstance(siep, dict) else {}


def _escenas(doc):
    return list(_objetos(_siep(doc).get("escenas")))


def _salas(doc):
    salas = []
    for i, escena in _escenas(doc):
        mapa = escena.get("mapa")
        if isinstance(mapa, dict) and isinstance(mapa.get("estructura"), dict):
            salas.append(_Sala(i, escena, mapa))
    return salas


def _mapas_por_escena(doc):
    """clave de escena → (escena, mapa) de toda escena con mapa (tenga o no estructura)."""
    resultado = {}
    for _, escena in _escenas(doc):
        clave = _texto_id(escena.get("clave"))
        mapa = escena.get("mapa")
        if clave and isinstance(mapa, dict):
            resultado[clave] = mapa
    return resultado


def _sala_de(clave, mapa):
    ambiente = mapa.get("ambiente") if isinstance(mapa, dict) and isinstance(mapa.get("ambiente"), dict) else {}
    sala = ambiente.get("salaId")
    return sala if isinstance(sala, str) and sala else clave


def _pieza_de(catalogo, tipo, modelo):
    return catalogo.piezas.get(f"{tipo}/{modelo}") if catalogo else None


# ─── OCL-13 ───────────────────────────────────────────────────────────────────────────────────
@rule("OCL-13", "OCL")
def ocl_13_piezas_sobre_un_muro_existente(doc):
    """OCL-13. Toda pieza está sobre un muro que su encuadre tiene y dentro de su largo.

    Una pieza de muro (y una puerta) va en un muro que el encuadre de la sala tiene y que su modelo admite, y su tramo
    ``[pos − ocupa/2, pos + ocupa/2]`` cabe en el largo del muro. Una pieza de suelo (lámpara de pie o de mesa) va con
    ``x, y`` dentro de la zona caminable. Las puertas no van en ``piezas``: son objetos ``EXIT``.
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    catalogo = catalogo_piezas.vigente()
    hallazgos, evaluados = [], 0
    for sala in salas:
        if sala.ancho is None:
            continue  # sin ancho del catálogo no hay geometría: lo informa OCL-18
        zona = geometria.zona_caminable(sala.encuadre, sala.ancho)
        for k, pieza in sala.piezas():
            evaluados += 1
            ruta = f"{sala.ruta}.estructura.piezas[{k}]"
            modelo = _pieza_de(catalogo, pieza.get("tipo"), pieza.get("modelo"))
            if pieza.get("tipo") == "puerta":
                hallazgos.append(_h(sala.elemento, ruta, "Las puertas no van entre las piezas: son objetos de salida (EXIT) con muro y posición."))
                continue
            if "muro" in pieza:
                hallazgos.extend(_fuera_del_muro(sala, ruta, pieza.get("muro"), pieza.get("pos"), modelo))
            elif _entero(pieza.get("x")) and _entero(pieza.get("y")):
                if modelo is not None and not modelo.de_suelo:
                    hallazgos.append(_h(sala.elemento, ruta, "Esta pieza va colgada de un muro, no apoyada en el suelo."))
                x, y = pieza["x"], pieza["y"]
                if not (zona[0] <= x <= zona[0] + zona[2] and zona[1] <= y <= zona[1] + zona[3]):
                    hallazgos.append(_h(sala.elemento, ruta, "La pieza de suelo queda fuera de la zona donde se camina."))
        for k, _obj, meta in sala.puertas():
            evaluados += 1
            modelo = _pieza_de(catalogo, "puerta", meta.get("modelo"))
            hallazgos.extend(_fuera_del_muro(sala, f"{sala.ruta}.objetos[{k}]", meta.get("muro"), meta.get("pos"), modelo))
    return Outcome(evaluados, hallazgos)


def _fuera_del_muro(sala, ruta, muro, pos, modelo):
    if muro not in geometria.MUROS or not _entero(pos):
        return [_h(sala.elemento, ruta, (
            "No dice en qué muro ni en qué posición va: en una sala por piezas toda pieza y toda puerta lleva «muro» "
            "(fondo, izquierda, derecha o cámara) y «pos» (un número entero)."
        ))]
    largo = geometria.largo_muro(muro, sala.encuadre, sala.ancho)
    if largo == 0:
        return [_h(sala.elemento, ruta, f"La sala no tiene muro «{muro}»: su encuadre no lo incluye.")]
    if modelo is not None and muro not in modelo.muros:
        return [_h(sala.elemento, ruta, f"Este modelo no puede ir en el muro «{muro}».")]
    ocupa = modelo.ocupa if modelo is not None else 0
    if 2 * pos - ocupa < 0 or 2 * pos + ocupa > 2 * largo:
        return [_h(sala.elemento, ruta, f"La pieza se sale del muro «{muro}», que mide {largo} px.")]
    return []


# ─── OCL-14 ───────────────────────────────────────────────────────────────────────────────────
@rule("OCL-14", "OCL")
def ocl_14_piezas_sin_solaparse(doc):
    """OCL-14. Dos piezas del mismo muro no se solapan.

    Chocan si sus tramos a lo largo del muro se tocan (``|pos_a − pos_b| < (ocupa_a + ocupa_b) / 2``, con 8 px más si una
    es puerta) y además sus franjas de altura se cruzan: un tubo de techo encima de una puerta no la estorba.
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    catalogo = catalogo_piezas.vigente()
    hallazgos, evaluados = [], 0
    for sala in salas:
        en_muros = []
        for k, pieza in sala.piezas():
            modelo = _pieza_de(catalogo, pieza.get("tipo"), pieza.get("modelo"))
            if modelo and pieza.get("muro") in geometria.MUROS and _entero(pieza.get("pos")):
                en_muros.append((f"{sala.ruta}.estructura.piezas[{k}]", pieza.get("id") or pieza["modelo"], pieza["muro"], pieza["pos"], modelo))
        for k, obj, meta in sala.puertas():
            modelo = _pieza_de(catalogo, "puerta", meta.get("modelo"))
            if modelo and meta.get("muro") in geometria.MUROS and _entero(meta.get("pos")):  # las mal puestas, OCL-13
                en_muros.append((f"{sala.ruta}.objetos[{k}]", obj.get("clave") or "puerta", meta["muro"], meta["pos"], modelo))
        evaluados += len(en_muros)
        for a in range(len(en_muros)):
            for b in range(a + 1, len(en_muros)):
                ruta_a, nombre_a, muro_a, pos_a, modelo_a = en_muros[a]
                _, nombre_b, muro_b, pos_b, modelo_b = en_muros[b]
                if muro_a != muro_b:
                    continue
                holgura = 16 if modelo_a.es_puerta or modelo_b.es_puerta else 0  # 8 px, al doble por comparar 2·|Δpos|
                cerca = 2 * abs(pos_a - pos_b) < modelo_a.ocupa + modelo_b.ocupa + holgura
                en_altura = modelo_a.franja[0] < modelo_b.franja[1] and modelo_b.franja[0] < modelo_a.franja[1]
                if cerca and en_altura:
                    hallazgos.append(_h(sala.elemento, ruta_a, f"«{nombre_a}» y «{nombre_b}» se montan una sobre otra en el muro «{muro_a}»."))
    return Outcome(evaluados, hallazgos)


# ─── OCL-15 ───────────────────────────────────────────────────────────────────────────────────
@rule("OCL-15", "OCL")
def ocl_15_puertas_con_regreso(doc):
    """OCL-15. Toda puerta lleva a una sala que existe, y esa sala tiene una puerta de regreso, salvo que la puerta declare sentidoUnico.

    El regreso vale si vuelve a la escena de origen o a otra escena de su misma sala. Con ``par``, esa puerta debe
    existir en el destino y volver.
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    mapas = _mapas_por_escena(doc)
    hallazgos, evaluados = [], 0
    for sala in salas:
        for k, obj, meta in sala.puertas():
            evaluados += 1
            ruta = f"{sala.ruta}.objetos[{k}]"
            destino = meta.get("targetNodeKey")
            if destino not in mapas:
                hallazgos.append(_h(sala.elemento, ruta, "La puerta lleva a una sala que el caso no tiene."))
                continue
            if "par" in meta and not isinstance(meta["par"], str):
                hallazgos.append(_h(sala.elemento, ruta, "«par» debe ser la clave (un texto) de la puerta de regreso."))
                continue
            if "sentidoUnico" in meta and not isinstance(meta["sentidoUnico"], bool):
                hallazgos.append(_h(sala.elemento, ruta, "«sentidoUnico» debe ser verdadero o falso."))
                continue
            if meta.get("sentidoUnico") is True:
                continue
            vuelve = _vuelve(sala.clave, sala.sala_id, mapas, destino, meta.get("par"))
            if vuelve is not None:
                hallazgos.append(_h(sala.elemento, ruta, vuelve))
    return Outcome(evaluados, hallazgos)


def _vuelve(origen, sala_origen, mapas, destino, par):
    """``None`` si el destino tiene puerta de regreso; si no, el porqué."""
    def regresa(obj):
        meta = obj.get("metadatos") if isinstance(obj.get("metadatos"), dict) else {}
        objetivo = meta.get("targetNodeKey")
        return obj.get("tipo") == "EXIT" and (
            objetivo == origen or (objetivo in mapas and _sala_de(objetivo, mapas[objetivo]) == sala_origen)
        )

    objetos = [o for _, o in _objetos(mapas[destino].get("objetos"))]
    if isinstance(par, str):
        pareja = next((o for o in objetos if o.get("clave") == par), None)
        if pareja is None:
            return f"La puerta de regreso «{par}» no está en la sala de destino."
        return None if regresa(pareja) else f"La puerta «{par}» de la sala de destino no vuelve a esta sala."
    if any(regresa(o) for o in objetos):
        return None
    return "La sala de destino no tiene puerta de regreso; si es de un solo sentido, márcala como de sentido único."


# ─── OCL-16 ───────────────────────────────────────────────────────────────────────────────────
def _rects(mapa):
    """Los rectángulos que bloquean el paso en un mapa: sus colisiones y los objetos visibles con colisión."""
    rects = []
    for _, zona in _objetos(mapa.get("colisiones")):
        if all(_entero(zona.get(c)) for c in ("x", "y", "ancho", "alto")):
            rects.append((zona["x"], zona["y"], zona["ancho"], zona["alto"]))
    for _, obj in _objetos(mapa.get("objetos")):
        if obj.get("colision") is True and obj.get("visible") is not False and all(
            _entero(obj.get(c)) for c in ("x", "y", "ancho", "alto")
        ):
            rects.append((obj["x"], obj["y"], obj["ancho"], obj["alto"]))
    return rects


def _pie_dentro(x, y, ancho, alto):
    """¿Cabe el pie entero (x − 11 … x + 11, y − 16 … y) dentro del mapa?"""
    return x - PIE_ANCHO // 2 >= 0 and x + PIE_ANCHO // 2 <= ancho and y - PIE_ALTO >= 0 and y <= alto


def _pie_choca(x, y, rects):
    px, py = x - PIE_ANCHO // 2, y - PIE_ALTO
    return any(px < rx + rw and rx < px + PIE_ANCHO and py < ry + rh and ry < py + PIE_ALTO for rx, ry, rw, rh in rects)


@rule("OCL-16", "OCL")
def ocl_16_llegada_caminable(doc):
    """OCL-16. El punto de llegada de cada puerta es caminable y no cae sobre una colisión.

    Se mira el pie del jugador (22 × 16) en ``entryX, entryY`` contra las colisiones y los objetos con colisión del mapa
    de destino.
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    mapas = _mapas_por_escena(doc)
    hallazgos, evaluados = [], 0
    for sala in salas:
        for k, _obj, meta in sala.puertas():
            destino = mapas.get(meta.get("targetNodeKey"))
            if destino is None or not (_entero(meta.get("entryX")) and _entero(meta.get("entryY"))):
                continue  # sin destino lo informa OCL-15
            evaluados += 1
            x, y = meta["entryX"], meta["entryY"]
            ancho, alto = destino.get("ancho"), destino.get("alto")
            # El pie entero dentro del mapa, como exige el servidor al moverse (revisión de Codex, hallazgo 4).
            fuera = _entero(ancho) and _entero(alto) and not _pie_dentro(x, y, ancho, alto)
            if fuera or _pie_choca(x, y, _rects(destino)):
                hallazgos.append(_h(
                    sala.elemento, f"{sala.ruta}.objetos[{k}].metadatos",
                    "Quien cruza esta puerta aparece en la otra sala sobre una pared o un mueble.",
                ))
    return Outcome(evaluados, hallazgos)


# ─── OCL-17 ───────────────────────────────────────────────────────────────────────────────────
def alcanzables(mapa, ancho=None):
    """Los puntos de la rejilla de 8 px (anclada en la aparición) a los que se llega caminando desde ella.

    4 vecinos; un punto es caminable si el pie del jugador no toca ninguna colisión ni sale del mapa. Para que una sala de
    1920 px se juzgue rápido, cada rectángulo se marca una vez sobre la rejilla en vez de probarlo en cada punto.
    """
    aparicion = mapa.get("aparicion") if isinstance(mapa.get("aparicion"), dict) else {}
    ax, ay = aparicion.get("x"), aparicion.get("y")
    ancho = ancho or mapa.get("ancho")
    alto = mapa.get("alto") if _entero(mapa.get("alto")) else geometria.ALTO_SALA
    if not (_entero(ax) and _entero(ay) and _entero(ancho)):
        return set()
    if not _pie_dentro(ax, ay, ancho, alto):  # una aparición con el pie fuera del mapa no alcanza nada (hallazgo 5)
        return set()
    # Índices de la rejilla: x = ax + 8i, y = ay + 8j, con el pie entero dentro del mapa (11 ≤ x ≤ ancho − 11, 16 ≤ y ≤ alto).
    i_min, i_max = _techo(PIE_ANCHO // 2 - ax, REJILLA), (ancho - PIE_ANCHO // 2 - ax) // REJILLA
    j_min, j_max = _techo(PIE_ALTO - ay, REJILLA), (alto - ay) // REJILLA
    bloqueado = set()
    for rx, ry, rw, rh in _rects(mapa):
        # El pie (x − 11 … x + 11, y − 16 … y) toca el rectángulo si rx − 11 < x < rx + rw + 11 y ry < y < ry + rh + 16.
        i_desde = _techo(rx - PIE_ANCHO // 2 - ax + 1, REJILLA)
        i_hasta = (rx + rw + PIE_ANCHO // 2 - ax - 1) // REJILLA
        j_desde = _techo(ry - ay + 1, REJILLA)
        j_hasta = (ry + rh + PIE_ALTO - ay - 1) // REJILLA
        for i in range(max(i_desde, i_min), min(i_hasta, i_max) + 1):
            for j in range(max(j_desde, j_min), min(j_hasta, j_max) + 1):
                bloqueado.add((i, j))
    if (0, 0) in bloqueado:
        return set()
    vistos, pendientes = {(0, 0)}, [(0, 0)]
    while pendientes:
        i, j = pendientes.pop()
        for vecino in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if vecino in vistos or vecino in bloqueado:
                continue
            if not (i_min <= vecino[0] <= i_max and j_min <= vecino[1] <= j_max):
                continue
            vistos.add(vecino)
            pendientes.append(vecino)
    return {(ax + REJILLA * i, ay + REJILLA * j) for i, j in vistos}


def _techo(n, d):
    return -((-n) // d)


@rule("OCL-17", "OCL")
def ocl_17_todo_se_alcanza(doc):
    """OCL-17. Desde la entrada se alcanza toda puerta, todo personaje y todo objeto interactivo, caminando sobre una rejilla de 8 px.

    Un objetivo se alcanza si algún punto al que se llega queda a 56 px de una puerta, 72 de una persona o 74 de otro
    objeto interactivo (los radios del juego).
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    hallazgos, evaluados = [], 0
    for sala in salas:
        puntos = alcanzables(sala.mapa, sala.ancho)
        if not puntos:
            evaluados += 1
            hallazgos.append(_h(sala.elemento, f"{sala.ruta}.aparicion", "Quien entra a la sala aparece sobre una pared o un mueble."))
            continue
        cercanos = _indice(puntos)
        for k, obj in sala.objetos:
            tipo = obj.get("tipo")
            if obj.get("visible") is False or not (_entero(obj.get("x")) and _entero(obj.get("y"))):
                continue
            if tipo == "EXIT":
                radio = RADIO_PUERTA
            elif tipo == "PERSON":
                radio = RADIO_PERSONA
            elif tipo not in NO_INTERACTIVOS:
                radio = RADIO_OBJETO
            else:
                continue
            evaluados += 1
            if not _cerca(cercanos, obj["x"], obj["y"], radio):
                nombre = obj.get("etiqueta") or obj.get("clave") or "un objeto"
                hallazgos.append(_h(sala.elemento, f"{sala.ruta}.objetos[{k}]", f"No se puede llegar caminando hasta «{nombre}» desde la entrada de la sala."))
    return Outcome(evaluados, hallazgos)


def _indice(puntos):
    """Los puntos agrupados por casilla de 64 px, para buscar solo cerca de cada objetivo."""
    casillas = {}
    for x, y in puntos:
        casillas.setdefault((x // 64, y // 64), []).append((x, y))
    return casillas


def _cerca(casillas, x, y, radio):
    r2 = radio * radio
    for cx in range((x - radio) // 64, (x + radio) // 64 + 1):
        for cy in range((y - radio) // 64, (y + radio) // 64 + 1):
            for px, py in casillas.get((cx, cy), ()):
                if (px - x) ** 2 + (py - y) ** 2 <= r2:
                    return True
    return False


# ─── OCL-18 ───────────────────────────────────────────────────────────────────────────────────
@rule("OCL-18", "OCL")
def ocl_18_todo_del_catalogo(doc):
    """OCL-18. El ancho, los acabados y los modelos pertenecen al catálogo.

    El ancho es uno de 960, 1200, 1440, 1680 o 1920; el piso y su variante, el muro y su paleta, cada pieza, cada modelo
    de puerta y cada capa propia o tapete existen en el manifiesto de piezas de la biblioteca.
    """
    salas = _salas(doc)
    if not salas:
        return Outcome(no_aplica=SIN_ESTRUCTURA)
    catalogo = catalogo_piezas.vigente()
    if catalogo is None:
        return Outcome(len(salas), [_h(
            "Caso", f"{SIEP}.escenas", "El catálogo de piezas de la biblioteca no está disponible: no se pueden revisar las salas por piezas.",
        )])
    hallazgos = []
    for sala in salas:
        ruta = f"{sala.ruta}.estructura"
        if sala.ancho is None:
            hallazgos.append(_h(sala.elemento, f"{ruta}.ancho", "El ancho de la sala no es uno del catálogo (960, 1200, 1440, 1680 o 1920)."))
        acabados = sala.estructura.get("acabados") if isinstance(sala.estructura.get("acabados"), dict) else {}
        piso, variante = acabados.get("piso"), acabados.get("variante", "a")
        if not catalogo.tiene_piso(piso, variante):
            hallazgos.append(_h(sala.elemento, f"{ruta}.acabados", f"El piso «{piso}» en la variante «{variante}» no está en el catálogo."))
        if not catalogo.tiene_muro(acabados.get("muro"), acabados.get("paleta")):
            hallazgos.append(_h(sala.elemento, f"{ruta}.acabados", f"El muro «{acabados.get('muro')}» con la paleta «{acabados.get('paleta')}» no está en el catálogo."))
        for k, pieza in sala.piezas():
            if pieza.get("tipo") != "puerta" and _pieza_de(catalogo, pieza.get("tipo"), pieza.get("modelo")) is None:
                hallazgos.append(_h(sala.elemento, f"{ruta}.piezas[{k}]", f"La pieza «{pieza.get('tipo')}/{pieza.get('modelo')}» no está en el catálogo."))
        for k, _obj, meta in sala.puertas():
            if _pieza_de(catalogo, "puerta", meta.get("modelo")) is None:
                hallazgos.append(_h(sala.elemento, f"{sala.ruta}.objetos[{k}]", f"La puerta de modelo «{meta.get('modelo')}» no está en el catálogo."))
        for campo, conocidas in (("propios", catalogo.propios), ("tapetes", catalogo.tapetes)):
            for k, capa in _objetos(sala.estructura.get(campo)):
                if capa.get("ruta") not in conocidas:
                    hallazgos.append(_h(sala.elemento, f"{ruta}.{campo}[{k}]", f"La imagen «{capa.get('ruta')}» no está en el catálogo."))
    return Outcome(len(salas), hallazgos)
