"""Reglas de una versión del caso (E1-7, E3-8; §2.1 principio 2 del plan estructural).

La segunda oportunidad, el momento de la retroalimentación, las métricas del caso y sus finales
son **datos de la versión**, no ``if`` repartidos por el servicio: ``case_versions.rules`` guarda
un JSON con

- ``secondChance`` (bool): ¿una primera respuesta riesgosa o inadecuada concede una segunda
  y última oportunidad sin cambiar métricas ni avanzar? Ausente = **apagada** (ED-7: los
  casos nuevos nacen sin ella; ``SIM-VBG-001`` la declara encendida, excepción explícita a
  RN-08 por la decisión 10, y la migración 0009 la enciende en las versiones ya existentes).
- ``feedbackTiming`` (``IMMEDIATE`` | ``AT_CLOSE``): se sigue leyendo pero **no tiene efecto**: la decisión
  siempre devuelve solo su consecuencia y la retroalimentación llega al cerrar (la Tarea 16 del modelo de
  métricas lo retira de las reglas).
- ``metrics`` (``[{key, initial}]``, E3-8): las métricas del caso (0-100) y el valor con que
  parten. Ausente = el caso no declara métricas propias.
- ``endings`` (``[{key, title, message, tone, when?}]``, E3-8): los finales en orden de
  evaluación; gana el primero cuya condición ``when`` (ver ``conditions``) se cumple y el que
  no trae ``when`` es el valor por defecto. Ausente = el caso no declara finales propios.

- ``milestones`` (``[{key, label, description?, decisive?}]``, modelo nuevo): los hitos del caso; los
  efectos de una opción los marcan como cumplidos y ``decisive`` señala los que deciden el final.
- ``riskLevel`` (``VARIABLE`` | ``MODERATE`` | ``SEVERE`` | ``EXTREME``, modelo nuevo): el nivel de
  riesgo del caso; ausente o desconocido = ``None``.

Las reglas del modelo nuevo conviven con las viejas (``metrics``, ``flags``, ``severity``) hasta
que se retiren estas.

Un valor ausente, de otro tipo o fuera del vocabulario toma el valor por defecto: una versión
con reglas ilegibles nunca rompe una partida (Review Focus 5 del maestro). Lo mismo vale para los
``effects`` de una opción (``normalize_effects``), que ``validate_effects`` exige estrictos al
autorarlos.
"""
import re
from dataclasses import dataclass

from rest_framework import status

from apps.simulation.casedef.vocabulary import RiskLevel
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
#: Las dos dimensiones del estado de la persona que una opción puede mover (``effects.persona``).
PERSONA_KEYS = ("bond", "activation")


@dataclass(frozen=True)
class Milestone:
    """Un hito del caso: algo que el psicólogo hace y que puede decidir el final."""

    key: str
    label: str
    description: str = ""
    decisive: bool = False


@dataclass(frozen=True)
class CaseRules:
    second_chance: bool = False
    feedback_timing: str = IMMEDIATE
    #: ``((clave, valor inicial), …)``; vacío = el caso no declara métricas.
    metrics: tuple = ()
    #: Finales normalizados (``key``, ``title``, ``message``, ``tone`` y, si lo trae, ``when``).
    endings: tuple = ()
    #: Los hitos del caso (modelo nuevo); vacío = el caso no declara hitos.
    milestones: tuple[Milestone, ...] = ()
    #: El nivel de riesgo del caso (``rules.riskLevel``); ``None`` si no lo declara o no se reconoce.
    risk_level: RiskLevel | None = None


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_step(value):
    """Un cambio de la persona en un paso: entero de -1 a 1."""
    return _is_int(value) and -1 <= value <= 1


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


def _parse_milestones(raw):
    """Los hitos bien formados; descarta lo roto y los repetidos, nunca lanza."""
    if not isinstance(raw, list):
        return ()
    seen, parsed = set(), []
    for item in raw:
        if not isinstance(item, dict):
            continue
        key, label = item.get("key"), item.get("label")
        if not isinstance(key, str) or not _NAME.fullmatch(key) or key in seen:
            continue
        if not isinstance(label, str) or not label.strip():
            continue
        description, decisive = item.get("description", ""), item.get("decisive", False)
        seen.add(key)
        parsed.append(
            Milestone(
                key=key,
                label=label,
                description=description if isinstance(description, str) else "",
                decisive=decisive if isinstance(decisive, bool) else False,
            )
        )
    return tuple(parsed)


def _parse_risk_level(raw):
    try:
        return RiskLevel(raw) if isinstance(raw, str) else None
    except ValueError:
        return None


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
        milestones=_parse_milestones(raw.get("milestones")),
        risk_level=_parse_risk_level(raw.get("riskLevel")),
    )


# ─── los efectos de una opción ────────────────────────────────────────────────────────────────
def normalize_effects(raw):
    """Lo bien formado de los ``effects`` de una opción.

    ``{severity?, flags?, metrics?, competencies?, persona?, milestones?}``: ``persona`` es
    ``{bond?, activation?}`` con enteros de -1 a 1 y ``milestones`` la lista de claves de hito.

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
    persona = raw.get("persona")
    if isinstance(persona, dict):
        clean = {k: persona[k] for k in PERSONA_KEYS if k in persona and _is_step(persona[k])}
        if clean:
            effects["persona"] = clean
    milestones = raw.get("milestones")
    if isinstance(milestones, list):
        clean = list(dict.fromkeys(m for m in milestones if isinstance(m, str) and _NAME.fullmatch(m)))
        if clean:
            effects["milestones"] = clean
    return effects


def effects_of(decision):
    """Los efectos propios de la opción (datos del caso), o ``{}`` si no trae o están rotos."""
    return normalize_effects(read_map(getattr(decision, "effects", None)))


def competency_overrides(decision):
    """``{código de competencia: nivel}`` que la opción declara (E6-1a), o ``{}``.

    A qué competencias aporta la opción y con qué nivel; sin esto no aporta a ninguna (ver ``assessment.competencies``).
    No forma parte de ``case_effects.option_effects``.
    """
    return effects_of(decision).get("competencies", {})


def _refuse(message):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field="effects")


def validate_effects(raw, allowed_metrics, allowed_milestones=()):
    """Los ``effects`` que manda el editor, estrictos: el normalizado o 400 con ``field: effects``.

    ``None`` y ``{}`` limpian. ``allowed_metrics`` son las claves de métrica que el caso declara y
    ``allowed_milestones`` las de sus hitos.
    """
    if raw is None or raw == {}:
        return {}
    if not isinstance(raw, dict):
        raise _refuse(
            "Los efectos deben ser un objeto con severity, flags, metrics, competencies, persona y milestones."
        )
    unknown = sorted(set(raw) - {"severity", "flags", "metrics", "competencies", "persona", "milestones"})
    if unknown:
        raise _refuse(
            f"Efecto desconocido: {unknown[0]}. "
            "Solo se admiten severity, flags, metrics, competencies, persona y milestones."
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
    if "persona" in raw:
        persona = raw["persona"]
        if not isinstance(persona, dict):
            raise _refuse("El estado de la persona debe ser un objeto con bond y activation.")
        for name, step in persona.items():
            if name not in PERSONA_KEYS:
                raise _refuse(f"De la persona solo se mueven bond y activation, no «{name}».")
            if not _is_step(step):
                raise _refuse(f"El cambio de «{name}» debe ser un entero entre -1 y 1.")
        if persona:
            effects["persona"] = dict(persona)
    if "milestones" in raw:
        milestones = raw["milestones"]
        if not isinstance(milestones, list) or len(milestones) > MAX_EFFECT_ENTRIES:
            raise _refuse(f"Los hitos deben ser una lista de hasta {MAX_EFFECT_ENTRIES} claves.")
        for key in milestones:
            if not isinstance(key, str) or not _NAME.fullmatch(key):
                raise _refuse("Cada hito se nombra con una clave: letras, números o «_».")
            if key not in allowed_milestones:
                raise _refuse(f"El caso no declara el hito «{key}».")
        if milestones:
            effects["milestones"] = list(dict.fromkeys(milestones))
    return effects
