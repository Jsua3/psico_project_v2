"""S2-6b (segunda parte) · El fondo de una versión ya publicada, al servirla al estudiante.

Una versión publicada puede tener un fondo ajeno (guardado antes de la regla, o escrito directo en la base). Al servirla
al estudiante, el fondo que no es ruta propia ni host permitido no llega: el mundo sale sin fondo y queda UN
``security_event`` por servida (sin la URL). La traza del docente (``world_for_attempt``) no pasa por el filtro.
"""
import json
import logging

import pytest

from apps.simulation.models import SceneMap, SimulationAttempt
from apps.simulation.services import world_service
from shared import cache as shared_cache

from .test_world import attempt_headers, case_version_id, cl, estudiante  # noqa: F401  (fixtures)

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

BASE = "/api/simulation"
AJENO = "https://ajeno.example/x.png"
PROPIO = "/assets/world/bg.webp"


def _begin(client, case_version_id):
    data = client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    return data["attemptId"], data["attemptToken"]


def _poner_fondo(case_version_id, fondo):
    """Escribe el mapa directo en la base (sin la validación de guardado) y vacía la caché del mundo estático."""
    shared_cache.clear()
    SceneMap.objects.filter(case_version_id=case_version_id).update(
        ambient_json=json.dumps({"cameraZoom": 1.5, "backgroundImage": fondo})
    )


def _eventos_de_fondo(caplog):
    return [
        r for r in caplog.records
        if r.name == "siep.security" and r.getMessage() == "security_event"
        and getattr(r, "fields", {}).get("event") == "world_asset_blocked"
    ]


def test_fondo_ajeno_de_una_version_publicada_no_llega_al_estudiante(estudiante, case_version_id, caplog):
    _poner_fondo(case_version_id, AJENO)
    c = cl(estudiante)
    attempt_id, token = _begin(c, case_version_id)
    caplog.set_level(logging.INFO, logger="siep.security")
    caplog.clear()

    resp = c.get(f"{BASE}/attempts/{attempt_id}/world", **attempt_headers(token))

    assert resp.status_code == 200, resp.data
    ambient = resp.data["data"]["map"]["ambient"]
    assert "backgroundImage" not in ambient
    assert ambient.get("cameraZoom") == 1.5
    eventos = _eventos_de_fondo(caplog)
    assert len(eventos) == 1
    assert eventos[0].fields == {"event": "world_asset_blocked", "scope": "background"}
    assert all(AJENO not in str(r.__dict__) for r in caplog.records)


def test_fondo_propio_de_una_version_publicada_se_conserva_sin_evento(estudiante, case_version_id, caplog):
    _poner_fondo(case_version_id, PROPIO)
    c = cl(estudiante)
    attempt_id, token = _begin(c, case_version_id)
    caplog.set_level(logging.INFO, logger="siep.security")
    caplog.clear()

    resp = c.get(f"{BASE}/attempts/{attempt_id}/world", **attempt_headers(token))

    assert resp.status_code == 200, resp.data
    assert resp.data["data"]["map"]["ambient"]["backgroundImage"] == PROPIO
    assert _eventos_de_fondo(caplog) == []


def test_cada_servida_registra_su_propio_evento(estudiante, case_version_id, caplog):
    _poner_fondo(case_version_id, AJENO)
    c = cl(estudiante)
    attempt_id, token = _begin(c, case_version_id)
    caplog.set_level(logging.INFO, logger="siep.security")
    caplog.clear()

    c.get(f"{BASE}/attempts/{attempt_id}/world", **attempt_headers(token))
    c.get(f"{BASE}/attempts/{attempt_id}/world", **attempt_headers(token))

    assert len(_eventos_de_fondo(caplog)) == 2


def test_la_traza_del_docente_conserva_el_fondo_tal_cual(estudiante, case_version_id, caplog):
    _poner_fondo(case_version_id, AJENO)
    c = cl(estudiante)
    attempt_id, _ = _begin(c, case_version_id)
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    caplog.set_level(logging.INFO, logger="siep.security")
    caplog.clear()

    mundo = world_service.world_for_attempt(attempt)

    assert mundo["map"]["ambient"]["backgroundImage"] == AJENO
    assert _eventos_de_fondo(caplog) == []
