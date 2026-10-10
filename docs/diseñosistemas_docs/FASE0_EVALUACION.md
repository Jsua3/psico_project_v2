# Fase 0 — Evaluación del estado actual de SIEP y ajustes al plan (v2)

**Fecha:** 5 de octubre de 2026. **Alcance:** lectura del código, línea base de pruebas (en contenedor), tag/rama y un único commit de 1 línea en `adsi/integracion` (fix del spec). Actualizado tras la migración de `master` a Angular 22/Vitest/Django 6.1.
Este documento **reemplaza las partes marcadas** de `PLAN_APLICACION_PATRONES_SIEP.md` (v1). Donde el plan v1 se equivocó, se dice explícitamente.

---

## 1. Lo que ya quedó hecho en el repositorio

| Acción | Resultado |
|---|---|
| Tag `adsi-baseline` | **Reubicado** a `master` = `f39ab96` (Merge PR #17 «actualizar stack», que incluye el fix #18). Antes apuntaba a `92354c2`, que quedó viejo al fusionarse los PR #17 y #18. Es el «antes» de todas las capturas |
| Rama `adsi/integracion` | Creada desde `f39ab96`; el árbol de trabajo sigue en `master`, sin `checkout` |
| Commit `c490c95` en `adsi/integracion` | `fix(test): journal-panel.spec usa vi.fn() tras la migración a Vitest` (1 línea). Sin él, `ng test` no compila. **No se ha empujado** |
| `.git/index.lock` y 8 `tmp_obj_*` | Eran restos de mis comandos desde la VM; se borraron con tu permiso y `git status` quedó limpio (solo los 2 docs sin seguimiento) |
| `master` | Intacto (`f39ab96`, igual que `origin/master`) |

---

## 2. Línea base verificada (stack nuevo: Django 6.1.1, Angular 22.2, Vitest 5)

`master` cambió mientras se planeaba: el frontend pasó de Jest a **Vitest** (`ng test`), Angular a 22.2.1, Django a 6.1.1 / DRF 3.18 / psycopg 3. Las menciones a Jest, `diagnostics:false` y los conteos «≈249 pytest / 148 specs jest» del plan v1 **quedan obsoletas**.

Sin Docker en mi VM, se montó un entorno de prueba en mi contenedor (Python 3.12, PostgreSQL 16.2 embebido, Node 24.21; el proyecto usa Py 3.14 / PG 18 / Node 24). Resultados sobre `f39ab96` + el fix de una línea:

| Suite | Resultado |
|---|---|
| Backend `pytest` | **307 passed** |
| Frontend `ng test` (Vitest) | **149 archivos / 1809 tests passed** (con el fix; **sin él no compila**: TS2304 `jest` en `journal-panel.component.spec.ts:102`, por lo que el job «Frontend» del CI de `master` probablemente está en rojo) |
| `npm run build` (Angular) | OK |
| Tests de `character-assets` y `scripts` | OK |
| E2E Playwright | No ejecutado todavía |

Salvedades: no es el entorno oficial (otras versiones de Python/PostgreSQL); el CI de GitHub sigue siendo la fuente oficial. Ese CI solo corre en `pull_request`, `push` a `master` y `workflow_dispatch`: hay que empujar `adsi-baseline` y `adsi/integracion` y abrir un PR *draft* hacia `master` (o lanzar el workflow a mano) para tener esa evidencia.

| Otros hallazgos | Consecuencia |
|---|---|
| Mi shell es una VM Linux sin Docker/PostgreSQL y `node_modules`/`.venv` del repo son de Windows | Las pruebas corren en una copia en mi contenedor; los commits se aplican a tu repo con comandos de bajo nivel de Git, sin tocar tu árbol de trabajo ni tu índice |
| `git status` desde la VM marcaba todo modificado (CRLF vs LF, sin identidad) | Artefacto de la VM: en IntelliJ el árbol está limpio. Los commits van a nombre de Juan José Sua con `Co-Authored-By: Claude` |

---

## 3. Evaluación de cada cambio contra el código real

Se leyó el código de cada cambio (rangos de líneas, quién lo llama, qué tests lo cubren). **Varios supuestos del plan v1 eran incorrectos.** Riesgo: B bajo, M medio, A alto.

### 3.1 Backend

| ID | Veredicto | Lo que se encontró | Riesgo real | Ajuste |
|---|---|---|---|---|
| **P-01** Strategy + Adapter + Factory (IA) | **Se mantiene** | Líneas reales en `ai_assistant.py`: `_call_llm` 106-115, `_call_openai` 117-129, `_call_anthropic` 131-143, `_post_json` 145-161. Los 11 tests parchean `AIAssistantView._call_llm` (firma `(self, question, context)`) y `AIAssistantView._post_json`: **esos atributos deben seguir existiendo** o los tests fallan con `AttributeError`. `NotConfigured` debe seguir a nivel de módulo. Los ajustes se leen en tiempo de llamada. **Bug latente:** el modelo por defecto es `gpt-4o-mini` también con `PROVIDER=anthropic` | **M** | Test de caracterización antes (payload y parseo de cada proveedor, proveedor desconocido cae a OpenAI, `choices` vacío, HTTPError recortado a 300). Decidir si se corrige el modelo por defecto por proveedor (cambio de comportamiento) |
| **P-02** Factory de parsers | **Se retira como patrón** | **El frontend NO ofrece CSV:** `grupo-list.component.ts:215` usa `accept=".xlsx"` y la línea 947 rechaza lo demás; el serializer y `_parse_student_import` también; `import_spec()` devuelve `[".xlsx"]`. El error está en el **README** (líneas 109 y 125), no en el código. `_parse_csv_rows` (línea 127) no tiene ningún llamador. Un Factory con un solo formato es especulativo | — | **CF-1 desaparece** (no hay cambio funcional que decidir): el README se corrige y `_parse_csv_rows` se borra (A-02). El Factory Method queda representado por `create_provider()` en P-01 |
| **P-03** Prototype de clonado | **Pasa a Fase 2 y cambia de forma** | `clone_version` 636-658 y diez `_clone_*` (661-840). **No copian todo:** no se clonan `CaseVersion.world_schema_version`, `Rubric.version/is_default`, `RubricCriterion.weight/active` (el clon queda con `weight=0` y `active=True`), `SimulationRubricAssignment` ni `PublicationChecklistItem`. Hay además un `rubric_service.duplicate` (236-261) que sí copia `weight`, `active` y `version`: **dos implementaciones divergentes**. Hay remapeo de 5 claves foráneas con orden de dependencias (nodos → decisiones → mapas → objetos → diálogos). El único assert sobre lo clonado es `len(nodes) == source_nodes` | **A** | Un clon genérico por reflexión **cambiaría comportamiento**. Se hace solo con listas **declarativas** de campos que reproduzcan exactamente lo de hoy, después de un test de clon completo. Las omisiones se documentan como hallazgos (antipatrón), no se corrigen en silencio |
| **P-04** Builder del reporte | **Se mantiene** | `build_completion_report` 197-295; 3 llamadores (`game_service.py:225` y `:319`, `instructor_service.py:108`); `attempt_state` se llama en 9 sitios. La lista `competencies`, las recomendaciones por estrés ≥ 70 y `summaryMessage` **no tienen ningún test**. El dict `summary` se indexa con `[attempt.status]`. Los llamadores de `game_service` generan N+1 consultas (sin `select_related`) | **M** | Test de caracterización primero; un Builder **no debe cambiar el número de consultas** |
| **P-08** Chain (puertas) | **Se mantiene** | `_validate_door` 433-466, un solo llamador (`enter_room`, línea 420). Orden real: existe y es `EXIT` (404) → `targetNodeKey` (400) → cercanía (400) → `requiresInspected` → `requiresTools` → `requiresNodes` → `requiresNpcs` (mismo `lockedMessage`). **`requiresTools` y `requiresNpcs` no tienen ningún test.** El docstring de `enter_room` (395-406) está desactualizado | **M** | Test previo de las 4 condiciones y de los códigos 404/400, que deben preservarse |
| **P-08** Chain (filas de importación) | **Se descarta** | `_validate_import_rows` 373-427 acumula errores de nombre y apellido por fila sin cortar; una cadena que corte en el primer error **cambiaría el contrato** | — | Se queda como está; no se fuerza |
| **P-09** Iterator | **Se reduce** | Ubicación real: `get_progress_map` está en `game_service.py:480-519` (no 330-365), un BFS con `queue.pop(0)` (O(n²)). **`_validate_graph` no recorre nada** (solo cuenta); el recorrido es `_detect_cycle` (`world_validation.py:79-104`), un DFS recursivo que daría `RecursionError` en cadenas de ~1000 nodos. `world_validation` está documentado como **puro, sin BD** | B | Solo se aplica a `get_progress_map` (generador BFS con `deque`). **No** se unifica con `_detect_cycle`: arreglar la recursión es un cambio de comportamiento. Test previo del orden BFS y de nodos huérfanos. Valor didáctico bajo: se declara así |
| **P-11** Strategy de finales | **Pasa a opcional** | `compute_ending` es 287-346 y **se aplica a cualquier caso**: no filtra por código. Hoy existe un solo caso (el del PDF). Para cualquier otro caso los flags están vacíos y por la regla `not riesgo_feminicidio_valorado` cae siempre en "Riesgo Persistente" | **A** (y especulativo) | Con un solo caso, el Strategy sería código para un futuro hipotético. Solo se hace si el equipo prefiere tenerlo como demostración de OCP, y antes hay que decidir qué final tienen los demás casos |
| **P-12** State | **Se mantiene, más liviano** | Estados en `models/attempt.py:15-25`; **los servicios nunca usan `AttemptStatus`, comparan strings** en ~30 sitios de 5 archivos (`game_service`, `world_service`, `game_dtos`, `case_effects`, `reportes/services`). Transiciones reales: nuevo→IN_PROGRESS (186), IN_PROGRESS→COMPLETED (401), IN_PROGRESS→PAUSED (455), PAUSED→IN_PROGRESS (474), IN_PROGRESS/PAUSED→REPLACED (145). `SAFE_EXITED` nadie lo escribe. **Las transiciones inválidas no tienen test** | **M** | Primero A-03 (usar `AttemptStatus`); después una **tabla de transiciones** con clases de estado pequeñas. La revisión recomienda no mezclar reglas de `reportes` y de DTO dentro del State |
| **P-13** Observer | **Pasa a opcional** | `choose_decision` 331-415 con `@transaction.atomic`; `record_case_completion` se llama **dentro** de la transacción (línea 411). **El plan v1 se equivocó:** el import tardío **no** evita un ciclo (`progression/services.py` solo importa `progression.models`). Hay **un solo observador**. Un Observer con `on_commit` o asíncrono cambiaría la semántica (hoy un rollback deshace también el registro); el `get_or_create` depende de un savepoint | **A** | Solo con señal **síncrona** de Django y preservando el savepoint. Valor didáctico razonable pero con un único suscriptor es forzado: decisión del equipo |
| **A-01** Duplicados | **Se reduce** | `shared/jsonutils.py` **ya** tiene `read_map`, `read_string_list`, `coerce_int`. Quedan: `game_dtos.read_string_list` (21), `instructor_service._read_map` (35) y `game_views._int` (31, **sin ningún uso**). Las tres `_clamp` son idénticas (llamadores posicionales). **`_save_event` NO es duplicado idéntico:** la de `world_service` fija `node=current_node` y omite decisión y deltas. La IP del cliente difiere sutilmente (`.strip()` y rol por defecto `STUDENT` vs `SYSTEM`) | B | Unificar `_clamp` y los 3 lectores JSON; borrar `_int`. **No** tocar `_save_event` ni la IP sin test |
| **A-04** `GoogleLoginView` | **Se mantiene con cuidado** | `users/views.py:91-125`; el `except Exception` (112-117) envuelve solo la consulta de usuario. Quitarlo cambia un 401 por un 500. Los tests parchean `apps.users.views.verify_google_credential` | **M** | Test previo (usuario inactivo, credencial inválida, correo vacío). Es un cambio de comportamiento deliberado y se documenta |
| **A-06** Contraseña por defecto | **Cambia el contrato** | `grupos/services.py:31`, usada en 254, 357, 382; el frontend la muestra desde la API; **dos asserts** de `test_grupos.py` (168, 170) dependen del valor | **M** | Se mantiene la decisión del plan: solo extraerla a configuración; rediseño = recomendación |

### 3.2 Frontend

| ID | Veredicto | Lo que se encontró | Riesgo real | Ajuste |
|---|---|---|---|---|
| **P-05** Facade / ISP | **Cambia de forma** | `SimulationService` tiene 50 métodos: 21 de jugador, 4 de instructor, 21 de autoría, 4 de editor de mundo. **Una fachada que solo delega no aporta nada** mientras los componentes sigan inyectando el servicio completo. Los métodos casi no se cruzan entre roles (solo `listCases`, `recentAttempts`, `attemptHistory`). Consumidores de autoría: solo `case-editor`, `case-authoring-hub`, el store del editor y `world-preview`. 17 specs mockean `SimulationService` con `useValue` parcial. **Ningún contract-spec lee `simulation.service.ts`.** Sin uso en producción: `getAttempt`, `getCompletionReport`, `deleteDecision`. Cobertura: ~43 de 50 métodos sin test | B (fachada) / **M** (migrar consumidores y specs) | Extraer **`AuthoringApi`** (25 métodos, 4 consumidores) e **`InstructorApi`** (4 métodos, 1 consumidor); lo del jugador se queda. `SimulationService` se conserva como fachada hasta migrar. Antes, un `it.each` sobre los 50 métodos (verbo, URL, cuerpo, cabeceras) con `HttpTestingController` |
| **P-06** Proxy de caché | **Se mantiene, acotado** | `getCatalog` tiene **un solo llamador** (`game-menu.component.ts:392`); `listCases` tiene 5 (`rubrics`, `dashboard` ×2, `grupo-list`, `reporte-grupo`, `simulation-catalog`). El catálogo es **por usuario** (`unlocked`, `completed`), y el servicio es `providedIn: 'root'`: la caché debe vaciarse en `clearSession`/`saveSession`. Invalidan: `publishCase`, `cloneCaseVersion`, `asignarCaso`/`quitarCaso` (otro servicio: `GrupoService`), importación de grupos y completar un caso. **Los e2e usan `page.goto` y recargan la SPA, así que no detectarían datos obsoletos en navegación interna** | **M** | Proxy solo sobre `listCases` (donde hay beneficio real) con invalidación en publicar/clonar/login/logout; no guardar errores; compartir la petición en vuelo. Test previo: segunda llamada sin HTTP, refetch tras invalidar, error no cacheado, aislamiento entre usuarios |
| **P-07** Composite / Command | **El plan v1 se equivocó; se reformula** | `applyScenePreset` (934-939) **ya es un único comando** (`SetMapFieldsCommand`): no necesita Macro. Hallazgos reales: **`updateZoneLabel`** (~1020-1038) ejecuta un `ResizeZoneCommand` vacío y luego hace `store.editorState.set(...)` directo → la edición de etiqueta **no es deshacible** y ensucia la pila; **`deleteSelected`** (1041-1050) borra el objeto pero deja huérfano su diálogo. Las pilas (`store` 304-307, 413-449) no tienen tope. `world-editor.store.spec.ts` (5 tests) **no cubre `execute/undo/redo`** ni 11 de los 13 comandos | B / **M** | P-07 pasa a: `MacroCommand` "borrar objeto + su diálogo", `SetZoneLabelCommand` (deshacible) y tope a la pila. Primero tests del store con TestBed y `fakeTimers`. **Posible bug latente (por verificar, fuera de alcance):** `load()` cambia `nodeId` al instante pero un guardado pendiente por el debounce de 1500 ms usaría el `nodeId` nuevo con el estado de la sala anterior |
| **P-08** Chain (interceptor) | **Se mantiene** | `jwt.interceptor.ts` (60 líneas): los bloques 401 (30-37) y 403 sobre `/api/auth/me` (39-46) son idénticos salvo la condición; el mensaje de conexión está duplicado (22 y 54). **No existe spec del interceptor.** `api-error.util.ts:4` define `HANDLED_BY_INTERCEPTOR = {0, 401, 403}` y los componentes dependen de ese contrato. **Cualquier 401 limpia la sesión**, incluso en endpoints con `X-SIEP-Attempt-Token` (hay que confirmar con el backend si responde 401 por token de intento inválido) | **M** | Spec con `HttpTestingController` antes de tocar (8 casos: cabecera, login, 401 con/sin `/login`, 403 en `/me`, 403 normal, status 0, error no HTTP). Partir en 2–3 interceptores conservando el contrato de `HANDLED_BY_INTERCEPTOR` |
| **P-10** Strategy (movimiento NPC) | **Se mantiene** | `nextNpcTarget` 1490-1508 y `nextAmbientTarget` 2416-2426; `NpcMotionBehavior` está en `core/models/simulation.model.ts:766-772` (no en `game-world`). **Nadie testea** `nextNpcTarget`, `nextAmbientTarget` ni `updateNpcMovers`. `nextAmbientTarget` incrementa `patrolIdx` **antes** de elegir: la primera patrulla ambiental empieza en el punto 1 y salta el 0 (posible bug existente). Hay **dos sistemas paralelos** (`NpcConfig.motion` con 6 comportamientos y `WorldObject.movementPattern` con 3); unificarlos cambia comportamiento. **10 contract-specs leen `game-world.component.ts`** con regex ancladas (`orientation.contract` 53-80; `frame-budget` exige exactamente 2 `this.children.removeAll(true)`; `game-feel` depende de indentación de 6 espacios) | **M** | Las estrategias van en un **archivo nuevo** y en `game-world.component.ts` solo se cambia el cuerpo de las dos funciones, sin mover métodos. Se conservan los campos `npcMovers`/`ambientMovers` (los usa `game-world.interaction.spec.ts`). Test previo con el arnés de ese spec; decidir qué se hace con `patrolIdx` |
| **P-14** Template Method (entornos) | **Se retira; el plan v1 se equivocó** | `renderHospitalEnvironment` (1742-1814) es **código muerto**: `HOSPITAL_MAP_KEY` es `'urgencias-crisis'`, que está en `AUTHORED_CLINICAL_ROOM_KEYS`, así que `renderWorld` retorna en la línea 1023 antes de llegar a él (lo confirma `scene-renderer.registry.spec.ts`). `renderComisariaEnvironment` (1816-1890) solo corre como **fallback** si falla la carga del JSON del escenario. Las dos diferían solo en datos | B | Un Template Method sobre código muerto o de fallback no aporta. El hospital se borra (A-02). **Template Method queda sin candidato verificado:** hay que buscar otro. Hipótesis **no verificada:** los renderers `premium-clinical-room` (649 líneas) y `case-pdf-rooms` (664) comparten esqueleto |
| **A-02** Código muerto | **Se amplía** | `audio.service.ts` (2 líneas): 0 importadores en `src/` y `e2e/`. Además: `renderHospitalEnvironment`, `_parse_csv_rows`, `game_views._int`, `SimulationService.getAttempt/getCompletionReport/deleteDecision`, y `actor-render-plan.util.ts` y `clinical-emotion-portrait.util.ts` (solo los importa un spec) | B | Verificar cada borrado con `ng build`/`ng test` (Vitest ya type-checkea los specs: el fallo `jest` en `journal-panel.spec` lo demostró) |
| **A-03** Números mágicos | **Se mantiene, con una trampa** | 13 literales de `setTimeout` en `simulation-play.component.ts` (2500, 4500, 400, 550, 700, 340, 80, 2200, 4200, 3000, 50…). `4200` duplica `NOTICE_MS`; `340` contradice `SCENE_FADE_MS = 320`. **Tres asserts de `simulation-play.game-feel.contract.spec.ts` fijan literales** (`}, 80);` línea 13, `const SCENE_FADE_MS = 320;` línea 19, `, 400);` línea 24) y varios specs hacen `tick(340)` | B–M | Actualizar esos asserts **antes**; la constante nueva para 340 no debe reutilizar `SCENE_FADE_MS` |

### 3.3 Cobertura: corrección del plan v1

El plan v1 decía que `rubric_service` y `crypto_service` casi no tenían tests. **Sí tienen, pero delgados:** `test_rubrics.py` (5) y `test_instructor.py` (2); `test_game.py::test_crypto_roundtrip` y la comprobación de cifrado en reposo. Faltan: `duplicate`, `set_default`, normalización de pesos, jerarquía de `rubric_for_case_version`, cifrado alterado y clave distinta. El parser XLSX solo se ejercita por HTTP y **únicamente con celdas `inlineStr`**; un Excel real usa `sharedStrings` (`t="s"`) y esa rama no tiene ningún test.

**9 `except Exception`** en 6 archivos (`grupos/services.py:395`, `progression/services.py:22`, `audit_service.py:88` y `100`, `ai_assistant.py:66`, `82`, `186`, `access_request_service.py:58`, `users/views.py:114`); solo 2 tienen alguna cobertura. Varios son deliberados (la auditoría nunca debe romper el flujo, REGLA-006).

### 3.4 Hallazgos nuevos para el informe de antipatrones (no estaban en el plan v1)

- Los servicios backend comparan `"IN_PROGRESS"`, `"PAUSED"`… como strings aunque existe `AttemptStatus` (Hard Code).
- `get_progress_map` hace `queue.pop(0)` (O(n²)) y genera N+1 por `ev.node`/`ev.decision_option` (Spaghetti/rendimiento).
- Modelo por defecto `gpt-4o-mini` enviado a Anthropic (Hard Code con efecto real).
- Docstring de `enter_room` desactualizado respecto del código (Lava Flow en documentación).
- Clones que omiten `weight`, `active`, `world_schema_version` y el checklist; dos implementaciones divergentes de duplicar rúbricas (Cut & Paste con deriva).
- `updateZoneLabel` se salta el patrón Command que el propio editor define.
- 55 archivos de test leen el código fuente como texto (`readFileSync`): fijan la forma del código, no el comportamiento.
- Código "de producción" que solo usa un spec: `actor-render-plan.util.ts`, `clinical-emotion-portrait.util.ts`.

---

## 4. Catálogo v2 (lo que realmente se propone ahora)

**Núcleo — Fase 1 (hasta el 18 de octubre, sustentación del 20):**

| ID | Patrón | Riesgo | Test previo |
|---|---|---|---|
| P-01 | Strategy + Adapter + Factory Method (proveedor de IA) | M | Sí |
| P-04 | Builder (reporte de finalización) | M | Sí |
| P-08a | Chain of Responsibility (puertas, backend) | M | Sí |
| P-08b | Chain of Responsibility (interceptores HTTP, frontend) | M | Sí |
| P-05 | Facade / ISP: `AuthoringApi` e `InstructorApi` | B–M | Sí (`it.each` de 50 métodos) |
| P-06 | Proxy de caché (`listCases`) | M | Sí |
| P-07 | Composite (`MacroCommand`) + Command (`SetZoneLabelCommand`) | B–M | Sí (store sin tests) |
| P-09 | Iterator (`get_progress_map`) | B | Sí |
| A-01, A-02 | Limpieza de duplicados y código muerto | B | No (verificar con build) |

**Fase 2 (hasta el 11 de noviembre):** P-10 Strategy (movimiento NPC, M), P-12 State (tabla de transiciones, M), P-03 Prototype (declarativo, A, solo tras test de clon completo), A-03, A-04, A-06, y un **candidato nuevo de Template Method por verificar**.

**Opcionales (demostración o riesgo alto):** P-11 Strategy de finales, P-13 Observer, P-15 a P-20 del plan v1.

**Retirados:** P-02 (no hay CSV; Factory especulativo), P-14 (código muerto), P-08 de filas de importación (cambia contrato), P-09 sobre `_detect_cycle` (cambia comportamiento).

**Efecto sobre la sustentación 1:** quedan cubiertos Factory Method, Adapter, Builder, Chain, Facade, Proxy, Composite, Iterator y Command. **Prototype se mueve a la sustentación 2** (o se adelanta solo si el test de clon completo queda listo antes del 15 de octubre).

---

## 5. Estado de los bloqueos

1. ~~Línea base verde~~ → **resuelta** en §2 (local); falta la confirmación oficial del CI de GitHub (acción tuya: empujar y abrir PR draft).
2. ~~Autoría Git~~ → **resuelta**: commits a nombre de Sua.
3. ~~Fin de línea~~ → **resuelta**: artefacto de la VM; no se toca `.gitattributes`.
4. ~~Aprobar catálogo v2~~ → **aprobado** (§4).

## 6. Pruebas de caracterización (hecho el 5 oct)

Siete commits en `adsi/integracion` (ver `docs/diseñosistemas_docs/CAMBIOS_ADSI.md`): backend 307 → **408** pasan; frontend 1809 → **1973** pasan (153 archivos). Cubren P-01, P-04, P-05, P-07, P-08a, P-08b y P-09. Cada archivo se validó rompiendo el código a propósito.

- **P-06 (Proxy de caché) no tiene prueba previa a propósito:** hoy `listCases` no se cachea, así que cualquier prueba «previa» describiría justo lo que el cambio va a modificar. Sus pruebas (segunda llamada sin HTTP, refetch tras invalidar, error no cacheado, aislamiento entre usuarios) se escriben junto con la implementación, antes del código (TDD).
- **Hallazgos nuevos que las pruebas dejaron documentados** (comportamiento actual, no corregido): el autoguardado del editor de mundo muere tras un error de guardado; un guardado pendiente tras recargar otro nodo se envía con el estado de la sala anterior; la etiqueta de zona no es deshacible; borrar un objeto deja huérfano su diálogo; deshacer un borrado repone el elemento al final de la lista.
- Los números de línea citados en §3 siguen siendo del baseline anterior; se reverifican al tocar cada cambio.

## 7. Lo que sigue

- Tú: abrir el PR draft `adsi/integracion` → `master` para obtener el CI oficial.
- Fase 1 (meta 18 oct): P-01, P-04, P-08a, P-08b, P-05, P-06, P-07, P-09, A-01, A-02, una rama por cambio desde `adsi/integracion`, registro en `CAMBIOS_ADSI.md`.
- Herramienta de evidencia (capturas antes/después) y plantilla IEEE del Word, fuera del repo.
- Reparto por integrante sobre el catálogo v2.

---

## 8. Actualización del 9 de octubre de 2026 (`master` en `dd4eb89`)

**Qué pasó:** desde la línea base (`f39ab96`) `master` avanzó **78 commits** (845 archivos, 545 de ellos *assets*): personajes unificados (kit, avatar v2, retratos), escala del mundo a 39 px/m, zoom entero y `.gitattributes` con fin de línea LF. **El backend no cambió.** `adsi-baseline` se conserva; se añade el tag **`adsi-baseline-2` = `dd4eb89`** como «antes» de todo cambio que toque archivos modificados por esa tanda (`game-world.component.ts`, `case-pdf-rooms.renderer.ts`, `world-editor.component.ts`, `simulation.model.ts`).

**Medición (mismo entorno de Fase 0, con mis pruebas añadidas sobre `master`):**

| Verificación | Resultado |
|---|---|
| Backend `pytest` | 408 pasan |
| Frontend `ng test` | **2094 pasan en 167 archivos** (incluye mis 164 de caracterización, sin tocarlas) |
| `test:visual-assets`, `test:kit`, `kit:check`, `test:world-art` | OK |
| `ng build` | OK |

La confirmación oficial sigue siendo la del CI de GitHub sobre el PR.

**Efecto sobre el catálogo v2 (releído contra el código nuevo):**

| Cambio | Estado | Qué cambió |
|---|---|---|
| P-01, P-04, P-08a, P-09, A-01 (backend) | **Vigentes, sin cambios** | Backend idéntico; sus pruebas pasan |
| P-05 Facade | Vigente | `simulation.service.ts` no cambió (el contrato de 50 métodos sigue en verde); solo cambió `simulation.model.ts` |
| P-06, P-08b | Vigentes | Archivos sin cambios |
| P-07 Command/Composite | Vigente | `world-editor.store.ts` sin cambios. El componente reescribió el inspector de NPC con el kit (`setNpcRecipe`, `setNpcCustom`), que ya pasa por `UpdateInspectorCommand`; mis specs siguen en verde y los 5 hallazgos del store siguen siendo ciertos |
| **P-10 Strategy (NPC)** | Vigente, **más riesgo** | `game-world.component.ts` pasó de 3191 a 2928 líneas: `updateNpcMovers` 1276, `nextNpcTarget` 1337, `nextAmbientTarget` 2139 (`patrolIdx` sigue incrementándose antes de elegir). `character-motion.util.ts` lo borró `master`. Ahora **13** contract-specs leen ese archivo (antes 10): `touch`, `world-scale`, `orientation`, `render`, `interaction`, `scale`, `frame-budget`, `kit`, `game-feel`, `loading`, `scene-renderer.registry`, `keyboard-capture`, `contrast` |
| **A-02 Código muerto** | Se **reduce** | `actor-render-plan.util.ts` y `clinical-emotion-portrait.util.ts` ya los eliminó `master`. Siguen: `audio.service.ts` (0 importadores), `getAttempt`/`getCompletionReport`/`deleteDecision` (0 usos fuera del servicio y de specs), `_parse_csv_rows`, `game_views._int` y `renderHospitalEnvironment` (sigue inalcanzable: `resolveSceneRenderer` retorna antes, línea ~887) |
| **A-03 Números mágicos** | Vigente, **otros literales** | Quedan `400`, `4500`, `550`, `700`, `340`, `50` en `simulation-play.component.ts`; el literal `80` ya no está. Los asserts de `simulation-play.game-feel.contract.spec.ts` ahora fijan `SCENE_FADE_MS = 320` (línea 19) y el `400` (línea 24) |
| P-12, P-03, A-04, A-06 (backend) | Vigentes | Sin cambios |
| **Template Method** | **Candidato verificado** | `case-pdf-rooms.renderer.ts`, líneas 522–621: `renderUrgencias`, `renderSalaEscucha`, `renderRecepcion` y `renderConsultorio` repiten el mismo esqueleto (paleta → `paintShell` → pared → mobiliario → `paintLighting` → metadatos) y solo difieren en los pasos intermedios. `premium-clinical-room` **no** es candidato (una sola sala, sin variantes). Ya existen `case-pdf-rooms.spec.ts` y `case-pdf-rooms.furniture.spec.ts` como red de seguridad |
| Hallazgo nuevo (antipatrón) | A documentar | `rectC`, `frameC` y `ellipseC` están **copiadas idénticas** en `premium-clinical-room.renderer.ts` y `case-pdf-rooms.renderer.ts`; `contactShadow` difiere. Es duplicado (A-01 del frontend) y conviene resolverlo junto con Template Method |

**Cómo se integra la rama:** `adsi/integracion` (base `f39ab96`) recibe un *merge* de `master` (sin rebase ni *force-push*; `origin/adsi/integracion` sigue en `c490c95`, así que el siguiente push es *fast-forward*). El spec de `journal-panel` se queda con la versión de `master`, que ya corrigió `jest.fn()`.

## 9. Lo que sigue (reemplaza §7)

- Tú: `git push origin adsi/integracion adsi-baseline-2` y abrir el PR *draft* hacia `master` para el CI oficial.
- Orden propuesto de Fase 1, de menor a mayor riesgo y con las pruebas ya listas: **P-01** (ya con 39 tests), **P-04**, **P-08a**, **P-09**, luego frontend (**P-08b**, **P-05**, **P-06**, **P-07**) y al final A-01/A-02 (verificando cada borrado con `ng build`/`ng test`).
- Template Method + duplicados de los renderers pasa a Fase 2 junto con P-10.
- Herramienta de evidencia (capturas antes/después) y plantilla IEEE del Word, fuera del repo.
- Reparto por integrante sobre el catálogo v2.

---

## 10. Actualización del 10 de octubre de 2026 (punta de la pila: `adsi/a05c-editor-e2e`)

**Estado del catálogo v2 (§4).** Fase 1 completa (PR #24–#30, #32–#34). Fase 2 completa (#35–#44), más el Facade
del backend que quedaba como decisión (**P-05b**, #45). Se sumaron ocho cambios que el plan anunciaba, que las
pruebas dejaron como «decisión del equipo» o que aparecieron al cerrarlos. Cada uno va en su rama y su PR; la pila es
lineal, así que para descartar uno que no sea el último **antes de fusionar** hay que reconstruir las ramas siguientes
sobre la anterior (con ramas nuevas, sin *force-push*), y **después de fusionar** basta `git revert -m 1`:

| PR | Cambio | Por qué existe | Cambia comportamiento |
|---|---|---|---|
| #46 | **A-05** — el guardado del mundo persiste borrados y zonas | P-07 lo dejó anotado; al medirlo apareció que un objeto nuevo podía llevarse el de otra sala | **Sí** |
| #47 | **A-07** — los olvidos del clon (peso/estado de criterios, versión de rúbrica, esquema de mundo) | P-03 los dejó fijados con una prueba | **Sí** (solo clones nuevos) |
| #48 | **P-13** — Observer: «un intento se completó» | el plan v1 lo asignaba a la sustentación 2; Fase 0 lo dejó opcional | No |
| #49 | **L-01** — contratos de Liskov por registro | el «test de contrato para LSP» del plan v1 (§5.2) | No (solo pruebas) |
| #51 | **A-08** — tres imports sin uso y una copia exacta | los dos hallazgos menores que P-05b y A-01 dejaron anotados | No |
| #52 | **A-05b** — el editor adopta los ids reales tras guardar | sin esto A-05 deja filas que cambian de id en cada autoguardado | **Sí** (acotado, frontend) |
| #53 | **A-09** — un temporizador sin dueño hacía fallar el CI | el job de frontend de #51 (que no toca el frontend) falló 1 de 7 veces | No |
| #54 | **A-05c** — el editor de mundo, probado en el navegador contra la base real | A-05 y A-05b no tenían prueba del flujo real; midió que el código original (también `master`) quitaba objetos a la versión publicada del caso demo (41 → 38) | No (solo una prueba e2e) |

El PR #50 es esta documentación (informe, patrones, evidencia de Git); no cambia código.

**Opcionales (§4).** P-13 hecho. **P-11 y P-15 a P-20 no se hicieron**: riesgo alto, sin red de seguridad suficiente o
una decisión de producto de por medio (razones en `PATRONES_EXISTENTES_Y_DESCARTADOS.md`).

**Pruebas en la punta.** Backend 855 (línea base 307), frontend 2383 en 179 archivos (línea base 1809) y 35 de
extremo a extremo (34 antes de A-05c; la corrida completa local anterior a A-05c: matriz API 16/16 y Playwright 33 en
verde con 1 omitida a propósito por el propio spec).

**Lo que sigue (decisión del equipo):**

1. Revisar y fusionar la pila en orden, con *merge commit*; para descartar A-05, A-05b, A-07 o P-13 después de
   fusionar, `git revert -m 1 <commit de la fusión>` (sin *force-push*). A-05b completa a A-05 en el editor: si se
   descarta A-05b y se conserva A-05, cada autoguardado de un objeto nuevo lo recrea con otro id (sin duplicados).
2. Reparto de la autoría en Git entre los cuatro integrantes (hoy toda la historia está a nombre de una persona).
3. El informe Word (plantilla IEEE) a partir de esta carpeta.
