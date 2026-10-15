"""E3-9 · Catálogo de competencias (RQ-NEG-002, base de la analítica de E6).

Una competencia es un dato del programa (``competencies``): código estable, nombre y descripción.
Los criterios de las rúbricas apuntan a una con ``competencyId`` **sin perder** el texto libre
``competency`` que ya tenían (expand): el personal lee el catálogo y solo el ADMIN lo amplía.
"""
import importlib

import pytest
from django.apps import apps as live_apps
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, Competency, Rubric, RubricCriterion
from apps.simulation.services.rubric_service import seed_default_rubric
from shared import policies

pytestmark = [pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RF-02")]

User = get_user_model()
BASE = "/api/competencies"
RUBRICS = "/api/rubrics"


def cl(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def admin(db):
    return _user("cmp_admin@x.com", "ADMIN")


@pytest.fixture
def prof(db):
    return _user("cmp_prof@x.com", "PROFESOR")


@pytest.fixture
def student(db):
    return _user("cmp_student@x.com", "ESTUDIANTE")


def _create(admin, **extra):
    body = {"code": "trabajo en equipo", "name": "Trabajo en equipo", **extra}
    return cl(admin).post(BASE, body, format="json")


def _rubric_body(*criteria, name="Rúbrica con competencias"):
    weight = 100 // len(criteria)
    return {
        "name": name, "description": "d", "version": "1.0", "active": False,
        "criteria": [
            {"title": f"Criterio {i}", "weight": weight, "displayOrder": i, "active": True, **criterion}
            for i, criterion in enumerate(criteria, start=1)
        ],
    }


# ─── el catálogo ──────────────────────────────────────────────────────────────────────────────
def test_staff_read_the_catalog_and_students_and_anonymous_do_not(admin, prof, student):
    assert _create(admin).status_code == 201

    for user in (prof, admin):
        response = cl(user).get(BASE)
        assert response.status_code == 200, response.data
        rows = response.data["data"]
        assert any(row["code"] == "TRABAJO_EN_EQUIPO" for row in rows)
        assert set(rows[0]) == {"id", "code", "name", "description", "active", "sortOrder"}
    assert cl(student).get(BASE).status_code == 403
    assert cl().get(BASE).status_code == 401


def test_only_the_admin_adds_to_the_catalog(admin, prof, student):
    assert cl(prof).post(BASE, {"code": "X", "name": "X"}, format="json").status_code == 403
    assert cl(student).post(BASE, {"code": "X", "name": "X"}, format="json").status_code == 403
    assert cl().post(BASE, {"code": "X", "name": "X"}, format="json").status_code == 401
    assert _create(admin).status_code == 201


def test_the_code_is_normalized(admin):
    response = _create(admin, code="  Ética profesional / Dilemas  ")

    assert response.status_code == 201, response.data
    assert response.data["data"]["code"] == "ETICA_PROFESIONAL_DILEMAS"


def test_a_repeated_code_is_a_400_on_the_code(admin):
    assert _create(admin).status_code == 201

    again = _create(admin, code="TRABAJO-EN-EQUIPO", name="Otro nombre")

    assert again.status_code == 400
    assert again.data["field"] == "code"


@pytest.mark.parametrize(
    "body,field",
    [
        ({"code": "   ", "name": "Algo"}, "code"),
        ({"code": "***", "name": "Algo"}, "code"),
        ({"code": "ok", "name": ""}, "name"),
        ({"code": "ok", "name": "x" * 256}, "name"),
        ({"code": "ok", "name": "<b>negrita</b>"}, "name"),
        ({"code": "ok", "name": "Algo", "description": "https://ejemplo.com"}, "description"),
        ({"name": "Sin código"}, "code"),
    ],
)
def test_invalid_competency_fields_are_a_400_naming_the_field(admin, body, field):
    response = cl(admin).post(BASE, body, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == field


# ─── el enlace con los criterios ──────────────────────────────────────────────────────────────
def test_a_criterion_links_a_competency_and_keeps_its_free_text(admin, prof):
    competency = _create(admin).data["data"]

    created = cl(prof).post(
        f"{RUBRICS}/",
        _rubric_body(
            {"competency": "Texto libre", "competencyId": competency["id"]},
            {"competency": "Otro texto"},
        ),
        format="json",
    )

    assert created.status_code == 201, created.data
    first, second = created.data["data"]["criteria"]
    assert (first["competencyId"], first["competency"]) == (competency["id"], "Texto libre")
    assert (second["competencyId"], second["competency"]) == (None, "Otro texto")


def test_the_text_defaults_to_the_code_when_only_the_id_comes(admin, prof):
    competency = _create(admin).data["data"]

    created = cl(prof).post(
        f"{RUBRICS}/", _rubric_body({"title": "Trabajo", "competencyId": competency["id"]}, {}),
        format="json",
    )

    assert created.status_code == 201, created.data
    assert created.data["data"]["criteria"][0]["competency"] == "TRABAJO_EN_EQUIPO"


def test_a_text_only_criterion_links_by_code_when_the_competency_exists_and_never_creates_one(admin, prof):
    existing = _create(admin).data["data"]

    created = cl(prof).post(
        f"{RUBRICS}/",
        _rubric_body({"competency": "trabajo en equipo"}, {"competency": "no existe en el catálogo"}),
        format="json",
    )

    first, second = created.data["data"]["criteria"]
    assert first["competencyId"] == existing["id"]
    assert second["competencyId"] is None
    assert not Competency.objects.filter(code="NO_EXISTE_EN_EL_CATALOGO").exists()


@pytest.mark.parametrize("make_bad_id", [lambda c: 999999999, lambda c: "abc"])
def test_an_unknown_competency_is_a_400_naming_the_field(admin, prof, make_bad_id):
    created = cl(prof).post(
        f"{RUBRICS}/", _rubric_body({"competency": "X", "competencyId": make_bad_id(None)}, {}),
        format="json",
    )

    assert created.status_code == 400, created.data
    assert created.data["field"] == "competencyId"
    assert not Rubric.objects.filter(name="Rúbrica con competencias").exists()


def test_an_inactive_competency_cannot_be_linked(admin, prof):
    competency = _create(admin).data["data"]
    Competency.objects.filter(pk=competency["id"]).update(active=False)

    response = cl(prof).post(
        f"{RUBRICS}/", _rubric_body({"competency": "X", "competencyId": competency["id"]}, {}),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["field"] == "competencyId"


def test_updating_a_rubric_can_change_and_clear_the_link(admin, prof):
    competency = _create(admin).data["data"]
    client = cl(prof)
    rubric = client.post(
        f"{RUBRICS}/",
        _rubric_body({"competency": "X", "competencyId": competency["id"]}, {"competency": "Y"}),
        format="json",
    ).data["data"]
    criteria = rubric["criteria"]

    cleared = client.put(
        f"{RUBRICS}/{rubric['id']}",
        {**_rubric_body({"id": criteria[0]["id"], "competency": "X", "competencyId": None},
                        {"id": criteria[1]["id"], "competency": "Y"})},
        format="json",
    )

    assert cleared.status_code == 200, cleared.data
    assert cleared.data["data"]["criteria"][0]["competencyId"] is None


def test_duplicating_a_rubric_keeps_the_links(admin, prof):
    competency = _create(admin).data["data"]
    client = cl(prof)
    rubric = client.post(
        f"{RUBRICS}/",
        _rubric_body({"competency": "X", "competencyId": competency["id"]}, {"competency": "Y"}),
        format="json",
    ).data["data"]

    duplicated = client.post(f"{RUBRICS}/{rubric['id']}/duplicate")

    assert duplicated.status_code == 200, duplicated.data
    assert [c["competencyId"] for c in duplicated.data["data"]["criteria"]] == [competency["id"], None]


def test_cloning_a_case_keeps_the_links_of_its_rubric(admin):
    published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    criterion = RubricCriterion.objects.filter(rubric__case_version=published).order_by("id").first()
    competency = Competency.objects.create(code="ENLACE_CLON", name="Enlace del clon")
    RubricCriterion.objects.filter(pk=criterion.pk).update(competency_ref=competency)

    cloned = cl(admin).post(f"/api/authoring/cases/{published.id}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    copies = RubricCriterion.objects.filter(
        rubric__case_version_id=cloned.data["data"]["caseVersionId"], competency_ref=competency
    )
    assert copies.count() == 1


# ─── lo que ya existe ─────────────────────────────────────────────────────────────────────────
def _run_link_migration():
    module = importlib.import_module("apps.simulation.migrations.0023_link_rubric_competencies")
    module.link_competencies(live_apps, None)


@pytest.fixture
def messy_rubric(admin):
    rubric = Rubric.objects.create(name="Con texto libre sucio", created_by=admin, active=False)
    for order, text in enumerate(["Contención", "CONTENCION", "contencion ", "Marco normativo", ""], 1):
        RubricCriterion.objects.create(
            rubric=rubric, competency=text, title=f"T{order}", display_order=order, max_score=20
        )
    return rubric


def test_the_migration_creates_one_competency_per_distinct_normalized_text(messy_rubric):
    _run_link_migration()

    criteria = list(RubricCriterion.objects.filter(rubric=messy_rubric).order_by("display_order"))
    codes = {c.competency_ref.code for c in criteria if c.competency_ref_id}
    assert codes == {"CONTENCION", "MARCO_NORMATIVO"}
    assert len({c.competency_ref_id for c in criteria[:3]}) == 1  # las tres variantes, una sola
    assert criteria[4].competency_ref_id is None  # sin texto: queda sin enlazar
    assert [c.competency for c in criteria] == ["Contención", "CONTENCION", "contencion ", "Marco normativo", ""]


def test_the_migration_links_every_existing_rubric_and_is_idempotent(messy_rubric):
    _run_link_migration()
    before = Competency.objects.count()

    _run_link_migration()

    assert Competency.objects.count() == before
    pending = RubricCriterion.objects.filter(competency_ref__isnull=True).exclude(competency__regex=r"^\s*$")
    assert not pending.exists()


def test_the_seeded_rubrics_are_linked_in_a_fresh_database(admin):
    seed_default_rubric(admin)

    unlinked = RubricCriterion.objects.filter(competency_ref__isnull=True).exclude(competency__regex=r"^\s*$")

    assert not unlinked.exists()
    assert Competency.objects.filter(code="CONTENCION").exists()


# ─── la matriz ────────────────────────────────────────────────────────────────────────────────
def test_the_matrix_declares_the_competency_rows():
    assert policies.MATRIX[("competency", "read")] == {policies.PROFESOR: policies.ALL, policies.ADMIN: policies.ALL}
    assert policies.MATRIX[("competency", "manage")] == {policies.ADMIN: policies.ALL}


# ─── el enlace sigue al texto libre cuando este cambia (revisión de fase de E3, I-4) ───────────
def _linked_rubric(admin, prof):
    competency = _create(admin).data["data"]
    rubric = cl(prof).post(
        f"{RUBRICS}/",
        _rubric_body({"competency": "Trabajo", "competencyId": competency["id"]}, {"competency": "Otro"}),
        format="json",
    ).data["data"]
    return competency, rubric


def _resave(prof, rubric, first_text):
    first, second = rubric["criteria"]
    return cl(prof).put(
        f"{RUBRICS}/{rubric['id']}",
        _rubric_body({"id": first["id"], "competency": first_text}, {"id": second["id"], "competency": "Otro"}),
        format="json",
    )


def test_changing_the_free_text_drops_a_link_that_no_longer_matches(admin, prof):
    competency, rubric = _linked_rubric(admin, prof)

    response = _resave(prof, rubric, "Escucha activa")

    assert response.status_code == 200, response.data
    first = response.data["data"]["criteria"][0]
    assert (first["competency"], first["competencyId"]) == ("Escucha activa", None)


def test_changing_the_free_text_to_another_catalog_code_relinks(admin, prof):
    competency, rubric = _linked_rubric(admin, prof)
    other = _create(admin, code="Escucha activa", name="Escucha activa").data["data"]

    response = _resave(prof, rubric, "escucha activa")

    assert response.data["data"]["criteria"][0]["competencyId"] == other["id"]


def test_resaving_the_same_text_without_the_id_keeps_the_explicit_link(admin, prof):
    competency, rubric = _linked_rubric(admin, prof)

    response = _resave(prof, rubric, "Trabajo")  # el autoguardado de un cliente que no manda el id

    assert response.data["data"]["criteria"][0]["competencyId"] == competency["id"]
