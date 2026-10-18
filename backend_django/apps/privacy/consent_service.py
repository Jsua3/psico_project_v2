"""Consentimiento de las personas: registrar, retirar y exigir (S3-2a, C12; ETH-01, SIEP-RF-05, RNF-010).

El servidor es dueño de la VERSIÓN VIGENTE del aviso (``SIEP_CONTENT_NOTICE_VERSION``): el cliente envía la que mostró y, si no
coincide, 409 ``NOTICE_VERSION_STALE`` con la vigente. Un consentimiento solo cuenta si es de esa persona, de esa versión del
caso, de la versión ACTUAL del aviso y no está retirado.

``require_consent`` es la única pieza que decide si se exige; la llama ``game_service._require_attempt`` (el punto por el que
pasan el mundo y las órdenes de juego del estudiante). Con las dos banderas apagadas no hace nada y no consulta la base.
Quien está en crisis (pausa, salida segura, reanudar, abandonar, consultar el intento abierto) no pasa por ella: lo dice
``apps/privacy/tests/test_consent_enforcement.py`` ruta por ruta.

Este módulo no importa vistas. Depende de ``simulation`` (versiones de caso y auditoría); ``simulation`` solo depende de
``require_consent`` (no hay clave foránea de ``simulation`` hacia ``privacy``).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.models import CaseVersion, CaseVersionStatus
from apps.simulation.services.audit_service import arg, auditable
from shared.exceptions import ApiError

from .models import ConsentRecord, ConsentType

CONTENT_NOTICE = ConsentType.CONTENT_NOTICE
DATA_TREATMENT = ConsentType.DATA_TREATMENT


@dataclass(frozen=True)
class ConsentState:
    """Lo que ``GET …/consent`` dice: si el servidor exige el consentimiento, la versión vigente y si esta persona la aceptó."""

    required: bool
    notice_version: str
    accepted: bool
    accepted_at: datetime | None


class _YaVigente(Exception):
    """Otra petición registró la misma aceptación entre la lectura y la escritura (la ganó el índice único)."""


class _NadaQueRetirar(Exception):
    """Otra petición retiró lo vigente antes que esta."""


# ── Versiones vigentes (se leen en cada llamada: las pruebas y el despliegue las cambian sin reiniciar) ────────────────────


def content_notice_version() -> str:
    return settings.SIEP_CONTENT_NOTICE_VERSION


def data_treatment_notice_version() -> str:
    return settings.SIEP_DATA_TREATMENT_NOTICE_VERSION


def _version_id(case_version):
    """El id de una versión de caso dada como objeto o como id."""
    return getattr(case_version, "pk", case_version)


def _person_id(person):
    return getattr(person, "pk", person)


def published_version(case_version_id) -> CaseVersion:
    """La versión publicada de un caso activo, o 404: lo que se ofrece a un estudiante (como la ficha del caso)."""
    version = CaseVersion.objects.select_related("simulation_case").filter(pk=case_version_id).first()
    if version is None or version.status != CaseVersionStatus.PUBLISHED or not version.simulation_case.active:
        # BORRADOR: mismo texto que la ficha del caso, pendiente de la aprobación de Psicología (VD-23).
        raise NotFound("Caso no encontrado")
    return version


def _vigentes(person, consent_type, case_version_id, notice_version):
    """Los registros NO retirados de esa persona, tipo, caso y versión del aviso (a lo sumo uno: lo impone la base)."""
    return ConsentRecord.objects.filter(
        person_id=_person_id(person),
        consent_type=consent_type,
        case_version_id=case_version_id,
        notice_version=notice_version,
        withdrawn_at__isnull=True,
    )


def _require_current_notice(sent, current):
    """409 ``NOTICE_VERSION_STALE`` con la versión vigente si lo que el cliente mostró no es lo vigente (o no mostró nada)."""
    if not sent or sent != current:
        raise ApiError(
            "NOTICE_VERSION_STALE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El aviso cambió desde que lo leíste. Léelo de nuevo antes de aceptar.",
            status.HTTP_409_CONFLICT,
            noticeVersion=current,
        )


# ── Aviso de contenido (por versión del caso) ────────────────────────────────────────────────────────────────────────────


def has_valid_consent(person, case_version) -> bool:
    """¿Tiene ``person`` un consentimiento vigente del aviso de contenido de esta versión del caso, en la versión actual?"""
    return _vigentes(person, CONTENT_NOTICE, _version_id(case_version), content_notice_version()).exists()


def consent_state(person, case_version) -> ConsentState:
    vigente = content_notice_version()
    accepted_at = (
        _vigentes(person, CONTENT_NOTICE, _version_id(case_version), vigente)
        .values_list("accepted_at", flat=True)
        .first()
    )
    return ConsentState(
        required=settings.SIEP_CONSENT_REQUIRED,
        notice_version=vigente,
        accepted=accepted_at is not None,
        accepted_at=accepted_at,
    )


def _contexto_del_aviso(args, kwargs, result):
    """Solo la versión del caso y la del aviso: nada de la persona (el actor ya consta en su columna de la auditoría)."""
    return {"caseVersionId": arg(args, kwargs, 1, "case_version_id"), "noticeVersion": arg(args, kwargs, 2, "notice_version")}


@auditable("consentimiento.aceptar", "CASE_VERSION", 1, context=_contexto_del_aviso)
def _crear_aceptacion(person, case_version_id, notice_version):
    """Escribe la fila. La auditoría va con ella: solo se registra si esta llamada CREÓ la aceptación (el reenvío idempotente
    y quien pierde una carrera no pasan por aquí con éxito)."""
    try:
        with transaction.atomic():  # punto de guardado: un IntegrityError no rompe la transacción de quien llama
            return ConsentRecord.objects.create(
                person_id=_person_id(person),
                consent_type=CONTENT_NOTICE,
                case_version_id=case_version_id,
                notice_version=notice_version,
            )
    except IntegrityError:
        raise _YaVigente from None


def accept_content_notice(person, case_version, notice_version):
    """Registra que ``person`` aceptó el aviso de contenido de la versión del caso. Devuelve ``(registro, creado)``.

    Idempotente: si ya hay una aceptación vigente de esa versión del aviso, devuelve la misma con ``creado=False`` y no deja
    otra fila ni otra auditoría. Atómica: si dos peticiones llegan a la vez, el índice único deja una sola fila y la otra
    recibe la ganadora. Una versión del aviso que no es la vigente es un 409.
    """
    version_id = _version_id(case_version)
    _require_current_notice(notice_version, content_notice_version())
    existente = _vigentes(person, CONTENT_NOTICE, version_id, notice_version).first()
    if existente is not None:
        return existente, False
    try:
        return _crear_aceptacion(person, version_id, notice_version), True
    except _YaVigente:
        # Perdió la carrera: la ganadora es la que quedó en la base.
        return _vigentes(person, CONTENT_NOTICE, version_id, notice_version).get(), False


@auditable("consentimiento.retirar", "CASE_VERSION", 1, context=_contexto_del_aviso)
def _retirar_aviso(person, case_version_id, notice_version, withdrawn_at):
    """Marca como retirado lo vigente de esa versión del aviso. Un solo UPDATE: si otra petición se adelantó no hay nada
    que retirar y no se audita."""
    retirados = _vigentes(person, CONTENT_NOTICE, case_version_id, notice_version).update(withdrawn_at=withdrawn_at)
    if not retirados:
        raise _NadaQueRetirar


def withdraw_content_notice(person, case_version):
    """Retira lo vigente del aviso de contenido de esa versión del caso (de cualquier versión del aviso). No borra nada.

    Devuelve la hora del retiro o ``None`` si no había nada vigente (idempotente). Una fila de auditoría por registro retirado.
    """
    version_id = _version_id(case_version)
    withdrawn_at = timezone.now()
    avisos = list(
        ConsentRecord.objects.filter(
            person_id=_person_id(person), consent_type=CONTENT_NOTICE, case_version_id=version_id, withdrawn_at__isnull=True
        )
        .order_by("id")
        .values_list("notice_version", flat=True)
    )
    retirado = False
    for aviso in avisos:
        try:
            _retirar_aviso(person, version_id, aviso, withdrawn_at)
            retirado = True
        except _NadaQueRetirar:
            continue
    return withdrawn_at if retirado else None


# ── Tratamiento de datos (sin caso; sin ruta todavía: la institución entrega texto y versión, SD-8) ───────────────────────


def has_valid_data_treatment_consent(person) -> bool:
    return _vigentes(person, DATA_TREATMENT, None, data_treatment_notice_version()).exists()


def _contexto_del_tratamiento(args, kwargs, result):
    return {"noticeVersion": arg(args, kwargs, 1, "notice_version")}


@auditable("consentimiento.aceptar", "DATA_TREATMENT", -1, context=_contexto_del_tratamiento)
def _crear_aceptacion_del_tratamiento(person, notice_version):
    try:
        with transaction.atomic():
            return ConsentRecord.objects.create(
                person_id=_person_id(person), consent_type=DATA_TREATMENT, case_version=None, notice_version=notice_version
            )
    except IntegrityError:
        raise _YaVigente from None


def accept_data_treatment(person, notice_version):
    """Como ``accept_content_notice`` para la autorización de tratamiento de datos (sin caso). Devuelve ``(registro, creado)``.

    Sin versión configurada del aviso (``SIEP_DATA_TREATMENT_NOTICE_VERSION`` vacía) no hay nada que aceptar: 409.
    """
    _require_current_notice(notice_version, data_treatment_notice_version())
    existente = _vigentes(person, DATA_TREATMENT, None, notice_version).first()
    if existente is not None:
        return existente, False
    try:
        return _crear_aceptacion_del_tratamiento(person, notice_version), True
    except _YaVigente:
        return _vigentes(person, DATA_TREATMENT, None, notice_version).get(), False


# ── La exigencia ─────────────────────────────────────────────────────────────────────────────────────────────────────────


def require_consent(person, case_version) -> None:
    """403 si el servidor exige un consentimiento que ``person`` no tiene; si no, no hace nada.

    - ``SIEP_CONSENT_REQUIRED``: exige el aviso de contenido de ESTA versión del caso, en la versión actual del aviso →
      ``CONSENT_REQUIRED {noticeVersion}``.
    - ``SIEP_DATA_TREATMENT_CONSENT_REQUIRED``: además, la autorización de tratamiento de datos →
      ``DATA_TREATMENT_CONSENT_REQUIRED {noticeVersion}``.

    Con las dos apagadas no consulta la base. NO se llama desde la pausa, la salida segura, reanudar, abandonar ni consultar el
    intento abierto (REGLA-004, ETH-02).
    """
    if settings.SIEP_CONSENT_REQUIRED and not has_valid_consent(person, case_version):
        raise ApiError(
            "CONSENT_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Para continuar necesitas leer y aceptar el aviso de contenido sensible de este caso.",
            status.HTTP_403_FORBIDDEN,
            noticeVersion=content_notice_version(),
        )
    if settings.SIEP_DATA_TREATMENT_CONSENT_REQUIRED and not has_valid_data_treatment_consent(person):
        raise ApiError(
            "DATA_TREATMENT_CONSENT_REQUIRED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Para continuar necesitas aceptar la autorización de tratamiento de datos.",
            status.HTTP_403_FORBIDDEN,
            noticeVersion=data_treatment_notice_version(),
        )
