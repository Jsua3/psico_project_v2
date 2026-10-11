# -*- coding: utf-8 -*-
"""Prueba de estrés del validador con mutaciones aleatorias.

Parte de los dos casos de ``simulador_psicologia_social.json`` y les aplica entre
una y tres alteraciones al azar (borrar una clave, poner un valor de otro tipo,
duplicar un elemento). Con la semilla fija, la serie de documentos es siempre la
misma. Para cada documento comprueba dos cosas:

  1. el intérprete de forma coincide con ``jsonschema`` (si está instalado);
  2. ninguna regla falla por dentro: un documento roto se informa, no tumba al validador.

Uso (desde esta carpeta):

    C:/Python313/python.exe -I -B estres_aleatorio.py [cantidad] [semilla]

Por defecto 4000 documentos y semilla 20261010. Código de salida 0 si no hubo
discrepancias ni errores internos; 1 en caso contrario.
"""
import copy
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validar_dsl as v  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
VALORES = [None, "", "   ", "X", "E01", "OP01", "H99", "D01", "P01", 0, 1, -3, 2.5, True, False, [], {},
           ["E01", "E01"], {"id": "E01"}, "2026-10-09T15:00:00-05:00", "PUBLICADO", "BORRADOR",
           "COMPLETADO", "EN_CURSO", "RUB-01"]


def caminos(nodo, ruta=()):
    yield ruta
    if isinstance(nodo, dict):
        for clave, valor in nodo.items():
            yield from caminos(valor, ruta + (clave,))
    elif isinstance(nodo, list):
        for i, valor in enumerate(nodo):
            yield from caminos(valor, ruta + (i,))


def alterar(doc, azar):
    ruta = azar.choice([c for c in caminos(doc) if c])
    padre = doc
    for paso in ruta[:-1]:
        padre = padre[paso]
    ultimo = ruta[-1]
    accion = azar.choice(["borrar", "valor", "valor", "duplicar"])
    if accion == "borrar":
        if isinstance(padre, dict):
            del padre[ultimo]
        else:
            padre.pop(ultimo)
    elif accion == "valor":
        padre[ultimo] = copy.deepcopy(azar.choice(VALORES))
    elif isinstance(padre, list):
        padre.append(copy.deepcopy(padre[ultimo]))
    elif isinstance(padre[ultimo], list) and padre[ultimo]:
        padre[ultimo].append(copy.deepcopy(padre[ultimo][0]))


def principal(argv):
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    cantidad = int(argv[0]) if argv else 4000
    semilla = int(argv[1]) if len(argv) > 1 else 20261010
    esquema = json.loads((RAIZ / v.NOMBRE_ESQUEMA).read_text(encoding="utf-8"))
    datos = json.loads((RAIZ / v.ARCHIVO_POR_DEFECTO).read_text(encoding="utf-8"))
    bases = [e["caso"] for e in datos["escenarios"]]
    azar = random.Random(semilla)
    discrepancias = internos = comparados = 0
    combinaciones = set()
    for _ in range(cantidad):
        doc = copy.deepcopy(azar.choice(bases))
        for _ in range(azar.choice([1, 1, 2, 3])):
            try:
                alterar(doc, azar)
            except (KeyError, IndexError, TypeError):
                pass
        informe = v.validar_documento(doc, esquema, usar_jsonschema=True)
        combinaciones.add(tuple(informe["reglasIncumplidas"]))
        cruzada = informe["comprobacionCruzada"]
        if cruzada is not None:
            comparados += 1
            discrepancias += not cruzada["coincide"]
        internos += sum(1 for r in informe["reglas"] for h in r["hallazgos"] if h["elemento"] == "(interno)")
    print(f"Documentos alterados: {cantidad} (semilla {semilla})")
    if comparados:
        print(f"Comparados con jsonschema: {comparados}; discrepancias: {discrepancias}")
    else:
        print("jsonschema no está instalado: no hubo comparación cruzada")
    print(f"Errores internos de las reglas: {internos}")
    print(f"Combinaciones distintas de reglas incumplidas: {len(combinaciones)}")
    return 1 if discrepancias or internos else 0


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
