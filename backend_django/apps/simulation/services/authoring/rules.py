"""Las reglas del modelo de métricas de una versión: hitos, nivel de riesgo y finales (Tarea 11).

Tres operaciones, una por parte de ``case_versions.rules``, cada una con ``ensure_draft`` (solo un borrador;
revisión optimista: vencida es 409 ``REVISION_CONFLICT``) y validación estricta: todo lo que no cumple es un 400
``VALIDATION_ERROR`` con el ``field`` que lo causa (``milestones``, ``riskLevel`` o ``endings``), nunca un 500.
Escribir una parte conserva las demás claves del JSON (``secondChance``, ``feedbackTiming``, ``metrics``…).

La coherencia entre las partes también se exige al escribir: un hito no se puede quitar mientras una opción
(``effects.milestones``) o un final (``when``) lo sigue nombrando, y un final solo puede nombrar hitos declarados.
"""
import json

from django.db import transaction
from rest_framework import status

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import RiskLevel
from apps.simulation.models import DecisionOption
from apps.simulation.services import case_rules
from apps.simulation.services.text_rules import validate_plain_text
from shared.exceptions import ApiError
from shared.jsonutils import read_map

from .editor_view import editor
from .guards import bump_revision, ensure_draft

RISK_LEVELS = tuple(level.value for level in RiskLevel)
MAX_MILESTONES = 40
MAX_ENDINGS = 10
MAX_LABEL_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 2000
MAX_MESSAGE_LENGTH = 2000
#: El tono de un final; ``neutral`` si no se indica.
ENDING_TONES = ("critical", "positive", "warning", "neutral")
_MILESTONE_FIELDS = {"key", "label", "description", "decisive"}
_ENDING_FIELDS = {"key", "title", "message", "tone", "when"}


def _refuse(field, message):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


# ─── hitos ────────────────────────────────────────────────────────────────────────────────────
@transaction.atomic
def update_milestones(case_version_id, items, revision=None):
    """``PUT …/rules/milestones``: reemplaza la lista de hitos del caso (``[]`` los quita todos)."""
    version = ensure_draft(case_version_id, revision)
    milestones = _clean_milestones(items)
    raw = read_map(version.rules)
    removed = {m.key for m in case_rules.rules_of(version).milestones} - {m["key"] for m in milestones}
    for key in sorted(removed):
        _refuse_if_referenced(key, case_version_id, raw)
    _write(version, raw, milestones=milestones)
    bump_revision(case_version_id)
    return editor(case_version_id)


def _clean_milestones(items):
    if not isinstance(items, list):
        raise _refuse("milestones", "Los hitos deben ser una lista.")
    if len(items) > MAX_MILESTONES:
        raise _refuse("milestones", f"El caso admite hasta {MAX_MILESTONES} hitos.")
    seen, clean = set(), []
    for position, item in enumerate(items, start=1):
        where = f"hito {position}"
        if not isinstance(item, dict):
            raise _refuse("milestones", f"El {where} debe ser un objeto con key, label, description y decisive.")
        unknown = sorted(set(item) - _MILESTONE_FIELDS)
        if unknown:
            raise _refuse("milestones", f"El {where} trae un campo desconocido: {unknown[0]}.")
        key = _key(item.get("key"), "milestones", where)
        if key in seen:
            raise _refuse("milestones", f"El hito «{key}» está repetido.")
        seen.add(key)
        label = item.get("label")
        if not isinstance(label, str) or not label.strip() or len(label) > MAX_LABEL_LENGTH:
            raise _refuse("milestones", f"El hito «{key}» necesita un nombre de hasta {MAX_LABEL_LENGTH} caracteres.")
        description = item.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str) or len(description) > MAX_DESCRIPTION_LENGTH:
            raise _refuse(
                "milestones",
                f"La descripción del hito «{key}» debe ser un texto de hasta {MAX_DESCRIPTION_LENGTH} caracteres.",
            )
        # M-1 · el nombre y la descripción los lee el estudiante al cerrar (hitos del reporte): texto plano, como en el grafo.
        label = validate_plain_text(label, MAX_LABEL_LENGTH, "milestones")
        description = validate_plain_text(description, MAX_DESCRIPTION_LENGTH, "milestones", multiline=True)
        decisive = item.get("decisive", False)
        if not isinstance(decisive, bool):
            raise _refuse("milestones", f"Que el hito «{key}» sea decisivo se indica con sí o no.")
        clean.append({"key": key, "label": label, "description": description, "decisive": decisive})
    return clean


def _key(value, field, where):
    if not isinstance(value, str) or not case_rules.NAME.fullmatch(value):
        raise _refuse(field, f"El {where} necesita una clave de letras, números o «_» (hasta 60 caracteres).")
    return value


def _refuse_if_referenced(key, case_version_id, raw_rules):
    """400 si algo del caso todavía nombra el hito ``key``: una opción o la condición de un final."""
    for decision in DecisionOption.objects.filter(case_version_id=case_version_id):
        if key in case_rules.effects_of(decision).get("milestones", ()):
            raise _refuse(
                "milestones", f"El hito «{key}» no se puede quitar: la opción «{decision.option_key}» lo cumple."
            )
    for ending in _stored_endings(raw_rules):
        if key in milestone_refs(ending.get("when")):
            raise _refuse(
                "milestones",
                f"El hito «{key}» no se puede quitar: la condición del final «{ending.get('key')}» lo nombra.",
            )


def _stored_endings(raw_rules):
    endings = raw_rules.get("endings")
    return [e for e in endings if isinstance(e, dict)] if isinstance(endings, list) else []


def milestone_refs(condition):
    """Las claves de hito que nombra una condición (recorre ``all``, ``any`` y ``not``)."""
    if not isinstance(condition, dict):
        return set()
    refs = set()
    key = condition.get("milestone")
    if isinstance(key, str):
        refs.add(key)
    for group in ("all", "any"):
        items = condition.get(group)
        if isinstance(items, list):
            for item in items:
                refs |= milestone_refs(item)
    refs |= milestone_refs(condition.get("not"))
    return refs


# ─── nivel de riesgo ──────────────────────────────────────────────────────────────────────────
@transaction.atomic
def update_risk(case_version_id, level, revision=None):
    """``PUT …/rules/risk``: el nivel de riesgo del caso; ``None`` lo borra."""
    version = ensure_draft(case_version_id, revision)
    if level is not None and level not in RISK_LEVELS:
        raise _refuse("riskLevel", f"El nivel de riesgo debe ser uno de {', '.join(RISK_LEVELS)} (o ninguno).")
    _write(version, read_map(version.rules), riskLevel=level)
    bump_revision(case_version_id)
    return editor(case_version_id)


# ─── finales ──────────────────────────────────────────────────────────────────────────────────
@transaction.atomic
def update_endings(case_version_id, items, revision=None):
    """``PUT …/rules/endings``: reemplaza los finales del caso, en orden de evaluación (``[]`` los quita)."""
    version = ensure_draft(case_version_id, revision)
    declared = {m.key for m in case_rules.rules_of(version).milestones}
    _write(version, read_map(version.rules), endings=_clean_endings(items, declared))
    bump_revision(case_version_id)
    return editor(case_version_id)


def _clean_endings(items, declared):
    if not isinstance(items, list):
        raise _refuse("endings", "Los finales deben ser una lista.")
    if len(items) > MAX_ENDINGS:
        raise _refuse("endings", f"El caso admite hasta {MAX_ENDINGS} finales.")
    seen, clean = set(), []
    for position, item in enumerate(items, start=1):
        where = f"final {position}"
        if not isinstance(item, dict):
            raise _refuse("endings", f"El {where} debe ser un objeto con key, title, message, tone y when.")
        unknown = sorted(set(item) - _ENDING_FIELDS)
        if unknown:
            raise _refuse("endings", f"El {where} trae un campo desconocido: {unknown[0]}.")
        key = _key(item.get("key"), "endings", where)
        if key in seen:
            raise _refuse("endings", f"El final «{key}» está repetido.")
        seen.add(key)
        title, message = item.get("title"), item.get("message")
        if not isinstance(title, str) or not title.strip() or len(title) > MAX_LABEL_LENGTH:
            raise _refuse("endings", f"El final «{key}» necesita un título de hasta {MAX_LABEL_LENGTH} caracteres.")
        if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE_LENGTH:
            raise _refuse("endings", f"El final «{key}» necesita un mensaje de hasta {MAX_MESSAGE_LENGTH} caracteres.")
        # M-1 · el título y el mensaje del final los lee el estudiante: texto plano, como en el grafo.
        title = validate_plain_text(title, MAX_LABEL_LENGTH, "endings")
        message = validate_plain_text(message, MAX_MESSAGE_LENGTH, "endings", multiline=True)
        tone = item.get("tone") or "neutral"
        if tone not in ENDING_TONES:
            raise _refuse("endings", f"El tono del final «{key}» debe ser {', '.join(ENDING_TONES)}.")
        ending = {"key": key, "title": title, "message": message, "tone": tone}
        when = item.get("when")
        if when is not None:
            if not conditions.is_valid(when):
                raise _refuse("endings", f"La condición del final «{key}» no es válida.")
            for milestone in sorted(milestone_refs(when) - declared):
                raise _refuse(
                    "endings",
                    f"La condición del final «{key}» nombra el hito «{milestone}», que el caso no declara.",
                )
            ending["when"] = when
        clean.append(ending)
    return clean


# ─── escritura ────────────────────────────────────────────────────────────────────────────────
def _write(version, raw_rules, **changes):
    """Guarda ``rules`` con ``changes`` y el resto de claves intactas; un valor ``None`` quita la clave."""
    for name, value in changes.items():
        if value is None:
            raw_rules.pop(name, None)
        else:
            raw_rules[name] = value
    version.rules = json.dumps(raw_rules, ensure_ascii=False)
    version.save(update_fields=["rules"])

