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


def _label(scene):
    return _texto_id(scene.get("id")) or _texto_id(scene.get("clave")) or "(sin id)"


def _option_label(option):
    return _texto_id(option.get("id")) or _texto_id(option.get("clave")) or "(sin id)"


def _route(i, j=None, field=None):
    route = f"{SIEP}.escenas[{i}]"
    if j is not None:
        route += f".opciones[{j}]"
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

    Hablar con alguien o inspeccionar algo se hace en la sala de la escena; tener o usar una herramienta
    exige que algún objeto del caso la entregue; un hito debe estar declarado.
    """
    gated = [(i, s, j, o) for i, s, j, o in _options(doc) if isinstance(o.get("requiere"), dict) and o["requiere"]]
    if not gated:
        return Outcome(no_aplica="ninguna opción declara requisito")
    delivered = _delivered_tools(doc)
    milestones = _declared_milestones(doc)
    findings = []
    for i, scene, j, option in gated:
        requirement = option["requiere"]
        if not conditions.is_valid(requirement, facts=True):
            continue  # un requisito mal formado lo señala siep_check
        objects = _map_objects(scene)
        people = _strs(x.get("clave") for x in objects if x.get("tipo") == "PERSON" and _visible(x))
        ambient = _map(scene).get("ambiente")
        if isinstance(ambient, dict):
            people |= _strs(n.get("key") for _, n in _objetos(ambient.get("ambientNpcs")))
        things = _strs(x.get("clave") for x in objects if _visible(x))
        where = f"la opción {_option_label(option)} de la escena {_label(scene)}"
        route = _route(i, j, "requiere")
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

    Solo se miran la emoción y el gesto cuando vienen; la línea y el personaje no se comprueban aquí.
    """
    reacting = _reacting(doc)
    if not reacting:
        return Outcome(no_aplica="ninguna opción declara reacción")
    findings = []
    for i, scene, j, option in reacting:
        reaction = option["reaccion"]
        where = f"la reacción de la opción {_option_label(option)} de la escena {_label(scene)}"
        for field, allowed, noun in (("emocion", EXPRESSIONS, "emoción"), ("gesto", GESTURES, "gesto")):
            value = reaction.get(field)
            if value is None or value == "":
                continue
            if not isinstance(value, str) or value not in allowed:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                message = f"En {where}, el {noun} {value!r} no es uno de los permitidos: {', '.join(allowed)}."
                findings.append(_h(f"Escena {_label(scene)}", _route(i, j, f"reaccion.{field}"), message))
    return Outcome(len(reacting), findings)


@rule("OCL-12", "OCL")
def ocl_12_quien_reacciona_esta_presente(doc):
    """OCL-12. Quien reacciona está presente en la sala de la escena.

    context Opcion
    inv OCL12: self.reaccion.personaje->notEmpty() implies self.escena.mapa.personas->exists(p | p.personaje = self.reaccion.personaje)

    Sin personaje, la reacción es de quien ofrece la opción: algún personaje de la sala tiene que ofrecerla,
    directamente o por una elección de su diálogo.
    """
    reacting = _reacting(doc)
    if not reacting:
        return Outcome(no_aplica="ninguna opción declara reacción")
    findings = []
    for i, scene, j, option in reacting:
        people = [x for x in _map_objects(scene) if x.get("tipo") == "PERSON" and _visible(x)]
        where = f"la reacción de la opción {_option_label(option)} de la escena {_label(scene)}"
        character = option["reaccion"].get("personaje")
        if isinstance(character, str) and character:
            if not any(p.get("personaje") == character for p in people):
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                message = f"En {where}, el personaje {character!r} no está en la sala de esa escena."
                findings.append(_h(f"Escena {_label(scene)}", _route(i, j, "reaccion.personaje"), message))
            continue
        key = option.get("clave")
        offered = False
        if isinstance(key, str) and key:  # sin clave, nadie puede ofrecerla (y ``None == None`` no cuenta)
            keys = _strs(p.get("clave") for p in people)
            offered = any(p.get("opcion") == key for p in people)
            for _, dialog in _objetos(_map(scene).get("dialogos")):
                speaker = dialog.get("objeto")
                if isinstance(speaker, str) and speaker in keys and any(
                    c.get("opcion") == key for _, c in _objetos(dialog.get("elecciones"))
                ):
                    offered = True
        if not offered:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            message = f"En {where}, ningún personaje de la sala ofrece esa opción, así que nadie podría reaccionar."
            findings.append(_h(f"Escena {_label(scene)}", _route(i, j, "reaccion"), message))
    return Outcome(len(reacting), findings)
