# Bloque G: Pistas, ayuda curada e IA opcional (requisitos formales)

> Línea de fuente: `docs/pendientes/propuestas/bloque-g-asistente-ia.md` (fecha 2026-10-03, rama `feat/cierre-plan-maestro`, HEAD observado `a47635d`). Estado: propuesta para decidir, nada implementado. Convención: ASUNCION = suposición de este documento que la propuesta no afirma; JURIDICO = requiere concepto jurídico escrito (Ley 1581 de 2012, Decreto 1377 de 2013, Ley 1090 de 2006; conocimiento general, sin fuente en el repositorio).

> **Nota de vigencia (2026-10-11).** La propuesta es del 2026-10-03. Verificado en `master` (`5ad59d1`): la bandera `AI_ASSISTANT_ENABLED` ya existe y nace apagada (`backend_django/psychosim/settings/base.py:128`), la vista responde 404 con la ruta apagada (`backend_django/apps/simulation/views/ai_assistant.py:33`) y hay pruebas de ese comportamiento (`backend_django/apps/simulation/tests/test_ai_assistant.py:106-136`), de modo que **SIEP-RNF-G-01 ya está implementado** en el servidor. Siguen pendientes: la pantalla del cliente, el cambio del proveedor por defecto (hoy `openai`, `settings/base.py:131`) y todas las demás salvaguardas (autorización, derivación, topes, minimización, retención).

## 1. Resumen y alcance

El bloque G cubre RF-027 («asistencia inteligente contextual») y la línea base RF-11, RF-18 y CU-09 (ayudas o pistas). Se organiza en **tres niveles separados**: (a) **pista autorada por el profesor**, que es lo único que la línea base obliga; (b) **ayuda curada del sistema** (30-50 entradas redactadas por Psicología, sin proveedor externo, para estudiante y docente), que la propuesta recomienda como cumplimiento de RF-027; (c) **IA opcional con salvaguardas**, solo tras decisión registrada y con concepto jurídico, solo para el estudiante.

**Qué NO es:** no es un chat siempre disponible, no diagnostica, no da apoyo terapéutico, no evalúa ni puntúa, no dice qué opción elegir, no recibe datos de estudiantes en el rol docente y no se activa mientras no exista concepto jurídico. La ruta `ai-assistant` existe sin pantalla; ya trae bandera de apagado y pruebas de la bandera (nota de vigencia), pero no las demás salvaguardas.

**Competencia que entrena:** reflexión autónoma y uso de recursos de apoyo (conceptos, marco normativo general, herramientas, ruta institucional) sin sustituir la decisión del estudiante ni la evaluación docente.

**Obligatorio / recomendado / opcional.** Obligatorio para cumplir la línea base: RF-G-01 y RF-G-02 (con RN-G-01, RN-G-02, CU-G-01, CU-G-02). Recomendado (cubre RF-027 sin proveedor externo): RF-G-03, RF-G-04 y sus reglas. Opcional y condicionado a JURIDICO: RF-G-05 a RF-G-09 con sus RNF y RN de IA; si no se aprueban, el sistema cumple la línea base y RF-027 reinterpretado.

## 2. Ubicación respecto de la línea base

| ID de la línea base | Relación | Nota |
|---|---|---|
| RF-11 Gestionar ayudas | Extiende | Pista opcional por decisión; la propuesta no define la autoría, se completa con la decisión 13 del contraste (ASUNCION) |
| RF-11 (actor «profesor») | Tensiona | SIEP-RN-06: hoy solo el administrador autora; depende de la decisión 3 del contraste |
| RF-18 Consultar ayudas | Extiende | Bajo demanda durante la simulación; la ayuda curada añade consulta siempre disponible |
| CU-09 Consultar ayuda | Reutiliza | Flujo base de la pista; la ayuda curada y la IA son variantes |
| RN-08 Consecuencia vs retroalimentación al final | Tensiona | La ayuda no puede adelantar retroalimentación pedagógica ni la opción correcta |
| RF-10 / RF-23 Retroalimentación | Independiente | La IA tras decidir explica retroalimentación ya mostrada; no la sustituye ni la crea |
| RN-01 Alcance no diagnóstico | Reutiliza | Se reafirma como límite del asistente |
| RN-09 Valoración formativa | Reutiliza | Usar la ayuda no puntúa ni genera nota |
| RF-25 Revisar desempeño | Extiende | Vista docente de temas por grupo, nunca por estudiante |
| RNF-01 Protección de credenciales | Reutiliza | Clave de API del proveedor fuera del repositorio y sin valor en entornos hasta concepto jurídico |
| RNF-04 Accesibilidad básica | Reutiliza | Panel por teclado, contraste, texto legible |
| RF-16 Introducción del caso | Independiente | Sin relación directa |
| SIEP-RNF-05, RNF-003 del equipo (privacidad) | Extiende | Minimización, retención y alias; ver Riesgos |
| SIEP-RNF-01 (cifrado de bitácoras) | Reutiliza | Si se guarda texto de pregunta, mismo cifrado |
| SIEP-RNF-02 (auditoría) | Tensiona | Hoy guarda la pregunta en claro 360 días; se pasa a metadatos |
| RF-027 (equipo) | Reinterpreta | De «asistente IA» a «ayuda contextual con IA opcional» (G-P1) |

## 3. Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Origen |
|---|---|---|---|---|---|---|
| SIEP-RF-G-01 | Gestión de casos | Autorar pista | El docente debe poder agregar una o más pistas opcionales, en texto, a una escena o decisión del caso, y editarlas o retirarlas antes de publicar. ASUNCION: se guarda por nodo, en la versión borrador (cambio de esquema, ola 3.2 del contraste). | Profesor | Media (obligatorio línea base) | RF-11; decisión 13 del contraste; la propuesta G no lo describe (§5.8 solo trata ayuda curada) |
| SIEP-RF-G-02 | Participación | Consultar pista autorada | El estudiante debe poder pedir, durante la simulación y bajo demanda, las pistas autoradas de la escena en curso, sin que consultarlas cambie puntaje, indicadores ni el desarrollo del caso. | Estudiante | Media (obligatorio línea base) | RF-18, CU-09; decisión 13 del contraste; G §5.7 |
| SIEP-RF-G-03 | Ayuda curada | Consultar ayuda curada | El estudiante debe poder abrir un panel «Ayuda» con entradas curadas por tema (conceptos, marco normativo general, herramientas, interfaz, preguntas de reflexión, qué hacer si algo me afecta), con búsqueda local en el navegador que no envíe nada al servidor, disponible en cualquier momento del caso. | Estudiante | Media (recomendado) | G §3.2 (opción C más ayuda curada), §5.8; G-P8 |
| SIEP-RF-G-04 | Ayuda curada | Guía y banco docente | El docente debe poder consultar una guía de uso (rúbrica, traza, qué cuenta como evidencia) y un banco curado de preguntas de debriefing por nodo del caso. | Profesor | Media (recomendado) | G §4 (D4 y versión curada de D2), §7 fase 2; G-P4 |
| SIEP-RF-G-05 | IA opcional | Derivar ante malestar | El sistema debe, antes de enviar cualquier texto a la IA, comprobar de forma determinista si la pregunta está en primera persona sobre angustia, daño propio o violencia vivida; de ser así, no la envía y responde con un mensaje fijo que reconoce lo dicho, recuerda la Pausa segura y nombra recursos humanos definidos por la institución. | Estudiante / Sistema | Alta (condición de RF-G-06) | G §6.2, §5.6; G-P7, G-E8 |
| SIEP-RF-G-06 | IA opcional | Preguntar al asistente IA | JURIDICO. El estudiante con autorización vigente debe poder escribir una pregunta (máx. 500 caracteres) al asistente de IA solo después de que su decisión del paso esté registrada en el servidor, y en el cierre o la bitácora; la respuesta se ancla a las entradas curadas del caso (ASUNCION: anclaje como propone G §5.8). | Estudiante | Baja (opcional) | G §3.2 (opción C), §5.2, §5.8; G-P3, G-E3 |
| SIEP-RF-G-07 | IA opcional | Autorizar y revocar | JURIDICO. El sistema debe mostrar, antes del primer uso de la IA y en pantalla aparte del aviso de contenido sensible, qué se envía, a qué empresa y país, para qué y cómo retirar la autorización, y registrar una autorización expresa y revocable por el estudiante. | Estudiante / Sistema | Baja (obligatoria si existe RF-G-06) | G §5.3, §5.4; G-E5 |
| SIEP-RF-G-08 | IA opcional | Topes y caída a ayuda curada | El sistema debe limitar las consultas a la IA por intento (10, por defecto) y por día (30, por defecto) y, al agotar el tope o la espera, ofrecer la ayuda curada sin mensaje técnico. | Sistema | Baja (opcional) | G §6.4; G-P11, G-E7 |
| SIEP-RF-G-09 | Seguimiento docente | Temas más consultados | El docente debe poder ver los temas de ayuda más consultados por grupo, solo cuando haya un mínimo de estudiantes (valor a definir, ASUNCION: 5), sin ver preguntas ni uso por estudiante. | Profesor | Baja (opcional) | G §5.9; G-P5 |

## 4. Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Origen |
|---|---|---|---|---|---|
| SIEP-RNF-G-01 | Seguridad | Ruta de IA apagada por defecto | El servidor debe rechazar toda llamada a `ai-assistant` mientras la bandera de activación esté apagada (valor por defecto) y no debe haber clave de API definida en ningún entorno hasta contar con concepto jurídico. Aplica aunque no se apruebe el resto de G. Estado: implementado en el servidor (bandera apagada por defecto y 404; nota de vigencia); falta verificar que ningún entorno defina la clave. | Alta | G §1 (acción inmediata), §2.7 punto 1; G-E1, G-E2 |
| SIEP-RNF-G-02 | Privacidad | Minimización de lo que sale | JURIDICO. El sistema debe enviar al proveedor solo la pregunta recortada, el título del caso, el nombre del paso y fragmentos curados pertinentes, y filtrar patrones evidentes (correos, teléfonos, documentos) antes de enviarla. | Alta | G §5.1, §5.2; G-E8 |
| SIEP-RNF-G-03 | Privacidad | Retención sin texto | El sistema no debe guardar el texto de la pregunta; debe guardar solo metadatos (fecha, paso, modo, longitud, derivación). Si Psicología pide el texto, debe guardarse cifrado como las bitácoras, con retención corta (90 días por defecto) y acceso solo del administrador autorizado. | Alta | G §5.5; G-P10, G-E10 |
| SIEP-RNF-G-04 | Accesibilidad | Panel accesible | El panel de ayuda y el de IA deben operarse por teclado, devolver el foco al cerrar, anunciar cada respuesta una sola vez en región `aria-live="polite"`, identificar quién habla en texto, no usar temporizadores ni atajos de una sola tecla, respetar movimiento reducido (0a) y exponer la Pausa segura visible (0b). Criterio WCAG: 2.1 AA según decisión 19 del contraste; la propuesta cita 2.2. | Alta | G §6.5; RNF-04; dependencias 0a, 0b, 0e |
| SIEP-RNF-G-05 | Disponibilidad | Espera acotada y sin caída silenciosa | La consulta a la IA debe esperar como máximo 8-10 s (valor por defecto), ser cancelable, y un valor de proveedor no reconocido debe fallar de forma explícita en vez de caer a otro proveedor. | Media | G §2.1 punto 4, §6.4; G-E7 |
| SIEP-RNF-G-06 | Seguridad | Estado leído en servidor | El servidor debe calcular si hay decisión registrada, validar el nodo contra el intento, rechazar intentos que no estén activos y responder 4xx con el sobre `{success, message}` ante identificadores inválidos; no debe aceptar `decision_already_taken` del cliente. | Alta | G §2.7 puntos 3 y 5, §5.2; G-E3, G-E9 |
| SIEP-RNF-G-07 | Calidad | Pruebas de la vista y adversas | La vista de ayuda e IA debe tener pruebas automáticas, el e2e `no-chatbot.e2e.ts` debe reescribirse a la nueva interfaz y la IA debe evaluarse con casos adversos (pedir la opción correcta, relatos personales, inyección en el nodo) antes de activarse. | Media | G §2.5, §7 fase 3; G-E9 |
| SIEP-RNF-G-08 | Mantenibilidad | Contenido curado versionado | Las entradas curadas deben vivir como JSON versionado en el repositorio, revisado por pull request, con autoría y fecha de revisión de Psicología. | Media | G-E4, G-P6, §5.8 |
| SIEP-RNF-G-09 | Privacidad | Transmisión internacional | JURIDICO. Antes de activar un proveedor, deben constar por escrito responsable del tratamiento, proveedor como encargado, país y región, retención y uso para entrenamiento; la política de tratamiento de la Universidad debe mencionarlo. | Alta | G §5.4, §5.10; G-P2, G-E6 |

## 5. Reglas de negocio

| ID | Categoría | Regla | Prioridad | Origen |
|---|---|---|---|---|
| SIEP-RN-G-01 | Pistas | Consultar una pista no puntúa, no cambia indicadores ni el desarrollo del caso. | Alta | RF-18; G §5.7; decisión 13 del contraste |
| SIEP-RN-G-02 | Retroalimentación | Ninguna ayuda (pista autorada, curada o IA) debe revelar ni insinuar la opción correcta ni adelantar retroalimentación pedagógica antes de que la decisión esté registrada. ASUNCION para pistas autoradas: se aplica como pauta de autoría y revisión. | Alta | RN-08; G §3.1, §3.2; RF-027 |
| SIEP-RN-G-03 | Ética | El asistente no diagnostica, no da apoyo emocional o terapéutico, no valora el desempeño en vivo, no emite puntajes ni etiquetas de acierto, no reconstruye hechos violentos con detalle ni opina de personas reales. | Alta | RN-01; G §3.1, §6.1 |
| SIEP-RN-G-04 | Ética | Usar o no la ayuda no puntúa, no se muestra por estudiante al docente y no cambia el caso; rechazar la autorización de IA no bloquea el simulador. | Alta | G §5.7, §5.9 |
| SIEP-RN-G-05 | Ética | Ninguna IA recibe datos de estudiantes en el rol docente: no se resumen trazas ni bitácoras ni se redacta retroalimentación individual. | Alta | G §4 (D1 y D3 «No»); JURIDICO si se reabre |
| SIEP-RN-G-06 | Ética | El texto que parezca relato personal de malestar o violencia vivida no se envía al proveedor ni se guarda; el mensaje fijo de derivación tampoco se guarda con el texto. | Alta | G §5.6, §6.2 |
| SIEP-RN-G-07 | Privacidad | JURIDICO. Nunca salen hacia un tercero: nombre, correo, id o alias del estudiante, id de intento, bitácoras, decisiones, puntaje, estrés, métricas, banderas, marcas del mapa social, preferencias de accesibilidad, IP, agente de usuario, texto del docente sobre un estudiante ni testimonios sensibles del caso. | Alta | G §5.1; SIEP-RNF-05 |
| SIEP-RN-G-08 | Privacidad | JURIDICO. La IA no se activa para ningún usuario sin concepto jurídico institucional escrito y sin autorización expresa vigente del estudiante. | Alta | G §5.3, §5.10; G-P2 |
| SIEP-RN-G-09 | Transparencia | El asistente debe identificarse siempre como «Asistente de IA, no es una persona», indicar si la respuesta es curada o generada y recordar que puede equivocarse; fuera de alcance responde con una redirección fija. | Media | G §6.1, §6.3 |

## 6. Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados |
|---|---|---|---|---|
| SIEP-CU-G-01 | Consultar pista | Estudiante | Obtener una pista opcional de la escena sin costo ni consecuencia. | SIEP-RF-G-02, RF-18, CU-09 |
| SIEP-CU-G-02 | Autorar pista | Profesor | Agregar o retirar pistas de una escena o decisión del borrador. | SIEP-RF-G-01, RF-11 |
| SIEP-CU-G-03 | Consultar ayuda curada | Estudiante | Resolver una duda de concepto, herramienta o interfaz sin enviar datos a un tercero. | SIEP-RF-G-03 |
| SIEP-CU-G-04 | Consultar guía y banco de debriefing | Profesor | Preparar el cierre del caso con preguntas curadas por nodo. | SIEP-RF-G-04 |
| SIEP-CU-G-05 | Preguntar al asistente IA | Estudiante | Aclarar la retroalimentación o un concepto tras decidir, con derivación y topes. | SIEP-RF-G-05, G-06, G-08 |
| SIEP-CU-G-06 | Autorizar o revocar IA | Estudiante | Decidir con información si permite el envío de su pregunta a un proveedor. | SIEP-RF-G-07 |
| SIEP-CU-G-07 | Ver temas consultados | Profesor | Ajustar la clase según los temas de ayuda más frecuentes del grupo. | SIEP-RF-G-09, RF-25 |

## 7. Criterios de aceptación

Pruebas: **A** = automática, **E** = e2e, **R** = revisión de experto.

**SIEP-RF-G-01.** Dado un borrador con una escena, cuando el docente agrega y guarda una pista, entonces al reabrir el borrador la pista está en esa escena (A). Dado una versión publicada, cuando se intenta editar una pista, entonces se exige clonar la versión (A, SIEP-RN-02).
**SIEP-RF-G-02.** Dado una escena con pistas, cuando el estudiante pide la pista, entonces la ve y puntaje, estrés, confianza y riesgo no cambian (A, E). Dado una escena sin pistas, cuando abre la ayuda, entonces el control no ofrece pista o dice que no hay (E).
**SIEP-RF-G-03.** Dado el panel abierto, cuando el estudiante busca un término, entonces no se emite ninguna petición de red al servidor (E con interceptor). Dado el aviso de contenido sensible visible, cuando se abre la Pausa segura, entonces sigue accesible (E).
**SIEP-RF-G-04.** Dado un docente con un caso asignado, cuando abre la guía, entonces ve el banco de preguntas del nodo seleccionado y ningún dato de estudiantes (A, R: Psicología valida el contenido).
**SIEP-RF-G-05.** Dado «me siento mal desde lo que pasó», cuando se envía, entonces la respuesta es el mensaje fijo y no hay llamada al proveedor (A con proveedor simulado). Dado «¿qué es el feminicidio?», entonces no se deriva (A). La lista de frases la valida Psicología (R).
**SIEP-RF-G-06.** Dado un paso sin decisión registrada, cuando se pregunta, entonces el servidor responde 4xx aunque el cliente mande `decision_already_taken=true` (A). Dado una pregunta de 501 caracteres, entonces se rechaza (A). Dado una respuesta generada, entonces no nombra la opción correcta en la batería adversa (R, A).
**SIEP-RF-G-07.** Dado un estudiante sin autorización, cuando intenta preguntar, entonces recibe la pantalla de autorización y no se llama al proveedor (A, E). Dado una autorización revocada, entonces la siguiente consulta es rechazada (A).
**SIEP-RF-G-08.** Dado 10 consultas en un intento, cuando hace la 11.ª, entonces se ofrece la ayuda curada sin texto técnico ni nombre de variable (A, E). Dado una espera mayor al máximo, entonces ocurre lo mismo (A).
**SIEP-RF-G-09.** Dado un grupo con menos del mínimo de estudiantes, cuando el docente abre la vista, entonces no se muestran temas (A). Dado el mínimo cumplido, entonces la respuesta no contiene id, alias ni texto de preguntas (A).
**SIEP-RN-G-01.** Dado cualquier pista consultada, cuando se completa el intento, entonces el puntaje coincide con el de un intento idéntico sin consultas (A).
**SIEP-RN-G-02.** Dado una ayuda cualquiera antes de decidir, cuando se compara con la opción marcada correcta, entonces no la menciona ni la insinúa (R de Psicología sobre todas las entradas; A de contenido para la IA).
**SIEP-RN-G-03.** Dado una pregunta de diagnóstico o de «¿vas bien?», cuando se responde, entonces sale la redirección fija sin etiqueta de acierto (A, R).
**SIEP-RN-G-04.** Dado un docente con acceso a su grupo, cuando consulta el seguimiento, entonces ningún endpoint devuelve uso de ayuda por estudiante (A). Dado un estudiante que rechaza la IA, entonces el caso se juega completo (E).
**SIEP-RN-G-05.** Dado un docente autenticado, cuando llama a la ruta de IA con un intento de un estudiante, entonces recibe 403 o 404 y no hay llamada al proveedor (A).
**SIEP-RN-G-06.** Dado un texto derivado, cuando se revisan los registros, entonces ese texto no aparece en `audit_logs` ni en logs del servidor (A).
**SIEP-RN-G-07.** Dado una consulta con proveedor simulado, cuando se inspecciona la carga enviada, entonces contiene solo los campos permitidos (A con instantánea del cuerpo).
**SIEP-RN-G-08.** Dado la bandera apagada o sin concepto registrado, cuando cualquier rol llama a la ruta, entonces responde rechazo y no sale ninguna petición (A). Dado el concepto jurídico, entonces el registro lo cita (R: Jurídica).
**SIEP-RN-G-09.** Dado una respuesta de IA, cuando se muestra, entonces trae la insignia «IA» y el aviso de posible error; una entrada curada trae la insignia «Curada» (E).

## 8. Riesgos éticos y de privacidad

| Riesgo | Mitigación | Requisito que la implementa |
|---|---|---|
| Un estudiante cuenta una experiencia propia de violencia al asistente | Derivación determinista previa, mensaje fijo, nada se envía ni se guarda | SIEP-RF-G-05, SIEP-RN-G-06 |
| Datos personales o sensibles del estudiante llegan a un tercero en otro país | Minimización, filtro, autorización expresa, concepto jurídico | SIEP-RNF-G-02, SIEP-RNF-G-09, SIEP-RN-G-07, SIEP-RN-G-08 |
| La pregunta queda en claro 12 meses en `audit_logs` | Solo metadatos; si hay texto, cifrado y retención corta | SIEP-RNF-G-03 |
| La IA revela o insinúa la opción correcta | Estado leído en servidor, respuestas ancladas, batería adversa | SIEP-RF-G-06, SIEP-RNF-G-06, SIEP-RN-G-02 |
| El docente vigila qué pregunta cada estudiante | Solo temas por grupo con mínimo; sin preguntas ni uso individual | SIEP-RF-G-09, SIEP-RN-G-04 |
| El docente expone bitácoras a la IA | Sin IA con datos de estudiantes en el rol docente | SIEP-RN-G-05 |
| La ruta viva se activa por una clave definida sin decisión | Bandera apagada y clave sin valor | SIEP-RNF-G-01 |
| El estudiante se siente evaluado por usar la ayuda | Sin puntaje ni visibilidad individual; rechazo sin consecuencia | SIEP-RN-G-01, SIEP-RN-G-04 |
| La IA se toma por persona o por fuente infalible | Identificación y aviso de error en cada respuesta | SIEP-RN-G-09 |
| La IA inventa normativa | Anclaje a entradas curadas y revisión experta | SIEP-RF-G-06, SIEP-RNF-G-07 |
| Costo o espera descontrolados | Topes, espera corta, caída a ayuda curada | SIEP-RF-G-08, SIEP-RNF-G-05 |

## 9. Dependencias y orden

**Fase 0 compartida.** La propuesta G declara no tener Fase 0, pero su §6.5 usa piezas de ella. Se citan sin redactarlas: **0b** (botón visible de Pausa segura, dentro del panel; condiciona RF-G-03 y RF-G-05), **0a** (movimiento reducido en el panel de diálogo; ASUNCION: aplica al panel de ayuda), **0e** (ningún atajo de una tecla sin revisar WCAG 2.1.4; condiciona SIEP-RNF-G-04). **0c** y **0d** no aplican a G.

**Orden.** (1) SIEP-RNF-G-01 ya, como cambio aparte (0,5-1 d-p). (2) Contenido y RF-G-01/02 (pistas), RF-G-03 (ayuda curada), RF-G-04. (3) IA (RF-G-05 a 08, RNF-G-02, -05, -06, -07, -09) solo tras JURIDICO. RF-G-09 después de RF-G-03 con uso registrado sin texto.

**Otros bloques.** Bloque J (2.º caso): cada caso necesita su propio banco de entradas y pistas; ayuda curada debe parametrizarse por caso. Bloques C, E, F: sin dependencia directa; si F añade turnos, las pistas por «escena» deben definir qué es un turno (ASUNCION).

**Contraste.** Decisión 3 (el profesor autora casos): condiciona RF-G-01 (sin ella, solo el administrador carga pistas). Decisión 13 (ayuda = pista autorada por escena, sin costo, IA aparte): base de RF-G-01/02 y RN-G-01. Decisión 6 (retroalimentación al final): condiciona RN-G-02 y RF-G-06. Decisión 19 (WCAG 2.1 o 2.2): condiciona SIEP-RNF-G-04. Decisión 21 (alias): condiciona RF-G-09. Ola 0.2 del contraste (el guardado de nodo vacía `supportResources`, D-4) debe resolverse antes de guardar pistas. Ola 3.2 exige cambio de esquema.

## 10. Decisiones que bloquean

| ID original | Pregunta cerrada | Valor por defecto | Qué desbloquea | Quién decide |
|---|---|---|---|---|
| G-P1 (bloquea) | ¿Se reinterpreta RF-027 como «ayuda contextual» con IA opcional? | Sí; ayuda curada primero | Todo el bloque | Dirección / Psicología |
| G-P2 (bloquea) | ¿Quién autoriza enviar texto de estudiantes a un proveedor extranjero? | No activar IA sin concepto escrito | RF-G-06 a 08, RNF-G-09 | Jurídica / Dirección |
| G-P3 (bloquea) | ¿Cuándo está disponible la IA? | Tras decidir en cada paso y en el cierre; ayuda curada siempre | RF-G-06 | Psicología |
| G-P4 | ¿El docente no tiene IA en esta fase y recibe guía y banco curados? | Sí | RF-G-04, RN-G-05 | Psicología |
| G-P5 | ¿Qué ve el docente del uso? | Solo temas por grupo | RF-G-09 | Psicología |
| G-P6 | ¿Quién redacta y valida las 30-50 entradas? | Psicología redacta; revisión experta | RF-G-03, RF-G-04 | Psicología |
| G-P7 | ¿Qué frases activan la derivación y qué recursos se nombran? | Psicología define la lista; recursos los pone la institución | RF-G-05 | Psicología / Bienestar |
| G-P8 | ¿Primera versión con menú y búsqueda, sin texto libre? | Sí | RF-G-03 | Psicología |
| G-P9 | ¿SIM-VBG-001 es ficticio o parte de un caso real? | Tratarlo como real | RN-G-07, RNF-G-02 | Psicología |
| G-P10 | ¿Cuánto se conserva y qué? | Metadatos 12 meses, sin texto | RNF-G-03 | Psicología / Jurídica |
| G-P11 | ¿Topes de uso? | 10 por intento, 30 por día | RF-G-08 | Psicología |
| G-E1 | ¿Se cierra la ruta ya con bandera apagada? | Sí (ya hecho: `AI_ASSISTANT_ENABLED`, nota de vigencia) | RNF-G-01 | Ingeniería |
| G-E5 | ¿Dónde se guarda la autorización? | Tabla propia cuando Jurídica valide | RF-G-07 | Ingeniería / Jurídica |
| G-E6 | ¿Qué proveedor y región, con retención cero o modelo propio? | El que Jurídica pueda contratar | RNF-G-09 | Jurídica / Ingeniería |
| Decisión 13 del contraste | ¿«Ayuda» es una pista autorada por escena, bajo demanda y sin costo? | Sí, por escena; IA aparte | RF-G-01, RF-G-02 | Equipo / Psicología |

## 11. Preguntas cerradas para Psicología

1. ¿Aprueba reinterpretar RF-027 como «ayuda contextual», con IA opcional y posterior? (sí / no)
2. ¿La IA debe estar disponible: (A) durante el caso, (B) solo en pausa o entre escenas, (C) solo después de decidir cada paso y en el cierre?
3. ¿Una pista autorada puede (A) nombrar el concepto o la herramienta pertinente sin decir la opción, o (B) solo formular una pregunta de reflexión?
4. ¿El docente puede ver que un estudiante concreto consultó una pista? (sí / no; por defecto no)
5. ¿Acepta que el docente no tenga IA con datos de estudiantes y solo guía y banco curados? (sí / no)
6. ¿Psicología redacta y valida las 30-50 entradas curadas y la lista de frases de derivación? (sí / no)
7. ¿SIM-VBG-001 es (A) totalmente ficticio, (B) parte de un caso real, (C) no se sabe?
8. ¿La ayuda curada puede explicar el marco normativo general antes de decidir? (sí / no)
9. ¿Mínimo de estudiantes para mostrar temas por grupo: (A) 5, (B) 10, (C) otro valor?
10. ¿Cómo se rotula usar la ayuda: (A) sin ningún rastro individual, (B) rastro anónimo agregado por grupo?
