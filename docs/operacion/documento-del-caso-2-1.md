# Documento del caso 2.1

Contrato de lo que añade la versión 2.1 del documento del caso (DSL + `x-siep`): cuatro campos nuevos, cuatro reglas de validación, lo que cambia en la API del juego y en la API de autoría, y el ensayo del borrador. El cliente del juego y la generación de casos con IA se construyen contra este documento. Cada nombre, forma y valor sale del código del servidor (`backend_django/apps/simulation/`); si algo no coincide, manda el código.

## 1. Los cuatro campos nuevos

Todos viven en `x-siep.escenas[]`.

| Campo | Dónde | Forma | Por defecto | Tope |
|---|---|---|---|---|
| `requiere` | `x-siep.escenas[].opciones[]` | condición (sección 2) | `{}`: siempre disponible | JSON de 2.000 caracteres (solo la API de autoría lo comprueba) |
| `reaccion` | `x-siep.escenas[].opciones[]` | `{linea?, emocion?, gesto?, personaje?}` | `{}`: la reacción por defecto | `linea` 400 caracteres |
| `objetivo` | `x-siep.escenas[]` | texto | vacío: la escena no lo declara | 200 caracteres |
| `comentarios` | `x-siep.escenas[]` | lista de `{personaje, linea, cuando?, emocion?, gesto?}` | `[]`: la escena no tiene comentarios | 6 por escena; `linea` 400 caracteres; `cuando` 2.000 caracteres de JSON |

**`reaccion`** admite solo esas cuatro claves. `emocion` ∈ `neutral`, `alegre`, `preocupada`, `triste`, `cautelosa`, `en-crisis`. `gesto` ∈ `se-acerca`, `asiente`, `se-aparta`, `baja-la-mirada`, `se-agita`. `personaje` es la clave de un personaje del caso. `linea` y `objetivo` son texto plano de **una línea**: sin saltos de línea, sin HTML y sin enlaces (tampoco `https`).

**`comentarios`** es lo que dice una persona de la sala cuando el estudiante se le acerca. Cada comentario admite solo esas cinco claves: `personaje` (la clave de un personaje del caso, **obligatoria**: tiene que ser una PERSON visible del mapa de la propia escena), `linea` (**obligatoria**, texto plano de una línea de hasta 400 caracteres), `cuando` (opcional: una condición con hechos, la misma gramática de la sección 2, JSON de hasta 2.000 caracteres; ausente o `{}` = sin condición, se dice siempre), y `emocion` y `gesto` (opcionales, mismos vocabularios que `reaccion`). Una escena admite hasta 6. Se dicen en el orden del documento. Un comentario con `cuando` espera a que el estudiante explore lo que la condición pide; el estudiante nunca ve la condición.

**Versión del documento.** `x-siep.version` es `"2.1"` solo si alguna opción trae `requiere` o `reaccion`, o alguna escena trae `objetivo` o `comentarios`; si no, es `"2.0"`. Los campos nunca se escriben vacíos: `requiere: {}`, `reaccion: {}`, `objetivo: ""` o `comentarios: []` no se exportan. Un caso sin campos nuevos se exporta igual que antes, con `"2.0"`, y la huella sellada de las versiones ya publicadas no cambia. El importador lee `x-siep.version` 1.0 (la convierte), 2.0 y 2.1.

La columna del modelo es `DecisionOption.requires_json` / `reaction_json`, `SimulationNode.goal` y `SimulationNode.comments_json`.

```json
{
  "clave": "h1-pap-contencion",
  "clase": "RECOMMENDED",
  "requiere": { "all": [ { "talked": "enfermera-urgencias" }, { "used": "PAP" } ] },
  "reaccion": {
    "emocion": "triste",
    "gesto": "se-acerca",
    "linea": "(La abuela respira un poco más despacio y te sostiene la mirada.) Gracias por quedarse… nadie nos había explicado nada. Solo díganme la verdad cuando se pueda."
  }
}
```

(Recortado de `data/cases/SIM-VBG-001.dsl.json`, escena E01; se omiten `id`, `efectos` y la retroalimentación.)

Un comentario, de la misma escena E01 (contenido borrador, sección 6):

```json
{
  "personaje": "familia-crisis",
  "linea": "Dicen que no podemos pasar por ahí… ¿qué es lo que no nos quieren decir?",
  "cuando": { "inspected": "zona-restringida" },
  "emocion": "en-crisis",
  "gesto": "se-agita"
}
```

## 2. La gramática de `requiere`

Una condición es un árbol JSON que se evalúa sin `eval`. Es la misma de los finales del caso (`casedef/conditions.py`), con cuatro hechos de exploración más.

| Forma | Se cumple cuando |
|---|---|
| `{"all": [c, …]}` | todas se cumplen (lista vacía: sí) |
| `{"any": [c, …]}` | alguna se cumple (lista vacía: no) |
| `{"not": c}` | `c` no se cumple (y `c` es válida: la negación de algo roto sigue siendo falsa) |
| `{"milestone": "clave"}` | el hito está cumplido |
| `{"count": "clase", "gte"\|"gt"\|"lte"\|"lt"\|"eq": n}` | las respuestas de esa clase cumplen **todos** los comparadores. Clases: `recommended`, `acceptable`, `risky`, `contraindicated` |
| `{"persona": {"bond": v, "activation": v}}` | la persona consultante tiene ese estado (basta una dimensión; si vienen las dos, se cumplen ambas). `bond` ∈ `WITHDRAWN`, `GUARDED`, `OPEN`; `activation` ∈ `CALM`, `TENSE`, `CRISIS` |
| `{"talked": "clave"}` | ya habló con ese personaje (PERSON del mapa o personaje de ambiente) |
| `{"inspected": "clave"}` | ya inspeccionó ese objeto |
| `{"has": "COD"}` | tiene ese ítem o herramienta en el inventario |
| `{"used": "COD"}` | ya usó esa herramienta. Cuenta `COD` y también `COD@objetivo`: `{"used": "PAP"}` se cumple con `PAP@familia`; `{"used": "PAP@familia"}` solo con ese uso |

Reglas:

- **Profundidad máxima: 12.** La raíz es el nivel 0; más allá es dato roto.
- **Ausente = `{}` = siempre disponible.** `null` y `{}` son lo mismo.
- **Dato malformado = no disponible.** Una clave desconocida, un tipo equivocado, un hecho con claves de más o una condición muy anidada evalúan a falso: nunca rompen la partida. Un `requires_json` guardado que no es JSON, no es objeto o no es una condición válida cuenta como «no disponible» (no como «sin requisito»).
- Los hechos solo son válidos en requisitos de opciones y en el `cuando` de los comentarios; en los finales no.
- Una condición con forma inválida es el hallazgo `DSL.SIEP_CONDITION` (`siep_check`), también la del `cuando` de un comentario.
- **Un `cuando` malformado hace que el comentario no se diga** (en el juego nunca rompe la partida); no vuelve «sin condición».

### Alcance por sala

- `talked` e `inspected` (también en el `cuando` de un comentario) cuentan **solo en la sala del mapa de la ESCENA** (el nodo actual del intento). La sala se identifica por `ambient.salaId` del mapa o, si falta, por la clave del mapa (`map_key`). Dos escenas cuyos mapas son la misma sala comparten hechos.
- `has` y `used` valen para **todo el intento**, sin importar la sala.
- Al explorar, el servidor registra el hecho en `flags.exploredBySala[<sala>] = {talked: [...], inspected: [...]}`, bajo la sala **donde está físicamente el estudiante** en ese momento (el mapa de su estado del mundo). Al evaluar un requisito, lee la sala del **mapa de la escena**.
- Esa diferencia importa: la sala que cuenta es la del mapa de la escena, no la sala donde el estudiante está parado al decidir. Ejemplo: una opción de la escena A pide `{"talked": "enfermera"}`. Si el estudiante habló con la enfermera estando en la sala de la escena B (otro mapa), el hecho quedó anotado bajo la sala de B y **no cuenta** para A. En SIM-VBG-001 las decisiones se toman en la sala de la escena siguiente, así que el autor debe pedir hechos de la sala de la escena que ofrece la opción, no de donde se decide.
- **Intentos anteriores al cambio** (sin `exploredBySala`) usan las listas globales del mundo: `flags.viewedNpcKeys` (talked) y los objetos inspeccionados (inspected).
- **Al crearse el registro por sala** (primer hecho de un intento que ya tenía exploración global), el servidor guarda una foto de lo explorado hasta entonces en `flags.exploredBeforeSala = {talked: [...], inspected: [...]}`. Esa foto cuenta **en todas las salas**, sumada a lo de la sala.
- Ninguno de estos registros llega al estudiante: al estudiante solo se le sirve `flags.viewedNpcKeys` (lista blanca `STUDENT_FLAG_KEYS`). La traza docente conserva `flags` completo.

## 3. Reglas de validación OCL-09 a OCL-12

Son del servidor (no del taller de DSL), viven en `casedef/rules_xsiep.py` y corren siempre junto a las demás reglas del documento. OCL-10, OCL-11 y OCL-12 miran también los comentarios de cada escena (versión 2.1). Leen `x-siep`; lo que no tiene la forma esperada lo ignoran (la forma la vigila `siep_check`). Todos sus hallazgos son de gravedad ERROR, así que **bloquean la publicación**; OCL-09 es la que más se verá en la práctica.

| Regla | Enunciado | Qué comprueba | NO_APLICA cuando |
|---|---|---|---|
| OCL-09 | Toda decisión ofrece al menos una opción sin requisito | en cada escena con opciones, que no todas tengan `requiere` no vacío (`{}` y ausente = sin requisito) | el caso no tiene decisiones |
| OCL-10 | Todo lo que un requisito nombra existe y se puede conseguir | `talked`: la clave es una PERSON visible del mapa de la escena o un personaje de `ambiente.ambientNpcs`; `inspected`: es un objeto visible del mapa de la escena; `has`/`used`: la herramienta está declarada en `herramientas` y algún objeto de algún mapa la entrega; `milestone`: el hito está en `reglas.milestones` (incluso dentro de `not`, `all`, `any`). Lo mismo para el `cuando` de cada comentario | ninguna opción declara requisito **ni** hay comentarios con `cuando` (un requisito o `cuando` de forma inválida no se evalúa aquí: lo señala `DSL.SIEP_CONDITION`) |
| OCL-11 | La emoción y el gesto de una reacción pertenecen a su vocabulario | `reaccion.emocion` ∈ `EXPRESSIONS` y `reaccion.gesto` ∈ `GESTURES`, cuando vienen (vacío se ignora); lo mismo para `emocion` y `gesto` de cada comentario. La `linea` y el `personaje` no se miran aquí | ninguna opción ni comentario declara reacción |
| OCL-12 | Quien reacciona está presente en la sala de la escena | con `personaje`: hay una PERSON visible con ese personaje en la sala de la escena. Sin `personaje`: alguna PERSON ofrece la opción (por su `opcion` o por una elección de su diálogo). «La sala de la escena» es el mapa de la escena **o cualquier mapa del documento donde una PERSON ofrece esa opción**. Un comentario es más estricto: solo se dice en la sala de su propia escena, así que su `personaje` tiene que ser el de una PERSON visible de **ese** mapa | ninguna opción ni comentario declara reacción |

Una opción sin `clave` no puede ser ofrecida por nadie, así que una reacción sin `personaje` en ella incumple OCL-12.

## 4. API del juego

Rutas bajo `/api/…/attempts/{id}/…`, dentro del sobre `{success, message?, data}`. Ninguna cifra, clase ni condición llega al estudiante en lo que sigue, salvo donde se dice.

### 4.1 La escena y sus opciones

`currentNode` (en el estado del intento: inicio, lectura, reanudación y toda respuesta de decisión) añade:

- `goal`: el objetivo de la escena; `""` si no lo declara.
- `options`: **solo las ofrecidas**, cada una `{id, text}`. Es `[]` si el intento no está EN JUEGO o la escena es terminal.

Una opción se ofrece si su requisito se cumple con lo que el intento lleva (hitos, persona, conteos y hechos de exploración de la sala de la escena). **Nunca sin salida:** si ninguna opción de la escena cumple, se ofrecen todas (y el servidor deja un aviso en el registro).

### 4.2 `world.decisionOptions`

`world.decisionOptions` es `[{id, text}, …]`: las mismas opciones que `currentNode.options`, calculadas con el estado del mundo recién guardado, para que el cliente sepa qué se ofrece sin pedir el estado entero. Aparece en toda respuesta que lleva el mundo del estudiante:

| Ruta | Dónde |
|---|---|
| `GET …/world` | raíz de `data` |
| `POST …/interactions/{clave}` (hablar, revisar) | `data.world` |
| `POST …/tools/use` | `data.world` (también en la repetición: `alreadyUsed: true`) |
| `POST …/npcs/{clave}` (registrar personaje de ambiente) | raíz de `data` |
| `POST …/enter-room` | raíz de `data` |
| `PATCH …/world-state` | solo en el eco por cambio de sala; el acuse normal de posición (`attemptId`, `status`, `map`, `player`) **no** la lleva |
| Repeticiones de órdenes ya procesadas | el mundo actual, con la lista |

Es `[]` cuando el intento no está EN JUEGO, la escena es terminal, o la vista es la **traza docente** (`world_for_attempt`, `estudiante = false`).

> **Nota para el bloque B.** El cliente actual ya reemplaza `attempt.currentNode.options` con `world.decisionOptions` cuando una respuesta de mundo trae esa clave y el intento está en juego (`applyDecisionOptions` en `frontend/src/app/features/simulator/simulation-play.component.ts`).

### 4.3 Elegir una opción no ofrecida

`POST …/decisions` con una opción que la escena actual no ofrece responde 400:

```json
{ "success": false, "code": "VALIDATION_ERROR", "message": "Esa respuesta no está disponible todavía." }
```

Sin `field`. El texto es BORRADOR (sección 6). La comprobación ocurre después de las demás (la decisión existe, pertenece a la escena actual y al caso del intento) y se revalida con el contexto de ese instante.

### 4.4 `reaction` en la respuesta de una decisión

La respuesta de `POST …/decisions` lleva siempre `reaction`: un objeto o `null`.

```json
{
  "success": true,
  "message": "Decision procesada",
  "data": {
    "attempt": { "attemptId": "…", "currentNode": { "goal": "…", "options": [ { "id": 41, "text": "…" } ] }, "…": "estado del intento, como siempre" },
    "consequence": { "text": "…", "source": "OPTION" },
    "reaction": {
      "line": "(La abuela respira un poco más despacio y te sostiene la mirada.) Gracias por quedarse…",
      "emotion": "triste",
      "gesture": "se-acerca",
      "objectKey": "familia-duelo"
    }
  }
}
```

| Campo | Cómo se resuelve |
|---|---|
| `line` | `reaccion.linea` tal cual; `""` si no hay |
| `emotion` | `reaccion.emocion` si es del vocabulario; si no, `null`: el cliente usa la cara del estado de la persona |
| `gesture` | `reaccion.gesto` si es del vocabulario; si no, el **gesto por defecto** de la clase de la respuesta (abajo) |
| `objectKey` | la clave de la PERSON que reacciona; `null` si no se halla |

**Gesto por defecto.** `RECOMMENDED` → `se-acerca`; `ACCEPTABLE` → `asiente`; `RISKY` → `baja-la-mirada`; `CONTRAINDICATED` → `se-aparta`, o `se-agita` si la activación de la persona es `CRISIS`. Una clase ilegible cae en `asiente`, nunca en `se-aparta`. La activación es la **posterior** a aplicar la decisión; en la segunda oportunidad y en una repetición, la actual.

**`objectKey`.** Se buscan solo PERSON visibles de los mapas de la versión.
- Con `reaccion.personaje`: la PERSON con ese personaje, primero en el mapa donde está el estudiante, luego en el mapa de la escena. No hay más búsqueda: si no está en ninguno, `null`.
- Sin `personaje`: la PERSON que ofrece la opción (por su `opcion` o por una elección de su diálogo), buscada primero en el mapa donde está el estudiante, luego en el de la escena y, al final, en **cualquier mapa** de la versión (cada decisión la ofrece una PERSON del mapa donde se elige, que puede no ser el de la escena).

**`reaction` es `null`** solo si no se halló `objectKey` **y** no hay `line`. Con `line` y sin `objectKey`, se devuelve con `objectKey: null`.

También hay `reaction` en la respuesta de la segunda oportunidad (`consequence: null` y `retry: {allowed, message}`) y en las repeticiones de una decisión ya procesada. **Nunca lleva la clase de la respuesta**: del gesto se infiere, pero no se declara. «El mapa donde está el estudiante» es el de su estado del mundo al decidir; si no hay estado del mundo, es desconocido y solo cuentan el mapa de la escena y el resto.

### 4.5 El informe de cierre: `decisionReview[].missed`

El informe congelado sube a `schemaVersion 4`. Cada entrada de `decisionReview[]` gana `missed`: las respuestas de **esa escena** que no se ofrecieron porque faltaba algo por explorar; `[]` si se ofrecieron todas.

```json
"missed": [
  {
    "optionId": 41,
    "text": "…",
    "class": "RECOMMENDED",
    "missing": [
      { "kind": "talked", "key": "enfermera-urgencias", "label": "Enfermera de urgencias" },
      { "kind": "used", "key": "PAP", "label": "Primeros auxilios psicológicos" }
    ]
  }
]
```

- `kind` ∈ `talked`, `inspected`, `has`, `used`. Solo se listan **hechos de exploración que no se cumplen**. Lo que está dentro de un `not` no se lista. Los hitos, los conteos y la persona no se listan; una opción retenida solo por ellos aparece con `missing: []`.
- Una opción cuyo requisito está ilegible (retenida por dato roto) también aparece, con `missing: []`.
- Si un `any` no se cumple, se listan todos sus hechos que fallan (aunque bastara uno).
- `label` sale de: `inspected` → la etiqueta del objeto del mapa de la escena; `talked` → la etiqueta del objeto (una PERSON del mapa) o, si es un personaje de ambiente, `name`, `label` o `displayName` de su entrada en `ambientNpcs` (en ese orden); `has`/`used` → la etiqueta de la herramienta del caso. Si no se halla, `label` es la clave. Un `used` de la forma `COD@objetivo` no coincide con ningún código de herramienta y lleva la clave.
- A cada decisión registrada le corresponde el último evento `OPTIONS_NOT_OFFERED` anterior de su mismo nodo. El juego lo guarda justo antes de la decisión **registrada** y solo si hubo opciones retenidas; la primera respuesta de una segunda oportunidad no lo guarda. Su detalle es `{"v": 1, "options": [{"id": n, "unmet": [[tipo, clave], …]}]}`.
- **`OPTIONS_NOT_OFFERED` no aparece** en la línea de tiempo del informe (no está en `TIMELINE_EVENT_TYPES`) ni en la traza docente (`events` lo filtra). Es contabilidad del informe.
- **Los informes `schemaVersion` 3 o anteriores se leen tal cual, sin `missed`.** Un informe cerrado no se recalcula.

### 4.6 `world.comments`

`world.comments` es la lista de los comentarios de la escena que se dicen **ahora**, junto a `world.decisionOptions` y en las mismas respuestas (tabla de 4.2). Se calculan con el mismo contexto que las opciones: un comentario sin `cuando` se dice siempre; uno con `cuando` solo cuando lo explorado en la sala de la escena lo cumple (`talked`, `inspected`, y `has`, `used`, hitos, persona y conteos del intento).

```json
"comments": [
  { "id": "12-1", "objectKey": "familia-crisis", "line": "Dicen que no podemos pasar por ahí…", "emotion": "en-crisis", "gesture": "se-agita" }
]
```

| Campo | Cómo se resuelve |
|---|---|
| `id` | `<id de la escena>-<posición del comentario en el documento>`, texto |
| `objectKey` | la clave de la PERSON visible que lo dice: la del personaje del comentario, primero en el mapa donde está el estudiante y luego en el de la escena. Si no está en ninguno, el comentario **no se sirve** |
| `line` | `linea` tal cual |
| `emotion`, `gesture` | los del comentario si son del vocabulario; si no, `null` (el cliente usa la cara del estado de la persona) |

- **La condición nunca viaja:** solo esos cinco campos. Mostrarla le diría al estudiante qué le falta explorar.
- Orden: el del documento. Lista vacía `[]` cuando no hay comentarios pendientes, el intento no está EN JUEGO, la escena es terminal, o la vista es la **traza docente**.
- Un `cuando` malformado hace que ese comentario no se diga; un `comments_json` guardado que no se lee es `[]`. Nunca rompen la partida.

## 5. API de autoría

Rutas bajo `/api/authoring/cases/{versionId}/…` (permiso de autoría, caso en borrador).

| Ruta | Campos nuevos |
|---|---|
| `POST …/nodes`, `PUT …/nodes/{id}` | `goal` (texto), `comments` (lista de comentarios) |
| `POST …/decisions`, `PUT …/decisions/{id}` | `requires` (objeto), `reaction` (objeto) |
| `GET …/editor` | `nodes[].goal`, `nodes[].comments`, `decisions[].requires`, `decisions[].reaction`, `rehearsedToEnd` |

Los nombres cambian respecto del documento: `requires`/`reaction`/`goal`/`comments` en la API; `requiere`/`reaccion`/`objetivo`/`comentarios` en el documento. Dentro de cada comentario las claves son las del documento (`personaje`, `linea`, `cuando`, `emocion`, `gesto`).

**Ausente = no tocar. `null` o `{}` = limpiar** (`requires` y `reaction` quedan `{}`; `goal` queda `""`; `comments` con `null` o `[]` queda `[]`).

Validaciones (400 `VALIDATION_ERROR`, con `field` en la raíz del cuerpo):

| Campo | Regla | `field` | Mensaje (BORRADOR) |
|---|---|---|---|
| `goal` | texto plano de una línea, hasta 200 caracteres | `goal` | los del texto plano: «Debe ser texto plano, sin enlaces.», «No puede superar los 200 caracteres.», «Debe escribirse en una sola línea.»… |
| `requires` | condición válida con hechos, JSON de hasta 2.000 caracteres | `requires` | «El requisito no es una condición válida del vocabulario del caso.» / «El requisito es demasiado largo: el máximo es 2000 caracteres.» |
| `reaction` | objeto; solo `linea`, `emocion`, `gesto`, `personaje`; cada una texto | `reaction` | «La reacción debe ser un objeto con linea, emocion, gesto y personaje.» / «La reacción no admite «x»: solo linea, emocion, gesto, personaje.» / ««x» de la reacción debe ser un texto.» / «La emoción «x» no existe: …» / «El gesto «x» no existe: …» / «El caso no tiene el personaje «x».» |
| `reaction.linea` | texto plano de una línea, hasta 400 caracteres | `reaction` | los del texto plano |
| `comments` | lista de hasta 6 objetos; cada uno con `personaje` (de un personaje del caso) y `linea`; admite además `cuando`, `emocion`, `gesto` y nada más; los vacíos (`""`, `null`, `{}`) se omiten | `comments` | «Los comentarios deben ser una lista.» / «Una escena admite hasta 6 comentarios.» / «Cada comentario debe ser un objeto con personaje y linea.» / «El comentario no admite «x»: solo personaje, linea, cuando, emocion, gesto.» / «La condición del comentario no es válida en el vocabulario del caso.» / «La condición del comentario es demasiado larga: el máximo es 2000 caracteres.» / ««x» del comentario debe ser un texto.» / «El caso no tiene el personaje «x».» / «Cada comentario necesita personaje y linea.» |
| `comments[].linea` | texto plano de una línea, hasta 400 caracteres | `comments` | los del texto plano |

La reacción guardada solo conserva las claves **no vacías** (`""` y `null` se descartan). `requires` se guarda tal cual llega. Esta validación no comprueba que los hechos y los hitos existan en el caso: eso lo hacen OCL-10 y la compuerta de publicación.

**Lectura del editor.** `decisions[].requires` y `decisions[].reaction` salen siempre, como objeto (`{}` si no hay o si lo guardado está roto: la lectura del editor es indulgente, la del juego no). `nodes[].goal` sale siempre, `""` si no hay. `nodes[].comments` sale siempre, como lista: cada comentario con sus claves del documento (`personaje`, `linea` y, si están, `cuando`, `emocion`, `gesto`); `[]` si no hay, si lo guardado está roto o no es una lista, y se salta lo que no trae `personaje` y `linea` de texto.

**`rehearsedToEnd`.** `GET …/editor` lleva en la raíz `rehearsedToEnd` (booleano): `true` si quien pide ya llevó **un ensayo de esta versión hasta un final** (un ensayo COMPLETADO suyo; los de otras personas no cuentan). **La clave aparece solo en `GET …/editor`.** Las respuestas de las mutaciones de autoría (nodos, decisiones, mapas, personajes, grafo…) devuelven la misma vista del editor pero **sin** saber quién pide: ahí `rehearsedToEnd` **no viene** (no un `false` engañoso). El cliente no debe leerlo de una mutación; tras mutar, vuelve a pedir el `GET` si lo necesita.

## 6. Pendientes y borradores

- **Textos nuevos del servidor, marcados BORRADOR en el código** (pendientes de la aprobación de Psicología, VD-23): «Esa respuesta no está disponible todavía.», los mensajes de OCL-09 a OCL-12, el de `DSL.SIEP_CONDITION` para el requisito, los de `validate_requires` y `validate_reaction`, y los textos de los topes de `linea` y `objetivo`.
- **Contenido clínico de SIM-VBG-001 2.1.0:** los requisitos, las reacciones, los objetivos y los comentarios son un **borrador por confirmar con Psicología**. Los comentarios (E01, E02 y E05: uno sin `cuando` y otro tras inspeccionar un objeto de su propia sala) los dice la persona que el estudiante atiende en esa sala, en una línea y sin juicio clínico nuevo.
- Los textos nuevos del servidor del ensayo (`REHEARSAL_GONE`, `REHEARSAL_CLOSED`, los 400 de `PATCH`, los avisos del bloque) también son BORRADOR.
- **Personas de ambiente en `missed`:** para que una persona de ambiente salga con nombre, su entrada en `ambientNpcs` debe traer `label` (el servidor también lee `name` y `displayName`, en el orden `name`, `label`, `displayName`). Sin ninguno, sale con su clave.

## 7. El ensayo del borrador

La docente dueña del caso (o el ADMIN) juega su **borrador** en el juego real, sin publicar, y ve por qué una respuesta no aparece y qué comentarios se dicen. Un ensayo es un intento normal del juego (`SimulationAttempt.is_rehearsal = true`): el estudiante nunca lo ve y **no cuenta** en reportes, métricas, progresión ni asignaciones. No exige sello ni que el documento pase el validador.

### 7.1 Rutas

Bajo `/api/authoring/cases/{versionId}/…`, dentro del sobre `{success, message?, data}`, con la puerta de autoría (`case.author`) y la propiedad del caso (se pide como mutación: una docente que no es dueña del caso recibe 403/404).

| Ruta | Qué hace | Cuerpo | `data` |
|---|---|---|---|
| `POST …/rehearsal` | abre el ensayo y **cierra el anterior** de esa persona en esa versión | `{desde?}`: el id de la escena de la que empezar; sin él, la de inicio | el estado del juego (`AttemptState`, con su `attemptToken`) más `rehearsal` |
| `GET …/rehearsal/{attemptId}` | recarga el bloque («Recargar borrador») | — | `{rehearsal}` |
| `PATCH …/rehearsal/{attemptId}` | mueve la escena y marca lo explorado, la persona y los hitos | los campos de 7.3 | `{rehearsal}` |

Con el `attemptToken` que devuelve `POST` se juega por las rutas normales del juego (`/api/…/attempts/{id}/…`): el servidor las abre al dueño del ensayo, que no pasa por asignación ni consentimiento. Dos pestañas que abren a la vez dejan **un solo** ensayo abierto y ninguna recibe 500: gana el que llegó primero y el otro recibe ese mismo ensayo con su token reemitido.

`POST` con un `desde` que no es una escena de este caso responde 400 con `field: "desde"`; si el caso no tiene escena de inicio, 404.

### 7.2 El bloque `rehearsal`

Solo viaja por estas tres rutas; las del juego no lo llevan. Se calcula para la **escena actual** del ensayo; «sala actual» es la del mapa de esa escena, que es la que leen los requisitos.

| Campo | Forma | Qué es |
|---|---|---|
| `sceneId` | entero | la escena actual |
| `options` | `[{id, text, offered, missing, retainedBy}]` | todas las respuestas de la escena. `offered`: si el estudiante la vería. `missing`: `[{kind, key, label}]` lo que falta explorar (como `decisionReview[].missed`, sección 4.5). `retainedBy`: `facts` (faltan hechos de exploración), `condition` (otra condición sin cumplir: hito, conteo o persona), `broken` (requisito ilegible) o `null` si se ofrece |
| `comments` | `[{index, personaje, line, due, retainedBy, missing}]` | todos los comentarios de la escena, en orden. `index` es su posición; `due`: si se dirían ahora; `retainedBy`: por qué no se dicen, con la misma evaluación del juego y en este orden: `broken` (su `cuando` está mal formado), `condition` (su `cuando` es válido y sigue sin cumplirse; `missing` dice qué falta) o `absent` (su personaje no es una PERSON visible de la sala actual); `null` si se dice ahora; `missing`: lo que falta para su `cuando` (vacío si ya se dice, si no hay condición o si no es `condition`) |
| `warnings` | `[texto]` | lo que el estudiante vería roto: escena sin sala, sin respuestas y sin ser final, o una respuesta que no lleva a ninguna escena |
| `persona` | `{bond, activation, label}` | el estado de la persona consultante; `label` es su descripción en palabras (la misma que ve el juego) |
| `milestones` | `[clave]` | los hitos cumplidos, en orden |
| `path` | `[{nodeId, title}]` | las escenas por las que pasó el ensayo, en orden |
| `explored` | `{talked, inspected, has, used}`, cada uno `[clave]` | **lo que cuenta hoy para la escena actual**: lo hablado e inspeccionado en la sala de la escena, y lo que tiene y lo que usó en todo el intento. Es lo que lee el servidor al evaluar `requiere` y `cuando`, no el registro de otra sala |
| `explorable` | `[{kind, key, label}]` | **lo que `PATCH … explorado` admite** en la escena actual: `talked` (las PERSON visibles y los personajes de ambiente del mapa), `inspected` (los objetos visibles del mapa), `has` y `used` (las herramientas del caso). Es la única fuente: el bloque lo lista y el `PATCH` lo comprueba con la misma lista. `label` es la etiqueta, o la clave si no hay |
| `scenes` | `[{id, key, title, start, terminal}]` | todas las escenas del caso, en el orden del editor (por id), para elegir a cuál ir |

`explored` y `explorable` hablan el mismo idioma: marcar en el `PATCH` exactamente los pares `explorable` que se quieren y leer de vuelta `explored`.

### 7.3 `PATCH`: qué se puede ajustar

Se valida **todo** el pedido antes de escribir; un 400 no cambia nada. Todo es opcional.

| Campo | Forma | Efecto |
|---|---|---|
| `irA` | id de una escena del caso | cambia la escena actual (el ensayo queda registrado como «Escena elegida por la autora»). Ir a la escena en la que ya está no es un movimiento: no escribe otra entrada ni suma un paso a `path` |
| `explorado` | `{talked?, inspected?, has?, used?}`, listas de claves | **reemplazo** de lo explorado: un tipo que se omite queda **vacío**. `has` y `used` reemplazan el inventario y las herramientas usadas de **todo el intento**; `talked` e `inspected` reemplazan solo los de **la sala de la escena destino** (los de otras salas se conservan). Cada clave tiene que estar en `explorable` de la escena a la que se va (`irA`, si viene; si no, la actual) |
| `persona` | `{bond?, activation?}` | fija esas dimensiones de la persona (`bond` ∈ `WITHDRAWN`, `GUARDED`, `OPEN`; `activation` ∈ `CALM`, `TENSE`, `CRISIS`); la que no viene se queda como estaba. Un objeto vacío o con otra clave es 400 |
| `hitos` | `[clave]` | **reemplazo completo** de los hitos cumplidos; cada clave tiene que estar declarada en `reglas.milestones` del caso |

Un 400 es `VALIDATION_ERROR` con `field` en la raíz: `irA`, `explorado`, `persona` o `hitos`. Ejemplos: una clave que no existe en la sala (`field: "explorado"`), un estado de persona fuera del vocabulario (`field: "persona"`), un hito no declarado (`field: "hitos"`), o marcar algo en una escena sin sala y sin mundo guardado (400 «Esta escena todavía no tiene sala: no hay dónde guardarlo.»).

### 7.4 Errores y política

| Código | HTTP | Cuándo |
|---|---|---|
| `REHEARSAL_GONE` | 404 | el ensayo no existe, **no es un ensayo**, **no es de quien pide**, o es de **otra versión** del caso. También cuando la docente borra en el editor una escena, una respuesta o un mapa: eso descarta los ensayos de la versión (el borrado funciona y el siguiente `GET`/`PATCH` recibe este 404). El cliente abre uno nuevo con `POST` |
| `REHEARSAL_CLOSED` | 409 | el ensayo es de quien pide pero ya se cerró (llegó a un final, se reemplazó…) |
| `VALIDATION_ERROR` | 400 | `PATCH` o `POST` con datos que no cuadran (7.1 y 7.3), con `field` |

Un estudiante, o una docente que no es dueña del caso, recibe 403/404 en estas rutas y nunca el juego. Un ensayo ajeno no se puede jugar con su token: el servicio del juego da 403 a quien no es su dueño.

**Tras descartar un ensayo** (la docente borró una escena, una respuesta o un mapa), las rutas del panel responden 404 `REHEARSAL_GONE`, pero las **rutas del juego** responden **403**: un rol que no juega recibe 403 ante cualquier fallo (Ruling 3). El cliente (bloque C2) debe tratar un 403 en una ruta de juego de un ensayo como «ensayo perdido» y ofrecer abrir uno nuevo.

**Política `("attempt", "rehearse")`** (`shared/policies.py`, `shared/policy-matrix.json`): `{ESTUDIANTE: ninguna, PROFESOR: OWN, ADMIN: OWN}`. Solo quien abrió el ensayo (docente o ADMIN) lo juega; `OWN` quiere decir «el dueño del intento».

### 7.5 Llegar a un final

Cuando el ensayo llega a un final se ve la pantalla de final con `decisionReview[].missed` (sección 4.5), **calculada en el momento**. No queda informe congelado, ni evaluación automática, ni aviso de «intento completado» (ni progresión). Un ensayo COMPLETADO es lo que hace `true` a `rehearsedToEnd` (sección 5).
