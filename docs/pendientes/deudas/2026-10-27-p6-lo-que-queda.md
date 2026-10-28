# P6: lo que queda

Lo que quedó sin hacer o sin decidir al cerrar P6 (el editor nuevo, la biblioteca de lugares, el asistente de IA y el modelo nuevo de métricas, ya en el programa). La guía del editor está en [`operacion/editor-de-casos.md`](../../operacion/editor-de-casos.md).

## Pruebas que hay que hacer con personas o con la clave real

- **Prueba manual del asistente con una key real**, una por operación (propuesta de escena, de línea, de respuesta, de final, de sala, la guía…), antes de encender `AI_AUTHORING_ENABLED`. Las pruebas de extremo a extremo simulan al proveedor (solo `assistant/status` y `assistant/propose`); no prueban la llamada real. La clave va en el `.env` del servidor, nunca en el chat ni en el repositorio. El resto de pendientes del asistente está en [`2026-10-26-asistente-autoria-pendientes.md`](2026-10-26-asistente-autoria-pendientes.md).
- **Pase visual en navegador.** Nadie ha mirado esto a ojo: la animación de cercanía de los objetos; los personajes que caminan (40 px/s, el chevrón y el nombre de la persona clave, y que los personajes están 16 px por debajo de lo dibujado en P4); y la barra del editor a 1280 px y en móvil (por debajo de 64 rem la ayuda baja a una segunda fila: es un respaldo sin ver).
- **Un docente que nunca vio el editor**: que cree un caso con tres escenas y un camino que se separa, sin ayuda. Es el criterio de éxito del diseño y no se ha probado con personas.

## Decisiones del usuario

- **Deshacer fuera de la sala.** Hoy solo se puede deshacer en la sala y con «Deshacer lo aplicado» del asistente (un paso). ¿Se quiere deshacer también en el guion, el mapa y los finales?
- **Tipografía del editor:** Atkinson Hyperlegible Next frente a la del programa.
- **Marca en la barra del editor:** logo «SIEP» (el de la barra del portal) o «MetaFrónesis» (pide medir un techo nuevo de ancho para el logotipo).
- **Las secciones del caso en una banda bajo la barra** (El caso, Finales, Probar como estudiante, Enviar a revisión): es el cambio visible más grande sobre los tableros; falta confirmarlo.
- **Si el panel del asistente congela la barra** (DG-9 dice «una ayuda abierta»; hoy solo la congelan el buscador y la guía).
- **Las decisiones DG pendientes** del documento de estados de la barra (`ref-estados-barra-decisiones`: DG-3, 4, 5, 6, 12, 13, 15 y 16), y DG-11 (el ajuste propio de movimiento reducido no existe fuera del juego).

## Con Psicología

- Los **nombres de los cuatro finales** (`critica`, `protectora`, `riesgo_persistente`, `con_brechas`) y los **textos de los hitos** (hoy marcados «[por validar con Psicología]»).
- **«Persona a atender»** (el texto con el que el juego nombra a la persona clave), la **pregunta privada M9** del cierre y las **dos expresiones nuevas** del kit de personajes (`cautelosa` y `en-crisis`).

## Lo que el retiro del editor anterior dejó sin pantalla

El editor anterior tenía ocho pestañas; el nuevo cubre salas, escenas, guion, finales, prueba, lista de verificación, envío, la decisión, **los datos del caso** (contexto y objetivos), **cómo se mueve cada persona** y **la persona a atender**. Estas cosas **no tienen pantalla** y hay que decidir si vuelven:

- **Las ayudas de cada escena** (`case-hints`, las pistas del juego): el componente sigue en `features/simulator/` **sin montar**, con sus pruebas. Decide el usuario si vuelven al editor nuevo; mientras tanto no se pueden escribir ni cambiar.
- **Qué personajes salen en la ficha antes de empezar** (`showInBrief`) y crear, editar o borrar personajes del caso: lo hacía la ficha anterior (`case-brief-editor`, ya borrado); el editor nuevo da de alta al personaje al ponerlo en una sala, pero no tiene dónde elegir si sale en la ficha.
- **Renombrar el caso:** el nombre se elige al crear y el servidor no tiene una ruta para cambiarlo (haría falta una en el servidor).
- **La IA no propone cómo se mueve una persona** ni a quién atender: haría falta una operación nueva en el asistente del servidor. Hoy el movimiento y la persona a atender se eligen a mano en la sala.
- **Un recurso de apoyo por escena** entró en este cierre (campo «Recursos de apoyo para el estudiante» del guion), porque sin él la casilla «protocolos de seguridad» no se podía respaldar y ningún caso nuevo se podía enviar; el texto de los recursos reales lo entrega y verifica Psicología.
- **Las rúbricas del caso** se leen del caso, pero asignarlas sigue siendo de `portal/rubricas`.

## Otros

- **Quitar de una sala a la persona de la que cuelga el guion** hace que el servidor se lleve el guion con ella; el editor lo vuelve a escribir con otra persona de la sala si queda alguna. Si la sala se queda sin personas, el editor pregunta antes de quitar a la última solo si quedarían respuestas que ningún objeto del mapa ofrece, y «Enviar a revisión» lista como falta cada escena con respuestas que su sala no tiene cómo ofrecer (ni una persona ni un objeto que las ofrezca; con «Llévame ahí» a la sala); una escena con solo líneas sale como sugerencia.
- **El sandbox aprobado** (aplicación Angular propia, servidor Node de IA local y sus pruebas) se recupera de la rama `claude/editor-casos-p3` (commit `b13222a5`); ver [`2026-10-27-sandbox-editor-retirado.md`](2026-10-27-sandbox-editor-retirado.md).
- **Pasar este documento y `operacion/editor-de-casos.md` a los documentos consolidados** (`docs/SIEP.md` y `docs/PENDIENTES.md`) cuando lleguen a la rama: la consolidación está sin commitear en el checkout principal y no existe todavía aquí.
