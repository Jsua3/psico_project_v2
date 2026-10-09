# Guía de revisión para Psicología — SIEP, caso SIM-VBG-001

**Para quién:** personas de Psicología que revisan el simulador sin necesidad de saber programar.
**Cuánto toma:** unos 15 minutos de recorrido y 10 de respuestas.
**Qué se pide:** jugar el caso una vez como estudiante, mirar la vista docente y contestar las preguntas del final. **No hace falta probar nada técnico.**

> **Antes de empezar.** El caso trata de violencia de género y contiene un testimonio de una sobreviviente. Puedes pausar cuando quieras: el botón **«Salida segura»** está en todas las pantallas del juego y la tecla **Esc** hace lo mismo. Tu caso queda en pausa y se reanuda donde estabas. Si algo te incomoda, pausa y avisa; es información útil para la revisión.

## Cómo entrar

- Dirección de la versión de prueba: te la comparte Ingeniería (el equipo también puede tenerla en local con `npm run up`).
- Cuentas de demostración: están en el [README](../../README.md#credenciales-demo). Para jugar usa la de **estudiante** (`/portal/jugar`); para el último paso, la de **profesora**.
- Se juega con el teclado (flechas para moverse, **E** para interactuar) o con toques en el móvil en horizontal.

## Recorrido de 15 minutos

Mientras juegas, fíjate en **tres cosas**: ¿sabes qué hacer en cada momento?, ¿algo te revela cuál es la respuesta «correcta» antes de decidir?, ¿algo del tono o de la forma resulta inadecuado para el tema?

| # | Qué hacer | Qué mirar |
|---|---|---|
| 1 | Entra como estudiante y empieza el caso. Lee el **aviso de contenido**, la introducción y el contexto | ¿El aviso es claro y suficiente? Prueba **«Salida segura»** en la introducción y reanuda |
| 2 | Ya en la sala de Urgencias, lee la tarjeta **«Qué hacer»** y la línea **«Ahora: …»** | ¿Se entiende qué se espera sin que nadie te lo explique? ¿Algún texto te da la respuesta? |
| 3 | Recoge el **kit** (acércate y pulsa **E**) | El aviso «Obtuviste: …» y la marca de paso hecho: ¿suena a logro o a información? |
| 4 | Habla con la **Familia en crisis** y con la **Enfermera de urgencias** | El tono de las líneas; si alguna adelanta la respuesta de la primera decisión |
| 5 | Intenta pasar a la **Sala de escucha familiar** antes de haber hablado con la familia | El motivo de la puerta se lee **antes** de pulsar: ¿está bien redactado? |
| 6 | Llega a la **primera decisión**. Elige **a propósito la opción que te parezca peor** | Lo que dice la supervisión, el aviso de que la respuesta no se aplicó y la opción de **reconsiderar** (ver pregunta 1) |
| 7 | Vuelve a decidir con la opción que prefieras y sigue con las demás decisiones (son seis) | Longitud y redacción de las opciones (¿alguna «delata» cuál es la adecuada?); la sacudida de cámara tras una opción riesgosa |
| 8 | Abre un diálogo con opciones y pulsa **«Volver al mapa»** y luego **«Salida segura»** | Que siempre haya una forma clara de salir sin perder el avance |
| 9 | Termina el caso y lee **el cierre del estudiante** | Puntaje, «¡Simulación completada!», «Obtuviste», «Reuniste»: ¿el copy corresponde al tema? (ver pregunta 6) |
| 10 | Entra como **profesora** y abre **Trazabilidad** (`/portal/docente/trazabilidad`) en el intento recién jugado | Que la línea de tiempo use nombres legibles y que la primera respuesta no aplicada aparezca como **«Primera respuesta no aplicada (reintento)»** |

## Preguntas para responder

Marca una casilla por pregunta y añade el comentario que quieras. «Por defecto» es lo que está aplicado hoy; si estás de acuerdo, basta con marcar la primera casilla.

### 1. Reintentos tras una primera respuesta no aplicada
Hoy, si la primera respuesta a una decisión no se aplica, el reintento **no cuenta como decisión** en el reporte ni en el final, pero se muestra aparte (recomendación y chip «Reconsideradas» para el estudiante; etiqueta propia para el docente). Existía además una sonda gratuita por escena.
- [ ] De acuerdo, déjalo así *(por defecto)*
- [ ] Debe contar como decisión
- [ ] Otra propuesta: ______________________

### 2. Longitud y redacción de las opciones
«Elegir la más larga» acierta en 4 de los 6 nodos y hay palabras que delatan la respuesta («solo», «como eje», «Lo anterior +»). Igualarlas es contenido clínico que debe redactar Psicología. Barajar el orden por intento es una mejora técnica independiente.
- [ ] Sin cambios por ahora *(por defecto)*
- [ ] Psicología reescribirá las opciones (indica quién y para cuándo): ______________________
- [ ] Además, que el orden se baraje en cada intento

### 3. Sacudida de cámara tras una opción riesgosa
Medida en ±3 px (riesgosa) y ±6 px con saltos de 10 px (conducta prohibida). Se recomienda limitarla a la conducta prohibida.
- [ ] Mantener *(por defecto)*
- [ ] Limitarla a la conducta prohibida
- [ ] Quitarla por completo

### 4. Nombrar las herramientas
La lista «Qué hacer» no nombra las herramientas, pero el anillo sobre el maletín y los verbos de la barra sí las señalan («Recoger Kit PAP»).
- [ ] Mantener: lista genérica y anillo activo *(por defecto)*
- [ ] Nombrar las herramientas también en la lista
- [ ] Quitar el anillo sobre el maletín

### 5. Líneas que adelantan la respuesta de la decisión 1
Hay líneas existentes (enfermera, médico, psicóloga orientadora, apoyo psicosocial, «Familia en crisis» y la narrativa del nodo 1) que podrían adelantar la respuesta. Además, «Usar la herramienta» aparece como paso visible en las decisiones 1, 4 y 6.
- [ ] No se tocan *(por defecto)*
- [ ] Reescribir estas líneas (indica cuáles): ______________________
- [ ] Dejar de mostrar «Usar la herramienta» como paso visible

### 6. Copy de puntaje y logro
Marcador permanente en la cabecera, «¡Simulación completada!», «Puntaje total», «Obtuviste», «Reuniste».
- [ ] Sin cambios *(por defecto)*
- [ ] Cambiar el tono (propuesta): ______________________
- [ ] Ocultar el puntaje al estudiante y dejarlo solo para el docente

### 7. Aviso de contenido por nodo
Solo el nodo 1 lleva aviso de contenido sensible. El consultorio (donde está el testimonio) y la recepción (expediente) no.
- [ ] Sin cambios *(por defecto)*
- [ ] Añadir aviso en el consultorio y/o la recepción (texto propuesto): ______________________

### 8. Pausar en el contexto y reanudar
Al reanudar desde el contexto vuelve a mostrarse la introducción animada con su música. Alguien que pausó por malestar la vería de nuevo.
- [ ] Mantener *(por defecto)*
- [ ] Reanudar directamente en el contexto, sin la introducción

### 9. «Salida segura» sobre la supervisión final
Desde la última supervisión, «Salida segura» lleva al **resultado con puntaje**. Revisa el texto.
- [ ] Mantener *(por defecto)*
- [ ] Cambiar el texto (propuesta): ______________________

### 10. Recursos de apoyo de la pantalla de pausa
Hoy se muestran los mismos recursos de la bitácora. La verificación externa de estos recursos (ETH-01) sigue pendiente.
- [ ] Los de la bitácora son suficientes *(por defecto)*
- [ ] Hay que cambiar o añadir recursos (indica cuáles y quién los verifica): ______________________

### Observaciones libres
- ¿Hubo algún momento en que no supiste qué hacer? ¿Dónde?
- ¿Algo te pareció inadecuado, brusco o demasiado explícito para el tema?
- ¿Falta algo que un estudiante necesitaría saber antes de jugar?

______________________

---

**Qué pasa con tus respuestas.** Ingeniería aplica solo lo que quede marcado; nada de contenido clínico se cambia sin que Psicología lo redacte o lo valide. Las preguntas de producto, dirección e ingeniería (cámara, despliegue, pruebas de CI, casos futuros) están en el [informe de la sesión](2026-10-04-informe-sesion-jugabilidad.md#6-preguntas-para-personas-valor-por-defecto-ya-aplicado); este documento solo reúne las que necesitan criterio clínico o de experiencia de quien juega.

**Qué no se pudo verificar sin personas:** lectura con lector de pantalla real, fluidez (FPS) en equipos reales y uso en un teléfono físico. Si tienes uno a mano, cualquier observación sobre eso también sirve.
