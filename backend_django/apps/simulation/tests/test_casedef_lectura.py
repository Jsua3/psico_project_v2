"""Los largos de lectura (``casedef.lectura``): avisos, nunca errores, con el texto concreto que pasa su tope.

La generación los dice en su instrucción con los mismos números, y un caso escrito a mano recibe el mismo aviso.
"""
import json
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef import lectura
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.report import ERROR, WARNING
from apps.simulation.casedef.validate import validate_document
from apps.simulation.services.authoring import importing, validation
from apps.simulation.services.authoring.generation.prompts import SYSTEM_GENERATE
from apps.simulation.tests.definition_samples import sample_definition_v21

User = get_user_model()
INSIGNIA = Path(__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-002.dsl.json"


def _largo(n: int, inicio: str = "Te cuento lo que pasó") -> str:
    """Un texto de exactamente ``n`` caracteres que empieza por ``inicio``."""
    return (f"{inicio}. " + "Y luego todo siguió igual, sin que nadie dijera nada. " * 20)[:n - 1] + "."


def _documento():
    return to_document(sample_definition_v21())


def _avisos(documento):
    return [issue for issue in validate_document(documento) if issue.code == lectura.CODE]


def test_la_muestra_corta_no_tiene_avisos():
    assert _avisos(_documento()) == []


def test_un_parlamento_largo_es_aviso_con_el_texto_y_el_consejo():
    documento = _documento()
    linea = documento["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["lineas"][0]
    linea["texto"] = _largo(250, "Necesito contarle algo que me pasó anoche")
    (aviso,) = _avisos(documento)
    assert aviso.severity == WARNING
    assert aviso.path == "x-siep.escenas[0].mapa.dialogos[0].lineas[0].texto"
    assert "250 caracteres" in aviso.message and "hasta 200" in aviso.message
    assert "varios turnos cortos del mismo personaje" in aviso.message
    assert "«Necesito contarle algo que me pasó anoche" in aviso.message


def test_justo_en_el_tope_no_avisa_y_un_caracter_mas_si():
    documento = _documento()
    linea = documento["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["lineas"][0]
    linea["texto"] = "a" * lectura.TOPES["parlamento"]
    assert _avisos(documento) == []
    linea["texto"] = "a" * (lectura.TOPES["parlamento"] + 1)
    assert len(_avisos(documento)) == 1


def test_una_narracion_larga_nombra_la_escena():
    documento = _documento()
    documento["escenas"][0]["descripcion"] = _largo(420)
    (aviso,) = _avisos(documento)
    assert aviso.path == "escenas[0].descripcion"
    assert aviso.message.startswith("Escena «Reunión»: la narración tiene 420 caracteres")
    assert "hasta 300" in aviso.message


def test_la_respuesta_que_se_lee_es_la_eleccion_del_dialogo():
    """``OP01`` se elige desde la elección ``c1``: su texto resumen no se lee al jugar; el de la elección, sí."""
    documento = _documento()
    documento["escenas"][0]["decision"]["opciones"][0]["texto"] = _largo(180)
    assert _avisos(documento) == []
    documento["x-siep"]["escenas"][0]["mapa"]["dialogos"][0]["elecciones"][0]["texto"] = _largo(180)
    (aviso,) = _avisos(documento)
    assert aviso.path.endswith("elecciones[0].texto")
    assert "cuatro respuestas se vean sin desplazarse" in aviso.message


def test_una_opcion_sin_eleccion_avisa_por_su_texto():
    documento = _documento()
    documento["escenas"][1]["decision"]["opciones"][0]["texto"] = _largo(180)
    (aviso,) = _avisos(documento)
    assert aviso.path == "escenas[1].decision.opciones[0].texto"


def test_el_mismo_texto_largo_repetido_avisa_una_vez():
    """La generación escribe la retroalimentación en la inmediata y en el mensaje: un solo aviso."""
    documento = _documento()
    opcion = documento["x-siep"]["escenas"][0]["opciones"][0]
    opcion["retroalimentacionInmediata"] = opcion["mensaje"] = _largo(300)
    avisos = _avisos(documento)
    assert len(avisos) == 1 and "esta retroalimentación tiene 300 caracteres" in avisos[0].message


@pytest.mark.parametrize(("ruta", "tipo"), [
    (("escenas", "*", "descripcion"), "narración"),
    (("x-siep", "escenas", "*", "mapa", "dialogos", "*", "lineas", "*", "texto"), "parlamento"),
    (("escenas", "*", "decision", "pregunta"), "pregunta"),
    (("x-siep", "escenas", "*", "mapa", "dialogos", "*", "elecciones", "*", "texto"), "opción"),
    (("x-siep", "escenas", "*", "opciones", "*", "retroalimentacionInmediata"), "consecuencia"),
    (("x-siep", "escenas", "*", "opciones", "*", "reaccion", "linea"), "reacción"),
    (("x-siep", "escenas", "*", "comentarios", "*", "linea"), "comentario"),
    (("escenas", "*", "decision", "pistas", "*"), "pista"),
    (("x-siep", "escenas", "*", "mapa", "objetos", "*", "etiqueta"), None),
    (("caso", "descripcion"), None),
])
def test_cada_ruta_tiene_su_tipo(ruta, tipo):
    assert lectura.tipo_de(ruta) == tipo


def test_el_caso_insignia_casi_no_tiene_avisos():
    """SIM-VBG-002 es la referencia de lo que se lee cómodo: solo la narración del capítulo 1 y tres documentos leídos."""
    avisos = _avisos(json.loads(INSIGNIA.read_text(encoding="utf-8")))
    assert len(avisos) <= 4
    assert all(aviso.severity == WARNING for aviso in avisos)


@pytest.mark.django_db
def test_los_avisos_no_impiden_importar_y_la_revision_los_muestra_en_su_escena():
    """Un caso escrito a mano (importado) recibe el mismo aviso; se importa igual y la revisión del editor lo enfoca."""
    admin = User.objects.get(email="admin@psychosim.edu.co")
    documento = _documento()
    documento["caso"]["id"] = "SIM-LECTURA-01"
    documento["escenas"][0]["descripcion"] = _largo(420)
    importado = importing.import_document(documento, admin)
    assert any(issue["code"] == lectura.CODE and issue["severity"] == WARNING for issue in importado["issues"])
    issues, _ = validation.validate_version(importado["caseVersionId"])
    (aviso,) = [issue for issue in issues if issue["code"] == lectura.CODE]
    assert aviso["severity"] == WARNING and "nodeId" in aviso
    assert not any(issue["code"] == lectura.CODE and issue["severity"] == ERROR for issue in issues)


@pytest.mark.parametrize("tipo", ["narración", "parlamento", "opción", "consecuencia", "reacción", "comentario", "pista"])
def test_la_instruccion_de_la_generacion_dice_cada_tope_de_lectura(tipo):
    assert f"hasta {lectura.TOPES[tipo]} caracteres" in SYSTEM_GENERATE


def test_la_instruccion_pide_repartir_los_parlamentos_largos():
    assert "varias líneas seguidas suyas" in SYSTEM_GENERATE
    assert "para que las cuatro se vean juntas" in SYSTEM_GENERATE
    assert "80 a 200 palabras" not in SYSTEM_GENERATE
