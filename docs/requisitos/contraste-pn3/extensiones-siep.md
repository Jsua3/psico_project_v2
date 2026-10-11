# Extensiones de SIEP sobre la línea base PN3: catálogo candidato y equivalencias

Alcance: código de `master` (5ad59d1), solo lectura; rutas relativas a la raíz del repositorio. Los veredictos de contraste de cada ítem de la línea base están en [`matriz-cumplimiento.md`](matriz-cumplimiento.md); aquí solo se cataloga lo que la línea base no trae. Evidencia marcada **[v]** = verificada en el código en esta pasada; **[m]** = tomada del mapa del sistema (`docs/informes/2026-10-10-mapa-del-sistema/secciones/`) sin releer la línea; **[d]** = documento. Nada se ejecutó.

La línea base (RF-01..26, RNF-01..08, RN-01..11, CU-01..15) queda intacta. Todo lo de abajo es adicional o se contrasta con ella.

---

## A. Esquema de IDs

### A.1 Regla

| Familia | Patrón | Para qué | Ejemplo |
|---|---|---|---|
| Capacidad existente (implementada o parcial) que no está en la línea base | `SIEP-RF-nn`, `SIEP-RNF-nn`, `SIEP-RN-nn`, `SIEP-CU-nn` (dos dígitos) | Lo que SIEP ya hace de más | `SIEP-RN-01` salida segura siempre alcanzable |
| Requisito nuevo que nace de una propuesta | `SIEP-RF-X-nn` con X ∈ {C, E, F, G, J}; análogos `SIEP-RNF-X-nn`, `SIEP-RN-X-nn`, `SIEP-CU-X-nn` | Lo que todavía no existe y depende de decisión | `SIEP-RF-G-01` ayuda contextual |
| Línea base | `RF-nn`, `RNF-nn`, `RN-nn`, `CU-nn` sin prefijo | Mínimo unificado de la carrera | `RN-09` |
| IDs antiguos del equipo | Se conservan tal cual (`RQ-NEG-00n`, `RF-027`, `RNF-00n`, `REGLA-0nn`) y se marcan como «histórico» en la tabla C | Trazabilidad | `RNF-010` |

### A.2 Por qué así

1. **El prefijo `SIEP-` elimina la colisión de numeración.** Hoy «RNF-02» significa comunicación segura (línea base) y «RNF-002» control de acceso por rol (equipo); «RNF-010» es ética de contenidos sensibles en el catálogo del equipo y «no regresión de datos» en `docs/historico/PROMPT_MIGRACION_DJANGO.md:127` **[v]** (origen de REGLA-002). Con prefijo, un ID nunca se lee en dos sentidos.
2. **Dos dígitos y numeración propia**: mismo formato visual que la línea base (RF-01), sin huecos que sugieran que faltan piezas de ella.
3. **Letra de bloque = propuesta.** Las cinco propuestas (`docs/pendientes/propuestas/`) ya se llaman bloques C, E, F, G y J; reservar `SIEP-RF-C-nn`..`SIEP-RF-J-nn` permite que cada propuesta crezca y se apruebe o descarte sin renumerar nada.
4. **Estado en el ID no entra**: «Implementado / Parcial / Propuesto» es columna, no parte del ID, para no cambiar IDs al implementar.
5. **RQ-NEG no se renumeran**: son objetivos de negocio medibles, no requisitos del sistema. Se quedan como `RQ-NEG-00n` y se enlazan a IDs `SIEP-*` o de la línea base (tabla C). Nota: `PROMPT_MIGRACION_DJANGO.md:36-43` **[v]** define otros RQ-NEG-001..008 con distinto significado (catálogo versionado, inmutabilidad, DAG, evaluación, trazabilidad, bitácoras cifradas, validación experta, analíticas); ese archivo es histórico y manda el de `docs/requisitos/negocio/`.

### A.3 Bloques reservados

| Bloque | Propuesta | Rango reservado | Contenido esperado |
|---|---|---|---|
| C | Diálogo y retratos (señal sobria) | `SIEP-{RF,RNF,RN,CU}-C-01..09` | Emoción canónica, perfiles de ritmo, retrato por estado, respeto de movimiento reducido en el panel |
| E | Social Mapping (ecomapa guiado) | `...-E-01..09` | Red de vínculos, marcas del estudiante, comparación, vista docente |
| F | Tensión verbal (entrevista por turnos) | `...-F-01..09` | Turnos de 2-4 intercambios, niveles de tensión, reparación, vista docente |
| G | Asistente / ayuda contextual (RF-027 reinterpretado) | `...-G-01..09` | Ayuda curada, IA opcional tras decidir, topes de uso, consentimiento |
| J | Escenario hogar o consultorio (2.º caso) | `...-J-01..09` | Generalizar finales/métricas/aviso/introducción, caso nuevo, rúbrica propia |

Ninguna reserva se ocupa hasta que la propuesta se apruebe.

---

## B. Catálogo candidato (36 entradas: 14 RF, 8 RNF, 9 RN, 5 CU)

Solo lo que no está ya en la línea base. «Estado»: Implementado, Parcial o Propuesto. Prioridad por criterio del autor del contraste (no del equipo).

### B.1 Requisitos funcionales

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Estado | Evidencia u origen |
|---|---|---|---|---|---|---|---|
| SIEP-RF-01 | Persistencia | Pausar y reanudar el intento | El estudiante debe poder salir de forma segura en cualquier momento; el intento queda en pausa, sin cerrarse ni bloquear su bitácora, y puede reanudarse con el mismo identificador, nodo y métricas. | Estudiante / Sistema | Alta | Implementado | `backend_django/apps/simulation/services/game_service.py:453,471` [v]; transiciones `services/attempt_lifecycle.py:15-18` [v] |
| SIEP-RF-02 | Participación | Explorar el mundo y usar herramientas | El estudiante debe poder recorrer las salas del caso, interactuar con personas y objetos, recoger herramientas clínicas y cruzar puertas cuyas condiciones (inspección, herramientas, nodos, personas) valida el servidor. | Estudiante / Sistema | Alta | Implementado | `services/door_chain.py:40-112` [v]; `services/world_service.py:262-331,394-433` [m] |
| SIEP-RF-03 | Evaluación | Efectos e indicadores por decisión | Cada decisión registrada debe mover puntaje, estrés, confianza y riesgo (acotados 0-100), con penalización fija por conducta prohibida. Un reintento no los mueve. | Sistema | Alta | Implementado | `services/decision_effects.py:9-11,37-46` [v] |
| SIEP-RF-04 | Evaluación | Final diferenciado y métricas del caso | Al completar, el sistema debe resolver uno de cuatro finales a partir de severidad y banderas del recorrido. | Sistema | Media | Parcial (solo funciona para SIM-VBG-001) | `services/case_effects.py:51,289` [v]; límite `case_effects.py:311-341` [m] |
| SIEP-RF-05 | Ética | Consentimiento y aviso de contenido sensible | Antes de mostrar mundo, HUD o audio, el sistema debe pedir aceptación de un aviso de contenido sensible; el caso puede exigir salida segura visible. | Estudiante | Alta | Parcial (solo en el navegador, `sessionStorage`; el servidor no lo registra) | `frontend/src/app/features/simulator/simulation-play.component.ts:1628,2789,2802` [v] |
| SIEP-RF-06 | Evaluación | Rúbricas gestionables y calificación docente | El profesor o el administrador debe poder crear, duplicar, activar y asignar rúbricas a una versión y calificar cada criterio de un intento; el total es ponderado. | Profesor / Administrador | Alta | Implementado | `services/rubric_service.py:410-461` [v] (escala 1.0-5.0, línea 418) |
| SIEP-RF-07 | Gestión de casos | Clonar versión | El administrador debe poder crear un borrador nuevo a partir de una versión publicada, copiando nodos, decisiones, mapas, objetos, diálogos, herramientas y rúbricas. | Administrador | Alta | Implementado | `services/authoring/publication.py:61-111` [v] |
| SIEP-RF-08 | Gestión de casos | Editor visual de mundo y vista previa | El administrador debe poder editar salas con lienzo visual (deshacer/rehacer, autoguardado) y probar el borrador con el motor real sin crear intento. | Administrador | Media | Implementado | `frontend/src/app/features/simulator/world-editor/world-editor.store.ts` [m]; `world-preview.component.ts` [m] |
| SIEP-RF-09 | Grupos | Importar estudiantes desde Excel | El profesor debe poder cargar un `.xlsx` para crear las cuentas de estudiante inexistentes y vincular las existentes a su grupo, todo o nada. | Profesor | Media | Implementado | `backend_django/apps/grupos/services.py:355,423-465` [v] |
| SIEP-RF-10 | Usuarios y acceso | Solicitar acceso | Una persona sin cuenta debe poder enviar nombre, apellido y correo para que el administrador cree su cuenta. | Visitante / Administrador | Media | Implementado | `apps/users/services/access_request_service.py:41-61` [m] |
| SIEP-RF-11 | Usuarios y acceso | Iniciar sesión con Google | El usuario con cuenta activa y correo verificado debe poder ingresar con su identidad de Google; no crea cuentas. | Todos | Baja | Implementado (apagado sin client id) | `apps/users/views.py:97-115` [m] |
| SIEP-RF-12 | Participación | Catálogo con desbloqueo lineal | El estudiante debe ver los casos publicados en orden y desbloquear el siguiente al completar el anterior. | Estudiante / Sistema | Baja | Parcial (solo en el lobby; el servidor no lo exige al iniciar) | `apps/progression/catalog.py:12` [v]; `game_service.py:164` [m] |
| SIEP-RF-13 | Participación | Personalizar avatar | El estudiante debe poder elegir o componer su personaje; la elección se guarda solo en su navegador. | Estudiante | Baja | Implementado | `frontend/src/app/features/character/avatar.store.ts:6` [m] |
| SIEP-RF-14 | Participación | Orientación guiada y evidencia previa | El juego debe indicar qué hacer en cada etapa y recomendar explorar antes de decidir, sin bloquear la decisión. | Estudiante | Media | Implementado | `frontend/src/app/features/simulator/orientation.config.ts:128,135` [v]; `evidence-gating.config.ts:22-45` [m] |

### B.2 Requisitos no funcionales

| ID | Categoría | Nombre | Descripción | Prioridad | Estado | Evidencia u origen |
|---|---|---|---|---|---|---|
| SIEP-RNF-01 | Seguridad | Cifrado en reposo de reflexiones | El texto de la bitácora debe guardarse cifrado (AES-GCM); solo el docente autorizado lo ve descifrado. | Alta | Implementado con riesgo (clave por defecto = `JWT_SECRET`, sin rotación) | `services/crypto_service.py:8,20-30` [v]; riesgo `settings/base.py:112-116` [m] |
| SIEP-RNF-02 | Trazabilidad | Auditoría de operaciones | Las operaciones del jugador, la autoría y el asistente deben quedar en `audit_logs` con actor, rol, IP y retención. | Alta | Parcial (28 acciones; no cubre login, usuarios, grupos, rúbricas, reportes; retención 360 d) | `services/audit_service.py:86,93` [v]; cobertura `audit_service` [m] |
| SIEP-RNF-03 | Seguridad | Secretos y entornos | Producción debe rechazar arrancar sin `DJANGO_SECRET_KEY` real, `JWT_SECRET` y credenciales de BD; las pruebas deben aislarse de la BD de desarrollo. | Alta | Parcial (no valida fuerza ni la contraseña de importados) | `psychosim/settings/production.py:21,56-64` [v]; `settings/test.py:41-74` [m] |
| SIEP-RNF-04 | Seguridad | Rol vivo y alcance por objeto | El rol y el estado activo deben leerse de la BD en cada petición y cada recurso debe filtrarse por propietario (grupo, intento). | Alta | Parcial (reportes sin alcance por docente; staff ve intentos con token) | `shared/permissions.py:5-7` [v]; `apps/reportes/views.py:22,29,37` [v]; `reportes/services.py:155-168` [v] |
| SIEP-RNF-05 | Privacidad | Anonimización de vistas docentes | El panel docente debe mostrar alias en lugar de identidad, y las exportaciones no incluir texto libre sensible por defecto. | Alta | Parcial (alias en traza; los reportes muestran nombres) | `services/instructor_service.py:29` [v]; `reportes/services.py:34-35,115` [m] |
| SIEP-RNF-06 | Mantenibilidad | Compuertas de calidad en CI | Cada cambio debe pasar escaneo de secretos, auditoría de dependencias, pruebas de backend, frontend y e2e (incluida Axe). | Media | Implementado | `.github/workflows/ci.yml:24-157` [m]; nocturno `e2e-full-case.yml:14` [m] |
| SIEP-RNF-07 | Datos | Compatibilidad con esquema heredado | Los modelos deben mapear el esquema existente sin migraciones destructivas; el esquema de despliegue lo fija un volcado SQL. | Media | Parcial (25 modelos `managed=False`, 2 gestionados; el contenedor no corre `migrate`) | `apps/users/models.py` y `apps/grupos/models.py` (4 `managed=False`) [v]; `deploy/db_seed.sql` [m] |
| SIEP-RNF-08 | Rendimiento | Presupuesto del cliente de juego | El lienzo debe usar zoom entero que muestre al menos el 75 % de la sala y el paquete inicial no superar 850 kB / 1,4 MB. | Baja | Implementado | `frontend/src/app/features/simulator/pixel-scale.util.ts:31-38` [m]; `frontend/angular.json:31` [m] |

### B.3 Reglas de negocio

| ID | Categoría | Regla | Prioridad | Estado | Evidencia u origen |
|---|---|---|---|---|---|
| SIEP-RN-01 | Seguridad del estudiante | La salida segura siempre debe estar al alcance del estudiante en cualquier estado del caso; salir pausa, no cierra. | Alta | Cumplida (REGLA-004). Excepción: bajo el aviso ETH-01 Esc no pausa; `REPLACED` no es salida segura | `game_service.py:453` [v]; `orientation.config.ts:135` [v]; `docs/PLAN_MAESTRO_TOTAL.md:31-32` [v] |
| SIEP-RN-02 | Versionado | Una versión publicada no se modifica: solo se clona. | Alta | Parcial: cumplida en la API (`ensure_draft`), rota por la semilla que reescribe en sitio la v2.0.0 y borra sus intentos | `services/authoring/guards.py:28-30` [v]; `management/commands/seed_caso_pdf.py:1144-1176` [v] |
| SIEP-RN-03 | Auditoría | El registro de auditoría nunca debe interrumpir la operación que audita. | Media | Cumplida en efecto, por decorador y no por señales como dice REGLA-006 | `services/audit_service.py:88-100` [v] |
| SIEP-RN-04 | Publicación | Un caso solo se publica con la lista de verificación al 100 % y la validación del mundo sin errores. | Alta | Cumplida (REGLA-012). La casilla ética es autodeclarada; «salida segura» = cualquier objeto EXIT | `authoring/publication.py:61-82` [v]; `world_validation.py:159-160` [v] |
| SIEP-RN-05 | Concurrencia | Una edición con revisión desfasada debe responder 409 (bloqueo optimista). | Media | Nominal: nada incrementa `version`; omitir `revision` salta la comprobación | `authoring/world_definition.py:118-119,153` [v] (REGLA-011) |
| SIEP-RN-06 | Roles | Solo el administrador crea, edita, valida y publica casos; el profesor solo asigna versiones publicadas. | Alta | Implementado; contradice RF-05 de la línea base | `views/authoring_views.py:24` [v]; `grupos/services.py:562` [v] |
| SIEP-RN-07 | Retroalimentación | La primera respuesta riesgosa, inadecuada o prohibida de una escena no se aplica ni avanza; la segunda se registra. | Alta | Implementado | `game_service.py:377-379` [v]; `decision_effects.py` [m] |
| SIEP-RN-08 | Reflexión | La bitácora se bloquea al completar o reemplazar el intento; se permite editar mientras el intento juega. | Media | Implementado | `game_service.py:154,410,439-445` [v] |
| SIEP-RN-09 | Reintentos | Iniciar con `forceNew` cierra el intento abierto como `REPLACED` y no puntúa; sin `forceNew` se devuelve el abierto. | Media | Implementado; tensiona RN-07 de la línea base | `game_service.py:154-161` [v] |

### B.4 Casos de uso

| ID | Caso de uso | Actor principal | Objetivo | RF relacionados | Estado | Evidencia |
|---|---|---|---|---|---|---|
| SIEP-CU-01 | Pausar y reanudar intento | Estudiante | Salir de forma segura y retomar el mismo intento. | SIEP-RF-01, RF-19 | Implementado | `game_service.py:453-486` [v] |
| SIEP-CU-02 | Solicitar acceso | Visitante / Administrador | Pedir una cuenta y que el administrador la atienda. | SIEP-RF-10, RF-03 | Implementado | `access_request_service.py:41-61` [m] |
| SIEP-CU-03 | Importar estudiantes a un grupo | Profesor | Dar de alta y vincular estudiantes desde un `.xlsx`. | SIEP-RF-09, RF-04 | Implementado | `grupos/services.py:423` [v] |
| SIEP-CU-04 | Gestionar rúbricas y calificar intento | Profesor | Definir criterios con pesos, asignarlos y calificar un intento. | SIEP-RF-06, RF-22, RF-25 | Implementado (UI y API con contrato roto: 0 contra 1.0) | `rubric_service.py:418` [v]; `instructor-trace.component.ts:462-464` [m] |
| SIEP-CU-05 | Clonar versión y editar el mundo | Administrador | Preparar una versión nueva de un caso publicado. | SIEP-RF-07, SIEP-RF-08, RF-05..RF-13 | Implementado | `publication.py:89-111` [v] |

### B.5 Qué reglas de oro están rotas o nominales

| Regla | Veredicto | Motivo |
|---|---|---|
| REGLA-002 sin migraciones | Rota en la práctica | `users/models.py:111-125` y `progression/models.py:19` gestionados; dos tablas nacen por `RunSQL` [m] |
| REGLA-005 publicadas no se mutan | Rota por la semilla | `seed_caso_pdf.py:1144-1176` [v] |
| REGLA-006 audit por señales | Nominal en mecanismo | Decorador, no señales; solo `attempt_completed` usa señal [m] |
| REGLA-010 CSS dentro de `.game-container` | Aproximada | Reglas globales `body.game-mode` en `styles/styles.scss:761-807` [m] |
| REGLA-011 bloqueo optimista | Nominal | `world_definition.py:118-119,153` [v] |
| REGLA-009 zoom 2x | Distinta | Zoom entero adaptativo, `pixel-scale.util.ts:31-38` [m] |
| REGLA-001, 003, 004, 008, 012 | Cumplidas | Ver tabla C |
| REGLA-007 repo privado | No verificable | No se decide leyendo código |

---

## C. Tabla de equivalencias

Relación: **igual** (misma exigencia), **extiende** (cubre la de la línea base y añade), **contradice** (choca con una cláusula), **sin equivalente**.

### C.1 Requisitos de negocio, RF-027 y RNF del equipo

| ID antiguo | Título | Equivale a | Relación | Observación |
|---|---|---|---|---|
| RQ-NEG-001 | Reducir brecha teoría-práctica con simulaciones multi-caso | RF-05, RF-17 + SIEP-RF-04 | extiende | Objetivo medible (≥15 % pre/post) que la línea base no tiene; hoy un solo caso publicado y sin medición pre/post [m] |
| RQ-NEG-002 | Entrenar competencias transferibles | RF-22, RN-09 + SIEP-RF-06 | extiende | `competency` es texto libre; no hay modelo de competencias [m] |
| RQ-NEG-003 | Enfoque ético y de derechos | RN-01 + SIEP-RN-01, SIEP-RF-05 | extiende | La línea base solo dice «no clínico»; la meta −20 % intento 1 vs 2 no se mide [m] |
| RQ-NEG-004 | Aprendizaje activo y reflexión | RF-20, RF-23 + SIEP-RN-08 | extiende | Meta ≥85 % de satisfacción: no hay encuesta en la app [m] |
| RQ-NEG-005 | Evaluación formativa y seguimiento docente | RF-22, RF-25, RN-09 + SIEP-RF-06 | extiende | **Tensión con RN-09**: rúbrica con total 1.00-5.00 (`rubric_service.py:418,425-429` [v]) es una nota numérica; RN-09 prohíbe «nota oficial 0,0 a 5,0» |
| RQ-NEG-006 | Analíticas para mejora continua | RF-25, RF-26 | extiende | Meta «≤3 clics» no medida; reportes sin alcance por docente [v] |
| RQ-NEG-007 | Escalar catálogo con reutilización y versionamiento | RF-13, RNF-07 + SIEP-RF-07 | extiende | Variante en ≤4 h reutilizando ≥60 %: un 2.º caso exige generalizar (bloque J) |
| RQ-NEG-008 | Validación interdisciplinar antes de publicar | RF-12, RF-13, RN-05 + SIEP-RN-04 | extiende | Aprobación por rol no existe; `IN_REVIEW` sin transición (`publication.py:61-70` [v]); publica solo ADMIN |
| RF-027 | Asistencia inteligente contextual | SIEP-RF-G-01 (reservado); toca RF-18 | sin equivalente | Backend apagado por defecto, sin pantalla, solo estudiante (`ai_assistant.py:33,51` [v]); no hay RF similar en la línea base |
| RNF-001 | Navegación guiada y consistencia multi-caso | RNF-03, RNF-04 + SIEP-RF-14 | extiende | Prueba n≥10 no hecha |
| RNF-002 | Control de acceso por rol y mínimo privilegio | RF-02 + SIEP-RNF-04 | igual (RF-02) / extiende | **Colisión**: «RNF-02» de la línea base = comunicación segura; este ID es el RF-02 de la línea base |
| RNF-003 | Minimización y protección de datos | SIEP-RNF-05, SIEP-RNF-01 | sin equivalente | La línea base no trata privacidad; bitácoras sí excluidas de agregados (`reportes/services.py:72-75` [m]) |
| RNF-004 | Accesibilidad WCAG 2.1 AA | RNF-04 | extiende | Mismo número; el equipo fija WCAG 2.1 AA, contraste 4,5:1 y NVDA/VoiceOver (sin prueba con lector real) |
| RNF-005 | Tiempo de respuesta de escenas y herramientas | RNF-05 | extiende | Cifras p95 que la línea base deja «por medir»; sin pruebas de carga |
| RNF-006 | Disponibilidad en periodos académicos | RNF-06 | extiende | Misma numeración; sin endpoint de salud ni medición |
| RNF-007 | Auditoría de eventos y accesos | SIEP-RNF-02 | sin equivalente | **Colisión**: RNF-07 de la línea base = separación de componentes. Retención 360 d contra ≥12 meses |
| RNF-008 | Contenido modular y versionado | RNF-07 (parcial), RNF-08 + SIEP-RF-07 | extiende | **Colisión**: RNF-08 de la línea base = integridad de datos. Efectos, métricas y finales siguen en código |
| RNF-009 | Crecimiento de catálogo y concurrencia | RNF-05, RNF-06 | extiende | Sin equivalente directo; ningún `select_for_update` en simulación [m] |
| RNF-010 | Gestión ética de contenidos sensibles | SIEP-RN-01, SIEP-RF-05, RN-01 | sin equivalente | **Colisión doble**: en `PROMPT_MIGRACION_DJANGO.md:127` [v] «RNF-010» es «no regresión de datos» (origen de REGLA-002 y de `managed=False`) |

### C.2 Reglas de oro del plan maestro

| ID antiguo | Título | Equivale a | Relación | Observación |
|---|---|---|---|---|
| REGLA-001 | No tocar `backend/` (Spring) | — | sin equivalente | Restricción de proceso, no del sistema; ya sin objeto (no existe `backend/`) [m] |
| REGLA-002 | Sin migraciones Django | SIEP-RNF-07 | extiende | Rota en la práctica (ver B.5); coincide con RNF-08 (integridad) solo en espíritu |
| REGLA-003 | `ScenarioConfig` coexiste con lo guiado por BD | RNF-07 (separación) | sin equivalente | Restricción técnica del cliente; cumplida [m] |
| REGLA-004 | Salida segura siempre alcanzable | SIEP-RN-01, SIEP-RF-01 | sin equivalente | La línea base no tiene salida segura ni pausa; RF-19 solo guarda progreso |
| REGLA-005 | Versiones publicadas inmutables | SIEP-RN-02; relacionada con RN-03 | extiende | La línea base solo exige publicar antes de usar |
| REGLA-006 | Auditoría no interrumpe | SIEP-RN-03, SIEP-RNF-02 | sin equivalente | Línea base sin auditoría |
| REGLA-007 | Repositorio privado | — | sin equivalente | Restricción de proceso; no verificable desde el código |
| REGLA-008 | Avatar solo en `localStorage` | SIEP-RF-13 | sin equivalente | Cumplida (`avatar.store.ts:6` [m]) |
| REGLA-009 | Phaser `pixelArt`, `roundPixels`, zoom 2x | SIEP-RNF-08 | sin equivalente | Restricción técnica; zoom no es fijo |
| REGLA-010 | CSS del juego scoped | — | sin equivalente | Restricción técnica; aproximada |
| REGLA-011 | Bloqueo optimista con `version` | SIEP-RN-05; RNF-08 (integridad) | extiende | Nominal |
| REGLA-012 | Publicar solo con validación limpia | RN-05 + SIEP-RN-04 | igual (en espíritu) | RN-05 también dice «ni ejecutarse»: la validación no se corre al ejecutar (`authoring-de-casos.md`, límite de validación [m]) |

### C.3 Colisiones de numeración, resumen

| Número | Línea base | Catálogo del equipo | Histórico `PROMPT_MIGRACION_DJANGO.md` |
|---|---|---|---|
| RNF-02 / RNF-002 | Comunicación segura | Control de acceso por rol | — |
| RNF-07 / RNF-007 | Separación de componentes | Auditoría de eventos | — |
| RNF-08 / RNF-008 | Integridad de la información | Contenido modular y versionado | — |
| RNF-010 | no existe | Gestión ética de contenidos sensibles | No regresión de datos |
| RQ-NEG-00n | no existe | Objetivos medibles de negocio | Otros 8 requisitos con otro sentido |
| RF-027 | no existe (RF-01..26) | Asistente IA | — |

Los RNF-004, 005 y 006 del equipo coinciden en tema con RNF-04, 05 y 06 de la línea base; RNF-001 y RNF-003 no tienen homólogo.

---

## D. Ubicación de las propuestas C, E, F, G y J respecto de la línea base

Fuentes: `docs/pendientes/propuestas/propuestas-c-e-f-resumen.md` [v], `bloque-g-asistente-ia.md` [v] y `bloque-j-escenario-hogar-consultorio.md` [v] (cabeceras y resumen). Todas son «para decidir»; nada está implementado.

| Prop. | Qué propone | Toca (línea base) | Extiende | Contradice o tensiona | Observación |
|---|---|---|---|---|---|
| C | Ritmo del habla y retrato por emoción; sin color, temblor ni cuenta atrás | RF-17, RF-16; RN-08 (consecuencia vs pedagogía); RNF-04 | RF-17 (presentación del diálogo) | Tensiona RNF-04 (por eso evita temblor y glitch) y RN-08 si la etiqueta de emoción adelanta retroalimentación (pregunta C-P2) | No guarda estado ni mueve indicadores: se mantiene fuera de RN-09 |
| E | Mapa guiado de la red de apoyo, lista primero, marcas del estudiante y comparación | RF-17, RF-20, RF-21, RF-25; RN-01, RN-06, RN-09; CU-08, CU-14 | RF-21 (nuevos eventos de línea de tiempo), RF-25 (vista docente), RF-20 (marcas como reflexión) | Tensiona RN-01 (valorar riesgo no es diagnosticar) y RNF-08 (escritura concurrente de `flags_json`, pieza 0c) | Exige Psicología; sin cambio de esquema |
| F | Entrevistas por turnos (2-4 intercambios), 4 niveles de tensión, reparación, sin reloj | RF-08, RF-09, RF-17, RF-21, RF-25; RN-02, RN-08, RN-11 | RF-17, RF-21, RF-25 | **Tensiona RN-02/RF-09** (varios intercambios dentro de una escena, no un salto por opción) y RN-08 (reacción inmediata) | Necesita nuevo tipo de decisión «turno»; M1 y M9 de `SIM-VBG-001` |
| G | Ayuda curada (30-50 entradas); IA opcional solo tras decidir y con concepto jurídico (Ley 1581/2012); tope 10 por intento y 30 por día | RF-18, RF-10, RF-23, RF-25; RN-01, RN-08; RNF-01 (credenciales) | RF-18 (pistas), RF-23 (retroalimentación) | Tensiona RN-08 (no revelar antes de decidir; hoy lo dicta el navegador, `ai_assistant.py:33-39` [v]) y exige reinterpretar RF-027 | Docente sin IA con datos de estudiantes; la ruta existe pero apagada |
| J | 2.º caso (consultorio de primera escucha); antes, generalizar finales, métricas, aviso e introducción | RF-05..RF-13, RF-15, RF-16, RF-22; RN-02, RN-03, RN-05, RN-09; CU-04, CU-05 | RF-05, RF-12, RF-13 (a escala) | **Contradice RF-05** si lo autora el profesor (SIEP-RN-06 = solo ADMIN); tensiona RF-16 (introducción atada a `hospital-urgencias`), RF-22 y RN-09 (final calculado por código, `case_effects.py:289-341` [m]) | Un 2.º caso con la lógica actual terminaría casi siempre «crítico» o «riesgo persistente» |

**Reservas de IDs** (A.3) por propuesta: C (`SIEP-RF-C-*`), E, F, G, J; sin nuevos CU hasta que se aprueben; ninguna propuesta pide cambiar RN-01..RN-11 pero F y G piden aclarar RN-02 y RN-08.

---
