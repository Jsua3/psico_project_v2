"""El proveedor falso de C1 arma un caso bien generado: entre sus escenas declara las seis competencias de la rúbrica básica.

Sin eso, la revisión del caso generado lista «La competencia … de la rúbrica no tiene evidencia» (``competency-without-evidence``,
error en cuanto alguna opción declara competencias) y el e2e de la generación no puede enviarlo. La regla no se afloja: el
proveedor falso hace lo que haría un caso bien generado.
"""
import json
from pathlib import Path

from apps.simulation.services.authoring import generation
from apps.simulation.services.rubric_service import BASIC_CRITERIA

CARPETA = Path(generation.__file__).resolve().parent / "fixtures" / "universidad"


def _competencias_de(escena):
    return {c for opcion in escena.get("opciones", []) for c in opcion.get("competencias", [])}


def test_el_proveedor_falso_declara_las_seis_competencias_de_la_rubrica_basica():
    esqueleto = json.loads((CARPETA / "esqueleto.json").read_text(encoding="utf-8"))
    declaradas = set()
    for escena in esqueleto["escenas"]:
        declaradas |= _competencias_de(json.loads((CARPETA / f"escena-{escena['sala']}.json").read_text(encoding="utf-8")))
    assert {codigo for codigo, *_ in BASIC_CRITERIA} <= declaradas


def test_las_variantes_de_reparacion_declaran_lo_mismo_que_su_escena():
    # Las variantes «.reparar» y «.encimada» reemplazan a su escena en algunas pruebas: no pueden perder competencias.
    for variante in sorted(CARPETA.glob("escena-*.*.json")):
        base = CARPETA / f"{variante.name.split('.')[0]}.json"
        assert _competencias_de(json.loads(base.read_text(encoding="utf-8"))) <= _competencias_de(
            json.loads(variante.read_text(encoding="utf-8"))), variante.name
