"""Valida los assets modulares del avatar PROMOVIDOS al runtime (reconstrucción 2×).

Comprueba, sobre frontend/src/assets/characters/modular:
  - dimensiones exactas 384x576 (3 cols x 3 filas, frame 128x192);
  - alpha realmente transparente en el borde de cada hoja (sin fondo sucio);
  - cada frame requerido no esta vacio (cara/pelo-frente pueden faltar de espaldas);
  - las capas de pelo no se desplazan contra el cuerpo mas alla de una tolerancia;
  - cubre las 66 hojas: 12 cuerpos, 12 caras (frente+lado) y 42 cabellos.

Uso:
  python validate_modular_assets.py [--preview RUTA.png]

Exit 1 si falla cualquier criterio.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "frontend" / "src" / "assets" / "characters" / "modular"

SHEET_SIZE = (384, 576)
FRAME_W, FRAME_H = 128, 192
ALPHA_THRESHOLD = 8            # alpha <= esto cuenta como transparente
MIN_FRAME_PIXELS = 120         # cuerpo/pelo: frame "no vacio" (2x del original 30)
MIN_FACE_PIXELS = 60           # las caras son mas pequeñas (solo cabeza)
HAIR_CENTER_TOLERANCE = 16     # px de desvio horizontal pelo vs cuerpo (2x)
HAIR_TOP_RANGE = (-32, 52)     # pelo.top - cuerpo.top dentro de este rango (2x)

# Referencia de alineacion de pelo (todos los cuerpos comparten silueta).
BODY_REF = "body/body_orientadora_purple.png"

# Filas: 0 = frente (down), 1 = lado, 2 = espalda (up).
ALL_ROWS = (0, 1, 2)
FRONT_SIDE_ROWS = (0, 1)       # cara y pelo-frente pueden no existir de espaldas


def rel_list(subdir: str, suffix: str = ".png", exclude=()) -> list[str]:
    d = ASSETS / subdir
    if not d.exists():
        return []
    out = []
    for p in sorted(d.glob(f"*{suffix}")):
        if p.name in exclude:
            continue
        out.append(f"{subdir}/{p.name}")
    return out


def load_rgba(rel: str) -> np.ndarray:
    return np.array(Image.open(ASSETS / rel).convert("RGBA"), dtype=np.uint8)


def frame(arr: np.ndarray, row: int, col: int) -> np.ndarray:
    return arr[row * FRAME_H:(row + 1) * FRAME_H, col * FRAME_W:(col + 1) * FRAME_W]


def opaque_mask(arr: np.ndarray) -> np.ndarray:
    return arr[:, :, 3] > ALPHA_THRESHOLD


def bbox(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def check_sheet(rel: str, required_rows, failures: list[str], min_px: int) -> np.ndarray | None:
    path = ASSETS / rel
    if not path.exists():
        failures.append(f"{rel}: NO EXISTE en runtime")
        return None
    arr = load_rgba(rel)
    h, w = arr.shape[:2]
    if (w, h) != SHEET_SIZE:
        failures.append(f"{rel}: dimensiones {w}x{h} != {SHEET_SIZE[0]}x{SHEET_SIZE[1]}")
        return None

    border = np.concatenate([arr[0, :, 3], arr[-1, :, 3], arr[:, 0, 3], arr[:, -1, 3]])
    leaked = int((border > ALPHA_THRESHOLD).sum())
    if leaked > 0:
        failures.append(f"{rel}: {leaked} px opacos en el borde de la hoja (fondo sucio)")

    for row in required_rows:
        for col in range(3):
            count = int(opaque_mask(frame(arr, row, col)).sum())
            if count < min_px:
                failures.append(f"{rel}: frame fila {row} col {col} vacio ({count} px)")
    return arr


def check_hair_alignment(body: np.ndarray, rel: str, arr: np.ndarray, rows, failures: list[str]) -> None:
    for row in rows:
        for col in range(3):
            hair_box = bbox(opaque_mask(frame(arr, row, col)))
            body_box = bbox(opaque_mask(frame(body, row, col)))
            if hair_box is None or body_box is None:
                continue
            hair_cx = (hair_box[0] + hair_box[2]) / 2
            body_cx = (body_box[0] + body_box[2]) / 2
            if abs(hair_cx - body_cx) > HAIR_CENTER_TOLERANCE:
                failures.append(
                    f"{rel}: fila {row} col {col} centro pelo {hair_cx:.0f} vs cuerpo "
                    f"{body_cx:.0f} (> {HAIR_CENTER_TOLERANCE} px)")
            top_delta = hair_box[1] - body_box[1]
            if not (HAIR_TOP_RANGE[0] <= top_delta <= HAIR_TOP_RANGE[1]):
                failures.append(
                    f"{rel}: fila {row} col {col} copa del pelo a {top_delta:+d} px del "
                    f"cuerpo (rango {HAIR_TOP_RANGE})")


def hair_variants() -> list[str]:
    fronts = rel_list("hair", "_front.png")
    return [Path(f).name[len("hair_"):-len("_front.png")] for f in fronts]


def compose(variant: str, face_rel: str) -> Image.Image:
    def maybe(rel: str) -> Image.Image:
        if (ASSETS / rel).exists():
            return Image.open(ASSETS / rel).convert("RGBA")
        return Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))

    body = maybe(BODY_REF)
    back = maybe(f"hair/hair_{variant}_back.png")
    face = maybe(face_rel)
    front = maybe(f"hair/hair_{variant}_front.png")

    sheet = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
    for row in range(3):
        order = (back, body, face, front) if row < 2 else (body, back, face, front)
        for col in range(3):
            box = (col * FRAME_W, row * FRAME_H, (col + 1) * FRAME_W, (row + 1) * FRAME_H)
            tile = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
            for layer in order:
                tile.alpha_composite(layer.crop(box))
            sheet.alpha_composite(tile, (box[0], box[1]))
    return sheet


def make_preview(out: Path, faces: list[str], variants: list[str]) -> None:
    scale = 2
    face0 = faces[0] if faces else "face/face_neutral.png"
    cols = len(variants) + 1
    tile_w, tile_h = FRAME_W * scale, FRAME_H * scale
    preview = Image.new("RGBA", (tile_w * cols, tile_h * 3 + 26), (16, 18, 28, 255))
    draw = ImageDraw.Draw(preview)

    sheets = [(v, compose(v, face0)) for v in variants]
    none_sheet = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
    none_sheet.alpha_composite(Image.open(ASSETS / BODY_REF).convert("RGBA"))
    if (ASSETS / face0).exists():
        none_sheet.alpha_composite(Image.open(ASSETS / face0).convert("RGBA"))
    sheets.append(("none", none_sheet))

    for idx, (variant, sheet) in enumerate(sheets):
        for row in range(3):
            tile = sheet.crop((FRAME_W, row * FRAME_H, FRAME_W * 2, (row + 1) * FRAME_H))
            tile = tile.resize((tile_w, tile_h), Image.Resampling.NEAREST)
            preview.alpha_composite(tile, (idx * tile_w, row * tile_h))
        draw.text((idx * tile_w + 6, tile_h * 3 + 6), variant, fill=(220, 220, 235, 255))

    out.parent.mkdir(parents=True, exist_ok=True)
    preview.save(out)
    print(f"preview -> {out}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default=None, help="ruta del preview compuesto (PNG)")
    args = ap.parse_args()

    failures: list[str] = []

    bodies = rel_list("body")
    faces = rel_list("face", exclude=("expresiones.png",))
    variants = hair_variants()

    if len(bodies) != 12:
        failures.append(f"body: se esperaban 12 cuerpos, hay {len(bodies)}")
    if len(faces) != 12:
        failures.append(f"face: se esperaban 12 caras, hay {len(faces)}")
    if len(variants) != 21:
        failures.append(f"hair: se esperaban 21 variantes, hay {len(variants)}")

    body_ref = check_sheet(BODY_REF, ALL_ROWS, failures, MIN_FRAME_PIXELS)
    for b in bodies:
        check_sheet(b, ALL_ROWS, failures, MIN_FRAME_PIXELS)
    for f in faces:
        check_sheet(f, FRONT_SIDE_ROWS, failures, MIN_FACE_PIXELS)

    for variant in variants:
        back = check_sheet(f"hair/hair_{variant}_back.png", ALL_ROWS, failures, MIN_FRAME_PIXELS)
        front = check_sheet(f"hair/hair_{variant}_front.png", FRONT_SIDE_ROWS, failures, MIN_FRAME_PIXELS)
        if body_ref is not None and back is not None:
            check_hair_alignment(body_ref, f"hair/hair_{variant}_back.png", back, ALL_ROWS, failures)
        if body_ref is not None and front is not None:
            check_hair_alignment(body_ref, f"hair/hair_{variant}_front.png", front, FRONT_SIDE_ROWS, failures)

    if args.preview:
        make_preview(Path(args.preview).resolve(), faces, variants[:5])

    if failures:
        for f in failures[:60]:
            print(f"FAIL: {f}")
        if len(failures) > 60:
            print(f"... (+{len(failures) - 60} fallos mas)")
        print(f"RESULTADO: {len(failures)} fallos")
        return 1
    print(f"RESULTADO: OK — 66 hojas modulares validas (2x)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
