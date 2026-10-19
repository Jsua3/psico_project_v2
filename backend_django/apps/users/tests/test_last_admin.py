"""E2-11 · El último ADMIN activo no puede desactivarse ni quitarse el rol (D-6).

Sin esta guarda un solo clic (o dos administradores desactivándose a la vez) dejaba el
sistema sin quien apruebe cuentas, revise casos ni publique. La guarda toma un cerrojo sobre
las filas de los ADMIN activos para que dos órdenes simultáneas no se crucen.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog
from shared.testing import purge_audit_rows, run_concurrently

pytestmark = [pytest.mark.req("D-6")]

User = get_user_model()


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _admin(email):
    return User.objects.create_user(
        email=email, password="Admin-Segura-2026!", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def only_admin(db):
    """Un ADMIN que es el único activo (se apaga al sembrado)."""
    User.objects.filter(role="ADMIN").update(activo=False)
    return _admin("ult_admin@x.com")


def _status(client, user, activo):
    return client.patch(f"/api/admin/users/{user.id}/status", {"activo": activo}, format="json")


def _put(client, user, **fields):
    body = {"email": user.email, "nombre": user.nombre, "apellido": user.apellido, "role": user.role,
            "activo": user.activo}
    body.update(fields)
    return client.put(f"/api/admin/users/{user.id}", body, format="json")


def test_the_last_admin_cannot_deactivate_themselves(only_admin):
    response = _status(cl(only_admin), only_admin, False)

    assert response.status_code == 400
    assert response.data["code"] == "LAST_ADMIN"
    only_admin.refresh_from_db()
    assert only_admin.activo is True


def test_the_last_admin_cannot_lose_the_role(only_admin):
    response = _put(cl(only_admin), only_admin, role="PROFESOR")

    assert response.status_code == 400
    assert response.data["code"] == "LAST_ADMIN"
    only_admin.refresh_from_db()
    assert only_admin.role == "ADMIN"


def test_the_last_admin_cannot_be_deactivated_through_the_edit_form_either(only_admin):
    response = _put(cl(only_admin), only_admin, activo=False)

    assert response.status_code == 400
    assert response.data["code"] == "LAST_ADMIN"


def test_with_two_admins_one_can_step_down_and_then_the_other_cannot(only_admin):
    second = _admin("ult_admin2@x.com")

    first_out = _status(cl(only_admin), second, False)
    assert first_out.status_code == 200
    second.refresh_from_db()
    assert second.activo is False

    last = _status(cl(only_admin), only_admin, False)
    assert last.status_code == 400 and last.data["code"] == "LAST_ADMIN"


def test_changing_other_fields_of_the_last_admin_is_fine(only_admin):
    response = _put(cl(only_admin), only_admin, nombre="Nuevo nombre")

    assert response.status_code == 200
    only_admin.refresh_from_db()
    assert only_admin.nombre == "Nuevo nombre"


def test_non_admins_are_not_affected_by_the_guard(only_admin):
    student = User.objects.create_user(
        email="ult_est@x.com", password="Clave-Segura-2026!", nombre="E", apellido="S", role="ESTUDIANTE"
    )

    assert _status(cl(only_admin), student, False).status_code == 200


def test_two_admins_deactivating_each_other_at_once_leave_one_active(real_commits):
    """Commits reales con dos hilos: el cerrojo deja pasar a uno y rechaza al otro."""
    suffix = uuid.uuid4().hex[:8]
    previously_active = list(User.objects.filter(role="ADMIN", activo=True).values_list("pk", flat=True))
    User.objects.filter(pk__in=previously_active).update(activo=False)
    first = _admin(f"hilos_a_{suffix}@x.com")
    second = _admin(f"hilos_b_{suffix}@x.com")
    try:
        results = run_concurrently(
            lambda: _status(cl(first), second, False).status_code,
            lambda: _status(cl(second), first, False).status_code,
        )

        codes = sorted(outcome.value for outcome in results if outcome.error is None)
        assert all(outcome.error is None for outcome in results), [r.error for r in results]
        assert codes == [200, 400]
        assert User.objects.filter(pk__in=[first.pk, second.pk], activo=True).count() == 1
    finally:
        # S1-4 · cada orden deja una fila de auditoría con su actor: se borra antes que la cuenta (clave foránea).
        purge_audit_rows(AuditLog.objects.filter(actor_id__in=[first.pk, second.pk]))
        first.delete()
        second.delete()
        User.objects.filter(pk__in=previously_active).update(activo=True)
