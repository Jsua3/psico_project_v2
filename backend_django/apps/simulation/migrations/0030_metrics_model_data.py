"""Modelo de respuesta · Migración de datos: de severidad, métricas y banderas a clase, persona e hitos.

Convierte lo que ya existe al modelo nuevo; las columnas viejas NO se tocan (se retiran en la contracción):

- ``decision_options.response_class``: ``CONTRAINDICATED`` si la opción trae conducta prohibida o severidad crítica;
  si no, la severidad de sus ``effects`` (``recommended``/``acceptable``/``risky``); sin severidad, la clasificación
  (``ADEQUATE``→``RECOMMENDED``, ``RISKY``→``RISKY``, ``INADEQUATE``→``CONTRAINDICATED``); y si nada coincide,
  ``ACCEPTABLE``. La tabla vive en ``casedef.vocabulary.legacy_class``; aquí no se copia.
- ``decision_options.effects``: de ``{severity, flags, metrics, competencies}`` a ``{persona, milestones, competencies}``:
  el paso por defecto de la persona según la clase, las banderas encendidas como hitos y las competencias que ya traía.
  Las banderas apagadas, las que marcan un acto contraindicado (``NEGATIVE_FLAGS``) y las métricas se descartan.
- ``simulation_nodes.intensity``: ``HIGH`` en las escenas con contenido sensible.
- ``case_versions.rules``: ``milestones`` a partir de las banderas que usan las opciones de la versión (en
  ``SIM-VBG-001``, tres son decisivos y el riesgo del caso es ``EXTREME``), los finales que ya tenía reescritos al
  vocabulario nuevo y sin ``metrics``. Una versión sin ``rules.endings`` no gana finales: los cubre la plantilla en
  tiempo de ejecución.
- ``attempt_world_states.flags_json``: ``caseFlags`` (las encendidas) pasan a ``milestones[]``, se agrega ``persona``
  (el estado inicial movido por las decisiones registradas del intento, en orden) y se borra ``caseMetrics``.

No toca ``attempt_reports``: un reporte congelado no se lee ni se reescribe. Es idempotente: una fila ya migrada queda
igual y correrla dos veces da las mismas filas. Al terminar imprime un informe para que Psicología lo revise.

**No tiene reversa de datos.** Retroceder esta migración no hace nada (``RunPython.noop``): el modelo antiguo guardaba
más información que el nuevo (métricas 0-100, banderas apagadas, la severidad exacta) y no se puede reconstruir; para
volver atrás se restaura la copia de la base de datos.
"""
import json

from django.db import migrations

from apps.simulation.casedef.vocabulary import (
    DEFAULT_PERSONA_STEP,
    INITIAL_PERSONA,
    Activation,
    Bond,
    Intensity,
    ResponseClass,
    RiskLevel,
    legacy_class,
    step_persona,
)

BATCH = 500
VBG_CODE = "SIM-VBG-001"
#: Los hitos que deciden el final de SIM-VBG-001: lo que el psicólogo hace para proteger a la persona usuaria.
VBG_DECISIVE = ("riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada")
#: Banderas que marcan un acto contraindicado (lo que el psicólogo NO debe hacer), no un paso profesional: no son
#: hitos. La clase CONTRAINDICATED de la opción que las enciende ya lleva ese hecho; el final «critico» antiguo usaba
#: la bandera y la condición de plantilla usa ``count: contraindicated`` en su lugar. La lista se completó en la Tarea 12
#: del modelo de métricas (antes solo traía la mediación con el agresor); la 0030 no se había aplicado fuera de bases desechables.
NEGATIVE_FLAGS = ("mediacion_agresor_intentada", "noticia_muerte_mal_manejada", "interrogatorio_prematuro")
REGISTERED_EVENTS = ("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")
LEGACY_EFFECT_KEYS = ("severity", "flags", "metrics")

#: Los finales antiguos de SIM-VBG-001 y el final de plantilla en que se convierten.
ENDING_KEY_MAP = {
    "critico": "critica",
    "integral": "protectora",
    "riesgo": "riesgo_persistente",
    "brechas": "con_brechas",
}
#: El orden de evaluación de los finales de plantilla: gana el primero que se cumple; el último es el de por defecto.
TEMPLATE_ORDER = ("critica", "protectora", "riesgo_persistente", "con_brechas")


def _loads(text):
    """El objeto JSON de una columna de texto, o ``{}`` si está vacío, roto o no es un objeto."""
    try:
        value = json.loads(text) if text else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _dumps(value):
    return json.dumps(value, ensure_ascii=False)


# ─── las opciones ─────────────────────────────────────────────────────────────────────────────
def _new_effects(raw, response_class):
    """Los ``effects`` en el modelo nuevo, o ``None`` si la fila ya está migrada."""
    if "persona" in raw and not any(key in raw for key in LEGACY_EFFECT_KEYS):
        return None
    d_bond, d_act = DEFAULT_PERSONA_STEP[response_class]
    flags = raw.get("flags") if isinstance(raw.get("flags"), dict) else {}
    milestones = [key for key, value in flags.items() if value is True and key not in NEGATIVE_FLAGS]
    effects = {"persona": {"bond": d_bond, "activation": d_act}, "milestones": milestones}
    if isinstance(raw.get("competencies"), dict) and raw["competencies"]:
        effects["competencies"] = raw["competencies"]
    return effects


def _migrate_options(apps):
    """Clase y efectos de cada opción. Devuelve el informe, las claves de hito por versión (en orden de aparición) y
    las banderas negativas que se dejaron fuera de los hitos."""
    DecisionOption = apps.get_model("simulation", "DecisionOption")
    rows = DecisionOption.objects.select_related("case_version__simulation_case").order_by("case_version_id", "id")
    changed, counts, critical_without_conduct, keys_by_version, excluded = [], {}, [], {}, set()
    for option in rows.iterator(chunk_size=BATCH):
        raw = _loads(option.effects)
        keys = keys_by_version.setdefault(option.case_version_id, {})
        flags = raw.get("flags") if isinstance(raw.get("flags"), dict) else {}
        declared = raw.get("milestones") if isinstance(raw.get("milestones"), list) else []
        for key in [*flags, *(k for k in declared if isinstance(k, str))]:
            if key in NEGATIVE_FLAGS:
                excluded.add(key)
            else:
                keys.setdefault(key, None)

        was_empty = option.response_class is None
        severity = raw.get("severity")
        response_class = (
            ResponseClass(option.response_class)
            if option.response_class
            else legacy_class(option.classification, severity, option.prohibited_conduct)
        )
        if was_empty and severity == "critical" and not option.prohibited_conduct:
            version = option.case_version
            critical_without_conduct.append(f"{version.simulation_case.code} v{version.semantic_version} {option.option_key}")
        counts[response_class] = counts.get(response_class, 0) + 1

        effects = _new_effects(raw, response_class)
        if was_empty or effects is not None:
            option.response_class = response_class.value
            if effects is not None:
                option.effects = _dumps(effects)
            changed.append(option)
        if len(changed) >= BATCH:
            DecisionOption.objects.bulk_update(changed, ["response_class", "effects"])
            changed = []
    if changed:
        DecisionOption.objects.bulk_update(changed, ["response_class", "effects"])
    return counts, critical_without_conduct, keys_by_version, excluded


# ─── las escenas ──────────────────────────────────────────────────────────────────────────────
def _migrate_nodes(apps):
    SimulationNode = apps.get_model("simulation", "SimulationNode")
    SimulationNode.objects.filter(sensitive_content=True, intensity=Intensity.MEDIUM.value).update(
        intensity=Intensity.HIGH.value
    )


# ─── las reglas de cada versión ───────────────────────────────────────────────────────────────
def _label(key):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23): a confirmar con Psicología.
    text = key.replace("_", " ")
    return text[:1].upper() + text[1:]


def _milestone(key, decisive):
    return {"key": key, "label": _label(key), "description": "", "decisive": key in decisive}


def _uses_legacy(condition):
    """¿La condición usa ``metric``, ``flag`` o un conteo por severidad (el vocabulario que se retira)?"""
    if isinstance(condition, list):
        return any(_uses_legacy(item) for item in condition)
    if not isinstance(condition, dict):
        return False
    if "metric" in condition or "flag" in condition or condition.get("count") == "critical":
        return True
    return any(_uses_legacy(value) for value in condition.values() if isinstance(value, (dict, list)))


def _template_when(key, decisive):
    """La condición del final de plantilla ``key`` sobre las clases y los hitos decisivos; ``None`` = por defecto."""
    must = [{"milestone": milestone} for milestone in decisive]
    if key == "critica":
        branches = [{"count": "contraindicated", "gte": 2}]
        if must:
            branches.append({"all": [{"count": "contraindicated", "gte": 1}, {"not": {"all": must}}]})
        return {"any": branches}
    if key == "protectora":
        return {"all": [{"count": "contraindicated", "eq": 0}, {"count": "risky", "lte": 1}, *must]}
    if key == "riesgo_persistente":
        return {"any": [*({"not": item} for item in must), {"count": "risky", "gte": 3}]}
    return None


def _migrate_endings(endings, decisive, notes):
    """Los finales de la versión en el vocabulario nuevo y en el orden de la plantilla."""
    templates, others = {}, []
    for ending in endings:
        if not isinstance(ending, dict):
            continue
        new_key = ENDING_KEY_MAP.get(ending.get("key"), ending.get("key"))
        migrated = {name: ending[name] for name in ("title", "message", "tone") if name in ending}
        migrated = {"key": new_key, **migrated}
        if new_key in TEMPLATE_ORDER:
            when = _template_when(new_key, decisive)
            if when is not None:
                migrated["when"] = when
            templates[new_key] = migrated
            continue
        if "when" in ending:
            if _uses_legacy(ending["when"]):
                notes.append(f"final «{new_key}» no es de plantilla: se le quitó el «when» (usaba metric, flag o conteos antiguos)")
            else:
                migrated["when"] = ending["when"]
        others.append(migrated)
    # El de por defecto (sin ``when``) va el último para que no tape a los demás.
    ordered = [templates[key] for key in TEMPLATE_ORDER[:-1] if key in templates]
    ordered += others
    ordered += [templates[key] for key in TEMPLATE_ORDER[-1:] if key in templates]
    return ordered


def _migrate_rules(apps, keys_by_version):
    """Las reglas de cada versión. Devuelve ``{versión: [claves de hito]}`` para el informe."""
    CaseVersion = apps.get_model("simulation", "CaseVersion")
    report, changed = {}, []
    for version in CaseVersion.objects.select_related("simulation_case").order_by("id").iterator(chunk_size=BATCH):
        raw = _loads(version.rules)
        label = f"{version.simulation_case.code} v{version.semantic_version}"
        if "milestones" in raw and "metrics" not in raw:
            report[label] = [item.get("key") for item in raw["milestones"] if isinstance(item, dict)]
            continue  # ya migrada
        is_vbg = version.simulation_case.code == VBG_CODE
        keys = list(keys_by_version.get(version.id, {}))
        decisive = [key for key in VBG_DECISIVE if key in keys] if is_vbg else []
        rules = {key: value for key, value in raw.items() if key != "metrics"}
        if keys:
            rules["milestones"] = [_milestone(key, decisive) for key in keys]
        if is_vbg:
            rules["riskLevel"] = RiskLevel.EXTREME.value
        if isinstance(raw.get("endings"), list):
            notes = []
            rules["endings"] = _migrate_endings(raw["endings"], decisive, notes)
            for note in notes:
                print(f"  - {label}: {note}")
        report[label] = keys
        if rules != raw:
            version.rules = _dumps(rules)
            changed.append(version)
    if changed:
        CaseVersion.objects.bulk_update(changed, ["rules"], batch_size=BATCH)
    return report


# ─── los intentos ─────────────────────────────────────────────────────────────────────────────
def _migrate_world_states(apps):
    """``caseFlags`` → ``milestones``, ``persona`` desde las decisiones registradas y sin ``caseMetrics``."""
    DecisionOption = apps.get_model("simulation", "DecisionOption")
    AttemptEvent = apps.get_model("simulation", "AttemptEvent")
    AttemptWorldState = apps.get_model("simulation", "AttemptWorldState")

    class_by_option = {
        option_id: ResponseClass(value)
        for option_id, value in DecisionOption.objects.exclude(response_class=None).values_list("id", "response_class")
    }
    decisions = {}
    events = AttemptEvent.objects.filter(event_type__in=REGISTERED_EVENTS, decision_option__isnull=False)
    for attempt_id, option_id in events.order_by("attempt_id", "occurred_at", "id").values_list("attempt_id", "decision_option_id"):
        decisions.setdefault(attempt_id, []).append(option_id)

    changed, migrated = [], 0
    for state in AttemptWorldState.objects.order_by("attempt_id").iterator(chunk_size=BATCH):
        raw = _loads(state.flags_json)
        if "persona" in raw:
            continue  # ya migrado
        case_flags = raw.pop("caseFlags", None)
        raw.pop("caseMetrics", None)
        bond, activation = INITIAL_PERSONA
        for option_id in decisions.get(state.attempt_id, []):
            response_class = class_by_option.get(option_id)
            if response_class is not None:
                bond, activation = step_persona(bond, activation, *DEFAULT_PERSONA_STEP[response_class])
        raw["milestones"] = [key for key, value in (case_flags or {}).items() if value is True]
        raw["persona"] = {"bond": Bond(bond).value, "activation": Activation(activation).value}
        state.flags_json = _dumps(raw)
        changed.append(state)
        migrated += 1
        if len(changed) >= BATCH:
            AttemptWorldState.objects.bulk_update(changed, ["flags_json"])
            changed = []
    if changed:
        AttemptWorldState.objects.bulk_update(changed, ["flags_json"])
    return migrated


# ─── la migración ─────────────────────────────────────────────────────────────────────────────
def forward(apps, schema_editor):
    print("\n[0030 · modelo de respuesta] informe para Psicología:")
    counts, critical_without_conduct, keys_by_version, excluded = _migrate_options(apps)
    _migrate_nodes(apps)
    rules_report = _migrate_rules(apps, keys_by_version)
    migrated_states = _migrate_world_states(apps)

    per_class = ", ".join(f"{member.value}={counts.get(member, 0)}" for member in ResponseClass)
    print(f"  Opciones por clase: {per_class}.")
    print(
        f"  Opciones con severidad crítica SIN conducta prohibida (pasan a CONTRAINDICATED; revisar): "
        f"{len(critical_without_conduct)}" + (f" ({'; '.join(critical_without_conduct)})" if critical_without_conduct else "") + "."
    )
    if excluded:
        print(f"  Banderas que NO pasan a hitos (marcan un acto contraindicado): {', '.join(sorted(excluded))}.")
    for label, keys in rules_report.items():
        print(f"  Hitos de {label}: {', '.join(keys) if keys else '(ninguno)'}.")
    print(f"  Estados de intento migrados: {migrated_states}.")


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0029_response_class_and_intensity"),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
