"""Bloque R0 (rediseño del editor y de las rúbricas) · lo que el servidor agrega, sin cambiar nada de lo de antes.

- RK-1: el caso ADOPTA una rúbrica (``POST …/cases/{id}/rubric``): una copia propia de la versión, que viaja con el caso.
  Solo un borrador, solo quien lo autora, copia fiel y la anterior queda inactiva.
- RK-2: cada criterio puede decir qué significa cada nivel en él (``levelDescriptors``); lo que no dice se lee con el
  descriptor general. Lo copian el duplicado, la adopción y el clon de una versión.
- RK-3: la biblioteca sabe de qué caso es una rúbrica (``caseVersion``) y cuánto se usó (``usage``).
- RK-4: la traza trae la evidencia por competencia para valorar a la vista, SIN ningún nivel calculado.
- RK-5: «Guardar sin entregar» (``deliver: false``) solo antes de la primera entrega: después es un 409 que no cambia nada.
- RK-6: el estudiante lee qué significa su nivel en cada criterio (``descriptor``), sin ningún número.
- RK-7 y RK-8: la ficha del editor edita los temas sensibles y, si nadie más comparte el caso, su nombre.

Un cliente que no manda los campos nuevos obtiene exactamente lo de hoy: eso lo prueban las suites de siempre, que pasan
sin tocarlas.
"""
import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.simulation.models import (
    AuditLog,
    CaseVersion,
    Competency,
    CriterionScore,
    Rubric,
    RubricCriterion,
    RubricEvaluation,
    SimulationAttempt,
    SimulationRubricAssignment,
)
from apps.simulation.services import case_cloning, rubric_service

from .competency_support import declare_all_seeded
from .test_attempt_concurrency import _option, committed_attempt, explored_attempt  # noqa: F401  (fixtures)
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _complete,
    _start,
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.req("RF-08"), pytest.mark.req("RN-09"), pytest.mark.req("SIEP-CU-04")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
RUBRICS = "/api/rubrics"
TEACHER = "/api/instructor/attempts"
LEVELS = ("EN_INICIO", "EN_PROCESO", "LOGRADO", "DESTACADO")


def _user(email, role):
    return User.objects.create_user(email=email, password="x", nombre="N", apellido="A", role=role)


@pytest.fixture
def prof_a(db):
    return _user("r0_prof_a@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("r0_prof_b@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("r0_admin@x.com", "ADMIN")


@pytest.fixture
def draft(prof_a):
    """Un borrador recién creado por ``prof_a`` (la vista del editor que devuelve la creación)."""
    response = cl(prof_a).post(AUTHORING, {"title": "Caso de R0"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


def _rubric(owner, name="Plantilla", weights=(Decimal("60.00"), Decimal("40.00")), **extra):
    rubric = Rubric.objects.create(name=name, description="Desc", active=True, version="2.3", created_by=owner, **extra)
    for order, weight in enumerate(weights, start=1):
        RubricCriterion.objects.create(
            rubric=rubric, competency=f"COMP_{order}", title=f"Criterio {order}", description=f"Qué se observa {order}",
            weight=weight, max_score=int(weight), display_order=order,
        )
    return rubric


def _adopt(user, draft, **body):
    return cl(user).post(
        f"{AUTHORING}/{draft['caseVersionId']}/rubric", {"revision": draft["revision"], **body}, format="json"
    )


def _own_rubrics(case_version_id, active=True):
    return list(Rubric.objects.filter(case_version_id=case_version_id, active=active).order_by("id"))


# ─── RK-1 · adoptar una rúbrica en el caso ──────────────────────────────────────────────────────────
def test_adoptar_las_competencias_del_programa_crea_un_criterio_enlazado_por_competencia(prof_a, draft):
    catalog = list(Competency.objects.filter(active=True).order_by("sort_order", "code"))
    assert catalog, "la base de pruebas trae el catálogo sembrado"

    response = _adopt(prof_a, draft, fromCompetencies=True)

    assert response.status_code == 200, response.data
    view = response.data["data"]
    assert view["revision"] == draft["revision"] + 1  # adoptar es editar el borrador
    [adopted] = _own_rubrics(draft["caseVersionId"])
    assert adopted.name == rubric_service.PROGRAM_RUBRIC_NAME and adopted.created_by_id == prof_a.id
    criteria = list(RubricCriterion.objects.filter(rubric=adopted).order_by("display_order"))
    assert [c.competency_ref_id for c in criteria] == [c.id for c in catalog]
    assert [c.title for c in criteria] == [c.name for c in catalog]
    assert sum(c.weight for c in criteria) == Decimal("100.00")
    assert len({c.weight for c in criteria[:-1]}) == 1  # pesos iguales; el último absorbe el redondeo
    assert [r["rubricId"] for r in view["rubrics"]] == [adopted.id]
    assert rubric_service.rubric_for_case_version(draft["caseVersionId"]).id == adopted.id
    row = AuditLog.objects.filter(action="RUBRIC_UPDATED", resource_type="CASE_VERSION").latest("id")
    context = json.loads(row.context_json)
    assert context["changed"] == ["adopted"] and context["rubricId"] == adopted.id


def test_los_pesos_iguales_suman_cien_con_cualquier_numero_de_criterios():
    for count in range(1, 13):
        weights = rubric_service._equal_weights(count)
        assert sum(weights) == Decimal("100.00") and len(weights) == count
    assert rubric_service._equal_weights(3) == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]


def test_adoptar_una_rubrica_la_copia_fiel_y_no_toca_el_original(prof_a, draft):
    source = _rubric(prof_a, weights=(Decimal("60.00"), Decimal("40.00"), Decimal("15.00")))
    first, second, inactive = RubricCriterion.objects.filter(rubric=source).order_by("display_order")
    competency = Competency.objects.filter(active=True).first()
    RubricCriterion.objects.filter(pk=first.pk).update(
        competency_ref=competency, level_descriptors_json=json.dumps({"LOGRADO": "Contiene y nombra la emoción."}),
    )
    RubricCriterion.objects.filter(pk=inactive.pk).update(active=False)  # un criterio retirado también se copia

    response = _adopt(prof_a, draft, rubricId=source.id)

    assert response.status_code == 200, response.data
    [adopted] = _own_rubrics(draft["caseVersionId"])
    assert adopted.id != source.id
    assert (adopted.name, adopted.description, adopted.version) == (source.name, source.description, source.version)
    assert adopted.is_default is False and adopted.active is True
    copied = list(RubricCriterion.objects.filter(rubric=adopted).order_by("display_order"))
    originals = list(RubricCriterion.objects.filter(rubric=source).order_by("display_order"))
    fields = ("competency", "competency_ref_id", "title", "description", "weight", "max_score", "active",
              "display_order", "level_descriptors_json")
    assert [[getattr(c, f) for f in fields] for c in copied] == [[getattr(c, f) for f in fields] for c in originals]
    assert source.case_version_id is None and RubricCriterion.objects.filter(rubric=source).count() == 3
    criteria = {c["title"]: c for c in response.data["data"]["rubrics"][0]["criteria"]}
    assert criteria["Criterio 1"]["levelDescriptors"] == {"LOGRADO": "Contiene y nombra la emoción."}
    assert criteria["Criterio 1"]["weight"] == 60.0 and criteria["Criterio 3"]["active"] is False


def test_adoptar_otra_vez_deja_inactiva_la_anterior_y_la_asignacion(prof_a, draft):
    shared = _rubric(prof_a, name="Compartida", weights=(Decimal("100.00"),))
    SimulationRubricAssignment.objects.create(case_version_id=draft["caseVersionId"], rubric=shared, assigned_by=prof_a)
    first = _adopt(prof_a, draft, fromCompetencies=True).data["data"]

    response = _adopt(prof_a, {**draft, "revision": first["revision"]}, rubricId=shared.id)

    assert response.status_code == 200, response.data
    [adopted] = _own_rubrics(draft["caseVersionId"])
    assert adopted.name == "Compartida"
    assert [r.name for r in _own_rubrics(draft["caseVersionId"], active=False)] == [rubric_service.PROGRAM_RUBRIC_NAME]
    assert not SimulationRubricAssignment.objects.filter(case_version_id=draft["caseVersionId"], active=True).exists()
    assert rubric_service.rubric_for_case_version(draft["caseVersionId"]).id == adopted.id
    assert Rubric.objects.get(pk=shared.pk).active  # la plantilla sigue igual en la biblioteca


def test_otra_docente_no_adopta_en_un_caso_ajeno_ni_copia_una_rubrica_que_no_ve(prof_a, prof_b, draft):
    private_of_b = _rubric(prof_b, name="Privada de B", weights=(Decimal("100.00"),))

    foreign = _adopt(prof_b, draft, fromCompetencies=True)
    hidden = _adopt(prof_a, draft, rubricId=private_of_b.id)

    assert foreign.status_code == 403
    assert hidden.status_code == 404  # no confirma que exista la rúbrica privada de otra docente (R3)
    assert not Rubric.objects.filter(case_version_id=draft["caseVersionId"]).exists()


def test_el_admin_adopta_en_cualquier_caso(admin, draft):
    assert _adopt(admin, draft, fromCompetencies=True).status_code == 200


def test_solo_se_adopta_en_un_borrador(admin, case_version_id):
    published = CaseVersion.objects.get(pk=case_version_id)
    before = list(Rubric.objects.filter(case_version_id=case_version_id).values_list("id", "active"))

    response = _adopt(admin, {"caseVersionId": published.id, "revision": published.version}, fromCompetencies=True)

    assert response.status_code == 400
    assert list(Rubric.objects.filter(case_version_id=case_version_id).values_list("id", "active")) == before


def test_una_revision_vencida_es_un_conflicto(prof_a, prof_b, admin, draft):
    # Otra persona (el ADMIN) edita el caso: la revisión que vio prof_a queda vieja.
    cl(admin).put(f"{AUTHORING}/{draft['caseVersionId']}/brief", {"context": "Otra edición",
                  "revision": draft["revision"]}, format="json")

    response = _adopt(prof_a, draft, fromCompetencies=True)

    assert response.status_code == 409 and response.data["code"] == "REVISION_CONFLICT"
    assert not Rubric.objects.filter(case_version_id=draft["caseVersionId"]).exists()


@pytest.mark.parametrize("body", [{}, {"fromCompetencies": False}, {"fromCompetencies": True, "rubricId": 1}])
def test_hay_que_pedir_una_sola_fuente(prof_a, draft, body):
    response = _adopt(prof_a, draft, **body)

    assert response.status_code == 400 and response.data["field"] == "rubricId"


def test_una_rubrica_cuyos_pesos_no_suman_cien_no_se_adopta(prof_a, draft):
    broken = _rubric(prof_a, weights=(Decimal("50.00"), Decimal("20.00")))
    previous = _adopt(prof_a, draft, fromCompetencies=True).data["data"]

    response = _adopt(prof_a, {**draft, "revision": previous["revision"]}, rubricId=broken.id)

    assert response.status_code == 400
    [still] = _own_rubrics(draft["caseVersionId"])  # nada cambió: la anterior sigue activa
    assert still.name == rubric_service.PROGRAM_RUBRIC_NAME
    assert CaseVersion.objects.get(pk=draft["caseVersionId"]).version == previous["revision"]


def test_sin_competencias_activas_en_el_catalogo_no_hay_rubrica_del_programa(prof_a, draft):
    Competency.objects.update(active=False)

    response = _adopt(prof_a, draft, fromCompetencies=True)

    assert response.status_code == 400 and response.data["field"] == "fromCompetencies"


# ─── RK-2 · descriptores por nivel ─────────────────────────────────────────────────────────────────
def _rubric_body(descriptors=None):
    criterion = {"competency": "CONTENCION", "title": "Contención", "weight": 100, "displayOrder": 1, "active": True}
    if descriptors is not None:
        criterion["levelDescriptors"] = descriptors
    return {"name": "Analítica", "active": True, "criteria": [criterion]}


def test_los_descriptores_se_guardan_se_leen_y_ausentes_no_se_tocan(prof_a):
    client = cl(prof_a)
    created = client.post(
        f"{RUBRICS}/", _rubric_body({"EN_INICIO": "  Nombra la emoción.  ", "DESTACADO": "Anticipa el riesgo."}),
        format="json",
    ).data["data"]
    [criterion] = created["criteria"]
    assert criterion["levelDescriptors"] == {"EN_INICIO": "Nombra la emoción.", "DESTACADO": "Anticipa el riesgo."}

    # Un cliente de hoy, que no conoce los descriptores, guarda el criterio sin la clave: no se borran.
    old_client = {**_rubric_body(), "criteria": [{**_rubric_body()["criteria"][0], "id": criterion["id"]}]}
    kept = client.put(f"{RUBRICS}/{created['id']}", old_client, format="json").data["data"]
    assert kept["criteria"][0]["levelDescriptors"] == criterion["levelDescriptors"]

    # El objeto reemplaza a los descriptores del criterio (la matriz manda sus cuatro celdas): una celda vacía vuelve al
    # descriptor general; ``null`` los quita todos.
    one_less = {**old_client, "criteria": [{**old_client["criteria"][0],
                                             "levelDescriptors": {"EN_INICIO": "", "DESTACADO": "Anticipa el riesgo."}}]}
    after = client.put(f"{RUBRICS}/{created['id']}", one_less, format="json").data["data"]
    assert after["criteria"][0]["levelDescriptors"] == {"DESTACADO": "Anticipa el riesgo."}
    none = {**old_client, "criteria": [{**old_client["criteria"][0], "levelDescriptors": None}]}
    assert client.put(f"{RUBRICS}/{created['id']}", none, format="json").data["data"]["criteria"][0][
        "levelDescriptors"] == {}


@pytest.mark.parametrize(
    "descriptors",
    [
        {"MUY_BIEN": "x"},  # solo las cuatro claves de nivel
        ["LOGRADO"],
        {"LOGRADO": "<b>negrita</b>"},  # texto plano: nada de marcado
        {"LOGRADO": "x" * (rubric_service.MAX_LEVEL_DESCRIPTOR_LENGTH + 1)},
    ],
)
def test_un_descriptor_mal_formado_es_un_400_que_nombra_el_campo(prof_a, descriptors):
    response = cl(prof_a).post(f"{RUBRICS}/", _rubric_body(descriptors), format="json")

    assert response.status_code == 400 and response.data["field"] == "levelDescriptors"
    assert not Rubric.objects.filter(name="Analítica").exists()


def test_duplicar_y_clonar_conservan_los_descriptores(prof_a):
    source = _rubric(prof_a, weights=(Decimal("100.00"),))
    descriptors = json.dumps({"LOGRADO": "Orienta a la ruta."})
    RubricCriterion.objects.filter(rubric=source).update(level_descriptors_json=descriptors)

    duplicate = cl(prof_a).post(f"{RUBRICS}/{source.id}/duplicate", {}, format="json").data["data"]
    clone_target = Rubric.objects.create(name="Clon", created_by=prof_a)
    clone = case_cloning.RUBRIC_CRITERION.copy(RubricCriterion.objects.get(rubric=source), rubric=clone_target)

    assert duplicate["criteria"][0]["levelDescriptors"] == {"LOGRADO": "Orienta a la ruta."}
    assert clone.level_descriptors_json == descriptors


def test_una_fila_con_descriptores_rotos_se_lee_con_los_generales(prof_a):
    rubric = _rubric(prof_a, weights=(Decimal("100.00"),))
    RubricCriterion.objects.filter(rubric=rubric).update(level_descriptors_json='{"LOGRADO": 7, "OTRO": "x"')

    detail = cl(prof_a).get(f"{RUBRICS}/{rubric.id}").data["data"]
    criterion = RubricCriterion.objects.get(rubric=rubric)

    assert detail["criteria"][0]["levelDescriptors"] == {}
    assert rubric_service.descriptor_for(criterion, "LOGRADO") == rubric_service.LEVELS[2]["descriptor"]


def test_la_vista_de_valorar_trae_los_descriptores_de_cada_criterio(admin, estudiante, case_version_id):
    attempt_id, _ = _start(cl(estudiante), case_version_id)
    rubric = rubric_service.rubric_for_case_version(case_version_id)
    criterion = RubricCriterion.objects.filter(rubric=rubric, active=True).order_by("display_order", "id").first()
    RubricCriterion.objects.filter(pk=criterion.pk).update(
        level_descriptors_json=json.dumps({"EN_PROCESO": "Valida pero no orienta."})
    )

    view = cl(admin).get(f"{TEACHER}/{attempt_id}/rubric-evaluation").data["data"]

    by_id = {c["id"]: c for c in view["criteria"]}
    assert by_id[criterion.id]["levelDescriptors"] == {"EN_PROCESO": "Valida pero no orienta."}
    assert all("levelDescriptors" in c for c in view["criteria"])
    assert [level["value"] for level in view["levels"]] == list(LEVELS)  # los generales siguen llegando como hoy


def _column_exists():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'rubric_criteria' AND column_name = 'level_descriptors_json'"
        )
        return cursor.fetchone() is not None


def test_la_migracion_0038_aplica_revierte_y_depende_de_la_0037(db):
    executor = MigrationExecutor(connection)
    migration = executor.loader.get_migration("simulation", "0038_rubric_criterion_level_descriptors")
    assert ("simulation", "0037_case_version_content_warnings") in migration.dependencies
    latest = list(executor.loader.graph.leaf_nodes("simulation"))
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")  # sin eventos de FK pendientes antes del DDL

    MigrationExecutor(connection).migrate([("simulation", "0037_case_version_content_warnings")])
    assert not _column_exists()
    MigrationExecutor(connection).migrate(latest)
    assert _column_exists()
    # Las filas de antes quedan «sin descriptores propios» (el valor por defecto de la base).
    with connection.cursor() as cursor:
        cursor.execute("SELECT DISTINCT level_descriptors_json FROM rubric_criteria")
        assert {value for (value,) in cursor.fetchall()} <= {"{}"}


# ─── RK-3 · de qué caso es y cuánto se usó ─────────────────────────────────────────────────────────
def test_la_biblioteca_dice_de_que_caso_es_cada_rubrica_y_cuanto_se_uso(prof_a, draft):
    template = _rubric(prof_a, name="Plantilla de A", weights=(Decimal("100.00"),))
    SimulationRubricAssignment.objects.create(case_version_id=draft["caseVersionId"], rubric=template, assigned_by=prof_a)
    _adopt(prof_a, draft, fromCompetencies=True)

    listed = {r["name"]: r for r in cl(prof_a).get(f"{RUBRICS}/").data["data"]}

    own = listed[rubric_service.PROGRAM_RUBRIC_NAME]
    assert own["caseVersion"] == {
        "id": draft["caseVersionId"], "title": "Caso de R0", "semanticVersion": "0.1.0", "status": "DRAFT",
    }
    assert own["usage"] == {"caseVersions": 1, "evaluations": 0}
    assert listed["Plantilla de A"]["caseVersion"] is None
    # La adopción desactivó la asignación: la plantilla ya no valora ese caso.
    assert listed["Plantilla de A"]["usage"] == {"caseVersions": 0, "evaluations": 0}
    detail = cl(prof_a).get(f"{RUBRICS}/{own['id']}").data["data"]
    assert detail["caseVersion"] == own["caseVersion"] and detail["usage"] == own["usage"]


def test_el_uso_cuenta_las_valoraciones_del_docente_y_no_las_del_sistema(admin, completed, case_version_id):
    _, attempt_id, _ = completed
    rubric = rubric_service.rubric_for_case_version(case_version_id)
    criteria = list(RubricCriterion.objects.filter(rubric=rubric, active=True))
    cl(admin).put(
        f"{TEACHER}/{attempt_id}/rubric-evaluation",
        {"scores": [{"criterionId": c.id, "level": "LOGRADO"} for c in criteria]},
        format="json",
    )
    docente = RubricEvaluation.objects.filter(rubric=rubric, origin="DOCENTE").count()
    assert docente >= 1

    [summary] = [r for r in cl(admin).get(f"{RUBRICS}/").data["data"] if r["id"] == rubric.id]

    assert summary["usage"]["evaluations"] == docente
    own = rubric.case_version
    assert summary["caseVersion"] == (
        {"id": own.id, "title": own.simulation_case.title, "semanticVersion": own.semantic_version, "status": own.status}
        if own is not None else None
    )


# ─── RK-4 · la evidencia por competencia ───────────────────────────────────────────────────────────
def _claves(valor):
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            yield clave
            yield from _claves(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            yield from _claves(hijo)


def test_la_traza_trae_la_evidencia_por_competencia_sin_ningun_nivel(admin, estudiante, case_version_id):
    declare_all_seeded(case_version_id)
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    _complete(client, attempt_id, token)

    trace = cl(admin).get(f"{TEACHER}/{attempt_id}/trace").data["data"]

    evidence = trace["evidenceByCompetency"]
    rubric = rubric_service.rubric_for_case_version(case_version_id)
    from apps.simulation.assessment.competencies import rubric_competencies

    assert [e["code"] for e in evidence] == [c.code for c in rubric_competencies(rubric)]
    assert all(e["items"] for e in evidence), "todas las decisiones declaran las cuatro competencias"
    for entry in evidence:
        for item in entry["items"]:
            assert set(item) == {"order", "nodeTitle", "optionText", "class", "atSeconds"}
        assert [i["order"] for i in entry["items"]] == sorted(i["order"] for i in entry["items"])
    assert "level" not in set(_claves(evidence)) and "overallLevel" not in set(_claves(evidence))
    # La valoración automática sigue plegada: la evidencia no la adelanta.
    assert trace["systemEvaluation"] is None and trace["systemEvaluationAvailable"] is True


def test_sin_competencias_declaradas_la_evidencia_esta_vacia_por_competencia(admin, completed):
    _, attempt_id, _ = completed  # el caso sembrado no declara competencias

    evidence = cl(admin).get(f"{TEACHER}/{attempt_id}/trace").data["data"]["evidenceByCompetency"]

    assert evidence and all(entry["items"] == [] for entry in evidence)


# ─── RK-5 · guardar sin entregar ───────────────────────────────────────────────────────────────────
def _all_levels(attempt_id, level="LOGRADO"):
    rubric = rubric_service.rubric_for_case_version(SimulationAttempt.objects.get(pk=attempt_id).case_version_id)
    return [
        {"criterionId": c.id, "level": level, "comment": f"obs {level}"}
        for c in RubricCriterion.objects.filter(rubric=rubric, active=True).order_by("display_order", "id")
    ]


def _save(user, attempt_id, scores, **extra):
    return cl(user).put(
        f"{TEACHER}/{attempt_id}/rubric-evaluation", {"comment": "General", "scores": scores, **extra}, format="json"
    )


def _student_view(student, attempt_id):
    return cl(student).get(f"{BASE}/attempts/{attempt_id}/evaluation").data["data"]["evaluations"]


def _docente(attempt_id):
    return RubricEvaluation.objects.get(attempt_id=attempt_id, origin="DOCENTE")


def test_guardar_sin_entregar_y_luego_entregar(admin, estudiante, completed):
    _, attempt_id, _ = completed

    draft_save = _save(admin, attempt_id, _all_levels(attempt_id), deliver=False)

    assert draft_save.status_code == 200, draft_save.data
    assert draft_save.data["data"]["status"] == "PENDING"  # completa, pero sin entregar
    assert _student_view(estudiante, attempt_id) == []
    pending = cl(admin).get(TEACHER, {"evaluacion": "pendiente"}).data["data"]["items"]
    assert attempt_id in {item["attemptId"] for item in pending}

    delivered = _save(admin, attempt_id, _all_levels(attempt_id))  # sin ``deliver``: entrega, como siempre

    assert delivered.data["data"]["status"] == "EVALUATED"
    assert [c["level"] for c in _student_view(estudiante, attempt_id)[0]["criteria"]] == ["LOGRADO"] * len(
        _all_levels(attempt_id))


def test_tras_entregar_guardar_sin_entregar_es_un_409_que_no_cambia_nada(admin, estudiante, completed):
    _, attempt_id, _ = completed
    _save(admin, attempt_id, _all_levels(attempt_id, "DESTACADO"))
    before_student = _student_view(estudiante, attempt_id)
    before_rows = list(
        CriterionScore.objects.filter(rubric_evaluation=_docente(attempt_id)).values_list("rubric_criterion_id", "level",
                                                                                          "comment")
    )

    response = _save(admin, attempt_id, _all_levels(attempt_id, "EN_INICIO"), deliver=False, comment="Otro")

    assert response.status_code == 409 and response.data["code"] == "EVALUATION_ALREADY_DELIVERED"
    evaluation = _docente(attempt_id)
    assert (evaluation.status, evaluation.comment) == ("EVALUATED", "General")
    assert list(
        CriterionScore.objects.filter(rubric_evaluation=evaluation).values_list("rubric_criterion_id", "level", "comment")
    ) == before_rows
    assert _student_view(estudiante, attempt_id) == before_student


def test_una_correccion_completa_tras_entregar_sigue_entregada_y_el_estudiante_ve_la_nueva(admin, estudiante, completed):
    _, attempt_id, _ = completed
    _save(admin, attempt_id, _all_levels(attempt_id, "EN_PROCESO"))

    corrected = _save(admin, attempt_id, _all_levels(attempt_id, "DESTACADO"), deliver=True)

    assert corrected.data["data"]["status"] == "EVALUATED"
    assert {c["level"] for c in _student_view(estudiante, attempt_id)[0]["criteria"]} == {"DESTACADO"}


def test_un_fallo_a_mitad_de_guardado_no_deja_la_valoracion_a_medias(admin, estudiante, completed, monkeypatch):
    _, attempt_id, _ = completed
    _save(admin, attempt_id, _all_levels(attempt_id, "EN_PROCESO"))
    before = list(CriterionScore.objects.filter(rubric_evaluation=_docente(attempt_id)).values_list("level", flat=True))
    real_create = CriterionScore.objects.create
    calls = {"n": 0}

    def create_then_fail(**kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("la base se cayó a mitad del guardado")
        return real_create(**kwargs)

    monkeypatch.setattr(CriterionScore.objects, "create", create_then_fail)
    with pytest.raises(RuntimeError):
        rubric_service.save_attempt_evaluation(
            attempt_id, {"comment": "A medias", "scores": _all_levels(attempt_id, "DESTACADO")}, admin
        )
    monkeypatch.undo()

    evaluation = _docente(attempt_id)
    assert (evaluation.status, evaluation.comment) == ("EVALUATED", "General")
    assert list(CriterionScore.objects.filter(rubric_evaluation=evaluation).values_list("level", flat=True)) == before
    assert {c["level"] for c in _student_view(estudiante, attempt_id)[0]["criteria"]} == {"EN_PROCESO"}


@pytest.mark.parametrize("deliver", ["false", 0, None])
def test_deliver_tiene_que_ser_un_booleano(admin, completed, deliver):
    _, attempt_id, _ = completed

    response = _save(admin, attempt_id, _all_levels(attempt_id), deliver=deliver)

    assert response.status_code == 400 and response.data["field"] == "deliver"
    assert not RubricEvaluation.objects.filter(attempt_id=attempt_id, origin="DOCENTE").exists()


# ─── RK-6 · lo que el estudiante lee de su nivel ───────────────────────────────────────────────────
def test_el_estudiante_lee_el_descriptor_propio_o_el_general_y_ningun_numero(admin, estudiante, completed):
    _, attempt_id, _ = completed
    scores = _all_levels(attempt_id, "LOGRADO")
    own = RubricCriterion.objects.get(pk=scores[0]["criterionId"])
    RubricCriterion.objects.filter(pk=own.pk).update(
        level_descriptors_json=json.dumps({"LOGRADO": "Contiene la crisis y orienta a la ruta."})
    )
    _save(admin, attempt_id, scores)

    [evaluation] = _student_view(estudiante, attempt_id)

    descriptors = {c["criterionId"]: c["descriptor"] for c in evaluation["criteria"]}
    assert descriptors[own.id] == "Contiene la crisis y orienta a la ruta."
    general = rubric_service.LEVELS[2]["descriptor"]
    assert all(text == general for cid, text in descriptors.items() if cid != own.id)
    dumped = json.dumps(evaluation)
    for forbidden in ("score", "weight", "total"):
        assert forbidden not in dumped


def test_otro_estudiante_sigue_sin_leerla_y_un_borrador_no_aparece(admin, completed):
    _, attempt_id, _ = completed
    _save(admin, attempt_id, _all_levels(attempt_id), deliver=False)
    other = _user("r0_otro_est@x.com", "ESTUDIANTE")

    assert cl(other).get(f"{BASE}/attempts/{attempt_id}/evaluation").status_code == 403


# ─── RK-7 y RK-8 · la ficha del caso ───────────────────────────────────────────────────────────────
def _brief(user, draft, **body):
    return cl(user).put(
        f"{AUTHORING}/{draft['caseVersionId']}/brief", {"revision": draft["revision"], **body}, format="json"
    )


def test_la_ficha_edita_los_temas_sensibles(prof_a, draft):
    response = _brief(prof_a, draft, contentWarnings=["  Violencia de pareja ", "", "violencia de pareja",
                                                       "Riesgo de feminicidio"])

    assert response.status_code == 200, response.data
    view = response.data["data"]
    assert view["contentWarnings"] == ["Violencia de pareja", "Riesgo de feminicidio"]
    assert json.loads(CaseVersion.objects.get(pk=draft["caseVersionId"]).content_warnings) == view["contentWarnings"]
    # Ausente = no tocar; ``[]`` los quita.
    kept = _brief(prof_a, {**draft, "revision": view["revision"]}, context="Nuevo contexto").data["data"]
    assert kept["contentWarnings"] == view["contentWarnings"]
    cleared = _brief(prof_a, {**draft, "revision": kept["revision"]}, contentWarnings=[]).data["data"]
    assert cleared["contentWarnings"] == []
    assert cl(prof_a).get(f"{AUTHORING}/{draft['caseVersionId']}/editor").data["data"]["contentWarnings"] == []


@pytest.mark.parametrize(
    "themes",
    [["tema"] * 9, ["x" * 61], ["<script>x</script>"], ["dos\nlíneas"]],
)
def test_los_temas_sensibles_tienen_tope_y_son_texto_plano(prof_a, draft, themes):
    response = _brief(prof_a, draft, contentWarnings=themes)

    assert response.status_code == 400 and response.data["field"] == "contentWarnings"
    assert CaseVersion.objects.get(pk=draft["caseVersionId"]).content_warnings == "[]"


def test_un_caso_solo_en_borrador_se_renombra(prof_a, draft):
    response = _brief(prof_a, draft, title="  Primera atención en el consultorio ")

    assert response.status_code == 200, response.data
    assert response.data["data"]["title"] == "Primera atención en el consultorio"
    version = CaseVersion.objects.select_related("simulation_case").get(pk=draft["caseVersionId"])
    assert version.simulation_case.title == "Primera atención en el consultorio"


@pytest.mark.parametrize("title", ["", "   ", "<b>Caso</b>", "x" * 256])
def test_el_nombre_no_puede_quedar_vacio_ni_llevar_marcado(prof_a, draft, title):
    response = _brief(prof_a, draft, title=title)

    assert response.status_code == 400 and response.data["field"] == "title"
    assert CaseVersion.objects.select_related("simulation_case").get(
        pk=draft["caseVersionId"]).simulation_case.title == "Caso de R0"


@pytest.mark.parametrize("sibling_status", ["PUBLISHED", "ARCHIVED"])
def test_no_se_renombra_un_caso_que_otra_version_ya_mostro(prof_a, draft, sibling_status):
    version = CaseVersion.objects.get(pk=draft["caseVersionId"])
    CaseVersion.objects.create(
        simulation_case_id=version.simulation_case_id, semantic_version="0.0.9", status=sibling_status,
        created_by=prof_a,
    )

    response = _brief(prof_a, draft, title="Otro nombre", context="Esto tampoco se guarda")

    assert response.status_code == 409 and response.data["code"] == "CASE_TITLE_SHARED"
    version.refresh_from_db()
    assert version.simulation_case.title == "Caso de R0"
    assert version.narrative_context == "" and version.version == draft["revision"]


# ─── Revisión de Codex · RK-5 y el documento del caso ────────────────────────────────────────────
def test_guardar_sin_entregar_toma_la_fila_del_intento_aunque_no_haya_valoracion(admin, completed):
    """Con la valoración aún inexistente (o ``PENDING``) no hay fila de valoración que bloquear: el cerrojo tiene que
    estar en el intento, que siempre existe, para que una entrega simultánea no sea pisada por un borrador."""
    from django.test.utils import CaptureQueriesContext

    _, attempt_id, _ = completed
    assert not RubricEvaluation.objects.filter(attempt_id=attempt_id, origin="DOCENTE").exists()

    with CaptureQueriesContext(connection) as queries:
        response = _save(admin, attempt_id, _all_levels(attempt_id), deliver=False)

    assert response.status_code == 200, response.data
    locked = [q["sql"] for q in queries if "FOR UPDATE" in q["sql"].upper()]
    assert any("simulation_attempt" in sql.lower() and "rubric" not in sql.lower() for sql in locked), locked


def test_entregar_tambien_toma_la_fila_del_intento(admin, completed):
    from django.test.utils import CaptureQueriesContext

    _, attempt_id, _ = completed
    with CaptureQueriesContext(connection) as queries:
        assert _save(admin, attempt_id, _all_levels(attempt_id)).status_code == 200
    assert any(
        "FOR UPDATE" in q["sql"].upper() and "simulation_attempt" in q["sql"].lower() for q in queries
    )


def _seeded_with_r0_data():
    """El caso sembrado (importable de verdad) con temas sensibles y descriptores propios en su primer criterio."""
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    seeded.content_warnings = json.dumps(["Violencia", "Duelo"], ensure_ascii=False)
    seeded.save(update_fields=["content_warnings"])
    descriptors = {"EN_INICIO": "No nombra la emoción.", "DESTACADO": "La nombra y la valida."}
    criterion = RubricCriterion.objects.filter(rubric__case_version=seeded).order_by("rubric_id", "display_order", "id").first()
    criterion.level_descriptors_json = json.dumps(descriptors, ensure_ascii=False)
    criterion.save(update_fields=["level_descriptors_json"])
    return seeded, descriptors


def _import(user, document):
    return cl(user).generic(
        "POST", f"{AUTHORING}/import", data=json.dumps(document, ensure_ascii=False).encode("utf-8"),
        content_type="application/json",
    )


def test_los_temas_sensibles_y_los_descriptores_sobreviven_a_exportar_e_importar(admin):
    from apps.simulation.services.authoring import definition_io

    seeded, descriptors = _seeded_with_r0_data()
    document = definition_io.export_definition(seeded.id)
    siep = document["x-siep"]
    assert siep["temasSensibles"] == ["Violencia", "Duelo"]
    assert [c["descriptoresNivel"] for r in siep["rubricas"] for c in r["criterios"] if "descriptoresNivel" in c] == [
        descriptors
    ]

    document["caso"]["id"] = "R0-IDA-VUELTA"
    response = _import(admin, document)

    assert response.status_code == 201, response.data
    new_id = response.data["data"]["caseVersionId"]
    assert json.loads(CaseVersion.objects.get(pk=new_id).content_warnings) == ["Violencia", "Duelo"]
    copied = RubricCriterion.objects.filter(rubric__case_version_id=new_id).order_by("rubric_id", "display_order", "id").first()
    assert json.loads(copied.level_descriptors_json) == descriptors
    again = definition_io.export_definition(new_id)
    assert again["x-siep"]["temasSensibles"] == ["Violencia", "Duelo"]
    assert again["x-siep"]["rubricas"] == siep["rubricas"]


def test_un_caso_sin_temas_ni_descriptores_exporta_el_documento_de_siempre(admin):
    from apps.simulation.services.authoring import definition_io

    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    siep = definition_io.export_definition(seeded.id)["x-siep"]
    assert "temasSensibles" not in siep
    assert not any("descriptoresNivel" in c for r in siep["rubricas"] for c in r["criterios"])


def test_un_documento_con_temas_o_descriptores_con_marcado_se_rechaza(admin):
    from apps.simulation.services.authoring import definition_io

    seeded, _ = _seeded_with_r0_data()
    document = definition_io.export_definition(seeded.id)
    document["caso"]["id"] = "R0-MARCADO"
    document["x-siep"]["temasSensibles"] = ["<b>Violencia</b>"]
    assert _import(admin, document).status_code == 400

    document = definition_io.export_definition(seeded.id)
    document["caso"]["id"] = "R0-MARCADO-2"
    for rubric in document["x-siep"]["rubricas"]:
        for criterion in rubric["criterios"]:
            if "descriptoresNivel" in criterion:
                criterion["descriptoresNivel"]["LOGRADO"] = "<script>x</script>"
    assert _import(admin, document).status_code == 400
