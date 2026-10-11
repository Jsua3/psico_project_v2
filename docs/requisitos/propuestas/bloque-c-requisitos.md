# Bloque C: Diálogo «texto como señal», retratos e interrupciones (requisitos formales)

> Línea de fuente: `docs/pendientes/propuestas/bloque-c-dialogo-sintoma.md` (2026-10-03, rama `feat/cierre-plan-maestro`), con `propuestas-c-e-f-resumen.md` y la sección 8 de `propuestas-c-e-f-base-comun.md`. Estado: propuesta para decidir, nada implementado. Convención de Origen: número de sección de la propuesta; `C-Pn` = pregunta abierta; `In` = pregunta para Ingeniería; `Fn` = fase de la propuesta.

> **Nota de vigencia (2026-10-11).** La propuesta es del 2026-10-03 y el kit de personajes unificado entró en `master` el 2026-10-09, así que parte de lo que dice sobre retratos ya no describe el código. Verificado en `master` (`5ad59d1`): (1) `frontend/src/assets/characters/` solo contiene `kit/`: ya no existen `portraits/` ni el manifiesto v1 congelado por hash, por lo que **SIEP-RNF-C-08 se reformuló** sobre el kit; (2) el catálogo del kit (`kit/kit.json`, `catalog.emotionToPortrait`) ya traduce 13 emociones y alias a **cuatro** estados de retrato (`preocupada`, `neutral`, `triste`, `alegre`), con caída a `neutral` (`frontend/src/app/features/character/kit/character-visual.resolver.ts:154-162`): `negative` → `triste`, `positive` → `alegre`, y `relieved`, `calm` y `closed` → `neutral`. Por eso **SIEP-RF-C-01 a C-03 se cumplen en parte**: ya hay tabla de alias y caída; lo que C añade es distinguir `relieved`, `calm` y `closed` de `neutral` (arte nuevo: ampliar `PORTRAIT_STATES`) y evitar que `positive` muestre sonrisa en duelo (C-P4). Los perfiles de ritmo (SIEP-RF-C-04 a C-06), la ventana y las reglas no cambian.

## 1. Resumen y alcance

El bloque C hace que la forma de hablar de las personas del caso (ritmo, pausas, retrato) cuente algo de cómo están, sin etiquetas ni puntos: el estudiante observa y decide. Unifica el vocabulario de emociones y el mapa de retratos (hoy casi todos caen a neutral) y añade tres perfiles de ritmo: agitada, afligida y aliviada.
Como piloto opcional, solo en M1 (`familia-crisis`) y solo si el bloque F no se aprueba, ofrece una ventana de intervención sin reloj para decidir cuándo contener (PAP).
NO es: texto que tiembla, `glitch`, color de alarma, cuenta atrás ni «cierre» de la persona por tiempo; no puntúa, no mueve estrés ni métricas, no persiste estado propio y no cambia el esquema de la base de datos. Tampoco diagnostica ni etiqueta emociones.
Competencias que entrena: observar señales de malestar en el habla y contener antes de informar o preguntar (C1, criterio `CONTENCION`/`PAP`); escuchar un testimonio sin presionarlo (C2, `COMUNICACION_EMPATIA`); y, solo en el piloto, decidir cuándo intervenir (C3, dentro de `CONTENCION`). El puntaje lo asigna el docente a mano.
El contenido clínico (alias, perfiles, líneas, retratos) lo redacta y valida Psicología.

## 2. Ubicación respecto de la línea base

| ID línea base | Relación | Nota |
|---|---|---|
| RF-17 | extiende | Cambia la presentación del diálogo (ritmo, retrato); no cambia ramificación ni efectos. |
| RF-20 | extiende | Dos preguntas de bitácora sobre lo observado y la decisión de intervenir (propuesta). |
| RF-21 | extiende | Eventos nuevos solo si se construye la ventana; fuera de la línea de tiempo por defecto. |
| RF-25 | extiende | El docente ve la secuencia de eventos en la traza; sin indicador numérico. |
| RF-16 | independiente | La introducción no cambia; los retratos podrían reutilizarse allí (no propuesto). |
| RF-18 | independiente | La ventana de intervención es una acción de herramienta, no una ayuda ni una pista. |
| RF-22 | reutiliza | `CONTENCION`, `PAP` y `COMUNICACION_EMPATIA` se puntúan a mano; C no puntúa. |
| RN-01 | tensiona | «Señal» del habla no es diagnóstico: reacción esperable no es trastorno; se evita «síntoma» al estudiante. |
| RN-02 | independiente | La ventana no crea ramificación nueva; ejecuta una herramienta que ya existe. |
| RN-08 | tensiona | Una etiqueta de emoción adelantaría retroalimentación (C-P2); la ventana no revela la opción adecuada. |
| RN-09 | reutiliza | Formativo: C no mueve puntaje, estrés ni métricas; no genera nota. |
| RNF-04 | extiende | Convierte en criterios medibles el movimiento reducido, el contraste y los atajos (WCAG, ver sección 7 de la propuesta). |
| RNF-08 | independiente | C no escribe estado del caso (no usa `flags_json`). |
| SIEP-RN-01 (salida segura) | reutiliza | La pausa segura debe ser visible dentro del panel y de la ventana (REGLA-004, ETH-02). |

## 3. Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Origen |
|---|---|---|---|---|---|---|
| SIEP-RF-C-01 | Participación | Emoción canónica única | El sistema debe resolver la emoción de cada línea de diálogo a un conjunto canónico (`neutral`, `worried`, `anxious`, `sad`, `relieved`, `calm`, `closed`) mediante una tabla de alias, usando `neutral` si el valor es desconocido. Estado: parcial; el catálogo del kit ya trae la tabla de alias (nota de vigencia). | Sistema | Alta | 3.5; F1; C-P9 |
| SIEP-RF-C-02 | Participación | Retrato por línea | El sistema debe mostrar, para cada línea de una persona, el retrato correspondiente a su estado canónico, con caída de estado exacto a `worried` (si es `sad`) o `neutral` y por último a silueta. Estado: parcial; hoy hay cuatro estados de retrato y `relieved`, `calm` y `closed` caen a `neutral` (nota de vigencia). | Sistema | Alta | 3.5 (un solo contrato de retrato); F1 |
| SIEP-RF-C-03 | Participación | Retrato por hablante | El sistema debe asociar el personaje del retrato al hablante de la línea (incluidos «Sobreviviente» y «Madre de la sobreviviente»), usando `portrait_key` cuando exista y el nombre del hablante como respaldo. ASUNCION: «Madre de la sobreviviente» y «Abuela de la niña» son la misma persona (E-P12 de la propuesta E). | Sistema | Media | 3.5 (huecos de mapeo); F1 |
| SIEP-RF-C-04 | Participación | Perfiles de ritmo y pausas | El sistema debe mostrar las líneas de personas con uno de los perfiles base, ágil, pausado o sereno, según su emoción canónica, calculado por una función pura (misma entrada, misma salida, sin azar) y con tope de 6 s por línea. | Sistema | Alta | 3.1, 3.6; F2; C-P1 |
| SIEP-RF-C-05 | Participación | Completar o saltar la línea | El estudiante debe poder completar la línea en curso con «Saltar» o Enter en cualquier momento y avanzar sin esperar el ritmo. | Estudiante | Alta | 4.4, 7 (2.2.2); F2 |
| SIEP-RF-C-06 | Participación | Modulación por estado (opcional) | El sistema debe poder aplicar una guarda de coherencia que presente una línea `relieved` como `calm` con Confianza baja (umbral < 40, ASUNCION) y suba la intensidad de una línea `anxious` con crisis emocional ≥ 70, solo para apagar o atenuar, nunca para encender. | Sistema | Baja | 3.6; F5 |
| SIEP-RF-C-07 | Participación | Ventana de intervención (piloto M1, condicional) | El estudiante debe poder, durante el diálogo `familia-crisis` y solo si tiene el kit PAP, elegir entre «Seguir escuchando» e «Intervenir: contención (PAP)», con dos botones del mismo peso y sin tiempo límite. Solo se construye si el bloque F no se aprueba. | Estudiante | Baja | 3.3 I-b, 4.3; F3a; C-P5, C-P6 |
| SIEP-RF-C-08 | Trazabilidad | Registro de la ventana (condicional) | El sistema debe registrar `DIALOGUE_INTERRUPTION_USED` y `DIALOGUE_LISTENED_THROUGH` con la línea y la acción, sin tiempos, y mostrarlos al docente con rótulo legible en la traza. | Sistema / Docente | Baja | 5; F3b; C-P7, I5 |
| SIEP-RF-C-09 | Reflexión | Preguntas de bitácora del diálogo | El sistema debe ofrecer al estudiante, tras la decisión H1, la pregunta «¿Qué notaste en cómo hablaba la abuela?» y, solo si existe la ventana, «¿Qué te llevó a intervenir (o a esperar)?». ASUNCION: el texto final lo fija Psicología. | Estudiante | Media | 2 (paso 5); C-P8 |

## 4. Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Origen |
|---|---|---|---|---|---|
| SIEP-RNF-C-01 | Accesibilidad | Movimiento reducido en el diálogo | El panel de diálogo (sus dos instancias) debe respetar el interruptor de movimiento reducido del juego y la preferencia del sistema: línea completa sin máquina de escribir, ni pausas temporizadas, ni fundido de retrato. | Alta | 4.4, 7; I2; Fase 0 (0a) |
| SIEP-RNF-C-02 | Accesibilidad | Señal sin depender del color | El sistema no debe depender de color, opacidad, tamaño ni espaciado para transmitir la emoción; el cuerpo del texto debe conservar su contraste actual (4,5:1) y la señal debe ir también en la puntuación del texto. | Alta | 3.1, 7 (1.4.1, 1.4.3, 1.4.12); 4.4 |
| SIEP-RNF-C-03 | Accesibilidad | Lector de pantalla | El lector de pantalla debe recibir una sola vez la línea completa y limpia, con el nombre del hablante, y los botones de la ventana deben tener nombre completo («Intervenir con contención: aplicar Primeros Auxilios Psicológicos», «Seguir escuchando»). | Alta | 4.4, 7 (4.1.3); I6 |
| SIEP-RNF-C-04 | Accesibilidad | Teclado y objetivos táctiles | Toda la interacción del diálogo debe poder hacerse con `Tab`/`Mayús+Tab`, Enter/Espacio, sin atajos de una tecla nuevos, con botones de al menos 42 px. | Media | 4.4, 7 (2.1.1, 2.1.4, 2.5.8); Fase 0 (0e) |
| SIEP-RNF-C-05 | Accesibilidad | Sin límites de tiempo ni destellos | Ninguna línea debe tardar más de 6 s, ni haber movimiento continuo, parpadeo o destello propio del texto, ni cuenta atrás. | Alta | 3.3, 3.6, 7 (2.2.1, 2.2.2, 2.3.1) |
| SIEP-RNF-C-06 | Datos | Sin cambio de esquema | C debe funcionar sin cambiar tablas, columnas ni CHECK: la emoción canónica y los perfiles viven en el frontend y el estado de estilo se calcula al mostrar, sin persistirlo. | Media | 3.6, 6; base común §6.1 |
| SIEP-RNF-C-07 | Rendimiento | Presentación determinista y ligera | El cálculo de estilo y retrato debe ser determinista y no degradar el presupuesto de 59 FPS a 1366×768. | Media | 3.6; base común §6.10 |
| SIEP-RNF-C-08 | Mantenibilidad | Un solo contrato de retrato | El sistema debe resolver los retratos solo mediante el catálogo del kit unificado (`emotionToPortrait` y `PORTRAIT_STATES`), sin introducir un segundo mapa ni hojas de otro tamaño; ampliar los estados (`aliviada`, `retraída`) exige arte nuevo y pasar la validación del kit. ASUNCION: reformulado el 2026-10-11 sobre el kit; la propuesta hablaba de imágenes 96×96 en `portraits/` y del manifiesto v1. | Media | 3.5; I7; nota de vigencia |
| SIEP-RNF-C-09 | Calidad | Calibración y prueba asistida | Los perfiles de ritmo deben calibrarse con 3 a 5 estudiantes antes de fijarse, y la lectura del diálogo debe verificarse con NVDA. | Media | 3.6 (perfiles); F2; I6 |

## 5. Reglas de negocio

| ID | Categoría | Regla | Prioridad | Origen |
|---|---|---|---|---|
| SIEP-RN-C-01 | Formativo | C no debe escribir `stressIndex`, `accumulatedScore`, `userTrust`, `victimRisk` ni `caseMetrics`; intervenir debe ejecutar la herramienta existente con su regla actual, igual con o sin ventana. | Alta | 5; base común R1, R7 |
| SIEP-RN-C-02 | Ética de presentación | El cuerpo del texto no debe cambiar de color, tamaño ni opacidad por emoción, ni usar temblor (`wobble`) ni `glitch`; si la viñeta de crisis del bloque B pulsa, el texto debe quedar en perfil base. | Alta | 3.1, 3.7, 7 |
| SIEP-RN-C-03 | Ética de tiempo | Ningún diálogo ni interrupción debe vencer, cerrarse o cambiar de resultado por tiempo, y ninguna persona del caso debe «cerrarse» por reloj; el «cuándo» se expresa como línea, nunca como segundos. | Alta | 3.3 (I-a descartada), 5; acuerdo 2 |
| SIEP-RN-C-04 | Contenido clínico | Alias, perfiles, textos y retratos deben ser validados por Psicología antes de su uso, y al estudiante se le debe hablar de «señal», no de «síntoma». | Alta | 3.1; C-P9, C-P11 |
| SIEP-RN-C-05 | Alcance expresivo | Solo las líneas de personas del caso deben recibir perfil, y solo para tres estados con estilo (agitada, afligida, aliviada); `worried` y `closed` solo con retrato; enojo, disociación y esperanza quedan reservados. | Alta | 3.1, 3.5; C-P1 |
| SIEP-RN-C-06 | No revelar | El sistema no debe mostrar etiqueta de emoción de las personas que adelante la respuesta adecuada; la ventana debe usar botones del mismo peso, sin `isRecommended` ni `isProhibited`, y el estado solo apaga, nunca enciende. `stressIndex` no se usa como entrada. | Alta | 3.6, 4.3, 7; C-P2; R3 |
| SIEP-RN-C-07 | Seguridad del estudiante | Todo diálogo de persona y la ventana deben mostrar un control visible de «Pausa segura» sin depender de una acción cronometrada, sin empeorar el camino de salida actual. | Alta | 7; I4; Fase 0 (0b) |
| SIEP-RN-C-08 | No revictimizar | El testimonio de la sobreviviente (M9) no debe ser estímulo cronometrado, la ventana no se ofrece allí, y no se usan efectos de victoria o derrota ni retratos de «colapso». | Alta | 3.7, 7; C-P3, C-P10 |
| SIEP-RN-C-09 | Evidencia y privacidad | Usar «Saltar», activar movimiento reducido, la velocidad de lectura o usar o no la ventana por sí solo no debe contar como evidencia ni registrarse; ningún evento debe guardar tiempos de reacción ni preferencias de accesibilidad, y nada de C se envía al asistente IA. | Alta | 2, 5, 7; base común §6.8 |

## 6. Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados |
|---|---|---|---|---|
| SIEP-CU-C-01 | Escuchar a una persona con señales del habla | Estudiante | Leer el diálogo de una persona y notar cómo habla (ritmo, pausas, retrato) antes de decidir. | SIEP-RF-C-01..05, RF-17 |
| SIEP-CU-C-02 | Intervenir con contención durante el diálogo (piloto) | Estudiante | Decidir si contener (PAP) o seguir escuchando en M1, sin tiempo límite. | SIEP-RF-C-07, RF-17, RF-18 |
| SIEP-CU-C-03 | Reflexionar sobre lo observado | Estudiante | Registrar en la bitácora qué notó y por qué intervino o esperó. | SIEP-RF-C-09, RF-20 |
| SIEP-CU-C-04 | Revisar la secuencia de intervención | Docente | Ver en la traza si el estudiante intervino o escuchó hasta el final, y puntuar a mano `CONTENCION`. | SIEP-RF-C-08, RF-21, RF-25 |
| SIEP-CU-C-05 | Validar el contenido de presentación | Psicología (revisor experto) | Aprobar alias, perfiles y líneas antes de publicarlos. | SIEP-RF-C-01, SIEP-RF-C-04, SIEP-RF-C-06 |

## 7. Criterios de aceptación

| ID | Criterio (Dado / Cuando / Entonces) | Cómo se prueba |
|---|---|---|
| SIEP-RF-C-01 | Dado una línea con `negative`, `positive` o un valor desconocido, cuando se resuelve su emoción, entonces devuelve `sad`, `calm` y `neutral` respectivamente. | Automática (unitaria) |
| SIEP-RF-C-01 | Dado el desbloqueo de M2, cuando se muestra la línea, entonces su emoción es `relieved`. | Automática |
| SIEP-RF-C-02 | Dado la Abuela con línea `anxious` en M1, cuando se abre el panel, entonces el retrato es `worried` y no `neutral`. | e2e |
| SIEP-RF-C-02 | Dado `madre-vbg` sin retrato `sad`, cuando la línea es `sad`, entonces cae a `worried`; si no hay archivo, a silueta. | Automática |
| SIEP-RF-C-03 | Dado el hablante «Sobreviviente», cuando se muestra la línea, entonces resuelve el retrato de `paciente-vbg`. | Automática |
| SIEP-RF-C-04 | Dado la misma línea y emoción, cuando se calcula el plan dos veces, entonces el resultado es idéntico y ninguna línea supera 6 s. | Automática |
| SIEP-RF-C-04 | Dado una línea `anxious` (ágil) y una `sad` (pausado), cuando se comparan, entonces la ágil tiene menor ms/carácter y pausas más cortas. | Automática; calibración con estudiantes |
| SIEP-RF-C-05 | Dado una línea mostrándose, cuando se pulsa «Saltar» o Enter, entonces aparece completa y el diálogo avanza. | e2e |
| SIEP-RF-C-06 | Dado Confianza < 40 y línea `relieved`, cuando se muestra, entonces se presenta como `calm`; con Confianza alta no cambia. | Automática; revisión de experto del umbral |
| SIEP-RF-C-07 | Dado PAP en el inventario y M1 abierto, cuando el estudiante elige «Intervenir», entonces la línea se muestra completa y se ejecuta la herramienta existente con su mensaje de siempre. | e2e |
| SIEP-RF-C-07 | Dado que el estudiante no tiene PAP, cuando se abre M1, entonces la ventana no se ofrece. | Automática |
| SIEP-RF-C-08 | Dado el uso de la ventana, cuando el estudiante interviene en la línea 2, entonces se guarda un evento con `detail` «línea 2 de 3 \| contención (PAP)», sin tiempos ni identificadores. | Automática (backend) |
| SIEP-RF-C-09 | Dado que el estudiante decide H1, cuando se abre la bitácora, entonces se ofrece la pregunta sobre cómo hablaba la abuela. | e2e; revisión de experto del texto |
| SIEP-RNF-C-01 | Dado movimiento reducido activo en el HUD, cuando se muestra una línea, entonces aparece completa sin pausas ni fundido. | e2e |
| SIEP-RNF-C-02 | Dado cualquier emoción, cuando se mide el cuerpo del texto, entonces el contraste es ≥ 4,5:1 y su color es el mismo que en `neutral`. | e2e (Axe) |
| SIEP-RNF-C-03 | Dado un lector de pantalla, cuando se abre una línea, entonces se anuncia una sola vez, completa y con hablante. | Manual con NVDA |
| SIEP-RN-C-01 | Dado un diálogo con ventana, cuando se interviene o se escucha, entonces `stressIndex`, `accumulatedScore`, `userTrust`, `victimRisk` y `caseMetrics` solo cambian por la herramienta existente. | Automática (comparar estado con y sin ventana) |
| SIEP-RN-C-02 | Dado cualquier línea, cuando se renderiza, entonces no hay animación `wobble`, `glitch` ni cambio de color, tamaño u opacidad por emoción. | Automática (CSS) + revisión de experto |
| SIEP-RN-C-03 | Dado la ventana abierta y sin acción, cuando pasan minutos, entonces nada vence, se cierra ni cambia. | e2e |
| SIEP-RN-C-04 | Dado una nueva tabla de alias o perfil, cuando se propone su uso, entonces consta la validación de Psicología. | Revisión de experto |
| SIEP-RN-C-05 | Dado una línea de narración, supervisión, aviso o herramienta, cuando se muestra, entonces usa perfil base. | Automática |
| SIEP-RN-C-06 | Dado una persona en pantalla, cuando se muestra su emoción, entonces no hay etiqueta visible con el nombre de la emoción y los dos botones tienen igual estilo. | e2e + revisión de experto |
| SIEP-RN-C-07 | Dado un diálogo de persona abierto, cuando se recorre con teclado, entonces «Pausa segura» es alcanzable y deja el intento en `PAUSED`. | e2e |
| SIEP-RN-C-08 | Dado el diálogo `sobreviviente-consulta`, cuando se abre, entonces no hay botón de intervención ni reloj. | e2e |
| SIEP-RN-C-09 | Dado un intento con «Saltar» y movimiento reducido, cuando se consulta la traza y los eventos, entonces no hay registro de ello ni de tiempos de reacción. | Automática (backend) |

## 8. Riesgos éticos y de privacidad

| Riesgo | Mitigación | Requisito que la implementa |
|---|---|---|
| Caricatura o cliché del habla («ansioso = rápido»). | Solo tres perfiles en rango estrecho, tope de 6 s, señal escrita en el texto, calibración y revisión de experto. | SIEP-RF-C-04, SIEP-RN-C-02, SIEP-RN-C-05, SIEP-RNF-C-09 |
| Patologizar una reacción esperable. | Hablar de «señal», sin etiqueta ni diagnóstico; contenido validado por Psicología. | SIEP-RN-C-04, SIEP-RN-C-06 |
| Testimonio cronometrado o castigo por lentitud. | Sin reloj; la ventana no existe en M9; el «cuándo» es la línea. | SIEP-RN-C-03, SIEP-RN-C-08 |
| La etiqueta o el estado revelan la respuesta o anticipan retroalimentación (RN-08). | Sin etiqueta; botones iguales; el estado solo apaga. | SIEP-RN-C-06, SIEP-RF-C-06 |
| Inferir salud o discapacidad por tiempos de reacción o uso de movimiento reducido. | No registrar tiempos ni preferencias; no contar «Saltar» como evidencia. | SIEP-RN-C-09 |
| Una superposición nueva deja al estudiante sin salida segura. | Pausa segura visible dentro del panel y la ventana, sin acción cronometrada. | SIEP-RN-C-07 |
| Perder el matiz con movimiento reducido o lector de pantalla. | La señal va escrita en el texto; línea completa anunciada una vez. | SIEP-RNF-C-01, SIEP-RNF-C-02, SIEP-RNF-C-03 |
| Lectura simultánea de viñeta, texto y sacudida del bloque B en una escena de violencia de género. | Texto sin color propio; perfil base cuando la viñeta pulsa. | SIEP-RN-C-02 |
| Alivio leído como premio o sonrisa en el duelo. | Perfil sereno sin celebración; retrato `happy` desactivado por defecto (C-P4). | SIEP-RN-C-04, SIEP-RF-C-02 |

## 9. Dependencias y orden

- **Fase 0 compartida** (se redacta una sola vez en el consolidador): **0a** (movimiento reducido en el panel) es prerrequisito de SIEP-RNF-C-01, SIEP-RF-C-04 y SIEP-RF-C-05; **0b** (Pausa segura reutilizable) de SIEP-RN-C-07 y SIEP-RF-C-07; **0e** (atajos de una tecla, WCAG 2.1.4) de SIEP-RNF-C-04. **0c** no aplica a C (no escribe `flags_json`); **0d** solo aplicaría si C-P7 se resuelve «sí» (por defecto, no).
- **Orden recomendado:** Fase 0 → F0 decisiones (C-P1, C-P2, C-P9) → F1 emoción y mapa (SIEP-RF-C-01..03) → F2 ritmo (SIEP-RF-C-04, 05) → opcional F3a-F3b ventana y eventos (SIEP-RF-C-07, 08) → F4 arte → F5 modulación (SIEP-RF-C-06). Parar en cualquier fase no obliga a deshacer lo anterior.
- **Bloque F:** M1 es de F; la ventana (SIEP-RF-C-07, 08) solo existe si F no se aprueba (SIEP-RF-F-xx, F-P1). Si F se aprueba, C aporta solo presentación y puede leer la banda de tensión (1-4) como pista de intensidad. F necesita el retrato `closed` (hueco de arte de C).
- **Bloque E:** C solo condiciona líneas desbloqueadas a vínculos conocidos; sin E usa `NODE_EVIDENCE`. Vocabulario canónico compartido (R5).
- **Bloque B (hecho):** C no añade destellos, sacudidas ni color; respeta el presupuesto de efectos.
- **Decisiones del contraste que la condicionan:** decisión 6 (retroalimentación pedagógica oculta hasta el cierre, RN-08): condiciona la etiqueta de emoción y las preguntas de bitácora; decisión 10 (segunda oportunidad, RF-17): la ventana no la altera; decisión 16 (Psicología redacta objetivos y contenido): aplica al contenido clínico de C; decisión 17 (texto del aviso, RN-01): C no añade aviso propio; decisión 19 (WCAG 2.1 AA o 2.2 AA): C cita criterios 2.2 (2.5.8); decisión 13 (ayuda por escena, RF-18): C no es ayuda.

## 10. Decisiones que bloquean

| ID original | Pregunta cerrada | Valor por defecto | Qué desbloquea | Quién decide |
|---|---|---|---|---|
| F-P1 (bloque F) | ¿La tensión verbal es medidor pasivo, entrevista por turnos o tiempo real? | Entrevista por turnos | Si C construye la ventana (SIEP-RF-C-07, 08, 09 parcial) o solo presentación en M1 | Equipo y Psicología |
| C-P9 | ¿Se aprueban los alias (`negative` = afligida, `positive` = serena, M2 = aliviada, `closed` = retraída)? | Sí | F1: SIEP-RF-C-01..03 | Psicología |
| C-P1 | ¿Es defendible estilo solo en agitada, afligida y aliviada (enojo, disociación y esperanza reservados)? | Sí (a) | F2: SIEP-RF-C-04, SIEP-RN-C-05 | Psicología |
| C-P2 / F-P14 | ¿Se quitan las etiquetas de emoción de las personas? | (a) Sin etiqueta; descripción breve solo para el lector de pantalla | SIEP-RN-C-06, SIEP-RNF-C-03 | Psicología |
| C-P5 | ¿Se hace el piloto de la ventana en M1 (solo si F no se aprueba)? | (b) No | SIEP-RF-C-07, SIEP-RF-C-08 | Psicología |
| C-P3 | ¿Se aplica estilo al testimonio de la sobreviviente (M9)? | (a) Sí, perfil suave (tope ×1,15), con veto de experto | SIEP-RF-C-04 en M9 | Psicología |
| C-P4 | ¿Es aceptable el retrato `happy` (sonrisa suave) de la Abuela en M2 y M6? | (b) No usarlo | SIEP-RF-C-02 y F4 de arte | Psicología |
| C-P6 | ¿Qué cuenta como «intervenir»? | (a) Solo contención (PAP) | SIEP-RF-C-07 | Psicología |
| C-P7 | ¿Los eventos de la ventana entran en la línea de tiempo del docente? | (a) No | SIEP-RF-C-08, pieza 0d | Equipo |
| C-P8 | ¿C3 va dentro de `CONTENCION` y se aprueban las dos preguntas de bitácora? | (a) Sí | SIEP-RF-C-09 | Psicología |
| C-P10 | ¿Se descartan los 6 retratos genéricos (Visual C) y los 5 efectos (Visual H)? | (a) Sí, ambos | Alcance de arte | Equipo |
| C-P11 | ¿«Señal» o «síntoma» en pantalla? | «Señal» | SIEP-RN-C-04 | Psicología |
| I1 | ¿Siguen vigentes los planes de julio (35-45 car/s, sin chips)? | Sin definir; se mantiene el panel actual (22 car/s, chip) | Velocidad base de SIEP-RF-C-04 | Ingeniería |
| I5 | ¿Endpoint nuevo con lista blanca o marca en el `detail` de `TOOL_USED`? | Endpoint nuevo si se construye la ventana | SIEP-RF-C-08 | Ingeniería |

## 11. Preguntas cerradas para Psicología

1. ¿Son defendibles clínicamente tres estilos de habla (agitada, afligida, aliviada) y dejar enojo, disociación y esperanza fuera? Sí / No.
2. Las personas del caso, ¿se muestran sin etiqueta de emoción para que el estudiante observe? A) Sin etiqueta; B) Etiqueta en español; C) Etiqueta opcional como ayuda de lectura.
3. Alias: ¿se aprueba «negative» (2.ª línea de la Abuela en H1) = afligida, «positive» de la psicóloga = serena, desbloqueo de M2 = aliviada? Sí / No (re-etiquetar el seed).
4. ¿Se aplica el estilo de habla al testimonio de la sobreviviente en M9? A) Sí, perfil suave; B) Solo retrato; C) No.
5. La sonrisa suave del retrato de la Abuela en M2 y M6, ¿es aceptable en duelo? A) Conservarla; B) No usarla; C) Encargar versión «alivio sin sonrisa».
6. Los reclamos de la familia en M1, ¿deben leerse como enojo contra la institución y re-etiquetarse? Sí / No.
7. ¿Tiene sentido clínico convertir la contención en una decisión de «cuándo» en M1 (ventana sin reloj)? A) Sí, solo M1; B) No; C) Sí, y evaluar M3 y M10 después.
8. ¿Qué cuenta como «intervenir»? A) Solo contención (PAP); B) También «pedir un momento a la familia».
9. ¿La competencia C3 va dentro de `CONTENCION` y se aprueban las dos preguntas de bitácora? Sí / No (criterio nuevo).
10. ¿Es aceptable que, con Confianza baja o crisis emocional alta, el sistema atenúe la línea de alivio y suba la intensidad de la ansiosa (solo apagar o atenuar)? Sí / No.
11. En pantalla y documentos al estudiante, ¿«señal» o «síntoma»? A) Señal; B) Síntoma.
