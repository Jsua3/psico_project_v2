# PROMPT MAESTRO — ADSI × SIEP (para iniciar una sesión nueva)

> **UBICACIÓN (9 oct 2026):** todo el material de la materia (este prompt, `FASE0_EVALUACION.md`, `PLAN_APLICACION_PATRONES_SIEP.md`, `CAMBIOS_ADSI.md`, diagramas y capturas antes/después) vive **dentro del repo**, en `docs/diseñosistemas_docs/`, por decisión de Sua. Lo nuevo se commitea ahí, rama por cambio (`adsi/pNN-...`) desde `adsi/integracion`, con PR hacia `adsi/integracion`. Sua autorizó a Claude a hacer `git push` de las ramas `adsi/*` (nunca a `master`, nunca *force*); si el entorno no puede empujar, se lo pasa el comando exacto.


> **Para qué sirve:** pegar este documento al inicio de una sesión nueva para que Claude tenga, sin preguntar, todo el contexto de dos carpetas de Juan José Sua: la materia **Análisis y diseño de sistemas** y el simulador **SIEP** (`psico_project_v3`), con énfasis en el estado real del simulador y del trabajo ya hecho para la materia.
> **Fecha de corte:** 6 de octubre de 2026. **Qué NO es:** no reemplaza `docs/PROMPT_MAESTRO.md` ni `docs/PROMPT_MAESTRO_SIEP_PROFESIONAL.md` del repo (son más detallados pero están desactualizados: Django 5.1, Angular 21, Jest, corte de julio). Si algo de aquí contradice al repo, **manda el repo**: verifícalo antes de afirmarlo.

**Cómo usarlo:** lee todo; no vuelvas a explorar lo que ya está resuelto aquí; antes de tocar código confirma el estado con `git log --oneline -10 adsi/integracion` y `git status`. Al final (§12) está el hueco para la tarea de la sesión.

---

## 1. Quién y para qué

- **Usuario:** Juan José Sua Gómez, estudiante de 4.º semestre de Ingeniería de Software en la Corporación Universitaria Empresarial Alexander von Humboldt (CUE), Armenia, Quindío. Correo de la cuenta: `juanjosesua2008@gmail.com`; correo institucional de autoría Git: `jjsua_542@unihumboldt.edu.co`.
- **Materia:** Análisis y diseño de sistemas (trimestre 2026), docente **Diana María Valencia**. No hay rúbrica escrita; la instrucción es «aplicar lo visto».
- **Trabajo:** actualizar por completo el simulador SIEP aplicando lo que enseña la materia: patrones de diseño GoF, antipatrones, principios SOLID y versionamiento con Git. Todo se registra en un `.md` de cambios y en un informe Word (IEEE) con capturas **antes/después** del código, por si la docente pregunta qué se aplicó.
- **Equipo:** Juan José Sua (autor de los commits), Emerson Ángel Gómez («mano derecha»), Santiago Leyton, Esteban Bonilla. El reparto por integrante **aún no está definido**.
- **Paralelo (otra entrega de la misma materia):** a Sua le asignaron **exponer el patrón Template Method**, con su compañero Marlon Alexander Sarria Cobo. Es independiente del simulador, salvo que sirve de candidato para aplicar Template Method en SIEP (§7).
- **Preferencias de trabajo de Sua:** estilo directo y orientado a la acción; entregables completos y listos para usar; trabajo académico en plantilla **IEEE**, sin citas dentro del texto y con las referencias solo al final; en tareas que va a transcribir a mano quiere el documento resuelto, corto, con tono propio (no de IA) y con los resultados verificados dos o más veces. Responde en español.

## 2. Calendario de la materia (fuente: «Plan de trabajo Ana y Dis Sistemas 2026-2.PDF»)

Horario: lunes 2–4 pm, martes 9:30–11:30 am, jueves 10 am–12 m. Festivos sin clase: 12 oct, 2 nov, 16 nov, 8 dic.

| Fecha | Tema / evento |
|---|---|
| 29 sep, 1 oct, 5 oct | Socialización; introducción; fundamentos de patrones |
| **6 oct (hoy)** | Creacionales: Abstract Factory, Builder, Factory Method, Prototype |
| 8 oct | Singleton, Adapter, Bridge, Composite |
| 13 oct | Decorator, Facade, Flyweight, Proxy |
| 15 oct | Chain of Responsibility, Command, Interpreter, Iterator |
| **19 oct** | **Examen parcial 1** |
| **20 oct** | **Sustentación de avance de proyecto 1** |
| 22 oct | Mediator, Memento, Observer, State |
| 26 oct | Strategy, **Template Method**, Visitor |
| 27 oct – 5 nov | Antipatrones (Lava Flow, God, Golden Hammer, Spaghetti, Blob, Poltergeists, Cut & Paste, Input kludge, Sequential coupling, Heroic naming, Boat anchor, Hard code, Exception handling, Packratting) y antipatrones de gestión/organizacionales |
| 9 nov | Análisis de patrones: identificar los implementados y decidir si se aprovechan sus ventajas |
| **10 nov** | **Examen parcial 2** |
| **12 nov** | **Sustentación de avance 2** |
| 17 y 19 nov | SOLID |
| 23, 24, 26 nov | Git: fundamentos, remotos y fusión, ramas y estrategias (GitFlow / trunk-based) |
| 30 nov | Taller de versionamiento aplicado |
| **1 dic** | **Examen parcial 3** |
| **3 dic** | **Sustentación de avance 3** |
| 7 dic | Taller de integración continua e inspección de código; refactorización final |
| **10 dic** | **Sustentación final y entrega del proyecto integrador** |

Consecuencia: para la sustentación 1 (20 oct) solo se pueden **justificar** patrones ya vistos (creacionales, estructurales, Chain, Command, Iterator). Strategy, State, Observer y Template Method se ven del 22 al 26 de oct, así que van en la fase 2.
Referencia de un periodo anterior (hoja «Proyecto Nuclear» del material): cada grupo tenía 25–30 min para sustentar, cada integrante prepara su parte y **lo que no se expone se califica como no trabajado**. No está confirmado que aplique este trimestre.

## 3. Material de la materia (carpeta `Analisis_diseño_sistemas`)

Ruta en el PC de Sua: `D:\Sua_Files\OneDrive\Documentos\Humboldt\4TO_SEMESTRE\Analisis_diseño_sistemas`.

- `documentos_material/Material Analisis y Diseño/`: 7 unidades. (1) exposiciones con código de cada patrón (Abstract Factory, Adapter, Bridge, Builder, Chain, Command, Composite, Decorator, Facade, Factory Method, Flyweight, Interpreter, Prototype, Proxy, Singleton); (2) guías de patrones estructurales y creacionales; (3) guías de comportamiento y laboratorios (RideApp, Granja Inteligente, cuerpo humano, ciudad inteligente); (4) antipatrones (guías, laboratorios de inventarios y droguería, wiki visual en Padlet); (5) análisis de patrones (identificar patrones y antipatrones en código real; laboratorio de la cafetería); (6) SOLID (guía, ejercicios en Java, reto de sensores); (7) Git y gestión de configuración (remotos, ramas, estrategias de ramificación, laboratorio con GitHub). También `Resumen de los Patrones de Diseño.docx` y `Proyecto Nuclear/`.
- Bibliografía oficial: Bennett, McRobb y Farmer (2007); Booch, Rumbaugh y Jacobson (2006); Fowler (2003); Gamma et al. (1995).
- **Archivos de trabajo propios (en el repo, `docs/diseñosistemas_docs/`):** `PLAN_APLICACION_PATRONES_SIEP.md` (plan v1, parcialmente superado), `FASE0_EVALUACION.md` (**vigente**: evaluación contra el código real y catálogo v2), `CAMBIOS_ADSI.md`, `P-NN/` (capturas y UML por cambio) y `tools/`. En la carpeta de la materia solo quedan copias viejas y `evidencia_adsi/_tmp/` (puente de transferencia; Sua puede borrar lo demás). Los dos `.md` también están en el proyecto de Claude «Análisis y diseño de sistemas» (`claude/…`), junto con el contenido temático, `design pattners.pdf` y el plan de trabajo.
- Los `.docx` del material se leyeron por encima; **ninguna guía ni laboratorio se ha leído a fondo todavía**. Antes de redactar justificaciones para la docente, léelos (especialmente las guías de cada patrón aplicado y la unidad 5).

## 4. SIEP en una página

- **Qué es:** Sistema de Entrenamiento Psicosocial, plataforma web académica del programa de Psicología de la CUE (SNIES 101645). Simulación formativa tipo **RPG clínico top-down**: el estudiante explora mapas de casos (violencia basada en género, feminicidio, niñez y adolescencia, crisis, rutas de protección), dialoga con NPCs, toma decisiones clínicas y se evalúa por competencias. Es entrenamiento **ético, no un examen**: los errores son recuperables; solo las conductas prohibidas (revictimizantes) tienen consecuencias graves.
- **Marca vs. código:** la marca visible es SIEP; el código conserva `psychosim`/`PsychoSim` (esquema, tokens, seeds).
- **Dominio sensible:** contenido clínico real de VBG/feminicidio/NNA; repositorio **privado**, nunca datos reales de pacientes, reflexiones cifradas (AES-GCM).
- **Roles:** ESTUDIANTE (juega los casos asignados a su grupo, avatar, bitácora de reflexión, reporte), PROFESOR (grupos, importación de estudiantes por Excel, asignar casos, trazabilidad, rúbricas, reportes y CSV), ADMIN (todo lo anterior + usuarios, solicitudes de acceso y autoría de casos).
- **Modelo pedagógico:** un caso tiene versiones (DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED). Cada versión es un grafo dirigido de nodos clínicos unidos por opciones de decisión clasificadas `ADEQUATE | RISKY | INADEQUATE`, con marca de conducta prohibida. Cada nodo puede tener un mapa explorable (objetos, zonas de colisión, árboles de diálogo, puertas EXIT a otras salas). El **backend es la única autoridad del puntaje**. Hay finales múltiples (4 en el caso de referencia), salida segura siempre alcanzable, auditoría persistente y reporte final con competencias y recomendaciones.
- **Caso de referencia:** `SIM-VBG-001` (v2.x, «caso PDF»): hospital-urgencias ⇄ hospital-sala-escucha → comisaría-recepción ⇄ comisaría-consultorio, 6 decisiones canónicas. Es el único caso publicado; lo siembra `bootstrap_dev_db`, igual que el grupo `DEMO1` y los usuarios demo.
- **Credenciales demo (solo desarrollo):** `admin@psychosim.edu.co / Admin123!`, `profesora@psychosim.edu.co / Profesor123!`, `estudiante@psychosim.edu.co / Estudiante123!`.

## 5. Arquitectura y stack (estado verificado en `master` = `f39ab96`)

Monorepo en `D:\Sua_Files\IdeaProjects\psico_project_v3`; remoto `https://github.com/Jsua3/psico_project_v2`.

| Capa | Tecnología |
|---|---|
| Backend | Python 3.14 (3.12+), **Django 6.1.1**, DRF 3.18, simplejwt 5.5, psycopg 3, gunicorn |
| Frontend | **Angular 22.2** (standalone + Signals), Phaser 4.2, Konva 10.7, Angular Material, **Vitest 5** vía `ng test` (migrado desde Jest) |
| BD | PostgreSQL 16 en desarrollo, 18 en pruebas |
| Auth | JWT con claims `userId` + `role`; Google OAuth opcional |
| Infra | Node 24, Docker Compose (solo `db`), Railway (despliegue actual; Hetzner propuesto, no ejecutado) |

**Backend (`backend_django/apps/`):** `users` (usuario propio, JWT, Google, solicitudes de acceso), `grupos` (cohortes, importación `.xlsx`, asignación de casos), `progression` (catálogo y desbloqueo), `reportes` (dashboard, reporte por grupo, CSV), `simulation` (núcleo: catálogo, intentos, decisiones, mundo, puertas, herramientas, NPCs, reflexiones, instructor, autoría, asistente de IA), `shared` (respuesta, permisos, excepciones, `jsonutils`). Las tablas son `managed = False` (esquema heredado de Flyway/Spring) y las pruebas corren con `--nomigrations`. Envoltorio de respuesta `{"data": …, "message": …}`.
Piezas clave (rutas bajo `apps/simulation/`): `views/ai_assistant.py` (asistente de IA, apagado por defecto), `services/game_service.py` (intentos, decisiones, `get_progress_map`), `services/world_service.py` (mundo, `enter_room`, `_validate_door`), `services/case_effects.py` (efectos, `compute_ending`), `services/authoring_service.py` (clonado de versiones), `services/rubric_service.py`, `serializers/game_dtos.py` (`build_completion_report`), `services/world_validation.py` (puro, sin BD).

**Rutas HTTP (inglés, bajo `/api`):** `auth/*`; `admin/users`, `admin/access-requests`, `admin/cases/*` (autoría, editor DAG y mundo); `grupos/*`; `simulation/cases|catalog|attempts/*` (decisiones, mundo, `enter-room`, herramientas, NPCs, reflexiones, `safe-exit`, `resume`, `progress-map`, `completion-report`, `ai-assistant`); `instructor/attempts/*`; `reportes/*`.

**Frontend (`frontend/src/app/`):** `core/` (auth: service, guard, `jwt.interceptor.ts`; `api/simulation.service.ts` con 50 métodos; modelos; notificaciones), `features/` (público, login, dashboard, **simulator** ≈70 archivos —juego en Phaser, editor de casos DAG, **editor de mundo en Konva** con store de comandos—, personajes, grupos, reportes, admin), `shared/layout/`. Activos del juego en `src/assets/game/`.

**Pruebas y CI** (raíz, `package.json`): `npm run up` (Postgres + Django :8091 + Angular :4200), `npm run test:backend`, `npm run test:frontend`, `npm run build:frontend`, `npm run test:scripts`, `npm run test:e2e` (Playwright, stack aislado). `.github/workflows/ci.yml` corre en **pull_request, push a master y workflow_dispatch** (scripts → backend → frontend/build → e2e); `e2e-full-case.yml` corre cada noche. **Subir ramas sin PR no dispara el CI.**

## 6. Reglas de oro del proyecto (no romper)

1. **Sin migraciones Django ni cambios de esquema** sin discutirlo antes (REGLA-002 / RNF-010). La propuesta «Django dueño del esquema» de la auditoría del 4 oct **no** forma parte del trabajo de la materia.
2. **Salida segura siempre alcanzable** (REGLA-004).
3. **Las versiones PUBLISHED no se mutan:** se clonan (REGLA-005).
4. **La auditoría nunca interrumpe el flujo** (REGLA-006): por eso hay `except Exception` deliberados.
5. **Repo privado** y datos clínicos sensibles (REGLA-007); reflexiones cifradas; nada sensible en claro.
6. El backend es la autoridad del puntaje; el frontend solo presenta.
7. **No romper el flujo del estudiante ni los tests verdes.** Extender, no reescribir. Un refactor de patrones **no cambia comportamiento** salvo que se declare como cambio deliberado.

## 7. Trabajo de la materia ya hecho (estado al 6 oct 2026)

> **ACTUALIZACIÓN 9 oct 2026 (léela primero; reemplaza lo que contradiga en §5–§9).** `master` avanzó a **`dd4eb89`** (78 commits: personajes unificados, escala del mundo, LF; **backend sin cambios**). `adsi/integracion` = **`6fec5aa`** (merge `4fad3b7` de master + registro actualizado); nuevo tag **`adsi-baseline-2` = `dd4eb89`** (el «antes» para lo que toque archivos modificados por esa tanda; `adsi-baseline` = `f39ab96` sigue siendo el original). Medición sobre master + pruebas ADSI: **backend 408, frontend 2094 (167 archivos)**, `test:visual-assets`/`test:kit`/`kit:check`/`test:world-art`/`ng build` OK. Referencias nuevas: P-10 en `game-world.component.ts` (`updateNpcMovers` 1276, `nextNpcTarget` 1337, `nextAmbientTarget` 2139; 13 contract-specs leen ese archivo); **Template Method verificado** en `case-pdf-rooms.renderer.ts` 522–621 (4 renderers de sala) junto con `rectC/frameC/ellipseC` duplicadas entre ese archivo y `premium-clinical-room.renderer.ts`. Detalle en `FASE0_EVALUACION.md` §8–§9. Árbol de prueba del contenedor: `/home/claude/siep_dd4eb89`. Pendiente de Sua: `git push origin adsi/integracion adsi-baseline-2` y PR draft.


### 7.1 Decisiones de Sua

- Aplicar patrones **solo donde aporten, con justificación**; lo evaluado y descartado también se documenta.
- Catálogo v2 aprobado («Sí, aplicar v2»).
- **Claude commitea todo a nombre de Sua** (autor `Juan José Sua <jjsua_542@unihumboldt.edu.co>`, trailers `Co-Authored-By: Claude …` y `Claude-Session: …`); convención del repo: *Conventional Commits en español*.
- Línea base de pruebas oficial = **CI de GitHub** (necesita un PR draft).
- El «antes» de todas las capturas es el tag `adsi-baseline`.

### 7.2 Estado de Git

- `master` = `f39ab96` (merge del PR #17 «actualizar stack», incluye el fix #18). Intacto; es la rama activa en el PC de Sua y su árbol está limpio salvo `docs/CONTEXTO_COMPLETO_SIEP.md` y `docs/PROMPT_MAESTRO_SIEP_PROFESIONAL.md` (sin seguimiento, suyos).
- Tag `adsi-baseline` → `f39ab96`. Rama `adsi/integracion` = base de todo el trabajo (una rama por cambio, que parte de ella y vuelve a ella). Existe además `chore/gitattributes-eol` (de Sua).
- Commits en `adsi/integracion` sobre `f39ab96` (todos con las pruebas en verde):
  `c490c95` fix del spec `journal-panel` (`jest.fn()` → `vi.fn()`; sin él `ng test` no compila; el mismo fallo está en `master`) · `3c9cbc4` IA · `bfe85cf` reporte de cierre · `9d1ff6c` puertas y mapa de progreso · `d962444` interceptor JWT · `d705b83` contrato de `SimulationService` · `8bb4203` editor de mundo · `7c77f08` `docs/diseñosistemas_docs/CAMBIOS_ADSI.md`.
- **Sua subió `adsi-baseline` y `adsi/integracion` (hasta `c490c95`) el 5 oct.** Los 7 commits posteriores **no estaban empujados** cuando se cerró la sesión: verifica con `git log origin/adsi/integracion`. El PR draft hacia `master` (para el CI oficial) también estaba pendiente de Sua.

### 7.3 Línea base y red de seguridad

Medida en un entorno equivalente (Python 3.12, PostgreSQL 16.2, Node 24; **no** es el del CI): backend 307 pasan; frontend 1809 pasan (con el fix); `npm run build` OK; e2e Playwright **no ejecutado**.
Con las pruebas de caracterización nuevas: **backend 408 pasan, frontend 1973 pasan en 153 archivos.** Cada archivo se validó rompiendo el código a propósito (falla) y restaurando.

| Archivo nuevo | Protege |
|---|---|
| `test_ai_provider_contract.py` (39) | P-01: frontera HTTP del asistente (intercepta `urllib.request.urlopen`) |
| `test_completion_report_contract.py` (31) | P-04: forma, conteos, competencias, recomendaciones, resumen |
| `test_door_validation_contract.py` (24) y `test_progress_map_order_contract.py` (7) | P-08a (orden de reglas de la puerta, `requiresTools`, `requiresNpcs`) y P-09 (BFS) |
| `jwt.interceptor.spec.ts` (23) | P-08b |
| `simulation.service.contract.spec.ts` (61) | P-05: verbo/URL/cuerpo/cabeceras de los 50 métodos y un guardián de cobertura |
| `world-editor.store.commands.spec.ts` (65) y `world-editor.component.actions.spec.ts` (15) | P-07: 12 comandos, pila, autoguardado, acciones del inspector |

### 7.4 Catálogo v2 (el plan a ejecutar; detalle y riesgos en `FASE0_EVALUACION.md` §3–4)

**Fase 1 — hasta el 18 oct (sustentación 1, el 20):** P-01 Strategy + Adapter + Factory Method (proveedor de IA) · P-04 Builder (reporte de cierre) · P-08a Chain of Responsibility (validación de puertas, backend) · P-08b Chain (interceptores HTTP) · P-05 Facade / ISP (`AuthoringApi`, `InstructorApi`; `SimulationService` queda como fachada) · P-06 Proxy de caché solo sobre `listCases`, con invalidación en publicar/clonar/login/logout (**sus pruebas se escriben junto con la implementación**, no antes) · P-07 Composite (`MacroCommand` borrar objeto + su diálogo) y Command (`SetZoneLabelCommand` deshacible, tope a la pila) · P-09 Iterator (solo `get_progress_map`, generador BFS con `deque`) · A-01 duplicados y A-02 código muerto.
**Fase 2 — hasta el 11 nov:** P-10 Strategy (movimiento de NPC, en archivo nuevo) · P-12 State (primero A-03/usar `AttemptStatus`, luego tabla de transiciones) · P-03 Prototype (declarativo, riesgo alto, solo tras prueba de clon completo; pasa a la sustentación 2) · A-03 números mágicos · A-04 `GoogleLoginView` · A-06 contraseña por defecto (solo extraer a configuración) · **un candidato de Template Method por verificar** (hipótesis sin comprobar: los renderers `premium-clinical-room` y `case-pdf-rooms` comparten esqueleto).
**Opcionales:** P-11 Strategy de finales, P-13 Observer (un solo suscriptor; solo con señal síncrona), P-15 a P-20 del plan v1.
**Retirados con motivo:** P-02 Factory de parsers (el frontend no ofrece CSV; el error está en el README), P-14 Template Method de entornos (código muerto), Chain sobre filas de importación (cambia el contrato), Iterator sobre `_detect_cycle` (cambia comportamiento). **Evaluados y no aplicados:** Singleton, Bridge, Visitor, Interpreter, Flyweight.

### 7.5 Hallazgos para el informe de antipatrones

Dejados por las pruebas (comportamiento actual, sin corregir): (1) el autoguardado del editor de mundo muere tras un error de guardado (`catchError` fuera del `switchMap`); (2) un guardado pendiente tras recargar otro nodo se envía con el estado de la sala anterior; (3) la etiqueta de una zona no es deshacible (`updateZoneLabel`); (4) borrar un objeto deja huérfano su diálogo; (5) deshacer un borrado repone el elemento al final.
Del análisis estático: strings `"IN_PROGRESS"` en ~30 sitios aunque existe `AttemptStatus` (Hard Code); `get_progress_map` con `pop(0)` O(n²) y N+1; modelo por defecto `gpt-4o-mini` enviado también a Anthropic; docstring de `enter_room` desactualizado (Lava Flow); clones que omiten `weight`, `active`, `world_schema_version` y checklist, y dos implementaciones divergentes de duplicar rúbricas (Cut & Paste); `nextAmbientTarget` incrementa `patrolIdx` antes de elegir (posible salto del punto 0); 9 `except Exception`; 55 archivos de test que leen el código fuente como texto; código de producción que solo usa un spec.

### 7.6 Zonas de peligro (lo que ya rompió o puede romper un refactor)

- Los tests del asistente **parchean** `AIAssistantView._call_llm(self, question, context)` y `AIAssistantView._post_json`: esos atributos deben seguir existiendo; `NotConfigured` debe seguir a nivel de módulo; los ajustes se leen en tiempo de llamada.
- `game-world.component.ts`: **10 contract-specs lo leen con regex ancladas** (exactamente 2 `this.children.removeAll(true)`, indentación de 6 espacios, etc.). Cambiar solo el cuerpo de `nextNpcTarget`/`nextAmbientTarget`; no mover métodos; conservar `npcMovers`/`ambientMovers`.
- `simulation-play.game-feel.contract.spec.ts` fija literales (`}, 80);`, `SCENE_FADE_MS = 320`, `, 400);`): actualizar esos asserts **antes** de extraer constantes; la constante nueva de 340 no reutiliza `SCENE_FADE_MS`.
- `HANDLED_BY_INTERCEPTOR = {0, 401, 403}` (`api-error.util.ts`) es un contrato: al partir el interceptor se conserva.
- Un Builder no debe cambiar el número de consultas SQL; `_save_event` de `world_service` **no** es duplicado de la otra; `crypto`/rúbricas tienen pruebas delgadas.
- Una fachada que solo delega no aporta si los componentes siguen inyectando el servicio completo: hay que migrar consumidores (autoría: `case-editor`, `case-authoring-hub`, store del editor, `world-preview`; 17 specs mockean `SimulationService` con `useValue` parcial).

## 8. Protocolo de trabajo (cómo se hizo y cómo seguir)

**Principios:** pruebas de caracterización en verde **antes** de cada refactor; un cambio = una rama = commits pequeños; ningún cambio de comportamiento sin declararlo; cada entrada se anota en `docs/diseñosistemas_docs/CAMBIOS_ADSI.md` (patrón/antipatrón, archivos, motivo, riesgo, commit, capturas).

**Dónde se corre cada cosa.** Hay dos entornos distintos y no se mezclan:
- *Contenedor de Claude (nube):* aquí se desarrollan y se prueban los cambios (`/home/claude/siep_f39ab96` = copia del árbol; `venv312`, `env_test.sh`, `node24`). **Es efímero: en una sesión nueva hay que reconstruirlo** (apéndice A) o pedir que Sua vincule su PC.
- *PC de Sua (herramientas `mcp__remote-devices__*`, shell Linux en VM):* solo mueve archivos y ejecuta Git. **No sirve para correr pruebas** (sin Docker/PostgreSQL; `node_modules` y `.venv` del repo son de Windows). Las carpetas montadas están en `$HOME/mnt/psico_project_v3` y `$HOME/mnt/Analisis_diseño_sistemas`.

**Cómo se commitea sin tocar el árbol de Sua** (su carpeta tiene CRLF y su IntelliJ está abierto; `git status`/`add` desde la VM la ensucian y dejan `.git/index.lock`):
1. Desarrollar y probar en el contenedor; empaquetar los archivos cambiados en un `.tar.gz`; enviarlo con `SendUserFile` y bajarlo con `device_commit_files` a `evidencia_adsi/_tmp/` (escribir dentro de `.git` está **prohibido** por la herramienta).
2. En la VM, con índice temporal y sin `checkout`: `export GIT_OPTIONAL_LOCKS=0 GIT_INDEX_FILE=$HOME/adsi.idx`; `git read-tree <rama>`; por archivo `git hash-object -w --no-filters` + `git update-index --add --cacheinfo 100644,<blob>,<ruta>`; `git write-tree`; `git commit-tree <tree> -p <padre> -F -`; `git update-ref refs/heads/<rama> <nuevo> <padre>`. Usar `-c core.autocrlf=false -c core.fileMode=false`, autor/committer por variables de entorno y verificar después el contenido con `git show <rama>:<ruta> | sha1sum`.
3. Comprobar `git status` con `-c core.autocrlf=true` (debe quedar solo lo suyo sin seguimiento), que `master` no se movió y que no hay `.git/index.lock` ni `.git/objects/*/tmp_obj_*` (borrarlos exige que Sua apruebe el permiso de borrado de la carpeta del repo).
4. **El push, el PR y los merges los hace Sua** desde IntelliJ/PowerShell: pásale el comando exacto.

**Verificación mínima por cambio:** `python -m pytest -q` (backend), `npx ng test --watch=false` (frontend; suite completa ≈ 5 min, se puede filtrar con `--include='**/archivo.spec.ts'`), `npx ng build`; y comprobar que la prueba nueva **falla** si se rompe el código a propósito. Para P-06 y para cada refactor: prueba antes (TDD), no después.

**Evidencia para la docente (en el repo, `docs/diseñosistemas_docs/`; herramienta `tools/codeshot.py` ya hecha; UML con Mermaid `mmdc`):** script que genere imágenes PNG del «antes» (`git show adsi-baseline:<ruta>`) y el «después» desde `git diff adsi-baseline..<rama>`; plantilla Word IEEE (sin citas en el texto, referencias al final) con anexo de capturas, diagramas UML (Mermaid) y la tabla patrón → problema → solución → riesgo → prueba; informe de antipatrones y mapa SOLID; evidencia de Git (ramas, PRs, historial).

## 9. Qué sigue (orden sugerido)

1. Confirmar que Sua empujó `adsi/integracion` y abrió el PR draft; revisar el resultado del CI (esperable: el job de frontend de `master` falla por `jest.fn()` y el nuestro lo corrige).
2. **P-01** (IA): crear `create_provider()` (Factory Method), clases de proveedor (Strategy) con un adaptador del contrato de cada API (Adapter); decidir con Sua si se corrige el modelo por defecto según el proveedor (cambio de comportamiento declarado).
3. P-04, P-08a, P-09 (backend), luego P-08b, P-05, P-06, P-07 (frontend), A-01 y A-02. Meta: todo en `adsi/integracion` y probado el **18 oct**.
4. Construir en paralelo la herramienta de capturas y la plantilla Word; repartir ramas entre los cuatro integrantes (preguntar a Sua).
5. Después del 20 oct: fase 2 y lectura a fondo de las guías de la materia que correspondan.

## 10. Cómo comunicarte con Sua

Directo, en español, sin relleno. Decide con valores razonables y avisa; pregunta solo cuando el error sería caro de deshacer (cambio de esquema, de contrato HTTP, de comportamiento visible para el estudiante, push/merge). Al terminar: qué quedó hecho, dónde está y el siguiente paso real, sin recontar los pasos. Los números que reportes deben venir de una ejecución, no de memoria.

## 11. Mapa de archivos

| Qué | Dónde |
|---|---|
| Plan v1 (parcialmente superado) | `Analisis_diseño_sistemas/PLAN_APLICACION_PATRONES_SIEP.md` (y proyecto de Claude) |
| **Evaluación vigente + catálogo v2** | `Analisis_diseño_sistemas/FASE0_EVALUACION.md` (y proyecto de Claude) |
| Registro de cambios ADSI | `psico_project_v3/docs/diseñosistemas_docs/CAMBIOS_ADSI.md` (solo en `adsi/integracion`) |
| Docs técnicos del repo | `docs/PROMPT_MAESTRO.md` (fuente de verdad, jun 2026), `docs/PROMPT_MAESTRO_SIEP_PROFESIONAL.md` (jul 2026), `docs/audits/2026-10-04-estrategia-stack-esquema-y-despliegue.md` (stack y plan de actualización), `docs/qa-api-siep.md`, `README.md` |
| Material de la materia | `Analisis_diseño_sistemas/documentos_material/Material Analisis y Diseño/` |
| Calendario | `Plan de trabajo Ana y Dis Sistemas 2026-2.PDF` (proyecto de Claude) |

## 12. TAREA DE ESTA SESIÓN

> **[Sua: escribe aquí qué quieres hacer.]** Si lo dejas vacío, empieza por el punto 1 y 2 de §9 y avísame antes de cualquier push o cambio de comportamiento.

---

## Apéndice A — Reconstruir el entorno de pruebas (contenedor nuevo)

Hecho una vez en la sesión anterior; los comandos exactos pueden requerir ajuste (verifícalos).
1. Copiar el árbol de la rama (`git archive adsi/integracion` desde el PC de Sua o los archivos que haga falta) a `/home/claude/siep_<sha>`.
2. **Backend:** `python3.12 -m venv venv312` (pgserver no tiene ruedas para 3.13); `pip install -r backend_django/requirements.txt pgserver`. Los binarios de PostgreSQL de `pgserver` (16.2) no corren como root: crear el usuario `pgrun`, `initdb` en `/home/pgrun/data` y arrancar con `pg_ctl -D /home/pgrun/data -o '-p 5544 -k /tmp' start` como `pgrun`. Crear el rol `siep_test` y la base `psychosim_test`.
3. Variables (`env_test.sh`): `DJANGO_SETTINGS_MODULE=psychosim.settings.test`, `SIEP_TEST_DB_NAME=psychosim_test`, `SIEP_TEST_DB_HOST=127.0.0.1`, `SIEP_TEST_DB_PORT=5544`, `SIEP_TEST_DB_USER=siep_test`, `SIEP_TEST_DB_PASSWORD=<la del rol>`, `SIEP_TEST_ATTESTATION_NONCE=<cadena de 43 caracteres válidos>`, `SIEP_TEST_CHECKOUT_ID=adsi-local`. `settings/test.py` rechaza DSN de desarrollo o nombres como `psychosim`.
4. Sembrar: `python manage.py bootstrap_dev_db` (crea esquema, `SIM-VBG-001`, `DEMO1` y usuarios); luego `python -m pytest -q` (≈ 70 s).
5. **Frontend:** Angular 22 exige Node ≥ 22.22.3 o 24.15+. Instalar Node 24 con el paquete npm `node` en un directorio propio y anteponerlo al `PATH`; `cd frontend && npm ci`; `npx ng test --watch=false` y `npx ng build`.
6. Límites del entorno: sin Docker, sin e2e de Playwright, versiones distintas de Python/PostgreSQL respecto del CI. La verdad oficial es el CI de GitHub.

## Apéndice B — Datos y términos rápidos

- **Contrato de respuesta:** `{"data": …, "message": …}`; errores `{"success": false, "message": …}`.
- **Token de intento:** cabecera `X-SIEP-Attempt-Token` (nunca en la URL).
- **Estados de intento:** `IN_PROGRESS`, `PAUSED`, `SAFE_EXITED` (histórico, nadie lo escribe), `COMPLETED`, `REPLACED`.
- **Dos sistemas de mundo coexisten:** el de base de datos (autorado en el editor Konva; un mapa por nodo, puertas EXIT) y el `ScenarioConfig` en JSON (`assets/game/scenarios/`, varias salas dentro de un nodo). Unificarlos cambia comportamiento.
- **Identificadores del plan:** `P-xx` patrón, `A-xx` antipatrón/limpieza, `CF-x` cambio funcional (CF-1 ya no existe).
