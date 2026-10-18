"""T15a — Instructor simulation panel (/api/instructor).
Contract-faithful to Spring InstructorSimulationController + InstructorSimulationService.
All endpoints PROFESOR/ADMIN; reflections in the trace are decrypted for review."""
import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion, DecisionOption
from apps.simulation.services import instructor_service

pytestmark = pytest.mark.usefixtures("fetch_raise")  # DJA-7: un acceso perezoso accidental lanza

User = get_user_model()


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def assign_case_to_student(estudiante, case_version_id, codigo="INST-G", profesor=None):
    """Da acceso al estudiante: grupo activo con el caso asignado (requerido por
    la regla de acceso de start_attempt)."""
    if profesor is None:
        profesor = User.objects.create_user(
            email=f"prof_{codigo.lower()}@x.com", password="x",
            nombre="Pro", apellido="Asig", role="PROFESOR",
        )
    grupo = Grupo.objects.create(nombre=f"Grupo {codigo}", codigo=codigo, profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    return grupo


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_inst@x.com", password="x", nombre="Est", apellido="Inst", role="ESTUDIANTE"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_inst@x.com", password="x", nombre="Pro", apellido="Inst", role="PROFESOR"
    )


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


@pytest.fixture
def otro_profesor(db):
    return User.objects.create_user(
        email="prof_otro@x.com", password="x", nombre="Otro", apellido="Pro", role="PROFESOR"
    )


def _play_one_decision(estudiante, case_version_id, codigo="INST", profesor=None):
    assign_case_to_student(estudiante, case_version_id, codigo, profesor=profesor)
    client = cl(estudiante)
    start = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    node_id = start["currentNode"]["id"]
    # leave a reflection (so trace can decrypt it)
    client.post(
        f"/api/simulation/attempts/{attempt_id}/reflections",
        {"attemptToken": token, "nodeId": node_id, "text": "Mi nota clínica"},
        format="json",
    )
    option_id = start["currentNode"]["options"][0]["id"]
    client.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id},
        format="json",
    )
    return attempt_id


# --- permissions -----------------------------------------------------------
def test_recent_forbidden_for_estudiante(estudiante):
    assert cl(estudiante).get("/api/instructor/attempts/recent").status_code == 403


def test_recent_attempts_lists(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-REC", profesor=profesor)
    resp = cl(profesor).get("/api/instructor/attempts/recent")
    assert resp.status_code == 200
    ids = [a["attemptId"] for a in resp.data["data"]]
    assert attempt_id in ids
    mine = next(a for a in resp.data["data"] if a["attemptId"] == attempt_id)
    assert mine["studentAlias"].startswith("Estudiante-")
    assert "email" not in str(mine)  # anonymized


# --- trace -----------------------------------------------------------------
def test_trace_has_events_world_and_decrypted_reflection(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-TRACE", profesor=profesor)
    resp = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace")
    assert resp.status_code == 200
    trace = resp.data["data"]
    assert trace["attemptId"] == attempt_id
    assert trace["studentAlias"].startswith("Estudiante-")
    assert len(trace["events"]) >= 1
    assert trace["world"] is not None and trace["world"]["map"] is not None
    assert any(r["text"] == "Mi nota clínica" for r in trace["reflections"])  # decrypted
    assert isinstance(trace["rubricEvaluations"], list)
    assert trace["totalDurationSeconds"] is not None
    assert len(trace["timeline"]) >= 1


def test_trace_foreign_professor_forbidden(estudiante, profesor, otro_profesor, case_version_id):
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-FOR", profesor=profesor)
    assert cl(otro_profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").status_code == 403


def test_trace_missing_attempt_404(profesor):
    import uuid
    resp = cl(profesor).get(f"/api/instructor/attempts/{uuid.uuid4()}/trace")
    assert resp.status_code == 404


# --- rubric evaluation -----------------------------------------------------
def test_rubric_get_returns_criteria(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-RUBGET", profesor=profesor)
    resp = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation")
    assert resp.status_code == 200
    view = resp.data["data"]
    assert view["rubricId"] is not None
    assert len(view["criteria"]) >= 1
    assert view["scores"] == []
    assert view["totalScore"] is None


def test_save_rubric_evaluation(estudiante, profesor, case_version_id):
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-RUBSAVE", profesor=profesor)
    p = cl(profesor)
    view = p.get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation").data["data"]
    rubric_id = view["rubricId"]
    criteria = view["criteria"]
    scores = [{"criterionId": c["id"], "score": 3, "comment": "ok"} for c in criteria]

    resp = p.post(
        f"/api/instructor/attempts/{attempt_id}/rubric-evaluation",
        {"rubricId": rubric_id, "comment": "Buen desempeño", "scores": scores},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["message"] == "Rubrica guardada"
    saved = resp.data["data"]
    # RN-09 / ED-2: el total numérico no viaja (RUBRIC_NUMERIC_TOTAL apagada); sí el nivel global.
    assert saved["totalScore"] is None
    assert saved["overallLevel"] == "LOGRADO"
    assert saved["comment"] == "Buen desempeño"
    assert len(saved["scores"]) == len(criteria)

    # appears in the trace's rubric evaluations
    trace = p.get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]
    assert len(trace["rubricEvaluations"]) >= 1
    assert trace["rubricEvaluations"][0]["totalScore"] is None
    assert trace["rubricEvaluations"][0]["overallLevel"] == "LOGRADO"


def test_trace_exposes_reconsidered_answers_apart_from_decisions(estudiante, profesor, case_version_id):
    """L-02: la traza del docente trae `retries` y `prohibitedRetries`: la primera respuesta prohibida que el
    juego no aplicó ya no se contradice con el contador de contraindicadas (0), y se distingue en la línea de tiempo."""
    grupo = assign_case_to_student(estudiante, case_version_id, "INST-RETRY", profesor=profesor)
    assert grupo.id
    client = cl(estudiante)
    start = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    client.get(f"/api/simulation/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token)
    for key in ("h1-interrogar-victima", "h1-pap-contencion"):  # prohibida (reintento) y luego la adecuada
        option = DecisionOption.objects.get(case_version_id=case_version_id, option_key=key)
        resp = client.post(
            f"/api/simulation/attempts/{attempt_id}/decisions",
            {"attemptToken": token, "decisionOptionId": option.id}, format="json",
        )
        assert resp.status_code == 200, resp.data

    trace = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]

    assert trace["retries"] == 1
    assert trace["prohibitedRetries"] == 1
    # Los contadores siguen contando solo decisiones registradas.
    assert trace["prohibitedDecisions"] == 0
    assert trace["inadequateDecisions"] == 0
    assert trace["adequateDecisions"] == 1
    retry_rows = [t for t in trace["timeline"] if t["type"].endswith("RETRY_REQUIRED")]
    assert [t["type"] for t in retry_rows] == ["PROHIBITED_DECISION_RETRY_REQUIRED"]
    assert [e["type"] for e in trace["events"] if e["type"].endswith("RETRY_REQUIRED")] == ["PROHIBITED_DECISION_RETRY_REQUIRED"]


# --- E5-6: Revisión docente paginada e IdentityPresenter --------------------
@pytest.mark.req("RF-25", "CU-14", "RQ-NEG-006")
def test_paginated_attempts_filters_and_exceeds_20_without_published_filter(
    estudiante, profesor, case_version_id
):
    import uuid
    from apps.simulation.models import SimulationAttempt, SimulationNode

    grupo = assign_case_to_student(estudiante, case_version_id, "INST-PAG", profesor=profesor)
    published_cv = CaseVersion.objects.select_related("simulation_case").get(pk=case_version_id)
    archived_cv = CaseVersion.objects.create(
        simulation_case=published_cv.simulation_case,
        semantic_version="99.0.0",
        status="ARCHIVED",
        created_by=profesor,
    )
    start_node = SimulationNode.objects.filter(case_version_id=case_version_id, start_node=True).first()

    for i in range(21):
        SimulationAttempt.objects.create(
            attempt_token_hash=uuid.uuid4().hex,
            student=estudiante,
            case_version=published_cv,
            current_node=start_node,
            status="COMPLETED",
            accumulated_score=50 + i,
            active_seconds=120,
        )
    archived_attempt = SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex,
        student=estudiante,
        case_version=archived_cv,
        current_node=start_node,
        status="PAUSED",
        accumulated_score=30,
        active_seconds=45,
    )

    client = cl(profesor)
    all_resp = client.get(f"/api/instructor/attempts?grupoId={grupo.id}")
    assert all_resp.status_code == 200
    payload = all_resp.data["data"]
    assert payload["coverage"] == {"shown": 22, "total": 22}
    assert any(item["attemptId"] == str(archived_attempt.id) for item in payload["items"])

    page1 = client.get(f"/api/instructor/attempts?grupoId={grupo.id}&page=1&pageSize=10").data["data"]
    assert page1["coverage"] == {"shown": 10, "total": 22}
    assert page1["page"] == 1
    assert page1["pageSize"] == 10

    paused_only = client.get(
        f"/api/instructor/attempts?grupoId={grupo.id}&estudianteId={estudiante.id}"
        f"&caseVersionId={archived_cv.id}&estado=PAUSED"
    ).data["data"]
    assert paused_only["coverage"] == {"shown": 1, "total": 1}
    assert paused_only["items"][0]["attemptId"] == str(archived_attempt.id)
    assert paused_only["items"][0]["caseVersionStatus"] == "ARCHIVED"


@pytest.mark.req("RF-25", "CU-14")
def test_paginated_attempts_forbids_foreign_group(estudiante, profesor, otro_profesor, case_version_id):
    grupo = assign_case_to_student(estudiante, case_version_id, "INST-FOR-GRP", profesor=profesor)
    resp = cl(otro_profesor).get(f"/api/instructor/attempts?grupoId={grupo.id}")
    assert resp.status_code == 403


@pytest.mark.req("RF-25", "CU-14", "RQ-NEG-006")
def test_identity_presenter_stable_alias_per_instructor_and_dashboard_links_attempt(
    estudiante, profesor, otro_profesor, case_version_id
):
    from shared.identity import IdentityPresenter

    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-IDP", profesor=profesor)
    alias_p1 = IdentityPresenter.alias_for(estudiante.id, viewer=profesor)
    alias_p2 = IdentityPresenter.alias_for(estudiante.id, viewer=otro_profesor)
    assert alias_p1.startswith("Estudiante-")
    assert alias_p1 != f"Estudiante-{estudiante.id}"
    assert alias_p1 != alias_p2

    trace_data = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]
    assert trace_data["studentAlias"] == alias_p1

    dash = cl(profesor).get("/api/reportes/dashboard").data["data"]
    row = next(i for i in dash["ultimosIntentos"] if i["attemptId"] == attempt_id)
    assert row["id"] == attempt_id
    assert row["estudiante"] == "Est Inst"
    assert row["studentAlias"] == alias_p1


# --- Reparación de E5-6: un solo alias, sin el id al lado, y un estado desconocido es un error -------------
def _review_rows(client, query=""):
    return client.get(f"/api/instructor/attempts{query}").data["data"]["items"]


@pytest.mark.req("RF-25", "CU-14", "RQ-NEG-006")
def test_el_alias_del_mismo_estudiante_es_el_mismo_en_todas_las_vistas_del_docente(
    estudiante, profesor, case_version_id
):
    """ED-8: «alias estable en la traza». Filtrar por grupo no lo cambia (con el grupo en el cálculo, el mismo
    estudiante aparecía con dos alias distintos según desde dónde se mirara)."""
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-ALI", profesor=profesor)
    grupo = Grupo.objects.get(codigo="INST-ALI")
    client = cl(profesor)

    def mine(rows):
        return next(r for r in rows if r["attemptId"] == attempt_id)

    aliases = {
        "listado": mine(_review_rows(client))["studentAlias"],
        "listado de un grupo": mine(_review_rows(client, f"?grupoId={grupo.id}"))["studentAlias"],
        "traza": client.get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]["studentAlias"],
        "recientes": mine(client.get("/api/instructor/attempts/recent").data["data"])["studentAlias"],
        "tablero": mine(client.get("/api/reportes/dashboard").data["data"]["ultimosIntentos"])["studentAlias"],
    }

    assert len(set(aliases.values())) == 1, aliases


@pytest.mark.req("RF-25", "CU-14", "RQ-NEG-006")
def test_el_listado_de_revision_solo_identifica_al_estudiante_por_su_alias(estudiante, profesor, case_version_id):
    """El alias existe para no exponer la clave del estudiante: el id al lado lo anula."""
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-NOID", profesor=profesor)

    row = next(r for r in _review_rows(cl(profesor)) if r["attemptId"] == attempt_id)

    assert [key for key in row if key.lower().startswith("student")] == ["studentAlias"]


@pytest.mark.req("RF-25", "CU-14")
def test_el_filtro_por_estudiante_respeta_el_alcance_del_docente(estudiante, profesor, otro_profesor, case_version_id):
    """El docente conoce los ids por sus grupos: filtrar por uno que no es suyo no devuelve nada."""
    attempt_id = _play_one_decision(estudiante, case_version_id, "INST-ESC", profesor=profesor)

    own = cl(profesor).get(f"/api/instructor/attempts?estudianteId={estudiante.id}").data["data"]
    other = cl(otro_profesor).get(f"/api/instructor/attempts?estudianteId={estudiante.id}").data["data"]

    assert [r["attemptId"] for r in own["items"]] == [attempt_id]
    assert other["items"] == [] and other["coverage"] == {"shown": 0, "total": 0}


@pytest.mark.req("RF-25", "CU-14")
def test_una_pagina_desmesurada_es_un_parametro_invalido_y_no_un_error_del_servidor(db):
    """Un `OFFSET` fuera del rango de la base daba un 500 (con un docente sin grupos la lista vacía ni llega a la base)."""
    admin = User.objects.create_user(email="adm_inst@x.com", password="x", nombre="Ad", apellido="Inst", role="ADMIN")

    resp = cl(admin).get("/api/instructor/attempts", {"page": "99999999999999999999"})

    assert resp.status_code == 400
    assert resp.data["code"] == "INVALID_QUERY_PARAM"


@pytest.mark.req("RF-25", "CU-14")
def test_la_ultima_pagina_permitida_responde_una_lista_vacia(db):
    admin = User.objects.create_user(email="adm_inst2@x.com", password="x", nombre="Ad", apellido="Inst", role="ADMIN")

    last = cl(admin).get("/api/instructor/attempts", {"page": instructor_service.MAX_PAGE})
    beyond = cl(admin).get("/api/instructor/attempts", {"page": instructor_service.MAX_PAGE + 1})

    assert last.status_code == 200 and last.data["data"]["items"] == []
    assert beyond.status_code == 400


@pytest.mark.req("RF-25", "CU-14")
@pytest.mark.parametrize("param", ["estado", "status"])
def test_un_estado_desconocido_es_un_error_y_no_una_lista_vacia(profesor, param):
    """Una lista vacía por un estado mal escrito se lee como «no hay intentos»."""
    resp = cl(profesor).get(f"/api/instructor/attempts?{param}=NOEXISTE")

    assert resp.status_code == 400
    assert resp.data["code"] == "INVALID_QUERY_PARAM"
