from apps.simulation.casedef import siep, validate
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.import_ import to_definition
from apps.simulation.tests.definition_samples import sample_definition, sample_definition_with_comments


def _scene0(document):
    return document["x-siep"]["escenas"][0]


def _codes(document):
    return {issue.code for issue in validate.validate_document(document)}


def _with_comments(comments):
    document = to_document(sample_definition_with_comments())
    _scene0(document)["comentarios"] = comments
    return document


def test_un_caso_con_comentarios_se_exporta_como_2_1_e_ida_y_vuelta():
    definition = sample_definition_with_comments()
    document = to_document(definition)
    assert document["x-siep"]["version"] == "2.1"
    assert siep.version_of(definition) == "2.1"
    comments = _scene0(document)["comentarios"]
    assert comments[0] == {"personaje": "laura", "linea": "Qué bueno que llegó, la esperaba."}
    assert comments[1] == {
        "personaje": "laura", "linea": "Esa carpeta tiene las notas del equipo.",
        "cuando": {"inspected": "carpeta"}, "emocion": "preocupada", "gesto": "se-acerca",
    }
    assert validate.validate_document(document) == []
    assert to_definition(document).scenes[0].comments == definition.scenes[0].comments
    assert to_definition(document) == definition


def test_sin_comentarios_no_se_escribe_la_clave_y_sigue_siendo_2_0():
    document = to_document(sample_definition())
    assert document["x-siep"]["version"] == "2.0"
    assert all("comentarios" not in e for e in document["x-siep"]["escenas"])


def test_siete_comentarios_en_una_escena_es_hallazgo_del_esquema():
    document = _with_comments([{"personaje": "laura", "linea": f"Comentario {n}"} for n in range(7)])
    assert "DSL.LIMIT_EXCEEDED" in _codes(document)  # maxItems 6 del esquema, que siep_check informa como tope
    document = _with_comments([{"personaje": "laura", "linea": f"Comentario {n}"} for n in range(6)])
    assert validate.validate_document(document) == []


def test_comentario_sin_linea_o_sin_personaje_es_hallazgo():
    assert "DSL.SIEP_SCHEMA" in _codes(_with_comments([{"personaje": "laura"}]))
    assert "DSL.SIEP_SCHEMA" in _codes(_with_comments([{"linea": "Hola"}]))


def test_cuando_invalido_es_DSL_SIEP_CONDITION():
    document = _with_comments([{"personaje": "laura", "linea": "Hola", "cuando": {"talked": 3}}])
    assert "DSL.SIEP_CONDITION" in _codes(document)


def test_cuando_de_mas_de_2000_caracteres_es_DSL_SIEP_CONDITION():
    long_when = {"all": [{"inspected": "carpeta"}] * 120}
    assert len(str(long_when)) > 2000
    document = _with_comments([{"personaje": "laura", "linea": "Hola", "cuando": long_when}])
    assert "DSL.SIEP_CONDITION" in _codes(document)


def test_linea_con_salto_o_enlace_es_hallazgo_de_texto():
    assert _codes(_with_comments([{"personaje": "laura", "linea": "Hola\notra línea"}]))
    assert _codes(_with_comments([{"personaje": "laura", "linea": "Mire https://ejemplo.com ahora"}]))
    assert _codes(_with_comments([{"personaje": "laura", "linea": "x" * 401}]))
