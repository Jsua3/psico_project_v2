#!/usr/bin/env python3
"""Genera una captura PNG de un fragmento de código con números de línea reales.

Uso: codeshot.py ARCHIVO DESDE HASTA SALIDA.png [--title T] [--hl 10,11,20-25] [--lang python]
"""
import argparse
import os
import sys

from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.formatters.img import FontNotFound
from pygments.lexers import get_lexer_by_name, guess_lexer_for_filename
from PIL import Image, ImageDraw, ImageFont

# Primera opción: DejaVu (Linux, como en las capturas de P-01 a P-06). Alternativas para Windows.
FONT_CANDIDATES = ["DejaVu Sans Mono", "Consolas", "Courier New"]
BOLD_FONT_FILES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "consolab.ttf"),
    os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "courbd.ttf"),
]


def make_formatter(**kwargs):
    """Crea el ImageFormatter con la primera fuente monoespaciada disponible."""
    for name in FONT_CANDIDATES:
        try:
            return ImageFormatter(font_name=name, **kwargs)
        except FontNotFound:
            continue
    raise SystemExit("No se encontró ninguna fuente monoespaciada: " + ", ".join(FONT_CANDIDATES))


def load_bold_font(size):
    for path in BOLD_FONT_FILES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def parse_hl(spec):
    out = []
    for part in filter(None, (spec or "").split(",")):
        if "-" in part:
            a, b = part.split("-")
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("start", type=int)
    ap.add_argument("end", type=int)
    ap.add_argument("out")
    ap.add_argument("--title", default="")
    ap.add_argument("--hl", default="")
    ap.add_argument("--lang", default="")
    a = ap.parse_args()

    lines = open(a.file, encoding="utf-8").read().split("\n")
    chunk = "\n".join(lines[a.start - 1:a.end])
    lexer = get_lexer_by_name(a.lang) if a.lang else guess_lexer_for_filename(a.file, chunk)
    hl = [n - a.start + 1 for n in parse_hl(a.hl) if a.start <= n <= a.end]
    fmt = make_formatter(font_size=17, line_numbers=True, line_number_start=a.start,
                         line_number_bg="#f0f0f0", line_number_fg="#777777", line_pad=4,
                         hl_lines=hl, hl_color="#fff3b0", style="default", image_pad=14)
    png = highlight(chunk, lexer, fmt)
    tmp = a.out + ".tmp.png"
    open(tmp, "wb").write(png)
    img = Image.open(tmp).convert("RGB")
    if a.title:
        font = load_bold_font(17)
        bar_h = 36
        canvas = Image.new("RGB", (max(img.width, 700), img.height + bar_h), "white")
        d = ImageDraw.Draw(canvas)
        d.rectangle([0, 0, canvas.width, bar_h], fill="#24292f")
        d.text((14, 8), a.title, fill="white", font=font)
        canvas.paste(img, (0, bar_h))
        img = canvas
    img.save(a.out)
    os.remove(tmp)
    print(a.out, img.size)


if __name__ == "__main__":
    sys.exit(main())
