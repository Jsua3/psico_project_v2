"""Pruebas de caracterización del orden del mapa de progreso (``get_progress_map``).

El mapa lista los nodos del caso recorriéndolos en anchura (BFS) desde el nodo
inicial, siguiendo las decisiones en orden de id; los nodos que no se alcanzan se
agregan al final por id. Estas pruebas fijan ese orden y los demás campos para
poder extraer el recorrido a un iterador propio (patrón Iterator) sin cambiar lo
que ve el estudiante. Complementan ``test_progress_map.py`` (etiquetas).
"""
from collections import deque

from apps.simulation.models import AttemptEvent, DecisionOption, SimulationAttempt, SimulationNode

from .test_game import assign_case_to_student, attempt_headers, case_version_id, cl, estudiante  # noqa: F401


def _start(estudiante, case_version_id, codigo):
    assign_case_to_student(estudiante, case_version_id, codigo)
    c = cl(estudiante)
    attempt = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json"
    ).data["data"]
    return c, attempt


def _progress(c, attempt):
    resp = c.get(
        f"/api/simulation/attempts/{attempt['attemptId']}/progress-map",
        **attempt_headers(attempt["attemptToken"]),
    )
    assert resp.status_code == 200
    return resp.data["data"]


def _keys(data):
    return [n["key"] for n in data["nodes"]]


def _oracle(case_version_id):
    """Recorrido en anchura calculado aparte, a propósito con otra estructura (deque)."""
    nodes = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id"))
    start = next((n for n in nodes if n.start_node), nodes[0])
    edges = {}
    for d in DecisionOption.objects.filter(case_version_id=case_version_id).order_by("id"):
        edges.setdefault(d.source_node_id, []).append(d.target_node_id)
    by_id = {n.id: n for n in nodes}
    order, seen, queue = [], {start.id}, deque([start.id])
    while queue:
        cur = queue.popleft()
        order.append(by_id[cur].node_key)
        for nxt in edges.get(cur, []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    order += [n.node_key for n in nodes if n.id not in seen]
    return order


def _node(case_version_id, key):
    return SimulationNode.objects.create(
        case_version_id=case_version_id, node_key=key, title=f"Título {key}", narrative="n"
    )


def test_el_orden_es_bfs_desde_el_nodo_inicial(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-BFS")

    data = _progress(c, attempt)

    start = SimulationNode.objects.get(case_version_id=case_version_id, start_node=True)
    assert _keys(data)[0] == start.node_key
    assert _keys(data) == _oracle(case_version_id)
    assert len(set(_keys(data))) == len(_keys(data)) == SimulationNode.objects.filter(
        case_version_id=case_version_id
    ).count()


def test_cada_nodo_trae_sus_banderas_de_inicio_y_final(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-FLAGS")

    nodes = _progress(c, attempt)["nodes"]

    assert all(set(n) == {"key", "label", "start", "terminal"} for n in nodes)
    by_key = {n.node_key: n for n in SimulationNode.objects.filter(case_version_id=case_version_id)}
    for n in nodes:
        assert n["start"] is by_key[n["key"]].start_node
        assert n["terminal"] is by_key[n["key"]].terminal_node


def test_los_nodos_inalcanzables_van_al_final_en_orden_de_id(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-UNREACH")
    alcanzables = _oracle(case_version_id)
    huerfano_1 = _node(case_version_id, "huerfano-1")
    huerfano_2 = _node(case_version_id, "huerfano-2")
    # huerfano-2 solo se alcanza desde huerfano-1, que a su vez no se alcanza desde el inicio:
    # el recorrido no entra por ahí, así que ambos quedan en el bloque final, por id.
    DecisionOption.objects.create(
        case_version_id=case_version_id, option_key="PM-H1-H2", source_node=huerfano_1,
        target_node=huerfano_2, text="t", classification="ADEQUATE",
    )

    keys = _keys(_progress(c, attempt))

    assert keys[:len(alcanzables)] == alcanzables
    assert keys[len(alcanzables):] == ["huerfano-1", "huerfano-2"]


def test_un_ciclo_no_repite_nodos_ni_cuelga_el_recorrido(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-CICLO")
    start = SimulationNode.objects.get(case_version_id=case_version_id, start_node=True)
    ultimo = SimulationNode.objects.filter(case_version_id=case_version_id).exclude(pk=start.pk).last()
    DecisionOption.objects.create(
        case_version_id=case_version_id, option_key="PM-VUELTA", source_node=ultimo,
        target_node=start, text="t", classification="ADEQUATE",
    )

    keys = _keys(_progress(c, attempt))

    assert keys == _oracle(case_version_id)
    assert len(set(keys)) == len(keys)


def test_una_rama_nueva_se_visita_por_niveles_no_en_profundidad(estudiante, case_version_id):
    """Dos hijos del inicio salen antes que los nietos (anchura, no profundidad)."""
    c, attempt = _start(estudiante, case_version_id, "PM-NIVELES")
    start = SimulationNode.objects.get(case_version_id=case_version_id, start_node=True)
    hijo_a, hijo_b, nieto = (_node(case_version_id, k) for k in ("nivel-a", "nivel-b", "nivel-nieto"))
    for key, source, target in (("PM-A", start, hijo_a), ("PM-B", start, hijo_b), ("PM-N", hijo_a, nieto)):
        DecisionOption.objects.create(
            case_version_id=case_version_id, option_key=key, source_node=source, target_node=target,
            text="t", classification="ADEQUATE",
        )

    keys = _keys(_progress(c, attempt))

    assert keys.index("nivel-a") < keys.index("nivel-b") < keys.index("nivel-nieto")


def test_sin_nodo_inicial_marcado_se_empieza_por_el_primer_nodo(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-SINSTART")
    primero = SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id").first()
    SimulationNode.objects.filter(case_version_id=case_version_id).update(start_node=False)

    keys = _keys(_progress(c, attempt))

    assert keys[0] == primero.node_key
    assert keys == _oracle(case_version_id)


def test_nodos_visitados_sin_repetir_en_orden_de_llegada_y_nodo_actual(estudiante, case_version_id):
    c, attempt = _start(estudiante, case_version_id, "PM-VISITADOS")
    row = SimulationAttempt.objects.get(pk=attempt["attemptId"])
    nodos = list(SimulationNode.objects.filter(case_version_id=case_version_id).order_by("id")[:3])
    AttemptEvent.objects.filter(attempt=row, event_type="NODE_ENTERED").delete()
    for node in (nodos[2], nodos[0], nodos[2], nodos[1], nodos[0]):
        AttemptEvent.objects.create(attempt=row, event_type="NODE_ENTERED", node=node)
    AttemptEvent.objects.create(attempt=row, event_type="ROOM_ENTERED", node=SimulationNode.objects.last())

    data = _progress(c, attempt)

    assert data["visitedNodeKeys"] == [nodos[2].node_key, nodos[0].node_key, nodos[1].node_key]
    assert data["currentNodeKey"] == row.current_node.node_key
    assert set(data) == {"nodes", "visitedNodeKeys", "currentNodeKey"}
