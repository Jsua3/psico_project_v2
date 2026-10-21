"""E6-2b · ``GET /api/reportes/analiticas``: los agregados de aprendizaje (RQ-NEG-001 a 005; contrato C13).

El endpoint solo AÑADE alcance, auditoría y tipado al cálculo de ``assessment.analytics`` (probado aparte): el docente ve
los estudiantes de SUS grupos activos con membresía ACTIVE, el ADMIN a todos, ambos con la misma celda mínima ``k``; cada
consulta buena deja UNA fila de auditoría ``analitica.ver`` con ``{groupId, caseVersionId, suppressed}`` y sin ids de
estudiantes ni cifras; y el número de consultas no crece con la cohorte. Todo cálculo es BORRADOR (Psicología).
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.assessment import definitions
from apps.simulation.models import AuditLog, CaseVersion, Rubric
from apps.simulation.tests.analytics_support import completed_attempt, make_student, seed_student_pair, v2_report
from shared.testing import measure, purge_audit_rows

from .test_reportes import _add_student, _grupo, case_version_id, cl, estudiante, profesor  # noqa: F401  (fixtures)

pytestmark = [
    pytest.mark.usefixtures("fetch_raise"),  # DJA-7: un acceso perezoso accidental lanza
    pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RQ-NEG-003"),
    pytest.mark.req("RQ-NEG-004"), pytest.mark.req("RQ-NEG-005"),
]

User = get_user_model()
URL = "/api/reportes/analiticas"

#: Cada estudiante del cohorte: 1.er intento (índice 1.5, 4 no recomendadas, sin reflexión) → 2.º (3.0, 2, con reflexión).
FIRST = {"levels": ("EN_INICIO", "EN_PROCESO"), "non_recommended": 4, "covered": False, "key": False}
SECOND = {"levels": ("LOGRADO", "LOGRADO"), "non_recommended": 2, "covered": True, "key": True}


@pytest.fixture
def version(case_version_id):
    return CaseVersion.objects.get(pk=case_version_id)


@pytest.fixture
def rubric(version, profesor):
    return Rubric.objects.create(case_version=version, name="Rúbrica de analítica", active=True, created_by=profesor)


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email=f"admin_an_{uuid.uuid4().hex[:6]}@x.com", password="x", nombre="Ad", apellido="An", role="ADMIN"
    )


@pytest.fixture
def other_teacher(db):
    return User.objects.create_user(
        email=f"otro_an_{uuid.uuid4().hex[:6]}@x.com", password="x", nombre="Otro", apellido="Doc", role="PROFESOR"
    )


def cohort(teacher, version, rubric, size, *, group=None, label="c"):
    """``size`` estudiantes ACTIVOS de un grupo del docente, cada uno con dos intentos cerrados (cifras en ``FIRST``/``SECOND``)."""
    group = group or _grupo(teacher)
    students = []
    for index in range(size):
        who = make_student(f"{label}{index}")
        _add_student(group, who)
        seed_student_pair(who, version, rubric, teacher, first=FIRST, second=SECOND, rating=4)
        students.append(who)
    return group, students


def get(user, **params):
    return cl(user).get(URL, params)


# ─── quién ────────────────────────────────────────────────────────────────────────────────────
def test_el_estudiante_no_consulta_la_analitica(estudiante):
    assert get(estudiante).status_code == 403


def test_sin_sesion_es_un_401(db):
    from rest_framework.test import APIClient

    assert APIClient().get(URL).status_code == 401


# ─── lo que el docente recibe ─────────────────────────────────────────────────────────────────
def test_el_docente_recibe_los_bloques_de_su_grupo_con_las_cifras_conocidas(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)

    response = get(profesor, grupoId=group.id)

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["cohort"] == {"students": 5, "attempts": 10, "suppressed": False}
    # índice 1.5 → 3.0 en cada serie: (3.0 − 1.5) / 3 × 100 = 50.0 · no recomendadas 4 → 2: (2 − 4) / 4 × 100 = −50.0
    assert data["improvement"] == {"students": 5, "series": 5, "pre": 1.5, "post": 3.0, "deltaPct": 50.0}
    assert data["firstVsSecond"] == {
        "students": 5, "series": 5, "firstMean": 4.0, "secondMean": 2.0, "nonRecommendedDeltaPct": -50.0
    }
    assert data["acceptable"] == {"students": 5, "achieved": 5, "pct": 100.0, "levelThreshold": "LOGRADO"}
    assert data["reflectionCoverage"] == {"definition": "ANY", "attempts": 10, "covered": 5, "pct": 50.0}
    assert data["keyEvidence"] == {"attempts": 10, "keyEvidence": 5, "pct": 50.0}
    assert data["evaluated"] == {"attempts": 10, "systemPct": 100.0, "commentedPct": 50.0}
    assert data["improvementAfterFeedback"] == {"students": 5, "pairs": 5, "deltaPct": 50.0}
    assert "satisfaction" not in data  # la encuesta está apagada por defecto
    assert data["definitions"] == {
        "status": "BORRADOR", "acceptableLevel": "LOGRADO", "minCell": 5, "reflectionDefinition": "ANY",
        "profileRules": "borrador-1",
    }


def test_con_cuatro_estudiantes_solo_hay_cohorte_y_definiciones(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 4)

    data = get(profesor, grupoId=group.id).data["data"]

    assert set(data) == {"cohort", "definitions"}
    assert data["cohort"] == {"students": 4, "attempts": 8, "suppressed": True}


def test_la_satisfaccion_aparece_solo_con_la_encuesta_encendida(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)

    off = get(profesor, grupoId=group.id).data["data"]
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        on = get(profesor, grupoId=group.id).data["data"]

    assert "satisfaction" not in off
    assert on["satisfaction"] == {"responses": 5, "satisfiedPct": 100.0}


def test_el_nivel_aceptable_configurado_llega_al_calculo(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)

    with override_settings(ACCEPTABLE_LEVEL="DESTACADO"):
        data = get(profesor, grupoId=group.id).data["data"]

    assert data["acceptable"] == {"students": 5, "achieved": 0, "pct": 0.0, "levelThreshold": "DESTACADO"}
    assert data["definitions"]["acceptableLevel"] == "DESTACADO"


def test_la_definicion_de_reflexion_configurada_llega_al_calculo(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)

    with override_settings(REFLECTION_DEFINITION="PER_DECISION_SCENE"):
        data = get(profesor, grupoId=group.id).data["data"]

    # los reportes de este cohorte se congelaron con ``ANY``: bajo la definición nueva no hay intentos que contar
    assert "reflectionCoverage" not in data and "keyEvidence" not in data
    assert data["definitions"]["reflectionDefinition"] == "PER_DECISION_SCENE"


def test_cambiar_la_version_de_la_regla_del_perfil_deja_fuera_los_niveles_ya_cerrados(profesor, version, rubric, monkeypatch):
    group, _ = cohort(profesor, version, rubric, 5)
    monkeypatch.setattr(definitions, "PROFILE_RULES", "borrador-2")

    data = get(profesor, grupoId=group.id).data["data"]

    for block in ("improvement", "acceptable", "improvementAfterFeedback"):
        assert block not in data  # los reportes se sellaron con ``borrador-1``
    assert data["firstVsSecond"]["students"] == 5  # lo que no depende de los niveles sigue ahí
    assert data["definitions"]["profileRules"] == "borrador-2"


def test_la_celda_minima_configurada_no_baja_del_piso(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 4)

    with override_settings(MIN_CELL_SIZE=2):  # la configuración no puede publicar celdas de menos de 5
        data = get(profesor, grupoId=group.id).data["data"]

    assert data["cohort"]["suppressed"] is True and data["definitions"]["minCell"] == 5


def test_la_celda_minima_configurada_mas_alta_se_respeta(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)

    with override_settings(MIN_CELL_SIZE=8):
        data = get(profesor, grupoId=group.id).data["data"]

    assert data["cohort"]["suppressed"] is True and data["definitions"]["minCell"] == 8


def test_solo_cuentan_los_estudiantes_con_membresia_activa(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)
    invited = make_student("inv")
    GrupoEstudiante.objects.create(grupo=group, estudiante=invited, status=MembershipStatus.INVITED)
    seed_student_pair(invited, version, rubric, profesor, first=FIRST, second=SECOND)

    data = get(profesor, grupoId=group.id).data["data"]

    assert data["cohort"]["students"] == 5  # el invitado todavía no es «de» su docente


def test_filtrar_por_version_limita_a_los_intentos_de_esa_version(profesor, version, rubric):
    group, students = cohort(profesor, version, rubric, 5)
    other = CaseVersion.objects.create(
        simulation_case_id=version.simulation_case_id, semantic_version="9.0.0", status="PUBLISHED", created_by=profesor
    )
    for who in students:
        completed_attempt(who, other, 3, report=v2_report(levels=("DESTACADO",)))

    both = get(profesor, grupoId=group.id).data["data"]["cohort"]
    only = get(profesor, grupoId=group.id, caseVersionId=version.id).data["data"]["cohort"]

    assert (both["attempts"], only["attempts"]) == (15, 10)


# ─── el alcance ───────────────────────────────────────────────────────────────────────────────
def test_sin_filtros_el_docente_suma_sus_grupos_y_no_los_de_otro(profesor, other_teacher, version, rubric):
    cohort(profesor, version, rubric, 3, label="a")
    cohort(profesor, version, rubric, 3, label="b")  # cada grupo, por separado, queda bajo la celda mínima
    cohort(other_teacher, version, rubric, 6, label="z")

    data = get(profesor).data["data"]

    assert data["cohort"] == {"students": 6, "attempts": 12, "suppressed": False}


def test_un_grupo_de_otro_docente_es_un_403(profesor, other_teacher, version, rubric):
    group, _ = cohort(other_teacher, version, rubric, 5)

    assert get(profesor, grupoId=group.id).status_code == 403


def test_un_grupo_inexistente_es_un_404(profesor):
    assert get(profesor, grupoId=999999).status_code == 404


def test_un_grupo_propio_inactivo_es_un_403(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)
    Grupo.objects.filter(pk=group.id).update(activo=False)

    assert get(profesor, grupoId=group.id).status_code == 403


def test_el_docente_sin_grupos_recibe_la_cohorte_vacia_suprimida(profesor):
    data = get(profesor).data["data"]

    assert data["cohort"] == {"students": 0, "attempts": 0, "suppressed": True} and set(data) == {"cohort", "definitions"}


def test_una_version_de_caso_desconocida_es_un_404(profesor):
    assert get(profesor, caseVersionId=999999).status_code == 404


@pytest.mark.parametrize("param", ["grupoId", "caseVersionId"])
@pytest.mark.parametrize("value", ["abc", "1.5", "0", "-3", "2147483648", "99999999999"])
def test_un_parametro_que_no_es_un_entero_valido_es_un_400(profesor, param, value):
    response = get(profesor, **{param: value})

    assert response.status_code == 400 and response.data["code"] == "INVALID_QUERY_PARAM"


@pytest.mark.parametrize("param", ["grupoId", "caseVersionId"])
def test_el_mayor_id_de_la_base_es_valido_aunque_no_exista(profesor, param):
    assert get(profesor, **{param: "2147483647"}).status_code == 404


@pytest.mark.parametrize("param", ["grupoId", "caseVersionId"])
def test_un_parametro_vacio_es_como_no_pedirlo(profesor, param):
    assert get(profesor, **{param: ""}).status_code == 200


def test_el_admin_ve_a_todos_con_la_misma_celda_minima(admin, profesor, other_teacher, version, rubric):
    group, _ = cohort(profesor, version, rubric, 3, label="a")
    cohort(other_teacher, version, rubric, 3, label="b")

    one_group = get(admin, grupoId=group.id).data["data"]
    everyone = get(admin).data["data"]

    assert one_group["cohort"]["suppressed"] is True  # 3 < 5 también para el ADMIN
    assert everyone["cohort"]["students"] >= 6 and everyone["cohort"]["suppressed"] is False


def test_el_admin_puede_pedir_el_grupo_inactivo_de_cualquiera(admin, profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)
    Grupo.objects.filter(pk=group.id).update(activo=False)

    assert get(admin, grupoId=group.id).status_code == 200


# ─── auditoría ────────────────────────────────────────────────────────────────────────────────
def test_cada_consulta_buena_deja_una_auditoria_sin_ids_de_estudiantes_ni_cifras(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 5)
    purge_audit_rows(AuditLog.objects.filter(action="ANALYTICS_VIEWED"))

    get(profesor, grupoId=group.id, caseVersionId=version.id)
    get(profesor)

    rows = list(AuditLog.objects.filter(action="ANALYTICS_VIEWED").order_by("id"))
    assert len(rows) == 2
    for row in rows:
        assert (row.actor_id, row.actor_role, row.resource_type, row.resource_id) == (profesor.id, "PROFESOR", "ANALYTICS", None)
        context = json.loads(row.context_json)
        assert context["taxonomy"] == "analitica.ver"
        assert set(context) == {"method", "class", "taxonomy", "groupId", "caseVersionId", "suppressed"}
    assert json.loads(rows[0].context_json)["groupId"] == group.id
    assert json.loads(rows[0].context_json)["caseVersionId"] == version.id
    assert json.loads(rows[0].context_json)["suppressed"] is False
    assert json.loads(rows[1].context_json)["groupId"] is None and json.loads(rows[1].context_json)["caseVersionId"] is None


def test_la_auditoria_dice_si_la_respuesta_fue_suprimida(profesor, version, rubric):
    group, _ = cohort(profesor, version, rubric, 4)
    purge_audit_rows(AuditLog.objects.filter(action="ANALYTICS_VIEWED"))

    get(profesor, grupoId=group.id)

    (row,) = AuditLog.objects.filter(action="ANALYTICS_VIEWED")
    assert json.loads(row.context_json)["suppressed"] is True


def test_una_consulta_rechazada_no_deja_auditoria(profesor, other_teacher, estudiante, version, rubric):
    foreign, _ = cohort(other_teacher, version, rubric, 5)
    purge_audit_rows(AuditLog.objects.filter(action="ANALYTICS_VIEWED"))

    get(estudiante)
    get(profesor, grupoId=foreign.id)
    get(profesor, grupoId=999999)
    get(profesor, caseVersionId=999999)
    get(profesor, grupoId="abc")

    assert not AuditLog.objects.filter(action="ANALYTICS_VIEWED").exists()


# ─── costo y privacidad ───────────────────────────────────────────────────────────────────────
def test_el_numero_de_consultas_no_depende_de_la_cohorte(profesor, version, rubric):
    small, _ = cohort(profesor, version, rubric, 5, label="s")
    big, _ = cohort(profesor, version, rubric, 25, label="g")

    _, few = measure(lambda: get(profesor, grupoId=small.id))
    _, many = measure(lambda: get(profesor, grupoId=big.id))

    assert few.queries == many.queries
    assert few.writes == many.writes == 1  # la fila de auditoría y nada más


def test_la_respuesta_no_trae_identidad_ni_texto_libre(profesor, version, rubric):
    group, students = cohort(profesor, version, rubric, 5)
    with override_settings(ATTEMPT_FEEDBACK_SURVEY=True):
        body = get(profesor, grupoId=group.id).content.decode("utf-8")

    for who in students:
        assert who.email not in body
    for forbidden in ("texto privado del estudiante", "Buen trabajo", "studentId", "alias", "displayName"):
        assert forbidden not in body
