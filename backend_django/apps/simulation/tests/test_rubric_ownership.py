"""E2-2 · Las rúbricas tienen dueño (D-17, R12 del plan E2).

El profesor ve las suyas y las creadas por un ADMIN; edita solo las suyas; para
personalizar una global la **duplica**. ``set-default`` e ``isDefault`` son del ADMIN y
asignar una rúbrica a una versión exige ser dueño de su caso.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, Rubric, SimulationCase
from apps.simulation.services.rubric_service import seed_default_rubric

pytestmark = [pytest.mark.req("D-17"), pytest.mark.req("RNF-04")]

User = get_user_model()
BASE = "/api/rubrics"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def admin(db):
    return _user("rub_admin@x.com", "ADMIN")


@pytest.fixture
def prof_a(db):
    return _user("rub_a@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("rub_b@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("rub_e@x.com", "ESTUDIANTE")


@pytest.fixture
def global_default(admin):
    """La rúbrica global por defecto, creada por un ADMIN."""
    detail = seed_default_rubric(admin)
    return Rubric.objects.get(pk=detail["id"])


def _payload(name="Rúbrica propia", weights=(50, 50)):
    return {
        "name": name,
        "description": "d",
        "version": "1.0",
        "active": False,
        "criteria": [
            {"title": f"C{i}", "competency": f"C{i}", "weight": w, "displayOrder": i, "active": True}
            for i, w in enumerate(weights, start=1)
        ],
    }


def _create(user, name="Rúbrica propia"):
    response = cl(user).post(f"{BASE}/", _payload(name), format="json")
    assert response.status_code == 201, response.data
    return response.data["data"]["id"]


def test_a_professor_cannot_see_or_touch_another_professors_rubric(prof_a, prof_b):
    rubric_id = _create(prof_a)

    assert cl(prof_b).get(f"{BASE}/{rubric_id}").status_code == 404
    assert cl(prof_b).put(f"{BASE}/{rubric_id}", _payload("Mía ahora"), format="json").status_code == 404
    assert cl(prof_b).post(f"{BASE}/{rubric_id}/activate", {}, format="json").status_code == 404
    assert cl(prof_b).post(f"{BASE}/{rubric_id}/duplicate", {}, format="json").status_code == 404
    assert Rubric.objects.get(pk=rubric_id).name == "Rúbrica propia"


def test_the_owner_edits_activates_and_sees_it_listed(prof_a, prof_b):
    rubric_id = _create(prof_a)

    edited = cl(prof_a).put(f"{BASE}/{rubric_id}", _payload("Rúbrica renombrada"), format="json")
    activated = cl(prof_a).post(f"{BASE}/{rubric_id}/activate", {}, format="json")

    assert edited.status_code == 200 and edited.data["data"]["name"] == "Rúbrica renombrada"
    assert activated.status_code == 200
    mine = {r["id"] for r in cl(prof_a).get(f"{BASE}/").data["data"]}
    others = {r["id"] for r in cl(prof_b).get(f"{BASE}/").data["data"]}
    assert rubric_id in mine
    assert rubric_id not in others


def test_the_global_rubric_is_visible_but_read_only_for_a_professor(prof_a, global_default):
    url = f"{BASE}/{global_default.id}"

    assert cl(prof_a).get(url).status_code == 200
    assert global_default.id in {r["id"] for r in cl(prof_a).get(f"{BASE}/").data["data"]}
    assert cl(prof_a).put(url, _payload("Pisada"), format="json").status_code == 403
    assert cl(prof_a).post(f"{url}/deactivate", {}, format="json").status_code == 403
    assert cl(prof_a).post(f"{url}/default", {}, format="json").status_code == 403
    global_default.refresh_from_db()
    assert global_default.name != "Pisada" and global_default.is_default is True


def test_duplicating_the_global_gives_an_editable_own_copy(prof_a, global_default):
    copy = cl(prof_a).post(f"{BASE}/{global_default.id}/duplicate", {}, format="json")

    assert copy.status_code == 200
    copy_id = copy.data["data"]["id"]
    assert Rubric.objects.get(pk=copy_id).created_by_id == prof_a.id
    assert cl(prof_a).put(f"{BASE}/{copy_id}", _payload("Mi versión"), format="json").status_code == 200


def test_only_admin_sets_the_default(prof_a, admin):
    own = _create(prof_a)
    cl(prof_a).post(f"{BASE}/{own}/activate", {}, format="json")

    assert cl(prof_a).post(f"{BASE}/{own}/default", {}, format="json").status_code == 403
    flagged = {**_payload("Quiero ser global"), "isDefault": True}
    assert cl(prof_a).post(f"{BASE}/", flagged, format="json").status_code == 403
    assert cl(admin).post(f"{BASE}/{own}/default", {}, format="json").status_code == 200


def test_admin_edits_any_rubric(prof_a, admin):
    rubric_id = _create(prof_a)

    assert cl(admin).put(f"{BASE}/{rubric_id}", _payload("Corregida por ADMIN"), format="json").status_code == 200
    assert rubric_id in {r["id"] for r in cl(admin).get(f"{BASE}/").data["data"]}


def test_a_student_cannot_touch_rubrics(estudiante):
    assert cl(estudiante).get(f"{BASE}/").status_code == 403
    assert cl(estudiante).post(f"{BASE}/", _payload(), format="json").status_code == 403


def _owned_case_version(owner, code):
    case = SimulationCase.objects.create(code=code, title=f"Caso {code}", created_by=owner)
    return CaseVersion.objects.create(
        simulation_case=case, semantic_version="0.1.0", status="DRAFT", created_by=owner
    )


def test_assigning_a_rubric_requires_owning_the_case(prof_a, prof_b, admin):
    rubric_id = _create(prof_a)
    cl(prof_a).post(f"{BASE}/{rubric_id}/activate", {}, format="json")
    mine = _owned_case_version(prof_a, "RUB-A")
    theirs = _owned_case_version(prof_b, "RUB-B")
    foreign_published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")

    assert cl(prof_a).put(f"{BASE}/case-versions/{mine.id}", {"rubricId": rubric_id}, format="json").status_code == 200
    assert cl(prof_a).put(f"{BASE}/case-versions/{theirs.id}", {"rubricId": rubric_id}, format="json").status_code == 403
    assert cl(prof_a).put(
        f"{BASE}/case-versions/{foreign_published.id}", {"rubricId": rubric_id}, format="json"
    ).status_code == 403
    assert cl(admin).put(f"{BASE}/case-versions/{theirs.id}", {"rubricId": rubric_id}, format="json").status_code == 200


def test_a_professor_reads_the_rubric_of_a_case_version_only_if_it_is_visible_to_them(
    prof_a, prof_b, admin, global_default
):
    private = _create(prof_a)
    cl(prof_a).post(f"{BASE}/{private}/activate", {}, format="json")
    mine = _owned_case_version(prof_a, "RUB-READ-A")
    cl(prof_a).put(f"{BASE}/case-versions/{mine.id}", {"rubricId": private}, format="json")
    shared = _owned_case_version(admin, "RUB-READ-ADM")
    cl(admin).put(f"{BASE}/case-versions/{shared.id}", {"rubricId": global_default.id}, format="json")

    owner = cl(prof_a).get(f"{BASE}/case-versions/{mine.id}")
    boss = cl(admin).get(f"{BASE}/case-versions/{mine.id}")
    hidden = cl(prof_b).get(f"{BASE}/case-versions/{mine.id}")
    missing = cl(prof_b).get(f"{BASE}/case-versions/999999999")
    global_one = cl(prof_b).get(f"{BASE}/case-versions/{shared.id}")

    assert owner.status_code == 200 and owner.data["data"]["id"] == private
    assert boss.status_code == 200
    # Lo que otro docente no ve se comporta como lo que no existe: ni código ni texto lo delatan.
    assert hidden.status_code == missing.status_code == 404
    assert (hidden.data["code"], hidden.data["message"]) == (missing.data["code"], missing.data["message"])
    assert global_one.status_code == 200 and global_one.data["data"]["id"] == global_default.id


# ─── E3-0 · el DTO dice de quién es y si quien mira puede editarla (F7b-6) ─────────────────────────
def test_the_rubric_dto_says_who_owns_it_and_whether_the_viewer_can_edit_it(prof_a, prof_b, admin, global_default):
    own = _create(prof_a)

    as_owner = cl(prof_a).get(f"{BASE}/{own}").data["data"]
    as_admin = cl(admin).get(f"{BASE}/{own}").data["data"]
    global_for_a = cl(prof_a).get(f"{BASE}/{global_default.id}").data["data"]
    listed = {row["id"]: row for row in cl(prof_a).get(f"{BASE}/").data["data"]}

    assert (as_owner["ownerId"], as_owner["editable"]) == (prof_a.id, True)
    assert as_admin["editable"] is True
    assert (global_for_a["ownerId"], global_for_a["editable"]) == (admin.id, False)
    assert listed[own]["editable"] is True
    assert listed[global_default.id]["editable"] is False


def test_the_criteria_carry_no_score_range(prof_a):
    detail = cl(prof_a).get(f"{BASE}/{_create(prof_a)}").data["data"]

    assert detail["criteria"]
    for criterion in detail["criteria"]:
        assert not {"minScore", "maxScore", "step"} & set(criterion)


def test_a_read_only_rubric_says_why_with_its_own_code(prof_a, global_default):
    response = cl(prof_a).put(f"{BASE}/{global_default.id}", _payload("Pisada"), format="json")

    assert response.status_code == 403
    assert response.data["code"] == "RUBRIC_READ_ONLY"
    assert "solo lectura" in response.data["message"]


def test_only_the_admin_can_set_the_default_and_the_answer_says_so(prof_a):
    own = _create(prof_a)
    cl(prof_a).post(f"{BASE}/{own}/activate", {}, format="json")

    set_default = cl(prof_a).post(f"{BASE}/{own}/default", {}, format="json")
    flagged = cl(prof_a).post(f"{BASE}/", {**_payload("Quiero ser global"), "isDefault": True}, format="json")

    assert set_default.status_code == 403  # la puerta de rol de la ruta: no llega al servicio
    assert flagged.status_code == 403
    assert flagged.data["code"] == "RUBRIC_DEFAULT_ADMIN_ONLY"


def test_assigning_a_rubric_to_a_foreign_case_says_whose_it_is(prof_a, prof_b):
    own = _create(prof_a)
    cl(prof_a).post(f"{BASE}/{own}/activate", {}, format="json")
    theirs = _owned_case_version(prof_b, "RUB-E30-B")

    response = cl(prof_a).put(f"{BASE}/case-versions/{theirs.id}", {"rubricId": own}, format="json")

    assert response.status_code == 403
    assert response.data["code"] == "RUBRIC_CASE_NOT_OWNED"
