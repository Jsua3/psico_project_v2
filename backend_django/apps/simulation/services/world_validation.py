"""Pure world-validation logic — mirrors Spring's domain WorldValidationService
+ WorldValidationResult 1:1. No DB/framework deps; operates on a plain snapshot
dict and returns a WorldValidationState-shaped dict {errors, warnings, canPublish}.

Snapshot shape (all coords/sizes are ints):
    {
      "nodes":      [{"id", "startNode", "terminalNode", "x", "y", "key"?}],
      "decisions":  [{"id", "sourceNodeId", "targetNodeId", "prohibitedConduct", "prohibitionReason",
                      "feedbackText"?, "immediateFeedback"?}],
      "maps":       [{"id", "nodeId", "width", "height", "spawnX", "spawnY"}],
      "objects":    [{"id", "mapId", "x", "y", "width", "height", "type",
                      "key"?, "optionId"?, "toolCode"?, "meta"?}],
      "collisions": [{"id", "mapId", "x", "y", "width", "height"}],
      "dialogues":  [{"id", "mapId"}],
      "choices":    [{"id", "mapId", "optionId", "requiredTool"}]?,
      "tools":      [{"code"}]?,
      "hasSafeExit": bool,
    }

Las claves con «?» son de E4 (R21): sin ``choices`` no se evalúa ``OPTION_WITHOUT_TRIGGER``, sin
``tools`` no se evalúa ``REQUIRES_UNKNOWN`` y sin ``key`` en los nodos o los objetos no se comparan
las claves que piden las puertas; un snapshot del formato anterior sigue valiendo.
"""

MAX_OBJECTS_PER_MAP = 250
MAX_COLLISIONS_PER_MAP = 300
MAX_TRIGGERS_PER_MAP = 100
MAX_MAP_WIDTH = 2560
MAX_MAP_HEIGHT = 1920
DIALOGUE_WARN_THRESHOLD = 50


def _issue(severity, code, message, ref, detail=None):
    issue = {"severity": severity, "code": code, "message": message, "entityRef": ref}
    if detail is not None:
        issue["detail"] = detail  # lo que el hallazgo nombra (lo traduce validation_issues)
    return issue


def _err(code, message, ref=None, detail=None):
    return _issue("ERROR", code, message, ref, detail)


def _warn(code, message, ref=None):
    return _issue("WARNING", code, message, ref)


def validate(snapshot):
    """Return a WorldValidationState dict: {errors, warnings, canPublish}."""
    issues = []
    _validate_graph(snapshot["nodes"], snapshot["decisions"], snapshot.get("maps", []), issues)
    _validate_geometry(snapshot, issues)
    _validate_ethics(snapshot["decisions"], issues)
    _validate_feedback(snapshot["decisions"], issues)
    _validate_safe_exit(snapshot["hasSafeExit"], issues)
    _validate_limits(snapshot, issues)
    _validate_option_triggers(snapshot, issues)
    _validate_requirements(snapshot, issues)
    _validate_doors(snapshot, issues)

    errors = [i for i in issues if i["severity"] == "ERROR"]
    warnings = [i for i in issues if i["severity"] == "WARNING"]
    return {"errors": errors, "warnings": warnings, "canPublish": len(errors) == 0}


# ─── DAG ───────────────────────────────────────────────────────────────────
def _validate_graph(nodes, decisions, maps, issues):
    if not nodes:
        issues.append(_err("NO_NODES", "El caso debe tener al menos un nodo"))
        return

    start_count = sum(1 for n in nodes if n["startNode"])
    if start_count == 0:
        issues.append(_err(
            "NO_START_NODE",
            "El grafo debe tener exactamente un nodo inicial; no se encontró ninguno",
        ))
    elif start_count > 1:
        issues.append(_err(
            "MULTIPLE_START_NODES",
            f"El grafo tiene {start_count} nodos iniciales; debe tener exactamente 1",
        ))

    terminal_count = sum(1 for n in nodes if n["terminalNode"])
    if terminal_count == 0:
        issues.append(_err(
            "NO_TERMINAL_NODE",
            "El grafo debe tener al menos un nodo terminal (fin de simulación)",
        ))

    _detect_cycle(nodes, decisions, issues)
    _validate_decision_endpoints(nodes, decisions, issues)
    reached = _reachable_node_ids(nodes, decisions)
    _validate_dead_ends(nodes, decisions, reached, issues)
    _validate_node_maps(nodes, maps, issues)
    _validate_reachability(nodes, reached, issues)


def _validate_decision_endpoints(nodes, decisions, issues):
    """RN-02: cada opción lleva a un nodo válido del caso (y sale de uno)."""
    node_ids = {n["id"] for n in nodes}
    for d in decisions:
        if d["sourceNodeId"] not in node_ids or d["targetNodeId"] not in node_ids:
            issues.append(_err(
                "DECISION_NODE_NOT_IN_CASE",
                f"La decisión id={d['id']} une un nodo que no pertenece a este caso "
                f"(origen={d['sourceNodeId']}, destino={d['targetNodeId']})",
                f"decision:{d['id']}",
            ))


def _reachable_node_ids(nodes, decisions):
    """Nodos a los que se llega desde el nodo inicial; ``None`` si no hay un único inicio
    (ya es un error aparte y la alcanzabilidad no tiene sentido)."""
    starts = [n["id"] for n in nodes if n["startNode"]]
    if len(starts) != 1:
        return None
    adjacency = {}
    for d in decisions:
        adjacency.setdefault(d["sourceNodeId"], []).append(d["targetNodeId"])
    reached, pending = {starts[0]}, [starts[0]]
    while pending:
        for nxt in adjacency.get(pending.pop(), []):
            if nxt not in reached:
                reached.add(nxt)
                pending.append(nxt)
    return reached


def _validate_dead_ends(nodes, decisions, reached, issues):
    """Un nodo alcanzable que no es final y no tiene opciones deja al estudiante sin salida.

    Un nodo al que no se llega no se marca aquí: solo es una advertencia de alcanzabilidad.
    """
    with_options = {d["sourceNodeId"] for d in decisions}
    for n in nodes:
        if reached is not None and n["id"] not in reached:
            continue
        if not n["terminalNode"] and n["id"] not in with_options:
            issues.append(_err(
                "NODE_WITHOUT_OPTIONS",
                f"El nodo id={n['id']} no es terminal y no tiene opciones de decisión: "
                "el estudiante quedaría sin salida",
                f"node:{n['id']}",
            ))


def _validate_node_maps(nodes, maps, issues):
    """Un nodo que no es final necesita un mapa para poder explorarse.

    Si la instantánea no declara el nodo de cada mapa (formato antiguo) no se evalúa.
    """
    if not all("nodeId" in m for m in maps):
        return
    with_map = {m["nodeId"] for m in maps}
    for n in nodes:
        if not n["terminalNode"] and n["id"] not in with_map:
            issues.append(_err(
                "NODE_WITHOUT_MAP",
                f"El nodo id={n['id']} no tiene mapa: el estudiante no podría explorarlo",
                f"node:{n['id']}",
            ))


def _validate_reachability(nodes, reached, issues):
    """Advertencia: nodos a los que no se llega desde el nodo inicial."""
    if reached is None:
        return
    for n in nodes:
        if n["id"] not in reached:
            issues.append(_warn(
                "UNREACHABLE_NODE",
                f"El nodo id={n['id']} no se puede alcanzar desde el nodo inicial",
                f"node:{n['id']}",
            ))


def _detect_cycle(nodes, decisions, issues):
    adjacency = {n["id"]: [] for n in nodes}
    for d in decisions:
        adjacency.setdefault(d["sourceNodeId"], []).append(d["targetNodeId"])

    visiting, visited = set(), set()

    def has_cycle(node_id):
        if node_id in visiting:
            return True
        visiting.add(node_id)
        for nxt in adjacency.get(node_id, []):
            if nxt not in visited and has_cycle(nxt):
                return True
        visiting.discard(node_id)
        visited.add(node_id)
        return False

    for n in nodes:
        if n["id"] not in visited:
            if has_cycle(n["id"]):
                issues.append(_err(
                    "GRAPH_CYCLE",
                    "El grafo contiene un ciclo; los ciclos impiden que la simulación pueda finalizar",
                ))
                return


# ─── Geometry ──────────────────────────────────────────────────────────────
def _in_bounds(x, y, w, h, m):
    return x >= 0 and y >= 0 and (x + w) <= m["width"] and (y + h) <= m["height"]


def _validate_geometry(snapshot, issues):
    by_id = {}
    for m in snapshot["maps"]:
        by_id[m["id"]] = m
        if (m["spawnX"] < 0 or m["spawnX"] > m["width"]
                or m["spawnY"] < 0 or m["spawnY"] > m["height"]):
            issues.append(_err(
                "SPAWN_OUT_OF_BOUNDS",
                f"El spawn ({m['spawnX']},{m['spawnY']}) está fuera del mapa id={m['id']}",
                f"map:{m['id']}",
            ))

    for o in snapshot["objects"]:
        m = by_id.get(o["mapId"])
        if m is not None and not _in_bounds(o["x"], o["y"], o["width"], o["height"], m):
            issues.append(_err(
                "OBJECT_OUT_OF_BOUNDS",
                f"Objeto id={o['id']} está fuera del mapa id={o['mapId']}",
                f"object:{o['id']}",
            ))

    for c in snapshot["collisions"]:
        m = by_id.get(c["mapId"])
        if m is not None and not _in_bounds(c["x"], c["y"], c["width"], c["height"], m):
            issues.append(_err(
                "COLLISION_OUT_OF_BOUNDS",
                f"Colisión id={c['id']} está fuera del mapa id={c['mapId']}",
                f"collision:{c['id']}",
            ))


# ─── Ethics ────────────────────────────────────────────────────────────────
def _validate_ethics(decisions, issues):
    for d in decisions:
        reason = d.get("prohibitionReason")
        if d["prohibitedConduct"] and (reason is None or not reason.strip()):
            issues.append(_err(
                "PROHIBITED_WITHOUT_REASON",
                f"La decisión prohibida id={d['id']} debe documentar la razón de prohibición",
                f"decision:{d['id']}",
            ))


# ─── Feedback ──────────────────────────────────────────────────────────────
def _validate_feedback(decisions, issues):
    """Una decisión que no explica nada a quien aprende (RF-10): aviso, nunca bloquea.

    Cuenta como retroalimentación la propia (``feedbackText``) o, como en el reporte, la
    inmediata que la reemplaza cuando la propia falta (``immediateFeedback``).
    """
    for d in decisions:
        explanation = (d.get("feedbackText") or d.get("immediateFeedback") or "").strip()
        if not explanation:
            issues.append(_warn(
                "DECISION_WITHOUT_FEEDBACK",
                f"La decisión id={d['id']} no tiene retroalimentación para el estudiante",
                f"decision:{d['id']}",
            ))


# ─── Safe exit ─────────────────────────────────────────────────────────────
def _validate_safe_exit(has_safe_exit, issues):
    if not has_safe_exit:
        issues.append(_err(
            "NO_SAFE_EXIT",
            "El caso debe tener al menos un objeto EXIT configurado como salida segura",
        ))


# ─── Limits ────────────────────────────────────────────────────────────────
def _validate_limits(snapshot, issues):
    for m in snapshot["maps"]:
        if m["width"] > MAX_MAP_WIDTH or m["height"] > MAX_MAP_HEIGHT:
            issues.append(_err(
                "MAP_TOO_LARGE",
                f"Mapa id={m['id']} ({m['width']}×{m['height']}px) excede el límite "
                f"{MAX_MAP_WIDTH}×{MAX_MAP_HEIGHT}px",
                f"map:{m['id']}",
            ))

        obj_count = sum(1 for o in snapshot["objects"] if o["mapId"] == m["id"])
        if obj_count > MAX_OBJECTS_PER_MAP:
            issues.append(_err(
                "TOO_MANY_OBJECTS",
                f"Mapa id={m['id']} tiene {obj_count} objetos (máx {MAX_OBJECTS_PER_MAP})",
                f"map:{m['id']}",
            ))

        col_count = sum(1 for c in snapshot["collisions"] if c["mapId"] == m["id"])
        if col_count > MAX_COLLISIONS_PER_MAP:
            issues.append(_err(
                "TOO_MANY_COLLISIONS",
                f"Mapa id={m['id']} tiene {col_count} colisiones (máx {MAX_COLLISIONS_PER_MAP})",
                f"map:{m['id']}",
            ))

        trig_count = sum(
            1 for o in snapshot["objects"]
            if o["mapId"] == m["id"] and (o["type"] or "").upper() == "TRIGGER"
        )
        if trig_count > MAX_TRIGGERS_PER_MAP:
            issues.append(_err(
                "TOO_MANY_TRIGGERS",
                f"Mapa id={m['id']} tiene {trig_count} triggers (máx {MAX_TRIGGERS_PER_MAP})",
                f"map:{m['id']}",
            ))

        dlg_count = sum(1 for d in snapshot["dialogues"] if d["mapId"] == m["id"])
        if dlg_count >= DIALOGUE_WARN_THRESHOLD:
            issues.append(_warn(
                "MANY_DIALOGUES",
                f"Mapa id={m['id']} tiene {dlg_count} diálogos; considera distribuirlos en más nodos",
                f"map:{m['id']}",
            ))


# ─── Opciones, requisitos y puertas (E4, R21) ──────────────────────────────
def _validate_option_triggers(snapshot, issues):
    """Cada opción tiene por dónde elegirse: una elección de diálogo o un objeto del mapa que la ofrezca.

    Antes de E4 un caso podía publicarse con opciones que ningún diálogo ni objeto ofrecía: se
    publicaba y no se podía jugar. Sin ``choices`` (formato anterior de la instantánea) no se evalúa.
    """
    if "choices" not in snapshot:
        return
    offered = {c["optionId"] for c in snapshot["choices"] if c.get("optionId") is not None}
    offered |= {o["optionId"] for o in snapshot["objects"] if o.get("optionId") is not None}
    for d in snapshot["decisions"]:
        if d["id"] not in offered:
            issues.append(_err(
                "OPTION_WITHOUT_TRIGGER",
                f"La opción id={d['id']} no la ofrece ninguna elección de diálogo ni objeto del mapa: "
                "nadie podría elegirla",
                f"decision:{d['id']}",
            ))


def _names(value):
    return [name for name in value if isinstance(name, str)] if isinstance(value, list) else []


def _unknown_requirement(required, ref, issues):
    issues.append(_err("REQUIRES_UNKNOWN", f"Se pide «{required}», que el caso no tiene", ref, required))


def _validate_requirements(snapshot, issues):
    """Lo que una puerta, un objeto o una elección piden existe en el caso.

    ``requiresTools`` y ``toolCode``/``requiredTool`` son códigos del catálogo de herramientas;
    ``requiresNodes``, claves de escena; ``requiresInspected``, claves de objeto; ``requiresNpcs``, las
    claves con que el motor reconoce a un NPC (``viewedNpcKeys``): la de su objeto, la de su diálogo o la
    de un NPC ambiental de la sala. Sin ``tools`` (formato anterior) no se evalúa.
    """
    if "tools" not in snapshot:
        return
    tools = {t["code"] for t in snapshot["tools"]}
    node_keys = {n["key"] for n in snapshot["nodes"] if "key" in n}
    nodes_known = all("key" in n for n in snapshot["nodes"])
    object_keys = {o["key"] for o in snapshot["objects"] if "key" in o}
    objects_known = all("key" in o for o in snapshot["objects"])
    dialogues = snapshot.get("dialogues", [])
    npcs_known = objects_known and all("key" in d for d in dialogues)
    npc_keys = object_keys | {d["key"] for d in dialogues if "key" in d} | {
        key for m in snapshot["maps"] for key in m.get("ambientNpcKeys", ())
    }
    for o in snapshot["objects"]:
        ref = f"object:{o['id']}"
        meta = o.get("meta") if isinstance(o.get("meta"), dict) else {}
        for code in _names(meta.get("requiresTools")):
            if code not in tools:
                _unknown_requirement(code, ref, issues)
        if o.get("toolCode") and o["toolCode"] not in tools:
            _unknown_requirement(o["toolCode"], ref, issues)
        if nodes_known:
            for key in _names(meta.get("requiresNodes")):
                if key not in node_keys:
                    _unknown_requirement(key, ref, issues)
        if objects_known:
            for key in _names(meta.get("requiresInspected")):
                if key not in object_keys:
                    _unknown_requirement(key, ref, issues)
        if npcs_known:
            for key in _names(meta.get("requiresNpcs")):
                if key not in npc_keys:
                    _unknown_requirement(key, ref, issues)
    for c in snapshot.get("choices", []):
        if c.get("requiredTool") and c["requiredTool"] not in tools:
            _unknown_requirement(c["requiredTool"], f"map:{c['mapId']}", issues)


def _validate_doors(snapshot, issues):
    """Una puerta con destino lleva a una escena que existe y tiene mapa (si no, no se podría entrar).

    Una salida (``EXIT``) sin ``targetNodeKey`` es la salida segura y es válida. Sin ``key`` en los
    nodos (formato anterior) no se evalúa.
    """
    nodes = snapshot["nodes"]
    if not all("key" in n for n in nodes):
        return
    by_key = {n["key"]: n["id"] for n in nodes}
    with_map = {m["nodeId"] for m in snapshot["maps"] if "nodeId" in m}
    maps_known = all("nodeId" in m for m in snapshot["maps"])
    for o in snapshot["objects"]:
        if (o["type"] or "").upper() != "EXIT":
            continue
        meta = o.get("meta") if isinstance(o.get("meta"), dict) else {}
        target = meta.get("targetNodeKey")
        if not isinstance(target, str) or not target.strip():
            continue
        node_id = by_key.get(target)
        if node_id is None or (maps_known and node_id not in with_map):
            issues.append(_err(
                "DOOR_TARGET_MISSING",
                f"La puerta id={o['id']} lleva a la escena «{target}», que no existe o no tiene mapa",
                f"object:{o['id']}",
            ))
