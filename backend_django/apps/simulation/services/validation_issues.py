"""La validación del caso con una forma única: ``ValidationIssue`` (E2-8, contrato C6).

``world_validation`` (puro, con códigos estables y mensajes con ids para depurar) sigue siendo
la fuente de verdad. Aquí cada hallazgo se traduce a lo que ve una persona que autora:

    {code: "WORLD.<CÓDIGO>", severity: "error" | "warning", message, nodeId?, mapId?}

- ``code`` conserva el del validador con el prefijo ``WORLD.`` (E4-2 añadirá ``DSL.``…).
- ``message`` está en lenguaje llano y **sin ids**: nombra la escena o el mapa por su título.
- ``nodeId`` / ``mapId`` dicen a qué elemento llevar el foco del editor.

Una prueba extrae con ``ast`` cada código que el validador puede emitir y exige su plantilla
aquí (``PLAIN``): un código nuevo sin mensaje llano rompe la suite.
"""
from apps.simulation.models import CollisionZone, DecisionOption, MapObject, SceneMap, SimulationNode

PREFIX = "WORLD."

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
#: código del validador → plantilla. Los marcadores se rellenan con títulos, nunca con ids.
PLAIN = {
    "NO_NODES": "El caso aún no tiene escenas: agrega al menos una.",
    "NO_START_NODE": "Marca una escena como la de inicio del caso.",
    "MULTIPLE_START_NODES": "El caso tiene más de una escena de inicio: deja solo una.",
    "NO_TERMINAL_NODE": "El caso necesita al menos una escena final.",
    "GRAPH_CYCLE": "Las decisiones forman un ciclo: el caso no podría terminar.",
    "DECISION_NODE_NOT_IN_CASE": "La decisión «{decision}» une una escena que no es de este caso.",
    "NODE_WITHOUT_OPTIONS": (
        "La escena «{node}» no es final y no tiene decisiones: la persona quedaría sin salida."
    ),
    "NODE_WITHOUT_MAP": "La escena «{node}» no tiene mapa: no se podría explorar.",
    "UNREACHABLE_NODE": "No hay camino desde el inicio hasta la escena «{node}».",
    "SPAWN_OUT_OF_BOUNDS": "El punto de aparición del mapa «{map}» queda fuera de sus límites.",
    "OBJECT_OUT_OF_BOUNDS": "El objeto «{object}» queda fuera del mapa «{map}».",
    "COLLISION_OUT_OF_BOUNDS": "La zona de colisión «{collision}» queda fuera del mapa «{map}».",
    "PROHIBITED_WITHOUT_REASON": (
        "La decisión «{decision}» está marcada como conducta prohibida y no explica por qué."
    ),
    "DECISION_WITHOUT_FEEDBACK": (
        "La decisión «{decision}» aún no explica a la persona por qué conviene o no: "
        "agrega su retroalimentación."
    ),
    "NO_SAFE_EXIT": "El caso necesita una salida segura: agrega un objeto de tipo salida (EXIT).",
    "MAP_TOO_LARGE": "El mapa «{map}» es demasiado grande.",
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    "MAP_BACKGROUND_NOT_ALLOWED": (
        "El fondo de la sala «{map}» no se puede publicar: solo admite rutas de /assets/ o hosts permitidos."
    ),
    "TOO_MANY_OBJECTS": "El mapa «{map}» tiene demasiados objetos.",
    "TOO_MANY_COLLISIONS": "El mapa «{map}» tiene demasiadas zonas de colisión.",
    "TOO_MANY_TRIGGERS": "El mapa «{map}» tiene demasiados disparadores.",
    "MANY_DIALOGUES": "El mapa «{map}» tiene muchos diálogos: considera repartirlos en más escenas.",
    "OPTION_WITHOUT_TRIGGER": (
        "La opción «{decision}» no se puede elegir: ningún diálogo ni objeto del mapa la ofrece."
    ),
    "REQUIRES_UNKNOWN": (
        "El mapa «{map}» pide «{required}», que este caso no tiene: revisa las herramientas, "
        "las escenas y los objetos."
    ),
    "DOOR_TARGET_MISSING": (
        "La puerta «{object}» del mapa «{map}» lleva a una escena que no existe o que no tiene mapa."
    ),
}
# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
#: Las seis reglas de publicación del modelo de respuesta (``casedef.publication_rules``): código estable → frase
#: «Por resolver» en el lenguaje del docente. Los marcadores se rellenan con títulos, nunca con ids.
PUBLICATION_PLAIN = {
    "scene-without-recommended": (
        "La escena «{scene}» no tiene ninguna respuesta recomendada: marca al menos una como «Recomendada»."
    ),
    "contraindicated-without-reason": (
        "La respuesta «{option}» de la escena «{scene}» es contraindicada y no explica por qué: "
        "escribe el motivo de la prohibición."
    ),
    "milestone-unreachable": (
        "El hito «{milestone}» no se puede cumplir: ninguna respuesta de las escenas a las que se llega "
        "desde el inicio lo marca."
    ),
    "ending-unreachable": (
        "El final «{ending}» no se puede alcanzar: ningún recorrido completo cumple su condición."
    ),
    "ending-without-default": (
        "Ningún final del caso aplica a todos los recorridos: agrega un final sin condición para el resto."
    ),
    "ending-reachability-skipped": (
        "El caso tiene tantos recorridos posibles que no se pudo comprobar si todos los finales se alcanzan."
    ),
    "competency-without-evidence": (
        "La competencia «{competency}» de la rúbrica no tiene evidencia: ninguna respuesta del caso la declara."
    ),
    "high-intensity-without-warning": (
        "La escena «{scene}» es de intensidad alta y no tiene mensaje de advertencia: escríbelo antes de publicar."
    ),
}
_TEMPLATE_ENDING_UNREACHABLE = (
    "El final de plantilla «{ending}» no puede darse en este caso; si quieres que exista, marca hitos decisivos "
    "o añade respuestas con riesgo o contraindicadas."
)
_NO_COMPETENCY_DECLARED = (
    "Ninguna respuesta declara competencias todavía: la rúbrica no tendrá evidencia que mostrar."
)
_UNKNOWN = "El caso tiene un problema de validación ({code})."
_SNIPPET = 60


def _refs(raw_issues):
    """``{tipo: {id, …}}`` de los ``entityRef`` («node:12», «map:3», «decision:5»…)."""
    wanted = {"node": set(), "map": set(), "object": set(), "collision": set(), "decision": set()}
    for issue in raw_issues:
        kind, _, raw_id = (issue.get("entityRef") or "").partition(":")
        if kind in wanted and raw_id.isdigit():
            wanted[kind].add(int(raw_id))
    return wanted


def _snippet(text):
    text = " ".join((text or "").split())
    return text if len(text) <= _SNIPPET else text[: _SNIPPET - 1] + "…"


def _lookups(raw_issues):
    """Títulos y relaciones de los elementos nombrados: una consulta por tipo, solo si hace falta."""
    wanted = _refs(raw_issues)
    objects = {o.id: o for o in MapObject.objects.filter(pk__in=wanted["object"])} if wanted["object"] else {}
    zones = (
        {z.id: z for z in CollisionZone.objects.filter(pk__in=wanted["collision"])}
        if wanted["collision"] else {}
    )
    map_ids = set(wanted["map"]) | {o.scene_map_id for o in objects.values()} | {
        z.scene_map_id for z in zones.values()
    }
    maps = {m.id: m for m in SceneMap.objects.filter(pk__in=map_ids)} if map_ids else {}
    decisions = (
        {d.id: d for d in DecisionOption.objects.filter(pk__in=wanted["decision"])}
        if wanted["decision"] else {}
    )
    node_ids = set(wanted["node"]) | {m.node_id for m in maps.values()} | {
        d.source_node_id for d in decisions.values()
    }
    nodes = {n.id: n for n in SimulationNode.objects.filter(pk__in=node_ids)} if node_ids else {}
    return {"node": nodes, "map": maps, "object": objects, "collision": zones, "decision": decisions}


def _describe(raw, lookups):
    """``(valores de la plantilla, nodeId, mapId)`` de un hallazgo."""
    kind, _, raw_id = (raw.get("entityRef") or "").partition(":")
    entity_id = int(raw_id) if raw_id.isdigit() else None
    values, node_id, map_id = {}, None, None
    if kind == "node" and entity_id in lookups["node"]:
        node = lookups["node"][entity_id]
        values["node"], node_id = node.title, node.id
    elif kind == "map" and entity_id in lookups["map"]:
        scene_map = lookups["map"][entity_id]
        values["map"], map_id, node_id = scene_map.title, scene_map.id, scene_map.node_id
    elif kind in ("object", "collision"):
        entity = lookups[kind].get(entity_id)
        if entity is not None:
            values[kind] = entity.label or (entity.object_key if kind == "object" else entity.zone_key)
            scene_map = lookups["map"].get(entity.scene_map_id)
            if scene_map is not None:
                values["map"], map_id, node_id = scene_map.title, scene_map.id, scene_map.node_id
    elif kind == "decision" and entity_id in lookups["decision"]:
        decision = lookups["decision"][entity_id]
        values["decision"], node_id = _snippet(decision.text), decision.source_node_id
    if raw.get("detail"):
        values["required"] = _snippet(raw["detail"])  # lo que el hallazgo nombra (una clave o un código)
    return values, node_id, map_id


def build_issues(raw_issues):
    """Traduce los hallazgos del validador (errores y avisos) a ``ValidationIssue[]``."""
    lookups = _lookups(raw_issues)
    issues = []
    for raw in raw_issues:
        code = raw["code"]
        values, node_id, map_id = _describe(raw, lookups)
        template = PLAIN.get(code)
        try:
            message = template.format(**values) if template else _UNKNOWN.format(code=code)
        except KeyError:
            # Un hallazgo cuyo elemento ya no existe: se nombra sin título, nunca con un id.
            message = template.split("«")[0].rstrip(" :") + "."
        issue = {
            "code": f"{PREFIX}{code}",
            "severity": "error" if raw["severity"] == "ERROR" else "warning",
            "message": message,
        }
        if node_id is not None:
            issue["nodeId"] = node_id
        if map_id is not None:
            issue["mapId"] = map_id
        issues.append(issue)
    return issues


def issues_of(validation):
    """``(issues, canPublish)`` de un resultado de ``world_validation.validate``."""
    raw = list(validation["errors"]) + list(validation["warnings"])
    return build_issues(raw), validation["canPublish"]


def publication_issue(issue, node_ids):
    """``ValidationIssue`` de un hallazgo de ``casedef.publication_rules``, con la escena a la que llevar el foco."""
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    if issue.code == "competency-without-evidence" and issue.competency_code is None:
        message = _NO_COMPETENCY_DECLARED
    elif issue.code == "ending-unreachable" and issue.template:
        message = _TEMPLATE_ENDING_UNREACHABLE.format(**issue.labels)
    else:
        message = PUBLICATION_PLAIN[issue.code].format(**issue.labels)
    result = {"code": issue.code, "severity": issue.severity, "field": issue.field, "message": message}
    for name, value in (
        ("sceneKey", issue.scene_key), ("optionKey", issue.option_key), ("milestoneKey", issue.milestone_key),
        ("endingKey", issue.ending_key), ("competencyCode", issue.competency_code),
    ):
        if value is not None:
            result[name] = value
    if issue.scene_key in node_ids:
        result["nodeId"] = node_ids[issue.scene_key]
    return result
