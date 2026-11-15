"""Ayudante compartido: deja en el mundo de un intento lo que piden los requisitos de las opciones recomendadas del caso.

SIM-VBG-001 2.1 retiene las opciones recomendadas de cuatro escenas hasta que el estudiante explore. Las pruebas que juegan
el caso de punta a punta para probar otra cosa (informe, encuesta, privacidad...) llaman a esto una vez tras empezar el
intento. Lo que hay que explorar se DERIVA del caso (``requires_json`` de cada opción RECOMMENDED de la versión del
intento), no está escrito aquí, y se anota como lo hace el juego:

* ``talked`` / ``inspected``: ``option_availability.record_fact`` en la sala del mapa de la escena de la opción y, después,
  la lista global (``viewedNpcKeys`` / ``inspected_object_keys_json``), igual que ``open_interaction`` y
  ``record_npc_interaction``.
* ``has`` / ``used``: se SUMAN (sin duplicar) a ``inventory_json`` / ``used_tool_keys_json``; no se reemplaza lo que había.

Un requisito que este ayudante no sabe satisfacer (``milestone``, ``count``, ``persona``, ``not``) falla con un mensaje claro.
"""
import json

from apps.simulation.casedef import conditions
from apps.simulation.models import DecisionOption, SceneMap, SimulationAttempt
from apps.simulation.services import case_rules, option_availability, world_service

_GROUPS = ("all", "any")


def _facts_to_satisfy(requirement, option) -> list:
    """Los hechos ``(tipo, clave)`` que hay que dejar hechos para cumplir ``requirement``; falla si no sabe cómo."""
    found = []

    def walk(condition):
        if not isinstance(condition, dict):
            raise AssertionError(f"el requisito de {option.option_key} no es una condición: {condition!r}")
        for group in _GROUPS:
            if group in condition:
                for item in condition[group]:
                    walk(item)
                return
        kinds = [kind for kind in conditions.FACT_KINDS if kind in condition]
        if len(condition) == 1 and kinds:
            found.append((kinds[0], condition[kinds[0]]))
            return
        raise AssertionError(
            f"case_exploration no sabe satisfacer el requisito {condition!r} de la opción {option.option_key}: "
            "solo hay hechos (talked, inspected, has, used) dentro de all/any. Amplía el ayudante o explora a mano."
        )

    walk(requirement)
    return found


def _append(raw_json, key):
    items = json.loads(raw_json or "[]")
    if key not in items:
        items.append(key)
    return json.dumps(items)


def explore_what_the_case_asks_for(attempt_id):
    """Deja explorado en el mundo del intento lo que piden los requisitos de sus opciones recomendadas."""
    # También el ensayo de una docente (``is_rehearsal``), que el gestor por defecto no ve.
    attempt = SimulationAttempt.all_objects.get(pk=attempt_id)
    # La lectura del mundo no lo guarda (E1-6): se resuelve el que tendría y se persiste con lo explorado.
    state, _ = world_service.resolve_world_state(attempt)
    own_map = state.scene_map
    options = DecisionOption.objects.filter(
        case_version_id=attempt.case_version_id, response_class="RECOMMENDED"
    ).order_by("id")
    for option in options:
        requirement = case_rules.requires_of(option)
        assert requirement is not None, f"el requisito de {option.option_key} está roto"
        if not requirement:
            continue
        origin_map = SceneMap.objects.filter(node_id=option.source_node_id).first()
        for kind, key in _facts_to_satisfy(requirement, option):
            if kind in ("talked", "inspected"):
                # ``record_fact`` anota en la sala del mapa del mundo: se apunta a la de la escena de la opción y se devuelve.
                state.scene_map = origin_map
                option_availability.record_fact(state, kind, key)
                state.scene_map = own_map
                if kind == "talked":
                    flags = json.loads(state.flags_json or "{}")
                    viewed = flags.get("viewedNpcKeys")
                    viewed = viewed if isinstance(viewed, list) else []
                    if key not in viewed:
                        viewed.append(key)
                    flags["viewedNpcKeys"] = viewed
                    state.flags_json = json.dumps(flags)
                else:
                    state.inspected_object_keys_json = _append(state.inspected_object_keys_json, key)
            elif kind == "has":
                state.inventory_json = _append(state.inventory_json, key)
            else:  # used: la clave sin objetivo es una de las formas que escribe ``use_tool``
                state.used_tool_keys_json = _append(state.used_tool_keys_json, key)
    state.save(force_insert=state._state.adding)


def explore_what_the_case_asks(client, attempt):
    """Lo mismo, y devuelve el intento tal como lo ve el estudiante ahora (con las opciones que ya se ofrecen).

    ``attempt`` es el dict del intento (``attemptId``, ``attemptToken``) que devolvió empezar o leer el intento."""
    explore_what_the_case_asks_for(attempt["attemptId"])
    return client.get(
        f"/api/simulation/attempts/{attempt['attemptId']}", HTTP_X_SIEP_ATTEMPT_TOKEN=attempt["attemptToken"]
    ).data["data"]
