# Propuestas C, E y F — base común de hechos

> **Nota de la limpieza del repositorio (2026-10-10):** las menciones a documentos retirados (planes ya ejecutados, informes y especificaciones superados) se conservan como texto, sin enlace. Se recuperan del historial: `git show 9931599:<ruta>`.

- **Fecha:** 2026-10-03 · **Rama:** `feat/cierre-plan-maestro` (HEAD observado `e84a1a4`)
- **Alcance:** lectura de código y documentos (y git de solo lectura); no se ejecutaron pruebas, servidores ni BD, y no se tocó código de producción.
- **Convención:** lo no marcado está leído en el archivo citado. «(inferencia)» = deducción del autor. «(propuesta)» = no existe, es una sugerencia.

## 1. Para qué sirve este documento

Es la única base que comparten las tres propuestas (C: diálogo «texto como síntoma» + retratos + interrupciones; E: Social Mapping; F: Verbal Tension Box). Dice qué existe de verdad hoy, qué solo está escrito en planes y qué reglas no se pueden cruzar. Si una propuesta necesita un hecho que no está aquí, lo verifica y lo declara como supuesto; si contradice este documento, hay que corregir uno de los dos.
Contenido sensible (violencia basada en género, tentativa de feminicidio, muerte de una niña de 3 años): el caso se cita con el mínimo detalle necesario.

## 2. Marco pedagógico en una página

> **Procedencia: esta sección NO está tomada del informe de Análisis y Diseño.** No pude leerlo (Artifact `129JmoXkkV83gGb6mBZP4J`): la herramienta pedía una aprobación que nadie podía dar en la sesión. Lo que sigue es conocimiento general de los marcos (de memoria; conviene contrastar las fuentes). Del informe solo conozco un resumen secundario del 2026-10-01: recomienda ECD, LM-GM, MDA, INACSL HSSOBP y WCAG 2.2, y señala que en SIEP la competencia es texto libre sin modelo. Esto último sí lo verifiqué en el código (abajo).

- **ECD (Evidence-Centered Design, Mislevy y colegas).** Cadena: *afirmación de competencia (modelo de competencia) → evidencia observable que la sostiene, con regla de interpretación (modelo de evidencia) → tarea que provoca esa evidencia (modelo de tarea)*. Una mecánica sin afirmación ni evidencia es decoración. Obliga a decir qué conducta cuenta y cuál no (p. ej. no llegar a tiempo a una interrupción no es evidencia de baja competencia clínica).
- **LM-GM (Arnab y colegas, 2015).** Empareja una mecánica de aprendizaje (observación, reflexión, simulación, retroalimentación, repetición, guía) con la mecánica de juego que la sirve. Pregunta de control: ¿qué aprende el estudiante haciendo esto que no aprendería leyendo?
- **MDA (Hunicke, LeBlanc y Zubek, 2004).** Mecánicas (reglas y datos) → Dinámicas (lo que ocurre al jugarlas) → Estéticas (respuesta emocional buscada). Para SIEP la «A» se declara en términos clínicos (atención, respeto, cautela), nunca como tensión de combate o diversión por el sufrimiento.
- **INACSL HSSOBP (estándares de buena práctica en simulación sanitaria).** Objetivos explícitos, diseño con fidelidad al servicio del objetivo, seguridad psicológica (briefing previo, integridad profesional), facilitación, debriefing estructurado y evaluación del participante (formativa vs. sumativa). En SIEP: ETH-01 es el briefing, la salida segura es la seguridad psicológica, la bitácora y el reporte son el debriefing.

**Hallazgos verificados sobre competencias en SIEP** (no hay modelo de competencias):
- `RubricCriterion.competency` es texto libre (`backend_django/apps/simulation/models/rubric.py`; varchar(80) en `deploy/db_seed.sql`, el modelo dice 100).
- Conviven varias listas: (a) 6 criterios de `rubric_service.BASIC_CRITERIA` (`COMPRENSION_SITUACION` 20, `ANALISIS_ARGUMENTACION` 20, `DECISION_RUTA` 20, `COMUNICACION_EMPATIA` 15, `PAP` 15, `REFLEXION` 10), sembrados por `seed_default_rubric`; (b) 4 de `seed_caso_pdf.DEFAULT_RUBRIC` (`CONTENCION`, `MARCO_NORMATIVO`, `INTERVENCION_ETICA`, `REFLEXION`, máx. 5), usados solo si la versión no tiene rúbrica ni hay una anterior que clonar; (c) un tercer juego de 5 códigos en el mismo seed, inalcanzable tras el bloque (b) (inferencia); (d) las 4 competencias del catálogo `RQ-NEG-002` (contención, comunicación, valoración, activación de rutas); (e) 4 frases heurísticas en `build_completion_report` (`serializers/game_dtos.py`).
- La evaluación es manual: el docente puntúa por criterio (`RubricEvaluation`, `CriterionScore.evidence_json`). No hay vínculo automático evento → criterio. No verifiqué cuál rúbrica está activa en la BD de desarrollo (no se toca).

**Plantilla de 5 pasos (las tres propuestas la siguen igual, con estos títulos):**
1. **Competencia.** Una frase «el estudiante puede …» con verbo observable, ligada a UN criterio existente (código `competency`) o declarada como nueva.
2. **Evidencia.** Qué conducta dentro del juego cuenta (decisión, secuencia, herramienta, pista hallada), qué NO cuenta, regla de interpretación (formativa; no puntúa salvo que se diga), qué `AttemptEvent` la deja registrada y qué ve el docente.
3. **Tarea y mecánica.** Situación concreta de `SIM-VBG-001`; mecánica de aprendizaje → mecánica de juego (LM-GM); M, D y A (MDA) con la «A» en términos clínicos.
4. **Seguridad y acceso.** ETH-01, ETH-02/REGLA-004, WCAG 2.2, no revictimizar, alternativa sin tiempo y sin depender del color o del movimiento.
5. **Devolución.** Qué recibe el estudiante, cuándo (siempre después de decidir) y qué pregunta de bitácora lo enlaza; qué indicador ve el docente.

## 3. Qué piden el plan maestro y el roadmap

**Correspondencia de nombres (las letras chocan entre documentos):**

| Bloque del plan (`docs/PLAN_MAESTRO_TOTAL.md`) | Sub-proyecto del roadmap (`docs/historico/psychosocial-sim-roadmap.md`) | Estado (hoja de ruta 2026-10-02) |
|---|---|---|
| **C** Diálogo texto-como-síntoma + retratos dinámicos | **F** Expressive Dialogue (F1 texto, F2 retratos, F3 QTE) | Parcial: solo retratos emocionales de NPC |
| **E** Social Mapping | **G** Social Mapping / Clue Inventory | No existe |
| **F** Verbal Tension Box | **I** Verbal Tension Box (I0 prototipo, I1 patrones, I2 integración con modo alterno) | No existe |

En el roadmap, «C» es mapas multisala y «E» el editor; en el plan, «Visual H» (efectos de decisión) no es el «H» Overworld Depth del roadmap.
Dependencias según el roadmap: C no depende de nada; E se acopla ligeramente a C (las preguntas desbloqueadas aparecen en el diálogo); F depende de D1 y D2 y se beneficia de C y de E. La hoja de ruta fija que cada bloque tendrá su spec en `docs/superpowers/specs/` antes de programar.

**ADVERTENCIA DE IDs.** El plan cita `RQ-NEG-002` en los bloques C y E y `RQ-NEG-003` en F. **No los uses como fuente ni los cites como requisito de C, E o F.** Hallazgo adicional: la hoja de ruta dice que en el catálogo `RQ-NEG-002` es «Inmutabilidad de lo publicado» y `RQ-NEG-003` «Motor por grafos (DAG)». Eso no coincide con `docs/Requisitos de Negocio (Simulador)/`, donde `RQ-NEG-002` = «Entrenar competencias psicosociales transferibles» y `RQ-NEG-003` = «Garantizar enfoque ético y de derechos en simulaciones». Esos dos nombres salen de la numeración de `docs/historico/PROMPT_MIGRACION_DJANGO.md` §3 (otra lista). Hay dos numeraciones de RQ-NEG en el repo; la regla no cambia: no citar `RQ-NEG-002/003` para C/E/F. Aparte, `RNF-010` del catálogo es «Gestión ética de contenidos sensibles» (pide advertencia previa y «botón de salida segura en todas las fases»), distinto del «RNF-010 = sin migraciones» del plan.

### 3.1 Bloque C (plan líneas 491-623; Visual C y Visual H)
- **Pide:** tipo `DialogueEmotion` de 8 valores (`neutral, ansiedad, tristeza, enojo, disociacion, crisis, alivio, esperanza`) con estilo por emoción (velocidad 8-55 ms/carácter, color, `wobble`, `glitch` con caracteres `▓░▒` al azar, tamaño, opacidad); retrato en hoja de 5 columnas (neutral, positivo, negativo, ansioso, crisis) de 64×80; `interruptionConfig {prompt, timeoutMs, onSuccess, onTimeout}` con barra de cuenta atrás («el NPC se cierra emocionalmente» si vence).
- **Criterio de Done:** tristeza lenta y azulada; crisis rápida, roja y con glitch ocasional; ansiedad rápida, dorada, con wobble; el retrato cambia con la emoción; QTE con cuenta atrás visible; `ng build` sin errores.
- **Visual C:** 6 retratos genéricos (paciente adulto m/f, joven f, familiar m, funcionario m, guía f), 320×80, pixel art. **Visual H:** 5 efectos de decisión; `effect_door_transition` termina en «pantalla casi blanca» (riesgo WCAG 2.3.1, §6).
- **Roadmap F:** esfuerzo bajo-medio, sin dependencias; «text-as-clinical-signal»; retratos pueden requerir arte o capa procedural.
- **Divergencias con lo que hay:** el plan habla de una hoja por NPC; hoy hay un PNG por variante (§5.5) y además el manifiesto v1 define otra hoja de retrato (96×96, 4×8). El plan nombra NPC que no son los del caso. Ninguna parte del bloque (tipos, estilos, QTE) existe en código (grep).

### 3.2 Bloque E (plan líneas 827-989)
- **Pide:** panel colapsable «Red Social» en el HUD, SVG circular con el paciente al centro; `SocialNode {id, label, type: patient|family|friend|professional|antagonist, revealed, affinity −1..1}` y `SocialEdge {from, to, strength 0-1, type: support|conflict|neutral|unknown}`; datos «del `metadata_json` de los objetos del caso o de un campo dedicado en el nodo de decisión»; `reveals_social_nodes: string[]` evaluado al procesar cada decisión.
- **Criterio de Done:** panel visible y colapsable; paciente siempre visible; otros nodos se revelan al avanzar; afinidad (+/−) se actualiza con decisiones; layout con 1-8 nodos extra; `ng build` sin errores.
- **Roadmap G:** recoger Conceptos/Contradicciones/Antecedentes en el overworld y conectarlos en un menú para desbloquear preguntas; esfuerzo medio, «nuevo modelo de datos (grafo de pistas) + UI». Hoja de ruta: falta «qué red social se mapea y cómo se puntúa».
- **Divergencias:** el plan es un panel pasivo (red que se revela); el roadmap es un juego activo de conectar pistas. «Campo dedicado en el nodo de decisión»: no existe (`simulation_nodes` y `decision_options` no tienen columna JSON); `map_objects.metadata_json` sí.

### 3.3 Bloque F (plan líneas 993-1092)
- **Pide:** medidor `VerbalTensionComponent` (0-1; zona segura 0,7; crítico ≥0,9 → «Paciente cierra comunicación»); `verbal_tension_delta` (−1..+1) por opción «en `decision_option_json` o `metadata_json` de la opción»; `verbalTension = signal(0)`; ≥0,9 dispara `triggerPatientWithdrawal()`; reset parcial al cambiar de sala. Mide «la carga de la conversación actual», NO el estrés general.
- **Criterio de Done:** barra visible en diálogos; color bajo→medio→alto; al 90 % aviso + efecto en el diálogo; reseteo parcial al cambiar de sala; `ng build` sin errores.
- **Roadmap I:** minijuego en tiempo real en Phaser (corazón en una caja, proyectiles azules = quedarse quieto/escucha activa y naranjas = moverse/confrontación asertiva, menú de 4 comandos: DIAGNOSTICAR, ACTUAR, HISTORIAL, PERDONAR/Mercy); esfuerzo alto/riesgo alto; exige D1 y D2 resueltas.
- **Divergencia grande:** «Verbal Tension Box» significa dos cosas incompatibles: un medidor pasivo (plan) o un minijuego en tiempo real (roadmap). Cada propuesta debe declarar cuál desarrolla. `decision_options` no tiene columna JSON (§5.2).

### 3.4 Decisiones transversales sin resolver (roadmap §3, textos)
- **D1 — Tone vs. subversion.** «Rendering a patient's catharsis as "projectiles" and `DIAGNOSTICAR = Fight` is powerful but risks trivializing real suffering in a formative clinical tool that today is deliberately serious (no-correct-answer-reveal guardrail, safe-exit, reduced-motion). Decide: full Undertale subversion vs. a softened clinical reframe (e.g., projectiles = intrusive pressure/distortions, framed respectfully) vs. hybrid.»
- **D2 — Accessibility of a bullet-hell.** «Real-time dodging conflicts with `prefers-reduced-motion` and motor accessibility. A non-real-time fallback (turn/menu mode = today's system) is almost certainly required, not optional. Decide the fallback contract up front.»
- **D3 — Authoring.** Decidir si los primeros cortes llevan el contenido en código/config del frontend (como la guía B1) o esperan al editor. Afecta a E y F (§5.2).
- Estado: las tres siguen abiertas (prompt de la sesión nocturna). El roadmap exige resolverlas «antes de I».

## 4. Estado compartido: qué existe y qué no

Todo el estado real vive en el backend (`GAME-01`): el cliente no escribe métricas ni banderas. Evaluado leyendo código; no ejecutado.

| Variable | Definición según roadmap | ¿Existe hoy? Ruta | Rango / unidad | Quién la mueve hoy |
|---|---|---|---|---|
| Estrés (`stressIndex`; en DTO `sceneStress`) | Entrada de SIC | **Sí.** `SimulationAttempt.stress_index` (`models/attempt.py`) | 0-100, entero | Decisión: `stress_delta` de la opción, +40 si conducta prohibida (`services/decision_effects.py`). Herramienta: −5 si pertinente, +3 si no, una vez por herramienta+objetivo (`world_service.use_tool`) |
| Puntaje (`accumulatedScore`; `professionalScore`) | Entrada de SIC | **Sí.** `accumulated_score` | Entero sin tope (puede ser negativo) | Solo decisiones: `score_delta` + `prohibited_penalty` si prohibida |
| `userTrust` | Entrada de SIC | **Sí.** `user_trust` | 0-100, inicia 50 | Decisión por clasificación: +10 / −5 / −12; −20 extra si prohibida |
| `victimRisk` | Entrada de SIC | **Sí.** `victim_risk` | 0-100, inicia 50 | Decisión: −5 / +8 / +12; +15 extra si prohibida |
| `institutionalRouteActivated`, `revictimizationRisk` | — | **Sí.** booleanos del intento | bool | Decisión (ruta: ADEQUATE hacia nodo con «ruta/protección/institucional» en clave o título; revictimización: conducta prohibida) |
| Métricas del caso (`caseMetrics`) | — | **Sí, solo `SIM-VBG-001`.** `AttemptWorldState.flags_json` → `caseMetrics`; claves `confianza, crisis_emocional, riesgo_victima, rigor_tecnico, etica_profesional, ruta_institucional, calidad_duelo` (`services/case_effects.py`) | 0-100, inicia 50 | Solo `apply_case_effects`, con el registro `OPTION_EFFECTS` (19 `option_key` escritas en Python, no en BD) |
| Banderas del caso (`caseFlags`) | — | **Sí.** mismo JSON; 14 booleanos (`pap_aplicado`, `familia_contenida`, `mediacion_agresor_intentada`, `riesgo_feminicidio_valorado`, …) | bool | `apply_case_effects` |
| Estado del paciente (`clinicalState.patient` / `patientState`) | `trustLevel`, `crisisLevel`, `emotionalState`, `openness` | **Sí, derivado, no almacenado.** `case_effects.clinical_state()`: `emotionalState`=`calidad_duelo`, `trustLevel`=`confianza`, **`openness`=`confianza` (mismo valor)**, `crisisLevel`=`crisis_emocional`. Front: `core/models/simulation.model.ts`, `patient-state.util.ts` | 0-100 | Indirecto, vía métricas del caso. Para casos sin registro queda en 50/50/50/50 (inferencia) |
| **Confianza** | `trustLevel` | **Sí** = `patientState.trustLevel` = `caseMetrics.confianza`. Es la barra «Confianza» del HUD (`simulation-hud.component.ts`). **No** es `userTrust` | 0-100 | Registro `OPTION_EFFECTS` |
| **Reactividad** | `crisisLevel` | **Parcial.** Existe el dato (`crisisLevel`=`crisis_emocional`) pero el nombre «Reactividad» solo está en el roadmap y el HUD no la muestra (muestra Confianza y Bienestar). Efecto actual: si `crisisLevel` ≥ 70 el sprite de la paciente se tiñe de rojo y vibra (`game-world.component.ts` `updatePatientVisualState`; la vibración respeta `reduceMotion`) | 0-100 | Registro `OPTION_EFFECTS` |
| **SIC** | «≈ entradas: userTrust/victimRisk/professionalScore/stressIndex» | **NO existe.** La sigla no se desarrolla en ningún documento ni en el código (grep `\bSIC\b`: solo roadmap y prompt nocturno). Qué significa y cómo se calcula es una pregunta abierta | — | Nadie |
| Tensión verbal | Plan F | **NO existe** (grep `verbalTension`/`verbal_tension`: solo docs). El spec `2026-06-08-hud-redesign-design.md` afirma que `verbalTension` es un input «real» del HUD; en el código actual no lo es | — | Nadie |
| Red social / afinidad / pistas reveladas | Plan E | **NO existe** (grep `SocialNode`, `social-map`, `reveals_social`: solo docs) | — | Nadie |
| Estado relacional por NPC (`trust`, `tension`, `openness`, `available`) | Spec premium 2026-07-13 §8.2 y plan `living-case-npc-consequences` | **NO existe.** Solo planes (grep `npcStates`, `clinical_consequence.py`, `world_state_mutation.py`: ninguno en código) | planeado 0-100 | Nadie |
| Finales | Roadmap: `OutcomeTier` + `computeOutcome` | `computeOutcome` **no existe** (el tipo `OutcomeTier` sí, sin uso). Existen 4 finales en backend: `integral`, `brechas`, `riesgo`, `critico` (`case_effects.compute_ending`, solo en intentos `COMPLETED`) | 4 valores | Resultado de severidades + banderas |
| Evidencia previa | — | **Sí.** `viewedNpcKeys` (en `flags_json`), `inspected_object_keys_json`, `inventory_json`, `used_tool_keys_json`, `viewed_dialogue_keys_json` (`AttemptWorldState`) | listas de claves | `world_service`: `open_interaction`, `record_npc_interaction`, `use_tool` |
| Segunda oportunidad | — | **Sí.** Primera respuesta riesgosa/inadecuada/prohibida en un nodo: evento `DECISION_RETRY_REQUIRED` o `PROHIBITED_DECISION_RETRY_REQUIRED`, sin efectos; la segunda cuenta (`game_service.choose_decision`) | — | Backend |

Dos «confianzas» y un posible desajuste: el diálogo de supervisión que ve el estudiante tras decidir muestra `trustDelta` (el de `userTrust`, genérico), mientras la barra del HUD muestra `caseMetrics.confianza` (`buildSupervisionDialogue` vs. `HUD`). Además, `PATIENT_INITIAL_STATE` (40/20/15/60) y `interventionRules` (`intervention-rules.json`) existen en el front pero no gobiernan nada: `interventionRules` se carga y no se usa; `applyFeedbackToPatient` no se llama fuera de pruebas.

## 5. Lo que ya existe y se puede reutilizar

### 5.1 `AttemptEvent`
Ruta `backend_django/apps/simulation/models/attempt.py`, tabla `attempt_events`. Campos: `attempt` (FK), `event_type` (CharField 50; **varchar(48) en `deploy/db_seed.sql`**, sin CHECK), `node` (FK, nulo), `decision_option` (FK, nulo), `score_delta`, `stress_delta`, `detail` (TextField, nulo), `occurred_at`. **No hay columna JSON**: la carga útil libre es `detail` (texto).
- Tipos escritos hoy (16). En `game_service.py`: `ATTEMPT_STARTED`, `NODE_ENTERED`, `DECISION_SELECTED`, `PROHIBITED_DECISION_SELECTED`, `DECISION_RETRY_REQUIRED`, `PROHIBITED_DECISION_RETRY_REQUIRED`, `ATTEMPT_COMPLETED`, `REFLECTION_SAVED`, `SAFE_EXIT_REQUESTED`, `ATTEMPT_RESUMED`, `ATTEMPT_REPLACED`. En `world_service.py`: `WORLD_POSITION_UPDATED`, `MAP_INTERACTION_OPENED`, `TOOL_USED`, `NPC_DIALOGUE_VIEWED`, `ROOM_ENTERED`.
- Precedente de dato extra sin esquema: `evidenceOverride`/`missingEvidence` (`serializers/requests.py` `SelectDecisionRequest`) se anexan al `detail` del evento de decisión («| Override de evidencia: …»).
- No existe endpoint para que el cliente registre eventos arbitrarios (`apps/simulation/urls.py`): un hecho nuevo originado en el cliente exige endpoint nuevo (código, no esquema).
- La línea de tiempo del docente usa una lista blanca, `TIMELINE_EVENT_TYPES` (`serializers/game_dtos.py`, 8 tipos) y su espejo `buildTimelineFallback` en `instructor-trace.component.ts`. Un tipo nuevo queda en `events` de la traza con rótulo genérico «Evento», pero no en la línea de tiempo hasta añadirlo a ambas listas.

### 5.2 Campos que permiten datos nuevos SIN cambio de esquema
| Campo (tabla.columna) | Contiene hoy | Lo que permitiría | Cuidado |
|---|---|---|---|
| `attempt_world_states.flags_json` (texto JSON, por intento) | `caseFlags`, `caseMetrics`, `viewedNpcKeys`, `syncedNodeId`, `positionSyncedAt` | Claves nuevas de nivel superior (pistas halladas, red revelada, tensión por conversación) | Lectura-modificación-escritura sin bloqueo (`apply_case_effects` no usa `select_for_update`; el writer único `mutate_world_state` solo está planeado). Todo lo que se guarde viaja al cliente (`/world` → `flags`) y a la traza docente (`trace().world.flags`) |
| `attempt_world_states.inspected_object_keys_json` y `viewed_dialogue_keys_json` | listas de claves | Registrar pistas como objetos inspeccionados | Ya alimentan compuertas de puertas |
| `attempt_events.detail` | texto libre | Texto o JSON serializado por evento | Es texto: sin consultas estructuradas |
| `attempt_events.event_type` | 16 valores, sin CHECK | Tipos nuevos (≤ 48 caracteres) | Lista blanca de la línea de tiempo (§5.1) |
| `map_objects.metadata_json`, `unlock_condition_json` | metadatos de puertas (`targetNodeKey`, `requiresInspected`, `requiresTools`, `requiresNodes`, `requiresNpcs`, `lockedMessage`, `entryX/Y`) | Datos por objeto/persona del mapa (p. ej. qué vínculo revela) | Viajan al cliente en `metadata`. `object_type` tiene CHECK (`PERSON, OBJECT, ROUTE, TOOL, WARNING, EXIT`): un tipo «PISTA» exigiría cambio de esquema |
| `scene_maps.ambient_json` | `music`, `mood`, `ambientNpcs`, `ambientNpcKeys`, `transitionText` | Datos por sala | Round-trip por `authoring_service` |
| `dialogue_choices.effect_json` | `requiresTools`, `requiresNpcs`, `requiresInspected` (lo lee `choiceEvidence`) | Metadatos por opción de diálogo | **Se envía al cliente antes de elegir** (`_to_dialogue`): ahí no puede ir nada que revele la respuesta adecuada |
| `dialogue_lines.emotion` (varchar 60), `dialogue_trees.emotion`/`portrait_key` | vocabulario libre sin CHECK | Nombres nuevos de emoción o retrato | Hay 5 vocabularios (§8) |
| `criterion_scores.evidence_json` | evidencia por criterio puesta por el docente | Enlazar eventos como evidencia | Hoy no se llena automáticamente |
| `OPTION_EFFECTS` (`case_effects.py`), `NODE_EVIDENCE` (`evidence-gating.config.ts`), `assets/game/scenarios/*.json` | registros en código/config | Datos por `option_key`, por nodo, por NPC ambiental, sin BD y **sin llegar al cliente** (OPTION_EFFECTS) | Cambiar código, no esquema. Solo valen para `SIM-VBG-001` |

**Exigiría cambio de esquema (solo propuesta):** columna JSON en `attempt_events` o en `decision_options`; tabla de red social o de pistas por intento; tipo `PISTA`/`CLUE` en `map_objects.object_type`; tabla de competencias. Procedimiento vigente: script idempotente en `deploy/upgrades/` (hay 3: `2026-09-29-attempt-status-paused.sql`, `2026-10-01-ambient-npcs-caso-pdf.sql`, `2026-10-01-attempt-status-replaced.sql`), CHECK en `deploy/db_seed.sql` y `test_deploy_schema_contract.py` en verde (hoy cruza 4 enumeraciones: `AttemptStatus`, `CaseVersionStatus`, `DecisionClassification`, `UserRole`).

### 5.3 Cómo una decisión mueve puntaje y estrés
`choose_decision` (`services/game_service.py`) → `decision_effects.resolve/apply` → `case_effects.apply_case_effects` → eventos `DECISION_SELECTED` o `PROHIBITED_DECISION_SELECTED` + `NODE_ENTERED`. La opción trae `classification` (`ADEQUATE|RISKY|INADEQUATE`), `score_delta`, `stress_delta`, `prohibited_penalty`, `prohibited_conduct`, `prohibition_reason`, `immediate_feedback`. Conducta prohibida: puntaje + penalización, estrés +40, confianza −20, riesgo +15, `revictimizationRisk`=true. El feedback («supervisión clínica») lo arma el cliente (`buildSupervisionDialogue`) con `message`, `prohibitionReason` y los deltas. Hoy `decision_option_state` envía `classification` y `prohibitedConduct` al cliente **antes** de decidir (la UI no los muestra); el plan 2026-07-13 pide dejar de enviarlos y no está implementado.

### 5.4 Rúbrica, traza y reportes
- **Docente, traza** (`GET /api/instructor/attempts/<id>/trace`, `services/instructor_service.py`): `status`, `accumulatedScore`, `stressIndex`, `metrics`, conteos por clasificación, `safeExitUsed`, `timeline`, `events` (tipo, clasificación, nodo, texto de decisión, deltas, `detail`, hora), `world` (incluye `flags` con `caseMetrics`), bitácoras descifradas, rúbricas evaluadas. Alias anónimo `Estudiante-<id>`. **La interfaz del docente (`instructor-trace.component.ts`) no muestra `ending`, `caseMetrics` ni `caseFlags`**, aunque el payload los lleva en `world.flags`.
- **Reporte de grupo** (`apps/reportes/services.py`): intentos completados/en progreso/en pausa/con salida segura (cuenta el evento, no el estado), puntaje promedio solo de `COMPLETED` y `SAFE_EXITED`, decisiones por clasificación, bitácoras, rúbricas aplicadas, CSV. No usa estrés ni métricas del caso.
- **Estudiante, cierre** (`completionReport` + `attempt-outcome.component.ts`): conteos, `competencies` (4 frases heurísticas), `recommendations`, `timeline`, `ending` y barras de las 7 métricas del caso (`caseMetricRows`).

### 5.5 Frontend (`frontend/src/app/features/simulator/`)
- **Panel de diálogo** (`dialogue-panel.component.ts`, 605 líneas): entradas `dialogue`, `interaction`, `mode` (`cinematic|side`); salidas `close`, `execute`, `useTool`, `frontendChoice`. `DialogueState {key, speakerName, portraitKey, emotion, lines[{order, speakerName, text, emotion}], choices[{key, text, decisionOptionId, requiredToolCode, effect, isRecommended?, isProhibited?, evidenceWarning?}]}`. Máquina de escribir por `setInterval` a 22 car/s (45 ms), saltable (Enter/Espacio o «Saltar»). Teclado: Esc cierra, Enter/Espacio completa/avanza, `1-9` elige (`dialogue-progression.util.ts`). Lector de pantalla: el texto animado está en `aria-hidden` y un `<p class="visually-hidden" role="status" aria-live="polite">` recibe la línea completa. `role="dialog" aria-modal="true"` con `cdkTrapFocus`. Chip de emoción (no `neutral`) y etiqueta solo para `positive`/`concerned`/`danger`.
- **Movimiento reducido:** la señal `reduceMotion` (`simulation-play.component.ts`, de `matchMedia` + interruptor del HUD) llega a Phaser (`game-world.component.ts`), HUD, intro y utilidades (`game-feel.util.ts`). **El panel de diálogo no la recibe**: la máquina de escribir (JavaScript) no cambia con movimiento reducido; solo las animaciones CSS (entrada del panel, parpadeo del cursor, entrada de opciones) se apagan con la preferencia del sistema (`prefers-reduced-motion`), no con el interruptor del juego.
- **Retratos** (`portrait-resolver.util.ts`): `resolvePortraitAsset(portraitKey, emotion, speakerName)` → `/assets/characters/portraits/<slug>_<variante>.png` o `null` (cae a silueta SVG). Variantes: `neutral`, `worried`, `sad`, `happy`; mapa de emociones: `neutral`→neutral, `vulnerable`/`concerned`→worried, `danger`→sad, `positive`→happy. PNG existentes (10): `paciente-vbg` (neutral, worried, sad), `madre-vbg` (neutral, worried, happy), `psicologa-hospitalaria` (neutral, happy), `funcionaria-recepcion` (neutral), `comisaria-profesional` (neutral). Mapeo por nombre de hablante: Consultante, Sobreviviente (22 años), Abuela de la niña, Funcionaria de recepción, Psicóloga hospitalaria, Profesional psicosocial. **(inferencia, no ejecutado)** Las líneas del caso usan emociones crudas (`anxious`, `negative`, `sad`, `relieved`) que no están en el mapa: el retrato cae a `neutral`; y los NPC ambientales pasan `portrait` = un emoji del JSON, por lo que solo «Psicóloga hospitalaria» consigue retrato.
- **Manifiesto v1 de personajes** (`features/character/`): `PortraitState`, `ConsequenceTone` (`relief|steady|tension|rupture`), `clinicalEmotionPortraitStates` (neutral, positive, negative, anxious, danger, sad, worried, concerned, relieved, receptive, calm, closed → estado de retrato) y `resolveNarrativePortraitState`. No lo usa el panel de diálogo (grep).
- **Evidencia / pistas** (`evidence-gating.config.ts`): `NODE_EVIDENCE` por nodo (`npcs`, `tools`, `usedTools`, `inspected`, `missingMessage`, `unlockLines`), `nodeEvidence()`, `choiceEvidence()`, `mergeEvidence()`, `missingEvidence()`, `unlockedExtraLines()`. «Gating de presentación»: advierte («Información incompleta») pero no impide decidir; `viewedNpcKeys` se persiste en `flags_json`. Cuatro nodos tienen evidencia definida (`hospital-urgencias`, `hospital-accion-etica`, `hospital-cierre-bloque`, `comisaria-accion-final`). Las puertas validan `requiresInspected/requiresTools/requiresNodes/requiresNpcs` en backend. No hay interfaz de «inventario de pistas» (`tool-inventory` solo lista herramientas).
- **HUD de estrés:** `stressToHearts(stressIndex, total=5)` (`stress-hearts.util.ts`) devuelve corazones `full|half|empty` que representan la CALMA restante (100 − estrés); `role="meter"` con etiqueta «Estado de estrés del caso». La viñeta de crisis (`game-feel.util.ts`: `crisisVignetteState`, `decisionShake`, `roomEntryFlash`) ya está en la rama (commits `8a39f65` y `e84a1a4`); otro agente sigue trabajando el bloque B en este mismo worktree.
- **Salida segura durante un diálogo:** `inputBlocked()` es verdadero con diálogo abierto; en ese estado la cabecera y el pie (donde está el botón «Salida segura») llevan `inert`/`aria-hidden`, y `safeExit()` retorna sin actuar. Con diálogo abierto, el primer Esc cierra el diálogo y un segundo Esc ejecuta `safeExit` (`handleGlobalInteraction`). Es decir, hoy la salida segura desde un diálogo exige dos pasos.

### 5.6 Planes del 2026-07-13 aún sin implementar (condicionan C y F)
`docs/superpowers/specs/2026-07-13-sim-vbg-001-premium-gameplay-design.md` (estado: «diseño conversacional aprobado; pendiente de revisión del documento escrito») y sus 6 planes. En el código no existen `runtime/`, `dialogue/`, `ActorPresentationState`, `InputLockState`, `npcStates`, `ClinicalConsequence` (grep y glob). Lo que fijan y habría que respetar o contrastar: máquina de escribir de 35-45 car/s con pausas de puntuación; con movimiento reducido la línea aparece sin animar caracteres; el lector recibe la línea completa una vez; máximo 4 opciones; «ninguna etiqueta, color o icono revela la opción correcta antes de elegir»; la emoción no se anuncia con chips; rúbrica invisible durante el juego; estado autoritativo por NPC con `trust`, `tension`, `openness`, `available`. Del Plan 1 (manifiesto de personajes) hay código parcial (`CharacterManifestV1`, `ConsequenceTone`, `resolveNarrativePortraitState`); no verifiqué que esté completo.

## 6. Límites que ninguna propuesta puede cruzar

1. **Sin cambio de esquema en esta fase.** Todo cambio de tabla/columna/CHECK va solo como propuesta escrita, con el procedimiento de §5.2. Django usa `managed=False`.
2. **ETH-01 (consentimiento).** Antes de cualquier video, narrativa o audio sensible hay una advertencia con Continuar / Volver al catálogo (`intro-gate.util.ts`, `docs/diseno/consentimiento-contenido-sensible.md`). Rechazar deja el intento `IN_PROGRESS`. Pendientes declarados: revisión SME del texto y recursos de apoyo (`BLOCKED_EXTERNAL`). Una mecánica nueva no puede mostrar contenido sensible antes del consentimiento ni añadir uno nuevo sin pasar por la misma puerta.
3. **ETH-02 (salida segura).** `safe_exit` deja el intento en `PAUSED` (pausa reanudable, mismo `attemptId`, evento `SAFE_EXIT_REQUESTED`, reanudar con `ATTEMPT_RESUMED`). `REPLACED` (cierre por `forceNew`, evento `ATTEMPT_REPLACED`) **no** es salida segura y no puntúa. `SAFE_EXITED` es histórico y ningún código nuevo debe escribirlo. Ninguna propuesta cambia estas semánticas.
4. **REGLA-004.** La salida segura debe ser alcanzable siempre, sin importar estrés o estado del caso (también `RNF-010` del catálogo: «botón de salida segura en todas las fases»). Hoy, con un diálogo abierto, exige dos Esc (§5.5). Cualquier superposición nueva (cuenta atrás, caja de tensión, panel de red) debe: no empeorar ese camino, ofrecer un control visible de pausa dentro de la propia superposición y no depender de una acción cronometrada para salir (propuesta de criterio, a confirmar).
5. **WCAG 2.2** (el catálogo `RNF-004` aún dice 2.1 AA). Criterios que tocan a C/E/F: 2.2.1 Tiempo ajustable (cualquier cuenta atrás: poder desactivarla o extenderla); 2.2.2 Pausar, detener u ocultar (wobble/glitch/pulsos de más de 5 s); 2.3.1 Tres destellos (el pulso de la viñeta de crisis usa 800 ms por tramo; el texto con glitch y la `effect_door_transition` casi blanca de Visual H deben evaluarse); 2.1.1/2.1.4 Teclado y atajos de una tecla; 2.4.11 Foco no oculto; 2.5.7 Movimientos de arrastre (conectar nodos en E exige alternativa sin arrastre); 2.5.8 Tamaño de objetivo (24 px); 1.4.1/1.4.11 Color y contraste (tensión, vínculos y emociones no pueden depender solo del color); 1.3.1 Información y relaciones (un grafo necesita equivalente en lista/tabla); 4.1.3 Mensajes de estado (cambios de tensión/pistas por región viva sin saturar). Además: movimiento reducido (señal `reduceMotion`, también el interruptor del HUD), navegación completa por teclado, lector de pantalla con la línea completa una sola vez.
6. **No revictimizar.** No usar el testimonio de la sobreviviente como estímulo cronometrado; no premiar la rapidez ante relatos de dolor; no mostrar a la niña fallecida ni a personas ausentes como nodos con «afinidad» numérica; no reconstruir hechos violentos con detalle.
7. **No convertir el sufrimiento en un juego.** Sin puntos flotantes, efectos de combate, «game over» por la muerte de la niña ni lenguaje de victoria/derrota sobre el duelo (D1). El puntaje es «seguimiento formativo» (HUD).
8. **Privacidad (Ley 1581 de 2012).** El docente ve alias (`Estudiante-<id>`); las bitácoras van cifradas; los eventos nuevos no deben registrar identificadores, preferencias de accesibilidad (usar movimiento reducido no se registra ni se puntúa) ni tiempos de reacción individuales sin justificar finalidad y retención (un tiempo de reacción puede inferir una condición de salud o discapacidad; inferencia). El asistente IA envía a un proveedor externo: no mandarle datos de estas mecánicas.
9. **No contradecir el «no revelar»**: nada que revele la opción adecuada antes de elegir (§5.2: `effect_json` y `classification` viajan al cliente).
10. **Conservar** lo ya hecho: ETH-01, pausa reanudable, compuertas de puertas, `viewedNpcKeys`, rendimiento (el presupuesto del spec premium es 59 FPS en 1366×768).

## 7. El caso `SIM-VBG-001` como banco de ejemplos

Fuente: `backend_django/apps/simulation/management/commands/seed_caso_pdf.py` (versión 2.0.0), `case_effects.py`, `frontend/src/assets/game/scenarios/*.json`, `evidence-gating.config.ts`. 4 espacios físicos, 8 mapas, 6 decisiones, 19 opciones, 5 herramientas. Solo el primer nodo está marcado como sensible, con aviso (`sensitive_content`, `warning_message`); `safe_exit_required` es falso en todos.

**Nodos del DAG en orden.** Las salas físicas se reutilizan como copias, por eso una decisión puede jugarse en un mapa que pertenece a otro nodo.

| # | Nodo (`node_key`) | Sala(s) (`map_key`) | Decisión que sale de él |
|---|---|---|---|
| 1 | `hospital-urgencias` (inicio, sensible) | `hospital-urgencias`; por puerta `hospital-sala-escucha` | H1 → `hospital-sala-escucha` (se juega en el objeto `familia-duelo` de la sala de escucha) |
| 2 | `hospital-sala-escucha` | `hospital-sala-escucha` | H2 (marco normativo) → `hospital-accion-etica` |
| 3 | `hospital-accion-etica` | `hospital-sala-escucha-accion` | H3 (acción técnica y ética) → `hospital-cierre-bloque` |
| 4 | `hospital-cierre-bloque` («Quince días después») | `hospital-sala-escucha-cierre`; por puerta `comisaria-recepcion` y `comisaria-consultorio` | C1 (prioridad psicosocial) → `comisaria-consultorio` (se juega en el consultorio) |
| 5 | `comisaria-consultorio` | `comisaria-consultorio` | C2 (marco normativo) → `comisaria-accion-final` |
| 6 | `comisaria-accion-final` | `comisaria-consultorio-marco` | C3 (acción final) → `cierre-caso` |
| 7 | `cierre-caso` (terminal) | `comisaria-consultorio-cierre` | — |
| sala | `comisaria-recepcion` | `comisaria-recepcion` | sin decisiones; solo por puerta |

**Puertas con condición:** `puerta-sala-escucha` exige haber inspeccionado `familia-crisis`; `salida-institucional` exige estar en el nodo `hospital-cierre-bloque`; `puerta-consultorio` exige haber inspeccionado `expediente-caso`. **Herramientas** (`ClinicalTool`): `PAP`, `SPIKES` (EPICEE), `RISK_METER`, `SAFETY_ROUTE`, `REFLECTION_JOURNAL`.

**Personas y NPC (clave → nombre en pantalla · rol).**
- Backend (`PERSON`): `familia-crisis` y `familia-duelo` → «Abuela de la niña» (madre de la sobreviviente; familia en duelo, tono `anxious`/`negative`); `psicologa-acompanante` → «Psicóloga hospitalaria» (H3); `sobreviviente-consulta` → «Sobreviviente (22 años)» (consultante, C1); `profesional-psicosocial` → «Profesional psicosocial» (C3); `funcionaria-recepcion` → «Funcionaria de recepción».
- Ambientales (`scene_maps.ambient_json` + `scenarios/*.json`): `enfermera-urgencias`, `medico-guardia`, `psicologa-orientadora` (urgencias); `trabajadora-social` (sala de escucha); `orientadora-juridica`, `sobreviviente-espera` (emoción `closed`), `madre-acompanante` (`worried`) (recepción); `apoyo-psicosocial` (consultorio).
- Ausentes (nombrados, nunca en escena): el agresor (pareja de 28 años), la niña de 3 años, los hermanos de la sobreviviente, «personas dependientes» (C3).

**Decisiones: opciones y efectos** (puntaje/estrés de la opción; la clasificación genérica y el registro de severidad pueden diferir). «Prohibida» suma puntaje (−5 de penalización), estrés +40, confianza −20, riesgo +15.

| Opción | Clase | Puntaje / estrés | Severidad y efecto principal en métricas del caso |
|---|---|---|---|
| H1 `h1-noticia-sin-protocolo` | INADEQUATE, prohibida | −10 / +25 | crítica; `calidad_duelo` −25, `crisis_emocional` +25, `confianza` −15 |
| H1 `h1-pap-contencion` | ADEQUATE | +10 / −5 | recomendada; `pap_aplicado`, `familia_contenida`; `confianza` +15, `crisis_emocional` −20 |
| H1 `h1-interrogar-victima` | INADEQUATE, prohibida | −10 / +25 | crítica; `interrogatorio_prematuro`; `etica_profesional` −25, `riesgo_victima` +15 |
| H2 `h2-solo-459` / `h2-459-1257` / `h2-459-1448` | RISKY / ADEQUATE / RISKY | +3,+4 / +10,−5 / −5,+8 | aceptable / recomendada (`marco_hospital_correcto`) / riesgosa |
| H3 `h3-parcial-disonancia`, `h3-pap-epicee`, `h3-epicee-ciclo` | RISKY, RISKY, RISKY | 0,+8 / +5,0 / +6,0 | riesgosa / aceptable (`epicee_aplicado`) / aceptable |
| H3 `h3-integral-psicosocial` | ADEQUATE | +12 / −5 | recomendada; `duelo_acompanado` |
| C1 `c1-mediacion-perdon` | INADEQUATE, prohibida | −10 / +25 | crítica; `mediacion_agresor_intentada`; `riesgo_victima` +30, `etica_profesional` −25, `confianza` −20 |
| C1 `c1-riesgo-proteccion-derechos` | ADEQUATE | +12 / −5 | recomendada; `riesgo_feminicidio_valorado`, `medidas_proteccion_activadas`, `asesoria_derechos_realizada`; `riesgo_victima` −25, `ruta_institucional` +20 |
| C1 `c1-patrones-infancia` | RISKY | −5 / +10 | riesgosa (psicologiza la elección de pareja) |
| C2 `c2-2126-1098-1257` / `c2-1098-1257` / `c2-eje-1448` | ADEQUATE / RISKY / RISKY | +10,−5 / +3,+4 / −5,+8 | recomendada / aceptable / riesgosa |
| C3 `c3-parcial-clinica`, `c3-valoracion-dependientes` | RISKY, RISKY | 0,+8 / +5,0 | riesgosa / aceptable (`valoracion_dependientes_realizada`, `derivacion_salud_mental_activada`) |
| C3 `c3-integral-derechos` | ADEQUATE | +12 / −5 | recomendada; `riesgo_victima` −15, `rigor_tecnico` +15 |

Observación (desajuste): varias opciones de severidad «aceptable» están clasificadas `RISKY` y por eso restan confianza y suben riesgo en las métricas genéricas (`userTrust`, `victimRisk`) aunque el registro del caso las trate bien. La evidencia previa solo se exige en 4 nodos (§5.5). Los 4 finales dependen de severidades y banderas (`compute_ending`).

**Doce momentos concretos** (localizables por clave; C = texto/retratos/interrupciones, E = red de la consultante y pistas, F = tensión verbal).

| ID | Dónde (nodo · sala · objeto/NPC) | Qué ocurre (cita o paráfrasis breve) | Sirve a |
|---|---|---|---|
| M1 | `hospital-urgencias` · `hospital-urgencias` · `familia-crisis` (Abuela de la niña, líneas `anxious`) | Reclamos entrecortados: «¡Déjenme pasar! […] ¿Por qué nadie nos dice nada?» y «¡Dígame que están bien!». Hay una opción de herramienta «Aplicar PAP a la familia en crisis» (`pap-familia`, no es decisión puntuada) | C (habla alterada, interrupción de contención), F (tensión inicial alta, PAP como desescalada) |
| M2 | `hospital-urgencias` · `familia-duelo` (diálogo) | Con la enfermera `enfermera-urgencias` escuchada y la herramienta PAP usada, se desbloquea una línea (`positive`): «(La abuela respira un poco más despacio […]) Gracias por quedarse…» (`NODE_EVIDENCE['hospital-urgencias'].unlockLines`). Es el único ejemplo actual de texto que cambia con el estado | C, F |
| M3 | `hospital-urgencias` (decisión H1) · `familia-duelo` | Tres tonos ante la misma familia: comunicar la muerte de inmediato y sin protocolo (`h1-noticia-sin-protocolo`), contener con PAP (`h1-pap-contencion`) o interrogar a la sobreviviente (`h1-interrogar-victima`) | F (escalada vs. desescalada), E (quién puede hablar con quién) |
| M4 | `hospital-urgencias` · `medico-guardia` / `enfermera-urgencias` | «Nadie habla con ella hasta que esté estabilizada: ni familia, ni autoridades, ni nosotros.» / la familia «todavía no lo sabe con certeza» | E (pistas sobre la red y sus límites), F (contexto de M3) |
| M5 | `hospital-accion-etica` (decisión H3) · `psicologa-acompanante`; `trabajadora-social` | Comunicar la muerte por etapas (EPICEE/SPIKES, la herramienta es requisito de evidencia): «Sin protocolo no se da una noticia así». Opciones `h3-pap-epicee`, `h3-integral-psicosocial` | F (secuencia que desescala si no se salta ninguna etapa; inferencia), C |
| M6 | `hospital-cierre-bloque` · `hospital-sala-escucha-cierre` · `familia-duelo` («Familia acompañada») | «Gracias por no dejarnos solas en esto…» (`relieved`); «¿Qué sigue ahora para mi hija?» (`neutral`) | C (alivio contenido, sin celebración; pregunta abierta sin respuesta «correcta») |
| M7 | `comisaria-recepcion` · `expediente-caso` (OBJECT) | Expediente con la situación de la sobreviviente; es la compuerta de `puerta-consultorio` (`requiresInspected`). Es el prototipo actual de «pista que abre camino» | E |
| M8 | `comisaria-recepcion` · `sobreviviente-espera` (NPC `closed`) y `madre-acompanante` (`worried`) | La sobreviviente espera en silencio junto a su madre. La madre: «Desde el hospital no la dejo sola. Le digo que aquí sí la van a proteger… ¿verdad que sí?» | E (vínculo de acompañamiento), C (silencio como síntoma), F (pregunta que invita a sobreprometer) |
| M9 | `hospital-cierre-bloque` (decisión C1) · `comisaria-consultorio` · `sobreviviente-consulta` (`sad`, luego `anxious`) | «[…] las heridas duelen menos que todo lo demás.» y «Su familia me busca para que lo perdone, dicen que la familia se respeta. Yo solo quiero estar segura.» | C (dos climas en una escena), E (vínculo de presión familiar), F (presión a perdonar) |
| M10 | mismo punto (decisión C1) · `apoyo-psicosocial` | Tres respuestas a la misma frase: presionar a perdonar (`c1-mediacion-perdon`), valorar riesgo y proteger (`c1-riesgo-proteccion-derechos`) o psicologizar (`c1-patrones-infancia`). `apoyo-psicosocial`: la mediación con el agresor «no es una opción» | F (escalada máxima y su reparación), E (qué recursos institucionales la sostienen) |
| M11 | `comisaria-recepcion` · `orientadora-juridica`, `funcionaria-recepcion` | La comisaría puede dictar medidas de protección «sin que ella tenga que enfrentar al agresor» y orientar derechos económicos y de justicia | E (nodos institucionales: comisaría, hospital, salud mental) |
| M12 | `comisaria-accion-final` (decisión C3) · `profesional-psicosocial` | Valorar a la víctima y a «las personas dependientes o en situación de vulnerabilidad», su red familiar y las rutas de derivación a salud y salud mental (`c3-valoracion-dependientes`, `c3-integral-derechos`) | E (personas ausentes de la escena; cómo representarlas sin cosificarlas) |

## 8. Vocabulario común y reglas de coherencia

**Glosario (el nombre que deben usar las tres propuestas):**
1. **Intento** — `SimulationAttempt`; estados `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `REPLACED`; `SAFE_EXITED` es solo histórico.
2. **Pausa segura** (salida segura) — `PAUSED`, reanudable. «Reemplazo» (`REPLACED`) es otra cosa.
3. **Estrés del caso** — `stressIndex`. Los corazones muestran **calma** (100 − estrés).
4. **Puntaje formativo** — `accumulatedScore` (el HUD lo rotula «seguimiento formativo»).
5. **Confianza** — siempre `patientState.trustLevel` = `caseMetrics.confianza`. Para el valor genérico del motor: «confianza genérica» (`userTrust`).
6. **Crisis emocional** — `crisisLevel` = `caseMetrics.crisis_emocional`; en el roadmap «Reactividad». Usar «crisis emocional (Reactividad)» hasta que Psicología elija.
7. **SIC** — no usar hasta que Psicología lo defina (§9).
8. **Estado del paciente** — `patientState`: 4 campos derivados; **Métricas del caso** (`caseMetrics`, 7) y **Banderas del caso** (`caseFlags`).
9. **Tensión verbal** — carga de la conversación en curso (plan F). Distinta del **estrés** y de la **tensión del NPC** (estado relacional planeado en el spec premium).
10. **Evidencia** — requisito de compuerta ya existente (NPC visto, herramienta usada, objeto inspeccionado). **Pista** — hecho del caso hallado que revela o modifica un vínculo (E); toda pista puede registrarse como evidencia, no al revés.
11. **Persona** y **vínculo** (E) — nodos y aristas de la red; tipos de vínculo propuestos por el plan: apoyo, conflicto, neutral, desconocido. «Afinidad» numérica queda en discusión (§6).
12. **Emoción de línea** — `dialogue_lines.emotion`. Hoy hay 5 vocabularios (§9): la propuesta C elige el canónico y los demás lo usan.
13. **Variante de retrato** — `neutral|worried|sad|happy` (archivos actuales) frente a **estado de retrato** del manifiesto v1 (`PortraitState`).
14. **Interrupción** — acción del estudiante durante una línea de NPC (QTE del plan C); no confundir con «cerrar el diálogo» (Esc).
15. **Decisión** — `DecisionOption` clasificada; «conducta contraindicada» es el rótulo docente de `prohibitedConduct`.

**Reglas de coherencia — propuesta inicial, a confirmar con Psicología e Ingeniería:**
- **R1 Dueño de variable.**

| Variable | La mueve | Solo la leen |
|---|---|---|
| `stressIndex`, `accumulatedScore`, `userTrust`, `victimRisk` | motor de decisiones y herramientas existentes; ningún bloque añade escrituras nuevas sin acuerdo | C, E, F |
| `caseMetrics` / `patientState` (confianza, crisis, calidad del duelo) | registro `OPTION_EFFECTS` (propuesta: cualquier delta nuevo se pide ahí, no en un canal paralelo) | C (estilo de texto/retrato), F (tensión inicial), E |
| Tensión verbal | F (crea, mueve y reinicia) | C (estilo opcional) |
| Red social / pistas halladas | E | F (pistas como recursos), C (líneas desbloqueadas) |
| Estilo de texto, retrato e interrupción | C (solo presentación; no persiste estado propio) | — |

- **R2 Backend autoritativo.** El cliente no escribe estado; un hecho nuevo del cliente exige endpoint nuevo.
- **R3 No revelar.** Ningún dato enviado al cliente antes de elegir puede indicar la opción adecuada.
- **R4 Una tensión por concepto.** F no puede duplicar la «tensión del NPC»; si ambos coexisten, F declara cómo se relacionan.
- **R5 Una sola emoción canónica y un solo mapa de retratos** (decide C; E y F no inventan nombres).
- **R6 Eventos.** Tipos en MAYÚSCULAS_CON_GUION_BAJO, ≤ 48 caracteres, prefijo por bloque (propuesta), declarando si entran en la línea de tiempo del docente.
- **R7 Formativo.** Ninguna variable nueva altera `accumulatedScore` sin decisión explícita de Psicología.
- **R8 Alternativas.** Toda mecánica tiene versión sin tiempo, sin movimiento y sin depender del color, y ninguna pasa por encima de ETH-01, ETH-02 o REGLA-004.

## 9. Dudas y huecos

1. **Informe ADS no leído** (Artifact): la sección 2 viene de conocimiento general. Conviene que alguien con acceso confirme que ECD/LM-GM/MDA/INACSL se plantean allí como aquí.
2. **SIC** no está definido en ninguna parte; el roadmap solo la describe por sus «entradas».
3. **IDs RQ-NEG:** dos numeraciones (catálogo vs. `PROMPT_MIGRACION_DJANGO.md`); la hoja de ruta atribuye al catálogo nombres que son de la otra. Pendiente corregir la hoja de ruta (no se tocó).
4. **Doble significado** de Bloque E (panel pasivo vs. grafo de pistas) y Bloque F (medidor vs. minijuego en tiempo real). D1, D2 y D3 siguen abiertas.
5. **Cinco vocabularios de emoción:** (a) líneas del seed (`neutral, anxious, negative, sad, relieved`); (b) emoción de árbol mapeada (`neutral, concerned, danger, positive`); (c) emoción de NPC ambiental (`neutral, calm, worried, anxious, receptive, closed`); (d) mapa del manifiesto v1; (e) `DialogueEmotion` en español del plan C (`ansiedad`, `enojo`, `disociacion`…). El caso real no tiene enojo ni disociación explícitos (inferencia).
6. **Tres contratos de retrato** (PNG por variante, hoja 5×64×80 del plan, hoja 96×96 4×8 del manifiesto) y NPC del plan que no son los del caso.
7. **¿A quién sigue la barra de confianza en el hospital?** El HUD dice «paciente» pero la contraparte es la familia; la sobreviviente aparece desde la comisaría. Las métricas son globales del caso, no por persona.
8. **Retratos inalcanzables / sin retrato** (inferencia por lectura): emociones crudas caen a `neutral`; NPC ambientales sin retrato. No ejecutado.
9. **Planes de julio** (spec premium y 6 planes): no implementados, con estado «pendiente de revisión»; se solapan con C (máquina de escribir, retratos, movimiento reducido) y con F (tensión por NPC). Hay que decidir si siguen vigentes antes de que las propuestas los citen como autoridad.
10. **Concurrencia de `flags_json`:** no verifiqué si dos peticiones simultáneas podrían pisarse (lectura sin bloqueo); es relevante si E o F escriben más claves.
11. **No se verificó en ejecución:** salida segura con diálogo abierto (leído en plantilla y manejador), ni el comportamiento real de retratos, ni qué rúbrica está activa en la BD, ni la interfaz del docente con tipos de evento nuevos.
12. **Inconsistencias menores:** `event_type` 48 (BD) vs. 50 (modelo); `competency` 80 vs. 100; `computeOutcome` citado por el roadmap pero inexistente; spec de HUD (2026-06-08) cita `verbalTension` como input real.
13. **Revisión SME pendiente** del texto de ETH-01 y de las consecuencias del caso (protocolo congelado como `PENDING` en los planes de julio); recursos de apoyo institucionales en la advertencia siguen `BLOCKED_EXTERNAL`.
