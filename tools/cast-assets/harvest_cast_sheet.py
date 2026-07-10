"""Cosecha la hoja 3x3 de un personaje horneado desde 2 generaciones z_image.

Lecciones de las sondas (2026-07-10, no repetir):
  * z_image en formato TIRA solo dibuja caminatas de PERFIL (ignora "front/back").
  * z_image en formato REJILLA RPG MAKER si produce frentes y espaldas genuinos,
    pero desordenados dentro de la rejilla.
  * La identidad se sostiene dentro de una generacion Y entre generaciones del
    mismo prompt detallado (el estilo pixel-chibi colapsa el espacio).

Receta por personaje (2 generaciones gratis):
  1. rejilla "RPG Maker sprite sheet"  -> se cosechan FRENTES y ESPALDAS
  2. tira  "walk cycle side view"      -> se cosechan los PERFILES

Cada blob (componente conexo tras quitar el fondo blanco) se clasifica por
heuristica: piel visible en la region de cabeza = frente; sin piel = espalda;
perfil = asimetria del centroide de piel. Se eligen los 3 frames con piernas
mas distintas por vista, se registran por linea de pies + centroide y se
ensambla la hoja con el MISMO contrato del sistema modular 2x:

    384x576 = 3 columnas x 3 filas (frente / lado-DERECHA / espalda),
    frames de 128x192, pies en y=180, paleta conjunta.

Asi la hoja horneada es un drop-in para las animaciones existentes
(idle col 0, caminata ping-pong [1,0,2,0]).

    python harvest_cast_sheet.py <grid.png> <side_strip.png> <out.png> \
        [--preview <p.png>] [--report]
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage

FRAME_W, FRAME_H = 128, 192
FEET_Y = 180
CHAR_H = 168
ALPHA_CUT = 110
PALETTE_COLORS = 40
MIN_BLOB_AREA = 2500      # px² a resolucion de generacion (~2048): filtra motas/texto


def remove_white_bg(im, tol=42):
    arr = np.array(im.convert("RGBA")).astype(int)
    dist = np.abs(arr[:, :, :3] - 255).sum(axis=2)
    whiteish = dist <= tol * 3
    lbl, _ = ndimage.label(whiteish)
    border = np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lbl, border)
    out = np.array(im.convert("RGBA"))
    out[:, :, 3] = np.where(bg, 0, out[:, :, 3])
    return Image.fromarray(out, "RGBA")


def extract_blobs(im):
    """Componentes conexos del alfa = candidatos a frame (tolera rejillas torcidas).

    Filtros aprendidos de las sondas:
      * blob que toca el borde de la imagen = personaje recortado por la
        generacion -> descartar (si no, un busto se escala a cuerpo completo);
      * aspecto w/h fuera de [0.35, 0.75] = dos personajes fusionados o una
        mota -> descartar;
      * altura fuera de ±20% de la mediana de la MISMA fuente = busto/escala rota.
    """
    a = np.array(im)[:, :, 3] >= ALPHA_CUT
    H, W = a.shape
    lbl, n = ndimage.label(a)
    raw = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lbl == i)
        if len(xs) < MIN_BLOB_AREA:
            continue
        if ys.min() <= 1 or xs.min() <= 1 or ys.max() >= H - 2 or xs.max() >= W - 2:
            continue  # recortado por el borde
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if not (0.35 <= w / h <= 0.75):
            continue  # fusion de dos personajes o mota ancha
        # regla de piernas: en la banda inferior debe haber MUESCA entre las
        # piernas (columna transparente dentro del contorno) o pies angostos.
        # Un busto cortado a la cadera es solido y ancho: no tiene ninguna.
        band = a[ys.min() + int(h * 0.88):ys.max() + 1, xs.min():xs.max() + 1]
        cols = band.any(axis=0)
        idx = np.nonzero(cols)[0]
        if len(idx) == 0:
            continue
        span = idx.max() - idx.min() + 1
        has_gap = (span - cols.sum()) > max(2, 0.04 * w)
        narrow_feet = cols.sum() <= 0.60 * w
        if not (has_gap or narrow_feet):
            continue
        crop = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        sub = (lbl[ys.min():ys.max() + 1, xs.min():xs.max() + 1] == i)
        arr = np.array(crop)
        arr[:, :, 3] = np.where(sub, arr[:, :, 3], 0)
        raw.append(Image.fromarray(arr, "RGBA"))
    if not raw:
        return raw
    med = float(np.median([b.height for b in raw]))
    return [b for b in raw if abs(b.height - med) <= med * 0.20]


def skin_mask(arr):
    r, g, b, a = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int), arr[:, :, 3]
    return (a >= ALPHA_CUT) & (r > 105) & (r > b + 12) & (g > b * 0.85) & (r - g < 110) & (r + g + b > 210)


def has_eyes(head_arr, skin):
    """Pixeles muy oscuros DENTRO de piel dilatada = ojos. Las espaldas no tienen."""
    rgbsum = head_arr[:, :, :3].astype(int).sum(axis=2)
    dark = (head_arr[:, :, 3] >= ALPHA_CUT) & (rgbsum < 165)
    near_skin = ndimage.binary_dilation(skin, iterations=4)
    eye_px = int((dark & near_skin).sum())
    return eye_px > max(6, skin.sum() * 0.004)


def classify_view(blob):
    """'front' | 'back' | 'side-left' | 'side-right'.

    El discriminador frente/espalda es el COMPONENTE DE PIEL MAS GRANDE de la
    region de cabeza: de frente/perfil es la cara (masa grande); de espaldas lo
    unico visible son orejas (motas diminutas). Los "ojos" solos engañan: la
    oreja + pelo oscuro adyacente tambien da pixeles oscuros junto a piel.
    El lado se decide por el corrimiento del centroide de LA CARA (no de toda
    la piel, que incluye manos) respecto al eje de la cabeza.
    """
    arr = np.array(blob)
    head = arr[: int(blob.height * 0.42)]
    solid = head[:, :, 3] >= ALPHA_CUT
    if solid.sum() == 0:
        return "back"
    skin = skin_mask(head)
    lbl, n = ndimage.label(skin)
    if n == 0:
        return "back"
    areas = ndimage.sum(skin, lbl, range(1, n + 1))
    if float(areas.max()) / solid.sum() < 0.05:
        return "back"  # solo orejas: espalda
    face = (lbl == (int(areas.argmax()) + 1))
    if not has_eyes(head, face):
        return "back"
    xs = np.nonzero(face.any(axis=0))[0]
    center = np.nonzero(solid.any(axis=0))[0].mean()
    face_c = xs.mean()
    if abs(face_c - center) > blob.width * 0.075:
        return "side-left" if face_c < center else "side-right"
    return "front"


def face_ratio(blob):
    """Alto de la region de piel (cara) sobre el alto del blob: un busto tiene
    cara desproporcionada (>0.34); un chibi completo ronda 0.18-0.30."""
    arr = np.array(blob)
    skin = skin_mask(arr)
    ys = np.nonzero(skin.any(axis=1))[0]
    if len(ys) == 0:
        return 0.0
    return (ys.max() - ys.min() + 1) / blob.height


def symmetry(blob):
    """IoU del alfa con su espejo (sobre miniatura): frentes/espaldas reales son
    simetricos; los 3/4 y perfiles no."""
    small = blob.resize((32, 48), Image.LANCZOS)
    a = np.array(small)[:, :, 3] >= ALPHA_CUT
    m = a[:, ::-1]
    inter, union = (a & m).sum(), (a | m).sum()
    return inter / union if union else 0.0


def leg_signature(cell, h=24):
    sub = cell.crop((0, int(cell.height * 0.6), cell.width, cell.height))
    small = sub.resize((16, h), Image.LANCZOS)
    return (np.array(small)[:, :, 3] >= ALPHA_CUT).astype(int)


def pick_distinct(blobs, n=3):
    if len(blobs) <= n:
        return list(blobs)
    sigs = [leg_signature(b) for b in blobs]
    chosen = [0]
    while len(chosen) < n:
        best, best_d = None, -1
        for i in range(len(blobs)):
            if i in chosen:
                continue
            d = min(np.abs(sigs[i] - sigs[j]).sum() for j in chosen)
            if d > best_d:
                best, best_d = i, d
        chosen.append(best)
    return [blobs[i] for i in sorted(chosen)]


def register_cell(blob):
    scale = CHAR_H / blob.height
    w = max(1, round(blob.width * scale))
    resized = blob.resize((w, CHAR_H), Image.LANCZOS)
    a = np.array(resized)[:, :, 3] >= ALPHA_CUT
    xs = np.nonzero(a.any(axis=0))[0]
    cx = (xs.min() + xs.max()) / 2 if len(xs) else w / 2
    cell = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    cell.alpha_composite(resized, (round(FRAME_W / 2 - cx), FEET_Y - CHAR_H))
    return cell


def quantize_joint(cells):
    board = Image.new("RGBA", (FRAME_W * len(cells), FRAME_H), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        board.alpha_composite(c, (i * FRAME_W, 0))
    r, g, b, al = board.split()
    rgb = (Image.merge("RGB", (r, g, b))
           .quantize(colors=PALETTE_COLORS, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
           .convert("RGB"))
    alpha = al.point(lambda v: 255 if v >= ALPHA_CUT else 0)
    board = Image.merge("RGBA", (*rgb.split(), alpha))
    return [board.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H)) for i in range(len(cells))]


def harvest(grid_paths, strip_path, out_path, preview_path=None, report=False):
    buckets = {"front": [], "back": [], "side-right": [], "side-left": []}
    for grid_path in grid_paths:
        for b in extract_blobs(remove_white_bg(Image.open(grid_path))):
            buckets[classify_view(b)].append(b)
    sides = []
    for b in extract_blobs(remove_white_bg(Image.open(strip_path))):
        v = classify_view(b)
        if v == "side-left":
            sides.append(b.transpose(Image.FLIP_LEFT_RIGHT))
        elif v == "side-right":
            sides.append(b)

    # la tira manda para el perfil; la rejilla solo complementa si vino corta
    if len(sides) < 2:
        sides += [b.transpose(Image.FLIP_LEFT_RIGHT) for b in buckets["side-left"]]
        sides += buckets["side-right"]

    if report:
        print(f"cosecha: front={len(buckets['front'])} back={len(buckets['back'])} side={len(sides)}")
    # espalda basta con 1 (el espejo del paso da la pierna contraria); las
    # demas vistas necesitan 2+ para tener un paso real ademas del idle.
    missing = [name for name, blobs, need in
               (("front", buckets["front"], 2), ("back", buckets["back"], 1), ("side", sides, 2))
               if len(blobs) < need]
    if missing:
        raise SystemExit(f"faltan vistas {missing} — regenerar (gratis) y re-cosechar")

    # Seleccion por fila SOBRE CELDAS REGISTRADAS (mismo encuadre 128x192):
    #   idle  = el frame de silueta mas angosta (apoyo),
    #   pasos = entre los candidatos cuya MITAD SUPERIOR coincide con el idle
    #           (IoU>=0.5: misma vista, mismo personaje — un busto o un 3/4
    #           girado no coinciden), los 2 con piernas mas distintas.
    def alpha(c):
        return np.array(c)[:, :, 3] >= ALPHA_CUT

    def upper_iou(a, b):
        ha = alpha(a)[:FEET_Y - CHAR_H + CHAR_H // 2]
        hb = alpha(b)[:FEET_Y - CHAR_H + CHAR_H // 2]
        union = (ha | hb).sum()
        return (ha & hb).sum() / union if union else 0.0

    rows = []
    for name, blobs in (("front", buckets["front"]), ("side", sides), ("back", buckets["back"])):
        cands = [register_cell(b) for b in blobs]
        cands.sort(key=lambda c: (lambda m: m.any(axis=0).sum())(alpha(c)))
        idle = cands[0]
        pool = [c for c in cands[1:] if upper_iou(idle, c) >= 0.5] or cands[1:]
        steps = pick_distinct(pool, 2) if pool else []
        walk = [idle] + steps
        while len(walk) < 3:
            if name in ("front", "back"):
                # truco RPG: el espejo de un paso frontal/espalda es la pierna contraria
                walk.append(walk[-1].transpose(Image.FLIP_LEFT_RIGHT))
            else:
                walk.append(walk[0])
        rows.append(walk)

    cells = [c for row in rows for c in row]
    cells = quantize_joint(cells)
    sheet = Image.new("RGBA", (FRAME_W * 3, FRAME_H * 3), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((i % 3) * FRAME_W, (i // 3) * FRAME_H))
    sheet.save(out_path)
    if preview_path:
        sheet.resize((FRAME_W * 6, FRAME_H * 6), Image.NEAREST).save(preview_path)
    print(f"{out_path}  384x576  (3x3 contrato modular, pies y={FEET_Y})")


def collect_blobs(sources):
    """Todos los blobs de todas las fuentes, en orden estable de entrada."""
    blobs = []
    for path in sources:
        blobs += extract_blobs(remove_white_bg(Image.open(path)))
    return blobs


def make_gallery(sources, gallery_path, height=160):
    """Hoja de contactos numerada: el humano (o el agente) elige las vistas.

    La clasificacion automatica por heuristica de pixeles NO generaliza entre
    los sub-estilos que produce z_image (en los estilos gruesos toda celda
    tiene parches de piel y pixeles oscuros: cuello/orejas parecen caras).
    """
    from PIL import ImageDraw
    blobs = collect_blobs(sources)
    if not blobs:
        raise SystemExit("sin blobs — revisar fuentes")
    widths = [max(28, round(b.width * height / b.height)) for b in blobs]
    cv = Image.new("RGB", (sum(widths) + 8 * len(blobs) + 8, height + 20), (255, 255, 255))
    d = ImageDraw.Draw(cv)
    x = 8
    for i, (b, w) in enumerate(zip(blobs, widths)):
        th = b.resize((w, height))
        cv.paste(th, (x, 0), th)
        d.text((x + w // 2 - 4, height + 4), str(i), fill=(0, 0, 0))
        x += w + 8
    cv.save(gallery_path)
    print(f"{gallery_path}  {len(blobs)} blobs")


def assemble_from_picks(sources, picks, out_path, preview_path=None):
    """Ensambla la hoja 3x3 desde indices elegidos a mano sobre la galeria.

    picks = {"front": [i, ...], "side": [i, ...], "back": [i, ...]}
    En side, un indice negativo (-i) significa "usar el blob i espejado"
    (para perfiles que miran a la izquierda). Filas cortas se completan con
    espejo (front/back) o repitiendo el idle (side).
    """
    blobs = collect_blobs(sources)
    rows = []
    for name in ("front", "side", "back"):
        sel = []
        for idx in picks.get(name, []):
            b = blobs[abs(idx)]
            if idx < 0:
                b = b.transpose(Image.FLIP_LEFT_RIGHT)
            sel.append(b)
        if not sel:
            raise SystemExit(f"pick vacio para {name}")
        cells = [register_cell(b) for b in sel]
        while len(cells) < 3:
            if name in ("front", "back"):
                cells.append(cells[-1].transpose(Image.FLIP_LEFT_RIGHT))
            else:
                cells.append(cells[0])
        rows.append(cells[:3])
    cells = quantize_joint([c for row in rows for c in row])
    sheet = Image.new("RGBA", (FRAME_W * 3, FRAME_H * 3), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((i % 3) * FRAME_W, (i // 3) * FRAME_H))
    sheet.save(out_path)
    if preview_path:
        sheet.resize((FRAME_W * 6, FRAME_H * 6), Image.NEAREST).save(preview_path)
    print(f"{out_path}  384x576  (3x3 contrato modular, picks manuales)")


def parse_picks(spec):
    """"front=0,2 side=1,-3 back=8" -> dict de listas de enteros."""
    picks = {}
    for part in spec.split():
        name, idxs = part.split("=")
        picks[name] = [int(v) for v in idxs.split(",") if v != ""]
    return picks


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--grid", action="append", default=[], help="rejilla(s) RPG Maker")
    ap.add_argument("--strip", default=None, help="tira de perfil")
    ap.add_argument("--preview", default=None)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--gallery", default=None,
                    help="solo genera la hoja de contactos numerada y sale")
    ap.add_argument("--pick", default=None,
                    help='indices manuales: "front=0,2 side=1,-3 back=8" (negativo = espejar)')
    args = ap.parse_args()
    sources = list(args.grid) + ([args.strip] if args.strip else [])
    if args.gallery:
        make_gallery(sources, args.gallery)
    elif args.pick:
        assemble_from_picks(sources, parse_picks(args.pick), args.out, args.preview)
    else:
        harvest(args.grid, args.strip, args.out, args.preview, args.report)
