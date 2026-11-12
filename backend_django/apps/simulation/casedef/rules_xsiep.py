"""Las reglas ``OCL-09`` a ``OCL-12`` sobre los campos del DSL 2.1 (``requiere``, ``reaccion``) de ``x-siep``.

A diferencia de ``OCL-01…08`` no vienen del taller: son del servidor. Leen ``doc["x-siep"]`` y, si lo que
encuentran no tiene la forma esperada, lo ignoran (la forma la vigila ``siep_check``). ``rules_xsiep`` se
importa desde ``validate`` después de ``rules_prop``.
"""
from . import conditions
from .doc import _objetos, _texto_id
from .report import Finding as _h
from .report import Outcome
from .rules import rule
from .vocabulary import EXPRESSIONS, GESTURES

SIEP = "x-siep"


def _siep(doc):
    siep = doc.get(SIEP) if isinstance(doc, dict) else None
    return siep if isinstance(siep, dict) else {}


def _scenes(doc):
    """(posición, escena) de cada escena de ``x-siep`` que es un objeto."""
    return _objetos(_siep(doc).get("escenas"))


def _options(doc):
    """(posición de la escena, escena, posición de la opción, opción) de cada opción de ``x-siep``."""
    return [(i, scene, j, option) for i, scene in _scenes(doc) for j, option in _objetos(scene.get("opciones"))]


def _commenting(doc):
    """(posición de la escena, escena, posición del comentario, comentario) de cada comentario de ``x-siep``."""
    return [(i, scene, k, c) for i, scene in _scenes(doc) for k, c in _objetos(scene.get("comentarios"))]


def _label(scene):
    return _texto_id(scene.get("id")) or _texto_id(scene.get("clave")) or "(sin id)"


def _option_label(option):
    return _texto_id(option.get("id")) or _texto_id(option.get("clave")) or "(sin id)"


def _route(i, j=None, field=None):
    route = f"{SIEP}.escenas[{i}]"
    if j is not None:
        route += f".opciones[{j}]"
    return route + (f".{field}" if field else "")


def _comment_route(i, k, field=None):
    route = f"{SIEP}.escenas[{i}].comentarios[{k}]"
    return route + (f".{field}" if field else "")


def _map(scene):
    mapa = scene.get("mapa")
    return mapa if isinstance(mapa, dict) else {}


def _map_objects(scene):
    return [x for _, x in _objetos(_map(scene).get("objetos"))]


def _visible(obj):
    return obj.get("visible") is not False


def _has_requirement(option):
    """Ausente, ``None`` y vacío (``{}``) son lo mismo: sin requisito."""
    return bool(option.get("requiere"))


def _milestones_in(condition):
    found, pending = [], [condition]
    while pending:
        node = pending.pop()
        if not isinstance(node, dict):
            continue
        if isinstance(node.get("milestone"), str):
            found.append(node["milestone"])
        for group in ("all", "any"):
            if isinstance(node.get(group), list):
                pending.extend(node[group])
        pending.append(node.get("not"))
    return found


def _strs(values):
    """Solo las cadenas no vacías de ``values``: los valores crudos del documento pueden no ser hashables."""
    return {v for v in values if isinstance(v, str) and v}


def _declared_milestones(doc):
    rules = _siep(doc).get("reglas")
    return _strs(m.get("key") for _, m in _objetos(rules.get("milestones"))) if isinstance(rules, dict) else set()


def _delivered_tools(doc):
    """Los códigos de herramienta declarados en el caso que algún objeto de algún mapa entrega."""
    declared = _strs(t.get("codigo") for _, t in _objetos(_siep(doc).get("herramientas")))
    given = _strs(x.get("herramienta") for _, scene in _scenes(doc) for x in _map_objects(scene))
    return declared & given


def _reacting(doc):
    return [(i, s, j, o) for i, s, j, o in _options(doc) if isinstance(o.get("reaccion"), dict) and o["reaccion"]]


@rule("OCL-09", "OCL")
def ocl_09_opcion_sin_requisito(doc):
    """OCL-09. Toda decisión ofrece al menos una opción sin requisito.

    context Decision
    inv OCL09: self.opciones->exists(o | o.requiere->isEmpty())

    Si todas las opciones de una escena exigen algo, un estudiante que no lo haya conseguido se queda sin
    nada que elegir.
    """
    decisions = [(i, scene, _objetos(scene.get("opciones"))) for i, scene in _scenes(doc)]
    decisions = [(i, scene, options) for i, scene, options in decisions if options]
    if not decisions:
        return Outcome(no_aplica="el caso no tiene decisiones")
    findings = []
    for i, scene, options in decisions:
        if all(_has_requirement(option) for _, option in options):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            message = (
                f"En la escena {_label(scene)} todas las opciones piden algo antes de poder elegirlas; "
                "deja al menos una sin requisito."
            )
            findings.append(_h(f"Escena {_label(scene)}", _route(i, field="opciones"), message))
    return Outcome(len(decisions), findings)


@rule("OCL-10", "OCL")
def ocl_10_requisito_alcanzable(doc):
    """OCL-10. Todo lo que un requisito nombra existe y se puede conseguir.

    context Opcion
    inv OCL10: self.requiere.hechos->forAll(h | h.existeEnLaSala or h.seConsigue)

    Vale igual para el ``cuando`` de los comentarios de la escena.
    Hablar con alguien o inspeccionar algo se hace en la sala de la escena; tener o usar una herramienta
    exige que algún objeto del caso la entregue; un hito debe estar declarado.
    """
    gated = [
        (i, scene, f"la opción {_option_label(option)} de la escena {_label(scene)}", _route(i, j, "requiere"), option["requiere"])
        for i, scene, j, option in _options(doc)
        if isinstance(option.get("requiere"), dict) and option["requiere"]
    ]
    gated += [
        (i, scene, f"el comentario {k + 1} de la escena {_label(scene)}", _comment_route(i, k, "cuando"), comment["cuando"])
        for i, scene, k, comment in _commenting(doc)
        if isinstance(comment.get("cuando"), dict) and comment["cuando"]
    ]
    if not gated:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        return Outcome(no_aplica="ninguna opción declara requisito ni hay comentarios con condición")
    delivered = _delivered_tools(doc)
    milestones = _declared_milestones(doc)
    findings = []
    for i, scene, where, route, requirement in gated:
        if not conditions.is_valid(requirement, facts=True):
            continue  # un requisito mal formado lo señala siep_check
        objects = _map_objects(scene)
        people = _strs(x.get("clave") for x in objects if x.get("tipo") == "PERSON" and _visible(x))
        ambient = _map(scene).get("ambiente")
        if isinstance(ambient, dict):
            people |= _strs(n.get("key") for _, n in _objetos(ambient.get("ambientNpcs")))
        things = _strs(x.get("clave") for x in objects if _visible(x))
        problems = []
        for kind, key in conditions.facts_in(requirement):
            if kind == "talked" and key not in people:
                problems.append(f"pide haber hablado con {key!r}, que no es un personaje de la sala de esa escena")
            elif kind == "inspected" and key not in things:
                problems.append(f"pide haber inspeccionado {key!r}, que no es un objeto visible de la sala de esa escena")
            elif kind in ("has", "used") and key not in delivered:
                problems.append(f"pide la herramienta {key!r}, que el caso no declara o que ningún objeto entrega")
        for key in dict.fromkeys(_milestones_in(requirement)):
            if key not in milestones:
                problems.append(f"pide el hito {key!r}, que el caso no declara en reglas.milestones")
        for problem in problems:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            findings.append(_h(f"Escena {_label(scene)}", route, f"Para {where}: {problem}."))
    return Outcome(len(gated), findings)


@rule("OCL-11", "OCL")
def ocl_11_vocabulario_de_reaccion(doc):
    """OCL-11. La emoción y el gesto de una reacción pertenecen a su vocabulario.

    context Opcion
    inv OCL11: self.reaccion.emocion in EXPRESSIONS and self.reaccion.gesto in GESTURES

    Solo se miran la emoción y el gesto cuando vienen; la línea y el personaje no se comprueban aquí. Vale igual
    para los comentarios de la escena.
    """
    reacting = [
        (scene, f"la reacción de la opción {_option_label(option)} de la escena {_label(scene)}", option["reaccion"],
         lambda f, i=i, j=j: _route(i, j, f"reaccion.{f}"))
        for i, scene, j, option in _reacting(doc)
    ]
    reacting += [
        (scene, f"el comentario {k + 1} de la escena {_label(scene)}", comment, lambda f, i=i, k=k: _comment_route(i, k, f))
        for i, scene, k, comment in _commenting(doc)
    ]
    if not reacting:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        return Outcome(no_aplica="ninguna opción ni comentario declara reacción")
    findings = []
    for scene, where, reaction, route_of in reacting:
        for field, allowed, noun in (("emocion", EXPRESSIONS, "emoción"), ("gesto", GESTURES, "gesto")):
            value = reaction.get(field)
            if value is None or value == "":
                continue
            if not isinstance(value, str) or value not in allowed:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                message = f"En {where}, el {noun} {value!r} no es uno de los permitidos: {', '.join(allowed)}."
                findings.append(_h(f"Escena {_label(scene)}", route_of(field), message))
    return Outcome(len(reacting), findings)


def _people_of(mapa):
    return [x for _, x in _objetos(mapa.get("objetos")) if x.get("tipo") == "PERSON" and _visible(x)]


def _offers(mapa, key):
    """¿Alguna PERSON visible del mapa ofrece la opción ``key``: por su ``opcion`` o por una elección de su diálogo?"""
    people = _people_of(mapa)
    if any(p.get("opcion") == key for p in people):
        return True
    keys = _strs(p.get("clave") for p in people)
    for _, dialog in _objetos(mapa.get("dialogos")):
        speaker = dialog.get("objeto")
        if isinstance(speaker, str) and speaker in keys and any(
            c.get("opcion") == key for _, c in _objetos(dialog.get("elecciones"))
        ):
            return True
    return False


@rule("OCL-12", "OCL")
def ocl_12_quien_reacciona_esta_presente(doc):
    """OCL-12. Quien reacciona está presente en la sala de la escena.

    context Opcion
    inv OCL12: self.reaccion.personaje->notEmpty() implies self.salas()->exists(m | m.personas->exists(p | p.personaje = self.reaccion.personaje))

    «La sala de la escena» es el mapa de la escena o cualquier mapa del documento donde una PERSON ofrece la opción:
    el estudiante decide donde está quien la ofrece, que puede ser el mapa de otra escena. Sin personaje, la reacción
    es de quien ofrece la opción: alguna PERSON de esos mapas tiene que ofrecerla, directamente o por una elección de
    su diálogo. Con personaje, tiene que haber una PERSON visible con ese personaje en esos mapas. Un comentario,
    en cambio, solo se dice en la sala de su escena: ``personaje`` es el de una PERSON visible de ese mapa.
    """
    reacting = _reacting(doc)
    commenting = _commenting(doc)
    if not reacting and not commenting:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        return Outcome(no_aplica="ninguna opción ni comentario declara reacción")
    all_maps = [_map(scene) for _, scene in _scenes(doc)]
    findings = []
    for i, scene, j, option in reacting:
        where = f"la reacción de la opción {_option_label(option)} de la escena {_label(scene)}"
        key = option.get("clave")
        # sin clave, nadie puede ofrecerla (y ``None == None`` no cuenta)
        offering = [m for m in all_maps if isinstance(key, str) and key and _offers(m, key)]
        character = option["reaccion"].get("personaje")
        if isinstance(character, str) and character:
            rooms = [_map(scene), *offering]
            if not any(p.get("personaje") == character for m in rooms for p in _people_of(m)):
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                message = f"En {where}, el personaje {character!r} no está en la sala de esa escena ni donde se ofrece la opción."
                findings.append(_h(f"Escena {_label(scene)}", _route(i, j, "reaccion.personaje"), message))
            continue
        if not offering:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            message = f"En {where}, ningún personaje de la sala ofrece esa opción, así que nadie podría reaccionar."
            findings.append(_h(f"Escena {_label(scene)}", _route(i, j, "reaccion"), message))
    for i, scene, k, comment in commenting:
        character = comment.get("personaje")
        here = _people_of(_map(scene))
        if not isinstance(character, str) or not character or not any(p.get("personaje") == character for p in here):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            message = (
                f"En el comentario {k + 1} de la escena {_label(scene)}, quien comenta ({character!r}) "
                "no es un personaje de la sala de esa escena."
            )
            findings.append(_h(f"Escena {_label(scene)}", _comment_route(i, k, "personaje"), message))
    return Outcome(len(reacting) + len(commenting), findings)
