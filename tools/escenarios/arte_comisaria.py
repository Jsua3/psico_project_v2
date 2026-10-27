"""Arte provisional de la comisaría de familia, dibujado por código en pixel art
(ver biblioteca/escenarios/ESTILO.md, «Comisaría de familia»).

Lo compartido (fondos, muebles genéricos, iconos, acabado y generar_lugar) vive en arte_comun.py.
Aquí se unen las tres partes propias de la comisaría, cada una en su archivo:

- arte_comisaria_salas_a.py: paletas y dibujo propio de fachada, recepcion, sala-espera, pasillo y archivo.
- arte_comisaria_salas_b.py: paletas y dibujo propio de orientacion-juridica, despacho-comisaria,
  consultorio-psicosocial y sala-entrevista-nna (cámara de Gesell).
- arte_comisaria_muebles.py: los 18 muebles de la comisaría y el icono del acta de registro.

    python tools/escenarios/arte_comisaria.py biblioteca/escenarios/comisaria/escenario.json [--factor N] [--salas a,b]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import *  # noqa: E402,F401,F403  (fondos, muebles, iconos, acabado y generar_lugar)
from arte_comisaria_salas_a import PROPIOS as PROPIOS_A, SALAS as SALAS_A  # noqa: E402
from arte_comisaria_salas_b import PROPIOS as PROPIOS_B, SALAS as SALAS_B  # noqa: E402
from arte_comisaria_muebles import ICONOS_PROPIOS, MUEBLES  # noqa: E402,F811

# A dónde lleva cada puerta: color de la hoja y dibujo de su placa (sin texto).
DESTINO_PUERTA = {
    'recepcion': ((70, 82, 100), None),
    'sala-espera': ((70, 82, 100), 'corazon'),
    'pasillo': ((70, 82, 100), None),
    'orientacion-juridica': ((62, 74, 92), 'libro'),
    'despacho-comisaria': ((62, 74, 92), 'maletin'),
    'consultorio-psicosocial': ((72, 92, 86), 'corazon'),
    'sala-entrevista-nna': ((72, 92, 86), 'estrella'),
    'archivo': ((62, 74, 92), None),
}

SALAS = {**SALAS_A, **SALAS_B}
PROPIOS = {**PROPIOS_A, **PROPIOS_B}
ICONOS = {
    'ficha-riesgo': ficha_riesgo, 'directorio-rutas': directorio, 'guia-primeros-auxilios': guia_pap,  # noqa: F405
    **ICONOS_PROPIOS,
}


def dibujar_propio(d, sala, p):
    """Lo propio de cada sala (espejo de Gesell, escudo, cartelera…), sobre la pared del fondo."""
    propio = PROPIOS.get(sala['id'])
    if propio:
        propio(d, sala, p)


def generar(ruta_escenario, factor=2, salas=None):
    return generar_lugar(ruta_escenario, SALAS, MUEBLES, ICONOS, factor=factor, salas=salas,  # noqa: F405
                         destinos=DESTINO_PUERTA, dibujar_propio=dibujar_propio)


if __name__ == '__main__':
    principal('arte_comisaria.py', SALAS, MUEBLES, ICONOS, destinos=DESTINO_PUERTA, dibujar_propio=dibujar_propio)  # noqa: F405
