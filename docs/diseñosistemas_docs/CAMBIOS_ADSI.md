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
