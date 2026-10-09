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
