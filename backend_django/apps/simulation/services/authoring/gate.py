"""La compuerta única de publicación (E4-4, R12 y R13): validar, sellar y escribir ``PUBLISHED``.

Una versión se publica por un solo camino y este módulo es la única escritura de
``status = PUBLISHED`` (la regla de arquitectura ``publicacion-unica`` lo vigila):

1. ``ensure_publishable`` valida —la lista ética si se exige, y el mundo y el documento
   (``validation``)— y devuelve el **sello**: el instante y la huella del documento validado. Si no se
   puede publicar lanza ``CASE_NOT_PUBLISHABLE`` (409) con los bloqueos.
2. ``mark_published`` escribe ``PUBLISHED`` junto con el sello, en una sola sentencia.

Las dos se llaman bajo el ``FOR UPDATE`` de la versión que ya toma ``lifecycle.approve``: nada edita la
versión entre que se valida y se publica (``guards.ensure_draft`` toma el mismo cerrojo y exige un
borrador), así que el sello es el de lo publicado. La semilla y el comando ``seal_published_versions``
usan las mismas piezas; ``stamp`` sella una versión ya publicada sin tocar su estado.

Arrancar un intento exige el sello (``game_service``); reanudar uno abierto, no.
"""
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone
from rest_framework import status as http

from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.models import CaseVersion
from shared.exceptions import ApiError

from .editor_view import latest_checklist_ratio
from .guards import revision_bump
from .validation import assess_version

PUBLISHED = "PUBLISHED"


@dataclass(frozen=True)
class Seal:
    """Lo que se validó y cuándo: la huella del documento y los avisos que no bloquean."""

    validated_at: datetime
    definition_hash: str
    warnings: tuple = ()


def _assess(version, require_checklist):
    """``(bloqueos, valoración)``: lo que impide publicar y la valoración del mundo y el documento."""
    blockers = []
    if require_checklist and latest_checklist_ratio(version.id) < 100:
        blockers.append({
            "code": "CHECKLIST_INCOMPLETE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "message": "El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.",
        })
    assessment = assess_version(version.id)
    errors = [issue for issue in assessment.issues if issue["severity"] == "error"]
    if errors:
        blockers.append({
            "code": "VALIDATION_ERRORS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "message": f"El caso tiene {len(errors)} error(es) de validación que impiden publicarlo.",
            "issues": errors,
        })
    return blockers, assessment


def blockers_of(version, *, require_checklist=True):
    """Lo que impide enviar o aprobar la versión (lista vacía = se puede publicar)."""
    return _assess(version, require_checklist)[0]


def ensure_publishable(version, *, require_checklist=True):
    """El sello de la versión si se puede publicar; si no, ``CASE_NOT_PUBLISHABLE`` (409) con los bloqueos.

    ``require_checklist=False`` solo para quien no tiene una constancia humana que exigir (la semilla de
    desarrollo y el sellado de lo ya publicado): el mundo y el documento se validan siempre.
    """
    blockers, assessment = _assess(version, require_checklist)
    if blockers:
        raise ApiError("CASE_NOT_PUBLISHABLE", blockers[0]["message"], http.HTTP_409_CONFLICT, blockers=blockers)
    warnings = tuple(issue for issue in assessment.issues if issue["severity"] == "warning")
    return Seal(timezone.now(), definition_hash(assessment.document), warnings)


def mark_published(version, seal, actor):
    """La única escritura de ``PUBLISHED``: estado, fecha de publicación y sello, en un solo ``UPDATE``."""
    CaseVersion.objects.filter(pk=version.pk).update(
        status=PUBLISHED,
        published_at=seal.validated_at,
        validated_at=seal.validated_at,
        definition_hash=seal.definition_hash,
        **revision_bump(actor.id),
    )
    version.refresh_from_db()


def stamp(version, seal):
    """Fija el sello de una versión que ya está publicada (la semilla y ``seal_published_versions``)."""
    CaseVersion.objects.filter(pk=version.pk).update(
        validated_at=seal.validated_at, definition_hash=seal.definition_hash
    )
    version.refresh_from_db()
