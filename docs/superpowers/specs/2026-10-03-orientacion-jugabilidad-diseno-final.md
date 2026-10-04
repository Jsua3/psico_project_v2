# SIEP SIM-VBG-001: diseño final de orientación, interacción y sensación de juego

> **Estado (2026-10-04):** ejecutado casi todo salvo T9.12 (decisión en dos tiempos), el informe de grupo/CSV con reintentos y los carriles de H T11/T13/T15. Qué se hizo, qué no y las preguntas abiertas: [`docs/audits/2026-10-04-informe-sesion-jugabilidad.md`](../../audits/2026-10-04-informe-sesion-jugabilidad.md).

Fecha: 2026-10-03. Código medido: `master` @ `51d1409`. Este documento es el DISEÑO FINAL elegido por el juez-sintetizador a partir de los tres diseños (`design/minimal.md`, `design/guided.md`, `design/questlog.md`), los siete informes (`reports/`) y una verificación propia en el código. El backlog ejecutable por pistas está en `design/BACKLOG.md`.

Convenciones: `archivo:línea` fue leído hoy. «(inferencia)» = deducido por lectura, no ejecutado. Esfuerzo S < 0,5 d, M 0,5-2 d, L > 2 d. Todas las estimaciones son mías y no están calibradas con histórico.

---

## 0. Veredicto: qué diseño gana y por qué

### 0.1 Puntuación (1 a 5, 5 = mejor; en riesgo y esfuerzo, 5 = menos riesgo / menos esfuerzo)

| Criterio | minimal | guided | questlog |
|---|---|---|---|
| Claridad para el jugador | 4 | 4,5 | 4,5 |
| Riesgo | 4,5 | 2,5 | 3,5 |
| Esfuerzo | 4 | 3 | 3,5 |
| Respeto de los límites de producto | 4 | 4 | 4,5 |
| Encaje con el código real | 4,5 | 3,5 | 4 |
| **Total** | **21** | **17,5** | **20** |

Razones de las notas:

- **minimal (21).** Es el único que ordena el trabajo por lo que bloquea al jugador (salida segura, panel de decisión muerto, persona que no se puede hablar) antes de lo que mejora la claridad, y el único que incluye el diagnóstico de la enfermera (A0), las correcciones de backend (reporte injusto, mensaje de override) y la lista de contratos de texto que vigilan los dos monolitos. Le falta lo mejor de questlog (siguiente paso entre salas) y de guided (una sola función de puerta, prueba de alcanzabilidad).
- **questlog (20).** Mejor idea de contenido: un «Siguiente» que atraviesa salas (resuelve que la decisión 1 y la 4 se tomen lejos de donde aparece el jugador y de donde están sus requisitos), la tarjeta «Nueva etapa» y una sola función que humaniza lo que falta para registro, puerta y aviso. Riesgo medio: tres layouts del panel, `visitedRooms` en `sessionStorage`, y una prueba pytest que lee TypeScript con regex.
- **guided (17,5).** Mejor lenguaje de señales en el mundo (`doorStatus` único, `pickInteraction` con penalizaciones y histéresis, prueba geométrica de alcanzabilidad, rótulos legibles en pantallas pequeñas), pero la capa DOM de chips alineada al canvas (`viewChange`, `layoutTags`, 7 marcas y 2 etiquetas por sala) es la pieza de mayor riesgo y esfuerzo, y choca con una decisión deliberada del equipo («la escena no debe leerse como un diagrama etiquetado», `game-world.component.ts:1485`, `:2000-2002`). Además contiene un error verificado (ver V2).

### 0.2 Qué se toma de cada uno

| De | Se toma | Se descarta |
|---|---|---|
| **minimal** (esqueleto) | Orden en tres hitos (nada se atasca, se sabe qué hacer, se siente bien), `pauseFromOverlay()` + Esc en introducción + reevaluar introducción al reanudar, filtro de decisiones de otra etapa en una utilidad pura, `releaseToken`, no enfocar ninguna opción, `pickNearby` con NPC en la barra y botón secundario, tolerancia de radio en backend, correcciones de backend, pausa calmada, lista de contratos | `holdOutcome` como solución principal (se sustituye por la decisión en dos tiempos, 7.7; queda como respaldo) |
| **questlog** | Lista viva con `needs`, `weight`, `carryOver`; «Siguiente» multi-sala con `ROOM_GRAPH` + `firstHop` apoyado en la puerta viva de la sala actual; nota «Decisión k registrada»; `humanizeMissing` única; prueba de coherencia con `NODE_EVIDENCE`; pantalla permanente «Cómo se juega» | Tres layouts (`card`/`strip`/`sheet`; se dejan dos: tarjeta y chip), pestaña «Ruta del caso» (queda en backlog), prueba pytest con regex sobre TypeScript (se sustituye por un spec Jest que lee el seed), `visitedRooms` como única fuente (se usa regla monótona + conjunto en `sessionStorage` como refuerzo) |
| **guided** | `doorStatus` como única fuente para etiqueta, barra y `tryOpenDoor`; penalizaciones por tipo e histéresis en la elección; radio de revelado de nombres; prueba geométrica de alcanzabilidad; rótulos escalados a ≥ 12 px de pantalla; atenuar objetos de decisión de otras etapas; anillo estático sobre el siguiente destino; estados de puerta con candado visible | Capa DOM de marcas y chips para todo interactuable, `layoutTags`, `viewChange`, 6 pistas «just-in-time», niveles de guía en Ajustes (todo a «backlog fase 2», condicionado a un playtest, 11.3) |

### 0.3 Decisiones de diseño tomadas por el juez que ninguno de los tres tomó

1. **Decisión en dos tiempos** (7.7): se pide la decisión al servidor primero y se muestra la «Supervisión clínica» sobre la escena donde se decidió; solo al pulsar «Continuar» se hace el fundido, se aplica el intento nuevo y se carga la sala. Esto resuelve DLG-05 (feedback de la última decisión que nunca se ve) y DLG-06 (feedback sobre la escena equivocada) sin `holdOutcome`.
2. **Quitar `classification` y `prohibitedConduct` del JSON del nodo ya** (7.10). Los tres diseños lo difieren «porque rompe pruebas»; verificado: solo lo leen tres sitios de `test_game.py` y un punto del frontend. Es el límite 1 (producto) y cuesta menos de medio día.
3. **Diagnosticar antes de arreglar** lo que ninguna lectura de código pudo confirmar: por qué no se alcanza a la enfermera (T0.2) y por qué el canvas no recupera su tamaño (T0.3). Los arreglos están definidos igualmente (defendibles sin diagnóstico) y el diagnóstico decide si hace falta algo más.
4. **Tres cortes de entrega** (BACKLOG §2): C0 «Sin callejones» (todos los bloqueantes del playtest, ≈ día 5), C1 «Se sabe qué hacer» (lista «Qué hacer», barra con verbos y NPC, puertas con motivo, ayuda, un solo contador; ≈ día 9) y C2 «Se siente bien» (táctil compacto, decisión en dos tiempos, audio, CI y plataforma; ≈ día 11-12). C0 se puede publicar solo.

---

## 1. Verificación en el código: confirmado, corregido, no confirmado

### 1.1 Confirmado (los tres diseños aciertan)

| # | Hecho | Evidencia |
|---|---|---|
| C1 | `safeExit()` sale sin actuar si hay `inputBlocked()` (diálogo, bitácora, introducción) o `busy()`. Un botón dentro de un diálogo necesita un método nuevo | `simulation-play.component.ts:1597-1604`, `:947-950` |
| C2 | En la introducción el foco siempre está en un botón (`cdkFocusInitial`), así que la rama `tag === 'BUTTON'` devuelve antes de mirar Esc | `:1113-1118`, `:176`, `:204` |
| C3 | La pausa (z 150) quedaría bajo las tarjetas de introducción (z 380) y `resumeCurrentAttempt()` no reevalúa la introducción | `:1029-1042`, `resolveIntroStep` en `intro-gate.util.ts:28-34` (exige `attemptStatus === 'IN_PROGRESS'`) |
| C4 | `decorateDialogue` no filtra opciones por etapa; `executeDecision` solo lo comprueba después de elegir y no libera el panel | `:1334-1359`, `:1427-1434` |
| C5 | `chosenKey` solo se limpia al cambiar `dialogue()` y no hay botón de cierre con opciones | `dialogue-panel.component.ts:419-432`, `:101-107`, `:530-545` |
| C6 | Al terminar el texto el foco salta a la primera opción; Enter con foco en un botón dispara el clic nativo | `dialogue-panel.component.ts:602-613`, `dialogue-keys` devuelve `none` para Enter con opciones |
| C7 | `ngAfterViewChecked` ancla el scroll abajo en cada ciclo | `dialogue-panel.component.ts:516-522` |
| C8 | Un marcador gana siempre a un NPC; el NPC no llega a la barra contextual | `interaction-priority.util.ts:7-13`, `game-world.component.ts:771-779`, `:2292-2335` |
| C9 | Backend: el reporte y el final cuentan los reintentos como decisiones | `game_dtos.py:144-162`, `case_effects.py:289-295`, `game_service.py:351-374` |
| C10 | `unlockedToolCode` llega y se ignora (recoger no avisa) | `simulation.model.ts` `InteractionResult`, `simulation-play.component.ts:1246-1253` |
| C11 | 13 specs leen los dos monolitos como texto | `grep -l` verificado: 10 en `simulator/`, 3 en `styles/` |
| C12 | `.main-zone` cambia de dos a una columna al abrir el panel lateral: el canvas se encoge mientras hay diálogo | `simulation-play.component.ts:386-394` |

### 1.2 Correcciones y hallazgos nuevos de la verificación

| # | Hallazgo | Evidencia | Consecuencia en el diseño |
|---|---|---|---|
| **V1** | `ScaleManager.refresh()` de Phaser **no vuelve a leer el tamaño del contenedor**: usa `parentSize` en caché; solo `getParentBounds()` (llamado por `step()` cada `resizeInterval`) lo actualiza. El `ResizeObserver` actual llama solo a `refresh()` y por tanto reaplica el tamaño viejo | `node_modules/phaser/src/scale/ScaleManager.js:967-1001` (`refresh`), `:658-690` (`getParentBounds`), `:1690-1715` (`step`); `game-world.component.ts:2681-2685`. Los tres diseños proponían «forzar `refresh()`» | El arreglo es llamar a `getParentBounds()` antes de `refresh()` (T5.4). **No confirmado** que sea la causa única del canvas encogido (`playtest-feel.md` F-03 mide 17 % menos incluso tras cerrar): T0.3 lo mide antes |
| **V2** | **guided sube el radio del NPC a 80 px «sin cambios de backend»**. El servidor valida contra `interactionRadius` guardado en `ambient_json` (60) con comparación estricta; un jugador a 70 px vería el aviso y recibiría 400 «Estás demasiado lejos del NPC» | `world_service.py:333-339`, `seed_caso_pdf.py:562` (`AMBIENT_NPC_INTERACTION_RADIUS = 60`); los objetos usan `INTERACTION_RANGE_PX` (120) y no tienen este problema | Radio de cliente 72 y tolerancia de servidor +16 (`NPC_RANGE_TOLERANCE_PX`): el cliente nunca promete más de lo que el servidor acepta. Sin re-seed |
| **V3** | `a11y-bloque-h.contract.spec.ts` fija: exactamente 2 etiquetas `<app-dialogue-panel …/>` autocerradas con `[reduceMotion]`; `<div class="hud-step">`; `.choice-btn:focus-visible` y `.safe-exit:focus-visible` con formato exacto; `.strip--warning .speaker-name`; `.emotion-tag … opacity: 1;` y los cuatro `return '#…'` de `emotionColor()`. Ningún diseño lo tenía completo | `styles/a11y-bloque-h.contract.spec.ts:49-135` | Tabla de contratos (9.3); quitar `hud-step` obliga a actualizar ese hunk en la misma pista que lo quita (T7) |
| **V4** | `contrast.contract.spec.ts:36` fija `.context-bar__hint { font-size: .75rem; color: rgba(232,240,244,.72); }` | `styles/contrast.contract.spec.ts:36` | La línea «Ahora:» usa clase nueva `.context-bar__now`; `.context-bar__hint` se conserva para la leyenda de teclado |
| **V5** | El e2e usa `button.close-btn:visible` dentro del diálogo para avanzar y cerrar. Un botón nuevo con esa clase («Volver al mapa», «Salida segura») sería pulsado por los e2e y pausaría el intento | `e2e/support/siep-flow.ts:477-480` | Clases nuevas distintas de `close-btn` (todos los diseños lo vieron; aquí queda como regla dura) |
| **V6** | `decision_option_state` solo se usa en `node_state` (el estado del intento del jugador); el frontend solo lee `prohibitedConduct` en un punto; los e2e no leen `classification`; en backend solo `test_game.py:142,374,406` la leen del nodo (`test_authoring.py:79,329` son del endpoint de autoría, otro serializador) | `game_dtos.py:52-64,244`; `simulation-play.component.ts:1354`; greps | Quitarlos ya es S (7.10) y cierra WAY-15/DLG-25 (límite 1) |
| **V7** | Retratos: no existen todas las variantes (`madre-vbg_sad`, `psicologa-hospitalaria_worried`, `paciente-vbg_happy` no existen). `EMOTION_TO_VARIANT` mapea `danger → sad` y `positive → happy` sin comprobar | `ls assets/characters/portraits/`, `portrait-resolver.util.ts:35-41` | El resolver debe devolver solo assets que existen y caer a `neutral`; `positive` no puede dar sonrisa a la Abuela (límite 2) |
| **V8** | Las líneas desbloqueadas por evidencia llevan `emotion: 'positive'` (la Abuela «respira un poco más despacio») | `simulation-play.component.ts:1341-1344`, `evidence-gating.config.ts:30-32` | Con V7, ese diálogo dejaría de mostrar una cara sonriente en un momento de duelo |
| **V9** | La enfermera es alcanzable en el e2e porque este se detiene entre 50 y 60 px de ella (`moveBy` 203 a la izquierda y 50 arriba desde la puerta; inferencia: depende de la `y` inicial). A 60 px el cliente y el servidor coinciden sin margen y la posición de servidor es entera | `e2e/full-case.e2e.ts:64-66`, `seed_caso_pdf.py:562-570`, `world_service.py:333-339` | Margen de 12 px (72 en cliente, 76 en servidor) y prueba de alcanzabilidad; T0.2 busca la causa real |
| **V10** | `apiErrorMessage(err, fallback)` ya existe y devuelve `null` para 0/401/403 | `core/api/api-error.util.ts:10-18` | Se reutiliza; los avisos de error muestran el mensaje real del backend |

### 1.3 No confirmado (queda como tarea de diagnóstico, no como suposición)

- Causa real de «la enfermera no se encuentra» (PLAY-KB-03). Hipótesis ordenadas: (1) el jugador no entra en el radio de 60 px por donde se acerca (la etiqueta ni siquiera aparece), (2) 400 del servidor por posición persistida con retraso, (3) retorno temprano de `openNpcDialogue` por `busy()`/`inputBlocked()`, (4) contenedor del NPC desplazado por `freeTileNear` (poco probable: `(560,330)` no colisiona con el mostrador `y 252-308`). **T0.2**.
- Si el canvas encogido es solo `parentSize` en caché (V1) o además crece alguna fila del pie. **T0.3**.

---

## 2. Principios de diseño (con su prueba)

| # | Principio | Cómo se comprueba |
|---|---|---|
| P1 | **Orientar proceso y lugar, nunca la respuesta.** Los pasos nombran personas, objetos y salas. Ningún texto, color, icono, orden o anillo codifica una opción. El único objeto destacado para una decisión es el que la aloja | Spec de vocabulario sobre el producto cartesiano de estados; spec estático: los archivos nuevos no contienen `classification`, `prohibitedConduct`, `isRecommended`, `isProhibited` |
| P2 | **Derivar, no inventar.** Todo estado sale de `attempt`, `world`, `scenarioConfig`; el único dato nuevo es copy estático en configs del frontend (patrón `NODE_EVIDENCE`) | Spec que lee el seed y falla si falta un nombre humano o una clave `requires*` |
| P3 | **Un solo «siguiente»**, incluso si está en otra sala | Spec de `deriveSceneLog` |
| P4 | **Una sola fuente por concepto**: un contador («Decisión k de 6»), una lista, un botón principal de interacción (con uno secundario), una función de puerta, un aviso de evidencia | Specs: tres consumidores devuelven las mismas frases |
| P5 | **Nada se atasca**: toda superposición tiene «Volver» y «Salida segura» fuera de cualquier `inert`; toda acción fallida libera el control y dice por qué | Specs de panel + e2e parametrizado de salida segura |
| P6 | **Nombres humanos, nunca claves** (`enfermera-urgencias`, `PAP@familia-crisis` no se ven) | Spec: todo `key` de `NODE_EVIDENCE` y de puertas tiene nombre; regex de slug sobre el texto visible en e2e |
| P7 | **No es un juego de tareas**: sin «completado», puntos, porcentajes, sonido o color de logro; verbos neutros | Spec de vocabulario; revisión de Psicología (pregunta 12) |
| P8 | **Sin reloj**: nada esencial se cierra solo ni aparece por inactividad; lo que un aviso efímero dice queda escrito en la lista | Prueba de fuente: sin `setTimeout` en la tarjeta |
| P9 | **Compuerta blanda**: lo recomendado se informa antes, nunca bloquea | e2e: decidir con información incompleta sigue siendo posible |
| P10 | **Aditivo y en archivos nuevos**: la lógica nueva va en utilidades puras con spec; los monolitos reciben cambios acotados y un solo dueño a la vez | `npx jest --runInBand src/app/features/simulator src/styles` tras cada pieza |
| P11 | **Lo legible mide ≥ 12 px de pantalla** (texto de canvas incluido, escalado por `displayScale`) y los objetivos táctiles ≥ 44 px (mínimo 24 px) | Captura en tres viewports + spec de escala |
| P12 | **Táctil primero en layout, teclado primero en semántica**: nada de atajos de teclado donde no existen; todo gesto táctil tiene equivalente de teclado | Contrato `@media (pointer: coarse)` + e2e táctil |
| P13 | **Lo clínico detrás de banderas conservadoras**: `NAME_TOOLS_IN_HINTS = false`, `HIGHLIGHT_TOOL_TARGETS = true`, `SAFE_EXIT_ALWAYS_REACHABLE` (se activa en el mismo cambio que lo hace cierto) | Spec: con las banderas por defecto ninguna salida contiene `PAP`, `SPIKES`, `RISK_METER` ni nombres de herramienta |

---

## 3. El sistema en una página

```
 HUD (cabecera)            chip «Decisión 1 de 6»      [?] ayuda   [bitácora] [ajustes]
 ┌ canvas-zone ─────────────────────────────────────────────────────────────────┐
 │ ┌ Qué hacer ───────────────  Decisión 1 de 6 ──── [Ocultar pasos] ┐          │
 │ │ Urgencia vital y crisis                                         │  MUNDO   │
 │ │ → Recoge el material de apoyo de la sala · a la izquierda, al   │  anillo  │
 │ │   frente                                                        │  estático│
 │ │ ○ Habla con la Familia en crisis                                │  bajo el │
 │ │ ○ Usa el material de apoyo en esa conversación (bloqueado)      │  siguiente│
 │ │ ○ Habla con la Enfermera de urgencias                           │  rótulo  │
 │ │ ○ Pasa a la Sala de escucha familiar                            │  legible │
 │ │ ○ Toma tu primera decisión con la Familia en crisis (Sala de…)  │          │
 │ │ Recomendado antes de decidir: 0 de 3 hechos. Puedes decidir…    │          │
 │ │ ▸ También en esta sala (3)                                      │          │
 │ └─────────────────────────────────────────────────────────────────┘          │
 └──────────────────────────────────────────────────────────────────────────────┘
 PIE (altura fija 64 px)
 [Salida segura] [herramientas 1/5 …………]  [E  Hablar con Enfermera de urgencias]  [También: Pasar a Sala de escucha…]
                                             o, sin nada cerca:  Ahora: Recoge el material de apoyo · a la izquierda, al frente
```

**Mapa de responsabilidades**

| Pieza | Archivo | Tipo | Entrada | Salida |
|---|---|---|---|---|
| Nombres, salas, grafo, banderas, copy | `orientation.config.ts` | datos | — | `ENTITY_NAMES`, `TOOL_HINTS`, `ROOM_LABELS`, `ROOM_GRAPH`, `ROUTE_ORDER`, banderas, textos |
| Rutas por etapa | `stage-route.config.ts` | datos | — | `STAGE_ROUTES` (6 nodos) |
| Estado de la lista | `scene-checklist.util.ts` | puro | `attempt`, `world`, `viewedNpcKeys`, `visitedRooms`, `scenarioConfig` | `SceneLogState`, `nextTarget` |
| Lugar desde coordenadas | `place-hint.util.ts` | puro | `x, y` | «a la izquierda, al frente» |
| Texto de lo que falta | `evidence-copy.util.ts` + `evidence-gating.config.ts` | puro | `MissingItem[]` | frases para lista, puerta y aviso |
| Puerta | `door-status.util.ts` | puro | `MapObjectState`, `world`, nodo | `doorStatus`, `doorBlockedMessage` |
| Diálogo de decisión | `dialogue-decoration.util.ts` | puro | `DialogueState`, ids de opciones, mundo | diálogo filtrado + avisos |
| Verbos de interacción | `interaction-verb.util.ts` | puro | `MapObjectState`, estado de puerta | texto del botón, línea de bloqueo |
| Elección de interacción | `interaction-priority.util.ts` | puro | candidatos con distancia | `primary`, `secondary` |
| Tarjeta | `scene-checklist-card.component.ts` | presentacional | `SceneLogState` | colapso, avisos |
| Ayuda | `game-help.component.ts` + `game-help.content.ts` | presentacional | modalidad de puntero | tarjeta de primera vez y pantalla «Cómo se juega» |
| Salida segura | `safe-exit-button.component.ts` | presentacional | `compact` | `pause` |
| Integración | `simulation-play.component.ts`, `game-world.component.ts` | monolitos | todo lo anterior | — |

Flujo de datos: `SimulationPlayComponent` ya tiene `attempt`, `world`, `viewedNpcKeys`, `scenarioConfig`. Se añaden `visitedRooms` y `sceneLog = computed(...)`. Nada se calcula por cuadro de Phaser: la lista no lee la posición del jugador (presupuesto de 59 FPS intacto; `game-world.frame-budget.spec.ts` sin cambios).

---

## 4. Qué ve el jugador en cada momento

### 4.1 Primeros 10 segundos (escritorio 1366x768, teclado, primera vez)

Precondición: pasó el aviso de contenido (ETH-01), la introducción y el contexto; pulsó «Continuar».

| t | Lo que ve | Lo que hace |
|---|---|---|
| 0 s | Fundido de entrada (300 ms, ya existe). Arriba a la izquierda, la tarjeta **«Qué hacer · Decisión 1 de 6»** expandida con la frase «Estás en Urgencias. Reúne lo que necesites aquí y pasa a la Sala de escucha familiar: ahí tomarás tu primera decisión.» y 6 pasos; el primero marcado «Siguiente»: *Recoge el material de apoyo de la sala · a la izquierda, al frente*. Sobre el maletín, un **anillo estático** y su nombre «Kit PAP» legible. Abajo, en la barra: *Ahora: Recoge el material de apoyo de la sala · a la izquierda, al frente*. Encima del pie, la tarjeta no modal **«Cómo se juega»** con «Entendido» y «Más ayuda». El chip del HUD dice «Decisión 1 de 6» (ya no «Escenario 1 de 8» ni «Paso 1 (1/6)») | Lee, camina a la izquierda |
| 2-4 s | Al estar a ≤ 140 px de personas u objetos con nombre aparece su nombre (máximo tres rótulos a la vez), igual para todos | Camina |
| 3-6 s | A ≤ 74 px del maletín la barra pasa a `E  Recoger Kit PAP` | Pulsa E |
| +0,1 s | El maletín desaparece; sonido `item_pickup` (suave); la ranura 1 de herramientas se enciende y el dock dice «Herramientas 1/5». Aviso en la tarjeta y en la zona de avisos: *Obtuviste: Kit PAP. Ya está en tu barra de herramientas.* El paso 1 pasa a ✓ y «Siguiente» salta a «Habla con la Familia en crisis»; el anillo salta a la Familia | Sigue el anillo |
| 10 s | Sabe: que hay una lista, cuál es el siguiente paso y dónde, que interactúa con E (o tocando), que «Salida segura» existe y que `?` abre la ayuda | |

Hoy (PLAY-KB-04, FEEL-01): a los 10 s no sabe qué es interactivo ni qué hacer; el objetivo es un fin y la barra dice la leyenda `WASD mover · E interactuar…` (`pt-keyboard/08-world-t0.png`).

### 4.2 Durante la escena

- **Tarjeta «Qué hacer»** (mismo hueco que hoy ocupa `.objective-card`, esquina superior izquierda, `simulation-play.component.ts:234-247`): cabecera con «Qué hacer», «Decisión k de 6» y «Ocultar pasos»; subtítulo con el título de la etapa; lista; pie; sección plegada «También en esta sala».
- **Estados de cada fila** (forma y texto, nunca solo color): `✓` hecho, `→` siguiente, `○` pendiente, candado «bloqueado» con el motivo en una línea. Los pasos de otra sala llevan «· en Urgencias». Los pasos de decisión dicen siempre en qué sala están.
- **Anillo**: un único anillo estático de 2 px bajo el siguiente destino de la sala actual (si el destino está en otra sala, el anillo marca la puerta que hay que tomar). Con movimiento reducido es idéntico (no se anima).
- **Rótulos**: solo el destino, y los dos más cercanos dentro de 140 px; escalados para medir ≥ 12 px de pantalla. En táctil, destino + más cercano.
- **Barra sin nada cerca**: `Ahora: …` con el siguiente paso (la leyenda `WASD · E · J · Esc` solo con puntero fino y ancho ≥ 1150 px; hoy se solapa con las herramientas por debajo de 1143 px, `code-hud.md` §2).
- **Objetos de decisión de otras etapas** (en la Sala de escucha hay tres con opciones y solo uno vale): se atenúan (alfa .55, sin anillo, sin rótulo salvo a ≤ 74 px); al abrirlos son conversaciones informativas.
- **Compuerta blanda**: nada impide cruzar o decidir; la lista y el aviso dicen lo recomendado.

### 4.3 Al acercarse a personas, objetos y puertas

Un solo botón principal en la barra (una línea, altura fija) y, si hay otro candidato en rango, un botón secundario más pequeño con la misma clase `context-bar__interaction`.

| Tipo | Texto del botón principal | Nombre accesible |
|---|---|---|
| PERSON y NPC de escenario | `Hablar con {etiqueta}` | `Interactuar: Hablar con {etiqueta}` |
| OBJECT, ROUTE, WARNING | `Revisar {etiqueta}` | `Interactuar: Revisar {etiqueta}` |
| TOOL | `Recoger {etiqueta}` | `Interactuar: Recoger {etiqueta}` |
| EXIT abierta | `Pasar a {etiqueta}` | `Interactuar: Pasar a {etiqueta}` |
| EXIT bloqueada | `Pasar a {etiqueta}` + candado + motivo en una línea (`title` con el texto completo) | `Interactuar: Pasar a {etiqueta}, bloqueada: {motivo}` |
| Táctil sin nada cerca | `Acércate a algo` (atenuado) | igual |

- El `interactionPrompt` sembrado no se usa (algunos sugieren la acción clínica).
- Secundario: `También: {verbo corto}`. La tecla E actúa siempre sobre el principal.
- `kbd E` solo con puntero fino.
- El prefijo «Interactuar:» del nombre accesible se conserva (lo usan `openFamilyDialogue` y `nearbyAction` del e2e).

### 4.4 Tras cada acción

| Acción | Respuesta (todas con texto, `role="status"`, sin animación ni puntos flotantes) |
|---|---|
| Recoger herramienta | `item_pickup` + aviso «Obtuviste: {etiqueta}. Ya está en tu barra de herramientas.» + ranura encendida |
| Hablar con alguien de la lista | Al cerrar el diálogo: «Anotado: hablaste con la Enfermera de urgencias.»; la fila pasa a ✓ |
| Usar herramienta | Se conserva la tarjeta «Herramienta pertinente»; la fila pasa a ✓ y «Anotado: usaste el material de apoyo en la conversación.» |
| Puerta bloqueada | Aviso de 4,2 s con el motivo nuevo y el mismo motivo visible en el botón antes de pulsar |
| Cruzar puerta | Banner con el nombre de la sala (existe) + `door_open` (hoy suena un clic de interfaz) |
| E sin nada cerca | Texto estático en la barra 2,5 s: «No hay nada a tu alcance. Acércate a una persona o un objeto.» (sin sonido de error) |
| Error de red o distancia | Mensaje real del backend (`apiErrorMessage`), no «No pudimos usar la herramienta.» genérico |
| Elegir decisión | «Registrando tu decisión…» con `role="status"` y, después, la supervisión sobre la misma escena (7.7) |

Los avisos con diálogo abierto se encolan y salen al cerrarlo (el servidor marca «revisado» y «hablado» al abrir, antes de que el jugador lea).

### 4.5 Al terminar la escena

1. Decide. Aparece «Registrando tu decisión…» (≈ 100-300 ms de red) y la **Supervisión clínica sobre la escena donde se decidió**, sin números (el texto «Puntaje +12 · Estrés -5% · Confianza +10 · Riesgo -5» se sustituye por «Tu decisión quedó registrada en tu seguimiento formativo.»; sus cifras no coinciden con las barras del HUD, DLG-13).
2. Al pulsar «Continuar»: fundido, nueva sala, banner «Nueva etapa: {título}» y la tarjeta reaparece expandida con «Decisión {k-1} registrada» (omitido en la etapa 1) y la frase de introducción de la etapa. Ni una palabra de acierto o error.
3. Última decisión: la supervisión se ve igual y al «Continuar» se abre el resultado (hoy no se ve nunca).
4. Primera respuesta mala (reintento): la supervisión dice lo existente («No se avanzó el caso…»), la escena no cambia y la lista no cambia.
5. Al recargar o reanudar no reaparece la tarjeta de nueva etapa (se inicializa con el nodo actual).

### 4.6 En móvil

Dos modos por `@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)` («compacto») y vertical.

**Compacto 844x390** (mundo 469x264, escala 0,49; bandas negras de ≈ 174 px a cada lado, `playtest-feel.md` §3.4, `code-hud.md` §6.5):

- Cabecera de 44 px: marca, chip «Decisión k de 6», estrés, puntaje y acciones.
- Tarjeta plegada a un chip `Qué hacer · {n}` de 44x32 que se despliega al tocar y se pliega con «Ocultar pasos». Una nueva etapa no la abre sola (taparía hasta el 36 % del mundo); marca un punto en el chip y muestra el banner.
- Cruceta en forma de `+` abajo a la izquierda y «Interactuar» abajo a la derecha, dentro de las bandas negras (cruz de 3x3 de 48 px: 160 px < 174). En anchos < 700 px, semitransparentes sobre el mundo.
- «Interactuar» dice su verbo y objeto («Hablar con Enfermera de urgencias»); sin nada cerca, «Acércate a algo».
- Pie de altura fija de 64 px: el mundo no cambia de tamaño al acercarse a algo (TOUCH-04).
- Panel de decisión como hoja inferior flotante (no reencuadra el canvas), resumen de escena oculto mientras hay opciones, cabecera fija con hablante, pregunta, «Volver al mapa» y «Salida segura»; solo las opciones se desplazan.
- Sin `kbd`, sin leyenda, sin insignias 1-5, sin «(Esc)» ni «(J)» en nombres accesibles.
- Introducción y contexto: cabecera compacta, pie fijo con «Continuar» y «Salida segura», degradado inferior como señal de scroll.

**Vertical 390x844**: misma tarjeta plegada; el panel ya cabe; el mundo ocupa el ancho.

### 4.7 Salida segura: estado por estado (REGLA-004; ETH-01 intacto)

| Estado | Hoy | Después |
|---|---|---|
| Aviso de contenido (ETH-01) | «Volver al catálogo»; Esc se traga | Igual (no se toca) |
| Aviso de reanudar | «Volver al catálogo» | Igual |
| Introducción animada | **Inalcanzable** | Botón «Salida segura» en la tarjeta + Esc |
| Contexto inicial | **Inalcanzable** | Botón + Esc |
| Exploración | Botón del pie, Esc | Igual |
| Ajustes abiertos | 2 pasos | Igual |
| Ayuda abierta | n/a | No modal: el pie sigue operable; Esc cierra primero la ayuda |
| Diálogo sin opciones | 2-4 toques | Botón en la cabecera del panel; Esc |
| Diálogo con opciones | **Inalcanzable en táctil y con ratón** | Botón + «Volver al mapa» en la cabecera fija |
| Supervisión pendiente de «Continuar» | n/a | Botón en la cabecera del panel |
| Bitácora | 2 pasos | Botón en el pie de la bitácora |
| Petición en curso (H-04) | Deshabilitado, sin plazo | Se acepta el toque: la pausa se encola, el botón dice «Pausando…» y se ejecuta al terminar la petición (7.8) |
| Resultado o pausa | Botones propios | Pausa calmada (4.8) |

### 4.8 Pausa segura

Panel corto y calmado en lugar de un tablero de puntaje: título «Tu caso está en pausa»; texto «Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.»; «Reanudar este intento» (principal, con foco, visible sin desplazarse) y «Volver al catálogo»; recursos de apoyo si el intento los trae; un `<details>` cerrado «Ver mi seguimiento» con el tablero actual. Sin «Puntaje total» ni claves internas en primer plano. Se conserva `role="alertdialog"` con nombre que contiene «pausa» (el e2e busca `/pausa/i`).

---

## 5. Contenido: textos exactos en español

Reglas de redacción: tuteo de colega, imperativo neutro («Habla con», «Recoge», «Revisa», «Pasa a», «Toma tu decisión»), sin exclamaciones, sin «completa», «logro», «misión», «objetivo», «puntos», sin «correcto», «adecuado», «mejor»; género neutro en lo que no es un nombre propio del mundo; todo con tildes. Los nombres entre la lista y el mundo son los mismos que el jugador ve (`label` de los objetos y `displayName` de los NPC). Los textos de esta sección son un contrato: se escriben UNA vez en `orientation.config.ts` y `stage-route.config.ts` y los revisa Psicología antes de publicar (pregunta 12).

### 5.1 Rótulos fijos

| Dónde | Texto |
|---|---|
| Título de la tarjeta | `Qué hacer` |
| Contador (tarjeta y chip del HUD) | `Decisión {k} de 6`; en `cierre-caso`: `Caso cerrado` |
| Chip central del HUD | el título de la etapa (6.2): `Urgencia vital y crisis` · `Marco normativo en salud` · `Acción técnica y ética` · `Ruta de restablecimiento` · `Marco normativo de derechos` · `Actuación y cierre` |
| Botón de plegar | `Ocultar pasos` / `Mostrar pasos` |
| Chip compacto | `Qué hacer · {n}` ({n} = pendientes; sin número si todo está hecho) |
| Pie de la tarjeta con recomendados pendientes | `Recomendado antes de decidir: {n} de {m} hechos. Puedes decidir cuando quieras.` |
| Pie con todo hecho | `Reuniste lo recomendado. Decide con calma: no hay límite de tiempo.` |
| Sección plegada | `También en esta sala` |
| Marcas de esa sección (texto, no solo icono) | `ya hablaste` · `ya revisaste` · `aún no` |
| Encabezados de sala (solo si la etapa cruza varias) | `Hospital · Urgencias` · `Hospital · Sala de escucha familiar` · `Comisaría de Familia · Recepción` · `Comisaría de Familia · Consultorio` (+ ` · estás aquí`) |
| Texto oculto de estado de cada fila | `Hecho:` · `Siguiente:` · `Pendiente:` · `Bloqueado hasta:` |
| Botón de ayuda en el HUD | icono `help`, `aria-label="Abrir cómo se juega"`, `title="Cómo se juega"` |
| Fila en Ajustes | `Cómo se juega` y `Ver la ayuda otra vez` |
| Botón de salida segura | `Salida segura` (nombre accesible igual al visible; se quita «(Escape)») |
| Panel de diálogo | `Volver al mapa` |
| Dock | `Herramientas {n} de {m}`; bloqueadas: `Se consigue explorando las salas del caso.` (sin número de atajo) |
| Botón táctil sin objetivo | `Acércate a algo` |
| Barra, E sin nada cerca | `No hay nada a tu alcance. Acércate a una persona o un objeto.` |

### 5.2 Rutas por etapa (contenido autorado de `STAGE_ROUTES`)

`where` (el lugar) **no se escribe**: se calcula con `placeHint` desde las coordenadas vivas del objeto o del NPC (7.3). La variante «con nombre» solo se usa con `NAME_TOOLS_IN_HINTS = true`. Peso: **prep** = recomendado antes de decidir (sale de `NODE_EVIDENCE`), **ruta** = lo exige una puerta, **decisión**. Claves de sala = `caseRoomKind(mapKey)` (`case-pdf-rooms.geometry.ts:55-62`), así las copias por etapa comparten ruta.

**Etapa 1 · nodo `hospital-urgencias` · «Urgencia vital y crisis»**
Introducción: `Estás en Urgencias. Reúne lo que necesites aquí y pasa a la Sala de escucha familiar: ahí tomarás tu primera decisión.`

| id | Tipo | Peso | Sala | Destino | Texto | Con nombre | Hecho cuando | Notas |
|---|---|---|---|---|---|---|---|---|
| `u1-recoger` | collect | prep | urgencias | `tool-pap` | Recoge el material de apoyo de la sala | Recoge el Kit PAP | `inventory ∋ PAP` | |
| `u1-familia` | talk | ruta | urgencias | `familia-crisis` | Habla con la Familia en crisis | igual | `inspected ∋ familia-crisis` | |
| `u1-usar` | use | prep | urgencias | `familia-crisis` | Usa el material de apoyo en esa conversación | Usa el Kit PAP con la Familia en crisis | `toolUsed(PAP)` | `needs: u1-recoger`; bloqueado: «Primero recoge el material de apoyo de la sala.»; nota: «Aparece como opción dentro de la conversación.» |
| `u1-enfermera` | talk | prep | urgencias | `npc:enfermera-urgencias` | Habla con la Enfermera de urgencias | igual | `viewedNpcKeys ∋ enfermera-urgencias` | |
| `u1-puerta` | door | ruta | urgencias | `puerta-sala-escucha` | Pasa a la Sala de escucha familiar | igual | sala alcanzada: sala-escucha | bloqueado con el motivo vivo de la puerta |
| `u1-decidir` | decide | decisión | sala-escucha | `familia-duelo` | Toma tu primera decisión con la Familia en crisis | igual | nunca | muestra «· en la Sala de escucha familiar» |

**Etapa 2 · `hospital-sala-escucha` · «Marco normativo en salud»**
Introducción: `Tu segunda decisión te espera en esta sala.`
`u2-decidir` (decide, sala-escucha, `marco-normativo-hospital`): `Toma tu segunda decisión en el Marco normativo`. No hay evidencia previa (`NODE_EVIDENCE` no define esta etapa).

**Etapa 3 · `hospital-accion-etica` · «Acción técnica y ética»**
Introducción: `Tercera decisión. Antes, mira qué hay en el estante de esta sala.`

| id | Tipo | Peso | Sala | Destino | Texto | Con nombre | Hecho cuando |
|---|---|---|---|---|---|---|---|
| `u3-recoger` | collect | prep | sala-escucha | `tool-spikes` | Recoge el material del estante | Recoge el Protocolo EPICEE | `inventory ∋ SPIKES` |
| `u3-decidir` | decide | decisión | sala-escucha | `psicologa-acompanante` | Toma tu tercera decisión con la Psicóloga hospitalaria | igual | nunca |

**Etapa 4 · `hospital-cierre-bloque` · «Ruta de restablecimiento»**
Introducción: `La atención continúa en la Comisaría de Familia: sal por la puerta de la derecha.`

| id | Tipo | Peso | Sala | Destino | Texto | Con nombre | Hecho cuando | Notas |
|---|---|---|---|---|---|---|---|---|
| `c4-salida` | door | ruta | sala-escucha | `salida-institucional` | Sal hacia la Comisaría de Familia | igual | sala alcanzada: recepción | |
| `c4-expediente` | inspect | ruta | recepcion | `expediente-caso` | Revisa el Expediente del caso | igual | `inspected ∋ expediente-caso` | |
| `c4-puerta` | door | ruta | recepcion | `puerta-consultorio` | Pasa al Consultorio | igual | sala alcanzada: consultorio | bloqueado: «Antes de pasar, revisa el Expediente del caso.» |
| `c4-recoger` | collect | prep | consultorio | `tool-riesgo` | Recoge el instrumento de la sala | Recoge la Valoración de riesgo | `inventory ∋ RISK_METER` | |
| `c4-usar` | use | prep | consultorio | `sobreviviente-consulta` | Usa el instrumento en la conversación con la Sobreviviente | Usa la Valoración de riesgo con la Sobreviviente | `toolUsed(RISK_METER)` | `needs: c4-recoger`; nota: «Aparece como opción dentro de la conversación.» |
| `c4-decidir` | decide | decisión | consultorio | `sobreviviente-consulta` | Toma tu cuarta decisión con la Sobreviviente | igual | nunca | |

**Etapa 5 · `comisaria-consultorio` · «Marco normativo de derechos»**
Introducción: `Tu quinta decisión te espera en este consultorio.` `c5-decidir` (decide, consultorio, `marco-normativo-comisaria`): `Toma tu quinta decisión en el Marco normativo`.

**Etapa 6 · `comisaria-accion-final` · «Actuación y cierre»**
Introducción: `Última decisión del caso. Sigues en el consultorio.`
`c6-recoger` y `c6-usar` (los mismos textos de `c4-recoger`/`c4-usar`, `carryOver: true`: solo se emiten si siguen pendientes, que es lo que pide `NODE_EVIDENCE['comisaria-accion-final']`); `c6-decidir` (decide, consultorio, `profesional-psicosocial`): `Toma tu sexta decisión con la Profesional psicosocial`.

**Nodos sin lista**: `cierre-caso` (terminal: el resultado cubre el mundo) y `comisaria-recepcion` (nodo-sala que nunca es el nodo actual, WAY-01). Casos del editor o versiones nuevas (clave sin ruta): lista derivada del mundo vivo con los NPC y objetos de `NODE_EVIDENCE` de ese nodo (si existe), título = `currentNode.title`, introducción = primera frase de `currentNode.narrative`; si no hay nada, la tarjeta no se monta.

**Coherencia obligatoria con la compuerta existente** (spec): el conjunto de pasos `prep` de cada etapa equivale exactamente a `NODE_EVIDENCE[nodo]`: `collect`+`use` de la misma herramienta equivale a `usedTools`; solo `collect` equivale a `tools`; `talk` con NPC equivale a `npcs`; `inspect` equivale a `inspected`. Si alguien cambia la compuerta sin tocar la ruta, falla Jest.

### 5.3 La línea «Ahora:» (barra sin interacción cercana)

| Situación | Texto |
|---|---|
| El siguiente paso está en la sala actual | `Ahora: {texto} · {lugar}` (p. ej. `Ahora: Recoge el material de apoyo de la sala · a la izquierda, al frente`) |
| Está en otra sala y hay camino | `Ahora: Ve a {sala} ({puerta, lugar}) y {texto con minúscula inicial}` (p. ej. `Ahora: Ve a Urgencias (puerta en el extremo izquierdo) y habla con la Enfermera de urgencias`) |
| Está en otra sala y no hay camino (el consultorio no tiene vuelta al hospital) | `Ahora: {texto} · {en la sala}` |
| Solo queda la decisión | `Ahora: {texto de la decisión} · {lugar}` |
| Sin lista (nodo sin ruta ni derivación) | `Explora la sala. Acércate a una persona o un objeto y pulsa E.` (táctil: `… y toca «Interactuar».`) |

### 5.4 Puertas (el mensaje se calcula de los requisitos vivos; sustituye al `lockedMessage` del seed sin re-sembrar)

`doorBlockedMessage(door, ctx)` junta los requisitos que faltan con « y » y añade el lugar (`placeHint`) cuando el objeto está en la sala actual.

| Requisito vivo | Texto |
|---|---|
| `requiresInspected: [familia-crisis]` | `Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).` |
| `requiresInspected: [expediente-caso]` | `Antes de pasar, revisa el Expediente del caso (a la derecha, al fondo).` |
| `requiresNodes: [hospital-cierre-bloque]` (copias de la sala de escucha de las etapas 1 a 3) | `Esta salida se abre cuando termines las decisiones del hospital. Te quedan {n} decisiones.` (singular: `Te queda 1 decisión.`; n = 4 − k) |
| varios requisitos | se unen con ` y ` |
| sin metadata legible | `Antes de pasar, revisa lo pendiente en «Qué hacer».` (respaldo antiguo: «Aún no puedes pasar: te falta información clave de esta sala.») |

Esto corrige dos textos del seed: `LOCKED_CONSULTORIO` menciona «la orientación de ingreso», que no se exige (`seed_caso_pdf.py:141`), y `LOCKED_INSTITUCIONAL` dice «Completa la contención» (nombra el tema de H1). El seed no se toca (re-sembrar borra los intentos de la versión y reinicia la contraseña del administrador, `seed_caso_pdf.py:1110-1117`, `:1165`).

### 5.5 Aviso único de evidencia (sobre las opciones y en el diálogo «Criterio profesional»)

> `Antes de decidir te falta: {frases}. Puedes seguir explorando o decidir ahora; tu decisión quedará registrada con información incompleta.`

`humanizeMissing(items, ctx)` devuelve las frases; se añade «(en {sala})» cuando el elemento está en otra sala que la actual. Distingue *tener* de *usar*.

| Falta | Frase (genérica, bandera por defecto) | Con `NAME_TOOLS_IN_HINTS = true` |
|---|---|---|
| NPC | `hablar con {artículo} {nombre}` | igual |
| Objeto por revisar | `revisar {artículo} {nombre}` | igual |
| Herramienta por tener | `recoger {genérico de TOOL_HINTS}` (p. ej. `recoger el material del estante`) | `recoger {nombre}` |
| Herramienta por usar | `usar {genérico}` (p. ej. `usar el material de apoyo de la sala`) | `usar {nombre}` |

Nunca aparece una clave: si una clave no está en `ENTITY_NAMES`, la frase es `algo en otra sala` y en desarrollo se registra un error de consola (el spec lo impide para las claves del seed).

### 5.6 Avisos y errores

| Evento | Texto |
|---|---|
| Recoger | `Obtuviste: {etiqueta}. Ya está en tu barra de herramientas.` |
| Paso anotado (hablar) | `Anotado: hablaste con {artículo} {nombre}.` |
| Paso anotado (revisar) | `Anotado: revisaste {artículo} {nombre}.` |
| Paso anotado (usar) | `Anotado: usaste {genérico} en la conversación.` |
| Paso anotado (llegar) | `Anotado: llegaste a {la Sala de escucha familiar}.` |
| Nueva etapa (banner) | `Nueva etapa: {título de la etapa}` |
| Registro (fundido) | `Registrando tu decisión…` |
| Supervisión sin números | `Tu decisión quedó registrada en tu seguimiento formativo.` |
| Conversación de otra etapa | `Esta conversación corresponde a otro momento del caso.` |
| Error al hablar con un NPC | `apiErrorMessage(err, 'No pudimos registrar la conversación. Acércate un poco más e inténtalo de nuevo.')` (hoy: «…interaccion con el NPC.», sin tilde, `:1555`) |
| Error al usar herramienta | `apiErrorMessage(err, 'No pudimos usar la herramienta.')` |
| Error de decisión | `apiErrorMessage(err, 'No pudimos registrar tu decisión. Inténtalo de nuevo.')` |

### 5.7 Panel de decisión

| Elemento | Texto |
|---|---|
| Cabecera fija (solo si hay alguna opción con `decisionOptionId` activa) | chip `Decisión clínica` + `Tu elección queda registrada en tu seguimiento formativo.` |
| Subtítulos de grupo (solo si hay a la vez herramienta y decisión, como en C1) | `Usar una herramienta` · `Decisión clínica` (sin reordenar: la herramienta ya va primero, `seed_caso_pdf.py:813-817`) |
| Opción de herramienta sin la herramienta (`aria-disabled`, sigue enfocable) | chip `Aún no tienes esta herramienta. Recógela en la sala.` |
| Conversación de otra etapa | solo las líneas del hablante + línea final `Esta conversación corresponde a otro momento del caso.` + «Continuar» |
| Pista de teclado (solo puntero fino) | `Enter: continuar · 1 a {n}: elegir · Esc: volver al mapa` |
| Nombre accesible de «Continuar ▶» | `Continuar` (hoy `Cerrar diálogo (Esc)`, TOUCH-09) |

### 5.8 Ayuda

**Tarjeta de primera vez** (no modal, sin temporizador, no roba foco, no consume Esc; solo después del aviso ETH-01, de la introducción y del contexto):

| Variante | Texto |
|---|---|
| Teclado | 1. `Muévete con las flechas o WASD. Acércate a una persona o un objeto: abajo aparece su nombre. Pulsa E para actuar.` 2. `La tarjeta «Qué hacer» te dice el siguiente paso y dónde. Nunca marca cuál decisión es la adecuada: eso lo decides tú.` 3. (solo si `SAFE_EXIT_ALWAYS_REACHABLE`) `Puedes pausar el caso en cualquier momento con «Salida segura» (con teclado, también Esc). Tu avance se guarda.` |
| Táctil | 1. `Mantén pulsada una flecha para caminar. Cuando algo tenga nombre cerca, toca «Interactuar».` + las mismas líneas 2 y 3 sin «con teclado, también Esc» |
| Compacto (< 520 px de alto) | `Mantén pulsada una flecha para caminar. Toca «Interactuar» cuando veas un nombre abajo.` |

Botones: `Entendido` (44 px) y `Más ayuda`. Memoria: `localStorage` clave `siep.ayuda.v1` = `{"v":1,"vistas":["primero"]}`, sin identificadores ni fechas, con `try/catch` y respaldo en memoria; subir `v` la reactiva.

**Pantalla permanente «Cómo se juega»** (diálogo no modal, `cdkTrapFocus`; «Cerrar ayuda» y Esc la cierran y el segundo Esc pausa; no contiene ningún botón llamado «Salida segura»; se abre con `?`, desde Ajustes y desde el lobby):

| Sección | Texto |
|---|---|
| El caso | `Acompañas una atención psicosocial en dos lugares: el hospital y la Comisaría de Familia. Tomarás 6 decisiones clínicas, una por etapa. Entre una y otra explorarás las salas, hablarás con las personas y reunirás información.` |
| Moverte | Teclado: `Flechas o WASD.` Táctil: `Mantén pulsada una flecha; un toque da un paso corto.` |
| Interactuar | Teclado: `Acércate a una persona o un objeto con nombre y pulsa E (también sirven Espacio y Enter).` Táctil: `Acércate y toca «Interactuar». El botón dice con qué vas a interactuar.` |
| Qué hacer | `La tarjeta «Qué hacer» te dice el siguiente paso y dónde, y se marca sola cuando lo haces. Los pasos de «Antes de decidir» son recomendados: puedes decidir sin completarlos, pero tu decisión quedará registrada con información incompleta.` |
| Herramientas | `Se recogen explorando las salas y quedan en la barra de abajo. Se usan durante una conversación, cuando aparece la opción de usarlas. Al tocar una herramienta de la barra lees para qué sirve.` |
| Decidir sin prisa | `No hay límite de tiempo. Ninguna opción está marcada como correcta; recibirás retroalimentación formativa después de decidir. Tu elección queda registrada en tu seguimiento.` |
| Bitácora | `Escribe tus reflexiones cuando quieras (tecla J o botón de la cabecera).` (táctil: `… con el botón de la cabecera.`) |
| Salida segura (solo si `SAFE_EXIT_ALWAYS_REACHABLE`) | `Puedes pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y lo retomas cuando quieras.` |
| Teclas (solo puntero fino) | `Mover: flechas o WASD · Interactuar: E, Espacio o Enter · Avanzar un diálogo: Enter o Espacio · Elegir una opción: 1 a 4 · Bitácora: J · Salida segura: Esc` |

No se promete el atajo 1 a 5 de herramientas (no existe), no se nombra ninguna técnica y la regla de reconsiderar no se anuncia (pregunta 4).

### 5.9 Textos que el diseño retira o cambia

| Hoy | Dónde | Problema | Después |
|---|---|---|---|
| «Estabiliza emocionalmente a la familia y evita acciones prematuras…» | `hospital-map.config.ts:10-11` vía `scene-objectives.config.ts:11` | Es la respuesta de H1 (DLG-08) | Se deja de mostrar; las constantes quedan solo para specs y respaldo |
| «Valora el riesgo, activa medidas de protección y orienta derechos…» | `scene-objectives.config.ts:16-17` | Es C1 y se muestra dos salas antes (WAY-01) | Ídem |
| «…víctima, dependientes, nivel de riesgo y rutas.» | `scene-objectives.config.ts:20-21` | Enumera lo que distingue C3 | Ídem |
| «Información insuficiente: habla con la enfermera… aplica Primeros Auxilios Psicológicos…» | `evidence-gating.config.ts:27` | Nombra la técnica | Aviso único 5.5 |
| «Escenario k de 8» y «Paso k — … (k/6)» | `simulation-play.component.ts:1645-1651`, `simulation-hud.component.ts:48-53` | Dos contadores que no coinciden; el 8 nunca se alcanza (WAY-06) | «Decisión k de 6» |
| «Aún no puedes pasar: te falta información clave de esta sala.» y `LOCKED_*` | `:1282`, `seed_caso_pdf.py:134-141` | Genérico o impreciso | 5.4 |
| «Puedes usar la salida segura en cualquier momento» en la tarjeta de objetivo durante toda la escena 1 | `simulation-play.component.ts:240-244`, `seed_caso_pdf.py:160` | Promesa que hoy es falsa en táctil e introducción (HUD-09) | Sale de la tarjeta; vive en la ayuda condicionada a `SAFE_EXIT_ALWAYS_REACHABLE` |
| «Puntaje +12 · Estrés -5% · Confianza +10 · Riesgo -5» | `:1795` | Cifras del motor legacy que no coinciden con las barras (DLG-13); lenguaje de puntaje (límite 2) | 5.6 |
| «No pudimos guardar la interaccion con el NPC.» | `:1555` | Sin tilde y sin causa | 5.6 |
| «WASD mover · E interactuar · J bitácora · Esc salida segura» | `:316` | Atajos en táctil, pisa herramientas | «Ahora: …» y la leyenda solo con puntero fino y ancho suficiente |

---

## 6. Modelo de datos

### 6.1 Lo que se DERIVA de datos que ya llegan al cliente (sin backend)

| Necesito | Fuente existente |
|---|---|
| Etapa y opciones activas | `attempt.currentNode.key`, `currentNode.options[].id` (solo ids; nunca la clasificación) |
| Sala actual | `world.map.key` → `caseRoomKind()` (`case-pdf-rooms.geometry.ts:55-62`) |
| Herramientas poseídas / usadas | `world.inventory`, `world.usedToolKeys` (`toolUsed()` en `evidence-gating.config.ts:86`) |
| Persona hablada / objeto revisado | `world.inspectedObjectKeys`, `world.flags['viewedNpcKeys']` y la señal `viewedNpcKeys` del componente |
| Posición de objetos y NPC (el «dónde») | `world.objects[].x,y`, `scenarioConfig.rooms[].npcs[].x,y` |
| Puertas y sus requisitos | `world.objects[type==='EXIT'].metadata.requires*` y `targetNodeKey` |
| Objeto que aloja la decisión activa | cruce de `object.dialogue.choices[].decisionOptionId` con `currentNode.options[].id` |
| Herramienta que falta para una opción | `choice.requiredToolCode` frente a `world.inventory` |
| Lo que falta antes de decidir | `NODE_EVIDENCE` + `missingEvidence()` |

### 6.2 Lo que se AÑADE (solo frontend; ningún campo nuevo de backend es necesario)

| Dato | Dónde vive | Notas |
|---|---|---|
| Rutas por etapa | `stage-route.config.ts` | 6 etapas; mismo patrón que `NODE_EVIDENCE` |
| Nombres con artículo, herramientas genéricas, salas, grafo, copy, banderas | `orientation.config.ts` | Sobrescribe textos del seed sin re-sembrar |
| `visitedRooms` | señal en `simulation-play` + `sessionStorage` `siep_rooms_{caseVersionId}_{attemptId}` | Clave aparte: no toca `siep_attempt_*` (tres escritores). Refuerzo de la regla monótona |
| Marca «ayuda vista» | `localStorage` `siep.ayuda.v1` | Solo navegador |
| Campos opcionales de modelo | `simulation.model.ts` | `DialogueState.notice?`, `DialogueState.stale?`, `DialogueChoiceState.toolMissing?` (presentación) |
| Atributos de prueba | `data-next-step`, `data-next-room` (tarjeta), `data-scene-state` (contenedor del juego) | Para e2e sin coordenadas fijas |

### 6.3 Firmas y estructuras

```ts
// orientation.config.ts
export type RoomGroup = 'urgencias' | 'sala-escucha' | 'recepcion' | 'consultorio';
export const ROUTE_ORDER: readonly RoomGroup[] = ['urgencias', 'sala-escucha', 'recepcion', 'consultorio'];
export const ROOM_LABELS: Record<RoomGroup, { name: string; en: string; ve: string; group: 'Hospital' | 'Comisaría de Familia' }>;
export const ROOM_GRAPH: Record<RoomGroup, Partial<Record<RoomGroup, string>>>; // arista dirigida → clave de la puerta
//   urgencias → { 'sala-escucha': 'puerta-sala-escucha' }
//   sala-escucha → { urgencias: 'puerta-urgencias', recepcion: 'salida-institucional' }
//   recepcion → { consultorio: 'puerta-consultorio' }          (sin vuelta al hospital, igual que el seed)
//   consultorio → { recepcion: 'puerta-recepcion' }
export interface EntityName { name: string; article: 'el' | 'la' | 'los' | 'las'; room: RoomGroup }
export const ENTITY_NAMES: Record<string, EntityName>;   // una línea por entidad (objetos y NPC del seed)
export interface ToolHint { room: RoomGroup; generic: string; named: string }
export const TOOL_HINTS: Record<string, ToolHint>;       // PAP, SPIKES, RISK_METER
export const NAME_TOOLS_IN_HINTS = false;                // pregunta 1
export const HIGHLIGHT_TOOL_TARGETS = true;              // pregunta 1
export const SAFE_EXIT_ALWAYS_REACHABLE = false;         // se pone en true en el mismo cambio que lo hace cierto (T9)
export const DECISION_TOTAL = 6;

// stage-route.config.ts
export type StepKind = 'talk' | 'inspect' | 'collect' | 'use' | 'door' | 'decide';
export type StepWeight = 'prep' | 'route' | 'decision';
export type DoneRule =
  | { type: 'npc'; key: string }            // viewedNpcKeys ∪ inspectedObjectKeys
  | { type: 'inspected'; key: string }
  | { type: 'inventory'; toolCode: string }
  | { type: 'toolUsed'; toolCode: string }
  | { type: 'visitedRoom'; room: RoomGroup }
  | { type: 'never' };
export interface RouteStep {
  id: string; kind: StepKind; weight: StepWeight; room: RoomGroup;
  targetKey: string;                // clave de objeto o 'npc:{clave}'
  label: string; labelNamed?: string; note?: string; lockedNote?: string;
  done: DoneRule; needs?: string; carryOver?: boolean;
}
export interface StageRoute { nodeKey: string; number: number; title: string; intro: string; steps: RouteStep[] }
export const STAGE_ROUTES: Record<string, StageRoute>;

// scene-checklist.util.ts (puro: sin Angular ni Phaser)
export type StepState = 'done' | 'next' | 'pending' | 'locked';
export interface SceneLogStep {
  id: string; kind: StepKind; weight: StepWeight; state: StepState; label: string;
  place: string | null;          // 'a la izquierda, al frente'; solo si el paso está en la sala actual
  roomLabel: string | null;      // 'en Urgencias'; solo si es otra sala
  here: boolean; note: string | null; targetKey: string; room: RoomGroup;
  doneText: string;              // 'Anotado: …' (para las notas)
}
export interface SceneLogGroup { room: RoomGroup; header: string | null; current: boolean; collapsed: boolean; steps: SceneLogStep[] }
export interface OptionalEntry { key: string; label: string; seen: boolean | null }  // null = sin noción de «visto»
export interface SceneNextTarget { stepId: string; targetKey: string; room: RoomGroup; isHere: boolean; hopDoorKey: string | null }
export interface SceneLogState {
  number: number; total: number; title: string; intro: string;
  next: SceneNextTarget | null; nextLine: string;
  groups: SceneLogGroup[]; optional: OptionalEntry[];
  prepDone: number; prepTotal: number; footer: string;
}
export interface SceneLogInput {
  nodeKey: string | null; nodeTitle: string | null; nodeNarrative: string | null;
  nodeOptionIds: readonly number[] | null;          // solo ids (P1)
  mapKey: string | null; objects: readonly MapObjectState[];
  inventory: readonly string[]; inspected: readonly string[]; usedToolKeys: readonly string[];
  viewedNpcKeys: ReadonlySet<string>; visitedRooms: ReadonlySet<RoomGroup>;
  scenarioNpcs: readonly { key: string; displayName: string; x: number; y: number }[];
  terminal: boolean;
}
export function deriveSceneLog(input: SceneLogInput): SceneLogState | null;
export function roomGroupOf(mapKey: string | null | undefined): RoomGroup | null;
export function firstHop(from: RoomGroup, to: RoomGroup): string | null;           // clave de la puerta de `from`
export function diffDone(prev: SceneLogState | null, next: SceneLogState): SceneLogStep[];
export function ringTargetKey(state: SceneLogState | null, highlightTools: boolean): string | null;

// place-hint.util.ts
export function placeHint(x: number, y: number, opts?: { door?: boolean }): string;

// evidence-gating.config.ts (adición; missingEvidence se conserva con sus cadenas)
export interface MissingItem { kind: 'npc' | 'toolUsed' | 'toolOwned' | 'inspected'; key: string }
export function missingEvidenceItems(def: NodeEvidenceDef | null | undefined, world: SimulationWorldState | null, viewed: ReadonlySet<string>): MissingItem[];

// evidence-copy.util.ts
export interface CopyContext { currentRoom: RoomGroup | null; world: SimulationWorldState | null; nameTools: boolean; npcs: readonly { key: string; displayName: string }[] }
export function humanizeMissing(items: readonly MissingItem[], ctx: CopyContext): string[];   // infinitivo: «hablar con la Enfermera de urgencias (en Urgencias)»
export function imperativeMissing(items: readonly MissingItem[], ctx: CopyContext): string[]; // imperativo: «habla con …»
export function joinSpanish(items: readonly string[]): string;

// door-status.util.ts
export interface DoorStatus { state: 'open' | 'locked'; missing: MissingItem[]; stageLocked: boolean; message: string | null }
export function doorStatus(door: MapObjectState, ctx: { nodeKey: string; decisionNumber: number | null; world: SimulationWorldState; viewedNpcKeys: ReadonlySet<string>; copy: CopyContext }): DoorStatus;

// dialogue-decoration.util.ts (extrae simulation-play.component.ts:1334-1359)
export interface DecorationCtx {
  nodeKey: string | null; nodeOptionIds: readonly number[] | null;   // null o vacío = desconocido: no filtrar
  evidence: NodeEvidenceDef | null; world: SimulationWorldState | null;
  viewedNpcKeys: ReadonlySet<string>; copy: CopyContext;
}
export function decorateDialogueState(d: DialogueState, ctx: DecorationCtx): DialogueState;
export function activeDecisionObjectKeys(world: SimulationWorldState | null, optionIds: readonly number[] | null): Set<string>;
export function otherStageDecisionKeys(world: SimulationWorldState | null, optionIds: readonly number[] | null): Set<string>;

// interaction-verb.util.ts
export function interactionVerb(obj: MapObjectState, door: DoorStatus | null): { text: string; locked: boolean; reason: string | null };

// interaction-priority.util.ts (adición; nearbyInteractionChannel se conserva)
export interface NearbyCandidate { key: string; kind: 'marker' | 'npc'; exit: boolean; distance: number; radius: number }
export const NPC_INTERACT_RADIUS = 72;      // el servidor acepta 60 + 16 de tolerancia
export const MARKER_INTERACT_RADIUS = 74;   // el servidor acepta 120 (INTERACTION_RANGE_PX)
export const REVEAL_RADIUS = 140;
export const NPC_BONUS_PX = 18;
export const EXIT_PENALTY_PX = 12;
export const HYSTERESIS_PX = 8;
export function pickNearby(candidates: readonly NearbyCandidate[], currentKey: string | null): { primary: NearbyCandidate | null; secondary: NearbyCandidate | null };

// help-memory.util.ts, visited-rooms.util.ts: lectura/escritura con try/catch y respaldo en memoria
export function readHelpSeen(storage?: Pick<Storage, 'getItem'>): ReadonlySet<string>;
export function markHelpSeen(id: string, storage?: Pick<Storage, 'getItem' | 'setItem'>): void;
```

### 6.4 Salidas y entradas nuevas de los componentes

| Componente | Entradas nuevas | Salidas nuevas |
|---|---|---|
| `GameWorldComponent` | `nextTargetKey: string \| null`, `doorStates: Record<string, 'open' \| 'locked'>`, `dimmedKeys: ReadonlySet<string>`, `compact: boolean` (opcional) | `proximityAlso: MapObjectState \| null`, `nothingNearby: void`; método `refreshScale()` |
| `DialoguePanelComponent` | `releaseToken: number` | `safeExit: void`; `DialogueState.notice`, `.stale` y `DialogueChoiceState.toolMissing` llegan por el estado |
| `SimulationHudComponent` | — | `openHelp: void` |
| `AttemptOutcomeComponent` | `supportResources: string[]` (opcional) | — |
| `JournalPanelComponent` | — | `safeExit: void` |
| `SceneChecklistCardComponent` | `state: SceneLogState \| null`, `compact: boolean`, `reduceMotion: boolean`, `notice: string \| null` | `expandedChange: boolean` |
| `GameHelpComponent` | `modality: 'keyboard' \| 'touch'`, `compact: boolean`, `safeExitPromise: boolean` | `dismissed`, `openFull`, `closed` |
| `SafeExitButtonComponent` | `compact: boolean` | `pause: void` |

---

## 7. Algoritmos normativos

### 7.1 `deriveSceneLog` (puro; se recalcula solo cuando cambian `attempt`, `world`, `viewedNpcKeys`, `visitedRooms` o `scenarioConfig`)

1. `terminal` o `nodeKey` nulo → `null`. `route = STAGE_ROUTES[nodeKey]`. Sin ruta: respaldo derivado (5.2, «Nodos sin lista»); sin pasos → `null`.
2. `current = roomGroupOf(mapKey)`. `reached(room) = visitedRooms.has(room) || (current !== null && idx(current) >= idx(room))` con `idx` sobre `ROUTE_ORDER`. La regla monótona hace que la lista sea correcta tras F5 y en un navegador nuevo (el caso solo avanza de urgencias a consultorio); el conjunto de `sessionStorage` la refuerza cuando el jugador vuelve atrás.
3. `done` según `DoneRule`: `npc` = `viewedNpcKeys` ∪ `world.flags['viewedNpcKeys']` ∪ `inspectedObjectKeys` (las PERSON del mundo cuentan en ambos); `inspected` = `inspectedObjectKeys`; `inventory` = `world.inventory`; `toolUsed` = `toolUsed(world, code)`; `visitedRoom` = `reached(room)`; `never` = falso. Un paso `carryOver` hecho no se emite.
4. `locked`: (a) `needs` sin cumplir → `lockedNote`; (b) paso `door` cuya puerta existe en `world.objects` y cuyo `doorStatus` es `locked` → `doorBlockedMessage`. Las puertas de otras salas no se bloquean (no hay copia de sus requisitos).
5. **Siguiente** = el primer paso, **en el orden autorado**, que no está `done` ni `locked`. Orden autorado y no «el más cercano»: determinista y la lista no se salta a la enfermera para llegar a la decisión. Si el jugador está ante la decisión con recomendados pendientes, la lista le dice qué falta; nunca se lo impide (compuerta blanda).
6. `place` (solo si el paso está en la sala actual): coordenadas vivas de `world.objects` (o de `scenarioNpcs` para `npc:`), con `placeHint(x, y, { door: kind === 'door' })`.
7. `nextLine` según 5.3. `firstHop(current, step.room)` = BFS sobre `ROOM_GRAPH` que devuelve la puerta de la **sala actual** que hay que tomar primero (aunque falten varias salas); su lugar sale de ese objeto vivo. Sin camino o sin la puerta en el mundo: `{texto} · {en la sala}`.
8. `prepTotal` / `prepDone` cuentan los pasos `weight === 'prep'` emitidos; `footer` según 5.1.
9. `groups`: tramos consecutivos de la ruta por sala; encabezado solo si la etapa cruza más de una sala; `collapsed = todos hechos && !current`.
10. `optional`: objetos del mundo y NPC de la sala actual que no son destino de ningún paso, ni EXIT, ni objeto de decisión de otra etapa, ni herramienta (el servidor ya no envía las recogidas); orden de izquierda a derecha (por `x`); sin resaltar ninguno ni marcar «siguiente»; hasta 8. Es la versión mínima de T12 «Alrededor» (ROAD-H12): da a quien no puede ver el canvas la lista de lo que hay en la sala.

`diffDone(prev, next)` devuelve los pasos recién hechos (no repite al recomputar y omite la primera evaluación de un intento). Las notas «Anotado: …» se encolan mientras `dialogue()` esté abierto.

### 7.2 Destino, atenuados y rótulos en el mundo

- `ringTargetKey(state, highlightTools)`: sin `next` → `null`; `kind === 'collect' && !highlightTools` → `null`; `next.isHere ? targetKey : hopDoorKey`.
- `GameWorldComponent` recibe `nextTargetKey`, `doorStates` y `dimmedKeys` (= `otherStageDecisionKeys`). Un único anillo `Ellipse` con trazo de 2 px `#CDBCFF` (alfa .9) y halo de 1 px `#0B0F1A`, a profundidad `ENVIRONMENT + 0,5` (bajo los actores), creado una vez y reposicionado con `setPosition` al cambiar la clave: sin animación ni trabajo por cuadro, también con movimiento reducido.
- Rótulos: el destino siempre; además los **dos** más cercanos dentro de `REVEAL_RADIUS = 140` (en táctil, uno). Igual para todos los interactuables y sin glifos por categoría. Se actualizan solo cuando cambia el conjunto visible (comparación de claves en caché), no por cuadro.
- Tamaño legible: `labelScale = Math.max(1, 12 * displayScale.x / fontSizeBase)` recalculado en `scale.on('resize')`; a 844x390 (escala 0,49) un rótulo de 11 px de canvas se dibuja a ≈ 24 px y mide 12 px de pantalla. Máximo de ancho 168 px de pantalla.
- Puertas: el rótulo (`E  {label} →`) pasa a verse dentro del radio de revelado y, si `doorStates[key] === 'locked'`, lleva un candado y un borde discontinuo (forma, no solo color).
- Objetos atenuados (`dimmedKeys`): alfa .55, sin anillo, rótulo solo a ≤ 74 px.
- En táctil el glifo `▲ E` sobre los NPC (`game-world.component.ts:1446`, `:1491`) se sustituye por `▲`.

### 7.3 `placeHint(x, y, opts?)`

Mapa de 960x540. Bandas horizontales: `[0,200)` «en el extremo izquierdo» · `[200,400)` «a la izquierda» · `[400,600)` «en el centro» · `[600,760)` «a la derecha» · `[760,960]` «en el extremo derecho». Banda vertical: `y < 360` «al fondo», si no «al frente». Resultado: `«{horizontal}, {vertical}»`; para puertas (`door: true`): `«puerta {horizontal}»`. Estable (no depende del jugador). Verificación con las coordenadas del seed (márgenes ≥ 10 px): `tool-pap` (318,428) a la izquierda, al frente; `familia-crisis` (190,420) en el extremo izquierdo, al frente; `enfermera-urgencias` (560,330) en el centro, al fondo; `puerta-sala-escucha` (838,440) puerta en el extremo derecho; `marco-normativo-hospital` (660,320) a la derecha, al fondo; `psicologa-acompanante` (740,400) a la derecha, al frente; `expediente-caso` (740,312) a la derecha, al fondo; `marco-normativo-comisaria` (790,318) en el extremo derecho, al fondo; `profesional-psicosocial` (700,400) a la derecha, al frente.

### 7.4 `pickNearby` y la proximidad en Phaser

```
válido(c)   = c.distance <= c.radius + (c.key === currentKey ? HYSTERESIS_PX : 0)
puntaje(c)  = c.distance - (c.kind === 'npc' ? NPC_BONUS_PX : 0) + (c.exit ? EXIT_PENALTY_PX : 0)
primary     = el válido de menor puntaje; empate → el NPC
si currentKey es válido y puntaje(primary) + HYSTERESIS_PX > puntaje(current) → primary = current
secondary   = el mejor del resto (o null)
```

Casos de prueba tomados de los playtests (`scratchpad/pt3/run11.json`; se genera la rejilla en el spec, no se lee el archivo): psicóloga (780,440) y puerta (838,440): en x=810 gana la psicóloga (12 frente a 40); en x=840 gana la puerta (14 frente a 42); en x=825 la puerta gana por poco (25 frente a 27); con el jugador pegado al médico (640,290) gana el médico frente a «Acceso a quirófano» (660,268) (TOUCH-12). Hoy un marcador SIEMPRE gana a un NPC (`interaction-priority.util.ts:7-13`; 16 de 27 posiciones, FEEL-02). Con la regla nueva la persona gana en 26 de las 27 y la puerta solo cuando el jugador está sobre ella.

En `game-world.component.ts`, `updateNearestInteraction` (`:2292-2335`) une marcadores (radio 74) y NPC (radio 72) en una sola lista reutilizando un arreglo de trabajo (sin asignaciones por cuadro) y llama a `pickNearby`. El principal sale por `onProximity` (contrato actual; un NPC se emite como `MapObjectState` sintético `{ key: 'npc:'+npc.key, label: displayName, type: 'PERSON', … }`) y el secundario por `onProximityAlso`. `interactNearest` (`:771-779`) despacha por clave: marcador → `onInteract`; `npc:` → `onNpcInteract`. La señal `isAnyNpcInRange` y `nearbyInteractionChannel` se conservan (compatibilidad y spec). En `simulation-play`, `openInteraction` resuelve las claves `npc:` contra `scenarioConfig()` y llama a `openNpcDialogue`; en la rama de E de `handleGlobalInteraction` se ignora la clave `npc:` (la maneja Phaser; `openNpcDialogue` ya es idempotente por `busy`).

Radios y servidor (V2): cliente NPC 72, servidor NPC `radio + NPC_RANGE_TOLERANCE_PX (16)` = 76; marcadores 74 frente a 120 del servidor. **Regla: el cliente nunca ofrece una interacción que el servidor rechace.** Prueba de alcanzabilidad (spec geométrico): para cada interactuable de cada sala existe un punto libre según `collidesInCaseRoom(mapKey, x, y)` a ≤ 60 px de pies.

### 7.5 `doorStatus` y `doorBlockedMessage` (única fuente de verdad)

```
missing     = missingEvidenceItems({npcs: meta.requiresNpcs, tools: meta.requiresTools, inspected: meta.requiresInspected}, world, viewed)
stageLocked = requiresNodes.length > 0 && !requiresNodes.includes(currentNodeKey)
state       = (missing.length || stageLocked) ? 'locked' : 'open'
message     = state === 'locked' ? doorBlockedMessage(...) : null     // 5.4
```

La usan: el rótulo del mundo (`doorStates`), la barra contextual (candado y motivo antes de pulsar), `tryOpenDoor` (que hoy repite la lógica en `simulation-play.component.ts:1266-1292`) y la lista (paso `door` bloqueado). Se extrae sin cambiar el resto de `tryOpenDoor` (histéresis de puerta, fundido, `enterRoom`).

### 7.6 `decorateDialogueState` y panel de decisión

Reglas (la extracción de `simulation-play.component.ts:1334-1359`):

1. `hasDecision = d.choices.some(c => c.decisionOptionId != null)`.
2. Con `nodeOptionIds` no vacío: se quitan las opciones con `decisionOptionId != null` fuera de ese conjunto. **Se conservan las de herramienta** (`decisionOptionId == null`, p. ej. `pap-familia` y `c1-aplicar-riesgo`): sin esta distinción el paso `c6-usar` sería imposible.
3. Si `hasDecision` y no sobrevive ninguna opción de decisión: `stale = true` y se añade la línea de sistema `Esta conversación corresponde a otro momento del caso.`; el panel muestra solo conversación + «Continuar».
4. Aviso de evidencia: una sola vez, en `notice` (5.5), para el conjunto de opciones de decisión activas; se elimina `evidenceWarning` por opción.
5. `toolMissing = !!choice.requiredToolCode && !inventory.includes(code)`.
6. Se conservan `unlockedExtraLines` (con `emotion: 'positive'`; el resolver de retratos evita la sonrisa, V7/V8).
7. (P2, opcional) orden estable por intento de las opciones de decisión (semilla `attemptId + dialogue.key`), las de herramienta siempre primero; los dígitos 1-n siguen el orden mostrado. No sustituye la revisión clínica de longitud y estructura (pregunta 4).

`DialoguePanelComponent`:

- **Cabecera fija** (`position: sticky; top: 0`) con chip «Decisión clínica» (si procede), «Volver al mapa» (emite `close`) y `<app-safe-exit-button>` (emite `safeExit`); clases propias distintas de `close-btn` (V5).
- **Liberación** (DLG-01): `releaseToken = input(0)`; un `effect` pone `chosenKey = null` cuando cambia; `simulation-play` incrementa el token en todo error de `executeDecision`, `useTool` y de apertura.
- **Sin foco inicial en una opción** (DLG-03): con opciones visibles se enfoca el grupo `.choices` (`tabindex="-1"`), no una opción; un clic con `event.detail === 0` (activación por teclado) en los primeros 500 ms tras mostrar las opciones se ignora. Se conserva la aserción de `dialogue-panel.component.spec.ts:109,117,129` (el foco queda dentro del diálogo).
- **Scroll** (TOUCH-01, DLG-16): anclar al fondo solo mientras se escribe (`!isTypingComplete()`); al aparecer las opciones, `scrollIntoView({ block: 'nearest' })` una vez sobre `.choices`; solo las opciones se desplazan.
- **Retrato** del modo lateral con altura `clamp(96px, 18vh, 150px)` (hoy ocupa ≈ 350 px) y sin chip ni etiqueta de emoción para personas (solo la voz de sistema los conserva; `emotionColor()` y `.emotion-tag { … opacity: 1; }` se conservan por el contrato de contraste).
- **Marcado de opciones**: opción de herramienta sin la herramienta con `aria-disabled="true"` y chip (5.7); sin insignia por opción.
- **Nombres accesibles**: «Continuar» = texto visible; «Saltar» ya contiene su texto visible.

### 7.7 Decisión en dos tiempos (resuelve DLG-05 y DLG-06)

```
executeDecision(id):
  guardas actuales (filtro de etapa ya hecho por 7.6; el mensaje de otra etapa queda como red de seguridad), compuerta de evidencia
  busy = true; dialogue = null; decisionPending = true            // «Registrando tu decisión…» (role=status)
  POST /decisions                                                  // SIN fundido previo
    next(updated):
      pendingDecisionResult = updated                              // NO se aplica todavía
      dialogue = buildSupervisionDialogue(updated.feedback)        // clave 'supervision-…', sin números (5.6)
      decisionPending = false; busy = false
    error: releaseToken++; mensaje real; busy = false

closeDialogue():  // Esc, «Continuar», «Volver al mapa»
  si el diálogo cerrado era 'supervision-…' y hay pendingDecisionResult → applyDecisionResult()

applyDecisionResult():
  u = pendingDecisionResult; pendingDecisionResult = null; dialogue = null
  si u.feedback?.retryRequired: attempt = u; hydrate; return       // la escena no cambia (primera respuesta mala)
  triggerFade(() => { attempt = u; hydrate; persistAttemptToken; selectedInteraction = null; nearbyInteraction = null;
                      journalPanel.clear(); loadProgressMap; loadWorld;  // aquí cambia la sala y, con ella, la etapa
                      audio: estrés y, si COMPLETED, resolución; pendingDecisionImpact = u.feedback })
```

- Última decisión: la supervisión se ve sobre la escena y, al «Continuar», `attempt.set(COMPLETED)` abre el resultado. `resolveViewMode` no cambia.
- `pauseFromOverlay()` con una decisión pendiente descarta `pendingDecisionResult` y adopta el intento que devuelve el servidor (ya avanzó).
- Una recarga con la supervisión abierta reanuda el intento ya avanzado; se pierde la lectura del feedback (aceptado).
- Se añade `data-scene-state="idle|transition"` al contenedor del juego (`transition` mientras `fadeActive()` o hay un resultado por aplicar) para que los e2e esperen sin tiempos fijos.
- **Respaldo si T9.12 se corta**: `holdOutcome` en `simulation-view-mode.util.ts` (con `status ≠ IN_PROGRESS` y `holdOutcome && dialogue` devuelve `dialogue-cinematic`) más «Registrando tu decisión…» en el fundido actual.

### 7.8 Salida segura (diseño mínimo que cumple REGLA-004 sin cambiar ETH-02)

- `PAUSED` sigue siendo la pausa reanudable (mismo `attemptId`; `simulationService.safeExit` y `resumeAttempt` no se tocan). `safeExit()` y su prueba (`simulation-play.consent-gate.spec.ts:403-413`) no cambian.
- `pauseFromOverlay()` (nuevo): sale sin actuar si no hay intento `IN_PROGRESS`, si `showResumePrompt()` o `showContentWarning()` (ETH-01), o si ya hay una pausa en curso; si `busy()` la encola (`pausePending`, el botón muestra «Pausando…») y la ejecuta al soltarse `busy` (no se fuerza una pausa en medio de una decisión); `audioDirector.playSfx('ui_cancel')` y `withSyncedPosition(() => this.pauseCurrentAttempt())`.
- `pauseCurrentAttempt().next` limpia además `journalOpen`, `showIntroScene`, `showCaseIntro`, `helpOpen`, `pendingEvidenceDecisionId`, `pendingRestrictedInteraction`, `pendingDecisionResult` y llama a `audioDirector.stopIntroLament()`. Se limpia **al éxito**, no antes: si falla, la superposición sigue y puede reintentar.
- `resumeCurrentAttempt()` llama a `maybeShowInitialCaseIntro(world)` tras `attempt.set(...)`: si la introducción no se leyó, reaparece (`resolveIntroStep` ya lo decide); sin esto la pausa (z 150) quedaría bajo la introducción (z 380).
- Esc en introducción y contexto: en la rama `showIntroScene() || showCaseIntro()`, **antes** del chequeo `BUTTON`/`A`, `Escape` → `preventDefault()` + `pauseFromOverlay()`. Cadena de Esc con el mundo activo: ayuda → bitácora → diálogo → pausa. Bajo el aviso ETH-01 Esc se sigue tragando.
- Botón `app-safe-exit-button` en: panel de diálogo (cabecera, ambos modos, con y sin opciones y con la supervisión), bitácora, tarjeta de introducción y tarjeta de contexto. Solo hay un botón con ese nombre accesible a la vez (con una superposición abierta el pie queda `aria-hidden`).
- Texto honesto: aviso de contenido «Podrás pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y puedes retomarlo.»; nombres accesibles sin «(Escape)», «(E)», «(J)» en táctil.

### 7.9 Escala del canvas, pie fijo y modo compacto

- `ResizeObserver` de `game-world.component.ts:2681-2685`: `scale.getParentBounds(); scale.refresh();` (V1) y método público `refreshScale()` que `simulation-play` llama al cerrar el panel lateral y al terminar su animación. T0.3 mide antes (`.canvas-zone`, `.phaser-host`, `canvas`, `scale.parentSize`) para ver si además hay una fila del pie que crece.
- Pie de altura fija: `.bottom-zone { height: 64px }` (por encima de 760 px de ancho; en compacto 56 px); el botón de interacción es de una línea con elipsis; la descripción pasa al `title`. El mundo ya no se encoge al acercarse a algo.
- Compacto: `@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)`: cabecera de 44 px; tarjeta plegada; el panel de decisión pasa a hoja inferior flotante (`.main-zone` conserva una sola columna: el canvas no se reencuadra); `.right-panel__scene { display: none }` mientras hay opciones; cruceta en cruz y «Interactuar» en las bandas laterales; sin leyenda de teclado; introducción y contexto con cabecera compacta y degradado inferior.
- Escritorio: el panel lateral se conserva (el canvas se reduce mientras hay diálogo y **debe** recuperar su tamaño al cerrarlo; aserción AC-5).

### 7.10 Backend (sin migraciones, sin re-seed, sin tocar Spring)

| Cambio | Archivo | Detalle |
|---|---|---|
| Reporte y final no cuentan los reintentos (DLG-07) | `serializers/game_dtos.py:144-162`, `services/case_effects.py:289-295` | Contar solo eventos `DECISION_SELECTED` y `PROHIBITED_DECISION_SELECTED`; los `*_RETRY_REQUIRED` se muestran aparte (`retries`). Hoy dos primeros intentos críticos más seis respuestas correctas dan el Final 4. Revisar con `grep -rn "decision_option" apps/*/services` otros agregadores |
| El mensaje al cliente no lleva el «Override de evidencia» (DLG-09) | `services/game_service.py:384-387` | Guardar el texto con etiquetas solo en el evento; devolver `feedback.message` sin él |
| Tolerancia del NPC | `services/world_service.py:333-339` | `radius + NPC_RANGE_TOLERANCE_PX (16)`; sin re-seed (V2, V9) |
| Tildes | `services/world_service.py:307-312, 535-546` | `estrés`, `intervención profesional y ética`, `más apropiado`, `situación` |
| El nodo no envía la clasificación (WAY-15, DLG-25, límite 1) | `serializers/game_dtos.py:52-64` | `decision_option_state` devuelve solo `id` y `text`; el feedback posterior a elegir sí lleva la clasificación. Tests: `test_game.py:142,374,406` leen la clasificación con `DecisionOption.objects.get(pk=o["id"])`. Frontend: quitar `classification` y `prohibitedConduct` de `SimulationDecisionOption`, y `isRecommended`/`isProhibited` de `DialogueChoiceState` (hoy solo se asignan, `simulation-play.component.ts:1354,1386,1394,1770`) |
| (P2) Revisión por decisión en el resultado (DLG-19) | `serializers/game_dtos.py` | `decisionReview[]` por decisión registrada: texto elegido y `immediate_feedback` (ya guardado). El intento ya terminó: no viola el límite 1 |

### 7.11 Retratos y audio

- `resolvePortraitAsset` devuelve solo assets que existen (tabla de variantes por personaje: `madre-vbg` {neutral, worried, happy}, `paciente-vbg` {neutral, sad, worried}, `psicologa-hospitalaria` {neutral, happy}, resto solo neutral) y cae a `neutral`. Alias: `anxious → worried`, `negative → sad`, `sad → sad`, `relieved → neutral`, `calm → neutral`; `positive → happy` solo para la psicóloga (sin sonrisa en el duelo, límite 2).
- Audio: mientras `stems.size === 1`, `setStressLevel` no baja `ambient` de 0,6 ni a 0 (hoy la única pista se calla con estrés > 85, `audio-director.service.ts:129-158`); `door_open` al cruzar puertas (hoy `triggerFade` suena `dialogue_advance`); SFX `item_pickup` (reutiliza un OGG ya incluido); utilidad `stress-tier.util.ts` con umbrales únicos. No se activan `stress_high`/`crisis_start` (límite 2).

---

## 8. Cambios por archivo (resumen; el detalle accionable está en `BACKLOG.md`)

| Archivo | Pista dueña | Cambio |
|---|---|---|
| `interaction-priority.util.ts` (+spec) | T5 | `pickNearby` y constantes; se conserva `nearbyInteractionChannel` |
| `game-world.component.ts` (zona Phaser y escala) | T5 | 7.2, 7.4, 7.9 (escala); `game-world.frame-budget.spec` intacto |
| `game-world.component.ts` (plantilla y estilos táctiles) | T6 (después de T5) | Cruceta en cruz, «Interactuar» con verbo, bandas laterales; actualizar `game-world.touch.contract.spec.ts` |
| `simulation-play.component.ts` (seguridad y flujo de diálogo) | T8 | 7.8, filtro 7.6, liberación de errores, limpieza al empezar un intento nuevo |
| `simulation-play.component.ts` (orientación) | T9 (después de T8) | Tarjeta, barra, puertas, avisos, contador, ayuda, decisión en dos tiempos |
| `simulation-play.component.ts` (compacto) | T10 (después de T9 y T6) | 7.9 |
| `simulation.model.ts` | T2 (campos opcionales), después T8 (quitar campos de ayuda visual) | |
| `dialogue-panel.component.ts`, `portrait-resolver.util.ts` | T4 | 7.6, 7.11 |
| `simulation-hud.component.ts`, `tool-inventory.component.ts`, `game-menu.component.ts`, `hud-dock.util.ts` | T7 | Chip, `?`, Ajustes, dock; borrar `hud-dock.util.ts` (código muerto) |
| `attempt-outcome.component.ts`, `journal-panel.component.ts`, `simulation-view-mode.util.ts` | T12 | Pausa calmada, botón en bitácora, respaldo `holdOutcome` |
| `audio-director.service.ts`, `stress-tier.util.ts` | T13 | 7.11 |
| `evidence-gating.config.ts`, `scene-objectives.config.ts` y los archivos nuevos de lógica y datos | T2 | 5, 6, 7.1-7.6 |
| Componentes nuevos (tarjeta, ayuda, botón de salida segura) | T3, T1 | |
| Backend | T11 | 7.10 |
| e2e y CI | T14 | 9.2 |
| Plataforma, cumplimiento y portada | T15 | Ola 2 del roadmap |

---

## 9. Estrategia de pruebas

### 9.1 Jest nuevas (la lógica vive en utilidades puras; ts-jest no renderiza plantillas salvo donde se indica)

Comando tras cada pieza: `npx jest --runInBand src/app/features/simulator src/styles` (los contratos de fuente fallan primero) y `pytest apps/simulation` si toca backend.

| Spec | Qué fija |
|---|---|
| `stage-route.config.spec.ts` | 6 etapas con `number` 1..6, ids únicos, `needs` apunta a un paso anterior; los pasos `prep` de cada etapa equivalen a `NODE_EVIDENCE`; cada `targetKey` y cada clave de `NODE_EVIDENCE` y de puertas del seed tiene nombre en `ENTITY_NAMES` (lee `seed_caso_pdf.py` con `readFileSync`, como `scenario-npc-configs.spec.ts`); las claves de sala cubren los `targetNodeKey` de las puertas; **vocabulario**: ningún texto genérico coincide con `/\b(PAP|SPIKES|EPICEE|Primeros Auxilios|valoraci[oó]n (estructurada )?de riesgo|medidas de protecci[oó]n|mediaci[oó]n|perd[oó]n|psicoterapia|interrog|adecuad|correct|recomendad[ao] cl[ií]nic|logr|complet(ad|a tu)|punto|contenci[oó]n|estabiliz)/i` (los `labelNamed` quedan exentos); **tildes**: ninguna cadena contiene `accion`, `decision`, `informacion`, `psicologa`, `bitacora`, `comisaria`, `recepcion`, `proteccion`, `atencion` sin tilde |
| `scene-checklist.util.spec.ts` | Table-driven por etapa: estado inicial (siguiente = recoger), tras recoger, tras hablar con la familia (el paso `usar` se desbloquea), `usar` hecho, enfermera, puerta bloqueada con metadata viva; en la Sala de escucha con pendientes en Urgencias (`nextLine` = «Ahora: Ve a Urgencias (puerta en el extremo izquierdo) y habla con la Enfermera de urgencias»); etapa 4 multi-sala (sala de escucha, recepción con y sin expediente, consultorio con y sin herramienta); etapa 6 con `carryOver` hecho y sin hacer; regla monótona de salas; nodo sin ruta (respaldo); `terminal` → `null`; **producto cartesiano** de subconjuntos de pasos hechos: nunca un slug, nunca vocabulario prohibido, `next` único y nunca hecho ni bloqueado; `diffDone` |
| `place-hint.util.spec.ts` | Tabla con las coordenadas de 7.3; bordes de banda; puerta |
| `evidence-copy.util.spec.ts` | Para cada combinación de `NODE_EVIDENCE` y de puertas, lista, puerta y aviso usan las mismas frases; sin slug; «tener» frente a «usar»; `joinSpanish` con 1, 2 y 3; con las banderas por defecto ninguna salida contiene `PAP`, `SPIKES` ni `RISK_METER` |
| `evidence-gating.config.spec.ts` (ampliar) | `missingEvidenceItems`; los casos existentes de `missingEvidence` pasan sin cambios; tilde de «Información insuficiente» |
| `door-status.util.spec.ts` | `open`/`locked` con los tres tipos de requisito y `requiresNodes`; mensajes de 5.4 incluido «Te queda 1 decisión» |
| `dialogue-decoration.util.spec.ts` | Filtra opciones fuera de `nodeOptionIds`; con `null` o vacío no filtra (`makeAttempt` del consent-gate no trae `options`); conserva las de herramienta; conversación de otra etapa → línea de «otro momento»; un solo aviso de evidencia; `toolMissing`; no toca opciones sin `decisionOptionId` |
| `interaction-priority.util.spec.ts` (ampliar) | Casos de 7.4 incluida la rejilla de 27 posiciones generada: persona principal en 26 y puerta en 1; empate; histéresis; principal y secundario; vacío; se conservan los 3 tests actuales |
| `interactables-reachable.spec.ts` | Para cada interactuable (objetos del seed y NPC de los JSON) de cada sala existe un punto libre a ≤ 60 px de pies (`collidesInCaseRoom`); falla si alguien mueve un mueble y deja a la enfermera inalcanzable |
| `no-classification-leak.spec.ts` | Los archivos nuevos (`stage-route*`, `scene-checklist*`, `evidence-copy*`, `door-status*`, `dialogue-decoration*`, `interaction-verb*`, `game-help*`, `help-memory*`) no contienen `classification`, `prohibitedConduct`, `isRecommended` ni `isProhibited` |
| `interaction-verb.util.spec.ts`, `help-memory.util.spec.ts`, `visited-rooms.util.spec.ts` | Verbos de 4.3; `getItem` que lanza → respaldo en memoria; `v` distinta reactiva la ayuda; esquema `{v:1, vistas:[]}` |
| `scene-checklist-card.component.spec.ts` | `<ol>`; estado por icono y texto; **ningún `<button` dentro del `@for` de pasos**; `aria-live="polite"` solo en la nota; sin `setTimeout`/`setInterval`/`animation:`/`backdrop-filter`; chip plegado; sección «También en esta sala» sin marca de siguiente |
| `game-help.component.spec.ts`, `game-help.content.spec.ts` | Sin la cadena «1 a 5»; ningún `<button>` llamado «Salida segura»; tildes; ninguna técnica; la promesa de salida segura depende de `SAFE_EXIT_ALWAYS_REACHABLE`; no consume Esc |
| `safe-exit-button.component.spec.ts` | Nombre accesible igual al texto visible; emite; `kbd` solo bajo `(hover: hover) and (pointer: fine)`; 44 px mínimos |
| `dialogue-panel.component.spec.ts` (ampliar) | Con opciones no hay foco en `.choice-btn` pero sí dentro del diálogo; Enter con opciones visibles no emite `execute`; clic con `detail===0` en < 500 ms ignorado; `releaseToken` libera `chosenKey`; un solo aviso y sin insignia por opción; «Volver al mapa» y «Salida segura» presentes con opciones; opción con herramienta ausente `aria-disabled` |
| `portrait-resolver.util.spec.ts` (ampliar) | Alias; caída a `neutral` cuando falta la variante; `positive` no da `happy` a `madre-vbg` ni `paciente-vbg` |
| `attempt-outcome.component.spec.ts` (ampliar) | `PAUSED`: «Reanudar este intento» es el primer botón y «Puntaje total» solo aparece dentro del `<details>`; el resto de estados igual |
| `simulation-play.consent-gate.spec.ts` (ampliar, mismo patrón de instancia) | `pauseFromOverlay` con diálogo con opciones abierto llama una vez a `sim.safeExit`; pausar desde la introducción deja `showIntroScene()`, `showCaseIntro()` y `journalOpen()` en falso; reanudar con la introducción sin leer la reabre; Esc bajo el aviso ETH-01 no pausa; `safeExit()` sigue sin actuar con diálogo abierto; con una decisión pendiente se descarta y se adopta el intento del servidor |
| `audio-director.service.spec.ts` (ampliar) | Con un solo stem `ambient` no baja de 0,6 ni a 0; `door_open` y `item_pickup` se reproducen; `stress-tier.util.spec.ts` |
| `tests/test_game.py` (ampliar) | Dos reintentos críticos más seis correctas ⇒ Final 1 y `severityCounts.critical == 0`; el mensaje devuelto no contiene `Override` y el evento sí guarda las etiquetas; `record_npc_interaction` acepta distancia 70 y rechaza 90 (60 + 16); el nodo no trae `classification` ni `prohibitedConduct` |

### 9.2 e2e (Playwright)

- **Nuevo `e2e/guided-first-minute.e2e.ts`** (escritorio 1366 y táctil 844x390; `required-viewports.ts` no incluye ningún móvil horizontal, se añade una constante propia): región «Qué hacer» con «Ahora:» visible tras la introducción (AC-1); tras recoger el kit aparece el aviso y la fila pasa a ✓; con la enfermera a ≤ 60 px la barra muestra `Hablar con Enfermera de urgencias` y E abre su diálogo (AC-6); abrir «Marco normativo» en la etapa 1 muestra una conversación informativa sin opciones; **salida segura visible y operable** en introducción, contexto, diálogo con y sin opciones, supervisión y bitácora, más el pie en exploración, Ajustes y ayuda (AC-2); la pausa muestra «Reanudar» sin desplazar (AC-7); tamaño del canvas antes y después de abrir y cerrar un diálogo (±2 px, AC-5); la supervisión se ve **antes** del fundido (AC-9).
- **Guiado sin coordenadas fijas**: bucle que lee `data-next-step`/`data-next-room` de la tarjeta y camina en lazo cerrado con `data-player-x/y` hasta que aparece la ficha del destino; recorre los 6 pasos de la etapa 1 (incluidas la puerta y la decisión). Es también la prueba de alcanzabilidad real: si una persona de la ruta no se alcanza en 20 s, falla.
- **`full-case.e2e.ts`**: (1) convertir los 9 `moveBy` de píxeles fijos (`:64,65,70,119,135,152,156,189,205`) en `moveUntilNearby` por nombre (la enfermera ya aparece en la barra); (2) con la decisión en dos tiempos, tras `chooseDecision` la supervisión ya está visible: `closeDialogue(/supervisión clínica/i)` y después esperar `data-scene-state="idle"` antes de `waitForWorldReady`; (3) `closeDialogue` busca también `/continuar|cerrar diálogo/i`; (4) mantener la ruta «decidir con información incompleta» (P9).
- **Contratos e2e que no cambian**: `closeDialogue` usa `button.close-btn:visible`; `chooseDecision` espera `group[name=/opciones de intervención/i]` y que la opción **no** tenga el nombre accesible `/información incompleta/`; `getByRole('button', { name: /salida segura/i })` en `pauseWithPendingPosition` (un solo botón visible a la vez); `/saltar video|continuar/i` en la introducción (el botón nuevo no coincide); `app-game-world .touch-interact` y `data-player-x/y`; el prefijo «Interactuar:» del nombre accesible.
- **CI**: job `e2e-full-case` de escritorio-1366 en los PR que toquen `frontend/src/app/features/simulator/**` (hoy un cambio que rompe el recorrido se ve a las 02:00 del día siguiente) y `gitleaks` (pregunta 10).

### 9.3 Contratos de texto que cada pista respeta o actualiza

13 specs leen los monolitos como texto (`grep -l` verificado). Regla: si un cambio toca un texto fijado, se actualiza el spec en el mismo commit; las regex nuevas usan `\s*` (el checkout es LF).

| Spec | Qué fija | Quién lo vigila |
|---|---|---|
| `game-world.frame-budget.spec.ts` | exactamente 2 `this.children.removeAll(true)` y 1 `this.callbacks.onPosition(` | T5, T6 |
| `game-world.touch.contract.spec.ts` | `@media (pointer: coarse) { .touch-controls { display: grid; } }` literal; `pointerdown/up/cancel/lostpointercapture` ×4; `holdDirection` y `setMotionPaused` | T6 (lo actualiza si mueve la cruceta) |
| `game-world.game-feel.contract.spec.ts`, `game-world.loading.contract.spec.ts`, `keyboard-capture.contract.spec.ts`, `scene-renderer.registry.spec.ts` | leer antes de editar | T5, T6 (correrlos tras cada commit) |
| `simulation-play.game-feel.contract.spec.ts` | `const SCENE_FADE_MS = 320;`, `transition: opacity 320ms ease` | T8, T9, T10 |
| `simulation-play.intro.contract.spec.ts` | `<h2 id="intro-scene-title">Antes de comenzar</h2>`; `(click)="continueFromIntroScene()">Continuar</button>`; 2 `intro-music-toggle` literales; `.case-intro-card__actions > span {`; `.case-intro-card__media { grid-template-columns: minmax(0, 1fr) }` | T8, T10 |
| `overlay-blur.contract.spec.ts` | `.objective-card`, `.case-intro-overlay`, `.dialogue-strip`, `.journal-modal`, `.hud-shell`, `.settings-menu` sin `backdrop-filter`; `.right-panel` con `blur(18px) saturate(120%)`; `.overlay-backdrop` con `blur(3px)` | T3 añade su panel; T9 conserva el envoltorio `.objective-card` |
| `simulation-hud.settings.spec.ts` | un solo `HostListener('document:keydown.escape')`, el oyente de puntero solo con Ajustes abierto, `aria-expanded`, `aria-controls`, `#settingsTrigger` | T7 (sin `document:keydown` genérico) |
| `styles/a11y-bloque-h.contract.spec.ts` | exactamente 2 `<app-dialogue-panel …/>` autocerrados con `[reduceMotion]="reduceMotion()"`; `<div class="hud-step">` (T7 actualiza ese bloque); `.choice-btn:focus-visible { outline: 3px solid #…; outline-offset: 3px; }`; `.safe-exit:focus-visible { outline: 2px solid #…; outline-offset: 2px; }`; `.strip--warning .speaker-name { color: #…; }`; `.emotion-tag { … opacity: 1; }` y los cuatro `return '#…'` de `emotionColor()`; `hud-patient`, `hud-score`, `case-intro-card__body … role="region"` | T4, T7, T8 |
| `styles/contrast.contract.spec.ts` | `.resume-card` con el degradado; `.context-bar__hint { font-size: .75rem; color: rgba(232,240,244,.72); }` | T9 (la leyenda conserva la clase; «Ahora:» usa `.context-bar__now`) |
| `styles/motion.contract.spec.ts` | `simulation-play` no contiene `hint-rise` | T9 |
| `dialogue-panel.component.spec.ts:63,109,117,129` | Enter con opciones = `none`; el foco queda dentro del diálogo | T4 |

### 9.4 Verificación visual con el kit (`playkit.mjs`)

Script de verificación (T14.6) que captura en 1366x768, 844x390 táctil y 390x844: spawn, tras recoger el kit, junto a la enfermera, puerta bloqueada, Sala de escucha con tres objetos de decisión, primera sala de la etapa 4, tarjeta plegada y desplegada, ayuda, pausa, supervisión previa al fundido, y la sala con estrés 0/60/90 (pase visual de B). Criterios: ningún solape de rótulos con la cruceta ni con el dock; rótulos legibles (≥ 12 px de pantalla); el anillo se ve por debajo de los sprites; la cruceta no tapa personajes; FPS solo como comparación relativa (SwiftShader, `playtest-feel.md` §2).

### 9.5 Criterios de aceptación medibles

| # | Criterio | Cómo se verifica |
|---|---|---|
| AC-1 | La tarjeta «Qué hacer» con «Ahora:» es visible sin desplazarse en 1366x768 y 844x390 | e2e |
| AC-2 | En los estados jugables de 4.7 (todos menos los dos avisos ETH-01) existe un botón «Salida segura» visible y activable | e2e parametrizado |
| AC-3 | Ninguna conversación ofrece opciones de decisión que no estén en `currentNode.options` | Jest |
| AC-4 | Ningún texto visible contiene un identificador interno | Jest + e2e (regex de slug) |
| AC-5 | El canvas recupera su tamaño (±2 px) al cerrar un diálogo | e2e |
| AC-6 | Persona a ≤ 60 px ⇒ botón `Hablar con …` en la barra y E abre su diálogo | e2e |
| AC-7 | «Reanudar» visible sin desplazamiento en la pausa | e2e |
| AC-8 | Playtest con 5 estudiantes que no han visto el caso, sin ayuda verbal: primera acción útil en < 20 s; 4 de 5 llegan a la decisión 1 en ≤ 8 min y sin ningún callejón sin salida; 0 pulsaciones de E en vacío tras el segundo minuto; los 5 saben qué puerta está cerrada y por qué (referencia de hoy: 2 de 2 evaluadores humanos no llegaron a H1) | manual, sin analítica |
| AC-9 | La supervisión de una decisión se ve antes del fundido, incluida la última | e2e |
| AC-10 | El JSON del nodo no trae `classification` ni `prohibitedConduct` | pytest |
| AC-11 | Objetivos táctiles ≥ 44 px (mínimo 24) y ningún texto informativo < 12 px de pantalla; axe `wcag22aa` sin `serious`/`critical` | e2e + captura |

Si más de 1 de 5 falla un criterio de AC-8, no se publica la entrega siguiente.

---

## 10. Cumplimiento de los límites de producto

| Límite | Cómo se cumple | Riesgo residual |
|---|---|---|
| 1. No revelar la opción adecuada | Los pasos nombran personas, objetos y salas; ningún texto, color, icono u orden toca las opciones; el anillo marca el objeto que aloja la decisión, nunca una opción; herramientas genéricas por defecto; se retiran los objetivos que describían H1, C1 y C3; **el JSON del nodo deja de llevar la clasificación (7.10)**; specs de vocabulario y de ausencia de `classification` | Contenido existente que no se toca: frase final de «Familia en crisis», líneas de la enfermera, el médico, la psicóloga orientadora y apoyo psicosocial, narrativa/título del nodo 1, y que la compuerta de H1 exija «usar PAP» (preguntas 1 y 2). Forma y longitud de las opciones (DLG-24): barajar es técnico (P2), igualar longitud es clínico |
| 2. Sin convertir el sufrimiento en juego | Marcas `✓ → ○` de proceso, no puntos; sin números flotantes, fanfarria ni color de logro; la línea «Puntaje +12…» se retira; «seguimiento formativo»; anillo estático; sin sonido nuevo de logro (solo `item_pickup`, discreto); sin sonrisa en el duelo | La sacudida tras opción riesgosa sigue (pregunta 5); revisar «k de 6» con Psicología (ya existe como «Paso k/6») |
| 3. Sin premiar la rapidez ni cronometrar el testimonio | Sin temporizadores esenciales (los avisos de 4,2 s repiten lo que queda escrito); el testimonio no se cronometra; la ayuda no depende de inactividad; «no hay límite de tiempo» explícito | — |
| 4. Salida segura siempre alcanzable; ETH-01 antes de la narrativa | 4.7 y 7.8; ETH-01 intacto (Esc tragado bajo el aviso; sin salida con efecto en los avisos); la ayuda no consume Esc | Pausar con una petición en vuelo (se encola) |
| 5. Sin migraciones ni cambios de esquema | Ninguna; sin re-seed; solo lógica de servicio y DTO | — |
| 6. WCAG 2.2 AA | Estado con forma y texto (1.4.1); nombre accesible = texto visible (2.5.3); objetivos ≥ 44 px (≥ 24); texto ≥ 12 px de pantalla; movimiento reducido: anillo y avisos estáticos; sin parpadeo; una región viva `polite`; teclado completo | Lector de pantalla real pendiente |
| 7. Español con tildes; 59 FPS | Spec de tildes en configs; nada nuevo en `update()` salvo el cálculo de proximidad que ya existe, sin asignaciones por cuadro | FPS solo verificable en equipo con GPU (SwiftShader mide ≈ 22 FPS) |

---

## 11. Riesgos y fase 2

### 11.1 Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Causa real de «la enfermera no se encuentra» sin confirmar | Media | Alto | T0.2 antes de T5.2; los arreglos (prioridad, NPC en la barra, radio 72 + tolerancia, prueba de alcanzabilidad) son defendibles sin el diagnóstico |
| R2 | 13 specs leen los monolitos como texto | Alta | Medio | Lógica en archivos nuevos; un dueño por archivo; tabla 9.3; correr los 13 antes de cada commit |
| R3 | `full-case` (solo nocturno) se rompe por prioridad, radios, decisión en dos tiempos y rótulos | Alta | Medio | T14 convierte los 9 `moveBy`; correr `npm run test:e2e` completo en local tras cada corte (~8,5 min) y en CI para el simulador |
| R4 | La lista nombra a alguien inalcanzable y agrava la frustración | Media | Alto | La prueba de alcanzabilidad y el e2e guiado bloquean la publicación del corte 1 |
| R5 | Efecto «lista de tareas» sobre un caso de violencia y duelo | Media | Alto | P7, verbos neutros, plegable, sin lenguaje de logro; revisión de Psicología (pregunta 12) |
| R6 | Spoiler residual por contenido ya existente que la guía hace leer más (líneas de NPC, frase de la familia) | Alta | Alto | La lista no depende de esas líneas; pregunta 2; no se reordena nada para empujar a leerlas |
| R7 | La decisión en dos tiempos cambia el ritmo del flujo y el orden de las peticiones | Media | Medio | Se aplica con un respaldo (`holdOutcome`, 7.7); AC-9 y e2e; es la última tarea de T9 |
| R8 | El arreglo de escala puede no bastar (V1 es una hipótesis) | Media | Medio | T0.3 mide antes; plan B: panel flotante sobre el canvas también en escritorio |
| R9 | Texto de canvas escalado se solapa en salas con tres personas cerca | Media | Bajo | Máximo de tres rótulos (dos en táctil) y apilado vertical; verificación visual 9.4 |
| R10 | Copy estático que envejece (nombres, orden de pasos, coordenadas del seed) | Media | Medio | Spec que lee el seed y falla si falta un nombre o cambia una clave `requires*`; el «lugar» se calcula, no se escribe |
| R11 | Re-seed borra intentos y reinicia la contraseña del administrador | Baja | Alto | Ningún cambio exige re-seed; los textos del seed que están mal se sobrescriben en el frontend y quedan como deuda del próximo re-seed planificado (pregunta 9) |
| R12 | Esc en la introducción pausa: quien lo pulse para «saltar» pausará | Media | Bajo | Botón visible con el mismo nombre; al reanudar, la introducción reaparece si no se leyó |
| R13 | Dispositivos híbridos (`pointer: coarse` y `hover: none` no coinciden en tabletas con ratón) | Baja | Bajo | Se oculta `kbd` por tipo de puntero y las alternativas por botón siempre existen |
| R14 | Carrera de escritura sobre `flags_json` (`update_position` guarda la fila completa) | Baja | Medio | No se añaden escritores nuevos (no hay `visitedRoomKeys` en backend); queda como pieza 0c del roadmap |
| R15 | Estimaciones sin calibrar | Alta | Medio | Los cortes entregables permiten parar tras el corte 1 con lo esencial resuelto |

### 11.2 Qué NO entra (con motivo)

- Capa DOM de marcas, chips y etiquetas alineadas al canvas, `viewChange`, `layoutTags` (guided): riesgo y esfuerzo altos, y el equipo evitó a propósito el «diagrama etiquetado». Se reabre tras el playtest de AC-8 (11.3).
- Pestaña «Ruta del caso» y «Etapa por venir» (questlog): informativa, no resuelve un bloqueo.
- Panel «Alrededor» con «Ir a…» y pathfinding (T12 completo): exige decidir qué listar sin revelar evidencia (pregunta 15). La versión mínima ya entra (7.1, punto 10).
- Colisión y vida de NPC (F-05, F-08), zoom de cámara táctil (FEEL-04 parcial), música propia por capas, retrato expresivo completo, estilos de habla (ROAD-C fase 2), E para avanzar el diálogo (descartado a propósito: Phaser leería `JustDown(E)` en el siguiente cuadro y reabriría la misma interacción, `game-world.component.ts:486-498`).
- Bloques E y F, contenido de G (IA), caso nuevo de J, música de A: bloqueados por Psicología o decisión externa (sección 13).

### 11.3 Fase 2 condicionada al playtest

Si en el playtest de AC-8 más de uno de cinco no identifica qué es interactivo con anillo, rótulos y lista: (1) capa DOM de marcas uniformes (chip de 24 px con glifo por categoría, nunca por contenido clínico) alineada con `ResizeObserver` sobre el `<canvas>` real; (2) pistas «just-in-time» (mover, interactuar, herramientas, decidir) con disparadores existentes; (3) niveles de guía en Ajustes (siempre / si me detengo / apagada) con `siep.guia.v1`. El diseño de guided (secciones 5 a 7) es la referencia.

---

## 12. Decisiones tomadas (con su porqué) y decisiones abiertas

### 12.1 Tomadas

| # | Decisión | Porqué |
|---|---|---|
| D1 | Esqueleto de minimal, contenido de questlog, funciones de guided | 0.1 y 0.2 |
| D2 | Pausa sin confirmación, con el mismo rótulo «Salida segura» en todos los estados y Esc en la introducción | Es el default del roadmap (`code-roadmap.md` §4); el límite 4 lo exige; se pide confirmación (pregunta 3) pero no bloquea |
| D3 | Herramientas genéricas en la lista y anillo sobre el destino (incluido el maletín) | Conservador para el límite 1; el nombre real del objeto lo ve el jugador en el mundo y al recogerlo |
| D4 | No se añade paso de confirmación a la decisión | El ciclo ya cuesta 10-17 entradas (`code-dialogue.md` §2.1); se evita la decisión accidental sin foco inicial y con guarda de teclado; la primera respuesta mala concede otra oportunidad (pregunta 4) |
| D5 | `holdOutcome` solo como respaldo | La decisión en dos tiempos resuelve el mismo problema y el de DLG-06 |
| D6 | La regla de salas alcanzadas es monótona (+ `sessionStorage`) y no un campo de backend | Sin tocar `flags_json` (R14) y correcta tras F5 |
| D7 | La compuerta blanda no cambia | Respeta la autonomía del estudiante (`code-dialogue.md` §5) |
| D8 | Fase 2 de marcas DOM, ayuda por pistas y niveles de guía condicionada a un playtest | Evita el «diagrama etiquetado» y reduce el riesgo del primer corte |

### 12.2 Abiertas (solo una persona puede decidirlas; valor por defecto ya aplicado)

Están en la lista numerada `questions_for_humans` del resultado estructurado y en `BACKLOG.md`, sección «Preguntas para personas». Referencias usadas arriba: pregunta 1 (herramientas), 2 (líneas que adelantan H1), 3 (pausa), 4 (reintento y confirmación), 5 (sacudida), 9 (re-seed), 10 (CI), 12 (revisión del copy), 15 (T12).

---

## 13. Estado del roadmap y plan

Detalle verificado en `reports/code-roadmap.md`. Ningún bloque A-L ataca directamente «no se sabe qué hacer»: lo que describe el líder es el criterio RNF-001 (primer nodo sin ayuda; herramientas, ayuda y salida localizables en ≤ 30 s), que el bloque K debía cubrir y no cubre.

| Bloque | Estado real | Plan en este diseño |
|---|---|---|
| A Audio | Parcial (marcado Hecho): 1 de 4 capas; la pista se calla con estrés > 85; 5 de 10 SFX nunca suenan | T13: piso de volumen, `door_open`, `item_pickup`, `stress-tier.util`. Música propia por capas: decisión creativa externa |
| B Game feel | Implementado y cableado; nadie lo ha visto; 5 juegos de umbrales de estrés | T13 (utilidad única) y pase visual en T14.6; sacudida: pregunta 5 |
| C Diálogo y retratos | Parcial: las emociones del caso no activan ningún retrato | T4: fase 1 (alias, solo assets existentes, sin chip en personas). Ritmo y estilos: Psicología |
| D Avatar | Hecho con deuda (`roster.v1.json` declara 10, hay 8 carpetas) | T15: recortar el roster y prueba de contrato |
| E Social Mapping | No existe | Sin construir (Psicología). Infra 0b = T1; 0c y 0d en la ola 3 |
| F Verbal Tension Box | No existe | Sin construir (Psicología) |
| G Asistente IA | Parcial: backend abierto sin bandera ni pruebas | T15: `AI_ASSISTANT_ENABLED=false` y prueba; panel de ayuda sin IA = T3/T9 |
| H WCAG 2.2 AA | Parcial: H-T1 a H-T9 hechas; H-T10 (salida segura) es bloqueante | H-T10 = pistas T1+T4+T8+T12; H-T12 mínimo = «También en esta sala»; H-T11, H-T13 y H-T15 en la ola 2 (BACKLOG §6); H-T14 diferido |
| I CI | Parcial (marcado Hecho): faltan secretos y cobertura; `@full-case` fuera del PR | T14: gitleaks y e2e de escritorio en PR del simulador |
| J Escenarios adicionales | Parcial: un solo caso | Ola 3 (E1 generalizar); no entra |
| K Landing y onboarding | Parcial (marcado Hecho): sin onboarding; portada promete 3 casos | T3/T9/T7: ayuda; T15: portada honesta |
| L Repo privado y secretos | Hecho con riesgos vivos | T15: `JWT_SECRET` por defecto, `REFLECTION_ENCRYPTION_KEY`, contraseña del administrador, credenciales demo |
| Visuales A-J | Confirmado; arte pendiente real = retratos `closed`, pase visual, caso 2 | Pase visual en T14.6 |
