"""
Generador: comisaria-sala-espera.json
Produce un mapa Tiled 2.5D completo (60×33 tiles, 16px/tile) con las capas:
  floor, walls, props_back, props_front, lighting (vacía), overlay (vacía), Objects.

Ejecutar desde la raíz del proyecto:
    python tools/map-generator/generate_comisaria_sala_espera.py

GIDs marcados VALIDAR: comprobar visualmente en el navegador.
Si un tile se ve incorrecto, ajustar la constante y re-ejecutar (idempotente).
"""
import json
from pathlib import Path

# ── Tile ID constants ──────────────────────────────────────────────────────────
# tiny-dungeon: firstgid=1, 12 cols.   GID = 1 + (row-1)*12 + (col-1)
TD_WALL      = 1    # (row=1, col=1) — stone wall, ya en uso en mapa original

# rpg-urban: firstgid=133, 27 cols.  GID = 133 + (row-1)*27 + (col-1)
def _ru(row1: int, col1: int) -> int:
    """GID rpg-urban por fila/columna 1-indexadas."""
    return 133 + (row1 - 1) * 27 + (col1 - 1)

RU_FLOOR_GRAY    = _ru(1, 4)   # VALIDAR — suelo gris interior
RU_FLOOR_GRAY2   = _ru(1, 5)   # VALIDAR — variante suelo (chequerboard)
RU_CABINET_TOP   = _ru(4, 1)   # VALIDAR — parte superior fichero
RU_CABINET_MID   = _ru(5, 1)   # VALIDAR — parte media fichero
RU_CHAIR         = _ru(4, 7)   # VALIDAR — silla de espera
RU_TABLE         = _ru(4, 9)   # VALIDAR — mesa pequeña
RU_COUNTER_TOP   = _ru(6, 4)   # VALIDAR — superficie del mostrador
RU_COUNTER_FRONT = _ru(7, 4)   # VALIDAR — frente del mostrador

MAP_W, MAP_H = 60, 33

# ── Funciones de pintura por capa ──────────────────────────────────────────────

def _paint_floor(r: int, c: int) -> int:
    """Interior (rows 1-31, cols 1-58): chequerboard. Borde → 0."""
    if r == 0 or r == MAP_H - 1 or c == 0 or c == MAP_W - 1:
        return 0
    return RU_FLOOR_GRAY if (r + c) % 2 == 0 else RU_FLOOR_GRAY2


def _paint_walls(r: int, c: int) -> int:
    """Borde de 1 tile. Hueco en col 59, filas 14-16 (exit-to-consultorio)."""
    on_border = (r == 0 or r == MAP_H - 1 or c == 0 or c == MAP_W - 1)
    if not on_border:
        return 0
    if c == MAP_W - 1 and 14 <= r <= 16:   # hueco de puerta
        return 0
    return TD_WALL


def _paint_props_back(r: int, c: int) -> int:
    """Mobiliario norte: ficheros NW/NE, sillas de espera E/W, mesas centrales."""
    # Ficheros NW: rows 1-3, cols 1-4
    if r == 1 and 1 <= c <= 4:
        return RU_CABINET_TOP
    if 2 <= r <= 3 and 1 <= c <= 4:
        return RU_CABINET_MID
    # Ficheros NE: rows 1-3, cols 55-58
    if r == 1 and 55 <= c <= 58:
        return RU_CABINET_TOP
    if 2 <= r <= 3 and 55 <= c <= 58:
        return RU_CABINET_MID
    # Sillas W: rows 5 y 7, cols 2, 5, 8, 11
    if r in (5, 7) and c in (2, 5, 8, 11):
        return RU_CHAIR
    # Sillas E: rows 5 y 7, cols 47, 50, 53, 56
    if r in (5, 7) and c in (47, 50, 53, 56):
        return RU_CHAIR
    # Mesas centrales: rows 4-5, cols 24-28 y 31-35
    if 4 <= r <= 5 and 24 <= c <= 28:
        return RU_TABLE
    if 4 <= r <= 5 and 31 <= c <= 35:
        return RU_TABLE
    return 0


def _paint_props_front(r: int, c: int) -> int:
    """Mostrador de recepción. Brazo L (rows 19-20, cols 8-9), cuerpo (rows 20-21, cols 8-36)."""
    # Brazo L y borde superior-izquierdo: rows 19-20, cols 8-9
    if r in (19, 20) and c in (8, 9):
        return RU_COUNTER_FRONT
    # Superficie del mostrador: row 20, cols 8-36 (nota: cols 8-9 ya asignados arriba → retorna FRONT)
    if r == 20 and 8 <= c <= 36:
        return RU_COUNTER_TOP
    # Frente del mostrador: row 21, cols 8-36
    if r == 21 and 8 <= c <= 36:
        return RU_COUNTER_FRONT
    return 0

# ── Construcción de capas ──────────────────────────────────────────────────────

def _build_data(paint_fn) -> list[int]:
    """Genera el array plano de GIDs (row-major) para MAP_W × MAP_H."""
    return [paint_fn(r, c) for r in range(MAP_H) for c in range(MAP_W)]


def _tilelayer(name: str, paint_fn, layer_id: int) -> dict:
    return {
        "data": _build_data(paint_fn),
        "height": MAP_H,
        "id": layer_id,
        "name": name,
        "opacity": 1,
        "type": "tilelayer",
        "visible": True,
        "width": MAP_W,
        "x": 0,
        "y": 0,
    }


def _empty_layer(name: str, layer_id: int) -> dict:
    return _tilelayer(name, lambda r, c: 0, layer_id)


# ── Capa Objects (preservada del mapa original) ────────────────────────────────
_OBJECTS_LAYER = {
    "draworder": "topdown",
    "id": 7,
    "name": "Objects",
    "objects": [
        {
            "height": 48, "id": 1, "name": "exit-to-consultorio",
            "rotation": 0, "type": "EXIT", "visible": True, "width": 32,
            "x": 920, "y": 240,
        },
        {
            "height": 16, "id": 2, "name": "familiar-comisaria",
            "rotation": 0, "type": "NPC", "visible": True, "width": 16,
            "x": 288, "y": 176,
        },
        {
            "height": 16, "id": 3, "name": "colega-comisaria",
            "rotation": 0, "type": "NPC", "visible": True, "width": 16,
            "x": 416, "y": 240,
        },
    ],
    "opacity": 1,
    "type": "objectgroup",
    "visible": True,
    "x": 0,
    "y": 0,
}

# ── Tilesets ───────────────────────────────────────────────────────────────────
_TILESETS = [
    {
        "columns": 12,
        "firstgid": 1,
        "image": "../kenney/tiny-dungeon/Tilemap/tilemap_packed.png",
        "imageheight": 176,
        "imagewidth": 192,
        "margin": 0,
        "name": "tiny-dungeon",
        "spacing": 0,
        "tilecount": 132,
        "tileheight": 16,
        "tilewidth": 16,
    },
    {
        "columns": 27,
        "firstgid": 133,
        "image": "../kenney/rpg-urban-pack/Spritesheet/tilemap_packed.png",
        "imageheight": 288,
        "imagewidth": 432,
        "margin": 0,
        "name": "rpg-urban",
        "spacing": 0,
        "tilecount": 486,
        "tileheight": 16,
        "tilewidth": 16,
    },
]

# ── Mapa completo ──────────────────────────────────────────────────────────────
_MAP = {
    "compressionlevel": -1,
    "height": MAP_H,
    "infinite": False,
    "layers": [
        _tilelayer("floor",       _paint_floor,       1),
        _tilelayer("walls",       _paint_walls,       2),
        _tilelayer("props_back",  _paint_props_back,  3),
        _tilelayer("props_front", _paint_props_front, 6),
        _empty_layer("lighting",  4),
        _empty_layer("overlay",   5),
        _OBJECTS_LAYER,
    ],
    "nextlayerid": 8,
    "nextobjectid": 10,
    "orientation": "orthogonal",
    "renderorder": "right-down",
    "tiledversion": "1.12.2",
    "tileheight": 16,
    "tilesets": _TILESETS,
    "tilewidth": 16,
    "type": "map",
    "version": "1.10",
    "width": MAP_W,
}

if __name__ == "__main__":
    out = Path("frontend/src/assets/game/maps/comisaria-sala-espera.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(_MAP, separators=(",", ":")), encoding="utf-8")
    print(f"Generado: {out}")
    for layer in _MAP["layers"]:
        if layer["type"] == "tilelayer":
            n = sum(1 for g in layer["data"] if g != 0)
            print(f"  {layer['name']:16s} {n:5d} tiles no-cero")
        else:
            print(f"  {layer['name']:16s} {len(layer.get('objects', []))} objetos")
