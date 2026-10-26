"""Arte provisional de la casa, dibujado por código en pixel art (ver biblioteca/escenarios/ESTILO.md, «Casa»).

Lo compartido (fondos, muebles genéricos, iconos, acabado y generar_lugar) vive en arte_comun.py.
Aquí se unen las tres partes propias de la casa, cada una en su archivo:

- arte_casa_salas_a.py: paletas y dibujo propio de fachada, sala, comedor, cocina y escalera.
- arte_casa_salas_b.py: paletas y dibujo propio de pasillo, habitacion-principal, habitacion-ninos y patio.
- arte_casa_muebles.py: los 20 muebles de la casa y el icono de la ficha del plan de seguridad.

Nada de violencia: no se dibuja a un agresor ni objetos rotos, manchas, armas o cuchillos a la vista.

    python tools/escenarios/arte_casa.py biblioteca/escenarios/casa/escenario.json [--factor N] [--salas a,b]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arte_comun import *  # noqa: E402,F401,F403  (fondos, muebles, iconos, acabado y generar_lugar)
from arte_casa_salas_a import PROPIOS as PROPIOS_A, SALAS as SALAS_A  # noqa: E402
from arte_casa_salas_b import PROPIOS as PROPIOS_B, SALAS as SALAS_B  # noqa: E402
from arte_casa_muebles import ICONOS_PROPIOS, MUEBLES  # noqa: E402,F811

# A dónde lleva cada puerta: color de la hoja y dibujo de su placa (sin texto).
DESTINO_PUERTA = {
    'sala': ((132, 92, 64), 'casa'),
    'comedor': ((132, 92, 64), None),
    'cocina': ((132, 92, 64), None),
    'escalera': ((132, 92, 64), None),
    'pasillo': ((132, 92, 64), None),
    'habitacion-principal': ((118, 84, 60), None),
    'habitacion-ninos': ((118, 84, 60), 'estrella'),
    'patio': ((104, 118, 92), 'hoja'),
}

SALAS = {**SALAS_A, **SALAS_B}
PROPIOS = {**PROPIOS_A, **PROPIOS_B}
ICONOS = {
    'ficha-riesgo': ficha_riesgo, 'directorio-rutas': directorio, 'guia-primeros-auxilios': guia_pap,  # noqa: F405
    **ICONOS_PROPIOS,
}


def dibujar_propio(d, sala, p):
    """Lo propio de cada sala (escalera, azulejos, reja de la fachada…), sobre la pared del fondo."""
    propio = PROPIOS.get(sala['id'])
    if propio:
        propio(d, sala, p)


def generar(ruta_escenario, factor=2, salas=None):
    return generar_lugar(ruta_escenario, SALAS, MUEBLES, ICONOS, factor=factor, salas=salas,  # noqa: F405
                         destinos=DESTINO_PUERTA, dibujar_propio=dibujar_propio)


if __name__ == '__main__':
    principal('arte_casa.py', SALAS, MUEBLES, ICONOS, destinos=DESTINO_PUERTA, dibujar_propio=dibujar_propio)  # noqa: F405
