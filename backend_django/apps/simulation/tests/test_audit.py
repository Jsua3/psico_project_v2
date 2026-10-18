"""T16 — Audit trail. Django parity with Spring @Auditable + AuditLogAdapter +
AuditLogCleanupScheduler. Audit is written AFTER a successful operation, never on
failure, never breaking the business op; retention is occurred_at + 360 days; a
management command purges expired rows."""
import json
from datetime import datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import AuditLog, CaseVersion

User = get_user_model()
ADMIN_BASE = "/api/admin/cases"


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def assign_case_to_student(estudiante, case_version_id, codigo="AUDIT-G"):
    """Acceso del estudiante al caso (grupo activo + caso asignado)."""
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
        email="est_audit@x.com", password="x", nombre="Est", apellido="Audit", role="ESTUDIANTE"
    )


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_audit@x.com", password="x", nombre="Ad", apellido="Audit", role="ADMIN"
    )


@pytest.fixture
def published_cv(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


# --- game-flow auditing ----------------------------------------------------
def test_attempt_started_is_audited(estudiante, published_cv):
    assign_case_to_student(estudiante, published_cv, "AUDIT-START")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": published_cv}, format="json").data["data"]
    row = AuditLog.objects.filter(
        action="ATTEMPT_STARTED", resource_id=str(published_cv), actor_id=estudiante.id
    ).order_by("-id").first()
    assert row is not None
    assert row.resource_type == "CASE_VERSION"
    assert row.actor_role == "ESTUDIANTE"
    # retention window ≈ 360 days
    assert abs((row.retention_until - row.occurred_at).total_seconds() - 360 * 86400) < 10


def test_decision_is_audited_with_attempt_resource(estudiante, published_cv):
    assign_case_to_student(estudiante, published_cv, "AUDIT-DEC")
    c = cl(estudiante)
    start = c.post("/api/simulation/attempts", {"caseVersionId": published_cv}, format="json").data["data"]
    token, attempt_id = start["attemptToken"], start["attemptId"]
    option_id = start["currentNode"]["options"][0]["id"]
    c.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option_id},
        format="json",
    )
    row = AuditLog.objects.filter(action="DECISION_SELECTED", resource_id=attempt_id).first()
    assert row is not None
    assert row.resource_type == "ATTEMPT"
    assert row.actor_id == estudiante.id


# --- authoring auditing ----------------------------------------------------
def test_clone_and_create_node_are_audited(admin, published_cv):
    a = cl(admin)
    clone_id = a.post(f"{ADMIN_BASE}/{published_cv}/clone-version").data["data"]["caseVersionId"]
    assert AuditLog.objects.filter(
        action="ADMIN_CLONE_VERSION", resource_id=str(published_cv), actor_id=admin.id
    ).exists()

    created = a.post(
        f"{ADMIN_BASE}/{clone_id}/nodes",
        {"nodeKey": "extra", "title": "Extra", "narrative": "N",
         "requiredTools": [], "supportResources": []},
        format="json",
    ).data["data"]
    node_row = AuditLog.objects.filter(
        action="ADMIN_CREATE_NODE", resource_id=str(clone_id), actor_id=admin.id
    ).first()
    assert node_row is not None
    assert node_row.resource_type == "CASE_VERSION"

    # update uses the NODE id as resource (resourceIdParamIndex = 1)
    new_node = next(n for n in created["nodes"] if n["key"] == "extra")
    a.put(
        f"{ADMIN_BASE}/{clone_id}/nodes/{new_node['id']}",
        {"nodeKey": "extra", "title": "Extra2", "narrative": "N"},
        format="json",
    )
    upd = AuditLog.objects.filter(action="ADMIN_UPDATE_NODE", resource_id=str(new_node["id"])).first()
    assert upd is not None
    assert upd.resource_type == "NODE"


def test_failed_mutation_writes_no_audit(admin, published_cv):
    a = cl(admin)
    before = AuditLog.objects.filter(
        action="ADMIN_CREATE_NODE", resource_id=str(published_cv)
    ).count()
    # published version -> ensureDraft rejects (400) before any audit
    resp = a.post(
        f"{ADMIN_BASE}/{published_cv}/nodes",
        {"nodeKey": "x", "title": "t", "narrative": "n"},
        format="json",
    )
    assert resp.status_code == 400
    after = AuditLog.objects.filter(
        action="ADMIN_CREATE_NODE", resource_id=str(published_cv)
    ).count()
    assert after == before


# --- retention purge command -----------------------------------------------
def test_purge_audit_logs_command(db):
    now = timezone.now()
    AuditLog.objects.create(
        action="TEST_PURGE_OLD", actor_role="SYSTEM", retention_until=now - timedelta(days=1)
    )
    AuditLog.objects.create(
        action="TEST_PURGE_FUTURE", actor_role="SYSTEM", retention_until=now + timedelta(days=30)
    )
    call_command("purge_audit_logs")
    assert not AuditLog.objects.filter(action="TEST_PURGE_OLD").exists()
    assert AuditLog.objects.filter(action="TEST_PURGE_FUTURE").exists()


# --- E5-7: Taxonomía entidad.verbo, lectura /api/admin/audit y alarma del sello ---
@pytest.mark.req("SIEP-RNF-02", "RNF-007", "TD-16")
def test_admin_audit_endpoint_filters_pagination_and_permissions(estudiante, admin, published_cv):
    from apps.simulation.services.audit_service import canonical_action

    assert canonical_action("MEMBERSHIP_INVITED") == "grupo.invitar"
    assert canonical_action("ATTEMPT_REPLACED") == "intento.reemplazar"
    assert canonical_action("ANALYTICS_VIEWED") == "analitica.ver"
    assert canonical_action("CASE_CREATED") == "caso.crear"

    grupo = assign_case_to_student(estudiante, published_cv, "AUDIT-E57")
    c_est = cl(estudiante)
    start = c_est.post("/api/simulation/attempts", {"caseVersionId": published_cv}, format="json").data["data"]
    attempt_id = start["attemptId"]

    profesor = grupo.profesor
    assert c_est.get("/api/admin/audit").status_code == 403
    assert cl(profesor).get("/api/admin/audit").status_code == 403

    # El docente lee la traza -> genera evento traza.leer
    trace_resp = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace")
    assert trace_resp.status_code == 200

    c_admin = cl(admin)
    by_taxonomy = c_admin.get(
        f"/api/admin/audit?action=intento.iniciar&actorId={estudiante.id}&resourceType=CASE_VERSION"
    )
    assert by_taxonomy.status_code == 200
    data = by_taxonomy.data["data"]
    assert data["coverage"]["total"] >= 1
    assert data["items"][0]["taxonomy"] == "intento.iniciar"
    assert data["items"][0]["actorId"] == estudiante.id

    trace_audit = c_admin.get(f"/api/admin/audit?action=traza.leer&actorId={profesor.id}").data["data"]
    assert trace_audit["coverage"]["total"] >= 1
    assert trace_audit["items"][0]["taxonomy"] == "traza.leer"
    assert trace_audit["items"][0]["resourceId"] == str(attempt_id)


@pytest.mark.req("SIEP-RNF-02", "RNF-007")
def test_configurable_retention_and_review_quality_rubber_stamp_alarm(settings, admin, published_cv):
    from apps.simulation.models import CaseReview
    from apps.simulation.services import audit_service

    settings.AUDIT_RETENTION_DAYS = 730
    assert audit_service.retention_days() == 730
    settings.AUDIT_RETENTION_DAYS = 90  # nunca menor a 12 meses (360 días)
    assert audit_service.retention_days() == 360

    cv = CaseVersion.objects.get(pk=published_cv)
    CaseReview.objects.all().delete()
    for _ in range(4):
        CaseReview.objects.create(
            case_version=cv,
            requested_by=admin,
            decided_by=admin,
            decision="APPROVED",
        )
    CaseReview.objects.create(
        case_version=cv,
        requested_by=admin,
        decided_by=admin,
        decision="REJECTED",
        reason="FORMA",
        note="Ajustar ortografía",
    )

    resp = cl(admin).get("/api/admin/audit?page=1&pageSize=5").data["data"]
    rq = resp["reviewQuality"]
    assert rq["decidedReviews"] == 5
    assert rq["rejectedByForm"] == 1
    assert rq["rejectedByContent"] == 0
    assert rq["rubberStampAlarm"] is True

    CaseReview.objects.create(
        case_version=cv,
        requested_by=admin,
        decided_by=admin,
        decision="REJECTED",
        reason="CONTENIDO",
        note="Corregir enfoque clínico",
    )
    rq_after = cl(admin).get("/api/admin/audit?page=1&pageSize=5").data["data"]["reviewQuality"]
    assert rq_after["rejectedByContent"] == 1
    assert rq_after["rubberStampAlarm"] is False


# --- Reparación de E5-7: los filtros de fecha convierten la zona -------------------------------------------
def _audit_row_at(admin, when, *, resource_type):
    row = AuditLog.objects.create(
        actor=admin, actor_role="ADMIN", action="CASE_CREATED", resource_type=resource_type, resource_id="tz-1",
        retention_until=when + timedelta(days=360),
    )
    AuditLog.objects.filter(pk=row.pk).update(occurred_at=when)  # auto_now_add pisa el valor dado al crear
    return row


@pytest.mark.req("SIEP-RNF-02", "RNF-007")
def test_los_filtros_from_y_to_de_la_auditoria_convierten_la_zona(admin):
    """La auditoría se guarda en hora local (America/Bogota, USE_TZ=False): un instante con zona se convierte a
    ella; no se le quita la zona (con «Z» la ventana se corría cinco horas)."""
    _audit_row_at(admin, datetime(2026, 10, 17, 15, 0, 0), resource_type="TZ_PRUEBA")  # 15:00 en Bogotá
    client = cl(admin)

    def hits(frm, to):
        query = {"resourceType": "TZ_PRUEBA", "from": frm, "to": to}
        return client.get("/api/admin/audit", query).data["data"]["coverage"]["total"]

    assert hits("2026-10-17T20:00:00Z", "2026-10-17T20:00:01Z") == 1  # 20:00 UTC = 15:00 en Bogotá
    assert hits("2026-10-17T15:00:00-05:00", "2026-10-17T15:00:01-05:00") == 1  # con el desfase explícito
    assert hits("2026-10-17T15:00:00", "2026-10-17T15:00:01") == 1  # sin zona: hora local de Bogotá
    assert hits("2026-10-17T15:00:00Z", "2026-10-17T15:00:01Z") == 0  # eso son las 10:00 en Bogotá


@pytest.mark.req("SIEP-RNF-02", "RNF-007")
def test_una_fecha_con_zona_fuera_de_rango_es_un_parametro_invalido_y_no_un_error_del_servidor(admin):
    """Convertir la zona puede salirse del calendario (año 1 con -05:00): eso es un 400, no un 500."""
    resp = cl(admin).get("/api/admin/audit", {"from": "0001-01-01T00:00:00Z"})

    assert resp.status_code == 400
    assert resp.data["code"] == "INVALID_QUERY_PARAM"


@pytest.mark.req("SIEP-RNF-02", "RNF-007")
def test_la_lectura_de_la_auditoria_nunca_devuelve_texto_que_escribio_una_persona(admin):
    """Las filas que el asistente guardó antes de dejar de guardar la pregunta no se la entregan a quien lee."""
    AuditLog.objects.create(
        action="AI_ASSISTANT_QUERY", resource_type="SimulationAttempt", resource_id="a-1",
        context_json=json.dumps({"question": "texto libre de una estudiante", "node": 7, "response_length": 4}),
        retention_until=datetime(2027, 10, 17),
    )

    items = cl(admin).get("/api/admin/audit", {"action": "asistente.consultar"}).data["data"]["items"]

    assert [i["context"] for i in items] == [{"node": 7, "response_length": 4}]
