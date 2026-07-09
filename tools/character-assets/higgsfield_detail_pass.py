"""Puerta de control de calidad (QC) para pasadas de detalle con Higgsfield.

La pasada de detalle es OPCIONAL: solo se acepta un resultado de IA si NO deriva
la silueta del arte determinista. Este modulo provee la puerta; las llamadas a
Higgsfield (flux_kontext / remove_background) las orquesta el operador via MCP y
alimenta aqui el resultado ya re-pixelado.

Criterios (todos deben pasar):
  - IoU de mascara opaca por tile >= 0.90 (preserva la silueta / registro),
  - borde de la hoja limpio (0 px opacos),
  - paleta <= 32 colores.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

IOU_MIN = 0.90
PALETTE_MAX = 32
ALPHA_THRESHOLD = 8


def _mask(arr: np.ndarray) -> np.ndarray:
    return arr[:, :, 3] > ALPHA_THRESHOLD


def iou(a: np.ndarray, b: np.ndarray) -> float:
    ma, mb = _mask(a), _mask(b)
    inter = np.logical_and(ma, mb).sum()
    union = np.logical_or(ma, mb).sum()
    return float(inter / union) if union else 1.0


def palette_count(img: Image.Image) -> int:
    rgb = np.array(img.convert("RGB")).reshape(-1, 3)
    # solo pixeles opacos
    a = np.array(img.convert("RGBA"))[:, :, 3].reshape(-1)
    rgb = rgb[a > ALPHA_THRESHOLD]
    return len(np.unique(rgb, axis=0)) if len(rgb) else 0


def border_opaque(img: Image.Image) -> int:
    a = np.array(img.convert("RGBA"))[:, :, 3]
    border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
    return int((border > ALPHA_THRESHOLD).sum())


def qc_gate(base_path: Path, cand_path: Path, tiles=(1, 1)) -> tuple[bool, list[str]]:
    base = np.array(Image.open(base_path).convert("RGBA"))
    cand = np.array(Image.open(cand_path).convert("RGBA"))
    report: list[str] = []
    ok = True

    if base.shape != cand.shape:
        return False, [f"tamano distinto: base {base.shape} vs cand {cand.shape}"]

    tr, tc = tiles
    h, w = base.shape[:2]
    th, tw = h // tr, w // tc
    min_iou = 1.0
    for r in range(tr):
        for c in range(tc):
            ba = base[r * th:(r + 1) * th, c * tw:(c + 1) * tw]
            ca = cand[r * th:(r + 1) * th, c * tw:(c + 1) * tw]
            v = iou(ba, ca)
            min_iou = min(min_iou, v)
    report.append(f"IoU min por tile = {min_iou:.3f} (>= {IOU_MIN}: {'OK' if min_iou >= IOU_MIN else 'FALLA'})")
    ok = ok and min_iou >= IOU_MIN

    border = border_opaque(Image.open(cand_path))
    report.append(f"borde opaco = {border} px ({'OK' if border == 0 else 'FALLA'})")
    ok = ok and border == 0

    pal = palette_count(Image.open(cand_path))
    report.append(f"paleta = {pal} colores (<= {PALETTE_MAX}: {'OK' if pal <= PALETTE_MAX else 'FALLA'})")
    ok = ok and pal <= PALETTE_MAX

    return ok, report


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("uso: higgsfield_detail_pass.py BASE.png CAND.png [rows cols]")
        sys.exit(2)
    tiles = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) >= 5 else (1, 1)
    ok, report = qc_gate(Path(sys.argv[1]), Path(sys.argv[2]), tiles)
    for line in report:
        print(line)
    print("QC:", "ACEPTADO" if ok else "DESCARTADO")
    sys.exit(0 if ok else 1)
