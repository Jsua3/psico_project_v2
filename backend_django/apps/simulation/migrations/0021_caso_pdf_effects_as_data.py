"""E3-8 · Los efectos y los finales del caso PDF pasan de un registro en código a datos.

0020 añadió ``decision_options.effects`` vacío. Aquí se escribe, **sin cambiar lo que el juego
produce**, lo que antes vivía en ``case_effects.OPTION_EFFECTS`` y ``case_effects.ENDINGS``:

- a cada opción cuya ``option_key`` es una de las 19 canónicas, sus ``effects``;
- a cada versión que tiene alguna de ellas, ``rules.metrics`` (las siete métricas del caso, a 50)
  y ``rules.endings`` (los cuatro finales con su condición), conservando el resto de sus reglas
  (``secondChance``, ``feedbackTiming``).

La prueba de caracterización de E3-8 (``test_case_effects_characterization``) se tomó antes del
cambio y sigue pasando idéntica sobre la base migrada. Es idempotente y no pisa ``effects`` ni
``rules.metrics``/``rules.endings`` que una versión ya traiga. Los datos van copiados aquí a
propósito: una migración no importa código de la aplicación.
"""
import json

from django.db import migrations

OPTION_EFFECTS = {
    "h1-noticia-sin-protocolo": {
        "severity": "critical",
        "flags": {
            "noticia_muerte_mal_manejada": True
        },
        "metrics": {
            "calidad_duelo": -25,
            "crisis_emocional": 25,
            "confianza": -15,
            "etica_profesional": -15,
            "rigor_tecnico": -10
        }
    },
    "h1-pap-contencion": {
        "severity": "recommended",
        "flags": {
            "pap_aplicado": True,
            "familia_contenida": True
        },
        "metrics": {
            "confianza": 15,
            "crisis_emocional": -20,
            "calidad_duelo": 15,
            "rigor_tecnico": 10,
            "etica_profesional": 10,
            "riesgo_victima": -5
        }
    },
    "h1-interrogar-victima": {
        "severity": "critical",
        "flags": {
            "interrogatorio_prematuro": True
        },
        "metrics": {
            "etica_profesional": -25,
            "riesgo_victima": 15,
            "confianza": -20,
            "crisis_emocional": 15,
            "rigor_tecnico": -10
        }
    },
    "h2-solo-459": {
        "severity": "acceptable",
        "flags": {},
        "metrics": {
            "ruta_institucional": 5,
            "rigor_tecnico": 2
        }
    },
    "h2-459-1257": {
        "severity": "recommended",
        "flags": {
            "marco_hospital_correcto": True
        },
        "metrics": {
            "ruta_institucional": 15,
            "rigor_tecnico": 10,
            "etica_profesional": 5
        }
    },
    "h2-459-1448": {
        "severity": "risky",
        "flags": {},
        "metrics": {
            "ruta_institucional": -10,
            "rigor_tecnico": -8
        }
    },
    "h3-parcial-disonancia": {
        "severity": "risky",
        "flags": {},
        "metrics": {
            "rigor_tecnico": -5,
            "calidad_duelo": -5,
            "crisis_emocional": 5
        }
    },
    "h3-pap-epicee": {
        "severity": "acceptable",
        "flags": {
            "epicee_aplicado": True
        },
        "metrics": {
            "rigor_tecnico": 8,
            "calidad_duelo": 8,
            "crisis_emocional": -5
        }
    },
    "h3-epicee-ciclo": {
        "severity": "acceptable",
        "flags": {
            "epicee_aplicado": True
        },
        "metrics": {
            "rigor_tecnico": 10,
            "calidad_duelo": 8,
            "crisis_emocional": -5
        }
    },
    "h3-integral-psicosocial": {
        "severity": "recommended",
        "flags": {
            "epicee_aplicado": True,
            "duelo_acompanado": True
        },
        "metrics": {
            "rigor_tecnico": 15,
            "calidad_duelo": 15,
            "etica_profesional": 10,
            "confianza": 10,
            "crisis_emocional": -10
        }
    },
    "c1-mediacion-perdon": {
        "severity": "critical",
        "flags": {
            "mediacion_agresor_intentada": True
        },
        "metrics": {
            "riesgo_victima": 30,
            "etica_profesional": -25,
            "confianza": -20,
            "ruta_institucional": -15,
            "crisis_emocional": 15
        }
    },
    "c1-riesgo-proteccion-derechos": {
        "severity": "recommended",
        "flags": {
            "riesgo_feminicidio_valorado": True,
            "medidas_proteccion_activadas": True,
            "asesoria_derechos_realizada": True
        },
        "metrics": {
            "riesgo_victima": -25,
            "ruta_institucional": 20,
            "confianza": 10,
            "etica_profesional": 10,
            "rigor_tecnico": 10
        }
    },
    "c1-patrones-infancia": {
        "severity": "risky",
        "flags": {},
        "metrics": {
            "riesgo_victima": 10,
            "rigor_tecnico": -10,
            "ruta_institucional": -10
        }
    },
    "c2-2126-1098-1257": {
        "severity": "recommended",
        "flags": {
            "marco_comisaria_correcto": True
        },
        "metrics": {
            "ruta_institucional": 15,
            "rigor_tecnico": 10
        }
    },
    "c2-1098-1257": {
        "severity": "acceptable",
        "flags": {},
        "metrics": {
            "ruta_institucional": 5,
            "rigor_tecnico": 3
        }
    },
    "c2-eje-1448": {
        "severity": "risky",
        "flags": {},
        "metrics": {
            "ruta_institucional": -8,
            "rigor_tecnico": -8
        }
    },
    "c3-parcial-clinica": {
        "severity": "risky",
        "flags": {
            "riesgo_feminicidio_valorado": True
        },
        "metrics": {
            "rigor_tecnico": 3,
            "riesgo_victima": -3
        }
    },
    "c3-valoracion-dependientes": {
        "severity": "acceptable",
        "flags": {
            "valoracion_dependientes_realizada": True,
            "derivacion_salud_mental_activada": True
        },
        "metrics": {
            "riesgo_victima": -8,
            "rigor_tecnico": 8,
            "ruta_institucional": 5
        }
    },
    "c3-integral-derechos": {
        "severity": "recommended",
        "flags": {
            "valoracion_dependientes_realizada": True,
            "riesgo_feminicidio_valorado": True,
            "derivacion_salud_mental_activada": True
        },
        "metrics": {
            "riesgo_victima": -15,
            "rigor_tecnico": 15,
            "etica_profesional": 10,
            "ruta_institucional": 10
        }
    }
}

METRICS = [
    {"key": key, "initial": 50}
    for key in (
        "confianza", "crisis_emocional", "riesgo_victima", "rigor_tecnico", "etica_profesional",
        "ruta_institucional", "calidad_duelo",
    )
]

_PROTECCION_COMPLETA = [
    {"flag": "riesgo_feminicidio_valorado"},
    {"flag": "medidas_proteccion_activadas"},
    {"flag": "asesoria_derechos_realizada"},
]

ENDINGS = [
    {
        "key": "critico",
        "title": "Final 4 — Intervención Crítica / Revictimizante",
        "message": (
            "La intervención aumentó el riesgo de revictimización y falló en "
            "activar medidas de protección básicas. Se requiere supervisión y "
            "corrección inmediata."
        ),
        "tone": "critical",
        "when": {"any": [
            {"count": "critical", "gte": 2},
            {"all": [
                {"flag": "mediacion_agresor_intentada"},
                {"not": {"all": _PROTECCION_COMPLETA}},
            ]},
        ]},
    },
    {
        "key": "integral",
        "title": "Final 1 — Intervención Protectora Integral",
        "message": (
            "Lograste una intervención protectora, ética e interdisciplinaria. "
            "La ruta institucional queda activada y la sobreviviente recibe "
            "orientación integral."
        ),
        "tone": "positive",
        "when": {"all": [
            {"count": "critical", "eq": 0},
            {"count": "risky", "lte": 1},
            {"count": "recommended", "gte": 4},
            {"flag": "pap_aplicado"},
            {"flag": "marco_hospital_correcto"},
            *_PROTECCION_COMPLETA,
        ]},
    },
    {
        "key": "riesgo",
        "title": "Final 3 — Riesgo Persistente",
        "message": (
            "El acompañamiento redujo parte de la crisis, pero el riesgo "
            "institucional y psicosocial permanece alto por omisiones críticas."
        ),
        "tone": "warning",
        "when": {"any": [
            {"not": {"flag": "riesgo_feminicidio_valorado"}},
            {"not": {"flag": "medidas_proteccion_activadas"}},
            {"not": {"flag": "asesoria_derechos_realizada"}},
            {"count": "risky", "gte": 3},
        ]},
    },
    {
        "key": "brechas",
        "title": "Final 2 — Intervención Adecuada con Brechas",
        "message": (
            "La intervención contiene elementos adecuados, pero dejó brechas en la "
            "valoración o articulación institucional que deben corregirse."
        ),
        "tone": "neutral",
    },
]


def _rules_of(version):
    try:
        value = json.loads(version.rules or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def write_effects_and_rules(apps, schema_editor):
    DecisionOption = apps.get_model("simulation", "DecisionOption")
    CaseVersion = apps.get_model("simulation", "CaseVersion")

    version_ids = set()
    for option in DecisionOption.objects.filter(option_key__in=list(OPTION_EFFECTS)):
        version_ids.add(option.case_version_id)
        if option.effects and option.effects.strip() not in ("", "{}"):
            continue  # ya trae efectos propios: no se pisan
        DecisionOption.objects.filter(pk=option.pk).update(
            effects=json.dumps(OPTION_EFFECTS[option.option_key], ensure_ascii=False)
        )

    for version in CaseVersion.objects.filter(pk__in=version_ids):
        rules = _rules_of(version)
        changed = False
        if "metrics" not in rules:
            rules["metrics"] = METRICS
            changed = True
        if "endings" not in rules:
            rules["endings"] = ENDINGS
            changed = True
        if changed:
            CaseVersion.objects.filter(pk=version.pk).update(
                rules=json.dumps(rules, ensure_ascii=False)
            )


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0020_decision_effects"),
    ]

    operations = [
        migrations.RunPython(write_effects_and_rules, migrations.RunPython.noop),
    ]
