"""Del documento 1.0 (severidad, métricas y banderas) al modelo de respuesta: clase, persona e hitos.

Python puro: sin Django ni modelos. Es la misma conversión que hace la migración de datos ``0030`` sobre las filas que
ya existían, escrita como funciones puras para reutilizarla donde nace un caso desde un documento 1.0:

- el importador de documentos (``casedef.import_``), que convierte un documento ``x-siep 1.0`` (o el del taller, sin
  ``x-siep``) a la definición nueva al leerlo, para que las filas nazcan en la forma nueva (Tarea 12);
- ``endings.build_template`` (Tarea 6), que arma los finales de plantilla con ``template_endings_when``.

La migración ``0030`` queda congelada tal como se aplicó en las bases que ya la corrieron: aquí se espeja su tabla (no
se importa de ella). Si una cambia, la otra no sigue sola; las pruebas de ambas fijan los mismos valores.

Toda conversión es idempotente: lo que ya está en la forma nueva sale igual.
"""
from .vocabulary import DEFAULT_PERSONA_STEP, Intensity, ResponseClass, RiskLevel

#: Banderas que marcan un acto contraindicado (lo que el psicólogo NO debe hacer), no un paso profesional: no son
#: hitos. La clase CONTRAINDICATED de la opción que las enciende ya lleva ese hecho; el final «critico» antiguo usaba
#: la bandera y la condición de plantilla usa ``count: contraindicated`` en su lugar.
NEGATIVE_FLAGS = ("mediacion_agresor_intentada",)

#: Los hitos que deciden el final de cada caso conocido: lo que el psicólogo hace para proteger a la persona usuaria.
DECISIVE_BY_CASE = {
    "SIM-VBG-001": ("riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada"),
}
#: El nivel de riesgo de cada caso conocido; un caso fuera de la tabla no lo declara.
RISK_LEVEL_BY_CASE = {"SIM-VBG-001": RiskLevel.EXTREME}

#: Las claves de ``effects`` del modelo antiguo; un ``effects`` que ya no las trae está en la forma nueva.
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


def intensity_for(sensitive: bool) -> Intensity:
    """La intensidad de una escena a partir de su marca de contenido sensible."""
    return Intensity.HIGH if sensitive else Intensity.MEDIUM


# ─── las opciones ─────────────────────────────────────────────────────────────────────────────
def convert_effects(raw_effects: dict, response_class: ResponseClass) -> dict:
    """Los ``effects`` de una opción en el modelo nuevo: ``{persona, milestones, competencies}``.

    La persona es el paso por defecto de la clase; los hitos son las banderas encendidas (en el orden del documento)
    menos las de ``NEGATIVE_FLAGS``; las competencias se conservan si las traía. La severidad, las métricas y las
    banderas apagadas se descartan. Si ``raw_effects`` ya está en la forma nueva, sale igual (una copia).
    """
    raw = raw_effects if isinstance(raw_effects, dict) else {}
    if "persona" in raw and not any(key in raw for key in LEGACY_EFFECT_KEYS):
        return dict(raw)
    d_bond, d_act = DEFAULT_PERSONA_STEP[response_class]
    flags = raw.get("flags") if isinstance(raw.get("flags"), dict) else {}
    milestones = [key for key, value in flags.items() if value is True and key not in NEGATIVE_FLAGS]
    effects = {"persona": {"bond": d_bond, "activation": d_act}, "milestones": milestones}
    if isinstance(raw.get("competencies"), dict) and raw["competencies"]:
        effects["competencies"] = raw["competencies"]
    return effects


def milestone_keys(effects_in_order) -> list[str]:
    """Las claves de hito que usan las opciones, sin repetir y en orden de aparición (escena y opción).

    Cuenta las banderas del modelo antiguo (``flags``, encendidas o no: la bandera existe aunque una opción la apague)
    y los hitos ya declarados (``milestones``), y deja fuera las de ``NEGATIVE_FLAGS``.
    """
    keys = {}
    for raw in effects_in_order:
        raw = raw if isinstance(raw, dict) else {}
        flags = raw.get("flags") if isinstance(raw.get("flags"), dict) else {}
        declared = raw.get("milestones") if isinstance(raw.get("milestones"), list) else []
        for key in [*flags, *(item for item in declared if isinstance(item, str))]:
            if key not in NEGATIVE_FLAGS:
                keys.setdefault(key, None)
    return list(keys)


# ─── las reglas de la versión ─────────────────────────────────────────────────────────────────
def milestone_label(key: str) -> str:
    """El rótulo de un hito sin texto propio: la clave con espacios y la primera en mayúscula."""
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23): a confirmar con Psicología.
    text = key.replace("_", " ")
    return text[:1].upper() + text[1:]


def _milestone(key: str, decisive) -> dict:
    return {"key": key, "label": milestone_label(key), "description": "", "decisive": key in decisive}


def uses_legacy_condition(condition) -> bool:
    """¿La condición usa ``metric``, ``flag`` o un conteo por severidad (el vocabulario que se retira)?"""
    if isinstance(condition, list):
        return any(uses_legacy_condition(item) for item in condition)
    if not isinstance(condition, dict):
        return False
    if "metric" in condition or "flag" in condition or condition.get("count") == "critical":
        return True
    return any(uses_legacy_condition(value) for value in condition.values() if isinstance(value, (dict, list)))


def template_endings_when(decisive_keys) -> dict:
    """La condición de cada final de plantilla sobre las clases y los hitos decisivos.

    ``{clave: condición o None}`` en ``TEMPLATE_ORDER``; la de ``con_brechas`` es ``None``: es el final por defecto.
    """
    must = [{"milestone": milestone} for milestone in decisive_keys]
    critica = [{"count": "contraindicated", "gte": 2}]
    if must:
        critica.append({"all": [{"count": "contraindicated", "gte": 1}, {"not": {"all": must}}]})
    return {
        "critica": {"any": critica},
        "protectora": {"all": [{"count": "contraindicated", "eq": 0}, {"count": "risky", "lte": 1}, *must]},
        "riesgo_persistente": {"any": [*({"not": item} for item in must), {"count": "risky", "gte": 3}]},
        "con_brechas": None,
    }


def convert_endings(endings, decisive_keys, notes=None) -> list:
    """Los finales de la versión en el vocabulario nuevo y en el orden de la plantilla.

    Los cuatro antiguos pasan a sus claves nuevas conservando ``title``, ``message`` y ``tone`` y toman la condición de
    plantilla; un final con otra clave conserva clave y textos y pierde su ``when`` solo si usa el vocabulario antiguo
    (en ``notes``, si se da, queda una línea por cada uno). Los propios van entre los de plantilla y el de por defecto.
    """
    conditions = template_endings_when(decisive_keys)
    templates, others = {}, []
    for ending in endings:
        if not isinstance(ending, dict):
            continue
        new_key = ENDING_KEY_MAP.get(ending.get("key"), ending.get("key"))
        migrated = {"key": new_key, **{name: ending[name] for name in ("title", "message", "tone") if name in ending}}
        if new_key in TEMPLATE_ORDER:
            if conditions[new_key] is not None:
                migrated["when"] = conditions[new_key]
            templates[new_key] = migrated
            continue
        if "when" in ending:
            if uses_legacy_condition(ending["when"]):
                if notes is not None:
                    notes.append(
                        f"final «{new_key}» no es de plantilla: se le quitó el «when» (usaba metric, flag o conteos antiguos)"
                    )
            else:
                migrated["when"] = ending["when"]
        others.append(migrated)
    # El de por defecto (sin ``when``) va el último para que no tape a los demás.
    ordered = [templates[key] for key in TEMPLATE_ORDER[:-1] if key in templates]
    ordered += others
    ordered += [templates[key] for key in TEMPLATE_ORDER[-1:] if key in templates]
    return ordered


def convert_rules(raw_rules: dict, case_code: str, flag_keys_in_order) -> dict:
    """Las ``rules`` de una versión en el modelo nuevo.

    Quita ``metrics``; añade ``milestones`` a partir de las banderas que usan las opciones (``decisive`` según
    ``DECISIVE_BY_CASE``) y ``riskLevel`` si el caso está en ``RISK_LEVEL_BY_CASE``; reescribe los ``endings`` que ya
    traía, y si no traía, no los crea (los cubre la plantilla en tiempo de ejecución). Lo demás se conserva. Unas
    ``rules`` que ya tienen ``milestones`` y no ``metrics`` salen igual (una copia).
    """
    raw = raw_rules if isinstance(raw_rules, dict) else {}
    if "milestones" in raw and "metrics" not in raw:
        return dict(raw)
    keys = list(dict.fromkeys(key for key in flag_keys_in_order if key not in NEGATIVE_FLAGS))
    decisive = [key for key in DECISIVE_BY_CASE.get(case_code, ()) if key in keys]
    rules = {key: value for key, value in raw.items() if key != "metrics"}
    if keys:
        rules["milestones"] = [_milestone(key, decisive) for key in keys]
    if case_code in RISK_LEVEL_BY_CASE:
        rules["riskLevel"] = RISK_LEVEL_BY_CASE[case_code].value
    if isinstance(raw.get("endings"), list):
        rules["endings"] = convert_endings(raw["endings"], decisive)
    return rules
