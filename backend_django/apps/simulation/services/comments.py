"""Los comentarios de una escena que se dicen ahora (bloque A2, DSL 2.1).

Un comentario es lo que dice un personaje cuando el estudiante se le acerca; su ``cuando`` opcional pregunta por lo que el
estudiante ya exploró. Aquí se evalúan y se sirven en ``world.comments``. La condición nunca viaja: mostrarla le diría al
estudiante qué le falta explorar. Un ``cuando`` mal formado hace que el comentario no se diga, igual que un requisito roto.
"""
from django.db.models import Q

from apps.simulation.casedef import conditions
from apps.simulation.casedef.availability import is_available
from apps.simulation.casedef.vocabulary import EXPRESSIONS, GESTURES
from apps.simulation.models import MapObject

from . import case_rules, option_availability


def _pending(comments):
    """``[(posición, comentario)]`` de los que no traen ``cuando`` o lo traen bien formado, en el orden del documento."""
    pending = []
    for position, comment in enumerate(comments):
        if comment.get("cuando") == {}:
            # ``{}`` es «sin condición», igual que ausente (la misma gramática que ``requiere``).
            comment = {key: value for key, value in comment.items() if key != "cuando"}
        if "cuando" in comment and not (
            isinstance(comment["cuando"], dict) and conditions.is_valid(comment["cuando"], facts=True)
        ):
            continue
        pending.append((position, comment))
    return pending


def _people_by_character(node, world_state, characters):
    """``{character_key: object_key}``: la PERSON visible de cada personaje, en el mapa del estudiante y, si no, en el de la
    escena. Una sola consulta."""
    student_map_id = getattr(world_state, "scene_map_id", None)
    here = Q(scene_map__node_id=node.id)
    if student_map_id is not None:
        here |= Q(scene_map_id=student_map_id)
    people = MapObject.objects.filter(
        here, object_type="PERSON", visible=True, character__character_key__in=characters
    ).select_related("character").order_by("id")
    found, in_student_map = {}, set()
    for person in people:
        key = person.character.character_key
        mine = person.scene_map_id == student_map_id
        if key not in found or (mine and key not in in_student_map):
            found[key] = person.object_key
        if mine:
            in_student_map.add(key)
    return found


def due_comments(attempt, node, world_state, context=None) -> list[dict]:
    """Los comentarios de la escena cuyo ``cuando`` se cumple: ``{id, objectKey, line, emotion, gesture}``, en el orden del
    documento. ``context`` es el de las opciones si ya se armó; sin comentarios en la escena no se consulta nada."""
    comments = case_rules.comments_of(node)
    if not comments:
        return []
    pending = _pending(comments)
    if not pending:
        return []
    conditional = [c["cuando"] for _, c in pending if "cuando" in c]
    if conditional:
        # El contexto de las opciones no lee las decisiones si ningún requisito las cuenta: para un ``count`` se rearma.
        if not context or option_availability._mentions_count(conditional):
            context = option_availability.availability_context(
                attempt, node, world_state, need_counts=option_availability._mentions_count(conditional)
            )
        pending = [(p, c) for p, c in pending if "cuando" not in c or is_available(c["cuando"], context)]
    if not pending:
        return []
    people = _people_by_character(node, world_state, {c["personaje"] for _, c in pending})
    result = []
    for position, comment in pending:
        object_key = people.get(comment["personaje"])
        if object_key is None:
            continue
        emotion, gesture = comment.get("emocion"), comment.get("gesto")
        result.append({
            "id": f"{node.id}-{position}",
            "objectKey": object_key,
            "line": comment["linea"],
            "emotion": emotion if isinstance(emotion, str) and emotion in EXPRESSIONS else None,
            "gesture": gesture if isinstance(gesture, str) and gesture in GESTURES else None,
        })
    return result
