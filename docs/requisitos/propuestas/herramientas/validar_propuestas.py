#!/usr/bin/env python3
"""Valida los documentos de requisitos de las propuestas C, E, F, G y J (calidad estructural, sin modelo).

Uso:
    python -I validar_propuestas.py --carpeta ..  [--catalogo ../../contraste-pn3/extensiones-siep.md]

Comprueba, por cada `bloque-?-requisitos.md` (y `fase-0-compartida.md`):
  * las 11 secciones numeradas están presentes;
  * un ID se DEFINE una sola vez: solo cuentan las filas de las secciones 3 a 6 (en la Fase 0, la tabla de
    requisitos); las demás tablas (criterios, riesgos...) solo lo referencian;
  * los IDs `SIEP-{RF,RNF,RN,CU}-X-nn` pertenecen al bloque del archivo y su número es 01..09;
  * cada RF, RNF y RN lleva prioridad Alta, Media o Baja y una columna Origen no vacía;
  * cada RF y RN se menciona en la sección 7 (criterios de aceptación);
  * los IDs SIEP del catálogo citados (p. ej. SIEP-RF-04) existen en extensiones-siep.md;
  * los IDs de la línea base citados existen (RF 01-26, RNF 01-08, RN 01-11, CU 01-15);
  * no hay literales con aspecto de secreto.
Sale con código 1 si hay errores; las advertencias no fallan.
"""
import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

ID = re.compile(r"\bSIEP-(RF|RNF|RN|CU)-([CEFGJ0])-(\d{2})\b")
CATALOGO = re.compile(r"\bSIEP-(RF|RNF|RN|CU)-(\d{2})\b")
BASE = re.compile(r"(?<![\w-])(RF|RNF|RN|CU)-(\d{2})(?!\d)")
LIMITE = {"RF": 26, "RNF": 8, "RN": 11, "CU": 15}
SECRETO = re.compile(r"(?i)(password|contraseña|secret|api[_-]?key)\s*[:=]\s*['\"][^'\"]{6,}['\"]|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,}")
PRIORIDADES = {"Alta", "Media", "Baja"}
MAX_LINEAS = 40


def cortes(texto):
    """Devuelve [(numero, inicio, fin)] de las secciones `## N.`."""
    marcas = [(int(m.group(1)), m.start()) for m in re.finditer(r"^## (\d{1,2})\.", texto, flags=re.M)]
    return [(n, ini, marcas[i + 1][1] if i + 1 < len(marcas) else len(texto)) for i, (n, ini) in enumerate(marcas)]


def filas(texto):
    for linea in texto.splitlines():
        if linea.startswith("|") and not re.match(r"^\|[-: |]+\|$", linea.strip()):
            yield [c.strip() for c in linea.strip().strip("|").split("|")]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", required=True, type=Path)
    ap.add_argument("--catalogo", type=Path)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    catalogo = set()
    if a.catalogo and a.catalogo.exists():
        catalogo = {f"SIEP-{m.group(1)}-{m.group(2)}" for m in CATALOGO.finditer(a.catalogo.read_text(encoding="utf-8"))}

    errores, avisos = [], []
    definidos = defaultdict(list)
    archivos = sorted(a.carpeta.glob("bloque-?-requisitos.md")) + sorted(a.carpeta.glob("fase-0-compartida.md"))
    if not archivos:
        print("no hay archivos para validar")
        sys.exit(1)

    for f in archivos:
        texto = f.read_text(encoding="utf-8")
        es_f0 = f.name.startswith("fase-0")
        bloque = "0" if es_f0 else f.name.split("-")[1].upper()
        if es_f0:
            m = re.search(r"^## Requisitos\s*$", texto, flags=re.M)
            fin = re.search(r"^## ", texto[m.end():], flags=re.M) if m else None
            zonas = [texto[m.end(): m.end() + fin.start()]] if m and fin else []
            s7 = ""
        else:
            cs = cortes(texto)
            numeros = {n for n, _, _ in cs}
            faltan = [n for n in range(1, 12) if n not in numeros]
            if faltan:
                errores.append(f"{f.name}: faltan las secciones {faltan}")
            zonas = [texto[i:j] for n, i, j in cs if n in (3, 4, 5, 6)]
            s7 = "".join(texto[i:j] for n, i, j in cs if n == 7)

        propios = []
        for z in zonas:
            for c in filas(z):
                m = ID.fullmatch(c[0]) if c else None
                if not m:
                    continue
                tipo, letra, num = m.groups()
                idc = c[0]
                propios.append(idc)
                definidos[idc].append(f.name)
                if letra != bloque:
                    errores.append(f"{f.name}: {idc} no pertenece al bloque {bloque}")
                if not es_f0 and not 1 <= int(num) <= 9:
                    avisos.append(f"{f.name}: {idc} fuera del rango reservado 01..09")
                if tipo in ("RF", "RNF", "RN"):
                    # se admite una anotación tras la prioridad: «Media (obligatorio línea base)»
                    if not any(x.split(" ")[0] in PRIORIDADES for x in c):
                        errores.append(f"{f.name}: {idc} sin prioridad Alta, Media o Baja")
                    if not es_f0 and (not c[-1] or c[-1] in ("—", "-")):
                        errores.append(f"{f.name}: {idc} sin Origen")
        if not es_f0:
            for idc in propios:
                if idc.split("-")[1] in ("RF", "RN") and idc not in s7:
                    avisos.append(f"{f.name}: {idc} no aparece en la sección 7 (criterios de aceptación)")
        for m in CATALOGO.finditer(texto):
            idc = f"SIEP-{m.group(1)}-{m.group(2)}"
            if catalogo and idc not in catalogo:
                errores.append(f"{f.name}: cita {idc}, que no existe en el catálogo de extensiones")
        for m in BASE.finditer(texto):
            tipo, num = m.group(1), int(m.group(2))
            if num < 1 or num > LIMITE[tipo]:
                errores.append(f"{f.name}: cita {tipo}-{m.group(2)}, fuera del rango de la línea base")
        if SECRETO.search(texto):
            errores.append(f"{f.name}: posible secreto en el texto")

    for idc, fs in definidos.items():
        if len(fs) > 1:
            errores.append(f"ID definido {len(fs)} veces {idc}: {', '.join(sorted(set(fs)))}")

    por_tipo = defaultdict(int)
    for idc in definidos:
        por_tipo[idc.split("-")[1]] += 1
    print(f"archivos: {len(archivos)} | IDs definidos: {len(definidos)} ({', '.join(f'{k}: {v}' for k, v in sorted(por_tipo.items()))})")
    unicos_e = list(dict.fromkeys(errores))
    unicos_a = list(dict.fromkeys(avisos))
    print(f"errores: {len(unicos_e)} | avisos: {len(unicos_a)}")
    for e in unicos_e[:MAX_LINEAS]:
        print("  ERROR", e)
    for v in unicos_a[:MAX_LINEAS]:
        print("  aviso", v)
    sys.exit(1 if unicos_e else 0)


if __name__ == "__main__":
    main()
