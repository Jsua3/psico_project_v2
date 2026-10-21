"""E2-7 · La lista de publicación gana el ítem de alcance y guarda qué casillas se marcaron
(RN-01, RQ-NEG-008).

Siete ítems: los seis de siempre más ``scopeEducational`` («el caso declara su alcance
educativo»; el texto es un borrador hasta que Psicología lo valide, decisión 17). Con
``REVIEW_WORKFLOW_STRICT`` apagada bastan los seis (el editor de hoy tiene seis casillas);
encendida, los siete son obligatorios. La «revisión de contenido por Psicología» es un ítem
**derivado**: se cumple con la constancia del ADMIN, no con una casilla del autor.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import (
    CaseReview,
    CaseVersion,
    PublicationChecklist,
    PublicationChecklistItem,
    SimulationCase,
)
from apps.simulation.services.authoring import publication

from .publication_support import give_support_resource

pytestmark = [pytest.mark.req("RN-01"), pytest.mark.req("RQ-NEG-008")]

User = get_user_model()
BASE = "/api/authoring/cases"
SIX = ("contentOriginal", "ethicsReviewed", "safetyProtocols", "noStigmatizing", "triggerWarnings", "accessibilityOk")
SEVEN = (*SIX, "scopeEducational")


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="chk_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        email="chk_owner@x.com", password="pass1234", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


_n = {"i": 0}


@pytest.fixture
def cv(owner):
    """Un borrador válido (copia del sembrado) del profesor, con la lista en 0 % y un recurso de apoyo (S3-3)."""
    _n["i"] += 1
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    version_id = publication.clone_version(seeded.id, owner)["caseVersionId"]
    case = SimulationCase.objects.create(code=f"CHK-{_n['i']}", title="Caso de la lista", created_by=owner)
    CaseVersion.objects.filter(pk=version_id).update(simulation_case=case, semantic_version="0.1.0")
    give_support_resource(version_id)  # el sembrado no trae ninguno y «protocolos de seguridad» se marca en esta lista
    return version_id


def _put(client, cv, codes, **extra):
    body = {code: True for code in codes}
    body.update(extra)
    response = client.put(f"{BASE}/{cv}/checklist", body, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


def _items(data):
    return {item["code"]: item for item in data["checklist"]["items"]}


def test_seven_items_are_listed_with_their_text_and_the_scope_item_is_a_draft(owner, cv):
    data = cl(owner).get(f"{BASE}/{cv}/editor").data["data"]

    items = _items(data)
    assert list(items) == list(SEVEN)
    assert items["scopeEducational"]["draft"] is True
    assert all(items[code]["draft"] is False for code in SIX)
    assert all(item["label"] for item in items.values())
    assert data["checklist"]["strict"] is False
    assert data["checklist"]["contentReview"] == {"fulfilled": False}


def test_without_the_flag_six_items_are_enough_and_the_seventh_is_recorded(owner, cv, settings):
    settings.REVIEW_WORKFLOW_STRICT = False

    data = _put(cl(owner), cv, SIX)

    assert data["checklistCompletion"] == 100
    assert data["publishable"] is True
    items = _items(data)
    assert items["scopeEducational"] == {**items["scopeEducational"], "required": False, "fulfilled": False}
    assert all(items[code]["required"] and items[code]["fulfilled"] for code in SIX)


def test_the_scope_item_counts_when_marked_but_is_not_required_without_the_flag(owner, cv, settings):
    settings.REVIEW_WORKFLOW_STRICT = False

    data = _put(cl(owner), cv, (*SIX[:5], "scopeEducational"))

    assert data["checklistCompletion"] == 83  # 5 de los 6 obligatorios
    assert _items(data)["scopeEducational"]["fulfilled"] is True


def test_with_the_flag_all_seven_are_required(owner, cv, settings):
    settings.REVIEW_WORKFLOW_STRICT = True

    six = _put(cl(owner), cv, SIX)
    seven = _put(cl(owner), cv, SEVEN)

    assert six["checklistCompletion"] == 86
    assert six["publishable"] is False
    assert _items(six)["scopeEducational"]["required"] is True
    assert seven["checklistCompletion"] == 100
    assert seven["publishable"] is True


def test_each_marked_box_is_stored_as_an_item(owner, cv):
    _put(cl(owner), cv, ("contentOriginal", "safetyProtocols"))

    latest = PublicationChecklist.objects.filter(case_version_id=cv).order_by("-id").first()
    stored = {item.code: item.fulfilled for item in PublicationChecklistItem.objects.filter(checklist=latest)}
    assert stored == {code: code in ("contentOriginal", "safetyProtocols") for code in SEVEN}


def test_the_latest_list_wins_and_history_is_kept(owner, cv):
    _put(cl(owner), cv, SIX)
    data = _put(cl(owner), cv, ("contentOriginal",))

    assert data["checklistCompletion"] == 17
    assert PublicationChecklist.objects.filter(case_version_id=cv).count() >= 3  # la inicial + dos


def test_the_author_cannot_tick_the_psychology_review(owner, cv):
    data = _put(cl(owner), cv, SIX, contentReview=True, contentReviewByPsychology=True)

    assert data["checklist"]["contentReview"] == {"fulfilled": False}
    assert "contentReview" not in _items(data)


def test_the_content_review_item_is_fulfilled_by_the_certificate(owner, admin, cv):
    _put(cl(owner), cv, SEVEN)
    cl(owner).post(f"{BASE}/{cv}/lifecycle", {"action": "submit"}, format="json")

    response = cl(admin).post(
        f"{BASE}/{cv}/lifecycle",
        {"action": "approve", "contentReview": {
            "reviewer": "Mg. Elena Rojas", "reviewedOn": "2026-10-10", "reference": "Acta 12-2026"}},
        format="json",
    )
    assert response.status_code == 200
    view = cl(admin).get(f"{BASE}/{cv}/editor").data["data"]

    assert view["checklist"]["contentReview"] == {
        "fulfilled": True, "reviewer": "Mg. Elena Rojas", "reviewedOn": "2026-10-10",
        "reference": "Acta 12-2026",
    }
    assert CaseReview.objects.get(case_version_id=cv).content_reference == "Acta 12-2026"


def test_a_list_saved_before_items_existed_keeps_its_ratio(owner, cv):
    """Las listas anteriores a E2-7 no tienen ítems: se conserva su porcentaje guardado."""
    PublicationChecklist.objects.filter(case_version_id=cv).delete()
    PublicationChecklist.objects.create(
        case_version_id=cv, submitted_by=owner, completion_ratio=100, status="COMPLETE"
    )

    data = cl(owner).get(f"{BASE}/{cv}/editor").data["data"]

    assert data["checklistCompletion"] == 100
    assert all(item["fulfilled"] is False for item in data["checklist"]["items"])


def test_a_six_item_list_does_not_satisfy_the_strict_mode(owner, cv, settings):
    settings.REVIEW_WORKFLOW_STRICT = False
    _put(cl(owner), cv, SIX)
    settings.REVIEW_WORKFLOW_STRICT = True

    data = cl(owner).get(f"{BASE}/{cv}/editor").data["data"]

    assert data["checklistCompletion"] == 86
    assert data["publishable"] is False


def test_a_legacy_checklist_without_items_cannot_reach_100_in_strict_mode(db, settings):
    """Una lista guardada antes de E2-7 (sin ítems, «100 %» de seis casillas) no cubre el séptimo
    ítem obligatorio del modo estricto: no puede quedar completa sin volver a marcarse."""
    from apps.simulation.models import CaseVersion, PublicationChecklist
    from apps.simulation.services.authoring.editor_view import latest_checklist_ratio

    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    PublicationChecklist.objects.filter(case_version_id=version.id).delete()
    PublicationChecklist.objects.create(
        case_version=version, submitted_by=version.created_by, completion_ratio=100, status="COMPLETE"
    )

    settings.REVIEW_WORKFLOW_STRICT = False
    relaxed = latest_checklist_ratio(version.id)
    settings.REVIEW_WORKFLOW_STRICT = True
    strict = latest_checklist_ratio(version.id)

    assert relaxed == 100
    assert 0 < strict < 100
