# Asistente de IA de autoría: pendientes (P5)

Lo que quedó sin hacer o sin decidir al cerrar el backend del asistente. La guía de operación está en [`operacion/asistente-de-autoria.md`](../../operacion/asistente-de-autoria.md).

- **Prueba manual con una clave real.** Falta el paso 5 de la Tarea 3: pedir una escena nueva en el consultorio y mirar las tres respuestas. La clave va en el `.env` del backend (`AI_AUTHORING_API_KEY`), nunca en el chat ni en el repositorio.
- **Migración al fusionar con la rama de métricas.** `0032_ai_suggested` depende hoy de la hoja anterior de esta rama; al fusionar hay que re-apuntar su dependencia a la última migración de métricas (`0031`).
- **Pasar esta sección a los documentos consolidados.** Cuando `docs/SIEP.md` y `docs/PENDIENTES.md` lleguen a la rama (la consolidación de docs está sin commitear en el checkout principal), mover aquí lo que corresponda. Anotar entonces en el README del sandbox (`sandbox/editor-casos/README.md`, rama `claude/editor-casos-p3`) que su servidor Node queda solo para el sandbox.
- **Marcas perdidas al exportar e importar.** El documento de caso no lleva `ai_suggested`: exportar y volver a importar borra la marca de nodos, decisiones, objetos y líneas (los finales sí la conservan). Un caso con partes sin revisar puede perder el bloqueo si pasa por ese camino. Decidir si el documento debe llevarla.
- **Tope mensual sin cerrojo compartido.** El tope diario se reserva con cerrojo de fila; el mensual suma los usos de todos sin cerrojo común, así que con peticiones simultáneas al borde puede pasarse por, a lo más, el número de peticiones simultáneas.
- **P6 (cliente).** Debe aplicar las propuestas con las rutas de autoría existentes (mapa en `schema.py`), mostrar la marca «sugerido por la IA» y llamar a `accept-ai` al revisar cada parte.
- **Textos BORRADOR.** Los mensajes nuevos del servidor y las listas de marcadores de contenido esperan la aprobación de Psicología.
