# Conflictos, brechas y decisiones: línea base PN3 ↔ SIEP

> Síntesis del contraste de los 60 ítems de la línea base (detalle en [`matriz-cumplimiento.md`](matriz-cumplimiento.md) y [`detalle-por-requisito.md`](detalle-por-requisito.md)). Evaluación: 2026-10-10; redacción: 2026-10-11. Todo lo que aquí se afirma sale de leer el código de `master`; nada se ejecutó. Los valores por defecto de las decisiones son **supuestos de trabajo para que el usuario los revise**, no decisiones tomadas por el equipo.

> **Actualización (2026-10-11, tras la ola 0):** las filas 0.1 a 0.4 y los defectos D-1 a D-4 ya tienen su PR (#64 a #67): ver «Estado de la ola 0» en la sección 2 y «Corregidos» en la sección 3. Los 14 ítems que esos PR tocan se **re-midieron** sobre `master` de430a7 (ver «Re-mediciones» en la matriz): RF-15 pasó de conflicto a parcial y RN-02 de parcial a cumple. Lo que sigue en este documento conserva el texto de la medición original salvo donde lo indica.

**Lectura rápida (tras la re-medición).** 15 ítems cumplen, 38 cumplen en parte, 1 no se cumple, 4 están en conflicto y 2 no se pueden verificar leyendo código (antes: 14, 38, 1, 5 y 2). Casi todo lo «parcial» se explica por cuatro causas: (1) el actor —la línea base dice «profesor» y SIEP deja autorar y publicar solo al administrador—, (2) el DSL existe como diseño pero no está integrado y no hay validación al ejecutar, (3) la retroalimentación pedagógica llega en el momento y no al final, (4) faltan pistas, fechas y asignación individual. Lo que más urgía fuera de la línea base (acceso a datos de otros docentes y un guardado de nodo que borraba datos) ya está corregido; quedan los defectos de la sección 3.

---

## 1. Conflictos (4 vigentes y 1 resuelto)

Un conflicto es una cláusula que el sistema contradice activamente. Cada uno trae el texto, lo que hace SIEP, las opciones y una recomendación.

### 1.1 RN-07 · No iniciar otro intento con uno en curso — esfuerzo S, sin esquema

- **Texto:** «podrá repetir una simulación cuando haya terminado la anterior […] no podrá iniciar otro si todavía tiene uno en progreso».
- **Qué hace SIEP:** `start_attempt(..., force_new=False)` devuelve el intento abierto, pero con `forceNew=true` cierra **todos** los intentos abiertos (en progreso y en pausa) de ese estudiante en esa versión como `REPLACED` y crea otro (`backend_django/apps/simulation/services/game_service.py:142-202`). La bandera la controla el cliente y la tarjeta «Continuar simulación formativa» ofrece «Iniciar nuevo intento» sin confirmación. Hay pruebas que fijan este comportamiento.
- **Lo que sí cumple:** RN-06. Nada se sobrescribe ni se borra: el intento reemplazado se conserva con su estado `REPLACED` y no puntúa.
- **Consecuencia:** un estudiante puede abandonar a mitad un caso sensible y recomenzar sin cierre ni acompañamiento.

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **a. Estricta** (valor por defecto) | Sin `forceNew` desde el estudiante: debe continuar, pausar o terminar; `REPLACED` solo por acción docente | S | Estudiantes que quieren recomenzar necesitan al docente; hay que cambiar las pruebas que fijan el comportamiento actual |
| b. Cierre explícito | Una acción «Abandonar intento» del estudiante y luego inicio; nunca hay dos abiertos | S–M | Mantiene un camino de abandono que la línea base no menciona |
| c. Mantener | Pedir a la carrera que RN-07 admita «abandonar» | — | No conformidad con una regla de prioridad media |

**Recomendación:** (a), como en el prompt (§8 #2). Si la experiencia de uso lo pide, (b) es el paso intermedio.

### 1.2 RN-08 · Consecuencia en el momento, retroalimentación pedagógica al terminar — esfuerzo M, sin esquema

- **Texto:** «La consecuencia de una decisión se mostrará en el momento […]. La retroalimentación pedagógica se mostrará al terminar el intento». Observación: «se separa consecuencia narrativa de retroalimentación pedagógica».
- **Qué hace SIEP:** tras cada decisión devuelve de inmediato la clasificación («Decisión adecuada / con riesgo / inadecuada») y la explicación autorada (`decision_effects.py:72-80`, `game_service.py:393` y `421-422`), que el cliente muestra en «Supervisión clínica». El reporte final no trae la explicación por decisión (`serializers/game_dtos.py:154-180`), así que tampoco está al final. No hay campo ni DTO para la consecuencia narrativa: lo único narrativo es el texto del nodo destino.
- **Agravante:** la regla de la segunda oportunidad (`game_service.py:361-384`) avisa a mitad del intento que la respuesta fue riesgosa o inadecuada y retiene la consecuencia.
- **Resolución del contraste:** un lente propuso «parcial» (la regla no prohíbe mostrar antes); se mantuvo «conflicto» porque la cláusula «al terminar» no se cumple en ningún camino y el sistema hace lo contrario de la separación que la regla busca.

**Recomendación:** (§8 #6) dejar de devolver en la respuesta de la decisión la clasificación, la conducta prohibida, los deltas y el mensaje evaluativo; mostrar solo la consecuencia narrativa; añadir `decisionReview[]` al reporte final con la explicación autorada y su fundamento. Decidir aparte qué pasa con la segunda oportunidad (decisión 10).

### 1.3 RN-09 · Valoración formativa, sin nota oficial 0,0–5,0 — esfuerzo S, sin esquema

- **Texto:** «el simulador hará una valoración formativa con criterios o rúbrica, pero no generará una nota oficial de 0,0 a 5,0»; observación: «la calificación numérica podrá evaluarse en una fase posterior».
- **Qué hace SIEP:** valida cada criterio entre 1.0 y 5.0, calcula un total ponderado con dos decimales y lo guarda como `total_score` (`backend_django/apps/simulation/services/rubric_service.py:418-429`). Solo lo ve el docente. Además existe un puntaje acumulado sin tope («Puntaje», «pts»), visible para el estudiante.
- **Es un conflicto de interpretación:** nada se declara «oficial» ni sale en reportes, pero es una calificación numérica en la escala que la observación difiere a una fase posterior. Un lente lo bajó a «parcial».

| Opción | Qué implica | Costo |
|---|---|---|
| **a. Aceptar como formativo** (valor por defecto) | Rotularlo «Total ponderado (formativo)», no mostrarlo al estudiante, documentarlo y confirmarlo con los docentes | S |
| b. Niveles cualitativos | Sustituir el total numérico por niveles por criterio (p. ej. «requiere refuerzo / logrado») | M |
| c. Ocultar el total | Seguir guardando por criterio, sin total ni escala | S |

**Pregunta abierta para Psicología:** si el copy «puntaje / pts» puede leerse como nota (ya registrada en el informe de jugabilidad, pregunta 6).

### 1.4 RN-10 · Solo el administrador crea cuentas — esfuerzo M, sin esquema

- **Texto:** «El administrador será quien cree y administre las cuentas de usuario […]. El profesor administrará sus grupos, pero no las cuentas globales».
- **Qué hace SIEP:** la importación de estudiantes por `.xlsx` del docente (`backend_django/apps/grupos/services.py:422-465`) crea cuentas globales y le entrega al docente la contraseña (la de la fila o una compartida de la configuración). Quien conozca esa contraseña entra como cualquiera de esos estudiantes. Es la misma contraseña por defecto de RNF-01.
- **Lo que sí cumple:** RF-04 (agregar estudiantes ya registrados) y CU-03.

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| a. Letra de la regla | Importar solo vincula estudiantes ya registrados; los correos nuevos quedan como solicitud de acceso para el administrador | M | El docente pierde la carga masiva autónoma |
| **b. Cuentas pendientes de activación** (valor por defecto) | Se conserva la importación, pero las cuentas nacen inactivas y las activa el administrador (sin cambio de esquema: `activo` ya existe) | M | Hay una cola de aprobación que atender |
| c. Pedir a la carrera que RN-10/RF-04 admitan el alta por el docente | Sin cambio | — | No conformidad |

**Recomendación:** (b), como en el prompt (§8 #4), y retirar la contraseña compartida (cada cuenta nace con contraseña temporal propia o con enlace de activación).

### 1.5 RF-15 · El estudiante ve únicamente los casos habilitados — esfuerzo S, sin esquema — **resuelto en [#66](https://github.com/Jsua3/psico_project_v2/pull/66) (opción a)**

> **Resuelto (2026-10-11).** `build_catalog` ya filtra por asignación para el estudiante y calcula el desbloqueo solo entre los asignados (`backend_django/apps/progression/catalog.py:14-18`). RF-15 queda **parcial**: falta lo de RF-14 (fechas y asignación individual) y, para RN-04, cortar la reanudación de un intento tras perder la asignación. El texto de abajo es el de la medición original.

- **Texto:** «El estudiante debe poder ver únicamente los casos que tenga habilitados para participar» (y RN-04: «solo podrá entrar a los casos que tenga habilitados o asignados»).
- **Qué hace SIEP:** hay dos catálogos con criterios distintos. `GET /api/simulation/cases` filtra por asignación; `GET /api/simulation/catalog` (el lobby `/portal/jugar`) **no** filtra: pinta una puerta por cada caso publicado, con título y descripción, y entrar acaba en 403 de `start_attempt`. El desbloqueo lineal («completa el anterior») se calcula sobre todos los publicados (`backend_django/apps/progression/catalog.py:13,18`).
- **Efecto:** un estudiante asignado solo al caso 2 queda bloqueado en el lobby, y ve casos que no le corresponden.

| Opción | Qué implica | Costo |
|---|---|---|
| **a. Filtrar** (recomendada) | `build_catalog` para el rol ESTUDIANTE usa la misma función de asignación que `list_published_cases` y calcula el desbloqueo solo entre los asignados | S |
| b. Retirar el lobby | Eliminar `/portal/jugar` y su desbloqueo lineal (no están en la línea base) | S |

**Depende de:** qué significa «habilitado» una vez que RF-14 tenga fechas y asignación individual.

---

## 2. Brechas ordenadas y orden de ejecución sugerido

Prioridad = impacto sobre la línea base, riesgo de datos y esfuerzo; el orden respeta dependencias. «BD» marca los cambios que tocan el esquema: van por `deploy/upgrades/*.sql` + volcado + prueba de contrato (nunca triviales; se deciden con el usuario).

| Ola | # | Cambio | Ítems de la línea base | Esf. | BD | Decisión previa |
|---|---|---|---|---|---|---|
| **0 — sin decisión de producto** | 0.1 | Alcance por docente en reportes, dashboard y `student-report` | RF-25, RF-26, CU-14, CU-15 | S | no | ninguna (defecto de acceso a datos, sección 3) |
| | 0.2 | El guardado de un nodo no debe vaciar `requiredTools` ni `supportResources` | RF-11, CU-04 | S | no | ninguna |
| | 0.3 | Filtrar el catálogo del lobby por asignación | RF-15, RN-04, CU-07 | S | no | ninguna (opción a de 1.5) |
| | 0.4 | Reglas estructurales faltantes en la validación (nodo sin mapa, nodo no terminal sin opciones, nodo inalcanzable, decisión de otra versión) y compuerta única `ensure_publishable` también en la siembra | RF-12, RN-02, RN-05, CU-05, CU-08 | M | no | ninguna |
| **1 — comportamiento del intento** | 1.1 | `forceNew` ya no cierra intentos abiertos desde el estudiante | RN-07 | S | no | #2 |
| | 1.2 | Retroalimentación pedagógica al final (`decisionReview[]`) y solo consecuencia en el momento | RN-08, RF-10, RF-23, CU-13 | M | no | #6, 10 |
| | 1.3 | Rotular/limitar el total de rúbrica | RN-09 | S | no | 9 |
| | 1.4 | Congelar el reporte de cierre al completar | RF-22, CU-12 | M | no | 15 |
| **2 — roles** | 2.1 | Autoría por el profesor con propiedad (`created_by`) y publicación por el administrador | RF-02, RF-05..RF-09, CU-01, CU-04, CU-05 | M | no | #3 |
| | 2.2 | Operación «archivar» (y qué pasa con intentos en curso) | RF-13 | M | no | 11 |
| | 2.3 | Importación sin cuentas activas ni contraseña compartida | RN-10, RNF-01 | M | no | #4 |
| **3 — esquema** | 3.1 | Fechas de apertura y cierre por grupo; asignación individual | RF-14, CU-06 | M | sí | #5, 12 |
| | 3.2 | Fundamento teórico por opción; pistas por escena u opción | RF-10, RF-11, RF-18, CU-09 | L / M | sí | 13 y propuesta G |
| | 3.3 | Objetivos de aprendizaje y vista previa del caso sin crear intento | RF-16, CU-07 | M | sí | 16 |
| **4 — DSL** | 4.1 | DSL con JSON Schema, importación/exportación de casos y validación al ejecutar | RF-12, RN-05, RNF-07 | L–XL | no | #8, Frente 0 |
| **5 — calidad** | 5.1 | HTTPS forzado y HSTS | RNF-02 | S | no | 18 |
| | 5.2 | Atajos de una tecla y contraste del login | RNF-04 | M | no | 19 |
| | 5.3 | Medición de rendimiento y de disponibilidad (script de carga, `/api/health`, monitor) | RNF-05, RNF-06 | M | no | 20 |
| | 5.4 | Cerrojos y escrituras atómicas; bloqueo optimista real | RNF-08 | M | no | — |
| | 5.5 | Unificar el tiempo (reloj o activo) | RF-21 | S | no | 14 |
| | 5.6 | Aviso de alcance único en login, aviso previo y resultado | RN-01 | S | no | 17 |

Notas de orden: la ola 0 se puede ejecutar ya y en paralelo; la 1 espera #2 y #6; la 2.1 desbloquea el segundo caso (propuesta J) y la 3.2 comparte decisión con la propuesta G (asistente y ayuda).

**Estado de la ola 0 (2026-10-11).** Las cuatro filas se hicieron con la prueba primero, cada una en su PR y sin tocar el esquema: 0.1 → [#64](https://github.com/Jsua3/psico_project_v2/pull/64), 0.2 → [#65](https://github.com/Jsua3/psico_project_v2/pull/65), 0.3 → [#66](https://github.com/Jsua3/psico_project_v2/pull/66) y 0.4 → [#67](https://github.com/Jsua3/psico_project_v2/pull/67). La 0.4 quedó **a medias a propósito**: se añadieron las reglas estructurales a la validación de publicación (`NODE_WITHOUT_OPTIONS`, `NODE_WITHOUT_MAP`, `DECISION_NODE_NOT_IN_CASE`, `UNREACHABLE_NODE`) y el guardián «una decisión solo une nodos de su versión», pero la siembra (`seed_caso_pdf`, `bootstrap_dev_db`) sigue escribiendo `PUBLISHED` sin pasar por la compuerta. El caso sembrado trae además un nodo huérfano (`comisaria-recepcion`, sin opciones y sin entradas): por eso «sin opciones» solo es error en nodos alcanzables y el huérfano sale como advertencia `UNREACHABLE_NODE`. Los 14 ítems de la línea base que estos PR tocan se **re-midieron** sobre `master` de430a7 (sección «Re-mediciones» de la matriz); los otros 46 conservan la medición original, cuyas citas `ruta:línea` son del árbol evaluado el 10 de octubre.

---

## 3. Defectos hallados fuera de la línea base

Estado: **verificado** = leído en el código por quien redactó este documento; **verificado (revisor independiente)** = lo halló un revisor que leyó el código sin conocer las conclusiones previas y se releyó después; **reportado** = lo señaló un evaluador con evidencia, sin releer.

| # | Defecto | Dónde | Estado |
|---|---|---|---|
| D-1 | **El reporte de grupo no comprueba que el grupo sea del profesor**: `generar_reporte_grupo` busca el grupo por clave y no compara `profesor_id`; las vistas solo exigen `IsProfesorOrAdmin`. Cualquier docente lee (y exporta en CSV) cualquier grupo. | `backend_django/apps/reportes/services.py:155-168`; `views.py:28-46` | verificado |
| D-2 | **El dashboard lista nombres y puntajes de los últimos 10 intentos de todo el sistema**, sin acotar a los grupos del docente. | `backend_django/apps/reportes/services.py:90-151` | verificado |
| D-3 | **`student-report` permite a cualquier docente o administrador leer el reporte de cualquier intento por su identificador**; el filtro por grupo solo existe en `/api/instructor/*`. | `backend_django/apps/simulation/services/game_service.py:313-326` | verificado |
| D-4 | **Guardar un nodo desde el editor de casos vacía `requiredTools` y `supportResources`**: el formulario envía siempre listas vacías y el servidor las escribe sin condición. Pérdida silenciosa de datos al editar una versión clonada. | `frontend/src/app/features/simulator/case-editor.component.ts:914`; `backend_django/apps/simulation/services/authoring/graph.py:48-49` | verificado |
| D-5 | **Credenciales demo y contraseña por defecto en claro**: las tres cuentas demo son literales en el bundle del cliente y la contraseña por defecto de los importados es un literal con valor de respaldo, visible para el docente. | `frontend/src/app/features/login/login-role.config.ts:32,47,62`; `backend_django/psychosim/settings/base.py:122-123` | verificado |
| D-6 | El administrador puede desactivarse o quitarse el rol a sí mismo, o dejar el sistema sin administradores activos. | `backend_django/apps/users/views.py:212-231` | reportado |
| D-7 | Cerrar sesión solo borra el token del navegador: el JWT (8 h) sigue válido; sin revocación ni límite de intentos de acceso. | `frontend/src/app/core/auth/auth.service.ts:64-80`; `settings/base.py:90-104` | reportado |
| D-8 | La exportación CSV no escapa comas ni comillas y un nombre que empiece por `=`, `+`, `-` o `@` es inyección de fórmula en hojas de cálculo. | `backend_django/apps/reportes/services.py:288-300` | reportado |
| D-9 | Borrar un nodo con decisiones entrantes probablemente falla con error de integridad (500): la FK no tiene `ON DELETE`. | `backend_django/apps/simulation/services/authoring/graph.py:37-41` | reportado |
| D-10 | La siembra `seed_caso_pdf` borra los intentos de la versión que resiembra: solo la invocan comandos de desarrollo, pero rompe REGLA-005 y RN-06 si se corriera en producción. | `backend_django/apps/simulation/management/commands/seed_caso_pdf.py:1144-1176` | reportado |
| D-11 | **Los GET de juego no acotan al profesor por grupo**: `_require_attempt` autoriza a cualquier PROFESOR o ADMIN sobre un intento si presenta su token, sin comprobar que el estudiante sea de uno de sus grupos. Al PROFESOR le llegan cuatro GET (intento, reporte de cierre, mapa de progreso y mundo); las escrituras de juego son de ESTUDIANTE o ADMIN. Mitigante: el token (256 bits) solo se entrega al dueño, en la base solo hay su hash y las pantallas del docente no lo exponen. Defensa en profundidad pendiente. | `backend_django/apps/simulation/services/game_service.py:68-84`; `backend_django/apps/simulation/views/game_views.py:61,70,93,156` | verificado (revisor independiente, 2026-10-11) |
| D-12 | **Referencias del editor de escenas sin acotar a la versión:** `create_map` y `update_map` buscan el nodo por clave primaria global (un borrador puede colgar un mapa de un nodo de una versión **publicada**, contra REGLA-005), `create_dialogue` toma cualquier `mapObjectId`, el enlace de un objeto con una decisión (`decisionOptionId`) no se acota a la versión y se ignora en silencio si no existe, y `tool_code` nunca se coteja con el catálogo de herramientas. La validación de publicación no tiene regla equivalente a `DECISION_NODE_NOT_IN_CASE` para mapas, objetos ni diálogos. Solo alcanzable por la API de autoría (ADMIN). | `backend_django/apps/simulation/services/authoring/scenes.py:32,46,121-125,136-137`; `backend_django/apps/simulation/services/authoring/world_definition.py:203-208` | verificado (revisor independiente, 2026-10-11) |
| D-13 | El reporte de grupo y su CSV solo comprueban `profesor_id`, no que el grupo esté activo, a diferencia del alcance del tablero. Hoy es latente: ningún código marca `activo = FALSE` (eliminar borra el grupo). Menor. | `backend_django/apps/reportes/services.py:164-180`; `backend_django/apps/simulation/services/instructor_scope.py:16-26` | verificado (revisor independiente, 2026-10-11) |
| D-14 | **El alcance docente es de autoservicio:** cualquier PROFESOR agrega por correo a cualquier ESTUDIANTE registrado a su grupo (y la importación masiva también) sin que el estudiante lo acepte ni el administrador lo apruebe; desde ese momento lee su traza con la bitácora reflexiva descifrada. Los mensajes 404 y 400 de agregar permiten además enumerar cuentas. Es lo que RF-04 pide («estudiantes que ya estén registrados»), pero es una decisión de privacidad que no se tomó (decisión 22). | `backend_django/apps/grupos/services.py:545-558,399-455`; `backend_django/apps/simulation/services/instructor_service.py:112-120` | verificado (revisor independiente, 2026-10-11) |
| D-15 | **Un nodo final sin mapa pasa la validación y rompe la traza del docente:** `NODE_WITHOUT_MAP` exime a los nodos finales (#67), pero `world_for_attempt` exige mapa para el nodo actual, así que la traza de todo intento que termina en ese nodo (y `GET /world`) responde 404. Acción mínima: exigir mapa también a los finales, o que `trace` tolere la ausencia. | `backend_django/apps/simulation/services/world_validation.py:133-147`; `backend_django/apps/simulation/services/world_service.py:466-469`; `backend_django/apps/simulation/services/instructor_service.py:111` | verificado (revisor independiente, releído) |
| D-16 | **Lecturas que escriben:** `GET /world` y la traza del docente llaman a `require_world_state`, que re-sincroniza y guarda el estado del mundo del intento (posición y sala) si el nodo cambió. | `backend_django/apps/simulation/services/world_service.py:466-493`; `backend_django/apps/simulation/services/instructor_service.py:111` | verificado (revisor independiente, 2026-10-11) |
| D-17 | **Las rúbricas son globales:** cualquier PROFESOR edita, activa, fija como predeterminada o reasigna rúbricas a cualquier versión de caso; no hay propiedad. | `backend_django/apps/simulation/services/rubric_service.py:197-294`; `backend_django/apps/simulation/views/rubric_views.py:11-66` | reportado (revisor independiente, sin releer) |

D-1 a D-4 no dependen de ninguna decisión de producto y son los primeros candidatos de la ola 0.

**Corregidos (2026-10-11):** D-1, D-2 y D-3 en [#64](https://github.com/Jsua3/psico_project_v2/pull/64) (alcance por docente: el nuevo módulo `apps/simulation/services/instructor_scope.py` calcula los estudiantes de cada docente y el ADMIN sigue viendo todo); D-4 en [#65](https://github.com/Jsua3/psico_project_v2/pull/65) (guardar un nodo conserva sus herramientas y apoyos si el formulario no los trae). Las referencias `ruta:línea` de D-1 a D-4 describen el código **anterior** a esas correcciones: se ven con `git show 700904f:<ruta>`.

---

## 4. Decisiones que debe tomar una persona

Cada una con pregunta cerrada y valor por defecto recomendado. Las ocho primeras son las del prompt (§8); el resto sale de este contraste. «Estado» indica si el valor por defecto ya se usó como supuesto en estos documentos.

| # | Pregunta cerrada | Valor por defecto | Desbloquea | Estado |
|---|---|---|---|---|
| 1 | ¿Las extensiones propias llevan IDs `SIEP-RF/RNF/RN/CU-nn` y la línea base queda intacta? | Sí | Catálogo y propuestas | supuesto adoptado |
| 2 | ¿Se elimina `forceNew` del estudiante (RN-07)? | Sí: debe continuar, pausar o terminar; `REPLACED` solo por acción docente | 1.1 | abierta |
| 3 | ¿El profesor autora casos (RF-05..RF-11)? | Sí, con publicación por el administrador como revisor | 2.1, propuesta J | abierta |
| 4 | ¿Se mantiene la importación de estudiantes (RN-10)? | Sí, con cuentas pendientes de activación que aprueba el administrador | 2.3 | abierta |
| 5 | ¿Fechas de apertura y cierre primero por grupo y asignación individual después (RF-14)? | Sí | 3.1 | abierta |
| 6 | ¿Se oculta la retroalimentación pedagógica hasta el cierre (RN-08)? | Sí: en el momento solo la consecuencia narrativa | 1.2 | abierta |
| 7 | ¿El `.xlsx` va en el repositorio? | Sí (ya está en `baseline-pn3/`) | — | cerrada |
| 8 | ¿Qué alcance tiene el DSL? | Formato de intercambio + validador de publicación; no reemplaza la BD | 4.1, Frente 0 | abierta |
| 9 | ¿Un total de rúbrica 1–5 del docente es admisible como valoración formativa (RN-09)? | Sí, rotulado «formativo» y no visible al estudiante; confirmar con docentes | 1.3 | abierta |
| 10 | ¿Se conserva la segunda oportunidad (RF-17) y es excepción explícita a RN-08? | Conservarla y documentarla; no cambiar el juego sin decisión de Psicología | 1.2 | abierta |
| 11 | ¿Archivar actúa sobre la versión? ¿Qué pasa con intentos abiertos y asignaciones? | Sobre la versión; los intentos abiertos pueden terminarse, no se inician nuevos | 2.2 | abierta |
| 12 | Al llegar la fecha de cierre, ¿qué pasa con un intento en curso (RF-14)? | Se deja terminar; solo se impiden nuevos intentos | 3.1 | abierta |
| 13 | ¿«Ayuda» es una pista autorada por escena u opción, bajo demanda y sin costo de puntaje? | Sí, por escena; la IA queda aparte (propuesta G) | 3.2 | abierta |
| 14 | ¿Qué tiempo se reporta: reloj o activo (tope por inactividad, hoy 300 s)? | Activo, conservando el reloj como dato | 5.5 | abierta |
| 15 | ¿Qué es «rúbrica definida para el caso» (RF-22): clasificación automática congelada o rúbrica ponderada del docente? | Congelar el reporte automático al cerrar y dejar la rúbrica del docente como complemento | 1.4 | abierta |
| 16 | ¿Quién redacta los objetivos de aprendizaje de cada caso (RF-16) y qué personajes se muestran antes de jugar? | Psicología los redacta; se listan solo los que no revelan lo que debe descubrirse | 3.3 | abierta |
| 17 | ¿Cuál es el texto oficial del aviso de alcance «fines educativos, no diagnóstico» (RN-01) y en qué pantallas va? | Lo valida Psicología; login, aviso previo y resultado | 5.6 | abierta |
| 18 | ¿HTTPS forzado y HSTS en producción (RNF-02)? | Sí, con HSTS bajo al inicio | 5.1 | abierta |
| 19 | ¿Criterio de accesibilidad WCAG 2.1 AA o 2.2 AA (RNF-04)? | 2.1 AA, como el RNF-004 del equipo | 5.2 | abierta |
| 20 | ¿Umbrales de rendimiento y disponibilidad (RNF-05, RNF-06)? | p95 ≤ 2 s y 99,5 % mensual, los del catálogo del equipo | 5.3 | abierta |
| 21 | En la revisión docente, ¿nombre real o alias (RF-25)? | Alias en la traza (se mantiene) y nombre en los reportes de sus grupos | RF-25 | abierta |
| 22 | ¿Un docente puede agregar a su grupo a cualquier estudiante registrado sin su aceptación ni la aprobación del administrador (D-14)? | No: el estudiante acepta la inclusión, o el administrador la aprueba al importar | RF-04, RF-25 | abierta (nueva, 2026-10-11) |

---

## 5. Lo que no se puede verificar leyendo código

| Ítem | Qué falta | Cómo verificarlo |
|---|---|---|
| RNF-05 | Umbral aceptado y mediciones | Script de carga reproducible sobre `SIM-VBG-001` con N estudiantes simultáneos, que reporte p50/p95 y tasa de error |
| RNF-06 | Disponibilidad real | Endpoint `/api/health` con ping a la BD, monitor externo con alertas y respaldo de PostgreSQL con restauración probada |
| RNF-02 | TLS y redirección del entorno desplegado (los hace la plataforma) | `curl -I http://<dominio>` y revisión de cabeceras en el despliegue real |
| RNF-03 | Tableta | Añadir 768×1024 y 1024×768 a la matriz de Playwright (hoy solo Chromium con dispositivos emulados) |
| RNF-04 | Lector de pantalla real | Recorrido con NVDA o VoiceOver de los flujos de estudiante y docente |
| RN-01 | Que el aviso de alcance sea el que Psicología aprueba | Revisión del texto por Psicología |

**Alcance del contraste.** El método (prompt §6.4) somete a dos lentes opuestos solo los veredictos «cumple» y «conflicto»: son 20 ítems en la medición original (17 confirmados por ambos lentes y 3 con desacuerdo que se resolvió leyendo el código). Otros 37 («parcial», «no cumple» y «no verificable») tenían **una sola evaluación**, y 3 «parcial» fueron revisados por un lente. En la re-medición del 2026-10-11 de 14 ítems, 13 pasaron por un revisor independiente (RN-02 y RN-11, que son «cumple», con un solo lente de dos) y RN-05 quedó sin revisar; hoy quedan **27** ítems con una sola evaluación. La columna «Verificación» de la matriz lo marca ítem por ítem. Ninguna prueba ni servidor se ejecutó (la suite de backend sobre `master` sí corre en el CI de cada PR).
