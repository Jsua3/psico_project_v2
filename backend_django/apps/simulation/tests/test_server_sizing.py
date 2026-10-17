"""E5-3 · Servicio dimensionado: gunicorn gthread y CONN_HEALTH_CHECKS (DJA-9, RNF-05)."""
from pathlib import Path

import pytest
from django.conf import settings

pytestmark = pytest.mark.req("RNF-05")

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_conn_health_checks_activo_en_configuracion_base():
    from psychosim.settings import base

    assert base.DATABASES["default"].get("CONN_HEALTH_CHECKS") is True


def test_dockerfile_arranca_gunicorn_con_gthread_y_hilos_dimensionados():
    dockerfile = (REPO_ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "--worker-class gthread" in dockerfile
    assert "--workers 3" in dockerfile
    assert "--threads 4" in dockerfile
