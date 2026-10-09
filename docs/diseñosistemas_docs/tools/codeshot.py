#!/usr/bin/env python3
"""Genera una captura PNG de un fragmento de código con números de línea reales.

Uso: codeshot.py ARCHIVO DESDE HASTA SALIDA.png [--title T] [--hl 10,11,20-25] [--lang python]
"""
import argparse
import sys

from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer_for_filename
from PIL import Image, ImageDraw, ImageFont

FONT = "DejaVu Sans Mono"


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
    fmt = ImageFormatter(font_name=FONT, font_size=17, line_numbers=True, line_number_start=a.start,
                         line_number_bg="#f0f0f0", line_number_fg="#777777", line_pad=4,
                         hl_lines=hl, hl_color="#fff3b0", style="default", image_pad=14)
    png = highlight(chunk, lexer, fmt)
    tmp = a.out + ".tmp.png"
    open(tmp, "wb").write(png)
    img = Image.open(tmp).convert("RGB")
    if a.title:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 17)
        bar_h = 36
        canvas = Image.new("RGB", (max(img.width, 700), img.height + bar_h), "white")
        d = ImageDraw.Draw(canvas)
        d.rectangle([0, 0, canvas.width, bar_h], fill="#24292f")
        d.text((14, 8), a.title, fill="white", font=font)
        canvas.paste(img, (0, bar_h))
        img = canvas
    img.save(a.out)
    import os
    os.remove(tmp)
    print(a.out, img.size)


if __name__ == "__main__":
    sys.exit(main())
