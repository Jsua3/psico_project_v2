"""E5-10 (reparación) · Cierre del plan estructural: las banderas del contrato y el ciclo completo con todas estrictas.

``CONTRACT_FLAGS_REGISTRY`` (§2.8) lista las banderas del contrato ``expand → migrate → contract``. Esta prueba exige
que cada una diga qué la bloquea hoy y quién la retira, y recorre el ciclo REAL de punta a punta con todas en su valor
final: un borrador válido (copia del caso sembrado), la ``revision`` obligatoria, la publicación solo por revisión y
con constancia, la invitación que espera respuesta, la asignación, el intento sin ``forceNew`` y la decisión sin
clasificación. Y comprueba que cada bandera, en su valor heredado, conserva el comportamiento de antes: es lo que
protege a los clientes que todavía no migraron.
"""
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion, DecisionOption, Rubric, SimulationAttempt

from .publication_support import give_support_resource

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-07")]

User = get_user_model()
AUTHORING = "/api/authoring/cases"
CHECKLIST = {
    "contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True, "noStigmatizing": True,
    "triggerWarnings": True, "accessibilityOk": True, "scopeEducational": True,
}
EXPECTED_FLAGS = {
    "ATTEMPT_START_STRICT": True,
    "FEEDBACK_AT_CLOSE_ONLY": True,
    "RUBRIC_NUMERIC_TOTAL": False,
    "REVIEW_WORKFLOW_STRICT": True,
    "REVISION_REQUIRED": True,
    "INVITATIONS_AUTO_ACCEPT": False,
}
#: Las que ya arrancan en su valor final: dos porque el cliente migró (F9-10) y dos que su valor final es el apagado.
FINAL_BY_DEFAULT = {"REVIEW_WORKFLOW_STRICT", "REVISION_REQUIRED", "RUBRIC_NUMERIC_TOTAL", "INVITATIONS_AUTO_ACCEPT"}


def cl(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def with_revision(response) -> dict:
    """La cabecera con la revisión que devolvió la última respuesta del editor."""
    return {"HTTP_X_CASE_REVISION": str(response.data["data"]["revision"])}


def current_revision(admin, case_version_id) -> dict:
    """La cabecera con la revisión vigente del borrador (las respuestas del ciclo de vida no la traen)."""
    return with_revision(admin.get(f"{AUTHORING}/{case_version_id}/editor"))


@pytest.fixture
def world(db):
    make = User.objects.create_user
    admin = make(email="cierre_admin@x.com", password="x", nombre="Ad", apellido="Cierre", role="ADMIN")
    profesor = make(email="cierre_prof@x.com", password="x", nombre="Pro", apellido="Cierre", role="PROFESOR")
    student = make(email="cierre_est@x.com", password="x", nombre="Est", apellido="Cierre", role="ESTUDIANTE")
    return SimpleNamespace(
        admin=admin, profesor=profesor, student=student,
        grupo=Grupo.objects.create(nombre="Grupo de cierre", codigo="CIERRE", profesor=profesor),
        seeded=CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED"),
    )


def _set_flags(settings, *, strict: bool) -> None:
    """Todas en su valor final (``strict=True``) o todas en el heredado (el opuesto)."""
    for name, meta in settings.CONTRACT_FLAGS_REGISTRY.items():
        setattr(settings, name, meta["target_contract"] if strict else not meta["target_contract"])


def _draft_copy(world):
    """Un borrador completo y válido: la copia del caso sembrado (el editor de hoy parte de una igual)."""
    response = cl(world.admin).post(f"{AUTHORING}/{world.seeded.id}/clone-version", {}, format="json")
    assert response.status_code == 200, response.data
    give_support_resource(response.data["data"]["caseVersionId"])  # S3-3: la lista marca «protocolos de seguridad»
    return response


def _assign_and_enroll(world, version_id, settings):
    """El docente asigna la versión al grupo y el estudiante entra (aceptando si la invitación espera respuesta)."""
    invited = cl(world.profesor).post(f"/api/grupos/{world.grupo.id}/estudiantes", {"email": world.student.email}, format="json")
    assert invited.status_code == 200, invited.data
    status = GrupoEstudiante.objects.get(grupo_id=world.grupo.id, estudiante_id=world.student.id).status
    if status == "INVITED":
        assert cl(world.student).post(f"/api/me/invitations/{world.grupo.id}/accept", {}, format="json").status_code == 200
    assigned = cl(world.profesor).post(
        "/api/assignments",
        {"caseVersionId": version_id, "target": {"type": "GROUP", "groupId": world.grupo.id}, "sortOrder": 0},
        format="json",
    )
    assert assigned.status_code == 201, assigned.data
    return status


def _start(world, version_id, **extra):
    return cl(world.student).post("/api/simulation/attempts", {"caseVersionId": version_id, **extra}, format="json")


def _adequate_option(started) -> int:
    """Una opción adecuada de la escena de inicio: la prohibida no se aplica (es un reintento) y no tiene consecuencia."""
    options = started.data["data"]["currentNode"]["options"]
    adequate = [o["id"] for o in options if DecisionOption.objects.get(pk=o["id"]).classification == "ADEQUATE"]
    return (adequate or [options[0]["id"]])[0]


def _decide(world, started):
    data = started.data["data"]
    return cl(world.student).post(
        f"/api/simulation/attempts/{data['attemptId']}/decisions",
        {"attemptToken": data["attemptToken"], "decisionOptionId": _adequate_option(started), "evidenceOverride": True},
        format="json",
    )


# ─── El registro ──────────────────────────────────────────────────────────────────────────────
def test_el_registro_dice_de_cada_bandera_su_estado_final_que_la_bloquea_y_quien_la_retira(settings):
    registry = settings.CONTRACT_FLAGS_REGISTRY

    assert set(registry) == set(EXPECTED_FLAGS)
    for name, target in EXPECTED_FLAGS.items():
        entry = registry[name]
        assert hasattr(settings, name), f"Falta {name} en settings"
        assert entry["target_contract"] is target
        assert entry["env"] == f"SIEP_{name}"
        assert entry["owner"].strip(), f"{name}: ¿quién la retira?"
        assert entry["retirement_gate"].strip()
        # Las que ya arrancan en su estado final no tienen nada que las bloquee; las demás dicen qué las bloquea hoy.
        assert bool(entry["blocked_by"]) is (name not in FINAL_BY_DEFAULT), (
            f"{name}: blocked_by debe decir qué la bloquea (o estar vacío si ya arranca en su valor final)"
        )


def test_cada_bandera_arranca_en_su_valor_final_si_el_cliente_ya_migro_y_en_el_heredado_si_no():
    """El valor de arranque en despliegue (los ajustes base, sin la fijación de la suite unitaria)."""
    import importlib

    base = importlib.import_module("psychosim.settings.base")
    started = {name: getattr(base, name) for name in EXPECTED_FLAGS}
    expected = {
        name: target if name in FINAL_BY_DEFAULT else not target for name, target in EXPECTED_FLAGS.items()
    }
    assert started == expected


@pytest.mark.skipif(os.environ.get("SIEP_TEST_FINAL_FLAGS") == "1", reason="se pidió el valor final (conftest.py)")
def test_la_suite_unitaria_corre_las_banderas_encendidas_en_su_valor_heredado(settings):
    """La fijación de ``conftest.py``: lo que cada prueba ve mientras no diga otra cosa."""
    assert (settings.REVISION_REQUIRED, settings.REVIEW_WORKFLOW_STRICT) == (False, False)


# ─── El ciclo completo, con todas las banderas en su valor final ──────────────────────────────
def test_el_ciclo_completo_con_todas_las_banderas_estrictas(world, settings):
    _set_flags(settings, strict=True)
    admin = cl(world.admin)

    # 1 · Un borrador válido; sin la revisión que el editor vio, la mutación se rechaza (REVISION_REQUIRED).
    cloned = _draft_copy(world)
    draft_id = cloned.data["data"]["caseVersionId"]
    missing = admin.put(f"{AUTHORING}/{draft_id}/brief", {"context": "Sin revisión."}, format="json")
    assert missing.status_code == 400 and missing.data["code"] == "REVISION_REQUIRED"
    briefed = admin.put(
        f"{AUTHORING}/{draft_id}/brief", {"context": "Contexto con revisión.", "learningObjectives": ["Uno."]},
        format="json", **with_revision(cloned),
    )
    assert briefed.status_code == 200, briefed.data

    # 2 · Publicar un borrador a secas se rechaza: la publicación pasa por revisión (REVIEW_WORKFLOW_STRICT).
    direct = admin.post(f"{AUTHORING}/{draft_id}/publish", {}, format="json", **with_revision(briefed))
    assert direct.status_code == 409 and direct.data["code"] == "REVIEW_REQUIRED"

    # 3 · Enviar a revisión, aprobar SIN constancia se rechaza y CON ella publica.
    listed = admin.put(f"{AUTHORING}/{draft_id}/checklist", CHECKLIST, format="json", **with_revision(briefed))
    assert listed.status_code == 200, listed.data
    submitted = admin.post(f"{AUTHORING}/{draft_id}/lifecycle", {"action": "submit"}, format="json", **with_revision(listed))
    assert submitted.status_code == 200, submitted.data
    no_record = admin.post(
        f"{AUTHORING}/{draft_id}/lifecycle", {"action": "approve", "note": "Sin constancia."}, format="json",
        **current_revision(admin, draft_id),
    )
    # S3-3: sin constancia la compuerta no publica (CASE_NOT_PUBLISHABLE con ETHICS.NO_CONTENT_REVIEW en los bloqueos).
    assert no_record.status_code == 409 and no_record.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert [issue["code"] for blocker in no_record.data["blockers"] for issue in blocker["issues"]] == [
        "ETHICS.NO_CONTENT_REVIEW"
    ]
    content_review = {"reviewer": "Dra. Ruiz", "reviewedOn": timezone.now().date().isoformat(), "reference": "Acta 4"}
    approved = admin.post(
        f"{AUTHORING}/{draft_id}/lifecycle",
        {"action": "approve", "note": "Cumple.", "contentReview": content_review}, format="json",
        **current_revision(admin, draft_id),
    )
    assert approved.status_code == 200, approved.data
    assert CaseVersion.objects.get(pk=draft_id).status == "PUBLISHED"

    # 4 · La invitación espera la respuesta del estudiante (INVITATIONS_AUTO_ACCEPT apagada) y el docente asigna el caso.
    invited_state = _assign_and_enroll(world, draft_id, settings)
    assert invited_state == "INVITED"

    # 5 · El estudiante empieza sin forceNew; con uno abierto, forceNew es un 409 que dice cuál (ATTEMPT_START_STRICT).
    started = _start(world, draft_id)
    assert started.status_code in (200, 201), started.data
    attempt_id = started.data["data"]["attemptId"]
    forced = _start(world, draft_id, forceNew=True)
    assert forced.status_code == 409 and forced.data["code"] == "ATTEMPT_ALREADY_OPEN"
    assert str(forced.data["existingAttemptId"]) == str(attempt_id)

    # 6 · La decisión no trae lo evaluativo (clasificación, deltas, mensaje): llega al cierre (FEEDBACK_AT_CLOSE_ONLY).
    decided = _decide(world, started)
    assert decided.status_code == 200, decided.data
    payload = decided.data["data"]
    assert set(payload) == {"attempt", "consequence"}
    assert payload["attempt"]["feedback"] is None
    assert payload["consequence"]["text"]

    # 7 · La evaluación del docente es formativa: sin total numérico (RUBRIC_NUMERIC_TOTAL apagada).
    teacher = cl(world.profesor)
    view = teacher.get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation").data["data"]
    saved = teacher.post(
        f"/api/instructor/attempts/{attempt_id}/rubric-evaluation",
        {"rubricId": view["rubricId"], "scores": [{"criterionId": c["id"], "score": 3} for c in view["criteria"]]},
        format="json",
    )
    assert saved.status_code == 200, saved.data
    assert saved.data["data"]["totalScore"] is None and saved.data["data"]["overallLevel"]


def test_con_la_revision_obligatoria_una_ruta_que_no_es_de_autoria_no_la_pide(world, settings):
    """``/api/rubrics/{id}`` edita una rúbrica de la VERSIÓN en borrador, pero su cuerpo no lleva la revisión del caso.

    Con ``REVISION_REQUIRED`` encendida el servidor no puede pedir un dato que esa ruta no tiene: el cliente de las
    rúbricas no tendría con qué obedecer (400 ``REVISION_REQUIRED`` sin salida).
    """
    _set_flags(settings, strict=True)
    draft_id = _draft_copy(world).data["data"]["caseVersionId"]
    rubric = Rubric.objects.create(
        case_version_id=draft_id, name="De la versión", description="", version="1.0", active=False,
        created_by=world.admin,
    )

    renamed = cl(world.admin).put(f"/api/rubrics/{rubric.id}", {"name": "Renombrada"}, format="json")

    assert renamed.status_code == 200, renamed.data
    assert Rubric.objects.get(pk=rubric.id).name == "Renombrada"


# ─── Cada bandera en su valor heredado conserva el comportamiento de antes ────────────────────
def _legacy_attempt_start(world, settings):
    version = world.seeded
    _assign_and_enroll(world, version.id, settings)
    first = _start(world, version.id)
    replaced = _start(world, version.id, forceNew=True)
    assert replaced.status_code in (200, 201), replaced.data
    assert replaced.data["data"]["attemptId"] != first.data["data"]["attemptId"]
    assert SimulationAttempt.objects.get(pk=first.data["data"]["attemptId"]).status == "REPLACED"


def _legacy_feedback(world, settings):
    _assign_and_enroll(world, world.seeded.id, settings)
    decided = _decide(world, _start(world, world.seeded.id))
    assert decided.status_code == 200, decided.data
    feedback = decided.data["data"]["feedback"]
    assert feedback["classification"] and feedback["message"]


def _legacy_review(world, settings):
    cloned = _draft_copy(world)
    draft_id = cloned.data["data"]["caseVersionId"]
    listed = cl(world.admin).put(f"{AUTHORING}/{draft_id}/checklist", CHECKLIST, format="json", **with_revision(cloned))
    published = cl(world.admin).post(f"{AUTHORING}/{draft_id}/publish", {}, format="json", **with_revision(listed))
    assert published.status_code == 200, published.data
    assert CaseVersion.objects.get(pk=draft_id).status == "PUBLISHED"


def _legacy_revision(world, settings):
    cloned = _draft_copy(world)
    briefed = cl(world.admin).put(
        f"{AUTHORING}/{cloned.data['data']['caseVersionId']}/brief", {"context": "Sin revisión."}, format="json",
    )
    assert briefed.status_code == 200, briefed.data


def _legacy_rubric_total(world, settings):
    _assign_and_enroll(world, world.seeded.id, settings)
    started = _start(world, world.seeded.id)
    attempt_id = started.data["data"]["attemptId"]
    teacher = cl(world.profesor)
    view = teacher.get(f"/api/instructor/attempts/{attempt_id}/rubric-evaluation").data["data"]
    saved = teacher.post(
        f"/api/instructor/attempts/{attempt_id}/rubric-evaluation",
        {"rubricId": view["rubricId"], "scores": [{"criterionId": c["id"], "score": 3} for c in view["criteria"]]},
        format="json",
    )
    assert saved.data["data"]["totalScore"] == 3.0


def _legacy_invitation(world, settings):
    invited = cl(world.profesor).post(f"/api/grupos/{world.grupo.id}/estudiantes", {"email": world.student.email}, format="json")
    assert invited.status_code == 200, invited.data
    assert GrupoEstudiante.objects.get(grupo_id=world.grupo.id, estudiante_id=world.student.id).status == "ACTIVE"


LEGACY = {
    "ATTEMPT_START_STRICT": _legacy_attempt_start,
    "FEEDBACK_AT_CLOSE_ONLY": _legacy_feedback,
    "REVIEW_WORKFLOW_STRICT": _legacy_review,
    "REVISION_REQUIRED": _legacy_revision,
    "RUBRIC_NUMERIC_TOTAL": _legacy_rubric_total,
    "INVITATIONS_AUTO_ACCEPT": _legacy_invitation,
}


def test_cada_bandera_tiene_su_prueba_del_comportamiento_heredado():
    assert set(LEGACY) == set(EXPECTED_FLAGS)


@pytest.mark.parametrize("flag", sorted(LEGACY))
def test_una_bandera_en_su_valor_heredado_conserva_el_comportamiento_de_antes(flag, world, settings):
    """Solo ELLA en su valor heredado (las demás quedan como las deja la suite unitaria: las dos ya encendidas, en el
    heredado por ``conftest.py``): lo que el cliente de antes esperaba."""
    setattr(settings, flag, not settings.CONTRACT_FLAGS_REGISTRY[flag]["target_contract"])

    LEGACY[flag](world, settings)
