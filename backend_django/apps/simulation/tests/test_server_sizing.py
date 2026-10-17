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


@pytest.mark.req("RNF-06", "RNF-006")
def test_respaldo_restauracion_y_runbook_jornada_academica_presentes():
    script_path = REPO_ROOT / "scripts" / "ops" / "backup-restore.mjs"
    assert script_path.exists()
    script_text = script_path.read_text(encoding="utf-8")
    assert "pg_dump" in script_text
    assert "crypto_service.decrypt" in script_text

    runbook = (REPO_ROOT / "docs" / "operacion" / "despliegue-railway.md").read_text(encoding="utf-8")
    assert "Runbook de la jornada académica" in runbook
    assert "Lista de seguridad de PostgreSQL" in runbook

