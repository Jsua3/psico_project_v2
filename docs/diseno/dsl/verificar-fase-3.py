"""Verificación de la Fase 3: esquema, ejemplo y reparto de reglas entre capas.

Uso (solo biblioteca estándar y jsonschema):
    C:/Python313/python.exe -I -B verificar-fase-3.py

Hace tres cosas:
  1. Comprueba que dsl-casos.schema.json es un esquema válido (draft 2020-12).
  2. Valida ejemplo-minimo.json con las dos capas: la sintáctica (el esquema) y la
     semántica (referencias, unicidad y propiedades del grafo).
  3. Aplica 32 alteraciones al ejemplo y comprueba que cada regla se detecta en la
     capa que dice el documento fase-3-sintaxis-concreta.md (sección 6).

La capa semántica es una implementación de referencia de las reglas OCL; el texto
OCL y su explicación son de la Fase 2.
"""
import copy
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

AQUI = Path(__file__).resolve().parent
ESQUEMA = json.loads((AQUI / "dsl-casos.schema.json").read_text(encoding="utf-8"))
EJEMPLO = json.loads((AQUI / "ejemplo-minimo.json").read_text(encoding="utf-8"))

SIN_REGLA = "-"
ABIERTOS = ("EN_CURSO", "PAUSADO")


# ───────────────────────── Capa 1: sintáctica (JSON Schema) ─────────────────────────
def _def(ref):
    assert ref.startswith("#/$defs/"), ref
    return ESQUEMA["$defs"][ref.split("/")[-1]]


def regla_de(error):
    """Regla del dominio que ilustra un error del esquema, leída de las anotaciones x-regla."""
    if error.validator == "required":
        for faltante in error.validator_value:
            if faltante not in error.instance:
                regla = error.schema.get("properties", {}).get(faltante, {}).get("x-regla")
                if regla:
                    return regla
    if "x-regla" in error.schema:
        return error.schema["x-regla"]
    # Error de una definición alcanzada por $ref desde una propiedad anotada (titulo, descripcion).
    # jsonschema no incluye "$ref" en la ruta del esquema: se resuelve al salir de un nodo con $ref.
    nodo, envoltorio, por_ref, condicional = ESQUEMA, None, False, None
    for paso in error.absolute_schema_path:
        por_ref = False
        while isinstance(nodo, dict) and "$ref" in nodo and paso not in nodo:
            envoltorio, nodo, por_ref = nodo, _def(nodo["$ref"]), True
        if paso in ("then", "else") and "x-regla" in nodo:
            condicional = nodo["x-regla"]  # el error viene de la rama de un if/then anotado
        nodo = nodo[paso]
    if condicional:
        return condicional
    if por_ref and envoltorio:
        return envoltorio.get("x-regla", SIN_REGLA)
    return SIN_REGLA


def capa_sintactica(doc):
    validador = Draft202012Validator(ESQUEMA)
    return [
        {"capa": "ESQUEMA", "regla": regla_de(e), "ruta": "/".join(map(str, e.absolute_path)),
         "mensaje": e.message[:110]}
        for e in sorted(validador.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path)))
    ]


# ───────────────────────── Capa 2: semántica ─────────────────────────
def valores(doc, expresion):
    """Conjunto de cadenas que designa una expresión como 'escenas[].decision.opciones[].id'."""
    nodos = [doc]
    for ficha in expresion.split("."):
        clave, es_lista = ficha.rstrip("[]"), ficha.endswith("[]")
        siguientes = []
        for nodo in nodos:
            if isinstance(nodo, dict) and clave in nodo:
                v = nodo[clave]
                if es_lista:
                    siguientes.extend(v if isinstance(v, list) else [])
                else:
                    siguientes.append(v)
        nodos = siguientes
    return [n for n in nodos if isinstance(n, str)]


def referencias(valor, nodo, ruta, salida):
    """Recorre el documento junto al esquema y reúne cada campo anotado con x-referencia."""
    if not isinstance(nodo, dict):
        return
    if "x-referencia" in nodo and isinstance(valor, str):
        salida.append((ruta, valor, nodo["x-referencia"]))
    while "$ref" in nodo:
        nodo = {**_def(nodo["$ref"]), **{k: v for k, v in nodo.items() if k != "$ref"}}
    if isinstance(valor, dict):
        for clave, sub in valor.items():
            referencias(sub, nodo.get("properties", {}).get(clave), f"{ruta}/{clave}", salida)
    elif isinstance(valor, list):
        for i, sub in enumerate(valor):
            referencias(sub, nodo.get("items"), f"{ruta}/{i}", salida)


def ciclo(grafo):
    estado = {}

    def visita(n):
        estado[n] = 1
        for m in grafo.get(n, []):
            if estado.get(m) == 1 or (m not in estado and visita(m)):
                return True
        estado[n] = 2
        return False

    return any(n not in estado and visita(n) for n in list(grafo))


def capa_semantica(doc):
    v = []

    def falla(regla, ruta, mensaje):
        v.append({"capa": "SEMANTICA", "regla": regla, "ruta": ruta, "mensaje": mensaje})

    # 1. Integridad referencial: cada x-referencia debe resolver (OCL-03, OCL-05, OCL-06, INV-09, ...).
    encontradas = []
    referencias(doc, ESQUEMA, "", encontradas)
    for ruta, valor, ref in encontradas:
        if valor not in valores(doc, ref["destino"]):
            falla(ref["regla"], ruta, f"{valor} no existe en {ref['destino']} ({ref['relacion']})")

    # 2. Unicidad de identificadores (OCL-04 para decisiones; INV-13 para el resto).
    colecciones = [
        ("OCL-04", "decisiones", "escenas[].decision.id"),
        ("INV-13", "escenas", "escenas[].id"),
        ("INV-13", "personajes", "personajes[].id"),
        ("INV-13", "herramientas", "herramientas[].id"),
        ("INV-13", "opciones", "escenas[].decision.opciones[].id"),
        ("INV-13", "retroalimentaciones", "retroalimentacion[].id"),
        ("INV-13", "rubricas", "rubricas[].id"),
        ("INV-13", "criterios", "rubricas[].criterios[].id"),
        ("INV-13", "estudiantes", "ejecucion.estudiantes[].id"),
        ("INV-13", "intentos", "ejecucion.intentos[].id"),
        ("INV-13", "evaluaciones", "ejecucion.evaluaciones[].id"),
    ]
    for regla, nombre, expr in colecciones:
        ids = valores(doc, expr)
        for repetido in sorted({i for i in ids if ids.count(i) > 1}):
            falla(regla, expr, f"identificador repetido en {nombre}: {repetido}")

    # 3. Grafo del caso: acíclico (INV-10) y alcanzable desde la escena inicial (INV-11).
    escenas = [e for e in doc.get("escenas", []) if isinstance(e, dict)]
    ids_escena = {e.get("id") for e in escenas}
    grafo = {e.get("id"): [] for e in escenas}
    for e in escenas:
        decision = e.get("decision")
        if isinstance(decision, dict):
            for o in decision.get("opciones", []):
                if isinstance(o, dict) and o.get("siguienteEscena") in ids_escena:
                    grafo[e.get("id")].append(o["siguienteEscena"])
    if ciclo(grafo):
        falla("INV-10", "escenas", "el flujo contiene un ciclo")
    inicial = doc.get("caso", {}).get("escenaInicial")
    if inicial in ids_escena:
        vistas, pila = set(), [inicial]
        while pila:
            n = pila.pop()
            if n not in vistas:
                vistas.add(n)
                pila.extend(grafo.get(n, []))
        for e in sorted(ids_escena - vistas - {None}):
            falla("INV-11", "escenas", f"la escena {e} no es alcanzable desde {inicial}")

    # 4. Ejecución: un intento abierto por estudiante (INV-16), una reflexión por escena (INV-17),
    #    orden de registro sin repetir (INV-13) y evaluación coherente con la rúbrica (INV-20).
    ejecucion = doc.get("ejecucion") or {}
    abiertos = {}
    for i in ejecucion.get("intentos", []):
        if isinstance(i, dict) and i.get("estado") in ABIERTOS:
            abiertos.setdefault(i.get("estudiante"), []).append(i.get("id"))
        bit = i.get("bitacora", {}) if isinstance(i, dict) else {}
        escenas_ref = [r.get("escena") for r in bit.get("reflexiones", []) if isinstance(r, dict)]
        for e in sorted({x for x in escenas_ref if escenas_ref.count(x) > 1}):
            falla("INV-17", f"intento {i.get('id')}", f"más de una reflexión para la escena {e}")
        ordenes = [r.get("orden") for r in bit.get("decisiones", []) if isinstance(r, dict)]
        for o in sorted({x for x in ordenes if ordenes.count(x) > 1}):
            falla("INV-13", f"intento {i.get('id')}", f"orden de registro repetido: {o}")
    for est, ids in abiertos.items():
        if len(ids) > 1:
            falla("INV-16", "ejecucion/intentos", f"{est} tiene {len(ids)} intentos abiertos: {ids}")
    rubricas = {r.get("id"): r for r in doc.get("rubricas", []) if isinstance(r, dict)}
    for ev in ejecucion.get("evaluaciones", []):
        if not isinstance(ev, dict):
            continue
        rub = rubricas.get(ev.get("rubrica"))
        if rub is None:
            continue
        criterios = {c.get("id") for c in rub.get("criterios", []) if isinstance(c, dict)}
        valorados = [x.get("criterio") for x in ev.get("valoraciones", []) if isinstance(x, dict)]
        if len(valorados) != len(set(valorados)):
            falla("INV-20", f"evaluacion {ev.get('id')}", "un criterio está valorado más de una vez")
        if ev.get("estado") == "EVALUADA" and set(valorados) != criterios:
            falta = sorted(criterios - set(valorados))
            falla("INV-20", f"evaluacion {ev.get('id')}", f"EVALUADA sin valorar: {falta}")
        if doc.get("caso", {}).get("rubrica") != ev.get("rubrica"):  # también si el caso no declara ninguna
            falla("INV-20", f"evaluacion {ev.get('id')}", "no aplica la rúbrica del caso")
    return v


def validar(doc):
    return capa_sintactica(doc) + capa_semantica(doc)


# ───────────────────────── Alteraciones del ejemplo ─────────────────────────
def con(cambio):
    doc = copy.deepcopy(EJEMPLO)
    cambio(doc)
    return doc


def e(doc, i):
    return doc["escenas"][i]


def opciones(doc):
    return e(doc, 0)["decision"]["opciones"]


def intento_extra(doc, id_, bit, estado):
    nuevo = copy.deepcopy(doc["ejecucion"]["intentos"][0])
    nuevo.update({"id": id_, "estado": estado})
    nuevo.pop("finalizadoEn", None)
    nuevo["bitacora"].update({"id": bit, "bloqueada": False})
    doc["ejecucion"]["intentos"].append(nuevo)


def dos_opciones_en(escena, id_decision, ids, destinos):
    escena["decision"] = {
        "id": id_decision,
        "pregunta": "¿Cómo continúa la reunión?",
        "opciones": [
            {"id": ids[0], "texto": "Opción A", "siguienteEscena": destinos[0], "clasificacion": "ADECUADA"},
            {"id": ids[1], "texto": "Opción B", "siguienteEscena": destinos[1], "clasificacion": "RIESGOSA"},
        ],
    }


def p_una_opcion(d):
    del opciones(d)[1]


def p_una_opcion_limpia(d):
    del opciones(d)[1]
    del d["retroalimentacion"][1]


def p_sin_decision(d):
    del e(d, 0)["decision"]


def p_decision_null(d):
    e(d, 1)["decision"] = None  # E02 es una conclusión: lo correcto es omitir la clave


def p_retro_ambas(d):
    d["retroalimentacion"][0]["opcion"] = "OP01"


def p_retro_ninguna(d):
    del d["retroalimentacion"][0]["decision"]


def p_decision_repetida(d):
    dos_opciones_en(e(d, 1), "D01", ["OP03", "OP04"], ["E03", "E03"])


def p_ciclo(d):
    dos_opciones_en(e(d, 2), "D02", ["OP03", "OP04"], ["E01", "E02"])


def p_prohibida(d):
    opciones(d)[1]["conductaProhibida"] = True


def p_bitacora_abierta(d):
    d["ejecucion"]["intentos"][0]["bitacora"]["bloqueada"] = False


def p_evaluacion_incompleta(d):
    del d["ejecucion"]["evaluaciones"][0]["valoraciones"][1]


def p_reflexion_doble(d):
    refs = d["ejecucion"]["intentos"][0]["bitacora"]["reflexiones"]
    refs.append(copy.deepcopy(refs[0]))


def p_escena_repetida(d):
    e(d, 2)["id"] = "E02"


def p_fase4(d):
    del opciones(d)[1]
    del d["retroalimentacion"][1]
    opciones(d)[0]["herramienta"] = "H99"
    dos_opciones_en(e(d, 1), "D02", ["OP03", "OP04"], ["E03", "E09"])


def p_dos_intentos_abiertos(d):
    intento_extra(d, "INT-02", "BIT-02", "EN_CURSO")
    intento_extra(d, "INT-03", "BIT-03", "PAUSADO")


def p_sin_siguiente(d):
    del opciones(d)[0]["siguienteEscena"]


PROBES = [
    # (nombre, alteración, resultado esperado, modo)
    ("ejemplo sin alterar", lambda d: None, set(), "exacto"),
    ("OCL-01/OCL-08  caso sin escenas", lambda d: d.update(escenas=[]),
     {("ESQUEMA", "OCL-01"), ("ESQUEMA", "OCL-08")}, "contiene"),
    ("OCL-02  decisión con una opción (R02 queda colgada)", p_una_opcion,
     {("ESQUEMA", "OCL-02"), ("SEMANTICA", "OCL-06")}, "contiene"),
    ("OCL-02  decisión con una opción (sin R02)", p_una_opcion_limpia,
     {("ESQUEMA", "OCL-02"), ("SEMANTICA", "INV-11")}, "exacto"),
    ("OCL-03  opción hacia escena inexistente E09",
     lambda d: opciones(d)[1].update(siguienteEscena="E09"),
     {("SEMANTICA", "OCL-03"), ("SEMANTICA", "INV-11")}, "exacto"),
    ("OCL-03  opción sin siguienteEscena", p_sin_siguiente,
     {("ESQUEMA", "OCL-03")}, "contiene"),
    ("OCL-04  identificador de decisión repetido", p_decision_repetida,
     {("SEMANTICA", "OCL-04")}, "exacto"),
    ("OCL-05  herramienta H99 no definida",
     lambda d: opciones(d)[0].update(herramienta="H99"),
     {("SEMANTICA", "OCL-05")}, "exacto"),
    ("OCL-06  retroalimentación sin decisión ni opción", p_retro_ninguna,
     {("ESQUEMA", "OCL-06")}, "exacto"),
    ("OCL-06  retroalimentación con decisión y opción", p_retro_ambas,
     {("ESQUEMA", "OCL-06")}, "exacto"),
    ("OCL-06  retroalimentación hacia decisión inexistente",
     lambda d: d["retroalimentacion"][0].update(decision="D09"),
     {("SEMANTICA", "OCL-06")}, "exacto"),
    ("OCL-07  caso sin descripción", lambda d: d["caso"].pop("descripcion"),
     {("ESQUEMA", "OCL-07")}, "exacto"),
    ("OCL-07  descripción en blanco", lambda d: d["caso"].update(descripcion="   "),
     {("ESQUEMA", "OCL-07")}, "exacto"),
    ("OCL-08  ninguna escena con decisión", p_sin_decision,
     {("ESQUEMA", "OCL-08")}, "contiene"),
    ("OCL-08  decision: null en la única escena con decisión",
     lambda d: e(d, 0).update(decision=None),
     {("ESQUEMA", "OCL-08"), ("ESQUEMA", SIN_REGLA)}, "contiene"),
    ("INV-09  escena inicial inexistente", lambda d: d["caso"].update(escenaInicial="E09"),
     {("SEMANTICA", "INV-09")}, "exacto"),
    ("INV-10  ciclo en el flujo", p_ciclo, {("SEMANTICA", "INV-10")}, "exacto"),
    ("INV-11  escena inalcanzable",
     lambda d: e(d, 0)["decision"]["opciones"][1].update(siguienteEscena="E02"),
     {("SEMANTICA", "INV-11")}, "exacto"),
    ("INV-12  conducta prohibida sin motivo", p_prohibida, {("ESQUEMA", "INV-12")}, "exacto"),
    ("INV-13  escena con identificador repetido", p_escena_repetida,
     {("SEMANTICA", "INV-13")}, "contiene"),
    ("INV-14  participante que no es del caso",
     lambda d: e(d, 0).update(participantes=["P01", "P09"]),
     {("SEMANTICA", "INV-14")}, "exacto"),
    ("INV-16  dos intentos abiertos del mismo estudiante", p_dos_intentos_abiertos,
     {("SEMANTICA", "INV-16")}, "exacto"),
    ("INV-17  dos reflexiones para una escena", p_reflexion_doble,
     {("SEMANTICA", "INV-17")}, "exacto"),
    ("INV-18  registro de una opción que no existe",
     lambda d: d["ejecucion"]["intentos"][0]["bitacora"]["decisiones"][0].update(opcionElegida="OP09"),
     {("SEMANTICA", "INV-18")}, "exacto"),
    ("INV-19  bitácora abierta en un intento completado", p_bitacora_abierta,
     {("ESQUEMA", "INV-19")}, "exacto"),
    ("INV-20  evaluación EVALUADA que no cubre los criterios", p_evaluacion_incompleta,
     {("SEMANTICA", "INV-20")}, "exacto"),
    ("INV-20  evaluación con rúbrica y caso sin rúbrica", lambda d: d["caso"].pop("rubrica"),
     {("SEMANTICA", "INV-20")}, "exacto"),
    ("RN-03   intentos con el caso en BORRADOR", lambda d: d["caso"].update(estado="BORRADOR"),
     {("ESQUEMA", "RN-03")}, "exacto"),
    ("RN-09   nota numérica en la evaluación",
     lambda d: d["ejecucion"]["evaluaciones"][0].update(nota=4.5),
     {("ESQUEMA", SIN_REGLA)}, "exacto"),
    ("forma   atributo derivado esConclusion escrito",
     lambda d: e(d, 1).update(esConclusion=True), {("ESQUEMA", SIN_REGLA)}, "exacto"),
    ("forma   decision: null en una conclusión", p_decision_null,
     {("ESQUEMA", SIN_REGLA)}, "exacto"),
    ("forma   referencia con prefijo equivocado (H01 como escena)",
     lambda d: opciones(d)[0].update(siguienteEscena="H01"),
     {("ESQUEMA", "OCL-03")}, "contiene"),
    ("Fase 4  una opción + herramienta no definida + escena inexistente", p_fase4,
     {("ESQUEMA", "OCL-02"), ("SEMANTICA", "OCL-05"), ("SEMANTICA", "OCL-03")}, "contiene"),
]


def principal():
    for flujo in (sys.stdout, sys.stderr):  # que las tildes salgan bien aunque se redirija la salida
        try:
            flujo.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    fallos = 0
    Draft202012Validator.check_schema(ESQUEMA)
    print("1. dsl-casos.schema.json es un esquema válido (draft 2020-12): OK")

    resultado = validar(EJEMPLO)
    print(f"2. ejemplo-minimo.json: {len(resultado)} violaciones (capa sintáctica y semántica)")
    for r in resultado:
        print("   ", r)
    fallos += bool(resultado)

    print(f"3. {len(PROBES) - 1} alteraciones del ejemplo (más un control sin alterar)")
    for nombre, cambio, esperado, modo in PROBES:
        obtenido = {(r["capa"], r["regla"]) for r in validar(con(cambio))}
        bien = obtenido == esperado if modo == "exacto" else esperado <= obtenido
        fallos += not bien
        marca = "OK  " if bien else "FALLA"
        print(f"   {marca} {nombre}")
        print(f"        obtenido: {sorted(obtenido)}")
        if not bien:
            print(f"        esperado ({modo}): {sorted(esperado)}")
    print("RESULTADO:", "TODO CORRECTO" if not fallos else f"{fallos} FALLOS")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(principal())
