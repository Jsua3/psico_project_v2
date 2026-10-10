# Registro de cambios — Análisis y diseño de sistemas (ADSI)

Registro vivo de lo que se cambia en SIEP para la materia, con su justificación y evidencia.
Cada entrada enlaza a un commit de la rama `adsi/integracion`. El «antes» de todas las
comparaciones es el tag `adsi-baseline` (= `master` en `f39ab96`).

- **Equipo:** Juan José Sua, Emerson Ángel Gómez, Santiago Leyton, Esteban Bonilla.
- **Criterio:** se aplica un patrón solo donde aporta, con su justificación; lo evaluado y descartado también queda documentado.
- **Regla previa a cualquier refactor:** pruebas de caracterización en verde sobre el código original.

## Fase 0 — Línea base y red de seguridad (5 oct 2026)

### Línea base (`adsi-baseline`, `f39ab96`)

| Suite | Resultado |
|---|---|
| Backend `pytest` | 307 pasan |
| Frontend `ng test` (Vitest) | 1809 pasan, tras corregir un spec que usaba `jest.fn()` |
| `npm run build` | OK |

Medido en un entorno equivalente (Python 3.12, PostgreSQL 16, Node 24), no en el de CI. La confirmación oficial es la del workflow de GitHub Actions sobre el PR.

### Pruebas añadidas (no cambian código de producción)

| Commit | Qué fija | Cambio que protege |
|---|---|---|
| `c490c95` | `journal-panel.component.spec.ts`: `jest.fn()` → `vi.fn()` (sin esto `ng test` no compila) | — |
| `3c9cbc4` | Asistente de IA: URL, cabeceras, cuerpo, proveedor, contexto y auditoría (39 tests) | P-01 Strategy / Adapter / Factory Method |
| `bfe85cf` | Reporte de cierre: forma, conteos, competencias, recomendaciones, resumen (31 tests) | P-04 Builder |
| `9d1ff6c` | Puertas: `requiresTools`, `requiresNpcs` y orden de las reglas (24); orden BFS del mapa de progreso (7) | P-08a Chain of Responsibility, P-09 Iterator |
| `d962444` | Interceptor JWT: cabecera, 401, 403, sin conexión, login (23) | P-08b Chain of Responsibility |
| `d705b83` | Contrato HTTP de los 50 métodos de `SimulationService` (61) | P-05 Facade / Interface Segregation |
| `8bb4203` | Editor de mundo: 12 comandos, pila, autoguardado y acciones del inspector (80) | P-07 Command / Composite |

Resultado tras añadirlas: backend 408 pasan (+101), frontend 1973 pasan en 153 archivos (+164). Cada archivo se comprobó rompiendo el código a propósito: las pruebas fallan, luego se restauró.

### Hallazgos documentados por las pruebas (comportamiento actual, aún sin corregir)

1. **El autoguardado del editor de mundo muere tras un error de guardado.** `catchError` está fuera del `switchMap` y devuelve `EMPTY`: el flujo se completa y los cambios siguientes no se guardan solos hasta recargar.
2. **Guardado bajo el nodo equivocado.** Si se recarga otro nodo con un guardado pendiente (debounce de 1500 ms), se envía el estado de la sala anterior con el `nodeId` nuevo.
3. **La etiqueta de una zona de colisión no se puede deshacer.** `updateZoneLabel` apila un comando vacío y escribe la etiqueta directo en el estado.
4. **Borrar un objeto deja huérfano su diálogo.**
5. **Deshacer un borrado repone el elemento al final de la lista** (cambia el orden de dibujo).

Los puntos 1–4 entran al informe de antipatrones y 3–4 se corrigen dentro de P-07.

### Descartado o reformulado tras leer el código

Ver `FASE0_EVALUACION.md` (catálogo v2): P-02, P-14 y el Chain sobre filas de importación se descartan; P-03, P-05, P-07, P-09, P-11 y P-13 cambian de forma.

## Actualización del 9 oct 2026 — `master` avanza a `dd4eb89`

`master` incorporó 78 commits desde la línea base (personajes unificados y escala del mundo; backend sin cambios). Se trae a `adsi/integracion` con un *merge* y se crea el tag `adsi-baseline-2` (= `dd4eb89`) como «antes» de los cambios que toquen archivos modificados por esa tanda.

| Suite | Resultado sobre `master` + pruebas ADSI |
|---|---|
| Backend `pytest` | 408 pasan |
| Frontend `ng test` | 2094 pasan en 167 archivos |
| `test:visual-assets`, `test:kit`, `kit:check`, `test:world-art`, `ng build` | OK |

Las 265 pruebas de caracterización siguen válidas sin modificarse. El análisis completo de qué cambia en el catálogo (P-10, A-02, A-03 y el candidato verificado de Template Method en `case-pdf-rooms.renderer.ts`) está en `FASE0_EVALUACION.md` §8.

## Fase 1 — Cambios

_Cada cambio se registra con: patrón o antipatrón, archivos, motivo, riesgo, commit y capturas antes/después. El «antes» es `adsi-baseline-2` (`dd4eb89`)._

### P-01 · Strategy + Adapter + Factory Method — proveedores del asistente de IA

| | |
|---|---|
| **Rama / commit** | `adsi/p01-ai-strategy` · `7a613e4` |
| **Patrones** | Strategy (comportamiento), Adapter (estructural), Factory Method (creacional) |
| **Archivos** | `services/ai_providers.py` (nuevo), `views/ai_assistant.py`, `tests/test_ai_assistant.py` (fixture), `tests/test_ai_providers_strategy.py` (nuevo) |
| **Riesgo** | Bajo: 39 pruebas de caracterización en la frontera HTTP pasan sin modificarse |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `AIAssistantView._call_llm` elegía el proveedor con un `if provider == "anthropic"`, y la misma vista armaba el cuerpo de cada API (`_call_openai`, `_call_anthropic`) y hacía el POST (`_post_json`). Agregar un proveedor obligaba a editar la vista, y probar la vista exigía conocer los detalles de cada API.

**Solución (después).**

- **Strategy:** `AIProvider` define `complete(system, question) -> str`. La vista solo conoce esa interfaz.
- **Adapter:** `OpenAIProvider` y `AnthropicProvider` traducen esa interfaz única a la URL, las cabeceras, el cuerpo y la forma de la respuesta de cada API externa.
- **Factory Method:** `AIAssistantView.create_provider()` lee la configuración y devuelve el proveedor concreto consultando el registro `PROVIDERS`. Una subclase o una prueba puede sobreescribirlo (la prueba de la vista usa un proveedor falso, sin red).
- `post_json` queda como transporte común y `NotConfigured` se mueve al módulo de proveedores (la vista lo sigue importando).

**Decisión de diseño.** Strategy y Adapter coinciden en las mismas clases: cada proveedor es a la vez una estrategia intercambiable y el adaptador de una API ajena. Se dejó así (en vez de separar «estrategia» y «adaptador» en dos capas) porque una capa más no aportaba nada con solo dos proveedores.

**Lo que no cambió** (fijado por las pruebas): URL, cabeceras, cuerpo, `max_tokens` 512, tiempo de espera 20 s, recorte de espacios en la respuesta, que un nombre de proveedor desconocido siga cayendo en OpenAI, la auditoría y la respuesta genérica ante errores.

**Pruebas.** Backend 408 → **426** (18 nuevas en `test_ai_providers_strategy.py`: elección por nombre, método de fábrica, registro de un proveedor nuevo sin tocar la vista, ambos adaptadores y proveedor falso en la vista). Cuatro mutaciones del código (siempre OpenAI, versión de Anthropic, `max_tokens`, argumentos invertidos) hacen fallar entre 2 y 8 pruebas; al restaurar vuelve el verde. Ajuste de una prueba existente: la fixture `sin_proveedor` ahora intercepta `ai_providers.post_json` porque `_post_json` ya no es un método de la vista (misma intención: prohibir la red).

**Evidencia.** `docs/diseñosistemas_docs/P-01/`: `antes_ai_assistant.png`, `despues_vista.png`, `despues_ai_providers.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Strategy, Adapter y Factory Method (patrones de comportamiento, estructurales y creacionales vistos el 6, 8 y 26 de octubre); principios abierto/cerrado y de inversión de dependencias (SOLID, sesión del 17/19 de noviembre).

### P-04 · Builder — reporte de cierre del intento

| | |
|---|---|
| **Rama / commit** | `adsi/p04-report-builder` · `e92994c` (parte de `adsi/p01-ai-strategy`: PR después de P-01) |
| **Patrón** | Builder (creacional) |
| **Archivos** | `serializers/game_dtos.py`, `tests/test_completion_report_builder.py` (nuevo) |
| **Riesgo** | Bajo: 31 pruebas de caracterización sobre el reporte pasan sin modificarse |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `build_completion_report` era una sola función de 99 líneas que contaba eventos, deducía competencias y recomendaciones, elegía el resumen según el estado y ensamblaba el diccionario. No había forma de probar una regla (por ejemplo, el umbral de estrés de las recomendaciones) sin armar un intento completo con eventos en la base de datos.

**Solución (después).**

- **Builder:** `CompletionReportBuilder` construye el reporte por pasos encadenables: `count_events()`, `count_reflections()`, `add_competencies()`, `add_recommendations()`, `add_summary()` y `build()`, que ensambla el diccionario en el mismo orden de claves de siempre.
- **Director:** `build_completion_report` conserva su nombre y su firma (lo usan `game_service` e `instructor_service`) y solo fija el orden de los pasos. Competencias y recomendaciones leen los conteos, por eso el orden importa.
- Las constantes de texto (`_SUMMARY_BY_STATUS`, `_GENERIC_RECOMMENDATION`) salen al nivel del módulo.

**Decisión de diseño.** Hay un solo producto (el diccionario del reporte), así que no aparece la ventaja clásica de un Builder de producir varias representaciones. El valor aquí es separar los pasos para poder probarlos uno a uno y sin base de datos. `count_events()` se dejó como un único recorrido de los eventos (visitados, herramientas, reintentos y decisiones) para no cambiar ni el comportamiento ni el número de consultas.

**Lo que no cambió** (fijado por las pruebas): las 22 claves del reporte y su orden, los conteos y la regla de reintentos, las competencias, las recomendaciones y su orden, la recomendación genérica, los mensajes por estado (un estado desconocido sigue lanzando `KeyError`), la duración, la línea de tiempo y el final.

**Pruebas.** Backend +16 (`test_completion_report_builder.py`, sin base de datos): conteos, reintentos que no cuentan como decisiones, nodos visitados sin repetir, competencias, recomendaciones en orden, resumen por estado, ensamblado y director. Total 408 → 424 sobre `adsi/integracion` (442 junto con P-01). Cinco mutaciones (umbral de estrés, competencia de comunicación, director sin `count_events`, reintentos prohibidos, conducta prohibida) hacen fallar entre 2 y 12 pruebas; al restaurar vuelve el verde.

**Evidencia.** `docs/diseñosistemas_docs/P-04/`: `antes_build_completion_report.png`, `despues_builder_pasos.png`, `despues_builder_build_y_director.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Builder (patrones creacionales, sesión del 6 de octubre); responsabilidad única y abierto/cerrado (SOLID, 17 y 19 de noviembre). Aplica también al antipatrón «función larga» del bloque de antipatrones.

### P-08a · Chain of Responsibility — validación de puertas

| | |
|---|---|
| **Rama / commit** | `adsi/p08a-door-chain` · `5a97362` (parte de `adsi/p04-report-builder`: PR después de P-04) |
| **Patrón** | Chain of Responsibility (comportamiento) |
| **Archivos** | `services/door_chain.py` (nuevo), `services/world_service.py`, `tests/test_door_chain.py` (nuevo) |
| **Riesgo** | Bajo-medio: el orden de las reglas es el contrato; 24 pruebas lo fijan sin modificarse |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `world_service._validate_door` revisaba siete reglas en secuencia dentro de una sola función de 34 líneas: que la puerta exista, que conduzca al destino, que el jugador esté cerca y las cuatro condiciones `requires*` (inspeccionados, herramientas, nodos y NPCs). Agregar una condición obligaba a editar esa función, y no se podía probar una regla sin armar un intento, un mapa y una puerta en la base de datos.

**Solución (después).**

- **Chain of Responsibility:** cada regla es un eslabón (`DoorRule`) con `check(ctx)`, que lanza su error si no se cumple, y `handle(ctx)`, que revisa y pasa al siguiente. La primera que falla corta la cadena. Siete eslabones: `DoorExistsRule`, `DoorTargetRule`, `DoorNearbyRule`, `RequiresInspectedRule`, `RequiresToolsRule`, `RequiresNodesRule` y `RequiresNpcsRule`.
- `DoorContext` lleva la petición y lo que los eslabones van resolviendo (la puerta y su metadata) y calcula el mensaje de bloqueo.
- `build_door_chain` fija el orden contractual. `world_service._validate_door` conserva nombre y firma: arma el contexto, recorre la cadena y devuelve la metadata.
- La regla de cercanía se **inyecta** como función para que `door_chain` no importe `world_service` (evita la dependencia circular y deja probar el eslabón solo).

**Decisión de diseño.** En el Chain clásico un solo manejador atiende la petición; aquí es la variante de **validación en cadena**: todos los eslabones se ejecutan en orden y el primero que rechaza detiene el recorrido. Es la forma que describe la guía del patrón para filtros y validaciones.

**Lo que no cambió** (fijado por las pruebas): el orden (existe → destino → cercanía → inspeccionados → herramientas → nodos → NPCs), los mensajes, el mensaje de bloqueo por defecto o el personalizado de la puerta, que una condición vacía no bloquea y que solo se lanza un error por llamada. `requiresNpcs` sigue leyendo `flags.viewedNpcKeys`.

**Pruebas.** Backend +17 (`test_door_chain.py`, sin base de datos): orden de la cadena, eslabones espía (recorrido y corte), cada regla por separado y una regla nueva añadida sin tocar las demás. Total 408 → 425 sobre `adsi/integracion` (459 junto con P-01 y P-04). Seis mutaciones (cercanía antes que destino, cadena sin `RequiresNodes`, NPCs invertido, nodos invertido, la cadena no avanza, `_validate_door` sin metadata) hacen fallar entre 2 y 21 pruebas; al restaurar vuelve el verde.

**Evidencia.** `docs/diseñosistemas_docs/P-08a/`: `antes_validate_door.png`, `despues_validate_door.png`, `despues_eslabon_base.png`, `despues_eslabones_y_cadena.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`). En este mismo lote se corrigió el salto de línea de las notas de los UML de P-01 y P-04.

**Relación con la materia.** Chain of Responsibility (patrones de comportamiento, sesión del 15 de octubre); abierto/cerrado y responsabilidad única (SOLID, 17 y 19 de noviembre). Aplica también al antipatrón «función larga» y a las «condicionales en cascada».


### P-09 · Iterator — recorrido de nodos del mapa de progreso

| | |
|---|---|
| **Rama / commit** | `adsi/p09-progress-iterator` · `d26ba11` (parte de `adsi/p08a-door-chain`: PR después de P-08a) |
| **Patrón** | Iterator (comportamiento) |
| **Archivos** | `services/node_iterator.py` (nuevo), `services/game_service.py`, `tests/test_node_iterator.py` (nuevo) |
| **Riesgo** | Bajo: 7 pruebas de orden ya existentes (Fase 0) se mantienen sin tocar |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `game_service.get_progress_map` hacía en una sola función cuatro cosas: consultar nodos y decisiones, recorrer el grafo en anchura con su cola y su conjunto de visitados, agregar al final los nodos inalcanzables y armar la respuesta. El algoritmo de recorrido estaba mezclado con el acceso a datos, por lo que solo se podía probar levantando un intento completo en la base. Además la cola era una lista con `pop(0)`, que cuesta O(n) por extracción.

**Solución (después).**

- **Iterator:** `BreadthFirstNodeIterator` implementa el protocolo de iteración de Python (`__iter__` / `__next__`). Encapsula la frontera (`deque`), los visitados y las aristas; el cliente solo escribe `for node in iterator`.
- **Orden:** primero los nodos alcanzables desde el inicial, por niveles y en el orden en que llegan las decisiones; después los inalcanzables, por id. El nodo inicial es el marcado `start_node` o, si no hay, el primero.
- **Sin base de datos:** el iterador recibe los nodos y los pares `(origen, destino)` ya cargados. `get_progress_map` conserva firma y respuesta; ahora carga los datos y le pide los nodos al iterador.
- Es **perezoso**: calcula el siguiente nodo solo cuando se lo piden.

**Decisión de diseño.** El catálogo original también proponía unificar este recorrido con el de `_detect_cycle` (validación del grafo del editor). Se descartó en la Fase 0: ese es un DFS recursivo con otro propósito y arreglar su recursión sería un cambio de comportamiento. Se declara que el valor didáctico de P-09 es moderado: es un Iterator real, pero de un solo uso en el sistema.

**Lo que no cambió** (fijado por las pruebas de Fase 0): el orden BFS, los nodos huérfanos al final por id, que un ciclo no repite nodos, el arranque por el primer nodo si no hay inicial marcado, las banderas `start`/`terminal`, `visitedNodeKeys` sin repetir y `currentNodeKey`.

**Pruebas.** Backend +11 (`test_node_iterator.py`, sin base de datos): protocolo (`iter(it) is it`, `StopIteration` estable), grafo vacío, niveles frente a profundidad y orden de aristas dentro del nivel, ciclos y autociclos, nodo con dos caminos, inalcanzables, sin inicial marcado, varios iniciales, arista a un nodo ajeno al caso, carga perezosa y que no se modifiquen las colecciones recibidas. Total 459 → 470 con `manage.py check` limpio. Siete mutaciones: cola LIFO (DFS), sin chequeo de visitados al extraer, inalcanzables invertidos, inicio siempre el primero, emitir nodos ajenos y emitir todos los nodos como sobrantes fueron **detectadas** (1 fallo cada una, con `-x`); una séptima (quitar el filtro de visitados al *encolar*) **sobrevive y es un mutante equivalente**: el chequeo al extraer ya garantiza el resultado, y el filtro solo evita duplicados en la cola.

**Evidencia.** `docs/diseñosistemas_docs/P-09/`: `antes_get_progress_map.png`, `despues_get_progress_map.png`, `despues_node_iterator.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Iterator (patrones de comportamiento, Unidad 3); responsabilidad única (SOLID) y el antipatrón «función larga».


### P-08b · Chain of Responsibility — errores HTTP del interceptor JWT

| | |
|---|---|
| **Rama / commit** | `adsi/p08b-http-error-chain` · `a78ac70` (parte de `adsi/p09-progress-iterator`: PR después de P-09) |
| **Patrón** | Chain of Responsibility (comportamiento) |
| **Archivos** | `core/auth/http-error-chain.ts` (nuevo), `core/auth/jwt.interceptor.ts`, `core/auth/http-error-chain.spec.ts` (nuevo) |
| **Riesgo** | Bajo: las 23 pruebas de `jwt.interceptor.spec.ts` (Fase 0) se mantienen sin modificar |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `jwtInterceptor` agregaba la cabecera `Authorization` y, dentro de `catchError`, decidía qué hacer con el error mediante una cascada de seis `if`: error que no es HTTP, error del login, 401, 403 sobre `/api/auth/me`, 403 y status 0. El bloque que cierra la sesión y lleva al login estaba escrito dos veces (401 y 403 en `/me`). Para agregar o reordenar una regla había que editar el interior de la función, y el orden importa: por ejemplo, un 401 del login no debe cerrar la sesión.

**Solución (después).**

- **Chain of Responsibility:** `HttpErrorHandler` es el eslabón base (`setNext`, `handle`, y los métodos que cada eslabón define: `canHandle` y `apply`). Si el eslabón reconoce el error, lo atiende y la cadena se corta; si no, lo pasa al siguiente. Seis eslabones: `NonHttpErrorHandler`, `LoginErrorHandler`, `UnauthorizedHandler`, `InactiveUserHandler`, `ForbiddenHandler` y `NoConnectionHandler`.
- `HttpErrorContext` entrega a cada eslabón lo que necesita (error, URL, sesión, router, avisos) sin que dependan de `inject()`, así que se prueban con objetos simples y sin `TestBed`.
- `expireSession(ctx)` reúne la lógica de «sesión inválida» que estaba duplicada.
- `buildHttpErrorChain` enlaza los eslabones en el orden contractual. `jwtInterceptor` conserva nombre, firma y registro en `app.config.ts`: agrega la cabecera, deja pasar la petición y, ante un error, ejecuta la cadena y lo vuelve a lanzar.

**Decisión de diseño.** El interceptor no se partió en dos interceptores de Angular (cabecera y errores) porque la cabecera es una sola condición y partirlo habría obligado a modificar las pruebas de Fase 0. El valor del patrón está en la cascada de errores, que es donde había orden implícito y código repetido. Aquí la cadena es la clásica: un solo eslabón atiende cada error, a diferencia de P-08a, donde todos los eslabones se ejecutan y el primero que rechaza corta.

**Lo que no cambió** (fijado por las pruebas): los tres mensajes, que el login nunca cierra sesión ni avisa, que un 401 siempre limpia la sesión pero solo avisa y navega si no se está ya en `/login`, que el 403 en `/api/auth/me` se trata como sesión inválida, que el status 0 y los errores que no son HTTP avisan de conexión y conservan la sesión, y que los demás errores pasan sin efectos. El error siempre se vuelve a lanzar, porque los componentes lo siguen necesitando (`HANDLED_BY_INTERCEPTOR`).

**Pruebas.** Frontend +24 (`http-error-chain.spec.ts`): orden de la cadena, cada eslabón con su caso feliz y de borde, que el primero que reconoce el error corta (por ejemplo el login con 0/401/403/500), y que un eslabón nuevo se agrega o se antepone sin tocar los demás. Total 2094 → 2118 (168 archivos de prueba), ejecutadas en tu equipo con Vitest, y `tsc` sobre la app sin errores. Ocho mutaciones, todas detectadas: la cadena no se corta (11 fallos), login después del 401 (3), 403 en `/me` después del 403 genérico (6), eslabón no-HTTP al final (2), cerrar sesión siempre navega (4), `expireSession` sin limpiar la sesión (10), la cadena no enlaza (16) y el 403 de `/me` sin mirar la URL (2). Al restaurar vuelve el verde.

**Evidencia.** `docs/diseñosistemas_docs/P-08b/`: `antes_jwt_interceptor.png`, `despues_jwt_interceptor.png`, `despues_eslabon_base.png`, `despues_eslabones.png`, `despues_cadena.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Chain of Responsibility (patrones de comportamiento, sesión del 15 de octubre); abierto/cerrado y responsabilidad única (SOLID). Aplica también a los antipatrones «función larga», «condicionales en cascada» y «código duplicado».


### P-05 · Interface Segregation (SOLID) — APIs por rol en lugar de `SimulationService` de 50 métodos

| | |
|---|---|
| **Rama / commit** | `adsi/p05-api-segregation` · `c9396fd` (parte de `adsi/p08b-http-error-chain`: PR después de P-08b) |
| **Principio / patrón** | Interface Segregation y Responsabilidad Única (SOLID). **No se aplicó Facade** (ver decisión de diseño) |
| **Archivos** | `core/api/authoring.api.ts`, `instructor.api.ts`, `api-response.ts`, `api-boundaries.contract.spec.ts` (nuevos); `simulation.service.ts`; 6 consumidores; 5 pruebas ajustadas |
| **Riesgo** | Medio: toca 6 componentes y 5 pruebas, pero ninguna llamada HTTP cambia |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `SimulationService` tenía 50 métodos públicos para tres roles distintos: 21 del jugador, 4 del instructor y 25 de autoría (editor de casos y editor de mundo). Los métodos casi no se cruzan entre roles, pero todos los componentes inyectaban el servicio completo: el editor de casos «veía» cómo se juega un intento y el jugador «veía» cómo se publica un caso. Cualquier cambio de autoría obligaba a editar la misma clase que usa el jugador, y 17 pruebas tenían que simular un servicio de 50 métodos para usar uno o dos.

**Solución (después).**

- `SimulationService` queda solo con el **jugador** (21 métodos).
- `AuthoringApi` reúne los 25 métodos de **autoría y editor de mundo** (casos, nodos, decisiones, mapas, objetos, herramientas, checklist, publicación, `worldEditor`/`saveWorld`/`validateWorld`/`worldPreview`).
- `InstructorApi` reúne los 4 del **instructor** (`recentAttempts`, `attemptTrace`, `rubric`, `saveRubric`).
- `ApiResponse<T>` (el sobre `{ data }`) vive en un único archivo en lugar de declararse en cada servicio.
- Migración de consumidores: `case-editor`, `case-authoring-hub`, el store del editor de mundo y `world-preview` inyectan solo `AuthoringApi`; `instructor-trace` solo `InstructorApi`; el dashboard inyecta `SimulationService` e `InstructorApi`. Los demás siguen con `SimulationService`.

**Decisión de diseño.** El catálogo original decía «Facade / ISP». La verificación de la Fase 0 ya advertía que una fachada que solo delega no aporta nada mientras los componentes sigan inyectando el servicio completo. Como aquí se migraron los consumidores, dejar `SimulationService` como fachada delegando 29 métodos que nadie llama habría sido código muerto, así que **no se aplicó Facade** y el cambio se declara como Interface Segregation. Un candidato real de Facade queda pendiente en el backend (`authoring_service.py`, un módulo de más de 1300 líneas cuyos imports habría que preservar al dividirlo).

**Lo que no cambió** (fijado por el contrato HTTP de Fase 0): para los 50 métodos, el verbo, la URL con sus parámetros (`nodeId` incluido, también cuando vale 0), el cuerpo, que el token de intento viaje solo en cabecera y que se desenvuelva `{ data }`; `studentReport` sigue completando `phaseDurations` con `[]`.

**Pruebas.** Frontend 2094 → 2129 (+9 de fronteras, +2 del contrato; 168 → 169 archivos de prueba), ejecutadas en tu equipo, con `tsc` de app y de pruebas sin errores y `ng build` correcto.
- *Contrato de 50 métodos:* el `it.each` y las pruebas con comportamiento propio **no cambiaron en lo que verifican**; solo se ajustó cómo obtiene el servicio (une las tres APIs en un objeto). La prueba final ahora comprueba que cada método vive en una sola API y que el reparto es 21 / 25 / 4.
- *Nuevo `api-boundaries.contract.spec.ts`:* fija qué archivos pueden inyectar `AuthoringApi` e `InstructorApi`, que los consumidores migrados no dependen del servicio del jugador, que este no importa las otras dos y que el sobre `ApiResponse` no se vuelve a duplicar.
- *Pruebas ajustadas:* `case-editor.feedback`, `world-editor.store.commands` y `world-editor.component.actions` cambian solo el token del proveedor (`SimulationService` → `AuthoringApi`); `dashboard.component.spec` añade el mismo simulacro como `InstructorApi`. Ninguna aserción se tocó.
- *Siete mutaciones, todas detectadas:* un método de autoría duplicado en el servicio del jugador, una URL de `cloneCaseVersion` cambiada, `saveRubric` sin desenvolver `{ data }`, `instructor-trace` inyectando `SimulationService`, `worldPreview` sin `nodeId`, un consumidor nuevo que inyecta `AuthoringApi` sin declararlo y `ApiResponse` redeclarado. Al restaurar vuelve el verde.

**Evidencia.** `docs/diseñosistemas_docs/P-05/`: `antes_simulation_service.png`, `despues_simulation_service.png`, `despues_authoring_api.png`, `despues_instructor_api.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Interface Segregation y Responsabilidad Única (SOLID, 17 y 19 de noviembre); antipatrón «clase Dios / objeto Dios».


### P-06 · Proxy (caché) — lista de casos publicados

| | |
|---|---|
| **Rama / commit** | `adsi/p06-cache-proxy` · `f8af374` (parte de `adsi/p05-api-segregation`: PR después de P-05) |
| **Patrón** | Proxy de caché (estructural) |
| **Archivos** | `core/api/cached-simulation.service.ts`, `core/api/case-list-cache.ts`, `core/api/cached-simulation.service.spec.ts` (nuevos); `core/api/authoring.api.ts`, `app.config.ts` |
| **Riesgo** | Medio-bajo: es el único cambio de la Fase 1 que altera el comportamiento a propósito (ver abajo) |
| **Cambio de comportamiento** | **Sí, acotado:** la lista puede tener hasta 30 s de antigüedad |

**Problema (antes).** Cinco pantallas piden la lista de casos publicados (`listCases`): el catálogo, el dashboard (en dos flujos), grupos, reporte de grupo y rúbricas. Cada visita dispara una consulta nueva al backend, que arma la respuesta contando los nodos de cada caso con una consulta por caso (`list_published_cases`). Navegar entre estas pantallas repite el mismo trabajo y los mismos datos.

**Solución (después).**

- **Proxy:** `CachedSimulationService` hereda de `SimulationService`, así que es un `SimulationService` más. Solo sobrescribe `listCases`, que pasa primero por la memoria; si no hay copia vigente, llama al método real con `super.listCases()`. Todos los demás métodos se delegan sin cambios.
- `CaseListCache` guarda **una** entrada: la lista del usuario actual. Comparte la petición en curso entre quienes la piden a la vez, no guarda errores y entrega a cada quien una copia de la lista.
- La **clave** es usuario + rol, porque la lista depende de ellos (un estudiante solo ve los casos que le asignaron). Otro usuario, otro rol o sin sesión nunca reciben la lista del anterior.
- `app.config.ts` registra `{ provide: SimulationService, useExisting: CachedSimulationService }`: **ningún componente cambia**.
- `AuthoringApi.publishCase` invalida la lista cuando la publicación tiene éxito, porque agrega un caso a los publicados.

**Decisión de diseño y compromiso.** Se eligió una vigencia corta (30 s) porque a un estudiante se le pueden asignar casos desde otra sesión; con esa vigencia una asignación nueva aparece sola en medio minuto o al volver a entrar. No se invalida al crear o clonar una versión (son borradores) ni al editar nodos (las versiones publicadas no cambian). La lista de autoría (`listAuthoringCases`) no se guarda. Declarado así porque este patrón cambia lo que ve el usuario en un caso límite: es la ventaja del caché y también su costo.

**Lo que no cambió:** la URL, el verbo y el desenvolver de `{ data }` de `listCases` (los fija el contrato de 50 métodos), los demás métodos del servicio y los componentes.

**Pruebas.** Frontend 2129 → 2149 (+20 en `cached-simulation.service.spec.ts`; 170 archivos de prueba), ejecutadas en tu equipo, con `tsc` de app y pruebas sin errores y `ng build` correcto. Cubren: es un `SimulationService`, la segunda llamada no va al backend, las simultáneas comparten una petición, el límite exacto de la vigencia (justo antes y al vencer), usuario/rol/sin sesión, errores no guardados y propagados, copias independientes, invalidación manual, publicar (con éxito invalida, con error conserva; crear y clonar no invalidan), que `getCatalog` y `startAttempt` no se guardan y que `app.config` registra el proxy. Doce mutaciones: once detectadas desde el principio (sin vigencia, sin clave de usuario, sin compartir la petición, sin copia, publicar sin invalidar, invalidar vacío, proxy sin caché, clave sin rol, límite inclusivo, sin proveedor en `app.config`, clonar invalidando). La que sobrevivió fue «guardar errores»: mostró que la limpieza explícita del error era **redundante**, porque `shareReplay` ya reinicia solo cuando la petición falla. Se eliminó ese código y se comprobó que una variante que sí guarda el error (`share` con `resetOnError: false`) hace fallar la prueba.

**Evidencia.** `docs/diseñosistemas_docs/P-06/`: `antes_list_cases.png`, `antes_dashboard_llamada.png`, `despues_proxy.png`, `despues_cache.png`, `despues_app_config.png`, `despues_publicar_invalida.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Proxy (patrones estructurales, Unidad 2); principio de sustitución de Liskov (el proxy se puede usar donde se espera `SimulationService`) y abierto/cerrado (se agrega caché sin modificar el servicio real).


### P-07 · Command + Composite — comandos del editor de mundo

| | |
|---|---|
| **Rama / commit** | `adsi/p07-editor-commands` · `085a08a` (parte de `adsi/p06-cache-proxy`: PR después de P-06) |
| **Patrones** | Command (comportamiento) y Composite (estructural) |
| **Archivos** | `world-editor/world-editor.store.ts`, `world-editor/world-editor.component.ts`, `world-editor/world-editor.macro-command.spec.ts` (nuevo); 4 pruebas reescritas en `world-editor.component.actions.spec.ts` y `world-editor.store.commands.spec.ts` |
| **Riesgo** | Medio-bajo: altera comportamiento a propósito en tres puntos acotados del editor; ver el hallazgo de persistencia más abajo |
| **Cambio de comportamiento** | **Sí, acotado:** (1) la etiqueta de una zona se puede deshacer; (2) borrar un objeto borra también su diálogo, en un solo paso; (3) el historial de deshacer recuerda como máximo 100 pasos |

**Problema (antes).** El editor ya define el patrón Command (12 comandos con `execute`/`undo` y una pila en el store), pero dos acciones del inspector lo rompían y la pila no tenía límite:

- `updateZoneLabel` ejecutaba un `ResizeZoneCommand` «vacío» (mismo origen y destino) y después escribía la etiqueta con `editorState.set(...)`, fuera de la pila. Resultado: la etiqueta no se podía deshacer (Ctrl+Z consumía el paso vacío y la etiqueta se quedaba) y cada pulsación de tecla apilaba un paso inútil.
- `deleteSelected` ejecutaba solo `DeleteObjectCommand`: el diálogo del objeto seguía en el estado, sin dueño e inalcanzable desde la interfaz.
- Las pilas de deshacer y rehacer crecían sin límite durante toda la sesión de edición.

**Solución (después).**

- **Command:** `SetZoneLabelCommand(key, label)` cambia solo la etiqueta de una zona y recuerda la anterior para deshacer. `updateZoneLabel` hace ahora una sola cosa: `store.execute(new SetZoneLabelCommand(...))`.
- **Composite:** `MacroCommand` es a la vez un `EditorCommand` y un contenedor de `EditorCommand`: ejecuta a sus hijos en orden, los deshace en orden inverso y puede contener otros macros. Para el store es un comando más y cuenta como **un** paso del historial.
- `DeleteObjectWithDialogueCommand` es el macro concreto «borrar objeto + su diálogo»: compone los dos comandos que ya existían (`DeleteObjectCommand` y `DeleteDialogueCommand`). `deleteSelected` lo usa para los objetos.
- **Tope:** `MAX_UNDO_STEPS = 100`; `execute` descarta el paso más antiguo al pasarse. Rehacer solo contiene pasos que salieron de la pila de deshacer, así que un único tope en `execute` acota las dos pilas.

**Decisión de diseño y compromiso.**

- *Por qué el Composite aporta aquí:* sin él, «borrar objeto + diálogo» serían dos pasos del historial (un Ctrl+Z dejaría el objeto sin diálogo o al revés) o un tercer comando que duplicaría la lógica de los dos que ya existen. `applyScenePreset` ya era un único comando y no necesita macro.
- *Pulsaciones:* cada pulsación sigue siendo un paso, igual que en el resto de campos del inspector (`UpdateInspectorCommand`), así que deshacer revierte de a un carácter. Agrupar pulsaciones consecutivas es una mejora posible y queda fuera de este cambio.
- *Compromiso del tope:* tras más de 100 cambios seguidos ya no se puede deshacer hasta el primero. El 100 es una elección razonable, no medida; está en una constante.

**Hallazgo nuevo (verificado, sin corregir): el guardado del mundo no persiste los borrados de objetos ni las zonas de colisión.** `PUT /world` (`authoring_service.save_world`) hace *upsert* de los objetos recibidos pero no borra los ausentes, ignora por completo `collisionZones` y solo borra los diálogos ausentes. Se comprobó con una prueba temporal contra PostgreSQL (no se commitea):

| Escenario | Resultado |
|---|---|
| `PUT` sin uno de los objetos | El objeto sigue en la base (4 antes, 4 después) |
| `PUT` con una zona menos y etiquetas nuevas | Devuelve las 8 zonas con sus etiquetas originales |
| Borrar objeto **y** diálogo y guardar | El objeto **reaparece sin su diálogo** |

Consecuencias para este cambio: el estado local del editor queda coherente (objetivo de P-07) y `SetZoneLabelCommand` corrige el deshacer, pero las zonas no se guardan de ninguna forma hoy. Con el macro, al recargar vuelve el objeto sin diálogo; antes de P-07 volvían los dos. Corregirlo exige un cambio de backend aparte (propuesto como A-05: que `save_world` borre los objetos ausentes y persista las zonas, con pruebas previas; es un cambio de comportamiento que toca claves foráneas). **Decisión del equipo antes de fusionar P-07.**

**Lo que no cambió** (fijado por las pruebas de Fase 0): los 12 comandos simples (ejecutan sin mutar el estado, ejecutar y deshacer devuelve el mismo contenido, tipo), el orden de la pila y que una acción nueva descarte lo que se podía rehacer, el autoguardado de 1500 ms con sus errores, `applyScenePreset`, `addTemplate`, `updateObjectField` y `deleteSelectedZone`. Siguen sin corregirse los hallazgos 1, 2 y 5 de Fase 0 (el autoguardado muere tras un error, el guardado pendiente bajo otro nodo y que deshacer un borrado repone el elemento al final de la lista).

**Pruebas.** Frontend 2149 → **2184** (+35; 170 → 171 archivos de prueba), ejecutadas en tu equipo, con `tsc` de app y de pruebas sin errores y `ng build` correcto.

- *Nuevas, `world-editor.macro-command.spec.ts` (32):* `SetZoneLabelCommand` (7), `MacroCommand` (9: orden, estado que recibe cada hijo, macros anidados, vacío, que deshacer no invierta la lista en el sitio), `DeleteObjectWithDialogueCommand` (7), integración con el store (3, incluido que un macro que falla a la mitad no cambia el estado ni apila nada), etiqueta de zona (1) y tope (5, con sus límites).
- *Reescritas (4):* son las cuatro pruebas que Fase 0 marcó como «comportamiento actual» y que fijaban justo los defectos corregidos. Es el único cambio a pruebas existentes; ninguna otra aserción se tocó.

| Antes (fijaba el defecto) | Ahora |
|---|---|
| `registra un comando «ResizeZone» vacío en la pila` | `registra un único paso en la pila` (un deshacer lo agota) |
| `deshacer NO revierte la etiqueta` → `toBe('Escritorio')` | `deshacer devuelve la etiqueta anterior` → `toBe('Mesa')` |
| `borrar un objeto deja huérfano su diálogo` → `['npc-1']` | `borrar un objeto borra también su diálogo` → `[]` |
| `la pila no tiene tope` → 300 cambios y 300 deshacer vuelven a (0, 0) | `la pila tiene tope` → se queda en (300 − `MAX_UNDO_STEPS`) |

- *RED real:* con esqueletos sin comportamiento fallaban 20 pruebas por la razón esperada. Otras ocho pasaban sin discriminar nada (un deshacer sobre una identidad es siempre verde); se reforzaron comprobando el estado intermedio.
- *Mutaciones, 16 de 16 detectadas:* deshacer en orden directo (4 fallos), ejecutar en orden inverso (6), el macro omite el último hijo (16), deshacer invierte la lista en el sitio (1), el macro no borra el diálogo (8), no borra el objeto (8), `SetZoneLabel` con deshacer vacío (6), etiqueta en todas las zonas (4), sin recordar la etiqueta anterior (5), tope con error de uno (4), sin tope (3), el tope descarta el paso más reciente (3), tope absurdo de 1 (2), el componente vuelve a escribir la etiqueta sin comando (2), `updateZoneLabel` sin la guarda de zona inexistente (1) y `deleteSelected` sin el macro (4). Dos lecciones: el orden de deshacer del macro de borrado no es observable (sus hijos son independientes), por eso se verifica con dos movimientos que sí dependen del orden; y la mutación «invierte la lista en el sitio» solo la atrapa la prueba de ejecutar-deshacer-ejecutar.

**Otros hallazgos.** `ResizeZoneCommand` queda sin ningún llamador de producción (solo lo usaba el paso vacío de la etiqueta): el editor no tiene hoy ninguna acción que redimensione una zona; es candidato a A-02 si el equipo no planea ese redimensionado. El catálogo de Fase 0 hablaba de 13 comandos; el store tenía 12 (ahora son 15 con `SetZoneLabelCommand`, `MacroCommand` y `DeleteObjectWithDialogueCommand`). Se corrigieron en este mismo documento los conteos de archivos de prueba de P-08b (168), P-05 (169) y P-06 (170): estaban desfasados en uno, los totales de pruebas eran correctos.

**Evidencia.** `docs/diseñosistemas_docs/P-07/`: `antes_update_zone_label.png`, `antes_delete_selected.png`, `antes_pila_sin_tope.png`, `despues_component.png`, `despues_set_zone_label.png`, `despues_macro.png`, `despues_tope.png`, `despues_tope_constante.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`). Estas capturas se generaron en Windows: `tools/codeshot.py` se volvió portable (usa Consolas cuando no hay DejaVu).

**Relación con la materia.** Command (patrones de comportamiento, Unidad 3) y Composite (estructurales, Unidad 2): `MacroCommand` es el ejemplo clásico de Command compuesto de GoF; responsabilidad única y abierto/cerrado (SOLID): un comando nuevo no obliga a tocar el store. El salto de `updateZoneLabel` al patrón que el propio editor define entra al informe de antipatrones (Fase 0, §3.4).


### A-01 · Código duplicado (Cut & Paste) — ayudantes JSON y de acotación del backend

| | |
|---|---|
| **Rama / commit** | `adsi/a01-duplicados` · `09beb04` (parte de `adsi/p07-editor-commands`: PR después de P-07) |
| **Antipatrón** | Código duplicado («Cut & Paste»); no es un patrón de diseño |
| **Archivos** | `shared/jsonutils.py`; `serializers/game_dtos.py`, `services/instructor_service.py`, `views/game_views.py`, `services/case_effects.py`, `services/decision_effects.py`, `services/world_service.py`; `shared/tests/test_jsonutils.py` y `tests/test_shared_helper_call_sites.py` (nuevos) |
| **Riesgo** | Bajo: las seis copias eran idénticas (comprobado antes de tocar nada) |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `shared/jsonutils.py` ya existía con `read_string_list`, `read_map`, `write_map` y `coerce_int` (resultado de una deduplicación anterior entre `world_service` y `authoring_service`), pero seis copias quedaron fuera:

| Copia | Dónde | Equivalente compartido |
|---|---|---|
| `read_string_list` | `game_dtos.py` | `jsonutils.read_string_list` |
| `_read_map` | `instructor_service.py` | `jsonutils.read_map` |
| `_int` | `game_views.py` (sin ningún uso) | `jsonutils.coerce_int` |
| `_clamp` ×3 | `case_effects.py`, `decision_effects.py`, `world_service.py` | no existía |

El riesgo real de la duplicación: una corrección del parseo tolerante de JSON o de la acotación en un sitio no llegaba a los demás.

**Solución (después).**

- `clamp(value, lo=0, hi=100)` entra a `jsonutils` y reemplaza las tres `_clamp`.
- Cada módulo importa con el mismo alias que tenía (`clamp as _clamp`, `read_map as _read_map`), igual que ya hacían `world_service` y `authoring_service` con `coerce_int as _int`: **los sitios de llamada no cambian**.
- `game_dtos` importa `read_string_list`; `instructor_service` importa `read_map`; `game_views._int` se borra (nadie la usaba). Los `import json` que quedaron sin uso se quitan.

**Lo que no se tocó, a propósito.** `_save_event` (no es una copia idéntica: la de `world_service` fija `node=current_node` y omite decisión y deltas) y la lógica de IP del cliente (difiere en `.strip()` y en el rol por defecto): sin prueba previa que fije su comportamiento no se unifican. Tampoco `world_service._append_unique` ni `authoring_service._write_string_list`: tienen otra semántica, no son copias.

**Pruebas.** Backend 470 → **546** (+60 de los ayudantes compartidos, +16 de los puntos de uso), `manage.py check` limpio.

- *Equivalencia previa (no se commitea):* antes de tocar el código, una prueba temporal comparó cada copia con su equivalente compartido en **113 casos** (entradas nulas, vacías, JSON de otro tipo, bytes, valores no convertibles, límites invertidos) y comparó también el tipo de la excepción (p. ej. `float('inf')` lanza `OverflowError` en las dos versiones). Todas iguales.
- *`shared/tests/test_jsonutils.py` (60, sin base de datos):* fija el contrato de los cinco ayudantes, incluido `clamp` (límites, valores por defecto, intervalo invertido).
- *Mutaciones (regla 4), primera pasada, 12:* cinco detectadas (límites invertidos, sin límite superior, límite por defecto de 10, `read_string_list` sin validar el tipo, `coerce_int` ignorando el valor por defecto), una terminó en un error de ejecución que no se reprodujo (`read_map` aceptando listas: al repetirla, detectada) y **seis sobrevivieron**: quitar la acotación de `decision_effects`, del estrés de `world_service`, de la entrada de las puertas y de las métricas del caso, y dejar de leer `supportResources` y la evidencia de la rúbrica **no rompía ninguna prueba de las 530**. Es una laguna de pruebas anterior a este cambio (los ayudantes estaban cubiertos solo de forma indirecta), no un código redundante.
- *`tests/test_shared_helper_call_sites.py` (16):* la respuesta a esos supervivientes. Cubre `decision_effects.apply` (por arriba, por abajo y dentro del rango), las métricas de `apply_case_effects`, la entrada de las puertas (`_door_entry`, incluido el 960×540 por defecto), `node_state`, `_score_view` y el estrés al usar una herramienta (99 + 3 → 100 y 2 − 5 → 0, por el flujo HTTP real). **También pasan contra el código original** de la rama padre, así que caracterizan el comportamiento previo y no el nuevo.
- *Segunda pasada:* las seis supervivientes y tres variantes nuevas (acotar solo por arriba en dos sitios y cambiar el 960 por 1000) quedan todas detectadas.

**Hallazgos menores, sin tocar.** Imports sin uso que ya existían: `CriterionScore` y `Rubric` en `instructor_service.py` y `_int` en `world_service.py` (resto de la deduplicación anterior).

**Evidencia.** `docs/diseñosistemas_docs/A-01/`: `antes_game_dtos_read_string_list.png`, `antes_instructor_read_map.png`, `antes_game_views_int.png`, `antes_clamp_tres_copias.png`, `despues_jsonutils.png`, `despues_importaciones.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrón «Cut & Paste» / código duplicado (Unidad 4) y principio DRY; la mutación de este cambio es un ejemplo concreto de por qué un refactor «seguro» sin pruebas en los puntos de uso no tiene red de seguridad.


### A-02 · Código muerto (Lava Flow / Boat Anchor) — borrado verificado

| | |
|---|---|
| **Rama / commit** | `adsi/a02-codigo-muerto` · `44efdc7` (parte de `adsi/a01-duplicados`: PR después de A-01) |
| **Antipatrón** | Código muerto: «Lava Flow» (código que quedó de versiones anteriores) y «Boat Anchor» (código que nadie usa) |
| **Archivos** | Frontend: `audio.service.ts` (borrado), `core/api/simulation.service.ts`, `core/api/authoring.api.ts`, `features/simulator/game-world.component.ts`, `features/simulator/hospital-map.config.ts`; sus contratos de pruebas. Backend: `apps/grupos/services.py`. `README.md` |
| **Riesgo** | Bajo: cada candidato tiene cero usos comprobados y, tras borrar, compilan y pasan las suites completas |
| **Cambio de comportamiento** | Ninguno |

**Qué se borró y por qué es seguro.**

| Código | Evidencia de que está muerto |
|---|---|
| `audio.service.ts` (reexporta `AudioDirectorService as AudioService`) | 0 importadores en `src/` y `e2e/` |
| `SimulationService.getAttempt` y `getCompletionReport` | Solo los llaman el propio servicio y sus pruebas |
| `AuthoringApi.deleteDecision` | Solo lo llama su prueba de contrato |
| `renderHospitalEnvironment` y sus ramas en `renderWorld` | `HOSPITAL_MAP_KEY` es `urgencias-crisis`, que `resolveSceneRenderer` resuelve al renderer premium (lo fija `case-pdf-rooms.spec.ts`); `renderWorld` sale justo después de llamarlo, así que `isHospitalMap(mapKey)` es siempre falso en el resto del método |
| `HOSPITAL_ZONES` y `HospitalZoneDef` | Solo los usaba `renderHospitalEnvironment` (quedaron huérfanos) |
| `_parse_csv_rows` y `import csv` | Sin ningún llamador: la importación solo acepta `.xlsx` (la pantalla, el serializador y `_parse_student_import` lo exigen) |
| README (líneas 109 y 125) | Decía que se podía cargar `.csv` y descargar una plantilla CSV; la pantalla acepta solo `.xlsx` y descarga `plantilla_importacion_estudiantes_siep.xlsx` |

En `renderWorld` se quitaron, además del método y su llamada, dos ramas que dependían del mismo hecho: el rótulo «Hospital — Urgencia vital y crisis» y el `isHospitalMap(mapKey) ||` de la etiqueta de objetos. Los endpoints del backend (`GET attempt`, `completion-report`, `DELETE decisions`) **no se tocan**: solo se borran los envoltorios del cliente que nadie llama.

**Pruebas.** Sin pruebas nuevas ni mutaciones: no hay comportamiento nuevo que fijar y, al borrar, la garantía es que nada lo referenciaba (compilación) y que las suites completas siguen verdes.

- *Frontend:* 2184 → **2179** (−5; 171 archivos), `tsc` de app y de pruebas sin errores y `ng build` correcto. Los cinco son filas de tablas de contrato de los métodos borrados (`getAttempt`, `getCompletionReport` y `deleteDecision` en el contrato de 50 métodos; `getAttempt` y `getCompletionReport` en la prueba de GET privados). Los totales del contrato pasan de 50 a 47 métodos y de 21 / 25 / 4 a **19 / 24 / 4**. Ninguna otra aserción se modificó.
- *Backend:* 546 sin cambios, `manage.py check` limpio y sin imports sin uso en `grupos/services.py`.
- *Qué no se pudo probar con pruebas:* que `renderHospitalEnvironment` no se ejecuta en el juego real. Las pruebas unitarias no dibujan con Phaser; la garantía es el argumento estático de arriba (la salida anticipada y la prueba del registro). Una corrida del e2e del caso completo lo confirmaría empíricamente.

**Candidatos que se dejaron sin tocar** (misma familia, necesitan su propio análisis): `HOSPITAL_COLLISIONS` en `wouldCollide` y las ramas hospitalarias de `scene-map-display.util.ts` (se usan también fuera de `renderWorld`), `renderComisariaEnvironment` (sigue alcanzable como respaldo si falla la carga del JSON del escenario) y `ResizeZoneCommand` (sin llamador de producción desde P-07; ver su entrada).

**Evidencia.** `docs/diseñosistemas_docs/A-02/`: `antes_audio_service.png`, `antes_simulation_service_metodos.png`, `antes_delete_decision.png`, `antes_render_hospital_llamada.png`, `antes_render_hospital_metodo.png`, `antes_parse_csv_rows.png`, `antes_readme.png`, `antes_contrato.png`, `despues_render_llamada.png`, `despues_contrato.png`, `despues_readme.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrones «Lava Flow» y «Boat Anchor» (Unidad 4): el refactor es eliminar, no reescribir; el criterio de seguridad es demostrar que no hay usos antes de borrar.


## Fase 2 — Cambios

### P-10 · Strategy — elección del destino de cada movimiento

| | |
|---|---|
| **Rama / commit** | `adsi/p10-npc-motion-strategy` · `14fed1e` (parte de `adsi/a02-codigo-muerto`: PR después de A-02) |
| **Patrón** | Strategy (comportamiento) |
| **Archivos** | `features/simulator/motion-strategies.ts` (nuevo), `game-world.component.ts` (dos cuerpos de método, una línea de `updateNpcMovers` y los imports), `motion-strategies.spec.ts` y `game-world.npc-motion.spec.ts` (nuevos) |
| **Riesgo** | Medio-bajo: 13 contract-specs leen `game-world.component.ts` como texto; ninguno cambió |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** Hay dos sistemas de movimiento en paralelo y los dos eligían su destino con una cadena de `if` dentro de la escena de Phaser:

- Las **personas** (`NpcConfig.motion`, 6 comportamientos): `nextNpcTarget` encadenaba tres `if` (`subtle-wander`, anclas de `pace`/`patrol`, `avoidant`) y `updateNpcMovers` sabía además que *solo* `pace` y `patrol` avanzan de ancla al llegar.
- Los **objetos con vida ambiental** (`MapObjectState.movementPattern`, 3 patrones): `nextAmbientTarget` encadenaba `wander` y `patrol`.

Agregar un comportamiento obligaba a editar la cadena y la condición de llegada, y **nada de eso tenía pruebas**: para ejercitar `nextNpcTarget` hacía falta levantar la escena entera (Phaser, colisiones, contenedores).

**Solución (después).**

- `motion-strategies.ts` (sin Phaser) reúne las reglas. Para las personas, `NpcMotionStrategy` tiene dos operaciones: `nextTarget(ctx)` (el destino, o `null` si la persona espera) y `anchorAfterArrival(idx, count)` (qué ancla sigue al llegar). Hay cuatro estrategias: `stationary` (idle y attentive), `subtleWander`, `anchorRoute` (pace y patrol, compartida) y `avoidant`, registradas en `NPC_MOTION_STRATEGIES: Record<NpcMotionBehavior, …>`.
- Para los objetos ambientales, `nextAmbientStep(pattern, state, rand)` devuelve el destino **y** el índice de patrulla resultante, así la estrategia es pura (no muta al objeto).
- La escena aporta lo que depende de Phaser: el azar (`Math.random`, leído al llamar), la posición de la persona y del jugador y la prueba de obstáculos (`wouldCollide`). `nextNpcTarget` y `nextAmbientTarget` conservan su nombre y firma y solo delegan; en `updateNpcMovers` la condición «solo pace y patrol» pasa a `anchorAfterArrival`.

**Decisión de diseño.**

- *Qué es estrategia y qué no:* solo la **elección del destino** y la **regla de llegada**. La mecánica común (pausas, dar el paso, deslizarse por el eje libre, aplicar la pose) sigue en la escena porque depende de Phaser y es la misma para todos. `idle` y `attentive` (que giran o se quedan quietos) tampoco piden destino: la escena sale antes, y su estrategia existe para que el registro cubra la unión completa.
- *Dos familias, no una:* las personas y los objetos ambientales usan modelos y reglas distintas (velocidades, reintentos por tiempo, `patrolIdx`). Unificarlos cambiaría comportamiento; se dejan como dos familias en el mismo archivo.
- *Abierto/cerrado con respaldo del compilador:* un comportamiento nuevo es una entrada en el registro; si se olvida, `Record<NpcMotionBehavior, …>` no compila.
- *`patrolIdx` se conserva tal cual.* El índice de patrulla avanza **antes** de elegir, así que el primer destino es el punto 1 y el 0 queda para el final de la primera vuelta. Puede ser un defecto o la lectura «el objeto ya está en el punto 0»; no se corrige en un refactor. Queda fijado con pruebas marcadas «comportamiento actual» y cambiarlo es una línea en la estrategia `patrol`. **Decisión del equipo.**

**Lo que no cambió** (fijado por 32 pruebas de caracterización escritas y verificadas **contra el código original** antes de tocarlo, y reafirmado por las 30 de las estrategias): los 6 comportamientos y los 3 patrones; la espera inicial de 600 ms (o `startDelayMs`); que el destino se dé por alcanzado a ≤ 2 px; la pausa al llegar (la del ancla, la de la configuración o la de cada comportamiento: 2400 ms para `subtle-wander`, 1600 para `pace` y 900 para `patrol`); la espera de 600 ms cuando no hay destino y de 900 ms cuando el camino está del todo bloqueado; el deslizamiento por X y luego por Y; que `avoidant` solo reaccione a ≤ 70 px y dé pasos de ≤ 16 px; que `attentive` gire a ≤ 110 px sin trasladarse; que el movimiento reducido deje solo idle (y attentive); y que el mundo en pausa lo congele todo. Se conserva también una rareza: un `subtle-wander` con anclas no las recorre pero sí usa su `face` y su `pauseMs` al llegar.

**Pruebas.** Frontend 2179 → **2241** (+62; 171 → 173 archivos), `tsc` de app y de pruebas sin errores y `ng build` correcto. Los 13 contract-specs que leen `game-world.component.ts` pasan sin modificarse.

- *Caracterización (32), `game-world.npc-motion.spec.ts`:* usa el arnés de `game-world.interaction.spec.ts` (Phaser simulado, la escena real con dobles mínimos). Dos expectativas iniciales eran erróneas (asumían que el destino a 10 px no se alcanzaba en un paso); se corrigieron contra el código original, no al revés.
- *Estrategias (30), `motion-strategies.spec.ts`:* sin Phaser, con el azar y los obstáculos inyectados. Cada caso «devuelve `null`» lleva su control positivo en la misma prueba, para que un `null` vacuo no la deje pasar.
- *RED real:* con un esqueleto sin comportamiento fallaban 21 de 30; las 9 que pasaban eran justo los casos donde no hacer nada es lo correcto.
- *Mutaciones, 26:* **25 detectadas** y una rechazada por el compilador. 18 sobre las estrategias (ignorar obstáculos, zona, índice o copia del ancla, no dar la vuelta, `>` por `>=` en 70 px, radio doble, el índice de patrulla sin devolver, registro cruzado…) y 8 sobre el cableado de la escena (anclaje fijo, jugador nulo, sin obstáculos, índice de patrulla sin guardar, ancla sin avanzar, estrategia equivocada, azar fijo, posición de origen). La rechazada es quitar la guarda de jugador ausente de `avoidant`: no compila (`TS2345`, `Point | null` no es asignable), es decir, el tipo ya la impone. Incluida la mutación que «arregla» el salto de `patrol`: se detecta, así que la rareza quedó fijada.

**Hallazgos.** (1) El salto del punto 0 de `patrol` (arriba). (2) Los dos sistemas paralelos siguen sin unificar. (3) La estrategia ambiental `idle` no se alcanza en producción: `applyAmbientLife` no registra movers para patrón idle; está en el registro para que cubra la unión. (4) La distancia de reacción usa la misma fórmula que `Phaser.Math.Distance.Between` (no `Math.hypot`) para decidir igual en el umbral exacto.

**Evidencia.** `docs/diseñosistemas_docs/P-10/`: `antes_next_npc_target.png`, `antes_llegada_ancla.png`, `antes_next_ambient_target.png`, `despues_estrategias_npc.png`, `despues_estrategias_ambientales.png`, `despues_next_npc_target.png`, `despues_next_ambient_target.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Strategy (patrones de comportamiento, Unidad 3); abierto/cerrado y responsabilidad única (SOLID); el antipatrón de las «condicionales en cascada» (la cadena de `if` por tipo).


### A-03a · Hard Code — `AttemptStatus` en lugar de textos sueltos

| | |
|---|---|
| **Rama / commit** | `adsi/a03a-attempt-status` · `67472dd` (parte de `adsi/p10-npc-motion-strategy`: PR después de P-10) |
| **Antipatrón** | «Hard Code» (textos literales donde ya existe una definición) |
| **Archivos** | `services/game_service.py`, `services/world_service.py`, `services/case_effects.py`, `serializers/game_dtos.py`, `reportes/services.py`; `tests/test_attempt_lifecycle_contract.py` y `reportes/tests/test_estados_contract.py` (nuevos) |
| **Riesgo** | Bajo-medio: 46 sitios en 5 archivos, protegidos por 99 pruebas escritas antes del cambio |
| **Cambio de comportamiento** | Ninguno |

**Aclaración de nombre.** En los documentos anteriores «A-03» significaba dos cosas: «usar `AttemptStatus` en vez de textos» (prerrequisito de P-12, `FASE0_EVALUACION.md` §3.1) y «números mágicos de `simulation-play.component.ts`» (§8). Se separan: **A-03a** es este cambio, **A-03b** son los tiempos de la pantalla de juego (frontend) y **A-03c** los números de las reglas del backend.

**Problema (antes).** `AttemptStatus` (un `TextChoices`) ya existía en el modelo, pero ningún servicio lo usaba: los estados del intento se comparaban y asignaban con texto en unos **46 sitios de 5 archivos** (`game_service` 20, `reportes/services` 13, `game_dtos` 10, `world_service` 2, `case_effects` 1). Un error de tipeo en uno de ellos no falla: simplemente esa rama nunca se cumple.

**Solución (después).**

- Los cinco archivos usan `AttemptStatus.X`. Los grupos que se repetían pasan a constantes con nombre: `_OPEN_STATUSES` en `game_service` (los tres `status__in=["IN_PROGRESS", "PAUSED"]`) y `_SUPPORT_STATUSES` en `game_dtos` (los dos `("SAFE_EXITED", "PAUSED")`).
- Es seguro porque `TextChoices` es un `str`: `AttemptStatus.COMPLETED == "COMPLETED"`, tiene el mismo *hash* (sirve de clave de diccionario) y guarda el mismo valor en los filtros del ORM, el JSON y la base.
- **No se tocó** el vocabulario propio del reporte (`estado = "SAFE_EXITED"`, junto a `EN_PROGRESO`, `EN_PAUSA`…), los tipos de evento (`"ATTEMPT_REPLACED"`…) ni el DDL de `bootstrap_dev_db.py`: no son el estado del intento.

**Pruebas.** Backend 546 → **645** (+99), `manage.py check` limpio.

- *Matriz operación × estado (89), escrita antes del cambio:* para 13 operaciones y los 5 estados, qué se acepta, qué se rechaza y con qué mensaje, y qué es idempotente; más las transiciones (pausar, reanudar, completar, reemplazar) y qué cuenta como intento «activo». Las transiciones inválidas no tenían ninguna prueba. Pasa sin modificarse sobre el código original.
- *Contadores de reportes (10), añadidas tras la mutación:* qué estado cuenta cada contador del tablero y del reporte de grupo, y la precedencia del estado del estudiante (`EN_PROGRESO` > `EN_PAUSA` > `COMPLETADO` > `SAFE_EXITED` > `PENDIENTE`). También pasan sobre el código original.
- *Mutaciones, 36* (cada miembro de `AttemptStatus` cambiado por otro en cada punto de uso): **30 detectadas** de entrada y **6 sobrevivieron**, todas en `reportes/services.py`: cambiar lo que cuenta «en progreso» o «completadas» en el tablero, qué estados cuentan en el reporte de grupo y de estudiante, y la salida segura histórica sin evento. Es una laguna anterior a este cambio (la misma clase que mostró A-01). Con las 10 pruebas nuevas, las 6 quedan detectadas.

**Hallazgos.** (1) Las pruebas de reportes no distinguían entre estados: se podía mezclar `COMPLETED` con `PAUSED` en un contador sin que nada fallara. (2) La rama de la salida segura **histórica** (contar por el estado `SAFE_EXITED`, sin evento) no tenía prueba propia: el único caso traía también el evento `SAFE_EXIT_REQUESTED`, que cubría el conteo por otro camino. Ahora la tiene. (3) La matriz deja por escrito que `safe_exit` y `resume` son idempotentes fuera de su estado de origen (devuelven el estado sin evento), mientras decisiones, bitácora, herramientas y movimiento se rechazan con 400.

**Evidencia.** `docs/diseñosistemas_docs/A-03a/`: `antes_game_service_estados.png`, `antes_reportes_conteos.png`, `antes_resumen_por_estado.png`, `despues_game_service_estados.png`, `despues_reportes_conteos.png`, `despues_resumen_por_estado.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrón «Hard Code» (Unidad 4). Es el paso previo de P-12 (State): sin una única definición de los estados no hay tabla de transiciones posible.


### P-12 · State — ciclo de vida del intento (versión liviana)

| | |
|---|---|
| **Rama / commit** | `adsi/p12-attempt-state` · `cecdaa6` (parte de `adsi/a03a-attempt-status`: PR después de A-03a) |
| **Patrón** | State (comportamiento), liviano: una tabla de transiciones y cinco objetos de estado pequeños |
| **Archivos** | `services/attempt_lifecycle.py` y `tests/test_attempt_lifecycle.py` (nuevos), `services/game_service.py` (16 puntos: 8 comparaciones, 5 asignaciones y 3 filtros), `services/world_service.py` (2 guardas) |
| **Riesgo** | Bajo-medio: 18 puntos de decisión en 2 archivos, cubiertos por la matriz de 89 pruebas de A-03a, que pasa sin modificarse |
| **Cambio de comportamiento** | Ninguno con datos válidos (para un estado fuera de los cinco, ver «Hallazgos», punto 4) |

**Problema (antes).** Las reglas del ciclo de vida del intento estaban repartidas en 18 puntos: en `game_service`, 8 comparaciones de estado, 5 asignaciones y 3 filtros (los tres con `_OPEN_STATUSES`), y en `world_service`, 2 guardas con mensajes propios. Cada operación decidía por su cuenta qué estado la acepta y a cuál pasa. No había en el código una lista de transiciones válidas (solo se deducía leyendo las 18 guardas) y, como mostró la matriz de A-03a, **las transiciones inválidas no tenían ninguna prueba**: nada impedía escribir `attempt.status = AttemptStatus.REPLACED` sobre un intento `COMPLETED`.

**Solución (después).**

- `attempt_lifecycle.py` (118 líneas, sin ORM ni base de datos): cuatro acciones (`complete`, `pause`, `resume`, `replace`) y cinco clases de estado (`InProgress`, `Paused`, `Completed`, `Replaced`, `SafeExited`) que heredan de `AttemptState`. Cada una declara su `status` y lo que la distingue: dos capacidades —`plays` (acepta decisiones, bitácora, herramientas y movimiento) e `is_open` (es el «intento activo»)— y su tabla `transitions` (los tres terminales no declaran ninguna).
- Transiciones: `IN_PROGRESS` → `COMPLETED` (complete), `PAUSED` (pause) o `REPLACED` (replace); `PAUSED` → `IN_PROGRESS` (resume) o `REPLACED` (replace). `COMPLETED`, `REPLACED` y `SAFE_EXITED` son terminales.
- API: `state_of(attempt)`, `state.can(action)`, `state.next(action)`, `apply(attempt, action)`, `OPEN_STATUSES` (derivado de `is_open`) e `INITIAL_STATUS`.
- Los servicios preguntan al estado: seis guardas de `game_service` pasan a `state_of(attempt).plays` o `.can(...)`; sus cuatro cambios de estado, a `apply(...)`; la creación del intento, a `INITIAL_STATUS`; los tres filtros, a `OPEN_STATUSES`; y las dos guardas de `world_service`, a `plays`.

**Decisión de diseño.**

- *Liviano, no el State clásico.* El clásico pondría un método por operación en cada estado (`choose_decision()`, `pause()`…). Con 5 estados y 13 operaciones eso mueve a las clases de estado la transacción, los eventos y el DTO, y repite en cada una el mismo rechazo. Aquí el estado responde dos preguntas (¿juega?, ¿sigue abierto?) y dice a dónde puede ir. Es lo que recomendó la revisión de Fase 0 (`FASE0_EVALUACION.md` §3.1).
- *Lo que NO entra en el State:* qué puntúa (`reportes`) y qué texto y recursos de apoyo se muestran (`game_dtos`) son decisiones de esas capas, que siguen leyendo `AttemptStatus`. `ended_at`, `locked_at`, los eventos y `record_case_completion` se quedan en el servicio: `apply` solo cambia el valor en memoria.
- *La idempotencia es de la operación, no del estado.* `safe_exit` fuera de su estado de origen y `resume` sobre un intento ya en juego devuelven el estado sin evento, como antes; por eso preguntan `can(...)` y no llaman a `apply` a ciegas. Así se conserva REGLA-004: `safe_exit` responde 200 en los cinco estados (lo fija la matriz).
- *La excepción es una red de seguridad, no un camino.* `InvalidAttemptTransition` es un `ValidationError` (400) y deja el estado como estaba. Las guardas de cada operación ya impiden toda transición inválida, así que **en las rutas actuales no se dispara nunca**; está para quien agregue una operación nueva.
- *Abierto/cerrado con respaldo de prueba.* Agregar un estado es una clase y una entrada en `_STATES`; si se agrega un valor a `AttemptStatus` sin su estado, falla la prueba de exhaustividad.
- *No se aplicó el decorador `@requires_status`* que planteaba el plan original (`PLAN_APLICACION_PATRONES_SIEP.md`, fila P-12): la guarda necesita el intento que cada función carga con `_require_attempt` (token y dueño) en su propio cuerpo, así que un decorador tendría que repetir esa carga o cambiar las firmas, y con 8 guardas, cada una con su mensaje o su retorno propio, no quitaba código. Tampoco se crearon `can_decide()` ni `can_resume()`: `plays` y `can(RESUME)` dicen lo mismo con menos superficie.

**Lo que no cambió** (fijado por las 89 pruebas de la matriz de A-03a, que pasan sin modificarse): los seis mensajes de rechazo, textuales («El intento ya no acepta decisiones», «La bitácora ya está bloqueada», «El intento aún está en progreso», «Solo un intento en pausa segura puede reanudarse», «El intento ya no acepta interacciones en el mundo» y «El intento ya no acepta herramientas»); qué operación es idempotente en qué estado; `ended_at`, `locked_at`, los eventos y el informe de cierre; y el DTO y los reportes, que no se tocaron. `OPEN_STATUSES` es la misma tupla (`IN_PROGRESS`, `PAUSED`, en ese orden), así que los filtros del ORM piden lo mismo. Se conserva `attempt.status == AttemptStatus.COMPLETED` tras la decisión: decide si se registra el cierre del caso, es el *resultado* de la decisión y no una regla de transición.

**Un cambio sin efecto.** `reflection.locked = attempt.status != IN_PROGRESS` era siempre `False`, porque la guarda de arriba ya exige que el intento esté en juego; ahora es `reflection.locked = False`. La mutación lo señaló como equivalente (G5, abajo).

**Pruebas.** Backend 645 → **681** (+36), `manage.py check` limpio; el frontend no se tocó.

- *Matriz de A-03a (89), sin modificarse:* ya cubría las 13 operaciones en los 5 estados y las transiciones; es la que garantiza que el cambio no altera el comportamiento.
- *Tabla (36), `test_attempt_lifecycle.py`, sin base de datos:* exhaustividad sobre `AttemptStatus`; la tabla completa de transiciones por igualdad; los 20 pares estado × acción (5 × 4); que solo `IN_PROGRESS` juega y que solo `IN_PROGRESS` y `PAUSED` están abiertos; que los terminales no tienen salida; que ninguna transición llega a `SAFE_EXITED`; `INITIAL_STATUS`; y la semántica de `apply` (mueve, recorre un ciclo, una transición inválida lanza y no cambia el estado, y la excepción es un `ValidationError` con el estado y la acción en el mensaje).
- *Sin RED separado para las 36:* no se corrieron antes de que existiera el módulo (habría sido un `ImportError`, que no demuestra nada). Lo que muestra que detectan algo son las mutaciones.
- *Mutaciones, 32* (18 sobre el módulo, 12 sobre `game_service` y 2 sobre `world_service`): **31 detectadas** y 1 sobrevivió. Es G5, equivalente: «la bitácora nace siempre sin bloquear», la expresión redundante de arriba, que se simplificó. En 29 de las 31 la primera prueba que falla es de la matriz de A-03a; en 2 —`next()` deja de rechazar (L12) y la transición inválida deja de ser un `ValidationError` (L18)— las 89 pasan y solo fallan las nuevas, que son justo la red de seguridad que ninguna ruta dispara.

**Hallazgos.** (1) La guarda ya existía en cada operación: la tabla no corrige un defecto, concentra la definición y deja una sola fila por modificar si el ciclo cambia. (2) La mutación G5 destapó lógica redundante en el original (arriba). (3) `get_completion_report` solo rechaza `IN_PROGRESS`: un intento en pausa, reemplazado o con salida segura histórica devuelve el informe de cierre (200). Está fijado por la matriz y no se cambió; si no es lo querido, es una decisión del equipo (en la tabla sería una capacidad más). (4) Un estado fuera de los cinco ya no se trata como «no juega»: `state_of` lanza `KeyError`, mientras que antes cada operación lo trataba como «no está en juego» (400, o devolver el estado en `safe_exit`). No puede darse con el esquema de despliegue: `simulation_attempts_v2_status_check` admite solo esos cinco valores y `test_deploy_schema_contract.py` comprueba que admite todos los de `AttemptStatus`. El DDL de desarrollo (`bootstrap_dev_db`) no replica ese CHECK, así que allí solo ocurriría escribiendo a mano un valor. Se prefiere un fallo explícito a uno silencioso y se declara aquí. (5) `SAFE_EXITED` sigue siendo solo histórico: está en la tabla como terminal sin entradas y una prueba fija que ninguna transición llega a él.

**Evidencia.** `docs/diseñosistemas_docs/P-12/`: `antes_pausar_y_reanudar.png`, `antes_guarda_decisiones.png`, `antes_guarda_mundo.png`, `despues_attempt_lifecycle_base.png`, `despues_attempt_lifecycle_estados.png`, `despues_pausar_y_reanudar.png`, `despues_guarda_decisiones.png`, `despues_guarda_mundo.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** State (patrones de comportamiento, Unidad 3), en su forma liviana de tabla de transiciones; abierto/cerrado y responsabilidad única (SOLID). Cierra el recorrido del antipatrón «Hard Code» que abrió A-03a.


### A-03b · Números mágicos — los tiempos de la pantalla de juego

| | |
|---|---|
| **Rama / commit** | `adsi/a03b-timing-constants` · `fb40b96` (parte de `adsi/p12-attempt-state`: PR después de P-12) |
| **Antipatrón** | «Números mágicos» (literales sin nombre que no dicen qué esperan) |
| **Archivos** | `simulation-play.component.ts` (11 literales y 4 comentarios), `simulation-play.timings.spec.ts` (nuevo) y `simulation-play.game-feel.contract.spec.ts` (2 aserciones modificadas y 1 prueba añadida) |
| **Riesgo** | Bajo: solo cambia cómo se escribe cada número; 13 pruebas nuevas fijan cada tiempo al milisegundo |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `simulation-play.component.ts` tenía **11 `setTimeout` con el tiempo escrito en el sitio** (2500, 4500, 400, 550, 700, 340, 80, 2200, 4200, 3000 y 50 ms). Ninguno decía qué espera ni por qué, y dos eran trampas:

- `340` (la espera del fundido de escena) vive junto a `SCENE_FADE_MS = 320` (la transición CSS del mismo fundido). Parecen el mismo número mal copiado, pero no lo son: la espera supera en 20 ms a la transición.
- `4200` aparecía suelto en la nota de transición del mapa, igual que el valor de `NOTICE_MS`.

Además, varios comentarios repetían el número en palabras («2,5 s», «4,2 s», «1-2 s» para el nombre de la sala, que en realidad dura 2,2 s) y habían empezado a divergir del código.

**Solución (después).**

- Cada tiempo es una constante con nombre y una línea que dice qué espera, junto a `SCENE_FADE_MS` y `NOTICE_MS`: `FADE_OUT_MS` (340), `WORLD_REVEAL_DELAY_MS` (80), `SUPERVISION_DELAY_MS` (400), `POSITION_SAVE_DEBOUNCE_MS` (550), `STRESS_PULSE_MS` (700), `NOTHING_NEARBY_MS` (2500), `ACTION_ERROR_MS` (4500), `ROOM_BANNER_MS` (2200), `STAGE_BANNER_MS` (3000), `TRANSITION_NOTE_MS` (4200) y `ANNOUNCE_DELAY_MS` (50).
- Los cuatro comentarios que repetían el número ahora nombran la constante.

**Decisión de diseño.**

- *Una constante por significado, no por valor.* `FADE_OUT_MS` no reutiliza `SCENE_FADE_MS`, y `TRANSITION_NOTE_MS` no reutiliza `NOTICE_MS` aunque hoy valga lo mismo: la nota de transición es un texto narrativo autorado, no un aviso cuyo contenido ya está en la lista «Qué hacer». Si mañana se ajusta uno, el otro no se mueve en silencio. La separación de `TRANSITION_NOTE_MS` no se puede comprobar por comportamiento mientras los dos valgan 4200 (ver la mutación X10).
- *Dónde viven.* Arriba del archivo, como las dos que ya existían: los 11 usos están en este componente. Un módulo compartido tendría sentido cuando otro componente necesite alguno.
- *Lo que no se nombró.* El `100` del tope de estrés (`Math.max(0, Math.min(100, …))`) y el `4` de `slice(0, 4)` del código corto de la herramienta no son tiempos; la distancia de rearme de puertas (`doorInteractionRearmDistance = 72`) ya tenía nombre; los dos `setTimeout(() => …)` sin retardo no llevan número; y las duraciones de las transiciones CSS siguen en el CSS (la única que debe coincidir con una constante, `scene-fade` y `SCENE_FADE_MS`, ya la fija el contract-spec).

**Lo que no cambió:** el valor de ningún tiempo. El grupo `simulation-play*` (301 pruebas, 14 de ellas nuevas) y las 2255 de toda la suite pasan; los specs de comportamiento que ya avanzaban el reloj con números (`tick(340)`, `4100`/`4300`, `10_000`…) no se tocaron.

**Pruebas.** Frontend 2241 → **2255** (+14; 173 → 174 archivos), `tsc` de app y de pruebas sin errores y `ng build` correcto.

- *Caracterización (13), `simulation-play.timings.spec.ts`, escritas y verificadas sobre el código original antes de tocarlo:* cada tiempo se comprueba al milisegundo (a 1 ms antes todo sigue igual y en el instante indicado ya cambió) con el componente real y relojes simulados. Cubren los 11 tiempos, `NOTICE_MS` (el aviso suave) y la espera de 320 ms de los efectos de cámara, y el reinicio de la espera del guardado de posición. Los números van escritos en la prueba, no importados: son el contrato observable. Una primera versión falló porque el doble de la escena no tenía `refreshScale` (otro temporizador de 0 ms); se completó el doble, no el código.
- *Aserciones cambiadas (declaradas):* el contract-spec `simulation-play.game-feel.contract.spec.ts` leía el literal en el texto del componente. Al introducir las constantes, **exactamente dos pruebas fallaron** (de las 2241 existentes) y ninguna otra, ni de las nuevas:
  - `…\}, 80\);/` pasó a `…\}, WORLD_REVEAL_DELAY_MS\);/` y se añadió `toContain('const WORLD_REVEAL_DELAY_MS = 80;')`;
  - `…updated.feedback!)), 400);` pasó a `…, SUPERVISION_DELAY_MS);` y se añadió `toContain('const SUPERVISION_DELAY_MS = 400;')`.

  El valor sigue fijado, ahora sobre la definición. Se añadió además una prueba: la espera del fundido tiene su propia constante y no reutiliza `SCENE_FADE_MS` (la trampa de Fase 0). El plan decía actualizar esas aserciones *antes*; se actualizaron después de ver cuáles fallaban, lo que de paso confirma que son las únicas que fijaban literales.
- *Mutaciones, 25:* 13 de valor (cada constante ±1 ms, incluidas `SCENE_FADE_MS` y `NOTICE_MS`) y 12 de cableado cruzado (cada sitio con la constante de otro): **24 detectadas** y 1 sobrevivió. La que sobrevive es X10, usar `NOTICE_MS` en la nota de transición: equivalente por valor, no una laguna de pruebas. Las cruzadas incluyen la trampa de Fase 0 (X1, el fundido con `SCENE_FADE_MS`), que se detecta con tres fallos.

**Hallazgos.** (1) El §8 de `FASE0_EVALUACION.md` decía que el literal `80` «ya no está»; en `adsi/integracion` sigue (línea 2699 del original) y la aserción de la línea 13 del contract-spec lo fijaba. Se trató igual que los demás. (2) La Fase 0 contaba 13 `setTimeout`; 11 llevan tiempo y 2 no (la diferencia es de definición, no de código). (3) No se sabe si el margen de 20 ms entre `FADE_OUT_MS` (340) y `SCENE_FADE_MS` (320) es deliberado; se dejó como estaba y ahora está dicho. (4) El tope 0–100 del estrés está escrito en **6 sitios** (`simulation-play.component.ts`, `attempt-outcome.component.ts`, `game-feel.util.ts`, `patient-state.util.ts`, `stress-tier.util.ts`, `stress-hearts.util.ts`): es un duplicado (el equivalente en frontend de A-01), no un número mágico, y queda como candidato. (5) Los números del plan v1 del backend (`40/-20/+15` de `decision_effects.py`, `-5/+3` de herramientas, `50/50` iniciales, `RETENTION_DAYS`, `stress_index >= 70`) no se tocan aquí: son A-03c.

**Evidencia.** `docs/diseñosistemas_docs/A-03b/`: `antes_literales_sueltos.png`, `despues_constantes.png`, `despues_usos.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrón «Números mágicos» (Unidad 4, junto a «Hard Code»); legibilidad y un único lugar donde cambiar cada valor. Es el segundo de los tres cambios en que se separó «A-03» (A-03c cubre los números del backend).


### A-03c · Números mágicos — las reglas y escalas del intento en el backend

| | |
|---|---|
| **Rama / commit** | `adsi/a03c-backend-constants` · `b2487f5` (parte de `adsi/a03b-timing-constants`: PR después de A-03b) |
| **Antipatrón** | «Números mágicos» (reglas de puntaje y estrés, escalas y tamaños escritos como literales) |
| **Archivos** | `models/attempt.py`, `models/world.py`, `models/__init__.py`, `services/decision_effects.py`, `services/world_service.py`, `services/game_service.py`, `services/case_effects.py`, `services/authoring_service.py`, `serializers/game_dtos.py`; `tests/test_clinical_constants.py` (nuevo) |
| **Riesgo** | Bajo-medio: son las reglas con las que el backend decide el puntaje y el estrés; 18 pruebas nuevas fijan los valores que no tenían prueba, antes del cambio |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** Las reglas numéricas del intento estaban escritas en **26 líneas de 7 archivos** sin nombre, y varias cifras se repetían: el `50` inicial en `game_service`, en `models/attempt.py` y en `case_effects`; el `960 × 540` de un mapa sin tamaño en `world_service` y en `authoring_service` (ocho literales); la escala `0, 100` en cuatro líneas. Quien leía `trust_delta -= 20` o `>= 70` tenía que adivinar de qué regla hablaba.

**Solución (después).** Catorce constantes, cada una junto a lo que describe:

- *Escala y valores iniciales* en `models/attempt.py`, junto a los campos: `INDICATOR_MIN` (0), `INDICATOR_MAX` (100), `INITIAL_STRESS_INDEX` (0), `INITIAL_VICTIM_RISK` (50) e `INITIAL_USER_TRUST` (50). Los campos del modelo y `start_attempt` usan las mismas.
- *Tamaño por defecto de un mapa* en `models/world.py`, junto a `SceneMap.width/height`: `DEFAULT_MAP_WIDTH` (960) y `DEFAULT_MAP_HEIGHT` (540). Las usan `world_service` (movimiento y entrada de puertas) y `authoring_service` (mapa de un caso nuevo y mapa sin tamaño válido).
- *Conducta prohibida* en `decision_effects.py`: `PROHIBITED_STRESS_PENALTY` (40), `PROHIBITED_TRUST_PENALTY` (20) y `PROHIBITED_VICTIM_RISK_PENALTY` (15).
- *Herramientas* en `world_service.py`: `TOOL_PERTINENT_STRESS_DELTA` (−5) y `TOOL_IMPERTINENT_STRESS_DELTA` (3).
- *Umbral de estrés alto* en `game_dtos.py`: `HIGH_STRESS_THRESHOLD` (70).
- *Métrica inicial del caso* en `case_effects.py`: `CASE_METRIC_INITIAL` (50), que sustituye a tres literales.

**Decisión de diseño.**

- *Una constante por significado, no por valor.* `INITIAL_VICTIM_RISK` e `INITIAL_USER_TRUST` valen lo mismo y son dos constantes; igual `CASE_METRIC_INITIAL`, que es otra cosa aunque también valga 50. Es la misma decisión que en A-03b y deja el mismo rastro: las mutaciones que cruzan dos constantes de igual valor no se pueden detectar por comportamiento (A6 y G1, abajo).
- *Cada constante vive donde se usa, salvo las compartidas.* No hay un módulo `constants.py` con todo: la escala, los valores iniciales y el tamaño del mapa se exportan desde `models` porque las leen varios archivos; el resto es de un solo módulo y se queda en él.
- *Lo que no se tocó.* Los números que forman parte de datos con clave: `_TRUST` y `_VICTIM` (por clasificación), `OPTION_EFFECTS` (por opción) y las semillas de `seed_caso_pdf.py`. La cota inferior `0` de `_clamp(entry_x, 0, …)` es el origen del mapa, no la escala del indicador. `RETENTION_DAYS` (que el plan v1 listaba) ya tenía nombre en `audit_service.py`. No hay migraciones ni cambios de esquema: solo cambia cómo se escribe el `default` de tres campos de modelos `managed = False`.

**Lo que no cambió:** el valor de ninguna regla ni de ninguna escala. Backend completo en verde y las pruebas que ya fijaban estos puntos pasan sin tocarse: las de A-01 (acotación a 0-100, estrés ±, `960 × 540` en `_door_entry`, valor por defecto de la métrica) y la del umbral de estrés alto del contrato del reporte (69, 70 y 100).

**Pruebas.** Backend 681 → **699** (+18), `manage.py check` limpio.

- *Caracterización (18), `test_clinical_constants.py`, verificadas sobre el código original antes de cambiarlo:*
  - `resolve` en las tres clasificaciones, con y sin conducta prohibida (6): exactamente +40 de estrés, −20 de confianza y +15 de riesgo;
  - las métricas del caso sin estado guardado y una métrica fuera de la lista (2);
  - los valores iniciales de un intento nuevo y los `default` del modelo (2);
  - el movimiento de un mapa sin tamaño guardado, en el borde exacto y un píxel más allá, a la derecha y abajo (1);
  - el mapa de un caso nuevo y seis combinaciones de ancho y alto no válidos o válidos al guardar un mapa (7).
- *Una prueba que se quitó:* se había escrito una del umbral de estrés alto y resultó duplicar `test_estres_desde_70_recomienda_autorregulacion` (contrato del reporte, 69/70/100 por el flujo real); se eliminó en vez de dejarla repetida.
- *Mutaciones, 36* (cada constante ±1, cada punto de uso con la constante de otro, `>=` por `>`, cotas cruzadas): **34 detectadas** y 2 sobrevivieron. Las dos son equivalentes por valor, no lagunas: usar `INITIAL_USER_TRUST` donde va `INITIAL_VICTIM_RISK`, en el `default` del modelo (A6) y en `start_attempt` (G1); las dos constantes valen 50. Las tres del umbral (T1-T3) las detecta la prueba del contrato del reporte, ya existente. La tanda corrió contra los archivos de pruebas que ejercitan estos puntos y la suite completa también pasa.

**Hallazgos.** (1) `decision_effects.resolve`, la función que decide cuánto pesa cada decisión, **no tenía ninguna prueba directa**: ninguna prueba comprobaba `trustDelta` ni `victimRiskDelta`, ni por el flujo HTTP. (2) El `960 × 540` de `update_position` no tenía prueba (la de A-01 cubría solo `_door_entry`); ahora hay una por el flujo HTTP. (3) Hay tres tamaños distintos que no deben confundirse: el **por defecto** (960 × 540, solo cuando el mapa no trae tamaño), el de las **salas sembradas** del caso PDF (960 × 528, `seed_caso_pdf.ROOM_W/ROOM_H`, que es también `CASE_ROOM_BOUNDS` en el frontend) y el **máximo** admisible (`MAX_MAP_WIDTH/HEIGHT`, 2560 × 1920). (4) El esquema SQL (`bootstrap_dev_db.py` y `deploy/db_seed.sql`) sigue con `DEFAULT 50`: es el mismo conocimiento escrito en SQL y en Python, y ninguna prueba los enlaza; cambiar `INITIAL_*` obligaría a cambiar el DDL a mano. (5) Las métricas del caso y los indicadores del intento usan la misma escala 0-100 pero son cosas distintas; `shared.jsonutils.clamp` conserva sus cotas por defecto para las primeras.

**Evidencia.** `docs/diseñosistemas_docs/A-03c/`: `antes_numeros_sueltos.png`, `despues_constantes.png`, `despues_usos.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrón «Números mágicos» y «Hard Code» (Unidad 4). Cierra la familia A-03 (estados, tiempos y reglas) y deja las reglas del puntaje legibles para la sustentación.


### A-04 · Exception Handling — `GoogleLoginView` deja de disfrazar un fallo de la base de datos

| | |
|---|---|
| **Rama / commit** | `adsi/a04-google-login-errors` · `2207f9c` (parte de `adsi/a03c-backend-constants`: PR después de A-03c) |
| **Antipatrón** | «Exception Handling» (`except Exception` demasiado ancho que reetiqueta el error) |
| **Archivos** | `users/views.py`; `users/tests/test_google_login_contract.py` (nuevo) y `users/tests/test_auth.py` (una línea) |
| **Riesgo** | Bajo: una sola búsqueda; el camino correcto no cambia |
| **Cambio de comportamiento** | **Sí, deliberado:** si la base de datos falla al buscar al usuario, la respuesta pasa de `401 «La cuenta de Google no está asociada a un usuario activo»` a `500 «Error interno del servidor»` |

**Problema (antes).** En `GoogleLoginView.post`, la búsqueda del usuario estaba envuelta así:

```python
try:
    user = User.objects.filter(email=email).first()
except Exception as exc:
    raise GoogleAuthenticationError("La cuenta de Google no está asociada a un usuario activo") from exc
```

Cualquier excepción —la base de datos caída (`OperationalError`), un error de programación, un `RuntimeError`— se presentaba como un problema de la cuenta del estudiante. Al estudiante le decía «tu cuenta no está asociada» cuando el fallo era del servidor, y para quien vigila el servicio era un 401 corriente: no dejaba ningún error en el registro. Es el más dañino de los nueve `except Exception` del backend, porque convierte un fallo de infraestructura en un error de credenciales.

**Solución (después).** Se quita el `try/except`: la búsqueda no atrapa nada. Un fallo de la base de datos llega al manejador de excepciones del proyecto, que responde `500 «Error interno del servidor»`, y Django lo deja en el registro. Los demás caminos —usuario inexistente o inactivo, correo vacío o sin verificar, credencial rechazada por Google, sin `client_id`— responden igual que antes.

**Decisión de diseño.**

- *Solo este sitio.* Los otros ocho `except Exception` se revisaron y no se tocaron: `audit_service` (×2), `progression/services` y `ai_assistant:143` existen porque la auditoría y el progreso no deben interrumpir el juego (REGLA-006); `access_request_service` y `ai_assistant:64` registran el error y siguen con un mensaje amable; `grupos/services:387` junta el texto del error de cada fila del archivo importado; y `ai_assistant:80` solo cae a un título por defecto. Ninguno convierte un fallo del servidor en un error del cliente sin dejar rastro.
- *Un 500 y no un 503.* El proyecto ya traduce toda excepción sin tratar a 500 (`custom_exception_handler`); no se inventa otro código para un solo caso.

**Pruebas.** Backend 699 → **706** (+7), `manage.py check` limpio.

- *Caracterización (6, `test_google_login_contract.py`), escritas y verificadas sobre el código original:* usuario inactivo (401), cuenta sin correo (401), credencial que Google rechaza (401), proveedor de Google no instalado (400), cuerpo sin credencial (400) y el defecto mismo: el fallo de la base de datos como 401. Las dos que ejercitan la traducción de errores de `verify_google_credential` usan un transporte de Google falso (ver el hallazgo 2).
- *El cambio:* la última prueba pasa de esperar `401` a esperar `500 «Error interno del servidor»`. Es el cambio de comportamiento declarado; no hay otra aserción tocada.
- *Prueba añadida tras la mutación (1):* sin `client_id` configurado responde 400 con el mensaje exacto «El inicio de sesión con Google no está configurado».
- *Mutaciones, 7:* restaurar el `except`, dejar entrar a un inactivo, no exigir correo verificado, no exigir correo, dejar escapar el `ValueError` de Google, quitar la guarda del `client_id` y responder 403. **Las 7 detectadas**, pero la de la guarda del `client_id` **sobrevivió** al principio: la prueba que ya existía solo pedía que el mensaje nombrara a «Google», y sin la guarda el flujo cae igual en un 400 que también lo nombra (por el hallazgo 2). Se añadió la prueba con el mensaje exacto y entonces se detecta.
- *Una prueba existente, una línea (declarado):* `test_google_login_rejects_unknown_user(client)` pasó a `(client, db)`. Ninguna aserción cambió. Ver el hallazgo 1.

**Hallazgos.**

1. **Una prueba que pasaba sin ejecutar lo que decía probar.** `test_google_login_rejects_unknown_user` no pedía la fixture `db`, así que pytest-django prohíbe el acceso a la base y la búsqueda del usuario lanzaba `RuntimeError`. El `except Exception` lo tragaba y lo reetiquetaba como 401 «asociada», que era justo lo que la prueba esperaba: pasaba sin que la búsqueda se ejecutara jamás. Al quitar el `except` respondió 500 y se vio. Es el costo concreto del antipatrón: el mismo manejador que esconde los fallos del servidor esconde los de las pruebas.
2. **El inicio de sesión con Google no puede funcionar tal como se empaqueta.** `requirements.txt` lista `google-auth==2.59.1` pero no `requests`, que `google.auth.transport.requests` necesita (`import requests` falla en el `.venv`, y el `Dockerfile` solo instala `requirements.txt`). `verify_google_credential` siempre termina en su rama `ImportError` y responde `400 «El proveedor de Google no está instalado en el backend»`, aunque se configure `GOOGLE_OAUTH_CLIENT_ID`. No se corrige aquí porque cambia las dependencias que se despliegan: **decisión del equipo** (añadir `requests` o usar `google-auth[requests]`). Hoy el botón está oculto porque, sin `client_id`, `GET /api/auth/google/config` responde `enabled: false`; si se configura el `client_id` sin añadir `requests`, el botón aparece y falla. Las pruebas de este cambio no dependen de `requests`: sustituyen el transporte por uno falso.
3. **Efecto en la pantalla de inicio de sesión.** `login.component.ts` (`googleErrorMessage`) traduce 401 y 403 a «Esa cuenta de Google no está registrada o está inactiva. Solicita acceso o usa tu correo y contraseña.» y, para cualquier otro estado, muestra el mensaje del servidor. Con el cambio, una caída de la base de datos le muestra al estudiante «Error interno del servidor» en vez de decirle que su cuenta no está registrada. No se tocó el frontend; un texto más amable para los 5xx sería una línea en esa función.

**Evidencia.** `docs/diseñosistemas_docs/A-04/`: `antes_busqueda_del_usuario.png`, `despues_busqueda_del_usuario.png`, `antes_prueba_sin_base.png`, `despues_prueba_con_base.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`; son diagramas de flujo del manejo de errores).

**Relación con la materia.** Antipatrón «Exception Handling» (Unidad 4); la regla de capturar la excepción específica y dejar que el resto suba.


### A-06 · Hard Code — la contraseña por defecto de los importados pasa a configuración

| | |
|---|---|
| **Rama / commit** | `adsi/a06-default-password-config` · `e62a822` (parte de `adsi/a04-google-login-errors`: PR después de A-04) |
| **Antipatrón** | «Hard Code» (una credencial escrita como literal dentro del servicio) |
| **Archivos** | `psychosim/settings/base.py`, `apps/grupos/services.py`, `backend_django/.env.example`; `apps/grupos/tests/test_imported_password_setting.py` (nuevo) |
| **Riesgo** | Bajo: con la variable sin definir, el valor es el mismo de siempre |
| **Cambio de comportamiento** | Ninguno por defecto. Con `IMPORTED_STUDENT_DEFAULT_PASSWORD` definida, esa pasa a ser la contraseña de los importados sin password propio |

**Problema (antes).** `DEFAULT_IMPORTED_STUDENT_PASSWORD = "Siep2026!"` era una constante de `grupos/services.py` y se usaba en tres sitios: la hoja de instrucciones de la plantilla `.xlsx`, el resultado de la importación (`defaultPassword`, que ve el docente) y la asignación a cada estudiante importado sin password. Quien desplegaba no podía cambiarla sin tocar el código, así que la misma contraseña conocida valía para todos los importados de cualquier instalación.

**Solución (después).** `settings.IMPORTED_STUDENT_DEFAULT_PASSWORD` lee la variable de entorno del mismo nombre en `base.py`; si no existe o está en blanco —también tras recortarla— conserva `Siep2026!`, de modo que **nunca se crea una cuenta con la contraseña vacía**. Los tres usos de `services.py` leen la configuración en el momento de usarla (así `override_settings` funciona en las pruebas). La variable queda documentada en `.env.example`.

**Decisión de diseño.**

- *La opción segura del plan (CF-2).* Se extrae a configuración y se conserva el valor por defecto; no se rediseña el flujo. El rediseño de fondo (una contraseña temporal aleatoria por estudiante con cambio obligatorio en el primer ingreso) toca el flujo del docente y de Psicología y es una decisión del equipo (ver el hallazgo).
- *Producción no la exige.* A diferencia de `DJANGO_SECRET_KEY`, `production.py` no obliga a definirla: exigirla impediría arrancar cualquier despliegue que hoy funciona sin ella. Una advertencia en `manage.py check --deploy` sería la forma no destructiva de empujar a definirla; no se hizo para no ampliar el cambio.
- *Se lee al usarla, no al importar el módulo.* La constante de módulo habría congelado el valor al arrancar.

**Lo que no cambió:** con la variable sin definir, la plantilla, el resultado y las cuentas creadas son idénticos; las dos aserciones de `test_grupos.py` sobre `"Siep2026!"` (el `defaultPassword` y el `check_password` del estudiante importado) pasan sin tocarse. Un password propio en el archivo sigue mandando sobre el configurado.

**Pruebas.** Backend 706 → **716** (+10), `manage.py check` limpio.

- *Escritas antes del cambio:* 10 pruebas en `test_imported_password_setting.py`. Sobre el código original **3 pasaron** (la contraseña de siempre, la plantilla que la nombra y que el password del archivo manda: lo que ya hacía) y **7 fallaron** (la configurada se informa y se usa, la plantilla la nombra, y cinco casos de la lectura de la variable de entorno). Con el cambio pasan las 10.
- *Mutaciones, 8:* informar siempre `Siep2026!`, usarla siempre al importar, nombrarla siempre en la plantilla, ignorar el password del archivo, no recortar la variable, dejar la contraseña vacía con la variable en blanco, cambiar el valor de reserva e ignorar la variable. **Las 8 detectadas.**

**Hallazgos.** (1) El riesgo de fondo sigue en pie: **todos los importados nacen con la misma contraseña y el docente la ve en pantalla**; este cambio solo permite que no sea la del repositorio. La recomendación es una contraseña temporal aleatoria por estudiante con cambio obligatorio, o un enlace de activación. (2) `Siep2026!` sigue escrito en `base.py` como valor de reserva (y en las dos aserciones de `test_grupos.py` y en las pruebas nuevas): es el default de desarrollo, igual que `psychosim_secret` para la base de datos, y el repositorio es privado. (3) La interfaz del docente (`grupo-list.component.ts`) muestra `defaultPassword` tal cual llega; no se tocó.

**Evidencia.** `docs/diseñosistemas_docs/A-06/`: `antes_literal_en_el_servicio.png`, `despues_configuracion.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`; son diagramas de flujo de dónde nace y adónde llega la contraseña).

**Relación con la materia.** Antipatrón «Hard Code» (Unidad 4): una credencial no debe vivir en el código; configuración por entorno.


### P-03 · Prototype — la copia de una versión de caso, declarada una sola vez

| | |
|---|---|
| **Rama / commit** | `adsi/p03-clone-prototype` · `c0a5de6` (parte de `adsi/a06-default-password-config`: PR después de A-06) |
| **Patrón** | Prototype (creacional), declarativo; de paso elimina «Cut & Paste» |
| **Archivos** | `services/case_cloning.py` (nuevo), `services/authoring_service.py` (los `_clone_*`); `tests/test_clone_version_contract.py` y `tests/test_case_cloning.py` (nuevos) |
| **Riesgo** | Medio: es cómo un autor crea una versión nueva, y la versión publicada no debe tocarse (REGLA-005). Protegido por una prueba de clon completo escrita antes |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `clone_version` copiaba una versión con ocho funciones `_clone_*` (nodos, decisiones, mapas, zonas, objetos, diálogos con sus líneas y opciones, herramientas, rúbricas con sus criterios) que escribían a mano, campo por campo, el mismo `objects.create(campo=origen.campo, …)`: **83 asignaciones en 12 entidades**. Era un «Cut & Paste» en el que un campo nuevo del modelo se olvidaba sin que nada fallara, y de hecho ya se habían olvidado algunos (ver hallazgos).

**Solución (después).**

- `case_cloning.py` declara, para cada entidad, **qué campos se copian tal cual** con un `CopySpec(modelo, campos)` inmutable, y tiene **una sola forma de copiar**: `copy(origen, **vínculos)` crea la fila con los campos declarados más los vínculos que pasa quien clona.
- `authoring_service.py` conserva el orden y el recorrido (qué se copia primero y cómo se remapean nodos, mapas y decisiones) y pone únicamente los vínculos; cada `_clone_*` pasó de entre 11 y 30 líneas a entre 3 y 17.
- `objects.create` por fila y los mismos órdenes (`id`, `display_order`): los identificadores se asignan en el mismo orden que antes.

**Decisión de diseño.**

- *Declarativo, no el `clone()` del libro.* Un `clone()` en cada modelo mezclaría persistencia con la regla de autoría (las tablas son `managed = False`). Aquí el prototipo es la fila de origen y la declaración dice qué de ella se copia: Prototype guiado por datos.
- *Listas de campos explícitas, no derivadas de `_meta`.* Derivarlas copiaría de más: el candado optimista de la versión (`CaseVersion.version`), `Rubric.is_default`… Cambiaría el comportamiento. Con listas explícitas, un campo nuevo del modelo no se copia hasta que alguien lo decida, y la prueba de clon completo obliga a esa decisión.
- *Los vínculos los pone quien clona.* Dependen de qué copias existen (`node_copies`, `map_copies`, `decision_copies`); el módulo no sabe de ellas.
- *No es un recorte de líneas.* El servicio pierde 125 líneas y gana 27, y el módulo nuevo suma 89 (con su explicación); lo que cambia es que las listas de campos son datos y la copia existe una sola vez.

**Lo que no cambió:** qué se copia (los mismos 83 campos), con qué vínculos, en qué orden, y que la versión de origen no se modifica. Las 20 pruebas de `test_authoring.py` pasan sin tocarse.

**Pruebas.** Backend 716 → **759** (+43), `manage.py check` limpio.

- *Clon completo (16), `test_clone_version_contract.py`, escrita y verificada sobre el código original:* para cada una de las 11 entidades que cuelgan de la versión recorre todos los campos concretos del modelo y compara cada fila del clon con la de origen (los vínculos, por la clave natural de lo que apuntan). Excluye solo identificadores, marcas de tiempo y el vínculo con la versión, y trae escritos los **huecos conocidos**. Además: el clon es un borrador enlazado al origen, las entidades cuelgan del clon y no de la fuente, las rúbricas quedan a nombre de quien clona y **la versión publicada de origen no cambia** (REGLA-005).
- *Una fila «toda distinta» por entidad.* La primera versión de la prueba usaba solo los datos sembrados y **cuatro** omisiones del clon original pasaban desapercibidas (`position_y` de un nodo, la decisión enlazada de un objeto, el `portrait_key` de un árbol y el `effect_json` de una opción), porque en lo sembrado valían el valor por defecto o `None`. Ahora la fuente trae, de cada entidad, una fila con **todos** los campos distintos del predeterminado, calculados desde el modelo.
- *Declaración (27), `test_case_cloning.py`, sin base de datos:* que cada campo declarado exista, sea plano (no clave foránea, ni identificador, ni marca de tiempo) y no se repita, y cómo `copy` junta campos y vínculos.
- *Mutaciones sobre el código original (18):* quitar un campo o un vínculo de cada `_clone_*` y no enlazar el clon al origen. **Las 18 detectadas** (con la fila «toda distinta»).
- *Mutaciones sobre el código nuevo (25):* quitar un campo de cada una de las 12 declaraciones, apuntar un vínculo a la fila de origen, perder una decisión o un objeto enlazado, conservar el autor original de la rúbrica, no enlazar al origen, conservar el estado de la fuente y revertir el orden. **24 detectadas.** Una sobrevivió al principio —la rúbrica clonada conservando al autor original— porque en la fuente creaba la rúbrica el mismo usuario que clona; ahora la crea otro. La que queda es equivalente: clonar las líneas de un diálogo en orden inverso solo cambia los identificadores asignados, y todos los lectores las ordenan por `display_order`.

**Hallazgos.** Los huecos que el clon tiene **hoy**, ahora escritos y fijados por la prueba (no se corrigen aquí: son un cambio de comportamiento y una decisión del equipo):

1. `RubricCriterion.weight` **no se copia**: el criterio clonado recibe el valor por defecto (0). `rubric_service` usa `weight or max_score`, así que el peso personalizado de una rúbrica se pierde al clonar la versión y el criterio vale su `max_score`. La duplicación de rúbricas del propio `rubric_service` sí lo copia: son dos rutas de copia con criterios distintos.
2. `RubricCriterion.active` **no se copia**: un criterio desactivado vuelve activo en el clon.
3. `Rubric.version` no se copia (el clon vuelve a «1.0»); la duplicación del `rubric_service` sí la copia.
4. `Rubric.is_default` no se copia; probablemente es a propósito (solo puede haber una rúbrica por defecto: `set_default` apaga las demás), pero no estaba dicho en ningún sitio.
5. `CaseVersion.world_schema_version` no se copia: el origen puede valer 2 y el clon queda en 1. Hoy nada lo lee (solo se escribe al crear un caso), así que no tiene efecto visible.

Cada uno se corrige añadiendo el campo a su `CopySpec` y quitándolo de `KNOWN_GAPS` en la prueba.

**Evidencia.** `docs/diseñosistemas_docs/P-03/`: `antes_clones_campo_por_campo.png`, `despues_copia_declarativa.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Prototype (patrones creacionales, Unidad 2: sustentación 1) y el antipatrón «Cut & Paste» (Unidad 4). Es el único cambio de la serie cuya prueba previa descubrió defectos que el código ya tenía.


### A-01b · Cut & Paste — las primitivas de dibujo de las salas, una sola vez

| | |
|---|---|
| **Rama / commit** | `adsi/a01b-draw-primitives` · `7f5c2cf` (parte de `adsi/p03-clone-prototype`: PR después de P-03) |
| **Antipatrón** | «Cut & Paste» (código duplicado) |
| **Archivos** | `features/simulator/graphics-primitives.util.ts` (nuevo), `case-pdf-rooms.renderer.ts` y `premium-clinical-room.renderer.ts`; `scene-renderers.draw-calls.spec.ts` (nuevo) |
| **Riesgo** | Bajo en el código, pero es arte: protegido por un «maestro dorado» de cada llamada de dibujo, escrito antes |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `rectC`, `frameC` y `ellipseC` —rectángulo relleno, contorno de rectángulo y elipse con coordenadas centradas— estaban copiadas, **idénticas**, en `case-pdf-rooms.renderer.ts` y en `premium-clinical-room.renderer.ts`, y entre los dos archivos se usan 239 veces (136 y 103). Arreglar una (por ejemplo, el grosor por defecto del contorno) no llegaba a la otra. `contactShadow` también estaba duplicada, con una única diferencia: el color de la sombra sale de `SHADOW` en un archivo y de `PAL.shadow` en el otro (hoy valen lo mismo, `0x05070d`).

**Solución (después).** `graphics-primitives.util.ts` define las tres primitivas y los dos renderers las importan; los 239 puntos de uso no cambian de nombre ni de firma. `contactShadow` se queda en cada archivo: usa la paleta de su propio renderer y unificarla exigiría decidir si las paletas comparten la sombra.

**Decisión de diseño.**

- *Un módulo de utilidades, sin clase.* Son funciones puras sobre un `Graphics` (solo tipos de Phaser: el import se elide y los specs corren sin canvas).
- *`contactShadow` no se mueve.* Parece lo mismo pero depende del color de cada paleta; moverla con un parámetro de color cambiaría ~50 llamadas por una diferencia de nombre.
- *Es el paso previo de P-14b.* Con las primitivas fuera, la plantilla de las salas del caso queda con solo lo que es de cada sala.

**Lo que no cambió:** ni una llamada de dibujo: las huellas de los diez renderizados (las cuatro salas del caso con y sin texturas, y la sala premium con y sin movimiento) son las mismas antes y después.

**Pruebas.** Frontend 2255 → **2266** (+11; 174 → 175 archivos), `tsc` de app y de pruebas sin errores y `ng build` correcto.

- *Maestro dorado (11), `scene-renderers.draw-calls.spec.ts`, escrito y verificado sobre el código original:* una escena falsa registra en orden **cada** llamada (qué objeto crea y con qué profundidad, qué rectángulos, elipses, líneas y textos pinta, con qué colores y transparencias, y los tweens) y la resume en una huella (cantidad de eventos y los primeros 16 caracteres de un SHA-256). Diez huellas fijas —4 salas del caso × con/sin texturas y la sala premium × con/sin movimiento— y una prueba de control: la huella es determinista y cambia con un solo carácter. Las huellas salieron iguales en dos corridas seguidas.
- *Mutaciones, 10:* descentrar el rectángulo en x o en y, cambiar la transparencia por defecto o ignorarla, cambiar el grosor por defecto del contorno, rellenar en vez de contornear, intercambiar ancho y alto de la elipse, descentrarla y cambiar su transparencia. **Las 10 detectadas.**

**Hallazgos.** (1) Las pruebas de las salas que ya existían (`case-pdf-rooms.spec.ts`, `case-pdf-rooms.furniture.spec.ts`) comprueban la metadata, las colisiones y los muebles, **no** qué se pinta ni en qué orden; un cambio de color o una capa movida habría pasado. El maestro dorado cubre ese vacío. (2) Si el arte cambia a propósito, las huellas hay que recalcularlas y anotarlo; el encabezado del spec lo dice. (3) No se abrió el juego en el navegador: para un refactor que no debe mover un píxel, la huella exacta de cada llamada es una garantía más fuerte que una captura de pantalla.

**Evidencia.** `docs/diseñosistemas_docs/A-01b/`: `antes_primitivas_copiadas.png`, `despues_primitivas_compartidas.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Antipatrón «Cut & Paste» (Unidad 4); «no te repitas» (DRY).


### P-14b · Template Method — el esqueleto común de las salas del caso

| | |
|---|---|
| **Rama / commit** | `adsi/p14b-room-template-method` · `13dfb9c` (parte de `adsi/a01b-draw-primitives`: PR después de A-01b) |
| **Patrón** | Template Method (comportamiento) |
| **Archivos** | `features/simulator/case-pdf-rooms.renderer.ts`; `case-pdf-rooms.template.spec.ts` (nuevo) |
| **Riesgo** | Bajo-medio: es arte y el orden de las capas importa; protegido por el maestro dorado de A-01b, que no cambió |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** `renderUrgencias`, `renderSalaEscucha`, `renderRecepcion` y `renderConsultorio` repetían el mismo esqueleto —elegir la paleta, pintar el cascarón, crear el gráfico de la pared, **pasos propios de cada sala**, pintar la luz y devolver la metadata— y solo diferían en los pasos de en medio. Cinco líneas iguales escritas cuatro veces, con una excepción escondida: la sala de escucha pinta una alfombra entre la pared y los muebles. Agregar una sala era copiar una de ellas y editarla, y nada impedía olvidar la luz o cambiar el orden de las capas.

**Solución (después).**

- `CaseRoom` (clase abstracta) tiene el **método plantilla** `render`, que fija el orden: cascarón → gráfico de pared → `paintWall` → `paintFloor` → `paintFurniture` → luz → metadata. Los pasos propios de cada sala son abstractos (`paintWall`, `paintFurniture`) y el piso es un **gancho** con una implementación vacía por defecto.
- `UrgenciasRoom`, `SalaEscuchaRoom`, `RecepcionRoom` y `ConsultorioRoom` aportan solo sus pasos, su `kind` y sus pozos de luz (`lightPools`, un dato). La sala de escucha es la única que sobrescribe el gancho (la alfombra); su lámpara de pie sigue siendo parte de sus muebles, como antes.
- `makeRenderer` y las claves (`case-pdf-hospital-urgencias`…) no cambian: el registro de salas ahora instancia cada clase una vez (`ROOMS`).

**Decisión de diseño.**

- *Clases, no una tabla de funciones.* En TypeScript una función que recibe un objeto de pasos habría servido igual; se prefirió la forma clásica del patrón porque deja a la vista lo que se pide a cada sala (pasos abstractos), lo que es opcional (el gancho) y lo que no se toca (la plantilla).
- *El orden es parte del arte.* Lo que se pinta después queda por encima, y los gráficos de igual profundidad se apilan por orden de creación. Por eso `render` no se sobrescribe: TypeScript no tiene `final`, así que lo garantizan su comentario y las pruebas.
- *Un solo gancho.* Es la única variación de estructura que hay hoy (la alfombra). Si aparece otra (una animación ambiental, por ejemplo), será otro gancho, no otra rama dentro de la plantilla.
- *La luz como dato.* De la última capa lo único que varía son los centros de los pozos: se declara como `lightPools` en lugar de un paso más.
- *`CaseRoom` se exporta* solo para la prueba de la plantilla; el resto del juego sigue usando `SceneRenderer`.
- *`premium-clinical-room` no se toca.* Tiene el mismo estilo por capas pero una sola sala y sin variantes: un Template Method con una única implementación no aporta nada (es la conclusión de la Fase 0).

**Lo que no cambió:** ni una llamada de dibujo. Las ocho huellas del maestro dorado de las salas del caso (cuatro salas, con y sin texturas) son las mismas que antes, a la primera. Las pruebas de geometría, colisiones y muebles de las salas pasan sin tocarse.

**Pruebas.** Frontend 2266 → **2271** (+5; 175 → 176 archivos), `tsc` de app y de pruebas sin errores y `ng build` correcto.

- *Maestro dorado de A-01b, sin cambios:* es lo que comprueba que el resultado de las cuatro salas es idéntico; se escribió antes, sobre el código original.
- *Plantilla (5), `case-pdf-rooms.template.spec.ts`:* con una sala mínima que anota cuándo corre cada paso: el cascarón va primero y la luz al final; la pared, el piso y los muebles van entre medio, en ese orden; el piso es un gancho (sin sobrescribirlo la plantilla sigue); el gráfico de la pared se crea una vez y antes de pintarla; y cada sala real devuelve la metadata de la suya.
- *Mutaciones, 13* (muebles antes que piso, luz antes que muebles, sin luz, sin cascarón, paleta única, metadata única, sin alfombra, pozos intercambiados, sin rótulo «TRIAGE», un archivador corrido un píxel, la lámpara antes que la silla, la sala equivocada en el registro y la pared sobre otra capa): **las 13 detectadas.** Una —«todas las salas devuelven la metadata de urgencias»— sobrevivió al principio, porque ninguna prueba comprobaba lo que devuelve `render` de cada sala real (solo la función `caseRoomMetadata`); se añadió esa prueba y entonces se detecta.

**Hallazgos.** (1) Lo que devuelve `render` de cada sala no tenía prueba (la mutación lo mostró). (2) Los pasos de pared y muebles siguen teniendo dibujo en línea (el tablón de avisos, el diploma con su repisa, la lámpara de pie): se podrían nombrar como las demás piezas; el maestro dorado permite hacerlo sin riesgo. (3) La plantilla queda lista para una quinta sala: es una clase con `kind`, `lightPools`, `paintWall` y `paintFurniture`.

**Evidencia.** `docs/diseñosistemas_docs/P-14b/`: `antes_cuatro_esqueletos.png`, `despues_metodo_plantilla.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Template Method (patrones de comportamiento, Unidad 3); principio de Hollywood («no nos llames, nosotros te llamamos») y abierto/cerrado (SOLID).


### P-05b · Facade — `authoring_service` pasa a ser la puerta de un subsistema por responsabilidades

| | |
|---|---|
| **Rama / commit** | `adsi/p05b-authoring-facade` · `d48f0be` (parte de `adsi/p14b-room-template-method`: PR después de P-14b) |
| **Patrón** | Facade (estructural); de paso reparte responsabilidades (SRP) y deshace un «objeto Dios» |
| **Archivos** | `services/authoring_service.py` (ahora la fachada), `services/authoring/` (nuevo: 9 módulos), `services/case_cloning.py` (solo un comentario); `tests/test_authoring_operations_contract.py` (nuevo); `tools/codeshot.py` (ancho de la numeración con cuatro cifras) |
| **Riesgo** | Medio: es todo el editor de casos y lleva la auditoría, las transacciones y la regla de que lo publicado no se toca (REGLA-005). Protegido por pruebas de caracterización escritas antes y por una comparación estructural, función por función |
| **Cambio de comportamiento** | Ninguno |

**Problema (antes).** Es el candidato que P-05 dejó anotado. `authoring_service.py` era un único módulo de **1266 líneas y 71 funciones** que el propio archivo repartía, con comentarios, en 17 secciones: casos, guardas, vista del editor, nodos, decisiones, mapas, objetos, diálogos, herramientas, checklist, publicación, clonado, editor de mundo, su validación y los DTO de lectura. Ocho responsabilidades con razones de cambio distintas en un mismo archivo: para tocar la validación del mundo había que abrir el mismo módulo que el clonado o la auditoría, el módulo importaba 14 modelos más los DTO, el clonado, la validación y la auditoría, y la auditoría de 22 operaciones se aplicaba **reasignando cada nombre al final del archivo** (`create_node = auditable(...)(create_node)`), a mil líneas de la función que decoraba. Las vistas llaman a 28 de esas funciones.

**Solución (después).**

- `authoring_service.py` queda como **fachada** (176 líneas, con su explicación): las mismas 28 operaciones con la misma firma, cada una una línea que delega en el subsistema, y las 22 que modifican algo con su `@auditable` justo encima.
- `services/authoring/` reparte el resto, un módulo por responsabilidad:

| Módulo | Qué contiene | Funciones | Líneas |
|---|---|---|---|
| `guards` | qué versión y qué entidades se pueden tocar (404 / 400) | 8 | 90 |
| `request_utils` | lectura de los cuerpos de petición | 2 | 10 |
| `editor_view` | la vista de lectura del editor y sus DTO | 8 | 179 |
| `cases` | listar y crear casos | 4 | 102 |
| `graph` | nodos y decisiones | 8 | 110 |
| `scenes` | mapas, objetos y diálogos | 14 | 202 |
| `tools` | herramientas clínicas | 4 | 42 |
| `publication` | checklist, publicar y clonar una versión | 14 | 222 |
| `world_definition` | editor de mundo: leer, guardar, validar, previsualizar | 10 | 386 |
| `authoring_service` (fachada) | las 28 operaciones y la auditoría | 28 | 176 |

- Las dependencias no tienen ciclos (se comprobó con el grafo de importaciones): `guards` y `request_utils` no importan nada del paquete; `editor_view` solo `guards`; `graph`, `scenes` y `tools` importan la vista y las guardas; `world_definition` importa `scenes` (las opciones de un diálogo se guardan igual en los dos sitios); `publication` importa `world_definition` (publicar valida el mundo); `cases` importa `publication` (un caso nuevo nace con su checklist).
- Las vistas no se tocaron: siguen importando `authoring_service`.

**Decisión de diseño.**

- *La auditoría vive en la fachada, y por eso la fachada no reexporta.* `@auditable` guarda en el `context` del registro el nombre de la función y el último tramo de su módulo (`class: authoring_service`). Si la auditoría se aplicara en `graph.py` o `publication.py`, las filas pasarían a decir `class: graph`, `class: publication`… y quien lea el registro vería otro valor. Por eso cada operación es una función propia de la fachada y no un `from .graph import create_node`. Una prueba fija el `context` de las 22.
- *La auditoría sigue fuera de la transacción.* La operación del subsistema corre dentro de su `@transaction.atomic` y el registro se escribe después; un fallo del registro nunca llega a quien llama (como antes).
- *Fachada explícita: 28 funciones cortas.* Es la lista de lo que el editor ofrece; antes había que deducirla de las funciones sin guion bajo de un archivo de 1266 líneas.
- *Se movió el código, no se reescribió.* Una comparación de los árboles sintácticos, función por función, da **67 de 71 idénticas**; las otras cuatro difieren solo en lo declarado abajo.
- *No es un recorte de líneas.* El conjunto pasa de 1266 a 1519 líneas (docstrings de módulo, imports por módulo y las 28 funciones de la fachada). Lo que cambia es dónde vive cada cosa y que ninguna responsabilidad obliga a abrir las demás.
- *`save_dialogue_choices` es pública en `scenes`* porque la usa también `world_definition`; en el original era privada del módulo único.
- *Paquete bajo `services/`, no módulos sueltos junto a los demás servicios:* `services/` ya tiene más de veinte archivos y estos nueve solo tienen sentido juntos, detrás de la fachada.

**Diferencias declaradas** (las únicas entre el código movido y el original):

1. `update_decision` y `delete_decision` tenían escrita en línea la guarda «la decisión existe y es de esta versión»; ahora usan `require_decision_in_version`, igual que nodos, mapas, objetos, herramientas y diálogos usaban la suya. Mismos mensajes y mismos códigos (404 y 400), fijados por prueba.
2. `update_checklist` importaba `timezone` dentro de la función; el import sube al encabezado del módulo.
3. `save_dialogue_choices` gana un docstring.

**Lo que no cambió:** las respuestas, los mensajes y los códigos HTTP; las filas de auditoría de las 22 operaciones (acción, tipo de recurso, identificador y `context`); que `create_case` siga sin auditarse; las transacciones; el orden de las escrituras; las firmas de las 28 operaciones.

**Pruebas.** Backend 759 → **804** (+45), `manage.py check` limpio.

- *Caracterización, 25 escritas y verificadas sobre el original antes de mover nada* (`test_authoring_operations_contract.py`): una por una, las 28 operaciones: qué responde (código y mensaje), qué escribe y qué deja en la auditoría (acción, tipo de recurso, id y `context`, que es lo que la fachada podía cambiar sin que nada más fallara), los errores con su mensaje exacto, y que ninguna mutación sobre una versión publicada pase ni deje rastro.
- *Añadidas tras la primera ronda de mutaciones, 20:* cada una mata una mutación que las anteriores y las de `test_authoring.py` dejaban pasar. Vista previa del mundo por nodo; la validación y la salida segura; las opciones de un diálogo solo enlazan decisiones de su versión; la decisión sin retroalimentación se guarda vacía; la versión archivada no se modifica ni se publica; lo ya publicado se rechaza; publicar deja la fecha; publicar con errores de validación se rechaza y los nombra; el checklist parcial y el completo; el siguiente menor de un clon y la versión de dos partes; los códigos de caso; el checklist con que nace un caso; la transacción de crear y de actualizar un diálogo, de guardar el mundo, de clonar y de crear un caso; una prueba que recorre las 16 mutaciones de una sola escritura y comprueba que, si armar la vista falla, no queda nada escrito; y una que fija el 500 de crear una herramienta sin descripción. **Las 45 pasan también sobre el `authoring_service.py` original** (se cambió el archivo por el de `HEAD`, se corrieron y se restauró por hash).
- *Comparación estructural (script de apoyo, no ejecuta nada):* 67 de 71 funciones idénticas; las 22 auditorías con la misma acción, tipo de recurso e índice del argumento; las 28 firmas iguales y cada una delegando con los mismos argumentos. Es una garantía de que **el código se movió**; que **se comporte igual** lo dicen las pruebas.
- *Dos comprobaciones estáticas:* ningún import sin uso y ningún nombre sin definir en los 10 archivos (la comparación de árboles iguala `_ayudante` y `ayudante` a propósito, así que no habría visto una referencia a uno que dejó de existir).
- *Mutaciones, 64 distintas en tres rondas.* **Primera (41),** sobre la fachada y los nueve módulos: delegar en otra función, quitar la auditoría o cambiarle la acción, el tipo de recurso o el índice, no pasar el actor, invertir cada guarda de pertenencia, los límites del checklist y de la publicación, el siguiente menor, el código de caso, la salida segura, las opciones de diálogo, y algunas transacciones. **29 detectadas y 12 sobrevivieron.** **Segunda (20):** esas 12 más 8 nuevas, ya con las pruebas añadidas: **19 detectadas**; sobrevivió `update_decision` sin transacción (hace una sola escritura, y nada prueba que se deshaga si falla armar la vista). **Tercera (16):** quita la transacción de cada una de las mutaciones de una sola escritura: **las 16 detectadas** por la prueba que recorre todas. Resultado: las 64 detectadas con el conjunto final. Una de la primera ronda (`clone_version` sin el actor) terminó en *error* y no en *fallo*: la fixture `draft` clona la versión y el clon revienta porque `created_by` es NOT NULL; deja la suite en rojo igual.

**Lo que enseñaron los doce supervivientes.** Ninguno era un riesgo nuevo de mover el código: eran huecos que **el original ya tenía** y que la suite de entonces no veía. No había prueba de la vista previa del mundo con un nodo, de que una versión archivada se rechace, de que una decisión sin retroalimentación se guarde vacía, del estado del checklist (`COMPLETE` / `PENDING`), de la numeración del clon, de la fecha de publicación, de los códigos únicos, del checklist inicial, de la salida segura en la validación, del filtro por versión en las opciones del diálogo ni de las transacciones. El cambio los cierra. De paso, la prueba de que «lo publicado no se toca» ahora recorre las 20 operaciones que modifican algo (antes de añadir `update_dialogue` y `delete_dialogue` recorría 18); `publish` y `clone_version` tienen la suya.

**Hallazgos.** Lo que las pruebas de caracterización encontraron en el código tal como estaba (no se corrige aquí; son cambios de comportamiento):

1. `create_case` es la única operación del editor que **no deja rastro de auditoría**: las otras 22 sí. Quedó fijado como «comportamiento actual».
2. `create_object` sin `interactionPrompt` o `interactionText`, y `create_tool` sin `description`, responden **500**: las columnas son NOT NULL y la operación guarda `None`; el editor de mundo (`save_world`) completa con `""`. Dos rutas de escritura del mismo objeto con criterios distintos.
3. `update_dialogue` sin `lines` en el cuerpo **borra las líneas** del diálogo (las borra antes de mirar el cuerpo).
4. `_world_clinical_tool` (en `world_definition.py`) es una copia exacta de `clinical_tool_editor` (en `editor_view.py`). No se tocó para no mezclar un «Cut & Paste» con este cambio.
5. Publicar un borrador clonado del caso sembrado funciona (200). `test_checklist_full_then_publish` ramifica según `canPublish`: hoy siempre entra por la rama de éxito, pero no comprobaba la fecha de publicación, y la rama de rechazo (publicar con errores de validación) no se ejercitaba con datos reales. Las cubren ahora `test_publicar_deja_la_version_publicada_con_su_fecha` y `test_publicar_con_errores_de_validacion_se_rechaza_y_los_nombra`.

**Evidencia.** `docs/diseñosistemas_docs/P-05b/`: `antes_un_solo_modulo.png`, `despues_fachada_y_paquete.png`, `uml_antes.png`, `uml_despues.png` (fuentes Mermaid `.mmd`).

**Relación con la materia.** Facade (patrones estructurales, Unidad 2); responsabilidad única y abierto/cerrado (SOLID); antipatrón «clase Dios / objeto Dios» y, en `save_world`, «función larga» (Unidad 4). Es la contraparte backend de P-05: allí se partió por roles el servicio del frontend; aquí, por responsabilidades, el de autoría.
