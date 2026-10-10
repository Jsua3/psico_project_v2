# Bloque G — Asistente de IA contextual (RF-027): propuesta de alcance

- **Fecha:** 2026-10-03 · **Estado:** para decidir — nada implementado · **Rama:** `feat/cierre-plan-maestro` (HEAD observado `a47635d`)
- **Alcance:** lectura de código y documentos, y git de solo lectura. No se ejecutó nada, no se llamó a ninguna API y no se pudo ver el entorno de producción.
- **Convención:** lo no marcado está leído en el archivo citado. «(inferencia)» = deducción del autor. «(propuesta)» = no existe. «(conocimiento general)» = de memoria, sin fuente en el repo; requiere validación jurídica institucional.
- **Fuentes:** `docs/requisitos/funcionales/RF-027.md`; «BLOQUE G» de `docs/PLAN_MAESTRO_TOTAL.md` (líneas 1096-1273); fila G de `docs/informes/2026-10-02-brechas-plan-maestro-total.md`; código de la sección 2; límites de la base común `propuestas-c-e-f-base-comun.md` §6.

## 1. Resumen en lenguaje llano

**Qué existe hoy.** El servidor tiene una pieza que, si alguien le configura una clave, reenvía la pregunta de un estudiante a una IA de una empresa externa (OpenAI por defecto, o Anthropic) y devuelve la respuesta. **Ninguna pantalla la usa**: la ventana de chat se retiró del juego a propósito (diseño del 2026-07-13) y su código se borró el 2026-09-29. Pero la puerta del servidor sigue abierta: el «interruptor de apagado» que el plan de julio prometía nunca se escribió. Hoy no hay clave (según la hoja de ruta), así que solo responde un aviso fijo.

**Qué falta.** (1) Una pantalla. (2) El docente: RF-027 lo pide y el servidor solo atiende a un estudiante sobre su propio intento. (3) Cumplir lo que RF-027 exige y el código no hace: advertir o bloquear preguntas fuera de alcance, y no dar la opción correcta antes de que haya una decisión *registrada* (hoy lo decide un dato que manda el navegador). (4) Privacidad: nada pide autorización al estudiante, no hay tope de uso, y su pregunta queda guardada en texto claro 12 meses.

**Qué recomendamos.** Cambiar el orden. Primero una **ayuda curada**: respuestas redactadas y revisadas por Psicología, sin empresa externa, para estudiante y docente. La **IA con texto libre** queda como segunda etapa, opcional, y solo con concepto jurídico escrito, después de que el estudiante decide en cada paso (y en el cierre), con aviso y autorización aparte, y sin penalización por no usarla. Para el docente, **ninguna IA que reciba datos de estudiantes**.

**Qué hay que decidir** (sección 8): (a) si RF-027 se reinterpreta como «ayuda contextual», con IA opcional; (b) quién en la Universidad puede autorizar enviar texto de estudiantes a un tercero fuera del país; (c) cuándo está disponible para el estudiante.

**Acción inmediata, decida lo que se decida:** cerrar la ruta con una bandera apagada y no definir la clave en ningún entorno hasta tener la respuesta jurídica (0,5-1 día de Ingeniería).

## 2. Estado actual verificado

### 2.1 Flujo de una pregunta
Archivo principal: `backend_django/apps/simulation/views/ai_assistant.py` (`AIAssistantView`). Ruta: `ai-assistant` en `backend_django/apps/simulation/urls.py:47`, montada bajo `/api/simulation/`.

1. **Entrada.** `POST` con `attempt_id`, `question`, `current_node_id` y `decision_already_taken` (líneas 27-30). Sin `attempt_id` o sin `question` → 400. No hay límite de longitud de `question`.
2. **Quién.** `IsAuthenticated`: cualquier rol con sesión. Pero el intento se busca con `student=request.user` (línea 39): un docente o administrador recibe 404 salvo sobre un intento propio. Las vistas del estudiante que modifican el intento usan `IsEstudianteOrAdmin` (`backend_django/shared/permissions.py`, `game_views.py`). Roles reales: `ADMIN`, `PROFESOR`, `ESTUDIANTE` (`apps/users/models.py:18-21`). Que el docente no pueda es un efecto del filtro, no una decisión de diseño.
3. **Contexto.** `_build_context` (64-89) arma un texto de sistema con: título del caso, el `current_node_id` tal como lo mandó el navegador, y una de dos restricciones según `decision_already_taken` (también del navegador): «no reveles la respuesta correcta» o «puedes explicar retroalimentación conceptual».
4. **Proveedor.** `_call_llm` (91-100): `AI_ASSISTANT_PROVIDER=anthropic` → `https://api.anthropic.com/v1/messages`; **cualquier otro valor, incluso mal escrito, → OpenAI** `https://api.openai.com/v1/chat/completions`. Modelo por defecto `gpt-4o-mini`, `max_tokens` 512, espera máxima 20 s (línea 142), sincrónica dentro de la petición, sin reintentos. Ajustes en `backend_django/psychosim/settings/base.py:118-120` y en ambos `.env.example`.
5. **Respuesta.** Se devuelve tal cual, sin filtro de salida ni revisión de alcance.
6. **Conversación.** Cada llamada envía una sola pregunta: no hay historial. Aunque el chat borrado mostraba una conversación, el modelo veía solo el último mensaje.

### 2.2 Qué datos salen hoy hacia el proveedor (lista exacta)
1. El texto **completo** de `question` (lo que escribió el estudiante, sin recorte ni filtro).
2. El título del caso (`SimulationCase.title`; «Caso SIEP» si falla la lectura).
3. El `current_node_id` enviado por el navegador (cadena libre, no validada contra el intento).
4. Un texto fijo de instrucciones, con la restricción elegida por `decision_already_taken`.
5. Parámetros técnicos: modelo y `max_tokens`. La clave de API va en la cabecera; la IP que ve el proveedor es la del servidor.

**No salen:** nombre, correo, id de usuario, rol, `attempt_id`, decisiones tomadas, puntaje, estrés ni métricas, bitácoras, historial, ni el contenido narrativo del caso. El proveedor no sabe *quién* pregunta, pero sí *qué* escribe, y un estudiante puede escribir en esa caja cualquier dato propio o ajeno.

### 2.3 Modo degradado y errores
- Sin `AI_ASSISTANT_API_KEY` (líneas 47-50): respuesta **200** con el texto «El asistente aun no esta configurado. Define AI_ASSISTANT_API_KEY…». Es un mensaje para desarrolladores que un estudiante vería como si fuera la respuesta, y nombra una variable interna.
- Error del proveedor (51-53): 200 con «No pude consultar el asistente…»; al log va el cuerpo del error del proveedor (hasta 300 caracteres) a nivel `warning`.
- El registro de uso no distingue respuesta real, modo degradado y error: solo guarda la longitud del texto.

### 2.4 Qué se registra
`_write_audit` (148-172) → `audit_service.append` → tabla `audit_logs` (`apps/simulation/models/rubric.py:138-152`): acción `AI_ASSISTANT_QUERY`, id y rol del actor, `attempt_id`, **`question` recortada a 500 caracteres en texto claro** (`context_json`, campo de texto), nodo, `decision_taken`, longitud de la respuesta, IP, agente de usuario. No se guarda la respuesta. Retención: `retention_until` = 360 días (`audit_service.py:28`); existe `purge_audit_logs`, no verifiqué que se ejecute periódicamente. No encontré ningún endpoint que lea `audit_logs`: solo se alcanza con acceso a la base (inferencia por búsqueda). Las bitácoras sí se cifran (AES-GCM, `crypto_service.py`); la pregunta al asistente **no**.

### 2.5 Límites, pruebas y frontend
- No hay limitación de tasa ni tope por usuario o por día (no hay `THROTTLE` en `backend_django/`), ni validación de que el intento esté activo (`PAUSED`, `COMPLETED`, `REPLACED` también responden).
- No hay ninguna prueba de la vista (búsqueda de «assistant» en todos los `.py` fuera de la vista, `urls.py` y `settings`). El plan pedía «test de integración» (Criterio de Done).
- Frontend: sin rastro en `frontend/src`. El componente se borró en `d043311`. `frontend/e2e/no-chatbot.e2e.ts` comprueba que no existe `app-ai-assistant` ni «Instructor guia chatbot»; cualquier pantalla nueva obliga a reescribirlo.
- El consentimiento ETH-01 vive en `sessionStorage` del navegador (spec 2026-07-10); el servidor no lo conoce y no puede exigirlo.

### 2.6 Brechas frente a RF-027 y al plan
| Pide | Hoy |
|---|---|
| Respuesta contextual al caso | Solo título y nodo; el modelo no conoce el contenido del caso |
| Registrar la interacción | Sí, con la pregunta en claro (ver 5.5) |
| Bloquear o advertir consultas fuera de alcance | No hay control; solo una frase en el prompt |
| No mostrar la opción correcta sin decisión registrada | Lo decide un booleano del navegador. El servidor sí podría saberlo: `game_service.py` escribe `DECISION_SELECTED` / `PROHIBITED_DECISION_SELECTED` por nodo |
| Estudiante y docente | Solo estudiante (por el filtro) |
| Plan: «Botón Orientación visible» | No existe, contradice el diseño del 2026-07-13 |

### 2.7 Riesgos que se ven en el código hoy
1. La ruta está viva y sin bandera: si alguien define la clave (aparece en dos `.env.example`), cualquier sesión puede mandar texto libre a un tercero llamando a la API directamente. La bandera `AI_ASSISTANT_ENABLED` del plan 2026-07-13 no está en ninguna rama (`git log --all -S`).
2. Texto libre del estudiante en `audit_logs` sin cifrar, 12 meses.
3. «No revelar» depende de un dato del navegador y de una frase del prompt (el `current_node_id` también se interpola sin validar: superficie de inyección de instrucciones).
4. Sin tope de uso ni de coste, y una llamada de hasta 20 s que ocupa un proceso del servidor.
5. Un `attempt_id` que no sea un UUID válido probablemente produce 500 (inferencia: solo se captura `DoesNotExist`).

## 3. Alcance propuesto para el estudiante

### 3.1 Para qué SÍ y para qué NO
**Sí** (todo con carácter formativo): aclarar conceptos (PAP, EPICEE/SPIKES, contención, ruta institucional); explicar el marco normativo *en general*, no «cuál aplicar en este caso» antes de decidir; explicar cómo se usa cada herramienta del caso; orientar sobre la interfaz y los controles; proponer preguntas de reflexión para la bitácora; **después de decidir**, ayudar a entender la retroalimentación sin puntajes ni etiquetas de acierto.

**No:** decir qué opción elegir ni insinuarla; valorar el desempeño en vivo («vas bien»); emitir diagnósticos clínicos reales; dar apoyo emocional o terapéutico (se deriva a personas, ver 6); responder fuera del simulador; reconstruir hechos violentos del caso con detalle; opinar sobre personas reales.

### 3.2 Cuándo está disponible
| Opción | Pros | Contras |
|---|---|---|
| **A. Durante el caso** (botón en el HUD, siempre) | Ayuda en el momento; es lo que pedía el plan | Es donde más se pide «¿cuál elijo?»; compite con la inmersión; acerca el chat a contenido sensible sin pausa; ya se retiró por estas razones (spec 2026-07-13 §7.5) |
| **B. Solo entre escenas / en pausa** (desde catálogo o pausa segura) | Protege el «no revelar»; coherente con ETH-02 | El estudiante no tiene el contexto fresco; hay que decidir qué es «entre escenas» |
| **C. Después de decidir en cada paso y en el cierre / bitácora** | «Decisión registrada» comprobable en servidor; alineado con el debriefing (el cierre ya es el espacio de revisión); menor exposición | No ayuda a decidir; quien se atasca debe pedir ayuda humana |

**Recomendada: C, más una ayuda curada de consulta (glosario, herramientas, interfaz) que sí está siempre disponible porque no es un chat ni se pregunta nada libre.** Así la parte que no puede revelar nada está siempre a mano, y la parte con IA (si se aprueba) solo existe cuando la decisión ya está registrada.

## 4. Alcance propuesto para el docente (hoy no existe)

| Alternativa | Datos que necesita | Riesgos | Veredicto |
|---|---|---|---|
| **D1. Resumir la traza de un intento** | Eventos, decisiones y **bitácoras descifradas** (`instructor_service.py:134-141`) | Saca texto íntimo del estudiante al proveedor; el alias `Estudiante-<id>` usa el id numérico del usuario (`instructor_service.py:31`): es seudónimo, no anónimo; alucinación; sesgo; sustituye la lectura del docente. RNF-003: las bitácoras no van a agregados por defecto | **No** |
| **D2. Sugerir preguntas de debriefing** | Solo el contenido del caso publicado (sin datos de estudiantes) | Preguntas genéricas o erróneas; sesgo cultural; normativa inventada | **Más tarde, y curado primero** |
| **D3. Ayudar a redactar retroalimentación de un estudiante** | Evidencia del estudiante y su desempeño | Evaluación sumativa asistida; datos personales; contradice «sin reemplazar la evaluación docente» (RF-027) | **No** |
| **D4. Guía de uso: rúbrica, traza, qué cuenta como evidencia** | Documentación del sistema | Bajo; requiere mantenerla al día | **Sí, curada** |

**Recomendada:** para el docente, **«no IA por ahora»** y entregar D4 + un banco curado de preguntas de debriefing por nodo (la versión curada de D2), redactados por Psicología. Esto cubre «Docente» de RF-027 sin que ningún dato de estudiante salga. Si más adelante se quiere IA para D2, que reciba solo contenido del caso, y el docente revise antes de usar. D1 y D3 no se reabren sin concepto jurídico y un acuerdo explícito de Psicología.

## 5. Privacidad y ética

### 5.1 Lo que no debe salir nunca hacia un tercero
Nombre, correo, id numérico o alias del estudiante; id de intento; bitácoras o cualquier texto escrito para el docente; decisiones elegidas, puntaje, estrés, métricas y banderas del caso; marcas del mapa social, tensión verbal, tiempos de reacción y preferencias de accesibilidad (base común §6.8); IP y agente de usuario; texto de docentes sobre un estudiante; los testimonios sensibles del caso. Hoy cumple casi todo (sección 2.2); falla en que el texto libre puede contener cualquier cosa.

### 5.2 Minimización y seudonimización (propuesta)
- Enviar solo: pregunta (tope de 500 caracteres), título del caso, nombre del paso (no el id crudo) y fragmentos *curados* pertinentes. Nada más.
- Calcular en el servidor si hay decisión registrada; no aceptar el dato del navegador. Validar el nodo contra el intento.
- Filtro previo de patrones evidentes (correos, teléfonos, números de documento) y aviso en pantalla de que no escriba datos personales. Cobertura parcial: un filtro no detecta nombres ni relatos personales (inferencia).
- Sin historial ni identificadores; la IP la ve el proveedor solo como la del servidor.

### 5.3 Aviso y autorización (propuesta; conocimiento general)
Antes del primer uso, una pantalla aparte (no el consentimiento ETH-01, que trata de contenido sensible, no de datos): qué se envía, a qué empresa y país, para qué (orientar, no evaluar), que no afecta el puntaje, que puede equivocarse, que no escriba datos propios o de otras personas, cómo retirar la autorización. Autorización previa, expresa e informada, con casilla aparte y revocable. **Dónde se guarda** es una pregunta abierta (G-E5): sin cambio de esquema solo cabe un evento por intento o `audit_logs`, que se purga a los 360 días; la prueba de la autorización debería durar mientras dure el tratamiento.

### 5.4 Transferencia internacional (conocimiento general; validar con Jurídica)
Los dos proveedores son de EE. UU. (inferencia: sus servidores y términos están allí). Enviarles datos personales desde Colombia es una **transmisión o transferencia internacional** según la Ley 1581 de 2012 y el Decreto 1377 de 2013: exige revisar si el país cuenta con nivel adecuado según la lista vigente de la Superintendencia de Industria y Comercio, o contar con autorización expresa del titular o con un contrato de transmisión que fije las obligaciones del proveedor como encargado. También la política de tratamiento y el aviso de privacidad de la Universidad deben mencionarlo. Hay que leer los términos vigentes de cada proveedor sobre retención y uso para entrenamiento (en general los planes de API tienen condiciones distintas de los del chat; verificar).

### 5.5 Retención
Hoy: pregunta en claro 360 días en `audit_logs`, sin cifrar y sin que el estudiante lo sepa. Propuesta: **no guardar el texto**; guardar solo metadatos (fecha, paso, modo, longitud, si se activó una derivación). Si Psicología quiere el texto para mejorar el asistente, que sea cifrado como las bitácoras (`crypto_service`), con retención corta (por ejemplo 90 días, a definir), acceso solo del administrador autorizado, y con el estudiante informado. Retención del lado del proveedor: la fija el contrato.

### 5.6 Contenido sensible y lo que el estudiante escribe de sí mismo
`SIM-VBG-001` trata violencia basada en género. Un estudiante puede, en una pregunta, contar una experiencia propia: eso puede ser dato sensible (salud, vida sexual) y la ley exige autorización expresa para tratarlo, que además es facultativa. Medidas: el aviso lo dice; el texto que parezca un relato personal de malestar o violencia **no se envía al proveedor** (se responde con el mensaje fijo de 6.2); no se guarda; el asistente no reconstruye hechos violentos; la pantalla no ofrece el asistente antes de pasar ETH-01 (el servidor no puede comprobarlo, ver 2.5); el contexto no incluye testimonios del caso.

### 5.7 Sin penalización
Usar o no la ayuda no puntúa, no se muestra por estudiante al docente y no cambia el desarrollo del caso. La versión curada cubre lo esencial, así quien rechace la IA no pierde nada. Rechazar la autorización no bloquea el simulador.

### 5.8 Alternativa seria sin proveedor externo
**Ayuda curada**: ~30-50 entradas (conceptos, marco normativo general, herramientas, interfaz, preguntas de reflexión por nodo, qué hacer si algo me afecta) escritas por Psicología, con menú por tema y búsqueda local en el navegador (sin enviar nada al servidor).
- **Pros:** ningún dato sale; respuestas revisadas y estables; cero coste por consulta; «no revelar» garantizado por revisión; cumple RF-027 para ambos roles sin depender de Jurídica; es el modo degradado *bien hecho*.
- **Contras:** sin texto libre; hay que mantenerla; cobertura limitada, con respuesta honesta «eso no está aquí, pregúntale a tu docente»; carga de redacción sobre Psicología.
Si luego se añade IA, que responda *a partir de* estas entradas (propuesta), para reducir invenciones de normativa.

### 5.9 Registro de uso para el docente y riesgo de vigilancia
| Opción | Efecto |
|---|---|
| Docente ve las preguntas de cada estudiante | Máxima vigilancia; frena a quien pregunta; rompe la confidencialidad esperada (Ley 1090 de 2006, conocimiento general). **No** |
| Docente ve si cada estudiante usó la ayuda | Se vuelve señal de «necesita ayuda» o de «hizo trampa»; sesgo |
| **Docente ve solo temas más consultados por grupo (con mínimo de personas)** | Útil para ajustar la clase; sin identificar a nadie. **Recomendada** |

El administrador autorizado conserva el registro técnico (RNF-007) con metadatos, no con texto.

### 5.10 Marco legal (conocimiento general; no es asesoría jurídica)
Ley 1581 de 2012 y Decreto 1377 de 2013: finalidad, autorización previa e informada, datos sensibles, derechos de consulta, rectificación, supresión y revocatoria, deberes del responsable y del encargado, transferencia y transmisión internacional. Ley 1090 de 2006: confidencialidad y secreto profesional en el ejercicio de la psicología; aplica con más fuerza si lo escrito al asistente o a la bitácora llega a manos del docente como psicólogo. **Recomendamos concepto jurídico institucional por escrito antes de activar cualquier proveedor**, incluyendo quién es el responsable del tratamiento y si el proveedor figura como encargado.

## 6. Salvaguardas de diseño

### 6.1 Límites del asistente
No clínico ni terapéutico: no diagnostica, no aconseja sobre la vida personal del estudiante, no sustituye al docente ni la evaluación. Siempre se identifica («Asistente de IA, no es una persona»). No emite puntajes ni etiquetas de acierto. Fuera de alcance → respuesta fija de redirección (no un intento de responder). Cada respuesta con IA lleva el recordatorio de que puede equivocarse.

### 6.2 Señales de malestar del estudiante
Los textos en primera persona sobre angustia, daño propio o violencia vivida **no pasan por el modelo**: una comprobación determinista previa (lista que define Psicología; recall limitado, se declara) devuelve un mensaje fijo y breve: reconoce lo dicho, recuerda que puede usar la **Pausa segura** (ETH-02) en cualquier momento, y señala recursos humanos (docente, bienestar universitario, líneas de atención). Los recursos concretos son los mismos datos verificados que ETH-01 deja pendientes (`BLOCKED_EXTERNAL`): no se inventan aquí. Hablar *del caso* («violencia», «feminicidio») no debe activarla: solo la primera persona. Estos mensajes no se guardan con el texto.

### 6.3 Transparencia
Insignia permanente «IA» en el panel; aviso de primer uso (5.3); enlace a «qué se envía»; indicar si la respuesta es curada o generada.

### 6.4 Límites de uso y coste (propuesta, cifras a confirmar)
Tope por intento (p. ej. 10) y por día (p. ej. 30); pregunta ≤ 500 caracteres; `max_tokens` 512 ya existente; limitación de tasa del servidor; tope mensual en la cuenta del proveedor; espera máxima menor (p. ej. 8-10 s) y, al agotarla o al llegar al tope, caer a la ayuda curada sin mensaje técnico.

### 6.5 Accesibilidad (WCAG 2.2)
Todo por teclado, foco devuelto al abrir y cerrar, sin atajo de una sola tecla (2.1.4); la tecla Esc ya está cargada en el juego (base común §5.5), el panel no la reutiliza para salir del caso. Respuestas en región `aria-live="polite"`, una sola vez (4.1.3); quién habla («Tú» / «Asistente de IA») en texto, no solo por color o alineación (1.4.1). **Sin temporizadores**: la espera es indicada, cancelable y sin cierre automático (2.2.1). Objetivos ≥ 24 px (2.5.8); el panel no tapa el foco (2.4.11); ayuda en un lugar coherente en todas las pantallas (3.2.6); botón visible de Pausa segura dentro del panel (REGLA-004; pieza 0b de la Fase 0 compartida con C/E/F). Respeta `reduceMotion`.

## 7. Fases y esfuerzo orientativo

| Fase | Qué incluye | Ing. (d-p) | Psic. (d-p) | Depende de |
|---|---|---|---|---|
| **0 Cierre y decisión** | Bandera apagada + prueba; confirmar el entorno; sesión de decisión; abrir la consulta jurídica | 0,5-1 | 1-2 | Dirección |
| **1 Ayuda curada, estudiante** | 30-50 entradas; panel «Ayuda» accesible con búsqueda local; registro de uso sin texto; reescribir `no-chatbot.e2e.ts` | 6-10 | 7-11 (redactar 5-8, revisión experta 2-3) | Contenido; botón de Pausa segura (0b) |
| **2 Ayuda curada, docente** | Guía de rúbrica y traza; banco de preguntas de debriefing por nodo | 3-5 | 3-5 | Fase 1 |
| **3 IA opcional, estudiante** | Servidor endurecido (decisión leída en servidor, tope de uso, filtro, derivación, respuestas ancladas, pruebas); aviso y autorización; evaluación con casos adversos | 13-22 | 3-4 | Concepto jurídico, contrato con el proveedor, clave, presupuesto, lugar para guardar la autorización |
| **Total** | Fases 1+2 cubren RF-027 para ambos roles sin proveedor: **9,5-16 d-p** de Ingeniería | **22,5-38** | **14-22** | |

Estimaciones por confirmar; no incluyen el plazo de Jurídica ni de la revisión experta externa. La autorización persistente exige una tabla nueva: cambio de esquema, solo como propuesta y por script en `deploy/upgrades/`.

## 8. Preguntas abiertas

### Para Psicología / dirección
1. **G-P1 (bloquea).** El diseño del 2026-07-13 (aún «pendiente de revisión del documento escrito», base común §5.6) retira el chatbot del estudiante, y RF-027 (Alta, «Propuesto») lo pide. ¿Se reinterpreta RF-027 como «ayuda contextual» con IA opcional? *Por defecto: sí; ayuda curada primero.*
2. **G-P2 (bloquea).** ¿Quién en la Universidad autoriza enviar texto de estudiantes a un proveedor extranjero (responsable del tratamiento, Jurídica)? *Por defecto: no activar IA sin concepto escrito.*
3. **G-P3 (bloquea).** ¿Cuándo está disponible la IA? *Por defecto: después de decidir en cada paso y en el cierre; la ayuda curada, siempre.*
4. **G-P4.** ¿Se acepta que el docente no tenga IA en esta fase y reciba guía y banco curados? *Por defecto: sí.*
5. **G-P5.** ¿Qué ve el docente del uso? *Por defecto: solo temas por grupo, nunca preguntas ni uso por estudiante.*
6. **G-P6.** ¿Quién redacta y valida las ~30-50 entradas (conceptos, normativa, herramientas)? *Por defecto: Psicología redacta; revisión experta.*
7. **G-P7.** ¿Qué frases activan la derivación, y qué recursos humanos se nombran? *Por defecto: Psicología define la lista; texto fijo sin IA; recursos los pone la institución (mismo pendiente que ETH-01).*
8. **G-P8.** ¿Primera versión con menú y búsqueda, sin texto libre? *Por defecto: sí.*
9. **G-P9.** ¿`SIM-VBG-001` es totalmente ficticio o parte de un caso real? Cambia lo que puede salir a un tercero. *Por defecto: tratarlo como real; no enviar texto narrativo del caso.*
10. **G-P10.** ¿Cuánto se conserva y qué? *Por defecto: metadatos 12 meses (como la auditoría), sin texto.*
11. **G-P11.** ¿Topes de uso? *Por defecto: 10 por intento y 30 por día.*

### Para Ingeniería
12. **G-E1.** ¿Se cierra la ruta ya, con bandera apagada, como cambio aparte? *Por defecto: sí (el plan de julio la prometía).*
13. **G-E2.** ¿Está definida `AI_ASSISTANT_API_KEY` en algún entorno desplegado? No pude verificarlo. *Por defecto: confirmar y retirarla si existe.*
14. **G-E3.** Decisión registrada leída en servidor (eventos de decisión del nodo), validación del nodo y estado del intento; descartar `decision_already_taken` del cliente.
15. **G-E4.** ¿Dónde viven las entradas curadas? *Por defecto: JSON versionado en el repo, revisado por PR, como los escenarios de `assets/game/`.*
16. **G-E5.** ¿Dónde se guarda la autorización? Sin cambio de esquema: evento por intento (no cubre «por usuario»). *Por defecto: proponer tabla propia cuando Jurídica valide.*
17. **G-E6.** ¿Qué proveedor y región? ¿Retención cero disponible? ¿O un modelo alojado por la Universidad? *Por defecto: el que Jurídica pueda contratar.*
18. **G-E7.** Limitación de tasa, espera corta con corte de circuito y caída a ayuda curada. Un proveedor mal escrito no debe caer a OpenAI en silencio.
19. **G-E8.** Filtro de datos personales (alcance y falsos positivos) y detección de primera persona con prueba de casos.
20. **G-E9.** Pruebas de la vista (hoy no hay), reescritura de `no-chatbot.e2e.ts`, respuestas de error con el mismo sobre `{success, message}` que el resto de la API y manejo de UUID inválido.
21. **G-E10.** Registrar en el evento el modo (curado, IA, degradado, derivado) para medir, sin texto; no escribir el cuerpo del error del proveedor en logs.
