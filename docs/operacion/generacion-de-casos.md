# Generación de casos con IA por etapas

La docente describe una situación en pocas líneas, elige un lugar de la biblioteca y la IA escribe un **borrador** del caso, por partes: primero el esqueleto (el título y las escenas en orden) y después cada escena. Al final el servidor ensambla el documento del caso, lo valida y, si pasa, lo importa como borrador con todo marcado «Sugerido por la IA». **La IA nunca publica:** la docente revisa, acepta parte por parte y envía a revisión por la compuerta de siempre (ver [`asistente-de-autoria.md`](asistente-de-autoria.md) para la marca y el bloqueo `AI_SUGGESTED_UNREVIEWED`).

> Todos los textos que lee una docente (mensajes, avisos y motivos) son **BORRADOR** hasta que Psicología los apruebe. Las partes que se decidieron después de redactar el plan llevan la marca «añadido después del plan».

Este documento describe lo que hace el servidor y cómo operarlo. El cliente (el editor, bloque C2) se apoya en las mismas rutas.

## Cómo se enciende

Está **apagada por defecto** y comparte el interruptor del asistente de autoría. Para encenderla, en el `.env` del servidor (nunca en el repositorio, el navegador ni el chat):

```
AI_AUTHORING_ENABLED=true
AI_AUTHORING_PROVIDER=anthropic
AI_AUTHORING_API_KEY=<la clave, solo en el servidor>
```

Sin la bandera, todas las rutas de generación responden 404 «La generación con IA no está disponible.» salvo `GET …/generations/status`, que responde 200 con `enabled: false` para que el editor lo muestre como «No disponible». Con la bandera pero sin clave, `status` también dice `enabled: false` (el proveedor `fake` es la única excepción y solo existe para pruebas: producción lo rechaza). Django no lee el `.env` por sí solo: las variables deben estar en el entorno del proceso.

La generación también **exige la rúbrica por defecto** (`python manage.py seed_default_rubric`): sin ella `status` dice `enabled: false` y las demás rutas responden como apagadas (404), antes de crear nada o gastar una llamada. Lo mismo pasa con un proveedor que no sabe generar por etapas (hoy solo `anthropic`; `fake` en pruebas).

### Variables

| Variable | Por defecto | Qué es |
|---|---|---|
| `AI_AUTHORING_ENABLED` | `false` | Interruptor del asistente y de la generación |
| `AI_AUTHORING_PROVIDER` | `anthropic` | Proveedor (`fake` solo en pruebas y e2e) |
| `AI_AUTHORING_API_KEY` | vacía | La clave del proveedor; nunca sale del servidor |
| `AI_AUTHORING_MODEL_GENERATE` | `claude-fable-5-2` | Modelo que escribe el esqueleto y las escenas |
| `AI_AUTHORING_GENERATE_TIMEOUT_SECONDS` | `100` | Segundos que espera el servidor a cada llamada. Mantenerlo por debajo del `--timeout` de gunicorn (120 en el `Dockerfile`): mientras espera, un hilo del servidor queda ocupado |
| `AI_AUTHORING_GENERATIONS_PER_DAY` | `5` | Generaciones que puede **iniciar** una docente por día |
| `AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY` | `30` | Generaciones que pueden iniciar **todas las docentes juntas** por día (tope de gasto de la clave) |
| `AI_AUTHORING_GENERATION_MAX_CALLS` | `20` | Llamadas al proveedor que admite una sola generación (esqueleto, escenas y reparaciones) |
| `AI_AUTHORING_GENERATE_MAX_TOKENS` | `16000` | Tokens de salida de cada etapa |
| `AI_AUTHORING_GENERATE_EFFORT_SKELETON` | `high` | Esfuerzo del modelo en el esqueleto (`low`, `medium`, `high`, `xhigh` o `max`) |
| `AI_AUTHORING_GENERATE_EFFORT_SCENE` | `medium` | Esfuerzo del modelo en cada escena |
| `AI_AUTHORING_GENERATE_FALLBACKS` | `default` | Respaldo de la API ante una negativa del modelo; vacío lo apaga |

Las demás variables `AI_AUTHORING_*` (`MODEL_CAPABLE`, `MODEL_FAST`, `DAILY_LIMIT_PER_USER`, `MONTHLY_LIMIT`, `TIMEOUT_SECONDS`, `MAX_TOKENS_PROPOSE`) son del asistente por partes y siguen como están; la generación no las usa.

### Topes de gasto

- **Por generación:** `AI_AUTHORING_GENERATION_MAX_CALLS` corta los reintentos sin fin. Al llegar, la etapa responde 429 `GENERATION_CALLS_EXHAUSTED` («Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo.») y la docente tiene que empezar otra generación. La llamada se cuenta **antes** de hacerla: un fallo del proveedor sí la gasta.
- **Diario por docente:** `AI_AUTHORING_GENERATIONS_PER_DAY` cuenta las generaciones **creadas** hoy, y las canceladas cuentan. Al llegar, crear otra responde 429 `AI_LIMIT_EXCEEDED` con `scope: "daily"` («Llegaste al límite de casos generados por hoy.»). `status` informa cuántas le quedan (`remainingToday`, nunca negativo).
- **Diario global:** `AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY` cuenta igual (creadas hoy por todas, canceladas incluidas) y se comprueba dentro del mismo cerrojo de `start`. Al llegar, 429 `AI_LIMIT_EXCEEDED` con `scope: "daily"` y el texto «La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.» (BORRADOR).
- **Escenas a la vez:** como mucho 2 escenas de una generación pueden estar en curso; una tercera petición simultánea recibe 409 `GENERATION_BUSY` sin gastar llamada.
- Una docente tiene **a lo sumo una generación en curso** (restricción en la base). Intentar abrir otra responde 409 `GENERATION_IN_PROGRESS` con el id de la que sigue abierta («Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro.»). Una que no cambia hace más de 24 horas se cancela sola al crear otra o al leer `status`.

## Las rutas

Todas en `/api/authoring/generations` (canónico; no hay alias en `/api/admin`). Permiso: el de crear casos (PROFESOR y ADMIN; 401 sin sesión, 403 al ESTUDIANTE, y el permiso se revisa antes que el apagado). **Una generación solo la ve y la mueve su dueña:** la de otra persona es 404, también para el ADMIN. Cuerpos y errores van en el sobre de siempre, `{success, message?, data}` y `{success: false, code, message, field?}`.

| Ruta | Qué hace |
|---|---|
| `GET …/status` | Si está disponible (`enabled`), cuántas le quedan hoy (`remainingToday`) y la generación en curso (`inProgress`, o `null`). No gasta nada |
| `POST …/generations` | Abre una generación con `{lugarId, descripcion}` (201, estado `created`) |
| `GET …/generations/{id}` | Lee el avance. Sirve para volver tras cerrar la pestaña |
| `POST …/generations/{id}/skeleton` | Pide el esqueleto al proveedor (`skeleton_ready`) |
| `POST …/generations/{id}/scenes/{clave}` | Escribe la escena de esa sala; con `?repair=1` (o `true`), la rehace en una ronda de reparación; cualquier otro valor no vacío es 400 `VALIDATION_ERROR` con `field: "repair"` («El parámetro repair solo admite 1.») |
| `POST …/generations/{id}/assemble` | Ensambla, valida e importa: termina en `imported`, `needs_repair` o `failed` |
| `DELETE …/generations/{id}` | Cancela (`cancelled`) mientras no sea terminal |

`{id}` es un UUID. `{clave}` es el id de la sala del lugar: en un caso generado cada escena ocupa una sala distinta y su clave es la de la sala.

### La generación

Además del `id`, la `lugarId` y la `descripcion`, la respuesta trae:

- `status`: `created`, `skeleton_ready`, `scenes_ready`, `needs_repair`, `imported`, `failed` o `cancelled`.
- `skeleton`: `null` hasta que el esqueleto esté listo; luego el título y las escenas en orden (la primera es la de inicio), cada una con `clave`, `titulo` y `final`.
- `scenes[]`: una por escena del esqueleto, con `state` (`pending`, `running`, `done` o `error`) y `error` (`{kind, message}` o `null`).
- `repairRounds` (0, 1 o 2; las cuenta el servidor) y `repair` (`null`, o `{round, scenes, issues}` mientras el estado es `needs_repair`).
- `lastError`: `null` o `{stage, clave, kind, message}` con la etapa (`skeleton`, `scene` o `assemble`); se borra cuando esa misma etapa sale bien.
- `caseVersionId`: el borrador creado, solo con `imported`.
- `issues`: **solo se llena con `imported` y `failed`**. Con `imported`, las faltas que quedan (irán a «Por resolver» en el editor); con `failed`, las que impidieron importar. Cada una es `{code, severity, message, path?}`, la misma forma que `validate`. **Solo lleva faltas de severidad `error`**: los avisos del validador no se incluyen.
- `callsUsed` y `callsLimit`: las llamadas gastadas y el tope por generación.
- `createdAt` y `updatedAt`: UTC, `YYYY-MM-DDTHH:MM:SSZ` (el servidor convierte la hora local de `TIME_ZONE`).

La respuesta **nunca trae el documento guardado ni texto del modelo** salvo los títulos del esqueleto y de las escenas.

### Estados y transiciones

```
created ──skeleton──▶ skeleton_ready ──(cada escena)──▶ scenes_ready ──assemble──▶ imported
                                                              │                └─▶ failed
                                                              └──assemble──▶ needs_repair ──scenes?repair=1──▶ scenes_ready
cualquier estado no terminal ──DELETE──▶ cancelled
```

- Una etapa que falla **no cambia el estado**: deja `lastError` (y la escena en `error`) y se puede volver a pedir. La generación sigue retomable.
- `skeleton` se admite en `created`. `scenes/{clave}` en `skeleton_ready`, para una escena `pending` o `error`; cuando la última escena queda `done`, el estado pasa a `scenes_ready`. `assemble` se admite en `scenes_ready`. Cualquier otro paso responde 409 `GENERATION_STATE` («Ese paso no corresponde ahora. Vuelve a cargar el avance.»).
- **`imported`:** el documento pasa, o ya no quedan rondas (`repairRounds == 2`) y solo quedan faltas editoriales (`DSL.OCL-*`, `DSL.PROP-*`, `DSL.TEXT_*`). Se crea el borrador y `issues` guarda lo que queda.
- **`needs_repair`:** hay faltas atribuibles a alguna escena y quedan rondas. `repairRounds` sube, `repair` lista las escenas y sus faltas y esas escenas vuelven a `pending`. Se rehacen con `scenes/{clave}?repair=1` (solo las de `repair.scenes`; si no, 409 `GENERATION_STATE`).
- **`failed`:** quedan errores que impiden importar (`DSL.FORMA`, `DSL.LIMIT_EXCEEDED`, `DSL.SIEP_*`, `DSL.EXECUTION_NOT_IMPORTABLE`, o un documento que no se puede convertir) y no quedan rondas, o ninguno es atribuible a una escena. **No se crea nada**: no queda ningún caso ni versión a medias. La generación guarda el documento para diagnóstico; la API no lo devuelve.
- Una escena o el esqueleto «en curso» hace más de **150 segundos** se considera abandonado: se puede pedir de nuevo, y la vista ya lo muestra así (la escena con `state: "error"` y `error.kind: "timeout"`; el esqueleto, como `lastError` de etapa `skeleton` y `kind: "timeout"`), sin cambiar lo guardado. Pedir a la vez la misma parte dos veces da 409 `GENERATION_BUSY` a la segunda («Esta parte ya se está escribiendo. Espera un momento.») sin gastar otra llamada.

### Errores del proveedor

Cada fallo deja su mensaje fijo y nunca cita lo que dijo el modelo ni la docente:

| Fallo | Respuesta | Mensaje (BORRADOR) |
|---|---|---|
| `timeout` | 502 `AI_PROVIDER_ERROR`, `kind: "timeout"` | «La IA tardó demasiado en responder. Vuelve a intentarlo.» |
| `http` | 502 `AI_PROVIDER_ERROR`, `kind: "http"` | «No pudimos hablar con la IA. Vuelve a intentarlo en un momento.» |
| `malformed` | 502 `AI_PROVIDER_ERROR`, `kind: "malformed"` | «La IA respondió algo que no pudimos usar. Vuelve a intentarlo.» |
| `refusal` | 422 `AI_REFUSED` | «La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.» |

Otros textos fijos de la creación: lugar que no existe, 404 («La generación con IA no está disponible.» si está apagada); `descripcion` corta, 400 `VALIDATION_ERROR` con `field` (`lugarId` o `descripcion`) «Cuéntanos un poco más: al menos 40 caracteres.»; larga, «La descripción puede tener hasta 2000 caracteres.»

## Qué se hace en Python y qué se le pide a la IA

**Python nunca confía en el modelo.** Toda salida pasa por `checks.py` (forma, referencias, vocabulario, topes y el filtro de contenido gráfico y revictimizante del asistente) antes de guardarse, y el documento ensamblado pasa por la validación del documento del caso antes de importarse. Lo que `checks` rechaza cuenta como `malformed`. Entre otras cosas, rechaza que una escena pida en `requiere` o en `cuando` algo que no está en su sala, una herramienta o un hito que el caso no declara.

## Añadido después del plan

Decisiones posteriores a la redacción del plan (BORRADOR para Psicología):

- **Datos personales en la descripción.** Una `descripcion` con un correo, un teléfono o un número de documento se rechaza con 400 `VALIDATION_ERROR`, `field: "descripcion"` y el motivo fijo de `generation/checks.py` (`PERSONAL_DATA_MOTIVO`): «La descripción parece traer datos reales de una persona (correo, teléfono o número de documento). Cuéntala sin datos que identifiquen a nadie.» No se crea nada ni se llama al proveedor. El editor (bloque C2) muestra el aviso «no escribas datos reales de personas» **antes** del cuadro de texto: el servidor es la red de seguridad, no la primera línea.
- **Otros textos fijos del servicio** que no están en la tabla del contrato: la descripción debe ser texto plano, «La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales.» (400, `field: "descripcion"`); lugar sin elegir, «Elige el lugar donde pasa el caso.» (400, `field: "lugarId"`); y la generación que no existe o es de otra persona, «La generación no existe.» (404).
- **Lo que viaja al modelo.** La descripción, el esqueleto y la escena anterior viajan como **bloques de datos delimitados**, no como instrucciones: el modelo los lee como material y no como órdenes. La descripción llega entera al proveedor; por eso el aviso de arriba y el inventario de datos la tratan como sensible (`authoring_generations` en `docs/seguridad/inventario-de-datos.md`).
- **Hasta 4 respuestas por decisión.** El juego muestra las opciones como A–D, así que el esqueleto y las escenas no pueden traer más de cuatro respuestas por decisión.
- **Una escena rechazada por las comprobaciones de Python se reintenta como reparación**, con las faltas fijas que `checks` encontró, en lugar de quedar como un error sin más: la docente la vuelve a pedir con el mismo botón y el servidor manda la escena anterior y las faltas a corregir.
- **Falta sin escena.** Con rondas de reparación todavía disponibles, si una falta que impide importar no se puede atribuir a ninguna escena, `assemble` termina en `failed` de inmediato: reparar no tendría a quién pedírselo.
- **`issues` solo se llena en `imported` y `failed`.** En `needs_repair` va vacío y las faltas por escena viajan en `repair.issues`.

## Auditoría

Cada paso deja una fila `AI_AUTHORING_GENERATE` (`asistente_autoria.generar`, recurso `CASE_GENERATION`) con el id de la generación, la etapa (`start`, `skeleton`, `scene`, `assemble` o `cancel`), el modelo, la duración, el resultado, el tipo de fallo, los tokens y la ronda de reparación. **Nunca la descripción ni texto del modelo** (la lista blanca de campos lo garantiza). Leer `status` y una generación propia no deja fila.

## Datos de personas

La tabla `authoring_generations` guarda lo que escribió la docente y lo que el modelo escribió a partir de ello. Está clasificada en el inventario de datos: `owner_id` es personal; `description`, `skeleton_json`, `scenes_json`, `report_json` y `document_json` son sensibles (`document_json` no sale por ningún canal). Al exportar los datos de una persona salen `lugar_id`, `description`, `status` y `created_at`; al suprimirla, **la fila se borra entera**. El caso importado, si lo hubo, es contenido del programa y queda.
