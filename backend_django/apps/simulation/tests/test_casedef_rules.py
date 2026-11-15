"""E4-2a · Las 16 reglas del taller en el producto: forma, ``OCL-01…08`` y ``PROP-01…08``.

Sin base de datos. Cada regla tiene su prueba rojo→verde: un documento válido que la cumple, la misma
base alterada para romperla y el conjunto exacto de reglas que se incumplen. Los conjuntos esperados
los calculó el **validador del taller** (el oráculo, ``tests/taller_dsl/validar_dsl.py``) sobre estas
mismas alteraciones, incluidas las que arrastran a otra regla (borrar las escenas deja sin destino a la
retroalimentación): el producto no puede opinar distinto. La prueba diferencial de E4-3 lo comprueba en
200 alteraciones más.
"""
import copy

import pytest

from apps.simulation.casedef.validate import run_rules
from apps.simulation.tests import dsl_support

pytestmark = [pytest.mark.req("RF-12"), pytest.mark.req("RN-05"), pytest.mark.req("CU-08")]


def _definition():
    return dsl_support.example(with_execution=False)


def _full():
    return dsl_support.example(with_execution=True)


def _opening(doc):
    return doc["escenas"][0]["decision"]["opciones"]


def _extra_decision(doc, options):
    doc["escenas"][1]["decision"] = {"id": "D02", "pregunta": "¿Y ahora?", "opciones": options}


def _two_options(first_target, second_target):
    return [
        {"id": "OP03", "texto": "Uno", "siguienteEscena": first_target, "clasificacion": "ADECUADA"},
        {"id": "OP04", "texto": "Dos", "siguienteEscena": second_target, "clasificacion": "RIESGOSA"},
    ]


def _duplicate_decision(doc):
    doc["escenas"][1]["decision"] = copy.deepcopy(doc["escenas"][0]["decision"])
    doc["escenas"][1]["decision"]["id"] = "D01"


def _two_open_attempts(doc):
    first = doc["ejecucion"]["intentos"][0]
    first.update(estado="EN_CURSO", escenaActual="E01")
    first.pop("finalizadoEn")
    first["bitacora"].update(bloqueada=False, decisiones=[])
    second = copy.deepcopy(first)
    second.update(id="INT-02", bitacora={"id": "BIT-02", "creadaEn": "2026-10-09T15:00:00-05:00", "bloqueada": False})
    doc["ejecucion"]["intentos"].append(second)


def _choose_option_of_another_decision(doc):
    _extra_decision(doc, _two_options("E03", "E03"))
    doc["ejecucion"]["intentos"][0]["bitacora"]["decisiones"].insert(
        0, {"orden": 1, "momento": "2026-10-09T15:01:00-05:00", "aplicada": True, "opcionElegida": "OP03"}
    )


def _repeat_reflection(doc):
    reflections = doc["ejecucion"]["intentos"][0]["bitacora"]["reflexiones"]
    reflections.append(copy.deepcopy(reflections[0]))


def _drop_decisions(doc):
    for scene in doc["escenas"]:
        scene.pop("decision", None)


#: (nombre, base, alteración, reglas que el taller dice que se incumplen)
CASES = [
    ("OCL-01 el caso no tiene escenas", _definition, lambda d: d.__setitem__("escenas", []), {"OCL-01", "OCL-06"}),
    ("OCL-02 una decisión con una sola opción", _definition, lambda d: _opening(d).pop(),
     {"OCL-02", "OCL-06", "PROP-02"}),
    ("OCL-03 una opción conduce a una escena que no existe", _definition,
     lambda d: _opening(d)[1].__setitem__("siguienteEscena", "E09"), {"OCL-03", "PROP-02"}),
    ("OCL-04 dos decisiones con el mismo id", _definition, _duplicate_decision, {"OCL-04", "PROP-01", "PROP-06"}),
    ("OCL-05 una herramienta que el caso no define", _definition,
     lambda d: _opening(d)[1].__setitem__("herramienta", "H09"), {"OCL-05"}),
    ("OCL-06 retroalimentación sin destino", _definition, lambda d: d["retroalimentacion"][0].pop("decision"),
     {"OCL-06"}),
    ("OCL-06 retroalimentación con dos destinos", _definition,
     lambda d: d["retroalimentacion"][0].__setitem__("opcion", "OP01"), {"OCL-06"}),
    ("OCL-06 retroalimentación de una decisión que no existe", _definition,
     lambda d: d["retroalimentacion"][0].__setitem__("decision", "D09"), {"OCL-06"}),
    ("OCL-07 título en blanco", _definition, lambda d: d["caso"].__setitem__("titulo", "   "), {"OCL-07"}),
    ("OCL-07 sin descripción", _definition, lambda d: d["caso"].pop("descripcion"), {"OCL-07"}),
    ("OCL-08 ninguna escena con decisión", _definition, _drop_decisions, {"OCL-06", "OCL-08", "PROP-02"}),
    ("PROP-01 un id repetido", _definition, lambda d: d["personajes"][1].__setitem__("id", "P01"),
     {"PROP-01", "PROP-03"}),
    ("PROP-02 una escena a la que ningún camino llega", _definition,
     lambda d: d["escenas"].append({"id": "E04", "titulo": "Suelta", "descripcion": "Nadie llega aquí."}),
     {"PROP-02"}),
    ("PROP-02 la escena inicial no existe", _definition,
     lambda d: d["caso"].__setitem__("escenaInicial", "E09"), {"PROP-02"}),
    ("PROP-03 un participante sin definir", _definition,
     lambda d: d["escenas"][0]["participantes"].append("P09"), {"PROP-03"}),
    ("PROP-06 un ciclo", _definition, lambda d: _extra_decision(d, _two_options("E01", "E03")), {"PROP-06"}),
    ("PROP-04 una opción de otra decisión en la bitácora", _full, _choose_option_of_another_decision,
     {"PROP-04", "PROP-05"}),
    ("PROP-05 el orden de los registros se rompe", _full,
     lambda d: d["ejecucion"]["intentos"][0]["bitacora"]["decisiones"][0].__setitem__("orden", 3), {"PROP-05"}),
    ("PROP-05 una reflexión repetida en la misma escena", _full, _repeat_reflection, {"PROP-05"}),
    ("PROP-05 el intento completado se cierra a destiempo", _full,
     lambda d: d["ejecucion"]["intentos"][0].__setitem__("finalizadoEn", "2026-10-09T15:05:00-05:00"),
     {"PROP-05", "PROP-07"}),
    ("PROP-05 la escena actual no es donde dejan al intento sus decisiones", _full,
     lambda d: d["ejecucion"]["intentos"][0].__setitem__("escenaActual", "E03"), {"PROP-05"}),
    ("PROP-07 la rúbrica aplicada está inactiva", _full, lambda d: d["rubricas"][0].__setitem__("activa", False),
     {"PROP-07"}),
    ("PROP-07 se valora un criterio que no es de la rúbrica", _full,
     lambda d: d["ejecucion"]["evaluaciones"][0]["valoraciones"][0].__setitem__("criterio", "CR09"), {"PROP-07"}),
    ("PROP-07 una evaluación EVALUADA que no cubre los criterios", _full,
     lambda d: d["ejecucion"]["evaluaciones"][0]["valoraciones"].pop(), {"PROP-07"}),
    ("PROP-08 el intento es de un estudiante que no está en el documento", _full,
     lambda d: d["ejecucion"]["intentos"][0].__setitem__("estudiante", "EST-09"), {"PROP-08"}),
    ("PROP-08 dos intentos abiertos del mismo estudiante", _full, _two_open_attempts, {"PROP-08"}),
    ("FORMA una clave desconocida", _definition, lambda d: d.__setitem__("sobra", 1), {"FORMA"}),
    ("FORMA un estado fuera de la enumeración", _definition, lambda d: d["caso"].__setitem__("estado", "OTRO"),
     {"FORMA"}),
    ("FORMA un id con el formato equivocado", _definition,
     lambda d: d["escenas"][0].__setitem__("id", "ESCENA1"), {"FORMA", "PROP-02"}),
    ("FORMA una decisión sin pregunta", _definition, lambda d: d["escenas"][0]["decision"].pop("pregunta"),
     {"FORMA"}),
    ("FORMA sin escena inicial", _definition, lambda d: d["caso"].pop("escenaInicial"), {"FORMA", "PROP-02"}),
    ("FORMA una opción prohibida sin motivo", _definition,
     lambda d: _opening(d)[1].__setitem__("conductaProhibida", True), {"FORMA"}),
]


@pytest.mark.parametrize("base", [_definition, _full], ids=["definición", "con ejecución"])
def test_the_workshop_example_complies_with_every_rule(base):
    report = run_rules(base())
    assert report.failed_rules() == set()
    assert report.verdict() == "valido"


@pytest.mark.parametrize(("name", "base", "alteration", "expected"), CASES, ids=[c[0] for c in CASES])
def test_each_rule_fires_exactly_where_the_workshop_validator_says(name, base, alteration, expected):
    document = base()
    alteration(document)
    report = run_rules(document)
    assert report.failed_rules() == expected, name
    assert report.verdict() == "con-errores"


def test_a_document_that_is_not_an_object_fails_the_form_and_the_case_level_rules():
    assert run_rules([]).failed_rules() == {"FORMA", "OCL-01", "OCL-07"}


def test_rules_that_do_not_apply_say_so_instead_of_passing_silently():
    report = run_rules(_definition())
    by_rule = {result.rule: result for result in report.results}
    assert by_rule["PROP-04"].state == "NO_APLICA"
    assert by_rule["PROP-05"].state == "NO_APLICA"
    assert by_rule["PROP-08"].state == "NO_APLICA"
    assert by_rule["OCL-01"].state == "CUMPLE" and by_rule["OCL-01"].evaluated == 1
    assert list(by_rule) == [
        "FORMA", *[f"OCL-0{n}" for n in range(1, 9)], *[f"PROP-0{n}" for n in range(1, 9)],
        *[f"OCL-{n:02d}" for n in range(9, 13)],
        # Bloque P3: las salas por piezas (x-siep 2.2).
        *[f"OCL-{n}" for n in range(13, 19)],
    ]


def test_every_finding_names_its_element_and_its_path():
    document = _definition()
    document["caso"]["titulo"] = "  "
    findings = [f for result in run_rules(document).results for f in result.findings]
    assert [(f.element, f.path) for f in findings] == [("Caso CASO-001", "caso.titulo")]
    assert "título" in findings[0].message
