"""Geometría de las salas, con el nombre de siempre en la biblioteca (contrato x-siep 2.2, sección 1).

La definición vive en ``apps.simulation.casedef.geometria``: es Python puro y la usan también las reglas OCL-13 a OCL-18,
que no pueden importar otras apps (regla de arquitectura ``casedef-puro``). Este módulo la reexporta para la copia al caso
y para quien la conoce por esta ruta.
"""
from apps.simulation.casedef.geometria import *  # noqa: F401,F403
from apps.simulation.casedef.geometria import TABLA_DORADA, escribir_tabla_dorada, tabla_dorada  # noqa: F401
