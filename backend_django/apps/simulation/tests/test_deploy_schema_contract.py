"""Contrato modelo ↔ esquema de despliegue (deploy/db_seed.sql).

Las tablas son ``managed = False`` y la BD de pruebas se siembra con
``bootstrap_dev_db``, que NO replica los CHECK de producción. Sin esta prueba,
un valor nuevo en un ``TextChoices`` (p. ej. ``PAUSED``) pasa todas las suites
y solo falla en producción al violar el CHECK del volcado restaurado.
"""
import re
from pathlib import Path

import pytest

from apps.simulation.models.attempt import AttemptStatus
from apps.simulation.models.case import CaseVersionStatus, DecisionClassification
from apps.users.models import UserRole

DB_SEED = Path(__file__).resolve().parents[4] / "deploy" / "db_seed.sql"


def _check_allowed_values(constraint_name: str) -> set[str]:
    sql = DB_SEED.read_text(encoding="utf-8")
    match = re.search(
        rf"CONSTRAINT {re.escape(constraint_name)} CHECK \((.+)\)\s*$",
        sql,
        re.MULTILINE,
    )
    assert match, f"No se encontró el CHECK {constraint_name} en {DB_SEED}"
    return set(re.findall(r"'([^']+)'::", match.group(1)))


@pytest.mark.parametrize(
    ("choices", "constraint_name"),
    [
        (AttemptStatus, "simulation_attempts_v2_status_check"),
        (CaseVersionStatus, "case_versions_status_check"),
        (DecisionClassification, "decision_options_classification_check"),
        (UserRole, "users_role_check"),
    ],
)
def test_deploy_check_admits_every_model_choice(choices, constraint_name):
    allowed = _check_allowed_values(constraint_name)

    missing = set(choices.values) - allowed

    assert not missing, (
        f"{constraint_name} en deploy/db_seed.sql rechazaría {sorted(missing)}; "
        "actualiza el volcado y deploy/upgrades/."
    )
