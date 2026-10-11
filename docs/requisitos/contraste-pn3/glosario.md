# Glosario: línea base PN3 ↔ SIEP

> Qué palabra usa la línea base, qué concepto es en SIEP y dónde vive. Se arma con la terminología que cada evaluador dejó en `datos/veredictos.json` y con la lectura del código; las diferencias de vocabulario que más confunden están al final. Fecha: 2026-10-10.

| Término de la línea base | Concepto en SIEP | Dónde vive | Observación |
|---|---|---|---|
| **Caso** | `SimulationCase` (contenedor: código, título, activo) + `CaseVersion` (la unidad que se edita, asigna y publica) | `backend_django/apps/simulation/models/case.py`; editor en `/portal/casos` | Lo que el texto llama «caso» el editor lo edita como una **versión** (`case_version_id`). Se publica y asigna la versión, no el caso |
| **Borrador / publicado / archivado** | `DRAFT` / `PUBLISHED` / `ARCHIVED` de cada versión; `IN_REVIEW` existe sin transición | `CaseVersionStatus` (`models/case.py:10`); `authoring/publication.py` | Es estado de versión, no de caso. Publicar una versión nueva no archiva la anterior. Archivar no tiene operación en la API |
| **Escena** | Nodo del grafo (`SimulationNode`: título, narrativa, inicio o terminal) **más** su sala jugable (`SceneMap`, una por nodo) | `models/case.py:74-89`; `authoring/world_definition.py` | Cruzar una puerta cambia de sala pero no avanza el grafo; solo una decisión lo hace. «Ordenar escenas» no existe: el orden lo dan las aristas |
| **Personaje** | Objeto de mapa de tipo `PERSON` (NPC; «Persona» en el editor) con árbol de diálogo | `models/world.py` (`MapObject`) | Por escena; no hay catálogo de personajes del caso |
| **Decisión** | Conjunto de `DecisionOption` con el mismo nodo origen | `DecisionOption` | En código y en la interfaz «decisión», «arista» y «opción» se usan indistintamente: «Nueva decisión» crea **una** opción. No hay entidad decisión con enunciado propio |
| **Opción de respuesta** | `DecisionOption`: texto, clasificación (`ADEQUATE`, `RISKY`, `INADEQUATE`), destino y efectos | ídem | — |
| **Ramificación** | `DecisionOption.target_node` | ídem | Los ciclos están prohibidos por la validación (`GRAPH_CYCLE`), que es más estricta que el texto |
| **Conclusión / final** | Nodo terminal (`terminal_node = true`); en pantalla, el «final» canónico (integral, brechas, riesgo persistente, crítico) | `services/case_effects.py` | El final se calcula por código y hoy solo funciona para `SIM-VBG-001` |
| **Retroalimentación** | Cuatro cosas distintas: (1) `immediate_feedback` + `prohibition_reason`, el mensaje de «Supervisión clínica» tras cada decisión; (2) `recommendations`, «Retroalimentación del sistema» por plantillas; (3) el final canónico (`ending`); (4) el comentario docente de la rúbrica (`RubricEvaluation.comment`) | `services/decision_effects.py:72-80`; `serializers/game_dtos.py` | RN-08 separa consecuencia y retroalimentación pedagógica; SIEP las fusiona en (1). El «fundamento teórico» no tiene campo |
| **Consecuencia** | Nodo destino con su narrativa + cambio en las barras (confianza, bienestar, estrés) | `game_service.py:401-404` | No hay un campo propio de «consecuencia narrativa» |
| **Ayuda / pista** | Sin entidad. Lo más cercano: «Cómo se juega», tarjeta «Qué hacer», aviso de evidencia, descripción de herramientas, `supportResources` (líneas de apoyo), guía NPC (deshabilitada) y asistente de IA (apagado) | `simulation-hud.component.ts`; `views/ai_assistant.py` | `supportResources` son recursos de contención, no pistas |
| **DSL** | No existe como lenguaje. Equivale al contrato `WorldDefinition` v2 (JSON, `schemaVersion` 2) más las reglas de `world_validation.py` | `frontend/src/app/core/models/simulation.model.ts:574`; `services/world_validation.py` | El diseño del DSL del taller de Ingeniería de Software II vive en `docs/diseno/dsl/` (rama aparte) |
| **Intento** | `SimulationAttempt` (`simulation_attempts_v2`, identificador UUID) con `AttemptEvent`, `AttemptWorldState` y `ReflectionJournal` | `models/attempt.py` | — |
| **En progreso** | `IN_PROGRESS` **y** `PAUSED` (los intentos «abiertos») | `OPEN_STATUSES` | La pausa cuenta como abierto: es más estricto que el texto de RN-07 |
| **Terminado** | `COMPLETED`; también son terminales `SAFE_EXITED` (histórico) y `REPLACED` | `AttemptStatus` | `REPLACED` no es salida segura: el intento se cerró porque se empezó otro con `forceNew` |
| **Repetir la simulación** | «Reintentar caso» / «Iniciar nuevo intento» (`forceNew`) | `game_service.start_attempt` | — |
| **Bitácora reflexiva** | `ReflectionJournal`: texto libre cifrado por escena; panel «Bitácora reflexiva» (tecla J) | `services/crypto_service.py` | El docente la ve descifrada en la traza del intento |
| **Recorrido del intento** | `AttemptEvent` y la «Trazabilidad docente» | `/portal/docente/trazabilidad`; `/api/instructor/attempts/...` | Conviven dos definiciones de tiempo: reloj y activo (tope de 300 s por intervalo) |
| **Grupo** | `Grupo` (en la UI «grupo» o «cohorte») | `backend_django/apps/grupos` | El estudiante se vincula por correo (`grupo_estudiante`) |
| **Asignar caso** | Fila en `grupo_case_version` (grupo, versión, `assigned_at`) | `grupos/services.py:562-582` | Solo a grupos; sin fechas; sin estudiante individual |
| **Caso habilitado / asignado** | Derivado: versión `PUBLISHED` + caso activo + asignada a un grupo activo del estudiante | `game_service._assigned_case_version_ids` | El `unlocked` del catálogo es otra cosa (progresión lineal) |
| **Profesor** | Rol `PROFESOR`; la UI dice «Docente» y la API de revisión «instructor» | `shared/permissions.py` | — |
| **Administrador** | Rol `ADMIN` | ídem | Además juega y revisa; el ADMIN no necesita asignación para iniciar un intento |
| **Credenciales** | Correo + contraseña (`password_hash`, bcrypt con sal) | `apps/users/models.py` | Ver RNF-01 en la matriz |
| **Rúbrica / valoración formativa** | `Rubric` y `RubricCriterion` (6 criterios ponderados) + `RubricEvaluation` (manual del docente) + `completionReport` (automático) | `services/rubric_service.py`; `serializers/game_dtos.py` | El «puntaje» (`accumulated_score`, sin tope) no es la nota; el `total_score` de la rúbrica sí va de 1.0 a 5.0 |
| **Reporte** | `GET /api/reportes/grupo/<id>` (+ CSV) y «Reportes por grupo» | `backend_django/apps/reportes` | No hay reporte propio de un estudiante: es una fila del reporte de grupo |

## Diferencias de vocabulario que pueden causar malentendidos

1. **«Caso» y «versión de caso».** Un caso tiene varias versiones; el estado, la asignación y la publicación son de la versión.
2. **«Decisión» y «opción».** La línea base distingue una decisión (con varias opciones); el código y la interfaz llaman «decisión» a una sola opción.
3. **«Retroalimentación» tiene cuatro sentidos** en SIEP (arriba). Cuando RN-08 o RF-23 hablan de «retroalimentación pedagógica» se refieren a (1) y (3), no a las recomendaciones de plantilla.
4. **«Terminado» no es «salida segura».** Salir pausa el intento (reanudable); `REPLACED` y `SAFE_EXITED` son estados distintos y no puntúan.
5. **«Habilitado» y `unlocked`.** El primero lo da la asignación a un grupo; el segundo es la progresión lineal del lobby.
6. **«Puntaje» y «nota».** El puntaje es un acumulado de juego sin tope; la nota 0,0–5,0 que RN-09 no quiere generar se parece al total de 1.0 a 5.0 de la rúbrica.
7. **«Profesor», «docente» e «instructor»** son el mismo rol `PROFESOR` según la capa (línea base, interfaz, API).
8. **«Escena», «nodo» y «sala».** Una escena de la línea base es un nodo con su sala; el «mapa» del editor es la sala.
9. **Numeración.** `RNF-02` (línea base, comunicación segura) no es `RNF-002` (catálogo del equipo, control de acceso por rol); ver la tabla de colisiones en [`extensiones-siep.md`](extensiones-siep.md).
