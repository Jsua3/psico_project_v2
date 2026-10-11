# Bloque F: Tensión verbal, entrevistas breves por turnos (requisitos formales)

> Línea de fuente: `docs/pendientes/propuestas/bloque-f-verbal-tension-box.md` (2026-10-03), con `propuestas-c-e-f-resumen.md` y `propuestas-c-e-f-base-comun.md`. Estado: propuesta para decidir; nada implementado. Redactado sobre la alternativa recomendada (Alternativa 2, entrevista por turnos); si el equipo elige otra (F-P1), este documento no aplica.

## 1. Resumen y alcance

Antes de la decisión de una escena con una persona afectada (M1 abuela en urgencias como piloto, M9 sobreviviente en comisaría), el estudiante conduce una entrevista de 2 a 4 intercambios: la persona habla, el estudiante elige entre cuatro maneras de responder, ve la reacción y un indicador de cuatro niveles con texto («tensión de la conversación»). Si la persona se retrae, hay una vía de reparación.

- **Que NO es:** no es un medidor de la persona ni del estudiante; no es un minijuego de reflejos ni de combate; no puntúa ni mueve estrés, confianza o riesgo; no cronometra; no dramatiza la noticia de la muerte de la niña; no modela tensión de personas ausentes ni de colegas.
- **Competencia que entrena:** sostener y desescalar una conversación con una persona en crisis o en duelo, sin añadir carga evitable ni sobreprometer, y reparar cuando la persona se retrae (criterios existentes `CONTENCION` y `COMUNICACION_EMPATIA`).
- **Evidencia:** la secuencia de tipos de respuesta y la trayectoria de tensión por entrevista, no el valor final ni la rapidez.
- **Límites del documento:** sin cambio de esquema en la primera versión (registro en código del backend, estado en `flags_json`); contenido de los intercambios por redactar y validar por Psicología.

## 2. Ubicación respecto de la línea base

| ID de la línea base | Relación | Nota |
|---|---|---|
| RF-17 (simulación ramificada) | extiende | Añade un paso por turnos dentro de la escena, antes de la decisión que ya existe. |
| RF-09 (configurar ramificaciones) | tensiona | Hoy una opción lleva a otra escena; aquí varios intercambios ocurren dentro de una escena y ninguno cambia de escena. |
| RN-02 (cada opción lleva a otra escena o conclusión) | tensiona | Un intercambio es un «turno» que no salta de nodo; la decisión de la escena conserva su salto. Pide aclarar RN-02 (el contraste ya lo señala). |
| RN-08 (consecuencia en el momento; pedagogía al final) | tensiona | La reacción y el nivel son consecuencia inmediata (cumple RN-08); la técnica solo se nombra al final de la entrevista, no tras cada respuesta. |
| RN-11 (opciones necesarias por decisión) | reutiliza | Cuatro respuestas por turno es una cantidad elegida, no una restricción. |
| RF-08 (gestionar decisiones y opciones) | independiente | La autoría de turnos en el editor queda fuera de la primera versión (registro en código). |
| RF-21 (registrar recorrido del intento) | extiende | Eventos nuevos `VERBAL_TENSION_*` en la bitácora del intento. |
| RF-25 (revisar desempeño) | extiende | Bloque «Conversaciones» en la traza docente. |
| RF-20 (bitácora reflexiva) | reutiliza | La pregunta de cierre de la entrevista alimenta la reflexión. |
| RF-23 (retroalimentación al finalizar) | independiente | La «mirada de supervisión» es formativa y propia de la entrevista; no sustituye la retroalimentación del intento. |
| RN-01 (no diagnóstico) | reutiliza | El indicador es andamiaje de aprendizaje, no instrumento clínico. |
| RNF-04 (accesibilidad básica) | extiende | Exige meter accesible, teclado, sin color solo y sin movimiento obligatorio. |
| RN-09 (valoración formativa) | reutiliza | F no puntúa; la evidencia la cita el docente en la rúbrica manual. |

## 3. Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Origen |
|---|---|---|---|---|---|---|
| SIEP-RF-F-01 | Participación | Conducir entrevista por turnos | El estudiante debe poder mantener, antes de la decisión de la escena, una entrevista de 2 a 4 intercambios con la persona afectada presente. | Estudiante | Alta | 3.4, 4.2; F-P1 |
| SIEP-RF-F-02 | Participación | Elegir entre cuatro respuestas | El sistema debe ofrecer en cada intercambio cuatro respuestas plausibles y profesionales, de longitud parecida, sin etiquetas de técnica y con el orden decidido por el servidor en cada intento. | Sistema | Alta | 3.4 (riesgos pedagógicos b), 6.2; I5 |
| SIEP-RF-F-03 | Participación | Mostrar la reacción de la persona | El sistema debe mostrar, tras cada respuesta elegida, la reacción de la persona en texto antes de presentar el intercambio siguiente. | Sistema | Alta | 4.2, 5.3 |
| SIEP-RF-F-04 | Participación | Indicador de tensión de la conversación | El sistema debe mostrar para la persona presente el nivel de tensión de la conversación en cuatro niveles con texto («serena», «con carga», «tensa», «la persona se retrae») y sin porcentaje. | Sistema | Alta | 2.1, 4.1; F-P4 |
| SIEP-RF-F-05 | Participación | Ocultar el indicador | El estudiante debe poder ocultar el indicador de tensión sin perder la reacción en texto ni cambiar la entrevista (preferencia local, no registrada). | Estudiante | Media | 3.4 (riesgos c), 7.3; F-P14 |
| SIEP-RF-F-06 | Participación | Retraimiento y reparación | El sistema debe hacer que la persona se retraiga cuando la tensión supere el umbral (ASUNCIÓN: 90 de 100, valor por validar) y ofrecer respuestas de reparación; si el estudiante repara, la conversación continúa desde el nivel al que bajó; tras dos intentos sin reparar, la persona da la conversación por terminada por ahora sin bloquear la decisión. | Estudiante / Sistema | Alta | 2.3; F-P8 |
| SIEP-RF-F-07 | Persistencia | Retomar la entrevista | El estudiante debe poder cerrar el panel o usar la pausa segura y retomar la entrevista en el mismo intercambio y con el mismo nivel de tensión. | Estudiante | Alta | 3.7 (pausa segura, cerrar panel), 7.3 |
| SIEP-RF-F-08 | Retroalimentación | Mirada de supervisión | El sistema debe mostrar, al terminar la entrevista, una mirada de supervisión breve que nombre las técnicas usadas y por qué pesaron como pesaron, y una pregunta de bitácora. | Estudiante / Sistema | Media | 2.4 paso 5, 5.3; F-P10 |
| SIEP-RF-F-09 | Seguimiento docente | Revisar conversaciones | El docente debe poder ver, por persona, el nivel inicial, cada intercambio con su tipo de técnica, el nivel resultante y el cierre o la reparación, en forma de lista y sin intervalos de tiempo. | Docente | Media | 5.2, 5.5 |

## 4. Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Origen |
|---|---|---|---|---|---|
| SIEP-RNF-F-01 | Accesibilidad | Sin límites de tiempo | El sistema no debe imponer límites de tiempo, cuenta atrás ni espera obligatoria en ninguna parte de la entrevista; «guardar silencio» debe ser una opción elegible, no una espera. | Alta | 7.1 (2.2.1), 3.2 D2; F-P3 |
| SIEP-RNF-F-02 | Accesibilidad | Teclado y lector de pantalla | La entrevista debe poder completarse solo con teclado y con lector de pantalla: el indicador expone nombre, valor 1 a 4 y texto equivalente, y cada cambio de nivel se anuncia una sola vez en la región viva existente. | Alta | 4.4, 7.1 (4.1.2, 4.1.3) |
| SIEP-RNF-F-03 | Accesibilidad | Sin depender de color ni de movimiento | El nivel de tensión debe ser perceptible sin color y, con movimiento reducido o sin el, el indicador debe cambiar al instante, sin parpadeo ni destellos, y el cierre mostrarse de forma estática. | Alta | 4.4, 7.1 (1.4.1, 2.2.2, 2.3.1); depende de 0a |
| SIEP-RNF-F-04 | Integridad | Servidor autoritativo e idempotente | El servidor debe calcular y guardar la tensión y el orden de respuestas; el cliente solo envía la respuesta elegida, y repetir el mismo intercambio del mismo intento no debe duplicar efectos. | Alta | 6.2; I2; depende de 0c |
| SIEP-RNF-F-05 | Trazabilidad | Eventos legibles en la bitácora | El sistema debe registrar los eventos `VERBAL_TENSION_EXCHANGE_ANSWERED`, `_COMMUNICATION_CLOSED`, `_REPAIRED` e `_INTERVIEW_COMPLETED`; los tres últimos con `detail` como frase legible en español para la línea de tiempo docente. | Media | 5.1; depende de 0d |
| SIEP-RNF-F-06 | Privacidad | Sin latencias ni preferencias de accesibilidad | El sistema no debe registrar tiempos de reacción, intervalos entre intercambios ni preferencias de accesibilidad, ni enviar datos de esta mecánica a un asistente de IA externo. | Alta | 5.2, 7.3 (privacidad); base común 6.8 |

## 5. Reglas de negocio

| ID | Categoría | Regla | Prioridad | Origen |
|---|---|---|---|---|
| SIEP-RN-F-01 | Evaluación | La tensión verbal es formativa: por defecto no debe modificar puntaje, estrés, confianza, riesgo ni métricas del caso, ni cambiar el final. | Alta | 5.4 (opción 0); F-P7 |
| SIEP-RN-F-02 | Ética | Ninguna parte de la entrevista debe depender de reloj, rapidez o reflejos, y el testimonio de la sobreviviente nunca debe presentarse como estímulo cronometrado. | Alta | 3.2 D1 y D2, 7.3 (no revictimizar); F-P2, F-P3 |
| SIEP-RN-F-03 | Seguridad | La entrevista debe mostrar de forma visible el control de pausa segura en todo momento; pausar congela el estado y no cuenta como abandonar a la persona. | Alta | 7.3 (ETH-02, REGLA-004); depende de 0b |
| SIEP-RN-F-04 | Ética | No debe modelarse ni mostrarse tensión para personas ausentes (la niña, el agresor, la sobreviviente en quirófano) ni para colegas. | Alta | 3.7, 7.3 |
| SIEP-RN-F-05 | Pedagogía | Ningún dato enviado al cliente antes de elegir (etiquetas, deltas, orden) debe delatar la mejor respuesta; el delta y la técnica viven solo en el servidor. | Alta | 3.4, 6.1; I5 |
| SIEP-RN-F-06 | Ética | El cierre debe presentarse como «la persona se retrae», sin lenguaje de derrota, culpa de la persona, puntos ni «game over»; no hay bloqueo de la decisión. | Alta | 2.3, 7.3 (no convertir el sufrimiento en juego); F-P8 |
| SIEP-RN-F-07 | Alcance | El indicador no debe presentarse como medición del estado emocional de la persona ni del estudiante, ni como instrumento diagnóstico; se rotula «tensión de la conversación». | Alta | 2.1, 3.4 (riesgos éticos), 7.3 (andamiaje); RN-01 |
| SIEP-RN-F-08 | Retroalimentación | La técnica de cada respuesta no debe nombrarse tras cada intercambio; solo la reacción y el nivel. La devolución técnica llega al terminar la entrevista, y solo se contabiliza como evidencia la trayectoria, no el valor final, la rapidez ni el uso de ayudas de accesibilidad. | Media | 2.5, 5.3; F-P10; RN-08 |
| SIEP-RN-F-09 | Contenido | Ninguna entrevista debe publicarse sin redacción de Psicología y revisión de una persona experta; la noticia de la muerte de la niña debe elidirse («[El equipo comunica la noticia]») salvo decisión expresa. | Alta | 7.3, 4.3 (M5); F-P5, F-P9 |

## 6. Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados |
|---|---|---|---|---|
| SIEP-CU-F-01 | Conducir una entrevista breve | Estudiante | Responder por turnos a la persona afectada, ver su reacción y el nivel de tensión, y recibir la mirada de supervisión. | SIEP-RF-F-01, F-02, F-03, F-04, F-05, F-08; RF-17 |
| SIEP-CU-F-02 | Reparar tras el retraimiento | Estudiante | Reconocer que la persona se retrajo, elegir una respuesta de reparación y retomar la conversación o terminarla sin bloqueo. | SIEP-RF-F-06, F-03; RF-17 |
| SIEP-CU-F-03 | Pausar y retomar la entrevista | Estudiante | Salir con seguridad o cerrar el panel y continuar en el mismo punto. | SIEP-RF-F-07; SIEP-RF-01 |
| SIEP-CU-F-04 | Revisar las conversaciones del estudiante | Docente | Ver la trayectoria de cada entrevista como evidencia para la rúbrica. | SIEP-RF-F-09; RF-25, RF-22 |

## 7. Criterios de aceptación

Prueba: **A** = automática (backend o unitaria), **E** = e2e, **R** = revisión de experto.

**SIEP-RF-F-01**
- Dado un intento en M1 con la persona presente, cuando el estudiante abre el diálogo, entonces se inicia una entrevista de 2 a 4 intercambios antes de la decisión de la escena. (E)
- Dado que la entrevista termina, cuando el estudiante continúa, entonces la decisión de la escena se presenta sin cambios en sus opciones ni en su salto. (A, E)

**SIEP-RF-F-02**
- Dado un intercambio, cuando se envía la respuesta del servidor al cliente, entonces contiene exactamente cuatro respuestas sin campo de técnica ni delta. (A)
- Dado el mismo intercambio en dos intentos distintos, cuando se compara el orden, entonces el servidor puede variarlo y siempre lo decide el servidor. (A)
- Dado el texto de las cuatro respuestas, cuando un experto las lee, entonces todas son plausibles y de longitud parecida. (R)

**SIEP-RF-F-03**
- Dado que el estudiante elige una respuesta, cuando el servidor responde, entonces la reacción de la persona aparece en texto antes del intercambio siguiente. (E)

**SIEP-RF-F-04**
- Dado un nivel cualquiera, cuando se muestra el indicador, entonces incluye el texto del nivel y ningún porcentaje. (E)
- Dado que la tensión baja o sube de nivel, cuando cambia, entonces el rótulo refleja el nuevo nivel. (A, E)

**SIEP-RF-F-05**
- Dado que el estudiante oculta el indicador, cuando continúa la entrevista, entonces la reacción en texto sigue visible y no se registra ningún evento por ocultarlo. (E, A)

**SIEP-RF-F-06**
- Dado que el nivel alcanza el umbral, cuando se presenta el siguiente turno, entonces las respuestas son de reparación y el retrato y las líneas son breves. (E)
- Dado un retraimiento y una respuesta que repara, cuando se aplica, entonces la conversación continúa desde el nivel resultante, no desde cero. (A)
- Dado un retraimiento y dos respuestas que no reparan, cuando se aplica la segunda, entonces la persona termina la conversación y la decisión de la escena sigue disponible. (A, E)

**SIEP-RF-F-07**
- Dado una entrevista en el intercambio 2, cuando el estudiante pulsa Esc o pausa y luego reanuda, entonces vuelve al intercambio 2 con el mismo nivel. (E)

**SIEP-RF-F-08**
- Dado que la entrevista termina, cuando se muestra la mirada de supervisión, entonces nombra las técnicas usadas y trae una pregunta de bitácora. (E, R)
- Dado que la devolución llega, cuando se mide el orden, entonces aparece después de la última respuesta y después de la decisión de la escena si esta ocurre antes. (E)

**SIEP-RF-F-09**
- Dado un intento con una entrevista completada, cuando el docente abre la traza, entonces ve la lista de intercambios con técnica y nivel, y ningún intervalo de tiempo entre ellos. (E, A)

**SIEP-RN-F-01**
- Dado cualquier secuencia de respuestas de una entrevista, cuando el intento termina, entonces `accumulatedScore`, `stressIndex`, `userTrust`, `victimRisk` y `caseMetrics` no difieren de los de un intento sin entrevista. (A)

**SIEP-RN-F-02**
- Dado el panel de entrevista abierto, cuando pasa tiempo sin acción, entonces nada cambia ni se cierra por inactividad. (E)
- Dado el código de la entrevista, cuando se revisa, entonces no contiene temporizadores que alteren el estado. (R)

**SIEP-RN-F-03**
- Dado cualquier intercambio, cuando se enfoca la pantalla, entonces el botón de pausa segura es visible y alcanzable por teclado en una sola pulsación. (E)
- Dado que se pausa y se reanuda, cuando vuelve la entrevista, entonces el nivel es el mismo. (E, A)

**SIEP-RN-F-04**
- Dado una conversación con una colega o con un personaje ausente, cuando se abre, entonces no aparece indicador ni evento de tensión. (A, E)

**SIEP-RN-F-05**
- Dado el payload previo a la elección, cuando se inspecciona, entonces no hay claves que distingan la mejor respuesta. (A)

**SIEP-RN-F-06**
- Dado un retraimiento, cuando se muestran textos, entonces no aparecen las palabras «perdiste», «fallaste», «game over» ni puntos. (A, R)

**SIEP-RN-F-07**
- Dado el rótulo del indicador y la documentación de usuario, cuando se leen, entonces dicen «tensión de la conversación» y no «estado de la paciente». (R)

**SIEP-RN-F-08**
- Dado que el estudiante responde, cuando se muestra la reacción, entonces no incluye el nombre de la técnica usada. (E)
- Dado el valor final alto con buena técnica, cuando el docente lo ve, entonces la lista permite distinguir peso del tema de carga por forma. (R)

**SIEP-RN-F-09**
- Dado una entrevista sin revisión registrada, cuando se intenta habilitar en un caso publicado, entonces no se habilita. (R, A)
- Dado M5, cuando se escribe, entonces la noticia aparece elidida. (R)

## 8. Riesgos éticos y de privacidad

| Riesgo | Mitigación | Requisito que la implementa |
|---|---|---|
| Objetivar a la sobreviviente con un indicador | Rótulo «tensión de la conversación», cuatro niveles con texto, sin porcentaje, ocultable | SIEP-RF-F-04, F-05; SIEP-RN-F-07 |
| Revictimizar con tiempo o reflejos | Sin reloj, sin cuenta atrás, silencio como opción | SIEP-RNF-F-01; SIEP-RN-F-02 |
| Que el cierre se lea como culpa de la persona o derrota | Vocabulario «la persona se retrae»; reparación; sin bloqueo | SIEP-RF-F-06; SIEP-RN-F-06 |
| Persecución del número (Goodhart) | No puntúa, sin deltas visibles, el docente valora trayectoria | SIEP-RN-F-01, F-08; SIEP-RF-F-09 |
| Respuesta obvia o etiquetada | Reglas de autoría y orden de servidor; datos solo en servidor | SIEP-RF-F-02; SIEP-RN-F-05 |
| Dramatizar la muerte de la niña o modelar ausentes | Noticia elidida, sin tensión para ausentes | SIEP-RN-F-04, F-09 |
| Inferir velocidad de reacción o condición de salud | No registrar latencias ni preferencias de accesibilidad | SIEP-RNF-F-06; SIEP-RF-F-09 |
| Malestar del estudiante ante el testimonio ampliado | Pausa segura visible y estado conservado; revisar aviso ETH-01 | SIEP-RN-F-03; SIEP-RF-F-07 |
| Falsa sensación de dominio con una persona determinista | La mirada de supervisión lo explicita | SIEP-RF-F-08 |
| Datos de la mecánica enviados a IA externa | Prohibido | SIEP-RNF-F-06 |

## 9. Dependencias y orden

- **Fase 0 compartida (se redacta una sola vez en el consolidador):** 0a (panel respeta movimiento reducido; condiciona SIEP-RNF-F-03); 0b (Pausa segura reutilizable; condiciona SIEP-RN-F-03 y SIEP-RF-F-07); 0c (escritor con bloqueo para `flags_json`; condiciona SIEP-RNF-F-04); 0d (tipos de evento en la línea de tiempo; condiciona SIEP-RNF-F-05 y SIEP-RF-F-09); 0e (regla de atajos de una tecla; F usa 1-4 existentes y no añade atajos).
- **Otros bloques (blandas):** C, para emoción canónica y retratos, incluido el retrato «cerrada» (`closed`), sin arte hoy: cae a `neutral`; si F se aprueba, M1 es de F y C solo presenta. E, para pistas que habilitan respuestas de desescalada, solo lectura. Plan de julio (tensión del NPC): si se construye, F lee su `tension` como residuo; si no, valor autorado.
- **Orden sugerido:** F0 (decisiones y contenido de M1) -> F1 (esqueleto con H1 y C1) -> F2 (entrevista piloto M1) -> F3 (cierre y docente) -> F4 (M9, y M8/M5 si se validan). Estimado de ingeniería 20-31 días sin Fase 0, y 11-17 de Psicología.
- **Decisiones del contraste que la condicionan:** decisión 6 (ocultar retroalimentación pedagógica hasta el cierre; F la respeta: solo consecuencia narrativa durante el turno); decisión 10 (segunda oportunidad como excepción explícita a RN-08; la reparación es de la misma familia); decisión 17 (texto del aviso ETH-01, si se amplía el testimonio); decisión 19 (WCAG 2.1 AA o 2.2 AA; la propuesta cita criterios 2.2); decisión 21 (alias o nombre en la vista docente); decisión 14 (tiempo reportado; F no lo usa). La decisión 3 no la condiciona (F usa registro en código, no editor).

## 10. Decisiones que bloquean

| ID original | Pregunta cerrada | Valor por defecto | Qué desbloquea | Quien decide |
|---|---|---|---|---|
| F-P1 | Medidor pasivo (a), entrevista por turnos (b) o tiempo real (c)? | b, con F1 como primer escalón | Todo el bloque; M1 | Psicología y equipo |
| F-P2 | Tono: reencuadre clínico sobrio (a), híbrido visual (b) o subversión completa (c)? | a | Vocabulario y arte | Psicología y equipo |
| F-P3 | Solo por turnos sin tiempo (a) o con modo cronometrado opcional (b)? | a | SIEP-RNF-F-01, SIEP-RN-F-02 | Psicología y equipo |
| F-P4 | Se acepta la definición de «carga de la conversación» y los cuatro niveles sin porcentaje? | Sí | SIEP-RF-F-04 | Psicología |
| F-P5 | Quien escribe y valida los intercambios, y cuáles entran primero? | Psicología escribe M1 y M9; revisión experta | Contenido (F0) | Psicología |
| F-P7 | Consecuencia del cierre: solo narrativa (a), una línea menos (b) o mueve crisis o estrés (c)? | a | SIEP-RN-F-01 | Psicología |
| F-P8 | Reparación: dos intentos y termina sin bloqueo (a), uno (b) u obligatoria (c)? | a | SIEP-RF-F-06 | Psicología |
| F-P9 | M5: noticia elidida (a), dramatizada (b) o no incluida (c)? | a (c si hay duda) | SIEP-RN-F-09 | Psicología |
| F-P13 | Frase nueva en el aviso previo y nodo de C1 sensible? | Sí a ambas | Revisión del aviso ETH-01 | Psicología |
| F-P14 (= C-P2) | Indicador siempre visible u ocultable, y se muestra también a la sobreviviente? | Ocultable y en ambas personas | SIEP-RF-F-05 | Psicología |
| F-P15 | Se permite omitir la entrevista, y precede o sustituye a la herramienta PAP? | No omitir; precede a la herramienta | SIEP-RF-F-01 | Psicología y equipo |
| F-P6 | Se validan los efectos de la matriz de técnicas? | Tabla propuesta con revisión experta | Valores del registro | Psicología |
| F-P10 | La técnica se nombra tras cada respuesta (a) o al final (b)? | b | SIEP-RN-F-08 | Psicología |
| F-P11 | La reparación es criterio nuevo o parte de `CONTENCION`? | Parte de `CONTENCION` | Rúbrica | Psicología |
| F-P12 | Una métrica global debe modular a una persona concreta? | No; valor autorado | Punto de partida | Psicología e Ingeniería |

## 11. Preguntas cerradas para Psicología

1. En una persona desbordada, una pregunta abierta sube la tensión (A) o la baja (B)? Si depende del momento, se autora por entrevista (C).
2. El silencio acompañado («quedarme a su lado») baja la tensión de forma leve (A) o no debe ofrecerse como respuesta (B)?
3. Sobreprometer (p. ej. «todo va a estar bien») sube la tensión en M1 (A) o la baja a corto plazo y se penaliza solo al final (B)?
4. Es clínicamente defendible que el retraimiento ocurra por un patrón de respuestas, no por una sola (sí/no)?
5. Dos intentos de reparación antes de que la persona termine la conversación (A), uno (B) o una reparación ilimitada (C)?
6. Debe el cierre tener consecuencia solo narrativa (A), o una línea menos en M9 (B)?
7. La noticia de la muerte de la niña se elide en M5 (A), se dramatiza con revisión experta (B) o no se incluye (C)?
8. Se muestra el indicador también en la conversación con la sobreviviente (sí/no)?
9. El ofrecimiento de «pausa» dentro de la entrevista es una respuesta de reparación válida (sí/no)?
10. Se amplía el aviso ETH-01 con «tus respuestas cambian como reacciona la persona; puedes pausar cuando quieras» (sí/no)?
