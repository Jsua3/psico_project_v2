"""S2-6b · Tope del texto de la bitácora reflexiva (SF-22: ``ReflectionRequest.text`` no tenía tope).

El cliente no pone tope a la bitácora (``journal-panel.component.ts`` no declara ``maxlength``), así que el tope
del servidor es el que propone la tarea: 5000 caracteres. Un texto de más es un 400 con el campo ``text``.
"""
import pytest

from .test_world import case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

BASE = "/api/simulation"
TOPE_BITACORA = 5000


def _begin(client, case_version_id):
    data = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    return data["attemptId"], data["attemptToken"], data["currentNode"]


def test_bitacora_de_un_caracter_mas_del_tope_da_400_con_el_campo(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    body = {"attemptToken": token, "nodeId": node["id"], "text": "a" * (TOPE_BITACORA + 1)}

    resp = c.post(f"{BASE}/attempts/{attempt_id}/reflections", body, format="json")

    assert resp.status_code == 400, resp.data
    assert resp.data["field"] == "text"


def test_bitacora_de_exactamente_el_tope_se_guarda(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token, node = _begin(c, case_version_id)
    body = {"attemptToken": token, "nodeId": node["id"], "text": "a" * TOPE_BITACORA}

    resp = c.post(f"{BASE}/attempts/{attempt_id}/reflections", body, format="json")

    assert resp.status_code == 200, resp.data
