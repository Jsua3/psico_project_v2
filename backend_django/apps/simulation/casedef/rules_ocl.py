"""Las reglas ``OCL-01`` a ``OCL-08`` del enunciado (Fase 2 del taller) sobre el documento (E4-2a).

Portado del validador del taller de DSL (``docs/diseno/dsl/validador/validar_dsl.py``, Fase 4; autores
Juan José Sua Gómez y Emerson Ángel Gómez; copia en ``tests/taller_dsl/``) sin retocar su lógica: los
identificadores en español se conservan para poder cotejarlo línea a línea con el original.
"""
from .doc import *  # noqa: F403 (utilidades con guion bajo, listadas en ``__all__``)
from .doc import _alcanzables, _caso, _decisiones, _ejecucion, _en, _escenas, _etq, _fecha, _grafo, _id_caso, _ids
from .doc import _intentos, _lista, _mapa_opciones, _no_vacio, _objetos, _opciones, _registros, _texto_id
from .report import Finding as _h
from .report import Outcome
from .rules import rule


@rule("OCL-01", "OCL", inv="INV-01")
def ocl_01_caso_con_escena(doc):
    """OCL-01. Un caso debe contener al menos una escena.

    context Caso
    inv OCL01: self.escenas->size() >= 1

    Valida que la clave `escenas` exista, sea una lista y tenga al menos un
    elemento. Sin escenas no hay situación que recorrer.
    """
    escenas = doc.get("escenas")
    if isinstance(escenas, list) and len(escenas) >= 1:
        return Outcome(1)
    return Outcome(1, [_h(f"Caso {_id_caso(doc)}", "escenas", "El caso no tiene escenas; se exige al menos una.")])


@rule("OCL-02", "OCL", inv="INV-02")
def ocl_02_decision_con_dos_opciones(doc):
    """OCL-02. Una decisión debe tener como mínimo dos opciones.

    context Decision
    inv OCL02: self.opciones->size() >= 2

    Se evalúa cada decisión de cada escena. Con una sola opción el estudiante no
    elige nada. No hay máximo: la situación puede necesitar las que requiera (RN-11).
    """
    decisiones = _decisiones(doc)
    if not decisiones:
        return Outcome(no_aplica="el caso no tiene decisiones")
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
    return Outcome(len(decisiones), hallazgos)


@rule("OCL-03", "OCL", inv="INV-03")
def ocl_03_opcion_con_escena_existente(doc):
    """OCL-03. Una opción de decisión debe referenciar una escena existente.

    context OpcionDecision
    inv OCL03: self.decision.escena.caso.escenas->includes(self.escenaDestino)

    En el JSON, `escenaDestino` es `siguienteEscena`. Falla si la clave falta o si
    su valor no es el `id` de ninguna escena del caso.
    """
    opciones = _opciones(doc)
    if not opciones:
        return Outcome(no_aplica="el caso no tiene opciones")
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
    return Outcome(len(opciones), hallazgos)


@rule("OCL-04", "OCL", inv="INV-04")
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
        return Outcome(no_aplica="el caso no tiene decisiones")
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
    return Outcome(len(decisiones), hallazgos)


@rule("OCL-05", "OCL", inv="INV-05")
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
        return Outcome(no_aplica="ninguna opción usa una herramienta")
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
    return Outcome(len(usos), hallazgos)


@rule("OCL-06", "OCL", inv="INV-06")
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
        return Outcome(no_aplica="el caso no tiene retroalimentaciones")
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
    return Outcome(len(retros), hallazgos)


@rule("OCL-07", "OCL", inv="INV-07")
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
    return Outcome(2, hallazgos)


@rule("OCL-08", "OCL", inv="INV-08")
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
        return Outcome(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
    if _decisiones(doc):
        return Outcome(1)
    return Outcome(
        1,
        [_h(f"Caso {_id_caso(doc)}", "escenas", "Ninguna escena presenta una decisión; el caso no tiene puntos de decisión.")],
    )

