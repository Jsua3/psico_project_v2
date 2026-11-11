"""Ayudante compartido: deja en el mundo de un intento lo que piden los requisitos del caso sembrado.

SIM-VBG-001 2.1 retiene las opciones recomendadas de cuatro escenas hasta que el estudiante explore (hablar con
``enfermera-urgencias`` y usar ``PAP``; tener ``SPIKES``; haber usado ``RISK_METER``). Las pruebas que juegan el caso
de punta a punta para probar otra cosa (informe, encuesta, privacidad...) llaman a esto una vez tras empezar el intento.
"""
import json

from apps.simulation.models import SimulationAttempt
from apps.simulation.services import world_service


def explore_what_the_case_asks_for(attempt_id):
    """Escribe directo en el estado del mundo lo que dejaría un recorrido completo (sin registro por sala, así que
    valen las listas globales)."""
    # La lectura del mundo no lo guarda (E1-6): se resuelve el que tendría y se persiste con lo explorado.
    state, _ = world_service.resolve_world_state(SimulationAttempt.objects.get(pk=attempt_id))
    flags = json.loads(state.flags_json or "{}")
    flags["viewedNpcKeys"] = ["enfermera-urgencias"]
    state.flags_json = json.dumps(flags)
    state.inventory_json = json.dumps(["PAP", "SPIKES", "RISK_METER"])
    state.used_tool_keys_json = json.dumps(["PAP@familia-crisis", "RISK_METER@sobreviviente-consulta"])
    state.save(force_insert=state._state.adding)


def explore_what_the_case_asks(client, attempt):
    """Lo mismo, y devuelve el intento tal como lo ve el estudiante ahora (con las opciones que ya se ofrecen).

    ``attempt`` es el dict del intento (``attemptId``, ``attemptToken``) que devolvió empezar o leer el intento."""
    explore_what_the_case_asks_for(attempt["attemptId"])
    return client.get(
        f"/api/simulation/attempts/{attempt['attemptId']}", HTTP_X_SIEP_ATTEMPT_TOKEN=attempt["attemptToken"]
    ).data["data"]
