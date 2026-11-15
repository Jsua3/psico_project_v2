"""El ensayo del borrador (bloque A2): la docente dueña del caso (o el ADMIN) juega su borrador en el juego real.

Un ensayo es un ``SimulationAttempt`` con ``is_rehearsal=True`` (Tarea 6). Aquí viven las tres órdenes de autoría:

* ``start``: abre el ensayo (cierra el anterior de esa autora y esa versión) y devuelve el estado del juego con su token más
  el bloque ``rehearsal``;
* ``adjust``: mueve la escena, marca lo explorado, la persona y los hitos; valida TODO antes de escribir;
* ``read``: el bloque, para «Recargar borrador».

El bloque (``block``) es lo que lee el panel de la autora: por qué una respuesta no aparece, qué comentarios se dicen, qué lleva
explorado y qué puede marcar. Solo viaja por estas rutas; las del juego no lo llevan. No exige sello ni que el documento pase el
validador. «Sala actual» es la del mapa de la escena actual: es la que leen los requisitos de las opciones.
"""
import json

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import Activation, Bond
from apps.simulation.models import (
    AttemptEvent,
    AttemptWorldState,
    ClinicalTool,
    DecisionOption,
    DialogueTree,
    MapObject,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from shared.exceptions import ApiError
from shared.jsonutils import read_map, read_string_list, write_map

from . import attempt_lifecycle as lifecycle
from . import attempt_report, case_rules, case_state, comments, game_service, option_availability, world_state
from .attempt_lock import lock_attempt_row
from .attempt_replacement import replace_open_attempt

KINDS = ("talked", "inspected", "has", "used")
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
REPLACE_REASON = "Reemplazado por un ensayo nuevo"
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
PICKED_BY_AUTHOR = "Escena elegida por la autora"


# ─── Errores ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _gone():
    return ApiError(
        "REHEARSAL_GONE",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        "Este ensayo ya no existe. Abre uno nuevo.",
        status.HTTP_404_NOT_FOUND,
    )


def _closed():
    return ApiError(
        "REHEARSAL_CLOSED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        "Este ensayo ya se cerró. Abre uno nuevo.",
        status.HTTP_409_CONFLICT,
    )


def _bad(field, message):
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


# ─── Abrir ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _open_rehearsals(actor, version):
    return SimulationAttempt.all_objects.filter(
        student_id=actor.id, case_version_id=version.id, is_rehearsal=True, status__in=lifecycle.OPEN_STATUSES
    )


def _start_node(version, from_node_id):
    if from_node_id is None:
        node = SimulationNode.objects.filter(case_version_id=version.id, start_node=True).order_by("id").first()
        if node is None:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise NotFound("El caso no tiene escena de inicio.")
        return node
    node = SimulationNode.objects.filter(pk=from_node_id, case_version_id=version.id).first()
    if node is None:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        raise _bad("desde", "La escena de la que se quiere empezar no es de este caso.")
    return node


def start(version, actor, from_node_id):
    """Abre el ensayo de ``actor`` en ``from_node_id`` (o en la escena de inicio) y cierra el anterior."""
    node = _start_node(version, from_node_id)
    with transaction.atomic():
        # ``of=("self",)``: con ``select_related`` PostgreSQL bloquearía también la fila de la escena.
        for old in _open_rehearsals(actor, version).select_for_update(of=("self",)).select_related("current_node"):
            replace_open_attempt(old, by=actor, reason=REPLACE_REASON)
        try:
            # Su propio punto de guardado: un choque con el índice único no rompe la transacción de afuera.
            with transaction.atomic():
                attempt, raw_token = game_service.start_rehearsal_attempt(version, actor, node)
        except IntegrityError:
            # Otra pestaña abrió su ensayo entre el cierre y la creación (``uq_rehearsal_open_per_author_case``): gana esa.
            # Sin su token en claro no se puede devolver su juego, así que se reemite (equivale al reemplazo secuencial).
            attempt = _open_rehearsals(actor, version).select_related(
                "case_version__simulation_case", "current_node"
            ).first()
            if attempt is None:
                raise
            raw_token = game_service._reissue_token(attempt)
    return {**game_service.state_for(attempt, raw_token), "rehearsal": block(attempt)}


def _find(version, actor, attempt_id, *, lock=False):
    """El ensayo ABIERTO de ``actor`` en esa versión: 404 ``REHEARSAL_GONE`` si no existe (o no es suyo), 409 si ya se cerró."""
    if lock:
        lock_attempt_row(attempt_id)
    attempt = (
        SimulationAttempt.all_objects.select_related("case_version__simulation_case", "current_node")
        .filter(pk=attempt_id, is_rehearsal=True, case_version_id=version.id, student_id=actor.id)
        .first()
    )
    if attempt is None:
        raise _gone()
    if not lifecycle.state_of(attempt).is_open:
        raise _closed()
    return attempt


def read(version, actor, attempt_id):
    return {"rehearsal": block(_find(version, actor, attempt_id))}


# ─── Lo explorable ─────────────────────────────────────────────────────────────────────────────────────────────────
def _ambient_keys(scene_map):
    npcs = read_map(scene_map.ambient_json).get("ambientNpcs")
    return [n["key"] for n in npcs if isinstance(n, dict) and isinstance(n.get("key"), str) and n["key"]] \
        if isinstance(npcs, list) else []


def _explorable_pairs(version_id, scene_map):
    """``[(tipo, clave)]`` de lo que se puede marcar en la escena: la única fuente de lo que el bloque lista y el PATCH admite.

    ``talked``: las PERSON visibles y los personajes de ambiente del mapa; ``inspected``: sus objetos visibles; ``has`` y
    ``used``: las herramientas del caso."""
    pairs = []
    if scene_map is not None:
        objects = list(MapObject.objects.filter(scene_map_id=scene_map.id, visible=True).order_by("id"))
        pairs += [("talked", o.object_key) for o in objects if o.object_type == "PERSON"]
        pairs += [("talked", key) for key in _ambient_keys(scene_map)]
        pairs += [("inspected", o.object_key) for o in objects]
    tools = list(ClinicalTool.objects.filter(case_version_id=version_id).order_by("id").values_list("tool_code", flat=True))
    pairs += [("has", code) for code in tools]
    pairs += [("used", code) for code in tools]
    return list(dict.fromkeys(pairs))


def _item(kind, key, labels, node_id):
    return {"kind": kind, "key": key, "label": labels.get((node_id, kind, key), key)}


# ─── El bloque ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _world_for_reading(attempt):
    """El mundo del intento sin escribir; ``None`` si la escena no tiene mapa y el intento no tiene mundo guardado."""
    try:
        return world_state.resolve_world_state(attempt, tolerate_missing_map=True)[0]
    except NotFound:
        return None


def _warnings(node, options, *, has_map):
    """Lo que el estudiante vería roto en esta escena (los mismos avisos de la pantalla «Probar» del editor)."""
    found = []
    if not has_map:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        found.append("Esta escena todavía no tiene sala: el estudiante la vería sin escenario.")
    if not options and not node.terminal_node:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        found.append("Esta escena no tiene respuestas ni es un final: el estudiante se quedaría aquí.")
    for option in options:
        if option.target_node_id is None:  # Defensivo: ``target_node`` es NOT NULL; solo un objeto a medio armar llega aquí.
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            found.append(
                f"«{option.text}»: Esta respuesta aún no lleva a ninguna escena. En el caso real, el estudiante se quedaría aquí."
            )
    return found


def _unmet(condition, context):
    return [list(fact) for fact in conditions.unmet_facts(condition, context)]


def block(attempt):
    """El bloque ``rehearsal`` del panel de la autora para la escena actual del ensayo (ver el módulo)."""
    node = attempt.current_node
    version_id = attempt.case_version_id
    world = _world_for_reading(attempt)
    scene_map = SceneMap.objects.filter(node_id=node.id).first()
    options = list(DecisionOption.objects.filter(source_node_id=node.id).order_by("id"))
    context = option_availability.availability_context(attempt, node, world)
    offered, _, _ = option_availability.evaluate_options(attempt, node, world)
    offered_ids = {o.id for o in offered}

    option_rows, wanted = [], []
    for option in options:
        row = {"id": option.id, "text": option.text, "offered": option.id in offered_ids, "missing": [], "retainedBy": None}
        if not row["offered"]:
            requires = case_rules.requires_of(option)
            if requires is None:
                row["retainedBy"] = "broken"
            else:
                unmet = _unmet(requires, context)
                row["retainedBy"] = "facts" if unmet else "condition"
                row["_unmet"] = unmet
                wanted += unmet
        option_rows.append(row)

    due_ids = {c["id"] for c in comments.due_comments(attempt, node, world, context)}
    retained = comments.retained_by(attempt, node, world, context, due_ids)
    comment_rows = []
    for position, comment in enumerate(case_rules.comments_of(node)):
        due = f"{node.id}-{position}" in due_ids
        why = retained.get(position)
        unmet = []
        if why == "condition":
            unmet = _unmet(comment["cuando"], context)
            wanted += unmet
        comment_rows.append({
            "index": position, "personaje": comment["personaje"], "line": comment["linea"], "due": due,
            "retainedBy": why, "_unmet": unmet,
        })

    explorable = _explorable_pairs(version_id, scene_map)
    explored_sets = context["explored"]
    explored = {kind: sorted(explored_sets[kind]) for kind in KINDS}
    labels = attempt_report.missed_labels(version_id, {node.id: [(None, wanted + [list(p) for p in explorable])]})

    for row in option_rows:
        row["missing"] = [_item(k, key, labels, node.id) for k, key in row.pop("_unmet", [])]
    for row in comment_rows:
        row["missing"] = [_item(k, key, labels, node.id) for k, key in row.pop("_unmet")]

    persona = case_state.persona_dto(case_state.read(attempt, world).persona)
    path = [
        {"nodeId": event.node_id, "title": event.node.title}
        for event in AttemptEvent.objects.filter(attempt_id=attempt.id, event_type="NODE_ENTERED", node__isnull=False)
        .select_related("node").order_by("id")
    ]
    scenes = [
        {"id": n.id, "key": n.node_key, "title": n.title, "start": n.start_node, "terminal": n.terminal_node}
        for n in SimulationNode.objects.filter(case_version_id=version_id).order_by("id")
    ]
    return {
        "sceneId": node.id,
        "options": option_rows,
        "comments": comment_rows,
        "warnings": _warnings(node, options, has_map=scene_map is not None),
        "persona": persona,
        "milestones": list(case_state.milestones_in_order(attempt)),
        "path": path,
        "explored": explored,
        "explorable": [_item(k, key, labels, node.id) for k, key in explorable],
        "scenes": scenes,
    }


# ─── Ajustar ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _string_list(value, field, what):
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise _bad(field, f"{what} debe ser una lista de claves.")
    return list(dict.fromkeys(value))


def _plan(attempt, version, request):
    """Valida TODO el pedido y devuelve lo que hay que escribir; no escribe nada."""
    plan = {}
    node = attempt.current_node
    if request.get("irA") is not None:
        node = SimulationNode.objects.filter(pk=request["irA"], case_version_id=version.id).first()
        if node is None:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _bad("irA", "La escena a la que se quiere ir no es de este caso.")
        if node.id != attempt.current_node_id:  # ir a la escena actual no es un movimiento: ni evento ni paso nuevo
            plan["node"] = node
    scene_map = SceneMap.objects.filter(node_id=node.id).first()
    plan["scene_map"] = scene_map

    explorado = request.get("explorado")
    if explorado is not None:
        if not isinstance(explorado, dict):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _bad("explorado", "Lo explorado debe ser un objeto con talked, inspected, has y used.")
        extra = sorted(set(explorado) - set(KINDS))
        if extra:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _bad("explorado", f"Lo explorado no admite «{extra[0]}»: solo talked, inspected, has y used.")
        allowed = set(_explorable_pairs(version.id, scene_map))
        wanted = {}
        for kind in KINDS:
            keys = _string_list(explorado.get(kind, []), "explorado", f"«{kind}»")
            for key in keys:
                if (kind, key) not in allowed:
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                    raise _bad("explorado", f"«{key}» no se puede marcar como {kind} en esta escena.")
            wanted[kind] = keys
        plan["explorado"] = wanted

    persona = request.get("persona")
    if persona is not None:
        if not isinstance(persona, dict) or not persona or set(persona) - {"bond", "activation"}:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise _bad("persona", "La persona admite solo bond y activation.")
        chosen = {}
        for field, enum in (("bond", Bond), ("activation", Activation)):
            if field in persona:
                try:
                    chosen[field] = enum(persona[field]).value
                except ValueError:
                    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                    raise _bad("persona", f"«{persona[field]}» no es un valor de {field}.") from None
        plan["persona"] = chosen

    hitos = request.get("hitos")
    if hitos is not None:
        keys = _string_list(hitos, "hitos", "Los hitos")
        declared = {m.key for m in case_rules.rules_of(version).milestones}
        for key in keys:
            if key not in declared:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
                raise _bad("hitos", f"El hito «{key}» no lo declara el caso.")
        plan["hitos"] = keys

    needs_world = [name for name in ("explorado", "persona", "hitos") if name in plan]
    if needs_world and scene_map is None and not AttemptWorldState.objects.filter(attempt_id=attempt.id).exists():
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
        raise _bad(needs_world[0], "Esta escena todavía no tiene sala: no hay dónde guardarlo.")
    return plan


def _own_keys(scene_map):
    """Las claves de este mapa en las listas globales: sus objetos, sus personajes de ambiente y sus diálogos."""
    keys = set(MapObject.objects.filter(scene_map_id=scene_map.id).values_list("object_key", flat=True))
    keys |= set(_ambient_keys(scene_map))
    keys |= set(DialogueTree.objects.filter(scene_map_id=scene_map.id).values_list("tree_key", flat=True))
    return keys


def _apply_explored(state, scene_map, wanted):
    """Ruling 7: lo marcado es exactamente lo que cuenta para la escena."""
    flags = read_map(state.flags_json)
    by_sala = flags.get(option_availability.EXPLORED_KEY)
    by_sala = by_sala if isinstance(by_sala, dict) else {}
    if scene_map is not None:
        by_sala[option_availability.sala_key(scene_map)] = {"talked": wanted["talked"], "inspected": wanted["inspected"]}
        own = _own_keys(scene_map)
        trees = dict(
            DialogueTree.objects.filter(scene_map_id=scene_map.id, map_object__isnull=False)
            .values_list("map_object__object_key", "tree_key")
        )
        seen = flags.get("viewedNpcKeys")
        viewed = [k for k in (seen if isinstance(seen, list) else []) if isinstance(k, str) and k not in own]
        for key in wanted["talked"]:
            viewed += [key] + ([trees[key]] if key in trees else [])
        flags["viewedNpcKeys"] = list(dict.fromkeys(viewed))
        kept = [k for k in read_string_list(state.inspected_object_keys_json) if k not in own]
        state.inspected_object_keys_json = json.dumps(list(dict.fromkeys(kept + wanted["inspected"])))
    flags[option_availability.EXPLORED_KEY] = by_sala
    flags.pop(option_availability.BEFORE_KEY, None)
    state.flags_json = write_map(flags)
    state.inventory_json = json.dumps(wanted["has"])
    state.used_tool_keys_json = json.dumps(wanted["used"])


def adjust(version, actor, attempt_id, request):
    """Mueve la escena y marca lo explorado, la persona y los hitos del ensayo; todo o nada."""
    with transaction.atomic():
        attempt = _find(version, actor, attempt_id, lock=True)
        plan = _plan(attempt, version, request)
        if "node" in plan:
            attempt.current_node = plan["node"]
            attempt.save(update_fields=["current_node"])
            game_service._save_event(attempt, "NODE_ENTERED", plan["node"], None, PICKED_BY_AUTHOR)
        if {"explorado", "persona", "hitos"} & set(plan) or "node" in plan:
            try:
                state = world_state.require_world_state(attempt)
            except NotFound:
                state = AttemptWorldState.objects.filter(attempt_id=attempt.id).select_related("scene_map").first()
            if state is not None and {"explorado", "persona", "hitos"} & set(plan):
                if "explorado" in plan:
                    _apply_explored(state, plan["scene_map"], plan["explorado"])
                flags = read_map(state.flags_json)
                if "persona" in plan:
                    current = dict(case_state.persona_dto(case_state.read(attempt, state).persona))
                    flags["persona"] = {
                        "bond": plan["persona"].get("bond", current["bond"]),
                        "activation": plan["persona"].get("activation", current["activation"]),
                    }
                if "hitos" in plan:
                    flags["milestones"] = plan["hitos"]
                state.flags_json = write_map(flags)
                state.save()
    attempt = _find(version, actor, attempt_id)
    return {"rehearsal": block(attempt)}


def discard_for_version(case_version_id) -> int:
    """Borra los ensayos de una versión (la docente borró una escena, una respuesta o un mapa); los hijos caen por la base."""
    deleted, _ = SimulationAttempt.all_objects.filter(case_version_id=case_version_id, is_rehearsal=True).delete()
    return deleted
