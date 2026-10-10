# Prompt maestro — sesión «Requisitos, reglas de negocio y taller de DSL» (SIEP)

> **Cómo usarlo.** Abre una sesión nueva de Claude Code en `D:\Sua_Files\IdeaProjects\psico_project_v3`, pega este archivo completo como primer mensaje y deja que la sesión lea los archivos que cita. Fecha de corte: **2026-10-10**. Base: `master` @ `53fd03a` (limpieza del repositorio fusionada, etiqueta `pre-limpieza-2026-10`) más la rama `docs/documento-maestro-unificado`, que trae la línea base y los borradores de este trabajo.
>
> **Contexto de continuidad.** La sesión anterior (limpieza y documento maestro) se interrumpió por el límite semanal de uso, con tres cosas a medias: el mapa verificado del sistema (13 áreas escritas, sin verificación adversarial completa), el contraste con la línea base (agentes evaluadores terminados, síntesis sin hacer) y el borrador del taller de DSL. Todo lo que existe está en el repo (ver §4). **No lo rehagas desde cero: parte de ahí, verifica y completa.**

---

## 1. Quién eres y qué se te pide

Eres la sesión de **ingeniería de requisitos y reglas de negocio** de SIEP (Sistema de Entrenamiento Psicosocial, Corporación Universitaria Empresarial Alexander von Humboldt). Trabajas con **Juan José Sua Gómez** (usuario) y su equipo: Emerson Ángel Gómez, Esteban Bonilla y Santiago Leyton (4.º semestre, CUE Armenia).

El proyecto nuclear de SIEP ganó el mejor proyecto nuclear de la carrera en 3.er semestre. En 4.º la carrera **unificó requisitos funcionales, no funcionales, reglas de negocio y casos de uso entre todos los equipos** (`docs/requisitos/baseline-pn3/`, «versión académica inicial»). Esa línea base es lo **mínimo obligatorio**; SIEP es más amplio y puede (y debe) tener **más** reglas, funcionalidades y requisitos propios.

Tu misión, en este orden de prioridad:

| # | Frente | Resultado esperado |
|---|---|---|
| **0** | **Taller de DSL** de Ingeniería de Software II (urgente, «lo antes posible») | Fases 1, 3 y 4 revisadas, completas y listas para entregar (§3) |
| **1** | **Línea base PN3 ↔ sistema** | Matriz de cumplimiento con evidencia, conflictos y decisiones, glosario, catálogo de extensiones propias de SIEP |
| **2** | **Propuestas C, E, F, G y J** (hay que elaborarlas lo antes posible) | Cada una convertida en requisitos formales y especificación lista para decidir/implementar (§5) |
| **3** | **Cierre de brechas** | Cambios de código con TDD, en PR pequeños, solo tras aprobar las decisiones (§6) |
| **4** | **Trazabilidad viva** | Pruebas y código que citan IDs; matriz regenerable (§7) |

---

## 2. Qué es SIEP hoy (verificado el 2026-10-10; manda el código)

- **Producto:** simulador de casos psicosociales (RPG clínico top-down 2.5D). El estudiante explora salas, dialoga con NPC, decide y recibe retroalimentación; el docente revisa. Es formativo, no diagnóstico ni examen.
- **Stack:** Django 6.1 + DRF 3.18, JWT (simplejwt), psycopg 3, PostgreSQL (16 dev / 18 pruebas); Angular 22 (Signals) + Phaser 4 + Konva; Node 24, Python 3.12–3.14. Monorepo `psico_project_v3` (`backend_django/`, `frontend/`, `deploy/`, `scripts/`, `tools/`, `docs/`). Despliegue en Railway (imagen única).
- **Roles:** ADMIN, PROFESOR, ESTUDIANTE. Un único caso sembrado: `SIM-VBG-001` (8 nodos, 6 bloques de decisión, 19 opciones, 5 herramientas).
- **Esquema de BD:** modelos mayormente `managed=False`; el esquema sale de `deploy/db_seed.sql` y de `deploy/upgrades/*.sql` (convención para BDs ya restauradas) con una prueba de contrato que cruza los CHECK. **Un cambio de esquema nunca es trivial: decídelo con el usuario.**
- **Calidad:** backend 857 pruebas, frontend 2383 en 179 archivos, e2e 35; CI de 6 jobs (secretos, vulnerabilidades, scripts, backend, frontend, e2e). El CI no corre en `push` a ramas, solo en PR y en `master`.
- **Lee primero, en este orden:** `README.md`, `docs/README.md` (índice), `docs/PROMPT_MAESTRO.md` (con su aviso de vigencia; el documento maestro unificado está en `docs/informes/2026-10-10-mapa-del-sistema/secciones/` hasta que se redacte), y las secciones de ese directorio que toquen tu frente.

### Reglas del proyecto que ningún cambio puede romper (`docs/PLAN_MAESTRO_TOTAL.md`)
Salida segura siempre alcanzable (REGLA-004); versiones `PUBLISHED` no se mutan (005); auditoría no interrumpe la operación (006); bloqueo optimista con 409 (011, hoy nominal); publicar solo con validación limpia (012). La 002 («sin migraciones Django») está rota en la práctica: `progression` y `AccessRequest` son gestionados. No cites `RNF-010` como «cambio de esquema»: en el catálogo del equipo significa **gestión ética de contenidos sensibles**.

---

## 3. Frente 0 — Taller de DSL (Ingeniería de Software II)

**Enunciado literal:** `docs/informes/2026-10-10-mapa-del-sistema/herramientas/taller_dsl_enunciado.txt` (extraído del docx «Taller: Diseño de un DSL para la Gestión de Casos Situacionales del Simulador de Psicología Social – Equipo Emerson»). Los docentes **no entregaron definición del DSL**: lo diseña el equipo.

**Reparto:** Juan José Sua y Emerson Ángel Gómez entregan **Fases 1, 3 y 4**; Esteban Bonilla y Santiago Leyton entregan la **Fase 2** (≥ 5 reglas OCL). Por eso las reglas se numeran **OCL-01 a OCL-08 en el orden en que las lista el enunciado** (1 caso con ≥ 1 escena · 2 decisión con ≥ 2 opciones · 3 opción referencia escena existente · 4 una escena no tiene dos decisiones con el mismo id · 5 herramienta usada en una escena está definida en el caso · 6 retroalimentación asociada a decisión u opción · 7 caso con título y descripción · 8 caso con ≥ 1 punto de decisión); el ejemplo del enunciado usa OCL-02, OCL-03 y OCL-05 con ese significado. **Coordina con ellos la numeración final antes de entregar.**

| Fase | Entregable | Estado del borrador |
|---|---|---|
| 1 | Diagrama UML de clases (mínimo: Caso, Escena, Personaje, Decisión, OpciónDecisión, Herramienta, Retroalimentación, Bitácora, Evaluación) con atributos, relaciones, cardinalidades, responsabilidades y ≥ 3 invariantes | Borrador en `docs/diseno/dsl/` si el workflow `taller-dsl` terminó; si no, regenerar con `herramientas/wf4-taller-dsl.js` |
| 3 | Sintaxis concreta en JSON propia del dominio (+ JSON Schema) | ídem |
| 4 | `simulador_psicologia_social.json` con un caso válido (≥ 2 personajes, 2 escenas, 1 decisión, 2 opciones, 1 herramienta, 1 retroalimentación) y un caso con ≥ 3 reglas incumplidas, más la tabla Error · Regla · Elemento · Solución | ídem, con validador ejecutable y pruebas |

**Criterios de calidad:** el modelo y el JSON deben reflejar el dominio **real** de SIEP (nodo + sala = escena; NPC = objeto PERSON; herramientas TOOL; opciones ADEQUATE/RISKY/INADEQUATE; finales = nodos terminales) y poder expresar la línea base (RF-05 a RF-13, RN-02, RN-03, RN-05, RN-08, RN-09, RN-11). SIEP **no tiene hoy DSL, JSON Schema ni import/export de casos** (`secciones/autoria-de-casos.md`): este DSL es además la base para cumplir RF-12 y RN-05.

---

## 4. Insumos que ya existen (no los rehagas)

| Qué | Dónde |
|---|---|
| Línea base PN3 fiel al Excel (4 tablas) + el `.xlsx` original y su SHA-256 | `docs/requisitos/baseline-pn3/` |
| Mapa del sistema vigente por área (13 secciones con evidencia `ruta:línea`; **pendiente de verificación adversarial**) | `docs/informes/2026-10-10-mapa-del-sistema/secciones/` |
| Scripts de los workflows (mapa, contraste, documento maestro, taller DSL) y utilidades (volcado de xlsx y docx, herramienta de limpieza) | `docs/informes/2026-10-10-mapa-del-sistema/herramientas/` |
| Catálogo previo del equipo (RQ-NEG-001..008, RF-027, RNF-001..010, 8 técnicas) | `docs/requisitos/{negocio,funcionales,no-funcionales,elicitacion}/` |
| Equivalencias, brechas y extensiones candidatas (texto de partida) | `docs/informes/2026-10-02-brechas-plan-maestro-total.md` y `docs/historico/` |

**Para volver a ejecutar un workflow:** los scripts apuntan al scratchpad de la sesión anterior; cambia las constantes `ROOT` y `SCRATCH` (rutas) y pasa `model: 'claude-sonnet-5-5'` en cada `agent()` (el usuario pidió explícitamente Sonnet 5.5; por defecto heredaban `claude-sonnet-5`). **Reanudar con `resumeFromRunId` solo sirve dentro de la misma sesión.**

---

## 5. Hallazgos de partida: dónde el sistema choca con la línea base

Salen del mapa del sistema (lectores con evidencia; **vuelve a verificar cada uno antes de actuar**). Es la lista corta; la matriz completa de 60 ítems es el trabajo del Frente 1.

| Ítem de la línea base | Qué hace SIEP hoy | Evidencia |
|---|---|---|
| **RN-07** no iniciar otro intento con uno en curso · **RN-06** no reemplazar intentos | `forceNew=true` cierra los abiertos como `REPLACED` y crea otro; sin `forceNew` devuelve el abierto | `simulation/services/game_service.py:142-157,166-202` |
| **RF-05..RF-11, CU-04** el profesor crea y gestiona casos | Solo ADMIN autora, valida y publica; el profesor recibe 403 y solo asigna versiones publicadas | `simulation/views/authoring_views.py:23-24`; `tests/test_authoring.py:55-56` |
| **RN-10** solo el administrador crea cuentas | El profesor da de alta estudiantes por importación `.xlsx` (contraseña compartida) | `grupos/services.py:422-465`; `users/views.py:199-204` |
| **RF-13** cambiar entre borrador, publicado y archivado | La API solo mueve DRAFT → PUBLISHED; ARCHIVED e IN_REVIEW existen en el enum sin ruta | `authoring/publication.py:82-84` |
| **RF-14** asignar a grupos **o estudiantes**, con fechas de apertura y cierre | Solo a grupos; sin asignación individual ni ventanas de tiempo | `grupos/services.py:562-582`; tabla `grupo_case_version` |
| **RF-10 / RN-08** retroalimentación pedagógica con fundamento teórico **al finalizar**; la consecuencia, en el momento | Un único texto libre por opción, que se devuelve **en la respuesta de cada decisión**; sin campo de fundamento teórico | `decision_effects.py:72-80`; `game_dtos.py:80-95` |
| **RF-11 / RF-18** ayudas o pistas autorables y consultables | No hay entidad de pista; hay `supportResources`/`warningMessage`, objetos TOOL y NPC; asistente IA apagado | `authoring/graph.py:44-56`; `views/ai_assistant.py:33-34` |
| **RF-12 / RN-05** validar contra el DSL; sin DSL no se publica ni ejecuta | No hay DSL; hay validación pura al publicar, **no se repite al ejecutar** | `services/world_validation.py`; `authoring/publication.py:57-85` |
| **RF-01** iniciar y cerrar sesión | Cerrar sesión solo borra el token en el cliente; sin refresh ni revocación | `core/auth/auth.service.ts:64-80` |
| **RF-22 / RN-09** valorar con la rúbrica del caso, sin nota oficial 0,0–5,0 | Puntaje acumulado sin tope y valoración docente manual con rúbrica; el copy de «puntaje» es pregunta abierta a Psicología | `rubric_service.py`; informe de jugabilidad pregunta 6 |
| **RF-25 / RF-26** el profesor revisa **sus** estudiantes y reporta | La traza respeta grupos; **los reportes de grupo no comprueban propiedad** (cualquier profesor ve cualquier grupo) | `reportes/services.py:155-168` |
| **RNF-05, RNF-06** | Sin mediciones ni monitoreo | — |

---

## 6. Método de trabajo

1. **Línea base inmutable.** `baseline-pn3/` es la fuente: no se edita a mano; si el Excel cambia, se regenera (`herramientas/xlsx_dump.py` + `tsv_to_md.py`) y se anota el cambio con el nuevo SHA.
2. **IDs sin colisión.** Mantén los IDs de la línea base intactos (`RF-01`, `RN-07`…). Propón para las extensiones propias un esquema que no choque (por ejemplo `SIEP-RF-01`, `SIEP-RN-01`) y una **tabla de equivalencias** con los IDs antiguos del equipo (`RQ-NEG-xxx`, `RF-027`, `RNF-010` y `REGLA-xxx`). **Decisión del usuario.**
3. **Evaluación por cláusulas.** Cada requisito se descompone en cláusulas (quién, qué, cuándo, restricción) y cada una recibe veredicto `cumple | parcial | no_cumple | conflicto | no_verificable` con evidencia `ruta:línea`. El del ítem es el peor de las cláusulas relevantes.
4. **Verificación adversarial.** Todo veredicto «cumple» y todo «conflicto» pasa por dos revisores con lentes opuestos (falso cumple / falso incumple). Lo no verificable leyendo código se dice y se indica cómo verificarlo.
5. **Workflows (Ultracode).** Para trabajo amplio usa la herramienta `Workflow` con `model: 'claude-sonnet-5-5'`; escribe los resultados en archivos y devuelve solo resúmenes.
6. **Git y PR.** Una rama por tema desde `master` en un worktree bajo `.worktrees/`; PR pequeños; fusión **con merge commit, nunca squash**; **nunca `--force` ni `--no-verify`**; nada directo a `master`; fusiona solo con el «sí» explícito del usuario. Commits en español (Conventional Commits) que terminan en `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; cuerpos de PR terminan en `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Referencias a PR como enlace con URL completa.
7. **Código con TDD.** Primero una prueba que falle por la razón correcta; mínima implementación; la suite del proyecto completa antes de dar algo por hecho (`npm run test:scripts`, `test:backend`, `test:frontend`, `build:frontend`, `test:e2e`). Cambios de esquema por `deploy/upgrades/` + volcado + prueba de contrato.
8. **Documentos.** Ciclo de vida en `docs/README.md`. Diagramas en Mermaid (`.mmd` + PNG). Evidencia reproducible, no capturas sueltas.

---

## 7. Frentes 2, 3 y 4 en detalle

**Frente 2 — Propuestas C, E, F, G, J** (`docs/pendientes/propuestas/`; resumen en `propuestas-c-e-f-resumen.md`). Para cada una produce: requisitos formales (RF/RNF/RN/CU con el formato de la línea base), su ubicación respecto de la línea base (qué RF extiende o contradice), criterios de aceptación, riesgos éticos y las **decisiones que bloquean** con su valor por defecto. Ojo con:
- **G (asistente IA / RF-027):** la línea base pide ayudas **autorables por el profesor** (RF-11, RF-18); la propuesta recomienda ayuda curada y IA opcional solo tras concepto jurídico (Ley 1581/2012). Reconcilia ambas.
- **C/E/F:** contenido clínico sobre violencia de género: lo redacta y valida Psicología; sin color de alarma, temblor, reloj ni reflejos; sin la niña fallecida ni la persona agresora como piezas del juego; pausa segura siempre visible.
- **J (segundo caso):** antes hay que generalizar finales, métricas, aviso e introducción, hoy atados a `SIM-VBG-001`; el DSL del Frente 0 es parte de la solución.
- Fase 0 compartida de C/E/F (6–10 d): 0a y 0b ya están; faltan 0c (escritor con bloqueo del estado del caso), 0d y 0e.

**Frente 3 — Brechas.** Ordena por impacto sobre la línea base, riesgo y esfuerzo. Candidatas obvias (confirmar): comprobar propiedad en reportes (cambio pequeño, alto valor) · decidir qué hace `forceNew` frente a RN-07 · rol de autoría (¿profesor?) · archivar casos · asignación individual y ventanas · separar consecuencia inmediata de retroalimentación pedagógica al final · entidad de ayuda/pista · import/export del caso en el DSL con validación al ejecutar.

**Frente 4 — Trazabilidad.** Hoy solo `RF-027` se cita en código y ninguna prueba cita un ID. Propón marcadores (`@pytest.mark.req("RN-07")`, `describe("RN-07 …")`) y un script que regenere la matriz desde ellos.

---

## 8. Decisiones que necesitas del usuario (con valor por defecto recomendado)

| # | Decisión | Por defecto recomendado |
|---|---|---|
| 1 | Esquema de IDs de las extensiones propias | `SIEP-RF-nn`, `SIEP-RNF-nn`, `SIEP-RN-nn`, `SIEP-CU-nn`; línea base sin tocar |
| 2 | RN-07 vs `forceNew` | Sin `forceNew` por defecto: el estudiante debe pausar o terminar; `REPLACED` solo por acción docente |
| 3 | ¿El profesor puede autorar casos (RF-05..11)? | Sí, con revisión y publicación por ADMIN (rol revisor); evita bloquear a los profesores |
| 4 | RN-10 vs importación de estudiantes | Mantener la importación pero con cuentas **pendientes de activación** que el ADMIN aprueba |
| 5 | RF-14 asignación individual y fechas | Implementar en dos pasos: fechas por grupo; individual después |
| 6 | RF-10/RN-08 feedback al final | Ocultar `immediate_feedback` hasta el cierre y mostrar solo la consecuencia narrativa |
| 7 | ¿Se publica el `.xlsx` en el repo? | Sí (`baseline-pn3/`), ya está |
| 8 | Alcance del DSL | Formato de intercambio + validador de publicación; no reemplaza la BD |

---

## 9. Trampas conocidas (Windows y entorno)

- El **PATH de Bash está roto**: usa PowerShell o las herramientas Read/Grep/Glob. Python: `C:\Python313\python.exe` (el de la Microsoft Store crea venvs rotos).
- Los worktrees no traen `backend_django/.venv` ni `frontend/node_modules`: enlázalos con una *junction* a los del checkout principal.
- Pruebas: base desechable (`SIEP_TEST_DB_PORT`), e2e con `E2E_CHROMIUM_PATH`; `data-player-x/y` es contrato del e2e; jest/vitest recoge `*.spec.ts` locales sin versionar.
- Fin de línea LF por `.gitattributes`; `*.ps1`/`*.cmd` en CRLF.
- No toques: `docs/CONTEXTO_COMPLETO_SIEP.md` ni `docs/PROMPT_MAESTRO_SIEP_PROFESIONAL.md` (sin versionar, del usuario), ni los worktrees de otras sesiones (`.claude/worktrees/*`, `.worktrees/actualizar-stack`).
- El CI es de pago por minutos: no lo sondees; el monitor de la app avisa de fallos.
- Nunca copies secretos (contraseñas demo, claves) a documentos; cita solo el nombre de la variable.

---

## 10. Definición de hecho

- **Frente 0:** las tres fases del taller revisadas por el usuario y por Emerson, con el validador pasando sus pruebas y la numeración OCL acordada con la Fase 2.
- **Frente 1:** los 60 ítems con veredicto y evidencia, conflictos con opciones y recomendación, glosario, catálogo de extensiones con tabla de equivalencias y las decisiones de §8 respondidas.
- **Frente 2:** cada propuesta con requisitos formales y preguntas cerradas para Psicología.
- Todo en PR pequeños, con CI en verde y «sí» del usuario antes de fusionar. Al terminar cada frente, actualiza la memoria del proyecto y `docs/README.md`.
