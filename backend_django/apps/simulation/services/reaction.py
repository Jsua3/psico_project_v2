"""La reacción del personaje a una decisión (bloque A, DSL 2.1).

La respuesta de una decisión lleva ``reaction``: lo que el autor escribió en ``reaction_json`` de la opción, con el
gesto ya resuelto, para que el cliente anime al personaje. Un dato ilegible o fuera del vocabulario cae al valor por
defecto: una reacción mal armada nunca rompe la partida. La clase de la respuesta no viaja (solo va en el informe de
cierre): del gesto se infiere, pero no se declara.
"""
from apps.simulation.casedef.vocabulary import EXPRESSIONS, GESTURES, default_gesture
from apps.simulation.models import DialogueChoice, MapObject

from . import case_rules, case_state


def _people_of_the_version(decision):
    """Los PERSON visibles de todos los mapas de la versión, en orden estable (una sola consulta)."""
    return list(
        MapObject.objects.filter(
            scene_map__case_version_id=decision.case_version_id, object_type="PERSON", visible=True
        ).select_related("character", "scene_map").order_by("id")
    )


def _first_in_order(people, decision, scene_map):
    """El primero de ``people`` por cercanía a donde se decide: el mapa del estudiante, el del nodo de origen, el resto."""
    here = [p for p in people if scene_map is not None and p.scene_map_id == scene_map.id]
    origin = [p for p in people if p.scene_map.node_id == decision.source_node_id]
    return next(iter(here + origin + people), None)


def _object_key(decision, reaction, scene_map) -> str | None:
    """La clave del PERSON que reacciona.

    Con ``personaje``: la PERSON visible con ese personaje, en el mapa donde está el estudiante (``scene_map``) o, si no,
    en el del nodo de origen. Sin él: la PERSON que ofrece la opción, buscada en ese orden y, al final, en cualquier mapa
    de la versión (cada decisión la ofrece una PERSON del mapa donde se elige, que puede no ser el del nodo de origen).
    """
    people = _people_of_the_version(decision)
    wanted = reaction.get("personaje")
    if isinstance(wanted, str) and wanted:
        matching = [p for p in people if p.character is not None and p.character.character_key == wanted]
        near = [p for p in matching if (scene_map is not None and p.scene_map_id == scene_map.id)
                or p.scene_map.node_id == decision.source_node_id]
        found = _first_in_order(near, decision, scene_map)
        return found.object_key if found is not None else None
    keys = {person.id for person in people}
    through_dialog = set(
        DialogueChoice.objects.filter(decision_option_id=decision.id, dialogue_tree__map_object_id__in=list(keys))
        .values_list("dialogue_tree__map_object_id", flat=True)
    )
    offering = [p for p in people if p.decision_option_id == decision.id or p.id in through_dialog]
    found = _first_in_order(offering, decision, scene_map)
    return found.object_key if found is not None else None


def resolve(decision, persona, scene_map=None) -> dict | None:
    """``{"line", "emotion", "gesture", "objectKey"}`` de la decisión, o ``None`` si no hay a quién ni qué mostrar.

    ``persona`` es ``(Bond, Activation)``: la vigente DESPUÉS de aplicar la decisión o, si no se aplicó (reintento), la
    actual. ``scene_map`` es el mapa donde está el estudiante al decidir (``None`` si no se sabe). ``emotion`` es ``None`` cuando el autor no escribió una del vocabulario (el cliente usa la cara de la persona).
    """
    stored = case_rules.reaction_of(decision)
    line = stored.get("linea")
    line = line if isinstance(line, str) else ""
    emotion = stored.get("emocion")
    emotion = emotion if emotion in EXPRESSIONS else None
    gesture = stored.get("gesto")
    if gesture not in GESTURES:
        gesture = default_gesture(case_state.response_class_of(decision), persona[1])
    object_key = _object_key(decision, stored, scene_map)
    if object_key is None and not line:
        return None
    return {"line": line, "emotion": emotion, "gesture": gesture, "objectKey": object_key}
