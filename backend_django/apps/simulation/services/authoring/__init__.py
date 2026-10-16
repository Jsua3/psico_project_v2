"""Subsistema de autoría de casos (P-05b).

Antes todo esto era un único ``authoring_service.py`` de 1266 líneas. Cada módulo es
una responsabilidad; las vistas no importan nada de este paquete: entran por la
fachada ``services/authoring_service.py``, que además aplica la auditoría.

- ``guards``           — qué versión, y qué entidades, se pueden tocar (404/400).
- ``request_utils``    — lectura de los cuerpos de petición del editor.
- ``editor_view``      — la vista de lectura del editor (``editor``) y sus DTO.
- ``cases``            — listar y crear casos.
- ``graph``            — nodos y decisiones (el grafo del caso).
- ``scenes``           — mapas, objetos y diálogos.
- ``tools``            — herramientas clínicas.
- ``characters``       — el catálogo de personajes del caso (E3-3).
- ``publication``      — checklist, publicar y clonar una versión.
- ``world_definition`` — el editor de mundo (WorldDefinition v2): leer, guardar,
                         validar y previsualizar.

Dependencias (sin ciclos): ``guards`` y ``request_utils`` no importan nada del paquete;
``editor_view`` importa ``guards``; ``graph`` y ``scenes`` importan ``editor_view``,
``guards`` y ``request_utils``; ``tools`` y ``characters`` importan ``editor_view`` y ``guards``;
``world_definition`` importa ``editor_view`` (la herramienta clínica se ve igual en los dos
editores), ``guards`` y ``scenes`` (las opciones de un diálogo se guardan igual en los dos
sitios); ``publication`` importa ``editor_view``, ``guards``,
``request_utils`` y ``world_definition`` (publicar valida el mundo); ``cases`` importa
``editor_view`` y ``publication`` (un caso nuevo nace con su checklist).
"""
