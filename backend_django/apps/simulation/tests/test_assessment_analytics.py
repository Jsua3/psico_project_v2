"""E6-2a · Los agregados de aprendizaje: el cálculo puro (RQ-NEG-001 a 005; mesa §A20; contrato C13).

``analytics.compute`` recibe filas simples (un ``AttemptRow`` por intento COMPLETADO) y devuelve la forma de C13: sin base
de datos y sin texto libre. Las cifras de estas pruebas están derivadas A MANO de las tablas de cada caso (no copiadas de
la salida): si una definición cambia, cambia aquí a propósito. Todas las definiciones son BORRADOR (Psicología).

Índice interno 1–4 (EN_INICIO 1, EN_PROCESO 2, LOGRADO 3, DESTACADO 4): nunca es una nota, es la escala con la que se
promedia. Celda mínima ``k``: un bloque con menos de ``k`` estudiantes distintos entre los que lo alimentan se omite.
"""
import json
from dataclasses import replace
from datetime import datetime, timedelta
from fractions import Fraction

import pytest

from apps.simulation.assessment import analytics, definitions
from apps.simulation.assessment.analytics import AttemptRow

pytestmark = [
    pytest.mark.req("RQ-NEG-001"), pytest.mark.req("RQ-NEG-002"), pytest.mark.req("RQ-NEG-003"),
    pytest.mark.req("RQ-NEG-004"), pytest.mark.req("RQ-NEG-005"),
]

T0 = datetime(2026, 10, 1, 9, 0, 0)

EN_INICIO, EN_PROCESO, LOGRADO, DESTACADO = "EN_INICIO", "EN_PROCESO", "LOGRADO", "DESTACADO"
RULES = definitions.PROFILE_RULES


def row(student, ordinal=1, *, case=1, levels=(LOGRADO,), non_recommended=0, covered=False, key=False, system=True,
        commented=False, viewed=None, rating=None, version=2, definition="ANY", start=None, rules=RULES):
    """Un intento completado. Por defecto es v2; ``version=1`` es un reporte anterior a E6 (sin las claves nuevas)."""
    v2 = version == 2
    return AttemptRow(
        attempt_id=f"s{student}-c{case}-n{ordinal}",
        student_id=student,
        case_id=case,
        started_at=start or T0 + timedelta(days=ordinal, minutes=student),
        ordinal=ordinal,
        schema_version=version,
        levels=tuple(levels) if v2 else (),
        non_recommended=non_recommended if v2 else None,
        reflection_definition=definition if v2 else None,
        profile_rules=rules if v2 else None,
        reflection_covered=covered if v2 else None,
        key_evidence=key if v2 else None,
        system_evaluated=system,
        teacher_commented=commented,
        feedback_viewed_at=viewed,
        rating=rating,
    )


def run(rows, **overrides):
    options = {
        "min_cell": 5, "acceptable_level": LOGRADO, "reflection_definition": "ANY", "profile_rules": RULES,
        "survey_enabled": False,
    }
    return analytics.compute(rows, **{**options, **overrides})


#: Cinco estudiantes con dos intentos: (niveles 1.º, no recomendadas 1.º, reflexión 1.º, niveles 2.º, no recomendadas 2.º,
#: reflexión 2.º). «reflexión» cubre a la vez ``covered`` y la evidencia clave (el intento es completo y con perfil).
#:
#:  est  índice 1.º → 2.º          no recomendadas   reflexionó 1.º / 2.º
#:   1   1.5 (INI, PRO) → 3.0          4 → 2             no / sí
#:   2   2.0 (PRO, PRO) → 3.5          3 → 1             no / sí
#:   3   1.0 (INI)      → 2.0          5 → 4             sí / sí
#:   4   2.5 (PRO, LOG) → 3.0          2 → 2             no / no
#:   5   3.0 (LOG)      → 4.0          0 → 0             sí / sí
FIVE = [
    (1, (EN_INICIO, EN_PROCESO), 4, False, (LOGRADO, LOGRADO), 2, True),
    (2, (EN_PROCESO, EN_PROCESO), 3, False, (LOGRADO, DESTACADO), 1, True),
    (3, (EN_INICIO,), 5, True, (EN_PROCESO,), 4, True),
    (4, (EN_PROCESO, LOGRADO), 2, False, (LOGRADO, LOGRADO), 2, False),
    (5, (LOGRADO,), 0, True, (DESTACADO,), 0, True),
]


def five_students(**kw):
    rows = []
    for student, l1, n1, r1, l2, n2, r2 in FIVE:
        rows.append(row(student, 1, levels=l1, non_recommended=n1, covered=r1, key=r1, **kw))
        rows.append(row(student, 2, levels=l2, non_recommended=n2, covered=r2, key=r2, **kw))
    return rows


# ─── celda mínima de la cohorte ───────────────────────────────────────────────────────────────
def test_sin_filas_la_cohorte_es_cero_y_esta_suprimida():
    result = run([])

    assert result["cohort"] == {"students": 0, "attempts": 0, "suppressed": True}
    assert set(result) == {"cohort", "definitions"}


def test_con_cuatro_estudiantes_solo_hay_cohorte_y_definiciones():
    rows = [r for r in five_students() if r.student_id != 5]

    result = run(rows)

    assert result["cohort"] == {"students": 4, "attempts": 8, "suppressed": True}
    assert set(result) == {"cohort", "definitions"}


def test_con_cinco_estudiantes_la_cohorte_ya_no_esta_suprimida_y_trae_todos_los_bloques():
    result = run(five_students())

    assert result["cohort"] == {"students": 5, "attempts": 10, "suppressed": False}
    assert set(result) == {
        "cohort", "improvement", "firstVsSecond", "acceptable", "reflectionCoverage", "keyEvidence", "evaluated",
        "definitions",
    }  # sin encuesta apagada ni evento de retroalimentación: esos dos bloques faltan


def test_una_celda_minima_mayor_que_el_piso_se_respeta():
    rows = five_students()

    assert run(rows, min_cell=5)["cohort"]["suppressed"] is False
    assert run(rows, min_cell=6)["cohort"]["suppressed"] is True


@pytest.mark.parametrize("requested", [4, 3, 1, 0, -2])
def test_la_celda_minima_nunca_baja_del_piso_de_privacidad_aunque_se_pida(requested):
    rows = [r for r in five_students() if r.student_id <= 4]

    result = run(rows, min_cell=requested)

    assert result["cohort"] == {"students": 4, "attempts": 8, "suppressed": True}
    assert set(result) == {"cohort", "definitions"}  # ningún bloque viaja con menos estudiantes que el piso
    assert result["definitions"]["minCell"] == definitions.MIN_CELL_FLOOR == 5


# ─── RQ-NEG-001 · mejora: primer frente al último intento ─────────────────────────────────────
def test_la_mejora_compara_el_primer_y_el_ultimo_intento_de_cada_serie():
    # pre = (1.5 + 2.0 + 1.0 + 2.5 + 3.0) / 5 = 2.0 · post = (3.0 + 3.5 + 2.0 + 3.0 + 4.0) / 5 = 3.1
    # deltaPct = (3.1 − 2.0) / 3 × 100 = 36.666… → 36.7
    block = run(five_students())["improvement"]

    assert block == {"students": 5, "series": 5, "pre": 2.0, "post": 3.1, "deltaPct": 36.7}


def test_la_mejora_usa_el_ultimo_intento_y_no_el_segundo():
    rows = five_students()
    # un 3.er intento para el estudiante 3: índice 4.0 (DESTACADO) → su post pasa de 2.0 a 4.0
    rows.append(row(3, 3, levels=(DESTACADO,), non_recommended=0, covered=True, key=True))

    block = run(rows)["improvement"]

    # post = (3.0 + 3.5 + 4.0 + 3.0 + 4.0) / 5 = 3.5 · deltaPct = (3.5 − 2.0) / 3 × 100 = 50.0
    assert (block["pre"], block["post"], block["deltaPct"], block["series"]) == (2.0, 3.5, 50.0, 5)


def test_el_orden_de_la_serie_es_el_del_ordinal_y_no_el_de_las_filas():
    rows = five_students()

    assert run(list(reversed(rows)))["improvement"] == run(rows)["improvement"]
    assert run(list(reversed(rows)))["firstVsSecond"] == run(rows)["firstVsSecond"]


def test_una_serie_de_un_solo_intento_no_aporta_a_la_mejora():
    rows = five_students() + [row(s, 1, levels=(EN_INICIO,)) for s in (6, 7, 8)]

    result = run(rows)

    assert result["cohort"]["students"] == 8
    assert result["improvement"]["students"] == 5 and result["improvement"]["series"] == 5


def test_dos_casos_de_un_mismo_estudiante_son_dos_series_distintas():
    rows = [row(s, 1, case=1, levels=(EN_INICIO,)) for s in range(1, 6)]
    rows += [row(s, 1, case=2, levels=(DESTACADO,)) for s in range(1, 6)]  # un solo intento en cada caso

    result = run(rows)

    assert "improvement" not in result  # ninguna serie tiene dos intentos: no se mezclan casos


def test_con_menos_de_k_series_elegibles_la_mejora_se_omite_aunque_la_cohorte_pase():
    rows = five_students()
    rows = [r for r in rows if not (r.student_id in (4, 5) and r.ordinal == 2)]  # solo 3 estudiantes con 2 intentos

    result = run(rows)

    assert result["cohort"]["suppressed"] is False
    assert "improvement" not in result and "firstVsSecond" not in result
    assert "acceptable" in result  # lo que alimentan los cinco sigue ahí


def test_los_intentos_sin_competencias_con_nivel_no_cuentan_para_el_indice():
    rows = five_students()
    rows.append(row(1, 3, levels=()))  # un 3.er intento sin ninguna competencia con nivel: no tiene índice

    block = run(rows)["improvement"]

    assert block["post"] == 3.1  # el último intento CON índice sigue siendo el 2.º


# ─── RQ-NEG-003 · primer frente al segundo intento ────────────────────────────────────────────
def test_primer_frente_al_segundo_mide_el_cambio_de_las_no_recomendadas():
    # m1 = (4 + 3 + 5 + 2 + 0) / 5 = 2.8 · m2 = (2 + 1 + 4 + 2 + 0) / 5 = 1.8 · (1.8 − 2.8) / 2.8 × 100 = −35.714… → −35.7
    block = run(five_students())["firstVsSecond"]

    assert block == {"students": 5, "series": 5, "firstMean": 2.8, "secondMean": 1.8, "nonRecommendedDeltaPct": -35.7}


def test_primer_frente_al_segundo_usa_el_segundo_aunque_haya_un_tercero():
    rows = five_students() + [row(1, 3, levels=(LOGRADO,), non_recommended=9)]

    block = run(rows)["firstVsSecond"]

    assert block["secondMean"] == 1.8


def test_si_nadie_tuvo_no_recomendadas_en_el_primer_intento_el_bloque_se_omite_sin_dividir_por_cero():
    rows = [
        row(s, n, levels=(EN_PROCESO,) if n == 1 else (LOGRADO,), non_recommended=0 if n == 1 else 3)
        for s in range(1, 6) for n in (1, 2)
    ]

    result = run(rows)

    assert "firstVsSecond" not in result
    assert result["improvement"]["deltaPct"] == 33.3  # (3 − 2) / 3 × 100


def test_primer_frente_al_segundo_salta_los_intentos_sin_medida():
    """Un reporte v1 no tiene no recomendadas: «el primero» y «el segundo» son los dos primeros intentos que sí las tienen."""
    rows = []
    for student in range(1, 6):
        rows += [row(student, 1, version=1), row(student, 2, non_recommended=4), row(student, 3, non_recommended=1)]

    block = run(rows)["firstVsSecond"]

    assert block == {"students": 5, "series": 5, "firstMean": 4.0, "secondMean": 1.0, "nonRecommendedDeltaPct": -75.0}


def test_una_serie_con_un_solo_intento_con_medida_no_aporta_a_primer_frente_al_segundo():
    rows = [row(s, 1, version=1) for s in range(1, 6)] + [row(s, 2, non_recommended=4) for s in range(1, 6)]

    assert "firstVsSecond" not in run(rows)


def test_el_ordinal_manda_sobre_la_hora_de_inicio():
    """Si la hora de inicio y el ordinal discrepan (un reloj o una restauración desordenados), la serie sigue el ordinal."""
    rows = []
    for student in range(1, 6):
        rows.append(row(student, 1, levels=(EN_INICIO,), start=T0 + timedelta(days=30)))
        rows.append(row(student, 2, levels=(DESTACADO,), start=T0 + timedelta(days=1)))

    block = run(rows)["improvement"]

    assert (block["pre"], block["post"], block["deltaPct"]) == (1.0, 4.0, 100.0)


# ─── RQ-NEG-002 · nivel aceptable ─────────────────────────────────────────────────────────────
def test_aceptable_es_el_porcentaje_de_estudiantes_con_algun_intento_con_todas_las_competencias_en_el_nivel():
    # est 1 (2.º intento), 2 (2.º), 4 (2.º) y 5 (ambos) alcanzan LOGRADO en TODAS sus competencias; el 3 no → 4 de 5
    block = run(five_students())["acceptable"]

    assert block == {"students": 5, "achieved": 4, "pct": 80.0, "levelThreshold": LOGRADO}


@pytest.mark.parametrize(
    ("level", "achieved"),
    [(EN_INICIO, 5), (EN_PROCESO, 5), (LOGRADO, 4), (DESTACADO, 1)],
)
def test_aceptable_respeta_el_nivel_configurado(level, achieved):
    # DESTACADO solo lo alcanza el estudiante 5 (su 2.º intento); EN_PROCESO, todos (el est. 3 con EN_PROCESO en el 2.º)
    block = run(five_students(), acceptable_level=level)["acceptable"]

    assert (block["achieved"], block["levelThreshold"], block["pct"]) == (achieved, level, achieved * 20.0)


def test_aceptable_ignora_los_intentos_sin_competencias_con_nivel():
    rows = five_students() + [row(6, 1, levels=()), row(7, 1, levels=())]

    block = run(rows)["acceptable"]

    assert block["students"] == 5  # los estudiantes 6 y 7 no tienen ninguna competencia con nivel


# ─── RQ-NEG-003 / 004 · reflexión y evidencia clave ───────────────────────────────────────────
def test_cobertura_de_reflexion_y_evidencia_clave_son_el_porcentaje_de_intentos_que_lo_cumplen():
    # reflexionaron 6 de 10 intentos (est. 1:1, 2:1, 3:2, 4:0, 5:2) → 60.0 %
    result = run(five_students())

    assert result["reflectionCoverage"] == {"definition": "ANY", "attempts": 10, "covered": 6, "pct": 60.0}
    assert result["keyEvidence"] == {"attempts": 10, "keyEvidence": 6, "pct": 60.0}


def test_la_evidencia_clave_puede_ser_menor_que_la_reflexion():
    rows = five_students()
    rows = [replace(r, key_evidence=False) if r.student_id == 5 else r for r in rows]

    result = run(rows)

    assert result["reflectionCoverage"]["covered"] == 6 and result["keyEvidence"]["keyEvidence"] == 4


def test_un_intento_cerrado_con_otra_definicion_de_reflexion_no_se_mezcla():
    """Lo cerrado no se recalcula: los intentos con otra definición quedan fuera de los dos bloques que dependen de ella."""
    rows = five_students() + [row(s, 1, definition="PER_DECISION_SCENE", covered=True, key=True) for s in (6, 7)]

    current = run(rows)
    other = run(rows, reflection_definition="PER_DECISION_SCENE")

    assert current["reflectionCoverage"]["attempts"] == 10 and current["keyEvidence"]["attempts"] == 10
    assert current["reflectionCoverage"]["pct"] == current["keyEvidence"]["pct"] == 60.0  # 6 de 10, no 6 de 12
    assert current["cohort"]["students"] == 7  # siguen siendo parte de la cohorte
    assert "reflectionCoverage" not in other and "keyEvidence" not in other  # solo 2 estudiantes: bajo la celda
    assert other["definitions"]["reflectionDefinition"] == "PER_DECISION_SCENE"


# ─── RQ-NEG-005 · evaluadas ───────────────────────────────────────────────────────────────────
def test_evaluadas_cuenta_la_automatica_y_la_del_docente_con_comentario():
    rows = five_students()
    commented = ("s1-c1-n2", "s2-c1-n2", "s5-c1-n2")
    rows = [
        replace(r, system_evaluated=r.attempt_id != "s4-c1-n1", teacher_commented=r.attempt_id in commented)
        for r in rows
    ]  # 9 de 10 con evaluación automática; 3 de 10 con un comentario del docente

    assert run(rows)["evaluated"] == {"attempts": 10, "systemPct": 90.0, "commentedPct": 30.0}


# ─── la versión de la regla del perfil: lo cerrado con otra no se mezcla (hallazgo I-3 de la revisión) ───
def test_con_otra_version_de_la_regla_los_bloques_que_dependen_de_los_niveles_se_omiten():
    """Los niveles de un intento se calcularon con la regla de su época; mezclarlos daría una «mejora» sin significado."""
    old = run(five_students(rules="borrador-0"))

    for block in ("improvement", "acceptable", "improvementAfterFeedback"):
        assert block not in old  # ningún intento tiene el perfil de la regla vigente
    for block in ("firstVsSecond", "reflectionCoverage", "keyEvidence", "evaluated"):
        assert block in old  # estos no dependen de la regla del perfil
    assert old["cohort"] == {"students": 5, "attempts": 10, "suppressed": False}


def test_un_intento_con_otra_regla_no_hace_serie_con_uno_de_la_vigente():
    """El 1.er intento con la regla vieja y el 2.º con la nueva: no se comparan (cada uno quedaría solo)."""
    rows = []
    for student in range(1, 6):
        rows.append(row(student, 1, levels=(EN_INICIO,), rules="borrador-0"))
        rows.append(row(student, 2, levels=(DESTACADO,)))

    result = run(rows)

    assert "improvement" not in result and result["cohort"]["attempts"] == 10
    assert result["acceptable"]["achieved"] == 5  # el 2.º intento de cada uno es DESTACADO bajo la regla vigente


def test_un_reporte_v2_sin_sello_de_regla_tampoco_se_mezcla():
    assert "improvement" not in run(five_students(rules=None))


def test_los_porcentajes_de_reflexion_no_dependen_de_la_regla_del_perfil():
    result = run(five_students(rules="borrador-0"))

    assert result["reflectionCoverage"]["covered"] == 6 and result["keyEvidence"]["keyEvidence"] == 6


# ─── reportes anteriores a E6 ─────────────────────────────────────────────────────────────────
def test_los_reportes_v1_cuentan_en_la_cohorte_y_en_evaluadas_y_en_nada_mas():
    base = run(five_students())
    rows = five_students() + [row(s, 1, version=1, system=False) for s in (6, 7, 8)]

    result = run(rows)

    assert result["cohort"] == {"students": 8, "attempts": 13, "suppressed": False}
    for block in ("improvement", "firstVsSecond", "acceptable", "reflectionCoverage", "keyEvidence"):
        assert result[block] == base[block]
    assert result["evaluated"] == {"attempts": 13, "systemPct": 76.9, "commentedPct": 0.0}  # 10 de 13 → 76.923…


# ─── RQ-NEG-004 · encuesta ────────────────────────────────────────────────────────────────────
def with_ratings(ratings):
    return [row(s, 1, rating=r) for s, r in enumerate(ratings, start=1)]


def test_la_satisfaccion_solo_aparece_con_la_encuesta_encendida():
    rows = with_ratings([5, 4, 4, 3, 1])

    assert "satisfaction" not in run(rows, survey_enabled=False)
    assert run(rows, survey_enabled=True)["satisfaction"] == {"responses": 5, "satisfiedPct": 60.0}


def test_la_satisfaccion_necesita_k_estudiantes_distintos():
    four = with_ratings([5, 4, 4, 3]) + [row(5, 1)]  # cinco estudiantes en la cohorte, solo cuatro respondieron

    assert "satisfaction" not in run(four, survey_enabled=True)


def test_dos_respuestas_de_un_mismo_estudiante_no_hacen_la_celda():
    rows = with_ratings([5, 4, 4, 3]) + [row(1, 2, rating=5)]  # cinco respuestas, cuatro estudiantes

    result = run(rows + [row(5, 1)], survey_enabled=True)

    assert "satisfaction" not in result


def test_sin_ninguna_respuesta_la_satisfaccion_se_omite_sin_dividir_por_cero():
    assert "satisfaction" not in run(five_students(), survey_enabled=True)


# ─── RQ-NEG-005 · mejora tras la retroalimentación ────────────────────────────────────────────
def with_feedback(*, viewed_students, extra=()):
    """Cinco estudiantes (la tabla de FIVE); ``viewed_students`` vieron su retroalimentación ANTES de iniciar el 2.º."""
    rows = []
    for student, l1, n1, r1, l2, n2, r2 in FIVE:
        second_start = T0 + timedelta(days=2, minutes=student)
        viewed = second_start - timedelta(hours=1) if student in viewed_students else None
        rows.append(row(student, 1, levels=l1, non_recommended=n1, covered=r1, key=r1, viewed=viewed))
        rows.append(row(student, 2, levels=l2, non_recommended=n2, covered=r2, key=r2))
    return rows + list(extra)


def test_la_mejora_tras_la_retroalimentacion_solo_cuenta_a_quien_la_vio_antes_del_siguiente_intento():
    # el estudiante 6 mejora mucho (1.0 → 4.0) pero no vio su retroalimentación: no entra en esta métrica, sí en la general
    extra = [row(6, 1, levels=(EN_INICIO,)), row(6, 2, levels=(DESTACADO,), non_recommended=0)]

    result = run(with_feedback(viewed_students={1, 2, 3, 4, 5}, extra=extra))

    # pares de los cinco: pre 2.0 → post 3.1, deltaPct 36.7 · la mejora general suma al 6.º: pre 11/6, post 19.5/6 → 47.2
    assert result["improvementAfterFeedback"] == {"students": 5, "pairs": 5, "deltaPct": 36.7}
    assert result["improvement"]["deltaPct"] == 47.2 and result["improvement"]["students"] == 6


def test_verla_despues_de_empezar_el_siguiente_intento_no_cuenta():
    # el estudiante 2 la vio una hora DESPUÉS de empezar el 2.º intento; con k = 5 la métrica ya no llega a la celda
    rows = with_feedback(viewed_students={1, 3, 4, 5})
    second_start = T0 + timedelta(days=2, minutes=2)
    rows = [replace(r, feedback_viewed_at=second_start + timedelta(hours=1)) if r.attempt_id == "s2-c1-n1" else r
            for r in rows]

    assert "improvementAfterFeedback" not in run(rows)


def test_verla_justo_cuando_empieza_el_siguiente_intento_tampoco_cuenta():
    rows = with_feedback(viewed_students={1, 2, 3, 4})
    start_5 = T0 + timedelta(days=2, minutes=5)
    rows = [replace(r, feedback_viewed_at=start_5) if r.attempt_id == "s5-c1-n1" else r
            for r in rows]  # «antes de que empiece» es estrictamente antes

    assert "improvementAfterFeedback" not in run(rows)


def test_sin_nadie_que_la_haya_visto_el_bloque_se_omite():
    assert "improvementAfterFeedback" not in run(with_feedback(viewed_students=set()))


# ─── redondeo y forma ─────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("value", "places", "expected"),
    [
        (Fraction(25, 4), 1, 6.3),  # 6.25 → 6.3 (mitad hacia arriba; el redondeo bancario daría 6.2)
        (Fraction(2675, 1000), 2, 2.68),
        (Fraction(1, 3), 1, 0.3),
        (Fraction(2, 3), 1, 0.7),
        (Fraction(-5, 100), 1, -0.1),  # mitad hacia arriba en valor absoluto
        (Fraction(-1285, 36), 1, -35.7),
        (Fraction(0), 1, 0.0),
        (Fraction(7), 2, 7.0),
    ],
)
def test_el_redondeo_es_de_mitad_hacia_arriba_y_exacto(value, places, expected):
    assert analytics.round_half_up(value, places) == expected


def test_la_salida_es_json_puro_sin_fracciones_ni_decimales():
    rows = with_feedback(viewed_students={1, 2, 3, 4, 5}) + [row(s, 1, case=2, rating=4) for s in range(1, 6)]

    result = run(rows, survey_enabled=True)

    text = json.dumps(result)  # no lanza: ningún Fraction/Decimal/datetime se filtró

    assert json.loads(text) == result


def test_las_definiciones_dicen_con_que_reglas_se_calculo_y_que_son_borrador():
    result = run(five_students(), min_cell=7, acceptable_level=EN_PROCESO, reflection_definition="PER_DECISION_SCENE",
                 profile_rules="otra-regla")

    assert result["definitions"] == {
        "status": "BORRADOR", "acceptableLevel": EN_PROCESO, "minCell": 7, "reflectionDefinition": "PER_DECISION_SCENE",
        "profileRules": "otra-regla",
    }


def test_calcular_no_cambia_las_filas_ni_depende_del_orden_ni_de_la_hora():
    rows = five_students()
    before = list(rows)

    first, second = run(rows), run(list(reversed(rows)))

    assert rows == before and first == second
