"""P5 · Tarea 2 · Las rutas del asistente de autoría: permisos, límites, fallos del proveedor y auditoría.

Las rutas cuelgan de ``…/cases/{id}/assistant/{status,propose,guide}``. Los cuerpos de ``propose`` y ``guide`` son de
las tareas 3 y 4: aquí el «proveedor simulado» es un reemplazo de ``proposals.propose`` / ``guide.answer``. Una sola
prueba deja pasar la llamada hasta ``AnthropicProvider.complete_structured`` para probar que un ``ProviderError``
se vuelve 502, devuelve el cupo y deja su fila de auditoría sin la clave.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, AuthoringAssistantUsage, CaseVersion
from apps.simulation.services.ai_providers import AnthropicProvider, ProviderError
from apps.simulation.services.authoring.assistant import guide, limits, proposals
from shared.testing import run_concurrently

User = get_user_model()
AUTHORING = "/api/authoring/cases"
LEGACY = "/api/admin/cases"
KEY = "sk-ant-clave-de-prueba-0123456789"
SECRET_REQUEST = "TEXTO-SECRETO-DE-LA-PETICION"

ON = dict(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY=KEY, AI_AUTHORING_DAILY_LIMIT_PER_USER=5,
          AI_AUTHORING_MONTHLY_LIMIT=100)
DAILY_MESSAGE = "Llegaste al límite de ayuda de la IA por hoy."
MONTHLY_MESSAGE = "El programa agotó la ayuda de la IA de este mes."
PROVIDER_MESSAGE = "La IA no respondió. Inténtalo de nuevo en un momento."
REFUSED_MESSAGE = "La IA no puede ayudar con esa petición. Prueba a pedirla de otra forma."


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def prof(db):
    return _user("asist_prof@x.com", "PROFESOR")


@pytest.fixture
def prof_b(db):
    return _user("asist_prof_b@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db):
    return _user("asist_est@x.com", "ESTUDIANTE")


@pytest.fixture
def admin(db):
    return _user("asist_admin@x.com", "ADMIN")


@pytest.fixture
def cv(prof):
    """El borrador de un caso de ``prof``."""
    response = cl(prof).post(AUTHORING, {"title": "Caso con asistente"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]["caseVersionId"]


@pytest.fixture
def on():
    with override_settings(**ON):
        yield


@pytest.fixture
def fake_provider(monkeypatch):
    """El proveedor simulado: ``propose`` y ``answer`` devuelven un diccionario fijo y cuentan sus llamadas."""
    calls = {"propose": 0, "guide": 0}

    def propose(**kwargs):
        calls["propose"] += 1
        return {"mensaje": "Propuesta simulada", "model": "claude-opus-5-5", "changes": 2}

    def answer(**kwargs):
        calls["guide"] += 1
        return {"mensaje": "Guía simulada", "model": "claude-haiku-5-5", "changes": 0}

    monkeypatch.setattr(proposals, "propose", propose)
    monkeypatch.setattr(guide, "answer", answer)
    return calls


def _propose(client, cv, **extra):
    body = {"peticion": SECRET_REQUEST, "pantalla": "Editor-Mapa", **extra}
    return client.post(f"{AUTHORING}/{cv}/assistant/propose", body, format="json")


def _guide(client, cv, **extra):
    body = {"pregunta": SECRET_REQUEST, "acciones": [], **extra}
    return client.post(f"{AUTHORING}/{cv}/assistant/guide", body, format="json")


def _status(client, cv):
    return client.get(f"{AUTHORING}/{cv}/assistant/status")


def _rows(action):
    return list(AuditLog.objects.filter(action=action))


# ─── apagado ────────────────────────────────────────────────────────────────────────────
@override_settings(AI_AUTHORING_ENABLED=False, AI_AUTHORING_API_KEY=KEY)
def test_without_the_flag_every_route_is_404_and_never_touches_the_provider(prof, cv, fake_provider):
    client = cl(prof)

    for response in (_status(client, cv), _propose(client, cv), _guide(client, cv)):
        assert response.status_code == 404
        assert response.data["message"] == "El asistente no está disponible"
    assert fake_provider == {"propose": 0, "guide": 0}
    assert not AuthoringAssistantUsage.objects.exists()
    assert not AuditLog.objects.filter(action__startswith="AI_AUTHORING").exists()


# ─── permisos ───────────────────────────────────────────────────────────────────────────
def test_a_student_is_403_and_a_foreign_professor_is_403_on_every_route(on, estudiante, prof_b, cv, fake_provider):
    for user in (estudiante, prof_b):
        client = cl(user)
        assert _propose(client, cv).status_code == 403
        assert _guide(client, cv).status_code == 403
    assert _status(cl(estudiante), cv).status_code == 403
    assert fake_provider == {"propose": 0, "guide": 0}


def test_the_owner_and_the_admin_get_through_and_the_alias_serves_the_same(on, prof, admin, cv, fake_provider):
    assert _propose(cl(prof), cv).status_code == 200
    assert _guide(cl(admin), cv).status_code == 200
    response = cl(prof).post(f"{LEGACY}/{cv}/assistant/propose", {"peticion": "x", "pantalla": "p"}, format="json")
    assert response.status_code == 200


def test_a_version_that_is_not_a_draft_is_400(on, admin, fake_provider):
    published = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id

    response = _propose(cl(admin), published)

    assert response.status_code == 400
    assert fake_provider["propose"] == 0
    assert not AuthoringAssistantUsage.objects.exists()


def test_a_version_that_does_not_exist_is_404(on, prof, fake_provider):
    assert _propose(cl(prof), 99999999).status_code == 404


# ─── cuerpo ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "body",
    [{}, {"peticion": "", "pantalla": "p"}, {"peticion": "  ", "pantalla": "p"}, {"peticion": 3, "pantalla": "p"},
     {"peticion": "x"}, {"peticion": "x", "pantalla": 7}, {"peticion": "x", "pantalla": "###"}],
)
def test_a_malformed_propose_body_is_400_and_spends_nothing(on, prof, cv, fake_provider, body):
    response = cl(prof).post(f"{AUTHORING}/{cv}/assistant/propose", body, format="json")

    assert response.status_code == 400
    assert fake_provider["propose"] == 0
    assert not AuthoringAssistantUsage.objects.exists()


@pytest.mark.parametrize("body", [{}, {"pregunta": 1, "acciones": []}, {"pregunta": "x"}, {"pregunta": "x", "acciones": "no"}])
def test_a_malformed_guide_body_is_400(on, prof, cv, fake_provider, body):
    assert cl(prof).post(f"{AUTHORING}/{cv}/assistant/guide", body, format="json").status_code == 400
    assert fake_provider["guide"] == 0


# ─── estado ─────────────────────────────────────────────────────────────────────────────
def test_status_reports_the_mode_and_the_remaining_quota(on, prof, cv, fake_provider):
    client = cl(prof)

    assert _status(client, cv).data["data"] == {"enabled": True, "remainingToday": 5, "mode": "connected"}
    _propose(client, cv)
    _guide(client, cv)
    assert _status(client, cv).data["data"]["remainingToday"] == 3


@override_settings(AI_AUTHORING_ENABLED=True, AI_AUTHORING_API_KEY="", AI_AUTHORING_DAILY_LIMIT_PER_USER=5)
def test_status_without_a_key_is_disabled_mode(prof, cv):
    assert _status(cl(prof), cv).data["data"] == {"enabled": False, "remainingToday": 5, "mode": "disabled"}


# ─── camino feliz y auditoría ───────────────────────────────────────────────────────────
def test_propose_returns_the_result_and_audits_without_the_request_text(on, prof, cv, fake_provider):
    response = _propose(cl(prof), cv, seleccion={"tipo": "objeto"})

    assert response.status_code == 200
    assert response.data["data"]["mensaje"] == "Propuesta simulada"
    row = _rows("AI_AUTHORING_PROPOSE")[0]
    assert row.actor_id == prof.id and row.resource_type == "CASE_VERSION" and row.resource_id == str(cv)
    context = json.loads(row.context_json)
    assert context["taxonomy"] == "asistente_autoria.proponer"
    assert context["screen"] == "editor-mapa"
    assert context["model"] == "claude-opus-5-5"
    assert context["changes"] == 2 and context["outcome"] == "ok" and isinstance(context["duration_ms"], int)
    assert SECRET_REQUEST not in row.context_json and "Propuesta simulada" not in row.context_json


def test_guide_is_audited_with_its_own_action_and_without_the_question(on, prof, cv, fake_provider):
    assert _guide(cl(prof), cv).status_code == 200

    row = _rows("AI_AUTHORING_GUIDE")[0]
    context = json.loads(row.context_json)
    assert context["taxonomy"] == "asistente_autoria.guiar" and context["outcome"] == "ok"
    assert SECRET_REQUEST not in row.context_json


# ─── límites ────────────────────────────────────────────────────────────────────────────
@override_settings(**{**ON, "AI_AUTHORING_DAILY_LIMIT_PER_USER": 2})
def test_past_the_daily_limit_it_is_429_with_the_message_and_no_audit_row(prof, cv, fake_provider):
    client = cl(prof)
    assert _propose(client, cv).status_code == 200
    assert _guide(client, cv).status_code == 200
    audits = AuditLog.objects.filter(action__startswith="AI_AUTHORING").count()

    response = _propose(client, cv)

    assert response.status_code == 429
    assert response.data["code"] == "AI_LIMIT_EXCEEDED" and response.data["message"] == DAILY_MESSAGE
    assert fake_provider == {"propose": 1, "guide": 1}
    assert AuditLog.objects.filter(action__startswith="AI_AUTHORING").count() == audits
    assert _status(client, cv).data["data"]["remainingToday"] == 0


@override_settings(**{**ON, "AI_AUTHORING_MONTHLY_LIMIT": 1})
def test_the_monthly_limit_is_global_across_users(prof, admin, cv, fake_provider):
    assert _propose(cl(prof), cv).status_code == 200

    response = _propose(cl(admin), cv)

    assert response.status_code == 429
    assert response.data["code"] == "AI_LIMIT_EXCEEDED" and response.data["message"] == MONTHLY_MESSAGE


@override_settings(**{**ON, "AI_AUTHORING_DAILY_LIMIT_PER_USER": 2})
def test_the_quota_is_per_user(prof, admin, cv, fake_provider):
    for _ in range(2):
        assert _propose(cl(prof), cv).status_code == 200

    assert _propose(cl(admin), cv).status_code == 200


def test_refund_never_goes_below_zero(prof):
    limits.refund(prof)
    assert not AuthoringAssistantUsage.objects.filter(user=prof, count__lt=0).exists()
    with override_settings(**ON):
        limits.consume(prof)
        limits.refund(prof)
        limits.refund(prof)
    assert AuthoringAssistantUsage.objects.get(user=prof).count == 0


def test_two_simultaneous_requests_at_the_limit_let_exactly_one_through(real_commits):
    suffix = uuid.uuid4().hex[:8]
    user = _user(f"asist_conc_{suffix}@x.com", "PROFESOR")
    try:
        with override_settings(**{**ON, "AI_AUTHORING_DAILY_LIMIT_PER_USER": 3}):
            limits.consume(user)
            limits.consume(user)  # queda un cupo: limit - 1

            outcomes = run_concurrently(lambda: limits.consume(user), lambda: limits.consume(user))

        errors = [o.error for o in outcomes if o.error is not None]
        assert len(errors) == 1 and isinstance(errors[0], limits.LimitExceeded) and errors[0].scope == "daily"
        assert AuthoringAssistantUsage.objects.get(user=user).count == 3
    finally:
        user.delete()


# ─── fallos del proveedor ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize("kind", ["timeout", "http", "malformed"])
def test_a_provider_failure_is_a_spanish_502_that_does_not_spend_quota(on, prof, cv, monkeypatch, kind):
    def propose(**kwargs):
        raise ProviderError(kind, f"fallo interno con {KEY}")

    monkeypatch.setattr(proposals, "propose", propose)
    client = cl(prof)

    response = _propose(client, cv)

    assert response.status_code == 502
    assert response.data["code"] == "AI_PROVIDER_ERROR" and response.data["message"] == PROVIDER_MESSAGE
    assert KEY not in response.content.decode() and "fallo interno" not in response.content.decode()
    assert _status(client, cv).data["data"]["remainingToday"] == 5
    context = json.loads(_rows("AI_AUTHORING_PROPOSE")[0].context_json)
    assert context["outcome"] == "error"


def test_a_refusal_is_a_422_that_does_spend_quota(on, prof, cv, monkeypatch):
    def answer(**kwargs):
        raise ProviderError("refusal", "no")

    monkeypatch.setattr(guide, "answer", answer)
    client = cl(prof)

    response = _guide(client, cv)

    assert response.status_code == 422
    assert response.data["code"] == "AI_REFUSED" and response.data["message"] == REFUSED_MESSAGE
    assert _status(client, cv).data["data"]["remainingToday"] == 4
    assert json.loads(_rows("AI_AUTHORING_GUIDE")[0].context_json)["outcome"] == "refusal"


def test_a_failure_inside_the_real_provider_never_leaks_the_key(on, prof, cv, monkeypatch):
    """El proveedor Anthropic falla de verdad (cliente simulado): 502, cupo devuelto y la clave en ninguna parte."""

    def complete_structured(self, *args, **kwargs):
        raise ProviderError("http", f"HTTP 500 con {self.api_key}")

    monkeypatch.setattr(AnthropicProvider, "complete_structured", complete_structured)

    def propose(*, config, **kwargs):
        provider = AnthropicProvider(config.api_key, config.model_capable)
        return provider.complete_structured("sistema", [], {}, config.model_capable)

    monkeypatch.setattr(proposals, "propose", propose)
    client = cl(prof)

    response = _propose(client, cv)

    assert response.status_code == 502
    assert KEY not in response.content.decode()
    assert _status(client, cv).data["data"]["remainingToday"] == 5
    rows = AuditLog.objects.filter(action="AI_AUTHORING_PROPOSE")
    assert rows.count() == 1
    for row in AuditLog.objects.all():
        assert KEY not in row.context_json and KEY not in (row.user_agent or "")
    assert KEY not in json.dumps(_status(client, cv).data)
