"""La lista ética verificable (S3-3; RNF-010, SIEP-RF-05): quién respalda cada casilla y qué comprueba el sistema.

La lista de publicación era solo la declaración de quien autora el caso: marcar «revisión ética» daba el 100 % sin que
existiera ninguna revisión, y «protocolos de seguridad» sin una sola escena con recursos de apoyo. SIEP trata casos de
violencia con estudiantes: una casilla marcada sin el dato que debería respaldarla no puede bastar para publicar.

Cada ítem de ``checklist.CHECKLIST_ITEMS`` declara su respaldo (``SYSTEM``, ``CONSTANCIA`` o ``AUTHOR``) y ``CHECKS`` trae la
comprobación de cada uno que no es solo una declaración:

- «protocolos de seguridad» (``SYSTEM``): alguna escena de la versión tiene un recurso de apoyo con texto.
- «advertencias de contenido» (``SYSTEM``): el servidor tiene un aviso de contenido vigente
  (``SIEP_CONTENT_NOTICE_VERSION``). La configuración del aviso POR ESCENA se queda como declaración (``sensitive_content`` y
  ``warning_message`` existen en el nodo, pero la decisión del plan es no exigirlos todavía).
- «revisión ética» (``CONSTANCIA``, solo con ``REVIEW_WORKFLOW_STRICT``): hay una constancia de revisión de contenido de
  Psicología. Se registra al APROBAR, así que solo se exige al aprobar (``at_approval``) y vale la que llega en esa misma
  llamada o una previa; al enviar a revisión aún no puede existir.

Una casilla SIN marcar no genera nada: que falte lo cubre ``CHECKLIST_INCOMPLETE``; aquí solo se comprueba lo declarado.

La parte de arriba es **pura** (``unbacked_issues`` y ``backed`` reciben los hechos —``Facts``— y devuelven hallazgos o un
booleano, sin base de datos); ``facts_of`` y ``has_content_review`` son lo único que consulta. La compuerta
(``gate._assess``) suma cada hallazgo a sus bloqueos y la vista del editor (``editor_view.checklist_view``) los muestra como
``backed`` de cada ítem: lo que la persona ve respaldado es exactamente lo que la compuerta comprueba.
"""
from dataclasses import dataclass
from typing import Callable

from django.conf import settings

from apps.simulation.models import CaseReview, SimulationNode
from shared.jsonutils import read_string_list

from . import checklist

NO_SUPPORT_RESOURCES = "ETHICS.NO_SUPPORT_RESOURCES"
NO_CONTENT_NOTICE = "ETHICS.NO_CONTENT_NOTICE"
NO_CONTENT_REVIEW = "ETHICS.NO_CONTENT_REVIEW"


@dataclass(frozen=True)
class Facts:
    """Lo que el sistema sabe para respaldar las casillas. Sin base de datos: ``facts_of`` lo arma."""

    #: Los recursos de apoyo de cada escena de la versión (una lista de textos por escena).
    scene_resources: tuple
    #: El aviso de contenido vigente en el servidor (``""`` si no hay).
    content_notice: str
    #: ¿Hay una constancia de revisión de contenido de Psicología (la de esta llamada o una previa)?
    content_review: bool


@dataclass(frozen=True)
class Check:
    """Una comprobación: el código estable del hallazgo, su texto llano y el hecho que debe existir."""

    code: str
    message: str
    holds: Callable[[Facts], bool]


def has_support_resources(scene_resources):
    """¿Alguna escena trae un recurso de apoyo con texto? Uno vacío, o que no es un texto, no cuenta."""
    return any(
        isinstance(resource, str) and bool(resource.strip())
        for resources in scene_resources
        for resource in resources
    )


# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
#: casilla → su comprobación. Una prueba exige que sean EXACTAMENTE las casillas que ``checklist`` declara respaldadas por el
#: sistema o por la constancia (las de ``AUTHOR`` no se comprueban), y que cada texto sea llano y sin identificadores.
CHECKS = {
    "ethicsReviewed": Check(
        NO_CONTENT_REVIEW,
        "La casilla «revisión ética» está marcada, pero el caso no tiene la constancia de revisión de contenido de "
        "Psicología: quien aprueba debe registrarla (revisor, fecha y referencia o acta).",
        lambda facts: facts.content_review,
    ),
    "safetyProtocols": Check(
        NO_SUPPORT_RESOURCES,
        "La casilla «protocolos de seguridad» está marcada, pero ninguna escena tiene recursos de apoyo: agrega al menos "
        "uno en una escena sensible.",
        lambda facts: has_support_resources(facts.scene_resources),
    ),
    "triggerWarnings": Check(
        NO_CONTENT_NOTICE,
        "La casilla «advertencias de contenido sensible» está marcada, pero el servidor no tiene un aviso de contenido "
        "vigente: quien administra el sistema debe configurarlo antes de publicar.",
        lambda facts: bool(facts.content_notice.strip()),
    ),
}


def backed(code, facts, strict_mode):
    """¿Existe ahora el dato que respalda la casilla ``code``? ``None`` si nadie puede comprobarla (solo declaración)."""
    if checklist.backing_of(code, strict_mode) == checklist.AUTHOR:
        return None
    return bool(CHECKS[code].holds(facts))


def unbacked_issues(marked, facts, *, strict_mode, at_approval):
    """Los ``ValidationIssue`` (severidad ``error``) de las casillas MARCADAS cuyo dato de respaldo no existe.

    ``marked`` son los códigos marcados; la constancia solo se mira ``at_approval`` y con la bandera estricta (si no, la
    casilla es declaración). Salen en el orden de la lista, una vez cada uno.
    """
    issues = []
    for code in checklist.CODES:
        backing = checklist.backing_of(code, strict_mode)
        if code not in marked or backing == checklist.AUTHOR:
            continue
        if backing == checklist.CONSTANCIA and not at_approval:
            continue
        check = CHECKS[code]
        if not check.holds(facts):
            issues.append({"code": check.code, "severity": "error", "message": check.message})
    return issues


# ─── lo único que consulta ────────────────────────────────────────────────────────────────────────
def has_content_review(case_version_id):
    """¿La versión ya tiene registrada una constancia de revisión de contenido (una ``CaseReview`` con referencia)?"""
    return CaseReview.objects.filter(case_version_id=case_version_id, content_reference__isnull=False).exists()


def facts_of(case_version_id, *, content_review):
    """Los hechos de la versión y del servidor.

    ``content_review`` lo decide quien llama: la constancia que llega en esta llamada o una previa.
    """
    raw = (
        SimulationNode.objects.filter(case_version_id=case_version_id)
        .order_by("id")
        .values_list("support_resources_json", flat=True)
    )
    return Facts(
        scene_resources=tuple(tuple(read_string_list(item)) for item in raw),
        content_notice=str(settings.SIEP_CONTENT_NOTICE_VERSION or ""),
        content_review=content_review,
    )
