"""E3-8 · Caracterización del caso PDF: lo que el juego produce hoy, fijado antes de moverlo a datos.

Esta prueba se tomó **antes** de tocar ``case_effects.py`` (línea base) y debe seguir pasando
idéntica después: los efectos, métricas y finales del caso pasaron de un registro en código a
datos de la versión (``decision_options.effects`` y ``case_versions.rules``) y el comportamiento
visible no cambia. Los valores están escritos a mano: no se calculan desde el registro ni desde
los datos (si la prueba los leyera de donde sale la respuesta, no detectaría un cambio).

- ``EXPECTED_OPTION_EFFECTS``: los efectos de las 19 opciones canónicas (severidad, banderas y
  cambio de cada métrica).
- ``EXPECTED_WALKS``: seis recorridos reales por la API —uno por final y dos mixtos— con el
  final, sus conteos de severidad, banderas, métricas y el estado clínico del HUD.
"""
import importlib
import json

import pytest
from django.apps import apps as live_apps

from apps.simulation.models import AttemptWorldState, CaseVersion, DecisionOption, SimulationAttempt
from apps.simulation.services import case_effects
from shared.jsonutils import write_map

from .test_caso_pdf import (  # noqa: F401  (fixtures y ayudantes del recorrido)
    _deliberate_clock,
    _play_full,
    _registrada,
    _start,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = [pytest.mark.req("RNF-008"), pytest.mark.req("TD-02")]


@pytest.fixture(params=["seeded", "migrated"], autouse=True)
def case_data(request, case_version_id):
    """Los datos del caso tal como los siembra el comando y tal como los deja la migración 0021.

    La variante «migrated» vuelve el caso al estado anterior a E3-8 (sin ``effects`` ni
    ``rules.metrics/endings``) y le corre la migración de datos: debe producir lo mismo.
    """
    if request.param == "migrated":
        CaseVersion.objects.filter(simulation_case__code="SIM-VBG-001").update(
            rules=json.dumps({"secondChance": True})
        )
        DecisionOption.objects.filter(case_version__simulation_case__code="SIM-VBG-001").update(effects="{}")
        module = importlib.import_module("apps.simulation.migrations.0021_caso_pdf_effects_as_data")
        module.write_effects_and_rules(live_apps, None)
    return request.param

METRICS = (
    "confianza", "crisis_emocional", "riesgo_victima", "rigor_tecnico", "etica_profesional",
    "ruta_institucional", "calidad_duelo",
)

#: option_key → efectos esperados. Los cambios de métrica son sobre el valor inicial (50), acotados 0-100.
EXPECTED_OPTION_EFFECTS = {
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

WALKS = {
    "integral": [
        "h1-pap-contencion", "h2-459-1257", "h3-integral-psicosocial",
        "c1-riesgo-proteccion-derechos", "c2-2126-1098-1257", "c3-integral-derechos",
    ],
    "critico": [
        *_registrada("h1-interrogar-victima"), "h2-459-1257", "h3-integral-psicosocial",
        *_registrada("c1-mediacion-perdon"), "c2-2126-1098-1257", "c3-integral-derechos",
    ],
    "riesgo_omision": [
        "h1-pap-contencion", "h2-459-1257", "h3-integral-psicosocial",
        *_registrada("c1-patrones-infancia"), "c2-2126-1098-1257",
        *_registrada("c3-valoracion-dependientes"),
    ],
    "brechas": [
        "h1-pap-contencion", *_registrada("h2-459-1448"), *_registrada("h3-parcial-disonancia"),
        "c1-riesgo-proteccion-derechos", "c2-2126-1098-1257", "c3-integral-derechos",
    ],
    "riesgo_acumulacion": [
        "h1-pap-contencion", *_registrada("h2-459-1448"), *_registrada("h3-parcial-disonancia"),
        "c1-riesgo-proteccion-derechos", *_registrada("c2-eje-1448"), "c3-integral-derechos",
    ],
    "mixto_una_critica": [
        *_registrada("h1-noticia-sin-protocolo"), "h2-459-1257", "h3-integral-psicosocial",
        "c1-riesgo-proteccion-derechos", "c2-2126-1098-1257", "c3-integral-derechos",
    ],
}

#: Lo que cada recorrido deja al completarse: estado, final, estado clínico, reintentos y puntaje.
EXPECTED_WALKS = {
    'integral': {
        "accumulatedScore": 66,
        "clinicalState": {
            "papApplied": True,
            "patient": {
                "crisisLevel": 20,
                "emotionalState": 80,
                "openness": 85,
                "trustLevel": 85
            }
        },
        "ending": {
            "caseFlags": {
                "asesoria_derechos_realizada": True,
                "derivacion_salud_mental_activada": True,
                "duelo_acompanado": True,
                "epicee_aplicado": True,
                "familia_contenida": True,
                "marco_comisaria_correcto": True,
                "marco_hospital_correcto": True,
                "medidas_proteccion_activadas": True,
                "pap_aplicado": True,
                "riesgo_feminicidio_valorado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 80,
                "confianza": 85,
                "crisis_emocional": 20,
                "etica_profesional": 95,
                "riesgo_victima": 5,
                "rigor_tecnico": 100,
                "ruta_institucional": 100
            },
            "key": "integral",
            "message": "Lograste una intervención protectora, ética e interdisciplinaria. La ruta institucional queda activada y la sobreviviente recibe orientación integral.",
            "severityCounts": {
                "acceptable": 0,
                "critical": 0,
                "recommended": 6,
                "risky": 0
            },
            "title": "Final 1 — Intervención Protectora Integral",
            "tone": "positive"
        },
        "retries": 0,
        "status": "COMPLETED",
        "stressIndex": 0
    },
    'critico': {
        "accumulatedScore": 14,
        "clinicalState": {
            "papApplied": False,
            "patient": {
                "crisisLevel": 70,
                "emotionalState": 65,
                "openness": 20,
                "trustLevel": 20
            }
        },
        "ending": {
            "caseFlags": {
                "derivacion_salud_mental_activada": True,
                "duelo_acompanado": True,
                "epicee_aplicado": True,
                "interrogatorio_prematuro": True,
                "marco_comisaria_correcto": True,
                "marco_hospital_correcto": True,
                "mediacion_agresor_intentada": True,
                "riesgo_feminicidio_valorado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 65,
                "confianza": 20,
                "crisis_emocional": 70,
                "etica_profesional": 25,
                "riesgo_victima": 80,
                "rigor_tecnico": 90,
                "ruta_institucional": 75
            },
            "key": "critico",
            "message": "La intervención aumentó el riesgo de revictimización y falló en activar medidas de protección básicas. Se requiere supervisión y corrección inmediata.",
            "severityCounts": {
                "acceptable": 0,
                "critical": 2,
                "recommended": 4,
                "risky": 0
            },
            "title": "Final 4 — Intervención Crítica / Revictimizante",
            "tone": "critical"
        },
        "retries": 2,
        "status": "COMPLETED",
        "stressIndex": 90
    },
    'riesgo_omision': {
        "accumulatedScore": 42,
        "clinicalState": {
            "papApplied": True,
            "patient": {
                "crisisLevel": 20,
                "emotionalState": 80,
                "openness": 75,
                "trustLevel": 75
            }
        },
        "ending": {
            "caseFlags": {
                "derivacion_salud_mental_activada": True,
                "duelo_acompanado": True,
                "epicee_aplicado": True,
                "familia_contenida": True,
                "marco_comisaria_correcto": True,
                "marco_hospital_correcto": True,
                "pap_aplicado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 80,
                "confianza": 75,
                "crisis_emocional": 20,
                "etica_profesional": 75,
                "riesgo_victima": 47,
                "rigor_tecnico": 93,
                "ruta_institucional": 75
            },
            "key": "riesgo",
            "message": "El acompañamiento redujo parte de la crisis, pero el riesgo institucional y psicosocial permanece alto por omisiones críticas.",
            "severityCounts": {
                "acceptable": 1,
                "critical": 0,
                "recommended": 4,
                "risky": 1
            },
            "title": "Final 3 — Riesgo Persistente",
            "tone": "warning"
        },
        "retries": 2,
        "status": "COMPLETED",
        "stressIndex": 5
    },
    'brechas': {
        "accumulatedScore": 39,
        "clinicalState": {
            "papApplied": True,
            "patient": {
                "crisisLevel": 35,
                "emotionalState": 60,
                "openness": 75,
                "trustLevel": 75
            }
        },
        "ending": {
            "caseFlags": {
                "asesoria_derechos_realizada": True,
                "derivacion_salud_mental_activada": True,
                "familia_contenida": True,
                "marco_comisaria_correcto": True,
                "medidas_proteccion_activadas": True,
                "pap_aplicado": True,
                "riesgo_feminicidio_valorado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 60,
                "confianza": 75,
                "crisis_emocional": 35,
                "etica_profesional": 80,
                "riesgo_victima": 5,
                "rigor_tecnico": 82,
                "ruta_institucional": 85
            },
            "key": "brechas",
            "message": "La intervención contiene elementos adecuados, pero dejó brechas en la valoración o articulación institucional que deben corregirse.",
            "severityCounts": {
                "acceptable": 0,
                "critical": 0,
                "recommended": 4,
                "risky": 2
            },
            "title": "Final 2 — Intervención Adecuada con Brechas",
            "tone": "neutral"
        },
        "retries": 2,
        "status": "COMPLETED",
        "stressIndex": 1
    },
    'riesgo_acumulacion': {
        "accumulatedScore": 24,
        "clinicalState": {
            "papApplied": True,
            "patient": {
                "crisisLevel": 35,
                "emotionalState": 60,
                "openness": 75,
                "trustLevel": 75
            }
        },
        "ending": {
            "caseFlags": {
                "asesoria_derechos_realizada": True,
                "derivacion_salud_mental_activada": True,
                "familia_contenida": True,
                "medidas_proteccion_activadas": True,
                "pap_aplicado": True,
                "riesgo_feminicidio_valorado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 60,
                "confianza": 75,
                "crisis_emocional": 35,
                "etica_profesional": 80,
                "riesgo_victima": 5,
                "rigor_tecnico": 64,
                "ruta_institucional": 62
            },
            "key": "riesgo",
            "message": "El acompañamiento redujo parte de la crisis, pero el riesgo institucional y psicosocial permanece alto por omisiones críticas.",
            "severityCounts": {
                "acceptable": 0,
                "critical": 0,
                "recommended": 3,
                "risky": 3
            },
            "title": "Final 3 — Riesgo Persistente",
            "tone": "warning"
        },
        "retries": 3,
        "status": "COMPLETED",
        "stressIndex": 14
    },
    'mixto_una_critica': {
        "accumulatedScore": 41,
        "clinicalState": {
            "papApplied": False,
            "patient": {
                "crisisLevel": 65,
                "emotionalState": 40,
                "openness": 55,
                "trustLevel": 55
            }
        },
        "ending": {
            "caseFlags": {
                "asesoria_derechos_realizada": True,
                "derivacion_salud_mental_activada": True,
                "duelo_acompanado": True,
                "epicee_aplicado": True,
                "marco_comisaria_correcto": True,
                "marco_hospital_correcto": True,
                "medidas_proteccion_activadas": True,
                "noticia_muerte_mal_manejada": True,
                "riesgo_feminicidio_valorado": True,
                "valoracion_dependientes_realizada": True
            },
            "caseMetrics": {
                "calidad_duelo": 40,
                "confianza": 55,
                "crisis_emocional": 65,
                "etica_profesional": 70,
                "riesgo_victima": 10,
                "rigor_tecnico": 100,
                "ruta_institucional": 100
            },
            "key": "brechas",
            "message": "La intervención contiene elementos adecuados, pero dejó brechas en la valoración o articulación institucional que deben corregirse.",
            "severityCounts": {
                "acceptable": 0,
                "critical": 1,
                "recommended": 5,
                "risky": 0
            },
            "title": "Final 2 — Intervención Adecuada con Brechas",
            "tone": "neutral"
        },
        "retries": 1,
        "status": "COMPLETED",
        "stressIndex": 40
    },
}


def _clamped(delta):
    return max(0, min(100, 50 + delta))


@pytest.mark.parametrize("option_key", sorted(EXPECTED_OPTION_EFFECTS))
def test_every_canonical_option_has_its_effects(option_key, estudiante, case_version_id):
    expected = EXPECTED_OPTION_EFFECTS[option_key]
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    decision = DecisionOption.objects.get(case_version_id=case_version_id, option_key=option_key)
    attempt = SimulationAttempt.objects.select_related("case_version", "current_node").get(pk=attempt_id)

    assert case_effects.option_severity(decision) == expected["severity"]
    AttemptWorldState.objects.filter(pk=attempt_id).update(flags_json=write_map({}))
    case_effects.apply_case_effects(attempt, decision)
    flags, metrics = case_effects.read_case_state(attempt)

    assert flags == expected["flags"]
    assert metrics == {key: _clamped(expected["metrics"].get(key, 0)) for key in METRICS}


def test_the_registry_covers_exactly_the_nineteen_canonical_options(case_version_id):
    keys = set(
        DecisionOption.objects.filter(case_version_id=case_version_id).values_list("option_key", flat=True)
    )

    assert keys == set(EXPECTED_OPTION_EFFECTS)
    assert len(keys) == 19


@pytest.mark.parametrize("name", sorted(WALKS))
def test_the_walkthroughs_end_exactly_as_before(name, estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)

    state = _play_full(client, attempt_id, token, case_version_id, WALKS[name])

    report = state["completionReport"]
    captured = {
        "status": state["status"],
        "ending": report["ending"],
        "clinicalState": state["clinicalState"],
        "retries": report["retries"],
        "accumulatedScore": state["accumulatedScore"],
        "stressIndex": state["stressIndex"],
    }
    assert captured == EXPECTED_WALKS[name]
