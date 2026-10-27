"""La compuerta única de publicación (E4-4, R12 y R13): validar, sellar y escribir ``PUBLISHED``.

Una versión se publica por un solo camino y este módulo es la única escritura de
``status = PUBLISHED`` (la regla de arquitectura ``publicacion-unica`` lo vigila):

1. ``ensure_publishable`` valida —la lista ética si se exige, con el respaldo de cada casilla marcada
   (``ethics``, S3-3), y el mundo y el documento (``validation``)— y devuelve el **sello**: el instante y la
   huella del documento validado. Si no se puede publicar lanza ``CASE_NOT_PUBLISHABLE`` (409) con los
   bloqueos.
2. ``mark_published`` escribe ``PUBLISHED`` junto con el sello, en una sola sentencia.

Las dos se llaman bajo el ``FOR UPDATE`` de la versión que ya toma ``lifecycle.approve``: nada edita la
versión entre que se valida y se publica (``guards.ensure_draft`` toma el mismo cerrojo y exige un
borrador), así que el sello es el de lo publicado. La semilla y el comando ``seal_published_versions``
usan las mismas piezas; ``stamp`` sella una versión ya publicada sin tocar su estado.

Arrancar un intento exige el sello (``game_service``); reanudar uno abierto, no.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework import status as http

from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.casedef.reuse import reuse_ratio
from apps.simulation.models import CaseVersion
from apps.simulation.services import rubric_service
from shared.exceptions import ApiError

from . import checklist as checklist_rules
from . import ethics
from .ai_review import ai_suggested_count
from .definition_io import load_definition
from .editor_view import latest_checklist_codes, latest_checklist_ratio
from .guards import revision_bump
from .validation import assess_version

PUBLISHED = "PUBLISHED"


@dataclass(frozen=True)
class Seal:
    """Lo que se validó y cuándo: la huella del documento y los avisos que no bloquean."""

    validated_at: datetime
    definition_hash: str
    warnings: tuple = ()
    #: Cuánto del original conserva el clon (cuatro decimales), o ``None`` si no es un clon (E4-7).
    reuse_ratio: Decimal | None = None


def _ethics_blockers(version, *, at_approval, content_review_given):
    """Las casillas MARCADAS cuyo dato de respaldo no existe (S3-3), cada una como un bloqueo con su ``ValidationIssue``.

    El código y el texto del bloqueo son los del hallazgo, así que lo que ya muestra los bloqueos (el panel de revisión, el
    mensaje del 409) lo dice sin cambios. ``at_approval`` es solo al aprobar: la constancia se registra al aprobar y al enviar a
    revisión aún no puede existir. ``content_review_given`` es que llega una constancia en esta misma llamada.
    """
    marked = latest_checklist_codes(version.id)
    if not marked:
        return []
    content_review = content_review_given or (at_approval and ethics.has_content_review(version.id))
    facts = ethics.facts_of(version.id, content_review=content_review)
    issues = ethics.unbacked_issues(marked, facts, strict_mode=checklist_rules.strict(), at_approval=at_approval)
    return [{"code": issue["code"], "message": issue["message"], "issues": [issue]} for issue in issues]


def _assess(version, require_checklist, *, at_approval=False, content_review_given=False):
    """``(bloqueos, valoración)``: lo que impide publicar y la valoración del mundo y el documento.

    Los bloqueos éticos van AL FINAL: lo de siempre conserva su lugar (``blockers[0]`` sigue siendo lo que era) y solo
    cuando no hay otra cosa lo ético es lo primero que se lee.
    """
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
    suggested = ai_suggested_count(version)
    if suggested:
        blockers.append({
            "code": "AI_SUGGESTED_UNREVIEWED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "message": f"{suggested} parte(s) sugeridas por la IA sin revisar.",
        })
    if require_checklist:
        blockers.extend(
            _ethics_blockers(version, at_approval=at_approval, content_review_given=content_review_given)
        )
    return blockers, assessment


def _reuse(version, definition):
    """``Decimal`` con cuatro decimales de lo que el clon conserva de su origen, o ``None`` si no es un clon."""
    source = version.cloned_from_id
    if source is None or not CaseVersion.objects.filter(pk=source).exists():
        return None
    ratio = reuse_ratio(load_definition(source).definition, definition)
    if ratio is None:
        return None
    return (Decimal(ratio.numerator) / Decimal(ratio.denominator)).quantize(Decimal("0.0001"))


def blocker_codes(error):
    """Los códigos de lo que impidió publicar o sellar, p. ej. ``WORLD.NO_NODES, DSL.OCL-07``."""
    blockers = getattr(error, "extra", {}).get("blockers", [])
    codes = [issue["code"] for blocker in blockers for issue in blocker.get("issues", [])]
    return ", ".join(codes) or str(error.detail)


def blockers_of(version, *, require_checklist=True):
    """Lo que impide enviar o aprobar la versión (lista vacía = se puede publicar).

    No incluye la constancia de Psicología (``ETHICS.NO_CONTENT_REVIEW``): se registra al aprobar, así que antes no puede
    existir y pedirla aquí dejaría el «Aprobar» deshabilitado para siempre. La comprueba ``ensure_publishable``.
    """
    return _assess(version, require_checklist)[0]


def ensure_publishable(version, *, require_checklist=True, content_review_given=False):
    """El sello de la versión si se puede publicar; si no, ``CASE_NOT_PUBLISHABLE`` (409) con los bloqueos.

    ``require_checklist=False`` solo para quien no tiene una constancia humana que exigir (la semilla de
    desarrollo y el sellado de lo ya publicado): el mundo y el documento se validan siempre, y la lista ética con su
    respaldo no se mira. Con la lista, esta es la puerta de APROBAR: con ``REVIEW_WORKFLOW_STRICT``, una «revisión ética»
    marcada pide la constancia de Psicología; ``content_review_given`` dice que llega una en esta misma llamada (su forma la
    valida ``lifecycle.approve`` en la misma transacción, antes de publicar) y una previa también cuenta.
    """
    rubric_service.normalize_version_rubrics(version.id)  # lo sellado ya trae los pesos que la evaluación usará
    blockers, assessment = _assess(
        version, require_checklist, at_approval=True, content_review_given=content_review_given
    )
    if blockers:
        raise ApiError("CASE_NOT_PUBLISHABLE", blockers[0]["message"], http.HTTP_409_CONFLICT, blockers=blockers)
    warnings = tuple(issue for issue in assessment.issues if issue["severity"] == "warning")
    return Seal(
        timezone.now(), definition_hash(assessment.document), warnings, _reuse(version, assessment.definition)
    )


def mark_published(version, seal, actor):
    """La única escritura de ``PUBLISHED``: estado, fecha de publicación y sello, en un solo ``UPDATE``."""
    CaseVersion.objects.filter(pk=version.pk).update(
        status=PUBLISHED,
        published_at=seal.validated_at,
        validated_at=seal.validated_at,
        definition_hash=seal.definition_hash,
        reuse_ratio=seal.reuse_ratio,
        **revision_bump(actor.id),
    )
    version.refresh_from_db()


def stamp(version, seal):
    """Fija el sello de una versión que ya está publicada (la semilla y ``seal_published_versions``)."""
    CaseVersion.objects.filter(pk=version.pk).update(
        validated_at=seal.validated_at, definition_hash=seal.definition_hash
    )
    version.refresh_from_db()
