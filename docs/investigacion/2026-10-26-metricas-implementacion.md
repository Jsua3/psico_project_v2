# Modelo de métricas: constancia de la implementación

**Fecha:** 2026-10-27 · **Estado:** implementado en la rama `claude/metricas-modelo-3dcd2a` (base `origin/master` `cfc649cd`), sin push · **Especificación:** `docs/investigacion/2026-10-24-metricas-razon-de-ser.md` y el plan `2026-10-25-metricas-plan-de-implementacion.md` (los dos viven sin commitear en el checkout principal, no en esta rama) · **Alcance:** las 22 tareas del plan, más la 4b que se añadió en el camino.

Este documento deja constancia de **qué se hizo, en qué se apartó de lo previsto y qué queda abierto**. Lo que el estudiante, el docente y la autora ven ahora está en la guía de cada pantalla; las definiciones de la analítica, en `docs/operacion/analitica-de-aprendizaje.md`; las decisiones que esperan a Psicología, en `docs/operacion/analitica-preguntas-para-psicologia.md` (preguntas 17 a 21 nuevas).

## 1. Qué cambió, en una página

| Antes | Ahora |
|---|---|
| Puntaje acumulado, índice de estrés, confianza y riesgo del intento; barras y porcentajes en el HUD, el cierre y los paneles. | **Ninguna cifra al estudiante.** Ni puntaje, ni índice de estrés, ni porcentaje; ninguna respuesta de `/api/simulation/**` los trae (la prueba `test_no_numbers_to_student.py` y su espejo en el navegador, `e2e/support/no-numbers.ts`, lo vigilan). |
| Opción con `classification` (`ADEQUATE`/`RISKY`/`INADEQUATE`), severidad y conducta prohibida por separado. | **Clase de la respuesta** de cuatro valores: Recomendada, Aceptable, Con riesgo, Contraindicada (esta exige `prohibition_reason` y es la única que enciende la alerta de revictimización). |
| «Estado de la paciente» en barras. | **La persona consultante en palabras:** vínculo (retraída · cautelosa · abierta) y activación (serena · tensa · en crisis), expresado en el retrato y en una frase. Internamente −1/0/+1 por paso, acotado. |
| La tensión de la escena nacía del índice de estrés. | **Intensidad de la escena** (`LOW`/`MEDIUM`/`HIGH`) que fija la autora; `HIGH` exige aviso previo. |
| Banderas y métricas del caso decidían cuatro finales por reglas de números. | **Hitos** del caso (`rules.milestones`, algunos «decisivos») y **finales por hitos y clases** con una plantilla automática (`critica` → `protectora` → `riesgo_persistente` → `con_brechas`), o los finales propios del caso. |
| Retroalimentación al decidir. | La decisión devuelve **solo la consecuencia** (y el aviso de reintento); lo evaluativo llega al cerrar. |
| Reporte de cierre v2 con `finalScore`, `metrics` y competencias heurísticas. | **Reporte v3:** hitos cumplidos y faltantes, persona, final con su razón, revisión decisión por decisión y niveles por competencia con la evidencia que los sostiene. |
| Rúbrica del docente con nota 1–5 y total. | **Rúbrica por niveles** (En inicio · En proceso · Logrado · Destacado) con descriptor y observación; sin número y sin total. |
| Reportes docentes con promedios y orden por puntaje. | **Cobertura por hito** del grupo con celda mínima, conteos por clase, sin orden por desempeño. |

## 2. Qué se hizo, tarea por tarea

Orden de ejecución: 1 → 2 → 3 → 4 → 4b → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 18 → 19 → 20 → 21 → 17 → 16 → 22. Un commit por tarea (más los de corrección tras la revisión). `git log cfc649cd..HEAD` los lista; 33 commits antes de este.

| Tarea | Commits | Resumen |
|---|---|---|
| 1 · Vocabulario | `6e0ee75f` | `ResponseClass`, `RiskLevel`, `Bond`, `Activation`, `Intensity`, `DEFAULT_PERSONA_STEP`, `step_persona`, etiquetas en palabras. |
| 2 · Reglas y condiciones | `796a9217` | `case_rules` (hitos, nivel de riesgo, finales), `normalize_effects`/`validate_effects` y el vocabulario de condiciones `{milestone}`, `{count: clase}`, `{persona}`. |
| 3 · Migraciones | `dd058fc8`, `2ff41411` | `0029` (columnas nuevas) y `0030` (datos: clase, hitos, persona, finales por hitos). La mediación con el agresor no es un hito: es un acto contraindicado. |
| 4 · Motor de respuestas | `5fef75d7` | `response_effects.resolve/apply`, `case_state` (hitos, persona, conteos por clase). |
| 4b · Importador 1.0 | `ec08dcea`, `b75ba759` | `casedef/legacy.py`: el documento 1.0 se convierte al modelo nuevo al importar (añadida en el camino, R-10). |
| 5 · Solo la consecuencia | `63c0ba31`, `00cc3891` | `{attempt, consequence[, retry]}`; el informe en vivo de un intento sin cerrar ya no viaja; la segunda oportunidad se concede por clase. |
| 6 · Finales | `d910bd6f` | `endings.py`: plantilla automática sobre los hitos decisivos, `reason` en palabras, un final siempre. |
| 7 · Persona e intensidad | `10bd6c19` | `persona` en el estado del intento; `intensity` por escena. |
| 8 · Competencias por clase | `189c6197`, `3a3cff69` | El nivel sale de la clase (o del nivel declarado); sin declaración no hay aporte («sin evidencia»); tope `EN_PROCESO` por una Contraindicada; `evidence[]`. |
| 9 · Reporte v3 | `c03b8813` | `schemaVersion 3`; v1 y v2 cerrados no se tocan. |
| 10 · Reglas de publicación | `c49ccf77`, `2732e97b`, `5c0e2f6d` | Seis reglas: Contraindicada sin motivo, intensidad alta sin aviso, hito inalcanzable, competencia sin evidencia, final inalcanzable, final por defecto; recorrido de alcanzabilidad con presupuesto de pasos. |
| 11 · API de autoría | `dd11f88d` | `PUT …/rules/{milestones,risk,endings}` y `responseClass` en las opciones; honran `X-Case-Revision`. |
| 12 · Documento 2.0 | `5cf7b52d`, `ed84e8a0` | `x-siep.version 2.0` con `clase`, hitos, intensidad y finales; acepta 1.0; SIM-VBG-001 regenerado (11 hitos, 3 decisivos). |
| 13 · Reportes docentes | `816eb43d` | Cobertura por hito con celda mínima, conteos por clase, persona por escena, `systemEvaluation` plegada. |
| 14 · Rúbrica por niveles | `4c44b814` | Un nivel por criterio con comentario; `score`/`total_score` salen de los DTO. Ver §5. |
| 15 · Inventario y contratos | `e2cd590e`, `74a51f82` | Inventario de privacidad, exportación del titular, OpenAPI al día, inventario de rutas con auditoría (`rules/*`), CSV sin filas vacías. |
| 18 · Modelos del frontend | `f8ae27fa`, `6f4ce085` | Modelos TS sin cifras; la lista de errores de compilación fue la lista de trabajo de las tareas 19 a 21. |
| 19 · HUD y persona | `9627efc9` | HUD sin marcadores; persona en el retrato (mapa `bond`/`activation` → retrato) y como icono sobre la cabeza. |
| 20 · Cierre del estudiante | `fbac7973`, `c6c07d49` | Final con su razón, autoevaluación breve local, «Lo que hiciste / Lo que faltó», competencias con evidencia, «Tus decisiones» con la clase en palabras. |
| 21 · Vistas docentes | `133ef634`, `0e38e384` | Traza por hitos, persona por escena, rúbrica por niveles, valoración del sistema lado a lado con la del docente (emparejadas por competencia). |
| 17 · Ninguna cifra | `059f0d8b` | Prueba de contrato sobre el recorrido completo por HTTP: ni claves retiradas ni números que no sean id, hecho, duración o posición. |
| 16 · Contracción | `862dea1d` | Migración `0031`: retira columnas y restricciones numéricas; borra `decision_effects.py` y `case_effects.py`. |
| 22 · e2e y documentos | este commit | `full-case.e2e.ts` con dos recorridos, espejo de la regla de la Tarea 17 en el navegador, mocks de docencia y portal al día, esta constancia y las dos hojas de analítica. |

## 3. Desviaciones respecto a la especificación y al plan

1. **Se añadió la Tarea 4b** (R-10) y se **reordenó** la ejecución (18 → 19 → 20 → 21 → 17 → 16): la compilación del frontend estuvo roja entre la 18 y la 21 por diseño, y la contracción (16) fue lo último.
2. **La bandera `FEEDBACK_AT_CLOSE_ONLY` se retiró** (R-9) en lugar de cambiar su valor por defecto: la respuesta de una decisión tiene una sola forma. No hay interruptor para volver al feedback inmediato; se restauraría desde git. (`test:csp` se corre por esto: cambió una bandera.)
3. **`mediacion_agresor_intentada`, `noticia_muerte_mal_manejada` e `interrogatorio_prematuro` no son hitos**: marcan actos desaconsejados (los cubre la clase Contraindicada y la plantilla). Quedan 11 hitos en SIM-VBG-001.
4. **La autoevaluación breve del cierre es solo del navegador** (R-6): dos cajas de texto que no se envían ni se guardan. Persistirla para el docente espera a Psicología (pregunta 17 de §5 de la especificación) y al visto jurídico (Ley 1581): un texto libre del estudiante puede ser dato sensible.
5. **El bloque «Frente a tu intento anterior» se omitió** (con comentario en el código): el reporte aún no trae datos del intento previo.
6. **Un final de plantilla inalcanzable es un aviso, no un error** (Tarea 10): la plantilla es automática y un caso sin respuestas Contraindicadas hace imposible `critica` por diseño. Un final **propio** inalcanzable sí es error.
7. **`competency-without-evidence` es error solo si alguna opción ya declara competencias** (R-13): SIM-VBG-001 no declara ninguna, así que hoy es un aviso. Es una regla de transición hasta que el editor de la autora obligue a declararlas.
8. **Con cero hitos decisivos rige la fórmula literal** (Tarea 6): `critica` solo con dos o más Contraindicadas. La especificación (§3.4) decía «solo Protectora o Crítica». Pregunta 19 para Psicología.
9. **La segunda oportunidad se concede por clase** (Tarea 5): cinco opciones de SIM-VBG-001 que el documento 1.0 marcaba riesgosas quedaron Aceptables y ya no la reciben. Pregunta 20 para Psicología.
10. **`0031` lleva un `AlterField` más** que lo previsto en R-14 (le da `default="ADEQUATE"` solo en el estado): sin él, retroceder la migración con filas en `decision_options` falla. Al retroceder las opciones quedan `ADEQUATE`.
11. **Las columnas internas de la rúbrica (`score`, `total_score`) se conservan** (R-14, reversible), aunque ya no viajan en ningún DTO.
12. **`classification` sigue aceptándose como ENTRADA** del autor (R-5): deriva la clase pero ya no se guarda. Retirarla es un cambio de contrato aparte. `scoreDelta`, `stressDelta` y `prohibitedPenalty` dan 400.
13. **`rating` de la encuesta de cierre sigue permitido** en la lista blanca de «ninguna cifra» (es el eco de la propia respuesta del estudiante): pregunta 21.
14. **El recorrido con una Contraindicada corre en dos viewports** (escritorio 1600 y móvil 390), no en los cuatro: el resto del caso es idéntico a la ruta recomendada y duplicar los cuatro habría sumado unos diez minutos a la suite sin cubrir más.
15. **La valoración del sistema (`competencyLevels`) va anidada en `systemEvaluation`** y queda plegada hasta que el docente guarda la suya (Tarea 13): así no la copia sin mirar.

## 4. Rulings tomados durante la ejecución

| Id | Resumen |
|---|---|
| R-1 | La prueba (b) de la Tarea 3 verifica que el intento abierto migrado sigue jugable; el final correcto se verifica en la Tarea 6. |
| R-2 | `0030` solo reescribe las versiones que ya tienen `rules.endings` (SIM-VBG-001: `critico/integral/riesgo/brechas` → `critica/protectora/riesgo_persistente/con_brechas`); las demás usan la plantilla en tiempo de ejecución. |
| R-3 | La tabla de conversión (severidad / clasificación / conducta prohibida → clase) vive en `casedef/vocabulary.py` como `legacy_class`; la comparten `0030` y el importador 1.0. |
| R-4 | La Tarea 15 marca como `deprecated` las claves transitorias del contrato; la 17 las retira del contrato y regenera los tipos. |
| R-5 | Entre las tareas 11 y 21 el serializador de opciones acepta `responseClass`; con solo `classification` deriva la clase. Los campos numéricos se aceptan y se ignoran hasta la 16, que los rechaza. |
| R-6 | La autoevaluación breve es solo del navegador. |
| R-7 | El respaldo `pg_dump` previo a la Tarea 3 se tomó de la BD de desarrollo (puerto 5433) y se guardó fuera del árbol versionado. |
| R-8 | Hasta la Tarea 16 el importador escribe `response_class` con `legacy_class` y `resolve` la deriva si es NULL. |
| R-9 | `FEEDBACK_AT_CLOSE_ONLY` se retira. |
| R-10 | Tarea 4b: conversión 1.0 → modelo nuevo en el importador, antes de la Tarea 5. |
| R-11 | La 4b omite (`skip`) las pruebas de finales y de «aplica flags» que reescriben las tareas 5 y 6 y borra la prueba de caracterización del motor viejo. |
| R-12 | El resolutor de retratos cae a `preocupada` si el kit no tiene `cautelosa` y a `triste` si no tiene `en-crisis` (esta rama solo tiene cuatro retratos; el kit de P4 trae seis). |
| R-13 | `competency-without-evidence` es error solo si alguna opción declara competencias; se añade `ending-without-default`. |
| R-14 | `0031` rellena `response_class` NULL antes de ponerla NOT NULL; el exportador del DSL del taller deriva `clasificacion` y `prohibida` de la clase. |
| R-15 | `docs/SIEP.md`, `docs/PENDIENTES.md`, `docs/TRAZABILIDAD.md` y el documento de investigación no existen en esta rama: se actualizan los documentos de `docs/operacion/`, se crea este y las ediciones exactas para los otros tres van en una nota aparte para quien los tenga. |

Rulings de tarea (resumen): la persona solo avanza con decisiones registradas, no con reintentos; el informe en vivo de un intento sin cerrar no viaja ni al estudiante ni al docente con alcance; un cierre de grupo con cero estudiantes no lleva fila de cobertura; `_first_vs_second` empareja solo intentos del mismo `schemaVersion`; «valoración guardada» = evaluación del DOCENTE en estado `EVALUATED` (un borrador no revela la del sistema); la cobertura por hito solo cuenta intentos completados con reporte v3.

## 5. Constancias para el expediente de decisiones

- **P-11 queda resuelto.** `docs/PENDIENTES.md` decía que `compute_ending` aplicaba las reglas del caso PDF a cualquier caso y que un caso distinto solo podía terminar en «Riesgo persistente» o «Crítico». Los finales se calculan ahora por hitos y clases con una plantilla automática por caso (Tarea 6), y la autora puede declarar los suyos. Lo que sigue pendiente de producto son los **nombres y textos** de la plantilla (pregunta 18).
- **RN-09 deja de ser un conflicto.** El total de rúbrica de 1,0 a 5,0 como nota numérica (decisión 9 de `PENDIENTES.md`) desaparece: la rúbrica del docente queda **solo con niveles y descriptor**, sin el número 1–5 y sin total.
- **La Tarea 14 revierte la «decisión 9»** («un total de rúbrica 1–5 es admisible como valoración formativa, rotulado y no visible al estudiante»). Aprobación del usuario: «Confirmo la Tarea 14: la rúbrica del docente queda solo con niveles y descriptor, sin el número 1-5 ni el total».

## 6. Pendientes abiertos

1. **Los reportes v1 y v2 ya cerrados siguen trayendo `finalScore` y `metrics`.** Son inmutables por diseño (no se recalculan); la pantalla del estudiante los ignora y los bloques de la analítica que leen niveles los dejan fuera. Quien lea un reporte antiguo por la API sigue viéndolos.
2. **El CSV por estudiante y `hitosCumplidos` hacen cosmética la supresión por celda mínima.** El docente que ve a sus estudiantes uno por uno puede reconstruir la cobertura que la celda oculta. La regla protege el agregado (la analítica C13), no al docente frente a sus propios estudiantes.
3. **La autoevaluación breve no se guarda** (R-6): si el docente debe verla, falta diseñar su almacenamiento y su privacidad.
4. **BD de desarrollo: el sello `definition_hash` de las versiones ya publicadas no coincide** con el documento exportado desde `0030`. Los datos de esas versiones se migran en el lugar, así que el juego funciona; solo el sello difiere y `seed_caso_pdf` avisa (REGLA-005) sin corregirlo. Nada lo compara.
5. **El kit de P4 trae seis retratos y esta rama cuatro** (R-12): el resolutor cae a `preocupada`/`triste` mientras falten `cautelosa`/`en-crisis`. La especificación del resolutor se queda en cuatro retratos; **P6** pasa los tres asserts de `character-visual.resolver.spec.ts` a seis al fusionar P4.
6. **Textos nuevos del servidor en borrador (VD-23)**, pendientes de Psicología: etiquetas de los once hitos, nombres y mensajes de la plantilla de finales, frases de la persona, razones del final, recomendaciones por hito. Marcados `# BORRADOR` en el código y listados en `draft-copy.ts` para el frontend.
7. **La analítica agregada (C13) no cuenta el final, la persona ni las duraciones**, aunque el reporte v3 los guarda (por ejemplo, el reparto de finales de un grupo). Y sigue sin pantalla.
8. **Menores diferidos de las revisiones** (no bloquean): icono de persona ausente tras recargar hasta la primera decisión; `rubric_service` ↔ `assessment.competencies` con importación circular que funciona; la ceja del criterio en la traza muestra el código crudo de la competencia; «Pendiente» en la tabla del sistema; el CHECK de `response_class` conserva `isnull=True |` aunque la columna es NOT NULL; `0031` importa `legacy_class` vivo y conviene anclarlo con un comentario o una prueba; OpenAPI muestra `scoreDelta`/`stressDelta`/`prohibitedPenalty` como aceptados aunque dan 400; ampliar `RETIRED_KEYS` de la prueba de la Tarea 17 con `trustDelta`, `victimRiskDelta`, `victimRisk`, `userTrust`, `sceneStress`, `professionalScore` y `revictimizationRisk`.
9. **El editor de la autora (P4 a P6)**: P5 (asistente de autoría) está hecha en su propia rama y falta fusionarla con esta (migración `0032` e inventarios); P6 (editor de hitos, clases y finales sobre el kit de seis retratos) está por hacer. Esta rama deja la API (`rules/*`) y el validador listos.

## 7. Documentos que aún nombran el motor viejo

`decision_effects.py` y `case_effects.py` ya no existen (los reemplazan `response_effects`, `case_state`, `case_rules` y `endings`). Se corrigió `docs/PROMPT_MAESTRO.md:110` (tabla de apps). Se dejan **como están**, por ser registro histórico o diseño de una fase anterior:

- `docs/diseno/dsl/fase-1-modelo-dominio.md`, `fase-3-sintaxis-concreta.md`, `docs/diseno/orientacion-jugabilidad.md`.
- `docs/diseñosistemas_docs/**` (planes y UML de la serie ADSI: A-01, A-03a, A-03c, P-04, `CAMBIOS_ADSI.md`, `FASE0_EVALUACION.md`, `PLAN_APLICACION_PATRONES_SIEP.md`, `PROMPT_MAESTRO_ADSI_SIEP.md`).
- `docs/informes/2026-10-03-diagnostico-jugabilidad/*`, `docs/informes/2026-10-04-revision-adversarial/limites-de-producto.md`, `docs/informes/2026-10-10-mapa-del-sistema/secciones/*`.
- `docs/pendientes/deudas/2026-10-03-orientacion-jugabilidad-backlog.md` y `docs/pendientes/propuestas/*`.
- `docs/requisitos/contraste-pn3/**`.
- En el backend, la migración histórica `0021` y los textos de `test_architecture.py` y `test_query_budget.py` (fixtures y comentarios).

Quedan además, **en `docs/PROMPT_MAESTRO.md`**, frases que siguen describiendo el modelo numérico viejo (líneas 27, 31, 43, 142 y 233: finales atados al caso, «puntaje», «estrés», clasificaciones `ADEQUATE | RISKY | INADEQUATE`); se dejaron porque el encargo era corregir solo la línea 110, y conviene reescribirlas con el resto de la consolidación de `docs/`.

## 8. Verificación

Ver el informe de la Tarea 22 en el libro de ejecución para las cifras de esta corrida (e2e, `test:csp`, tipos). Las suites completas del backend y de `verify:estructural` las corre quien integra la rama.

- Frontend, tras la Tarea 16: 4325 de 4325 pruebas en 306 archivos.
- Backend, fase E (antes de la ronda de corrección de `74a51f82`): 6632 pasaron, 5 fallaron (CSV con cero estudiantes y cuatro pruebas de inventario de rutas), todas arregladas en esa ronda.
- e2e completo en el worktree (2026-10-27): 321 pasaron, 2 fallaron y 15 se omiten (omisiones condicionales de la suite); las dos fallas eran de esta migración y se arreglaron (`keyboard-critical` P05 calificaba con un campo numérico que ya no existe; `case-review` esperaba cero avisos de validación y ahora hay avisos de las reglas nuevas) y pasan al repetirlas. `test:csp`: 8 pasaron, 0 violaciones.
- Defecto hallado por el e2e y corregido: el bloque «Tus últimos cierres» del panel del estudiante (Tarea 20) desbordaba 7 px en horizontal a 390 px con un título de caso largo; ahora la columna puede encogerse (`student-dashboard.component.scss`).
- e2e de esta tarea: `full-case.e2e.ts` (recorrido recomendado en los cuatro viewports y recorrido con una Contraindicada en escritorio 1600 y móvil 390), `docencia.e2e.ts` y `student-portal.e2e.ts` con las formas actuales de la API, `world-preview.e2e.ts` sin cambios.
