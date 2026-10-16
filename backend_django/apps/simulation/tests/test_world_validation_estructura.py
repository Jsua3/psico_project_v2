"""Reglas estructurales de la validación del mundo (RF-12, RN-02, RN-05).

Antes, la compuerta de publicación no detectaba lo que solo fallaba al jugar: un nodo que
no es final y no tiene opciones (el estudiante queda sin salida), un nodo sin mapa que no
se puede explorar y una decisión que une un nodo ajeno al caso. Un nodo al que no se llega
es solo una advertencia. Pruebas sobre la función pura: no tocan la base de datos.
"""
from apps.simulation.services import world_validation


def _snapshot(**cambios):
    base = {
        "nodes": [
            {"id": 1, "startNode": True, "terminalNode": False, "x": 0, "y": 0},
            {"id": 2, "startNode": False, "terminalNode": True, "x": 0, "y": 0},
        ],
        "decisions": [
            {"id": 10, "sourceNodeId": 1, "targetNodeId": 2, "prohibitedConduct": False, "prohibitionReason": None,
             "feedbackText": "Explicación de la decisión."},
        ],
        "maps": [
            {"id": 100, "nodeId": 1, "width": 960, "height": 540, "spawnX": 10, "spawnY": 10},
            {"id": 101, "nodeId": 2, "width": 960, "height": 540, "spawnX": 10, "spawnY": 10},
        ],
        "objects": [],
        "collisions": [],
        "dialogues": [],
        "hasSafeExit": True,
    }
    base.update(cambios)
    return base


def _nodo(id_, start=False, terminal=False):
    return {"id": id_, "startNode": start, "terminalNode": terminal, "x": 0, "y": 0}


def _decision(id_, source, target):
    return {
        "id": id_, "sourceNodeId": source, "targetNodeId": target, "prohibitedConduct": False,
        "prohibitionReason": None, "feedbackText": "Explicación de la decisión.",
    }


def _mapa(id_, node_id):
    return {"id": id_, "nodeId": node_id, "width": 960, "height": 540, "spawnX": 10, "spawnY": 10}


def _codigos(resultado, clave):
    return {i["code"] for i in resultado[clave]}


def test_un_caso_bien_formado_no_tiene_errores_ni_advertencias():
    resultado = world_validation.validate(_snapshot())

    assert resultado["canPublish"] is True
    assert resultado["errors"] == [] and resultado["warnings"] == []


def test_un_nodo_que_no_es_final_y_no_tiene_opciones_es_un_error():
    resultado = world_validation.validate(_snapshot(
        nodes=[_nodo(1, start=True), _nodo(2), _nodo(3, terminal=True)],
        decisions=[_decision(10, 1, 2), _decision(11, 1, 3)],
        maps=[_mapa(100, 1), _mapa(101, 2), _mapa(102, 3)],
    ))

    assert "NODE_WITHOUT_OPTIONS" in _codigos(resultado, "errors")
    assert resultado["canPublish"] is False
    error = next(i for i in resultado["errors"] if i["code"] == "NODE_WITHOUT_OPTIONS")
    assert error["entityRef"] == "node:2"


def test_un_nodo_inalcanzable_sin_opciones_es_solo_una_advertencia():
    """Un nodo huérfano (como `comisaria-recepcion` del caso sembrado) no deja a nadie sin salida."""
    resultado = world_validation.validate(_snapshot(
        nodes=[_nodo(1, start=True), _nodo(2, terminal=True), _nodo(3)],
        maps=[_mapa(100, 1), _mapa(101, 2), _mapa(102, 3)],
    ))

    assert "NODE_WITHOUT_OPTIONS" not in _codigos(resultado, "errors")
    assert "UNREACHABLE_NODE" in _codigos(resultado, "warnings")
    assert resultado["canPublish"] is True


def test_un_nodo_final_sin_opciones_es_correcto():
    resultado = world_validation.validate(_snapshot())

    assert "NODE_WITHOUT_OPTIONS" not in _codigos(resultado, "errors")


def test_un_nodo_que_no_es_final_y_no_tiene_mapa_es_un_error():
    resultado = world_validation.validate(_snapshot(maps=[_mapa(101, 2)]))

    error = next(i for i in resultado["errors"] if i["code"] == "NODE_WITHOUT_MAP")
    assert error["entityRef"] == "node:1"
    assert resultado["canPublish"] is False


def test_un_nodo_final_sin_mapa_no_es_un_error():
    resultado = world_validation.validate(_snapshot(maps=[_mapa(100, 1)]))

    assert "NODE_WITHOUT_MAP" not in _codigos(resultado, "errors")


def test_una_decision_hacia_un_nodo_que_no_es_del_caso_es_un_error():
    resultado = world_validation.validate(_snapshot(decisions=[_decision(10, 1, 2), _decision(11, 1, 999)]))

    error = next(i for i in resultado["errors"] if i["code"] == "DECISION_NODE_NOT_IN_CASE")
    assert error["entityRef"] == "decision:11"
    assert resultado["canPublish"] is False


def test_un_nodo_al_que_no_se_llega_es_solo_una_advertencia():
    resultado = world_validation.validate(_snapshot(
        nodes=[_nodo(1, start=True), _nodo(2, terminal=True), _nodo(3, terminal=True)],
        maps=[_mapa(100, 1), _mapa(101, 2), _mapa(102, 3)],
    ))

    assert "UNREACHABLE_NODE" in _codigos(resultado, "warnings")
    assert resultado["canPublish"] is True


def test_si_los_mapas_no_declaran_su_nodo_no_se_evalua_la_regla_de_mapa():
    """Compatibilidad: una instantánea antigua sin `nodeId` no debe marcar todos los nodos."""
    antiguos = [{k: v for k, v in m.items() if k != "nodeId"} for m in _snapshot()["maps"]]

    resultado = world_validation.validate(_snapshot(maps=antiguos))

    assert "NODE_WITHOUT_MAP" not in _codigos(resultado, "errors")
