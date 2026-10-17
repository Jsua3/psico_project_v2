"""``casedef``: la definición del caso como documento (E4, ADR-3 de la mesa de opciones).

Python **puro**: no importa Django, DRF ni otras apps (regla de arquitectura ``casedef-puro``).
Aquí viven el modelo de la definición, el documento canónico y su huella, el intérprete de
forma y las reglas del taller de DSL, la validación de ``x-siep`` y de los textos, los límites de
entrada, la importación a modelo, la sala mínima y la medida de reutilización. Lo que toca filas
de la base de datos vive fuera: ``services/authoring/definition_io.py`` y ``validation.py``.
"""
