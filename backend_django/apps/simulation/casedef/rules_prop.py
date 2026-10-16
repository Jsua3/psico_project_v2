"""Las reglas ``PROP-01`` a ``PROP-08`` propuestas por el equipo del taller sobre el documento (E4-2a).

Portado del validador del taller de DSL (``docs/diseno/dsl/validador/validar_dsl.py``, Fase 4; autores
Juan José Sua Gómez y Emerson Ángel Gómez; copia en ``tests/taller_dsl/``) sin retocar su lógica: los
identificadores en español se conservan para poder cotejarlo línea a línea con el original.
PROP-04, PROP-05, PROP-07 y PROP-08 miran ``ejecucion`` (intentos, bitácora y evaluaciones): el producto
no exporta ni importa esa sección (R5), pero las evalúa para dar el mismo veredicto que el taller.
"""
import collections

from .doc import *  # noqa: F403 (utilidades con guion bajo, listadas en ``__all__``)
from .doc import _alcanzables, _caso, _decisiones, _ejecucion, _en, _escenas, _etq, _fecha, _grafo, _id_caso, _ids
from .doc import _intentos, _lista, _mapa_opciones, _no_vacio, _objetos, _opciones, _registros, _texto_id
from .report import Finding as _h
from .report import Outcome
from .rules import rule


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


@rule("PROP-01", "PROPUESTA", inv="INV-13")
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
        return Outcome(no_aplica="el documento no tiene elementos con identificador")
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
    return Outcome(len(inventario), hallazgos)


@rule("PROP-02", "PROPUESTA", inv="INV-09, INV-11")
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
        return Outcome(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
    inicial = _caso(doc).get("escenaInicial")
    ids = _ids(escenas)
    if not _en(inicial, ids):
        mensaje = (
            "El caso no declara su escena inicial (escenaInicial)."
            if inicial is None
            else f"La escena inicial «{inicial}» no existe en el caso."
        )
        return Outcome(1, [_h(f"Caso {_id_caso(doc)}", "caso.escenaInicial", mensaje)])
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
    return Outcome(len(escenas), hallazgos)


@rule("PROP-03", "PROPUESTA", inv="INV-14")
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
        return Outcome(no_aplica="ninguna escena declara participantes")
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
    return Outcome(len(referencias), hallazgos)


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


@rule("PROP-04", "PROPUESTA", inv="INV-18")
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
        return Outcome(no_aplica="el documento no trae decisiones registradas en una bitácora")
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
        return Outcome(no_aplica="no se pudo reconstruir el recorrido: la escena inicial no existe (lo informa PROP-02)")
    return Outcome(evaluados, hallazgos)


@rule("PROP-05", "PROPUESTA", inv="INV-17, INV-18")
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
        return Outcome(no_aplica="el documento no trae intentos (ejecucion)")
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
    return Outcome(len(intentos), hallazgos)


@rule("PROP-06", "PROPUESTA", inv="INV-10")
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
        return Outcome(no_aplica="el caso no tiene escenas (lo informa OCL-01)")
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
    return Outcome(len(grafo), hallazgos)


@rule("PROP-07", "PROPUESTA", inv="INV-20")
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
        return Outcome(no_aplica="el caso no declara rúbrica y no trae evaluaciones")
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
    return Outcome(evaluados, hallazgos)


@rule("PROP-08", "PROPUESTA", inv="INV-16")
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
        return Outcome(no_aplica="el documento no trae intentos (ejecucion)")
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
    return Outcome(len(intentos), hallazgos)
