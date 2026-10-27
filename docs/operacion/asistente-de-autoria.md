# Asistente de IA de autoría

Ayuda de IA para quien escribe un caso en el editor (P5). **Propone, nunca escribe el caso:** el servidor devuelve una lista de cambios ya validada y es el docente quien los acepta y los aplica con las rutas de autoría de siempre. Nada de lo que propone entra al caso sin pasar por sus manos.

> El asistente del estudiante (`AI_ASSISTANT_*`) es otro, sigue apagado y no se toca.
>
> El servidor Node del sandbox queda solo para el sandbox (`sandbox/editor-casos/servidor/`, rama `claude/editor-casos-p3`). El programa usa las rutas de abajo.

## Rutas

Montadas en `/api/authoring/cases/{id}/assistant/…` (canónica) y en `/api/admin/cases/{id}/assistant/…` (alias). Permiso `case.author` y ser el autor del caso (403 si es ajeno, 404 si la versión no existe).

| Ruta | Qué hace | Modelo |
|---|---|---|
| `GET assistant/status` | Si el asistente está listo (`enabled`, `mode`: `connected` o `disabled`) y cuánto le queda hoy a quien pregunta (`remainingToday`). No gasta cupo | – |
| `POST assistant/propose` | Una propuesta de cambios para la pantalla del editor | el capaz (`AI_AUTHORING_MODEL_CAPABLE`) |
| `POST assistant/guide` | «¿Cómo hago X?»: elige una acción del catálogo del editor y cómo mostrarla (`resaltar`, `foco`, `recorrido`) | el rápido (`AI_AUTHORING_MODEL_FAST`) |

`propose` y `guide` solo aceptan una versión en borrador; `status` responde con cualquier versión propia (comprueba la autoría, no el estado), y un caso ajeno es 403 también en `status`. Apagado (`AI_AUTHORING_ENABLED=false`) las tres rutas responden 404 «El asistente no está disponible» y no tocan al proveedor; la propiedad del caso se revisa antes, así que un caso ajeno es 403 con la bandera como esté.

## Configuración

Variables del backend (`backend_django/psychosim/settings/base.py`, ejemplo en `.env.example`):

| Variable | Por defecto | Qué es |
|---|---|---|
| `AI_AUTHORING_ENABLED` | `false` | Interruptor. Apagado, todo el asistente responde 404 |
| `AI_AUTHORING_PROVIDER` | `anthropic` | Proveedor |
| `AI_AUTHORING_API_KEY` | vacía | La clave del proveedor. **Solo en el `.env` del servidor**, nunca en el repositorio, el navegador ni el chat. Sin clave, `status` dice `disabled` y `propose`/`guide` responden 502 |
| `AI_AUTHORING_MODEL_CAPABLE` | `claude-opus-5-5` | Modelo de `propose` |
| `AI_AUTHORING_MODEL_FAST` | `claude-haiku-5-5` | Modelo de `guide` |
| `AI_AUTHORING_DAILY_LIMIT_PER_USER` | `200` | Peticiones por docente y día |
| `AI_AUTHORING_MONTHLY_LIMIT` | `3000` | Peticiones de todo el programa por mes |
| `AI_AUTHORING_TIMEOUT_SECONDS` | `60` | Cuánto espera el servidor al proveedor (segundos), en `propose` y `guide`. Mantenerlo por debajo del `--timeout` de gunicorn (120 en el `Dockerfile`): mientras espera, un hilo del servidor queda ocupado |
| `AI_AUTHORING_MAX_TOKENS_PROPOSE` | `8000` | Tokens de salida que admite una propuesta (`propose`). La guía usa 600 fijos. Si la respuesta se corta por este tope, es un fallo `malformed` y responde 502 |

La clave nunca sale del servidor: al cliente solo llegan mensajes fijos, y al registro va solo el tipo de fallo del proveedor, no su texto.

## Tope de gasto

Cada `propose` y cada `guide` gasta un uso. El cupo se **reserva antes** de llamar al proveedor y se **devuelve si el proveedor falla** (502): una respuesta de error no gasta ayuda. Una propuesta inválida (422 `AI_PROPOSAL_INVALID`) y un rechazo del modelo (422 `AI_REFUSED`) sí lo gastan, porque la llamada ocurrió.

- **Diario por docente:** al llegar a `AI_AUTHORING_DAILY_LIMIT_PER_USER`, 429 `AI_LIMIT_EXCEEDED` con «Llegaste al límite de ayuda de la IA por hoy.»
- **Mensual global:** al llegar a `AI_AUTHORING_MONTHLY_LIMIT` entre todos los docentes, 429 `AI_LIMIT_EXCEEDED` con «El programa agotó la ayuda de la IA de este mes.»

Los usos se guardan por docente y día (`AuthoringAssistantUsage`, migración `0032_ai_suggested`). Un 429 no escribe fila de auditoría.

## Qué se envía a la IA y qué nunca

**Se envía:** la petición del docente (hasta 2000 caracteres), la pantalla del editor, el elemento elegido (hasta 200) y el contenido del caso que se está editando: título, escenas, líneas de diálogo, respuestas con su clase y sus efectos, salas y sus elementos, personajes, hitos, finales y nivel de riesgo (textos largos recortados a 600 caracteres). Para `guide`: el catálogo de acciones del editor (id, nombre, pantalla) y la pregunta (hasta 500).

**Nunca se envía:** intentos ni respuestas de estudiantes, reflexiones, cuentas, correos, grupos, auditoría, otros casos ni la clave de la API. El contexto se arma solo con el contenido del caso. El texto libre que el docente escribió en el caso y en su petición **sí viaja** a la IA tal cual: la regla es que el caso es ficticio y no lleva nombres ni datos de personas reales, y el servidor no lo comprueba.

## Auditoría

Cada `propose` y `guide` deja una fila:

| Acción | Taxonomía | Contexto guardado |
|---|---|---|
| `AI_AUTHORING_PROPOSE` | `asistente_autoria.proponer` | `screen`, `model`, `changes`, `duration_ms`, `outcome` |
| `AI_AUTHORING_GUIDE` | `asistente_autoria.guiar` | `model`, `changes`, `duration_ms`, `outcome` (sin `screen`: la guía no recibe pantalla) |

`outcome` es `ok`, `refusal`, `error` o `invalid`. **Nunca se guarda el texto de la petición ni el de la respuesta**; la pantalla se reduce a una palabra segura (`[a-z0-9_-]`, hasta 64). Aceptar una parte sugerida deja `ADMIN_ACCEPT_AI_NODE|DECISION|DIALOGUE|OBJECT` (`ia.aceptar_nodo|decision|dialogo|objeto`).

## Reglas de contenido

Se hacen cumplir en Python sobre lo que devuelve el modelo (`prompts.py`), sin IA y sin reescribir: lo que no cumple se rechaza con 422 `AI_PROPOSAL_INVALID` y un `motivo` fijo.

- **Lista gráfica** (violencia descrita con detalle explícito): ningún texto de la propuesta puede contenerla, nunca.
- **Lista revictimizante** (culpar, dudar, minimizar, presionar, acercar al agresor): solo se admite en una respuesta `CONTRAINDICATED` **con su razón** (`prohibitionReason`). Una `CONTRAINDICATED` sin razón también se rechaza.

Los marcadores son dos listas congeladas en español, comparadas sobre el texto en minúsculas, sin tildes ni puntuación. **Son un primer filtro, no el control:** una frase dañina puede no coincidir con ninguna. El control real es la marca «sugerido por la IA» más la revisión humana de cada parte antes de enviar el caso. Los textos y las listas son BORRADOR hasta que Psicología los apruebe.

**La IA no rebaja una respuesta que una persona dejó contraindicada.** `set-response-class` se rechaza (422 `AI_PROPOSAL_INVALID`) si la respuesta es hoy `CONTRAINDICATED`, o tiene razón de prohibición o conducta prohibida, y la clase nueva no es `CONTRAINDICATED`; no importa si su texto coincide o no con un marcador. Volver a proponer `CONTRAINDICATED` sí se admite.

## Las diez operaciones y cómo se aplican

Una propuesta trae hasta 12 cambios, cada uno con su `op`. El cliente los aplica sobre un borrador, con la revisión vigente, en `/api/authoring/cases/{id}/…`:

| Operación | Ruta de autoría |
|---|---|
| `add-scene` | `POST nodes` (`nodeKey` derivado del id, `title`, `narrative`, `intensity`, `warningMessage`) y `POST maps` con el `nodeId` creado; con `afterNodeId`, la escena se coloca a su lado |
| `add-line` | `POST maps/{mapId}/dialogues` (si la escena aún no tiene diálogo) o `PUT dialogues/{treeId}` agregando la línea al final (`speakerName` = nombre del personaje, `emotion` = `expression`) |
| `add-response` | `POST decisions` (`sourceNodeId`=`nodeId`, `targetNodeId`, `text`, `responseClass`, `feedbackText`, `prohibitionReason`; con `CONTRAINDICATED`, `prohibitedConduct=true`) |
| `place-character` | `POST maps/{mapId}/objects` (`objectType` PERSON, `characterId`, `x`, `y`) |
| `move` | `PUT objects/{objectId}` con la nueva `x`/`y` y el resto del objeto como está |
| `add-ending` | `PUT rules/endings` con los finales actuales más este |
| `set-response-class` | `PUT decisions/{decisionId}` (`responseClass`, `prohibitionReason`) |
| `set-persona-effect` | `PUT decisions/{decisionId}` mezclando `effects.persona` (`bond`/`activation`) |
| `mark-milestone` | `PUT decisions/{decisionId}` agregando la clave a `effects.milestones` |
| `set-intensity` | `PUT nodes/{nodeId}` (`intensity`, `warningMessage`) |

Una escena nueva usa un id temporal `nueva-N` que los cambios siguientes pueden nombrar. El asistente solo agrega o ajusta: nunca borra ni reescribe texto existente.

## La marca «sugerido por la IA»

- **Campos:** `ai_suggested` (API: `aiSuggested`) en nodo, decisión, objeto del mapa y línea de diálogo, y `aiSuggested` dentro de cada final (en el documento de reglas). Lo que viene de una propuesta entra con la marca en alto.
- **Bloqueo:** mientras quede una parte marcada, la compuerta devuelve el bloqueador `AI_SUGGESTED_UNREVIEWED` («N parte(s) sugeridas por la IA sin revisar.») y **no deja enviar a revisión ni aprobar**.
- **Quitarla:** `POST …/nodes/{id}/accept-ai`, `…/decisions/{id}/accept-ai`, `…/dialogues/{id}/accept-ai` (todas las líneas del diálogo) y `…/objects/{id}/accept-ai`. Cada una avanza la revisión del caso y devuelve el editor. También se baja reescribiendo la parte con `aiSuggested: false`; los finales se aceptan con `PUT rules/endings`.
- **Finales:** en `PUT rules/endings`, un final que **omite** `aiSuggested` conserva la marca guardada para esa misma `key` (una `key` nueva nace sin marca, así que renombrar un final marcado la suelta); `aiSuggested: false` explícito la baja y `true` explícito la sube. Omitirla nunca suelta la compuerta de publicación.
- **Clonar** una versión conserva la marca. **Exportar e importar NO la conserva** (el documento no la lleva), salvo en los finales, que la guardan dentro de las reglas.

## Códigos de error

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Cuerpo incompleto o fuera de límites (petición vacía o de más de 2000, pantalla vacía, más de 60 acciones…) o la versión no es un borrador |
| 403 / 404 | `FORBIDDEN` / `NOT_FOUND` | Caso ajeno / versión inexistente o asistente apagado |
| 409 | `REVISION_CONFLICT` | La revisión del caso está vencida (en `accept-ai`) |
| 422 | `AI_PROPOSAL_INVALID` | La propuesta no se pudo usar; el `motivo` fijo dice por qué (forma, ids que no existen, listas de contenido, más de 12 cambios) |
| 422 | `AI_REFUSED` | El modelo se negó a ayudar con esa petición |
| 429 | `AI_LIMIT_EXCEEDED` | Cupo diario o mensual agotado |
| 502 | `AI_PROVIDER_ERROR` | El proveedor no respondió o no hay clave; el cupo se devuelve |

El contrato tipado (OpenAPI → `frontend/src/app/core/api/generated/openapi-contracts.d.ts`) cubre `status`, `propose` y `guide` en las dos familias de rutas. Las rutas `accept-ai` devuelven el editor, que no tiene contrato tipado: se contrastan con el sobre genérico (200) y con el sobre de conflicto (409 `REVISION_CONFLICT`, que trae `revision` y `current`). Las tres rutas del asistente tienen casos reales de 401, 403 y 404 en las pruebas de contrato (`status` incluido).
