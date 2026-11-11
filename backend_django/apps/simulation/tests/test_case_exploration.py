"""Guardia del ayudante ``case_exploration``: lo que deja explorado alcanza para que se ofrezcan todas las recomendadas."""
import json

import pytest

from apps.simulation.models import AttemptWorldState, DecisionOption, SimulationAttempt, SimulationNode
from apps.simulation.services import option_availability

from .case_exploration import explore_what_the_case_asks_for
from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)


def _nodes_with_recommended(case_version_id):
    return SimulationNode.objects.filter(
        case_version_id=case_version_id, options__response_class="RECOMMENDED"
    ).distinct()


def test_tras_el_ayudante_todas_las_recomendadas_de_cada_escena_se_ofrecen(estudiante, case_version_id):
    attempt_id, _ = _start(cl(estudiante), case_version_id)
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    nodes = list(_nodes_with_recommended(case_version_id))
    assert nodes
    # Sin explorar el caso sí retiene recomendadas (si no, el ayudante no haría falta y la guardia no diría nada).
    state = AttemptWorldState.objects.filter(attempt_id=attempt_id).first()
    withheld_before = [
        option.id for node in nodes
        for option in option_availability.split_options(attempt, node, world_state=state)[1]
        if option.response_class == "RECOMMENDED"
    ]
    assert withheld_before

    explore_what_the_case_asks_for(attempt_id)

    state = AttemptWorldState.objects.get(attempt_id=attempt_id)
    for node in nodes:
        offered = {o.id for o in option_availability.split_options(attempt, node, world_state=state)[0]}
        recommended = set(
            DecisionOption.objects.filter(source_node_id=node.id, response_class="RECOMMENDED").values_list("id", flat=True)
        )
        assert recommended <= offered, f"la escena {node.node_key} retiene recomendadas: {recommended - offered}"


def test_el_ayudante_suma_a_lo_que_ya_habia_y_registra_por_sala(estudiante, case_version_id):
    attempt_id, _ = _start(cl(estudiante), case_version_id)
    explore_what_the_case_asks_for(attempt_id)
    state = AttemptWorldState.objects.get(attempt_id=attempt_id)
    state.inventory_json = json.dumps(["OTRA", *json.loads(state.inventory_json)])
    state.save()

    explore_what_the_case_asks_for(attempt_id)  # idempotente: no duplica ni borra lo previo

    state = AttemptWorldState.objects.get(attempt_id=attempt_id)
    inventory = json.loads(state.inventory_json)
    assert inventory.count("SPIKES") == 1 and "OTRA" in inventory
    flags = json.loads(state.flags_json)
    assert "enfermera-urgencias" in flags["viewedNpcKeys"]
    by_sala = flags[option_availability.EXPLORED_KEY]
    assert any("enfermera-urgencias" in entry.get("talked", []) for entry in by_sala.values())


def test_un_requisito_que_el_ayudante_no_sabe_satisfacer_falla_con_un_mensaje_claro(estudiante, case_version_id):
    attempt_id, _ = _start(cl(estudiante), case_version_id)
    option = DecisionOption.objects.filter(case_version_id=case_version_id, response_class="RECOMMENDED").first()
    DecisionOption.objects.filter(pk=option.pk).update(requires_json=json.dumps({"milestone": "algo"}))

    with pytest.raises(AssertionError, match="no sabe satisfacer"):
        explore_what_the_case_asks_for(attempt_id)
