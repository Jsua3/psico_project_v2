# Bloque J: Segundo caso de consultorio y generalización previa (requisitos formales)

> Fuente: `docs/pendientes/propuestas/bloque-j-escenario-hogar-consultorio.md`, fecha 2026-10-03. Estado: propuesta para decidir, nada implementado. Las referencias «C §n» de la columna Origen se escriben «J §n»; «J-Pn» = pregunta n de la sección 9 de la propuesta; «decisión N» = decisión N de la sección 4 de `conflictos-y-decisiones.md`.

> **Nota de vigencia (2026-10-11).** La propuesta es del 2026-10-03. Verificado en `master` (`5ad59d1`): `decision_option_state` ya devuelve solo `id` y `text` antes de decidir; la clasificación y la conducta prohibida viajan únicamente en el feedback posterior (`backend_django/apps/simulation/serializers/game_dtos.py:47-54`). La decisión J-P23 y el riesgo asociado quedan **resueltos** para ese punto; sigue pendiente revisar los diálogos de ambiente y los mensajes de evidencia faltante. `compute_ending` sigue devolviendo los finales del caso VBG a todo intento completado (`backend_django/apps/simulation/services/case_effects.py:289-341`), por lo que la generalización (SIEP-RF-J-01) sigue vigente.

## 1. Resumen y alcance

El bloque J añade un **segundo caso jugable** a SIEP. Se redacta en dos partes: (1) **generalizar** lo que hoy está atado a `SIM-VBG-001` (finales, métricas de cierre, aviso de contenido sensible, introducción, registros por clave, catálogo), trabajo que no depende de contenido clínico y puede empezar ya; (2) el **caso 2** como contenido, rúbrica propia y autoría. La propuesta recomienda como primer escenario el **consultorio de primera escucha** (alternativa A); la visita domiciliaria (B) y el seguimiento (C) quedan fuera de estos requisitos y exigirían un protocolo ético propio.

- **Es:** un caso independiente, con aviso, introducción, personas, salas, decisiones, finales y rúbrica propios, publicado por el flujo normal (borrador, validación, checklist, publicación).
- **No es:** un modelo `scenarioseed` (el plan lo pedía; la propuesta lo descarta), contenido clínico inventado por Ingeniería, un diagnóstico ni una nota oficial (RN-09), ni la visita domiciliaria.
- **Competencias que entrena (a confirmar por Psicología, J §4):** encuadre y consentimiento informado, confidencialidad y sus límites, entrevista inicial y alianza, cierre de sesión y derivación; distintas de las del caso actual (contención en crisis, noticia difícil, marco normativo, riesgo y protección, no revictimizar).
- **Lo no resuelto:** quién autora (SIEP-RN-06 = solo ADMIN, RF-05 = profesor; decisión 3) y qué aporta el DSL del taller (decisión 8). Lo que depende de ellos se marca «DSL» o «ROL».

## 2. Ubicación respecto de la línea base

| ID de la línea base | Relación | Nota |
|---|---|---|
| RF-05..RF-11 | contradice (ROL) | El caso 2 se autora hoy solo por ADMIN (SIEP-RN-06); RF-05 dice profesor (decisión 3) |
| RF-12, RN-05 | extiende (DSL) | La validación previa a publicar se cumple con `world_validation.py`; el DSL aún no existe en el sistema (decisión 8) |
| RF-13, RN-03 | reutiliza | Borrador, publicación y archivado se usan sin cambio |
| RF-14, RF-15, RN-04 | extiende | El catálogo y el inicio deben filtrar por asignación con dos casos (hoy desbloqueo lineal solo en el lobby) |
| RF-16 | tensiona | Introducción atada a `hospital-urgencias`; hay que generarla por caso |
| RF-17 | reutiliza | El motor ramificado sirve sin cambio |
| RF-22, RN-09 | tensiona | Final y métricas calculados por código para un solo caso; la rúbrica propia y el total formativo requieren decisión 9 |
| RF-23, RN-08 | tensiona | La retroalimentación del caso nuevo debe respetar el momento de muestra (decisión 6) |
| RF-25, RF-26 | independiente | Sin cambio; la vista docente muestra el caso nuevo con las funciones actuales |
| RN-01 | reutiliza | El aviso propio mantiene «no diagnóstico» |
| RN-02, RN-11 | reutiliza | Cada opción lleva a escena válida; número de opciones según la situación |
| RN-07 | independiente | Sin cambio por el bloque; lo decide la decisión 2 |
| RNF-04 | extiende | Accesibilidad exigida al recorrido nuevo (decisión 19: WCAG 2.1 vs 2.2) |
| RNF-07, RNF-08 | extiende | Paquete de efectos separado por caso; la semilla no borra intentos |
| SIEP-RF-04, SIEP-RF-05 | extiende | Final y aviso hoy válidos solo para `SIM-VBG-001` |
| SIEP-RF-12 | extiende | Catálogo con desbloqueo lineal: el caso 2 exige completar el 1 |

## 3. Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Origen |
|---|---|---|---|---|---|---|
| SIEP-RF-J-01 | Evaluación | Finales y métricas por caso | El sistema debe resolver el final y las métricas de un intento con el paquete de efectos del caso al que pertenece; un caso sin paquete no debe mostrar finales ni métricas de otro caso. Hoy `compute_ending` devuelve los 4 finales del caso VBG a todo intento completado. | Sistema | Alta | J §3 pto 1, §6 E1a; J-P15 |
| SIEP-RF-J-02 | Evaluación | Cierre con rótulos del caso | El estudiante debe ver al terminar las métricas y el final con los nombres definidos por el caso, y la pantalla de cierre no debe rotular las 7 métricas del caso VBG en un caso que no las usa. ASUNCION: el caso 2 define 3 a 5 métricas propias (J-P9). | Estudiante | Alta | J §3 pto 1, §5 hoja 9, §6 E1b; J-P9 |
| SIEP-RF-J-03 | Ética | Aviso previo propio del caso | El sistema debe mostrar, antes de cualquier narrativa, audio o mundo, el aviso de contenido sensible definido por el caso, con sus temas, indicación de menores y recursos de apoyo verificados; si no hay recursos verificados, debe declararlos «pendientes». | Estudiante / Sistema | Alta | J §3 pto 2, §5 hoja 2, §8; J-P4 |
| SIEP-RF-J-04 | Participación | Introducción por caso | El estudiante debe poder ver, antes de comenzar, el contexto, las personas y los objetivos de aprendizaje del caso en curso, tomados de los datos del caso y no de texto fijo. Si el caso no define introducción propia, el sistema debe mostrar solo el aviso y la narrativa inicial. | Estudiante | Media | J §3 pto 2, §6 E1c; J-P21; RF-16 |
| SIEP-RF-J-05 | Participación | Catálogo y asignación con dos casos | El estudiante debe ver solo los casos que su grupo tiene asignados, y el sistema debe rechazar en el servidor el inicio de un caso no asignado. ASUNCION: el orden entre casos se mantiene por fecha de creación (el caso 2 va después del 1) hasta decidir J-P8. | Estudiante / Sistema | Alta | J §3 pto 9, §6 E1e; J-P8, J-P24; RF-15 |
| SIEP-RF-J-06 | Gestión de casos | Registros y vocabulario por caso | El sistema debe resolver por caso los objetivos de escena, la evidencia previa, el retrato y el aspecto de las personas, y el significado de «ruta institucional» y riesgo, sin depender de claves ni palabras del caso VBG; una clave no registrada debe degradar a un valor neutro sin error. | Sistema | Media | J §3 ptos 3, 6, 7, §6 E1d-f; J-P20 |
| SIEP-RF-J-07 | Gestión de casos | Contenido del caso 2 (consultorio de primera escucha) | El sistema debe publicar un caso con ficha, objetivo, 3 a 5 competencias, personas, salas, escenas, decisiones de 3 opciones (4 solo si hace falta), retroalimentación de supervisión por opción, herramientas, finales y métricas, redactados por Psicología según la plantilla de hojas 0 a 9. DSL: la estructura debe poder expresarse en el formato de intercambio si se aprueba. | Sistema / Psicología | Alta | J §4 alt. A, §5 hojas 0-9; J-P1, J-P2, J-P10, J-P11, J-P13 |
| SIEP-RF-J-08 | Evaluación | Rúbrica propia del caso | El profesor debe poder valorar un intento del caso 2 con una rúbrica de 4 a 6 criterios, cada uno con evidencia observable en el juego (decisión, herramienta o bitácora), asociada a la versión publicada. | Profesor | Alta | J §5 hojas 1 y 10; RF-22, SIEP-RF-06 |
| SIEP-RF-J-09 | Gestión de casos | Autoría y publicación del caso 2 | El sistema debe permitir crear el caso 2 en estado borrador, validarlo y publicarlo con la lista de verificación al 100 % y un acta de revisión de una persona experta distinta de la autora, sin borrar intentos de ninguna versión. ROL: ASUNCION, publica el administrador (J-P22) mientras la decisión 3 siga abierta. DSL: la validación puede delegarse al validador del DSL (decisión 8). | Administrador | Alta | J §6 E2, E5, §5 hoja 12; J-P16, J-P17, J-P22; RF-12, RF-13 |

## 4. Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Origen |
|---|---|---|---|---|---|
| SIEP-RNF-J-01 | Fiabilidad | Sin regresión de `SIM-VBG-001` | Tras generalizar, el caso `SIM-VBG-001` debe comportarse igual en cierre, aviso, introducción y finales; sus pruebas de semilla y su recorrido e2e deben seguir verdes sin cambios. | Alta | J §6 riesgo 3 |
| SIEP-RNF-J-02 | Accesibilidad | Recorrido accesible del caso nuevo | Salas, objetos, diálogos, aviso y cierre del caso 2 deben ser operables con teclado y lector de pantalla, no depender solo del color, respetar movimiento reducido, tener descripción textual de cada sala y pasar la auditoría axe sin violaciones críticas ni serias. Criterio base WCAG 2.1 AA salvo decisión 19. | Alta | J §8 «WCAG 2.2»; RNF-04; 0a, 0e |
| SIEP-RNF-J-03 | Mantenibilidad | Claves con prefijo de caso | Las claves de nodo, mapa y opción del caso 2 deben llevar el prefijo del código del caso y no deben coincidir con `hospital-*` ni `comisaria-*`. | Alta | J §3 ptos 4-6, §9 J-P20 |
| SIEP-RNF-J-04 | Datos | Semilla idempotente sin cambio de esquema | La carga del caso 2 debe ser reproducible por comando, versionada y con pruebas, repetible sin duplicar ni borrar intentos y sin cambiar el esquema de BD. El paquete de efectos y finales vive en código por caso. | Alta | J §6 E2, §7; J-P15, J-P16, J-P17 |
| SIEP-RNF-J-05 | Privacidad | Datos ficticios y sin envío externo | El contenido del caso 2 no debe incluir datos reales, y el sistema no debe enviar contenido del caso a un proveedor externo de IA sin decisión expresa (bloque G). | Alta | J §8 «Privacidad» |
| SIEP-RNF-J-06 | Usabilidad | Coherencia visual | Las salas y personas nuevas deben respetar la escala del personaje (unos 46 px/m) y reutilizar el mobiliario y el canal de arte existentes; sin arte, la sala debe verse con la base neutra sin error. | Baja | J §4 arte, §6 A1-A5; J-P18, J-P19 |
| SIEP-RNF-J-07 | Mantenibilidad | Pruebas del segundo recorrido | El recorrido completo del caso 2 debe tener una prueba e2e propia con pausa y reanudación, ejecutable dentro del límite del nocturno. | Media | J §6 E4, nocturno; J-P26 |

## 5. Reglas de negocio

| ID | Categoría | Regla | Prioridad | Origen |
|---|---|---|---|---|
| SIEP-RN-J-01 | Aislamiento | Un caso no debe mostrar finales, métricas, aviso, introducción ni textos de otro caso. | Alta | J §3 ptos 1-2; §6 Done |
| SIEP-RN-J-02 | Ética | El aviso de contenido sensible debe mostrarse antes de cualquier narrativa, audio o mundo, con texto neutral de 60 palabras o menos y sin detalle gráfico. | Alta | J §5 hoja 2, §8 «Consentimiento» |
| SIEP-RN-J-03 | Ética | No se inventan recursos de apoyo ni contenido clínico: lo no verificado se declara «pendiente», y ningún caso se publica sin revisión de una persona experta distinta de la autora. | Alta | J §1, §5 hoja 12, §8; J-P3, J-P4 |
| SIEP-RN-J-04 | Ética | No se escenifican hechos violentos ni se reconstruyen relatos de agresión; las personas ausentes no aparecen como figuras, y la sobreviviente de `SIM-VBG-001` no se reutiliza sin decisión explícita (J-P5). | Alta | J §8 «No revictimizar»; RN-01 |
| SIEP-RN-J-05 | Ética | Por defecto, las personas menores solo se mencionan y la persona agresora no aparece; su presencia en escena exige decisión de Psicología, revisión reforzada y sin preguntas clínicas directas a menores. | Alta | J §8 «hogar y menores»; J-P6, J-P7 |
| SIEP-RN-J-06 | Evaluación | Ni los diálogos de ambiente ni los mensajes de evidencia faltante pueden insinuar la opción adecuada, y el cliente no debe recibir la clasificación ni la conducta prohibida antes de decidir. Estado: lo último ya se cumple en `master` (nota de vigencia); queda la revisión de ambiente y evidencia. | Alta | J §8 «No revelar»; J-P23; RN-08 |
| SIEP-RN-J-07 | Seguridad del estudiante | La salida segura debe estar al alcance en todo el caso 2, y su cumplimiento se prueba con la pausa y reanudación e2e, no con la presencia de un objeto de salida. Una escena exige salida segura obligatoria solo si Psicología lo decide. | Alta | J §8 «Salida segura»; J-P14; SIEP-RN-01 |
| SIEP-RN-J-08 | Retroalimentación | Se conserva la segunda oportunidad tras una respuesta riesgosa o inadecuada, y la retroalimentación debe sostener un segundo intento sin humillar. Es excepción documentada a RN-08. | Alta | J §5 hoja 6 nota; J-P12; decisión 10; SIEP-RN-07 |
| SIEP-RN-J-09 | Evaluación | Los finales y la valoración del caso 2 son formativos: sin nota oficial 0,0 a 5,0 y sin lenguaje de victoria o derrota sobre el sufrimiento; cada final se expresa en texto, no solo en color. | Alta | J §8; base común §6; RN-09; decisión 9 |

## 6. Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados |
|---|---|---|---|---|
| SIEP-CU-J-01 | Jugar el caso de consultorio | Estudiante | Aceptar el aviso, leer la introducción, recorrer las escenas y decidir hasta un final. | SIEP-RF-J-03, J-04, J-05, J-07; RF-17 |
| SIEP-CU-J-02 | Pausar y reanudar el caso nuevo | Estudiante | Salir de forma segura en cualquier escena y retomar el mismo intento. | SIEP-RN-J-07; RF-19 |
| SIEP-CU-J-03 | Ver cierre propio del caso | Estudiante | Consultar el final, las métricas y la retroalimentación del caso 2. | SIEP-RF-J-01, J-02; RF-23, RF-24 |
| SIEP-CU-J-04 | Redactar y entregar el caso | Psicología (autora) | Completar las hojas 0 a 11 de la plantilla y entregarlas a revisión. | SIEP-RF-J-07, J-08 |
| SIEP-CU-J-05 | Revisar y publicar el caso | Administrador y persona experta | Revisar con acta, completar la lista de verificación y publicar. | SIEP-RF-J-09; RF-12, RF-13 |
| SIEP-CU-J-06 | Asignar el caso a un grupo | Profesor | Habilitar el caso 2 para un grupo. | SIEP-RF-J-05; RF-14 |
| SIEP-CU-J-07 | Valorar con rúbrica propia | Profesor | Revisar el recorrido y valorar los criterios del caso 2. | SIEP-RF-J-08; RF-22, RF-25 |

## 7. Criterios de aceptación

| ID | Criterio (Dado / Cuando / Entonces) | Cómo se prueba |
|---|---|---|
| SIEP-RF-J-01 | Dado un intento completado del caso 2, cuando se resuelve el final, entonces el final pertenece al paquete del caso 2 y ninguna métrica del caso VBG aparece. Dado un caso sin paquete, cuando se completa, entonces no se muestra final ajeno. | Prueba automática (backend) |
| SIEP-RF-J-02 | Dado un intento completado del caso 2, cuando se abre el cierre, entonces cada métrica se rotula con el nombre definido en la hoja 9. | Spec del cierre y e2e |
| SIEP-RF-J-03 | Dado un estudiante que abre el caso 2, cuando carga la página, entonces ve el aviso del caso antes de cualquier narrativa o audio y no hay texto de violencia de género salvo que lo diga el caso. Dado que faltan recursos verificados, entonces el aviso lo declara «pendiente». | E2e; revisión de experto del texto |
| SIEP-RF-J-04 | Dado el caso 2, cuando el estudiante acepta el aviso, entonces ve contexto, personas y objetivos del caso 2 y no los 6 párrafos del caso VBG. | E2e |
| SIEP-RF-J-05 | Dado un estudiante cuyo grupo no tiene asignado el caso 2, cuando lo inicia, entonces el servidor lo rechaza y el catálogo no lo lista. | Prueba automática (backend) y e2e |
| SIEP-RF-J-06 | Dado un nodo o persona del caso 2 sin entrada en un registro, cuando se juega, entonces degrada a valor neutro sin error de consola. | Spec del frontend |
| SIEP-RF-J-07 | Dado la hoja de la plantilla completa, cuando se carga el caso, entonces tiene objetivo, 3 a 5 competencias, 3 opciones por decisión con clasificación y retroalimentación, y 3 a 4 finales. | Prueba automática de semilla; revisión de experto |
| SIEP-RF-J-08 | Dado la rúbrica del caso 2 activa, cuando el profesor valora un intento, entonces cada criterio muestra su evidencia observable y el total se rotula «formativo». | E2e; revisión de experto |
| SIEP-RF-J-09 | Dado el caso 2 en borrador con lista de verificación al 100 % y acta, cuando se publica, entonces queda `PUBLISHED` y los intentos existentes no cambian. Dado una validación con errores, entonces no se publica. | Prueba automática (backend) |
| SIEP-RN-J-01 | Dado un intento del caso 2 y otro del caso VBG, cuando se comparan sus pantallas y datos de cierre, entonces ninguno contiene textos del otro. | Prueba automática y e2e |
| SIEP-RN-J-02 | Dado el aviso del caso 2, cuando se mide, entonces tiene 60 palabras o menos y no contiene descripción gráfica. | Revisión de experto |
| SIEP-RN-J-03 | Dado un recurso de apoyo sin verificar, cuando se publica, entonces figura «pendiente»; dado un caso sin acta de persona experta distinta de la autora, entonces no se publica. | Revisión de experto; prueba automática del checklist |
| SIEP-RN-J-04 | Dado el contenido del caso 2, cuando lo revisa la persona experta, entonces no hay escenas de agresión ni relato de hechos violentos y la sobreviviente del caso VBG no aparece. | Revisión de experto |
| SIEP-RN-J-05 | Dado el caso 2 con persona menor o agresora en escena, cuando se revisa, entonces existe decisión escrita de Psicología y revisión reforzada; sin ella, solo aparecen mencionadas. | Revisión de experto |
| SIEP-RN-J-06 | Dado una respuesta de `decision_option_state` antes de decidir, cuando se inspecciona, entonces no contiene `classification` ni `prohibitedConduct`; los mensajes de evidencia no nombran la opción. | Prueba automática (API); revisión de experto |
| SIEP-RN-J-07 | Dado el caso 2 en cualquier escena, cuando el estudiante pausa y reanuda, entonces el intento conserva nodo y métricas con el mismo identificador. | E2e |
| SIEP-RN-J-08 | Dado una primera respuesta riesgosa, cuando se elige, entonces no se aplica ni avanza y la retroalimentación permite un segundo intento sin juicio de valor. | Prueba automática; revisión de experto |
| SIEP-RN-J-09 | Dado el cierre del caso 2, cuando se revisa, entonces no hay nota 0,0 a 5,0 y cada final se comunica en texto. | Spec y revisión de experto |

## 8. Riesgos éticos y de privacidad

| Riesgo | Mitigación | Requisito que la implementa |
|---|---|---|
| Aviso, finales o métricas del caso VBG se muestran en el caso 2 y alteran la experiencia | Paquete y aviso por caso; sin paquete no hay final | SIEP-RF-J-01, J-03, SIEP-RN-J-01 |
| Recursos de apoyo inventados o desactualizados | Declararlos «pendientes» hasta verificación con fecha | SIEP-RN-J-03, SIEP-RF-J-03 |
| Revictimizar a estudiantes con vivencias propias o reutilizar a la sobreviviente | No escenificar agresión; personas ausentes sin figura; caso independiente por defecto | SIEP-RN-J-04 |
| Exposición de menores o de la persona agresora | Solo mencionados por defecto; revisión reforzada si aparecen | SIEP-RN-J-05 |
| La clasificación de la opción llega al cliente antes de decidir | Ya no se envía en `decision_option_state`; revisar mensajes de evidencia y ambiente | SIEP-RN-J-06 |
| Salida segura declarada pero no probada (validación `NO_SAFE_EXIT` cumple con cualquier puerta) | Prueba e2e de pausa y reanudación | SIEP-RN-J-07, SIEP-RNF-J-07 |
| Regresión sobre el caso vigente al generalizar | Pruebas y e2e actuales sin cambio | SIEP-RNF-J-01 |
| Semilla que reescribe la versión publicada y borra intentos | Crear en borrador, publicar con el servicio, sin borrar intentos | SIEP-RNF-J-04, SIEP-RF-J-09 |
| Contenido del caso enviado a un proveedor de IA | Sin envío salvo decisión expresa | SIEP-RNF-J-05 |

## 9. Dependencias y orden

- **Fase 0 compartida:** el bloque no pertenece a la familia C, E, F y no la necesita. Solo cita la regla **0e** (ningún atajo nuevo de una sola tecla sin revisar WCAG 2.1.4) para SIEP-RNF-J-02 y **0a** (movimiento reducido en el panel de diálogo) para el mismo requisito.
- **Orden interno (J §6):** E1 (SIEP-RF-J-01, J-02, J-03, J-04, J-05, J-06) arranca ya y corre en paralelo con la redacción; E2 espera a las hojas 3 a 6 aprobadas; Arte arranca con las hojas 3 y 4; SIEP-RF-J-08 y J-09 esperan a la revisión experta.
- **Otros bloques:** bloque G (la IA no debe recibir datos del caso, SIEP-RNF-J-05); bloques C y F reutilizan el aviso y los finales generalizados, por lo que J-01 y J-03 conviene que lleguen antes; bloque E y F usan el mismo escritor con bloqueo (0c) sobre el estado del caso.
- **Decisiones del contraste que la condicionan:** 3 (rol de autoría, ROL), 8 (alcance del DSL, DSL), 9 (rúbrica 1 a 5 como valoración formativa), 10 (segunda oportunidad), 16 (quién redacta objetivos de aprendizaje), 17 (texto oficial del aviso), 19 (WCAG 2.1 o 2.2).
- **Dependencias externas al repositorio:** lo del DSL vive en la rama `docs/documento-maestro-unificado` (carpeta `docs/diseno/dsl`); no se edita.

## 10. Decisiones que bloquean

| ID original | Pregunta cerrada | Valor por defecto | Qué desbloquea | Quién decide |
|---|---|---|---|---|
| J-P1 | ¿El primer escenario es A (consultorio de primera escucha), B (hogar) o C (seguimiento)? | A | Especificación (E0) y todo el contenido | Psicología |
| J-P15 | ¿Los efectos y finales del caso 2 viven en código por caso (sin esquema) o en BD? | Código por caso | SIEP-RF-J-01, J-02 (E1) | Ingeniería |
| J-P3 | ¿Quién redacta, quién revisa como experta distinta de la autora y para cuándo? | Docente de Psicología escribe; experta externa revisa | Fecha de entrega, SIEP-RF-J-09 | Psicología |
| J-P4 | ¿Qué dice el aviso y qué recursos de apoyo están verificados? | Texto neutral y sin recursos hasta verificar | SIEP-RF-J-03, publicar | Psicología |
| J-P22 | ¿Quién tiene rol ADMIN y quién publica? (decisión 3 del contraste: ¿el profesor autora?) | Ingeniería publica tras el acta | SIEP-RF-J-09 | Equipo y Psicología |
| J-P16 | ¿El primer caso nuevo es una semilla por comando y no authored en el editor (que no exporta)? | Sí | SIEP-RF-J-07, J-09 | Ingeniería |
| J-P23 | ¿Se corrige antes el envío de `classification` y `prohibitedConduct` antes de decidir? | Ya resuelto en `master` para `decision_option_state` (nota de vigencia); falta revisar ambiente y evidencia faltante | SIEP-RN-J-06 | Ingeniería |
| J-P24 | ¿El catálogo filtra por grupo asignado? | Sí | SIEP-RF-J-05 | Ingeniería |
| Decisión 8 | ¿Alcance del DSL: formato de intercambio y validador, sin reemplazar la BD? | Sí | Marcas DSL de SIEP-RF-J-07 y J-09 | Equipo (taller de DSL) |
| Decisión 9 | ¿Un total de rúbrica 1 a 5 se admite como valoración formativa (RN-09)? | Sí, rotulado formativo y no visible al estudiante | SIEP-RF-J-08, SIEP-RN-J-09 | Psicología |

## 11. Preguntas cerradas para Psicología

1. ¿El caso 2 entrena como competencias principales el encuadre, la confidencialidad, la entrevista inicial y la derivación (opción A), o prioriza alguna competencia que solo se entrena en domicilio (opción B)?
2. ¿El caso es independiente de `SIM-VBG-001` (sí) o continúa a una de sus personas (no)?
3. ¿Aparecen personas menores de edad en escena (A), solo mencionadas (B) o ausentes (C)?
4. ¿Aparece la persona agresora en pantalla (sí o no)?
5. ¿Se juega después de `SIM-VBG-001` (A), antes (B) o en cualquier orden (C)?
6. ¿Las métricas son las 7 actuales (A) o un conjunto propio de 3 a 5 con nombres de Psicología (B)?
7. ¿Hay opciones de conducta prohibida (sí o no), y a lo sumo una por decisión?
8. ¿Se reutilizan las 5 herramientas clínicas actuales (A), solo las pertinentes y la bitácora (B) o herramientas nuevas (C)?
9. ¿Se mantiene la segunda oportunidad tras una respuesta riesgosa o inadecuada (sí o no)?
10. ¿Alguna escena exige salida segura obligatoria (sí, cuál; o no)?
11. ¿El total de rúbrica 1 a 5 del docente se admite como valoración formativa no visible al estudiante (sí o no)?
12. ¿El aviso del caso conserva la expresión «fines educativos, no diagnóstico» del texto oficial validado (sí o no)?
