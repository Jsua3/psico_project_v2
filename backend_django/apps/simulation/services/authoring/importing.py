"""Importar un documento del caso (E4-5, R16): leer, validar, convertir y escribir un borrador.

``import_bytes`` es el único camino de entrada: lee los bytes con los límites de entrada
(``casedef.import_.read_document``), valida el documento con el validador único (el mismo que mira una
versión guardada) más lo propio de la importación —se rechaza ``ejecucion``, se avisa de lo que no se
guarda—, lo convierte en un modelo y escribe **siempre un borrador** con quien importa como dueño, en una
sola transacción: ante cualquier error no queda ninguna fila.

- El caso se identifica por ``caso.id`` (su código). Si no existe, se crea a nombre de quien importa; si
  existe, se le añade una versión solo si quien importa puede editarlo (403 ``CASE_NOT_OWNED``) y esa
  versión no existe todavía (409 ``CASE_VERSION_EXISTS``). El título y la descripción de un caso que ya
  existe no cambian: son del caso y las demás versiones los comparten.
- ``caso.estado`` se ignora: lo importado es un borrador y se publica por la compuerta única.
- Un documento inválido es un 400 ``DSL_INVALID`` con los ``ValidationIssue``; un valor que la base de datos
  no admite (algo que el validador no previó) también, nunca un 500.
"""
from django.db import DataError, IntegrityError, transaction
from rest_framework import status as http

from apps.simulation.casedef import import_
from apps.simulation.casedef.report import ERROR, Issue
from apps.simulation.casedef.validate import validate_document
from apps.simulation.models import CaseVersion, SimulationCase
from shared import policies
from shared.exceptions import ApiError

from .definition_io import write_definition
from .publication import create_draft_checklist
from .validation import issue_dict


def invalid(issues):
    """El ``ApiError`` 400 ``DSL_INVALID`` con los hallazgos (errores y avisos) del documento."""
    errors = sum(1 for issue in issues if issue.severity == ERROR)
    return ApiError(
        "DSL_INVALID",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        f"El documento no se puede importar: tiene {errors} error(es).",
        http.HTTP_400_BAD_REQUEST,
        issues=[issue_dict(issue) for issue in issues],
    )


def reject(code, message):
    """Rechaza la entrada con un solo hallazgo (la forma de la petición, antes de leer el documento)."""
    return invalid([Issue(code, ERROR, "", message)])


def _case_for(definition, actor):
    """El caso al que va la versión: el existente (si puede editarlo y la versión es nueva) o uno nuevo."""
    case = SimulationCase.objects.select_for_update().filter(code=definition.code).first()
    if case is None:
        try:
            with transaction.atomic():
                return SimulationCase.objects.create(
                    code=definition.code, title=definition.title, description=definition.description or None,
                    active=True, created_by=actor,
                )
        except IntegrityError:  # otra importación creó el mismo caso un instante antes
            raise ApiError(
                "CASE_VERSION_EXISTS",
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                "Ese caso se acaba de crear en otra importación: vuelve a intentarlo.",
                http.HTTP_409_CONFLICT,
            ) from None
    if not policies.can(actor, "case", "author", owner_id=case.created_by_id):
        raise ApiError(
            "CASE_NOT_OWNED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Solo quien autora el caso puede añadirle una versión.",
            http.HTTP_403_FORBIDDEN,
        )
    if CaseVersion.objects.filter(simulation_case=case, semantic_version=definition.semantic_version).exists():
        raise ApiError(
            "CASE_VERSION_EXISTS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            f"El caso {definition.code} ya tiene una versión {definition.semantic_version}.",
            http.HTTP_409_CONFLICT,
        )
    return case


#: Las faltas de las reglas del taller (``OCL``, ``PROP``) y de texto (``TEXT_``): son del contenido, no de la forma del documento.
#: Con ``allow_rule_faults`` no bloquean la importación (el borrador las trae y la docente las resuelve en el editor).
RULE_FAULT_PREFIXES = ("DSL.OCL-", "DSL.PROP-", "DSL.TEXT_")


def import_document(document, actor, *, allow_rule_faults=False):
    """Valida ``document`` y crea el borrador; devuelve ``{caseVersionId, caseId, issues}`` (los avisos).

    Con ``allow_rule_faults=True`` los errores ``DSL.OCL-*``, ``DSL.PROP-*`` y ``DSL.TEXT_*`` no bloquean y se devuelven en
    ``issues``; los demás errores bloquean igual. Sin el parámetro, nada cambia.
    """
    issues = validate_document(document) + import_.import_issues(document)
    blocking = (
        issue for issue in issues
        if issue.severity == ERROR and not (allow_rule_faults and issue.code.startswith(RULE_FAULT_PREFIXES))
    )
    if any(True for _ in blocking):
        raise invalid(issues)
    try:
        definition = import_.to_definition(document)
    except (KeyError, TypeError, ValueError, AttributeError):
        raise invalid(issues + [Issue(import_.FORMA, ERROR, "", "No se pudo convertir el documento en un caso.")]) from None
    try:
        with transaction.atomic():
            case = _case_for(definition, actor)
            version = write_definition(definition, case=case, actor=actor)
            create_draft_checklist(version, actor)
    except (IntegrityError, DataError):
        raise invalid(issues + [Issue(
            import_.FORMA, ERROR, "",
            "El documento trae un valor que la base de datos no admite (una clave repetida o un texto demasiado largo).",
        )]) from None
    return {"caseVersionId": version.id, "caseId": case.id, "issues": [issue_dict(issue) for issue in issues]}


def import_bytes(raw, actor):
    """Lee los bytes (``application/json``) y, si son un documento válido, crea el borrador."""
    try:
        document = import_.read_document(raw)
    except import_.ImportRejected as rejected:
        raise invalid(rejected.issues) from None
    return import_document(document, actor)
