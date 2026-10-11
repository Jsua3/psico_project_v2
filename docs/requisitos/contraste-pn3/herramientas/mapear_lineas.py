#!/usr/bin/env python3
"""Traduce citas `ruta:línea` de un árbol anterior a otro posterior usando `git diff`.

Las citas del contraste son del árbol donde se evaluó. Cuando un PR cambia un archivo citado, las líneas se
desplazan. Esta herramienta calcula dónde cae hoy cada línea citada y marca las que quedaron dentro de un trozo
modificado (esas hay que releerlas a mano).

Uso (desde cualquier carpeta; con `-I` Python ignora el directorio actual):

    python -I mapear_lineas.py --repo ../../../.. --antes 700904f --despues origin/master \
        backend_django/apps/simulation/services/game_service.py:360 backend_django/apps/reportes/services.py:155-168

Cada argumento es `ruta:línea` o `ruta:desde-hasta`. La ruta puede abreviarse (`game_service.py`) si un solo
archivo cambiado termina en ella. Imprime `antes -> después` y `[REVISAR]` si la línea cayó en un trozo cambiado.
"""
import argparse
import re
import subprocess
import sys

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
CITA = re.compile(r"^(.+?):(\d+)(?:-(\d+))?$")


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, encoding="utf-8")
    return r.stdout


def hunks(repo, antes, despues, ruta):
    """[(old_start, old_len, new_start, new_len)] de un archivo."""
    salida = []
    for ln in git(repo, "diff", "-U0", antes, despues, "--", ruta).splitlines():
        m = HUNK.match(ln)
        if m:
            os_, ol, ns, nl = m.groups()
            salida.append((int(os_), int(ol) if ol is not None else 1, int(ns), int(nl) if nl is not None else 1))
    return salida


def mapear(h, n):
    """Devuelve (línea_nueva, tocada). `tocada` = la línea cae en un trozo modificado."""
    delta = 0
    for os_, ol, ns, nl in h:
        # trozo de inserción pura (ol == 0): el diff reporta la línea ANTERIOR a la inserción
        ini = os_ + 1 if ol == 0 else os_
        fin = os_ if ol == 0 else os_ + ol - 1
        if n < ini:
            break
        if ini <= n <= fin:
            return ns, True
        delta += nl - ol
    return n + delta, False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--antes", required=True)
    ap.add_argument("--despues", required=True)
    ap.add_argument("citas", nargs="+")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cambiados = [p for p in git(a.repo, "diff", "--name-only", a.antes, a.despues).splitlines() if p]
    for c in a.citas:
        m = CITA.match(c)
        if not m:
            print(f"{c}  ->  (formato no reconocido)")
            continue
        ruta, d, h_ = m.group(1), int(m.group(2)), m.group(3)
        h_ = int(h_) if h_ else None
        cand = [p for p in cambiados if p == ruta or p.endswith("/" + ruta)]
        if len(cand) != 1:
            estado = "sin cambios en ese archivo" if not cand else f"ambigua: {cand}"
            print(f"{c}  ->  {c}  ({estado})")
            continue
        hk = hunks(a.repo, a.antes, a.despues, cand[0])
        nd, td = mapear(hk, d)
        if h_ is None:
            print(f"{c}  ->  {cand[0]}:{nd}" + ("  [REVISAR]" if td else ""))
        else:
            nh, th = mapear(hk, h_)
            print(f"{c}  ->  {cand[0]}:{nd}-{nh}" + ("  [REVISAR]" if td or th else ""))


if __name__ == "__main__":
    main()
