#!/usr/bin/env python3
"""Cruza las secciones «Ubicación respecto de la línea base» de los documentos C, E, F, G y J.

Uso:
    python -I generar_impacto.py --carpeta .. --base ../../baseline-pn3 --salida .. --fecha 2026-10-11

Genera `impacto-en-la-linea-base.md`: por cada ID de la línea base tocado por alguna propuesta, qué relación
declara cada bloque (extiende, reutiliza, tensiona, contradice, independiente...). Es lectura mecánica de la
sección 2 de cada `bloque-?-requisitos.md`; no añade juicio.
"""
import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

TIPOS = ["RF", "RNF", "RN", "CU"]
ID = re.compile(r"(?<![\w-])(RF|RNF|RN|CU)-(\d{2})\b(?!\.\.)")          # sin prefijo SIEP-
RANGO = re.compile(r"(?<![\w-])(RF|RNF|RN|CU)-(\d{2})\.\.(?:(?:RF|RNF|RN|CU)-)?(\d{2})\b")
FUERTES = ("tensiona", "contradice")


def nombres(base: Path):
    out = {}
    for md in sorted(base.glob("0[1-4]-*.md")):
        for ln in md.read_text(encoding="utf-8").splitlines():
            if not ln.startswith("| "):
                continue
            c = [x.strip() for x in ln.strip().strip("|").split("|")]
            if re.match(r"^(RF|RNF|RN|CU)-\d+$", c[0]):
                out[c[0]] = c[2] if c[0].startswith(("RF", "RNF")) else c[1]
    return out


def seccion2(texto):
    m = re.search(r"^## 2\.", texto, flags=re.M)
    if not m:
        return ""
    fin = re.search(r"^## 3\.", texto[m.end():], flags=re.M)
    return texto[m.end(): m.end() + (fin.start() if fin else len(texto))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", required=True, type=Path)
    ap.add_argument("--base", required=True, type=Path)
    ap.add_argument("--salida", required=True, type=Path)
    ap.add_argument("--fecha", required=True)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    nom = nombres(a.base)
    mapa = defaultdict(dict)          # id -> {bloque: relacion}
    for f in sorted(a.carpeta.glob("bloque-?-requisitos.md")):
        bloque = f.name.split("-")[1].upper()
        for ln in seccion2(f.read_text(encoding="utf-8")).splitlines():
            if not ln.startswith("|") or re.match(r"^\|[-: |]+\|$", ln.strip()):
                continue
            c = [x.strip() for x in ln.strip().strip("|").split("|")]
            if len(c) < 2 or c[0].lower().startswith(("id ", "id de")):
                continue
            rel = re.sub(r"\s*\(.*?\)", "", c[1]).strip().lower()
            ids = set()
            for m in RANGO.finditer(c[0]):
                t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
                ids.update(f"{t}-{n:02d}" for n in range(i, j + 1))
            for m in ID.finditer(c[0]):
                ids.add(f"{m.group(1)}-{m.group(2)}")
            for i in ids:
                if i in nom:
                    mapa[i][bloque] = rel
    orden = sorted(mapa, key=lambda i: (TIPOS.index(i.split("-")[0]), int(i.split("-")[1])))
    L = ["# Impacto de las propuestas en la línea base", "",
         f"> Generado el {a.fecha} por `herramientas/generar_impacto.py` desde la sección 2 de `bloque-?-requisitos.md`. "
         "Lectura mecánica: cada celda es la relación que declara el documento del bloque. No se edita a mano.", ""]
    fric = [(i, b, r) for i in orden for b, r in mapa[i].items() if r.startswith(FUERTES)]
    L += ["## Puntos de fricción (tensiona o contradice)", "",
          "| ID | Nombre | Bloque | Relación |", "|---|---|---|---|"]
    for i, b, r in fric:
        L.append(f"| {i} | {nom[i]} | {b} | {r} |")
    L += ["", f"## Matriz completa ({len(orden)} IDs de la línea base tocados)", "",
          "| ID | Nombre | C | E | F | G | J | Bloques |", "|---|---|---|---|---|---|---|---:|"]
    for i in orden:
        fila = [mapa[i].get(b, "") for b in "CEFGJ"]
        L.append(f"| {i} | {nom[i]} | " + " | ".join(fila) + f" | {len(mapa[i])} |")
    sin = sorted((i for i in nom if i not in mapa), key=lambda i: (TIPOS.index(i.split("-")[0]), int(i.split("-")[1])))
    L += ["", f"## Sin tocar por ninguna propuesta ({len(sin)})", "", ", ".join(sin) if sin else "—"]
    (a.salida / "impacto-en-la-linea-base.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    print(f"IDs tocados: {len(orden)} | fricciones: {len(fric)} | sin tocar: {len(sin)}")


if __name__ == "__main__":
    main()
