# Bloque E: Social Mapping, mapa guiado de la red de apoyo (requisitos formales)

> Línea de fuente: `docs/pendientes/propuestas/bloque-e-social-mapping.md` (2026-10-03, rama `feat/cierre-plan-maestro`), con `propuestas-c-e-f-resumen.md` y la base común (§6 límites, §8 reglas R1-R8). Estado: propuesta para decidir, nada implementado. Los IDs de pregunta originales son E-P1..E-P15 (en la propuesta, "P1".."P15") y E-I1..E-I8 (Ingeniería). "Origen" cita secciones de la propuesta E salvo que diga "BC" (base común).

## 1. Resumen y alcance

- **Qué es.** Un panel «Red social» abierto desde el HUD, con la sobreviviente al centro (ecomapa) y la lista de personas y servicios que el estudiante ya encontró, cada uno con su evidencia y su fuente. El estudiante etiqueta cada vínculo con uno de cuatro tipos (apoyo, presión o tensión, ruta institucional, sin información aún) y, tras decidir, puede compararlo con una lectura de referencia. Vista de dibujo solo como complemento de la lista.
- **Qué NO es.** No hay "afinidad", puntos, porcentajes, contadores ni insignias. No cambia puntaje, estrés ni métricas del caso. No es genograma, ni interrogatorio, ni diagnóstico, ni juego de recoger y conectar pistas (alternativa 2, descartada). La niña fallecida y la persona agresora no son piezas del mapa. No hay cambio de esquema de base de datos.
- **Competencia que entrena.** Valorar la red de apoyo y los factores de riesgo y protección; identificar presiones familiares que parecen apoyo; reconocer rutas institucionales antes de decidir; separar hechos de suposiciones (E1-E4, §2.2). Criterios de rúbrica sugeridos: `COMPRENSION_SITUACION` y `DECISION_RUTA` (o `VALORACION_RED` nuevo, decisión E-P8).
- **Entrega por fases (§8):** F1 lista de solo lectura, F2 marcas, F3 dibujo, F4 vista docente y comparación; F5 esquema opcional queda fuera de estos requisitos.
- **Alcance de contenido:** `SIM-VBG-001`, 6 vínculos (madre, hermanos, familia que pide perdonar, hospital, comisaría, justicia); textos y lectura de referencia son propuesta, sin validar por Psicología.

## 2. Ubicación respecto de la línea base

| ID de la línea base | Relación | Nota |
|---|---|---|
| RF-17 | reutiliza | El panel lee lo que el estudiante ya vivió en la simulación ramificada; no altera el flujo ni las ramas |
| RF-18 | independiente | No es una ayuda ni una pista de qué decidir; debe cuidar no revelar la opción adecuada (R3) |
| RF-19 | reutiliza | Las marcas viven en el estado del intento y sobreviven a pausar y reanudar |
| RF-20 | extiende | La pregunta guía del panel alimenta la bitácora; las marcas son reflexión estructurada, no texto libre |
| RF-21 | extiende | Añade el evento `SOCIAL_MAP_LINK_MARKED` al recorrido, sin entrar en la línea de tiempo (mismo mecanismo de eventos) |
| RF-22 | independiente | No puntúa; el docente puede citar el resumen como evidencia en un criterio, a mano |
| RF-23 | tensiona | La comparación con la lectura de referencia es retroalimentación; debe mostrarse tras decidir (ver RN-08) |
| RF-25 | extiende | Bloque nuevo en la traza docente con marcas, referencia y orden de cambios |
| RN-01 | tensiona | Valorar presión y riesgo en la red no es diagnosticar; el panel se declara hipótesis a confirmar con ella |
| RN-06 | reutiliza | Las marcas son por intento; un intento nuevo parte sin marcas |
| RN-08 | tensiona | La referencia solo se muestra tras decidir (C3) o al cerrar; no hay valoración pedagógica en el momento |
| RN-09 | reutiliza | Coherente: valoración formativa sin nota; el mapa no produce número |
| RNF-04 | extiende | Exige lista como interfaz principal y alternativa sin arrastre ni color (usa criterios WCAG 2.2; ver decisión 19 del contraste) |
| RNF-08 | tensiona | Escribir en `flags_json` sin bloqueo puede pisar marcas (pieza 0c) |
| CU-08 | reutiliza | El panel se usa durante la ejecución de la simulación |
| CU-11 | extiende | Pregunta de bitácora ligada al panel |
| CU-14 | extiende | La revisión docente añade la lectura de red del estudiante |

## 3. Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Origen |
|---|---|---|---|---|---|---|
| SIEP-RF-E-01 | Participación | Abrir el panel «Red social» | El estudiante debe poder abrir y cerrar desde el HUD un panel «Red social», con la sobreviviente como encabezado, el aviso "Lo que sabes hasta ahora. Es una hipótesis: se confirma con ella" y la pregunta de bitácora "¿Con quién puede contar ella, quién podría presionarla y qué te falta saber?". El panel no se abre con un diálogo abierto. | Estudiante | Alta | 3.4, 4.2, 4.3, 5.4; E-P1, E-P15 |
| SIEP-RF-E-02 | Participación | Listar vínculos hallados con su evidencia | El sistema debe listar solo los vínculos que el estudiante ya reveló al hallar evidencia (NPC escuchados, objetos inspeccionados, herramientas usadas), mostrando para cada uno su nombre por relación, una frase de evidencia y su fuente, agrupados en "Personas" y "Servicios y rutas". Al aparecer un vínculo nuevo debe avisar con una frase de estado. | Sistema / Estudiante | Alta | 3 (alt. 3), 4.1, 4.3, 6.1; E-P1, E-P6, E-P10 |
| SIEP-RF-E-03 | Participación | Etiquetar un vínculo | El estudiante debe poder fijar, cambiar o quitar para cada vínculo revelado uno de cuatro tipos: Apoyo, Presión o tensión, Ruta institucional, Sin información aún. El sistema debe permitir un solo tipo por vínculo (ASUNCION: opción por defecto de E-P7). | Estudiante | Alta | 3.2, 4.2; E-P2, E-P7 |
| SIEP-RF-E-04 | Persistencia | Guardar y devolver las marcas | El sistema debe validar en el servidor que el vínculo esté revelado y que el tipo sea uno de los cuatro, guardar la marca en el estado del intento sin texto libre y devolverla al reanudar un intento pausado. | Sistema | Alta | 6.1, 6.2; E-I1, E-I2 |
| SIEP-RF-E-05 | Trazabilidad | Registrar el cambio de marca | El sistema debe registrar en el intento el evento `SOCIAL_MAP_LINK_MARKED` cada vez que el estudiante fija, cambia o quita una marca, con el vínculo y el tipo (o "ninguno"), sin texto libre ni tiempos. | Sistema | Media | 5.1; E-I4 |
| SIEP-RF-E-06 | Participación | Ver el dibujo de la red | El estudiante debe poder alternar a una vista de dibujo, de solo lectura, con disposición fija, que muestre los mismos vínculos y tipos que la lista, con etiqueta de texto y patrón de línea distinto por tipo. | Estudiante | Baja | 4.2, 3.4, 7.1; F3 |
| SIEP-RF-E-07 | Retroalimentación | Comparar con la lectura de referencia | El estudiante debe poder, tras registrar la decisión C3 o al cerrar el intento (ASUNCION), comparar sus marcas con una lectura de referencia aceptable por vínculo, expresando las diferencias como "difiere" y nunca como error ni puntaje. | Estudiante | Media | 3.3, 5.2, 5.4; F4; E-P8, E-P11 |
| SIEP-RF-E-08 | Seguimiento docente | Revisar la lectura de red del estudiante | El docente debe poder ver en la traza de un intento un bloque "Red social de la sobreviviente" con, por vínculo, lo que marcó, la lectura de referencia, las fuentes consultadas, los cambios en orden y si la marca fue antes o después de C1 y C3. | Profesor | Media | 5.2; F4; E-P9, E-I6 |
| SIEP-RF-E-09 | Participación | Estado de la ruta (opcional) | Si Psicología lo aprueba, el sistema debe mostrar una ruta institucional como "conocida" o "activada" según las banderas del caso ya existentes, sin indicar qué opción faltó. | Sistema | Baja | 3.2, 8; E-P13 |

## 4. Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Origen |
|---|---|---|---|---|---|
| SIEP-RNF-E-01 | Accesibilidad | Lista y teclado completos | La lista debe ser la interfaz principal: operable solo con teclado, con foco contenido en el panel, orden de lectura igual al de tabulación, tipos como grupo de opciones nativo y salida con Esc o "Cerrar". | Alta | 4.4, 7.1 (1.3.1, 2.1.1, 2.4.3, 4.1.2) |
| SIEP-RNF-E-02 | Accesibilidad | Sin depender del color | El tipo de vínculo debe distinguirse por texto, ícono y patrón de línea; el texto debe tener contraste 4,5:1, los controles y líneas 3:1, y la lista debe leerse al 200 % y a 320 px. | Alta | 7.1 (1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11) |
| SIEP-RNF-E-03 | Accesibilidad | Sin tiempo, movimiento ni arrastre | El panel no debe tener temporizadores, animaciones, parpadeos ni disposición que se mueva sola, debe respetar el movimiento reducido y no debe exigir arrastre; los controles deben medir al menos 24×24 px (objetivo 44 px). | Alta | 4.4, 7.1 (2.2.1, 2.2.2, 2.3.1, 2.5.7, 2.5.8); dep. 0a si anima |
| SIEP-RNF-E-04 | Accesibilidad | Lectura por lector de pantalla | Cada vínculo debe leerse con nombre, evidencia, fuente y tipo seleccionado; los cambios deben anunciarse con una región de estado, una frase por interacción; el dibujo debe quedar oculto a lectores. | Media | 4.4, 7.1 (1.1.1, 4.1.3) |
| SIEP-RNF-E-05 | Integridad | Escritura sin pisar el estado | La escritura de una marca debe ser idempotente y ejecutarse bajo bloqueo de fila sobre el estado del caso, sin perder otras banderas ni marcas concurrentes. | Alta | 6.2, 8 (pieza 0c); E-I2, E-I3 |
| SIEP-RNF-E-06 | Mantenibilidad | Sin cambio de esquema | El mapa debe funcionar sin migraciones: catálogo y lectura de referencia en el servidor, marcas en una clave `socialMap` de `flags_json` con versión de formato. | Alta | 6.1, 6.3; BC 6.1; E-I1 |
| SIEP-RNF-E-07 | Privacidad | Datos mínimos y confidenciales | Las marcas deben ser identificadores sin texto libre; el evento no debe incluir tiempos, identificadores personales ni preferencias de accesibilidad; el docente debe ver alias; nada del mapa debe enviarse al asistente de IA. | Alta | 5.1, 7.2; BC 6.8 |
| SIEP-RNF-E-08 | Rendimiento | Sin degradar el juego | El panel no debe reducir el rendimiento del juego por debajo del presupuesto vigente (59 FPS en 1366×768) ni exceder el presupuesto de paquete inicial. | Baja | BC 6.10; 8 |

## 5. Reglas de negocio

| ID | Categoría | Regla | Prioridad | Origen |
|---|---|---|---|---|
| SIEP-RN-E-01 | Ética: sin cuantificar | El sistema no debe asignar afinidad, puntos, porcentajes, contadores de progreso ("3/6"), barras ni insignias a personas o vínculos, ni modificar `accumulatedScore`, `stressIndex`, `userTrust`, `victimRisk` ni `caseMetrics`. | Alta | 3.2, 5.3, 7.2; R1, R7 |
| SIEP-RN-E-02 | Ética: personas ausentes | La niña fallecida no debe aparecer en el mapa como nodo, ícono, etiqueta ni control (por defecto). | Alta | 4.1; E-P3 |
| SIEP-RN-E-03 | Ética: persona agresora | La persona agresora no debe aparecer como nodo ni "antagonista" del mapa (por defecto); el riesgo se trabaja con la herramienta de valoración y las decisiones. | Alta | 4.1; E-P4 |
| SIEP-RN-E-04 | Ética: representación | Los grupos ausentes deben rotularse "no aparece en escena", sin nombres, rostro ni retrato; las personas se nombran por su relación con la sobreviviente, sin remitir a la niña. | Alta | 4.1, 7.2; E-P5, E-P14 |
| SIEP-RN-E-05 | No revelar | Un vínculo solo debe revelarse por evidencia hallada, nunca por decidir; el estudiante no puede marcar un vínculo no revelado; el cliente no debe recibir vínculos no revelados ni la lectura de referencia antes de decidir, ni textos que indiquen la opción adecuada. | Alta | 3.4, 4.1, 6.1; R2, R3 |
| SIEP-RN-E-06 | Formativo | El mapa debe tratarse como hipótesis: cambiar una marca no es error; la lectura de referencia es una lectura aceptable, no la única; y no cuentan como evidencia abrir el panel, el tiempo, la cantidad de marcas ni no usarlo. | Alta | 2.1, 2.2, 5.2; E-P2 |
| SIEP-RN-E-07 | Seguridad | La pausa segura debe estar al alcance dentro del panel mediante un control visible, sin confirmación cronometrada; Esc cierra el panel y un segundo Esc ejecuta la pausa. | Alta | 7.2; BC 6.4; REGLA-004; dep. 0b |
| SIEP-RN-E-08 | Ética: no revictimizar | Ningún vínculo debe reconstruir hechos violentos ni listar "contradicciones" del relato; el panel no debe usar el testimonio de la sobreviviente como estímulo ni funcionar como guía de interrogatorio. | Alta | 2.1, 3 (alt. 2), 7.2; BC 6.6 |
| SIEP-RN-E-09 | Consentimiento y validación | El panel debe existir solo tras la puerta de consentimiento ETH-01, y los textos del panel y la lectura de referencia deben ser revisados por una persona experta antes de publicarse. | Alta | 7.2; BC 6.2; E-P2, E-P15 |

## 6. Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados |
|---|---|---|---|---|
| SIEP-CU-E-01 | Consultar la red social | Estudiante | Ver quién acompaña, quién podría presionar y qué rutas existen según lo hallado | SIEP-RF-E-01, E-02, E-06; RF-17 |
| SIEP-CU-E-02 | Etiquetar los vínculos | Estudiante | Dejar su lectura de la red como hipótesis, antes de decidir | SIEP-RF-E-03, E-04, E-05; RF-20 |
| SIEP-CU-E-03 | Comparar mi lectura con la referencia | Estudiante | Contrastar sus marcas con la lectura de referencia tras decidir | SIEP-RF-E-07; RF-23 |
| SIEP-CU-E-04 | Revisar la lectura de red de un estudiante | Profesor | Usar sus marcas y diferencias como material de conversación | SIEP-RF-E-08; RF-25 |
| SIEP-CU-E-05 | Pausar desde el panel | Estudiante | Salir de forma segura sin cerrar antes el panel | SIEP-RN-E-07; SIEP-CU-01 |

## 7. Criterios de aceptación

| ID | Criterio (Dado / Cuando / Entonces) | Cómo se prueba |
|---|---|---|
| SIEP-RF-E-01 | Dado un intento tras ETH-01 / Cuando pulsa "Red social" / Entonces se abre el panel con foco dentro, el aviso de hipótesis y la pregunta de bitácora. Dado un diálogo abierto / Cuando el estudiante intenta abrirlo / Entonces no se abre | e2e |
| SIEP-RF-E-02 | Dado un intento sin NPC escuchados / Cuando abre el panel / Entonces la lista está vacía o sin vínculos. Dado que escucha a `enfermera-urgencias` / Cuando cierra el diálogo / Entonces aparece "Hospital" con evidencia y fuente y se anuncia "Se añadió 1 vínculo" | Automática (servicio) + e2e |
| SIEP-RF-E-03 | Dado "Madre" revelada / Cuando elige "Apoyo" y luego "Sin información aún" / Entonces el vínculo conserva solo el último tipo; las cuatro opciones se alcanzan por teclado | e2e (teclado) |
| SIEP-RF-E-04 | Dado un tipo fuera de los cuatro o un vínculo no revelado / Cuando se envía la marca / Entonces el servidor la rechaza. Dado un intento pausado con marcas / Cuando se reanuda / Entonces las marcas se devuelven iguales | Automática (backend) |
| SIEP-RF-E-05 | Dado que marca `madre` como apoyo / Entonces existe un evento con `vinculo=madre; tipo=apoyo` y sin texto libre; si la quita, `tipo=ninguno` | Automática (backend) |
| SIEP-RF-E-06 | Dado el dibujo activo / Cuando se compara con la lista / Entonces contiene los mismos vínculos y tipos; cada tipo tiene etiqueta de texto y patrón; el lector de pantalla lo omite | Automática (Axe) + revisión de experto |
| SIEP-RF-E-07 | Dado que no ha decidido C3 / Cuando abre la comparación / Entonces no se muestra la referencia. Dado C3 registrado y `familia-perdon` marcada como apoyo / Entonces se muestra "difiere", sin puntaje ni la palabra "error" | Automática + revisión de experto |
| SIEP-RF-E-08 | Dado un intento con marcas / Cuando el docente abre la traza / Entonces ve, por vínculo, marca, referencia, fuentes, cambios en orden y momento respecto de C1 y C3, con alias y sin ranking | e2e (docente) |
| SIEP-RF-E-09 | Dado E-P13 aprobado y una ruta decidida / Entonces el estado cambia de "conocida" a "activada" sin mostrar qué opción faltó | Revisión de experto + automática |
| SIEP-RN-E-01 | Dado cualquier estado del panel / Cuando se marcan vínculos / Entonces `accumulatedScore`, `stressIndex`, `userTrust`, `victimRisk` y `caseMetrics` no cambian, y la interfaz no muestra números ni contadores por vínculo | Automática (backend) + revisión de experto |
| SIEP-RN-E-02 | Dado el catálogo de `SIM-VBG-001` / Cuando se lista la red en lista y dibujo / Entonces no existe ninguna entrada, nodo ni etiqueta para la niña | Automática (catálogo) |
| SIEP-RN-E-03 | Dado el catálogo y el dibujo / Entonces no hay nodo, tipo "antagonista" ni línea de violencia hacia la persona agresora | Automática + revisión de experto |
| SIEP-RN-E-04 | Dado "Familia que pide perdonar" / Entonces se rotula "no aparece en escena", sin nombres, rostro ni retrato, y ningún nombre remite a la niña | Revisión de experto |
| SIEP-RN-E-05 | Dado un vínculo no revelado / Cuando se inspecciona la respuesta del servidor / Entonces ni el vínculo ni la referencia viajan al cliente; la marca sobre él devuelve error | Automática (backend) |
| SIEP-RN-E-06 | Dado un cambio de marca / Entonces se registra como revisión, no como error; no existe campo que use tiempo en el panel ni cantidad de marcas como evidencia | Automática + revisión de experto |
| SIEP-RN-E-07 | Dado el panel abierto / Cuando el estudiante pulsa "Pausa segura" / Entonces el intento queda `PAUSED` sin confirmación cronometrada; Esc cierra y un segundo Esc pausa | e2e |
| SIEP-RN-E-08 | Dado el contenido de todos los vínculos / Entonces ninguno describe hechos violentos ni usa "contradicción" en el sentido de cuestionar el relato | Revisión de experto |
| SIEP-RN-E-09 | Dado un intento sin ETH-01 aceptado / Entonces el botón no existe; dado un texto sin firma de revisión experta / Entonces no se publica | e2e + revisión de experto |

## 8. Riesgos éticos y de privacidad

| Riesgo | Mitigación | Requisito que la implementa |
|---|---|---|
| Cuantificar o "calificar" a personas, incluidas familiares en duelo | Tipos cualitativos, sin afinidad ni contadores | SIEP-RN-E-01 |
| Convertir a la niña o a la persona agresora en pieza del juego | No aparecen por defecto; decisión explícita de Psicología | SIEP-RN-E-02, E-03 |
| Etiquetar a una persona real (la madre) y tomarlo como verdad o juicio sobre la familia | Encabezado "hipótesis a confirmar con ella", "sin información aún" siempre disponible, referencia como lectura aceptable | SIEP-RN-E-06, SIEP-RF-E-03 |
| Que el panel enseñe a contrainterrogar o sacar información a la sobreviviente | Sin "contradicciones", sin reconstrucción de hechos, el mapa es hoja de trabajo | SIEP-RN-E-08 |
| Revelar la decisión adecuada antes de elegir (la pista de presión llega en el mismo diálogo que C1) | Revelado solo por evidencia; referencia solo al servidor; comparación tras decidir | SIEP-RN-E-05, SIEP-RF-E-07 |
| No poder salir de forma segura con la superposición abierta | Botón de pausa visible dentro del panel, Esc en dos pasos | SIEP-RN-E-07 |
| Pérdida o pisado de marcas por escritura concurrente | Bloqueo de fila y marcas idempotentes | SIEP-RNF-E-05 |
| Filtración del mapa (quién conoce la situación de ella) o inferencias sobre el estudiante a partir de tiempos o preferencias | Marcas sin texto libre, alias docente, sin tiempos, nada al asistente de IA | SIEP-RNF-E-07 |
| Uso incorrecto del instrumento por el docente (nota o ranking) | Sin ranking ni porcentaje, "difiere" en lugar de "error", reporte de grupo solo agregado si Psicología lo pide | SIEP-RF-E-08, SIEP-RN-E-06 |

## 9. Dependencias y orden

**Fase 0 compartida** (se redacta una sola vez en el consolidador):

| Código | Uso en E |
|---|---|
| 0a | Solo si el panel anima algo (E no lo prevé); el panel de diálogo no es de E |
| 0b | Obligatoria: control visible de Pausa segura reutilizable (SIEP-RN-E-07) |
| 0c | Obligatoria para la fase 2: escritor con bloqueo para `flags_json` (SIEP-RNF-E-05); mientras no exista, `select_for_update` en el endpoint nuevo (E-I2) |
| 0d | No se usa: E no añade tipos a la línea de tiempo del docente; usa un bloque propio |
| 0e | Aplica como regla: E no añade atajos de una sola tecla (SIEP-RNF-E-01) |

**Otros bloques.** C: opcional, retratos de personas en escena con su mapa de retratos, nunca para ausentes; E puede condicionar líneas desbloqueadas de C. F: lee las pistas halladas (solo lectura), no las marcas; F no escribe en `socialMap`. Ninguno es prerrequisito de E.

**Orden.** F0 decisiones y contenido, Fase 0 (0b), F1 lista, F2 marcas (0c), F3 dibujo, F4 docente y comparación. Estimación de la propuesta: 12-21 días de Ingeniería más 2-4 de Psicología, sin la Fase 0.

**Decisiones del contraste que la condicionan:** 6 (retroalimentación pedagógica oculta hasta el cierre: fija cuándo se muestra la comparación); 10 (segunda oportunidad: el mapa no la altera); 17 (texto del aviso de alcance, RN-01); 19 (WCAG 2.1 AA o 2.2 AA: RNF-E-02 y E-03 usan criterios 2.2, p. ej. 2.5.7 y 2.5.8); 21 (alias o nombre en la vista docente); 3 (si el profesor autora, el catálogo en código deberá pasar a `metadata_json`/editor); 16 (Psicología redacta objetivos y personajes visibles antes de jugar).

## 10. Decisiones que bloquean

| ID original | Pregunta cerrada | Valor por defecto | Qué desbloquea | Quién decide |
|---|---|---|---|---|
| E-P1 (bloquea) | ¿Panel pasivo, inventario de pistas o mapa guiado, lista primero? | Mapa guiado, solo lectura primero (F1) | Todo el bloque | Equipo con Psicología |
| E-P2 (bloquea, no frena el arranque) | ¿Ecomapa con cuatro tipos (apoyo, presión o tensión, ruta institucional, sin información aún) o calidades clásicas u otras? | Los cuatro propuestos | Vocabulario de RF-E-03, textos y dibujo | Psicología |
| E-P3 (bloquea) | ¿Aparece la niña fallecida? | No aparece | RN-E-02, catálogo | Psicología |
| E-P4 (bloquea) | ¿Aparece la persona agresora? | No aparece como nodo | RN-E-03, catálogo | Psicología |
| E-P5 (bloquea, no frena el arranque) | ¿La familia que pide perdonar es de él, de ella o ambigua? | "Familia que pide perdonar", sin precisar; texto pendiente de reescritura | Nombre y textos del vínculo | Psicología |
| E-P6 | ¿Hermanos: "sin información aún" o pista nueva? | Sin información aún | Contenido de RF-E-02 | Psicología |
| E-P7 | ¿Una etiqueta por vínculo o dos? | Una, revisable tras piloto | RF-E-03 | Psicología |
| E-P8 | ¿Criterio de rúbrica existente o `VALORACION_RED` nuevo? | `COMPRENSION_SITUACION` y `DECISION_RUTA` | Vínculo con la rúbrica | Psicología |
| E-P9 | ¿Solo traza individual o también conteos agregados de grupo? | Solo traza individual | RF-E-08 (alcance) | Psicología |
| E-P10 | ¿Redactar pistas de personas dependientes, amistades, comunidad, salud mental? | No en esta fase (6 vínculos) | Ampliación de contenido | Psicología |
| E-P11 | ¿Adelantar la pista de presión a un NPC previo a C1? | No; el mapa sirve sobre todo para C3 | Si el mapa puede informar C1 | Psicología |
| E-P12 | ¿"Abuela de la niña" y "Madre de la sobreviviente" son la misma persona? | Sí | Fuente y nombre de `madre` | Psicología |
| E-P13 | ¿Estado de la ruta "conocida"/"activada"? | No | RF-E-09 | Psicología |
| E-P14 | ¿Cómo se nombra a la persona atendida? | "La sobreviviente" | Textos del panel | Psicología |
| E-P15 | ¿Es adecuado el encabezado de hipótesis? | Sí | RF-E-01 | Psicología |
| E-I1 | ¿Catálogo en el servidor o configuración del frontend (prototipo)? | Servidor | SIEP-RNF-E-06, RN-E-05 | Ingeniería |
| E-I2 | ¿`select_for_update` en el endpoint hasta que exista el escritor único? | Sí | SIEP-RNF-E-05 | Ingeniería |
| E-I6 | ¿El bloque docente se hace en E o es tarea común? | En E | SIEP-RF-E-08 | Ingeniería y equipo |

## 11. Preguntas cerradas para Psicología

1. ¿Un ecomapa centrado en la sobreviviente, con tipos cualitativos, es el instrumento adecuado? Responda sí o no (E-P2).
2. ¿Los cuatro tipos son (A) apoyo / presión o tensión / ruta institucional / sin información aún, (B) fuerte / tenue / estresante, o (C) otro vocabulario en uso en clase? (E-P2; evitar "tensión" porque en el bloque F es "tensión verbal").
3. ¿La niña fallecida puede aparecer en el mapa de alguna forma? A) no; B) nota textual de duelo sin control; C) símbolo convencional (E-P3).
4. ¿La persona agresora puede aparecer? A) no; B) línea de texto "fuente de riesgo" no interactiva; C) nodo con línea de violencia (E-P4).
5. En "Su familia me busca para que lo perdone", ¿la familia es A) de él, B) de ella, C) de ambos o ambigua? (E-P5).
6. ¿Aparecen los hermanos como "sin información aún" (A) o se redacta una pista sobre cómo la apoyan (B)? (E-P6).
7. ¿Un vínculo puede llevar una sola etiqueta (A) o dos, por ejemplo apoyo y tensión (B)? (E-P7).
8. ¿Se usan criterios de rúbrica existentes (A) o uno nuevo `VALORACION_RED` (B)? (E-P8).
9. ¿El docente ve solo la traza individual (A) o también conteos agregados anónimos (B)? (E-P9).
10. ¿Se redactan pistas nuevas (personas dependientes, comunidad, salud mental) en esta fase? sí o no (E-P10).
11. ¿Se adelanta la pista de presión a un NPC previo a C1 para que el mapa pueda informar esa decisión? sí o no (E-P11).
12. ¿La "Abuela de la niña" y la "Madre de la sobreviviente" son la misma persona? sí o no (E-P12).
13. ¿Mostrar el estado de la ruta tras decidir ("conocida" a "activada"), aun si deja ver por omisión qué faltó? sí o no (E-P13).
14. ¿Se llama a la persona A) la sobreviviente, B) la consultante, C) la paciente? (E-P14).
15. ¿Es adecuado el encabezado "Lo que sabes hasta ahora. Es una hipótesis: se confirma con ella"? sí o no (E-P15).
