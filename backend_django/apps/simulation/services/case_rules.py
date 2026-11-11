"""Reglas de una versión del caso (E1-7, E3-8; §2.1 principio 2 del plan estructural).

La segunda oportunidad, los hitos, el nivel de riesgo y los finales son **datos de la versión**, no ``if`` repartidos
por el servicio: ``case_versions.rules`` guarda un JSON con

- ``secondChance`` (bool): ¿una primera respuesta con riesgo o contraindicada concede una segunda y última
  oportunidad sin cambiar el estado del intento ni avanzar? Ausente = **apagada** (ED-7: los casos nuevos nacen sin
  ella; ``SIM-VBG-001`` la declara encendida, excepción explícita a RN-08 por la decisión 10, y la migración 0009 la
  enciende en las versiones ya existentes).
- ``milestones`` (``[{key, label, description?, decisive?}]``): los hitos del caso; los efectos de una opción los
  marcan como cumplidos y ``decisive`` señala los que deciden el final.
- ``riskLevel`` (``VARIABLE`` | ``MODERATE`` | ``SEVERE`` | ``EXTREME``): el nivel de riesgo del caso; ausente o
  desconocido = ``None``.
- ``endings`` (``[{key, title, message, tone, when?}]``): los finales en orden de evaluación; gana el primero cuya
  condición ``when`` (ver ``conditions``) se cumple y el que no trae ``when`` es el valor por defecto. Ausente = el
  caso no declara finales propios y aplica la plantilla (``endings.build_template``).

Una clave que no sea de esa lista (las ``metrics`` y el ``feedbackTiming`` del modelo antiguo, por ejemplo) se ignora:
una versión escrita antes no se rompe, solo deja de decir algo.

Un valor ausente, de otro tipo o fuera del vocabulario toma el valor por defecto: una versión con reglas ilegibles
nunca rompe una partida (Review Focus 5 del maestro). Lo mismo vale para los ``effects`` de una opción
(``normalize_effects``), que ``validate_effects`` exige estrictos al autorarlos.
"""
import json
import re
from dataclasses import dataclass

from rest_framework import status

from apps.simulation.casedef import conditions
from apps.simulation.casedef.vocabulary import (
    EXPRESSIONS,
    GESTURES,
    REACTION_KEYS,
    REACTION_LINE_MAX,
    REQUIRES_MAX_CHARS,
    RiskLevel,
)
from apps.simulation.models.rubric import FormativeLevel
from shared.exceptions import ApiError
from shared.jsonutils import read_map

#: Tope de lo que una opción puede declarar (E3-8): unos pocos hitos y competencias por respuesta.
MAX_EFFECT_ENTRIES = 20
_NAME = re.compile(r"[A-Za-z0-9_]{1,60}")
#: El patrón público de una clave (hito o final): lo usa la autoría para validar.
NAME = _NAME
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
    #: Finales normalizados (``key``, ``title``, ``message``, ``tone`` y, si lo trae, ``when``).
    endings: tuple = ()
    #: Los hitos del caso; vacío = el caso no declara hitos.
    milestones: tuple[Milestone, ...] = ()
    #: El nivel de riesgo del caso (``rules.riskLevel``); ``None`` si no lo declara o no se reconoce.
    risk_level: RiskLevel | None = None


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_step(value):
    """Un cambio de la persona en un paso: entero de -1 a 1."""
    return _is_int(value) and -1 <= value <= 1


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
        # Sugerido por el asistente de IA y sin revisar (P5): siempre un booleano.
        ending["aiSuggested"] = item.get("aiSuggested") is True
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
    return CaseRules(
        second_chance=second_chance if isinstance(second_chance, bool) else False,
        endings=_parse_endings(raw.get("endings")),
        milestones=_parse_milestones(raw.get("milestones")),
        risk_level=_parse_risk_level(raw.get("riskLevel")),
    )


# ─── los efectos de una opción ────────────────────────────────────────────────────────────────
def normalize_effects(raw):
    """Lo bien formado de los ``effects`` de una opción.

    ``{competencies?, persona?, milestones?}``: ``persona`` es ``{bond?, activation?}`` con enteros de -1 a 1 y
    ``milestones`` la lista de claves de hito.

    Indulgente a propósito (lee la base): descarta lo que no cumple, incluido el vocabulario del modelo antiguo
    (``severity``, ``flags``, ``metrics``), y nunca lanza. Un ``{}`` resultante significa «la opción no trae efectos
    propios».
    """
    if not isinstance(raw, dict):
        return {}
    effects = {}
    competencies = raw.get("competencies")
    if isinstance(competencies, list):  # la forma nueva: solo los códigos; el nivel sale de la clase de la respuesta
        competencies = {code: None for code in competencies if isinstance(code, str)}
    if isinstance(competencies, dict):
        clean = {
            k: v for k, v in competencies.items()
            if isinstance(k, str) and _COMPETENCY_CODE.fullmatch(k) and _is_competency_level(v)
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


def _is_competency_level(value):
    """Un nivel formativo válido o ``None`` (la competencia marcada sin nivel: lo da la clase de la respuesta)."""
    return value is None or (isinstance(value, str) and value in COMPETENCY_LEVELS)


def effects_of(decision):
    """Los efectos propios de la opción (datos del caso), o ``{}`` si no trae o están rotos."""
    return normalize_effects(read_map(getattr(decision, "effects", None)))


def competency_overrides(decision):
    """``{código de competencia: nivel o None}`` que la opción declara (E6-1a), o ``{}``.

    A qué competencias aporta la opción. El nivel es el que el autor fijó (``E6-1a``) o ``None`` si solo marcó la
    competencia: entonces sale de la clase de la respuesta (ver ``assessment.competencies``). Sin esto la opción no
    aporta a ninguna.
    """
    return effects_of(decision).get("competencies", {})


def _refuse(message, field="effects"):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


def validate_effects(raw, allowed_milestones=()):
    """Los ``effects`` que manda el editor, estrictos: el normalizado o 400 con ``field: effects``.

    ``None`` y ``{}`` limpian. ``allowed_milestones`` son las claves de los hitos que el caso declara.
    """
    if raw is None or raw == {}:
        return {}
    if not isinstance(raw, dict):
        raise _refuse(
            "Los efectos deben ser un objeto con competencies, persona y milestones."
        )
    unknown = sorted(set(raw) - {"competencies", "persona", "milestones"})
    if unknown:
        raise _refuse(f"Efecto desconocido: {unknown[0]}. Solo se admiten competencies, persona y milestones.")
    effects = {}
    if "competencies" in raw:
        competencies = raw["competencies"]
        if isinstance(competencies, list):  # la forma nueva: solo los códigos (el nivel lo da la clase)
            if not all(isinstance(code, str) for code in competencies):
                raise _refuse("Cada competencia de la lista se nombra con su código del catálogo (un texto).")
            competencies = {code: None for code in competencies}
        elif not isinstance(competencies, dict):
            raise _refuse(
                f"Las competencias deben ser una lista de códigos o un objeto de hasta {MAX_EFFECT_ENTRIES} entradas."
            )
        if len(competencies) > MAX_EFFECT_ENTRIES:
            raise _refuse(
                f"Las competencias deben ser una lista de códigos o un objeto de hasta {MAX_EFFECT_ENTRIES} entradas."
            )
        for code, level in competencies.items():
            if not isinstance(code, str) or not _COMPETENCY_CODE.fullmatch(code):
                raise _refuse("Cada competencia se nombra con su código del catálogo: mayúsculas, números o «_».")
            if not _is_competency_level(level):
                raise _refuse(
                    f"El nivel de «{code}» debe ser EN_INICIO, EN_PROCESO, LOGRADO o DESTACADO (o ninguno: lo da la clase)."
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


# ─── el requisito y la reacción de una opción (DSL 2.1) ──────────────────────────────────────


def requires_of(decision):
    """El requisito de la opción: ``{}`` si no tiene, la condición si es válida, ``None`` si lo guardado está roto.

    Lectura estricta a propósito: ``read_map`` convertiría un JSON roto en ``{}`` («sin requisito») y la opción
    quedaría disponible con datos rotos. Quien la usa trata ``None`` como «no disponible».
    """
    raw = getattr(decision, "requires_json", None)
    if raw is None or raw == "":
        return None
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(value, dict):
        return None
    if value == {}:
        return {}
    return value if conditions.is_valid(value, facts=True) else None


def reaction_of(decision):
    """La reacción guardada de la opción, o ``{}`` si no trae o está rota (lectura indulgente, como ``effects_of``)."""
    return read_map(getattr(decision, "reaction_json", None))


def validate_requires(raw):
    """El requisito que manda el editor, estricto: la condición o 400 con ``field: requires``. ``None`` y ``{}`` limpian."""
    if raw is None or raw == {}:
        return {}
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    if not isinstance(raw, dict) or not conditions.is_valid(raw, facts=True):
        raise _refuse("El requisito no es una condición válida del vocabulario del caso.", "requires")
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    if len(json.dumps(raw, ensure_ascii=False)) > REQUIRES_MAX_CHARS:
        raise _refuse(f"El requisito es demasiado largo: el máximo es {REQUIRES_MAX_CHARS} caracteres.", "requires")
    return raw


def validate_reaction(raw, character_keys):
    """La reacción que manda el editor, estricta: solo las claves no vacías, o 400 con ``field: reaction``.

    ``None`` y ``{}`` limpian. ``character_keys`` son las claves de los personajes que declara el caso.
    """
    if raw is None or raw == {}:
        return {}
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    if not isinstance(raw, dict):
        raise _refuse("La reacción debe ser un objeto con linea, emocion, gesto y personaje.", "reaction")
    unknown = [key for key in raw if key not in REACTION_KEYS]
    if unknown:
        raise _refuse(f"La reacción no admite «{unknown[0]}»: solo {', '.join(REACTION_KEYS)}.", "reaction")
    reaction = {}
    for key in REACTION_KEYS:
        value = raw.get(key)
        if value is None or value == "":
            continue
        if not isinstance(value, str):
            raise _refuse(f"«{key}» de la reacción debe ser un texto.", "reaction")
        if key == "linea" and len(value) > REACTION_LINE_MAX:
            raise _refuse(f"La línea de la reacción admite hasta {REACTION_LINE_MAX} caracteres.", "reaction")
        if key == "emocion" and value not in EXPRESSIONS:
            raise _refuse(f"La emoción «{value}» no existe: {', '.join(EXPRESSIONS)}.", "reaction")
        if key == "gesto" and value not in GESTURES:
            raise _refuse(f"El gesto «{value}» no existe: {', '.join(GESTURES)}.", "reaction")
        if key == "personaje" and value not in character_keys:
            raise _refuse(f"El caso no tiene el personaje «{value}».", "reaction")
        reaction[key] = value
    return reaction
