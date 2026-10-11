#!/usr/bin/env python3
"""Consolida los veredictos del contraste línea base PN3 ↔ SIEP y genera la matriz de cumplimiento.

Uso (desde cualquier carpeta; con `-I` Python ignora el directorio actual):

    python -I generar_matriz.py --datos ../datos --base ../../baseline-pn3 --salida .. --fecha 2026-10-10

Entradas
    datos/evaluadores/*.json   salida de cada evaluador: {grupo, items[], observaciones[]}
    datos/revisiones/*.json    salida de cada lente de contraste: {grupo, lente, revision[], clausulas_omitidas[]}
    datos/resoluciones.json    (opcional) {"RF-15": {"veredicto": "conflicto", "nota": "..."}}
    datos/remediciones/*.json  (opcional) {fecha, codigo, motivo, items[]}: ítems vueltos a evaluar sobre un código
                               posterior; cada item trae el mismo formato que un evaluador más `revisiones[]`
                               ({lente, acuerdo, veredicto_revisado, motivo, evidencia}). Sustituyen al evaluador y a
                               las revisiones previas de ese ID
    baseline-pn3/0[1-4]-*.md   línea base (texto fiel al Excel; no se edita a mano)

Salidas
    datos/veredictos.json      consolidado y reproducible
    matriz-cumplimiento.md     resumen + una tabla por tipo
    detalle-por-requisito.md   cláusulas, evidencia, brecha, acción y revisiones por ID

Método (docs/requisitos/PROMPT_SESION_REQUISITOS_PN3.md §6): cada requisito se descompone en cláusulas y el
veredicto del ítem sale de ellas; todo veredicto «cumple» y todo «conflicto» pasa por dos revisores con lentes
opuestos (falso cumple / falso incumple). No inventa nada: solo ordena lo que traen los JSON.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

TIPOS = ["RF", "RNF", "RN", "CU"]
NOMBRE_TIPO = {
    "RF": "Requisitos funcionales",
    "RNF": "Requisitos no funcionales",
    "RN": "Reglas de negocio",
    "CU": "Casos de uso",
}
VEREDICTOS = ["cumple", "parcial", "no_cumple", "conflicto", "no_verificable"]
EN_ALCANCE_CONTRASTE = {"cumple", "conflicto"}
RUTA = re.compile(r"([\w.\-]+(?:/[\w.\-\[\]]+)+\.\w+):(\d+)(?:-(\d+))?")


def clave(id_):
    tipo, num = id_.split("-")
    return (TIPOS.index(tipo), int(num))


def leer_linea_base(base: Path):
    """Devuelve {id: {tipo, nombre, texto, actor, prioridad, estado_base, rf_relacionados}} desde las tablas Markdown."""
    filas = {}
    for md in sorted(base.glob("0[1-4]-*.md")):
        for linea in md.read_text(encoding="utf-8").splitlines():
            if not linea.startswith("| "):
                continue
            c = [x.strip() for x in linea.strip().strip("|").split("|")]
            if not re.match(r"^(RF|RNF|RN|CU)-\d+$", c[0]):
                continue
            tipo = c[0].split("-")[0]
            if tipo == "RF":      # ID | Épica | Nombre | Descripción | Actor | Prioridad | Estado
                f = dict(nombre=c[2], texto=c[3], actor=c[4], prioridad=c[5], estado_base=c[6], epica=c[1])
            elif tipo == "RNF":   # ID | Categoría | Nombre | Descripción | Prioridad | Estado
                f = dict(nombre=c[2], texto=c[3], actor="", prioridad=c[4], estado_base=c[5], epica=c[1])
            elif tipo == "RN":    # ID | Categoría | Regla | Prioridad | Estado | Observación
                f = dict(nombre=c[1], texto=c[2], actor="", prioridad=c[3], estado_base=c[4], epica=c[1], observacion=c[5])
            else:                 # ID | Caso de uso | Actor principal | Objetivo | RF relacionados | Estado
                f = dict(nombre=c[1], texto=c[3], actor=c[2], prioridad="", estado_base=c[5], epica="", rf_relacionados=c[4])
            f["tipo"] = tipo
            filas[c[0]] = f
    return filas


def cargar_json(carpeta: Path):
    for f in sorted(carpeta.glob("*.json")):
        yield f, json.loads(f.read_text(encoding="utf-8"))


def consolidar(datos: Path, base: Path):
    linea_base = leer_linea_base(base)
    evaluados = {}
    for f, d in cargar_json(datos / "evaluadores"):
        for it in d.get("items", []):
            reg = dict(it)
            reg["grupo"] = d.get("grupo", f.stem)
            evaluados[it["id"]] = reg
    revisiones = defaultdict(list)
    omitidas = {}
    for f, d in cargar_json(datos / "revisiones"):
        omitidas[f.stem] = d.get("clausulas_omitidas", [])
        for r in d.get("revision", []):
            revisiones[r["id"]].append(
                dict(fuente=f.stem, lente=d.get("lente", ""), acuerdo=r["acuerdo"],
                     veredicto_revisado=r["veredicto_revisado"], motivo=r["motivo"], evidencia=r.get("evidencia", []))
            )
    resol_f = datos / "resoluciones.json"
    resoluciones = json.loads(resol_f.read_text(encoding="utf-8")) if resol_f.exists() else {}
    # Re-mediciones: ítems que se volvieron a evaluar sobre un código posterior. Sustituyen al evaluador y a las
    # revisiones previas de ese ítem (los archivos originales se conservan como historial).
    remediciones = {}
    if (datos / "remediciones").exists():
        for f, d in cargar_json(datos / "remediciones"):
            meta = {k: d.get(k, "") for k in ("fecha", "codigo", "motivo")}
            for it in d.get("items", []):
                remediciones[it["id"]] = dict(item=it, meta=meta)

    faltan = sorted(set(linea_base) - set(evaluados), key=clave)
    sobran = sorted(set(evaluados) - set(linea_base), key=clave)

    salida = []
    for id_ in sorted(linea_base, key=clave):
        lb = linea_base[id_]
        ev = evaluados.get(id_)
        reg = dict(id=id_, **lb)
        if ev is None:
            reg.update(veredicto_evaluador="sin_evaluar", veredicto_final="sin_evaluar", verificacion="sin evaluar",
                       revisiones=[], resolucion=None)
            salida.append(reg)
            continue
        remedicion = None
        rem = remediciones.get(id_)
        if rem:
            previo = resoluciones.get(id_, {}).get("veredicto", ev["veredicto"])
            grupo_previo = ev.get("grupo", "")
            ev = dict(rem["item"])
            ev["grupo"] = grupo_previo
            remedicion = dict(rem["meta"], anterior=previo)
            if rem["item"].get("motivo"):
                remedicion["motivo"] = rem["item"]["motivo"]
        v = ev["veredicto"]
        if rem:
            revs = [dict(fuente="remedicion", lente=r.get("lente", ""), acuerdo=r["acuerdo"],
                         veredicto_revisado=r["veredicto_revisado"], motivo=r["motivo"], evidencia=r.get("evidencia", []))
                    for r in rem["item"].get("revisiones", [])]
        else:
            revs = revisiones.get(id_, [])
        if v in EN_ALCANCE_CONTRASTE:
            if len(revs) == 0:
                verif = "pendiente"
            elif len(revs) == 1:
                verif = "1 de 2 lentes"
            else:
                ok = all(r["acuerdo"] and r["veredicto_revisado"] == v for r in revs)
                verif = "confirmado (2 lentes)" if ok else "disputado"
        else:
            if not revs:
                verif = "fuera del método (una sola evaluación)"
            else:
                ok = all(r["acuerdo"] and r["veredicto_revisado"] == v for r in revs)
                verif = "revisado por 1 lente, de acuerdo" if ok else "disputado"
        res = None if rem else resoluciones.get(id_)
        final = res["veredicto"] if res else v
        if res and verif == "disputado":
            verif = "disputado, resuelto"
        if rem:
            verif = "re-medido; " + verif
        if remedicion:
            reg.update(remedicion=remedicion)
        reg.update(
            grupo=ev["grupo"], veredicto_evaluador=v, veredicto_final=final, verificacion=verif,
            resumen=ev.get("resumen", ""), clausulas=ev.get("clausulas", []), brecha=ev.get("brecha", ""),
            accion=ev.get("accion", ""), esfuerzo=ev.get("esfuerzo", ""), cambia_esquema_bd=ev.get("cambia_esquema_bd", False),
            decision_requerida=ev.get("decision_requerida", ""), terminologia=ev.get("terminologia", ""),
            pruebas_existentes=ev.get("pruebas_existentes", []), revisiones=revs, resolucion=res,
        )
        salida.append(reg)
    return salida, omitidas, faltan, sobran


def celda(texto, n=None):
    t = " ".join(str(texto or "").split()).replace("|", "\\|")
    if n and len(t) > n:
        t = t[: n - 1].rstrip() + "…"
    return t


def primera_frase(texto, n=190):
    t = " ".join(str(texto or "").split())
    m = re.search(r"(?<=[a-záéíóúñ\)])\.\s", t)
    if m and m.start() < n:
        t = t[: m.start() + 1]
    return celda(t, n)


def evidencia_principal(reg, maximo=2):
    """Primeras citas `ruta:línea` de las cláusulas que no cumplen (o, si no hay, de las que cumplen)."""
    refs, textos = [], []
    clausulas = reg.get("clausulas", [])
    orden = [c for c in clausulas if c["estado"] != "cumple"] + [c for c in clausulas if c["estado"] == "cumple"]
    for c in orden:
        for e in c.get("evidencia", []):
            m = RUTA.search(e)
            if m:
                r = f"`{m.group(0)}`"
                if r not in refs:
                    refs.append(r)
            else:
                textos.append(celda(e, 60))
            if len(refs) >= maximo:
                return ", ".join(refs)
    return ", ".join(refs) or (textos[0] if textos else "—")


def escribir_matriz(salida, omitidas, faltan, sobran, destino: Path, fecha, sha):
    cuenta = {t: Counter() for t in TIPOS}
    for r in salida:
        cuenta[r["tipo"]][r["veredicto_final"]] += 1
    verif = Counter(r["verificacion"] for r in salida)
    L = []
    L += ["# Matriz de cumplimiento: línea base PN3 ↔ SIEP", ""]
    remedidos = [r for r in salida if r.get("remedicion")]
    L += [f"> Generada el {fecha} por `herramientas/generar_matriz.py` a partir de `datos/` (no se edita a mano; "
          f"para cambiar un veredicto se añade una resolución en `datos/resoluciones.json`, o una re-medición en "
          f"`datos/remediciones/`, y se regenera).",
          f"> Línea base: `docs/requisitos/baseline-pn3/` (SHA-256 del `.xlsx`: `{sha}`). Código evaluado: `master` "
          f"(sin diferencias en `backend_django/`, `frontend/src/` ni `deploy/` respecto del árbol donde se evaluó"
          + (f"; los {len(remedidos)} ítems marcados «re-medido» se volvieron a evaluar sobre un `master` posterior, "
             f"ver la sección «Re-mediciones»)." if remedidos else ")."), ""]
    L += ["## Resumen", "", "| Tipo | Cumple | Parcial | No cumple | Conflicto | No verificable | Total |", "|---|---:|---:|---:|---:|---:|---:|"]
    tot = Counter()
    for t in TIPOS:
        fila = cuenta[t]
        L.append(f"| {NOMBRE_TIPO[t]} ({t}) | " + " | ".join(str(fila[v]) for v in VEREDICTOS) + f" | {sum(fila.values())} |")
        tot.update(fila)
    L.append("| **Total** | " + " | ".join(f"**{tot[v]}**" for v in VEREDICTOS) + f" | **{sum(tot.values())}** |")
    L += ["", "**Verificación** (método: todo «cumple» y todo «conflicto» pasa por dos lentes opuestos): "
          + "; ".join(f"{k}: {n}" for k, n in sorted(verif.items(), key=lambda x: -x[1])) + ".", ""]
    if faltan:
        L += [f"> ⚠ Sin evaluar: {', '.join(faltan)}.", ""]
    if sobran:
        L += [f"> ⚠ Evaluados que no están en la línea base: {', '.join(sobran)}.", ""]
    L += ["**Escala:** *cumple* = todas las cláusulas esenciales se cumplen · *parcial* = al menos una cumple y al "
          "menos una no · *no cumple* = ninguna cláusula esencial se cumple · *conflicto* = el sistema contradice "
          "activamente una cláusula · *no verificable* = no se puede decidir leyendo código (indica cómo verificarlo "
          "en `detalle-por-requisito.md`). Esf. = esfuerzo orientativo: S < 1 día, M unos días, L 1–2 semanas, XL más. "
          "BD = el cambio mínimo toca el esquema.", ""]
    for t in TIPOS:
        L += [f"## {NOMBRE_TIPO[t]}", "",
              "| ID | Nombre | Veredicto | Verificación | Evidencia principal | Brecha | Esf. | BD |", "|---|---|---|---|---|---|---|---|"]
        for r in [x for x in salida if x["tipo"] == t]:
            brecha = primera_frase(r.get("brecha", ""))
            res = r.get("resolucion")
            if res and r["veredicto_final"] != r["veredicto_evaluador"]:
                # el contraste cambió el veredicto: la brecha del evaluador ya no lo describe
                brecha = "*Resuelto tras el contraste:* " + celda(res.get("nota", ""), 230)
            veredicto = f"**{r['veredicto_final']}**"
            rem = r.get("remedicion")
            if rem and rem.get("anterior") != r["veredicto_final"]:
                veredicto += f" (antes: {rem['anterior']})"
            L.append("| " + " | ".join([
                r["id"], celda(r["nombre"], 60), veredicto, celda(r["verificacion"], 60),
                evidencia_principal(r), brecha, r.get("esfuerzo", ""),
                "sí" if r.get("cambia_esquema_bd") else "—"]) + " |")
        L.append("")
    if remedidos:
        L += ["## Re-mediciones", "",
              "Ítems que se volvieron a evaluar sobre un código posterior al de la medición original. Sustituyen al "
              "veredicto, las cláusulas y las revisiones anteriores (que se conservan en `datos/evaluadores/` y "
              "`datos/revisiones/` como historial).", "",
              "| ID | Fecha | Código | Antes | Ahora | Motivo |", "|---|---|---|---|---|---|"]
        for r in remedidos:
            m = r["remedicion"]
            L.append(f"| {r['id']} | {m.get('fecha', '')} | {celda(m.get('codigo', ''), 40)} | {m.get('anterior', '')} | "
                     f"**{r['veredicto_final']}** | {celda(m.get('motivo', ''), 160)} |")
        L.append("")
    disputados = [r for r in salida if r["verificacion"].startswith("disputado")]
    L += ["## Disputados y su resolución", ""]
    if not disputados:
        L += ["Ningún veredicto quedó disputado tras el contraste.", ""]
    for r in disputados:
        L += [f"### {r['id']} — {r['nombre']}", "",
              f"- Evaluador: **{r['veredicto_evaluador']}** · final: **{r['veredicto_final']}**"
              + (" · *sin resolver*" if not r.get("resolucion") else ""), ]
        for rv in r["revisiones"]:
            L.append(f"- Lente *{rv['lente']}*: {'de acuerdo' if rv['acuerdo'] else 'en desacuerdo'} → "
                     f"{rv['veredicto_revisado']}. {celda(rv['motivo'], 400)}")
        if r.get("resolucion"):
            L.append(f"- Resolución: {celda(r['resolucion'].get('nota', ''), 600)}")
        L.append("")
    destino.write_text("\n".join(L).rstrip() + "\n", encoding="utf-8", newline="\n")


def escribir_detalle(salida, omitidas, destino: Path):
    L = ["# Detalle por requisito", "",
         "> Generado por `herramientas/generar_matriz.py` desde `datos/veredictos.json`. Las cláusulas y la evidencia "
         "son las del evaluador; las revisiones son las de los lentes de contraste.", ""]
    for t in TIPOS:
        L += [f"## {NOMBRE_TIPO[t]}", ""]
        for r in [x for x in salida if x["tipo"] == t]:
            L += [f"### {r['id']} — {r['nombre']}", ""]
            L += [f"- **Texto base:** {celda(r['texto'])}"]
            if r.get("actor"):
                L += [f"- **Actor:** {r['actor']} · **Prioridad base:** {r.get('prioridad', '')} · **Estado base:** {r.get('estado_base', '')}"]
            if r.get("rf_relacionados"):
                L += [f"- **RF relacionados:** {r['rf_relacionados']}"]
            L += [f"- **Veredicto:** **{r['veredicto_final']}** (evaluador: {r['veredicto_evaluador']}) · **Verificación:** {r['verificacion']}"]
            if r.get("remedicion"):
                m = r["remedicion"]
                L += [f"- **Re-medición ({m.get('fecha', '')}, {m.get('codigo', '')}):** antes **{m.get('anterior', '')}**, "
                      f"ahora **{r['veredicto_final']}**. {celda(m.get('motivo', ''))}"]
            if r["veredicto_final"] == "sin_evaluar":
                L += [""]
                continue
            L += [f"- **Resumen:** {celda(r.get('resumen'))}"]
            if r.get("clausulas"):
                L += ["", "| Cláusula | Estado | Evidencia |", "|---|---|---|"]
                for c in r["clausulas"]:
                    L.append(f"| {celda(c['texto'])} | {c['estado']} | {celda('; '.join(c.get('evidencia', [])))} |")
                L.append("")
            if r.get("brecha"):
                L += [f"- **Brecha:** {celda(r['brecha'])}"]
            if r.get("accion"):
                L += [f"- **Acción mínima:** {celda(r['accion'])} (esfuerzo {r.get('esfuerzo', '')}; "
                      f"{'toca el esquema de BD' if r.get('cambia_esquema_bd') else 'sin cambio de esquema'})"]
            if r.get("decision_requerida"):
                L += [f"- **Decisión requerida:** {celda(r['decision_requerida'])}"]
            if r.get("terminologia"):
                L += [f"- **Terminología:** {celda(r['terminologia'])}"]
            if r.get("pruebas_existentes"):
                L += [f"- **Pruebas existentes:** {celda('; '.join(r['pruebas_existentes']))}"]
            for rv in r.get("revisiones", []):
                L += [f"- **Revisión ({rv['lente']}):** {'de acuerdo' if rv['acuerdo'] else 'en desacuerdo'} → "
                      f"{rv['veredicto_revisado']}. {celda(rv['motivo'], 500)}"]
            if r.get("resolucion"):
                L += [f"- **Resolución:** {celda(r['resolucion'].get('nota', ''))}"]
            L.append("")
    destino.write_text("\n".join(L).rstrip() + "\n", encoding="utf-8", newline="\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", required=True, type=Path)
    ap.add_argument("--base", required=True, type=Path)
    ap.add_argument("--salida", required=True, type=Path)
    ap.add_argument("--fecha", required=True)
    ap.add_argument("--sha", default="49EC11A1046B263C1E7D47A40D55E601261A7D65E9CC4C25CBA68F33ACE260BE")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    salida, omitidas, faltan, sobran = consolidar(a.datos, a.base)
    (a.datos / "veredictos.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    escribir_matriz(salida, omitidas, faltan, sobran, a.salida / "matriz-cumplimiento.md", a.fecha, a.sha)
    escribir_detalle(salida, omitidas, a.salida / "detalle-por-requisito.md")
    c = Counter(r["veredicto_final"] for r in salida)
    print(f"items: {len(salida)} | faltan: {faltan or '-'} | sobran: {sobran or '-'}")
    print("veredictos finales:", dict(c))
    print("verificacion:", dict(Counter(r["verificacion"] for r in salida)))


if __name__ == "__main__":
    main()
