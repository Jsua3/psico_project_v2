# Plan de aplicación — Análisis y Diseño de Sistemas sobre SIEP (psico_project_v3)

**Estado:** PLAN v1 (4 de octubre de 2026). **Parcialmente superado por `FASE0_EVALUACION.md` (5 de octubre): al verificar el código, varios cambios del catálogo de §4 se retiraron, se reformularon o cambiaron de riesgo (P-02, P-03, P-05, P-07, P-09, P-11, P-13, P-14) y CF-1 desapareció. Para el catálogo vigente, ver §4 de ese documento.** No se ha modificado ni una línea del proyecto.
**Equipo:** Juan José Sua Gómez, Emerson Ángel Gómez, Santiago Leyton, Esteban Bonilla.
**Asignatura:** Análisis y Diseño de Sistemas II, 2026-2 (docente Diana María Valencia R.).
**Decisiones ya tomadas por el equipo:** no hay rúbrica escrita del proyecto ("aplicar lo visto"); se aplican patrones **solo donde aporten, con justificación**; el "antes" se conserva con un tag de Git; la evidencia final es un Word con capturas antes/después más este `.md` como bitácora.

---

## 1. Qué se va a lograr (y qué NO)

**Objetivo.** Rediseñar partes de SIEP aplicando los temas del curso (patrones GoF, antipatrones, SOLID, Git), de modo que cada cambio pueda mostrarse a la profesora con: el problema real en el código, el patrón elegido y por qué, el "antes" y el "después", y la prueba de que el comportamiento no cambió.

**Principio rector (viene del propio curso).** La Unidad 5 pide *"identificar patrones implementados y decidir si se utilizan sus ventajas"*, y la Unidad 4 trata la sobreingeniería como antipatrón (Poltergeists, Golden Hammer). Por eso **no se fuerzan los 23 patrones**: los que no encajan se documentan como "evaluado y descartado, por qué". Eso también cuenta como análisis.

**No es objetivo:** cambiar lo que ve o vive el estudiante en el simulador. Todo es refactorización con comportamiento idéntico, salvo los dos puntos marcados como *cambio funcional* (§6).

---

## 2. Qué dice el material del curso (base de la justificación)

Fuente: carpeta `documentos_material/Material Analisis y Diseño` y el plan de trabajo 2026-2.

| Unidad | Contenido | Qué piden las guías/laboratorios (criterio de calidad que usaremos) |
|---|---|---|
| 1–2 | Creacionales: Abstract Factory, Builder, Factory Method, Prototype, Singleton. Estructurales: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy | Problema → patrón justificado, código ejecutable, ventajas/desventajas, diagrama de clases |
| 3 | Comportamiento: Chain of Responsibility, Command, Interpreter, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor | Laboratorios RideApp y Granja Inteligente: patrones integrados en un flujo, **UML**, evidencia de ejecución, **ramas independientes por patrón**, sustentación. Rúbricas de esos labs: creacionales ~20 %, comportamentales 20–25 %, integración 20–30 %, UML/documentación 15 %, sustentación 15 % |
| 4 | Antipatrones de código (Lava Flow, God Object, Golden Hammer, Spaghetti, Fantasmas, Blob, Poltergeists, Cut & Paste, Input Kludge, Sequential Coupling, Heroic Naming, Boat Anchor, Hard Code, Exception Handling, Packratting) y de gestión | Actividad de Refactorización (rúbrica 30/35/20/15): identificar antipatrones, refactorizar, buenas prácticas, informe con **evidencias antes y después** |
| 5 | Análisis de patrones: identificar los implementados y decidir si se aprovechan; cuándo aparecen antipatrones | Lab Cafetería: ≥5 patrones clasificados y justificados, diagrama de clases, captura de consola |
| 6 | SOLID (SRP, OCP, LSP, ISP, DIP) | Cada principio con violación y corrección; ejercicios versionados en Git/GitHub |
| 7 | Git: remotos, merge, ramas, **Git Flow y GitHub Flow** (el curso no ve trunk-based) | Repositorio con ramas por feature y Pull Requests revisados entre compañeros |

**Inconsistencias del material que no debemos copiar al informe:** el *Resumen* clasifica Singleton como estructural (es creacional); la exposición de Interpreter lo llama estructural (es de comportamiento); una guía describe God Object como "alta cohesión y bajo acoplamiento" (es lo contrario); Template Method solo aparece en el *Resumen*, sin guía ni código, así que su base será Gamma et al. (1995). En el informe usaremos la clasificación de las guías y de Gamma.

**Fechas (plan de trabajo 2026-2).** El PDF trae dos tablas con fechas que no coinciden del todo; usamos la tabla detallada (cronograma propuesto) y hay que confirmarla con la profesora:

| Hito | Fecha |
|---|---|
| Examen Parcial 1 / Sustentación avance de proyecto 1 | 19 y 20 de octubre |
| Examen Parcial 2 / Sustentación avance 2 | 10 y 12 de noviembre |
| Examen Parcial 3 / Sustentación avance 3 | 1 y 3 de diciembre |
| Refactorización final / Sustentación final | 7 y 10 de diciembre |

---

## 3. Estado actual de SIEP (diagnóstico resumido)

Monorepo: backend Django 5.1 + DRF (~16 100 líneas sin tests ni migraciones), frontend Angular 21 con Signals, Phaser 3 (juego) y Konva (editor), ~34 000 líneas TS. Suite: ~249 tests pytest, 148 specs jest y 9 e2e Playwright. Hay CI.

**Lo que ya está bien (no se toca, se documenta como patrón existente en la Unidad 5):**

| Patrón existente | Dónde |
|---|---|
| Command con undo/redo (13 comandos) | `world-editor.store.ts` |
| Strategy + registro | `scene-renderer.registry.ts` (renderers de sala) |
| Decorator | `@auditable` en `audit_service.py` aplicado en `game_service.py` |
| Observer | Signals y RxJS (autoguardado del editor) |
| Singleton | Servicios `providedIn: 'root'`; `settings` de Django |
| Adapter | `WorldCallbacks` Phaser→Angular; `SimulationService` desempaqueta `ApiResponse`; `crypto_service` |
| Facade | Módulos `*_service.py` |

**Antipatrones y violaciones con evidencia verificada** (tamaños y duplicados comprobados por lectura del código el 4/oct):

- God Object / Blob: `authoring_service.py` 1362 líneas; `grupos/services.py` 601; `game_service.py` 528; en frontend la escena `DataDrivenWorldScene` (~2745 líneas, ~120 métodos), `SimulationPlayComponent` (~1830 líneas de clase) y `SimulationService` (369 líneas, ~50 métodos para cuatro roles).
- Cut & Paste: `_clamp` definida 3 veces (`case_effects.py:209`, `decision_effects.py:19`, `world_service.py:43`); `_save_event` 2 veces con firmas distintas; diez `_clone_*` casi idénticos; `renderHospitalEnvironment` y `renderComisariaEnvironment` casi iguales; bloque de sesión inválida duplicado en `jwt.interceptor.ts`.
- Lava Flow / Boat Anchor: `_parse_csv_rows` (`grupos/services.py:127`) sin ningún uso; `audio.service.ts` es un reexport de 2 líneas; ramas "legacy Kenney" en la escena.
- Hard Code: `DEFAULT_IMPORTED_STUDENT_PASSWORD = "Siep2026!"` (`grupos/services.py:31`); números mágicos en `decision_effects.py` y en el render de la escena; claves de mapa como strings (`'hospital-urgencias'`) en 20+ archivos.
- Exception Handling: 9 `except Exception`; el más dañino es `GoogleLoginView`, que convierte un fallo de base de datos en error de Google.
- OCP roto: `compute_ending` y `OPTION_EFFECTS` atados a un caso concreto dentro del motor "genérico"; `isHospitalMap/isComisariaMap` repetidos.

**Reglas del propio proyecto que ningún cambio puede romper** (de `PLAN_MAESTRO_TOTAL.md`): no crear migraciones Django (modelos `managed=False`, REGLA-002); la salida segura siempre alcanzable (REGLA-004); las versiones PUBLISHED no se mutan (REGLA-005); la auditoría nunca interrumpe una operación (REGLA-006); repositorio privado (REGLA-007).

---

## 4. Catálogo de cambios propuestos

Cada cambio tiene ID, rama, patrón, problema, solución, riesgo y cómo se prueba. Riesgo: **B** bajo, **M** medio, **A** alto. "Pruebas" = red de seguridad que ya existe.

### 4.1 Núcleo (se hacen sí o sí) — 14 cambios

| ID | Patrón(es) | Dónde | Problema hoy (evidencia) | Cambio | Riesgo | Pruebas existentes |
|---|---|---|---|---|---|---|
| **P-01** | **Strategy + Adapter + Factory Method** | Backend: `simulation/views/ai_assistant.py` (`_call_llm`, `_call_openai`, `_call_anthropic`) | Una vista que valida, arma el prompt, llama por HTTP, parsea y audita; un `if provider == ...` y dos métodos casi gemelos | Interfaz `LLMProvider.complete()`; `OpenAIProvider` y `AnthropicProvider` adaptan cada API al contrato; `create_provider(name)` elige. La vista queda solo con validación y auditoría | B | `test_ai_assistant.py` (11) |
| **P-02** | **Factory Method** (+ Strategy por extensión) | Backend: `grupos/services.py` `_parse_student_import` | Solo acepta `.xlsx` con un parser a mano; `_parse_csv_rows` existe pero está muerto | `RowParser` con `XlsxParser` y `CsvParser`; fábrica por extensión. **Ver cambio funcional CF-1 (§6)** | B–M | `test_grupos.py` (25) |
| **P-03** | **Prototype** (+ elimina Cut & Paste) | Backend: `authoring_service.py` `clone_version` y los diez `_clone_*` | Diez bucles que copian campo por campo con `objects.create` | `clone_instances(queryset, overrides)` genérico; cada entidad declara sus campos clonables. Respeta REGLA-005 | B–M | `test_authoring.py` (20) |
| **P-04** | **Builder** | Backend: `serializers/game_dtos.py` `build_completion_report` (~100 líneas) | Una función cuenta eventos, deriva competencias, recomendaciones y resumen; además hace consultas ORM dentro de un "serializer" | `CompletionReportBuilder` con pasos (`count_events`, `derive_competencies`, `derive_recommendations`, `build`); las 4 reglas de competencias pasan a lista de reglas | B–M | `test_game.py` (24), `test_caso_pdf.py` (19) |
| **P-05** | **Facade** (+ SRP/ISP) | Frontend: `SimulationService`; Backend: `authoring_service.py` | Un servicio de 50 métodos para jugador, instructor, autor y editor; un módulo de 1362 líneas | Frontend: `PlaySimulationApi`, `AuthoringApi`, `TraceApi`, `WorldEditorApi` (el actual queda como fachada delgada que delega, para no romper imports). Backend: paquete `authoring/` (nodos, decisiones, mundo, publicación, clonado) con `authoring_service.py` como fachada | M | `simulation.service.spec.ts`, `test_authoring.py` |
| **P-06** | **Proxy** (caché) | Frontend: `SimulationService.getCatalog` / `listCases` | Cada pantalla vuelve a pedir el mismo catálogo | `CatalogProxy` con `shareReplay` e invalidación al publicar/clonar | B | `simulation.service.catalog.spec.ts` |
| **P-07** | **Composite** (sobre Command) | Frontend: `world-editor.store.ts` | Aplicar un preset de escena ejecuta comandos sueltos; deshacerlo exige varios Ctrl+Z; la pila de undo no tiene tope | `MacroCommand` que implementa `EditorCommand` y contiene hijos; tope a la pila | B | `world-editor.store.spec.ts` |
| **P-08** | **Chain of Responsibility** | Backend: `world_service._validate_door` (~líneas 433-466) y `grupos._validate_import_rows`; Frontend: `jwt.interceptor.ts` | Cascadas de `if ... raise` con el mismo mensaje; interceptor que hace 4 cosas | Lista de `DoorRequirement` (inspección, herramientas, nodos, NPCs) y de reglas de fila. Frontend: `authTokenInterceptor` + `errorHandlingInterceptor` encadenados con `invalidateSession()` común | B | `test_world_authority.py` (26), `test_grupos.py` |
| **P-09** | **Iterator** | Backend: `game_service.get_progress_map` (BFS manual, ~84 líneas) y `world_validation._validate_graph` | Dos recorridos del mismo grafo | Generador `iter_reachable_nodes()` en un módulo de grafo compartido | B | `test_game.py`, `test_world_validation` |
| **P-10** | **Strategy** (movimiento) | Frontend: `game-world.component.ts` `nextNpcTarget` y `nextAmbientTarget` | Dos jerarquías paralelas (`NpcMotionBehavior` y `MovementPattern`) con `if` por tipo | `MovementStrategy.next(ctx)` con Wander, Patrol, Avoidant e Idle; mapa tipo→estrategia. Los helpers puros ya existen en `scene-motion.util.ts` | B | `scene-motion.util.spec.ts` |
| **P-11** | **Strategy** (finales del caso) | Backend: `case_effects.py` `compute_ending` y `OPTION_EFFECTS` | El motor "genérico" depende de un caso concreto (flags del caso PDF) → viola OCP | `EndingStrategy` registrada por `case_code`; la del caso PDF es la primera implementación | M | `test_caso_pdf.py`, `test_game.py` |
| **P-12** | **State** (backend) + **Decorator** | Backend: `game_service.py`, `world_service._require_in_progress`, `game_dtos.py` | `if attempt.status != "IN_PROGRESS"` repetido en `choose_decision`, `save_reflection`, `safe_exit`, `resume_attempt`; transiciones permitidas repartidas | Clases de estado (`InProgress`, `Paused`, `Completed`, `Replaced`, `SafeExited`) con `can_decide()`, `can_resume()`…; decorador `@requires_status(...)` junto al `@auditable` existente. **REGLA-004 queda como transición explícita** | M | `test_safe_pause.py`, `test_upgrade_attempt_replaced.py`, `test_reemplazo_vs_salida_segura.py` |
| **P-13** | **Observer** | Backend: `game_service.choose_decision` (~líneas 398-412) | Al completar un intento llama en línea a `record_case_completion` con import tardío para evitar ciclos | Señal `attempt_completed` (`django.dispatch.Signal`); progresión y bloqueo de reflexiones se suscriben. Cuidar `transaction.atomic` | M | `test_completion_hook.py` |
| **P-14** | **Template Method** | Frontend: `renderHospitalEnvironment` / `renderComisariaEnvironment` y `renderWorld` | Dos funciones casi idénticas (zonas, líneas, rótulos, sprites) con distinta data | Esqueleto fijo `fondo → zonas → rótulos → personajes de ejemplo`; cada mapa aporta datos/ganchos | M (el render se verifica mal en jest → requiere e2e/capturas) | `premium-clinical-room.renderer.spec`, e2e `vertical-quality` |

### 4.2 Opcionales (solo si el tiempo y el riesgo lo permiten) — 6 cambios

| ID | Patrón | Dónde | Por qué es opcional |
|---|---|---|---|
| **P-15** | **State** (frontend) | `SimulationPlayComponent`: ~10 banderas booleanas (`showResumePrompt`, `showContentWarning`, `pausing`…) y cascada de `if` en `handleGlobalInteraction` | Es el cambio con más valor conceptual (REGLA-004 y ETH-01 pasan a transiciones declaradas) **y el más riesgoso**: los contract-specs leen el texto fuente y habría que reescribirlos primero |
| **P-16** | **Mediator** | Puente Phaser↔Angular (`SceneBridge` / un único `SceneViewModel` + bus de salida) | Los 12 setters del puente están duplicados en tres sitios; rompe `game-world.*.contract.spec` |
| **P-17** | **Memento** | Claves sueltas de `localStorage` (token, posición, NPC vistos, consentimientos) → `PlaySessionSnapshot` | Valor moderado; el backend ya es la fuente de verdad del intento |
| **P-18** | **Abstract Factory** | Familia por mapa (colisiones + entorno + objetivos + guía) en lugar de `isHospitalMap/isComisariaMap` en 20+ archivos | Es el único lugar donde Abstract Factory tiene sentido real (familia de productos relacionados) pero toca mucho |
| **P-19** | **Factory Method** | `createMarker` / `spawnNpcs` (escalera de `if` por tipo) → `MarkerFactory` por tipo | Mucho código visual con orden de prioridad |
| **P-20** | **Chain / Command** | `handleGlobalInteraction` (Esc: ayuda → bitácora → diálogo → pausa) y tabla `KeyBinding→Command` | Depende de P-15 |

### 4.3 Evaluados y NO aplicados (se documentan en el informe)

| Patrón | Motivo |
|---|---|
| **Singleton** | Ya existe de forma idiomática: `providedIn: 'root'` en Angular y `settings` en Django. Un Singleton manual sería ruido (y el del curso no es seguro con hilos) |
| **Bridge** | No hay dos dimensiones que varíen de forma independiente hoy |
| **Visitor** | No hay jerarquía de elementos sobre la que sumar operaciones |
| **Interpreter** | No hay un lenguaje/gramática en el dominio |
| **Flyweight** | Ya presente de forma parcial: las texturas compuestas de avatar se crean una vez por preset |
| **Abstract Factory, Mediator, Memento** | Solo en opcionales P-16/17/18; si no se hacen, se documentan como "evaluado" con la razón |

---

## 5. Antipatrones y SOLID (se hacen en paralelo a los patrones)

### 5.1 Limpieza de antipatrones (Unidad 4)

| ID | Antipatrón | Acción | Riesgo |
|---|---|---|---|
| **A-01** | Cut & Paste | Unificar `_clamp` (3), `_save_event` (2), `_read_map`/`read_string_list`/`_int` duplicados, resolución de IP duplicada → un solo módulo en `shared/` | B |
| **A-02** | Lava Flow / Boat Anchor | Borrar `_parse_csv_rows` **o** usarlo (depende de CF-1); revisar y borrar `audio.service.ts` si ningún import lo usa (verificar fuera de `src/app` también) | B |
| **A-03** | Hard Code / Magic Numbers | Constantes con nombre para `40/-20/+15` de `decision_effects.py`, `-5/+3` de `use_tool`, `50/50` iniciales, `RETENTION_DAYS`, `stress_index >= 70`, tiempos de `setTimeout` y coordenadas de render; uso de `AttemptStatus`/`UserRole` en lugar de strings | B |
| **A-04** | Exception Handling | `GoogleLoginView`: capturar solo la excepción específica de Google; el resto debe propagarse | B |
| **A-05** | Spaghetti (rubric) | `rubric_service.attempt_rubric_view` devuelve cada dato en snake_case y camelCase y repite criterios en tres estructuras: confirmar con el frontend qué consume y reducir | M |
| **A-06** | Hard Code (seguridad) | Contraseña por defecto `Siep2026!` para estudiantes importados. **Ver CF-2 (§6)** | M |

### 5.2 Mapeo SOLID (Unidad 6)

| Principio | Dónde se evidencia | Cambios que lo cubren |
|---|---|---|
| **SRP** | `authoring_service.py`, `grupos/services.py`, vista de IA, `game_dtos.py` (hace consultas y reglas) | P-01, P-04, P-05 |
| **OCP** | Finales atados a un caso; ramas por mapa | P-11, P-12, P-18 (opcional) |
| **LSP** | Todas las implementaciones de `LLMProvider`, `RowParser`, `EndingStrategy`, `MovementStrategy`, `SceneRenderer` deben ser intercambiables | Se agrega un **test parametrizado por contrato** (misma suite corre contra cada implementación) |
| **ISP** | `SimulationService` de 50 métodos para 4 roles | P-05 |
| **DIP** | La vista de IA llama a `urllib` directo; la escena crea `new Phaser.Game` | P-01 (inyección del proveedor); P-16 (opcional) |

---

## 6. Decisiones que cambian comportamiento (necesitan visto bueno antes)

- **CF-1 — Importación CSV.** El README y la plantilla descargable hablan de `.xlsx` **o** `.csv`, pero el backend solo acepta `.xlsx` (el parser CSV está sin uso). Aplicar Factory Method (P-02) **habilitaría CSV**. Es un arreglo de lo documentado, pero es un cambio funcional. Opción segura: refactorizar sin habilitarlo y dejarlo anotado.
- **CF-2 — Contraseña por defecto de estudiantes importados.** `Siep2026!` igual para todos es un riesgo de seguridad real. Arreglarlo bien (contraseña temporal aleatoria + cambio obligatorio) toca el flujo del docente y de Psicología. Opción segura: solo extraerla a configuración (`settings`/variable de entorno) en A-03 y dejar el rediseño como recomendación.

---

## 7. Cronograma ligado a las sustentaciones

Hoy es domingo 4 de octubre; el curso apenas va en la introducción. Se aplica **un poco por delante** de las clases, pero cada entrega se corta para que coincida con lo que la profesora ya habrá visto en cada sustentación.

| Fase | Fechas | Contenido | Entrega |
|---|---|---|---|
| **0. Preparación** | 5–9 oct | Tag y ramas (§8); línea base verde de tests; tests de caracterización donde falten; plantilla del Word y script de evidencia (§9); reparto del equipo | Baseline verificada |
| **1. Creacionales, estructurales y primeros de comportamiento** | 10–18 oct | P-01, P-02, P-03, P-04, P-05, P-06, P-07, P-08, P-09 + A-01, A-02 | **Sustentación 1 (20 oct)**: Factory Method, Adapter, Prototype, Builder, Facade, Proxy, Composite, Chain, Iterator (Unidad 2 + Chain/Iterator de la Unidad 3, lo visto hasta el 15 oct). Strategy se ve en clase el 26 oct; P-01 la incluye porque Adapter y Factory Method no tienen sentido sin la interfaz común, y se explica como adelanto |
| **2. Comportamiento y antipatrones** | 21 oct–11 nov | P-10, P-11, P-12, P-13, P-14 + A-03, A-04, A-05; documento de **análisis de la Unidad 5** (patrones ya existentes + descartados); opcionales P-15/P-16 si hay margen | **Sustentación 2 (12 nov)**: State, Strategy, Observer, Template Method, antipatrones antes/después |
| **3. SOLID y Git** | 12 nov–2 dic | Test de contrato para LSP; cierre de SRP/ISP/DIP; evidencia de Git Flow/GitHub Flow (ramas, PRs, historial); opcionales P-17/18/19/20 | **Sustentación 3 (3 dic)** |
| **4. Integración y cierre** | 3–10 dic | Merge a `adsi/integracion`, regresión completa (pytest + jest + e2e), informe final, ensayo de la sustentación | **Sustentación final (10 dic)** |

**Reparto propuesto (se ajusta con el equipo):**

| Integrante | Área | Cambios |
|---|---|---|
| Juan José Sua | Coordinación, integración, informe; backend de estados y finales | P-11, P-12, P-13, informe |
| Emerson Ángel Gómez | Backend creacional | P-01, P-02, P-03, P-04 |
| Santiago Leyton | Frontend de servicios y juego | P-05 (frontend), P-06, P-08 (interceptores), P-10 |
| Esteban Bonilla | Editor, render y limpieza | P-07, P-14, P-09, A-01…A-04, UML |

---

## 8. Estrategia de Git (cubre la Unidad 7 como evidencia)

1. **Línea base:** tag `adsi-baseline` sobre `master` (commit actual `92354c2`). Es el "antes" de todas las capturas.
2. **Integración:** rama `adsi/integracion` desde el tag. `master` no se toca hasta el cierre.
3. **Una rama por cambio:** `adsi/p01-strategy-ia`, `adsi/p03-prototype-clonado`, etc., siempre desde `adsi/integracion` (GitHub Flow, con Pull Request revisado por otro integrante). Los tags de corte `adsi-corte-1`, `-2`, `-3` y `adsi-final` marcan lo entregado en cada sustentación.
4. **Convención de commits:** la que ya usa el repo (Conventional Commits en español: `refactor(ia): aplica Strategy al proveedor de IA`). Cada commit referencia el ID (`P-01`).
5. **Antes de empezar, resolver el ruido de `git status`:** hoy casi todos los archivos aparecen como modificados, pero con `git diff --ignore-cr-at-eol` no hay diferencias reales (probable fin de línea CRLF/LF); hay además un archivo sin seguimiento (`docs/PROMPT_MAESTRO_SIEP_PROFESIONAL.md`). Hay que normalizarlo (por ejemplo `core.autocrlf` local o un `.gitattributes` acordado) o los diffs "antes/después" saldrán llenos de ruido.
6. **Permisos:** el shell que usaré no puede borrar `.git/index.lock`; al empezar la ejecución se pedirá una sola vez el permiso de borrado en la carpeta del proyecto.
7. **Remoto y privacidad:** `origin` es `Jsua3/psico_project_v2`; los otros tres integrantes necesitan acceso de colaborador y el repo debe seguir **privado** (REGLA-007).
8. **Ramas y worktrees viejos** del repo (varios `prunable`) no se tocan.

---

## 9. Sistema de evidencia

### 9.1 Bitácora `CAMBIOS_ADSI.md` (la lleva el repo en `docs/adsi/` dentro de `adsi/integracion`)
Una entrada por cambio, con esta ficha:

```
## P-XX — <patrón> en <módulo>
Rama / commits / autor / fecha
Unidad y guía del curso relacionadas
Problema (con archivo y líneas del "antes")
Por qué este patrón (y por qué no otro)
Qué cambió (archivos creados / modificados / borrados)
Principios SOLID y antipatrones tocados
Ventajas / desventajas / trade-offs
Cómo se probó (comandos + resultado) y reglas de oro verificadas
```

### 9.2 Informe Word
- **Formato:** plantilla IEEE (título, autores, resumen, palabras clave, secciones numeradas), **sin citas en el texto**; las referencias van solo al final (Gamma et al. 1995; Bennett et al. 2007; Booch et al. 2006; Fowler 2003; guías del curso).
- **Anexo A (una columna, para que el código se lea):** por cada cambio, **captura "antes" y "después"** lado a lado del código real, con ruta del archivo, líneas y hash del commit. Las capturas se generan con un script a partir de `git diff adsi-baseline..<rama>` (resaltado de sintaxis, números de línea), no se hacen a mano, para que sean reproducibles y no se pueda decir que se editaron.
- **UML:** diagrama de clases antes/después por patrón (Mermaid renderizado a imagen), más un diagrama general que muestre cómo se relacionan los patrones (lo piden RideApp y la Granja).
- **Resultados de pruebas:** salida de pytest/jest/e2e de cada cambio.
- **Secciones fijas:** análisis de patrones existentes (Unidad 5), patrones evaluados y descartados, antipatrones eliminados, mapeo SOLID, evidencia de Git.
- **Ubicación (actualizado el 9 oct 2026):** todo vive **dentro del repo**, en `docs/diseñosistemas_docs/` (registro, diagramas, capturas, herramientas); solo el informe Word final se arma aparte a partir de esa carpeta.

---

## 10. Definición de "terminado" para cada cambio

1. Existe test que fija el comportamiento actual (si no existe, se escribe **antes** de refactorizar: `rubric_service`, `crypto_service` y el parser XLSX tienen poca o ninguna cobertura).
2. El refactor se hace en su rama; no mezcla dos patrones.
3. Pasan `npm run check:backend`, `npm run test:backend`, `npm run test:frontend` y `npm run build:frontend`; los cambios de render o flujo de juego, además `npm run test:e2e`.
4. Se verifican las reglas de oro (sin migraciones, salida segura, auditoría fire-and-forget, versiones PUBLISHED inmutables).
5. Entrada completa en `CAMBIOS_ADSI.md` y capturas generadas.
6. Pull Request revisado por otro integrante; para los cambios de riesgo M/A, una revisión adicional independiente de quien no escribió el código.

---

## 11. Riesgos y cómo se manejan

| Riesgo | Mitigación |
|---|---|
| **Dónde correr las pruebas.** El backend necesita Docker + Postgres 16 (`npm run test:backend`) y mi shell es una VM Linux con Python 3.10 sin Django ni Docker; no pude ejecutar ni confirmar en verde ningún test todavía | En la Fase 0 se prueba qué sí corre en mi entorno. Si no corre, cada cambio se entrega con **un comando único** para que lo ejecutes en tu Windows y me pases el resultado; no se da nada por verificado sin ver la salida |
| 54 specs de frontend leen el texto fuente (`readFileSync` + `toContain`) y se rompen con cualquier extracción de método | Solo afecta a P-15/16/20; se reescriben como tests de comportamiento **antes** de extraer |
| Cobertura débil en editor Konva (1 spec de 915 líneas), `instructor-trace`, `case-editor` y `grupo-list` | P-07 se limita al store (bien probado); no se toca el componente Konva |
| Refactorizar la escena Phaser no tiene red de seguridad real fuera de e2e | Queda en opcionales; la escena completa no se parte en este semestre |
| Los 4 integrantes tienen que verse en el historial de Git (lo piden los labs) | Ver pendiente 3 (§12) |
| Cambios grandes con poco tiempo antes de la sustentación 1 | La Fase 1 son 9 cambios, 8 de ellos de riesgo B o B–M; P-05 (M) es el único que puede deslizarse a la Fase 2 sin afectar lo que se sustenta |

---

## 12. Pendientes por decidir antes de ejecutar

1. **CF-1** (¿se habilita CSV?) y **CF-2** (¿contraseña por defecto solo a configuración, o rediseño?). Recomendación: refactor sin cambio funcional en ambos y anotarlos como mejora recomendada.
2. **Reparto del equipo** (§7): confirmar o ajustar.
3. **Autoría en Git.** Si yo hago todos los commits desde la cuenta de Sua, el historial mostrará una sola persona y los laboratorios piden evidenciar integración entre integrantes. Recomendación: yo preparo los cambios y cada dueño de rama los commitea y sube desde su propio equipo con su identidad (yo hago el tag, la rama de integración y los commits propios). Hay que decidirlo.
4. **Permiso de borrado** en la carpeta del proyecto (solo para `index.lock`) al arrancar.
5. **Entorno de pruebas** (§11, primera fila): confirmar que en tu laptop corren `npm run test:backend` y `npm test` y quién las ejecuta.
6. **Fechas:** confirmar con la profesora la tabla correcta del plan de trabajo y qué espera ver en cada sustentación de avance.
7. **IEEE:** por defecto el cuerpo va en la plantilla IEEE y las capturas en un anexo de una columna; avísame si prefieres todo en dos columnas.

---

## 13. Próximo paso

Con tu visto bueno a §12 arranca la **Fase 0**. Nada de lo anterior se ejecuta antes.
