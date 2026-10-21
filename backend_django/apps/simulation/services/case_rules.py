"""Reglas de una versión del caso (E1-7, E3-8; §2.1 principio 2 del plan estructural).

La segunda oportunidad, el momento de la retroalimentación, las métricas del caso y sus finales
son **datos de la versión**, no ``if`` repartidos por el servicio: ``case_versions.rules`` guarda
un JSON con

- ``secondChance`` (bool): ¿una primera respuesta riesgosa o inadecuada concede una segunda
  y última oportunidad sin cambiar métricas ni avanzar? Ausente = **apagada** (ED-7: los
  casos nuevos nacen sin ella; ``SIM-VBG-001`` la declara encendida, excepción explícita a
  RN-08 por la decisión 10, y la migración 0009 la enciende en las versiones ya existentes).
- ``feedbackTiming`` (``IMMEDIATE`` | ``AT_CLOSE``): cuándo llega la retroalimentación
  evaluativa. Ausente = ``IMMEDIATE`` (el comportamiento de siempre) hasta que el visual
  consuma la consecuencia narrativa; la bandera ``FEEDBACK_AT_CLOSE_ONLY`` lo fuerza a
  ``AT_CLOSE`` para todos los casos.
- ``metrics`` (``[{key, initial}]``, E3-8): las métricas del caso (0-100) y el valor con que
  parten. Ausente = el caso no declara métricas propias.
- ``endings`` (``[{key, title, message, tone, when?}]``, E3-8): los finales en orden de
  evaluación; gana el primero cuya condición ``when`` (ver ``conditions``) se cumple y el que
  no trae ``when`` es el valor por defecto. Ausente = el caso no declara finales propios.

Un valor ausente, de otro tipo o fuera del vocabulario toma el valor por defecto: una versión
con reglas ilegibles nunca rompe una partida (Review Focus 5 del maestro). Lo mismo vale para los
``effects`` de una opción (``normalize_effects``), que ``validate_effects`` exige estrictos al
autorarlos.
"""
import re
from dataclasses import dataclass

from django.conf import settings
from rest_framework import status

from apps.simulation.models.rubric import FormativeLevel
from shared.exceptions import ApiError
from shared.jsonutils import read_map

IMMEDIATE = "IMMEDIATE"
AT_CLOSE = "AT_CLOSE"
FEEDBACK_TIMINGS = (IMMEDIATE, AT_CLOSE)

SEVERITY_RECOMMENDED = "recommended"
SEVERITY_ACCEPTABLE = "acceptable"
SEVERITY_RISKY = "risky"
SEVERITY_CRITICAL = "critical"
SEVERITIES = (SEVERITY_RECOMMENDED, SEVERITY_ACCEPTABLE, SEVERITY_RISKY, SEVERITY_CRITICAL)

#: Topes de lo que una opción puede declarar (E3-8): un caso formativo mueve unas pocas métricas.
MAX_EFFECT_ENTRIES = 20
MAX_EFFECT_DELTA = 100
_NAME = re.compile(r"[A-Za-z0-9_]{1,60}")
#: Código de una competencia en los efectos de una opción (E6-1a): el del catálogo, en mayúsculas.
_COMPETENCY_CODE = re.compile(r"[A-Z0-9_]{1,100}")
#: Niveles formativos válidos de una competencia (``FormativeLevel``).
COMPETENCY_LEVELS = tuple(FormativeLevel.values)


@dataclass(frozen=True)
class CaseRules:
    second_chance: bool = False
    feedback_timing: str = IMMEDIATE
    #: ``((clave, valor inicial), …)``; vacío = el caso no declara métricas.
    metrics: tuple = ()
    #: Finales normalizados (``key``, ``title``, ``message``, ``tone`` y, si lo trae, ``when``).
    endings: tuple = ()


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_metrics(raw):
    if not isinstance(raw, list):
        return ()
    seen, parsed = set(), []
    for item in raw:
        if not isinstance(item, dict):
            continue
        key, initial = item.get("key"), item.get("initial", 50)
        if not isinstance(key, str) or not _NAME.fullmatch(key) or key in seen:
            continue
        if not _is_int(initial) or not 0 <= initial <= 100:
            continue
        seen.add(key)
        parsed.append((key, initial))
    return tuple(parsed)


def _parse_endings(raw):
    if not isinstance(raw, list):
        return ()
    parsed = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        key, title = item.get("key"), item.get("title")
        if not isinstance(key, str) or not key.strip() or not isinstance(title, str) or not title.strip():
            continue
        message, tone = item.get("message", ""), item.get("tone", "neutral")
        ending = {
            "key": key,
            "title": title,
            "message": message if isinstance(message, str) else "",
            "tone": tone if isinstance(tone, str) and tone else "neutral",
        }
        if "when" in item:
            ending["when"] = item["when"]
        parsed.append(ending)
    return tuple(parsed)


def rules_of(version):
    """Las reglas de la versión, con los valores por defecto donde falten o no sean válidos."""
    raw = read_map(version.rules)
    second_chance = raw.get("secondChance")
    timing = raw.get("feedbackTiming")
    return CaseRules(
        second_chance=second_chance if isinstance(second_chance, bool) else False,
        feedback_timing=timing if timing in FEEDBACK_TIMINGS else IMMEDIATE,
        metrics=_parse_metrics(raw.get("metrics")),
        endings=_parse_endings(raw.get("endings")),
    )


def feedback_at_close_only(rules):
    """¿La respuesta de una decisión debe omitir lo evaluativo? (bandera global o regla del caso)."""
    return bool(settings.FEEDBACK_AT_CLOSE_ONLY) or rules.feedback_timing == AT_CLOSE


# ─── los efectos de una opción ────────────────────────────────────────────────────────────────
def normalize_effects(raw):
    """Lo bien formado de los ``effects`` de una opción: ``{severity?, flags?, metrics?, competencies?}``.

    Indulgente a propósito (lee la base): descarta lo que no cumple y nunca lanza. Un ``{}``
    resultante significa «la opción no trae efectos propios».
    """
    if not isinstance(raw, dict):
        return {}
    effects = {}
    if raw.get("severity") in SEVERITIES:
        effects["severity"] = raw["severity"]
    flags = raw.get("flags")
    if isinstance(flags, dict):
        clean = {k: v for k, v in flags.items() if isinstance(k, str) and isinstance(v, bool)}
        if clean:
            effects["flags"] = clean
    metrics = raw.get("metrics")
    if isinstance(metrics, dict):
        clean = {k: v for k, v in metrics.items() if isinstance(k, str) and _is_int(v)}
        if clean:
            effects["metrics"] = clean
    competencies = raw.get("competencies")
    if isinstance(competencies, dict):
        clean = {
            k: v for k, v in competencies.items()
            if isinstance(k, str) and _COMPETENCY_CODE.fullmatch(k) and isinstance(v, str) and v in COMPETENCY_LEVELS
        }
        if clean:
            effects["competencies"] = clean
    return effects


def effects_of(decision):
    """Los efectos propios de la opción (datos del caso), o ``{}`` si no trae o están rotos."""
    return normalize_effects(read_map(getattr(decision, "effects", None)))


def competency_overrides(decision):
    """``{código de competencia: nivel}`` que la opción declara (E6-1a), o ``{}``.

    A qué competencias aporta la opción y con qué nivel; sin esto aporta a todas las de la rúbrica con el nivel de
    su severidad (ver ``assessment.competencies``). No forma parte de ``case_effects.option_effects``.
    """
    return effects_of(decision).get("competencies", {})


def _refuse(message):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field="effects")


def validate_effects(raw, allowed_metrics):
    """Los ``effects`` que manda el editor, estrictos: el normalizado o 400 con ``field: effects``.

    ``None`` y ``{}`` limpian. ``allowed_metrics`` son las claves de métrica que el caso declara.
    """
    if raw is None or raw == {}:
        return {}
    if not isinstance(raw, dict):
        raise _refuse("Los efectos deben ser un objeto con severity, flags, metrics y competencies.")
    unknown = sorted(set(raw) - {"severity", "flags", "metrics", "competencies"})
    if unknown:
        raise _refuse(
            f"Efecto desconocido: {unknown[0]}. Solo se admiten severity, flags, metrics y competencies."
        )
    effects = {}
    if "severity" in raw:
        if raw["severity"] not in SEVERITIES:
            raise _refuse("La severidad debe ser recommended, acceptable, risky o critical.")
        effects["severity"] = raw["severity"]
    if "flags" in raw:
        flags = raw["flags"]
        if not isinstance(flags, dict) or len(flags) > MAX_EFFECT_ENTRIES:
            raise _refuse(f"Las banderas deben ser un objeto de hasta {MAX_EFFECT_ENTRIES} entradas.")
        for name, value in flags.items():
            if not isinstance(name, str) or not _NAME.fullmatch(name) or not isinstance(value, bool):
                raise _refuse("Cada bandera necesita un nombre (letras, números o «_») y un valor sí/no.")
        effects["flags"] = dict(flags)
    if "metrics" in raw:
        metrics = raw["metrics"]
        if not isinstance(metrics, dict) or len(metrics) > MAX_EFFECT_ENTRIES:
            raise _refuse(f"Las métricas deben ser un objeto de hasta {MAX_EFFECT_ENTRIES} entradas.")
        for name, delta in metrics.items():
            if name not in allowed_metrics:
                raise _refuse(f"El caso no declara la métrica «{name}».")
            if not _is_int(delta) or abs(delta) > MAX_EFFECT_DELTA:
                raise _refuse(f"El cambio de «{name}» debe ser un entero entre -100 y 100.")
        effects["metrics"] = dict(metrics)
    if "competencies" in raw:
        competencies = raw["competencies"]
        if not isinstance(competencies, dict) or len(competencies) > MAX_EFFECT_ENTRIES:
            raise _refuse(f"Las competencias deben ser un objeto de hasta {MAX_EFFECT_ENTRIES} entradas.")
        for code, level in competencies.items():
            if not isinstance(code, str) or not _COMPETENCY_CODE.fullmatch(code):
                raise _refuse("Cada competencia se nombra con su código del catálogo: mayúsculas, números o «_».")
            if not isinstance(level, str) or level not in COMPETENCY_LEVELS:
                raise _refuse(
                    f"El nivel de «{code}» debe ser EN_INICIO, EN_PROCESO, LOGRADO o DESTACADO."
                )
        if competencies:
            effects["competencies"] = dict(competencies)
    return effects
