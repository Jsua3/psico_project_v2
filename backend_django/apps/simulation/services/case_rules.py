"""Reglas de una versión del caso (E1-7, §2.1 principio 2 del plan estructural).

La segunda oportunidad y el momento de la retroalimentación son **datos de la versión**,
no ``if`` repartidos por el servicio: ``case_versions.rules`` guarda un JSON con

- ``secondChance`` (bool): ¿una primera respuesta riesgosa o inadecuada concede una segunda
  y última oportunidad sin cambiar métricas ni avanzar? Ausente = **apagada** (ED-7: los
  casos nuevos nacen sin ella; ``SIM-VBG-001`` la declara encendida, excepción explícita a
  RN-08 por la decisión 10, y la migración 0009 la enciende en las versiones ya existentes).
- ``feedbackTiming`` (``IMMEDIATE`` | ``AT_CLOSE``): cuándo llega la retroalimentación
  evaluativa. Ausente = ``IMMEDIATE`` (el comportamiento de siempre) hasta que el visual
  consuma la consecuencia narrativa; la bandera ``FEEDBACK_AT_CLOSE_ONLY`` lo fuerza a
  ``AT_CLOSE`` para todos los casos.

Un valor ausente, de otro tipo o fuera del vocabulario toma el valor por defecto: una versión
con reglas ilegibles nunca rompe una partida.
"""
from dataclasses import dataclass

from django.conf import settings

from shared.jsonutils import read_map

IMMEDIATE = "IMMEDIATE"
AT_CLOSE = "AT_CLOSE"
FEEDBACK_TIMINGS = (IMMEDIATE, AT_CLOSE)


@dataclass(frozen=True)
class CaseRules:
    second_chance: bool = False
    feedback_timing: str = IMMEDIATE


def rules_of(version):
    """Las reglas de la versión, con los valores por defecto donde falten o no sean válidos."""
    raw = read_map(version.rules)
    second_chance = raw.get("secondChance")
    timing = raw.get("feedbackTiming")
    return CaseRules(
        second_chance=second_chance if isinstance(second_chance, bool) else False,
        feedback_timing=timing if timing in FEEDBACK_TIMINGS else IMMEDIATE,
    )


def feedback_at_close_only(rules):
    """¿La respuesta de una decisión debe omitir lo evaluativo? (bandera global o regla del caso)."""
    return bool(settings.FEEDBACK_AT_CLOSE_ONLY) or rules.feedback_timing == AT_CLOSE
