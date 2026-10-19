"""La guía de la compuerta «antes de la primera cuenta real» nombra exactamente los pasos que corre el script (S7-4).

El script (scripts/gate-primera-cuenta-support.mjs) define cada paso con `id: '…'`; la guía (docs/seguridad/…) lo nombra en
la última columna de su tabla. Si uno de los dos cambia y el otro no, quien despliega lee una guía que no describe lo que
corre: esta prueba lo impide.
"""
import re
from pathlib import Path

import pytest

pytestmark = [pytest.mark.req("RNF-02", "RNF-01", "D-5", "LS-4"), pytest.mark.security]

RAIZ = Path(__file__).resolve().parents[3]
SOPORTE = RAIZ / "scripts" / "gate-primera-cuenta-support.mjs"
GUIA = RAIZ / "docs" / "seguridad" / "compuerta-primera-cuenta.md"

PATRON_ID_DEL_SCRIPT = re.compile(r"\bid: '([a-z0-9-]+)'")
FILA_DE_LA_TABLA = re.compile(r"^\|\s*(\d+|extra)\s*\|")
ID_EN_COMILLAS = re.compile(r"`([a-z0-9-]+)`")


def ids_del_script(texto):
    return PATRON_ID_DEL_SCRIPT.findall(texto)


def ids_de_la_guia(texto):
    """Los ids de la columna «Paso» (la última) de cada fila de la tabla: sus filas tienen seis columnas."""
    ids = []
    for linea in texto.splitlines():
        celdas = linea.split("|")
        if len(celdas) == 8 and FILA_DE_LA_TABLA.match(linea):
            ids += ID_EN_COMILLAS.findall(celdas[-2])
    return ids


def filas_de_la_guia(texto):
    return [linea for linea in texto.splitlines() if len(linea.split("|")) == 8 and FILA_DE_LA_TABLA.match(linea)]


def comparar(ids_script, ids_guia):
    """Diferencias: ids que la guía no nombra, ids que nombra sin existir en el script, y ids repetidos en la tabla."""
    faltan = sorted(set(ids_script) - set(ids_guia))
    sobran = sorted(set(ids_guia) - set(ids_script))
    repetidos = sorted({un_id for un_id in ids_guia if ids_guia.count(un_id) > 1})
    return faltan, sobran, repetidos


def test_la_guia_nombra_exactamente_los_pasos_del_script():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    ids_guia = ids_de_la_guia(GUIA.read_text(encoding="utf-8"))
    assert ids_script, "el script no define ningún paso con id"
    assert ids_guia, "la guía no tiene la tabla de pasos"
    faltan, sobran, repetidos = comparar(ids_script, ids_guia)
    assert faltan == [], f"la guía no nombra estos pasos: {faltan}"
    assert sobran == [], f"la guía nombra pasos que el script no define: {sobran}"
    assert repetidos == [], f"la guía repite estos pasos en su tabla: {repetidos}"


def test_la_tabla_tiene_las_27_filas_del_plan_y_la_fila_extra_de_salud():
    filas = filas_de_la_guia(GUIA.read_text(encoding="utf-8"))
    assert len(filas) == 28
    assert sum(1 for fila in filas if fila.split("|")[1].strip() == "extra") == 1


# Los controles negativos comparan contra la guía real (la línea base) y miran solo lo que cambian: así no dependen de
# que la guía esté bien en ese momento, y el control sigue mostrando la diferencia que provoca.

def test_control_negativo_detecta_un_paso_que_la_guia_no_nombra():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    faltan_base, _, _ = comparar(ids_script, ids_de_la_guia(base))
    guia_sin_salud = "\n".join(linea for linea in base.splitlines() if "`salud`" not in linea)
    faltan, _, _ = comparar(ids_script, ids_de_la_guia(guia_sin_salud))
    assert set(faltan) - set(faltan_base) == {"salud"}


def test_control_negativo_detecta_un_paso_inventado_en_la_guia():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    _, sobran_base, _ = comparar(ids_script, ids_de_la_guia(base))
    guia = base + "\n| extra | prueba | automática | script | C0 | `paso-inventado` |\n"
    _, sobran, _ = comparar(ids_script, ids_de_la_guia(guia))
    assert set(sobran) - set(sobran_base) == {"paso-inventado"}


def test_control_negativo_detecta_un_id_repetido_en_la_tabla():
    ids_script = ids_del_script(SOPORTE.read_text(encoding="utf-8"))
    base = GUIA.read_text(encoding="utf-8")
    _, _, repetidos_base = comparar(ids_script, ids_de_la_guia(base))
    guia = base + "\n| extra | repetida | automática | script | C11 | `salud` |\n"
    _, _, repetidos = comparar(ids_script, ids_de_la_guia(guia))
    assert set(repetidos) - set(repetidos_base) == {"salud"}


@pytest.mark.parametrize("texto", ["", "sin tabla ni pasos"])
def test_sin_tabla_no_hay_ids_que_comparar(texto):
    assert ids_de_la_guia(texto) == []
    assert ids_del_script(texto) == []
