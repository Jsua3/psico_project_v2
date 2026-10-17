"""E5-10 · Cierre del plan estructural: contrato estricto combinado y registro de banderas (§2.8, §8).

Verifica:
1. Que ``settings.CONTRACT_FLAGS_REGISTRY`` registra todas las banderas de transición
   (``expand → migrate → contract``) con su estado final ``target_contract`` y su hito de retiro.
2. Que al encender simultáneamente todas las banderas estrictas (``ATTEMPT_START_STRICT=True``,
   ``FEEDBACK_AT_CLOSE_ONLY=True``, ``REVIEW_WORKFLOW_STRICT=True``, ``REVISION_REQUIRED=True``,
   ``RUBRIC_NUMERIC_TOTAL=False``, ``INVITATIONS_AUTO_ACCEPT=False``), el ciclo completo de
   autoría, publicación, intento y decisión respeta todas las invariantes sin interferencia.
"""
from __future__ import annotations

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion
from apps.users.models import CustomUser

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-07")]


def _auth_client(email: str) -> APIClient:
    user = CustomUser.objects.get(email=email)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_contract_flags_registry_covers_all_transition_flags():
    registry = getattr(settings, "CONTRACT_FLAGS_REGISTRY", {})
    expected_flags = {
        "ATTEMPT_START_STRICT": True,
        "FEEDBACK_AT_CLOSE_ONLY": True,
        "RUBRIC_NUMERIC_TOTAL": False,
        "REVIEW_WORKFLOW_STRICT": True,
        "REVISION_REQUIRED": True,
        "INVITATIONS_AUTO_ACCEPT": False,
    }
    assert set(registry.keys()) == set(expected_flags.keys())
    for flag_name, expected_target in expected_flags.items():
        entry = registry[flag_name]
        assert hasattr(settings, flag_name), f"Falta {flag_name} en settings"
        assert entry["target_contract"] is expected_target
        assert entry["env"].startswith("SIEP_")
        assert entry["retirement_gate"]


def test_all_strict_contract_flags_together_enforce_end_to_end_invariants(settings):
    for flag_name, meta in settings.CONTRACT_FLAGS_REGISTRY.items():
        setattr(settings, flag_name, meta["target_contract"])

    admin = _auth_client("admin@psychosim.edu.co")
    student = _auth_client("estudiante@psychosim.edu.co")

    # 1. Crear borrador de autoría y verificar REVISION_REQUIRED=True + REVIEW_WORKFLOW_STRICT=True
    created = admin.post(
        "/api/authoring/cases",
        {"title": "Caso cierre E5-10", "description": "Contexto de prueba para E5-10."},
        format="json",
    )
    assert created.status_code in (200, 201)
    draft_id = created.data["data"]["caseVersionId"]
    current_rev = created.data["data"]["revision"]

    missing_rev = admin.put(
        f"/api/authoring/cases/{draft_id}/brief",
        {"context": "Intento sin cabecera ni campo revision."},
        format="json",
    )
    assert missing_rev.status_code == 400
    assert missing_rev.data["code"] == "REVISION_REQUIRED"

    with_rev = admin.put(
        f"/api/authoring/cases/{draft_id}/brief",
        {"context": "Contexto actualizado con revision obligatoria.", "revision": current_rev},
        format="json",
    )
    assert with_rev.status_code == 200

    direct_publish = admin.post(
        f"/api/authoring/cases/{draft_id}/publish",
        {"revision": with_rev.data["data"]["revision"]},
        format="json",
    )
    assert direct_publish.status_code == 409
    assert direct_publish.data["code"] == "REVIEW_REQUIRED"

    # 2. Intento del estudiante con ATTEMPT_START_STRICT=True y FEEDBACK_AT_CLOSE_ONLY=True
    published_version = CaseVersion.objects.filter(status="PUBLISHED").order_by("id").first()
    assert published_version is not None

    started = student.post(
        "/api/simulation/attempts",
        {"caseVersionId": published_version.id},
        format="json",
    )
    assert started.status_code in (200, 201)
    attempt_data = started.data["data"]
    attempt_id = attempt_data["attemptId"]
    attempt_token = attempt_data["attemptToken"]

    forced = student.post(
        "/api/simulation/attempts",
        {"caseVersionId": published_version.id, "forceNew": True},
        format="json",
    )
    assert forced.status_code == 409
    assert forced.data["code"] == "ATTEMPT_ALREADY_OPEN"
    assert str(forced.data["existingAttemptId"]) == str(attempt_id)

    options = attempt_data.get("currentNode", {}).get("options", [])
    assert options, "El nodo inicial debe tener opciones de decisión"
    first_opt_id = options[0]["id"]

    decided = student.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {
            "attemptToken": attempt_token,
            "decisionOptionId": first_opt_id,
            "evidenceOverride": True,
        },
        format="json",
    )
    assert decided.status_code == 200
    decision_payload = decided.data["data"]
    assert "attempt" in decision_payload
    assert "consequence" in decision_payload
    assert "classification" not in decision_payload
    assert "feedbackMessage" not in decision_payload
