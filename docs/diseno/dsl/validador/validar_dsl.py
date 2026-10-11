#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validador del DSL de casos situacionales de SIEP (Fase 4 del taller).

Qué hace
    Carga un archivo JSON y lo valida en dos capas, siempre las dos (Fase 3, §6.3):

    1. FORMA     Estructura del documento según ``dsl-casos.schema.json``: claves
                 obligatorias, tipos, enumeraciones, formato de identificadores y
                 claves desconocidas. La hace un intérprete propio de la parte del
                 JSON Schema que el esquema usa (solo biblioteca estándar).
                 Si ``jsonschema`` está instalado, además se comprueba que su
                 veredicto coincide con el del intérprete (comprobación cruzada);
                 si no está, se omite y el resultado no cambia.
    2. SEMANTICA Las ocho reglas OCL-01 a OCL-08 del enunciado (Fase 2) y las
                 reglas PROP-01 a PROP-08, propuestas por el equipo. Cada regla es
                 una función con su expresión OCL y su descripción en el docstring.

Qué acepta
    * Un documento DSL único (``{"versionDsl": ..., "caso": ..., "escenas": ...}``).
    * Un archivo de escenarios (``{"dsl": ..., "escenarios": [{id, nombre, tipo,
      caso}, ...]}``) o una lista JSON de escenarios o de documentos.

Código de salida
    0  todos los escenarios dieron el resultado esperado.
    1  algún escenario esperado como válido falla, o uno esperado con errores no falla.
    2  el archivo no existe, no es JSON o no tiene una forma reconocible.

Uso
    python validar_dsl.py [archivo.json] [--json] [--esquema RUTA]
                          [--esperar valido|con-errores] [--sin-jsonschema]

    Sin archivo, valida ``../simulador_psicologia_social.json``.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
import textwrap
from datetime import datetime
from pathlib import Path

NOMBRE_ESQUEMA = "dsl-casos.schema.json"
ARCHIVO_POR_DEFECTO = "simulador_psicologia_social.json"
VERSION_DSL = "1.0"
TIPOS_ESCENARIO = ("valido", "con-errores")

CUMPLE, INCUMPLE, NO_APLICA, NO_EVALUADA = "CUMPLE", "INCUMPLE", "NO_APLICA", "NO_EVALUADA"
ABIERTOS = ("EN_CURSO", "PAUSADO")
IDS_OCL = tuple(f"OCL-0{n}" for n in range(1, 9))


# ════════════════════════ Utilidades sobre el documento ════════════════════════
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


def _h(elemento, ruta, mensaje):
    return {"elemento": elemento, "ruta": ruta, "mensaje": mensaje}


class Resultado:
    """Lo que devuelve cada regla: elementos evaluados, hallazgos y, si no pudo
    evaluarse, el motivo (``no_aplica``)."""

    __slots__ = ("evaluados", "hallazgos", "no_aplica")

    def __init__(self, evaluados=0, hallazgos=None, no_aplica=None):
        self.evaluados = evaluados
        self.hallazgos = hallazgos or []
        self.no_aplica = no_aplica


REGLAS = []  # registro ordenado de las reglas semánticas


def regla(identificador, tipo, inv=""):
    """Registra una función como regla. La primera línea del docstring es
    «<ID>. <descripción>» y de ahí sale el título que muestra el informe."""

    def decorador(funcion):
        primera = (funcion.__doc__ or "").strip().splitlines()[0]
        titulo = primera.split(". ", 1)[1] if ". " in primera else primera
        REGLAS.append(
            {"id": identificador, "tipo": tipo, "titulo": titulo, "inv": inv, "funcion": funcion}
        )
        return funcion

    return decorador


# ═══════════════ Reglas OCL del enunciado (Fase 2): OCL-01 a OCL-08 ═══════════════
@regla("OCL-01", "OCL", inv="INV-01")
def ocl_01_caso_con_escena(doc):
    """OCL-01. Un caso debe contener al menos una escena.

    context Caso
    inv OCL01: self.escenas->size() >= 1

    Valida que la clave `escenas` exista, sea una lista y tenga al menos un
    elemento. Sin escenas no hay situación que recorrer.
    """
    escenas = doc.get("escenas")
    if isinstance(escenas, list) and len(escenas) >= 1:
        return Resultado(1)
    return Resultado(1, [_h(f"Caso {_id_caso(doc)}", "escenas", "El caso no tiene escenas; se exige al menos una.")])


@regla("OCL-02", "OCL", inv="INV-02")
def ocl_02_decision_con_dos_opciones(doc):
    """OCL-02. Una decisión debe tener como mínimo dos opciones.

    context Decision
    inv OCL02: self.opciones->size() >= 2

    Se evalúa cada decisión de cada escena. Con una sola opción el estudiante no
    elige nada. No hay máximo: la situación puede necesitar las que requiera (RN-11).
    """
    decisiones = _decisiones(doc)
    if not decisiones:
        return Resultado(no_aplica="el caso no tiene decisiones")
    hallazgos = []
    for i, escena, decision in decisiones:
        opciones = decision.get("opciones")
        n = len(opciones) if isinstance(opciones, list) else 0
        if n < 2:
            cuantas = "no tiene opciones" if n == 0 else "tiene una sola opción"
            hallazgos.append(
                _h(
                    f"Decisión {_etq(decision)}",
                    f"escenas[{i}].decision.opciones",
                    f"La decisión de la escena {_etq(escena)} {cuantas}; se exigen al menos 2.",
                )
            )
    return Resultado(len(decisiones), hallazgos)


@regla("OCL-03", "OCL", inv="INV-03")
def ocl_03_opcion_con_escena_existente(doc):
    """OCL-03. Una opción de decisión debe referenciar una escena existente.

    context OpcionDecision
    inv OCL03: self.decision.escena.caso.escenas->includes(self.escenaDestino)

    En el JSON, `escenaDestino` es `siguienteEscena`. Falla si la clave falta o si
    su valor no es el `id` de ninguna escena del caso.
    """
    opciones = _opciones(doc)
    if not opciones:
        return Resultado(no_aplica="el caso no tiene opciones")
    ids = _ids(_escenas(doc))
    hallazgos = []
    for i, escena, decision, j, opcion in opciones:
        if _en(opcion.get("siguienteEscena"), ids):
            continue
        ruta = f"escenas[{i}].decision.opciones[{j}].siguienteEscena"
        if opcion.get("siguienteEscena") is None:  # falta la clave o es null
            mensaje = "La opción no declara la escena a la que conduce (siguienteEscena)."
        else:
            mensaje = f"La opción conduce a la escena «{opcion['siguienteEscena']}», que no existe en el caso."
        hallazgos.append(_h(f"Opción {_etq(opcion)}", ruta, mensaje))
    return Resultado(len(opciones), hallazgos)


@regla("OCL-04", "OCL", inv="INV-04")
def ocl_04_decisiones_sin_identificador_repetido(doc):
    """OCL-04. Una escena no puede tener dos decisiones con el mismo identificador.

    context Caso
    inv OCL04: self.escenas->select(e | e.decision->notEmpty())
        ->collect(e | e.decision)->isUnique(id)

    Una escena presenta como máximo una decisión (cardinalidad 0..1), así que la
    regla se formula sobre el caso: ninguna escena puede usar un identificador de
    decisión que ya usa otra. Los registros y las retroalimentaciones citan las
    decisiones por su identificador y se volverían ambiguos. El modelo no tiene
    `Escena.decisiones`: la regla no se puede formular en `context Escena`.
    """
    decisiones = _decisiones(doc)
    if not decisiones:
        return Resultado(no_aplica="el caso no tiene decisiones")
    primera_vez, hallazgos = {}, []
    for i, escena, decision in decisiones:
        ident = decision.get("id")
        if not isinstance(ident, str):
            continue
        if ident in primera_vez:
            hallazgos.append(
                _h(
                    f"Decisión {ident} (escena {_etq(escena)})",
                    f"escenas[{i}].decision.id",
                    f"El identificador «{ident}» ya lo usa la decisión de la escena {primera_vez[ident]}.",
                )
            )
        else:
            primera_vez[ident] = _etq(escena)
    return Resultado(len(decisiones), hallazgos)


@regla("OCL-05", "OCL", inv="INV-05")
def ocl_05_herramienta_definida_en_el_caso(doc):
    """OCL-05. Una herramienta utilizada dentro de una escena debe estar previamente definida en el caso.

    context OpcionDecision
    inv OCL05: self.herramientaUsada->notEmpty() implies
        self.decision.escena.caso.herramientas->includes(self.herramientaUsada)

    En el JSON, `herramientaUsada` es `herramienta`. Una herramienta se usa dentro
    de una escena cuando una opción de la decisión de esa escena la nombra; debe
    estar en el catálogo `herramientas` del caso. Un `herramienta: null` no usa
    ninguna herramienta (en OCL, `notEmpty()` sobre un valor nulo es falso): el
    esquema lo informa como error de tipo y esta regla no lo repite.
    """
    usos = [t for t in _opciones(doc) if t[4].get("herramienta") is not None]
    if not usos:
        return Resultado(no_aplica="ninguna opción usa una herramienta")
    definidas = _ids(_objetos(doc.get("herramientas")))
    hallazgos = []
    for i, escena, decision, j, opcion in usos:
        if _en(opcion.get("herramienta"), definidas):
            continue
        hallazgos.append(
            _h(
                f"Opción {_etq(opcion)}",
                f"escenas[{i}].decision.opciones[{j}].herramienta",
                f"La herramienta «{opcion['herramienta']}» que usa la opción (decisión {_etq(decision)}, "
                f"escena {_etq(escena)}) no está definida en las herramientas del caso.",
            )
        )
    return Resultado(len(usos), hallazgos)


@regla("OCL-06", "OCL", inv="INV-06")
def ocl_06_retroalimentacion_asociada(doc):
    """OCL-06. Una retroalimentación debe estar asociada a una decisión u opción de decisión.

    context Retroalimentacion
    inv OCL06: self.decision->notEmpty() xor self.opcion->notEmpty()

    Exactamente una de las dos asociaciones (`decision` u `opcion`), y lo asociado
    debe existir en el caso. La retroalimentación sin destino no se sabría cuándo
    mostrar; con dos destinos, a cuál explica. Una asociación con valor nulo es
    una asociación vacía (como en OCL); el error de tipo lo informa la forma.
    """
    retros = _objetos(doc.get("retroalimentacion"))
    if not retros:
        return Resultado(no_aplica="el caso no tiene retroalimentaciones")
    decisiones = _ids([(i, d) for i, _, d in _decisiones(doc)])
    opciones = _ids([(j, o) for _, _, _, j, o in _opciones(doc)])
    hallazgos = []
    for k, retro in retros:
        elemento, ruta = f"Retroalimentación {_etq(retro)}", f"retroalimentacion[{k}]"
        tiene_d, tiene_o = retro.get("decision") is not None, retro.get("opcion") is not None
        if not tiene_d and not tiene_o:
            mensaje = "No está asociada a ninguna decisión ni opción; se exige exactamente una de las dos."
        elif tiene_d and tiene_o:
            mensaje = "Está asociada a una decisión y a una opción a la vez; debe ser exactamente una de las dos."
        elif tiene_d and not _en(retro["decision"], decisiones):
            ruta, mensaje = ruta + ".decision", f"La decisión «{retro['decision']}» a la que se asocia no existe en el caso."
        elif tiene_o and not _en(retro["opcion"], opciones):
            ruta, mensaje = ruta + ".opcion", f"La opción «{retro['opcion']}» a la que se asocia no existe en el caso."
        else:
            continue
        hallazgos.append(_h(elemento, ruta, mensaje))
    return Resultado(len(retros), hallazgos)


@regla("OCL-07", "OCL", inv="INV-07")
def ocl_07_caso_con_titulo_y_descripcion(doc):
    """OCL-07. Un caso debe tener un título y una descripción.

    context Caso
    inv OCL07: self.titulo.trim().size() > 0 and self.descripcion.trim().size() > 0

    Un texto vacío o formado solo por espacios cuenta como ausente (de ahí el
    `trim()`). Sin título el caso no se puede elegir en el catálogo; sin
    descripción el estudiante no sabe en qué situación está.
    """
    caso = _caso(doc)
    nombres = {"titulo": "título", "descripcion": "descripción"}
    hallazgos = [
        _h(
            f"Caso {_id_caso(doc)}",
            f"caso.{clave}",
            f"El {nombre} del caso falta o está vacío." if clave == "titulo" else f"La {nombre} del caso falta o está vacía.",
        )
        for clave, nombre in nombres.items()
        if not _no_vacio(caso.get(clave))
    ]
    return Resultado(2, hallazgos)


@regla("OCL-08", "OCL", inv="INV-08")
def ocl_08_caso_con_punto_de_decision(doc):
    """OCL-08. Un caso debe contener al menos un punto de decisión.

    context Caso
    inv OCL08: self.escenas->exists(e | e.decision->notEmpty())

    Debe haber al menos una escena con `decision` (un objeto: `decision: null` no
    cuenta). Un caso de escenas sin decisión es un relato, no una simulación. Si
    el caso no tiene escenas, la regla no se evalúa: esa carencia ya la informa
    OCL-01 y no se repite aquí.
    """
    if not _escenas(doc):
        return Resultado(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
    if _decisiones(doc):
        return Resultado(1)
    return Resultado(
        1,
        [_h(f"Caso {_id_caso(doc)}", "escenas", "Ninguna escena presenta una decisión; el caso no tiene puntos de decisión.")],
    )


# ════════════════ Reglas PROPUESTAS por el equipo: PROP-01 a PROP-08 ════════════════
def _inventario_ids(doc):
    """(identificador, tipo, ruta) de todos los elementos del documento que tienen identificador."""
    salida = []

    def agregar(obj, tipo, ruta):
        if isinstance(obj.get("id"), str):
            salida.append((obj["id"], tipo, ruta))

    agregar(_caso(doc), "Caso", "caso")
    for i, x in _objetos(doc.get("personajes")):
        agregar(x, "Personaje", f"personajes[{i}]")
    for i, x in _objetos(doc.get("herramientas")):
        agregar(x, "Herramienta", f"herramientas[{i}]")
    for i, e in _escenas(doc):
        agregar(e, "Escena", f"escenas[{i}]")
    for i, _, d in _decisiones(doc):
        agregar(d, "Decisión", f"escenas[{i}].decision")
    for i, _, _, j, o in _opciones(doc):
        agregar(o, "Opción", f"escenas[{i}].decision.opciones[{j}]")
    for k, x in _objetos(doc.get("retroalimentacion")):
        agregar(x, "Retroalimentación", f"retroalimentacion[{k}]")
    for k, rub in _objetos(doc.get("rubricas")):
        agregar(rub, "Rúbrica", f"rubricas[{k}]")
        for c, crit in _objetos(rub.get("criterios")):
            agregar(crit, "Criterio", f"rubricas[{k}].criterios[{c}]")
    ejec = _ejecucion(doc)
    for k, x in _objetos(ejec.get("estudiantes")):
        agregar(x, "Estudiante", f"ejecucion.estudiantes[{k}]")
    for k, it in _objetos(ejec.get("intentos")):
        agregar(it, "Intento", f"ejecucion.intentos[{k}]")
        if isinstance(it.get("bitacora"), dict):
            agregar(it["bitacora"], "Bitácora", f"ejecucion.intentos[{k}].bitacora")
    for k, x in _objetos(ejec.get("evaluaciones")):
        agregar(x, "Evaluación", f"ejecucion.evaluaciones[{k}]")
    return salida


@regla("PROP-01", "PROPUESTA", inv="INV-13")
def prop_01_identificadores_unicos(doc):
    """PROP-01. Ningún identificador se repite en el documento (unicidad global).

    context Caso
    inv PROP01: let todos : Bag(String) =
        Caso.allInstances().id->union(Personaje.allInstances().id)
        ->union(Herramienta.allInstances().id)->union(Escena.allInstances().id)
        ->union(OpcionDecision.allInstances().id)
        ->union(Retroalimentacion.allInstances().id)
        ->union(Rubrica.allInstances().id)->union(CriterioRubrica.allInstances().id)
        ->union(Estudiante.allInstances().id)->union(Intento.allInstances().id)
        ->union(Bitacora.allInstances().id)->union(Evaluacion.allInstances().id) in
        todos->isUnique(i | i)

    Una referencia por identificador solo es inequívoca si el identificador es
    único en todo el documento, sea cual sea el tipo de elemento; por eso el
    inventario incluye también el del caso, aunque nada lo referencie. Los
    identificadores de decisión los cubre OCL-04 y aquí no se repiten.
    `allInstances()` se lee como «todos los elementos de esa clase en el documento».
    """
    inventario = [t for t in _inventario_ids(doc) if t[1] != "Decisión"]
    if not inventario:
        return Resultado(no_aplica="el documento no tiene elementos con identificador")
    primero, hallazgos = {}, []
    for ident, tipo, ruta in inventario:
        if ident in primero:
            otro_tipo, otra_ruta = primero[ident]
            hallazgos.append(
                _h(f"{tipo} {ident}", ruta + ".id",
                   f"El identificador «{ident}» ya lo usa otro elemento del documento "
                   f"({otro_tipo.lower()}, en {otra_ruta}).")
            )
        else:
            primero[ident] = (tipo, ruta)
    return Resultado(len(inventario), hallazgos)


@regla("PROP-02", "PROPUESTA", inv="INV-09, INV-11")
def prop_02_escenas_alcanzables(doc):
    """PROP-02. La escena inicial existe y toda escena es alcanzable desde ella.

    context Escena
    def: siguientes : Set(Escena) =
        if self.decision->isEmpty() then Set{}
        else self.decision.opciones.escenaDestino->asSet() endif

    context Caso
    inv PROP02: self.escenas->includes(self.escenaInicial) and
        self.escenas->forAll(e | e = self.escenaInicial or
            self.escenaInicial.siguientes->closure(siguientes)->includes(e))

    `siguientes` (Fase 1, §6.2) son las escenas a las que conducen las opciones de
    la escena; una conclusión no tiene ninguna. Una escena a la que ningún camino
    llega es contenido que el estudiante nunca verá y que, al publicar, nadie
    revisaría. Si el caso no tiene escenas, la regla no se evalúa (lo informa
    OCL-01).
    """
    escenas = _escenas(doc)
    if not escenas:
        return Resultado(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
    inicial = _caso(doc).get("escenaInicial")
    ids = _ids(escenas)
    if not _en(inicial, ids):
        mensaje = (
            "El caso no declara su escena inicial (escenaInicial)."
            if inicial is None
            else f"La escena inicial «{inicial}» no existe en el caso."
        )
        return Resultado(1, [_h(f"Caso {_id_caso(doc)}", "caso.escenaInicial", mensaje)])
    vistas = _alcanzables(_grafo(doc), inicial)
    hallazgos = [
        _h(
            f"Escena {e['id']}",
            f"escenas[{i}]",
            f"La escena no es alcanzable desde la escena inicial {inicial}: ninguna secuencia de opciones llega a ella.",
        )
        for i, e in escenas
        if isinstance(e.get("id"), str) and e["id"] not in vistas
    ]
    return Resultado(len(escenas), hallazgos)


@regla("PROP-03", "PROPUESTA", inv="INV-14")
def prop_03_personajes_existentes(doc):
    """PROP-03. Los personajes que participan en una escena están definidos en el caso.

    context Escena
    inv PROP03: self.caso.personajes->includesAll(self.participantes)

    `participantes` es una lista de identificadores; cada uno debe corresponder a
    un elemento de `personajes`. Evita escenas con personas que el caso no describe.
    """
    referencias = [
        (i, e, k, p)
        for i, e in _escenas(doc)
        for k, p in enumerate(_lista(e.get("participantes")))
    ]
    if not referencias:
        return Resultado(no_aplica="ninguna escena declara participantes")
    definidos = _ids(_objetos(doc.get("personajes")))
    hallazgos = [
        _h(
            f"Escena {_etq(e)}",
            f"escenas[{i}].participantes[{k}]",
            f"La escena menciona al personaje «{p}», que no está definido en los personajes del caso.",
        )
        for i, e, k, p in referencias
        if not _en(p, definidos)
    ]
    return Resultado(len(referencias), hallazgos)


def _recorrido(doc, intento, opciones):
    """Reconstruye el camino de un intento aplicando sus decisiones en orden.

    Devuelve (pasos, escena final, completo). Cada paso es (posición del registro,
    registro, id de opción, escena a la que pertenece la opción, escena en que
    estaba el intento, escena en que queda). El recorrido se detiene en la primera
    incoherencia: de ahí en adelante ya no se sabe dónde estaba el estudiante.
    """
    ids = _ids(_escenas(doc))
    actual = _caso(doc).get("escenaInicial")
    if not _en(actual, ids):
        return [], actual, False
    bitacora = intento.get("bitacora") if isinstance(intento.get("bitacora"), dict) else {}
    pasos = []
    for m, registro in _objetos(bitacora.get("decisiones")):
        ident = registro.get("opcionElegida")
        info = opciones.get(ident) if isinstance(ident, str) else None
        if info is None:
            pasos.append((m, registro, ident, None, actual, None))
            return pasos, actual, False
        duena, opcion = info
        if duena != actual:
            pasos.append((m, registro, ident, duena, actual, None))
            return pasos, actual, False
        aplicada = registro.get("aplicada", True) is not False
        destino = opcion.get("siguienteEscena")
        if aplicada and not _en(destino, ids):
            pasos.append((m, registro, ident, duena, actual, None))
            return pasos, actual, False
        despues = destino if aplicada else actual
        pasos.append((m, registro, ident, duena, actual, despues))
        actual = despues
    return pasos, actual, True


@regla("PROP-04", "PROPUESTA", inv="INV-18")
def prop_04_opcion_pertenece_a_su_decision(doc):
    """PROP-04. La opción elegida en la bitácora pertenece a la decisión de la escena en que estaba el intento.

    context RegistroDecision
    inv PROP04: self.opcionElegida.decision.escena = self.escenaEnCurso
    -- escenaEnCurso no es un rol ni un atributo del modelo: es derivada. Se
    -- reconstruye partiendo de escenaInicial y aplicando, en orden, las opciones
    -- de los registros con aplicada = true.

    Una opción pertenece a la decisión de una sola escena. Un registro que cita la
    opción de otra decisión describe un recorrido que el caso no permite. Si la
    escena inicial no existe no hay recorrido que reconstruir y la regla no se
    evalúa (lo informa PROP-02).
    """
    intentos = _intentos(doc)
    if not any(_registros(intento) for _, intento in intentos):
        return Resultado(no_aplica="el documento no trae decisiones registradas en una bitácora")
    opciones = _mapa_opciones(doc)
    evaluados, hallazgos = 0, []
    for k, intento in intentos:
        pasos, _, _ = _recorrido(doc, intento, opciones)
        evaluados += len(pasos)
        for m, registro, ident, duena, antes, _ in pasos:
            if duena is not None and duena != antes:
                hallazgos.append(
                    _h(
                        f"Registro de decisión {registro.get('orden', m + 1)} del intento {_etq(intento)}",
                        f"ejecucion.intentos[{k}].bitacora.decisiones[{m}].opcionElegida",
                        f"La opción «{ident}» pertenece a la decisión de la escena {duena}, "
                        f"pero el intento estaba en la escena {antes} "
                        "(el recorrido avanza solo con las decisiones aplicadas, aplicada = true).",
                    )
                )
    if evaluados == 0:  # no hay desde dónde reconstruir el recorrido: la escena inicial no existe
        return Resultado(no_aplica="no se pudo reconstruir el recorrido: la escena inicial no existe (lo informa PROP-02)")
    return Resultado(evaluados, hallazgos)


@regla("PROP-05", "PROPUESTA", inv="INV-17, INV-18")
def prop_05_bitacora_coherente(doc):
    """PROP-05. El registro de la bitácora es coherente con el caso y con el intento.

    context Bitacora
    inv PROP05a: self.decisiones->forAll(r |
        r.opcionElegida.decision.escena.caso = self.intento.caso)
    inv PROP05b: self.decisiones->sortedBy(orden)->collect(orden)
        = Sequence{1..self.decisiones->size()}
    inv PROP05c: self.reflexiones->isUnique(escena) and
        self.intento.caso.escenas->includesAll(self.reflexiones.escena)
    inv PROP05d: self.intento.estado = EstadoIntento::COMPLETADO implies
        self.intento.escenaActual.decision->isEmpty()
    inv PROP05e: self.intento.estado = EstadoIntento::COMPLETADO implies
        self.intento.finalizadoEn =
            self.decisiones->select(aplicada)->sortedBy(orden)->last().momento
    inv PROP05f: self.intento.finalizadoEn.oclIsUndefined() or
        self.intento.finalizadoEn >= self.intento.iniciadoEn
    inv PROP05g: self.reflexiones->forAll(r | r.momento >= self.intento.iniciadoEn and
        (self.intento.finalizadoEn.oclIsUndefined() or
         r.momento <= self.intento.finalizadoEn))
    inv PROP05h: (self.intento.estado = EstadoIntento::EN_CURSO or
        self.intento.estado = EstadoIntento::PAUSADO) implies
        self.intento.escenaActual.decision->notEmpty()

    Comprueba, por intento: que cada opción elegida exista; que `orden` sea
    1, 2, 3… sin repetir ni saltar; que los momentos no retrocedan ni salgan del
    intervalo del intento (que no termine antes de empezar y que ninguna decisión
    ni reflexión sea posterior al cierre, porque la bitácora ya está bloqueada);
    que haya a lo sumo una reflexión por escena y sobre una escena existente; que
    `escenaActual` sea donde dejan al intento sus decisiones aplicadas; que uno
    COMPLETADO termine en una conclusión y se cierre en el momento de su última
    decisión aplicada, y que uno abierto (EN_CURSO o PAUSADO) no esté ya en una
    conclusión.

    No comprueba que `aplicada` siga la regla de reconsideración del motor (la
    primera respuesta riesgosa o inadecuada de una escena no avanza): es política
    del simulador, no del DSL. El recorrido se reconstruye con lo que el documento
    declara en `aplicada`.
    """
    intentos = _intentos(doc)
    if not intentos:
        return Resultado(no_aplica="el documento no trae intentos (ejecucion)")
    opciones = _mapa_opciones(doc)
    escenas = {e["id"]: e for _, e in _escenas(doc) if isinstance(e.get("id"), str)}
    hallazgos = []
    for k, intento in intentos:
        etiqueta = f"Intento {_etq(intento)}"
        base = f"ejecucion.intentos[{k}]"
        bitacora = intento.get("bitacora") if isinstance(intento.get("bitacora"), dict) else {}
        registros = _objetos(bitacora.get("decisiones"))

        # a. cada opción elegida existe en el caso (INV-18)
        pasos, final, completo = _recorrido(doc, intento, opciones)
        for m, registro, ident, duena, _, _ in pasos:
            if duena is None:
                hallazgos.append(
                    _h(
                        f"Registro de decisión {registro.get('orden', m + 1)} del intento {_etq(intento)}",
                        f"{base}.bitacora.decisiones[{m}].opcionElegida",
                        f"La opción elegida «{ident}» no existe en el caso.",
                    )
                )
        for m, registro in registros:  # opciones que el recorrido no alcanzó a revisar
            ident = registro.get("opcionElegida")
            if not any(p[0] == m for p in pasos) and not _en(ident, opciones):
                hallazgos.append(
                    _h(
                        f"Registro de decisión {registro.get('orden', m + 1)} del intento {_etq(intento)}",
                        f"{base}.bitacora.decisiones[{m}].opcionElegida",
                        f"La opción elegida «{ident}» no existe en el caso.",
                    )
                )

        # b. orden consecutivo 1..n, sin repetir ni saltar (primera infracción)
        for posicion, (m, registro) in enumerate(registros, start=1):
            if registro.get("orden") != posicion:
                hallazgos.append(
                    _h(
                        f"Registro de decisión en la posición {posicion} del intento {_etq(intento)}",
                        f"{base}.bitacora.decisiones[{m}].orden",
                        f"El registro ocupa la posición {posicion} y declara orden {registro.get('orden')}; "
                        "los registros se numeran 1, 2, 3… sin repetir ni saltar.",
                    )
                )
                break

        # c. momentos: el intento no termina antes de empezar; los registros no retroceden
        #    y quedan dentro del intento (primera infracción)
        inicio, fin = _fecha(intento.get("iniciadoEn")), _fecha(intento.get("finalizadoEn"))
        if inicio is not None and fin is not None and fin < inicio:
            hallazgos.append(
                _h(etiqueta, f"{base}.finalizadoEn",
                   "El intento termina antes de empezar: finalizadoEn es anterior a iniciadoEn.")
            )
            fin = None  # sin un cierre coherente no se comparan los demás momentos con él
        anterior = inicio
        for m, registro in registros:
            momento = _fecha(registro.get("momento"))
            if momento is None:
                continue
            motivo = None
            if anterior is not None and momento < anterior:
                motivo = "es anterior al registro previo o al inicio del intento"
            elif fin is not None and momento > fin:
                motivo = "es posterior al cierre del intento"
            if motivo:
                hallazgos.append(
                    _h(
                        f"Registro de decisión {registro.get('orden', m + 1)} del intento {_etq(intento)}",
                        f"{base}.bitacora.decisiones[{m}].momento",
                        f"El momento del registro {motivo}.",
                    )
                )
                break
            anterior = momento

        # c2. un intento COMPLETADO se cierra en el instante de la decisión que llega a la conclusión
        aplicadas = [r for _, r in registros if r.get("aplicada", True) is not False]
        if intento.get("estado") == "COMPLETADO" and fin is not None and aplicadas:
            ultima = _fecha(aplicadas[-1].get("momento"))
            if ultima is not None and ultima != fin:
                hallazgos.append(
                    _h(etiqueta, f"{base}.finalizadoEn",
                       "El intento está COMPLETADO y se cierra en el momento de la decisión que llega a la "
                       f"conclusión ({aplicadas[-1].get('momento')}), pero finalizadoEn es {intento.get('finalizadoEn')}.")
                )

        # d. reflexiones: una por escena, sobre una escena existente (INV-17) y dentro del intento (INV-19)
        vistas = set()
        for m, reflexion in _objetos(bitacora.get("reflexiones")):
            escena = reflexion.get("escena")
            ruta = f"{base}.bitacora.reflexiones[{m}].escena"
            if isinstance(escena, str) and escena in vistas:
                hallazgos.append(_h(f"Reflexión sobre la escena {escena} del intento {_etq(intento)}", ruta,
                                    f"Hay más de una reflexión para la escena {escena}; se admite una por escena."))
            elif isinstance(escena, str):
                vistas.add(escena)
            if not _en(escena, escenas):
                hallazgos.append(_h(f"Reflexión del intento {_etq(intento)}", ruta,
                                    f"La reflexión se refiere a la escena «{escena}», que no existe en el caso."))
            momento = _fecha(reflexion.get("momento"))
            if momento is not None:
                rotulo = (f"Reflexión sobre la escena {escena} del intento {_etq(intento)}"
                          if isinstance(escena, str) else f"Reflexión del intento {_etq(intento)}")
                ruta_momento = f"{base}.bitacora.reflexiones[{m}].momento"
                if fin is not None and momento > fin:
                    hallazgos.append(_h(rotulo, ruta_momento,
                                        "El momento de la reflexión es posterior al cierre del intento: "
                                        "la bitácora ya estaba bloqueada."))
                elif inicio is not None and momento < inicio:
                    hallazgos.append(_h(rotulo, ruta_momento,
                                        "El momento de la reflexión es anterior al inicio del intento."))

        # e. escena actual y estado coherentes con las decisiones aplicadas
        if completo:
            declarada = intento.get("escenaActual")
            en_conclusion = final in escenas and not isinstance(escenas[final].get("decision"), dict)
            if declarada != final:
                hallazgos.append(
                    _h(etiqueta, f"{base}.escenaActual",
                       f"El intento declara escenaActual «{declarada}», pero sus decisiones aplicadas lo dejan en la escena «{final}».")
                )
            elif intento.get("estado") == "COMPLETADO" and not en_conclusion:
                hallazgos.append(
                    _h(etiqueta, f"{base}.estado",
                       f"El intento figura COMPLETADO pero termina en la escena {final}, que presenta una decisión (no es una conclusión).")
                )
            elif intento.get("estado") in ABIERTOS and en_conclusion:
                hallazgos.append(
                    _h(etiqueta, f"{base}.estado",
                       f"El intento figura {intento.get('estado')} pero sus decisiones aplicadas ya lo dejan en la "
                       f"conclusión {final}; llegar a una conclusión cierra el intento (COMPLETADO).")
                )
    return Resultado(len(intentos), hallazgos)


@regla("PROP-06", "PROPUESTA", inv="INV-10")
def prop_06_flujo_aciclico(doc):
    """PROP-06. El flujo del caso no contiene ciclos.

    context Escena
    inv PROP06: not self.siguientes->closure(siguientes)->includes(self)

    `siguientes` es la definición de PROP-02 (Fase 1, §6.2). Ninguna secuencia de
    opciones puede volver a una escena ya recorrida. Con un ciclo, el caso podría
    no terminar nunca y no habría garantía de llegar a una conclusión. Se informa
    la opción que cierra el ciclo. El recorrido es iterativo: un caso con miles de
    escenas encadenadas no agota la pila de Python.
    """
    if not _escenas(doc):
        return Resultado(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
    grafo = _grafo(doc)
    estado, cierres = {}, []
    for inicio in grafo:
        if inicio in estado:
            continue
        estado[inicio] = 1  # en el camino actual
        camino = [inicio]
        pila = [iter(grafo[inicio])]
        while pila:
            avanzo = False
            for opcion, destino, ruta in pila[-1]:
                if estado.get(destino) == 1:
                    cierres.append((camino[-1], destino, opcion, ruta, camino[camino.index(destino):] + [destino]))
                elif destino not in estado:
                    estado[destino] = 1
                    camino.append(destino)
                    pila.append(iter(grafo.get(destino, [])))
                    avanzo = True
                    break
            if not avanzo:  # todas las opciones de la escena revisadas
                estado[camino.pop()] = 2
                pila.pop()
    hallazgos = [
        _h(f"Opción {opcion}", ruta,
           f"La opción lleva de la escena {origen} a la escena {destino}, que ya forma parte del camino: "
           f"el flujo contiene un ciclo ({' -> '.join(camino)}).")
        for origen, destino, opcion, ruta, camino in cierres
    ]
    return Resultado(len(grafo), hallazgos)


@regla("PROP-07", "PROPUESTA", inv="INV-20")
def prop_07_evaluacion_coherente_con_la_rubrica(doc):
    """PROP-07. La rúbrica del caso existe y las evaluaciones la aplican de forma coherente.

    context Evaluacion
    inv PROP07a: self.valoraciones->forAll(v | self.rubrica.criterios->includes(v.criterio))
    inv PROP07b: self.estado = EstadoEvaluacion::EVALUADA implies
        self.valoraciones->size() = self.rubrica.criterios->size()
    inv PROP07c: self.rubrica = self.intento.caso.rubrica
    inv PROP07d: self.rubrica.activa
    inv PROP07e: self.origen = OrigenEvaluacion::SISTEMA and
        not self.evaluadaEn.oclIsUndefined() and
        not self.intento.finalizadoEn.oclIsUndefined() implies
        self.evaluadaEn >= self.intento.finalizadoEn

    Comprueba que `caso.rubrica` y `evaluaciones[].intento` / `.rubrica` existan,
    que la rúbrica aplicada sea la del caso (un caso sin rúbrica no tiene cuál
    aplicar) y esté activa, que cada criterio valorado sea de la rúbrica, que no
    se valore dos veces el mismo criterio, que una evaluación EVALUADA cubra todos
    los criterios y que la valoración del SISTEMA no sea anterior al cierre del
    intento que valora.
    """
    caso = _caso(doc)
    rubricas = {r["id"]: r for _, r in _objetos(doc.get("rubricas")) if isinstance(r.get("id"), str)}
    evaluaciones = _objetos(_ejecucion(doc).get("evaluaciones"))
    declarada = caso.get("rubrica")
    if declarada is None and not evaluaciones:
        return Resultado(no_aplica="el caso no declara rúbrica y no trae evaluaciones")
    hallazgos, evaluados = [], 0
    if declarada is not None:
        evaluados += 1
        if not _en(declarada, rubricas):
            hallazgos.append(_h(f"Caso {_id_caso(doc)}", "caso.rubrica", f"La rúbrica «{declarada}» del caso no está en rubricas."))
    intentos = {i["id"]: i for _, i in _intentos(doc) if isinstance(i.get("id"), str)}
    for k, ev in evaluaciones:
        evaluados += 1
        etiqueta, base = f"Evaluación {_etq(ev)}", f"ejecucion.evaluaciones[{k}]"
        if not _en(ev.get("intento"), intentos):
            hallazgos.append(_h(etiqueta, f"{base}.intento", f"El intento «{ev.get('intento')}» que se evalúa no existe."))
        rubrica = rubricas.get(ev.get("rubrica")) if isinstance(ev.get("rubrica"), str) else None
        if rubrica is None:
            hallazgos.append(_h(etiqueta, f"{base}.rubrica", f"La rúbrica «{ev.get('rubrica')}» que se aplica no existe."))
            continue
        if ev.get("rubrica") != declarada:
            if declarada is None:
                mensaje = f"Aplica la rúbrica {ev.get('rubrica')}, pero el caso no declara ninguna rúbrica (caso.rubrica)."
            else:
                mensaje = f"Aplica la rúbrica {ev.get('rubrica')}, pero el caso declara la rúbrica {declarada}."
            hallazgos.append(_h(etiqueta, f"{base}.rubrica", mensaje))
        if rubrica.get("activa") is False:  # si falta o no es booleano, lo informa la forma
            hallazgos.append(_h(etiqueta, f"{base}.rubrica",
                                f"La rúbrica {ev.get('rubrica')} no está activa; solo una rúbrica activa se puede aplicar."))
        intento = intentos.get(ev.get("intento")) if isinstance(ev.get("intento"), str) else None
        if intento is not None and ev.get("origen") == "SISTEMA":
            cierre, hecha = _fecha(intento.get("finalizadoEn")), _fecha(ev.get("evaluadaEn"))
            if cierre is not None and hecha is not None and hecha < cierre:
                hallazgos.append(_h(etiqueta, f"{base}.evaluadaEn",
                                    f"La valoración del sistema ({ev.get('evaluadaEn')}) es anterior al cierre del "
                                    f"intento que valora ({intento.get('finalizadoEn')}): el sistema valora al cerrar."))
        criterios = {c["id"] for _, c in _objetos(rubrica.get("criterios")) if isinstance(c.get("id"), str)}
        valorados = [v.get("criterio") for _, v in _objetos(ev.get("valoraciones"))]
        ajenos = sorted({str(c) for c in valorados if not _en(c, criterios)})
        if ajenos:
            hallazgos.append(_h(etiqueta, f"{base}.valoraciones",
                                f"Valora criterios que no son de la rúbrica {ev.get('rubrica')}: {', '.join(ajenos)}."))
        repetidos = sorted({str(c) for c in valorados if valorados.count(c) > 1})
        if repetidos:
            hallazgos.append(_h(etiqueta, f"{base}.valoraciones",
                                f"Valora más de una vez el criterio {', '.join(repetidos)}."))
        faltan = sorted(criterios - {c for c in valorados if isinstance(c, str)})
        if ev.get("estado") == "EVALUADA" and faltan:
            hallazgos.append(_h(etiqueta, f"{base}.valoraciones",
                                f"Está EVALUADA pero no valora todos los criterios de la rúbrica; faltan: {', '.join(faltan)}."))
    return Resultado(evaluados, hallazgos)


@regla("PROP-08", "PROPUESTA", inv="INV-16")
def prop_08_un_intento_abierto_por_estudiante(doc):
    """PROP-08. Los intentos son de estudiantes del documento y ninguno tiene dos abiertos.

    context Estudiante
    inv PROP08: self.intentos
        ->select(estado = EstadoIntento::EN_CURSO or estado = EstadoIntento::PAUSADO)
        ->isUnique(caso)

    Un estudiante repite un caso empezando un intento nuevo, pero no tiene dos
    abiertos (EN_CURSO o PAUSADO) del mismo caso a la vez (RN-06, RN-07). Además,
    `intentos[].estudiante` debe existir en `ejecucion.estudiantes`.
    """
    intentos = _intentos(doc)
    if not intentos:
        return Resultado(no_aplica="el documento no trae intentos (ejecucion)")
    estudiantes = _ids(_objetos(_ejecucion(doc).get("estudiantes")))
    hallazgos, abiertos = [], collections.OrderedDict()
    for k, intento in intentos:
        if not _en(intento.get("estudiante"), estudiantes):
            hallazgos.append(
                _h(f"Intento {_etq(intento)}", f"ejecucion.intentos[{k}].estudiante",
                   f"El estudiante «{intento.get('estudiante')}» no existe en ejecucion.estudiantes.")
            )
        if intento.get("estado") in ABIERTOS and isinstance(intento.get("estudiante"), str):
            abiertos.setdefault(intento["estudiante"], []).append((k, _etq(intento)))
    for estudiante, lista in abiertos.items():
        if len(lista) > 1:
            nombres = ", ".join(n for _, n in lista)
            k = lista[1][0]
            hallazgos.append(
                _h(f"Estudiante {estudiante}", f"ejecucion.intentos[{k}]",
                   f"Tiene {len(lista)} intentos abiertos del caso a la vez ({nombres}); se admite uno.")
            )
    return Resultado(len(intentos), hallazgos)


# ═════════════════ Capa de forma: intérprete del JSON Schema usado ═════════════════
ETIQUETAS_RUTA = {
    "caso": "Caso", "personajes": "Personaje", "herramientas": "Herramienta", "escenas": "Escena",
    "decision": "Decisión", "opciones": "Opción", "retroalimentacion": "Retroalimentación",
    "rubricas": "Rúbrica", "criterios": "Criterio", "estudiantes": "Estudiante", "intentos": "Intento",
    "bitacora": "Bitácora", "decisiones": "Registro de decisión", "reflexiones": "Reflexión",
    "evaluaciones": "Evaluación", "valoraciones": "Valoración",
}


def ruta_texto(ruta):
    """('escenas', 1, 'decision') -> 'escenas[1].decision'."""
    texto = ""
    for paso in ruta:
        if isinstance(paso, int):
            texto += f"[{paso}]"
        else:
            texto += ("." if texto else "") + str(paso)
    return texto or "(raíz)"


def _rotular(tipo, objeto):
    ident = objeto.get("id")
    if isinstance(ident, str):
        return f"{tipo} {ident}"
    if "orden" in objeto:
        return f"{tipo} {objeto['orden']}"
    if isinstance(objeto.get("escena"), str):
        return f"{tipo} sobre la escena {objeto['escena']}"
    return tipo


def elemento_en(doc, ruta):
    """Nombre legible del elemento más cercano con identificador que contiene la ruta."""
    nodo, rotulo, clave = doc, "Documento", None
    for paso in ruta:
        try:
            nodo = nodo[paso]
        except (KeyError, IndexError, TypeError):
            break
        if isinstance(paso, str):
            clave = paso
            if paso in ETIQUETAS_RUTA and isinstance(nodo, dict):
                rotulo = _rotular(ETIQUETAS_RUTA[paso], nodo)
        elif clave in ETIQUETAS_RUTA and isinstance(nodo, dict):
            rotulo = _rotular(ETIQUETAS_RUTA[clave], nodo)
    return rotulo


def _igual(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    return a == b


def _es_tipo(valor, tipo):
    if tipo == "object":
        return isinstance(valor, dict)
    if tipo == "array":
        return isinstance(valor, list)
    if tipo == "string":
        return isinstance(valor, str)
    if tipo == "boolean":
        return isinstance(valor, bool)
    if tipo == "null":
        return valor is None
    if tipo == "integer":
        return (isinstance(valor, int) and not isinstance(valor, bool)) or (
            isinstance(valor, float) and valor.is_integer()
        )
    if tipo == "number":
        return isinstance(valor, (int, float)) and not isinstance(valor, bool)
    return False


_NOMBRE_TIPO = {"object": "un objeto", "array": "una lista", "string": "un texto", "boolean": "un booleano",
                "integer": "un entero", "number": "un número", "null": "nulo"}


def _tipo_de(valor):
    for tipo in ("null", "boolean", "integer", "number", "string", "array", "object"):
        if _es_tipo(valor, tipo):
            return _NOMBRE_TIPO[tipo]
    return type(valor).__name__


class InterpreteEsquema:
    """Valida un documento contra la parte de JSON Schema (draft 2020-12) que usa
    ``dsl-casos.schema.json``. Cada error lleva la regla del dominio que el
    esquema anota con ``x-regla`` en el punto donde lo hace cumplir.

    Palabras clave: $ref, type, const, enum, pattern, minLength, minimum, minItems,
    uniqueItems, items, contains, required, properties, additionalProperties
    (false), allOf, oneOf, not, if/then/else. Las demás se ignoran, igual que las
    anotaciones (title, description, default, format, x-regla, x-referencia).
    """

    def __init__(self, esquema):
        self.raiz = esquema

    def errores(self, instancia):
        salida = []
        self._validar(instancia, self.raiz, (), None, None, salida)
        return salida

    def _resolver(self, ref):
        prefijo = "#/$defs/"
        if ref == "#":
            return self.raiz
        if not ref.startswith(prefijo):
            raise ValueError(f"$ref no soportada: {ref}")
        return self.raiz["$defs"][ref[len(prefijo):]]

    def _validar(self, inst, nodo, ruta, heredada, fija, salida):
        if not isinstance(nodo, dict):
            return
        propia = nodo.get("x-regla")
        regla_aplicable = propia or fija or heredada

        def error(palabra, mensaje, regla_=None):
            salida.append({"ruta": ruta, "palabra": palabra, "mensaje": mensaje,
                           "regla": regla_ or regla_aplicable})

        if "$ref" in nodo:
            self._validar(inst, self._resolver(nodo["$ref"]), ruta, regla_aplicable, fija, salida)

        if "type" in nodo:
            tipos = nodo["type"] if isinstance(nodo["type"], list) else [nodo["type"]]
            if not any(_es_tipo(inst, t) for t in tipos):
                esperado = " o ".join(_NOMBRE_TIPO.get(t, t) for t in tipos)
                error("type", f"se esperaba {esperado} y se encontró {_tipo_de(inst)}")
        if "const" in nodo and not _igual(inst, nodo["const"]):
            error("const", f"el valor debe ser «{json.dumps(nodo['const'], ensure_ascii=False)}»")
        if "enum" in nodo and not any(_igual(inst, v) for v in nodo["enum"]):
            posibles = ", ".join(str(v) for v in nodo["enum"])
            error("enum", f"el valor «{inst}» no está permitido; valores posibles: {posibles}")

        if isinstance(inst, str):
            if "minLength" in nodo and len(inst) < nodo["minLength"]:
                error("minLength", "el texto no puede estar vacío")
            if "pattern" in nodo and not re.search(nodo["pattern"], inst):
                if nodo["pattern"] == "\\S":
                    error("pattern", "el texto está vacío o solo tiene espacios")
                else:
                    visible = nodo["pattern"].replace("(?![\\s\\S])", "$")  # el esquema escribe así el fin del texto
                    error("pattern", f"«{inst}» no tiene el formato esperado ({visible})")
        if isinstance(inst, (int, float)) and not isinstance(inst, bool):
            if "minimum" in nodo and inst < nodo["minimum"]:
                error("minimum", f"el valor {inst} es menor que el mínimo {nodo['minimum']}")

        if isinstance(inst, list):
            if "minItems" in nodo and len(inst) < nodo["minItems"]:
                error("minItems", f"la lista tiene {len(inst)} elemento(s); se exigen al menos {nodo['minItems']}")
            if nodo.get("uniqueItems"):
                vistos = []
                for x in inst:
                    if any(_igual(x, y) for y in vistos):
                        error("uniqueItems", "la lista tiene elementos repetidos")
                        break
                    vistos.append(x)
            if "items" in nodo:
                for i, x in enumerate(inst):
                    self._validar(x, nodo["items"], ruta + (i,), None, fija, salida)
            if "contains" in nodo:
                cumple = False
                for x in inst:
                    previos = []
                    self._validar(x, nodo["contains"], ruta, None, None, previos)
                    if not previos:
                        cumple = True
                        break
                if not cumple:
                    error("contains", "ningún elemento de la lista cumple la condición exigida")

        if isinstance(inst, dict):
            propiedades = nodo.get("properties", {})
            for clave in nodo.get("required", []):
                if clave not in inst:
                    regla_clave = propiedades.get(clave, {}).get("x-regla") if isinstance(propiedades.get(clave), dict) else None
                    error("required", f"falta la clave obligatoria «{clave}»", regla_clave)
            for clave, valor in inst.items():
                if clave in propiedades:
                    self._validar(valor, propiedades[clave], ruta + (clave,), None, fija, salida)
            if nodo.get("additionalProperties") is False:
                sobran = [c for c in inst if c not in propiedades]
                if sobran:
                    error("additionalProperties",
                          "clave(s) no admitida(s) en el DSL: " + ", ".join(f"«{c}»" for c in sobran))

        for sub in nodo.get("allOf", []):
            self._validar(inst, sub, ruta, regla_aplicable, fija, salida)
        if "oneOf" in nodo:
            validas = 0
            for sub in nodo["oneOf"]:
                previos = []
                self._validar(inst, sub, ruta, regla_aplicable, fija, previos)
                validas += not previos
            if validas != 1:
                error("oneOf", f"debe cumplir exactamente una de las alternativas y cumple {validas}")
        if "not" in nodo:
            previos = []
            self._validar(inst, nodo["not"], ruta, None, None, previos)
            if not previos:
                error("not", "contiene algo que en este estado no se admite")
        if "if" in nodo:
            previos = []
            self._validar(inst, nodo["if"], ruta, None, None, previos)
            rama = nodo.get("else") if previos else nodo.get("then")
            if rama is not None:
                self._validar(inst, rama, ruta, regla_aplicable, propia or fija, salida)


def _modulo_jsonschema():
    try:
        import jsonschema  # noqa: PLC0415 (importación diferida a propósito)
        return jsonschema
    except Exception:  # noqa: BLE001 - cualquier fallo de importación equivale a "no está"
        return None


def _version_jsonschema():
    try:
        from importlib import metadata

        return metadata.version("jsonschema")
    except Exception:  # noqa: BLE001
        return "desconocida"


def comprobacion_cruzada(esquema, doc, errores_propios):
    """Compara el veredicto del intérprete con el de ``jsonschema``, si está.

    Devuelve None cuando ``jsonschema`` no está instalado (degradación elegante).
    """
    modulo = _modulo_jsonschema()
    if modulo is None:
        return None
    try:
        validador = modulo.Draft202012Validator(esquema)
        ajenos = collections.Counter(
            (ruta_texto(tuple(e.absolute_path)), e.validator) for e in validador.iter_errors(doc)
        )
    except Exception as exc:  # noqa: BLE001
        return {"version": _version_jsonschema(), "coincide": False, "detalle": f"jsonschema falló: {exc}"}
    propios = collections.Counter((ruta_texto(e["ruta"]), e["palabra"]) for e in errores_propios)
    solo_propios = sorted((propios - ajenos).elements())
    solo_ajenos = sorted((ajenos - propios).elements())
    return {
        "version": _version_jsonschema(),
        "coincide": not solo_propios and not solo_ajenos,
        "soloInterprete": [list(t) for t in solo_propios],
        "soloJsonschema": [list(t) for t in solo_ajenos],
    }


# ═══════════════════════════ Orquestación por documento ═══════════════════════════
def resumen_caso(doc):
    caso = _caso(doc)
    return {
        "id": _texto_id(caso.get("id")),
        "titulo": caso.get("titulo") if isinstance(caso.get("titulo"), str) else None,
        "estado": caso.get("estado") if isinstance(caso.get("estado"), str) else None,
        "personajes": len(_objetos(doc.get("personajes"))),
        "herramientas": len(_objetos(doc.get("herramientas"))),
        "escenas": len(_escenas(doc)),
        "decisiones": len(_decisiones(doc)),
        "opciones": len(_opciones(doc)),
        "retroalimentaciones": len(_objetos(doc.get("retroalimentacion"))),
        "intentos": len(_intentos(doc)),
    }


# Reglas que hace cumplir solo el esquema (Fase 3, §6.2) y que el informe de FORMA nombra.
REGLAS_DE_FORMA = {
    "INV-09": "todo caso declara su escena inicial",
    "INV-12": "una opción marcada como conducta prohibida documenta su motivo",
    "INV-19": "la bitácora se bloquea cuando el intento termina o es reemplazado, y no antes",
    "INV-20": "una evaluación EVALUADA tiene fecha y al menos una valoración",
    "RN-03": "solo un caso publicado se ejecuta; con intentos no puede estar en BORRADOR",
}


def _mensaje_de_forma(error):
    regla_e = error["regla"]
    if not regla_e:
        return error["mensaje"] + "."
    detalle = REGLAS_DE_FORMA.get(regla_e)
    sufijo = f" (regla: {detalle})" if detalle else ""
    return f"[{regla_e}] {error['mensaje']}{sufijo}."


def validar_documento(doc, esquema=None, usar_jsonschema=True):
    """Valida un documento DSL y devuelve el informe (diccionario serializable)."""
    reglas, cruzada = [], None
    if not isinstance(doc, dict):
        doc_regla = {}
        reglas.append({"regla": "FORMA", "tipo": "FORMA", "titulo": "El documento es un objeto JSON",
                       "estado": INCUMPLE, "evaluados": 1, "motivo": None,
                       "hallazgos": [_h("Documento", "(raíz)", "El documento DSL debe ser un objeto JSON.")]})
    else:
        doc_regla = doc
        if esquema is None:
            reglas.append({"regla": "FORMA", "tipo": "FORMA", "titulo": "Forma del documento según el esquema",
                           "estado": NO_EVALUADA, "evaluados": 0,
                           "motivo": f"no se encontró {NOMBRE_ESQUEMA}", "hallazgos": []})
        else:
            errores = InterpreteEsquema(esquema).errores(doc)
            # Los errores que el esquema atribuye a OCL-01..OCL-08 los evalúa la función de cada regla.
            propios = [e for e in errores if e["regla"] not in IDS_OCL]
            hallazgos = [
                _h(elemento_en(doc, e["ruta"]), ruta_texto(e["ruta"]), _mensaje_de_forma(e))
                for e in propios
            ]
            reglas.append({"regla": "FORMA", "tipo": "FORMA",
                           "titulo": f"Forma del documento según {NOMBRE_ESQUEMA}",
                           "estado": INCUMPLE if hallazgos else CUMPLE, "evaluados": None, "motivo": None,
                           "hallazgos": hallazgos})
            if usar_jsonschema:
                cruzada = comprobacion_cruzada(esquema, doc, errores)

    for r in REGLAS:
        try:
            res = r["funcion"](doc_regla)
        except Exception as exc:  # noqa: BLE001 - una regla que falla no debe tumbar el informe
            res = Resultado(0, [_h("(interno)", "", f"Error interno al evaluar la regla: {type(exc).__name__}: {exc}")])
        estado = NO_APLICA if res.no_aplica else (INCUMPLE if res.hallazgos else CUMPLE)
        reglas.append({"regla": r["id"], "tipo": r["tipo"], "titulo": r["titulo"], "estado": estado,
                       "evaluados": res.evaluados, "motivo": res.no_aplica, "hallazgos": res.hallazgos})

    incumplidas = [r["regla"] for r in reglas if r["estado"] == INCUMPLE]
    total = sum(len(r["hallazgos"]) for r in reglas if r["estado"] == INCUMPLE)
    return {
        "caso": resumen_caso(doc_regla),
        "reglas": reglas,
        "reglasIncumplidas": incumplidas,
        "incumplimientos": total,
        "obtenido": "con-errores" if incumplidas else "valido",
        "comprobacionCruzada": cruzada,
    }


# ═══════════════════════════ Carga del archivo y escenarios ═══════════════════════════
class ErrorDeFormato(Exception):
    """El archivo no tiene una forma que el validador reconozca (código de salida 2)."""


def _es_documento(obj):
    return isinstance(obj, dict) and ("escenas" in obj or "versionDsl" in obj)


def _es_entrada(obj):
    return isinstance(obj, dict) and isinstance(obj.get("caso"), dict) and _es_documento(obj["caso"])


def extraer_escenarios(datos, esperar=None):
    """Devuelve (formato, metadatos del DSL, lista de escenarios).

    Cada escenario es un diccionario {id, nombre, esperado, documento}. ``esperado``
    sale de ``tipo``; si falta, de ``esperar`` y, si tampoco, es ``valido``.
    """
    meta, entradas = None, None
    if isinstance(datos, dict) and "escenarios" in datos:
        formato = "lista-de-escenarios"
        meta = datos.get("dsl")
        entradas = datos["escenarios"]
        if not isinstance(entradas, list) or not entradas:
            raise ErrorDeFormato("«escenarios» debe ser una lista con al menos un escenario.")
        if meta is not None:
            if not isinstance(meta, dict) or not all(isinstance(meta.get(c), str) for c in ("nombre", "version")):
                raise ErrorDeFormato("«dsl» debe ser un objeto con «nombre» y «version» (texto).")
    elif isinstance(datos, list):
        formato = "lista-json"
        entradas = datos
        if not entradas:
            raise ErrorDeFormato("La lista está vacía; no hay nada que validar.")
    elif _es_documento(datos):
        formato = "documento-unico"
        entradas = [datos]
    else:
        raise ErrorDeFormato(
            "No se reconoce el contenido: se esperaba un documento DSL (con «escenas»), "
            "un objeto con «escenarios» o una lista de escenarios."
        )

    escenarios = []
    for n, entrada in enumerate(entradas, start=1):
        if _es_entrada(entrada):
            documento = entrada["caso"]
            tipo = entrada.get("tipo")
            if tipo is not None and tipo not in TIPOS_ESCENARIO:
                raise ErrorDeFormato(
                    f"El escenario {n} tiene tipo «{tipo}»; los valores posibles son: {', '.join(TIPOS_ESCENARIO)}."
                )
            ident = entrada.get("id") if isinstance(entrada.get("id"), str) else f"ESCENARIO-{n}"
            nombre = entrada.get("nombre") if isinstance(entrada.get("nombre"), str) else ident
            esperado = tipo or esperar or "valido"
        elif _es_documento(entrada):
            documento, ident = entrada, f"DOCUMENTO-{n}"
            nombre = _texto_id(_caso(entrada).get("titulo")) or ident
            esperado = esperar or "valido"
        else:
            raise ErrorDeFormato(
                f"El elemento {n} no es un escenario ({{id, nombre, tipo, caso}}) ni un documento DSL."
            )
        if (
            isinstance(meta, dict)
            and isinstance(documento, dict)
            and documento.get("versionDsl") not in (None, meta.get("version"))
        ):
            raise ErrorDeFormato(
                f"El escenario {ident} usa versionDsl «{documento.get('versionDsl')}» y el archivo "
                f"declara la versión «{meta.get('version')}» del DSL."
            )
        escenarios.append({"id": ident, "nombre": nombre, "esperado": esperado, "documento": documento})
    return formato, meta, escenarios


def cargar_json(ruta):
    try:
        return json.loads(Path(ruta).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise ErrorDeFormato(f"No existe el archivo: {ruta}") from None
    except (OSError, UnicodeDecodeError) as exc:
        raise ErrorDeFormato(f"No se pudo leer {ruta}: {exc}") from None
    except json.JSONDecodeError as exc:
        raise ErrorDeFormato(f"{ruta} no es JSON válido: {exc}") from None


def _ruta_corta(ruta):
    """Ruta relativa a la carpeta actual cuando es posible (el informe no depende de la máquina)."""
    try:
        return os.path.relpath(ruta, Path.cwd())
    except ValueError:  # otra unidad en Windows
        return str(ruta)


def localizar_esquema(explicito=None):
    aqui = Path(__file__).resolve().parent
    candidatos = []
    if explicito:
        candidatos.append(Path(explicito))
    candidatos += [aqui / NOMBRE_ESQUEMA, aqui.parent / NOMBRE_ESQUEMA, Path.cwd() / NOMBRE_ESQUEMA]
    for candidato in candidatos:
        if candidato.is_file():
            return candidato
    return None


def validar_archivo(ruta, ruta_esquema=None, esperar=None, usar_jsonschema=True):
    """Valida un archivo completo y devuelve el informe global."""
    datos = cargar_json(ruta)
    formato, meta, escenarios = extraer_escenarios(datos, esperar)
    ruta_esq = localizar_esquema(ruta_esquema)
    esquema = None
    if ruta_esq is not None:
        try:
            esquema = json.loads(ruta_esq.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as exc:
            raise ErrorDeFormato(f"No se pudo leer el esquema {ruta_esq}: {exc}") from None
    informes = []
    for esc in escenarios:
        informe = {"id": esc["id"], "nombre": esc["nombre"], "esperado": esc["esperado"]}
        informe.update(validar_documento(esc["documento"], esquema, usar_jsonschema))
        informe["expectativaCumplida"] = informe["obtenido"] == esc["esperado"]
        informes.append(informe)
    cumplidas = sum(1 for i in informes if i["expectativaCumplida"])
    modulo = _modulo_jsonschema() if usar_jsonschema else None
    return {
        "archivo": str(ruta),
        "formato": formato,
        "dsl": meta,
        "esquema": {"ruta": _ruta_corta(ruta_esq) if ruta_esq else None, "encontrado": ruta_esq is not None},
        "jsonschema": {
            "solicitado": usar_jsonschema,
            "disponible": modulo is not None,
            "version": _version_jsonschema() if modulo is not None else None,
        },
        "escenarios": informes,
        "resumen": {
            "escenarios": len(informes),
            "expectativasCumplidas": cumplidas,
            "codigoSalida": 0 if cumplidas == len(informes) else 1,
        },
    }


# ═══════════════════════════════════ Informe ═══════════════════════════════════
def _envolver(texto, sangria, ancho=100):
    return textwrap.fill(texto, width=ancho, initial_indent=sangria, subsequent_indent=sangria)


def _cantidad(n, singular, plural):
    return f"{n} {singular if n == 1 else plural}"


def informe_texto(res):
    L = []
    L.append("Validador del DSL de casos situacionales de SIEP (Fase 4)")
    L.append("=" * 76)
    L.append(f"Archivo : {res['archivo']}")
    meta = res["dsl"]
    detalle = f" - DSL «{meta['nombre']}» versión {meta['version']}" if isinstance(meta, dict) else ""
    nombres = {"lista-de-escenarios": "lista de escenarios", "documento-unico": "documento DSL único",
               "lista-json": "lista JSON"}
    L.append(f"Formato : {nombres[res['formato']]} ({res['resumen']['escenarios']}){detalle}")
    esq = res["esquema"]
    L.append(f"Esquema : {esq['ruta'] if esq['encontrado'] else 'NO ENCONTRADO: se omite la capa de forma'}")
    js = res["jsonschema"]
    if not js["solicitado"]:
        L.append("Jsonschema: comprobación cruzada desactivada (--sin-jsonschema)")
    elif not js["disponible"]:
        L.append("Jsonschema: no está instalado; se usa solo el intérprete incorporado (el resultado no cambia)")
    else:
        veredictos = [e["comprobacionCruzada"] for e in res["escenarios"] if e["comprobacionCruzada"]]
        ok = all(v["coincide"] for v in veredictos)
        L.append(
            f"Jsonschema: {js['version']} - comprobación cruzada de la forma: "
            + ("coincide en todos los escenarios" if ok else "DISCREPA (véase el informe en formato JSON)")
        )
    L.append("Reglas  : FORMA + 8 OCL del enunciado + 8 PROPUESTAS por el equipo")

    for n, esc in enumerate(res["escenarios"], start=1):
        c = esc["caso"]
        L.append("")
        L.append("=" * 76)
        L.append(f"{esc['id']}: {esc['nombre']}")
        L.append(f"Esperado: {esc['esperado']}")
        L.append(
            _envolver(
                f"Caso {c['id']} «{c['titulo']}» ({c['estado']}): "
                f"{_cantidad(c['personajes'], 'personaje', 'personajes')}, "
                f"{_cantidad(c['escenas'], 'escena', 'escenas')} "
                f"({c['decisiones']} con decisión), {_cantidad(c['opciones'], 'opción', 'opciones')}, "
                f"{_cantidad(c['herramientas'], 'herramienta', 'herramientas')}, "
                f"{_cantidad(c['retroalimentaciones'], 'retroalimentación', 'retroalimentaciones')}, "
                f"{_cantidad(c['intentos'], 'intento', 'intentos')}",
                "",
                ancho=76,
            )
        )
        L.append("-" * 76)
        L.append(f"{'Regla':<8} {'Tipo':<10} {'Estado':<11} {'Eval.':>5}  Descripción")
        L.append(f"{'-' * 8} {'-' * 10} {'-' * 11} {'-' * 5}  {'-' * 52}")
        for r in esc["reglas"]:
            evaluados = str(r["evaluados"]) if r["evaluados"] else "-"
            prefijo = f"{r['regla']:<8} {r['tipo']:<10} {r['estado']:<11} {evaluados:>5}  "
            L.append(textwrap.fill(r["titulo"], width=112, initial_indent=prefijo,
                                   subsequent_indent=" " * len(prefijo)))
            if r["estado"] in (NO_APLICA, NO_EVALUADA) and r["motivo"]:
                L.append(" " * len(prefijo) + f"({'no aplica' if r['estado'] == NO_APLICA else 'no evaluada'}: {r['motivo']})")
            for h in r["hallazgos"]:
                L.append(f"{'':<9}- Elemento: {h['elemento']}")
                L.append(_envolver(f"Mensaje: {h['mensaje']}", " " * 11))
                L.append(f"{'':<11}Ruta:    {h['ruta']}")
        L.append("-" * 76)
        if esc["obtenido"] == "valido":
            L.append("Resultado: VÁLIDO. Ninguna regla se incumple.")
        else:
            L.append(
                f"Resultado: CON ERRORES. {esc['incumplimientos']} incumplimiento(s) en "
                f"{len(esc['reglasIncumplidas'])} regla(s): {', '.join(esc['reglasIncumplidas'])}."
            )
        if esc["reglas"][0]["estado"] == NO_EVALUADA:
            L.append("Aviso: la forma del documento no se comprobó (falta el esquema); "
                     "el resultado solo cubre las reglas semánticas.")
        veredicto = "se cumple" if esc["expectativaCumplida"] else "NO SE CUMPLE"
        L.append(f"Expectativa ({esc['esperado']}): {veredicto}.")

    L.append("")
    L.append("=" * 76)
    L.append("RESUMEN")
    L.append(f"{'Escenario':<14} {'Esperado':<12} {'Obtenido':<12} {'Incumpl.':>8}  Reglas incumplidas / expectativa")
    for esc in res["escenarios"]:
        reglas = ", ".join(esc["reglasIncumplidas"]) or "-"
        ok = "OK" if esc["expectativaCumplida"] else "FALLA"
        L.append(f"{esc['id']:<14} {esc['esperado']:<12} {esc['obtenido']:<12} {esc['incumplimientos']:>8}  {reglas} -> {ok}")
    L.append(f"Código de salida: {res['resumen']['codigoSalida']}")
    return "\n".join(L)


# ═══════════════════════════════════════ CLI ═══════════════════════════════════════
def _configurar_salida():
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001 - p. ej. un StringIO en las pruebas
            pass


def construir_analizador():
    a = argparse.ArgumentParser(
        prog="validar_dsl.py",
        description="Valida casos escritos en el DSL de casos situacionales de SIEP: "
        "forma (esquema), reglas OCL-01 a OCL-08 y reglas propuestas PROP-01 a PROP-08.",
        epilog="Código de salida: 0 todo como se esperaba; 1 algún escenario no dio el resultado "
        "esperado; 2 archivo ilegible o con forma no reconocida.",
    )
    a.add_argument("archivo", nargs="?",
                   help=f"JSON a validar (por defecto ../{ARCHIVO_POR_DEFECTO} respecto de este script)")
    a.add_argument("--json", action="store_true", help="imprime el informe en JSON, legible por máquina")
    a.add_argument("--esquema", metavar="RUTA", help=f"ruta de {NOMBRE_ESQUEMA} (por defecto se busca junto al script)")
    a.add_argument("--esperar", choices=TIPOS_ESCENARIO,
                   help="resultado esperado de los documentos que no declaran «tipo» (por defecto valido)")
    a.add_argument("--sin-jsonschema", action="store_true",
                   help="no usa jsonschema aunque esté instalado (comprobación cruzada desactivada)")
    return a


def main(argv=None):
    _configurar_salida()
    args = construir_analizador().parse_args(argv)
    if args.archivo:
        ruta = Path(args.archivo)
    else:
        ruta = Path(__file__).resolve().parent.parent / ARCHIVO_POR_DEFECTO
    try:
        res = validar_archivo(ruta, args.esquema, args.esperar, usar_jsonschema=not args.sin_jsonschema)
    except ErrorDeFormato as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(informe_texto(res))
    return res["resumen"]["codigoSalida"]


if __name__ == "__main__":
    sys.exit(main())
