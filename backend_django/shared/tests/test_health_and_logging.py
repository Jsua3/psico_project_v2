import json
import logging
import re
import sys
from pathlib import Path

import pytest
from django.db import OperationalError
from django.test import Client

from shared.jsonlog import JsonFormatter

ROOT = Path(__file__).resolve().parents[3]  # raíz del repositorio

pytestmark = pytest.mark.req("RNF-06")


@pytest.mark.django_db
def test_health_responde_200_sin_autenticacion():
    response = Client().get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"status": "ok", "db": "ok"}}


def test_health_responde_503_sin_filtrar_el_error_de_la_bd(monkeypatch):
    def broken(*args, **kwargs):
        raise OperationalError("could not connect: host=db user=psychosim password=hunter2")

    monkeypatch.setattr("shared.health.connection.cursor", broken)

    response = Client().get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"success": False, "data": {"status": "degraded", "db": "error"}}
    assert "hunter2" not in response.content.decode()


@pytest.mark.django_db
def test_toda_respuesta_trae_x_request_id_generado():
    response = Client().get("/api/health")

    assert re.fullmatch(r"[0-9a-f]{32}", response["X-Request-Id"])


@pytest.mark.django_db
def test_un_x_request_id_valido_se_conserva_y_uno_invalido_se_reemplaza():
    kept = Client().get("/api/health", HTTP_X_REQUEST_ID="trace-abc12345")
    replaced = Client().get("/api/health", HTTP_X_REQUEST_ID="<script>alert(1)</script>")

    assert kept["X-Request-Id"] == "trace-abc12345"
    assert re.fullmatch(r"[0-9a-f]{32}", replaced["X-Request-Id"])


@pytest.mark.django_db
def test_el_log_de_request_es_json_con_duracion_y_sin_query_string(caplog):
    with caplog.at_level(logging.INFO, logger="siep.request"):
        response = Client().get("/api/health?token=secreto-que-no-debe-loguearse")

    record = next(r for r in caplog.records if r.name == "siep.request")
    line = json.loads(JsonFormatter().format(record))
    assert line["path"] == "/api/health"
    assert line["method"] == "GET"
    assert line["status"] == 200
    assert line["request_id"] == response["X-Request-Id"]
    assert isinstance(line["duration_ms"], (int, float)) and line["duration_ms"] >= 0
    assert "secreto" not in json.dumps(line)


def test_json_formatter_incluye_la_excepcion():
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.getLogger("siep.test").makeRecord(
            "siep.test", logging.ERROR, __file__, 1, "falló", (), sys.exc_info()
        )
    line = json.loads(JsonFormatter().format(record))
    assert line["level"] == "ERROR"
    assert "ValueError: boom" in line["exc"]


def test_gunicorn_registra_accesos_y_errores_en_stdout():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "--access-logfile -" in dockerfile
    assert "--error-logfile -" in dockerfile


def test_railway_usa_el_healthcheck_y_reinicia_siempre():
    deploy = json.loads((ROOT / "railway.json").read_text(encoding="utf-8"))["deploy"]
    assert deploy["healthcheckPath"] == "/api/health"
    assert deploy["restartPolicyType"] == "ALWAYS"
