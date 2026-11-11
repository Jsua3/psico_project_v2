"""La reacción del personaje a una decisión (bloque A, DSL 2.1).

La respuesta de una decisión lleva ``reaction``: lo que el autor escribió en ``reaction_json`` de la opción, con el
gesto ya resuelto, para que el cliente anime al personaje. Un dato ilegible o fuera del vocabulario cae al valor por
defecto: una reacción mal armada nunca rompe la partida. La clase de la respuesta no viaja (solo va en el informe de
cierre): del gesto se infiere, pero no se declara.
"""
from apps.simulation.casedef.vocabulary import EXPRESSIONS, GESTURES, default_gesture
from apps.simulation.models import DialogueChoice, MapObject

from . import case_rules, case_state


def _person_objects(decision):
    """Los PERSON visibles del mapa del nodo de origen, en orden estable."""
    return list(
        MapObject.objects.filter(
            scene_map__node_id=decision.source_node_id, object_type="PERSON", visible=True
        ).select_related("character").order_by("id")
    )


def _object_key(decision, reaction) -> str | None:
    """La clave del PERSON que reacciona: el del personaje que nombra la reacción o, sin él, el que ofrece la opción."""
    people = _person_objects(decision)
    wanted = reaction.get("personaje")
    if isinstance(wanted, str) and wanted:
        for person in people:
            if person.character is not None and person.character.character_key == wanted:
                return person.object_key
        return None
    for person in people:
        if person.decision_option_id == decision.id:
            return person.object_key
    keys = {person.id: person.object_key for person in people}
    choice = (
        DialogueChoice.objects.filter(decision_option_id=decision.id, dialogue_tree__map_object_id__in=list(keys))
        .order_by("id").first()
    )
    return keys.get(choice.dialogue_tree.map_object_id) if choice is not None else None


def resolve(decision, persona) -> dict | None:
    """``{"line", "emotion", "gesture", "objectKey"}`` de la decisión, o ``None`` si no hay a quién ni qué mostrar.

    ``persona`` es ``(Bond, Activation)``: la vigente DESPUÉS de aplicar la decisión o, si no se aplicó (reintento), la
    actual. ``emotion`` es ``None`` cuando el autor no escribió una del vocabulario (el cliente usa la cara de la persona).
    """
    stored = case_rules.reaction_of(decision)
    line = stored.get("linea")
    line = line if isinstance(line, str) else ""
    emotion = stored.get("emocion")
    emotion = emotion if emotion in EXPRESSIONS else None
    gesture = stored.get("gesto")
    if gesture not in GESTURES:
        gesture = default_gesture(case_state.response_class_of(decision), persona[1])
    object_key = _object_key(decision, stored)
    if object_key is None and not line:
        return None
    return {"line": line, "emotion": emotion, "gesture": gesture, "objectKey": object_key}
