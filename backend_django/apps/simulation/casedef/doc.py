"""Utilidades de lectura tolerante del documento DSL (E4-2a).

Portado del validador del taller de DSL (``docs/diseno/dsl/validador/validar_dsl.py``, Fase 4; autores
Juan José Sua Gómez y Emerson Ángel Gómez; copia en ``tests/taller_dsl/``) sin retocar su lógica: los
identificadores en español se conservan para poder cotejarlo línea a línea con el original.
Toleran un documento roto: una clave que falta o de otro tipo da una lista o un diccionario vacío en
vez de lanzar, porque el validador debe informar el problema, no caerse con él.
"""
from datetime import datetime

ABIERTOS = ("EN_CURSO", "PAUSADO")

__all__ = [
    "ABIERTOS", "_lista", "_objetos", "_texto_id", "_no_vacio", "_en", "_caso", "_id_caso", "_escenas",
    "_decisiones", "_opciones", "_ids", "_ejecucion", "_intentos", "_etq", "_mapa_opciones", "_registros",
    "_grafo", "_alcanzables", "_fecha",
]


def _lista(valor):
    return valor if isinstance(valor, list) else []


def _objetos(valor):
    """Pares (posición, objeto) de los elementos de una lista que son objetos."""
    return [(i, x) for i, x in enumerate(_lista(valor)) if isinstance(x, dict)]


def _texto_id(valor):
    return valor if isinstance(valor, str) and valor else None


def _no_vacio(valor):
    return isinstance(valor, str) and valor.strip() != ""


def _en(valor, conjunto):
    """``valor in conjunto`` sin fallar con valores que no se pueden comparar."""
    return isinstance(valor, str) and valor in conjunto


def _caso(doc):
    caso = doc.get("caso") if isinstance(doc, dict) else None
    return caso if isinstance(caso, dict) else {}


def _id_caso(doc):
    return _texto_id(_caso(doc).get("id")) or "(sin id)"


def _escenas(doc):
    return _objetos(doc.get("escenas"))


def _decisiones(doc):
    """(posición de la escena, escena, decisión) de cada escena con decisión."""
    return [(i, e, e["decision"]) for i, e in _escenas(doc) if isinstance(e.get("decision"), dict)]


def _opciones(doc):
    """(posición de la escena, escena, decisión, posición de la opción, opción)."""
    salida = []
    for i, escena, decision in _decisiones(doc):
        for j, opcion in _objetos(decision.get("opciones")):
            salida.append((i, escena, decision, j, opcion))
    return salida


def _ids(pares):
    return {x["id"] for _, x in pares if isinstance(x.get("id"), str)}


def _ejecucion(doc):
    ejec = doc.get("ejecucion") if isinstance(doc, dict) else None
    return ejec if isinstance(ejec, dict) else {}


def _intentos(doc):
    return _objetos(_ejecucion(doc).get("intentos"))


def _etq(escena_o_decision):
    return _texto_id(escena_o_decision.get("id")) or "(sin id)"


def _mapa_opciones(doc):
    """{id de opción: (id de su escena, opción)} para localizar a qué decisión pertenece."""
    return {
        o["id"]: (e["id"], o)
        for _, e, _, _, o in _opciones(doc)
        if isinstance(o.get("id"), str) and _texto_id(e.get("id"))
    }


def _registros(intento):
    """(posición, registro) de las decisiones de la bitácora de un intento."""
    bitacora = intento.get("bitacora") if isinstance(intento.get("bitacora"), dict) else {}
    return _objetos(bitacora.get("decisiones"))


def _grafo(doc):
    """{id de escena: [(id de opción, id de destino, ruta de la opción)]} con destinos existentes."""
    ids = _ids(_escenas(doc))
    grafo = {e["id"]: [] for _, e in _escenas(doc) if isinstance(e.get("id"), str)}
    for i, escena, _, j, opcion in _opciones(doc):
        origen, destino = escena.get("id"), opcion.get("siguienteEscena")
        if _en(origen, grafo) and _en(destino, ids):
            grafo[origen].append((opcion.get("id"), destino, f"escenas[{i}].decision.opciones[{j}]"))
    return grafo


def _alcanzables(grafo, inicial):
    vistas, pila = set(), [inicial]
    while pila:
        nodo = pila.pop()
        if nodo in vistas:
            continue
        vistas.add(nodo)
        pila.extend(destino for _, destino, _ in grafo.get(nodo, []))
    return vistas


def _fecha(texto):
    """Fecha ISO 8601 con zona horaria, o None si no se puede interpretar."""
    if not isinstance(texto, str):
        return None
    t = texto.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        fecha = datetime.fromisoformat(t)
    except ValueError:
        return None
    return fecha if fecha.tzinfo else None
