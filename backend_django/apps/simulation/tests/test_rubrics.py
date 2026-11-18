import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, Rubric, SimulationCase, SimulationRubricAssignment
from apps.simulation.services.rubric_service import rubric_for_case_version, seed_default_rubric

User = get_user_model()


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_rubric@x.com", password="x", nombre="A", apellido="R", role="ADMIN"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_rubric@x.com", password="x", nombre="P", apellido="R", role="PROFESOR"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_rubric@x.com", password="x", nombre="E", apellido="R", role="ESTUDIANTE"
    )


def _rubric_payload(name="Rubrica prueba"):
    return {
        "name": name,
        "description": "Descripcion",
        "version": "1.0",
        "active": False,
        "criteria": [
            {"title": "Uno", "description": "A", "weight": 50, "displayOrder": 1, "active": True},
            {"title": "Dos", "description": "B", "weight": 50, "displayOrder": 2, "active": True},
        ],
    }


def test_student_cannot_manage_rubrics(estudiante):
    assert cl(estudiante).get("/api/rubrics/").status_code == 403


def test_create_edit_activate_and_default_rubric(admin):
    client = cl(admin)
    created = client.post("/api/rubrics/", _rubric_payload(), format="json")
    assert created.status_code == 201
    rubric_id = created.data["data"]["id"]

    edited = client.put(
        f"/api/rubrics/{rubric_id}",
        {**_rubric_payload("Rubrica editada"), "active": True},
        format="json",
    )
    assert edited.status_code == 200
    assert edited.data["data"]["totalWeight"] == 100.0

    default = client.post(f"/api/rubrics/{rubric_id}/default", {}, format="json")
    assert default.status_code == 200
    assert default.data["data"]["isDefault"] is True
    assert Rubric.objects.filter(is_default=True, active=True).count() == 1


def test_activate_rejects_weights_that_do_not_sum_100(admin):
    payload = _rubric_payload("Rubrica incompleta")
    payload["criteria"][0]["weight"] = 30
    resp = cl(admin).post("/api/rubrics/", payload, format="json")
    assert resp.status_code == 201
    rubric_id = resp.data["data"]["id"]

    activated = cl(admin).post(f"/api/rubrics/{rubric_id}/activate", {}, format="json")
    assert activated.status_code == 400
    assert "100" in activated.data["message"]


def test_seed_default_rubric_is_idempotent_and_assigns_published_case(admin):
    # Una versión publicada sin rúbrica propia recibe la de la plataforma.
    sin_rubrica = CaseVersion.objects.create(
        simulation_case=SimulationCase.objects.create(code="RUB-SIN", title="Sin rúbrica", created_by=admin),
        semantic_version="1.0.0", status="PUBLISHED", created_by=admin,
    )
    first = seed_default_rubric(admin)
    second = seed_default_rubric(admin)
    assert first["id"] == second["id"]
    assert second["name"] == "Rúbrica básica de desempeño SIEP"
    assert second["totalWeight"] == 100.0
    assert SimulationRubricAssignment.objects.filter(case_version=sin_rubrica, rubric_id=second["id"], active=True).exists()


def test_seed_no_tapa_la_rubrica_propia_de_un_caso_publicado(admin):
    # SIM-VBG-001 trae su rúbrica (CONTENCION, MARCO_NORMATIVO, INTERVENCION_ETICA, REFLEXION), que es la que declaran sus
    # respuestas: la siembra no le asigna la de la plataforma y el caso se evalúa con la suya.
    case_version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    propia = Rubric.objects.filter(case_version=case_version, active=True).order_by("id").first()
    assert propia is not None
    basica = seed_default_rubric(admin)
    assert not SimulationRubricAssignment.objects.filter(case_version=case_version, rubric_id=basica["id"], active=True).exists()
    assert rubric_for_case_version(case_version.id).id == propia.id


def test_una_asignacion_vieja_a_la_rubrica_por_defecto_no_tapa_la_propia(admin):
    # Las bases sembradas antes del arreglo ya tienen esa asignación: la rúbrica propia sigue mandando sin reimportar.
    case_version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    propia = Rubric.objects.filter(case_version=case_version, active=True).order_by("id").first()
    basica = Rubric.objects.get(pk=seed_default_rubric(admin)["id"])
    SimulationRubricAssignment.objects.create(case_version=case_version, rubric=basica, assigned_by=admin)
    assert rubric_for_case_version(case_version.id).id == propia.id
    # Una asignación a otra rúbrica (no la por defecto) sí manda.
    otra = Rubric.objects.create(name="Otra", active=True, version="1.0", created_by=admin)
    SimulationRubricAssignment.objects.filter(case_version=case_version).update(active=False)
    SimulationRubricAssignment.objects.create(case_version=case_version, rubric=otra, assigned_by=admin)
    assert rubric_for_case_version(case_version.id).id == otra.id


def test_assign_rubric_to_case_version(profesor):
    rubric = cl(profesor).post("/api/rubrics/", _rubric_payload("Rubrica asignable"), format="json").data["data"]
    cl(profesor).post(f"/api/rubrics/{rubric['id']}/activate", {}, format="json")
    # Asignar una rúbrica exige ser dueño del caso (E2-2, D-17): se asigna a uno propio.
    case = SimulationCase.objects.create(code="RUB-OWN", title="Caso propio", created_by=profesor)
    case_version = CaseVersion.objects.create(
        simulation_case=case, semantic_version="0.1.0", status="DRAFT", created_by=profesor
    )

    resp = cl(profesor).put(
        f"/api/rubrics/case-versions/{case_version.id}",
        {"rubricId": rubric["id"]},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["data"]["caseVersionId"] == case_version.id
    assert resp.data["data"]["rubric"]["id"] == rubric["id"]
