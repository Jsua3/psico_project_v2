"""La validación única de una versión del caso (E4-2b, contratos C6 y C10).

Dos validadores miran el mismo caso desde dos lados y aquí se juntan en una sola lista de
``ValidationIssue``:

- el **mundo** (``world_validation``, códigos ``WORLD.*``) mira las filas —nodos, decisiones, mapas,
  objetos y diálogos—, nombra la escena o el mapa por su título y lleva el ``nodeId``/``mapId`` al que el
  editor puede llevar el foco;
- el **documento** (``casedef.validate``, códigos ``DSL.*``) mira el documento canónico que se exporta de
  la versión: la forma y las 16 reglas del taller, ``x-siep``, los textos y los límites. Lo que publica es
  lo que se validó: el mismo documento que se exporta es el que se mira.

Lo que ambos ven (sin escenas, sin escena de inicio, un ciclo, una conducta prohibida sin motivo, una
opción hacia una escena ajena) sale **una vez**, con el código del mundo. ``canPublish`` es que no quede
ningún error; los avisos no bloquean.
"""
import re
from dataclasses import dataclass

from apps.simulation.casedef.export import ids_of, to_document
from apps.simulation.casedef.report import ERROR
from apps.simulation.casedef.validate import validate_document
from apps.simulation.services import validation_issues

from .definition_io import load_definition
from .guards import require_version
from .world_definition import run_world_validation

_BASE_SCENE = re.compile(r"^escenas\[(\d+)\]")
_SIEP_SCENE = re.compile(r"^x-siep\.escenas\[(\d+)\]")
_FEEDBACK = re.compile(r"^retroalimentacion\[(\d+)\]")


def _mentions_initial_scene(issue):
    return issue.path == "caso.escenaInicial" or (issue.path == "caso" and "escenaInicial" in issue.message)


#: código del mundo → ¿este hallazgo del documento es el mismo defecto? (R20: gana el del mundo).
SAME_DEFECT = {
    "NO_NODES": lambda issue: (
        issue.code == "DSL.OCL-01" or issue.path == "escenas" or _mentions_initial_scene(issue)
    ),
    "NO_START_NODE": _mentions_initial_scene,
    "GRAPH_CYCLE": lambda issue: issue.code == "DSL.PROP-06",
    "PROHIBITED_WITHOUT_REASON": lambda issue: issue.code == "DSL.FORMA" and "motivoProhibicion" in issue.message,
    "DECISION_NODE_NOT_IN_CASE": lambda issue: issue.code == "DSL.OCL-03",
}


def _is_duplicate(world_codes, issue):
    return any(code in world_codes and same(issue) for code, same in SAME_DEFECT.items())


def _scene_key(path, loaded, ids):
    """La clave de la escena a la que pertenece lo que ``path`` señala, o ``None``."""
    match = _BASE_SCENE.match(path)
    if match and int(match[1]) < len(ids.base_scenes):
        return ids.base_scenes[int(match[1])]
    match = _SIEP_SCENE.match(path)
    if match and int(match[1]) < len(loaded.definition.scenes):
        return loaded.definition.scenes[int(match[1])].key
    match = _FEEDBACK.match(path)
    owners = list(ids.feedback)  # (escena, opción) en el orden del documento
    if match and int(match[1]) < len(owners):
        return owners[int(match[1])][0]
    return None


def _document_issue(issue, loaded, ids):
    """``ValidationIssue`` de un hallazgo del documento, con el foco del editor si cae en una escena."""
    result = issue_dict(issue)
    key = _scene_key(issue.path, loaded, ids)
    if key in loaded.scene_node_ids:
        result["nodeId"] = loaded.scene_node_ids[key]
        if ".mapa" in issue.path and key in loaded.scene_map_ids:
            result["mapId"] = loaded.scene_map_ids[key]
    return result


def issue_dict(issue):
    result = {"code": issue.code, "severity": issue.severity, "message": issue.message}
    if issue.path:
        result["path"] = issue.path
    return result


def _can_publish(issues):
    return not any(issue["severity"] == ERROR for issue in issues)


@dataclass(frozen=True)
class Assessment:
    """La valoración de una versión: sus hallazgos y el documento que se validó (el que se sella)."""

    issues: list
    can_publish: bool
    document: dict
    #: El modelo del que sale el documento (lo usa la compuerta para medir la reutilización).
    definition: object


def assess_version(case_version_id):
    """Valora la versión: el mundo y el documento, sin repetir un mismo defecto, y el documento mismo."""
    version = require_version(case_version_id)
    world = run_world_validation(version)
    raw = list(world["errors"]) + list(world["warnings"])
    issues = validation_issues.build_issues(raw)

    loaded = load_definition(case_version_id)
    ids = ids_of(loaded.definition)
    document = to_document(loaded.definition)
    present = {item["code"] for item in raw}
    for issue in validate_document(document):
        if not _is_duplicate(present, issue):
            issues.append(_document_issue(issue, loaded, ids))
    return Assessment(issues, _can_publish(issues), document, loaded.definition)


def validate_version(case_version_id):
    """``(issues, canPublish)`` de la versión: el mundo y el documento, sin repetir un mismo defecto."""
    assessment = assess_version(case_version_id)
    return assessment.issues, assessment.can_publish


def validate_document_issues(document):
    """``(issues, canPublish)`` de un documento que aún no es una versión (la importación): solo ``DSL.*``."""
    issues = [issue_dict(issue) for issue in validate_document(document)]
    return issues, _can_publish(issues)


def validate_case(case_version_id):
    """C6: ``{issues: ValidationIssue[], canPublish}`` con mensajes llanos y sin ids."""
    issues, can_publish = validate_version(case_version_id)
    return {"issues": issues, "canPublish": can_publish}
