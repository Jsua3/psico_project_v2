#!/usr/bin/env python3
"""Genera la trazabilidad requisito → pruebas y código desde marcadores `req`, y el plan de marcado inicial.

Uso (con `-I` Python ignora el directorio actual):

    python -I generar_trazabilidad.py --raiz ../../../.. \
        --veredictos ../../contraste-pn3/datos/veredictos.json --salida .. --fecha 2026-10-11

Marcadores que reconoce (ver ../README.md):
    Python    @pytest.mark.req("RN-07", "RN-06")      |  # req: RN-07, RN-06
    TypeScript describe('RN-07 · ...')  it('[RN-07] ...')  |  // req: RN-07
    Código    # req: RN-08  |  // req: RN-08         (el sitio de la implementación)

Salidas en --salida:
    trazabilidad.md      una fila por ID: veredicto del contraste, pruebas y código marcados, estado
    plan-de-marcado.md   las pruebas que los evaluadores del contraste ya identificaron para cada ID
                         (existen o no) con el marcador sugerido; es el trabajo mecánico de adopción

No modifica pruebas ni código: solo lee el repositorio y escribe las dos salidas.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ID_RE = r"(?:SIEP-)?(?:RF|RNF|RN|CU)(?:-[CEFGJ0])?-\d{2,3}"
ID = re.compile(rf"\b({ID_RE})\b")
PY_MARK = re.compile(r"pytest\.mark\.req\(([^)]*)\)")
COMENTARIO = re.compile(r"(?:#|//)\s*req:\s*(.+?)\s*$")
TITULO = re.compile(r"\b(?:describe|it|test)(?:\.each\([^)]*\))?\(\s*(['\"`])(.+?)\1")
TITULO_ID = re.compile(rf"^\s*\[?({ID_RE})\]?\s*(?:[·:\-–—]|\b)")
IGNORAR = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", ".angular", "test-results", "coverage"}
PATRONES_PRUEBA = [
    ("backend_django", "test_*.py"), ("backend_django", "*_test.py"),
    ("frontend/src", "*.spec.ts"), ("frontend/e2e", "*.ts"), ("frontend/e2e", "*.mjs"),
    ("scripts", "*.test.mjs"), ("scripts", "api-e2e.mjs"),
]
CODIGO = [("backend_django", "*.py"), ("frontend/src", "*.ts")]
LIMITE = {"RF": 26, "RNF": 8, "RN": 11, "CU": 15}


def archivos(raiz: Path, base: str, patron: str):
    ini = raiz / base
    if not ini.exists():
        return
    for dp, dn, fn in os.walk(ini):
        dn[:] = [d for d in dn if d not in IGNORAR]
        for f in fn:
            p = Path(dp) / f
            if p.match(patron):
                yield p


def ids_en(texto):
    return [m.group(1) for m in ID.finditer(texto)]


def marcadores(path: Path, raiz: Path):
    """Devuelve [(linea, [ids], tipo)] con tipo 'marca' (pytest.mark.req o comentario req:) o 'titulo'."""
    salida = []
    try:
        lineas = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return salida
    for n, ln in enumerate(lineas, 1):
        m = PY_MARK.search(ln)
        if m:
            salida.append((n, ids_en(m.group(1)), "marca"))
            continue
        m = COMENTARIO.search(ln)
        if m:
            salida.append((n, ids_en(m.group(1)), "marca"))
            continue
        m = TITULO.search(ln)
        if m:
            t = m.group(2)
            c = re.findall(rf"\[({ID_RE})\]", t)
            if not c:
                p = TITULO_ID.match(t)
                c = [p.group(1)] if p else []
            if c:
                salida.append((n, c, "titulo"))
    return [s for s in salida if s[1]]


def celda(t, n=None):
    t = " ".join(str(t or "").split()).replace("|", "\\|")
    return t if not n or len(t) <= n else t[: n - 1].rstrip() + "…"


HUECO = re.compile(r"^(sin|no hay|no existe|no existen|ninguna|ningun|ningún|falta|ausen|tampoco)\b", re.I)


def verificar_prueba(raiz: Path, entrada: str):
    """Clasifica una entrada de `pruebas_existentes`.

    Devuelve (clase, ruta, detalle) con clase en:
      hueco      la entrada declara que NO hay prueba («Sin prueba de…»); es un dato valioso, no una prueba
      prueba     `ruta::nombre` y el archivo contiene ese nombre
      lineas     el archivo existe y la entrada señala un rango de líneas o una descripción (no se verifica el nombre)
      sin_nombre el archivo existe pero el nombre de la prueba no aparece
      sin_archivo el archivo no existe
      libre      texto sin ruta reconocible
    """
    e = entrada.strip()
    if HUECO.match(e):
        return "hueco", None, e
    m = re.match(r"^([\w./\-\[\]]+\.(?:py|ts|mjs|js|yml|yaml))\s*(.*)$", e)
    if not m:
        return "libre", None, e
    ruta, resto = m.group(1), m.group(2).strip()
    p = raiz / ruta
    if not p.is_file():
        return "sin_archivo", ruta, resto
    if not resto:
        return "lineas", ruta, ""
    nom = re.match(r"^(?:::|›|#)\s*([A-Za-z_]\w*)", resto)
    if nom:
        nombre = nom.group(1)
        texto = p.read_text(encoding="utf-8", errors="replace")
        ok = re.search(rf"\b(?:def|function|const|it|test|describe)\b[^\n]*{re.escape(nombre)}", texto) is not None or nombre in texto
        return ("prueba" if ok else "sin_nombre"), ruta, nombre
    return "lineas", ruta, resto


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", required=True, type=Path)
    ap.add_argument("--veredictos", required=True, type=Path)
    ap.add_argument("--salida", required=True, type=Path)
    ap.add_argument("--fecha", required=True)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    raiz = a.raiz.resolve()

    reqs = json.loads(a.veredictos.read_text(encoding="utf-8"))
    por_id = {r["id"]: r for r in reqs}

    pruebas, codigo = defaultdict(list), defaultdict(list)
    vistos_prueba = set()
    for base, patron in PATRONES_PRUEBA:
        for p in archivos(raiz, base, patron):
            if p in vistos_prueba:
                continue
            vistos_prueba.add(p)
            rel = p.relative_to(raiz).as_posix()
            for n, ids, tipo in marcadores(p, raiz):
                for i in ids:
                    pruebas[i].append(f"{rel}:{n}")
    for base, patron in CODIGO:
        for p in archivos(raiz, base, patron):
            if p in vistos_prueba or p.name.startswith("test_") or p.name.endswith(".spec.ts") or "/tests/" in p.as_posix():
                continue
            rel = p.relative_to(raiz).as_posix()
            for n, ids, tipo in marcadores(p, raiz):
                if tipo == "marca":
                    for i in ids:
                        codigo[i].append(f"{rel}:{n}")

    desconocidos = sorted(i for i in set(pruebas) | set(codigo) if i not in por_id and not i.startswith("SIEP-"))
    desconocidos += sorted(i for i in set(pruebas) | set(codigo)
                           if i.startswith("SIEP-") is False and i in por_id and False)

    L = ["# Trazabilidad requisito → pruebas y código", "",
         f"> Generada el {a.fecha} por `herramientas/generar_trazabilidad.py` desde los marcadores `req` del repositorio "
         "y el veredicto de [`contraste-pn3`](../contraste-pn3/matriz-cumplimiento.md). Convención en [`README.md`](README.md). "
         "No se edita a mano.", ""]
    marcados = [i for i in por_id if pruebas.get(i)]
    L += ["## Resumen", "",
          f"- IDs de la línea base: {len(por_id)} · con al menos una prueba marcada: **{len(marcados)}** · "
          f"con código marcado: {sum(1 for i in por_id if codigo.get(i))}.",
          f"- Ítems «cumple» sin prueba marcada: **{sum(1 for r in reqs if r['veredicto_final'] == 'cumple' and not pruebas.get(r['id']))}** "
          f"de {sum(1 for r in reqs if r['veredicto_final'] == 'cumple')}.",
          f"- Marcadores con un ID que no está en la línea base ni en el catálogo `SIEP-*`: {len(desconocidos)}"
          + (f" ({', '.join(desconocidos[:8])})" if desconocidos else "") + ".", ""]
    L += ["## Matriz", "", "| ID | Nombre | Veredicto | Pruebas marcadas | Código marcado | Estado |", "|---|---|---|---|---|---|"]
    for r in reqs:
        i = r["id"]
        p, c = pruebas.get(i, []), codigo.get(i, [])
        if p:
            estado = "con prueba"
        elif r["veredicto_final"] == "cumple":
            estado = "**cumple sin prueba marcada**"
        else:
            estado = "sin prueba marcada"
        L.append("| " + " | ".join([
            i, celda(r["nombre"], 48), r["veredicto_final"],
            (f"{len(p)}: " + ", ".join(f"`{x}`" for x in p[:2]) + (" …" if len(p) > 2 else "")) if p else "0",
            ", ".join(f"`{x}`" for x in c[:2]) if c else "—", estado]) + " |")
    (a.salida / "trazabilidad.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")

    # plan de marcado: las pruebas que los evaluadores ya identificaron
    P = ["# Plan de marcado inicial", "",
         f"> Generado el {a.fecha}. Cada fila es una prueba que un evaluador del contraste señaló como respaldo de un "
         "requisito (`pruebas_existentes` de `contraste-pn3/datos/veredictos.json`). «Existe» comprueba el archivo y el "
         "nombre en el árbol actual. Adoptar la convención = añadir el marcador sugerido a esas pruebas; es un cambio "
         "mecánico y sin efecto en el comportamiento.", ""]
    cuenta = defaultdict(int)
    filas, huecos = [], []
    for r in reqs:
        for e in r.get("pruebas_existentes", []):
            clase, ruta, detalle = verificar_prueba(raiz, e)
            cuenta[clase] += 1
            if clase == "hueco":
                huecos.append((r["id"], r["veredicto_final"], detalle))
                continue
            if ruta and ruta.endswith(".py"):
                sug = f'@pytest.mark.req("{r["id"]}")'
            elif ruta:
                sug = f"describe/it con «[{r['id']}]» al inicio del título"
            else:
                sug = "—"
            estado = {"prueba": "sí (nombre verificado)", "lineas": "sí (archivo; por líneas)",
                      "sin_nombre": "archivo sí, nombre no", "sin_archivo": "no existe el archivo", "libre": "sin ruta"}[clase]
            filas.append((r["id"], ruta or celda(e, 70), detalle, estado, sug))
    pruebas_n = sum(v for k, v in cuenta.items() if k != "hueco")
    P += [f"- Entradas de los evaluadores: **{sum(cuenta.values())}** · pruebas señaladas: **{pruebas_n}** "
          f"(nombre verificado: {cuenta['prueba']}; archivo existe, por líneas: {cuenta['lineas']}; "
          f"archivo sí y nombre no: {cuenta['sin_nombre']}; archivo inexistente: {cuenta['sin_archivo']}; "
          f"sin ruta: {cuenta['libre']}) · **huecos declarados: {cuenta['hueco']}**.", "",
          "## Pruebas a marcar", "",
          "| ID | Archivo | Prueba o líneas | Existe | Marcador sugerido |", "|---|---|---|---|---|"]
    for f in filas:
        P.append(f"| {f[0]} | `{celda(f[1], 90)}` | {celda(f[2], 60)} | {f[3]} | {celda(f[4], 60)} |")
    P += ["", "## Huecos de prueba que señalaron los evaluadores", "",
          "Cada fila es una prueba que **no existe** y que el evaluador echó en falta; son la lista de partida para escribir "
          "pruebas nuevas (con TDD) al cerrar las brechas del contraste.", "",
          "| ID | Veredicto | Hueco |", "|---|---|---|"]
    for i, v, t in huecos:
        P.append(f"| {i} | {v} | {celda(t, 170)} |")
    (a.salida / "plan-de-marcado.md").write_text("\n".join(P) + "\n", encoding="utf-8", newline="\n")

    print(f"marcadores de prueba: {sum(len(v) for v in pruebas.values())} | de código: {sum(len(v) for v in codigo.values())} | "
          f"IDs con prueba: {len(marcados)}/{len(por_id)}")
    print(f"plan de marcado: {pruebas_n} pruebas señaladas ({cuenta['prueba']} verificadas por nombre, {cuenta['lineas']} por líneas, "
          f"{cuenta['sin_nombre']} sin nombre, {cuenta['sin_archivo']} sin archivo) y {cuenta['hueco']} huecos")


if __name__ == "__main__":
    main()
