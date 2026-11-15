"""Geometría de las salas: el lienzo, la zona caminable, los muros y dónde cae una pieza puesta en un muro.

Es la fuente del contrato ``.superpowers/contratos/x-siep-2.2.md`` (sección 1). La sala mide 528 px de alto y su ancho es
uno de ``ANCHOS``; todo es función del encuadre y del ancho, con aritmética entera (``redondear``) para que la copia del
editor (``frontend/src/app/features/autoria/modelo/geometria.ts``, que también lee el juego), la del validador de la
biblioteca (``biblioteca/scripts/geometria.mjs``) y la del motor de arte den los mismos píxeles. Las copias reproducen la
tabla dorada ``biblioteca/esquema/geometria-salas.json`` (``tabla_dorada``); ``test_geometria_encuadres.py`` falla si
alguna deja de coincidir. A 960 px todo da la tabla fija de antes: ningún caso hecho con ella cambia.

La copia de un lugar al caso (``copiar_al_caso``) y el recálculo de las salas por piezas escriben como ``CollisionZone``
lo que queda FUERA de la zona caminable —la pared del fondo, las laterales si el encuadre las tiene, y los bordes
abiertos—: así el servidor rechaza al jugador donde el dibujo dice que hay pared y el cliente, que lee las mismas zonas,
no propone esa posición.
"""
import json
from dataclasses import dataclass
from pathlib import Path

#: Los anchos de sala del catálogo. 960 es el de siempre (``AUTHORED_ROOM_WIDTH`` del juego).
ANCHOS = (960, 1200, 1440, 1680, 1920)
ANCHO_SALA, ALTO_SALA = 960, 528
#: y de la línea donde el muro del fondo toca el piso, y profundidad del piso (largo de un muro lateral).
PISO = 230
FONDO = ALTO_SALA - PISO
#: Lo que queda de lienzo fuera de la zona caminable cuando el encuadre no tiene muro lateral.
MARGEN = 24
#: La zona caminable va de y = 236 a y = 486 en toda sala.
ZONA_Y, ZONA_ALTO = 236, 250
#: Holguras de la llegada: el pie del jugador mide 22 × 16 y se ancla 16 px por encima del punto.
LLEGADA_X, LLEGADA_ARRIBA, LLEGADA_ABAJO = 16, 24, 10

#: Los cuatro muros con nombre; ``camara`` no se dibuja.
MUROS = ("fondo", "izquierda", "derecha", "camara")

#: ¿Tiene muro a la izquierda / a la derecha? Sin él, esa franja es solo el borde abierto del piso.
LATERALES = {
    "tres-paredes": (True, True),
    "dos-paredes-izquierda": (True, False),
    "dos-paredes-derecha": (False, True),
    "una-pared": (False, False),
}

TABLA_DORADA = Path(__file__).resolve().parents[4] / "biblioteca" / "esquema" / "geometria-salas.json"


@dataclass(frozen=True)
class Pared:
    """Un rectángulo de la sala por donde no se camina; ``clave`` es el ``zone_key`` de su ``CollisionZone``."""

    clave: str
    etiqueta: str
    x: int
    y: int
    ancho: int
    alto: int


def redondear(n, d):
    """``n / d`` al entero más cercano, con las mitades hacia +∞ (igual en JS: ``Math.floor((2n + d) / (2d))``)."""
    return (2 * n + d) // (2 * d)


def comprobar_ancho(ancho):
    if ancho not in ANCHOS:
        raise ValueError(f"ancho {ancho} fuera del catálogo {ANCHOS}")
    return ancho


def borde(ancho):
    """x donde un muro lateral se junta con el del fondo: 96 a 960 px … 172 a 1920 px."""
    return 96 + 19 * (comprobar_ancho(ancho) - 960) // 240


def limites(encuadre, ancho=ANCHO_SALA):
    """``(xl, xr)``: los extremos del muro del fondo."""
    izquierda, derecha = LATERALES[encuadre]
    b = borde(ancho)
    return (b if izquierda else 0), (ancho - b if derecha else ancho)


def zona_caminable(encuadre, ancho=ANCHO_SALA):
    """``(x, y, ancho, alto)`` de la zona caminable (``KeyError`` si el encuadre no existe)."""
    izquierda, derecha = LATERALES[encuadre]
    b = borde(ancho)
    x0 = b if izquierda else MARGEN
    x1 = ancho - b if derecha else ancho - MARGEN
    return x0, ZONA_Y, x1 - x0, ZONA_ALTO


#: La tabla fija de antes (960 px), para quien todavía la lee por nombre.
ZONAS = {encuadre: zona_caminable(encuadre) for encuadre in LATERALES}


def largo_muro(muro, encuadre, ancho=ANCHO_SALA):
    """Largo del muro en px; 0 si el encuadre no lo tiene."""
    izquierda, derecha = LATERALES[encuadre]
    if muro in ("fondo", "camara"):
        xl, xr = limites(encuadre, ancho)
        return xr - xl
    if muro == "izquierda":
        return FONDO if izquierda else 0
    if muro == "derecha":
        return FONDO if derecha else 0
    raise KeyError(muro)


def ancla(muro, pos, encuadre, ancho=ANCHO_SALA):
    """Punto de apoyo en pantalla (centro inferior del dibujo) de una pieza puesta en ``(muro, pos)``."""
    xl, _ = limites(encuadre, ancho)
    if muro == "fondo":
        return xl + pos, PISO
    if muro == "camara":
        centro = ancho // 2
        return centro + redondear((xl + pos - centro) * 19, 16), ALTO_SALA
    if muro not in ("izquierda", "derecha"):
        raise KeyError(muro)
    b = borde(ancho)
    x = b - redondear(pos * (b - MARGEN), FONDO)
    return (x if muro == "izquierda" else ancho - x), PISO + pos


def llegada(muro, pos, encuadre, ancho=ANCHO_SALA):
    """Dónde queda parado el personaje junto a la puerta puesta en ``(muro, pos)``: su ancla traída dentro de la zona."""
    x, y = ancla(muro, pos, encuadre, ancho)
    x0, y0, w, h = zona_caminable(encuadre, ancho)
    x = min(max(x, x0 + LLEGADA_X), x0 + w - LLEGADA_X)
    y = min(max(y, y0 + LLEGADA_ARRIBA), y0 + h - LLEGADA_ABAJO)
    return x, y


def paredes(encuadre, ancho=ANCHO_SALA):
    """Los rectángulos que rodean a la zona caminable, en el orden fondo, izquierda, derecha, delantero.

    Juntos con la zona cubren la sala entera, sin solaparse (las laterales van entre el fondo y el borde delantero). Una
    franja lateral sin ancho no se crea.
    """
    x, y, w, h = zona_caminable(encuadre, ancho)
    con_pared_izquierda, con_pared_derecha = LATERALES[encuadre]
    derecha = x + w
    resultado = [Pared("pared-fondo", "Pared del fondo", 0, 0, ancho, y)]
    if x > 0:
        clave, etiqueta = ("pared-izquierda", "Pared izquierda") if con_pared_izquierda else ("borde-izquierdo", "Borde izquierdo")
        resultado.append(Pared(clave, etiqueta, 0, y, x, h))
    if derecha < ancho:
        clave, etiqueta = ("pared-derecha", "Pared derecha") if con_pared_derecha else ("borde-derecho", "Borde derecho")
        resultado.append(Pared(clave, etiqueta, derecha, y, ancho - derecha, h))
    if y + h < ALTO_SALA:
        resultado.append(Pared("borde-delantero", "Borde delantero", 0, y + h, ancho, ALTO_SALA - (y + h)))
    return resultado


def _muestras(largo):
    """Posiciones de muestra a lo largo de un muro: los extremos, el centro y cada 40 px desde 4 (caen mitades)."""
    return sorted({0, largo // 2, largo, *range(4, largo + 1, 40)}) if largo else []


def tabla_dorada():
    """La tabla que las copias deben reproducir: por ancho y encuadre, zona, límites, largos, paredes y muestras de
    ``ancla`` y ``llegada`` en cada muro (``[muro, pos, ax, ay, lx, ly]``)."""
    tabla = {"anchos": list(ANCHOS), "alto": ALTO_SALA, "salas": []}
    for ancho in ANCHOS:
        for encuadre in LATERALES:
            tabla["salas"].append({
                "ancho": ancho, "encuadre": encuadre, "borde": borde(ancho),
                "zona": list(zona_caminable(encuadre, ancho)), "limites": list(limites(encuadre, ancho)),
                "largos": {muro: largo_muro(muro, encuadre, ancho) for muro in MUROS},
                "paredes": [[p.clave, p.x, p.y, p.ancho, p.alto] for p in paredes(encuadre, ancho)],
                "muestras": [
                    [muro, pos, *ancla(muro, pos, encuadre, ancho), *llegada(muro, pos, encuadre, ancho)]
                    for muro in MUROS for pos in _muestras(largo_muro(muro, encuadre, ancho))
                ],
            })
    return tabla


def escribir_tabla_dorada():
    """Regenera ``geometria-salas.json`` y su copia en TS (``geometria-salas.fixture.ts``)."""
    texto = json.dumps(tabla_dorada(), ensure_ascii=False, separators=(",", ":"))
    TABLA_DORADA.write_text(texto + "\n", encoding="utf-8", newline="\n")
    ts = TABLA_DORADA.parents[2] / "frontend" / "src" / "app" / "features" / "autoria" / "modelo" / "geometria-salas.fixture.ts"
    ts.write_text(
        "/**\n * Tabla dorada de la geometría de las salas (contrato x-siep 2.2, sección 1). NO SE EDITA A MANO: la escribe\n"
        " * `geometria.escribir_tabla_dorada()` del servidor, igual que `biblioteca/esquema/geometria-salas.json`.\n */\n"
        f"export const GEOMETRIA_SALAS = {texto} as const;\n",
        encoding="utf-8", newline="\n",
    )
