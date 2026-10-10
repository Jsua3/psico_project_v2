# Backlog ejecutable: SIEP SIM-VBG-001 (orientación, interacción y sensación de juego)

> **Estado (2026-10-04):** ejecutado casi todo salvo T9.12 (decisión en dos tiempos), el informe de grupo/CSV con reintentos y los carriles de H T11/T13/T15. Qué se hizo, qué no y las preguntas abiertas: [`docs/informes/2026-10-04-informe-sesion-jugabilidad.md`](../../informes/2026-10-04-informe-sesion-jugabilidad.md).

Diseño de referencia: `design/FINAL.md` (las secciones se citan como «F§n»). Base: `master` @ `51d1409`. Estimaciones mías, sin calibrar (S < 0,5 d, M 0,5-2 d, L > 2 d).

Este backlog se ejecuta por **pistas** con archivos exclusivos. Si dos pistas tocan el mismo archivo, van en secuencia (`depends_on`). Los tres archivos grandes (`game-world.component.ts`, `simulation-play.component.ts`, `simulation-hud.component.ts`) tienen un dueño a la vez; la lógica nueva va en archivos nuevos con spec.

Prioridad de cada tarea: **P0** bloqueante o ético (no se publica sin ella) · **P1** núcleo de «se sabe qué hacer» · **P2** pulido · **P3** opcional.

---

## 1. Reglas comunes a todas las pistas

1. **Antes de empezar**: línea base verde (T0.1). Tras cada pieza: `cd frontend && npx jest --runInBand src/app/features/simulator src/styles`; si toca backend, `cd backend_django && pytest apps/simulation`. Los 13 specs de contrato leen los monolitos como texto (F§9.3): si un cambio toca un texto fijado, se actualiza el spec **en el mismo commit**; las regex nuevas usan `\s*` (el checkout es LF).
2. **Clases nuevas distintas de `close-btn`** en cualquier botón nuevo dentro del diálogo: los e2e (`clickCurrentDialogueAction`, `siep-flow.ts:477`) y `requestDialogueFocus` buscan `.close-btn`; un botón nuevo con esa clase sería pulsado por los e2e y pausaría el intento.
3. **Ningún texto, color, icono, orden o anillo codifica cuál opción de decisión es la adecuada** (límite 1). Los archivos nuevos no leen `classification`, `prohibitedConduct`, `isRecommended` ni `isProhibited` (spec estático en T2.8).
4. **Textos visibles en español con tildes**; nunca un identificador interno (`enfermera-urgencias`, `PAP@familia-crisis`) en pantalla.
5. **Nada nuevo en `update()` de Phaser** salvo el cálculo de proximidad ya existente, sin asignaciones por cuadro (59 FPS). `game-world.frame-budget.spec.ts` debe seguir con exactamente 2 `this.children.removeAll(true)` y 1 `this.callbacks.onPosition(`.
6. **Sin `backdrop-filter`** en paneles nuevos; sin animación nueva (anillo y avisos estáticos); sin temporizadores esenciales; movimiento reducido respetado.
7. **No re-sembrar la base** (`seed_caso_pdf.py` borra los intentos de la versión y reinicia la contraseña del administrador): los textos del seed que están mal se sobrescriben en el frontend.
8. **No tocar** `safeExit()` ni su prueba, el aviso ETH-01, el backend Spring, migraciones ni modelos (`managed=False`).
9. Hacer commits pequeños por tarea; no mover código existente de los monolitos.

---

## 2. Cortes de entrega y calendario

| Corte | Qué resuelve | Pistas y tareas | Llega (calendario, 5-6 carriles) | Puerta de salida |
|---|---|---|---|---|
| **C0 «Sin callejones»** | Todos los bloqueantes del playtest: salida segura en todos los estados, panel de decisión que no se atasca ni ofrece decisiones de otra etapa, sin decisión accidental | T0, T1, T4 (4.1-4.5), T8, T12 (12.1-12.2), T11 (11.1-11.5), T2 (2.0, 2.7) | ≈ día 5 | AC-2, AC-3, AC-7, AC-10; `consent-gate` ampliado; Jest verde |
| **C1 «Se sabe qué hacer»** | Lista «Qué hacer», barra con verbos y NPC, puertas con motivo, ayuda, un solo contador, escala del canvas | T2, T3, T5 (5.1-5.6), T7 (7.1-7.4), T9 (9.1-9.9, 9.11), T14 (14.1-14.4), T4 resto | ≈ día 9 | AC-1, AC-4, AC-5, AC-6, AC-8 (playtest con 5 estudiantes); e2e `full-case` verde |
| **C2 «Se siente bien»** | Táctil compacto, decisión en dos tiempos, audio, cierre, CI y plataforma, verificación final | T6, T10, T9 (9.10, 9.12), T13, T12 (12.3-12.4), T14 (14.5-14.6), T15, T11 (11.6), T7 (7.5) | ≈ día 11-12 | AC-9, AC-11; verificación 14.6 en tres viewports |

Total: **26-32 días-persona** (inferencia; los tres diseños estimaban 7-11 días **sin** pruebas e2e, backend, cumplimiento, diagnóstico ni la decisión en dos tiempos). Con cinco o seis agentes en paralelo, 11-12 días de calendario; C0 sale solo y elimina todos los bloqueantes.

### Olas de paralelismo

| Ola | Pistas que arrancan | Pueden arrancar cuando |
|---|---|---|
| 0 | T0 | de inmediato |
| 1 | T1, T2 (empezando por 2.0 y 2.7), T4, T5, T7, T11, T12, T13, T15 | T0.1 verde; T12 y T4 usan T1 al mergear (T1 son 0,5 d) |
| 2 | T3 (tras T2.0), T6 (tras T5), T8 (tras T1, T4.1-4.3, T2.0 y T2.7) | las dependencias de la columna |
| 3 | T9 | T8, T2, T3, T5 (5.1-5.3, 5.5), T7 (7.1) |
| 4 | T10 (T9 y T6), T14 (progresivo desde T5.2; 14.6 al final) | |

---

## 3. Mapa de pistas y archivos exclusivos

| Pista | Nombre | Archivos exclusivos | Depende de | Esfuerzo |
|---|---|---|---|---|
| T0 | Línea base y diagnóstico | `docs/informes/2026-10-03-diagnostico-enfermera-y-escala.md` (nuevo) | — | S-M |
| T1 | Botón de salida segura | `safe-exit-button.component.ts(+spec)` (nuevo) | T0 | S |
| T2 | Orientación: datos y lógica pura | `orientation.config.ts`, `stage-route.config.ts`, `scene-checklist.util.ts`, `place-hint.util.ts`, `evidence-copy.util.ts`, `door-status.util.ts`, `dialogue-decoration.util.ts`, `interaction-verb.util.ts`, `help-memory.util.ts`, `visited-rooms.util.ts` (todos nuevos, con spec), `no-classification-leak.spec.ts`, `evidence-gating.config.ts(+spec)`, `scene-objectives.config.ts`, `simulation.model.ts` | T0 | L |
| T3 | Orientación: componentes de interfaz | `scene-checklist-card.component.ts(+spec)`, `game-help.component.ts(+spec)`, `game-help.content.ts(+spec)` (nuevos), `overlay-blur.contract.spec.ts` | T2 (tipos) | M |
| T4 | Panel de decisión y retratos | `dialogue-panel.component.ts`, `dialogue-panel.component.spec.ts`, `dialogue-panel.motion.spec.ts`, `portrait-resolver.util.ts(+spec)`, `dialogue-keys.util.ts`, `dialogue-progression.util.ts` | T1, T2 (campos del modelo) | L |
| T5 | Mundo: interacción y sensación | `game-world.component.ts` (zona Phaser y escala), `interaction-priority.util.ts(+spec)`, `interactables-reachable.spec.ts` (nuevo), `game-world.frame-budget.spec.ts`, `game-world.game-feel.contract.spec.ts`, `game-world.loading.contract.spec.ts`, `keyboard-capture.contract.spec.ts`, `scene-renderer.registry.spec.ts` (solo vigilar) | T0 (T0.2, T0.3 informan), T2 (`interaction-verb`) | L |
| T6 | Mundo: táctil | `game-world.component.ts` (plantilla y estilos de controles), `game-world.touch.contract.spec.ts` | T5 | M |
| T7 | HUD, dock y lobby | `simulation-hud.component.ts`, `simulation-hud.settings.spec.ts`, `tool-inventory.component.ts`, `game-menu.component.ts(+spec)`, `hud-dock.util.ts(+spec)` (se borra), `styles/a11y-bloque-h.contract.spec.ts` (bloque del HUD) | T0 | M |
| T8 | Integración: salida segura y flujo del diálogo | `simulation-play.component.ts` (zonas de seguridad y diálogo), `simulation-play.consent-gate.spec.ts`, `simulation-play.intro.contract.spec.ts`, `simulation.model.ts` (quitar campos de ayuda visual, tras T2) | T1, T4 (4.1-4.3), T2 (2.0, 2.7), T12 (12.2) | L |
| T9 | Integración: orientación | `simulation-play.component.ts` (zonas de orientación), `simulation-play.game-feel.contract.spec.ts` | T8, T2, T3, T5, T7, T13 (para 9.10) | L |
| T10 | Integración: compacto | `simulation-play.component.ts` (estilos y plantilla compactos) | T9, T6, T7 | M |
| T11 | Backend | `backend_django/apps/simulation/services/{game_service,case_effects,world_service}.py`, `serializers/game_dtos.py`, `tests/test_game.py`, `tests/test_world*.py` | T0 | M |
| T12 | Pausa, bitácora y resultado | `attempt-outcome.component.ts(+spec)`, `journal-panel.component.ts`, `simulation-view-mode.util.ts(+spec)` | T1 | M |
| T13 | Audio y umbrales de estrés | `audio-director.service.ts(+spec)`, `stress-tier.util.ts(+spec)` (nuevo) | T0 | M |
| T14 | Pruebas e2e y CI | `frontend/e2e/**`, `.github/workflows/*` | T5, T9 (progresivo) | L |
| T15 | Plataforma, cumplimiento y portada | `backend_django/psychosim/settings/{base,production}.py`, `apps/simulation/views/ai_assistant.py`, `apps/simulation/tests/test_ai_assistant.py` (nuevo), `apps/simulation/management/commands/seed_caso_pdf.py` (solo la línea de la contraseña), `README.md`, `docs/operacion/despliegue-railway.md`, `frontend/src/app/features/public/*`, `frontend/src/app/features/simulator/simulation-catalog.component.ts`, `frontend/src/app/shared/layout/shell.component.ts`, `frontend/src/app/features/dashboard/dashboard.component.html`, `frontend/src/assets/characters/v1/roster.v1.json` | — | M-L |

Archivo compartido en secuencia: `game-world.component.ts` (T5 → T6), `simulation-play.component.ts` (T8 → T9 → T10), `simulation.model.ts` (T2 → T8). Contratos de texto compartidos por sección (hunks distintos): `styles/a11y-bloque-h.contract.spec.ts` (T7 el bloque del HUD; T4/T8 no necesitan cambiarlo si respetan las regex de F§9.3).

---

## 4. Pistas y tareas

### T0 · Línea base y diagnóstico (S-M)

Objetivo: partir de un estado conocido y confirmar con datos las dos causas que la lectura de código no pudo confirmar.

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T0.1** Línea base | P0 | `cd frontend && npx jest --runInBand src/app/features/simulator src/styles`, `npm run build`, `cd backend_django && pytest apps/simulation`. Registrar conteos, duración y fallos preexistentes (no se arreglan aquí) | El informe lista conteos y fallos; Jest y pytest verdes o con fallos conocidos anotados |
| **T0.2** Diagnóstico de la enfermera (PLAY-KB-03) | P0 | Con `playkit.mjs` (`openGame` + `hold`) y su cuenta asignada: caminar hasta ≤ 50 px de (560,330) y pulsar E 3 veces; registrar `response`/`requestfailed` de `POST …/npcs/enfermera-urgencias` (estado y cuerpo), la posición del contenedor del NPC (`container.x,y`) y `nearestKey`. Resultados posibles: 4xx «Estás demasiado lejos del NPC» → radio o posición persistida; sin petición → `openNpcDialogue` salió pronto (`busy`/`inputBlocked`, `simulation-play.component.ts:1532`); 2xx → fallo de presentación; etiqueta ausente → el jugador no entraba en el radio | Informe de una página con la captura de red y la conclusión; decide qué parte de T5.2/T11.4 es causa y cuál endurecimiento |
| **T0.3** Diagnóstico de la escala del canvas (FEEL-03, TOUCH-04) | P1 | Medir `getBoundingClientRect` de `.canvas-zone`, `.phaser-host` y `canvas`, y `scale.parentSize`/`canvasBounds`, antes y después de abrir y cerrar un diálogo (1366x768) y de acercarse a un objeto (844x390). Comprobar si el host recupera su tamaño y Phaser no (V1, F§1.2) o si crece una fila del pie | Informe con las cuatro medidas y la causa; fija si basta `getParentBounds()` + `refresh()` o hace falta panel flotante en escritorio |

### T1 · Botón de salida segura (S)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T1.1** Componente `app-safe-exit-button` | P0 | Presentacional: `input compact`, `output pause`; texto visible «Salida segura» y nombre accesible igual (WCAG 2.5.3); mínimo 44x44 px; anillo de foco `#f1a79f` (contraste ≥ 3:1 sobre el fondo del juego); `<kbd>Esc</kbd>` solo bajo `@media (hover: hover) and (pointer: fine)`; clases propias (no `close-btn`); sin `backdrop-filter` | `safe-exit-button.component.spec.ts`: nombre accesible = texto visible; emite `pause` al activarse; el `kbd` solo existe tras la media query (contrato de fuente); tamaño mínimo 44 px |

### T2 · Orientación: datos y lógica pura (L)

Orden recomendado: 2.0, 2.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8. Todo puro: sin Angular ni Phaser; firmas en F§6.3.

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T2.0** Esqueleto de tipos y campos del modelo | P0 | Publicar las interfaces y firmas exportadas (`SceneLogState`, `SceneLogInput`, `StageRoute`, `RouteStep`, `DecorationCtx`, `CopyContext`, `DoorStatus`, `MissingItem`) con cuerpos mínimos y, en `simulation.model.ts`, los campos opcionales de solo presentación `DialogueState.notice?`, `DialogueState.stale?` y `DialogueChoiceState.toolMissing?`, para desbloquear T3, T4, T8 y T9 el mismo día | Compila; los otros carriles importan los tipos y los campos |
| **T2.7** `dialogue-decoration.util.ts` + `interaction-verb.util.ts` | P0 | `decorateDialogueState` según F§7.6: filtra por `nodeOptionIds`, conserva herramientas, línea de «otro momento», un solo aviso, `toolMissing`; `activeDecisionObjectKeys` y `otherStageDecisionKeys`; verbos de F§4.3 | `dialogue-decoration.util.spec.ts` y `interaction-verb.util.spec.ts` (casos de F§9.1); con `nodeOptionIds` `null` o vacío no filtra |
| **T2.1** `orientation.config.ts` | P1 | Banderas (`NAME_TOOLS_IN_HINTS=false`, `HIGHLIGHT_TOOL_TARGETS=true`, `SAFE_EXIT_ALWAYS_REACHABLE=false`), `ROUTE_ORDER`, `ROOM_LABELS`, `ROOM_GRAPH`, `ENTITY_NAMES` (nombre con artículo y sala de cada NPC y objeto del seed), `TOOL_HINTS`, textos de F§5.1 y F§5.6 | `orientation.config.spec.ts`: toda clave de `NODE_EVIDENCE` y todo `requires*` de puertas del seed tiene nombre humano (lee `seed_caso_pdf.py`); con las banderas por defecto ninguna salida contiene `PAP`, `SPIKES`, `RISK_METER` |
| **T2.2** `place-hint.util.ts` | P1 | Bandas de F§7.3; opción `door` | `place-hint.util.spec.ts` con la tabla de coordenadas de F§7.3 y los bordes de banda |
| **T2.3** Texto de lo que falta | P1 | `missingEvidenceItems` en `evidence-gating.config.ts` (`missingEvidence` se conserva con sus cadenas `npc:`/`tool:`/`inspected:`); corregir «Informacion» sin tilde (`:67`); `evidence-copy.util.ts` con `humanizeMissing`, `imperativeMissing`, `joinSpanish` (mueve el `joinSpanish` privado de `simulation-play.component.ts:1754`) | `evidence-copy.util.spec.ts` y ampliación de `evidence-gating.config.spec.ts` (F§9.1); los casos existentes de `missingEvidence` pasan sin cambios |
| **T2.4** `stage-route.config.ts` | P1 | Las 6 etapas con los textos exactos de F§5.2 (`needs`, `lockedNote`, `carryOver`, `labelNamed`); título e introducción por etapa | `stage-route.config.spec.ts`: los pasos `prep` equivalen a `NODE_EVIDENCE`; cada `targetKey` existe en el seed (lee `seed_caso_pdf.py`); vocabulario prohibido y tildes (F§9.1) |
| **T2.5** `scene-checklist.util.ts` | P1 | `deriveSceneLog`, `roomGroupOf`, `firstHop`, `diffDone`, `ringTargetKey` según F§7.1-7.2; respaldo derivado para nodos sin ruta | `scene-checklist.util.spec.ts` table-driven por etapa y sala (F§9.1), incluido `nextLine` entre salas, regla monótona, producto cartesiano sin slug ni vocabulario prohibido |
| **T2.6** `door-status.util.ts` | P1 | `doorStatus` y `doorBlockedMessage` según F§5.4 y F§7.5 | `door-status.util.spec.ts`: `open`/`locked` con `requiresInspected`, `requiresNpcs`, `requiresTools` y `requiresNodes`; «Te queda 1 decisión» en singular |
| **T2.8** Utilidades de memoria y guardas | P1 | `help-memory.util.ts` (`siep.ayuda.v1`, `try/catch`, respaldo en memoria), `visited-rooms.util.ts` (`sessionStorage`, misma robustez), `no-classification-leak.spec.ts` (los archivos nuevos no contienen `classification`, `prohibitedConduct`, `isRecommended`, `isProhibited`), `SCENE_PROGRESS.stepLabel` sin el prefijo «Paso k — » (se conserva `step`) y helper `getStageTitle` | Specs de memoria con `getItem` que lanza y esquema `{v:1, vistas:[]}`; el spec estático falla si alguien lee la clasificación |

### T3 · Orientación: componentes de interfaz (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T3.1** `scene-checklist-card.component.ts` | P1 | Presentacional, entradas de F§6.4. `<section>` con `<ol>`; cada fila empieza con texto oculto de estado; filas **no** son botones (evita colisionar con `getByRole('button', {name: /familia en crisis/i})`); una región `aria-live="polite"` para la nota; botón «Ocultar pasos»; chip plegado `Qué hacer · {n}` en compacto; sección `<details>` «También en esta sala»; sin `setTimeout`/`setInterval`, sin `animation:`, sin `backdrop-filter`; atributos `data-next-step` y `data-next-room` | `scene-checklist-card.component.spec.ts` (F§9.1) y entrada nueva en `overlay-blur.contract.spec.ts` para su panel |
| **T3.2** `game-help.content.ts` + `game-help.component.ts` | P1 | Textos exactos de F§5.8: tarjeta de primera vez (teclado, táctil, compacto) y pantalla permanente; no modal, sin temporizador, no roba foco, no consume Esc; la frase de salida segura depende de `SAFE_EXIT_ALWAYS_REACHABLE`; «Entendido» y «Más ayuda» de 44 px; usa `help-memory.util` | `game-help.component.spec.ts` y `game-help.content.spec.ts`: sin «1 a 5», sin botón «Salida segura», tildes, sin técnicas, la promesa de pausa condicionada |

### T4 · Panel de decisión y retratos (L)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T4.1** Cabecera fija con «Volver al mapa» y «Salida segura» | P0 | `position: sticky; top: 0`; chip «Decisión clínica» si procede; `<app-safe-exit-button>` con salida `safeExit`; «Volver al mapa» emite `close`; clases distintas de `close-btn`; presentes con y sin opciones, en modo lateral y cinemático y con la supervisión | Spec: con opciones están «Volver al mapa» y «Salida segura»; el e2e `closeDialogue` sigue encontrando solo `button.close-btn` |
| **T4.2** `releaseToken` | P0 | `input(0)`; un `effect` pone `chosenKey = null` al cambiar | Spec: tras un `releaseToken` nuevo, `chosenKey` queda `null` y las opciones vuelven a ser activables |
| **T4.3** Sin decisión accidental | P0 | Con opciones visibles se enfoca el grupo `.choices` (`tabindex="-1"`), no una opción; un clic con `event.detail === 0` en los primeros 500 ms tras mostrar las opciones se ignora | Spec: con opciones no hay foco en `.choice-btn` y sí dentro del diálogo (aserciones de `dialogue-panel.component.spec.ts:109,117,129` intactas); Enter con opciones no emite `execute` |
| **T4.4** Scroll, hoja y retrato | P1 | `ngAfterViewChecked` ancla abajo solo mientras se escribe; al aparecer las opciones `scrollIntoView({block:'nearest'})` una vez; retrato lateral con altura `clamp(96px, 18vh, 150px)`; solo las opciones se desplazan | Captura 844x390: las opciones 1 y 2 se ven y se pueden tocar (TOUCH-01); spec del ancla |
| **T4.5** Aviso, subtítulos y chips | P1 | Aviso único de evidencia sobre las opciones (`d.notice`); quitar la insignia por opción y «(información incompleta)» del `aria-label` (el e2e `chooseDecision` exige que no aparezca); opción con herramienta ausente `aria-disabled` y chip (F§5.7); subtítulos «Usar una herramienta»/«Decisión clínica»; pista de teclado solo con puntero fino; línea de «otro momento» para `stale`; respetar los pins de `a11y-bloque-h` (F§9.3) | Spec: un solo aviso y sin insignia por opción; opción con herramienta ausente `aria-disabled`; los pins de contraste siguen verdes |
| **T4.6** Retratos y emociones | P1 | `resolvePortraitAsset` devuelve solo assets que existen (tabla por personaje), alias (F§7.11), `positive → happy` solo para la psicóloga; quitar chip y etiqueta de emoción para personas (se conservan `emotionColor()` y `.emotion-tag` por el contrato) | `portrait-resolver.util.spec.ts`: alias; caída a `neutral` si falta la variante; sin `happy` para `madre-vbg` ni `paciente-vbg` |
| **T4.7** Nombres accesibles y sonido | P2 | «Continuar» con nombre accesible `Continuar` (hoy «Cerrar diálogo (Esc)»); `onChoiceHover` suena solo con foco de teclado | Spec del nombre; e2e `closeDialogue` actualizado en T14.2 |

### T5 · Mundo: interacción y sensación (L)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T5.1** `pickNearby` y alcanzabilidad | P0 | Función pura y constantes de F§6.3/F§7.4; `interactables-reachable.spec.ts` | `interaction-priority.util.spec.ts`: rejilla de 27 posiciones generada (persona principal en 26, puerta en 1), empate, histéresis, secundario, vacío, y los 3 tests actuales; spec geométrico: para cada interactuable existe un punto libre a ≤ 60 px (`collidesInCaseRoom`) |
| **T5.2** Unificar marcadores y NPC | P0 | `updateNearestInteraction` (`:2292-2335`) une marcadores (74) y NPC (72) en una lista de trabajo reutilizada y llama a `pickNearby`; emite `onProximity(principal)` (NPC como `MapObjectState` sintético `npc:{clave}`) y `proximityAlso`; `interactNearest` (`:771-779`) despacha por clave; `NPC_INTERACT_RANGE` 60 → 72; conservar `isAnyNpcInRange` y `nearbyInteractionChannel` | Con una persona a ≤ 60 px la barra la ofrece; la puerta a igual distancia pasa a secundaria; `game-world.frame-budget.spec` y los otros 4 contratos de mundo siguen verdes |
| **T5.3** Anillo, rótulos y estados | P1 | F§7.2: `nextTargetKey`, `doorStates`, `dimmedKeys`; anillo estático bajo los actores; rótulos del destino + 2 más cercanos dentro de 140 px (1 en táctil); `labelScale` para ≥ 12 px de pantalla; rótulo de puerta con candado y borde discontinuo; atenuado alfa .55; actualización solo al cambiar el conjunto visible | Captura 1366x768 y 844x390: el anillo se ve bajo los sprites y los rótulos miden ≥ 12 px; sin solapes con tres personas cerca; sin trabajo nuevo por cuadro |
| **T5.4** Escala del canvas | P1 | Según T0.3: en el `ResizeObserver` (`:2681-2685`) llamar `scale.getParentBounds()` y luego `scale.refresh()`; método público `refreshScale()`; si T0.3 muestra otra causa, aplicarla (panel flotante en escritorio como plan B) | e2e AC-5: el canvas recupera su tamaño (±2 px) al cerrar un diálogo (lo escribe T14.3) |
| **T5.5** E sin nada cerca | P2 | Salida `nothingNearby` cuando `interactNearest()` no encuentra objetivo | Spec de la escena con dobles de Phaser: emite una vez y no suena error |
| **T5.6** Pista de NPC en táctil | P2 | `▲ E` → `▲` bajo `pointer: coarse` (`:1446`, `:1491`) | Captura táctil sin la letra E |

### T6 · Mundo: táctil (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T6.1** Cruceta en cruz y bandas laterales | P1 | `.touch-controls` pasa a `left/right/bottom: 8px; justify-content: space-between; pointer-events: none` con hijos `auto`; flechas agrupadas en `.touch-dpad` con rejilla en cruz de 3x3 (48 px); se conservan los atributos `(pointerdown)="holdDirection($event, 'up')"` y compañía, los cuatro `pointerup/pointercancel/lostpointercapture` y la regla literal `@media (pointer: coarse) { .touch-controls { display: grid; } }` | `game-world.touch.contract.spec.ts` verde (o actualizado en el mismo commit); captura 844x390: la cruceta no tapa el piso |
| **T6.2** «Interactuar» con verbo | P1 | Etiqueta dinámica desde `nearbyInteraction` con `interaction-verb.util`; sin nada cerca `Acércate a algo` atenuado; nombre accesible = etiqueta; se conserva la clase `.touch-interact` (la usa el e2e) | Captura: «Hablar con Enfermera de urgencias»; el e2e táctil sigue pulsando `.touch-interact` |
| **T6.3** Verificación 667x375 | P2 | En anchos < 700 px los controles son semitransparentes sobre el mundo | Captura 667x375 |

### T7 · HUD, dock y lobby (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T7.1** Cabecera | P1 | Chip de etapa «Decisión k de 6» (entrada `stageLabel` desde T9); quitar el bloque `.hud-step` (`:48-53`) y `sceneProgress()`; chip central = título de la etapa; arreglar solapes entre 961 y 1200 px y el nombre de sala colapsado a 0 px (HUD-10); botón `help` con salida `openHelp` y `aria-label="Abrir cómo se juega"`; `aria-label` de la bitácora sin «(J)» bajo `pointer: coarse`; icono distinto (casa) para «Volver al catálogo»; etiquetas ≥ 12 px; cabecera de 44 px en compacto | `simulation-hud.settings.spec.ts` verde; hunk del HUD de `a11y-bloque-h.contract.spec.ts` actualizado en el mismo commit; sin `HostListener('document:keydown')` genérico |
| **T7.2** Ajustes | P1 | Filas «Cómo se juega» y «Ver la ayuda otra vez» (borra `siep.ayuda.v1`) | Spec: las filas existen y no añaden oyentes globales |
| **T7.3** Dock | P1 | Contador «Herramientas {n} de {m}» en el `aria-label`; quitar las insignias 1-5 (no hay atajo); ranuras bloqueadas `aria-disabled` (enfocables) con `title` «Se consigue explorando las salas del caso.»; nombre completo en `title`; mínimo 12 px; 44 px con puntero grueso | Spec del dock; captura sin números ni recortes ilegibles |
| **T7.4** Lobby | P2 | Botón DOM «Cómo se juega» sobre el lobby; texto de teclado oculto con `pointer: coarse` | `game-menu.component.spec.ts` ampliado |
| **T7.5** Limpieza y umbrales | P2 | Borrar `hud-dock.util.ts(+spec)` (código muerto verificado); usar `stress-tier.util` (de T13) en las etapas del HUD | `grep` sin importaciones; Jest verde |

### T8 · Integración: salida segura y flujo del diálogo (L)

`simulation-play.component.ts`, zonas de teclado, intro, pausa y diálogos.

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T8.1** `pauseFromOverlay()` y reanudar | P0 | F§7.8: guardas (sin intento `IN_PROGRESS`, `showResumePrompt`, `showContentWarning`), cola con `busy`, `ui_cancel`, `withSyncedPosition(() => pauseCurrentAttempt())`; limpieza en el `next` de `pauseCurrentAttempt` (`journalOpen`, `showIntroScene`, `showCaseIntro`, `helpOpen`, evidencia pendiente, restricción pendiente, `pendingDecisionResult`, `stopIntroLament`); `resumeCurrentAttempt()` llama `maybeShowInitialCaseIntro`; Esc en introducción y contexto antes del chequeo `BUTTON/A`; cadena de Esc ayuda → bitácora → diálogo → pausa | `consent-gate.spec` ampliado (F§9.1): `pauseFromOverlay` con diálogo con opciones llama una vez a `sim.safeExit`; pausar desde la introducción deja las banderas en falso; reanudar con introducción sin leer la reabre; Esc bajo ETH-01 no pausa; `safeExit()` y `:191-202`, `:403-413`, `:482-496` verdes |
| **T8.2** Botones y texto honesto | P0 | `app-safe-exit-button` en las tarjetas de introducción y contexto (a la izquierda de «Continuar»; se conservan `<h2 id="intro-scene-title">Antes de comenzar</h2>`, el botón `Continuar` exacto, los 2 `intro-music-toggle` y `.case-intro-card__actions > span {`); conectar `(safeExit)` de los dos `<app-dialogue-panel …/>` (siguen siendo exactamente 2, con `[reduceMotion]`) y de la bitácora; aviso de contenido y nombres accesibles sin «(Escape)» | `simulation-play.intro.contract.spec` y `a11y-bloque-h` verdes; e2e AC-2 (T14.4) |
| **T8.3** Diálogo sin callejones | P0 | `decorateDialogue` delega en `decorateDialogueState` (pasar `nodeOptionIds`); `releaseToken` incrementa en todo error de `executeDecision`, `useTool` y apertura; errores con `apiErrorMessage`; `startNewAttempt` limpia `dialogue`, `selectedInteraction` y `journalOpen`; `closeDialogue` limpia `selectedInteraction` (DLG-31) | Jest: ningún objeto ofrece opciones de otra etapa (AC-3); elegir una opción que falla libera el panel |
| **T8.4** Quitar la clasificación del cliente | P1 | Eliminar `classification` y `prohibitedConduct` de `SimulationDecisionOption`, `isRecommended`/`isProhibited` de `DialogueChoiceState` y sus asignaciones (`:1354`, `:1386`, `:1394`, `:1770`) | Compila; `no-classification-leak.spec` verde; coordinar el momento con T11.5 (backend) |

### T9 · Integración: orientación (L)

`simulation-play.component.ts`, zonas de orientación. Depende de T8 (misma pista de archivo), T2, T3, T5, T7 y T13 (para 9.10).

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T9.1** Tarjeta «Qué hacer» | P1 | `visitedRooms` (señal + `markRoomVisited` desde `applyLoadedWorld`), `sceneLog = computed(deriveSceneLog…)`, sustituir el contenido de `.objective-card` (`:234-247`) por `<app-scene-checklist-card>` **conservando el envoltorio `.objective-card` y su CSS** (contrato `overlay-blur`); dejar de usar `getSceneObjective`; el párrafo sensible sale de la tarjeta | Etapa 1 jugable con la lista; ninguna cadena visible del objetivo antiguo (AC-1) |
| **T9.2** Contador único y etapa nueva | P1 | `currentStageLabel()` y `progressLabel()` → «Decisión k de 6» (respaldo al contador antiguo si el nodo no tiene `SCENE_PROGRESS`); efecto sobre `currentNode.key`: banner «Nueva etapa: …» aunque no cambie `map.key` (`announceRoomChange` solo corre al cambiar el mapa, `:1874-1880`) y variante «Decisión {k-1} registrada» de la tarjeta; sin reaparecer al recargar | Spec con instancia: cambia el nodo → banner y variante; recarga → no |
| **T9.3** Barra contextual | P1 | Botón principal con verbo por tipo (`interaction-verb.util`), una línea de altura fija, candado y motivo en puertas bloqueadas, botón secundario `context-bar__interaction--secondary` con `<strong>`, línea «Ahora: …» con clase `.context-bar__now` (se conserva `.context-bar__hint` con su CSS para la leyenda, solo con puntero fino y ancho ≥ 1150 px); nombre accesible con prefijo «Interactuar:» sin «(atajo E)» | e2e: `nearbyAction` encuentra `button.context-bar__interaction` con su `<strong>`; `contrast.contract.spec` verde |
| **T9.4** Puertas | P1 | `tryOpenDoor` usa `doorStatus` y `doorBlockedMessage`; `doorStates = computed(...)` hacia el mundo; se conserva la histéresis, el fundido y `enterRoom` | Spec: el motivo coincide en barra, aviso y lista; e2e: la puerta cerrada explica por qué sin identificadores |
| **T9.5** NPC y secundario | P0 | `openInteraction` encamina `npc:{clave}` a `openNpcDialogue`; `proximityAlso` → `nearbyAlso`; `nothingNearby` → texto estático de 2,5 s en la barra; ignorar `npc:` en la rama de E de `handleGlobalInteraction` | AC-6: persona a ≤ 60 px ⇒ botón `Hablar con …` y E abre su diálogo |
| **T9.6** Avisos | P1 | Recoger: aviso «Obtuviste: {etiqueta}…» con `unlockedToolCode` (`:1246-1253`); notas «Anotado: …» con `diffDone` encoladas mientras `dialogue()` esté abierto; errores con `apiErrorMessage` (F§5.6); aviso no esencial de 4,2 s con `role="status"` | Spec con instancia: pickup, nota y cola con diálogo abierto |
| **T9.7** Evidencia humanizada | P1 | `evidenceMissingMessage` delega en `humanizeMissing`; quitar `evidenceNpcLabel`/`evidenceToolLabel`; el diálogo «Criterio profesional» usa el mismo aviso | Jest: ningún texto de evidencia contiene un slug (AC-4) |
| **T9.8** Ayuda | P1 | `<app-game-help>` (tarjeta de primera vez tras ETH-01, introducción y contexto; nunca con diálogo o bitácora), `helpOpen`, botón del HUD (`openHelp`), Esc cierra primero la ayuda, `SAFE_EXIT_ALWAYS_REACHABLE = true` en el mismo cambio (T8 ya lo hizo cierto) | Aparece una vez; no aparece bajo ETH-01; `?` la reabre; Esc no la consume salvo para cerrarse |
| **T9.9** Destino y atenuados | P1 | `nextTargetKey = ringTargetKey(sceneLog, HIGHLIGHT_TOOL_TARGETS)` y `dimmedKeys = otherStageDecisionKeys(...)` al mundo | Captura: anillo sobre el kit al inicio y sobre la Familia tras recogerlo |
| **T9.10** Sonidos | P2 | `door_open` en `triggerFade` de puertas (hoy `dialogue_advance`); `item_pickup` al recoger | Spec con `AudioDirectorService` simulado |
| **T9.11** Supervisión sin números | P1 | `buildSupervisionDialogue` sustituye la línea numérica por «Tu decisión quedó registrada en tu seguimiento formativo.»; feedback de herramienta sin «Estrés +0%» cuando el cambio real es 0 (`world_service.py` lo recorta) | Spec: no contiene «Puntaje» ni cifras |
| **T9.12** Decisión en dos tiempos | P2 | F§7.7: `executeDecision` pide la decisión sin fundido, muestra la supervisión sobre la escena y aplica el resultado en `applyDecisionResult()` al cerrar; `decisionPending`, `pendingDecisionResult`, `data-scene-state`; respaldo `holdOutcome` (T12.3) si se corta | AC-9: la supervisión se ve antes del fundido, incluida la última; e2e `full-case` adaptado (T14.2); con retry no hay fundido |

### T10 · Integración: compacto (M)

`simulation-play.component.ts`, estilos y plantilla compactos. Depende de T9, T6 y T7.

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T10.1** Modo compacto | P1 | `@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)`; pie de 56 px (64 px en el resto) con botón de una línea; sin `kbd`, leyenda ni «(Esc)»; tarjeta plegada por defecto; ocultar la descripción en el pie (queda en `title`) | AC-1 y AC-11 en 844x390: mundo sin saltos al acercarse a algo |
| **T10.2** Panel de decisión flotante | P1 | En compacto `.main-zone` conserva una columna y `.right-panel` pasa a hoja inferior flotante; `.right-panel__scene { display: none }` mientras hay opciones; cabecera fija con hablante y pregunta | AC-5; las opciones 1-3 se ven en 844x390 |
| **T10.3** Introducción y contexto compactos | P1 | Cabecera compacta, pie fijo con «Continuar» y «Salida segura», degradado inferior como señal de scroll; la frase de salida segura sube a la primera pantalla | Captura 844x390: «Salida segura» visible sin desplazarse |
| **T10.4** Ajustes finales | P2 | Llamar `refreshScale()` al cerrar el panel lateral; ayuda en variante compacta; punto de novedad en el chip tras una etapa nueva | e2e AC-5 y captura |

### T11 · Backend (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T11.1** Reintentos no cuentan | P0 | `build_completion_report` y `compute_ending` cuentan solo `DECISION_SELECTED` y `PROHIBITED_DECISION_SELECTED`; los reintentos van aparte (`retries`); revisar con `grep -rn "decision_option" apps/*/services` otros agregadores | `test_game.py`: dos reintentos críticos más seis correctas ⇒ Final 1 y `severityCounts.critical == 0` |
| **T11.2** Override fuera del mensaje | P1 | Guardar el texto con etiquetas solo en el evento; `feedback.message` sin «Override de evidencia» | Test: el mensaje devuelto no contiene `Override`; el evento sí guarda las etiquetas |
| **T11.3** Tildes | P1 | `world_service.py:307-312, 535-546`: `estrés`, `intervención profesional y ética`, `más apropiado`, `situación` | Test o grep sobre los mensajes |
| **T11.4** Tolerancia del NPC | P0 | `_require_nearby_ambient_npc`: radio + `NPC_RANGE_TOLERANCE_PX = 16`; sin re-seed | Test: acepta 70 y rechaza 90 (radio 60); T0.2 confirma si era causa o endurecimiento |
| **T11.5** Nodo sin clasificación | P1 | `decision_option_state` devuelve solo `id` y `text`; migrar `test_game.py:142,374,406` a consultar `DecisionOption` por id | AC-10: el JSON del nodo no trae `classification` ni `prohibitedConduct`; pytest verde; coordinar con T8.4 |
| **T11.6** Revisión por decisión | P3 | `decisionReview[]` en el reporte (texto elegido e `immediate_feedback`) | Test del DTO; lo consume T12.4 |

### T12 · Pausa, bitácora y resultado (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T12.1** Pausa calmada | P0 | En `PAUSED`: título «Tu caso está en pausa», texto de F§4.8, «Reanudar este intento» (primero, con foco, visible sin desplazar) y «Volver al catálogo», recursos de apoyo vía `supportResources` (entrada opcional), `<details>` cerrado «Ver mi seguimiento» con el tablero actual; se conserva `role="alertdialog"` y `aria-labelledby="outcome-title"` con «pausa» en el título | `attempt-outcome.component.spec.ts`: «Reanudar» es el primer botón y «Puntaje total» solo aparece dentro del `<details>`; AC-7 |
| **T12.2** Salida segura en la bitácora | P0 | Salida `safeExit` y `<app-safe-exit-button>` en el pie del panel (`journal-panel.component.ts:95-103`) | Spec: el botón existe y emite |
| **T12.3** Respaldo `holdOutcome` | P2 | Parámetro opcional en `resolveViewMode`: con `status ≠ IN_PROGRESS` y `holdOutcome && dialogue` devuelve `dialogue-cinematic` | `simulation-view-mode.util.spec.ts` ampliado |
| **T12.4** Resultado que cierra el aprendizaje | P3 | Lenguaje de seguimiento formativo (sin «¡Simulación completada!» ni «Puntaje total» como primera cifra), «Tu recorrido» con `decisionReview` (T11.6), métricas plegadas | Spec del orden y de las palabras; revisión de Psicología (pregunta 17) |

### T13 · Audio y umbrales de estrés (M)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T13.1** Piso de música | P2 | Mientras `stems.size === 1`, `setStressLevel` no baja `ambient` de 0,6 ni a 0 (`audio-director.service.ts:129-158`) | `audio-director.service.spec.ts` con `Howl` simulado |
| **T13.2** SFX nuevos | P2 | `item_pickup` (reutiliza un OGG de Kenney ya incluido) y verificar `door_open`; no activar `stress_high`/`crisis_start` | Spec: ambos se reproducen una vez |
| **T13.3** `stress-tier.util.ts` | P2 | Umbrales únicos (hoy: HUD 25/50/75, viñeta DOM 40, viñeta Phaser 50/85, audio 30/60/85, sprite 70); audio lo adopta | `stress-tier.util.spec.ts`; HUD lo adopta en T7.5 |

### T14 · Pruebas e2e y CI (L)

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T14.1** `moveBy` → `moveUntilNearby` | P1 | Convertir los 9 movimientos en píxeles (`full-case.e2e.ts:64,65,70,119,135,152,156,189,205`) en `moveUntilNearby` por nombre | `npm run test:e2e` completo en local verde (~8,5 min) |
| **T14.2** Ayudas | P1 | `closeDialogue` busca `/continuar\|cerrar diálogo/i`; `waitForSceneIdle` con `data-scene-state`; `readSceneLog`, `expectNextStep`; ajustar `full-case` a la decisión en dos tiempos (cerrar la supervisión y esperar `idle`) | Helpers usados por `full-case` y los specs nuevos |
| **T14.3** `guided-first-minute.e2e.ts` | P1 | F§9.2: región «Qué hacer» con «Ahora:», aviso al recoger, `Hablar con Enfermera de urgencias` a ≤ 60 px, conversación informativa del «Marco normativo» en la etapa 1, canvas antes/después de un diálogo (AC-5), supervisión antes del fundido (AC-9), recorrido guiado de la etapa 1 sin coordenadas; viewports 1366 y una constante nueva 844x390 táctil (sin tocar `required-viewports.ts`) | Pasa en ambos |
| **T14.4** Salida segura parametrizada | P0 | Un e2e recorre introducción, contexto, diálogo con y sin opciones, supervisión, bitácora, exploración, Ajustes y ayuda y comprueba un único botón «Salida segura» visible y operativo en cada uno (AC-2) | Verde en escritorio y táctil |
| **T14.5** CI | P2 | Job `e2e-full-case` de escritorio-1366 en PR que toquen `frontend/src/app/features/simulator/**`; paso `gitleaks` | Workflow válido; gitleaks sin hallazgos (pregunta 10) |
| **T14.6** Verificación final jugando | P1 | Script con `playkit.mjs` (teclado 1366x768, táctil 844x390 y 390x844) que recorre H1-C3, captura los estados de F§9.4 y el pase visual de estrés 0/60/90, y confirma `Recomendadas: 6`; checklist de AC-1..AC-11 | Informe con capturas y métricas; fallos como hallazgos |

### T15 · Plataforma, cumplimiento y portada (M-L)

Ola 2 del roadmap, sin contenido clínico. Archivos propios, sin choque con las otras pistas.

| Tarea | P | Detalle | Aceptación |
|---|---|---|---|
| **T15.1** Bandera del asistente | P2 | `AI_ASSISTANT_ENABLED=false` por defecto en `settings/base.py`; validar UUID y devolver el sobre `{success, message}` en lugar de 500; no exponer el nombre de la variable interna | `test_ai_assistant.py` nuevo: con la bandera apagada responde 404/deshabilitado |
| **T15.2** Secretos | P2 | `production.py` rechaza el `JWT_SECRET` por defecto y exige `REFLECTION_ENCRYPTION_KEY` explícita | Test de configuración |
| **T15.3** Contraseña del administrador y credenciales demo | P2 | `seed_caso_pdf.py` no reinicia la contraseña de un administrador existente; `README.md` y `docs/operacion/despliegue-railway.md` marcan las credenciales «solo desarrollo» | Test del comando; revisión de texto |
| **T15.4** Portada y catálogo honestos | P2 | Casos futuros «próximamente» o fuera (pregunta 14); «Ver todos los casos» deja de apuntar a sí misma; «violencia intrafamiliar» → violencia basada en género; catálogo: `{{ item.status }}` (`:53`, muestra «PUBLISHED») pasa por `statusLabel`; el botón del tablero «Continuar simulación» sin intento activo dice «Ir al simulador» (`shell.component.ts:704`, `dashboard.component.html:19,131`) | `landing.a11y.spec.ts` verde; sin texto en inglés visible |
| **T15.5** Roster | P3 | Recortar `roster.v1.json` a las 8 carpetas existentes (o producir las 2) con prueba de contrato | Spec de contrato |

---

## 5. Preguntas para personas (lo que solo una persona puede decidir)

Se aplica el valor por defecto indicado y el trabajo no se bloquea. Las mismas preguntas, numeradas, están en el resultado estructurado.

1. **Psicología (límite 1):** ¿se pueden nombrar las herramientas en la lista y en el aviso (`NAME_TOOLS_IN_HINTS`) y mantener un anillo sobre el maletín del kit (`HIGHLIGHT_TOOL_TARGETS`)? ¿Se desacopla la compuerta de H1 («usar PAP») de la técnica concreta (DLG-08)? Por defecto: genérico y anillo activo.
2. **Psicología (límite 1, contenido existente):** reescribir como hechos (qué se observa) las líneas que ya anuncian la respuesta de H1: enfermera línea 3, médico línea 2, psicóloga orientadora línea 1, apoyo psicosocial, la frase final de «Familia en crisis» (`seed_caso_pdf.py:867`), y el título y la narrativa del nodo 1. Los JSON se editan sin re-seed; la frase del seed exige re-seed o sobrescritura en el frontend. Por defecto: no se tocan; la guía no depende de ellas.
3. **Producto:** ¿«Salida segura» sin confirmación y con el mismo rótulo en todos los estados, y Esc en la introducción pausa? Por defecto: sí.
4. **Psicología y producto:** ¿se conserva la regla «la primera respuesta mala no se aplica» (`game_service.py:351-374`), se explica antes de decidir y se añade un paso de confirmación («Registrar decisión» / «Seguir pensando»)? ¿Se revisan longitud y estructura de las opciones (DLG-24)? Por defecto: se conserva, no se explica, sin confirmación; el orden aleatorio estable es opcional (P2).
5. **Producto (límite 2):** ¿la sacudida de cámara tras una opción riesgosa se mantiene, se limita a la conducta prohibida o se quita? Por defecto: se mantiene hasta el pase visual de T14.6.
6. **Psicología:** alias de emoción de los retratos, ausencia de sonrisa de la Abuela en el duelo y estilo de habla del testimonio de la sobreviviente. Por defecto: alias de F§7.11, sin estilos de habla.
7. **Psicología:** ¿la sobreviviente que espera en la recepción debe ser interactiva y estar marcada? Por defecto: no se lista como paso ni como opcional, para que su testimonio no sea un estímulo.
8. **Psicología y dirección:** verificar los recursos de apoyo (ETH-01 sigue `BLOCKED_EXTERNAL`) antes de mostrarlos en la pantalla de pausa. Por defecto: se muestran los que ya muestra la bitácora.
9. **Ingeniería:** ¿se autoriza un re-seed planificado (borra los intentos de la versión y reinicia la contraseña del administrador) para corregir en el seed los textos de puertas y de la tarjeta? Por defecto: no; sobrescritura en el frontend.
10. **Ingeniería:** ¿`full-case` de escritorio en cada PR que toque el simulador (CI 3-4 veces más lento, ~15-20 min)? Por defecto: sí (T14.5).
11. **Ingeniería y producto:** ¿rigen los planes de julio (35-45 caracteres por segundo y sin chips de emoción)? Por defecto: no; se quitan los chips de personas y se deja la velocidad.
12. **Psicología y UX:** revisar el copy de rutas, introducciones de etapa, verbos («Habla con» frente a «Escucha a») y el tono de «Decisión k registrada» antes de publicar. Por defecto: los textos de F§5.
13. **Dirección y jurídica:** ¿el despliegue de Railway es público? Define la urgencia de las credenciales demo, `JWT_SECRET` y `REFLECTION_ENCRYPTION_KEY` (T15.2-15.3).
14. **Dirección:** ¿la portada retira los casos futuros o los rotula «próximamente»? Por defecto: «próximamente».
15. **Producto:** T12 completo («Alrededor» con «Ir a…»): ¿se construye pathfinding automático y qué se lista sin revelar evidencia? Por defecto: solo la lista mínima de «También en esta sala», sin «Ir a».
16. **Psicología:** SAFETY_ROUTE y REFLECTION_JOURNAL no tienen función visible (WAY-09, DLG-10): ¿se retiran del dock o se les da función? Por defecto: se quedan como están.
17. **Psicología y UX:** tono del resultado (DLG-20): «Puntaje total», «Tiempo», color y título del Final 4 «Intervención Crítica / Revictimizante», barra «Manejo del duelo». Por defecto: solo T12.4 (P3), tras su visto bueno.
18. **Producto:** tras el playtest de AC-8, ¿se construye la fase 2 de señales en el mundo (F§11.3) y el modo de guía por defecto («siempre» o «cuando me detengo»)? Por defecto: no se construye hasta ver el playtest.

---

## 6. Backlog diferido (no entra en esta ola)

| Qué | Por qué se difiere | Condición para reabrirlo |
|---|---|---|
| Capa DOM de marcas y chips, `viewChange`, pistas just-in-time, niveles de guía | Riesgo y esfuerzo altos; choca con «la escena no debe leerse como un diagrama etiquetado» | Playtest AC-8 con más de 1 de 5 fallos de identificación (pregunta 18) |
| Pestaña «Ruta del caso» | Informativa, no desbloquea | Petición de Producto |
| H-T11 (atajos de una tecla, WCAG 2.1.4), H-T13 (anuncios de estrés), H-T15 (foco, `aria-modal`, `wcag22aa` local, `busy`) del plan del bloque H | Ola 2 del roadmap; tocan los tres monolitos | Después del corte C2, un carril por monolito |
| `visitedRoomKeys` derivado en backend | Cierra el único dato que depende del navegador, pero toca `flags_json` (carrera) | Si se implementa la pieza 0c (escritor único) |
| Colisión y vida de NPC, colisión que no coincide con el arte, zoom de cámara táctil | Cambian la sensación y los contratos del mundo; sin diagnóstico previo | Playtest táctil tras C2 |
| Panel «Alrededor» con «Ir a…» | Exige pathfinding y decisión de contenido | Pregunta 15 |
| Bloques E, F, G (IA), J (caso nuevo), música propia de A | Bloqueados por Psicología o decisión externa | Hoja de Psicología |
| Dashboard de grupos y campos del login (H-T14) | No afectan al juego | Plan propio |
