"""Mapa de progreso: `label` es el título completo del nodo.

Recortar el título es asunto de la vista (la lista «Trazabilidad» de la bitácora hace salto de línea).
Un recorte en la API es irreversible para todos los clientes y, en el caso demo, deja dos nodos distintos
(«Consultorio: protección y marco» y «Consultorio: acción técnica y ética») con la misma etiqueta «Consultorio: …».
"""
from types import SimpleNamespace

from apps.simulation.models import SimulationNode
from apps.simulation.serializers import game_dtos

from .test_game import assign_case_to_student, attempt_headers, case_version_id, cl, estudiante  # noqa: F401


def _node(title):
    return SimpleNamespace(title=title, node_key="nodo-x", start_node=False, terminal_node=False)


def test_progress_map_node_keeps_the_full_title():
    dto = game_dtos.progress_map_node(_node("Consultorio: acción técnica y ética"))

    assert dto["label"] == "Consultorio: acción técnica y ética"


def test_progress_map_node_trims_surrounding_whitespace_only():
    dto = game_dtos.progress_map_node(_node("  Cierre del caso \n"))

    assert dto["label"] == "Cierre del caso"


def test_progress_map_node_falls_back_when_the_title_is_blank():
    for blank in ("", "   ", None):
        assert game_dtos.progress_map_node(_node(blank))["label"] == "Nodo", repr(blank)


def test_progress_map_endpoint_labels_every_node_with_its_full_title(estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "SIM-PMAP")
    c = cl(estudiante)
    attempt = c.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id, "forceNew": True}, format="json"
    ).data["data"]

    resp = c.get(
        f"/api/simulation/attempts/{attempt['attemptId']}/progress-map",
        **attempt_headers(attempt["attemptToken"]),
    )

    assert resp.status_code == 200
    labels = {n["key"]: n["label"] for n in resp.data["data"]["nodes"]}
    expected = {
        n.node_key: n.title.strip()
        for n in SimulationNode.objects.filter(case_version_id=case_version_id)
    }
    assert labels == expected
    assert len(set(labels.values())) == len(labels), "dos nodos distintos no pueden compartir etiqueta"
    assert labels["comisaria-consultorio"] == "Consultorio: protección y marco"
    assert labels["comisaria-accion-final"] == "Consultorio: acción técnica y ética"
