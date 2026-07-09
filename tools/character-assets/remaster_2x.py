"""Reconstruccion 2x de las piezas modulares del personaje.

- Caras: ensambladas desde el arte huerfano expressions/{expr}_{front,right}.png,
  ancladas a la cabeza del cuerpo de referencia.
- Cuerpos / cabellos: re-masterizacion determinista del sheet legacy escalado 2x
  (preserva el registro de los 9 frames por construccion).

Lee de  frontend/src/assets/characters/modular-legacy/
Escribe en frontend/src/assets/characters/modular/

Uso:
  python remaster_2x.py --faces | --bodies | --hair | --all [--preview]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "frontend" / "src" / "assets" / "characters" / "modular-legacy"
OUT = ROOT / "frontend" / "src" / "assets" / "characters" / "modular"
SCRATCH = Path(r"C:/Users/Predator/AppData/Local/Temp/claude/D--Sua-Files-IdeaProjects-psico-project-v3/bc2395df-ad9f-4e3d-b6bb-c8284645b6f8/scratchpad")

FW1, FH1 = 64, 96
FW2, FH2 = 128, 192
SHEET2 = (FW2 * 3, FH2 * 3)   # 384 x 576

# 12 expresiones (mismos ids que avatar.model.ts EXPRESSIONS / face_{id}.png)
EXPRESSIONS = ["neutral", "happy", "sad", "angry", "surprised", "worried",
               "sleepy", "wink", "crying", "embarrassed", "laughing", "confused"]

BODY_REF = "body/body_orientadora_purple.png"


def opaque_bbox(arr: np.ndarray):
    m = arr[:, :, 3] > 8
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def head_anchor() -> dict:
    """Mide la cabeza del cuerpo de referencia (frame frontal) en coords 2x."""
    b = np.array(Image.open(LEGACY / BODY_REF).convert("RGBA"))
    fr = b[0:FH1, 0:FW1]
    m = fr[:, :, 3] > 8
    # cabeza = desde el top del bbox hasta donde se ensancha a hombros
    bb = opaque_bbox(fr)
    top = bb[1]
    # cuello: primera fila (bajando desde top+8) cuyo ancho supera 22 (hombros)
    neck = top
    for y in range(top, FH1):
        xs = np.nonzero(m[y])[0]
        w = (xs.max() - xs.min() + 1) if len(xs) else 0
        if w > 22:
            neck = y
            break
    cx = (bb[0] + bb[2]) / 2
    return {
        "cx2": cx * 2,
        "head_top2": top * 2,
        "head_bottom2": neck * 2,
    }


# ---------------- CARAS ----------------

def place_face(pose_path: Path, target_w: int, cx2: float, top_y2: float) -> Image.Image:
    """Escala la carita a target_w (preservando aspecto), la ancla por su borde
    superior en (cx2 centrado, top_y2) y la compone sobre un frame 128x192."""
    face = Image.open(pose_path).convert("RGBA")
    bb = opaque_bbox(np.array(face))
    face = face.crop((bb[0], bb[1], bb[2] + 1, bb[3] + 1))
    w, h = face.size
    scale = target_w / w
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))
    face = face.resize((new_w, new_h), Image.NEAREST)
    frame = Image.new("RGBA", (FW2, FH2), (0, 0, 0, 0))
    x = int(round(cx2 - new_w / 2))
    y = int(round(top_y2))
    frame.alpha_composite(face, (x, y))
    return frame


def build_faces(anchor: dict, front_w=40, side_w=24, front_top=None, side_top=None) -> None:
    exp_dir = LEGACY / "face" / "expressions"
    # Por defecto: rasgos centrados sobre la cabeza (top + 14px 2x, calibrado visual).
    ftop = front_top if front_top is not None else anchor["head_top2"] + 14
    stop = side_top if side_top is not None else anchor["head_top2"] + 13
    (OUT / "face").mkdir(parents=True, exist_ok=True)
    for expr in EXPRESSIONS:
        sheet = Image.new("RGBA", SHEET2, (0, 0, 0, 0))
        front = place_face(exp_dir / f"{expr}_front.png", front_w, anchor["cx2"], ftop)
        side = place_face(exp_dir / f"{expr}_right.png", side_w, anchor["cx2"], stop)
        for col in range(3):
            sheet.alpha_composite(front, (col * FW2, 0))          # fila 0 frente
            sheet.alpha_composite(side, (col * FW2, FH2))         # fila 1 lado
        # fila 2 (espalda) vacia
        sheet.save(OUT / "face" / f"face_{expr}.png")
        print(f"face_{expr}.png")


def face_preview(anchor: dict, out: Path) -> None:
    """Compone cada cara sobre el cuerpo de referencia escalado 2x (fila frente+lado)."""
    body = Image.open(LEGACY / BODY_REF).convert("RGBA").resize(SHEET2, Image.NEAREST)
    scale = 2
    cols = 6
    rows = (len(EXPRESSIONS) + cols - 1) // cols
    tw, th = FW2 * scale, FH2 * scale
    canvas = Image.new("RGBA", (tw * cols, (th + 18) * rows * 1 + 4), (22, 18, 34, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(canvas)
    for i, expr in enumerate(EXPRESSIONS):
        face = Image.open(OUT / "face" / f"face_{expr}.png").convert("RGBA")
        comp = Image.new("RGBA", SHEET2, (0, 0, 0, 0))
        comp.alpha_composite(body)
        comp.alpha_composite(face)
        tile = comp.crop((0, 0, FW2, FH2)).resize((tw, th), Image.NEAREST)  # frame frente
        r, c = divmod(i, cols)
        x, y = c * tw, r * (th + 18)
        canvas.alpha_composite(tile, (x, y))
        d.text((x + 4, y + th + 2), expr, fill=(220, 220, 235, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out)
    print(f"preview -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faces", action="store_true")
    ap.add_argument("--bodies", action="store_true")
    ap.add_argument("--hair", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--front-w", type=int, default=40)
    ap.add_argument("--side-w", type=int, default=24)
    ap.add_argument("--front-top", type=float, default=None)
    ap.add_argument("--side-top", type=float, default=None)
    args = ap.parse_args()

    anchor = head_anchor()
    print("anchor:", anchor)

    if args.faces or args.all:
        build_faces(anchor, args.front_w, args.side_w, args.front_top, args.side_top)
        if args.preview:
            face_preview(anchor, SCRATCH / "faces_preview.png")


if __name__ == "__main__":
    main()
