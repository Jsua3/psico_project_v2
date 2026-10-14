"""Membresías de un grupo con invitación y aceptación (E2-10, C5; D-14, decisión 22).

Un estudiante pertenece a un grupo solo cuando **acepta** la invitación del docente (o el
ADMIN la activa por él). Mientras no sea ``ACTIVE`` no accede a los casos asignados, y su
traza, su bitácora descifrada y los reportes del docente no lo incluyen: eso lo hacen
``assignments.py`` e ``instructor_scope.py``, que cuentan solo membresías ``ACTIVE``.

    (sin fila) ─invite─▶ INVITED ─accept─▶ ACTIVE ─remove─▶ REMOVED
                           │ decline                           │ invite
                           ▼                                   ▼
                        DECLINED ──────── invite ───────▶ INVITED

La parte pura (``can_transition``, ``target_of``) no toca la base de datos.
"""
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import NotFound

from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError

from .models import GrupoEstudiante, MembershipStatus

INVITED = MembershipStatus.INVITED
ACTIVE = MembershipStatus.ACTIVE
DECLINED = MembershipStatus.DECLINED
REMOVED = MembershipStatus.REMOVED

#: (estado de origen, acción) → (estado destino, roles que la hacen). ``None`` = aún no hay fila.
RULES = {
    (None, "invite"): (INVITED, ("PROFESOR", "ADMIN")),
    (DECLINED, "invite"): (INVITED, ("PROFESOR", "ADMIN")),
    (REMOVED, "invite"): (INVITED, ("PROFESOR", "ADMIN")),
    (INVITED, "accept"): (ACTIVE, ("ESTUDIANTE", "ADMIN")),
    (INVITED, "decline"): (DECLINED, ("ESTUDIANTE",)),
    (INVITED, "remove"): (REMOVED, ("PROFESOR",)),  # el docente cancela la invitación
    (ACTIVE, "remove"): (REMOVED, ("PROFESOR", "ESTUDIANTE")),
}


def can_transition(current, action, *, role):
    rule = RULES.get((current, action))
    return rule is not None and role in rule[1]


def target_of(current, action):
    """El estado al que lleva la acción desde ``current`` (``None`` si no es una transición)."""
    rule = RULES.get((current, action))
    return str(rule[0]) if rule else None


# ─── Operaciones ──────────────────────────────────────────────────────────────────────────
def invite(grupo, student, by):
    """Invita a ``student`` al ``grupo``. Devuelve ``(membresía, cambió)``.

    Sin fila crea una ``INVITED``; una ``DECLINED`` o ``REMOVED`` vuelve a ``INVITED``; una
    ``INVITED`` o ``ACTIVE`` no cambia (la orden es idempotente).
    """
    now = timezone.now()
    row = GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=student.id).first()
    if row is None:
        row = GrupoEstudiante.objects.create(
            grupo_id=grupo.id, estudiante_id=student.id, status=INVITED, invited_by=by, invited_at=now,
        )
        return row, True
    if row.status in (DECLINED, REMOVED):
        row.status = INVITED
        row.invited_by = by
        row.invited_at = now
        row.responded_at = None
        row.save(update_fields=["status", "invited_by", "invited_at", "responded_at"])
        return row, True
    return row, False


def _own(group_id, student_id):
    row = (
        GrupoEstudiante.objects.select_related("grupo__profesor")
        .filter(grupo_id=group_id, estudiante_id=student_id)
        .first()
    )
    if row is None:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise NotFound("Invitación no encontrada")
    return row


def respond(group_id, student_id, *, accept):
    """El estudiante (o el ADMIN por él, al aceptar) responde la invitación de ``group_id``."""
    row = _own(group_id, student_id)
    if row.status != INVITED:
        raise ApiError(
            "MEMBERSHIP_NOT_INVITED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Esta invitación ya fue respondida o ya no está vigente.",
            http.HTTP_409_CONFLICT,
            status=str(row.status),
        )
    row.status = ACTIVE if accept else DECLINED
    row.responded_at = timezone.now()
    row.save(update_fields=["status", "responded_at"])
    return row


@auditable("MEMBERSHIP_ACCEPTED", "GRUPO")
def accept(group_id, student_id):
    return respond(group_id, student_id, accept=True)


@auditable("MEMBERSHIP_DECLINED", "GRUPO")
def decline(group_id, student_id):
    return respond(group_id, student_id, accept=False)


def remove(grupo, student_id):
    """El docente retira al estudiante (o cancela su invitación): estado blando ``REMOVED``."""
    row = GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=student_id).first()
    if row is None or row.status not in (INVITED, ACTIVE):
        return None
    row.status = REMOVED
    row.responded_at = timezone.now()
    row.save(update_fields=["status", "responded_at"])
    return row


# ─── Vista (C5) ───────────────────────────────────────────────────────────────────────────
def invitation_view(row):
    """``Invitation``: ``id`` es el ``groupId`` (la membresía es ``(grupo, actor)``, R10)."""
    teacher = row.grupo.profesor
    return {
        "id": row.grupo_id,
        "groupId": row.grupo_id,
        "groupName": row.grupo.nombre,
        "teacherName": f"{teacher.nombre} {teacher.apellido}".strip(),
        "invitedAt": row.invited_at.isoformat() if row.invited_at else None,
        "status": str(row.status),
    }


def invitations_of(student):
    """Las invitaciones del estudiante: pendientes y respondidas (no las retiradas)."""
    rows = (
        GrupoEstudiante.objects.select_related("grupo__profesor")
        .filter(estudiante_id=student.id)
        .exclude(status=REMOVED)
        .order_by("-invited_at", "-grupo_id")
    )
    return [invitation_view(row) for row in rows]
