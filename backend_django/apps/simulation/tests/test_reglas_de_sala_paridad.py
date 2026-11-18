import json
import re

from . import reglas_de_sala_casos as datos


def test_los_casos_compartidos_estan_al_dia():
    assert json.loads(datos.JSON.read_text(encoding='utf-8')) == datos.generar()


def test_la_copia_ts_trae_los_mismos_casos():
    fuente = datos.TS.read_text(encoding='utf-8')
    cuerpo = re.search(r'export const CASOS_DE_REGLAS_DE_SALA = (\{.*\}) as const;', fuente, re.S)
    assert cuerpo
    assert json.loads(cuerpo.group(1)) == datos.generar()


def test_cada_regla_tiene_un_caso_que_cumple_y_uno_que_incumple():
    casos = datos.generar()['casos']
    pares = [('borde exacto', 'borde fuera'), ('piezas se tocan', 'piezas chocan'),
             ('sentido único', 'sin regreso'), ('llegada libre', 'llegada sobre mueble'),
             ('persona accesible', 'persona tras muebles'), ('sala válida', 'catálogo desconocido'),
             ('trayecto libre', 'trayecto atraviesa mueble')]
    for numero, (bueno, malo) in enumerate(pares, 13):
        regla = f'OCL-{numero}'
        cumple = next(c for c in casos if c['nombre'] == bueno)
        incumple = next(c for c in casos if c['nombre'] == malo)
        assert not any(h['regla'] == regla for h in cumple['hallazgos'])
        assert any(h['regla'] == regla for h in incumple['hallazgos'])
