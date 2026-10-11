"""Una decisión solo une nodos de su propia versión (RN-02).

RN-02: «Cada opción de una decisión debe llevar a otra escena válida del caso». El editor
buscaba el nodo origen y el destino por clave primaria sin comprobar su versión: una
decisión del borrador podía salir de, o llegar a, un nodo de otra versión (p. ej. la
publicada) y dejaba el grafo del borrador apuntando fuera del caso.
"""
from .test_authoring_operations_contract import (  # noqa: F401
    BASE, _decision_body, _editor, _new_node, admin, api, draft, published_cv,
)


def _nodo_de_otra_version(api, published_cv):
    return _editor(api, published_cv)["nodes"][0]["id"]


def test_una_decision_no_puede_llevar_a_un_nodo_de_otra_version(api, draft, published_cv):
    propio = _new_node(api, draft, "propio")
    ajeno = _nodo_de_otra_version(api, published_cv)

    resp = api.post(f"{BASE}/{draft}/decisions", _decision_body(propio["id"], ajeno), format="json")

    assert resp.status_code == 400
    assert resp.data["message"] == f"El nodo {ajeno} no pertenece a la versión {draft}"


def test_una_decision_no_puede_salir_de_un_nodo_de_otra_version(api, draft, published_cv):
    propio = _new_node(api, draft, "propio")
    ajeno = _nodo_de_otra_version(api, published_cv)

    resp = api.post(f"{BASE}/{draft}/decisions", _decision_body(ajeno, propio["id"]), format="json")

    assert resp.status_code == 400
    assert resp.data["message"] == f"El nodo {ajeno} no pertenece a la versión {draft}"


def test_actualizar_una_decision_tampoco_puede_cruzar_versiones(api, draft, published_cv):
    a, b = _new_node(api, draft, "dec-a"), _new_node(api, draft, "dec-b")
    created = api.post(f"{BASE}/{draft}/decisions", _decision_body(a["id"], b["id"]), format="json")
    edge = next(d for d in created.data["data"]["decisions"] if d["optionKey"] == "opt-p05b")
    ajeno = _nodo_de_otra_version(api, published_cv)

    resp = api.put(
        f"{BASE}/{draft}/decisions/{edge['id']}", _decision_body(a["id"], ajeno), format="json"
    )

    assert resp.status_code == 400
    assert resp.data["message"] == f"El nodo {ajeno} no pertenece a la versión {draft}"


def test_una_decision_entre_nodos_de_la_misma_version_se_crea(api, draft):
    a, b = _new_node(api, draft, "misma-a"), _new_node(api, draft, "misma-b")

    resp = api.post(f"{BASE}/{draft}/decisions", _decision_body(a["id"], b["id"]), format="json")

    assert resp.status_code == 200
    assert any(d["sourceKey"] == "misma-a" and d["targetKey"] == "misma-b" for d in resp.data["data"]["decisions"])
