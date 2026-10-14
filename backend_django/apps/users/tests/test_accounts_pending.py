"""E2-9 · Cuentas pendientes, aprobación por lote y cambio de contraseña (RN-10, RNF-01, D-5,
decisión 4, LS-16).

La importación del docente ya no crea cuentas activas con una contraseña compartida: crea
cuentas **pendientes** (``activo = false``, ``must_change_password``, sin contraseña usable).
El ADMIN las aprueba por lote: se activan, reciben una contraseña temporal **por correo** (la
respuesta nunca la trae) y el primer inicio obliga a cambiarla antes de cualquier otra orden.
"""
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from rest_framework.test import APIClient

from apps.grupos.tests.test_grupos import _xlsx_upload
from apps.users.services import account_service

pytestmark = [pytest.mark.req("RN-10"), pytest.mark.req("RNF-01"), pytest.mark.req("D-5")]

User = get_user_model()


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


def cl(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="pend_admin@x.com", password="Admin-Segura-2026!", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="pend_prof@x.com", password="Profe-Segura-2026!", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


def _import(profesor, rows, codigo="PEND1", header=("nombre", "apellido", "email")):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": codigo}, format="json").data["data"]
    response = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import/",
        {"file": _xlsx_upload([list(header), *rows])},
        format="multipart",
    )
    assert response.status_code == 200, response.data
    return grupo, response


def _template_texts(xlsx_bytes):
    """Todos los textos de las hojas de la plantilla descargable."""
    texts = []
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as archive:
        for name in archive.namelist():
            if name.startswith("xl/worksheets/"):
                texts += [n.text or "" for n in ET.fromstring(archive.read(name)).iter() if n.tag.endswith("}t")]
    return texts


def _temporary_password_from(message):
    match = re.search(r"Contraseña temporal:\s*(\S+)", message.body)
    assert match, message.body
    return match.group(1)


# ─── la importación crea cuentas pendientes ──────────────────────────────────────────────
def test_import_creates_inactive_pending_accounts_without_a_usable_password(profesor):
    _, response = _import(profesor, [["Ana", "Rojas", "ana.pend@x.com"]])

    user = User.objects.get(email="ana.pend@x.com")
    assert (user.activo, user.must_change_password, user.role) == (False, True, "ESTUDIANTE")
    assert user.has_usable_password() is False
    assert response.data["data"]["created"] == 1


def test_no_response_of_the_teacher_carries_a_password(profesor):
    grupo, response = _import(
        profesor, [["Luis", "Perez", "luis.pend@x.com", "Clave-Que-No-Debe-Verse-1"]],
        codigo="PEND2", header=("nombre", "apellido", "email", "password"),
    )

    serialized = json.dumps(response.data, ensure_ascii=False)
    assert "defaultPassword" not in serialized
    assert "Clave-Que-No-Debe-Verse-1" not in serialized
    assert "Siep2026!" not in serialized
    # La columna de contraseña de un archivo viejo se ignora y se informa; nunca se usa.
    assert response.data["data"]["ignoredColumns"] == ["password"]
    assert User.objects.get(email="luis.pend@x.com").has_usable_password() is False
    texts = _template_texts(cl(profesor).get("/api/grupos/estudiantes/import/template/").content)
    assert "password" not in [t.lower() for t in texts]
    assert not any("Siep2026" in t for t in texts)
    spec = cl(profesor).get("/api/grupos/estudiantes/import/spec/").data["data"]
    assert "password" not in spec["columns"]
    assert grupo["id"]


def test_a_pending_account_cannot_log_in_with_any_password(profesor):
    _import(profesor, [["Ana", "Rojas", "ana.login@x.com"]], codigo="PEND3")

    for password in ("Siep2026!", "!", "cualquiera"):
        response = cl().post(
            "/api/auth/login", {"email": "ana.login@x.com", "password": password}, format="json"
        )
        assert response.status_code == 401


# ─── aprobación por lote ────────────────────────────────────────────────────────────────
def test_only_admin_approves(profesor):
    _import(profesor, [["Ana", "Rojas", "ana.ap1@x.com"]], codigo="PEND4")
    user = User.objects.get(email="ana.ap1@x.com")

    response = cl(profesor).post("/api/admin/users/approve", {"userIds": [user.id]}, format="json")

    assert response.status_code == 403
    user.refresh_from_db()
    assert user.activo is False


def test_approval_activates_emails_the_temporary_password_and_never_returns_it(profesor, admin):
    _import(
        profesor,
        [["Ana", "Rojas", "ana.ap2@x.com"], ["Beto", "Soto", "beto.ap2@x.com"]],
        codigo="PEND5",
    )
    ids = list(User.objects.filter(email__endswith=".ap2@x.com").values_list("id", flat=True))
    mail.outbox.clear()

    response = cl(admin).post("/api/admin/users/approve", {"userIds": ids}, format="json")

    assert response.status_code == 200
    assert response.data["data"] == {
        "approved": 2, "approvedIds": sorted(ids), "skipped": [], "emailed": 2, "failed": [],
    }
    assert len(mail.outbox) == 2
    for message in mail.outbox:
        temporary = _temporary_password_from(message)
        assert temporary not in json.dumps(response.data)
        assert message.to[0].endswith(".ap2@x.com")
    for user in User.objects.filter(pk__in=ids):
        assert user.activo is True and user.must_change_password is True
        assert user.has_usable_password() is True


def test_approval_skips_what_is_not_pending(profesor, admin):
    _import(profesor, [["Ana", "Rojas", "ana.ap3@x.com"]], codigo="PEND6")
    pending = User.objects.get(email="ana.ap3@x.com")
    active = User.objects.create_user(
        email="activa.ap3@x.com", password="Clave-Activa-2026!", nombre="Ya", apellido="Activa", role="ESTUDIANTE"
    )
    mail.outbox.clear()

    response = cl(admin).post(
        "/api/admin/users/approve", {"userIds": [pending.id, active.id, 99999999]}, format="json"
    )

    assert response.status_code == 200
    assert response.data["data"]["approved"] == 1
    assert sorted(response.data["data"]["skipped"]) == sorted([active.id, 99999999])
    assert len(mail.outbox) == 1


def test_the_admin_user_list_flags_pending_accounts(profesor, admin):
    _import(profesor, [["Ana", "Rojas", "ana.ap4@x.com"]], codigo="PEND7")

    rows = cl(admin).get("/api/admin/users").data["data"]

    pending = next(r for r in rows if r["email"] == "ana.ap4@x.com")
    assert pending["pendingApproval"] is True
    assert pending["activo"] is False
    admin_row = next(r for r in rows if r["email"] == admin.email)
    assert admin_row["pendingApproval"] is False


# ─── el primer inicio obliga a cambiar la contraseña ───────────────────────────────────
def _approved_student(profesor, admin, email, codigo):
    _import(profesor, [["Ana", "Rojas", email]], codigo=codigo)
    user = User.objects.get(email=email)
    mail.outbox.clear()
    cl(admin).post("/api/admin/users/approve", {"userIds": [user.id]}, format="json")
    temporary = _temporary_password_from(mail.outbox[0])
    login = cl().post("/api/auth/login", {"email": email, "password": temporary}, format="json")
    assert login.status_code == 200, login.data
    return user, temporary, login.data["data"]


def test_first_login_flags_the_change_and_blocks_everything_else(profesor, admin):
    user, temporary, session = _approved_student(profesor, admin, "ana.fl@x.com", "PEND8")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['token']}")

    assert session["user"]["mustChangePassword"] is True
    me = client.get("/api/auth/me")
    blocked = client.get("/api/simulation/cases")

    assert me.status_code == 200 and me.data["data"]["mustChangePassword"] is True
    assert blocked.status_code == 403
    assert blocked.data["code"] == "PASSWORD_CHANGE_REQUIRED"


def test_changing_the_password_clears_the_flag_and_unblocks(profesor, admin):
    user, temporary, session = _approved_student(profesor, admin, "ana.ch@x.com", "PEND9")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['token']}")

    wrong = client.post(
        "/api/auth/change-password",
        {"currentPassword": "no-es-la-actual", "newPassword": "Nueva-Clave-Larga-2026!"}, format="json",
    )
    same = client.post(
        "/api/auth/change-password",
        {"currentPassword": temporary, "newPassword": temporary}, format="json",
    )
    weak = client.post(
        "/api/auth/change-password", {"currentPassword": temporary, "newPassword": "12345678"}, format="json"
    )
    common = client.post(
        "/api/auth/change-password", {"currentPassword": temporary, "newPassword": "password123"}, format="json"
    )
    done = client.post(
        "/api/auth/change-password",
        {"currentPassword": temporary, "newPassword": "Nueva-Clave-Larga-2026!"}, format="json",
    )

    assert wrong.status_code == 400 and wrong.data["field"] == "currentPassword"
    assert same.status_code == 400 and same.data["field"] == "newPassword"
    assert weak.status_code == 400 and weak.data["field"] == "newPassword"
    assert common.status_code == 400 and common.data["field"] == "newPassword"
    assert done.status_code == 200
    user.refresh_from_db()
    assert user.must_change_password is False
    assert user.check_password("Nueva-Clave-Larga-2026!")
    assert client.get("/api/simulation/cases").status_code == 200
    # La temporal ya no sirve.
    old = cl().post("/api/auth/login", {"email": user.email, "password": temporary}, format="json")
    assert old.status_code == 401


def test_a_normal_user_can_change_their_password_without_the_flag(profesor):
    client = cl(profesor)

    response = client.post(
        "/api/auth/change-password",
        {"currentPassword": "Profe-Segura-2026!", "newPassword": "Profe-Nueva-Segura-2027!"},
        format="json",
    )

    assert response.status_code == 200
    profesor.refresh_from_db()
    assert profesor.check_password("Profe-Nueva-Segura-2027!")


def test_google_login_clears_the_forced_change(profesor, admin, settings, monkeypatch):
    user, _, _ = _approved_student(profesor, admin, "ana.go@x.com", "PEND10")
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com"
    monkeypatch.setattr(
        "apps.users.views.verify_google_credential",
        lambda credential, audience: {"email": "ana.go@x.com", "email_verified": True},
    )

    response = cl().post("/api/auth/google", {"credential": "token"}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["user"]["mustChangePassword"] is False
    user.refresh_from_db()
    assert user.must_change_password is False


def test_admin_created_passwords_must_not_be_weak(admin):
    response = cl(admin).post(
        "/api/admin/users",
        {"email": "debil@x.com", "password": "12345678", "nombre": "D", "apellido": "E", "role": "ESTUDIANTE"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["field"] == "password"


# ─── Revisión de fase E2: activar una pendiente, Google, claves largas, tope del lote ──────────────
def test_the_activate_button_approves_a_pending_account_instead_of_leaving_it_stuck(profesor, admin):
    _import(profesor, [["Ana", "Rojas", "ana.stuck@x.com"]], codigo="PEND11")
    user = User.objects.get(email="ana.stuck@x.com")
    mail.outbox.clear()

    response = cl(admin).patch(f"/api/admin/users/{user.id}/status", {"activo": True}, format="json")

    assert response.status_code == 200
    user.refresh_from_db()
    assert (user.activo, user.must_change_password, user.has_usable_password()) == (True, True, True)
    assert len(mail.outbox) == 1
    temporary = _temporary_password_from(mail.outbox[0])
    assert temporary not in json.dumps(response.data)
    login = cl().post("/api/auth/login", {"email": user.email, "password": temporary}, format="json")
    assert login.status_code == 200


def test_the_edit_form_activating_a_pending_account_also_approves_it(profesor, admin):
    _import(profesor, [["Ana", "Rojas", "ana.edit@x.com"]], codigo="PEND12")
    user = User.objects.get(email="ana.edit@x.com")
    mail.outbox.clear()

    response = cl(admin).put(
        f"/api/admin/users/{user.id}",
        {"email": user.email, "nombre": "Ana María", "apellido": user.apellido, "role": "ESTUDIANTE",
         "activo": True},
        format="json",
    )

    assert response.status_code == 200, response.data
    user.refresh_from_db()
    assert (user.nombre, user.activo, user.has_usable_password()) == ("Ana María", True, True)
    assert len(mail.outbox) == 1


def test_google_login_invalidates_the_emailed_temporary_password(profesor, admin, settings, monkeypatch):
    user, temporary, _ = _approved_student(profesor, admin, "ana.gtemp@x.com", "PEND13")
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com"
    monkeypatch.setattr(
        "apps.users.views.verify_google_credential",
        lambda credential, audience: {"email": "ana.gtemp@x.com", "email_verified": True},
    )

    assert cl().post("/api/auth/google", {"credential": "token"}, format="json").status_code == 200

    old = cl().post("/api/auth/login", {"email": user.email, "password": temporary}, format="json")
    assert old.status_code == 401


@pytest.mark.parametrize("length", [73, 200])
def test_a_password_longer_than_72_bytes_is_a_400_with_its_field(profesor, admin, length):
    user, temporary, session = _approved_student(profesor, admin, f"ana.long{length}@x.com", f"PEND{length}")
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['token']}")

    response = client.post(
        "/api/auth/change-password",
        {"currentPassword": temporary, "newPassword": "Aa1-" + "x" * (length - 4)},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["field"] == "newPassword"


def test_an_approval_batch_is_capped(admin):
    response = cl(admin).post(
        "/api/admin/users/approve", {"userIds": list(range(1, 102))}, format="json"
    )

    assert response.status_code == 400
    assert response.data["field"] == "userIds"


def test_the_approval_audit_row_names_the_accounts(profesor, admin):
    from apps.simulation.models import AuditLog

    _import(profesor, [["Ana", "Rojas", "ana.aud@x.com"]], codigo="PEND15")
    user = User.objects.get(email="ana.aud@x.com")

    cl(admin).post("/api/admin/users/approve", {"userIds": [user.id, 999999]}, format="json")

    row = AuditLog.objects.filter(action="USER_APPROVED").order_by("-id").first()
    context = json.loads(row.context_json)
    assert (context["approvedIds"], context["skippedIds"], context["failedIds"]) == ([user.id], [999999], [])
    assert row.actor_id == admin.id
    assert "password" not in row.context_json.lower()


def test_approving_the_same_account_twice_emails_it_once(profesor, admin):
    _import(profesor, [["Ana", "Rojas", "ana.twice@x.com"]], codigo="PEND16")
    user = User.objects.get(email="ana.twice@x.com")
    mail.outbox.clear()

    first = cl(admin).post("/api/admin/users/approve", {"userIds": [user.id]}, format="json")
    second = cl(admin).post("/api/admin/users/approve", {"userIds": [user.id]}, format="json")

    assert first.data["data"]["approved"] == 1
    assert (second.data["data"]["approved"], second.data["data"]["skipped"]) == (0, [user.id])
    assert len(mail.outbox) == 1


def test_a_failed_email_on_the_activate_button_is_a_409_and_the_account_stays_pending(
    profesor, admin, monkeypatch
):
    _import(profesor, [["Ana", "Rojas", "ana.mailfail@x.com"]], codigo="PEND17")
    user = User.objects.get(email="ana.mailfail@x.com")

    def broken(*args, **kwargs):
        raise OSError("SMTP caído")

    monkeypatch.setattr("apps.users.services.account_service.send_mail", broken)

    response = cl(admin).patch(f"/api/admin/users/{user.id}/status", {"activo": True}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "APPROVAL_EMAIL_FAILED"
    user.refresh_from_db()
    assert user.is_pending_approval is True


def test_a_batch_reports_the_accounts_whose_email_failed_and_keeps_them_pending(profesor, admin, monkeypatch):
    _import(profesor, [["Ana", "Rojas", "ana.b1@x.com"], ["Beto", "Soto", "beto.b1@x.com"]], codigo="PEND18")
    ana = User.objects.get(email="ana.b1@x.com")
    beto = User.objects.get(email="beto.b1@x.com")
    real_send = account_service.send_mail

    def flaky(subject, body, sender, recipients, **kwargs):
        if recipients == [ana.email]:
            raise OSError("SMTP caído")
        return real_send(subject, body, sender, recipients, **kwargs)

    monkeypatch.setattr(account_service, "send_mail", flaky)
    mail.outbox.clear()

    response = cl(admin).post("/api/admin/users/approve", {"userIds": [ana.id, beto.id]}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert (data["approved"], data["approvedIds"], data["failed"]) == (1, [beto.id], [ana.id])
    ana.refresh_from_db()
    beto.refresh_from_db()
    assert ana.is_pending_approval is True and beto.activo is True
    assert len(mail.outbox) == 1
