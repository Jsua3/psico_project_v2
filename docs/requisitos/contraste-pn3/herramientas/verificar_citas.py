#!/usr/bin/env python3
"""Comprueba que cada cita `ruta:línea` de los veredictos exista en el repositorio y caiga dentro del archivo.

Uso:
    python -I verificar_citas.py --veredictos ../datos/veredictos.json --raiz D:/ruta/al/repositorio

No juzga si la línea «dice lo que se afirma» (eso es trabajo de los lentes de contraste): solo detecta citas
inventadas o desplazadas. Clasifica cada cita única en:
    resuelta     el archivo existe y la línea cae dentro de él
    abreviada    la ruta no existe tal cual pero un único archivo del repositorio termina en ella
    externa      pertenece a una biblioteca de terceros (no verificable en el repositorio)
    sin archivo  ningún archivo coincide, o hay varios candidatos
    fuera rango  el archivo existe pero la línea citada lo excede
Sale con código 1 si hay alguna «sin archivo» o «fuera rango».
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

RUTA = re.compile(r"([\w.\-]+(?:/[\w.\-\[\]]+)+\.\w+):(\d+)(?:-(\d+))?")
EXTERNAS = ("rest_framework_simplejwt/", "rest_framework/", "django/", "psycopg/", "phaser/", "@angular/", "node_modules/", "site-packages/")
IGNORAR = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", ".angular", "test-results"}


def indexar(raiz: Path):
    """Índice {nombre_de_archivo: [rutas relativas]} del repositorio, sin carpetas generadas."""
    idx = {}
    for dp, dn, fn in os.walk(raiz):
        dn[:] = [d for d in dn if d not in IGNORAR]
        for f in fn:
            rel = (Path(dp) / f).relative_to(raiz).as_posix()
            idx.setdefault(f, []).append(rel)
    return idx


def citas(registro):
    for c in registro.get("clausulas", []):
        for e in c.get("evidencia", []):
            yield e
    for rv in registro.get("revisiones", []):
        for e in rv.get("evidencia", []):
            yield e


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--veredictos", required=True, type=Path)
    ap.add_argument("--raiz", required=True, type=Path)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    datos = json.loads(a.veredictos.read_text(encoding="utf-8"))
    idx = indexar(a.raiz)
    largo = {}

    def lineas(rel):
        if rel not in largo:
            largo[rel] = sum(1 for _ in (a.raiz / rel).open("rb"))
        return largo[rel]

    cuenta = {"resuelta": 0, "abreviada": 0, "externa": 0}
    sin_archivo, fuera_rango, abreviadas, vistos = [], [], [], set()
    for reg in datos:
        for texto in citas(reg):
            for m in RUTA.finditer(texto):
                ruta, ini, fin = m.group(1), int(m.group(2)), m.group(3)
                fin = int(fin) if fin else ini
                clave = (reg["id"], ruta, ini, fin)
                if clave in vistos:
                    continue
                vistos.add(clave)
                rel = None
                if (a.raiz / ruta).is_file():
                    rel, tipo = ruta, "resuelta"
                elif ruta.startswith(EXTERNAS):
                    cuenta["externa"] += 1
                    continue
                else:
                    cand = [r for r in idx.get(ruta.rsplit("/", 1)[-1], []) if r == ruta or r.endswith("/" + ruta)]
                    if len(cand) == 1:
                        rel, tipo = cand[0], "abreviada"
                        abreviadas.append((reg["id"], ruta, cand[0]))
                    else:
                        sin_archivo.append((reg["id"], f"{ruta}:{ini}", len(cand)))
                        continue
                if max(ini, fin) > lineas(rel):
                    fuera_rango.append((reg["id"], f"{rel}:{ini}-{fin}", lineas(rel)))
                else:
                    cuenta[tipo] += 1
    total = len(vistos)
    print(f"citas únicas: {total} | resueltas: {cuenta['resuelta']} | abreviadas: {cuenta['abreviada']} | "
          f"externas: {cuenta['externa']} | sin archivo: {len(sin_archivo)} | fuera de rango: {len(fuera_rango)}")
    for id_, c, n in sin_archivo:
        print(f"  [sin archivo{' (ambigua: %d candidatos)' % n if n else ''}] {id_}: {c}")
    for id_, c, n in fuera_rango:
        print(f"  [fuera de rango] {id_}: {c} (el archivo tiene {n} líneas)")
    if abreviadas:
        vistas = sorted({(r, c) for _, r, c in abreviadas})
        print(f"  abreviadas resueltas ({len(vistas)} rutas distintas): " + "; ".join(f"{r} -> {c}" for r, c in vistas[:12]))
    sys.exit(1 if (sin_archivo or fuera_rango) else 0)


if __name__ == "__main__":
    main()
