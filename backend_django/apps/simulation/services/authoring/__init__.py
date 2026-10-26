"""Subsistema de autoría de casos (P-05b).

Antes todo esto era un único ``authoring_service.py`` de 1266 líneas. Cada módulo es
una responsabilidad; las vistas no importan nada de este paquete: entran por la
fachada ``services/authoring_service.py``, que además aplica la auditoría.

- ``guards``           — qué versión, y qué entidades, se pueden tocar (404/400).
- ``request_utils``    — lectura de los cuerpos de petición del editor.
- ``editor_view``      — la vista de lectura del editor (``editor``) y sus DTO.
- ``cases``            — listar y crear casos.
- ``graph``            — nodos y decisiones (el grafo del caso).
- ``rules``            — las reglas del modelo de métricas: hitos, nivel de riesgo y finales.
- ``scenes``           — mapas, objetos y diálogos.
- ``tools``            — herramientas clínicas.
- ``characters``       — el catálogo de personajes del caso (E3-3).
- ``publication``      — checklist, publicar y clonar una versión.
- ``world_definition`` — el editor de mundo (WorldDefinition v2): leer, guardar,
                         validar y previsualizar.
- ``definition_io``    — las filas de una versión ↔ el modelo puro ↔ el documento canónico (E4).
- ``validation``       — la validación única de una versión: el mundo (``WORLD.*``) y el documento
                         (``DSL.*``) en una sola lista de ``ValidationIssue`` (E4-2b).
- ``gate``             — la compuerta única de publicación (E4-4): valida, calcula el sello y es la
                         única escritura de ``PUBLISHED`` (regla de arquitectura ``publicacion-unica``).
- ``ethics``           — la lista ética verificable (S3-3): quién respalda cada casilla y qué datos
                         comprueba el sistema (recursos de apoyo, aviso vigente, constancia).

Dependencias (sin ciclos): ``guards`` y ``request_utils`` no importan nada del paquete;
``ethics`` solo importa ``checklist``; ``editor_view`` importa ``guards``, ``checklist`` y ``ethics``
(la vista dice si el dato de cada casilla existe); ``graph``, ``rules`` y ``scenes`` importan ``editor_view``,
``guards`` y ``request_utils``; ``tools`` y ``characters`` importan ``editor_view`` y ``guards``;
``world_definition`` importa ``editor_view`` (la herramienta clínica se ve igual en los dos
editores), ``guards`` y ``scenes`` (las opciones de un diálogo se guardan igual en los dos
sitios); ``definition_io`` solo importa modelos y ``casedef``; ``validation`` importa
``definition_io``, ``guards`` y ``world_definition`` (el mundo se valida sobre las filas); ``gate``
importa ``validation``, ``editor_view``, ``ethics`` y ``guards``; ``lifecycle`` importa ``gate`` (un caso con
errores no se envía ni se aprueba, y aprobar sella) y ``editor_view`` (la vista del ciclo trae la lista con sus
respaldos); ``publication`` importa ``editor_view``,
``guards``, ``request_utils``, ``lifecycle`` y ``world_definition`` (publicar valida el mundo);
``cases`` importa ``editor_view`` y ``publication`` (un caso nuevo nace con su checklist).
"""
