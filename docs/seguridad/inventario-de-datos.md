# Inventario de datos de SIEP

> Qué es: el inventario columna por columna de lo que guarda SIEP, con su clasificación, finalidad, plazo y por dónde sale cada dato (BORRADOR, pendiente de la aprobación de Psicología).
> Se regenera con `python -m apps.privacy.inventory --write` desde `backend_django/`; no se edita a mano.
> El plan de seguridad (S3-4) lo usa para exportar y suprimir los datos de una persona; lo que depende de la institución lleva «(SD-9, pendiente de la institución)».

## Resumen

Tablas: 42. Columnas: 356.

| Clasificación | Columnas |
|---|---:|
| PUBLIC | 140 |
| PERSONAL | 36 |
| SENSITIVE | 44 |
| SECRET | 2 |
| TECHNICAL | 134 |

## Tablas

### `access_requests` — users.AccessRequest

**Finalidad:** Solicitudes de cuenta de personas que aún no tienen acceso; las revisa la administración.

**Plazo:** Sin purga automática documentada (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PERSONAL | api, correo | identificador de la solicitud: enlaza con el nombre y el correo de quien la pide |
| `nombre` | PERSONAL | api, correo | nombre que indica quien pide la cuenta (sin verificar) |
| `apellido` | PERSONAL | api, correo | apellido que indica quien pide la cuenta (sin verificar) |
| `email` | PERSONAL | api, correo | correo de quien pide la cuenta; a él se le responde |
| `status` | PERSONAL | api | estado del trámite: pendiente, revisada o descartada |
| `created_at` | TECHNICAL | — |  |
| `reviewed_at` | TECHNICAL | — |  |


### `attempt_events` — simulation.AttemptEvent

**Finalidad:** Línea de tiempo del intento: cada decisión, herramienta, bitácora o salida.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | api | intento al que pertenece el evento |
| `event_type` | SENSITIVE | api | qué hizo el estudiante: decisión, herramienta, bitácora o salida |
| `node_id` | TECHNICAL | — |  |
| `decision_option_id` | SENSITIVE | api, reporte | opción de decisión que eligió el estudiante |
| `detail` | SENSITIVE | api | detalle de la acción que muestra la línea de tiempo (herramienta o etiqueta); en una salida segura puede llevar el motivo escrito por la persona (texto libre, recortado a 500 caracteres) |
| `occurred_at` | SENSITIVE | api | cuándo actuó el estudiante (línea de tiempo) |
| `request_id` | TECHNICAL | — |  |


### `attempt_feedback` — simulation.AttemptFeedback

**Finalidad:** Encuesta breve opcional de un intento completado: una calificación de 1 a 5 y un comentario de texto plano. Apagada hasta que Psicología la apruebe (SIEP_ATTEMPT_FEEDBACK_SURVEY).

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | ninguna (uso interno) | intento que el estudiante encuestó |
| `rating` | SENSITIVE | api | calificación de 1 a 5 que el estudiante da a su experiencia; al docente solo llega agregada, con celda mínima |
| `comment` | SENSITIVE | api | texto libre del estudiante (hasta 500 caracteres, texto plano); no sale a ningún reporte, auditoría ni agregado |
| `created_at` | SENSITIVE | api | cuándo respondió el estudiante |

Nunca sale por: `comment`: csv, reporte, correo, registro.


### `attempt_hint_views` — simulation.AttemptHintView

**Finalidad:** Qué pistas pidió el estudiante en una escena y cuándo.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | ninguna (uso interno) | intento que pidió la pista |
| `hint_id` | TECHNICAL | — |  |
| `viewed_at` | SENSITIVE | ninguna (uso interno) | cuándo pidió la pista el estudiante |


### `attempt_reports` — simulation.AttemptReport

**Finalidad:** Informe congelado de un intento: decisiones, retroalimentación, tiempos y conteos.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | api, reporte | intento al que pertenece el informe |
| `report_json` | SENSITIVE | api, reporte | informe congelado del intento (v3): decisiones y su clase, hitos cumplidos y faltantes, estado de la persona usuaria, motivo del final, evidencia por nivel de competencia y tiempos; su línea de tiempo copia el motivo escrito de una salida segura (texto libre de la persona) |
| `report_schema_version` | TECHNICAL | — |  |
| `definition_hash` | TECHNICAL | — |  |
| `attempt_ordinal` | SENSITIVE | reporte | número de intento del estudiante en ese caso |
| `created_at` | TECHNICAL | — |  |


### `attempt_world_states` — simulation.AttemptWorldState

**Finalidad:** Estado del mundo del intento: posición del estudiante, inventario, objetos y diálogos vistos.

**Plazo:** Mientras exista el intento (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `attempt_id` | SENSITIVE | api | intento al que pertenece el estado del mundo |
| `scene_map_id` | SENSITIVE | api | escena en la que está el estudiante |
| `player_x` | SENSITIVE | api | posición del estudiante en la escena (x) |
| `player_y` | SENSITIVE | api | posición del estudiante en la escena (y) |
| `inventory_json` | SENSITIVE | api | objetos que el estudiante recogió |
| `inspected_object_keys_json` | SENSITIVE | api | objetos que el estudiante revisó |
| `viewed_dialogue_keys_json` | SENSITIVE | api | diálogos que el estudiante vio |
| `used_tool_keys_json` | SENSITIVE | api | herramientas que el estudiante usó |
| `flags_json` | SENSITIVE | api, reporte | banderas del caso que el estudiante ha activado, los hitos que ha cumplido y el estado de la persona usuaria en la ficción (vínculo y activación) según sus decisiones |
| `updated_at` | TECHNICAL | — |  |


### `audit_logs` — simulation.AuditLog

**Finalidad:** Auditoría de acciones: quién hizo qué, sobre qué recurso, desde qué IP y navegador.

**Plazo:** Al menos 360 días (RNF-007); `retention_days()` nunca baja de ese mínimo. Lo que pase después lo decide la institución (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `actor_id` | PERSONAL | api | cuenta que hizo la acción (vacía en los eventos del sistema) |
| `actor_role` | PERSONAL | api | rol de quien hizo la acción |
| `action` | TECHNICAL | — |  |
| `resource_type` | TECHNICAL | — |  |
| `resource_id` | SENSITIVE | api | recurso afectado; a veces es un intento del estudiante |
| `context_json` | SENSITIVE | api | contexto de la acción; las filas antiguas pueden traer texto libre (question), que la lectura oculta |
| `ip_address` | PERSONAL | api | dirección IP de quien hizo la acción |
| `user_agent` | PERSONAL | api | navegador de quien hizo la acción |
| `occurred_at` | TECHNICAL | — |  |
| `retention_until` | TECHNICAL | — |  |


### `auth_group` — auth.Group

**Finalidad:** Grupos de permisos de Django. No guarda datos de personas.

**Plazo:** Mientras exista el modelo. Es configuración del sistema, sin datos de personas.

Todas las columnas heredan `TECHNICAL`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `name` | TECHNICAL | — |  |


### `auth_group_permissions` — auth.Group_permissions (tabla intermedia de Django)

**Finalidad:** Tabla intermedia entre grupos y permisos de Django. No guarda datos de personas.

**Plazo:** Mientras exista el modelo. Es configuración del sistema, sin datos de personas.

Todas las columnas heredan `TECHNICAL`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `group_id` | TECHNICAL | — |  |
| `permission_id` | TECHNICAL | — |  |


### `auth_permission` — auth.Permission

**Finalidad:** Permisos que genera Django para cada modelo. El sistema no los asigna a personas.

**Plazo:** Mientras exista el modelo. Es configuración del sistema, sin datos de personas.

Todas las columnas heredan `TECHNICAL`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `name` | TECHNICAL | — |  |
| `content_type_id` | TECHNICAL | — |  |
| `codename` | TECHNICAL | — |  |


### `case_assignments` — grupos.CaseAssignment

**Finalidad:** Asignación de un caso a un grupo o a un estudiante, con su ventana de apertura y cierre.

**Plazo:** Mientras la asignación exista (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — | versión del caso asignada; no identifica a la persona |
| `grupo_id` | TECHNICAL | — | grupo destinatario; no identifica a la persona |
| `estudiante_id` | PERSONAL | api | estudiante a quien se asigna el caso (asignación individual) |
| `opens_at` | TECHNICAL | — |  |
| `closes_at` | TECHNICAL | — |  |
| `sort_order` | TECHNICAL | — |  |
| `assigned_by` | PERSONAL | ninguna (uso interno) | docente que asignó el caso |
| `assigned_at` | TECHNICAL | — |  |
| `active` | TECHNICAL | — |  |


### `case_characters` — simulation.CaseCharacter

**Finalidad:** Personajes ficticios del caso: nombre y rol que ve el estudiante. No son personas reales.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `case_version_id` | PUBLIC | — |  |
| `character_key` | PUBLIC | — |  |
| `display_name` | PUBLIC | — |  |
| `role_label` | PUBLIC | — |  |
| `portrait_key` | PUBLIC | — |  |
| `show_in_brief` | PUBLIC | — |  |
| `display_order` | PUBLIC | — |  |


### `case_reviews` — simulation.CaseReview

**Finalidad:** Revisiones de contenido de una versión antes de publicarla: quién la pidió, quién decidió y con qué nota.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — |  |
| `requested_by` | PERSONAL | api | persona que pidió la revisión de contenido |
| `requested_at` | TECHNICAL | — |  |
| `decided_by` | PERSONAL | api | persona que decidió la revisión |
| `decided_at` | TECHNICAL | — |  |
| `decision` | TECHNICAL | — |  |
| `reason` | TECHNICAL | — |  |
| `note` | PERSONAL | api | texto libre del revisor: puede identificarlo |
| `content_reviewer` | PERSONAL | api | nombre de quien revisó el contenido (constancia) |
| `content_reviewed_on` | TECHNICAL | — |  |
| `content_reference` | PUBLIC | — |  |


### `case_versions` — simulation.CaseVersion

**Finalidad:** Versiones de un caso con su edición, validación y publicación; quién las creó y editó.

**Plazo:** Mientras exista el caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `simulation_case_id` | TECHNICAL | — |  |
| `semantic_version` | TECHNICAL | — |  |
| `status` | TECHNICAL | — |  |
| `narrative_context` | PUBLIC | — |  |
| `learning_objectives` | PUBLIC | — |  |
| `cloned_from_id` | TECHNICAL | — |  |
| `published_at` | TECHNICAL | — |  |
| `validated_at` | TECHNICAL | — |  |
| `definition_hash` | TECHNICAL | — |  |
| `reuse_ratio` | TECHNICAL | — |  |
| `created_by` | PERSONAL | ninguna (uso interno) | docente que creó la versión |
| `created_at` | TECHNICAL | — |  |
| `version` | TECHNICAL | — |  |
| `world_schema_version` | TECHNICAL | — |  |
| `rules` | PUBLIC | — |  |
| `last_edited_by` | PERSONAL | ninguna (uso interno) | última persona que editó la versión |
| `edited_alone_since` | TECHNICAL | — |  |


### `clinical_tools` — simulation.ClinicalTool

**Finalidad:** Herramientas que el estudiante puede usar en un caso: código, nombre y descripción.

**Plazo:** Mientras exista la versión del caso o el catálogo (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `case_version_id` | PUBLIC | — |  |
| `tool_code` | PUBLIC | — |  |
| `label` | PUBLIC | — |  |
| `icon` | PUBLIC | — |  |
| `category` | PUBLIC | — |  |
| `description` | PUBLIC | — |  |
| `active` | PUBLIC | — |  |


### `collision_zones` — simulation.CollisionZone

**Finalidad:** Zonas del mapa que el personaje no puede cruzar. Contenido del caso.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `scene_map_id` | PUBLIC | — |  |
| `zone_key` | PUBLIC | — |  |
| `label` | PUBLIC | — |  |
| `position_x` | PUBLIC | — |  |
| `position_y` | PUBLIC | — |  |
| `width` | PUBLIC | — |  |
| `height` | PUBLIC | — |  |


### `competencies` — simulation.Competency

**Finalidad:** Catálogo de competencias que evalúan las rúbricas.

**Plazo:** Mientras esté en el catálogo (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `code` | PUBLIC | — |  |
| `name` | PUBLIC | — |  |
| `description` | PUBLIC | — |  |
| `active` | PUBLIC | — |  |
| `sort_order` | PUBLIC | — |  |


### `consent_records` — privacy.ConsentRecord

**Finalidad:** Evidencia de que el aviso de contenido sensible se mostró y se aceptó (ETH-01): quién lo aceptó, para qué versión del caso y del aviso, cuándo y si lo retiró. También guarda, sin caso, la autorización de tratamiento de datos cuando la institución la entregue.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `person_id` | PERSONAL | ninguna (uso interno) | persona que vio y aceptó el aviso: enlaza con su cuenta |
| `consent_type` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | api |  |
| `notice_version` | TECHNICAL | api |  |
| `accepted_at` | PERSONAL | api | cuándo aceptó el aviso esa persona (la evidencia de ETH-01) |
| `withdrawn_at` | TECHNICAL | api |  |


### `criterion_scores` — simulation.CriterionScore

**Finalidad:** Puntaje, nivel y comentario de cada criterio de una evaluación docente.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `rubric_evaluation_id` | TECHNICAL | — |  |
| `rubric_criterion_id` | TECHNICAL | — |  |
| `score` | SENSITIVE | ninguna (uso interno) | puntaje de un criterio sobre el desempeño del estudiante; interno: el DTO sirve solo el nivel |
| `level` | SENSITIVE | api | nivel alcanzado en un criterio |
| `comment` | SENSITIVE | api | comentario del docente sobre el criterio |
| `evidence_json` | SENSITIVE | ninguna (uso interno) | evidencia de la evaluación; el servicio la escribe vacía y no sale |


### `decision_options` — simulation.DecisionOption

**Finalidad:** Opciones de decisión de cada escena, con su texto, su clase de respuesta y su retroalimentación.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — |  |
| `option_key` | PUBLIC | — |  |
| `source_node_id` | TECHNICAL | — |  |
| `target_node_id` | TECHNICAL | — |  |
| `text` | PUBLIC | — |  |
| `immediate_feedback` | PUBLIC | — |  |
| `prohibition_reason` | PUBLIC | — |  |
| `consequence_text` | PUBLIC | — |  |
| `theory_basis` | PUBLIC | — |  |
| `feedback_text` | PUBLIC | — |  |
| `effects` | PUBLIC | — |  |
| `response_class` | PUBLIC | — |  |


### `dialogue_choices` — simulation.DialogueChoice

**Finalidad:** Opciones que el estudiante elige en un diálogo y sus efectos.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `dialogue_tree_id` | TECHNICAL | — |  |
| `choice_key` | PUBLIC | — |  |
| `text` | PUBLIC | — |  |
| `decision_option_id` | TECHNICAL | — |  |
| `required_tool_code` | PUBLIC | — |  |
| `effect_json` | PUBLIC | — |  |
| `display_order` | PUBLIC | — |  |


### `dialogue_lines` — simulation.DialogueLine

**Finalidad:** Líneas de cada diálogo del caso: quién habla y qué dice.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `dialogue_tree_id` | TECHNICAL | — |  |
| `display_order` | PUBLIC | — |  |
| `speaker_name` | PUBLIC | — |  |
| `text` | PUBLIC | — |  |
| `emotion` | PUBLIC | — |  |


### `dialogue_trees` — simulation.DialogueTree

**Finalidad:** Árboles de diálogo de los personajes del caso: quién habla y con qué emoción.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `scene_map_id` | PUBLIC | — |  |
| `map_object_id` | PUBLIC | — |  |
| `tree_key` | PUBLIC | — |  |
| `speaker_name` | PUBLIC | — |  |
| `portrait_key` | PUBLIC | — |  |
| `emotion` | PUBLIC | — |  |
| `created_at` | PUBLIC | — |  |


### `django_content_type` — contenttypes.ContentType

**Finalidad:** Catálogo de modelos de Django que usan los permisos. No guarda datos de personas.

**Plazo:** Mientras exista el modelo. Es configuración del sistema, sin datos de personas.

Todas las columnas heredan `TECHNICAL`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `app_label` | TECHNICAL | — |  |
| `model` | TECHNICAL | — |  |


### `grupo_estudiante` — grupos.GrupoEstudiante

**Finalidad:** Pertenencia de un estudiante a un grupo: invitación, aceptación o rechazo.

**Plazo:** Mientras la pertenencia o la invitación exista (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `grupo_id` | TECHNICAL | — | referencia al grupo; sola no identifica a la persona |
| `estudiante_id` | PERSONAL | api | estudiante invitado o miembro del grupo |
| `status` | PERSONAL | api | estado de la invitación o de la pertenencia del estudiante |
| `invited_by` | PERSONAL | ninguna (uso interno) | docente que invitó al estudiante |
| `invited_at` | TECHNICAL | — |  |
| `responded_at` | TECHNICAL | — |  |


### `grupos` — grupos.Grupo

**Finalidad:** Grupos o clases de un docente: nombre, código y docente responsable.

**Plazo:** Mientras el grupo exista (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `nombre` | PUBLIC | — |  |
| `codigo` | PUBLIC | — |  |
| `profesor_id` | PERSONAL | ninguna (uso interno) | docente responsable del grupo |
| `activo` | TECHNICAL | — |  |
| `created_at` | TECHNICAL | — |  |


### `map_objects` — simulation.MapObject

**Finalidad:** Objetos interactivos del mapa (puertas, mobiliario, personajes). Contenido del caso.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `scene_map_id` | PUBLIC | — |  |
| `object_key` | PUBLIC | — |  |
| `label` | PUBLIC | — |  |
| `object_type` | PUBLIC | — |  |
| `position_x` | PUBLIC | — |  |
| `position_y` | PUBLIC | — |  |
| `width` | PUBLIC | — |  |
| `height` | PUBLIC | — |  |
| `color_hex` | PUBLIC | — |  |
| `icon` | PUBLIC | — |  |
| `short_code` | PUBLIC | — |  |
| `collision` | PUBLIC | — |  |
| `visible` | PUBLIC | — |  |
| `interaction_prompt` | PUBLIC | — |  |
| `interaction_text` | PUBLIC | — |  |
| `decision_option_id` | PUBLIC | — |  |
| `character_id` | PUBLIC | — |  |
| `tool_code` | PUBLIC | — |  |
| `unlock_condition_json` | PUBLIC | — |  |
| `created_at` | PUBLIC | — |  |
| `updated_at` | PUBLIC | — |  |
| `z_index` | PUBLIC | — |  |
| `facing` | PUBLIC | — |  |
| `movement_pattern_json` | PUBLIC | — |  |
| `metadata_json` | PUBLIC | — |  |


### `publication_checklist_items` — simulation.PublicationChecklistItem

**Finalidad:** Cada punto de la lista de verificación, con la nota de evidencia que escribe el docente.

**Plazo:** Mientras exista la lista de verificación (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `checklist_id` | TECHNICAL | — |  |
| `code` | PUBLIC | — |  |
| `label` | PUBLIC | — |  |
| `required` | PUBLIC | — |  |
| `fulfilled` | PUBLIC | — |  |
| `evidence_note` | PERSONAL | ninguna (uso interno) | texto libre del docente sobre la evidencia; puede nombrar personas |


### `publication_checklists` — simulation.PublicationChecklist

**Finalidad:** Lista de verificación que un docente envía antes de publicar una versión del caso.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — |  |
| `submitted_by` | PERSONAL | ninguna (uso interno) | docente que envió la lista de verificación |
| `completion_ratio` | TECHNICAL | — |  |
| `status` | TECHNICAL | — |  |
| `submitted_at` | TECHNICAL | — |  |
| `completed_at` | TECHNICAL | — |  |


### `rate_limit_buckets` — security.RateLimitBucket

**Finalidad:** Contadores del limitador de intentos (contra el abuso): una clave ya hasheada y un contador.

**Plazo:** Lo que dura la ventana del límite. El comando `unblock_login` la puede borrar; sin purga automática documentada (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `scope` | TECHNICAL | — |  |
| `key_hash` | TECHNICAL | — | clave HMAC con la llave del servidor, de un correo o de una IP; no se invierte sin la llave |
| `window_start` | TECHNICAL | — |  |
| `count` | TECHNICAL | — |  |


### `reflection_journals` — simulation.ReflectionJournal

**Finalidad:** Bitácora de reflexión del estudiante sobre una escena, cifrada en reposo.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | api | intento al que pertenece la bitácora |
| `node_id` | TECHNICAL | — |  |
| `encrypted_text` | SENSITIVE | api, reporte | texto libre de la bitácora del estudiante, cifrado; el docente lo ve descifrado en la traza |
| `encryption_key_ref` | TECHNICAL | — |  |
| `locked` | TECHNICAL | — |  |
| `created_at` | TECHNICAL | — |  |
| `updated_at` | TECHNICAL | — |  |

Nunca sale por: `encrypted_text`: registro, csv, correo.


### `rubric_criteria` — simulation.RubricCriterion

**Finalidad:** Criterios de cada rúbrica: competencia, peso y puntaje máximo. No contiene datos de personas.

**Plazo:** Mientras exista la rúbrica (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `rubric_id` | PUBLIC | — |  |
| `competency` | PUBLIC | — |  |
| `competency_id` | PUBLIC | — |  |
| `title` | PUBLIC | — |  |
| `description` | PUBLIC | — |  |
| `max_score` | PUBLIC | — |  |
| `weight` | PUBLIC | — |  |
| `active` | PUBLIC | — |  |
| `display_order` | PUBLIC | — |  |


### `rubric_evaluations` — simulation.RubricEvaluation

**Finalidad:** Evaluación de un intento por un docente: puntaje total y comentario sobre el estudiante.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `attempt_id` | SENSITIVE | api | intento evaluado: enlaza la evaluación con lo que hizo el estudiante |
| `rubric_id` | TECHNICAL | — |  |
| `instructor_id` | PERSONAL | ninguna (uso interno) | docente que evaluó |
| `total_score` | SENSITIVE | ninguna (uso interno) | puntaje total de la evaluación docente sobre el estudiante; interno: el DTO sirve solo el nivel |
| `comment` | SENSITIVE | api | comentario del docente sobre el desempeño del estudiante |
| `status` | TECHNICAL | — |  |
| `snapshot_json` | PUBLIC | — |  |
| `origin` | TECHNICAL | — |  |
| `created_at` | TECHNICAL | — |  |
| `updated_at` | TECHNICAL | — |  |
| `evaluated_at` | TECHNICAL | — |  |


### `rubrics` — simulation.Rubric

**Finalidad:** Rúbricas de evaluación: nombre, versión y docente que las creó.

**Plazo:** Mientras exista la rúbrica (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — |  |
| `name` | PUBLIC | — |  |
| `description` | PUBLIC | — |  |
| `active` | TECHNICAL | — |  |
| `version` | TECHNICAL | — |  |
| `is_default` | TECHNICAL | — |  |
| `updated_at` | TECHNICAL | — |  |
| `created_by` | PERSONAL | api | docente que creó la rúbrica |
| `created_at` | TECHNICAL | — |  |


### `scene_hints` — simulation.SceneHint

**Finalidad:** Pistas que el estudiante puede pedir en una escena del caso.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `scene_map_id` | TECHNICAL | — |  |
| `hint_order` | PUBLIC | — |  |
| `text` | PUBLIC | — |  |


### `scene_maps` — simulation.SceneMap

**Finalidad:** Mapas o escenarios de cada caso: tamaño, tema y punto de inicio. No contiene datos de personas.

**Plazo:** Mientras exista la versión del caso que lo usa (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `case_version_id` | PUBLIC | — |  |
| `node_id` | PUBLIC | — |  |
| `map_key` | PUBLIC | — |  |
| `title` | PUBLIC | — |  |
| `width` | PUBLIC | — |  |
| `height` | PUBLIC | — |  |
| `theme` | PUBLIC | — |  |
| `spawn_x` | PUBLIC | — |  |
| `spawn_y` | PUBLIC | — |  |
| `ambient_json` | PUBLIC | — |  |
| `created_at` | PUBLIC | — |  |
| `updated_at` | PUBLIC | — |  |


### `simulation_attempts_v2` — simulation.SimulationAttempt

**Finalidad:** Intentos de un estudiante en un caso: estado y tiempos. Son sus decisiones.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | SENSITIVE | api | identificador del intento: enlaza con todo lo que hizo el estudiante |
| `attempt_token_hash` | SECRET | ninguna (uso interno) | hash del token del intento; el token lo tiene el cliente y el hash no sale |
| `case_version_id` | TECHNICAL | — | versión del caso; no identifica a la persona |
| `student_id` | PERSONAL | ninguna (uso interno) | estudiante dueño del intento; sale solo como alias (Estudiante-<hash>) |
| `current_node_id` | SENSITIVE | api | escena en la que está el estudiante |
| `status` | SENSITIVE | api, reporte | estado del intento en el caso (en curso, pausado, terminado) |
| `started_at` | SENSITIVE | api | cuándo empezó el intento (conducta del estudiante) |
| `ended_at` | SENSITIVE | api | cuándo terminó el intento (conducta del estudiante) |
| `locked_at` | TECHNICAL | — |  |
| `replaced_by_id` | SENSITIVE | ninguna (uso interno) | intento que sustituyó a este |
| `replace_reason` | SENSITIVE | ninguna (uso interno) | motivo escrito para sustituir el intento |
| `active_seconds` | SENSITIVE | api | tiempo activo del estudiante en el intento |
| `last_activity_at` | SENSITIVE | ninguna (uso interno) | última actividad del estudiante (sirve al cronómetro) |

Nunca sale por: `attempt_token_hash`: api, csv, reporte, correo, registro.


### `simulation_cases` — simulation.SimulationCase

**Finalidad:** Casos de simulación: código, título y descripción; quién los creó.

**Plazo:** Mientras exista el caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `code` | PUBLIC | — |  |
| `title` | PUBLIC | — |  |
| `description` | PUBLIC | — |  |
| `active` | TECHNICAL | — |  |
| `created_by` | PERSONAL | ninguna (uso interno) | docente que creó el caso |
| `created_at` | TECHNICAL | — |  |
| `updated_at` | TECHNICAL | — |  |


### `simulation_nodes` — simulation.SimulationNode

**Finalidad:** Escenas del caso con su narrativa y la pregunta de decisión. Contenido del caso.

**Plazo:** Mientras exista la versión del caso (SD-9, pendiente de la institución).

Todas las columnas heredan `PUBLIC`: la tabla no tiene datos personales ni sensibles.

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PUBLIC | — |  |
| `case_version_id` | PUBLIC | — |  |
| `node_key` | PUBLIC | — |  |
| `title` | PUBLIC | — |  |
| `narrative` | PUBLIC | — |  |
| `support_resources_json` | PUBLIC | — |  |
| `required_tools_json` | PUBLIC | — |  |
| `sensitive_content` | PUBLIC | — |  |
| `safe_exit_required` | PUBLIC | — |  |
| `warning_message` | PUBLIC | — |  |
| `start_node` | PUBLIC | — |  |
| `terminal_node` | PUBLIC | — |  |
| `position_x` | PUBLIC | — |  |
| `position_y` | PUBLIC | — |  |
| `decision_prompt` | PUBLIC | — |  |
| `display_order` | PUBLIC | — |  |
| `intensity` | PUBLIC | — |  |


### `simulation_rubric_assignments` — simulation.SimulationRubricAssignment

**Finalidad:** Rúbrica asignada a una versión del caso y quién la asignó.

**Plazo:** Mientras la asignación esté activa o exista el caso (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `case_version_id` | TECHNICAL | — |  |
| `rubric_id` | TECHNICAL | — |  |
| `assigned_by` | PERSONAL | ninguna (uso interno) | docente que asignó la rúbrica al caso |
| `active` | TECHNICAL | — |  |
| `assigned_at` | TECHNICAL | — |  |


### `student_case_completion` — progression.StudentCaseCompletion

**Finalidad:** Qué casos completó un estudiante por primera vez, para desbloquear el siguiente.

**Plazo:** Sin plazo definido (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | TECHNICAL | — |  |
| `student_id` | PERSONAL | ninguna (uso interno) | estudiante que completó el caso |
| `simulation_case_id` | TECHNICAL | — |  |
| `first_completed_at` | SENSITIVE | ninguna (uso interno) | cuándo completó el caso por primera vez el estudiante |
| `created_at` | TECHNICAL | — |  |


### `users` — users.CustomUser

**Finalidad:** Cuentas de acceso de estudiantes, docentes y administración: identidad, rol e inicio de sesión.

**Plazo:** Mientras la cuenta exista. El plazo tras la baja lo decide la institución (SD-9, pendiente de la institución).

| Columna | Clasificación | Salidas | Motivo |
|---|---|---|---|
| `id` | PERSONAL | api, registro | identificador de la cuenta: enlaza con todos los datos de la persona |
| `password_hash` | SECRET | ninguna (uso interno) | hash BCrypt de la contraseña; la temporal sale en claro por correo al aprobar la cuenta (account_service.py) y no se guarda |
| `email` | PERSONAL | api, correo | correo institucional: identifica y es el medio de contacto |
| `nombre` | PERSONAL | api, csv, reporte, correo | nombre de la persona |
| `apellido` | PERSONAL | api, csv, reporte, correo | apellido de la persona |
| `role` | PERSONAL | api | rol de la cuenta: estudiante, docente o administración |
| `activo` | TECHNICAL | — |  |
| `created_at` | TECHNICAL | — |  |
| `must_change_password` | TECHNICAL | — |  |
| `session_epoch` | TECHNICAL | — |  |
| `temp_password_set_at` | TECHNICAL | — |  |

Nunca sale por: `password_hash`: api, csv, reporte, correo, registro.

