"""Guardar un nodo no debe vaciar sus herramientas requeridas ni sus recursos de apoyo (D-4).

El formulario del editor de casos no edita `requiredTools` ni `supportResources`, pero las
enviaba siempre como listas vacías y el servidor las escribía sin condición: editar el título
de un nodo clonado borraba en silencio las herramientas que exige y los recursos de apoyo.
Una lista **presente** (aunque sea vacía) sigue significando «reemplazar»; una **ausente**
significa «no tocar».
"""
from .test_authoring_operations_contract import (  # noqa: F401
    BASE, _editor, _new_node, admin, api, draft, published_cv,
)


def _nodo_con_datos(api, draft):
    resp = api.post(
        f"{BASE}/{draft}/nodes",
        {"nodeKey": "con-datos", "title": "Con datos", "narrative": "N",
         "requiredTools": ["PAP"], "supportResources": ["Línea 106"]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    return next(n for n in resp.data["data"]["nodes"] if n["key"] == "con-datos")


def _actualizar(api, draft, node_id, cuerpo):
    resp = api.put(f"{BASE}/{draft}/nodes/{node_id}", cuerpo, format="json")
    assert resp.status_code == 200, resp.data
    return next(n for n in resp.data["data"]["nodes"] if n["id"] == node_id)


def test_actualizar_un_nodo_sin_listas_conserva_herramientas_y_apoyos(api, draft):
    node = _nodo_con_datos(api, draft)

    updated = _actualizar(api, draft, node["id"], {"nodeKey": "con-datos", "title": "Título nuevo", "narrative": "N"})

    assert updated["title"] == "Título nuevo"
    assert updated["requiredTools"] == ["PAP"]
    assert updated["supportResources"] == ["Línea 106"]


def test_actualizar_un_nodo_con_listas_las_reemplaza(api, draft):
    node = _nodo_con_datos(api, draft)

    updated = _actualizar(
        api, draft, node["id"],
        {"nodeKey": "con-datos", "title": "T", "narrative": "N", "requiredTools": ["OTRA"], "supportResources": ["Apoyo 2"]},
    )

    assert updated["requiredTools"] == ["OTRA"]
    assert updated["supportResources"] == ["Apoyo 2"]


def test_una_lista_vacia_explicita_vacia_las_herramientas_y_los_apoyos(api, draft):
    node = _nodo_con_datos(api, draft)

    updated = _actualizar(
        api, draft, node["id"],
        {"nodeKey": "con-datos", "title": "T", "narrative": "N", "requiredTools": [], "supportResources": []},
    )

    assert updated["requiredTools"] == []
    assert updated["supportResources"] == []


def test_crear_un_nodo_sin_listas_las_deja_vacias(api, draft):
    resp = api.post(f"{BASE}/{draft}/nodes", {"nodeKey": "sin-listas", "title": "T", "narrative": "N"}, format="json")

    assert resp.status_code == 200, resp.data
    created = next(n for n in resp.data["data"]["nodes"] if n["key"] == "sin-listas")
    assert created["requiredTools"] == []
    assert created["supportResources"] == []
